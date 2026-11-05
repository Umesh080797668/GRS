'use client';

import { useState } from 'react';
import { notFound } from 'next/navigation';
import { Shell } from '@/components/Shell';
import { useLanguage } from '@/context/LanguageContext';
import * as XLSX from 'xlsx';
import {
  Type,
  Gauge,
  Play,
  CheckCircle,
  Clock,
  HardDrive,
  Cpu,
  Layers,
  Sparkles,
  Sliders,
  FileSpreadsheet,
  AlertCircle,
  Loader2,
} from 'lucide-react';

interface BenchmarkResult {
  fileSizeBytes: number;
  fetchTimeMs: number;
  parseTimeMs: number;
  totalTimeMs: number;
  rowCount: number;
  columnCount: number;
  sheetNames: string[];
  previewRows: any[];
}

export default function ShowcasePage() {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }

  const { t } = useLanguage();

  // Typography Playground State
  const [fontSize, setFontSize] = useState<number>(18);
  const [fontWeight, setFontWeight] = useState<'normal' | '500' | '600' | '700'>('500');
  const [lineHeight, setLineHeight] = useState<number>(1.6);
  const [letterSpacing, setLetterSpacing] = useState<number>(0);

  // Benchmark State
  const [benchmarking, setBenchmarking] = useState<boolean>(false);
  const [benchmarkResult, setBenchmarkResult] = useState<BenchmarkResult | null>(null);
  const [benchmarkError, setBenchmarkError] = useState<string | null>(null);

  async function runXlsxBenchmark() {
    setBenchmarking(true);
    setBenchmarkError(null);
    setBenchmarkResult(null);

    const startTime = performance.now();

    try {
      // 1. Fetch the 3.39 MB real benchmark file from public assets
      const fetchStart = performance.now();
      const response = await fetch('/real_3mb_households.xlsx');
      if (!response.ok) {
        throw new Error(`Failed to fetch /real_3mb_households.xlsx (HTTP ${response.status})`);
      }
      const arrayBuffer = await response.arrayBuffer();
      const fetchEnd = performance.now();
      const fetchTimeMs = Math.round(fetchEnd - fetchStart);

      // 2. Parse using SheetJS (XLSX) in browser memory
      const parseStart = performance.now();
      const workbook = XLSX.read(arrayBuffer, { type: 'array', codepage: 65001 });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const jsonRows: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      const parseEnd = performance.now();
      const parseTimeMs = Math.round(parseEnd - parseStart);

      const totalTimeMs = Math.round(performance.now() - startTime);

      setBenchmarkResult({
        fileSizeBytes: arrayBuffer.byteLength,
        fetchTimeMs,
        parseTimeMs,
        totalTimeMs,
        rowCount: jsonRows.length,
        columnCount: jsonRows[0] ? (jsonRows[0] as any[]).length : 0,
        sheetNames: workbook.SheetNames,
        previewRows: jsonRows.slice(0, 15),
      });
    } catch (err: any) {
      setBenchmarkError(err.message || 'Error executing XLSX benchmark.');
    } finally {
      setBenchmarking(false);
    }
  }

  return (
    <Shell activePath="/showcase">
      <div className="space-y-8 max-w-6xl mx-auto pb-12">
        {/* Page Header */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-teal-50 text-teal-800 border border-teal-200/60 rounded-xl flex-shrink-0">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-200/50">
                  Engineering Verification Suite
                </span>
                <span className="text-xs text-slate-400">•</span>
                <span className="badge badge-warning text-[10px]">Non-Production Only</span>
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                {t('nav.showcase')} — Civic Typography & Browser XLSX Engine
              </h1>
              <p className="text-sm text-slate-500 mt-1">
                Verification test bench for trilingual Sinhala/Tamil/English typesetting fidelity and client-side processing of large 3.39 MB national datasets.
              </p>
            </div>
          </div>
        </div>

        {/* Section 1: In-Browser 3.39 MB XLSX Parsing Benchmark (Spike S5.2) */}
        <div className="panel overflow-hidden">
          <div className="p-6 border-b border-slate-200 bg-slate-50/50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-teal-50 border border-teal-200 text-teal-800 flex items-center justify-center font-bold">
                <Gauge className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-slate-900">
                    Spike S5.2: In-Browser 3.39 MB XLSX Benchmark
                  </h2>
                  <span className="badge badge-info text-[10px] font-mono">Memory Stream</span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Benchmarks client-side parsing of large DS division census spreadsheets without server-side compute.
                </p>
              </div>
            </div>

            <button
              onClick={runXlsxBenchmark}
              disabled={benchmarking}
              className="btn btn-primary flex items-center gap-2 px-4 py-2 font-semibold shadow-xs"
            >
              {benchmarking ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Parsing in Browser...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>Run 3.39 MB Benchmark</span>
                </>
              )}
            </button>
          </div>

          <div className="p-6 space-y-6">
            {benchmarkError && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800 flex items-start gap-3">
                <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <strong className="block font-semibold mb-0.5">Benchmark Failed</strong>
                  <span>{benchmarkError}</span>
                </div>
              </div>
            )}

            {benchmarkResult ? (
              <div className="space-y-6">
                {/* Benchmark Metrics Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                    <div className="text-xs text-slate-500 flex items-center gap-1.5 mb-1 font-medium">
                      <HardDrive className="w-3.5 h-3.5 text-blue-600" />
                      Dataset Size
                    </div>
                    <div className="text-2xl font-bold text-slate-900 tabular-nums">
                      {(benchmarkResult.fileSizeBytes / (1024 * 1024)).toFixed(2)}{' '}
                      <span className="text-sm font-normal text-slate-500">MB</span>
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono mt-1">
                      {benchmarkResult.fileSizeBytes.toLocaleString()} bytes
                    </div>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                    <div className="text-xs text-slate-500 flex items-center gap-1.5 mb-1 font-medium">
                      <Clock className="w-3.5 h-3.5 text-amber-600" />
                      Fetch Latency
                    </div>
                    <div className="text-2xl font-bold text-amber-700 tabular-nums">
                      {benchmarkResult.fetchTimeMs}{' '}
                      <span className="text-sm font-normal text-slate-500">ms</span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">Client asset transfer</div>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                    <div className="text-xs text-slate-500 flex items-center gap-1.5 mb-1 font-medium">
                      <Cpu className="w-3.5 h-3.5 text-teal-700" />
                      Parsing Execution
                    </div>
                    <div className="text-2xl font-bold text-teal-800 tabular-nums">
                      {benchmarkResult.parseTimeMs}{' '}
                      <span className="text-sm font-normal text-slate-500">ms</span>
                    </div>
                    <div className="text-[11px] text-teal-700 font-semibold mt-1">
                      {Math.round(
                        benchmarkResult.rowCount / (benchmarkResult.parseTimeMs / 1000)
                      ).toLocaleString()}{' '}
                      rows/sec
                    </div>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                    <div className="text-xs text-slate-500 flex items-center gap-1.5 mb-1 font-medium">
                      <Layers className="w-3.5 h-3.5 text-indigo-600" />
                      Extracted Records
                    </div>
                    <div className="text-2xl font-bold text-slate-900 tabular-nums">
                      {benchmarkResult.rowCount.toLocaleString()}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">
                      {benchmarkResult.columnCount} columns • {benchmarkResult.sheetNames.length} sheet
                    </div>
                  </div>
                </div>

                {/* Data Preview Table */}
                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                  <div className="p-3 bg-slate-50 border-b border-slate-200 flex justify-between items-center text-xs">
                    <div className="flex items-center gap-2">
                      <FileSpreadsheet className="w-4 h-4 text-teal-700" />
                      <span className="font-bold text-slate-800">
                        Spreadsheet Memory Dump Head (Sample First 15 Rows)
                      </span>
                    </div>
                    <span className="badge badge-success text-[10px]">
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Memory Validated
                    </span>
                  </div>
                  <div className="overflow-x-auto max-h-80">
                    <table className="w-full text-left text-xs font-mono">
                      <thead>
                        <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                          <th className="py-2.5 px-3 w-12 text-slate-500">#</th>
                          {Array.isArray(benchmarkResult.previewRows[0]) &&
                            benchmarkResult.previewRows[0].slice(0, 8).map((col: any, cIdx: number) => (
                              <th key={cIdx} className="py-2.5 px-3 text-slate-700">
                                Col {cIdx + 1}
                              </th>
                            ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {benchmarkResult.previewRows.map((row, idx) => (
                          <tr
                            key={idx}
                            className={`hover:bg-slate-50 transition-colors ${idx === 0 ? 'bg-teal-50/40 font-bold text-teal-950' : 'text-slate-800'
                              }`}
                          >
                            <td className="py-2 px-3 text-slate-400 font-mono text-[11px]">
                              {idx + 1}
                            </td>
                            {Array.isArray(row) ? (
                              row.slice(0, 8).map((cell, cIdx) => (
                                <td key={cIdx} className="py-2 px-3 truncate max-w-[180px]">
                                  {String(cell ?? '')}
                                </td>
                              ))
                            ) : (
                              <td colSpan={8} className="py-2 px-3">{JSON.stringify(row)}</td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl p-8 text-center text-slate-500">
                <FileSpreadsheet className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <div className="text-sm font-semibold text-slate-700">No benchmark executed yet</div>
                <div className="text-xs text-slate-500 mt-0.5">
                  Click &ldquo;Run 3.39 MB Benchmark&rdquo; to test real browser allocation and parse performance.
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Section 2: Trilingual Typography Specimen (Spike S5.1) */}
        <div className="panel overflow-hidden">
          <div className="p-6 border-b border-slate-200 bg-slate-50/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-teal-50 border border-teal-200 text-teal-800 flex items-center justify-center font-bold">
                <Type className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-slate-900">
                    Spike S5.1: Civic Trilingual Typography Specimen
                  </h2>
                  <span className="badge badge-info text-[10px]">Sinhala • Tamil • English</span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Validates Noto Sans Sinhala, Noto Sans Tamil, and Inter typeface rendering and line-height vertical metrics across diverse display densities.
                </p>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-6">
            {/* Interactive Typography Controls */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700">
                <Sliders className="w-3.5 h-3.5 text-teal-700" />
                <span>Dynamic Type Tuning Playground</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="text-xs font-semibold text-slate-700">Font Size</label>
                    <span className="badge badge-info text-[10px] font-mono">{fontSize}px</span>
                  </div>
                  <input
                    type="range"
                    min={12}
                    max={36}
                    value={fontSize}
                    onChange={(e) => setFontSize(parseInt(e.target.value, 10))}
                    className="w-full accent-teal-700 cursor-pointer"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1.5">Font Weight</label>
                  <select
                    className="select-field text-xs"
                    value={fontWeight}
                    onChange={(e) => setFontWeight(e.target.value as any)}
                  >
                    <option value="normal">Normal (400)</option>
                    <option value="500">Medium (500)</option>
                    <option value="600">Semi-Bold (600)</option>
                    <option value="700">Bold (700)</option>
                  </select>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="text-xs font-semibold text-slate-700">Line Height</label>
                    <span className="badge badge-info text-[10px] font-mono">{lineHeight}</span>
                  </div>
                  <input
                    type="range"
                    min={1.2}
                    max={2.2}
                    step={0.05}
                    value={lineHeight}
                    onChange={(e) => setLineHeight(parseFloat(e.target.value))}
                    className="w-full accent-teal-700 cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="text-xs font-semibold text-slate-700">Letter Spacing</label>
                    <span className="badge badge-info text-[10px] font-mono">{letterSpacing}px</span>
                  </div>
                  <input
                    type="range"
                    min={-1}
                    max={3}
                    step={0.5}
                    value={letterSpacing}
                    onChange={(e) => setLetterSpacing(parseFloat(e.target.value))}
                    className="w-full accent-teal-700 cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* Typography Specimen Cards */}
            <div className="grid grid-cols-1 gap-6">
              {/* Sinhala Specimen */}
              <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-xs space-y-3">
                <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="badge badge-success text-xs font-semibold">
                      Sinhala Specimen
                    </span>
                    <span className="text-xs font-semibold text-slate-700">Noto Sans Sinhala</span>
                  </div>
                  <span className="text-[11px] text-slate-400 font-mono">Unicode U+0D80..U+0DFF</span>
                </div>
                <div
                  style={{
                    fontSize: `${fontSize}px`,
                    fontWeight,
                    lineHeight,
                    letterSpacing: `${letterSpacing}px`,
                  }}
                  className="text-slate-900"
                >
                  <p className="font-bold text-teal-900 mb-2">
                    දොරින් දොර ජාතික කුසලතා සංගණනය 2026 — ශ්‍රී ලංකා ප්‍රජාතාන්ත්‍රික සමාජවාදී ජනරජය
                  </p>
                  <p className="text-slate-700">
                    ශ්‍රී ලංකාවේ සියලුම ප්‍රාදේශීය ලේකම් කොට්ඨාස ආවරණය වන පරිදි තරුණ ප්‍රජාවගේ වෘත්තීය නිපුණතා සහ අධ්‍යාපනික මට්ටම් ලේඛනගත කිරීම සඳහා මෙම ක්‍රමවේදය සකස් කර ඇත. ක්‍රියාකාරී, විනිවිදභාවයෙන් යුතු රාජ්‍ය සේවාවක් වෙනුවෙන් නව තාක්ෂණය භාවිතයට ගනිමු.
                  </p>
                  <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500 font-mono bg-slate-50 p-3 rounded-lg">
                    <strong className="text-slate-700">Ligature & Combining Mark Rigor Test:</strong> ර්‍ය (ර්ය), න්ද්‍රි, ණ්ඩ, ඤ්ජ, ශ්‍රී, ප්‍ර, ත්‍රි, ර්ක්, ක්ෂ
                  </div>
                </div>
              </div>

              {/* Tamil Specimen */}
              <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-xs space-y-3">
                <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="badge badge-success text-xs font-semibold">
                      Tamil Specimen
                    </span>
                    <span className="text-xs font-semibold text-slate-700">Noto Sans Tamil</span>
                  </div>
                  <span className="text-[11px] text-slate-400 font-mono">Unicode U+0B80..U+0BFF</span>
                </div>
                <div
                  style={{
                    fontSize: `${fontSize}px`,
                    fontWeight,
                    lineHeight,
                    letterSpacing: `${letterSpacing}px`,
                  }}
                  className="text-slate-900"
                >
                  <p className="font-bold text-teal-900 mb-2">
                    வீடு வீடாக தேசிய திறன் கணக்கெடுப்பு 2026 — இலங்கை ஜனநாயக சோசலிசக் குடியரசு
                  </p>
                  <p className="text-slate-700">
                    இலங்கையின் அனைத்து பிரதேச செயலகப் பிரிவுகளையும் உள்ளடக்கியதாக இளைஞர்களின் தொழில்சார் திறன்கள் மற்றும் கல்வித் தகைமைகளை ஆவணப்படுத்துவதற்காக இந்த முறைமை வடிவமைக்கப்பட்டுள்ளது. அனைவருக்கும் சமமான தொழில் வாய்ப்பை உறுதி செய்வோம்.
                  </p>
                  <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500 font-mono bg-slate-50 p-3 rounded-lg">
                    <strong className="text-slate-700">Conjunct & Pulli Diacritic Rigor Test:</strong> க்ஷ, ஶ்ரீ, ங்க, ற்ற, ண்ட, ம்ப, ந்த, ற்க, ணவ
                  </div>
                </div>
              </div>

              {/* English Specimen */}
              <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-xs space-y-3">
                <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="badge badge-success text-xs font-semibold">
                      English Specimen
                    </span>
                    <span className="text-xs font-semibold text-slate-700">Inter / System Sans</span>
                  </div>
                  <span className="text-[11px] text-slate-400 font-mono">Latin Alphabets</span>
                </div>
                <div
                  style={{
                    fontSize: `${fontSize}px`,
                    fontWeight,
                    lineHeight,
                    letterSpacing: `${letterSpacing}px`,
                  }}
                  className="text-slate-900"
                >
                  <p className="font-bold text-teal-900 mb-2">
                    Door-to-Door National Skills Census 2026 — Democratic Socialist Republic of Sri Lanka
                  </p>
                  <p className="text-slate-700">
                    The quick brown fox jumps over the lazy dog. A decentralized offline-first civic enumeration platform built with Next.js, Cloudflare Pages, and high-performance Postgres geospatial layers.
                  </p>
                  <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500 font-mono bg-slate-50 p-3 rounded-lg">
                    <strong className="text-slate-700">Tabular Figures & Hierarchical Codes:</strong> 0123456789 • !@#$%^&*() • Level 00 / 01 / 02 / 03 • DD/S/001 DD/S/002
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}
