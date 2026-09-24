// Frosty Peaks — a snowy mountain pass: lodge-side start straight, a long sweeping descent,
// an S-section through the pines, a tight hairpin switchback and a frozen lake in the infield.

const LAKE = { x: -105, z: -20, r: 38 };
const LODGE_FRAC = 0.022, LODGE_LAT = -33;

export default {
  name: 'Frosty Peaks',
  order: 3,
  ctrl: [[-34, 145], [51, 145], [128, 140], [183, 102], [196, 38], [166, -13], [111, -13], [64, 30], [13, 26], [-13, -25], [38, -81], [119, -89],
    [170, -102], [194, -144], [162, -185], [94, -191], [-34, -174], [-136, -149], [-195, -89], [-191, 0], [-161, 72], [-115, 140]],
  itemRows: [0.16, 0.39, 0.66, 0.88],
  boostPads: [[0.075, 0], [0.245, 2.5], [0.43, -3], [0.625, 3.5], [0.825, -3]],
  theme: {
    sky: { top: 0x1c6ad6, horizon: 0xd6ebff, bottom: 0xdfeaf6 },
    fog: { color: 0xd6e8fa, near: 300, far: 1600 },
    sun: { dir: [0.5, 0.55, 0.62], color: 0xfff3e2, intensity: 2.5, glow: 0xfff8e8 },
    hemi: { sky: 0xe6f2ff, ground: 0xa9bdd6, intensity: 1.15 },
    envIntensity: 0.9,
    clouds: { count: 16, color: 0xffffff, emissive: 0xaab8cc },
    terrain: {
      low: 0xeef4fb, lowAlt: 0xd3e2f2, rock: 0x66758c, peak: 0xffffff,
      hills: 62, rim: 230, rockAt: 42, peakAt: 165,
      detail: ['#f3f7fc', '#dfe9f5', '#ffffff', '#d4e1ef', '#e9f1fa'],
    },
    road: { base: '#3f4552', speckle: ['#363b47', '#4a505d', '#434956', '#565c69', '#30353f'], lines: '#ffffff', centerLine: true },
    curb: ['#e02638', '#ffffff'],
    shoulder: { base: '#cddbeb', speckle: ['#bfd0e4', '#dbe6f2', '#b3c6dc', '#e6eef7'] },
    walls: {
      height: 1.2, rail: 0xe8f0fa,
      panels: [['#1565c0', '#ffffff', 'FROSTY'], ['#ffffff', '#1565c0', 'PEAKS'], ['#0ea5e9', '#ffffff', '❄ GP ❄'], ['#ffffff', '#e02638', 'PEDRO']],
    },
    vegetation: { round: 0, pine: 0, bush: 0, rock: 140, flower: 0, rockColor: 0x8d97a6, maxAltitude: 90 },
    props: { grandstands: true, bunting: true, mushrooms: false, pipes: false, balloons: false },
  },

  terrain: ({ x, z, base, smooth, center }) => {
    // fade the rim back down before the edge of the terrain plane (±950) so no cut-off ledge shows on the horizon
    const edge = 950 - Math.max(Math.abs(x - center.x), Math.abs(z - center.z));
    let h = base * smooth(0, 230, edge);
    const dl = Math.hypot(x - LAKE.x, z - LAKE.z);
    h *= smooth(LAKE.r, LAKE.r + 28, dl);           // lake basin
    if (dl < LAKE.r + 2) h = -0.6;
    return h;
  },

  decorate(ctx) {
    const { THREE, root, track, pointAt, idxAt, terrainHeight, distToTrack, canvasTex, rand, fbm, BARRIER, N, onUpdate } = ctx;
    const center = track.center;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s3 = new THREE.Vector3(), p3 = new THREE.Vector3(), col = new THREE.Color();

    // merge non-indexed geometries, each with a flat vertex colour
    const merge = (parts) => {
      const pos = [], nor = [], clr = [];
      for (const [g0, c] of parts) {
        const g = g0.index ? g0.toNonIndexed() : g0;
        g.computeVertexNormals();
        const cc = new THREE.Color(c);
        pos.push(...g.attributes.position.array);
        nor.push(...g.attributes.normal.array);
        for (let i = 0; i < g.attributes.position.count; i++) clr.push(cc.r, cc.g, cc.b);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(clr, 3));
      return g;
    };
    const instanced = (geo, mat, list, shadow = true) => {
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((o, i) => {
        q.setFromEuler(e.set(o.rx || 0, o.ry || 0, o.rz || 0));
        im.setMatrixAt(i, m4.compose(p3.set(o.x, o.y, o.z), q, o.s.isVector3 ? o.s : s3.setScalar(o.s)));
        if (o.c !== undefined) im.setColorAt(i, col.set(o.c));
      });
      im.castShadow = shadow; im.receiveShadow = true;
      root.add(im);
      return im;
    };
    const lodgeP = pointAt(idxAt(LODGE_FRAC), LODGE_LAT);
    const nearLodge = (x, z, r) => Math.hypot(x - lodgeP.x, z - lodgeP.z) < r;
    const nearLake = (x, z, r) => Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r + r;
    const GA = lodgeP.clone().add(new THREE.Vector3(-27, 0, -10)), GDIR = new THREE.Vector3(0.25, 0, 1).normalize();
    const nearLift = (x, z, r) => { const dx = x - GA.x, dz = z - GA.z, a = dx * GDIR.x + dz * GDIR.z; return a > -12 && a < 520 && Math.abs(dx * GDIR.z - dz * GDIR.x) < r; };

    // ---------------------------------------------------------------- snowy pines (one merged geometry)
    {
      const tiers = [];
      tiers.push([new THREE.CylinderGeometry(0.3, 0.45, 2.2, 6).translate(0, 1.1, 0), 0x5b3a26]);
      const T = [[3.0, 3.6, 2.2], [2.4, 3.2, 4.3], [1.7, 2.8, 6.2], [1.0, 2.2, 7.9]];
      for (const [r, h, y] of T) {
        tiers.push([new THREE.ConeGeometry(r, h, 8).translate(0, y + h / 2, 0), 0x1f5a3f]);
        tiers.push([new THREE.ConeGeometry(r * 0.72, h * 0.5, 8).translate(0, y + h * 0.78, 0), 0xf6faff]);
      }
      const pineGeo = merge(tiers);
      const pines = [];
      const bx = [track.bounds.minX - 330, track.bounds.maxX + 330], bz = [track.bounds.minZ - 300, track.bounds.maxZ + 300];
      for (let t = 0; t < 14000 && pines.length < 1500; t++) {
        const x = rand(...bx), z = rand(...bz);
        const forest = fbm(x * 0.012 + 3, z * 0.012 - 5);
        if (forest < 0.38 && Math.random() > 0.1) continue;
        const d = distToTrack(x, z, 8);
        if (d < BARRIER + 7 || nearLake(x, z, 8) || nearLodge(x, z, 30) || nearLift(x, z, 9)) continue;
        const y = terrainHeight(x, z, d);
        if (y > 160) continue;
        const k = rand(0.8, 1.6) * (d > 60 ? 1.25 : 1);
        pines.push({ x, y: y - 0.3, z, s: new THREE.Vector3(k, k * rand(0.9, 1.25), k), ry: rand(0, 6), c: new THREE.Color().setHSL(0.58, 0.15, rand(0.8, 1)) });
      }
      instanced(pineGeo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), pines);
    }

    // ---------------------------------------------------------------- distant towering peaks (unfogged, aerial-tinted)
    {
      const peaks = new THREE.Group();
      const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, fog: false });
      const rockC = new THREE.Color(0x5a6f94), snowC = new THREE.Color(0xf7fbff), hazeC = new THREE.Color(0xc9dcf2);
      const count = 15;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + rand(-0.12, 0.12);
        const dist = rand(950, 1250), H = rand(520, 820), R = H * rand(0.6, 0.85);
        const g = new THREE.ConeGeometry(R, H, 11, 7).toNonIndexed();
        const pos = g.attributes.position, clr = [];
        const seed = rand(0, 100);
        // jitter (vertices are duplicated; displace by a function of position so faces stay closed)
        for (let v = 0; v < pos.count; v++) {
          const x = pos.getX(v), y = pos.getY(v), z = pos.getZ(v);
          const t = (y + H / 2) / H;
          const n = fbm(x * 0.01 + seed, z * 0.01 + y * 0.004);
          const k = t < 0.99 ? 1 + (n - 0.5) * 0.4 : 1;
          pos.setXYZ(v, x * k, y + (t > 0.02 && t < 0.99 ? (n - 0.5) * H * 0.06 : 0), z * k);
        }
        g.computeVertexNormals();
        for (let v = 0; v < pos.count; v += 3) {
          const cy = (pos.getY(v) + pos.getY(v + 1) + pos.getY(v + 2)) / 3, t = (cy + H / 2) / H;
          const nx = (pos.getX(v) + pos.getX(v + 1) + pos.getX(v + 2)) / 3;
          const snowLine = 0.42 + (fbm(nx * 0.02 + seed, cy * 0.02) - 0.5) * 0.35;
          const c = t > snowLine ? snowC.clone() : rockC.clone().lerp(snowC, t * 0.4);
          c.lerp(hazeC, 0.2);
          for (let j = 0; j < 3; j++) clr.push(c.r, c.g, c.b);
        }
        g.setAttribute('color', new THREE.Float32BufferAttribute(clr, 3));
        const m = new THREE.Mesh(g, mat);
        m.position.set(center.x + Math.cos(a) * dist, H / 2 - 40, center.z + Math.sin(a) * dist);
        m.rotation.y = rand(0, 6);
        peaks.add(m);
      }
      root.add(peaks);
    }

    // ---------------------------------------------------------------- frozen lake + ice crystals
    {
      const iceTex = canvasTex(512, 512, (g, w, h) => {
        const gr = g.createRadialGradient(w / 2, h / 2, 20, w / 2, h / 2, w / 2);
        gr.addColorStop(0, '#9fdcf7'); gr.addColorStop(0.75, '#bfe8fb'); gr.addColorStop(1, '#eef9ff');
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
        g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1.5;
        for (let i = 0; i < 40; i++) {
          let x = rand(60, w - 60), y = rand(60, h - 60);
          g.beginPath(); g.moveTo(x, y);
          for (let j = 0; j < 5; j++) { x += rand(-40, 40); y += rand(-40, 40); g.lineTo(x, y); }
          g.stroke();
        }
        g.fillStyle = 'rgba(255,255,255,.25)';
        for (let i = 0; i < 12; i++) { g.beginPath(); g.ellipse(rand(80, w - 80), rand(80, h - 80), rand(20, 60), rand(6, 14), rand(0, 3), 0, 7); g.fill(); }
      }, false);
      const lake = new THREE.Mesh(new THREE.CircleGeometry(LAKE.r + 1.5, 64),
        new THREE.MeshStandardMaterial({ map: iceTex, roughness: 0.08, metalness: 0.25, envMapIntensity: 1.4 }));
      lake.rotation.x = -Math.PI / 2;
      lake.position.set(LAKE.x, 0.05, LAKE.z);
      lake.receiveShadow = true;
      root.add(lake);
      // skating snowman & tiny ice-fishing hut on the lake
      const hut = new THREE.Group();
      const hutBody = new THREE.Mesh(new THREE.BoxGeometry(4, 3.2, 4), new THREE.MeshStandardMaterial({ color: 0xd8342f, roughness: 0.7 }));
      hutBody.position.y = 1.6;
      const hutRoof = new THREE.Mesh(new THREE.ConeGeometry(3.4, 2, 4), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }));
      hutRoof.position.y = 4.2; hutRoof.rotation.y = Math.PI / 4;
      hut.add(hutBody, hutRoof);
      hut.position.set(LAKE.x + 12, 0, LAKE.z - 8);
      hut.traverse((o) => { o.castShadow = true; });
      root.add(hut);

      const crystals = [];
      const addCluster = (cx, cz, k) => {
        const y = terrainHeight(cx, cz);
        for (let j = 0; j < 5; j++) {
          const h = rand(3, 7) * k;
          crystals.push({ x: cx + rand(-2, 2) * k, y: y + h * 0.35, z: cz + rand(-2, 2) * k, s: new THREE.Vector3(h * 0.28, h, h * 0.28), rx: rand(-0.45, 0.45), rz: rand(-0.45, 0.45), ry: rand(0, 3) });
        }
      };
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + rand(-0.2, 0.2), r = LAKE.r + rand(5, 14);
        addCluster(LAKE.x + Math.cos(a) * r, LAKE.z + Math.sin(a) * r, rand(0.8, 1.6));
      }
      for (const [f, side, d, k] of [[0.14, 1, 9, 1.4], [0.33, -1, 8, 1.2], [0.52, 1, 10, 1.6], [0.62, -1, 9, 1.3], [0.81, 1, 10, 1.5], [0.9, -1, 8, 1.1]]) {
        const v = pointAt(idxAt(f), side * (BARRIER + d));
        addCluster(v.x, v.z, k);
      }
      instanced(new THREE.OctahedronGeometry(1, 0), new THREE.MeshStandardMaterial({
        color: 0x9fe3ff, emissive: 0x2a9fe0, emissiveIntensity: 0.35, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.82, flatShading: true,
      }), crystals);
    }

    // ---------------------------------------------------------------- alpine lodge + chalets
    const logTex = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#8a5530'; g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 32) {
        const gr = g.createLinearGradient(0, y, 0, y + 32);
        gr.addColorStop(0, '#a86c3e'); gr.addColorStop(0.5, '#8d5731'); gr.addColorStop(1, '#5e3519');
        g.fillStyle = gr; g.fillRect(0, y, w, 30);
      }
    });
    const logMat = new THREE.MeshStandardMaterial({ map: logTex, roughness: 0.85 });
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x8e96a3, roughness: 0.95 });
    const snowMat = new THREE.MeshStandardMaterial({ color: 0xfbfdff, roughness: 0.9 });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0xb3262e, roughness: 0.6 });
    const glowMat = new THREE.MeshStandardMaterial({ color: 0xffd98a, emissive: 0xffb347, emissiveIntensity: 1.2 });
    const smokeSpots = [];
    function chalet(pos, yaw, W, D, Hh, sign) {
      const g = new THREE.Group();
      g.position.copy(pos); g.rotation.y = yaw;
      const box = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
      box(new THREE.BoxGeometry(W + 1, 1.4, D + 1), stoneMat, 0, 0.5, 0);
      box(new THREE.BoxGeometry(W, Hh, D), logMat, 0, 1.2 + Hh / 2, 0);
      // steep A-frame roof along local z, snow on top, red fascia beneath
      const rh = W * 0.55, slope = Math.atan2(rh, W / 2), L = Math.hypot(rh, W / 2) + 1.2;
      for (const sx of [-1, 1]) {
        const red = box(new THREE.BoxGeometry(L, 0.35, D + 2.4), trimMat, sx * W / 4, 1.2 + Hh + rh / 2 - 0.2, 0);
        red.rotation.z = -sx * slope;
        const sn = box(new THREE.BoxGeometry(L, 0.55, D + 2.2), snowMat, sx * (W / 4 - 0.15), 1.2 + Hh + rh / 2 + 0.25, 0);
        sn.rotation.z = -sx * slope;
      }
      // gable ends
      const gable = new THREE.Shape([new THREE.Vector2(-W / 2, 0), new THREE.Vector2(W / 2, 0), new THREE.Vector2(0, rh)]);
      for (const sz of [-1, 1]) {
        const gm = new THREE.Mesh(new THREE.ShapeGeometry(gable), logMat);
        gm.position.set(0, 1.2 + Hh, sz * D / 2);
        if (sz < 0) gm.rotation.y = Math.PI;
        g.add(gm);
        const win = box(new THREE.CircleGeometry(W * 0.09, 12), glowMat, 0, 1.2 + Hh + rh * 0.35, sz * (D / 2 + 0.03));
        if (sz < 0) win.rotation.y = Math.PI;
      }
      // windows on the long sides
      for (const sx of [-1, 1]) for (let wz = -D / 2 + 2.5; wz <= D / 2 - 2.4; wz += 3.6) {
        const win = box(new THREE.PlaneGeometry(1.6, 1.8), glowMat, sx * (W / 2 + 0.03), 1.2 + Hh * 0.55, wz);
        win.rotation.y = sx * Math.PI / 2;
        for (const dy of [-1.15, 1.15]) { const sh = box(new THREE.BoxGeometry(0.15, 0.2, 2.1), trimMat, sx * (W / 2 + 0.1), 1.2 + Hh * 0.55 + dy * 0.9, wz); sh.scale.y = 1; }
      }
      // chimney
      const cy = 1.2 + Hh + rh * 0.8;
      box(new THREE.BoxGeometry(1.4, rh + 1, 1.4), stoneMat, W * 0.2, cy - 0.2, -D * 0.25);
      box(new THREE.BoxGeometry(1.7, 0.5, 1.7), snowMat, W * 0.2, cy + rh / 2 + 0.4, -D * 0.25);
      g.updateMatrixWorld(true);
      smokeSpots.push(new THREE.Vector3(W * 0.2, cy + rh / 2 + 0.8, -D * 0.25).applyMatrix4(g.matrixWorld));
      if (sign) {
        const tex = canvasTex(512, 128, (c, w, h) => {
          c.fillStyle = '#5e3519'; c.fillRect(0, 0, w, h);
          c.strokeStyle = '#f6e7c8'; c.lineWidth = 8; c.strokeRect(8, 8, w - 16, h - 16);
          c.fillStyle = '#fff6e0'; c.font = 'bold 60px Georgia, serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
          c.fillText(sign, w / 2, h / 2 + 4);
        }, false);
        const sg = box(new THREE.PlaneGeometry(W * 0.7, W * 0.175), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }), W / 2 + 0.25, 1.2 + Hh + 0.2, 0);
        sg.rotation.y = Math.PI / 2;
        sg.position.y = 1.2 + Hh - 0.9;
      }
      root.add(g);
      return g;
    }
    {
      const i = idxAt(LODGE_FRAC);
      // local +x is the track's left, so rotate so the long side (with sign, +x face) faces the road
      const lp = lodgeP.clone(); lp.y = terrainHeight(lp.x, lp.z);
      chalet(lp, track.ang[i] + Math.PI, 16, 26, 7, '❄ PEAKS LODGE ❄');
      // smaller chalets
      for (const [f, side, d, yawOff, w] of [[0.22, 1, 26, 0.3, 10], [0.27, 1, 42, -0.4, 9], [0.58, -1, 30, 0.2, 10], [0.75, 1, 34, 1.2, 9]]) {
        const j = idxAt(f), v = pointAt(j, side * (BARRIER + d));
        v.y = terrainHeight(v.x, v.z) - 0.3;
        chalet(v, track.ang[j] + (side > 0 ? 0 : Math.PI) + yawOff, w, w * 1.3, 4.5, null);
      }
    }
    // chimney smoke: a few soft sprites per chimney, recycled
    {
      const smokeTex = canvasTex(64, 64, (g) => {
        const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
        r.addColorStop(0, 'rgba(255,255,255,.9)'); r.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = r; g.fillRect(0, 0, 64, 64);
      }, false);
      const puffs = [];
      for (const sp of smokeSpots) for (let k = 0; k < 6; k++) {
        const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, color: 0xeef2f7, transparent: true, depthWrite: false }));
        root.add(spr);
        puffs.push({ spr, base: sp, t: k / 6 });
      }
      onUpdate((dt) => {
        for (const p of puffs) {
          p.t = (p.t + dt * 0.18) % 1;
          p.spr.position.set(p.base.x + p.t * 6, p.base.y + p.t * 12, p.base.z + Math.sin(p.t * 6) * 1.2);
          const s = 1.5 + p.t * 5;
          p.spr.scale.set(s, s, 1);
          p.spr.material.opacity = 0.75 * (1 - p.t);
        }
      });
    }

    // ---------------------------------------------------------------- snowmen
    {
      const spots = [[0.05, 1, 8], [0.12, -1, 7], [0.3, 1, 6], [0.4, -1, 7], [0.49, 1, 7], [0.66, 1, 8], [0.85, -1, 6], [0.93, 1, 9]]
        .map(([f, side, d]) => {
          const j = idxAt(f), v = pointAt(j, side * (BARRIER + d));
          v.y = terrainHeight(v.x, v.z);
          return { v, yaw: track.ang[j] + side * Math.PI / 2 + Math.PI, k: rand(1.1, 1.5) };
        });
      // lake-side snowmen
      for (const a of [0.6, 2.4]) {
        const v = new THREE.Vector3(LAKE.x + Math.cos(a) * (LAKE.r - 6), 0, LAKE.z + Math.sin(a) * (LAKE.r - 6));
        spots.push({ v, yaw: rand(0, 6), k: 1.2 });
      }
      const parts = [
        [new THREE.SphereGeometry(1.25, 14, 10).translate(0, 1.1, 0), 0xffffff],
        [new THREE.SphereGeometry(0.9, 14, 10).translate(0, 2.65, 0), 0xffffff],
        [new THREE.SphereGeometry(0.65, 14, 10).translate(0, 3.8, 0), 0xffffff],
        [new THREE.ConeGeometry(0.12, 0.7, 8).rotateX(Math.PI / 2).translate(0, 3.8, 0.9), 0xff7a1a],
        [new THREE.SphereGeometry(0.08, 6, 4).translate(-0.22, 4.0, 0.57), 0x111111],
        [new THREE.SphereGeometry(0.08, 6, 4).translate(0.22, 4.0, 0.57), 0x111111],
        [new THREE.SphereGeometry(0.1, 6, 4).translate(0, 2.8, 0.88), 0x111111],
        [new THREE.SphereGeometry(0.1, 6, 4).translate(0, 2.4, 0.9), 0x111111],
        [new THREE.TorusGeometry(0.68, 0.17, 6, 16).rotateX(Math.PI / 2).translate(0, 3.25, 0), 0xe02638],
        [new THREE.BoxGeometry(0.3, 1.0, 0.12).translate(0.45, 2.8, 0.72), 0xe02638],
        [new THREE.CylinderGeometry(0.62, 0.62, 0.08, 14).translate(0, 4.32, 0), 0x1b1d24],
        [new THREE.CylinderGeometry(0.42, 0.42, 0.75, 14).translate(0, 4.7, 0), 0x1b1d24],
        [new THREE.CylinderGeometry(0.43, 0.43, 0.14, 14).translate(0, 4.42, 0), 0x1565c0],
        [new THREE.CylinderGeometry(0.05, 0.05, 1.6, 5).rotateZ(1.0).translate(-1.3, 2.9, 0), 0x5b3a26],
        [new THREE.CylinderGeometry(0.05, 0.05, 1.6, 5).rotateZ(-1.1).translate(1.3, 3.0, 0), 0x5b3a26],
      ];
      const geo = merge(parts);
      instanced(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }),
        spots.map(({ v, yaw, k }) => ({ x: v.x, y: v.y - 0.2, z: v.z, ry: yaw, s: k })));
    }

    // ---------------------------------------------------------------- candy-cane poles on the outside of the tight corners
    {
      const caneTex = canvasTex(64, 256, (g, w, h) => {
        g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
        g.fillStyle = '#e02638';
        for (let y = -h; y < h * 2; y += 48) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + 40); g.lineTo(w, y + 64); g.lineTo(0, y + 24); g.fill(); }
      });
      caneTex.repeat.set(1, 2);
      const caneGeo = (() => {
        const pole = new THREE.CylinderGeometry(0.2, 0.2, 4.2, 10).translate(0, 2.1, 0);
        const hook = new THREE.TorusGeometry(0.55, 0.2, 8, 12, Math.PI).translate(0.55, 4.2, 0);
        const merged = merge([[pole, 0xffffff], [hook, 0xffffff]]);
        // uvs: wrap by angle/height so the stripes spiral
        const pos = merged.attributes.position, uv = [];
        for (let v = 0; v < pos.count; v++) uv.push(Math.atan2(pos.getZ(v), pos.getX(v)) / 6.283 + 0.5, (pos.getY(v) + pos.getX(v)) / 4.2);
        merged.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        return merged;
      })();
      const canes = [];
      const k = 10;
      let last = -999;
      for (let i = 0; i < N; i++) {
        const t0 = track.t[(i - k + N) % N], t1 = track.t[(i + k) % N];
        const turn = t0.x * t1.z - t0.z * t1.x;       // >0 : turning towards +r (right)
        const da = Math.acos(Math.min(1, t0.dot(t1)));
        const radius = (2 * k * track.ds) / Math.max(da, 1e-6);
        if (radius > 55 || track.d[i] - last < 9) continue;
        last = track.d[i];
        const side = turn > 0 ? 1 : -1;
        const outSide = -side;
        const v = pointAt(i, outSide * (BARRIER + 1.4));
        if (distToTrack(v.x, v.z, 4) < BARRIER + 0.8) continue;
        canes.push({ x: v.x, y: 0, z: v.z, ry: track.ang[i] + (outSide > 0 ? 0 : Math.PI), s: 1 });
      }
      if (canes.length) instanced(caneGeo, new THREE.MeshStandardMaterial({ map: caneTex, roughness: 0.35 }), canes);
    }

    // ---------------------------------------------------------------- gondola lift: lodge -> summit, crossing over the start straight
    {
      const A = GA, dir = GDIR, side = new THREE.Vector3(dir.z, 0, -dir.x);
      const LEN = 500;
      const tops = [new THREE.Vector3(A.x, terrainHeight(A.x, A.z) + 10, A.z)];
      const steelMat = new THREE.MeshStandardMaterial({ color: 0x3b4252, metalness: 0.6, roughness: 0.4 });
      const towerGeo = new THREE.CylinderGeometry(0.5, 0.9, 1, 6).translate(0, 0.5, 0);
      const armGeo = new THREE.BoxGeometry(6, 0.5, 0.5);
      const addTower = (x, z, y0, h) => {
        const t = new THREE.Mesh(towerGeo, steelMat); t.position.set(x, y0 - 1, z); t.scale.y = h + 1; t.castShadow = true; root.add(t);
        const arm = new THREE.Mesh(armGeo, steelMat); arm.position.set(x, y0 + h, z); arm.rotation.y = Math.atan2(side.x, side.z) - Math.PI / 2; root.add(arm);
      };
      for (let sAlong = 80; sAlong < LEN - 20; sAlong += 85) {
        let x = A.x + dir.x * sAlong, z = A.z + dir.z * sAlong;
        if (distToTrack(x, z, 4) < BARRIER + 8) continue;
        const y0 = terrainHeight(x, z);
        addTower(x, z, y0, 18);
        tops.push(new THREE.Vector3(x, y0 + 18, z));
      }
      const B = A.clone().addScaledVector(dir, LEN);
      tops.push(new THREE.Vector3(B.x, terrainHeight(B.x, B.z) + 9, B.z));
      // stations
      const station = (p, yaw) => {
        const g = new THREE.Group(); g.position.set(p.x, p.y - 10, p.z); g.rotation.y = yaw;
        const base = new THREE.Mesh(new THREE.BoxGeometry(10, 7, 10), logMat); base.position.y = 3.5; base.castShadow = true;
        const roof = new THREE.Mesh(new THREE.BoxGeometry(12, 1, 13), snowMat); roof.position.y = 11.5;
        const red = new THREE.Mesh(new THREE.BoxGeometry(12.2, 0.6, 13.2), trimMat); red.position.y = 10.8;
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.6, 4, 0.6), steelMat); post.position.set(sx * 5.4, 9, sz * 6); g.add(post); }
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 0.6, 16), steelMat); wheel.position.y = 10;
        g.add(base, roof, red, wheel);
        root.add(g);
      };
      const yaw = Math.atan2(dir.x, dir.z);
      station(tops[0], yaw);
      station(tops[tops.length - 1], yaw);
      // cables (thin cylinders between tower tops, one per direction)
      const cableMat = new THREE.MeshBasicMaterial({ color: 0x2a2f3a });
      const unit = new THREE.CylinderGeometry(0.07, 0.07, 1, 4).translate(0, 0.5, 0).rotateX(Math.PI / 2);
      const up = [], down = [];
      for (const p of tops) { up.push(p.clone().addScaledVector(side, 2.6)); down.push(p.clone().addScaledVector(side, -2.6)); }
      for (const line of [up, down]) for (let k = 0; k < line.length - 1; k++) {
        const a = line[k], b = line[k + 1], c = new THREE.Mesh(unit, cableMat);
        c.position.copy(a); c.lookAt(b); c.scale.z = a.distanceTo(b);
        root.add(c);
      }
      const path = [...up, ...down.slice().reverse()];
      const segLen = path.map((p, k) => (k < path.length - 1 ? p.distanceTo(path[k + 1]) : p.distanceTo(path[0])));
      const total = segLen.reduce((a, b) => a + b, 0);
      const at = (u, out) => {
        u = ((u % total) + total) % total;
        for (let k = 0; k < path.length; k++) {
          if (u <= segLen[k]) return out.copy(path[k]).lerp(path[(k + 1) % path.length], u / segLen[k]);
          u -= segLen[k];
        }
        return out.copy(path[0]);
      };
      const cabBody = new THREE.BoxGeometry(2.6, 2.4, 2.8);
      const cabRoof = new THREE.BoxGeometry(2.9, 0.4, 3.1);
      const cabWin = new THREE.BoxGeometry(2.66, 0.9, 2.2);
      const hanger = new THREE.CylinderGeometry(0.08, 0.08, 2.4, 4);
      const winMat = new THREE.MeshStandardMaterial({ color: 0x9fd8ff, roughness: 0.1, metalness: 0.3 });
      const cabs = [];
      const nCab = 14;
      for (let k = 0; k < nCab; k++) {
        const g = new THREE.Group();
        const bm = new THREE.MeshStandardMaterial({ color: [0xe02638, 0x1565c0, 0xfacc15][k % 3], roughness: 0.4 });
        const body = new THREE.Mesh(cabBody, bm); body.position.y = -3.6; body.castShadow = true;
        const roof = new THREE.Mesh(cabRoof, snowMat); roof.position.y = -2.3;
        const win = new THREE.Mesh(cabWin, winMat); win.position.y = -3.2;
        const h = new THREE.Mesh(hanger, steelMat); h.position.y = -1.2;
        g.add(body, roof, win, h);
        g.rotation.y = yaw;
        root.add(g);
        cabs.push({ g, u: (k / nCab) * total });
      }
      onUpdate((dt) => { for (const c of cabs) { c.u += dt * 5; at(c.u, c.g.position); } });
      for (const c of cabs) at(c.u, c.g.position);
    }

    // ---------------------------------------------------------------- penguins waddling by the lake
    {
      const parts = [
        [new THREE.SphereGeometry(0.6, 12, 10).scale(1, 1.45, 0.9).translate(0, 0.9, 0), 0x1d2230],
        [new THREE.SphereGeometry(0.5, 12, 10).scale(0.95, 1.3, 0.6).translate(0, 0.85, 0.28), 0xffffff],
        [new THREE.ConeGeometry(0.12, 0.35, 6).rotateX(Math.PI / 2).translate(0, 1.55, 0.62), 0xff9a1a],
        [new THREE.SphereGeometry(0.07, 6, 4).translate(-0.18, 1.72, 0.44), 0xffffff],
        [new THREE.SphereGeometry(0.07, 6, 4).translate(0.18, 1.72, 0.44), 0xffffff],
        [new THREE.BoxGeometry(0.3, 0.08, 0.4).translate(-0.2, 0.04, 0.15), 0xff9a1a],
        [new THREE.BoxGeometry(0.3, 0.08, 0.4).translate(0.2, 0.04, 0.15), 0xff9a1a],
        [new THREE.BoxGeometry(0.12, 0.8, 0.35).rotateZ(0.3).translate(-0.62, 0.95, 0), 0x1d2230],
        [new THREE.BoxGeometry(0.12, 0.8, 0.35).rotateZ(-0.3).translate(0.62, 0.95, 0), 0x1d2230],
        [new THREE.TorusGeometry(0.42, 0.1, 6, 12).rotateX(Math.PI / 2).translate(0, 1.3, 0), 0x1565c0],
      ];
      const geo = merge(parts);
      const list = [];
      for (let k = 0; k < 16; k++) {
        const a = rand(0, 6.283), r = k < 10 ? rand(LAKE.r - 8, LAKE.r + 4) : rand(6, 20);
        const x = LAKE.x + Math.cos(a) * r, z = LAKE.z + Math.sin(a) * r;
        list.push({ x, y: Math.max(0.05, terrainHeight(x, z)), z, ry: rand(0, 6.283), s: rand(1.1, 1.6) });
      }
      for (const [f, sd, d] of [[0.1, -1, 5], [0.11, -1, 7], [0.47, 1, 5], [0.7, -1, 5], [0.71, -1, 6.5]]) {
        const j = idxAt(f), v = pointAt(j, sd * (BARRIER + d));
        list.push({ x: v.x, y: terrainHeight(v.x, v.z), z: v.z, ry: track.ang[j] + sd * Math.PI / 2 + Math.PI, s: 1.4 });
      }
      const pg = instanced(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }), list);
      const base = list.map((o) => o.ry);
      onUpdate((dt, t) => {
        list.forEach((o, i) => {
          q.setFromEuler(e.set(0, base[i], Math.sin(t * 5 + i) * 0.12));
          pg.setMatrixAt(i, m4.compose(p3.set(o.x, o.y, o.z), q, s3.setScalar(o.s)));
        });
        pg.instanceMatrix.needsUpdate = true;
      });
    }

    // ---------------------------------------------------------------- faceted ice arches spanning the road
    {
      const iceMat = new THREE.MeshStandardMaterial({ color: 0xaee9ff, emissive: 0x3aa8e8, emissiveIntensity: 0.3, roughness: 0.08, metalness: 0.15,
        transparent: true, opacity: 0.85, flatShading: true });
      const R = BARRIER + 1.6;
      const archGeo = new THREE.TorusGeometry(R, 1.3, 5, 18, Math.PI);
      const footGeo = new THREE.CylinderGeometry(2.2, 2.8, 2.2, 6);
      const icicle = new THREE.ConeGeometry(0.35, 2.2, 5).rotateX(Math.PI);
      for (const f of [0.345, 0.575, 0.905]) {
        const i = idxAt(f), g = new THREE.Group();
        g.position.copy(track.p[i]); g.rotation.y = track.ang[i];
        const a = new THREE.Mesh(archGeo, iceMat); a.castShadow = true; g.add(a);
        for (const sx of [-1, 1]) { const ft = new THREE.Mesh(footGeo, iceMat); ft.position.set(sx * R, 1.1, 0); g.add(ft); }
        for (let k = 1; k < 12; k++) {
          const th = (k / 12) * Math.PI;
          if (Math.sin(th) < 0.55) continue;
          const ic = new THREE.Mesh(icicle, iceMat);
          ic.position.set(Math.cos(th) * (R - 1.1), Math.sin(th) * (R - 1.1) - 1, 0);
          ic.scale.y = 0.6 + ((k * 7) % 5) * 0.2;
          g.add(ic);
        }
        root.add(g);
      }
    }

    // ---------------------------------------------------------------- plowed snow banks behind the walls + snow-dusted rocks
    {
      const banks = [];
      for (let i = 0; i < N; i += 5) for (const side of [-1, 1]) {
        const lat = side * (BARRIER + rand(1.6, 3.2));
        const v = pointAt(i, lat);
        if (distToTrack(v.x, v.z, 4) < BARRIER + 1.2 || nearLodge(v.x, v.z, 14)) continue;
        const k = rand(1.4, 2.4);
        banks.push({ x: v.x, y: terrainHeight(v.x, v.z) - 0.25, z: v.z, s: new THREE.Vector3(k * 1.3, k * rand(0.35, 0.55), k), ry: track.ang[i] + rand(-0.4, 0.4), c: new THREE.Color().setHSL(0.58, 0.4, rand(0.9, 0.98)) });
      }
      instanced(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshLambertMaterial({ flatShading: true }), banks, false);

      const rocks = [], caps = [];
      for (let t = 0; t < 3000 && rocks.length < 90; t++) {
        const x = rand(track.bounds.minX - 120, track.bounds.maxX + 120), z = rand(track.bounds.minZ - 120, track.bounds.maxZ + 120);
        const d = distToTrack(x, z, 8);
        if (d < BARRIER + 6 || nearLake(x, z, 2) || nearLodge(x, z, 22)) continue;
        const y = terrainHeight(x, z, d), k = rand(1.2, 3.2), ry = rand(0, 6);
        rocks.push({ x, y: y + 0.2 * k, z, s: new THREE.Vector3(k * 1.3, k * 0.9, k), ry });
        caps.push({ x, y: y + 0.75 * k, z, s: new THREE.Vector3(k * 1.15, k * 0.35, k * 0.9), ry });
      }
      instanced(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: 0x7f8a9b, flatShading: true }), rocks);
      instanced(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: 0xfbfdff, flatShading: true }), caps, false);
    }

    // ---------------------------------------------------------------- falling snow (one Points, wrapped around whichever camera renders it)
    {
      const COUNT = 5000, BOX = 140;
      const pos = new Float32Array(COUNT * 3), seed = new Float32Array(COUNT);
      for (let i = 0; i < COUNT; i++) { pos[i * 3] = Math.random() * BOX; pos[i * 3 + 1] = Math.random() * BOX * 0.5; pos[i * 3 + 2] = Math.random() * BOX; seed[i] = Math.random(); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
      const uniforms = { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uScale: { value: 400 } };
      const mat = new THREE.ShaderMaterial({
        uniforms, transparent: true, depthWrite: false, fog: false,
        vertexShader: `uniform float uTime; uniform vec3 uCam; uniform float uScale; attribute float seed; varying float vA;
          void main(){
            vec3 box = vec3(${BOX}.0, ${BOX * 0.5}.0, ${BOX}.0);
            vec3 p = position + vec3(sin(uTime*0.7 + seed*20.0)*2.0 + uTime*1.5, -uTime*(3.0 + seed*2.5), cos(uTime*0.5 + seed*13.0)*2.0);
            p = mod(p - uCam + box*0.5, box) - box*0.5 + uCam;
            vec4 mv = viewMatrix * vec4(p, 1.0);
            gl_Position = projectionMatrix * mv;
            float d = -mv.z;
            gl_PointSize = clamp((0.12 + seed*0.1) * uScale / max(d, 0.1), 1.0, 10.0);
            vA = smoothstep(${BOX * 0.5}.0, 20.0, d) * smoothstep(0.5, 3.0, d);
          }`,
        fragmentShader: `varying float vA; void main(){ vec2 c = gl_PointCoord - 0.5; float r = dot(c,c); if (r > 0.25) discard; gl_FragColor = vec4(1.0, 1.0, 1.0, vA * (1.0 - r*3.2)); }`,
      });
      const v2 = new THREE.Vector2();
      const snow = new THREE.Points(g, mat);
      snow.frustumCulled = false;
      snow.renderOrder = 10;
      snow.onBeforeRender = (renderer, scene, camera) => {
        uniforms.uCam.value.setFromMatrixPosition(camera.matrixWorld);
        uniforms.uScale.value = renderer.getDrawingBufferSize(v2).y * 0.5;
        mat.uniformsNeedUpdate = true;
      };
      root.add(snow);
      onUpdate((dt, t) => { uniforms.uTime.value = t; });
    }
  },
};
