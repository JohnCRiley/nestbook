import { createContext, useContext, useEffect, useState } from 'react';
import { apiFetch } from '../utils/apiFetch.js';
import { LANGS } from './index.js';

const LocaleContext = createContext(null);

export function LocaleProvider({ children }) {
  const [locale,   setLocale]   = useState('en');
  const [property, setProperty] = useState(null);

  useEffect(() => {
    apiFetch('/api/properties')
      .then((r) => r.json())
      .then(([first]) => {
        if (!first) return;
        setProperty(first);
        setLocale(first.locale ?? 'en');
      })
      .catch(() => {});
  }, []);

  function t(key) {
    return (LANGS[locale] ?? LANGS.en)?.[key] ?? LANGS.en?.[key] ?? key;
  }

  return (
    <LocaleContext.Provider value={{ t, locale, property, setProperty }}>
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
