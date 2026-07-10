import { Router } from 'express';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { randomBytes } from 'crypto';
import multer from 'multer';
import sharp from 'sharp';
import db from '../db/database.js';
import { logAction, getIp } from '../utils/auditLog.js';
import { generateSlug, uniqueSlug } from '../utils/slugify.js';
import { seedCategories } from '../utils/categories.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROP_UPLOAD_DIR   = join(__dirname, '../uploads/properties');
const ACCESS_PHOTO_DIR  = join(__dirname, '../uploads/access');
fs.mkdirSync(PROP_UPLOAD_DIR,  { recursive: true });
fs.mkdirSync(ACCESS_PHOTO_DIR, { recursive: true });

const propPhotoStorage = multer.diskStorage({
  destination: PROP_UPLOAD_DIR,
  filename: (req, file, cb) => {
    cb(null, `prop-${req.params.id}-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`);
  },
});
const propPhotoUpload = multer({
  storage: propPhotoStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Images only'));
    cb(null, true);
  },
});

export const propertiesRouter = Router();

function actorFromReq(req) {
  const u = db.prepare('SELECT name, email, role FROM users WHERE id = ?').get(req.user.userId);
  return { userId: req.user.userId, userName: u?.name, userEmail: u?.email, userRole: u?.role };
}

// ── Ownership helper ──────────────────────────────────────────────────────────
// Returns true if userId can read/write propId.
// Owners: validated via properties.owner_id.
// Reception staff: validated via their single users.property_id.
function canAccess(userId, role, propId) {
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

// ── GET /api/properties ───────────────────────────────────────────────────────
// Owners: returns all their properties. Reception: returns their one assigned property.
propertiesRouter.get('/', (req, res) => {
  try {
    if (req.user.role === 'owner') {
      let rows = db.prepare('SELECT * FROM properties WHERE owner_id = ? ORDER BY id')
        .all(req.user.userId);

      // Fallback for owners whose property pre-dates the owner_id migration:
      // if nothing found via owner_id, locate via users.property_id and backfill.
      if (rows.length === 0) {
        const u = db.prepare('SELECT property_id FROM users WHERE id = ?').get(req.user.userId);
        if (u?.property_id) {
          db.prepare('UPDATE properties SET owner_id = ? WHERE id = ? AND owner_id IS NULL')
            .run(req.user.userId, u.property_id);
          const prop = db.prepare('SELECT * FROM properties WHERE id = ?').get(u.property_id);
          rows = prop ? [prop] : [];
        }
      }

      return res.json(rows);
    }
    // Reception staff — return their single assigned property
    const u = db.prepare('SELECT property_id FROM users WHERE id = ?').get(req.user.userId);
    if (!u?.property_id) return res.json([]);
    const prop = db.prepare('SELECT * FROM properties WHERE id = ?').get(u.property_id);
    return res.json(prop ? [prop] : []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/properties/:id ───────────────────────────────────────────────────
propertiesRouter.get('/:id', (req, res) => {
  try {
    if (!canAccess(req.user.userId, req.user.role, req.params.id)) {
      return res.status(404).json({ error: 'Property not found.' });
    }
    const row = db.prepare('SELECT * FROM properties WHERE id = ?').get(req.params.id);
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/properties/active/:id ────────────────────────────────────────────
// Switches the active property for this user (persists to users.property_id).
// Defined BEFORE /:id so Express doesn't swallow "active" as a param.
propertiesRouter.put('/active/:id', (req, res) => {
  try {
    const propId = Number(req.params.id);
    if (!canAccess(req.user.userId, req.user.role, propId)) {
      return res.status(403).json({ error: 'Access denied.' });
    }
    db.prepare('UPDATE users SET property_id = ? WHERE id = ?').run(propId, req.user.userId);
    res.json({ success: true, active_property_id: propId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/properties ──────────────────────────────────────────────────────
// Creates a new property. Multi plan owners only; hard cap of 5.
propertiesRouter.post('/', (req, res) => {
  try {
    if (req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Only account owners can add properties.' });
    }
    const user = db.prepare('SELECT plan FROM users WHERE id = ?').get(req.user.userId);
    if (user?.plan !== 'multi') {
      return res.status(403).json({ error: 'A Multi plan is required to add more than one property.' });
    }
    const count = db.prepare('SELECT COUNT(*) as n FROM properties WHERE owner_id = ?')
      .get(req.user.userId).n;
    if (count >= 5) {
      return res.status(400).json({ error: 'Maximum of 5 properties reached.' });
    }

    const { name, type, address, city, country, check_in_time, check_out_time, currency, locale } = req.body;
    if (!name || !type) return res.status(400).json({ error: 'name and type are required.' });

    const result = db.prepare(`
      INSERT INTO properties
        (name, type, address, city, country, check_in_time, check_out_time, currency, locale, owner_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      name, type,
      address        ?? null,
      city           ?? null,
      country        ?? null,
      check_in_time  ?? '15:00',
      check_out_time ?? '11:00',
      currency       ?? 'EUR',
      locale         ?? 'en',
      req.user.userId
    );

    // Auto-generate booking slug and iCal token for the new property
    const newId     = result.lastInsertRowid;
    const newSlug   = uniqueSlug(db, generateSlug(name));
    const icalToken = randomBytes(16).toString('hex');
    db.prepare('UPDATE properties SET booking_slug = ?, ical_token = ? WHERE id = ?').run(newSlug, icalToken, newId);

    seedCategories(db, Number(newId), 'rooms');

    const created = db.prepare('SELECT * FROM properties WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(created);

    logAction(db, {
      ...actorFromReq(req),
      propertyId: created.id,
      action: 'PROPERTY_CREATED',
      category: 'property',
      targetType: 'property',
      targetId: created.id,
      targetName: created.name,
      ipAddress: getIp(req),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/properties/:id ───────────────────────────────────────────────────
propertiesRouter.put('/:id', (req, res) => {
  try {
    if (!canAccess(req.user.userId, req.user.role, req.params.id)) {
      return res.status(404).json({ error: 'Property not found.' });
    }
    const {
      name, type, address, city, country,
      check_in_time, check_out_time, currency, locale, theme,
      breakfast_included, require_deposit, deposit_amount, breakfast_price,
      breakfast_start_time, breakfast_end_time, breakfast_widget_enabled,
      description, hero_image_url,
      rental_type, total_capacity, bedroom_count, bathroom_count, whole_property_rate,
      access_method, access_code, arrival_instructions, send_access_hours,
      cancellation_days,
      block_booking_protection, block_booking_threshold,
    } = req.body;
    const existing = db.prepare('SELECT rental_type, description FROM properties WHERE id = ?').get(req.params.id);
    const VALID_THEMES = ['forest','royal','ember','ruby','sky','lavender','charcoal'];
    const VALID_RENTAL_TYPES = ['rooms', 'whole_property'];
    const VALID_ACCESS_METHODS = ['code', 'keybox', 'keyed', 'app', 'other'];
    // Preserve the existing rental_type if the field is absent from the body — never silently
    // downgrade a WP property to 'rooms' just because a partial settings save omitted the field.
    const newRentalType = VALID_RENTAL_TYPES.includes(rental_type)
      ? rental_type
      : (existing?.rental_type ?? 'rooms');
    db.prepare(`
      UPDATE properties
      SET name = ?, type = ?, address = ?, city = ?, country = ?,
          check_in_time = ?, check_out_time = ?, currency = ?, locale = ?, theme = ?,
          breakfast_included = ?, require_deposit = ?, deposit_amount = ?,
          breakfast_price = ?, breakfast_start_time = ?, breakfast_end_time = ?,
          breakfast_widget_enabled = ?,
          description = ?, hero_image_url = ?,
          rental_type = ?, total_capacity = ?, bedroom_count = ?, bathroom_count = ?,
          whole_property_rate = ?,
          access_method = ?, access_code = ?, arrival_instructions = ?, send_access_hours = ?,
          cancellation_days = ?,
          block_booking_protection = ?, block_booking_threshold = ?
      WHERE id = ?
    `).run(
      name, type, address, city, country,
      check_in_time, check_out_time, currency, locale,
      VALID_THEMES.includes(theme) ? theme : 'forest',
      breakfast_included ? 1 : 0,
      require_deposit    ? 1 : 0,
      parseFloat(deposit_amount) || 0,
      parseFloat(breakfast_price) || 0,
      breakfast_start_time ?? '07:00',
      breakfast_end_time   ?? '11:00',
      breakfast_widget_enabled ? 1 : 0,
      description || null,
      hero_image_url || null,
      newRentalType,
      total_capacity  ? parseInt(total_capacity,  10) : null,
      bedroom_count   ? parseInt(bedroom_count,   10) : null,
      bathroom_count  ? parseInt(bathroom_count,  10) : null,
      whole_property_rate ? parseFloat(whole_property_rate) : null,
      VALID_ACCESS_METHODS.includes(access_method) ? access_method : 'code',
      access_code || null,
      arrival_instructions || null,
      send_access_hours ? parseInt(send_access_hours, 10) : 24,
      cancellation_days != null ? parseInt(cancellation_days, 10) : 7,
      block_booking_protection ? 1 : 0,
      block_booking_threshold != null ? Math.max(2, parseInt(block_booking_threshold, 10)) : 2,
      req.params.id,
    );
    if (existing && newRentalType !== existing.rental_type) {
      seedCategories(db, Number(req.params.id), newRentalType);
    }
    if (description && description !== existing?.description) {
      db.prepare(`INSERT INTO content_flags (property_id, content_type, preview_text) VALUES (?, 'property_description', ?)`)
        .run(req.params.id, description);
    }

    const updated = db.prepare('SELECT * FROM properties WHERE id = ?').get(req.params.id);
    res.json(updated);

    logAction(db, {
      ...actorFromReq(req),
      propertyId: updated.id,
      action: 'PROPERTY_UPDATED',
      category: 'property',
      targetType: 'property',
      targetId: updated.id,
      targetName: updated.name,
      ipAddress: getIp(req),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/properties/:id ────────────────────────────────────────────────
// Owners only. Cannot delete your last property.
// Deletes in FK order: bookings → rooms → property.
// Nullifies staff property_id refs before deletion.
// Returns the updated properties list.
propertiesRouter.delete('/:id', (req, res) => {
  try {
    const pid = Number(req.params.id);

    // Only owners can delete properties
    if (req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Only account owners can remove properties.' });
    }

    if (!canAccess(req.user.userId, req.user.role, pid)) {
      return res.status(404).json({ error: 'Property not found.' });
    }

    // Prevent deleting last property
    const count = db.prepare('SELECT COUNT(*) as n FROM properties WHERE owner_id = ?')
      .get(req.user.userId).n;
    if (count <= 1) {
      return res.status(400).json({
        error: 'You cannot delete your only property. If you want to close your account, use the Manage Subscription option in settings.',
      });
    }

    // Delete in FK order: nullify staff refs → audit_log → charges → bookings → categories → rooms → property
    try {
      db.exec('BEGIN');
      db.prepare('UPDATE users SET property_id = NULL WHERE property_id = ?').run(pid);
      db.prepare('DELETE FROM audit_log WHERE property_id = ?').run(pid);
      db.prepare('DELETE FROM room_charges WHERE property_id = ?').run(pid);
      db.prepare('DELETE FROM bookings WHERE property_id = ?').run(pid);
      db.prepare('DELETE FROM service_categories WHERE property_id = ?').run(pid);
      db.prepare('DELETE FROM rooms WHERE property_id = ?').run(pid);
      db.prepare('DELETE FROM properties WHERE id = ?').run(pid);
      db.exec('COMMIT');
    } catch (e) {
      try { db.exec('ROLLBACK'); } catch {}
      throw e;
    }

    // If this was the owner's active property, switch them to another one
    const owner = db.prepare('SELECT property_id FROM users WHERE id = ?').get(req.user.userId);
    if (Number(owner?.property_id) === pid) {
      const next = db.prepare('SELECT id FROM properties WHERE owner_id = ? ORDER BY id LIMIT 1')
        .get(req.user.userId);
      if (next) {
        db.prepare('UPDATE users SET property_id = ? WHERE id = ?').run(next.id, req.user.userId);
      }
    }

    // Return the remaining properties list
    const remaining = db.prepare('SELECT * FROM properties WHERE owner_id = ? ORDER BY id')
      .all(req.user.userId);
    res.json({ deleted_id: pid, properties: remaining });

    logAction(db, {
      ...actorFromReq(req),
      propertyId: pid,
      action: 'PROPERTY_DELETED',
      category: 'property',
      targetType: 'property',
      targetId: pid,
      ipAddress: getIp(req),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/properties/:id/slug ────────────────────────────────────────────
// Updates the custom booking page slug. Owners only.
propertiesRouter.patch('/:id/slug', (req, res) => {
  try {
    const pid = Number(req.params.id);
    if (!canAccess(req.user.userId, req.user.role, pid)) {
      return res.status(404).json({ error: 'Property not found.' });
    }
    if (req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Only account owners can change the booking URL.' });
    }

    const { booking_slug } = req.body;
    if (!booking_slug) {
      return res.status(400).json({ error: 'booking_slug is required.' });
    }
    if (!/^[a-z0-9-]+$/.test(booking_slug)) {
      return res.status(400).json({ error: 'Slug may only contain lowercase letters, numbers and hyphens.' });
    }
    if (booking_slug.length > 60) {
      return res.status(400).json({ error: 'Slug must be 60 characters or fewer.' });
    }

    // Uniqueness check — allow the property to keep its own existing slug
    const conflict = db.prepare('SELECT id FROM properties WHERE booking_slug = ?').get(booking_slug);
    if (conflict && Number(conflict.id) !== pid) {
      return res.status(409).json({ error: 'This URL is already taken. Please choose a different one.' });
    }

    db.prepare('UPDATE properties SET booking_slug = ? WHERE id = ?').run(booking_slug, pid);
    const updated = db.prepare('SELECT * FROM properties WHERE id = ?').get(pid);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/properties/:id/hero-photo ───────────────────────────────────────
propertiesRouter.post('/:id/hero-photo', propPhotoUpload.single('photo'), async (req, res) => {
  try {
    const propId = Number(req.params.id);
    if (!canAccess(req.user.userId, req.user.role, propId)) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(403).json({ error: 'Access denied.' });
    }
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

    // Resize to max 1920px wide, JPEG quality 85
    const tmpPath = req.file.path + '.tmp';
    await sharp(req.file.path)
      .resize(1920, null, { withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toFile(tmpPath);
    fs.unlinkSync(req.file.path);
    fs.renameSync(tmpPath, req.file.path);

    // Remove previous hero photo file if it exists
    const existing = db.prepare('SELECT hero_photo FROM properties WHERE id = ?').get(propId);
    if (existing?.hero_photo) {
      try { fs.unlinkSync(join(PROP_UPLOAD_DIR, existing.hero_photo)); } catch {}
    }

    db.prepare('UPDATE properties SET hero_photo = ? WHERE id = ?').run(req.file.filename, propId);
    db.prepare(`INSERT INTO content_flags (property_id, content_type, content_ref) VALUES (?, 'hero_photo', ?)`)
      .run(propId, req.file.filename);
    const updated = db.prepare('SELECT * FROM properties WHERE id = ?').get(propId);
    res.json(updated);
  } catch (err) {
    if (req.file?.path) {
      try { fs.unlinkSync(req.file.path); } catch {}
      try { fs.unlinkSync(req.file.path + '.tmp'); } catch {}
    }
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/properties/:id/hero-photo ─────────────────────────────────────
propertiesRouter.delete('/:id/hero-photo', (req, res) => {
  try {
    const propId = Number(req.params.id);
    if (!canAccess(req.user.userId, req.user.role, propId)) {
      return res.status(403).json({ error: 'Access denied.' });
    }
    const existing = db.prepare('SELECT hero_photo FROM properties WHERE id = ?').get(propId);
    if (existing?.hero_photo) {
      try { fs.unlinkSync(join(PROP_UPLOAD_DIR, existing.hero_photo)); } catch {}
    }
    db.prepare('UPDATE properties SET hero_photo = NULL WHERE id = ?').run(propId);
    const updated = db.prepare('SELECT * FROM properties WHERE id = ?').get(propId);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/properties/:id/access-photo ─────────────────────────────────────
const accessPhotoUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, ACCESS_PHOTO_DIR),
    filename: (req, file, cb) => cb(null, `access-${req.params.id}-${Date.now()}.tmp`),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) cb(null, true);
    else cb(new Error('JPEG, PNG or WebP only'));
  },
});

propertiesRouter.post('/:id/access-photo', accessPhotoUpload.single('photo'), async (req, res) => {
  try {
    const propId = Number(req.params.id);
    if (!canAccess(req.user.userId, req.user.role, propId)) {
      if (req.file) try { fs.unlinkSync(req.file.path); } catch {}
      return res.status(403).json({ error: 'Access denied.' });
    }
    if (!req.file) return res.status(400).json({ error: 'No photo uploaded' });

    const existing = db.prepare('SELECT access_photo FROM properties WHERE id = ?').get(propId);
    const filename = `access-${propId}-${Date.now()}.jpg`;
    const outputPath = join(ACCESS_PHOTO_DIR, filename);

    await sharp(req.file.path)
      .resize(1200, null, { withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toFile(outputPath);

    try { fs.unlinkSync(req.file.path); } catch {}

    if (existing?.access_photo) {
      try { fs.unlinkSync(join(ACCESS_PHOTO_DIR, existing.access_photo)); } catch {}
    }

    db.prepare('UPDATE properties SET access_photo = ? WHERE id = ?').run(filename, propId);
    console.log(`[access-photo] Uploaded for property ${propId}: ${filename}`);
    res.json({ success: true, filename });
  } catch (err) {
    if (req.file) try { fs.unlinkSync(req.file.path); } catch {}
    console.error('[access-photo]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/properties/:id/access-photo ───────────────────────────────────
propertiesRouter.delete('/:id/access-photo', (req, res) => {
  try {
    const propId = Number(req.params.id);
    if (!canAccess(req.user.userId, req.user.role, propId)) {
      return res.status(403).json({ error: 'Access denied.' });
    }
    const existing = db.prepare('SELECT access_photo FROM properties WHERE id = ?').get(propId);
    if (existing?.access_photo) {
      try { fs.unlinkSync(join(ACCESS_PHOTO_DIR, existing.access_photo)); } catch {}
      db.prepare('UPDATE properties SET access_photo = NULL WHERE id = ?').run(propId);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
