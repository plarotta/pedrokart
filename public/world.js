// Everything static (or decorative) in the level: sky, terrain, road, walls, scenery.
import * as THREE from 'three';
import { HALF_W, CURB_W, BARRIER, ROAD_W, rand } from './config.js';
import { track, N, distToTrack, pointAt, idxAt } from './track.js';

// Look of the default circuit. A map's `theme` overrides any subset of this (deep-merged).
export const DEFAULT_THEME = {
  sky: { top: 0x2f7cf0, horizon: 0xcdeeff, bottom: 0x9fd4f2 },
  fog: { color: 0xcdeeff, near: 260, far: 1300 },
  sun: { dir: [0.45, 0.62, 0.64], color: 0xfff1d6, intensity: 2.6, glow: 0xfff6dc },
  hemi: { sky: 0xdff1ff, ground: 0x4f7f3a, intensity: 1.1 },
  envIntensity: 0.8,
  exposure: 1.0,
  clouds: { count: 26, color: 0xffffff, emissive: 0x9aa6b8 },
  terrain: {
    low: 0x5cb83c, lowAlt: 0x3f9a2c, rock: 0x8a8472, peak: 0xf4f6fa,
    hills: 50, rim: 190, rockAt: 45, peakAt: 120,
    detail: ['#dfe8d8', '#c9d6c0', '#eef5e8', '#d2e0c8', '#f8fff2'],
  },
  road: { base: '#50535b', speckle: ['#45484f', '#5c5f68', '#4b4e56', '#676a73', '#3f4248'], lines: '#f4f4f0', centerLine: true },
  curb: ['#e8262b', '#fafafa'],
  shoulder: { base: '#d9b77a', speckle: ['#cfa968', '#e3c48c', '#c49c5c', '#ebd09c'] },
  walls: {
    height: 1.2, rail: 0xdfe3ea,
    panels: [['#1d4ed8', '#ffffff', 'PEDRO'], ['#facc15', '#b91c1c', 'KART'], ['#dc2626', '#ffffff', 'TURBO'], ['#16a34a', '#ffffff', '★ GP ★']],
  },
  vegetation: {
    round: 520, pine: 380, bush: 400, rock: 160, flower: 700, maxAltitude: 70,
    roundHue: [0.24, 0.33], pineHue: [0.3, 0.38], bushHue: [0.25, 0.34], leafLight: [0.33, 0.45],
    trunk: 0x7b5233, rockColor: 0x9a968c, flowers: [0xff4d6d, 0xffd60a, 0xffffff, 0xc77dff, 0xff8fab],
  },
  props: { grandstands: true, bunting: true, mushrooms: true, pipes: true, balloons: true },
  // Self-illumination for night maps: 0 = lit only by the scene. Road glow is tinted by glow.roadColor.
  glow: { road: 0, roadColor: 0xffffff, curb: 0, walls: 0, banner: 0 },
  roadFinish: { roughness: 0.82, metalness: 0 },
};
// Emissive settings that make a textured material glow with its own texture.
const glowing = (map, intensity, color = 0xffffff) => (intensity > 0 ? { emissiveMap: map, emissive: color, emissiveIntensity: intensity } : {});
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
function merge(base, over) {
  const out = { ...base };
  for (const [k, v] of Object.entries(over || {})) out[k] = isObj(v) && isObj(base[k]) ? merge(base[k], v) : v;
  return out;
}

let ANISO = 8;

export function canvasTex(w, h, draw, repeat = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = ANISO;
  return t;
}
const speckle = (g, w, h, n, colors, size = 2) => {
  for (let i = 0; i < n; i++) { g.fillStyle = colors[i % colors.length]; g.fillRect(Math.random() * w, Math.random() * h, size, size); }
};

// ---------------------------------------------------------------- noise / terrain
const hash = (x, z) => { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); };
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x, z) => { let s = 0, amp = 1, f = 1, tot = 0; for (let o = 0; o < 4; o++) { s += vnoise(x * f, z * f) * amp; tot += amp; amp *= 0.5; f *= 2; } return s / tot; };
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Height field around the track. A map may pass `terrain(ctx)` to reshape it (ctx.base is the default
// height); it must stay ~0 within BARRIER + 8 of the centerline, where the road and walls sit.
function makeTerrainHeight(T, custom) {
  const center = track.center;
  return (x, z, dTrack = distToTrack(x, z, 8)) => {
    const near = smooth(BARRIER + 8, BARRIER + 80, dTrack);
    const hills = (fbm(x * 0.009, z * 0.009) - 0.3) * T.hills * near;
    const rimD = Math.hypot((x - center.x) * 0.8, z - center.z);
    const rim = smooth(360, 640, rimD) * T.rim * (0.55 + 0.6 * fbm(x * 0.005 + 7, z * 0.005));
    const base = Math.max(hills, 0) + rim - 0.05;
    return custom ? custom({ x, z, dTrack, base, near, center, fbm, smooth }) : base;
  };
}
// For tooling (tools/check-map.mjs): the terrain function a map would get, without building anything.
export const terrainFor = (map) => makeTerrainHeight(merge(DEFAULT_THEME, map.theme).terrain, map.terrain);

// ---------------------------------------------------------------- build
export function buildWorld(scene, renderer, map) {
  ANISO = renderer.capabilities.getMaxAnisotropy();
  const T = merge(DEFAULT_THEME, map.theme);
  const updaters = [];
  const root = new THREE.Group();
  root.name = `world:${map.name}`;
  scene.add(root);
  const center = track.center, bounds = track.bounds;
  const terrainHeight = makeTerrainHeight(T.terrain, map.terrain);
  const col = (c) => new THREE.Color(c);

  // ---- lighting
  scene.fog = new THREE.Fog(T.fog.color, T.fog.near, T.fog.far);
  scene.background = col(T.sky.horizon);
  renderer.toneMappingExposure = T.exposure;
  const hemi = new THREE.HemisphereLight(T.hemi.sky, T.hemi.ground, T.hemi.intensity);
  root.add(hemi);
  const sunDir = new THREE.Vector3(...T.sun.dir).normalize();
  const sun = new THREE.DirectionalLight(T.sun.color, T.sun.intensity);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 400 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  root.add(sun, sun.target);

  // ---- sky dome + clouds + sun
  const skyUniforms = {
    top: { value: col(T.sky.top) }, horizon: { value: col(T.sky.horizon) }, bottom: { value: col(T.sky.bottom) },
  };
  const skyMat = new THREE.ShaderMaterial({
    uniforms: skyUniforms, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; varying vec3 vDir;
      void main(){ float h = vDir.y; vec3 c = h > 0.0 ? mix(horizon, top, pow(h, 0.55)) : mix(horizon, bottom, pow(-h, 0.4));
      gl_FragColor = vec4(c, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1800, 32, 16), skyMat);
  sky.position.copy(center);
  root.add(sky);

  const glowTex = canvasTex(128, 128, (g) => {
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, 'rgba(255,255,240,1)'); r.addColorStop(0.15, 'rgba(255,250,220,.95)'); r.addColorStop(0.4, 'rgba(255,240,200,.25)'); r.addColorStop(1, 'rgba(255,240,200,0)');
    g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  }, false);
  const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: T.sun.glow, fog: false, depthWrite: false, blending: THREE.AdditiveBlending }));
  sunSprite.scale.set(420, 420, 1);
  sunSprite.position.copy(center).addScaledVector(sunDir, 1500);
  root.add(sunSprite);

  const cloudMat = new THREE.MeshLambertMaterial({ color: T.clouds.color, emissive: T.clouds.emissive, fog: false });
  const puff = new THREE.IcosahedronGeometry(1, 2);
  const clouds = new THREE.Group();
  for (let i = 0; i < T.clouds.count; i++) {
    const c = new THREE.Group();
    const n = 5 + Math.floor(rand(0, 5));
    for (let j = 0; j < n; j++) {
      const m = new THREE.Mesh(puff, cloudMat);
      const s = rand(14, 28) * (1 - Math.abs(j - n / 2) / n);
      m.scale.set(s * 1.3, s * 0.8, s);
      m.position.set((j - n / 2) * 16 + rand(-5, 5), rand(-4, 6), rand(-8, 8));
      c.add(m);
    }
    const a = rand(0, Math.PI * 2), d = rand(500, 1100);
    c.position.set(center.x + Math.cos(a) * d, rand(160, 320), center.z + Math.sin(a) * d);
    c.rotation.y = rand(0, 3);
    clouds.add(c);
  }
  root.add(clouds);
  updaters.push((dt) => { clouds.rotation.y += dt * 0.004; });

  // Environment map (reflections on the karts) rendered from a tiny sky + ground scene.
  {
    const envScene = new THREE.Scene();
    const envSky = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), skyMat);
    envScene.add(envSky);
    const envGround = new THREE.Mesh(new THREE.CircleGeometry(49, 32), new THREE.MeshBasicMaterial({ color: T.hemi.ground }));
    envGround.rotation.x = -Math.PI / 2;
    envGround.position.y = -3;
    envScene.add(envGround);
    const sunBall = new THREE.Mesh(new THREE.SphereGeometry(4, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(8, 8, 7) }));
    sunBall.position.copy(sunDir).multiplyScalar(40);
    envScene.add(sunBall);
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(envScene, 0.02).texture;
    scene.environmentIntensity = T.envIntensity;
    pmrem.dispose();
  }

  // ---- terrain
  const grassDetail = canvasTex(256, 256, (g, w, h) => {
    const [base, ...dots] = T.terrain.detail;
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 9000, dots, 2);
    for (let i = 0; i < 700; i++) { g.strokeStyle = dots[i % dots.length]; g.beginPath(); const x = Math.random() * w, y = Math.random() * h; g.moveTo(x, y); g.lineTo(x + rand(-2, 2), y - rand(3, 7)); g.stroke(); }
  });
  grassDetail.repeat.set(220, 220);
  {
    const size = 1900, seg = 190;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, colors = [];
    const c = new THREE.Color(), grassA = col(T.terrain.low), grassB = col(T.terrain.lowAlt), rock = col(T.terrain.rock), snow = col(T.terrain.peak);
    const { rockAt, peakAt } = T.terrain;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + center.x, z = pos.getZ(i) + center.z;
      const h = terrainHeight(x, z);
      pos.setXYZ(i, x, h, z);
      c.copy(grassA).lerp(grassB, fbm(x * 0.03, z * 0.03));
      if (h > rockAt) c.lerp(rock, smooth(rockAt, rockAt * 2, h));
      if (h > peakAt) c.lerp(snow, smooth(peakAt, peakAt + 30, h));
      map.terrainColor?.({ x, z, h, color: c, smooth }); // optional per-map tint (mutates color)
      colors.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const terrain = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, map: grassDetail }));
    terrain.receiveShadow = true;
    root.add(terrain);
  }

  // ---- road surfaces
  function strip(a, b, y, vScale, material, uFlip = false) {
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= N; i++) {
      const k = i % N, p = track.p[k], r = track.r[k];
      pos.push(p.x + r.x * a, y, p.z + r.z * a, p.x + r.x * b, y, p.z + r.z * b);
      const v = (i === N ? track.len : track.d[k]) / vScale;
      uv.push(uFlip ? 1 : 0, v, uFlip ? 0 : 1, v);
      if (i < N) { const j = i * 2; idx.push(j, j + 1, j + 2, j + 1, j + 3, j + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, material);
    m.receiveShadow = true;
    root.add(m);
    return m;
  }
  const surf = (opts, offset) => new THREE.MeshStandardMaterial({
    roughness: 0.9, metalness: 0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -offset, polygonOffsetUnits: -offset * 2, ...opts,
  });

  const roadTex = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = T.road.base; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 26000, T.road.speckle, 2);
    g.globalAlpha = 0.18;
    for (let i = 0; i < 14; i++) { g.fillStyle = i % 2 ? '#2e3036' : '#6b6e76'; g.beginPath(); g.ellipse(rand(40, w - 40), rand(0, h), rand(8, 40), rand(20, 90), 0, 0, 7); g.fill(); }
    g.globalAlpha = 1;
    g.fillStyle = T.road.lines;
    g.fillRect(14, 0, 9, h); g.fillRect(w - 23, 0, 9, h);
    if (T.road.centerLine) { g.globalAlpha = 0.55; g.fillRect(w / 2 - 3, 0, 6, h * 0.45); g.globalAlpha = 1; }
  });
  strip(-HALF_W, HALF_W, 0.02, 18, surf({ map: roadTex, ...T.roadFinish, ...glowing(roadTex, T.glow.road, T.glow.roadColor) }, 1));

  const curbTex = canvasTex(32, 128, (g, w, h) => {
    g.fillStyle = T.curb[0]; g.fillRect(0, 0, w, h / 2);
    g.fillStyle = T.curb[1]; g.fillRect(0, h / 2, w, h / 2);
    g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, 0, 3, h);
  });
  strip(-HALF_W - CURB_W, -HALF_W, 0.06, 4, surf({ map: curbTex, roughness: 0.6, ...glowing(curbTex, T.glow.curb) }, 2), true);
  strip(HALF_W, HALF_W + CURB_W, 0.06, 4, surf({ map: curbTex, roughness: 0.6, ...glowing(curbTex, T.glow.curb) }, 2));

  const sandTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = T.shoulder.base; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 14000, T.shoulder.speckle, 2);
  });
  strip(-BARRIER - 0.4, -HALF_W - CURB_W, 0.01, 10, surf({ map: sandTex }, 0.5));
  strip(HALF_W + CURB_W, BARRIER + 0.4, 0.01, 10, surf({ map: sandTex }, 0.5));

  // ---- barriers: sponsor-panel walls with a rail on top
  const wallTex = canvasTex(1024, 128, (g, w, h) => {
    const panels = T.walls.panels;
    const pw = w / panels.length;
    panels.forEach(([bg, fg, text], i) => {
      g.fillStyle = bg; g.fillRect(i * pw, 0, pw, h);
      g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(i * pw, 0, pw, 14);
      g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(i * pw, h - 16, pw, 16); g.fillRect(i * pw, 0, 4, h);
      g.fillStyle = fg; g.font = 'bold 64px Impact, "Arial Black", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(text, i * pw + pw / 2, h / 2 + 2);
    });
  });
  function wall(offset, height) {
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= N; i++) {
      const k = i % N, p = track.p[k], r = track.r[k];
      // u runs so the sponsor text reads correctly from the track side of each wall
      const x = p.x + r.x * offset, z = p.z + r.z * offset, u = ((i === N ? track.len : track.d[k]) / 36) * (offset > 0 ? -1 : 1);
      pos.push(x, 0, z, x, height, z);
      uv.push(u, 0, u, 1);
      if (i < N) { const j = i * 2; idx.push(j, j + 2, j + 1, j + 1, j + 2, j + 3); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.55, side: THREE.DoubleSide, ...glowing(wallTex, T.glow.walls) }));
    m.castShadow = m.receiveShadow = true;
    root.add(m);
    // top rail
    const rail = [];
    for (let i = 0; i <= N; i += 4) rail.push(pointAt(i % N, offset, height + 0.12));
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rail, true), N / 4, 0.16, 6, true),
      new THREE.MeshStandardMaterial({ color: T.walls.rail, metalness: 0.8, roughness: 0.3 }));
    tube.castShadow = true;
    root.add(tube);
  }
  wall(-BARRIER, T.walls.height);
  wall(BARRIER, T.walls.height);

  // ---- start / finish gantry with countdown lights
  const startLights = [];
  {
    const i0 = 0, g = new THREE.Group();
    g.position.copy(track.p[i0]);
    g.rotation.y = track.ang[i0];
    root.add(g);
    const checker = canvasTex(256, 32, (c, w, h) => {
      for (let x = 0; x < 32; x++) for (let y = 0; y < 4; y++) { c.fillStyle = (x + y) % 2 ? '#111' : '#fff'; c.fillRect(x * 8, y * 8, 8, 8); }
    }, false);
    const line = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, 2.6), surf({ map: checker }, 3));
    line.rotation.x = -Math.PI / 2;
    line.position.y = 0.05;
    line.receiveShadow = true;
    g.add(line);
    const steel = new THREE.MeshStandardMaterial({ color: 0x2b3240, metalness: 0.6, roughness: 0.4 });
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(1.2, 11, 1.2), steel);
      post.position.set(s * (BARRIER - 0.4), 5.5, 0);
      post.castShadow = true;
      g.add(post);
    }
    const bannerTex = canvasTex(1024, 128, (c, w, h) => {
      const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#e11d2a'); gr.addColorStop(1, '#8f0f18');
      c.fillStyle = gr; c.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 32) { c.fillStyle = (x / 32) % 2 ? '#111' : '#fff'; c.fillRect(x, 0, 32, 14); c.fillRect(x + 16 * ((x / 32) % 2 ? -1 : 1) * 0, h - 14, 32, 14); }
      c.font = 'italic 900 78px Impact, "Arial Black", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.lineWidth = 10; c.strokeStyle = '#5a0710'; c.strokeText('PEDRO KART GP', w / 2, h / 2 + 3);
      c.fillStyle = '#ffd400'; c.fillText('PEDRO KART GP', w / 2, h / 2 + 3);
    }, false);
    const bannerMat = new THREE.MeshStandardMaterial({ map: bannerTex, roughness: 0.5, ...glowing(bannerTex, T.glow.banner) });
    const beam = new THREE.Mesh(new THREE.BoxGeometry(BARRIER * 2 + 1.5, 3, 1.2), [steel, steel, steel, steel, bannerMat, bannerMat]);
    beam.position.y = 10;
    beam.castShadow = true;
    g.add(beam);
    // lights on the side facing the grid (-z)
    const housing = new THREE.Mesh(new THREE.BoxGeometry(8.4, 2, 0.6), new THREE.MeshStandardMaterial({ color: 0x111318, roughness: 0.6 }));
    housing.position.set(0, 7.6, -0.4);
    g.add(housing);
    for (let j = 0; j < 4; j++) {
      const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.72, 24), new THREE.MeshBasicMaterial({ color: 0x331111 }));
      lamp.position.set(-3.15 + j * 2.1, 7.6, -0.72);
      lamp.rotation.y = Math.PI;
      g.add(lamp);
      startLights.push(lamp);
    }
  }

  // ---- grandstands with crowd along the main straight
  const skin = [0xffd2a6, 0xe8b48a, 0xc68b59, 0x8d5a3b, 0xf1c9a5];
  const shirts = [0xe53935, 0x1e88e5, 0xfdd835, 0x43a047, 0xffffff, 0xff7043, 0xab47bc, 0x26c6da];
  const people = [];
  const standMat = new THREE.MeshStandardMaterial({ color: 0xc9ced8, roughness: 0.8 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0xd62828, roughness: 0.5 });
  function grandstand(frac, side, length) {
    const i = idxAt(frac), g = new THREE.Group();
    g.position.copy(pointAt(i, side * (BARRIER + 2.5)));
    g.rotation.y = track.ang[i];
    root.add(g);
    const out = -side; // local +x is the track's left
    const rows = 8;
    for (let j = 0; j < rows; j++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9 * (j + 1), length), standMat);
      step.position.set(out * (j * 1.4 + 0.7), 0.45 * (j + 1), 0);
      step.castShadow = step.receiveShadow = true;
      g.add(step);
      for (let z = -length / 2 + 0.8; z < length / 2 - 0.5; z += 1.05) {
        if (Math.random() < 0.12) continue;
        const v = new THREE.Vector3(out * (j * 1.4 + 0.7 + rand(-0.15, 0.15)), 0.9 * (j + 1), z + rand(-0.15, 0.15));
        people.push({ group: g, pos: v, phase: rand(0, 6) });
      }
    }
    for (const z of [-length / 2 + 0.3, length / 2 - 0.3]) {
      for (const x of [0.2, rows * 1.4]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 11, 8), standMat);
        post.position.set(out * x, 5.5, z);
        g.add(post);
      }
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(rows * 1.4 + 2, 0.4, length + 1), roofMat);
    roof.position.set(out * (rows * 0.7), 11, 0);
    roof.rotation.z = out * 0.12;
    roof.castShadow = true;
    g.add(roof);
  }
  if (T.props.grandstands) { grandstand(0.035, 1, 56); grandstand(0.075, -1, 44); }
  if (people.length) {
    const bodyGeo = new THREE.CapsuleGeometry(0.28, 0.35, 4, 8);
    const headGeo = new THREE.SphereGeometry(0.22, 10, 8);
    const bodies = new THREE.InstancedMesh(bodyGeo, new THREE.MeshLambertMaterial(), people.length);
    const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshLambertMaterial(), people.length);
    const c = new THREE.Color();
    people.forEach((p, i) => {
      bodies.setColorAt(i, c.setHex(shirts[i % shirts.length]));
      heads.setColorAt(i, c.setHex(skin[(i * 7) % skin.length]));
    });
    root.add(bodies, heads);
    const m = new THREE.Matrix4(), wp = new THREE.Vector3();
    let acc = 0, time = 0;
    const place = () => {
      people.forEach((p, i) => {
        const jump = Math.max(0, Math.sin(time * 6 + p.phase)) * 0.25;
        wp.copy(p.pos); wp.y += 0.5 + jump;
        p.group.localToWorld(wp);
        bodies.setMatrixAt(i, m.makeTranslation(wp.x, wp.y, wp.z));
        heads.setMatrixAt(i, m.makeTranslation(wp.x, wp.y + 0.55, wp.z));
      });
      bodies.instanceMatrix.needsUpdate = heads.instanceMatrix.needsUpdate = true;
    };
    scene.updateMatrixWorld(true);
    place();
    updaters.push((dt) => { time += dt; if ((acc += dt) > 1 / 20) { acc = 0; place(); } });
  }

  // ---- bunting flags along the straight
  if (T.props.bunting) {
    const flagGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.35, 0, 0), new THREE.Vector3(0.35, 0, 0), new THREE.Vector3(0, -0.8, 0)]);
    flagGeo.computeVertexNormals();
    const cols = [0xe53935, 0xfdd835, 0x1e88e5, 0x43a047, 0xffffff];
    const flags = [];
    for (const side of [-1, 1]) {
      for (let f = 0.9; f < 1.14; f += 0.013) {
        const i0 = idxAt(f % 1), i1 = idxAt((f + 0.013) % 1);
        const a = pointAt(i0, side * (BARRIER + 0.6), 4.5), b = pointAt(i1, side * (BARRIER + 0.6), 4.5);
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 4.6, 6), standMat);
        pole.position.copy(a).setY(2.3);
        root.add(pole);
        for (let s = 0.08; s < 1; s += 0.12) flags.push({ p: a.clone().lerp(b, s).setY(4.5 - Math.sin(s * Math.PI) * 0.7), yaw: Math.atan2(b.x - a.x, b.z - a.z) });
      }
    }
    const inst = new THREE.InstancedMesh(flagGeo, new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), flags.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color(), e = new THREE.Euler();
    flags.forEach((f, i) => {
      q.setFromEuler(e.set(0, f.yaw - Math.PI / 2, 0));
      inst.setMatrixAt(i, m.compose(f.p, q, new THREE.Vector3(1, 1, 1)));
      inst.setColorAt(i, c.setHex(cols[i % cols.length]));
    });
    root.add(inst);
  }

  // ---- trees, bushes, rocks, flowers
  {
    const V = T.vegetation;
    const spots = { round: [], pine: [], bush: [], rock: [], flower: [] };
    const minX = bounds.minX - 260, maxX = bounds.maxX + 260, minZ = bounds.minZ - 260, maxZ = bounds.maxZ + 260;
    let tries = 0;
    while (tries++ < 9000) {
      const x = rand(minX, maxX), z = rand(minZ, maxZ), d = distToTrack(x, z, 6);
      if (d < BARRIER + 3) continue;
      const h = terrainHeight(x, z, d);
      if (h > V.maxAltitude) continue;
      const r = Math.random();
      const kind = d < BARRIER + 14 ? (r < 0.5 ? 'flower' : r < 0.85 ? 'bush' : 'rock') : r < 0.42 ? 'round' : r < 0.72 ? 'pine' : r < 0.86 ? 'bush' : r < 0.93 ? 'rock' : 'flower';
      if (spots[kind].length < V[kind]) spots[kind].push([x, h, z, rand(0.75, 1.5)]);
    }
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color(), e = new THREE.Euler();
    const inst = (geo, mat, list, place, color) => {
      if (!list.length) return null;
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((spot, i) => {
        place(spot, p, s, q);
        im.setMatrixAt(i, m.compose(p, q, s));
        if (color) im.setColorAt(i, color(c, i));
      });
      im.castShadow = true;
      im.receiveShadow = true;
      root.add(im);
      return im;
    };
    const upright = (yOff, sx = 1, sy = 1) => ([x, h, z, k], P, S, Q) => { P.set(x, h + yOff * k, z); S.set(k * sx, k * sy, k * sx); Q.setFromEuler(e.set(0, x * 13.7, 0)); };
    const bark = new THREE.MeshLambertMaterial({ color: V.trunk });
    inst(new THREE.CylinderGeometry(0.35, 0.55, 3.2, 7), bark, spots.round, upright(1.6));
    inst(new THREE.IcosahedronGeometry(2.8, 1), new THREE.MeshLambertMaterial({ flatShading: true }), spots.round, upright(5.2, 1, 0.95),
      (c) => c.setHSL(rand(...V.roundHue), rand(0.55, 0.75), rand(...V.leafLight)));
    inst(new THREE.CylinderGeometry(0.3, 0.45, 2.4, 6), bark, spots.pine, upright(1.2));
    inst(new THREE.ConeGeometry(2.4, 7.5, 8), new THREE.MeshLambertMaterial({ flatShading: true }), spots.pine, upright(5.8),
      (c) => c.setHSL(rand(...V.pineHue), rand(0.45, 0.6), rand(0.2, 0.3)));
    inst(new THREE.IcosahedronGeometry(1.2, 1), new THREE.MeshLambertMaterial({ flatShading: true }), spots.bush, upright(0.6, 1.3, 0.8),
      (c) => c.setHSL(rand(...V.bushHue), 0.6, rand(0.3, 0.42)));
    inst(new THREE.DodecahedronGeometry(1.4, 0), new THREE.MeshLambertMaterial({ color: V.rockColor, flatShading: true }), spots.rock, upright(0.3, 1.2, 0.8));
    const petals = V.flowers;
    inst(new THREE.IcosahedronGeometry(0.28, 0), new THREE.MeshLambertMaterial(), spots.flower,
      ([x, h, z, k], P, S, Q) => { P.set(x, h + 0.25, z); S.setScalar(k); Q.identity(); }, (c, i) => c.setHex(petals[i % petals.length]));
  }

  // ---- whimsical props: giant mushrooms, warp pipes, hot-air balloons
  {
    const dots = canvasTex(256, 128, (g, w, h) => {
      g.fillStyle = '#e8202a'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#fff';
      for (let i = 0; i < 9; i++) { g.beginPath(); g.arc((i * 61) % w + 14, 20 + ((i * 37) % 70), 16, 0, 7); g.fill(); }
    });
    const capMat = new THREE.MeshStandardMaterial({ map: dots, roughness: 0.45 });
    const stemMat = new THREE.MeshStandardMaterial({ color: 0xf6ead2, roughness: 0.7 });
    const pipeMat = new THREE.MeshStandardMaterial({ color: 0x1fae3a, roughness: 0.3, metalness: 0.1 });
    const placeOut = (frac, side, dist) => {
      const i = idxAt(frac), v = pointAt(i, side * (BARRIER + dist));
      v.y = terrainHeight(v.x, v.z);
      return v;
    };
    (T.props.mushrooms ? [[0.18, 1, 14, 2.2], [0.27, -1, 18, 3], [0.47, 1, 12, 1.6], [0.58, -1, 16, 2.6], [0.71, 1, 20, 3.2], [0.88, -1, 13, 2]] : []).forEach(([f, side, d, k]) => {
      const g = new THREE.Group();
      g.position.copy(placeOut(f, side, d));
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.2, 4, 16), stemMat);
      stem.position.y = 2;
      const cap = new THREE.Mesh(new THREE.SphereGeometry(3, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), capMat);
      cap.position.y = 3.6;
      cap.scale.y = 0.8;
      g.add(stem, cap);
      g.scale.setScalar(k);
      g.traverse((o) => { o.castShadow = true; });
      root.add(g);
    });
    (T.props.pipes ? [[0.1, -1, 10], [0.36, 1, 9], [0.66, -1, 11], [0.8, 1, 10]] : []).forEach(([f, side, d]) => {
      const g = new THREE.Group();
      g.position.copy(placeOut(f, side, d));
      const body = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 6, 24), pipeMat);
      body.position.y = 3;
      const lip = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 1.6, 24), pipeMat);
      lip.position.y = 6.6;
      const hole = new THREE.Mesh(new THREE.CircleGeometry(2.05, 24), new THREE.MeshBasicMaterial({ color: 0x06200c }));
      hole.rotation.x = -Math.PI / 2;
      hole.position.y = 7.42;
      g.add(body, lip, hole);
      g.traverse((o) => { o.castShadow = true; });
      root.add(g);
    });
    const stripes = (a, b) => canvasTex(256, 64, (g, w, h) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? a : b; g.fillRect(i * w / 8, 0, w / 8, h); } });
    const balloonPts = [];
    for (let i = 0; i <= 16; i++) { const t = i / 16; balloonPts.push(new THREE.Vector2(Math.sin(t * Math.PI) * 6 * (0.55 + 0.45 * t) + 0.6, -8 + t * 16)); }
    (T.props.balloons ? [[['#ff3b30', '#ffd60a'], -60, 90, -150], [['#0a84ff', '#ffffff'], 190, 110, 160], [['#34c759', '#ff9f0a'], -240, 130, 60]] : []).forEach(([[a, b], x, y, z], n) => {
      const g = new THREE.Group();
      const env = new THREE.Mesh(new THREE.LatheGeometry(balloonPts, 24), new THREE.MeshStandardMaterial({ map: stripes(a, b), roughness: 0.6 }));
      const basket = new THREE.Mesh(new THREE.BoxGeometry(2, 1.6, 2), new THREE.MeshStandardMaterial({ color: 0x8b5a2b }));
      basket.position.y = -11;
      g.add(env, basket);
      g.position.set(center.x + x, y, center.z + z);
      root.add(g);
      updaters.push((dt, t) => { g.position.y = y + Math.sin(t * 0.3 + n) * 4; g.rotation.y += dt * 0.05; });
    });
  }

  // ---- boost pads (dash panels)
  const padTex = canvasTex(128, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0, '#ff6a00'); gr.addColorStop(0.5, '#ffd000'); gr.addColorStop(1, '#ff6a00');
    g.fillStyle = '#3a1500'; g.fillRect(0, 0, w, h);
    g.fillStyle = gr;
    for (let y = -64; y < h; y += 64) {
      g.beginPath(); g.moveTo(10, y); g.lineTo(w / 2, y + 44); g.lineTo(w - 10, y); g.lineTo(w - 10, y + 22); g.lineTo(w / 2, y + 66); g.lineTo(10, y + 22); g.closePath(); g.fill();
    }
  });
  padTex.repeat.set(1, 1.5);
  const pads = track.boostPads.map(([frac, lat]) => {
    const idx = idxAt(frac), g = new THREE.Group();
    g.position.copy(pointAt(idx, lat, 0.07));
    g.rotation.y = track.ang[idx];
    const tex = padTex.clone();
    tex.needsUpdate = true;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 6), new THREE.MeshBasicMaterial({ map: tex, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -12 }));
    mesh.rotation.x = -Math.PI / 2;
    const rim = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 6.6), new THREE.MeshBasicMaterial({ color: 0xfff1a8, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -10 }));
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = -0.01;
    g.add(rim, mesh);
    root.add(g);
    updaters.push((dt) => { tex.offset.y -= dt * 1.6; });
    return { idx, lat, x: g.position.x, z: g.position.z };
  });

  // ---- item boxes
  const boxTex = canvasTex(256, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, h);
    ['#ff5e7e', '#ffc35e', '#fff35e', '#6effa0', '#5ed2ff', '#b77bff', '#ff5e7e'].forEach((c, i, a) => gr.addColorStop(i / (a.length - 1), c));
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.clearRect(26, 26, w - 52, h - 52);
    g.fillStyle = 'rgba(255,255,255,.22)'; g.fillRect(26, 26, w - 52, h - 52);
  }, false);
  const qTex = canvasTex(128, 128, (g, w, h) => {
    g.font = 'bold 110px "Arial Black", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 10; g.strokeStyle = 'rgba(80,40,0,.55)'; g.strokeText('?', w / 2, h / 2 + 6);
    g.fillStyle = '#ffffff'; g.fillText('?', w / 2, h / 2 + 6);
  }, false);
  const boxGeo = new THREE.BoxGeometry(1.8, 1.8, 1.8);
  const boxMat = new THREE.MeshStandardMaterial({ map: boxTex, emissiveMap: boxTex, emissive: 0xffffff, emissiveIntensity: 0.45,
    transparent: true, opacity: 0.85, roughness: 0.15, metalness: 0.2, side: THREE.DoubleSide, depthWrite: false });
  const qMat = new THREE.SpriteMaterial({ map: qTex, depthWrite: false });
  const itemBoxes = [];
  for (const frac of track.itemRows) {
    const idx = idxAt(frac);
    for (const lat of track.itemLanes) {
      const g = new THREE.Group();
      g.position.copy(pointAt(idx, lat, 1.5));
      const cube = new THREE.Mesh(boxGeo, boxMat);
      cube.rotation.set(0.6, rand(0, 3), 0.4);
      const q = new THREE.Sprite(qMat);
      q.scale.set(1.3, 1.3, 1);
      g.add(cube, q);
      root.add(g);
      itemBoxes.push({ mesh: g, cube, x: g.position.x, z: g.position.z, respawn: 0 });
    }
  }
  updaters.push((dt, t) => {
    const hue = (t * 0.15) % 1;
    boxMat.emissive.setHSL(hue, 0.6, 0.6);
    for (const b of itemBoxes) {
      b.cube.rotation.y += dt * 1.3; b.cube.rotation.x += dt * 0.7;
      b.mesh.position.y = 1.5 + Math.sin(t * 2.2 + b.x) * 0.18;
      const s = b.respawn > 0 ? 0 : Math.min(1, (b.mesh.scale.x || 0) + dt * 3);
      b.mesh.scale.setScalar(Math.max(s, 0.001));
    }
  });

  // ---- map-specific decorations
  map.decorate?.({
    THREE, root, track, pointAt, idxAt, terrainHeight, distToTrack, canvasTex, rand, fbm,
    BARRIER, HALF_W, CURB_W, ROAD_W, N, theme: T, onUpdate: (fn) => updaters.push(fn),
  });

  let time = 0;
  return {
    root, sun, sunDir, itemBoxes, pads, startLights, terrainHeight, theme: T,
    update(dt) { time += dt; for (const u of updaters) u(dt, time); },
    // Keep the shadow frustum centred on what a given camera is looking at.
    aimSun(x, z) {
      sun.target.position.set(x, 0, z);
      sun.position.set(x + sunDir.x * 200, sunDir.y * 200, z + sunDir.z * 200);
      sun.target.updateMatrixWorld();
    },
    dispose() {
      scene.remove(root);
      root.traverse((o) => {
        o.geometry?.dispose();
        for (const m of [].concat(o.material || [])) { for (const v of Object.values(m)) if (v?.isTexture) v.dispose(); m.dispose(); }
      });
      sun.shadow.map?.dispose();
      scene.environment?.dispose();
    },
  };
}
