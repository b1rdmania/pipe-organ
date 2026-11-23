// Offline: render dry stems by façade position, for spatial mixing elsewhere.
// Each stem is the pipes that stand in one part of the façade: C side (left)
// or C♯ side (right), outer / mid / centre by size, plus the pedal towers.
// Also writes the first pipe's voicing attempts as its own stem.
// node tools/stems.mjs <song.mid> <place> <style> <fromSec> <toSec> <outDir>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { parseMidi } from '../engine/midi.js';
import { arrange, tempoFor } from '../engine/arranger.js';
import { STOPS, STYLES } from '../engine/organ.js';
import { voicePipe } from '../engine/voicer.js';
import { Player } from '../engine/player.js';
import { PLACES, rt60 } from '../engine/room.js';

const [file, placeId, style, from, to, outDir] = process.argv.slice(2);
const sr = 48000;
const place = PLACES[placeId];
const rt = rt60(place);
const speed = tempoFor((rt[2] + rt[3]) / 2);
const arr = arrange(parseMidi(readFileSync(file)), style, { from: +from, to: +to, speed });

const voiced = {};
let first = null;
for (const { stop, key } of arr.pipes) {
  const v = voicePipe(sr, STOPS[stop], key, { keepAudio: !first && stop === STYLES[style].manual[0] });
  voiced[`${stop}:${key}`] = v.params;
  if (!first && v.steps[0].audio) first = v;
}

const side = (k) => (k % 2 === 0 ? 'L' : 'R');
const zone = (e) => (e.pedal ? 'pedal' : e.key < 60 ? 'outer' : e.key < 80 ? 'mid' : 'centre');
const groupOf = (e) => `${zone(e)}-${side(e.key)}`;

function wav(path, x, g) {
  const b = Buffer.alloc(44 + x.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + x.length * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24);
  b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(x.length * 2, 40);
  for (let i = 0; i < x.length; i++) b.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(x[i] * g * 32767))), 44 + i * 2);
  writeFileSync(path, b);
}

mkdirSync(outDir, { recursive: true });
const total = Math.ceil((arr.length + 1) * sr);
const groups = [...new Set(arr.events.map(groupOf))].sort();
const stems = {};
let peak = 0;
for (const g of groups) {
  const player = new Player(sr, { voiced, style: STYLES[style] });
  player.load(arr.events.filter((e) => groupOf(e) === g));
  const x = new Float32Array(total);
  for (let i = 0; i < total; i += 128) player.process(x.subarray(i, Math.min(total, i + 128)));
  for (const v of x) peak = Math.max(peak, Math.abs(v));
  stems[g] = x;
}
// One gain for all stems, so their balance stays as the organ made it.
const gain = 0.3 / peak;
for (const g of groups) wav(`${outDir}/${g}.wav`, stems[g], gain);

// The first pipe: each attempt, with a short gap, then the tuned pipe.
const gap = Math.round(0.25 * sr);
const heard = first.steps.filter((s) => s.audio);
const parts = heard.map((s) => s.audio);
const n = parts.reduce((a, p) => a + p.length + gap, 0);
const tune = new Float32Array(n);
let o = 0, tp = 0;
for (const p of parts) { tune.set(p, o); o += p.length + gap; for (const v of p) tp = Math.max(tp, Math.abs(v)); }
wav(`${outDir}/first-pipe.wav`, tune, 0.3 / tp);

const info = {
  length: total / sr,
  firstPipe: { stop: first.stop, key: first.key, group: groupOf({ key: first.key, pedal: false }), seconds: n / sr,
    steps: heard.map((s) => ({ cents: +s.cents.toFixed(1), action: s.action, seconds: +(s.audio.length / sr).toFixed(2) })) },
  groups,
};
writeFileSync(`${outDir}/stems.json`, JSON.stringify(info, null, 2));
console.log(JSON.stringify(info, null, 2));
