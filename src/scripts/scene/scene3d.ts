/**
 * 3D LiDAR navigation scene (Three.js) — a faithful upgrade of the 2D hero.
 *
 * A robot autonomously drives across a reflective grid floor toward a glowing
 * amber target (your cursor, raycast onto the floor), sensing obstacles with a
 * 36-beam LiDAR sweep, weaving around them, and painting an amber planned-path
 * ribbon — while a sparse point-cloud field drifts overhead (a nod to the
 * DGCNN / PointNet 3D-perception work).
 *
 * Performance: DPR capped at 2, obstacles + points are instanced/batched,
 * the rAF loop pauses off-screen and on tab blur, and everything is disposed
 * on teardown. Palette matches the site tokens exactly.
 */
import * as THREE from 'three';
import type { SceneHandle } from './scene2d';

const COL = {
  bg: 0x060911,
  ground: 0x0a0f1c,
  obstacle: 0x0d1422,
  accent: 0x37e7df,
  accentDeep: 0x16b8b0,
  signal: 0xffc15e,
  faint: 0x5c6a82,
};

// world play-area (XZ), centered at origin
const S = 16; // half-extent
const WORLD = S * 2;
const MAX_SPEED = WORLD * 0.0045 * 1.7;
const SENSE = WORLD * 0.18;
const RANGE = WORLD * 0.3;
const MARGIN = WORLD * 0.07;
const BEAMS = 36;
const TRAIL = 110;
const N_OBST = 9;
const OFF = -7; // camera look-at X offset → pushes the action to the clear right side (text sits left)

interface Obstacle { x: number; z: number; r: number; lit: number; }

export function startScene3d(canvas: HTMLCanvasElement): SceneHandle {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(COL.bg, 26, 74);

  // optional bloom (set up async; until ready, render directly)
  let composer: { render(): void; setSize(w: number, h: number): void; dispose?(): void } | null = null;

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
  camera.position.set(OFF, 15, 25);
  camera.lookAt(OFF, 0, 1);

  // lighting (low-key base; glow comes from emissive + bloom)
  scene.add(new THREE.AmbientLight(0x33455f, 1.15));
  scene.add(new THREE.HemisphereLight(0x4a688f, 0x0a0f1c, 0.5));
  const dir = new THREE.DirectionalLight(0x8aa6d5, 1.0);
  dir.position.set(-8, 14, 6);
  scene.add(dir);

  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(o: T): T => { disposables.push(o); return o; };

  // ---- ground + grid ----
  const groundGeo = track(new THREE.PlaneGeometry(160, 160));
  const groundMat = track(new THREE.MeshStandardMaterial({ color: COL.ground, metalness: 0.6, roughness: 0.55 }));
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const grid = new THREE.GridHelper(120, 60, COL.faint, COL.faint);
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.12;
  grid.position.y = 0.01;
  scene.add(grid);
  track(grid.geometry);
  track(grid.material as THREE.Material);

  // ---- obstacles (instanced) ----
  const rand = (a: number, b: number) => a + Math.random() * (b - a);
  const obstacles: Obstacle[] = [];
  (function build() {
    let tries = 0;
    while (obstacles.length < N_OBST && tries < 500) {
      tries++;
      const o: Obstacle = { x: rand(-S * 0.55, S * 0.92), z: rand(-S * 0.85, S * 0.85), r: rand(0.7, 1.7), lit: 0 };
      let ok = true;
      for (const ob of obstacles) if (Math.hypot(o.x - ob.x, o.z - ob.z) < o.r + ob.r + 2.2) { ok = false; break; }
      if (o.x < -S * 0.5) ok = false; // keep left start clear-ish
      if (ok) obstacles.push(o);
    }
  })();

  const obGeo = track(new THREE.CylinderGeometry(1, 1, 2.4, 6));
  const obMat = track(new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.35, roughness: 0.5, emissive: 0x123a4a, emissiveIntensity: 1.1 }));
  const obMesh = new THREE.InstancedMesh(obGeo, obMat, obstacles.length);
  obMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const dummy = new THREE.Object3D();
  const cBase = new THREE.Color(COL.obstacle);
  const cLit = new THREE.Color(COL.accent);
  const tmpCol = new THREE.Color();
  obstacles.forEach((o, i) => {
    dummy.position.set(o.x, 1.2, o.z);
    dummy.scale.set(o.r, rand(0.7, 1.2), o.r);
    dummy.updateMatrix();
    obMesh.setMatrixAt(i, dummy.matrix);
    obMesh.setColorAt(i, cBase);
  });
  scene.add(obMesh);

  // ---- point cloud field (drifting slab) ----
  const N_PTS = 1600;
  const ptGeo = track(new THREE.BufferGeometry());
  const ptPos = new Float32Array(N_PTS * 3);
  const ptCol = new Float32Array(N_PTS * 3);
  const cFaint = new THREE.Color(COL.faint);
  const cAcc = new THREE.Color(COL.accent);
  for (let i = 0; i < N_PTS; i++) {
    const x = rand(-S * 1.1, S * 1.1);
    const y = rand(6, 16);
    const z = rand(-S * 1.1, S * 1.1);
    ptPos[i * 3] = x; ptPos[i * 3 + 1] = y; ptPos[i * 3 + 2] = z;
    tmpCol.copy(cFaint).lerp(cAcc, (y - 6) / 10 * 0.7);
    ptCol[i * 3] = tmpCol.r; ptCol[i * 3 + 1] = tmpCol.g; ptCol[i * 3 + 2] = tmpCol.b;
  }
  ptGeo.setAttribute('position', new THREE.BufferAttribute(ptPos, 3));
  ptGeo.setAttribute('color', new THREE.BufferAttribute(ptCol, 3));
  const ptMat = track(new THREE.PointsMaterial({ size: 0.12, vertexColors: true, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
  const points = new THREE.Points(ptGeo, ptMat);
  scene.add(points);

  // ---- LiDAR beams (one LineSegments, additive: black = invisible) ----
  const lidarGeo = track(new THREE.BufferGeometry());
  const lidarPos = new Float32Array(BEAMS * 2 * 3);
  const lidarCol = new Float32Array(BEAMS * 2 * 3);
  lidarGeo.setAttribute('position', new THREE.BufferAttribute(lidarPos, 3).setUsage(THREE.DynamicDrawUsage));
  lidarGeo.setAttribute('color', new THREE.BufferAttribute(lidarCol, 3).setUsage(THREE.DynamicDrawUsage));
  const lidarMat = track(new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  const lidar = new THREE.LineSegments(lidarGeo, lidarMat);
  scene.add(lidar);
  const beamNear = new THREE.Color(COL.accent).multiplyScalar(0.9);

  // impact sparks
  const sparkGeo = track(new THREE.BufferGeometry());
  const sparkPos = new Float32Array(BEAMS * 3);
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3).setUsage(THREE.DynamicDrawUsage));
  const sparkMat = track(new THREE.PointsMaterial({ color: COL.accent, size: 0.22, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  const sparks = new THREE.Points(sparkGeo, sparkMat);
  scene.add(sparks);

  // ---- planned-path ribbon (amber line, head→tail fade via additive) ----
  const trail: THREE.Vector3[] = [];
  const pathGeo = track(new THREE.BufferGeometry());
  const pathPos = new Float32Array(TRAIL * 3);
  const pathCol = new Float32Array(TRAIL * 3);
  pathGeo.setAttribute('position', new THREE.BufferAttribute(pathPos, 3).setUsage(THREE.DynamicDrawUsage));
  pathGeo.setAttribute('color', new THREE.BufferAttribute(pathCol, 3).setUsage(THREE.DynamicDrawUsage));
  const pathMat = track(new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  const path = new THREE.Line(pathGeo, pathMat);
  scene.add(path);
  const cSig = new THREE.Color(COL.signal);

  // ---- goal reticle (flat on floor, amber, pulsing) ----
  const reticle = new THREE.Group();
  const ringGeo = track(new THREE.RingGeometry(0.7, 0.86, 40));
  const ringMat = track(new THREE.MeshBasicMaterial({ color: COL.signal, transparent: true, opacity: 0.9, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  const dotGeo = track(new THREE.SphereGeometry(0.12, 10, 10));
  const dotMat = track(new THREE.MeshBasicMaterial({ color: COL.signal }));
  const dot = new THREE.Mesh(dotGeo, dotMat);
  dot.position.y = 0.05;
  reticle.add(ring, dot);
  scene.add(reticle);

  // ---- robot (teal arrow pointing +X) + underglow disc ----
  const robotGroup = new THREE.Group();
  const bodyGeo = track(new THREE.ConeGeometry(0.72, 2.0, 4));
  bodyGeo.rotateZ(-Math.PI / 2); // point +X
  const bodyMat = track(new THREE.MeshStandardMaterial({ color: COL.accent, emissive: COL.accent, emissiveIntensity: 1.0, metalness: 0.2, roughness: 0.35 }));
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  robotGroup.add(body);
  const glowGeo = track(new THREE.CircleGeometry(1.7, 32));
  const glowMat = track(new THREE.MeshBasicMaterial({ color: COL.accent, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false }));
  const glow = new THREE.Mesh(glowGeo, glowMat);
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = -0.55;
  robotGroup.add(glow);
  robotGroup.position.y = 0.7;
  scene.add(robotGroup);

  // range ring on floor
  const rangeGeo = track(new THREE.RingGeometry(RANGE - 0.05, RANGE, 64));
  const rangeMat = track(new THREE.MeshBasicMaterial({ color: COL.accent, transparent: true, opacity: 0.12, side: THREE.DoubleSide }));
  const rangeRing = new THREE.Mesh(rangeGeo, rangeMat);
  rangeRing.rotation.x = -Math.PI / 2;
  rangeRing.position.y = 0.02;
  scene.add(rangeRing);

  // ---- state (XZ steering, ported from the 2D scene) ----
  const robot = { x: S * 0.2, z: 0, vx: 0, vz: 0, heading: 0 };
  const goal = { x: S * 0.5, z: 0 };
  let pointerActive = false;
  let lastMove = 0;
  const ndc = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hitPoint = new THREE.Vector3();

  function rayCircle(ox: number, oz: number, dx: number, dz: number, c: Obstacle, max: number) {
    const fx = ox - c.x, fz = oz - c.z;
    const b = 2 * (fx * dx + fz * dz);
    const cc = fx * fx + fz * fz - c.r * c.r;
    let disc = b * b - 4 * cc;
    if (disc < 0) return max;
    disc = Math.sqrt(disc);
    const t1 = (-b - disc) / 2; if (t1 > 0 && t1 < max) return t1;
    const t2 = (-b + disc) / 2; if (t2 > 0 && t2 < max) return t2;
    return max;
  }

  const telPos = document.getElementById('t-pos');
  const telV = document.getElementById('t-v');
  let telCount = 0;

  // ---- loop ----
  let raf = 0, running = false, last = performance.now(), t0 = performance.now();

  function update(dt: number, now: number) {
    const time = (now - t0) / 1000;
    const k = Math.min(dt * 60, 2); // frame-rate normalization

    // goal: cursor raycast (if recent) else auto-wander
    if (pointerActive && now - lastMove < 2200) {
      raycaster.setFromCamera(ndc, camera);
      if (raycaster.ray.intersectPlane(groundPlane, hitPoint)) {
        goal.x = THREE.MathUtils.clamp(hitPoint.x, -3, S);
        goal.z = THREE.MathUtils.clamp(hitPoint.z, -S, S);
      }
    } else {
      // wander biased to the right half so the robot lives next to the text
      goal.x = S * 0.35 + S * 0.5 * Math.sin(time * 0.35);
      goal.z = S * 0.62 * Math.sin(time * 0.55 + 1.3);
    }

    // seek
    const sx = goal.x - robot.x, sz = goal.z - robot.z;
    const sd = Math.hypot(sx, sz) || 1;
    let dvx = (sx / sd) * MAX_SPEED, dvz = (sz / sd) * MAX_SPEED;

    // obstacle repulsion
    for (const o of obstacles) {
      const ox = robot.x - o.x, oz = robot.z - o.z, od = Math.hypot(ox, oz);
      const influence = o.r + SENSE;
      if (od < influence && od > 0.1) {
        let f = 1 - od / influence;
        f = f * f * MAX_SPEED * 3.4;
        dvx += (ox / od) * f; dvz += (oz / od) * f;
      }
    }
    // boundary push — left bound (XL) keeps the robot in the clear right zone
    const XL = -3;
    if (robot.x < XL + MARGIN) dvx += (XL + MARGIN - robot.x) * 0.09;
    if (robot.x > S - MARGIN) dvx -= (robot.x - (S - MARGIN)) * 0.06;
    if (robot.z < -S + MARGIN) dvz += (-S + MARGIN - robot.z) * 0.05;
    if (robot.z > S - MARGIN) dvz -= (robot.z - (S - MARGIN)) * 0.05;

    // smooth + clamp + integrate
    robot.vx += (dvx - robot.vx) * 0.08 * k;
    robot.vz += (dvz - robot.vz) * 0.08 * k;
    const sp = Math.hypot(robot.vx, robot.vz);
    if (sp > MAX_SPEED) { robot.vx = (robot.vx / sp) * MAX_SPEED; robot.vz = (robot.vz / sp) * MAX_SPEED; }
    robot.x += robot.vx * k; robot.z += robot.vz * k;
    if (sp > 0.005) robot.heading = Math.atan2(robot.vz, robot.vx);

    robotGroup.position.x = robot.x;
    robotGroup.position.z = robot.z;
    robotGroup.position.y = 0.7 + Math.sin(time * 2.4) * 0.06;
    robotGroup.rotation.y = -robot.heading; // align +X arrow to heading on XZ

    rangeRing.position.x = robot.x; rangeRing.position.z = robot.z;

    // trail → path ribbon
    trail.push(new THREE.Vector3(robot.x, 0.08, robot.z));
    if (trail.length > TRAIL) trail.shift();
    for (let i = 0; i < TRAIL; i++) {
      const p = trail[i] ?? trail[0] ?? robotGroup.position;
      pathPos[i * 3] = p.x; pathPos[i * 3 + 1] = p.y; pathPos[i * 3 + 2] = p.z;
      const a = trail.length > 1 ? i / trail.length : 0; // head (new) brighter
      tmpCol.copy(cSig).multiplyScalar(a * 0.85);
      pathCol[i * 3] = tmpCol.r; pathCol[i * 3 + 1] = tmpCol.g; pathCol[i * 3 + 2] = tmpCol.b;
    }
    pathGeo.attributes.position.needsUpdate = true;
    pathGeo.attributes.color.needsUpdate = true;
    pathGeo.setDrawRange(0, trail.length);

    // LiDAR sweep
    let sparkN = 0;
    for (let bI = 0; bI < BEAMS; bI++) {
      const ang = (bI / BEAMS) * Math.PI * 2;
      const dx = Math.cos(ang), dz = Math.sin(ang);
      let dist = RANGE, hit = -1;
      for (let j = 0; j < obstacles.length; j++) {
        const d = rayCircle(robot.x, robot.z, dx, dz, obstacles[j], dist);
        if (d < dist) { dist = d; hit = j; }
      }
      const ex = robot.x + dx * dist, ez = robot.z + dz * dist;
      const a = bI * 2, b2 = bI * 2 + 1;
      lidarPos[a * 3] = robot.x; lidarPos[a * 3 + 1] = 0.5; lidarPos[a * 3 + 2] = robot.z;
      lidarPos[b2 * 3] = ex; lidarPos[b2 * 3 + 1] = 0.5; lidarPos[b2 * 3 + 2] = ez;
      lidarCol[a * 3] = beamNear.r; lidarCol[a * 3 + 1] = beamNear.g; lidarCol[a * 3 + 2] = beamNear.b;
      lidarCol[b2 * 3] = 0; lidarCol[b2 * 3 + 1] = 0; lidarCol[b2 * 3 + 2] = 0; // far → invisible
      if (hit >= 0) {
        obstacles[hit].lit = Math.min(1, obstacles[hit].lit + 0.25);
        sparkPos[sparkN * 3] = ex; sparkPos[sparkN * 3 + 1] = 0.5; sparkPos[sparkN * 3 + 2] = ez;
        sparkN++;
      }
    }
    lidarGeo.attributes.position.needsUpdate = true;
    lidarGeo.attributes.color.needsUpdate = true;
    sparkGeo.attributes.position.needsUpdate = true;
    sparkGeo.setDrawRange(0, sparkN);

    // obstacle lit decay → instance colors
    let colorsDirty = false;
    obstacles.forEach((o, i) => {
      if (o.lit > 0.001) { o.lit *= 0.94; colorsDirty = true; }
      tmpCol.copy(cBase).lerp(cLit, o.lit);
      obMesh.setColorAt(i, tmpCol);
    });
    if (colorsDirty && obMesh.instanceColor) obMesh.instanceColor.needsUpdate = true;

    // goal reticle
    reticle.position.set(goal.x, 0.03, goal.z);
    const pulse = 1 + Math.sin(time * 4) * 0.14;
    ring.scale.set(pulse, pulse, pulse);

    // point cloud drift
    points.rotation.y = time * 0.02;

    // gentle camera orbit + pointer parallax (kept around the offset so the
    // robot stays in the clear right-hand zone next to the hero text)
    const az = Math.sin(time * 0.05) * 0.06;
    camera.position.x = OFF + Math.sin(az) * 25 + ndc.x * 1.4;
    camera.position.z = Math.cos(az) * 25;
    camera.position.y = 15 + ndc.y * 0.8;
    camera.lookAt(OFF, 0, 1);

    // telemetry
    telCount++;
    if (telCount % 6 === 0 && telPos && telV) {
      telPos.textContent = `[${(robot.x / S).toFixed(2)}, ${(robot.z / S).toFixed(2)}]`;
      telV.textContent = (sp / MAX_SPEED).toFixed(2);
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

  // set up bloom asynchronously; falls back silently to direct render
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
      c.addPass(new UnrealBloomPass(new THREE.Vector2(r.width, r.height), 0.7, 0.5, 0.3));
      c.addPass(new OutputPass());
      c.setSize(r.width, r.height);
      composer = c;
    } catch {
      /* keep direct render */
    }
  })();

  // ---- events ----
  const onMove = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    pointerActive = true; lastMove = performance.now();
  };
  const onLeave = () => { pointerActive = false; };
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerleave', onLeave);

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
      canvas.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('resize', onResize);
      obMesh.dispose();
      disposables.forEach((d) => d.dispose());
      composer?.dispose?.();
      renderer.dispose();
      const ctx = renderer.getContext();
      const lose = ctx.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
    },
  };
}
