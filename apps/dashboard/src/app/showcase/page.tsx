'use client';

import { useState } from 'react';
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
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
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
      <div className="space-y-8">
        {/* Page Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <Sparkles className="w-7 h-7 text-emerald-400" />
            {t('nav.showcase')} — Civic Typography & Browser XLSX Engine
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Verification harness for trilingual Sinhala/Tamil/English rendering and in-browser processing of 3.39 MB national datasets.
          </p>
        </div>

        {/* Section 1: In-Browser 3.39 MB XLSX Parsing Benchmark */}
        <div className="card p-6 space-y-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-800 pb-4">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Gauge className="w-5 h-5 text-emerald-400" />
                Spike S5.2: In-Browser 3.39 MB XLSX Benchmark
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Benchmarks client-side parsing of large DS division census spreadsheets without server-side compute.
              </p>
            </div>
            <button
              onClick={runXlsxBenchmark}
              disabled={benchmarking}
              className="btn btn-primary flex items-center gap-2"
            >
              <Play className="w-4 h-4 fill-current" />
              {benchmarking ? 'Parsing in Browser...' : 'Run 3.39 MB Benchmark'}
            </button>
          </div>

          {benchmarkError && (
            <div className="card border-red-500/40 bg-red-500/10 p-4 text-xs text-red-300">
              {benchmarkError}
            </div>
          )}

          {benchmarkResult && (
            <div className="space-y-4">
              {/* Benchmark Metrics Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="card bg-slate-900/60 p-4 border border-slate-800">
                  <div className="text-xs text-slate-400 flex items-center gap-1.5 mb-1">
                    <HardDrive className="w-3.5 h-3.5 text-blue-400" />
                    Dataset Size
                  </div>
                  <div className="text-xl font-bold text-white">
                    {(benchmarkResult.fileSizeBytes / (1024 * 1024)).toFixed(2)} MB
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    {benchmarkResult.fileSizeBytes.toLocaleString()} bytes
                  </div>
                </div>

                <div className="card bg-slate-900/60 p-4 border border-slate-800">
                  <div className="text-xs text-slate-400 flex items-center gap-1.5 mb-1">
                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                    Fetch Latency
                  </div>
                  <div className="text-xl font-bold text-amber-300">
                    {benchmarkResult.fetchTimeMs} ms
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">Client asset transfer</div>
                </div>

                <div className="card bg-slate-900/60 p-4 border border-slate-800">
                  <div className="text-xs text-slate-400 flex items-center gap-1.5 mb-1">
                    <Cpu className="w-3.5 h-3.5 text-emerald-400" />
                    Parsing Execution
                  </div>
                  <div className="text-xl font-bold text-emerald-400">
                    {benchmarkResult.parseTimeMs} ms
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    {Math.round((benchmarkResult.rowCount / (benchmarkResult.parseTimeMs / 1000))).toLocaleString()} rows/sec
                  </div>
                </div>

                <div className="card bg-slate-900/60 p-4 border border-slate-800">
                  <div className="text-xs text-slate-400 flex items-center gap-1.5 mb-1">
                    <Layers className="w-3.5 h-3.5 text-purple-400" />
                    Extracted Rows
                  </div>
                  <div className="text-xl font-bold text-white">
                    {benchmarkResult.rowCount.toLocaleString()}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    {benchmarkResult.columnCount} columns across {benchmarkResult.sheetNames.length} sheet
                  </div>
                </div>
              </div>

              {/* Data Preview Table */}
              <div className="card overflow-hidden border border-slate-800">
                <div className="p-3 bg-slate-900/80 border-b border-slate-800 flex justify-between items-center text-xs">
                  <span className="font-semibold text-slate-200">
                    Raw Spreadsheet Head Sample (First 15 Rows)
                  </span>
                  <span className="badge badge-success text-[10px]">
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Browser Memory Clean
                  </span>
                </div>
                <div className="overflow-x-auto max-h-72">
                  <table className="table w-full text-left text-xs font-mono">
                    <tbody>
                      {benchmarkResult.previewRows.map((row, idx) => (
                        <tr key={idx} className={idx === 0 ? 'bg-slate-800/80 font-bold text-slate-200' : ''}>
                          <td className="w-10 text-slate-500">{idx + 1}</td>
                          {Array.isArray(row) ? (
                            row.slice(0, 8).map((cell, cIdx) => (
                              <td key={cIdx} className="truncate max-w-[160px]">
                                {String(cell ?? '')}
                              </td>
                            ))
                          ) : (
                            <td>{JSON.stringify(row)}</td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Section 2: Trilingual Typography Specimen (Spike S5.1) */}
        <div className="card p-6 space-y-6">
          <div className="border-b border-slate-800 pb-4">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Type className="w-5 h-5 text-emerald-400" />
              Spike S5.1: Civic Trilingual Typography Specimen
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Validates Noto Sans Sinhala, Noto Sans Tamil, and Inter/Outfit typeface rendering across diverse display densities.
            </p>
          </div>

          {/* Interactive Typography Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 bg-slate-900/50 p-4 rounded-xl border border-slate-800">
            <div>
              <label className="text-xs text-slate-400 block mb-1">
                Font Size: <span className="text-emerald-400 font-mono">{fontSize}px</span>
              </label>
              <input
                type="range"
                min={12}
                max={36}
                value={fontSize}
                onChange={(e) => setFontSize(parseInt(e.target.value, 10))}
                className="w-full accent-emerald-500"
              />
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1">Font Weight</label>
              <select
                className="input text-xs"
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
              <label className="text-xs text-slate-400 block mb-1">
                Line Height: <span className="text-emerald-400 font-mono">{lineHeight}</span>
              </label>
              <input
                type="range"
                min={1.2}
                max={2.2}
                step={0.1}
                value={lineHeight}
                onChange={(e) => setLineHeight(parseFloat(e.target.value))}
                className="w-full accent-emerald-500"
              />
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1">
                Letter Spacing: <span className="text-emerald-400 font-mono">{letterSpacing}px</span>
              </label>
              <input
                type="range"
                min={-1}
                max={3}
                step={0.5}
                value={letterSpacing}
                onChange={(e) => setLetterSpacing(parseFloat(e.target.value))}
                className="w-full accent-emerald-500"
              />
            </div>
          </div>

          {/* Typography Specimen Cards */}
          <div className="grid grid-cols-1 gap-6">
            {/* Sinhala Specimen */}
            <div className="p-6 rounded-xl bg-slate-900/70 border border-slate-800">
              <div className="flex justify-between items-center mb-3">
                <span className="badge badge-info text-xs">Sinhala Specimen — Noto Sans Sinhala</span>
                <span className="text-xs text-slate-500 font-mono">Unicode U+0D80..U+0DFF</span>
              </div>
              <div
                style={{
                  fontSize: `${fontSize}px`,
                  fontWeight,
                  lineHeight,
                  letterSpacing: `${letterSpacing}px`,
                }}
                className="text-slate-100"
              >
                <p className="font-semibold text-emerald-400 mb-2">
                  දොරින් දොර ජාතික කුසලතා සංගණනය 2026 — ශ්‍රී ලංකා ප්‍රජාතාන්ත්‍රික සමාජවාදී ජනරජය
                </p>
                <p className="text-slate-300">
                  ශ්‍රී ලංකාවේ සියලුම ප්‍රාදේශීය ලේකම් කොට්ඨාස ආවරණය වන පරිදි තරුණ ප්‍රජාවගේ වෘත්තීය නිපුණතා සහ අධ්‍යාපනික මට්ටම් ලේඛනගත කිරීම සඳහා මෙම ක්‍රමවේදය සකස් කර ඇත.
                  ක්‍රියාකාරී, විනිවිදභාවයෙන් යුතු රාජ්‍ය සේවාවක් වෙනුවෙන් නව තාක්ෂණය භාවිතයට ගනිමු.
                </p>
                <div className="mt-4 pt-3 border-t border-slate-800 text-xs text-slate-400 font-mono">
                  Ligature Test: ර්‍ය (ර්ය), න්ද්‍රි, ණ්ඩ, ඤ්ජ, ශ්‍රී, ප්‍ර, ත්‍රි
                </div>
              </div>
            </div>

            {/* Tamil Specimen */}
            <div className="p-6 rounded-xl bg-slate-900/70 border border-slate-800">
              <div className="flex justify-between items-center mb-3">
                <span className="badge badge-info text-xs">Tamil Specimen — Noto Sans Tamil</span>
                <span className="text-xs text-slate-500 font-mono">Unicode U+0B80..U+0BFF</span>
              </div>
              <div
                style={{
                  fontSize: `${fontSize}px`,
                  fontWeight,
                  lineHeight,
                  letterSpacing: `${letterSpacing}px`,
                }}
                className="text-slate-100"
              >
                <p className="font-semibold text-emerald-400 mb-2">
                  வீடு வீடாக தேசிய திறன் கணக்கெடுப்பு 2026 — இலங்கை ஜனநாயக சோசலிசக் குடியரசு
                </p>
                <p className="text-slate-300">
                  இலங்கையின் அனைத்து பிரதேச செயலகப் பிரிவுகளையும் உள்ளடக்கியதாக இளைஞர்களின் தொழில்சார் திறன்கள் மற்றும் கல்வித் தகைமைகளை ஆவணப்படுத்துவதற்காக இந்த முறைமை வடிவமைக்கப்பட்டுள்ளது.
                  அனைவருக்கும் சமமான தொழில் வாய்ப்பை உறுதி செய்வோம்.
                </p>
                <div className="mt-4 pt-3 border-t border-slate-800 text-xs text-slate-400 font-mono">
                  Conjunct Test: க்ஷ, ஶ்ரீ, ங்க, ற்ற, ண்ட, ம்ப, ந்த
                </div>
              </div>
            </div>

            {/* English Specimen */}
            <div className="p-6 rounded-xl bg-slate-900/70 border border-slate-800">
              <div className="flex justify-between items-center mb-3">
                <span className="badge badge-info text-xs">English Specimen — Inter / Outfit Sans</span>
                <span className="text-xs text-slate-500 font-mono">Latin Alphabets</span>
              </div>
              <div
                style={{
                  fontSize: `${fontSize}px`,
                  fontWeight,
                  lineHeight,
                  letterSpacing: `${letterSpacing}px`,
                }}
                className="text-slate-100"
              >
                <p className="font-semibold text-emerald-400 mb-2">
                  Door-to-Door National Skills Census 2026 — Democratic Socialist Republic of Sri Lanka
                </p>
                <p className="text-slate-300">
                  The quick brown fox jumps over the lazy dog. A decentralized offline-first civic enumeration platform built with Next.js, Cloudflare Pages, and high-performance Postgres geospatial layers.
                </p>
                <div className="mt-4 pt-3 border-t border-slate-800 text-xs text-slate-400 font-mono">
                  Numbers & Glyphs: 0123456789 • !@#$%^&*() • L00 L01 L02 L03 L04 L05 • DD/S/001 DD/S/002
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}
