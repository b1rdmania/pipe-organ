// Listens to the Minster from one part of the organ: traces sound to the
// listener, turns it into a two-ear impulse response, measures its decay,
// and returns a few ray paths for the picture.
import { ROOMS } from './rooms.js';
import { trace, decay } from './acoustics.js';
import { binauralIR } from './auralize.js';

let model;
self.onmessage = (e) => {
  const { id, src, rec, rays, seed, sr, maxTime = 9, paths = 0, direct = true, room = 'york' } = e.data;
  const { build, CALIB } = ROOMS[room];
  model ??= build();
  const r = trace(model, src, rec, { rays, seed, scatter: 0.35, maxTime, binMs: 1, radius: 1.5, calib: CALIB, skipDirect: true, paths });
  const metrics = decay(r);
  const ir = binauralIR(r, { sr, src, rec, forward: [1, 0, 0], left: [0, 1, 0], seed, direct });
  self.postMessage({ id, ir, metrics, paths: r.paths }, ir.map((c) => c.buffer));
};
