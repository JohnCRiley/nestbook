import { Router } from 'express';
import crypto from 'crypto';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import multer from 'multer';
import sharp from 'sharp';
import db from '../db/database.js';
import { logAction, getIp } from '../utils/auditLog.js';
import { getRateForDate } from '../utils/ratePeriods.js';
import { requireVerified } from '../middleware/requireVerified.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Same physical folder WP's property-level access photos already use
// (server/uploads/access) — reused as a shared directory, filenames are
// namespaced per-caller ("access-" for properties, "access-room-" here) so
// the two never collide. WP's own upload/delete endpoints in properties.js
// are untouched.
const ACCESS_PHOTO_DIR = join(__dirname, '../uploads/access');
fs.mkdirSync(ACCESS_PHOTO_DIR, { recursive: true });

export const roomsRouter = Router();

roomsRouter.use((req, res, next) => {
  if (req.method === 'GET') return next();
  return requireVerified(req, res, next);
});

function actorFromReq(req) {
  const u = db.prepare('SELECT name, email, role FROM users WHERE id = ?').get(req.user.userId);
  return { userId: req.user.userId, userName: u?.name, userEmail: u?.email, userRole: u?.role };
}

// ── Bed configuration (Phase 7a) ────────────────────────────────────────────
// rooms.bed_config is stored as a JSON string: an array of { type, qty }
// objects, e.g. [{"type":"king","qty":1},{"type":"sofa_bed","qty":1}].
// Fixed vocabulary only — no free text.
const VALID_BED_TYPES = ['single', 'double', 'queen', 'king', 'sofa_bed', 'bunk_bed'];

// Validates a bed_config value already parsed into a JS array (the JSON
// request body arrives pre-parsed by Express). Returns { error } or
// { value } where value is the JSON string ready to store, or null.
function validateBedConfig(bedConfig) {
  if (bedConfig === null || bedConfig === '' || bedConfig === undefined) {
    return { value: null };
  }
  if (!Array.isArray(bedConfig)) {
    return { error: 'bed_config must be an array of { type, qty } objects.' };
  }
  const clean = [];
  for (const entry of bedConfig) {
    if (!entry || !VALID_BED_TYPES.includes(entry.type)) {
      return { error: `bed_config entries must have a valid type (${VALID_BED_TYPES.join(', ')}).` };
    }
    const qty = Number(entry.qty);
    if (!Number.isInteger(qty) || qty < 1) {
      return { error: 'bed_config entries must have a positive integer qty.' };
    }
    clean.push({ type: entry.type, qty });
  }
  return { value: clean.length > 0 ? JSON.stringify(clean) : null };
}

// The column can be null, or (for rows predating this phase) whatever the
// previously-unused column state left it as — parse defensively and fall
// back to null rather than let a malformed value break a room response.
function parseBedConfig(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function withParsedBedConfig(room) {
  if (!room) return room;
  return { ...room, bed_config: parseBedConfig(room.bed_config) };
}

// ── Ownership helper (mirrors properties.js) ──────────────────────────────
function canAccessProperty(userId, role, propId) {
  const pid = Number(propId);
  if (!pid) return false;
  if (role === 'owner') {
    if (db.prepare('SELECT id FROM properties WHERE id = ? AND owner_id = ?').get(pid, userId)) {
      return true;
    }
    // Fallback: legacy users whose property predates the owner_id column.
    const u = db.prepare('SELECT property_id FROM users WHERE id = ?').get(userId);
    if (Number(u?.property_id) === pid) {
      db.prepare('UPDATE properties SET owner_id = ? WHERE id = ? AND owner_id IS NULL').run(userId, pid);
      return true;
    }
    return false;
  }
  const u = db.prepare('SELECT property_id FROM users WHERE id = ?').get(userId);
  return Number(u?.property_id) === pid;
}

function getUserPropertyIds(userId, role) {
  if (role === 'owner') {
    const ids = db.prepare('SELECT id FROM properties WHERE owner_id = ?').all(userId).map(p => p.id);
    if (ids.length) return ids;
    // Fallback for pre-migration owners
    const u = db.prepare('SELECT property_id FROM users WHERE id = ?').get(userId);
    return u?.property_id ? [Number(u.property_id)] : [];
  }
  const u = db.prepare('SELECT property_id FROM users WHERE id = ?').get(userId);
  return u?.property_id ? [Number(u.property_id)] : [];
}

// ── GET /api/rooms?property_id=X&status=available&page=1&limit=20 ────────────
// Query params (all optional):
//   property_id  — filter by property (access-checked)
//   status       — filter by status
//   page / limit — when present returns paginated object {rooms,total,page,totalPages}
//                  when absent returns plain array (backward compat)
roomsRouter.get('/', (req, res) => {
  try {
    const { property_id, status, page, limit, parent_unit_id } = req.query;
    const conditions = [];
    const params     = [];

    if (property_id) {
      if (!canAccessProperty(req.user.userId, req.user.role, property_id)) {
        return res.status(403).json({ error: 'Access denied.' });
      }
      conditions.push('property_id = ?');
      params.push(property_id);
    } else {
      const propIds = getUserPropertyIds(req.user.userId, req.user.role);
      if (!propIds.length) {
        return page ? res.json({ rooms: [], total: 0, page: 1, totalPages: 0 }) : res.json([]);
      }
      const placeholders = propIds.map(() => '?').join(',');
      conditions.push(`property_id IN (${placeholders})`);
      params.push(...propIds);
    }

    if (status) { conditions.push('status = ?'); params.push(status); }

    // Unit mode — optional scope to a unit's internal rooms (?parent_unit_id=<id>)
    // or explicitly to top-level rows only (?parent_unit_id=null). Omitted entirely
    // (the default for every existing caller) leaves this filter out, unchanged.
    if (parent_unit_id !== undefined) {
      if (parent_unit_id === 'null' || parent_unit_id === '') {
        conditions.push('parent_unit_id IS NULL');
      } else {
        conditions.push('parent_unit_id = ?');
        params.push(parent_unit_id);
      }
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    if (page) {
      const pageNum   = Math.max(1, Number(page));
      const pageLimit = Math.min(100, Math.max(1, Number(limit) || 20));
      const offset    = (pageNum - 1) * pageLimit;

      const total = db.prepare(`SELECT COUNT(*) as n FROM rooms ${where}`).get(...params).n;
      const rows  = db.prepare(`
        SELECT r.*,
          (SELECT COUNT(*) FROM room_photos WHERE room_id = r.id) AS photo_count,
          (SELECT filename FROM room_photos WHERE room_id = r.id ORDER BY display_order ASC LIMIT 1) AS primary_photo,
          (SELECT thumb_filename FROM room_photos WHERE room_id = r.id ORDER BY display_order ASC LIMIT 1) AS primary_thumb
        FROM rooms r ${where} ORDER BY r.id LIMIT ? OFFSET ?
      `).all(...params, pageLimit, offset);

      return res.json({ rooms: rows.map(withParsedBedConfig), total, page: pageNum, totalPages: Math.ceil(total / pageLimit) });
    }

    res.json(db.prepare(`
      SELECT r.*,
        (SELECT COUNT(*) FROM room_photos WHERE room_id = r.id) AS photo_count,
        (SELECT filename FROM room_photos WHERE room_id = r.id ORDER BY display_order ASC LIMIT 1) AS primary_photo,
        (SELECT thumb_filename FROM room_photos WHERE room_id = r.id ORDER BY display_order ASC LIMIT 1) AS primary_thumb
      FROM rooms r ${where} ORDER BY r.id
    `).all(...params).map(withParsedBedConfig));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/rooms/:id/rate?date=YYYY-MM-DD ───────────────────────────────
roomsRouter.get('/:id/rate', (req, res) => {
  try {
    const rid  = Number(req.params.id);
    const date = req.query.date;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'date query param (YYYY-MM-DD) is required' });
    }
    const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(rid);
    if (!room) return res.status(404).json({ error: 'Room not found' });

    const result = getRateForDate(room.property_id, rid, date);
    if (!result) return res.status(404).json({ error: 'Room not found' });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/rooms/:id/rate-range?check_in=YYYY-MM-DD&check_out=YYYY-MM-DD ──
roomsRouter.get('/:id/rate-range', (req, res) => {
  try {
    const rid      = Number(req.params.id);
    const checkIn  = req.query.check_in;
    const checkOut = req.query.check_out;
    const dateRe   = /^\d{4}-\d{2}-\d{2}$/;
    if (!checkIn || !dateRe.test(checkIn) || !checkOut || !dateRe.test(checkOut) || checkOut <= checkIn) {
      return res.status(400).json({ error: 'check_in and check_out (YYYY-MM-DD) are required; check_out must be after check_in' });
    }
    const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(rid);
    if (!room) return res.status(404).json({ error: 'Room not found' });

    // WP properties store the base rate on the property, not the room
    const propRow = db.prepare('SELECT rental_type, whole_property_rate FROM properties WHERE id = ?').get(room.property_id);
    const baseRateOverride = propRow?.rental_type === 'whole_property' ? (propRow.whole_property_rate ?? null) : null;

    function addDaysIso(iso, n) {
      const d = new Date(iso + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() + n);
      return d.toISOString().slice(0, 10);
    }

    const breakdown = [];
    let current = checkIn;
    while (current < checkOut) {
      const result     = getRateForDate(room.property_id, rid, current, baseRateOverride);
      const rate       = result?.rate ?? (baseRateOverride ?? room.price_per_night);
      const periodName = result?.periodName ?? null;
      const last       = breakdown[breakdown.length - 1];
      if (last && last.ratePerNight === rate && last.periodName === periodName) {
        last.nights  += 1;
        last.subtotal = Math.round(last.nights * last.ratePerNight * 100) / 100;
      } else {
        breakdown.push({ periodName, nights: 1, ratePerNight: rate, subtotal: rate });
      }
      current = addDaysIso(current, 1);
    }

    const total = Math.round(breakdown.reduce((s, seg) => s + seg.subtotal, 0) * 100) / 100;
    res.json({ total, breakdown });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/rooms/:id ────────────────────────────────────────────────────
roomsRouter.get('/:id', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM rooms WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Room not found' });
    res.json(withParsedBedConfig(row));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/rooms ───────────────────────────────────────────────────────────
roomsRouter.post('/', (req, res) => {
  try {
    const { property_id, name, type, price_per_night, capacity, amenities, status, breakfast_included, description, parent_unit_id, category_id, bed_config } = req.body;

    if (!property_id || !name || !type || price_per_night == null) {
      return res.status(400).json({ error: 'property_id, name, type and price_per_night are required' });
    }
    if (!canAccessProperty(req.user.userId, req.user.role, property_id)) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    // Bed configuration (Phase 7a) — optional, fixed vocabulary only.
    const bedConfigResult = validateBedConfig(bed_config);
    if (bedConfigResult.error) {
      return res.status(400).json({ error: bedConfigResult.error });
    }

    const currentUser = db.prepare('SELECT plan FROM users WHERE id = ?').get(req.user.userId);
    const currentProperty = db.prepare('SELECT rental_type, ir_room_mode FROM properties WHERE id = ?').get(property_id);

    // Room Categories (Phase 4) — same cross-property guard as the PUT route.
    let newCategoryId = null;
    if (category_id !== undefined && category_id !== null && category_id !== '') {
      const cat = db.prepare('SELECT id FROM room_categories WHERE id = ? AND property_id = ?')
        .get(category_id, property_id);
      if (!cat) return res.status(400).json({ error: 'category_id does not belong to this property.' });
      newCategoryId = cat.id;
    }

    // Categories-mode properties: every room must belong to a category, or
    // it becomes unbookable (nothing routes guests to an uncategorized
    // room) — server-side mirror of NewRoomModal's required category select.
    if (currentProperty?.rental_type === 'rooms' && currentProperty?.ir_room_mode === 'categories' && !newCategoryId) {
      return res.status(400).json({ error: 'category_id is required for Room Categories-mode properties.' });
    }

    if (currentProperty?.rental_type === 'units') {
      if (!parent_unit_id) {
        // Creating a top-level unit — Free plan: max 5 units per property. Pro/Multi: unlimited.
        if (currentUser?.plan === 'free') {
          const unitCount = db.prepare('SELECT COUNT(*) as n FROM rooms WHERE property_id = ? AND parent_unit_id IS NULL').get(property_id).n;
          if (unitCount >= 5) {
            return res.status(403).json({
              error: "You've reached the free plan limit of 5 units. Upgrade to Pro for unlimited units.",
            });
          }
        }
      } else {
        // Creating an internal room within a unit — structural limit of 5 per unit, all plans.
        const roomInUnitCount = db.prepare('SELECT COUNT(*) as n FROM rooms WHERE property_id = ? AND parent_unit_id = ?').get(property_id, parent_unit_id).n;
        if (roomInUnitCount >= 5) {
          return res.status(403).json({
            error: "This unit has reached the limit of 5 rooms.",
          });
        }
      }
    } else {
      // IR / WP: Free plan: max 5 rooms per property
      if (currentUser?.plan === 'free') {
        const roomCount = db.prepare('SELECT COUNT(*) as n FROM rooms WHERE property_id = ?').get(property_id).n;
        if (roomCount >= 5) {
          return res.status(403).json({
            error: "You've reached the free plan limit of 5 rooms. Upgrade to Pro for unlimited rooms.",
          });
        }
      }
    }

    const ical_token = crypto.randomBytes(16).toString('hex');
    const result = db.prepare(`
      INSERT INTO rooms (property_id, name, type, price_per_night, capacity, amenities, status, breakfast_included, description, ical_token, parent_unit_id, category_id, bed_config)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      property_id, name, type,
      price_per_night,
      capacity  ?? 2,
      amenities ?? null,
      status    ?? 'available',
      breakfast_included ? 1 : 0,
      description || null,
      ical_token,
      parent_unit_id ?? null,
      newCategoryId,
      bedConfigResult.value
    );

    const created = withParsedBedConfig(db.prepare('SELECT * FROM rooms WHERE id = ?').get(result.lastInsertRowid));
    res.status(201).json(created);

    logAction(db, {
      ...actorFromReq(req),
      propertyId: Number(property_id),
      action: 'ROOM_CREATED',
      category: 'room',
      targetType: 'room',
      targetId: created.id,
      targetName: created.name,
      ipAddress: getIp(req),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/rooms/:id ────────────────────────────────────────────────────
roomsRouter.put('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM rooms WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Room not found' });

    const {
      property_id, name, type, price_per_night, capacity, amenities, status, breakfast_included, description,
      access_method, access_code, arrival_instructions, send_access_hours, staffed_checkin_available, category_id,
      bed_config,
    } = req.body;

    // Bed configuration (Phase 7a) — same not-sent-vs-cleared pattern as the
    // Access & Arrival fields below: omitted entirely leaves the existing
    // value untouched, explicitly null/[] clears it.
    let newBedConfig = existing.bed_config;
    if (bed_config !== undefined) {
      const bedConfigResult = validateBedConfig(bed_config);
      if (bedConfigResult.error) {
        return res.status(400).json({ error: bedConfigResult.error });
      }
      newBedConfig = bedConfigResult.value;
    }

    // Room Categories (Phase 3 migration) — same not-sent-vs-cleared pattern
    // as the Access & Arrival fields below. Cross-property assignment is
    // rejected rather than silently ignored, since a mismatched category_id
    // would otherwise point a room at another property's category.
    let newCategoryId = existing.category_id;
    if (category_id !== undefined) {
      if (category_id === null || category_id === '') {
        newCategoryId = null;
      } else {
        const cat = db.prepare('SELECT id FROM room_categories WHERE id = ? AND property_id = ?')
          .get(category_id, property_id);
        if (!cat) return res.status(400).json({ error: 'category_id does not belong to this property.' });
        newCategoryId = cat.id;
      }
    }

    // Per-unit Access & Arrival — same validation pattern as WP's property-level
    // fields (properties.js PUT /:id), relocated here. RoomPanel's existing
    // save calls (IR/WP bedroom edit, unit edit) never send these fields at
    // all, so each one falls back to the room's current value rather than a
    // hardcoded default — otherwise every unrelated room save would silently
    // wipe whatever the new Access & Arrival sub-section had set.
    const VALID_ACCESS_METHODS = ['none', 'code', 'keybox', 'keyed', 'app', 'other'];
    const newAccessMethod = access_method !== undefined
      ? (VALID_ACCESS_METHODS.includes(access_method) ? access_method : 'none')
      : existing.access_method;
    const newAccessCode = access_code !== undefined ? (access_code?.trim() || null) : existing.access_code;
    const newArrivalInstructions = arrival_instructions !== undefined
      ? (arrival_instructions?.trim() || null)
      : existing.arrival_instructions;
    const newSendAccessHours = send_access_hours !== undefined
      ? (send_access_hours != null && send_access_hours !== '' ? String(Math.max(1, parseInt(send_access_hours, 10) || 48)) : '48')
      : existing.send_access_hours;
    // Same defensive-fallback reasoning as the Access & Arrival fields above.
    const newStaffedCheckin = staffed_checkin_available !== undefined
      ? (staffed_checkin_available ? 1 : 0)
      : existing.staffed_checkin_available;

    db.prepare(`
      UPDATE rooms
      SET property_id = ?, name = ?, type = ?, price_per_night = ?,
          capacity = ?, amenities = ?, status = ?, breakfast_included = ?, description = ?,
          access_method = ?, access_code = ?, arrival_instructions = ?, send_access_hours = ?,
          staffed_checkin_available = ?, category_id = ?, bed_config = ?
      WHERE id = ?
    `).run(
      property_id, name, type, price_per_night, capacity, amenities, status, breakfast_included ? 1 : 0, description || null,
      newAccessMethod, newAccessCode, newArrivalInstructions, newSendAccessHours,
      newStaffedCheckin, newCategoryId, newBedConfig,
      req.params.id,
    );

    if (description && description !== existing.description) {
      db.prepare(`INSERT INTO content_flags (property_id, room_id, content_type, preview_text) VALUES (?, ?, 'room_description', ?)`)
        .run(property_id, req.params.id, description);
    }

    const updated = withParsedBedConfig(db.prepare('SELECT * FROM rooms WHERE id = ?').get(req.params.id));
    res.json(updated);

    logAction(db, {
      ...actorFromReq(req),
      propertyId: updated.property_id,
      action: 'ROOM_UPDATED',
      category: 'room',
      targetType: 'room',
      targetId: updated.id,
      targetName: updated.name,
      beforeValue: { status: existing.status, price_per_night: existing.price_per_night },
      afterValue:  { status: updated.status,  price_per_night: updated.price_per_night },
      ipAddress: getIp(req),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/rooms/:id/access-photo ──────────────────────────────────────
// Per-unit equivalent of WP's POST /api/properties/:id/access-photo — same
// multer → sharp (resize 1200px, JPEG 85%) → save pattern, scoped to a room.
// Only valid for a top-level unit (parent_unit_id IS NULL) on a units-mode
// property, since access info is meaningless for internal display-only rooms
// or for IR/WP rooms that use the property-level fields instead.
const accessPhotoUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, ACCESS_PHOTO_DIR),
    filename: (req, file, cb) => cb(null, `access-room-${req.params.id}-${Date.now()}.tmp`),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) cb(null, true);
    else cb(new Error('JPEG, PNG or WebP only'));
  },
});

function unitAccessEligibility(roomId) {
  const room = db.prepare(`
    SELECT r.id, r.property_id, r.parent_unit_id, p.rental_type
    FROM rooms r JOIN properties p ON p.id = r.property_id
    WHERE r.id = ?
  `).get(roomId);
  if (!room) return { ok: false, status: 404, error: 'Room not found.' };
  if (room.parent_unit_id !== null || room.rental_type !== 'units') {
    return { ok: false, status: 400, error: 'Access & Arrival is only available for a top-level unit on a units-mode property.' };
  }
  return { ok: true, room };
}

roomsRouter.post('/:id/access-photo', accessPhotoUpload.single('photo'), async (req, res) => {
  try {
    const roomId = Number(req.params.id);
    const eligibility = unitAccessEligibility(roomId);
    if (!eligibility.ok) {
      if (req.file) try { fs.unlinkSync(req.file.path); } catch {}
      return res.status(eligibility.status).json({ error: eligibility.error });
    }
    if (!canAccessProperty(req.user.userId, req.user.role, eligibility.room.property_id)) {
      if (req.file) try { fs.unlinkSync(req.file.path); } catch {}
      return res.status(403).json({ error: 'Access denied.' });
    }
    if (!req.file) return res.status(400).json({ error: 'No photo uploaded' });

    const existing = db.prepare('SELECT access_photo FROM rooms WHERE id = ?').get(roomId);
    const filename = `access-room-${roomId}-${Date.now()}.jpg`;
    const outputPath = join(ACCESS_PHOTO_DIR, filename);

    await sharp(req.file.path)
      .resize(1200, null, { withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toFile(outputPath);

    try { fs.unlinkSync(req.file.path); } catch {}

    if (existing?.access_photo) {
      try { fs.unlinkSync(join(ACCESS_PHOTO_DIR, existing.access_photo)); } catch {}
    }

    db.prepare('UPDATE rooms SET access_photo = ? WHERE id = ?').run(filename, roomId);
    console.log(`[access-photo] Uploaded for room ${roomId}: ${filename}`);
    res.json({ success: true, filename });
  } catch (err) {
    if (req.file) try { fs.unlinkSync(req.file.path); } catch {}
    console.error('[access-photo]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/rooms/:id/access-photo ────────────────────────────────────
roomsRouter.delete('/:id/access-photo', (req, res) => {
  try {
    const roomId = Number(req.params.id);
    const roomRow = db.prepare('SELECT property_id, access_photo FROM rooms WHERE id = ?').get(roomId);
    if (!roomRow || !canAccessProperty(req.user.userId, req.user.role, roomRow.property_id)) {
      return res.status(403).json({ error: 'Access denied.' });
    }
    if (roomRow.access_photo) {
      try { fs.unlinkSync(join(ACCESS_PHOTO_DIR, roomRow.access_photo)); } catch {}
      db.prepare('UPDATE rooms SET access_photo = NULL WHERE id = ?').run(roomId);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/rooms/:id ─────────────────────────────────────────────────
// ?force=true  — skip the warning and delete even when the room has bookings.
// Without force, returns 409 { booking_count } so the UI can warn the user.
roomsRouter.delete('/:id', (req, res) => {
  try {
    const rid = Number(req.params.id);
    const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(rid);
    if (!room) return res.status(404).json({ error: 'Room not found' });
    if (room.is_demo) return res.status(403).json({ error: 'Demo rooms cannot be deleted.' });

    const bookingCount = db.prepare(
      `SELECT COUNT(*) as n FROM bookings WHERE room_id = ? AND status != 'cancelled'`
    ).get(rid).n;

    if (!req.query.force && bookingCount > 0) {
      return res.status(409).json({ booking_count: bookingCount });
    }

    db.prepare(`UPDATE bookings SET room_id = NULL WHERE room_id = ?`).run(rid);
    db.prepare('DELETE FROM rooms WHERE id = ?').run(rid);
    res.status(204).end();

    logAction(db, {
      ...actorFromReq(req),
      propertyId: room.property_id,
      action: 'ROOM_DELETED',
      category: 'room',
      targetType: 'room',
      targetId: room.id,
      targetName: room.name,
      ipAddress: getIp(req),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
