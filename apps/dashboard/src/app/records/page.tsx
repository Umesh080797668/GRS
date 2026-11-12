'use client';

import { useState, useEffect } from 'react';
import { Shell } from '@/components/Shell';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
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
} from 'lucide-react';

export default function RecordsPage() {
  const { t } = useLanguage();
  const { user } = useAuth();

  const [records, setRecords] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [cursorHistory, setCursorHistory] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

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
  const [editAge, setEditAge] = useState<number>(18);
  const [editGender, setEditGender] = useState<string>('male');
  const [editAddress, setEditAddress] = useState<string>('');
  const [editPhone, setEditPhone] = useState<string>('');
  const [editIsEpf, setEditIsEpf] = useState<boolean>(false);
  const [editIsAswesuma, setEditIsAswesuma] = useState<boolean>(false);
  const [editIsSamurdhi, setEditIsSamurdhi] = useState<boolean>(false);
  const [editHasSpecialNeeds, setEditHasSpecialNeeds] = useState<boolean>(false);

  useEffect(() => {
    loadDistricts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role, user?.districtId, user?.dsId, user?.gnId]);

  async function loadDistricts() {
    try {
      const data = await api.getDistricts();
      setDistricts(data);
      if (user?.role === 'cdc_secretary' || user?.role === 'sda') {
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
      console.error('Failed to load districts:', err);
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

  useEffect(() => {
    setCursorHistory([]);
    loadRecords();
  }, [search, filterBeneficiary, filterGender, filterLanguage, selectedDistrict, selectedDs, selectedGn]);

  async function loadRecords(cursor?: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getClients({
        search: search.trim() || undefined,
        districtId: selectedDistrict || undefined,
        dsId: selectedDs || undefined,
        gnId: selectedGn || undefined,
        gender: filterGender !== 'all' ? filterGender : undefined,
        beneficiary: filterBeneficiary !== 'all' ? filterBeneficiary : undefined,
        language: filterLanguage !== 'all' ? filterLanguage : undefined,
        limit: 20,
        cursor: cursor || undefined,
        includeCount: !cursor,
      });

      const items = res.clients || (Array.isArray(res) ? res : []);
      setRecords(items);
      if (res.totalCount !== undefined) {
        setTotalCount(res.totalCount);
      } else if (!cursor) {
        setTotalCount(items.length);
      }
      setNextCursor(res.nextCursor || null);
    } catch (err: any) {
      setError(err.message || 'Failed to load records.');
    } finally {
      setLoading(false);
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
    setEditAge(record.age || 18);
    setEditGender(record.gender || 'male');
    setEditAddress(record.address || record.household?.address || '');
    setEditPhone(record.phoneE164 || record.phoneRaw || '');
    setEditIsEpf(record.isEpf || false);
    setEditIsAswesuma(record.isAswesuma || false);
    setEditIsSamurdhi(record.isSamurdhi || false);
    setEditHasSpecialNeeds(record.hasSpecialNeeds || false);
    setAuditReason('');
    setAuditError(null);
  }

  async function handleSaveAudit() {
    if (!editingRecord) return;
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
          age: editAge,
          gender: editGender,
          address: editAddress,
          phoneRaw: editPhone,
          isEpf: editIsEpf,
          isAswesuma: editIsAswesuma,
          isSamurdhi: editIsSamurdhi,
          hasSpecialNeeds: editHasSpecialNeeds,
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
    if (!deletingRecord) return;
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

  const canEditRecords = ['super_admin', 'cdc_secretary'].includes(user?.role || '');

  return (
    <Shell activePath="/records">
      {/* Title & Info Bar */}
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

      {!canEditRecords && user?.role === 'sda' && (
        <div
          style={{
            background: '#fffbeb',
            border: '1px solid #fde68a',
            borderRadius: 'var(--radius-sm)',
            padding: '10px 14px',
            color: '#92400e',
            marginBottom: '1rem',
            fontSize: '13px',
          }}
        >
          DS Division View-Only Mode: Reviewing citizen survey records within your assigned DS division. Record edits and deletions are restricted to CDC Secretaries and Super Admins.
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

        {/* Geographic Cascade Dropdowns */}
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
            disabled={user?.role === 'cdc_secretary' || user?.role === 'sda'}
          >
            <option value="">{(user?.role === 'cdc_secretary' || user?.role === 'sda') ? 'Assigned District' : 'All Districts'}</option>
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
            disabled={!selectedDistrict || dsDivisions.length === 0 || user?.role === 'cdc_secretary' || user?.role === 'sda'}
          >
            <option value="">{(user?.role === 'cdc_secretary' || user?.role === 'sda') ? 'Assigned DS Division' : 'All DS Divisions'}</option>
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
                          <>
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
                          </>
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
                  <label className="form-label">Age *</label>
                  <input
                    type="number"
                    className="input-field"
                    min={1}
                    max={120}
                    value={editAge}
                    onChange={(e) => setEditAge(parseInt(e.target.value, 10) || 18)}
                  />
                </div>
                <div>
                  <label className="form-label">Gender *</label>
                  <select
                    className="select-field"
                    value={editGender}
                    onChange={(e) => setEditGender(e.target.value)}
                  >
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
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
                <div style={{ gridColumn: 'span 2' }}>
                  <label className="form-label">Phone Number</label>
                  <input
                    type="text"
                    className="input-field"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                  />
                </div>

                <div style={{ gridColumn: 'span 2', paddingTop: '0.5rem', borderTop: '1px solid var(--slate-100)' }}>
                  <span className="form-label">Welfare & Social Indicators</span>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12.5px', marginTop: '4px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={editIsEpf}
                        onChange={(e) => setEditIsEpf(e.target.checked)}
                      />
                      <span>EPF/ETF Contributor</span>
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
      {deletingRecord && (
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
    </Shell>
  );
}
