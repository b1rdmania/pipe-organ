// The Voicer: cuts each pipe a little long, listens, and trims it until it
// speaks the right note. If the pipe jumps to the wrong mode (overblows), it
// changes the cut-up of the mouth instead of the length. This is what a human
// voicer does with a knife; here every step is measured, not animated.
import { FluePipe } from './pipe.js';
import { measure, cents, midiHz } from './pitch.js';

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
  return { x, m };
}

// Rough cut: deterministic per pipe so the same organ is built the same way.
function roughness(seed) {
  const s = Math.sin(seed * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

export function voicePipe(sr, stop, key, opts = {}) {
  const target = midiHz(key) * (8 / stop.feet);
  const seed = key * 131 + stop.feet * 7 + (stop.stopped ? 3 : 0);
  const rough = roughness(seed);
  // A stopped pipe sounds an octave below an open pipe of the same length.
  const bore0 = (stop.stopped ? sr / (2 * target) : sr / target);
  let params = {
    bore: bore0 * (1.02 + 0.03 * rough), // cut long, so it starts flat
    jetRatio: stop.jr * (0.62 + 0.2 * rough), // mouth cut low, so it may overblow
    jetRefl: 0.5, endRefl: 0.5, bright: stop.bright, breath: stop.breath, rad: stop.rad,
    noise: stop.noise, chiff: stop.chiff, stopped: stop.stopped, gain: 1,
  };
  const steps = [];
  let done = false;
  let best = null;
  let flips = 0;
  for (let i = 0; i < (opts.maxSteps ?? 16) && !done; i++) {
    const { x, m } = listen(sr, params, target, seed);
    const speaking = m.f > 0 && m.clarity > 0.8 && m.rms > 0.05;
    const c = speaking ? cents(m.f, target) : null;
    let action;
    if (!speaking) {
      action = 'more wind';
      params = { ...params, jetRatio: params.jetRatio * 1.08, breath: Math.min(1.05, params.breath + 0.02) };
    } else if (c > 300) {
      action = 'raise mouth'; // overblowing into a higher mode
      params = { ...params, jetRatio: params.jetRatio * 1.15 };
    } else if (c < -300) {
      action = 'lower mouth';
      params = { ...params, jetRatio: params.jetRatio * 0.88 };
    } else if (Math.abs(c) > (i < 6 ? 0.8 : 3)) {
      const prev = steps.length ? steps[steps.length - 1].cents : null;
      if (prev != null && Math.sign(prev) !== Math.sign(c) && Math.abs(prev) < 300) flips++;
      if (flips >= 4) {
        // Hunting: the pipe will not settle. Reshape the mouth a touch.
        action = 'reshape mouth';
        flips = 0;
        params = { ...params, jetRatio: params.jetRatio * 1.06 };
      } else {
        action = c < 0 ? 'trim' : 'lengthen';
        params = { ...params, bore: params.bore * Math.pow(2, (0.8 * c) / 1200) };
      }
    } else {
      action = 'done';
      done = true;
    }
    if (c != null && Math.abs(c) < 300 && (!best || Math.abs(c) < Math.abs(best.c))) best = { c, params: { ...steps.length ? params : params }, rms: m.rms };
    steps.push({ bore: params.bore, jetRatio: params.jetRatio, f: m.f, cents: c, clarity: m.clarity, rms: m.rms, bright: m.bright, action, audio: opts.keepAudio ? x : null });
  }
  // Stability: a pipe must hold its note when the wind sags or surges and
  // whatever the turbulence does, not only in one lucky try.
  let stable = false;
  for (let round = 0; round < 4 && done && !stable; round++) {
    stable = true;
    for (const [sd, w] of [[seed + 11, 0.95], [seed + 29, 1.04], [seed + 47, 1]]) {
      const { m } = listen(sr, params, target, sd, w, speakTime(target) * 2.5);
      const c = m.f > 0 ? cents(m.f, target) : 9999;
      if (!(Math.abs(c) < 15 && m.clarity > 0.93)) { stable = false; break; }
    }
    steps.push({ bore: params.bore, jetRatio: params.jetRatio, f: target, cents: 0, clarity: 1, rms: steps.at(-1).rms, bright: steps.at(-1).bright, action: stable ? 'steady' : 'unsteady' });
    if (!stable) {
      // Move the mouth back toward the stop's nominal cut-up and retune.
      params = { ...params, jetRatio: params.jetRatio + (stop.jr * 1.05 - params.jetRatio) * 0.6 };
      for (let k = 0; k < 8; k++) {
        const { m } = listen(sr, params, target, seed);
        const c = m.f > 0 ? cents(m.f, target) : null;
        if (c == null || Math.abs(c) > 300) { params = { ...params, jetRatio: params.jetRatio * (c > 0 ? 1.1 : 0.93) }; continue; }
        steps.push({ bore: params.bore, jetRatio: params.jetRatio, f: m.f, cents: c, clarity: m.clarity, rms: m.rms, bright: m.bright, action: c < 0 ? 'trim' : 'lengthen' });
        if (Math.abs(c) < 1) break;
        params = { ...params, bore: params.bore * Math.pow(2, (0.8 * c) / 1200) };
      }
    }
  }

  const last = steps[steps.length - 1];
  const ok = (done && stable) || (!done && best && Math.abs(best.c) < 8);
  const rms = done ? last.rms : best ? best.rms : last.rms;
  const gain = rms > 0 ? (0.1 * stop.level) / rms : 0;
  return { key, target, stop: stop.name, ok, params: { ...params, gain }, steps };
}
