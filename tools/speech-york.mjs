// How fast the York 16′ and 32′ pipes speak: time from note-on to half the
// steady level (10 ms windows), and to 90 %. Voiced pipes come from
// out/arr/voiced.json when there (see arr-render), else are voiced here.
// node tools/speech-york.mjs
import { readFileSync, existsSync } from 'node:fs';
import { STOPS } from '../engine/organ.js';
import { FluePipe } from '../engine/pipe.js';
import { voiceAll } from './minster-render.mjs';

const sr = 48000;
const RANKS = ['ymPedWood32', 'ymPedWood16', 'ymPedDiap16', 'ymPedSub16', 'ymDouble16', 'ymPedPrin8', 'ymStopped8'];
const KEYS = [36, 43, 48, 55, 60, 67];
const cache = existsSync('out/arr/voiced.json') ? JSON.parse(readFileSync('out/arr/voiced.json')) : {};
const need = RANKS.flatMap((stop) => KEYS.map((key) => ({ stop, key }))).filter((p) => !cache[`${p.stop}:${p.key}`]);
for (const v of await voiceAll(need)) cache[v.id] = v.params;
console.log('rank          ' + KEYS.map((k) => String(k).padStart(11)).join(''));
for (const stop of RANKS) {
  const row = KEYS.map((key) => {
    const p = new FluePipe(sr, cache[`${stop}:${key}`], 1); p.noteOn();
    const win = 480, env = []; let acc = 0;
    for (let i = 0; i < sr * 1.5; i++) { const x = p.tick(1); acc += x * x; if ((i + 1) % win === 0) { env.push(Math.sqrt(acc / win)); acc = 0; } }
    const steady = env.slice(-30).reduce((a, b) => a + b, 0) / 30;
    const t50 = env.findIndex((e) => e > 0.5 * steady) * 10, t90 = env.findIndex((e) => e > 0.9 * steady) * 10;
    return `${t50}/${t90}`.padStart(11);
  });
  console.log(stop.padEnd(14) + row.join(''));
}
console.log('ms to 50 % / 90 % of steady level');
