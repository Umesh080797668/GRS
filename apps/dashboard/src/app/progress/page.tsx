'use client';

import { useEffect, useRef, useState } from 'react';
import Shell from '../../components/Shell';
import KPICard from '../../components/KPICard';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import {
  getAreaScopeLocks,
  loadScopedAreaLists,
  resolveProgressAreaQuery,
} from '../../lib/area-scope';
import { formatDate } from '../../lib/utils';
import {
  Home,
  CheckCircle,
  Clock,
  TrendingUp,
  Users,
  Activity,
  RefreshCw,
  AlertTriangle,
  Layers,
  HeartHandshake,
  ShieldAlert,
  Accessibility,
} from 'lucide-react';

export default function ProgressPage() {
  const { t } = useLanguage();
  const { user, isLoading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [scopeReady, setScopeReady] = useState(false);

  // Area filtering
  const [districts, setDistricts] = useState<any[]>([]);
  const [dsDivisions, setDsDivisions] = useState<any[]>([]);
  const [gnDivisions, setGnDivisions] = useState<any[]>([]);
  const [selectedDistrict, setSelectedDistrict] = useState<string>('');
  const [selectedDs, setSelectedDs] = useState<string>('');
  const [selectedGn, setSelectedGn] = useState<string>('');
  const fetchSeqRef = useRef(0);

  const areaLocks = getAreaScopeLocks(user?.role);

  useEffect(() => {
    if (authLoading || !user) return;
    let cancelled = false;
    setScopeReady(false);

    (async () => {
      try {
        const res = await loadScopedAreaLists(api, user);
        if (cancelled) return;
        setDistricts(res.districts);
        setDsDivisions(res.dsDivisions);
        setGnDivisions(res.gnDivisions);
        setSelectedDistrict(res.selectedDistrict);
        setSelectedDs(res.selectedDs);
        setSelectedGn(res.selectedGn);
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled) {
          setScopeReady(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, user?.id, user?.role, user?.districtId, user?.dsId, user?.gnId]);

  async function handleDistrictChange(distId: string) {
    if (areaLocks.isDistrictLocked) return;
    setSelectedDistrict(distId);
    setSelectedDs('');
    setSelectedGn('');
    setDsDivisions([]);
    setGnDivisions([]);
    if (distId) {
      try {
        const dsList = await api.getDsDivisions(distId);
        setDsDivisions(dsList);
      } catch (err) {
        console.error(err);
      }
    }
  }

  async function handleDsChange(dsId: string) {
    if (areaLocks.isDsLocked) return;
    setSelectedDs(dsId);
    setSelectedGn('');
    setGnDivisions([]);
    if (dsId) {
      try {
        const gnList = await api.getGnDivisions(dsId);
        setGnDivisions(gnList);
      } catch (err) {
        console.error(err);
      }
    }
  }

  const fetchStats = async () => {
    if (authLoading || !user || !scopeReady) return;
    const seq = ++fetchSeqRef.current;
    try {
      const { areaType, areaId } = resolveProgressAreaQuery(
        user.role,
        selectedDistrict,
        selectedDs,
        selectedGn,
      );

      const res = await api.getProgressStats(areaType, areaId);
      if (seq !== fetchSeqRef.current) return;
      setStats(res);
      setError(null);
    } catch (err: any) {
      if (seq !== fetchSeqRef.current) return;
      setError(err.message || 'Failed to load progress metrics.');
    } finally {
      if (seq === fetchSeqRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  };

  useEffect(() => {
    if (!authLoading && user && scopeReady) {
      fetchStats();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user?.id, user?.role, scopeReady, selectedDistrict, selectedDs, selectedGn]);

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
            {t('progress.title')}
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--slate-500)', marginTop: '4px' }}>
            {t('progress.refreshed_at')}:{' '}
            <strong style={{ color: 'var(--slate-700)', fontWeight: 600 }}>
              {formatDate(refreshedAt)}
            </strong>
          </p>
        </div>

        <button
          onClick={handleManualRefresh}
          disabled={refreshing}
          className="btn-secondary"
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          <span>{t('progress.refresh_btn')}</span>
        </button>
      </div>

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
          <AlertTriangle size={18} style={{ flexShrink: 0 }} />
          <span>{error}</span>
        </div>
      )}

      {/* Scope Selector Bar */}
      <div
        style={{
          background: '#ffffff',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          padding: '1rem 1.25rem',
          marginBottom: '1.5rem',
          display: 'flex',
          gap: '12px',
          flexWrap: 'wrap',
          alignItems: 'center',
          boxShadow: 'var(--shadow-xs)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, color: 'var(--slate-700)' }}>
          <Layers size={15} style={{ color: 'var(--primary)' }} />
          <span>Select Scope:</span>
        </div>

        <select
          className="select-field"
          style={{ width: 'auto', minWidth: '180px', flex: '1 1 180px' }}
          value={selectedDistrict}
          onChange={(e) => handleDistrictChange(e.target.value)}
          disabled={areaLocks.isDistrictLocked}
        >
          <option value="">{areaLocks.isDistrictLocked ? 'Assigned District' : 'National / All Districts'}</option>
          {districts.map((d) => (
            <option key={d.id} value={d.id}>
              {d.nameEn || d.name}
            </option>
          ))}
        </select>

        <select
          className="select-field"
          style={{ width: 'auto', minWidth: '180px', flex: '1 1 180px' }}
          value={selectedDs}
          onChange={(e) => handleDsChange(e.target.value)}
          disabled={!selectedDistrict || dsDivisions.length === 0 || areaLocks.isDsLocked}
        >
          <option value="">{areaLocks.isDsLocked ? 'Assigned DS Division' : 'All DS Divisions'}</option>
          {dsDivisions.map((ds) => (
            <option key={ds.id} value={ds.id}>
              {ds.nameEn || ds.name}
            </option>
          ))}
        </select>

        <select
          className="select-field"
          style={{ width: 'auto', minWidth: '180px', flex: '1 1 180px' }}
          value={selectedGn}
          onChange={(e) => setSelectedGn(e.target.value)}
          disabled={!selectedDs || gnDivisions.length === 0 || areaLocks.isGnLocked}
        >
          <option value="">{areaLocks.isGnLocked ? 'Assigned GN Division' : 'All GN Divisions'}</option>
          {gnDivisions.map((gn) => (
            <option key={gn.id} value={gn.id}>
              {gn.nameEn || gn.name} ({gn.gnCode || gn.gnNumber})
            </option>
          ))}
        </select>
      </div>

      {/* Sync Health Banner (M5.7) */}
      <div id="sync-health" style={{ marginBottom: '1.5rem' }}>
        {dirtyTeamsCount > 0 ? (
          <div
            style={{
              background: 'var(--warning-bg)',
              border: '1px solid var(--warning-border)',
              borderRadius: 'var(--radius-md)',
              padding: '14px 18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1rem',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  background: '#fef3c7',
                  padding: '8px',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--warning-text)',
                  display: 'flex',
                }}
              >
                <Activity size={20} />
              </div>
              <div>
                <h4 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--warning-text)', margin: 0 }}>
                  {t('sync_health.dirty_teams')}: {dirtyTeamsCount} Teams Pending Recomputation
                </h4>
                <p style={{ fontSize: '12px', color: 'var(--warning-text)', margin: '2px 0 0 0', opacity: 0.9 }}>
                  Field enumerations are pending rollup in the current background cycle (stats_dirty_at). Numbers refresh automatically within 5 minutes.
                </p>
              </div>
            </div>
            <span className="badge badge-warning">
              Recalculating
            </span>
          </div>
        ) : (
          <div
            style={{
              background: 'var(--success-bg)',
              border: '1px solid var(--success-border)',
              borderRadius: 'var(--radius-md)',
              padding: '10px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            <CheckCircle size={17} style={{ color: 'var(--success)' }} />
            <span style={{ fontSize: '13px', color: 'var(--success-text)', fontWeight: 600 }}>
              {t('sync_health.all_clean')}
            </span>
          </div>
        )}
      </div>

      {/* Primary KPI Grid (M5.6) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        <KPICard
          title={t('progress.houses_assigned')}
          value={summary.housesAssigned.toLocaleString()}
          subtitle="Target campaign households"
          icon={<Home size={20} />}
          colorScheme="blue"
        />
        <KPICard
          title={t('progress.houses_started')}
          value={summary.housesStarted.toLocaleString()}
          subtitle="In-progress enumerations"
          icon={<Clock size={20} />}
          colorScheme="amber"
        />
        <KPICard
          title={t('progress.houses_done')}
          value={summary.housesDone.toLocaleString()}
          subtitle="Fully finalized surveys"
          icon={<CheckCircle size={20} />}
          colorScheme="emerald"
        />
        <KPICard
          title={t('progress.completion_rate')}
          value={`${Number(summary.completionRate || 0).toFixed(1)}%`}
          subtitle="Completed vs Assigned ratio"
          progressPercent={Number(summary.completionRate || 0)}
          icon={<TrendingUp size={20} />}
          colorScheme="blue"
        />
        <KPICard
          title={t('progress.clients_surveyed')}
          value={summary.clientsCount.toLocaleString()}
          subtitle="Total citizens registered"
          icon={<Users size={20} />}
          colorScheme="emerald"
        />
      </div>

      {/* Welfare & Beneficiary Breakdown Indicators */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
          gap: '1rem',
          marginBottom: '1.75rem',
        }}
      >
        <div className="panel" style={{ padding: '1rem 1.125rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12px', color: 'var(--slate-500)', fontWeight: 500 }}>
              {t('progress.epf_etf')}
            </span>
            <ShieldAlert size={16} style={{ color: 'var(--primary)', opacity: 0.8 }} />
          </div>
          <div className="tabular-nums" style={{ fontSize: '22px', fontWeight: 700, color: 'var(--slate-900)', marginTop: '6px' }}>
            {((summary.epfCount || 0) + (summary.etfCount || 0)).toLocaleString()}
          </div>
        </div>

        <div className="panel" style={{ padding: '1rem 1.125rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12px', color: 'var(--slate-500)', fontWeight: 500 }}>
              {t('progress.aswesuma')}
            </span>
            <HeartHandshake size={16} style={{ color: 'var(--success)', opacity: 0.8 }} />
          </div>
          <div className="tabular-nums" style={{ fontSize: '22px', fontWeight: 700, color: 'var(--slate-900)', marginTop: '6px' }}>
            {(summary.aswesumaCount || 0).toLocaleString()}
          </div>
        </div>

        <div className="panel" style={{ padding: '1rem 1.125rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12px', color: 'var(--slate-500)', fontWeight: 500 }}>
              {t('progress.samurdhi')}
            </span>
            <HeartHandshake size={16} style={{ color: 'var(--warning)', opacity: 0.8 }} />
          </div>
          <div className="tabular-nums" style={{ fontSize: '22px', fontWeight: 700, color: 'var(--slate-900)', marginTop: '6px' }}>
            {(summary.samurdhiCount || 0).toLocaleString()}
          </div>
        </div>

        <div className="panel" style={{ padding: '1rem 1.125rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12px', color: 'var(--slate-500)', fontWeight: 500 }}>
              {t('progress.special_needs')}
            </span>
            <Accessibility size={16} style={{ color: '#7c3aed', opacity: 0.8 }} />
          </div>
          <div className="tabular-nums" style={{ fontSize: '22px', fontWeight: 700, color: 'var(--slate-900)', marginTop: '6px' }}>
            {(summary.specialNeedsCount || 0).toLocaleString()}
          </div>
        </div>
      </div>

      {/* Regional Progress Breakdown Table (M5.6) */}
      <div className="panel" style={{ padding: '1.25rem 1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--slate-900)', margin: 0 }}>
            {t('progress.breakdown_title')}
          </h2>
          <span style={{ fontSize: '12px', color: 'var(--slate-500)' }}>
            {breakdown.length} region(s) reported
          </span>
        </div>

        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Administrative Area / Sub-Division</th>
                <th className="numeric">Assigned Houses</th>
                <th className="numeric">Started</th>
                <th className="numeric">Completed</th>
                <th style={{ minWidth: '150px' }}>Completion Rate</th>
                <th className="numeric">Surveyed Persons</th>
              </tr>
            </thead>
            <tbody>
              {breakdown.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--slate-400)', padding: '2.5rem 1rem' }}>
                    {loading ? 'Loading live metrics from database...' : 'No regional breakdown metrics recorded yet.'}
                  </td>
                </tr>
              ) : (
                breakdown.map((row: any, idx: number) => {
                  const rate = Number(row.completionRate || 0);
                  return (
                    <tr key={idx}>
                      <td style={{ fontWeight: 600, color: 'var(--slate-900)' }}>
                        {row.name}
                        {row.nameSi && (
                          <span style={{ fontSize: '12px', color: 'var(--slate-500)', marginLeft: '6px', fontWeight: 400 }}>
                            ({row.nameSi})
                          </span>
                        )}
                      </td>
                      <td className="numeric">{(row.housesAssigned || 0).toLocaleString()}</td>
                      <td className="numeric">{(row.housesStarted || 0).toLocaleString()}</td>
                      <td className="numeric">
                        <span className="badge badge-success">
                          {(row.housesDone || 0).toLocaleString()}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div
                            style={{
                              flex: 1,
                              maxWidth: '90px',
                              height: '5px',
                              background: 'var(--slate-100)',
                              borderRadius: 'var(--radius-full)',
                              overflow: 'hidden',
                            }}
                          >
                            <div
                              style={{
                                width: `${Math.min(rate, 100)}%`,
                                height: '100%',
                                background: rate >= 100 ? 'var(--success)' : 'var(--primary)',
                                borderRadius: 'var(--radius-full)',
                              }}
                            />
                          </div>
                          <span className="tabular-nums" style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--slate-700)' }}>
                            {rate.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                      <td className="numeric" style={{ fontWeight: 600 }}>
                        {(row.clientsCount || 0).toLocaleString()}
                      </td>
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
