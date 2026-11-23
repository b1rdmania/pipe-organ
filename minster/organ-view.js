// The York organ as lines: layout of the case front, each pipe drawn as two
// walls, a foot and a mouth. Shared by the app and the clip renderer.
import * as THREE from 'three';
import { P } from './scene.js';
import { STOPS, STYLES, pipeHz } from '../engine/organ.js';
import { SCREEN, ORGAN } from '../engine/minster.js';

export const NEON = new THREE.Color('#ff3d6e');
export const INK = new THREE.Color('#e9e7e1');

// A pipe's lines, local to its foot. `v` can show voicing in progress:
// len (body length, 1 = final), cut (mouth height, 1 = final), toe (foot
// opening, 1 = final), nicks (rows of nicks in the languid).
export function pipeSegments(p, v = {}) {
  // A pipe in three dimensions, like the building: a ring at the top and at
  // the mouth, four lines down its sides, a cone of a foot to the toe hole,
  // and the mouth cut into its front (the side facing west, -x).
  const r = p.w / 2, f = p.foot;
  const h = f + (p.h - f) * (v.len ?? 1);
  const mh = Math.max(0.01, p.w * STOPS[p.stop].jr * 0.9) * (v.cut ?? 1);
  const toe = Math.max(0.002, p.w * 0.08 * (v.toe ?? 1));
  const at = (rad, th, y) => [-rad * Math.cos(th), y, rad * Math.sin(th)];
  const out = [];
  const seg = (A, B) => out.push(...A, ...B);
  const N = 8;
  for (const y of [f, h]) for (let i = 0; i < N; i++) seg(at(r, (i / N) * 2 * Math.PI, y), at(r, ((i + 1) / N) * 2 * Math.PI, y));
  for (let i = 0; i < 4; i++) { const th = Math.PI / 4 + (i * Math.PI) / 2; seg(at(r, th, f), at(r, th, h)); }
  for (let i = 0; i < 4; i++) { const th = (i * Math.PI) / 2; seg(at(r, th, f), at(toe, th, 0)); }
  // Mouth: its two sides and the upper lip (the cut-up), on the front.
  const m = 0.6;
  seg(at(r, -m, f), at(r, -m, f + mh)); seg(at(r, m, f), at(r, m, f + mh)); seg(at(r, -m, f + mh), at(r, m, f + mh));
  for (let k = 0; k < (v.nicks ?? 0); k++) {
    const th = -m + (2 * m * (k + 0.5)) / Math.max(1, v.nicks);
    seg(at(r, th, f - p.w * 0.02), at(r, th, f - p.w * 0.09));
  }
  if (STOPS[p.stop].stopped) { seg(at(r, 0, h), at(r, Math.PI, h)); seg(at(r, Math.PI / 2, h), at(r, -Math.PI / 2, h)); }
  return out;
}

export { layoutOrgan } from './organ-layout.js';

// All pipes in one geometry (each owns a range of vertex colours), plus the
// hero as its own object so it can change while it is voiced.
export function organLines(root, pipes, hero) {
  const pos = [], col = [];
  for (const p of pipes) {
    if (p === hero) continue;
    const v = pipeSegments(p), o = P(p.mx, p.my, p.mz);
    // A pipe can face any way about the vertical (St Paul's cases face each other).
    const c = Math.cos(p.face ?? 0), sn = Math.sin(p.face ?? 0);
    p.v0 = pos.length / 3; p.vn = v.length / 3;
    for (let i = 0; i < v.length; i += 3) { const x = v[i], z = v[i + 2]; pos.push(c * x + sn * z + o.x, v[i + 1] + o.y, -sn * x + c * z + o.z); col.push(0, 0, 0); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  root.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, toneMapped: false, fog: false })));
  const hg = new THREE.BufferGeometry(); hg.setAttribute('position', new THREE.Float32BufferAttribute(pipeSegments(hero), 3));
  hero.obj = new THREE.LineSegments(hg, new THREE.LineBasicMaterial({ color: 0x000000, toneMapped: false, fog: false }));
  hero.obj.position.copy(P(hero.mx, hero.my, hero.mz));
  hero.obj.rotation.y = hero.face ?? 0;
  root.add(hero.obj);
  const colours = g.attributes.color;
  const base = Float32Array.from(pos);
  const where = g.attributes.position;
  // Move a pipe away from its place in the case (o: world-space offset).
  const offset = (p, o) => {
    for (let i = p.v0; i < p.v0 + p.vn; i++) where.setXYZ(i, base[i * 3] + o.x, base[i * 3 + 1] + o.y, base[i * 3 + 2] + o.z);
    where.needsUpdate = true;
  };
  const tmp = new THREE.Color();
  const colour = (state, level) => {
    if (state === 'hidden') return tmp.setRGB(0, 0, 0);
    if (state === 'unbuilt') return tmp.copy(INK).multiplyScalar(0.14);
    if (state === 'voicing') return tmp.copy(NEON).multiplyScalar(2.2);
    if (state === 'sounding' && level > 0.02) return tmp.copy(NEON).multiplyScalar(0.8 + 2.4 * level);
    return tmp.copy(INK).multiplyScalar(0.95);
  };
  const setPipe = (p, state, level = 0) => {
    if (p.state === state && state !== 'sounding') return;
    const c = colour(state, level);
    p.state = state;
    if (p.obj) { p.obj.material.color.copy(c); return; }
    for (let i = p.v0; i < p.v0 + p.vn; i++) colours.setXYZ(i, c.r, c.g, c.b);
    colours.needsUpdate = true;
  };
  const shapeHero = (v) => {
    const a = hero.obj.geometry;
    a.setAttribute('position', new THREE.Float32BufferAttribute(pipeSegments(hero, v), 3));
    a.computeBoundingSphere();
  };
  return { setPipe, shapeHero, offset, geometry: g };
}
