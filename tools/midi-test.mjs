import { readFileSync, readdirSync } from 'node:fs';
import { parseMidi } from '../engine/midi.js';
for (const f of readdirSync('songs').filter(f => f.endsWith('.mid'))) {
  const m = parseMidi(readFileSync('songs/' + f));
  const byTrack = {};
  for (const n of m.notes) { const k = `${n.track}/${n.ch}`; (byTrack[k] ??= []).push(n.key); }
  const desc = Object.entries(byTrack).map(([k, ks]) => `${k}:${ks.length}n avg${(ks.reduce((a,b)=>a+b,0)/ks.length).toFixed(0)} [${Math.min(...ks)}-${Math.max(...ks)}]`).join('  ');
  let poly = 0; const ev = []; m.notes.forEach(n => { ev.push([n.t, 1], [n.t + n.dur, -1]); }); ev.sort((a,b)=>a[0]-b[0]||a[1]-b[1]); let c=0; for (const e of ev) { c+=e[1]; poly=Math.max(poly,c); }
  console.log(`${f}: ${m.notes.length} notes, ${m.length.toFixed(0)}s, maxPoly ${poly}, names ${JSON.stringify(m.names.filter(Boolean))}\n   ${desc}`);
}
