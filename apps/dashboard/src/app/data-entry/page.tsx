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

  // Household fields (DD/S/001)
  const [houseNo, setHouseNo] = useState('');
  const [headName, setHeadName] = useState('');
  const [address, setAddress] = useState('');
  const [villageName, setVillageName] = useState('');
  const [isEpf, setIsEpf] = useState(false);
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
  const [consentGiven, setConsentGiven] = useState(false);

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
    } catch (err: any) {
      console.error('Config fetch failed:', err);
    } finally {
      setLoadingConfig(false);
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
          if (gnList.length > 0) setSelectedGn(gnList[0].id);
        }
      }
    } catch (err: any) {
      console.error(err);
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
        if (gnList.length > 0) setSelectedGn(gnList[0].id);
      } else {
        setSelectedDs('');
        setGnDivisions([]);
        setSelectedGn('');
      }
    } catch (err: any) {
      console.error(err);
    }
  }

  async function handleDsChange(dsId: string) {
    setSelectedDs(dsId);
    try {
      const gnList = await api.getGnDivisions(dsId);
      setGnDivisions(gnList);
      if (gnList.length > 0) setSelectedGn(gnList[0].id);
      else setSelectedGn('');
    } catch (err: any) {
      console.error(err);
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
      // 1. Create household
      const houseRes = await api.createHousehold({
        gnId: selectedGn,
        houseNo: houseNo.trim(),
        houseLeaderName: headName.trim(),
        address: address.trim() || undefined,
        villageName: villageName.trim() || undefined,
        isEpf,
        isAswesuma,
        isSamurdhi,
        hasSpecialNeeds,
      });

      const householdId = houseRes.id;

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
        isAswesuma,
        isSamurdhi,
        hasSpecialNeeds,
        consentGiven: true,
        infoProvidedBy: 'self',
      });

      setSubmitSuccess(
        `Successfully registered household #${houseNo} and survey record for "${clientName}".`
      );

      // Reset individual form fields
      setClientName('');
      setClientPhone('');
      setClientWhatsapp('');
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
              <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
                <Home className="w-5 h-5 text-emerald-400" />
                <h2 className="text-base font-bold text-white">
                  Section 1: Household Roster (DD/S/001)
                </h2>
              </div>

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
                    onChange={(e) => setSelectedGn(e.target.value)}
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
                    onChange={(e) => setAddress(e.target.value)}
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800">
                <span className="text-xs text-slate-400 block mb-2">Household Welfare Indicators</span>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                    <input
                      type="checkbox"
                      checked={isSamurdhi}
                      onChange={(e) => setIsSamurdhi(e.target.checked)}
                    />
                    Samurdhi Beneficiary
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                    <input
                      type="checkbox"
                      checked={isAswesuma}
                      onChange={(e) => setIsAswesuma(e.target.checked)}
                    />
                    Aswesuma Beneficiary
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                    <input
                      type="checkbox"
                      checked={isEpf}
                      onChange={(e) => setIsEpf(e.target.checked)}
                    />
                    EPF / ETF Contributor
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                    <input
                      type="checkbox"
                      checked={hasSpecialNeeds}
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
