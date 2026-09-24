// Coconut Coast — a tropical beach track. The road runs along a beachfront boardwalk, loops out
// onto a sandbar peninsula around a lighthouse, sweeps back across the bay on a sand spit and
// S-bends through the palm groves of the headland. Everything off the road is sea unless it is
// the mainland (north), a sandbar hugging the road, or a small islet.

const WATER = -0.7;           // sea level (road is at 0)
const FLAT = 14.4 + 5;        // BARRIER + 5: terrain is exactly 0 inside this distance from the centerline
const ISLETS = [              // [x, z, radius, height]
  [163, 281, 17, 3.2],        // lighthouse rock at the tip of the sandbar
  [108, 140, 8, 1.2],         // lagoon islet inside the sandbar loop
  [262, 118, 12, 3],
  [250, 10, 9, 2.4],
  [-60, 205, 15, 3.6],
  [-235, 190, 10, 2.8],
  [55, 322, 11, 2.6],
  [-140, 280, 8, 2.2],
  [330, 220, 14, 3.2],
];
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// Mainland coastline (land is where z < shoreZ). The western headland bulges south.
const shoreZ = (x) => -50 + 100 * sm(-190, -310, x) + 9 * Math.sin(x * 0.021) + 6 * Math.sin(x * 0.047 + 1);

export default {
  name: 'Coconut Coast',
  order: 2,
  ctrl: [
    [-40, -30], [40, -28], [110, 0], [160, 65], [175, 145], [158, 218], [108, 252], [58, 228], [48, 160], [40, 100], [-10, 62],
    [-80, 82], [-160, 108], [-240, 92], [-290, 35], [-295, -40], [-262, -98], [-212, -112], [-170, -78], [-135, -42], [-100, -31],
  ],
  itemRows: [0.14, 0.39, 0.585, 0.82],
  boostPads: [[0.2, 3.5], [0.35, -4], [0.52, 0], [0.69, 4], [0.9, -3.5]],
  theme: {
    sky: { top: 0x1466e0, horizon: 0xc2ecff, bottom: 0x6cc8e8 },
    fog: { color: 0xc2ecff, near: 340, far: 1500 },
    sun: { dir: [0.4, 0.66, 0.62], color: 0xfff3d9, intensity: 2.8, glow: 0xfff8e0 },
    hemi: { sky: 0xe0f4ff, ground: 0xe6d3a0, intensity: 1.15 },
    envIntensity: 0.9,
    exposure: 1.05,
    clouds: { count: 34, color: 0xffffff, emissive: 0xa9b8cc },
    terrain: {
      low: 0xf6e2ae, lowAlt: 0xeccf94, rock: 0x1b6630, peak: 0x7a6650,
      hills: 34, rim: 170, rockAt: 1.7, peakAt: 95,
      detail: ['#fff9ee', '#f1e3c6', '#fffdf7', '#eadbbd', '#fff6e4'],
    },
    road: { base: '#55575e', speckle: ['#4a4c53', '#60636b', '#4f5159', '#6b6e76', '#44464d'], lines: '#fffaf0', centerLine: true },
    curb: ['#ff5a3c', '#fffaf0'],
    shoulder: { base: '#ecd39c', speckle: ['#e2c68a', '#f4dfae', '#d9b979', '#f8e8c2'] },
    walls: {
      height: 1.1, rail: 0xf4f7fb,
      panels: [['#00a8c6', '#ffffff', 'ALOHA!'], ['#ffd23f', '#e4572e', 'PEDRO KART'], ['#ff6b6b', '#ffffff', 'SURF'], ['#1fb57a', '#fff7d6', 'COCONUT']],
    },
    vegetation: { round: 0, pine: 0, bush: 0, rock: 0, flower: 0 },
    props: { grandstands: true, bunting: true, mushrooms: false, pipes: false, balloons: false },
  },

  terrain: ({ x, z, dTrack: d, base, fbm }) => {
    // sandbar that carries the road, shelving off into the sea
    const n = fbm(x * 0.02, z * 0.02);
    const bar = -1.5 * sm(FLAT + 3, FLAT + 22 + n * 8, d) - 9 * sm(FLAT + 22, 190, d);
    // mainland
    const s = shoreZ(x) - z + (n - 0.5) * 14;
    const main = -1 + 2.4 * sm(-18, 26, s) - 9 * sm(8, 170, -s) + (s > 0 ? (base * sm(15, 90, s) + 6 * sm(45, 130, s)) * sm(FLAT, 120, d) : 0);
    let h = Math.max(bar, main);
    for (const [ix, iz, r, ih] of ISLETS) {
      const q = Math.hypot(x - ix, z - iz) / r;
      if (q < 1.8) h = Math.max(h, ih * (1 - q * q) - 1.5 * q + (n - 0.5) * 1.5);
    }
    return h * sm(FLAT, FLAT + 4, d);
  },

  decorate(ctx) {
    const { THREE, root, track, pointAt, idxAt, terrainHeight, distToTrack, canvasTex, fbm, BARRIER, onUpdate } = ctx;
    const center = track.center;
    const R = mulberry(1337);
    const rr = (a, b) => a + R() * (b - a);
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(), E = new THREE.Euler(), C = new THREE.Color();
    const lambert = (o) => new THREE.MeshLambertMaterial(o);
    const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.8, ...o });
    const add = (o, shadow = true) => { o.castShadow = shadow; o.receiveShadow = true; root.add(o); return o; };
    const instanced = (geo, mat, list, fn, shadow = true) => {
      if (!list.length) return null;
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((it, i) => { fn(it, P, Q, S, i); im.setMatrixAt(i, M.compose(P, Q, S)); if (it.color != null) im.setColorAt(i, C.set(it.color)); });
      return add(im, shadow);
    };
    const hAt = (x, z) => terrainHeight(x, z);
    const occupied = [];                        // [x, z, r] footprints of placed landmarks, so scatter avoids them
    const free = (x, z, r) => occupied.every(([ox, oz, or]) => (x - ox) ** 2 + (z - oz) ** 2 > (r + or) ** 2);
    const at = (frac, lat) => pointAt(idxAt(((frac % 1) + 1) % 1), lat);
    const yawAt = (frac) => track.ang[idxAt(((frac % 1) + 1) % 1)];

    // ================================================================ sea
    // A depth map of the seabed is baked once into a texture; the water shader turns it into the
    // shallow→deep colour ramp, a foam line on every shore and animated waves rolling onto the beaches.
    {
      const size = 1900, seg = 64, RES = 512, MAXD = 12;
      const ox = center.x - size / 2, oz = center.z - size / 2;
      const depthTex = canvasTex(RES, RES, (g, w, h) => {
        const img = g.createImageData(w, h);
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
          const x = ox + ((i + 0.5) / w) * size, z = oz + ((j + 0.5) / h) * size;
          const dep = Math.max(0, Math.min(1, (WATER - hAt(x, z)) / MAXD));
          const k = (j * w + i) * 4, v = Math.round(dep * 255);
          img.data[k] = img.data[k + 1] = img.data[k + 2] = v; img.data[k + 3] = 255;
        }
        g.putImageData(img, 0, 0);
      }, false);
      depthTex.colorSpace = THREE.NoColorSpace;
      depthTex.flipY = false;
      depthTex.anisotropy = 1;
      depthTex.generateMipmaps = false;
      depthTex.minFilter = THREE.LinearFilter;

      const geo = new THREE.PlaneGeometry(size, size, seg, seg);
      geo.rotateX(-Math.PI / 2);
      const pos = geo.attributes.position, half = size / 2;
      for (let i = 0; i < pos.count; i++) {
        let x = pos.getX(i), z = pos.getZ(i);
        if (Math.abs(x) >= half - 0.01 || Math.abs(z) >= half - 0.01) { x *= 4; z *= 4; } // stretch the rim to the horizon
        pos.setXYZ(i, x + center.x, WATER, z + center.z);
      }
      geo.computeVertexNormals();
      geo.computeBoundingSphere();
      const waves = canvasTex(256, 256, (g, w, h) => {
        g.fillStyle = '#e6f0f2'; g.fillRect(0, 0, w, h);
        g.lineCap = 'round';
        for (let i = 0; i < 110; i++) {
          const x = R() * w, y = R() * h, l = rr(8, 28);
          g.strokeStyle = R() < 0.6 ? 'rgba(255,255,255,.95)' : 'rgba(160,195,205,.6)'; g.lineWidth = rr(1.5, 3);
          for (const [dx, dy] of [[0, 0], [-w, 0], [0, -h], [-w, -h], [w, 0], [0, h]]) {
            g.beginPath(); g.moveTo(x + dx, y + dy); g.quadraticCurveTo(x + dx + l / 2, y + dy - 3, x + dx + l, y + dy); g.stroke();
          }
        }
      });
      waves.repeat.set(size / 16, size / 16);
      const glints = canvasTex(256, 256, (g, w, h) => {
        g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(255,255,255,${rr(0.4, 1)})`; g.fillRect(R() * w, R() * h, rr(3, 8), rr(1, 2)); }
      });
      glints.repeat.set(size / 24, size / 24);
      const uni = {
        uDepth: { value: depthTex }, uTime: { value: 0 }, uOrigin: { value: new THREE.Vector2(ox, oz) }, uSize: { value: size },
        uShallow: { value: new THREE.Color(0x2fe3d2) }, uMid: { value: new THREE.Color(0x06b4cc) }, uDeep: { value: new THREE.Color(0x0877cf) }, uAbyss: { value: new THREE.Color(0x0a56b0) },
      };
      const mat = new THREE.MeshStandardMaterial({
        transparent: true, map: waves, emissiveMap: glints, emissive: 0xffffff, emissiveIntensity: 0.45,
        roughness: 0.32, metalness: 0.0, depthWrite: false, envMapIntensity: 0.55,
      });
      mat.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, uni);
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec2 vSeaXZ;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSeaXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', `#include <common>
            varying vec2 vSeaXZ; uniform sampler2D uDepth; uniform float uTime, uSize; uniform vec2 uOrigin;
            uniform vec3 uShallow, uMid, uDeep, uAbyss;`)
          .replace('#include <map_fragment>', `
            vec2 suv = (vSeaXZ - uOrigin) / uSize;
            float inside = step(0.0, suv.x) * step(suv.x, 1.0) * step(0.0, suv.y) * step(suv.y, 1.0);
            float dep = mix(${MAXD.toFixed(1)}, texture2D(uDepth, clamp(suv, 0.0, 1.0)).r * ${MAXD.toFixed(1)}, inside);
            float far = length(vSeaXZ - (uOrigin + 0.5 * uSize));
            dep += smoothstep(700.0, 1400.0, far) * 30.0;
            vec3 sea = mix(uShallow, uMid, smoothstep(0.2, 1.8, dep));
            sea = mix(sea, uDeep, smoothstep(2.0, 7.5, dep));
            sea = mix(sea, uAbyss, smoothstep(12.0, 40.0, dep));
            float alpha = mix(0.72, 0.98, smoothstep(0.2, 4.0, dep));
            float shore = 1.0 - smoothstep(0.08, 0.3, dep);
            float ph = dep * 7.0 - uTime * 1.6;
            float roll = smoothstep(0.82, 0.98, sin(ph)) * (1.0 - smoothstep(0.35, 1.5, dep));
            float foam = max(shore, roll * 0.85);
            vec4 texelColor = texture2D(map, vMapUv);
            diffuseColor.rgb = mix(sea * texelColor.rgb, vec3(1.0), foam);
            diffuseColor.a = max(alpha, foam);
          `);
      };
      const sea = new THREE.Mesh(geo, mat);
      sea.receiveShadow = true;
      root.add(sea);
      onUpdate((dt, t) => {
        uni.uTime.value = t;
        waves.offset.set(Math.sin(t * 0.15) * 0.06, t * 0.01);
        glints.offset.set(t * 0.018, Math.cos(t * 0.3) * 0.04);
        mat.emissiveIntensity = 0.32 + 0.12 * Math.sin(t * 2.3);
      });
    }

    // ================================================================ palm trees (instanced)
    const palmTrunkGeo = (() => {
      const g = new THREE.CylinderGeometry(0.24, 0.42, 9, 7, 12);
      g.translate(0, 4.5, 0);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i), t = y / 9, ring = Math.round(y / 0.75) % 2 ? 1.12 : 1;
        p.setXYZ(i, p.getX(i) * ring + 1.8 * t * t, y, p.getZ(i) * ring);
      }
      g.computeVertexNormals();
      return g;
    })();
    const TOP = new THREE.Vector3(1.8, 9, 0);
    const palmCrownGeo = (() => {
      const pos = [], colr = [];
      const tri = (a, b, c, ca, cb, cc) => { pos.push(...a, ...b, ...c); colr.push(...ca, ...cb, ...cc); };
      const dark = [0.12, 0.42, 0.12], light = [0.42, 0.78, 0.2];
      const F = 9, segs = 7;
      for (let f = 0; f < F; f++) {
        const a = (f / F) * Math.PI * 2 + Math.sin(f * 7.1) * 0.25, len = 4.6 + Math.sin(f * 3.3) * 0.8, lift = 0.9 + 0.5 * Math.cos(f * 2.1);
        const dx = Math.cos(a), dz = Math.sin(a), px = -dz, pz = dx;
        const row = (s) => {
          const r = s * len, y = lift * s * 1.6 - 3.0 * s * s, w = 0.95 * Math.sin(Math.PI * Math.min(1, s * 1.1)) + 0.05;
          const cx = TOP.x + dx * r, cy = TOP.y + y, cz = TOP.z + dz * r;
          const c = dark.map((v, k) => v + (light[k] - v) * s);
          return { L: [cx + px * w, cy - 0.25 * w, cz + pz * w], M: [cx, cy + 0.12, cz], Rr: [cx - px * w, cy - 0.25 * w, cz - pz * w], c };
        };
        let prev = row(0);
        for (let k = 1; k <= segs; k++) {
          const cur = row(k / segs);
          tri(prev.L, prev.M, cur.L, prev.c, prev.c, cur.c); tri(cur.L, prev.M, cur.M, cur.c, prev.c, cur.c);
          tri(prev.M, prev.Rr, cur.M, prev.c, prev.c, cur.c); tri(cur.M, prev.Rr, cur.Rr, cur.c, prev.c, cur.c);
          prev = cur;
        }
      }
      // coconuts
      const nut = new THREE.IcosahedronGeometry(0.34, 0).toNonIndexed();
      for (let k = 0; k < 4; k++) {
        const a = k * 1.7, np = nut.attributes.position;
        for (let i = 0; i < np.count; i++) { pos.push(np.getX(i) + TOP.x + Math.cos(a) * 0.45, np.getY(i) + TOP.y - 0.45, np.getZ(i) + TOP.z + Math.sin(a) * 0.45); colr.push(0.36, 0.24, 0.1); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
      g.computeVertexNormals();
      return g;
    })();
    const palms = [];
    const addPalm = (x, z, k = rr(0.8, 1.25)) => { palms.push({ x, z, y: hAt(x, z) - 0.2, k, yaw: rr(0, Math.PI * 2), color: new THREE.Color().setHSL(rr(0.2, 0.3), rr(0.55, 0.9), rr(0.55, 0.75)) }); };

    // ================================================================ lighthouse on the tip rock
    {
      const [lx, lz] = ISLETS[0];
      const y0 = hAt(lx, lz) - 0.5;
      occupied.push([lx, lz, 9]);
      const g = new THREE.Group();
      g.position.set(lx, y0, lz);
      root.add(g);
      const stripes = canvasTex(64, 256, (c, w, h) => { for (let i = 0; i < 6; i++) { c.fillStyle = i % 2 ? '#fbfbf7' : '#e3262f'; c.fillRect(0, (i * h) / 6, w, h / 6); } });
      const tower = add(new THREE.Mesh(new THREE.CylinderGeometry(2.4, 3.6, 26, 24), std({ map: stripes, roughness: 0.6 })));
      tower.position.y = 13;
      g.add(tower);
      const white = std({ color: 0xf6f4ee }), redM = std({ color: 0xd92b33, roughness: 0.5 }), darkM = std({ color: 0x23262e, metalness: 0.5, roughness: 0.4 });
      const base = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 5.2, 2.6, 20), white); base.position.y = 1.3; g.add(base);
      const gallery = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.6, 0.5, 24), darkM); gallery.position.y = 26.2; g.add(gallery);
      const railing = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.5, 1.1, 24, 1, true), std({ color: 0x23262e, wireframe: true })); railing.position.y = 27; g.add(railing);
      const lamp = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 2.6, 16), new THREE.MeshStandardMaterial({ color: 0xfff3b0, emissive: 0xffe066, emissiveIntensity: 1.6, roughness: 0.2 }));
      lamp.position.y = 27.8; g.add(lamp);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(2.6, 2.8, 16), redM); roof.position.y = 30.5; g.add(roof);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), darkM); knob.position.y = 32.1; g.add(knob);
      for (const o of [base, gallery, roof]) { o.castShadow = true; o.receiveShadow = true; }
      // rotating light beams
      const beamGeo = new THREE.ConeGeometry(2.4, 40, 16, 1, true);
      beamGeo.translate(0, -23, 0); beamGeo.rotateZ(Math.PI / 2);
      const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
      const spin = new THREE.Group(); spin.position.y = 27.8; g.add(spin);
      const b1 = new THREE.Mesh(beamGeo, beamMat), b2 = new THREE.Mesh(beamGeo, beamMat); b2.rotation.y = Math.PI;
      spin.add(b1, b2);
      onUpdate((dt) => { spin.rotation.y += dt * 0.9; });
      // keeper's cottage
      const hut = new THREE.Mesh(new THREE.BoxGeometry(5, 3.2, 4), white); hut.position.set(7, 1.6, 2); hut.castShadow = true; g.add(hut);
      const hr = new THREE.Mesh(new THREE.ConeGeometry(4.2, 2.2, 4), redM); hr.position.set(7, 4.3, 2); hr.rotation.y = Math.PI / 4; hr.castShadow = true; g.add(hr);
      occupied.push([lx + 7, lz + 2, 4]);
    }

    // ================================================================ rocks on islets and along the tip
    const rocks = [];
    for (const [ix, iz, r, ih] of ISLETS) {
      const n = Math.round(r * 0.9);
      for (let i = 0; i < n; i++) {
        const a = rr(0, Math.PI * 2), d = r * rr(0.55, 1.15), x = ix + Math.cos(a) * d, z = iz + Math.sin(a) * d;
        if (distToTrack(x, z) < BARRIER + 6) continue;
        rocks.push({ x, z, y: Math.max(hAt(x, z), WATER - 0.6), k: rr(1.2, 3.2) * (1.2 - d / r * 0.4), color: new THREE.Color().setHSL(0.08, rr(0.08, 0.2), rr(0.42, 0.6)) });
      }
      if (r > 9 && ih > 2.3 && ix !== ISLETS[0][0]) for (let i = 0; i < 2 + (r > 13); i++) addPalm(ix + rr(-r, r) * 0.35, iz + rr(-r, r) * 0.35);
      if (r < 9) addPalm(ix, iz, 1.1);
    }
    // loose boulders in the shallows
    for (let i = 0; i < 60; i++) {
      const x = center.x + rr(-420, 420), z = center.z + rr(-300, 380), h = hAt(x, z);
      if (h > WATER + 0.2 || h < WATER - 3 || distToTrack(x, z) < BARRIER + 12) continue;
      rocks.push({ x, z, y: h + 0.2, k: rr(0.8, 2), color: new THREE.Color().setHSL(0.08, 0.12, rr(0.4, 0.55)) });
    }
    instanced(new THREE.DodecahedronGeometry(1.4, 0), lambert({ flatShading: true }), rocks, (o, p, q, s) => {
      p.set(o.x, o.y, o.z); s.set(o.k * 1.3, o.k * 0.85, o.k); q.setFromEuler(E.set(o.x, o.z * 3.1, o.x * 0.7));
    });

    // ================================================================ boardwalk + pier along the start straight (sea side)
    const wood = std({ map: canvasTex(128, 128, (c, w, h) => {
      c.fillStyle = '#b07a48'; c.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 16) { c.fillStyle = y % 32 ? '#a06c3c' : '#bc8754'; c.fillRect(0, y + 1, w, 14); c.fillStyle = 'rgba(60,30,10,.5)'; c.fillRect(0, y, w, 1.5); }
      for (let i = 0; i < 200; i++) { c.fillStyle = 'rgba(80,45,20,.18)'; c.fillRect(R() * w, R() * h, rr(6, 20), 1); }
    }), roughness: 0.85 });
    const postGeo = new THREE.CylinderGeometry(0.22, 0.22, 1, 6);
    const postMat = std({ color: 0x6b4a2e });
    const posts = [], lamps = [];
    {
      // boardwalk: a deck strip parallel to the road from before the grid to the start line
      const lat0 = BARRIER + 1.2, lat1 = BARRIER + 6.5, f0 = 0.905, f1 = 0.995;
      const verts = [], uvs = [], idx = [];
      const steps = 60;
      for (let k = 0; k <= steps; k++) {
        const f = f0 + (f1 - f0) * (k / steps), a = at(f, lat0), b = at(f, lat1);
        verts.push(a.x, 0.45, a.z, b.x, 0.45, b.z);
        uvs.push(0, k * 1.2, 1.4, k * 1.2);
        if (k < steps) { const j = k * 2; idx.push(j, j + 1, j + 2, j + 1, j + 3, j + 2); }
        if (k % 4 === 0) { posts.push({ p: at(f, lat1 - 0.2), h: 2.2 }); if (k % 12 === 0) lamps.push(at(f, lat1 - 0.3)); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      g.setIndex(idx); g.computeVertexNormals();
      add(new THREE.Mesh(g, wood), false);
      for (let k = 0; k <= 10; k++) { const p = at(f0 + (f1 - f0) * (k / 10), (lat0 + lat1) / 2); occupied.push([p.x, p.z, 4]); }
      // pier out into the lagoon from the middle of the boardwalk
      const pf = 0.945, base = at(pf, lat1 - 0.5), tip = at(pf, lat1 + 36), yaw = yawAt(pf);
      const len = base.distanceTo(tip), mid = base.clone().lerp(tip, 0.5);
      const pier = new THREE.Mesh(new THREE.BoxGeometry(len, 0.35, 3.6), wood);
      pier.position.set(mid.x, 0.4, mid.z); pier.rotation.y = yaw; // local x runs across the road == along the pier
      add(pier, false);
      for (let k = 0; k <= 8; k++) { const p = base.clone().lerp(tip, k / 8); for (const s of [-1.6, 1.6]) posts.push({ p: p.clone().addScaledVector(new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)), s), h: 2.4 }); occupied.push([p.x, p.z, 5]); }
      // little snack shack at the end of the pier
      const shack = new THREE.Group();
      shack.position.set(tip.x, 0.55, tip.z); shack.rotation.y = yaw;
      root.add(shack);
      const deck = new THREE.Mesh(new THREE.BoxGeometry(10, 0.4, 10), wood); shack.add(deck);
      const walls = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 5), std({ color: 0x3ec6c9 })); walls.position.y = 1.7; walls.castShadow = true; shack.add(walls);
      const roofG = new THREE.ConeGeometry(5.4, 2.6, 4); roofG.rotateY(Math.PI / 4);
      const thatch = std({ color: 0xd8b16a, roughness: 1, flatShading: true });
      const roof = new THREE.Mesh(roofG, thatch); roof.position.y = 4.5; roof.scale.set(1.15, 1, 1); roof.castShadow = true; shack.add(roof);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(5, 1.2), new THREE.MeshBasicMaterial({ map: canvasTex(256, 64, (c, w, h) => {
        c.fillStyle = '#ffd23f'; c.fillRect(0, 0, w, h); c.fillStyle = '#e4572e'; c.font = 'bold 40px "Arial Black", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('SMOOTHIES', w / 2, h / 2 + 2);
      }, false) }));
      sign.position.set(0, 2.4, -2.52); sign.rotation.y = Math.PI; shack.add(sign);
      for (const sx of [-4.6, 4.6]) for (const sz of [-4.6, 4.6]) posts.push({ p: new THREE.Vector3(sx, 0, sz).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).add(tip), h: 2.4 });
      occupied.push([tip.x, tip.z, 9]);
    }

    // ================================================================ overwater bungalows in the sandbar lagoon
    const hutBodies = [], hutRoofs = [];
    {
      const walkPts = [[108, 118], [108, 205]];
      const [a, b] = walkPts.map(([x, z]) => new THREE.Vector3(x, 0, z));
      const len = a.distanceTo(b), mid = a.clone().lerp(b, 0.5);
      const walk = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.3, len), wood);
      walk.position.set(mid.x, 0.9, mid.z); add(walk, false);
      for (let k = 0; k <= 10; k++) { const p = a.clone().lerp(b, k / 10); posts.push({ p: p.clone().setX(p.x - 1.1), h: 3 }); posts.push({ p: p.clone().setX(p.x + 1.1), h: 3 }); occupied.push([p.x, p.z, 4]); }
      const cols = [0xff8a5b, 0x4cc3d9, 0xffd166, 0xef476f, 0x06d6a0, 0xf4f1de];
      for (let k = 0; k < 6; k++) {
        const z = 128 + k * 14, side = k % 2 ? 1 : -1, x = 108 + side * 8.5;
        if (distToTrack(x, z) < BARRIER + 12) continue;
        hutBodies.push({ x, z, y: 1.1, sx: 5, sy: 3, sz: 5, color: cols[k % cols.length] });
        hutRoofs.push({ x, z, y: 5.3, k: 1 });
        const arm = new THREE.Mesh(new THREE.BoxGeometry(6, 0.3, 2), wood); arm.position.set(108 + side * 4, 0.9, z); add(arm, false);
        for (const sx of [-2, 2]) for (const sz of [-2, 2]) posts.push({ p: new THREE.Vector3(x + sx, 0, z + sz), h: 3 });
        occupied.push([x, z, 6]);
      }
    }

    // ================================================================ beach huts, umbrellas and towels on the beaches
    {
      const cols = [0xff6b6b, 0x4ecdc4, 0xffe66d, 0x1a8fe3, 0xff9f1c, 0xa06cd5, 0x2ec4b6];
      let n = 0;
      for (let f = 0.9; f < 1.07; f += 0.012) {
        const lat = -(BARRIER + 11 + (n % 2) * 3), p = at(f, lat);
        if (distToTrack(p.x, p.z) < BARRIER + 8) continue;
        const y = hAt(p.x, p.z);
        if (y < WATER + 0.4 || y > 3) continue;
        hutBodies.push({ x: p.x, z: p.z, y, sx: 4, sy: 3, sz: 3.6, yaw: yawAt(f), color: cols[n++ % cols.length] });
        hutRoofs.push({ x: p.x, z: p.z, y: y + 4.2, k: 0.85, yaw: yawAt(f) });
        occupied.push([p.x, p.z, 5]);
      }
      instanced(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), std({ roughness: 0.7 }), hutBodies,
        (o, p, q, s) => { p.set(o.x, o.y, o.z); s.set(o.sx, o.sy, o.sz); q.setFromEuler(E.set(0, o.yaw || 0, 0)); });
      const roofG = new THREE.ConeGeometry(4.3, 2.6, 4); roofG.rotateY(Math.PI / 4);
      instanced(roofG, std({ color: 0xd9ae62, roughness: 1, flatShading: true }), hutRoofs,
        (o, p, q, s) => { p.set(o.x, o.y, o.z); s.setScalar(o.k); q.setFromEuler(E.set(0, o.yaw || 0, 0)); });
      const doors = hutBodies.filter((o) => o.yaw != null);
      instanced(new THREE.PlaneGeometry(1.2, 2), new THREE.MeshLambertMaterial({ color: 0x4a2c17 }), doors, (o, p, q, s) => {
        // door faces the road (local -x side when looking along the track is the left... road is at +lateral from these huts)
        const rx = -Math.cos(o.yaw), rz = Math.sin(o.yaw);
        p.set(o.x + rx * (o.sx / 2 + 0.02), o.y + 1, o.z + rz * (o.sx / 2 + 0.02));
        s.set(1, 1, 1); q.setFromEuler(E.set(0, o.yaw - Math.PI / 2, 0));
      }, false);
    }
    {
      const spots = [];
      const tryBeach = (x, z) => {
        const d = distToTrack(x, z), y = hAt(x, z);
        if (d < BARRIER + 5 || y < WATER + 0.35 || y > 1.6 || !free(x, z, 3)) return;
        spots.push({ x, z, y }); occupied.push([x, z, 3]);
      };
      for (let i = 0; i < 500 && spots.length < 70; i++) {
        const f = rr(0, 1), side = R() < 0.5 ? -1 : 1, p = at(f, side * rr(BARRIER + 6, BARRIER + 20));
        tryBeach(p.x, p.z);
      }
      const palette = [['#ff4d4d', '#ffffff'], ['#1e90ff', '#ffffff'], ['#ffcc00', '#ff6a00'], ['#2ecc71', '#fff8dc'], ['#ff66c4', '#ffffff']];
      const canopy = new THREE.ConeGeometry(2.4, 0.9, 10, 1, true).toNonIndexed();
      canopy.translate(0, 2.7, 0);
      const pole = new THREE.CylinderGeometry(0.06, 0.06, 2.8, 5).translate(0, 1.4, 0);
      const poleMat = std({ color: 0xf2efe8 });
      palette.forEach(([a, b], k) => {
        const g = canopy.clone(), cnt = g.attributes.position.count, cc = [];
        const ca = new THREE.Color(a), cb = new THREE.Color(b);
        for (let i = 0; i < cnt; i++) { const c = Math.floor(i / 3) % 2 ? ca : cb; cc.push(c.r, c.g, c.b); }
        g.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3));
        g.computeVertexNormals();
        const list = spots.filter((_, i) => i % palette.length === k);
        const tilt = (o, p, q, s) => { p.set(o.x, o.y, o.z); s.setScalar(1); q.setFromEuler(E.set(Math.sin(o.x) * 0.15, o.z, Math.cos(o.z) * 0.15)); };
        instanced(g, std({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.6 }), list, tilt);
        instanced(pole, poleMat, list, tilt, false);
      });
      const towelCols = [0xff5e5b, 0x00cecb, 0xffed66, 0x6a4c93, 0xff9f1c, 0x8ac926];
      instanced(new THREE.BoxGeometry(1.1, 0.06, 2.1), lambert(), spots.map((o, i) => ({ ...o, color: towelCols[i % towelCols.length] })),
        (o, p, q, s) => { p.set(o.x + 1.6, o.y + 0.05, o.z + 0.6); s.setScalar(1); q.setFromEuler(E.set(0, o.x * 0.7, 0)); }, false);
      // beach balls
      instanced(new THREE.SphereGeometry(0.45, 12, 8), std({ roughness: 0.4 }), spots.filter((_, i) => i % 3 === 0).map((o, i) => ({ ...o, color: [0xff3b30, 0xffcc00, 0x1e90ff][i % 3] })),
        (o, p, q, s) => { p.set(o.x - 1.4, o.y + 0.42, o.z + 1.2); s.setScalar(1); q.identity(); });
    }

    // ================================================================ scatter palms on beaches and the mainland
    {
      // lines of palms flanking the track (the classic beach-circuit look)
      for (let f = 0; f < 1; f += 0.0065) {
        for (const side of [-1, 1]) {
          if (R() < 0.35) continue;
          const p = at(f + rr(-0.002, 0.002), side * rr(BARRIER + 7, BARRIER + 16));
          const y = hAt(p.x, p.z);
          if (y < WATER + 0.3 || distToTrack(p.x, p.z) < BARRIER + 6 || !free(p.x, p.z, 2.5)) continue;
          addPalm(p.x, p.z); occupied.push([p.x, p.z, 2.5]);
        }
      }
      // groves on the mainland / headland
      for (let i = 0; i < 4000 && palms.length < 640; i++) {
        const x = center.x + rr(-520, 520), z = center.z + rr(-460, 120);
        const y = hAt(x, z);
        if (y < 0.2 || y > 60 || !free(x, z, 3)) continue;
        if (fbm(x * 0.012, z * 0.012) < 0.42) continue;
        if (distToTrack(x, z) < BARRIER + 6) continue;
        addPalm(x, z, rr(0.9, 1.5)); occupied.push([x, z, 3]);
      }
      const bark = std({ color: 0x9a7248, roughness: 0.95, flatShading: true });
      const leaves = lambert({ vertexColors: true, side: THREE.DoubleSide });
      const place = (o, p, q, s) => { p.set(o.x, o.y, o.z); s.setScalar(o.k); q.setFromEuler(E.set(0, o.yaw, 0)); };
      instanced(palmTrunkGeo, bark, palms.map((o) => ({ ...o, color: null })), place);
      instanced(palmCrownGeo, leaves, palms, place);
    }

    // ================================================================ tropical undergrowth on the mainland
    {
      const bushes = [], flowers = [];
      for (let i = 0; i < 5000 && bushes.length < 650; i++) {
        const x = center.x + rr(-500, 500), z = center.z + rr(-460, 100), y = hAt(x, z);
        if (y < 0.5 || y > 120 || distToTrack(x, z) < BARRIER + 5 || !free(x, z, 1.5)) continue;
        bushes.push({ x, z, y, k: rr(0.9, 2.2), color: new THREE.Color().setHSL(rr(0.27, 0.38), rr(0.5, 0.75), rr(0.16, 0.28)) });
        if (R() < 0.5) flowers.push({ x: x + rr(-1.5, 1.5), z: z + rr(-1.5, 1.5), y: y + 0.9, color: [0xff3d7f, 0xffd60a, 0xff7b00, 0xffffff, 0xe040fb][i % 5] });
      }
      instanced(new THREE.IcosahedronGeometry(1.3, 1), lambert({ flatShading: true }), bushes,
        (o, p, q, s) => { p.set(o.x, o.y + 0.5 * o.k, o.z); s.set(o.k * 1.3, o.k * 0.8, o.k * 1.3); q.setFromEuler(E.set(0, o.x, 0)); });
      instanced(new THREE.IcosahedronGeometry(0.35, 0), lambert(), flowers, (o, p, q, s) => { p.set(o.x, o.y, o.z); s.setScalar(1); q.identity(); }, false);
    }

    // ================================================================ wooden posts (boardwalk, pier, bungalows) + boardwalk lamps
    instanced(postGeo, postMat, posts, (o, p, q, s) => { p.set(o.p.x, o.h / 2 - 1.8 + 0.4, o.p.z); s.set(1, o.h + 1.8, 1); q.identity(); }, false);
    instanced(new THREE.CylinderGeometry(0.08, 0.1, 4.2, 6).translate(0, 2.1, 0), std({ color: 0x2e3440, metalness: 0.6, roughness: 0.4 }), lamps,
      (o, p, q, s) => { p.set(o.x, 0.5, o.z); s.setScalar(1); q.identity(); }, false);
    instanced(new THREE.SphereGeometry(0.35, 10, 8), new THREE.MeshStandardMaterial({ color: 0xfff1c4, emissive: 0xffd27a, emissiveIntensity: 0.9 }), lamps,
      (o, p, q, s) => { p.set(o.x, 4.85, o.z); s.setScalar(1); q.identity(); }, false);

    // ================================================================ sailboats bobbing out at sea
    {
      const hullG = new THREE.CylinderGeometry(1.4, 0.5, 9, 8, 1);
      hullG.rotateX(Math.PI / 2); hullG.scale(1, 0.55, 1);
      const sailG = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 1.5, -3), new THREE.Vector3(0, 12, 0.2), new THREE.Vector3(0, 1.5, 3.2)]);
      sailG.computeVertexNormals();
      const jibG = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 1.5, 3.6), new THREE.Vector3(0, 10, 0.4), new THREE.Vector3(0, 1.5, 0.6)]);
      jibG.computeVertexNormals();
      const hullM = std({ color: 0xffffff, roughness: 0.4 }), mastM = std({ color: 0x8a6a4a });
      const boats = [[300, 60, 0xff4d4d], [-40, 300, 0x1e90ff], [240, 260, 0xffcc00], [-300, 230, 0xff66c4], [380, -40, 0x2ecc71], [-150, 360, 0xffffff]];
      boats.forEach(([x, z, sc], n) => {
        const g = new THREE.Group();
        const hull = new THREE.Mesh(hullG, hullM); hull.position.y = 0.2; hull.castShadow = true;
        const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 12, 5), mastM); mast.position.y = 6.2;
        const sail = new THREE.Mesh(sailG, std({ color: sc, side: THREE.DoubleSide, roughness: 0.7 }));
        const jib = new THREE.Mesh(jibG, std({ color: 0xffffff, side: THREE.DoubleSide, roughness: 0.7 }));
        g.add(hull, mast, sail, jib);
        const yaw0 = n * 1.3;
        g.position.set(x, WATER, z); g.rotation.y = yaw0;
        root.add(g);
        onUpdate((dt, t) => { g.position.y = WATER + Math.sin(t * 1.1 + n) * 0.25; g.rotation.z = Math.sin(t * 0.9 + n * 2) * 0.06; g.rotation.x = Math.sin(t * 0.7 + n) * 0.04; });
      });
    }

    // ================================================================ volcano on the skyline behind the headland
    {
      const vx = center.x - 170, vz = center.z - 640, H = 300, base = 330;
      const prof = [];
      for (let i = 0; i <= 24; i++) { const t = i / 24; prof.push(new THREE.Vector2(base * (1 - t) ** 1.7 + 42 * (1 - t) + 38, t * H)); }
      prof.push(new THREE.Vector2(30, H - 22), new THREE.Vector2(6, H - 30));
      const g = new THREE.LatheGeometry(prof, 40);
      const pos = g.attributes.position, cols = [];
      const lo = new THREE.Color(0x1f6630), mid = new THREE.Color(0x7d6a52), hi = new THREE.Color(0x4a3f38), lava = new THREE.Color(0xff5a1f);
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i), a = Math.atan2(pos.getZ(i), pos.getX(i));
        const streak = Math.max(0, Math.sin(a * 5 + 1.3)) ** 12 * sm(H * 0.55, H * 0.95, y);
        pos.setX(i, pos.getX(i) * (1 + 0.05 * Math.sin(a * 7 + y * 0.03)));
        C.copy(lo).lerp(mid, sm(H * 0.22, H * 0.5, y)).lerp(hi, sm(H * 0.6, H * 0.95, y)).lerp(lava, streak * 0.85);
        cols.push(C.r, C.g, C.b);
      }
      g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      g.computeVertexNormals();
      const volcano = new THREE.Mesh(g, lambert({ vertexColors: true, flatShading: true }));
      volcano.position.set(vx, -20, vz);
      root.add(volcano);
      // lazy smoke plume
      const puffGeo = new THREE.IcosahedronGeometry(1, 2);
      const puffMat = new THREE.MeshLambertMaterial({ color: 0xf2f2f2, emissive: 0x8d8d95, transparent: true, opacity: 0.85 });
      const puffs = Array.from({ length: 9 }, (_, i) => { const m = new THREE.Mesh(puffGeo, puffMat); root.add(m); return { m, ph: i / 9 }; });
      onUpdate((dt, t) => {
        for (const p of puffs) {
          const k = (p.ph + t * 0.025) % 1;
          p.m.position.set(vx + k * 90 + Math.sin(k * 6 + p.ph * 9) * 8, H - 20 + k * 150, vz + k * 30);
          p.m.scale.setScalar(18 + k * 42);
        }
      });
    }

    // ================================================================ seagulls circling
    {
      const gullG = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-1.4, 0.3, 0), new THREE.Vector3(0, 0, 0.4), new THREE.Vector3(0, 0, -0.3),
        new THREE.Vector3(1.4, 0.3, 0), new THREE.Vector3(0, 0, -0.3), new THREE.Vector3(0, 0, 0.4),
      ]);
      gullG.computeVertexNormals();
      const gulls = Array.from({ length: 18 }, (_, i) => ({ cx: [ISLETS[0][0], -60, -150, 200][i % 4], cz: [ISLETS[0][1], 20, 180, 120][i % 4], r: rr(14, 40), y: rr(22, 40), w: rr(0.25, 0.5) * (i % 2 ? 1 : -1), ph: rr(0, 6) }));
      const im = new THREE.InstancedMesh(gullG, new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide, emissive: 0x555555 }), gulls.length);
      root.add(im);
      onUpdate((dt, t) => {
        gulls.forEach((o, i) => {
          const a = o.ph + t * o.w;
          P.set(o.cx + Math.cos(a) * o.r, o.y + Math.sin(t * 0.8 + i) * 1.5, o.cz + Math.sin(a) * o.r);
          const flap = Math.sin(t * 7 + i) * 0.35;
          Q.setFromEuler(E.set(0, -a + (o.w > 0 ? 0 : Math.PI), o.w > 0 ? -0.3 : 0.3));
          S.set(1, 1 + flap, 1);
          im.setMatrixAt(i, M.compose(P, Q, S));
        });
        im.instanceMatrix.needsUpdate = true;
      });
    }
  },
};

function mulberry(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
