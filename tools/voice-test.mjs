import { STOPS } from '../engine/organ.js';
import { voicePipe } from '../engine/voicer.js';
const sr = 48000;
const t0 = Date.now();
let fails = [], n = 0, steps = 0;
for (const [id, stop] of Object.entries(STOPS)) {
  const keys = stop.feet === 16 || id === 'pedal8' ? [24, 31, 36, 43, 48, 55] : [36, 43, 48, 55, 60, 67, 72, 79, 84, 91, 96];
  const row = [];
  for (const key of keys) {
    const v = voicePipe(sr, stop, key);
    n++; steps += v.steps.length;
    const l = v.steps.at(-1);
    row.push(`${key}:${v.ok ? 'ok' : 'XX'}/${v.steps.length}/${l.cents?.toFixed(1)}c/b${l.bright.toFixed(1)}`);
    if (!v.ok) fails.push(`${id} ${key} ${JSON.stringify(v.steps.map(s => [Math.round(s.f), s.cents && +s.cents.toFixed(0), +s.jetRatio.toFixed(3), +s.clarity.toFixed(2), +s.rms.toFixed(3)]))}`);
  }
  console.log(id.padEnd(11), row.join(' '));
}
console.log(`${n} pipes, ${steps} tries, ${Date.now() - t0} ms, ${fails.length} failed`);
fails.slice(0, 12).forEach(f => console.log(f));
