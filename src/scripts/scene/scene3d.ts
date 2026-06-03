/**
 * 3D space scene (Three.js) — a drifting starfield with the Milky Way band,
 * soft nebula clouds, and a few slowly-rotating planets. On-brand teal/amber
 * star and rim tints over the deep-navy site background.
 *
 * Performance: DPR capped at 2, stars are a single Points cloud, the loop pauses
 * off-screen and on tab blur, everything is disposed on teardown, bloom is lazy.
 */
import * as THREE from 'three';
import type { SceneHandle } from './scene2d';

const COL = {
  bg: 0x060911,
  accent: 0x37e7df,
  signal: 0xffc15e,
  star: 0xdfe9ff,
  indigo: 0x4a3a8a,
  teal: 0x1c6f86,
};

/** soft radial-gradient sprite texture (white → transparent), tinted per-sprite. */
function softTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function startScene3d(canvas: HTMLCanvasElement): SceneHandle {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();

  let composer: { render(): void; setSize(w: number, h: number): void; dispose?(): void } | null = null;

  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 600);
  camera.position.set(0, 0, 55);
  camera.lookAt(0, 0, 0);

  scene.add(new THREE.AmbientLight(0x202a3c, 0.7));
  const sun = new THREE.DirectionalLight(0xbfd2ff, 1.4);
  sun.position.set(-30, 12, 40);
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0x37e7df, 0.5);
  rim.position.set(40, -10, 10);
  scene.add(rim);

  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(o: T): T => { disposables.push(o); return o; };
  const rand = (a: number, b: number) => a + Math.random() * (b - a);
  const tmp = new THREE.Color();

  // ---- starfield (uniform sphere) + Milky Way band, one Points cloud ----
  const N_UNIFORM = 5200;
  const N_BAND = 3200;
  const N = N_UNIFORM + N_BAND;
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  const siz = new Float32Array(N);
  const cStar = new THREE.Color(COL.star);
  const cAcc = new THREE.Color(COL.accent);
  const cSig = new THREE.Color(COL.signal);
  const cTeal = new THREE.Color(COL.teal);

  function starColor(i: number, biasWarm = 0) {
    const r = Math.random();
    if (r < 0.12 + biasWarm) tmp.copy(cAcc);
    else if (r < 0.2 + biasWarm) tmp.copy(cSig);
    else tmp.copy(cStar);
    // dim some stars for depth
    const b = rand(0.45, 1);
    col[i * 3] = tmp.r * b; col[i * 3 + 1] = tmp.g * b; col[i * 3 + 2] = tmp.b * b;
  }

  // uniform stars in a spherical shell
  for (let i = 0; i < N_UNIFORM; i++) {
    const r = rand(70, 260);
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(rand(-1, 1));
    pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
    pos[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th);
    pos[i * 3 + 2] = r * Math.cos(ph);
    siz[i] = rand(0.5, 2.2);
    starColor(i);
  }
  // Milky Way band: stars concentrated near a tilted plane (galactic disk)
  for (let k = 0; k < N_BAND; k++) {
    const i = N_UNIFORM + k;
    const r = rand(60, 280);
    const th = Math.random() * Math.PI * 2;
    // thin in one axis → a band; add gaussian-ish thickness
    const thickness = (Math.random() + Math.random() + Math.random() - 1.5) * 26;
    pos[i * 3] = r * Math.cos(th);
    pos[i * 3 + 1] = thickness;
    pos[i * 3 + 2] = r * Math.sin(th);
    siz[i] = rand(0.6, 2.6);
    starColor(i, 0.06);
  }

  const starGeo = track(new THREE.BufferGeometry());
  starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  starGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  starGeo.setAttribute('asize', new THREE.BufferAttribute(siz, 1));
  const starTex = track(softTexture());
  const starMat = track(new THREE.PointsMaterial({
    size: 1.7, map: starTex, vertexColors: true, transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  }));
  const stars = new THREE.Points(starGeo, starMat);
  // tilt the whole field so the band reads as a diagonal Milky Way
  const galaxy = new THREE.Group();
  galaxy.rotation.set(0.5, 0.2, 0.35);
  galaxy.add(stars);
  scene.add(galaxy);

  // ---- nebula clouds (soft additive sprites along the band) ----
  const nebTex = track(softTexture());
  const nebulae: THREE.Sprite[] = [];
  const nebColors = [COL.indigo, COL.teal, 0x6a3a7a, COL.indigo, 0x1c6f86, 0x3a2f6a];
  for (let i = 0; i < nebColors.length; i++) {
    const mat = track(new THREE.SpriteMaterial({
      map: nebTex, color: nebColors[i], transparent: true, opacity: 0.22,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    const s = new THREE.Sprite(mat);
    const ang = (i / nebColors.length) * Math.PI * 2 + rand(-0.3, 0.3);
    const r = rand(60, 150);
    s.position.set(Math.cos(ang) * r, rand(-30, 30), Math.sin(ang) * r - 40);
    const sc = rand(90, 170);
    s.scale.set(sc, sc, 1);
    galaxy.add(s);
    nebulae.push(s);
  }

  // ---- planets ----
  interface Planet { mesh: THREE.Mesh; spin: number; group: THREE.Group; }
  const planets: Planet[] = [];
  function makePlanet(radius: number, color: number, atmo: number, x: number, y: number, z: number, spin: number, ring?: number) {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    const geo = track(new THREE.SphereGeometry(radius, 48, 48));
    const mat = track(new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.1, emissive: color, emissiveIntensity: 0.06 }));
    const mesh = new THREE.Mesh(geo, mat);
    group.add(mesh);
    // atmosphere rim (backside additive glow)
    const aGeo = track(new THREE.SphereGeometry(radius * 1.12, 40, 40));
    const aMat = track(new THREE.MeshBasicMaterial({ color: atmo, transparent: true, opacity: 0.18, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    group.add(new THREE.Mesh(aGeo, aMat));
    if (ring) {
      const rGeo = track(new THREE.RingGeometry(radius * 1.5, radius * 2.3, 64));
      const rMat = track(new THREE.MeshBasicMaterial({ color: ring, transparent: true, opacity: 0.35, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
      const r = new THREE.Mesh(rGeo, rMat);
      r.rotation.set(-1.2, 0.3, 0);
      group.add(r);
    }
    scene.add(group);
    planets.push({ mesh, spin, group });
  }
  // focal planet — right side (clear zone next to the hero text)
  makePlanet(7.5, 0x1b414f, COL.accent, 20, -3, 6, 0.04);
  // amber giant — far back, left-ish (depth behind text)
  makePlanet(5, 0x3a2418, COL.signal, -26, 8, -60, 0.03);
  // small ringed planet — upper area, mid depth
  makePlanet(3.2, 0x222a44, 0x7a6ad0, -8, 16, -20, 0.06, COL.signal);

  // shooting star (occasional)
  const shootGeo = track(new THREE.BufferGeometry());
  shootGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const shootMat = track(new THREE.LineBasicMaterial({ color: COL.star, transparent: true, opacity: 0, blending: THREE.AdditiveBlending }));
  const shoot = new THREE.Line(shootGeo, shootMat);
  scene.add(shoot);
  let shootT = rand(2, 6), shootLife = 0;
  const sp0 = new THREE.Vector3(), spDir = new THREE.Vector3();

  // ---- pointer parallax ----
  const ndc = new THREE.Vector2();
  const onMove = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  };
  canvas.addEventListener('pointermove', onMove);

  // ---- loop ----
  let raf = 0, running = false, last = performance.now(), t0 = performance.now();
  const targetX = { v: 0 }, targetY = { v: 0 };

  function update(dt: number, now: number) {
    const t = (now - t0) / 1000;
    const k = Math.min(dt * 60, 3);

    galaxy.rotation.y += 0.00035 * k;
    galaxy.rotation.z += 0.00012 * k;
    for (const p of planets) p.mesh.rotation.y += p.spin * 0.01 * k;

    // smooth camera parallax toward pointer
    targetX.v += (ndc.x * 6 - targetX.v) * 0.03 * k;
    targetY.v += (ndc.y * 4 - targetY.v) * 0.03 * k;
    camera.position.x = targetX.v + Math.sin(t * 0.05) * 2;
    camera.position.y = targetY.v + Math.cos(t * 0.04) * 1.5;
    camera.lookAt(0, 0, -10);

    // shooting star
    shootT -= dt;
    if (shootLife > 0) {
      shootLife -= dt;
      const a = Math.max(0, shootLife / 0.6);
      shootMat.opacity = a;
      sp0.addScaledVector(spDir, 60 * dt);
      const arr = shootGeo.attributes.position.array as Float32Array;
      arr[0] = sp0.x; arr[1] = sp0.y; arr[2] = sp0.z;
      arr[3] = sp0.x - spDir.x * 8; arr[4] = sp0.y - spDir.y * 8; arr[5] = sp0.z - spDir.z * 8;
      shootGeo.attributes.position.needsUpdate = true;
    } else if (shootT <= 0) {
      shootT = rand(4, 10); shootLife = 0.6;
      sp0.set(rand(20, 60), rand(10, 40), rand(-30, 10));
      spDir.set(rand(-1, -0.4), rand(-0.5, -0.1), 0).normalize();
    }
  }

  function frame(now: number) {
    const dt = Math.min((now - last) / 1000, 1 / 30);
    last = now;
    update(dt, now);
    if (composer) composer.render();
    else renderer.render(scene, camera);
    if (running) raf = requestAnimationFrame(frame);
  }
  function start() { if (running) return; running = true; last = performance.now(); raf = requestAnimationFrame(frame); }
  function stop() { running = false; cancelAnimationFrame(raf); }

  function resize() {
    const r = canvas.getBoundingClientRect();
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / Math.max(1, r.height);
    camera.updateProjectionMatrix();
    composer?.setSize(r.width, r.height);
  }

  // bloom (async, lazy) — makes stars & rims glow; falls back to direct render
  (async () => {
    try {
      const r = canvas.getBoundingClientRect();
      const [{ EffectComposer }, { RenderPass }, { UnrealBloomPass }, { OutputPass }] = await Promise.all([
        import('three/addons/postprocessing/EffectComposer.js'),
        import('three/addons/postprocessing/RenderPass.js'),
        import('three/addons/postprocessing/UnrealBloomPass.js'),
        import('three/addons/postprocessing/OutputPass.js'),
      ]);
      const c = new EffectComposer(renderer);
      c.addPass(new RenderPass(scene, camera));
      c.addPass(new UnrealBloomPass(new THREE.Vector2(r.width, r.height), 0.85, 0.6, 0.2));
      c.addPass(new OutputPass());
      c.setSize(r.width, r.height);
      composer = c;
    } catch { /* keep direct render */ }
  })();

  // pause when scrolled off-screen or tab hidden (rect check — robust everywhere)
  const hero = (canvas.closest('#hero') as HTMLElement) ?? canvas;
  const onScreen = () => {
    const r = hero.getBoundingClientRect();
    return r.bottom > 0 && r.top < (window.innerHeight || document.documentElement.clientHeight);
  };
  const checkVis = () => { if (onScreen() && !document.hidden) start(); else stop(); };
  window.addEventListener('scroll', checkVis, { passive: true });
  document.addEventListener('visibilitychange', checkVis);
  let rt = 0;
  const onResize = () => { clearTimeout(rt); rt = window.setTimeout(resize, 200); };
  window.addEventListener('resize', onResize);

  resize();
  start();

  return {
    dispose() {
      stop();
      window.removeEventListener('scroll', checkVis);
      document.removeEventListener('visibilitychange', checkVis);
      canvas.removeEventListener('pointermove', onMove);
      window.removeEventListener('resize', onResize);
      disposables.forEach((d) => d.dispose());
      composer?.dispose?.();
      renderer.dispose();
      const ctx = renderer.getContext();
      const lose = ctx.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
    },
  };
}
