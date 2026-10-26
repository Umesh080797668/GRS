const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const PDFDocument = require(path.resolve(__dirname, '../../node_modules/.pnpm/pdfkit@0.20.2/node_modules/pdfkit/js/pdfkit.js'));

async function runSpikeS3() {
  console.log('====================================================');
  console.log(' Spike S3: Empirical Indic PDF Shaping Evaluation');
  console.log('====================================================');

  const outputDir = path.resolve(__dirname, '../../docs/spikes/s3_evidence');
  fs.mkdirSync(outputDir, { recursive: true });

  const sinhalaFontPath = '/usr/share/fonts/truetype/noto/NotoSansSinhala-Regular.ttf';
  const tamilFontPath = '/usr/share/fonts/truetype/noto/NotoSansTamil-Medium.ttf';

  if (!fs.existsSync(sinhalaFontPath) || !fs.existsSync(tamilFontPath)) {
    throw new Error('Required Noto Sinhala/Tamil fonts not found on system.');
  }

  const testPhrases = [
    { label: 'Sinhala: Sri Lanka', text: 'ශ්‍රී ලංකා', font: sinhalaFontPath },
    { label: 'Sinhala: Ksha ligature', text: 'ක්‍ෂ', font: sinhalaFontPath },
    { label: 'Tamil: Tamil', text: 'தமிழ்', font: tamilFontPath },
    { label: 'Tamil: Shri ligature', text: 'ஸ்ரீ', font: tamilFontPath },
  ];

  // ---------------------------------------------------------------------------
  // 1. Render via PDFKit (Node.js native PDF generator lacking HarfBuzz)
  // ---------------------------------------------------------------------------
  console.log('\n[1/3] Generating PDF using PDFKit (Node.js engine without HarfBuzz)...');
  const pdfkitPdfPath = path.join(outputDir, 'pdfkit_rendered.pdf');
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  const writeStream = fs.createWriteStream(pdfkitPdfPath);
  doc.pipe(writeStream);

  doc.fontSize(20).text('Spike S3: PDFKit Indic Rendering (No HarfBuzz Shaping)', { underline: true });
  doc.moveDown(1.5);

  for (const item of testPhrases) {
    doc.font(item.font).fontSize(28).text(`${item.label}: ${item.text}`);
    doc.moveDown(1);
  }

  doc.end();

  await new Promise((resolve) => {
    writeStream.on('finish', () => resolve(true));
  });
  console.log(`Saved PDFKit output: ${pdfkitPdfPath}`);

  // ---------------------------------------------------------------------------
  // 2. Render via Headless Chromium (Browser Engine with HarfBuzz)
  // ---------------------------------------------------------------------------
  console.log('\n[2/3] Generating PDF using Headless Chromium (@media print engine)...');
  const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    @font-face {
      font-family: 'NotoSansSinhala';
      src: url('file://${sinhalaFontPath}');
    }
    @font-face {
      font-family: 'NotoSansTamil';
      src: url('file://${tamilFontPath}');
    }
    body {
      font-family: sans-serif;
      padding: 50px;
    }
    h1 {
      font-size: 20px;
      color: #004D40;
      border-bottom: 2px solid #004D40;
      padding-bottom: 8px;
    }
    .sample {
      font-size: 28px;
      margin: 20px 0;
      line-height: 1.6;
    }
    .sinhala {
      font-family: 'NotoSansSinhala', sans-serif;
    }
    .tamil {
      font-family: 'NotoSansTamil', sans-serif;
    }
  </style>
</head>
<body>
  <h1>Spike S3: Chromium Web Print Rendering (With HarfBuzz Shaping)</h1>
  <div class="sample sinhala">Sinhala: Sri Lanka: <b>ශ්‍රී ලංකා</b></div>
  <div class="sample sinhala">Sinhala: Ksha ligature: <b>ක්‍ෂ</b></div>
  <div class="sample tamil">Tamil: Tamil: <b>தமிழ்</b></div>
  <div class="sample tamil">Tamil: Shri ligature: <b>ஸ்ரீ</b></div>
</body>
</html>`;

  const htmlPath = path.join(outputDir, 'browser_source.html');
  const chromiumPdfPath = path.join(outputDir, 'chromium_rendered.pdf');
  fs.writeFileSync(htmlPath, htmlContent, 'utf8');

  execSync(
    `google-chrome-stable --headless --disable-gpu --no-sandbox --print-to-pdf="${chromiumPdfPath}" "${htmlPath}"`,
  );
  console.log(`Saved Chromium output: ${chromiumPdfPath}`);

  // ---------------------------------------------------------------------------
  // 3. Rasterize both PDFs to PNG using pdftoppm for visual inspection
  // ---------------------------------------------------------------------------
  console.log('\n[3/3] Rasterizing PDFs to high-resolution PNGs via pdftoppm...');
  const pdfkitPngBase = path.join(outputDir, 'pdfkit_rendered');
  const chromiumPngBase = path.join(outputDir, 'chromium_rendered');

  execSync(`pdftoppm -png -r 150 "${pdfkitPdfPath}" "${pdfkitPngBase}"`);
  execSync(`pdftoppm -png -r 150 "${chromiumPdfPath}" "${chromiumPngBase}"`);

  console.log(`Rasterized images saved to:`);
  console.log(`  - PDFKit:   ${pdfkitPngBase}-1.png`);
  console.log(`  - Chromium: ${chromiumPngBase}-1.png`);

  console.log('\nEmpirical Spike S3 PDF generation & rasterization completed successfully.');
}

runSpikeS3().catch((err) => {
  console.error('Spike S3 failed:', err);
  process.exit(1);
});
