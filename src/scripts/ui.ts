/**
 * Shared UI behaviours for every page: loader, nav state, mobile menu,
 * reveal-on-scroll, card glow, and the custom cursor.
 * Ported from the original index.html inline script.
 */
const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = window.matchMedia && window.matchMedia('(pointer:fine)').matches;

/* ---------- loader ---------- */
const loader = document.getElementById('loader');
const bootEl = document.getElementById('boot');
if (loader) {
  const lines = ['initializing perception stack', 'loading policy network', 'mapping research trajectory'];
  let li = 0;
  if (!reduce && bootEl) {
    const bt = setInterval(() => {
      li++;
      if (li < lines.length) bootEl.textContent = lines[li];
      else { bootEl.innerHTML = '<span class="ok">ready ✓</span>'; clearInterval(bt); }
    }, 460);
  } else if (bootEl) {
    bootEl.innerHTML = '<span class="ok">ready ✓</span>';
  }
  const hide = () => loader.classList.add('done');
  window.addEventListener('load', () => setTimeout(hide, reduce ? 100 : 1200));
  setTimeout(hide, 2600); // safety
  loader.addEventListener('click', hide);
}

/* ---------- nav: scrolled state ---------- */
const nav = document.getElementById('nav');
if (nav) {
  const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 30);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
}

/* ---------- mobile menu ---------- */
const toggle = document.getElementById('nav-toggle');
if (toggle) {
  const scrim = document.getElementById('nav-scrim');
  const setMenu = (open: boolean) => {
    document.body.classList.toggle('nav-open', open);
    toggle.setAttribute('aria-expanded', String(open));
  };
  toggle.addEventListener('click', () => setMenu(!document.body.classList.contains('nav-open')));
  scrim?.addEventListener('click', () => setMenu(false));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setMenu(false);
  });
  document.querySelectorAll('#nav-links a').forEach((a) =>
    a.addEventListener('click', () => setMenu(false)),
  );
}

/* ---------- reveal on scroll ----------
   IntersectionObserver for the effect, plus a getBoundingClientRect sweep as a
   guaranteed fallback so content is NEVER stuck hidden (some engines report IO
   unreliably). The sweep reveals anything whose top has entered the viewport. */
const reveals = Array.from(document.querySelectorAll<HTMLElement>('.reveal'));
if (reduce) {
  reveals.forEach((el) => el.classList.add('in'));
} else {
  const show = (el: Element) => el.classList.add('in');
  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => {
      if (e.isIntersecting) { show(e.target); io.unobserve(e.target); }
    }),
    { threshold: 0.05, rootMargin: '0px 0px -6% 0px' },
  );
  reveals.forEach((el) => io.observe(el));

  const sweep = () => {
    const vh = window.innerHeight || document.documentElement.clientHeight;
    for (const el of reveals) {
      if (!el.classList.contains('in') && el.getBoundingClientRect().top < vh * 0.92) show(el);
    }
  };
  sweep();
  window.addEventListener('scroll', sweep, { passive: true });
  window.addEventListener('load', sweep);
}

/* ---------- animated stat counters ---------- */
const counters = Array.from(document.querySelectorAll<HTMLElement>('[data-count]'));
if (counters.length) {
  if (reduce) {
    // values already render as final text — nothing to animate
  } else {
    const animate = (el: HTMLElement) => {
      const target = parseFloat(el.dataset.count || '0');
      const dec = parseInt(el.dataset.dec || '0', 10);
      const dur = 1100;
      const t0 = performance.now();
      const tick = (now: number) => {
        const p = Math.min(1, (now - t0) / dur);
        const e = 1 - Math.pow(1 - p, 3); // easeOutCubic
        el.textContent = (target * e).toFixed(dec);
        if (p < 1) requestAnimationFrame(tick);
        else el.textContent = target.toFixed(dec);
      };
      requestAnimationFrame(tick);
    };
    let counted = false;
    const strip = document.querySelector('.stat-strip');
    const maybeCount = () => {
      if (counted || !strip) return;
      const r = strip.getBoundingClientRect();
      const vh = window.innerHeight || document.documentElement.clientHeight;
      if (r.top < vh * 0.92 && r.bottom > 0) {
        counted = true;
        counters.forEach((c) => { c.textContent = '0'; animate(c); });
        window.removeEventListener('scroll', maybeCount);
      }
    };
    maybeCount();
    window.addEventListener('scroll', maybeCount, { passive: true });
    window.addEventListener('load', maybeCount);
  }
}

/* ---------- card glow follow ---------- */
document.querySelectorAll<HTMLElement>('.card').forEach((c) => {
  c.addEventListener('mousemove', (e) => {
    const r = c.getBoundingClientRect();
    c.style.setProperty('--mx', ((e.clientX - r.left) / r.width) * 100 + '%');
  });
});

/* ---------- play videos only while on screen (keeps the hero light) ---------- */
const inviewVids = Array.from(document.querySelectorAll<HTMLVideoElement>('.js-inview-video'));
if (inviewVids.length && 'IntersectionObserver' in window) {
  const vo = new IntersectionObserver(
    (entries) => entries.forEach((e) => {
      const v = e.target as HTMLVideoElement;
      if (e.isIntersecting) v.play().catch(() => {});
      else v.pause();
    }),
    { threshold: 0.25 },
  );
  inviewVids.forEach((v) => vo.observe(v));
}

/* ---------- custom cursor ---------- */
if (fine && !reduce) {
  document.body.classList.add('has-cursor');
  const dot = document.getElementById('cdot');
  const ring = document.getElementById('cring');
  if (dot && ring) {
    let rx = 0, ry = 0, mx = 0, my = 0;
    document.addEventListener('mousemove', (e) => {
      mx = e.clientX; my = e.clientY;
      dot.style.transform = `translate(${mx}px,${my}px) translate(-50%,-50%)`;
    });
    const loop = () => {
      rx += (mx - rx) * 0.18; ry += (my - ry) * 0.18;
      ring.style.transform = `translate(${rx}px,${ry}px) translate(-50%,-50%)`;
      requestAnimationFrame(loop);
    };
    loop();
    document.querySelectorAll('a,button,.filter').forEach((el) => {
      el.addEventListener('mouseenter', () => ring.classList.add('hot'));
      el.addEventListener('mouseleave', () => ring.classList.remove('hot'));
    });
  }
}

export {};
