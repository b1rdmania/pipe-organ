// Render candidate songs through the organ and York's measured echo, for
// listening. node tools/xmas-render.mjs <dir> <out>
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { parseMidi } from '../engine/midi.js';
import { orchestrate, loudness } from '../engine/orchestrate.js';
import { arrange } from '../engine/arranger.js';
import { STYLES } from '../engine/organ.js';
import { Player } from '../engine/player.js';
import { voiceAll } from './minster-render.mjs';
import { convolve } from './convolve.mjs';
import { metrics } from './arr-metrics.mjs';

const [dir, OUT] = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });
const sr = 48000, CACHE = 'out/arr/voiced.json';
const C = JSON.parse(readFileSync(dir + '/candidates.json'));
const arrs = C.map((c) => {
  const midi = parseMidi(readFileSync(`${dir}/${c.file}.mid`));
  let arr;
  if (c.organ) { // an organ score: as written, like the Bach
    const a = arrange(midi, 'york', { from: c.from, to: c.to, speed: 0.82, manual: STYLES.york.manual, pedal: STYLES.york.pedal });
    arr = { ...a, box: [], from: c.from, to: c.to, speed: 0.82 };
  } else arr = orchestrate(midi, c);
  return { c, midi, arr };
});
const voiced = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE)) : {};
const need = new Map();
for (const { arr } of arrs) for (const p of arr.pipes) if (!voiced[`${p.stop}:${p.key}`]) need.set(`${p.stop}:${p.key}`, p);
if (need.size) { console.log(`voicing ${need.size} pipes`); for (const v of await voiceAll([...need.values()])) voiced[v.id] = v.params; writeFileSync(CACHE, JSON.stringify(voiced)); }

function readIR(f) {
  const b = readFileSync(f); let o = 12, data, ch = 2;
  while (o < b.length) { const id = b.toString('ascii', o, o + 4), n = b.readUInt32LE(o + 4); if (id === 'fmt ') ch = b.readUInt16LE(o + 10); if (id === 'data') data = new Float32Array(b.buffer.slice(b.byteOffset + o + 8, b.byteOffset + o + 8 + n)); o += 8 + n + (n & 1); }
  const L = new Float32Array(data.length / ch), R = new Float32Array(data.length / ch);
  for (let i = 0; i < L.length; i++) { L[i] = data[i * ch]; R[i] = data[i * ch + 1]; }
  return [L, R];
}
const [hL, hR] = readIR('vst/Resources/ir-great.wav');
let s2 = 0; for (const v of hL) s2 += v * v; for (const v of hR) s2 += v * v;
const make = 0.24 / Math.sqrt(s2 / (hL.length * 2));
for (const { c, midi, arr } of arrs) {
  const n = Math.ceil((arr.length + 1) * sr);
  const p = new Player(sr, { voiced, style: STYLES.york, polyphony: 256 });
  p.load(arr.events, arr.box);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i += 128) p.process(x.subarray(i, Math.min(n, i + 128)));
  const L = convolve(x, hL), R = convolve(x, hR);
  let pk = 0; for (const v of L) pk = Math.max(pk, Math.abs(v * make)); for (const v of R) pk = Math.max(pk, Math.abs(v * make));
  const g = 0.89 / pk * make, len = L.length;
  const b = Buffer.alloc(44 + len * 4);
  b.write('RIFF', 0); b.writeUInt32LE(36 + len * 4, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(len * 4, 40);
  for (let i = 0; i < len; i++) { b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * g)) * 32767), 44 + i * 4); b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * g)) * 32767), 46 + i * 4); }
  writeFileSync(`${OUT}/${c.name}.wav`, b);
  const ld = loudness(arr.events, arr.box), tot = Object.values(ld).reduce((a, v) => a + v, 0);
  let m = {}; try { m = metrics(midi, arr, c); } catch (e) { m = { err: e.message }; }
  console.log(c.name.padEnd(22), `${(n / sr).toFixed(0)}s`, 'window', arr.from?.toFixed?.(1), '-', arr.to?.toFixed?.(1), 'tune', ((ld.tune ?? 0) / tot * 100 || 0).toFixed(0) + '%', 'pc', m.pc, 'bass', m.bass, 'peak', m.peak);
}
