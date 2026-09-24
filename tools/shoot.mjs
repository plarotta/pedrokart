// Screenshot a race for visual review.
//   node tools/shoot.mjs [--map circuit] [--out shots/] [--players 1] [--at 2,8,16] [--item bullet] [--lobby]
// Needs the server running (npm start). A bot drives the human kart(s) from inside the page.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? [...a, [v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]] : a), []));
const map = args.map || 'circuit';
const out = args.out || path.join('shots', map);
const players = Number(args.players || 1);
const at = String(args.at || '2,8,16').split(',').map(Number);
const W = Number(args.w || 1280), H = Number(args.h || 800);
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
await page.goto(`http://localhost:${process.env.PORT || 8080}/host?map=${map}`);
await page.waitForFunction(() => window.pk && pk.karts.length > 0, null, { timeout: 30000 });
await page.waitForTimeout(1500);
const info = await page.evaluate(() => ({ map: pk.maps[pk.mapIndex].name, file: pk.maps[pk.mapIndex].file, maps: pk.maps.map((m) => m.file) }));
if (info.file !== `${map}.js`) errors.push(`map "${map}" not loaded (got ${info.file}; available: ${info.maps.join(', ')})`);
if (args.lobby) await page.screenshot({ path: path.join(out, 'lobby.png') });
if (args.top) {
  await page.evaluate(() => pk.topView());
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(out, 'top.png') });
  await page.evaluate(() => pk.topView(false));
}

// Bot drivers: steer at the centerline 22m ahead, drift through bends, use items.
await page.evaluate(({ players, item }) => {
  pk.rec.enabled = false; // bot races are not training data
  for (let i = 0; i < players; i++) {
    const p = { pid: `bot${i}`, name: `Bot${i + 1}`, isKeyboard: true, connected: true, color: [0xe53935, 0x1e88e5, 0x43a047, 0xfdd835][i], input: { steer: 0, gas: 0, brake: 0, drift: 0, item: 0 }, menuPrev: 1, driftPrev: 1 };
    pk.players.set(p.pid, p);
  }
  pk.startRace();
  let n = 0;
  setInterval(() => {
    n++;
    for (const k of pk.karts.filter((k) => k.player)) {
      const o = pk.observe(k);
      const a = Math.atan2(o[6 + 3 * 3 + 1], o[6 + 3 * 3]);
      const bend = o[6 + 3 * 5 + 2];
      Object.assign(k.player.input, { gas: 1, steer: Math.max(-1, Math.min(1, a * 2.6)), drift: Math.abs(bend) > 0.15 && k.speed > 20 ? 1 : 0, item: k.item && n % 40 === 0 ? 1 : 0 });
    }
  }, 16);
  if (item) setTimeout(() => pk.karts.filter((k) => k.player).forEach((k) => pk.give(item, k)), 3500);
}, { players, item: args.item || null });

let t = 0;
for (const s of at) {
  await page.waitForTimeout((s - t) * 1000);
  t = s;
  await page.screenshot({ path: path.join(out, `t${String(s).padStart(2, '0')}.png`) });
}
const stats = await page.evaluate(() => pk.karts.map((k) => `${k.name}${k.player ? '*' : ''}: lap ${k.lap} place ${k.place} lat ${k.lat.toFixed(1)}`));
const fps = await page.evaluate(() => new Promise((r) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(f); else r(n); }; requestAnimationFrame(f); }));
console.log(`map: ${info.map} (${info.file})  fps≈${fps}\n${stats.join('\n')}`);
console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'no errors');
console.log(`screenshots in ${out}`);
await browser.close();
