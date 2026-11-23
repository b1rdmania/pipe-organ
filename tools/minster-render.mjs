// A song on the York Minster organ, heard from a place in the Minster.
// Voices every pipe (in parallel), renders a dry stem per part of the organ
// case, traces the calibrated Minster from each part to the listener, and
// convolves with two-ear impulse responses.
// node tools/minster-render.mjs <song.mid> <fromSec> <toSec> <outName> [listenerX=40] [rays=120000]
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { STOPS, STYLES } from '../engine/organ.js';
import { voicePipe } from '../engine/voicer.js';

if (!isMainThread) {
  const out = workerData.pipes.map(({ stop, key }) => {
    const v = voicePipe(48000, STOPS[stop], key);
    return { id: `${stop}:${key}`, ok: v.ok, params: v.params };
  });
  parentPort.postMessage(out);
}

export async function voiceAll(pipes) {
  const n = Math.max(1, availableParallelism() - 1);
  // Big pipes take longest; deal them round-robin so workers finish together.
  const sorted = pipes.slice().sort((a, b) => STOPS[b.stop].feet * 2 ** (-b.key / 12) - STOPS[a.stop].feet * 2 ** (-a.key / 12));
  const chunks = Array.from({ length: n }, (_, i) => sorted.filter((_, k) => k % n === i));
  const res = await Promise.all(chunks.map((c) => new Promise((ok, no) => {
    const w = new Worker(new URL(import.meta.url), { workerData: { pipes: c } });
    w.on('message', ok); w.on('error', no);
  })));
  return res.flat();
}

// Where each part of the organ speaks from, on the pulpitum (metres; est from
// photographs of the case: Great in the main case, upper work above it,
// pedal at the sides). C side to the north (+y), C♯ side to the south.
export function sourceOf(e, stop) {
  const side = e.key % 2 === 0 ? 1 : -1;
  const x = 90.75;
  if (e.pedal) return { id: `pedal${side > 0 ? 'C' : 'Cs'}`, pos: [x, side * 4.2, 8.6] };
  const upper = STOPS[stop].feet < 4;
  return upper ? { id: `upper${side > 0 ? 'C' : 'Cs'}`, pos: [x, side * 2.2, 12.8] } : { id: `great${side > 0 ? 'C' : 'Cs'}`, pos: [x, side * 2.6, 10.2] };
}

if (isMainThread && import.meta.url === `file://${process.argv[1]}`) {
  const { parseMidi } = await import('../engine/midi.js');
  const { arrange } = await import('../engine/arranger.js');
  const { Player } = await import('../engine/player.js');
  const { build, CALIB } = await import('../engine/minster.js');
  const { binauralIR } = await import('../engine/auralize.js');
  const { traceParallel } = await import('./minster-ir.mjs');
  const { convolve } = await import('./convolve.mjs');
  const [file, from, to, name, lx = '40', rays = '120000'] = process.argv.slice(2);
  const sr = 48000;
  const t0 = Date.now();
  const lap = (s) => console.log(`${((Date.now() - t0) / 1000).toFixed(1).padStart(6)} s  ${s}`);

  // Minster RT at 500 Hz is about 8.4 s; slow down as an organist there would.
  const arr = arrange(parseMidi(readFileSync(file)), 'york', { from: +from, to: +to, speed: 0.82 });
  lap(`${arr.pipes.length} pipes, ${arr.events.length} pipe-notes, ${arr.length.toFixed(1)} s`);
  const voicedList = await voiceAll(arr.pipes);
  const voiced = Object.fromEntries(voicedList.map((v) => [v.id, v.params]));
  lap(`voiced; ${voicedList.filter((v) => !v.ok).length} not settled`);

  // Dry stems per source.
  const groups = {};
  for (const e of arr.events) { const s = sourceOf(e, e.stop); (groups[s.id] ??= { pos: s.pos, ev: [] }).ev.push(e); }
  const total = Math.ceil((arr.length + 2) * sr);
  for (const g of Object.values(groups)) {
    const p = new Player(sr, { voiced, style: STYLES.york, polyphony: 256 });
    p.load(g.ev);
    g.dry = new Float32Array(total);
    for (let i = 0; i < total; i += 128) p.process(g.dry.subarray(i, Math.min(total, i + 128)));
  }
  lap(`rendered ${Object.keys(groups).length} dry stems`);

  // Listener: centre line of the nave, seated ear height, facing the organ (east).
  const rec = [+lx, 0, 1.2];
  const wet = [new Float32Array(total + 10 * sr), new Float32Array(total + 10 * sr)];
  for (const [id, g] of Object.entries(groups)) {
    const r = await traceParallel(g.pos, rec, { rays: +rays, scatter: 0.35, maxTime: 10, binMs: 1, radius: 1.5, calib: CALIB, skipDirect: true });
    const ir = binauralIR(r, { src: g.pos, rec, forward: [1, 0, 0], left: [0, 1, 0], seed: id.length * 977 + id.charCodeAt(0) });
    for (let ear = 0; ear < 2; ear++) {
      const y = convolve(g.dry, ir[ear]);
      for (let i = 0; i < Math.min(y.length, wet[ear].length); i++) wet[ear][i] += y[i];
    }
    lap(`traced + convolved ${id}`);
  }
  // Trim the silent head (sound takes ~0.15 s to arrive) and normalise.
  let pk = 0; for (const c of wet) for (const v of c) pk = Math.max(pk, Math.abs(v));
  let end = wet[0].length; while (end > 0 && Math.abs(wet[0][end - 1]) < pk * 1e-4) end--;
  mkdirSync('out/minster', { recursive: true });
  const n = end, b = Buffer.alloc(44 + n * 4);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 4, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22);
  b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) for (let c = 0; c < 2; c++) b.writeInt16LE(Math.round((wet[c][i] / pk) * 0.89 * 32767), 44 + (i * 2 + c) * 2);
  const base = `out/minster/${name}`;
  writeFileSync(`${base}.wav`, b);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', `${base}.wav`, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=18', '-ar', '48000', '-b:a', '256k', `${base}.mp3`]);
  lap(`wrote ${base}.mp3`);
}
