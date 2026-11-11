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
  X,
  Plus,
} from 'lucide-react';

export default function AreasPage() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';
  const canManageAreas = user?.role === 'super_admin' || user?.role === 'admin';
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
    'district,ds_division,gn_name,gn_number,initial_teams\nColombo,Colombo,Kollupitiya,GN-01,2\nColombo,Colombo,Bambalapitiya,GN-02,3'
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
  const [setAppConfig] = useState<any>(null);
  const [configMinVersion, setConfigMinVersion] = useState('');
  const [configJitter, setConfigJitter] = useState<number>(30);
  const [configWebRoles, setConfigWebRoles] = useState<string[]>([]);
  const [configSaving, setConfigSaving] = useState(false);

  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadDistricts();
  }, []);

  const loadDistricts = async (preferredDistrictId?: string) => {
    try {
      setLoading(true);
      const data = await api.getDistricts();
      setDistricts(data);
      if (data.length > 0) {
        const nextDistrictId =
          preferredDistrictId && data.some((d) => d.id === preferredDistrictId)
            ? preferredDistrictId
            : data[0].id;
        setSelectedDistrictId(nextDistrictId);
        await loadDsDivisions(nextDistrictId);
      } else {
        setSelectedDistrictId('');
        setSelectedDsId('');
        setSelectedGnId('');
        setDsDivisions([]);
        setGnDivisions([]);
        setTeams([]);
      }
    } catch (err: any) {
      setErrorBanner(`Failed to load districts: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const loadDsDivisions = async (districtId: string, preferredDsId?: string) => {
    try {
      const data = await api.getDsDivisions(districtId);
      setDsDivisions(data);
      if (data.length > 0) {
        const nextDsId =
          preferredDsId && data.some((d) => d.id === preferredDsId)
            ? preferredDsId
            : data[0].id;
        setSelectedDsId(nextDsId);
        await loadGnDivisions(nextDsId);
      } else {
        setSelectedDsId('');
        setSelectedGnId('');
        setGnDivisions([]);
        setTeams([]);
      }
    } catch (err: any) {
      setErrorBanner(`Failed to load DS divisions: ${err.message}`);
    }
  };

  const loadGnDivisions = async (dsId: string, preferredGnId?: string) => {
    try {
      const data = await api.getGnDivisions(dsId);
      setGnDivisions(data);
      if (data.length > 0) {
        const nextGnId =
          preferredGnId && data.some((g) => g.id === preferredGnId)
            ? preferredGnId
            : data[0].id;
        setSelectedGnId(nextGnId);
        await loadTeams(nextGnId);
      } else {
        setSelectedGnId('');
        setTeams([]);
      }
    } catch (err: any) {
      setErrorBanner(`Failed to load GN divisions: ${err.message}`);
    }
  };

  const loadTeams = async (gnId: string) => {
    try {
      const data = await api.getTeams(gnId);
      setTeams(data);
    } catch (err: any) {
      setErrorBanner(`Failed to load field teams: ${err.message}`);
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
    setSubmitting(true);
    setModalError(null);
    setErrorBanner(null);
    setSuccessBanner(null);
    try {
      const created = await api.createDsDivision({
        districtId: selectedDistrictId,
        nameEn: dsNameEn.trim(),
        nameSi: dsNameSi.trim() || undefined,
        nameTa: dsNameTa.trim() || undefined,
        sdoName: dsSdoName.trim() || undefined,
      });
      setShowDsModal(false);
      setDsNameEn('');
      setDsNameSi('');
      setDsNameTa('');
      setDsSdoName('');
      setSuccessBanner('DS Division created successfully.');
      await loadDsDivisions(selectedDistrictId, created?.id);
    } catch (err: any) {
      setModalError(err.message || 'Failed to create DS Division.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateGn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDsId) return;
    setSubmitting(true);
    setModalError(null);
    setErrorBanner(null);
    setSuccessBanner(null);
    try {
      const created = await api.createGnDivision({
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
      await loadGnDivisions(selectedDsId, created?.id);
    } catch (err: any) {
      setModalError(err.message || 'Failed to create GN Division.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGnId) return;
    const createdTeamNo = Number(teamNo);
    setSubmitting(true);
    setModalError(null);
    setErrorBanner(null);
    setSuccessBanner(null);
    try {
      await api.createTeam({
        gnId: selectedGnId,
        teamNo: createdTeamNo,
        maxMembers: Number(teamMaxMembers),
      });
      setShowTeamModal(false);
      setTeamNo(createdTeamNo + 1);
      setSuccessBanner(`Field Team #${createdTeamNo} created successfully.`);
      await loadTeams(selectedGnId);
    } catch (err: any) {
      setModalError(err.message || 'Failed to create Field Team.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenConfigModal = async () => {
    setErrorBanner(null);
    setModalError(null);
    setShowConfigModal(true);
    try {
      const cfg = await api.getConfig();
      setAppConfig(cfg);
      setConfigMinVersion(cfg.minimumAppVersion || cfg.minimum_app_version || '1.0.0');
      setConfigJitter(cfg.syncJitterSeconds || cfg.sync_jitter_seconds || 30);
      setConfigWebRoles(cfg.webEntryRoles || cfg.web_entry_roles || ['cdc_secretary', 'sda', 'dc', 'admin']);
    } catch (err: any) {
      setModalError(`Failed to load config: ${err.message}`);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setConfigSaving(true);
    setModalError(null);
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
      setModalError(`Failed to update config: ${err.message}`);
    } finally {
      setConfigSaving(false);
    }
  };

  const handleSaveTeamLimit = async () => {
    if (!editingTeam) return;
    setSubmitting(true);
    setModalError(null);
    setErrorBanner(null);
    setSuccessBanner(null);
    try {
      await api.updateTeam(editingTeam.id, { maxMembers: Number(newTeamLimit) });
      setEditingTeam(null);
      setSuccessBanner('Team member capacity updated successfully.');
      await loadTeams(selectedGnId);
    } catch (err: any) {
      setModalError(`Failed to update team limit: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleImportPilotCsv = async () => {
    setImporting(true);
    setImportResult(null);
    setModalError(null);
    setErrorBanner(null);
    setSuccessBanner(null);
    try {
      const res = await api.importPilotAreaCsv(pilotCsv);
      setImportResult(res);
      setSuccessBanner('Pilot areas CSV imported successfully.');
      await loadDistricts(selectedDistrictId);
    } catch (err: any) {
      setModalError(`Pilot import failed: ${err.message}`);
    } finally {
      setImporting(false);
    }
  };

  const renderModalError = () =>
    modalError ? (
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
    ) : null;

  return (
    <Shell activePath="/areas">
      {/* Title & Actions Bar */}
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
            {t('areas.title')}
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--slate-500)', marginTop: '4px' }}>
            Administrative boundaries, team allocations, capacity limits, and system releases (Level 00).
          </p>
        </div>

        {(isSuperAdmin || canManageAreas) && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {isSuperAdmin && (
              <button type="button" onClick={handleOpenConfigModal} className="btn-secondary">
                <Settings size={15} />
                <span>{t('areas.system_config')}</span>
              </button>
            )}

            {canManageAreas && (
              <button
                type="button"
                onClick={() => {
                  setModalError(null);
                  setImportResult(null);
                  setShowPilotImport(true);
                }}
                className="btn-primary"
              >
                <Upload size={15} />
                <span>{t('areas.import_pilot')}</span>
              </button>
            )}
          </div>
        )}
      </div>

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

      {/* 4-Column Geographic Hierarchy View (M5.3) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
          gap: '1.125rem',
          marginBottom: '2rem',
        }}
      >
        {/* Column 1: Districts */}
        <div className="panel" style={{ padding: '1.125rem', display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingBottom: '0.75rem',
              borderBottom: '1px solid var(--slate-100)',
              marginBottom: '0.75rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <MapPin size={17} style={{ color: 'var(--primary)' }} />
              <h3 style={{ fontSize: '14px', fontWeight: 700, margin: 0, color: 'var(--slate-900)' }}>
                {t('areas.districts')}
              </h3>
            </div>
            <span className="badge badge-neutral">{districts.length}</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '480px', overflowY: 'auto' }}>
            {districts.map((d) => {
              const isSelected = selectedDistrictId === d.id;
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => handleDistrictChange(d.id)}
                  style={{
                    padding: '9px 12px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid',
                    borderColor: isSelected ? 'var(--primary)' : 'transparent',
                    background: isSelected ? 'var(--primary-subtle)' : 'transparent',
                    color: isSelected ? 'var(--primary-text)' : 'var(--slate-700)',
                    fontWeight: isSelected ? 600 : 500,
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontSize: '13px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    transition: 'all 0.12s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) e.currentTarget.style.background = 'var(--slate-100)';
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <span>{d.nameEn || d.name}</span>
                  {isSelected && <CheckCircle size={14} style={{ color: 'var(--primary)' }} />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Column 2: DS Divisions */}
        <div className="panel" style={{ padding: '1.125rem', display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingBottom: '0.75rem',
              borderBottom: '1px solid var(--slate-100)',
              marginBottom: '0.75rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Layers size={17} style={{ color: 'var(--success)' }} />
              <h3 style={{ fontSize: '14px', fontWeight: 700, margin: 0, color: 'var(--slate-900)' }}>
                {t('areas.ds_divisions')}
              </h3>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span className="badge badge-neutral">{dsDivisions.length}</span>
              {canManageAreas && (
                <button
                  type="button"
                  onClick={() => {
                    setModalError(null);
                    setShowDsModal(true);
                  }}
                  disabled={!selectedDistrictId}
                  className="btn-secondary"
                  style={{ padding: '2px 7px', fontSize: '11px', height: '24px' }}
                  title="Add DS Division"
                >
                  <Plus size={12} />
                  <span>DS</span>
                </button>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '480px', overflowY: 'auto' }}>
            {dsDivisions.length === 0 ? (
              <div style={{ color: 'var(--slate-400)', fontSize: '13px', padding: '1.5rem', textAlign: 'center' }}>
                No DS Divisions
              </div>
            ) : (
              dsDivisions.map((ds) => {
                const isSelected = selectedDsId === ds.id;
                return (
                  <button
                    key={ds.id}
                    type="button"
                    onClick={() => handleDsChange(ds.id)}
                    style={{
                      padding: '9px 12px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid',
                      borderColor: isSelected ? 'var(--success-border)' : 'transparent',
                      background: isSelected ? 'var(--success-bg)' : 'transparent',
                      color: isSelected ? 'var(--success-text)' : 'var(--slate-700)',
                      fontWeight: isSelected ? 600 : 500,
                      textAlign: 'left',
                      cursor: 'pointer',
                      fontSize: '13px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      transition: 'all 0.12s ease',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) e.currentTarget.style.background = 'var(--slate-100)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <span>{ds.nameEn || ds.name}</span>
                    {isSelected && <CheckCircle size={14} style={{ color: 'var(--success)' }} />}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Column 3: GN Divisions */}
        <div className="panel" style={{ padding: '1.125rem', display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingBottom: '0.75rem',
              borderBottom: '1px solid var(--slate-100)',
              marginBottom: '0.75rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <MapPin size={17} style={{ color: 'var(--warning)' }} />
              <h3 style={{ fontSize: '14px', fontWeight: 700, margin: 0, color: 'var(--slate-900)' }}>
                {t('areas.gn_divisions')}
              </h3>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span className="badge badge-neutral">{gnDivisions.length}</span>
              {canManageAreas && (
                <button
                  type="button"
                  onClick={() => {
                    setModalError(null);
                    setShowGnModal(true);
                  }}
                  disabled={!selectedDsId}
                  className="btn-secondary"
                  style={{ padding: '2px 7px', fontSize: '11px', height: '24px' }}
                  title="Add GN Division"
                >
                  <Plus size={12} />
                  <span>GN</span>
                </button>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '480px', overflowY: 'auto' }}>
            {gnDivisions.length === 0 ? (
              <div style={{ color: 'var(--slate-400)', fontSize: '13px', padding: '1.5rem', textAlign: 'center' }}>
                No GN Divisions
              </div>
            ) : (
              gnDivisions.map((gn) => {
                const isSelected = selectedGnId === gn.id;
                return (
                  <button
                    key={gn.id}
                    type="button"
                    onClick={() => handleGnChange(gn.id)}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid',
                      borderColor: isSelected ? 'var(--warning-border)' : 'transparent',
                      background: isSelected ? 'var(--warning-bg)' : 'transparent',
                      color: isSelected ? 'var(--warning-text)' : 'var(--slate-700)',
                      fontWeight: isSelected ? 600 : 500,
                      textAlign: 'left',
                      cursor: 'pointer',
                      fontSize: '13px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      transition: 'all 0.12s ease',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) e.currentTarget.style.background = 'var(--slate-100)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <div>
                      <div style={{ color: isSelected ? 'var(--warning-text)' : 'var(--slate-900)' }}>
                        {gn.gnName || gn.nameEn || gn.name || gn.gnNumber}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--slate-500)', marginTop: '1px' }}>
                        GN No: {gn.gnNumber || gn.code || '—'}
                      </div>
                    </div>
                    {isSelected && <CheckCircle size={14} style={{ color: 'var(--warning)' }} />}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Column 4: Field Teams with Limits (M5.3) */}
        <div className="panel" style={{ padding: '1.125rem', display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingBottom: '0.75rem',
              borderBottom: '1px solid var(--slate-100)',
              marginBottom: '0.75rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Users size={17} style={{ color: '#7c3aed' }} />
              <h3 style={{ fontSize: '14px', fontWeight: 700, margin: 0, color: 'var(--slate-900)' }}>
                {t('areas.teams')}
              </h3>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span className="badge badge-neutral">{teams.length}</span>
              {canManageAreas && (
                <button
                  type="button"
                  onClick={() => {
                    setModalError(null);
                    const maxTeamNo = teams.reduce((max, tm) => Math.max(max, Number(tm.teamNo ?? 0)), 0);
                    setTeamNo(maxTeamNo + 1);
                    setShowTeamModal(true);
                  }}
                  disabled={!selectedGnId}
                  className="btn-secondary"
                  style={{ padding: '2px 7px', fontSize: '11px', height: '24px' }}
                  title="Add Field Team"
                >
                  <Plus size={12} />
                  <span>Team</span>
                </button>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '480px', overflowY: 'auto' }}>
            {teams.length === 0 ? (
              <div style={{ color: 'var(--slate-400)', fontSize: '13px', padding: '1.5rem', textAlign: 'center' }}>
                No Teams in this GN
              </div>
            ) : (
              teams.map((tm) => {
                const active = tm.activeMembers ?? tm.active_members ?? 0;
                const limit = tm.maxMembers ?? tm.memberLimit ?? tm.member_limit ?? 10;
                const isFull = active >= limit;
                return (
                  <div
                    key={tm.id}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-subtle)',
                      background: 'var(--slate-50)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '13.5px', color: 'var(--slate-900)' }}>
                        {tm.name || tm.teamCode || `Team ${tm.teamNo}`}
                      </div>
                      <div
                        style={{
                          fontSize: '12px',
                          color: isFull ? 'var(--danger-text)' : 'var(--success-text)',
                          marginTop: '2px',
                          fontWeight: 500,
                        }}
                      >
                        Capacity: {active} / {limit} Members
                      </div>
                    </div>

                    {canManageAreas && (
                      <button
                        type="button"
                        onClick={() => {
                          setModalError(null);
                          setEditingTeam(tm);
                          setNewTeamLimit(limit);
                        }}
                        className="btn-secondary"
                        style={{ padding: '5px 8px', fontSize: '11px' }}
                        title="Edit team capacity limit"
                      >
                        <Edit2 size={12} />
                        <span>Limit</span>
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
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-content" style={{ maxWidth: '620px' }}>
            <div className="modal-header">
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--slate-900)' }}>
                  {t('areas.import_pilot')}
                </h3>
                <p style={{ fontSize: '12px', color: 'var(--slate-500)', margin: '3px 0 0 0' }}>
                  Required headers: district,ds_division,gn_name,gn_number (also accepts gn_division),initial_teams
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setShowPilotImport(false); setModalError(null); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate-400)', padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {renderModalError()}
              <textarea
                className="input-field"
                rows={6}
                value={pilotCsv}
                onChange={(e) => setPilotCsv(e.target.value)}
                style={{ fontFamily: 'monospace', fontSize: '12px' }}
              />

              {importResult && (
                <div style={{ background: 'var(--success-bg)', border: '1px solid var(--success-border)', padding: '10px 14px', borderRadius: 'var(--radius-sm)', fontSize: '12.5px', color: 'var(--success-text)' }}>
                  Successfully processed pilot area hierarchy!
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button type="button" onClick={() => { setShowPilotImport(false); setModalError(null); }} className="btn-secondary">
                Close
              </button>
              <button type="button" onClick={handleImportPilotCsv} disabled={importing} className="btn-primary">
                {importing ? <Loader2 size={16} className="animate-spin" /> : 'Run Pilot Import'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Team Limit Modal */}
      {editingTeam && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-content" style={{ maxWidth: '420px' }}>
            <div className="modal-header">
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--slate-900)' }}>
                  Edit Member Capacity
                </h3>
                <p style={{ fontSize: '12px', color: 'var(--slate-500)', margin: '2px 0 0 0' }}>
                  Team: {editingTeam.name || editingTeam.teamCode || `Team ${editingTeam.teamNo}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setEditingTeam(null); setModalError(null); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate-400)', padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {renderModalError()}
              <div>
                <label className="form-label">
                  Max Active Members *
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
            </div>

            <div className="modal-footer">
              <button type="button" onClick={() => { setEditingTeam(null); setModalError(null); }} className="btn-secondary">
                Cancel
              </button>
              <button type="button" onClick={handleSaveTeamLimit} disabled={submitting} className="btn-primary">
                {submitting ? <Loader2 size={16} className="animate-spin" /> : 'Save Capacity'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create DS Division Modal */}
      {showDsModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-content" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--slate-900)' }}>
                  Create DS Division
                </h3>
                <p style={{ fontSize: '12px', color: 'var(--slate-500)', margin: '2px 0 0 0' }}>
                  District: {districts.find((d) => d.id === selectedDistrictId)?.nameEn || selectedDistrictId}
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setShowDsModal(false); setModalError(null); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate-400)', padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCreateDs}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {renderModalError()}
                <div>
                  <label className="form-label">English Name *</label>
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
                  <label className="form-label">Sinhala Name (Optional — defaults to English)</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="e.g. මහනුවර කඩවත් සතර"
                    value={dsNameSi}
                    onChange={(e) => setDsNameSi(e.target.value)}
                  />
                </div>
                <div>
                  <label className="form-label">Tamil Name (Optional — defaults to English)</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="e.g. கண்டி கடவத் சதர"
                    value={dsNameTa}
                    onChange={(e) => setDsNameTa(e.target.value)}
                  />
                </div>
                <div>
                  <label className="form-label">SDO Officer Name (Optional)</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="e.g. A.B. Senanayake"
                    value={dsSdoName}
                    onChange={(e) => setDsSdoName(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => { setShowDsModal(false); setModalError(null); }} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="btn-primary">
                  {submitting ? <Loader2 size={16} className="animate-spin" /> : 'Create DS Division'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create GN Division Modal */}
      {showGnModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-content" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--slate-900)' }}>
                  Create GN Division
                </h3>
                <p style={{ fontSize: '12px', color: 'var(--slate-500)', margin: '2px 0 0 0' }}>
                  DS Division: {dsDivisions.find((ds) => ds.id === selectedDsId)?.nameEn || selectedDsId}
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setShowGnModal(false); setModalError(null); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate-400)', padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCreateGn}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {renderModalError()}
                <div>
                  <label className="form-label">GN Number / Code *</label>
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
                  <label className="form-label">GN Division Name *</label>
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
                  <label className="form-label">Secretary Name (Optional)</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="e.g. K.M. Disanayake"
                    value={gnSecName}
                    onChange={(e) => setGnSecName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="form-label">Secretary Phone (Optional)</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="e.g. +94771234567"
                    value={gnSecContact}
                    onChange={(e) => setGnSecContact(e.target.value)}
                  />
                </div>
                <div>
                  <label className="form-label">Secretary Email (Optional)</label>
                  <input
                    type="email"
                    className="input-field"
                    placeholder="e.g. sec.gn101@grs.gov.lk"
                    value={gnSecEmail}
                    onChange={(e) => setGnSecEmail(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => { setShowGnModal(false); setModalError(null); }} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="btn-primary">
                  {submitting ? <Loader2 size={16} className="animate-spin" /> : 'Create GN Division'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Team Modal */}
      {showTeamModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-content" style={{ maxWidth: '420px' }}>
            <div className="modal-header">
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--slate-900)' }}>
                  Create Field Team
                </h3>
                <p style={{ fontSize: '12px', color: 'var(--slate-500)', margin: '2px 0 0 0' }}>
                  GN: {(() => {
                    const g = gnDivisions.find((item) => item.id === selectedGnId);
                    return g?.gnName || g?.nameEn || g?.gnNumber || selectedGnId;
                  })()}
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setShowTeamModal(false); setModalError(null); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate-400)', padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCreateTeam}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {renderModalError()}
                <div>
                  <label className="form-label">Team Number *</label>
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
                  <label className="form-label">Member Capacity Limit *</label>
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
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => { setShowTeamModal(false); setModalError(null); }} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="btn-primary">
                  {submitting ? <Loader2 size={16} className="animate-spin" /> : 'Create Team'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* System Config & Releases Modal */}
      {showConfigModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-content" style={{ maxWidth: '520px' }}>
            <div className="modal-header">
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--slate-900)' }}>
                  System Configuration & Releases
                </h3>
                <p style={{ fontSize: '12px', color: 'var(--slate-500)', margin: '2px 0 0 0' }}>
                  Publish minimum app versions (HTTP 426 enforcement) and adjust synchronization parameters.
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setShowConfigModal(false); setModalError(null); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate-400)', padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSaveConfig}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {renderModalError()}
                <div>
                  <label className="form-label">
                    Minimum App Version (Enforces Upgrade Required on Older Apps) *
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
                  <label className="form-label">
                    Client Sync Jitter Window (Seconds) *
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
                  <label className="form-label">
                    Roles Authorized for Direct Web Entry (Decision C19)
                  </label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', marginTop: '4px' }}>
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
                        <span style={{ textTransform: 'capitalize', color: 'var(--slate-700)' }}>
                          {r.replace('_', ' ')}
                        </span>
                        {r === 'super_admin' && (
                          <span style={{ fontSize: '11px', color: 'var(--slate-400)' }}>(Disabled by default per C19)</span>
                        )}
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" onClick={() => { setShowConfigModal(false); setModalError(null); }} className="btn-secondary">
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
