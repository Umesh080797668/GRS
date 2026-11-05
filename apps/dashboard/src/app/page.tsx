'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import { Loader2 } from 'lucide-react';

export default function RootPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading) {
      if (user) {
        if (user.mustChangePassword) {
          router.replace('/first-sign-in');
        } else {
          router.replace('/progress');
        }
      } else {
        router.replace('/login');
      }
    }
  }, [user, isLoading, router]);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-page)',
        color: 'var(--slate-600)',
      }}
    >
      <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div
          style={{
            background: 'var(--primary)',
            color: '#ffffff',
            fontSize: '14px',
            fontWeight: 800,
            padding: '6px 12px',
            borderRadius: 'var(--radius-xs)',
            letterSpacing: '0.05em',
            marginBottom: '1rem',
          }}
        >
          GRS
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13.5px', fontWeight: 500 }}>
          <Loader2 size={16} className="animate-spin" style={{ color: 'var(--primary)' }} />
          <span>Loading Door-to-Door Skills Campaign Dashboard...</span>
        </div>
      </div>
    </div>
  );
}
