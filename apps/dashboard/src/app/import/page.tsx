'use client';

import { useState, useEffect, useRef } from 'react';
import { Shell } from '@/components/Shell';
import { useLanguage } from '@/context/LanguageContext';
import { api } from '@/lib/api';
import {
  getOfficialHouseholdTemplateCsv,
  sanitizeCsvCell,
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
} from 'lucide-react';
import * as XLSX from 'xlsx';


interface ParsedHouseholdRow {
  rowNumber: number;
  houseNo: string;
  headName: string;
  address: string;
  village: string;
  numMembers?: number;
  samurdhi?: boolean;
  aswesuma?: boolean;
  specialNeeds?: boolean;
  isValid: boolean;
  errorReason?: string;
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

  // File & parsing state
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [rows, setRows] = useState<ParsedHouseholdRow[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'valid' | 'errors'>('all');
  const [fileError, setFileError] = useState<string | null>(null);

  // Commit state
  const [committing, setCommitting] = useState(false);
  const [commitProgress, setCommitProgress] = useState<{ current: number; total: number } | null>(null);
  const [commitSuccess, setCommitSuccess] = useState<string | null>(null);

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

  function handleFileSelected(selectedFile: File) {
    setFileError(null);
    setCommitSuccess(null);
    setRows([]);

    // Check 4.5 MB cap (M5.4 Done When)
    const MAX_SIZE_BYTES = 4.5 * 1024 * 1024;
    if (selectedFile.size > MAX_SIZE_BYTES) {
      setFileError(
        `File size ${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB exceeds the maximum 4.5 MB threshold.`
      );
      setFile(null);
      return;
    }

    setFile(selectedFile);
    parseFile(selectedFile);
  }

  function parseFile(f: File) {
    setParsing(true);

    const isExcel = f.name.endsWith('.xlsx') || f.name.endsWith('.xls');

    if (isExcel) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const buffer = e.target?.result as ArrayBuffer;
          if (!buffer) {
            setFileError('File is empty.');
            setParsing(false);
            return;
          }

          const workbook = XLSX.read(buffer, { type: 'array' });
          const firstSheet = workbook.SheetNames[0];
          const rawRows: any[][] = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], { header: 1 });

          if (!rawRows || rawRows.length < 2) {
            setFileError('File must contain at least a header row and one data row.');
            setParsing(false);
            return;
          }

          processRows(rawRows);
        } catch (err: any) {
          setFileError(`Failed to parse Excel file: ${err.message}`);
        } finally {
          setParsing(false);
        }
      };
      reader.onerror = () => {
        setFileError('Error reading file.');
        setParsing(false);
      };
      reader.readAsArrayBuffer(f);
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = e.target?.result as string;
          if (!text) {
            setFileError('File is empty.');
            setParsing(false);
            return;
          }

          const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
          if (lines.length < 2) {
            setFileError('File must contain at least a header row and one data row.');
            setParsing(false);
            return;
          }

          const rawRows: string[][] = lines.map((line) => {
            const cols: string[] = [];
            let current = '';
            let inQuotes = false;
            for (let charIdx = 0; charIdx < line.length; charIdx++) {
              const char = line[charIdx];
              if (char === '"') {
                inQuotes = !inQuotes;
              } else if (char === ',' && !inQuotes) {
                cols.push(current.trim());
                current = '';
              } else {
                current += char;
              }
            }
            cols.push(current.trim());
            return cols;
          });

          processRows(rawRows);
        } catch (err: any) {
          setFileError(`Failed to parse CSV file: ${err.message}`);
        } finally {
          setParsing(false);
        }
      };
      reader.onerror = () => {
        setFileError('Error reading file.');
        setParsing(false);
      };
      reader.readAsText(f);
    }
  }

  function processRows(rawRows: any[][]) {
    const headers = (rawRows[0] || []).map((h: any) =>
      String(h || '').trim().toLowerCase().replace(/"/g, '')
    );

    const houseNoIdx = headers.findIndex((h: string) => h.includes('house_no') || h.includes('houseno') || h.includes('house'));
    const headIdx = headers.findIndex((h: string) => h.includes('head') || h.includes('leader') || h.includes('name'));
    const addrIdx = headers.findIndex((h: string) => h.includes('addr'));
    const villageIdx = headers.findIndex((h: string) => h.includes('village'));
    const membersIdx = headers.findIndex((h: string) => h.includes('member'));
    const samurdhiIdx = headers.findIndex((h: string) => h.includes('samurdhi'));
    const aswesumaIdx = headers.findIndex((h: string) => h.includes('aswesuma'));
    const specialIdx = headers.findIndex((h: string) => h.includes('special'));

    if (houseNoIdx === -1 || headIdx === -1) {
      setFileError('Invalid headers: Missing required columns "house_no" or "household_head".');
      return;
    }

    const parsedRows: ParsedHouseholdRow[] = [];
    const seenHouseNos = new Set<string>();

    for (let i = 1; i < rawRows.length; i++) {
      const cols = rawRows[i];
      if (!cols || cols.length === 0 || cols.every((c) => c === undefined || c === null || String(c).trim() === '')) {
        continue;
      }

      const houseNo = String(cols[houseNoIdx] ?? '').replace(/"/g, '').trim();
      const headName = String(cols[headIdx] ?? '').replace(/"/g, '').trim();
      const address = addrIdx !== -1 ? String(cols[addrIdx] ?? '').replace(/"/g, '').trim() : '';
      const village = villageIdx !== -1 ? String(cols[villageIdx] ?? '').replace(/"/g, '').trim() : '';
      const numMembersStr = membersIdx !== -1 ? String(cols[membersIdx] ?? '').replace(/"/g, '').trim() : '';
      const samurdhiStr = samurdhiIdx !== -1 ? String(cols[samurdhiIdx] ?? '').replace(/"/g, '').trim().toLowerCase() : '';
      const aswesumaStr = aswesumaIdx !== -1 ? String(cols[aswesumaIdx] ?? '').replace(/"/g, '').trim().toLowerCase() : '';
      const specialStr = specialIdx !== -1 ? String(cols[specialIdx] ?? '').replace(/"/g, '').trim().toLowerCase() : '';

      let isValid = true;
      let errorReason = '';

      if (!houseNo) {
        isValid = false;
        errorReason = 'Missing House Number.';
      } else if (!headName) {
        isValid = false;
        errorReason = 'Missing Household Head Name.';
      } else if (seenHouseNos.has(houseNo.toLowerCase())) {
        isValid = false;
        errorReason = `Duplicate House Number "${houseNo}" detected within file.`;
      } else {
        seenHouseNos.add(houseNo.toLowerCase());
      }

      parsedRows.push({
        rowNumber: i + 1,
        houseNo,
        headName,
        address,
        village,
        numMembers: parseInt(numMembersStr, 10) || undefined,
        samurdhi: samurdhiStr === 'yes' || samurdhiStr === 'true' || samurdhiStr === '1',
        aswesuma: aswesumaStr === 'yes' || aswesumaStr === 'true' || aswesumaStr === '1',
        specialNeeds: specialStr === 'yes' || specialStr === 'true' || specialStr === '1',
        isValid,
        errorReason,
      });
    }

    setRows(parsedRows);
  }


  function handleDownloadTemplate() {
    const csv = getOfficialHouseholdTemplateCsv();
    downloadFile(csv, 'grs_household_import_template.csv');
  }

  function handleDownloadErrorReport() {
    const errorRows = rows.filter((r) => !r.isValid);
    if (errorRows.length === 0) return;

    const headers = ['Row_Number', 'House_No', 'Head_Name', 'Address', 'Error_Reason'];
    const csvLines = [
      headers.join(','),
      ...errorRows.map((r) =>
        [
          r.rowNumber,
          sanitizeCsvCell(r.houseNo),
          sanitizeCsvCell(r.headName),
          sanitizeCsvCell(r.address),
          sanitizeCsvCell(r.errorReason || 'Validation error'),
        ].join(',')
      ),
    ];

    downloadFile(csvLines.join('\n'), `household_import_errors_${Date.now()}.csv`);
  }

  async function handleCommitValidRows() {
    const validRows = rows.filter((r) => r.isValid);
    if (validRows.length === 0) {
      alert('There are no valid rows to commit.');
      return;
    }

    if (!selectedGn) {
      alert('Please select a target GN Division to associate these households.');
      return;
    }

    setCommitting(true);
    setCommitProgress({ current: 0, total: validRows.length });
    setCommitSuccess(null);

    let committedCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i];
      try {
        await api.createHousehold({
          gnId: selectedGn,
          houseNo: row.houseNo,
          houseLeaderName: row.headName,
          address: row.address || undefined,
          villageName: row.village || undefined,
          isSamurdhi: row.samurdhi,
          isAswesuma: row.aswesuma,
          hasSpecialNeeds: row.specialNeeds,
        });
        committedCount++;
      } catch (err: any) {
        errors.push(`Row ${row.rowNumber} (${row.houseNo}): ${err.message}`);
      }
      setCommitProgress({ current: i + 1, total: validRows.length });
    }

    setCommitting(false);
    setCommitProgress(null);

    if (errors.length === 0) {
      setCommitSuccess(`Successfully committed all ${committedCount} valid households to the designated GN division!`);
      // Clear file
      setFile(null);
      setRows([]);
    } else {
      setCommitSuccess(
        `Committed ${committedCount} households with ${errors.length} errors: ${errors.slice(0, 3).join('; ')}`
      );
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
              Upload pre-existing household lists from Divisional Secretariats with automatic error sanitization and 4.5 MB cap enforcement.
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
                Supported formats: CSV, XLSX. File size must be under 4.5 MB.
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

        {/* Commit success notification */}
        {commitSuccess && (
          <div className="card border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-300 flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
            <span>{commitSuccess}</span>
          </div>
        )}

        {/* Parsing Indicator */}
        {parsing && (
          <div className="card p-6 flex items-center justify-center gap-3 text-slate-300">
            <Loader2 className="w-5 h-5 animate-spin text-emerald-400" />
            <span>{t('import.parse_verify')}...</span>
          </div>
        )}

        {/* Parsed Rows Summary & Action Bar */}
        {rows.length > 0 && !parsing && (
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
                Ready to commit <strong className="text-emerald-400">{validRowsCount}</strong> valid households.
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
                <button
                  onClick={handleCommitValidRows}
                  disabled={validRowsCount === 0 || committing}
                  className="btn btn-primary flex items-center gap-2 text-sm"
                >
                  {committing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Committing ({commitProgress?.current}/{commitProgress?.total})...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      {t('import.commit_valid')}
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Table of Rows */}
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="table w-full text-left">
                  <thead>
                    <tr>
                      <th className="w-12">#</th>
                      <th>House No</th>
                      <th>Head of Household</th>
                      <th>Address / Village</th>
                      <th>Welfare Flags</th>
                      <th>Status</th>
                      <th>Validation Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.slice(0, 100).map((r) => (
                      <tr
                        key={r.rowNumber}
                        className={!r.isValid ? 'bg-red-500/5 hover:bg-red-500/10' : ''}
                      >
                        <td className="text-slate-400 text-xs font-mono">{r.rowNumber}</td>
                        <td className="font-semibold text-white">{r.houseNo || '-'}</td>
                        <td className="text-slate-200">{r.headName || '-'}</td>
                        <td className="text-slate-400 text-xs">
                          {r.address} {r.village ? `(${r.village})` : ''}
                        </td>
                        <td className="text-xs">
                          <div className="flex gap-1">
                            {r.samurdhi && <span className="badge badge-info text-[10px]">Samurdhi</span>}
                            {r.aswesuma && <span className="badge badge-info text-[10px]">Aswesuma</span>}
                            {r.specialNeeds && <span className="badge badge-warning text-[10px]">Special</span>}
                            {!r.samurdhi && !r.aswesuma && !r.specialNeeds && <span className="text-slate-600">-</span>}
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
                        <td className="text-xs">
                          {r.errorReason ? (
                            <span className="text-red-400 font-medium">{r.errorReason}</span>
                          ) : (
                            <span className="text-slate-500">Ready for database</span>
                          )}
                        </td>
                      </tr>
                    ))}
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
