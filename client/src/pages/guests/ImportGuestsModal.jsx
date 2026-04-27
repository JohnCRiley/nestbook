import { useState, useRef } from 'react';
import { apiFetch } from '../../utils/apiFetch.js';
import { useT } from '../../i18n/LocaleContext.jsx';

const FIELDS = [
  { key: 'first_name', label: 'First Name', required: true },
  { key: 'last_name',  label: 'Last Name',  required: true },
  { key: 'email',      label: 'Email',       required: false },
  { key: 'phone',      label: 'Phone',       required: false },
  { key: 'notes',      label: 'Notes',       required: false },
];

const TEMPLATE_CSV =
  'First Name,Last Name,Email,Phone,Notes\n' +
  'Marie,Dupont,marie.dupont@email.com,+33612345678,Regular guest prefers quiet room\n' +
  'John,Smith,john.smith@email.com,+44771234567,\n';

// ── Pure JS CSV parser ────────────────────────────────────────────────────────
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

function downloadBlob(content, filename, type = 'text/csv;charset=utf-8;') {
  const blob = new Blob([content], { type });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function ImportGuestsModal({ onClose, onImported }) {
  const t = useT();
  const fileRef = useRef(null);

  const [step,      setStep]      = useState(1);
  const [headers,   setHeaders]   = useState([]);
  const [dataRows,  setDataRows]  = useState([]);
  const [mapping,   setMapping]   = useState({});
  const [result,    setResult]    = useState(null);
  const [submitting,setSubmitting]= useState(false);
  const [fileError, setFileError] = useState(null);

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
      if (rows.length > 501) { setFileError(t('csvErrorTooLarge')); return; }
      setHeaders(rows[0]);
      setDataRows(rows.slice(1));

      // Auto-map by fuzzy header match
      const autoMap = {};
      FIELDS.forEach(({ key }) => {
        const match = rows[0].findIndex(h => {
          const n = h.toLowerCase().replace(/[\s_-]/g, '');
          return (
            n === key.replace('_', '') ||
            n.includes(key.split('_')[0]) ||
            (key === 'first_name' && (n.includes('first') || n === 'prenom' || n === 'prénom' || n === 'vorname' || n === 'nombre')) ||
            (key === 'last_name'  && (n.includes('last')  || n === 'nom'    || n === 'nachname'|| n === 'apellido')) ||
            (key === 'email'      && n.includes('mail')) ||
            (key === 'phone'      && (n.includes('phone') || n.includes('tel') || n === 'mobile')) ||
            (key === 'notes'      && (n.includes('note')  || n.includes('comment') || n.includes('remarque')))
          );
        });
        if (match !== -1) autoMap[key] = String(match);
      });
      setMapping(autoMap);
      setStep(3);
    };
    reader.readAsText(file);
  };

  // Step 4 — preview rows (first 5)
  const previewRows = dataRows.slice(0, 5).map(row =>
    Object.fromEntries(FIELDS.map(({ key }) => [key, mapping[key] != null ? row[Number(mapping[key])] ?? '' : '']))
  );

  // Step 5 — submit
  const handleImport = async () => {
    setSubmitting(true);
    setFileError(null);
    const rows = dataRows.map(row =>
      Object.fromEntries(FIELDS.map(({ key }) => [key, mapping[key] != null ? row[Number(mapping[key])]?.trim() ?? '' : '']))
    );
    console.log('[Import] Sending payload:', rows.length, 'rows. First row:', JSON.stringify(rows[0]));
    try {
      const res  = await apiFetch('/api/guests/import', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ rows }),
      });
      const data = await res.json();
      console.log('[Import] API response status:', res.status, 'body:', JSON.stringify(data));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResult(data);
      setStep(5);
    } catch (err) {
      console.error('[Import] Failed:', err.message);
      setFileError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const canProceedMapping = FIELDS.filter(f => f.required).every(f => mapping[f.key] != null);

  return (
    <div className="modal-overlay">
      <div className="modal" role="dialog" aria-label={t('importGuestsTitle')} style={{ maxWidth: 560 }}>

        <div className="modal-header">
          <h2>{t('importGuestsTitle')}</h2>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {/* Step indicator */}
          <div className="import-steps">
            {[t('importStep1'), t('importStep2'), t('importStep3'), t('importStep4')].map((label, i) => (
              <div key={i} className={`import-step${step === i + 1 ? ' active' : step > i + 1 ? ' done' : ''}`}>
                <div className="import-step-num">{step > i + 1 ? '✓' : i + 1}</div>
                <div className="import-step-label">{label}</div>
              </div>
            ))}
          </div>

          {/* ── Step 1: Template ─────────────────────────────────────────── */}
          {step === 1 && (
            <div className="import-step-body">
              <p style={{ color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.6 }}>
                {t('importStep1Desc')}
              </p>
              <button
                className="btn-secondary"
                style={{ marginBottom: 20 }}
                onClick={() => downloadBlob(TEMPLATE_CSV, 'nestbook-guests-template.csv')}
              >
                {t('importDownloadTemplate')}
              </button>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                {t('importTemplateHint')}
              </p>
            </div>
          )}

          {/* ── Step 2: Upload ───────────────────────────────────────────── */}
          {step === 2 && (
            <div className="import-step-body">
              <p style={{ color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.6 }}>
                {t('importStep2Desc')}
              </p>
              <div
                className="import-dropzone"
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files[0];
                  if (f) { fileRef.current.files = e.dataTransfer.files; handleFile({ target: { files: [f] } }); }
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

          {/* ── Step 3: Map columns ──────────────────────────────────────── */}
          {step === 3 && (
            <div className="import-step-body">
              <p style={{ color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.5, fontSize: '0.85rem' }}>
                {t('importStep3Desc')} ({dataRows.length} {t('importRowsFound')})
              </p>
              <div className="import-mapping">
                {FIELDS.map(({ key, label, required }) => (
                  <div key={key} className="import-map-row">
                    <span className="import-map-field">{label}{required ? ' *' : ''}</span>
                    <select
                      className="form-control"
                      value={mapping[key] ?? ''}
                      onChange={(e) => setMapping(m => ({ ...m, [key]: e.target.value || undefined }))}
                    >
                      <option value="">— {t('importSkipColumn')} —</option>
                      {headers.map((h, i) => (
                        <option key={i} value={i}>{h || `Column ${i + 1}`}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Step 4: Preview ──────────────────────────────────────────── */}
          {step === 4 && (
            <div className="import-step-body">
              <p style={{ color: 'var(--text-muted)', marginBottom: 12, fontSize: '0.85rem' }}>
                {t('importStep4Desc')} ({dataRows.length} {t('importRowsTotal')})
              </p>
              <div style={{ overflowX: 'auto' }}>
                <table className="import-preview-table">
                  <thead>
                    <tr>
                      {FIELDS.map(f => <th key={f.key}>{f.label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, i) => (
                      <tr key={i}>
                        {FIELDS.map(f => <td key={f.key}>{row[f.key] || <span style={{ color: '#cbd5e1' }}>—</span>}</td>)}
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

          {/* ── Step 5: Result ───────────────────────────────────────────── */}
          {step === 5 && result && (
            <div className="import-step-body" style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{ fontSize: '3rem', marginBottom: 12 }}>
                {result.imported > 0 ? '✅' : '⚠️'}
              </div>
              <div style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: 16 }}>
                {result.imported > 0 ? t('importDoneTitle') : t('importNoneTitle') ?? 'No guests were imported'}
              </div>
              {result.imported === 0 && (
                <div style={{
                  marginBottom: 16, padding: '10px 14px', borderRadius: 6,
                  background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e',
                  fontSize: '0.85rem', textAlign: 'left',
                }}>
                  {result.skipped > 0
                    ? `All ${result.skipped} rows were skipped — guests with those email addresses already exist.`
                    : result.errors > 0
                      ? `All ${result.errors} rows had errors (missing first name or last name).`
                      : 'No rows could be imported. Check that your file has valid data.'}
                </div>
              )}
              <div className="import-result-grid">
                <div className="import-result-item">
                  <span className="import-result-num" style={{ color: '#10b981' }}>{result.imported}</span>
                  <span>{t('importResultImported')}</span>
                </div>
                <div className="import-result-item">
                  <span className="import-result-num" style={{ color: '#f59e0b' }}>{result.skipped}</span>
                  <span>{t('importResultSkipped')}</span>
                </div>
                <div className="import-result-item">
                  <span className="import-result-num" style={{ color: '#ef4444' }}>{result.errors}</span>
                  <span>{t('importResultErrors')}</span>
                </div>
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 12 }}>
                {t('importResultSkippedHint')}
              </p>
            </div>
          )}
        </div>

        <div className="modal-footer">
          {step < 5 && (
            <button type="button" className="btn-secondary" onClick={onClose}>
              {t('cancel')}
            </button>
          )}

          {step === 1 && (
            <button className="btn-primary" onClick={() => setStep(2)}>
              {t('importNextUpload')}
            </button>
          )}
          {step === 2 && (
            <button className="btn-secondary" onClick={() => setStep(1)}>
              {t('back')}
            </button>
          )}
          {step === 3 && (
            <>
              <button className="btn-secondary" onClick={() => setStep(2)}>{t('back')}</button>
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
                {submitting ? t('importingBtn') : t('importConfirmBtn')(dataRows.length)}
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
