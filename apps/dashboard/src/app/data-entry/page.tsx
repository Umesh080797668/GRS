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
  }, []);

  useEffect(() => {
    loadDistricts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role, user?.districtId, user?.dsId, user?.gnId]);

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
      const isSdo = user?.role === 'sda';
      const rawData = await api.getDistricts();
      const data = isSdo && user?.districtId ? rawData.filter((d) => d.id === user.districtId) : rawData;
      setDistricts(data);
      if (data.length > 0) {
        const initialDist = user?.districtId || data[0].id;
        setSelectedDistrict(initialDist);
        const rawDsList = await api.getDsDivisions(initialDist);
        const dsList = isSdo && user?.dsId ? rawDsList.filter((ds) => ds.id === user.dsId) : rawDsList;
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

          {user?.role === 'super_admin' && (
            <div className="de-header-actions">
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
            </div>
          )}
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
                    className={`de-seg-btn ${householdMode === 'new' ? 'is-active' : ''}`}
                  >
                    + Register New Household
                  </button>
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
                        disabled={user?.role === 'cdc_secretary' || user?.role === 'sda'}
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
                        disabled={user?.role === 'cdc_secretary' || user?.role === 'sda'}
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
                        onChange={(e) => setIsSamurdhi(e.target.checked)}
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
                        onChange={(e) => setIsAswesuma(e.target.checked)}
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
                        onChange={(e) => setIsEpf(e.target.checked)}
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
                        onChange={(e) => setIsEtf(e.target.checked)}
                      />
                      <span>ETF Contributor</span>
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
                      Gender <span className="de-req">*</span>
                    </label>
                    <select
                      className="select-field"
                      value={clientGender}
                      onChange={(e) => setClientGender(e.target.value as any)}
                    >
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
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
                <button
                  type="submit"
                  disabled={submitting}
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
          </form>
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
