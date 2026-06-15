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

const PROMPT_GROUPS = [
  {
    id: 'positive',
    label: 'Positive responses',
    subtitle: 'They sound friendly, open or interested',
    color: '#1a4710',
    bg: '#f0fdf4',
    border: '#d9f0cc',
    icon: 'ti-thumb-up',
    prompts: [
      {
        trigger: '"Tell me more / That sounds interesting"',
        response: "Brilliant! So in a nutshell — you get your own booking page at nestbook.io/book/your-property-name. Share that link anywhere — Facebook, Instagram, your email signature — and guests book directly with you. No commission to anyone. Would it help if I sent you a link so you can see what it actually looks like?",
        tip: "Don't overwhelm. One idea. Get them to the demo page.",
        next: 'Send nestbook.io/how-it-works by text or email while still on the call.',
      },
      {
        trigger: '"How much does it cost?"',
        response: "The free plan is completely free — no credit card, no time limit, up to three rooms. If you want the full booking widget for your website it's £19 a month. And there's absolutely no commission on any booking, ever — just that flat fee.",
        tip: 'Pause after "£19 a month." Let it land. Do not fill the silence.',
        next: 'If they hesitate — "Most owners find it pays for itself after just one or two direct bookings."',
      },
      {
        trigger: '"We do get quite a lot through Booking.com"',
        response: "That's great — most of our owners do and they keep using it. The idea is that when a guest comes back for a second stay, they book directly with you instead of going through Booking.com again. You'd keep that 15% commission on repeat guests. It works alongside what you already have.",
        tip: 'Never criticise Booking.com. Position NestBook as complementary, not competitive.',
        next: 'Ask — "Roughly what percentage of your bookings come back to you directly at the moment?"',
      },
      {
        trigger: '"We\'ve been thinking about direct bookings actually"',
        response: "Oh perfect timing then! Lots of owners are thinking the same thing — the commission fees really do add up. Can I ask — do you have a Facebook business page for the property? Because one of the most popular features is a Book Now button that links directly to your own booking page.",
        tip: 'Golden lead. Match their energy — enthusiastic but not pushy.',
        next: 'Get them to the demo. "Would you like me to send you a link to see what it looks like?"',
      },
      {
        trigger: '"What\'s the difference from what we currently use?"',
        response: "Good question — what are you using at the moment? [Listen] Right — the main difference with NestBook is that it gives you your own property page that you actually own. So when someone finds you on Facebook or Instagram they can book directly with you, not through a platform. And there's no commission on those bookings.",
        tip: 'Always ask what they use first. Never assume. Tailor the answer to what they tell you.',
        next: 'If they name a competitor — acknowledge it, then focus on the direct booking angle.',
      },
      {
        trigger: '"Can I see an example / what does it look like?"',
        response: "Absolutely — I can send you a link right now if you have a minute. It's a real live property page — rooms, photos, availability calendar, direct booking button. Takes about 20 minutes to set up. What's the best number or email to send it to?",
        tip: 'This is the best possible response. Get their contact details while you have them.',
        next: 'Send nestbook.io/book/the-lodge-at-nestbook by text while still on the call.',
      },
      {
        trigger: '"Does it work with Airbnb and Booking.com?"',
        response: "Yes — it syncs with both via iCal, which is the standard calendar format they all use. So any booking that comes in anywhere automatically blocks those dates everywhere else. No double bookings.",
        tip: 'iCal sync is a genuine concern for busy properties. Reassure them on this first, then continue.',
        next: '"So you\'d have everything in one place — your own bookings and the platform bookings all on one calendar."',
      },
      {
        trigger: '"How long does it take to set up?"',
        response: "Most owners are up and running in about 20 minutes — add your property details, upload a photo or two, and your booking page is live. The Facebook button takes about two minutes once the page is set up.",
        tip: '"20 minutes" is credible and not intimidating. Never say "instant" — it sounds like a sales pitch.',
        next: '"The free plan means you can have a look with no commitment — nothing to lose."',
      },
      {
        trigger: '"Is there a free trial?"',
        response: "There's a free plan that's free forever — up to three rooms, your own booking page, Facebook button, calendar sync. If you want the full booking widget for your own website, Pro is £19 a month with a 30-day free trial. No credit card needed to start.",
        tip: 'Lead with the free plan. "Trial" sounds temporary — "free plan" sounds permanent.',
        next: '"Would you like me to send you the link to sign up? Takes about a minute."',
      },
      {
        trigger: '"A friend recommended you / we\'ve heard of NestBook"',
        response: "Oh that's wonderful to hear — thank you! Can I ask who mentioned us? It's always nice to know. Yes — they're absolutely right, it's really straightforward. Have you had a chance to look at the website at all?",
        tip: 'This is warm gold. Ask who referred them — a name makes the conversation personal.',
        next: "They're already warm. Move straight to the demo or sign-up link.",
      },
    ],
  },
  {
    id: 'negative',
    label: 'Negative or difficult responses',
    subtitle: 'They sound guarded, resistant or distracted',
    color: '#92400e',
    bg: '#fef3c7',
    border: '#f59e0b',
    icon: 'ti-shield',
    prompts: [
      {
        trigger: '"We\'re not interested"',
        response: "Absolutely fine — I'm sorry to have bothered you! Would it be alright if I sent you a very brief email with a link, just in case it's ever useful in future? No obligation at all.",
        tip: 'Never push. The graceful exit leaves a far better impression than any pitch.',
        next: 'If they agree to the email — that is a win. Add to email sequence immediately.',
      },
      {
        trigger: '"We already have a booking system"',
        response: "Oh great — what are you using at the moment? [Listen] Right — NestBook would work alongside that rather than replacing it. The main thing we add is the direct booking page and Facebook button so guests who find you on social media can book without going through a platform. But if you're happy with what you have, that's absolutely fine.",
        tip: 'Ask what they use. If it is a big competitor — acknowledge it. If it is a simple system — there may be a gap.',
        next: '"Is it connected to your Facebook page at the moment?" — opens a new angle.',
      },
      {
        trigger: '"We\'re happy with Booking.com"',
        response: "That's completely understandable — Booking.com is brilliant for getting new guests through the door. The only question is whether your repeat guests book directly with you the second time, or go back through Booking.com again and cost you 15% again. That's really all we help with.",
        tip: "Don't argue. Plant the seed. The 15% on repeat guests is the thought to leave them with.",
        next: '"Worth a think anyway — the free plan costs nothing if you ever want to try it."',
      },
      {
        trigger: '"We don\'t take online bookings"',
        response: "Ah right — do you prefer phone bookings? That makes sense for some properties. NestBook can actually work that way too — the booking page just shows your availability and has a contact form for guests to enquire. No obligation to take card payments online.",
        tip: 'Some owners are genuinely phone-only and proud of it. Respect that completely.',
        next: '"It basically gives you a professional page to point people to — even if they still call to confirm."',
      },
      {
        trigger: '"We\'re retiring / selling up"',
        response: "Oh congratulations — or commiserations, depending how you feel about it! That's completely understandable. I hope it all goes smoothly. If you ever know anyone in the trade who might find it useful, we'd be very grateful for a mention.",
        tip: 'Genuine warmth. Ask for a referral — the most natural thing in the world at this point.',
        next: 'Ask if they know other B&B owners locally who might be interested.',
      },
      {
        trigger: '"Can you send an email / call back later"',
        response: "Of course — I'm sorry to have caught you at a bad time! What's the best email address to send it to? [If they give it] Perfect — I'll drop you a very brief email with a link, no pressure at all. And if you'd prefer I call back, when would suit you best?",
        tip: 'Getting an email address from a phone call is a win. Add to email sequence immediately.',
        next: 'Send the how-it-works link within the hour while you are still fresh in their mind.',
      },
      {
        trigger: '"We can\'t afford anything extra at the moment"',
        response: "That's completely understandable — things are tough for a lot of independent properties right now. The free plan costs absolutely nothing — it's genuinely free, no credit card, no trial period. It might be worth a look just to have the booking page there for when things pick up.",
        tip: 'Never argue about money. The free plan is the answer to every budget objection.',
        next: '"Nothing to lose with the free version — it just gives you a professional page."',
      },
      {
        trigger: '"How did you get this number?"',
        response: "Your number is listed on your website and Google listing — I'm terribly sorry if it's not convenient! I'll keep this very brief, or I can let you go — whatever you prefer.",
        tip: 'Be honest and immediately apologetic. If it is NOT on their website — apologise unreservedly and offer to remove them.',
        next: 'If they soften — continue briefly. If not — apologise again and end the call gracefully.',
      },
      {
        trigger: '"We\'re too small / only have 2 rooms"',
        response: "The free plan works perfectly for smaller properties — it's actually designed with smaller B&Bs in mind. Two rooms is absolutely fine. You'd get your own booking page and Facebook button, same as everyone else, completely free.",
        tip: 'Small properties often feel overlooked by tech companies. This is your moment to be different.',
        next: '"Some of our most enthusiastic owners have just two or three rooms — it is ideal for them."',
      },
      {
        trigger: '"We tried something like this before and it didn\'t work"',
        response: "Oh that's really useful to know — can I ask what happened? Was it the setup that was complicated, or did guests just not use it? [Listen carefully] Right — that's a really common experience actually. The difference with NestBook is [address their specific issue directly]. But I completely understand the hesitation.",
        tip: 'This is the most valuable objection. Listen carefully — their experience tells you exactly what to address.',
        next: 'Address their specific pain point. Never give a generic response to this one.',
      },
    ],
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

      {/* Call prompts — two-group decision tree */}
      <div style={{
        background: 'var(--card-bg)', border: '1.5px solid var(--accent)',
        borderRadius: 10, marginBottom: 16, overflow: 'hidden',
      }}>
        {/* Main header */}
        <button
          onClick={() => setOpenPrompt(openPrompt === 'main' ? null : 'main')}
          style={{
            width: '100%', background: '#1a4710', border: 'none', padding: '13px 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          <span style={{ color: 'white', fontWeight: 700, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 8 }}>
            <i className="ti ti-message-circle" aria-hidden="true" />
            Call prompts — tap what they said
          </span>
          <i className={`ti ${openPrompt === 'main' ? 'ti-chevron-up' : 'ti-chevron-down'}`}
            style={{ color: 'rgba(255,255,255,0.7)', fontSize: '1rem' }} aria-hidden="true" />
        </button>

        {/* Groups */}
        {(openPrompt === 'main' || PROMPT_GROUPS.some(g => openPrompt === g.id || (openPrompt || '').startsWith(g.id + '-'))) &&
          PROMPT_GROUPS.map(group => {
            const groupOpen = openPrompt === group.id || (openPrompt || '').startsWith(group.id + '-');
            return (
              <div key={group.id} style={{ borderBottom: '1px solid var(--border)' }}>

                {/* Group header */}
                <button
                  onClick={() => setOpenPrompt(groupOpen && openPrompt === group.id ? 'main' : group.id)}
                  style={{
                    width: '100%', background: group.bg, border: 'none',
                    borderBottom: `1px solid ${group.border}`, padding: '11px 16px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <i className={`ti ${group.icon}`} style={{ fontSize: '1rem', color: group.color }} aria-hidden="true" />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.88rem', color: group.color }}>{group.label}</div>
                      <div style={{ fontSize: '0.72rem', color: group.color, opacity: 0.7, marginTop: 1 }}>{group.subtitle}</div>
                    </div>
                  </div>
                  <i className={`ti ${groupOpen ? 'ti-chevron-up' : 'ti-chevron-down'}`}
                    style={{ color: group.color, fontSize: '0.9rem', opacity: 0.7, flexShrink: 0 }} aria-hidden="true" />
                </button>

                {/* Individual prompts */}
                {groupOpen && group.prompts.map((prompt, i) => {
                  const promptKey = `${group.id}-${i}`;
                  const isOpen = openPrompt === promptKey;
                  return (
                    <div key={i} style={{ borderBottom: i < group.prompts.length - 1 ? '1px solid var(--border)' : 'none' }}>
                      <button
                        onClick={() => setOpenPrompt(isOpen ? group.id : promptKey)}
                        style={{
                          width: '100%', background: isOpen ? 'var(--tint-bg)' : 'var(--card-bg)',
                          border: 'none', padding: '10px 16px 10px 28px',
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', gap: 8,
                        }}
                      >
                        <span style={{ fontSize: '0.83rem', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.4 }}>
                          {prompt.trigger}
                        </span>
                        <i className={`ti ${isOpen ? 'ti-chevron-up' : 'ti-chevron-right'}`}
                          style={{ color: 'var(--text-muted)', fontSize: '0.85rem', flexShrink: 0 }} aria-hidden="true" />
                      </button>

                      {isOpen && (
                        <div style={{ padding: '0 16px 16px 28px' }}>
                          <div style={{
                            background: '#f0fdf4', border: '1px solid #d9f0cc',
                            borderLeft: '4px solid #1a4710', borderRadius: '0 8px 8px 0',
                            padding: '12px 14px', fontSize: '0.85rem', color: '#1a2e14',
                            lineHeight: 1.7, fontStyle: 'italic', marginBottom: 8,
                          }}>
                            <div style={{
                              fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase',
                              letterSpacing: '0.07em', color: '#1a4710', marginBottom: 6, fontStyle: 'normal',
                            }}>What to say</div>
                            "{prompt.response}"
                          </div>
                          <div style={{
                            background: '#fef3c7', borderLeft: '3px solid #f59e0b',
                            padding: '8px 12px', fontSize: '0.78rem', color: '#78350f',
                            lineHeight: 1.55, borderRadius: '0 6px 6px 0', marginBottom: 6,
                          }}>
                            <strong>Tip:</strong> {prompt.tip}
                          </div>
                          <div style={{
                            background: '#dbeafe', borderLeft: '3px solid #3b82f6',
                            padding: '8px 12px', fontSize: '0.78rem', color: '#1e3a5f',
                            lineHeight: 1.55, borderRadius: '0 6px 6px 0',
                          }}>
                            <strong>Next:</strong> {prompt.next}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })
        }
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
