// Voices a batch of pipes off the main thread and reports each one as it is done.
import { voicePipe } from './voicer.js';
import { STOPS } from './organ.js';

self.onmessage = (e) => {
  const { sr, pipes, audible } = e.data;
  for (const p of pipes) {
    const keepAudio = audible.includes(`${p.stop}:${p.key}`);
    const v = voicePipe(sr, STOPS[p.stop], p.key, { keepAudio });
    const transfer = [];
    const steps = v.steps.map((s) => {
      if (s.audio) transfer.push(s.audio.buffer);
      return { bore: s.bore, jetRatio: s.jetRatio, f: s.f, cents: s.cents, action: s.action, audio: s.audio };
    });
    self.postMessage({ id: `${p.stop}:${p.key}`, ok: v.ok, target: v.target, params: v.params, steps }, transfer);
  }
  self.postMessage({ done: true });
};
