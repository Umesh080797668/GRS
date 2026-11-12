'use client';

import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  CopyCheck,
  Info,
  Loader2,
  RefreshCw,
  ShieldCheck,
  X,
  XCircle,
} from 'lucide-react';
import { Shell } from '../../components/Shell';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { api } from '../../lib/api';

interface DuplicateClientSummary {
  id: string;
  name: string;
  age: number;
  gender: string;
  phoneRaw?: string | null;
  phoneE164?: string | null;
  whatsapp?: string | null;
  houseId?: string | null;
  houseNo?: string | null;
  address?: string | null;
  gnId: string;
  gnName?: string | null;
  dsName?: string | null;
  districtName?: string | null;
  teamId?: string | null;
  teamNo?: string | null;
  duplicateOf?: string | null;
  createdAt?: string | null;
}

interface DuplicateCandidateItem {
  id: string;
  clientA: string;
  clientB: string;
  score: number;
  classification: 'probable' | 'possible';
  reasons?: {
    factors?: Array<string | { key?: string; label?: string; score?: number }>;
    nameSimilarity?: number;
    phoneMatch?: boolean;
    sameHousehold?: boolean;
    sameGn?: boolean;
    ageDiff?: number;
    genderMismatch?: boolean;
    antiFalsePositiveCapped?: boolean;
    dismissReason?: string;
    confirmReason?: string;
  };
  status: 'open' | 'confirmed' | 'dismissed';
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
  clientARecord?: DuplicateClientSummary | null;
  clientBRecord?: DuplicateClientSummary | null;
}

export default function DuplicatesPage() {
  const { user } = useAuth();
  const { t } = useLanguage();

  const [items, setItems] = useState<DuplicateCandidateItem[]>([]);
  const [openCount, setOpenCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ type: 'success' | 'info'; message: string } | null>(null);

  // Filters & keyset pagination
  const [statusFilter, setStatusFilter] = useState<'open' | 'confirmed' | 'dismissed' | 'all'>('open');
  const [classificationFilter, setClassificationFilter] = useState<'all' | 'probable' | 'possible'>('all');
  const [cursorHistory, setCursorHistory] = useState<string[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  // Geographic Cascade Filters
  const [districts, setDistricts] = useState<any[]>([]);
  const [dsDivisions, setDsDivisions] = useState<any[]>([]);
  const [gnDivisions, setGnDivisions] = useState<any[]>([]);
  const [selectedDistrict, setSelectedDistrict] = useState<string>('');
  const [selectedDs, setSelectedDs] = useState<string>('');
  const [selectedGn, setSelectedGn] = useState<string>('');

  // Per-pair review state
  const [selectedCanonical, setSelectedCanonical] = useState<Record<string, string>>({});
  const [reasonNotes, setReasonNotes] = useState<Record<string, string>>({});
  const [actingId, setActingId] = useState<string | null>(null);

  const canAct = user?.role === 'cdc_secretary' || user?.role === 'super_admin';

  useEffect(() => {
    loadDistricts();
  }, [user?.role, user?.districtId, user?.dsId, user?.gnId]);

  async function loadDistricts() {
    try {
      const data = await api.getDistricts();
      setDistricts(data);
      if (user?.role === 'cdc_secretary' && user.districtId) {
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
    } catch {
      // Geographic dropdown load failures fall back cleanly to open options.
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
      } catch {
        // Ignore dropdown error
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
      } catch {
        // Ignore dropdown error
      }
    }
  }

  useEffect(() => {
    setCursorHistory([]);
    loadDuplicates();
  }, [statusFilter, classificationFilter, selectedDistrict, selectedDs, selectedGn]);

  async function loadDuplicates(cursor?: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getDuplicates({
        status: statusFilter,
        classification: classificationFilter,
        districtId: selectedDistrict || undefined,
        dsId: selectedDs || undefined,
        gnId: selectedGn || undefined,
        cursor: cursor || undefined,
        limit: 20,
      });

      const list: DuplicateCandidateItem[] = Array.isArray(res?.items) ? res.items : [];
      setItems(list);
      setOpenCount(typeof res?.openCount === 'number' ? res.openCount : 0);
      setNextCursor(res?.nextCursor || null);

      setSelectedCanonical((prev) => {
        const next = { ...prev };
        for (const item of list) {
          if (!next[item.id]) {
            const aCreated = item.clientARecord?.createdAt ? Date.parse(item.clientARecord.createdAt) : 0;
            const bCreated = item.clientBRecord?.createdAt ? Date.parse(item.clientBRecord.createdAt) : 0;
            if (bCreated && aCreated && bCreated < aCreated) {
              next[item.id] = item.clientB;
            } else {
              next[item.id] = item.clientA;
            }
          }
        }
        return next;
      });
    } catch (err: any) {
      setError(err?.message || 'Failed to load duplicate candidates.');
    } finally {
      setLoading(false);
    }
  }

  function handleNextPage() {
    if (!nextCursor) return;
    setCursorHistory((prev) => [...prev, nextCursor]);
    loadDuplicates(nextCursor);
  }

  function handlePrevPage() {
    if (cursorHistory.length === 0) return;
    const history = [...cursorHistory];
    history.pop();
    const prevCursor = history.length > 0 ? history[history.length - 1] : undefined;
    setCursorHistory(history);
    loadDuplicates(prevCursor);
  }

  async function handleConfirm(item: DuplicateCandidateItem) {
    if (!canAct || actingId) return;
    setActingId(item.id);
    setError(null);
    try {
      const canonicalClientId = selectedCanonical[item.id] || item.clientA;
      const reason = reasonNotes[item.id]?.trim() || undefined;
      await api.confirmDuplicate(item.id, { canonicalClientId, reason });
      setBanner({ type: 'success', message: t('duplicates.confirmed_notice') });
      window.dispatchEvent(new Event('grs:duplicates-updated'));
      const activeCursor = cursorHistory.length > 0 ? cursorHistory[cursorHistory.length - 1] : undefined;
      await loadDuplicates(activeCursor);
    } catch (err: any) {
      setError(err?.message || 'Failed to confirm duplicate.');
    } finally {
      setActingId(null);
    }
  }

  async function handleDismiss(item: DuplicateCandidateItem) {
    if (!canAct || actingId) return;
    setActingId(item.id);
    setError(null);
    try {
      const reason = reasonNotes[item.id]?.trim() || undefined;
      await api.dismissDuplicate(item.id, { reason });
      setBanner({ type: 'info', message: t('duplicates.dismissed_notice') });
      window.dispatchEvent(new Event('grs:duplicates-updated'));
      const activeCursor = cursorHistory.length > 0 ? cursorHistory[cursorHistory.length - 1] : undefined;
      await loadDuplicates(activeCursor);
    } catch (err: any) {
      setError(err?.message || 'Failed to dismiss candidate.');
    } finally {
      setActingId(null);
    }
  }

  function extractFactorKey(factor: unknown): string {
    if (typeof factor === 'string') return factor;
    if (factor && typeof factor === 'object') {
      const f = factor as { key?: unknown; label?: unknown };
      if (typeof f.key === 'string') return f.key;
      if (typeof f.label === 'string') return f.label;
    }
    return factor == null ? '' : String(factor);
  }

  function formatFactor(factor: unknown): string {
    const raw = extractFactorKey(factor);
    if (!raw) return '';
    const key = `duplicates.factor.${raw}`;
    const translated = t(key);
    return translated === key ? raw.replace(/_/g, ' ') : translated;
  }

  function formatDate(iso?: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  function renderClientCard(
    item: DuplicateCandidateItem,
    client: DuplicateClientSummary | null | undefined,
    fallbackId: string,
    label: string,
  ) {
    const id = client?.id || fallbackId;
    const isCanonical = (selectedCanonical[item.id] || item.clientA) === id;
    const isConfirmedDuplicate = Boolean(client?.duplicateOf);
    const isInteractive = item.status === 'open' && canAct;

    return (
      <div
        key={id}
        onClick={() => {
          if (isInteractive) {
            setSelectedCanonical((prev) => ({ ...prev, [item.id]: id }));
          }
        }}
        style={{
          border: isCanonical
            ? '2px solid #10b981'
            : isInteractive
              ? '1px solid #f59e0b'
              : '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-sm)',
          padding: '1rem',
          background: isCanonical ? 'rgba(16, 185, 129, 0.04)' : '#ffffff',
          cursor: isInteractive ? 'pointer' : 'default',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.65rem',
          transition: 'border-color 0.15s ease, background-color 0.15s ease',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--slate-500)' }}>
            {label}
          </span>

          {isConfirmedDuplicate ? (
            <span
              className="badge"
              style={{
                background: '#fef3c7',
                color: '#92400e',
                border: '1px solid #fcd34d',
                fontSize: '11px',
              }}
            >
              {t('duplicates.confirmed_badge')}
            </span>
          ) : isInteractive ? (
            <span
              className="badge"
              style={{
                background: isCanonical ? '#d1fae5' : '#fef3c7',
                color: isCanonical ? '#065f46' : '#92400e',
                border: isCanonical ? '1px solid #6ee7b7' : '1px solid #fcd34d',
                fontSize: '11px',
              }}
            >
              {isCanonical ? t('duplicates.selected_canonical') : t('duplicates.marked_duplicate')}
            </span>
          ) : null}
        </div>

        <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--slate-900)' }}>
          {client?.name || id}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12.5px' }}>
          <div>
            <span style={{ display: 'block', fontSize: '11px', color: 'var(--slate-500)' }}>{t('duplicates.age_gender')}</span>
            <span style={{ color: 'var(--slate-800)', fontWeight: 500 }}>
              {client ? `${client.age} • ${client.gender}` : '—'}
            </span>
          </div>
          <div>
            <span style={{ display: 'block', fontSize: '11px', color: 'var(--slate-500)' }}>{t('duplicates.house')}</span>
            <span style={{ color: 'var(--slate-800)', fontFamily: 'monospace', fontWeight: 600 }}>
              {client?.houseNo ? `#${client.houseNo}` : '—'}
            </span>
          </div>
          <div>
            <span style={{ display: 'block', fontSize: '11px', color: 'var(--slate-500)' }}>{t('duplicates.phone')}</span>
            <span style={{ color: 'var(--slate-800)', fontFamily: 'monospace' }}>
              {client?.phoneE164 || client?.phoneRaw || '—'}
            </span>
          </div>
          <div>
            <span style={{ display: 'block', fontSize: '11px', color: 'var(--slate-500)' }}>{t('duplicates.whatsapp')}</span>
            <span style={{ color: 'var(--slate-800)', fontFamily: 'monospace' }}>
              {client?.whatsapp || '—'}
            </span>
          </div>
          <div>
            <span style={{ display: 'block', fontSize: '11px', color: 'var(--slate-500)' }}>{t('duplicates.gn')}</span>
            <span style={{ color: 'var(--slate-800)' }}>
              {client?.gnName || '—'}
            </span>
          </div>
          <div>
            <span style={{ display: 'block', fontSize: '11px', color: 'var(--slate-500)' }}>{t('duplicates.team')}</span>
            <span style={{ color: 'var(--slate-800)' }}>
              {client?.teamNo ? `${t('duplicates.team')} ${client.teamNo}` : '—'}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '6px', borderTop: '1px solid var(--slate-100)', fontSize: '11.5px', color: 'var(--slate-500)' }}>
          <span>
            {t('duplicates.recorded_at')}: {formatDate(client?.createdAt)}
          </span>
          {isInteractive && !isCanonical && (
            <button
              type="button"
              className="btn-secondary"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedCanonical((prev) => ({ ...prev, [item.id]: id }));
              }}
              style={{ padding: '3px 8px', fontSize: '11px' }}
            >
              {t('duplicates.keep_canonical')}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <Shell activePath="/duplicates">
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '1.5rem',
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
            {t('duplicates.title')}
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--slate-500)', marginTop: '4px', marginBottom: 0 }}>
            {t('duplicates.subtitle')}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <div
            className="badge"
            style={{
              fontSize: '13px',
              padding: '6px 12px',
              background: openCount > 0 ? '#fef3c7' : 'var(--slate-100)',
              color: openCount > 0 ? '#92400e' : 'var(--slate-700)',
              border: openCount > 0 ? '1px solid #fcd34d' : '1px solid var(--border-subtle)',
            }}
          >
            {t('duplicates.open_count')}:{' '}
            <strong style={{ marginLeft: '4px' }}>{openCount.toLocaleString()}</strong>
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              const activeCursor = cursorHistory.length > 0 ? cursorHistory[cursorHistory.length - 1] : undefined;
              loadDuplicates(activeCursor);
            }}
            disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', padding: '6px 12px' }}
          >
            <RefreshCw size={14} />
            <span>{t('duplicates.refresh')}</span>
          </button>
        </div>
      </div>

      {/* Banners */}
      {banner && (
        <div
          style={{
            background: banner.type === 'success' ? 'var(--success-bg)' : '#eff6ff',
            border: banner.type === 'success' ? '1px solid var(--success-border)' : '1px solid #bfdbfe',
            borderRadius: 'var(--radius-sm)',
            padding: '12px 16px',
            color: banner.type === 'success' ? 'var(--success-text)' : '#1e40af',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
            fontSize: '13.5px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {banner.type === 'success' ? <CheckCircle size={18} /> : <Info size={18} />}
            <span>{banner.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setBanner(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {!canAct && (
        <div
          style={{
            background: '#fffbeb',
            border: '1px solid #fde68a',
            borderRadius: 'var(--radius-sm)',
            padding: '10px 14px',
            color: '#92400e',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '13px',
          }}
        >
          <ShieldCheck size={17} />
          <span>{t('duplicates.view_only_notice')}</span>
        </div>
      )}

      {error && (
        <div
          style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 'var(--radius-sm)',
            padding: '10px 14px',
            color: '#991b1b',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '13px',
          }}
        >
          <AlertTriangle size={17} />
          <span>{error}</span>
        </div>
      )}

      {/* Filter Bar */}
      <div className="panel" style={{ padding: '1rem 1.25rem', marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {(['open', 'confirmed', 'dismissed', 'all'] as const).map((st) => {
              const active = statusFilter === st;
              return (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={active ? 'btn-primary' : 'btn-secondary'}
                  style={{ padding: '6px 12px', fontSize: '12.5px' }}
                >
                  {t(`duplicates.status_${st}`)}
                </button>
              );
            })}
          </div>

          <div style={{ marginLeft: 'auto', minWidth: '170px' }}>
            <select
              className="select-field"
              value={classificationFilter}
              onChange={(e) => setClassificationFilter(e.target.value as any)}
            >
              <option value="all">{t('duplicates.classification_all')}</option>
              <option value="probable">{t('duplicates.classification_probable')} (≥85)</option>
              <option value="possible">{t('duplicates.classification_possible')} (70–84)</option>
            </select>
          </div>
        </div>

        {/* Geo Filters */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '10px',
            paddingTop: '0.75rem',
            borderTop: '1px solid var(--slate-100)',
          }}
        >
          <select
            className="select-field"
            value={selectedDistrict}
            onChange={(e) => handleDistrictChange(e.target.value)}
            disabled={user?.role === 'cdc_secretary'}
          >
            <option value="">{user?.role === 'cdc_secretary' ? 'Assigned District' : 'All Districts'}</option>
            {districts.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nameEn || d.name}
              </option>
            ))}
          </select>

          <select
            className="select-field"
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
            className="select-field"
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
      </div>

      {/* Candidate List */}
      {loading ? (
        <div className="panel" style={{ padding: '3rem', textAlign: 'center', color: 'var(--slate-500)' }}>
          <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 8px auto' }} />
          <div style={{ fontSize: '13.5px' }}>Loading duplicate candidates...</div>
        </div>
      ) : items.length === 0 ? (
        <div className="panel" style={{ padding: '3rem', textAlign: 'center', color: 'var(--slate-500)' }}>
          <CopyCheck size={28} style={{ margin: '0 auto 10px auto', color: 'var(--slate-400)' }} />
          <div style={{ fontSize: '14px', fontWeight: 500 }}>{t('duplicates.empty')}</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {items.map((item) => {
            const isProbable = item.classification === 'probable';
            const factors = Array.isArray(item.reasons?.factors) ? item.reasons.factors : [];
            const isOpen = item.status === 'open';
            const isActing = actingId === item.id;

            return (
              <div key={item.id} className="panel" style={{ padding: '1.15rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {/* Pair Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span
                      className="badge"
                      style={{
                        background: isProbable ? '#fee2e2' : '#fef3c7',
                        color: isProbable ? '#991b1b' : '#92400e',
                        border: isProbable ? '1px solid #fca5a5' : '1px solid #fcd34d',
                        fontWeight: 700,
                      }}
                    >
                      {t(`duplicates.classification_${item.classification}`)} • {t('duplicates.score')} {item.score}
                    </span>

                    <span
                      className="badge badge-neutral"
                      style={{ textTransform: 'capitalize' }}
                    >
                      {t(`duplicates.status_${item.status}`)}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {factors.map((f, idx) => {
                      const label = formatFactor(f);
                      if (!label) return null;
                      return (
                        <span
                          key={`${extractFactorKey(f)}-${idx}`}
                          style={{
                            fontSize: '11px',
                            background: 'var(--slate-100)',
                            color: 'var(--slate-700)',
                            padding: '2px 8px',
                            borderRadius: '9999px',
                            border: '1px solid var(--slate-200)',
                          }}
                        >
                          {label}
                        </span>
                      );
                    })}
                  </div>
                </div>

                {/* Side-by-side records */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                    gap: '1rem',
                  }}
                >
                  {renderClientCard(item, item.clientARecord, item.clientA, 'Record A')}
                  {renderClientCard(item, item.clientBRecord, item.clientB, 'Record B')}
                </div>

                {/* Review Actions */}
                {isOpen && canAct && (
                  <div
                    style={{
                      display: 'flex',
                      gap: '10px',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      paddingTop: '0.75rem',
                      borderTop: '1px solid var(--slate-100)',
                    }}
                  >
                    <input
                      type="text"
                      className="input-field"
                      placeholder={t('duplicates.reason_placeholder')}
                      value={reasonNotes[item.id] || ''}
                      onChange={(e) =>
                        setReasonNotes((prev) => ({ ...prev, [item.id]: e.target.value }))
                      }
                      style={{ flex: 1, minWidth: '220px' }}
                    />

                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={isActing}
                      onClick={() => handleDismiss(item)}
                      style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      <XCircle size={15} />
                      <span>{t('duplicates.dismiss')}</span>
                    </button>

                    <button
                      type="button"
                      className="btn-primary"
                      disabled={isActing}
                      onClick={() => handleConfirm(item)}
                      style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      {isActing ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle size={15} />}
                      <span>{t('duplicates.confirm')}</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Keyset Pagination */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          gap: '8px',
          marginTop: '1.25rem',
        }}
      >
        <button
          type="button"
          onClick={handlePrevPage}
          disabled={cursorHistory.length === 0 || loading}
          className="btn-secondary"
          style={{ padding: '5px 12px', fontSize: '12.5px', display: 'flex', alignItems: 'center', gap: '4px' }}
        >
          <ChevronLeft size={14} />
          <span>{t('duplicates.previous')}</span>
        </button>
        <button
          type="button"
          onClick={handleNextPage}
          disabled={!nextCursor || loading}
          className="btn-secondary"
          style={{ padding: '5px 12px', fontSize: '12.5px', display: 'flex', alignItems: 'center', gap: '4px' }}
        >
          <span>{t('duplicates.next')}</span>
          <ChevronRight size={14} />
        </button>
      </div>
    </Shell>
  );
}
