'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { api, SessionTokens } from '../lib/api';

interface AuthContextType {
  user: SessionTokens['user'] | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (identifier: string, pwd: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  login: async () => { },
  logout: () => { },
  refreshUser: () => { },
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

  const logout = () => {
    api.clearSession();
    setUser(null);
    router.replace('/login');
  };

  const refreshUser = () => {
    const stored = api.getStoredUser();
    setUser(stored);
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
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
