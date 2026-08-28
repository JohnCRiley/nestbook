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
import { cleanupFile } from '../utils/fileCleanup.js';
import { processRoomPhoto, ROOM_UPLOAD_DIR } from '../utils/processRoomPhoto.js';
import { PHOTO_LIMITS } from './roomPhotos.js';

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

// Free plan is capped at this many rooms per property (Named Rooms / WP modes).
// Pro / Multi are unlimited. Enforced in POST / and reused by the CSV import.
const FREE_PLAN_ROOM_LIMIT = 5;

// Room types the CSV import accepts for Named Rooms mode — mirrors
// NewRoomModal.jsx's ROOM_TYPES. An unknown value falls back to 'double'.
const IMPORT_ROOM_TYPES = ['single', 'double', 'twin', 'suite', 'apartment', 'other'];

// Parses a CSV bed_config cell like "king:1;sofa_bed:1" into the JSON string
// the rooms.bed_config column stores. A single invalid bed type or quantity
// discards the whole cell: returns { value: null, warning } and the caller
// still imports the row, just without a bed configuration set.
function parseBedConfigCsv(cell) {
  const raw = (cell ?? '').trim();
  if (!raw) return { value: null };
  const entries = [];
  for (const part of raw.split(';')) {
    const piece = part.trim();
    if (!piece) continue;
    const [typeRaw, qtyRaw] = piece.split(':').map((x) => (x ?? '').trim());
    const type = typeRaw.toLowerCase();
    if (!VALID_BED_TYPES.includes(type)) {
      return { value: null, warning: `bed_config "${raw}" ignored — "${typeRaw}" is not a valid bed type (${VALID_BED_TYPES.join(', ')})` };
    }
    const qty = qtyRaw === '' ? 1 : Number(qtyRaw);
    if (!Number.isInteger(qty) || qty < 1) {
      return { value: null, warning: `bed_config "${raw}" ignored — "${qtyRaw}" is not a positive whole number` };
    }
    entries.push({ type, qty });
  }
  return { value: entries.length ? JSON.stringify(entries) : null };
}

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
    if (!canAccessProperty(req.user.userId, req.user.role, room.property_id)) {
      return res.status(404).json({ error: 'Room not found' });
    }

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
    if (!canAccessProperty(req.user.userId, req.user.role, room.property_id)) {
      return res.status(404).json({ error: 'Room not found' });
    }

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
    if (!canAccessProperty(req.user.userId, req.user.role, row.property_id)) {
      return res.status(404).json({ error: 'Room not found' });
    }
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
        if (roomCount >= FREE_PLAN_ROOM_LIMIT) {
          return res.status(403).json({
            error: `You've reached the free plan limit of ${FREE_PLAN_ROOM_LIMIT} rooms. Upgrade to Pro for unlimited rooms.`,
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

// ── POST /api/rooms/bulk-import ───────────────────────────────────────────────
// Room Import Wizard — Named Rooms mode only. Bulk-creates rooms from parsed
// CSV rows (client sends `rows`, an array of objects keyed by the template
// columns) and best-effort attaches photos fetched from the row's photo URLs.
//
// Hard-gated: Room Categories, Units and Whole-Property properties get a 403,
// enforced from the DB so a direct API call can't bypass the hidden button.
// Partial success is intentional — rows past the Free-plan room cap are skipped
// and reported rather than failing the whole import.
roomsRouter.post('/bulk-import', async (req, res) => {
  try {
    const { property_id, rows } = req.body;
    if (!property_id || !Array.isArray(rows)) {
      return res.status(400).json({ error: 'Missing property_id or rows' });
    }
    if (!canAccessProperty(req.user.userId, req.user.role, property_id)) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const property = db.prepare('SELECT rental_type, ir_room_mode FROM properties WHERE id = ?').get(property_id);
    if (!property) return res.status(404).json({ error: 'Property not found.' });
    if (property.rental_type !== 'rooms' || property.ir_room_mode !== 'named') {
      return res.status(403).json({ error: 'Room import is only available for properties in Named Rooms mode.' });
    }

    if (rows.length === 0) return res.status(400).json({ error: 'No rows to import.' });
    if (rows.length > 500) return res.status(400).json({ error: 'Too many rows — 500 maximum per import.' });

    const plan       = db.prepare('SELECT plan FROM users WHERE id = ?').get(req.user.userId)?.plan ?? 'free';
    const roomCap    = plan === 'free' ? FREE_PLAN_ROOM_LIMIT : Infinity;
    const photoLimit = PHOTO_LIMITS[plan] ?? PHOTO_LIMITS.free;
    let roomCount    = db.prepare('SELECT COUNT(*) as n FROM rooms WHERE property_id = ?').get(property_id).n;

    const insertRoom = db.prepare(`
      INSERT INTO rooms
        (property_id, name, type, price_per_night, capacity, max_occupancy,
         amenities, status, description, ical_token, bed_config)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'available', ?, ?, ?)
    `);

    const created         = [];   // { id, name, rowNum, photoUrls }
    const warnings        = [];    // amber, non-blocking
    const errors          = [];    // row rejected outright
    const skippedForLimit = [];    // row numbers not imported (plan cap)

    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 2;        // +1 header line, +1 to 1-index
      const row = rows[i] ?? {};

      const name = (row.name ?? '').toString().trim();
      if (!name) { errors.push(`Row ${rowNum}: missing room name`); continue; }

      const price = parseFloat((row.price_per_night ?? '').toString().replace(/[£$€¥,\s]/g, ''));
      if (!Number.isFinite(price) || price < 0) {
        errors.push(`Row ${rowNum}: invalid price "${row.price_per_night ?? ''}"`);
        continue;
      }

      if (roomCount >= roomCap) { skippedForLimit.push(rowNum); continue; }

      let type = (row.type ?? '').toString().trim().toLowerCase();
      if (type && !IMPORT_ROOM_TYPES.includes(type)) {
        warnings.push(`Row ${rowNum}: unknown room type "${row.type}" — imported as "double"`);
        type = 'double';
      }
      if (!type) type = 'double';

      const capacity      = Math.min(20, Math.max(1, parseInt(row.capacity, 10) || 2));
      const maxOccParsed  = parseInt(row.max_occupancy, 10);
      const max_occupancy = Number.isInteger(maxOccParsed) && maxOccParsed > 0 ? maxOccParsed : null;
      const amenities     = (row.amenities ?? '').toString().trim() || null;
      const description    = (row.description ?? '').toString().trim() || null;

      const bed = parseBedConfigCsv(row.bed_config);
      if (bed.warning) warnings.push(`Row ${rowNum}: ${bed.warning}`);

      const ical_token = crypto.randomBytes(16).toString('hex');
      const info = insertRoom.run(
        property_id, name, type, price, capacity, max_occupancy,
        amenities, description, ical_token, bed.value,
      );
      roomCount++;

      const photoUrls = [row.photo_url_1, row.photo_url_2, row.photo_url_3]
        .map((u) => (u ?? '').toString().trim())
        .filter(Boolean);

      created.push({ id: info.lastInsertRowid, name, rowNum, photoUrls });

      logAction(db, {
        ...actorFromReq(req),
        propertyId: Number(property_id),
        action: 'ROOM_CREATED',
        category: 'room',
        targetType: 'room',
        targetId: info.lastInsertRowid,
        targetName: name,
        ipAddress: getIp(req),
      });
    }

    // ── Photos — best-effort, after every room row is inserted ──────────────
    const photoErrors = [];
    let photosAttached = 0;

    for (const rec of created) {
      let attached = db.prepare('SELECT COUNT(*) as n FROM room_photos WHERE room_id = ?').get(rec.id).n;
      for (const url of rec.photoUrls) {
        if (attached >= photoLimit) {
          photoErrors.push(`Row ${rec.rowNum} ("${rec.name}"): ${plan} plan allows ${photoLimit} photos per room — "${url}" not attached`);
          continue;
        }
        if (!/^https?:\/\/.+/i.test(url)) {
          photoErrors.push(`Row ${rec.rowNum} ("${rec.name}"): "${url}" is not a valid http(s) URL`);
          continue;
        }
        const tmpName = `${rec.id}-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
        const tmpPath = join(ROOM_UPLOAD_DIR, tmpName);
        try {
          const resp = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15000) });
          if (!resp.ok) {
            photoErrors.push(`Row ${rec.rowNum} ("${rec.name}"): ${url} returned HTTP ${resp.status}`);
            continue;
          }
          if (!(resp.headers.get('content-type') || '').startsWith('image/')) {
            photoErrors.push(`Row ${rec.rowNum} ("${rec.name}"): ${url} did not return an image`);
            continue;
          }
          fs.writeFileSync(tmpPath, Buffer.from(await resp.arrayBuffer()));
          await processRoomPhoto(tmpPath, rec.id);
          attached++;
          photosAttached++;
        } catch (e) {
          cleanupFile(tmpPath);
          photoErrors.push(`Row ${rec.rowNum} ("${rec.name}"): could not fetch ${url} (${e.message})`);
        }
      }
    }

    res.json({
      imported:            created.length,
      rooms_skipped_limit: skippedForLimit.length,
      skipped_rows:        skippedForLimit,
      warnings,
      errors,
      photos_attached:     photosAttached,
      photo_errors:        photoErrors,
      limit_message: skippedForLimit.length
        ? `Your ${plan} plan is limited to ${FREE_PLAN_ROOM_LIMIT} rooms. Row${skippedForLimit.length === 1 ? '' : 's'} ${skippedForLimit.join(', ')} could not be imported — upgrade to Pro for unlimited rooms.`
        : null,
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
    if (!canAccessProperty(req.user.userId, req.user.role, existing.property_id)) {
      return res.status(404).json({ error: 'Room not found' });
    }

    const {
      name, type, price_per_night, capacity, amenities, status, breakfast_included, description,
      access_method, access_code, arrival_instructions, send_access_hours, staffed_checkin_available, category_id,
      bed_config,
    } = req.body;
    // property_id is intentionally NOT destructured from the body — a room's
    // property is immutable through this endpoint, always the room's existing
    // value, regardless of what the client sends.
    const property_id = existing.property_id;

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
      if (req.file) cleanupFile(req.file.path);
      return res.status(eligibility.status).json({ error: eligibility.error });
    }
    if (!canAccessProperty(req.user.userId, req.user.role, eligibility.room.property_id)) {
      if (req.file) cleanupFile(req.file.path);
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

    cleanupFile(req.file.path);

    if (existing?.access_photo) {
      cleanupFile(join(ACCESS_PHOTO_DIR, existing.access_photo));
    }

    db.prepare('UPDATE rooms SET access_photo = ? WHERE id = ?').run(filename, roomId);
    console.log(`[access-photo] Uploaded for room ${roomId}: ${filename}`);
    res.json({ success: true, filename });
  } catch (err) {
    if (req.file) cleanupFile(req.file.path);
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
      cleanupFile(join(ACCESS_PHOTO_DIR, roomRow.access_photo));
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
    if (!canAccessProperty(req.user.userId, req.user.role, room.property_id)) {
      return res.status(404).json({ error: 'Room not found' });
    }
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
