// Screenshot the game with system Chrome via Playwright (no downloaded browser).
import { chromium } from '/home/hatch/.npm/_npx/705bc6b22212b352/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const server = spawn(process.execPath, ['serve.ts'], { cwd: process.cwd(), stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1500));
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', m => { if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 300)); });
page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 300)));
mkdirSync('screenshots', { recursive: true });
for (const shot of ['start', 'play', 'buy', 'end']) {
  await page.goto(`http://localhost:8080/?shot=${shot}&seed=1`, { waitUntil: 'load' });
  try { await page.waitForFunction(() => window.__shotReady, null, { timeout: 15000 }); }
  catch { console.log(`[${shot}] __shotReady timeout`); }
  await page.waitForTimeout(400);
  await page.screenshot({ path: `screenshots/${shot}.jpg`, type: 'jpeg', quality: 82 });
  console.log(`[${shot}] saved`);
}
await browser.close();
server.kill();
console.log('done');
