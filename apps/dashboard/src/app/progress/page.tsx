'use client';

import { useEffect, useState } from 'react';
import Shell from '../../components/Shell';
import KPICard from '../../components/KPICard';
import { useLanguage } from '../../context/LanguageContext';
import { api } from '../../lib/api';
import { formatDate } from '../../lib/utils';
import {
  Home,
  CheckCircle,
  Clock,
  TrendingUp,
  Users,
  Activity,
  RefreshCw,
  AlertTriangle
} from 'lucide-react';

export default function ProgressPage() {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = async () => {
    try {
      const res = await api.getProgressStats();
      setStats(res);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load progress metrics.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const handleManualRefresh = () => {
    setRefreshing(true);
    fetchStats();
  };

  const summary = stats?.summary || {
    housesAssigned: 0,
    housesStarted: 0,
    housesDone: 0,
    completionRate: 0,
    clientsCount: 0,
    epfCount: 0,
    etfCount: 0,
    aswesumaCount: 0,
    samurdhiCount: 0,
    specialNeedsCount: 0,
  };

  const breakdown: any[] = stats?.breakdown || [];
  const dirtyTeamsCount: number = stats?.dirtyTeamsCount ?? 0;
  const refreshedAt: string = stats?.refreshedAt || '';

  return (
    <Shell>
      {/* Top Header / Actions */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em', margin: 0 }}>
            {t('progress.title')}
          </h2>
          <p style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
            {t('progress.refreshed_at')}: <strong>{formatDate(refreshedAt)}</strong>
          </p>
        </div>

        <button
          onClick={handleManualRefresh}
          disabled={refreshing}
          className="btn-secondary"
        >
          <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
          <span>{t('progress.refresh_btn')}</span>
        </button>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px 16px', color: '#dc2626', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <AlertTriangle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* Sync Health Alert Banner (M5.7) */}
      <div id="sync-health" style={{ marginBottom: '1.75rem' }}>
        {dirtyTeamsCount > 0 ? (
          <div
            style={{
              background: '#fffbeb',
              border: '1px solid #fde68a',
              borderRadius: '12px',
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{ background: '#fef3c7', padding: '10px', borderRadius: '10px', color: '#d97706' }}>
                <Activity size={24} />
              </div>
              <div>
                <h4 style={{ fontSize: '15px', fontWeight: 700, color: '#92400e', margin: 0 }}>
                  {t('sync_health.dirty_teams')}: <span style={{ color: '#b45309' }}>{dirtyTeamsCount} Teams</span>
                </h4>
                <p style={{ fontSize: '12px', color: '#a16207', margin: '4px 0 0 0' }}>
                  Field agents have unsynced survey submissions queued offline. Ensure teams reconnect before final aggregation.
                </p>
              </div>
            </div>
            <span className="badge badge-warning" style={{ fontSize: '12px', padding: '6px 12px' }}>
              Attention Needed
            </span>
          </div>
        ) : (
          <div
            style={{
              background: '#ecfdf5',
              border: '1px solid #a7f3d0',
              borderRadius: '12px',
              padding: '14px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <div style={{ color: '#059669' }}>
              <CheckCircle size={20} />
            </div>
            <div style={{ fontSize: '13px', color: '#065f46', fontWeight: 600 }}>
              {t('sync_health.all_clean')}
            </div>
          </div>
        )}
      </div>

      {/* KPI Cards Grid (M5.6) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <KPICard
          title={t('progress.houses_assigned')}
          value={summary.housesAssigned.toLocaleString()}
          subtitle="Target campaign households"
          icon={<Home size={22} />}
          colorScheme="blue"
        />
        <KPICard
          title={t('progress.houses_started')}
          value={summary.housesStarted.toLocaleString()}
          subtitle="In-progress enumerations"
          icon={<Clock size={22} />}
          colorScheme="amber"
        />
        <KPICard
          title={t('progress.houses_done')}
          value={summary.housesDone.toLocaleString()}
          subtitle="Fully finalized surveys"
          icon={<CheckCircle size={22} />}
          colorScheme="emerald"
        />
        <KPICard
          title={t('progress.completion_rate')}
          value={`${Number(summary.completionRate || 0).toFixed(1)}%`}
          subtitle="Completed vs Assigned ratio"
          progressPercent={Number(summary.completionRate || 0)}
          icon={<TrendingUp size={22} />}
          colorScheme="purple"
        />
        <KPICard
          title={t('progress.clients_surveyed')}
          value={summary.clientsCount.toLocaleString()}
          subtitle="Total citizens registered"
          icon={<Users size={22} />}
          colorScheme="blue"
        />
      </div>

      {/* Beneficiary Breakdown Indicators */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <div className="glass-panel" style={{ padding: '1rem', borderRadius: '10px' }}>
          <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
            {t('progress.epf_etf')}
          </div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: '#1e3a8a', marginTop: '4px' }}>
            {((summary.epfCount || 0) + (summary.etfCount || 0)).toLocaleString()}
          </div>
        </div>
        <div className="glass-panel" style={{ padding: '1rem', borderRadius: '10px' }}>
          <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
            {t('progress.aswesuma')}
          </div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: '#059669', marginTop: '4px' }}>
            {(summary.aswesumaCount || 0).toLocaleString()}
          </div>
        </div>
        <div className="glass-panel" style={{ padding: '1rem', borderRadius: '10px' }}>
          <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
            {t('progress.samurdhi')}
          </div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: '#d97706', marginTop: '4px' }}>
            {(summary.samurdhiCount || 0).toLocaleString()}
          </div>
        </div>
        <div className="glass-panel" style={{ padding: '1rem', borderRadius: '10px' }}>
          <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
            {t('progress.special_needs')}
          </div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: '#7c3aed', marginTop: '4px' }}>
            {(summary.specialNeedsCount || 0).toLocaleString()}
          </div>
        </div>
      </div>

      {/* Regional Progress Breakdown Table (M5.6) */}
      <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: '14px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', marginBottom: '1rem' }}>
          {t('progress.breakdown_title')}
        </h3>

        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Administrative Area / Sub-Division</th>
                <th>Assigned Houses</th>
                <th>Started</th>
                <th>Completed</th>
                <th>Completion Rate</th>
                <th>Surveyed Persons</th>
              </tr>
            </thead>
            <tbody>
              {breakdown.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>
                    {loading ? 'Loading live metrics from database...' : 'No regional breakdown metrics recorded yet.'}
                  </td>
                </tr>
              ) : (
                breakdown.map((row: any, idx: number) => {
                  const rate = Number(row.completionRate || 0);
                  return (
                    <tr key={idx}>
                      <td style={{ fontWeight: 600, color: '#0f172a' }}>
                        {row.name}
                        {row.nameSi && <span style={{ fontSize: '11px', color: '#64748b', marginLeft: '6px' }}>({row.nameSi})</span>}
                      </td>
                      <td>{(row.housesAssigned || 0).toLocaleString()}</td>
                      <td>{(row.housesStarted || 0).toLocaleString()}</td>
                      <td>
                        <span className="badge badge-success">
                          {(row.housesDone || 0).toLocaleString()}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ width: '80px', height: '6px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                            <div style={{ width: `${Math.min(rate, 100)}%`, height: '100%', background: '#2563eb' }} />
                          </div>
                          <span style={{ fontSize: '12px', fontWeight: 600 }}>{rate.toFixed(1)}%</span>
                        </div>
                      </td>
                      <td style={{ fontWeight: 600 }}>{(row.clientsCount || 0).toLocaleString()}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Shell>
  );
}
