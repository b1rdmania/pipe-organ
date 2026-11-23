// Orchestrate any MIDI file for the York Minster organ, as an organist would
// arrange a pop song: tune on the Great, harmony on the Swell (in its box),
// bass on the Pedal; ranks added at each new section; the busy parts thinned
// for an 8-second echo. Design: REVIEW-MIDI-ENGINE.md.
// A score written for organ (organ or pipe programs, no drums) is played as
// written, through arrange().
import { arrange, GM } from './arranger.js';
import { STOPS, STYLES } from './organ.js';

// Ranks drawn at each level (1 verse .. 4 last chorus), added in turn.
const RANKS = {
  great: [['ymDiap8a'], ['ymOctave4'], ['ymPrincipal4'], ['ymSuper2']],
  swell: [['ymStopped8'], ['ymDiap8b'], ['ymDouble16'], ['ymOctave4']],
  pedal: [['ymPedSub16', 'ymPedPrin8'], ['ymPedDiap16'], ['ymPedWood16'], ['ymPedWood32']],
};
const ranksAt = (div, level) => RANKS[div].slice(0, level).flat();
// Swell box opening by level.
const BOX = [0, 0.45, 0.6, 0.75, 0.9];
// Gain per role, from the balance pass (tools/arr-render.mjs): rendered RMS
// of tune 35-45 %, harmony 30-40 %, pedal 15-25 %.
export const GAIN = { tune: 1, harmony: 0.5, bass: 0.8 };
// Rendered loudness per unit of the note-seconds estimate, per role
// (tools/arr-render.mjs --calibrate). Lets the engine balance each song
// before it is heard.
export const CAL = { tune: 1, harmony: 1.052, bass: 1.195 };
// Shares of rendered RMS aimed for: the middle of each band.
export const TARGET = { tune: 0.4, harmony: 0.38, bass: 0.22 };

// Time to 90 % of full speech, ms, at keys 36 43 48 55 60 67
// (tools/speech-york.mjs). A big pipe only gets notes long enough to speak.
const SPEAK = {
  ymPedWood32: [720, 440, 300, 200, 150, 120], ymPedWood16: [300, 200, 150, 120, 100, 70],
  ymPedDiap16: [360, 240, 170, 130, 100, 80], ymDouble16: [420, 240, 210, 130, 100, 70],
};
const SPEAK_KEYS = [36, 43, 48, 55, 60, 67];
export function speaks(stop, key, dur) {
  const s = SPEAK[stop];
  if (!s) return true;
  let i = SPEAK_KEYS.findIndex((k) => k >= key); if (i < 0) i = s.length - 1;
  return dur >= Math.max(0.25, (1.5 * s[i]) / 1000) && (stop !== 'ymPedWood32' || dur >= 0.5);
}

const id = (n) => `${n.track}/${n.ch}`;
const avg = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);

// A score for the organ already: play it as written.
export function isOrganScore(midi) {
  if (midi.notes.some((n) => n.ch === 9)) return false;
  const ids = new Set(midi.notes.map(id));
  return ids.size > 0 && [...ids].every((p) => ['organ', 'pipe'].includes(GM(midi.programs?.[p])));
}

// Value of a controller curve at time t ([[t, v]], held), or a default.
const at = (curve, t, d) => { let v = d; for (const [tt, x] of curve ?? []) { if (tt > t) break; v = x; } return v; };

// Beats: each bar split by its time signature's numerator.
function beatGrid(midi) {
  const b = midi.bars?.length > 1 ? midi.bars : [0, 2];
  const out = [];
  for (let i = 0; i + 1 < b.length; i++) {
    const num = at((midi.timeSig ?? []).map(([t, n]) => [t, n]), b[i] + 1e-6, 4);
    for (let k = 0; k < num; k++) out.push(b[i] + ((b[i + 1] - b[i]) * k) / num);
  }
  return out;
}

// The window: the first block of 32 s that repeats and is about as loud as
// the loudest; start 4 bars before it so the chorus arrives as a step up.
function chooseWindow(midi, notes, opts) {
  const bars = midi.bars?.length > 1 ? midi.bars : [0];
  const snap = (t) => bars.reduce((b, x) => (Math.abs(x - t) < Math.abs(b - t) ? x : b), bars[0]);
  const barIdx = (t) => bars.indexOf(snap(t));
  if (opts.from != null) {
    const to = opts.to ?? opts.from + (opts.seconds ?? 40);
    return { from: opts.from, chorus: opts.from, to };
  }
  const W = 2, N = Math.ceil(midi.length / W), L = 16;
  const chroma = Array.from({ length: N }, () => new Float64Array(12)), en = new Float64Array(N);
  for (const n of notes) for (let i = Math.floor(n.t / W); i <= Math.min(N - 1, Math.floor((n.t + n.dur) / W)); i++) {
    const o = Math.min(n.t + n.dur, (i + 1) * W) - Math.max(n.t, i * W);
    if (o > 0) { chroma[i][n.key % 12] += o; en[i] += o; }
  }
  for (const n of midi.notes) if (n.ch === 9) en[Math.min(N - 1, Math.floor(n.t / W))] += 0.15;
  if (N < L + 2) return { from: 0, chorus: 0, to: midi.length };
  const blk = (i) => { const v = []; for (let k = 0; k < L; k++) v.push(...chroma[i + k]); return v; };
  const cos = (a, b) => { let x = 0, y = 0, z = 0; for (let i = 0; i < a.length; i++) { x += a[i] * b[i]; y += a[i] * a[i]; z += b[i] * b[i]; } return x / Math.sqrt(y * z || 1); };
  const sum = (i) => { let s = 0; for (let k = 0; k < L; k++) s += en[i + k]; return s; };
  let maxE = 0; for (let i = 0; i + L <= N; i++) maxE = Math.max(maxE, sum(i));
  const rows = [];
  for (let i = 0; i + L <= N; i++) {
    const a = blk(i); let reps = 0;
    for (let j = 0; j + L <= N; j++) if (Math.abs(j - i) >= L && cos(a, blk(j)) > 0.8) reps++;
    const e = sum(i) / maxE;
    rows.push({ t: i * W, reps, score: e * e * (1 + Math.min(reps, 6) / 3) });
  }
  const best = Math.max(...rows.map((r) => r.score));
  const pick = rows.find((r) => r.reps > 0 && r.score >= 0.85 * best) ?? rows.find((r) => r.score === best);
  const c = barIdx(pick.t);
  const chorus = bars[c];
  const from = bars[Math.max(0, c - 4)];
  const to = Math.min(midi.length, snap(chorus + (opts.seconds ?? 32)));
  return { from, chorus, to };
}

// Notes that copy another part at the same times, an octave or more away.
function copies(a, b) {
  const m = new Map();
  for (const n of b) { const k = Math.round(n.t * 100); (m.get(k) ?? m.set(k, []).get(k)).push(n.key); }
  let hit = 0;
  for (const n of a) { const k = Math.round(n.t * 100); if ([k - 1, k, k + 1].some((x) => m.get(x)?.some((key) => (key - n.key) % 12 === 0))) hit++; }
  return hit / Math.max(a.length, 1);
}

// Merge notes of the same key that overlap or follow within `gap` seconds.
function tie(ns, gap) {
  const byKey = {};
  for (const n of ns) (byKey[n.key] ??= []).push(n);
  const out = [];
  for (const list of Object.values(byKey)) {
    list.sort((a, b) => a.t - b.t);
    let cur = null;
    for (const n of list) {
      if (cur && n.t - (cur.t + cur.dur) < gap) cur.dur = Math.max(cur.dur, n.t + n.dur - cur.t);
      else { cur = { ...n }; out.push(cur); }
    }
  }
  return out.sort((a, b) => a.t - b.t || a.key - b.key);
}

export function plan(midi, opts = {}) {
  const speed = opts.speed ?? 0.82;
  const vol = (p) => at(midi.ctl?.[p]?.vol, 0, 100 / 127);
  // Parts, without drums or muted ghosts.
  const all = {};
  for (const n of midi.notes) if (n.ch !== 9) (all[id(n)] ??= []).push(n);
  const why = [], parts = [];
  for (const [p, ns] of Object.entries(all)) {
    if (opts.keep && !opts.keep.includes(p)) continue;
    if (avg(ns.map((n) => n.vel)) < 10 || vol(p) === 0) { why.push(`drop ${p}: muted`); continue; }
    // Drum-like programs (synth drum, taiko, sound effects) are not notes for pipes.
    if (midi.programs?.[p] >= 112) { why.push(`drop ${p}: percussion or effect`); continue; }
    parts.push({ id: p, all: ns, name: (midi.names?.[ns[0].track] || '').trim().toLowerCase(), kind: GM(midi.programs?.[p]), mix: vol(p) });
  }
  // Octave (or unison) copies: keep the part with more notes.
  for (const a of parts) for (const b of parts) {
    if (a === b || a.copy || b.copy || a.all.length > b.all.length || (a.all.length === b.all.length && a.id < b.id)) continue;
    if (copies(a.all, b.all) > 0.9) { a.copy = true; why.push(`drop ${a.id}: copy of ${b.id}`); }
  }
  const live = parts.filter((p) => !p.copy);
  const win = chooseWindow(midi, live.flatMap((p) => p.all), opts);
  const { from, to, chorus } = win;
  // Stats inside the window.
  for (const p of live) {
    const ns = p.ns = p.all.filter((n) => n.t >= from && n.t < to);
    let chords = 0, rep = 0; const last = {};
    for (let i = 0; i < ns.length; i++) {
      if (i && ns[i].t - ns[i - 1].t < 0.03) chords++;
      if (last[ns[i].key] != null && ns[i].t - last[ns[i].key] < 0.3) rep++;
      last[ns[i].key] = ns[i].t;
    }
    Object.assign(p, { avg: avg(ns.map((n) => n.key)), dur: avg(ns.map((n) => n.dur)), poly: chords / (ns.length || 1), short: ns.filter((n) => n.dur < 0.12).length / (ns.length || 1), rep: rep / (ns.length || 1) });
  }
  const used = live.filter((p) => p.ns.length >= 8);
  for (const p of live) if (p.ns.length < 8) why.push(`drop ${p.id}: ${p.ns.length} notes in the window`);
  // Roles.
  const mono = (p) => p.poly < 0.35;
  const bass = used.filter((p) => p.avg < 52 && mono(p)).sort((a, b) => a.avg - b.avg)[0] ?? used.filter((p) => p.avg < 48).sort((a, b) => a.avg - b.avg)[0];
  if (bass) bass.role = 'bass';
  const voiceLike = (p) => (/melod|vocal|lead|sing|tune/.test(p.name) ? 3 : 0) + (['lead', 'reed', 'pipe', 'brass'].includes(p.kind) ? 1 : 0) + (/voice/.test(p.name) ? 1 : 0);
  const melody = used.find((p) => p.id === opts.solo) ?? used.filter((p) => !p.role && p.avg >= 58 && mono(p)).sort((a, b) => voiceLike(b) - voiceLike(a) || b.ns.length - a.ns.length)[0];
  if (melody) melody.role = 'melody';
  for (const p of used) {
    if (p.role) continue;
    if (p.short >= 0.5 || p.rep >= 0.25) p.role = 'rhythm';
    else if (p.dur >= 0.8) p.role = 'pad';
    else if (mono(p) && melody && copies(p.ns, melody.ns) > 0.6) p.role = 'drop';
    else if (mono(p)) p.role = 'counter';
    else p.role = 'chords';
  }
  for (const p of used) why.push(`${p.role} ${p.id}: ${p.name || p.kind}`);

  // Sections: 4 bars at level 2, the chorus at 3, its second half at 4.
  const bars = midi.bars?.length > 1 ? midi.bars : [from, to];
  const snap = (t) => bars.reduce((b, x) => (Math.abs(x - t) < Math.abs(b - t) ? x : b), bars[0]);
  const sections = chorus > from
    ? [{ t0: from, t1: chorus, level: 2 }, { t0: chorus, t1: snap((chorus + to) / 2), level: 3 }, { t0: snap((chorus + to) / 2), t1: to, level: 4 }]
    : [{ t0: from, t1: to, level: opts.level ?? 3 }];
  const levelAt = (t) => (sections.find((s) => t >= s.t0 && t < s.t1) ?? sections.at(-1)).level;

  // Swell box: expression (CC11) of the pad parts times the level, over 1 s.
  const pads = used.filter((p) => ['pad', 'chords', 'rhythm'].includes(p.role) && midi.ctl?.[p.id]?.expr?.length);
  const raw = [];
  for (let t = from; t < to + 2; t += 0.1) {
    const e = pads.length ? avg(pads.map((p) => at(midi.ctl[p.id].expr, t, 1))) : 1;
    raw.push(BOX[levelAt(t)] * (0.3 + 0.7 * e));
  }
  const box = [];
  for (let i = 0; i < raw.length; i++) {
    const g = avg(raw.slice(Math.max(0, i - 5), i + 5));
    if (!box.length || Math.abs(g - box.at(-1)[1]) > 0.01 || i === raw.length - 1) box.push([(i * 0.1) / speed, +g.toFixed(3)]);
  }
  return {
    window: { from, to, chorus }, sections, speed, beats: beatGrid(midi),
    parts: used.map((p) => ({ id: p.id, role: p.role, mix: p.mix, name: p.name || p.kind })),
    box, why, levelAt, notesOf: Object.fromEntries(used.map((p) => [p.id, p.ns])),
  };
}

// Notes for each role, in source seconds, after the density rules.
function voices(midi, P) {
  const { from, to } = P.window;
  const of = (role) => P.parts.filter((p) => p.role === role);
  const mixOf = Object.fromEntries(P.parts.map((p) => [p.id, p.mix]));
  const tag = (ns, p) => ns.map((n) => ({ t: n.t, dur: n.dur, key: n.key, mix: mixOf[p] }));
  const fold = (k, lo, hi) => { while (k > hi) k -= 12; while (k < lo) k += 12; return k; };
  const beats = P.beats;
  const beatAt = (t) => { let i = 0; while (i + 1 < beats.length && beats[i + 1] <= t) i++; return i; };
  const beatLen = (t) => { const i = beatAt(t); return (beats[i + 1] ?? beats[i] + 0.5) - beats[i]; };
  // Half bars, for the rhythm chords and the tenor rule.
  const halves = [];
  for (let i = 0; i < beats.length; i += 2) if (beats[i] >= from - 1e-6 && beats[i] < to) halves.push([beats[i], beats[i + 2] ?? to]);
  if (!halves.length) for (let t = from; t < to; t += 1) halves.push([t, t + 1]);

  // Tune: every note, at least 120 ms, 60 ms gap before a repeat.
  const tune = of('melody').flatMap((p) => tag(P.notesOf[p.id], p.id)).sort((a, b) => a.t - b.t);
  for (let i = 0; i < tune.length; i++) {
    const n = tune[i]; n.key = fold(n.key, 36, 93); n.dur = Math.max(n.dur, 0.12);
    const next = tune.slice(i + 1).find((m) => m.key === n.key);
    if (next && n.t + n.dur > next.t - 0.06) n.dur = Math.max(0.05, next.t - 0.06 - n.t);
  }
  const counter = of('counter').flatMap((p) => tag(P.notesOf[p.id], p.id)).map((n) => ({ ...n, key: fold(n.key, 36, 93), dur: Math.max(n.dur, 0.12) }));

  // Bass: whole-part octave shift to sit on the pedals, then thin and hold.
  const kicks = midi.notes.filter((n) => n.ch === 9 && (n.key === 35 || n.key === 36)).map((n) => n.t);
  let bass = [];
  const bassPart = of('bass')[0];
  let shift = 0;
  if (bassPart) {
    const ns = tag(P.notesOf[bassPart.id], bassPart.id).sort((a, b) => a.t - b.t || a.key - b.key);
    const lo = Math.min(...ns.map((n) => n.key));
    shift = lo < 36 ? 12 * Math.ceil((36 - lo) / 12) : 0;
    for (const n of ns) n.key = fold(n.key + shift, 36, 67);
    // Same pitch struck again inside one beat: one note.
    for (const n of ns) {
      const cur = bass.at(-1);
      if (cur && cur.key === n.key && n.t - cur.t < beatLen(cur.t) * 0.99) cur.dur = Math.max(cur.dur, n.t + n.dur - cur.t);
      else if (cur && Math.abs(n.t - cur.t) < 0.03) { if (n.key < cur.key) Object.assign(cur, n); } // a chord: its lowest note
      else if (cur && n.key > cur.key && n.t < cur.t + cur.dur - 0.05) continue; // an upper note over a held one
      else bass.push({ ...n });
    }
    // Inside a beat keep the first note and any change of pitch class; drop
    // octave jumps and repeats, unless on a kick and a beat from the last.
    const keep = []; let beat = -1, pcs = new Set();
    for (const n of bass) {
      const b = beatAt(n.t + 0.02);
      if (b !== beat) { beat = b; pcs = new Set([n.key % 12]); keep.push(n); continue; }
      const onKick = kicks.some((k) => Math.abs(k - n.t) < 0.04) && n.t - keep.at(-1).t >= beatLen(n.t) * 0.99;
      if (!pcs.has(n.key % 12) || onKick) { pcs.add(n.key % 12); keep.push(n); }
    }
    bass = keep;
    // Hold each note to 85 % of the gap to the next, at least 250 ms.
    for (let i = 0; i < bass.length; i++) {
      const n = bass[i], gap = (bass[i + 1]?.t ?? n.t + n.dur / 0.85) - n.t;
      n.dur = Math.max(0.25, Math.min(0.85 * gap, n.dur + beatLen(n.t)));
    }
  }

  // Harmony: rhythm parts as one held chord per half bar, voiced in 48-72.
  let harm = [];
  for (const p of of('rhythm')) {
    const ns = P.notesOf[p.id];
    for (const [a, b] of halves) {
      const keys = new Set(ns.filter((n) => n.t >= a - 0.03 && n.t < b - 0.03).map((n) => fold(n.key, 48, 72)));
      for (const key of keys) harm.push({ t: a, dur: b - a, key, mix: p.mix });
    }
  }
  for (const p of [...of('pad'), ...of('chords')]) harm.push(...tag(P.notesOf[p.id], p.id).map((n) => ({ ...n, key: n.key > 93 ? fold(n.key, 36, 93) : n.key })));
  // Below the manual: to the pedal if it is free, else dropped.
  const pedalAt = (t) => bass.filter((n) => n.t <= t + 0.02 && n.t + n.dur > t);
  const low = harm.filter((n) => n.key < 36);
  harm = harm.filter((n) => n.key >= 36);
  for (const n of low) {
    const on = pedalAt(n.t);
    if (!on.length) bass.push({ ...n, key: fold(n.key + 12, 36, 67), dur: Math.max(0.25, n.dur) });
  }
  bass.sort((a, b) => a.t - b.t);
  harm = tie(harm, 0.3);
  // At most five notes at once: a new pitch class pushes out a doubled one.
  const kept = [];
  for (const n of harm) {
    const on = kept.filter((m) => m.t + m.dur > n.t + 0.02);
    if (on.length >= 5) {
      const pcs = on.map((m) => m.key % 12);
      if (pcs.includes(n.key % 12)) continue;
      const dup = on.find((m, i) => pcs.indexOf(m.key % 12) !== i) ?? on.sort((a, b) => a.t - b.t)[0];
      dup.dur = n.t - dup.t;
    }
    kept.push(n);
  }
  harm = kept.filter((n) => n.dur >= 0.1);
  // Tenor hole: nothing in 48-59 for a half bar, copy the lowest note there.
  const add = [];
  for (const [a, b] of halves) {
    const on = harm.filter((n) => n.t < b && n.t + n.dur > a);
    if (!on.length || on.some((n) => n.key >= 48 && n.key < 60)) continue;
    const lo = on.reduce((x, n) => (n.key < x.key ? n : x));
    const t0 = Math.max(a, lo.t), t1 = Math.min(b, lo.t + lo.dur);
    if (t1 - t0 > 0.1) add.push({ t: t0, dur: t1 - t0, key: fold(lo.key, 48, 59), mix: lo.mix, tenor: true });
  }
  harm = tie([...harm, ...add], 0.3);
  return { tune, counter, bass, harm, shift };
}

// Turn a plan into pipe-notes. Events: { t, dur, stop, key, pedal, gain, div,
// role, note }, t in output seconds (offset added).
function build(midi, P, opts) {
  const { from, to } = P.window;
  const speed = P.speed, offset = opts.offset ?? 0;
  const v = voices(midi, P);
  const events = [];
  const mixOf = (n) => 0.6 + 0.4 * (n.mix ?? 0.8);
  const put = (n, stops, div, role, gain) => {
    if (n.t < from || n.t >= to) return;
    const t = (n.t - from) / speed + offset, dur = Math.min(n.dur, to + 2 - n.t) / speed;
    for (const stop of stops) {
      if (!speaks(stop, n.key, dur)) continue;
      // No 16′ below tenor C, nor on a tenor copy: the copy already fills it.
      if (stop === 'ymDouble16' && (n.key < 48 || n.tenor)) continue;
      let k = n.key;
      while (k + 12 * Math.log2(8 / STOPS[stop].feet) > 100) k -= 12;
      // A manual double is voiced under the unison, as English doubles are.
      const g = stop === 'ymDouble16' ? 0.6 : 1;
      events.push({ t, dur, stop, key: k, note: n.key, pedal: div === 'pedal', gain: gain * g * mixOf(n), div, role });
    }
  };
  const g = opts.gain ?? GAIN;
  for (const n of v.tune) put(n, ranksAt('great', P.levelAt(n.t)), 'great', 'tune', g.tune);
  for (const n of v.counter) put(n, [...new Set([...ranksAt('swell', Math.min(2, P.levelAt(n.t))), 'ymOctave4'])], 'swell', 'harmony', g.harmony);
  for (const n of v.harm) {
    const L = P.levelAt(n.t);
    put(n, ranksAt('swell', L), 'swell', 'harmony', g.harmony);
    if (L >= 4) put(n, ranksAt('great', 1), 'great', 'harmony', g.harmony * 0.5); // Swell to Great
  }
  for (const n of v.bass) put(n, ranksAt('pedal', P.levelAt(n.t)), 'pedal', 'bass', g.bass);
  events.sort((a, b) => a.t - b.t);
  // A Swell or Pedal pipe cannot speak twice at once, and should not be
  // struck again within 250 ms: such a note joins the one before it.
  const last = {}, out = [];
  for (const e of events) {
    const k = `${e.stop}:${e.key}`, p = last[k];
    if (e.div !== 'great' && p && (e.t - p.t < 0.25 || e.t < p.t + p.dur)) { p.dur = Math.max(p.dur, e.t + e.dur - p.t); continue; }
    last[k] = e; out.push(e);
  }
  return { events: out, shift: v.shift };
}

// Most pipes sounding at once (a pipe struck again is one voice).
export function peakVoices(events) {
  const pts = [];
  for (const e of events) pts.push([e.t, 1, `${e.stop}:${e.key}`], [e.t + e.dur, -1, `${e.stop}:${e.key}`]);
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const on = new Map(); let peak = 0;
  for (const [, d, k] of pts) { const c = (on.get(k) || 0) + d; if (c) on.set(k, c); else on.delete(k); peak = Math.max(peak, on.size); }
  return peak;
}

// Estimated loudness per role: incoherent sum of pipes, with the box.
export function loudness(events, box = []) {
  const boxAt = (t) => at(box, t, 1);
  const e = {}; let len = 0;
  for (const x of events) {
    const a = x.gain * STOPS[x.stop].level * (x.div === 'swell' ? boxAt(x.t + x.dur / 2) : 1);
    e[x.role] = (e[x.role] || 0) + x.dur * a * a;
    len = Math.max(len, x.t + x.dur);
  }
  return Object.fromEntries(Object.entries(e).map(([r, v]) => [r, Math.sqrt(v / (len || 1)) * (CAL[r] ?? 1)]));
}

// The arrangement the app plays. opts: { from, to, speed (0.82), offset
// (seconds added to every event and the box), solo, keep, seconds, balance
// (default true) }. Returns arrange()'s shape plus { from, to, speed,
// offset, box, plan }.
export function orchestrate(midi, opts = {}) {
  const speed = opts.speed ?? 0.82, offset = opts.offset ?? 0;
  const pipesOf = (events) => {
    const used = {};
    for (const e of events) (used[e.stop] ??= new Set()).add(e.key);
    return Object.entries(used).flatMap(([stop, keys]) => [...keys].sort((a, b) => a - b).map((key) => ({ stop, key })));
  };
  const finish = (events, extra) => ({
    style: 'york', events, pipes: pipesOf(events), length: events.reduce((m, e) => Math.max(m, e.t + e.dur), 0),
    stops: Object.fromEntries([...new Set(events.map((e) => e.stop))].map((s) => [s, STOPS[s]])), speed, offset, ...extra,
  });
  if (isOrganScore(midi) && !opts.pop) {
    const from = opts.from ?? 0, to = opts.to ?? from + (opts.seconds ?? 48);
    const a = arrange(midi, 'york', { from, to, speed, keep: opts.keep, manual: STYLES.york.manual, pedal: STYLES.york.pedal });
    const events = offset ? a.events.map((e) => ({ ...e, t: e.t + offset })) : a.events;
    return finish(events, { from, to, box: [], plan: { organ: true, why: ['organ score: played as written'] } });
  }
  const P = plan(midi, { ...opts, speed });
  let { events, shift } = build(midi, P, opts);
  // Balance: scale each role to its share of the estimated loudness.
  let gain = { ...(opts.gain ?? GAIN) };
  if (opts.balance !== false) {
    const L = loudness(events, P.box);
    const tot = Object.values(L).reduce((a, b) => a + b, 0);
    for (const r of Object.keys(L)) gain[r] *= (TARGET[r] * tot) / L[r];
    const top = Math.max(...Object.values(gain)); for (const r in gain) gain[r] /= top;
    ({ events } = build(midi, P, { ...opts, gain }));
  }
  // The player has 128 voices: past 100 pipes at once, take off the
  // coupler, then the Swell's 16′ and 4′.
  for (const cut of [(e) => e.role === 'harmony' && e.div === 'great', (e) => e.div === 'swell' && (e.stop === 'ymDouble16' || e.stop === 'ymOctave4')]) {
    if (peakVoices(events) <= 100) break;
    events = events.filter((e) => !cut(e));
  }
  const box = P.box.map(([t, g]) => [t + offset, g]);
  const { from, to } = P.window;
  return finish(events, { from, to, box, plan: { window: P.window, sections: P.sections, parts: P.parts, bassShift: shift, gain, why: P.why } });
}
