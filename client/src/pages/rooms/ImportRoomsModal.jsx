import { useState, useRef, useEffect } from 'react';
import { apiFetch } from '../../utils/apiFetch.js';
import { useT } from '../../i18n/LocaleContext.jsx';
import { parseCsv } from '../../utils/csvParser.js';
import { BED_TYPES } from '../../utils/bedTypes.js';
import { ChevronUpIcon, ChevronDownIcon, DownloadIcon, CircleCheckIcon, AlertTriangleIcon } from '../../components/TablerIcons.jsx';

// Named Rooms mode only. Kept in sync with server IMPORT_ROOM_TYPES / rooms.js.
const ROOM_TYPES = ['single', 'double', 'twin', 'suite', 'apartment', 'other'];
const FREE_ROOM_LIMIT = 5;

// A photo_url should point straight at an image file, not at a webpage that
// shows one. Query strings (?w=800&auto=compress) are fine — CDNs add them.
const IMAGE_EXT_RE = /\.(jpe?g|png|webp|gif|avif|bmp|tiff?|heic)(\?|#|$)/i;

// The template always offers the Multi plan's max (10) photo columns. Free/Pro
// accounts can leave the extras blank — the server's per-plan cap (PHOTO_LIMITS
// in roomPhotos.js) stops attaching once the plan limit is reached and flags
// the rest, so extra columns are harmless.
const MAX_PHOTO_COLS = 10;
const PHOTO_COLS = Array.from({ length: MAX_PHOTO_COLS }, (_, i) => `photo_url_${i + 1}`);

const TEMPLATE_COLS = [
  'name', 'type', 'price_per_night', 'capacity', 'max_occupancy',
  'amenities', 'description', 'bed_config', ...PHOTO_COLS,
];

const TEMPLATE_ROWS = [
  ['La Suite Lavande', 'suite', '145', '2', '3', '"wifi,ensuite,balcony,minibar"', 'Top-floor suite with valley views', 'king:1;sofa_bed:1'],
  ['Chambre Mistral', 'twin', '95', '2', '', '"wifi,ensuite"', 'Cosy twin with garden view', 'single:2'],
  ['Chambre Olivier', 'single', '70', '1', '', 'wifi', 'Compact single', 'single:1'],
];

const TEMPLATE_CSV =
  TEMPLATE_COLS.join(',') + '\n' +
  TEMPLATE_ROWS.map((r) => [...r, ...Array(MAX_PHOTO_COLS).fill('')].join(',')).join('\n') + '\n';

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
// Any invalid entry discards the whole cell (mirrors the server).
// Bed types are matched case-insensitively — CSV editors love to
// auto-capitalise, so "King:1" and "king:1" are treated the same.
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

export default function ImportRoomsModal({ onClose, onImported, propertyId, currentRoomCount = 0, plan = 'free' }) {
  const t = useT();
  const fileRef = useRef(null);

  const [step,       setStep]       = useState(1);   // 1 instr · 2 upload · 3 preview · 4 result
  const [dataRows,   setDataRows]   = useState([]);  // [{ ...cols, _row, _errors[], _warnings[], _overLimit }]
  const [result,     setResult]     = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [fileError,  setFileError]  = useState(null);
  const [howToOpen,  setHowToOpen]  = useState(false);

  const hasData = dataRows.length > 0;

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

  const validRows   = dataRows.filter((r) => r._errors.length === 0);
  const importable   = validRows.filter((r) => !r._overLimit);
  const rowsWithBedWarn = dataRows.filter((r) => r._warnings.some((w) => w.startsWith('bed')));
  const rowsWithUrlWarn = dataRows.filter((r) => r._warnings.some((w) => w.startsWith('photo')));
  const rowsOverLimit   = validRows.filter((r) => r._overLimit);

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
        if (!obj.name) errors.push(t('importRoomsRowNoName'));

        const price = parseFloat(String(obj.price_per_night).replace(/[£$€¥,\s]/g, ''));
        if (!Number.isFinite(price) || price < 0) errors.push(t('importRoomsRowBadPrice'));

        const type = obj.type.toLowerCase();
        if (type && !ROOM_TYPES.includes(type)) warnings.push(t('importRoomsRowBadType')(obj.type));

        const bed = parseBedConfigCell(obj.bed_config);
        if (bed.warning) warnings.push('bed: ' + bed.warning);

        PHOTO_COLS.map((c) => obj[c])
          .filter(Boolean)
          .forEach((u) => {
            if (!/^https?:\/\/.+/i.test(u)) warnings.push('photo: ' + t('importRoomsRowBadUrl')(u));
            else if (!IMAGE_EXT_RE.test(u)) warnings.push('photo: ' + t('importRoomsRowNotDirectImage')(u));
          });

        return { ...obj, _row: i + 2, _errors: errors, _warnings: warnings, _overLimit: false };
      });

      // Free-plan pre-check (advisory — server is authoritative). Rooms already
      // on the property + valid rows so far. Rows past the cap are flagged.
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
      // Send only rows that passed hard validation; strip helper fields.
      const payload = validRows.map(({ _row, _errors, _warnings, _overLimit, ...rest }) => rest);
      const res  = await apiFetch('/api/rooms/bulk-import', {
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

  const stepLabels = [t('importRoomsStepInstr'), t('importRoomsStepUpload'), t('importRoomsStepPreview')];

  const previewRows = dataRows.slice(0, 8);

  return (
    <div className="modal-overlay" onClick={handleBackdropClick}>
      <div className="modal" role="dialog" aria-label={t('importRoomsTitle')} style={{ maxWidth: 640 }}>

        <div className="modal-header">
          <h2>{t('importRoomsTitle')}</h2>
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
                {t('importRoomsIntro')}
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
                    <p style={{ marginBottom: 8, marginTop: 4 }}>{t('importRoomsHelpColumns')}</p>
                    <p style={{ marginBottom: 8 }}><strong>bed_config</strong> — {t('importRoomsHelpBeds')}</p>
                    <p style={{ marginBottom: 8 }}><strong>amenities</strong> — {t('importRoomsHelpAmenities')}</p>
                    <p style={{ margin: 0 }}><strong>photo_url_1/2/3</strong> — {t('importRoomsHelpPhotos')}</p>
                  </div>
                )}
              </div>

              <button className="btn-secondary" onClick={() => downloadBlob(TEMPLATE_CSV, 'nestbook-rooms-template.csv')}>
                <DownloadIcon size={14} style={{ marginRight: 6 }} />
                {t('importRoomsTemplate')}
              </button>

              <p style={{ marginTop: 12, fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                {t('importRoomsTemplateHint')}
              </p>
              <p style={{ marginTop: 4, fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                <strong>bed_config</strong> — {t('importRoomsBedHint')}
              </p>
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
                      const warn = row._warnings.length > 0 || row._overLimit;
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
              </div>
              {dataRows.length > previewRows.length && (
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 8 }}>
                  {t('importMoreRows')(dataRows.length - previewRows.length)}
                </div>
              )}

              {/* Validation panel */}
              {(dataRows.some((r) => r._errors.length) || rowsWithBedWarn.length > 0 || rowsWithUrlWarn.length > 0 || rowsOverLimit.length > 0) && (
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
                  <span>{t('importRoomsResImported')}</span>
                </div>
                <div className="import-result-item">
                  <span className="import-result-num" style={{ color: '#3b82f6' }}>{result.photos_attached ?? 0}</span>
                  <span>{t('importRoomsResPhotos')}</span>
                </div>
                <div className="import-result-item">
                  <span className="import-result-num" style={{ color: '#f59e0b' }}>{result.rooms_skipped_limit ?? 0}</span>
                  <span>{t('importRoomsResSkipped')}</span>
                </div>
              </div>

              {result.limit_message && (
                <div style={{
                  marginTop: 16, padding: '10px 14px', borderRadius: 6, textAlign: 'left',
                  background: '#fffbeb', border: '1px solid #fcd34d', color: '#92400e', fontSize: '0.82rem', lineHeight: 1.6,
                }}>
                  {result.limit_message}
                </div>
              )}
              {result.photo_errors?.length > 0 && (
                <div style={{
                  marginTop: 12, padding: '10px 14px', borderRadius: 6, textAlign: 'left',
                  background: '#fff7ed', border: '1px solid #fdba74', color: '#c2410c', fontSize: '0.8rem', lineHeight: 1.6,
                }}>
                  <strong>{t('importRoomsResPhotoIssues')}</strong>
                  {result.photo_errors.slice(0, 6).map((e, i) => <div key={i}>{e}</div>)}
                  {result.photo_errors.length > 6 && <div>{t('importMoreRows')(result.photo_errors.length - 6)}</div>}
                </div>
              )}
              {result.warnings?.length > 0 && (
                <div style={{
                  marginTop: 12, padding: '10px 14px', borderRadius: 6, textAlign: 'left',
                  background: '#fffbeb', border: '1px solid #fcd34d', color: '#92400e', fontSize: '0.8rem', lineHeight: 1.6,
                }}>
                  {result.warnings.slice(0, 6).map((w, i) => <div key={i}>{w}</div>)}
                  {result.warnings.length > 6 && <div>{t('importMoreRows')(result.warnings.length - 6)}</div>}
                </div>
              )}
              {result.errors?.length > 0 && (
                <div style={{
                  marginTop: 12, padding: '10px 14px', borderRadius: 6, textAlign: 'left',
                  background: '#fef2f2', border: '1px solid #fca5a5', color: '#b91c1c', fontSize: '0.8rem', lineHeight: 1.6,
                }}>
                  {result.errors.slice(0, 6).map((e, i) => <div key={i}>{e}</div>)}
                  {result.errors.length > 6 && <div>{t('importMoreRows')(result.errors.length - 6)}</div>}
                </div>
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

function ValidationBlock({ tone, title, lines, hint }) {
  const palette = tone === 'red'
    ? { bg: '#fef2f2', border: '#fca5a5', color: '#b91c1c' }
    : { bg: '#fffbeb', border: '#fcd34d', color: '#92400e' };
  return (
    <div style={{
      padding: '10px 14px', borderRadius: 6, textAlign: 'left',
      background: palette.bg, border: `1px solid ${palette.border}`, color: palette.color,
      fontSize: '0.8rem', lineHeight: 1.6,
    }}>
      <strong style={{ display: 'block', marginBottom: 4 }}>{title}</strong>
      {lines.slice(0, 8).map((l, i) => <div key={i}>{l}</div>)}
      {lines.length > 8 && <div>…and {lines.length - 8} more</div>}
      {hint && <div style={{ marginTop: 6, opacity: 0.85, fontStyle: 'italic' }}>{hint}</div>}
    </div>
  );
}
