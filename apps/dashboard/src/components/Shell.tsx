'use client';

import React, { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  BarChart3,
  Users,
  MapPin,
  FileSpreadsheet,
  ClipboardCheck,
  FileText,
  Activity,
  Sparkles,
  LogOut,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import LanguageSwitch from './LanguageSwitch';

interface NavItem {
  key: string;
  href: string;
  icon: React.ReactNode;
  roles?: string[];
}

export interface ShellProps {
  children: React.ReactNode;
  activePath?: string;
}

export function Shell({ children, activePath }: ShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const routerPath = usePathname();
  const pathname = activePath || routerPath;

  const router = useRouter();
  const { user, logout } = useAuth();
  const { t } = useLanguage();

  const navItems: NavItem[] = [
    { key: 'nav.progress', href: '/progress', icon: <BarChart3 size={18} /> },
    { key: 'nav.users', href: '/users', icon: <Users size={18} /> },
    { key: 'nav.areas', href: '/areas', icon: <MapPin size={18} /> },
    { key: 'nav.import', href: '/import', icon: <FileSpreadsheet size={18} /> },
    { key: 'nav.records', href: '/records', icon: <ClipboardCheck size={18} /> },
    { key: 'nav.data_entry', href: '/data-entry', icon: <FileText size={18} /> },
    { key: 'nav.sync_health', href: '/progress#sync-health', icon: <Activity size={18} /> },
    { key: 'nav.showcase', href: '/showcase', icon: <Sparkles size={18} /> },
  ];

  const getRoleBadgeColor = (role?: string) => {
    switch (role) {
      case 'super_admin': return '#7c3aed';
      case 'admin': return '#2563eb';
      case 'cg': return '#059669';
      case 'dc': return '#d97706';
      case 'sda': return '#0284c7';
      default: return '#64748b';
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f8fafc' }}>
      {/* Sidebar */}
      <aside
        style={{
          width: collapsed ? '72px' : '260px',
          background: 'linear-gradient(180deg, #090e1a 0%, #0f172a 100%)',
          color: '#ffffff',
          display: 'flex',
          flexDirection: 'column',
          transition: 'width 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
          borderRight: '1px solid rgba(255, 255, 255, 0.08)',
          position: 'sticky',
          top: 0,
          height: '100vh',
          zIndex: 50,
          flexShrink: 0,
        }}
      >
        {/* Brand Header */}
        <div
          style={{
            padding: collapsed ? '1.25rem 0.5rem' : '1.25rem 1.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'space-between',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          {!collapsed && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  style={{
                    background: '#f59e0b',
                    color: '#000000',
                    fontWeight: 800,
                    fontSize: '11px',
                    padding: '2px 6px',
                    borderRadius: '4px',
                  }}
                >
                  GRS
                </span>
                <span style={{ fontWeight: 700, fontSize: '15px', letterSpacing: '-0.01em' }}>
                  Web Dashboard
                </span>
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                Skills Campaign 2026
              </div>
            </div>
          )}
          {collapsed && (
            <span
              style={{
                background: '#f59e0b',
                color: '#000',
                fontWeight: 800,
                fontSize: '12px',
                padding: '4px 6px',
                borderRadius: '4px',
              }}
            >
              GRS
            </span>
          )}
        </div>

        {/* Navigation Items */}
        <nav style={{ flex: 1, padding: '1rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '4px', overflowY: 'auto' }}>
          {navItems.map((item) => {
            const isActive = pathname === item.href || (item.href.includes('#') && pathname === '/progress');
            return (
              <button
                key={item.key}
                onClick={() => router.push(item.href)}
                title={collapsed ? t(item.key) : undefined}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: collapsed ? '10px 0' : '10px 14px',
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  width: '100%',
                  borderRadius: '8px',
                  border: 'none',
                  background: isActive ? 'linear-gradient(135deg, #1e3a8a, #2563eb)' : 'transparent',
                  color: isActive ? '#ffffff' : '#cbd5e1',
                  fontWeight: isActive ? 600 : 500,
                  fontSize: '13px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  textAlign: 'left',
                  boxShadow: isActive ? '0 2px 8px rgba(37, 99, 235, 0.35)' : 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: isActive ? '#f59e0b' : '#94a3b8' }}>
                  {item.icon}
                </div>
                {!collapsed && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t(item.key)}</span>}
              </button>
            );
          })}
        </nav>

        {/* Collapse toggle button */}
        <div style={{ padding: '0.75rem', borderTop: '1px solid rgba(255, 255, 255, 0.08)', display: 'flex', justifyContent: 'center' }}>
          <button
            onClick={() => setCollapsed(!collapsed)}
            style={{
              background: 'rgba(255, 255, 255, 0.06)',
              border: 'none',
              borderRadius: '6px',
              color: '#94a3b8',
              padding: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
            }}
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Civic Top Bar */}
        <header
          className="civic-gradient"
          style={{
            padding: '0.75rem 1.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            position: 'sticky',
            top: 0,
            zIndex: 40,
          }}
        >
          <div>
            <h1 style={{ fontSize: '14px', fontWeight: 700, letterSpacing: '-0.01em', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ color: '#f59e0b' }}>🇱🇰</span>
              {t('app.title')}
            </h1>
            <p style={{ fontSize: '11px', color: '#cbd5e1', margin: '2px 0 0 0', opacity: 0.9 }}>
              {t('app.subtitle')}
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <LanguageSwitch />

            {user && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600 }}>{user.fullName || user.userCode}</span>
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      padding: '1px 6px',
                      borderRadius: '4px',
                      background: getRoleBadgeColor(user.role),
                      color: '#ffffff',
                      marginTop: '2px',
                    }}
                  >
                    {user.role}
                  </span>
                </div>
                <button
                  onClick={logout}
                  title={t('auth.logout')}
                  style={{
                    background: 'rgba(255, 255, 255, 0.1)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    borderRadius: '8px',
                    color: '#ffffff',
                    padding: '8px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <LogOut size={16} />
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Page Container */}
        <main style={{ flex: 1, padding: '1.5rem', maxWidth: '1440px', width: '100%', margin: '0 auto' }}>
          {children}
        </main>
      </div>
    </div>
  );
}

export default Shell;
