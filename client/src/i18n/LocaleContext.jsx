import { createContext, useContext, useEffect, useState } from 'react';
import { apiFetch } from '../utils/apiFetch.js';
import { formatCurrency } from '../utils/format.js';
import { LANGS } from './index.js';

const CURRENCY_SYMBOL = { EUR: '€', GBP: '£', USD: '$', CHF: '₣' };

const LocaleContext = createContext(null);

export function LocaleProvider({ children }) {
  const [properties, setProperties] = useState([]);
  const [property,   setProperty]   = useState(null);
  // Nearly every page's data-fetch is gated on property?.id existing, so a
  // silently-failed load here used to leave the whole session blank with no
  // way to recover short of a hard refresh (which just hits the same
  // failure again). Track it explicitly so we can show a real retry screen
  // instead — but only once we know we actually tried (an unauthenticated
  // visitor on /login etc. never attempts this fetch at all, see the guard
  // below, and must not be affected).
  const [loadError, setLoadError] = useState(null);

  function loadProperties() {
    // Skip if not authenticated — avoids redirect loops on /login, /register, etc.
    if (!localStorage.getItem('nb_token')) return;
    setLoadError(null);
    apiFetch('/api/properties')
      // apiFetch() never throws on a non-2xx status (only on a genuine
      // network failure) — without this check, a 500 response would fall
      // through to r.json() and silently resolve to an empty properties
      // list rather than being treated as the failure it is.
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Server returned ${r.status}`))))
      .then((data) => {
        const props = Array.isArray(data) ? data : [];
        setProperties(props);
        if (!props.length) return;
        // Restore the last-used property from localStorage, fall back to first.
        const savedId = Number(localStorage.getItem('nb_active_property'));
        const active  = props.find((p) => p.id === savedId) ?? props[0];
        setProperty(active);
        localStorage.setItem('nb_active_property', String(active.id));
      })
      .catch((err) => setLoadError(err.message || 'Failed to load your account.'));
  }

  useEffect(() => {
    loadProperties();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Switch the active property instantly (no page refresh required).
  function switchProperty(prop) {
    setProperty(prop);
    localStorage.setItem('nb_active_property', String(prop.id));
    // Persist to the server so the active property survives a login refresh.
    apiFetch(`/api/properties/active/${prop.id}`, { method: 'PUT' }).catch(() => {});
  }

  // Called after successfully creating a new property in Settings.
  function addPropertyToList(newProp) {
    setProperties((prev) => [...prev, newProp]);
  }

  // Called after saving an existing property in Settings (e.g. locale/name change).
  // Keeps the properties list in sync so switching back to this property uses the updated data.
  function updatePropertyInList(updatedProp) {
    setProperties((prev) => prev.map((p) => (p.id === updatedProp.id ? updatedProp : p)));
  }

  // Called after successfully deleting a property in Settings.
  // Removes it from the list; if it was active, switches to the first remaining property.
  function removePropertyFromList(deletedId, remaining) {
    setProperties(remaining);
    if (property?.id === deletedId) {
      const next = remaining[0] ?? null;
      if (next) {
        setProperty(next);
        localStorage.setItem('nb_active_property', String(next.id));
      }
    }
  }

  // Apply theme whenever the active property changes
  useEffect(() => {
    const theme = property?.theme ?? 'forest';
    document.documentElement.setAttribute('data-theme', theme);
  }, [property?.theme]);

  // Derive locale directly from property so calling setProperty() anywhere
  // (e.g. after saving Settings) updates the language instantly without a refresh.
  // When no property is loaded yet (unauthenticated pages like Register/Login),
  // fall back to nb-lang saved by the public site, then to the browser language.
  const SUPPORTED = ['en', 'fr', 'de', 'es', 'nl'];
  const nbLang = (() => { try { return localStorage.getItem('nb-lang'); } catch { return null; } })();
  const browserLang = (() => {
    try {
      const langs = navigator.languages?.length ? navigator.languages : [navigator.language || 'en'];
      for (const l of langs) {
        const code = l.toLowerCase().split('-')[0];
        if (SUPPORTED.includes(code)) return code;
      }
    } catch { return null; }
    return null;
  })();
  const locale = property?.locale
    ?? (nbLang && SUPPORTED.includes(nbLang) ? nbLang : null)
    ?? (browserLang && browserLang !== 'en' ? browserLang : 'en');

  function t(key) {
    return (LANGS[locale] ?? LANGS.en)?.[key] ?? LANGS.en?.[key] ?? key;
  }

  const currency       = property?.currency ?? 'EUR';
  const currencySymbol = CURRENCY_SYMBOL[currency] ?? currency;

  function fmtCurrency(amount) {
    return formatCurrency(amount, currency);
  }

  // Only shown once we actually attempted the fetch (a valid token was
  // present) and it failed, and we have nothing usable to fall back on —
  // never blocks unauthenticated pages (Login/Register/etc.), which skip
  // the fetch entirely per the guard in loadProperties() above.
  if (loadError && !property && localStorage.getItem('nb_token')) {
    return (
      <div style={{
        height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', gap: 14, padding: 24, textAlign: 'center', background: '#fff',
      }}>
        <div style={{ color: '#dc2626', fontSize: '1rem', fontWeight: 700 }}>
          Something went wrong loading your account
        </div>
        <div style={{ color: '#6B6A66', fontSize: '0.88rem', maxWidth: 380 }}>
          {loadError}
        </div>
        <button
          onClick={loadProperties}
          className="btn-primary"
          style={{ padding: '10px 28px', marginTop: 4 }}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <LocaleContext.Provider value={{
      t,
      locale,
      property,
      setProperty,
      properties,
      switchProperty,
      addPropertyToList,
      updatePropertyInList,
      removePropertyFromList,
      currency,
      currencySymbol,
      fmtCurrency,
    }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  return useContext(LocaleContext);
}

export function useT() {
  return useContext(LocaleContext).t;
}
