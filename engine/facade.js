// Where every pipe stands, in metres. One map for the picture and the sound.
// x: right of the organ's centre line. y: up from the floor. z: depth, 0 = front.
// Layout, centre out: the 8′ principal in a mitre (tallest in the middle), then
// each further rank split into a C side (left) and a C♯ side (right), smaller
// ranks further out, with the pedal towers at the ends as real organs do.
import { STOPS, pipeHz } from './organ.js';

const C = 343;
const SCALE = { open: 1 / 13, stopped: 1 / 9 }; // diameter / length, roughly a principal's scale

export function speakingLength(stopId, key) {
  const s = STOPS[stopId];
  const f = pipeHz(s, key);
  return s.stopped ? C / (4 * f) : C / (2 * f);
}

export function facade(pipes, styleRanks) {
  const gap = 0.05;
  const byRank = {};
  for (const p of pipes) (byRank[p.stop] ??= []).push(p.key);
  for (const k in byRank) byRank[k].sort((a, b) => a - b);
  const out = [];
  const make = (stop, key, pedal) => {
    const len = speakingLength(stop, key);
    const d = Math.max(0.02, len * (STOPS[stop].stopped ? SCALE.stopped : SCALE.open));
    return { id: `${stop}:${key}`, stop, key, pedal, len, d, foot: Math.min(0.6, 0.15 + len * 0.08) };
  };

  // Centre flat: the first manual rank as a mitre.
  const [lead, ...rest] = styleRanks.manual;
  const centre = [];
  (byRank[lead] || []).forEach((k, i) => (i % 2 ? centre.push(k) : centre.unshift(k)));
  const cw = centre.reduce((a, k) => a + make(lead, k, false).d + gap, -gap);
  let x = -cw / 2;
  const impost = 6; // the gallery: pipe feet stand 6 m up
  for (const k of centre) {
    const p = make(lead, k, false);
    out.push({ ...p, x: x + p.d / 2, y: impost, z: 0 });
    x += p.d + gap;
  }

  // A rank split into a C side (left) and a C♯ side (right), each a flat that
  // starts `edge` metres from the centre line, biggest pipe nearest the centre.
  const flank = (stop, pedal, edge, y, z) => {
    const keys = byRank[stop] || [];
    const sides = { L: keys.filter((k) => k % 2 === 0), R: keys.filter((k) => k % 2 === 1) };
    let top = y;
    flank.width = 0;
    for (const [s, ks] of Object.entries(sides)) {
      let xx = edge;
      for (const k of ks) {
        const p = make(stop, k, pedal);
        out.push({ ...p, x: (s === 'L' ? -1 : 1) * (xx + p.d / 2), y, z });
        xx += p.d + gap;
        top = Math.max(top, y + p.foot + p.len);
      }
      flank.width = Math.max(flank.width, xx - edge);
    }
    return top;
  };
  // Smaller ranks stack above the main one, as in a north-European case:
  // each a pair of flats on its own floor, a little further back.
  let floor = Math.max(impost, ...out.map((p) => p.y + p.foot + p.len)) + 0.35;
  rest.forEach((r, i) => { floor = flank(r, false, 0.15, floor, 0.3 * (i + 1)) + 0.35; });
  // Pedal towers stand either side, on a lower floor, set back.
  // With two pedal ranks, one tower each side; with one, split C / C♯.
  const pe = cw / 2 + 0.9;
  if (styleRanks.pedal.length === 2) {
    styleRanks.pedal.forEach((r, i) => {
      let xx = pe;
      for (const k of byRank[r] || []) {
        const p = make(r, k, true);
        out.push({ ...p, x: (i ? 1 : -1) * (xx + p.d / 2), y: impost - 1.5, z: 0.8 });
        xx += p.d + gap;
      }
    });
  } else for (const r of styleRanks.pedal) flank(r, true, pe, impost - 1.5, 0.8);
  return out;
}

// Where a pipe's sound comes from: its mouth, just above the foot.
export const mouth = (p) => [p.x, p.y + p.foot, p.z];
