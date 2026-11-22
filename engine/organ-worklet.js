// The organ, live, on the audio thread.
import { Player } from './player.js';

class OrganProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.player = null;
    this.frame = 0;
    this.port.onmessage = (e) => {
      const { voiced, style, events } = e.data;
      this.player = new Player(sampleRate, { voiced, style });
      this.player.load(events);
      this.frame = 0;
    };
  }
  process(_, outputs) {
    const out = outputs[0];
    if (!this.player) return true;
    const finished = this.player.process(out[0]);
    for (let c = 1; c < out.length; c++) out[c].set(out[0]);
    if (++this.frame % 12 === 0) this.port.postMessage({ t: this.player.t / sampleRate, levels: this.player.snapshot() });
    if (finished) { this.port.postMessage({ finished: true }); this.player = null; }
    return true;
  }
}
registerProcessor('organ', OrganProcessor);
