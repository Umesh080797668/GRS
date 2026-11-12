'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Download,
  FileSpreadsheet,
  Info,
  Loader2,
  Printer,
  RefreshCw,
} from 'lucide-react';
import { Shell } from '../../components/Shell';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { api } from '../../lib/api';

type ExportKind =
  | 'progress'
  | 'clients'
  | 'beneficiaries'
  | 'interests'
  | 'duplicates';
type ReportLang = 'en' | 'si' | 'ta';
type ExportFormat = 'xlsx' | 'csv';

interface AreaOption {
  id: string;
  name: string;
}

const PRINTABLE_KINDS: Array<
  'progress' | 'beneficiaries' | 'interests' | 'duplicates'
> = ['progress', 'beneficiaries', 'interests', 'duplicates'];

export default function ReportsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { lang: uiLang, t } = useLanguage();

  const [kind, setKind] = useState<ExportKind>('progress');
  const [reportLang, setReportLang] = useState<ReportLang>('en');
  const [format, setFormat] = useState<ExportFormat>('xlsx');
  const [includeDuplicates, setIncludeDuplicates] = useState(false);

  const [districts, setDistricts] = useState<AreaOption[]>([]);
  const [dsDivisions, setDsDivisions] = useState<AreaOption[]>([]);
  const [gnDivisions, setGnDivisions] = useState<AreaOption[]>([]);

  const [selectedDistrictId, setSelectedDistrictId] = useState('');
  const [selectedDsId, setSelectedDsId] = useState('');
  const [selectedGnId, setSelectedGnId] = useState('');

  const [preview, setPreview] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [jobs, setJobs] = useState<any[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionMessage, setActionMessage] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  // Sync default report language to UI language when loaded
  useEffect(() => {
    if (uiLang === 'en' || uiLang === 'si' || uiLang === 'ta') {
      setReportLang(uiLang);
    }
  }, [uiLang]);

  const role = user?.role || '';
  const canViewDuplicates = role === 'cdc_secretary' || role === 'super_admin';
  const canSelectDistrict =
    role === 'super_admin' || role === 'admin' || role === 'cg';
  const canSelectDs = canSelectDistrict || role === 'dc';
  const canSelectGn = canSelectDs || role === 'sda';

  // Initialize fixed caller scope defaults
  useEffect(() => {
    if (!user) return;
    if (user.districtId && !canSelectDistrict) {
      setSelectedDistrictId(user.districtId);
    }
    if (user.dsId && !canSelectDs) {
      setSelectedDsId(user.dsId);
    }
    if (user.gnId && !canSelectGn) {
      setSelectedGnId(user.gnId);
    }
  }, [user, canSelectDistrict, canSelectDs, canSelectGn]);

  // Load district options if national scope
  useEffect(() => {
    if (!user || !canSelectDistrict) return;
    let active = true;
    api
      .getDistricts()
      .then((rows) => {
        if (!active) return;
        setDistricts(
          rows.map((r: any) => ({
            id: r.id,
            name:
              reportLang === 'si'
                ? r.nameSi || r.nameEn
                : reportLang === 'ta'
                  ? r.nameTa || r.nameEn
                  : r.nameEn,
          })),
        );
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [user, canSelectDistrict, reportLang]);

  // Load DS divisions when district is chosen or DC scope active
  useEffect(() => {
    const effectiveDistrict = selectedDistrictId || user?.districtId || '';
    if (!user || !canSelectDs || !effectiveDistrict) {
      setDsDivisions([]);
      return;
    }
    let active = true;
    api
      .getDsDivisions(effectiveDistrict)
      .then((rows) => {
        if (!active) return;
        setDsDivisions(
          rows.map((r: any) => ({
            id: r.id,
            name:
              reportLang === 'si'
                ? r.nameSi || r.nameEn
                : reportLang === 'ta'
                  ? r.nameTa || r.nameEn
                  : r.nameEn,
          })),
        );
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [user, canSelectDs, selectedDistrictId, reportLang]);

  // Load GN divisions when DS is chosen or SDA scope active
  useEffect(() => {
    const effectiveDs = selectedDsId || user?.dsId || '';
    if (!user || !canSelectGn || !effectiveDs) {
      setGnDivisions([]);
      return;
    }
    let active = true;
    api
      .getGnDivisions(effectiveDs)
      .then((rows) => {
        if (!active) return;
        setGnDivisions(
          rows.map((r: any) => ({
            id: r.id,
            name: `${r.gnNumber} - ${r.gnName}`,
          })),
        );
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [user, canSelectGn, selectedDsId]);

  const activeFilters = useMemo(() => {
    const filters: Record<string, any> = {};
    if (canSelectDistrict && selectedDistrictId) {
      filters.districtId = selectedDistrictId;
    }
    if (canSelectDs && selectedDsId) {
      filters.dsId = selectedDsId;
    }
    if (canSelectGn && selectedGnId) {
      filters.gnId = selectedGnId;
    }
    if (kind === 'clients' && includeDuplicates) {
      filters.includeDuplicates = true;
    }
    return filters;
  }, [
    canSelectDistrict,
    canSelectDs,
    canSelectGn,
    selectedDistrictId,
    selectedDsId,
    selectedGnId,
    kind,
    includeDuplicates,
  ]);

  const loadJobs = useCallback(async () => {
    if (!user) return;
    setJobsLoading(true);
    try {
      const res = await api.listExports({ limit: 15 });
      setJobs(res.items || []);
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: err?.message || 'Failed to load export jobs',
      });
    } finally {
      setJobsLoading(false);
    }
  }, [user]);

  const loadPreview = useCallback(async () => {
    if (!user) return;
    if (kind === 'clients') {
      setPreview(null);
      setPreviewError(null);
      return;
    }
    if (!PRINTABLE_KINDS.includes(kind)) return;

    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const data = await api.getReportPreview({
        kind,
        lang: reportLang,
        ...(canSelectDistrict && selectedDistrictId
          ? { districtId: selectedDistrictId }
          : {}),
        ...(canSelectDs && selectedDsId ? { dsId: selectedDsId } : {}),
        ...(canSelectGn && selectedGnId ? { gnId: selectedGnId } : {}),
      });
      setPreview(data);
    } catch (err: any) {
      setPreview(null);
      setPreviewError(err?.message || 'Failed to load report preview');
    } finally {
      setPreviewLoading(false);
    }
  }, [
    user,
    kind,
    reportLang,
    canSelectDistrict,
    canSelectDs,
    canSelectGn,
    selectedDistrictId,
    selectedDsId,
    selectedGnId,
  ]);

  useEffect(() => {
    if (!authLoading && user) {
      void loadJobs();
    }
  }, [authLoading, user, loadJobs]);

  useEffect(() => {
    if (!authLoading && user) {
      void loadPreview();
    }
  }, [authLoading, user, loadPreview]);

  // Auto-poll when any job is queued or running
  const hasPendingJob = jobs.some(
    (j) => j.status === 'queued' || j.status === 'running',
  );
  useEffect(() => {
    if (!hasPendingJob) return;
    const timer = setInterval(() => {
      void loadJobs();
    }, 4000);
    return () => clearInterval(timer);
  }, [hasPendingJob, loadJobs]);

  const handleGenerateExport = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setActionMessage(null);
    try {
      const created = await api.createExport({
        kind,
        format,
        lang: reportLang,
        filters: activeFilters,
      });
      await loadJobs();
      if (created.status === 'done' && created.signedUrl) {
        setActionMessage({
          type: 'success',
          text: `${t('reports.status_done')} (${created.rowCount ?? 0})`,
        });
      } else {
        setActionMessage({
          type: 'info',
          text: t('reports.worker_notice'),
        });
      }
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: err?.message || 'Export creation failed',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handlePrintPdf = () => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  const formatTimestamp = (iso?: string | null) => {
    if (!iso) return '—';
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return iso;
    return dt.toLocaleString(
      reportLang === 'si' ? 'si-LK' : reportLang === 'ta' ? 'ta-LK' : 'en-GB',
      { timeZone: 'Asia/Colombo' },
    );
  };

  const statusBadgeStyle = (status: string) => {
    if (status === 'done') {
      return {
        bg: 'var(--success-bg)',
        color: 'var(--success-text)',
        border: 'var(--success-border)',
      };
    }
    if (status === 'failed') {
      return {
        bg: 'var(--danger-bg)',
        color: 'var(--danger-text)',
        border: 'var(--danger-border)',
      };
    }
    if (status === 'expired') {
      return {
        bg: 'var(--bg-subtle)',
        color: 'var(--text-muted)',
        border: 'var(--border-default)',
      };
    }
    return {
      bg: 'var(--warning-bg)',
      color: 'var(--warning-text)',
      border: 'var(--warning-border)',
    };
  };

  return (
    <Shell activePath="/reports">
      <div className="page-container">
        {/* Header Bar */}
        <div
          className="no-print"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: '16px',
            marginBottom: '20px',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <FileSpreadsheet size={24} style={{ color: 'var(--primary)' }} />
              <h1 style={{ fontSize: '22px', fontWeight: 700 }}>
                {t('reports.title')}
              </h1>
            </div>
            <p className="text-muted" style={{ fontSize: '14px', marginTop: '4px' }}>
              {t('reports.subtitle')}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {kind !== 'clients' && (
              <button
                type="button"
                onClick={handlePrintPdf}
                disabled={previewLoading || !preview}
                className="btn-secondary"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '9px 14px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-strong)',
                  background: 'var(--bg-surface)',
                  cursor: preview ? 'pointer' : 'not-allowed',
                  fontWeight: 600,
                  fontSize: '13px',
                }}
              >
                <Printer size={16} />
                {t('reports.btn_print_pdf')}
              </button>
            )}
          </div>
        </div>

        {/* Report Configuration Form */}
        <form
          onSubmit={handleGenerateExport}
          className="panel no-print"
          style={{ padding: '18px 20px', marginBottom: '20px' }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
              gap: '14px',
            }}
          >
            <div>
              <label
                htmlFor="report-kind-select"
                style={{
                  display: 'block',
                  fontSize: '12px',
                  fontWeight: 600,
                  marginBottom: '6px',
                  color: 'var(--text-secondary)',
                }}
              >
                {t('reports.kind_label')}
              </label>
              <select
                id="report-kind-select"
                value={kind}
                onChange={(e) => setKind(e.target.value as ExportKind)}
                style={{
                  width: '100%',
                  padding: '9px 10px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-strong)',
                  background: 'var(--bg-surface)',
                  fontSize: '13px',
                }}
              >
                <option value="progress">{t('reports.kind_progress')}</option>
                <option value="clients">{t('reports.kind_clients')}</option>
                <option value="beneficiaries">
                  {t('reports.kind_beneficiaries')}
                </option>
                <option value="interests">{t('reports.kind_interests')}</option>
                {canViewDuplicates && (
                  <option value="duplicates">
                    {t('reports.kind_duplicates')}
                  </option>
                )}
              </select>
            </div>

            <div>
              <label
                htmlFor="report-lang-select"
                style={{
                  display: 'block',
                  fontSize: '12px',
                  fontWeight: 600,
                  marginBottom: '6px',
                  color: 'var(--text-secondary)',
                }}
              >
                {t('reports.lang_label')}
              </label>
              <select
                id="report-lang-select"
                value={reportLang}
                onChange={(e) => setReportLang(e.target.value as ReportLang)}
                style={{
                  width: '100%',
                  padding: '9px 10px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-strong)',
                  background: 'var(--bg-surface)',
                  fontSize: '13px',
                }}
              >
                <option value="en">{t('reports.lang_en')}</option>
                <option value="si">{t('reports.lang_si')}</option>
                <option value="ta">{t('reports.lang_ta')}</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="report-format-select"
                style={{
                  display: 'block',
                  fontSize: '12px',
                  fontWeight: 600,
                  marginBottom: '6px',
                  color: 'var(--text-secondary)',
                }}
              >
                {t('reports.format_label')}
              </label>
              <select
                id="report-format-select"
                value={format}
                onChange={(e) => setFormat(e.target.value as ExportFormat)}
                style={{
                  width: '100%',
                  padding: '9px 10px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-strong)',
                  background: 'var(--bg-surface)',
                  fontSize: '13px',
                }}
              >
                <option value="xlsx">{t('reports.format_xlsx')}</option>
                <option value="csv">{t('reports.format_csv')}</option>
              </select>
            </div>

            {canSelectDistrict && (
              <div>
                <label
                  htmlFor="report-district-select"
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 600,
                    marginBottom: '6px',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {t('reports.filter_district')}
                </label>
                <select
                  id="report-district-select"
                  value={selectedDistrictId}
                  onChange={(e) => {
                    setSelectedDistrictId(e.target.value);
                    setSelectedDsId('');
                    setSelectedGnId('');
                  }}
                  style={{
                    width: '100%',
                    padding: '9px 10px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-strong)',
                    background: 'var(--bg-surface)',
                    fontSize: '13px',
                  }}
                >
                  <option value="">{t('reports.filter_all')}</option>
                  {districts.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {canSelectDs && (
              <div>
                <label
                  htmlFor="report-ds-select"
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 600,
                    marginBottom: '6px',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {t('reports.filter_ds')}
                </label>
                <select
                  id="report-ds-select"
                  value={selectedDsId}
                  onChange={(e) => {
                    setSelectedDsId(e.target.value);
                    setSelectedGnId('');
                  }}
                  style={{
                    width: '100%',
                    padding: '9px 10px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-strong)',
                    background: 'var(--bg-surface)',
                    fontSize: '13px',
                  }}
                >
                  <option value="">{t('reports.filter_all')}</option>
                  {dsDivisions.map((ds) => (
                    <option key={ds.id} value={ds.id}>
                      {ds.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {canSelectGn && (
              <div>
                <label
                  htmlFor="report-gn-select"
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 600,
                    marginBottom: '6px',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {t('reports.filter_gn')}
                </label>
                <select
                  id="report-gn-select"
                  value={selectedGnId}
                  onChange={(e) => setSelectedGnId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 10px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-strong)',
                    background: 'var(--bg-surface)',
                    fontSize: '13px',
                  }}
                >
                  <option value="">{t('reports.filter_all')}</option>
                  {gnDivisions.map((gn) => (
                    <option key={gn.id} value={gn.id}>
                      {gn.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '12px',
              marginTop: '16px',
              paddingTop: '14px',
              borderTop: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              {kind === 'clients' && (
                <label
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={includeDuplicates}
                    onChange={(e) => setIncludeDuplicates(e.target.checked)}
                  />
                  {t('reports.include_duplicates')}
                </label>
              )}
              <span
                className="text-muted"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '12px',
                }}
              >
                <Info size={14} />
                {t('reports.b6_notice')}
              </span>
            </div>

            <button
              type="submit"
              disabled={submitting}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '9px 18px',
                borderRadius: '8px',
                border: 'none',
                background: 'var(--primary)',
                color: '#ffffff',
                fontWeight: 600,
                fontSize: '13px',
                cursor: submitting ? 'wait' : 'pointer',
              }}
            >
              {submitting ? (
                <Loader2 size={16} className="spin" />
              ) : (
                <Download size={16} />
              )}
              {submitting ? t('reports.btn_exporting') : t('reports.btn_export')}
            </button>
          </div>
        </form>

        {actionMessage && (
          <div
            className="panel no-print"
            style={{
              padding: '12px 16px',
              marginBottom: '18px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              fontSize: '13px',
              borderColor:
                actionMessage.type === 'error'
                  ? 'var(--danger-border)'
                  : actionMessage.type === 'success'
                    ? 'var(--success-border)'
                    : 'var(--info-border)',
              background:
                actionMessage.type === 'error'
                  ? 'var(--danger-bg)'
                  : actionMessage.type === 'success'
                    ? 'var(--success-bg)'
                    : 'var(--info-bg)',
            }}
          >
            {actionMessage.type === 'error' ? (
              <AlertCircle size={16} />
            ) : actionMessage.type === 'success' ? (
              <CheckCircle2 size={16} />
            ) : (
              <Clock size={16} />
            )}
            <span>{actionMessage.text}</span>
          </div>
        )}

        {/* M7.2 Print-Ready Report Sheet (PDF output via Browser Print / @media print) */}
        <section
          lang={reportLang}
          className={`panel printable-report-sheet lang-${reportLang}`}
          style={{ padding: '20px 22px', marginBottom: '22px' }}
        >
          <div
            className="no-print"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '14px',
            }}
          >
            <h2 style={{ fontSize: '15px', fontWeight: 700 }}>
              {t('reports.preview_section')}
            </h2>
            {kind !== 'clients' && (
              <button
                type="button"
                onClick={loadPreview}
                disabled={previewLoading}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 10px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-subtle)',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                <RefreshCw size={13} />
                {t('reports.btn_refresh_preview')}
              </button>
            )}
          </div>

          {kind === 'clients' ? (
            <div
              className="no-print"
              style={{
                padding: '18px',
                borderRadius: '8px',
                background: 'var(--bg-subtle)',
                fontSize: '13px',
                color: 'var(--text-secondary)',
              }}
            >
              {t('reports.r2_no_preview')}
            </div>
          ) : previewLoading ? (
            <div style={{ padding: '24px', textAlign: 'center' }}>
              <Loader2 size={22} className="spin" />
            </div>
          ) : previewError ? (
            <div
              style={{
                padding: '14px',
                color: 'var(--danger-text)',
                background: 'var(--danger-bg)',
                borderRadius: '6px',
                fontSize: '13px',
              }}
            >
              {previewError}
            </div>
          ) : preview ? (
            <div>
              {/* Official Print Header */}
              <div
                style={{
                  borderBottom: '2px solid #004d40',
                  paddingBottom: '12px',
                  marginBottom: '16px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-end',
                  gap: '12px',
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: '11px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      color: '#475569',
                      fontWeight: 600,
                    }}
                  >
                    {t('reports.print_gov_header')}
                  </div>
                  <div
                    style={{
                      fontSize: '17px',
                      fontWeight: 700,
                      color: '#0f172a',
                      marginTop: '2px',
                    }}
                  >
                    {preview.title}
                  </div>
                  <div style={{ fontSize: '12px', color: '#475569' }}>
                    {t('reports.print_campaign_title')}
                  </div>
                </div>
                <div style={{ textAlign: 'right', fontSize: '12px', color: '#475569' }}>
                  <div>
                    <strong>{t('reports.print_generated_at')}:</strong>{' '}
                    {preview.generatedAt}
                  </div>
                  <div>
                    <strong>{t('reports.print_language')}:</strong>{' '}
                    {reportLang.toUpperCase()}
                  </div>
                </div>
              </div>

              {/* KPI Summary Strip for R1/R3 */}
              {(kind === 'progress' || kind === 'beneficiaries') &&
                preview.summary && (
                  <>
                    <div
                      className="report-print-kpi-grid"
                      style={{
                        display: 'grid',
                        gridTemplateColumns:
                          'repeat(auto-fit, minmax(150px, 1fr))',
                        gap: '10px',
                        marginBottom: '16px',
                      }}
                    >
                      <div
                        className="report-print-kpi-card"
                        style={{
                          border: '1px solid var(--border-subtle)',
                          borderRadius: '8px',
                          padding: '10px 12px',
                          background: 'var(--bg-subtle)',
                        }}
                      >
                        <div className="text-muted" style={{ fontSize: '11px' }}>
                          {t('reports.summary_houses_assigned')}
                        </div>
                        <div
                          className="tabular-nums"
                          style={{ fontSize: '20px', fontWeight: 700 }}
                        >
                          {preview.summary.housesAssigned ?? 0}
                        </div>
                      </div>
                      <div
                        className="report-print-kpi-card"
                        style={{
                          border: '1px solid var(--border-subtle)',
                          borderRadius: '8px',
                          padding: '10px 12px',
                          background: 'var(--bg-subtle)',
                        }}
                      >
                        <div className="text-muted" style={{ fontSize: '11px' }}>
                          {t('reports.summary_houses_done')}
                        </div>
                        <div
                          className="tabular-nums"
                          style={{ fontSize: '20px', fontWeight: 700 }}
                        >
                          {preview.summary.housesDone ?? 0}{' '}
                          <span style={{ fontSize: '12px', fontWeight: 500 }}>
                            ({preview.summary.completionRate ?? 0}%)
                          </span>
                        </div>
                      </div>
                      <div
                        className="report-print-kpi-card"
                        style={{
                          border: '1px solid var(--border-subtle)',
                          borderRadius: '8px',
                          padding: '10px 12px',
                          background: 'var(--bg-subtle)',
                        }}
                      >
                        <div className="text-muted" style={{ fontSize: '11px' }}>
                          {t('reports.summary_clients')}
                        </div>
                        <div
                          className="tabular-nums"
                          style={{ fontSize: '20px', fontWeight: 700 }}
                        >
                          {preview.summary.clientsCount ?? 0}
                        </div>
                      </div>
                      <div
                        className="report-print-kpi-card"
                        style={{
                          border: '1px solid var(--border-subtle)',
                          borderRadius: '8px',
                          padding: '10px 12px',
                          background: 'var(--bg-subtle)',
                        }}
                      >
                        <div className="text-muted" style={{ fontSize: '11px' }}>
                          {t('reports.summary_samurdhi')} /{' '}
                          {t('reports.summary_aswesuma')}
                        </div>
                        <div
                          className="tabular-nums"
                          style={{ fontSize: '16px', fontWeight: 700 }}
                        >
                          {preview.summary.samurdhiCount ?? 0} /{' '}
                          {preview.summary.aswesumaCount ?? 0}
                        </div>
                      </div>
                    </div>

                    <div style={{ overflowX: 'auto' }}>
                      <table
                        className="data-table report-print-table"
                        style={{ width: '100%', borderCollapse: 'collapse' }}
                      >
                        <thead>
                          <tr>
                            <th align="left">{t('reports.tbl_level')}</th>
                            <th align="left">{t('reports.tbl_area')}</th>
                            <th align="right">{t('reports.tbl_houses')}</th>
                            <th align="right">{t('reports.tbl_done')}</th>
                            <th align="right">{t('reports.tbl_rate')}</th>
                            <th align="right">{t('reports.tbl_clients')}</th>
                            <th align="right">{t('reports.summary_epf')}</th>
                            <th align="right">{t('reports.summary_etf')}</th>
                            <th align="right">
                              {t('reports.summary_aswesuma')}
                            </th>
                            <th align="right">
                              {t('reports.summary_samurdhi')}
                            </th>
                            <th align="right">
                              {t('reports.summary_special_needs')}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {[preview.summary, ...(preview.rows || [])].map(
                            (row: any, idx: number) => (
                              <tr
                                key={`${row.areaId || idx}-${idx}`}
                                style={
                                  idx === 0
                                    ? {
                                      fontWeight: 700,
                                      background: 'var(--bg-subtle)',
                                    }
                                    : undefined
                                }
                              >
                                <td>{row.scopeLevel}</td>
                                <td>{row.areaName}</td>
                                <td className="numeric" align="right">
                                  {row.housesAssigned}
                                </td>
                                <td className="numeric" align="right">
                                  {row.housesDone}
                                </td>
                                <td className="numeric" align="right">
                                  {row.completionRate}%
                                </td>
                                <td className="numeric" align="right">
                                  {row.clientsCount}
                                </td>
                                <td className="numeric" align="right">
                                  {row.epfCount}
                                </td>
                                <td className="numeric" align="right">
                                  {row.etfCount}
                                </td>
                                <td className="numeric" align="right">
                                  {row.aswesumaCount}
                                </td>
                                <td className="numeric" align="right">
                                  {row.samurdhiCount}
                                </td>
                                <td className="numeric" align="right">
                                  {row.specialNeedsCount}
                                </td>
                              </tr>
                            ),
                          )}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}

              {/* R4 Interests Table */}
              {kind === 'interests' && (
                <div style={{ overflowX: 'auto' }}>
                  <p
                    className="text-muted"
                    style={{ fontSize: '12px', marginBottom: '10px' }}
                  >
                    {t('reports.summary_clients')}:{' '}
                    <strong className="tabular-nums">
                      {preview.totalClients ?? 0}
                    </strong>
                  </p>
                  <table
                    className="data-table report-print-table"
                    style={{ width: '100%', borderCollapse: 'collapse' }}
                  >
                    <thead>
                      <tr>
                        <th align="left">{t('reports.tbl_category')}</th>
                        <th align="left">{t('reports.tbl_code')}</th>
                        <th align="left">{t('reports.tbl_label')}</th>
                        <th align="right">{t('reports.tbl_clients')}</th>
                        <th align="right">{t('reports.tbl_share')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(preview.rows || []).map((r: any, i: number) => (
                        <tr key={`${r.category}-${r.code}-${i}`}>
                          <td>{r.categoryLabel}</td>
                          <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>
                            {r.code}
                          </td>
                          <td>{r.label}</td>
                          <td className="numeric" align="right">
                            {r.clientsCount}
                          </td>
                          <td className="numeric" align="right">
                            {r.sharePercent}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* R5 Duplicates Table */}
              {kind === 'duplicates' && (
                <div style={{ overflowX: 'auto' }}>
                  <table
                    className="data-table report-print-table"
                    style={{ width: '100%', borderCollapse: 'collapse' }}
                  >
                    <thead>
                      <tr>
                        <th align="right">{t('reports.tbl_score')}</th>
                        <th align="left">{t('reports.tbl_tier')}</th>
                        <th align="left">{t('reports.col_status')}</th>
                        <th align="left">{t('reports.tbl_client_a')}</th>
                        <th align="left">{t('reports.tbl_client_b')}</th>
                        <th align="left">{t('reports.tbl_signals')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(preview.rows || []).map((r: any) => (
                        <tr key={r.candidate_id}>
                          <td className="numeric" align="right">
                            {r.score}
                          </td>
                          <td>{r.classification}</td>
                          <td>{r.status}</td>
                          <td>
                            {r.client_a_name} ({r.client_a_house_no})
                          </td>
                          <td>
                            {r.client_b_name} ({r.client_b_house_no})
                          </td>
                          <td>{r.reasons}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Print-only B6 template footer */}
              <div
                className="print-only-footer"
                style={{
                  display: 'none',
                  marginTop: '18px',
                  paddingTop: '8px',
                  borderTop: '1px solid #cbd5e1',
                  fontSize: '10px',
                  color: '#64748b',
                }}
              >
                {t('reports.b6_notice')} · {preview.generatedAt}
              </div>
            </div>
          ) : null}
        </section>

        {/* Export Jobs History & Private 24h Signed URLs */}
        <section className="panel no-print" style={{ padding: '18px 20px' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '12px',
            }}
          >
            <h2 style={{ fontSize: '15px', fontWeight: 700 }}>
              {t('reports.jobs_section')}
            </h2>
            <button
              type="button"
              onClick={loadJobs}
              disabled={jobsLoading}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 10px',
                borderRadius: '6px',
                border: '1px solid var(--border-default)',
                background: 'var(--bg-subtle)',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              <RefreshCw size={13} />
              {t('reports.btn_refresh_preview')}
            </button>
          </div>

          {jobs.length === 0 ? (
            <p className="text-muted" style={{ fontSize: '13px' }}>
              {t('reports.jobs_empty')}
            </p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table
                className="data-table"
                style={{ width: '100%', borderCollapse: 'collapse' }}
              >
                <thead>
                  <tr>
                    <th align="left">{t('reports.col_kind')}</th>
                    <th align="left">{t('reports.col_format')}</th>
                    <th align="left">{t('reports.col_lang')}</th>
                    <th align="left">{t('reports.col_status')}</th>
                    <th align="left">{t('reports.col_created')}</th>
                    <th align="left">{t('reports.col_expires')}</th>
                    <th align="right">{t('reports.col_action')}</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((job) => {
                    const badge = statusBadgeStyle(job.status);
                    return (
                      <tr key={job.id}>
                        <td style={{ fontWeight: 600 }}>{job.kind}</td>
                        <td style={{ textTransform: 'uppercase' }}>
                          {job.format}
                        </td>
                        <td style={{ textTransform: 'uppercase' }}>
                          {job.lang}
                        </td>
                        <td>
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '2px 8px',
                              borderRadius: '9999px',
                              fontSize: '11px',
                              fontWeight: 600,
                              background: badge.bg,
                              color: badge.color,
                              border: `1px solid ${badge.border}`,
                            }}
                          >
                            {t(`reports.status_${job.status}`)}
                          </span>
                        </td>
                        <td style={{ fontSize: '12px' }}>
                          {formatTimestamp(job.createdAt)}
                        </td>
                        <td style={{ fontSize: '12px' }}>
                          {formatTimestamp(job.expiresAt)}
                        </td>
                        <td align="right">
                          {job.status === 'done' && job.signedUrl ? (
                            <a
                              href={job.signedUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '5px 10px',
                                borderRadius: '6px',
                                background: 'var(--primary)',
                                color: '#ffffff',
                                fontSize: '12px',
                                fontWeight: 600,
                                textDecoration: 'none',
                              }}
                            >
                              <Download size={13} />
                              {t('reports.download')}
                            </a>
                          ) : (
                            <span className="text-muted" style={{ fontSize: '12px' }}>
                              {job.error ? job.error : '—'}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </Shell>
  );
}

