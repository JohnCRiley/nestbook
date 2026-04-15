import { createContext, useContext, useEffect, useState } from 'react';
import { apiFetch } from '../utils/apiFetch.js';
import { formatCurrency } from '../utils/format.js';
import { LANGS } from './index.js';

const CURRENCY_SYMBOL = { EUR: '€', GBP: '£', USD: '$', CHF: '₣' };

const LocaleContext = createContext(null);

export function LocaleProvider({ children }) {
  const [properties, setProperties] = useState([]);
  const [property,   setProperty]   = useState(null);

  useEffect(() => {
    // Skip if not authenticated — avoids redirect loops on /login, /register, etc.
    if (!localStorage.getItem('nb_token')) return;
    apiFetch('/api/properties')
      .then((r) => r.json())
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
      .catch(() => {});
  }, []);

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

  // Derive locale directly from property so calling setProperty() anywhere
  // (e.g. after saving Settings) updates the language instantly without a refresh.
  const locale = property?.locale ?? 'en';

  function t(key) {
    return (LANGS[locale] ?? LANGS.en)?.[key] ?? LANGS.en?.[key] ?? key;
  }

  const currency       = property?.currency ?? 'EUR';
  const currencySymbol = CURRENCY_SYMBOL[currency] ?? currency;

  function fmtCurrency(amount) {
    return formatCurrency(amount, currency);
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
