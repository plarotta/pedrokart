// Track centerline, sampled evenly, plus where things sit along it.
// The active map's data is loaded into the shared `track` object with setTrack().
import * as THREE from 'three';

export const N = 1600;

export const track = {
  name: '', p: [], t: [], r: [], ang: [], d: [], len: 0, ds: 1,
  bounds: null, center: new THREE.Vector3(), ctrl: [],
  itemRows: [], itemLanes: [], boostPads: [],
};

export function setTrack(map) {
  const curve = new THREE.CatmullRomCurve3(map.ctrl.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal');
  const pts = curve.getSpacedPoints(N);
  pts.pop();
  Object.assign(track, { name: map.name, ctrl: map.ctrl, p: [], t: [], r: [], ang: [], d: [], len: 0 });
  for (let i = 0; i < N; i++) {
    const t = pts[(i + 1) % N].clone().sub(pts[(i - 1 + N) % N]).normalize();
    track.p.push(pts[i]);
    track.t.push(t);
    track.r.push(new THREE.Vector3(-t.z, 0, t.x)); // right-hand side when facing along t
    track.ang.push(Math.atan2(t.x, t.z));
    if (i > 0) track.len += pts[i].distanceTo(pts[i - 1]);
    track.d.push(track.len);
  }
  track.len += pts[0].distanceTo(pts[N - 1]);
  track.ds = track.len / N;
  track.bounds = track.p.reduce((b, p) => ({
    minX: Math.min(b.minX, p.x), maxX: Math.max(b.maxX, p.x), minZ: Math.min(b.minZ, p.z), maxZ: Math.max(b.maxZ, p.z),
  }), { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });
  track.center.set((track.bounds.minX + track.bounds.maxX) / 2, 0, (track.bounds.minZ + track.bounds.maxZ) / 2);
  track.itemRows = map.itemRows ?? [0.13, 0.4, 0.62, 0.84];
  track.itemLanes = map.itemLanes ?? [-5.4, -1.8, 1.8, 5.4];
  track.boostPads = map.boostPads ?? [];
  return track;
}

export const idxAt = (frac) => ((Math.floor(frac * N) % N) + N) % N;
export const pointAt = (i, lat, y = 0) => {
  const p = track.p[i], r = track.r[i];
  return new THREE.Vector3(p.x + r.x * lat, y, p.z + r.z * lat);
};

export function nearestIdx(x, z, guess, range) {
  let best = guess, bd = Infinity;
  for (let o = -range; o <= range; o++) {
    const i = (guess + o + N) % N, p = track.p[i];
    const d = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}
export function distToTrack(x, z, step = 4) {
  let best = Infinity;
  for (let i = 0; i < N; i += step) { const p = track.p[i]; best = Math.min(best, (p.x - x) ** 2 + (p.z - z) ** 2); }
  return Math.sqrt(best);
}
