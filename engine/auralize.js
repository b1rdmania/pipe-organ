// Turn a traced energy histogram into a two-ear impulse response.
// Late sound: band-limited noise shaped to the traced energy in each band,
// different noise for each ear, with a simple head shadow from the arrival
// direction. Direct sound: one impulse with the right delay, time difference
// and level difference between the ears. A spherical-head model, not a
// measured HRTF.
import { BANDS, AIR } from './acoustics.js';

const C = 343;
const SHADOW = [0.1, 0.15, 0.3, 0.5, 0.7, 0.8]; // how much the head shades the far ear, per band
const HEAD = 0.0875; // m, head radius

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296 * 2 - 1; };
}
function bandpass(x, sr, fc) {
  const run = (y) => {
    const w = (2 * Math.PI * fc) / sr, q = Math.SQRT2, al = Math.sin(w) / (2 * q);
    const a0 = 1 + al, b0 = al / a0, b2 = -al / a0, a1 = (-2 * Math.cos(w)) / a0, a2 = (1 - al) / a0;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    const z = new Float32Array(y.length);
    for (let i = 0; i < y.length; i++) { const v = b0 * y[i] + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = y[i]; y2 = y1; y1 = v; z[i] = v; }
    return z;
  };
  // Two forward-backward passes: steep enough that bands do not leak into each other.
  return run(run(run(run(x).reverse()).reverse()).reverse()).reverse();
}

// ear: listener's frame. forward and left are unit vectors in world space.
export function binauralIR(r, { sr = 48000, src, rec, forward = [1, 0, 0], left = [0, 1, 0], direct = true, seed = 1 }) {
  const n = Math.ceil((r.hist[0].length * r.binMs * sr) / 1000);
  const binS = (r.binMs * sr) / 1000;
  const out = [new Float32Array(n), new Float32Array(n)];
  const rand = rng(seed);
  BANDS.forEach((fc, b) => {
    for (let ear = 0; ear < 2; ear++) {
      // Unit-variance noise in this band.
      const w = new Float32Array(n);
      for (let i = 0; i < n; i++) w[i] = rand();
      const nb = bandpass(w, sr, fc);
      let e = 0; for (let i = 0; i < n; i++) e += nb[i] * nb[i];
      const g = 1 / Math.sqrt(e / n);
      const sgn = ear === 0 ? 1 : -1; // left ear faces +left
      const hb = r.hist[b], db = r.dirs[b];
      for (let k = 0; k < hb.length; k++) {
        const E = hb[k];
        if (!E) continue;
        // Arrival direction projected on the ear axis; diffuse sound averages to zero.
        const side = (db[k * 3] * left[0] + db[k * 3 + 1] * left[1] + db[k * 3 + 2] * left[2]) / E;
        const ge = Math.max(0.05, 1 + SHADOW[b] * sgn * side);
        const amp = Math.sqrt((E * ge) / binS) * g;
        const i0 = Math.round(k * binS), i1 = Math.min(n, Math.round((k + 1) * binS));
        for (let i = i0; i < i1; i++) out[ear][i] += nb[i] * amp;
      }
    }
  });
  if (direct) {
    const v = [src[0] - rec[0], src[1] - rec[1], src[2] - rec[2]];
    const d = Math.hypot(...v);
    const u = v.map((x) => x / d);
    const side = u[0] * left[0] + u[1] * left[1] + u[2] * left[2];
    const itd = (HEAD / C) * (Math.asin(Math.max(-1, Math.min(1, side))) + side); // Woodworth
    const E = 1 / (4 * Math.PI * d * d);
    // Each band gets the direct energy E (same units as the traced sound),
    // as a band-filtered impulse, so the spectrum matches the reverb's.
    const len = Math.round(0.05 * sr);
    BANDS.forEach((fc, b) => {
      const imp = new Float32Array(len * 2); imp[len] = 1;
      const f = bandpass(imp, sr, fc);
      let e = 0; for (const x of f) e += x * x;
      const air = Math.exp((-Math.log(10) * AIR[b] / 10) * d);
      for (let ear = 0; ear < 2; ear++) {
        const sgn = ear === 0 ? 1 : -1;
        const ild = Math.max(0.05, 1 + SHADOW[b] * sgn * side);
        const a = Math.sqrt((E * air * ild) / e);
        const t0 = Math.round((d / C + (sgn > 0 ? -itd / 2 : itd / 2)) * sr) - len;
        for (let i = 0; i < f.length; i++) { const k = t0 + i; if (k >= 0 && k < n) out[ear][k] += f[i] * a; }
      }
    });
  }
  return out;
}
