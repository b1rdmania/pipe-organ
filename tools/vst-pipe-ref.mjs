// Reference renders of single pipes from the JS engine, for the plugin's C++
// port to be checked against (vst/test/pipe_compare.cpp).
// node tools/vst-pipe-ref.mjs
// Writes vst/out/pipe-ref/cases.txt and <n>.f64 (the JS output, float64).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { FluePipe } from '../engine/pipe.js';

const SR = 48000;
const dir = new URL('../vst/out/pipe-ref/', import.meta.url).pathname;
mkdirSync(dir, { recursive: true });
const { pipes } = JSON.parse(readFileSync(new URL('../vst/Resources/voiced.json', import.meta.url)));
const CASES = ['ymDiap8a:60', 'ymStopped8:48', 'ymOctave4:72', 'ymMix22:93', 'ymDouble16:36', 'ymPedSub16:36', 'ymPedDiap16:50', 'ymSuper2:84'];
const KEYS = ['bore', 'jetRatio', 'jetRefl', 'endRefl', 'breath', 'noise', 'chiff', 'gain', 'foot', 'kick', 'bright', 'rad', 'stopped'];
// Wind steps, exact in both languages: full, sagging, surging.
const windAt = (i, n) => (i < n / 3 ? 1 : i < (2 * n) / 3 ? 0.97 : 1.03);
const lines = [];
CASES.forEach((id, c) => {
  const p = pipes[id];
  const seed = 7 + c * 13, n = SR * 2, off = Math.round(SR * 1.5);
  const pipe = new FluePipe(SR, p, seed);
  pipe.noteOn();
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) { if (i === off) pipe.noteOff(); y[i] = pipe.tick(windAt(i, n)); }
  writeFileSync(`${dir}${c}.f64`, Buffer.from(y.buffer));
  lines.push([id, seed, n, off, ...KEYS.map((k) => (k === 'stopped' ? (p[k] ? 1 : 0) : p[k].toPrecision(17)))].join(' '));
});
writeFileSync(`${dir}cases.txt`, lines.join('\n') + '\n');
console.log(`wrote ${CASES.length} reference renders to ${dir}`);
