'use client';

import React from 'react';

interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
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
          bg: '#ecfdf5',
          border: 'rgba(16, 185, 129, 0.25)',
          iconColor: '#059669',
          progressColor: '#10b981',
        };
      case 'amber':
        return {
          bg: '#fffbeb',
          border: 'rgba(245, 158, 11, 0.25)',
          iconColor: '#d97706',
          progressColor: '#f59e0b',
        };
      case 'purple':
        return {
          bg: '#f5f3ff',
          border: 'rgba(139, 92, 246, 0.25)',
          iconColor: '#7c3aed',
          progressColor: '#8b5cf6',
        };
      case 'rose':
        return {
          bg: '#fff1f2',
          border: 'rgba(244, 63, 94, 0.25)',
          iconColor: '#e11d48',
          progressColor: '#f43f5e',
        };
      default:
        return {
          bg: '#eff6ff',
          border: 'rgba(59, 130, 246, 0.25)',
          iconColor: '#2563eb',
          progressColor: '#3b82f6',
        };
    }
  };

  const theme = getTheme();

  return (
    <div
      className="glass-panel"
      style={{
        padding: '1.25rem',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        borderRadius: '12px',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
        cursor: 'default',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = '0 10px 20px -5px rgba(0, 0, 0, 0.08)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem' }}>
        <div>
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {title}
          </span>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#0f172a', marginTop: '4px', letterSpacing: '-0.02em' }}>
            {value}
          </div>
        </div>
        <div
          style={{
            padding: '10px',
            borderRadius: '10px',
            background: theme.bg,
            color: theme.iconColor,
            border: `1px solid ${theme.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {icon}
        </div>
      </div>

      {(subtitle || progressPercent !== undefined) && (
        <div style={{ marginTop: '1rem' }}>
          {progressPercent !== undefined && (
            <div
              style={{
                width: '100%',
                height: '6px',
                background: '#e2e8f0',
                borderRadius: '9999px',
                overflow: 'hidden',
                marginBottom: '6px',
              }}
            >
              <div
                style={{
                  width: `${Math.min(Math.max(progressPercent, 0), 100)}%`,
                  height: '100%',
                  background: theme.progressColor,
                  borderRadius: '9999px',
                  transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
              />
            </div>
          )}
          {subtitle && (
            <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 500 }}>
              {subtitle}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
