// Renders the opening of Bach's Toccata in D minor on every York rank, offline,
// with the same pipes and the same note code as the browser (sound.js
// renderNotes), so the app can play it at once instead of making it live.
// node tools/toccata-render.mjs  ->  minster/toccata.bin + minster/toccata.json
import { readFileSync, writeFileSync } from 'node:fs';
import { FluePipe } from '../engine/pipe.js';
import { STYLES } from '../engine/organ.js';

const SR = 48000, TAIL = 0.8;
// Same notes as TOCCATA in minster/app.js: [key, start s, length s].
export const TOCCATA = {
  manual: [[81, 0, 0.09], [79, 0.09, 0.09], [81, 0.18, 1.2], [69, 0, 0.09], [67, 0.09, 0.09], [69, 0.18, 1.2],
    ...[79, 77, 76, 74, 73].flatMap((k, i) => [[k, 2.0 + i * 0.13, 0.13], [k - 12, 2.0 + i * 0.13, 0.13]]), [74, 2.65, 1.4], [62, 2.65, 1.4]],
  pedal: [[38, 2.65, 1.4]],
};
const pipes = JSON.parse(readFileSync(new URL('../vst/Resources/voiced.json', import.meta.url))).pipes;
const end = (notes) => Math.max(...notes.map(([, t, d]) => t + d)) + TAIL;
const len = Math.round(Math.max(end(TOCCATA.manual), end(TOCCATA.pedal)) * SR);
const out = { great: new Float32Array(len), pedal: new Float32Array(len) };
let missing = 0;
for (const [group, ranks, notes] of [['great', STYLES.york.manual, TOCCATA.manual], ['pedal', STYLES.york.pedal, TOCCATA.pedal]]) {
  const x = out[group];
  for (const rank of ranks) for (const [key, t, d] of notes) {
    const params = pipes[`${rank}:${key}`]; if (!params) { missing++; continue; }
    const pipe = new FluePipe(SR, params, 77 + key), a = Math.round(t * SR), off = Math.round(d * SR);
    const stop = Math.min(x.length - a, off + Math.round(TAIL * SR));
    pipe.noteOn();
    for (let i = 0; i < stop; i++) { if (i === off) pipe.noteOff(); x[a + i] += pipe.tick(1); }
  }
}
// 16-bit, each part scaled to its own peak.
const peak = {}, bin = new Int16Array(2 * len);
['great', 'pedal'].forEach((g, j) => {
  peak[g] = out[g].reduce((m, v) => Math.max(m, Math.abs(v)), 0) || 1;
  for (let i = 0; i < len; i++) bin[j * len + i] = Math.round((out[g][i] / peak[g]) * 32767);
});
writeFileSync(new URL('../minster/toccata.bin', import.meta.url), Buffer.from(bin.buffer));
writeFileSync(new URL('../minster/toccata.json', import.meta.url), JSON.stringify({ sr: SR, length: len, peak }) + '\n');
console.log(`toccata: ${(len / SR).toFixed(2)} s, peaks ${JSON.stringify(peak)}, missing pipes ${missing}`);
