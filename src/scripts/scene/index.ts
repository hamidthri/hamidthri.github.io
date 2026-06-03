/**
 * Hero scene entry: the 2D LiDAR robot-navigation canvas.
 *
 *   reduced-motion     → single static frame
 *   low-power / mobile → animated at reduced quality
 *   otherwise          → full animation
 *
 * Pure 2D canvas — no WebGL / Three.js is shipped.
 */
import { startScene2d, type SceneHandle } from './scene2d';

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
  if (isLowPower()) return startScene2d(canvas, { quality: 'low' });
  return startScene2d(canvas, {});
}

const canvas = document.getElementById('scene') as HTMLCanvasElement | null;
if (canvas) {
  const handle = bootHeroScene(canvas);
  window.addEventListener('beforeunload', () => handle.dispose());
}
