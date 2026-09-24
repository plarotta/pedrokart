import * as THREE from 'three';
import {
  LAPS, MAX_HUMANS, TOTAL_KARTS, HALF_W, CURB_W, WALL, MAX_SPEED, OFFROAD_MAX, BOOST_SPEED, BULLET_SPEED,
  ACCEL, BRAKE, REVERSE_MAX, TURN, SIM_HZ, STEP, HUMAN_COLORS, CPU_COLORS, CPU_NAMES, ITEM_KEYS, NO_INPUT,
  ROAD_W, BARRIER, clamp, wrap, rand, damp, hexStr,
} from './config.js';
import { track, N, setTrack, nearestIdx } from './track.js';
import { buildWorld } from './world.js';
import { buildKart, disposeKart } from './kart.js';
import { FX } from './fx.js';
import { ICONS, ICON_ORDER } from './icons.js';

const suffix = (n) => (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th');
const fmtTime = (s) => { const m = Math.floor(s / 60); return `${m}:${(s - m * 60).toFixed(2).padStart(5, '0')}`; };
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ================================================================ renderer
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);
const scene = new THREE.Scene();
const fx = new FX(scene);

// ================================================================ maps
let maps = [], mapIndex = 0, world = null;
let itemBoxes = [], pads = [];

async function loadMapList() {
  const files = await (await fetch('/maps.json')).json();
  const mods = await Promise.all(files.map(async (file) => {
    try { return { ...(await import(`./maps/${file}`)).default, file }; } catch (e) { console.error(`map ${file} failed to load`, e); return null; }
  }));
  maps = mods.filter((m) => m && Array.isArray(m.ctrl)).sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || a.name.localeCompare(b.name));
  const want = new URLSearchParams(location.search).get('map');
  mapIndex = Math.max(0, maps.findIndex((m) => m.file === `${want}.js`));
}

function loadMap(i) {
  mapIndex = (i + maps.length) % maps.length;
  const map = maps[mapIndex];
  clearRace();
  world?.dispose();
  setTrack(map);
  world = buildWorld(scene, renderer, map);
  itemBoxes = world.itemBoxes;
  pads = world.pads;
  overviewCam.position.set(track.center.x, 420, track.center.z + 80);
  overviewCam.lookAt(track.center);
  document.getElementById('mapname').textContent = map.name;
  document.getElementById('mapcount').textContent = `${mapIndex + 1} / ${maps.length}`;
}

// ================================================================ items
const shellDome = new THREE.SphereGeometry(0.62, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2);
const shellRim = new THREE.TorusGeometry(0.62, 0.13, 8, 20).rotateX(Math.PI / 2);
const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
const greenMat = new THREE.MeshPhysicalMaterial({ color: 0x2fbf4a, roughness: 0.25, clearcoat: 1 });
const blueMat = new THREE.MeshPhysicalMaterial({ color: 0x1f6fff, roughness: 0.25, clearcoat: 1, emissive: 0x0a2a88, emissiveIntensity: 0.4 });
const bananaMat = new THREE.MeshStandardMaterial({ color: 0xffd92e, roughness: 0.45, emissive: 0x332200 });
const bananaGeo = (() => {
  const pts = [];
  for (let i = 0; i <= 12; i++) { const a = -0.9 + (i / 12) * 1.8; pts.push(new THREE.Vector3(Math.sin(a) * 0.7, (1 - Math.cos(a)) * 0.7, 0)); }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.17, 8);
})();

let bananas = [], shells = [], blues = [];

function shellMesh(mat) {
  const g = new THREE.Group();
  const dome = new THREE.Mesh(shellDome, mat);
  const rim = new THREE.Mesh(shellRim, whiteMat);
  dome.castShadow = rim.castShadow = true;
  g.add(dome, rim);
  return g;
}
function blueShellMesh() {
  const g = shellMesh(blueMat);
  g.scale.setScalar(1.5);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.35, 8), whiteMat);
    spike.position.set(Math.cos(a) * 0.35, 0.5, Math.sin(a) * 0.35);
    spike.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
    g.add(spike);
  }
  const wings = [-1, 1].map((s) => {
    const w = new THREE.Mesh(new THREE.CircleGeometry(0.6, 12, 0, Math.PI), new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
    w.position.set(s * 0.7, 0.35, 0);
    w.scale.set(1.2, 0.7, 1);
    g.add(w);
    return w;
  });
  g.userData.wings = wings;
  return g;
}
function spawnBanana(x, z) {
  const mesh = new THREE.Mesh(bananaGeo, bananaMat);
  mesh.position.set(x, 0.15, z);
  mesh.rotation.y = rand(0, 6);
  mesh.castShadow = true;
  scene.add(mesh);
  bananas.push({ mesh, x, z });
  if (bananas.length > 24) removeFrom(bananas, bananas[0]);
}
function spawnShell(k, fx_, fz) {
  const mesh = shellMesh(greenMat);
  const x = k.x + fx_ * 2.9, z = k.z + fz * 2.9, v = 52 + Math.max(0, k.speed) * 0.5;
  mesh.position.set(x, 0.3, z);
  scene.add(mesh);
  shells.push({ mesh, x, z, vx: fx_ * v, vz: fz * v, idx: k.idx, age: 0, owner: k });
}
function spawnBlue(k) {
  const mesh = blueShellMesh();
  scene.add(mesh);
  blues.push({ mesh, x: k.x, z: k.z, y: 2, idxf: k.idx, lat: k.lat, age: 0, owner: k, diving: false, diveT: 0 });
}
function removeFrom(list, obj) {
  scene.remove(obj.mesh);
  list.splice(list.indexOf(obj), 1);
}
function rollItem(place) {
  const t = (place - 1) / (TOTAL_KARTS - 1); // 0 = leader, 1 = last
  const w = {
    banana: 0.5 - 0.42 * t, shell: 0.32 - 0.1 * t, mushroom: 0.12 + 0.32 * t,
    blueshell: t > 0.35 && !blues.length ? 0.09 * t : 0,
    bullet: t > 0.7 ? 0.4 * (t - 0.7) / 0.3 : 0,
  };
  let r = Math.random() * Object.values(w).reduce((a, b) => a + b, 0);
  for (const [k, v] of Object.entries(w)) if ((r -= v) <= 0) return k;
  return 'mushroom';
}
function useItem(k) {
  const it = k.item;
  k.item = null;
  const fx_ = Math.sin(k.heading), fz = Math.cos(k.heading);
  if (it === 'mushroom') k.boost = Math.max(k.boost, 1.4);
  else if (it === 'banana') spawnBanana(k.x - fx_ * 2.9, k.z - fz * 2.9);
  else if (it === 'shell') spawnShell(k, fx_, fz);
  else if (it === 'blueshell') spawnBlue(k);
  else if (it === 'bullet') { k.bullet = 3.6; k.drift = false; k.spin = 0; fx.pop(new THREE.Vector3(k.x, 1, k.z)); }
}
function hit(k, big = false) {
  if (k.spin > 0 || k.bullet > 0) return;
  k.spin = k.spinMax = big ? 1.8 : 1.2;
  k.speed *= big ? 0.1 : 0.3;
  k.boost = 0; k.drift = false; k.driftCharge = 0;
  if (big) k.hopV = 9;
  fx.stars(new THREE.Vector3(k.x, 1.8, k.z));
  const v = views.find((v) => v.kart === k);
  if (v) v.shake = big ? 1 : 0.5;
  if (k.player) sendTo(k.player.pid, { t: 'hit' });
}

// ================================================================ game state
let phase = 'lobby'; // lobby | countdown | race | results
let karts = [];
let views = [];
let countdown = 0, raceTime = 0, endTimer = 0, resultsAge = 0;
const players = new Map(); // pid -> { pid, name, color, connected, isKeyboard, input, menuPrev, driftPrev }

function createKart(name, color, player, variant) {
  return {
    name, color, player, v: buildKart(color, name, variant),
    brain: { lane: rand(-4, 4), seed: rand(0, 100), skill: rand(0.9, 0.98), t: 0, drifting: false, driftTime: 0, driftMax: rand(1.5, 2.4), itemTimer: 0 },
    x: 0, z: 0, heading: 0, vx: 0, vz: 0, speed: 0, idx: 0, lat: 0, lap: 0, maxLap: 0, progress: 0, place: 1,
    drift: false, driftDir: 0, driftCharge: 0, boost: 0, spin: 0, spinMax: 1.2, hopY: 0, hopV: 0, bullet: 0,
    item: null, itemRoll: 0, prevItemBtn: 0, finished: false, finishTime: 0, maxMul: 1, gasAt: null,
    steer: 0, steerVis: 0, driftYawVis: 0, src: 'c', lastInput: NO_INPUT,
  };
}

function clearRace() {
  for (const k of karts) { scene.remove(k.v.root); disposeKart(k.v); }
  for (const v of views) v.hud.el.remove();
  for (const list of [bananas, shells, blues]) for (const o of [...list]) removeFrom(list, o);
  karts = []; views = [];
  for (const b of itemBoxes) { b.respawn = 0; b.mesh.visible = true; }
}

function setupRace(humans) {
  clearRace();
  const list = [];
  for (let i = 0; i < TOTAL_KARTS - humans.length; i++) list.push(createKart(CPU_NAMES[i], CPU_COLORS[i], null, i));
  humans.forEach((p, i) => list.push(createKart(p.name, p.color, p, i + 3))); // humans start at the back
  list.forEach((k, s) => {
    const row = Math.floor(s / 2), side = s % 2 ? 1 : -1;
    const back = 8 + row * 6.5 + (s % 2) * 3;
    const i = (N - Math.round(back / track.ds)) % N, p = track.p[i], r = track.r[i];
    k.x = p.x + r.x * side * 3.8; k.z = p.z + r.z * side * 3.8;
    k.heading = track.ang[i]; k.idx = i;
    k.progress = track.d[i];
    scene.add(k.v.root);
  });
  karts = list;
  views = list.filter((k) => k.player).map(makeView);
  layout();
}

function startRace() {
  const humans = [...players.values()].filter((p) => p.connected).slice(0, MAX_HUMANS);
  if (!humans.length) humans.push(ensureKeyboardPlayer());
  setupRace(humans);
  phase = 'countdown';
  countdown = 3;
  lastCount = 0;
  raceTime = 0; endTimer = 0;
  setStartLights(0, false);
  document.getElementById('lobby').classList.add('hidden');
  rec.start();
}

function goLobby() {
  for (const [pid, p] of players) if (!p.connected) players.delete(pid);
  phase = 'lobby';
  setupRace([]); // attract mode: CPUs race in the background
  setStartLights(0, false);
  document.getElementById('results').classList.add('hidden');
  document.getElementById('lobby').classList.remove('hidden');
  renderRoster();
}

function changeMap(delta) {
  if (phase !== 'lobby' || maps.length < 2) return;
  loadMap(mapIndex + delta);
  setupRace([]);
}

function showResults() {
  rec.end();
  phase = 'results';
  resultsAge = 0;
  const rows = [...karts].sort((a, b) => a.place - b.place).map((k, i) => `
    <tr class="${k.player ? 'human' : ''}" style="--c:${hexStr(k.color)}; animation-delay:${i * 0.07}s">
      <td class="pl p${Math.min(k.place, 4)}">${k.place}<small>${suffix(k.place)}</small></td><td><span class="dot"></span>${esc(k.name)}</td>
      <td class="t">${k.finished ? fmtTime(k.finishTime) : '—'}</td></tr>`).join('');
  const el = document.getElementById('results');
  el.querySelector('.panel').innerHTML = `<h1>RESULTS</h1><div class="sub">${esc(maps[mapIndex].name)}</div><table>${rows}</table>
    <div class="hint">Press <b>ITEM</b> or <b>Enter</b> to go back to the lobby</div>`;
  el.classList.remove('hidden');
}

function menuAction() {
  if (phase === 'lobby') startRace();
  else if (phase === 'results' && resultsAge > 1) goLobby();
}

function setStartLights(red, green) {
  world?.startLights.forEach((m, i) => m.material.color.setHex(green ? 0x39ff7a : i < red ? 0xff2a2a : 0x2a0f0f));
}

// ================================================================ simulation
function autoSteer(k, lane, look) {
  const ahead = (k.idx + Math.round(look / track.ds)) % N;
  const p = track.p[ahead], r = track.r[ahead];
  const diff = wrap(Math.atan2(p.x + r.x * lane - k.x, p.z + r.z * lane - k.z) - k.heading);
  return clamp(-diff * 2.5, -1, 1);
}

function updateKart(k, inp, dt) {
  if (k.bullet > 0) {
    k.bullet -= dt;
    inp = { steer: autoSteer(k, 0, 16), gas: 1, brake: 0, drift: 0, item: 0 };
    if (k.bullet <= 0) { k.bullet = 0; k.boost = Math.max(k.boost, 0.6); k.hopV = 5; fx.pop(new THREE.Vector3(k.x, 1, k.z)); }
  }
  const stunned = k.spin > 0;
  if (stunned) { k.spin -= dt; inp = NO_INPUT; }
  const steer = clamp(inp.steer || 0, -1, 1);
  k.steer = steer;

  // --- speed
  const offroad = Math.abs(k.lat) > HALF_W + CURB_W;
  let max = (offroad ? OFFROAD_MAX : MAX_SPEED) * k.maxMul;
  if (k.bullet > 0) { max = BULLET_SPEED; k.speed += ACCEL * 4 * dt; }
  else if (k.boost > 0) { k.boost -= dt; max = BOOST_SPEED; k.speed += ACCEL * 3 * dt; }
  else if (inp.gas && !inp.brake) k.speed += ACCEL * dt * (k.speed < 0 ? 2.5 : 1 - 0.35 * clamp(k.speed / max, 0, 1));
  else if (inp.brake) k.speed -= (k.speed > 0 ? BRAKE : ACCEL * 0.6) * dt;
  else k.speed -= Math.sign(k.speed) * Math.min(Math.abs(k.speed), 9 * dt);
  if (k.speed > max) k.speed = Math.max(max, k.speed - 35 * dt);
  k.speed = Math.max(k.speed, -REVERSE_MAX);
  if (stunned) k.speed *= Math.exp(-2.5 * dt);

  // --- drifting: hold DRIFT while steering; release for a mini-turbo
  if (k.drift) {
    if (!inp.drift || k.speed < 10) {
      if (k.driftCharge > 2.0) k.boost = Math.max(k.boost, 1.1);
      else if (k.driftCharge > 1.0) k.boost = Math.max(k.boost, 0.6);
      k.drift = false; k.driftCharge = 0;
    } else {
      k.driftCharge += dt * (0.6 + 0.9 * Math.max(0, steer * k.driftDir));
    }
  } else if (inp.drift && Math.abs(steer) > 0.3 && k.speed > 14 && k.hopY <= 0) {
    k.drift = true; k.driftDir = Math.sign(steer); k.driftCharge = 0; k.hopV = 4.5;
  }

  // --- steering (right = decreasing heading)
  const spd = Math.abs(k.speed);
  const turnK = clamp(spd / 9, 0, 1) * (1 - 0.3 * clamp(spd / MAX_SPEED, 0, 1));
  const turn = k.drift
    ? k.driftDir * TURN * turnK * (0.5 + 0.35 * (1 + steer * k.driftDir))
    : steer * TURN * turnK * (k.speed >= 0 ? 1 : -1);
  k.heading = wrap(k.heading - turn * dt);

  // --- velocity chases the facing direction; low grip while drifting = slide
  const fx_ = Math.sin(k.heading), fz = Math.cos(k.heading);
  const a = damp(k.bullet > 0 ? 14 : stunned ? 1.5 : k.drift ? 3 : 10, dt);
  k.vx += (fx_ * k.speed - k.vx) * a;
  k.vz += (fz * k.speed - k.vz) * a;
  k.x += k.vx * dt; k.z += k.vz * dt;

  if (k.hopY > 0 || k.hopV > 0) {
    k.hopV -= 30 * dt;
    k.hopY = Math.max(0, k.hopY + k.hopV * dt);
    if (k.hopY === 0) k.hopV = 0;
  }

  // --- track position, walls, laps
  const prev = k.idx;
  k.idx = nearestIdx(k.x, k.z, k.idx, 30);
  const p = track.p[k.idx], r = track.r[k.idx];
  k.lat = (k.x - p.x) * r.x + (k.z - p.z) * r.z;
  if (Math.abs(k.lat) > WALL) {
    const side = Math.sign(k.lat), push = k.lat - side * WALL;
    k.x -= r.x * push; k.z -= r.z * push;
    const vl = k.vx * r.x + k.vz * r.z;
    if (vl * side > 0) {
      k.vx -= r.x * vl * 1.5; k.vz -= r.z * vl * 1.5;
      if (Math.abs(vl) > 5) {
        k.speed *= 0.82;
        fx.burst(new THREE.Vector3(k.x + r.x * side * 1.2, 0.7, k.z + r.z * side * 1.2), [0xffd27a, 0xffffff], 14, 7, 0.3);
        const v = views.find((v) => v.kart === k);
        if (v) v.shake = Math.max(v.shake, 0.3);
      }
    }
    k.speed *= 0.99;
    k.lat = side * WALL;
  }
  for (const pad of pads) {
    let di = k.idx - pad.idx;
    if (di > N / 2) di -= N; else if (di < -N / 2) di += N;
    if (Math.abs(di * track.ds) < 3.4 && Math.abs(k.lat - pad.lat) < 2.3 && k.bullet <= 0) k.boost = Math.max(k.boost, 0.9);
  }
  if (prev > N * 0.8 && k.idx < N * 0.2) k.lap++;
  else if (prev < N * 0.2 && k.idx > N * 0.8) k.lap--;
  k.progress = k.lap * track.len + track.d[k.idx];

  if (phase === 'race' && k.player && k.lap > k.maxLap) {
    k.maxLap = k.lap;
    if (k.lap === LAPS && LAPS > 1) banner(viewOf(k), 'FINAL LAP!', 1.6, 'final');
    else if (k.lap > 1 && k.lap < LAPS) banner(viewOf(k), `LAP ${k.lap}`, 1.2);
  }
  if (phase === 'race' && !k.finished && k.lap > LAPS) {
    k.finished = true;
    k.finishTime = raceTime;
    if (k.player) banner(viewOf(k), 'FINISH!', 2.5, 'finish');
  }

  // --- items
  if (k.itemRoll > 0) k.itemRoll -= dt;
  if (inp.item && !k.prevItemBtn && k.item && k.itemRoll <= 0) useItem(k);
  k.prevItemBtn = inp.item;
}
const viewOf = (k) => views.find((v) => v.kart === k);

let humanRef = null; // average progress of racing humans, for CPU rubber-banding

function cpuInput(k, dt) {
  const b = k.brain;
  b.t += dt;
  const spd = Math.max(k.speed, 0);
  const lane = clamp(b.lane + Math.sin(b.t * 0.35 + b.seed) * 2.5, -HALF_W + 2, HALF_W - 2);
  const steer = autoSteer(k, lane, 7 + spd * 0.45);

  const bend = wrap(track.ang[(k.idx + Math.round(28 / track.ds)) % N] - track.ang[k.idx]);
  if (!b.drifting && Math.abs(bend) > 0.7 && spd > 22) { b.drifting = true; b.driftTime = 0; }
  if (b.drifting) {
    b.driftTime += dt;
    if (Math.abs(bend) < 0.3 || b.driftTime > b.driftMax) b.drifting = false;
  }
  if (!k.player) {
    k.maxMul = humanRef == null ? b.skill : b.skill * clamp(1 - (k.progress - humanRef) / 900, 0.85, 1.12);
  }

  let item = 0;
  if (k.item && k.itemRoll <= 0) {
    b.itemTimer -= dt;
    if (b.itemTimer <= 0) {
      if (k.item === 'shell') {
        const fx_ = Math.sin(k.heading), fz = Math.cos(k.heading);
        const target = karts.some((o) => {
          if (o === k) return false;
          const dx = o.x - k.x, dz = o.z - k.z, d = Math.hypot(dx, dz);
          return d < 40 && (dx * fx_ + dz * fz) / d > 0.93;
        });
        if (target || b.itemTimer < -8) item = 1;
      } else if (k.item === 'mushroom') {
        if (Math.abs(bend) < 0.3 || b.itemTimer < -4) item = 1;
      } else item = 1;
    }
  }
  const drift = b.drifting && (k.drift || steer * bend < 0) ? 1 : 0;
  return { steer, gas: 1, brake: 0, drift, item };
}

// 'h' human driving, 'n' human disconnected (coasting), 'x' item autopilot (Bullet Bill), 'c' CPU or post-finish autopilot
function controlSource(k) {
  if (k.player && !k.finished && phase !== 'results') return k.bullet > 0 ? 'x' : k.player.connected ? 'h' : 'n';
  return 'c';
}
function inputFor(k, dt) {
  if (k.player && !k.finished && phase !== 'results') return k.player.connected ? k.player.input : NO_INPUT;
  return cpuInput(k, dt); // CPUs, plus autopilot for humans who have finished
}

function collideKarts() {
  const R = 2.5;
  for (let i = 0; i < karts.length; i++) {
    for (let j = i + 1; j < karts.length; j++) {
      const a = karts[i], b = karts[j];
      const dx = b.x - a.x, dz = b.z - a.z, d2 = dx * dx + dz * dz;
      const rr = a.bullet > 0 || b.bullet > 0 ? R + 0.8 : R;
      if (d2 >= rr * rr || d2 === 0) continue;
      if (a.bullet > 0 && b.bullet <= 0) hit(b);
      if (b.bullet > 0 && a.bullet <= 0) hit(a);
      const d = Math.sqrt(d2), nx = dx / d, nz = dz / d, push = (rr - d) / 2;
      const wa = a.bullet > 0 ? 0 : 1, wb = b.bullet > 0 ? 0 : 1, ws = wa + wb || 1;
      a.x -= nx * push * 2 * wa / ws; a.z -= nz * push * 2 * wa / ws;
      b.x += nx * push * 2 * wb / ws; b.z += nz * push * 2 * wb / ws;
      const rv = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
      if (rv < 0) {
        const imp = -rv * 0.9;
        a.vx -= nx * imp * wa; a.vz -= nz * imp * wa; b.vx += nx * imp * wb; b.vz += nz * imp * wb;
      }
    }
  }
}

function updateHazards(dt) {
  for (const s of [...shells]) {
    s.age += dt;
    s.x += s.vx * dt; s.z += s.vz * dt;
    s.idx = nearestIdx(s.x, s.z, s.idx, 40);
    const p = track.p[s.idx], r = track.r[s.idx];
    const lat = (s.x - p.x) * r.x + (s.z - p.z) * r.z;
    if (Math.abs(lat) > WALL + 0.5) {       // bounce off the walls
      const vl = s.vx * r.x + s.vz * r.z;
      if (vl * lat > 0) { s.vx -= 2 * vl * r.x; s.vz -= 2 * vl * r.z; }
    }
    s.mesh.position.set(s.x, 0.3, s.z);
    s.mesh.rotation.y += dt * 14;
    let gone = s.age > 7;
    for (const bn of [...bananas]) {
      if (!gone && (bn.x - s.x) ** 2 + (bn.z - s.z) ** 2 < 2.2) { removeFrom(bananas, bn); gone = true; }
    }
    for (const k of karts) {
      if (gone || (k === s.owner && s.age < 0.5)) continue;
      if ((k.x - s.x) ** 2 + (k.z - s.z) ** 2 < 3.4) { hit(k); gone = true; }
    }
    if (gone) { fx.burst(new THREE.Vector3(s.x, 0.6, s.z), [0x2fbf4a, 0xffffff], 20, 7, 0.4); removeFrom(shells, s); }
  }
  for (const bn of [...bananas]) {
    const k = karts.find((k) => (k.spin <= 0 || k.bullet > 0) && (k.x - bn.x) ** 2 + (k.z - bn.z) ** 2 < 2.8);
    if (k) { hit(k); removeFrom(bananas, bn); }
  }
  // Blue shells fly along the track to whoever is in 1st, then dive-bomb them.
  for (const b of [...blues]) {
    b.age += dt;
    const target = karts.find((k) => k.place === 1);
    if (!target) { removeFrom(blues, b); continue; }
    b.mesh.userData.wings.forEach((w, i) => { w.rotation.z = (i ? -1 : 1) * Math.sin(b.age * 30) * 0.6; });
    if (!b.diving) {
      b.idxf = (b.idxf + (78 * dt) / track.ds) % N;
      const i = Math.floor(b.idxf);
      b.lat += (0 - b.lat) * damp(2, dt);
      b.x = track.p[i].x + track.r[i].x * b.lat; b.z = track.p[i].z + track.r[i].z * b.lat;
      b.y += (5 - b.y) * damp(3, dt);
      const ahead = ((target.idx - i + N) % N) * track.ds;
      if (ahead < 9 && b.age > 0.8) { b.diving = true; b.diveT = 0; b.from = new THREE.Vector3(b.x, b.y, b.z); }
    } else {
      b.diveT += dt / 0.6;
      const t = Math.min(1, b.diveT);
      b.x = b.from.x + (target.x - b.from.x) * t; b.z = b.from.z + (target.z - b.from.z) * t;
      b.y = b.from.y * (1 - t) + Math.sin(t * Math.PI) * 5 + 0.4 * t;
      if (t >= 1) {
        const p = new THREE.Vector3(b.x, 1, b.z);
        fx.explosion(p);
        for (const k of karts) if ((k.x - b.x) ** 2 + (k.z - b.z) ** 2 < 49) hit(k, true);
        for (const v of views) { const d = Math.hypot(v.kart.x - b.x, v.kart.z - b.z); v.shake = Math.max(v.shake, clamp(1 - d / 60, 0, 1)); }
        removeFrom(blues, b);
        continue;
      }
    }
    b.mesh.position.set(b.x, b.y, b.z);
    b.mesh.rotation.y += dt * 8;
  }
}

function pickups(dt) {
  for (const b of itemBoxes) {
    if (b.respawn > 0) {
      b.respawn -= dt;
      if (b.respawn <= 0) b.mesh.visible = true;
      continue;
    }
    const k = karts.find((k) => (k.x - b.x) ** 2 + (k.z - b.z) ** 2 < 6);
    if (!k) continue;
    b.respawn = 3;
    b.mesh.visible = false;
    b.mesh.scale.setScalar(0.001);
    fx.burst(new THREE.Vector3(b.x, 1.5, b.z), [0xff5e7e, 0xffc35e, 0x6effa0, 0x5ed2ff, 0xb77bff], 30, 8, 0.45);
    if (!k.item) {
      k.item = rollItem(k.place);
      k.itemRoll = 1.0;
      k.brain.itemTimer = rand(1, 4);
    }
  }
}

function computePlaces() {
  [...karts].sort((a, b) => {
    if (a.finished && b.finished) return a.finishTime - b.finishTime;
    if (a.finished !== b.finished) return a.finished ? -1 : 1;
    return b.progress - a.progress;
  }).forEach((k, i) => { k.place = i + 1; });
}

function simulate(dt) {
  const racing = karts.filter((k) => k.player && !k.finished);
  humanRef = racing.length ? racing.reduce((s, k) => s + k.progress, 0) / racing.length : null;
  const inputs = karts.map((k) => inputFor(k, dt));
  karts.forEach((k, i) => {
    k.lastInput = inputs[i];
    k.src = controlSource(k);
    updateKart(k, inputs[i], dt);
  });
  collideKarts();
  updateHazards(dt);
  pickups(dt);
  computePlaces();
}

// ================================================================ visuals
const tmpV = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpS = new THREE.Vector3();
function updateKartVisual(k, dt) {
  const v = k.v;
  v.root.position.set(k.x, 0, k.z);
  v.root.rotation.y = k.heading;
  k.steerVis += (k.steer - k.steerVis) * damp(12, dt);
  k.driftYawVis += ((k.drift ? -k.driftDir * 0.38 : 0) - k.driftYawVis) * damp(10, dt);
  const spinVis = k.spin > 0 ? (1 - (k.spin / k.spinMax) ** 2) * Math.PI * (k.spinMax > 1.5 ? 6 : 4) : 0;
  const isBullet = k.bullet > 0;
  v.body.visible = !isBullet;
  v.bullet.visible = isBullet;
  v.body.rotation.y = k.driftYawVis + spinVis;
  v.body.rotation.z = k.steerVis * 0.08 * clamp(k.speed / MAX_SPEED, 0, 1) + (k.drift ? k.driftDir * 0.06 : 0);
  const offroad = Math.abs(k.lat) > HALF_W + CURB_W && Math.abs(k.speed) > 3;
  const rumble = offroad ? Math.sin(performance.now() / 35 + k.x) * 0.05 : 0;
  v.body.position.y = k.hopY + rumble;
  v.body.rotation.x = -clamp(k.hopV, -5, 5) * 0.02;
  if (isBullet) v.bullet.rotation.z += dt * 3;
  for (const w of v.wheels) w.rotation.x += (k.speed * dt) / 0.5;
  for (const s of v.steerers) s.rotation.y = -k.steerVis * 0.45;
  v.head.rotation.y = -k.steerVis * 0.35 + (k.drift ? -k.driftDir * 0.2 : 0);

  v.root.updateMatrixWorld();
  const fxv = Math.sin(k.heading), fzv = Math.cos(k.heading);
  tmpB.set(-fxv, 0, -fzv);
  if (k.drift && k.driftCharge > 0.25) {
    const col = k.driftCharge > 2.0 ? 0xff8a1a : k.driftCharge > 1.0 ? 0x3aa8ff : 0xfff3b0;
    for (const w of v.rearWheels) {
      w.getWorldPosition(tmpV);
      tmpV.y = 0.25;
      tmpS.set(Math.cos(k.heading), 0, -Math.sin(k.heading));
      fx.sparks(tmpV, tmpB, tmpS, col, k.driftCharge > 1.0);
      if (Math.random() < 0.5) fx.tireSmoke(tmpV);
    }
  }
  if (k.boost > 0 || isBullet) {
    for (const e of v.exhausts) { e.getWorldPosition(tmpV); fx.flame(tmpV, tmpB, isBullet || k.boost > 0.6); }
  }
  if (isBullet) fx.trail(tmpV.set(k.x - fxv * 2.4, 1.3, k.z - fzv * 2.4), tmpB);
  if (offroad && world) { for (const w of v.rearWheels) { w.getWorldPosition(tmpV); fx.dust(tmpV, world.theme.shoulder.base, 0.5); } }
  if (k.finished && k.player && Math.random() < 0.5) fx.confetti(tmpV.set(k.x, 0, k.z));
}

// ================================================================ cameras, HUD, layout
const hudRoot = document.getElementById('hud');
const minimap = document.getElementById('minimap');
const mm = minimap.getContext('2d');
const attractCam = new THREE.PerspectiveCamera(55, 1, 0.3, 4000);
const overviewCam = new THREE.PerspectiveCamera(50, 1, 1, 4000);

function makeView(k) {
  const el = document.createElement('div');
  el.className = 'vp';
  el.style.setProperty('--c', hexStr(k.color));
  el.innerHTML = `<div class="speedlines"></div>
    <div class="itemslot"><div class="ring"></div><div class="icon"></div></div>
    <div class="time"></div>
    <div class="lap"><small>LAP</small><span></span></div>
    <div class="place"></div>
    <div class="tag"></div>
    <div class="banner"></div>`;
  hudRoot.appendChild(el);
  const q = (s) => el.querySelector(s);
  q('.tag').textContent = k.name;
  return {
    kart: k, camH: k.heading, rect: [0, 0, 1, 1], shake: 0, roll: 0,
    cam: new THREE.PerspectiveCamera(72, 1, 0.3, 4000),
    hud: { el, lap: q('.lap span'), time: q('.time'), slot: q('.itemslot'), icon: q('.itemslot .icon'), place: q('.place'), banner: q('.banner'), lines: q('.speedlines'), cache: {} },
  };
}

function banner(view, text, dur = 1.2, cls = '') {
  if (!view) return;
  const b = view.hud.banner;
  b.textContent = text;
  b.className = `banner ${cls}`;
  b.style.animationDuration = `${dur}s`;
  void b.offsetWidth;
  b.classList.add('pop');
}

function layout() {
  const W = innerWidth, H = innerHeight, n = views.length;
  renderer.setSize(W, H);
  const rects = n <= 1 ? [[0, 0, W, H]]
    : n === 2 ? [[0, 0, W / 2, H], [W / 2, 0, W / 2, H]]
      : [[0, 0, W / 2, H / 2], [W / 2, 0, W / 2, H / 2], [0, H / 2, W / 2, H / 2], [W / 2, H / 2, W / 2, H / 2]];
  views.forEach((v, i) => {
    v.hud.el.classList.toggle('solo', n === 1);
    const [x, y, w, h] = (v.rect = rects[i]);
    Object.assign(v.hud.el.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px`, fontSize: `${Math.min(w, h * 1.6) / 48}px` });
    v.cam.aspect = w / h;
    v.cam.updateProjectionMatrix();
  });
  attractCam.aspect = W / H;
  attractCam.updateProjectionMatrix();
  overviewCam.aspect = W / H;
  overviewCam.updateProjectionMatrix();
  const s = n <= 1 ? Math.min(210, H * 0.3) : Math.min(170, H * 0.22);
  Object.assign(minimap.style, n <= 1
    ? { left: 'auto', right: '18px', top: `${H * 0.5 - s / 2}px`, width: `${s}px`, height: `${s}px` }
    : { left: `${W / 2 - s / 2}px`, right: 'auto', top: `${H / 2 - s / 2}px`, width: `${s}px`, height: `${s}px` });
  minimap.style.display = n === 0 || n === 3 ? 'none' : 'block'; // 3 players get a live overview quadrant instead
}
addEventListener('resize', layout);

function updateCam(v, dt) {
  const k = v.kart;
  const target = k.heading + (k.drift ? k.driftDir * 0.18 : 0);
  v.camH += wrap(target - v.camH) * damp(k.drift ? 4 : 6, dt);
  const fx_ = Math.sin(v.camH), fz = Math.cos(v.camH);
  const big = k.bullet > 0 ? 1 : 0;
  v.big = (v.big || 0) + (big - (v.big || 0)) * damp(3, dt);
  const dist = 6.4 + clamp(k.speed / MAX_SPEED, 0, 1.5) * 0.9 + v.big * 3;
  v.shake = Math.max(0, v.shake - dt * 2);
  const sh = v.shake * v.shake * 0.6;
  v.cam.position.set(k.x - fx_ * dist + rand(-sh, sh), 2.7 + v.big * 1.3 + k.hopY * 0.35 + rand(-sh, sh), k.z - fz * dist + rand(-sh, sh));
  v.cam.lookAt(k.x + fx_ * 6, 1.3 + k.hopY * 0.2, k.z + fz * 6);
  v.roll += ((k.drift ? k.driftDir * 0.05 : k.steerVis * 0.015) - v.roll) * damp(4, dt);
  v.cam.rotateZ(v.roll);
  const fov = 70 + clamp(k.speed / MAX_SPEED, 0, 1.5) * 9 + (k.boost > 0 ? 7 : 0) + (k.bullet > 0 ? 12 : 0);
  v.cam.fov += (fov - v.cam.fov) * damp(4, dt);
  v.cam.updateProjectionMatrix();
}

let attractT = 0, topView = false, closeup = null;
function updateAttractCam(dt) {
  attractT += dt;
  if (closeup) {
    const k = karts[closeup.i], a = k.heading + closeup.yaw;
    attractCam.position.set(k.x + Math.sin(a) * closeup.dist, closeup.h, k.z + Math.cos(a) * closeup.dist);
    attractCam.lookAt(k.x, 1.1, k.z);
    return;
  }
  if (topView) {
    const b = track.bounds, span = Math.max(b.maxX - b.minX, (b.maxZ - b.minZ) * attractCam.aspect);
    attractCam.position.set(track.center.x, span * 0.95, track.center.z + span * 0.35);
    attractCam.lookAt(track.center);
    return;
  }
  const leader = karts.find((k) => k.place === 1) || karts[0];
  if (!leader) return;
  const a = attractT * 0.12;
  const target = new THREE.Vector3(leader.x + Math.cos(a) * 22, 9, leader.z + Math.sin(a) * 22);
  attractCam.position.lerp(target, damp(2, dt));
  attractCam.lookAt(leader.x, 1.5, leader.z);
}

function setHud(v, key, el, html) {
  if (v.hud.cache[key] === html) return;
  v.hud.cache[key] = html;
  el.innerHTML = html;
}
function updateHud(v) {
  const k = v.kart;
  setHud(v, 'lap', v.hud.lap, `${clamp(k.lap, 1, LAPS)}<small>/${LAPS}</small>`);
  setHud(v, 'time', v.hud.time, fmtTime(k.finished ? k.finishTime : raceTime));
  setHud(v, 'place', v.hud.place, `<span class="n p${Math.min(k.place, 4)}">${k.place}</span><span class="s p${Math.min(k.place, 4)}">${suffix(k.place)}</span>`);
  const rolling = k.itemRoll > 0;
  v.hud.slot.classList.toggle('rolling', rolling);
  v.hud.slot.classList.toggle('full', !!k.item && !rolling);
  const icon = rolling ? ICON_ORDER[Math.floor(performance.now() / 70) % ICON_ORDER.length] : k.item;
  setHud(v, 'item', v.hud.icon, icon ? ICONS[icon] : '');
  const lines = k.bullet > 0 ? 1 : k.boost > 0 ? 0.75 : clamp((k.speed - MAX_SPEED * 0.97) / 4, 0, 0.3);
  v.hud.lines.style.opacity = lines.toFixed(2);
}

function drawMinimap() {
  if (!views.length) return;
  const S = minimap.width, pad = 28, b = track.bounds;
  const scale = (S - pad * 2) / Math.max(b.maxX - b.minX, b.maxZ - b.minZ);
  const ox = (S - (b.maxX - b.minX) * scale) / 2, oz = (S - (b.maxZ - b.minZ) * scale) / 2;
  const X = (x) => ox + (x - b.minX) * scale, Z = (z) => oz + (z - b.minZ) * scale;
  mm.clearRect(0, 0, S, S);
  mm.lineJoin = 'round';
  mm.beginPath();
  for (let i = 0; i <= N; i += 8) { const p = track.p[i % N]; i ? mm.lineTo(X(p.x), Z(p.z)) : mm.moveTo(X(p.x), Z(p.z)); }
  mm.closePath();
  mm.strokeStyle = 'rgba(0,0,0,.45)'; mm.lineWidth = 26; mm.stroke();
  mm.strokeStyle = '#ffffff'; mm.lineWidth = 19; mm.stroke();
  mm.strokeStyle = '#8b93a3'; mm.lineWidth = 12; mm.stroke();
  const s0 = track.p[0], r0 = track.r[0];
  mm.strokeStyle = '#111'; mm.lineWidth = 5;
  mm.beginPath(); mm.moveTo(X(s0.x - r0.x * 8), Z(s0.z - r0.z * 8)); mm.lineTo(X(s0.x + r0.x * 8), Z(s0.z + r0.z * 8)); mm.stroke();
  for (const bl of blues) { mm.fillStyle = '#1f6fff'; mm.beginPath(); mm.arc(X(bl.x), Z(bl.z), 8, 0, 7); mm.fill(); }
  for (const k of [...karts].sort((a, b2) => !!a.player - !!b2.player || b2.place - a.place)) {
    const r = k.player ? 15 : 11;
    mm.beginPath(); mm.arc(X(k.x), Z(k.z), r, 0, Math.PI * 2);
    mm.fillStyle = hexStr(k.color); mm.fill();
    mm.lineWidth = k.player ? 4 : 3; mm.strokeStyle = k.player ? '#fff' : 'rgba(0,0,0,.7)'; mm.stroke();
    mm.fillStyle = k.color === 0xf5f5f5 || k.color === 0xfdd835 ? '#222' : '#fff';
    mm.font = `${k.player ? 16 : 12}px "Luckiest Guy", sans-serif`; mm.textAlign = 'center'; mm.textBaseline = 'middle';
    mm.fillText(k.name[0].toUpperCase(), X(k.x), Z(k.z) + 1);
  }
}

function renderView(cam, x, y, w, h, focus) {
  const H = innerHeight;
  renderer.setViewport(x, H - y - h, w, h);
  renderer.setScissor(x, H - y - h, w, h);
  world.aimSun(focus.x, focus.z);
  fx.setViewport(h * renderer.getPixelRatio(), cam.fov);
  renderer.render(scene, cam);
}
function render() {
  if (!world) return;
  const W = innerWidth, H = innerHeight;
  renderer.setScissorTest(true);
  if (!views.length) { renderView(attractCam, 0, 0, W, H, attractCam.position); return; }
  for (const v of views) {
    for (const k of karts) k.v.label.visible = k !== v.kart;
    const k = v.kart;
    const [x, y, w, h] = v.rect;
    renderView(v.cam, x, y, w, h, { x: k.x + Math.sin(k.heading) * 30, z: k.z + Math.cos(k.heading) * 30 });
  }
  for (const k of karts) k.v.label.visible = true;
  if (views.length === 3) renderView(overviewCam, W / 2, H / 2, W / 2, H / 2, track.center);
}

// ================================================================ players & network
// The server gives this screen a room (code + secret token). The token is kept for the tab's lifetime so
// a reload reattaches to the same room and connected phones stay in the game.
let ws = null, room = null;
const ROOM_KEY = 'pk_room';
function connect() {
  let saved = null;
  try { saved = JSON.parse(sessionStorage.getItem(ROOM_KEY)); } catch {}
  const q = new URLSearchParams({ role: 'host', ...(saved ? { room: saved.code, token: saved.token } : {}) });
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?${q}`);
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.t === 'room') setRoom(m);
    else if (m.t === 'error') showRoomError(m.error);
    else if (m.t === 'join') addPlayer(m.pid, m.name, false, m.rec);
    else if (m.t === 'leave') removePlayer(m.pid);
    else if (m.t === 'msg') onPlayerMsg(m.pid, m.m, 'relay');
  };
  ws.onclose = () => setTimeout(connect, 1000);
}
function setRoom(m) {
  room = m;
  try { sessionStorage.setItem(ROOM_KEY, JSON.stringify({ code: m.code, token: m.token })); } catch {}
  document.getElementById('roomcode').textContent = m.code;
  document.getElementById('url').textContent = m.joinUrl.replace(/^https?:\/\//, '');
  document.getElementById('qr').src = `/qr.svg?room=${m.code}`;
}
function showRoomError(error) {
  document.getElementById('roomcode').textContent = '—';
  document.getElementById('url').textContent = error === 'rate-limited' ? 'Too many games started from here — try again in a minute.' : 'The server is busy — try again soon.';
}
function sendTo(pid, msg) {
  if (ws && ws.readyState === 1 && pid !== 'keyboard') ws.send(JSON.stringify({ t: 'toPlayer', pid, msg }));
}

// Messages from a phone arrive over the relay (server WebSocket) or directly over WebRTC.
function onPlayerMsg(pid, m, via) {
  const p = players.get(pid);
  if (!p || !m) return;
  if (m.t === 'in') {
    if (!(m.q > p.lastSeq)) return; // unordered data channel: ignore stale packets
    p.lastSeq = m.q;
    Object.assign(p.input, { steer: clamp(+m.s || 0, -1, 1), gas: m.g ? 1 : 0, brake: m.b ? 1 : 0, drift: m.d ? 1 : 0, item: m.i ? 1 : 0 });
  } else if (m.t === 'ping') {
    const pong = { t: 'pong', ts: m.ts };
    if (via === 'direct' && p.dc?.readyState === 'open') p.dc.send(JSON.stringify(pong));
    else sendTo(pid, pong);
  } else if (m.t === 'rtt') {
    const changed = p.path !== m.path;
    p.rtt = +m.ms || 0;
    p.path = m.path === 'direct' ? 'direct' : 'relay';
    if (changed || phase === 'lobby') renderRoster();
  } else if (m.t === 'rtc') {
    p.rtcChain = (p.rtcChain || Promise.resolve()).then(() => onRtc(p, m)).catch((e) => console.warn('webrtc', e));
  }
}

// WebRTC: the phone offers a data channel; we answer. Signaling rides on the relay.
const ICE = [{ urls: 'stun:stun.l.google.com:19302' }];
async function onRtc(p, m) {
  if (m.sdp?.type === 'offer') {
    closePeer(p);
    const pc = (p.pc = new RTCPeerConnection({ iceServers: ICE }));
    pc.onicecandidate = (e) => { if (e.candidate && p.pc === pc) sendTo(p.pid, { t: 'rtc', cand: e.candidate.toJSON() }); };
    pc.ondatachannel = (e) => {
      const ch = e.channel;
      ch.onopen = () => { if (p.pc === pc) p.dc = ch; };
      ch.onclose = () => { if (p.dc === ch) p.dc = null; };
      ch.onmessage = (ev) => { try { onPlayerMsg(p.pid, JSON.parse(ev.data), 'direct'); } catch {} };
    };
    await pc.setRemoteDescription(m.sdp);
    await pc.setLocalDescription(await pc.createAnswer());
    sendTo(p.pid, { t: 'rtc', sdp: pc.localDescription.toJSON() });
  } else if (m.cand && p.pc) {
    await p.pc.addIceCandidate(m.cand);
  }
}
function closePeer(p) {
  try { p.pc?.close(); } catch {}
  p.pc = null; p.dc = null;
}

function freeColor() {
  const used = new Set([...players.values()].map((p) => p.color));
  return HUMAN_COLORS.find((c) => !used.has(c)) ?? 0x9e9e9e;
}
function addPlayer(pid, name, isKeyboard = false, consent = isKeyboard) {
  let p = players.get(pid);
  if (!p) {
    p = { pid, name, isKeyboard, connected: true, color: freeColor(), input: { ...NO_INPUT }, menuPrev: 1, driftPrev: 1 };
    players.set(pid, p);
  } else {
    p.connected = true;
    p.name = name;
    closePeer(p); // the phone reconnected and will offer a fresh WebRTC connection
  }
  Object.assign(p, { consent, lastSeq: -1, rtt: null, path: isKeyboard ? null : 'relay' });
  renderRoster();
  return p;
}
function removePlayer(pid) {
  const p = players.get(pid);
  if (!p) return;
  closePeer(p);
  if (phase === 'lobby') players.delete(pid);
  else { p.connected = false; p.input = { ...NO_INPUT }; }
  renderRoster();
}
function ensureKeyboardPlayer() {
  return players.get('keyboard') || addPlayer('keyboard', 'Keyboard', true);
}

function renderRoster() {
  const el = document.getElementById('roster');
  const list = [...players.values()].filter((p) => p.connected);
  el.innerHTML = list.length
    ? list.map((p, i) => `<div class="chip ${i >= MAX_HUMANS ? 'waiting' : ''}" style="--c:${hexStr(p.color)}">
        <span class="dot"></span>${esc(p.name)} <small>${p.isKeyboard ? 'keyboard' : `${p.path === 'direct' ? '⚡ direct' : '☁︎ relay'}${p.rtt != null ? ` · ${p.rtt} ms` : ''}`}${i >= MAX_HUMANS ? ' · waiting' : ''}${rec.enabled && !p.consent ? ' · not recorded' : ''}</small></div>`).join('')
    : '<div class="empty">No players yet — scan the code with your phone</div>';
}

let phoneHudT = 0;
function sendPhoneHuds(dt) {
  if ((phoneHudT -= dt) > 0) return;
  phoneHudT = 0.1;
  for (const p of players.values()) {
    if (p.isKeyboard || !p.connected) continue;
    const k = karts.find((k) => k.player === p);
    const msg = { t: 'hud', phase, color: hexStr(p.color), name: p.name, map: maps[mapIndex]?.name };
    if (k) Object.assign(msg, { item: k.itemRoll > 0 ? '?' : k.item, place: k.place, lap: clamp(k.lap, 1, LAPS), laps: LAPS, finished: k.finished, bullet: k.bullet > 0 });
    sendTo(p.pid, msg);
  }
}

// Keyboard player
const keys = new Set();
const KB_CODES = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'ShiftRight']);
addEventListener('keydown', (e) => {
  if (KB_CODES.has(e.code)) e.preventDefault();
  keys.add(e.code);
  if (e.repeat) return;
  if (e.code === 'Enter') menuAction();
  else if (phase === 'lobby' && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) changeMap(e.code === 'ArrowLeft' ? -1 : 1);
  else if (phase === 'lobby' && KB_CODES.has(e.code) && !players.has('keyboard')) ensureKeyboardPlayer();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
function pollKeyboard(dt) {
  const p = players.get('keyboard');
  if (!p) return;
  const has = (...c) => c.some((x) => keys.has(x));
  const target = (has('ArrowRight', 'KeyD') ? 1 : 0) - (has('ArrowLeft', 'KeyA') ? 1 : 0);
  const rate = target === 0 ? 10 : 5;
  p.input.steer += clamp(target - p.input.steer, -rate * dt, rate * dt);
  p.input.gas = has('ArrowUp', 'KeyW') ? 1 : 0;
  p.input.brake = has('ArrowDown', 'KeyS') ? 1 : 0;
  p.input.drift = has('Space') ? 1 : 0;
  p.input.item = has('ShiftLeft', 'ShiftRight', 'KeyE') ? 1 : 0;
}

// Outside races: ITEM = start / continue, DRIFT = next map.
function handleMenuInput() {
  for (const p of players.values()) {
    const item = p.input.item && !p.menuPrev, drift = p.input.drift && !p.driftPrev;
    p.menuPrev = p.input.item;
    p.driftPrev = p.input.drift;
    if (item && (phase === 'lobby' || phase === 'results')) menuAction();
    if (drift && phase === 'lobby' && !p.isKeyboard) changeMap(1);
  }
}
document.getElementById('mapprev').onclick = () => changeMap(-1);
document.getElementById('mapnext').onclick = () => changeMap(1);

// ================================================================ data collection
// Every race is streamed to the server (data/races/*.jsonl.gz) for behavioral cloning.
// observe() is the single definition of what a driver "sees": it's logged for human
// drivers during play and is what a trained policy will be fed in-game.
const OBS_VERSION = 2;
const LOOK = [4, 8, 14, 22, 32, 45, 60];                // centerline lookahead, in world units
const N_NEAR_KARTS = 4, N_NEAR_HAZARDS = 4, N_NEAR_BOXES = 2;
const OBS_NAMES = [
  'speed', 'vel_fwd', 'vel_right', 'lat', 'heading_err', 'offroad',
  ...LOOK.flatMap((d) => [`look${d}_fwd`, `look${d}_right`, `look${d}_ang`]),
  'drifting', 'drift_dir', 'drift_charge', 'boost', 'spin', 'airborne', 'bullet',
  ...ITEM_KEYS.map((i) => `item_${i}`), 'item_rolling',
  'place', 'lap', 'lap_frac',
  ...Array.from({ length: N_NEAR_KARTS }, (_, j) => ['present', 'fwd', 'right', 'rel_vfwd', 'rel_vright'].map((f) => `kart${j}_${f}`)).flat(),
  ...Array.from({ length: N_NEAR_HAZARDS }, (_, j) => ['present', 'fwd', 'right', 'is_shell', 'is_blue', 'vfwd', 'vright'].map((f) => `hazard${j}_${f}`)).flat(),
  ...Array.from({ length: N_NEAR_BOXES }, (_, j) => ['present', 'fwd', 'right'].map((f) => `box${j}_${f}`)).flat(),
  'pad_present', 'pad_fwd', 'pad_right',
];
const STATE_NAMES = ['x', 'z', 'heading', 'vx', 'vz', 'speed', 'idx', 'lat', 'lap', 'drift', 'drift_dir', 'drift_charge',
  'boost', 'spin', 'hop_y', 'item', 'item_roll', 'place', 'finished', 'bullet'];
const ACTION_NAMES = ['steer', 'gas', 'brake', 'drift', 'item'];

// Kart-relative observation vector (fwd = along the kart's nose, right = to its right).
function observe(k) {
  const fx_ = Math.sin(k.heading), fz = Math.cos(k.heading);
  const egoF = (dx, dz) => dx * fx_ + dz * fz;
  const egoR = (dx, dz) => dz * fx_ - dx * fz;
  const vf = egoF(k.vx, k.vz), vr = egoR(k.vx, k.vz);
  const o = [
    k.speed / MAX_SPEED, vf / MAX_SPEED, vr / MAX_SPEED, k.lat / HALF_W,
    wrap(k.heading - track.ang[k.idx]) / Math.PI, Math.abs(k.lat) > HALF_W + CURB_W ? 1 : 0,
  ];
  for (const d of LOOK) {
    const i = (k.idx + Math.round(d / track.ds)) % N, p = track.p[i];
    o.push(egoF(p.x - k.x, p.z - k.z) / 60, egoR(p.x - k.x, p.z - k.z) / 60, wrap(track.ang[i] - k.heading) / Math.PI);
  }
  o.push(k.drift ? 1 : 0, k.drift ? k.driftDir : 0, clamp(k.driftCharge / 2.5, 0, 1), clamp(k.boost / 1.5, 0, 1),
    clamp(k.spin / 1.8, 0, 1), k.hopY > 0 ? 1 : 0, clamp(k.bullet / 3.6, 0, 1));
  for (const it of ITEM_KEYS) o.push(k.item === it && k.itemRoll <= 0 ? 1 : 0);
  o.push(k.item && k.itemRoll > 0 ? 1 : 0);
  o.push((k.place - 1) / (TOTAL_KARTS - 1), clamp(k.lap, 0, LAPS) / LAPS, track.d[k.idx] / track.len);

  const nearest = (list, n, range) => list
    .map((e) => ({ e, d: (e.x - k.x) ** 2 + (e.z - k.z) ** 2 }))
    .filter((a) => a.d < range * range)
    .sort((a, b) => a.d - b.d).slice(0, n).map((a) => a.e);
  const pad = (rows, n, width) => { for (let j = rows; j < n; j++) for (let w = 0; w < width; w++) o.push(0); };

  const others = nearest(karts.filter((o2) => o2 !== k), N_NEAR_KARTS, 60);
  for (const e of others) {
    o.push(1, egoF(e.x - k.x, e.z - k.z) / 60, egoR(e.x - k.x, e.z - k.z) / 60,
      egoF(e.vx - k.vx, e.vz - k.vz) / MAX_SPEED, egoR(e.vx - k.vx, e.vz - k.vz) / MAX_SPEED);
  }
  pad(others.length, N_NEAR_KARTS, 5);

  const hazards = nearest([...bananas, ...shells, ...blues], N_NEAR_HAZARDS, 50);
  for (const e of hazards) {
    const blue = e.idxf !== undefined, shell = e.vx !== undefined || blue;
    o.push(1, egoF(e.x - k.x, e.z - k.z) / 50, egoR(e.x - k.x, e.z - k.z) / 50, shell ? 1 : 0, blue ? 1 : 0,
      e.vx !== undefined ? egoF(e.vx, e.vz) / 60 : 0, e.vx !== undefined ? egoR(e.vx, e.vz) / 60 : 0);
  }
  pad(hazards.length, N_NEAR_HAZARDS, 7);

  const boxes = nearest(itemBoxes.filter((b) => b.respawn <= 0 && egoF(b.x - k.x, b.z - k.z) > 0), N_NEAR_BOXES, 60);
  for (const b of boxes) o.push(1, egoF(b.x - k.x, b.z - k.z) / 60, egoR(b.x - k.x, b.z - k.z) / 60);
  pad(boxes.length, N_NEAR_BOXES, 3);

  const padsAhead = nearest(pads.filter((p) => egoF(p.x - k.x, p.z - k.z) > 0), 1, 80);
  if (padsAhead.length) o.push(1, egoF(padsAhead[0].x - k.x, padsAhead[0].z - k.z) / 80, egoR(padsAhead[0].x - k.x, padsAhead[0].z - k.z) / 80);
  else o.push(0, 0, 0);
  return o;
}

const r4 = (v) => Math.round(v * 1e4) / 1e4;
const kartState = (k) => [k.x, k.z, k.heading, k.vx, k.vz, k.speed, k.idx, k.lat, k.lap, k.drift ? 1 : 0, k.driftDir,
  k.driftCharge, k.boost, k.spin, k.hopY, k.item ? ITEM_KEYS.indexOf(k.item) + 1 : 0, Math.max(0, k.itemRoll), k.place, k.finished ? 1 : 0, Math.max(0, k.bullet)].map(r4);

const recBadge = document.getElementById('rec');
const rec = {
  enabled: false, active: false, id: null, rows: [],
  send(msg) { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ t: 'rec', ...msg })); },
  start() {
    this.active = false;
    if (!this.enabled || !karts.some((k) => k.player?.consent)) return;
    this.id = new Date().toISOString().replace(/[:.]/g, '-');
    this.active = true;
    this.rows = [];
    const map = maps[mapIndex];
    this.send({
      op: 'start', id: this.id,
      meta: {
        type: 'meta', version: 2, obs_version: OBS_VERSION, created: new Date().toISOString(), sim_hz: SIM_HZ, laps: LAPS,
        karts: karts.map((k, i) => ({ i, name: k.player && !k.player.consent ? 'Player' : k.name, pid: k.player?.consent ? k.player.pid : null, human: !!k.player, recorded: !!k.player?.consent, device: k.player ? (k.player.isKeyboard ? 'keyboard' : 'phone') : 'cpu' })),
        obs_names: OBS_NAMES, state_names: STATE_NAMES, action_names: ACTION_NAMES, items: ITEM_KEYS,
        track: {
          map: map.file.replace(/\.js$/, ''), name: map.name, ctrl: map.ctrl, samples: N, road_width: ROAD_W, curb_width: CURB_W,
          barrier: BARRIER, wall: WALL, length: r4(track.len), item_rows: track.itemRows, boost_pads: track.boostPads,
        },
        physics: { MAX_SPEED, OFFROAD_MAX, BOOST_SPEED, BULLET_SPEED, ACCEL, BRAKE, REVERSE_MAX, TURN },
      },
    });
  },
  // Snapshot state + observations *before* the tick; commit() adds the actions taken during it.
  begin() {
    return {
      type: 'tick', f: frameNo, t: r4(raceTime), phase,
      state: karts.map(kartState),
      obs: Object.fromEntries(karts.map((k, i) => [i, k]).filter(([, k]) => controlSource(k) === 'h' && k.player.consent).map(([i, k]) => [i, observe(k).map(r4)])),
      bananas: bananas.map((b) => [r4(b.x), r4(b.z)]),
      shells: shells.map((s) => [r4(s.x), r4(s.z), r4(s.vx), r4(s.vz)]),
      blues: blues.map((b) => [r4(b.x), r4(b.z), r4(b.y)]),
      boxes: itemBoxes.map((b) => (b.respawn > 0 ? 0 : 1)).join(''),
    };
  },
  commit(row) {
    row.src = karts.map((k) => k.src || 'c').join('');
    // Actions of humans who didn't opt in are blanked (their kart's position is still part of the world state).
    row.act = karts.map((k) => { const a = k.player && !k.player.consent ? NO_INPUT : k.lastInput || NO_INPUT; return [r4(a.steer || 0), a.gas ? 1 : 0, a.brake ? 1 : 0, a.drift ? 1 : 0, a.item ? 1 : 0]; });
    this.rows.push(row);
    if (this.rows.length >= SIM_HZ / 2) this.flush();
  },
  flush() {
    if (this.rows.length) this.send({ op: 'rows', id: this.id, rows: this.rows });
    this.rows = [];
  },
  end() {
    if (!this.active) return;
    this.flush();
    this.send({
      op: 'end', id: this.id,
      summary: { type: 'end', race_time: r4(raceTime), results: karts.map((k, i) => ({ i, name: k.name, place: k.place, finished: k.finished, finish_time: k.finished ? r4(k.finishTime) : null })) },
    });
    this.active = false;
  },
};

// ================================================================ main loop
let lastCount = 0;
let frameNo = 0;
let frozen = false; // debug: pause the simulation (tools/closeup.mjs)

// Game logic at a fixed SIM_HZ, independent of the display's frame rate.
function tick() {
  const dt = STEP;
  frameNo++;
  pollKeyboard(dt);
  handleMenuInput();
  const row = rec.active && (phase === 'countdown' || phase === 'race') ? rec.begin() : null;

  if (phase === 'countdown') {
    countdown -= dt;
    for (const k of karts) {
      k.lastInput = k.player ? k.player.input : NO_INPUT;
      k.src = k.player ? controlSource(k) : 'c';
      if (!k.player) continue;
      if (k.player.input.gas) { if (k.gasAt == null) k.gasAt = countdown; } else k.gasAt = null;
    }
    const n = Math.ceil(countdown);
    if (n !== lastCount && n > 0) {
      lastCount = n;
      views.forEach((v) => banner(v, String(n), 1, 'count'));
      setStartLights(4 - n, false);
    }
    if (countdown <= 0) {
      phase = 'race';
      lastCount = 0;
      views.forEach((v) => banner(v, 'GO!', 1.2, 'go'));
      setStartLights(0, true);
      // Rocket start: hold gas from just after "2" until GO.
      for (const k of karts) {
        if (k.player ? k.gasAt != null && k.gasAt < 1.4 : Math.random() < 0.4) k.boost = 1.0;
      }
    }
  }

  if (phase === 'race') {
    raceTime += dt;
    if (raceTime > 3 && raceTime - dt <= 3) setStartLights(0, false);
  }
  if (phase !== 'countdown' && !frozen) simulate(dt);
  else computePlaces();
  if (row) rec.commit(row);

  if (phase === 'race') {
    const humans = karts.filter((k) => k.player);
    if (humans.every((k) => k.finished || !k.player.connected)) {
      if ((endTimer += dt) > 3) showResults();
    }
  }
  if (phase === 'results') resultsAge += dt;
}

function animate(dt) {
  world.update(dt);
  for (const bn of bananas) bn.mesh.rotation.y += dt * 0.5;
  for (const k of karts) updateKartVisual(k, dt);
  fx.update(dt);
  for (const v of views) { updateCam(v, dt); updateHud(v); }
  if (!views.length) updateAttractCam(dt);
  sendPhoneHuds(dt);
  recBadge.classList.toggle('hidden', !rec.active);
}

let lastT = performance.now(), acc = 0;
function frame(now = performance.now()) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastT) / 1000, 0.1);
  lastT = now;
  acc += dt;
  for (let n = 0; acc >= STEP && n < 6; n++) { tick(); acc -= STEP; }
  acc = Math.min(acc, STEP);
  animate(dt);
  drawMinimap();
  render();
}

// ================================================================ boot
fetch('/info.json').then((r) => r.json()).then((info) => {
  rec.enabled = info.record;
  document.getElementById('recnote').classList.toggle('hidden', !info.record);
  document.getElementById('certnote').classList.toggle('hidden', info.mode !== 'local');
});
await loadMapList();
loadMap(mapIndex);
goLobby();
connect();
frame();

// Handy for debugging (and the screenshot tooling) from the console.
window.pk = {
  players, get karts() { return karts; }, get phase() { return phase; }, get maps() { return maps; }, get mapIndex() { return mapIndex; },
  startRace, goLobby, observe, rec, loadMap: (i) => { loadMap(i); goLobby(); }, fx,
  freeze(on = true) { frozen = on; },
  closeup(i = 0, yaw = Math.PI, dist = 6, h = 2.2) { closeup = i == null ? null : { i, yaw, dist, h }; document.getElementById('lobby').classList.toggle('hidden', i != null); },
  topView(on = true) { topView = on; document.getElementById('lobby').classList.toggle('hidden', on); },
  give(item, who) { const k = who ?? karts.find((k) => k.player); if (k) { k.item = item; k.itemRoll = 0; } },
  use(item, who) { const k = who ?? karts.find((k) => k.player); if (k) { k.item = item; k.itemRoll = 0; useItem(k); } },
};
