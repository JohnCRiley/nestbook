import { useEffect, useState } from 'react';
import { saApiFetch as apiFetch } from '../saApiFetch.js';
import ConfirmModal from '../../components/ConfirmModal.jsx';

export default function AdminSettings() {
  const [codes,   setCodes]   = useState([]);
  const [busy,    setBusy]    = useState({});   // { `del_${id}`: true }
  const [toast,   setToast]   = useState(null);
  const [form,    setForm]    = useState({
    code: '', discount_percent: '', duration: 'once', duration_months: '', max_uses: '',
  });
  const [creating,         setCreating]         = useState(false);
  const [pendingDeactivate, setPendingDeactivate] = useState(null); // { id, code }

  useEffect(() => {
    apiFetch('/api/admin/discount-codes').then(r => r.json()).then(setCodes).catch(() => {});
  }, []);

  function showToast(msg, type = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  function setField(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }));
  }

  async function createCode(e) {
    e.preventDefault();
    if (!form.code.trim()) return showToast('Code is required.', 'error');
    if (!form.discount_percent || Number(form.discount_percent) < 1 || Number(form.discount_percent) > 100) {
      return showToast('Discount must be 1–100%.', 'error');
    }
    if (form.duration === 'repeating' && !form.duration_months) {
      return showToast('Duration months required for repeating discount.', 'error');
    }

    setCreating(true);
    try {
      const res = await apiFetch('/api/admin/discount-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code:             form.code.trim().toUpperCase(),
          discount_percent: Number(form.discount_percent),
          duration:         form.duration,
          duration_months:  form.duration_months ? Number(form.duration_months) : undefined,
          max_uses:         form.max_uses ? Number(form.max_uses) : undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setCodes(c => [data, ...c]);
        setForm({ code: '', discount_percent: '', duration: 'once', duration_months: '', max_uses: '' });
        showToast(`Code ${data.code} created.`);
      } else {
        showToast(data.error || 'Failed to create code.', 'error');
      }
    } catch { showToast('Network error.', 'error'); }
    setCreating(false);
  }

  async function deactivate(id, code) {
    setPendingDeactivate(null);
    setBusy(b => ({ ...b, [`del_${id}`]: true }));
    try {
      const res = await apiFetch(`/api/admin/discount-codes/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setCodes(c => c.filter(x => x.id !== id));
        showToast(`Code ${code} deactivated.`);
      } else {
        const d = await res.json();
        showToast(d.error || 'Failed to deactivate.', 'error');
      }
    } catch { showToast('Network error.', 'error'); }
    setBusy(b => ({ ...b, [`del_${id}`]: false }));
  }

  const activeCodes = codes.filter(c => c.active);

  return (
    <>
      <div className="page-header">
        <h1>Admin Settings</h1>
        <div className="page-date">Platform configuration</div>
      </div>

      {/* ── Discount Codes ──────────────────────────────────────────────────── */}
      <div className="admin-card" style={{ marginBottom: 24 }}>
        <div className="admin-card-header">
          <h2>Discount Codes</h2>
        </div>

        {/* Create form */}
        <div style={{ padding: '20px', borderBottom: '1px solid #f1f5f9' }}>
          <form onSubmit={createCode} style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label className="form-label" style={{ fontSize: '0.8rem' }}>Code</label>
              <input
                className="form-control"
                style={{ width: 130, textTransform: 'uppercase' }}
                placeholder="BETA50"
                value={form.code}
                onChange={setField('code')}
                maxLength={20}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label className="form-label" style={{ fontSize: '0.8rem' }}>Discount %</label>
              <input
                className="form-control"
                style={{ width: 90 }}
                type="number" min="1" max="100"
                placeholder="50"
                value={form.discount_percent}
                onChange={setField('discount_percent')}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label className="form-label" style={{ fontSize: '0.8rem' }}>Duration</label>
              <select
                className="form-control"
                style={{ width: 140 }}
                value={form.duration}
                onChange={setField('duration')}
              >
                <option value="once">Once (first payment)</option>
                <option value="repeating">Repeating (N months)</option>
                <option value="forever">Forever</option>
              </select>
            </div>

            {form.duration === 'repeating' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label className="form-label" style={{ fontSize: '0.8rem' }}>Months</label>
                <input
                  className="form-control"
                  style={{ width: 80 }}
                  type="number" min="1"
                  placeholder="3"
                  value={form.duration_months}
                  onChange={setField('duration_months')}
                />
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label className="form-label" style={{ fontSize: '0.8rem' }}>Max uses <span style={{ color: '#94a3b8' }}>(optional)</span></label>
              <input
                className="form-control"
                style={{ width: 90 }}
                type="number" min="1"
                placeholder="∞"
                value={form.max_uses}
                onChange={setField('max_uses')}
              />
            </div>

            <button
              type="submit"
              className="btn-primary"
              disabled={creating}
              style={{ height: 38, alignSelf: 'flex-end' }}
            >
              {creating ? 'Creating…' : '+ Create code'}
            </button>
          </form>
        </div>

        {/* Active codes table */}
        {activeCodes.length === 0 ? (
          <div style={{ padding: '20px', color: '#94a3b8', fontSize: '0.875rem' }}>
            No active discount codes yet.
          </div>
        ) : (
          <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Discount</th>
                <th>Duration</th>
                <th>Uses</th>
                <th>Stripe coupon</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {activeCodes.map(c => (
                <tr key={c.id}>
                  <td>
                    <code style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.9rem', color: '#0f172a', background: '#f1f5f9', padding: '2px 6px', borderRadius: 4 }}>
                      {c.code}
                    </code>
                  </td>
                  <td>{c.discount_percent}%</td>
                  <td>
                    {c.duration === 'once'      ? 'Once'
                   : c.duration === 'forever'   ? 'Forever'
                   : `${c.duration_months} month${c.duration_months !== 1 ? 's' : ''}`}
                  </td>
                  <td>
                    {c.current_uses}
                    {c.max_uses ? ` / ${c.max_uses}` : ' / ∞'}
                  </td>
                  <td className="admin-muted" style={{ fontSize: '0.8rem' }}>
                    {c.stripe_coupon_id ?? '—'}
                  </td>
                  <td className="admin-muted">{fmtDate(c.created_at)}</td>
                  <td>
                    <button
                      className="sa-btn sa-btn-cancel"
                      disabled={!!busy[`del_${c.id}`]}
                      onClick={() => setPendingDeactivate({ id: c.id, code: c.code })}
                    >
                      {busy[`del_${c.id}`] ? '…' : 'Deactivate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {toast && (
        <div className={`sa-toast sa-toast-${toast.type}`}>{toast.msg}</div>
      )}

      <ConfirmModal
        isOpen={!!pendingDeactivate}
        title="Deactivate discount code"
        message={`Deactivate code "${pendingDeactivate?.code}"? This cannot be undone.`}
        confirmLabel="Deactivate"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={() => deactivate(pendingDeactivate.id, pendingDeactivate.code)}
        onCancel={() => setPendingDeactivate(null)}
      />
    </>
  );
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
