/**
 * Hero scene entry — boots the 2D LiDAR robot-navigation canvas exactly like
 * the original index.html (full quality; a single static frame under
 * prefers-reduced-motion). Pure 2D canvas, no WebGL/Three.js.
 */
import { startScene2d, type SceneHandle } from './scene2d';

export function bootHeroScene(canvas: HTMLCanvasElement): SceneHandle {
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return startScene2d(canvas, { reduced });
}

const canvas = document.getElementById('scene') as HTMLCanvasElement | null;
if (canvas) {
  const handle = bootHeroScene(canvas);
  // Only tear down on a real unload. On bfcache (back/forward, or a tab the
  // browser froze), e.persisted is true — keep the scene alive so its pageshow
  // re-kick resumes it instead of leaving a frozen canvas.
  window.addEventListener('pagehide', (e) => { if (!e.persisted) handle.dispose(); });
}
