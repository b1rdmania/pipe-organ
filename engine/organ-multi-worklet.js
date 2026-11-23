// The organ on the audio thread, one output channel per part of the case, so
// each part can be heard from where it stands.
import { Player } from './player.js';

class OrganMulti extends AudioWorkletProcessor {
  constructor() {
    super();
    this.players = null;
    this.frame = 0;
    this.port.onmessage = (e) => {
      // Played live: { live: { voiced, style, groups } } sets up one player per
      // part of the case; then { on: [group, id, gain] } and { off: [group, id] }.
      if (e.data.on) { this.players?.[e.data.on[0]]?.noteOn(e.data.on[1], e.data.on[2]); return; }
      if (e.data.off) { this.players?.[e.data.off[0]]?.noteOff(e.data.off[1]); return; }
      if (e.data.more) { for (const p of this.players || []) Object.assign(p.voiced, e.data.more); return; }
      if (e.data.live) {
        const { voiced, style, groups } = e.data.live;
        this.players = Array.from({ length: groups }, () => { const p = new Player(sampleRate, { voiced, style, polyphony: 64 }); p.load([]); p.live = true; return p; });
        this.done = this.players.map(() => false);
        return;
      }
      // groups: [[events], ...] in output order. box: the Swell shutters,
      // [[seconds, gain]], on the same clock as the events (optional).
      const { voiced, style, groups, box } = e.data;
      this.players = groups.map((ev) => { const p = new Player(sampleRate, { voiced, style, polyphony: 96 }); p.load(ev, box); return p; });
      this.done = groups.map((ev) => ev.length === 0);
    };
  }
  process(_, outputs) {
    const out = outputs[0];
    if (!this.players) return true;
    for (let g = 0; g < this.players.length && g < out.length; g++) if (!this.done[g]) this.done[g] = this.players[g].process(out[g]);
    if (++this.frame % 16 === 0) {
      const levels = {};
      for (const p of this.players) Object.assign(levels, p.snapshot());
      this.port.postMessage({ t: this.players[0].t / sampleRate, levels });
    }
    if (this.done.every(Boolean)) { this.port.postMessage({ finished: true }); this.players = null; }
    return true;
  }
}
registerProcessor('organ-multi', OrganMulti);
