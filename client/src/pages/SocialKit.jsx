import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../utils/apiFetch.js';
import { useLocale, useT } from '../i18n/LocaleContext.jsx';

// Property type labels per locale for caption text
const TYPE_LABELS = {
  en: { bnb: 'B&B', gite: 'gite', guesthouse: 'guesthouse', hotel: 'hotel', other: 'property' },
  fr: { bnb: 'chambre d\'hotes', gite: 'gite', guesthouse: 'pension', hotel: 'hotel', other: 'hebergement' },
  de: { bnb: 'B&B', gite: 'Gite', guesthouse: 'Gasthaus', hotel: 'Hotel', other: 'Unterkunft' },
  es: { bnb: 'casa rural', gite: 'gite', guesthouse: 'casa de huespedes', hotel: 'hotel', other: 'alojamiento' },
  nl: { bnb: 'B&B', gite: 'gite', guesthouse: 'gastenhuis', hotel: 'hotel', other: 'accommodatie' },
};

// 3 caption variants per locale — {name}, {type}, {city}, {cityTag} (no spaces), {url}
const CAPTIONS = {
  en: [
    '✨ Escape to {name} — a beautiful {type} in {city}.\nBook direct and skip the platform fees 👉 {url}\n\n#DirectBooking #{cityTag}Stay #HolidayRental',
    '🏡 {name} in {city} — the kind of place you\'ll want to return to.\nSkip the middleman and book direct: {url}\n\n#BookDirect #{cityTag} #IndependentTravel',
    '📸 Come experience {name}, our {type} nestled in {city}.\nBook directly with us for the best rate: {url}\n\n#{cityTag}Getaway #TravelGram #DirectBooking',
  ],
  fr: [
    '✨ Bienvenue a {name} — un magnifique {type} a {city}.\nReservez en direct et evitez les frais 👉 {url}\n\n#ReservationDirecte #{cityTag}Sejour #LocationVacances',
    '🏡 {name} a {city} — votre prochaine escapade vous attend.\nReservez directement et profitez du meilleur tarif : {url}\n\n#BookDirect #{cityTag} #VoyageFrance',
    '📸 Chaque coin de {name} raconte une histoire. Notre {type} a {city} n\'attend plus que vous.\nReservez directement : {url}\n\n#Escapade{cityTag} #VoyageFrance #ReservationDirecte',
  ],
  de: [
    '✨ Entfliehen Sie nach {name} — ein wunderschones {type} in {city}.\nDirekt buchen, keine Plattformgebuhren 👉 {url}\n\n#Direktbuchung #{cityTag}Urlaub #Ferienunterkunft',
    '🏡 {name} in {city} — ein Ort, zu dem man immer zuruckkehren mochte.\nDirekt bei uns buchen: {url}\n\n#BookDirect #{cityTag} #Reisen',
    '📸 Jeder Winkel hat seine Geschichte. Erleben Sie {name}, unser {type} in {city}.\nJetzt direkt buchen: {url}\n\n#Urlaub{cityTag} #Reisefoto #Direktbuchung',
  ],
  es: [
    '✨ Escapate a {name} — un precioso {type} en {city}.\nReserva directo y sin comisiones 👉 {url}\n\n#ReservaDirecta #{cityTag}Escapada #AlquilerVacacional',
    '🏡 {name} en {city} — el lugar al que siempre querras volver.\nReserva directamente con nosotros: {url}\n\n#BookDirect #{cityTag} #Viaje',
    '📸 Cada rincon tiene su historia. Vive {name}, nuestro {type} en {city}.\nReserva directamente: {url}\n\n#Escapada{cityTag} #FotoViaje #ReservaDirecta',
  ],
  nl: [
    '✨ Ontsnap naar {name} — een prachtige {type} in {city}.\nBoek direct en vermijd reserveringskosten 👉 {url}\n\n#DirectBoeken #{cityTag}Vakantie #VakantieVerblijf',
    '🏡 {name} in {city} — de plek waar je altijd naar terug wilt keren.\nBoek rechtstreeks bij ons: {url}\n\n#BookDirect #{cityTag} #Reizen',
    '📸 Elk hoekje heeft zijn verhaal. Ontdek {name}, onze {type} in {city}.\nBoek nu direct: {url}\n\n#Vakantie{cityTag} #Reisfoto #DirectBoeken',
  ],
};

function fillTpl(tpl, vars) {
  return tpl
    .replace(/{name}/g, vars.name)
    .replace(/{type}/g, vars.type)
    .replace(/{city}/g, vars.city)
    .replace(/{cityTag}/g, vars.cityTag)
    .replace(/{url}/g, vars.url);
}

export default function SocialKit() {
  const { property, locale } = useLocale();
  const t = useT();
  const [photos, setPhotos]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [variantIdx, setVariantIdx] = useState({});
  const [toast, setToast]         = useState(null);
  const [guide1Open, setGuide1Open] = useState(false);
  const [guide2Open, setGuide2Open] = useState(false);

  const bookingUrl = `https://nestbook.io/book/${property?.booking_slug || property?.id}`;

  function fillStep(str) {
    return str
      .replace(/\{copyImage\}/g, t('sk.copyImage'))
      .replace(/\{copyCaption\}/g, t('sk.copyCaption'))
      .replace(/\{download\}/g, t('sk.download'));
  }

  useEffect(() => {
    if (!property?.id) return;
    let cancelled = false;
    setLoading(true);
    setPhotos([]);

    (async () => {
      const collected = [];

      // Property hero photo comes first
      if (property.hero_photo) {
        collected.push({
          id: 'hero',
          url: `/uploads/properties/${property.hero_photo}`,
          label: property.name,
          filename: property.hero_photo,
        });
      }

      // Room photos
      const r = await apiFetch('/api/rooms');
      if (r.ok) {
        const data = await r.json();
        const rooms = Array.isArray(data) ? data : (data.rooms || []);
        for (const room of rooms) {
          const pr = await apiFetch(`/api/rooms/${room.id}/photos`);
          if (pr.ok) {
            const rps = await pr.json();
            rps.forEach(p => collected.push({
              ...p,
              label: room.name,
              filename: p.url.split('/').pop(),
            }));
          }
        }
      }

      if (!cancelled) {
        setPhotos(collected);
        setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [property?.id, property?.hero_photo]);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  function getCaption(photoId, idx) {
    const templates = CAPTIONS[locale] || CAPTIONS.en;
    const vIdx      = variantIdx[photoId] ?? (idx % 3);
    const loc       = TYPE_LABELS[locale] ? locale : 'en';
    const typeLabel = TYPE_LABELS[loc]?.[property?.type] || property?.type || 'property';
    const city      = property?.city || '';
    const cityTag   = city.replace(/\s+/g, '');
    return fillTpl(templates[vIdx % templates.length], {
      name: property?.name || '',
      type: typeLabel,
      city,
      cityTag,
      url: bookingUrl,
    });
  }

  function cycleVariant(photoId) {
    setVariantIdx(prev => ({ ...prev, [photoId]: ((prev[photoId] ?? 0) + 1) % 3 }));
  }

  function copyCaption(caption) {
    navigator.clipboard.writeText(caption).then(() => showToast(t('sk.copied')));
  }

  async function copyImage(url) {
    try {
      if (!navigator.clipboard?.write) throw new Error('unsupported');
      const res  = await fetch(url);
      const blob = await res.blob();
      // Draw onto canvas so we can export as PNG — the only format
      // reliably accepted by clipboard.write() across all browsers.
      const img  = await createImageBitmap(blob);
      const canvas = document.createElement('canvas');
      canvas.width  = img.width;
      canvas.height = img.height;
      canvas.getContext('2d').drawImage(img, 0, 0);
      const pngBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
      showToast(t('sk.imageCopied'));
    } catch {
      showToast(t('sk.imageCopyFail'));
    }
  }

  async function downloadPhoto(url, filename) {
    try {
      const res  = await fetch(url);
      const blob = await res.blob();
      const obj  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = obj;
      a.download = filename || url.split('/').pop();
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(obj);
    } catch {
      window.open(url, '_blank');
    }
  }

  return (
    <div style={{ padding: '28px 24px 48px', maxWidth: 1100, margin: '0 auto' }}>
      <div className="page-header">
        <h1>{t('socialKit')}</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: 4 }}>
          {t('sk.subtitle')}
        </p>
      </div>

      {/* Help guide accordions */}
      <div style={{ marginBottom: 28, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="danger-zone-card">
          <button
            className="danger-zone-toggle"
            onClick={() => setGuide1Open((o) => !o)}
            aria-expanded={guide1Open}
          >
            <span>{t('sk.help1.heading')}</span>
            <span className="danger-zone-chevron">{guide1Open ? '▲' : '▼'}</span>
          </button>
          {guide1Open && (
            <div className="danger-zone-body" style={{ padding: '20px 24px' }}>
              <StepSection number={1} title={t('sk.help1.s1.title')}>
                <p style={GUIDE_P}>{t('sk.help1.s1.p1')}</p>
                <p style={GUIDE_P}>{t('sk.help1.s1.p2')}</p>
              </StepSection>
              <StepSection number={2} title={t('sk.help1.s2.title')}>
                <ol style={GUIDE_OL}>
                  {(t('sk.help1.s2.steps') || []).map((s, i) => <li key={i}>{s}</li>)}
                </ol>
                <p style={GUIDE_P}>{t('sk.help1.s2.done')}</p>
              </StepSection>
              <StepSection number={3} title={t('sk.help1.s3.title')}>
                <ol style={GUIDE_OL}>
                  {(t('sk.help1.s3.steps') || []).map((s, i) => <li key={i}>{s}</li>)}
                </ol>
                <p style={GUIDE_P}>{t('sk.help1.s3.why')}</p>
              </StepSection>
            </div>
          )}
        </div>

        <div className="danger-zone-card">
          <button
            className="danger-zone-toggle"
            onClick={() => setGuide2Open((o) => !o)}
            aria-expanded={guide2Open}
          >
            <span>{t('sk.help2.heading')}</span>
            <span className="danger-zone-chevron">{guide2Open ? '▲' : '▼'}</span>
          </button>
          {guide2Open && (
            <div className="danger-zone-body" style={{ padding: '20px 24px' }}>
              <PlatformSection title={t('sk.help2.fb.title')}>
                <ol style={GUIDE_OL}>
                  {(t('sk.help2.fb.steps') || []).map((s, i) => <li key={i}>{fillStep(s)}</li>)}
                </ol>
              </PlatformSection>
              <PlatformSection title={t('sk.help2.ig.title')}>
                <ol style={GUIDE_OL}>
                  {(t('sk.help2.ig.steps') || []).map((s, i) => <li key={i}>{fillStep(s)}</li>)}
                </ol>
              </PlatformSection>
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Loading&hellip;
        </div>
      ) : photos.length === 0 ? (
        <EmptyState t={t} />
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: 24,
        }}>
          {photos.map((photo, idx) => {
            const caption = getCaption(photo.id, idx);
            const vIdx    = variantIdx[photo.id] ?? (idx % 3);
            return (
              <PhotoCard
                key={photo.id}
                photo={photo}
                caption={caption}
                vIdx={vIdx}
                t={t}
                onCycle={() => cycleVariant(photo.id)}
                onCopy={() => copyCaption(caption)}
                onCopyImage={() => copyImage(photo.url)}
                onDownload={() => downloadPhoto(photo.url, photo.filename)}
              />
            );
          })}
        </div>
      )}

      {!loading && (
        <div style={{
          marginTop: 40,
          background: 'var(--card-bg)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: '20px 24px',
        }}>
          <p style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 12, color: 'var(--text-primary)' }}>
            {t('sk.reassure.heading')}
          </p>
          <ul style={{ paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8, margin: 0, fontSize: '0.875rem', lineHeight: 1.65, color: 'var(--text-secondary)' }}>
            {(t('sk.reassure.items') || []).map((item, i) => <li key={i}>{item}</li>)}
          </ul>
        </div>
      )}

      {toast && <div className="toast toast-success">{toast}</div>}
    </div>
  );
}

function PhotoCard({ photo, caption, vIdx, t, onCycle, onCopy, onCopyImage, onDownload }) {
  return (
    <div style={{
      background: 'var(--card-bg)',
      borderRadius: 12,
      border: '1px solid var(--border)',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    }}>
      {/* Photo */}
      <div style={{ position: 'relative', aspectRatio: '4/3', overflow: 'hidden', background: 'var(--section-bg)' }}>
        <img
          src={photo.url}
          alt={photo.label}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          background: 'linear-gradient(transparent, rgba(0,0,0,0.55))',
          padding: '24px 12px 10px',
        }}>
          <span style={{ color: '#fff', fontSize: '0.8rem', fontWeight: 600, textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>
            {photo.label}
          </span>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '14px 16px 16px', flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Caption text */}
        <div style={{
          background: 'var(--page-bg)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '10px 12px',
          fontSize: '0.8rem',
          lineHeight: 1.65,
          color: 'var(--text-primary)',
          whiteSpace: 'pre-line',
          flex: 1,
          minHeight: 110,
        }}>
          {caption}
        </div>

        {/* Variant cycle */}
        <button
          onClick={onCycle}
          style={{
            background: 'none', border: 'none', padding: 0,
            fontSize: '0.75rem', color: 'var(--text-muted)',
            cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', gap: 4,
          }}
        >
          <span style={{ fontSize: '0.7rem' }}>&#8635;</span>
          {t('sk.tryAnother')} &middot; {vIdx + 1}/3
        </button>

        {/* Action buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button
            onClick={onCopy}
            style={{
              padding: '8px 10px',
              background: 'var(--accent)', color: '#fff',
              border: 'none', borderRadius: 8,
              fontSize: '0.8rem', fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {t('sk.copyCaption')}
          </button>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={onCopyImage}
              style={{
                flex: 1, padding: '8px 10px',
                background: 'var(--btn-secondary-bg)', color: 'var(--btn-secondary-text)',
                border: '1px solid var(--border)', borderRadius: 8,
                fontSize: '0.8rem', fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              {t('sk.copyImage')}
            </button>
            <button
              onClick={onDownload}
              style={{
                flex: 1, padding: '8px 10px',
                background: 'var(--btn-secondary-bg)', color: 'var(--btn-secondary-text)',
                border: '1px solid var(--border)', borderRadius: 8,
                fontSize: '0.8rem', fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              {t('sk.download')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ t }) {
  return (
    <div style={{
      textAlign: 'center', padding: '64px 24px',
      color: 'var(--text-muted)',
    }}>
      <div style={{ fontSize: '3rem', marginBottom: 16, lineHeight: 1 }}>📸</div>
      <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8, margin: '0 0 8px' }}>
        {t('sk.noPhotos')}
      </h3>
      <p style={{ fontSize: '0.875rem', maxWidth: 340, margin: '0 auto', lineHeight: 1.6 }}>
        {t('sk.noPhotosHint')}
      </p>
    </div>
  );
}

const GUIDE_P  = { fontSize: '0.875rem', lineHeight: 1.65, marginTop: 8, color: 'var(--text-primary)' };
const GUIDE_OL = { paddingLeft: 20, margin: '8px 0 12px', display: 'flex', flexDirection: 'column', gap: 8, fontSize: '0.875rem', lineHeight: 1.65, color: 'var(--text-primary)' };

function StepSection({ number, title, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 6 }}>
        <span style={{
          background: 'var(--accent)', color: '#fff',
          borderRadius: '50%', minWidth: 24, height: 24,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.78rem', fontWeight: 700, flexShrink: 0,
        }}>{number}</span>
        <strong style={{ fontSize: '0.9rem', lineHeight: 1.4 }}>{title}</strong>
      </div>
      {children}
    </div>
  );
}

function PlatformSection({ title, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <strong style={{ display: 'block', fontSize: '0.88rem', marginBottom: 8, color: 'var(--text-primary)' }}>{title}</strong>
      {children}
    </div>
  );
}
