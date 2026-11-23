// Film audio for York Minster: the listener walks up the nave toward the organ.
// Traces the calibrated Minster from each part of the organ to listener
// points along the walk, renders each point, and crossfades between them as
// the listener moves. Also writes film.json (camera path + note times) for
// the Three.js frame renderer.
// node tools/minster-film.mjs <song.mid> <fromSec> <toSec> <outDir> [x0=12] [x1=62] [points=5] [rays=100000]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { parseMidi } from '../engine/midi.js';
import { arrange } from '../engine/arranger.js';
import { STYLES } from '../engine/organ.js';
import { Player } from '../engine/player.js';
import { CALIB } from '../engine/minster.js';
import { binauralIR } from '../engine/auralize.js';
import { traceParallel } from './minster-ir.mjs';
import { convolve } from './convolve.mjs';
import { voiceAll, sourceOf } from './minster-render.mjs';

const [file, from, to, outDir, x0 = '12', x1 = '62', points = '5', rays = '100000'] = process.argv.slice(2);
const sr = 48000;
const t0 = Date.now();
const lap = (s) => console.log(`${((Date.now() - t0) / 1000).toFixed(1).padStart(6)} s  ${s}`);
mkdirSync(outDir, { recursive: true });

const arr = arrange(parseMidi(readFileSync(file)), 'york', { from: +from, to: +to, speed: 0.82 });
const voiced = Object.fromEntries((await voiceAll(arr.pipes)).map((v) => [v.id, v.params]));
lap(`voiced ${arr.pipes.length} pipes`);

const groups = {};
for (const e of arr.events) { const s = sourceOf(e, e.stop); (groups[s.id] ??= { pos: s.pos, ev: [] }).ev.push(e); }
const lead = 1.0; // seconds of room before the first note
const total = Math.ceil((arr.length + lead + 1) * sr);
for (const g of Object.values(groups)) {
  const p = new Player(sr, { voiced, style: STYLES.york, polyphony: 256 });
  p.load(g.ev.map((e) => ({ ...e, t: e.t + lead })));
  g.dry = new Float32Array(total);
  for (let i = 0; i < total; i += 128) p.process(g.dry.subarray(i, Math.min(total, i + 128)));
}
lap(`rendered ${Object.keys(groups).length} dry stems`);

// The walk: smoothstep from x0 to x1 over the whole piece plus its echo.
const END = arr.length + lead + 7;
const ease = (u) => u * u * (3 - 2 * u);
const walkX = (t) => +x0 + (+x1 - +x0) * ease(Math.min(1, Math.max(0, t / END)));
const K = +points;
const xs = Array.from({ length: K }, (_, k) => +x0 + ((+x1 - +x0) * k) / (K - 1));
const outLen = Math.ceil(END * sr);
const renders = [];
for (const [k, x] of xs.entries()) {
  const rec = [x, 0, 1.7];
  const wet = [new Float32Array(outLen), new Float32Array(outLen)];
  for (const [id, g] of Object.entries(groups)) {
    const r = await traceParallel(g.pos, rec, { rays: +rays, scatter: 0.35, maxTime: 9, binMs: 1, radius: 1.5, calib: CALIB, skipDirect: true });
    const ir = binauralIR(r, { src: g.pos, rec, forward: [1, 0, 0], left: [0, 1, 0], seed: k * 31 + id.length * 977 + id.charCodeAt(0) });
    for (let ear = 0; ear < 2; ear++) { const y = convolve(g.dry, ir[ear]); for (let i = 0; i < outLen && i < y.length; i++) wet[ear][i] += y[i]; }
  }
  renders.push(wet);
  lap(`listener point ${k + 1}/${K} at x = ${x.toFixed(1)} m`);
}
// Crossfade (equal power) between the two nearest points.
const mix = [new Float32Array(outLen), new Float32Array(outLen)];
for (let i = 0; i < outLen; i++) {
  const x = walkX(i / sr);
  const f = Math.min(K - 1 - 1e-9, Math.max(0, ((x - +x0) / (+x1 - +x0)) * (K - 1)));
  const k = Math.floor(f), u = f - k;
  const ga = Math.cos((u * Math.PI) / 2), gb = Math.sin((u * Math.PI) / 2);
  for (let c = 0; c < 2; c++) mix[c][i] = renders[k][c][i] * ga + renders[k + 1][c][i] * gb;
}
let pk = 0; for (const c of mix) for (const v of c) pk = Math.max(pk, Math.abs(v));
const b = Buffer.alloc(44 + outLen * 4);
b.write('RIFF', 0); b.writeUInt32LE(36 + outLen * 4, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22);
b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(outLen * 4, 40);
for (let i = 0; i < outLen; i++) for (let c = 0; c < 2; c++) b.writeInt16LE(Math.round((mix[c][i] / pk) * 0.89 * 32767), 44 + (i * 2 + c) * 2);
writeFileSync(`${outDir}/audio.wav`, b);

// film.json: the same walk for the camera (eye 1.7 m, looking at the organ),
// and when each pipe sounds, for the glow.
const path = [];
for (let t = 0; t <= END + 1e-9; t += 0.5) path.push({ t: +t.toFixed(2), p: [walkX(t), 0, 1.7], a: [90.75, 0, 11.5 + 0.02 * (walkX(t) - +x0)] });
const notes = {};
for (const e of arr.events) (notes[`${e.stop}:${e.key}`] ??= []).push([+(e.t + lead).toFixed(3), +(e.t + lead + e.dur).toFixed(3)]);
writeFileSync(`${outDir}/film.json`, JSON.stringify({ end: END, fps: 30, path, notes }));
lap(`wrote ${outDir}/audio.wav and film.json (${END.toFixed(1)} s)`);
