'use client';

import { useState, useEffect } from 'react';
import { Shell } from '@/components/Shell';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import {
  FileText,
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

  // Modal states
  const [selectedRecord, setSelectedRecord] = useState<any | null>(null);
  const [editingRecord, setEditingRecord] = useState<any | null>(null);
  const [auditReason, setAuditReason] = useState<string>('');
  const [savingAudit, setSavingAudit] = useState<boolean>(false);
  const [auditError, setAuditError] = useState<string | null>(null);
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
    loadRecords();
  }, [search]);

  async function loadRecords(cursor?: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getClients({
        search: search.trim() || undefined,
        limit: 20,
        cursor: cursor || undefined,
      });

      const items = res.clients || (Array.isArray(res) ? res : []);
      setRecords(items);
      setTotalCount(res.totalCount || items.length);
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
    history.pop(); // remove current
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

  // Filter records in memory for quick filters
  const displayedRecords = records.filter((r) => {
    if (filterGender !== 'all' && r.gender !== filterGender) return false;
    if (filterBeneficiary === 'aswesuma' && !r.isAswesuma) return false;
    if (filterBeneficiary === 'samurdhi' && !r.isSamurdhi) return false;
    if (filterBeneficiary === 'epf' && !r.isEpf) return false;
    if (filterBeneficiary === 'special_needs' && !r.hasSpecialNeeds) return false;
    return true;
  });

  return (
    <Shell activePath="/records">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
              <FileText className="w-7 h-7 text-emerald-400" />
              {t('records.title')}
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Inspect enumerator survey submissions and execute supervisor audit corrections with mandatory reason logging.
            </p>
          </div>
          <div className="badge badge-info">
            Total Records: {totalCount}
          </div>
        </div>

        {/* Success Banner */}
        {successBanner && (
          <div className="card border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-300 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-emerald-400" />
              <span>{successBanner}</span>
            </div>
            <button onClick={() => setSuccessBanner(null)} className="text-slate-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Search & Filter Toolbar */}
        <div className="card p-4 space-y-4">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                className="input pl-9"
                placeholder={t('records.search')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <select
                className="input w-auto text-sm"
                value={filterBeneficiary}
                onChange={(e) => setFilterBeneficiary(e.target.value)}
              >
                <option value="all">All Beneficiary Types</option>
                <option value="aswesuma">Aswesuma Beneficiaries</option>
                <option value="samurdhi">Samurdhi Beneficiaries</option>
                <option value="epf">EPF/ETF Contributors</option>
                <option value="special_needs">Special Needs</option>
              </select>

              <select
                className="input w-auto text-sm"
                value={filterGender}
                onChange={(e) => setFilterGender(e.target.value)}
              >
                <option value="all">All Genders</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
        </div>

        {/* Records Table */}
        <div className="card overflow-hidden">
          {loading ? (
            <div className="p-12 flex flex-col items-center justify-center text-slate-400 gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
              <span>Loading survey records...</span>
            </div>
          ) : error ? (
            <div className="p-8 text-center text-red-400">
              <AlertCircle className="w-6 h-6 mx-auto mb-2" />
              <p>{error}</p>
            </div>
          ) : displayedRecords.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              <p>No survey records found matching your filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="table w-full text-left">
                <thead>
                  <tr>
                    <th>House / Serial</th>
                    <th>Surveyed Individual</th>
                    <th>Demographics</th>
                    <th>Contact</th>
                    <th>Welfare Status</th>
                    <th>Collector</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedRecords.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <div className="font-semibold text-white">
                          #{r.household?.houseNo || 'N/A'}
                        </div>
                        <div className="text-xs text-slate-400">
                          Serial: {r.household?.serialNo || '-'}
                        </div>
                      </td>
                      <td>
                        <div className="font-medium text-slate-100">{r.name}</div>
                        <div className="text-xs text-slate-400 truncate max-w-xs">
                          {r.address || r.household?.address || 'No address registered'}
                        </div>
                      </td>
                      <td>
                        <span className="text-xs font-mono text-slate-300">
                          {r.age} yrs • {r.gender}
                        </span>
                      </td>
                      <td>
                        <div className="text-xs text-slate-300 font-mono">
                          {r.phoneE164 || r.phoneRaw || '-'}
                        </div>
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {r.isAswesuma && <span className="badge badge-info text-[10px]">Aswesuma</span>}
                          {r.isSamurdhi && <span className="badge badge-info text-[10px]">Samurdhi</span>}
                          {r.isEpf && <span className="badge badge-success text-[10px]">EPF</span>}
                          {r.hasSpecialNeeds && (
                            <span className="badge badge-warning text-[10px]">Special</span>
                          )}
                          {!r.isAswesuma && !r.isSamurdhi && !r.isEpf && !r.hasSpecialNeeds && (
                            <span className="text-slate-600 text-xs">-</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="text-xs text-slate-300">
                          {r.collector?.fullName || r.collector?.userCode || 'System'}
                        </div>
                      </td>
                      <td className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setSelectedRecord(r)}
                            className="btn btn-secondary p-1.5 text-xs"
                            title="Inspect Record"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => openEditModal(r)}
                            className="btn btn-secondary p-1.5 text-xs text-amber-400 hover:text-amber-300"
                            title={t('records.edit_record')}
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Keyset Pagination Controls */}
          <div className="flex items-center justify-between p-4 border-t border-slate-800 bg-slate-900/50">
            <span className="text-xs text-slate-400">
              Showing {displayedRecords.length} records
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrevPage}
                disabled={cursorHistory.length === 0 || loading}
                className="btn btn-secondary text-xs flex items-center gap-1"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Previous
              </button>
              <button
                onClick={handleNextPage}
                disabled={!nextCursor || loading}
                className="btn btn-secondary text-xs flex items-center gap-1"
              >
                Next <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* View Detail Modal */}
        {selectedRecord && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="card max-w-lg w-full p-6 space-y-4">
              <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <UserCheck className="w-5 h-5 text-emerald-400" />
                  Survey Record Details
                </h2>
                <button
                  onClick={() => setSelectedRecord(null)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-3 bg-slate-900/50 p-3 rounded-lg border border-slate-800">
                  <div>
                    <span className="text-xs text-slate-400 block">Full Name</span>
                    <strong className="text-slate-100">{selectedRecord.name}</strong>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 block">Age & Gender</span>
                    <span className="text-slate-200">
                      {selectedRecord.age} years • {selectedRecord.gender}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 block">House Number</span>
                    <span className="text-slate-200">
                      #{selectedRecord.household?.houseNo || 'N/A'}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 block">Phone</span>
                    <span className="text-slate-200 font-mono">
                      {selectedRecord.phoneE164 || selectedRecord.phoneRaw || '-'}
                    </span>
                  </div>
                </div>

                <div>
                  <span className="text-xs text-slate-400 block">Address</span>
                  <p className="text-slate-300">
                    {selectedRecord.address || selectedRecord.household?.address || 'Not specified'}
                  </p>
                </div>

                <div>
                  <span className="text-xs text-slate-400 block mb-1">Education & Career</span>
                  <div className="text-xs space-y-1 text-slate-300 bg-slate-900/40 p-2.5 rounded border border-slate-800">
                    <div>Highest Education: <strong>{selectedRecord.highestEducation || 'None'}</strong></div>
                    <div>Vocational Qual: <strong>{selectedRecord.highestVocational || 'None'}</strong></div>
                    <div>Interested Stream: <strong>{selectedRecord.interestedVocationalStream || 'None'}</strong></div>
                    <div>Interested Job: <strong>{selectedRecord.interestedJob || 'None'}</strong></div>
                  </div>
                </div>

                <div>
                  <span className="text-xs text-slate-400 block mb-1">Audit Metadata</span>
                  <div className="text-xs text-slate-400 space-y-0.5">
                    <div>Created At: {formatDate(selectedRecord.createdAt)}</div>
                    <div>Last Updated: {formatDate(selectedRecord.updatedAt)}</div>
                    <div>Collector: {selectedRecord.collector?.fullName || selectedRecord.collector?.userCode || 'System'}</div>
                  </div>
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-800">
                <button
                  onClick={() => {
                    const rec = selectedRecord;
                    setSelectedRecord(null);
                    openEditModal(rec);
                  }}
                  className="btn btn-primary text-xs flex items-center gap-1.5"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  Supervisor Correction
                </button>
                <button
                  onClick={() => setSelectedRecord(null)}
                  className="btn btn-secondary text-xs"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Supervisor Edit Modal with Mandatory Audit Reason */}
        {editingRecord && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="card max-w-xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-amber-400" />
                  {t('records.edit_record')}
                </h2>
                <button
                  onClick={() => setEditingRecord(null)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {auditError && (
                <div className="card border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                  <span>{auditError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div className="md:col-span-2">
                  <label className="text-xs text-slate-400 block mb-1">Full Name *</label>
                  <input
                    type="text"
                    className="input"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Age *</label>
                  <input
                    type="number"
                    className="input"
                    min={1}
                    max={120}
                    value={editAge}
                    onChange={(e) => setEditAge(parseInt(e.target.value, 10) || 18)}
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Gender *</label>
                  <select
                    className="input"
                    value={editGender}
                    onChange={(e) => setEditGender(e.target.value)}
                  >
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs text-slate-400 block mb-1">Address</label>
                  <input
                    type="text"
                    className="input"
                    value={editAddress}
                    onChange={(e) => setEditAddress(e.target.value)}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs text-slate-400 block mb-1">Phone Number</label>
                  <input
                    type="text"
                    className="input"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                  />
                </div>

                <div className="md:col-span-2 space-y-2 pt-2 border-t border-slate-800">
                  <span className="text-xs text-slate-400 block">Welfare & Social Indicators</span>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                      <input
                        type="checkbox"
                        checked={editIsEpf}
                        onChange={(e) => setEditIsEpf(e.target.checked)}
                      />
                      EPF/ETF Contributor
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                      <input
                        type="checkbox"
                        checked={editIsAswesuma}
                        onChange={(e) => setEditIsAswesuma(e.target.checked)}
                      />
                      Aswesuma Beneficiary
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                      <input
                        type="checkbox"
                        checked={editIsSamurdhi}
                        onChange={(e) => setEditIsSamurdhi(e.target.checked)}
                      />
                      Samurdhi Beneficiary
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                      <input
                        type="checkbox"
                        checked={editHasSpecialNeeds}
                        onChange={(e) => setEditHasSpecialNeeds(e.target.checked)}
                      />
                      Has Special Needs
                    </label>
                  </div>
                </div>

                {/* Mandatory Audit Reason Input (Decision C2 / Invariant §8) */}
                <div className="md:col-span-2 pt-2 border-t border-slate-800">
                  <label className="text-xs font-semibold text-amber-400 block mb-1 flex items-center gap-1">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    {t('records.audit_reason')} *
                  </label>
                  <textarea
                    rows={3}
                    className="input text-xs"
                    placeholder="Enter reason for modifying this survey record (e.g. Corrected spelling per verified national ID)"
                    value={auditReason}
                    onChange={(e) => setAuditReason(e.target.value)}
                  />
                  <span className="text-[11px] text-slate-500 mt-1 block">
                    This reason is permanently recorded in the immutable audit log under your user identity.
                  </span>
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingRecord(null)}
                  className="btn btn-secondary text-xs"
                  disabled={savingAudit}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveAudit}
                  disabled={savingAudit}
                  className="btn btn-primary text-xs flex items-center gap-1.5"
                >
                  {savingAudit ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-3.5 h-3.5" />
                      {t('records.save_audit')}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}
