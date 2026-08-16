import BedTypeIcon from './BedIcons.jsx';
import { BED_TYPES, bedTypeLabel } from '../utils/bedTypes.js';

// Repeatable bed-type + quantity rows (Phase 7a). Fully controlled: `beds`
// is an array of { type, qty } (never a JSON string — callers serialize at
// submit time). No rows by default — this field is optional in both Named
// Rooms and Room Categories mode.
//
// onChange always receives an UPDATER function (prevBeds => nextBeds), never
// a plain array — two rapid clicks (a real double-click, or two calls in the
// same tick) both need to compute off the latest array rather than a value
// closed over at render time, or the second click's update silently drops
// the first (React 18 batches synchronous state updates together). Callers
// must thread this into their own setState functionally, e.g.
// onChange={(fn) => setForm(prev => ({ ...prev, beds: fn(prev.beds) }))}.
export default function BedsEditor({ beds, onChange, t }) {
  const rows = beds ?? [];

  function updateRow(index, patch) {
    onChange((prev) => (prev ?? []).map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function removeRow(index) {
    onChange((prev) => (prev ?? []).filter((_, i) => i !== index));
  }

  function addRow() {
    onChange((prev) => [...(prev ?? []), { type: 'double', qty: 1 }]);
  }

  return (
    <div className="beds-editor">
      {rows.map((row, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ color: 'var(--text-muted)', flexShrink: 0, display: 'flex' }}>
            <BedTypeIcon type={row.type} />
          </span>
          <select
            className="form-control"
            value={row.type}
            onChange={(e) => updateRow(i, { type: e.target.value })}
            style={{ flex: 1 }}
          >
            {BED_TYPES.map((bt) => (
              <option key={bt} value={bt}>{bedTypeLabel(t, bt)}</option>
            ))}
          </select>
          <input
            type="number"
            className="form-control"
            min="1"
            value={row.qty}
            onChange={(e) => updateRow(i, { qty: Math.max(1, parseInt(e.target.value, 10) || 1) })}
            style={{ width: 64, flexShrink: 0 }}
          />
          <button
            type="button"
            onClick={() => removeRow(i)}
            aria-label="Remove bed"
            style={{
              background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer',
              fontSize: '1rem', lineHeight: 1, padding: '4px 6px', flexShrink: 0,
            }}
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addRow}
        className="btn-secondary"
        style={{ fontSize: '0.82rem', padding: '6px 12px' }}
      >
        + {t('addBed')}
      </button>
    </div>
  );
}
