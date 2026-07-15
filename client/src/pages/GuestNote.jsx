import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

const TX = {
  en: {
    title:       'Share a note about your stay',
    intro:       (name) => `We'd love to hear about your time at ${name}. Your note might be shared with future guests on our website.`,
    namePlaceholder: 'Your first name',
    placeholder: 'We loved...',
    submit:      'Submit note',
    success:     'Thank you! Your note has been submitted and may appear on our website soon.',
    expired:     'This link has expired. Please contact the property directly.',
    already:     'You have already submitted a note for this stay. Thank you!',
    error:       'Something went wrong. Please try again.',
    nameLabel:   'Your name',
    noteLabel:   'Your note',
    charCount:   (n) => `${n}/400`,
  },
  fr: {
    title:       'Partagez un mot sur votre séjour',
    intro:       (name) => `Nous aimerions beaucoup savoir comment s'est passé votre séjour chez ${name}. Votre message pourra être partagé avec de futurs voyageurs sur notre site.`,
    namePlaceholder: 'Votre prénom',
    placeholder: 'Nous avons adoré...',
    submit:      'Envoyer mon message',
    success:     'Merci ! Votre message a été envoyé et pourra apparaître sur notre site prochainement.',
    expired:     'Ce lien a expiré. Veuillez contacter l\'établissement directement.',
    already:     'Vous avez déjà soumis un message pour ce séjour. Merci !',
    error:       'Une erreur s\'est produite. Veuillez réessayer.',
    nameLabel:   'Votre nom',
    noteLabel:   'Votre message',
    charCount:   (n) => `${n}/400`,
  },
  de: {
    title:       'Teilen Sie ein paar Worte über Ihren Aufenthalt',
    intro:       (name) => `Wir würden gerne hören, wie Ihr Aufenthalt bei ${name} war. Ihre Nachricht könnte künftigen Gästen auf unserer Website gezeigt werden.`,
    namePlaceholder: 'Ihr Vorname',
    placeholder: 'Wir haben es geliebt...',
    submit:      'Nachricht senden',
    success:     'Vielen Dank! Ihre Nachricht wurde übermittelt und könnte bald auf unserer Website erscheinen.',
    expired:     'Dieser Link ist abgelaufen. Bitte kontaktieren Sie die Unterkunft direkt.',
    already:     'Sie haben bereits eine Nachricht für diesen Aufenthalt eingereicht. Vielen Dank!',
    error:       'Etwas ist schiefgelaufen. Bitte versuchen Sie es erneut.',
    nameLabel:   'Ihr Name',
    noteLabel:   'Ihre Nachricht',
    charCount:   (n) => `${n}/400`,
  },
  es: {
    title:       'Comparte unas palabras sobre tu estancia',
    intro:       (name) => `Nos encantaría saber cómo fue tu estancia en ${name}. Tu mensaje podría compartirse con futuros huéspedes en nuestra web.`,
    namePlaceholder: 'Tu nombre',
    placeholder: 'Nos encantó...',
    submit:      'Enviar mensaje',
    success:     '¡Gracias! Tu mensaje se ha enviado y podría aparecer pronto en nuestra web.',
    expired:     'Este enlace ha caducado. Por favor, contacta directamente con el alojamiento.',
    already:     'Ya has enviado un mensaje sobre esta estancia. ¡Gracias!',
    error:       'Algo salió mal. Por favor, inténtalo de nuevo.',
    nameLabel:   'Tu nombre',
    noteLabel:   'Tu mensaje',
    charCount:   (n) => `${n}/400`,
  },
  nl: {
    title:       'Deel een berichtje over je verblijf',
    intro:       (name) => `We horen graag hoe je verblijf bij ${name} was. Je berichtje kan mogelijk gedeeld worden met toekomstige gasten op onze website.`,
    namePlaceholder: 'Je voornaam',
    placeholder: 'We vonden het geweldig...',
    submit:      'Berichtje versturen',
    success:     'Bedankt! Je berichtje is verzonden en kan binnenkort op onze website verschijnen.',
    expired:     'Deze link is verlopen. Neem rechtstreeks contact op met de accommodatie.',
    already:     'Je hebt al een berichtje ingediend voor dit verblijf. Bedankt!',
    error:       'Er is iets misgegaan. Probeer het opnieuw.',
    nameLabel:   'Je naam',
    noteLabel:   'Je berichtje',
    charCount:   (n) => `${n}/400`,
  },
};

export default function GuestNote() {
  const [searchParams] = useSearchParams();
  const b   = searchParams.get('b')   || '';
  const exp = searchParams.get('exp') || '';
  const t   = searchParams.get('t')   || '';

  const [state, setState]     = useState('loading'); // loading | form | success | expired | already | error
  const [formData, setFormData] = useState({ firstName: '', propertyName: '', locale: 'en' });
  const [guestName, setGuestName] = useState('');
  const [noteText,  setNoteText]  = useState('');
  const [submitting, setSubmitting] = useState(false);

  const tx = TX[formData.locale] || TX.en;

  useEffect(() => {
    if (!b || !exp || !t) { setState('expired'); return; }
    fetch(`/api/guest-notes/form?b=${encodeURIComponent(b)}&exp=${encodeURIComponent(exp)}&t=${encodeURIComponent(t)}`)
      .then(async r => {
        if (r.status === 409) { setState('already'); return; }
        if (r.status === 401) { setState('expired'); return; }
        if (!r.ok) { setState('error'); return; }
        const data = await r.json();
        setFormData(data);
        setGuestName(data.firstName || '');
        setState('form');
      })
      .catch(() => setState('error'));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(e) {
    e.preventDefault();
    if (!noteText.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/guest-notes/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ b, exp, t, guestName: guestName.trim(), noteText: noteText.trim() }),
      });
      if (res.status === 409) { setState('already'); return; }
      if (res.status === 401) { setState('expired'); return; }
      if (!res.ok) { setState('error'); return; }
      setState('success');
    } catch {
      setState('error');
    } finally {
      setSubmitting(false);
    }
  }

  const pageStyle = {
    minHeight: '100vh',
    background: '#f8f9fa',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    padding: '48px 16px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
    color: '#1e293b',
  };

  const cardStyle = {
    background: '#fff',
    borderRadius: 16,
    boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
    padding: '40px 36px',
    maxWidth: 500,
    width: '100%',
  };

  const logoStyle = {
    display: 'block',
    fontSize: '0.75rem',
    color: '#94a3b8',
    textAlign: 'center',
    marginBottom: 28,
    textDecoration: 'none',
  };

  if (state === 'loading') {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <div style={{ textAlign: 'center', color: '#64748b', padding: '24px 0' }}>Loading…</div>
        </div>
      </div>
    );
  }

  if (state === 'success') {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <a href="https://nestbook.io" style={logoStyle}>Powered by NestBook</a>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: 16 }}>✓</div>
            <p style={{ fontSize: '1rem', lineHeight: 1.7, color: '#374151' }}>{tx.success}</p>
          </div>
        </div>
      </div>
    );
  }

  if (state === 'already') {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <a href="https://nestbook.io" style={logoStyle}>Powered by NestBook</a>
          <p style={{ textAlign: 'center', color: '#64748b', lineHeight: 1.7 }}>
            {(TX[formData.locale] || TX.en).already}
          </p>
        </div>
      </div>
    );
  }

  if (state === 'expired') {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <a href="https://nestbook.io" style={logoStyle}>Powered by NestBook</a>
          <p style={{ textAlign: 'center', color: '#64748b', lineHeight: 1.7 }}>
            {(TX[formData.locale] || TX.en).expired}
          </p>
        </div>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <a href="https://nestbook.io" style={logoStyle}>Powered by NestBook</a>
          <p style={{ textAlign: 'center', color: '#ef4444', lineHeight: 1.7 }}>{TX.en.error}</p>
        </div>
      </div>
    );
  }

  // state === 'form'
  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <a href="https://nestbook.io" style={logoStyle}>Powered by NestBook</a>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: 12 }}>{tx.title}</h1>
        <p style={{ fontSize: '0.92rem', lineHeight: 1.7, color: '#475569', marginBottom: 28 }}>
          {tx.intro(formData.propertyName)}
        </p>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 18 }}>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 6, color: '#374151' }}>
              {tx.nameLabel}
            </label>
            <input
              type="text"
              value={guestName}
              onChange={e => setGuestName(e.target.value)}
              placeholder={tx.namePlaceholder}
              maxLength={100}
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 8,
                border: '1px solid #e2e8f0', fontSize: '0.95rem',
                fontFamily: 'inherit', boxSizing: 'border-box',
              }}
            />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 6, color: '#374151' }}>
              {tx.noteLabel}
            </label>
            <textarea
              value={noteText}
              onChange={e => setNoteText(e.target.value.slice(0, 400))}
              placeholder={tx.placeholder}
              rows={5}
              required
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 8,
                border: '1px solid #e2e8f0', fontSize: '0.95rem',
                fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box',
              }}
            />
            <div style={{ textAlign: 'right', fontSize: '0.75rem', color: '#94a3b8', marginTop: 4 }}>
              {tx.charCount(noteText.length)}
            </div>
          </div>
          <button
            type="submit"
            disabled={!noteText.trim() || submitting}
            style={{
              width: '100%', padding: '12px', borderRadius: 8, border: 'none',
              background: submitting || !noteText.trim() ? '#94a3b8' : '#1a4710',
              color: '#fff', fontSize: '1rem', fontWeight: 700,
              cursor: submitting || !noteText.trim() ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {submitting ? '…' : tx.submit}
          </button>
        </form>
      </div>
    </div>
  );
}
