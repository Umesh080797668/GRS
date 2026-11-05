'use client';

import React from 'react';

interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  progressPercent?: number;
  colorScheme?: 'blue' | 'emerald' | 'amber' | 'purple' | 'rose';
}

export default function KPICard({
  title,
  value,
  subtitle,
  icon,
  progressPercent,
  colorScheme = 'blue',
}: KPICardProps) {
  const getTheme = () => {
    switch (colorScheme) {
      case 'emerald':
        return {
          iconColor: '#059669',
          progressColor: '#059669',
          accentBorder: '#10b981',
        };
      case 'amber':
        return {
          iconColor: '#d97706',
          progressColor: '#d97706',
          accentBorder: '#f59e0b',
        };
      case 'purple':
        return {
          iconColor: '#7c3aed',
          progressColor: '#7c3aed',
          accentBorder: '#8b5cf6',
        };
      case 'rose':
        return {
          iconColor: '#dc2626',
          progressColor: '#dc2626',
          accentBorder: '#ef4444',
        };
      default:
        return {
          iconColor: '#004d40',
          progressColor: '#004d40',
          accentBorder: '#004d40',
        };
    }
  };

  const theme = getTheme();

  return (
    <div
      style={{
        background: '#ffffff',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        padding: '1.125rem 1.25rem',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        boxShadow: 'var(--shadow-xs)',
        position: 'relative',
        minHeight: '110px',
      }}
    >
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
          <span
            style={{
              fontSize: '13px',
              fontWeight: 500,
              color: 'var(--slate-500)',
              lineHeight: 1.3,
            }}
          >
            {title}
          </span>
          {icon && (
            <div
              style={{
                color: theme.iconColor,
                opacity: 0.85,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {icon}
            </div>
          )}
        </div>

        <div
          className="tabular-nums"
          style={{
            fontSize: '28px',
            fontWeight: 700,
            color: 'var(--slate-900)',
            marginTop: '0.4rem',
            letterSpacing: '-0.02em',
            lineHeight: 1.15,
          }}
        >
          {value}
        </div>
      </div>

      {(subtitle || progressPercent !== undefined) && (
        <div style={{ marginTop: '0.75rem', paddingTop: '0.5rem', borderTop: '1px solid var(--slate-100)' }}>
          {progressPercent !== undefined && (
            <div
              style={{
                width: '100%',
                height: '4px',
                background: 'var(--slate-100)',
                borderRadius: 'var(--radius-full)',
                overflow: 'hidden',
                marginBottom: '0.35rem',
              }}
            >
              <div
                style={{
                  width: `${Math.min(Math.max(progressPercent, 0), 100)}%`,
                  height: '100%',
                  background: theme.progressColor,
                  borderRadius: 'var(--radius-full)',
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
          )}
          {subtitle && (
            <span style={{ fontSize: '12px', color: 'var(--slate-500)', fontWeight: 400 }}>
              {subtitle}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
