/**
 * 2D LiDAR navigation scene — the original canvas hero, modularized.
 * A robot steers toward the cursor (its goal), senses & avoids obstacles
 * with 36 LiDAR beams, and draws an amber planned-path trail.
 *
 * Used directly as the graceful fallback when WebGL/3D is unavailable, on
 * reduced-motion, or on low-power devices. Returns a disposer.
 */
export interface SceneHandle {
  dispose(): void;
}

interface Obstacle { x: number; y: number; r: number; lit: number; }

export function startScene2d(
  canvas: HTMLCanvasElement,
  opts: { reduced?: boolean; quality?: 'high' | 'low' } = {},
): SceneHandle {
  const reduced = opts.reduced ?? false;
  const low = opts.quality === 'low';
  const ctx = canvas.getContext('2d')!;
  const DPR = Math.min(window.devicePixelRatio || 1, low ? 1.5 : 2);
  const BEAMS = low ? 24 : 36;

  let W = 0, H = 0;
  let obstacles: Obstacle[] = [];
  let robot = { x: 0, y: 0, vx: 0, vy: 0, heading: 0 };
  let goal = { x: 0, y: 0 };
  let trail: { x: number; y: number }[] = [];
  let mouseInside = false;
  let t0 = performance.now();
  let rafId = 0;
  let running = false;

  const css = getComputedStyle(document.documentElement);
  const ACC = (css.getPropertyValue('--accent') || '#37e7df').trim();
  const SIG = (css.getPropertyValue('--signal') || '#ffc15e').trim();

  const telPos = document.getElementById('t-pos');
  const telV = document.getElementById('t-v');
  let telCount = 0;

  const rand = (a: number, b: number) => a + Math.random() * (b - a);

  function buildObstacles() {
    obstacles = [];
    const count = (W < 760 ? 6 : 9) - (low ? 2 : 0);
    let tries = 0;
    while (obstacles.length < count && tries < 400) {
      tries++;
      const o: Obstacle = {
        x: rand(W * 0.3, W * 0.97),
        y: rand(H * 0.12, H * 0.9),
        r: rand(Math.min(W, H) * 0.018, Math.min(W, H) * 0.05),
        lit: 0,
      };
      let ok = true;
      for (const ob of obstacles) {
        if (Math.hypot(o.x - ob.x, o.y - ob.y) < o.r + ob.r + 40) { ok = false; break; }
      }
      if (o.x < W * 0.3) ok = false;
      if (ok) obstacles.push(o);
    }
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    W = rect.width; H = rect.height;
    canvas.width = W * DPR; canvas.height = H * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    buildObstacles();
    robot = { x: W * 0.16, y: H * 0.55, vx: 0, vy: 0, heading: 0 };
    goal = { x: W * 0.7, y: H * 0.4 };
    trail = [];
  }

  function rayCircle(ox: number, oy: number, dx: number, dy: number, c: Obstacle, max: number) {
    const fx = ox - c.x, fy = oy - c.y;
    const b = 2 * (fx * dx + fy * dy);
    const cc = fx * fx + fy * fy - c.r * c.r;
    let disc = b * b - 4 * cc;
    if (disc < 0) return max;
    disc = Math.sqrt(disc);
    const t1 = (-b - disc) / 2;
    if (t1 > 0 && t1 < max) return t1;
    const t2 = (-b + disc) / 2;
    if (t2 > 0 && t2 < max) return t2;
    return max;
  }

  function step(now: number) {
    const time = (now - t0) / 1000;
    if (!mouseInside) {
      goal.x = W * (0.62 + 0.26 * Math.sin(time * 0.35));
      goal.y = H * (0.5 + 0.34 * Math.sin(time * 0.55 + 1.3));
    }

    const maxSpeed = Math.min(W, H) * 0.0045;
    const sx = goal.x - robot.x, sy = goal.y - robot.y;
    const sd = Math.hypot(sx, sy) || 1;
    let dvx = (sx / sd) * maxSpeed, dvy = (sy / sd) * maxSpeed;

    const sense = Math.min(W, H) * 0.18;
    for (const o of obstacles) {
      const ox = robot.x - o.x, oy = robot.y - o.y, od = Math.hypot(ox, oy);
      const influence = o.r + sense;
      if (od < influence && od > 0.1) {
        let f = 1 - od / influence;
        f = f * f * maxSpeed * 3.4;
        dvx += (ox / od) * f; dvy += (oy / od) * f;
      }
    }
    const m = Math.min(W, H) * 0.07;
    if (robot.x < m) dvx += (m - robot.x) * 0.02;
    if (robot.x > W - m) dvx -= (robot.x - (W - m)) * 0.02;
    if (robot.y < m) dvy += (m - robot.y) * 0.02;
    if (robot.y > H - m) dvy -= (robot.y - (H - m)) * 0.02;

    robot.vx += (dvx - robot.vx) * 0.08;
    robot.vy += (dvy - robot.vy) * 0.08;
    const sp = Math.hypot(robot.vx, robot.vy);
    if (sp > maxSpeed) { robot.vx = (robot.vx / sp) * maxSpeed; robot.vy = (robot.vy / sp) * maxSpeed; }
    robot.x += robot.vx; robot.y += robot.vy;
    if (sp > 0.01) robot.heading = Math.atan2(robot.vy, robot.vx);

    trail.push({ x: robot.x, y: robot.y });
    if (trail.length > 110) trail.shift();

    ctx.clearRect(0, 0, W, H);

    // path trail
    for (let k = 1; k < trail.length; k++) {
      const a = k / trail.length;
      ctx.beginPath();
      ctx.moveTo(trail[k - 1].x, trail[k - 1].y);
      ctx.lineTo(trail[k].x, trail[k].y);
      ctx.strokeStyle = `rgba(255,193,94,${a * 0.5})`;
      ctx.lineWidth = 1.4 * a + 0.3;
      ctx.stroke();
    }

    // LiDAR
    const range = Math.min(W, H) * 0.3;
    for (let bI = 0; bI < BEAMS; bI++) {
      const ang = (bI / BEAMS) * Math.PI * 2;
      const dx = Math.cos(ang), dy = Math.sin(ang);
      let dist = range, hitObs = -1;
      for (let j = 0; j < obstacles.length; j++) {
        const d = rayCircle(robot.x, robot.y, dx, dy, obstacles[j], dist);
        if (d < dist) { dist = d; hitObs = j; }
      }
      const ex = robot.x + dx * dist, ey = robot.y + dy * dist;
      const grad = ctx.createLinearGradient(robot.x, robot.y, ex, ey);
      grad.addColorStop(0, 'rgba(55,231,223,0.22)');
      grad.addColorStop(1, 'rgba(55,231,223,0)');
      ctx.beginPath(); ctx.moveTo(robot.x, robot.y); ctx.lineTo(ex, ey);
      ctx.strokeStyle = grad; ctx.lineWidth = 1; ctx.stroke();
      if (hitObs >= 0) {
        obstacles[hitObs].lit = Math.min(1, obstacles[hitObs].lit + 0.25);
        ctx.beginPath(); ctx.arc(ex, ey, 1.6, 0, Math.PI * 2);
        ctx.fillStyle = ACC; ctx.fill();
      }
    }

    // obstacles
    for (const ob of obstacles) {
      ob.lit *= 0.94;
      ctx.beginPath(); ctx.arc(ob.x, ob.y, ob.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(13,20,34,0.85)'; ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = `rgba(55,231,223,${0.18 + ob.lit * 0.6})`;
      ctx.stroke();
      if (ob.lit > 0.04) {
        ctx.beginPath(); ctx.arc(ob.x, ob.y, ob.r + 4 + ob.lit * 5, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(55,231,223,${ob.lit * 0.25})`; ctx.lineWidth = 1; ctx.stroke();
      }
    }

    // goal reticle
    ctx.save();
    ctx.translate(goal.x, goal.y);
    ctx.strokeStyle = SIG; ctx.lineWidth = 1.2;
    const rr = 8 + Math.sin(time * 4) * 1.5;
    ctx.beginPath(); ctx.arc(0, 0, rr, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-rr - 4, 0); ctx.lineTo(-rr + 3, 0);
    ctx.moveTo(rr - 3, 0); ctx.lineTo(rr + 4, 0);
    ctx.moveTo(0, -rr - 4); ctx.lineTo(0, -rr + 3);
    ctx.moveTo(0, rr - 3); ctx.lineTo(0, rr + 4); ctx.stroke();
    ctx.fillStyle = SIG; ctx.beginPath(); ctx.arc(0, 0, 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // robot
    ctx.save();
    ctx.translate(robot.x, robot.y); ctx.rotate(robot.heading);
    ctx.shadowColor = ACC; ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.moveTo(11, 0); ctx.lineTo(-7, 7); ctx.lineTo(-4, 0); ctx.lineTo(-7, -7); ctx.closePath();
    ctx.fillStyle = ACC; ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();
    ctx.beginPath(); ctx.arc(robot.x, robot.y, range, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(55,231,223,0.05)'; ctx.lineWidth = 1; ctx.stroke();

    // telemetry
    telCount++;
    if (telCount % 6 === 0 && telPos && telV) {
      telPos.textContent = `[${(robot.x / W * 2 - 1).toFixed(2)}, ${((robot.y / H * 2 - 1) * -1).toFixed(2)}]`;
      telV.textContent = (sp / maxSpeed).toFixed(2);
    }

    if (running) rafId = requestAnimationFrame(step);
  }

  function start() {
    if (running) return;
    running = true;
    t0 = performance.now();
    rafId = requestAnimationFrame(step);
  }
  function stop() { running = false; cancelAnimationFrame(rafId); }

  // pointer → goal
  const onMove = (e: MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    goal.x = e.clientX - rect.left; goal.y = e.clientY - rect.top; mouseInside = true;
  };
  const onLeave = () => { mouseInside = false; };
  canvas.addEventListener('mousemove', onMove);
  canvas.addEventListener('mouseleave', onLeave);

  // pause when scrolled off-screen or tab hidden (rect check — robust everywhere)
  const hero = (canvas.closest('#hero') as HTMLElement) ?? canvas;
  const onScreen = () => {
    const r = hero.getBoundingClientRect();
    return r.bottom > 0 && r.top < (window.innerHeight || document.documentElement.clientHeight);
  };
  const checkVis = () => { if (onScreen() && !document.hidden) start(); else stop(); };
  window.addEventListener('scroll', checkVis, { passive: true });
  document.addEventListener('visibilitychange', checkVis);

  // resize (debounced)
  let rt = 0;
  const onResize = () => { clearTimeout(rt); rt = window.setTimeout(() => { resize(); }, 200); };
  window.addEventListener('resize', onResize);

  resize();
  if (reduced) { step(performance.now()); stop(); } // single static frame
  else start();

  return {
    dispose() {
      stop();
      window.removeEventListener('scroll', checkVis);
      document.removeEventListener('visibilitychange', checkVis);
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mouseleave', onLeave);
      window.removeEventListener('resize', onResize);
    },
  };
}
