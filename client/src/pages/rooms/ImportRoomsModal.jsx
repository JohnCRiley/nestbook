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
  const isCat = mode === 'categories';
  const isWP  = mode === 'whole_property';

  const TEMPLATE_COLS = isCat ? CAT_COLS : isWP ? WP_COLS : NAMED_COLS;
  const TEMPLATE_CSV  = buildTemplate(TEMPLATE_COLS, isCat ? CAT_ROWS : isWP ? WP_ROWS : NAMED_ROWS);
  const templateName  = isCat ? 'nestbook-room-categories-template.csv'
    : isWP ? 'nestbook-property-sections-template.csv' : 'nestbook-rooms-template.csv';
  const endpoint      = isCat ? '/api/rooms/bulk-import-categories'
    : isWP ? '/api/rooms/bulk-import-wp' : '/api/rooms/bulk-import';

  const [step,       setStep]       = useState(1);   // 1 instr · 2 upload · 3 preview · 4 result
  const [dataRows,   setDataRows]   = useState([]);
  const [result,     setResult]     = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [fileError,  setFileError]  = useState(null);
  const [howToOpen,  setHowToOpen]  = useState(false);
  const [existingCatNames, setExistingCatNames] = useState(() => new Set());

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
  const rowsOverLimit    = validRows.filter((r) => r._overLimit);

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
        } else {
          if (!obj.name) errors.push(t('importRoomsRowNoName'));
          const type = obj.type.toLowerCase();
          if (type && !ROOM_TYPES.includes(type)) warnings.push('type: ' + t('importRoomsRowBadType')(obj.type));
        }

        // WP sections carry no price and no bed_config.
        if (!isWP) {
          const price = parsePrice(obj.price_per_night);
          if (!Number.isFinite(price) || price < 0) errors.push(t('importRoomsRowBadPrice'));

          const bed = parseBedConfigCell(obj.bed_config);
          if (bed.warning) warnings.push('bed: ' + bed.warning);
        }

        PHOTO_COLS.map((c) => obj[c])
          .filter(Boolean)
          .forEach((u) => {
            if (!/^https?:\/\/.+/i.test(u)) warnings.push('photo: ' + t('importRoomsRowBadUrl')(u));
            else if (!IMAGE_EXT_RE.test(u)) warnings.push('photo: ' + t('importRoomsRowNotDirectImage')(u));
          });

        return { ...obj, _row: i + 2, _errors: errors, _warnings: warnings, _overLimit: false };
      });

      // Free-plan pre-check (advisory — server is authoritative).
      if (plan === 'free') {
        let running = currentRoomCount;
        for (const o of objects) {
          if (o._errors.length > 0) continue;
          if (running >= FREE_ROOM_LIMIT) o._overLimit = true;
          else running += 1;
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

  const title = isCat ? t('importRoomsCatTitle') : isWP ? t('importRoomsWpTitle') : t('importRoomsTitle');
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
                {isCat ? t('importRoomsCatIntro') : isWP ? t('importRoomsWpIntro') : t('importRoomsIntro')}
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
              {!isWP && (
                <p style={{ marginTop: 4, fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  <strong>bed_config</strong> — {t('importRoomsBedHint')}
                </p>
              )}
              <p style={{ marginTop: 4, fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                <strong>photo_url_1 / 2 / 3</strong> — {t('importRoomsPhotoDirectHint')}
              </p>
              {plan === 'free' && (
                <p style={{ marginTop: 4, fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.5, fontStyle: 'italic' }}>
                  {t('importRoomsFreeHint')(FREE_ROOM_LIMIT, currentRoomCount)}
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
              {(dataRows.some((r) => r._errors.length) || rowsOverLimit.length > 0 || rowsWithTypeWarn.length > 0
                || rowsWithBedWarn.length > 0 || rowsWithUrlWarn.length > 0 || categoryConflicts.length > 0
                || priceNotes.length > 0) && (
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
                  {rowsWithTypeWarn.length > 0 && (
                    <ValidationBlock
                      tone="amber"
                      title={t('importRoomsPanelTypes')}
                      lines={rowsWithTypeWarn.map((r) => `${t('importRoomsRowLabel')(r._row)}: ${r._warnings.filter((w) => w.startsWith('type:')).map((w) => w.slice(5).trim()).join('; ')}`)}
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
                <div className="import-result-item">
                  <span className="import-result-num" style={{ color: '#10b981' }}>{result.imported}</span>
                  <span>{isWP ? t('importRoomsResSections') : t('importRoomsResImported')}</span>
                </div>
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
                  <span className="import-result-num" style={{ color: '#f59e0b' }}>{result.rooms_skipped_limit ?? 0}</span>
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
              {result.limit_message && (
                <ResultBlock tone="amber">{result.limit_message}</ResultBlock>
              )}
              {result.category_warnings?.length > 0 && (
                <ResultBlock tone="amber">
                  {result.category_warnings.slice(0, 6).map((w, i) => <div key={i}>{w}</div>)}
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
                {submitting ? t('importingBtn') : t('importRoomsImportBtn')(importable.length)}
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
