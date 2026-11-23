// Trace York Minster for one source and receiver, compare with the measured
// OpenAIR impulse response (source under the tower, receiver mid-nave).
// node tools/minster-ir.mjs [rays=200000] [scatter=0.35]
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { build, X } from '../engine/minster.js';
import { trace, merge, BANDS } from '../engine/acoustics.js';

// OpenAIR York Minster: source directly under the mid-point of the tower,
// receiver centre of nave, 23.69 m apart, both 1.5 m high.
export const MEASURED_SRC = [(X.naveEnd + X.crossEnd) / 2, 0, 1.5];
export const MEASURED_REC = [(X.naveEnd + X.crossEnd) / 2 - 23.69, 0, 1.5];

if (!isMainThread) {
  const m = build();
  const { src, rec, opts } = workerData;
  const r = trace(m, src, rec, opts);
  parentPort.postMessage(r);
}

export async function traceParallel(src, rec, opts) {
  const n = Math.max(1, availableParallelism() - 1);
  const per = Math.ceil(opts.rays / n);
  const parts = await Promise.all(Array.from({ length: n }, (_, i) => new Promise((res, rej) => {
    const w = new Worker(new URL(import.meta.url), { workerData: { src, rec, opts: { ...opts, rays: per, seed: (opts.seed || 1) * 7919 + i * 104729 } } });
    w.on('message', res); w.on('error', rej);
  })));
  return merge(parts);
}

// Decay parameters straight from the energy histogram (Schroeder integral).
export function histMetrics(r) {
  const out = {};
  BANDS.forEach((fc, b) => {
    const hb = r.hist[b];
    const sch = new Float64Array(hb.length);
    let acc = 0;
    for (let i = hb.length - 1; i >= 0; i--) { acc += hb[i]; sch[i] = acc; }
    const first = hb.findIndex((v) => v > 0);
    const db = Array.from(sch, (v) => 10 * Math.log10(v / sch[first] + 1e-30));
    const fit = (hi, lo) => {
      const i0 = db.findIndex((v, i) => i >= first && v <= hi), i1 = db.findIndex((v, i) => i >= first && v <= lo);
      if (i0 < 0 || i1 < 0) return null;
      let sx = 0, sy = 0, sxx = 0, sxy = 0, n = 0;
      for (let i = i0; i <= i1; i++) { const t = (i * r.binMs) / 1000; sx += t; sy += db[i]; sxx += t * t; sxy += t * db[i]; n++; }
      return -60 / ((n * sxy - sx * sy) / (n * sxx - sx * sx));
    };
    const b80 = first + Math.round(80 / r.binMs);
    let e80 = 0; for (let i = first; i < b80; i++) e80 += hb[i];
    out[fc] = { T30: fit(-5, -35), T20: fit(-5, -25), EDT: fit(0, -10), C80: 10 * Math.log10(e80 / (sch[first] - e80)) };
  });
  return out;
}

if (isMainThread && import.meta.url === `file://${process.argv[1]}`) {
  const { readWav, metrics, table } = await import('./ir-metrics.mjs');
  const [rays = '200000', scatter = '0.35'] = process.argv.slice(2);
  const { sr, channels } = readWav(new URL('../ref/york-minster/minster1_omni_48k.wav', import.meta.url).pathname);
  const meas = metrics(channels[0], sr);
  console.log(table(meas, 'MEASURED'));
  // Calibrate: scale absorption per band until T30 matches (T is about 1/A).
  let calib = [1, 1, 1, 1, 1, 1];
  for (let it = 0; it < 4; it++) {
    const t0 = Date.now();
    const r = await traceParallel(MEASURED_SRC, MEASURED_REC, { rays: +rays, scatter: +scatter, maxTime: 11, binMs: 2, radius: 1.5, calib });
    const sim = histMetrics(r);
    console.log(table(sim, it ? `CAL ${it}` : 'UNCALIBRATED') + `   (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    console.log('T30 error   ', BANDS.map((b) => ((((sim[b].T30 - meas[b].T30) / meas[b].T30) * 100).toFixed(0) + '%').padStart(5)).join(' '));
    console.log('EDT error   ', BANDS.map((b) => ((((sim[b].EDT - meas[b].EDT) / meas[b].EDT) * 100).toFixed(0) + '%').padStart(5)).join(' '));
    calib = calib.map((c, b) => c * Math.pow(sim[BANDS[b]].T30 / meas[BANDS[b]].T30, 1.15));
    console.log('next calib  ', calib.map((c) => c.toFixed(2).padStart(5)).join(' '));
  }
}
