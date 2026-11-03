'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { Language, TRANSLATIONS } from '../lib/translations';

interface LanguageContextType {
  lang: Language;
  language: Language;
  setLang: (lang: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType>({
  lang: 'en',
  language: 'en',
  setLang: () => { },
  t: (key: string) => key,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Language>('en');

  useEffect(() => {
    const saved = localStorage.getItem('grs_dashboard_lang') as Language | null;
    if (saved && (saved === 'en' || saved === 'si' || saved === 'ta')) {
      setLangState(saved);
      document.documentElement.lang = saved;
    }
  }, []);

  const setLang = (newLang: Language) => {
    setLangState(newLang);
    localStorage.setItem('grs_dashboard_lang', newLang);
    document.documentElement.lang = newLang;
  };

  const t = (key: string): string => {
    const table = TRANSLATIONS[lang] || TRANSLATIONS.en;
    return table[key] || TRANSLATIONS.en[key] || key;
  };

  return (
    <LanguageContext.Provider value={{ lang, language: lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
