'use client';

import React, { useEffect, useState } from 'react';
import Shell from '../../components/Shell';
import PrintableSlipsModal, { CredentialSlipItem } from '../../components/PrintableSlipsModal';
import { useLanguage } from '../../context/LanguageContext';
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
  Loader2,
} from 'lucide-react';

export default function UsersPage() {
  const { t } = useLanguage();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modals
  const [showSingleModal, setShowSingleModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [latestCredentials, setLatestCredentials] = useState<CredentialSlipItem[] | null>(null);

  // Form states
  const [formData, setFormData] = useState({
    userCode: '',
    fullName: '',
    role: 'team_member',
    email: '',
    phone: '',
    teamId: '',
  });

  const [bulkData, setBulkData] = useState({
    role: 'team_member',
    count: 10,
    teamId: '',
  });

  const [actionLoading, setActionLoading] = useState(false);

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
    try {
      const res = await api.createAccount(formData);
      setShowSingleModal(false);
      setLatestCredentials([
        {
          userCode: res.userCode || res.user_code,
          role: res.role || formData.role,
          fullName: res.fullName || formData.fullName,
          initialPassword: res.initialPassword || res.initial_password,
        },
      ]);
      setFormData({ userCode: '', fullName: '', role: 'team_member', email: '', phone: '', teamId: '' });
      fetchAccounts(undefined, true);
    } catch (err: any) {
      alert(`Error creating account: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateBulk = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      // Chunk bulk creation in batches of <= 100 per M5.2
      const allCreds: CredentialSlipItem[] = [];
      let remaining = Number(bulkData.count);

      while (remaining > 0) {
        const chunk = remaining > 100 ? 100 : remaining;
        const res = await api.createBulkAccounts({
          role: bulkData.role,
          count: chunk,
          teamId: bulkData.teamId || undefined,
        });

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
    } catch (err: any) {
      alert(`Error in bulk creation: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeactivate = async (id: string) => {
    if (!confirm('Are you sure you want to deactivate this account?')) return;
    try {
      await api.deactivateAccount(id);
      fetchAccounts(undefined, true);
    } catch (err: any) {
      alert(`Failed to deactivate: ${err.message}`);
    }
  };

  const handleReactivate = async (id: string) => {
    try {
      await api.reactivateAccount(id);
      fetchAccounts(undefined, true);
    } catch (err: any) {
      alert(`Failed to reactivate: ${err.message}`);
    }
  };

  const handleResetPassword = async (id: string) => {
    if (!confirm('Reset password for this user? A temporary password will be generated.')) return;
    try {
      const res = await api.resetAccountPassword(id);
      setLatestCredentials([
        {
          userCode: res.userCode || res.user_code,
          role: res.role,
          initialPassword: res.initialPassword || res.initial_password,
        },
      ]);
    } catch (err: any) {
      alert(`Failed to reset password: ${err.message}`);
    }
  };

  return (
    <Shell>
      {/* Page Title & Action Buttons */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em', margin: 0 }}>
            {t('users.title')}
          </h2>
          <p style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
            Administrative account lifecycle management, printable credential slips, and role provisioning.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={() => setShowSingleModal(true)} className="btn-secondary">
            <UserPlus size={16} />
            <span>{t('users.create_single')}</span>
          </button>

          <button onClick={() => setShowBulkModal(true)} className="btn-primary">
            <Layers size={16} />
            <span>{t('users.create_bulk')} (≤100)</span>
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px 16px', color: '#dc2626', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* Filters & Search */}
      <div className="glass-panel" style={{ padding: '1rem', borderRadius: '12px', marginBottom: '1.5rem', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
          <Search size={16} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text"
            className="input-field"
            placeholder="Search by User Code, Name, or Phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: '36px' }}
          />
        </div>

        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="input-field"
          style={{ width: '180px' }}
        >
          <option value="">All Roles</option>
          <option value="team_member">Team Member</option>
          <option value="cdc_secretary">CDC Secretary</option>
          <option value="sda">SDA (Divisional)</option>
          <option value="dc">DC (District)</option>
          <option value="admin">Administrator</option>
        </select>

        <button onClick={() => fetchAccounts(undefined, true)} className="btn-secondary" style={{ padding: '0.625rem 0.875rem' }}>
          <RefreshCw size={15} />
        </button>
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
                <td colSpan={7} style={{ textAlign: 'center', color: '#94a3b8', padding: '2.5rem' }}>
                  {loading ? 'Loading user accounts...' : 'No accounts matching criteria.'}
                </td>
              </tr>
            ) : (
              accounts.map((acc) => {
                const isActive = acc.is_active ?? acc.isActive ?? true;
                return (
                  <tr key={acc.id}>
                    <td style={{ fontWeight: 700, fontFamily: 'monospace', color: '#1e3a8a' }}>
                      {acc.user_code || acc.userCode}
                    </td>
                    <td style={{ fontWeight: 600 }}>{acc.full_name || acc.fullName || '-'}</td>
                    <td>
                      <span className="badge badge-info" style={{ textTransform: 'uppercase' }}>
                        {acc.role}
                      </span>
                    </td>
                    <td>{acc.phone_e164 || acc.phone || '-'}</td>
                    <td>
                      {isActive ? (
                        <span className="badge badge-success">{t('users.active')}</span>
                      ) : (
                        <span className="badge badge-danger">{t('users.deactivated')}</span>
                      )}
                    </td>
                    <td style={{ fontSize: '12px', color: '#64748b' }}>
                      {formatDate(acc.created_at || acc.createdAt)}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => handleResetPassword(acc.id)}
                          title={t('users.reset_pwd')}
                          className="btn-secondary"
                          style={{ padding: '4px 8px', fontSize: '11px' }}
                        >
                          <KeyRound size={13} />
                        </button>

                        {isActive ? (
                          <button
                            onClick={() => handleDeactivate(acc.id)}
                            title={t('users.deactivate')}
                            className="btn-danger"
                            style={{ padding: '4px 8px', fontSize: '11px' }}
                          >
                            <UserX size={13} />
                          </button>
                        ) : (
                          <button
                            onClick={() => handleReactivate(acc.id)}
                            title={t('users.reactivate')}
                            className="btn-secondary"
                            style={{ padding: '4px 8px', fontSize: '11px', color: '#059669' }}
                          >
                            <UserCheck size={13} />
                          </button>
                        )}
                      </div>
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
        <div className="modal-backdrop">
          <div className="modal-content">
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #e2e8f0' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>{t('users.create_single')}</h3>
            </div>
            <form onSubmit={handleCreateSingle} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  User Code (Optional, leave blank to auto-generate)
                </label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g. AGT-101"
                  value={formData.userCode}
                  onChange={(e) => setFormData({ ...formData, userCode: e.target.value })}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  {t('users.name')}
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
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  {t('users.role')}
                </label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  className="input-field"
                >
                  <option value="team_member">Team Member (Enumerator)</option>
                  <option value="cdc_secretary">CDC Secretary (Level 4)</option>
                  <option value="sda">SDA (Level 3 Divisional)</option>
                  <option value="dc">DC (Level 2 District)</option>
                  <option value="admin">Administrator</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
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

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '1rem' }}>
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
        <div className="modal-backdrop">
          <div className="modal-content">
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #e2e8f0' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>{t('users.create_bulk')}</h3>
              <p style={{ fontSize: '12px', color: '#64748b', margin: '4px 0 0 0' }}>
                Requests above 100 are automatically chunked in-browser into safe batches.
              </p>
            </div>
            <form onSubmit={handleCreateBulk} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Role for Generated Batch
                </label>
                <select
                  value={bulkData.role}
                  onChange={(e) => setBulkData({ ...bulkData, role: e.target.value })}
                  className="input-field"
                >
                  <option value="team_member">Team Member</option>
                  <option value="cdc_secretary">CDC Secretary</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Total Number of Accounts to Generate
                </label>
                <input
                  type="number"
                  min="1"
                  max="500"
                  className="input-field"
                  value={bulkData.count}
                  onChange={(e) => setBulkData({ ...bulkData, count: parseInt(e.target.value) || 1 })}
                  required
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '1rem' }}>
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
