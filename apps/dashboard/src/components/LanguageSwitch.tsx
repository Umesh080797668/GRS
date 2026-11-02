'use client';

import { useLanguage } from '../context/LanguageContext';
import { Language } from '../lib/translations';

export default function LanguageSwitch() {
  const { lang, setLang } = useLanguage();

  const options: Array<{ code: Language; label: string }> = [
    { code: 'en', label: 'English' },
    { code: 'si', label: 'සිංහල' },
    { code: 'ta', label: 'தமிழ்' },
  ];

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        background: 'rgba(255, 255, 255, 0.12)',
        borderRadius: '9999px',
        padding: '3px',
        border: '1px solid rgba(255, 255, 255, 0.2)',
      }}
    >
      {options.map((opt) => {
        const isActive = lang === opt.code;
        return (
          <button
            key={opt.code}
            onClick={() => setLang(opt.code)}
            style={{
              padding: '4px 10px',
              fontSize: '12px',
              fontWeight: isActive ? 700 : 500,
              borderRadius: '9999px',
              border: 'none',
              cursor: 'pointer',
              color: isActive ? '#0f172a' : '#ffffff',
              backgroundColor: isActive ? '#ffffff' : 'transparent',
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.2)' : 'none',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
