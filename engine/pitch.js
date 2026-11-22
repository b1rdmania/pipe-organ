// Pitch and brightness of a steady tone. Normalised autocorrelation, first strong
// peak, parabolic refinement. Good to a fraction of a cent on a clean pipe.
export function measure(x, sr, fMin = 25, fMax = 5000) {
  const maxLag = Math.min(Math.floor(sr / fMin), Math.floor(x.length / 2));
  const minLag = Math.max(2, Math.floor(sr / fMax));
  const N = x.length - maxLag;
  const r = new Float64Array(maxLag + 2);
  let e0 = 0;
  for (let i = 0; i < N; i++) e0 += x[i] * x[i];
  if (e0 < 1e-9) return { f: 0, clarity: 0, rms: 0, bright: 0 };
  // running energy of the lagged window
  let e1 = 0;
  for (let i = minLag; i < minLag + N; i++) e1 += x[i] * x[i];
  let mx = 0;
  for (let l = minLag; l <= maxLag; l++) {
    let s = 0;
    for (let i = 0; i < N; i++) s += x[i] * x[i + l];
    r[l] = s / Math.sqrt(e0 * e1 + 1e-12);
    if (r[l] > mx) mx = r[l];
    e1 += x[l + N] * x[l + N] - x[l] * x[l];
  }
  let bl = 0;
  for (let l = minLag + 1; l < maxLag; l++) {
    if (r[l] > 0.9 * mx && r[l] >= r[l - 1] && r[l] >= r[l + 1]) { bl = l; break; }
  }
  if (!bl) return { f: 0, clarity: mx, rms: Math.sqrt(e0 / N), bright: 0 };
  const a = r[bl - 1], b = r[bl], c = r[bl + 1];
  const den = a - 2 * b + c;
  const d = den ? (0.5 * (a - c)) / den : 0;
  // brightness: energy of the first difference over energy, scaled by period,
  // which is roughly the spectral centroid in harmonics.
  let dd = 0;
  for (let i = 1; i < N; i++) { const v = x[i] - x[i - 1]; dd += v * v; }
  const f = sr / (bl + d);
  const centroidHz = (sr / (2 * Math.PI)) * Math.sqrt(dd / e0);
  return { f, clarity: mx, rms: Math.sqrt(e0 / N), bright: centroidHz / f };
}

export const cents = (f, target) => 1200 * Math.log2(f / target);
export const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);
