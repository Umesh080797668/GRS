'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
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
  sda: 'Divisional Assistant (SDA)',
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

  // Enforce Super Admin only on this page
  useEffect(() => {
    if (!authLoading && user && !isSuperAdmin) {
      router.replace('/progress');
    }
  }, [authLoading, user, isSuperAdmin, router]);

  // Debounce text search cleanly
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  // Live duration clock tick (every 10s so active durations stay fresh)
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

  // Optional 30s auto-refresh while visible
  useEffect(() => {
    if (!isSuperAdmin || !autoRefresh) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchActivity(true);
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

  if (authLoading || !user || !isSuperAdmin) {
    return null;
  }

  const summary = data?.summary;
  const generatedMs = data?.generatedAt
    ? new Date(data.generatedAt).getTime()
    : nowMs;
  const liveDeltaSeconds = Math.max(0, Math.floor((nowMs - generatedMs) / 1000));
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / limit));

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div
        className="flex flex-wrap items-start justify-between gap-4"
        style={{ paddingBottom: '0.25rem' }}
      >
        <div>
          <h1
            className="text-2xl font-bold tracking-tight"
            style={{ color: 'var(--navy)' }}
          >
            {t('activity.title')}
          </h1>
          <p className="text-sm text-muted" style={{ marginTop: '0.25rem' }}>
            {t('activity.subtitle')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {data?.generatedAt && (
            <span
              className="text-xs text-muted"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {t('activity.last_updated')}: {formatDate(data.generatedAt)}
            </span>
          )}

          <label
            className="inline-flex items-center gap-2 text-xs font-medium"
            style={{
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '0.45rem 0.75rem',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-main)',
              background: '#fff',
            }}
          >
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              style={{ accentColor: 'var(--primary)' }}
            />
            {t('activity.auto_refresh')}
          </label>

          <button
            type="button"
            className="btn-secondary"
            onClick={() => fetchActivity(true)}
            disabled={loading || refreshing}
          >
            <RefreshCw
              size={15}
              className={refreshing ? 'animate-spin' : undefined}
            />
            {t('activity.refresh_now')}
          </button>
        </div>
      </div>

      {/* Summary KPI Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '1rem',
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

      {/* Filters & Status Tabs */}
      <div className="panel" style={{ padding: '1rem 1.25rem' }}>
        <div
          className="flex flex-wrap items-center justify-between gap-3"
          style={{ marginBottom: '0.875rem' }}
        >
          <div className="flex flex-wrap items-center gap-2">
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
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    border: active
                      ? '1px solid var(--primary)'
                      : '1px solid var(--border-main)',
                    background: active ? 'var(--primary)' : '#fff',
                    color: active ? '#fff' : 'var(--text-secondary)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span>{tab.label}</span>
                  {tab.count !== undefined && (
                    <span
                      style={{
                        fontSize: '0.7rem',
                        padding: '0.05rem 0.4rem',
                        borderRadius: '9999px',
                        background: active
                          ? 'rgba(255,255,255,0.22)'
                          : 'var(--bg-subtle)',
                        color: active ? '#fff' : 'var(--text-main)',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '0.75rem',
          }}
        >
          <div style={{ position: 'relative' }}>
            <Search
              size={15}
              style={{
                position: 'absolute',
                left: '0.75rem',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
              }}
            />
            <input
              type="text"
              className="input-field"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t('activity.search_placeholder')}
              style={{ paddingLeft: '2.25rem' }}
            />
          </div>

          <select
            className="select-field"
            value={roleFilter}
            onChange={(e) => {
              setRoleFilter(e.target.value);
              setPage(1);
            }}
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
          >
            <option value="all">{t('activity.platform_all')}</option>
            <option value="web">{t('activity.platform_web')}</option>
            <option value="mobile">{t('activity.platform_mobile')}</option>
          </select>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div
          className="panel"
          style={{
            padding: '1rem 1.25rem',
            borderColor: '#fecaca',
            background: '#fef2f2',
            color: '#b91c1c',
            fontSize: '0.875rem',
            fontWeight: 500,
          }}
        >
          {error}
        </div>
      )}

      {/* Activity Table */}
      <div className="panel" style={{ overflow: 'hidden' }}>
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
                      color: 'var(--text-muted)',
                    }}
                  >
                    {t('common.loading') || 'Loading...'}
                  </td>
                </tr>
              ) : !data || data.items.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    style={{
                      textAlign: 'center',
                      padding: '2.5rem 1rem',
                      color: 'var(--text-muted)',
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
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className="font-semibold"
                              style={{ color: 'var(--navy)' }}
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
                            className="text-xs text-muted"
                            style={{ fontFamily: 'monospace' }}
                          >
                            {item.userCode}
                            {item.email ? ` · ${item.email}` : ''}
                          </span>
                        </div>
                      </td>

                      {/* Role & Area */}
                      <td>
                        <div className="flex flex-col gap-1">
                          <span
                            className="badge badge-neutral"
                            style={{ alignSelf: 'flex-start' }}
                          >
                            {ROLE_LABELS[item.role] || item.role}
                          </span>
                          <span className="text-xs text-muted">
                            {areaParts.length > 0 ? areaParts.join(' › ') : 'National'}
                          </span>
                        </div>
                      </td>

                      {/* Online / Offline Status */}
                      <td>
                        <div className="flex flex-col gap-1">
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

                          <div className="flex items-center gap-1 flex-wrap">
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
                          <div className="flex flex-col gap-1">
                            <span
                              className="text-sm font-semibold"
                              style={{ color: '#15803d' }}
                            >
                              {t('activity.rel_just_now')}
                            </span>
                            <span className="text-xs text-muted tabular-nums">
                              {formatDate(item.lastActiveAt ?? undefined)}
                            </span>
                          </div>
                        ) : item.lastActiveAt ? (
                          <div className="flex flex-col gap-1">
                            <span
                              className="text-sm font-semibold"
                              style={{ color: 'var(--navy)' }}
                            >
                              {formatRelativeTime(
                                item.lastActiveAt,
                                nowMs,
                                relativeLabels,
                              )}
                            </span>
                            <span className="text-xs text-muted tabular-nums">
                              {formatDate(item.lastActiveAt)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted">-</span>
                        )}
                      </td>

                      {/* Active Duration */}
                      <td>
                        {isOnline && liveSessionSecs !== null ? (
                          <div className="flex flex-col gap-1">
                            <span
                              className="text-sm font-semibold tabular-nums"
                              style={{ color: '#047857' }}
                            >
                              {t('activity.current_session_prefix')}{' '}
                              {formatActiveDuration(liveSessionSecs, durationLabels)}
                            </span>
                            {item.currentSessionStartedAt && (
                              <span className="text-xs text-muted tabular-nums">
                                {t('activity.started_at')}:{' '}
                                {formatDate(item.currentSessionStartedAt)}
                              </span>
                            )}
                          </div>
                        ) : item.lastSessionDurationSeconds !== null ? (
                          <div className="flex flex-col gap-1">
                            <span
                              className="text-sm font-semibold tabular-nums"
                              style={{ color: 'var(--text-main)' }}
                            >
                              {t('activity.last_session_prefix')}{' '}
                              {formatActiveDuration(
                                item.lastSessionDurationSeconds,
                                durationLabels,
                              )}
                            </span>
                            {item.lastSessionEndedAt && (
                              <span className="text-xs text-muted tabular-nums">
                                {t('activity.ended_at')}:{' '}
                                {formatDate(item.lastSessionEndedAt)}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted">
                            {t('activity.no_sessions_yet')}
                          </span>
                        )}
                      </td>

                      {/* Active Today Total */}
                      <td>
                        <span
                          className="text-sm font-semibold tabular-nums"
                          style={{
                            color:
                              liveTodaySecs > 0
                                ? 'var(--primary)'
                                : 'var(--text-muted)',
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
                          className="btn-ghost"
                          onClick={() => handleOpenHistory(item)}
                          style={{ fontSize: '0.8rem', padding: '0.35rem 0.65rem' }}
                        >
                          <History size={14} />
                          {t('activity.view_history')}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {data && data.total > 0 && (
          <div
            className="flex flex-wrap items-center justify-between gap-3"
            style={{
              padding: '0.75rem 1rem',
              borderTop: '1px solid var(--border-subtle)',
              background: 'var(--bg-subtle)',
            }}
          >
            <span className="text-xs text-muted tabular-nums">
              Showing {(data.page - 1) * data.limit + 1}–
              {Math.min(data.page * data.limit, data.total)} of {data.total} users
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn-secondary"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
              >
                Previous
              </button>
              <span className="text-xs font-medium tabular-nums">
                Page {page} / {totalPages}
              </span>
              <button
                type="button"
                className="btn-secondary"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
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
                  className="text-lg font-bold"
                  style={{ color: 'var(--navy)' }}
                >
                  {t('activity.history_title')} — {selectedUser.fullName}
                </h2>
                <p className="text-xs text-muted" style={{ marginTop: '2px' }}>
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

            <div className="modal-body space-y-4">
              {detailLoading ? (
                <div
                  style={{
                    padding: '2rem',
                    textAlign: 'center',
                    color: 'var(--text-muted)',
                    fontSize: '0.875rem',
                  }}
                >
                  Loading session history...
                </div>
              ) : detailError ? (
                <div
                  style={{
                    padding: '0.875rem',
                    borderRadius: 'var(--radius-sm)',
                    background: '#fef2f2',
                    color: '#b91c1c',
                    fontSize: '0.875rem',
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
                      gap: '0.75rem',
                      padding: '0.75rem',
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--bg-subtle)',
                      border: '1px solid var(--border-main)',
                    }}
                  >
                    <div>
                      <div className="text-xs text-muted">
                        {t('activity.col_status')}
                      </div>
                      <div className="text-sm font-semibold">
                        {detail.account.status === 'online'
                          ? t('activity.status_online')
                          : detail.account.status === 'offline'
                            ? t('activity.status_offline')
                            : t('activity.status_never')}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted">
                        {t('activity.col_last_active')}
                      </div>
                      <div className="text-sm font-semibold tabular-nums">
                        {detail.account.lastActiveAt
                          ? formatDate(detail.account.lastActiveAt)
                          : '-'}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted">
                        {t('activity.col_today_total')}
                      </div>
                      <div className="text-sm font-semibold tabular-nums">
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
                      className="text-sm text-muted"
                      style={{ textAlign: 'center', padding: '1.5rem 0' }}
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
                              <td className="text-xs tabular-nums">
                                {formatDate(sess.startedAt)}
                              </td>
                              <td className="text-xs tabular-nums">
                                {sess.isOnline ? (
                                  <span
                                    className="font-semibold"
                                    style={{ color: '#15803d' }}
                                  >
                                    {t('activity.status_online')}
                                  </span>
                                ) : (
                                  formatDate(
                                    sess.effectiveEndedAt ?? sess.lastActiveAt,
                                  )
                                )}
                              </td>
                              <td className="text-sm font-semibold tabular-nums">
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
    </div>
  );
}
