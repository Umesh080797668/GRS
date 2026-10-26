const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function capture() {
  console.log('Starting static server on port 8089...');
  const server = spawn('python3', ['-m', 'http.server', '8089', '--directory', 'apps/dashboard/build/web']);

  await sleep(2000);

  console.log('Launching Chrome with remote debugging on port 9222...');
  const chrome = spawn('google-chrome', [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-extensions',
    '--remote-debugging-port=9222',
    '--window-size=1280,1280',
    'http://127.0.0.1:8089'
  ]);

  await sleep(3000);

  // Fetch debugging target
  const getJson = (url) => new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });

  const targets = await getJson('http://127.0.0.1:9222/json');
  console.log('Found targets:', targets.map(t => `${t.type}: ${t.url}`));
  const pageTarget = targets.find(t => t.url.includes('127.0.0.1:8089'));

  if (!pageTarget) {
    throw new Error('No page target found matching 127.0.0.1:8089');
  }

  // Connect via native WebSocket
  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);

  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  console.log('Connected to Chrome DevTools Protocol');

  let id = 1;
  const send = (method, params = {}) => new Promise((resolve) => {
    const curId = id++;
    const handler = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id === curId) {
        ws.removeEventListener('message', handler);
        resolve(msg.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id: curId, method, params }));
  });

  // Enable Runtime and Page
  await send('Page.enable');
  await send('Runtime.enable');

  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.method === 'Runtime.consoleAPICalled') {
      console.log('[BROWSER CONSOLE]', msg.params.type, msg.params.args.map(a => a.value || a.description).join(' '));
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      console.log('[BROWSER EXCEPTION]', msg.params.exceptionDetails);
    }
  });

  console.log('Navigating to http://127.0.0.1:8089...');
  await send('Page.navigate', { url: 'http://127.0.0.1:8089' });

  console.log('Waiting 18 seconds for Flutter CanvasKit / Skia / Fonts to render...');
  await sleep(18000);

  console.log('Capturing screenshot...');
  const screenshotRes = await send('Page.captureScreenshot', { format: 'png' });
  const buffer = Buffer.from(screenshotRes.data, 'base64');

  fs.mkdirSync('docs/spikes/s5_evidence', { recursive: true });
  fs.writeFileSync('docs/spikes/s5_evidence/flutter_web_trilingual_rendering.png', buffer);
  console.log(`Saved screenshot to docs/spikes/s5_evidence/flutter_web_trilingual_rendering.png (${buffer.length} bytes)`);

  ws.close();
  chrome.kill();
  server.kill();
}

capture().catch(err => {
  console.error('Error during capture:', err);
  process.exit(1);
});
