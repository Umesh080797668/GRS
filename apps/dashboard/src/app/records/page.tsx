'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Shell } from '@/components/Shell';
import RecordsPanel from '@/components/RecordsPanel';
import { useAuth } from '@/context/AuthContext';

/**
 * Survey records and corrections now live alongside Households on the unified /houses page.
 * For the CG role (which has view-only career guidance scope without house mutation rights),
 * this dedicated standalone records view is retained.
 * For all other roles, navigating to /records directs them smoothly to /houses#records.
 */
export default function RecordsPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const isCg = user?.role === 'cg';

  useEffect(() => {
    if (!authLoading && user && !isCg) {
      router.replace('/houses#records');
    }
  }, [authLoading, user, isCg, router]);

  return (
    <Shell activePath="/records">
      {isCg ? <RecordsPanel standalone={true} /> : null}
    </Shell>
  );
}
