'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';

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
        background: '#090e1a',
        color: '#94a3b8',
        fontSize: '14px',
        fontWeight: 500,
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <div style={{ color: '#f59e0b', fontSize: '24px', fontWeight: 800, marginBottom: '8px' }}>
          GRS
        </div>
        <div>Loading Door-to-Door Skills Campaign Dashboard...</div>
      </div>
    </div>
  );
}
