// Where every pipe of the York organ stands, as a windchest: the façade rank
// in front, the other manual ranks in rows behind it, the pedal ranks as
// towers either side (C side north, C♯ side south). Real speaking lengths and
// diameters, scaled as one only if the case would not fit the screen.
// Coordinates are Minster metres: mx east, my north, mz up (pipe foot).
import { STOPS, STYLES, pipeHz } from '../engine/organ.js';
import { SCREEN, ORGAN } from '../engine/minster.js';

const MANUAL_ROWS = ['ymDiap8a', 'ymDouble16', 'ymDiap8b', 'ymStopped8', 'ymOctave4', 'ymPrincipal4', 'ymQuint', 'ymSuper2', 'ymMix15', 'ymMix19', 'ymMix22'];
const PEDAL_ROWS = ['ymPedWood32', 'ymPedWood16', 'ymPedDiap16', 'ymPedSub16', 'ymPedPrin8', 'ymPedFif4'];

export function layoutOrgan(pipes, { width = 13, height = 16 } = {}) {
  const by = {};
  for (const p of pipes) (by[p.stop] ??= []).push(p.key);
  for (const k in by) by[k].sort((a, b) => a - b);
  const gap = 0.03;
  const make = (stop, key) => {
    const s = STOPS[stop], f = pipeHz(s, key);
    const len = s.stopped ? 343 / (4 * f) : 343 / (2 * f);
    const d = Math.max(0.018, len / (s.stopped ? 12 : /Wood/.test(stop) ? 20 : 17)); // diameter: an English diapason scale, roughly
    return { id: `${stop}:${key}`, stop, key, pedal: STYLES.york.pedal.includes(stop), len, d, foot: Math.min(0.6, 0.12 + len * 0.06) };
  };
  const out = [];
  // Manual chest: each rank a row across, C side north, C♯ side south, the
  // biggest pipes meeting in the middle (a mitre).
  let half = 0;
  MANUAL_ROWS.filter((r) => by[r]).forEach((r, j) => {
    for (const side of [1, -1]) {
      let y = 0.02;
      for (const key of by[r].filter((k) => (k % 2 === 0) === (side > 0))) {
        const p = make(r, key);
        out.push({ ...p, y: side * (y + p.d / 2), depth: j * 0.32, lift: 0 });
        y += p.d + gap;
        half = Math.max(half, y);
      }
    }
  });
  // Pedal towers, outside the manual chest; tallest at the outer ends.
  const inner = half + 0.5;
  PEDAL_ROWS.filter((r) => by[r]).forEach((r, j) => {
    for (const side of [1, -1]) {
      let y = inner;
      for (const key of by[r].filter((k) => (k % 2 === 0) === (side > 0)).reverse()) {
        const p = make(r, key);
        out.push({ ...p, y: side * (y + p.d / 2), depth: 0.2 + j * 0.45, lift: -0.4 });
        y += p.d + gap;
      }
    }
  });
  const ys = out.map((p) => Math.abs(p.y) + p.d / 2);
  const tall = Math.max(...out.map((p) => p.foot + p.len + p.lift));
  const s = Math.min(1, width / (2 * Math.max(...ys)), height / tall);
  return out.map((p) => ({
    ...p, w: p.d * s, foot: p.foot * s, h: (p.foot + p.len) * s,
    mx: ORGAN.x0 - 0.3 + p.depth * s, my: p.y * s, mz: SCREEN.top + 0.4 + p.lift * s, scale: s,
  }));
}
