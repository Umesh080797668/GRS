#!/usr/bin/env node
/**
 * M7.2 Visual & HarfBuzz Shaping Verification on Real Built Dashboard (/reports)
 * Starts a local HTTP server for apps/dashboard/out (+ /fonts/*.ttf),
 * launches headless Google Chrome with CDP, intercepts /v1/* API requests with
 * trilingual data (en, si, ta including ශ්‍රී ලංකා, ක්‍ෂ, தமிழ், ஸ்ரீ),
 * triggers Page.printToPDF (@media print), converts to PNG with pdftoppm,
 * and saves artifacts under docs/spikes/m7_evidence/ for visual inspection.
 */

const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const os = require('os');

const ROOT = path.resolve(__dirname, '../..');
const OUT_DIR = path.join(ROOT, 'apps/dashboard/out');
const EVIDENCE_DIR = path.join(ROOT, 'docs/spikes/m7_evidence');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

function startStaticServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const reqPath = decodeURIComponent((req.url || '/').split('?')[0]);
      let filePath = path.join(OUT_DIR, reqPath === '/' ? 'index.html' : reqPath);
      if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, 'index.html');
      } else if (!fs.existsSync(filePath) && fs.existsSync(`${filePath}.html`)) {
        filePath = `${filePath}.html`;
      } else if (!fs.existsSync(filePath)) {
        res.statusCode = 404;
        res.end('Not Found');
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
      fs.createReadStream(filePath).pipe(res);
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve({ server, port: addr.port });
    });
    server.on('error', reject);
  });
}

function createCdpClient(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let nextId = 1;
    const pending = new Map();
    const listeners = new Map();

    ws.addEventListener('open', () => {
      resolve({
        send(method, params = {}) {
          const id = nextId++;
          return new Promise((res, rej) => {
            pending.set(id, { res, rej });
            ws.send(JSON.stringify({ id, method, params }));
          });
        },
        on(event, fn) {
          if (!listeners.has(event)) listeners.set(event, []);
          listeners.get(event).push(fn);
        },
        close() {
          ws.close();
        },
      });
    });

    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(String(event.data));
      if (msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) rej(new Error(msg.error.message));
        else res(msg.result);
      } else if (msg.method && listeners.has(msg.method)) {
        for (const fn of listeners.get(msg.method)) {
          fn(msg.params);
        }
      }
    });

    ws.addEventListener('error', reject);
  });
}

function buildMockPreview(lang) {
  if (lang === 'si') {
    return {
      kind: 'progress',
      lang: 'si',
      title: 'ප්‍රගති වාර්තාව — ශ්‍රී ලංකා ක්‍ෂේත්‍ර සාරාංශය',
      generatedAt: '2026-11-11 17:05 IST',
      summary: {
        scopeLevel: 'ජාතික',
        areaId: 'national',
        areaName: 'ශ්‍රී ලංකාව (ජාතික)',
        housesAssigned: 1250,
        housesStarted: 940,
        housesDone: 810,
        completionRate: 64.8,
        clientsCount: 1620,
        epfCount: 310,
        etfCount: 205,
        aswesumaCount: 190,
        samurdhiCount: 245,
        specialNeedsCount: 34,
      },
      rows: [
        {
          scopeLevel: 'දිස්ත්‍රික්කය',
          areaId: 'd1',
          areaName: 'කොළඹ — ශ්‍රී ජයවර්ධනපුර කෝට්ටේ',
          housesAssigned: 650,
          housesDone: 460,
          completionRate: 70.8,
          clientsCount: 920,
          epfCount: 180,
          etfCount: 120,
          aswesumaCount: 95,
          samurdhiCount: 110,
          specialNeedsCount: 18,
        },
        {
          scopeLevel: 'දිස්ත්‍රික්කය',
          areaId: 'd2',
          areaName: 'මහනුවර — කුසලතා ක්‍ෂේත්‍ර කලාපය',
          housesAssigned: 600,
          housesDone: 350,
          completionRate: 58.3,
          clientsCount: 700,
          epfCount: 130,
          etfCount: 85,
          aswesumaCount: 95,
          samurdhiCount: 135,
          specialNeedsCount: 16,
        },
      ],
    };
  }
  if (lang === 'ta') {
    return {
      kind: 'progress',
      lang: 'ta',
      title: 'முன்னேற்ற அறிக்கை — இலங்கை தேசிய சுருக்கம்',
      generatedAt: '2026-11-11 17:05 IST',
      summary: {
        scopeLevel: 'தேசியம்',
        areaId: 'national',
        areaName: 'இலங்கை (தேசியம்) — ஸ்ரீ ஜெயவர்தனபுர',
        housesAssigned: 1250,
        housesStarted: 940,
        housesDone: 810,
        completionRate: 64.8,
        clientsCount: 1620,
        epfCount: 310,
        etfCount: 205,
        aswesumaCount: 190,
        samurdhiCount: 245,
        specialNeedsCount: 34,
      },
      rows: [
        {
          scopeLevel: 'மாவட்டம்',
          areaId: 'd1',
          areaName: 'கொழும்பு — தமிழ் திறன் பிரிவு',
          housesAssigned: 650,
          housesDone: 460,
          completionRate: 70.8,
          clientsCount: 920,
          epfCount: 180,
          etfCount: 120,
          aswesumaCount: 95,
          samurdhiCount: 110,
          specialNeedsCount: 18,
        },
        {
          scopeLevel: 'மாவட்டம்',
          areaId: 'd2',
          areaName: 'கண்டி — ஸ்ரீ பாத கலாச்சார வலயம்',
          housesAssigned: 600,
          housesDone: 350,
          completionRate: 58.3,
          clientsCount: 700,
          epfCount: 130,
          etfCount: 85,
          aswesumaCount: 95,
          samurdhiCount: 135,
          specialNeedsCount: 16,
        },
      ],
    };
  }
  return {
    kind: 'progress',
    lang: 'en',
    title: 'Progress Report — Sri Lanka National Summary',
    generatedAt: '2026-11-11 17:05 IST',
    summary: {
      scopeLevel: 'National',
      areaId: 'national',
      areaName: 'Sri Lanka (National)',
      housesAssigned: 1250,
      housesStarted: 940,
      housesDone: 810,
      completionRate: 64.8,
      clientsCount: 1620,
      epfCount: 310,
      etfCount: 205,
      aswesumaCount: 190,
      samurdhiCount: 245,
      specialNeedsCount: 34,
    },
    rows: [
      {
        scopeLevel: 'District',
        areaId: 'd1',
        areaName: 'Colombo District',
        housesAssigned: 650,
        housesDone: 460,
        completionRate: 70.8,
        clientsCount: 920,
        epfCount: 180,
        etfCount: 120,
        aswesumaCount: 95,
        samurdhiCount: 110,
        specialNeedsCount: 18,
      },
      {
        scopeLevel: 'District',
        areaId: 'd2',
        areaName: 'Kandy District',
        housesAssigned: 600,
        housesDone: 350,
        completionRate: 58.3,
        clientsCount: 700,
        epfCount: 130,
        etfCount: 85,
        aswesumaCount: 95,
        samurdhiCount: 135,
        specialNeedsCount: 16,
      },
    ],
  };
}

async function renderLangPdf(chromePort, baseUrl, lang) {
  const targets = await fetch(`http://127.0.0.1:${chromePort}/json/list`).then((r) => r.json());
  const pageTarget = targets.find((t) => t.type === 'page') || targets[0];
  const cdp = await createCdpClient(pageTarget.webSocketDebuggerUrl);

  let docScriptId = null;
  try {
    await cdp.send('Page.enable');
    await cdp.send('Page.setBypassCSP', { enabled: true });
    await cdp.send('Runtime.enable');
    const logs = [];
    cdp.on('Runtime.consoleAPICalled', (p) => logs.push(p.args?.map((a) => a.value || a.description).join(' ')));
    cdp.on('Runtime.exceptionThrown', (p) => logs.push(p.exceptionDetails?.exception?.description || p.exceptionDetails?.text || 'exception'));
    await cdp.send('Fetch.enable', {
      patterns: [{ urlPattern: '*://*/v1/*' }],
    });

    cdp.on('Fetch.requestPaused', async ({ requestId, request }) => {
      const url = request.url;
      logs.push(`FETCH:${request.method} ${url}`);
      let status = 200;
      let bodyObj = {};
      if (url.includes('/v1/auth/refresh')) {
        bodyObj = {
          accessToken: 'mock-access-token',
          refreshToken: 'mock-refresh-token',
          user: {
            id: '00000000-0000-4000-8000-000000000u00',
            userCode: 'GRS0000000001',
            role: 'super_admin',
            fullName: 'National Admin',
          },
        };
      } else if (url.includes('/v1/areas/districts')) {
        bodyObj = [];
      } else if (url.includes('/v1/exports/preview')) {
        bodyObj = buildMockPreview(lang);
      } else if (url.includes('/v1/exports')) {
        bodyObj = { items: [], nextCursor: null };
      } else if (url.includes('/v1/duplicates')) {
        bodyObj = { items: [], nextCursor: null };
      } else if (url.includes('/v1/auth/heartbeat')) {
        bodyObj = { ok: true };
      }

      if (request.method === 'OPTIONS') {
        await cdp.send('Fetch.fulfillRequest', {
          requestId,
          responseCode: 204,
          responseHeaders: [
            { name: 'Access-Control-Allow-Origin', value: '*' },
            { name: 'Access-Control-Allow-Methods', value: 'GET, POST, OPTIONS' },
            { name: 'Access-Control-Allow-Headers', value: '*' },
          ],
          body: '',
        }).catch(() => undefined);
        return;
      }

      const payload = Buffer.from(JSON.stringify(bodyObj), 'utf8').toString('base64');
      await cdp.send('Fetch.fulfillRequest', {
        requestId,
        responseCode: status,
        responseHeaders: [
          { name: 'Content-Type', value: 'application/json; charset=utf-8' },
          { name: 'Access-Control-Allow-Origin', value: '*' },
          { name: 'Access-Control-Allow-Headers', value: '*' },
        ],
        body: payload,
      }).catch(() => undefined);
    });

    const addedScript = await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `
        localStorage.setItem('grs_refresh_token', 'mock-refresh-token');
        localStorage.setItem('grs_dashboard_lang', '${lang}');
        localStorage.setItem('grs_user', JSON.stringify({
          id: '00000000-0000-4000-8000-000000000u00',
          userCode: 'GRS0000000001',
          role: 'super_admin',
          fullName: 'National Admin'
        }));
      `,
    });
    docScriptId = addedScript?.identifier || null;

    await cdp.send('Page.navigate', { url: `${baseUrl}/reports/` });

    // Wait until .report-print-table renders cleanly with rows and fonts settle
    const deadline = Date.now() + 15000;
    let ready = false;
    const expectedMarker = lang === 'si' ? 'ශ්‍රී' : lang === 'ta' ? 'தமிழ்' : 'Sri Lanka';
    while (Date.now() < deadline) {
      const check = await cdp.send('Runtime.evaluate', {
        expression: `(() => {
          const sheet = document.querySelector('.printable-report-sheet');
          const table = document.querySelector('.report-print-table tbody tr');
          const hasMarker = (sheet?.innerText || '').includes(${JSON.stringify(expectedMarker)});
          return (
            sheet?.getAttribute('lang') === ${JSON.stringify(lang)} &&
            Boolean(table) &&
            hasMarker &&
            document.fonts.status === 'loaded'
          );
        })()`,
        returnByValue: true,
      });
      if (check.result?.value === true) {
        ready = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 250));
    }

    if (!ready) {
      const diag = await cdp.send('Runtime.evaluate', {
        expression: `JSON.stringify({
          href: location.href,
          fontsStatus: document.fonts.status,
          hasTable: Boolean(document.querySelector('.report-print-table tbody tr')),
          sheetText: document.querySelector('.printable-report-sheet')?.innerText || '',
          logs: ${JSON.stringify(logs)}
        })`,
        returnByValue: true,
      });
      throw new Error(`Timed out waiting for /reports render for lang=${lang}: ${diag.result?.value}`);
    }

    // Double check bundled Noto fonts loaded and no sidebar in print media
    const printAudit = await cdp.send('Runtime.evaluate', {
      expression: `(() => ({
        rowCount: document.querySelectorAll('.report-print-table tbody tr').length,
        sheetLang: document.querySelector('.printable-report-sheet')?.getAttribute('lang'),
        textSample: document.querySelector('.printable-report-sheet')?.innerText?.slice(0, 200) || '',
      }))()`,
      returnByValue: true,
    });

    const pdfRes = await cdp.send('Page.printToPDF', {
      printBackground: true,
      preferCSSPageSize: true,
    });
    const pdfBuf = Buffer.from(pdfRes.data, 'base64');
    const pdfPath = path.join(EVIDENCE_DIR, `m7_report_${lang}.pdf`);
    await fs.promises.writeFile(pdfPath, pdfBuf);

    const pngPrefix = path.join(EVIDENCE_DIR, `m7_report_${lang}`);
    execFileSync('pdftoppm', ['-png', '-r', '150', pdfPath, pngPrefix]);

    return {
      lang,
      pdfPath,
      pdfBytes: pdfBuf.byteLength,
      audit: printAudit.result?.value,
    };
  } finally {
    if (docScriptId) {
      await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: docScriptId }).catch(() => undefined);
    }
    cdp.close();
  }
}

async function main() {
  if (!fs.existsSync(path.join(OUT_DIR, 'reports/index.html'))) {
    throw new Error('Built dashboard out/reports/index.html not found. Run pnpm --filter dashboard run build first.');
  }
  await fs.promises.mkdir(EVIDENCE_DIR, { recursive: true });

  const { server, port } = await startStaticServer();
  const userDataDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'grs-chrome-m7-'));
  const chrome = spawn(
    '/usr/bin/google-chrome',
    [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--remote-debugging-port=9229',
      `--user-data-dir=${userDataDir}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  try {
    // Wait for CDP endpoint
    let cdpReady = false;
    for (let i = 0; i < 40; i++) {
      try {
        const res = await fetch('http://127.0.0.1:9229/json/version');
        if (res.ok) {
          cdpReady = true;
          break;
        }
      } catch {
        // wait
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    if (!cdpReady) throw new Error('Headless Chrome CDP did not start');

    const baseUrl = `http://127.0.0.1:${port}`;
    const results = [];
    for (const lang of ['en', 'si', 'ta']) {
      results.push(await renderLangPdf(9229, baseUrl, lang));
    }

    console.log('[M7.2 VISUAL VERIFICATION SUMMARY]');
    console.log(JSON.stringify(results, null, 2));
  } finally {
    chrome.kill('SIGKILL');
    server.close();
    await new Promise((r) => setTimeout(r, 200));
    await fs.promises.rm(userDataDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

main().catch((err) => {
  console.error('M7.2 verification failed:', err);
  process.exit(1);
});

