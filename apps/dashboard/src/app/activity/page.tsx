'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  Clock,
  Globe,
  History,
  Radio,
  RefreshCw,
  Search,
  Smartphone,
  UserCheck,
  Users,
  UserX,
  X,
} from 'lucide-react';
import KPICard from '../../components/KPICard';
import Shell from '../../components/Shell';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import {
  AccountActivityDetailResponse,
  AccountActivityItem,
  AccountActivityListResponse,
  ActivityClientType,
  ActivityStatus,
  api,
  ApiError,
} from '../../lib/api';
import {
  formatActiveDuration,
  formatDate,
  formatRelativeTime,
} from '../../lib/utils';

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  cg: 'Commissioner General',
  dc: 'District Coordinator (DC)',
  sda: 'SDA Officer (Level 3)',
  cdc_secretary: 'CDC Secretary',
  team_member: 'Team Member',
};

const ROLE_OPTIONS = [
  'super_admin',
  'admin',
  'cg',
  'dc',
  'sda',
  'cdc_secretary',
  'team_member',
];

function ClientBadge({ clientType }: { clientType: ActivityClientType | string }) {
  if (clientType === 'web') {
    return (
      <span className="badge badge-info" style={{ gap: '4px' }}>
        <Globe size={11} />
        Web
      </span>
    );
  }
  if (clientType === 'mobile') {
    return (
      <span className="badge badge-success" style={{ gap: '4px' }}>
        <Smartphone size={11} />
        Mobile
      </span>
    );
  }
  return <span className="badge badge-neutral">API</span>;
}

export default function UserActivityPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();

  const [statusFilter, setStatusFilter] = useState<'all' | ActivityStatus>('all');
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [clientFilter, setClientFilter] = useState<'all' | 'web' | 'mobile'>('all');
  const [searchInput, setSearchInput] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const limit = 50;

  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [data, setData] = useState<AccountActivityListResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  const [selectedUser, setSelectedUser] = useState<AccountActivityItem | null>(null);
  const [detail, setDetail] = useState<AccountActivityDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const isSuperAdmin = user?.role === 'super_admin';

  useEffect(() => {
    if (!authLoading && user && !isSuperAdmin) {
      router.replace('/progress');
    }
  }, [authLoading, user, isSuperAdmin, router]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 10_000);
    return () => window.clearInterval(timer);
  }, []);

  const fetchActivity = useCallback(
    async (isBackground = false) => {
      if (!isSuperAdmin) return;
      if (isBackground) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);
      try {
        const res = await api.getAccountActivity({
          status: statusFilter,
          role: roleFilter || undefined,
          clientType: clientFilter,
          search: debouncedSearch || undefined,
          page,
          limit,
        });
        setData(res);
        setNowMs(Date.now());
      } catch (err: unknown) {
        const msg =
          err instanceof ApiError
            ? err.message
            : 'Failed to load user activity metrics.';
        setError(msg);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [isSuperAdmin, statusFilter, roleFilter, clientFilter, debouncedSearch, page],
  );

  useEffect(() => {
    if (!isSuperAdmin) return;
    const timer = window.setTimeout(() => {
      void fetchActivity(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [isSuperAdmin, fetchActivity]);

  useEffect(() => {
    if (!isSuperAdmin || !autoRefresh) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void fetchActivity(true);
      }
    }, 30_000);
    return () => window.clearInterval(id);
  }, [isSuperAdmin, autoRefresh, fetchActivity]);

  const handleOpenHistory = async (item: AccountActivityItem) => {
    setSelectedUser(item);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    try {
      const res = await api.getAccountActivityDetail(item.id);
      setDetail(res);
    } catch (err: unknown) {
      setDetailError(
        err instanceof ApiError
          ? err.message
          : 'Failed to load user session history.',
      );
    } finally {
      setDetailLoading(false);
    }
  };

  const durationLabels = useMemo(
    () => ({
      ltMin: t('activity.dur_lt_min'),
      min: t('activity.dur_min'),
      mins: t('activity.dur_mins'),
      hr: t('activity.dur_hr'),
      hrs: t('activity.dur_hrs'),
    }),
    [t],
  );

  const relativeLabels = useMemo(
    () => ({
      justNow: t('activity.rel_just_now'),
      minAgo: t('activity.rel_min_ago'),
      minsAgo: t('activity.rel_mins_ago'),
      hrAgo: t('activity.rel_hr_ago'),
      hrsAgo: t('activity.rel_hrs_ago'),
      dayAgo: t('activity.rel_day_ago'),
      daysAgo: t('activity.rel_days_ago'),
    }),
    [t],
  );

  const formatEndReason = (reason: string | null): string => {
    switch (reason) {
      case 'logout':
        return t('activity.reason_logout');
      case 'idle_timeout':
        return t('activity.reason_idle_timeout');
      case 'password_reset':
        return t('activity.reason_password_reset');
      case 'deactivated':
        return t('activity.reason_deactivated');
      case 'superseded':
        return t('activity.reason_superseded');
      default:
        return reason || '-';
    }
  };

  if (authLoading || !user) {
    return (
      <Shell activePath="/activity">
        <div
          style={{
            padding: '3rem 1rem',
            textAlign: 'center',
            color: 'var(--slate-500)',
            fontSize: '14px',
          }}
        >
          Loading activity monitor...
        </div>
      </Shell>
    );
  }

  if (!isSuperAdmin) {
    return (
      <Shell activePath="/activity">
        <div
          style={{
            padding: '2.5rem 1rem',
            textAlign: 'center',
            color: 'var(--slate-500)',
            fontSize: '14px',
          }}
        >
          <AlertCircle
            size={32}
            style={{ marginBottom: '0.75rem', color: 'var(--danger)' }}
          />
          <p>Super Admin access is required to view user activity monitoring.</p>
        </div>
      </Shell>
    );
  }

  const summary = data?.summary;
  const generatedMs = data?.generatedAt
    ? new Date(data.generatedAt).getTime()
    : nowMs;
  const liveDeltaSeconds = Math.max(0, Math.floor((nowMs - generatedMs) / 1000));
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / limit));

  return (
    <Shell activePath="/activity">
      {/* Page Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '1.5rem',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div>
          <h1
            style={{
              fontSize: '22px',
              fontWeight: 700,
              color: 'var(--slate-900)',
              letterSpacing: '-0.02em',
              margin: 0,
            }}
          >
            {t('activity.title')}
          </h1>
          <p
            style={{
              fontSize: '13px',
              color: 'var(--slate-500)',
              marginTop: '4px',
            }}
          >
            {t('activity.subtitle')}
          </p>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            flexWrap: 'wrap',
          }}
        >
          {data?.generatedAt && (
            <span
              className="tabular-nums"
              style={{ fontSize: '12px', color: 'var(--slate-500)' }}
            >
              {t('activity.last_updated')}:{' '}
              <strong style={{ color: 'var(--slate-700)', fontWeight: 600 }}>
                {formatDate(data.generatedAt)}
              </strong>
            </span>
          )}

          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '12.5px',
              fontWeight: 500,
              color: 'var(--slate-700)',
              cursor: 'pointer',
              padding: '0.45rem 0.75rem',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
              background: '#ffffff',
              boxShadow: 'var(--shadow-xs)',
            }}
          >
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              style={{ accentColor: 'var(--primary)' }}
            />
            <span>{t('activity.auto_refresh')}</span>
          </label>

          <button
            type="button"
            className="btn-secondary"
            onClick={() => void fetchActivity(true)}
            disabled={loading || refreshing}
          >
            <RefreshCw
              size={14}
              className={refreshing ? 'animate-spin' : undefined}
            />
            <span>{t('activity.refresh_now')}</span>
          </button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div
          style={{
            background: 'var(--danger-bg)',
            border: '1px solid var(--danger-border)',
            borderRadius: 'var(--radius-sm)',
            padding: '12px 16px',
            color: 'var(--danger-text)',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '13.5px',
          }}
        >
          <AlertCircle size={18} style={{ flexShrink: 0 }} />
          <span>{error}</span>
        </div>
      )}

      {/* Summary KPI Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        <KPICard
          title={t('activity.logged_in_now')}
          value={summary ? summary.onlineNow : '-'}
          subtitle={
            summary
              ? t('activity.web_mobile_split')
                .replace('{web}', String(summary.onlineWeb))
                .replace('{mobile}', String(summary.onlineMobile))
              : undefined
          }
          icon={<Radio size={18} />}
          colorScheme="emerald"
        />
        <KPICard
          title={t('activity.offline_active')}
          value={summary ? summary.offlinePreviouslyActive : '-'}
          subtitle={
            summary
              ? `${t('activity.never_signed_in')}: ${summary.neverSignedIn}`
              : undefined
          }
          icon={<UserX size={18} />}
          colorScheme="amber"
        />
        <KPICard
          title={t('activity.active_today')}
          value={summary ? summary.activeToday : '-'}
          progressPercent={
            summary && summary.totalAccounts > 0
              ? Math.round((summary.activeToday / summary.totalAccounts) * 100)
              : 0
          }
          icon={<Clock size={18} />}
          colorScheme="blue"
        />
        <KPICard
          title={t('activity.total_accounts')}
          value={summary ? summary.totalAccounts : '-'}
          subtitle={t('activity.idle_rule_note')}
          icon={<Users size={18} />}
          colorScheme="purple"
        />
      </div>

      {/* Filters & Status Tabs Toolbar */}
      <div
        className="panel"
        style={{
          padding: '1rem 1.25rem',
          marginBottom: '1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          {(
            [
              {
                key: 'all' as const,
                label: t('activity.filter_all'),
                count: summary?.totalAccounts,
              },
              {
                key: 'online' as const,
                label: t('activity.filter_online'),
                count: summary?.onlineNow,
              },
              {
                key: 'offline' as const,
                label: t('activity.filter_offline'),
                count: summary?.offlinePreviouslyActive,
              },
              {
                key: 'never' as const,
                label: t('activity.filter_never'),
                count: summary?.neverSignedIn,
              },
            ]
          ).map((tab) => {
            const active = statusFilter === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => {
                  setStatusFilter(tab.key);
                  setPage(1);
                }}
                style={{
                  padding: '0.42rem 0.85rem',
                  borderRadius: '9999px',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: active
                    ? '1px solid var(--primary)'
                    : '1px solid var(--border-subtle)',
                  background: active ? 'var(--primary)' : '#ffffff',
                  color: active ? '#ffffff' : 'var(--slate-700)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.15s ease',
                }}
              >
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span
                    className="tabular-nums"
                    style={{
                      fontSize: '11px',
                      padding: '1px 7px',
                      borderRadius: '9999px',
                      background: active
                        ? 'rgba(255,255,255,0.22)'
                        : 'var(--slate-100)',
                      color: active ? '#ffffff' : 'var(--slate-800)',
                    }}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <div style={{ position: 'relative', flex: '1 1 260px' }}>
            <Search
              size={15}
              color="var(--slate-400)"
              style={{
                position: 'absolute',
                left: '11px',
                top: '50%',
                transform: 'translateY(-50%)',
              }}
            />
            <input
              type="text"
              className="input-field"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t('activity.search_placeholder')}
              style={{ paddingLeft: '34px' }}
            />
          </div>

          <select
            className="select-field"
            value={roleFilter}
            onChange={(e) => {
              setRoleFilter(e.target.value);
              setPage(1);
            }}
            style={{ width: '210px', flex: '0 0 auto' }}
          >
            <option value="">{t('activity.role_all')}</option>
            {ROLE_OPTIONS.map((roleKey) => (
              <option key={roleKey} value={roleKey}>
                {ROLE_LABELS[roleKey] || roleKey}
              </option>
            ))}
          </select>

          <select
            className="select-field"
            value={clientFilter}
            onChange={(e) => {
              setClientFilter(e.target.value as 'all' | 'web' | 'mobile');
              setPage(1);
            }}
            style={{ width: '165px', flex: '0 0 auto' }}
          >
            <option value="all">{t('activity.platform_all')}</option>
            <option value="web">{t('activity.platform_web')}</option>
            <option value="mobile">{t('activity.platform_mobile')}</option>
          </select>
        </div>
      </div>

      {/* Activity Table */}
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t('activity.col_user')}</th>
              <th>{t('activity.col_role_area')}</th>
              <th>{t('activity.col_status')}</th>
              <th>{t('activity.col_last_active')}</th>
              <th>{t('activity.col_active_duration')}</th>
              <th>{t('activity.col_today_total')}</th>
              <th style={{ textAlign: 'right' }}>{t('activity.col_actions')}</th>
            </tr>
          </thead>
          <tbody>
            {loading && !data ? (
              <tr>
                <td
                  colSpan={7}
                  style={{
                    textAlign: 'center',
                    padding: '2.5rem 1rem',
                    color: 'var(--slate-400)',
                  }}
                >
                  Loading user activity...
                </td>
              </tr>
            ) : !data || data.items.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  style={{
                    textAlign: 'center',
                    padding: '2.5rem 1rem',
                    color: 'var(--slate-400)',
                  }}
                >
                  {t('activity.empty')}
                </td>
              </tr>
            ) : (
              data.items.map((item) => {
                const areaParts = [
                  item.districtName,
                  item.dsName,
                  item.gnName,
                  item.teamName,
                ].filter(Boolean);

                const isOnline = item.status === 'online';
                const liveSessionSecs =
                  isOnline && item.currentSessionDurationSeconds !== null
                    ? item.currentSessionDurationSeconds + liveDeltaSeconds
                    : null;
                const liveTodaySecs =
                  isOnline && item.todayActiveSeconds > 0
                    ? item.todayActiveSeconds + liveDeltaSeconds
                    : item.todayActiveSeconds;

                return (
                  <tr key={item.id}>
                    {/* User */}
                    <td>
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '3px',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            flexWrap: 'wrap',
                          }}
                        >
                          <span
                            style={{
                              fontWeight: 600,
                              color: 'var(--slate-900)',
                            }}
                          >
                            {item.fullName}
                          </span>
                          {!item.isActive && (
                            <span className="badge badge-danger">
                              {t('activity.deactivated_badge')}
                            </span>
                          )}
                        </div>
                        <span
                          style={{
                            fontSize: '12px',
                            color: 'var(--slate-500)',
                            fontFamily: 'monospace',
                          }}
                        >
                          {item.userCode}
                          {item.email ? ` · ${item.email}` : ''}
                        </span>
                      </div>
                    </td>

                    {/* Role & Area */}
                    <td>
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '4px',
                        }}
                      >
                        <span
                          className="badge badge-neutral"
                          style={{ alignSelf: 'flex-start' }}
                        >
                          {ROLE_LABELS[item.role] || item.role}
                        </span>
                        <span
                          style={{ fontSize: '12px', color: 'var(--slate-500)' }}
                        >
                          {areaParts.length > 0
                            ? areaParts.join(' › ')
                            : 'National'}
                        </span>
                      </div>
                    </td>

                    {/* Status */}
                    <td>
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '5px',
                        }}
                      >
                        {item.status === 'online' ? (
                          <span
                            className="badge badge-success"
                            style={{ alignSelf: 'flex-start', gap: '6px' }}
                          >
                            <span
                              style={{
                                width: '7px',
                                height: '7px',
                                borderRadius: '9999px',
                                background: '#16a34a',
                                display: 'inline-block',
                              }}
                            />
                            {t('activity.status_online')}
                          </span>
                        ) : item.status === 'offline' ? (
                          <span
                            className="badge badge-neutral"
                            style={{ alignSelf: 'flex-start' }}
                          >
                            {t('activity.status_offline')}
                          </span>
                        ) : (
                          <span
                            className="badge badge-neutral"
                            style={{
                              alignSelf: 'flex-start',
                              opacity: 0.72,
                            }}
                          >
                            {t('activity.status_never')}
                          </span>
                        )}

                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            flexWrap: 'wrap',
                          }}
                        >
                          {item.status === 'online'
                            ? item.activeClients.map((c) => (
                              <ClientBadge key={c} clientType={c} />
                            ))
                            : item.lastClientType && (
                              <ClientBadge clientType={item.lastClientType} />
                            )}
                        </div>
                      </div>
                    </td>

                    {/* Last Active */}
                    <td>
                      {item.status === 'online' ? (
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '2px',
                          }}
                        >
                          <span
                            style={{
                              fontSize: '13px',
                              fontWeight: 600,
                              color: 'var(--success-text)',
                            }}
                          >
                            {t('activity.rel_just_now')}
                          </span>
                          <span
                            className="tabular-nums"
                            style={{ fontSize: '12px', color: 'var(--slate-500)' }}
                          >
                            {formatDate(item.lastActiveAt ?? undefined)}
                          </span>
                        </div>
                      ) : item.lastActiveAt ? (
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '2px',
                          }}
                        >
                          <span
                            style={{
                              fontSize: '13px',
                              fontWeight: 600,
                              color: 'var(--slate-900)',
                            }}
                          >
                            {formatRelativeTime(
                              item.lastActiveAt,
                              nowMs,
                              relativeLabels,
                            )}
                          </span>
                          <span
                            className="tabular-nums"
                            style={{ fontSize: '12px', color: 'var(--slate-500)' }}
                          >
                            {formatDate(item.lastActiveAt)}
                          </span>
                        </div>
                      ) : (
                        <span
                          style={{ fontSize: '12px', color: 'var(--slate-400)' }}
                        >
                          -
                        </span>
                      )}
                    </td>

                    {/* Active Duration */}
                    <td>
                      {isOnline && liveSessionSecs !== null ? (
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '2px',
                          }}
                        >
                          <span
                            className="tabular-nums"
                            style={{
                              fontSize: '13px',
                              fontWeight: 600,
                              color: 'var(--success-text)',
                            }}
                          >
                            {t('activity.current_session_prefix')}{' '}
                            {formatActiveDuration(liveSessionSecs, durationLabels)}
                          </span>
                          {item.currentSessionStartedAt && (
                            <span
                              className="tabular-nums"
                              style={{
                                fontSize: '12px',
                                color: 'var(--slate-500)',
                              }}
                            >
                              {t('activity.started_at')}:{' '}
                              {formatDate(item.currentSessionStartedAt)}
                            </span>
                          )}
                        </div>
                      ) : item.lastSessionDurationSeconds !== null ? (
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '2px',
                          }}
                        >
                          <span
                            className="tabular-nums"
                            style={{
                              fontSize: '13px',
                              fontWeight: 600,
                              color: 'var(--slate-800)',
                            }}
                          >
                            {t('activity.last_session_prefix')}{' '}
                            {formatActiveDuration(
                              item.lastSessionDurationSeconds,
                              durationLabels,
                            )}
                          </span>
                          {item.lastSessionEndedAt && (
                            <span
                              className="tabular-nums"
                              style={{
                                fontSize: '12px',
                                color: 'var(--slate-500)',
                              }}
                            >
                              {t('activity.ended_at')}:{' '}
                              {formatDate(item.lastSessionEndedAt)}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span
                          style={{ fontSize: '12px', color: 'var(--slate-400)' }}
                        >
                          {t('activity.no_sessions_yet')}
                        </span>
                      )}
                    </td>

                    {/* Active Today Total */}
                    <td>
                      <span
                        className="tabular-nums"
                        style={{
                          fontSize: '13px',
                          fontWeight: 600,
                          color:
                            liveTodaySecs > 0
                              ? 'var(--primary)'
                              : 'var(--slate-400)',
                        }}
                      >
                        {liveTodaySecs > 0
                          ? formatActiveDuration(liveTodaySecs, durationLabels)
                          : '-'}
                      </span>
                    </td>

                    {/* Session History Action */}
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => void handleOpenHistory(item)}
                        style={{ padding: '5px 10px', fontSize: '12px' }}
                      >
                        <History size={13} />
                        <span>{t('activity.view_history')}</span>
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* Pagination Footer */}
        {data && data.total > 0 && (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              padding: '0.75rem 1rem',
              borderTop: '1px solid var(--border-subtle)',
              background: 'var(--slate-50)',
            }}
          >
            <span
              className="tabular-nums"
              style={{ fontSize: '12px', color: 'var(--slate-500)' }}
            >
              Showing {(data.page - 1) * data.limit + 1}–
              {Math.min(data.page * data.limit, data.total)} of {data.total} users
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                className="btn-secondary"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                style={{ padding: '0.35rem 0.75rem', fontSize: '12px' }}
              >
                Previous
              </button>
              <span
                className="tabular-nums"
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--slate-700)',
                }}
              >
                Page {page} / {totalPages}
              </span>
              <button
                type="button"
                className="btn-secondary"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                style={{ padding: '0.35rem 0.75rem', fontSize: '12px' }}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Session History Modal */}
      {selectedUser && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={() => setSelectedUser(null)}
        >
          <div
            className="modal-content"
            style={{ maxWidth: '46rem' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <h2
                  style={{
                    fontSize: '17px',
                    fontWeight: 700,
                    color: 'var(--slate-900)',
                    margin: 0,
                  }}
                >
                  {t('activity.history_title')} — {selectedUser.fullName}
                </h2>
                <p
                  style={{
                    fontSize: '12px',
                    color: 'var(--slate-500)',
                    marginTop: '2px',
                  }}
                >
                  {selectedUser.userCode} ·{' '}
                  {ROLE_LABELS[selectedUser.role] || selectedUser.role}
                </p>
              </div>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setSelectedUser(null)}
                aria-label={t('activity.close')}
              >
                <X size={18} />
              </button>
            </div>

            <div
              className="modal-body"
              style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
            >
              {detailLoading ? (
                <div
                  style={{
                    padding: '2rem',
                    textAlign: 'center',
                    color: 'var(--slate-500)',
                    fontSize: '14px',
                  }}
                >
                  Loading session history...
                </div>
              ) : detailError ? (
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--danger-bg)',
                    border: '1px solid var(--danger-border)',
                    color: 'var(--danger-text)',
                    fontSize: '13.5px',
                  }}
                >
                  {detailError}
                </div>
              ) : detail ? (
                <>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                      gap: '12px',
                      padding: '12px',
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--slate-50)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '12px', color: 'var(--slate-500)' }}>
                        {t('activity.col_status')}
                      </div>
                      <div
                        style={{
                          fontSize: '13.5px',
                          fontWeight: 600,
                          color: 'var(--slate-900)',
                        }}
                      >
                        {detail.account.status === 'online'
                          ? t('activity.status_online')
                          : detail.account.status === 'offline'
                            ? t('activity.status_offline')
                            : t('activity.status_never')}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '12px', color: 'var(--slate-500)' }}>
                        {t('activity.col_last_active')}
                      </div>
                      <div
                        className="tabular-nums"
                        style={{
                          fontSize: '13.5px',
                          fontWeight: 600,
                          color: 'var(--slate-900)',
                        }}
                      >
                        {detail.account.lastActiveAt
                          ? formatDate(detail.account.lastActiveAt)
                          : '-'}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '12px', color: 'var(--slate-500)' }}>
                        {t('activity.col_today_total')}
                      </div>
                      <div
                        className="tabular-nums"
                        style={{
                          fontSize: '13.5px',
                          fontWeight: 600,
                          color: 'var(--primary)',
                        }}
                      >
                        {detail.account.todayActiveSeconds > 0
                          ? formatActiveDuration(
                            detail.account.todayActiveSeconds,
                            durationLabels,
                          )
                          : '0 mins'}
                      </div>
                    </div>
                  </div>

                  {detail.sessions.length === 0 ? (
                    <div
                      style={{
                        textAlign: 'center',
                        padding: '1.5rem 0',
                        fontSize: '13.5px',
                        color: 'var(--slate-500)',
                      }}
                    >
                      {t('activity.no_sessions_yet')}
                    </div>
                  ) : (
                    <div className="table-container">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Platform</th>
                            <th>{t('activity.started_at')}</th>
                            <th>{t('activity.ended_at')}</th>
                            <th>{t('activity.col_active_duration')}</th>
                            <th>{t('activity.col_status')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detail.sessions.map((sess) => (
                            <tr key={sess.id}>
                              <td>
                                <ClientBadge clientType={sess.clientType} />
                              </td>
                              <td
                                className="tabular-nums"
                                style={{ fontSize: '12px' }}
                              >
                                {formatDate(sess.startedAt)}
                              </td>
                              <td
                                className="tabular-nums"
                                style={{ fontSize: '12px' }}
                              >
                                {sess.isOnline ? (
                                  <span
                                    style={{
                                      fontWeight: 600,
                                      color: 'var(--success-text)',
                                    }}
                                  >
                                    {t('activity.status_online')}
                                  </span>
                                ) : (
                                  formatDate(
                                    sess.effectiveEndedAt ?? sess.lastActiveAt,
                                  )
                                )}
                              </td>
                              <td
                                className="tabular-nums"
                                style={{ fontSize: '13px', fontWeight: 600 }}
                              >
                                {formatActiveDuration(
                                  sess.durationSeconds,
                                  durationLabels,
                                )}
                              </td>
                              <td>
                                {sess.isOnline ? (
                                  <span className="badge badge-success">
                                    <UserCheck size={11} /> Active
                                  </span>
                                ) : (
                                  <span className="badge badge-neutral">
                                    {formatEndReason(sess.endReason)}
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              ) : null}
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setSelectedUser(null)}
              >
                {t('activity.close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}
