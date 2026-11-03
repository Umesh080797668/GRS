'use client';

import React, { useState, useEffect } from 'react';
import { Shell } from '@/components/Shell';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import {
  Home,
  Plus,
  Settings,
  CheckCircle,
  AlertCircle,
  Loader2,
  CheckSquare,
  Square,
  ArrowRight,
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
  const [actionLoading, setActionLoading] = useState<boolean>(false);

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
      if (teamList.length > 0) {
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

  // Assign houses to team
  async function handleAssignSelected() {
    if (!targetTeamId || selectedHouseIds.length === 0) return;
    setAssigning(true);
    setErrorBanner(null);
    setSuccessBanner(null);
    try {
      await api.assignHousesToTeam(targetTeamId, selectedHouseIds);
      setSuccessBanner(`Successfully assigned ${selectedHouseIds.length} house(s) to team.`);
      setSelectedHouseIds([]);
      fetchHouseholds(selectedGn, true);
    } catch (err: any) {
      setErrorBanner(err.message || 'Failed to assign houses.');
    } finally {
      setAssigning(false);
    }
  }

  // Unassign house from team
  async function handleUnassign(house: any) {
    if (!house.teamId) return;
    if (!confirm(`Unassign house #${house.houseNo} from team?`)) return;
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
    if (!confirm(`Mark house #${house.houseNo} as finished?`)) return;
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
      // Update local GN list
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
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
              <Home className="w-7 h-7 text-emerald-400" />
              {t('houses.title')}
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Field household assignment, unassignment, survey completion marking, and GN office contact setup.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setShowGnModal(true)}
              className="btn btn-secondary text-sm flex items-center gap-2"
            >
              <Settings className="w-4 h-4 text-amber-400" />
              {t('houses.gn_setup')}
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="btn btn-primary text-sm flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              {t('houses.add_house')}
            </button>
          </div>
        </div>

        {/* Alerts */}
        {errorBanner && (
          <div className="card border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <span>{errorBanner}</span>
          </div>
        )}

        {successBanner && (
          <div className="card border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-300 flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
            <span>{successBanner}</span>
          </div>
        )}

        {/* Geographic Selector & GN Details Bar */}
        <div className="card p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-xs text-slate-400 block mb-1">District</label>
              <select
                className="input text-sm"
                value={selectedDistrict}
                onChange={(e) => handleDistrictChange(e.target.value)}
              >
                {districts.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nameEn}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1">DS Division</label>
              <select
                className="input text-sm"
                value={selectedDs}
                onChange={(e) => handleDsChange(e.target.value)}
              >
                {dsDivisions.map((ds) => (
                  <option key={ds.id} value={ds.id}>
                    {ds.nameEn}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1">GN Division</label>
              <select
                className="input text-sm"
                value={selectedGn}
                onChange={(e) => loadGnData(e.target.value)}
              >
                {gnDivisions.map((gn) => (
                  <option key={gn.id} value={gn.id}>
                    {gn.nameEn} ({gn.gnCode || gn.gnNumber})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* GN Info Summary */}
          {selectedGn && (
            <div className="flex flex-wrap items-center justify-between text-xs text-slate-400 pt-3 border-t border-slate-800 gap-2">
              <div>
                Secretary Contact:{' '}
                <span className="text-slate-200 font-medium">
                  {gnSecretaryName || 'Not configured'} {gnSecretaryContact ? `(${gnSecretaryContact})` : ''}
                </span>
              </div>
              <div>
                Active Field Teams:{' '}
                <span className="text-emerald-400 font-bold">{teams.length} teams</span>
              </div>
            </div>
          )}
        </div>

        {/* Assignment Action Bar */}
        <div className="card p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 bg-slate-900/40">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs font-semibold text-slate-300">
              Selected: <span className="text-emerald-400">{selectedHouseIds.length}</span> houses
            </span>
            <button
              onClick={handleSelectAllUnassigned}
              className="btn btn-secondary text-xs py-1 px-2.5"
            >
              Select All Unassigned
            </button>
            {selectedHouseIds.length > 0 && (
              <button
                onClick={handleClearSelection}
                className="btn btn-secondary text-xs py-1 px-2.5 text-slate-400"
              >
                Clear Selection
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto">
            <select
              className="input text-xs py-1.5 px-3 max-w-xs"
              value={targetTeamId}
              onChange={(e) => setTargetTeamId(e.target.value)}
              disabled={teams.length === 0}
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
              onClick={handleAssignSelected}
              disabled={assigning || selectedHouseIds.length === 0 || !targetTeamId}
              className="btn btn-primary text-xs py-1.5 px-4 flex items-center gap-1.5"
            >
              {assigning ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <ArrowRight className="w-3.5 h-3.5" />
              )}
              {t('houses.assign_btn')}
            </button>
          </div>
        </div>

        {/* Household Table with Status Filters */}
        <div className="card overflow-hidden">
          <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Search house # or name..."
                value={houseSearch}
                onChange={(e) => {
                  setHouseSearch(e.target.value);
                  fetchHouseholds(selectedGn, true);
                }}
                className="input text-xs py-1.5 px-3 max-w-xs"
              />
            </div>
            <div className="flex items-center gap-1.5 text-xs bg-slate-900/80 p-1 rounded-lg border border-slate-800">
              <button
                onClick={() => setStatusFilter('all')}
                className={`px-2.5 py-1 rounded ${statusFilter === 'all' ? 'bg-blue-600 text-white font-semibold' : 'text-slate-400'}`}
              >
                All ({households.length})
              </button>
              <button
                onClick={() => setStatusFilter('unassigned')}
                className={`px-2.5 py-1 rounded ${statusFilter === 'unassigned' ? 'bg-blue-600 text-white font-semibold' : 'text-slate-400'}`}
              >
                {t('houses.unassigned')} ({households.filter((h) => !h.teamId).length})
              </button>
              <button
                onClick={() => setStatusFilter('assigned')}
                className={`px-2.5 py-1 rounded ${statusFilter === 'assigned' ? 'bg-blue-600 text-white font-semibold' : 'text-slate-400'}`}
              >
                Assigned ({households.filter((h) => h.teamId).length})
              </button>
              <button
                onClick={() => setStatusFilter('finished')}
                className={`px-2.5 py-1 rounded ${statusFilter === 'finished' ? 'bg-blue-600 text-white font-semibold' : 'text-slate-400'}`}
              >
                {t('houses.finished')} ({households.filter((h) => h.isFinished).length})
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-900/80 text-xs uppercase tracking-wider text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="p-3 w-10 text-center">
                    <span className="sr-only">Select</span>
                  </th>
                  <th className="p-3">{t('houses.house_no')}</th>
                  <th className="p-3">{t('houses.head_name')}</th>
                  <th className="p-3">{t('houses.village_name')}</th>
                  <th className="p-3">{t('houses.team_assigned')}</th>
                  <th className="p-3">{t('houses.status')}</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {displayedHouseholds.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400">
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
                      <tr key={h.id} className="hover:bg-slate-800/40 transition">
                        <td className="p-3 text-center">
                          {!isAssigned ? (
                            <button
                              type="button"
                              onClick={() => handleToggleSelectHouse(h.id)}
                              className="text-slate-400 hover:text-emerald-400"
                            >
                              {isSelected ? (
                                <CheckSquare className="w-4 h-4 text-emerald-400" />
                              ) : (
                                <Square className="w-4 h-4" />
                              )}
                            </button>
                          ) : (
                            <span className="text-slate-600">—</span>
                          )}
                        </td>
                        <td className="p-3 font-mono font-bold text-white">
                          #{h.houseNo}
                        </td>
                        <td className="p-3 font-medium text-slate-200">
                          {h.houseLeaderName}
                        </td>
                        <td className="p-3 text-xs text-slate-400">
                          {h.villageName || h.address || '—'}
                        </td>
                        <td className="p-3">
                          {isAssigned ? (
                            <span className="badge badge-info text-xs">
                              Team {assignedTeam ? assignedTeam.teamNo : h.teamId.slice(0, 8)}
                            </span>
                          ) : (
                            <span className="badge badge-warning text-xs">
                              {t('houses.unassigned')}
                            </span>
                          )}
                        </td>
                        <td className="p-3">
                          {isFinished ? (
                            <span className="badge badge-success text-xs">
                              {t('houses.finished')}
                            </span>
                          ) : isAssigned ? (
                            <span className="badge badge-info text-xs">
                              {t('houses.in_progress')}
                            </span>
                          ) : (
                            <span className="badge text-xs bg-slate-800 text-slate-400">
                              Ready
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {isAssigned && !isFinished && (
                              <button
                                onClick={() => handleFinish(h)}
                                className="btn btn-secondary text-xs py-1 px-2 text-emerald-400 hover:text-emerald-300"
                                title={t('houses.finish_house')}
                              >
                                {t('houses.finish_house')}
                              </button>
                            )}
                            {isAssigned && (
                              <button
                                onClick={() => handleUnassign(h)}
                                className="btn btn-secondary text-xs py-1 px-2 text-red-400 hover:text-red-300"
                                title={t('houses.unassign')}
                              >
                                {t('houses.unassign')}
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

          {nextCursor && (
            <div className="p-4 border-t border-slate-800 text-center">
              <button
                onClick={() => fetchHouseholds(selectedGn, false, nextCursor)}
                disabled={loading}
                className="btn btn-secondary text-xs py-1.5 px-4"
              >
                {loading ? 'Loading...' : 'Load More Households'}
              </button>
            </div>
          )}
        </div>

        {/* Add Household Modal */}
        {showAddModal && (
          <div className="modal-backdrop">
            <div className="modal-content card max-w-lg p-6 space-y-4">
              <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Home className="w-5 h-5 text-emerald-400" />
                  {t('houses.add_house')}
                </h3>
              </div>
              <form onSubmit={handleAddHousehold} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">House Number *</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="e.g. 102/B"
                      value={newHouseNo}
                      onChange={(e) => setNewHouseNo(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Head of Household *</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="e.g. K. Perera"
                      value={newHeadName}
                      onChange={(e) => setNewHeadName(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-slate-400 block mb-1">Village / Street</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g. Pallekele"
                    value={newVillageName}
                    onChange={(e) => setNewVillageName(e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-400 block mb-1">Full Postal Address</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g. No. 102/B, Temple Road"
                    value={newAddress}
                    onChange={(e) => setNewAddress(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs pt-2">
                  <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                    <input type="checkbox" checked={newIsSamurdhi} onChange={(e) => setNewIsSamurdhi(e.target.checked)} />
                    Samurdhi
                  </label>
                  <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                    <input type="checkbox" checked={newIsAswesuma} onChange={(e) => setNewIsAswesuma(e.target.checked)} />
                    Aswesuma
                  </label>
                  <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                    <input type="checkbox" checked={newIsEpf} onChange={(e) => setNewIsEpf(e.target.checked)} />
                    EPF
                  </label>
                  <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                    <input type="checkbox" checked={newIsEtf} onChange={(e) => setNewIsEtf(e.target.checked)} />
                    ETF
                  </label>
                  <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                    <input type="checkbox" checked={newHasSpecialNeeds} onChange={(e) => setNewHasSpecialNeeds(e.target.checked)} />
                    Special Needs
                  </label>
                </div>

                <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
                  <button type="button" onClick={() => setShowAddModal(false)} className="btn btn-secondary text-xs">
                    Cancel
                  </button>
                  <button type="submit" disabled={actionLoading} className="btn btn-primary text-xs">
                    {actionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Register House'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* GN Setup Modal */}
        {showGnModal && (
          <div className="modal-backdrop">
            <div className="modal-content card max-w-lg p-6 space-y-4">
              <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Settings className="w-5 h-5 text-amber-400" />
                  {t('houses.gn_setup')}
                </h3>
              </div>
              <form onSubmit={handleUpdateGnSetup} className="space-y-4">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">CDC / GN Secretary Full Name</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g. W.M. Jayawardena"
                    value={gnSecretaryName}
                    onChange={(e) => setGnSecretaryName(e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-400 block mb-1">Secretary Contact Phone</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g. +94771234567"
                    value={gnSecretaryContact}
                    onChange={(e) => setGnSecretaryContact(e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-400 block mb-1">Secretary Email</label>
                  <input
                    type="email"
                    className="input"
                    placeholder="e.g. secretary.gn101@grs.gov.lk"
                    value={gnSecretaryEmail}
                    onChange={(e) => setGnSecretaryEmail(e.target.value)}
                  />
                </div>

                <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
                  <button type="button" onClick={() => setShowGnModal(false)} className="btn btn-secondary text-xs">
                    Cancel
                  </button>
                  <button type="submit" disabled={actionLoading} className="btn btn-primary text-xs">
                    {actionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save Setup'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}
