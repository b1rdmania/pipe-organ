import { readFileSync } from 'node:fs';
import { parseMidi } from '../engine/midi.js';
import { arrange } from '../engine/arranger.js';
import { STOPS } from '../engine/organ.js';
import { voicePipe } from '../engine/voicer.js';
import { FluePipe } from '../engine/pipe.js';
import { measure } from '../engine/pitch.js';
const sr = 48000;
const arr = arrange(parseMidi(readFileSync('songs/ToccataFugue.mid')), 'cathedral', { from: 0, to: 15, speed: 0.82 });
const ev = arr.events.filter(e => e.t > 7.2 && e.t < 8.6);
console.log(ev.map(e => `${e.t.toFixed(2)} ${e.stop}:${e.key} dur${e.dur.toFixed(2)}`).join('\n'));
for (const e of ev) {
  const v = voicePipe(sr, STOPS[e.stop], e.key);
  const p = new FluePipe(sr, v.params, 5); p.noteOn();
  const n = Math.round(sr * Math.min(1.2, e.dur)); const x = new Float32Array(n); for (let i=0;i<n;i++) x[i]=p.tick(1);
  const m = measure(x.subarray(n/2), sr, v.target/2.5, v.target*3.5);
  console.log(e.stop, e.key, 'target', v.target.toFixed(1), 'voiced ok', v.ok, 'steps', v.steps.map(s=>s.action).join(','), '| in-song f', m.f.toFixed(1), 'clar', m.clarity.toFixed(2), 'bright', m.bright.toFixed(1));
}
