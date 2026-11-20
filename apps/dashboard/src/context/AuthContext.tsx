'use client';

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { api, SessionTokens } from '../lib/api';

interface AuthContextType {
  user: SessionTokens['user'] | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isPlatformLocked: boolean;
  lockReason: string | undefined;
  login: (identifier: string, pwd: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => void;
  switchArea: (gnId: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  isPlatformLocked: false,
  lockReason: undefined,
  login: async () => { },
  logout: () => { },
  refreshUser: () => { },
  switchArea: async () => { },
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionTokens['user'] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPlatformLocked, setIsPlatformLocked] = useState(false);
  const [lockReason, setLockReason] = useState<string | undefined>(undefined);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const stored = api.getStoredUser();
    if (stored) {
      if (stored.role === 'team_member') {
        api.clearSession();
        setUser(null);
      } else {
        setUser(stored);
      }
    }
    setIsLoading(false);
  }, []);

  // Protected route enforcement
  useEffect(() => {
    if (isLoading) return;

    const isPublic = pathname === '/login';
    const isFirstSignIn = pathname === '/first-sign-in';

    if (!user && !isPublic) {
      router.replace('/login');
    } else if (user) {
      if (user.role === 'team_member') {
        api.clearSession();
        setUser(null);
        router.replace('/login');
      } else if (user.mustChangePassword && !isFirstSignIn) {
        router.replace('/first-sign-in');
      } else if (!user.mustChangePassword && (isPublic || isFirstSignIn)) {
        router.replace('/progress');
      }
    }
  }, [user, isLoading, pathname, router]);

  // Check platform lock status whenever user changes
  useEffect(() => {
    if (!user || user.role === 'super_admin') {
      setIsPlatformLocked(false);
      setLockReason(undefined);
      return;
    }
    api.getConfig().then((cfg: any) => {
      if (cfg?.platformLocked) {
        setIsPlatformLocked(true);
        setLockReason('platform');
      } else {
        const gnId = user.gnId;
        const dsId = user.dsId;
        const districtId = user.districtId;
        const areaLocks = cfg?.areaLocks || {};
        if (districtId && (cfg?.[`district_lock:${districtId}`] || areaLocks[`district_lock:${districtId}`])) {
          setIsPlatformLocked(true);
          setLockReason('district');
        } else if (dsId && (cfg?.[`ds_lock:${dsId}`] || areaLocks[`ds_lock:${dsId}`])) {
          setIsPlatformLocked(true);
          setLockReason('ds');
        } else if (gnId && (cfg?.[`gn_lock:${gnId}`] || areaLocks[`gn_lock:${gnId}`])) {
          setIsPlatformLocked(true);
          setLockReason('gn');
        } else {
          setIsPlatformLocked(false);
          setLockReason(undefined);
        }
      }
    }).catch(() => {
      // Don't lock on network error
    });
  }, [user]);

  // Listen for platform-lock events emitted by api.ts
  useEffect(() => {
    const handlePlatformLock = (e: any) => {
      if (user?.role === 'super_admin') return;
      setIsPlatformLocked(true);
      if (e?.detail?.reason) {
        setLockReason(e.detail.reason);
      }
    };
    window.addEventListener('grs:platform-locked', handlePlatformLock);
    return () => {
      window.removeEventListener('grs:platform-locked', handlePlatformLock);
    };
  }, [user]);

  // Keep user session alive while tab is visible (every 60s, throttled on visibility resume)
  const lastHeartbeatRef = useRef<number>(0);
  const userId = user?.id;
  const mustChangePassword = user?.mustChangePassword;

  useEffect(() => {
    if (!userId || mustChangePassword) return;

    const ping = (force = false) => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return;
      }
      const now = Date.now();
      if (!force && now - lastHeartbeatRef.current < 45_000) {
        return;
      }
      lastHeartbeatRef.current = now;
      api.sendHeartbeat().catch(() => {
        // Non-blocking keep-alive ping
      });
    };

    ping(true);
    const intervalId = window.setInterval(() => ping(true), 60_000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        ping(false);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [userId, mustChangePassword]);

  const login = async (identifier: string, pwd: string) => {
    const session = await api.login(identifier, pwd);
    if (session.user.role === 'team_member') {
      api.clearSession();
      throw new Error(
        'Level 5 Team Members must access the mobile tablet application. Web dashboard access is restricted.'
      );
    }
    setUser(session.user);
    if (session.user.role !== 'super_admin') {
      if (session.platformLocked || (session.user as any).platformLocked) {
        setIsPlatformLocked(true);
        setLockReason(session.lockReason || (session.user as any).lockReason || 'platform');
        return;
      }
      try {
        const cfg: any = await api.getConfig();
        const gnId = session.user.gnId;
        const dsId = session.user.dsId;
        const districtId = session.user.districtId;
        const areaLocks = cfg?.areaLocks || {};
        if (cfg?.platformLocked) {
          setIsPlatformLocked(true);
          setLockReason('platform');
          return;
        } else if (districtId && (cfg?.[`district_lock:${districtId}`] || areaLocks[`district_lock:${districtId}`])) {
          setIsPlatformLocked(true);
          setLockReason('district');
          return;
        } else if (dsId && (cfg?.[`ds_lock:${dsId}`] || areaLocks[`ds_lock:${dsId}`])) {
          setIsPlatformLocked(true);
          setLockReason('ds');
          return;
        } else if (gnId && (cfg?.[`gn_lock:${gnId}`] || areaLocks[`gn_lock:${gnId}`])) {
          setIsPlatformLocked(true);
          setLockReason('gn');
          return;
        }
      } catch {
        // Ignore config check error on login
      }
    }
    if (session.user.mustChangePassword) {
      router.push('/first-sign-in');
    } else {
      router.push('/progress');
    }
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch {
      // Invariant: Silently handle network errors
    } finally {
      api.clearSession();
      setUser(null);
      setIsPlatformLocked(false);
      setLockReason(undefined);
      router.replace('/login');
    }
  };

  const refreshUser = () => {
    const stored = api.getStoredUser();
    setUser(stored);
  };

  const switchArea = async (gnId: string) => {
    const session = await api.switchArea(gnId);
    setUser(session.user);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        isPlatformLocked,
        lockReason,
        login,
        logout,
        refreshUser,
        switchArea,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
