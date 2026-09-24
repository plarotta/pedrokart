// End-to-end smoke test: starts the server, drives a game screen + a phone in headless Chromium.
//   node tools/ci-smoke.mjs            (PW_CHANNEL=chrome to use an installed Chrome instead of Playwright's)
// Exits non-zero on the first failed check.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const PORT = Number(process.env.SMOKE_PORT || 18080);
const BASE = `http://localhost:${PORT}`;
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'pk-smoke-'));
let failed = 0;
const check = (ok, what, detail = '') => {
  console.log(`${ok ? '✓' : '✗'} ${what}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed++;
};

// Hosted mode: a single HTTP listener, no self-signed cert needed. Recording on, to test the data path.
const server = spawn(process.execPath, ['server.js'], {
  env: { ...process.env, PORT: String(PORT), PUBLIC_URL: BASE, RECORD: '1', DATA_DIR },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stdout.on('data', (d) => { serverLog += d; });
server.stderr.on('data', (d) => { serverLog += d; });
const serverAlive = () => server.exitCode === null;

// Game-screen state, printed when a wait times out so CI failures explain themselves.
const fpsOf = (page) => page.evaluate(() => new Promise((r) => { let n = 0; const t = performance.now(); const f = () => { n++; if (performance.now() - t < 1000) requestAnimationFrame(f); else r(n); }; requestAnimationFrame(f); setTimeout(() => r(n), 3000); }));
async function diagnose(host) {
  try {
    const st = await host.evaluate(() => { const p = [...pk.players.values()][0]; return { phase: pk.phase, players: pk.players.size, input: p?.input, seq: p?.lastSeq, path: p?.path }; });
    console.log('  diagnostics:', JSON.stringify({ ...st, fps: await fpsOf(host) }));
  } catch (e) { console.log('  diagnostics unavailable:', e.message.split('\n')[0]); }
}
async function waitFor(page, fn, what, timeout, host = page) {
  try { await page.waitForFunction(fn, null, { timeout }); }
  catch { await diagnose(host); throw new Error(`timed out waiting for ${what}`); }
}

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`${BASE}/info.json`)).ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`server did not start\n${serverLog}`);
}

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined, args: ['--ignore-gpu-blocklist', '--use-angle=swiftshader',
  // host and phone run side by side; don't let Chrome throttle whichever one isn't focused
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
try {
  await waitForServer();

  // ---- HTTP + security basics
  check((await fetch(`${BASE}/`)).status === 200, 'landing page served');
  check((await fetch(`${BASE}/%E0%A4%A`)).status === 400, 'malformed URL → 400, server survives');
  const hostRes = await fetch(`${BASE}/host`);
  check(/frame-ancestors 'none'/.test(hostRes.headers.get('content-security-policy') || ''), 'security headers present');
  const maps = await (await fetch(`${BASE}/maps.json`)).json();
  check(maps.length >= 5, 'maps listed', maps.join(', '));

  // ---- game screen gets a room
  const ctx = await browser.newContext();
  const errors = [];
  const host = await ctx.newPage();
  await host.setViewportSize({ width: 640, height: 400 });
  host.on('pageerror', (e) => errors.push(`host: ${e.message}`));
  // SMOKE_CPU_THROTTLE=8 slows the game screen's CPU down, to reproduce slow CI runners locally.
  if (process.env.SMOKE_CPU_THROTTLE) {
    const cdp = await ctx.newCDPSession(host);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.SMOKE_CPU_THROTTLE) });
  }
  await host.goto(`${BASE}/host?quality=low`);
  await host.waitForFunction(() => /^[A-Z]{4}$/.test(document.getElementById('roomcode')?.textContent || ''), null, { timeout: 60000 });
  const code = await host.evaluate(() => document.getElementById('roomcode').textContent);
  check(true, 'host got a room', code);

  // ---- phone joins (touch mode in headless), opts in to recording
  const phone = await (await browser.newContext()).newPage(); // a separate device
  await phone.setViewportSize({ width: 844, height: 390 });
  phone.on('pageerror', (e) => errors.push(`phone: ${e.message}`));
  let xss = false;
  await phone.exposeFunction('pwned', () => { xss = true; });
  await phone.goto(`${BASE}/c?room=${encodeURIComponent('<img src=x onerror=pwned()>')}`);
  await phone.waitForTimeout(300);
  check(!xss, 'room code from the URL is not executed');

  await phone.goto(`${BASE}/j/${code}`);
  await phone.fill('#name', 'Smoke');
  await phone.check('#rec');
  await phone.click('#go');
  await waitFor(host, () => [...pk.players.values()].some((p) => p.name === 'Smoke'), 'the phone to join', 30000);
  await host.waitForTimeout(2500);
  const link = await host.evaluate(() => [...pk.players.values()][0].path);
  check(link === 'direct' || link === 'relay', 'phone connected', link);

  // ---- race: ITEM starts it, touch mode auto-gas drives
  const press = async (sel) => {
    const box = await (await phone.$(sel)).boundingBox();
    await phone.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await phone.mouse.down(); await phone.waitForTimeout(150); await phone.mouse.up();
  };
  // The game loop runs on requestAnimationFrame, which stops in a hidden window: keep the game screen in front.
  await host.bringToFront();
  await press('[data-k=item]');
  console.log('  host fps:', await fpsOf(host));
  await waitFor(host, () => pk.phase === 'race', 'the race to start', 60000);
  const p0 = await host.evaluate(() => pk.karts.find((k) => k.player).progress);
  await host.waitForTimeout(6000);
  const race = await host.evaluate(() => { const k = pk.karts.find((k) => k.player); return { progress: k.progress, speed: k.speed, recording: pk.rec.active }; });
  check(race.progress - p0 > 20, 'phone input drives the kart', `${(race.progress - p0).toFixed(0)} m in 6 s`);
  check(race.recording, 'race is being recorded (player opted in)');

  // ---- items work
  const itemsOk = await host.evaluate(async () => {
    for (const it of ['mushroom', 'banana', 'shell', 'blueshell', 'bullet']) pk.use(it);
    await new Promise((r) => setTimeout(r, 1500));
    return true;
  });
  check(itemsOk, 'all items can be used');

  // ---- closing the game screen aborts + saves the recording
  await host.close();
  await new Promise((r) => setTimeout(r, 1000));
  const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith('.jsonl.gz'));
  check(files.length === 1, 'recording saved', files[0] || 'none');

  // ---- every map builds without errors
  const all = await ctx.newPage();
  all.on('pageerror', (e) => errors.push(`maps: ${e.message}`));
  await all.goto(`${BASE}/host?quality=low`);
  await all.waitForFunction(() => window.pk && pk.karts.length > 0, null, { timeout: 60000 });
  const mapNames = await all.evaluate(async () => {
    const names = [];
    for (let i = 0; i < pk.maps.length; i++) { pk.loadMap(i); names.push(pk.maps[pk.mapIndex].name); await new Promise((r) => setTimeout(r, 300)); }
    return names;
  });
  check(mapNames.length === maps.length, 'every map builds', mapNames.join(', '));

  check(errors.length === 0, 'no page errors', errors.slice(0, 3).join(' | '));
  check(serverAlive(), 'server still running');

  // ---- recording → training arrays (optional: needs uv)
  let uv = null;
  try { uv = execFileSync('uv', ['--version'], { encoding: 'utf8' }).trim(); } catch {}
  if (uv) {
    const out = execFileSync('uv', ['run', '-q', 'ml/load_races.py', '--data', DATA_DIR, '--out', path.join(DATA_DIR, 'bc.npz')], { encoding: 'utf8' });
    const m = out.match(/([\d,]+) samples/);
    check(!!m && Number(m[1].replace(/,/g, '')) > 100, 'loader builds a dataset from the recording', m ? `${m[1]} samples` : out.trim().split('\n')[0]);
  } else {
    console.log('- skipped dataset check (uv not installed)');
  }
} catch (e) {
  check(false, 'smoke test crashed', e.message.split('\n')[0]);
  console.log(serverLog);
} finally {
  await browser.close();
  server.kill();
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
}
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
