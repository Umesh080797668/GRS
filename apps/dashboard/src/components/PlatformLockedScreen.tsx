'use client';
import React from 'react';
import { Lock, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface Props {
  reason?: string;
  message?: string;
}

export default function PlatformLockedScreen({ reason, message }: Props) {
  const { logout } = useAuth();
  const reasonLabel =
    reason === 'gn'
      ? 'GN Division'
      : reason === 'ds'
        ? 'DS Division'
        : reason === 'district'
          ? 'District'
          : 'Platform';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: '#0f172a',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#f8fafc',
        textAlign: 'center',
        padding: '2rem',
      }}
    >
      <div
        style={{
          width: 80,
          height: 80,
          borderRadius: 20,
          background: 'rgba(239,68,68,0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '1.5rem',
        }}
      >
        <Lock size={40} color="#ef4444" />
      </div>
      <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.75rem' }}>
        Access Suspended
      </h1>
      <p style={{ fontSize: '1rem', color: '#94a3b8', maxWidth: 440, lineHeight: 1.6 }}>
        {message ||
          `The ${reasonLabel} has been temporarily locked by the system administrator. Please contact your supervisor for assistance.`}
      </p>
      <div style={{ marginTop: '2rem' }}>
        <button
          type="button"
          onClick={() => logout()}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 20px',
            borderRadius: '8px',
            background: 'rgba(255, 255, 255, 0.1)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            color: '#f8fafc',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 500,
          }}
        >
          <LogOut size={16} />
          <span>Sign Out</span>
        </button>
      </div>
      <p style={{ fontSize: '0.8rem', color: '#475569', marginTop: '1.5rem' }}>
        Only the System Administrator (L00) can unlock access.
      </p>
    </div>
  );
}
