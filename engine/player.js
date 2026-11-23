// Plays an arrangement on voiced pipes. One shared wind supply: it wobbles a
// little, can carry a tremulant, and sags slightly when many pipes speak, as a
// real bellows does. Used by the AudioWorklet and by the offline renderer.
import { FluePipe } from './pipe.js';

export class Player {
  constructor(sr, { voiced, style, polyphony = 128 }) {
    this.sr = sr;
    this.voiced = voiced; // map "stop:key" -> params
    this.style = style;
    this.pool = Array.from({ length: polyphony }, (_, i) => ({ pipe: new FluePipe(sr, { bore: 100, jetRatio: 0.45, jetRefl: 0.5, endRefl: 0.5, breath: 0.9, noise: 0, chiff: 0, gain: 0 }, i + 1), busy: false, id: null, until: 0 }));
    this.events = [];
    this.next = 0;
    this.t = 0; // samples
    this.wob = 0;
    this.seed = 12345;
    this.active = 0;
    this.levels = new Map(); // id -> level, for the picture
  }

  // box: the Swell shutters over time, [[seconds, gain]]; events with
  // div 'swell' sound through it. Without it every pipe plays at its gain.
  load(events, box = []) {
    this.events = events.map((e) => ({ ...e, s: Math.round(e.t * this.sr), e: Math.round((e.t + e.dur) * this.sr), id: `${e.stop}:${e.key}` }));
    this.box = box.map(([t, g]) => [Math.round(t * this.sr), g]);
    this.bi = 0;
    this.next = 0;
    this.t = 0;
    for (const v of this.pool) { v.busy = false; v.pipe.reset(); }
  }

  rand() {
    let s = this.seed;
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    this.seed = s;
    return ((s >>> 0) / 4294967296) * 2 - 1;
  }

  start(ev) {
    const params = this.voiced[ev.id];
    if (!params) return;
    // Reuse the same pipe if it is still sounding (a repeated note).
    let v = this.pool.find((v) => v.busy && v.id === ev.id);
    if (!v) v = this.pool.find((v) => !v.busy);
    if (!v) return;
    if (v.id !== ev.id || !v.busy) { v.pipe.set(params); v.pipe.reset(); }
    v.busy = true; v.id = ev.id; v.until = ev.e; v.gain = ev.gain ?? 1; v.swell = ev.div === 'swell';
    v.pipe.noteOn();
  }

  // Played live (the chord player): a note sounds until it is released.
  noteOn(id, gain = 1) { this.start({ id, e: Infinity, gain }); }
  noteOff(id) { for (const v of this.pool) if (v.busy && v.id === id) v.until = this.t; }

  // Fill `out` (mono) with the next block.
  process(out) {
    const st = this.style;
    for (let i = 0; i < out.length; i++) {
      while (this.next < this.events.length && this.events[this.next].s <= this.t) this.start(this.events[this.next++]);
      // wind: slow wobble + tremulant + sag
      this.wob += (this.rand() - this.wob) * 0.0005;
      const trem = st.tremulant ? st.tremulant * Math.sin((2 * Math.PI * (st.tremRate || 6) * this.t) / this.sr) : 0;
      const wind = 1 + st.wobble * this.wob * 20 + trem - Math.min(0.03, this.active * 0.0006);
      // Swell box, linear between its points.
      let bx = 1;
      const B = this.box;
      if (B.length) {
        while (this.bi + 1 < B.length && B[this.bi + 1][0] <= this.t) this.bi++;
        const a = B[this.bi], b = B[this.bi + 1];
        bx = this.t <= a[0] ? a[1] : b ? a[1] + ((b[1] - a[1]) * (this.t - a[0])) / (b[0] - a[0]) : a[1];
      }
      let s = 0, act = 0;
      for (const v of this.pool) {
        if (!v.busy) continue;
        if (this.t >= v.until && v.pipe.target) v.pipe.noteOff();
        s += v.pipe.tick(wind) * (v.gain ?? 1) * (v.swell ? bx : 1);
        if (v.pipe.idle) v.busy = false; else act++;
      }
      this.active = act;
      out[i] = s;
      this.t++;
    }
    if (this.live) return false;
    return this.t >= (this.events.at(-1)?.e ?? 0) + this.sr * 0.5 && this.pool.every((v) => !v.busy);
  }

  snapshot() {
    const m = {};
    for (const v of this.pool) if (v.busy) m[v.id] = Math.max(m[v.id] || 0, v.pipe.env);
    return m;
  }
}
