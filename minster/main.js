// York Minster viewer and frame renderer for the film.
// ?w=1080&h=1350 sets the frame size. window.voicer.frame(t) draws time t.
import { createScene } from './scene.js';
import { facade } from '../engine/facade.js';
import { SCREEN, ORGAN } from '../engine/minster.js';

const q = new URLSearchParams(location.search);
const width = +(q.get('w') || 1080), height = +(q.get('h') || 1350);
const film = q.get('film') ? await (await fetch(q.get('film'))).json() : null;

// The façade: the Open Diapason I in the centre, Octave 4' above, pedal
// Open Diapason 16' towers either side, all front pipes of the case.
const keys = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const display = [
  ...keys(36, 72).map((key) => ({ stop: 'ymDiap8a', key })),
  ...keys(48, 84).map((key) => ({ stop: 'ymOctave4', key })),
  ...keys(36, 55).map((key) => ({ stop: 'ymPedDiap16', key })),
];
const fac = facade(display, { manual: ['ymDiap8a', 'ymOctave4'], pedal: ['ymPedDiap16'] });
const pipes = fac.map((p) => ({ ...p, mx: ORGAN.x0 - 0.25 - p.z * 0.6, my: -p.x, mz: SCREEN.top + 0.3 + (p.y - 4.5) }));

const canvas = document.getElementById('c');
const S = createScene(canvas, { width, height, organPipes: pipes });

// Camera path: up the centre of the nave toward the screen.
const path = film?.path || [{ t: 0, p: [10, 0, 1.7], a: [90, 0, 11] }, { t: 30, p: [60, 0, 1.7], a: [90, 0, 11.5] }];
function cam(t) {
  let i = 0; while (i < path.length - 2 && t > path[i + 1].t) i++;
  const A = path[i], B = path[i + 1];
  let u = Math.min(1, Math.max(0, (t - A.t) / (B.t - A.t)));
  u = u * u * (3 - 2 * u);
  const l = (a, b) => a.map((v, k) => v + (b[k] - v) * u);
  return { p: l(A.p, B.p), a: l(A.a, B.a) };
}
// Pipe glow from the note list: on while the note sounds, a short release.
const notes = film?.notes || {};
function levels(t) {
  const out = {};
  for (const [id, iv] of Object.entries(notes)) {
    let l = 0;
    for (const [a, b] of iv) { if (t >= a && t < b) { l = Math.min(1, (t - a) / 0.03); break; } if (t >= b && t < b + 0.3) l = Math.max(l, 1 - (t - b) / 0.3); }
    if (l) out[id] = l;
  }
  return out;
}
window.voicer = {
  frame(t) { const c = cam(t); S.setCamera(c.p, c.a); S.setPipes(levels(t)); S.render(); return true; },
  ready: true,
};
if (!film) {
  let t0 = performance.now();
  const loop = () => { window.voicer.frame(((performance.now() - t0) / 1000) % 30); requestAnimationFrame(loop); };
  loop();
}
