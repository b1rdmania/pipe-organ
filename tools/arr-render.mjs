// Render orchestrated songs dry, offline, and measure them: RMS per role
// (tune, harmony, pedal) and per division, and loudness per octave from the
// spectrum of the mix. Writes out/arr/<song>.wav. Voiced pipes are kept in
// out/arr/voiced.json so a second run is quick.
// node tools/arr-render.mjs [title ...] [--calibrate]
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { parseMidi } from '../engine/midi.js';
import { orchestrate, loudness, CAL } from '../engine/orchestrate.js';
import { STYLES } from '../engine/organ.js';
import { Player } from '../engine/player.js';
import { voiceAll } from './minster-render.mjs';
import { SONGS } from './arr-check.mjs';

const sr = 48000, OUT = 'out/arr', CACHE = `${OUT}/voiced.json`;
mkdirSync(OUT, { recursive: true });
const args = process.argv.slice(2), names = args.filter((a) => !a.startsWith('--'));
const songs = SONGS.filter((s) => !s.bach && (!names.length || names.some((n) => s.title.toLowerCase().includes(n.toLowerCase()))));
const arrs = songs.map((s) => ({ s, arr: orchestrate(parseMidi(readFileSync(s.file)), { solo: s.title === 'Whiter Shade' ? '2/2' : undefined }) }));

// Voice every pipe any of them needs, once.
const voiced = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE)) : {};
const need = new Map();
for (const { arr } of arrs) for (const p of arr.pipes) if (!voiced[`${p.stop}:${p.key}`]) need.set(`${p.stop}:${p.key}`, p);
if (need.size) {
  console.log(`voicing ${need.size} pipes`);
  for (const v of await voiceAll([...need.values()])) voiced[v.id] = v.params;
  writeFileSync(CACHE, JSON.stringify(voiced));
}

function render(events, box, n) {
  const p = new Player(sr, { voiced, style: STYLES.york, polyphony: 256 });
  p.load(events, box);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i += 128) p.process(x.subarray(i, Math.min(n, i + 128)));
  return x;
}
const rms = (x) => { let s = 0; for (const v of x) s += v * v; return Math.sqrt(s / x.length); };

// Power per octave band (C to C), Hann-windowed FFT frames.
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const a = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) for (let k = 0; k < len / 2; k++) {
      const c = Math.cos(a * k), s = Math.sin(a * k), u = i + k, v = i + k + len / 2;
      const tr = re[v] * c - im[v] * s, ti = re[v] * s + im[v] * c;
      re[v] = re[u] - tr; im[v] = im[u] - ti; re[u] += tr; im[u] += ti;
    }
  }
}
function octaves(x) {
  const N = 16384, band = new Float64Array(10);
  const C0 = 16.352;
  for (let o = 0; o + N <= x.length; o += N / 2) {
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = x[o + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
    fft(re, im);
    for (let k = 1; k < N / 2; k++) { const f = (k * sr) / N, b = Math.floor(Math.log2(f / C0)); if (b >= 0 && b < 10) band[b] += re[k] * re[k] + im[k] * im[k]; }
  }
  const tot = band.reduce((a, b) => a + b, 0);
  return [...band].map((p) => (100 * p) / tot);
}

const pct = (o) => { const t = Object.values(o).reduce((a, b) => a + b, 0); return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Math.round((100 * v) / t)])); };
const ratios = [];
for (const { s, arr } of arrs) {
  const n = Math.ceil((arr.length + 3) * sr);
  const stems = {};
  for (const e of arr.events) (stems[`${e.role}/${e.div}`] ??= []).push(e);
  const audio = {};
  for (const [k, ev] of Object.entries(stems)) audio[k] = render(ev, arr.box, n);
  const mix = new Float32Array(n);
  for (const x of Object.values(audio)) for (let i = 0; i < n; i++) mix[i] += x[i];
  const sum = (f) => { const o = {}; for (const [k, x] of Object.entries(audio)) { const g = f(k); const r = rms(x); o[g] = Math.sqrt((o[g] ?? 0) ** 2 + r * r); } return o; };
  const role = sum((k) => k.split('/')[0]), div = sum((k) => k.split('/')[1]);
  const est = loudness(arr.events, arr.box);
  ratios.push(Object.fromEntries(Object.keys(role).map((r) => [r, role[r] / (est[r] / (CAL[r] ?? 1))])));
  const ob = octaves(mix);
  let pk = 0; for (const v of mix) pk = Math.max(pk, Math.abs(v));
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round((mix[i] / pk) * 0.89 * 32767), 44 + i * 2);
  const file = `${OUT}/${s.title.toLowerCase().replace(/\W+/g, '-')}.wav`;
  writeFileSync(file, b);
  const r = pct(role), ok = r.tune >= 35 && r.tune <= 45 && r.harmony >= 30 && r.harmony <= 40 && r.bass >= 15 && r.bass <= 25;
  console.log(`${s.title.padEnd(14)} RMS role tune ${r.tune}% harmony ${r.harmony}% pedal ${r.bass}% ${ok ? 'in band' : 'OUT OF BAND'} | division ${Object.entries(pct(div)).map(([k, v]) => `${k} ${v}%`).join(' ')} | ${file}`);
  console.log(`${''.padEnd(14)} octaves (power %) ${ob.map((p, o) => (p >= 0.5 ? `C${o}:${Math.round(p)}` : '')).filter(Boolean).join(' ')}`);
}
if (args.includes('--calibrate')) {
  // Rendered RMS / estimate, per role, relative to the tune.
  const gm = (r) => Math.exp(ratios.reduce((a, x) => a + Math.log(x[r] / x.tune), 0) / ratios.length);
  console.log('CAL =', JSON.stringify({ tune: 1, harmony: +gm('harmony').toFixed(3), bass: +gm('bass').toFixed(3) }));
}
