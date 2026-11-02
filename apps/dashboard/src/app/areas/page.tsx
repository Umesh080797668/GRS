'use client';

import { useEffect, useState } from 'react';
import Shell from '../../components/Shell';
import { useLanguage } from '../../context/LanguageContext';
import { api } from '../../lib/api';
import {
  MapPin,
  Layers,
  Users,
  Upload,
  CheckCircle,
  Edit2,
  Loader2,
} from 'lucide-react';

export default function AreasPage() {
  const { t } = useLanguage();
  const [districts, setDistricts] = useState<any[]>([]);
  const [dsDivisions, setDsDivisions] = useState<any[]>([]);
  const [gnDivisions, setGnDivisions] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);

  const [selectedDistrictId, setSelectedDistrictId] = useState<string>('');
  const [selectedDsId, setSelectedDsId] = useState<string>('');
  const [selectedGnId, setSelectedGnId] = useState<string>('');

  const [loading, setLoading] = useState(true);
  const [showPilotImport, setShowPilotImport] = useState(false);
  const [pilotCsv, setPilotCsv] = useState(
    'district,ds_division,gn_division,gn_number,initial_teams\nColombo,Colombo,Kollupitiya,GN-01,2\nColombo,Colombo,Bambalapitiya,GN-02,3'
  );
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);

  // Team editing modal
  const [editingTeam, setEditingTeam] = useState<any>(null);
  const [newTeamLimit, setNewTeamLimit] = useState<number>(10);

  useEffect(() => {
    loadDistricts();
  }, []);

  const loadDistricts = async () => {
    try {
      setLoading(true);
      const data = await api.getDistricts();
      setDistricts(data);
      if (data.length > 0) {
        setSelectedDistrictId(data[0].id);
        loadDsDivisions(data[0].id);
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadDsDivisions = async (districtId: string) => {
    try {
      const data = await api.getDsDivisions(districtId);
      setDsDivisions(data);
      if (data.length > 0) {
        setSelectedDsId(data[0].id);
        loadGnDivisions(data[0].id);
      } else {
        setGnDivisions([]);
        setTeams([]);
      }
    } catch (err: any) {
      console.error(err);
    }
  };

  const loadGnDivisions = async (dsId: string) => {
    try {
      const data = await api.getGnDivisions(dsId);
      setGnDivisions(data);
      if (data.length > 0) {
        setSelectedGnId(data[0].id);
        loadTeams(data[0].id);
      } else {
        setTeams([]);
      }
    } catch (err: any) {
      console.error(err);
    }
  };

  const loadTeams = async (gnId: string) => {
    try {
      const data = await api.getTeams(gnId);
      setTeams(data);
    } catch (err: any) {
      console.error(err);
    }
  };

  const handleDistrictChange = (id: string) => {
    setSelectedDistrictId(id);
    loadDsDivisions(id);
  };

  const handleDsChange = (id: string) => {
    setSelectedDsId(id);
    loadGnDivisions(id);
  };

  const handleGnChange = (id: string) => {
    setSelectedGnId(id);
    loadTeams(id);
  };

  const handleSaveTeamLimit = async () => {
    if (!editingTeam) return;
    try {
      await api.updateTeam(editingTeam.id, { memberLimit: Number(newTeamLimit) });
      setEditingTeam(null);
      loadTeams(selectedGnId);
    } catch (err: any) {
      alert(`Failed to update team limit: ${err.message}`);
    }
  };

  const handleImportPilotCsv = async () => {
    setImporting(true);
    setImportResult(null);
    try {
      const res = await api.importPilotAreaCsv(pilotCsv);
      setImportResult(res);
      loadDistricts();
    } catch (err: any) {
      alert(`Pilot import failed: ${err.message}`);
    } finally {
      setImporting(false);
    }
  };

  return (
    <Shell>
      {/* Title & Import Trigger */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em', margin: 0 }}>
            {t('areas.title')}
          </h2>
          <p style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
            Administrative boundaries, team allocations, and team member capacity management.
          </p>
        </div>

        <button onClick={() => setShowPilotImport(true)} className="btn-primary">
          <Upload size={16} />
          <span>{t('areas.import_pilot')}</span>
        </button>
      </div>

      {/* 4-Column Geographic Hierarchy View (M5.3) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
        {/* Districts */}
        <div className="glass-panel" style={{ padding: '1.25rem', borderRadius: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem' }}>
            <MapPin size={18} color="#2563eb" />
            <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0 }}>{t('areas.districts')} ({districts.length})</h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '450px', overflowY: 'auto' }}>
            {districts.map((d) => {
              const isSelected = selectedDistrictId === d.id;
              return (
                <button
                  key={d.id}
                  onClick={() => handleDistrictChange(d.id)}
                  style={{
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid',
                    borderColor: isSelected ? '#3b82f6' : '#e2e8f0',
                    background: isSelected ? '#eff6ff' : '#ffffff',
                    color: isSelected ? '#1e40af' : '#0f172a',
                    fontWeight: isSelected ? 700 : 500,
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontSize: '13px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>{d.nameEn || d.name}</span>
                  {isSelected && <CheckCircle size={14} color="#2563eb" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* DS Divisions */}
        <div className="glass-panel" style={{ padding: '1.25rem', borderRadius: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem' }}>
            <Layers size={18} color="#059669" />
            <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0 }}>{t('areas.ds_divisions')} ({dsDivisions.length})</h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '450px', overflowY: 'auto' }}>
            {dsDivisions.length === 0 ? (
              <div style={{ color: '#94a3b8', fontSize: '13px', padding: '1rem', textAlign: 'center' }}>No DS Divisions</div>
            ) : (
              dsDivisions.map((ds) => {
                const isSelected = selectedDsId === ds.id;
                return (
                  <button
                    key={ds.id}
                    onClick={() => handleDsChange(ds.id)}
                    style={{
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '1px solid',
                      borderColor: isSelected ? '#10b981' : '#e2e8f0',
                      background: isSelected ? '#ecfdf5' : '#ffffff',
                      color: isSelected ? '#065f46' : '#0f172a',
                      fontWeight: isSelected ? 700 : 500,
                      textAlign: 'left',
                      cursor: 'pointer',
                      fontSize: '13px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span>{ds.nameEn || ds.name}</span>
                    {isSelected && <CheckCircle size={14} color="#059669" />}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* GN Divisions */}
        <div className="glass-panel" style={{ padding: '1.25rem', borderRadius: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem' }}>
            <MapPin size={18} color="#d97706" />
            <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0 }}>{t('areas.gn_divisions')} ({gnDivisions.length})</h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '450px', overflowY: 'auto' }}>
            {gnDivisions.length === 0 ? (
              <div style={{ color: '#94a3b8', fontSize: '13px', padding: '1rem', textAlign: 'center' }}>No GN Divisions</div>
            ) : (
              gnDivisions.map((gn) => {
                const isSelected = selectedGnId === gn.id;
                return (
                  <button
                    key={gn.id}
                    onClick={() => handleGnChange(gn.id)}
                    style={{
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '1px solid',
                      borderColor: isSelected ? '#f59e0b' : '#e2e8f0',
                      background: isSelected ? '#fffbeb' : '#ffffff',
                      color: isSelected ? '#92400e' : '#0f172a',
                      fontWeight: isSelected ? 700 : 500,
                      textAlign: 'left',
                      cursor: 'pointer',
                      fontSize: '13px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div>
                      <div>{gn.nameEn || gn.name}</div>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>GN No: {gn.gnNumber || gn.code || '-'}</div>
                    </div>
                    {isSelected && <CheckCircle size={14} color="#d97706" />}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Field Teams with Limits (M5.3) */}
        <div className="glass-panel" style={{ padding: '1.25rem', borderRadius: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem' }}>
            <Users size={18} color="#7c3aed" />
            <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0 }}>{t('areas.teams')} ({teams.length})</h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '450px', overflowY: 'auto' }}>
            {teams.length === 0 ? (
              <div style={{ color: '#94a3b8', fontSize: '13px', padding: '1rem', textAlign: 'center' }}>No Teams in this GN</div>
            ) : (
              teams.map((tm) => {
                const active = tm.activeMembers || tm.active_members || 0;
                const limit = tm.memberLimit || tm.member_limit || 10;
                const isFull = active >= limit;
                return (
                  <div
                    key={tm.id}
                    style={{
                      padding: '12px 14px',
                      borderRadius: '8px',
                      border: '1px solid #e2e8f0',
                      background: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '14px', color: '#0f172a' }}>
                        {tm.name || tm.teamCode}
                      </div>
                      <div style={{ fontSize: '12px', color: isFull ? '#dc2626' : '#059669', marginTop: '2px', fontWeight: 600 }}>
                        Capacity: {active} / {limit} Members
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        setEditingTeam(tm);
                        setNewTeamLimit(limit);
                      }}
                      className="btn-secondary"
                      style={{ padding: '6px 10px', fontSize: '11px' }}
                    >
                      <Edit2 size={12} />
                      <span>Edit Limit</span>
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Pilot Area CSV Import Modal */}
      {showPilotImport && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: '640px' }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #e2e8f0' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>{t('areas.import_pilot')}</h3>
              <p style={{ fontSize: '12px', color: '#64748b', margin: '4px 0 0 0' }}>
                Required headers: district,ds_division,gn_division,gn_number,initial_teams
              </p>
            </div>
            <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <textarea
                className="input-field"
                rows={6}
                value={pilotCsv}
                onChange={(e) => setPilotCsv(e.target.value)}
                style={{ fontFamily: 'monospace', fontSize: '12px' }}
              />

              {importResult && (
                <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', padding: '10px 14px', borderRadius: '8px', fontSize: '12px', color: '#065f46' }}>
                  Successfully processed pilot area hierarchy!
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button onClick={() => setShowPilotImport(false)} className="btn-secondary">
                  Close
                </button>
                <button onClick={handleImportPilotCsv} disabled={importing} className="btn-primary">
                  {importing ? <Loader2 size={16} className="animate-spin" /> : 'Run Pilot Import'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Team Limit Modal */}
      {editingTeam && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: '400px' }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #e2e8f0' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>Edit Member Limit</h3>
              <p style={{ fontSize: '12px', color: '#64748b', margin: '2px 0 0 0' }}>
                Team: {editingTeam.name || editingTeam.teamCode}
              </p>
            </div>
            <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                  Max Active Members
                </label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  className="input-field"
                  value={newTeamLimit}
                  onChange={(e) => setNewTeamLimit(parseInt(e.target.value) || 1)}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button onClick={() => setEditingTeam(null)} className="btn-secondary">
                  Cancel
                </button>
                <button onClick={handleSaveTeamLimit} className="btn-primary">
                  Save Limit
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}
