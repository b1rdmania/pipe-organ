// Geometric acoustics on the cell model: stochastic ray tracing in six octave
// bands with air absorption and a mix of specular and diffuse reflection.
// The receiver is a sphere; every ray that crosses it adds energy to a time
// histogram, with its direction, so the result can be rendered for two ears.
import { glassShare } from './minster.js';

export const BANDS = [125, 250, 500, 1000, 2000, 4000];
// Air absorption, dB per metre, 20 °C, 50 % RH (ISO 9613-1, rounded).
export const AIR = [0.0004, 0.0011, 0.0019, 0.0037, 0.0097, 0.0328];
const C = 343;

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
}

// opts: { rays, maxTime, binMs, radius, scatter, seed }
export function trace(m, src, rec, opts = {}) {
  const { rays = 20000, maxTime = 11, binMs = 2, radius = 1.5, scatter = 0.35, seed = 1, directivity = null, calib = null, skipDirect = false, paths = 0 } = opts;
  const rayPaths = [];
  const nb = BANDS.length, nbin = Math.ceil((maxTime * 1000) / binMs);
  // hist[b][t] energy; dir[b][t*3+k] energy-weighted arrival direction.
  const hist = BANDS.map(() => new Float64Array(nbin));
  const dirs = BANDS.map(() => new Float64Array(nbin * 3));
  const rand = rng(seed);
  const { nx, ny, res, y0, f, h, zone, ceil, flo } = m;
  // Calibration: one factor per band on every surface's absorption.
  const materials = calib ? m.materials.map((a) => a.map((v, b) => Math.min(0.99, v * calib[b]))) : m.materials;
  const stone = materials[0], glass = materials[3];
  const V = (4 / 3) * Math.PI * radius ** 3;
  const maxLen = maxTime * C;
  const airK = AIR.map((a) => Math.log(10) * a / 10); // per metre, energy
  const e = new Float64Array(nb);
  let maxE = 0;

  const cellOf = (x, y) => {
    const i = Math.floor(x / res), j = Math.floor((y - y0) / res);
    return i < 0 || j < 0 || i >= nx || j >= ny ? -1 : j * nx + i;
  };

  for (let r = 0; r < rays; r++) {
    // Uniform direction (or the source's directivity, if given).
    let dz = 2 * rand() - 1, ph = 2 * Math.PI * rand(), q = Math.sqrt(1 - dz * dz);
    let dx = q * Math.cos(ph), dy = q * Math.sin(ph);
    let w = 1;
    if (directivity) w = directivity(dx, dy, dz);
    for (let b = 0; b < nb; b++) e[b] = w / rays;
    let x = src[0], y = src[1], z = src[2], dist = 0;
    let k = cellOf(x, y);
    const path = r < paths ? [[x, y, z]] : null;
    if (path) rayPaths.push(path);
    for (let bounce = 0; bounce < 4000 && dist < maxLen; bounce++) {
      // March cell by cell to the next surface.
      let i = k % nx, j = (k / nx) | 0;
      let t = 0, hit = null;
      const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1;
      const tdx = Math.abs(res / (dx || 1e-12)), tdy = Math.abs(res / (dy || 1e-12));
      let tx = dx > 0 ? ((i + 1) * res - x) / dx : dx < 0 ? (i * res - x) / dx : Infinity;
      let ty = dy > 0 ? ((j + 1) * res + y0 - y) / dy : dy < 0 ? (j * res + y0 - y) / dy : Infinity;
      for (;;) {
        const kk = j * nx + i;
        const tz = dz > 0 ? (h[kk] - z) / dz : dz < 0 ? (f[kk] - z) / dz : Infinity;
        const tn = Math.min(tx, ty);
        if (tz <= tn) { t = tz; hit = { n: 2, s: dz > 0 ? -1 : 1, mat: materials[dz > 0 ? ceil[kk] : flo[kk]], k: kk }; break; }
        // Step into the next cell; is the air open there at this height?
        const ni = tx < ty ? i + sx : i, nj = tx < ty ? j : j + sy;
        const zz = z + dz * tn;
        const nk = ni < 0 || nj < 0 || ni >= nx || nj >= ny ? -1 : nj * nx + ni;
        if (nk < 0 || h[nk] === 0 || zz > h[nk] || zz < f[nk]) {
          t = tn;
          let share = 0;
          const xx = x + dx * tn;
          if (nk < 0 || (h[nk] === 0 && zone[nk] === 0)) share = (m.glassShare ?? glassShare)(xx, zz, false, true);
          else if (h[nk] > 0 && zz > h[nk] + 1) share = (m.glassShare ?? glassShare)(xx, zz, true, false);
          const mat = h[nk] > 0 && zz < f[nk] ? materials[flo[nk]] : stone;
          hit = { n: tx < ty ? 0 : 1, s: tx < ty ? -sx : -sy, mat: share ? mat.map((a, b) => a * (1 - share) + glass[b] * share) : mat, k: kk };
          break;
        }
        if (tx < ty) { i = ni; tx += tdx; } else { j = nj; ty += tdy; }
      }
      // Receiver: does this straight segment pass through the sphere?
      const ox = rec[0] - x, oy = rec[1] - y, oz = rec[2] - z;
      const tc = ox * dx + oy * dy + oz * dz;
      if (!(skipDirect && bounce === 0) && tc > -radius && tc < t + radius) {
        const d2 = ox * ox + oy * oy + oz * oz - tc * tc;
        if (d2 < radius * radius) {
          const chord = 2 * Math.sqrt(radius * radius - d2);
          const L = dist + Math.max(0, tc);
          const bin = Math.floor(((L / C) * 1000) / binMs);
          if (bin < nbin) for (let b = 0; b < nb; b++) {
            const en = (e[b] * Math.exp(-airK[b] * Math.max(0, tc)) * chord) / V;
            hist[b][bin] += en;
            dirs[b][bin * 3] -= en * dx; dirs[b][bin * 3 + 1] -= en * dy; dirs[b][bin * 3 + 2] -= en * dz;
          }
        }
      }
      // Move to the surface, lose energy, reflect.
      x += dx * t; y += dy * t; z += dz * t; dist += t;
      if (path && path.length < 14) path.push([x, y, z]);
      maxE = 0;
      for (let b = 0; b < nb; b++) { e[b] *= Math.exp(-airK[b] * t) * (1 - hit.mat[b]); if (e[b] > maxE) maxE = e[b]; }
      if (maxE < 1e-8 / rays) break;
      const nrm = [0, 0, 0]; nrm[hit.n] = hit.s;
      if (rand() < scatter) {
        // Lambert: cosine-weighted around the normal.
        const u = rand(), a = 2 * Math.PI * rand(), rr = Math.sqrt(u), cz = Math.sqrt(1 - u);
        const l = [rr * Math.cos(a), rr * Math.sin(a)];
        // Build a basis around the normal axis.
        const ax = hit.n, o1 = (ax + 1) % 3, o2 = (ax + 2) % 3;
        const d = [0, 0, 0]; d[ax] = cz * hit.s; d[o1] = l[0]; d[o2] = l[1];
        dx = d[0]; dy = d[1]; dz = d[2];
      } else {
        if (hit.n === 0) dx = -dx; else if (hit.n === 1) dy = -dy; else dz = -dz;
      }
      // Nudge off the surface, back into open air.
      x += nrm[0] * 1e-4; y += nrm[1] * 1e-4; z += nrm[2] * 1e-4;
      k = cellOf(x, y);
      if (k < 0 || h[k] === 0) break;
    }
  }
  return { hist, dirs, binMs, rays, paths: rayPaths };
}

// Sum results from several workers.
export function merge(parts) {
  const a = parts[0];
  for (const p of parts.slice(1)) for (let b = 0; b < a.hist.length; b++) {
    for (let i = 0; i < a.hist[b].length; i++) a.hist[b][i] += p.hist[b][i];
    for (let i = 0; i < a.dirs[b].length; i++) a.dirs[b][i] += p.dirs[b][i];
  }
  const n = parts.length;
  for (let b = 0; b < a.hist.length; b++) { for (let i = 0; i < a.hist[b].length; i++) a.hist[b][i] /= n; for (let i = 0; i < a.dirs[b].length; i++) a.dirs[b][i] /= n; }
  return a;
}

// Is there a clear straight line between two points? (sampled every 0.2 m)
export function visible(m, a, b) {
  const { nx, ny, res, y0, f, h } = m;
  const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const n = Math.ceil(L / 0.2);
  for (let s = 1; s < n; s++) {
    const u = s / n, x = a[0] + (b[0] - a[0]) * u, y = a[1] + (b[1] - a[1]) * u, z = a[2] + (b[2] - a[2]) * u;
    const i = Math.floor(x / res), j = Math.floor((y - y0) / res);
    if (i < 0 || j < 0 || i >= nx || j >= ny) return false;
    const k = j * nx + i;
    if (h[k] === 0 || z < f[k] || z > h[k]) return false;
  }
  return true;
}

// Decay parameters from an energy histogram (Schroeder integral), per band.
export function decay(r) {
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
    out[fc] = { T30: fit(-5, -35), EDT: fit(0, -10) };
  });
  return out;
}
