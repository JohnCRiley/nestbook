import { useState, useRef, useEffect, useMemo } from 'react';
import { apiFetch } from '../../utils/apiFetch.js';
import { useT, useLocale } from '../../i18n/LocaleContext.jsx';
import { parseCsv } from '../../utils/csvParser.js';
import { BED_TYPES } from '../../utils/bedTypes.js';
import { ChevronUpIcon, ChevronDownIcon, DownloadIcon, CircleCheckIcon, AlertTriangleIcon } from '../../components/TablerIcons.jsx';

// Kept in sync with server IMPORT_ROOM_TYPES / rooms.js (Named Rooms mode only).
const ROOM_TYPES = ['single', 'double', 'twin', 'suite', 'apartment', 'other'];
const FREE_ROOM_LIMIT = 5;
const PRICE_VARIANCE_THRESHOLD = 0.05; // 5% spread → informational note

// A photo_url should point straight at an image file, not at a webpage that
// shows one. Query strings (?w=800&auto=compress) are fine — CDNs add them.
const IMAGE_EXT_RE = /\.(jpe?g|png|webp|gif|avif|bmp|tiff?|heic)(\?|#|$)/i;

// The template always offers the Multi plan's max (10) photo columns. Free/Pro
// accounts leave the extras blank — the server's per-plan cap stops attaching
// once the plan limit is reached and flags the rest, so extras are harmless.
const MAX_PHOTO_COLS = 10;
const PHOTO_COLS = Array.from({ length: MAX_PHOTO_COLS }, (_, i) => `photo_url_${i + 1}`);

// ── Named Rooms template ─────────────────────────────────────────────────────
const NAMED_COLS = [
  'name', 'type', 'price_per_night', 'capacity', 'max_occupancy',
  'amenities', 'description', 'bed_config', ...PHOTO_COLS,
];
const NAMED_ROWS = [
  ['La Suite Lavande', 'suite', '145', '2', '3', '"wifi,ensuite,balcony,minibar"', 'Top-floor suite with valley views', 'king:1;sofa_bed:1'],
  ['Chambre Mistral', 'twin', '95', '2', '', '"wifi,ensuite"', 'Cosy twin with garden view', 'single:2'],
  ['Chambre Olivier', 'single', '70', '1', '', 'wifi', 'Compact single', 'single:1'],
];

// ── Room Categories template ─────────────────────────────────────────────────
const CAT_COLS = [
  'category', 'room_name', 'price_per_night', 'capacity', 'max_occupancy',
  'bed_config', 'category_amenities', 'category_description', ...PHOTO_COLS,
];
const CAT_ROWS = [
  ['Double', 'Lavender Room', '95', '2', '3', 'double:1', '"wifi,ensuite,tea tray"', 'Our standard double rooms'],
  ['Double', 'Garden Room', '105', '2', '', 'queen:1', '', ''],
  ['Family', 'Orchard Room', '140', '4', '5', 'double:1;single:2', '"wifi,ensuite,sofa"', 'Sleeps a family of four'],
  ['Single', 'Nook', '65', '1', '', 'single:1', 'wifi', 'Compact singles'],
];

// ── Whole Property template ─────────────────────────────────────────────────
// Kept in sync with server WP_ROOM_TYPES / rooms.js and NewRoomModal's WP list.
const WP_ROOM_TYPES = [
  'double', 'twin', 'single', 'bunk', 'master', 'kids',
  'bathroom', 'ensuite', 'shower_room', 'wc',
  'living_room', 'kitchen', 'kitchen_diner', 'dining_room', 'study', 'games_room', 'cinema_room', 'playroom',
  'garden', 'terrace', 'pool', 'hot_tub', 'sauna', 'gym', 'garage', 'games_area',
  'other',
];
const WP_COLS = ['section_name', 'type', 'capacity', 'amenities', 'description', ...PHOTO_COLS];
const WP_ROWS = [
  ['Bedrooms', 'double', '6', '"wifi,blackout blinds,linens provided"', 'Three comfortable bedrooms sleeping up to six.'],
  ['Living Spaces', 'living_room', '', '"wifi,smart TV,wood burner"', 'Open-plan kitchen, dining and lounge.'],
  ['Bathrooms', 'bathroom', '', '"rainfall shower,towels provided"', 'Family bathroom plus a downstairs WC.'],
  ['Garden', 'garden', '', '"furniture,BBQ,parking"', 'Enclosed garden with seating and a barbecue.'],
];

// ── Units template (Self-Catering) ──────────────────────────────────────────
// Kept in sync with server UNIT_TYPES / VALID_UNIT_ACCESS_METHODS / rooms.js.
const UNIT_TYPES = ['single', 'double', 'twin', 'suite', 'apartment', 'other'];
const UNIT_ACCESS_METHODS = ['none', 'code', 'keybox', 'keyed', 'app', 'other'];
const FREE_UNIT_LIMIT = 5;       // Free plan: units per property
const ROOMS_PER_UNIT_LIMIT = 5;  // all plans: internal rooms per unit
const UNIT_COLS = [
  'unit_name', 'room_name', 'type', 'price_per_night', 'capacity', 'amenities', 'description',
  'access_method', 'access_code', 'arrival_instructions', 'staffed_checkin_available', 'photo_url',
];
// room_name blank → this row defines the unit. room_name filled → internal room.
const UNIT_ROWS = [
  ['Apartment 1', '', 'apartment', '120', '4', '"wifi,kitchen,washing machine"', 'Second-floor apartment with a balcony', 'keybox', '4471', 'Key box is on the wall to the left of the main door', 'no', ''],
  ['Apartment 1', 'Double Bedroom', 'double', '', '2', '"blackout blinds"', '', '', '', '', '', ''],
  ['Apartment 1', 'Kitchen / Living', 'living_room', '', '', '"dishwasher,sofa bed"', '', '', '', '', '', ''],
  ['Apartment 1', 'Bathroom', 'bathroom', '', '', '"walk-in shower"', '', '', '', '', '', ''],
  ['Glamping Pod 2', '', 'other', '95', '2', '"log burner,fire pit"', 'Off-grid pod with a wood-fired hot tub', 'code', '', 'Gate code is sent the morning of arrival', 'yes', ''],
  ['Glamping Pod 2', 'Sleeping Area', 'double', '', '2', '', '', '', '', '', '', ''],
];
const UNIT_CSV = UNIT_COLS.join(',') + '\n' + UNIT_ROWS.map((r) => r.join(',')).join('\n') + '\n';

// Each sample row supplies the non-photo columns; the 10 photo columns are
// appended empty so the header still advertises all of them.
function buildTemplate(cols, sampleRows) {
  const nonPhoto = cols.length - MAX_PHOTO_COLS;
  return cols.join(',') + '\n' +
    sampleRows.map((r) => {
      const vals = r.slice(0, nonPhoto);
      while (vals.length < nonPhoto) vals.push('');
      return [...vals, ...Array(MAX_PHOTO_COLS).fill('')].join(',');
    }).join('\n') + '\n';
}

function downloadBlob(content, filename) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Parse "king:1;sofa_bed:1" → { beds:[{type,qty}], warning }.
// Any invalid entry discards the whole cell (mirrors the server). Bed types are
// matched case-insensitively — CSV editors love to auto-capitalise.
function parseBedConfigCell(raw) {
  const s = (raw ?? '').trim();
  if (!s) return { beds: [] };
  const beds = [];
  for (const part of s.split(';')) {
    const piece = part.trim();
    if (!piece) continue;
    const [typeRaw, qtyRaw] = piece.split(':').map((x) => (x ?? '').trim());
    const type = typeRaw.toLowerCase();
    if (!BED_TYPES.includes(type)) {
      return { beds: [], warning: `bed type "${typeRaw}" is not valid — bed config skipped` };
    }
    const qty = qtyRaw === '' ? 1 : Number(qtyRaw);
    if (!Number.isInteger(qty) || qty < 1) {
      return { beds: [], warning: `bed quantity "${qtyRaw}" is not a whole number — bed config skipped` };
    }
    beds.push({ type, qty });
  }
  return { beds };
}

const parsePrice = (v) => parseFloat(String(v ?? '').replace(/[£$€¥,\s]/g, ''));

export default function ImportRoomsModal({
  onClose, onImported, propertyId, currentRoomCount = 0, plan = 'free', mode = 'named',
}) {
  const t = useT();
  const { currencySymbol } = useLocale();
  const fileRef = useRef(null);
  const isCat   = mode === 'categories';
  const isWP    = mode === 'whole_property';
  const isUnits = mode === 'units';

  const TEMPLATE_COLS = isCat ? CAT_COLS : isWP ? WP_COLS : isUnits ? UNIT_COLS : NAMED_COLS;
  const TEMPLATE_CSV  = isUnits ? UNIT_CSV
    : buildTemplate(TEMPLATE_COLS, isCat ? CAT_ROWS : isWP ? WP_ROWS : NAMED_ROWS);
  const templateName  = isCat ? 'nestbook-room-categories-template.csv'
    : isWP ? 'nestbook-property-sections-template.csv'
    : isUnits ? 'nestbook-units-template.csv' : 'nestbook-rooms-template.csv';
  const endpoint      = isCat ? '/api/rooms/bulk-import-categories'
    : isWP ? '/api/rooms/bulk-import-wp'
    : isUnits ? '/api/rooms/bulk-import-units' : '/api/rooms/bulk-import';

  const [step,       setStep]       = useState(1);   // 1 instr · 2 upload · 3 preview · 4 result
  const [dataRows,   setDataRows]   = useState([]);
  const [result,     setResult]     = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [fileError,  setFileError]  = useState(null);
  const [howToOpen,  setHowToOpen]  = useState(false);
  const [existingCatNames, setExistingCatNames] = useState(() => new Set());
  const [existingUnits, setExistingUnits] = useState(() => ({ names: new Set(), roomCountByKey: new Map() }));

  const hasData = dataRows.length > 0;

  // Fetch existing categories so the preview can tag each group new / existing.
  useEffect(() => {
    if (!isCat || !propertyId) return;
    let cancelled = false;
    apiFetch(`/api/properties/${propertyId}/room-categories`)
      .then((r) => (r.ok ? r.json() : []))
      .then((cats) => {
        if (cancelled) return;
        setExistingCatNames(new Set((Array.isArray(cats) ? cats : []).map((c) => c.name.trim().toLowerCase())));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isCat, propertyId]);

  // Units mode: fetch every room so the preview can count existing units (Free
  // cap) and existing internal rooms per unit (per-unit cap). Advisory only —
  // the server is authoritative.
  useEffect(() => {
    if (!isUnits || !propertyId) return;
    let cancelled = false;
    apiFetch(`/api/rooms?property_id=${propertyId}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data) ? data : (data.rooms ?? []);
        const units = list.filter((x) => x.parent_unit_id == null);
        const keyById = new Map(units.map((u) => [u.id, u.name.trim().toLowerCase()]));
        const names = new Set(units.map((u) => u.name.trim().toLowerCase()));
        const roomCountByKey = new Map();
        for (const x of list) {
          if (x.parent_unit_id == null) continue;
          const k = keyById.get(x.parent_unit_id);
          if (k) roomCountByKey.set(k, (roomCountByKey.get(k) || 0) + 1);
        }
        setExistingUnits({ names, roomCountByKey });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isUnits, propertyId]);

  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key !== 'Escape' || hasData) return;
      onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [hasData, onClose]);

  function handleBackdropClick(e) {
    if (e.target !== e.currentTarget || hasData) return;
    onClose();
  }

  const validRows       = dataRows.filter((r) => r._errors.length === 0);
  const importable      = validRows.filter((r) => !r._overLimit);
  const rowsWithTypeWarn = dataRows.filter((r) => r._warnings.some((w) => w.startsWith('type:')));
  const rowsWithBedWarn  = dataRows.filter((r) => r._warnings.some((w) => w.startsWith('bed')));
  const rowsWithUrlWarn  = dataRows.filter((r) => r._warnings.some((w) => w.startsWith('photo')));
  const rowsWithAccessWarn = dataRows.filter((r) => r._warnings.some((w) => w.startsWith('access:')));
  const rowsWithStrayWarn  = dataRows.filter((r) => r._warnings.some((w) => w.startsWith('stray:')));
  const rowsOverLimit    = validRows.filter((r) => r._overLimit && !r._limitKind);
  const rowsOverUnitLimit = validRows.filter((r) => r._overLimit && r._limitKind === 'unit');
  const rowsOverRoomLimit = validRows.filter((r) => r._overLimit && r._limitKind === 'room');

  // ── Units mode: group internal rooms under their resolved unit ─────────────
  const unitGroups = useMemo(() => {
    if (!isUnits) return [];
    const m = new Map();
    for (const r of dataRows) {
      const name = (r.unit_name || '').trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (!m.has(key)) m.set(key, { name, key, unitRow: null, roomRows: [], existing: existingUnits.names.has(key) });
      const g = m.get(key);
      if ((r.room_name || '').trim()) g.roomRows.push(r);
      else if (!g.unitRow) g.unitRow = r;
    }
    return [...m.values()];
  }, [isUnits, dataRows, existingUnits]);

  const unitConflicts = useMemo(() => {
    if (!isUnits) return [];
    const CMP = ['price_per_night', 'type', 'amenities', 'description', 'access_method', 'access_code', 'arrival_instructions', 'staffed_checkin_available'];
    const firstByKey = new Map();
    const out = [];
    for (const r of dataRows) {
      if (r._errors.length) continue;
      const name = (r.unit_name || '').trim();
      if (!name || (r.room_name || '').trim()) continue;   // unit-defining rows only
      const key = name.toLowerCase();
      if (existingUnits.names.has(key)) continue;
      const vals = Object.fromEntries(CMP.map((f) => [f, (r[f] || '').trim().toLowerCase()]));
      if (!firstByKey.has(key)) { firstByKey.set(key, { vals, name }); continue; }
      const first = firstByKey.get(key);
      const diff = CMP.filter((f) => vals[f] && vals[f] !== first.vals[f]);
      if (diff.length) out.push(t('importRoomsUnitConflict')(first.name, r._row, diff.join(', ')));
    }
    return [...new Set(out)];
  }, [isUnits, dataRows, existingUnits, t]);

  // ── Categories mode: group rows by resolved category ───────────────────────
  const groups = useMemo(() => {
    if (!isCat) return [];
    const m = new Map();
    for (const r of dataRows) {
      const name = (r.category || '').trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (!m.has(key)) m.set(key, { name, key, rows: [] });
      m.get(key).rows.push(r);
    }
    return [...m.values()].map((g) => ({ ...g, existing: existingCatNames.has(g.key) }));
  }, [isCat, dataRows, existingCatNames]);

  const categoryConflicts = useMemo(() => {
    if (!isCat) return [];
    const firstByKey = new Map();
    const out = [];
    for (const r of dataRows) {
      if (r._errors.length) continue;
      const name = (r.category || '').trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (existingCatNames.has(key)) continue; // detail only applies to new categories
      const amen = (r.category_amenities || '').trim();
      const desc = (r.category_description || '').trim();
      if (!firstByKey.has(key)) { firstByKey.set(key, { amen, desc, name }); continue; }
      const first = firstByKey.get(key);
      // A later row is allowed to leave the detail columns blank — only a
      // non-empty value that differs from the first row's is a conflict.
      if ((amen && amen !== first.amen) || (desc && desc !== first.desc)) {
        out.push(t('importRoomsCatConflict')(first.name, r._row));
      }
    }
    return [...new Set(out)];
  }, [isCat, dataRows, existingCatNames, t]);

  const priceNotes = useMemo(() => {
    if (!isCat) return [];
    const out = [];
    for (const g of groups) {
      const prices = g.rows
        .filter((r) => r._errors.length === 0 && !r._overLimit)
        .map((r) => parsePrice(r.price_per_night))
        .filter((p) => Number.isFinite(p) && p > 0);
      if (prices.length < 2) continue;
      const min = Math.min(...prices), max = Math.max(...prices);
      if (max > min && (max - min) / min >= PRICE_VARIANCE_THRESHOLD) {
        out.push(t('importRoomsPriceNote')(g.name, currencySymbol, min.toFixed(0), max.toFixed(0)));
      }
    }
    return out;
  }, [isCat, groups, currencySymbol, t]);

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileError(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      let rows;
      try {
        rows = parseCsv(ev.target.result);
      } catch {
        setFileError(t('importRoomsErrorParse'));
        return;
      }
      if (rows.length < 2) { setFileError(t('importRoomsErrorEmpty')); return; }
      if (rows.length > 501) { setFileError(t('importRoomsErrorTooLarge')); return; }

      const headers = rows[0].map((h) => h.trim().toLowerCase().replace(/[\s-]/g, '_'));
      const objects = rows.slice(1).map((row, i) => {
        const obj = Object.fromEntries(TEMPLATE_COLS.map((col) => {
          const idx = headers.indexOf(col);
          return [col, idx !== -1 ? (row[idx] ?? '').trim() : ''];
        }));

        const errors = [], warnings = [];

        if (isCat) {
          if (!obj.category) errors.push(t('importRoomsRowNoCategory'));
          if (!obj.room_name) errors.push(t('importRoomsRowNoRoomName'));
        } else if (isWP) {
          if (!obj.section_name) errors.push(t('importRoomsRowNoSection'));
          const type = obj.type.toLowerCase();
          if (type && !WP_ROOM_TYPES.includes(type)) warnings.push('type: ' + t('importRoomsWpBadType')(obj.type));
        } else if (isUnits) {
          const roomRow = !!obj.room_name;
          if (!obj.unit_name) errors.push(t('importRoomsRowNoUnit'));
          const type = obj.type.toLowerCase();
          if (roomRow) {
            if (type && !WP_ROOM_TYPES.includes(type)) warnings.push('type: ' + t('importRoomsUnitRoomBadType')(obj.type));
            const stray = ['price_per_night', 'access_method', 'access_code', 'arrival_instructions', 'staffed_checkin_available']
              .filter((f) => (obj[f] || '').trim());
            if (stray.length) warnings.push('stray: ' + t('importRoomsUnitStray')(stray.join(', '), obj.room_name));
          } else {
            const price = parsePrice(obj.price_per_night);
            if (!Number.isFinite(price) || price < 0) errors.push(t('importRoomsRowBadPrice'));
            if (type && !UNIT_TYPES.includes(type)) warnings.push('type: ' + t('importRoomsUnitBadType')(obj.type));
            const am = obj.access_method.toLowerCase();
            if (am && !UNIT_ACCESS_METHODS.includes(am)) warnings.push('access: ' + t('importRoomsUnitBadAccess')(obj.access_method));
          }
        } else {
          if (!obj.name) errors.push(t('importRoomsRowNoName'));
          const type = obj.type.toLowerCase();
          if (type && !ROOM_TYPES.includes(type)) warnings.push('type: ' + t('importRoomsRowBadType')(obj.type));
        }

        // Named / Categories carry a price + bed_config; WP and Units don't
        // (Units handles its own price above, on unit rows only).
        if (!isWP && !isUnits) {
          const price = parsePrice(obj.price_per_night);
          if (!Number.isFinite(price) || price < 0) errors.push(t('importRoomsRowBadPrice'));

          const bed = parseBedConfigCell(obj.bed_config);
          if (bed.warning) warnings.push('bed: ' + bed.warning);
        }

        (isUnits ? [obj.photo_url] : PHOTO_COLS.map((c) => obj[c]))
          .filter(Boolean)
          .forEach((u) => {
            if (!/^https?:\/\/.+/i.test(u)) warnings.push('photo: ' + t('importRoomsRowBadUrl')(u));
            else if (!IMAGE_EXT_RE.test(u)) warnings.push('photo: ' + t('importRoomsRowNotDirectImage')(u));
          });

        return { ...obj, _row: i + 2, _errors: errors, _warnings: warnings, _overLimit: false, _limitKind: null };
      });

      // Free-plan pre-check (advisory — server is authoritative). Named / WP /
      // Categories share the flat 5-room cap; Units has its own two caps below.
      if (plan === 'free' && !isUnits) {
        let running = currentRoomCount;
        for (const o of objects) {
          if (o._errors.length > 0) continue;
          if (running >= FREE_ROOM_LIMIT) o._overLimit = true;
          else running += 1;
        }
      }

      if (isUnits) {
        // Which new units exceed the Free unit cap?
        const overLimitUnitKeys = new Set();
        if (plan === 'free') {
          let running = existingUnits.names.size;
          const seen = new Set();
          for (const o of objects) {
            if (o._errors.length) continue;
            const key = (o.unit_name || '').trim().toLowerCase();
            if (!key || (o.room_name || '').trim()) continue;   // unit-defining rows only
            if (existingUnits.names.has(key) || seen.has(key)) continue;
            if (running >= FREE_UNIT_LIMIT) overLimitUnitKeys.add(key);
            else { running += 1; seen.add(key); }
          }
        }
        // Per-unit internal-room cap (all plans).
        const perUnit = new Map(existingUnits.roomCountByKey);
        for (const o of objects) {
          if (o._errors.length) continue;
          const key = (o.unit_name || '').trim().toLowerCase();
          if (!key) continue;
          const roomRow = !!(o.room_name || '').trim();
          if (overLimitUnitKeys.has(key)) { o._overLimit = true; o._limitKind = 'unit'; continue; }
          if (!roomRow) continue;
          const cur = perUnit.get(key) ?? 0;
          if (cur >= ROOMS_PER_UNIT_LIMIT) { o._overLimit = true; o._limitKind = 'room'; }
          else perUnit.set(key, cur + 1);
        }
      }

      setDataRows(objects);
      setStep(3);
    };
    reader.readAsText(file, 'UTF-8');
  };

  const handleImport = async () => {
    setSubmitting(true);
    setFileError(null);
    try {
      const payload = validRows.map(({ _row, _errors, _warnings, _overLimit, ...rest }) => rest);
      const res  = await apiFetch(endpoint, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ property_id: propertyId, rows: payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResult(data);
      setStep(4);
    } catch (err) {
      setFileError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const title = isCat ? t('importRoomsCatTitle') : isWP ? t('importRoomsWpTitle')
    : isUnits ? t('importRoomsUnitTitle') : t('importRoomsTitle');
  const stepLabels = [t('importRoomsStepInstr'), t('importRoomsStepUpload'), t('importRoomsStepPreview')];
  const previewRows = dataRows.slice(0, 8);

  return (
    <div className="modal-overlay" onClick={handleBackdropClick}>
      <div className="modal" role="dialog" aria-label={title} style={{ maxWidth: 660 }}>

        <div className="modal-header">
          <h2>{title}</h2>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">

          {step < 4 && (
            <div className="import-steps">
              {stepLabels.map((label, i) => (
                <div key={i} className={`import-step${step === i + 1 ? ' active' : step > i + 1 ? ' done' : ''}`}>
                  <div className="import-step-num">{step > i + 1 ? '✓' : i + 1}</div>
                  <div className="import-step-label">{label}</div>
                </div>
              ))}
            </div>
          )}

          {/* ── Step 1: Instructions + template ──────────────────────────── */}
          {step === 1 && (
            <div className="import-step-body">
              <p style={{ color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.6 }}>
                {isCat ? t('importRoomsCatIntro') : isWP ? t('importRoomsWpIntro')
                  : isUnits ? t('importRoomsUnitIntro') : t('importRoomsIntro')}
              </p>

              <div style={{ marginBottom: 20, border: '1px solid var(--border)', borderRadius: 8 }}>
                <button
                  type="button"
                  onClick={() => setHowToOpen((o) => !o)}
                  style={{
                    width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer',
                    fontWeight: 600, fontSize: '0.9rem', color: 'var(--text)',
                  }}
                >
                  {t('importRoomsHowTo')}
                  {howToOpen ? <ChevronUpIcon size={16} /> : <ChevronDownIcon size={16} />}
                </button>
                {howToOpen && (
                  <div style={{ padding: '0 14px 14px', fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.7 }}>
                    {isCat ? (
                      <>
                        <p style={{ marginBottom: 8, marginTop: 4 }}>{t('importRoomsCatHelpColumns')}</p>
                        <p style={{ marginBottom: 8 }}><strong>category</strong> — {t('importRoomsCatHelpGrouping')}</p>
                        <p style={{ marginBottom: 8 }}><strong>category_amenities / category_description</strong> — {t('importRoomsCatHelpDetail')}</p>
                        <p style={{ margin: 0 }}><strong>bed_config</strong> — {t('importRoomsHelpBeds')}</p>
                      </>
                    ) : isWP ? (
                      <>
                        <p style={{ marginBottom: 8, marginTop: 4 }}>{t('importRoomsWpHelpColumns')}</p>
                        <p style={{ marginBottom: 8 }}><strong>type</strong> — {t('importRoomsWpHelpTypes')}</p>
                        <p style={{ marginBottom: 8 }}><strong>capacity</strong> — {t('importRoomsWpHelpCapacity')}</p>
                        <p style={{ margin: 0 }}><strong>photo_url_1/2/3</strong> — {t('importRoomsHelpPhotos')}</p>
                      </>
                    ) : isUnits ? (
                      <>
                        <p style={{ marginBottom: 8, marginTop: 4 }}>{t('importRoomsUnitHelpColumns')}</p>
                        <p style={{ marginBottom: 8 }}><strong>room_name</strong> — {t('importRoomsUnitHelpRows')}</p>
                        <p style={{ marginBottom: 8 }}><strong>access_method / access_code / arrival_instructions / staffed_checkin_available</strong> — {t('importRoomsUnitHelpAccess')}</p>
                        <p style={{ margin: 0 }}><strong>photo_url</strong> — {t('importRoomsUnitHelpPhoto')}</p>
                      </>
                    ) : (
                      <>
                        <p style={{ marginBottom: 8, marginTop: 4 }}>{t('importRoomsHelpColumns')}</p>
                        <p style={{ marginBottom: 8 }}><strong>bed_config</strong> — {t('importRoomsHelpBeds')}</p>
                        <p style={{ marginBottom: 8 }}><strong>amenities</strong> — {t('importRoomsHelpAmenities')}</p>
                        <p style={{ margin: 0 }}><strong>photo_url_1/2/3</strong> — {t('importRoomsHelpPhotos')}</p>
                      </>
                    )}
                  </div>
                )}
              </div>

              <button className="btn-secondary" onClick={() => downloadBlob(TEMPLATE_CSV, templateName)}>
                <DownloadIcon size={14} style={{ marginRight: 6 }} />
                {t('importRoomsTemplate')}
              </button>

              <p style={{ marginTop: 12, fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                {t('importRoomsTemplateHint')}
              </p>
              {isCat && (
                <p style={{ marginTop: 4, fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  <strong>category</strong> — {t('importRoomsCatHint')}
                </p>
              )}
              {isWP && (
                <p style={{ marginTop: 4, fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  <strong>type</strong> — {t('importRoomsWpHint')}
                </p>
              )}
              {isUnits && (
                <p style={{ marginTop: 4, fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  <strong>unit_name / room_name</strong> — {t('importRoomsUnitHint')}
                </p>
              )}
              {!isWP && !isUnits && (
                <p style={{ marginTop: 4, fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  <strong>bed_config</strong> — {t('importRoomsBedHint')}
                </p>
              )}
              <p style={{ marginTop: 4, fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                <strong>{isUnits ? 'photo_url' : 'photo_url_1 / 2 / 3'}</strong> — {t('importRoomsPhotoDirectHint')}
              </p>
              {plan === 'free' && (
                <p style={{ marginTop: 4, fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.5, fontStyle: 'italic' }}>
                  {isUnits
                    ? t('importRoomsUnitFreeHint')(FREE_UNIT_LIMIT, existingUnits.names.size, ROOMS_PER_UNIT_LIMIT)
                    : t('importRoomsFreeHint')(FREE_ROOM_LIMIT, currentRoomCount)}
                </p>
              )}
            </div>
          )}

          {/* ── Step 2: Upload ────────────────────────────────────────────── */}
          {step === 2 && (
            <div className="import-step-body">
              <p style={{ color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.6 }}>
                {t('importRoomsUpload')}
              </p>
              <div
                className="import-dropzone"
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files[0];
                  if (f) handleFile({ target: { files: [f] } });
                }}
              >
                <div style={{ fontSize: '2rem', marginBottom: 8 }}>📁</div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{t('importDropzone')}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>CSV · max 500 rows</div>
              </div>
              <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={handleFile} />
              {fileError && <div className="form-error" style={{ marginTop: 12 }}>{fileError}</div>}
            </div>
          )}

          {/* ── Step 3: Preview + validation ──────────────────────────────── */}
          {step === 3 && (
            <div className="import-step-body">
              <p style={{ color: 'var(--text-muted)', marginBottom: 12, fontSize: '0.85rem' }}>
                {t('importRoomsPreviewHead')(dataRows.length, importable.length)}
              </p>

              {isCat ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {groups.map((g) => (
                    <div key={g.key} style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
                      <div style={{
                        padding: '8px 12px', background: 'var(--page-bg, #f8fafc)',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        fontWeight: 700, fontSize: '0.85rem',
                      }}>
                        <span>{g.name} ({g.rows.length})</span>
                        <span style={{
                          fontWeight: 600, fontSize: '0.72rem', padding: '2px 8px', borderRadius: 99,
                          background: g.existing ? '#e0e7ff' : '#dcfce7',
                          color: g.existing ? '#3730a3' : '#166534',
                        }}>
                          {g.existing ? t('importRoomsCatExisting') : t('importRoomsCatNew')}
                        </span>
                      </div>
                      <div style={{ overflowX: 'auto' }}>
                        <table className="import-preview-table">
                          <thead>
                            <tr>
                              <th>{t('importRoomsColRoomName')}</th>
                              <th>{t('importRoomsColPrice')}</th>
                              <th>{t('importRoomsColCapacity')}</th>
                              <th>{t('importRoomsColBeds')}</th>
                              <th>{t('importRoomsColPhotos')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {g.rows.slice(0, 6).map((row, i) => {
                              const bad = row._errors.length > 0;
                              return (
                                <tr key={i} style={{
                                  background: bad ? '#fef2f2' : row._overLimit ? '#fffbeb' : undefined,
                                  color: bad ? '#b91c1c' : undefined,
                                }}>
                                  <td>{row.room_name || <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                                  <td>{row.price_per_night || <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                                  <td>{row.capacity || '2'}</td>
                                  <td>{row.bed_config || <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                                  <td>{PHOTO_COLS.map((c) => row[c]).filter(Boolean).length || <span style={{ color: '#cbd5e1' }}>0</span>}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      {g.rows.length > 6 && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', padding: '4px 12px 8px' }}>
                          {t('importMoreRows')(g.rows.length - 6)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : isUnits ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {unitGroups.map((g) => {
                    const price = g.unitRow?.price_per_night;
                    return (
                      <div key={g.key} style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
                        <div style={{
                          padding: '8px 12px', background: 'var(--page-bg, #f8fafc)',
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          fontWeight: 700, fontSize: '0.85rem',
                        }}>
                          <span>
                            {g.name}{' '}
                            <span style={{ fontWeight: 500, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              ({g.roomRows.length} {t('importRoomsUnitRoomsWord')(g.roomRows.length)})
                            </span>
                          </span>
                          {price
                            ? <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{currencySymbol}{price}<span style={{ fontWeight: 500, color: 'var(--text-muted)' }}> {t('perNight')}</span></span>
                            : !g.existing && <span style={{ fontWeight: 600, fontSize: '0.72rem', color: '#b91c1c' }}>{t('importRoomsUnitNoRow')}</span>}
                        </div>
                        {g.roomRows.length > 0 && (
                          <div style={{ overflowX: 'auto' }}>
                            <table className="import-preview-table">
                              <thead>
                                <tr>
                                  <th>{t('importRoomsColRoomName')}</th>
                                  <th>{t('importRoomsColType')}</th>
                                  <th>{t('importRoomsColCapacity')}</th>
                                  <th>{t('importRoomsColPhotos')}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {g.roomRows.slice(0, 6).map((row, i) => {
                                  const bad = row._errors.length > 0;
                                  return (
                                    <tr key={i} style={{
                                      background: bad ? '#fef2f2' : row._overLimit ? '#fffbeb' : undefined,
                                      color: bad ? '#b91c1c' : undefined,
                                    }}>
                                      <td>{row.room_name || <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                                      <td>{(row.type || 'other').toLowerCase()}</td>
                                      <td>{row.capacity || '2'}</td>
                                      <td>{row.photo_url ? 1 : <span style={{ color: '#cbd5e1' }}>0</span>}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                        {g.roomRows.length > 6 && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', padding: '4px 12px 8px' }}>
                            {t('importMoreRows')(g.roomRows.length - 6)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : isWP ? (
                <div style={{ overflowX: 'auto' }}>
                  <table className="import-preview-table">
                    <thead>
                      <tr>
                        <th>{t('importRoomsColSection')}</th>
                        <th>{t('importRoomsColType')}</th>
                        <th>{t('importRoomsColSleeps')}</th>
                        <th>{t('importRoomsColPhotos')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row, i) => {
                        const bad = row._errors.length > 0;
                        return (
                          <tr key={i} style={{
                            background: bad ? '#fef2f2' : row._overLimit ? '#fffbeb' : undefined,
                            color: bad ? '#b91c1c' : undefined,
                          }}>
                            <td>{row.section_name || <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                            <td>{(row.type || 'other').toLowerCase()}</td>
                            <td>{row.capacity || '2'}</td>
                            <td>{PHOTO_COLS.map((c) => row[c]).filter(Boolean).length || <span style={{ color: '#cbd5e1' }}>0</span>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {dataRows.length > previewRows.length && (
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 8 }}>
                      {t('importMoreRows')(dataRows.length - previewRows.length)}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="import-preview-table">
                    <thead>
                      <tr>
                        <th>{t('importRoomsColName')}</th>
                        <th>{t('importRoomsColType')}</th>
                        <th>{t('importRoomsColPrice')}</th>
                        <th>{t('importRoomsColCapacity')}</th>
                        <th>{t('importRoomsColBeds')}</th>
                        <th>{t('importRoomsColPhotos')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row, i) => {
                        const bad = row._errors.length > 0;
                        return (
                          <tr key={i} style={{
                            background: bad ? '#fef2f2' : row._overLimit ? '#fffbeb' : undefined,
                            color: bad ? '#b91c1c' : undefined,
                          }}>
                            <td>{row.name || <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                            <td>{row.type || 'double'}</td>
                            <td>{row.price_per_night || <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                            <td>{row.capacity || '2'}</td>
                            <td>{row.bed_config || <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                            <td>{PHOTO_COLS.map((c) => row[c]).filter(Boolean).length || <span style={{ color: '#cbd5e1' }}>0</span>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {dataRows.length > previewRows.length && (
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 8 }}>
                      {t('importMoreRows')(dataRows.length - previewRows.length)}
                    </div>
                  )}
                </div>
              )}

              {/* Validation panel */}
              {(dataRows.some((r) => r._errors.length) || rowsOverLimit.length > 0 || rowsOverUnitLimit.length > 0
                || rowsOverRoomLimit.length > 0 || rowsWithTypeWarn.length > 0 || rowsWithAccessWarn.length > 0
                || rowsWithStrayWarn.length > 0 || rowsWithBedWarn.length > 0 || rowsWithUrlWarn.length > 0
                || categoryConflicts.length > 0 || unitConflicts.length > 0 || priceNotes.length > 0) && (
                <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {dataRows.some((r) => r._errors.length) && (
                    <ValidationBlock
                      tone="red"
                      title={t('importRoomsPanelErrors')}
                      lines={dataRows.filter((r) => r._errors.length).map((r) => `${t('importRoomsRowLabel')(r._row)}: ${r._errors.join('; ')}`)}
                    />
                  )}
                  {rowsOverLimit.length > 0 && (
                    <ValidationBlock
                      tone="amber"
                      title={t('importRoomsPanelOverLimit')}
                      lines={[t('importRoomsOverLimitBody')(FREE_ROOM_LIMIT, rowsOverLimit.map((r) => r._row).join(', '))]}
                    />
                  )}
                  {rowsOverUnitLimit.length > 0 && (
                    <ValidationBlock
                      tone="amber"
                      title={t('importRoomsPanelUnitOverLimit')}
                      lines={[t('importRoomsUnitOverLimitBody')(FREE_UNIT_LIMIT, [...new Set(rowsOverUnitLimit.map((r) => r._row))].join(', '))]}
                    />
                  )}
                  {rowsOverRoomLimit.length > 0 && (
                    <ValidationBlock
                      tone="amber"
                      title={t('importRoomsPanelRoomOverLimit')}
                      lines={[t('importRoomsRoomOverLimitBody')(ROOMS_PER_UNIT_LIMIT, rowsOverRoomLimit.map((r) => r._row).join(', '))]}
                    />
                  )}
                  {rowsWithTypeWarn.length > 0 && (
                    <ValidationBlock
                      tone="amber"
                      title={t('importRoomsPanelTypes')}
                      lines={rowsWithTypeWarn.map((r) => `${t('importRoomsRowLabel')(r._row)}: ${r._warnings.filter((w) => w.startsWith('type:')).map((w) => w.slice(5).trim()).join('; ')}`)}
                    />
                  )}
                  {rowsWithAccessWarn.length > 0 && (
                    <ValidationBlock
                      tone="amber"
                      title={t('importRoomsPanelAccess')}
                      lines={rowsWithAccessWarn.map((r) => `${t('importRoomsRowLabel')(r._row)}: ${r._warnings.filter((w) => w.startsWith('access:')).map((w) => w.slice(7).trim()).join('; ')}`)}
                    />
                  )}
                  {rowsWithStrayWarn.length > 0 && (
                    <ValidationBlock
                      tone="amber"
                      title={t('importRoomsPanelStray')}
                      lines={rowsWithStrayWarn.map((r) => `${t('importRoomsRowLabel')(r._row)}: ${r._warnings.filter((w) => w.startsWith('stray:')).map((w) => w.slice(6).trim()).join('; ')}`)}
                    />
                  )}
                  {unitConflicts.length > 0 && (
                    <ValidationBlock
                      tone="amber"
                      title={t('importRoomsPanelUnitConflicts')}
                      lines={unitConflicts}
                    />
                  )}
                  {categoryConflicts.length > 0 && (
                    <ValidationBlock
                      tone="amber"
                      title={t('importRoomsPanelCatConflicts')}
                      lines={categoryConflicts}
                    />
                  )}
                  {priceNotes.length > 0 && (
                    <ValidationBlock
                      tone="blue"
                      title={t('importRoomsPanelPriceNotes')}
                      lines={priceNotes}
                    />
                  )}
                  {rowsWithBedWarn.length > 0 && (
                    <ValidationBlock
                      tone="amber"
                      title={t('importRoomsPanelBeds')}
                      lines={rowsWithBedWarn.map((r) => `${t('importRoomsRowLabel')(r._row)}: ${r._warnings.filter((w) => w.startsWith('bed')).map((w) => w.slice(5)).join('; ')}`)}
                      hint={t('importRoomsBedHint')}
                    />
                  )}
                  {rowsWithUrlWarn.length > 0 && (
                    <ValidationBlock
                      tone="amber"
                      title={t('importRoomsPanelPhotos')}
                      lines={rowsWithUrlWarn.map((r) => `${t('importRoomsRowLabel')(r._row)}: ${r._warnings.filter((w) => w.startsWith('photo')).map((w) => w.slice(7)).join('; ')}`)}
                      hint={t('importRoomsPhotoDirectHint')}
                    />
                  )}
                </div>
              )}

              {fileError && <div className="form-error" style={{ marginTop: 12 }}>{fileError}</div>}
            </div>
          )}

          {/* ── Step 4: Result ───────────────────────────────────────────── */}
          {step === 4 && result && (
            <div className="import-step-body" style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ marginBottom: 12 }}>
                {result.imported > 0
                  ? <CircleCheckIcon size={48} color="var(--accent)" />
                  : <AlertTriangleIcon size={48} color="#f59e0b" />}
              </div>
              <div style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: 16 }}>
                {t('importRoomsDone')}
              </div>
              <div className="import-result-grid">
                {isUnits ? (
                  <>
                    <div className="import-result-item">
                      <span className="import-result-num" style={{ color: '#10b981' }}>{result.units_imported ?? 0}</span>
                      <span>{t('importRoomsResUnits')}</span>
                    </div>
                    <div className="import-result-item">
                      <span className="import-result-num" style={{ color: '#6366f1' }}>{result.rooms_imported ?? 0}</span>
                      <span>{t('importRoomsResRooms')}</span>
                    </div>
                  </>
                ) : (
                  <div className="import-result-item">
                    <span className="import-result-num" style={{ color: '#10b981' }}>{result.imported}</span>
                    <span>{isWP ? t('importRoomsResSections') : t('importRoomsResImported')}</span>
                  </div>
                )}
                {isCat && (
                  <div className="import-result-item">
                    <span className="import-result-num" style={{ color: '#6366f1' }}>{result.categories_created?.length ?? 0}</span>
                    <span>{t('importRoomsResCategories')}</span>
                  </div>
                )}
                <div className="import-result-item">
                  <span className="import-result-num" style={{ color: '#3b82f6' }}>{result.photos_attached ?? 0}</span>
                  <span>{t('importRoomsResPhotos')}</span>
                </div>
                <div className="import-result-item">
                  <span className="import-result-num" style={{ color: '#f59e0b' }}>
                    {isUnits ? ((result.units_skipped_limit ?? 0) + (result.rooms_skipped_limit ?? 0)) : (result.rooms_skipped_limit ?? 0)}
                  </span>
                  <span>{t('importRoomsResSkipped')}</span>
                </div>
              </div>

              {isCat && result.groups?.length > 0 && (
                <div style={{
                  marginTop: 16, padding: '10px 14px', borderRadius: 6, textAlign: 'left',
                  background: '#f8fafc', border: '1px solid var(--border)', fontSize: '0.82rem', lineHeight: 1.7,
                }}>
                  {result.groups.map((g, i) => (
                    <div key={i}><strong>{g.category}</strong> — {t('importRoomsGroupRooms')(g.room_count)}</div>
                  ))}
                </div>
              )}
              {isUnits && result.groups?.length > 0 && (
                <div style={{
                  marginTop: 16, padding: '10px 14px', borderRadius: 6, textAlign: 'left',
                  background: '#f8fafc', border: '1px solid var(--border)', fontSize: '0.82rem', lineHeight: 1.7,
                }}>
                  {result.groups.map((g, i) => (
                    <div key={i}>
                      <strong>{g.unit}</strong>
                      {g.price != null && <> — {result.currency_symbol ?? currencySymbol}{Number(g.price).toFixed(0)}</>}
                      {' · '}{t('importRoomsGroupRooms')(g.room_count)}
                    </div>
                  ))}
                </div>
              )}
              {isUnits && result.units_removed?.length > 0 && (
                <ResultBlock tone="amber">
                  {t('importRoomsUnitsRemoved')(result.units_removed.join(', '))}
                </ResultBlock>
              )}
              {result.limit_message && (
                <ResultBlock tone="amber">{result.limit_message}</ResultBlock>
              )}
              {result.category_warnings?.length > 0 && (
                <ResultBlock tone="amber">
                  {result.category_warnings.slice(0, 6).map((w, i) => <div key={i}>{w}</div>)}
                </ResultBlock>
              )}
              {result.unit_warnings?.length > 0 && (
                <ResultBlock tone="amber">
                  {result.unit_warnings.slice(0, 6).map((w, i) => <div key={i}>{w}</div>)}
                </ResultBlock>
              )}
              {result.price_notes?.length > 0 && (
                <ResultBlock tone="blue">
                  {result.price_notes.slice(0, 6).map((n, i) => <div key={i}>{n}</div>)}
                </ResultBlock>
              )}
              {result.photo_errors?.length > 0 && (
                <ResultBlock tone="orange">
                  <strong>{t('importRoomsResPhotoIssues')}</strong>
                  {result.photo_errors.slice(0, 6).map((e, i) => <div key={i}>{e}</div>)}
                  {result.photo_errors.length > 6 && <div>{t('importMoreRows')(result.photo_errors.length - 6)}</div>}
                </ResultBlock>
              )}
              {result.warnings?.length > 0 && (
                <ResultBlock tone="amber">
                  {result.warnings.slice(0, 6).map((w, i) => <div key={i}>{w}</div>)}
                  {result.warnings.length > 6 && <div>{t('importMoreRows')(result.warnings.length - 6)}</div>}
                </ResultBlock>
              )}
              {result.errors?.length > 0 && (
                <ResultBlock tone="red">
                  {result.errors.slice(0, 6).map((e, i) => <div key={i}>{e}</div>)}
                  {result.errors.length > 6 && <div>{t('importMoreRows')(result.errors.length - 6)}</div>}
                </ResultBlock>
              )}
            </div>
          )}
        </div>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <div className="modal-footer">
          {step < 4 && (
            <button type="button" className="btn-secondary" onClick={onClose}>{t('cancel')}</button>
          )}
          {step === 1 && (
            <button className="btn-primary" onClick={() => setStep(2)}>{t('importRoomsStepUpload')} →</button>
          )}
          {step === 2 && (
            <button className="btn-secondary" onClick={() => setStep(1)}>{t('back')}</button>
          )}
          {step === 3 && (
            <>
              <button className="btn-secondary" onClick={() => { setStep(2); setDataRows([]); }}>{t('back')}</button>
              <button
                className="btn-primary"
                disabled={submitting || importable.length === 0}
                onClick={handleImport}
              >
                {submitting ? t('importingBtn')
                  : isUnits ? t('importRoomsUnitImportBtn')(importable.length)
                  : t('importRoomsImportBtn')(importable.length)}
              </button>
            </>
          )}
          {step === 4 && (
            <button className="btn-primary" onClick={() => { onImported?.(); onClose(); }}>{t('done')}</button>
          )}
        </div>
      </div>
    </div>
  );
}

const TONES = {
  red:    { bg: '#fef2f2', border: '#fca5a5', color: '#b91c1c' },
  amber:  { bg: '#fffbeb', border: '#fcd34d', color: '#92400e' },
  orange: { bg: '#fff7ed', border: '#fdba74', color: '#c2410c' },
  blue:   { bg: '#eff6ff', border: '#93c5fd', color: '#1d4ed8' },
};

function ValidationBlock({ tone, title, lines, hint }) {
  const p = TONES[tone] ?? TONES.amber;
  return (
    <div style={{
      padding: '10px 14px', borderRadius: 6, textAlign: 'left',
      background: p.bg, border: `1px solid ${p.border}`, color: p.color,
      fontSize: '0.8rem', lineHeight: 1.6,
    }}>
      <strong style={{ display: 'block', marginBottom: 4 }}>{title}</strong>
      {lines.slice(0, 8).map((l, i) => <div key={i}>{l}</div>)}
      {lines.length > 8 && <div>…and {lines.length - 8} more</div>}
      {hint && <div style={{ marginTop: 6, opacity: 0.85, fontStyle: 'italic' }}>{hint}</div>}
    </div>
  );
}

function ResultBlock({ tone, children }) {
  const p = TONES[tone] ?? TONES.amber;
  return (
    <div style={{
      marginTop: 12, padding: '10px 14px', borderRadius: 6, textAlign: 'left',
      background: p.bg, border: `1px solid ${p.border}`, color: p.color,
      fontSize: '0.8rem', lineHeight: 1.6,
    }}>
      {children}
    </div>
  );
}
