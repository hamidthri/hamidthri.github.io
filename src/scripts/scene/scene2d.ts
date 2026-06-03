/**
 * 2D starfield scene — the lightweight fallback for the 3D space hero.
 * A drifting field of stars with a faint diagonal Milky Way band and a couple
 * of soft planets, with gentle parallax to the cursor. Used on reduced-motion,
 * no-WebGL, or low-power devices. Returns a disposer.
 */
export interface SceneHandle {
  dispose(): void;
}

interface Star { x: number; y: number; z: number; r: number; tw: number; c: string; }

export function startScene2d(
  canvas: HTMLCanvasElement,
  opts: { reduced?: boolean; quality?: 'high' | 'low' } = {},
): SceneHandle {
  const reduced = opts.reduced ?? false;
  const low = opts.quality === 'low';
  const ctx = canvas.getContext('2d')!;
  const DPR = Math.min(window.devicePixelRatio || 1, low ? 1.5 : 2);

  let W = 0, H = 0;
  let stars: Star[] = [];
  let planets: { x: number; y: number; r: number; c: string; a: string }[] = [];
  let mx = 0.5, my = 0.5; // normalized pointer (parallax)
  let t0 = performance.now();
  let rafId = 0;
  let running = false;

  const rand = (a: number, b: number) => a + Math.random() * (b - a);
  const tints = ['223,233,255', '223,233,255', '223,233,255', '55,231,223', '255,193,94'];

  function build() {
    const count = Math.round((low ? 200 : 300) * Math.min(2.2, (W * H) / (1000 * 620)));
    stars = [];
    // band direction (diagonal Milky Way)
    for (let i = 0; i < count; i++) {
      // ~40% of stars cluster near a diagonal band
      let x: number, y: number;
      if (Math.random() < 0.4) {
        const tt = Math.random();
        x = tt * W;
        const bandY = H * 0.25 + tt * H * 0.5; // diagonal
        y = bandY + (Math.random() + Math.random() + Math.random() - 1.5) * H * 0.12;
      } else {
        x = rand(0, W); y = rand(0, H);
      }
      stars.push({ x, y, z: rand(0.2, 1), r: rand(0.4, 1.7), tw: rand(0, Math.PI * 2), c: tints[(Math.random() * tints.length) | 0] });
    }
    planets = [
      { x: W * 0.82, y: H * 0.6, r: Math.min(W, H) * 0.07, c: '20,60,80', a: '55,231,223' },
      { x: W * 0.2, y: H * 0.28, r: Math.min(W, H) * 0.035, c: '60,40,24', a: '255,193,94' },
    ];
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    W = rect.width; H = rect.height;
    canvas.width = W * DPR; canvas.height = H * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    build();
  }

  function draw(now: number) {
    const t = (now - t0) / 1000;
    ctx.clearRect(0, 0, W, H);

    // soft Milky Way band glow
    const g = ctx.createLinearGradient(0, H * 0.2, W, H * 0.8);
    g.addColorStop(0, 'rgba(74,58,138,0)');
    g.addColorStop(0.5, 'rgba(74,58,138,0.10)');
    g.addColorStop(0.65, 'rgba(28,111,134,0.08)');
    g.addColorStop(1, 'rgba(74,58,138,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // planets
    for (const p of planets) {
      const px = p.x + (mx - 0.5) * 24 * 0.6;
      const py = p.y + (my - 0.5) * 24 * 0.6;
      const rg = ctx.createRadialGradient(px - p.r * 0.3, py - p.r * 0.3, p.r * 0.1, px, py, p.r);
      rg.addColorStop(0, `rgba(${p.c},0.95)`);
      rg.addColorStop(1, `rgba(${p.c},0.15)`);
      ctx.beginPath(); ctx.arc(px, py, p.r, 0, Math.PI * 2); ctx.fillStyle = rg; ctx.fill();
      // atmosphere rim
      ctx.beginPath(); ctx.arc(px, py, p.r * 1.08, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${p.a},0.18)`; ctx.lineWidth = 2; ctx.stroke();
    }

    // stars (parallax by depth, gentle twinkle)
    for (const s of stars) {
      const px = s.x + (mx - 0.5) * 30 * s.z;
      const py = s.y + (my - 0.5) * 20 * s.z;
      const tw = reduced ? 0.9 : 0.65 + 0.35 * Math.sin(t * (0.6 + s.z) + s.tw);
      ctx.beginPath();
      ctx.arc(px, py, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${s.c},${tw})`;
      ctx.fill();
    }

    if (running) rafId = requestAnimationFrame(draw);
  }

  function start() { if (running) return; running = true; t0 = performance.now() - 1000; rafId = requestAnimationFrame(draw); }
  function stop() { running = false; cancelAnimationFrame(rafId); }

  const onMove = (e: MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    mx = (e.clientX - rect.left) / rect.width;
    my = (e.clientY - rect.top) / rect.height;
  };
  canvas.addEventListener('mousemove', onMove);

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
  if (reduced) { draw(performance.now()); stop(); }
  else start();

  return {
    dispose() {
      stop();
      window.removeEventListener('scroll', checkVis);
      document.removeEventListener('visibilitychange', checkVis);
      canvas.removeEventListener('mousemove', onMove);
      window.removeEventListener('resize', onResize);
    },
  };
}
