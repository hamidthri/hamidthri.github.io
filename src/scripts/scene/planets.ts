/**
 * Procedural, realistic planets for the space hero — no external texture files.
 * Surfaces are generated with seamless 3D value-noise (sampled on the sphere so
 * there's no UV seam) and lit by a directional "sun" for a real day/night
 * terminator. Builds gas giants (banded), ocean/cloud worlds, and rocky worlds,
 * with optional rings, clouds and an atmospheric fresnel glow.
 */
import * as THREE from 'three';

type RGB = [number, number, number];

// ---- seamless 3D value-noise fBm ----
function makePerm(): Uint8Array {
  const perm = new Uint8Array(512);
  const t = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    const tmp = t[i]; t[i] = t[j]; t[j] = tmp;
  }
  for (let i = 0; i < 512; i++) perm[i] = t[i & 255];
  return perm;
}
const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function vn(perm: Uint8Array, x: number, y: number, z: number): number {
  const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z);
  const xf = x - X, yf = y - Y, zf = z - Z;
  const u = fade(xf), v = fade(yf), w = fade(zf);
  const h = (a: number, b: number, c: number) => perm[(perm[(perm[a & 255] + b) & 255] + c) & 255] / 255;
  const c000 = h(X, Y, Z), c100 = h(X + 1, Y, Z), c010 = h(X, Y + 1, Z), c110 = h(X + 1, Y + 1, Z);
  const c001 = h(X, Y, Z + 1), c101 = h(X + 1, Y, Z + 1), c011 = h(X, Y + 1, Z + 1), c111 = h(X + 1, Y + 1, Z + 1);
  return lerp(
    lerp(lerp(c000, c100, u), lerp(c010, c110, u), v),
    lerp(lerp(c001, c101, u), lerp(c011, c111, u), v),
    w,
  );
}
function fbm(perm: Uint8Array, x: number, y: number, z: number, oct = 5, gain = 0.5, lac = 2): number {
  let amp = 0.5, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < oct; i++) { sum += amp * vn(perm, x * freq, y * freq, z * freq); norm += amp; amp *= gain; freq *= lac; }
  return sum / norm;
}

function sample(stops: RGB[], t: number): RGB {
  t = Math.max(0, Math.min(1, t));
  const x = t * (stops.length - 1);
  const i = Math.floor(x), f = x - i;
  const a = stops[i], b = stops[Math.min(stops.length - 1, i + 1)];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

// iterate texels, calling shade(lon,lat, px,py,pz) → RGBA
function buildTexture(
  w: number,
  h: number,
  shade: (px: number, py: number, pz: number) => [number, number, number, number],
): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let j = 0; j < h; j++) {
    const lat = (j / (h - 1) - 0.5) * Math.PI;
    const cl = Math.cos(lat), sl = Math.sin(lat);
    for (let i = 0; i < w; i++) {
      const lon = (i / w) * Math.PI * 2;
      const px = cl * Math.cos(lon), py = sl, pz = cl * Math.sin(lon);
      const [r, g, b, a] = shade(px, py, pz);
      const o = (j * w + i) * 4;
      d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = a;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

const GAS: Record<string, RGB[]> = {
  jupiter: [[235, 222, 198], [214, 184, 146], [196, 150, 110], [170, 120, 88], [205, 165, 120], [150, 100, 74]],
  saturn: [[233, 219, 184], [216, 200, 158], [205, 186, 140], [223, 210, 172], [196, 176, 132]],
};

function gasTexture(perm: Uint8Array, palette: RGB[], w = 512, h = 256): THREE.CanvasTexture {
  return buildTexture(w, h, (px, py, pz) => {
    const warp = fbm(perm, px * 2.0, py * 2.0, pz * 2.0, 4) - 0.5;
    const band = py * 7 + warp * 2.4;
    const t = 0.5 + 0.5 * Math.sin(band * 3.1);
    const detail = fbm(perm, px * 9, py * 9, pz * 9, 4) - 0.5;
    const c = sample(palette, Math.max(0, Math.min(1, t + detail * 0.18)));
    return [c[0], c[1], c[2], 255];
  });
}

const TERRAN: RGB[] = [
  [12, 34, 64], [18, 56, 92], [28, 96, 120], [216, 200, 150], [70, 120, 64], [96, 120, 60], [120, 96, 64], [150, 150, 150],
];
function terranTexture(perm: Uint8Array, w = 1024, h = 512): THREE.CanvasTexture {
  return buildTexture(w, h, (px, py, pz) => {
    let e = fbm(perm, px * 1.7, py * 1.7, pz * 1.7, 6);
    e = e * 0.7 + (fbm(perm, px * 4, py * 4, pz * 4, 4) - 0.5) * 0.3;
    const ice = Math.abs(py) > 0.82 + (fbm(perm, px * 3, py * 3, pz * 3, 3) - 0.5) * 0.12;
    let c: RGB;
    if (ice) c = [236, 242, 250];
    else if (e < 0.46) c = sample([TERRAN[0], TERRAN[1], TERRAN[2]], e / 0.46); // ocean depth
    else c = sample([TERRAN[3], TERRAN[4], TERRAN[5], TERRAN[6], TERRAN[7]], (e - 0.46) / 0.54); // land
    return [c[0], c[1], c[2], 255];
  });
}
function cloudTexture(perm: Uint8Array, w = 512, h = 256): THREE.CanvasTexture {
  return buildTexture(w, h, (px, py, pz) => {
    const c = fbm(perm, px * 2.4, py * 2.4, pz * 2.4, 5);
    const a = Math.max(0, Math.min(1, (c - 0.52) / 0.28));
    return [255, 255, 255, (a * a * 230) | 0];
  });
}

const ROCKY: RGB[] = [[58, 32, 24], [102, 54, 36], [148, 86, 56], [176, 116, 80], [120, 72, 50], [86, 48, 34]];
function rockyTexture(perm: Uint8Array, palette: RGB[], w = 512, h = 256): THREE.CanvasTexture {
  return buildTexture(w, h, (px, py, pz) => {
    const e = fbm(perm, px * 2.2, py * 2.2, pz * 2.2, 6);
    const crater = fbm(perm, px * 12, py * 12, pz * 12, 3);
    const c = sample(palette, Math.max(0, Math.min(1, e * 0.85 + crater * 0.2)));
    return [c[0], c[1], c[2], 255];
  });
}

// atmospheric fresnel glow (outer halo)
function atmosphereMaterial(color: number, power = 3.2): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { glowColor: { value: new THREE.Color(color) }, power: { value: power } },
    vertexShader: `varying vec3 vN; varying vec3 vP;
      void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vP = -mv.xyz; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 glowColor; uniform float power; varying vec3 vN; varying vec3 vP;
      void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vP))), power); gl_FragColor = vec4(glowColor, f); }`,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
}

export interface PlanetSpec {
  type: 'gas' | 'terran' | 'rocky';
  radius: number;
  position: [number, number, number];
  tilt?: number;
  spin?: number;
  palette?: 'jupiter' | 'saturn' | 'mars';
  clouds?: boolean;
  atmosphere?: number; // glow color
  rings?: number;      // ring color
}

export interface PlanetHandle {
  group: THREE.Group;
  update: (dt: number) => void;
  disposables: { dispose(): void }[];
}

export function makePlanet(spec: PlanetSpec): PlanetHandle {
  const perm = makePerm();
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(o: T): T => { disposables.push(o); return o; };
  const group = new THREE.Group();
  group.position.set(...spec.position);
  group.rotation.z = spec.tilt ?? 0.35;

  let map: THREE.Texture;
  let roughness = 0.95;
  if (spec.type === 'gas') map = track(gasTexture(perm, GAS[spec.palette === 'saturn' ? 'saturn' : 'jupiter']));
  else if (spec.type === 'terran') { map = track(terranTexture(perm)); roughness = 0.78; }
  else map = track(rockyTexture(perm, spec.palette === 'mars' ? [[120, 58, 40], [165, 92, 58], [190, 120, 80], [140, 80, 54], [96, 52, 36]] : ROCKY));

  const geo = track(new THREE.SphereGeometry(spec.radius, 64, 48));
  const mat = track(new THREE.MeshStandardMaterial({ map, roughness, metalness: 0.0 }));
  const surface = new THREE.Mesh(geo, mat);
  group.add(surface);

  let clouds: THREE.Mesh | undefined;
  if (spec.clouds) {
    const cGeo = track(new THREE.SphereGeometry(spec.radius * 1.015, 48, 32));
    const cMat = track(new THREE.MeshStandardMaterial({ map: track(cloudTexture(perm)), transparent: true, alphaTest: 0.01, roughness: 1, metalness: 0, depthWrite: false }));
    (cMat as THREE.MeshStandardMaterial).alphaMap = (cMat as THREE.MeshStandardMaterial).map;
    clouds = new THREE.Mesh(cGeo, cMat);
    group.add(clouds);
  }

  if (spec.atmosphere !== undefined) {
    const aGeo = track(new THREE.SphereGeometry(spec.radius * 1.18, 48, 32));
    const aMat = track(atmosphereMaterial(spec.atmosphere));
    group.add(new THREE.Mesh(aGeo, aMat));
  }

  if (spec.rings !== undefined) {
    const inner = spec.radius * 1.4, outer = spec.radius * 2.25;
    const rGeo = track(new THREE.RingGeometry(inner, outer, 96));
    // radial UVs so a gradient/gaps can vary across the ring width
    const ringTex = track(buildTexture(256, 8, (px) => {
      // px maps around; use a 1D-ish banded alpha for ring gaps
      const u = (Math.atan2(px, 1) + 1) * 0.5;
      const bands = 0.5 + 0.5 * Math.sin(u * 60);
      const a = 150 + bands * 80;
      return [220, 205, 170, a | 0];
    }));
    const rMat = track(new THREE.MeshBasicMaterial({ color: spec.rings, map: ringTex, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }));
    const ring = new THREE.Mesh(rGeo, rMat);
    ring.rotation.x = -Math.PI / 2 + 0.32;
    group.add(ring);
  }

  const spin = spec.spin ?? 0.05;
  return {
    group,
    disposables,
    update(dt: number) {
      surface.rotation.y += spin * dt;
      if (clouds) clouds.rotation.y += spin * 1.35 * dt;
    },
  };
}
