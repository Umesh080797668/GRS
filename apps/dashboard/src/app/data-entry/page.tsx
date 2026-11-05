'use client';

import React, { useState, useEffect } from 'react';
import { Shell } from '@/components/Shell';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
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
} from 'lucide-react';

export default function DataEntryPage() {
  const { t, language } = useLanguage();
  const { user } = useAuth();

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

  const [houseNo, setHouseNo] = useState('');
  const [headName, setHeadName] = useState('');
  const [address, setAddress] = useState('');
  const [villageName, setVillageName] = useState('');
  const [isEpf, setIsEpf] = useState(false);
  const [isEtf, setIsEtf] = useState(false);
  const [isAswesuma, setIsAswesuma] = useState(false);
  const [isSamurdhi, setIsSamurdhi] = useState(false);
  const [hasSpecialNeeds, setHasSpecialNeeds] = useState(false);

  // Client fields (DD/S/002)
  const [clientName, setClientName] = useState('');
  const [clientAge, setClientAge] = useState<number>(25);
  const [clientGender, setClientGender] = useState<'male' | 'female' | 'other'>('male');
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

  useEffect(() => {
    checkConfig();
    loadLookups();
    loadDistricts();
  }, []);

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
      const allowedRoles: string[] = cfg?.webEntryRoles || cfg?.web_entry_roles || ['cdc_secretary', 'sda', 'dc', 'admin'];
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
      setHasSpecialNeeds(Boolean(found.hasSpecialNeeds));
    }
  }

  async function loadDistricts() {
    try {
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
            loadHouseholdsForGn(initialGn);
          }
        }
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
      const currentRoles: string[] = appConfig?.webEntryRoles || appConfig?.web_entry_roles || ['cdc_secretary', 'sda', 'dc', 'admin'];
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
            hasSpecialNeeds,
          });
          householdId = houseRes.id;
        } catch (err: any) {
          // If household already exists, attach to it instead of failing with duplicate error
          if (
            err.message?.includes('already exists') ||
            err.message?.includes('DUPLICATE_HOUSE_NUMBER')
          ) {
            const listRes = await api.getHouseholds({ gnId: selectedGn, search: houseNo.trim(), limit: 50 });
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
    } catch (err: any) {
      setSubmitError(err.messageKey ? t(err.messageKey) : (err.message || t('entry.error.submit_failed')));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Shell activePath="/data-entry">
      <div className="space-y-6 max-w-6xl mx-auto pb-12">
        {/* Page Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-teal-50 text-teal-800 border border-teal-200/60 rounded-xl flex-shrink-0">
              <PenTool className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-200/50">
                  Administrative Field Entry
                </span>
                <span className="text-xs text-slate-400">•</span>
                <span className="text-xs text-slate-500 font-mono">DD/S/001 & DD/S/002</span>
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                {t('entry.title')}
              </h1>
              <p className="text-sm text-slate-500 mt-1">
                Manual paper census entry fallback for official enumerator forms DD/S/001 (Household) and DD/S/002 (Individual).
              </p>
            </div>
          </div>

          {user?.role === 'super_admin' && (
            <div className="flex-shrink-0">
              <button
                onClick={toggleWebEntryRole}
                disabled={togglingConfig}
                className={`btn text-xs font-semibold px-3.5 py-2 flex items-center gap-2 ${webEntryEnabled
                  ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300'
                  : 'btn-primary'
                  }`}
              >
                {togglingConfig ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : webEntryEnabled ? (
                  <>
                    <Lock className="w-3.5 h-3.5 text-amber-700" />
                    <span>Enforce C19 Gate (Disable Web Entry)</span>
                  </>
                ) : (
                  <>
                    <Unlock className="w-3.5 h-3.5 text-white" />
                    <span>Override Decision C19 (Enable Entry)</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Loading authorization state */}
        {loadingConfig && (
          <div className="panel p-10 flex flex-col items-center justify-center gap-3 text-slate-500 text-center">
            <Loader2 className="w-6 h-6 animate-spin text-teal-700" />
            <div className="text-sm font-medium text-slate-700">Verifying role authorization & census protocol...</div>
            <div className="text-xs text-slate-400">Querying platform policy configuration</div>
          </div>
        )}

        {/* Decision C19 Policy Gate Advisory Card (when disabled) */}
        {!loadingConfig && !webEntryEnabled && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-6 shadow-xs">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-amber-100 text-amber-800 rounded-xl flex-shrink-0 border border-amber-200">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div className="space-y-3 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-base font-bold text-amber-900">
                    Decision C19: Web Direct Data Entry Restricted
                  </h2>
                  <span className="badge badge-warning text-xs font-semibold">
                    Policy Protected
                  </span>
                </div>
                <p className="text-sm text-amber-950 font-medium">
                  {t('entry.web_roles_off')}
                </p>
                <p className="text-xs text-amber-800/90 leading-relaxed">
                  To protect field census data integrity and avoid bypassing territorial assignment locks, central Level 00 administrators are restricted from entering survey records directly via web dashboard by default. Primary enumeration is mandated to originate from assigned field tablets with cryptographic timestamping.
                </p>
                {user?.role === 'super_admin' && (
                  <div className="pt-2">
                    <button
                      onClick={toggleWebEntryRole}
                      disabled={togglingConfig}
                      className="btn btn-primary text-xs flex items-center gap-2"
                    >
                      <Unlock className="w-3.5 h-3.5" />
                      Grant Super Admin Override (Enable Web Entry)
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Direct Data Entry Form (Active when enabled) */}
        {!loadingConfig && webEntryEnabled && (
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Status alerts */}
            {submitError && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 flex items-start gap-3 shadow-xs">
                <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <strong className="block font-semibold">Submission Failed</strong>
                  <span>{submitError}</span>
                </div>
              </div>
            )}

            {submitSuccess && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 flex items-start gap-3 shadow-xs">
                <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <strong className="block font-semibold">Record Logged Successfully</strong>
                  <span>{submitSuccess}</span>
                </div>
              </div>
            )}

            {/* Section 1: Household Information (DD/S/001) */}
            <div className="panel overflow-hidden">
              <div className="p-5 border-b border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-teal-50 border border-teal-200 text-teal-800 flex items-center justify-center font-bold">
                    <Home className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900">
                      Section 1: Household Roster (DD/S/001)
                    </h2>
                    <p className="text-xs text-slate-500">
                      Physical dwelling unit, geographic hierarchy, and welfare indicators
                    </p>
                  </div>
                </div>

                {/* Mode Switcher */}
                <div className="inline-flex rounded-lg bg-slate-200/70 p-1 border border-slate-200 self-start sm:self-auto">
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
                      setHasSpecialNeeds(false);
                    }}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${householdMode === 'new'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                      }`}
                  >
                    + Register New Household
                  </button>
                  <button
                    type="button"
                    onClick={() => setHouseholdMode('existing')}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${householdMode === 'existing'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                      }`}
                  >
                    Attach to Existing House ({existingHouseholds.length})
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-6">
                {/* Existing Household Selector Bar */}
                {householdMode === 'existing' && (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <label className="text-xs font-bold text-slate-800 block">
                          Select Existing Household to Attach Survey Entry *
                        </label>
                        <p className="text-[11px] text-slate-500">
                          Adding multiple members to the same household unit under form DD/S/002
                        </p>
                      </div>
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="text"
                          placeholder="Filter house # or name..."
                          value={houseSearch}
                          onChange={(e) => {
                            setHouseSearch(e.target.value);
                            if (selectedGn) loadHouseholdsForGn(selectedGn, true, e.target.value);
                          }}
                          className="input-field text-xs pl-8 pr-3 py-1.5 max-w-xs"
                        />
                      </div>
                    </div>

                    {existingHouseholds.length === 0 ? (
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                        {loadingHouses
                          ? 'Searching households in division...'
                          : 'No registered households found in this GN division. Register a new household or adjust search query.'}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <select
                          className="select-field text-sm font-medium"
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
                          <div className="flex justify-end pt-1">
                            <button
                              type="button"
                              onClick={() => loadHouseholdsForGn(selectedGn, false, houseSearch)}
                              disabled={loadingHouses}
                              className="btn btn-secondary text-xs py-1 px-3"
                            >
                              {loadingHouses ? (
                                <Loader2 className="w-3 h-3 animate-spin mr-1" />
                              ) : null}
                              Load More Households
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Geographic Cascade Dropdowns */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <MapPin className="w-4 h-4 text-teal-700" />
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Administrative Territorial Boundaries
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                        District <span className="text-rose-600">*</span>
                      </label>
                      <select
                        className="select-field text-sm"
                        value={selectedDistrict}
                        onChange={(e) => handleDistrictChange(e.target.value)}
                        disabled={user?.role === 'cdc_secretary'}
                      >
                        {districts.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.nameEn}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                        DS Division <span className="text-rose-600">*</span>
                      </label>
                      <select
                        className="select-field text-sm"
                        value={selectedDs}
                        onChange={(e) => handleDsChange(e.target.value)}
                        disabled={user?.role === 'cdc_secretary'}
                      >
                        {dsDivisions.map((ds) => (
                          <option key={ds.id} value={ds.id}>
                            {ds.nameEn}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                        GN Division <span className="text-rose-600">*</span>
                      </label>
                      <select
                        className="select-field text-sm"
                        value={selectedGn}
                        onChange={(e) => handleGnChange(e.target.value)}
                        disabled={user?.role === 'cdc_secretary'}
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
                <div className="pt-2 border-t border-slate-100">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                        House Number (DD/S/001 #1) <span className="text-rose-600">*</span>
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
                      <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                        Head of Household Name <span className="text-rose-600">*</span>
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
                      <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                        Village / Street / Locality
                      </label>
                      <input
                        type="text"
                        className="input-field"
                        placeholder="e.g. Pallekele North"
                        value={villageName}
                        disabled={householdMode === 'existing'}
                        onChange={(e) => setVillageName(e.target.value)}
                      />
                    </div>

                    <div className="md:col-span-3">
                      <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                        Complete Postal Address
                      </label>
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
                <div className="pt-4 border-t border-slate-100">
                  <div className="flex items-center gap-2 mb-3">
                    <HeartHandshake className="w-4 h-4 text-teal-700" />
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Welfare & Social Security Coverage
                    </span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
                    <label className="flex items-center gap-2.5 p-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer transition-all has-[:checked]:border-teal-600 has-[:checked]:bg-teal-50/50 has-[:checked]:text-teal-900 font-medium">
                      <input
                        type="checkbox"
                        className="w-4 h-4 rounded text-teal-700 accent-teal-700 cursor-pointer"
                        checked={isSamurdhi}
                        disabled={householdMode === 'existing'}
                        onChange={(e) => setIsSamurdhi(e.target.checked)}
                      />
                      <span>Samurdhi Beneficiary</span>
                    </label>

                    <label className="flex items-center gap-2.5 p-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer transition-all has-[:checked]:border-teal-600 has-[:checked]:bg-teal-50/50 has-[:checked]:text-teal-900 font-medium">
                      <input
                        type="checkbox"
                        className="w-4 h-4 rounded text-teal-700 accent-teal-700 cursor-pointer"
                        checked={isAswesuma}
                        disabled={householdMode === 'existing'}
                        onChange={(e) => setIsAswesuma(e.target.checked)}
                      />
                      <span>Aswesuma Beneficiary</span>
                    </label>

                    <label className="flex items-center gap-2.5 p-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer transition-all has-[:checked]:border-teal-600 has-[:checked]:bg-teal-50/50 has-[:checked]:text-teal-900 font-medium">
                      <input
                        type="checkbox"
                        className="w-4 h-4 rounded text-teal-700 accent-teal-700 cursor-pointer"
                        checked={isEpf}
                        disabled={householdMode === 'existing'}
                        onChange={(e) => setIsEpf(e.target.checked)}
                      />
                      <span>EPF Contributor</span>
                    </label>

                    <label className="flex items-center gap-2.5 p-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer transition-all has-[:checked]:border-teal-600 has-[:checked]:bg-teal-50/50 has-[:checked]:text-teal-900 font-medium">
                      <input
                        type="checkbox"
                        className="w-4 h-4 rounded text-teal-700 accent-teal-700 cursor-pointer"
                        checked={isEtf}
                        disabled={householdMode === 'existing'}
                        onChange={(e) => setIsEtf(e.target.checked)}
                      />
                      <span>ETF Contributor</span>
                    </label>

                    <label className="flex items-center gap-2.5 p-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer transition-all has-[:checked]:border-teal-600 has-[:checked]:bg-teal-50/50 has-[:checked]:text-teal-900 font-medium col-span-2 md:col-span-1">
                      <input
                        type="checkbox"
                        className="w-4 h-4 rounded text-teal-700 accent-teal-700 cursor-pointer"
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
            <div className="panel overflow-hidden">
              <div className="p-5 border-b border-slate-200 bg-slate-50/50 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-teal-50 border border-teal-200 text-teal-800 flex items-center justify-center font-bold">
                  <User className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Section 2: Individual Survey Data (DD/S/002)
                  </h2>
                  <p className="text-xs text-slate-500">
                    Citizen demographic profiling, vocational qualifications, and career aspirations
                  </p>
                </div>
              </div>

              <div className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2">
                    <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                      Full Name of Individual <span className="text-rose-600">*</span>
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
                    <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                      Age <span className="text-rose-600">*</span>
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
                    <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                      Gender <span className="text-rose-600">*</span>
                    </label>
                    <select
                      className="select-field text-sm"
                      value={clientGender}
                      onChange={(e) => setClientGender(e.target.value as any)}
                    >
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                      Phone Number
                    </label>
                    <input
                      type="tel"
                      className="input-field"
                      placeholder="e.g. 0771234567"
                      value={clientPhone}
                      onChange={(e) => setClientPhone(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                      WhatsApp Number
                    </label>
                    <input
                      type="tel"
                      className="input-field"
                      placeholder="e.g. 0771234567"
                      value={clientWhatsapp}
                      onChange={(e) => setClientWhatsapp(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                      Highest Education Level <span className="text-rose-600">*</span>
                    </label>
                    <select
                      className="select-field text-sm"
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
                    <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                      Vocational Qualification
                    </label>
                    <select
                      className="select-field text-sm"
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
                    <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                      Interested Vocational Stream
                    </label>
                    <select
                      className="select-field text-sm"
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
                        <option value="STREAM_IT_COMPUTING">IT & Computing</option>
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                      Information Provided By <span className="text-rose-600">*</span>
                    </label>
                    <select
                      className="select-field text-sm"
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
                    <div className="md:col-span-2">
                      <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                        Provided By (Specify Relationship) <span className="text-rose-600">*</span>
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
                <div className="pt-4 border-t border-slate-100">
                  <div className="flex items-center gap-2 mb-3">
                    <Compass className="w-4 h-4 text-teal-700" />
                    <div>
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                        Future Aspirations & Career Hopes (DD/S/002 #13)
                      </span>
                      <span className="text-xs text-slate-400 block font-normal">
                        Select all pathways identified during enumeration
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 text-xs">
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
                          className={`flex items-center gap-2.5 p-3 rounded-lg border cursor-pointer transition-all ${isSelected
                            ? 'border-teal-600 bg-teal-50/60 text-teal-900 font-semibold shadow-xs'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                            }`}
                        >
                          <input
                            type="checkbox"
                            className="w-4 h-4 rounded text-teal-700 accent-teal-700 cursor-pointer"
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
                <div className="pt-4 border-t border-slate-100">
                  <label className="flex items-start gap-3.5 p-4 rounded-xl border border-teal-200 bg-teal-50/40 hover:bg-teal-50/70 transition-colors cursor-pointer shadow-xs">
                    <input
                      type="checkbox"
                      className="w-4 h-4 mt-1 rounded text-teal-700 accent-teal-700 cursor-pointer flex-shrink-0"
                      checked={consentGiven}
                      onChange={(e) => setConsentGiven(e.target.checked)}
                      required
                    />
                    <div className="text-xs text-slate-700 space-y-1">
                      <div className="flex items-center gap-2">
                        <strong className="text-slate-900 text-sm font-bold flex items-center gap-1.5">
                          <FileCheck className="w-4 h-4 text-teal-700" />
                          Explicit Citizen Consent Received (Statutory Requirement — Invariant B2)
                        </strong>
                        <span className="badge badge-success text-[10px] font-mono">
                          {consentVersion}
                        </span>
                      </div>
                      <p className="text-slate-600 leading-relaxed">
                        The surveyed citizen has granted explicit, voluntary consent for this profile data to be indexed and processed for national vocational career matching and skill development opportunities under the National Skills Census 2026.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Form Submission Footer */}
              <div className="p-5 border-t border-slate-200 bg-slate-50/60 flex flex-col sm:flex-row justify-between items-center gap-3">
                <div className="text-xs text-slate-500">
                  All submissions are immutably signed with operator identity and territorial hierarchy.
                </div>
                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="btn btn-primary px-6 py-2.5 text-sm font-semibold flex items-center justify-center gap-2 shadow-sm w-full sm:w-auto"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Submitting Survey Record...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        <span>Submit Survey Record</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </form>
        )}
      </div>
    </Shell>
  );
}
