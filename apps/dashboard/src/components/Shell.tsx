'use client';

import React, { useState, useEffect, useSyncExternalStore } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  BarChart3,
  Users,
  MapPin,
  FileSpreadsheet,
  ClipboardCheck,
  FileText,
  CopyCheck,
  Activity,
  Radio,
  Sparkles,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Home,
  Menu,
  X,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { formatRoleLabel } from '../lib/utils';
import {
  getServerSidebarCollapsed,
  readSidebarCollapsed,
  subscribeSidebarCollapsed,
  writeSidebarCollapsed,
} from '../lib/sidebar-state';
import LanguageSwitch from './LanguageSwitch';
import { api } from '../lib/api';

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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const desktopCollapsed = useSyncExternalStore(
    subscribeSidebarCollapsed,
    readSidebarCollapsed,
    getServerSidebarCollapsed,
  );
  // Preserve desktop collapse preference across page navigations while keeping mobile drawer expanded.
  const collapsed = desktopCollapsed && !mobileMenuOpen;
  const routerPath = usePathname();
  const pathname = activePath || routerPath;

  const router = useRouter();
  const { user, logout, switchArea } = useAuth();
  const { t } = useLanguage();

  const [switchingArea, setSwitchingArea] = useState(false);
  const [openDuplicatesCount, setOpenDuplicatesCount] = useState<number>(0);
  const [activeGnList, setActiveGnList] = useState<
    Array<{ gnId: string; gnName?: string; gnCode?: string; teamId?: string; teamNo?: string }>
  >([]);

  useEffect(() => {
    const allowedRoles = ['super_admin', 'admin', 'cg', 'dc', 'sda', 'cdc_secretary'];
    if (!user || !allowedRoles.includes(user.role)) {
      setOpenDuplicatesCount(0);
      return;
    }

    let cancelled = false;
    const refreshOpenCount = () => {
      api
        .getDuplicates({ status: 'open', limit: 1 })
        .then((res) => {
          if (!cancelled && typeof res?.openCount === 'number') {
            setOpenDuplicatesCount(res.openCount);
          }
        })
        .catch(() => { });
    };

    refreshOpenCount();
    const handler = () => refreshOpenCount();
    window.addEventListener('grs:duplicates-updated', handler);
    return () => {
      cancelled = true;
      window.removeEventListener('grs:duplicates-updated', handler);
    };
  }, [user]);

  useEffect(() => {
    if (user?.role === 'cdc_secretary') {
      if (user.assignments && user.assignments.length > 0) {
        setActiveGnList(user.assignments);
      } else {
        api
          .getAssignments()
          .then((res) => {
            if (res.assignments && res.assignments.length > 0) {
              setActiveGnList(res.assignments);
            }
          })
          .catch(() => { });
      }
    }
  }, [user]);

  const handleAreaSwitch = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextGnId = e.target.value;
    if (!nextGnId || nextGnId === user?.gnId) return;
    setSwitchingArea(true);
    try {
      await switchArea(nextGnId);
      window.location.reload();
    } catch (err: any) {
      alert(`Failed to switch GN area: ${err.message}`);
      setSwitchingArea(false);
    }
  };

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  const navItems: NavItem[] = [
    {
      key: 'nav.progress',
      href: '/progress',
      icon: <BarChart3 size={18} />,
      roles: ['super_admin', 'admin', 'cg', 'dc', 'sda', 'cdc_secretary'],
    },
    {
      key: 'nav.users',
      href: '/users',
      icon: <Users size={18} />,
      roles: ['super_admin', 'admin', 'cg', 'dc', 'sda', 'cdc_secretary'],
    },
    {
      key: 'nav.activity',
      href: '/activity',
      icon: <Radio size={18} />,
      roles: ['super_admin'],
    },
    {
      key: 'nav.assignments',
      href: '/assignments',
      icon: <MapPin size={18} />,
      roles: ['super_admin', 'admin', 'cg', 'dc', 'sda'],
    },
    {
      key: 'nav.areas',
      href: '/areas',
      icon: <MapPin size={18} />,
      roles: ['super_admin', 'admin', 'sda'],
    },
    {
      key: 'nav.houses',
      href: '/houses',
      icon: <Home size={18} />,
      roles: ['super_admin', 'admin', 'sda', 'cdc_secretary'],
    },
    {
      key: 'nav.import',
      href: '/import',
      icon: <FileSpreadsheet size={18} />,
      roles: ['super_admin', 'admin', 'cdc_secretary'],
    },
    {
      key: 'nav.records',
      href: '/records',
      icon: <ClipboardCheck size={18} />,
      roles: ['super_admin', 'admin', 'cg', 'dc', 'sda', 'cdc_secretary'],
    },
    {
      key: 'nav.duplicates',
      href: '/duplicates',
      icon: <CopyCheck size={18} />,
      roles: ['super_admin', 'admin', 'cg', 'dc', 'sda', 'cdc_secretary'],
    },
    {
      key: 'nav.reports',
      href: '/reports',
      icon: <FileSpreadsheet size={18} />,
      roles: ['super_admin', 'admin', 'cg', 'dc', 'sda', 'cdc_secretary'],
    },
    {
      key: 'nav.data_entry',
      href: '/data-entry',
      icon: <FileText size={18} />,
      // Decision C19: Super admin disabled by default, available to Level 4/3/2/Admin
      roles: ['admin', 'dc', 'sda', 'cdc_secretary'],
    },
    {
      key: 'nav.sync_health',
      href: '/progress#sync-health',
      icon: <Activity size={18} />,
      roles: ['super_admin', 'admin', 'cg', 'dc', 'sda', 'cdc_secretary'],
    },
    ...(process.env.NODE_ENV !== 'production'
      ? [{ key: 'nav.showcase', href: '/showcase', icon: <Sparkles size={18} /> }]
      : []),
  ];

  // Role guard: redirect if navigating to a restricted page
  useEffect(() => {
    if (!user?.role) return;
    const normalizedPath = pathname === '/' ? '/' : pathname?.replace(/\/$/, '');
    const currentItem = navItems.find((item) => normalizedPath === item.href);
    if (currentItem && currentItem.roles && !currentItem.roles.includes(user.role)) {
      // Super admin can access data-entry for C19 override
      if (user.role === 'super_admin' && normalizedPath === '/data-entry') {
        return;
      }
      router.replace('/progress');
    }
  }, [pathname, user?.role, router]);

  const allowedNavItems = navItems.filter((item) => {
    if (!item.roles) return true;
    if (!user?.role) return false;
    if (user.role === 'super_admin' && item.href === '/data-entry') {
      return true;
    }
    return item.roles.includes(user.role);
  });

  const getRoleBadgeStyle = (role?: string) => {
    switch (role) {
      case 'super_admin':
        return { bg: '#ede9fe', color: '#6d28d9', border: '#ddd6fe' };
      case 'admin':
        return { bg: '#e0f2fe', color: '#0369a1', border: '#bae6fd' };
      case 'cg':
        return { bg: '#ecfdf5', color: '#047857', border: '#a7f3d0' };
      case 'dc':
        return { bg: '#fef3c7', color: '#b45309', border: '#fde68a' };
      case 'sda':
        return { bg: '#f0f9ff', color: '#0284c7', border: '#e0f2fe' };
      default:
        return { bg: '#f1f5f9', color: '#475569', border: '#e2e8f0' };
    }
  };

  const roleStyle = getRoleBadgeStyle(user?.role);

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-page)' }}>
      {/* Mobile Drawer Backdrop */}
      {mobileMenuOpen && (
        <div
          className="mobile-overlay"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar (Desktop + Mobile Drawer) */}
      <aside
        style={{
          width: collapsed ? '68px' : '256px',
          background: 'var(--slate-900)',
          color: '#ffffff',
          display: 'flex',
          flexDirection: 'column',
          transition: 'width 0.2s cubic-bezier(0.4, 0, 0.2, 1), transform 0.25s ease',
          borderRight: '1px solid rgba(255, 255, 255, 0.08)',
          position: 'sticky',
          top: 0,
          height: '100vh',
          zIndex: 50,
          flexShrink: 0,
        }}
        className={mobileMenuOpen ? 'sidebar-mobile-open' : 'sidebar-desktop'}
      >
        {/* Brand Header */}
        <div
          style={{
            padding: collapsed ? '1.125rem 0.5rem' : '1.125rem 1.25rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'space-between',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            height: 'var(--header-height)',
          }}
        >
          {!collapsed ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  background: 'var(--primary)',
                  color: '#ffffff',
                  fontWeight: 800,
                  fontSize: '11px',
                  letterSpacing: '0.05em',
                  padding: '4px 7px',
                  borderRadius: 'var(--radius-xs)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1px solid rgba(255,255,255,0.15)',
                }}
              >
                GRS
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontWeight: 700, fontSize: '14px', letterSpacing: '-0.01em', color: '#ffffff' }}>
                  Web Dashboard
                </span>
                <span style={{ fontSize: '11px', color: 'var(--slate-400)' }}>
                  Skills Campaign 2026
                </span>
              </div>
            </div>
          ) : (
            <span
              style={{
                background: 'var(--primary)',
                color: '#ffffff',
                fontWeight: 800,
                fontSize: '11px',
                padding: '4px 6px',
                borderRadius: 'var(--radius-xs)',
              }}
            >
              GRS
            </span>
          )}

          {/* Close button for mobile drawer */}
          <button
            className="mobile-close-btn"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close Navigation"
            style={{
              display: 'none',
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '4px',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation Items */}
        <nav
          style={{
            flex: 1,
            padding: '1rem 0.625rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
            overflowY: 'auto',
          }}
          aria-label="Sidebar Navigation"
        >
          {allowedNavItems.map((item) => {
            const normalizedPath =
              pathname === '/' ? '/' : pathname?.replace(/\/$/, '');
            const isActive =
              normalizedPath === item.href ||
              (item.href.includes('#') && normalizedPath === '/progress');
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => {
                  router.push(item.href);
                  setMobileMenuOpen(false);
                }}
                title={collapsed ? t(item.key) : undefined}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: collapsed ? '10px 0' : '9px 12px',
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  width: '100%',
                  borderRadius: 'var(--radius-sm)',
                  border: 'none',
                  background: isActive ? 'rgba(255, 255, 255, 0.12)' : 'transparent',
                  color: isActive ? '#ffffff' : 'var(--slate-300)',
                  fontWeight: isActive ? 600 : 500,
                  fontSize: '13.5px',
                  cursor: 'pointer',
                  transition: 'background-color 0.15s ease, color 0.15s ease',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                    e.currentTarget.style.color = '#ffffff';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = 'var(--slate-300)';
                  }
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: isActive ? '#34d399' : 'var(--slate-400)',
                    flexShrink: 0,
                    position: 'relative',
                  }}
                >
                  {item.icon}
                  {collapsed && item.key === 'nav.duplicates' && openDuplicatesCount > 0 && (
                    <span
                      style={{
                        position: 'absolute',
                        top: -3,
                        right: -4,
                        width: 7,
                        height: 7,
                        borderRadius: '9999px',
                        background: '#f59e0b',
                      }}
                    />
                  )}
                </div>
                {!collapsed && (
                  <span
                    style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      flex: 1,
                    }}
                  >
                    {t(item.key)}
                  </span>
                )}
                {!collapsed && item.key === 'nav.duplicates' && openDuplicatesCount > 0 && (
                  <span
                    data-testid="nav-duplicates-badge"
                    style={{
                      background: '#f59e0b',
                      color: '#1e293b',
                      borderRadius: '9999px',
                      padding: '1px 7px',
                      fontSize: '11px',
                      fontWeight: 700,
                      lineHeight: '16px',
                      flexShrink: 0,
                    }}
                  >
                    {openDuplicatesCount > 99 ? '99+' : openDuplicatesCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Desktop Collapse Toggle */}
        <div
          style={{
            padding: '0.75rem',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            justifyContent: 'center',
          }}
          className="desktop-collapse-container"
        >
          <button
            type="button"
            onClick={() => writeSidebarCollapsed(!desktopCollapsed)}
            aria-label={desktopCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--slate-400)',
              padding: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
              e.currentTarget.style.color = '#ffffff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
              e.currentTarget.style.color = 'var(--slate-400)';
            }}
          >
            {desktopCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Top Header */}
        <header
          className="civic-topbar"
          style={{
            padding: '0 1.5rem',
            height: 'var(--header-height)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            position: 'sticky',
            top: 0,
            zIndex: 40,
            background: '#ffffff',
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >
          {/* Left: Mobile hamburger & breadcrumbs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              type="button"
              className="mobile-hamburger-btn"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open Navigation"
              style={{
                display: 'none',
                background: 'transparent',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                padding: '6px',
                cursor: 'pointer',
                color: 'var(--slate-700)',
              }}
            >
              <Menu size={18} />
            </button>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: 'var(--primary)',
                    background: 'var(--primary-subtle)',
                    padding: '1px 6px',
                    borderRadius: 'var(--radius-xs)',
                  }}
                >
                  Gov.lk
                </span>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--slate-900)' }}>
                  {t('app.title')}
                </span>
              </div>
            </div>
          </div>

          {/* Right: Language switch, GN switcher, user profile, logout */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
            {user?.role === 'cdc_secretary' && activeGnList.length > 1 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'var(--slate-50)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '3px 8px',
                }}
              >
                <MapPin size={14} style={{ color: 'var(--primary)' }} />
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--slate-600)' }}>
                  GN Area:
                </span>
                <select
                  value={user.gnId || ''}
                  onChange={handleAreaSwitch}
                  disabled={switchingArea}
                  style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color: 'var(--primary)',
                    background: 'transparent',
                    border: 'none',
                    cursor: switchingArea ? 'wait' : 'pointer',
                    outline: 'none',
                    padding: '2px 4px',
                  }}
                >
                  {activeGnList.map((a) => (
                    <option key={a.gnId} value={a.gnId}>
                      {a.gnName
                        ? `${a.gnName} (${a.gnCode || a.gnId.slice(0, 6)})`
                        : `GN ${a.gnId.slice(0, 8)}`}
                      {a.teamNo ? ` — Team ${a.teamNo}` : ''}
                    </option>
                  ))}
                </select>
                {switchingArea && <Loader2 size={12} className="animate-spin" />}
              </div>
            )}

            <LanguageSwitch variant="light" />

            {user && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  paddingLeft: '0.75rem',
                  borderLeft: '1px solid var(--border-subtle)',
                }}
              >
                <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                  <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--slate-900)', lineHeight: 1.2 }}>
                    {user.fullName || user.userCode}
                  </span>
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      padding: '1px 6px',
                      borderRadius: 'var(--radius-xs)',
                      background: roleStyle.bg,
                      color: roleStyle.color,
                      border: `1px solid ${roleStyle.border}`,
                      marginTop: '3px',
                      letterSpacing: '0.03em',
                    }}
                  >
                    {formatRoleLabel(user.role)}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={logout}
                  title={t('auth.logout')}
                  aria-label={t('auth.logout')}
                  style={{
                    background: 'var(--slate-100)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--slate-600)',
                    padding: '7px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#fee2e2';
                    e.currentTarget.style.color = '#dc2626';
                    e.currentTarget.style.borderColor = '#fecaca';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'var(--slate-100)';
                    e.currentTarget.style.color = 'var(--slate-600)';
                    e.currentTarget.style.borderColor = 'var(--border-subtle)';
                  }}
                >
                  <LogOut size={15} />
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Page Canvas Container */}
        <main
          style={{
            flex: 1,
            padding: 'clamp(1rem, 2.5vw, 1.75rem)',
            maxWidth: '1440px',
            width: '100%',
            margin: '0 auto',
          }}
        >
          {children}
        </main>
      </div>

      <style jsx global>{`
        @media (max-width: 1024px) {
          .desktop-collapse-container {
            display: none !important;
          }

          .mobile-hamburger-btn {
            display: inline-flex !important;
          }

          .sidebar-desktop {
            position: fixed !important;
            top: 0;
            left: 0;
            bottom: 0;
            transform: translateX(-100%);
            width: 260px !important;
            z-index: 60 !important;
          }

          .sidebar-mobile-open {
            position: fixed !important;
            top: 0;
            left: 0;
            bottom: 0;
            transform: translateX(0) !important;
            width: 260px !important;
            z-index: 60 !important;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3) !important;
          }

          .mobile-close-btn {
            display: inline-flex !important;
          }
        }
      `}</style>
    </div>
  );
}

export default Shell;
