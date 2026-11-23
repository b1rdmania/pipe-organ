// Room acoustic parameters from an impulse response, per octave band, the
// ISO 3382 way: band-filter, Schroeder backward integration, then fit the
// decay. T30 from -5 to -35 dB, T20 from -5 to -25, EDT from 0 to -10.
// node tools/ir-metrics.mjs <ir.wav> [channel=0]
import { readFileSync } from 'node:fs';

export const BANDS = [125, 250, 500, 1000, 2000, 4000];

export function readWav(path) {
  const b = readFileSync(path);
  let o = 12, fmt, data;
  while (o < b.length - 8) {
    const id = b.toString('ascii', o, o + 4), size = b.readUInt32LE(o + 4);
    if (id === 'fmt ') fmt = { format: b.readUInt16LE(o + 8), ch: b.readUInt16LE(o + 10), sr: b.readUInt32LE(o + 12), bits: b.readUInt16LE(o + 22) };
    if (id === 'data') data = b.subarray(o + 8, o + 8 + size);
    o += 8 + size + (size & 1);
  }
  const { ch, bits } = fmt;
  const bps = bits / 8, n = Math.floor(data.length / (bps * ch));
  const out = Array.from({ length: ch }, () => new Float32Array(n));
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) {
    const p = (i * ch + c) * bps;
    let v;
    if (fmt.format === 3) v = bits === 32 ? data.readFloatLE(p) : data.readDoubleLE(p);
    else if (bits === 16) v = data.readInt16LE(p) / 32768;
    else if (bits === 24) v = data.readIntLE(p, 3) / 8388608;
    else v = data.readInt32LE(p) / 2147483648;
    out[c][i] = v;
  }
  return { sr: fmt.sr, channels: out };
}

// Octave band: two cascaded 2nd-order band-passes (RBJ), run forward and back
// so the decay is not smeared in time.
function bandpass(x, sr, fc) {
  const run = (y) => {
    const w = (2 * Math.PI * fc) / sr, q = Math.SQRT2, al = Math.sin(w) / (2 * q);
    const a0 = 1 + al, b0 = al / a0, b2 = -al / a0, a1 = (-2 * Math.cos(w)) / a0, a2 = (1 - al) / a0;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    const z = new Float64Array(y.length);
    for (let i = 0; i < y.length; i++) { const v = b0 * y[i] + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = y[i]; y2 = y1; y1 = v; z[i] = v; }
    return z;
  };
  let y = run(x); y = run(y.reverse()).reverse(); y = run(y); y = run(y.reverse()).reverse();
  return y;
}

// Fit a line to the Schroeder curve between two levels; return the time for 60 dB.
function fit(curve, sr, hi, lo) {
  let i0 = curve.findIndex((v) => v <= hi), i1 = curve.findIndex((v) => v <= lo);
  if (i0 < 0 || i1 < 0 || i1 <= i0 + 2) return null;
  let sx = 0, sy = 0, sxx = 0, sxy = 0, n = 0;
  for (let i = i0; i <= i1; i++) { const t = i / sr; sx += t; sy += curve[i]; sxx += t * t; sxy += t * curve[i]; n++; }
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  return -60 / slope;
}

export function metrics(x, sr) {
  // Start at the direct sound (ISO: 20 dB below the peak, before it).
  let pk = 0, pi = 0;
  for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) > pk) { pk = Math.abs(x[i]); pi = i; }
  let s = pi;
  while (s > 0 && Math.abs(x[s]) > pk * 0.1) s--;
  const y = x.subarray(s);
  const res = {};
  for (const fc of BANDS) {
    const b = bandpass(y, sr, fc);
    // Noise floor: mean energy of the last 10%; truncate where the decay meets it (Lundeby, simplified).
    const tail = Math.floor(b.length * 0.9);
    let noise = 0; for (let i = tail; i < b.length; i++) noise += b[i] * b[i]; noise /= b.length - tail;
    const win = Math.floor(sr * 0.05);
    let end = b.length;
    for (let i = 0; i + win < tail; i += win) {
      let e = 0; for (let k = i; k < i + win; k++) e += b[k] * b[k];
      if (e / win < noise * 2 && i > sr * 0.3) { end = i; break; }
    }
    const sch = new Float64Array(end);
    let acc = 0;
    for (let i = end - 1; i >= 0; i--) { acc += b[i] * b[i]; sch[i] = acc; }
    const curve = Array.from(sch, (v) => 10 * Math.log10(v / sch[0] + 1e-30));
    let e50 = 0, e80 = 0;
    for (let i = 0; i < Math.min(end, Math.round(0.08 * sr)); i++) { const v = b[i] * b[i]; e80 += v; if (i < 0.05 * sr) e50 += v; }
    res[fc] = {
      T30: fit(curve, sr, -5, -35), T20: fit(curve, sr, -5, -25), EDT: fit(curve, sr, 0, -10),
      C80: 10 * Math.log10(e80 / (sch[0] - e80)), D50: e50 / sch[0], range: -curve[curve.length - 1],
    };
  }
  return res;
}

export function table(res, label = '') {
  const f = (v) => (v == null ? '  –  ' : v.toFixed(2).padStart(5));
  const rows = [`${label.padEnd(12)}  ${BANDS.map((b) => String(b).padStart(5)).join(' ')}`];
  for (const k of ['T30', 'T20', 'EDT', 'C80']) rows.push(`${k.padEnd(12)}  ${BANDS.map((b) => f(res[b][k])).join(' ')}`);
  return rows.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [path, ch = '0'] = process.argv.slice(2);
  const { sr, channels } = readWav(path);
  console.log(table(metrics(channels[+ch], sr), path.split('/').pop().slice(0, 12)));
}
