// How fast does each pipe speak? Time to reach half its steady amplitude.
import { STOPS } from '../engine/organ.js';
import { voicePipe } from '../engine/voicer.js';
import { FluePipe } from '../engine/pipe.js';
const sr = 48000;
for (const id of ['principal8','octave4','gedackt8','tibia8','subbass16']) {
  const row = [];
  for (const key of [36, 48, 60, 72, 84]) {
    const v = voicePipe(sr, STOPS[id], key);
    const p = new FluePipe(sr, v.params, 1); p.noteOn();
    const n = sr; const env = []; let acc = 0;
    const win = 480; let buf = 0;
    for (let i = 0; i < n; i++) { const x = p.tick(1); buf += x * x; if ((i + 1) % win === 0) { env.push(Math.sqrt(buf / win)); buf = 0; } }
    const steady = env.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const k = env.findIndex(e => e > 0.5 * steady);
    row.push(`${key}:${(k * 10)}ms`);
  }
  console.log(id.padEnd(11), row.join('  '));
}
