import { createContext, useContext, useEffect, useState } from 'react';
import { apiFetch } from '../utils/apiFetch.js';
import { formatCurrency } from '../utils/format.js';
import { LANGS } from './index.js';

const CURRENCY_SYMBOL = { EUR: '€', GBP: '£', USD: '$', CHF: '₣' };

const LocaleContext = createContext(null);

export function LocaleProvider({ children }) {
  const [property, setProperty] = useState(null);

  useEffect(() => {
    // Skip if not authenticated — avoids redirect loops on /login, /register, etc.
    if (!localStorage.getItem('nb_token')) return;
    apiFetch('/api/properties')
      .then((r) => r.json())
      .then(([first]) => {
        if (!first) return;
        setProperty(first);
      })
      .catch(() => {});
  }, []);

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
    <LocaleContext.Provider value={{ t, locale, property, setProperty, currency, currencySymbol, fmtCurrency }}>
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
