// Check how a song will sound before it is played: arrange it, voice every
// pipe it uses, then play each pipe as the organ will (the wind sags a little
// when many pipes speak) and report any pipe that is out of tune, unsteady
// or out of level with its rank.
// node tools/song-check.mjs <song.mid> <from> <to> <reg> [keep,comma,list]
import { readFileSync } from 'node:fs';
import { parseMidi } from '../engine/midi.js';
import { arrange } from '../engine/arranger.js';
import { STOPS, STYLES, pipeHz } from '../engine/organ.js';
import { FluePipe } from '../engine/pipe.js';
import { measure, cents } from '../engine/pitch.js';
import { voiceAll } from './minster-render.mjs';

const REG = {
  full: { manual: STYLES.york.manual, pedal: STYLES.york.pedal },
  light: { manual: ['ymDiap8a', 'ymStopped8', 'ymOctave4'], pedal: ['ymPedSub16', 'ymPedPrin8'] },
  warm: { manual: ['ymDiap8a', 'ymDiap8b', 'ymStopped8', 'ymOctave4'], pedal: ['ymPedSub16', 'ymPedDiap16', 'ymPedPrin8'] },
};
const [file, from, to, reg = 'light', keep] = process.argv.slice(2);
const sr = 48000;
const arr = arrange(parseMidi(readFileSync(file)), 'york', { from: +from, to: +to, speed: 0.82, keep: keep ? keep.split(',') : undefined, ...REG[reg] });
const voiced = await voiceAll(arr.pipes);
const uses = {}; for (const e of arr.events) uses[`${e.stop}:${e.key}`] = (uses[`${e.stop}:${e.key}`] || 0) + 1;
const bad = [];
for (const v of voiced) {
  const [stop, k] = v.id.split(':'), key = +k, f = pipeHz(STOPS[stop], key);
  const row = { id: v.id, uses: uses[v.id], ok: v.ok, f: Math.round(f) };
  for (const [wind, seed] of [[1, 5], [0.97, 6], [1, 9], [1, 1], [1, 2], [0.97, 3], [1, 4], [1, 17]]) {
    const p = new FluePipe(sr, v.params, seed + key * 0); p.noteOn();
    const n = Math.round(sr * Math.min(1.2, Math.max(0.5, 40 / f))), x = new Float32Array(n);
    for (let i = 0; i < n; i++) x[i] = p.tick(wind);
    const m = measure(x.subarray(Math.floor(n / 2)), sr, f / 2.5, f * 3.5);
    const c = m.f ? cents(m.f, f) : null;
    if (c == null || Math.abs(c) > 12) { row.bad = row.bad || []; row.bad.push(`seed ${seed} wind ${wind}: ${c == null ? 'silent' : c.toFixed(0) + ' c'}`); }
  }
  if (!v.ok || row.bad) bad.push(row);
}
console.log(`${arr.pipes.length} pipes, ${arr.events.length} notes, ${arr.length.toFixed(1)} s; ${bad.length} suspect`);
for (const b of bad.sort((a, b) => b.uses - a.uses)) console.log(JSON.stringify(b));
// Level by rank: each pipe's level relative to its rank's median.
const byRank = {};
for (const v of voiced) { const s = v.id.split(':')[0]; (byRank[s] ??= []).push(v); }
