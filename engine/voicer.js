// The Voicer. A pipe comes from the pipe maker unvoiced: the mouth cut low, the
// toe left open, no nicks in the languid, the body cut long. That is how real
// flue pipes arrive at the voicing machine. The Voicer then does what a human
// voicer does, in the same order, and measures every step:
//   1. toe     sets the wind at the foot, so the pipe speaks at the rank's level
//   2. cut-up  raises the mouth until the tone is as round as the stop asks
//   3. nicks   cuts nicks in the languid until the edge noise at the start is right
//   4. length  trims or lengthens the body until the pipe is in tune
// Then it checks that the pipe holds its note when the wind sags or surges.
// Cut-up only goes up and nicks only go deeper: neither can be undone.
import { FluePipe } from './pipe.js';
import { measure, onset, cents } from './pitch.js';
import { pipeHz } from './organ.js';

// Seconds rendered per try: enough for a big pipe to settle (about 30 cycles).
const speakTime = (target) => Math.min(2, Math.max(0.4, 40 / target));

function listen(sr, params, target, seed, wind = 1, time = speakTime(target)) {
  const pipe = new FluePipe(sr, params, seed);
  pipe.noteOn();
  const n = Math.floor(sr * time);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = pipe.tick(wind);
  const period = sr / target;
  const maxLag = Math.ceil(period * 2.6);
  const win = Math.min(n - 1, maxLag + Math.ceil(Math.max(period * 6, sr * 0.04)));
  const m = measure(x.subarray(n - win), sr, target / 2.5, target * 3.5);
  const o = m.f > 0 ? onset(x, sr, m.f, m.rms) : { speak: time, chiff: 0 };
  return { x, m, o };
}

// The pipe maker's tolerances: deterministic per pipe, so the same organ is
// built the same way every time.
function roughness(seed) {
  const s = Math.sin(seed * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

// The voicing brief for a stop: how bright, how much chiff, how loud.
// tone: spectral centroid in harmonics. chiff: onset noise (see pitch.onset).
// Raw level is what the toe aims for; the mouth width (gain) scales the rank.
export function brief(stop, key, f = 262) {
  // Small pipes are voiced rounder: above about 600 Hz the brief eases off.
  const ease = f > 600 ? Math.pow(600 / f, 0.25) : 1;
  const tone = (stop.tone ?? (stop.stopped ? 1.8 : stop.bright <= 5 ? 2.2 : 4)) * ease;
  const chiff = stop.chiffTarget ?? (stop.stopped ? 3 : 2);
  // English diapasons rise a little in the treble; other ranks stay level.
  const rise = stop.stopped || stop.bright <= 5 ? 0 : 0.1;
  // A stopped pipe passes less wind for its size than an open one.
  const base = stop.stopped ? 1.0 : 1.5;
  const raw = base * (1 + rise * Math.max(-1, Math.min(1, (key - 60) / 24)));
  return { tone, chiff, raw, gain: (0.1 * stop.level) / base };
}

export function voicePipe(sr, stop, key, opts = {}) {
  const target = pipeHz(stop, key);
  const seed = key * 131 + stop.feet * 7 + (stop.stopped ? 3 : 0) + (stop.seed ?? 0);
  const rough = roughness(seed);
  const rough2 = roughness(seed + 0.5);
  const want = brief(stop, key, target);
  // A stopped pipe sounds an octave below an open pipe of the same length.
  const bore0 = stop.stopped ? sr / (2 * target) : sr / target;
  // As delivered by the pipe maker.
  let params = {
    bore: bore0 * (1.02 + 0.03 * rough), // cut long
    jetRatio: stop.jr * (0.66 + 0.08 * rough2), // mouth cut low
    foot: 1.0 + 0.2 * rough, // toe wide open
    chiff: stop.chiff * 4 + 0.3, // no nicks
    kick: 0.35,
    jetRefl: 0.5, endRefl: 0.5, bright: stop.bright, breath: stop.breath, rad: stop.rad,
    noise: stop.noise, stopped: stop.stopped, gain: want.gain,
  };
  const steps = [];
  const keep = opts.keepAudio;
  const maxSteps = opts.maxSteps ?? 56;
  let last = null;
  // A pipe being shown is heard for longer, so each step can be heard.
  const hold = keep ? Math.max(1.1, speakTime(target)) : speakTime(target);
  const hear = (action) => {
    const { x, m, o } = listen(sr, params, target, seed, 1, hold);
    const raw = m.rms / params.gain; // what the toe controls, before the mouth width
    const speaking = m.f > 0 && m.clarity > 0.8 && raw > 0.05;
    const c = speaking ? cents(m.f, target) : null;
    last = { m, o, c, speaking, raw };
    steps.push({
      action, bore: params.bore, jetRatio: params.jetRatio, foot: params.foot, chiff: params.chiff,
      f: m.f, cents: c, clarity: m.clarity, rms: m.rms, bright: m.bright,
      level: raw > 0 ? 20 * Math.log10(raw / want.raw) : -99, speak: o.speak, onsetNoise: o.chiff,
      audio: keep ? x : null,
    });
    return last;
  };
  const room = () => steps.length < maxSteps;
  const overblown = () => last.speaking && Math.abs(last.c) > 300;

  hear('as delivered');

  // 1. Toe. Close (or open) the foot hole until the pipe speaks at the rank's level.
  for (let k = 0; k < 4 && room(); k++) {
    if (!last.speaking || overblown()) break; // set the toe once the pipe speaks its note
    const r = want.raw / last.raw;
    if (Math.abs(20 * Math.log10(r)) < 0.75) break;
    params = { ...params, foot: Math.min(1.4, Math.max(0.25, params.foot * Math.pow(r, 0.9))) };
    hear(r < 1 ? 'close toe' : 'open toe');
  }

  // 2. Cut-up. Raise the mouth: first until the pipe stops overblowing, then
  // past the brightest point until the tone is as round as the brief asks.
  // Small steps near the target, because a cut-up cannot be lowered again.
  // The jet's travel over the mouth as a share of the period: the cut-up over
  // the jet speed. Past about half a period the tone rounds off as it rises.
  const travel = () => params.jetRatio / Math.sqrt(params.foot);
  // A pipe on the wrong note: the jet's travel across the mouth is out of
  // step with the note. Steer it back toward about half a period: if the jet
  // is too slow (long travel) give it more wind; if too fast, raise the mouth.
  const steer = () => (travel() > 0.55
    ? { ...params, foot: Math.min(1.4, params.foot * 1.1), jetRatio: params.foot >= 1.4 ? params.jetRatio * 0.97 : params.jetRatio }
    : { ...params, jetRatio: params.jetRatio * 1.04 });
  for (let k = 0; k < 22 && room(); k++) {
    if (last.speaking && !overblown() && Math.abs(last.c) > 25) {
      // Keep the pipe near its note as the mouth goes up, or the tone is judged
      // at the wrong pitch.
      params = { ...params, bore: params.bore * Math.pow(2, last.c / 1200) };
      hear(last.c < 0 ? 'trim' : 'lengthen');
      continue;
    }
    if (last.speaking && !overblown()) {
      const b = last.m.bright;
      const rounding = travel() >= 0.5;
      if (rounding && b <= want.tone * 1.15) break;
      if (travel() > 0.68) break; // as round as this mouth will go
      const step = rounding && b < want.tone * 1.3 ? 1.02 : travel() < 0.46 ? 1.06 : 1.03;
      params = { ...params, jetRatio: params.jetRatio * step };
    } else {
      params = { ...params, jetRatio: params.jetRatio * 1.08 };
    }
    hear('raise cut-up');
  }

  // Toe again: the new cut-up changed the level.
  for (let k = 0; k < 3 && room() && last.speaking && !overblown(); k++) {
    const r = want.raw / last.raw;
    if (Math.abs(20 * Math.log10(r)) < 0.75) break;
    params = { ...params, foot: Math.min(1.4, Math.max(0.25, params.foot * Math.pow(r, 0.9))) };
    hear(r < 1 ? 'close toe' : 'open toe');
  }

  // 3. Nicks. Each row of nicks in the languid takes out some edge noise and
  // lets the pipe speak cleaner and sooner.
  for (let k = 0, prev = Infinity; k < 6 && room() && last.speaking; k++) {
    const ch = last.o.chiff;
    if (ch <= want.chiff || ch > prev * 0.92) break; // clean enough, or nicks no longer help
    prev = ch;
    params = { ...params, chiff: params.chiff * 0.6 };
    hear('nick languid');
  }

  // 4. Length. Trim or lengthen at the top (a tuning slide) until in tune.
  let done = false;
  let best = null;
  let flips = 0;
  while (room() && !done) {
    if (!last.speaking) { params = { ...params, foot: Math.min(1.4, params.foot * 1.1) }; hear('open toe'); continue; }
    const c = last.c;
    if (Math.abs(c) > 300) {
      // Jumped to the wrong note. A jet that is too slow for the mouth wants
      // more wind; one that is too fast wants a higher mouth.
      const before = travel();
      params = steer();
      hear(travel() < before ? 'open toe' : 'raise cut-up');
      continue;
    }
    if (!best || Math.abs(c) < Math.abs(best.c)) best = { c, params: { ...params }, rms: last.m.rms };
    if (Math.abs(c) <= 0.8) { done = true; break; }
    const prev = steps.length > 1 ? steps[steps.length - 2].cents : null;
    if (prev != null && Math.sign(prev) !== Math.sign(c) && Math.abs(prev) < 300) flips++;
    if (flips >= 4 && Math.abs(c) < 3) { done = true; break; }
    params = { ...params, bore: params.bore * Math.pow(2, (0.85 * c) / 1200) };
    hear(c < 0 ? 'trim' : 'lengthen');
  }
  if (!done && best && Math.abs(best.c) < 8) { params = best.params; done = true; }

  // Steady: the pipe must hold its note when the wind sags or surges, and
  // whatever the turbulence does, not only in one lucky try.
  let stable = false;
  // Many turbulence patterns and wind levels, as the organ will meet them.
  const TRIALS = [[11, 0.95], [29, 1.04], [47, 1], [3, 0.97], [9, 1], [77, 1.02], [131, 0.96], [5, 1]];
  for (let round = 0; round < 5 && done && !stable; round++) {
    stable = true;
    let jump = 0;
    // Big pipes are slow to test and rarely jump: three trials for them.
    const big = target < 80;
    for (const [sd, w] of big ? TRIALS.slice(0, 3) : TRIALS) {
      const { m } = listen(sr, params, target, seed + sd, w, speakTime(target) * 2.5);
      const c = m.f > 0 ? cents(m.f, target) : -9999;
      if (!(Math.abs(c) < 15 && m.clarity > 0.93)) { stable = false; jump = c; break; }
    }
    const s = steps.at(-1);
    steps.push({ ...s, action: stable ? 'steady' : 'unsteady', audio: null });
    if (!stable) {
      // Jumped up: the jet is too fast for the mouth, so raise the mouth a
      // touch. Fell silent or dropped: give it a little more wind.
      params = steer();
      for (let k = 0; k < 8; k++) {
        const { m } = listen(sr, params, target, seed);
        const c = m.f > 0 ? cents(m.f, target) : null;
        if (c == null || Math.abs(c) > 300) { params = steer(); continue; }
        if (Math.abs(c) < 1) break;
        params = { ...params, bore: params.bore * Math.pow(2, (0.85 * c) / 1200) };
      }
    }
  }

  const fin = steps.filter((s) => s.action !== 'steady' && s.action !== 'unsteady').at(-1);
  const ok = done && stable;
  return { key, target, stop: stop.name, ok, params, steps, brief: want, result: fin };
}

// The steps worth hearing, for a short showing of one pipe: as delivered, the
// first step of each kind of work (toe, cut-up, nicks, length), and the end.
export function highlights(steps, max = 8) {
  const real = steps.filter((s) => s.action !== 'steady' && s.action !== 'unsteady');
  const last = real.length - 1;
  const pick = [0];
  const kind = (a) => (/toe/.test(a) ? 'toe' : /cut-up|mouth/.test(a) ? 'cut' : /nick/.test(a) ? 'nick' : /trim|lengthen/.test(a) ? 'length' : a);
  const seen = new Set([kind(real[0].action)]);
  real.forEach((s, i) => { if (i && i < last && !seen.has(kind(s.action))) { seen.add(kind(s.action)); pick.push(i); } });
  // Then a second look at the mouth going up, which is the loudest change.
  const cut2 = real.findIndex((s, i) => i > pick[1] && kind(s.action) === 'cut' && !pick.includes(i));
  if (cut2 > 0 && pick.length < max - 1) pick.push(cut2);
  pick.push(last);
  return [...new Set(pick)].sort((a, b) => a - b).slice(-max).map((i) => real[i]);
}
