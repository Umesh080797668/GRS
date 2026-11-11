'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Shell from '../../components/Shell';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import {
  MapPin,
  ArrowRightLeft,
  XCircle,
  RefreshCw,
  Search,
  AlertCircle,
  CheckCircle,
  Loader2,
  Clock,
  X,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Assignment {
  id: string;
  profileId: string;
  validFrom: string;
  validTo: string | null;
  note: string | null;
  profile: { id: string; userCode: string; fullName: string; role: string };
  district: { id: string; nameEn: string } | null;
  ds: { id: string; nameEn: string } | null;
  gn: { id: string; gnName: string; gnNumber: string } | null;
  team: { id: string; teamNo: number } | null;
  assignedByProfile: { id: string; userCode: string; fullName: string };
  endedByProfile?: { id: string; userCode: string; fullName: string } | null;
}

// ── Role label helper ─────────────────────────────────────────────────────────

function roleLabel(role: string) {
  const map: Record<string, string> = {
    super_admin: 'Super Admin',
    admin: 'Admin',
    cg: 'CG (L1)',
    dc: 'DC (L2)',
    sda: 'SDA (L3)',
    cdc_secretary: 'CDC Secretary (L4)',
    team_member: 'Team Member (L5)',
  };
  return map[role] ?? role;
}

function formatDate(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function territoryLabel(a: Assignment) {
  if (a.gn) return `GN ${a.gn.gnNumber} — ${a.gn.gnName}`;
  if (a.ds) return `DS: ${a.ds.nameEn}`;
  if (a.district) return `District: ${a.district.nameEn}`;
  if (a.team) return `Team ${a.team.teamNo}`;
  return '—';
}

// ── Assign/Transfer dialog ────────────────────────────────────────────────────

interface AssignDialogProps {
  profile: Assignment['profile'] | null;
  districts: any[];
  dsDivisions: any[];
  gnDivisions: any[];
  teams: any[];
  onClose: () => void;
  onDsChange: (dsId: string) => void;
  onGnChange: (gnId: string) => void;
  onSubmit: (territory: { districtId?: string; dsId?: string; gnId?: string; teamId?: string; note?: string }) => Promise<void>;
  submitting: boolean;
  error: string | null;
}

function AssignDialog({
  profile, districts, dsDivisions, gnDivisions, teams,
  onClose, onDsChange, onGnChange, onSubmit, submitting, error,
}: AssignDialogProps) {
  const [level, setLevel] = useState<'district' | 'ds' | 'gn' | 'team'>('gn');
  const [districtId, setDistrictId] = useState('');
  const [dsId, setDsId] = useState('');
  const [gnId, setGnId] = useState('');
  const [teamId, setTeamId] = useState('');
  const [note, setNote] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const territory: any = { note: note.trim() || undefined };
    if (level === 'district') territory.districtId = districtId;
    else if (level === 'ds') territory.dsId = dsId;
    else if (level === 'gn') territory.gnId = gnId;
    else if (level === 'team') territory.teamId = teamId;
    await onSubmit(territory);
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-content" style={{ maxWidth: '480px' }}>
        <div className="modal-header">
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--slate-900)' }}>
              {profile?.role === 'cdc_secretary' ? 'Add GN / Assign Territory' : 'Assign Territory'}
            </h3>
            {profile && (
              <p style={{ fontSize: '12px', color: 'var(--slate-500)', marginTop: '3px' }}>
                {profile.fullName} · {profile.userCode} · {roleLabel(profile.role)}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate-400)' }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {profile?.role === 'cdc_secretary' && (
              <div style={{ background: 'var(--primary-subtle)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '9px 12px', color: 'var(--slate-700)', fontSize: '12.5px', lineHeight: 1.4 }}>
                CDC Secretaries can hold multiple GN divisions simultaneously. Assigning a new GN division adds it without ending their other active GN assignments.
              </div>
            )}
            {error && (
              <div style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', color: 'var(--danger-text)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                <span>{error}</span>
              </div>
            )}
            {/* Level picker */}
            <div>
              <label className="form-label">Territory level *</label>
              <select value={level} onChange={(e) => setLevel(e.target.value as any)} className="select-field">
                <option value="gn">GN Division</option>
                <option value="team">Team (within GN)</option>
                <option value="ds">DS Division</option>
                <option value="district">District</option>
              </select>
            </div>

            {level === 'district' && (
              <div>
                <label className="form-label">District *</label>
                <select value={districtId} onChange={(e) => setDistrictId(e.target.value)} className="select-field" required>
                  <option value="">Select district…</option>
                  {districts.map((d) => <option key={d.id} value={d.id}>{d.nameEn || d.name_en}</option>)}
                </select>
              </div>
            )}

            {level === 'ds' && (
              <div>
                <label className="form-label">DS Division *</label>
                <select value={dsId} onChange={(e) => { setDsId(e.target.value); onDsChange(e.target.value); }} className="select-field" required>
                  <option value="">Select DS division…</option>
                  {dsDivisions.map((d) => <option key={d.id} value={d.id}>{d.nameEn || d.name_en}</option>)}
                </select>
              </div>
            )}

            {(level === 'gn' || level === 'team') && (
              <>
                <div>
                  <label className="form-label">DS Division (to filter GNs) *</label>
                  <select value={dsId} onChange={(e) => { setDsId(e.target.value); onDsChange(e.target.value); setGnId(''); setTeamId(''); }} className="select-field">
                    <option value="">All DS divisions</option>
                    {dsDivisions.map((d) => <option key={d.id} value={d.id}>{d.nameEn || d.name_en}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">GN Division *</label>
                  <select value={gnId} onChange={(e) => { setGnId(e.target.value); onGnChange(e.target.value); setTeamId(''); }} className="select-field" required>
                    <option value="">Select GN division…</option>
                    {gnDivisions.map((g) => <option key={g.id} value={g.id}>{g.gnNumber} — {g.gnName || g.gn_name}</option>)}
                  </select>
                </div>
              </>
            )}

            {level === 'team' && (
              <div>
                <label className="form-label">Team *</label>
                <select value={teamId} onChange={(e) => setTeamId(e.target.value)} className="select-field" required>
                  <option value="">Select team…</option>
                  {teams.map((t) => <option key={t.id} value={t.id}>Team {t.teamNo}</option>)}
                </select>
              </div>
            )}

            <div>
              <label className="form-label">Note (optional)</label>
              <input type="text" className="input-field" placeholder="e.g. Temporary reassignment for census month" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={submitting} className="btn-primary">
              {submitting ? <Loader2 size={16} className="animate-spin" /> : 'Assign Territory'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Transfer dialog ───────────────────────────────────────────────────────────

interface TransferDialogProps {
  fromProfile: Assignment['profile'] | null;
  currentTerritory: string;
  accounts: any[];
  onClose: () => void;
  onSubmit: (toProfileId: string, note: string) => Promise<void>;
  submitting: boolean;
  error: string | null;
}

function TransferDialog({ fromProfile, currentTerritory, accounts, onClose, onSubmit, submitting, error }: TransferDialogProps) {
  const [toProfileId, setToProfileId] = useState('');
  const [note, setNote] = useState('');
  const [search, setSearch] = useState('');

  const filtered = accounts.filter((a) => {
    if (a.id === fromProfile?.id) return false;
    const q = search.toLowerCase();
    return !q || (a.fullName || '').toLowerCase().includes(q) || (a.userCode || '').toLowerCase().includes(q);
  });

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-content" style={{ maxWidth: '480px' }}>
        <div className="modal-header">
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--slate-900)' }}>
              Transfer Assignment
            </h3>
            {fromProfile && (
              <p style={{ fontSize: '12px', color: 'var(--slate-500)', marginTop: '3px' }}>
                From: {fromProfile.fullName} → <strong>{currentTerritory}</strong>
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate-400)' }}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {error && (
            <div style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', color: 'var(--danger-text)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}
          <div>
            <label className="form-label">Transfer to *</label>
            <div style={{ position: 'relative', marginBottom: '8px' }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--slate-400)' }} />
              <input type="text" className="input-field" placeholder="Search by name or code…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ paddingLeft: '32px' }} />
            </div>
            <select value={toProfileId} onChange={(e) => setToProfileId(e.target.value)} className="select-field" required size={5} style={{ height: '130px' }}>
              <option value="">— select recipient —</option>
              {filtered.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.fullName || a.full_name} ({a.userCode || a.user_code}) · {roleLabel(a.role)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="form-label">Note (optional)</label>
            <input type="text" className="input-field" placeholder="Reason for transfer" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="button" disabled={submitting || !toProfileId} className="btn-primary" onClick={() => onSubmit(toProfileId, note)}>
            {submitting ? <Loader2 size={16} className="animate-spin" /> : 'Transfer'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── History panel ─────────────────────────────────────────────────────────────

interface HistoryPanelProps {
  profileId: string;
  profileName: string;
  onClose: () => void;
}

function HistoryPanel({ profileId, profileName, onClose }: HistoryPanelProps) {
  const [history, setHistory] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.getProfileAssignmentHistory(profileId)
      .then((res) => setHistory(res.items || []))
      .catch(() => setHistory([]))
      .finally(() => setLoading(false));
  }, [profileId]);

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-content" style={{ maxWidth: '600px' }}>
        <div className="modal-header">
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--slate-900)' }}>
              Assignment History
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--slate-500)', marginTop: '3px' }}>{profileName}</p>
          </div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate-400)' }}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem' }}><Loader2 size={24} className="animate-spin" style={{ color: 'var(--primary)' }} /></div>
          ) : history.length === 0 ? (
            <p style={{ color: 'var(--slate-400)', textAlign: 'center', padding: '1.5rem' }}>No assignment history found.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {history.map((h) => (
                <div key={h.id} style={{
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-subtle)',
                  background: h.validTo === null ? 'var(--primary-subtle)' : 'var(--slate-50)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <MapPin size={14} style={{ color: h.validTo === null ? 'var(--primary)' : 'var(--slate-400)', flexShrink: 0 }} />
                      <span style={{ fontWeight: 600, fontSize: '13.5px', color: 'var(--slate-900)' }}>
                        {territoryLabel(h)}
                      </span>
                      {h.team && <span style={{ fontSize: '11px', color: 'var(--slate-500)' }}>· Team {h.team.teamNo}</span>}
                      {h.validTo === null && (
                        <span className="badge badge-success" style={{ fontSize: '10px' }}>active</span>
                      )}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--slate-500)', textAlign: 'right', flexShrink: 0 }}>
                      <div>{formatDate(h.validFrom)}</div>
                      {h.validTo && <div>→ {formatDate(h.validTo)}</div>}
                    </div>
                  </div>
                  {h.note && (
                    <p style={{ fontSize: '11.5px', color: 'var(--slate-500)', margin: '6px 0 0 22px' }}>
                      {h.note}
                    </p>
                  )}
                  <div style={{ fontSize: '11px', color: 'var(--slate-400)', marginTop: '4px', marginLeft: '22px' }}>
                    Assigned by {h.assignedByProfile.fullName}
                    {h.endedByProfile && ` · Ended by ${h.endedByProfile.fullName}`}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="modal-footer" style={{ justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} className="btn-secondary">Close</button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AssignmentsPage() {
  const { user } = useAuth();

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [districts, setDistricts] = useState<any[]>([]);
  const [dsDivisions, setDsDivisions] = useState<any[]>([]);
  const [gnDivisions, setGnDivisions] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');

  // Dialogs
  const [assignTarget, setAssignTarget] = useState<Assignment['profile'] | null>(null);
  const [transferFrom, setTransferFrom] = useState<Assignment | null>(null);
  const [historyFor, setHistoryFor] = useState<{ id: string; name: string } | null>(null);

  const isAdmin = ['super_admin', 'admin', 'cg', 'dc', 'sda'].includes(user?.role ?? '');

  const flash = (msg: string, isError = false) => {
    if (isError) setError(msg);
    else setSuccess(msg);
    setTimeout(() => { setError(null); setSuccess(null); }, 5000);
  };

  const fetchAssignments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getAccountAssignments({ status: 'active' });
      setAssignments(res.items || []);
      setError(null);
    } catch (e: any) {
      setError(e.message || 'Failed to load assignments.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAssignments();
    api.getDistricts().then(setDistricts).catch(() => { });
    api.getDsDivisions().then(setDsDivisions).catch(() => { });
    api.getGnDivisions().then(setGnDivisions).catch(() => { });
    api.getTeams().then(setTeams).catch(() => { });

    let cancelled = false;
    (async () => {
      try {
        const collected: any[] = [];
        let cursor: string | undefined;
        for (let page = 0; page < 5; page++) {
          const res = await api.getAccounts({ limit: 100, cursor });
          const items = res?.items || [];
          collected.push(...items);
          cursor = res?.nextCursor;
          if (!cursor || items.length < 100) break;
        }
        if (!cancelled) setAccounts(collected);
      } catch {
        // Ignore background pre-fetch failure; user sees assignment list above.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fetchAssignments]);

  const handleDsChange = async (dsId: string) => {
    const gns = await api.getGnDivisions(dsId || undefined).catch(() => []);
    setGnDivisions(gns);
    const ts = await api.getTeams().catch(() => []);
    setTeams(ts);
  };

  const handleGnChange = async (gnId: string) => {
    if (!gnId) return;
    const ts = await api.getTeams(gnId).catch(() => []);
    setTeams(ts);
  };

  const handleAssign = async (territory: any) => {
    if (!assignTarget) return;
    setSubmitting(true);
    setModalError(null);
    try {
      await api.assignAccount(assignTarget.id, territory);
      flash(`Territory assigned to ${assignTarget.fullName}.`);
      setAssignTarget(null);
      fetchAssignments();
    } catch (e: any) {
      setModalError(e.message || 'Assignment failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEndAssignment = async (assignment: Assignment) => {
    const label = territoryLabel(assignment);
    const activeCount = assignments.filter((row) => row.profileId === assignment.profileId).length;
    const message =
      activeCount > 1
        ? `End assignment "${label}" for ${assignment.profile.fullName}? Their other ${activeCount - 1} active assignment(s) will remain active.`
        : `End the active assignment "${label}" for ${assignment.profile.fullName}? They will see nothing until reassigned.`;
    if (!confirm(message)) return;
    try {
      await api.endAccountAssignment(assignment.profileId, assignment.id);
      flash(`Assignment (${label}) ended for ${assignment.profile.fullName}.`);
      fetchAssignments();
    } catch (e: any) {
      flash(e.message || 'Could not end assignment.', true);
    }
  };

  const handleTransfer = async (toProfileId: string, note: string) => {
    if (!transferFrom) return;
    setSubmitting(true);
    setModalError(null);
    try {
      await api.transferAccountAssignment(transferFrom.profileId, {
        toProfileId,
        assignmentId: transferFrom.id,
        note: note || undefined,
      });
      flash(`Assignment (${territoryLabel(transferFrom)}) transferred from ${transferFrom.profile.fullName}.`);
      setTransferFrom(null);
      fetchAssignments();
    } catch (e: any) {
      setModalError(e.message || 'Transfer failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const activeCountByProfile = new Map<string, number>();
  for (const a of assignments) {
    activeCountByProfile.set(a.profileId, (activeCountByProfile.get(a.profileId) ?? 0) + 1);
  }

  const filtered = assignments.filter((a) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (a.profile.fullName || '').toLowerCase().includes(q) ||
      (a.profile.userCode || '').toLowerCase().includes(q) ||
      territoryLabel(a).toLowerCase().includes(q)
    );
  });

  if (!isAdmin) {
    return (
      <Shell>
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--slate-500)' }}>
          <AlertCircle size={32} style={{ marginBottom: '1rem', color: 'var(--danger)' }} />
          <p>You do not have permission to manage assignments.</p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--slate-900)', letterSpacing: '-0.02em', margin: 0 }}>
            Territory Assignments
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--slate-500)', marginTop: '4px' }}>
            Assign, transfer, or end territorial assignments. All changes immediately revoke stale sessions.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button type="button" onClick={() => fetchAssignments()} className="btn-secondary" title="Refresh">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 'var(--radius-sm)', padding: '12px 16px', color: 'var(--danger-text)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13.5px' }}>
          <AlertCircle size={18} style={{ flexShrink: 0 }} />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div style={{ background: 'var(--success-bg)', border: '1px solid var(--success-border)', borderRadius: 'var(--radius-sm)', padding: '12px 16px', color: 'var(--success-text)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13.5px' }}>
          <CheckCircle size={18} style={{ flexShrink: 0 }} />
          <span>{success}</span>
        </div>
      )}

      {/* Toolbar */}
      <div className="panel" style={{ padding: '0.875rem 1.25rem', marginBottom: '1.5rem', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
          <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--slate-400)' }} />
          <input
            type="text"
            className="input-field"
            placeholder="Search by name, code or territory…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ paddingLeft: '32px' }}
          />
        </div>
        <div style={{ fontSize: '12px', color: 'var(--slate-400)', whiteSpace: 'nowrap' }}>
          {filtered.length} active assignment{filtered.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Assign unassigned accounts shortcut */}
      <div className="panel" style={{ padding: '0.875rem 1.25rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <p style={{ fontWeight: 600, fontSize: '13.5px', color: 'var(--slate-900)', margin: 0 }}>Assign an account</p>
            <p style={{ fontSize: '12px', color: 'var(--slate-500)', margin: '3px 0 0 0' }}>
              Search for any account to open the assign dialog directly.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <select
              className="select-field"
              style={{ minWidth: '280px' }}
              onChange={(e) => {
                const acc = accounts.find((a) => a.id === e.target.value);
                if (acc) {
                  setModalError(null);
                  handleDsChange('');
                  setAssignTarget({ id: acc.id, userCode: acc.userCode || acc.user_code, fullName: acc.fullName || acc.full_name, role: acc.role });
                }
                e.target.value = '';
              }}
              defaultValue=""
            >
              <option value="">Select account to assign…</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.fullName || a.full_name} ({a.userCode || a.user_code}) · {roleLabel(a.role)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Assignments table */}
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Account</th>
              <th>Role</th>
              <th>Territory</th>
              <th>Team</th>
              <th style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={13} /> Since</th>
              <th>Assigned by</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', color: 'var(--slate-400)', padding: '2.5rem' }}>
                  {loading ? 'Loading assignments…' : 'No active assignments found.'}
                </td>
              </tr>
            ) : (
              filtered.map((a) => (
                <tr key={a.id}>
                  <td>
                    <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--slate-900)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>{a.profile.fullName}</span>
                      {(activeCountByProfile.get(a.profileId) ?? 0) > 1 && (
                        <span className="badge badge-info" style={{ fontSize: '10px' }}>
                          {activeCountByProfile.get(a.profileId)} active
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--primary)' }}>{a.profile.userCode}</div>
                  </td>
                  <td>
                    <span className="badge badge-neutral" style={{ textTransform: 'uppercase', fontSize: '10px' }}>
                      {roleLabel(a.profile.role)}
                    </span>
                  </td>
                  <td style={{ fontWeight: 500, fontSize: '13px', color: 'var(--slate-700)' }}>
                    {territoryLabel(a)}
                  </td>
                  <td style={{ fontSize: '12.5px', color: 'var(--slate-500)' }}>
                    {a.team ? `Team ${a.team.teamNo}` : '—'}
                  </td>
                  <td style={{ fontSize: '12px', color: 'var(--slate-500)' }}>{formatDate(a.validFrom)}</td>
                  <td style={{ fontSize: '12px', color: 'var(--slate-500)' }}>{a.assignedByProfile.fullName}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                      {/* History */}
                      <button
                        type="button"
                        title="View assignment history"
                        className="btn-secondary"
                        style={{ padding: '5px 8px', fontSize: '11px' }}
                        onClick={() => setHistoryFor({ id: a.profileId, name: a.profile.fullName })}
                      >
                        <Clock size={13} />
                      </button>

                      {/* Reassign / Add GN (opens assign dialog) */}
                      <button
                        type="button"
                        title={a.profile.role === 'cdc_secretary' ? 'Add GN / assign territory' : 'Reassign territory'}
                        className="btn-secondary"
                        style={{ padding: '5px 8px', fontSize: '11px' }}
                        onClick={() => { setModalError(null); handleDsChange(''); setAssignTarget(a.profile); }}
                      >
                        <MapPin size={13} />
                      </button>

                      {/* Transfer */}
                      <button
                        type="button"
                        title="Transfer to another account"
                        className="btn-secondary"
                        style={{ padding: '5px 8px', fontSize: '11px' }}
                        onClick={() => { setModalError(null); setTransferFrom(a); }}
                      >
                        <ArrowRightLeft size={13} />
                      </button>

                      {/* End assignment */}
                      <button
                        type="button"
                        title="End assignment (removes territory access)"
                        className="btn-danger"
                        style={{ padding: '5px 8px', fontSize: '11px' }}
                        onClick={() => handleEndAssignment(a)}
                      >
                        <XCircle size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modals */}
      {assignTarget && (
        <AssignDialog
          profile={assignTarget}
          districts={districts}
          dsDivisions={dsDivisions}
          gnDivisions={gnDivisions}
          teams={teams}
          onClose={() => { setAssignTarget(null); setModalError(null); }}
          onDsChange={handleDsChange}
          onGnChange={handleGnChange}
          onSubmit={handleAssign}
          submitting={submitting}
          error={modalError}
        />
      )}

      {transferFrom && (
        <TransferDialog
          fromProfile={transferFrom.profile}
          currentTerritory={territoryLabel(transferFrom)}
          accounts={accounts}
          onClose={() => { setTransferFrom(null); setModalError(null); }}
          onSubmit={handleTransfer}
          submitting={submitting}
          error={modalError}
        />
      )}

      {historyFor && (
        <HistoryPanel
          profileId={historyFor.id}
          profileName={historyFor.name}
          onClose={() => setHistoryFor(null)}
        />
      )}
    </Shell>
  );
}

