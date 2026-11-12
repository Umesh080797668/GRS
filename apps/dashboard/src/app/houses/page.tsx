'use client';

import React, { useState, useEffect } from 'react';
import { Shell } from '@/components/Shell';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import {
  Plus,
  Settings,
  CheckCircle,
  AlertCircle,
  Loader2,
  CheckSquare,
  Square,
  ArrowRight,
  RotateCcw,
  X,
  Search,
  Edit2,
  Trash2,
} from 'lucide-react';

export default function HousesPage() {
  const { t } = useLanguage();
  const { user } = useAuth();

  // Geographic selectors
  const [districts, setDistricts] = useState<any[]>([]);
  const [dsDivisions, setDsDivisions] = useState<any[]>([]);
  const [gnDivisions, setGnDivisions] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);

  const [selectedDistrict, setSelectedDistrict] = useState<string>('');
  const [selectedDs, setSelectedDs] = useState<string>('');
  const [selectedGn, setSelectedGn] = useState<string>('');

  // Households list
  const [households, setHouseholds] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [houseSearch, setHouseSearch] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'assigned' | 'unassigned' | 'finished'>('all');
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  // Selection for team assignment
  const [selectedHouseIds, setSelectedHouseIds] = useState<string[]>([]);
  const [targetTeamId, setTargetTeamId] = useState<string>('');
  const [assigning, setAssigning] = useState<boolean>(false);

  // Modals
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [showGnModal, setShowGnModal] = useState<boolean>(false);
  const [editingHouse, setEditingHouse] = useState<any>(null);
  const [editHouseForm, setEditHouseForm] = useState({
    houseNo: '',
    houseLeaderName: '',
    villageName: '',
    address: '',
    targetFemale: 0,
    targetMale: 0,
    isSamurdhi: false,
    isAswesuma: false,
    isEpf: false,
    isEtf: false,
    hasSpecialNeeds: false,
    langSinhala: false,
    langTamil: false,
    langEnglish: false,
  });
  const [deletingHouse, setDeletingHouse] = useState<any>(null);
  const [deleteHouseReason, setDeleteHouseReason] = useState('');
  const [modalError, setModalError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const canMutateHouse = user?.role === 'super_admin' || user?.role === 'cdc_secretary';

  // Banners
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // Add Household form
  const [newHouseNo, setNewHouseNo] = useState('');
  const [newHeadName, setNewHeadName] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newVillageName, setNewVillageName] = useState('');
  const [newIsEpf, setNewIsEpf] = useState(false);
  const [newIsEtf, setNewIsEtf] = useState(false);
  const [newIsAswesuma, setNewIsAswesuma] = useState(false);
  const [newIsSamurdhi, setNewIsSamurdhi] = useState(false);
  const [newHasSpecialNeeds, setNewHasSpecialNeeds] = useState(false);

  // GN Setup form
  const [gnSecretaryName, setGnSecretaryName] = useState('');
  const [gnSecretaryContact, setGnSecretaryContact] = useState('');
  const [gnSecretaryEmail, setGnSecretaryEmail] = useState('');

  useEffect(() => {
    loadDistricts();
  }, []);

  async function loadDistricts() {
    try {
      setLoading(true);
      const data = await api.getDistricts();
      setDistricts(data);
      if (data.length > 0) {
        const initialDist = user?.districtId || data[0].id;
        setSelectedDistrict(initialDist);
        const dsList = await api.getDsDivisions(initialDist);
        setDsDivisions(dsList);
        if (dsList.length > 0) {
          const initialDs = user?.dsId || dsList[0].id;
          setSelectedDs(initialDs);
          const gnList = await api.getGnDivisions(initialDs);
          setGnDivisions(gnList);
          if (gnList.length > 0) {
            const initialGn = user?.gnId || gnList[0].id;
            setSelectedGn(initialGn);
            loadGnData(initialGn, gnList);
          }
        }
      }
    } catch (err: any) {
      setErrorBanner(err.message || 'Failed to load area data.');
    } finally {
      setLoading(false);
    }
  }

  async function loadGnData(gnId: string, currentGnList?: any[]) {
    setSelectedGn(gnId);
    setSelectedHouseIds([]);
    try {
      const teamList = await api.getTeams(gnId);
      setTeams(teamList);
      if (user?.role === 'cdc_secretary' && user.teamId) {
        setTargetTeamId(user.teamId);
      } else if (teamList.length > 0) {
        setTargetTeamId(teamList[0].id);
      } else {
        setTargetTeamId('');
      }

      // Populate GN setup values
      const gns = currentGnList || gnDivisions;
      const curGn = gns.find((g) => g.id === gnId);
      if (curGn) {
        setGnSecretaryName(curGn.secretaryName || '');
        setGnSecretaryContact(curGn.secretaryContact || '');
        setGnSecretaryEmail(curGn.secretaryEmail || '');
      }

      await fetchHouseholds(gnId, true);
    } catch (err: any) {
      console.error(err);
    }
  }

  async function fetchHouseholds(gnId: string, isReset = false, cursor?: string) {
    if (!gnId) return;
    try {
      setLoading(true);
      const res = await api.getHouseholds({
        gnId,
        search: houseSearch.trim() || undefined,
        limit: 30,
        cursor: isReset ? undefined : cursor,
      });

      const list = Array.isArray(res) ? res : res?.households || res?.items || [];
      setHouseholds(isReset ? list : [...households, ...list]);
      setNextCursor(res?.nextCursor || null);
    } catch (err: any) {
      setErrorBanner(err.message || 'Failed to fetch households.');
    } finally {
      setLoading(false);
    }
  }

  async function handleDistrictChange(distId: string) {
    setSelectedDistrict(distId);
    try {
      const dsList = await api.getDsDivisions(distId);
      setDsDivisions(dsList);
      if (dsList.length > 0) {
        setSelectedDs(dsList[0].id);
        const gnList = await api.getGnDivisions(dsList[0].id);
        setGnDivisions(gnList);
        if (gnList.length > 0) {
          loadGnData(gnList[0].id, gnList);
        } else {
          setSelectedGn('');
          setHouseholds([]);
          setTeams([]);
        }
      } else {
        setSelectedDs('');
        setGnDivisions([]);
        setSelectedGn('');
        setHouseholds([]);
        setTeams([]);
      }
    } catch (err: any) {
      setErrorBanner(err.message);
    }
  }

  async function handleDsChange(dsId: string) {
    setSelectedDs(dsId);
    try {
      const gnList = await api.getGnDivisions(dsId);
      setGnDivisions(gnList);
      if (gnList.length > 0) {
        loadGnData(gnList[0].id, gnList);
      } else {
        setSelectedGn('');
        setHouseholds([]);
        setTeams([]);
      }
    } catch (err: any) {
      setErrorBanner(err.message);
    }
  }

  const handleToggleSelectHouse = (houseId: string) => {
    setSelectedHouseIds((prev) =>
      prev.includes(houseId) ? prev.filter((id) => id !== houseId) : [...prev, houseId]
    );
  };

  const handleSelectAllUnassigned = () => {
    const unassigned = households.filter((h) => !h.teamId).map((h) => h.id);
    setSelectedHouseIds(unassigned);
  };

  const handleClearSelection = () => {
    setSelectedHouseIds([]);
  };

  // Assign houses to team (chunked in batches of ≤200 to comply with API cap)
  async function handleAssignSelected() {
    if (!targetTeamId || selectedHouseIds.length === 0) return;
    setAssigning(true);
    setErrorBanner(null);
    setSuccessBanner(null);
    const BATCH_SIZE = 200;
    const totalToAssign = selectedHouseIds.length;
    let assignedCount = 0;
    try {
      for (let i = 0; i < totalToAssign; i += BATCH_SIZE) {
        const batch = selectedHouseIds.slice(i, i + BATCH_SIZE);
        await api.assignHousesToTeam(targetTeamId, batch);
        assignedCount += batch.length;
      }
      setSuccessBanner(`Successfully assigned ${assignedCount} house(s) to team.`);
      setSelectedHouseIds([]);
      fetchHouseholds(selectedGn, true);
    } catch (err: any) {
      setErrorBanner(err.message || 'Failed to assign houses.');
      if (assignedCount > 0) {
        setSelectedHouseIds(selectedHouseIds.slice(assignedCount));
        fetchHouseholds(selectedGn, true);
      }
    } finally {
      setAssigning(false);
    }
  }

  // Unassign house from team
  async function handleUnassign(house: any) {
    if (!house.teamId) return;
    if (!confirm(t('houses.confirm_unassign').replace('{houseNo}', house.houseNo))) return;
    setErrorBanner(null);
    setSuccessBanner(null);
    try {
      await api.unassignHouseFromTeam(house.teamId, house.id);
      setSuccessBanner(`House #${house.houseNo} unassigned from team.`);
      fetchHouseholds(selectedGn, true);
    } catch (err: any) {
      setErrorBanner(err.message || 'Failed to unassign house.');
    }
  }

  // Finish house
  async function handleFinish(house: any) {
    if (!confirm(t('houses.confirm_finish').replace('{houseNo}', house.houseNo))) return;
    setErrorBanner(null);
    setSuccessBanner(null);
    try {
      await api.finishHousehold(house.id);
      setSuccessBanner(`House #${house.houseNo} marked as finished.`);
      fetchHouseholds(selectedGn, true);
    } catch (err: any) {
      setErrorBanner(err.message || 'Failed to finish house.');
    }
  }

  // Reopen house
  async function handleReopen(house: any) {
    if (!confirm(t('houses.confirm_reopen').replace('{houseNo}', house.houseNo))) return;
    setErrorBanner(null);
    setSuccessBanner(null);
    try {
      await api.reopenHousehold(house.id);
      setSuccessBanner(t('houses.reopened'));
      fetchHouseholds(selectedGn, true);
    } catch (err: any) {
      setErrorBanner(err.message || 'Failed to reopen house.');
    }
  }

  // Add Household
  async function handleAddHousehold(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedGn) return;
    setActionLoading(true);
    setErrorBanner(null);
    setSuccessBanner(null);
    try {
      await api.createHousehold({
        gnId: selectedGn,
        houseNo: newHouseNo.trim(),
        houseLeaderName: newHeadName.trim(),
        address: newAddress.trim() || undefined,
        villageName: newVillageName.trim() || undefined,
        isEpf: newIsEpf,
        isEtf: newIsEtf,
        isAswesuma: newIsAswesuma,
        isSamurdhi: newIsSamurdhi,
        hasSpecialNeeds: newHasSpecialNeeds,
      });
      setShowAddModal(false);
      setSuccessBanner(t('houses.house_added'));
      setNewHouseNo('');
      setNewHeadName('');
      setNewAddress('');
      setNewVillageName('');
      fetchHouseholds(selectedGn, true);
    } catch (err: any) {
      setErrorBanner(`Failed to add household: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  }

  function openEditHouse(house: any) {
    setModalError(null);
    setEditingHouse(house);
    setEditHouseForm({
      houseNo: house.houseNo || '',
      houseLeaderName: house.houseLeaderName || '',
      villageName: house.villageName || '',
      address: house.address || '',
      targetFemale: Number(house.targetFemale ?? 0),
      targetMale: Number(house.targetMale ?? 0),
      isSamurdhi: Boolean(house.isSamurdhi),
      isAswesuma: Boolean(house.isAswesuma),
      isEpf: Boolean(house.isEpf),
      isEtf: Boolean(house.isEtf),
      hasSpecialNeeds: Boolean(house.hasSpecialNeeds),
      langSinhala: Boolean(house.langSinhala),
      langTamil: Boolean(house.langTamil),
      langEnglish: Boolean(house.langEnglish),
    });
  }

  async function handleUpdateHousehold(e: React.FormEvent) {
    e.preventDefault();
    if (!editingHouse) return;
    setActionLoading(true);
    setModalError(null);
    setErrorBanner(null);
    setSuccessBanner(null);
    try {
      await api.updateHousehold(editingHouse.id, {
        houseNo: editHouseForm.houseNo.trim(),
        houseLeaderName: editHouseForm.houseLeaderName.trim(),
        villageName: editHouseForm.villageName.trim(),
        address: editHouseForm.address.trim(),
        targetFemale: Number(editHouseForm.targetFemale) || 0,
        targetMale: Number(editHouseForm.targetMale) || 0,
        isSamurdhi: editHouseForm.isSamurdhi,
        isAswesuma: editHouseForm.isAswesuma,
        isEpf: editHouseForm.isEpf,
        isEtf: editHouseForm.isEtf,
        hasSpecialNeeds: editHouseForm.hasSpecialNeeds,
        langSinhala: editHouseForm.langSinhala,
        langTamil: editHouseForm.langTamil,
        langEnglish: editHouseForm.langEnglish,
      });
      setEditingHouse(null);
      setSuccessBanner(`House #${editHouseForm.houseNo.trim()} updated successfully.`);
      fetchHouseholds(selectedGn, true);
    } catch (err: any) {
      setModalError(err.message || 'Failed to update household.');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDeleteHousehold() {
    if (!deletingHouse) return;
    setActionLoading(true);
    setModalError(null);
    setErrorBanner(null);
    setSuccessBanner(null);
    try {
      await api.deleteHousehold(
        deletingHouse.id,
        deleteHouseReason.trim() || undefined
      );
      const removedNo = deletingHouse.houseNo;
      const removedId = deletingHouse.id;
      setDeletingHouse(null);
      setDeleteHouseReason('');
      setSelectedHouseIds((prev) => prev.filter((id) => id !== removedId));
      setSuccessBanner(`House #${removedNo} deleted successfully.`);
      fetchHouseholds(selectedGn, true);
    } catch (err: any) {
      setModalError(err.message || 'Failed to delete household.');
    } finally {
      setActionLoading(false);
    }
  }

  // GN Setup
  async function handleUpdateGnSetup(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedGn) return;
    setActionLoading(true);
    setErrorBanner(null);
    setSuccessBanner(null);
    try {
      await api.updateGnDivision(selectedGn, {
        secretaryName: gnSecretaryName.trim() || undefined,
        secretaryContact: gnSecretaryContact.trim() || undefined,
        secretaryEmail: gnSecretaryEmail.trim() || undefined,
      });
      setShowGnModal(false);
      setSuccessBanner(t('houses.gn_updated'));
      setGnDivisions((prev) =>
        prev.map((g) =>
          g.id === selectedGn
            ? {
              ...g,
              secretaryName: gnSecretaryName.trim(),
              secretaryContact: gnSecretaryContact.trim(),
              secretaryEmail: gnSecretaryEmail.trim(),
            }
            : g
        )
      );
    } catch (err: any) {
      setErrorBanner(`Failed to update GN setup: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  }

  const displayedHouseholds = households.filter((h) => {
    if (statusFilter === 'unassigned') return !h.teamId;
    if (statusFilter === 'assigned') return Boolean(h.teamId);
    if (statusFilter === 'finished') return Boolean(h.isFinished);
    return true;
  });

  return (
    <Shell activePath="/houses">
      {/* Title & Top Action Bar */}
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
            {t('houses.title')}
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--slate-500)', marginTop: '4px' }}>
            Field household assignment, unassignment, survey completion marking, and GN office contact setup.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setShowGnModal(true)}
            className="btn-secondary"
          >
            <Settings size={15} style={{ color: 'var(--warning)' }} />
            <span>{t('houses.gn_setup')}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="btn-primary"
          >
            <Plus size={15} />
            <span>{t('houses.add_house')}</span>
          </button>
        </div>
      </div>

      {/* Alerts */}
      {errorBanner && (
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
          <span>{errorBanner}</span>
        </div>
      )}

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
            gap: '10px',
            fontSize: '13.5px',
          }}
        >
          <CheckCircle size={18} style={{ flexShrink: 0 }} />
          <span>{successBanner}</span>
        </div>
      )}

      {/* Geographic Scope & GN Details Card */}
      <div className="panel" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1rem',
            marginBottom: '1rem',
          }}
        >
          <div>
            <label className="form-label">District</label>
            <select
              className="select-field"
              value={selectedDistrict}
              onChange={(e) => handleDistrictChange(e.target.value)}
              disabled={user?.role === 'cdc_secretary'}
            >
              {districts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nameEn || d.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="form-label">DS Division</label>
            <select
              className="select-field"
              value={selectedDs}
              onChange={(e) => handleDsChange(e.target.value)}
              disabled={user?.role === 'cdc_secretary'}
            >
              {dsDivisions.map((ds) => (
                <option key={ds.id} value={ds.id}>
                  {ds.nameEn || ds.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="form-label">GN Division</label>
            <select
              className="select-field"
              value={selectedGn}
              onChange={(e) => loadGnData(e.target.value)}
              disabled={user?.role === 'cdc_secretary'}
            >
              {gnDivisions.map((gn) => (
                <option key={gn.id} value={gn.id}>
                  {gn.nameEn || gn.name} ({gn.gnCode || gn.gnNumber})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* GN Info Summary */}
        {selectedGn && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingTop: '0.75rem',
              borderTop: '1px solid var(--slate-100)',
              fontSize: '12.5px',
              color: 'var(--slate-500)',
              flexWrap: 'wrap',
              gap: '8px',
            }}
          >
            <div>
              Secretary Contact:{' '}
              <strong style={{ color: 'var(--slate-800)', fontWeight: 600 }}>
                {gnSecretaryName || 'Not configured'} {gnSecretaryContact ? `(${gnSecretaryContact})` : ''}
              </strong>
            </div>
            <div>
              Active Field Teams:{' '}
              <strong style={{ color: 'var(--primary)', fontWeight: 600 }}>
                {teams.length} teams
              </strong>
            </div>
          </div>
        )}
      </div>

      {/* Batch Assignment Action Bar */}
      <div
        className="panel"
        style={{
          padding: '0.875rem 1.25rem',
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          background: 'var(--slate-50)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--slate-800)' }}>
            Selected: <span style={{ color: 'var(--primary)' }}>{selectedHouseIds.length}</span> houses
          </span>
          <button
            type="button"
            onClick={handleSelectAllUnassigned}
            className="btn-secondary"
            style={{ padding: '4px 10px', fontSize: '12px' }}
          >
            Select All Unassigned
          </button>
          {selectedHouseIds.length > 0 && (
            <button
              type="button"
              onClick={handleClearSelection}
              className="btn-ghost"
              style={{ padding: '4px 10px', fontSize: '12px' }}
            >
              Clear Selection
            </button>
          )}
          {selectedHouseIds.length > 200 && (
            <span
              className="badge badge-warning"
              style={{ fontSize: '11px', padding: '3px 8px' }}
            >
              ⚠️ {selectedHouseIds.length} houses selected (will be chunked in {Math.ceil(selectedHouseIds.length / 200)} batches)
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: 'auto' }}>
          <select
            className="select-field"
            style={{ width: 'auto', minWidth: '220px', padding: '0.45rem 0.75rem', fontSize: '12.5px' }}
            value={targetTeamId}
            onChange={(e) => setTargetTeamId(e.target.value)}
            disabled={teams.length === 0 || user?.role === 'cdc_secretary'}
          >
            {teams.length === 0 ? (
              <option value="">No teams available in GN</option>
            ) : (
              teams.map((t) => (
                <option key={t.id} value={t.id}>
                  Team {t.teamNo} ({t.activeMembers ?? t.memberLimit ?? 0}/{t.maxMembers} members)
                </option>
              ))
            )}
          </select>
          <button
            type="button"
            onClick={handleAssignSelected}
            disabled={assigning || selectedHouseIds.length === 0 || !targetTeamId}
            className="btn-primary"
            style={{ padding: '0.45rem 1rem', fontSize: '12.5px' }}
          >
            {assigning ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <ArrowRight size={14} />
            )}
            <span>{t('houses.assign_btn')}</span>
          </button>
        </div>
      </div>

      {/* Household Table with Status Filters */}
      <div className="panel" style={{ overflow: 'hidden' }}>
        <div
          style={{
            padding: '1rem 1.25rem',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div style={{ position: 'relative', width: '280px' }}>
            <Search
              size={15}
              color="var(--slate-400)"
              style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }}
            />
            <input
              type="text"
              placeholder="Search house # or name..."
              value={houseSearch}
              onChange={(e) => {
                setHouseSearch(e.target.value);
                fetchHouseholds(selectedGn, true);
              }}
              className="input-field"
              style={{ paddingLeft: '32px', padding: '0.45rem 0.75rem 0.45rem 32px', fontSize: '12.5px' }}
            />
          </div>

          {/* Status Tabs */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              background: 'var(--slate-100)',
              borderRadius: 'var(--radius-sm)',
              padding: '3px',
              gap: '2px',
            }}
          >
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              style={{
                padding: '4px 10px',
                fontSize: '12px',
                fontWeight: statusFilter === 'all' ? 600 : 500,
                borderRadius: 'var(--radius-xs)',
                border: 'none',
                cursor: 'pointer',
                background: statusFilter === 'all' ? '#ffffff' : 'transparent',
                color: statusFilter === 'all' ? 'var(--slate-900)' : 'var(--slate-600)',
                boxShadow: statusFilter === 'all' ? '0 1px 2px rgba(15, 23, 42, 0.08)' : 'none',
              }}
            >
              All ({households.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('unassigned')}
              style={{
                padding: '4px 10px',
                fontSize: '12px',
                fontWeight: statusFilter === 'unassigned' ? 600 : 500,
                borderRadius: 'var(--radius-xs)',
                border: 'none',
                cursor: 'pointer',
                background: statusFilter === 'unassigned' ? '#ffffff' : 'transparent',
                color: statusFilter === 'unassigned' ? 'var(--slate-900)' : 'var(--slate-600)',
                boxShadow: statusFilter === 'unassigned' ? '0 1px 2px rgba(15, 23, 42, 0.08)' : 'none',
              }}
            >
              {t('houses.unassigned')} ({households.filter((h) => !h.teamId).length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('assigned')}
              style={{
                padding: '4px 10px',
                fontSize: '12px',
                fontWeight: statusFilter === 'assigned' ? 600 : 500,
                borderRadius: 'var(--radius-xs)',
                border: 'none',
                cursor: 'pointer',
                background: statusFilter === 'assigned' ? '#ffffff' : 'transparent',
                color: statusFilter === 'assigned' ? 'var(--slate-900)' : 'var(--slate-600)',
                boxShadow: statusFilter === 'assigned' ? '0 1px 2px rgba(15, 23, 42, 0.08)' : 'none',
              }}
            >
              Assigned ({households.filter((h) => h.teamId).length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('finished')}
              style={{
                padding: '4px 10px',
                fontSize: '12px',
                fontWeight: statusFilter === 'finished' ? 600 : 500,
                borderRadius: 'var(--radius-xs)',
                border: 'none',
                cursor: 'pointer',
                background: statusFilter === 'finished' ? '#ffffff' : 'transparent',
                color: statusFilter === 'finished' ? 'var(--slate-900)' : 'var(--slate-600)',
                boxShadow: statusFilter === 'finished' ? '0 1px 2px rgba(15, 23, 42, 0.08)' : 'none',
              }}
            >
              {t('houses.finished')} ({households.filter((h) => h.isFinished).length})
            </button>
          </div>
        </div>

        {/* Table Content */}
        <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '40px', textAlign: 'center' }}>
                  <span className="sr-only">Select</span>
                </th>
                <th>{t('houses.house_no')}</th>
                <th>{t('houses.head_name')}</th>
                <th>{t('houses.village_name')}</th>
                <th>{t('houses.team_assigned')}</th>
                <th>{t('houses.status')}</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayedHouseholds.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', color: 'var(--slate-400)', padding: '2.5rem' }}>
                    {loading ? 'Loading households...' : 'No households matching criteria.'}
                  </td>
                </tr>
              ) : (
                displayedHouseholds.map((h) => {
                  const isSelected = selectedHouseIds.includes(h.id);
                  const isAssigned = Boolean(h.teamId);
                  const isFinished = Boolean(h.isFinished);
                  const assignedTeam = teams.find((t) => t.id === h.teamId);

                  return (
                    <tr key={h.id}>
                      <td style={{ textAlign: 'center' }}>
                        {!isAssigned ? (
                          <button
                            type="button"
                            onClick={() => handleToggleSelectHouse(h.id)}
                            aria-label={`Select house ${h.houseNo}`}
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              color: isSelected ? 'var(--primary)' : 'var(--slate-400)',
                              display: 'inline-flex',
                            }}
                          >
                            {isSelected ? (
                              <CheckSquare size={16} />
                            ) : (
                              <Square size={16} />
                            )}
                          </button>
                        ) : (
                          <span style={{ color: 'var(--slate-300)' }}>—</span>
                        )}
                      </td>
                      <td style={{ fontWeight: 600, fontFamily: 'monospace', color: 'var(--slate-900)' }}>
                        #{h.houseNo}
                      </td>
                      <td style={{ fontWeight: 600, color: 'var(--slate-900)' }}>
                        {h.houseLeaderName}
                      </td>
                      <td style={{ fontSize: '12.5px', color: 'var(--slate-500)' }}>
                        {h.villageName || h.address || '—'}
                      </td>
                      <td>
                        {isAssigned ? (
                          <span className="badge badge-info">
                            Team {assignedTeam ? assignedTeam.teamNo : h.teamId.slice(0, 8)}
                          </span>
                        ) : (
                          <span className="badge badge-warning">
                            {t('houses.unassigned')}
                          </span>
                        )}
                      </td>
                      <td>
                        {isFinished ? (
                          <span className="badge badge-success">
                            {t('houses.finished')}
                          </span>
                        ) : isAssigned ? (
                          <span className="badge badge-info">
                            {t('houses.in_progress')}
                          </span>
                        ) : (
                          <span className="badge badge-neutral">
                            Ready
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                          {isAssigned && !isFinished && (
                            <button
                              type="button"
                              onClick={() => handleFinish(h)}
                              className="btn-secondary"
                              style={{ padding: '4px 8px', fontSize: '11px', color: 'var(--success)' }}
                              title={t('houses.finish_house')}
                            >
                              {t('houses.finish_house')}
                            </button>
                          )}
                          {isAssigned && isFinished && (
                            <button
                              type="button"
                              onClick={() => handleReopen(h)}
                              className="btn-secondary"
                              style={{ padding: '4px 8px', fontSize: '11px', color: 'var(--warning)' }}
                              title={t('houses.reopen_house')}
                            >
                              <RotateCcw size={12} />
                              <span>{t('houses.reopen_house')}</span>
                            </button>
                          )}
                          {isAssigned && (
                            <button
                              type="button"
                              onClick={() => handleUnassign(h)}
                              className="btn-danger"
                              style={{ padding: '4px 8px', fontSize: '11px' }}
                              title={t('houses.unassign')}
                            >
                              {t('houses.unassign')}
                            </button>
                          )}
                          {canMutateHouse && (
                            <>
                              <button
                                type="button"
                                onClick={() => openEditHouse(h)}
                                className="btn-secondary"
                                style={{ padding: '4px 8px', fontSize: '11px' }}
                                title={t('houses.edit_house')}
                                aria-label={t('houses.edit_house')}
                              >
                                <Edit2 size={12} />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setModalError(null);
                                  setDeleteHouseReason('');
                                  setDeletingHouse(h);
                                }}
                                className="btn-secondary"
                                style={{
                                  padding: '4px 8px',
                                  fontSize: '11px',
                                  color: 'var(--danger-text)',
                                  borderColor: 'var(--danger-border)',
                                }}
                                title={t('houses.delete_house')}
                                aria-label={t('houses.delete_house')}
                              >
                                <Trash2 size={12} />
                              </button>
                            </>
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

        {nextCursor && (
          <div style={{ padding: '1rem', borderTop: '1px solid var(--border-subtle)', textAlign: 'center' }}>
            <button
              type="button"
              onClick={() => fetchHouseholds(selectedGn, false, nextCursor)}
              disabled={loading}
              className="btn-secondary"
            >
              {loading ? 'Loading...' : 'Load More Households'}
            </button>
          </div>
        )}
      </div>

      {/* Add Household Modal */}
      {showAddModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-content" style={{ maxWidth: '520px' }}>
            <div className="modal-header">
              <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--slate-900)' }}>
                {t('houses.add_house')}
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate-400)', padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleAddHousehold}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label className="form-label">House Number *</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="e.g. 102/B"
                      value={newHouseNo}
                      onChange={(e) => setNewHouseNo(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="form-label">Head of Household *</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="e.g. K. Perera"
                      value={newHeadName}
                      onChange={(e) => setNewHeadName(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="form-label">Village / Street</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="e.g. Pallekele"
                    value={newVillageName}
                    onChange={(e) => setNewVillageName(e.target.value)}
                  />
                </div>

                <div>
                  <label className="form-label">Full Postal Address</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="e.g. No. 102/B, Temple Road"
                    value={newAddress}
                    onChange={(e) => setNewAddress(e.target.value)}
                  />
                </div>

                <div>
                  <label className="form-label">Social Welfare & Identifiers</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px', fontSize: '13px', marginTop: '4px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={newIsSamurdhi} onChange={(e) => setNewIsSamurdhi(e.target.checked)} />
                      <span>Samurdhi</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={newIsAswesuma} onChange={(e) => setNewIsAswesuma(e.target.checked)} />
                      <span>Aswesuma</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={newIsEpf} onChange={(e) => setNewIsEpf(e.target.checked)} />
                      <span>EPF</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={newIsEtf} onChange={(e) => setNewIsEtf(e.target.checked)} />
                      <span>ETF</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={newHasSpecialNeeds} onChange={(e) => setNewHasSpecialNeeds(e.target.checked)} />
                      <span>Special Needs</span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" onClick={() => setShowAddModal(false)} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" disabled={actionLoading} className="btn-primary">
                  {actionLoading ? <Loader2 size={16} className="animate-spin" /> : 'Register House'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* GN Setup Modal */}
      {showGnModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-content" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--slate-900)' }}>
                {t('houses.gn_setup')}
              </h3>
              <button
                type="button"
                onClick={() => setShowGnModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate-400)', padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleUpdateGnSetup}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label className="form-label">CDC / GN Secretary Full Name</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="e.g. W.M. Jayawardena"
                    value={gnSecretaryName}
                    onChange={(e) => setGnSecretaryName(e.target.value)}
                  />
                </div>

                <div>
                  <label className="form-label">Secretary Contact Phone</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="e.g. +94771234567"
                    value={gnSecretaryContact}
                    onChange={(e) => setGnSecretaryContact(e.target.value)}
                  />
                </div>

                <div>
                  <label className="form-label">Secretary Email</label>
                  <input
                    type="email"
                    className="input-field"
                    placeholder="e.g. secretary.gn101@grs.gov.lk"
                    value={gnSecretaryEmail}
                    onChange={(e) => setGnSecretaryEmail(e.target.value)}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" onClick={() => setShowGnModal(false)} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" disabled={actionLoading} className="btn-primary">
                  {actionLoading ? <Loader2 size={16} className="animate-spin" /> : 'Save Setup'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Household Modal */}
      {editingHouse && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-content" style={{ maxWidth: '560px' }}>
            <div className="modal-header">
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--slate-900)' }}>
                  {t('houses.edit_house')}
                </h3>
                <p style={{ fontSize: '12px', color: 'var(--slate-500)', margin: '2px 0 0 0' }}>
                  House #{editingHouse.houseNo} — {editingHouse.houseLeaderName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setEditingHouse(null); setModalError(null); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate-400)', padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleUpdateHousehold}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {modalError && (
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
                    <span>{modalError}</span>
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label className="form-label">House Number *</label>
                    <input
                      type="text"
                      className="input-field"
                      value={editHouseForm.houseNo}
                      onChange={(e) => setEditHouseForm({ ...editHouseForm, houseNo: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="form-label">Head of Household *</label>
                    <input
                      type="text"
                      className="input-field"
                      value={editHouseForm.houseLeaderName}
                      onChange={(e) => setEditHouseForm({ ...editHouseForm, houseLeaderName: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label className="form-label">Village / Street</label>
                    <input
                      type="text"
                      className="input-field"
                      value={editHouseForm.villageName}
                      onChange={(e) => setEditHouseForm({ ...editHouseForm, villageName: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="form-label">Full Postal Address</label>
                    <input
                      type="text"
                      className="input-field"
                      value={editHouseForm.address}
                      onChange={(e) => setEditHouseForm({ ...editHouseForm, address: e.target.value })}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label className="form-label">Target Female Count</label>
                    <input
                      type="number"
                      min="0"
                      max="99"
                      className="input-field"
                      value={editHouseForm.targetFemale}
                      onChange={(e) => setEditHouseForm({ ...editHouseForm, targetFemale: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <div>
                    <label className="form-label">Target Male Count</label>
                    <input
                      type="number"
                      min="0"
                      max="99"
                      className="input-field"
                      value={editHouseForm.targetMale}
                      onChange={(e) => setEditHouseForm({ ...editHouseForm, targetMale: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                </div>

                <div>
                  <label className="form-label">Social Welfare & Identifiers</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px', fontSize: '13px', marginTop: '4px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={editHouseForm.isSamurdhi} onChange={(e) => setEditHouseForm({ ...editHouseForm, isSamurdhi: e.target.checked })} />
                      <span>Samurdhi</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={editHouseForm.isAswesuma} onChange={(e) => setEditHouseForm({ ...editHouseForm, isAswesuma: e.target.checked })} />
                      <span>Aswesuma</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={editHouseForm.isEpf} onChange={(e) => setEditHouseForm({ ...editHouseForm, isEpf: e.target.checked })} />
                      <span>EPF</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={editHouseForm.isEtf} onChange={(e) => setEditHouseForm({ ...editHouseForm, isEtf: e.target.checked })} />
                      <span>ETF</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={editHouseForm.hasSpecialNeeds} onChange={(e) => setEditHouseForm({ ...editHouseForm, hasSpecialNeeds: e.target.checked })} />
                      <span>Special Needs</span>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="form-label">Household Languages</label>
                  <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '13px', marginTop: '4px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={editHouseForm.langSinhala} onChange={(e) => setEditHouseForm({ ...editHouseForm, langSinhala: e.target.checked })} />
                      <span>Sinhala</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={editHouseForm.langTamil} onChange={(e) => setEditHouseForm({ ...editHouseForm, langTamil: e.target.checked })} />
                      <span>Tamil</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={editHouseForm.langEnglish} onChange={(e) => setEditHouseForm({ ...editHouseForm, langEnglish: e.target.checked })} />
                      <span>English</span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" onClick={() => { setEditingHouse(null); setModalError(null); }} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" disabled={actionLoading} className="btn-primary">
                  {actionLoading ? <Loader2 size={16} className="animate-spin" /> : t('common.save_changes')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Household Confirmation Modal */}
      {deletingHouse && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-content" style={{ maxWidth: '440px' }}>
            <div className="modal-header">
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--danger-text)' }}>
                  {t('houses.delete_house')}
                </h3>
                <p style={{ fontSize: '12px', color: 'var(--slate-500)', margin: '2px 0 0 0' }}>
                  House #{deletingHouse.houseNo} — {deletingHouse.houseLeaderName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setDeletingHouse(null); setModalError(null); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate-400)', padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {modalError && (
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
                  <span>{modalError}</span>
                </div>
              )}
              <p style={{ fontSize: '13.5px', color: 'var(--slate-700)', margin: 0, lineHeight: 1.5 }}>
                Are you sure you want to delete household <strong>#{deletingHouse.houseNo}</strong>? Households with active client survey records attached cannot be deleted until those client records are removed or reassigned (Decision C6).
              </p>
              <div>
                <label className="form-label">Deletion Reason (Optional)</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g. Duplicate or entered in wrong GN"
                  value={deleteHouseReason}
                  onChange={(e) => setDeleteHouseReason(e.target.value)}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" onClick={() => { setDeletingHouse(null); setModalError(null); }} className="btn-secondary">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteHousehold}
                disabled={actionLoading}
                className="btn-secondary"
                style={{
                  background: 'var(--danger-bg)',
                  borderColor: 'var(--danger-border)',
                  color: 'var(--danger-text)',
                  fontWeight: 600,
                }}
              >
                {actionLoading ? <Loader2 size={16} className="animate-spin" /> : t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}
