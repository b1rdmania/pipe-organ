// Auralize the measured source/receiver pair and check the synthesized IR
// with the same metrics as the real one. Writes out/minster/sim-vs-real.wav
import { mkdirSync, writeFileSync } from 'node:fs';
import { build, CALIB } from '../engine/minster.js';
import { binauralIR } from '../engine/auralize.js';
import { traceParallel, MEASURED_SRC, MEASURED_REC } from './minster-ir.mjs';
import { readWav, metrics, table } from './ir-metrics.mjs';

const r = await traceParallel(MEASURED_SRC, MEASURED_REC, { rays: 200000, scatter: 0.35, maxTime: 10, binMs: 1, radius: 1.5, calib: CALIB, skipDirect: true });
const ir = binauralIR(r, { src: MEASURED_SRC, rec: MEASURED_REC, forward: [1, 0, 0], left: [0, 1, 0] });
const sr = 48000;
const mono = ir[0].map((v, i) => (v + ir[1][i]) / 2);
console.log(table(metrics(mono, sr), 'SYNTH IR'));
const real = readWav(new URL('../ref/york-minster/minster1_omni_48k.wav', import.meta.url).pathname);
console.log(table(metrics(real.channels[0], sr), 'MEASURED'));
mkdirSync('out/minster', { recursive: true });
let pk = 0; for (const c of ir) for (const v of c) pk = Math.max(pk, Math.abs(v));
const n = ir[0].length, b = Buffer.alloc(44 + n * 8);
b.write('RIFF', 0); b.writeUInt32LE(36 + n * 8, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(3, 20); b.writeUInt16LE(2, 22);
b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 8, 28); b.writeUInt16LE(8, 32); b.writeUInt16LE(32, 34); b.write('data', 36); b.writeUInt32LE(n * 8, 40);
for (let i = 0; i < n; i++) { b.writeFloatLE(ir[0][i] / pk * 0.9, 44 + i * 8); b.writeFloatLE(ir[1][i] / pk * 0.9, 48 + i * 8); }
writeFileSync('out/minster/ir-sim-measured-pair.wav', b);
