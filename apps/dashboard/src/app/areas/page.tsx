'use client';

import { useEffect, useState } from 'react';
import Shell from '../../components/Shell';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import {
  MapPin,
  Layers,
  Users,
  Upload,
  CheckCircle,
  Edit2,
  Loader2,
  Settings,
  AlertCircle,
} from 'lucide-react';

export default function AreasPage() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';
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

  // New Creation Modals (Level 00)
  const [showDsModal, setShowDsModal] = useState(false);
  const [showGnModal, setShowGnModal] = useState(false);
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);

  // Form states
  const [dsNameEn, setDsNameEn] = useState('');
  const [dsNameSi, setDsNameSi] = useState('');
  const [dsNameTa, setDsNameTa] = useState('');
  const [dsSdoName, setDsSdoName] = useState('');

  const [gnNumber, setGnNumber] = useState('');
  const [gnName, setGnName] = useState('');
  const [gnSecName, setGnSecName] = useState('');
  const [gnSecContact, setGnSecContact] = useState('');
  const [gnSecEmail, setGnSecEmail] = useState('');

  const [teamNo, setTeamNo] = useState<number>(1);
  const [teamMaxMembers, setTeamMaxMembers] = useState<number>(10);

  // Config modal states
  const [appConfig, setAppConfig] = useState<any>(null);
  const [configMinVersion, setConfigMinVersion] = useState('');
  const [configJitter, setConfigJitter] = useState<number>(30);
  const [configWebRoles, setConfigWebRoles] = useState<string[]>([]);
  const [configSaving, setConfigSaving] = useState(false);

  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

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

  const handleCreateDs = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDistrictId) return;
    setErrorBanner(null);
    setSuccessBanner(null);
    try {
      await api.createDsDivision({
        districtId: selectedDistrictId,
        nameEn: dsNameEn.trim(),
        nameSi: dsNameSi.trim(),
        nameTa: dsNameTa.trim(),
        sdoName: dsSdoName.trim() || undefined,
      });
      setShowDsModal(false);
      setDsNameEn('');
      setDsNameSi('');
      setDsNameTa('');
      setDsSdoName('');
      setSuccessBanner('DS Division created successfully.');
      loadDsDivisions(selectedDistrictId);
    } catch (err: any) {
      setErrorBanner(`Failed to create DS Division: ${err.message}`);
    }
  };

  const handleCreateGn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDsId) return;
    setErrorBanner(null);
    setSuccessBanner(null);
    try {
      await api.createGnDivision({
        dsId: selectedDsId,
        gnNumber: gnNumber.trim(),
        gnName: gnName.trim(),
        secretaryName: gnSecName.trim() || undefined,
        secretaryContact: gnSecContact.trim() || undefined,
        secretaryEmail: gnSecEmail.trim() || undefined,
      });
      setShowGnModal(false);
      setGnNumber('');
      setGnName('');
      setGnSecName('');
      setGnSecContact('');
      setGnSecEmail('');
      setSuccessBanner('GN Division created successfully.');
      loadGnDivisions(selectedDsId);
    } catch (err: any) {
      setErrorBanner(`Failed to create GN Division: ${err.message}`);
    }
  };

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGnId) return;
    setErrorBanner(null);
    setSuccessBanner(null);
    try {
      await api.createTeam({
        gnId: selectedGnId,
        teamNo: Number(teamNo),
        maxMembers: Number(teamMaxMembers),
      });
      setShowTeamModal(false);
      setTeamNo(teamNo + 1);
      setSuccessBanner(`Field Team #${teamNo} created successfully.`);
      loadTeams(selectedGnId);
    } catch (err: any) {
      setErrorBanner(`Failed to create team: ${err.message}`);
    }
  };

  const handleOpenConfigModal = async () => {
    setErrorBanner(null);
    setShowConfigModal(true);
    try {
      const cfg = await api.getConfig();
      setAppConfig(cfg);
      setConfigMinVersion(cfg.minimumAppVersion || cfg.minimum_app_version || '1.0.0');
      setConfigJitter(cfg.syncJitterSeconds || cfg.sync_jitter_seconds || 30);
      setConfigWebRoles(cfg.webEntryRoles || cfg.web_entry_roles || ['cdc_secretary', 'sda', 'dc', 'admin']);
    } catch (err: any) {
      setErrorBanner(`Failed to load config: ${err.message}`);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setConfigSaving(true);
    setErrorBanner(null);
    setSuccessBanner(null);
    try {
      await api.updateConfig({
        minimum_app_version: configMinVersion.trim(),
        sync_jitter_seconds: Number(configJitter),
        web_entry_roles: configWebRoles,
      });
      setShowConfigModal(false);
      setSuccessBanner('System configuration and app release version published successfully.');
    } catch (err: any) {
      setErrorBanner(`Failed to update config: ${err.message}`);
    } finally {
      setConfigSaving(false);
    }
  };

  const handleSaveTeamLimit = async () => {
    if (!editingTeam) return;
    setErrorBanner(null);
    setSuccessBanner(null);
    try {
      await api.updateTeam(editingTeam.id, { maxMembers: Number(newTeamLimit) });
      setEditingTeam(null);
      setSuccessBanner('Team member capacity updated successfully.');
      loadTeams(selectedGnId);
    } catch (err: any) {
      setErrorBanner(`Failed to update team limit: ${err.message}`);
    }
  };

  const handleImportPilotCsv = async () => {
    setImporting(true);
    setImportResult(null);
    setErrorBanner(null);
    setSuccessBanner(null);
    try {
      const res = await api.importPilotAreaCsv(pilotCsv);
      setImportResult(res);
      setSuccessBanner('Pilot areas CSV imported successfully.');
      loadDistricts();
    } catch (err: any) {
      setErrorBanner(`Pilot import failed: ${err.message}`);
    } finally {
      setImporting(false);
    }
  };

  return (
    <Shell activePath="/areas">
      {/* Title & Actions */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em', margin: 0 }}>
            {t('areas.title')}
          </h2>
          <p style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
            Administrative boundaries, team allocations, capacity limits, and system releases (Level 00).
          </p>
        </div>

        {isSuperAdmin && (
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button onClick={handleOpenConfigModal} className="btn-secondary">
              <Settings size={16} />
              <span>{t('areas.system_config')}</span>
            </button>

            <button onClick={() => setShowPilotImport(true)} className="btn-primary">
              <Upload size={16} />
              <span>{t('areas.import_pilot')}</span>
            </button>
          </div>
        )}
      </div>

      {errorBanner && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px 16px', color: '#dc2626', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <AlertCircle size={18} />
          <span>{errorBanner}</span>
        </div>
      )}

      {successBanner && (
        <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '8px', padding: '12px 16px', color: '#059669', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <CheckCircle size={18} />
          <span>{successBanner}</span>
        </div>
      )}

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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Layers size={18} color="#059669" />
              <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0 }}>{t('areas.ds_divisions')} ({dsDivisions.length})</h3>
            </div>
            {isSuperAdmin && (
              <button
                onClick={() => setShowDsModal(true)}
                disabled={!selectedDistrictId}
                className="btn-secondary"
                style={{ padding: '4px 8px', fontSize: '11px' }}
                title="Add DS Division"
              >
                + Add DS
              </button>
            )}
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <MapPin size={18} color="#d97706" />
              <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0 }}>{t('areas.gn_divisions')} ({gnDivisions.length})</h3>
            </div>
            {isSuperAdmin && (
              <button
                onClick={() => setShowGnModal(true)}
                disabled={!selectedDsId}
                className="btn-secondary"
                style={{ padding: '4px 8px', fontSize: '11px' }}
                title="Add GN Division"
              >
                + Add GN
              </button>
            )}
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Users size={18} color="#7c3aed" />
              <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0 }}>{t('areas.teams')} ({teams.length})</h3>
            </div>
            {isSuperAdmin && (
              <button
                onClick={() => setShowTeamModal(true)}
                disabled={!selectedGnId}
                className="btn-secondary"
                style={{ padding: '4px 8px', fontSize: '11px' }}
                title="Add Field Team"
              >
                + Add Team
              </button>
            )}
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

                    {isSuperAdmin && (
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
                    )}
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
      {/* Create DS Division Modal */}
      {showDsModal && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: '480px' }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #e2e8f0' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>Create DS Division</h3>
              <p style={{ fontSize: '12px', color: '#64748b', margin: '2px 0 0 0' }}>
                District: {districts.find((d) => d.id === selectedDistrictId)?.nameEn || selectedDistrictId}
              </p>
            </div>
            <form onSubmit={handleCreateDs} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>English Name *</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g. Kandy Four Gravets"
                  value={dsNameEn}
                  onChange={(e) => setDsNameEn(e.target.value)}
                  required
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Sinhala Name *</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g. මහනුවර කඩවත් සතර"
                  value={dsNameSi}
                  onChange={(e) => setDsNameSi(e.target.value)}
                  required
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Tamil Name *</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g. கண்டி கடவத் சதர"
                  value={dsNameTa}
                  onChange={(e) => setDsNameTa(e.target.value)}
                  required
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>SDO Officer Name (Optional)</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g. A.B. Senanayake"
                  value={dsSdoName}
                  onChange={(e) => setDsSdoName(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '0.5rem' }}>
                <button type="button" onClick={() => setShowDsModal(false)} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Create DS Division
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create GN Division Modal */}
      {showGnModal && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: '480px' }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #e2e8f0' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>Create GN Division</h3>
              <p style={{ fontSize: '12px', color: '#64748b', margin: '2px 0 0 0' }}>
                DS Division: {dsDivisions.find((ds) => ds.id === selectedDsId)?.nameEn || selectedDsId}
              </p>
            </div>
            <form onSubmit={handleCreateGn} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>GN Number / Code *</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g. 101/A"
                  value={gnNumber}
                  onChange={(e) => setGnNumber(e.target.value)}
                  required
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>GN Division Name *</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g. Pallekele East"
                  value={gnName}
                  onChange={(e) => setGnName(e.target.value)}
                  required
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Secretary Name (Optional)</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g. K.M. Disanayake"
                  value={gnSecName}
                  onChange={(e) => setGnSecName(e.target.value)}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Secretary Phone (Optional)</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g. +94771234567"
                  value={gnSecContact}
                  onChange={(e) => setGnSecContact(e.target.value)}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Secretary Email (Optional)</label>
                <input
                  type="email"
                  className="input-field"
                  placeholder="e.g. sec.gn101@grs.gov.lk"
                  value={gnSecEmail}
                  onChange={(e) => setGnSecEmail(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '0.5rem' }}>
                <button type="button" onClick={() => setShowGnModal(false)} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Create GN Division
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Team Modal */}
      {showTeamModal && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: '400px' }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #e2e8f0' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>Create Field Team</h3>
              <p style={{ fontSize: '12px', color: '#64748b', margin: '2px 0 0 0' }}>
                GN: {gnDivisions.find((g) => g.id === selectedGnId)?.nameEn || selectedGnId}
              </p>
            </div>
            <form onSubmit={handleCreateTeam} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Team Number *</label>
                <input
                  type="number"
                  min="1"
                  max="999"
                  className="input-field"
                  value={teamNo}
                  onChange={(e) => setTeamNo(parseInt(e.target.value) || 1)}
                  required
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Member Capacity Limit *</label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  className="input-field"
                  value={teamMaxMembers}
                  onChange={(e) => setTeamMaxMembers(parseInt(e.target.value) || 10)}
                  required
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '0.5rem' }}>
                <button type="button" onClick={() => setShowTeamModal(false)} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Create Team
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* System Config & Releases Modal */}
      {showConfigModal && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: '520px' }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #e2e8f0' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>System Configuration & Releases</h3>
              <p style={{ fontSize: '12px', color: '#64748b', margin: '2px 0 0 0' }}>
                Publish minimum app versions (HTTP 426 enforcement) and adjust synchronization parameters.
              </p>
            </div>
            <form onSubmit={handleSaveConfig} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Minimum App Version (Enforces Upgrade Required on Older Apps)
                </label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g. 1.0.0"
                  value={configMinVersion}
                  onChange={(e) => setConfigMinVersion(e.target.value)}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Client Sync Jitter Window (Seconds)
                </label>
                <input
                  type="number"
                  min="0"
                  max="300"
                  className="input-field"
                  value={configJitter}
                  onChange={(e) => setConfigJitter(parseInt(e.target.value) || 0)}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                  Roles Authorized for Direct Web Entry (Decision C19)
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px' }}>
                  {['super_admin', 'admin', 'dc', 'sda', 'cdc_secretary'].map((r) => (
                    <label key={r} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={configWebRoles.includes(r)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setConfigWebRoles([...configWebRoles, r]);
                          } else {
                            setConfigWebRoles(configWebRoles.filter((item) => item !== r));
                          }
                        }}
                      />
                      <span style={{ textTransform: 'capitalize' }}>{r.replace('_', ' ')}</span>
                      {r === 'super_admin' && (
                        <span style={{ fontSize: '11px', color: '#94a3b8' }}>(Disabled by default per C19)</span>
                      )}
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '1rem' }}>
                <button type="button" onClick={() => setShowConfigModal(false)} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" disabled={configSaving} className="btn-primary">
                  {configSaving ? <Loader2 size={16} className="animate-spin" /> : 'Publish Configuration'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Shell>
  );
}
