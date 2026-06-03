/**
 * 3D space scene (Three.js) — a realistic starfield with the Milky Way band,
 * soft nebulae, and procedurally-textured planets (an ocean/cloud world, a
 * ringed gas giant, a rocky world) lit by a directional sun for a real
 * day/night terminator. Self-contained: no external texture files.
 *
 * Performance: DPR capped at 2, stars are one Points cloud, planet textures are
 * generated once at modest resolution, the loop pauses off-screen / on blur,
 * everything is disposed on teardown, bloom is lazy.
 */
import * as THREE from 'three';
import type { SceneHandle } from './scene2d';
import { makePlanet, type PlanetHandle } from './planets';

const COL = {
  bg: 0x060911,
  accent: 0x37e7df,
  signal: 0xffc15e,
  star: 0xdfe9ff,
  indigo: 0x3a2f6a,
  teal: 0x1c6f86,
};

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

  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 800);
  camera.position.set(0, 0, 55);
  camera.lookAt(0, 0, -10);

  // realistic sun lighting → clear day/night terminator on the planets
  scene.add(new THREE.AmbientLight(0x0f1830, 0.32));
  const sun = new THREE.DirectionalLight(0xfff2e0, 2.4);
  sun.position.set(-55, 24, 60);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0x1a2740, 0x05070d, 0.25));

  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(o: T): T => { disposables.push(o); return o; };
  const rand = (a: number, b: number) => a + Math.random() * (b - a);
  const tmp = new THREE.Color();

  // ---- starfield (uniform shell) + Milky Way band, one Points cloud ----
  const N_UNIFORM = 5400;
  const N_BAND = 3400;
  const N = N_UNIFORM + N_BAND;
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  const cStar = new THREE.Color(COL.star);
  const cAcc = new THREE.Color(COL.accent);
  const cSig = new THREE.Color(COL.signal);

  function starColor(i: number, warm = 0) {
    const r = Math.random();
    if (r < 0.1 + warm) tmp.copy(cAcc);
    else if (r < 0.17 + warm) tmp.copy(cSig);
    else tmp.copy(cStar);
    const b = rand(0.4, 1);
    col[i * 3] = tmp.r * b; col[i * 3 + 1] = tmp.g * b; col[i * 3 + 2] = tmp.b * b;
  }
  for (let i = 0; i < N_UNIFORM; i++) {
    const r = rand(80, 320);
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(rand(-1, 1));
    pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
    pos[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th);
    pos[i * 3 + 2] = r * Math.cos(ph);
    starColor(i);
  }
  for (let k = 0; k < N_BAND; k++) {
    const i = N_UNIFORM + k;
    const r = rand(70, 340);
    const th = Math.random() * Math.PI * 2;
    const thickness = (Math.random() + Math.random() + Math.random() - 1.5) * 28;
    pos[i * 3] = r * Math.cos(th);
    pos[i * 3 + 1] = thickness;
    pos[i * 3 + 2] = r * Math.sin(th);
    starColor(i, 0.05);
  }
  const starGeo = track(new THREE.BufferGeometry());
  starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  starGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const starTex = track(softTexture());
  const starMat = track(new THREE.PointsMaterial({
    size: 1.8, map: starTex, vertexColors: true, transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  }));
  const galaxy = new THREE.Group();
  galaxy.rotation.set(0.52, 0.2, 0.4);
  galaxy.add(new THREE.Points(starGeo, starMat));
  scene.add(galaxy);

  // ---- nebula clouds along the band ----
  const nebTex = track(softTexture());
  const nebColors = [COL.indigo, COL.teal, 0x5a3070, COL.indigo, 0x1c6f86];
  for (let i = 0; i < nebColors.length; i++) {
    const mat = track(new THREE.SpriteMaterial({ map: nebTex, color: nebColors[i], transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false }));
    const s = new THREE.Sprite(mat);
    const ang = (i / nebColors.length) * Math.PI * 2 + rand(-0.3, 0.3);
    const r = rand(70, 170);
    s.position.set(Math.cos(ang) * r, rand(-34, 34), Math.sin(ang) * r - 40);
    const sc = rand(110, 190);
    s.scale.set(sc, sc, 1);
    galaxy.add(s);
  }

  // ---- realistic planets ----
  const planets: PlanetHandle[] = [];
  function addPlanet(p: PlanetHandle) { planets.push(p); p.disposables.forEach((d) => disposables.push(d)); scene.add(p.group); }

  // focal ocean/cloud world — right side (clear zone next to hero text)
  addPlanet(makePlanet({ type: 'terran', radius: 8.5, position: [19, -2, 5], clouds: true, atmosphere: 0x4fb8e0, tilt: 0.4, spin: 0.05 }));
  // ringed gas giant — upper-left, far (depth behind the text)
  addPlanet(makePlanet({ type: 'gas', radius: 13, position: [-30, 12, -85], palette: 'saturn', rings: 0xe6d6ad, tilt: 0.55, spin: 0.04 }));
  // distant rocky world
  addPlanet(makePlanet({ type: 'rocky', radius: 4.2, position: [34, -12, -120], palette: 'mars', tilt: 0.3, spin: 0.06 }));

  // shooting star (occasional)
  const shootGeo = track(new THREE.BufferGeometry());
  shootGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const shootMat = track(new THREE.LineBasicMaterial({ color: COL.star, transparent: true, opacity: 0, blending: THREE.AdditiveBlending }));
  scene.add(new THREE.Line(shootGeo, shootMat));
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
  const tgt = { x: 0, y: 0 };

  function update(dt: number, now: number) {
    const t = (now - t0) / 1000;
    const k = Math.min(dt * 60, 3);
    galaxy.rotation.y += 0.0003 * k;
    for (const p of planets) p.update(dt);

    tgt.x += (ndc.x * 6 - tgt.x) * 0.03 * k;
    tgt.y += (ndc.y * 4 - tgt.y) * 0.03 * k;
    camera.position.x = tgt.x + Math.sin(t * 0.05) * 2;
    camera.position.y = tgt.y + Math.cos(t * 0.04) * 1.5;
    camera.lookAt(0, 0, -10);

    shootT -= dt;
    if (shootLife > 0) {
      shootLife -= dt;
      shootMat.opacity = Math.max(0, shootLife / 0.6);
      sp0.addScaledVector(spDir, 70 * dt);
      const arr = shootGeo.attributes.position.array as Float32Array;
      arr[0] = sp0.x; arr[1] = sp0.y; arr[2] = sp0.z;
      arr[3] = sp0.x - spDir.x * 9; arr[4] = sp0.y - spDir.y * 9; arr[5] = sp0.z - spDir.z * 9;
      shootGeo.attributes.position.needsUpdate = true;
    } else if (shootT <= 0) {
      shootT = rand(5, 12); shootLife = 0.6;
      sp0.set(rand(20, 70), rand(15, 45), rand(-20, 20));
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

  // bloom (async, lazy) — only the brightest things (stars, atmosphere rims) glow
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
      c.addPass(new UnrealBloomPass(new THREE.Vector2(r.width, r.height), 0.6, 0.5, 0.6));
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
