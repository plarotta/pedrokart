// Sunset Canyon — a desert raceway at golden hour. Terraced red-rock canyon walls, banded mesas and
// hoodoos, a natural stone arch and a giant sun-bleached ribcage over the road, a stepped pyramid
// silhouetted against the low sun at the end of the main straight, an adobe pueblo, and lots of cacti.

// Rock layer colours as linear RGB (what THREE.Color holds for these sRGB hex values).
const toLinear = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const ROCK_LAYERS = ['#c85a38', '#e79a5f', '#b64a30', '#f0b67c', '#d06a40', '#a9432c']
  .map((hex) => [1, 3, 5].map((i) => toLinear(parseInt(hex.slice(i, i + 2), 16) / 255)));

const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Terraced mesa profile: flat benches joined by steep cliffs.
const terrace = (h, step) => {
  const t = h / step, f = Math.floor(t);
  return step * (f + smoothstep(0.55, 0.95, t - f));
};

export default {
  name: 'Sunset Canyon',
  order: 3,
  ctrl: [[-53, 0], [35, 0], [123, 0], [189, -22], [220, -84], [207, -154], [172, -211], [163, -273], [123, -330],
    [62, -348], [0, -326], [-26, -273], [9, -224], [53, -176], [53, -128], [9, -101], [-44, -123], [-97, -176],
    [-154, -207], [-207, -172], [-216, -97], [-180, -31], [-119, 0]],
  itemRows: [0.18, 0.43, 0.66, 0.9],
  boostPads: [[0.07, 0], [0.235, -3], [0.52, 3], [0.705, 0], [0.945, -3]],

  theme: {
    sky: { top: 0x4d62b8, horizon: 0xffa66b, bottom: 0xf2a877 },
    fog: { color: 0xf6b07e, near: 240, far: 1250 },
    sun: { dir: [0.93, 0.26, 0.1], color: 0xffcf9a, intensity: 2.7, glow: 0xffb25a },
    hemi: { sky: 0xffd9b8, ground: 0xc07448, intensity: 1.25 },
    envIntensity: 0.7,
    exposure: 1.02,
    clouds: { count: 14, color: 0xffc3a6, emissive: 0xb05a78 },
    terrain: {
      low: 0xe8b477, lowAlt: 0xdb9d62, rock: 0xc4583a, peak: 0xe9b584,
      hills: 16, rim: 200, rockAt: 10, peakAt: 58,
      detail: ['#fbf1e2', '#eedcc2', '#fff8ec', '#e8d3b4', '#f6e6cf'],
    },
    road: { base: '#6e5d55', speckle: ['#625249', '#7b6a60', '#685750', '#86746a', '#5a4b44'], lines: '#fff0d4', centerLine: true },
    curb: ['#d8432a', '#f8ecd4'],
    shoulder: { base: '#e6bd86', speckle: ['#dcae74', '#efcb98', '#d5a266', '#f4d6a8'] },
    walls: {
      height: 1.2, rail: 0x9b6a45,
      panels: [['#b8462a', '#ffe7b3', 'CANYON'], ['#f0b640', '#6b2a12', 'PEDRO'], ['#2c7d86', '#fff3d6', '★ GP ★'], ['#d7743c', '#ffffff', 'TURBO']],
    },
    vegetation: {
      round: 0, pine: 0, bush: 240, rock: 360, flower: 140, maxAltitude: 8,
      bushHue: [0.12, 0.2], leafLight: [0.3, 0.4],
      rockColor: 0xb8603e, flowers: [0xffd23f, 0xff7a3d, 0xff5d8f, 0xfff1c9],
    },
    props: { grandstands: true, bunting: true, mushrooms: false, pipes: false, balloons: false },
  },

  // Dunes near the road, terraced red-rock canyon ridges further out (open around the main straight).
  // Tint the terraced benches with alternating rock layers.
  terrainColor({ h, color }) {
    if (h < 7) return;
    const f = h / 13 + 0.25, lvl = Math.floor(f);
    const a = ROCK_LAYERS[lvl % ROCK_LAYERS.length], b = ROCK_LAYERS[(lvl + 1) % ROCK_LAYERS.length], m = smoothstep(0.6, 1, f - lvl);
    const k = smoothstep(7, 16, h) * 0.45;
    color.r += (a[0] + (b[0] - a[0]) * m - color.r) * k;
    color.g += (a[1] + (b[1] - a[1]) * m - color.g) * k;
    color.b += (a[2] + (b[2] - a[2]) * m - color.b) * k;
  },
  terrain({ x, z, dTrack, base }) {
    const ridgeRise = smoothstep(14.4 + 16, 14.4 + 42, dTrack);
    // keep a valley open from the pueblo out to the pyramid at the end of the main straight
    const sx = Math.min(Math.max(x, 0), 330), sz = -25 - sx * 0.05;
    const open = smoothstep(65, 125, Math.hypot(x - sx, (z - sz) * 1.15));
    const n = (Math.sin(x * 0.021 + Math.sin(z * 0.017) * 2) + Math.sin(z * 0.019 - x * 0.007)) * 0.25 + 0.5;
    const ridge = ridgeRise * open * (18 + 46 * n);
    const dunes = smoothstep(14.4 + 8, 14.4 + 30, dTrack) * (Math.sin(x * 0.08 + z * 0.03) * 0.5 + 0.5) * 1.6;
    const h = Math.max(base, ridge);
    return (h > 6 ? terrace(h, 13) : h) + dunes;
  },

  decorate(ctx) {
    const { THREE, root, track, pointAt, idxAt, terrainHeight, distToTrack, canvasTex, BARRIER, N, onUpdate } = ctx;
    // deterministic random so the scenery is identical for every player
    let seed = 20260923;
    const rnd = (a = 0, b = 1) => { seed = (seed * 1664525 + 1013904223) >>> 0; return a + (seed / 4294967296) * (b - a); };
    const col = (c) => new THREE.Color(c);
    const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3(), tmpE = new THREE.Euler();
    const center = track.center;
    const footprints = []; // [x, z, r] of big things so small props don't overlap them
    const clear = (x, z, r) => footprints.every(([fx, fz, fr]) => Math.hypot(x - fx, z - fz) > fr + r);

    // ---- geometry helpers
    function mergeGeos(list) {
      const parts = list.map((g) => (g.index ? g.toNonIndexed() : g));
      let n = 0;
      for (const g of parts) n += g.attributes.position.count;
      const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
      let o = 0;
      for (const g of parts) {
        pos.set(g.attributes.position.array, o * 3);
        nor.set(g.attributes.normal.array, o * 3);
        o += g.attributes.position.count;
      }
      const out = new THREE.BufferGeometry();
      out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      return out;
    }
    // Sedimentary bands: colour each triangle by the height of its centroid (crisp faceted strata).
    const STRATA = ['#a8402a', '#c9573a', '#e0874f', '#b94c31', '#efb57c', '#cf6b40', '#9c3a28', '#e59a5e', '#c45a36', '#f2c08a'];
    function strata(geo, minY, maxY, bands = 9, topColor = '#e6a86c', offset = 0, wobble = 0.12) {
      const g = geo.index ? geo.toNonIndexed() : geo;
      g.computeVertexNormals();
      const p = g.attributes.position, nrm = g.attributes.normal, cols = new Float32Array(p.count * 3), c = new THREE.Color();
      const pal = STRATA.map((s) => new THREE.Color(s)), top = new THREE.Color(topColor);
      for (let i = 0; i < p.count; i += 3) {
        const y = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
        const t = (y - minY) / (maxY - minY);
        const ny = (nrm.getY(i) + nrm.getY(i + 1) + nrm.getY(i + 2)) / 3;
        const wob = Math.sin((p.getX(i) + p.getZ(i)) * 3.1) * wobble;
        const b = Math.floor(t * bands + wob + offset);
        c.copy(pal[((b % pal.length) + pal.length) % pal.length]);
        if (ny > 0.8) c.copy(top);
        c.multiplyScalar(0.92 + 0.16 * Math.abs(Math.sin(i * 12.9898)));
        for (let k = 0; k < 3; k++) cols.set([c.r, c.g, c.b], (i + k) * 3);
      }
      g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      return g;
    }
    const rockMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

    function instanced(geo, mat, items, shadow = true) {
      if (!items.length) return null;
      const im = new THREE.InstancedMesh(geo, mat, items.length);
      items.forEach((it, i) => {
        tmpP.set(it.x, it.y, it.z);
        tmpQ.setFromEuler(tmpE.set(it.rx || 0, it.ry || 0, it.rz || 0));
        tmpS.set(it.sx, it.sy, it.sz ?? it.sx);
        im.setMatrixAt(i, tmpM.compose(tmpP, tmpQ, tmpS));
        if (it.color !== undefined) im.setColorAt(i, col(it.color));
      });
      im.castShadow = shadow;
      im.receiveShadow = true;
      root.add(im);
      return im;
    }
    const groundAt = (x, z) => terrainHeight(x, z, distToTrack(x, z, 8));

    // ---- mesas (unit-sized variants, instanced with non-uniform scale)
    function mesaGeo(v) {
      const g = new THREE.CylinderGeometry(1, 1.2, 1, 14, 9);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i), r = Math.hypot(x, z);
        if (r < 1e-4) continue;
        const a = Math.atan2(z, x), t = y + 0.5;
        const tier = 1 - 0.14 * Math.floor(t * 3.2) / 3.2; // stepped silhouette
        const w = 1 + 0.16 * Math.sin(a * 3 + v * 1.7) + 0.08 * Math.sin(a * 7 + v * 3.1 + t * 4) + 0.05 * Math.sin(a * 13 + v);
        const k = w * (t < 0.12 ? 1.08 : tier);
        const yy = y > 0.49 || y < -0.49 ? y : y + 0.035 * Math.sin(t * 23 + v * 2);
        p.setXYZ(i, x * k, yy + (y > 0.49 ? 0.012 * Math.sin(a * 5 + v) : 0), z * k);
      }
      g.translate(0, 0.5, 0);
      return strata(g, 0, 1, 9, '#e9ad70', v * 3, 0);
    }
    function spireGeo(v) {
      const g = new THREE.CylinderGeometry(0.55, 1, 1, 9, 12);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i), r = Math.hypot(x, z);
        if (r < 1e-4) continue;
        const a = Math.atan2(z, x), t = y + 0.5;
        let k = 1 + 0.18 * Math.sin(t * 17 + v) + 0.1 * Math.sin(a * 3 + v * 2);
        if (t > 0.86) k *= 1.55; // cap rock
        else if (t > 0.74) k *= 0.72; // pinched neck
        p.setXYZ(i, x * k, y, z * k);
      }
      g.translate(0, 0.5, 0);
      return strata(g, 0, 1, 12, '#d98a55', v * 5, 0);
    }
    const mesaGeos = [0, 1, 2].map(mesaGeo), spireGeos = [0, 1].map(spireGeo);

    // Hand-placed hero mesas + a scattered mid/far ring; everything checked against the road corridor.
    const mesaSpots = [[0, []], [1, []], [2, []]], spireSpots = [[0, []], [1, []]];
    const tryMesa = (x, z, rad, hgt) => {
      const d = distToTrack(x, z, 4);
      if (d < BARRIER + 6 + rad * 1.25 || !clear(x, z, rad)) return false;
      const v = Math.floor(rnd(0, 3));
      mesaSpots[v][1].push({ x, y: groundAt(x, z) - 2, z, sx: rad, sy: hgt, sz: rad * rnd(0.75, 1.2), ry: rnd(0, 6.3) });
      footprints.push([x, z, rad * 1.3]);
      return true;
    };
    [[118, -110, 26, 44], [-120, -95, 30, 38], [95, -265, 18, 52], [-80, -290, 34, 60], [300, -250, 40, 70], [-300, -40, 45, 58],
      [260, 110, 50, 62], [-150, 150, 55, 70], [30, 170, 40, 46], [-330, -260, 48, 80], [80, -470, 60, 85], [-160, -430, 50, 66]]
      .forEach(([x, z, r, h]) => tryMesa(x, z, r, h));
    for (let tries = 0, made = 0; tries < 400 && made < 26; tries++) {
      const a = rnd(0, Math.PI * 2), dist = rnd(260, 520);
      const x = center.x + Math.cos(a) * dist * 1.15, z = center.z + Math.sin(a) * dist;
      if (tryMesa(x, z, rnd(25, 60), rnd(40, 110))) made++;
    }
    for (let tries = 0, made = 0; tries < 900 && made < 46; tries++) {
      const x = rnd(-330, 340), z = rnd(-480, 160), d = distToTrack(x, z, 8);
      const rad = rnd(4, 8);
      if (d < BARRIER + 8 + rad || d > 190 || !clear(x, z, rad + 2)) continue;
      const v = made % 2;
      spireSpots[v][1].push({ x, y: groundAt(x, z) - 0.5, z, sx: rad, sy: rnd(16, 42) * (d < 60 ? 0.8 : 1.1), ry: rnd(0, 6.3) });
      footprints.push([x, z, rad * 1.4]);
      made++;
    }
    for (const [v, list] of mesaSpots) instanced(mesaGeos[v], rockMat, list);
    for (const [v, list] of spireSpots) instanced(spireGeos[v], rockMat, list);

    // ---- natural stone arch spanning the road
    const archAt = (frac, R, tube, extra = 0) => {
      const i = idxAt(frac), g = new THREE.Group();
      g.position.copy(track.p[i]);
      g.position.y = -1.5;
      g.rotation.y = track.ang[i] + Math.PI / 2 + extra; // torus plane across the road
      const geo = new THREE.TorusGeometry(R, tube, 9, 40, Math.PI);
      const p = geo.attributes.position;
      for (let k = 0; k < p.count; k++) {
        const x = p.getX(k), y = p.getY(k), zz = p.getZ(k);
        const a = Math.atan2(y, x);
        const w = 1 + 0.25 * Math.sin(a * 5) * Math.cos(zz * 0.3);
        const cx = Math.cos(a) * R, cy = Math.sin(a) * R;
        const thick = 1 + 0.7 * Math.pow(Math.abs(Math.cos(a)), 3); // chunky legs, thinner span
        p.setXYZ(k, cx + (x - cx) * w * thick, cy + (y - cy) * w * (a > 0.4 && a < 2.7 ? 0.85 : thick), zz * w * thick);
      }
      const mesh = new THREE.Mesh(strata(geo, 0, R + tube, 10, '#e7a468', 0.4), rockMat);
      mesh.rotation.y = Math.PI / 2;
      mesh.castShadow = mesh.receiveShadow = true;
      g.add(mesh);
      // rubble at the feet
      for (const s of [-1, 1]) {
        const b = new THREE.Mesh(strata(new THREE.DodecahedronGeometry(1, 0), -1, 1, 3), rockMat);
        b.position.set(0, 1.5, s * (R + tube * 1.6));
        b.scale.set(tube * 1.5, tube * 1.2, tube * 1.6);
        b.castShadow = true;
        g.add(b);
      }
      root.add(g);
      const pt = track.p[i];
      footprints.push([pt.x + track.r[i].x * R, pt.z + track.r[i].z * R, tube * 2.5], [pt.x - track.r[i].x * R, pt.z - track.r[i].z * R, tube * 2.5]);
    };
    archAt(0.305, 23.5, 4.2);
    archAt(0.555, 22.5, 3.6, 0.15);

    // ---- giant ribcage over the road (a long-dead sand serpent) + skull beside the track
    {
      const bone = new THREE.MeshStandardMaterial({ color: 0xf1e4c6, roughness: 0.85 });
      const ribGeo = new THREE.TorusGeometry(1, 0.06, 7, 28, Math.PI);
      const vertGeo = new THREE.DodecahedronGeometry(1, 0);
      const ribs = [], verts = [];
      const f0 = 0.832, count = 9;
      for (let k = 0; k < count; k++) {
        const i = idxAt(f0 + k * 0.0062), p = track.p[i];
        const s = 22 + 3 * Math.sin((k / (count - 1)) * Math.PI); // swell in the middle of the body
        ribs.push({ x: p.x, y: -0.8, z: p.z, sx: s, sy: s * 1.02, sz: s * 0.9, ry: track.ang[i] });
        verts.push({ x: p.x, y: s * 1.02 - 0.8, z: p.z, sx: 2.2, sy: 1.6, sz: 2.2, ry: track.ang[i] });
        if (k < count - 1) {
          const j = idxAt(f0 + (k + 0.5) * 0.0062), q = track.p[j];
          verts.push({ x: q.x, y: s * 1.02 - 0.6, z: q.z, sx: 1.2, sy: 1.1, sz: 1.2, ry: track.ang[j] });
        }
        for (const side of [-1, 1]) footprints.push([p.x + track.r[i].x * s * side, p.z + track.r[i].z * s * side, 4]);
      }
      // tail: shrinking vertebrae curling off to the outside
      const iT = idxAt(f0 + count * 0.0062);
      for (let k = 0; k < 7; k++) {
        const lat = -(BARRIER + 6 + k * 4.5), p = pointAt((iT + k * 6) % N, lat);
        verts.push({ x: p.x, y: groundAt(p.x, p.z) + 0.6, z: p.z, sx: 2 - k * 0.2, sy: 1.4 - k * 0.12, sz: 2 - k * 0.2, ry: k });
      }
      instanced(ribGeo, bone, ribs);
      instanced(vertGeo, bone, verts);

      // skull resting at the head end, outside the wall
      const i = idxAt(f0 - 0.012), sp = pointAt(i, BARRIER + 11);
      const skull = new THREE.Group();
      skull.position.set(sp.x, groundAt(sp.x, sp.z) - 0.5, sp.z);
      skull.rotation.y = track.ang[i] + Math.PI + 0.5;
      const cran = new THREE.Mesh(new THREE.SphereGeometry(5, 14, 10), bone);
      cran.scale.set(1, 0.85, 1.1); cran.position.set(0, 4.2, 0);
      const snout = new THREE.Mesh(new THREE.BoxGeometry(6, 3.6, 8.5), bone);
      snout.position.set(0, 2.6, 6.5); snout.rotation.x = 0.12;
      const jaw = new THREE.Mesh(new THREE.BoxGeometry(5.4, 1.2, 8), bone);
      jaw.position.set(0, 0.6, 6.2); jaw.rotation.x = -0.18;
      const dark = new THREE.MeshBasicMaterial({ color: 0x2a1410 });
      skull.add(cran, snout, jaw);
      for (const s of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(1.35, 10, 8), dark);
        eye.position.set(s * 2.9, 5, 3.4);
        const horn = new THREE.Mesh(new THREE.ConeGeometry(1.1, 7, 8), bone);
        horn.position.set(s * 3.6, 8.5, -1.5); horn.rotation.set(-0.6, 0, s * -0.5);
        const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.6, 5), bone);
        tooth.position.set(s * 2, 0.9, 9.8); tooth.rotation.x = Math.PI;
        skull.add(eye, horn, tooth);
      }
      skull.traverse((o) => { o.castShadow = true; });
      root.add(skull);
      footprints.push([sp.x, sp.z, 12]);
    }

    // ---- stepped pyramid silhouetted against the sun beyond the main straight
    {
      const px = 385, pz = -45, g = new THREE.Group();
      g.scale.setScalar(1.6);
      g.position.set(px, groundAt(px, pz) - 1, pz);
      g.rotation.y = Math.PI / 2 + 0.25;
      const stone = new THREE.MeshLambertMaterial({ color: 0xe5b476, flatShading: true });
      const stone2 = new THREE.MeshLambertMaterial({ color: 0xcf9860, flatShading: true });
      const tiers = 8;
      for (let k = 0; k < tiers; k++) {
        const w = 80 - k * 9.5, h = 6.5;
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), k % 2 ? stone2 : stone);
        b.position.y = h / 2 + k * h;
        b.castShadow = b.receiveShadow = true;
        g.add(b);
      }
      // stair ramp + temple on top + doorway
      const stairs = new THREE.Mesh(new THREE.BoxGeometry(12, 6, 64), stone2);
      stairs.rotation.x = -Math.atan2(52, 38);
      stairs.position.set(0, 26, -21);
      const temple = new THREE.Mesh(new THREE.BoxGeometry(12, 8, 12), stone);
      temple.position.y = tiers * 6.5 + 4;
      const door = new THREE.Mesh(new THREE.PlaneGeometry(4, 5), new THREE.MeshBasicMaterial({ color: 0x3a1c10 }));
      door.position.set(0, tiers * 6.5 + 2.6, -6.05); door.rotation.y = Math.PI;
      g.add(stairs, temple, door);
      root.add(g);
      footprints.push([px, pz, 110]);
      // two small satellite pyramids
      for (const [dx, dz, k] of [[-40, -115, 0.35], [-10, 95, 0.28]]) {
        const s = g.clone();
        s.scale.setScalar(k * 1.6);
        s.position.set(px + dx, groundAt(px + dx, pz + dz) - 0.5, pz + dz);
        root.add(s);
      }
    }

    // ---- adobe pueblo in the infield by the start straight
    {
      const adobe = new THREE.MeshLambertMaterial({ color: 0xd99a66 });
      const adobe2 = new THREE.MeshLambertMaterial({ color: 0xc98552 });
      const wood = new THREE.MeshLambertMaterial({ color: 0x6b4226 });
      const dark = new THREE.MeshBasicMaterial({ color: 0x3a1d12 });
      const boxes = [], beams = [], holes = [];
      const block = (x, z, w, d, h, y0, ry) => {
        boxes.push({ x, y: y0 + h / 2, z, sx: w, sy: h, sz: d, ry });
        // vigas poking out of the front wall + a door/window
        const c = Math.cos(ry), s = Math.sin(ry);
        for (let k = -w / 2 + 1.2; k < w / 2 - 0.6; k += 1.7) {
          const lx = k, lz = d / 2 + 0.6;
          beams.push({ x: x + lx * c + lz * s, y: y0 + h - 0.6, z: z - lx * s + lz * c, sx: 0.35, sy: 0.35, sz: 1.4, ry });
        }
        const hz = d / 2 + 0.02;
        holes.push({ x: x + hz * s, y: y0 + Math.min(1.4, h / 2), z: z + hz * c, sx: 1.4, sy: y0 > 0 ? 1.2 : 2.4, sz: 1, ry });
      };
      const layout = [[40, -52, 14, 10, 6], [56, -58, 10, 9, 5], [44, -64, 12, 9, 11], [24, -60, 9, 9, 4.5], [62, -72, 8, 8, 8],
        [30, -74, 10, 8, 7], [48, -78, 9, 9, 13.5], [-8, -58, 8, 8, 5], [80, -60, 9, 8, 4.5]];
      for (const [x, z, w, d, h] of layout) {
        if (distToTrack(x, z, 4) < BARRIER + 6 + Math.max(w, d) / 2) continue;
        const y = groundAt(x, z) - 0.3;
        block(x, z, w, d, h, y, 0);
        if (h > 7) block(x + 1, z + 1.5, w * 0.6, d * 0.5, 3.5, y + h, 0); // stacked upper storey
        footprints.push([x, z, Math.max(w, d) * 0.8]);
      }
      instanced(new THREE.BoxGeometry(1, 1, 1), adobe, boxes);
      instanced(new THREE.BoxGeometry(1, 1, 1), wood, beams);
      instanced(new THREE.PlaneGeometry(1, 1), dark, holes, false);
      // ladders
      for (const [x, z, h] of [[47, -57.5, 7], [44, -68, 12]]) {
        const lad = new THREE.Group();
        for (const s of [-0.5, 0.5]) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.15, h + 1.5, 0.15), wood); r.position.set(s, (h + 1.5) / 2, 0); lad.add(r); }
        for (let y = 0.6; y < h; y += 0.8) { const r = new THREE.Mesh(new THREE.BoxGeometry(1, 0.1, 0.1), wood); r.position.y = y; lad.add(r); }
        lad.position.set(x, groundAt(x, z), z);
        lad.rotation.x = -0.15;
        root.add(lad);
      }
      void adobe2;
    }

    // ---- broken sandstone columns lining the start straight (ancient ruins)
    {
      const cols = [], caps = [];
      for (let f = 0.012; f < 0.12; f += 0.0105) {
        for (const side of [-1, 1]) {
          const i = idxAt(f + (side > 0 ? 0.005 : 0)), p = pointAt(i, side * (BARRIER + 4.5));
          if (!clear(p.x, p.z, 2)) continue;
          const h = [9, 4, 7.5, 2.5, 9, 6][Math.floor(rnd(0, 6))];
          const y = groundAt(p.x, p.z);
          cols.push({ x: p.x, y: y + h / 2, z: p.z, sx: 1, sy: h, sz: 1, ry: rnd(0, 3), rz: h < 8 ? rnd(-0.06, 0.06) : 0 });
          if (h >= 9) caps.push({ x: p.x, y: y + h + 0.5, z: p.z, sx: 3.2, sy: 1, sz: 3.2, ry: track.ang[i] });
        }
      }
      const colGeo = new THREE.CylinderGeometry(1, 1.1, 1, 12);
      instanced(colGeo, new THREE.MeshLambertMaterial({ color: 0xecc790, flatShading: true }), cols);
      instanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xe0b47c }), caps);
    }

    // ---- cacti: saguaros, barrel cacti with blossoms, dry scrub
    {
      const cyl = (r, h, x, y, z, rx = 0, rz = 0) => {
        const g = new THREE.CylinderGeometry(r, r * 1.05, h, 8, 1);
        g.rotateX(rx); g.rotateZ(rz); g.translate(x, y, z);
        return g;
      };
      const cap = (r, x, y, z) => { const g = new THREE.SphereGeometry(r, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2); g.translate(x, y, z); return g; };
      const saguaro = mergeGeos([
        cyl(0.6, 7, 0, 3.5, 0), cap(0.6, 0, 7, 0),
        cyl(0.42, 1.6, 0.9, 3, 0, 0, Math.PI / 2), cyl(0.42, 2.6, 1.6, 4.1, 0), cap(0.42, 1.6, 5.4, 0),
        cyl(0.38, 1.3, -0.8, 3.9, 0, 0, Math.PI / 2), cyl(0.38, 1.8, -1.35, 4.7, 0), cap(0.38, -1.35, 5.6, 0),
      ]);
      const barrel = new THREE.SphereGeometry(0.8, 10, 7);
      barrel.scale(1, 1.15, 1);
      const cactusMat = new THREE.MeshLambertMaterial({ flatShading: true });
      const sag = [], bar = [], blossom = [];
      const greens = [0x4f8f3e, 0x5c9a44, 0x437f36, 0x6aa24c, 0x3f7a3a];
      for (let tries = 0; tries < 6000 && (sag.length < 230 || bar.length < 260); tries++) {
        const x = rnd(-360, 380), z = rnd(-500, 180), d = distToTrack(x, z, 8);
        if (d < BARRIER + 4 || !clear(x, z, 1.5)) continue;
        if (d > 70 && rnd() < 0.55) continue; // denser close to the road
        const y = groundAt(x, z);
        if (y > 5) continue;
        if (rnd() < 0.45 && sag.length < 230) {
          const k = rnd(0.7, 1.35);
          sag.push({ x, y: y - 0.2, z, sx: k, sy: k * rnd(0.85, 1.2), sz: k, ry: rnd(0, 6.3), color: greens[sag.length % greens.length] });
        } else if (bar.length < 260) {
          const k = rnd(0.6, 1.3);
          bar.push({ x, y: y + 0.55 * k, z, sx: k, sy: k, sz: k, ry: rnd(0, 6.3), color: greens[(bar.length + 2) % greens.length] });
          if (rnd() < 0.6) blossom.push({ x, y: y + 1.45 * k, z, sx: 0.28 * k, sy: 0.2 * k, sz: 0.28 * k, color: [0xff4f86, 0xffcf3a, 0xff7b3a][bar.length % 3] });
        }
      }
      instanced(saguaro, cactusMat, sag);
      instanced(barrel, cactusMat, bar);
      instanced(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ emissive: 0x401010 }), blossom, false);
    }

    // ---- vultures circling over the canyon
    {
      const wing = new THREE.BufferGeometry();
      wing.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.8, -3.2, 0.5, -0.2, 0, 0, -0.6, 0, 0, 0.8, 0, 0, -0.6, 3.2, 0.5, -0.2], 3));
      wing.computeVertexNormals();
      const birds = new THREE.InstancedMesh(wing, new THREE.MeshBasicMaterial({ color: 0x2a1a22, side: THREE.DoubleSide }), 6);
      const flock = [...Array(6)].map((_, k) => ({ cx: [-40, 140, -150][k % 3], cz: [-230, -150, -120][k % 3], r: 28 + k * 6, h: 70 + k * 7, ph: k * 1.3, sp: 0.18 + (k % 3) * 0.04 }));
      root.add(birds);
      onUpdate((dt, t) => {
        flock.forEach((b, k) => {
          const a = t * b.sp + b.ph;
          tmpP.set(b.cx + Math.cos(a) * b.r, b.h + Math.sin(t * 0.7 + k) * 2, b.cz + Math.sin(a) * b.r);
          tmpQ.setFromEuler(tmpE.set(0, -a, 0.35));
          tmpS.set(1, 1 + Math.sin(t * 3 + k) * 0.15, 1);
          birds.setMatrixAt(k, tmpM.compose(tmpP, tmpQ, tmpS));
        });
        birds.instanceMatrix.needsUpdate = true;
      });
    }

    // ---- warm sun disc low on the horizon (the engine adds the glow sprite)
    {
      const dir = new THREE.Vector3(...ctx.theme.sun.dir).normalize();
      const disc = new THREE.Mesh(new THREE.CircleGeometry(38, 40), new THREE.MeshBasicMaterial({ color: 0xfff0c0, fog: false }));
      disc.position.copy(center).addScaledVector(dir, 1450);
      disc.lookAt(center);
      disc.renderOrder = 1;
      root.add(disc);
    }
    void canvasTex;
  },
};
