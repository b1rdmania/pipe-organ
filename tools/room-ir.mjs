// Trace a room's measured source/receiver pair and calibrate its absorption
// against the measured impulse response, band by band (T30 goes as 1/A).
// node tools/room-ir.mjs <room> [rays=200000] [rounds=4]
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { ROOMS } from '../engine/rooms.js';
import { trace, merge, BANDS } from '../engine/acoustics.js';

if (!isMainThread) {
  const m = ROOMS[workerData.room].build();
  parentPort.postMessage(trace(m, workerData.src, workerData.rec, workerData.opts));
}
export async function traceRoom(room, src, rec, opts) {
  const n = Math.max(1, availableParallelism() - 1), per = Math.ceil(opts.rays / n);
  const parts = await Promise.all(Array.from({ length: n }, (_, i) => new Promise((ok, no) => {
    const w = new Worker(new URL(import.meta.url), { workerData: { room, src, rec, opts: { ...opts, rays: per, seed: (opts.seed || 1) * 7919 + i * 104729 } } });
    w.on('message', ok); w.on('error', no);
  })));
  return merge(parts);
}
if (isMainThread && import.meta.url === `file://${process.argv[1]}`) {
  const { readWav, metrics, table } = await import('./ir-metrics.mjs');
  const { histMetrics } = await import('./minster-ir.mjs');
  const [room, rays = '200000', rounds = '4'] = process.argv.slice(2);
  const R = ROOMS[room], { file, src, rec } = R.MEASURED;
  const { sr, channels } = readWav(new URL(`../${file}`, import.meta.url).pathname);
  const meas = metrics(channels[0], sr);
  console.log(table(meas, 'MEASURED'));
  let calib = [1, 1, 1, 1, 1, 1];
  for (let it = 0; it < +rounds; it++) {
    const t0 = Date.now();
    const r = await traceRoom(room, src, rec, { rays: +rays, scatter: 0.35, maxTime: 14, binMs: 2, radius: 1.5, calib });
    const sim = histMetrics(r);
    console.log(table(sim, it ? `CAL ${it}` : 'UNCALIBRATED') + `   (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    console.log('T30 error   ', BANDS.map((b) => ((((sim[b].T30 - meas[b].T30) / meas[b].T30) * 100).toFixed(0) + '%').padStart(5)).join(' '));
    console.log('EDT error   ', BANDS.map((b) => ((((sim[b].EDT - meas[b].EDT) / meas[b].EDT) * 100).toFixed(0) + '%').padStart(5)).join(' '));
    calib = calib.map((c, b) => c * Math.pow(sim[BANDS[b]].T30 / meas[BANDS[b]].T30, 1.15));
    console.log('next calib  ', calib.map((c) => c.toFixed(2).padStart(5)).join(' '));
  }
}
