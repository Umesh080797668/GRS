'use client';

import React, { useEffect, useState } from 'react';
import Shell from '../../components/Shell';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import { Lock, Unlock, AlertCircle, CheckCircle, Trash2, Plus, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface AreaLock {
  key: string;
  locked: boolean;
}

export default function PlatformLockPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [platformLocked, setPlatformLocked] = useState(false);
  const [areaLocks, setAreaLocks] = useState<AreaLock[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // New area lock form
  const [newLockType, setNewLockType] = useState<'gn' | 'ds' | 'district'>('gn');
  const [newLockId, setNewLockId] = useState('');

  useEffect(() => {
    if (authLoading) return;
    if (!user || user.role !== 'super_admin') {
      router.replace('/progress');
      return;
    }
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [cfg, locks] = await Promise.all([
        api.getConfig(),
        api.getAreaLocks().catch(() => [] as AreaLock[]),
      ]);
      setPlatformLocked(cfg?.platformLocked ?? false);
      setAreaLocks(Array.isArray(locks) ? locks : []);
    } catch (err: any) {
      setError(err.message || 'Failed to load platform lock status.');
    } finally {
      setLoading(false);
    }
  };

  const handleSystemLockToggle = async () => {
    setActionLoading(true);
    setError(null);
    setSuccess(null);
    try {
      await api.updatePlatformLock(!platformLocked);
      setPlatformLocked((prev) => !prev);
      setSuccess(
        !platformLocked
          ? 'Platform locked. All non-super_admin users are now blocked.'
          : 'Platform unlocked. Normal access restored.',
      );
    } catch (err: any) {
      setError(err.message || 'Failed to toggle system lock.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddAreaLock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLockId.trim()) {
      setError('Area ID is required.');
      return;
    }
    setActionLoading(true);
    setError(null);
    setSuccess(null);
    try {
      await api.setAreaLock(newLockType, newLockId.trim(), true);
      setSuccess(`${newLockType.toUpperCase()} lock set for ID: ${newLockId.trim()}`);
      setNewLockId('');
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to set area lock.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemoveAreaLock = async (lock: AreaLock) => {
    // key format: gn_lock:ID, ds_lock:ID, district_lock:ID
    const parts = lock.key.split(':');
    if (parts.length < 2) return;
    const prefix = parts[0]; // e.g. gn_lock
    const id = parts.slice(1).join(':');
    const type = prefix === 'gn_lock' ? 'gn' : prefix === 'ds_lock' ? 'ds' : 'district';

    setActionLoading(true);
    setError(null);
    setSuccess(null);
    try {
      await api.setAreaLock(type, id, false);
      setSuccess(`Area lock removed for ${type.toUpperCase()}: ${id}`);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to remove area lock.');
    } finally {
      setActionLoading(false);
    }
  };

  const getLockTypeLabel = (key: string) => {
    if (key.startsWith('gn_lock:')) return 'GN Division';
    if (key.startsWith('ds_lock:')) return 'DS Division';
    if (key.startsWith('district_lock:')) return 'District';
    return key;
  };

  const getLockId = (key: string) => {
    const idx = key.indexOf(':');
    return idx >= 0 ? key.slice(idx + 1) : key;
  };

  if (authLoading || (!user && !authLoading)) {
    return null;
  }

  return (
    <Shell>
      {/* Header */}
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
            Platform Lock
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--slate-500)', marginTop: '4px' }}>
            Control system-wide and area-level access restrictions. Super Admin only.
          </p>
        </div>
        <button
          type="button"
          onClick={loadData}
          className="btn-secondary"
          title="Refresh"
          style={{ padding: '0.55rem 0.75rem' }}
          disabled={loading}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Feedback */}
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

      {success && (
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
          <span>{success}</span>
        </div>
      )}

      {/* System Lock Panel */}
      <div
        className="panel"
        style={{
          padding: '1.5rem',
          marginBottom: '1.5rem',
          borderLeft: platformLocked ? '4px solid var(--danger-border, #fca5a5)' : '4px solid var(--success-border, #86efac)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: platformLocked ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {platformLocked ? (
                <Lock size={22} color="#ef4444" />
              ) : (
                <Unlock size={22} color="#22c55e" />
              )}
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--slate-900)' }}>
                System Lock
              </div>
              <div style={{ fontSize: '13px', color: 'var(--slate-500)', marginTop: '2px' }}>
                {platformLocked
                  ? 'Platform is LOCKED — all users except super_admin are blocked.'
                  : 'Platform is OPEN — all users have normal access.'}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleSystemLockToggle}
            className={platformLocked ? 'btn-secondary' : 'btn-danger'}
            disabled={actionLoading || loading}
            style={{ minWidth: '130px' }}
          >
            {platformLocked ? (
              <>
                <Unlock size={15} />
                <span>Unlock Platform</span>
              </>
            ) : (
              <>
                <Lock size={15} />
                <span>Lock Platform</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Area Locks Panel */}
      <div className="panel" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--slate-900)', marginBottom: '1rem', marginTop: 0 }}>
          Area Locks
        </h2>

        {/* Add new area lock form */}
        <form
          onSubmit={handleAddAreaLock}
          style={{
            display: 'flex',
            gap: '10px',
            flexWrap: 'wrap',
            alignItems: 'flex-end',
            marginBottom: '1.25rem',
            padding: '1rem',
            background: 'var(--slate-50, #f8fafc)',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--slate-600)' }}>
              Lock Type
            </label>
            <select
              value={newLockType}
              onChange={(e) => setNewLockType(e.target.value as 'gn' | 'ds' | 'district')}
              className="select-field"
              style={{ width: '140px' }}
            >
              <option value="gn">GN Division</option>
              <option value="ds">DS Division</option>
              <option value="district">District</option>
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: '180px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--slate-600)' }}>
              Area ID
            </label>
            <input
              type="text"
              className="input-field"
              placeholder="e.g. area-uuid or code"
              value={newLockId}
              onChange={(e) => setNewLockId(e.target.value)}
            />
          </div>
          <button
            type="submit"
            className="btn-danger"
            disabled={actionLoading || !newLockId.trim()}
          >
            <Lock size={14} />
            <span>Apply Lock</span>
          </button>
        </form>

        {/* Active area locks list */}
        {loading ? (
          <p style={{ color: 'var(--slate-400)', fontSize: '13px', textAlign: 'center', padding: '1rem 0' }}>
            Loading area locks…
          </p>
        ) : areaLocks.length === 0 ? (
          <p style={{ color: 'var(--slate-400)', fontSize: '13px', textAlign: 'center', padding: '1rem 0' }}>
            No area locks currently active.
          </p>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Area ID</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {areaLocks.map((lock) => (
                  <tr key={lock.key}>
                    <td>
                      <span className="badge badge-neutral" style={{ textTransform: 'uppercase' }}>
                        {getLockTypeLabel(lock.key)}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--primary)' }}>
                      {getLockId(lock.key)}
                    </td>
                    <td>
                      {lock.locked ? (
                        <span className="badge badge-danger">Locked</span>
                      ) : (
                        <span className="badge badge-success">Unlocked</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        onClick={() => handleRemoveAreaLock(lock)}
                        className="btn-secondary"
                        title="Remove lock"
                        disabled={actionLoading}
                        style={{ padding: '5px 8px', fontSize: '11px', color: 'var(--danger-text)', borderColor: 'var(--danger-border)' }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Info callout */}
      <div
        style={{
          padding: '1rem 1.25rem',
          background: 'rgba(99,102,241,0.06)',
          border: '1px solid rgba(99,102,241,0.2)',
          borderRadius: 'var(--radius-sm)',
          fontSize: '13px',
          color: 'var(--slate-600)',
          lineHeight: 1.6,
        }}
      >
        <strong style={{ color: 'var(--slate-800)' }}>How it works:</strong> The System Lock blocks
        all users except Super Admin. Area locks target users belonging to a specific GN, DS, or
        District. Locked users see a full-screen access suspended message and cannot navigate the
        dashboard.
      </div>
    </Shell>
  );
}
