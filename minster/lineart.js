// Line-art machinery shared by the cathedral pictures: renderer, mesh-to-line
// conversion, batching into ranked buckets, a faint floor grid, bloom.
// Copied from scene.js (lineArt mode) so a second building can use it;
// scene.js itself is unchanged.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// Cathedral axes (x east, y north, z up) to Three (x east, y up, z south).
export const P = (x, y, z) => new THREE.Vector3(x, z, -y);
export const STONE = new THREE.Color(0xe9e7e1);
export const GLASS = new THREE.Color(0xff3d6e);

export function lineRenderer(canvas, width, height) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.62;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  scene.fog = new THREE.FogExp2(0x000000, 0.009);
  const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 600);
  const root = new THREE.Group(); scene.add(root);
  return { renderer, scene, camera, root };
}

// An item is one batch of world-space segments with one colour and one
// place in the drawing order: { pos: number[], col: Color, order }.
// `order` follows scene.js: west to east, then floor to vault.
export function item(pos, alpha = 0.5, glass = false, extra = {}) {
  let cx = 0, cy = 0;
  for (let i = 0; i < pos.length; i += 3) { cx += pos[i]; cy += pos[i + 1]; }
  const n = pos.length / 3 || 1;
  return { pos, col: (glass ? GLASS : STONE).clone().multiplyScalar(alpha), order: cx / n + (cy / n) * 1.2, ...extra };
}

// Every mesh under root becomes its edges (removed from the scene), exactly
// as scene.js does it: tubes as polylines, cylinders as rings plus a few
// verticals, spheres and capsules skipped, everything else EdgesGeometry.
export function meshItems(root) {
  root.updateMatrixWorld(true);
  const meshes = [];
  root.traverse((o) => { if (o.isMesh) meshes.push(o); });
  const items = [];
  const v3 = new THREE.Vector3();
  for (const m of meshes) {
    const g = m.geometry;
    m.parent.remove(m);
    if (g.type === 'SphereGeometry' || g.type === 'CapsuleGeometry') continue;
    const glass = !!(m.material && m.material.emissiveMap) || !!m.userData.glass;
    let seg = [];
    if (g.type === 'TubeGeometry') { const pts = g.parameters.path.getPoints(48); for (let i = 0; i < pts.length - 1; i++) seg.push(pts[i].x, pts[i].y, pts[i].z, pts[i + 1].x, pts[i + 1].y, pts[i + 1].z); }
    else if (g.type === 'CylinderGeometry') {
      const { radiusTop: rt, radiusBottom: rb, height: hh, radialSegments: rs } = g.parameters;
      if (rs <= 10) continue;
      const ring = (r, y) => { for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2, c = ((i + 1) / 24) * Math.PI * 2; seg.push(r * Math.cos(a), y, r * Math.sin(a), r * Math.cos(c), y, r * Math.sin(c)); } };
      ring(rt, hh / 2); ring(rb, -hh / 2);
      if (hh > 2) for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.3; seg.push(rt * Math.cos(a), hh / 2, rt * Math.sin(a), rb * Math.cos(a), -hh / 2, rb * Math.sin(a)); }
    } else seg = Array.from(new THREE.EdgesGeometry(g, 28).attributes.position.array);
    for (let i = 0; i < seg.length; i += 3) { v3.set(seg[i], seg[i + 1], seg[i + 2]).applyMatrix4(m.matrixWorld); seg[i] = v3.x; seg[i + 1] = v3.y; seg[i + 2] = v3.z; }
    const alpha = m.userData.alpha ?? (glass ? 0.55 : g.type === 'TubeGeometry' ? 0.35 : 0.5);
    items.push(item(seg, alpha, glass));
  }
  return items;
}

// A faint grid of floor flags, in cathedral coordinates, clipped to a set of
// rectangles [x0, x1, y0, y1] (the plan). Spacing `step` metres.
export function floorGrid(rects, step = 3, alpha = 0.08) {
  const pos = [];
  for (const [x0, x1, y0, y1] of rects) {
    for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) pos.push(x, 0.01, -y0, x, 0.01, -y1);
    for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) pos.push(x0, 0.01, -y, x1, 0.01, -y);
  }
  return { pos, col: STONE.clone().multiplyScalar(alpha), order: -1 };
}

// Items into BUCKETS LineSegments, in drawing order, each with
// userData.rank (0..1) and userData.alpha, opacity 0 until revealed.
export function bucketLines(root, items, BUCKETS = 40) {
  items.sort((p, q) => p.order - q.order);
  const lines = [];
  for (let k = 0; k < BUCKETS; k++) {
    const part = items.slice(Math.floor((k * items.length) / BUCKETS), Math.floor(((k + 1) * items.length) / BUCKETS));
    const L = makeLines(part);
    L.userData.rank = k / BUCKETS; L.userData.alpha = 1;
    root.add(L); lines.push(L);
  }
  return lines;
}

export function makeLines(part) {
  const n = part.reduce((s, it) => s + it.pos.length, 0);
  const pos = new Float32Array(n), col = new Float32Array(n);
  let o = 0;
  for (const it of part) {
    pos.set(it.pos, o);
    for (let i = 0; i < it.pos.length; i += 3) { col[o + i] = it.col.r; col[o + i + 1] = it.col.g; col[o + i + 2] = it.col.b; }
    o += it.pos.length;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const L = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, fog: true }));
  L.frustumCulled = false;
  return L;
}

export function bloomComposer(renderer, scene, camera, width, height) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(width, height), 0.55, 0.6, 0.82));
  composer.addPass(new OutputPass());
  return composer;
}

// Draw the building in: u from 0 (nothing) to 1 (all lines).
export function revealLines(lines, u) {
  for (const L of lines) { const k = Math.min(1, Math.max(0, (u - L.userData.rank * 0.85) / 0.15)); L.material.opacity = L.userData.alpha * k; L.visible = k > 0 && L.userData.alpha > 0; }
}

export function segmentCount(lines) {
  return lines.reduce((s, L) => s + L.geometry.attributes.position.count / 2, 0);
}
