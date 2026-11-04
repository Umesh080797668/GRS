'use client';

import { useEffect, useState } from 'react';
import Shell from '../../components/Shell';
import KPICard from '../../components/KPICard';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
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
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Area filtering
  const [districts, setDistricts] = useState<any[]>([]);
  const [dsDivisions, setDsDivisions] = useState<any[]>([]);
  const [gnDivisions, setGnDivisions] = useState<any[]>([]);
  const [selectedDistrict, setSelectedDistrict] = useState<string>('');
  const [selectedDs, setSelectedDs] = useState<string>('');
  const [selectedGn, setSelectedGn] = useState<string>('');

  useEffect(() => {
    loadDistricts();
  }, []);

  async function loadDistricts() {
    try {
      const data = await api.getDistricts();
      setDistricts(data);
      if (user?.role === 'cdc_secretary') {
        if (user.districtId) {
          setSelectedDistrict(user.districtId);
          const dsList = await api.getDsDivisions(user.districtId);
          setDsDivisions(dsList);
          if (user.dsId) {
            setSelectedDs(user.dsId);
            const gnList = await api.getGnDivisions(user.dsId);
            setGnDivisions(gnList);
            if (user.gnId) {
              setSelectedGn(user.gnId);
            }
          }
        }
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function handleDistrictChange(distId: string) {
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
    try {
      let areaType: string | undefined;
      let areaId: string | undefined;

      if (selectedGn) {
        areaType = 'gn';
        areaId = selectedGn;
      } else if (selectedDs) {
        areaType = 'ds';
        areaId = selectedDs;
      } else if (selectedDistrict) {
        areaType = 'district';
        areaId = selectedDistrict;
      }

      const res = await api.getProgressStats(areaType, areaId);
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
  }, [selectedDistrict, selectedDs, selectedGn]);

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

      {/* Area Scope Selector */}
      <div className="glass-panel" style={{ padding: '1rem', borderRadius: '12px', marginBottom: '1.5rem', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>
          Select Scope:
        </div>
        <select
          className="input-field"
          style={{ width: '180px' }}
          value={selectedDistrict}
          onChange={(e) => handleDistrictChange(e.target.value)}
          disabled={user?.role === 'cdc_secretary'}
        >
          <option value="">{user?.role === 'cdc_secretary' ? 'Assigned District' : 'National / All Districts'}</option>
          {districts.map((d) => (
            <option key={d.id} value={d.id}>
              {d.nameEn || d.name}
            </option>
          ))}
        </select>

        <select
          className="input-field"
          style={{ width: '180px' }}
          value={selectedDs}
          onChange={(e) => handleDsChange(e.target.value)}
          disabled={!selectedDistrict || dsDivisions.length === 0 || user?.role === 'cdc_secretary'}
        >
          <option value="">{user?.role === 'cdc_secretary' ? 'Assigned DS Division' : 'All DS Divisions'}</option>
          {dsDivisions.map((ds) => (
            <option key={ds.id} value={ds.id}>
              {ds.nameEn || ds.name}
            </option>
          ))}
        </select>

        <select
          className="input-field"
          style={{ width: '180px' }}
          value={selectedGn}
          onChange={(e) => setSelectedGn(e.target.value)}
          disabled={!selectedDs || gnDivisions.length === 0 || user?.role === 'cdc_secretary'}
        >
          <option value="">{user?.role === 'cdc_secretary' ? 'Assigned GN Division' : 'All GN Divisions'}</option>
          {gnDivisions.map((gn) => (
            <option key={gn.id} value={gn.id}>
              {gn.nameEn || gn.name} ({gn.gnCode || gn.gnNumber})
            </option>
          ))}
        </select>
      </div>

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
                  Team progress statistics are pending recomputation in the current background cycle (stats_dirty_at). Rolled-up metrics will update automatically within 5 minutes.
                </p>
              </div>
            </div>
            <span className="badge badge-warning" style={{ fontSize: '12px', padding: '6px 12px' }}>
              Stats Recalculating
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
