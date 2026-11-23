// One flue pipe: a jet-drive waveguide.
// Wind makes a jet. The jet crosses the pipe mouth (jet delay) and hits the lip
// (a soft nonlinearity). The lip feeds the air column (bore delay). The air
// column reflects back and bends the jet. That loop is the pipe speaking.
// Runs the same in Node, a Worker and an AudioWorklet.

const TWO_PI = Math.PI * 2;

class Delay {
  constructor(size) {
    this.buf = new Float32Array(size);
    this.size = size;
    this.w = 0;
  }
  // Read `d` samples back (fractional, linear), then write x.
  tick(x, d) {
    let r = this.w - d;
    while (r < 0) r += this.size;
    const i = r | 0;
    const f = r - i;
    const a = this.buf[i];
    const b = this.buf[(i + 1) % this.size];
    const y = a + (b - a) * f;
    this.buf[this.w] = x;
    this.w = (this.w + 1) % this.size;
    return y;
  }
  clear() {
    this.buf.fill(0);
  }
}

// Cheap deterministic noise so renders repeat exactly.
function makeRng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) / 4294967296) * 2 - 1;
  };
}

export class FluePipe {
  // p: { bore (samples), jetRatio, jetRefl, endRefl, loss (0..1 lowpass),
  //      breath, noise, chiff, stopped, gain }
  constructor(sampleRate, p, seed = 1) {
    this.sr = sampleRate;
    this.bore = new Delay(Math.ceil(sampleRate / 12) + 8); // down to ~12 Hz
    this.jet = new Delay(Math.ceil(sampleRate / 12) + 8);
    this.rand = makeRng(seed);
    this.set(p);
    this.reset();
  }

  set(p) {
    this.p = { ...p };
    this.boreLen = Math.max(2, p.bore);
    // Open pipe: the loop carries the full harmonic series, period = bore.
    // Stopped pipe: the closed top flips the reflection, period = 2 x bore and
    // only odd harmonics. The jet's travel time is a fraction of that period.
    const period = p.stopped ? 2 * this.boreLen : this.boreLen;
    // Toe: the hole in the pipe's foot sets the pressure at the mouth. Less
    // pressure = a slower jet (longer travel time over the mouth) and less flow.
    // jetRatio is the cut-up at full foot pressure; the jet speed goes as the
    // square root of pressure, so the travel time goes as 1 / sqrt(foot).
    this.foot = Math.max(0.05, p.foot ?? 1);
    this.jetLen = Math.max(1, (period * p.jetRatio) / Math.sqrt(this.foot));
    // Wall and radiation loss as a one-pole lowpass. Its corner sits a set number
    // of harmonics above the pipe's own note, so a rank keeps one colour from
    // bass to treble (organ builders call this scaling).
    const fc = Math.min(0.45 * this.sr, (p.bright ?? 6) * (this.sr / period));
    this.lossA = Math.exp((-2 * Math.PI * fc) / this.sr);
    this.lossG = p.lossGain ?? 0.995;
    this.radScale = period / (2 * Math.PI);
    this.sign = p.stopped ? -1 : 1;
  }

  reset() {
    this.bore.clear();
    this.jet.clear();
    this.lp = 0;
    this.dcx = 0;
    this.dcy = 0;
    this.env = 0;
    this.target = 0;
    this.chiffEnv = 0;
    this.kickEnv = 0;
    this.bp1 = 0;
    this.bp2 = 0;
    this.last = 0;
    this.level = 0;
    this.tPrev = 0;
  }

  noteOn() {
    this.target = 1;
    this.chiffEnv = 1;
    this.kickEnv = 1;
  }

  noteOff() {
    this.target = 0;
  }

  // wind: shared wind pressure near 1.0 (carries tremulant and wobble)
  tick(wind = 1) {
    const p = this.p;
    // Valve: fast but not instant, as a pallet opens.
    const rate = this.target > this.env ? p.attack ?? 0.004 : p.release ?? 0.002;
    this.env += (this.target - this.env) * rate;

    // Air column return, with wall and radiation loss (one-pole lowpass).
    const b = this.lastBore ?? 0;
    this.lp = (1 - this.lossA) * b + this.lossA * this.lp;
    let t = this.sign * this.lp * this.lossG;
    // DC block so the loop does not drift.
    const dc = t - this.dcx + 0.9995 * this.dcy;
    this.dcx = t;
    this.dcy = dc;
    t = dc;

    // Wind and turbulence. Chiff = a short burst of edge noise at the onset.
    this.chiffEnv *= p.chiffDecay ?? 0.9985;
    this.kickEnv *= 0.9993;
    const n = this.rand();
    // Kick: the pallet opens with a brief pressure surge, which helps a big pipe
    // find its note quickly, as real pipes do.
    const A = this.foot; // flow scale: the whole jet scales with foot pressure
    const breath =
      A * p.breath * this.env * wind * (1 + p.noise * n) * (1 + (p.kick ?? 0.35) * this.kickEnv) +
      A * p.chiff * this.chiffEnv * this.env * n;

    const pd = breath - p.jetRefl * t;
    const jd = this.jet.tick(pd, this.jetLen);
    // Jet meets the lip: soft cubic, clipped. `offset` is how far the jet aims
    // off the lip; off-centre gives even harmonics (a principal's bite).
    const o = p.offset ?? 0;
    const xj = jd / A + o;
    let j = xj * (xj * xj - 1) - o * (o * o - 1);
    if (j > 1) j = 1;
    else if (j < -1) j = -1;
    j *= A;

    const into = j + p.endRefl * t;
    this.lastBore = this.bore.tick(into, this.boreLen);
    // Radiation: a small opening radiates the rate of change of the flow, which
    // tilts the tone brighter. `rad` 0 = flute-like, 1 = bright principal.
    const d = (t - this.tPrev) * this.radScale;
    this.tPrev = t;
    const out = (t + (p.rad ?? 0) * d) * (p.gain ?? 1);
    this.last = out;
    return out;
  }

  // Silent and closed: safe to reuse.
  get idle() {
    return this.target === 0 && this.env < 1e-4;
  }
}

export { makeRng, TWO_PI };
