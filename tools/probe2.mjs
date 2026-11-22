import { FluePipe } from '../engine/pipe.js';
import { measure } from '../engine/pitch.js';
const sr = 48000;
for (const stopped of [false, true]) for (const loss of [3, 8]) {
  console.log(`--- stopped=${stopped} bright=${loss}`);
  for (const jr of [0.2, 0.3, 0.4, 0.5, 0.6]) {
    const row = [];
    for (const f of [33, 65, 131, 262, 523, 1047, 2093, 4186]) {
      const bore = stopped ? sr / (2 * f) : sr / f;
      const p = new FluePipe(sr, { bore, jetRatio: jr, jetRefl: 0.5, endRefl: 0.5, bright: loss, breath: 0.85, noise: 0.015, chiff: 0, stopped, gain: 1 }, 3);
      p.noteOn(); const n = sr * 0.3, x = new Float32Array(n);
      for (let i = 0; i < n; i++) x[i] = p.tick(1);
      const m = measure(x.subarray(n / 2), sr, f / 2.5, f * 3.5);
      row.push(`${f}:${m.f ? (m.f / f).toFixed(2) : '--'}/${m.rms.toFixed(2)}/b${m.bright.toFixed(1)}`);
    }
    console.log(`jr ${jr}`, row.join(' '));
  }
}
