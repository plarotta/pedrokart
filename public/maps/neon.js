// Neon City Nights — a night-time street circuit through a glowing downtown: a harbour-front sweeper
// past a ferris wheel and a suspension bridge, a chicane under neon arches, and city-block corners
// around the Pedro Tower. Everything that glows is emissive / basic material or additive sprites —
// no extra real lights.

const WATER_X = 256; // the bay starts east of this line (the sweeper tops out at x≈222)
const FAR_SHORE = 720;

// ---------------------------------------------------------------- helpers
function ribbonGeo(THREE, track, N, a, b, y, vScale) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const k = i % N, p = track.p[k], r = track.r[k];
    pos.push(p.x + r.x * a, y, p.z + r.z * a, p.x + r.x * b, y, p.z + r.z * b);
    const v = (i === N ? track.len : track.d[k]) / vScale;
    uv.push(0, v, 1, v);
    if (i < N) { const j = i * 2; idx.push(j, j + 1, j + 2, j + 1, j + 3, j + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Collects textured quads into one BufferGeometry (one draw call for all signs).
function quadBatch(THREE) {
  const pos = [], uv = [], idx = [];
  return {
    // center c (Vector3), right-vector rx (unit, horizontal), width w, height h, uv rect [u0,v0,u1,v1]
    add(c, rx, w, h, [u0, v0, u1, v1]) {
      const n = pos.length / 3, hw = w / 2, hh = h / 2;
      const P = (sx, sy) => pos.push(c.x + rx.x * hw * sx, c.y + hh * sy, c.z + rx.z * hw * sx);
      P(-1, -1); P(1, -1); P(1, 1); P(-1, 1);
      uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
      idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
    },
    build() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      return g;
    },
  };
}

const NEON = ['#ff2bd6', '#22e6ff', '#ffe14d', '#8b5cff', '#ff7a1a', '#3dff9a', '#ff4466'];

export default {
  name: 'Neon City Nights',
  order: 5,
  ctrl: [[0, 150], [80, 150], [140, 145], [188, 120], [212, 68], [222, 0], [212, -70], [180, -125], [125, -160], [65, -170],
    [18, -156], [-32, -184], [-85, -170], [-145, -172], [-205, -150], [-230, -100], [-215, -55], [-170, -40], [-138, -12],
    [-130, 50], [-115, 118], [-70, 150]],
  itemRows: [0.07, 0.36, 0.585, 0.83],
  boostPads: [[0.035, 0], [0.235, -4], [0.5, 0], [0.63, 3.5], [0.86, -3.5]],

  theme: {
    glow: { road: 0.28, roadColor: 0x8890b8, curb: 0.35, walls: 1.2, banner: 0.9 },
    roadFinish: { roughness: 0.45, metalness: 0.15 },
    sky: { top: 0x04061a, horizon: 0x3b1f63, bottom: 0x160b2c },
    fog: { color: 0x2a1850, near: 220, far: 1250 },
    sun: { dir: [0.72, 0.3, -0.62], color: 0xa9b8ff, intensity: 1.1, glow: 0x3a4a8a },
    hemi: { sky: 0x6a6ad8, ground: 0x2a1640, intensity: 1.35 },
    envIntensity: 1.0,
    exposure: 1.15,
    clouds: { count: 0 },
    terrain: {
      low: 0x24222e, lowAlt: 0x1c1b26, rock: 0x24222e, peak: 0x24222e,
      hills: 0, rim: 0, rockAt: 999, peakAt: 999,
      detail: ['#9a98a8', '#8a8898', '#aaa8b6', '#7e7c8c', '#b4b2c0'],
    },
    road: { base: '#34363f', speckle: ['#2c2e36', '#3c3e48', '#30323a', '#44464f', '#282a31'], lines: '#f2f6ff', centerLine: true },
    curb: ['#ff2bd6', '#f4f0ff'],
    shoulder: { base: '#3a3947', speckle: ['#34333f', '#42414f', '#302f3a', '#484756'] },
    walls: {
      height: 1.2, rail: 0x22e6ff,
      panels: [['#0b0620', '#ff2bd6', 'NEON'], ['#0b0620', '#22e6ff', 'PEDRO'], ['#0b0620', '#ffe14d', 'KART'], ['#0b0620', '#3dff9a', 'NIGHT GP']],
    },
    vegetation: { round: 0, pine: 0, bush: 0, rock: 0, flower: 0 },
    props: { grandstands: false, bunting: false, mushrooms: false, pipes: false, balloons: false },
  },

  // Flat city; the bay east of the waterfront drops under the water plane.
  terrain: ({ x, smooth }) => -0.05 - 4 * smooth(WATER_X, WATER_X + 6, x) * (1 - smooth(FAR_SHORE - 6, FAR_SHORE, x)),

  decorate(ctx) {
    const { THREE, root, track, pointAt, idxAt, distToTrack, canvasTex, rand, BARRIER, HALF_W, N, onUpdate } = ctx;
    const center = track.center;
    const add = (o) => { root.add(o); return o; };
    const basic = (color, extra = {}) => new THREE.MeshBasicMaterial({ color, ...extra });
    const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), E = new THREE.Euler(), C = new THREE.Color();
    const idxNear = (x, z) => { let b = 0, bd = Infinity; for (let i = 0; i < N; i++) { const p = track.p[i], d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < bd) { bd = d; b = i; } } return b; };

    const glowTex = canvasTex(64, 64, (g) => {
      const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.2, 'rgba(255,255,255,.7)'); r.addColorStop(0.5, 'rgba(255,255,255,.16)'); r.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = r; g.fillRect(0, 0, 64, 64);
    }, false);
    // Additive glow dots: one draw call per group.
    const glowPoints = (list, size, opts = {}) => {
      const pos = [], col = [];
      for (const [p, c] of list) { pos.push(p.x, p.y, p.z); C.set(c); col.push(C.r, C.g, C.b); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      const pts = new THREE.Points(g, new THREE.PointsMaterial({
        size, map: glowTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, ...opts,
      }));
      pts.frustumCulled = false;
      return add(pts);
    };


    // ---- sky: stars + moon
    {
      const pos = [], col = [];
      for (let i = 0; i < 1400; i++) {
        const u = rand(0.06, 1), a = rand(0, Math.PI * 2), r = Math.sqrt(1 - u * u);
        pos.push(center.x + Math.cos(a) * r * 1600, u * 1600, center.z + Math.sin(a) * r * 1600);
        C.setHSL(rand(0.55, 0.7), rand(0.2, 0.6), rand(0.7, 0.95)).multiplyScalar(u < 0.2 ? 0.5 : 1);
        col.push(C.r, C.g, C.b);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      add(new THREE.Points(g, new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, fog: false, depthWrite: false, transparent: true, map: glowTex })));

      const moonTex = canvasTex(256, 256, (g) => {
        const r = g.createRadialGradient(118, 112, 10, 128, 128, 110);
        r.addColorStop(0, '#fffdf2'); r.addColorStop(0.8, '#e6e8f4'); r.addColorStop(1, '#c4c8e0');
        g.fillStyle = r; g.beginPath(); g.arc(128, 128, 110, 0, 7); g.fill();
        g.fillStyle = 'rgba(150,156,190,.35)';
        for (const [x, y, s] of [[90, 100, 26], [150, 80, 14], [160, 150, 30], [100, 170, 16], [130, 125, 9], [70, 145, 11]]) { g.beginPath(); g.arc(x, y, s, 0, 7); g.fill(); }
      }, false);
      const dir = new THREE.Vector3(...ctx.theme.sun.dir).normalize();
      const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTex, fog: false, depthWrite: false, transparent: true }));
      moon.scale.set(150, 150, 1);
      moon.position.copy(center).addScaledVector(dir, 1450);
      add(moon);
    }

    // ---- sidewalks outside the walls and the pools of light from the street lamps
    const paveTex = canvasTex(128, 128, (g, w, h) => {
      g.fillStyle = '#3b3a48'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 3000; i++) { g.fillStyle = ['#34333f', '#42414f', '#393846'][i % 3]; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
      g.fillStyle = '#26252f';
      for (let k = 0; k <= 4; k++) { g.fillRect(0, k * 32 - 1, w, 2); g.fillRect(k * 32 - 1, 0, 2, h); }
    });
    const paveMat = new THREE.MeshStandardMaterial({ map: paveTex, roughness: 0.8, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -0.5, polygonOffsetUnits: -1 });
    for (const s of [-1, 1]) {
      const g = ribbonGeo(THREE, track, N, s * (BARRIER + 0.2), s * (BARRIER + 7), 0.015, 7);
      const m = add(new THREE.Mesh(g, paveMat));
      m.receiveShadow = true;
    }
    // Neon kerb line along the outer sidewalk edge.
    for (const [s, c] of [[-1, 0x8b5cff], [1, 0x22e6ff]]) add(new THREE.Mesh(ribbonGeo(THREE, track, N, s * (BARRIER + 6.8), s * (BARRIER + 7.2), 0.05, 7), basic(c, { side: THREE.DoubleSide })));

    const len = track.len, LAMP = len / Math.round(len / 34); // lamp spacing (per side), fits the lap exactly
    const OW = BARRIER + 7;
    const poolTex = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = 'lighter';
      const pool = (u, v) => {
        for (const dv of [-1, 0, 1]) {
          g.save(); g.translate(u * w, (v + dv) * h); g.scale(1, 1.25);
          const r = g.createRadialGradient(0, 0, 0, 0, 0, w * 0.23);
          r.addColorStop(0, 'rgba(255,190,110,.7)'); r.addColorStop(0.45, 'rgba(255,160,90,.28)'); r.addColorStop(1, 'rgba(255,140,80,0)');
          g.fillStyle = r; g.beginPath(); g.arc(0, 0, w * 0.23, 0, 7); g.fill(); g.restore();
        }
      };
      const lu = (lat) => (lat + OW) / (2 * OW);
      pool(lu(-(BARRIER - 1.2)), 0.25); pool(lu(BARRIER - 1.2), 0.75);
    });
    const pools = new THREE.Mesh(ribbonGeo(THREE, track, N, -OW, OW, 0.09, LAMP), new THREE.MeshBasicMaterial({
      map: poolTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -16,
    }));
    pools.renderOrder = 1;
    add(pools);

    // ---- street lamps (instanced): pole, arm, head, glow, light cone
    {
      const spots = [];
      for (let k = 0; k < Math.round(len / LAMP); k++) {
        for (const [side, off] of [[-1, 0.25], [1, 0.75]]) {
          const d = (k + off) * LAMP;
          let i = Math.min(N - 1, Math.floor(d / track.ds));
          while (i < N - 1 && track.d[i] < d) i++;
          const base = pointAt(i, side * (BARRIER + 3.4));
          if (distToTrack(base.x, base.z, 2) < BARRIER + 3) continue;
          if (i < 30 || i > N - 40) continue; // keep the start gantry clean
          spots.push({ i, side, base, head: pointAt(i, side * (BARRIER - 0.6), 8.6) });
        }
      }
      const n = spots.length;
      const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a2d3a, metalness: 0.7, roughness: 0.4 });
      const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.24, 9, 8).translate(0, 4.5, 0), poleMat, n);
      const arm = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.16, 4.2).translate(0, 8.9, -2.1), poleMat, n);
      const head = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 0.22, 1.4).translate(0, 8.72, -3.9), basic(0xfff0d0), n);
      const coneTex = canvasTex(8, 128, (g, w, h) => {
        const r = g.createLinearGradient(0, 0, 0, h);
        r.addColorStop(0, 'rgba(255,200,130,.10)'); r.addColorStop(0.6, 'rgba(255,190,120,.035)'); r.addColorStop(1, 'rgba(255,180,110,0)');
        g.fillStyle = r; g.fillRect(0, 0, w, h);
      }, false);
      const cone = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.5, 4.2, 8.5, 20, 1, true).translate(0, 4.4, -3.9),
        new THREE.MeshBasicMaterial({ map: coneTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), n);
      const glows = [];
      spots.forEach((s, j) => {
        // local -z of the lamp points toward the road
        const yaw = Math.atan2(s.head.x - s.base.x, s.head.z - s.base.z) + Math.PI;
        Q.setFromEuler(E.set(0, yaw, 0));
        M4.compose(s.base, Q, S.set(1, 1, 1));
        pole.setMatrixAt(j, M4); arm.setMatrixAt(j, M4); head.setMatrixAt(j, M4); cone.setMatrixAt(j, M4);
        const h = new THREE.Vector3(0, 8.55, -3.9).applyQuaternion(Q).add(s.base);
        glows.push([h, 0xffc890]);
      });
      pole.castShadow = true;
      add(pole); add(arm); add(head); add(cone);
      glowPoints(glows, 7);
    }

    // ---- glowing neon tubes along the wall tops
    for (const [s, c] of [[-1, 0xff2bd6], [1, 0x22e6ff]]) {
      const pts = [];
      for (let i = 0; i < N; i += 4) pts.push(pointAt(i, s * BARRIER, 1.34));
      add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), N / 4, 0.2, 6, true), basic(c)));
    }

    // ---- buildings: one instanced box, windows mapped in world units by a small shader tweak
    const winTex = canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = '#171a2a'; g.fillRect(0, 0, w, h);
      const lit = ['#ffd98a', '#ffe9b8', '#fff4dc', '#9fe6ff', '#ffb070', '#c9b8ff'];
      for (let cy = 0; cy < 8; cy++) {
        g.fillStyle = '#10121e'; g.fillRect(0, cy * 64 + 58, w, 6); // floor bands
        const rowWarm = Math.random();
        for (let cx = 0; cx < 8; cx++) {
          const on = Math.random() < 0.42;
          g.fillStyle = on ? lit[Math.floor((rowWarm * 3 + Math.random() * 3)) % lit.length] : (Math.random() < 0.5 ? '#0b0d18' : '#1c2440');
          g.fillRect(cx * 64 + 12, cy * 64 + 12, 40, 38);
          if (on) { g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(cx * 64 + 12, cy * 64 + 12, 40, 7); }
        }
      }
    });
    winTex.wrapS = winTex.wrapT = THREE.RepeatWrapping;
    const bMat = new THREE.MeshLambertMaterial({ map: winTex, emissiveMap: winTex, emissive: 0xffffff, emissiveIntensity: 0.95 });
    bMat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
        #ifdef USE_INSTANCING
          vec3 bs = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
          vec2 bo = floor(fract(instanceMatrix[3].xz * vec2(0.0137, 0.0191)) * 8.0) / 8.0;
        #else
          vec3 bs = vec3(1.0); vec2 bo = vec2(0.0);
        #endif
        vec2 bu = abs(normal.y) > 0.5 ? vec2(0.004) : uv * vec2(abs(normal.x) > 0.5 ? bs.z : bs.x, bs.y) / vec2(22.0, 25.6) + bo;
        #ifdef USE_MAP
          vMapUv = bu;
        #endif
        #ifdef USE_EMISSIVEMAP
          vEmissiveMapUv = bu;
        #endif`);
    };
    const boxGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const blds = [];
    const tower = { x: 40, z: -10 };
    const wheel = { x: 318, z: 30 };
    const hq = { x: 238, z: 192, w: 22, d: 33, h: 28.8 }; // rooftop 'PEDRO KART' sign at the end of the main straight
    const blocked = (x, z, r) => Math.hypot(x - tower.x, z - tower.z) < 34 + r || Math.hypot(x - hq.x, z - hq.z) < 22 + r;
    {
      const cell = 30;
      for (let gx = -1000; gx <= 1000; gx += cell) {
        for (let gz = -1000; gz <= 1000; gz += cell) {
          const x = center.x + gx + rand(-3, 3), z = center.z + gz + rand(-3, 3);
          const rc = Math.hypot(gx, gz);
          if (rc > 960) continue;
          const far = rc > 380;
          const fw = 2.75 * Math.round(rand(4.5, far ? 9.5 : 8)), fd = 2.75 * Math.round(rand(4.5, far ? 9.5 : 8));
          const rad = Math.hypot(fw, fd) / 2;
          if (x > WATER_X - rad - 4 && x < FAR_SHORE + rad + 2) continue;
          if (blocked(x, z, rad)) continue;
          const d = distToTrack(x, z, 8);
          if (d < BARRIER + 9 + rad) continue;
          if (!far && Math.random() < 0.08) continue;
          let floors;
          if (d < 60) floors = rand(3, 9);
          else if (!far) floors = rand(5, 16);
          else floors = rand(8, 38) * (x > FAR_SHORE ? 1.2 : 1);
          const h = 3.2 * Math.round(floors * 1.1);
          blds.push({ x, z, w: fw, d: fd, h, near: d < 70 });
        }
      }
      blds.push({ ...hq, near: false });
      // setback tiers on the taller blocks, glass curtain walls on a share of the skyscrapers
      const boxes = [], glass = [];
      blds.forEach((b, j) => {
        const list = b.h > 70 && j % 5 < 2 ? glass : boxes;
        list.push({ x: b.x, y: 0, z: b.z, w: b.w, h: b.h, d: b.d });
        if (b.h > 30 && j % 3) {
          const w = 2.75 * Math.max(2, Math.round(b.w * 0.65 / 2.75)), d = 2.75 * Math.max(2, Math.round(b.d * 0.65 / 2.75));
          list.push({ x: b.x, y: b.h, z: b.z, w, h: 3.2 * Math.round(b.h * 0.3 / 3.2 + 1), d });
          b.top = b.h + list[list.length - 1].h;
        }
      });
      const glassTex = canvasTex(512, 512, (g, w, h) => {
        g.fillStyle = '#0e1a34'; g.fillRect(0, 0, w, h);
        for (let cy = 0; cy < 8; cy++) for (let cx = 0; cx < 8; cx++) {
          const on = Math.random() < 0.16;
          g.fillStyle = on ? (Math.random() < 0.5 ? '#7fc8e8' : '#c8dcf0') : (Math.random() < 0.5 ? '#122646' : '#172f55');
          g.fillRect(cx * 64 + 3, cy * 64 + 4, 58, 54);
        }
        g.fillStyle = 'rgba(120,220,255,.55)';
        for (let cy = 0; cy < 8; cy += 4) g.fillRect(0, cy * 64 + 60, w, 3);
      });
      const gMat = bMat.clone();
      gMat.map = gMat.emissiveMap = glassTex;
      gMat.onBeforeCompile = bMat.onBeforeCompile;
      const tints = [0x9a9ab8, 0x8c9ccc, 0xa892c4, 0x8aa6b8, 0xb0a0c0];
      for (const [list, mat] of [[boxes, bMat], [glass, gMat]]) {
        const inst = new THREE.InstancedMesh(boxGeo, mat, list.length);
        list.forEach((b, j) => {
          M4.compose(P.set(b.x, b.y, b.z), Q.identity(), S.set(b.w, b.h, b.d));
          inst.setMatrixAt(j, M4);
          inst.setColorAt(j, C.setHex(tints[j % tints.length]));
        });
        inst.castShadow = true; inst.receiveShadow = true;
        add(inst);
      }
      // the rooftop sign
      {
        const tex = canvasTex(1024, 256, (g, w, h) => {
          g.clearRect(0, 0, w, h);
          g.font = 'italic 900 170px Impact, "Arial Black", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
          g.shadowColor = '#ff2bd6'; g.shadowBlur = 40; g.lineWidth = 14; g.strokeStyle = '#ff2bd6'; g.strokeText('PEDRO KART', w / 2, h / 2 + 6);
          g.shadowBlur = 0; g.fillStyle = '#ffe14d'; g.fillText('PEDRO KART', w / 2, h / 2 + 6);
        }, false);
        const sg = new THREE.Group();
        sg.position.set(hq.x, hq.h, hq.z);
        sg.rotation.y = -1.95;
        const face = new THREE.Mesh(new THREE.PlaneGeometry(40, 10), new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
        face.position.y = 7.5;
        const truss = new THREE.MeshStandardMaterial({ color: 0x2a2d3a, metalness: 0.6, roughness: 0.5 });
        sg.add(face);
        for (const x of [-15, -5, 5, 15]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.4, 7, 0.4), truss); p.position.set(x, 3.5, -0.5); sg.add(p); }
        const bar = new THREE.Mesh(new THREE.BoxGeometry(38, 0.4, 0.4), truss); bar.position.set(0, 2.6, -0.5); sg.add(bar);
        add(sg);
        onUpdate((dt, t) => { face.material.opacity = (Math.sin(t * 13) > -0.9 || Math.sin(t * 0.7) < 0.9) ? 1 : 0.35; });
      }

      // roof trims + blinking aircraft lights on tall ones
      const roofGlow = [], blink = [];
      blds.forEach((b, j) => {
        if (b.h > 60 && j % 2 === 0) blink.push([new THREE.Vector3(b.x, (b.top || b.h) + 1.5, b.z), 0xff3040]);
      });
      const bl = glowPoints(blink, 14);
      onUpdate((dt, t) => { bl.material.opacity = 0.35 + 0.65 * (Math.sin(t * 3) > 0.2 ? 1 : 0); });
      // neon roof outlines on a share of mid-rise buildings
      const edgePos = [], edgeCol = [];
      blds.forEach((b, j) => {
        if (j % 3 !== 0 || b.h > 90) return;
        C.set(NEON[j % NEON.length]);
        const y = b.h + 0.2, hx = b.w / 2 + 0.1, hz = b.d / 2 + 0.1;
        const cs = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]];
        for (let k = 0; k < 4; k++) {
          const [ax, az] = cs[k], [bx, bz] = cs[(k + 1) % 4];
          edgePos.push(b.x + ax, y, b.z + az, b.x + bx, y, b.z + bz);
          edgeCol.push(C.r, C.g, C.b, C.r, C.g, C.b);
        }
      });
      const eg = new THREE.BufferGeometry();
      eg.setAttribute('position', new THREE.Float32BufferAttribute(edgePos, 3));
      eg.setAttribute('color', new THREE.Float32BufferAttribute(edgeCol, 3));
      add(new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ vertexColors: true })));
    }

    // ---- neon signs on building faces facing the track (one atlas, one draw call)
    const atlas = canvasTex(1024, 1024, (g, w, h) => {
      g.fillStyle = '#07040f'; g.fillRect(0, 0, w, h);
      const words = ['PEDRO', 'RAMEN', 'HOTEL', 'KART', '24H', 'ARCADE', 'SUSHI', 'TURBO', 'CLUB', 'DRIFT', 'PIZZA', 'NEON', 'CAFE', 'BAR', 'GP ★', 'DISCO'];
      const neonText = (text, x, y, size, color) => {
        g.font = `900 ${size}px "Arial Black", Impact, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.shadowColor = color; g.shadowBlur = 22; g.fillStyle = color; g.fillText(text, x, y); g.fillText(text, x, y);
        g.shadowBlur = 0; g.fillStyle = 'rgba(255,255,255,.75)'; g.font = `900 ${size * 0.96}px "Arial Black", Impact, sans-serif`; g.fillText(text, x, y);
      };
      words.forEach((word, k) => {
        const cx = (k % 4) * 256, cy = Math.floor(k / 4) * 128, col = NEON[k % NEON.length];
        g.shadowColor = col; g.shadowBlur = 14; g.strokeStyle = col; g.lineWidth = 6;
        g.strokeRect(cx + 10, cy + 10, 236, 108); g.shadowBlur = 0;
        neonText(word, cx + 128, cy + 66, word.length > 5 ? 44 : 60, NEON[(k + 3) % NEON.length]);
      });
      const vwords = ['HOTEL', 'KARAOKE', 'RAMEN', 'GAMES', 'OPEN', 'BAR', 'PEDRO', 'SHOP'];
      vwords.forEach((word, k) => {
        const cx = k * 128, cy = 512, col = NEON[(k + 1) % NEON.length];
        g.shadowColor = col; g.shadowBlur = 14; g.strokeStyle = col; g.lineWidth = 6;
        g.strokeRect(cx + 10, cy + 10, 108, 492); g.shadowBlur = 0;
        const step = Math.min(70, 470 / word.length);
        [...word].forEach((ch, i) => neonText(ch, cx + 64, cy + 30 + step * (i + 0.5), Math.min(64, step * 0.95), NEON[(k + 4) % NEON.length]));
      });
    }, false);
    {
      const batch = quadBatch(THREE);
      const tmp = new THREE.Vector3();
      blds.forEach((b, j) => {
        if (!b.near || j % 2) return;
        // face toward the nearest track point
        const i = idxNear(b.x, b.z), p = track.p[i];
        const dx = p.x - b.x, dz = p.z - b.z;
        let nx = 0, nz = 0;
        if (Math.abs(dx) > Math.abs(dz)) nx = Math.sign(dx); else nz = Math.sign(dz);
        const faceW = nx ? b.d : b.w, off = (nx ? b.w : b.d) / 2 + 0.25;
        const rx = new THREE.Vector3(nz, 0, -nx); // right-vector along the face, seen from outside
        const vertical = j % 4 === 2 && b.h > 14;
        const k = (j * 7) % (vertical ? 8 : 16);
        let uvr, sw, sh;
        if (vertical) { uvr = [k / 8, 0, (k + 1) / 8, 0.5]; sw = 3; sh = 12; }
        else { const cx = k % 4, cy = Math.floor(k / 4); uvr = [cx / 4, 1 - (cy + 1) / 8, (cx + 1) / 4, 1 - cy / 8]; sw = Math.min(faceW * 0.8, 12); sh = sw / 2; }
        if (sh > b.h - 3) return;
        const y = Math.max(sh / 2 + 3, Math.min(b.h - sh / 2 - 1, rand(0.35, 0.8) * b.h));
        const shift = vertical ? (faceW / 2 - 2.5) * (j % 8 < 4 ? -1 : 1) : 0;
        tmp.set(b.x + nx * off, y, b.z + nz * off).addScaledVector(rx, shift);
        batch.add(tmp, rx, sw, sh, uvr);
      });
      const signMat = new THREE.MeshBasicMaterial({ map: atlas, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 });
      add(new THREE.Mesh(batch.build(), signMat));
    }

    // ---- billboards on posts beside the straights, angled toward oncoming karts
    {
      const boardTex = (draw) => canvasTex(512, 256, draw, false);
      const boards = [
        boardTex((g, w, h) => {
          const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#2b0a5c'); gr.addColorStop(1, '#ff2bd6');
          g.fillStyle = gr; g.fillRect(0, 0, w, h);
          g.font = 'italic 900 96px Impact, "Arial Black", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
          g.lineWidth = 12; g.strokeStyle = '#12002a'; g.strokeText('PEDRO', w / 2, 92); g.fillStyle = '#ffe14d'; g.fillText('PEDRO', w / 2, 92);
          g.font = 'italic 900 64px Impact, "Arial Black", sans-serif'; g.fillStyle = '#fff'; g.fillText('NIGHT GP', w / 2, 184);
        }),
        boardTex((g, w, h) => {
          g.fillStyle = '#04202e'; g.fillRect(0, 0, w, h);
          for (let i = 0; i < 12; i++) { g.fillStyle = `rgba(34,230,255,${0.05 + i * 0.02})`; g.fillRect(0, h - i * 20, w, 10); }
          g.font = '900 88px "Arial Black", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
          g.shadowColor = '#22e6ff'; g.shadowBlur = 30; g.fillStyle = '#bff8ff'; g.fillText('TURBO', w / 2, 100);
          g.font = '900 40px "Arial Black", sans-serif'; g.fillStyle = '#ffffff'; g.fillText('ENERGY DRINK', w / 2, 185);
        }),
        boardTex((g, w, h) => {
          g.fillStyle = '#ffe14d'; g.fillRect(0, 0, w, h);
          g.fillStyle = '#e8262b'; g.beginPath(); g.arc(110, 128, 84, 0, 7); g.fill();
          g.fillStyle = '#fff'; for (const [x, y, r] of [[80, 100, 18], [140, 96, 14], [112, 160, 16]]) { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
          g.font = '900 64px "Arial Black", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
          g.fillStyle = '#2a0a3a'; g.fillText('SHROOM', 350, 100); g.fillText('COLA', 350, 170);
        }),
        boardTex((g, w, h) => {
          const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#0d0630'); gr.addColorStop(1, '#3d0f6a');
          g.fillStyle = gr; g.fillRect(0, 0, w, h);
          g.strokeStyle = '#3dff9a'; g.lineWidth = 8; g.shadowColor = '#3dff9a'; g.shadowBlur = 20; g.strokeRect(14, 14, w - 28, h - 28);
          g.font = '900 74px "Arial Black", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
          g.fillStyle = '#3dff9a'; g.fillText('DRIFT', w / 2, 96); g.fillStyle = '#ff7a1a'; g.fillText('HARDER', w / 2, 176);
        }),
      ];
      const postMat = new THREE.MeshStandardMaterial({ color: 0x2a2d3a, metalness: 0.6, roughness: 0.4 });
      const frameMat = new THREE.MeshStandardMaterial({ color: 0x14141c, metalness: 0.5, roughness: 0.5 });
      const postGeo = new THREE.CylinderGeometry(0.35, 0.45, 1, 8).translate(0, 0.5, 0);
      const place = [[0.02, -1, 0], [0.16, 1, 1], [0.27, -1, 2], [0.42, 1, 3], [0.52, -1, 1], [0.7, 1, 0], [0.8, 1, 3], [0.9, -1, 2]];
      for (const [f, side, t] of place) {
        const i = idxAt(f), lat = side * (BARRIER + 9);
        const pos = pointAt(i, lat);
        if (distToTrack(pos.x, pos.z, 2) < BARRIER + 7) continue;
        const g = new THREE.Group();
        g.position.copy(pos);
        // face back down the track, turned ~25° toward the road
        g.rotation.y = track.ang[i] + Math.PI - side * 0.45;
        const W = 16, H = 8, Y = 9;
        for (const x of [-W / 3, W / 3]) { const p = new THREE.Mesh(postGeo, postMat); p.scale.y = Y; p.position.x = x; g.add(p); }
        const frame = new THREE.Mesh(new THREE.BoxGeometry(W + 0.8, H + 0.8, 0.5), frameMat);
        frame.position.set(0, Y + H / 2, -0.3);
        const face = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: boards[t] }));
        face.position.set(0, Y + H / 2, 0);
        // back of the board is towards -z; front faces +z (after the rotation, toward oncoming karts)
        g.add(frame, face);
        add(g);
      }
    }

    // ---- neon arches over the chicane and the back straight
    {
      const archGeo = new THREE.TorusGeometry(BARRIER + 5, 0.45, 8, 48, Math.PI);
      const innerGeo = new THREE.TorusGeometry(BARRIER + 3.8, 0.18, 6, 48, Math.PI);
      const cols = [0xff2bd6, 0x22e6ff, 0x8b5cff, 0xffe14d];
      const mats = cols.map((c) => basic(c));
      const glow = [];
      const arches = [];
      let k = 0;
      for (let f = 0.552; f <= 0.64; f += 0.0145, k++) {
        const i = idxAt(f), p = track.p[i];
        const g = new THREE.Group();
        g.position.set(p.x, 0, p.z);
        g.rotation.y = track.ang[i];
        g.add(new THREE.Mesh(archGeo, mats[k % mats.length]), new THREE.Mesh(innerGeo, mats[(k + 1) % mats.length]));
        add(g);
        arches.push(g);
        for (let a = 0; a <= 8; a++) {
          const t = (a / 8) * Math.PI, r = BARRIER + 5;
          glow.push([new THREE.Vector3(Math.cos(t) * r, Math.sin(t) * r, 0).applyEuler(g.rotation).add(g.position), cols[k % cols.length]]);
        }
      }
      glowPoints(glow, 9);
      // chase lights: pulse the arch colours in sequence
      onUpdate((dt, t) => {
        arches.forEach((g, j) => { const on = 0.55 + 0.45 * Math.max(0, Math.sin(t * 5 - j * 0.9)); g.children[0].scale.setScalar(1); g.children[0].material.color.setHex(cols[j % cols.length]).multiplyScalar(on); });
      });
    }

    // ---- Pedro Tower: the downtown landmark inside the loop
    {
      const g = new THREE.Group();
      g.position.set(tower.x, 0, tower.z);
      const stripeTex = canvasTex(256, 256, (c, w, h) => {
        c.fillStyle = '#141626'; c.fillRect(0, 0, w, h);
        for (let x = 0; x < w; x += 32) { c.fillStyle = '#9fe6ff'; c.fillRect(x + 14, 0, 4, h); }
        for (let y = 0; y < h; y += 16) { c.fillStyle = 'rgba(255,217,138,.55)'; for (let x = 0; x < w; x += 32) if (Math.random() < 0.5) c.fillRect(x + 3, y + 3, 9, 9); }
      });
      stripeTex.repeat.set(2, 12);
      const shaftMat = new THREE.MeshLambertMaterial({ map: stripeTex, emissiveMap: stripeTex, emissive: 0xffffff, emissiveIntensity: 0.9 });
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(7, 13, 130, 8, 1, true).translate(0, 65, 0), shaftMat);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(22, 24, 10, 8).translate(0, 5, 0), new THREE.MeshLambertMaterial({ color: 0x1b1c2a }));
      const deckTex = canvasTex(512, 64, (c, w, h) => {
        c.fillStyle = '#10101c'; c.fillRect(0, 0, w, h);
        c.fillStyle = '#ffe9b8'; for (let x = 0; x < w; x += 16) c.fillRect(x + 2, 18, 12, 30);
      });
      deckTex.repeat.set(3, 1);
      const deckMat = new THREE.MeshLambertMaterial({ map: deckTex, emissiveMap: deckTex, emissive: 0xffffff });
      const deck = new THREE.Mesh(new THREE.CylinderGeometry(17, 14, 10, 24).translate(0, 118, 0), deckMat);
      const deck2 = new THREE.Mesh(new THREE.CylinderGeometry(10, 9, 6, 16).translate(0, 136, 0), deckMat);
      const ring = (r, y, c) => { const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.6, 6, 48), basic(c)); m.rotation.x = Math.PI / 2; m.position.y = y; return m; };
      const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 3, 50, 8).translate(0, 164, 0), new THREE.MeshLambertMaterial({ color: 0xd0d4ea, emissive: 0x5a5a8a }));
      g.add(shaft, base, deck, deck2, spire, ring(17.6, 123, 0xff2bd6), ring(14.6, 113, 0x22e6ff), ring(10.6, 139.5, 0xff2bd6), ring(23, 10.2, 0x22e6ff));
      add(g);
      const beacon = glowPoints([[new THREE.Vector3(tower.x, 190, tower.z), 0xff2040]], 40);
      onUpdate((dt, t) => { beacon.material.opacity = Math.sin(t * 2.5) > 0 ? 1 : 0.2; });
      // searchlights sweeping the sky
      const beamTex = canvasTex(16, 128, (c, w, h) => {
        const r = c.createLinearGradient(0, 0, 0, h); r.addColorStop(0, 'rgba(180,200,255,0)'); r.addColorStop(1, 'rgba(180,200,255,.14)');
        c.fillStyle = r; c.fillRect(0, 0, w, h);
      }, false);
      const beamMat = new THREE.MeshBasicMaterial({ map: beamTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
      const beams = [];
      for (let b = 0; b < 3; b++) {
        const piv = new THREE.Group();
        piv.position.set(tower.x, 142, tower.z);
        const m = new THREE.Mesh(new THREE.CylinderGeometry(12, 1.2, 260, 16, 1, true).translate(0, 130, 0), beamMat);
        piv.add(m);
        add(piv);
        beams.push(piv);
      }
      onUpdate((dt, t) => beams.forEach((p, b) => { p.rotation.set(0.45 + 0.12 * Math.sin(t * 0.4 + b), t * 0.25 + b * 2.1, 0, 'YXZ'); }));
    }

    // ---- the bay: water, quay rail, ferris wheel pier, suspension bridge
    {
      const water = new THREE.Mesh(new THREE.PlaneGeometry(FAR_SHORE - WATER_X + 20, 2400).rotateX(-Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: 0x0a0a22, roughness: 0.12, metalness: 0.85 }));
      water.position.set((WATER_X + FAR_SHORE) / 2, -1.2, center.z);
      add(water);
      // quay wall with a neon rail
      const quay = new THREE.Mesh(new THREE.BoxGeometry(2, 3.2, 2400), new THREE.MeshLambertMaterial({ color: 0x2c2b38 }));
      quay.position.set(WATER_X, -1.5, center.z);
      add(quay);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 2400), basic(0x22e6ff));
      rail.position.set(WATER_X - 0.6, 1.1, center.z);
      add(rail);
      const qg = [];
      for (let z = -1100; z <= 1100; z += 24) qg.push([new THREE.Vector3(WATER_X - 0.6, 1.2, center.z + z), 0x22e6ff]);
      glowPoints(qg, 4);

      // reflections: soft additive streaks on the water under the bright stuff
      const streakTex = canvasTex(64, 256, (c, w, h) => {
        const r = c.createLinearGradient(0, 0, w, 0); r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(0.5, 'rgba(255,255,255,.5)'); r.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = r; for (let y = 0; y < h; y += 6) { c.globalAlpha = Math.random() * (1 - y / h); c.fillRect(0, y, w, 4); }
      }, false);
      const streak = (x, z, w, l, color) => {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l).rotateX(-Math.PI / 2).rotateY(Math.PI / 2),
          new THREE.MeshBasicMaterial({ map: streakTex, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
        m.position.set(x, -1.1, z);
        add(m);
      };

      // Ferris wheel on a pier (wheel in the y–z plane, facing the track)
      const pier = new THREE.Mesh(new THREE.BoxGeometry(110, 2, 90), new THREE.MeshLambertMaterial({ color: 0x2a2835 }));
      pier.position.set(wheel.x, -0.9, wheel.z);
      add(pier);
      const R = 44, HUB = 52;
      const wg = new THREE.Group();
      wg.position.set(wheel.x, HUB, wheel.z);
      add(wg);
      const spin = new THREE.Group();
      wg.add(spin);
      const rimMat = basic(0xff2bd6), rim2Mat = basic(0x22e6ff), spokeMat = basic(0x6a5aa8);
      for (const [x, m] of [[-2.5, rimMat], [2.5, rim2Mat]]) {
        const t = new THREE.Mesh(new THREE.TorusGeometry(R, 0.5, 6, 96), m);
        t.rotation.y = Math.PI / 2; t.position.x = x; spin.add(t);
        const t2 = new THREE.Mesh(new THREE.TorusGeometry(R * 0.55, 0.3, 6, 64), m);
        t2.rotation.y = Math.PI / 2; t2.position.x = x; spin.add(t2);
      }
      const spokes = 20;
      for (let s = 0; s < spokes; s++) {
        const a = (s / spokes) * Math.PI * 2;
        for (const x of [-2.5, 2.5]) {
          const sp = new THREE.Mesh(new THREE.BoxGeometry(0.25, R, 0.25).translate(0, R / 2, 0), spokeMat);
          sp.position.x = x; sp.rotation.x = a; spin.add(sp);
        }
      }
      const hubM = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 7, 16).rotateZ(Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xdddde8, emissive: 0x444466 }));
      wg.add(hubM);
      // rim bulbs cycling rainbow
      const bulbPos = [], bulbCol = [];
      for (let s = 0; s < 96; s++) {
        const a = (s / 96) * Math.PI * 2;
        for (const x of [-2.5, 2.5]) { bulbPos.push(x, Math.cos(a) * R, Math.sin(a) * R); C.setHSL(s / 96, 1, 0.6); bulbCol.push(C.r, C.g, C.b); }
      }
      const bg = new THREE.BufferGeometry();
      bg.setAttribute('position', new THREE.Float32BufferAttribute(bulbPos, 3));
      bg.setAttribute('color', new THREE.Float32BufferAttribute(bulbCol, 3));
      const bulbs = new THREE.Points(bg, new THREE.PointsMaterial({ size: 3.2, map: glowTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      spin.add(bulbs);
      // gondolas (instanced, kept upright)
      const gcount = 20;
      const gond = new THREE.InstancedMesh(new THREE.BoxGeometry(3.2, 3.4, 3.2).translate(0, -2.2, 0), new THREE.MeshLambertMaterial({ emissive: 0x222233 }), gcount);
      for (let s = 0; s < gcount; s++) gond.setColorAt(s, C.set(NEON[s % NEON.length]));
      gond.frustumCulled = false;
      add(gond);
      // A-frame legs
      const legMat = new THREE.MeshLambertMaterial({ color: 0xcfd2e6, emissive: 0x2a2a44 });
      for (const x of [-5, 5]) for (const s of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1, Math.hypot(HUB, 26), 8), legMat);
        leg.position.set(wheel.x + x, HUB / 2, wheel.z + s * 13);
        leg.rotation.x = s * Math.atan2(26, HUB);
        add(leg);
      }
      onUpdate((dt, t) => {
        spin.rotation.x = t * 0.08;
        for (let s = 0; s < gcount; s++) {
          const a = (s / gcount) * Math.PI * 2 + spin.rotation.x;
          M4.makeTranslation(wheel.x, HUB + Math.cos(a) * R, wheel.z + Math.sin(a) * R);
          gond.setMatrixAt(s, M4);
        }
        gond.instanceMatrix.needsUpdate = true;
      });
      streak(wheel.x + 70, wheel.z, 60, 120, 0xff2bd6);

      // Suspension bridge across the bay, north of the waterfront
      const BZ = -470, X0 = WATER_X - 20, X1 = FAR_SHORE + 40, T1 = 400, T2 = 600, TH = 95, DY = 16;
      const deck = new THREE.Mesh(new THREE.BoxGeometry(X1 - X0, 2.5, 22), new THREE.MeshLambertMaterial({ color: 0x1a1a28, emissive: 0x150f25 }));
      deck.position.set((X0 + X1) / 2, DY, BZ);
      add(deck);
      const towerMat = new THREE.MeshLambertMaterial({ color: 0x8a2a3a, emissive: 0x5a1a2a });
      for (const tx of [T1, T2]) for (const s of [-1, 1]) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(4, TH, 4).translate(0, TH / 2, 0), towerMat);
        p.position.set(tx, 0, BZ + s * 10);
        add(p);
        for (const y of [DY + 12, TH - 8]) { const b = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 20), towerMat); b.position.set(tx, y, BZ); add(b); }
      }
      const cable = [], lights = [];
      const sag = (x) => {
        if (x < T1) return DY + 4 + (TH - DY - 4) * ((x - X0) / (T1 - X0)) ** 2;
        if (x > T2) return DY + 4 + (TH - DY - 4) * ((X1 - x) / (X1 - T2)) ** 2;
        const u = (x - (T1 + T2) / 2) / ((T2 - T1) / 2);
        return DY + 6 + (TH - DY - 6) * u * u;
      };
      for (const s of [-1, 1]) {
        for (let x = X0; x <= X1; x += 6) {
          const y = sag(x);
          cable.push(x, y, BZ + s * 10, x + 6, sag(x + 6), BZ + s * 10);
          if ((x - X0) % 12 === 0) cable.push(x, y, BZ + s * 10, x, DY, BZ + s * 10);
          lights.push([new THREE.Vector3(x, y, BZ + s * 10), 0xfff0c0]);
        }
        for (let x = X0; x <= X1; x += 14) lights.push([new THREE.Vector3(x, DY + 2, BZ + s * 11), s > 0 ? 0xff5a4a : 0xffffff]);
      }
      const cg = new THREE.BufferGeometry();
      cg.setAttribute('position', new THREE.Float32BufferAttribute(cable, 3));
      add(new THREE.LineSegments(cg, new THREE.LineBasicMaterial({ color: 0xe8c890 })));
      glowPoints(lights, 7);
      glowPoints([T1, T2].map((x) => [new THREE.Vector3(x, TH + 3, BZ), 0xff3040]), 20);
      for (const x of [T1, T2]) streak(x, BZ + 30, 26, 80, 0xffc890);
    }
  },
};
