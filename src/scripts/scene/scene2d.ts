/**
 * HERO — robot navigation + LiDAR scan (2D canvas).
 * A faithful, verbatim port of the scene in the original index.html: a robot
 * steers toward the cursor (its goal), sensing and avoiding obstacles, casting
 * LiDAR beams. Speed and behaviour are byte-for-byte identical to that file
 * (maxSpeed = min(W,H)*0.0045, per-frame integration, 36 beams).
 *
 * The only additions over the inline original are the module wrapper and a
 * dispose() that detaches listeners — the animation itself is unchanged.
 */
export interface SceneHandle {
  dispose(): void;
}

interface Obstacle { x: number; y: number; r: number; lit: number; }
interface Robot { x: number; y: number; vx: number; vy: number; heading: number; }

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

  const css = getComputedStyle(document.documentElement);
  const ACC = (css.getPropertyValue('--accent') || '#37e7df').trim();
  const SIG = (css.getPropertyValue('--signal') || '#ffc15e').trim();

  function rand(a: number, b: number) { return a + Math.random() * (b - a); }

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

    // ---- steering: seek + obstacle avoidance + boundary ----
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

    // ---- draw ----
    ctx.clearRect(0, 0, W, H);

    // path trail
    if (trail.length > 1) {
      for (let k = 1; k < trail.length; k++) {
        const a = k / trail.length;
        ctx.beginPath();
        ctx.moveTo(trail[k - 1].x, trail[k - 1].y);
        ctx.lineTo(trail[k].x, trail[k].y);
        ctx.strokeStyle = 'rgba(255,193,94,' + (a * 0.5) + ')';
        ctx.lineWidth = 1.4 * a + 0.3;
        ctx.stroke();
      }
    }

    // LiDAR beams
    const range = Math.min(W, H) * 0.30;
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
      grad.addColorStop(0, 'rgba(55,231,223,0.22)');
      grad.addColorStop(1, 'rgba(55,231,223,0)');
      ctx.beginPath(); ctx.moveTo(r.x, r.y); ctx.lineTo(ex, ey);
      ctx.strokeStyle = grad; ctx.lineWidth = 1; ctx.stroke();
      if (hitObs >= 0) {
        obstacles[hitObs].lit = Math.min(1, obstacles[hitObs].lit + 0.25);
        ctx.beginPath(); ctx.arc(ex, ey, 1.6, 0, Math.PI * 2);
        ctx.fillStyle = ACC; ctx.fill();
      }
    }

    // obstacles
    for (let oi = 0; oi < obstacles.length; oi++) {
      const ob = obstacles[oi];
      ob.lit *= 0.94;
      ctx.beginPath(); ctx.arc(ob.x, ob.y, ob.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(13,20,34,0.85)'; ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = 'rgba(55,231,223,' + (0.18 + ob.lit * 0.6) + ')';
      ctx.stroke();
      if (ob.lit > 0.04) {
        ctx.beginPath(); ctx.arc(ob.x, ob.y, ob.r + 4 + ob.lit * 5, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(55,231,223,' + (ob.lit * 0.25) + ')'; ctx.lineWidth = 1; ctx.stroke();
      }
    }

    // goal reticle
    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.strokeStyle = SIG; ctx.lineWidth = 1.2;
    const rr = 8 + Math.sin(time * 4) * 1.5;
    ctx.beginPath(); ctx.arc(0, 0, rr, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-rr - 4, 0); ctx.lineTo(-rr + 3, 0);
    ctx.moveTo(rr - 3, 0); ctx.lineTo(rr + 4, 0);
    ctx.moveTo(0, -rr - 4); ctx.lineTo(0, -rr + 3);
    ctx.moveTo(0, rr - 3); ctx.lineTo(0, rr + 4); ctx.stroke();
    ctx.fillStyle = SIG; ctx.beginPath(); ctx.arc(0, 0, 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // robot body
    ctx.save();
    ctx.translate(r.x, r.y); ctx.rotate(r.heading);
    ctx.shadowColor = ACC; ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.moveTo(11, 0); ctx.lineTo(-7, 7); ctx.lineTo(-4, 0); ctx.lineTo(-7, -7); ctx.closePath();
    ctx.fillStyle = ACC; ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();
    // robot range ring
    ctx.beginPath(); ctx.arc(r.x, r.y, range, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(55,231,223,0.05)'; ctx.lineWidth = 1; ctx.stroke();

    // telemetry (throttled)
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
  start();

  return {
    dispose() {
      cancelAnimationFrame(rafId);
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mouseleave', onLeave);
      window.removeEventListener('resize', onResize);
    },
  };
}
