/**
 * Hero scene entry: pick the right renderer for the device, lazily.
 *
 * Capability ladder:
 *   reduced-motion        → 2D, single static frame
 *   no WebGL              → 2D animated
 *   low-power / mobile    → 2D animated (low quality)
 *   capable desktop       → 3D (Three.js, dynamically imported)
 *
 * The Three.js bundle is only fetched when the 3D branch is actually taken,
 * so reduced-motion / mobile visitors download 0 KB of three.
 */
import { startScene2d, type SceneHandle } from './scene2d';

function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch {
    return false;
  }
}

function isLowPower(): boolean {
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  const coarse = window.matchMedia('(pointer:coarse)').matches;
  const narrow = window.innerWidth < 760;
  const lowMem = typeof nav.deviceMemory === 'number' && nav.deviceMemory < 4;
  const fewCores = typeof navigator.hardwareConcurrency === 'number' && navigator.hardwareConcurrency < 4;
  const saveData = !!nav.connection?.saveData;
  return coarse || narrow || lowMem || fewCores || saveData;
}

export function bootHeroScene(canvas: HTMLCanvasElement): SceneHandle {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (reduced) return startScene2d(canvas, { reduced: true });
  if (!hasWebGL()) return startScene2d(canvas, {});
  if (isLowPower()) return startScene2d(canvas, { quality: 'low' });

  // Capable desktop → 3D, lazily imported. We must NOT touch the canvas with a
  // 2D context first: once a canvas has a 2D context it can never return a WebGL
  // one. So we wait for three to load and start 3D directly; only if that fails
  // do we fall back to the 2D scene (on the still-pristine canvas).
  let handle: SceneHandle | null = null;
  let disposed = false;
  import('./scene3d')
    .then(({ startScene3d }) => {
      if (!disposed) handle = startScene3d(canvas);
    })
    .catch(() => {
      if (!disposed) handle = startScene2d(canvas, {});
    });

  return {
    dispose() {
      disposed = true;
      handle?.dispose();
    },
  };
}

// auto-boot when included on a page that has the canvas
const canvas = document.getElementById('scene') as HTMLCanvasElement | null;
if (canvas) {
  const handle = bootHeroScene(canvas);
  window.addEventListener('beforeunload', () => handle.dispose());
}
