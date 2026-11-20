'use client';
import React from 'react';
import { useAuth } from '../context/AuthContext';
import PlatformLockedScreen from './PlatformLockedScreen';

export default function ClientRoot({ children }: { children: React.ReactNode }) {
  const { isPlatformLocked, lockReason } = useAuth();

  if (isPlatformLocked) {
    return <PlatformLockedScreen reason={lockReason} />;
  }

  return <>{children}</>;
}
