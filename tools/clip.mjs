// The 30-second clip. One pipe arrives from the pipe maker and is voiced in
// front of you, heard close; the rest of the organ is voiced in a rush; then
// a pop song plays on it, heard from the nave of York Minster.
// Writes out/clip/audio.wav and out/clip/clip.json (timeline for the frames).
// node tools/clip.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { parseMidi } from '../engine/midi.js';
import { arrange } from '../engine/arranger.js';
import { STOPS, STYLES } from '../engine/organ.js';
import { Player } from '../engine/player.js';
import { FluePipe } from '../engine/pipe.js';
import { CALIB, organSource } from '../engine/minster.js';
import { binauralIR } from '../engine/auralize.js';
import { voicePipe, highlights } from '../engine/voicer.js';
import { traceParallel } from './minster-ir.mjs';
import { convolve } from './convolve.mjs';
import { voiceAll } from './minster-render.mjs';

const SONG = { title: 'Believe', by: 'Cher', file: 'songs/cher-believe.mid', from: 59.9, to: 77.3, keep: ['17/15', '9/6', '4/1'] };
const REG = { manual: ['ymDiap8a', 'ymStopped8', 'ymOctave4'], pedal: ['ymPedSub16', 'ymPedPrin8'] };
const sr = 48000, OUT = 'out/clip';
const t0 = Date.now();
const lap = (s) => console.log(`${((Date.now() - t0) / 1000).toFixed(1).padStart(6)} s  ${s}`);
mkdirSync(OUT, { recursive: true });

const arr = arrange(parseMidi(readFileSync(SONG.file)), 'york', { from: SONG.from, to: SONG.to, speed: 0.82, keep: SONG.keep, ...REG });
lap(`${arr.pipes.length} pipes, ${arr.events.length} pipe-notes, ${arr.length.toFixed(1)} s`);

// The hero: a pipe of the lead rank that arrives badly wrong (it overblows
// to the octave or beyond), as most do with the mouth cut low.
const leads = arr.pipes.filter((p) => p.stop === REG.manual[0]).sort((a, b) => a.key - b.key);
let hero = null;
for (const p of leads) {
  const v = voicePipe(sr, STOPS[p.stop], p.key, { keepAudio: true });
  if (v.ok && Math.abs(v.steps[0].cents ?? 9999) > 900 && p.key >= 56 && p.key <= 70) { hero = { ...p, v }; break; }
}
hero ??= { ...leads[0], v: voicePipe(sr, STOPS[leads[0].stop], leads[0].key, { keepAudio: true }) };
const heroId = `${hero.stop}:${hero.key}`;
lap(`hero ${heroId}: ${hero.v.steps.length} steps`);

const voicedList = await voiceAll(arr.pipes);
const voiced = Object.fromEntries(voicedList.map((v) => [v.id, v.params]));
voiced[heroId] = hero.v.params;
lap(`voiced; ${voicedList.filter((v) => !v.ok).length} not settled`);

// ---- Timeline
const show = highlights(hero.v.steps, 7);
const fin = show.at(-1);
const H0 = 0.2;
const heroSteps = [];
let t = H0;
show.forEach((s, i) => {
  const dur = i === 0 ? 1.1 : i === show.length - 1 ? 1.0 : 0.6;
  const nicks = hero.v.steps.slice(0, hero.v.steps.indexOf(s) + 1).filter((x) => x.action === 'nick languid').length;
  heroSteps.push({ t: +t.toFixed(3), dur, action: i === show.length - 1 ? 'in tune' : s.action, len: s.bore / fin.bore, cut: s.jetRatio / fin.jetRatio, toe: s.foot / fin.foot, nicks, audio: s.audio });
  t += dur;
});
const M0 = t + 0.1;
const others = arr.pipes.filter((p) => `${p.stop}:${p.key}` !== heroId)
  .sort((a, b) => (STOPS[b.stop].feet * 2 ** (-b.key / 12)) - (STOPS[a.stop].feet * 2 ** (-a.key / 12)));
const MONT = 2.3;
const montage = others.map((p, i) => ({ id: `${p.stop}:${p.key}`, t: +(M0 + MONT * Math.pow(i / others.length, 0.75)).toFixed(3) }));
const SONG0 = M0 + MONT + 0.35;
const END = SONG0 + arr.length + 3.2;
const N = Math.ceil(END * sr);
lap(`hero ${H0.toFixed(1)}–${M0.toFixed(1)} s, montage to ${(M0 + MONT).toFixed(1)} s, song ${SONG0.toFixed(1)}–${(SONG0 + arr.length).toFixed(1)} s, end ${END.toFixed(1)} s`);

// ---- Dry stems: the hero where it is drawn, the rest by side of the case
// (C side north, C♯ side south; great, upper work and pedal at their heights).
const cam = JSON.parse(readFileSync(`${OUT}/path.json`, 'utf8')); // from clip.js: window.voicer.path()
const groupOf = (e) => organSource(e, STOPS[e.stop].feet);
const stems = {};
const stem = (g) => (stems[g.id] ??= { pos: g.pos, x: new Float32Array(N) });

// The hero, step by step: each step as the voicer heard it, faded out.
const heroG = { id: 'hero', pos: cam.hero };
for (const s of heroSteps) {
  const a = Math.round(s.t * sr), n = Math.min(s.audio.length, Math.round((s.dur - 0.04) * sr)), fade = Math.round(0.03 * sr);
  const x = stem(heroG).x;
  for (let i = 0; i < n; i++) x[a + i] += s.audio[i] * Math.min(1, (n - i) / fade);
}
// The rest, a short blip each as it is voiced: they come from both sides.
for (const m of montage) {
  const [stop, key] = m.id.split(':');
  const pipe = new FluePipe(sr, voiced[m.id], 991 + +key);
  const x = stem(groupOf({ stop, key: +key, pedal: STYLES.york.pedal.includes(stop) })).x;
  const a = Math.round(m.t * sr), on = Math.round(0.09 * sr);
  pipe.noteOn();
  for (let i = 0; i < Math.round(0.4 * sr) && a + i < N; i++) { if (i === on) pipe.noteOff(); x[a + i] += 0.8 * pipe.tick(1); }
}
// The song. The hero pipe plays from where it stands.
const groups = {};
for (const e of arr.events) { const g = `${e.stop}:${e.key}` === heroId ? heroG : groupOf(e); (groups[g.id] ??= { pos: g.pos, ev: [] }).ev.push({ ...e, t: e.t + SONG0 }); }
for (const [id, g] of Object.entries(groups)) {
  const p = new Player(sr, { voiced, style: STYLES.york, polyphony: 192 });
  p.load(g.ev);
  const x = stem({ id, pos: g.pos }).x;
  const y = new Float32Array(N);
  for (let i = 0; i < N; i += 128) p.process(y.subarray(i, Math.min(N, i + 128)));
  for (let i = 0; i < N; i++) x[i] += y[i];
}
lap(`dry stems: ${Object.keys(stems).join(', ')}`);

// ---- The listener goes where the camera goes. Render the Minster's echo at
// points along the camera path (ears where the lens is, facing where it
// looks), then crossfade between neighbouring points in time.
const KEYS = [0, montageT(0.45), SONG0 - 0.3, SONG0 + 4, SONG0 + 11, END - 0.1];
function montageT(u) { return M0 + MONT * u; }
const at = (t) => cam.path.reduce((b, s) => (Math.abs(s.t - t) < Math.abs(b.t - t) ? s : b));
const renders = [];
for (const [k, t] of KEYS.entries()) {
  const c = at(t);
  const rec = [Math.min(c.p[0], cam.hero[0] - 2.5), c.p[1], c.p[2]]; // no closer than 2.5 m: the receiver is a 1.5 m sphere
  const f = [c.a[0] - c.p[0], c.a[1] - c.p[1]]; const fl = Math.hypot(...f);
  const forward = [f[0] / fl, f[1] / fl, 0], left = [-forward[1], forward[0], 0];
  const wet = [new Float32Array(N), new Float32Array(N)];
  for (const [id, g] of Object.entries(stems)) {
    const r = await traceParallel(g.pos, rec, { rays: 80000, scatter: 0.35, maxTime: 9, binMs: 1, radius: 1.5, calib: CALIB, skipDirect: true });
    const ir = binauralIR(r, { src: g.pos, rec, forward, left, seed: k * 31 + id.length * 977 + id.charCodeAt(0) });
    for (let ear = 0; ear < 2; ear++) { const y = convolve(g.x, ir[ear]); for (let i = 0; i < N && i < y.length; i++) wet[ear][i] += y[i]; }
  }
  renders.push(wet);
  lap(`listener ${k + 1}/${KEYS.length} at t ${t.toFixed(1)} s: [${rec.map((v) => v.toFixed(1))}]`);
}
const peak = (w, a = 0, b = N) => { let m = 0; for (const c of w) for (let i = a; i < b; i++) m = Math.max(m, Math.abs(c[i])); return m; };
// Level: the lone pipe up close would be far louder than the song across the
// crossing, so ride the gain as a sound engineer would, then let the song set it.
const s0 = Math.round(SONG0 * sr);
const gHero = (0.7 * peak(renders.at(-2), s0)) / peak(renders[0], 0, s0);
const mix = [new Float32Array(N), new Float32Array(N)];
for (let i = 0; i < N; i++) {
  const s = i / sr;
  let k = 0; while (k < KEYS.length - 2 && s > KEYS[k + 1]) k++;
  const u = Math.min(1, Math.max(0, (s - KEYS[k]) / (KEYS[k + 1] - KEYS[k])));
  const ga = Math.cos((u * Math.PI) / 2), gb = Math.sin((u * Math.PI) / 2);
  const ride = s < SONG0 - 0.3 ? gHero : s > SONG0 + 1.5 ? 1 : gHero + (1 - gHero) * ((s - SONG0 + 0.3) / 1.8);
  const fo = s > END - 1.2 ? Math.max(0, (END - s) / 1.2) : 1;
  for (let c = 0; c < 2; c++) mix[c][i] = (renders[k][c][i] * ga + renders[k + 1][c][i] * gb) * ride * fo;
}
const pk = peak(mix);
const b = Buffer.alloc(44 + N * 4);
b.write('RIFF', 0); b.writeUInt32LE(36 + N * 4, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22);
b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) for (let c = 0; c < 2; c++) b.writeInt16LE(Math.round((mix[c][i] / pk) * 0.89 * 32767), 44 + (i * 2 + c) * 2);
writeFileSync(`${OUT}/audio.wav`, b);

const notes = {};
for (const e of arr.events) (notes[`${e.stop}:${e.key}`] ??= []).push([+(e.t + SONG0).toFixed(3), +(e.t + SONG0 + e.dur).toFixed(3)]);
writeFileSync(`${OUT}/clip.json`, JSON.stringify({
  fps: 30, end: +END.toFixed(3), song: SONG, heroId, song0: +SONG0.toFixed(3), montage0: +M0.toFixed(3), montageEnd: +(M0 + MONT).toFixed(3),
  pipes: arr.pipes, hero: heroSteps.map(({ audio, ...s }) => s), montage, notes,
}));
lap(`wrote ${OUT}/audio.wav and clip.json`);
