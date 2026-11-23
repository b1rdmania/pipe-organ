// The organ on the audio thread, one output channel per part of the case, so
// each part can be heard from where it stands.
import { Player } from './player.js';

class OrganMulti extends AudioWorkletProcessor {
  constructor() {
    super();
    this.players = null;
    this.frame = 0;
    this.port.onmessage = (e) => {
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
