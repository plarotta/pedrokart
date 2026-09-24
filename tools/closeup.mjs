// Close-up renders of a kart from several angles (lobby attract mode, karts parked).
//   node tools/closeup.mjs [--map circuit] [--out shots/kart]
import { chromium } from 'playwright';
import fs from 'node:fs';
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? [...a, [v.slice(2), arr[i + 1]]] : a), []));
const out = args.out || 'shots/kart';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1000, height: 640 } });
const errors = [];
page.on('pageerror', (e) => { if (errors.length < 2) errors.push(e.stack); });
await page.goto(`http://localhost:8080/host?map=${args.map || 'circuit'}`);
await page.waitForFunction(() => window.pk && pk.karts.length > 0);
await page.waitForTimeout(800);
// freeze the karts where they are
await page.evaluate(() => pk.freeze());
for (const [name, yaw, dist, h, i] of [['rear', Math.PI, 5.5, 2.3, 7], ['rear3q', Math.PI * 0.78, 5.5, 2.2, 7], ['side', Math.PI / 2, 6, 1.6, 6], ['front3q', 0.6, 5.5, 2.0, 5], ['front', 0, 5, 1.8, 4]]) {
  await page.evaluate(([i, yaw, dist, h]) => pk.closeup(i, yaw, dist, h), [i, yaw, dist, h]);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/${name}.png` });
}
console.log(errors.length ? errors.join('\n') : 'no errors');
await browser.close();
