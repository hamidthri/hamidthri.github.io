/**
 * HERO — robot navigation + LiDAR scan (2D canvas).
 * The robot steers toward the cursor (its goal), sensing and avoiding
 * obstacles, casting LiDAR beams. The STEERING / PHYSICS is a faithful,
 * byte-for-byte port of the scene in the original index.html
 * (maxSpeed = min(W,H)*0.0045, per-frame integration, 36 beams).
 *
 * RENDERING is fully themed: every colour is read from CSS custom properties
 * (the --sc-* tokens), and the compositing flips between additive "glow" on the
 * dark theme and normal "ink" drawing on the light theme — so the same scene
 * reads as neon-on-black or ink-on-white. It re-reads the palette live on the
 * `themechange` event dispatched by the theme toggle.
 */
export interface SceneHandle {
  dispose(): void;
}

interface Obstacle { x: number; y: number; r: number; lit: number; }
interface Robot { x: number; y: number; vx: number; vy: number; heading: number; }

type Palette = ReturnType<typeof readPalette>;

const root = document.documentElement;

function readPalette() {
  const cs = getComputedStyle(root);
  const v = (name: string, fallback: string) => (cs.getPropertyValue(name) || fallback).trim();
  const dark = root.getAttribute('data-theme') !== 'light';
  return {
    dark,
    glow: (dark ? 'lighter' : 'source-over') as GlobalCompositeOperation,
    accent: v('--accent', '#37e7df'),
    signal: v('--signal', '#ffc15e'),
    beam: v('--sc-beam', '55,231,223'),
    spark: v('--sc-spark', '150,255,248'),
    sparkCore: v('--sc-spark-core', '#eafffe'),
    nodeFrom: v('--sc-node-from', '22,34,56'),
    nodeTo: v('--sc-node-to', '8,13,24'),
    nodeStroke: v('--sc-node-stroke', '55,231,223'),
    trail: v('--sc-trail', '255,200,120'),
    hullFrom: v('--sc-hull-from', '9,28,38'),
    hullTo: v('--sc-hull-to', '24,104,108'),
    eye: v('--sc-eye', '#eafffe'),
    wing: v('--sc-wing', '150,255,248'),
    goal: v('--sc-goal', '255,193,94'),
    goalCore: v('--sc-goal-core', '#fffaf0'),
  };
}

export function startScene2d(
  canvas: HTMLCanvasElement,
  opts: { reduced?: boolean } = {},
): SceneHandle {
  const reduce = opts.reduced ?? false;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  let W = 0, H = 0;
  let obstacles: Obstacle[] = [];
  let robot: Robot | undefined;
  let goal: { x: number; y: number } | undefined;
  let trail: { x: number; y: number }[] = [];
  let mouseInside = false;
  let t0 = performance.now();
  const BEAMS = 36;

  // ---- render-only state (no effect on the simulation) ----
  let prevHeading = 0;        // for the banking lean
  let bank = 0;               // smoothed turn lean of the craft
  let pulses: { born: number }[] = []; // shock rings emitted by the goal
  let lastPulse = -99;
  let P: Palette = readPalette();

  function rand(a: number, b: number) { return a + Math.random() * (b - a); }
  function angDiff(a: number, b: number) {
    let d = a - b;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  function buildObstacles() {
    obstacles = [];
    const count = W < 760 ? 6 : 9;
    let tries = 0;
    while (obstacles.length < count && tries < 400) {
      tries++;
      const o: Obstacle = { x: rand(W * 0.30, W * 0.97), y: rand(H * 0.12, H * 0.9), r: rand(Math.min(W, H) * 0.018, Math.min(W, H) * 0.05), lit: 0 };
      let ok = true;
      for (let i = 0; i < obstacles.length; i++) {
        const dx = o.x - obstacles[i].x, dy = o.y - obstacles[i].y;
        if (Math.hypot(dx, dy) < o.r + obstacles[i].r + 40) { ok = false; break; }
      }
      // keep spawn area (left) clear-ish for the robot start
      if (o.x < W * 0.30) ok = false;
      if (ok) obstacles.push(o);
    }
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    W = rect.width; H = rect.height;
    canvas.width = W * DPR; canvas.height = H * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    buildObstacles();
    if (!robot) robot = { x: W * 0.16, y: H * 0.55, vx: 0, vy: 0, heading: 0 };
    if (!goal) goal = { x: W * 0.7, y: H * 0.4 };
  }

  const onMove = (e: MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    goal!.x = e.clientX - rect.left; goal!.y = e.clientY - rect.top; mouseInside = true;
  };
  const onLeave = () => { mouseInside = false; };
  canvas.addEventListener('mousemove', onMove);
  canvas.addEventListener('mouseleave', onLeave);

  // ray vs circle: distance along ray dir to first hit (or max)
  function rayCircle(ox: number, oy: number, dx: number, dy: number, c: Obstacle, max: number) {
    const fx = ox - c.x, fy = oy - c.y;
    const b = 2 * (fx * dx + fy * dy);
    const cc = (fx * fx + fy * fy) - c.r * c.r;
    let disc = b * b - 4 * cc;
    if (disc < 0) return max;
    disc = Math.sqrt(disc);
    const t1 = (-b - disc) / 2;
    if (t1 > 0 && t1 < max) return t1;
    const t2 = (-b + disc) / 2;
    if (t2 > 0 && t2 < max) return t2;
    return max;
  }

  const telPos = document.getElementById('t-pos');
  const telV = document.getElementById('t-v');
  let telCount = 0;
  let rafId = 0;

  function step(now: number) {
    const time = (now - t0) / 1000;
    const r = robot!, g = goal!;

    // auto-wander goal when idle
    if (!mouseInside) {
      g.x = W * (0.62 + 0.26 * Math.sin(time * 0.35));
      g.y = H * (0.5 + 0.34 * Math.sin(time * 0.55 + 1.3));
    }

    // ---- steering: seek + obstacle avoidance + boundary ---- (UNCHANGED PHYSICS)
    const maxSpeed = Math.min(W, H) * 0.0045;
    const sx = g.x - r.x, sy = g.y - r.y;
    const sd = Math.hypot(sx, sy) || 1;
    let dvx = (sx / sd) * maxSpeed, dvy = (sy / sd) * maxSpeed;

    const sense = Math.min(W, H) * 0.18;
    for (let i = 0; i < obstacles.length; i++) {
      const o = obstacles[i];
      const ox = r.x - o.x, oy = r.y - o.y, od = Math.hypot(ox, oy);
      const influence = o.r + sense;
      if (od < influence && od > 0.1) {
        let f = (1 - (od / influence));
        f = f * f * maxSpeed * 3.4;
        dvx += (ox / od) * f; dvy += (oy / od) * f;
      }
    }
    // boundary push
    const m = Math.min(W, H) * 0.07;
    if (r.x < m) dvx += (m - r.x) * 0.02;
    if (r.x > W - m) dvx -= (r.x - (W - m)) * 0.02;
    if (r.y < m) dvy += (m - r.y) * 0.02;
    if (r.y > H - m) dvy -= (r.y - (H - m)) * 0.02;

    // smooth + clamp
    r.vx += (dvx - r.vx) * 0.08;
    r.vy += (dvy - r.vy) * 0.08;
    const sp = Math.hypot(r.vx, r.vy);
    if (sp > maxSpeed) { r.vx = r.vx / sp * maxSpeed; r.vy = r.vy / sp * maxSpeed; }
    r.x += r.vx; r.y += r.vy;
    if (sp > 0.01) r.heading = Math.atan2(r.vy, r.vx);

    // trail
    trail.push({ x: r.x, y: r.y });
    if (trail.length > 110) trail.shift();

    // banking lean from how sharply the craft is turning (render only)
    const turn = angDiff(r.heading, prevHeading);
    prevHeading = r.heading;
    const targetBank = Math.max(-0.6, Math.min(0.6, turn * 9));
    bank += (targetBank - bank) * 0.12;

    const spN = Math.min(1, sp / maxSpeed); // normalised speed 0..1
    const GLOW = P.glow;

    // ===========================================================
    //  DRAW
    // ===========================================================
    ctx.clearRect(0, 0, W, H);

    // ---- path trail: glowing twin-pass ribbon ----
    if (trail.length > 1) {
      ctx.save();
      ctx.globalCompositeOperation = GLOW;
      ctx.lineCap = 'round';
      // soft outer glow
      for (let k = 1; k < trail.length; k++) {
        const a = k / trail.length;
        ctx.beginPath();
        ctx.moveTo(trail[k - 1].x, trail[k - 1].y);
        ctx.lineTo(trail[k].x, trail[k].y);
        ctx.strokeStyle = 'rgba(' + P.trail + ',' + (a * 0.16) + ')';
        ctx.lineWidth = 5 * a + 0.5;
        ctx.stroke();
      }
      // bright core
      for (let k = 1; k < trail.length; k++) {
        const a = k / trail.length;
        ctx.beginPath();
        ctx.moveTo(trail[k - 1].x, trail[k - 1].y);
        ctx.lineTo(trail[k].x, trail[k].y);
        ctx.strokeStyle = 'rgba(' + P.trail + ',' + (a * 0.6) + ')';
        ctx.lineWidth = 1.3 * a + 0.3;
        ctx.stroke();
      }
      ctx.restore();
    }

    // ---- LiDAR beams ----
    const range = Math.min(W, H) * 0.30;
    ctx.save();
    ctx.globalCompositeOperation = GLOW;
    for (let bI = 0; bI < BEAMS; bI++) {
      const ang = (bI / BEAMS) * Math.PI * 2;
      const dx = Math.cos(ang), dy = Math.sin(ang);
      let dist = range;
      let hitObs = -1;
      for (let j = 0; j < obstacles.length; j++) {
        const d = rayCircle(r.x, r.y, dx, dy, obstacles[j], dist);
        if (d < dist) { dist = d; hitObs = j; }
      }
      const ex = r.x + dx * dist, ey = r.y + dy * dist;
      const grad = ctx.createLinearGradient(r.x, r.y, ex, ey);
      grad.addColorStop(0, 'rgba(' + P.beam + ',0.24)');
      grad.addColorStop(1, 'rgba(' + P.beam + ',0)');
      ctx.beginPath(); ctx.moveTo(r.x, r.y); ctx.lineTo(ex, ey);
      ctx.strokeStyle = grad; ctx.lineWidth = 1; ctx.stroke();
      if (hitObs >= 0) {
        obstacles[hitObs].lit = Math.min(1, obstacles[hitObs].lit + 0.25);
        ctx.beginPath(); ctx.arc(ex, ey, 2.4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(' + P.spark + ',0.9)'; ctx.fill();
        ctx.beginPath(); ctx.arc(ex, ey, 1.3, 0, Math.PI * 2);
        ctx.fillStyle = P.sparkCore; ctx.fill();
      }
    }
    ctx.restore();

    // ---- obstacles: tech nodes ----
    for (let oi = 0; oi < obstacles.length; oi++) {
      const ob = obstacles[oi];
      ob.lit *= 0.94;
      const og = ctx.createRadialGradient(ob.x - ob.r * 0.35, ob.y - ob.r * 0.35, ob.r * 0.1, ob.x, ob.y, ob.r);
      og.addColorStop(0, 'rgba(' + P.nodeFrom + ',0.95)');
      og.addColorStop(1, 'rgba(' + P.nodeTo + ',0.92)');
      ctx.beginPath(); ctx.arc(ob.x, ob.y, ob.r, 0, Math.PI * 2);
      ctx.fillStyle = og; ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = 'rgba(' + P.nodeStroke + ',' + (0.18 + ob.lit * 0.7) + ')';
      ctx.stroke();
      // inner detail ring
      ctx.beginPath(); ctx.arc(ob.x, ob.y, ob.r * 0.58, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(' + P.nodeStroke + ',' + (0.07 + ob.lit * 0.35) + ')';
      ctx.lineWidth = 1; ctx.stroke();
      if (ob.lit > 0.04) {
        ctx.save();
        ctx.globalCompositeOperation = GLOW;
        ctx.beginPath(); ctx.arc(ob.x, ob.y, ob.r + 4 + ob.lit * 6, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(' + P.spark + ',' + (ob.lit * 0.35) + ')'; ctx.lineWidth = 1.4; ctx.stroke();
        ctx.restore();
      }
    }

    // ===========================================================
    //  GOAL — target-lock energy orb (the "moving object")
    // ===========================================================
    // emit a shock ring periodically
    if (time - lastPulse > 1.25) {
      lastPulse = time;
      pulses.push({ born: time });
      if (pulses.length > 4) pulses.shift();
    }
    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.globalCompositeOperation = GLOW;

    // expanding shock rings
    for (let pi = 0; pi < pulses.length; pi++) {
      const age = time - pulses[pi].born;
      const pr = age * 64;
      const al = 0.45 - age * 0.6;
      if (al <= 0) continue;
      ctx.beginPath(); ctx.arc(0, 0, pr, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(' + P.goal + ',' + al + ')';
      ctx.lineWidth = 1.4; ctx.stroke();
    }

    // energy core
    const corePulse = 4.5 + Math.sin(time * 4) * 1.4;
    const cg = ctx.createRadialGradient(0, 0, 0, 0, 0, corePulse + 9);
    cg.addColorStop(0, 'rgba(' + P.goal + ',0.92)');
    cg.addColorStop(0.4, 'rgba(' + P.goal + ',0.5)');
    cg.addColorStop(1, 'rgba(' + P.goal + ',0)');
    ctx.beginPath(); ctx.arc(0, 0, corePulse + 9, 0, Math.PI * 2);
    ctx.fillStyle = cg; ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, 2, 0, Math.PI * 2);
    ctx.fillStyle = P.goalCore; ctx.fill();

    // rotating segmented ring
    ctx.save();
    ctx.rotate(time * 0.9);
    ctx.setLineDash([6, 7]);
    ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(' + P.goal + ',0.85)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();
    // inner counter-rotating ring
    ctx.save();
    ctx.rotate(-time * 1.4);
    ctx.setLineDash([3, 5]);
    ctx.beginPath(); ctx.arc(0, 0, 8.5, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(' + P.goal + ',0.6)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
    ctx.setLineDash([]);

    // rotating lock brackets
    const br = 18 + Math.sin(time * 4) * 2;
    ctx.save();
    ctx.rotate(time * 0.3);
    ctx.strokeStyle = P.signal; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    for (let c = 0; c < 4; c++) {
      ctx.save();
      ctx.rotate(c * Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(br, br - 6); ctx.lineTo(br, br); ctx.lineTo(br - 6, br);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();

    // orbiting motes
    for (let o = 0; o < 3; o++) {
      const a = time * 1.6 + o * (Math.PI * 2 / 3);
      const px = Math.cos(a) * 13, py = Math.sin(a) * 13;
      ctx.beginPath(); ctx.arc(px, py, 1.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgb(' + P.goal + ')'; ctx.fill();
    }
    ctx.restore();

    // ===========================================================
    //  ROBOT — sci-fi survey craft (the "robot")
    // ===========================================================
    // range ring (rotating dashed tech ring, under the craft)
    ctx.save();
    ctx.translate(r.x, r.y);
    ctx.globalCompositeOperation = GLOW;

    ctx.save();
    ctx.rotate(time * 0.15);
    ctx.setLineDash([4, 10]);
    ctx.beginPath(); ctx.arc(0, 0, range, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(' + P.beam + ',0.08)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
    ctx.setLineDash([]);

    // spinning scanner rings hugging the craft
    for (let ri = 0; ri < 2; ri++) {
      const dir = ri === 0 ? 1 : -1;
      const rad = 16 + ri * 7;
      ctx.save();
      ctx.rotate(time * (0.7 + ri * 0.6) * dir);
      ctx.setLineDash([rad * 0.5, rad * 0.95]);
      ctx.beginPath(); ctx.arc(0, 0, rad, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(' + P.beam + ',' + (0.4 - ri * 0.16) + ')';
      ctx.lineWidth = 1.1; ctx.stroke();
      ctx.restore();
    }
    ctx.setLineDash([]);
    ctx.restore();

    // craft body (heading-aligned, banking)
    ctx.save();
    ctx.translate(r.x, r.y);
    ctx.rotate(r.heading);

    // thruster plume (additive on dark, behind the hull)
    const plume = 14 + spN * 24 + Math.sin(time * 28) * 2;
    ctx.save();
    ctx.globalCompositeOperation = GLOW;
    const pg = ctx.createLinearGradient(-6, 0, -6 - plume, 0);
    pg.addColorStop(0, 'rgba(' + P.spark + ',' + (0.45 * spN + 0.18) + ')');
    pg.addColorStop(0.5, 'rgba(' + P.beam + ',0.18)');
    pg.addColorStop(1, 'rgba(' + P.beam + ',0)');
    ctx.beginPath();
    ctx.moveTo(-5, 4.5); ctx.lineTo(-6 - plume, 0); ctx.lineTo(-5, -4.5); ctx.closePath();
    ctx.fillStyle = pg; ctx.fill();
    ctx.restore();

    // banking lean (shear x by y) — reads as tilting into the turn
    ctx.transform(1, 0, bank * 0.5, 1, 0, 0);

    // hull
    ctx.shadowColor = P.accent; ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(4, 7);
    ctx.lineTo(-8, 9);
    ctx.lineTo(-6, 0);
    ctx.lineTo(-8, -9);
    ctx.lineTo(4, -7);
    ctx.closePath();
    const hg = ctx.createLinearGradient(-8, 0, 16, 0);
    hg.addColorStop(0, 'rgba(' + P.hullFrom + ',0.96)');
    hg.addColorStop(1, 'rgba(' + P.hullTo + ',0.96)');
    ctx.fillStyle = hg; ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1.4; ctx.strokeStyle = P.accent; ctx.stroke();

    // wing struts
    ctx.beginPath();
    ctx.moveTo(2, 5); ctx.lineTo(-6, 7);
    ctx.moveTo(2, -5); ctx.lineTo(-6, -7);
    ctx.strokeStyle = 'rgba(' + P.wing + ',0.7)'; ctx.lineWidth = 1; ctx.stroke();

    // sensor eye (pulsing core near the nose)
    const eye = 2 + Math.sin(time * 5) * 0.5;
    ctx.save();
    ctx.globalCompositeOperation = GLOW;
    ctx.beginPath(); ctx.arc(6.5, 0, eye + 3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(' + P.spark + ',0.25)'; ctx.fill();
    ctx.restore();
    ctx.beginPath(); ctx.arc(6.5, 0, eye, 0, Math.PI * 2);
    ctx.shadowColor = P.accent; ctx.shadowBlur = 10;
    ctx.fillStyle = P.eye; ctx.fill();
    ctx.shadowBlur = 0;

    ctx.restore();

    // telemetry (throttled) — UNCHANGED
    telCount++;
    if (telCount % 6 === 0 && telPos && telV) {
      telPos.textContent = '[' + ((r.x / W * 2 - 1).toFixed(2)) + ', ' + ((r.y / H * 2 - 1) * -1).toFixed(2) + ']';
      telV.textContent = (sp / maxSpeed).toFixed(2);
    }

    rafId = requestAnimationFrame(step);
  }

  function start() {
    resize();
    if (rafId) cancelAnimationFrame(rafId);
    if (reduce) { // draw a single static-ish frame, no loop
      t0 = performance.now(); step(performance.now()); cancelAnimationFrame(rafId);
    } else {
      t0 = performance.now(); rafId = requestAnimationFrame(step);
    }
  }

  let rt = 0;
  const onResize = () => { clearTimeout(rt); rt = window.setTimeout(start, 200); };
  window.addEventListener('resize', onResize);

  // re-read the palette when the theme toggles (and repaint once if paused)
  const onTheme = () => {
    P = readPalette();
    if (reduce) { step(performance.now()); cancelAnimationFrame(rafId); }
  };
  window.addEventListener('themechange', onTheme);

  start();

  return {
    dispose() {
      cancelAnimationFrame(rafId);
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mouseleave', onLeave);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('themechange', onTheme);
    },
  };
}
