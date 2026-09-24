// Kart + driver models (and the Bullet Bill a kart turns into).
import * as THREE from 'three';
import { hexStr } from './config.js';

const tireMat = new THREE.MeshStandardMaterial({ color: 0x1b1b1d, roughness: 0.85 });
const darkMat = new THREE.MeshStandardMaterial({ color: 0x24272e, roughness: 0.5, metalness: 0.3 });
const chromeMat = new THREE.MeshStandardMaterial({ color: 0xe6e8ec, roughness: 0.15, metalness: 1 });
const skinMat = new THREE.MeshStandardMaterial({ color: 0xffc99e, roughness: 0.6 });
const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35 });
const pupilMat = new THREE.MeshStandardMaterial({ color: 0x14213d, roughness: 0.2 });
const overallsMat = new THREE.MeshStandardMaterial({ color: 0x2445a8, roughness: 0.7 });
const hairMat = new THREE.MeshStandardMaterial({ color: 0x4a2c17, roughness: 0.8 });
const seatMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6 });

// Rounded tire cross-section revolved into a donut-ish wheel, axis along X.
function tireGeo(r, w) {
  const pts = [], rr = w * 0.35, inner = r * 0.55;
  pts.push(new THREE.Vector2(inner, -w / 2));
  for (let i = 0; i <= 8; i++) { const a = -Math.PI / 2 + (i / 8) * (Math.PI / 2); pts.push(new THREE.Vector2(r - rr + Math.cos(a) * rr, -w / 2 + rr + Math.sin(a) * rr)); }
  for (let i = 0; i <= 8; i++) { const a = (i / 8) * (Math.PI / 2); pts.push(new THREE.Vector2(r - rr + Math.cos(a) * rr, w / 2 - rr + Math.sin(a) * rr)); }
  pts.push(new THREE.Vector2(inner, w / 2));
  return new THREE.LatheGeometry(pts, 24).rotateZ(Math.PI / 2);
}
const FRONT_TIRE = tireGeo(0.46, 0.46), REAR_TIRE = tireGeo(0.56, 0.62);
const hubTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#d9dde3'; g.beginPath(); g.arc(64, 64, 62, 0, 7); g.fill();
  g.fillStyle = '#8a9099';
  for (let i = 0; i < 5; i++) { g.save(); g.translate(64, 64); g.rotate((i / 5) * Math.PI * 2); g.fillRect(-7, 12, 14, 44); g.restore(); }
  g.fillStyle = '#f4f5f7'; g.beginPath(); g.arc(64, 64, 16, 0, 7); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
const hubMat = new THREE.MeshStandardMaterial({ map: hubTex, metalness: 0.7, roughness: 0.3 });

// Side profile of the chassis (z forward, y up), extruded across the kart's width.
const chassisGeo = (() => {
  const s = new THREE.Shape();
  s.moveTo(-1.45, 0.28);
  s.lineTo(1.55, 0.28);
  s.quadraticCurveTo(2.05, 0.3, 2.0, 0.52);
  s.quadraticCurveTo(1.6, 0.74, 1.05, 0.74);
  s.lineTo(0.55, 0.72);
  s.quadraticCurveTo(0.35, 0.56, 0.1, 0.52);
  s.lineTo(-0.75, 0.52);
  s.quadraticCurveTo(-0.95, 0.9, -1.2, 0.92);
  s.lineTo(-1.45, 0.88);
  s.lineTo(-1.45, 0.28);
  const g = new THREE.ExtrudeGeometry(s, { depth: 1.25, bevelEnabled: true, bevelThickness: 0.16, bevelSize: 0.14, bevelSegments: 4, curveSegments: 10 });
  g.rotateY(-Math.PI / 2);
  g.translate(0.625, 0, 0);
  return g;
})();

function emblemTex(letter, color) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.beginPath(); g.arc(64, 64, 60, 0, 7); g.fill();
  g.fillStyle = hexStr(color); g.font = '900 88px "Arial Black", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(letter, 64, 70);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function makeLabel(text, color) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = '40px "Luckiest Guy", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 8; g.strokeStyle = '#000'; g.strokeText(text, 128, 35);
  g.fillStyle = hexStr(color); g.fillText(text, 128, 35);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false }));
  s.scale.set(3.4, 0.85, 1);
  s.position.y = 3.3;
  return s;
}

function buildBullet() {
  const pts = [];
  for (let i = 0; i <= 12; i++) { const a = (i / 12) * Math.PI / 2; pts.push(new THREE.Vector2(Math.cos(a) * 1.05, 1.1 + Math.sin(a) * 1.3)); }
  pts.reverse();
  pts.push(new THREE.Vector2(1.05, -1.6), new THREE.Vector2(0.8, -1.9), new THREE.Vector2(0, -1.9));
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.LatheGeometry(pts, 28).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x1c1c22, roughness: 0.25, metalness: 0.4 }));
  g.add(body);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(1.08, 1.08, 0.3, 28).rotateX(Math.PI / 2), darkMat);
  band.position.z = -1.3;
  g.add(band);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 12), whiteMat);
    eye.scale.set(0.8, 1.1, 0.5);
    eye.position.set(s * 0.42, 0.35, 1.55);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), pupilMat);
    pupil.position.set(s * 0.38, 0.33, 1.72);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.12, 0.1), whiteMat);
    brow.position.set(s * 0.42, 0.72, 1.55);
    brow.rotation.z = s * -0.35;
    g.add(eye, pupil, brow);
    const arm = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), whiteMat);
    arm.position.set(s * 1.15, -0.2, 0.2);
    g.add(arm);
  }
  for (let i = 0; i < 4; i++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.9, 0.9), darkMat);
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    fin.position.set(Math.cos(a) * 1.15, Math.sin(a) * 1.15, -1.5);
    fin.rotation.z = a;
    g.add(fin);
  }
  g.position.y = 1.55;
  g.scale.setScalar(1.3);
  g.traverse((o) => { o.castShadow = true; });
  g.visible = false;
  return g;
}

// variant: 0..n picks small differences (mustache, hair) so racers read as different characters.
export function buildKart(color, name, variant = 0) {
  const paint = new THREE.MeshPhysicalMaterial({ color, roughness: 0.28, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.08 });
  const paintDark = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.55), roughness: 0.4, metalness: 0.2 });
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const add = (geo, mat, x, y, z, parent = body) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };

  add(chassisGeo, paint, 0, 0, 0);
  // side pods, fenders, bumpers
  for (const s of [-1, 1]) {
    const pod = add(new THREE.CapsuleGeometry(0.3, 1.3, 6, 16).rotateX(Math.PI / 2), paint, s * 0.95, 0.5, 0.1);
    pod.scale.set(0.85, 0.75, 1);
    add(new THREE.CapsuleGeometry(0.08, 1.2, 4, 8).rotateX(Math.PI / 2), whiteMat, s * 1.13, 0.55, 0.1); // pinstripe
    const ff = add(new THREE.TorusGeometry(0.52, 0.09, 8, 16, Math.PI * 0.9), paint, s * 0.98, 0.46, 1.3);
    ff.rotation.set(0, Math.PI / 2, 0.15 * Math.PI);
    const rf = add(new THREE.TorusGeometry(0.64, 0.11, 8, 16, Math.PI * 0.85), paint, s * 1.05, 0.56, -1.05);
    rf.rotation.set(0, Math.PI / 2, 0.2 * Math.PI);
  }
  add(new THREE.CapsuleGeometry(0.13, 0.9, 4, 12).rotateZ(Math.PI / 2), darkMat, 0, 0.34, 2.14);
  // number disc on the nose
  const disc = add(new THREE.CircleGeometry(0.32, 24), new THREE.MeshStandardMaterial({ map: emblemTex(name[0].toUpperCase(), color), roughness: 0.4 }), 0, 0.8, 1.35);
  disc.rotation.x = -1.35;
  // engine cover + chrome block + exhausts
  const cover = add(new THREE.CapsuleGeometry(0.34, 0.5, 6, 16).rotateZ(Math.PI / 2), paint, 0, 0.98, -1.2);
  cover.scale.set(1, 0.9, 1.1);
  add(new THREE.BoxGeometry(0.62, 0.3, 0.42), darkMat, 0, 0.9, -1.55);
  const exhausts = [];
  for (const s of [-1, 1]) {
    const pipe = add(new THREE.CylinderGeometry(0.1, 0.12, 0.45, 14, 1, true), chromeMat, s * 0.3, 1.0, -1.72);
    pipe.rotation.x = -1.0;
    const rim = add(new THREE.TorusGeometry(0.105, 0.03, 6, 14), darkMat, s * 0.3, 1.11, -1.91);
    rim.rotation.x = -1.0 + Math.PI / 2;
    const tip = new THREE.Object3D();
    tip.position.set(s * 0.3, 1.13, -1.95);
    body.add(tip);
    exhausts.push(tip);
  }
  // seat
  add(new THREE.CapsuleGeometry(0.28, 0.6, 4, 10).rotateZ(Math.PI / 2), seatMat, 0, 0.7, -0.55);
  add(new THREE.BoxGeometry(0.9, 0.75, 0.2), seatMat, 0, 1.05, -0.78).rotation.x = -0.15;
  // steering column + wheel
  add(new THREE.CylinderGeometry(0.05, 0.05, 0.8, 8), darkMat, 0, 0.95, 0.55).rotation.x = 1.0;
  const sw = add(new THREE.TorusGeometry(0.26, 0.055, 8, 20), darkMat, 0, 1.28, 0.28);
  sw.rotation.x = -0.75;

  // driver
  const driver = new THREE.Group();
  driver.position.set(0, -0.22, -0.4);
  driver.scale.setScalar(1.2);
  body.add(driver);
  add(new THREE.CapsuleGeometry(0.34, 0.3, 4, 12), overallsMat, 0, 1.2, 0, driver);
  const shirt = add(new THREE.CapsuleGeometry(0.3, 0.12, 4, 12), paint, 0, 1.52, -0.02, driver);
  shirt.scale.set(1.15, 0.8, 1);
  for (const s of [-1, 1]) {
    const arm = add(new THREE.CapsuleGeometry(0.1, 0.5, 4, 8), paint, s * 0.3, 1.38, 0.32, driver);
    arm.rotation.set(1.15, 0, s * 0.35);
    add(new THREE.SphereGeometry(0.13, 12, 10), whiteMat, s * 0.2, 1.3, 0.62, driver);
  }
  const head = new THREE.Group();
  head.position.set(0, 2.02, 0);
  driver.add(head);
  add(new THREE.SphereGeometry(0.44, 24, 18), skinMat, 0, 0, 0, head);
  for (const s of [-1, 1]) {
    const eye = add(new THREE.SphereGeometry(0.12, 14, 10), whiteMat, s * 0.14, -0.02, 0.37, head);
    eye.scale.set(0.8, 1.25, 0.6);
    add(new THREE.SphereGeometry(0.058, 10, 8), pupilMat, s * 0.13, -0.03, 0.445, head);
    add(new THREE.SphereGeometry(0.02, 6, 4), whiteMat, s * 0.11, 0.0, 0.48, head); // catch-light
    add(new THREE.SphereGeometry(0.12, 10, 8), skinMat, s * 0.43, -0.02, 0, head); // ears
  }
  add(new THREE.SphereGeometry(0.12, 12, 10), new THREE.MeshStandardMaterial({ color: 0xffb485, roughness: 0.5 }), 0, -0.12, 0.45, head);
  if (variant % 2 === 0) {
    const stache = add(new THREE.CapsuleGeometry(0.06, 0.26, 4, 8).rotateZ(Math.PI / 2), hairMat, 0, -0.22, 0.4, head);
    stache.scale.set(1, 1, 0.7);
  } else {
    const smile = add(new THREE.TorusGeometry(0.1, 0.02, 6, 12, Math.PI), pupilMat, 0, -0.22, 0.41, head);
    smile.rotation.z = Math.PI;
  }
  const cap = add(new THREE.SphereGeometry(0.47, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), paint, 0, 0.13, -0.02, head);
  cap.scale.y = 0.82;
  const brim = add(new THREE.CylinderGeometry(0.3, 0.32, 0.05, 20, 1, false, -Math.PI / 2, Math.PI), paint, 0, 0.15, 0.32, head);
  brim.scale.set(1.25, 1, 1);
  const emb = add(new THREE.CircleGeometry(0.15, 20), new THREE.MeshStandardMaterial({ map: emblemTex(name[0].toUpperCase(), color), roughness: 0.5 }), 0, 0.33, 0.36, head);
  emb.rotation.x = -0.55;
  for (const s of [-1, 1]) add(new THREE.SphereGeometry(0.13, 10, 8), hairMat, s * 0.36, 0.05, -0.12, head); // sideburns

  // wheels
  const wheels = [], steerers = [], rearWheels = [];
  for (const [x, z, front] of [[-0.98, 1.3, true], [0.98, 1.3, true], [-1.05, -1.05, false], [1.05, -1.05, false]]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, front ? 0.46 : 0.56, z);
    body.add(pivot);
    const spin = new THREE.Group();
    pivot.add(spin);
    const tire = new THREE.Mesh(front ? FRONT_TIRE : REAR_TIRE, tireMat);
    tire.castShadow = true;
    spin.add(tire);
    const hub = new THREE.Mesh(new THREE.CircleGeometry(front ? 0.27 : 0.33, 20), hubMat);
    hub.position.x = Math.sign(x) * (front ? 0.235 : 0.315);
    hub.rotation.y = Math.sign(x) * Math.PI / 2;
    spin.add(hub);
    wheels.push(spin);
    if (front) steerers.push(pivot); else rearWheels.push(pivot);
  }

  // soft contact shadow (real shadows only exist near each camera)
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 4), BLOB_MAT);
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.06;
  root.add(blob);

  const bullet = buildBullet();
  root.add(bullet);
  const label = makeLabel(name, color);
  root.add(label);
  return { root, body, driver, head, wheels, steerers, rearWheels, exhausts, bullet, label, paint };
}

const BLOB_MAT = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 4, 32, 32, 32);
  r.addColorStop(0, 'rgba(0,0,0,.45)'); r.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -16 });
})();

export function disposeKart(v) {
  v.root.traverse((o) => {
    if (o.geometry && o.geometry !== FRONT_TIRE && o.geometry !== REAR_TIRE && o.geometry !== chassisGeo) o.geometry.dispose();
  });
  v.paint.dispose();
  v.label.material.map.dispose();
}
