'use client';

import React, { useState, useEffect } from 'react';
import { Shell } from '@/components/Shell';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { getAreaScopeLocks, loadScopedAreaLists } from '@/lib/area-scope';
import {
  PenTool,
  ShieldAlert,
  CheckCircle,
  AlertCircle,
  Loader2,
  Lock,
  Unlock,
  Home,
  User,
  Sparkles,
  Search,
  MapPin,
  HeartHandshake,
  Compass,
  FileCheck,
  FileText,
  Save,
  UploadCloud,
  Trash2,
  Edit3,
  X,
} from 'lucide-react';

interface WebDraft {
  id: string;
  savedAt: string;
  selectedDistrict: string;
  selectedDs: string;
  selectedGn: string;
  householdMode: 'new' | 'existing';
  selectedHouseholdId: string;
  houseNo: string;
  headName: string;
  address: string;
  villageName: string;
  isEpf: boolean;
  isEtf: boolean;
  isAswesuma: boolean;
  isSamurdhi: boolean;
  isNonBeneficiary: boolean;
  hasSpecialNeeds: boolean;
  clientName: string;
  clientAge: number;
  clientGender: 'M' | 'F';
  clientPhone: string;
  clientWhatsapp: string;
  highestEducation: string;
  highestVocational: string;
  interestedStream: string;
  interestedJob: string;
  futureHopes: string[];
  infoProvidedBy: 'self' | 'mother' | 'father' | 'sister' | 'other';
  infoProvidedByOther: string;
  consentGiven: boolean;
  consentVersion: string;
  syncStatus?: 'idle' | 'syncing' | 'failed' | 'success';
  syncError?: string;
}

export default function DataEntryPage() {
  const { t, language } = useLanguage();
  const { user, isLoading: authLoading } = useAuth();
  const areaLocks = getAreaScopeLocks(user?.role);

  const [loadingConfig, setLoadingConfig] = useState(true);
  const [webEntryEnabled, setWebEntryEnabled] = useState(false);
  const [togglingConfig, setTogglingConfig] = useState(false);
  const [appConfig, setAppConfig] = useState<any>(null);

  // Lookups state from /v1/lookups
  const [lookups, setLookups] = useState<{
    education: any[];
    vocational_qualification: any[];
    vocational_stream: any[];
    job: any[];
  }>({
    education: [],
    vocational_qualification: [],
    vocational_stream: [],
    job: [],
  });

  // Geographic dropdowns
  const [districts, setDistricts] = useState<any[]>([]);
  const [dsDivisions, setDsDivisions] = useState<any[]>([]);
  const [gnDivisions, setGnDivisions] = useState<any[]>([]);
  const [selectedDistrict, setSelectedDistrict] = useState<string>('');
  const [selectedDs, setSelectedDs] = useState<string>('');
  const [selectedGn, setSelectedGn] = useState<string>('');

  // Household fields (DD/S/001) & attach mode
  const [householdMode, setHouseholdMode] = useState<'new' | 'existing'>('new');
  const [existingHouseholds, setExistingHouseholds] = useState<any[]>([]);
  const [selectedHouseholdId, setSelectedHouseholdId] = useState<string>('');
  const [houseSearch, setHouseSearch] = useState<string>('');
  const [houseCursor, setHouseCursor] = useState<string | null>(null);
  const [loadingHouses, setLoadingHouses] = useState(false);
  const [hasMoreHouses, setHasMoreHouses] = useState(false);

  const canCreateHousehold = user?.role !== 'admin';

  useEffect(() => {
    if (user?.role === 'admin') {
      setHouseholdMode('existing');
    }
  }, [user?.role]);

  const [houseNo, setHouseNo] = useState('');
  const [headName, setHeadName] = useState('');
  const [address, setAddress] = useState('');
  const [villageName, setVillageName] = useState('');
  const [isEpf, setIsEpf] = useState(false);
  const [isEtf, setIsEtf] = useState(false);
  const [isAswesuma, setIsAswesuma] = useState(false);
  const [isSamurdhi, setIsSamurdhi] = useState(false);
  const [isNonBeneficiary, setIsNonBeneficiary] = useState(false);
  const [hasSpecialNeeds, setHasSpecialNeeds] = useState(false);

  // Client fields (DD/S/002)
  const [clientName, setClientName] = useState('');
  const [clientAge, setClientAge] = useState<number>(25);
  const [clientGender, setClientGender] = useState<'M' | 'F'>('M');
  const [clientPhone, setClientPhone] = useState('');
  const [clientWhatsapp, setClientWhatsapp] = useState('');
  const [highestEducation, setHighestEducation] = useState('EDU_OL_PASSED');
  const [highestVocational, setHighestVocational] = useState('VOC_NONE');
  const [interestedStream, setInterestedStream] = useState('STREAM_IT_COMPUTING');
  const [interestedJob, setInterestedJob] = useState('JOB_SOFTWARE_DEV');
  const [futureHopes, setFutureHopes] = useState<string[]>([]);
  const [infoProvidedBy, setInfoProvidedBy] = useState<'self' | 'mother' | 'father' | 'sister' | 'other'>('self');
  const [infoProvidedByOther, setInfoProvidedByOther] = useState('');
  const [consentGiven, setConsentGiven] = useState(false);
  const [consentVersion, setConsentVersion] = useState('consent.v0');

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  // Local drafts state
  const [drafts, setDrafts] = useState<WebDraft[]>([]);
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [showDraftsModal, setShowDraftsModal] = useState(false);
  const [syncingDrafts, setSyncingDrafts] = useState(false);
  const [syncDraftsResult, setSyncDraftsResult] = useState<{ success: number; failed: number } | null>(null);

  const draftsStorageKey = user?.id
    ? `grs_web_data_entry_drafts_${user.id}`
    : 'grs_web_data_entry_drafts';

  useEffect(() => {
    try {
      const stored = localStorage.getItem(draftsStorageKey);
      if (stored) {
        setDrafts(JSON.parse(stored));
      } else {
        // Fallback: check legacy global key if user has drafts saved under old key
        const legacy = localStorage.getItem('grs_web_data_entry_drafts');
        if (legacy && user?.id) {
          setDrafts(JSON.parse(legacy));
          localStorage.setItem(draftsStorageKey, legacy);
          localStorage.removeItem('grs_web_data_entry_drafts');
        } else {
          setDrafts([]);
        }
      }
    } catch (e) {
      console.error('Failed to read drafts from localStorage', e);
    }
  }, [draftsStorageKey, user?.id]);

  useEffect(() => {
    if (authLoading || !user) return;
    checkConfig();
    loadLookups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user?.id, user?.role]);

  useEffect(() => {
    if (authLoading || !user) return;
    loadDistricts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user?.id, user?.role, user?.districtId, user?.dsId, user?.gnId]);

  const getLookupLabel = (item: any) => {
    if (!item) return '';
    if (language === 'si') return item.labelSi || item.labelEn;
    if (language === 'ta') return item.labelTa || item.labelEn;
    return item.labelEn;
  };

  async function loadLookups() {
    try {
      const res = await api.getLookups();
      if (res?.categories) {
        setLookups({
          education: res.categories.education || [],
          vocational_qualification: res.categories.vocational_qualification || [],
          vocational_stream: res.categories.vocational_stream || [],
          job: res.categories.job || [],
        });
        if (res.categories.education?.length) {
          const defaultEdu = res.categories.education.find((e: any) => e.code === 'EDU_OL_PASSED') || res.categories.education[0];
          setHighestEducation(defaultEdu.code);
        }
        if (res.categories.vocational_qualification?.length) {
          const defaultVoc = res.categories.vocational_qualification.find((v: any) => v.code === 'VOC_NONE') || res.categories.vocational_qualification[0];
          setHighestVocational(defaultVoc.code);
        }
        if (res.categories.vocational_stream?.length) {
          const defaultStream = res.categories.vocational_stream.find((s: any) => s.code === 'STREAM_IT_COMPUTING') || res.categories.vocational_stream[0];
          setInterestedStream(defaultStream.code);
        }
        if (res.categories.job?.length) {
          setInterestedJob(res.categories.job[0].code);
        }
      }
    } catch (err: any) {
      console.error('Failed to load lookups:', err);
    }
  }

  async function checkConfig() {
    setLoadingConfig(true);
    try {
      const cfg = await api.getConfig();
      setAppConfig(cfg);
      const allowedRoles: string[] = cfg?.webEntryRoles || cfg?.web_entry_roles || ['cdc_secretary', 'sda', 'admin'];
      const userAllowed = user?.role ? allowedRoles.includes(user.role) : false;
      setWebEntryEnabled(userAllowed);
      if (cfg?.consentVersion || cfg?.consent_version) {
        setConsentVersion(cfg.consentVersion || cfg.consent_version);
      }
    } catch (err: any) {
      console.error('Config fetch failed:', err);
    } finally {
      setLoadingConfig(false);
    }
  }

  async function loadHouseholdsForGn(gnId: string, reset = true, search = houseSearch) {
    if (!gnId) {
      setExistingHouseholds([]);
      return;
    }
    setLoadingHouses(true);
    try {
      const res = await api.getHouseholds({
        gnId,
        search: search.trim() || undefined,
        limit: 30,
        cursor: reset ? undefined : (houseCursor || undefined),
      });
      const list = Array.isArray(res) ? res : res?.households || res?.items || [];
      setExistingHouseholds((prev) => (reset ? list : [...prev, ...list]));
      setHouseCursor(res?.nextCursor || null);
      setHasMoreHouses(Boolean(res?.nextCursor));
    } catch (err) {
      console.error('Failed to load households for GN:', err);
    } finally {
      setLoadingHouses(false);
    }
  }

  function handleSelectExistingHousehold(hId: string) {
    setSelectedHouseholdId(hId);
    const found = existingHouseholds.find((h) => h.id === hId);
    if (found) {
      setHouseNo(found.houseNo || '');
      setHeadName(found.houseLeaderName || '');
      setAddress(found.address || '');
      setVillageName(found.villageName || '');
      setIsEpf(Boolean(found.isEpf));
      setIsEtf(Boolean(found.isEtf));
      setIsAswesuma(Boolean(found.isAswesuma));
      setIsSamurdhi(Boolean(found.isSamurdhi));
      setIsNonBeneficiary(Boolean(found.isNonBeneficiary));
      setHasSpecialNeeds(Boolean(found.hasSpecialNeeds));
    }
  }

  async function loadDistricts() {
    if (authLoading || !user) return;
    try {
      const res = await loadScopedAreaLists(api, user, { autoSelectFirst: true });
      setDistricts(res.districts);
      setDsDivisions(res.dsDivisions);
      setGnDivisions(res.gnDivisions);
      setSelectedDistrict(res.selectedDistrict);
      setSelectedDs(res.selectedDs);
      setSelectedGn(res.selectedGn);
      if (res.selectedGn) {
        loadHouseholdsForGn(res.selectedGn);
      }
    } catch (err: any) {
      console.error(err);
    }
  }

  async function handleDistrictChange(distId: string) {
    setSelectedDistrict(distId);
    setSelectedHouseholdId('');
    try {
      const dsList = await api.getDsDivisions(distId);
      setDsDivisions(dsList);
      if (dsList.length > 0) {
        setSelectedDs(dsList[0].id);
        const gnList = await api.getGnDivisions(dsList[0].id);
        setGnDivisions(gnList);
        if (gnList.length > 0) {
          setSelectedGn(gnList[0].id);
          loadHouseholdsForGn(gnList[0].id);
        }
      } else {
        setSelectedDs('');
        setGnDivisions([]);
        setSelectedGn('');
        setExistingHouseholds([]);
      }
    } catch (err: any) {
      console.error(err);
    }
  }

  async function handleDsChange(dsId: string) {
    setSelectedDs(dsId);
    setSelectedHouseholdId('');
    try {
      const gnList = await api.getGnDivisions(dsId);
      setGnDivisions(gnList);
      if (gnList.length > 0) {
        setSelectedGn(gnList[0].id);
        loadHouseholdsForGn(gnList[0].id);
      } else {
        setSelectedGn('');
        setExistingHouseholds([]);
      }
    } catch (err: any) {
      console.error(err);
    }
  }

  async function handleGnChange(gnId: string) {
    setSelectedGn(gnId);
    setSelectedHouseholdId('');
    if (gnId) {
      loadHouseholdsForGn(gnId);
    } else {
      setExistingHouseholds([]);
    }
  }

  async function toggleWebEntryRole() {
    setTogglingConfig(true);
    try {
      const newStatus = !webEntryEnabled;
      const currentRoles: string[] = appConfig?.webEntryRoles || appConfig?.web_entry_roles || ['cdc_secretary', 'sda', 'admin'];
      const updatedRoles = newStatus
        ? Array.from(new Set([...currentRoles, 'super_admin']))
        : currentRoles.filter((r) => r !== 'super_admin');

      await api.updateConfig({
        web_data_entry_enabled: newStatus,
        web_entry_roles: updatedRoles,
      });
      setWebEntryEnabled(newStatus);
      setAppConfig((prev: any) => ({
        ...prev,
        web_data_entry_enabled: newStatus,
        web_entry_roles: updatedRoles,
      }));
    } catch (err: any) {
      setSubmitError(`Failed to update config: ${err.message}`);
    } finally {
      setTogglingConfig(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(null);

    if (!canCreateHousehold && !selectedHouseholdId) {
      setSubmitError('Admin role can only enter data by attaching to an existing household. Please select an existing household.');
      return;
    }
    if (householdMode === 'existing' && !selectedHouseholdId) {
      setSubmitError('Please select an existing household to attach this survey entry.');
      return;
    }
    if (!selectedGn) {
      setSubmitError(t('entry.error.select_gn'));
      return;
    }
    if (!houseNo.trim()) {
      setSubmitError(t('entry.error.house_no_required'));
      return;
    }
    if (!headName.trim()) {
      setSubmitError(t('entry.error.head_name_required'));
      return;
    }
    if (!clientName.trim()) {
      setSubmitError(t('entry.error.client_name_required'));
      return;
    }
    if (!consentGiven) {
      setSubmitError(t('entry.error.consent_required'));
      return;
    }

    setSubmitting(true);
    try {
      let householdId = selectedHouseholdId;
      let isAttachedToExisting = Boolean(householdId);

      // 1. Resolve or Create household
      if (!householdId) {
        if (!canCreateHousehold) {
          setSubmitError('Admin role can only enter data by attaching to an existing household. Please select an existing household.');
          setSubmitting(false);
          return;
        }
        try {
          const houseRes = await api.createHousehold({
            gnId: selectedGn,
            houseNo: houseNo.trim(),
            houseLeaderName: headName.trim(),
            address: address.trim() || undefined,
            villageName: villageName.trim() || undefined,
            isEpf,
            isEtf,
            isAswesuma,
            isSamurdhi,
            isNonBeneficiary,
            hasSpecialNeeds,
          });
          householdId = houseRes.id;
        } catch (err: any) {
          // If household already exists, attach to it instead of failing with duplicate error
          if (
            err.message?.includes('already exists') ||
            err.message?.includes('DUPLICATE_HOUSE_NUMBER')
          ) {
            const listRes = await api.getHouseholds({
              gnId: selectedGn,
              search: houseNo.trim(),
              limit: 50,
            });
            const list = Array.isArray(listRes) ? listRes : listRes?.households || [];
            const existing = list.find(
              (h: any) =>
                h.houseNo?.trim().toLowerCase() === houseNo.trim().toLowerCase() ||
                h.houseNoNorm === houseNo.trim().toUpperCase()
            );
            if (existing) {
              householdId = existing.id;
              isAttachedToExisting = true;
            } else {
              throw err;
            }
          } else {
            throw err;
          }
        }
      }

      // 2. Create client record attached to household
      await api.createClient({
        householdId,
        name: clientName.trim(),
        age: clientAge,
        gender: clientGender,
        address: address.trim() || undefined,
        phoneRaw: clientPhone.trim() || undefined,
        whatsappRaw: clientWhatsapp.trim() || undefined,
        highestEducation,
        highestVocational,
        interestedVocationalStream: interestedStream,
        interestedJob,
        isEpf,
        isEtf,
        isAswesuma,
        isSamurdhi,
        hasSpecialNeeds,
        futureHopes,
        infoProvidedBy,
        infoProvidedByOther: infoProvidedBy === 'other' ? (infoProvidedByOther.trim() || undefined) : undefined,
        consentGiven: true,
        consentVersion,
      });

      // Refresh existing households for the GN
      loadHouseholdsForGn(selectedGn);

      // Switch form to existing household mode so next person in this house attaches directly
      if (householdId) {
        setSelectedHouseholdId(householdId);
        setHouseholdMode('existing');
      }

      setSubmitSuccess(
        isAttachedToExisting
          ? `Successfully recorded survey for "${clientName}" attached to existing household #${houseNo} (${headName}).`
          : `Successfully registered household #${houseNo} and survey record for "${clientName}".`
      );

      // Reset individual form fields (keep household selected/filled so next person in same house can be added easily!)
      setClientName('');
      setClientPhone('');
      setClientWhatsapp('');
      setFutureHopes([]);
      setInfoProvidedBy('self');
      setInfoProvidedByOther('');
      setConsentGiven(false);

      if (editingDraftId) {
        const remaining = drafts.filter((d) => d.id !== editingDraftId);
        saveDraftsToStorage(remaining);
        setEditingDraftId(null);
      }
    } catch (err: any) {
      setSubmitError(err.messageKey ? t(err.messageKey) : (err.message || t('entry.error.submit_failed')));
    } finally {
      setSubmitting(false);
    }
  }

  const saveDraftsToStorage = (updatedDrafts: WebDraft[]) => {
    setDrafts(updatedDrafts);
    try {
      localStorage.setItem(draftsStorageKey, JSON.stringify(updatedDrafts));
    } catch (e) {
      console.error('Failed to write drafts to localStorage', e);
    }
  };

  const handleSaveDraft = () => {
    if (!selectedGn) {
      setSubmitError('Please select District, DS, and GN Division before saving a draft.');
      return;
    }
    const draftId = editingDraftId || `draft_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const newDraft: WebDraft = {
      id: draftId,
      savedAt: new Date().toISOString(),
      selectedDistrict,
      selectedDs,
      selectedGn,
      householdMode,
      selectedHouseholdId,
      houseNo,
      headName,
      address,
      villageName,
      isEpf,
      isEtf,
      isAswesuma,
      isSamurdhi,
      isNonBeneficiary,
      hasSpecialNeeds,
      clientName,
      clientAge,
      clientGender,
      clientPhone,
      clientWhatsapp,
      highestEducation,
      highestVocational,
      interestedStream,
      interestedJob,
      futureHopes,
      infoProvidedBy,
      infoProvidedByOther,
      consentGiven,
      consentVersion,
    };

    let nextDrafts: WebDraft[];
    if (editingDraftId) {
      nextDrafts = drafts.map((d) => (d.id === editingDraftId ? newDraft : d));
    } else {
      nextDrafts = [newDraft, ...drafts];
      setEditingDraftId(draftId);
    }
    saveDraftsToStorage(nextDrafts);
    setSubmitSuccess(`Draft saved locally for "${clientName || 'Beneficiary'}" (House #${houseNo || 'N/A'}).`);
    setSubmitError(null);
  };

  const handleLoadDraft = async (draft: WebDraft) => {
    setEditingDraftId(draft.id);

    // 1. Sequentially cascade geographic levels so options populate before setting values
    if (draft.selectedDistrict) {
      setSelectedDistrict(draft.selectedDistrict);
      try {
        const dsList = await api.getDsDivisions(draft.selectedDistrict);
        setDsDivisions(dsList);
        if (draft.selectedDs) {
          setSelectedDs(draft.selectedDs);
          const gnList = await api.getGnDivisions(draft.selectedDs);
          setGnDivisions(gnList);
          if (draft.selectedGn) {
            setSelectedGn(draft.selectedGn);
            try {
              const res = await api.getHouseholds({
                gnId: draft.selectedGn,
                limit: 50,
              });
              const list: any[] = Array.isArray(res) ? res : res?.households || res?.items || [];
              if (draft.householdMode === 'existing' && draft.selectedHouseholdId) {
                const found = list.find((h: any) => h.id === draft.selectedHouseholdId);
                if (!found && draft.houseNo) {
                  list.unshift({
                    id: draft.selectedHouseholdId,
                    houseNo: draft.houseNo,
                    houseLeaderName: draft.headName,
                    villageName: draft.villageName,
                    address: draft.address,
                    isEpf: draft.isEpf,
                    isEtf: draft.isEtf,
                    isAswesuma: draft.isAswesuma,
                    isSamurdhi: draft.isSamurdhi,
                    isNonBeneficiary: draft.isNonBeneficiary,
                    hasSpecialNeeds: draft.hasSpecialNeeds,
                  });
                }
              }
              setExistingHouseholds(list);
              if (draft.householdMode === 'existing') {
                setSelectedHouseholdId(draft.selectedHouseholdId || '');
              }
            } catch (hErr) {
              console.error('Failed to load households for draft:', hErr);
            }
          }
        }
      } catch (err) {
        console.error('Failed to cascade geographic divisions for draft:', err);
      }
    }

    setHouseholdMode(draft.householdMode || 'new');
    if (draft.householdMode !== 'existing') {
      setSelectedHouseholdId('');
    }
    setHouseNo(draft.houseNo || '');
    setHeadName(draft.headName || '');
    setAddress(draft.address || '');
    setVillageName(draft.villageName || '');
    setIsEpf(Boolean(draft.isEpf));
    setIsEtf(Boolean(draft.isEtf));
    setIsAswesuma(Boolean(draft.isAswesuma));
    setIsSamurdhi(Boolean(draft.isSamurdhi));
    setIsNonBeneficiary(Boolean(draft.isNonBeneficiary));
    setHasSpecialNeeds(Boolean(draft.hasSpecialNeeds));

    setClientName(draft.clientName || '');
    setClientAge(draft.clientAge || 25);
    setClientGender(draft.clientGender || 'M');
    setClientPhone(draft.clientPhone || '');
    setClientWhatsapp(draft.clientWhatsapp || '');
    setHighestEducation(draft.highestEducation || 'EDU_OL_PASSED');
    setHighestVocational(draft.highestVocational || 'VOC_NONE');
    setInterestedStream(draft.interestedStream || 'STREAM_IT_COMPUTING');
    setInterestedJob(draft.interestedJob || 'JOB_SOFTWARE_DEV');
    setFutureHopes(draft.futureHopes || []);
    setInfoProvidedBy(draft.infoProvidedBy || 'self');
    setInfoProvidedByOther(draft.infoProvidedByOther || '');
    setConsentGiven(Boolean(draft.consentGiven));

    setShowDraftsModal(false);
    setSubmitSuccess(`Loaded draft for "${draft.clientName || 'Beneficiary'}" into form.`);
    setSubmitError(null);
  };

  const handleCancelEdit = () => {
    setEditingDraftId(null);
    setClientName('');
    setClientAge(25);
    setClientGender('M');
    setClientPhone('');
    setClientWhatsapp('');
    setFutureHopes([]);
    setInfoProvidedBy('self');
    setInfoProvidedByOther('');
    setConsentGiven(false);
    if (householdMode === 'new') {
      setHouseNo('');
      setHeadName('');
      setAddress('');
      setVillageName('');
      setIsEpf(false);
      setIsEtf(false);
      setIsAswesuma(false);
      setIsSamurdhi(false);
      setIsNonBeneficiary(false);
      setHasSpecialNeeds(false);
    }
    setSubmitSuccess('Editing cancelled. Form cleared.');
  };

  const handleDeleteDraft = (draftId: string) => {
    const updated = drafts.filter((d) => d.id !== draftId);
    saveDraftsToStorage(updated);
    if (editingDraftId === draftId) {
      setEditingDraftId(null);
    }
  };

  const syncSingleDraft = async (draft: WebDraft): Promise<{ success: boolean; error?: string }> => {
    try {
      if (!draft.consentGiven) {
        return {
          success: false,
          error: t('entry.error.consent_required') || 'Consent is required to submit this record.',
        };
      }
      let householdId = draft.selectedHouseholdId;
      if (!householdId) {
        if (user?.role === 'admin') {
          throw new Error('Admin role can only attach records to existing households.');
        }
        try {
          const houseRes = await api.createHousehold({
            gnId: draft.selectedGn,
            houseNo: draft.houseNo.trim(),
            houseLeaderName: draft.headName.trim(),
            address: draft.address.trim() || undefined,
            villageName: draft.villageName.trim() || undefined,
            isEpf: draft.isEpf,
            isEtf: draft.isEtf,
            isAswesuma: draft.isAswesuma,
            isSamurdhi: draft.isSamurdhi,
            isNonBeneficiary: draft.isNonBeneficiary,
            hasSpecialNeeds: draft.hasSpecialNeeds,
          });
          householdId = houseRes.id;
        } catch (err: any) {
          if (
            err.message?.includes('already exists') ||
            err.message?.includes('DUPLICATE_HOUSE_NUMBER')
          ) {
            const listRes = await api.getHouseholds({
              gnId: draft.selectedGn,
              search: draft.houseNo.trim(),
              limit: 50,
            });
            const list = Array.isArray(listRes) ? listRes : listRes?.households || [];
            const existing = list.find(
              (h: any) =>
                h.houseNo?.trim().toLowerCase() === draft.houseNo.trim().toLowerCase() ||
                h.houseNoNorm === draft.houseNo.trim().toUpperCase()
            );
            if (existing) {
              householdId = existing.id;
            } else {
              throw err;
            }
          } else {
            throw err;
          }
        }
      }

      await api.createClient({
        householdId,
        name: draft.clientName.trim(),
        age: draft.clientAge,
        gender: draft.clientGender,
        address: draft.address.trim() || undefined,
        phoneRaw: draft.clientPhone.trim() || undefined,
        whatsappRaw: draft.clientWhatsapp.trim() || undefined,
        highestEducation: draft.highestEducation,
        highestVocational: draft.highestVocational,
        interestedVocationalStream: draft.interestedStream,
        interestedJob: draft.interestedJob,
        isEpf: draft.isEpf,
        isEtf: draft.isEtf,
        isAswesuma: draft.isAswesuma,
        isSamurdhi: draft.isSamurdhi,
        hasSpecialNeeds: draft.hasSpecialNeeds,
        futureHopes: draft.futureHopes,
        infoProvidedBy: draft.infoProvidedBy,
        infoProvidedByOther: draft.infoProvidedBy === 'other' ? (draft.infoProvidedByOther.trim() || undefined) : undefined,
        consentGiven: draft.consentGiven,
        consentVersion: draft.consentVersion || 'consent.v0',
      });

      return { success: true };
    } catch (err: any) {
      return {
        success: false,
        error: err.messageKey ? t(err.messageKey) : (err.message || 'Failed to sync draft'),
      };
    }
  };

  const handleSyncSingle = async (draft: WebDraft) => {
    setSyncingDrafts(true);
    const res = await syncSingleDraft(draft);
    setSyncingDrafts(false);

    if (res.success) {
      const updated = drafts.filter((d) => d.id !== draft.id);
      saveDraftsToStorage(updated);
      setSubmitSuccess(`Draft "${draft.clientName}" synced to server successfully.`);
      if (selectedGn) loadHouseholdsForGn(selectedGn);
    } else {
      const updated = drafts.map((d) => (d.id === draft.id ? { ...d, syncStatus: 'failed' as const, syncError: res.error } : d));
      saveDraftsToStorage(updated);
      setSubmitError(`Failed to sync draft "${draft.clientName}": ${res.error}`);
    }
  };

  const handleSyncAllDrafts = async () => {
    if (drafts.length === 0 || syncingDrafts) return;
    setSyncingDrafts(true);
    setSyncDraftsResult(null);

    const remainingDrafts: WebDraft[] = [];
    let successCount = 0;
    let failCount = 0;

    for (const draft of drafts) {
      const res = await syncSingleDraft(draft);
      if (res.success) {
        successCount++;
      } else {
        failCount++;
        remainingDrafts.push({ ...draft, syncStatus: 'failed', syncError: res.error });
      }
    }

    saveDraftsToStorage(remainingDrafts);
    setSyncingDrafts(false);
    setSyncDraftsResult({ success: successCount, failed: failCount });

    if (selectedGn) {
      loadHouseholdsForGn(selectedGn);
    }

    if (successCount > 0 && failCount === 0) {
      setSubmitSuccess(`All ${successCount} draft record(s) synced to server successfully.`);
      setShowDraftsModal(false);
    } else if (successCount > 0 && failCount > 0) {
      setSubmitSuccess(`Synced ${successCount} draft record(s). ${failCount} draft(s) failed.`);
    } else if (failCount > 0) {
      setSubmitError(`${failCount} draft record(s) failed to sync. Review errors in Drafts modal.`);
    }
  };

  return (
    <Shell activePath="/data-entry">
      <div className="de-page">
        {/* Page Header */}
        <div className="panel de-header-card">
          <div className="de-header-main">
            <div className="de-icon-badge de-icon-badge-lg">
              <PenTool size={22} />
            </div>
            <div>
              <div className="de-eyebrow-row">
                <span className="de-eyebrow-pill">Administrative Field Entry</span>
                <span className="de-dot">•</span>
                <span className="de-code-label">DD/S/001 &amp; DD/S/002</span>
              </div>
              <h1 className="de-page-title">{t('entry.title')}</h1>
              <p className="de-page-subtitle">
                Manual paper census entry fallback for official enumerator forms DD/S/001 (Household) and DD/S/002 (Individual).
              </p>
            </div>
          </div>

          <div className="de-header-actions" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setShowDraftsModal(true)}
              className="btn-secondary"
              style={{ fontSize: '12.5px', padding: '0.5rem 0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}
              title="View and manage locally drafted survey records"
            >
              <FileText size={15} />
              <span>Drafts ({drafts.length})</span>
            </button>
            {drafts.length > 0 && (
              <button
                type="button"
                onClick={handleSyncAllDrafts}
                disabled={syncingDrafts}
                className="btn-primary"
                style={{ fontSize: '12.5px', padding: '0.5rem 0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                title="Sync all drafted records to the server"
              >
                {syncingDrafts ? <Loader2 size={15} className="animate-spin" /> : <UploadCloud size={15} />}
                <span>Sync Drafts ({drafts.length})</span>
              </button>
            )}
            {user?.role === 'super_admin' && (
              <button
                type="button"
                onClick={toggleWebEntryRole}
                disabled={togglingConfig}
                className={webEntryEnabled ? 'de-btn-c19-lock' : 'btn-primary'}
                style={{ fontSize: '12.5px', padding: '0.5rem 0.9rem' }}
              >
                {togglingConfig ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : webEntryEnabled ? (
                  <>
                    <Lock size={14} />
                    <span>Enforce C19 Gate (Disable Web Entry)</span>
                  </>
                ) : (
                  <>
                    <Unlock size={14} />
                    <span>Override Decision C19 (Enable Entry)</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Loading authorization state */}
        {loadingConfig && (
          <div className="panel de-loading-card">
            <Loader2 size={24} className="animate-spin" style={{ color: 'var(--primary)' }} />
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--slate-700)' }}>
              Verifying role authorization &amp; census protocol...
            </div>
            <div style={{ fontSize: '12px', color: 'var(--slate-400)' }}>
              Querying platform policy configuration
            </div>
          </div>
        )}

        {/* Decision C19 Policy Gate Advisory Card (when disabled) */}
        {!loadingConfig && !webEntryEnabled && (
          <div className="de-c19-card">
            <div className="de-c19-row">
              <div className="de-c19-icon">
                <ShieldAlert size={22} />
              </div>
              <div className="de-c19-body">
                <div className="de-c19-title-row">
                  <h2 className="de-c19-title">Decision C19: Web Direct Data Entry Restricted</h2>
                  <span className="badge badge-warning">Policy Protected</span>
                </div>
                <p className="de-c19-lead">{t('entry.web_roles_off')}</p>
                <p className="de-c19-desc">
                  To protect field census data integrity and avoid bypassing territorial assignment locks, central Level 00 administrators are restricted from entering survey records directly via web dashboard by default. Primary enumeration is mandated to originate from assigned field tablets with cryptographic timestamping.
                </p>
                {user?.role === 'super_admin' && (
                  <div style={{ paddingTop: '0.375rem' }}>
                    <button
                      type="button"
                      onClick={toggleWebEntryRole}
                      disabled={togglingConfig}
                      className="btn-primary"
                      style={{ fontSize: '12.5px' }}
                    >
                      {togglingConfig ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Unlock size={14} />
                      )}
                      <span>Grant Super Admin Override (Enable Web Entry)</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Direct Data Entry Form (Active when enabled) */}
        {!loadingConfig && webEntryEnabled && (
          <form onSubmit={handleSubmit} className="de-form-stack">
            {/* Status alerts */}
            {submitError && (
              <div className="de-alert de-alert-danger">
                <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px', color: 'var(--danger)' }} />
                <div style={{ flex: 1 }}>
                  <strong style={{ display: 'block', fontWeight: 600, marginBottom: '2px' }}>
                    Submission Failed
                  </strong>
                  <span>{submitError}</span>
                </div>
              </div>
            )}

            {submitSuccess && (
              <div className="de-alert de-alert-success">
                <CheckCircle size={18} style={{ flexShrink: 0, marginTop: '2px', color: 'var(--success)' }} />
                <div style={{ flex: 1 }}>
                  <strong style={{ display: 'block', fontWeight: 600, marginBottom: '2px' }}>
                    Record Logged Successfully
                  </strong>
                  <span>{submitSuccess}</span>
                </div>
              </div>
            )}

            {editingDraftId && (
              <div
                className="de-alert"
                style={{
                  background: 'rgba(59, 130, 246, 0.08)',
                  border: '1px solid rgba(59, 130, 246, 0.3)',
                  color: 'var(--text)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  borderRadius: '8px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <FileText size={18} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                  <div>
                    <strong>Editing Saved Draft:</strong> Making changes to draft #{editingDraftId}. Submitting or saving will update this draft.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="btn-secondary"
                  style={{ whiteSpace: 'nowrap', marginLeft: '12px', padding: '6px 12px', fontSize: '12px' }}
                >
                  Cancel Editing Draft
                </button>
              </div>
            )}

            {/* Section 1: Household Information (DD/S/001) */}
            <div className="panel" style={{ overflow: 'hidden' }}>
              <div className="de-section-header de-section-header-between">
                <div className="de-section-title-group">
                  <div className="de-icon-badge">
                    <Home size={18} />
                  </div>
                  <div>
                    <h2 className="de-section-title">Section 1: Household Roster (DD/S/001)</h2>
                    <p className="de-section-subtitle">
                      Physical dwelling unit, geographic hierarchy, and welfare indicators
                    </p>
                  </div>
                </div>

                {/* Mode Switcher */}
                <div className="de-segmented">
                  {canCreateHousehold && (
                    <button
                      type="button"
                      onClick={() => {
                        setHouseholdMode('new');
                        setSelectedHouseholdId('');
                        setHouseNo('');
                        setHeadName('');
                        setAddress('');
                        setVillageName('');
                        setIsEpf(false);
                        setIsEtf(false);
                        setIsAswesuma(false);
                        setIsSamurdhi(false);
                        setIsNonBeneficiary(false);
                        setHasSpecialNeeds(false);
                      }}
                      className={`de-seg-btn ${householdMode === 'new' ? 'is-active' : ''}`}
                    >
                      + Register New Household
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setHouseholdMode('existing')}
                    className={`de-seg-btn ${householdMode === 'existing' ? 'is-active' : ''}`}
                  >
                    Attach to Existing House ({existingHouseholds.length})
                  </button>
                </div>
              </div>

              <div className="de-section-body">
                {/* Existing Household Selector Bar */}
                {householdMode === 'existing' && (
                  <div className="de-existing-box">
                    <div className="de-existing-top">
                      <div>
                        <label className="form-label" style={{ marginBottom: '2px', color: 'var(--slate-800)' }}>
                          Select Existing Household to Attach Survey Entry *
                        </label>
                        <p style={{ fontSize: '12px', color: 'var(--slate-500)', margin: 0 }}>
                          Adding multiple members to the same household unit under form DD/S/002
                        </p>
                      </div>
                      <div className="de-search-wrap">
                        <Search size={14} className="de-search-icon" />
                        <input
                          type="text"
                          placeholder="Filter house # or name..."
                          value={houseSearch}
                          onChange={(e) => {
                            setHouseSearch(e.target.value);
                            if (selectedGn) loadHouseholdsForGn(selectedGn, true, e.target.value);
                          }}
                          className="input-field"
                          style={{ paddingLeft: '32px', fontSize: '13px' }}
                        />
                      </div>
                    </div>

                    {existingHouseholds.length === 0 ? (
                      <div className="de-empty-box">
                        {loadingHouses
                          ? 'Searching households in division...'
                          : 'No registered households found in this GN division. Register a new household or adjust search query.'}
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <select
                          className="select-field"
                          style={{ fontWeight: 500 }}
                          value={selectedHouseholdId}
                          onChange={(e) => handleSelectExistingHousehold(e.target.value)}
                          required
                        >
                          <option value="">
                            -- Choose Household in {gnDivisions.find((g) => g.id === selectedGn)?.nameEn || 'selected GN'} --
                          </option>
                          {existingHouseholds.map((h) => (
                            <option key={h.id} value={h.id}>
                              House #{h.houseNo} — {h.houseLeaderName} {h.villageName ? `(${h.villageName})` : ''}
                            </option>
                          ))}
                        </select>
                        {hasMoreHouses && (
                          <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '4px' }}>
                            <button
                              type="button"
                              onClick={() => loadHouseholdsForGn(selectedGn, false, houseSearch)}
                              disabled={loadingHouses}
                              className="btn-secondary"
                              style={{ fontSize: '12px', padding: '0.35rem 0.75rem' }}
                            >
                              {loadingHouses ? <Loader2 size={13} className="animate-spin" /> : null}
                              <span>Load More Households</span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Geographic Cascade Dropdowns */}
                <div>
                  <div className="de-subsection-heading">
                    <MapPin size={15} style={{ color: 'var(--primary)' }} />
                    <span>Administrative Territorial Boundaries</span>
                  </div>
                  <div className="de-grid-3">
                    <div>
                      <label className="form-label">
                        District <span className="de-req">*</span>
                      </label>
                      <select
                        className="select-field"
                        value={selectedDistrict}
                        onChange={(e) => handleDistrictChange(e.target.value)}
                        disabled={areaLocks.isDistrictLocked}
                      >
                        {districts.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.nameEn}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="form-label">
                        DS Division <span className="de-req">*</span>
                      </label>
                      <select
                        className="select-field"
                        value={selectedDs}
                        onChange={(e) => handleDsChange(e.target.value)}
                        disabled={areaLocks.isDsLocked}
                      >
                        {dsDivisions.map((ds) => (
                          <option key={ds.id} value={ds.id}>
                            {ds.nameEn}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="form-label">
                        GN Division <span className="de-req">*</span>
                      </label>
                      <select
                        className="select-field"
                        value={selectedGn}
                        onChange={(e) => handleGnChange(e.target.value)}
                        disabled={areaLocks.isGnLocked}
                      >
                        {gnDivisions.map((gn) => (
                          <option key={gn.id} value={gn.id}>
                            {gn.nameEn} ({gn.gnCode})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Physical Household Unit Fields */}
                <div className="de-divider-top">
                  <div className="de-grid-3">
                    <div>
                      <label className="form-label">
                        House Number (DD/S/001 #1) <span className="de-req">*</span>
                      </label>
                      <input
                        type="text"
                        className="input-field"
                        placeholder="e.g. 102/B or 45"
                        value={houseNo}
                        disabled={householdMode === 'existing'}
                        onChange={(e) => setHouseNo(e.target.value)}
                        required
                      />
                    </div>

                    <div>
                      <label className="form-label">
                        Head of Household Name <span className="de-req">*</span>
                      </label>
                      <input
                        type="text"
                        className="input-field"
                        placeholder="e.g. Sunil Perera"
                        value={headName}
                        disabled={householdMode === 'existing'}
                        onChange={(e) => setHeadName(e.target.value)}
                        required
                      />
                    </div>

                    <div>
                      <label className="form-label">Village / Street / Locality</label>
                      <input
                        type="text"
                        className="input-field"
                        placeholder="e.g. Pallekele North"
                        value={villageName}
                        disabled={householdMode === 'existing'}
                        onChange={(e) => setVillageName(e.target.value)}
                      />
                    </div>

                    <div className="de-col-span-full">
                      <label className="form-label">Complete Postal Address</label>
                      <input
                        type="text"
                        className="input-field"
                        placeholder="e.g. No. 102/B, Kandy Road, Pallekele"
                        value={address}
                        disabled={householdMode === 'existing'}
                        onChange={(e) => setAddress(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {/* Household Welfare Indicators */}
                <div className="de-divider-top">
                  <div className="de-subsection-heading">
                    <HeartHandshake size={15} style={{ color: 'var(--primary)' }} />
                    <span>Welfare &amp; Social Security Coverage</span>
                  </div>
                  <div className="de-grid-cards">
                    <label
                      className={`de-check-card ${isSamurdhi ? 'is-checked' : ''} ${householdMode === 'existing' ? 'is-disabled' : ''}`}
                    >
                      <input
                        type="checkbox"
                        className="de-checkbox"
                        checked={isSamurdhi}
                        disabled={householdMode === 'existing'}
                        onChange={(e) => {
                          setIsSamurdhi(e.target.checked);
                          if (e.target.checked) setIsNonBeneficiary(false);
                        }}
                      />
                      <span>Samurdhi Beneficiary</span>
                    </label>

                    <label
                      className={`de-check-card ${isAswesuma ? 'is-checked' : ''} ${householdMode === 'existing' ? 'is-disabled' : ''}`}
                    >
                      <input
                        type="checkbox"
                        className="de-checkbox"
                        checked={isAswesuma}
                        disabled={householdMode === 'existing'}
                        onChange={(e) => {
                          setIsAswesuma(e.target.checked);
                          if (e.target.checked) setIsNonBeneficiary(false);
                        }}
                      />
                      <span>Aswesuma Beneficiary</span>
                    </label>

                    <label
                      className={`de-check-card ${isEpf ? 'is-checked' : ''} ${householdMode === 'existing' ? 'is-disabled' : ''}`}
                    >
                      <input
                        type="checkbox"
                        className="de-checkbox"
                        checked={isEpf}
                        disabled={householdMode === 'existing'}
                        onChange={(e) => {
                          setIsEpf(e.target.checked);
                          if (e.target.checked) setIsNonBeneficiary(false);
                        }}
                      />
                      <span>EPF Contributor</span>
                    </label>

                    <label
                      className={`de-check-card ${isEtf ? 'is-checked' : ''} ${householdMode === 'existing' ? 'is-disabled' : ''}`}
                    >
                      <input
                        type="checkbox"
                        className="de-checkbox"
                        checked={isEtf}
                        disabled={householdMode === 'existing'}
                        onChange={(e) => {
                          setIsEtf(e.target.checked);
                          if (e.target.checked) setIsNonBeneficiary(false);
                        }}
                      />
                      <span>ETF Contributor</span>
                    </label>

                    <label
                      className={`de-check-card ${isNonBeneficiary ? 'is-checked' : ''} ${householdMode === 'existing' ? 'is-disabled' : ''}`}
                    >
                      <input
                        type="checkbox"
                        className="de-checkbox"
                        checked={isNonBeneficiary}
                        disabled={householdMode === 'existing'}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setIsNonBeneficiary(checked);
                          if (checked) {
                            setIsSamurdhi(false);
                            setIsAswesuma(false);
                            setIsEpf(false);
                            setIsEtf(false);
                          }
                        }}
                      />
                      <span>Non-beneficiary</span>
                    </label>

                    <label
                      className={`de-check-card ${hasSpecialNeeds ? 'is-checked' : ''} ${householdMode === 'existing' ? 'is-disabled' : ''}`}
                    >
                      <input
                        type="checkbox"
                        className="de-checkbox"
                        checked={hasSpecialNeeds}
                        disabled={householdMode === 'existing'}
                        onChange={(e) => setHasSpecialNeeds(e.target.checked)}
                      />
                      <span>Special Needs Member</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* Section 2: Individual Survey Details (DD/S/002) */}
            <div className="panel" style={{ overflow: 'hidden' }}>
              <div className="de-section-header">
                <div className="de-section-title-group">
                  <div className="de-icon-badge">
                    <User size={18} />
                  </div>
                  <div>
                    <h2 className="de-section-title">Section 2: Individual Survey Data (DD/S/002)</h2>
                    <p className="de-section-subtitle">
                      Citizen demographic profiling, vocational qualifications, and career aspirations
                    </p>
                  </div>
                </div>
              </div>

              <div className="de-section-body">
                <div className="de-grid-3">
                  <div className="de-col-span-2">
                    <label className="form-label">
                      Full Name of Individual <span className="de-req">*</span>
                    </label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="e.g. Kasun Chamara Perera"
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      required
                    />
                  </div>

                  <div>
                    <label className="form-label">
                      Age <span className="de-req">*</span>
                    </label>
                    <input
                      type="number"
                      className="input-field"
                      min={1}
                      max={120}
                      value={clientAge}
                      onChange={(e) => setClientAge(parseInt(e.target.value, 10) || 18)}
                      required
                    />
                  </div>

                  <div>
                    <label className="form-label">
                      Gender (only 18-35) <span className="de-req">*</span>
                    </label>
                    <select
                      className="select-field"
                      value={clientGender}
                      onChange={(e) => setClientGender(e.target.value as 'M' | 'F')}
                    >
                      <option value="M">Male</option>
                      <option value="F">Female</option>
                    </select>
                  </div>

                  <div>
                    <label className="form-label">Phone Number</label>
                    <input
                      type="tel"
                      className="input-field"
                      placeholder="e.g. 0771234567"
                      value={clientPhone}
                      onChange={(e) => setClientPhone(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="form-label">WhatsApp Number</label>
                    <input
                      type="tel"
                      className="input-field"
                      placeholder="e.g. 0771234567"
                      value={clientWhatsapp}
                      onChange={(e) => setClientWhatsapp(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="form-label">
                      Highest Education Level <span className="de-req">*</span>
                    </label>
                    <select
                      className="select-field"
                      value={highestEducation}
                      onChange={(e) => setHighestEducation(e.target.value)}
                    >
                      {lookups.education.length > 0 ? (
                        lookups.education.map((item) => (
                          <option key={item.code} value={item.code}>
                            {getLookupLabel(item)}
                          </option>
                        ))
                      ) : (
                        <option value="EDU_OL_PASSED">G.C.E. O/L passed</option>
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="form-label">Vocational Qualification</label>
                    <select
                      className="select-field"
                      value={highestVocational}
                      onChange={(e) => setHighestVocational(e.target.value)}
                    >
                      {lookups.vocational_qualification.length > 0 ? (
                        lookups.vocational_qualification.map((item) => (
                          <option key={item.code} value={item.code}>
                            {getLookupLabel(item)}
                          </option>
                        ))
                      ) : (
                        <option value="VOC_NONE">None</option>
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="form-label">Interested Vocational Stream</label>
                    <select
                      className="select-field"
                      value={interestedStream}
                      onChange={(e) => setInterestedStream(e.target.value)}
                    >
                      {lookups.vocational_stream.length > 0 ? (
                        lookups.vocational_stream.map((item) => (
                          <option key={item.code} value={item.code}>
                            {getLookupLabel(item)}
                          </option>
                        ))
                      ) : (
                        <option value="STREAM_IT_COMPUTING">IT &amp; Computing</option>
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="form-label">Interested Job / Career Role</label>
                    <select
                      className="select-field"
                      value={interestedJob}
                      onChange={(e) => setInterestedJob(e.target.value)}
                    >
                      {lookups.job.length > 0 ? (
                        lookups.job.map((item) => (
                          <option key={item.code} value={item.code}>
                            {getLookupLabel(item)}
                          </option>
                        ))
                      ) : (
                        <option value="JOB_SOFTWARE_DEV">Software Developer</option>
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="form-label">
                      Information Provided By <span className="de-req">*</span>
                    </label>
                    <select
                      className="select-field"
                      value={infoProvidedBy}
                      onChange={(e) => setInfoProvidedBy(e.target.value as any)}
                    >
                      <option value="self">Self (Surveyed Individual)</option>
                      <option value="mother">Mother</option>
                      <option value="father">Father</option>
                      <option value="sister">Sister</option>
                      <option value="other">Other</option>
                    </select>
                  </div>

                  {infoProvidedBy === 'other' && (
                    <div className="de-col-span-2">
                      <label className="form-label">
                        Provided By (Specify Relationship) <span className="de-req">*</span>
                      </label>
                      <input
                        type="text"
                        className="input-field"
                        placeholder="e.g. Grandparent, Guardian, Neighbor"
                        value={infoProvidedByOther}
                        onChange={(e) => setInfoProvidedByOther(e.target.value)}
                        required
                      />
                    </div>
                  )}
                </div>

                {/* Future Aspirations (DD/S/002 #13) */}
                <div className="de-divider-top">
                  <div className="de-subsection-heading" style={{ alignItems: 'flex-start' }}>
                    <Compass size={15} style={{ color: 'var(--primary)', marginTop: '2px', flexShrink: 0 }} />
                    <div>
                      <div>Future Aspirations &amp; Career Hopes (DD/S/002 #13)</div>
                      <div
                        style={{
                          fontSize: '12px',
                          fontWeight: 400,
                          textTransform: 'none',
                          letterSpacing: 'normal',
                          color: 'var(--slate-400)',
                          marginTop: '2px',
                        }}
                      >
                        Select all pathways identified during enumeration
                      </div>
                    </div>
                  </div>

                  <div className="de-grid-cards">
                    {[
                      { id: 'higher_education', label: 'Higher Education' },
                      { id: 'vocational_education', label: 'Vocational Training' },
                      { id: 'entrepreneur', label: 'Entrepreneurship' },
                      { id: 'local_job', label: 'Local Job' },
                      { id: 'foreign_job', label: 'Foreign Job' },
                    ].map((hope) => {
                      const isSelected = futureHopes.includes(hope.id);
                      return (
                        <label
                          key={hope.id}
                          className={`de-check-card ${isSelected ? 'is-checked' : ''}`}
                        >
                          <input
                            type="checkbox"
                            className="de-checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFutureHopes([...futureHopes, hope.id]);
                              } else {
                                setFutureHopes(futureHopes.filter((h) => h !== hope.id));
                              }
                            }}
                          />
                          <span>{hope.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Invariant B2: Mandatory Consent Gate */}
                <div className="de-divider-top">
                  <label className={`de-consent-card ${consentGiven ? 'is-checked' : ''}`}>
                    <input
                      type="checkbox"
                      className="de-checkbox"
                      style={{ marginTop: '3px' }}
                      checked={consentGiven}
                      onChange={(e) => setConsentGiven(e.target.checked)}
                      required
                    />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12.5px', color: 'var(--slate-700)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                        <strong
                          style={{
                            color: 'var(--slate-900)',
                            fontSize: '13.5px',
                            fontWeight: 700,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                          }}
                        >
                          <FileCheck size={16} style={{ color: 'var(--primary)' }} />
                          <span>Explicit Citizen Consent Received (Statutory Requirement — Invariant B2)</span>
                        </strong>
                        <span className="badge badge-success" style={{ fontSize: '10.5px', fontFamily: 'monospace' }}>
                          {consentVersion}
                        </span>
                      </div>
                      <p style={{ color: 'var(--slate-600)', lineHeight: 1.55, margin: 0 }}>
                        The surveyed citizen has granted explicit, voluntary consent for this profile data to be indexed and processed for national vocational career matching and skill development opportunities under the National Skills Census 2026.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Form Submission Footer */}
              <div className="de-form-footer">
                <div style={{ fontSize: '12px', color: 'var(--slate-500)' }}>
                  All submissions are immutably signed with operator identity and territorial hierarchy.
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {editingDraftId && (
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      disabled={submitting || syncingDrafts}
                      className="btn-secondary"
                      style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}
                    >
                      <X size={15} />
                      <span>Cancel Edit</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleSaveDraft}
                    disabled={submitting || syncingDrafts}
                    className="btn-secondary"
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}
                    title="Save current details to local browser drafts"
                  >
                    <Save size={15} />
                    <span>Save Draft</span>
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || syncingDrafts}
                    className="btn-primary de-submit-btn"
                  >
                    {submitting ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        <span>Submitting Survey Record...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles size={16} />
                        <span>Submit Survey Record</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </form>
        )}

        {/* Drafts Modal */}
        {showDraftsModal && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 9999,
              padding: '1rem',
            }}
          >
            <div
              className="panel"
              style={{
                maxWidth: '750px',
                width: '100%',
                maxHeight: '85vh',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
                borderRadius: 'var(--radius-lg, 12px)',
                backgroundColor: 'white',
              }}
            >
              <div
                style={{
                  padding: '1.25rem 1.5rem',
                  borderBottom: '1px solid var(--slate-200)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FileText size={20} style={{ color: 'var(--primary)' }} />
                  <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700 }}>
                    Local Drafted Records ({drafts.length})
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDraftsModal(false)}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    color: 'var(--slate-400)',
                    padding: '4px',
                  }}
                >
                  <X size={20} />
                </button>
              </div>

              <div
                style={{
                  padding: '1.25rem 1.5rem',
                  overflowY: 'auto',
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                {drafts.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--slate-500)' }}>
                    No draft records currently saved. You can save unsubmitted forms as drafts using the &ldquo;Save Draft&rdquo; button.
                  </div>
                ) : (
                  drafts.map((d) => (
                    <div
                      key={d.id}
                      style={{
                        padding: '12px 16px',
                        border: '1px solid var(--slate-200)',
                        borderRadius: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px',
                        backgroundColor: d.syncStatus === 'failed' ? '#fff5f5' : '#f8fafc',
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <strong style={{ fontSize: '14px', color: 'var(--slate-800)' }}>
                            {d.clientName || '(No Name)'}
                          </strong>
                          <span className="badge" style={{ fontSize: '11px' }}>
                            {d.clientGender === 'F' ? 'Female' : 'Male'}, Age {d.clientAge}
                          </span>
                          <span className="badge" style={{ fontSize: '11px' }}>
                            House #{d.houseNo || 'N/A'}
                          </span>
                          {d.syncStatus === 'failed' && (
                            <span className="badge badge-error" style={{ fontSize: '11px' }}>
                              Failed
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--slate-500)' }}>
                          Saved at: {new Date(d.savedAt).toLocaleTimeString()}
                          {d.syncError && <span style={{ color: '#ef4444', marginLeft: '8px' }}>— Error: {d.syncError}</span>}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <button
                          type="button"
                          className="btn-secondary"
                          style={{ padding: '5px 10px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
                          onClick={() => handleLoadDraft(d)}
                          title="Load draft into form"
                        >
                          <Edit3 size={14} />
                          <span>Load</span>
                        </button>
                        <button
                          type="button"
                          className="btn-primary"
                          style={{ padding: '5px 10px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
                          onClick={() => handleSyncSingle(d)}
                          disabled={syncingDrafts}
                          title="Sync draft to server"
                        >
                          <UploadCloud size={14} />
                          <span>Sync</span>
                        </button>
                        <button
                          type="button"
                          className="btn-secondary"
                          style={{ padding: '5px 8px', fontSize: '12px', color: '#ef4444' }}
                          onClick={() => handleDeleteDraft(d.id)}
                          title="Delete draft"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div
                style={{
                  padding: '1rem 1.5rem',
                  borderTop: '1px solid var(--slate-200)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  backgroundColor: '#f8fafc',
                }}
              >
                <div style={{ fontSize: '12.5px', color: 'var(--slate-500)' }}>
                  Drafts are saved locally in your browser and persist offline.
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ fontSize: '13px' }}
                    onClick={() => setShowDraftsModal(false)}
                  >
                    Close
                  </button>
                  {drafts.length > 0 && (
                    <button
                      type="button"
                      className="btn-primary"
                      style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
                      onClick={handleSyncAllDrafts}
                      disabled={syncingDrafts}
                    >
                      {syncingDrafts ? <Loader2 size={14} className="animate-spin" /> : <UploadCloud size={14} />}
                      <span>Sync All ({drafts.length})</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        <style jsx global>{`
          .de-page {
            max-width: 1152px;
            margin: 0 auto;
            padding-bottom: 3rem;
            display: flex;
            flex-direction: column;
            gap: 1.5rem;
          }

          .de-header-card {
            padding: 1.25rem 1.5rem;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 1rem;
            flex-wrap: wrap;
          }

          .de-header-main {
            display: flex;
            align-items: flex-start;
            gap: 1rem;
            flex: 1;
            min-width: 260px;
          }

          .de-header-actions {
            flex-shrink: 0;
          }

          .de-icon-badge {
            width: 38px;
            height: 38px;
            border-radius: var(--radius-md);
            background: var(--primary-subtle);
            color: var(--primary);
            border: 1px solid #b2dfdb;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
          }

          .de-icon-badge-lg {
            width: 46px;
            height: 46px;
          }

          .de-eyebrow-row {
            display: flex;
            align-items: center;
            flex-wrap: wrap;
            gap: 0.5rem;
            margin-bottom: 4px;
          }

          .de-eyebrow-pill {
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: var(--primary);
            background: var(--primary-subtle);
            border: 1px solid #b2dfdb;
            padding: 2px 8px;
            border-radius: var(--radius-xs);
          }

          .de-dot {
            font-size: 12px;
            color: var(--slate-400);
          }

          .de-code-label {
            font-size: 12px;
            color: var(--slate-500);
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          }

          .de-page-title {
            font-size: 22px;
            font-weight: 700;
            letter-spacing: -0.02em;
            color: var(--slate-900);
            margin: 0;
            line-height: 1.3;
          }

          .de-page-subtitle {
            font-size: 13px;
            color: var(--slate-500);
            margin: 4px 0 0 0;
          }

          .de-btn-c19-lock {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 0.45rem;
            border-radius: var(--radius-sm);
            background: var(--warning-bg);
            color: var(--warning-text);
            border: 1px solid var(--warning-border);
            font-weight: 600;
            cursor: pointer;
            box-shadow: var(--shadow-xs);
            transition: background-color 0.15s ease, border-color 0.15s ease;
            white-space: nowrap;
          }

          .de-btn-c19-lock:hover:not(:disabled) {
            background: #fef3c7;
            border-color: #fcd34d;
          }

          .de-btn-c19-lock:disabled {
            opacity: 0.55;
            cursor: not-allowed;
          }

          .de-loading-card {
            padding: 2.5rem;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 0.625rem;
            text-align: center;
          }

          .de-c19-card {
            background: var(--warning-bg);
            border: 1px solid var(--warning-border);
            border-radius: var(--radius-md);
            padding: 1.5rem;
            box-shadow: var(--shadow-xs);
          }

          .de-c19-row {
            display: flex;
            align-items: flex-start;
            gap: 1rem;
            flex-wrap: wrap;
          }

          .de-c19-icon {
            width: 44px;
            height: 44px;
            border-radius: var(--radius-md);
            background: #fef3c7;
            border: 1px solid var(--warning-border);
            color: var(--warning-text);
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
          }

          .de-c19-body {
            flex: 1;
            min-width: 240px;
            display: flex;
            flex-direction: column;
            gap: 0.625rem;
          }

          .de-c19-title-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 0.5rem;
            flex-wrap: wrap;
          }

          .de-c19-title {
            font-size: 16px;
            font-weight: 700;
            color: var(--warning-text);
            margin: 0;
          }

          .de-c19-lead {
            font-size: 13.5px;
            font-weight: 600;
            color: #78350f;
            margin: 0;
          }

          .de-c19-desc {
            font-size: 12.5px;
            color: var(--warning-text);
            line-height: 1.6;
            margin: 0;
          }

          .de-form-stack {
            display: flex;
            flex-direction: column;
            gap: 1.5rem;
          }

          .de-alert {
            border-radius: var(--radius-md);
            padding: 0.875rem 1rem;
            font-size: 13.5px;
            display: flex;
            align-items: flex-start;
            gap: 0.75rem;
            box-shadow: var(--shadow-xs);
          }

          .de-alert-danger {
            background: var(--danger-bg);
            border: 1px solid var(--danger-border);
            color: var(--danger-text);
          }

          .de-alert-success {
            background: var(--success-bg);
            border: 1px solid var(--success-border);
            color: var(--success-text);
          }

          .de-section-header {
            padding: 1.125rem 1.5rem;
            border-bottom: 1px solid var(--border-subtle);
            background: var(--slate-50);
            display: flex;
            align-items: center;
            gap: 1rem;
            flex-wrap: wrap;
          }

          .de-section-header-between {
            justify-content: space-between;
          }

          .de-section-title-group {
            display: flex;
            align-items: center;
            gap: 0.75rem;
          }

          .de-section-title {
            font-size: 15.5px;
            font-weight: 700;
            color: var(--slate-900);
            margin: 0;
          }

          .de-section-subtitle {
            font-size: 12px;
            color: var(--slate-500);
            margin: 2px 0 0 0;
          }

          .de-segmented {
            display: inline-flex;
            flex-wrap: wrap;
            gap: 4px;
            border-radius: var(--radius-md);
            background: var(--slate-200);
            padding: 4px;
            border: 1px solid var(--border-subtle);
          }

          .de-seg-btn {
            padding: 6px 12px;
            border-radius: var(--radius-sm);
            font-size: 12px;
            font-weight: 600;
            border: none;
            background: transparent;
            color: var(--slate-600);
            cursor: pointer;
            transition: all 0.15s ease;
          }

          .de-seg-btn:hover {
            color: var(--slate-900);
          }

          .de-seg-btn.is-active {
            background: #ffffff;
            color: var(--slate-900);
            box-shadow: var(--shadow-xs);
          }

          .de-section-body {
            padding: 1.5rem;
            display: flex;
            flex-direction: column;
            gap: 1.5rem;
          }

          .de-existing-box {
            background: var(--slate-50);
            border: 1px solid var(--border-subtle);
            border-radius: var(--radius-md);
            padding: 1rem 1.125rem;
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
          }

          .de-existing-top {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 0.75rem;
            flex-wrap: wrap;
          }

          .de-search-wrap {
            position: relative;
            width: 100%;
            max-width: 280px;
          }

          .de-search-icon {
            position: absolute;
            left: 10px;
            top: 50%;
            transform: translateY(-50%);
            color: var(--slate-400);
            pointer-events: none;
          }

          .de-empty-box {
            padding: 0.75rem 1rem;
            background: var(--warning-bg);
            border: 1px solid var(--warning-border);
            border-radius: var(--radius-sm);
            font-size: 12.5px;
            color: var(--warning-text);
          }

          .de-subsection-heading {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            margin-bottom: 0.875rem;
            font-size: 11.5px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: var(--slate-700);
          }

          .de-divider-top {
            padding-top: 1.25rem;
            border-top: 1px solid var(--slate-100);
          }

          .de-req {
            color: var(--danger);
            margin-left: 2px;
          }

          .de-grid-3 {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 1rem;
          }

          .de-col-span-2 {
            grid-column: span 2;
          }

          .de-col-span-full {
            grid-column: 1 / -1;
          }

          .de-grid-cards {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(175px, 1fr));
            gap: 0.75rem;
          }

          .de-check-card {
            display: flex;
            align-items: center;
            gap: 0.625rem;
            padding: 0.75rem 0.875rem;
            border-radius: var(--radius-md);
            border: 1px solid var(--border-subtle);
            background: var(--bg-surface);
            color: var(--slate-700);
            font-size: 12.5px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.15s ease;
            user-select: none;
          }

          .de-check-card:hover:not(.is-disabled) {
            background: var(--slate-50);
            border-color: var(--border-strong);
          }

          .de-check-card.is-checked {
            border-color: var(--primary);
            background: var(--primary-subtle);
            color: var(--primary-text);
            font-weight: 600;
            box-shadow: var(--shadow-xs);
          }

          .de-check-card.is-disabled {
            opacity: 0.65;
            cursor: not-allowed;
          }

          .de-checkbox {
            width: 16px;
            height: 16px;
            accent-color: var(--primary);
            cursor: pointer;
            flex-shrink: 0;
          }

          .de-consent-card {
            display: flex;
            align-items: flex-start;
            gap: 0.875rem;
            padding: 1rem 1.125rem;
            border-radius: var(--radius-md);
            border: 1px solid #99f6e4;
            background: #f0fdfa;
            cursor: pointer;
            transition: all 0.15s ease;
          }

          .de-consent-card:hover {
            border-color: var(--primary-accent);
            background: var(--primary-subtle);
          }

          .de-consent-card.is-checked {
            border-color: var(--primary);
            background: var(--primary-subtle);
            box-shadow: var(--shadow-xs);
          }

          .de-form-footer {
            padding: 1.125rem 1.5rem;
            border-top: 1px solid var(--border-subtle);
            background: var(--slate-50);
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 1rem;
            flex-wrap: wrap;
          }

          .de-submit-btn {
            padding: 0.625rem 1.5rem;
            font-size: 14px;
          }

          @media (max-width: 900px) {
            .de-grid-3 {
              grid-template-columns: repeat(2, minmax(0, 1fr));
            }
          }

          @media (max-width: 600px) {
            .de-grid-3 {
              grid-template-columns: minmax(0, 1fr);
            }

            .de-col-span-2 {
              grid-column: span 1;
            }

            .de-submit-btn {
              width: 100%;
            }
          }
        `}</style>
      </div>
    </Shell>
  );
}
