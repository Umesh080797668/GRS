'use client';

import { useEffect, useState, useRef } from 'react';
import Shell from '../../components/Shell';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import { getAreaScopeLocks } from '../../lib/area-scope';
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
  Trash2,
  Download,
  FileText,
  Table,
  HelpCircle,
  RotateCcw,
  UploadCloud,
  Info,
} from 'lucide-react';
import {
  SRI_LANKA_25_DISTRICTS,
  getPilotAreaTemplateCsv,
  downloadFile,
} from '../../lib/utils';

export interface PilotGridRow {
  id: string;
  district: string;
  dsDivision: string;
  gnNumber: string;
  gnName: string;
  secretaryName: string;
  secretaryContact: string;
  sdoName: string;
  initialTeams: number;
}

const DEFAULT_PILOT_GRID_ROWS: PilotGridRow[] = [
  {
    id: 'row-1',
    district: 'Colombo',
    dsDivision: 'Thimbirigasyaya',
    gnNumber: '514A',
    gnName: 'Kirulapone',
    secretaryName: 'Nimal Perera',
    secretaryContact: '+94771234567',
    sdoName: 'Sunil Jayakody',
    initialTeams: 2,
  },
  {
    id: 'row-2',
    district: 'Colombo',
    dsDivision: 'Thimbirigasyaya',
    gnNumber: '514B',
    gnName: 'Pamankada',
    secretaryName: 'Sunethra Silva',
    secretaryContact: '+94772345678',
    sdoName: 'Sunil Jayakody',
    initialTeams: 3,
  },
  {
    id: 'row-3',
    district: 'Gampaha',
    dsDivision: 'Kelaniya',
    gnNumber: '123',
    gnName: 'Peliyagoda',
    secretaryName: 'Kamal Fernando',
    secretaryContact: '+94773456789',
    sdoName: 'Anura Kumara',
    initialTeams: 2,
  },
  {
    id: 'row-4',
    district: 'Kalutara',
    dsDivision: 'Panadura',
    gnNumber: '675',
    gnName: 'Wekada',
    secretaryName: 'Sarath Perera',
    secretaryContact: '+94774567890',
    sdoName: 'Bandara Silva',
    initialTeams: 1,
  },
];

function gridToCsv(rows: PilotGridRow[]): string {
  const header =
    'district,ds_division,gn_number,gn_name,secretary_name,secretary_contact,secretary_email,sdo_name,initial_teams,max_members_per_team';
  const csvRows = rows.map((r) => {
    return [
      r.district.trim(),
      r.dsDivision.trim(),
      r.gnNumber.trim(),
      r.gnName.trim(),
      r.secretaryName.trim(),
      r.secretaryContact.trim(),
      '',
      r.sdoName.trim(),
      r.initialTeams ?? 0,
      10,
    ]
      .map((val) => {
        const str = String(val);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      })
      .join(',');
  });
  return [header, ...csvRows].join('\n');
}

function parseCsvToGrid(csvText: string): PilotGridRow[] {
  const lines = csvText
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));

  if (lines.length < 2) return [];

  const parseLine = (line: string): string[] => {
    const res: string[] = [];
    let inside = false;
    let curr = '';
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inside && i + 1 < line.length && line[i + 1] === '"') {
          curr += '"';
          i++;
        } else {
          inside = !inside;
        }
      } else if (c === ',' && !inside) {
        res.push(curr.trim());
        curr = '';
      } else {
        curr += c;
      }
    }
    res.push(curr.trim());
    return res;
  };

  const headerNorm = parseLine(lines[0]).map((h) =>
    h
      .toLowerCase()
      .replace(/^["']|["']$/g, '')
      .replace(/[\s_-]+/g, '')
  );

  const findCol = (...aliases: string[]) => {
    for (const a of aliases) {
      const norm = a.toLowerCase().replace(/[\s_-]+/g, '');
      const idx = headerNorm.indexOf(norm);
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const colIdx = {
    district: findCol('district', 'district_name'),
    dsDivision: findCol('ds_division', 'dsdivision', 'ds_name', 'ds'),
    gnNumber: findCol('gn_number', 'gnnumber', 'gn_no', 'gnno'),
    gnName: findCol('gn_name', 'gnname', 'gn_division', 'gndivision'),
    secName: findCol('secretary_name', 'secretary', 'gn_secretary'),
    secContact: findCol('secretary_contact', 'contact', 'phone'),
    sdoName: findCol('sdo_name', 'sdoname', 'sdo'),
    initialTeams: findCol('initial_teams', 'teams', 'team_count'),
  };

  const rows: PilotGridRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = parseLine(lines[i]);
    if (parts.length === 0 || (parts.length === 1 && !parts[0])) continue;
    rows.push({
      id: `row-${i}-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      district: colIdx.district !== -1 ? parts[colIdx.district] || '' : parts[0] || '',
      dsDivision: colIdx.dsDivision !== -1 ? parts[colIdx.dsDivision] || '' : parts[1] || '',
      gnNumber: colIdx.gnNumber !== -1 ? parts[colIdx.gnNumber] || '' : parts[2] || '',
      gnName: colIdx.gnName !== -1 ? parts[colIdx.gnName] || '' : parts[3] || '',
      secretaryName: colIdx.secName !== -1 ? parts[colIdx.secName] || '' : '',
      secretaryContact: colIdx.secContact !== -1 ? parts[colIdx.secContact] || '' : '',
      sdoName: colIdx.sdoName !== -1 ? parts[colIdx.sdoName] || '' : '',
      initialTeams:
        colIdx.initialTeams !== -1
          ? isNaN(parseInt(parts[colIdx.initialTeams], 10))
            ? 0
            : parseInt(parts[colIdx.initialTeams], 10)
          : 0,
    });
  }
  return rows;
}

function validateGridRow(row: PilotGridRow): { isValid: boolean; error?: string } {
  if (!row.district.trim()) {
    return { isValid: false, error: 'District is required' };
  }
  const normDist = row.district.trim().toLowerCase().replace(/[\s_-]/g, '');
  const isValidDist = SRI_LANKA_25_DISTRICTS.some(
    (d) => d.toLowerCase().replace(/[\s_-]/g, '') === normDist
  );
  if (!isValidDist) {
    return {
      isValid: false,
      error: `"${row.district}" is not one of 25 official districts`,
    };
  }
  if (!row.dsDivision.trim()) {
    return { isValid: false, error: 'DS Division is required' };
  }
  if (!row.gnNumber.trim()) {
    return { isValid: false, error: 'GN Number is required' };
  }
  if (!row.gnName.trim()) {
    return { isValid: false, error: 'GN Name is required' };
  }
  if (row.initialTeams < 0 || row.initialTeams > 50) {
    return { isValid: false, error: 'Teams must be between 0 and 50' };
  }
  return { isValid: true };
}

export default function AreasPage() {
  const { t } = useLanguage();
  const { user, isLoading: authLoading } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';
  const canManageAreas = user?.role === 'super_admin' || user?.role === 'admin';
  const isDc = user?.role === 'dc';
  const isSdo = user?.role === 'sda';
  const areaLocks = getAreaScopeLocks(user?.role);
  const canManageGnMeta = canManageAreas || isSdo;
  const canManageTeams = canManageAreas || isSdo;
  const [districts, setDistricts] = useState<any[]>([]);
  const [dsDivisions, setDsDivisions] = useState<any[]>([]);
  const [gnDivisions, setGnDivisions] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);

  const [selectedDistrictId, setSelectedDistrictId] = useState<string>('');
  const [selectedDsId, setSelectedDsId] = useState<string>('');
  const [selectedGnId, setSelectedGnId] = useState<string>('');

  const [loading, setLoading] = useState(true);
  const [showPilotImport, setShowPilotImport] = useState(false);
  const [pilotImportMode, setPilotImportMode] = useState<'grid' | 'csv'>('grid');
  const [pilotGridRows, setPilotGridRows] = useState<PilotGridRow[]>(DEFAULT_PILOT_GRID_ROWS);
  const [pilotCsv, setPilotCsv] = useState(getPilotAreaTemplateCsv());
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  const [pilotDryRunResult, setPilotDryRunResult] = useState<any>(null);
  const [showPilotGuide, setShowPilotGuide] = useState(false);
  const [isDraggingCsv, setIsDraggingCsv] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Edit / Delete modals
  const [editingTeam, setEditingTeam] = useState<any>(null);
  const [editTeamNo, setEditTeamNo] = useState<number>(1);
  const [newTeamLimit, setNewTeamLimit] = useState<number>(10);

  const [editingDs, setEditingDs] = useState<any>(null);
  const [editDsNameEn, setEditDsNameEn] = useState('');
  const [editDsNameSi, setEditDsNameSi] = useState('');
  const [editDsNameTa, setEditDsNameTa] = useState('');
  const [editDsSdoName, setEditDsSdoName] = useState('');

  const [editingGn, setEditingGn] = useState<any>(null);
  const [editGnNumber, setEditGnNumber] = useState('');
  const [editGnName, setEditGnName] = useState('');
  const [editGnSecName, setEditGnSecName] = useState('');
  const [editGnSecContact, setEditGnSecContact] = useState('');
  const [editGnSecEmail, setEditGnSecEmail] = useState('');

  const [deletingTarget, setDeletingTarget] = useState<{
    type: 'ds' | 'gn' | 'team';
    item: any;
    label: string;
  } | null>(null);

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
    if (authLoading || !user) return;
    loadDistricts(user?.districtId || undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user?.id, user?.role, user?.districtId, user?.dsId]);

  const loadDistricts = async (preferredDistrictId?: string) => {
    try {
      setLoading(true);
      const rawData = await api.getDistricts();
      const data =
        areaLocks.isDistrictLocked && user?.districtId
          ? rawData.filter((d) => d.id === user.districtId)
          : rawData;
      setDistricts(data);
      if (data.length > 0) {
        const nextDistrictId =
          preferredDistrictId && data.some((d) => d.id === preferredDistrictId)
            ? preferredDistrictId
            : data[0].id;
        setSelectedDistrictId(nextDistrictId);
        await loadDsDivisions(nextDistrictId, areaLocks.isDsLocked ? user?.dsId || undefined : undefined);
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
      const rawData = await api.getDsDivisions(districtId);
      const data =
        areaLocks.isDsLocked && user?.dsId ? rawData.filter((ds) => ds.id === user.dsId) : rawData;
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
    if (areaLocks.isDistrictLocked) return;
    setSelectedDistrictId(id);
    loadDsDivisions(id);
  };

  const handleDsChange = (id: string) => {
    if (areaLocks.isDsLocked) return;
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
      setConfigWebRoles(cfg.webEntryRoles || cfg.web_entry_roles || ['cdc_secretary', 'sda', 'admin']);
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

  const handleSaveTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTeam) return;
    setSubmitting(true);
    setModalError(null);
    setErrorBanner(null);
    setSuccessBanner(null);
    try {
      await api.updateTeam(editingTeam.id, {
        teamNo: Number(editTeamNo),
        maxMembers: Number(newTeamLimit),
      });
      setEditingTeam(null);
      setSuccessBanner('Field team updated successfully.');
      await loadTeams(selectedGnId);
    } catch (err: any) {
      setModalError(err.message || 'Failed to update field team.');
    } finally {
      setSubmitting(false);
    }
  };

  const openEditDs = (ds: any) => {
    setModalError(null);
    setEditingDs(ds);
    setEditDsNameEn(ds.nameEn || ds.name_en || ds.name || '');
    setEditDsNameSi(ds.nameSi || ds.name_si || '');
    setEditDsNameTa(ds.nameTa || ds.name_ta || '');
    setEditDsSdoName(ds.sdoName || ds.sdo_name || '');
  };

  const handleUpdateDs = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDs) return;
    setSubmitting(true);
    setModalError(null);
    setErrorBanner(null);
    setSuccessBanner(null);
    try {
      await api.updateDsDivision(editingDs.id, {
        nameEn: editDsNameEn.trim(),
        nameSi: editDsNameSi.trim(),
        nameTa: editDsNameTa.trim(),
        sdoName: editDsSdoName.trim(),
      });
      const updatedId = editingDs.id;
      setEditingDs(null);
      setSuccessBanner('DS Division updated successfully.');
      await loadDsDivisions(selectedDistrictId, updatedId);
    } catch (err: any) {
      setModalError(err.message || 'Failed to update DS Division.');
    } finally {
      setSubmitting(false);
    }
  };

  const openEditGn = (gn: any) => {
    setModalError(null);
    setEditingGn(gn);
    setEditGnNumber(gn.gnNumber || gn.gn_number || gn.code || '');
    setEditGnName(gn.gnName || gn.gn_name || gn.nameEn || gn.name || '');
    setEditGnSecName(gn.secretaryName || gn.secretary_name || '');
    setEditGnSecContact(gn.secretaryContact || gn.secretary_contact || '');
    setEditGnSecEmail(gn.secretaryEmail || gn.secretary_email || '');
  };

  const handleUpdateGn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingGn) return;
    setSubmitting(true);
    setModalError(null);
    setErrorBanner(null);
    setSuccessBanner(null);
    try {
      await api.updateGnDivision(editingGn.id, {
        gnNumber: editGnNumber.trim(),
        gnName: editGnName.trim(),
        secretaryName: editGnSecName.trim(),
        secretaryContact: editGnSecContact.trim(),
        secretaryEmail: editGnSecEmail.trim(),
      });
      const updatedId = editingGn.id;
      setEditingGn(null);
      setSuccessBanner('GN Division updated successfully.');
      await loadGnDivisions(selectedDsId, updatedId);
    } catch (err: any) {
      setModalError(err.message || 'Failed to update GN Division.');
    } finally {
      setSubmitting(false);
    }
  };

  const openDeleteConfirm = (type: 'ds' | 'gn' | 'team', item: any) => {
    setModalError(null);
    let label = '';
    if (type === 'ds') {
      label = item.nameEn || item.name || item.id;
    } else if (type === 'gn') {
      const gnNameVal = item.gnName || item.nameEn || item.name;
      const gnNoVal = item.gnNumber || item.code;
      label = gnNoVal && gnNameVal ? `${gnNoVal} — ${gnNameVal}` : gnNameVal || gnNoVal || item.id;
    } else {
      label = item.name || item.teamCode || `Team ${item.teamNo}`;
    }
    setDeletingTarget({ type, item, label });
  };

  const handleConfirmDelete = async () => {
    if (!deletingTarget) return;
    setSubmitting(true);
    setModalError(null);
    setErrorBanner(null);
    setSuccessBanner(null);
    try {
      if (deletingTarget.type === 'ds') {
        await api.deleteDsDivision(deletingTarget.item.id);
        const preferred = selectedDsId === deletingTarget.item.id ? undefined : selectedDsId;
        setDeletingTarget(null);
        setSuccessBanner('DS Division deleted successfully.');
        await loadDsDivisions(selectedDistrictId, preferred);
      } else if (deletingTarget.type === 'gn') {
        await api.deleteGnDivision(deletingTarget.item.id);
        const preferred = selectedGnId === deletingTarget.item.id ? undefined : selectedGnId;
        setDeletingTarget(null);
        setSuccessBanner('GN Division deleted successfully.');
        await loadGnDivisions(selectedDsId, preferred);
      } else {
        await api.deleteTeam(deletingTarget.item.id);
        setDeletingTarget(null);
        setSuccessBanner('Field team deleted successfully.');
        await loadTeams(selectedGnId);
      }
    } catch (err: any) {
      setModalError(err.message || 'Delete operation failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddGridRow = () => {
    const lastRow = pilotGridRows[pilotGridRows.length - 1];
    const newRow: PilotGridRow = {
      id: `row-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      district: lastRow?.district || 'Colombo',
      dsDivision: lastRow?.dsDivision || '',
      gnNumber: '',
      gnName: '',
      secretaryName: '',
      secretaryContact: '',
      sdoName: lastRow?.sdoName || '',
      initialTeams: lastRow?.initialTeams ?? 0,
    };
    const next = [...pilotGridRows, newRow];
    setPilotGridRows(next);
    setPilotCsv(gridToCsv(next));
    setModalError(null);
    setPilotDryRunResult(null);
  };

  const handleAdd5GridRows = () => {
    const lastRow = pilotGridRows[pilotGridRows.length - 1];
    const newRows: PilotGridRow[] = Array.from({ length: 5 }).map((_, idx) => ({
      id: `row-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 4)}`,
      district: lastRow?.district || 'Colombo',
      dsDivision: lastRow?.dsDivision || '',
      gnNumber: '',
      gnName: '',
      secretaryName: '',
      secretaryContact: '',
      sdoName: lastRow?.sdoName || '',
      initialTeams: lastRow?.initialTeams ?? 0,
    }));
    const next = [...pilotGridRows, ...newRows];
    setPilotGridRows(next);
    setPilotCsv(gridToCsv(next));
    setModalError(null);
    setPilotDryRunResult(null);
  };

  const handleUpdateGridRow = (
    id: string,
    field: keyof PilotGridRow,
    value: any
  ) => {
    const next = pilotGridRows.map((r) => {
      if (r.id !== id) return r;
      return { ...r, [field]: value };
    });
    setPilotGridRows(next);
    setPilotCsv(gridToCsv(next));
    setModalError(null);
    setPilotDryRunResult(null);
  };

  const handleDeleteGridRow = (id: string) => {
    const next = pilotGridRows.filter((r) => r.id !== id);
    setPilotGridRows(next);
    setPilotCsv(gridToCsv(next));
    setModalError(null);
    setPilotDryRunResult(null);
  };

  const handleClearGridRows = () => {
    setPilotGridRows([]);
    setPilotCsv(
      'district,ds_division,gn_number,gn_name,secretary_name,secretary_contact,secretary_email,sdo_name,initial_teams,max_members_per_team\n'
    );
    setModalError(null);
    setPilotDryRunResult(null);
  };

  const handleResetSampleGridRows = () => {
    setPilotGridRows(DEFAULT_PILOT_GRID_ROWS);
    setPilotCsv(getPilotAreaTemplateCsv());
    setModalError(null);
    setPilotDryRunResult(null);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setPilotCsv(content);
        const parsed = parseCsvToGrid(content);
        if (parsed.length > 0) {
          setPilotGridRows(parsed);
        }
        setModalError(null);
        setPilotDryRunResult(null);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingCsv(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setPilotCsv(content);
        const parsed = parseCsvToGrid(content);
        if (parsed.length > 0) {
          setPilotGridRows(parsed);
        }
        setModalError(null);
        setPilotDryRunResult(null);
      }
    };
    reader.readAsText(file);
  };

  const handleImportPilotCsv = async (dryRun = false) => {
    let effectiveCsv = pilotCsv;
    if (pilotImportMode === 'grid') {
      if (pilotGridRows.length === 0) {
        setModalError('Please add at least one row in the grid.');
        return;
      }
      effectiveCsv = gridToCsv(pilotGridRows);
      setPilotCsv(effectiveCsv);
    }

    if (!effectiveCsv.trim()) {
      setModalError('CSV content is empty. Please enter or upload area data.');
      return;
    }

    setImporting(true);
    setImportResult(null);
    setPilotDryRunResult(null);
    setModalError(null);
    setErrorBanner(null);
    setSuccessBanner(null);

    try {
      const res = await api.importPilotAreaCsv(effectiveCsv, dryRun);
      if (dryRun) {
        setPilotDryRunResult(res);
        if (res.errors && res.errors.length > 0) {
          setModalError(
            `Dry run detected ${res.errors.length} validation issue(s). See error details below.`
          );
        }
        return;
      }

      setImportResult(res);
      if (res.errors && res.errors.length > 0) {
        setModalError(
          `Import halted: ${res.errors.length} error(s) found in CSV data. No areas were created.`
        );
        return;
      }

      setSuccessBanner(
        `Pilot area hierarchy created successfully! Added/verified ${res.rowCount} row(s) (${res.importedDistricts} new districts, ${res.importedDs} new DS divisions, ${res.importedGn} new GN divisions, and ${res.importedTeams} field teams provisioned).`
      );
      setShowPilotImport(false);

      // Select first district
      const firstRowDistrict =
        pilotImportMode === 'grid'
          ? pilotGridRows[0]?.district
          : parseCsvToGrid(effectiveCsv)[0]?.district;
      await loadDistricts(selectedDistrictId);
      if (firstRowDistrict) {
        const found = districts.find(
          (d) => d.nameEn.toLowerCase() === firstRowDistrict.toLowerCase()
        );
        if (found) {
          handleDistrictChange(found.id);
        }
      }
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
            {isSdo
              ? 'Manage GN metadata and Field Teams within your assigned DS division (SDA Officer — Level 3).'
              : isDc
                ? 'Monitor DS divisions, GN divisions, and Field Teams within your assigned district (DC Officer — Level 2, Read-Only).'
                : 'Administrative boundaries, team allocations, capacity limits, and system releases (Level 00).'}
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
                  <div
                    key={ds.id}
                    style={{
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid',
                      borderColor: isSelected ? 'var(--success-border)' : 'transparent',
                      background: isSelected ? 'var(--success-bg)' : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      transition: 'all 0.12s ease',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) e.currentTarget.style.background = 'var(--slate-100)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => handleDsChange(ds.id)}
                      style={{
                        flex: 1,
                        minWidth: 0,
                        padding: '9px 10px 9px 12px',
                        border: 'none',
                        background: 'transparent',
                        color: isSelected ? 'var(--success-text)' : 'var(--slate-700)',
                        fontWeight: isSelected ? 600 : 500,
                        textAlign: 'left',
                        cursor: 'pointer',
                        fontSize: '13px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '6px',
                      }}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {ds.nameEn || ds.name}
                      </span>
                      {isSelected && <CheckCircle size={14} style={{ color: 'var(--success)', flexShrink: 0 }} />}
                    </button>
                    {canManageAreas && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '2px', paddingRight: '6px', flexShrink: 0 }}>
                        <button
                          type="button"
                          onClick={() => openEditDs(ds)}
                          title={t('areas.edit_ds')}
                          aria-label={t('areas.edit_ds')}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: 'var(--slate-500)',
                            padding: '4px',
                            borderRadius: '4px',
                            display: 'inline-flex',
                          }}
                        >
                          <Edit2 size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => openDeleteConfirm('ds', ds)}
                          title={t('areas.delete_ds')}
                          aria-label={t('areas.delete_ds')}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: 'var(--danger-text)',
                            padding: '4px',
                            borderRadius: '4px',
                            display: 'inline-flex',
                          }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                  </div>
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
                  <div
                    key={gn.id}
                    style={{
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid',
                      borderColor: isSelected ? 'var(--warning-border)' : 'transparent',
                      background: isSelected ? 'var(--warning-bg)' : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      transition: 'all 0.12s ease',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) e.currentTarget.style.background = 'var(--slate-100)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => handleGnChange(gn.id)}
                      style={{
                        flex: 1,
                        minWidth: 0,
                        padding: '8px 10px 8px 12px',
                        border: 'none',
                        background: 'transparent',
                        color: isSelected ? 'var(--warning-text)' : 'var(--slate-700)',
                        fontWeight: isSelected ? 600 : 500,
                        textAlign: 'left',
                        cursor: 'pointer',
                        fontSize: '13px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '6px',
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ color: isSelected ? 'var(--warning-text)' : 'var(--slate-900)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {gn.gnName || gn.nameEn || gn.name || gn.gnNumber}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--slate-500)', marginTop: '1px' }}>
                          GN No: {gn.gnNumber || gn.code || '—'}
                        </div>
                      </div>
                      {isSelected && <CheckCircle size={14} style={{ color: 'var(--warning)', flexShrink: 0 }} />}
                    </button>
                    {canManageGnMeta && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '2px', paddingRight: '6px', flexShrink: 0 }}>
                        <button
                          type="button"
                          onClick={() => openEditGn(gn)}
                          title={t('areas.edit_gn')}
                          aria-label={t('areas.edit_gn')}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: 'var(--slate-500)',
                            padding: '4px',
                            borderRadius: '4px',
                            display: 'inline-flex',
                          }}
                        >
                          <Edit2 size={13} />
                        </button>
                        {canManageAreas && (
                          <button
                            type="button"
                            onClick={() => openDeleteConfirm('gn', gn)}
                            title={t('areas.delete_gn')}
                            aria-label={t('areas.delete_gn')}
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              color: 'var(--danger-text)',
                              padding: '4px',
                              borderRadius: '4px',
                              display: 'inline-flex',
                            }}
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
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
              {canManageTeams && (
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

                    {canManageTeams && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                        <button
                          type="button"
                          onClick={() => {
                            setModalError(null);
                            setEditingTeam(tm);
                            setEditTeamNo(tm.teamNo ?? tm.team_no ?? 1);
                            setNewTeamLimit(limit);
                          }}
                          className="btn-secondary"
                          style={{ padding: '5px 8px', fontSize: '11px' }}
                          title={t('areas.edit_team')}
                          aria-label={t('areas.edit_team')}
                        >
                          <Edit2 size={12} />
                          <span>{t('common.edit')}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openDeleteConfirm('team', tm)}
                          className="btn-secondary"
                          style={{
                            padding: '5px 7px',
                            fontSize: '11px',
                            color: 'var(--danger-text)',
                            borderColor: 'var(--danger-border)',
                          }}
                          title={t('areas.delete_team')}
                          aria-label={t('areas.delete_team')}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Pilot Area CSV Import Modal */}
      {showPilotImport && (() => {
        const rowValidations = pilotGridRows.map(validateGridRow);
        const validCount = rowValidations.filter((v) => v.isValid).length;
        const invalidCount = pilotGridRows.length - validCount;
        const uniqueDistricts = new Set(
          pilotGridRows.map((r) => r.district.trim()).filter(Boolean)
        ).size;
        const uniqueDs = new Set(
          pilotGridRows
            .map((r) => `${r.district.trim()}_${r.dsDivision.trim()}`)
            .filter((val) => !val.startsWith('_') && !val.endsWith('_'))
        ).size;
        const totalTeams = pilotGridRows.reduce(
          (sum, r) => sum + (parseInt(String(r.initialTeams), 10) || 0),
          0
        );

        return (
          <div className="modal-backdrop" role="dialog" aria-modal="true">
            <div
              className="modal-content"
              style={{
                maxWidth: '1100px',
                width: '95vw',
                maxHeight: '92vh',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {/* Header */}
              <div className="modal-header" style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '8px',
                      background: 'var(--primary-subtle, rgba(37, 99, 235, 0.1))',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--primary)',
                    }}
                  >
                    <Layers size={20} />
                  </div>
                  <div>
                    <h3
                      style={{
                        fontSize: '17px',
                        fontWeight: 700,
                        margin: 0,
                        color: 'var(--slate-900)',
                      }}
                    >
                      {t('areas.import_pilot')} (Pilot Area Bulk Import)
                    </h3>
                    <p
                      style={{
                        fontSize: '12.5px',
                        color: 'var(--slate-500)',
                        margin: '3px 0 0 0',
                      }}
                    >
                      Add and provision multiple Districts, DS Divisions, GN Divisions, and Field Teams simultaneously.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowPilotImport(false);
                    setModalError(null);
                    setPilotDryRunResult(null);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--slate-400)',
                    padding: '6px',
                  }}
                >
                  <X size={20} />
                </button>
              </div>

              {/* Modal Body - Scrollable */}
              <div
                className="modal-body"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                  overflowY: 'auto',
                  padding: '16px 20px',
                  flex: 1,
                }}
              >
                {/* Control Bar: Mode Toggle & Utilities */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '10px',
                    paddingBottom: '12px',
                    borderBottom: '1px solid var(--slate-200)',
                  }}
                >
                  {/* Mode Tabs */}
                  <div style={{ display: 'flex', background: 'var(--slate-100)', borderRadius: '6px', padding: '3px', gap: '2px' }}>
                    <button
                      type="button"
                      onClick={() => {
                        setPilotImportMode('grid');
                        const parsed = parseCsvToGrid(pilotCsv);
                        if (parsed.length > 0) setPilotGridRows(parsed);
                      }}
                      className={pilotImportMode === 'grid' ? 'btn-primary' : 'btn-secondary'}
                      style={{
                        padding: '5px 12px',
                        fontSize: '12.5px',
                        height: '32px',
                        borderRadius: '4px',
                        border: 'none',
                        boxShadow: pilotImportMode === 'grid' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                      }}
                    >
                      <Table size={14} />
                      <span>{t('areas.pilot_mode_grid')}</span>
                      <span
                        style={{
                          background: pilotImportMode === 'grid' ? 'rgba(255,255,255,0.25)' : 'var(--slate-200)',
                          padding: '1px 6px',
                          borderRadius: '10px',
                          fontSize: '11px',
                          fontWeight: 600,
                          marginLeft: '4px',
                        }}
                      >
                        {pilotGridRows.length}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPilotImportMode('csv');
                        setPilotCsv(gridToCsv(pilotGridRows));
                      }}
                      className={pilotImportMode === 'csv' ? 'btn-primary' : 'btn-secondary'}
                      style={{
                        padding: '5px 12px',
                        fontSize: '12.5px',
                        height: '32px',
                        borderRadius: '4px',
                        border: 'none',
                        boxShadow: pilotImportMode === 'csv' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                      }}
                    >
                      <FileText size={14} />
                      <span>{t('areas.pilot_mode_csv')}</span>
                    </button>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => downloadFile(getPilotAreaTemplateCsv(), 'pilot_areas_template.csv')}
                      className="btn-secondary"
                      style={{ padding: '4px 10px', fontSize: '12px', height: '32px' }}
                      title="Download template CSV with columns and demo rows"
                    >
                      <Download size={13} />
                      <span>{t('areas.pilot_template_download')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowPilotGuide(!showPilotGuide)}
                      className="btn-secondary"
                      style={{
                        padding: '4px 10px',
                        fontSize: '12px',
                        height: '32px',
                        background: showPilotGuide ? 'var(--slate-200)' : undefined,
                      }}
                    >
                      <HelpCircle size={13} />
                      <span>Format Guide</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleResetSampleGridRows}
                      className="btn-secondary"
                      style={{ padding: '4px 10px', fontSize: '12px', height: '32px' }}
                      title="Reset rows to 4 clean sample areas"
                    >
                      <RotateCcw size={13} />
                      <span>Reset Samples</span>
                    </button>
                  </div>
                </div>

                {/* Collapsible Format Guide */}
                {showPilotGuide && (
                  <div
                    style={{
                      background: 'var(--slate-50, #f8fafc)',
                      border: '1px solid var(--slate-200, #e2e8f0)',
                      borderRadius: '8px',
                      padding: '14px 16px',
                      fontSize: '12.5px',
                      lineHeight: '1.6',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, color: 'var(--slate-800)', marginBottom: '6px' }}>
                      <Info size={16} style={{ color: 'var(--primary)' }} />
                      <span>CSV Format & Hierarchy Specifications:</span>
                    </div>
                    <ul style={{ margin: '0 0 8px 18px', padding: 0, color: 'var(--slate-700)' }}>
                      <li>
                        <strong>district</strong> (Required): Must match one of Sri Lanka&apos;s 25 official districts (e.g. <em>Colombo, Gampaha, Kalutara, Kandy, Galle, Jaffna, etc.</em>). Trilingual (English, Sinhala, Tamil) accepted.
                      </li>
                      <li>
                        <strong>ds_division</strong> (Required): Divisional Secretariat name (e.g. <em>Thimbirigasyaya</em>). If already in the system, it will be reused.
                      </li>
                      <li>
                        <strong>gn_number</strong> (Required): Grama Niladhari division code / number (e.g. <em>514A, 675, GN-01</em>).
                      </li>
                      <li>
                        <strong>gn_name</strong> (Required): Grama Niladhari division name (e.g. <em>Kirulapone</em>). Also accepts <code>gn_division</code>.
                      </li>
                      <li>
                        <strong>initial_teams</strong> (Optional): Number of Field Teams to automatically provision (0 to 50, default: <code>0</code>). Set to <code>0</code> to create areas without initial field teams.
                      </li>
                      <li>
                        <strong>secretary_name, secretary_contact, sdo_name</strong> (Optional): Contact and officer metadata for the GN / DS division.
                      </li>
                    </ul>
                    <div style={{ fontSize: '11.5px', color: 'var(--slate-500)' }}>
                      💡 Tip: Multiple GN divisions in the same DS Division or District can be imported together; the system will group them under the same administrative parents automatically without duplicate entries.
                    </div>
                  </div>
                )}

                {/* Error Banner */}
                {renderModalError()}

                {/* Server Error Table */}
                {(pilotDryRunResult?.errors?.length > 0 || importResult?.errors?.length > 0) && (
                  <div
                    style={{
                      background: 'var(--danger-bg)',
                      border: '1px solid var(--danger-border)',
                      borderRadius: '6px',
                      padding: '10px 14px',
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--danger-text)', marginBottom: '6px' }}>
                      Validation Issues Detected by Server:
                    </div>
                    <div style={{ maxHeight: '120px', overflowY: 'auto' }}>
                      <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--danger-border)' }}>
                            <th style={{ padding: '3px 6px', width: '70px' }}>Row</th>
                            <th style={{ padding: '3px 6px' }}>Error Details</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(pilotDryRunResult?.errors || importResult?.errors || []).map((err: any, idx: number) => (
                            <tr key={idx} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                              <td style={{ padding: '3px 6px', fontWeight: 600 }}>Row {err.row}</td>
                              <td style={{ padding: '3px 6px' }}>{err.error}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Dry Run Success Banner */}
                {pilotDryRunResult?.dryRun && (!pilotDryRunResult.errors || pilotDryRunResult.errors.length === 0) && (
                  <div
                    style={{
                      background: 'var(--success-bg)',
                      border: '1px solid var(--success-border)',
                      borderRadius: '6px',
                      padding: '10px 14px',
                      color: 'var(--success-text)',
                      fontSize: '13px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <CheckCircle size={16} />
                    <span>
                      <strong>Dry Run Passed:</strong> All {pilotDryRunResult.rowCount} rows verified successfully with 0 errors! Click <strong>Import & Create Areas</strong> to commit to database.
                    </span>
                  </div>
                )}

                {/* Import Success Banner */}
                {importResult && (!importResult.errors || importResult.errors.length === 0) && (
                  <div
                    style={{
                      background: 'var(--success-bg)',
                      border: '1px solid var(--success-border)',
                      borderRadius: '6px',
                      padding: '10px 14px',
                      color: 'var(--success-text)',
                      fontSize: '13px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <CheckCircle size={16} />
                    <span>
                      <strong>Import Complete:</strong> Created/verified {importResult.rowCount} row(s) ({importResult.importedDistricts} new Districts, {importResult.importedDs} new DS Divisions, {importResult.importedGn} new GN Divisions, and {importResult.importedTeams} Field Teams provisioned).
                    </span>
                  </div>
                )}

                {/* MODE 1: Interactive Multi-Row Grid */}
                {pilotImportMode === 'grid' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {/* Grid Toolbar */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <button
                          type="button"
                          onClick={handleAddGridRow}
                          className="btn-secondary"
                          style={{ padding: '4px 10px', fontSize: '12px', height: '28px' }}
                        >
                          <Plus size={13} />
                          <span>{t('areas.pilot_add_row')}</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleAdd5GridRows}
                          className="btn-secondary"
                          style={{ padding: '4px 10px', fontSize: '12px', height: '28px' }}
                        >
                          <Plus size={13} />
                          <span>+ 5 Rows</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleClearGridRows}
                          className="btn-secondary"
                          style={{ padding: '4px 10px', fontSize: '12px', height: '28px', color: 'var(--danger-text)' }}
                        >
                          <Trash2 size={13} />
                          <span>Clear All</span>
                        </button>
                      </div>

                      <div>
                        {invalidCount === 0 ? (
                          <span className="badge badge-success" style={{ fontSize: '11.5px', padding: '3px 8px' }}>
                            ✓ {validCount} of {pilotGridRows.length} rows valid
                          </span>
                        ) : (
                          <span className="badge badge-danger" style={{ fontSize: '11.5px', padding: '3px 8px' }}>
                            ⚠ {invalidCount} row(s) have errors
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Table Container */}
                    <div
                      style={{
                        border: '1px solid var(--slate-200)',
                        borderRadius: '6px',
                        overflowX: 'auto',
                        maxHeight: '340px',
                      }}
                    >
                      <table style={{ width: '100%', minWidth: '950px', borderCollapse: 'collapse', fontSize: '12px' }}>
                        <thead style={{ position: 'sticky', top: 0, background: 'var(--slate-100)', zIndex: 1 }}>
                          <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--slate-200)' }}>
                            <th style={{ padding: '8px', width: '36px', textAlign: 'center' }}>#</th>
                            <th style={{ padding: '8px', width: '40px', textAlign: 'center' }}>Status</th>
                            <th style={{ padding: '8px', width: '140px' }}>District *</th>
                            <th style={{ padding: '8px', width: '140px' }}>DS Division *</th>
                            <th style={{ padding: '8px', width: '100px' }}>GN No. *</th>
                            <th style={{ padding: '8px', width: '140px' }}>GN Name *</th>
                            <th style={{ padding: '8px', width: '130px' }}>Secretary Name</th>
                            <th style={{ padding: '8px', width: '110px' }}>Phone</th>
                            <th style={{ padding: '8px', width: '120px' }}>SDO Officer</th>
                            <th style={{ padding: '8px', width: '70px', textAlign: 'center' }}>Teams</th>
                            <th style={{ padding: '8px', width: '40px', textAlign: 'center' }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {pilotGridRows.length === 0 ? (
                            <tr>
                              <td colSpan={11} style={{ textAlign: 'center', padding: '2rem', color: 'var(--slate-400)' }}>
                                No rows yet. Click <strong>&quot;Add Row&quot;</strong> or <strong>&quot;Reset Samples&quot;</strong> to start!
                              </td>
                            </tr>
                          ) : (
                            pilotGridRows.map((row, idx) => {
                              const val = validateGridRow(row);
                              return (
                                <tr
                                  key={row.id}
                                  style={{
                                    borderBottom: '1px solid var(--slate-100)',
                                    background: val.isValid ? undefined : 'rgba(239, 68, 68, 0.04)',
                                  }}
                                >
                                  <td style={{ padding: '4px 6px', textAlign: 'center', color: 'var(--slate-400)', fontWeight: 600 }}>
                                    {idx + 1}
                                  </td>
                                  <td style={{ padding: '4px 6px', textAlign: 'center' }} title={val.isValid ? 'Row is valid' : val.error}>
                                    {val.isValid ? (
                                      <CheckCircle size={15} style={{ color: 'var(--success)' }} />
                                    ) : (
                                      <AlertCircle size={15} style={{ color: 'var(--danger-text)' }} />
                                    )}
                                  </td>
                                  <td style={{ padding: '4px 6px' }}>
                                    <select
                                      className="input-field"
                                      value={row.district}
                                      onChange={(e) => handleUpdateGridRow(row.id, 'district', e.target.value)}
                                      style={{ padding: '3px 6px', fontSize: '12px', height: '28px' }}
                                    >
                                      <option value="">Select District...</option>
                                      {SRI_LANKA_25_DISTRICTS.map((d) => (
                                        <option key={d} value={d}>
                                          {d}
                                        </option>
                                      ))}
                                    </select>
                                  </td>
                                  <td style={{ padding: '4px 6px' }}>
                                    <input
                                      type="text"
                                      className="input-field"
                                      placeholder="DS Division"
                                      value={row.dsDivision}
                                      onChange={(e) => handleUpdateGridRow(row.id, 'dsDivision', e.target.value)}
                                      style={{ padding: '3px 6px', fontSize: '12px', height: '28px' }}
                                    />
                                  </td>
                                  <td style={{ padding: '4px 6px' }}>
                                    <input
                                      type="text"
                                      className="input-field"
                                      placeholder="e.g. 514A"
                                      value={row.gnNumber}
                                      onChange={(e) => handleUpdateGridRow(row.id, 'gnNumber', e.target.value)}
                                      style={{ padding: '3px 6px', fontSize: '12px', height: '28px' }}
                                    />
                                  </td>
                                  <td style={{ padding: '4px 6px' }}>
                                    <input
                                      type="text"
                                      className="input-field"
                                      placeholder="GN Name"
                                      value={row.gnName}
                                      onChange={(e) => handleUpdateGridRow(row.id, 'gnName', e.target.value)}
                                      style={{ padding: '3px 6px', fontSize: '12px', height: '28px' }}
                                    />
                                  </td>
                                  <td style={{ padding: '4px 6px' }}>
                                    <input
                                      type="text"
                                      className="input-field"
                                      placeholder="Secretary"
                                      value={row.secretaryName}
                                      onChange={(e) => handleUpdateGridRow(row.id, 'secretaryName', e.target.value)}
                                      style={{ padding: '3px 6px', fontSize: '12px', height: '28px' }}
                                    />
                                  </td>
                                  <td style={{ padding: '4px 6px' }}>
                                    <input
                                      type="text"
                                      className="input-field"
                                      placeholder="+94..."
                                      value={row.secretaryContact}
                                      onChange={(e) => handleUpdateGridRow(row.id, 'secretaryContact', e.target.value)}
                                      style={{ padding: '3px 6px', fontSize: '12px', height: '28px' }}
                                    />
                                  </td>
                                  <td style={{ padding: '4px 6px' }}>
                                    <input
                                      type="text"
                                      className="input-field"
                                      placeholder="SDO Name"
                                      value={row.sdoName}
                                      onChange={(e) => handleUpdateGridRow(row.id, 'sdoName', e.target.value)}
                                      style={{ padding: '3px 6px', fontSize: '12px', height: '28px' }}
                                    />
                                  </td>
                                  <td style={{ padding: '4px 6px' }}>
                                    <input
                                      type="number"
                                      min="0"
                                      max="50"
                                      className="input-field"
                                      value={row.initialTeams}
                                      onChange={(e) => {
                                        const raw = e.target.value.trim();
                                        const val = raw === '' ? 0 : parseInt(raw, 10);
                                        handleUpdateGridRow(
                                          row.id,
                                          'initialTeams',
                                          isNaN(val) ? 0 : val
                                        );
                                      }}
                                      style={{ padding: '3px 6px', fontSize: '12px', height: '28px', textAlign: 'center' }}
                                    />
                                  </td>
                                  <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteGridRow(row.id)}
                                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate-400)', padding: '2px' }}
                                      title="Delete row"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* MODE 2: CSV Textarea & File Upload */}
                {pilotImportMode === 'csv' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {/* Drag and Drop Box */}
                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        setIsDraggingCsv(true);
                      }}
                      onDragLeave={() => setIsDraggingCsv(false)}
                      onDrop={handleFileDrop}
                      onClick={() => fileInputRef.current?.click()}
                      style={{
                        border: '2px dashed',
                        borderColor: isDraggingCsv ? 'var(--primary)' : 'var(--slate-200)',
                        background: isDraggingCsv ? 'var(--primary-subtle, rgba(37,99,235,0.05))' : 'var(--slate-50)',
                        borderRadius: '8px',
                        padding: '16px',
                        textAlign: 'center',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <input
                        type="file"
                        ref={fileInputRef}
                        accept=".csv,text/csv,text/plain"
                        onChange={handleFileUpload}
                        style={{ display: 'none' }}
                      />
                      <UploadCloud size={24} style={{ color: 'var(--primary)', margin: '0 auto 6px' }} />
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--slate-800)' }}>
                        Click to browse or drag and drop a .csv file
                      </div>
                      <div style={{ fontSize: '11.5px', color: 'var(--slate-500)', marginTop: '2px' }}>
                        Supports UTF-8 CSV with district, ds_division, gn_number, gn_name headers
                      </div>
                    </div>

                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '12px', color: 'var(--slate-500)' }}>
                        <span>Or edit raw CSV text directly:</span>
                        <span>{pilotCsv.split('\n').filter(Boolean).length} lines</span>
                      </div>
                      <textarea
                        className="input-field"
                        rows={8}
                        value={pilotCsv}
                        onChange={(e) => {
                          const val = e.target.value;
                          setPilotCsv(val);
                          const parsed = parseCsvToGrid(val);
                          if (parsed.length > 0) setPilotGridRows(parsed);
                        }}
                        style={{ fontFamily: 'monospace', fontSize: '12px', lineHeight: '1.5' }}
                        placeholder="district,ds_division,gn_number,gn_name,secretary_name,secretary_contact,secretary_email,sdo_name,initial_teams,max_members_per_team"
                      />
                    </div>
                  </div>
                )}

                {/* Projected Hierarchy Summary Strip */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                    gap: '10px',
                    padding: '10px 14px',
                    background: 'var(--slate-50)',
                    border: '1px solid var(--slate-200)',
                    borderRadius: '8px',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--slate-500)', textTransform: 'uppercase', fontWeight: 600 }}>
                      Total GN Divisions
                    </div>
                    <div style={{ fontSize: '17px', fontWeight: 700, color: 'var(--slate-900)' }}>
                      {pilotGridRows.length}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--slate-500)', textTransform: 'uppercase', fontWeight: 600 }}>
                      Districts Covered
                    </div>
                    <div style={{ fontSize: '17px', fontWeight: 700, color: 'var(--primary)' }}>
                      {uniqueDistricts}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--slate-500)', textTransform: 'uppercase', fontWeight: 600 }}>
                      DS Divisions Covered
                    </div>
                    <div style={{ fontSize: '17px', fontWeight: 700, color: 'var(--slate-900)' }}>
                      {uniqueDs}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--slate-500)', textTransform: 'uppercase', fontWeight: 600 }}>
                      Field Teams Provisioned
                    </div>
                    <div style={{ fontSize: '17px', fontWeight: 700, color: 'var(--success-text, #16a34a)' }}>
                      {totalTeams}
                    </div>
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="modal-footer" style={{ padding: '12px 20px', borderTop: '1px solid var(--slate-200)' }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowPilotImport(false);
                    setModalError(null);
                    setPilotDryRunResult(null);
                  }}
                  className="btn-secondary"
                >
                  Close
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => handleImportPilotCsv(true)}
                    disabled={importing || pilotGridRows.length === 0}
                    className="btn-secondary"
                    title="Validate against database constraints without committing changes"
                  >
                    {importing ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle size={15} />}
                    <span>{t('areas.pilot_validate_dry_run')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleImportPilotCsv(false)}
                    disabled={importing || pilotGridRows.length === 0 || invalidCount > 0}
                    className="btn-primary"
                  >
                    {importing ? <Loader2 size={15} className="animate-spin" /> : <UploadCloud size={15} />}
                    <span>{t('areas.pilot_run_import')} ({pilotGridRows.length} Areas)</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Edit Field Team Modal */}
      {editingTeam && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-content" style={{ maxWidth: '420px' }}>
            <div className="modal-header">
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--slate-900)' }}>
                  {t('areas.edit_team')}
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

            <form onSubmit={handleSaveTeam}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {renderModalError()}
                <div>
                  <label className="form-label">{t('areas.team_number')} *</label>
                  <input
                    type="number"
                    min="1"
                    max="999"
                    className="input-field"
                    value={editTeamNo}
                    onChange={(e) => setEditTeamNo(parseInt(e.target.value) || 1)}
                    required
                  />
                </div>
                <div>
                  <label className="form-label">{t('areas.max_active_members')} *</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    className="input-field"
                    value={newTeamLimit}
                    onChange={(e) => setNewTeamLimit(parseInt(e.target.value) || 1)}
                    required
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" onClick={() => { setEditingTeam(null); setModalError(null); }} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="btn-primary">
                  {submitting ? <Loader2 size={16} className="animate-spin" /> : t('common.save_changes')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit DS Division Modal */}
      {editingDs && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-content" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--slate-900)' }}>
                  {t('areas.edit_ds')}
                </h3>
                <p style={{ fontSize: '12px', color: 'var(--slate-500)', margin: '2px 0 0 0' }}>
                  {editingDs.nameEn || editingDs.name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setEditingDs(null); setModalError(null); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate-400)', padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleUpdateDs}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {renderModalError()}
                <div>
                  <label className="form-label">{t('areas.name_en')} *</label>
                  <input
                    type="text"
                    className="input-field"
                    value={editDsNameEn}
                    onChange={(e) => setEditDsNameEn(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="form-label">{t('areas.name_si')}</label>
                  <input
                    type="text"
                    className="input-field"
                    value={editDsNameSi}
                    onChange={(e) => setEditDsNameSi(e.target.value)}
                  />
                </div>
                <div>
                  <label className="form-label">{t('areas.name_ta')}</label>
                  <input
                    type="text"
                    className="input-field"
                    value={editDsNameTa}
                    onChange={(e) => setEditDsNameTa(e.target.value)}
                  />
                </div>
                <div>
                  <label className="form-label">{t('areas.sdo_name')}</label>
                  <input
                    type="text"
                    className="input-field"
                    value={editDsSdoName}
                    onChange={(e) => setEditDsSdoName(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => { setEditingDs(null); setModalError(null); }} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="btn-primary">
                  {submitting ? <Loader2 size={16} className="animate-spin" /> : t('common.save_changes')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit GN Division Modal */}
      {editingGn && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-content" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--slate-900)' }}>
                  {t('areas.edit_gn')}
                </h3>
                <p style={{ fontSize: '12px', color: 'var(--slate-500)', margin: '2px 0 0 0' }}>
                  {editingGn.gnNumber || editingGn.code} — {editingGn.gnName || editingGn.nameEn || editingGn.name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setEditingGn(null); setModalError(null); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate-400)', padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleUpdateGn}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {renderModalError()}
                <div>
                  <label className="form-label">{t('areas.gn_number_code')} *</label>
                  <input
                    type="text"
                    className="input-field"
                    value={editGnNumber}
                    onChange={(e) => setEditGnNumber(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="form-label">{t('areas.gn_division_name')} *</label>
                  <input
                    type="text"
                    className="input-field"
                    value={editGnName}
                    onChange={(e) => setEditGnName(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="form-label">{t('areas.secretary_name')}</label>
                  <input
                    type="text"
                    className="input-field"
                    value={editGnSecName}
                    onChange={(e) => setEditGnSecName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="form-label">{t('areas.secretary_phone')}</label>
                  <input
                    type="text"
                    className="input-field"
                    value={editGnSecContact}
                    onChange={(e) => setEditGnSecContact(e.target.value)}
                  />
                </div>
                <div>
                  <label className="form-label">{t('areas.secretary_email')}</label>
                  <input
                    type="email"
                    className="input-field"
                    value={editGnSecEmail}
                    onChange={(e) => setEditGnSecEmail(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => { setEditingGn(null); setModalError(null); }} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="btn-primary">
                  {submitting ? <Loader2 size={16} className="animate-spin" /> : t('common.save_changes')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingTarget && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-content" style={{ maxWidth: '420px' }}>
            <div className="modal-header">
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--danger-text)' }}>
                  {deletingTarget.type === 'ds'
                    ? t('areas.delete_ds')
                    : deletingTarget.type === 'gn'
                      ? t('areas.delete_gn')
                      : t('areas.delete_team')}
                </h3>
                <p style={{ fontSize: '12px', color: 'var(--slate-500)', margin: '2px 0 0 0' }}>
                  {deletingTarget.label}
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setDeletingTarget(null); setModalError(null); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate-400)', padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {renderModalError()}
              <p style={{ fontSize: '13.5px', color: 'var(--slate-700)', margin: 0, lineHeight: 1.5 }}>
                Are you sure you want to permanently delete <strong>{deletingTarget.label}</strong>? Deletion is blocked if child divisions, teams, accounts, households, or survey records still reference it.
              </p>
            </div>
            <div className="modal-footer">
              <button type="button" onClick={() => { setDeletingTarget(null); setModalError(null); }} className="btn-secondary">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={submitting}
                className="btn-secondary"
                style={{
                  background: 'var(--danger-bg)',
                  borderColor: 'var(--danger-border)',
                  color: 'var(--danger-text)',
                  fontWeight: 600,
                }}
              >
                {submitting ? <Loader2 size={16} className="animate-spin" /> : t('common.delete')}
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
                  <label className="form-label">{t('areas.name_en')} *</label>
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
                  <label className="form-label">{t('areas.gn_number_code')} *</label>
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
                  <label className="form-label">{t('areas.gn_division_name')} *</label>
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
                    if (!g) return selectedGnId;
                    const label = g.gnName || g.nameEn || g.name;
                    if (g.gnNumber && label) return `${g.gnNumber} — ${label}`;
                    return label || g.gnNumber || selectedGnId;
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
                  <label className="form-label">{t('areas.team_number')} *</label>
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
                  <label className="form-label">{t('areas.max_active_members')} *</label>
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
                    {['super_admin', 'admin', 'sda', 'cdc_secretary'].map((r) => (
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
