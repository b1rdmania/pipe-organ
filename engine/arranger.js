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
  // Channel 10 (index 9) is the General MIDI drum kit: not notes for pipes.
  for (const n of midi.notes) if (n.ch !== 9) (parts[`${n.track}/${n.ch}`] ??= []).push(n);
  // A song can name the parts to play ("track/channel"), leaving out the rest.
  if (opts.keep) for (const id of Object.keys(parts)) if (!opts.keep.includes(id)) delete parts[id];
  // Some MIDI files write a registration as extra tracks that copy a part an
  // octave (or two) away, or exactly. The organ's own ranks give those
  // octaves, so drop the copies.
  const ids = Object.keys(parts);
  for (const a of ids) for (const b of ids) {
    if (a >= b || !parts[a] || !parts[b] || parts[a].length !== parts[b].length) continue;
    const A = parts[a], B = parts[b];
    const copy = A.every((n, i) => Math.abs(n.t - B[i].t) < 0.01 && (n.key - B[i].key) % 12 === 0);
    if (copy) { const avgA = A.reduce((s, n) => s + n.key, 0), avgB = B.reduce((s, n) => s + n.key, 0); delete parts[avgA <= avgB ? b : a]; }
  }
  const avg = Object.entries(parts).map(([id, ns]) => [id, ns.reduce((a, n) => a + n.key, 0) / ns.length]);
  avg.sort((a, b) => a[1] - b[1]);
  const pedalPart = avg.length > 1 && avg[0][1] < 52 ? avg[0][0] : null;

  const events = []; // { t, dur, stop, key }
  const used = {}; // stop -> Set(keys)
  for (const [id, ns] of Object.entries(parts)) {
    const isPedal = id === pedalPart;
    // A song can ask for its own registration (which stops are drawn).
    // Divisions: with a solo part named, the tune goes on the Great and every
    // other manual part on the Swell, whose pipes stand in a box with
    // shutters, so the accompaniment sits under the tune.
    const swell = opts.solo && !isPedal && id !== opts.solo;
    const ranks = isPedal ? (opts.pedal ?? style.pedal) : swell ? (opts.swell?.ranks ?? opts.manual ?? style.manual) : (opts.solo ? (opts.great ?? opts.manual ?? style.manual) : (opts.manual ?? style.manual));
    const gain = isPedal ? (opts.pedalGain ?? 1) : swell ? (opts.swell?.gain ?? 0.5) : 1;
    for (const n of ns) {
      if (n.t < from || n.t >= to) continue;
      let key = n.key;
      const [plo, phi] = style.pedalRange ?? [24, 55], [mlo, mhi] = style.manualRange ?? [36, 96];
      if (isPedal) { while (key > phi) key -= 12; while (key < plo) key += 12; }
      else { while (key > mhi) key -= 12; while (key < mlo) key += 12; }
      for (const stop of ranks) {
        // Small high ranks break back an octave at the top, as mixtures do:
        // pipes shorter than a few millimetres will not speak.
        let k = key;
        while (k + 12 * Math.log2(8 / STOPS[stop].feet) > 100) k -= 12;
        events.push({ t: (n.t - from) / speed, dur: n.dur / speed, stop, key: k, pedal: isPedal, gain });
        (used[stop] ??= new Set()).add(k);
      }
    }
  }
  events.sort((a, b) => a.t - b.t);
  const pipes = Object.entries(used).flatMap(([stop, keys]) => [...keys].sort((a, b) => a - b).map((key) => ({ stop, key })));
  const length = events.reduce((m, e) => Math.max(m, e.t + e.dur), 0);
  return { style: styleId, events, pipes, length, stops: Object.fromEntries(Object.keys(used).map((s) => [s, STOPS[s]])) };
}

// For any MIDI file: choose what an organist would take from it. An organ
// part if there is one; the melody; one sustained chord part; the bass for
// the pedals. Drums are never used. Returns the parts, a registration and a
// 40-second section that starts with the music.
export const GM = (p) => p == null ? 'unknown' : p < 8 ? 'piano' : p < 16 ? 'bells' : p < 24 ? 'organ' : p < 32 ? 'guitar' : p < 40 ? 'bass' : p < 56 ? 'strings' : p < 64 ? 'brass' : p < 72 ? 'reed' : p < 80 ? 'pipe' : p < 88 ? 'lead' : p < 96 ? 'pad' : 'fx';
export function autoParts(midi, seconds = 40) {
  const parts = {};
  for (const n of midi.notes) if (n.ch !== 9) (parts[`${n.track}/${n.ch}`] ??= []).push(n);
  const stats = Object.entries(parts).filter(([, ns]) => ns.length >= 8).map(([id, ns]) => {
    const name = (midi.names?.[ns[0].track] || '').toLowerCase();
    const avg = ns.reduce((a, n) => a + n.key, 0) / ns.length;
    // Polyphony: how many notes start within 30 ms of each other, on average.
    let chords = 0; for (let i = 1; i < ns.length; i++) if (ns[i].t - ns[i - 1].t < 0.03) chords++;
    const span = ns.at(-1).t - ns[0].t || 1;
    return { id, ns, name, avg, poly: chords / ns.length, rate: ns.length / span, kind: GM(midi.programs?.[id]), first: ns[0].t };
  });
  const keep = new Set(), why = [];
  const take = (p, role) => { if (p && !keep.has(p.id)) { keep.add(p.id); why.push(`${role}: ${p.name.trim() || p.kind}`); } };
  for (const p of stats.filter((p) => p.kind === 'organ' || /organ/.test(p.name))) take(p, 'organ');
  const bass = stats.filter((p) => p.avg < 52).sort((a, b) => a.avg - b.avg)[0];
  take(bass, 'pedal');
  // A track named for the tune beats an instrument that often carries it.
  const voiceLike = (p) => (/melod|vocal|lead|sing|tune/.test(p.name) ? 3 : 0) + (['lead', 'reed', 'pipe', 'brass'].includes(p.kind) ? 1 : 0) + (/voice/.test(p.name) ? 1 : 0);
  const melody = stats.filter((p) => !keep.has(p.id) && p.avg >= 58 && p.poly < 0.35).sort((a, b) => (voiceLike(b) - voiceLike(a)) || (b.ns.length - a.ns.length))[0];
  take(melody, 'melody');
  const sustained = (p) => ['strings', 'pad', 'organ'].includes(p.kind) || /string|pad|choir/.test(p.name);
  const chords = stats.filter((p) => !keep.has(p.id) && p.avg >= 48 && p.avg < 76).sort((a, b) => (sustained(b) - sustained(a)) || (b.poly - a.poly))[0];
  take(chords, 'chords');
  const kept = stats.filter((p) => keep.has(p.id));
  const from = Math.max(0, Math.min(...kept.map((p) => p.first)) - 0.5);
  const busy = kept.reduce((a, p) => a + p.rate, 0);
  return { keep: [...keep], reg: busy > 9 ? 'light' : 'warm', from, to: from + seconds, why, solo: melody?.id };
}
