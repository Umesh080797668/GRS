'use client';

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { api, SessionTokens } from '../lib/api';

interface AuthContextType {
  user: SessionTokens['user'] | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (identifier: string, pwd: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => void;
  switchArea: (gnId: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  login: async () => { },
  logout: () => { },
  refreshUser: () => { },
  switchArea: async () => { },
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionTokens['user'] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
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
