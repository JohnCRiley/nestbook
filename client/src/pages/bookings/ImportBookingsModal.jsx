import { useState, useRef, useEffect } from 'react';
import { apiFetch } from '../../utils/apiFetch.js';
import { useT, useLocale } from '../../i18n/LocaleContext.jsx';

const TEMPLATE_CSV =
  'guest_name,guest_email,guest_phone,check_in,check_out,room,total_amount,status,notes\n' +
  'Marie Dupont,marie.dupont@example.com,+33612345678,2025-07-01,2025-07-05,Garden Room,320,confirmed,Early check-in requested\n' +
  'John Smith,john.smith@example.com,+44771234567,2025-08-10,2025-08-14,Suite,480,confirmed,\n';

// ── Pure JS CSV parser (same as ImportGuestsModal) ────────────────────────
function parseCSV(text) {
  text = text.replace(/^﻿/, ''); // strip BOM
  const firstLine = text.split(/\r?\n/)[0] ?? '';
  const delim = (firstLine.split(';').length > firstLine.split(',').length) ? ';' : ',';
  const rows = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    const cols = [];
    let i = 0;
    while (i < line.length) {
      if (line[i] === '"') {
        let field = ''; i++;
        while (i < line.length) {
          if (line[i] === '"' && line[i + 1] === '"') { field += '"'; i += 2; }
          else if (line[i] === '"') { i++; break; }
          else field += line[i++];
        }
        cols.push(field);
      } else {
        let field = '';
        while (i < line.length && line[i] !== delim) field += line[i++];
        cols.push(field.trim());
      }
      if (i < line.length && line[i] === delim) i++;
    }
    rows.push(cols);
  }
  return rows;
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

const COLS = ['guest_name','guest_email','guest_phone','check_in','check_out','room','total_amount','status','notes'];

export default function ImportBookingsModal({ onClose, onImported, propertyId }) {
  const t = useT();
  const fileRef = useRef(null);

  const [step,       setStep]       = useState(1);
  const [dataRows,   setDataRows]   = useState([]);   // parsed CSV data rows (objects)
  const [roomMap,    setRoomMap]    = useState({});   // { csvRoomName: roomId | 'skip' }
  const [rooms,      setRooms]      = useState([]);   // NestBook rooms for property
  const [result,     setResult]     = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [fileError,  setFileError]  = useState(null);
  const [howToOpen,  setHowToOpen]  = useState(false);

  // hasData: once CSV is parsed, prevent accidental close
  const hasData = dataRows.length > 0;

  // Block Escape and backdrop click when data is loaded
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key !== 'Escape') return;
      if (hasData) return;
      onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [hasData, onClose]);

  function handleBackdropClick(e) {
    if (e.target !== e.currentTarget) return;
    if (hasData) return;
    onClose();
  }

  // Fetch rooms when we reach step 3
  useEffect(() => {
    if (step !== 3 || rooms.length > 0) return;
    apiFetch(`/api/rooms?property_id=${propertyId}`)
      .then(r => r.json())
      .then(data => setRooms(Array.isArray(data) ? data : (data.rooms ?? [])))
      .catch(() => {});
  }, [step, propertyId, rooms.length]);

  // Step 2 — handle file upload
  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileError(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target.result;
      const rows = parseCSV(text);
      if (rows.length < 2) { setFileError(t('csvErrorEmpty')); return; }
      if (rows.length > 1001) { setFileError(t('csvErrorTooLarge')); return; }

      const headers = rows[0].map(h => h.toLowerCase().replace(/[\s-]/g, '_'));
      const objects = rows.slice(1).map(row =>
        Object.fromEntries(COLS.map(col => {
          const idx = headers.findIndex(h => h === col || h.includes(col.split('_')[0]));
          return [col, idx !== -1 ? (row[idx] ?? '') : ''];
        }))
      );
      setDataRows(objects);

      // Pre-populate room map with unique room names → needs mapping
      const uniqueRooms = [...new Set(objects.map(r => r.room?.trim()).filter(Boolean))];
      const initMap = Object.fromEntries(uniqueRooms.map(r => [r, '']));
      setRoomMap(initMap);
      setStep(3);
    };
    reader.readAsText(file, 'UTF-8');
  };

  // Unique room names from CSV
  const csvRooms = Object.keys(roomMap);

  // Can proceed from step 3 only when every room is mapped or skipped
  const canProceedMapping = csvRooms.length > 0 && csvRooms.every(r => roomMap[r] !== '');

  // Preview rows: first 5, with resolved room name
  const previewRows = dataRows.slice(0, 5).map(row => ({
    ...row,
    _roomLabel: (() => {
      const mapped = roomMap[row.room?.trim()];
      if (!mapped || mapped === 'skip') return '— skip —';
      const rm = rooms.find(r => String(r.id) === String(mapped));
      return rm?.name ?? row.room;
    })(),
  }));

  // Step 4 — submit
  const handleImport = async () => {
    setSubmitting(true);
    setFileError(null);
    try {
      const res  = await apiFetch('/api/bookings/import', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ property_id: propertyId, rows: dataRows, room_map: roomMap }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResult(data);
      setStep(5);
    } catch (err) {
      setFileError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const STEP_LABELS = [
    t('importBookingsStepInstr'),
    t('importBookingsStepUpload'),
    t('importBookingsStepMap'),
    t('importBookingsStepPreview'),
  ];

  return (
    <div className="modal-overlay" onClick={handleBackdropClick}>
      <div className="modal" role="dialog" aria-label={t('importBookingsTitle')} style={{ maxWidth: 620 }}>

        <div className="modal-header">
          <h2>{t('importBookingsTitle')}</h2>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">

          {/* Step indicator — hidden on result step */}
          {step < 5 && (
            <div className="import-steps">
              {STEP_LABELS.map((label, i) => (
                <div key={i} className={`import-step${step === i + 1 ? ' active' : step > i + 1 ? ' done' : ''}`}>
                  <div className="import-step-num">{step > i + 1 ? '✓' : i + 1}</div>
                  <div className="import-step-label">{label}</div>
                </div>
              ))}
            </div>
          )}

          {/* ── Step 1: Instructions + template ────────────────────────── */}
          {step === 1 && (
            <div className="import-step-body">
              <p style={{ color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.6 }}>
                {t('importBookingsIntro')}
              </p>

              {/* Collapsible how-to section */}
              <div style={{ marginBottom: 20, border: '1px solid var(--border)', borderRadius: 8 }}>
                <button
                  type="button"
                  onClick={() => setHowToOpen(o => !o)}
                  style={{
                    width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer',
                    fontWeight: 600, fontSize: '0.9rem', color: 'var(--text)',
                  }}
                >
                  {t('importBookingsHowTo')}
                  <i className={`ti ti-chevron-${howToOpen ? 'up' : 'down'}`} style={{ fontSize: '1rem' }} />
                </button>
                {howToOpen && (
                  <div style={{ padding: '0 14px 14px', fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.7 }}>
                    <p style={{ marginBottom: 8, marginTop: 4 }}><strong>Booking.com</strong> — Reservations → Export → CSV</p>
                    <p style={{ marginBottom: 8 }}><strong>Airbnb</strong> — Reservations → Export to CSV</p>
                    <p style={{ marginBottom: 8 }}><strong>Lodgify / Beds24 / other</strong> — Check your system's export or reports section, export as CSV</p>
                    <p style={{ margin: 0 }}><strong>Spreadsheet</strong> — File → Save As → CSV</p>
                  </div>
                )}
              </div>

              <button
                className="btn-secondary"
                onClick={() => downloadBlob(TEMPLATE_CSV, 'nestbook-bookings-template.csv')}
              >
                <i className="ti ti-download" style={{ marginRight: 6 }} />
                {t('importBookingsTemplate')}
              </button>
              <p style={{ marginTop: 12, fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                {t('importTemplateHint')}
              </p>
            </div>
          )}

          {/* ── Step 2: Upload ──────────────────────────────────────────── */}
          {step === 2 && (
            <div className="import-step-body">
              <p style={{ color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.6 }}>
                {t('importBookingsUpload')}
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
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>CSV · max 1000 rows</div>
              </div>
              <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={handleFile} />
              {fileError && <div className="form-error" style={{ marginTop: 12 }}>{fileError}</div>}
            </div>
          )}

          {/* ── Step 3: Room mapping ────────────────────────────────────── */}
          {step === 3 && (
            <div className="import-step-body">
              <p style={{ color: 'var(--text-muted)', marginBottom: 12, fontSize: '0.85rem' }}>
                {t('importBookingsMapping')} &mdash; {dataRows.length} {t('importRowsFound')}
              </p>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 500 }}>
                      {t('importBookingsRoomCol')}
                    </th>
                    <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 500 }}>
                      {t('importBookingsMapTo')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {csvRooms.map(csvRoom => (
                    <tr key={csvRoom} style={{ borderBottom: '1px solid var(--border-light, #f1f5f9)' }}>
                      <td style={{ padding: '8px 8px', fontStyle: 'italic', color: 'var(--text)' }}>
                        &ldquo;{csvRoom}&rdquo;
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        <select
                          className="form-control"
                          value={roomMap[csvRoom] ?? ''}
                          onChange={(e) => setRoomMap(m => ({ ...m, [csvRoom]: e.target.value }))}
                        >
                          <option value="">— {t('importSkipColumn')} —</option>
                          <option value="skip">{t('importBookingsSkip')}</option>
                          {rooms.map(r => (
                            <option key={r.id} value={r.id}>{r.name}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rooms.length === 0 && (
                <p style={{ marginTop: 12, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Loading rooms…
                </p>
              )}
            </div>
          )}

          {/* ── Step 4: Preview + import ────────────────────────────────── */}
          {step === 4 && (
            <div className="import-step-body">
              <p style={{ color: 'var(--text-muted)', marginBottom: 12, fontSize: '0.85rem' }}>
                {t('importBookingsPreview')} ({dataRows.length} {t('importRowsTotal')})
              </p>
              <div style={{ overflowX: 'auto' }}>
                <table className="import-preview-table">
                  <thead>
                    <tr>
                      <th>Guest</th>
                      <th>Room</th>
                      <th>Check-in</th>
                      <th>Check-out</th>
                      <th>Total</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, i) => (
                      <tr key={i}>
                        <td>{row.guest_name || <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                        <td style={{ fontStyle: row._roomLabel === '— skip —' ? 'italic' : 'normal', color: row._roomLabel === '— skip —' ? '#94a3b8' : 'inherit' }}>
                          {row._roomLabel}
                        </td>
                        <td>{row.check_in || <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                        <td>{row.check_out || <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                        <td>{row.total_amount || <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                        <td>{row.status || 'confirmed'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {dataRows.length > 5 && (
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 8 }}>
                  {t('importMoreRows')(dataRows.length - 5)}
                </div>
              )}
              {fileError && (
                <div style={{
                  marginTop: 16, padding: '10px 14px', borderRadius: 6,
                  background: '#fef2f2', border: '1px solid #fca5a5', color: '#b91c1c',
                  fontSize: '0.85rem', fontWeight: 500,
                }}>
                  {fileError}
                </div>
              )}
            </div>
          )}

          {/* ── Step 5: Result ──────────────────────────────────────────── */}
          {step === 5 && result && (
            <div className="import-step-body" style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{ fontSize: '3rem', marginBottom: 12 }}>
                {result.imported > 0
                  ? <i className="ti ti-circle-check" style={{ color: 'var(--accent)' }} />
                  : <i className="ti ti-alert-triangle" style={{ color: '#f59e0b' }} />}
              </div>
              <div style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: 16 }}>
                {t('importBookingsDone')}
              </div>
              <div className="import-result-grid">
                <div className="import-result-item">
                  <span className="import-result-num" style={{ color: '#10b981' }}>{result.imported}</span>
                  <span>{t('importBookingsImported')}</span>
                </div>
                <div className="import-result-item">
                  <span className="import-result-num" style={{ color: '#f59e0b' }}>{result.skipped}</span>
                  <span>{t('importBookingsSkipped')}</span>
                </div>
                <div className="import-result-item">
                  <span className="import-result-num" style={{ color: '#ef4444' }}>{result.errors?.length ?? 0}</span>
                  <span>{t('importBookingsErrors')}</span>
                </div>
              </div>
              {result.errors?.length > 0 && (
                <div style={{
                  marginTop: 16, padding: '10px 14px', borderRadius: 6, textAlign: 'left',
                  background: '#fef2f2', border: '1px solid #fca5a5',
                  fontSize: '0.8rem', color: '#b91c1c', lineHeight: 1.6,
                }}>
                  {result.errors.slice(0, 5).map((e, i) => <div key={i}>{e}</div>)}
                  {result.errors.length > 5 && <div>...and {result.errors.length - 5} more</div>}
                </div>
              )}
              {result.skipped > 0 && (
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 12 }}>
                  {t('importBookingsDuplicates')}
                </p>
              )}
            </div>
          )}
        </div>

        {/* ── Footer ───────────────────────────────────────────────────── */}
        <div className="modal-footer">
          {step < 5 && (
            <button type="button" className="btn-secondary" onClick={onClose}>
              {t('cancel')}
            </button>
          )}

          {step === 1 && (
            <button className="btn-primary" onClick={() => setStep(2)}>
              {t('importBookingsStepUpload')} →
            </button>
          )}

          {step === 2 && (
            <button className="btn-secondary" onClick={() => setStep(1)}>
              {t('back')}
            </button>
          )}

          {step === 3 && (
            <>
              <button className="btn-secondary" onClick={() => { setStep(2); setDataRows([]); setRoomMap({}); }}>
                {t('back')}
              </button>
              <button
                className="btn-primary"
                disabled={!canProceedMapping}
                onClick={() => setStep(4)}
              >
                {t('importNextPreview')}
              </button>
            </>
          )}

          {step === 4 && (
            <>
              <button className="btn-secondary" onClick={() => setStep(3)}>{t('back')}</button>
              <button
                className="btn-primary"
                disabled={submitting}
                onClick={handleImport}
              >
                {submitting ? t('importingBtn') : t('importBookingsImportBtn')(dataRows.length)}
              </button>
            </>
          )}

          {step === 5 && (
            <button className="btn-primary" onClick={() => { onImported?.(); onClose(); }}>
              {t('done')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
