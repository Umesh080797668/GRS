'use client';

import { useState, useEffect, useRef } from 'react';
import { Shell } from '@/components/Shell';
import { useLanguage } from '@/context/LanguageContext';
import { api } from '@/lib/api';
import {
  getOfficialHouseholdTemplateCsv,
  downloadFile,
} from '@/lib/utils';
import {
  UploadCloud,
  FileSpreadsheet,
  Download,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Loader2,
  Sparkles,
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
        setSelectedDistrict(data[0].id);
        loadDs(data[0].id);
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
        setSelectedDs(data[0].id);
        loadGns(data[0].id);
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
        setSelectedGn(data[0].id);
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
      // Server-side preview/confirm parsed with patched library
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
      // Clear file and file input so clicking again cannot re-post
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err: any) {
      // On partial failure or error: show error banner (NOT success banner!) and prevent re-posts
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
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
              <FileSpreadsheet className="w-7 h-7 text-emerald-400" />
              {t('import.title')}
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Server-side preview and atomic confirmation for GN household rosters with 4.5 MB hosting cap.
            </p>
          </div>
          <button
            onClick={handleDownloadTemplate}
            className="btn btn-secondary flex items-center gap-2 text-sm"
          >
            <Download className="w-4 h-4 text-emerald-400" />
            {t('import.download_template')}
          </button>
        </div>

        {/* Location Target Selection */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300 mb-3 flex items-center gap-2">
            Target GN Division Assignment
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-xs text-slate-400 block mb-1">District</label>
              <select
                className="input text-sm"
                value={selectedDistrict}
                onChange={(e) => {
                  setSelectedDistrict(e.target.value);
                  loadDs(e.target.value);
                }}
              >
                {districts.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nameEn} ({d.code})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">DS Division</label>
              <select
                className="input text-sm"
                value={selectedDs}
                onChange={(e) => {
                  setSelectedDs(e.target.value);
                  loadGns(e.target.value);
                }}
                disabled={dsDivisions.length === 0}
              >
                {dsDivisions.map((ds) => (
                  <option key={ds.id} value={ds.id}>
                    {ds.nameEn} ({ds.code})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">GN Division</label>
              <select
                className="input text-sm"
                value={selectedGn}
                onChange={(e) => setSelectedGn(e.target.value)}
                disabled={gnDivisions.length === 0}
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
          className={`card border-2 border-dashed p-8 text-center cursor-pointer transition-all ${isDragging
            ? 'border-emerald-500 bg-emerald-500/10'
            : 'border-slate-700 hover:border-slate-500 bg-slate-900/40'
            }`}
        >
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleFileSelected(e.target.files[0]);
              }
            }}
          />
          <div className="flex flex-col items-center justify-center space-y-3">
            <div className="w-14 h-14 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400">
              <UploadCloud className="w-7 h-7" />
            </div>
            <div>
              <p className="text-base font-medium text-slate-200">
                {file ? file.name : t('import.drop_hint')}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Supported formats: XLSX, XLS, CSV. Enforcing 4.5 MB upload limit with server-side staging.
              </p>
            </div>
            {file && (
              <span className="badge badge-info">
                {(file.size / 1024).toFixed(1)} KB
              </span>
            )}
          </div>
        </div>

        {/* Error notification */}
        {fileError && (
          <div className="card border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <span>{fileError}</span>
          </div>
        )}

        {/* Commit error notification */}
        {commitError && (
          <div className="card border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <span>{commitError}</span>
          </div>
        )}

        {/* Commit success notification */}
        {commitSuccess && (
          <div className="card border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-300 flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
            <span>{commitSuccess}</span>
          </div>
        )}

        {/* Uploading & Parsing Indicator */}
        {uploading && (
          <div className="card p-6 flex items-center justify-center gap-3 text-slate-300">
            <Loader2 className="w-5 h-5 animate-spin text-emerald-400" />
            <span>Uploading to server staging and validating rows...</span>
          </div>
        )}

        {/* Parsed Rows Summary & Action Bar */}
        {rows.length > 0 && !uploading && (
          <div className="space-y-4">
            {/* KPI pill cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div
                onClick={() => setActiveTab('all')}
                className={`card p-4 cursor-pointer transition-all ${activeTab === 'all' ? 'ring-2 ring-blue-500' : ''
                  }`}
              >
                <div className="text-xs uppercase text-slate-400">{t('import.total_rows')}</div>
                <div className="text-2xl font-bold text-white mt-1">{rows.length}</div>
              </div>
              <div
                onClick={() => setActiveTab('valid')}
                className={`card p-4 cursor-pointer transition-all ${activeTab === 'valid' ? 'ring-2 ring-emerald-500' : ''
                  }`}
              >
                <div className="text-xs uppercase text-emerald-400 flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5" />
                  {t('import.valid_rows')}
                </div>
                <div className="text-2xl font-bold text-emerald-400 mt-1">{validRowsCount}</div>
              </div>
              <div
                onClick={() => setActiveTab('errors')}
                className={`card p-4 cursor-pointer transition-all ${activeTab === 'errors' ? 'ring-2 ring-red-500' : ''
                  }`}
              >
                <div className="text-xs uppercase text-red-400 flex items-center gap-1">
                  <XCircle className="w-3.5 h-3.5" />
                  {t('import.invalid_rows')}
                </div>
                <div className="text-2xl font-bold text-red-400 mt-1">{errorRowsCount}</div>
              </div>
            </div>

            {/* Action Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 card">
              <div className="text-sm text-slate-300">
                {isCommitted ? (
                  <span className="text-emerald-400 font-semibold flex items-center gap-1.5">
                    <CheckCircle className="w-4 h-4" /> Batch committed to database.
                  </span>
                ) : (
                  <>
                    Ready to commit <strong className="text-emerald-400">{validRowsCount}</strong> valid households via atomic preview/confirm.
                  </>
                )}
              </div>
              <div className="flex items-center gap-3">
                {errorRowsCount > 0 && (
                  <button
                    onClick={handleDownloadErrorReport}
                    className="btn btn-secondary flex items-center gap-2 text-xs"
                  >
                    <Download className="w-3.5 h-3.5 text-red-400" />
                    {t('import.download_errors')}
                  </button>
                )}
                {!isCommitted && (
                  <button
                    onClick={handleCommitValidRows}
                    disabled={validRowsCount === 0 || committing}
                    className="btn btn-primary flex items-center gap-2 text-sm"
                  >
                    {committing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Committing atomic batch...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        Confirm Import ({validRowsCount} Rows)
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* Table of Rows */}
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="table w-full text-left text-xs">
                  <thead>
                    <tr>
                      <th className="w-12">#</th>
                      <th>House No</th>
                      <th>Head of Household</th>
                      <th>Address / Village</th>
                      <th>Welfare (EPF/ETF/Asw/Sam)</th>
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
                          className={!r.isValid ? 'bg-red-500/5 hover:bg-red-500/10' : ''}
                        >
                          <td className="text-slate-400 font-mono">{r.rowNo}</td>
                          <td className="font-semibold text-white">
                            {d.houseNo || '-'}
                            {d.houseNoNorm && d.houseNoNorm !== d.houseNo && (
                              <span className="text-[10px] text-slate-500 block">Norm: {d.houseNoNorm}</span>
                            )}
                          </td>
                          <td className="text-slate-200">{d.headName || '-'}</td>
                          <td className="text-slate-400">
                            {d.address} {d.villageName ? `(${d.villageName})` : ''}
                          </td>
                          <td>
                            <div className="flex flex-wrap gap-1">
                              {d.isEpf && <span className="badge badge-info text-[9px]">EPF</span>}
                              {d.isEtf && <span className="badge badge-info text-[9px]">ETF</span>}
                              {d.isSamurdhi && <span className="badge badge-info text-[9px]">Samurdhi</span>}
                              {d.isAswesuma && <span className="badge badge-info text-[9px]">Aswesuma</span>}
                              {d.hasSpecialNeeds && <span className="badge badge-warning text-[9px]">Special</span>}
                              {!d.isEpf && !d.isEtf && !d.isSamurdhi && !d.isAswesuma && !d.hasSpecialNeeds && (
                                <span className="text-slate-600">-</span>
                              )}
                            </div>
                          </td>
                          <td className="text-slate-300">
                            <span>F:{d.targetFemale || 0} / M:{d.targetMale || 0}</span>
                            {(d.ageGroupMin || d.ageGroupMax) && (
                              <span className="text-slate-500 block text-[10px]">
                                Age: {d.ageGroupMin ?? '?'}-{d.ageGroupMax ?? '?'}
                              </span>
                            )}
                          </td>
                          <td>
                            <div className="flex gap-1">
                              {d.langSinhala && <span className="text-emerald-400">SI</span>}
                              {d.langTamil && <span className="text-amber-400">TA</span>}
                              {d.langEnglish && <span className="text-sky-400">EN</span>}
                              {!d.langSinhala && !d.langTamil && !d.langEnglish && <span className="text-slate-600">-</span>}
                            </div>
                          </td>
                          <td>
                            {r.isValid ? (
                              <span className="badge badge-success flex items-center gap-1 w-fit">
                                <CheckCircle className="w-3 h-3" /> Valid
                              </span>
                            ) : (
                              <span className="badge badge-danger flex items-center gap-1 w-fit">
                                <XCircle className="w-3 h-3" /> Error
                              </span>
                            )}
                          </td>
                          <td>
                            {r.errors && r.errors.length > 0 ? (
                              <span className="text-red-400 font-medium">{r.errors.join('; ')}</span>
                            ) : (
                              <span className="text-slate-500">Ready to commit</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {filteredRows.length > 100 && (
                <div className="p-3 text-xs text-center text-slate-400 border-t border-slate-800">
                  Showing first 100 of {filteredRows.length} rows for browser performance.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}
