import { useState, useEffect } from 'react';
import { saApiFetch } from '../saApiFetch.js';

const PIPELINE = [
  { value: 'not_called',     label: 'Not called',          color: '#64748b', bg: '#f8fafc',   icon: 'ti-phone' },
  { value: 'no_answer',      label: 'No answer',           color: '#f59e0b', bg: '#fef3c7',   icon: 'ti-phone-off' },
  { value: 'voicemail',      label: 'Left voicemail',      color: '#3b82f6', bg: '#dbeafe',   icon: 'ti-speakerphone' },
  { value: 'call_back',      label: 'Call back requested', color: '#8b5cf6', bg: '#f5f3ff',   icon: 'ti-clock' },
  { value: 'interested',     label: 'Spoke — interested',  color: '#10b981', bg: '#d1fae5',   icon: 'ti-star' },
  { value: 'not_interested', label: 'Not interested',      color: '#94a3b8', bg: '#f1f5f9',   icon: 'ti-x' },
  { value: 'signed_up',      label: 'Signed up',           color: '#1a4710', bg: '#d9f0cc',   icon: 'ti-circle-check' },
  { value: 'do_not_call',    label: 'Do not call',         color: '#dc2626', bg: '#fef2f2',   icon: 'ti-ban' },
];

const PROMPTS = [
  {
    trigger: 'They answer and sound suspicious',
    response: `"Oh, I'm terribly sorry to bother you — I'll keep this very brief! My name's John, I run a small booking software company called NestBook. I noticed your lovely property online and just wanted to introduce ourselves. Absolutely no pressure whatsoever — I can call back at a better time if you'd prefer?"`,
    tip: 'Match their energy. If they sound rushed — offer to call back immediately. Never push.',
  },
  {
    trigger: '"We already use Booking.com / Airbnb"',
    response: `"Oh absolutely, most of our owners do — we work alongside them rather than replacing them. The idea is that when a guest comes back for a second stay, they book directly with you instead of going through Booking.com again. You'd keep that 15% commission on repeat guests. Does that make sense?"`,
    tip: 'Never criticise Booking.com. Position NestBook as complementary, not competitive.',
  },
  {
    trigger: '"We\'re not very technical"',
    response: `"Neither are most of our owners, honestly! It takes about 20 minutes to set up and there\'s no technical knowledge needed at all. I can walk you through it over the phone if you\'d like, or there\'s a free plan so you could have a look with absolutely no commitment."`,
    tip: 'Offer to help personally. The human touch is your biggest advantage over big platforms.',
  },
  {
    trigger: '"How much does it cost?"',
    response: `"The free plan is completely free — no credit card, no time limit. If you want more features like a booking widget for your website, Pro is £19 a month. And there\'s no commission on any booking, ever — just that flat fee."`,
    tip: 'Lead with Free. Let the price surprise them. Pause after "£19 a month" — silence is fine.',
  },
  {
    trigger: '"Can you call back later / send an email?"',
    response: `"Of course, absolutely — I\'m sorry to have caught you at a bad time! Would it be better if I dropped you a quick email with a link so you can have a look in your own time? And if you\'d like me to call back, when would suit you best?"`,
    tip: 'Always give them the easy out. Getting an email address from a call is a win.',
  },
  {
    trigger: '"We\'ll think about it"',
    response: `"Of course, please do — there\'s absolutely no rush. The free plan is there whenever you\'re ready and it costs nothing to try. I\'ll leave you my details and if you have any questions at all, just give me a ring or drop me an email."`,
    tip: 'Leave the door wide open. Never follow up more than once after this response.',
  },
  {
    trigger: '"Yes, tell me more!" 🎉',
    response: `"Wonderful! So the idea is really simple — you get your own booking page at nestbook.io/book/your-property-name. You can share that link anywhere — Facebook, Instagram, WhatsApp, email signature — and guests can book directly with you. No commission. Would you like me to send you a link so you can see what it looks like?"`,
    tip: 'Stay calm! Don\'t overwhelm them. One idea at a time. Get them to the demo page.',
  },
  {
    trigger: 'They\'re friendly but non-committal',
    response: `"That\'s absolutely fine — I completely understand. Would it be helpful if I sent you the link to our how-it-works page? It explains everything without any sales pressure and there\'s a live example of a property page you can have a look at. No obligation at all."`,
    tip: 'nestbook.io/how-it-works is your soft landing. Send it every time.',
  },
  {
    trigger: 'They hang up / get cut off',
    response: `Mark as "No answer" and note the time. Try again tomorrow at a different time of day. Morning calls (9-11am) often work better for B&B owners than afternoons when they're busy with guests.`,
    tip: 'Don\'t take it personally. Try different times. Three attempts before moving on.',
  },
  {
    trigger: 'They ask "How did you get my number?"',
    response: `"Your number is listed on your website / Google listing — I hope you don't mind me calling! I'll keep it very brief."`,
    tip: 'Always be honest. If it\'s not on their website — apologise and offer to be removed.',
  },
];

export default function PhoneOutreach() {
  const [prospects, setProspects]       = useState([]);
  const [regions, setRegions]           = useState([]);
  const [allTowns, setAllTowns]         = useState([]);
  const [towns, setTowns]               = useState([]);
  const [stats, setStats]               = useState([]);
  const [loading, setLoading]           = useState(true);
  const [filterRegion, setFilterRegion] = useState('all');
  const [filterTown, setFilterTown]     = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [search, setSearch]             = useState('');
  const [openPrompt, setOpenPrompt]     = useState(null);
  const [editingPhone, setEditingPhone] = useState(null);
  const [editPhoneVal, setEditPhoneVal] = useState('');
  const [openNotes, setOpenNotes]       = useState(null);
  const [notesVal, setNotesVal]         = useState('');
  const [callBackId, setCallBackId]     = useState(null);
  const [callBackVal, setCallBackVal]   = useState('');
  const [message, setMessage]           = useState(null);

  useEffect(() => { loadProspects(); }, [filterRegion, filterTown, filterStatus, search]);

  useEffect(() => {
    if (filterRegion === 'all') {
      setTowns([...new Set(allTowns.map(t => t.town))].sort());
    } else {
      setTowns(
        allTowns
          .filter(t => t.region === filterRegion)
          .map(t => t.town)
          .sort()
      );
    }
    setFilterTown('all');
  }, [filterRegion, allTowns]);

  async function loadProspects() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ region: filterRegion, town: filterTown, status: filterStatus, search });
      const res  = await saApiFetch(`/api/admin/phone-prospects?${params}`);
      const data = await res.json();
      setProspects(data.prospects || []);
      setRegions(data.regions || []);
      setAllTowns(data.towns || []);
      setStats(data.stats || []);
    } catch {
      setMessage({ type: 'error', text: 'Failed to load prospects' });
    }
    setLoading(false);
  }

  async function updateProspect(id, fields) {
    try {
      await saApiFetch(`/api/admin/phone-prospects/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      });
      await loadProspects();
    } catch {
      setMessage({ type: 'error', text: 'Update failed' });
    }
  }

  async function savePhone(id) {
    await updateProspect(id, { phone: editPhoneVal });
    setEditingPhone(null);
    setEditPhoneVal('');
  }

  async function saveNotes(id) {
    await updateProspect(id, { phone_notes: notesVal });
    setOpenNotes(null);
  }

  async function saveCallBack(id) {
    await updateProspect(id, { phone_status: 'call_back', call_back_at: callBackVal });
    setCallBackId(null);
    setCallBackVal('');
  }

  const getStatus = (val) => PIPELINE.find(p => p.value === val) || PIPELINE[0];

  const toCall     = prospects.filter(p => !p.phone_status || p.phone_status === 'not_called').length;
  const interested = prospects.filter(p => p.phone_status === 'interested').length;
  const signedUp   = prospects.filter(p => p.phone_status === 'signed_up').length;
  const callBacks  = prospects.filter(p => p.phone_status === 'call_back').length;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>

      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
          Phone outreach
        </h1>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
          Manage your phone calls for the UK tour. Filter by region and town.
        </p>
      </div>

      {/* Stats bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
        {[
          { label: 'To call',    value: toCall,     color: '#64748b' },
          { label: 'Call backs', value: callBacks,  color: '#8b5cf6' },
          { label: 'Interested', value: interested, color: '#10b981' },
          { label: 'Signed up',  value: signedUp,   color: '#1a4710' },
        ].map(stat => (
          <div key={stat.label} style={{
            background: 'var(--card-bg)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '12px 14px', textAlign: 'center',
          }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: stat.color }}>{stat.value}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Search property or name..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 2, minWidth: 160 }}
        />
        <select value={filterRegion} onChange={e => setFilterRegion(e.target.value)} style={{ flex: 1, minWidth: 120 }}>
          <option value="all">All regions</option>
          {regions.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <select value={filterTown} onChange={e => setFilterTown(e.target.value)} style={{ flex: 1, minWidth: 120 }} disabled={towns.length === 0}>
          <option value="all">All towns</option>
          {towns.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ flex: 1, minWidth: 130 }}>
          <option value="all">All statuses</option>
          {PIPELINE.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
      </div>

      {/* Message */}
      {message && (
        <div style={{
          background: message.type === 'error' ? '#fef2f2' : '#f0fdf4',
          border: `1px solid ${message.type === 'error' ? '#fca5a5' : '#bbf7d0'}`,
          color: message.type === 'error' ? '#dc2626' : '#166534',
          padding: '10px 16px', borderRadius: 8, fontSize: '0.85rem', marginBottom: 12,
          display: 'flex', justifyContent: 'space-between',
        }}>
          {message.text}
          <button onClick={() => setMessage(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>×</button>
        </div>
      )}

      {/* Call prompts accordion */}
      <div style={{
        background: 'var(--card-bg)', border: '1.5px solid var(--accent)',
        borderRadius: 10, marginBottom: 16, overflow: 'hidden',
      }}>
        <button
          onClick={() => setOpenPrompt(openPrompt === 'main' ? null : 'main')}
          style={{
            width: '100%', background: '#1a4710', border: 'none', padding: '12px 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          <span style={{ color: 'white', fontWeight: 700, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 8 }}>
            <i className="ti ti-message-circle" />
            Call prompts — what to say when...
          </span>
          <i className={`ti ${openPrompt === 'main' ? 'ti-chevron-up' : 'ti-chevron-down'}`}
            style={{ color: 'rgba(255,255,255,0.7)', fontSize: '1rem' }} />
        </button>

        {openPrompt === 'main' && (
          <div style={{ padding: '8px 0' }}>
            {PROMPTS.map((prompt, i) => (
              <div key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                <button
                  onClick={() => setOpenPrompt(openPrompt === i ? 'main' : i)}
                  style={{
                    width: '100%', background: 'none', border: 'none', padding: '10px 16px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                  }}
                >
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {prompt.trigger}
                  </span>
                  <i className={`ti ${openPrompt === i ? 'ti-chevron-up' : 'ti-chevron-down'}`}
                    style={{ color: 'var(--text-muted)', fontSize: '0.9rem', flexShrink: 0, marginLeft: 8 }} />
                </button>
                {openPrompt === i && (
                  <div style={{ padding: '0 16px 14px' }}>
                    <div style={{
                      background: '#f0fdf4', border: '1px solid #d9f0cc', borderRadius: 8,
                      padding: '12px 14px', fontSize: '0.85rem', color: '#1a2e14',
                      lineHeight: 1.65, fontStyle: 'italic', marginBottom: 8,
                    }}>
                      {prompt.response}
                    </div>
                    <div style={{
                      background: '#fef3c7', borderLeft: '3px solid #f59e0b',
                      padding: '8px 12px', fontSize: '0.78rem', color: '#78350f',
                      lineHeight: 1.5, borderRadius: '0 6px 6px 0',
                    }}>
                      <strong>Tip:</strong> {prompt.tip}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Prospects list */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Loading...</div>
      ) : prospects.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)',
          background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 10,
        }}>
          <i className="ti ti-phone-off" style={{ fontSize: '2rem', display: 'block', marginBottom: 8 }} />
          No prospects with phone numbers found.
          <br />
          <span style={{ fontSize: '0.78rem', marginTop: 4, display: 'block' }}>
            Import a CSV with a phone column or add numbers to existing prospects.
          </span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {prospects.map(prospect => {
            const status             = getStatus(prospect.phone_status);
            const isEditingThisPhone = editingPhone === prospect.id;
            const isOpenNotes        = openNotes === prospect.id;
            const isCallBack         = callBackId === prospect.id;

            return (
              <div key={prospect.id} style={{
                background: 'var(--card-bg)',
                border: `1.5px solid ${
                  prospect.phone_status === 'interested' ? '#d9f0cc' :
                  prospect.phone_status === 'call_back'  ? '#e9d5ff' :
                  prospect.phone_status === 'signed_up'  ? '#1a4710' :
                  'var(--border)'
                }`,
                borderRadius: 10, overflow: 'hidden',
              }}>

                {/* Main row */}
                <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>

                  {/* Status pill */}
                  <div style={{
                    background: status.bg, color: status.color, borderRadius: 6,
                    padding: '4px 8px', fontSize: '0.7rem', fontWeight: 700,
                    whiteSpace: 'nowrap', flexShrink: 0, display: 'flex',
                    alignItems: 'center', gap: 4, marginTop: 2,
                  }}>
                    <i className={`ti ${status.icon}`} style={{ fontSize: '0.85rem' }} />
                    {status.label}
                  </div>

                  {/* Property info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)', marginBottom: 2 }}>
                      {prospect.company || prospect.name}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      {prospect.town && (
                        <span>
                          <i className="ti ti-map-pin" style={{ fontSize: '0.75rem', marginRight: 2 }} />
                          {prospect.town}
                        </span>
                      )}
                      {prospect.region && <span style={{ color: 'var(--accent)' }}>{prospect.region}</span>}
                      {prospect.last_called_at && (
                        <span>
                          Last called: {new Date(prospect.last_called_at).toLocaleString('en-GB', {
                            day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                          })}
                        </span>
                      )}
                      {prospect.call_back_at && prospect.phone_status === 'call_back' && (
                        <span style={{ color: '#8b5cf6', fontWeight: 600 }}>
                          <i className="ti ti-clock" style={{ marginRight: 2 }} />
                          Call back: {new Date(prospect.call_back_at).toLocaleString('en-GB', {
                            day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                          })}
                        </span>
                      )}
                    </div>

                    {/* Phone number */}
                    <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                      {isEditingThisPhone ? (
                        <>
                          <input
                            type="tel"
                            value={editPhoneVal}
                            onChange={e => setEditPhoneVal(e.target.value)}
                            placeholder="Phone number"
                            autoFocus
                            style={{ fontSize: '0.85rem', padding: '4px 8px', width: 160 }}
                            onKeyDown={e => {
                              if (e.key === 'Enter')  savePhone(prospect.id);
                              if (e.key === 'Escape') { setEditingPhone(null); setEditPhoneVal(''); }
                            }}
                          />
                          <button onClick={() => savePhone(prospect.id)}
                            style={{ background: 'var(--accent)', color: 'white', border: 'none',
                                     borderRadius: 6, padding: '4px 10px', fontSize: '0.78rem',
                                     cursor: 'pointer', fontFamily: 'inherit' }}>
                            Save
                          </button>
                          <button onClick={() => { setEditingPhone(null); setEditPhoneVal(''); }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer',
                                     color: 'var(--text-muted)', fontSize: '0.78rem', fontFamily: 'inherit' }}>
                            Cancel
                          </button>
                        </>
                      ) : prospect.phone ? (
                        <>
                          <a href={`tel:${prospect.phone}`} style={{
                            color: 'var(--accent)', textDecoration: 'none', fontWeight: 600,
                            fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 5,
                          }}>
                            <i className="ti ti-phone" style={{ fontSize: '0.9rem' }} />
                            {prospect.phone}
                          </a>
                          <button
                            onClick={() => { setEditingPhone(prospect.id); setEditPhoneVal(prospect.phone); }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0 }}>
                            <i className="ti ti-edit" style={{ fontSize: '0.85rem' }} />
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => { setEditingPhone(prospect.id); setEditPhoneVal(''); }}
                          style={{ background: 'none', border: '1px dashed var(--border)',
                                   borderRadius: 6, padding: '3px 10px', fontSize: '0.75rem',
                                   color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'inherit' }}>
                          <i className="ti ti-plus" style={{ marginRight: 4 }} />
                          Add phone number
                        </button>
                      )}
                    </div>

                    {/* Notes display */}
                    {prospect.phone_notes && !isOpenNotes && (
                      <div style={{
                        marginTop: 6, fontSize: '0.78rem', color: 'var(--text-secondary)',
                        fontStyle: 'italic', background: 'var(--tint-bg)',
                        padding: '5px 8px', borderRadius: 5,
                      }}>
                        {prospect.phone_notes}
                      </div>
                    )}

                    {/* Notes editor */}
                    {isOpenNotes && (
                      <div style={{ marginTop: 8 }}>
                        <textarea
                          value={notesVal}
                          onChange={e => setNotesVal(e.target.value)}
                          placeholder="Call notes..."
                          rows={3}
                          autoFocus
                          style={{ width: '100%', fontSize: '0.82rem', resize: 'vertical' }}
                        />
                        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                          <button onClick={() => saveNotes(prospect.id)}
                            style={{ background: 'var(--accent)', color: 'white', border: 'none',
                                     borderRadius: 6, padding: '5px 12px', fontSize: '0.78rem',
                                     cursor: 'pointer', fontFamily: 'inherit' }}>
                            Save notes
                          </button>
                          <button onClick={() => setOpenNotes(null)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer',
                                     color: 'var(--text-muted)', fontSize: '0.78rem', fontFamily: 'inherit' }}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Call back datetime picker */}
                    {isCallBack && (
                      <div style={{ marginTop: 8, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        <input
                          type="datetime-local"
                          value={callBackVal}
                          onChange={e => setCallBackVal(e.target.value)}
                          style={{ fontSize: '0.82rem' }}
                        />
                        <button onClick={() => saveCallBack(prospect.id)}
                          style={{ background: '#8b5cf6', color: 'white', border: 'none',
                                   borderRadius: 6, padding: '5px 12px', fontSize: '0.78rem',
                                   cursor: 'pointer', fontFamily: 'inherit' }}>
                          Set reminder
                        </button>
                        <button onClick={() => setCallBackId(null)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer',
                                   color: 'var(--text-muted)', fontSize: '0.78rem', fontFamily: 'inherit' }}>
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Action bar */}
                <div style={{
                  borderTop: '1px solid var(--border)', padding: '8px 12px',
                  background: 'var(--page-bg)', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center',
                }}>
                  {PIPELINE.filter(p => p.value !== 'call_back').map(p => (
                    <button
                      key={p.value}
                      onClick={() => updateProspect(prospect.id, { phone_status: p.value })}
                      style={{
                        background: prospect.phone_status === p.value ? p.bg : 'var(--card-bg)',
                        color:      prospect.phone_status === p.value ? p.color : 'var(--text-muted)',
                        border:     `1px solid ${prospect.phone_status === p.value ? p.color : 'var(--border)'}`,
                        borderRadius: 6, padding: '4px 9px', fontSize: '0.72rem',
                        fontWeight: prospect.phone_status === p.value ? 700 : 400,
                        cursor: 'pointer', fontFamily: 'inherit',
                        display: 'flex', alignItems: 'center', gap: 4, transition: 'all 0.15s',
                      }}
                    >
                      <i className={`ti ${p.icon}`} style={{ fontSize: '0.8rem' }} />
                      {p.label}
                    </button>
                  ))}

                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                    <button
                      onClick={() => { setCallBackId(prospect.id); setCallBackVal(''); }}
                      style={{
                        background: isCallBack ? '#f5f3ff' : 'var(--card-bg)',
                        color: '#8b5cf6', border: '1px solid #e9d5ff', borderRadius: 6,
                        padding: '4px 9px', fontSize: '0.72rem', cursor: 'pointer',
                        fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4,
                      }}
                    >
                      <i className="ti ti-clock" style={{ fontSize: '0.8rem' }} />
                      Call back
                    </button>

                    <button
                      onClick={() => {
                        setOpenNotes(isOpenNotes ? null : prospect.id);
                        setNotesVal(prospect.phone_notes || '');
                      }}
                      style={{
                        background: isOpenNotes ? 'var(--tint-bg)' : 'var(--card-bg)',
                        color: 'var(--text-secondary)', border: '1px solid var(--border)',
                        borderRadius: 6, padding: '4px 9px', fontSize: '0.72rem',
                        cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4,
                      }}
                    >
                      <i className="ti ti-notes" style={{ fontSize: '0.8rem' }} />
                      {prospect.phone_notes ? 'Edit notes' : 'Add notes'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 16 }}>
        Showing {prospects.length} prospect{prospects.length !== 1 ? 's' : ''} with phone numbers
      </p>
    </div>
  );
}
