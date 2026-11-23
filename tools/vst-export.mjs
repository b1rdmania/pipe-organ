// Data for the plugin (vst/): every York pipe voiced at 48 kHz, and the
// Minster traced from the three parts of the case to the listener.
// node tools/vst-export.mjs [rays=200000]
// Writes vst/Resources/voiced.json and ir-great.wav, ir-upper.wav, ir-pedal.wav
// (48 kHz stereo float, direct sound included).
import { writeFileSync, mkdirSync } from 'node:fs';
import { STOPS, STYLES } from '../engine/organ.js';
import { organSource, CALIB } from '../engine/minster.js';
import { binauralIR } from '../engine/auralize.js';
import { voiceAll } from './minster-render.mjs';
import { traceParallel } from './minster-ir.mjs';

const SR = 48000;
const OUT = new URL('../vst/Resources/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const rays = +(process.argv[2] ?? 200000);
const t0 = Date.now();
const lap = (s) => console.log(`${((Date.now() - t0) / 1000).toFixed(1).padStart(7)} s  ${s}`);

// 1. Pipes: manual ranks over the manual range, pedal ranks over the pedal range.
const Y = STYLES.york;
const pipes = [];
for (const stop of Y.manual) for (let k = Y.manualRange[0]; k <= Y.manualRange[1]; k++) pipes.push({ stop, key: k });
for (const stop of Y.pedal) for (let k = Y.pedalRange[0]; k <= Y.pedalRange[1]; k++) pipes.push({ stop, key: k, pedal: true });
const voiced = await voiceAll(pipes.map(({ stop, key }) => ({ stop, key })));
const byId = Object.fromEntries(voiced.map((v) => [v.id, v]));
const json = { sampleRate: SR, manualRange: Y.manualRange, pedalRange: Y.pedalRange, pipes: {} };
for (const p of pipes) {
  const id = `${p.stop}:${p.key}`;
  const v = byId[id];
  json.pipes[id] = { ...v.params, ok: v.ok, group: organSource({ key: p.key, pedal: !!p.pedal }, STOPS[p.stop].feet).id.replace(/Cs?$/, ''), sag: organSource({ key: p.key, pedal: !!p.pedal }, STOPS[p.stop].feet).id };
}
writeFileSync(OUT + 'voiced.json', JSON.stringify(json));
lap(`voiced ${voiced.length} pipes; ${voiced.filter((v) => !v.ok).length} not settled`);

// 2. Echo: three sources on the centre line, as the app traces them.
const rec = [62, 0, 1.7];
const parts = [
  ['great', organSource({ key: 0, pedal: false }, 8).pos],
  ['upper', organSource({ key: 0, pedal: false }, 2).pos],
  ['pedal', organSource({ key: 0, pedal: true }, 16).pos],
];
function wav(path, chans) {
  const n = chans[0].length, b = Buffer.alloc(44 + n * 8);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 8, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(3, 20); b.writeUInt16LE(2, 22); b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 8, 28); b.writeUInt16LE(8, 32); b.writeUInt16LE(32, 34);
  b.write('data', 36); b.writeUInt32LE(n * 8, 40);
  for (let i = 0; i < n; i++) { b.writeFloatLE(chans[0][i], 44 + i * 8); b.writeFloatLE(chans[1][i], 48 + i * 8); }
  writeFileSync(path, b);
}
for (const [i, [id, pos]] of parts.entries()) {
  const src = [pos[0], 0, pos[2]];
  const seed = 17 + i * 101;
  const r = await traceParallel(src, rec, { rays, seed, scatter: 0.35, maxTime: 8, binMs: 1, radius: 1.5, calib: CALIB, skipDirect: true });
  const ir = binauralIR(r, { sr: SR, src, rec, forward: [1, 0, 0], left: [0, 1, 0], seed, direct: true });
  // The app fades the last half second so the tail does not stop dead.
  const f = Math.floor(0.5 * SR);
  for (const c of ir) for (let k = 0; k < f; k++) c[c.length - f + k] *= 1 - k / f;
  wav(`${OUT}ir-${id}.wav`, ir);
  let e = 0; for (const c of ir) for (const v of c) e += v * v;
  lap(`traced ${id} from [${src}]: ${ir[0].length} samples, energy/ch ${(e / 2).toExponential(3)}`);
}
