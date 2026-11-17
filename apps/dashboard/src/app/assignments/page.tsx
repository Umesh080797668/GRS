'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import Shell from '../../components/Shell';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import { useLanguage } from '../../context/LanguageContext';
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
  Users,
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
    sda: 'SDA Officer (L3)',
    cdc_secretary: 'CDC Secretary (L4)',
    team_member: 'Team Member (L5)',
  };
  return map[role] ?? role;
}

function formatDate(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', {
    timeZone: 'Asia/Colombo',
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
  callerRole?: string;
  callerDsId?: string | null;
  onClose: () => void;
  onDsChange: (dsId: string) => void;
  onGnChange: (gnId: string) => void;
  onSubmit: (territory: { districtId?: string; dsId?: string; gnId?: string; teamId?: string; note?: string }) => Promise<void>;
  submitting: boolean;
  error: string | null;
}

function AssignDialog({
  profile, districts, dsDivisions, gnDivisions, teams,
  callerRole, callerDsId,
  onClose, onDsChange, onGnChange, onSubmit, submitting, error,
}: AssignDialogProps) {
  const { t } = useLanguage();
  const isSdo = callerRole === 'sda';
  const isDc = callerRole === 'dc';
  const defaultLevel: 'district' | 'ds' | 'gn' | 'team' =
    profile?.role === 'dc' && !isSdo && !isDc
      ? 'district'
      : profile?.role === 'sda' && !isSdo
        ? 'ds'
        : profile?.role === 'team_member'
          ? 'team'
          : 'gn';
  const [level, setLevel] = useState<'district' | 'ds' | 'gn' | 'team'>(defaultLevel);
  const [districtId, setDistrictId] = useState('');
  const [dsId, setDsId] = useState(isSdo ? (callerDsId || dsDivisions[0]?.id || '') : '');
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
              {profile?.role === 'cdc_secretary' ? 'Add GN / Assign Territory' : t('assignments.title')}
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
              <label className="form-label">{t('assignments.territory_level')} *</label>
              <select value={level} onChange={(e) => setLevel(e.target.value as any)} className="select-field">
                <option value="gn">{t('assignments.level_gn')}</option>
                <option value="team">{t('assignments.level_team')}</option>
                {!isSdo && <option value="ds">{t('assignments.level_ds')}</option>}
                {!isSdo && !isDc && <option value="district">{t('assignments.level_district')}</option>}
              </select>
            </div>

            {level === 'district' && (
              <div>
                <label className="form-label">{t('assignments.level_district')} *</label>
                <select value={districtId} onChange={(e) => setDistrictId(e.target.value)} className="select-field" required>
                  <option value="">{t('assignments.select_district')}</option>
                  {districts.map((d) => <option key={d.id} value={d.id}>{d.nameEn || d.name_en}</option>)}
                </select>
              </div>
            )}

            {level === 'ds' && (
              <div>
                <label className="form-label">{t('assignments.level_ds')} *</label>
                <select value={dsId} onChange={(e) => { setDsId(e.target.value); onDsChange(e.target.value); }} className="select-field" required>
                  <option value="">{t('assignments.select_ds')}</option>
                  {dsDivisions.map((d) => <option key={d.id} value={d.id}>{d.nameEn || d.name_en}</option>)}
                </select>
              </div>
            )}

            {(level === 'gn' || level === 'team') && (
              <>
                <div>
                  <label className="form-label">{t('assignments.level_ds')}</label>
                  <select
                    value={dsId}
                    onChange={(e) => { setDsId(e.target.value); onDsChange(e.target.value); setGnId(''); setTeamId(''); }}
                    disabled={isSdo}
                    className="select-field"
                  >
                    {!isSdo && <option value="">{t('assignments.all_ds')}</option>}
                    {dsDivisions.map((d) => <option key={d.id} value={d.id}>{d.nameEn || d.name_en}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">{t('assignments.level_gn')} *</label>
                  <select value={gnId} onChange={(e) => { setGnId(e.target.value); onGnChange(e.target.value); setTeamId(''); }} className="select-field" required>
                    <option value="">{t('assignments.select_gn')}</option>
                    {gnDivisions.map((g) => <option key={g.id} value={g.id}>{g.gnNumber} — {g.gnName || g.gn_name}</option>)}
                  </select>
                </div>
              </>
            )}

            {level === 'team' && (
              <div>
                <label className="form-label">{t('assignments.col_team')} *</label>
                <select value={teamId} onChange={(e) => setTeamId(e.target.value)} className="select-field" required>
                  <option value="">{t('assignments.select_team')}</option>
                  {(gnId ? teams.filter((t) => (t.gnId || t.gn_id) === gnId) : teams).map((t) => (
                    <option key={t.id} value={t.id}>Team {t.teamNo}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="form-label">{t('assignments.note_optional')}</label>
              <input type="text" className="input-field" placeholder="e.g. Temporary reassignment for census month" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" onClick={onClose} className="btn-secondary">{t('common.cancel')}</button>
            <button type="submit" disabled={submitting} className="btn-primary">
              {submitting ? <Loader2 size={16} className="animate-spin" /> : t('assignments.title')}
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
  const { t } = useLanguage();
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
            <label className="form-label">{t('assignments.transfer_to')} *</label>
            <div style={{ position: 'relative', marginBottom: '8px' }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--slate-400)' }} />
              <input type="text" className="input-field" placeholder="Search by name or code…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ paddingLeft: '32px' }} />
            </div>
            <select value={toProfileId} onChange={(e) => setToProfileId(e.target.value)} className="select-field" required size={5} style={{ height: '130px' }}>
              <option value="">{t('assignments.select_recipient')}</option>
              {filtered.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.fullName || a.full_name} ({a.userCode || a.user_code}) · {roleLabel(a.role)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="form-label">{t('assignments.note_optional')}</label>
            <input type="text" className="input-field" placeholder="Reason for transfer" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" onClick={onClose} className="btn-secondary">{t('common.cancel')}</button>
          <button type="button" disabled={submitting || !toProfileId} className="btn-primary" onClick={() => onSubmit(toProfileId, note)}>
            {submitting ? <Loader2 size={16} className="animate-spin" /> : t('assignments.transfer_assignment')}
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
  const { t } = useLanguage();
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
            <p style={{ color: 'var(--slate-400)', textAlign: 'center', padding: '1.5rem' }}>{t('assignments.no_history')}</p>
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
          <button type="button" onClick={onClose} className="btn-secondary">{t('common.close')}</button>
        </div>
      </div>
    </div>
  );
}

// ── Bulk assign dialog ────────────────────────────────────────────────────────

type BulkLevel = 'district' | 'ds' | 'gn' | 'team';
type TerrLevel = 'district' | 'ds' | 'gn';
type BulkMode = 'territories' | 'accounts';

const BULK_FIELD_ROLES = ['dc', 'sda', 'cdc_secretary', 'team_member'];
const BULK_LEVEL_ROLE: Record<BulkLevel, string> = {
  district: 'dc',
  ds: 'sda',
  gn: 'cdc_secretary',
  team: 'team_member',
};
const TERR_FIELD: Record<TerrLevel, 'districtId' | 'dsId' | 'gnId'> = {
  district: 'districtId',
  ds: 'dsId',
  gn: 'gnId',
};

function bulkManageableRoles(callerRole?: string): string[] {
  if (callerRole === 'sda') return ['cdc_secretary', 'team_member'];
  if (callerRole === 'dc') return ['sda', 'cdc_secretary', 'team_member'];
  return BULK_FIELD_ROLES;
}

const accName = (a: any): string => a.fullName || a.full_name || '';
const accCode = (a: any): string => a.userCode || a.user_code || '';

interface BulkAssignDialogProps {
  accounts: any[];
  assignments: Assignment[];
  districts: any[];
  dsDivisions: any[];
  gnDivisions: any[];
  teams: any[];
  callerRole?: string;
  callerDistrictId?: string | null;
  callerDsId?: string | null;
  onClose: () => void;
  onDsChange: (dsId: string) => void;
  onGnChange: (gnId: string) => void;
  onFinished: (summary: { ok: number; failed: number }) => void;
}

function BulkAssignDialog({
  accounts, assignments, districts, dsDivisions, gnDivisions, teams,
  callerRole, callerDistrictId, callerDsId,
  onClose, onDsChange, onGnChange, onFinished,
}: BulkAssignDialogProps) {
  const { t } = useLanguage();
  const isSdo = callerRole === 'sda';
  const isDc = callerRole === 'dc';
  const allowedRoles = bulkManageableRoles(callerRole);

  const [mode, setMode] = useState<BulkMode>('territories');
  const [note, setNote] = useState('');

  // ── Mode "territories": each GN / DS / district gets its own account ──
  const [tLevel, setTLevel] = useState<TerrLevel>('gn');
  const [tDistrictId, setTDistrictId] = useState(isSdo || isDc ? callerDistrictId || '' : '');
  const [tDsId, setTDsId] = useState(isSdo ? callerDsId || '' : '');
  const [tRole, setTRole] = useState<string>(BULK_LEVEL_ROLE.gn);
  const [assignee, setAssignee] = useState<Record<string, string>>({});
  const [fillAccountId, setFillAccountId] = useState('');

  // ── Mode "accounts": many accounts -> one territory ──
  const [level, setLevel] = useState<BulkLevel>('team');
  const [districtId, setDistrictId] = useState('');
  const [dsId, setDsId] = useState(isSdo ? (callerDsId || dsDivisions[0]?.id || '') : '');
  const [gnId, setGnId] = useState('');
  const [teamId, setTeamId] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>(BULK_LEVEL_ROLE.team);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [failures, setFailures] = useState<{ id: string; name: string; message: string }[]>([]);
  const [okCount, setOkCount] = useState<number | null>(null);

  const activeByProfile = useMemo(() => {
    const m = new Map<string, Assignment[]>();
    for (const a of assignments) {
      const list = m.get(a.profileId) ?? [];
      list.push(a);
      m.set(a.profileId, list);
    }
    return m;
  }, [assignments]);

  const resetResult = () => {
    setFailures([]);
    setOkCount(null);
  };

  const currentText = (accId: string): string => {
    const rows = activeByProfile.get(accId) ?? [];
    if (rows.length === 0) return t('assignments.bulk_unassigned');
    return rows.map((r) => territoryLabel(r)).join(', ');
  };

  // ════════════════════════ territories mode ════════════════════════
  const holdersFor = (lvl: TerrLevel, id: string): Assignment[] =>
    assignments.filter((a) => {
      if (lvl === 'gn') return a.gn?.id === id && !a.team;
      if (lvl === 'ds') return a.ds?.id === id && !a.gn && !a.team;
      return a.district?.id === id && !a.ds && !a.gn && !a.team;
    });

  const hasDsField = gnDivisions.some((g) => g.dsId || g.ds_id);
  const hasDistrictField = dsDivisions.some((d) => d.districtId || d.district_id);
  const dsInDistrict = dsDivisions.filter(
    (d) => !tDistrictId || !hasDistrictField || (d.districtId ?? d.district_id) === tDistrictId,
  );

  type TerrRow = { id: string; label: string; holders: Assignment[] };
  let rows: TerrRow[] = [];
  if (tLevel === 'gn' && tDsId) {
    rows = gnDivisions
      .filter((g) => !hasDsField || (g.dsId ?? g.ds_id) === tDsId)
      .map((g) => ({
        id: g.id,
        label: `${g.gnNumber} — ${g.gnName || g.gn_name || ''}`,
        holders: holdersFor('gn', g.id),
      }));
  } else if (tLevel === 'ds' && tDistrictId) {
    rows = dsDivisions
      .filter((d) => !hasDistrictField || (d.districtId ?? d.district_id) === tDistrictId)
      .map((d) => ({ id: d.id, label: d.nameEn || d.name_en || '', holders: holdersFor('ds', d.id) }));
  } else if (tLevel === 'district') {
    rows = districts.map((d) => ({ id: d.id, label: d.nameEn || d.name_en || '', holders: holdersFor('district', d.id) }));
  }

  const rowAccounts = accounts.filter(
    (a) => allowedRoles.includes(a.role) && (tRole === 'all' || a.role === tRole),
  );

  const pendingRows = rows.filter((r) => {
    const acc = assignee[r.id];
    return Boolean(acc) && !r.holders.some((h) => h.profileId === acc);
  });

  const pickedCount = new Map<string, number>();
  for (const r of pendingRows) pickedCount.set(assignee[r.id], (pickedCount.get(assignee[r.id]) ?? 0) + 1);
  const duplicateAccount = pendingRows.some((r) => {
    const accId = assignee[r.id];
    if ((pickedCount.get(accId) ?? 0) < 2) return false;
    const acc = accounts.find((a) => a.id === accId);
    return !(tLevel === 'gn' && acc?.role === 'cdc_secretary');
  });

  const changeTLevel = (next: TerrLevel) => {
    setTLevel(next);
    setTRole(BULK_LEVEL_ROLE[next]);
    setAssignee({});
    resetResult();
  };

  const changeTDistrict = (id: string) => {
    setTDistrictId(id);
    setTDsId('');
    setAssignee({});
    resetResult();
  };

  const changeTDs = (id: string) => {
    setTDsId(id);
    setAssignee({});
    resetResult();
    onDsChange(id);
  };

  const setRowAssignee = (rowId: string, accId: string) => {
    setAssignee((prev) => ({ ...prev, [rowId]: accId }));
    resetResult();
  };

  const fillEmptyWith = () => {
    if (!fillAccountId) return;
    setAssignee((prev) => {
      const next = { ...prev };
      for (const r of rows) {
        if (!next[r.id] && !r.holders.some((h) => h.profileId === fillAccountId)) next[r.id] = fillAccountId;
      }
      return next;
    });
    resetResult();
  };

  const fillFromUnassigned = () => {
    const used = new Set(Object.values(assignee).filter(Boolean));
    const candidates = rowAccounts.filter((a) => (activeByProfile.get(a.id) ?? []).length === 0 && !used.has(a.id));
    setAssignee((prev) => {
      const next = { ...prev };
      let i = 0;
      for (const r of rows) {
        if (i >= candidates.length) break;
        if (!next[r.id] && r.holders.length === 0) next[r.id] = candidates[i++].id;
      }
      return next;
    });
    resetResult();
  };

  // ════════════════════════ accounts mode ════════════════════════
  const targetId =
    level === 'district' ? districtId : level === 'ds' ? dsId : level === 'gn' ? gnId : teamId;

  const territoryText = (): string => {
    if (level === 'team') {
      const tm = teams.find((x) => x.id === teamId);
      return tm ? `Team ${tm.teamNo}` : '';
    }
    if (level === 'gn') {
      const g = gnDivisions.find((x) => x.id === gnId);
      return g ? `${g.gnNumber} — ${g.gnName || g.gn_name || ''}` : '';
    }
    const list = level === 'ds' ? dsDivisions : districts;
    const id = level === 'ds' ? dsId : districtId;
    const found = list.find((x) => x.id === id);
    return found ? found.nameEn || found.name_en || '' : '';
  };

  const alreadyHere = (acc: any): boolean => {
    if (!targetId) return false;
    const list = activeByProfile.get(acc.id) ?? [];
    return list.some((r) => {
      if (level === 'team') return r.team?.id === teamId;
      if (level === 'gn') return r.gn?.id === gnId && !r.team;
      if (level === 'ds') return r.ds?.id === dsId && !r.gn && !r.team;
      return r.district?.id === districtId && !r.ds && !r.gn && !r.team;
    });
  };

  const changeLevel = (next: BulkLevel) => {
    setLevel(next);
    setRoleFilter(BULK_LEVEL_ROLE[next]);
    setSelected(new Set());
    resetResult();
  };

  const q = search.trim().toLowerCase();
  const visibleAccounts = accounts.filter((a) => {
    if (!allowedRoles.includes(a.role)) return false;
    if (roleFilter !== 'all' && a.role !== roleFilter) return false;
    if (!q) return true;
    return accName(a).toLowerCase().includes(q) || accCode(a).toLowerCase().includes(q);
  });
  const chosenAccounts = accounts.filter((a) => selected.has(a.id) && !alreadyHere(a));
  const secretariesChosen = chosenAccounts.filter((a) => a.role === 'cdc_secretary').length;
  const gnConflict = level === 'gn' && secretariesChosen > 1;

  const toggleAccount = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    resetResult();
  };

  const selectAllShown = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const a of visibleAccounts) if (!alreadyHere(a)) next.add(a.id);
      return next;
    });
    resetResult();
  };

  // ════════════════════════ submit ════════════════════════
  const itemCount = mode === 'territories' ? pendingRows.length : chosenAccounts.length;
  const canSubmit =
    !running &&
    itemCount > 0 &&
    (mode === 'territories' ? !duplicateAccount : Boolean(targetId) && !gnConflict);

  const run = async () => {
    const noteValue = note.trim() || undefined;
    const jobs: { key: string; name: string; profileId: string; territory: any }[] = [];

    if (mode === 'territories') {
      const field = TERR_FIELD[tLevel];
      for (const r of pendingRows) {
        const acc = accounts.find((a) => a.id === assignee[r.id]);
        jobs.push({
          key: r.id,
          name: `${r.label} → ${acc ? `${accName(acc)} (${accCode(acc)})` : assignee[r.id]}`,
          profileId: assignee[r.id],
          territory: { [field]: r.id, note: noteValue },
        });
      }
    } else {
      const field =
        level === 'district' ? 'districtId' : level === 'ds' ? 'dsId' : level === 'gn' ? 'gnId' : 'teamId';
      for (const acc of chosenAccounts) {
        jobs.push({
          key: acc.id,
          name: `${accName(acc)} (${accCode(acc)})`,
          profileId: acc.id,
          territory: { [field]: targetId, note: noteValue },
        });
      }
    }

    setRunning(true);
    resetResult();
    setProgress(0);
    setTotal(jobs.length);
    const failed: { id: string; name: string; message: string }[] = [];
    let ok = 0;
    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];
      try {
        await api.assignAccount(job.profileId, job.territory);
        ok += 1;
      } catch (e: any) {
        failed.push({ id: job.key, name: job.name, message: e?.message || 'Assignment failed.' });
      }
      setProgress(i + 1);
    }
    setRunning(false);
    setOkCount(ok);
    setFailures(failed);

    // Keep only the failed items so they can be retried.
    if (mode === 'territories') {
      const keep: Record<string, string> = {};
      for (const f of failed) keep[f.id] = assignee[f.id];
      setAssignee(keep);
    } else {
      setSelected(new Set(failed.map((f) => f.id)));
    }

    onFinished({ ok, failed: failed.length });
    if (failed.length === 0) onClose();
  };

  const territoryLevelOptions: TerrLevel[] = isSdo ? ['gn'] : isDc ? ['gn', 'ds'] : ['gn', 'ds', 'district'];
  const levelNames: Record<TerrLevel, string> = {
    gn: t('assignments.level_gn'),
    ds: t('assignments.level_ds'),
    district: t('assignments.level_district'),
  };
  const roleOptions = ['all', ...allowedRoles];

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-content" style={{ maxWidth: '820px', width: '100%' }}>
        <div className="modal-header">
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--slate-900)' }}>
              {t('assignments.bulk_title')}
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--slate-500)', marginTop: '3px' }}>
              {t('assignments.bulk_desc')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={running}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate-400)' }}
          >
            <X size={18} />
          </button>
        </div>

        <div
          className="modal-body"
          style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '70vh', overflowY: 'auto' }}
        >
          {/* Mode switch */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {(['territories', 'accounts'] as const).map((m) => (
              <button
                key={m}
                type="button"
                className={mode === m ? 'btn-primary' : 'btn-secondary'}
                style={{ fontSize: '12.5px', padding: '6px 12px' }}
                disabled={running}
                onClick={() => { setMode(m); resetResult(); }}
              >
                {t(m === 'territories' ? 'assignments.bulk_mode_territories' : 'assignments.bulk_mode_accounts')}
              </button>
            ))}
          </div>

          {/* ═════════ Mode: each territory -> its own account ═════════ */}
          {mode === 'territories' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '12px' }}>
                <div>
                  <label className="form-label">{t('assignments.territory_level')} *</label>
                  <select
                    value={tLevel}
                    onChange={(e) => changeTLevel(e.target.value as TerrLevel)}
                    className="select-field"
                    disabled={running}
                  >
                    {territoryLevelOptions.map((l) => (
                      <option key={l} value={l}>{levelNames[l]}</option>
                    ))}
                  </select>
                </div>

                {(tLevel === 'gn' || tLevel === 'ds') && (
                  <div>
                    <label className="form-label">{t('assignments.level_district')} *</label>
                    <select
                      value={tDistrictId}
                      onChange={(e) => changeTDistrict(e.target.value)}
                      className="select-field"
                      disabled={running || isSdo || isDc}
                    >
                      <option value="">{t('assignments.select_district')}</option>
                      {districts.map((d) => <option key={d.id} value={d.id}>{d.nameEn || d.name_en}</option>)}
                    </select>
                  </div>
                )}

                {tLevel === 'gn' && (
                  <div>
                    <label className="form-label">{t('assignments.level_ds')} *</label>
                    <select
                      value={tDsId}
                      onChange={(e) => changeTDs(e.target.value)}
                      className="select-field"
                      disabled={running || isSdo}
                    >
                      <option value="">{t('assignments.select_ds')}</option>
                      {dsInDistrict.map((d) => <option key={d.id} value={d.id}>{d.nameEn || d.name_en}</option>)}
                    </select>
                  </div>
                )}

                <div>
                  <label className="form-label">{t('assignments.bulk_accounts')}</label>
                  <select
                    value={tRole}
                    onChange={(e) => { setTRole(e.target.value); resetResult(); }}
                    className="select-field"
                    disabled={running}
                  >
                    {roleOptions.map((r) => (
                      <option key={r} value={r}>{r === 'all' ? t('assignments.bulk_all_roles') : roleLabel(r)}</option>
                    ))}
                  </select>
                </div>
              </div>

              {rows.length === 0 ? (
                <div style={{ border: '1px dashed var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '1.5rem', textAlign: 'center', color: 'var(--slate-500)', fontSize: '13px' }}>
                  {tLevel === 'gn' && !tDsId
                    ? t('assignments.bulk_pick_ds_first')
                    : tLevel === 'ds' && !tDistrictId
                      ? t('assignments.bulk_pick_district_first')
                      : t('assignments.bulk_no_match')}
                </div>
              ) : (
                <>
                  {/* Fill helpers */}
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', color: 'var(--slate-500)' }}>{t('assignments.bulk_fill_with')}</span>
                    <select
                      className="select-field"
                      style={{ width: 'auto', minWidth: '200px' }}
                      value={fillAccountId}
                      onChange={(e) => setFillAccountId(e.target.value)}
                      disabled={running}
                    >
                      <option value="">—</option>
                      {rowAccounts.map((a) => (
                        <option key={a.id} value={a.id}>{accName(a)} ({accCode(a)})</option>
                      ))}
                    </select>
                    <button type="button" className="btn-secondary" style={{ fontSize: '12px' }} onClick={fillEmptyWith} disabled={running || !fillAccountId}>
                      {t('assignments.bulk_fill_btn')}
                    </button>
                    <button type="button" className="btn-secondary" style={{ fontSize: '12px' }} onClick={fillFromUnassigned} disabled={running}>
                      {t('assignments.bulk_fill_unassigned')}
                    </button>
                    <button type="button" className="btn-secondary" style={{ fontSize: '12px' }} onClick={() => { setAssignee({}); resetResult(); }} disabled={running}>
                      {t('assignments.bulk_clear')}
                    </button>
                  </div>

                  <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', maxHeight: '340px', overflow: 'auto' }}>
                    <table className="data-table" style={{ width: '100%' }}>
                      <thead>
                        <tr>
                          <th>{t('assignments.col_territory')}</th>
                          <th>{t('assignments.bulk_col_holder')}</th>
                          <th>{t('assignments.bulk_col_new')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => {
                          const sel = assignee[r.id] ?? '';
                          const selAcc = accounts.find((a) => a.id === sel);
                          const isHolder = r.holders.some((h) => h.profileId === sel);
                          const moves =
                            Boolean(selAcc) &&
                            !isHolder &&
                            (activeByProfile.get(sel) ?? []).length > 0 &&
                            !(tLevel === 'gn' && selAcc?.role === 'cdc_secretary');
                          return (
                            <tr key={r.id}>
                              <td style={{ fontSize: '13px', fontWeight: 600, color: 'var(--slate-900)' }}>{r.label}</td>
                              <td style={{ fontSize: '12.5px', color: 'var(--slate-500)' }}>
                                {r.holders.length === 0 ? '—' : r.holders.map((h) => h.profile.fullName).join(', ')}
                              </td>
                              <td>
                                <select
                                  className="select-field"
                                  value={sel}
                                  onChange={(e) => setRowAssignee(r.id, e.target.value)}
                                  disabled={running}
                                >
                                  <option value="">{t('assignments.bulk_none')}</option>
                                  {rowAccounts.map((a) => (
                                    <option key={a.id} value={a.id}>{accName(a)} ({accCode(a)})</option>
                                  ))}
                                </select>
                                {isHolder && (
                                  <div style={{ fontSize: '11px', color: 'var(--slate-500)', marginTop: '3px' }}>
                                    {t('assignments.bulk_already_here')}
                                  </div>
                                )}
                                {moves && (
                                  <div style={{ fontSize: '11px', color: 'var(--warning-text)', marginTop: '3px' }}>
                                    {t('assignments.bulk_currently')}: {currentText(sel)}
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--slate-500)' }}>
                    {pendingRows.length} {t('assignments.bulk_selected')}
                  </div>
                </>
              )}

              {duplicateAccount && (
                <div style={{ background: 'var(--warning-bg)', border: '1px solid var(--warning-border)', borderRadius: 'var(--radius-sm)', padding: '9px 12px', color: 'var(--warning-text)', fontSize: '12.5px' }}>
                  {t('assignments.bulk_duplicate_account')}
                </div>
              )}
            </>
          )}

          {/* ═════════ Mode: many accounts -> one territory ═════════ */}
          {mode === 'accounts' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                <div>
                  <label className="form-label">{t('assignments.territory_level')} *</label>
                  <select
                    value={level}
                    onChange={(e) => changeLevel(e.target.value as BulkLevel)}
                    className="select-field"
                    disabled={running}
                  >
                    <option value="team">{t('assignments.level_team')}</option>
                    <option value="gn">{t('assignments.level_gn')}</option>
                    {!isSdo && <option value="ds">{t('assignments.level_ds')}</option>}
                    {!isSdo && !isDc && <option value="district">{t('assignments.level_district')}</option>}
                  </select>
                </div>

                {level === 'district' && (
                  <div>
                    <label className="form-label">{t('assignments.level_district')} *</label>
                    <select value={districtId} onChange={(e) => { setDistrictId(e.target.value); resetResult(); }} className="select-field" disabled={running}>
                      <option value="">{t('assignments.select_district')}</option>
                      {districts.map((d) => <option key={d.id} value={d.id}>{d.nameEn || d.name_en}</option>)}
                    </select>
                  </div>
                )}

                {level === 'ds' && (
                  <div>
                    <label className="form-label">{t('assignments.level_ds')} *</label>
                    <select
                      value={dsId}
                      onChange={(e) => { setDsId(e.target.value); onDsChange(e.target.value); resetResult(); }}
                      className="select-field"
                      disabled={running}
                    >
                      <option value="">{t('assignments.select_ds')}</option>
                      {dsDivisions.map((d) => <option key={d.id} value={d.id}>{d.nameEn || d.name_en}</option>)}
                    </select>
                  </div>
                )}

                {(level === 'gn' || level === 'team') && (
                  <>
                    <div>
                      <label className="form-label">{t('assignments.level_ds')}</label>
                      <select
                        value={dsId}
                        onChange={(e) => { setDsId(e.target.value); onDsChange(e.target.value); setGnId(''); setTeamId(''); resetResult(); }}
                        disabled={isSdo || running}
                        className="select-field"
                      >
                        {!isSdo && <option value="">{t('assignments.all_ds')}</option>}
                        {dsDivisions.map((d) => <option key={d.id} value={d.id}>{d.nameEn || d.name_en}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="form-label">{t('assignments.level_gn')} *</label>
                      <select
                        value={gnId}
                        onChange={(e) => { setGnId(e.target.value); onGnChange(e.target.value); setTeamId(''); resetResult(); }}
                        className="select-field"
                        disabled={running}
                      >
                        <option value="">{t('assignments.select_gn')}</option>
                        {gnDivisions.map((g) => <option key={g.id} value={g.id}>{g.gnNumber} — {g.gnName || g.gn_name}</option>)}
                      </select>
                    </div>
                  </>
                )}

                {level === 'team' && (
                  <div>
                    <label className="form-label">{t('assignments.col_team')} *</label>
                    <select value={teamId} onChange={(e) => { setTeamId(e.target.value); resetResult(); }} className="select-field" disabled={running}>
                      <option value="">{t('assignments.select_team')}</option>
                      {(gnId ? teams.filter((x) => (x.gnId || x.gn_id) === gnId) : teams).map((x) => (
                        <option key={x.id} value={x.id}>Team {x.teamNo}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div>
                <label className="form-label">{t('assignments.bulk_accounts')} *</label>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                  <div style={{ position: 'relative', flex: '1 1 200px' }}>
                    <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--slate-400)' }} />
                    <input
                      type="text"
                      className="input-field"
                      placeholder={t('assignments.bulk_search_accounts')}
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      style={{ paddingLeft: '32px' }}
                    />
                  </div>
                  <select
                    className="select-field"
                    style={{ width: 'auto', minWidth: '160px' }}
                    value={roleFilter}
                    onChange={(e) => setRoleFilter(e.target.value)}
                  >
                    {roleOptions.map((r) => (
                      <option key={r} value={r}>{r === 'all' ? t('assignments.bulk_all_roles') : roleLabel(r)}</option>
                    ))}
                  </select>
                  <button type="button" className="btn-secondary" style={{ fontSize: '12px' }} onClick={selectAllShown} disabled={running}>
                    {t('assignments.bulk_select_shown')}
                  </button>
                  <button type="button" className="btn-secondary" style={{ fontSize: '12px' }} onClick={() => { setSelected(new Set()); resetResult(); }} disabled={running}>
                    {t('assignments.bulk_clear')}
                  </button>
                </div>

                <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', maxHeight: '260px', overflowY: 'auto' }}>
                  {visibleAccounts.length === 0 ? (
                    <div style={{ padding: '1.25rem', textAlign: 'center', color: 'var(--slate-400)', fontSize: '13px' }}>
                      {t('assignments.bulk_no_match')}
                    </div>
                  ) : (
                    visibleAccounts.map((a) => {
                      const here = alreadyHere(a);
                      return (
                        <label
                          key={a.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            padding: '8px 12px',
                            borderBottom: '1px solid var(--border-subtle)',
                            cursor: here ? 'not-allowed' : 'pointer',
                            opacity: here ? 0.55 : 1,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={selected.has(a.id) && !here}
                            disabled={here || running}
                            onChange={() => toggleAccount(a.id)}
                          />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--slate-900)' }}>
                              {accName(a)} <span style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--primary)' }}>{accCode(a)}</span>
                            </div>
                            <div style={{ fontSize: '11.5px', color: 'var(--slate-500)' }}>
                              {here ? t('assignments.bulk_already_here') : `${t('assignments.bulk_currently')}: ${currentText(a.id)}`}
                            </div>
                          </div>
                          <span className="badge badge-neutral" style={{ fontSize: '10px', textTransform: 'uppercase' }}>{roleLabel(a.role)}</span>
                        </label>
                      );
                    })
                  )}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--slate-500)', marginTop: '6px' }}>
                  {chosenAccounts.length} {t('assignments.bulk_selected')}
                </div>
              </div>

              {gnConflict && (
                <div style={{ background: 'var(--warning-bg)', border: '1px solid var(--warning-border)', borderRadius: 'var(--radius-sm)', padding: '9px 12px', color: 'var(--warning-text)', fontSize: '12.5px' }}>
                  {t('assignments.bulk_one_secretary_per_gn')}
                </div>
              )}
            </>
          )}

          <div>
            <label className="form-label">{t('assignments.note_optional')}</label>
            <input
              type="text"
              className="input-field"
              placeholder="e.g. Temporary reassignment for census month"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              disabled={running}
            />
          </div>

          <div style={{ background: 'var(--primary-subtle)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '9px 12px', color: 'var(--slate-700)', fontSize: '12.5px', lineHeight: 1.4 }}>
            {t('assignments.bulk_replace_warning')}
          </div>

          {running && (
            <div style={{ fontSize: '13px', color: 'var(--slate-700)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Loader2 size={15} className="animate-spin" />
              {t('assignments.bulk_progress')} {progress} / {total}…
            </div>
          )}
          {!running && okCount !== null && failures.length > 0 && (
            <div style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', color: 'var(--danger-text)', fontSize: '12.5px' }}>
              <div style={{ fontWeight: 600, marginBottom: '4px' }}>
                {okCount} {t('assignments.bulk_ok')} · {failures.length} {t('assignments.bulk_failed')}
              </div>
              <ul style={{ margin: 0, paddingLeft: '18px' }}>
                {failures.map((f) => (
                  <li key={f.id}>{f.name}: {f.message}</li>
                ))}
              </ul>
              <div style={{ marginTop: '6px', opacity: 0.9 }}>{t('assignments.bulk_retry_hint')}</div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          {mode === 'accounts' && targetId && itemCount > 0 && (
            <span style={{ marginRight: 'auto', fontSize: '12px', color: 'var(--slate-500)' }}>
              → {territoryText()}
            </span>
          )}
          <button type="button" onClick={onClose} disabled={running} className="btn-secondary">{t('common.close')}</button>
          <button type="button" onClick={run} disabled={!canSubmit} className="btn-primary">
            {running ? <Loader2 size={16} className="animate-spin" /> : `${t('assignments.bulk_assign_btn')} (${itemCount})`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AssignmentsPage() {
  const { t } = useLanguage();
  const { user, isLoading: authLoading } = useAuth();

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
  const [showBulk, setShowBulk] = useState(false);

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
    if (authLoading || !user) return;
    fetchAssignments();
    const isSdo = user.role === 'sda';
    const isDc = user.role === 'dc';
    api.getDistricts().then((rows) => {
      setDistricts((isSdo || isDc) && user.districtId ? rows.filter((d) => d.id === user.districtId) : rows);
    }).catch(() => { });
    api.getDsDivisions(user.districtId || undefined).then((rows) => {
      setDsDivisions(isSdo && user.dsId ? rows.filter((ds) => ds.id === user.dsId) : rows);
    }).catch(() => { });
    api.getGnDivisions(isSdo && user.dsId ? user.dsId : undefined).then(setGnDivisions).catch(() => { });
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
  }, [authLoading, fetchAssignments, user?.id, user?.role, user?.districtId, user?.dsId]);

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
          <p>{t('assignments.no_permission')}</p>
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
            {t('assignments.title')}
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--slate-500)', marginTop: '4px' }}>
            {t('assignments.subtitle')}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            onClick={() => { handleDsChange(''); setShowBulk(true); }}
            className="btn-primary"
          >
            <Users size={14} />
            <span>{t('assignments.bulk_assign')}</span>
          </button>
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
            placeholder={t('assignments.search_placeholder')}
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
            <p style={{ fontWeight: 600, fontSize: '13.5px', color: 'var(--slate-900)', margin: 0 }}>{t('assignments.assign_account')}</p>
            <p style={{ fontSize: '12px', color: 'var(--slate-500)', margin: '3px 0 0 0' }}>
              {t('assignments.assign_shortcut_desc')}
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
              <option value="">{t('assignments.select_account')}</option>
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
              <th>{t('assignments.col_account')}</th>
              <th>{t('assignments.col_role')}</th>
              <th>{t('assignments.col_territory')}</th>
              <th>{t('assignments.col_team')}</th>
              <th style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={13} /> {t('assignments.col_since')}</th>
              <th>{t('assignments.col_assigned_by')}</th>
              <th style={{ textAlign: 'right' }}>{t('common.actions')}</th>
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
          callerRole={user?.role}
          callerDsId={user?.dsId}
          onClose={() => { setAssignTarget(null); setModalError(null); }}
          onDsChange={handleDsChange}
          onGnChange={handleGnChange}
          onSubmit={handleAssign}
          submitting={submitting}
          error={modalError}
        />
      )}

      {showBulk && (
        <BulkAssignDialog
          accounts={accounts}
          assignments={assignments}
          districts={districts}
          dsDivisions={dsDivisions}
          gnDivisions={gnDivisions}
          teams={teams}
          callerRole={user?.role}
          callerDistrictId={user?.districtId}
          callerDsId={user?.dsId}
          onClose={() => setShowBulk(false)}
          onDsChange={handleDsChange}
          onGnChange={handleGnChange}
          onFinished={({ ok, failed }) => {
            flash(
              failed > 0 ? `${ok} assigned, ${failed} failed.` : `${ok} assignment${ok !== 1 ? 's' : ''} completed.`,
              failed > 0,
            );
            fetchAssignments();
          }}
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

