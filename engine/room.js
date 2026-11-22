// A place, as sound. Shoebox geometry + surface absorption per octave band.
// Early reflections come from mirror-image sources; the late tail decays at
// each band's Eyring reverberation time, with air absorption. No AI here.
export const BANDS = [125, 250, 500, 1000, 2000, 4000, 8000];
const AIR = [0.0001, 0.0003, 0.0006, 0.001, 0.0025, 0.0072, 0.024]; // nepers per metre, ~20 C, 50% RH

export const PLACES = {
  cathedral: {
    name: 'Cathedral', size: 'large',
    dims: [90, 30, 28], alpha: [0.1, 0.11, 0.12, 0.13, 0.15, 0.17, 0.2],
    src: [8, 15, 12], ear: [62, 15, 1.7], order: 2,
  },
  stairwell: {
    name: 'Stairwell', size: 'small',
    dims: [5, 5, 22], alpha: [0.03, 0.035, 0.04, 0.045, 0.05, 0.06, 0.08],
    src: [1.2, 1.5, 20], ear: [3.6, 3.4, 1.7], order: 7,
  },
  chapel: {
    name: 'Wooden chapel', size: 'small',
    dims: [16, 9, 9], alpha: [0.22, 0.19, 0.16, 0.13, 0.12, 0.12, 0.13],
    src: [1.5, 4.5, 4], ear: [12, 4.5, 1.6], order: 4,
  },
};

export function rt60(place) {
  const [L, W, H] = place.dims;
  const V = L * W * H, S = 2 * (L * W + L * H + W * H);
  return place.alpha.map((a, i) => (0.161 * V) / (-S * Math.log(1 - a) + 4 * AIR[i] * V));
}

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) / 4294967296) * 2 - 1; };
}

// Biquad band-pass (constant skirt), one octave wide.
function bandpass(x, f, sr) {
  const w = (2 * Math.PI * f) / sr, q = 1.41, al = Math.sin(w) / (2 * q), cs = Math.cos(w);
  const b0 = al, b2 = -al, a0 = 1 + al, a1 = -2 * cs, a2 = 1 - al;
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = (b0 * x[i] + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}

export function impulseResponse(place, sr = 48000) {
  const rts = rt60(place);
  const [L, W, H] = place.dims;
  const V = L * W * H;
  const maxRt = Math.max(...rts);
  const n = Math.floor(sr * Math.min(12, maxRt * 1.1 + 0.2));
  const c = 343;
  const out = [new Float32Array(n), new Float32Array(n)];
  const alphaMid = (place.alpha[2] + place.alpha[3]) / 2;
  const R = Math.sqrt(1 - alphaMid);

  // Early: mirror images of the organ in the walls, heard by two ears 20 cm apart.
  const [sx, sy, sz] = place.src;
  const N = place.order;
  for (let ear = 0; ear < 2; ear++) {
    const [ex, ey, ez] = [place.ear[0], place.ear[1] + (ear ? 0.1 : -0.1), place.ear[2]];
    for (let i = -N; i <= N; i++) for (let j = -N; j <= N; j++) for (let k = -N; k <= N; k++) {
      const order = Math.abs(i) + Math.abs(j) + Math.abs(k);
      if (order > N) continue;
      const ix = i * L + (i % 2 ? L - sx : sx), iy = j * W + (j % 2 ? W - sy : sy), iz = k * H + (k % 2 ? H - sz : sz);
      const d = Math.hypot(ix - ex, iy - ey, iz - ez);
      const t = (d / c) * sr;
      if (t >= n - 2) continue;
      const amp = Math.pow(R, order) / Math.max(1, d);
      const t0 = Math.floor(t), fr = t - t0;
      out[ear][t0] += amp * (1 - fr);
      out[ear][t0 + 1] += amp * fr;
    }
  }

  // Late: noise in octave bands, each decaying at its own rate. Its level follows
  // diffuse-field theory: reverberant energy over direct energy at 1 m = 1 / rc^2,
  // where rc is the critical distance.
  const rtMid = (rts[2] + rts[3]) / 2;
  const rc = 0.057 * Math.sqrt(V / rtMid);
  const tMix = Math.min(0.25, 0.001 * Math.sqrt(V));
  const dDirect = Math.hypot(sx - place.ear[0], sy - place.ear[1], sz - place.ear[2]);
  const t0 = Math.floor((dDirect / c) * sr);
  for (let ch = 0; ch < 2; ch++) {
    const r = rng(17 + ch * 7919);
    const noise = new Float32Array(n);
    for (let i = 0; i < n; i++) noise[i] = r();
    const late = new Float32Array(n);
    BANDS.forEach((f, b) => {
      const y = bandpass(noise, f, sr);
      const k = -6.91 / (rts[b] * sr);
      for (let i = t0; i < n; i++) {
        const tt = i - t0;
        const fade = Math.min(1, tt / (tMix * sr));
        late[i] += y[i] * Math.exp(k * tt) * fade;
      }
    });
    // energy target relative to a direct sound of amplitude 1 at 1 m
    let e = 0;
    for (let i = 0; i < n; i++) e += late[i] * late[i];
    const g = Math.sqrt(1 / (rc * rc) / (e || 1));
    for (let i = 0; i < n; i++) out[ch][i] += late[i] * g;
  }

  // Normalise so every place plays at a similar loudness.
  let e = 0;
  for (const ch of out) for (const v of ch) e += v * v;
  const g = 1 / Math.sqrt(e / 2);
  for (const ch of out) for (let i = 0; i < n; i++) ch[i] *= g;
  return { channels: out, sampleRate: sr, rt: rts, rc, length: n / sr };
}
