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
} from 'lucide-react';

export default function DataEntryPage() {
  const { t } = useLanguage();
  const { user } = useAuth();

  const [loadingConfig, setLoadingConfig] = useState(true);
  const [webEntryEnabled, setWebEntryEnabled] = useState(false);
  const [togglingConfig, setTogglingConfig] = useState(false);

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
  const [highestEducation, setHighestEducation] = useState('GCE_AL');
  const [highestVocational, setHighestVocational] = useState('NVQ3');
  const [interestedStream, setInterestedStream] = useState('ICT');
  const [interestedJob, setInterestedJob] = useState('SOFTWARE_DEV');
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
    loadDistricts();
  }, []);

  async function checkConfig() {
    setLoadingConfig(true);
    try {
      const cfg = await api.getConfig();
      setWebEntryEnabled(Boolean(cfg?.features?.webDataEntry));
      if (cfg?.consentVersion || cfg?.consent_version) {
        setConsentVersion(cfg.consentVersion || cfg.consent_version);
      }
    } catch (err: any) {
      console.error('Config fetch failed:', err);
    } finally {
      setLoadingConfig(false);
    }
  }

  async function loadHouseholdsForGn(gnId: string) {
    if (!gnId) {
      setExistingHouseholds([]);
      return;
    }
    try {
      const res = await api.getHouseholds({ gnId, limit: 1000 });
      const list = Array.isArray(res) ? res : res?.households || [];
      setExistingHouseholds(list);
    } catch (err) {
      console.error('Failed to load households for GN:', err);
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
        setSelectedDistrict(data[0].id);
        const dsList = await api.getDsDivisions(data[0].id);
        setDsDivisions(dsList);
        if (dsList.length > 0) {
          setSelectedDs(dsList[0].id);
          const gnList = await api.getGnDivisions(dsList[0].id);
          setGnDivisions(gnList);
          if (gnList.length > 0) {
            setSelectedGn(gnList[0].id);
            loadHouseholdsForGn(gnList[0].id);
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
      await api.updateConfig({ web_data_entry_enabled: newStatus });
      setWebEntryEnabled(newStatus);
    } catch (err: any) {
      alert(`Failed to update config: ${err.message}`);
    } finally {
      setTogglingConfig(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(null);

    if (!selectedGn) {
      setSubmitError('Please select a GN Division.');
      return;
    }
    if (!houseNo.trim()) {
      setSubmitError('House number is required.');
      return;
    }
    if (!headName.trim()) {
      setSubmitError('Head of household name is required.');
      return;
    }
    if (!clientName.trim()) {
      setSubmitError('Individual survey name is required.');
      return;
    }
    if (!consentGiven) {
      setSubmitError('Individual consent is mandatory per Data Protection Act (Invariant B2).');
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
      setSubmitError(err.message || 'Failed to submit online entry.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Shell activePath="/data-entry">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
              <PenTool className="w-7 h-7 text-emerald-400" />
              {t('entry.title')}
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Direct administrative web entry for paper census forms DD/S/001 & DD/S/002.
            </p>
          </div>
          {user?.role === 'super_admin' && (
            <button
              onClick={toggleWebEntryRole}
              disabled={togglingConfig}
              className={`btn text-xs flex items-center gap-2 ${webEntryEnabled ? 'btn-secondary text-amber-400' : 'btn-primary'
                }`}
            >
              {togglingConfig ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : webEntryEnabled ? (
                <>
                  <Lock className="w-3.5 h-3.5" /> Enforce C19 Gate (Disable Web Entry)
                </>
              ) : (
                <>
                  <Unlock className="w-3.5 h-3.5" /> Override Decision C19 (Enable Entry)
                </>
              )}
            </button>
          )}
        </div>

        {/* Loading state */}
        {loadingConfig && (
          <div className="card p-8 flex items-center justify-center gap-3 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin text-emerald-400" />
            <span>Verifying role authorization...</span>
          </div>
        )}

        {/* Decision C19 Policy Gate (Disabled by default for super_admin) */}
        {!loadingConfig && !webEntryEnabled && (
          <div className="card border-amber-500/30 bg-amber-500/10 p-6 space-y-4">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-amber-500/20 rounded-xl text-amber-400 flex-shrink-0">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div className="space-y-2">
                <h2 className="text-base font-semibold text-white">
                  Decision C19: Web Direct Data Entry Restricted
                </h2>
                <p className="text-sm text-slate-300">
                  {t('entry.web_roles_off')}
                </p>
                <p className="text-xs text-slate-400">
                  To protect field census data integrity and avoid bypass of territorial assignment locks,
                  central Level 00 administrators are disallowed from entering field surveys directly from the web dashboard.
                  All census records are intended to originate from authorized field tablet teams.
                </p>
                {user?.role === 'super_admin' && (
                  <div className="pt-2">
                    <button
                      onClick={toggleWebEntryRole}
                      disabled={togglingConfig}
                      className="btn btn-primary text-xs flex items-center gap-2"
                    >
                      <Unlock className="w-3.5 h-3.5" />
                      Grant Super Admin Override (Toggle Web Entry)
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
            {submitError && (
              <div className="card border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300 flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                <span>{submitError}</span>
              </div>
            )}

            {submitSuccess && (
              <div className="card border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-300 flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                <span>{submitSuccess}</span>
              </div>
            )}

            {/* Section 1: Household Information (DD/S/001) */}
            <div className="card p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Home className="w-5 h-5 text-emerald-400" />
                  <h2 className="text-base font-bold text-white">
                    Section 1: Household Roster (DD/S/001)
                  </h2>
                </div>
                <div className="flex items-center gap-1.5 text-xs bg-slate-900/80 p-1 rounded-lg border border-slate-800 self-start sm:self-auto">
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
                    className={`px-3 py-1 rounded font-medium transition-colors ${householdMode === 'new'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                      : 'text-slate-400 hover:text-white'
                      }`}
                  >
                    + Register New Household
                  </button>
                  <button
                    type="button"
                    onClick={() => setHouseholdMode('existing')}
                    className={`px-3 py-1 rounded font-medium transition-colors ${householdMode === 'existing'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                      : 'text-slate-400 hover:text-white'
                      }`}
                  >
                    Attach to Existing House ({existingHouseholds.length})
                  </button>
                </div>
              </div>

              {householdMode === 'existing' && (
                <div className="bg-slate-900/60 p-4 rounded-lg border border-slate-800 space-y-2">
                  <label className="text-xs text-slate-300 block font-semibold">
                    Select Existing Household to Attach Survey Entry *
                  </label>
                  {existingHouseholds.length === 0 ? (
                    <p className="text-xs text-amber-400">
                      No registered households found in this GN division. Please register a new household first.
                    </p>
                  ) : (
                    <select
                      className="input text-sm"
                      value={selectedHouseholdId}
                      onChange={(e) => handleSelectExistingHousehold(e.target.value)}
                      required
                    >
                      <option value="">-- Choose Household in {gnDivisions.find((g) => g.id === selectedGn)?.nameEn || 'GN'} --</option>
                      {existingHouseholds.map((h) => (
                        <option key={h.id} value={h.id}>
                          House #{h.houseNo} — {h.houseLeaderName} {h.villageName ? `(${h.villageName})` : ''}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">District *</label>
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
                  <label className="text-xs text-slate-400 block mb-1">DS Division *</label>
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
                  <label className="text-xs text-slate-400 block mb-1">GN Division *</label>
                  <select
                    className="input text-sm"
                    value={selectedGn}
                    onChange={(e) => handleGnChange(e.target.value)}
                  >
                    {gnDivisions.map((gn) => (
                      <option key={gn.id} value={gn.id}>
                        {gn.nameEn} ({gn.gnCode})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs text-slate-400 block mb-1">House Number (DD/S/001 #1) *</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g. 102/B or 45"
                    value={houseNo}
                    disabled={householdMode === 'existing'}
                    onChange={(e) => setHouseNo(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-400 block mb-1">Head of Household Name *</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g. Sunil Perera"
                    value={headName}
                    disabled={householdMode === 'existing'}
                    onChange={(e) => setHeadName(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-400 block mb-1">Village / Street</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g. Pallekele North"
                    value={villageName}
                    disabled={householdMode === 'existing'}
                    onChange={(e) => setVillageName(e.target.value)}
                  />
                </div>

                <div className="md:col-span-3">
                  <label className="text-xs text-slate-400 block mb-1">Complete Address</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g. No. 102/B, Kandy Road, Pallekele"
                    value={address}
                    disabled={householdMode === 'existing'}
                    onChange={(e) => setAddress(e.target.value)}
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800">
                <span className="text-xs text-slate-400 block mb-2">Household Welfare Indicators</span>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
                  <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                    <input
                      type="checkbox"
                      checked={isSamurdhi}
                      disabled={householdMode === 'existing'}
                      onChange={(e) => setIsSamurdhi(e.target.checked)}
                    />
                    Samurdhi Beneficiary
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                    <input
                      type="checkbox"
                      checked={isAswesuma}
                      disabled={householdMode === 'existing'}
                      onChange={(e) => setIsAswesuma(e.target.checked)}
                    />
                    Aswesuma Beneficiary
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                    <input
                      type="checkbox"
                      checked={isEpf}
                      disabled={householdMode === 'existing'}
                      onChange={(e) => setIsEpf(e.target.checked)}
                    />
                    EPF Contributor
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                    <input
                      type="checkbox"
                      checked={isEtf}
                      disabled={householdMode === 'existing'}
                      onChange={(e) => setIsEtf(e.target.checked)}
                    />
                    ETF Contributor
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                    <input
                      type="checkbox"
                      checked={hasSpecialNeeds}
                      disabled={householdMode === 'existing'}
                      onChange={(e) => setHasSpecialNeeds(e.target.checked)}
                    />
                    Special Needs in House
                  </label>
                </div>
              </div>
            </div>

            {/* Section 2: Individual Survey Details (DD/S/002) */}
            <div className="card p-6 space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
                <User className="w-5 h-5 text-emerald-400" />
                <h2 className="text-base font-bold text-white">
                  Section 2: Individual Survey Data (DD/S/002)
                </h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <label className="text-xs text-slate-400 block mb-1">Full Name of Individual *</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g. Kasun Chamara Perera"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-400 block mb-1">Age *</label>
                  <input
                    type="number"
                    className="input"
                    min={1}
                    max={120}
                    value={clientAge}
                    onChange={(e) => setClientAge(parseInt(e.target.value, 10) || 18)}
                    required
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-400 block mb-1">Gender *</label>
                  <select
                    className="input text-sm"
                    value={clientGender}
                    onChange={(e) => setClientGender(e.target.value as any)}
                  >
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-slate-400 block mb-1">Phone Number</label>
                  <input
                    type="tel"
                    className="input"
                    placeholder="e.g. 0771234567"
                    value={clientPhone}
                    onChange={(e) => setClientPhone(e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-400 block mb-1">WhatsApp Number</label>
                  <input
                    type="tel"
                    className="input"
                    placeholder="e.g. 0771234567"
                    value={clientWhatsapp}
                    onChange={(e) => setClientWhatsapp(e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-400 block mb-1">Highest Education Level</label>
                  <select
                    className="input text-sm"
                    value={highestEducation}
                    onChange={(e) => setHighestEducation(e.target.value)}
                  >
                    <option value="NO_FORMAL">No Formal Schooling</option>
                    <option value="PRIMARY">Primary School (Grades 1-5)</option>
                    <option value="SECONDARY">Junior Secondary (Grades 6-9)</option>
                    <option value="GCE_OL">G.C.E. O/L</option>
                    <option value="GCE_AL">G.C.E. A/L</option>
                    <option value="DEGREE">Bachelor's Degree</option>
                    <option value="POSTGRAD">Postgraduate Degree</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-slate-400 block mb-1">Vocational Qualification</label>
                  <select
                    className="input text-sm"
                    value={highestVocational}
                    onChange={(e) => setHighestVocational(e.target.value)}
                  >
                    <option value="NONE">None</option>
                    <option value="NVQ1">NVQ Level 1</option>
                    <option value="NVQ2">NVQ Level 2</option>
                    <option value="NVQ3">NVQ Level 3</option>
                    <option value="NVQ4">NVQ Level 4 (National Certificate)</option>
                    <option value="NVQ5">NVQ Level 5 (National Diploma)</option>
                    <option value="NVQ6">NVQ Level 6 (Higher Diploma)</option>
                    <option value="NVQ7">NVQ Level 7 (Degree equivalent)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-slate-400 block mb-1">Interested Vocational Stream</label>
                  <select
                    className="input text-sm"
                    value={interestedStream}
                    onChange={(e) => setInterestedStream(e.target.value)}
                  >
                    <option value="ICT">Information & Comm. Technology</option>
                    <option value="CONSTRUCTION">Construction & Engineering</option>
                    <option value="TOURISM">Hospitality & Tourism</option>
                    <option value="AUTOMOTIVE">Automobile & Mechanics</option>
                    <option value="BEAUTY">Cosmetology & Hair</option>
                    <option value="AGRICULTURE">Agri-Business & Farming</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-slate-400 block mb-1">Information Provided By *</label>
                  <select
                    className="input text-sm"
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
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Provided By (Other Details) *</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="Specify relation or person"
                      value={infoProvidedByOther}
                      onChange={(e) => setInfoProvidedByOther(e.target.value)}
                      required
                    />
                  </div>
                )}
              </div>

              {/* Future Aspirations (DD/S/002 #13) */}
              <div className="pt-2 border-t border-slate-800">
                <span className="text-xs text-slate-400 block mb-2 font-medium">
                  Future Aspirations / Hopes (DD/S/002 #13) — Select all that apply
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 text-xs">
                  {[
                    { id: 'higher_education', label: 'Higher Education' },
                    { id: 'vocational_education', label: 'Vocational Training' },
                    { id: 'entrepreneur', label: 'Entrepreneurship' },
                    { id: 'local_job', label: 'Local Job' },
                    { id: 'foreign_job', label: 'Foreign Job' },
                  ].map((hope) => (
                    <label key={hope.id} className="flex items-center gap-2 cursor-pointer text-slate-300 bg-slate-900/40 p-2 rounded border border-slate-800 hover:border-slate-700">
                      <input
                        type="checkbox"
                        checked={futureHopes.includes(hope.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFutureHopes([...futureHopes, hope.id]);
                          } else {
                            setFutureHopes(futureHopes.filter((h) => h !== hope.id));
                          }
                        }}
                      />
                      {hope.label}
                    </label>
                  ))}
                </div>
              </div>

              {/* Invariant B2: Mandatory Consent Gate */}
              <div className="pt-4 border-t border-slate-800">
                <label className="flex items-start gap-3 cursor-pointer p-3 bg-slate-900/60 rounded-lg border border-slate-800 hover:border-slate-700">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={consentGiven}
                    onChange={(e) => setConsentGiven(e.target.checked)}
                    required
                  />
                  <div className="text-xs text-slate-300">
                    <strong className="text-white block mb-0.5">
                      Explicit Consent Received (Statutory Requirement — Invariant B2)
                    </strong>
                    The surveyed individual has given explicit voluntary consent for this skill profile data
                    to be collected and analyzed for national vocational placement under the National Skills Census 2026.
                  </div>
                </label>
              </div>
            </div>

            {/* Submit Button */}
            <div className="flex justify-end gap-3">
              <button
                type="submit"
                disabled={submitting}
                className="btn btn-primary flex items-center gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Submitting Survey Record...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Submit Survey Record
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </Shell>
  );
}
