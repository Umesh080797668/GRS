'use client';

import { useLanguage } from '../context/LanguageContext';
import { Language } from '../lib/translations';

interface LanguageSwitchProps {
  variant?: 'light' | 'dark';
}

export default function LanguageSwitch({ variant = 'light' }: LanguageSwitchProps) {
  const { lang, setLang } = useLanguage();

  const options: Array<{ code: Language; label: string }> = [
    { code: 'en', label: 'English' },
    { code: 'si', label: 'සිංහල' },
    { code: 'ta', label: 'தமிழ்' },
  ];

  const isDark = variant === 'dark';

  return (
    <div
      role="group"
      aria-label="Language Selector"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        background: isDark ? 'rgba(255, 255, 255, 0.08)' : 'var(--slate-100)',
        borderRadius: 'var(--radius-full)',
        padding: '2px',
        border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.12)' : 'var(--slate-200)'}`,
      }}
    >
      {options.map((opt) => {
        const isActive = lang === opt.code;
        return (
          <button
            key={opt.code}
            type="button"
            onClick={() => setLang(opt.code)}
            aria-pressed={isActive}
            style={{
              padding: '4px 10px',
              fontSize: '12px',
              fontWeight: isActive ? 600 : 500,
              borderRadius: 'var(--radius-full)',
              border: 'none',
              cursor: 'pointer',
              color: isActive
                ? (isDark ? '#0f172a' : 'var(--slate-900)')
                : (isDark ? '#cbd5e1' : 'var(--slate-600)'),
              backgroundColor: isActive
                ? '#ffffff'
                : 'transparent',
              boxShadow: isActive ? '0 1px 2px rgba(15, 23, 42, 0.08)' : 'none',
              transition: 'all 0.15s ease',
              fontFamily: opt.code === 'si'
                ? 'var(--font-sinhala)'
                : opt.code === 'ta'
                  ? 'var(--font-tamil)'
                  : 'var(--font-sans)',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
