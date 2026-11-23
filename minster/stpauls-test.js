// Test page for the St Paul's picture: the scene, the split organ (pipes
// rotated by `face` inline), a few camera positions via window.shot(name).
import * as THREE from 'three';
import { createStPaulsScene, P } from './scene-stpauls.js';
import { layoutOrganSplit } from './organ-layout-split.js';
import { pipeSegments } from './organ-view.js';
import { createScene } from './scene.js';
import { STYLES } from '../engine/organ.js';
import { X } from '../engine/stpauls.js';
import { segmentCount } from './lineart.js';

const W = innerWidth, H = innerHeight;
const S = createStPaulsScene(document.getElementById('c'), { width: W, height: H });
S.camera.fov = 38; S.camera.updateProjectionMatrix();

const ALL = [];
for (const stop of STYLES.york.manual) for (let k = 36; k <= 93; k++) ALL.push({ stop, key: k });
for (const stop of STYLES.york.pedal) for (let k = 36; k <= 67; k++) ALL.push({ stop, key: k, pedal: true });
const pipes = layoutOrganSplit(ALL);

// Pipes: local segments (x = face normal, z = across), rotated about the
// vertical by p.face, then placed at the foot.
const pos = [], col = [];
const ink = new THREE.Color('#e9e7e1').multiplyScalar(0.9), neon = new THREE.Color('#ff3d6e').multiplyScalar(1.6);
for (const p of pipes) {
  const v = pipeSegments(p), o = P(p.mx, p.my, p.mz);
  const c = Math.cos(p.face), s = Math.sin(p.face);
  const k = p.stop === 'ymDiap8a' && p.key % 12 === 0 ? neon : ink;
  for (let i = 0; i < v.length; i += 3) {
    const x = v[i], z = v[i + 2];
    pos.push(c * x + s * z + o.x, v[i + 1] + o.y, -s * x + c * z + o.z);
    col.push(k.r, k.g, k.b);
  }
}
const g = new THREE.BufferGeometry();
g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
S.root.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, toneMapped: false, fog: false })));

// York, for the line count.
const Y = createScene(document.getElementById('york'), { width: 64, height: 64, lineArt: true, organCase: false });
const box = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity };
for (const p of pipes) { box.x0 = Math.min(box.x0, p.mx - p.w / 2); box.x1 = Math.max(box.x1, p.mx + p.w / 2); box.y0 = Math.min(box.y0, Math.abs(p.my) - p.w / 2); box.y1 = Math.max(box.y1, Math.abs(p.my) + p.w / 2); box.z0 = Math.min(box.z0, p.mz); box.z1 = Math.max(box.z1, p.mz + p.h); }
window.stats = {
  stpauls: segmentCount(S.lines.filter((L) => !L.userData.exterior)),
  stpaulsExterior: segmentCount(S.lines.filter((L) => L.userData.exterior)),
  york: segmentCount(Y.lines), buckets: S.lines.length,
  pipes: pipes.length, pipeSegments: pos.length / 6, scale: pipes[0].scale, organBox: box,
};

const C = X.crossC;
const SHOTS = {
  wide: { p: [C - 165, -150, 110], a: [C + 2, 0, 40], fov: 36, ext: true, fog: 0.0016 },
  nave: { p: [8, 0, 1.7], a: [X.crossEnd + 10, 0, 19], fov: 50, ext: false, fog: 0.004 },
  dome: { p: [C - 6, 0, 1.6], a: [C, 0, 64], fov: 75, ext: false, fog: 0.004 },
  organ: { p: [105.5, -10, 10.5], a: [105.5, 6, 11.8], fov: 52, ext: false, fog: 0.006 },
  choir: { p: [X.crossC, 0, 4], a: [X.apseEnd, 0, 10], fov: 55, ext: false, fog: 0.005 },
};
window.shot = (name) => {
  const s = SHOTS[name];
  S.camera.fov = s.fov; S.camera.updateProjectionMatrix();
  S.scene.fog.density = s.fog;
  S.setExterior(s.ext);
  S.setCamera(s.p, s.a);
  S.reveal(1);
  S.render();
  return name;
};
window.SHOTS = SHOTS;
window.shot('wide');
window.ready = true;
