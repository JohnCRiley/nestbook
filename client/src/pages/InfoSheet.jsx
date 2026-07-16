import { useState, useRef } from 'react';
import { apiFetch } from '../utils/apiFetch.js';
import { useLocale, useT } from '../i18n/LocaleContext.jsx';
import PlanGate from '../components/PlanGate.jsx';

const CARD = {
  background: 'var(--card-bg)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: '20px 24px',
  marginBottom: 16,
};
const LBL = {
  display: 'block',
  fontWeight: 600,
  fontSize: '0.875rem',
  color: 'var(--text-primary)',
  marginBottom: 4,
};
const HINT = {
  fontSize: '0.8rem',
  color: 'var(--text-secondary)',
  marginBottom: 8,
  marginTop: 0,
};
const INPUT = {
  width: '100%',
  border: '1px solid var(--border)',
  borderRadius: 6,
  padding: '8px 10px',
  fontSize: '0.875rem',
  fontFamily: 'inherit',
  background: 'var(--input-bg, var(--card-bg))',
  color: 'var(--text-primary)',
  resize: 'vertical',
  lineHeight: 1.6,
};

// ── Preview sub-components ────────────────────────────────────────────────────

function PreviewSection({ emoji, title, children }) {
  return (
    <div style={{
      background: '#f7fffe',
      border: '1px solid #c8e8e2',
      borderRadius: 6,
      padding: '12px 16px',
      marginBottom: 12,
    }}>
      <div style={{
        fontSize: 11,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: '#1e6e5e',
        marginBottom: 8,
      }}>
        {emoji} {title}
      </div>
      {children}
    </div>
  );
}

function PreviewGrid({ children }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      {children}
    </div>
  );
}

function PreviewField({ label, value, mono }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: '#999', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </div>
      <div style={{
        fontSize: 15,
        fontWeight: 600,
        color: '#1a1a2e',
        marginTop: 2,
        ...(mono ? {
          fontFamily: 'monospace',
          background: '#e6f4f0',
          padding: '2px 6px',
          borderRadius: 3,
          display: 'inline-block',
        } : {}),
      }}>
        {value}
      </div>
    </div>
  );
}

function SheetPreview({ property, houseRules, localTips, t }) {
  const hasWifi = property?.wifi_network_name || property?.wifi_password;
  const hasBreakfast = property?.breakfast_included;
  const hasRules = houseRules.trim();
  const hasTips = localTips.trim();
  const hasSpecial = property?.special_banner_enabled && property?.special_banner_text?.trim();
  const locationLine = [property?.city, property?.country].filter(Boolean).join(', ');

  return (
    <div style={{
      background: '#fff',
      border: '1px solid #d0d0d0',
      borderRadius: 8,
      padding: '28px 32px',
      fontFamily: 'Georgia, serif',
      color: '#1a1a2e',
      boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        paddingBottom: 16,
        borderBottom: '3px solid #1e6e5e',
        marginBottom: 18,
      }}>
        {property?.logo_url && (
          <img
            src={`/uploads/logos/${property.logo_url}`}
            alt={property.name}
            style={{ width: 60, height: 60, objectFit: 'contain', borderRadius: 6, flexShrink: 0 }}
          />
        )}
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#1e6e5e' }}>
            {property?.name || 'Your Property'}
          </div>
          <div style={{ fontSize: 12, color: '#888', fontStyle: 'italic', marginTop: 2 }}>
            Welcome to your stay{locationLine ? ` · ${locationLine}` : ''}
          </div>
        </div>
      </div>

      {/* WiFi */}
      {hasWifi ? (
        <PreviewSection emoji="📶" title={t('is.wifi')}>
          <PreviewGrid>
            {property.wifi_network_name && (
              <PreviewField label={t('is.wifiNetwork')} value={property.wifi_network_name} />
            )}
            {property.wifi_password && (
              <PreviewField label={t('is.wifiPassword')} value={property.wifi_password} mono />
            )}
          </PreviewGrid>
        </PreviewSection>
      ) : (
        <div style={{
          fontSize: 12,
          color: '#aaa',
          background: '#f9f9f9',
          border: '1px dashed #ddd',
          borderRadius: 6,
          padding: '10px 14px',
          marginBottom: 12,
          fontStyle: 'italic',
        }}>
          📶 {t('is.noWifi')}
        </div>
      )}

      {/* Check-in / out */}
      <PreviewSection emoji="🕐" title={t('is.checkInOut')}>
        <PreviewGrid>
          <PreviewField label={t('is.checkIn')} value={property?.check_in_time || '15:00'} />
          <PreviewField label={t('is.checkOut')} value={property?.check_out_time || '11:00'} />
        </PreviewGrid>
      </PreviewSection>

      {/* Breakfast */}
      {hasBreakfast && (
        <PreviewSection emoji="☕" title={t('is.breakfast')}>
          <PreviewGrid>
            <PreviewField
              label={t('is.breakfastServed')}
              value={`${property.breakfast_start_time || '07:00'} – ${property.breakfast_end_time || '11:00'}`}
            />
            {property.breakfast_price > 0 && (
              <PreviewField
                label="Price per person"
                value={`${property.currency || '€'}${parseFloat(property.breakfast_price).toFixed(2)}`}
              />
            )}
          </PreviewGrid>
        </PreviewSection>
      )}

      {/* House rules */}
      {hasRules && (
        <PreviewSection emoji="📋" title={t('is.houseRules')}>
          <div style={{ fontSize: 13, lineHeight: 1.75, color: '#444', whiteSpace: 'pre-wrap' }}>
            {houseRules}
          </div>
        </PreviewSection>
      )}

      {/* Local tips */}
      {hasTips && (
        <PreviewSection emoji="📍" title={t('is.localTips')}>
          <div style={{ fontSize: 13, lineHeight: 1.75, color: '#444', whiteSpace: 'pre-wrap' }}>
            {localTips}
          </div>
        </PreviewSection>
      )}

      {/* Special offer */}
      {hasSpecial && (
        <div style={{
          background: '#1e6e5e',
          color: '#fff',
          borderRadius: 6,
          padding: '12px 16px',
          marginBottom: 12,
        }}>
          <div style={{
            fontSize: 11,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: '#a8e6da',
            marginBottom: 6,
          }}>
            ✨ {t('is.specialOffer')}
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
            {property.special_banner_text}
          </div>
        </div>
      )}

      {!hasRules && !hasTips && !hasWifi && !hasBreakfast && !hasSpecial && (
        <div style={{
          fontSize: 12,
          color: '#aaa',
          textAlign: 'center',
          padding: '12px 0',
          fontStyle: 'italic',
        }}>
          {t('is.noContent')}
        </div>
      )}

      {/* Footer */}
      <div style={{
        marginTop: 18,
        paddingTop: 12,
        borderTop: '1px solid #e0e0e0',
        fontSize: 10,
        color: '#bbb',
        textAlign: 'center',
      }}>
        Managed with NestBook · nestbook.io
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function InfoSheet() {
  return (
    <PlanGate requiredPlan="pro">
      <InfoSheetInner />
    </PlanGate>
  );
}

function InfoSheetInner() {
  const { property, updatePropertyInList } = useLocale();
  const t = useT();

  const [houseRules, setHouseRules] = useState(property?.house_rules || '');
  const [localTips, setLocalTips]   = useState(property?.local_tips  || '');
  const [saveState, setSaveState]   = useState('idle'); // idle | saving | saved
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState(null);
  const [tab, setTab] = useState('edit'); // edit | preview
  const saveTimer = useRef(null);

  async function persistFields(rules, tips) {
    if (!property?.id) return;
    setSaveState('saving');
    try {
      const res = await apiFetch(`/api/info-sheet/${property.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ house_rules: rules, local_tips: tips }),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      updatePropertyInList(updated);
      setSaveState('saved');
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => setSaveState('idle'), 2500);
    } catch {
      setSaveState('idle');
    }
  }

  async function handleDownload() {
    if (!property?.id) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      // Save latest values first
      await persistFields(houseRules, localTips);

      const res = await apiFetch(`/api/info-sheet/pdf/${property.id}`);
      if (!res.ok) throw new Error(t('is.downloadError'));
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `info-sheet-${property.id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setDownloadError(err.message || t('is.downloadError'));
    } finally {
      setDownloading(false);
    }
  }

  const saveLabel = saveState === 'saving'
    ? t('is.saving')
    : saveState === 'saved'
    ? `✓ ${t('is.saved')}`
    : null;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
          {t('infoSheet')}
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: 6 }}>
          {t('is.subtitle')}
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '2px solid var(--border)', marginBottom: 20 }}>
        {['edit', 'preview'].map(k => (
          <button
            key={k}
            onClick={() => setTab(k)}
            style={{
              padding: '10px 18px',
              border: 'none',
              background: 'none',
              fontFamily: 'inherit',
              fontWeight: 600,
              fontSize: '0.875rem',
              cursor: 'pointer',
              color: tab === k ? 'var(--accent)' : 'var(--text-secondary)',
              borderBottom: tab === k ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: -2,
            }}
          >
            {k === 'edit' ? 'Edit' : t('is.preview')}
          </button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 4 }}>
          {saveLabel && (
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              {saveLabel}
            </span>
          )}
          <button
            className="btn-primary"
            onClick={handleDownload}
            disabled={downloading}
            style={{ fontSize: '0.85rem', padding: '8px 18px' }}
          >
            {downloading ? '…' : `⬇ ${t('is.downloadPdf')}`}
          </button>
        </div>
      </div>

      {downloadError && (
        <div style={{
          color: 'var(--error, #dc2626)',
          background: 'var(--error-bg, #fef2f2)',
          border: '1px solid var(--error-border, #fecaca)',
          borderRadius: 6,
          padding: '10px 14px',
          fontSize: '0.85rem',
          marginBottom: 16,
        }}>
          {downloadError}
        </div>
      )}

      {tab === 'edit' ? (
        <>
          {/* WiFi hint */}
          <div style={{ ...CARD, background: 'var(--accent-faint, #f0faf8)', borderColor: 'var(--accent-light, #c8e8e2)' }}>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              📶 <strong>{t('is.wifi')}:</strong> {t('is.wifiHint')}
              {' '}
              <a href="/settings" style={{ color: 'var(--accent)' }}>Settings →</a>
            </p>
            <p style={{ margin: '6px 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              🕐 <strong>{t('is.checkInOut')}:</strong> {t('is.checkHint')}
            </p>
          </div>

          {/* House Rules */}
          <div style={CARD}>
            <label style={LBL}>{t('is.houseRules')}</label>
            <p style={HINT}>{t('is.houseRulesHint')}</p>
            <textarea
              value={houseRules}
              onChange={e => setHouseRules(e.target.value)}
              onBlur={() => persistFields(houseRules, localTips)}
              rows={6}
              placeholder={
                '• No smoking indoors\n• Quiet hours after 22:00\n• Please remove shoes at the door'
              }
              style={INPUT}
            />
          </div>

          {/* Local Tips */}
          <div style={CARD}>
            <label style={LBL}>{t('is.localTips')}</label>
            <p style={HINT}>{t('is.localTipsHint')}</p>
            <textarea
              value={localTips}
              onChange={e => setLocalTips(e.target.value)}
              onBlur={() => persistFields(houseRules, localTips)}
              rows={6}
              placeholder={
                'Bakery: La Boulangerie on Rue du Marché, opens 7am\nSupermarket: Carrefour, 10 min walk\nBus to town centre: Line 4 from outside the door (every 20 min)'
              }
              style={INPUT}
            />
          </div>
        </>
      ) : (
        <SheetPreview
          property={property}
          houseRules={houseRules}
          localTips={localTips}
          t={t}
        />
      )}
    </div>
  );
}
