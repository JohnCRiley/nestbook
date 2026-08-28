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
import { attachRoomPhotoFromUrl } from '../utils/attachRoomPhotoFromUrl.js';
import { PHOTO_LIMITS } from './roomPhotos.js';
import { createRoomCategory } from './roomCategories.js';

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

// Whole-Property showcase-section types — mirrors NewRoomModal.jsx's WP <optgroup>
// list. No DB CHECK; an unknown value falls back to 'other' (not 'double').
// `capacity` is only meaningful for the bedroom subset.
const WP_ROOM_TYPES = [
  'double', 'twin', 'single', 'bunk', 'master', 'kids',
  'bathroom', 'ensuite', 'shower_room', 'wc',
  'living_room', 'kitchen', 'kitchen_diner', 'dining_room', 'study', 'games_room', 'cinema_room', 'playroom',
  'garden', 'terrace', 'pool', 'hot_tub', 'sauna', 'gym', 'garage', 'games_area',
  'other',
];

// Units mode. A top-level unit's type comes from NewRoomModal's non-WP dropdown
// (unknown → 'apartment'); an internal room reuses WP_ROOM_TYPES (unknown →
// 'other'). Both defaults are inside the rooms.type CHECK, so a coerced value
// never trips it. Per-unit access + structural caps below.
const UNIT_TYPES = ['single', 'double', 'twin', 'suite', 'apartment', 'other'];
const VALID_UNIT_ACCESS_METHODS = ['none', 'code', 'keybox', 'keyed', 'app', 'other'];
const UNIT_FREE_PLAN_LIMIT = 5;      // Free plan: max top-level units per property
const ROOMS_PER_UNIT_LIMIT = 5;      // all plans: max internal rooms per unit
const UNIT_PHOTO_LIMIT     = 1;      // all plans: 1 photo per unit / internal room

// yes/no/1/0 → 0 | 1 (case-insensitive; blank/unknown → 0).
function parseYesNo(v) {
  const s = (v ?? '').toString().trim().toLowerCase();
  return (s === 'yes' || s === 'y' || s === '1' || s === 'true') ? 1 : 0;
}

// Parses a CSV bed_config cell like "king:1;sofa_bed:1" into the JSON string
// the rooms.bed_config column stores. Bed types are matched case-insensitively
// (trimmed + lower-cased) so "King:1" from an auto-capitalising spreadsheet
// works the same as "king:1". A single invalid bed type or quantity discards
// the whole cell: returns { value: null, warning } and the caller still
// imports the row, just without a bed configuration set.
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

      // Template offers photo_url_1..10 (Multi's cap); the per-plan photo limit
      // below stops attaching once the plan's allowance is reached.
      const photoUrls = Array.from({ length: 10 }, (_, i) => row[`photo_url_${i + 1}`])
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
        const label = `Row ${rec.rowNum} ("${rec.name}")`;
        if (attached >= photoLimit) {
          photoErrors.push(`${label}: ${plan} plan allows ${photoLimit} photos per room — "${url}" not attached`);
          continue;
        }
        const outcome = await attachRoomPhotoFromUrl(rec.id, url, label);
        if (outcome.attached) { attached++; photosAttached++; }
        else photoErrors.push(outcome.error);
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

// ── POST /api/rooms/bulk-import-categories ────────────────────────────────────
// Room Import Wizard — Room Categories mode. Two passes over the parsed CSV:
//   1. resolve the distinct `category` names (existing → reuse id; new →
//      create via createRoomCategory using the FIRST row's category_amenities /
//      category_description; a later row with different values is a non-blocking
//      warning, first row wins). Names match case-insensitively + trimmed.
//   2. create each room under its resolved category_id.
//
// Hard-gated: 403 unless rental_type='rooms' AND ir_room_mode='categories' —
// the inverse of /bulk-import's gate. Partial success is intentional (Free-plan
// room cap). Photos attach to the room (categories have no photo pipeline).
roomsRouter.post('/bulk-import-categories', async (req, res) => {
  try {
    const { property_id, rows } = req.body;
    if (!property_id || !Array.isArray(rows)) {
      return res.status(400).json({ error: 'Missing property_id or rows' });
    }
    if (!canAccessProperty(req.user.userId, req.user.role, property_id)) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const property = db.prepare('SELECT rental_type, ir_room_mode, currency FROM properties WHERE id = ?').get(property_id);
    if (!property) return res.status(404).json({ error: 'Property not found.' });
    if (property.rental_type !== 'rooms' || property.ir_room_mode !== 'categories') {
      return res.status(403).json({ error: 'This import is only available for properties in Room Categories mode.' });
    }

    if (rows.length === 0) return res.status(400).json({ error: 'No rows to import.' });
    if (rows.length > 500) return res.status(400).json({ error: 'Too many rows — 500 maximum per import.' });

    const currSym    = ({ EUR: '€', GBP: '£', USD: '$', CHF: 'CHF ' })[property.currency] || (property.currency ? property.currency + ' ' : '€');
    const plan       = db.prepare('SELECT plan FROM users WHERE id = ?').get(req.user.userId)?.plan ?? 'free';
    const roomCap    = plan === 'free' ? FREE_PLAN_ROOM_LIMIT : Infinity;
    const photoLimit = PHOTO_LIMITS[plan] ?? PHOTO_LIMITS.free;
    let roomCount    = db.prepare('SELECT COUNT(*) as n FROM rooms WHERE property_id = ?').get(property_id).n;

    // ── Pass 1 — resolve / create categories ──────────────────────────────
    const existing = db.prepare('SELECT id, name, display_order FROM room_categories WHERE property_id = ?').all(property_id);
    const catByKey = new Map();   // lower(trim(name)) -> { id, name, created }
    for (const c of existing) catByKey.set(c.name.trim().toLowerCase(), { id: c.id, name: c.name, created: false });
    let nextDisplayOrder = existing.reduce((m, c) => Math.max(m, c.display_order ?? 0), 0) + 1;

    const firstSpecByKey   = new Map();   // key -> { amen, desc, displayName, rowNum }
    const categoryWarnings = [];
    const categoriesCreated = [];

    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 2;
      const row = rows[i] ?? {};
      const rawName = (row.category ?? '').toString().trim();
      if (!rawName) continue;                       // rejected in pass 2
      const key  = rawName.toLowerCase();
      const amen = (row.category_amenities ?? '').toString().trim() || null;
      const desc = (row.category_description ?? '').toString().trim() || null;

      if (catByKey.has(key)) {
        const spec = firstSpecByKey.get(key);       // only set for categories THIS import created
        // Only a NON-EMPTY later value that differs is a conflict — a later row
        // is expected to leave category_amenities/description blank.
        const amenConflict = spec && amen && amen !== (spec.amen ?? null);
        const descConflict = spec && desc && desc !== (spec.desc ?? null);
        if (amenConflict || descConflict) {
          categoryWarnings.push(`Category "${spec.displayName}" — using the amenities/description from its first row (row ${spec.rowNum}); row ${rowNum} had different values, which were ignored.`);
        }
        continue;
      }

      const cat = createRoomCategory(property_id, {
        name: rawName, buffer: 0, display_order: nextDisplayOrder++, amenities: amen, description: desc,
      });
      catByKey.set(key, { id: cat.id, name: cat.name, created: true });
      firstSpecByKey.set(key, { amen, desc, displayName: rawName, rowNum });
      categoriesCreated.push(cat.name);

      logAction(db, {
        ...actorFromReq(req),
        propertyId: Number(property_id),
        action: 'ROOM_CATEGORY_CREATED',
        category: 'room',
        targetType: 'room_category',
        targetId: cat.id,
        targetName: cat.name,
        ipAddress: getIp(req),
      });
    }

    // ── Pass 2 — create rooms ─────────────────────────────────────────────
    const insertRoom = db.prepare(`
      INSERT INTO rooms
        (property_id, name, type, price_per_night, capacity, max_occupancy,
         status, ical_token, bed_config, category_id)
      VALUES (?, ?, ?, ?, ?, ?, 'available', ?, ?, ?)
    `);

    const created         = [];   // { id, name, rowNum, categoryId, categoryName, photoUrls }
    const warnings        = [];
    const errors          = [];
    const skippedForLimit = [];

    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 2;
      const row = rows[i] ?? {};

      const rawCat   = (row.category ?? '').toString().trim();
      const roomName = (row.room_name ?? '').toString().trim();
      if (!rawCat)   { errors.push(`Row ${rowNum}: missing category`); continue; }
      if (!roomName) { errors.push(`Row ${rowNum}: missing room_name`); continue; }

      const price = parseFloat((row.price_per_night ?? '').toString().replace(/[£$€¥,\s]/g, ''));
      if (!Number.isFinite(price) || price < 0) {
        errors.push(`Row ${rowNum}: invalid price "${row.price_per_night ?? ''}"`);
        continue;
      }

      const cat = catByKey.get(rawCat.toLowerCase());
      if (!cat) { errors.push(`Row ${rowNum}: could not resolve category "${rawCat}"`); continue; }

      if (roomCount >= roomCap) { skippedForLimit.push(rowNum); continue; }

      const capacity      = Math.min(20, Math.max(1, parseInt(row.capacity, 10) || 2));
      const maxOccParsed  = parseInt(row.max_occupancy, 10);
      const max_occupancy = Number.isInteger(maxOccParsed) && maxOccParsed > 0 ? maxOccParsed : null;

      const bed = parseBedConfigCsv(row.bed_config);
      if (bed.warning) warnings.push(`Row ${rowNum}: ${bed.warning}`);

      const ical_token = crypto.randomBytes(16).toString('hex');
      const info = insertRoom.run(
        property_id, roomName, 'double', price, capacity, max_occupancy,
        ical_token, bed.value, cat.id,
      );
      roomCount++;

      const photoUrls = Array.from({ length: 10 }, (_, k) => row[`photo_url_${k + 1}`])
        .map((u) => (u ?? '').toString().trim())
        .filter(Boolean);

      created.push({ id: info.lastInsertRowid, name: roomName, rowNum, categoryId: cat.id, categoryName: cat.name, photoUrls });

      logAction(db, {
        ...actorFromReq(req),
        propertyId: Number(property_id),
        action: 'ROOM_CREATED',
        category: 'room',
        targetType: 'room',
        targetId: info.lastInsertRowid,
        targetName: roomName,
        ipAddress: getIp(req),
      });
    }

    // Drop any category THIS import created that ended up with zero rooms
    // (every row targeting it failed validation).
    for (const c of catByKey.values()) {
      if (!c.created) continue;
      const n = db.prepare('SELECT COUNT(*) as n FROM rooms WHERE category_id = ?').get(c.id).n;
      if (n === 0) {
        db.prepare('DELETE FROM room_categories WHERE id = ?').run(c.id);
        const idx = categoriesCreated.indexOf(c.name);
        if (idx !== -1) categoriesCreated.splice(idx, 1);
      }
    }

    // ── Photos — best-effort, after every room row is inserted ─────────────
    const photoErrors = [];
    let photosAttached = 0;
    for (const rec of created) {
      let attached = db.prepare('SELECT COUNT(*) as n FROM room_photos WHERE room_id = ?').get(rec.id).n;
      for (const url of rec.photoUrls) {
        const label = `Row ${rec.rowNum} ("${rec.name}")`;
        if (attached >= photoLimit) {
          photoErrors.push(`${label}: ${plan} plan allows ${photoLimit} photos per room — "${url}" not attached`);
          continue;
        }
        const outcome = await attachRoomPhotoFromUrl(rec.id, url, label);
        if (outcome.attached) { attached++; photosAttached++; }
        else photoErrors.push(outcome.error);
      }
    }

    // ── Price-variance informational notes ────────────────────────────────
    const priceNotes = [];
    for (const catId of [...new Set(created.map((r) => r.categoryId))]) {
      const prices = db.prepare('SELECT price_per_night FROM rooms WHERE category_id = ?').all(catId)
        .map((r) => Number(r.price_per_night)).filter((p) => p > 0);
      if (prices.length < 2) continue;
      const min = Math.min(...prices), max = Math.max(...prices);
      if (max > min && (max - min) / min >= 0.05) {
        const catName = created.find((r) => r.categoryId === catId)?.categoryName ?? 'Category';
        priceNotes.push(`Category "${catName}" now has rooms priced ${currSym}${min.toFixed(0)}–${currSym}${max.toFixed(0)} — this is normal and will show as a price range to guests.`);
      }
    }

    // Group echo for the result step.
    const groupsMap = new Map();
    for (const rec of created) {
      if (!groupsMap.has(rec.categoryId)) groupsMap.set(rec.categoryId, { category: rec.categoryName, rooms: [] });
      groupsMap.get(rec.categoryId).rooms.push(rec.name);
    }

    res.json({
      imported:            created.length,
      categories_created:  categoriesCreated,
      groups:              [...groupsMap.values()].map((g) => ({ category: g.category, room_count: g.rooms.length, rooms: g.rooms })),
      rooms_skipped_limit: skippedForLimit.length,
      skipped_rows:        skippedForLimit,
      warnings,
      category_warnings:   categoryWarnings,
      price_notes:         priceNotes,
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

// ── POST /api/rooms/bulk-import-wp ────────────────────────────────────────────
// Room Import Wizard — Whole Property mode. WP showcase sections are just
// `rooms` rows with no price and no independent availability, so this is the
// simplest of the three importers: a flat single pass, one CSV row → one room.
//
// Hard-gated: 403 unless rental_type='whole_property'. price_per_night is
// forced to 0 and status to 'available' (neither is a CSV column). Reuses the
// Free-plan room cap and the shared photo-URL attach helper unchanged.
roomsRouter.post('/bulk-import-wp', async (req, res) => {
  try {
    const { property_id, rows } = req.body;
    if (!property_id || !Array.isArray(rows)) {
      return res.status(400).json({ error: 'Missing property_id or rows' });
    }
    if (!canAccessProperty(req.user.userId, req.user.role, property_id)) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const property = db.prepare('SELECT rental_type FROM properties WHERE id = ?').get(property_id);
    if (!property) return res.status(404).json({ error: 'Property not found.' });
    if (property.rental_type !== 'whole_property') {
      return res.status(403).json({ error: 'This import is only available for whole-property rentals.' });
    }

    if (rows.length === 0) return res.status(400).json({ error: 'No rows to import.' });
    if (rows.length > 500) return res.status(400).json({ error: 'Too many rows — 500 maximum per import.' });

    const plan       = db.prepare('SELECT plan FROM users WHERE id = ?').get(req.user.userId)?.plan ?? 'free';
    const roomCap    = plan === 'free' ? FREE_PLAN_ROOM_LIMIT : Infinity;
    const photoLimit = PHOTO_LIMITS[plan] ?? PHOTO_LIMITS.free;
    let roomCount    = db.prepare('SELECT COUNT(*) as n FROM rooms WHERE property_id = ?').get(property_id).n;

    const insertRoom = db.prepare(`
      INSERT INTO rooms (property_id, name, type, price_per_night, capacity, amenities, status, description, ical_token)
      VALUES (?, ?, ?, 0, ?, ?, 'available', ?, ?)
    `);

    const created         = [];
    const warnings        = [];
    const errors          = [];
    const skippedForLimit = [];

    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 2;
      const row = rows[i] ?? {};

      const name = (row.section_name ?? '').toString().trim();
      if (!name) { errors.push(`Row ${rowNum}: missing section_name`); continue; }

      if (roomCount >= roomCap) { skippedForLimit.push(rowNum); continue; }

      let type = (row.type ?? '').toString().trim().toLowerCase();
      if (type && !WP_ROOM_TYPES.includes(type)) {
        warnings.push(`Row ${rowNum}: unknown section type "${row.type}" — imported as "other"`);
        type = 'other';
      }
      if (!type) type = 'other';

      // Advisory — accept any positive integer, no warning on a non-bedroom type.
      const capParsed = parseInt(row.capacity, 10);
      const capacity  = Number.isInteger(capParsed) && capParsed > 0 ? Math.min(20, capParsed) : 2;
      const amenities   = (row.amenities ?? '').toString().trim() || null;
      const description = (row.description ?? '').toString().trim() || null;

      const ical_token = crypto.randomBytes(16).toString('hex');
      const info = insertRoom.run(property_id, name, type, capacity, amenities, description, ical_token);
      roomCount++;

      const photoUrls = Array.from({ length: 10 }, (_, k) => row[`photo_url_${k + 1}`])
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

    // ── Photos — best-effort, after every row is inserted ─────────────────
    const photoErrors = [];
    let photosAttached = 0;
    for (const rec of created) {
      let attached = db.prepare('SELECT COUNT(*) as n FROM room_photos WHERE room_id = ?').get(rec.id).n;
      for (const url of rec.photoUrls) {
        const label = `Row ${rec.rowNum} ("${rec.name}")`;
        if (attached >= photoLimit) {
          photoErrors.push(`${label}: ${plan} plan allows ${photoLimit} photos per section — "${url}" not attached`);
          continue;
        }
        const outcome = await attachRoomPhotoFromUrl(rec.id, url, label);
        if (outcome.attached) { attached++; photosAttached++; }
        else photoErrors.push(outcome.error);
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
        ? `Your ${plan} plan is limited to ${FREE_PLAN_ROOM_LIMIT} sections. Row${skippedForLimit.length === 1 ? '' : 's'} ${skippedForLimit.join(', ')} could not be imported — upgrade to Pro for unlimited sections.`
        : null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/rooms/bulk-import-units ─────────────────────────────────────────
// Room Import Wizard — Units mode (Self-Catering: Aparthotel / Glamping /
// Serviced Apartment). One importer serves all three sub-types — un_sub_type
// affects only property-level settings, never unit/room creation.
//
// Two passes:
//   1. rows with a blank room_name define units, grouped by unit_name
//      (case-insensitive + trimmed). First occurrence creates the unit (type
//      coerced to CHECK-safe UNIT_TYPES, price required, capacity, amenities,
//      description, access_method validated against the whitelist, access_code,
//      arrival_instructions, staffed_checkin_available). A later unit-defining
//      row for the same name with a differing non-blank unit field → non-blocking
//      warning, first row wins (mirrors the Categories importer exactly).
//   2. rows with room_name filled create an internal room under the resolved
//      unit's id (parent_unit_id), price_per_night forced to 0. Unit-only fields
//      on a room row are ignored with a warning.
//
// Hard-gated: 403 unless rental_type='units'. Caps: Free → 5 units/property;
// all plans → 5 internal rooms/unit; 1 photo per row (unit or internal room).
roomsRouter.post('/bulk-import-units', async (req, res) => {
  try {
    const { property_id, rows } = req.body;
    if (!property_id || !Array.isArray(rows)) {
      return res.status(400).json({ error: 'Missing property_id or rows' });
    }
    if (!canAccessProperty(req.user.userId, req.user.role, property_id)) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const property = db.prepare('SELECT rental_type, currency FROM properties WHERE id = ?').get(property_id);
    if (!property) return res.status(404).json({ error: 'Property not found.' });
    if (property.rental_type !== 'units') {
      return res.status(403).json({ error: 'This import is only available for self-catering (units) properties.' });
    }

    if (rows.length === 0) return res.status(400).json({ error: 'No rows to import.' });
    if (rows.length > 500) return res.status(400).json({ error: 'Too many rows — 500 maximum per import.' });

    const currSym = ({ EUR: '€', GBP: '£', USD: '$', CHF: 'CHF ' })[property.currency] || (property.currency ? property.currency + ' ' : '€');
    const plan    = db.prepare('SELECT plan FROM users WHERE id = ?').get(req.user.userId)?.plan ?? 'free';
    const unitCap = plan === 'free' ? UNIT_FREE_PLAN_LIMIT : Infinity;

    const parsePrice = (v) => parseFloat((v ?? '').toString().replace(/[£$€¥,\s]/g, ''));
    const nonBlank   = (v) => (v ?? '').toString().trim() !== '';

    // ── Pass 1 — resolve / create units ──────────────────────────────────
    const existingUnits = db.prepare(
      'SELECT id, name FROM rooms WHERE property_id = ? AND parent_unit_id IS NULL',
    ).all(property_id);
    const unitByKey = new Map();   // lower(trim(name)) -> { id, name, created }
    for (const u of existingUnits) unitByKey.set(u.name.trim().toLowerCase(), { id: u.id, name: u.name, created: false });
    let unitCount = existingUnits.length;

    const firstSpecByKey = new Map();   // key -> { price, type, amen, desc, access_method, access_code, arrival, staffed, displayName, rowNum }
    const unitWarnings   = [];
    const warnings       = [];
    const errors         = [];
    const unitsSkipped   = [];   // row numbers of new-unit rows skipped for the Free cap
    const unitsCreated   = [];
    const created        = [];   // { id, name, rowNum, kind, unitKey, unitName?, photoUrl }

    const insertUnit = db.prepare(`
      INSERT INTO rooms
        (property_id, name, type, price_per_night, capacity, amenities, status, description,
         ical_token, parent_unit_id, access_method, access_code, arrival_instructions, staffed_checkin_available)
      VALUES (?, ?, ?, ?, ?, ?, 'available', ?, ?, NULL, ?, ?, ?, ?)
    `);

    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 2;
      const row = rows[i] ?? {};
      const rawUnit  = (row.unit_name ?? '').toString().trim();
      const roomName = (row.room_name ?? '').toString().trim();
      if (!rawUnit || roomName) continue;   // blank unit → pass 2 error; room row → pass 2
      const key = rawUnit.toLowerCase();

      const price      = parsePrice(row.price_per_night);
      const rawType    = (row.type ?? '').toString().trim().toLowerCase();
      const typeUnknown = !!rawType && !UNIT_TYPES.includes(rawType);
      const type       = UNIT_TYPES.includes(rawType) ? rawType : 'apartment';
      const capacity   = Math.min(20, Math.max(1, parseInt(row.capacity, 10) || 2));
      const amen       = (row.amenities ?? '').toString().trim() || null;
      const desc       = (row.description ?? '').toString().trim() || null;
      const rawAccess  = (row.access_method ?? '').toString().trim().toLowerCase();
      const accessUnknown = !!rawAccess && !VALID_UNIT_ACCESS_METHODS.includes(rawAccess);
      const access_method = VALID_UNIT_ACCESS_METHODS.includes(rawAccess) ? rawAccess : 'none';
      const access_code   = (row.access_code ?? '').toString().trim() || null;
      const arrival       = (row.arrival_instructions ?? '').toString().trim() || null;
      const staffed       = parseYesNo(row.staffed_checkin_available);

      if (unitByKey.has(key)) {
        const spec = firstSpecByKey.get(key);   // only set for units THIS import created
        if (spec) {
          const conflicts = [];
          if (nonBlank(row.price_per_night) && Number.isFinite(price) && price !== spec.price) conflicts.push('price');
          if (rawType && type !== spec.type) conflicts.push('type');
          if (amen && amen !== spec.amen) conflicts.push('amenities');
          if (desc && desc !== spec.desc) conflicts.push('description');
          if (rawAccess && access_method !== spec.access_method) conflicts.push('access_method');
          if (access_code && access_code !== spec.access_code) conflicts.push('access_code');
          if (arrival && arrival !== spec.arrival) conflicts.push('arrival_instructions');
          if (nonBlank(row.staffed_checkin_available) && staffed !== spec.staffed) conflicts.push('staffed_checkin_available');
          if (conflicts.length) {
            unitWarnings.push(`Unit "${spec.displayName}" — using values from its first row (row ${spec.rowNum}); row ${rowNum} had different ${conflicts.join(', ')}, which were ignored.`);
          }
        }
        continue;
      }

      if (!Number.isFinite(price) || price < 0) {
        errors.push(`Row ${rowNum}: unit "${rawUnit}" has an invalid or missing price "${row.price_per_night ?? ''}"`);
        continue;
      }
      if (unitCount >= unitCap) { unitsSkipped.push(rowNum); continue; }

      if (typeUnknown)   warnings.push(`Row ${rowNum}: unknown unit type "${row.type}" — imported as "apartment"`);
      if (accessUnknown) warnings.push(`Row ${rowNum}: unknown access_method "${row.access_method}" — set to "none"`);

      const ical_token = crypto.randomBytes(16).toString('hex');
      const info = insertUnit.run(
        property_id, rawUnit, type, price, capacity, amen, desc,
        ical_token, access_method, access_code, arrival, staffed,
      );
      unitCount++;
      unitByKey.set(key, { id: info.lastInsertRowid, name: rawUnit, created: true });
      firstSpecByKey.set(key, { price, type, amen, desc, access_method, access_code, arrival, staffed, displayName: rawUnit, rowNum });
      unitsCreated.push(rawUnit);
      created.push({ id: info.lastInsertRowid, name: rawUnit, rowNum, kind: 'unit', unitKey: key, photoUrl: (row.photo_url ?? '').toString().trim() });

      logAction(db, {
        ...actorFromReq(req),
        propertyId: Number(property_id),
        action: 'ROOM_CREATED', category: 'room', targetType: 'room',
        targetId: info.lastInsertRowid, targetName: rawUnit, ipAddress: getIp(req),
      });
    }

    // ── Pass 2 — create internal rooms ───────────────────────────────────
    const insertInternal = db.prepare(`
      INSERT INTO rooms
        (property_id, name, type, price_per_night, capacity, amenities, status, description, ical_token, parent_unit_id)
      VALUES (?, ?, ?, 0, ?, ?, 'available', ?, ?, ?)
    `);
    const roomsSkipped         = [];        // { rowNum, unit }
    const roomsInUnit          = new Map(); // unitId -> running internal count
    const unitKeysWithRoomRows = new Set(); // unit keys the CSV gave internal-room rows

    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 2;
      const row = rows[i] ?? {};
      const rawUnit  = (row.unit_name ?? '').toString().trim();
      const roomName = (row.room_name ?? '').toString().trim();
      if (!roomName) continue;   // unit-defining row — pass 1
      if (!rawUnit) { errors.push(`Row ${rowNum}: internal room "${roomName}" has no unit_name`); continue; }

      const key = rawUnit.toLowerCase();
      unitKeysWithRoomRows.add(key);
      const unit = unitByKey.get(key);
      if (!unit) {
        errors.push(`Row ${rowNum}: room "${roomName}" references unit "${rawUnit}", which has no unit-defining row (a row with unit_name set and room_name blank)`);
        continue;
      }

      const stray = ['price_per_night', 'access_method', 'access_code', 'arrival_instructions', 'staffed_checkin_available']
        .filter((f) => nonBlank(row[f]));
      if (stray.length) warnings.push(`Row ${rowNum}: ${stray.join(', ')} only apply to a unit row — ignored for internal room "${roomName}"`);

      if (!roomsInUnit.has(unit.id)) {
        roomsInUnit.set(unit.id, db.prepare('SELECT COUNT(*) as n FROM rooms WHERE parent_unit_id = ?').get(unit.id).n);
      }
      if (roomsInUnit.get(unit.id) >= ROOMS_PER_UNIT_LIMIT) {
        roomsSkipped.push({ rowNum, unit: unit.name });
        continue;
      }

      const rawType = (row.type ?? '').toString().trim().toLowerCase();
      if (rawType && !WP_ROOM_TYPES.includes(rawType)) {
        warnings.push(`Row ${rowNum}: unknown room type "${row.type}" — imported as "other"`);
      }
      const type     = WP_ROOM_TYPES.includes(rawType) ? rawType : 'other';
      const capacity = Math.min(20, Math.max(1, parseInt(row.capacity, 10) || 2));
      const amen     = (row.amenities ?? '').toString().trim() || null;
      const desc     = (row.description ?? '').toString().trim() || null;

      const ical_token = crypto.randomBytes(16).toString('hex');
      const info = insertInternal.run(property_id, roomName, type, capacity, amen, desc, ical_token, unit.id);
      roomsInUnit.set(unit.id, roomsInUnit.get(unit.id) + 1);
      created.push({ id: info.lastInsertRowid, name: roomName, rowNum, kind: 'room', unitKey: key, unitName: unit.name, photoUrl: (row.photo_url ?? '').toString().trim() });

      logAction(db, {
        ...actorFromReq(req),
        propertyId: Number(property_id),
        action: 'ROOM_CREATED', category: 'room', targetType: 'room',
        targetId: info.lastInsertRowid, targetName: roomName, ipAddress: getIp(req),
      });
    }

    // Clean up any unit THIS import created whose internal-room rows all failed —
    // 0 children AND the CSV clearly intended it to have some. A deliberate
    // bare-unit import (no room rows at all) is preserved.
    const unitsRemoved = [];
    for (const u of unitByKey.values()) {
      if (!u.created) continue;
      const key = u.name.trim().toLowerCase();
      if (!unitKeysWithRoomRows.has(key)) continue;
      const childCount = db.prepare('SELECT COUNT(*) as n FROM rooms WHERE parent_unit_id = ?').get(u.id).n;
      if (childCount > 0) continue;
      db.prepare('DELETE FROM room_photos WHERE room_id = ?').run(u.id);
      db.prepare('DELETE FROM content_flags WHERE room_id = ?').run(u.id);
      db.prepare('DELETE FROM rooms WHERE id = ?').run(u.id);
      const ci = unitsCreated.indexOf(u.name); if (ci !== -1) unitsCreated.splice(ci, 1);
      unitsRemoved.push(u.name);
    }
    const removedIds = new Set();
    for (const u of unitByKey.values()) if (u.created && unitsRemoved.includes(u.name)) removedIds.add(u.id);
    const liveCreated = created.filter((r) => !removedIds.has(r.id));

    // ── Photos — best-effort, 1 per row regardless of plan ────────────────
    const photoErrors = [];
    let photosAttached = 0;
    for (const rec of liveCreated) {
      if (!rec.photoUrl) continue;
      const label = `Row ${rec.rowNum} ("${rec.name}")`;
      const already = db.prepare('SELECT COUNT(*) as n FROM room_photos WHERE room_id = ?').get(rec.id).n;
      if (already >= UNIT_PHOTO_LIMIT) {
        photoErrors.push(`${label}: only ${UNIT_PHOTO_LIMIT} photo is allowed per unit and per internal room — "${rec.photoUrl}" not attached`);
        continue;
      }
      const outcome = await attachRoomPhotoFromUrl(rec.id, rec.photoUrl, label);
      if (outcome.attached) photosAttached++;
      else photoErrors.push(outcome.error);
    }

    // ── Group echo (unit → internal rooms, with the unit price) ───────────
    const groupsMap = new Map();
    for (const rec of liveCreated) {
      if (!groupsMap.has(rec.unitKey)) {
        groupsMap.set(rec.unitKey, { unit: unitByKey.get(rec.unitKey)?.name ?? rec.name, price: firstSpecByKey.get(rec.unitKey)?.price ?? null, rooms: [] });
      }
      if (rec.kind === 'room') groupsMap.get(rec.unitKey).rooms.push(rec.name);
    }

    const limitParts = [];
    if (unitsSkipped.length) {
      limitParts.push(`Your ${plan} plan is limited to ${UNIT_FREE_PLAN_LIMIT} units. Row${unitsSkipped.length === 1 ? '' : 's'} ${unitsSkipped.join(', ')} could not be imported — upgrade to Pro for unlimited units.`);
    }
    if (roomsSkipped.length) {
      limitParts.push(`A unit can hold at most ${ROOMS_PER_UNIT_LIMIT} internal rooms. Row${roomsSkipped.length === 1 ? '' : 's'} ${roomsSkipped.map((x) => x.rowNum).join(', ')} exceeded that and ${roomsSkipped.length === 1 ? 'was' : 'were'} skipped.`);
    }

    res.json({
      imported:            liveCreated.length,
      units_imported:      liveCreated.filter((r) => r.kind === 'unit').length,
      rooms_imported:      liveCreated.filter((r) => r.kind === 'room').length,
      units_created:       unitsCreated,
      units_removed:       unitsRemoved,
      groups:              [...groupsMap.values()].map((g) => ({ unit: g.unit, price: g.price, room_count: g.rooms.length, rooms: g.rooms })),
      units_skipped_limit: unitsSkipped.length,
      rooms_skipped_limit: roomsSkipped.length,
      skipped_unit_rows:   unitsSkipped,
      skipped_room_rows:   roomsSkipped.map((x) => x.rowNum),
      warnings,
      unit_warnings:       unitWarnings,
      errors,
      photos_attached:     photosAttached,
      photo_errors:        photoErrors,
      currency_symbol:     currSym,
      limit_message:       limitParts.join(' ') || null,
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
