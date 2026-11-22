// The Voicer as arranger: song + place -> which organ, which notes on which
// ranks, and how fast. Rules a church organist would use, kept simple.
import { STYLES, STOPS } from './organ.js';

// A big echo wants a slower tempo so lines do not blur (a long-standing
// organist's rule of thumb). rt = seconds of reverb at 500 Hz.
export function tempoFor(rt) {
  return Math.max(0.78, Math.min(1, 1 - 0.035 * (rt - 1.5)));
}

// Pick the organ for the song and the place.
export function chooseStyle(song, place) {
  if (song.mood === 'grand') return place.rt > 2.5 || place.size === 'large' ? 'cathedral' : 'chamber';
  if (song.mood === 'tender') return place.size === 'small' ? 'chamber' : 'theatre';
  if (song.mood === 'showy') return 'theatre';
  return place.rt > 3 ? 'cathedral' : 'chamber';
}

// Split the notes across pedal and manual. The lowest part goes to the pedal
// if it is clearly a bass line.
export function arrange(midi, styleId, opts = {}) {
  const style = STYLES[styleId];
  const from = opts.from ?? 0, to = opts.to ?? Infinity, speed = opts.speed ?? 1;
  const parts = {};
  for (const n of midi.notes) (parts[`${n.track}/${n.ch}`] ??= []).push(n);
  const avg = Object.entries(parts).map(([id, ns]) => [id, ns.reduce((a, n) => a + n.key, 0) / ns.length]);
  avg.sort((a, b) => a[1] - b[1]);
  const pedalPart = avg.length > 1 && avg[0][1] < 52 ? avg[0][0] : null;

  const events = []; // { t, dur, stop, key }
  const used = {}; // stop -> Set(keys)
  for (const [id, ns] of Object.entries(parts)) {
    const isPedal = id === pedalPart;
    const ranks = isPedal ? style.pedal : style.manual;
    for (const n of ns) {
      if (n.t < from || n.t >= to) continue;
      let key = n.key;
      if (isPedal) { while (key > 55) key -= 12; while (key < 24) key += 12; }
      else { while (key > 96) key -= 12; while (key < 36) key += 12; }
      for (const stop of ranks) {
        // Small high ranks break back an octave at the top, as mixtures do:
        // pipes shorter than a few millimetres will not speak.
        let k = key;
        while (k + 12 * Math.log2(8 / STOPS[stop].feet) > 100) k -= 12;
        events.push({ t: (n.t - from) / speed, dur: n.dur / speed, stop, key: k, pedal: isPedal });
        (used[stop] ??= new Set()).add(k);
      }
    }
  }
  events.sort((a, b) => a.t - b.t);
  const pipes = Object.entries(used).flatMap(([stop, keys]) => [...keys].sort((a, b) => a - b).map((key) => ({ stop, key })));
  const length = events.reduce((m, e) => Math.max(m, e.t + e.dur), 0);
  return { style: styleId, events, pipes, length, stops: Object.fromEntries(Object.keys(used).map((s) => [s, STOPS[s]])) };
}
