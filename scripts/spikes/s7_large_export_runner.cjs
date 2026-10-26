const path = require('path');
const fs = require('fs');

// Resolve ExcelJS
let ExcelJS;
try {
  ExcelJS = require('exceljs');
} catch (e) {
  ExcelJS = require(path.join(process.cwd(), 'node_modules/.pnpm/exceljs@4.4.0/node_modules/exceljs'));
}

/**
 * Formula Injection Escaping per M7.1:
 * Prepend single quote (') if cell begins with =, +, -, or @
 */
function sanitizeFormulaInjection(value) {
  if (typeof value !== 'string') return value;
  if (/^[=+\-@]/.test(value)) {
    return `'${value}`;
  }
  return value;
}

async function runLargeExportBenchmark() {
  console.log('--- Starting S7 Large Export Streaming Runner Benchmark ---');

  const rowCount = 50000;
  const outDir = path.resolve(process.cwd(), 'docs/spikes/s7_evidence');
  fs.mkdirSync(outDir, { recursive: true });
  const outFilePath = path.join(outDir, 'large_export_50k.xlsx');

  // Memory baseline
  if (global.gc) global.gc();
  const initialMem = process.memoryUsage();
  const startTime = Date.now();

  console.log(`Streaming ${rowCount.toLocaleString()} household rows to: ${outFilePath}`);
  console.log(`Initial Heap Used: ${(initialMem.heapUsed / 1024 / 1024).toFixed(2)} MB`);

  // Stream-based WorkbookWriter (constant memory footprint)
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
    filename: outFilePath,
    useStyles: false,
    useSharedStrings: false,
  });

  const worksheet = workbook.addWorksheet('Households_Export');

  // Define columns
  worksheet.columns = [
    { header: 'Household ID', key: 'id', width: 15 },
    { header: 'Household Head (Sinhala)', key: 'name_si', width: 25 },
    { header: 'Household Head (Tamil)', key: 'name_ta', width: 25 },
    { header: 'Household Head (English)', key: 'name_en', width: 25 },
    { header: 'District', key: 'district', width: 18 },
    { header: 'DSD Division', key: 'dsd', width: 20 },
    { header: 'GN Division', key: 'gn', width: 20 },
    { header: 'Latitude', key: 'lat', width: 14 },
    { header: 'Longitude', key: 'lng', width: 14 },
    { header: 'Members Count', key: 'members', width: 14 },
    { header: 'Monthly Income (LKR)', key: 'income', width: 20 },
    { header: 'Notes / Remarks', key: 'notes', width: 30 },
  ];

  let peakHeapUsed = initialMem.heapUsed;

  // Stream rows
  for (let i = 1; i <= rowCount; i++) {
    // Inject potential formula injection attempts periodically to verify sanitation
    let notes = 'Standard survey completed';
    if (i % 500 === 0) {
      notes = '=CMD|"/C calc"!A0'; // Malicious DDE / formula attack
    } else if (i % 1000 === 0) {
      notes = '+SUM(A1:B10)';
    } else if (i % 1500 === 0) {
      notes = '@HYPERLINK("http://evil.com","Phish")';
    }

    const row = {
      id: `HH-${100000 + i}`,
      name_si: sanitizeFormulaInjection('කේ. ඒ. සුනිල් ශාන්ත'),
      name_ta: sanitizeFormulaInjection('கே. ஏ. சுனில் சாந்த'),
      name_en: sanitizeFormulaInjection(`Sunil Shantha ${i}`),
      district: 'Colombo',
      dsd: 'Thimbirigasyaya',
      gn: 'Kirulapone North (514B)',
      lat: (6.8791 + (i % 100) * 0.0001).toFixed(6),
      lng: (79.8732 + (i % 100) * 0.0001).toFixed(6),
      members: (i % 6) + 1,
      income: 45000 + (i % 30) * 2500,
      notes: sanitizeFormulaInjection(notes),
    };

    worksheet.addRow(row).commit();

    if (i % 10000 === 0) {
      const currentMem = process.memoryUsage().heapUsed;
      if (currentMem > peakHeapUsed) peakHeapUsed = currentMem;
      console.log(`Progress: ${i.toLocaleString()} rows committed... Heap: ${(currentMem / 1024 / 1024).toFixed(2)} MB`);
    }
  }

  worksheet.commit();
  await workbook.commit();

  const endTime = Date.now();
  const finalMem = process.memoryUsage();
  const elapsedSec = ((endTime - startTime) / 1000).toFixed(2);
  const fileStat = fs.statSync(outFilePath);
  const fileSizeMb = (fileStat.size / 1024 / 1024).toFixed(2);

  console.log('--- Export Generation Completed Successfully ---');
  console.log(`Total Rows Exported: ${rowCount.toLocaleString()}`);
  console.log(`Total Elapsed Time: ${elapsedSec} seconds (${(rowCount / parseFloat(elapsedSec)).toFixed(0)} rows/sec)`);
  console.log(`File Size on Disk: ${fileStat.size.toLocaleString()} bytes (${fileSizeMb} MB)`);
  console.log(`Peak Heap Used: ${(peakHeapUsed / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Net Heap Delta: ${((finalMem.heapUsed - initialMem.heapUsed) / 1024 / 1024).toFixed(2)} MB`);

  // Verify formula injection protection on generated file
  const testWorkbook = new ExcelJS.Workbook();
  await testWorkbook.xlsx.readFile(outFilePath);
  const testSheet = testWorkbook.getWorksheet(1);
  const row500 = testSheet.getRow(501); // 1 header + 500th row
  const row500Notes = row500.getCell(12).value;
  console.log(`Sanitization Test (Row 500 formula string): "${row500Notes}" (Safe: ${String(row500Notes).startsWith("'")})`);

  const proof = {
    spike: 'S7',
    task: 'M0.9 Large Export Streaming Runner Proof',
    parameters: {
      rowCount: rowCount,
      format: 'XLSX (Office Open XML)',
      columns: 12,
      streamingEngine: 'ExcelJS.stream.xlsx.WorkbookWriter',
      formulaProtection: "Single-quote prefix prepended to cells starting with [=, +, -, @]",
    },
    metrics: {
      totalRows: rowCount,
      elapsedSeconds: parseFloat(elapsedSec),
      throughputRowsPerSec: Math.round(rowCount / parseFloat(elapsedSec)),
      fileSizeBytes: fileStat.size,
      fileSizeMb: parseFloat(fileSizeMb),
      initialHeapMb: parseFloat((initialMem.heapUsed / 1024 / 1024).toFixed(2)),
      peakHeapMb: parseFloat((peakHeapUsed / 1024 / 1024).toFixed(2)),
      netHeapDeltaMb: parseFloat(((finalMem.heapUsed - initialMem.heapUsed) / 1024 / 1024).toFixed(2)),
    },
    formulaInjectionValidation: {
      attackInput: '=CMD|"/C calc"!A0',
      escapedValue: row500Notes,
      safe: String(row500Notes).startsWith("'"),
    },
    architecturalDecision: {
      inlineThresholdRows: 5000,
      longRunnerStrategy: 'Separate asynchronous worker runner (e.g. GitHub Actions / background container / queue runner) writes directly to Supabase Storage with signed download URL (24h expiry), completely bypassing Vercel 10s/60s function timeouts and 4.5 MB request limits.',
    },
    generatedAt: new Date().toISOString(),
  };

  const proofPath = path.join(outDir, 'large_export_empirical_proof.json');
  fs.writeFileSync(proofPath, JSON.stringify(proof, null, 2));
  console.log(`Empirical proof recorded to: ${proofPath}`);
}

runLargeExportBenchmark().catch((err) => {
  console.error('Large export runner benchmark failed:', err);
  process.exit(1);
});
