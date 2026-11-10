'use client';

import React, { useEffect, useState } from 'react';
import Shell from '../../components/Shell';
import PrintableSlipsModal, { CredentialSlipItem } from '../../components/PrintableSlipsModal';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import { formatDate } from '../../lib/utils';
import {
  UserPlus,
  Layers,
  Search,
  RefreshCw,
  KeyRound,
  UserX,
  UserCheck,
  AlertCircle,
  CheckCircle,
  Loader2,
  X
} from 'lucide-react';

// Role creation hierarchy aligned strictly with backend CREATION_MATRIX (§6.1)
const CREATABLE_ROLES: Record<string, { value: string; label: string }[]> = {
  super_admin: [
    { value: 'admin', label: 'Administrator' },
    { value: 'cg', label: 'CG (Level 1 Central)' },
    { value: 'dc', label: 'DC (Level 2 District)' },
    { value: 'sda', label: 'SDA (Level 3 Divisional)' },
    { value: 'cdc_secretary', label: 'CDC Secretary (Level 4)' },
    { value: 'team_member', label: 'Team Member (Enumerator)' },
  ],
  admin: [],
  cg: [
    { value: 'dc', label: 'DC (Level 2 District)' },
    { value: 'team_member', label: 'Team Member (Enumerator)' },
  ],
  dc: [
    { value: 'sda', label: 'SDA (Level 3 Divisional)' },
    { value: 'team_member', label: 'Team Member (Enumerator)' },
  ],
  sda: [
    { value: 'cdc_secretary', label: 'CDC Secretary (Level 4)' },
    { value: 'team_member', label: 'Team Member (Enumerator)' },
  ],
  cdc_secretary: [
    { value: 'team_member', label: 'Team Member (Enumerator)' },
  ],
};

export default function UsersPage() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Modals
  const [showSingleModal, setShowSingleModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [showReissueModal, setShowReissueModal] = useState(false);
  const [reissueBatchId, setReissueBatchId] = useState('');
  const [latestCredentials, setLatestCredentials] = useState<CredentialSlipItem[] | null>(null);
  const [teams, setTeams] = useState<any[]>([]);

  // Form states
  const [formData, setFormData] = useState({
    fullName: '',
    role: 'team_member',
    phone: '',
    teamId: '',
  });

  const [bulkData, setBulkData] = useState({
    role: 'team_member',
    count: 10,
    teamId: '',
  });

  const [actionLoading, setActionLoading] = useState(false);
  const isSuperAdmin = user?.role === 'super_admin' || user?.role === 'admin';

  const allowedSingleRoles = (user?.role && CREATABLE_ROLES[user.role])
    ? CREATABLE_ROLES[user.role]
    : [{ value: 'team_member', label: 'Team Member (Enumerator)' }];

  const allowedBulkRoles = ((user?.role && CREATABLE_ROLES[user.role]) || [])
    .filter((r) => ['team_member', 'cdc_secretary'].includes(r.value));

  const handleOpenSingleModal = () => {
    const initialRole = allowedSingleRoles[0]?.value || 'team_member';
    setFormData({
      fullName: '',
      role: initialRole,
      phone: '',
      teamId: user?.role === 'cdc_secretary' ? (user.teamId || '') : '',
    });
    setShowSingleModal(true);
  };

  const handleOpenBulkModal = () => {
    const initialRole = allowedBulkRoles[0]?.value || 'team_member';
    setBulkData({
      role: initialRole,
      count: initialRole === 'cdc_secretary' ? 1 : 10,
      teamId: user?.role === 'cdc_secretary' ? (user.teamId || '') : '',
    });
    setShowBulkModal(true);
  };

  useEffect(() => {
    api.getTeams().then(setTeams).catch(() => { });
  }, []);

  const fetchAccounts = async (cursor?: string, isReset = false) => {
    try {
      setLoading(true);
      const res = await api.getAccounts({
        cursor: isReset ? undefined : cursor,
        limit: 20,
        search: search.trim() || undefined,
        role: roleFilter || undefined,
      });

      const items = res.items || [];
      setAccounts(isReset ? items : [...accounts, ...items]);
      setNextCursor(res.nextCursor || res.next_cursor || null);
      setHasMore(!!(res.nextCursor || res.next_cursor));
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch user accounts.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts(undefined, true);
  }, [search, roleFilter]);

  const handleCreateSingle = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      if (formData.role === 'cdc_secretary' && !formData.teamId && !isSuperAdmin) {
        setError('Team assignment is required for CDC secretary (team leader).');
        setActionLoading(false);
        return;
      }
      const payload: any = {
        fullName: formData.fullName.trim(),
        role: formData.role,
        phoneE164: formData.phone.trim() || undefined,
        teamId: formData.teamId || undefined,
      };
      const res = await api.createAccount(payload);
      setShowSingleModal(false);
      const userObj = res?.user || res;
      const userCode = userObj?.userCode || userObj?.user_code || '';
      const role = userObj?.role || formData.role;
      const fullName = userObj?.fullName || formData.fullName;
      const initialPassword = userObj?.initialPassword || userObj?.initial_password || '';

      setLatestCredentials([
        {
          userCode,
          role,
          fullName,
          initialPassword,
        },
      ]);
      setFormData({ fullName: '', role: 'team_member', phone: '', teamId: '' });
      fetchAccounts(undefined, true);
      api.getTeams().then(setTeams).catch(() => { });
      setSuccessMessage(`Account ${userCode || 'User'} created successfully.`);
    } catch (err: any) {
      setError(`Error creating account: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateBulk = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    setError(null);
    setSuccessMessage(null);

    const targetTeamId = user?.role === 'cdc_secretary' ? user.teamId : (bulkData.teamId || undefined);
    if (!targetTeamId && !isSuperAdmin) {
      setError('Team assignment is required.');
      setActionLoading(false);
      return;
    }

    if (bulkData.role === 'cdc_secretary' && targetTeamId && Number(bulkData.count) !== 1) {
      setError('A team can only have 1 CDC Secretary (team leader). Count must be 1.');
      setActionLoading(false);
      return;
    }

    // Atomicity check across > 100: Enforce team member limit upfront before chunking
    if (bulkData.role === 'team_member' && targetTeamId) {
      const targetTeam = teams.find((t) => t.id === targetTeamId);
      if (targetTeam) {
        const activeInTeam = targetTeam.activeMembers ?? targetTeam.memberLimit ?? 0;
        const availableSlots = Math.max(0, targetTeam.maxMembers - activeInTeam);
        if (Number(bulkData.count) > availableSlots) {
          setError(
            `Team member limit exceeded. Team ${targetTeam.teamNo} allows a maximum of ${targetTeam.maxMembers} members (${activeInTeam} currently active). Only ${availableSlots} slot(s) remain, but ${bulkData.count} were requested.`
          );
          setActionLoading(false);
          return;
        }
      }
    }

    const allCreds: CredentialSlipItem[] = [];
    const createdBatchIds: string[] = [];
    let remaining = Number(bulkData.count);

    try {
      while (remaining > 0) {
        const chunk = remaining > 100 ? 100 : remaining;
        const res = await api.createBulkAccounts({
          role: bulkData.role,
          count: chunk,
          teamId: targetTeamId,
        });

        if (res.batchId) {
          createdBatchIds.push(res.batchId);
        }

        const usersList = res.accounts || res.users || [];
        for (const u of usersList) {
          allCreds.push({
            userCode: u.userCode || u.user_code,
            role: bulkData.role,
            fullName: u.fullName,
            initialPassword: u.initialPassword || u.initial_password,
          });
        }
        remaining -= chunk;
      }

      setShowBulkModal(false);
      setLatestCredentials(allCreds);
      fetchAccounts(undefined, true);
      api.getTeams().then(setTeams).catch(() => { });
      setSuccessMessage(`Successfully generated ${allCreds.length} account(s) in batch ${createdBatchIds.join(', ')}.`);
    } catch (err: any) {
      if (allCreds.length > 0) {
        setShowBulkModal(false);
        setLatestCredentials(allCreds);
        fetchAccounts(undefined, true);
        api.getTeams().then(setTeams).catch(() => { });
        setError(
          `Bulk creation partially completed: ${allCreds.length} accounts were generated. Subsequent chunk failed: ${err.message}.`
        );
      } else {
        setError(`Error in bulk creation: ${err.message}`);
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleReissueBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reissueBatchId.trim()) return;
    setActionLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const res = await api.reissueBatch(reissueBatchId.trim());
      setShowReissueModal(false);
      const slips: CredentialSlipItem[] = (res.credentials || []).map((c: any) => ({
        userCode: c.userCode,
        fullName: c.fullName,
        role: c.role || (res as any).role || 'team_member',
        initialPassword: c.initialPassword,
      }));
      setLatestCredentials(slips);
      setSuccessMessage(
        `Successfully reissued credentials for ${res.totalReissued} accounts in batch ${res.batchId}.`
      );
    } catch (err: any) {
      setError(`Failed to reissue batch credentials: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeactivate = async (id: string) => {
    if (!confirm(t('users.confirm_deactivate'))) return;
    setError(null);
    setSuccessMessage(null);
    try {
      await api.deactivateAccount(id);
      fetchAccounts(undefined, true);
      setSuccessMessage('Account deactivated successfully.');
    } catch (err: any) {
      setError(`Failed to deactivate: ${err.message}`);
    }
  };

  const handleReactivate = async (id: string) => {
    setError(null);
    setSuccessMessage(null);
    try {
      await api.reactivateAccount(id);
      fetchAccounts(undefined, true);
      setSuccessMessage('Account reactivated successfully.');
    } catch (err: any) {
      setError(`Failed to reactivate: ${err.message}`);
    }
  };

  const handleResetPassword = async (id: string) => {
    if (!confirm(t('users.confirm_reset_pwd'))) return;
    setError(null);
    setSuccessMessage(null);
    try {
      const res = await api.resetAccountPassword(id);
      const acc = accounts.find((a) => a.id === id);
      const userObj = res?.user || res;
      const userCode = userObj?.userCode || userObj?.user_code || acc?.userCode || '';
      const role = userObj?.role || acc?.role || '';
      const fullName = userObj?.fullName || acc?.fullName || '';
      const initialPassword = userObj?.initialPassword || userObj?.initial_password || '';

      setLatestCredentials([
        {
          userCode,
          role,
          fullName,
          initialPassword,
        },
      ]);
      setSuccessMessage(`Temporary password generated for ${userCode}.`);
    } catch (err: any) {
      setError(`Failed to reset password: ${err.message}`);
    }
  };

  return (
    <Shell>
      {/* Title & Action Bar */}
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
            {t('users.title')}
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--slate-500)', marginTop: '4px' }}>
            Administrative account lifecycle management, printable credential slips, and role provisioning.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button type="button" onClick={() => setShowReissueModal(true)} className="btn-secondary">
            <KeyRound size={15} />
            <span>Reissue Batch</span>
          </button>

          <button type="button" onClick={handleOpenSingleModal} className="btn-secondary">
            <UserPlus size={15} />
            <span>{t('users.create_single')}</span>
          </button>

          <button type="button" onClick={handleOpenBulkModal} className="btn-primary">
            <Layers size={15} />
            <span>{t('users.create_bulk')}</span>
          </button>
        </div>
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
          <AlertCircle size={18} style={{ flexShrink: 0 }} />
          <span>{error}</span>
        </div>
      )}

      {successMessage && (
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
            gap: '10px',
            fontSize: '13.5px',
          }}
        >
          <CheckCircle size={18} style={{ flexShrink: 0 }} />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Filters & Search Toolbar */}
      <div
        className="panel"
        style={{
          padding: '0.875rem 1.25rem',
          marginBottom: '1.5rem',
          display: 'flex',
          gap: '12px',
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
          <Search
            size={16}
            color="var(--slate-400)"
            style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)' }}
          />
          <input
            type="text"
            className="input-field"
            placeholder="Search by User Code, Name, or Phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: '34px' }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="select-field"
            style={{ width: '180px' }}
          >
            {user?.role === 'cdc_secretary' ? (
              <option value="team_member">Team Members (Assigned)</option>
            ) : (
              <>
                <option value="">All Roles</option>
                <option value="team_member">Team Member</option>
                <option value="cdc_secretary">CDC Secretary</option>
                <option value="sda">SDA (Divisional)</option>
                <option value="dc">DC (District)</option>
                <option value="cg">CG (Central)</option>
                <option value="admin">Administrator</option>
              </>
            )}
          </select>

          <button
            type="button"
            onClick={() => fetchAccounts(undefined, true)}
            className="btn-secondary"
            title="Refresh users"
            style={{ padding: '0.55rem 0.75rem' }}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Accounts Table */}
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t('users.user_code')}</th>
              <th>{t('users.name')}</th>
              <th>{t('users.role')}</th>
              <th>{t('users.phone')}</th>
              <th>{t('users.status')}</th>
              <th>Created Date</th>
              <th style={{ textAlign: 'right' }}>{t('users.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {accounts.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', color: 'var(--slate-400)', padding: '2.5rem' }}>
                  {loading ? 'Loading user accounts...' : 'No accounts matching criteria.'}
                </td>
              </tr>
            ) : (
              accounts.map((acc) => {
                const isActive = acc.is_active ?? acc.isActive ?? true;
                return (
                  <tr key={acc.id}>
                    <td style={{ fontWeight: 600, fontFamily: 'monospace', color: 'var(--primary)' }}>
                      {acc.user_code || acc.userCode}
                    </td>
                    <td style={{ fontWeight: 600, color: 'var(--slate-900)' }}>
                      {acc.full_name || acc.fullName || '—'}
                    </td>
                    <td>
                      <span className="badge badge-neutral" style={{ textTransform: 'uppercase' }}>
                        {acc.role}
                      </span>
                    </td>
                    <td>{acc.phone_e164 || acc.phone || '—'}</td>
                    <td>
                      {isActive ? (
                        <span className="badge badge-success">{t('users.active')}</span>
                      ) : (
                        <span className="badge badge-danger">{t('users.deactivated')}</span>
                      )}
                    </td>
                    <td style={{ fontSize: '12px', color: 'var(--slate-500)' }}>
                      {formatDate(acc.created_at || acc.createdAt)}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {/* Restrict UI actions: Level 00 can manage accounts, Level 4 only manages team_member */}
                      {(user?.role === 'super_admin' || (user?.role === 'cdc_secretary' && acc.role === 'team_member')) && (
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            onClick={() => handleResetPassword(acc.id)}
                            title={t('users.reset_pwd')}
                            aria-label={t('users.reset_pwd')}
                            className="btn-secondary"
                            style={{ padding: '5px 8px', fontSize: '11px' }}
                          >
                            <KeyRound size={13} />
                          </button>

                          {acc.id !== user?.id && (
                            isActive ? (
                              <button
                                type="button"
                                onClick={() => handleDeactivate(acc.id)}
                                title={t('users.deactivate')}
                                aria-label={t('users.deactivate')}
                                className="btn-danger"
                                style={{ padding: '5px 8px', fontSize: '11px' }}
                              >
                                <UserX size={13} />
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleReactivate(acc.id)}
                                title={t('users.reactivate')}
                                aria-label={t('users.reactivate')}
                                className="btn-secondary"
                                style={{ padding: '5px 8px', fontSize: '11px', color: 'var(--success)' }}
                              >
                                <UserCheck size={13} />
                              </button>
                            )
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Keyset */}
      {hasMore && (
        <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
          <button
            type="button"
            onClick={() => fetchAccounts(nextCursor || undefined)}
            disabled={loading}
            className="btn-secondary"
          >
            {loading ? 'Loading more...' : 'Load More Accounts (Keyset)'}
          </button>
        </div>
      )}

      {/* Single Account Modal */}
      {showSingleModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-content" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--slate-900)' }}>
                {t('users.create_single')}
              </h3>
              <button
                type="button"
                onClick={() => setShowSingleModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate-400)', padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCreateSingle}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label className="form-label">
                    {t('users.name')} *
                  </label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="Kamal Perera"
                    value={formData.fullName}
                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                    required
                  />
                </div>

                <div>
                  <label className="form-label">
                    {t('users.role')} *
                  </label>
                  <select
                    value={formData.role}
                    onChange={(e) => {
                      const newRole = e.target.value;
                      setFormData((prev) => ({
                        ...prev,
                        role: newRole,
                        teamId: newRole === 'cdc_secretary'
                          ? (teams.find((t) => t.id === prev.teamId && !t.leaderId && !t.leader_id) ? prev.teamId : '')
                          : prev.teamId,
                      }));
                    }}
                    className="select-field"
                  >
                    {allowedSingleRoles.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>

                {user?.role === 'cdc_secretary' ? (
                  <div style={{ background: 'var(--slate-50)', border: '1px solid var(--border-subtle)', padding: '10px 14px', borderRadius: 'var(--radius-sm)', fontSize: '12.5px', color: 'var(--slate-600)' }}>
                    <span>Assigned Field Team: <strong>Your Field Team (Pre-assigned)</strong></span>
                  </div>
                ) : (
                  ['team_member', 'cdc_secretary'].includes(formData.role) && (
                    teams.length === 0 ? (
                      isSuperAdmin ? (
                        <div style={{ background: 'var(--slate-50)', border: '1px solid var(--border-subtle)', padding: '10px 14px', borderRadius: 'var(--radius-sm)', fontSize: '12.5px', color: 'var(--slate-600)' }}>
                          <span>Assign to Team: <em>No field teams exist yet in the database. As Super Admin, this account will be created without team pre-assignment. You can assign them to a team later in Areas management.</em></span>
                        </div>
                      ) : (
                        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '10px 14px', borderRadius: 'var(--radius-sm)', fontSize: '12.5px', color: '#991b1b' }}>
                          <span>No field teams available. You must create a team first in Areas management before creating accounts.</span>
                        </div>
                      )
                    ) : (
                      <div>
                        <label className="form-label">
                          Assign to Team {isSuperAdmin ? '(Optional for Super Admin)' : (formData.role === 'cdc_secretary' ? '*' : '(Optional)')}
                        </label>
                        <select
                          value={formData.teamId}
                          onChange={(e) => setFormData({ ...formData, teamId: e.target.value })}
                          className="select-field"
                          required={formData.role === 'cdc_secretary' && !isSuperAdmin}
                        >
                          <option value="">
                            {isSuperAdmin
                              ? 'No team assignment (assign later)'
                              : formData.role === 'cdc_secretary'
                                ? 'Select a team without leader...'
                                : 'No team assignment'}
                          </option>
                          {(formData.role === 'cdc_secretary'
                            ? teams.filter((t) => !t.leaderId && !t.leader_id)
                            : teams
                          ).map((t) => (
                            <option key={t.id} value={t.id}>
                              Team {t.teamNo} (Max: {t.maxMembers}){t.leaderId ? ' - Has Leader' : ''}
                            </option>
                          ))}
                        </select>
                        {formData.role === 'cdc_secretary' && teams.filter((t) => !t.leaderId && !t.leader_id).length === 0 && (
                          <p style={{ fontSize: '11px', color: isSuperAdmin ? 'var(--amber-600)' : 'var(--danger, #ef4444)', margin: '4px 0 0 0' }}>
                            {isSuperAdmin
                              ? 'All existing teams already have active leaders. Account will be created without a team assignment.'
                              : 'All existing teams already have active leaders. Create a new team first in Areas management.'}
                          </p>
                        )}
                      </div>
                    )
                  )
                )}

                <div>
                  <label className="form-label">
                    {t('users.phone')}
                  </label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="+94771234567"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" onClick={() => setShowSingleModal(false)} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" disabled={actionLoading} className="btn-primary">
                  {actionLoading ? <Loader2 size={16} className="animate-spin" /> : 'Generate Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Accounts Modal (M5.2 Chunked) */}
      {showBulkModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-content" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--slate-900)' }}>
                  {t('users.create_bulk')}
                </h3>
                <p style={{ fontSize: '12px', color: 'var(--slate-500)', margin: '3px 0 0 0' }}>
                  Requests above 100 are automatically chunked in-browser into safe batches.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowBulkModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate-400)', padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCreateBulk}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label className="form-label">
                    Role for Generated Batch *
                  </label>
                  <select
                    value={bulkData.role}
                    onChange={(e) => {
                      const newRole = e.target.value;
                      setBulkData((prev) => ({
                        ...prev,
                        role: newRole,
                        count: newRole === 'cdc_secretary' ? 1 : (prev.count === 1 ? 10 : prev.count),
                        teamId: newRole === 'cdc_secretary'
                          ? (teams.find((t) => t.id === prev.teamId && !t.leaderId && !t.leader_id) ? prev.teamId : '')
                          : prev.teamId,
                      }));
                    }}
                    className="select-field"
                  >
                    {allowedBulkRoles.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>

                {user?.role === 'cdc_secretary' ? (
                  <div style={{ background: 'var(--slate-50)', border: '1px solid var(--border-subtle)', padding: '10px 14px', borderRadius: 'var(--radius-sm)', fontSize: '12.5px', color: 'var(--slate-600)' }}>
                    <span>Assigned Field Team: <strong>Your Field Team (Pre-assigned)</strong></span>
                  </div>
                ) : (
                  ['team_member', 'cdc_secretary'].includes(bulkData.role) && (
                    teams.length === 0 ? (
                      isSuperAdmin ? (
                        <div style={{ background: 'var(--slate-50)', border: '1px solid var(--border-subtle)', padding: '10px 14px', borderRadius: 'var(--radius-sm)', fontSize: '12.5px', color: 'var(--slate-600)' }}>
                          <span>Assign to Team: <em>No field teams exist yet in the database. As Super Admin, accounts will be generated without a team pre-assignment.</em></span>
                        </div>
                      ) : (
                        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '10px 14px', borderRadius: 'var(--radius-sm)', fontSize: '12.5px', color: '#991b1b' }}>
                          <span>No field teams available. You must create a team first in Areas management before generating accounts.</span>
                        </div>
                      )
                    ) : (
                      <div>
                        <label className="form-label">
                          Assign to Team {isSuperAdmin ? '(Optional for Super Admin)' : '*'}
                        </label>
                        <select
                          value={bulkData.teamId}
                          onChange={(e) => {
                            const newTeamId = e.target.value;
                            setBulkData((prev) => ({
                              ...prev,
                              teamId: newTeamId,
                              count: prev.role === 'cdc_secretary' && newTeamId ? 1 : prev.count,
                            }));
                          }}
                          className="select-field"
                          required={!isSuperAdmin}
                        >
                          <option value="">
                            {isSuperAdmin
                              ? 'No team assignment (unassigned)'
                              : 'Select a team...'}
                          </option>
                          {(bulkData.role === 'cdc_secretary'
                            ? teams.filter((t) => !t.leaderId && !t.leader_id)
                            : teams
                          ).map((t) => (
                            <option key={t.id} value={t.id}>
                              Team {t.teamNo} (Max: {t.maxMembers}){t.leaderId ? ' - Has Leader' : ''}
                            </option>
                          ))}
                        </select>
                        {bulkData.role === 'cdc_secretary' && teams.filter((t) => !t.leaderId && !t.leader_id).length === 0 && (
                          <p style={{ fontSize: '11px', color: isSuperAdmin ? 'var(--amber-600)' : 'var(--danger, #ef4444)', margin: '4px 0 0 0' }}>
                            {isSuperAdmin
                              ? 'All existing teams already have active leaders. Accounts will be generated without a team assignment.'
                              : 'All existing teams already have active leaders. Create a new team first in Areas management.'}
                          </p>
                        )}
                      </div>
                    )
                  )
                )}

                <div>
                  <label className="form-label">
                    Total Number of Accounts to Generate {bulkData.role === 'cdc_secretary' && bulkData.teamId ? '(Locked to 1 for Team Leader)' : '(Max 100 per request)'} *
                  </label>
                  <input
                    type="number"
                    min="1"
                    max={bulkData.role === 'cdc_secretary' && bulkData.teamId ? 1 : 100}
                    className="input-field"
                    value={bulkData.count}
                    disabled={bulkData.role === 'cdc_secretary' && !!bulkData.teamId}
                    onChange={(e) => setBulkData({ ...bulkData, count: Math.min(100, Math.max(1, parseInt(e.target.value) || 1)) })}
                    required
                  />
                  {bulkData.role === 'cdc_secretary' && bulkData.teamId && (
                    <p style={{ fontSize: '11.5px', color: 'var(--slate-500)', margin: '4px 0 0 0' }}>
                      Each field team can have exactly one CDC Secretary (team leader).
                    </p>
                  )}
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" onClick={() => setShowBulkModal(false)} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" disabled={actionLoading} className="btn-primary">
                  {actionLoading ? <Loader2 size={16} className="animate-spin" /> : 'Generate Batch & Slips'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Batch Reissue Modal */}
      {showReissueModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-content" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--slate-900)' }}>
                  Reissue Batch Credentials
                </h3>
                <p style={{ fontSize: '12px', color: 'var(--slate-500)', margin: '3px 0 0 0' }}>
                  Regenerate temporary credentials for users in a creation batch who have not yet changed passwords.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowReissueModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate-400)', padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleReissueBatch}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label className="form-label">
                    Batch UUID *
                  </label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="e.g. 12345678-1234-1234-1234-123456789abc"
                    value={reissueBatchId}
                    onChange={(e) => setReissueBatchId(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" onClick={() => setShowReissueModal(false)} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" disabled={actionLoading || !reissueBatchId.trim()} className="btn-primary">
                  {actionLoading ? <Loader2 size={16} className="animate-spin" /> : 'Reissue Passwords & Slips'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Printable Slips & Safe CSV Modal */}
      {latestCredentials && (
        <PrintableSlipsModal
          credentials={latestCredentials}
          onClose={() => setLatestCredentials(null)}
        />
      )}
    </Shell>
  );
}
