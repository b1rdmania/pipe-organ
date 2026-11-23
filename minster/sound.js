// The sound. Each part of the organ case is a source where it is drawn (HRTF),
// plus the room's traced two-ear echo through a convolver per part. The
// listener is the camera.
import * as THREE from 'three';
import { P } from './scene.js';
import { STOPS } from '../engine/organ.js';
import { FluePipe } from '../engine/pipe.js';

export const SR = 48000;

// Notes on voiced pipes, rendered to one buffer: [{ params, key, t, d }] with
// start and length in seconds.
export function renderNotes(notes, tail = 0.8) {
  const end = Math.max(...notes.map((n) => n.t + n.d)) + tail, x = new Float32Array(Math.round(end * SR));
  for (const { params, key, t, d } of notes) {
    const pipe = new FluePipe(SR, params, 77 + key), a = Math.round(t * SR), off = Math.round(d * SR);
    pipe.noteOn();
    for (let i = 0; a + i < x.length; i++) { if (i === off) pipe.noteOff(); x[a + i] += pipe.tick(1); }
  }
  return x;
}

export function buildAudio(ctx, { pipes, organSource, sources }) {
  const master = new GainNode(ctx, { gain: 9 });
  const limit = new DynamicsCompressorNode(ctx, { threshold: -10, knee: 6, ratio: 12, attack: 0.003, release: 0.25 });
  master.connect(limit).connect(ctx.destination);
  const meter = new AnalyserNode(ctx, { fftSize: 4096 }); limit.connect(meter);
  const mbuf = new Float32Array(4096);
  window.voicerLevel = () => { meter.getFloatTimeDomainData(mbuf); let e = 0; for (const v of mbuf) e += v * v; return 10 * Math.log10(e / mbuf.length + 1e-12); };
  const at = (pos) => { const v = P(...pos); return { positionX: v.x, positionY: v.y, positionZ: v.z }; };
  // Direct sound from where a pipe stands. Inverse distance, as in the
  // traced echo (amplitude 1 / (sqrt(4 pi) d) in its units).
  const panner = (pos) => new PannerNode(ctx, { panningModel: 'HRTF', distanceModel: 'inverse', refDistance: 1, rolloffFactor: 1, maxDistance: 2000, ...at(pos) });
  // Each part of the case: the centre of its pipe mouths as drawn.
  const centres = Object.fromEntries(sources.map((id) => [id, [0, 0, 0, 0]]));
  for (const p of pipes) { const c = centres[organSource({ key: p.key, pedal: !!p.pedal }, STOPS[p.stop].feet).id]; c[0] += p.mx; c[1] += p.my; c[2] += p.mz + p.foot; c[3]++; }
  const SRC = sources.map((id) => { const c = centres[id]; return c[3] ? [c[0] / c[3], c[1] / c[3], c[2] / c[3]] : [90.75, 0, 10]; });
  // The room's echo, one convolver per part (great, upper, pedal); sends start shut.
  const echo = {};
  for (const g of ['great', 'upper', 'pedal']) {
    const send = new GainNode(ctx, { gain: 0 });
    const conv = new ConvolverNode(ctx, { disableNormalization: true });
    // Our traced echo carries too little early sound in the low bands
    // (C80 at 125-250 Hz is 5-7 dB under the measured Minster), which reads
    // as mud. Take that excess out of the echo only, not the pipes.
    const low = new BiquadFilterNode(ctx, { type: 'lowshelf', frequency: 220, gain: -5 });
    const box = new BiquadFilterNode(ctx, { type: 'peaking', frequency: 420, Q: 0.9, gain: -2.5 });
    send.connect(conv).connect(low).connect(box).connect(master);
    echo[g] = { send, conv };
  }
  const node = new AudioWorkletNode(ctx, 'organ-multi', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [sources.length] });
  const split = new ChannelSplitterNode(ctx, { numberOfOutputs: sources.length });
  node.connect(split);
  sources.forEach((id, i) => {
    const d = new GainNode(ctx, { gain: 0.282 });
    split.connect(d, i, 0); d.connect(panner(SRC[i])).connect(master);
    split.connect(echo[id.replace(/Cs?$/, '')].send, i, 0);
  });
  let wet = false;
  const fwd = new THREE.Vector3();
  return {
    node, make: 9,
    setEcho(traced) {
      let e = 0, n = 0;
      for (const t of traced) {
        for (const c of t.ir) { const f = Math.floor(0.5 * SR); for (let i = 0; i < f; i++) c[c.length - f + i] *= 1 - i / f; for (const v of c) e += v * v; n++; }
        const b = new AudioBuffer({ numberOfChannels: 2, length: t.ir[0].length, sampleRate: SR });
        b.copyToChannel(t.ir[0], 0); b.copyToChannel(t.ir[1], 1);
        echo[t.id].conv.buffer = b;
      }
      this.make = 0.24 / Math.sqrt(e / n);
    },
    // Open the echo: the room arrives, and the level follows the room.
    openEcho(sec = 3, level = 1) {
      wet = true;
      const t = ctx.currentTime;
      for (const g of Object.values(echo)) g.send.gain.setTargetAtTime(level, t, sec / 3);
      master.gain.setTargetAtTime(this.make, t, sec / 3);
    },
    // One sound from one place.
    play(x, pos, group = 'great', gain = 1) {
      const b = new AudioBuffer({ length: x.length, sampleRate: SR }); b.copyToChannel(x, 0);
      const s = new AudioBufferSourceNode(ctx, { buffer: b });
      const g = new GainNode(ctx, { gain: 0.282 * gain });
      s.connect(g); g.connect(panner(pos)).connect(master);
      if (wet) g.connect(echo[group].send);
      s.start();
    },
    listen(cam) {
      const L = ctx.listener, p = cam.position; cam.getWorldDirection(fwd);
      const t = ctx.currentTime + 0.03;
      if (L.positionX) {
        L.positionX.linearRampToValueAtTime(p.x, t); L.positionY.linearRampToValueAtTime(p.y, t); L.positionZ.linearRampToValueAtTime(p.z, t);
        L.forwardX.linearRampToValueAtTime(fwd.x, t); L.forwardY.linearRampToValueAtTime(fwd.y, t); L.forwardZ.linearRampToValueAtTime(fwd.z, t);
        L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
      } else { L.setPosition(p.x, p.y, p.z); L.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0); }
    },
  };
}
