// How much of a song an arrangement keeps, and where its sound sits.
// Used by arr-check (note-seconds) and arr-render (rendered loudness).
import { STOPS } from '../engine/organ.js';

export const oct = (k) => Math.floor(k / 12) - 1;
// Sounding pitch of a pipe-note, as a MIDI key (fractional for quints).
export const sounding = (e) => e.key + 12 * Math.log2(8 / STOPS[e.stop].feet);
// Ranks at unison or octave pitch: the ones that say which note it is.
const octaveRank = (stop) => Number.isInteger(Math.log2(STOPS[stop].feet));
// Division and role. Old arrangements carry neither: infer them as the app did.
export const divOf = (e) => e.div ?? (e.pedal ? 'pedal' : (e.gain ?? 1) < 1 ? 'swell' : 'great');
export const roleOf = (e) => e.role ?? (e.pedal ? 'bass' : (e.gain ?? 1) < 1 ? 'harmony' : 'tune');

// Notes in the window that the arrangement could have used: no drums, no
// muted ghost parts, no synth drums or sound effects (program 112 and up).
export function sourceNotes(midi, from, to) {
  const muted = (n) => n.vel < 10 || midi.ctl?.[`${n.track}/${n.ch}`]?.vol?.[0]?.[1] === 0 || midi.programs?.[`${n.track}/${n.ch}`] >= 112;
  return midi.notes.filter((n) => n.ch !== 9 && n.t >= from && n.t < to && !muted(n));
}

const shares = (items, keyOf, weightOf) => {
  const h = {}; let tot = 0;
  for (const x of items) { const o = oct(Math.round(keyOf(x))); const w = weightOf(x); h[o] = (h[o] || 0) + w; tot += w; }
  for (const o in h) h[o] = (100 * h[o]) / (tot || 1);
  return h;
};

// arr: { events, from, to, speed, offset } with event times in output seconds.
export function metrics(midi, arr) {
  const { from, speed = 1, offset = 0 } = arr;
  const to = Math.min(arr.to, midi.length);
  const src = sourceNotes(midi, from, to);
  // Swell pipes sound through the box (old arrangements have none).
  const boxAt = (t) => { let g = 1; for (const [bt, v] of arr.box ?? []) { if (bt > t) break; g = v; } return g; };
  const ev = arr.events.map((e) => ({ ...e, st: from + (e.t - offset) * speed, sd: e.dur * speed, bx: divOf(e) === 'swell' && e.div ? boxAt(e.t + e.dur / 2) : 1 }));
  // The bass a listener hears: a short note is heard until the next note of
  // its part starts (at most 1 s), as a plucked or struck note rings on.
  const held = [], byPart = {};
  for (const n of src) (byPart[`${n.track}/${n.ch}`] ??= []).push(n);
  for (const ns of Object.values(byPart)) ns.forEach((n, i) => { const nx = ns.slice(i + 1).find((m) => m.t > n.t + 0.01); held.push({ ...n, dur: Math.max(n.dur, Math.min(1, (nx?.t ?? n.t + n.dur) - n.t)) }); });
  // One entry per note played (not per rank).
  const seen = new Set(), notes = [];
  for (const e of ev) {
    const id = `${Math.round(e.st * 1000)}:${e.note ?? e.key}:${roleOf(e)}`;
    if (!seen.has(id)) { seen.add(id); notes.push(e); }
  }
  const srcSec = src.reduce((a, n) => a + n.dur, 0), arrSec = notes.reduce((a, e) => a + e.sd, 0);
  // Frames of 0.25 s: pitch classes and the bass note.
  const pcEv = ev.filter((e) => octaveRank(e.stop));
  let pcs = 0, pck = 0, bassOK = 0, frames = 0;
  for (let t = from; t < to; t += 0.25) {
    const a = src.filter((n) => n.t <= t && n.t + n.dur > t);
    if (!a.length) continue;
    frames++;
    const b = pcEv.filter((e) => e.st <= t && e.st + e.sd > t);
    const pa = new Set(a.map((n) => n.key % 12)), pb = new Set(b.map((e) => Math.round(sounding(e)) % 12));
    pcs += pa.size; pck += [...pa].filter((x) => pb.has(x)).length;
    const lo = Math.min(...held.filter((n) => n.t <= t && n.t + n.dur > t).map((n) => n.key));
    if (b.length && Math.round(Math.min(...b.map(sounding))) % 12 === lo % 12) bassOK++;
  }
  const regSrc = shares(src, (n) => n.key, (n) => n.dur);
  const regArr = shares(ev, sounding, (e) => e.sd * (e.gain ?? 1) * e.bx * STOPS[e.stop].level);
  // Register test: every octave with 5 % of the source keeps half its share.
  const regFail = Object.entries(regSrc).filter(([o, s]) => s >= 5 && (regArr[o] || 0) < s / 2).map(([o]) => `C${o}`);
  const live = Object.keys(regArr).filter((o) => regArr[o] >= 1).map(Number);
  const span = live.length ? Math.max(...live) - Math.min(...live) + 1 : 0;
  const w = (e) => e.sd * (e.gain ?? 1) * e.bx * STOPS[e.stop].level;
  const part = (f) => { const h = {}; let tot = 0; for (const e of ev) { h[f(e)] = (h[f(e)] || 0) + w(e); tot += w(e); } for (const k in h) h[k] = Math.round((100 * h[k]) / tot); return h; };
  // Peak pipes sounding at once (a repeated pipe is one voice).
  const pts = [];
  for (const e of arr.events) pts.push([e.t, 1, `${e.stop}:${e.key}`], [e.t + e.dur, -1, `${e.stop}:${e.key}`]);
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const on = new Map(); let peak = 0;
  for (const [, d, id] of pts) { on.set(id, (on.get(id) || 0) + d); if (!on.get(id)) on.delete(id); peak = Math.max(peak, on.size); }
  // Swell or pedal pipes struck again within 250 ms (output time).
  const last = {}; let restrike = 0;
  for (const e of [...arr.events].sort((a, b) => a.t - b.t)) {
    if (divOf(e) === 'great') continue;
    const id = `${e.stop}:${e.key}`;
    if (last[id] != null && e.t - last[id] < 0.25) restrike++;
    last[id] = e.t;
  }
  const len = to - from;
  return {
    kept: Math.round((100 * arrSec) / srcSec), pc: Math.round((100 * pck) / pcs), bass: Math.round((100 * bassOK) / frames),
    polySrc: +(srcSec / len).toFixed(1), polyArr: +(arrSec / len).toFixed(1),
    regSrc, regArr, regFail, span, div: part(divOf), role: part(roleOf), peak, restrike,
  };
}

export const regStr = (h) => Object.keys(h).map(Number).sort((a, b) => a - b).filter((o) => h[o] >= 0.5).map((o) => `${o}:${Math.round(h[o])}`).join(' ');
