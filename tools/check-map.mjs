// Validate a map file's geometry before playing it.
//   node tools/check-map.mjs public/maps/desert.js
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTrack, track, N, idxAt, distToTrack } from '../public/track.js';
import { BARRIER, HALF_W } from '../public/config.js';
import { terrainFor } from '../public/world.js';

const file = process.argv[2];
if (!file) { console.error('usage: node tools/check-map.mjs public/maps/<map>.js'); process.exit(2); }
const map = (await import(pathToFileURL(path.resolve(file)).href)).default;
const wrap = (a) => ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
const problems = [], notes = [];
const check = (ok, msg) => { if (!ok) problems.push(msg); };

check(typeof map?.name === 'string' && map.name.length > 0, 'export default { name: "..." } is required');
check(Array.isArray(map?.ctrl) && map.ctrl.length >= 6, 'ctrl needs at least 6 [x, z] control points');
setTrack(map);
const ds = track.ds;

// 1. corner radius (walls sit BARRIER=14.4 from the centerline; tighter corners fold them)
let minR = Infinity, minRAt = 0;
for (let i = 0; i < N; i++) {
  const k = 6, da = Math.abs(wrap(track.ang[(i + k) % N] - track.ang[(i - k + N) % N]));
  const r = (2 * k * ds) / Math.max(da, 1e-6);
  if (r < minR) { minR = r; minRAt = i; }
}
check(minR >= 22, `tightest corner radius ${minR.toFixed(1)} < 22 near (${track.p[minRAt].x.toFixed(0)}, ${track.p[minRAt].z.toFixed(0)}) — spread those control points out`);

// 2. separate parts of the track must not overlap (road + shoulders + walls)
let minGap = Infinity, pair = null;
for (let i = 0; i < N; i += 2) for (let j = i + 2; j < N; j += 2) {
  const sep = Math.min(j - i, N - (j - i)) * ds;
  if (sep < 90) continue;
  const d = track.p[i].distanceTo(track.p[j]);
  if (d < minGap) { minGap = d; pair = [i, j]; }
}
check(minGap >= 2 * BARRIER + 16, `two parts of the track are only ${minGap.toFixed(1)} apart (need ≥ ${2 * BARRIER + 16}) at (${track.p[pair[0]].x.toFixed(0)}, ${track.p[pair[0]].z.toFixed(0)}) and (${track.p[pair[1]].x.toFixed(0)}, ${track.p[pair[1]].z.toFixed(0)})`);

// 3. length
check(track.len >= 900 && track.len <= 1700, `lap length ${track.len.toFixed(0)} outside 900–1700`);

// 4. the start grid (≈55 m behind ctrl[0]) and the first 30 m after it should be nearly straight
let bendStart = 0;
for (let m = -60; m <= 30; m += 2) {
  const i = (idxAt(0) + Math.round(m / ds) + N) % N;
  bendStart = Math.max(bendStart, Math.abs(wrap(track.ang[i] - track.ang[0])));
}
check(bendStart < 0.3, `start area bends ${(bendStart * 57.3).toFixed(0)}° — make ~60 m before and 30 m after ctrl[0] straight`);

// 5. extent: terrain rim mountains begin ≈360 from the track center
const b = track.bounds;
check(b.maxX - b.minX <= 560 && b.maxZ - b.minZ <= 460, `track spans ${(b.maxX - b.minX).toFixed(0)} × ${(b.maxZ - b.minZ).toFixed(0)}; keep within 560 × 460`);

// 6. placements
for (const f of map.itemRows ?? []) check(f > 0.06 && f < 0.97, `itemRows value ${f} too close to the start line`);
for (const [f, lat] of map.boostPads ?? []) {
  check(f >= 0 && f < 1, `boost pad fraction ${f} must be in [0, 1)`);
  check(Math.abs(lat) <= HALF_W - 2, `boost pad lateral offset ${lat} must be within ±${HALF_W - 2}`);
}

// 7. terrain must be flat under the road/walls
const h = terrainFor(map);
let worst = 0;
for (let i = 0; i < N; i += 8) for (const lat of [-BARRIER - 3, -HALF_W, 0, HALF_W, BARRIER + 3]) {
  const p = track.p[i], r = track.r[i], x = p.x + r.x * lat, z = p.z + r.z * lat;
  worst = Math.max(worst, Math.abs(h(x, z, distToTrack(x, z, 8))));
}
check(worst < 0.6, `terrain height reaches ${worst.toFixed(2)} under the road/walls (must stay ~0 within BARRIER+8)`);

notes.push(`name: ${map.name}`, `length: ${track.len.toFixed(0)} m (~${(track.len / 30).toFixed(0)} s/lap)`, `tightest corner: ${minR.toFixed(1)} m`,
  `closest approach: ${minGap.toFixed(1)} m`, `bounds: x ${b.minX.toFixed(0)}..${b.maxX.toFixed(0)}, z ${b.minZ.toFixed(0)}..${b.maxZ.toFixed(0)}`);
console.log(notes.join('\n'));
console.log(problems.length ? `\nFAIL\n- ${problems.join('\n- ')}` : '\nOK');
process.exit(problems.length ? 1 : 0);
