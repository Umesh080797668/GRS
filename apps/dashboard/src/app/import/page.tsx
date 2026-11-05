'use client';

import { useState, useEffect, useRef } from 'react';
import { Shell } from '@/components/Shell';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import {
  getOfficialHouseholdTemplateCsv,
  downloadFile,
} from '@/lib/utils';
import {
  UploadCloud,
  Download,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Loader2,
  Sparkles,
  MapPin
} from 'lucide-react';

interface StagingRowView {
  rowNo: number;
  isValid: boolean;
  errors: string[];
  data: {
    houseNo: string;
    houseNoNorm: string;
    headName: string;
    address?: string;
    villageName?: string;
    isAswesuma?: boolean;
    isEtf?: boolean;
    isEpf?: boolean;
    isSamurdhi?: boolean;
    hasSpecialNeeds?: boolean;
    targetFemale?: number;
    targetMale?: number;
    ageGroupMin?: number | null;
    ageGroupMax?: number | null;
    langSinhala?: boolean;
    langTamil?: boolean;
    langEnglish?: boolean;
    numMembers?: number | null;
  };
}

export default function ImportPage() {
  const { t } = useLanguage();
  const { user } = useAuth();

  // Location selector for import
  const [districts, setDistricts] = useState<any[]>([]);
  const [dsDivisions, setDsDivisions] = useState<any[]>([]);
  const [gnDivisions, setGnDivisions] = useState<any[]>([]);
  const [selectedDistrict, setSelectedDistrict] = useState<string>('');
  const [selectedDs, setSelectedDs] = useState<string>('');
  const [selectedGn, setSelectedGn] = useState<string>('');

  // File & batch state
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [currentBatchId, setCurrentBatchId] = useState<string | null>(null);
  const [batchStatus, setBatchStatus] = useState<string | null>(null);
  const [rows, setRows] = useState<StagingRowView[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'valid' | 'errors'>('all');
  const [fileError, setFileError] = useState<string | null>(null);

  // Commit state
  const [committing, setCommitting] = useState(false);
  const [commitSuccess, setCommitSuccess] = useState<string | null>(null);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [isCommitted, setIsCommitted] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadDistricts();
  }, []);

  async function loadDistricts() {
    try {
      const data = await api.getDistricts();
      setDistricts(data);
      if (data.length > 0) {
        const initialDist = user?.districtId || data[0].id;
        setSelectedDistrict(initialDist);
        loadDs(initialDist);
      }
    } catch (err: any) {
      console.error(err);
    }
  }

  async function loadDs(districtId: string) {
    try {
      const data = await api.getDsDivisions(districtId);
      setDsDivisions(data);
      if (data.length > 0) {
        const initialDs = user?.dsId || data[0].id;
        setSelectedDs(initialDs);
        loadGns(initialDs);
      } else {
        setSelectedDs('');
        setGnDivisions([]);
        setSelectedGn('');
      }
    } catch (err: any) {
      console.error(err);
    }
  }

  async function loadGns(dsId: string) {
    try {
      const data = await api.getGnDivisions(dsId);
      setGnDivisions(data);
      if (data.length > 0) {
        const initialGn = user?.gnId || data[0].id;
        setSelectedGn(initialGn);
      } else {
        setSelectedGn('');
      }
    } catch (err: any) {
      console.error(err);
    }
  }

  async function handleFileSelected(selectedFile: File) {
    setFileError(null);
    setCommitSuccess(null);
    setCommitError(null);
    setIsCommitted(false);
    setCurrentBatchId(null);
    setRows([]);

    if (!selectedGn) {
      setFileError('Please select a target GN Division before uploading.');
      return;
    }

    // Check 4.5 MB cap (decimal 4,500,000 bytes so app reject precedes proxy upload errors)
    const MAX_SIZE_BYTES = 4.5 * 1000 * 1000;
    if (selectedFile.size > MAX_SIZE_BYTES) {
      setFileError(
        `File size ${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB exceeds the maximum 4.5 MB upload threshold.`
      );
      setFile(null);
      return;
    }

    setFile(selectedFile);
    await uploadAndPreviewFile(selectedFile);
  }

  async function uploadAndPreviewFile(f: File) {
    setUploading(true);
    setFileError(null);
    try {
      const res = await api.previewImport(selectedGn, f);
      setCurrentBatchId(res.batchId);
      setBatchStatus(res.status);
      setRows(res.rows || []);
    } catch (err: any) {
      setFileError(err.message || 'Failed to parse and preview spreadsheet.');
      setCurrentBatchId(null);
      setRows([]);
    } finally {
      setUploading(false);
    }
  }

  function handleDownloadTemplate() {
    const csv = getOfficialHouseholdTemplateCsv();
    downloadFile(csv, 'grs_household_import_template.csv');
  }

  async function handleDownloadErrorReport() {
    if (!currentBatchId) return;
    try {
      const csv = await api.downloadImportErrors(currentBatchId);
      downloadFile(csv, `household_import_errors_${currentBatchId}.csv`);
    } catch (err: any) {
      setFileError(`Failed to download error report: ${err.message}`);
    }
  }

  async function handleCommitValidRows() {
    if (!currentBatchId) {
      setCommitError('No active import preview to commit.');
      return;
    }

    if (isCommitted) {
      setCommitError('This batch has already been committed.');
      return;
    }

    const validRowsCount = rows.filter((r) => r.isValid).length;
    if (validRowsCount === 0) {
      setCommitError('There are no valid rows to commit in this batch.');
      return;
    }

    setCommitting(true);
    setCommitSuccess(null);
    setCommitError(null);

    try {
      const result = await api.confirmImport(currentBatchId);
      setCommitSuccess(
        `Successfully committed all ${result.committedCount} valid households to the designated GN division!`
      );
      setIsCommitted(true);
      setBatchStatus('committed');
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err: any) {
      setCommitError(err.message || 'Failed to commit import batch.');
    } finally {
      setCommitting(false);
    }
  }

  const validRowsCount = rows.filter((r) => r.isValid).length;
  const errorRowsCount = rows.filter((r) => !r.isValid).length;
  const filteredRows =
    activeTab === 'valid'
      ? rows.filter((r) => r.isValid)
      : activeTab === 'errors'
        ? rows.filter((r) => !r.isValid)
        : rows;

  return (
    <Shell activePath="/import">
      {/* Title & Actions */}
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
            {t('import.title')}
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--slate-500)', marginTop: '4px' }}>
            Server-side preview and atomic confirmation for GN household rosters with 4.5 MB hosting cap.
          </p>
        </div>

        <button
          type="button"
          onClick={handleDownloadTemplate}
          className="btn-secondary"
        >
          <Download size={15} style={{ color: 'var(--primary)' }} />
          <span>{t('import.download_template')}</span>
        </button>
      </div>

      {/* Target Location Card */}
      <div className="panel" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--slate-700)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <MapPin size={15} style={{ color: 'var(--primary)' }} />
          <span>Target GN Division Assignment</span>
        </h2>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1rem',
          }}
        >
          <div>
            <label className="form-label">District</label>
            <select
              className="select-field"
              value={selectedDistrict}
              onChange={(e) => {
                setSelectedDistrict(e.target.value);
                loadDs(e.target.value);
              }}
              disabled={user?.role === 'cdc_secretary'}
            >
              {districts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nameEn} ({d.code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="form-label">DS Division</label>
            <select
              className="select-field"
              value={selectedDs}
              onChange={(e) => {
                setSelectedDs(e.target.value);
                loadGns(e.target.value);
              }}
              disabled={dsDivisions.length === 0 || user?.role === 'cdc_secretary'}
            >
              {dsDivisions.map((ds) => (
                <option key={ds.id} value={ds.id}>
                  {ds.nameEn} ({ds.code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="form-label">GN Division</label>
            <select
              className="select-field"
              value={selectedGn}
              onChange={(e) => setSelectedGn(e.target.value)}
              disabled={gnDivisions.length === 0 || user?.role === 'cdc_secretary'}
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

      {/* File Drag and Drop Zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFileSelected(e.dataTransfer.files[0]);
          }
        }}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${isDragging ? 'var(--primary)' : 'var(--slate-300)'}`,
          background: isDragging ? 'var(--primary-subtle)' : '#ffffff',
          borderRadius: 'var(--radius-lg)',
          padding: '2.5rem 1.5rem',
          textAlign: 'center',
          cursor: 'pointer',
          transition: 'all 0.15s ease',
          marginBottom: '1.5rem',
          boxShadow: 'var(--shadow-xs)',
        }}
      >
        <input
          type="file"
          ref={fileInputRef}
          style={{ display: 'none' }}
          accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
          onChange={(e) => {
            if (e.target.files && e.target.files[0]) {
              handleFileSelected(e.target.files[0]);
            }
          }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
          <div
            style={{
              width: '52px',
              height: '52px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--primary-subtle)',
              color: 'var(--primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <UploadCloud size={26} />
          </div>
          <div>
            <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--slate-900)' }}>
              {file ? file.name : t('import.drop_hint')}
            </p>
            <p style={{ fontSize: '12px', color: 'var(--slate-500)', marginTop: '4px' }}>
              Supported formats: XLSX, XLS, CSV. Enforcing 4.5 MB upload limit with server-side staging.
            </p>
          </div>
          {file && (
            <span className="badge badge-info" style={{ marginTop: '4px' }}>
              {(file.size / 1024).toFixed(1)} KB
            </span>
          )}
        </div>
      </div>

      {/* Notifications */}
      {fileError && (
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
          <AlertTriangle size={18} style={{ flexShrink: 0 }} />
          <span>{fileError}</span>
        </div>
      )}

      {commitError && (
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
          <AlertTriangle size={18} style={{ flexShrink: 0 }} />
          <span>{commitError}</span>
        </div>
      )}

      {commitSuccess && (
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
          <span>{commitSuccess}</span>
        </div>
      )}

      {/* Uploading Indicator */}
      {uploading && (
        <div
          className="panel"
          style={{
            padding: '1.75rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            color: 'var(--slate-600)',
            marginBottom: '1.5rem',
          }}
        >
          <Loader2 size={18} className="animate-spin" style={{ color: 'var(--primary)' }} />
          <span style={{ fontSize: '13.5px', fontWeight: 500 }}>Uploading to server staging and validating rows...</span>
        </div>
      )}

      {/* Parsed Rows Summary & Action Bar */}
      {rows.length > 0 && !uploading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Summary Metric Tabs */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '1rem',
            }}
          >
            <div
              onClick={() => setActiveTab('all')}
              className="panel"
              style={{
                padding: '1rem 1.25rem',
                cursor: 'pointer',
                borderColor: activeTab === 'all' ? 'var(--primary)' : 'var(--border-subtle)',
                background: activeTab === 'all' ? 'var(--primary-subtle)' : '#ffffff',
                transition: 'all 0.12s ease',
              }}
            >
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--slate-500)', textTransform: 'uppercase' }}>
                {t('import.total_rows')}
              </div>
              <div className="tabular-nums" style={{ fontSize: '24px', fontWeight: 700, color: 'var(--slate-900)', marginTop: '4px' }}>
                {rows.length}
              </div>
            </div>

            <div
              onClick={() => setActiveTab('valid')}
              className="panel"
              style={{
                padding: '1rem 1.25rem',
                cursor: 'pointer',
                borderColor: activeTab === 'valid' ? 'var(--success)' : 'var(--border-subtle)',
                background: activeTab === 'valid' ? 'var(--success-bg)' : '#ffffff',
                transition: 'all 0.12s ease',
              }}
            >
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--success)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <CheckCircle size={14} />
                <span>{t('import.valid_rows')}</span>
              </div>
              <div className="tabular-nums" style={{ fontSize: '24px', fontWeight: 700, color: 'var(--success-text)', marginTop: '4px' }}>
                {validRowsCount}
              </div>
            </div>

            <div
              onClick={() => setActiveTab('errors')}
              className="panel"
              style={{
                padding: '1rem 1.25rem',
                cursor: 'pointer',
                borderColor: activeTab === 'errors' ? 'var(--danger)' : 'var(--border-subtle)',
                background: activeTab === 'errors' ? 'var(--danger-bg)' : '#ffffff',
                transition: 'all 0.12s ease',
              }}
            >
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--danger-text)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <XCircle size={14} />
                <span>{t('import.invalid_rows')}</span>
              </div>
              <div className="tabular-nums" style={{ fontSize: '24px', fontWeight: 700, color: 'var(--danger-text)', marginTop: '4px' }}>
                {errorRowsCount}
              </div>
            </div>
          </div>

          {/* Action Bar */}
          <div
            className="panel"
            style={{
              padding: '1rem 1.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px',
              background: 'var(--slate-50)',
            }}
          >
            <div style={{ fontSize: '13.5px', color: 'var(--slate-700)' }}>
              {isCommitted ? (
                <span style={{ color: 'var(--success-text)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckCircle size={16} /> Batch committed to database.
                </span>
              ) : (
                <span>
                  Ready to commit <strong style={{ color: 'var(--success-text)', fontWeight: 700 }}>{validRowsCount}</strong> valid households via atomic preview/confirm.
                </span>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {errorRowsCount > 0 && (
                <button
                  type="button"
                  onClick={handleDownloadErrorReport}
                  className="btn-secondary"
                  style={{ fontSize: '12.5px', color: 'var(--danger-text)' }}
                >
                  <Download size={14} />
                  <span>{t('import.download_errors')}</span>
                </button>
              )}

              {!isCommitted && (
                <button
                  type="button"
                  onClick={handleCommitValidRows}
                  disabled={validRowsCount === 0 || committing}
                  className="btn-primary"
                  style={{ fontSize: '13px' }}
                >
                  {committing ? (
                    <>
                      <Loader2 size={15} className="animate-spin" />
                      <span>Committing atomic batch...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={15} />
                      <span>Confirm Import ({validRowsCount} Rows)</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Staging Rows Table */}
          <div className="panel" style={{ overflow: 'hidden' }}>
            <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: '45px' }}>#</th>
                    <th>House No</th>
                    <th>Head of Household</th>
                    <th>Address / Village</th>
                    <th>Welfare</th>
                    <th>Targets / Age</th>
                    <th>Languages</th>
                    <th>Status</th>
                    <th>Validation Note</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.slice(0, 100).map((r) => {
                    const d = r.data;
                    return (
                      <tr
                        key={r.rowNo}
                        style={{
                          background: !r.isValid ? '#fff5f5' : 'transparent',
                        }}
                      >
                        <td style={{ color: 'var(--slate-400)', fontFamily: 'monospace' }}>{r.rowNo}</td>
                        <td style={{ fontWeight: 600, color: 'var(--slate-900)', fontFamily: 'monospace' }}>
                          {d.houseNo || '—'}
                          {d.houseNoNorm && d.houseNoNorm !== d.houseNo && (
                            <span style={{ fontSize: '10px', color: 'var(--slate-400)', display: 'block' }}>
                              Norm: {d.houseNoNorm}
                            </span>
                          )}
                        </td>
                        <td style={{ fontWeight: 600, color: 'var(--slate-900)' }}>{d.headName || '—'}</td>
                        <td style={{ fontSize: '12.5px', color: 'var(--slate-500)' }}>
                          {d.address} {d.villageName ? `(${d.villageName})` : ''}
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                            {d.isEpf && <span className="badge badge-info" style={{ fontSize: '9px', padding: '1px 4px' }}>EPF</span>}
                            {d.isEtf && <span className="badge badge-info" style={{ fontSize: '9px', padding: '1px 4px' }}>ETF</span>}
                            {d.isSamurdhi && <span className="badge badge-info" style={{ fontSize: '9px', padding: '1px 4px' }}>Samurdhi</span>}
                            {d.isAswesuma && <span className="badge badge-info" style={{ fontSize: '9px', padding: '1px 4px' }}>Aswesuma</span>}
                            {d.hasSpecialNeeds && <span className="badge badge-warning" style={{ fontSize: '9px', padding: '1px 4px' }}>Special</span>}
                            {!d.isEpf && !d.isEtf && !d.isSamurdhi && !d.isAswesuma && !d.hasSpecialNeeds && (
                              <span style={{ color: 'var(--slate-400)' }}>—</span>
                            )}
                          </div>
                        </td>
                        <td style={{ fontSize: '12px', color: 'var(--slate-600)' }}>
                          <span>F:{d.targetFemale || 0} / M:{d.targetMale || 0}</span>
                          {(d.ageGroupMin || d.ageGroupMax) && (
                            <span style={{ fontSize: '10.5px', color: 'var(--slate-400)', display: 'block' }}>
                              Age: {d.ageGroupMin ?? '?'}-{d.ageGroupMax ?? '?'}
                            </span>
                          )}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '4px', fontSize: '11px', fontWeight: 600 }}>
                            {d.langSinhala && <span style={{ color: 'var(--primary)' }}>SI</span>}
                            {d.langTamil && <span style={{ color: 'var(--warning)' }}>TA</span>}
                            {d.langEnglish && <span style={{ color: '#0284c7' }}>EN</span>}
                            {!d.langSinhala && !d.langTamil && !d.langEnglish && <span style={{ color: 'var(--slate-400)' }}>—</span>}
                          </div>
                        </td>
                        <td>
                          {r.isValid ? (
                            <span className="badge badge-success">
                              <CheckCircle size={12} />
                              <span>Valid</span>
                            </span>
                          ) : (
                            <span className="badge badge-danger">
                              <XCircle size={12} />
                              <span>Error</span>
                            </span>
                          )}
                        </td>
                        <td>
                          {r.errors && r.errors.length > 0 ? (
                            <span style={{ color: 'var(--danger-text)', fontWeight: 500, fontSize: '12px' }}>
                              {r.errors.join('; ')}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--slate-400)', fontSize: '12px' }}>Ready to commit</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {filteredRows.length > 100 && (
              <div style={{ padding: '0.75rem', fontSize: '12px', textAlign: 'center', color: 'var(--slate-500)', borderTop: '1px solid var(--border-subtle)' }}>
                Showing first 100 of {filteredRows.length} rows for optimal performance.
              </div>
            )}
          </div>
        </div>
      )}
    </Shell>
  );
}
