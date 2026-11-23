// The organ in two cases, for St Paul's: north and south over the west end
// of the choir stalls, facing each other across the choir. The C side (even
// keys) stands in the north case, the C♯ side in the south case, as
// organSource() in engine/stpauls.js has it.
//
// Each case is a windchest along x: the manual ranks in rows from the front
// (the façade rank) back, each rank a mitre with its biggest pipes in the
// middle; the pedal ranks as towers at both ends, the biggest outermost.
// Real speaking lengths and diameters, scaled as one only if a case would
// not hold them (the 32′ needs about 11 m; the case is 10.5 m tall).
//
// Same fields as layoutOrgan (organ-layout.js), plus `face`: the direction
// the pipe's front looks, in radians about the vertical. 0 = west (York's
// façade); +π/2 = south (the north case), −π/2 = north (the south case).
// Apply it as a rotation about Three's y axis (see organ-view-face.md).
// Coordinates are cathedral metres: mx east, my north, mz up (pipe foot).
import { STOPS, STYLES, pipeHz } from '../engine/organ.js';
import { ORGAN } from '../engine/stpauls.js';

const isPedal = (stop) => Object.values(STYLES).some((s) => s.pedal.includes(stop));

export function layoutOrganSplit(pipes, { length = ORGAN.x1 - ORGAN.x0, height = ORGAN.top - ORGAN.z0, depth = ORGAN.depth } = {}) {
  const by = {};
  const pedalOf = {};
  for (const p of pipes) { (by[p.stop] ??= []).push(p.key); pedalOf[p.stop] = p.pedal ?? isPedal(p.stop); }
  for (const k in by) by[k].sort((a, b) => a - b);
  const manual = Object.keys(by).filter((r) => !pedalOf[r]);
  const pedal = Object.keys(by).filter((r) => pedalOf[r]);
  const gap = 0.03;
  const make = (stop, key) => {
    const s = STOPS[stop], f = pipeHz(s, key);
    const len = s.stopped ? 343 / (4 * f) : 343 / (2 * f);
    const d = Math.max(0.018, len / (s.stopped ? 12 : /Wood/.test(stop) ? 20 : 17)); // as organ-layout.js
    return { id: `${stop}:${key}`, stop, key, pedal: pedalOf[stop], len, d, foot: Math.min(0.6, 0.12 + len * 0.06) };
  };
  // Rows go back from the front of the case. The case is only 1.6 m deep,
  // so the rows are closer than York's; pipes in neighbouring rows overlap
  // in plan a little, as they would on a slider chest seen from the front.
  const mRow = (depth - 0.35) / Math.max(1, manual.length - 1);
  const pRow = (depth - 0.6) / Math.max(1, pedal.length - 1);
  const out = [];
  let manualHalf = 0;
  for (const side of [1, -1]) {
    const mine = (k) => (k % 2 === 0) === (side > 0);
    // Manual rows: a mitre, the biggest pipe at the centre, then left, right.
    manual.forEach((r, j) => {
      let left = 0, right = 0, first = true;
      for (const key of by[r].filter(mine)) {
        const p = make(r, key);
        let u;
        if (first) { u = 0; left = right = p.d / 2 + gap; first = false; }
        else if (right <= left) { u = right + p.d / 2; right += p.d + gap; }
        else { u = -(left + p.d / 2); left += p.d + gap; }
        out.push({ ...p, side, u, row: j * mRow, lift: 1.2 });
        manualHalf = Math.max(manualHalf, left, right);
      }
    });
    // Pedal towers: alternate ends, biggest outermost.
    pedal.forEach((r, j) => {
      const ends = { 1: 0, [-1]: 0 };
      by[r].filter(mine).forEach((key, i) => {
        const p = make(r, key), e = i % 2 ? -1 : 1;
        out.push({ ...p, side, end: e, along: ends[e] + p.d / 2, row: 0.15 + j * pRow, lift: 0.5 });
        ends[e] += p.d + gap;
      });
    });
  }
  // Pedal towers stand from the case ends inward; fit the whole width.
  const pedalW = Math.max(0, ...out.filter((p) => p.pedal).map((p) => p.along + p.d / 2));
  const need = 2 * Math.max(manualHalf + 0.3 + pedalW, pedalW * 2 + 0.3);
  const tall = Math.max(...out.map((p) => p.foot + p.len + p.lift));
  const s = Math.min(1, (length - 0.3) / need, (height - 0.3) / tall);
  const xc = (ORGAN.x0 + ORGAN.x1) / 2, xh = (ORGAN.x1 - ORGAN.x0) / 2 - 0.15;
  return out.map((p) => {
    const w = p.d * s;
    const ux = p.pedal ? p.end * (xh - p.along * s) : p.u * s;
    const across = ORGAN.y + 0.15 + p.row + w / 2; // rows go back (outward) from the case front
    return {
      ...p, w, foot: p.foot * s, h: (p.foot + p.len) * s,
      mx: xc + ux, my: p.side * across, mz: ORGAN.z0 + 0.15 + p.lift * s,
      depth: p.row, y: p.side * across, scale: s,
      face: p.side > 0 ? Math.PI / 2 : -Math.PI / 2,
    };
  });
}
