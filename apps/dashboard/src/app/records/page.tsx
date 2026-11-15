'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Shell } from '@/components/Shell';
import RecordsPanel from '@/components/RecordsPanel';
import { useAuth } from '@/context/AuthContext';

/**
 * Records & Corrections now lives inside "Houses & GN Setup" (second tab).
 * This route stays for old links/bookmarks and for the CG role, which has no
 * access to the Houses page.
 */
export default function RecordsPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const isCg = user?.role === 'cg';

  useEffect(() => {
    if (!authLoading && user && !isCg) {
      router.replace('/houses?tab=records');
    }
  }, [authLoading, user, isCg, router]);

  return <Shell activePath="/records">{isCg ? <RecordsPanel /> : null}</Shell>;
}
