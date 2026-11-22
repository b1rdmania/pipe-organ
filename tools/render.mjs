// Offline: voice an organ for a song and a place, render it, write WAVs.
// node tools/render.mjs <song.mid> <place> [style] [fromSec] [toSec]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { parseMidi } from '../engine/midi.js';
import { arrange, tempoFor, chooseStyle } from '../engine/arranger.js';
import { STOPS, STYLES } from '../engine/organ.js';
import { voicePipe } from '../engine/voicer.js';
import { Player } from '../engine/player.js';
import { PLACES, impulseResponse, rt60 } from '../engine/room.js';
import { convolve } from './convolve.mjs';

const [file, placeId = 'cathedral', styleArg, from = '0', to = '9999'] = process.argv.slice(2);
const sr = 48000;
const place = PLACES[placeId];
const rt = rt60(place);
const rtMid = (rt[2] + rt[3]) / 2;
const midi = parseMidi(readFileSync(file));
const style = styleArg || chooseStyle({ mood: 'grand' }, { rt: rtMid, size: place.size });
const speed = tempoFor(rtMid);
const arr = arrange(midi, style, { from: +from, to: +to, speed });
console.log(`${file} in ${place.name} (RT ${rtMid.toFixed(1)} s) on ${STYLES[style].name}: ${arr.events.length} pipe-notes, ${arr.pipes.length} pipes, tempo x${speed.toFixed(2)}, ${arr.length.toFixed(0)} s`);

let t0 = Date.now();
const voiced = {};
let bad = 0, tries = 0;
for (const { stop, key } of arr.pipes) {
  const v = voicePipe(sr, STOPS[stop], key);
  voiced[`${stop}:${key}`] = v.params;
  tries += v.steps.length;
  if (!v.ok) bad++;
}
console.log(`voiced ${arr.pipes.length} pipes in ${Date.now() - t0} ms (${tries} tries, ${bad} not settled)`);

t0 = Date.now();
const player = new Player(sr, { voiced, style: STYLES[style] });
player.load(arr.events);
const total = Math.ceil((arr.length + 1) * sr);
const dry = new Float32Array(total);
const block = 128;
for (let i = 0; i < total; i += block) player.process(dry.subarray(i, Math.min(total, i + block)));
let peak = 0; for (const v of dry) peak = Math.max(peak, Math.abs(v));
console.log(`rendered ${(total / sr).toFixed(0)} s in ${((Date.now() - t0) / 1000).toFixed(1)} s (x${((total / sr) / ((Date.now() - t0) / 1000)).toFixed(1)} realtime), peak ${peak.toFixed(2)}`);

function wav(path, chans) {
  const n = chans[0].length, nc = chans.length;
  const b = Buffer.alloc(44 + n * nc * 4);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * nc * 4, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(3, 20); b.writeUInt16LE(nc, 22); b.writeUInt32LE(sr, 24);
  b.writeUInt32LE(sr * nc * 4, 28); b.writeUInt16LE(nc * 4, 32); b.writeUInt16LE(32, 34); b.write('data', 36); b.writeUInt32LE(n * nc * 4, 40);
  for (let i = 0; i < n; i++) for (let c = 0; c < nc; c++) b.writeFloatLE(chans[c][i], 44 + (i * nc + c) * 4);
  writeFileSync(path, b);
}
mkdirSync('out', { recursive: true });
const base = `out/${file.split('/').pop().replace('.mid', '')}-${placeId}-${style}`;
const g = 0.5 / (peak || 1);
wav(`${base}-dry.wav`, [dry.map((v) => v * g)]);
const ir = impulseResponse(place, sr);
wav(`out/ir-${placeId}.wav`, ir.channels);
const wet = ir.channels.map((h) => convolve(dry, h));
let wp = 0; for (const ch of wet) for (const v of ch) wp = Math.max(wp, Math.abs(v));
wav(`${base}.wav`, wet.map((ch) => ch.map((v) => (v * 0.7) / wp)));
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', `${base}.wav`, '-b:a', '256k', `${base}.mp3`]);
console.log(`wrote ${base}.wav / .mp3`);
