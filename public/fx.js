// Lightweight CPU particle systems: drift sparks, boost flames, dust, explosions, confetti.
import * as THREE from 'three';
import { rand } from './config.js';

class Particles {
  constructor(max, additive) {
    this.max = max;
    this.next = 0;
    const f = (n) => new Float32Array(max * n);
    Object.assign(this, { pos: f(3), vel: f(3), col: f(3), life: f(1), maxLife: f(1), size0: f(1), size1: f(1), alpha0: f(1), grav: f(1), drag: f(1), size: f(1), alpha: f(1) });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.uniforms = { uScale: { value: 400 } };
    this.points = new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: this.uniforms, transparent: true, depthWrite: false, vertexColors: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: `attribute float size; attribute float alpha; varying vec3 vCol; varying float vA; uniform float uScale;
        void main(){ vCol = color; vA = alpha; vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * uScale / max(-mv.z, 0.1); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec3 vCol; varying float vA;
        void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; if (d > 1.0) discard;
        float a = vA * ${additive ? 'pow(1.0 - d, 1.6)' : 'smoothstep(1.0, 0.35, d)'};
        gl_FragColor = vec4(vCol, a);
        #include <colorspace_fragment>
        }`,
    }));
    this.points.frustumCulled = false;
  }
  emit(x, y, z, vx, vy, vz, { life = 0.5, size = 0.5, sizeEnd = size, color = 0xffffff, alpha = 1, gravity = 0, drag = 0 } = {}) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    this.pos.set([x, y, z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    const c = TMP.set(color);
    this.col.set([c.r, c.g, c.b], i * 3);
    this.life[i] = this.maxLife[i] = life;
    this.size0[i] = size; this.size1[i] = sizeEnd; this.alpha0[i] = alpha;
    this.grav[i] = gravity; this.drag[i] = drag;
  }
  update(dt) {
    const { pos, vel, life, maxLife, size, alpha } = this;
    for (let i = 0; i < this.max; i++) {
      if (life[i] <= 0) { if (alpha[i] !== 0) { alpha[i] = 0; size[i] = 0; } continue; }
      life[i] -= dt;
      const k = 1 - Math.max(life[i], 0) / maxLife[i];
      const d = Math.exp(-this.drag[i] * dt);
      vel[i * 3] *= d; vel[i * 3 + 1] = vel[i * 3 + 1] * d - this.grav[i] * dt; vel[i * 3 + 2] *= d;
      pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      if (pos[i * 3 + 1] < 0.05) { pos[i * 3 + 1] = 0.05; vel[i * 3 + 1] *= -0.4; }
      size[i] = this.size0[i] + (this.size1[i] - this.size0[i]) * k;
      alpha[i] = this.alpha0[i] * (1 - k * k);
    }
    const a = this.points.geometry.attributes;
    a.position.needsUpdate = a.color.needsUpdate = a.size.needsUpdate = a.alpha.needsUpdate = true;
  }
}
const TMP = new THREE.Color();
const FLASH_TEX = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,.85)'); r.addColorStop(0.6, 'rgba(255,255,255,.25)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
})();

export class FX {
  constructor(scene) {
    this.glow = new Particles(3000, true);
    this.smoke = new Particles(1500, false);
    scene.add(this.smoke.points, this.glow.points);
    this.flashes = [];
    this.scene = scene;
  }
  // Point sizes are in world units; convert to pixels for the viewport being rendered.
  setViewport(heightPx, fovDeg) {
    const s = heightPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
    this.glow.uniforms.uScale.value = this.smoke.uniforms.uScale.value = s;
  }
  update(dt) {
    this.glow.update(dt);
    this.smoke.update(dt);
    for (const f of [...this.flashes]) {
      f.t += dt;
      const k = f.t / f.dur;
      f.mesh.scale.setScalar(f.r0 + (f.r1 - f.r0) * Math.sqrt(k));
      f.mesh.material.opacity = 0.9 * (1 - k);
      if (k >= 1) { this.scene.remove(f.mesh); f.mesh.material.dispose(); this.flashes.splice(this.flashes.indexOf(f), 1); }
    }
  }

  sparks(p, back, side, color, big) {
    for (let i = 0; i < (big ? 3 : 2); i++) {
      this.glow.emit(p.x, p.y, p.z, back.x * rand(3, 8) + side.x * rand(-3, 3), rand(1.5, 4.5), back.z * rand(3, 8) + side.z * rand(-3, 3),
        { life: rand(0.18, 0.35), size: big ? rand(0.35, 0.55) : rand(0.2, 0.35), sizeEnd: 0.05, color, gravity: 14 });
    }
    this.glow.emit(p.x, p.y + 0.1, p.z, 0, 0, 0, { life: 0.06, size: big ? 1.3 : 0.8, sizeEnd: 0.6, color, alpha: 0.8 });
  }
  flame(p, back, strong) {
    for (let i = 0; i < 2; i++) {
      this.glow.emit(p.x, p.y, p.z, back.x * rand(6, 10) + rand(-0.6, 0.6), rand(0.5, 1.5), back.z * rand(6, 10) + rand(-0.6, 0.6),
        { life: rand(0.12, 0.22), size: strong ? rand(0.8, 1.1) : 0.6, sizeEnd: 0.15, color: i ? 0xffb020 : 0xff5a10 });
    }
    this.glow.emit(p.x, p.y, p.z, back.x * 3, 0.3, back.z * 3, { life: 0.08, size: 0.6, sizeEnd: 0.2, color: 0x9fd8ff });
  }
  dust(p, color = 0xc9a978, amount = 1) {
    if (Math.random() > amount) return;
    this.smoke.emit(p.x + rand(-0.3, 0.3), p.y + 0.2, p.z + rand(-0.3, 0.3), rand(-1, 1), rand(0.8, 2), rand(-1, 1),
      { life: rand(0.5, 0.9), size: 0.6, sizeEnd: 2.2, color, alpha: 0.55, drag: 2 });
  }
  tireSmoke(p) {
    this.smoke.emit(p.x, p.y + 0.15, p.z, rand(-0.5, 0.5), rand(0.5, 1.2), rand(-0.5, 0.5),
      { life: rand(0.4, 0.7), size: 0.4, sizeEnd: 1.6, color: 0xe8e8ec, alpha: 0.35, drag: 2 });
  }
  burst(p, colors, n = 40, speed = 10, size = 0.5) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), e = rand(-0.2, 1), s = rand(0.4, 1) * speed;
      this.glow.emit(p.x, p.y, p.z, Math.cos(a) * s * Math.cos(e), Math.sin(e) * s + 2, Math.sin(a) * s * Math.cos(e),
        { life: rand(0.35, 0.7), size, sizeEnd: 0.05, color: colors[i % colors.length], gravity: 12, drag: 1.5 });
    }
  }
  stars(p) { this.burst(p, [0xffe14d, 0xffffff, 0xffc400], 24, 6, 0.55); }
  explosion(p, color = 0x4aa8ff) {
    this.burst(p, [color, 0xffffff, 0xbfe3ff], 90, 22, 1.1);
    for (let i = 0; i < 30; i++) {
      const a = rand(0, Math.PI * 2), s = rand(4, 12);
      this.smoke.emit(p.x, p.y + 0.5, p.z, Math.cos(a) * s, rand(1, 5), Math.sin(a) * s,
        { life: rand(0.8, 1.4), size: 2, sizeEnd: 6, color: 0x9fb4d8, alpha: 0.6, drag: 2.5 });
    }
    for (const [c, r1, dur] of [[0xffffff, 14, 0.35], [color, 22, 0.7]]) {
      const mesh = new THREE.Sprite(new THREE.SpriteMaterial({ map: FLASH_TEX, color: c, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      mesh.position.set(p.x, p.y + 1, p.z);
      this.scene.add(mesh);
      this.flashes.push({ mesh, t: 0, dur, r0: 2, r1 });
    }
  }
  confetti(p) {
    const cols = [0xff3b30, 0xffcc00, 0x34c759, 0x0a84ff, 0xaf52de, 0xffffff];
    for (let i = 0; i < 6; i++) {
      this.smoke.emit(p.x + rand(-6, 6), p.y + rand(5, 9), p.z + rand(-6, 6), rand(-1, 1), rand(-1, 0.5), rand(-1, 1),
        { life: rand(1.2, 2), size: 0.28, sizeEnd: 0.28, color: cols[i], alpha: 1, gravity: 2.5, drag: 1 });
    }
  }
  trail(p, back) {
    this.smoke.emit(p.x + rand(-0.3, 0.3), p.y + rand(-0.3, 0.3), p.z + rand(-0.3, 0.3), back.x * 4, rand(0.2, 0.8), back.z * 4,
      { life: rand(0.35, 0.6), size: 0.7, sizeEnd: 2.2, color: 0xdfe3ea, alpha: 0.45, drag: 3 });
  }
  pop(p) {
    for (let i = 0; i < 30; i++) {
      this.smoke.emit(p.x + rand(-1, 1), p.y + rand(0, 2), p.z + rand(-1, 1), rand(-4, 4), rand(0, 4), rand(-4, 4),
        { life: rand(0.5, 0.9), size: 1, sizeEnd: 3, color: 0xf2f2f2, alpha: 0.8, drag: 3 });
    }
  }
}
