'use client';

import { useState, useEffect, useRef } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { getAreaScopeLocks, loadScopedAreaLists } from '@/lib/area-scope';
import { formatDate } from '@/lib/utils';
import {
  Search,
  Edit3,
  Eye,
  CheckCircle,
  AlertCircle,
  Loader2,
  ChevronRight,
  ChevronLeft,
  X,
  UserCheck,
  ShieldAlert,
  Trash2,
  Home,
  ClipboardCheck,
} from 'lucide-react';

export interface RecordsPanelProps {
  districtId?: string;
  dsId?: string;
  gnId?: string;
  householdFilter?: { id: string; houseNo: string; leaderName: string } | null;
  onClearHouseholdFilter?: () => void;
  hideAreaSelectors?: boolean;
  showHeader?: boolean;
  standalone?: boolean;
  onRecordCountChange?: (count: number) => void;
}

export default function RecordsPanel({
  districtId: propDistrictId,
  dsId: propDsId,
  gnId: propGnId,
  householdFilter,
  onClearHouseholdFilter,
  hideAreaSelectors = false,
  showHeader = true,
  onRecordCountChange,
}: RecordsPanelProps = {}) {
  const { t, language } = useLanguage();
  const { user, isLoading: authLoading } = useAuth();

  const getLookupLabel = (item: any) => {
    if (!item) return '';
    if (language === 'si' && item.labelSi) return item.labelSi;
    if (language === 'ta' && item.labelTa) return item.labelTa;
    return item.labelEn || item.name || item.code;
  };

  const [records, setRecords] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [cursorHistory, setCursorHistory] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [scopeReady, setScopeReady] = useState<boolean>(false);

  // Filters
  const [search, setSearch] = useState<string>('');
  const [filterBeneficiary, setFilterBeneficiary] = useState<string>('all');
  const [filterGender, setFilterGender] = useState<string>('all');
  const [filterLanguage, setFilterLanguage] = useState<string>('all');

  // Geographic filters
  const [districts, setDistricts] = useState<any[]>([]);
  const [dsDivisions, setDsDivisions] = useState<any[]>([]);
  const [gnDivisions, setGnDivisions] = useState<any[]>([]);
  const [selectedDistrict, setSelectedDistrict] = useState<string>('');
  const [selectedDs, setSelectedDs] = useState<string>('');
  const [selectedGn, setSelectedGn] = useState<string>('');

  // Modal states
  const [selectedRecord, setSelectedRecord] = useState<any | null>(null);
  const [editingRecord, setEditingRecord] = useState<any | null>(null);
  const [auditReason, setAuditReason] = useState<string>('');
  const [savingAudit, setSavingAudit] = useState<boolean>(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [deletingRecord, setDeletingRecord] = useState<any | null>(null);
  const [deleteReason, setDeleteReason] = useState<string>('');
  const [deleting, setDeleting] = useState<boolean>(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // Edit form fields
  const [editName, setEditName] = useState<string>('');
  const [editAge, setEditAge] = useState<number>(25);
  const [editGender, setEditGender] = useState<string>('M');
  const [editAddress, setEditAddress] = useState<string>('');
  const [editPhone, setEditPhone] = useState<string>('');
  const [editWhatsapp, setEditWhatsapp] = useState<string>('');
  const [editHighestEducation, setEditHighestEducation] = useState<string>('EDU_OL_PASSED');
  const [editHighestVocational, setEditHighestVocational] = useState<string>('VOC_NONE');
  const [editInterestedStream, setEditInterestedStream] = useState<string>('STREAM_AGRICULTURE_FOOD_NATURAL');
  const [editInterestedJob, setEditInterestedJob] = useState<string>('JOB_SOFTWARE_DEV');
  const [editFutureHopes, setEditFutureHopes] = useState<string[]>([]);
  const [editIsEpf, setEditIsEpf] = useState<boolean>(false);
  const [editIsEtf, setEditIsEtf] = useState<boolean>(false);
  const [editIsAswesuma, setEditIsAswesuma] = useState<boolean>(false);
  const [editIsSamurdhi, setEditIsSamurdhi] = useState<boolean>(false);
  const [editHasSpecialNeeds, setEditHasSpecialNeeds] = useState<boolean>(false);
  const [editInfoProvidedBy, setEditInfoProvidedBy] = useState<'self' | 'mother' | 'father' | 'sister' | 'other'>('self');
  const [editInfoProvidedByOther, setEditInfoProvidedByOther] = useState<string>('');
  const [lookups, setLookups] = useState<Record<string, any[]>>({});
  const fetchSeqRef = useRef(0);
  const areaLocks = getAreaScopeLocks(user?.role);

  useEffect(() => {
    api.getLookups().then((res) => {
      if (res?.categories) {
        setLookups(res.categories);
      }
    }).catch(console.error);
  }, []);

  useEffect(() => {
    if (hideAreaSelectors) return;
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
        console.error('Failed to load districts:', err);
      } finally {
        if (!cancelled) {
          setScopeReady(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hideAreaSelectors, authLoading, user?.id, user?.role, user?.districtId, user?.dsId, user?.gnId]);

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

  useEffect(() => {
    if (authLoading || !user) return;
    if (!hideAreaSelectors && !scopeReady) return;
    setCursorHistory([]);
    loadRecords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    authLoading,
    user?.id,
    user?.role,
    scopeReady,
    search,
    filterBeneficiary,
    filterGender,
    filterLanguage,
    hideAreaSelectors,
    propDistrictId,
    propDsId,
    propGnId,
    householdFilter?.id,
    selectedDistrict,
    selectedDs,
    selectedGn,
  ]);

  async function loadRecords(cursor?: string) {
    if (authLoading || !user) return;
    if (!hideAreaSelectors && !scopeReady) return;
    const effectiveDistrict = hideAreaSelectors ? propDistrictId : selectedDistrict;
    const effectiveDs = hideAreaSelectors ? propDsId : selectedDs;
    const effectiveGn = hideAreaSelectors ? propGnId : selectedGn;
    const effectiveHouseholdId = householdFilter?.id;

    const seq = ++fetchSeqRef.current;
    setLoading(true);
    setError(null);
    try {
      const res = await api.getClients({
        search: search.trim() || undefined,
        districtId: !areaLocks.isDsLocked ? (effectiveDistrict || undefined) : undefined,
        dsId: !areaLocks.isGnLocked ? (effectiveDs || undefined) : undefined,
        gnId: effectiveGn || undefined,
        householdId: effectiveHouseholdId || undefined,
        gender: filterGender !== 'all' ? filterGender : undefined,
        beneficiary: filterBeneficiary !== 'all' ? filterBeneficiary : undefined,
        language: filterLanguage !== 'all' ? filterLanguage : undefined,
        limit: 20,
        cursor: cursor || undefined,
        includeCount: !cursor,
      });
      if (seq !== fetchSeqRef.current) return;

      const items = res.clients || (Array.isArray(res) ? res : []);
      setRecords(items);
      const total = res.totalCount !== undefined ? res.totalCount : (!cursor ? items.length : totalCount);
      setTotalCount(total);
      onRecordCountChange?.(total);
      setNextCursor(res.nextCursor || null);
    } catch (err: any) {
      if (seq === fetchSeqRef.current) {
        setError(err.message || 'Failed to load records.');
      }
    } finally {
      if (seq === fetchSeqRef.current) {
        setLoading(false);
      }
    }
  }

  function handleNextPage() {
    if (!nextCursor) return;
    setCursorHistory((prev) => [...prev, nextCursor]);
    loadRecords(nextCursor);
  }

  function handlePrevPage() {
    if (cursorHistory.length === 0) return;
    const history = [...cursorHistory];
    history.pop();
    const prevCursor = history.length > 0 ? history[history.length - 1] : undefined;
    setCursorHistory(history);
    loadRecords(prevCursor);
  }

  function openEditModal(record: any) {
    setEditingRecord(record);
    setEditName(record.name || '');
    setEditAge(record.age || 25);
    setEditGender(record.gender || 'M');
    setEditAddress(record.address || record.household?.address || '');
    setEditPhone(record.phoneE164 || record.phoneRaw || '');
    setEditWhatsapp(record.whatsappE164 || record.whatsappRaw || '');
    setEditHighestEducation(record.highestEducation || 'EDU_OL_PASSED');
    setEditHighestVocational(record.highestVocational || 'VOC_NONE');
    setEditInterestedStream(record.interestedVocationalStream || 'STREAM_AGRICULTURE_FOOD_NATURAL');
    setEditInterestedJob(record.interestedJob || 'JOB_SOFTWARE_DEV');
    setEditFutureHopes(Array.isArray(record.futureHopes) ? record.futureHopes : []);
    setEditIsEpf(record.isEpf || false);
    setEditIsEtf(record.isEtf || false);
    setEditIsAswesuma(record.isAswesuma || false);
    setEditIsSamurdhi(record.isSamurdhi || false);
    setEditHasSpecialNeeds(record.hasSpecialNeeds || false);
    setEditInfoProvidedBy(record.infoProvidedBy || 'self');
    setEditInfoProvidedByOther(record.infoProvidedByOther || '');
    setAuditReason('');
    setAuditError(null);
  }

  async function handleSaveAudit() {
    if (!editingRecord) return;
    if (!editAge || editAge < 18 || editAge > 35) {
      setAuditError('Age must be between 18 and 35. Cannot record data outside 18-35.');
      return;
    }
    if (!auditReason.trim()) {
      setAuditError('A mandatory correction reason is required for supervisor audit logging.');
      return;
    }

    setSavingAudit(true);
    setAuditError(null);

    try {
      await api.updateClient(
        editingRecord.id,
        {
          name: editName,
          age: editAge || 25,
          gender: editGender,
          address: editAddress,
          phoneRaw: editPhone,
          whatsappRaw: editWhatsapp,
          highestEducation: editHighestEducation,
          highestVocational: editHighestVocational,
          interestedVocationalStream: editInterestedStream,
          interestedJob: editInterestedJob,
          futureHopes: editFutureHopes,
          isEpf: editIsEpf,
          isEtf: editIsEtf,
          isAswesuma: editIsAswesuma,
          isSamurdhi: editIsSamurdhi,
          hasSpecialNeeds: editHasSpecialNeeds,
          infoProvidedBy: editInfoProvidedBy,
          infoProvidedByOther:
            editInfoProvidedBy === 'other'
              ? editInfoProvidedByOther.trim() || undefined
              : undefined,
        },
        auditReason.trim()
      );

      setSuccessBanner(`Record #${editingRecord.id.slice(0, 8)} updated successfully with audit trail.`);
      setEditingRecord(null);
      loadRecords(cursorHistory.length > 0 ? cursorHistory[cursorHistory.length - 1] : undefined);
    } catch (err: any) {
      setAuditError(err.message || 'Failed to update record.');
    } finally {
      setSavingAudit(false);
    }
  }

  async function handleDeleteRecord() {
    if (!deletingRecord || !canDeleteRecords) return;
    setDeleting(true);
    setDeleteError(null);
    setSuccessBanner(null);
    try {
      await api.deleteClient(deletingRecord.id, deleteReason.trim() || undefined);
      setSuccessBanner(`Record #${deletingRecord.id.slice(0, 8)} deleted successfully.`);
      setDeletingRecord(null);
      setDeleteReason('');
      loadRecords(cursorHistory.length > 0 ? cursorHistory[cursorHistory.length - 1] : undefined);
    } catch (err: any) {
      setDeleteError(err.message || 'Failed to delete record.');
    } finally {
      setDeleting(false);
    }
  }

  const canEditRecords = ['super_admin', 'sda', 'cdc_secretary'].includes(user?.role || '');
  const canDeleteRecords = ['super_admin', 'sda'].includes(user?.role || '');

  return (
    <>
      {/* Title & Info Bar */}
      {showHeader ? (
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
              {t('records.title')}
            </h1>
            <p style={{ fontSize: '13px', color: 'var(--slate-500)', marginTop: '4px' }}>
              Inspect enumerator survey submissions and execute supervisor audit corrections with mandatory reason logging.
            </p>
          </div>

          <div className="badge badge-neutral" style={{ fontSize: '13px', padding: '6px 12px' }}>
            Total Registered: <strong style={{ color: 'var(--primary)', marginLeft: '4px' }}>{totalCount.toLocaleString()}</strong>
          </div>
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '1rem',
            flexWrap: 'wrap',
            gap: '10px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ClipboardCheck size={20} style={{ color: 'var(--primary)' }} />
            <h2
              style={{
                fontSize: '17px',
                fontWeight: 700,
                color: 'var(--slate-900)',
                letterSpacing: '-0.02em',
                margin: 0,
              }}
            >
              {t('records.title')}
            </h2>
            {householdFilter && (
              <span className="badge badge-info" style={{ fontSize: '11px' }}>
                House #{householdFilter.houseNo}
              </span>
            )}
          </div>

          <div className="badge badge-neutral" style={{ fontSize: '12px', padding: '5px 10px' }}>
            {totalCount.toLocaleString()} {totalCount === 1 ? 'record' : 'records'}
          </div>
        </div>
      )}

      {/* Household Filter Focus Banner */}
      {householdFilter && (
        <div
          style={{
            background: 'rgba(37, 99, 235, 0.08)',
            border: '1px solid rgba(37, 99, 235, 0.25)',
            borderRadius: 'var(--radius-sm)',
            padding: '10px 14px',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            fontSize: '13px',
            color: 'var(--primary)',
            fontWeight: 500,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Home size={16} />
            <span>
              {t('records.filtered_by_house')}: <strong>#{householdFilter.houseNo}</strong> ({householdFilter.leaderName})
            </span>
          </div>
          {onClearHouseholdFilter && (
            <button
              type="button"
              onClick={onClearHouseholdFilter}
              className="btn-secondary"
              style={{
                padding: '4px 10px',
                fontSize: '11.5px',
                height: 'auto',
                background: '#ffffff',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <X size={12} />
              <span>{t('records.all_in_gn')}</span>
            </button>
          )}
        </div>
      )}

      {/* Success Notification */}
      {successBanner && (
        <div
          style={{
            background: 'var(--success-bg)',
            border: '1px solid var(--success-border)',
            borderRadius: 'var(--radius-sm)',
            padding: '12px 16px',
            color: 'var(--success-text)',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
            fontSize: '13.5px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CheckCircle size={18} />
            <span>{successBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessBanner(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--success-text)' }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Search & Multi-Filter Card */}
      <div className="panel" style={{ padding: '1.25rem', marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
            <Search
              size={15}
              color="var(--slate-400)"
              style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)' }}
            />
            <input
              type="text"
              className="input-field"
              placeholder={t('records.search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: '34px' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <select
              className="select-field"
              style={{ width: 'auto', minWidth: '150px' }}
              value={filterBeneficiary}
              onChange={(e) => setFilterBeneficiary(e.target.value)}
            >
              <option value="all">All Beneficiaries</option>
              <option value="aswesuma">Aswesuma</option>
              <option value="samurdhi">Samurdhi</option>
              <option value="epf">EPF/ETF</option>
              <option value="special_needs">Special Needs</option>
            </select>

            <select
              className="select-field"
              style={{ width: 'auto', minWidth: '120px' }}
              value={filterGender}
              onChange={(e) => setFilterGender(e.target.value)}
            >
              <option value="all">All Genders</option>
              <option value="M">Male</option>
              <option value="F">Female</option>
            </select>

            <select
              className="select-field"
              style={{ width: 'auto', minWidth: '130px' }}
              value={filterLanguage}
              onChange={(e) => setFilterLanguage(e.target.value)}
            >
              <option value="all">All Languages</option>
              <option value="si">Sinhala</option>
              <option value="ta">Tamil</option>
              <option value="en">English</option>
            </select>
          </div>
        </div>

        {/* Geographic Cascade Dropdowns (hidden when embedded in Houses page) */}
        {!hideAreaSelectors && (
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
              disabled={areaLocks.isDistrictLocked}
            >
              <option value="">{areaLocks.isDistrictLocked ? 'Assigned District' : 'All Districts'}</option>
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
              value={selectedGn}
              onChange={(e) => setSelectedGn(e.target.value)}
              disabled={!selectedDs || gnDivisions.length === 0 || areaLocks.isGnLocked}
            >
              <option value="">{areaLocks.isGnLocked ? 'Assigned GN Division' : 'All GN Divisions'}</option>
              {gnDivisions.map((gn) => (
                <option key={gn.id} value={gn.id}>
                  {gn.gnNumber || gn.gnCode} — {gn.gnName || gn.nameEn || gn.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Survey Records Table */}
      <div className="panel" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '3rem 1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px', color: 'var(--slate-500)' }}>
            <Loader2 size={24} className="animate-spin" style={{ color: 'var(--primary)' }} />
            <span style={{ fontSize: '13.5px' }}>Loading survey records...</span>
          </div>
        ) : error ? (
          <div style={{ padding: '2.5rem 1.5rem', textAlign: 'center', color: 'var(--danger-text)' }}>
            <AlertCircle size={24} style={{ margin: '0 auto 8px auto' }} />
            <p style={{ fontSize: '13.5px' }}>{error}</p>
          </div>
        ) : records.length === 0 ? (
          <div style={{ padding: '3rem 1.5rem', textAlign: 'center', color: 'var(--slate-400)' }}>
            <p style={{ fontSize: '13.5px' }}>No survey records found matching your filters.</p>
          </div>
        ) : (
          <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>House / Serial</th>
                  <th>Surveyed Individual</th>
                  <th>Demographics</th>
                  <th>Contact</th>
                  <th>Welfare Status</th>
                  <th>Collector</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--slate-900)', fontFamily: 'monospace' }}>
                        #{r.household?.houseNo || 'N/A'}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--slate-400)', marginTop: '1px' }}>
                        Serial: {r.household?.serialNo || '—'}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--slate-900)' }}>{r.name}</div>
                      <div style={{ fontSize: '12px', color: 'var(--slate-500)', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.address || r.household?.address || 'No address registered'}
                      </div>
                    </td>
                    <td>
                      <span className="tabular-nums" style={{ fontSize: '12.5px', color: 'var(--slate-700)' }}>
                        {r.age} yrs • {r.gender}
                      </span>
                    </td>
                    <td>
                      <span className="tabular-nums" style={{ fontSize: '12.5px', color: 'var(--slate-700)', fontFamily: 'monospace' }}>
                        {r.phoneE164 || r.phoneRaw || '—'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                        {r.isAswesuma && <span className="badge badge-info" style={{ fontSize: '9px', padding: '1px 4px' }}>Aswesuma</span>}
                        {r.isSamurdhi && <span className="badge badge-info" style={{ fontSize: '9px', padding: '1px 4px' }}>Samurdhi</span>}
                        {r.isEpf && <span className="badge badge-success" style={{ fontSize: '9px', padding: '1px 4px' }}>EPF</span>}
                        {r.hasSpecialNeeds && (
                          <span className="badge badge-warning" style={{ fontSize: '9px', padding: '1px 4px' }}>Special</span>
                        )}
                        {!r.isAswesuma && !r.isSamurdhi && !r.isEpf && !r.hasSpecialNeeds && (
                          <span style={{ color: 'var(--slate-400)', fontSize: '12px' }}>—</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span style={{ fontSize: '12.5px', color: 'var(--slate-700)' }}>
                        {r.collector?.fullName || r.collector?.userCode || 'System'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                        <button
                          type="button"
                          onClick={() => setSelectedRecord(r)}
                          className="btn-secondary"
                          style={{ padding: '5px 8px', fontSize: '11px' }}
                          title="Inspect Record Details"
                          aria-label="Inspect Record Details"
                        >
                          <Eye size={13} />
                        </button>
                        {canEditRecords && (
                          <button
                            type="button"
                            onClick={() => openEditModal(r)}
                            className="btn-secondary"
                            style={{ padding: '5px 8px', fontSize: '11px', color: 'var(--warning-text)' }}
                            title={t('records.edit_record')}
                            aria-label={t('records.edit_record')}
                          >
                            <Edit3 size={13} />
                          </button>
                        )}
                        {canDeleteRecords && (
                          <button
                            type="button"
                            onClick={() => {
                              setDeleteError(null);
                              setDeleteReason('');
                              setDeletingRecord(r);
                            }}
                            className="btn-secondary"
                            style={{
                              padding: '5px 8px',
                              fontSize: '11px',
                              color: 'var(--danger-text)',
                              borderColor: 'var(--danger-border)',
                            }}
                            title={t('records.delete_record')}
                            aria-label={t('records.delete_record')}
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Keyset Pagination Controls */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.875rem 1.25rem',
            borderTop: '1px solid var(--border-subtle)',
            background: 'var(--slate-50)',
          }}
        >
          <span style={{ fontSize: '12px', color: 'var(--slate-500)' }}>
            Showing {records.length} records
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={handlePrevPage}
              disabled={cursorHistory.length === 0 || loading}
              className="btn-secondary"
              style={{ padding: '4px 10px', fontSize: '12px' }}
            >
              <ChevronLeft size={14} />
              <span>Previous</span>
            </button>
            <button
              type="button"
              onClick={handleNextPage}
              disabled={!nextCursor || loading}
              className="btn-secondary"
              style={{ padding: '4px 10px', fontSize: '12px' }}
            >
              <span>Next</span>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Record Inspection Modal */}
      {selectedRecord && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-content" style={{ maxWidth: '520px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <UserCheck size={18} style={{ color: 'var(--primary)' }} />
                <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--slate-900)' }}>
                  Survey Record Details
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRecord(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate-400)', padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', fontSize: '13px' }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '12px',
                  background: 'var(--slate-50)',
                  padding: '12px 14px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--slate-500)', display: 'block' }}>Full Name</span>
                  <strong style={{ color: 'var(--slate-900)' }}>{selectedRecord.name}</strong>
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--slate-500)', display: 'block' }}>Age & Gender</span>
                  <span style={{ color: 'var(--slate-800)' }}>
                    {selectedRecord.age} years • {selectedRecord.gender}
                  </span>
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--slate-500)', display: 'block' }}>House Number</span>
                  <span style={{ color: 'var(--slate-800)', fontFamily: 'monospace' }}>
                    #{selectedRecord.household?.houseNo || 'N/A'}
                  </span>
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--slate-500)', display: 'block' }}>Phone Number</span>
                  <span style={{ color: 'var(--slate-800)', fontFamily: 'monospace' }}>
                    {selectedRecord.phoneE164 || selectedRecord.phoneRaw || '—'}
                  </span>
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--slate-500)', display: 'block' }}>WhatsApp Number</span>
                  <span style={{ color: 'var(--slate-800)', fontFamily: 'monospace' }}>
                    {selectedRecord.whatsappE164 || selectedRecord.whatsappRaw || '—'}
                  </span>
                </div>
              </div>

              <div>
                <span style={{ fontSize: '11.5px', color: 'var(--slate-500)', display: 'block', marginBottom: '2px' }}>Registered Address</span>
                <p style={{ color: 'var(--slate-800)', margin: 0 }}>
                  {selectedRecord.address || selectedRecord.household?.address || 'Not specified'}
                </p>
              </div>

              <div>
                <span style={{ fontSize: '11.5px', color: 'var(--slate-500)', display: 'block', marginBottom: '4px' }}>Education & Career</span>
                <div style={{ background: 'var(--slate-50)', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px' }}>
                  <div>Highest Education: <strong style={{ color: 'var(--slate-800)' }}>{selectedRecord.highestEducation || 'None'}</strong></div>
                  <div>Vocational Qual: <strong style={{ color: 'var(--slate-800)' }}>{selectedRecord.highestVocational || 'None'}</strong></div>
                  <div>Interested Stream: <strong style={{ color: 'var(--slate-800)' }}>{selectedRecord.interestedVocationalStream || 'None'}</strong></div>
                  <div>Interested Job: <strong style={{ color: 'var(--slate-800)' }}>{selectedRecord.interestedJob || 'None'}</strong></div>
                  <div>Future Hopes: <strong style={{ color: 'var(--slate-800)' }}>{Array.isArray(selectedRecord.futureHopes) ? selectedRecord.futureHopes.join(', ') : (selectedRecord.futureHopes || 'None')}</strong></div>
                  <div>Info Provided By: <strong style={{ color: 'var(--slate-800)' }}>{selectedRecord.infoProvidedBy || 'self'}{selectedRecord.infoProvidedByOther ? ` (${selectedRecord.infoProvidedByOther})` : ''}</strong></div>
                </div>
              </div>

              <div>
                <span style={{ fontSize: '11.5px', color: 'var(--slate-500)', display: 'block', marginBottom: '4px' }}>Welfare & Social Indicators</span>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {selectedRecord.isEpf && <span className="badge badge-info">EPF</span>}
                  {selectedRecord.isEtf && <span className="badge badge-info">ETF</span>}
                  {selectedRecord.isAswesuma && <span className="badge badge-success">Aswesuma</span>}
                  {selectedRecord.isSamurdhi && <span className="badge badge-warning">Samurdhi</span>}
                  {selectedRecord.hasSpecialNeeds && <span className="badge badge-error">Special Needs</span>}
                  {!selectedRecord.isEpf && !selectedRecord.isEtf && !selectedRecord.isAswesuma && !selectedRecord.isSamurdhi && !selectedRecord.hasSpecialNeeds && (
                    <span style={{ color: 'var(--slate-400)', fontSize: '12px' }}>No welfare indicators flagged</span>
                  )}
                </div>
              </div>

              <div>
                <span style={{ fontSize: '11.5px', color: 'var(--slate-500)', display: 'block', marginBottom: '2px' }}>Audit Metadata</span>
                <div style={{ fontSize: '11.5px', color: 'var(--slate-500)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <div>Created: {formatDate(selectedRecord.createdAt)}</div>
                  <div>Last Updated: {formatDate(selectedRecord.updatedAt)}</div>
                  <div>Collector: {selectedRecord.collector?.fullName || selectedRecord.collector?.userCode || 'System'}</div>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                onClick={() => {
                  const rec = selectedRecord;
                  setSelectedRecord(null);
                  openEditModal(rec);
                }}
                className="btn-primary"
                style={{ fontSize: '12.5px' }}
              >
                <Edit3 size={13} />
                <span>Supervisor Correction</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedRecord(null)}
                className="btn-secondary"
                style={{ fontSize: '12.5px' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Supervisor Edit Modal with Mandatory Audit Reason */}
      {editingRecord && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-content" style={{ maxWidth: '560px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShieldAlert size={18} style={{ color: 'var(--warning)' }} />
                <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--slate-900)' }}>
                  {t('records.edit_record')}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingRecord(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate-400)', padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {auditError && (
                <div style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', padding: '10px 14px', borderRadius: 'var(--radius-sm)', fontSize: '12px', color: 'var(--danger-text)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <AlertCircle size={15} style={{ flexShrink: 0 }} />
                  <span>{auditError}</span>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ gridColumn: 'span 2' }}>
                  <label className="form-label">Full Name *</label>
                  <input
                    type="text"
                    className="input-field"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="form-label">Age (only 18-35) *</label>
                  <input
                    type="number"
                    min={18}
                    max={35}
                    className="input-field"
                    placeholder="18 - 35"
                    value={editAge || ''}
                    onChange={(e) => setEditAge(parseInt(e.target.value, 10) || 0)}
                    required
                  />
                </div>
                <div>
                  <label className="form-label">Gender (only 18-35) *</label>
                  <select
                    className="select-field"
                    value={editGender}
                    onChange={(e) => setEditGender(e.target.value)}
                  >
                    <option value="M">Male</option>
                    <option value="F">Female</option>
                  </select>
                </div>
                <div style={{ gridColumn: 'span 2' }}>
                  <label className="form-label">Address</label>
                  <input
                    type="text"
                    className="input-field"
                    value={editAddress}
                    onChange={(e) => setEditAddress(e.target.value)}
                  />
                </div>
                <div>
                  <label className="form-label">Phone Number</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="e.g. 0771234567"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                  />
                </div>
                <div>
                  <label className="form-label">WhatsApp Number</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="e.g. 0771234567"
                    value={editWhatsapp}
                    onChange={(e) => setEditWhatsapp(e.target.value)}
                  />
                </div>

                {/* Education & Career Qualification */}
                <div style={{ gridColumn: 'span 2', paddingTop: '0.5rem', borderTop: '1px solid var(--slate-100)' }}>
                  <span className="form-label">Education & Career</span>
                </div>
                <div>
                  <label className="form-label">Highest Education</label>
                  <select
                    className="select-field"
                    value={editHighestEducation}
                    onChange={(e) => setEditHighestEducation(e.target.value)}
                  >
                    {lookups.education && lookups.education.length > 0 ? (
                      lookups.education.map((item: any) => (
                        <option key={item.code} value={item.code}>
                          {getLookupLabel(item)}
                        </option>
                      ))
                    ) : (
                      <option value="EDU_OL_PASSED">G.C.E. O/L passed</option>
                    )}
                  </select>
                </div>
                <div>
                  <label className="form-label">Highest Vocational Qualification</label>
                  <select
                    className="select-field"
                    value={editHighestVocational}
                    onChange={(e) => setEditHighestVocational(e.target.value)}
                  >
                    {lookups.vocational_qualification && lookups.vocational_qualification.length > 0 ? (
                      lookups.vocational_qualification.map((item: any) => (
                        <option key={item.code} value={item.code}>
                          {getLookupLabel(item)}
                        </option>
                      ))
                    ) : (
                      <option value="VOC_NONE">None</option>
                    )}
                  </select>
                </div>
                <div>
                  <label className="form-label">Interested Vocational Stream</label>
                  <select
                    className="select-field"
                    value={editInterestedStream}
                    onChange={(e) => setEditInterestedStream(e.target.value)}
                  >
                    {lookups.vocational_stream && lookups.vocational_stream.length > 0 ? (
                      lookups.vocational_stream.map((item: any) => (
                        <option key={item.code} value={item.code}>
                          {getLookupLabel(item)}
                        </option>
                      ))
                    ) : (
                      <option value="STREAM_AGRICULTURE_FOOD_NATURAL">Agriculture, Food and Natural Resource Sector</option>
                    )}
                  </select>
                </div>
                <div>
                  <label className="form-label">Interested Job</label>
                  <select
                    className="select-field"
                    value={editInterestedJob}
                    onChange={(e) => setEditInterestedJob(e.target.value)}
                  >
                    {lookups.job && lookups.job.length > 0 ? (
                      lookups.job.map((item: any) => (
                        <option key={item.code} value={item.code}>
                          {getLookupLabel(item)}
                        </option>
                      ))
                    ) : (
                      <option value="JOB_SOFTWARE_DEV">Software Developer</option>
                    )}
                  </select>
                </div>

                <div style={{ gridColumn: 'span 2' }}>
                  <label className="form-label">Future Hopes / Aspirations</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '6px', marginTop: '4px' }}>
                    {(lookups.future_hope && lookups.future_hope.length > 0
                      ? lookups.future_hope
                      : [
                        { code: 'HOPE_GOV_JOB', labelEn: 'Government Job' },
                        { code: 'HOPE_PRIVATE_JOB', labelEn: 'Private Sector' },
                        { code: 'HOPE_OWN_BIZ', labelEn: 'Own Business' },
                        { code: 'HOPE_HIGHER_EDU', labelEn: 'Higher Education' },
                        { code: 'HOPE_FOREIGN_EMPLOYMENT', labelEn: 'Foreign Employment' },
                      ]
                    ).map((item: any) => {
                      const isChecked = editFutureHopes.includes(item.code);
                      return (
                        <label key={item.code} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setEditFutureHopes([...editFutureHopes, item.code]);
                              } else {
                                setEditFutureHopes(editFutureHopes.filter((c) => c !== item.code));
                              }
                            }}
                          />
                          <span>{getLookupLabel(item)}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Welfare & Social Indicators */}
                <div style={{ gridColumn: 'span 2', paddingTop: '0.5rem', borderTop: '1px solid var(--slate-100)' }}>
                  <span className="form-label">Education & Career</span>
                </div>
                <div>
                  <label className="form-label">Highest Education</label>
                  <select
                    className="select-field"
                    value={editHighestEducation}
                    onChange={(e) => setEditHighestEducation(e.target.value)}
                  >
                    {lookups.education && lookups.education.length > 0 ? (
                      lookups.education.map((item: any) => (
                        <option key={item.code} value={item.code}>
                          {getLookupLabel(item)}
                        </option>
                      ))
                    ) : (
                      <option value="EDU_OL_PASSED">G.C.E. O/L passed</option>
                    )}
                  </select>
                </div>
                <div>
                  <label className="form-label">Highest Vocational Qualification</label>
                  <select
                    className="select-field"
                    value={editHighestVocational}
                    onChange={(e) => setEditHighestVocational(e.target.value)}
                  >
                    {lookups.vocational_qualification && lookups.vocational_qualification.length > 0 ? (
                      lookups.vocational_qualification.map((item: any) => (
                        <option key={item.code} value={item.code}>
                          {getLookupLabel(item)}
                        </option>
                      ))
                    ) : (
                      <option value="VOC_NONE">None</option>
                    )}
                  </select>
                </div>
                <div>
                  <label className="form-label">Interested Vocational Stream</label>
                  <select
                    className="select-field"
                    value={editInterestedStream}
                    onChange={(e) => setEditInterestedStream(e.target.value)}
                  >
                    {lookups.vocational_stream && lookups.vocational_stream.length > 0 ? (
                      lookups.vocational_stream.map((item: any) => (
                        <option key={item.code} value={item.code}>
                          {getLookupLabel(item)}
                        </option>
                      ))
                    ) : (
                      <option value="STREAM_IT_COMPUTING">IT & Computing</option>
                    )}
                  </select>
                </div>
                <div>
                  <label className="form-label">Interested Job</label>
                  <select
                    className="select-field"
                    value={editInterestedJob}
                    onChange={(e) => setEditInterestedJob(e.target.value)}
                  >
                    {lookups.job && lookups.job.length > 0 ? (
                      lookups.job.map((item: any) => (
                        <option key={item.code} value={item.code}>
                          {getLookupLabel(item)}
                        </option>
                      ))
                    ) : (
                      <option value="JOB_SOFTWARE_DEV">Software Developer</option>
                    )}
                  </select>
                </div>

                <div style={{ gridColumn: 'span 2' }}>
                  <label className="form-label">Future Hopes / Aspirations</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '6px', marginTop: '4px' }}>
                    {(lookups.future_hope && lookups.future_hope.length > 0
                      ? lookups.future_hope
                      : [
                        { code: 'HOPE_GOV_JOB', labelEn: 'Government Job' },
                        { code: 'HOPE_PRIVATE_JOB', labelEn: 'Private Sector' },
                        { code: 'HOPE_OWN_BIZ', labelEn: 'Own Business' },
                        { code: 'HOPE_HIGHER_EDU', labelEn: 'Higher Education' },
                        { code: 'HOPE_FOREIGN_EMPLOYMENT', labelEn: 'Foreign Employment' },
                      ]
                    ).map((item: any) => {
                      const isChecked = editFutureHopes.includes(item.code);
                      return (
                        <label key={item.code} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setEditFutureHopes([...editFutureHopes, item.code]);
                              } else {
                                setEditFutureHopes(editFutureHopes.filter((c) => c !== item.code));
                              }
                            }}
                          />
                          <span>{getLookupLabel(item)}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Welfare & Social Indicators */}
                <div style={{ gridColumn: 'span 2', paddingTop: '0.5rem', borderTop: '1px solid var(--slate-100)' }}>
                  <span className="form-label">Welfare & Social Indicators</span>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12.5px', marginTop: '4px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={editIsEpf}
                        onChange={(e) => setEditIsEpf(e.target.checked)}
                      />
                      <span>EPF Contributor</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={editIsEtf}
                        onChange={(e) => setEditIsEtf(e.target.checked)}
                      />
                      <span>ETF Contributor</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={editIsAswesuma}
                        onChange={(e) => setEditIsAswesuma(e.target.checked)}
                      />
                      <span>Aswesuma Beneficiary</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={editIsSamurdhi}
                        onChange={(e) => setEditIsSamurdhi(e.target.checked)}
                      />
                      <span>Samurdhi Beneficiary</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={editHasSpecialNeeds}
                        onChange={(e) => setEditHasSpecialNeeds(e.target.checked)}
                      />
                      <span>Has Special Needs</span>
                    </label>
                  </div>
                </div>

                {/* Info Source */}
                <div style={{ gridColumn: 'span 2', paddingTop: '0.5rem', borderTop: '1px solid var(--slate-100)' }}>
                  <label className="form-label">Information Provided By</label>
                  <select
                    className="select-field"
                    value={editInfoProvidedBy}
                    onChange={(e) => setEditInfoProvidedBy(e.target.value as any)}
                  >
                    <option value="self">Self (Applicant)</option>
                    <option value="mother">Mother</option>
                    <option value="father">Father</option>
                    <option value="sister">Sister/Brother</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                {editInfoProvidedBy === 'other' && (
                  <div style={{ gridColumn: 'span 2' }}>
                    <label className="form-label">If Other, please specify</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="e.g. Uncle / Guardian"
                      value={editInfoProvidedByOther}
                      onChange={(e) => setEditInfoProvidedByOther(e.target.value)}
                    />
                  </div>
                )}

                {/* Mandatory Audit Reason Input (Decision C2 / Invariant §8) */}
                <div style={{ gridColumn: 'span 2', paddingTop: '0.75rem', borderTop: '1px solid var(--slate-100)' }}>
                  <label className="form-label" style={{ color: 'var(--warning-text)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <ShieldAlert size={14} />
                    <span>{t('records.audit_reason')} *</span>
                  </label>
                  <textarea
                    rows={3}
                    className="input-field"
                    placeholder="Enter reason for modifying this survey record (e.g. Corrected spelling per verified national ID)"
                    value={auditReason}
                    onChange={(e) => setAuditReason(e.target.value)}
                  />
                  <span style={{ fontSize: '11px', color: 'var(--slate-400)', marginTop: '4px', display: 'block' }}>
                    This reason is permanently recorded in the immutable audit log under your user identity.
                  </span>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                onClick={() => setEditingRecord(null)}
                className="btn-secondary"
                disabled={savingAudit}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveAudit}
                disabled={savingAudit}
                className="btn-primary"
              >
                {savingAudit ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle size={15} />
                    <span>{t('records.save_audit')}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Record Confirmation Modal */}
      {deletingRecord && canDeleteRecords && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-content" style={{ maxWidth: '460px' }}>
            <div className="modal-header">
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--danger-text)' }}>
                  {t('records.delete_record')}
                </h3>
                <p style={{ fontSize: '12px', color: 'var(--slate-500)', margin: '2px 0 0 0' }}>
                  {deletingRecord.name || 'Record'} (#{deletingRecord.id.slice(0, 8)})
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setDeletingRecord(null); setDeleteError(null); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate-400)', padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {deleteError && (
                <div
                  style={{
                    background: 'var(--danger-bg)',
                    border: '1px solid var(--danger-border)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '10px 12px',
                    color: 'var(--danger-text)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '13px',
                  }}
                >
                  <AlertCircle size={16} style={{ flexShrink: 0 }} />
                  <span>{deleteError}</span>
                </div>
              )}
              <p style={{ fontSize: '13.5px', color: 'var(--slate-700)', margin: 0, lineHeight: 1.5 }}>
                Are you sure you want to soft-delete the survey record for <strong>{deletingRecord.name || deletingRecord.id.slice(0, 8)}</strong>? This action logs an immutable audit entry and automatically dismisses open duplicate candidates referencing this record.
              </p>
              <div>
                <label className="form-label">Deletion Reason (Optional)</label>
                <textarea
                  rows={2}
                  className="input-field"
                  placeholder="e.g. Entered in error or verified duplicate"
                  value={deleteReason}
                  onChange={(e) => setDeleteReason(e.target.value)}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                onClick={() => { setDeletingRecord(null); setDeleteError(null); }}
                className="btn-secondary"
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteRecord}
                disabled={deleting}
                className="btn-secondary"
                style={{
                  background: 'var(--danger-bg)',
                  borderColor: 'var(--danger-border)',
                  color: 'var(--danger-text)',
                  fontWeight: 600,
                }}
              >
                {deleting ? <Loader2 size={15} className="animate-spin" /> : t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
