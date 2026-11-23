// The Voicer: a guided build in a cathedral (York or St Paul's), then you play it.
//   I.   The pipe: one pipe is drawn, sounds wrong, and is voiced step by step.
//   II.  The organ: every rank floats apart, is voiced for real, and slides home.
//   III. The cathedral: the building draws itself, then one chord is played
//        and its echo is traced through it, ray by ray.
//   IV.  Choose something to play.
// Everything is computed here: the voicing (workers), the echo (ray tracing in
// workers), and the organ itself (an AudioWorklet). The sound follows the
// camera: each part of the case is a source where it is drawn (HRTF), plus
// the traced two-ear echo of the Minster.
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { createScene, P } from './scene.js';
import { createStPaulsScene } from './scene-stpauls.js';
import { layoutOrganSplit } from './organ-layout-split.js';
import { STOPS, STYLES } from '../engine/organ.js';
import { parseMidi } from '../engine/midi.js';
import { orchestrate } from '../engine/orchestrate.js';
import { highlights } from '../engine/voicer.js';
import { FluePipe } from '../engine/pipe.js';
import { ROOMS } from '../engine/rooms.js';
import { layoutOrgan, organLines, pipeSegments, NEON, INK } from './organ-view.js';

// Pop songs: the arranger finds the chorus and orchestrates every part for the
// organ (engine/orchestrate.js). Bach's organ works play as written.
const SONGS = [
  { title: 'Believe', by: 'Cher', file: '../songs/cher-believe.mid' },
  { title: 'Toccata in D minor', by: 'J. S. Bach', file: '../songs/ToccataFugue.mid', from: 0, to: 20 },
  { title: 'A Whiter Shade of Pale', by: 'Procol Harum', file: '../songs/procol-whiter-shade-bitmidi.mid', solo: '2/2' },
  { title: 'All I Want for Christmas Is You', by: 'Mariah Carey', file: '../songs/mariah-aiwfc.mid' },
  { title: 'Passacaglia in C minor', by: 'J. S. Bach', file: '../songs/bwv582.mid', from: 0, to: 42 },
  { title: 'Fantasia in G minor', by: 'J. S. Bach', file: '../songs/bwv542-a4-1.mid', from: 0, to: 48 },
];
// The rooms. Each has its building, its acoustic model, how its organ stands,
// and the shots that show it.
const ROOM_ID = new URLSearchParams(location.search).get('room') === 'stpauls' ? 'stpauls' : 'york';
const ROOM_UI = {
  york: {
    name: 'York Cathedral', model: ROOMS.york,
    line: '160 metres of stone, glass and timber.',
    echoAt: [62, 0, 1.7], // the east end of the nave
    wide: { p: [-48, -150, 92], a: [76, 0, 6] },
    inside: (mid) => ({ p: [30, -7, 17], a: [mid[0], 0, mid[2] + 2] }),
    revealCentre: 0.6,
  },
  stpauls: {
    name: "St Paul's Cathedral", model: ROOMS.stpauls,
    line: 'Wren\'s cathedral: 146 metres long, the dome 65 metres high inside.',
    echoAt: [84, 0, 1.7], // under the dome
    wide: { p: [82.3 - 165, -150, 110], a: [84.3, 0, 40] },
    inside: (mid) => ({ p: [40, -6, 14], a: [mid[0], 0, mid[2] + 4] }),
    revealCentre: 0.7,
  },
}[ROOM_ID];
const { organSource, ORGAN_SOURCES, build: buildRoom } = ROOM_UI.model;
document.title = `The Voicer · ${ROOM_UI.name}`;
document.getElementById('roomname').textContent = ROOM_UI.name;
for (const a of document.querySelectorAll('#rooms a')) if (a.dataset.room === ROOM_ID) a.setAttribute('aria-current', 'page');
const ECHO_AT = ROOM_UI.echoAt;
const HERO = 'ymDiap8a:63'; // arrives badly wrong: it overblows to the octave and beyond
const SR = 48000;

const $ = (s) => document.querySelector(s);
// While the guided build runs, every wait can be cut short by Skip.
const SKIP = new Error('skip');
let skipSignal = null;
const sleep = (ms) => { const p = new Promise((r) => setTimeout(r, ms)); return skipSignal ? Promise.race([p, skipSignal]) : p; };
const ease = (u) => { u = Math.min(1, Math.max(0, u)); return u * u * (3 - 2 * u); };
const lerp = (a, b, u) => a.map((v, i) => v + (b[i] - v) * u);
const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const noteName = (k) => NAMES[k % 12] + (Math.floor(k / 12) - 1);

// ---- Cards: one line of story at a time.
async function card(small, title, line = '', hold = 0) {
  const c = $('#card');
  if (!c.classList.contains('gone')) { c.classList.add('gone'); await sleep(700); }
  c.querySelector('small').textContent = small;
  c.querySelector('h2').textContent = title;
  c.querySelector('p').textContent = line;
  c.classList.remove('gone');
  if (hold) await sleep(hold);
}
const cardOff = async () => { $('#card').classList.add('gone'); await sleep(800); };

// ---- Picture
const canvas = $('#c');
const S = ROOM_ID === 'stpauls'
  ? createStPaulsScene(canvas, { width: innerWidth, height: innerHeight, organCase: true, exterior: true })
  : createScene(canvas, { width: innerWidth, height: innerHeight, lineArt: true, organCase: false });
let exterior = false; // St Paul's: the outside of the dome, only from far away
const DPR = Math.min(1.25, devicePixelRatio);
S.renderer.setPixelRatio(DPR);
const portrait = () => innerWidth < innerHeight;

// Every pipe of the York flue chorus across the compass.
const ALL = [];
for (const stop of STYLES.york.manual) for (let k = 36; k <= 93; k++) ALL.push({ stop, key: k });
for (const stop of STYLES.york.pedal) for (let k = 36; k <= 67; k++) ALL.push({ stop, key: k, pedal: true });
const pipes = ROOM_ID === 'stpauls' ? layoutOrganSplit(ALL) : layoutOrgan(ALL);
const byId = new Map(pipes.map((p) => [p.id, p]));
const hero = byId.get(HERO);
const organ = organLines(S.root, pipes, hero);
hero.obj.visible = false;
for (const p of pipes) if (p !== hero) organ.setPipe(p, 'hidden');

// The hero in thick lines.
const fatMat = new LineMaterial({ color: 0xffffff, linewidth: 3, toneMapped: false, fog: false });
const fatGeo = new LineSegmentsGeometry();
fatGeo.setPositions(pipeSegments(hero, { cut: 0.55, len: 1.08, toe: 1.2 }));
const fat = new LineSegments2(fatGeo, fatMat);
fat.position.copy(P(hero.mx, hero.my, hero.mz));
fat.rotation.y = hero.face ?? 0;
S.root.add(fat);
const heroColour = new THREE.Color().copy(INK).multiplyScalar(0.35);
const LIT = () => heroColour.copy(NEON).multiplyScalar(3);
const INKED = () => heroColour.copy(INK).multiplyScalar(0.9);

function resize() {
  S.renderer.setSize(innerWidth, innerHeight, false);
  S.composer.setPixelRatio?.(DPR);
  S.composer.setSize(innerWidth, innerHeight);
  S.camera.aspect = innerWidth / innerHeight;
  S.camera.fov = portrait() ? 50 : 38;
  S.camera.updateProjectionMatrix();
  fatMat.resolution.set(innerWidth, innerHeight);
}
addEventListener('resize', resize); resize();
let baseFov = S.camera.fov;
function lens(fov, sec = 2) {
  const f0 = S.camera.fov, s = performance.now();
  const step = () => { const u = ease((performance.now() - s) / (sec * 1000)); S.camera.fov = f0 + (fov - f0) * u; S.camera.updateProjectionMatrix(); if (u < 1) requestAnimationFrame(step); };
  step();
}
const fog = (d) => { if (S.scene.fog) S.scene.fog.density = d; };
const bloom = S.composer.passes.find((p) => 'strength' in p);
// How bright the building's lines are (the organ is always brighter).
let church = 0.55;

// Ranks: the voicing order (the ranks most songs use first), and where each
// floats while it waits: further out toward the viewer, rank by rank.
const RANKS = [...STYLES.york.manual, ...STYLES.york.pedal];
const CORE = ['ymDiap8a', 'ymStopped8', 'ymOctave4', 'ymDiap8b', 'ymPedSub16', 'ymPedPrin8', 'ymPedDiap16'];
const ORDER = [...CORE, ...RANKS.filter((r) => !CORE.includes(r))];
const rank = Object.fromEntries(ORDER.map((r, i) => [r, { i, pipes: pipes.filter((p) => p.stop === r && p !== hero), done: 0, apart: 1 }]));
// Each waiting rank stands out in front of its own case (toward whoever
// faces that case), further out rank by rank.
const apartOffset = (r, u, p) => { const d = (1.2 + r.i * 0.55) * u, f = p.face ?? 0; return P(-d * Math.cos(f), -d * Math.sin(f), 0.12 * r.i * u); };
for (const r of Object.values(rank)) for (const p of r.pipes) organ.offset(p, apartOffset(r, 1, p));

// The case's size, for framing.
let y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
for (const p of pipes) { y0 = Math.min(y0, p.my - p.w); y1 = Math.max(y1, p.my + p.w); z0 = Math.min(z0, p.mz); z1 = Math.max(z1, p.mz + p.h); }
const MID = [hero.mx, (y0 + y1) / 2, (z0 + z1) / 2];
const HC = [hero.mx, hero.my, hero.mz + hero.h * 0.5];
const halfV = () => Math.tan((S.camera.fov * Math.PI) / 360);
const heroDist = () => (hero.h * 1.3) / 2 / halfV();
const caseDist = () => Math.max(((z1 - z0) * 1.25) / 2 / halfV(), ((y1 - y0) * 1.1) / 2 / (halfV() * S.camera.aspect));
// A camera on a circle round a point: angle 0 looks east down the church, + swings north.
const orbit = (c, r, th, up = 0) => ({ p: [c[0] - r * Math.cos(th), c[1] + r * Math.sin(th), c[2] + up], a: c });

// The Minster draws outward from the organ screen.
function reveal(u) {
  for (const L of S.lines) {
    if (L.userData.exterior && !exterior) { L.visible = false; continue; }
    const k = Math.min(1, Math.max(0, (u * 1.25 - Math.abs(L.userData.rank - ROOM_UI.revealCentre) * 1.6) / 0.25));
    L.material.opacity = L.userData.alpha * k * church; L.visible = k > 0;
  }
}
reveal(0);
let revealed = 0;

// The case: a frame round the pipes, so the organ reads as one instrument
// against the stone. It fades in once the ranks are home.
const caseLines = (() => {
  // Case front in silhouette: two pedal towers, the lower manual case between.
  const top = (q) => Math.max(...q.map((p) => p.mz + p.h));
  const man = pipes.filter((p) => !p.pedal), ped = pipes.filter((p) => p.pedal);
  const yM = Math.max(...man.map((p) => Math.abs(p.my) + p.w)) + 0.25, yP = Math.max(y1, -y0) + 0.35;
  const zM = top(man) + 0.5, zP = top(ped) + 0.5, zb = Math.min(...pipes.map((p) => p.mz)) - 0.15;
  const x = Math.min(...pipes.map((p) => p.mx)) - 0.35, xb = Math.max(...pipes.map((p) => p.mx)) + 0.4;
  const outline = [[-yP, zb], [-yP, zP], [-yM, zP], [-yM, zM], [yM, zM], [yM, zP], [yP, zP], [yP, zb], [-yP, zb]];
  const v = [];
  const seg = (a, b) => { const A = P(...a), B = P(...b); v.push(A.x, A.y, A.z, B.x, B.y, B.z); };
  for (let i = 0; i + 1 < outline.length; i++) seg([x, outline[i][0], outline[i][1]], [x, outline[i + 1][0], outline[i + 1][1]]);
  seg([x, -yP, zb + 0.35], [x, yP, zb + 0.35]); // the impost the pipes stand on
  const g = new LineSegmentsGeometry(); g.setPositions(v);
  const mat = new LineMaterial({ color: INK.clone(), linewidth: 2, transparent: true, opacity: 0, toneMapped: false, fog: false });
  mat.resolution.set(innerWidth, innerHeight);
  const L = new LineSegments2(g, mat); // kept for its opacity hook; the case outline is not drawn
  addEventListener('resize', () => mat.resolution.set(innerWidth, innerHeight));
  return L;
})();


// ---- The frame loop: a camera shot is a function of time.
const view = { shot: () => orbit(HC, 6, 0.9), rays: [], moving: new Set() };
let audio = null;
let lastDraw = 0;
const t0 = performance.now();
const now = () => (performance.now() - t0) / 1000;
const fwd = new THREE.Vector3();
function frame(ms = 0) {
  requestAnimationFrame(frame);
  if (ms - lastDraw < 32) return; // 30 frames a second
  lastDraw = ms;
  const t = now();
  const c = view.shot(t);
  const sway = 0.12 * Math.sin(t * 0.23);
  S.setCamera([c.p[0], c.p[1] + sway, c.p[2]], c.a);
  for (const r of view.moving) {
    const u = ease((t - r.from) / 1.6);
    r.apart = 1 - u;
    for (const p of r.pipes) organ.offset(p, apartOffset(r, r.apart, p));
    if (u >= 1) view.moving.delete(r);
  }
  for (const r of view.rays) {
    // The sound's front along this path: 343 m/s, slowed twelve times.
    const age = Math.max(0, t - r.born), d = age * (343 / 12), n = r.pts.length;
    let k = 0; while (k < n - 1 && r.cum[k + 1] <= d) k++;
    const pos = r.line.geometry.attributes.position, col = r.line.geometry.attributes.color;
    for (let i = 0; i <= k; i++) pos.setXYZ(i, r.pts[i].x, r.pts[i].y, r.pts[i].z);
    if (k < n - 1) { const u = (d - r.cum[k]) / (r.cum[k + 1] - r.cum[k]), q = r.pts[k].clone().lerp(r.pts[k + 1], u); pos.setXYZ(k + 1, q.x, q.y, q.z); }
    // Bright at the head, dimmer behind it; the whole path fades with the echo.
    const tail = Math.max(0, 1 - age / 8.5);
    for (let i = 0; i <= Math.min(n - 1, k + 1); i++) { const back = Math.max(0, d - (r.cum[i] ?? d)); const g = tail * (0.25 + 1.6 * Math.exp(-back / 12)); col.setXYZ(i, NEON.r * g, NEON.g * g, NEON.b * g); }
    pos.needsUpdate = true; col.needsUpdate = true;
    r.line.geometry.setDrawRange(0, Math.min(n, k + 2));
    if (tail <= 0) { S.root.remove(r.line); r.gone = true; }
  }
  view.rays = view.rays.filter((r) => !r.gone);
  fatMat.color.copy(heroColour);
  if (audio) audio.listen(S.camera);
  S.render();
}
requestAnimationFrame(frame);
// Move from the current shot to a new one over `sec` seconds.
function cut(to, sec = 0) {
  const from = view.shot(now()), s = now();
  view.shot = (t) => {
    const end = typeof to === 'function' ? to(t) : to;
    if (!sec) return end;
    const u = ease((t - s) / sec);
    return { p: lerp(from.p, end.p, u), a: lerp(from.a, end.a, u) };
  };
  return sleep(sec * 1000);
}

// ---- Sound
function buildAudio(ctx) {
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
  const centres = Object.fromEntries(ORGAN_SOURCES.map((id) => [id, [0, 0, 0, 0]]));
  for (const p of pipes) { const id = organSource({ key: p.key, pedal: !!p.pedal }, STOPS[p.stop].feet).id; const c = centres[id]; c[0] += p.mx; c[1] += p.my; c[2] += p.mz + p.foot; c[3]++; }
  const SRC = ORGAN_SOURCES.map((id) => { const c = centres[id]; return c[3] ? [c[0] / c[3], c[1] / c[3], c[2] / c[3]] : [90.75, 0, 10]; });
  // The Minster's echo, one convolver per part (great, upper, pedal); sends start shut.
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
  const node = new AudioWorkletNode(ctx, 'organ-multi', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [ORGAN_SOURCES.length] });
  const split = new ChannelSplitterNode(ctx, { numberOfOutputs: ORGAN_SOURCES.length });
  node.connect(split);
  ORGAN_SOURCES.forEach((id, i) => {
    const d = new GainNode(ctx, { gain: 0.282 });
    split.connect(d, i, 0); d.connect(panner(SRC[i])).connect(master);
    split.connect(echo[id.replace(/Cs?$/, '')].send, i, 0);
  });
  let wet = false;
  return {
    ctx, node, master, SRC, make: 9,
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
    // One sound from one place (a pipe being voiced).
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
// A short note from a voiced pipe.
function blip(params, key, sec = 0.22) {
  const pipe = new FluePipe(SR, params, 991 + key);
  const n = Math.round((sec + 0.25) * SR), on = Math.round(sec * SR), x = new Float32Array(n);
  pipe.noteOn();
  for (let i = 0; i < n; i++) { if (i === on) pipe.noteOff(); x[i] = pipe.tick(1); }
  return x;
}
// A held chord on one rank (D minor by default), from its voiced pipes.
const CHORD_GAIN = 4;
function rankChord(r, keys = [50, 53, 57, 62], sec = 3.4) {
  const pedal = r.pipes[0].pedal;
  const ks = pedal ? [38, 50] : keys;
  const n = Math.round((sec + 0.8) * SR), off = Math.round(sec * SR), x = new Float32Array(n);
  for (const k of ks) {
    const id = `${r.pipes[0].stop}:${k}`, v = results.get(id);
    if (!v) continue;
    const pipe = new FluePipe(SR, v.params, 77 + k);
    pipe.noteOn();
    for (let i = 0; i < n; i++) { if (i === off) pipe.noteOff(); x[i] += pipe.tick(1); }
  }
  return x;
}
// Light the pipes a chord sounds on, for as long as it sounds.
function glow(r, keys, sec) {
  const ks = r.pipes[0].pedal ? [38, 50] : keys;
  const lit = ks.map((k) => byId.get(`${r.pipes[0].stop}:${k}`)).filter((p) => p && p !== hero);
  for (const p of lit) { p.state = null; organ.setPipe(p, 'sounding', 0.9); }
  if (r.pipes[0].stop === hero.stop && ks.includes(hero.key)) LIT();
  setTimeout(() => { for (const p of lit) { p.state = null; organ.setPipe(p, 'voiced'); } }, sec * 1000);
}
function chord(r, keys = [50, 53, 57, 62], sec = 3.4, gain = CHORD_GAIN) {
  audio.play(rankChord(r, keys, sec), rankCentre(r), r.pipes[0].pedal ? 'pedal' : 'great', gain);
  glow(r, keys, sec + 0.3);
}
const rankCentre = (r) => { const c = [0, 0, 0]; for (const p of r.pipes) { c[0] += p.mx; c[1] += p.my; c[2] += p.mz + p.foot; } return c.map((v) => v / r.pipes.length); };

// The building's cells, to keep drawn rays inside it.
const ROOM = buildRoom();
const insideRoom = (q) => {
  const i = Math.floor(q[0] / ROOM.res), j = Math.floor((q[1] - ROOM.y0) / ROOM.res);
  if (i < 0 || j < 0 || i >= ROOM.nx || j >= ROOM.ny) return false;
  const k = j * ROOM.nx + i;
  return ROOM.h[k] > 0 && q[2] >= ROOM.f[k] - 0.5 && q[2] <= ROOM.h[k] + 0.5;
};

// ---- Work in the background: voicing and tracing.
const results = new Map();
const hc = navigator.hardwareConcurrency || 4;
let onVoiced = () => {};
function startVoicing() {
  const heroDone = new Promise((ok) => {
    const w = new Worker('../engine/voicer-worker.js', { type: 'module' });
    w.onmessage = (e) => { if (e.data.done) { w.terminate(); return; } results.set(e.data.id, e.data); ok(e.data); };
    w.postMessage({ sr: SR, pipes: [{ stop: hero.stop, key: hero.key }], audible: [HERO] });
  });
  const queue = ORDER.flatMap((r) => rank[r].pipes.map((p) => ({ stop: p.stop, key: p.key })));
  const n = Math.max(2, Math.min(6, hc - 3));
  for (let i = 0; i < n; i++) {
    const w = new Worker('../engine/voicer-worker.js', { type: 'module' });
    w.onmessage = (e) => { if (e.data.done) { w.terminate(); return; } results.set(e.data.id, e.data); onVoiced(e.data.id); };
    w.postMessage({ sr: SR, pipes: queue.filter((_, k) => k % n === i), audible: [] });
  }
  return heroDone;
}
function startTracing() {
  const parts = [
    { id: 'great', pos: organSource({ key: 0, pedal: false }, 8).pos },
    { id: 'upper', pos: organSource({ key: 0, pedal: false }, 2).pos },
    { id: 'pedal', pos: organSource({ key: 0, pedal: true }, 16).pos },
  ];
  return Promise.all(parts.map((s, i) => new Promise((ok) => {
    const w = new Worker('../engine/trace-worker.js', { type: 'module' });
    w.onmessage = (e) => { ok({ ...s, ...e.data }); w.terminate(); };
    w.postMessage({ id: s.id, src: [s.pos[0], 0, s.pos[2]], rec: ECHO_AT, rays: 30000, seed: 17 + i * 101, sr: SR, maxTime: ROOM_ID === 'stpauls' ? 10 : 7.5, paths: 24, direct: false, room: ROOM_ID });
  })));
}

// ---- The story
const KIND = (a) => (/toe/.test(a) ? 'toe' : /cut-up|mouth/.test(a) ? 'cut' : /nick/.test(a) ? 'nick' : /trim|lengthen/.test(a) ? 'length' : 'other');
const STEP = {
  toe: 'Set the toe. Level.',
  cut: 'Raise the mouth. It stops leaping the octave.',
  nick: 'Nick the languid. A clean start.',
  length: 'Trim the top. Pitch.',
  other: '',
};
const PLAY_SHOT = () => ({ p: [MID[0] - caseDist() * 1.15, 0, Math.max(3, MID[2] - 2.5)], a: [MID[0], 0, MID[2] + 0.5] });

// Landing: the first pipe is already drawn, dim. Begin lights it.
// Frame a point on the hero from the side its mouth faces, with the pipe on
// the left third of the picture.
const leftThird = (target, d) => {
  const f = hero.face ?? 0, fx = Math.cos(f), fy = Math.sin(f); // looking direction, toward the pipe
  const w = (d * halfV() * S.camera.aspect) / 3, rx = fy, ry = -fx; // the camera's right
  const a = [target[0] + rx * w, target[1] + ry * w, target[2]];
  return { p: [a[0] - fx * d, a[1] - fy * d, a[2]], a };
};
view.shot = () => { const f = hero.face ?? 0, d = heroDist() * 1.25; return { p: [HC[0] - Math.cos(f) * d, HC[1] - Math.sin(f) * d, HC[2]], a: HC }; };

$('#begin').onclick = async () => {
  $('#begin').disabled = true;
  const ctx = new AudioContext({ sampleRate: SR });
  await ctx.resume();
  await ctx.audioWorklet.addModule('../engine/organ-multi-worklet.js');
  audio = buildAudio(ctx);
  const heroReady = startVoicing();
  const traced = startTracing();
  $('#intro').classList.add('gone');
  let skip;
  skipSignal = new Promise((_, no) => { skip = () => no(SKIP); });
  skipSignal.catch(() => {});
  $('#skip').classList.remove('gone');
  $('#skip').onclick = () => skip();
  story(heroReady, traced).then(() => { skipSignal = null; $('#skip').classList.add('gone'); }).catch((e) => {
    skipSignal = null;
    if (e === SKIP) toPlay(traced);
    else { console.error(e); card('', 'Something went wrong', String(e)); }
  });
};

async function story(heroReady, traced) {
  const steps = $('#steps'), stepLine = steps.querySelector('p');
  const mark = (k) => { for (const li of steps.querySelectorAll('li')) { if (li.classList.contains('on')) li.classList.replace('on', 'done'); if (li.dataset.k === k) { li.classList.remove('done'); li.classList.add('on'); } } };
  const say = async (line) => { stepLine.style.opacity = 0; await sleep(200); stepLine.textContent = line; stepLine.style.opacity = 1; };

  // I. The pipe. Four shots: the whole pipe; in to the mouth; up to the top
  // for its length; back out to the whole pipe.
  INKED();
  await card('', 'A pipe organ, rebuilt in software', 'With the physics of the real thing: every pipe made and voiced, then the echo of the building it plays in.', 4200);
  await card('I', 'The pipe', 'Wind in at the foot. A jet across the mouth. A column of air answers.');
  await sleep(2500);
  const v = await heroReady;
  await sleep(500);
  await cardOff();
  const heard = v.steps.filter((s) => s.audio);
  const fin = heard.at(-1);
  const show = highlights(heard, 7);
  const shape = (s) => {
    const nicks = heard.slice(0, heard.indexOf(s) + 1).filter((x) => x.action === 'nick languid').length;
    fatGeo.setPositions(pipeSegments(hero, { len: s.bore / fin.bore, cut: s.jetRatio / fin.jetRatio, toe: s.foot / fin.foot, nicks }));
  };
  const pos = [hero.mx, hero.my, hero.mz + hero.foot];
  const MOUTH = [hero.mx, hero.my, hero.mz + hero.foot + hero.w * 0.4];
  const TOP = [hero.mx, hero.my, hero.mz + hero.h - hero.w * 2];
  const close = () => Math.max(0.35, (hero.w * 9) / 2 / halfV());
  shape(show[0]);
  await cut(leftThird(MOUTH, close()), 2.2);
  steps.classList.remove('gone');
  LIT();
  await say('As made: too long, the mouth too low, the toe wide open.');
  audio.play(show[0].audio, pos);
  await sleep(2600);
  for (const s of show.slice(1, -1)) {
    const k = KIND(s.action);
    if (k === 'length') cut(leftThird(TOP, close()), 1.2); else cut(leftThird(MOUTH, close()), 1.2);
    mark(k);
    await say(STEP[k]);
    shape(s);
    audio.play(s.audio, pos);
    await sleep(1900);
  }
  shape(fin);
  mark('');
  cut(leftThird(HC, heroDist() * 1.15), 2.4);
  await say(`In tune. ${STOPS[hero.stop].name}, ${noteName(hero.key)}.`);
  audio.play(fin.audio, pos);
  await sleep(2400);
  INKED();
  steps.classList.add('gone');

  // The rank: the rest of the hero's row, one pipe per key, built out beside
  // it and played as a run up the keyboard.
  {
    const r = rank[hero.stop];
    const row = [hero, ...r.pipes].sort((a, b) => a.key - b.key);
    const c = rankCentre(r), off = apartOffset(r, 1, row[1] ?? hero);
    const zc = row.reduce((a, p) => a + p.mz + p.h * 0.5, 0) / row.length;
    const mid = [c[0] + off.x, c[1] - off.z, zc];
    let ya = Infinity, yb = -Infinity; for (const p of row) { ya = Math.min(ya, p.my); yb = Math.max(yb, p.my); }
    const span = Math.max(3, Math.abs(yb - ya) + 2);
    const d = span / 2 / (halfV() * S.camera.aspect), f = hero.face ?? 0;
    cut({ p: [mid[0] - Math.cos(f) * d, mid[1] - Math.sin(f) * d, mid[2] + 0.4], a: mid }, 3.5);
    await card('', 'The rank', `One pipe for every key: ${row.length} of them, each voiced the same way.`);
    while (r.pipes.some((p) => !results.has(p.id))) await sleep(200);
    for (const p of row) {
      if (p === hero) { LIT(); setTimeout(INKED, 300); }
      else { organ.setPipe(p, 'voicing'); setTimeout(() => organ.setPipe(p, 'voiced'), 260); }
      const v = p === hero ? { params: fin.params ?? results.get(HERO).params } : results.get(p.id);
      if (v && p.key % 2 === 0) audio.play(blip(v.params, p.key), [p.mx, p.my, p.mz + p.foot], 'great', 2.5);
      await sleep(70);
    }
    await sleep(1800);
    await cardOff();
  }

  // II. The organ, as an exploded drawing: a long lens, three-quarter high,
  // every rank on its own layer, swinging to dead front as the ranks close.
  const total = pipes.length;
  const count = $('#count');
  const done = () => results.size;
  count.classList.remove('gone');
  const tick = setInterval(() => { count.textContent = `${done()} / ${total}`; }, 200);
  storyTimers.push(tick);
  lens(20, 3);
  await card('II', 'The organ', `Seventeen ranks make the organ: ${total} pipes.`);
  const coreN = CORE.reduce((a, r) => a + rank[r].pipes.length, 0);
  const coreDone = () => CORE.reduce((a, r) => a + rank[r].done, 0) / coreN;
  const R = () => caseDist() * 1.9;
  cut((t) => orbit([MID[0] - 3, MID[1], MID[2]], R(), 0.75 - 0.75 * coreDone(), 9 - 9 * coreDone()), 4);
  traced.then((tr) => { audio.setEcho(tr); audio.openEcho(4, 0.45); });
  for (const r of ORDER) { for (const p of rank[r].pipes) organ.setPipe(p, 'unbuilt'); await sleep(90); }
  const homeQueue = [];
  const flash = (id) => {
    const p = byId.get(id); if (!p || p === hero) return;
    const r = rank[p.stop]; r.done++;
    organ.setPipe(p, 'voicing');
    setTimeout(() => organ.setPipe(p, 'voiced'), 160);
    if (r.done === r.pipes.length && !r.sent) { r.sent = true; homeQueue.push(r); }
  };
  const pending = [...results.keys()].filter((id) => id !== HERO);
  onVoiced = (id) => pending.push(id);
  const rush = setInterval(() => { for (let k = Math.max(1, Math.ceil(pending.length / 250)); k > 0 && pending.length; k--) flash(pending.shift()); }, 40);
  storyTimers.push(rush);
  let homeAt = 0, quietAt = 0, sounding = true;
  const home = setInterval(() => {
    const t = now();
    if (homeQueue.length && t > homeAt) {
      const r = homeQueue.shift();
      if (!r.from) { r.from = t; view.moving.add(r); }
      homeAt = t + 1.3;
      // Each rank joins a held chord as it comes home, like stops drawn one by one.
      if (sounding) { chord(r); quietAt = t + 3.4 + 0.6; }
    }
  }, 100);
  storyTimers.push(home);
  const sII = now();
  while (coreDone() < 1 || now() - sII < 14 || homeQueue.length) await sleep(200);
  sounding = false;
  // Ranks still being voiced go home now, dim; they light as they finish.
  for (const r of Object.values(rank)) if (!r.from) { r.from = now(); view.moving.add(r); }
  while (now() < quietAt + 0.8) await sleep(100);
  // Full organ: silence, then the chord, every sounding pipe and the case at once.
  const tutti = ORDER.map((n) => rank[n]).filter((r) => r.done === r.pipes.length);
  for (const r of tutti) chord(r, [50, 54, 57, 62], 4.5);
  caseLines.material.opacity = 1;
  await sleep(5200);
  clearInterval(rush); onVoiced = flash; for (const id of pending.splice(0)) flash(id);
  await cardOff();

  // III. The cathedral: the building draws itself with a low D under it, and
  // the room's echo opens as its walls arrive. Then one short chord, a still
  // camera, and the sound's paths through the building as the echo rings.
  fog(0.0016);
  lens(baseFov, 4);
  await card('III', 'The cathedral', ROOM_UI.line);
  const WIDE = ROOM_UI.wide;
  exterior = true;
  cut(WIDE, 8);
  const pedalD = rank.ymPedSub16;
  if (pedalD.done === pedalD.pipes.length) chord(pedalD, [38], 8, CHORD_GAIN * 0.7);
  audio.openEcho(8, 1);
  const sIII = now();
  await new Promise((ok) => { const step = () => { const u = (now() - sIII) / 8; reveal(ease(u)); if (u < 1) requestAnimationFrame(step); else ok(); }; step(); });
  revealed = 1;
  const tr = await traced;
  if (!audio.make || audio.make === 9) audio.setEcho(tr);
  await sleep(1500);
  await card('', 'Its echo', 'Mapped through the building, ray by ray, and checked against a recording made there. One chord, slowed twelve times.');
  // Into the building as the chord sounds, so the echo is seen from inside.
  cut(ROOM_UI.inside(MID), 3.5);
  await sleep(500);
  for (const r of ORDER.map((n) => rank[n]).filter((r) => r.done === r.pipes.length)) chord(r, [50, 53, 57, 62], 0.8);
  const born = now();
  for (const r of tr) r.paths.forEach((path) => {
    // Keep each path inside the drawn building.
    const keep = [path[0]];
    for (let i = 1; i < path.length; i++) { const m = path[i - 1].map((v, k) => (v + path[i][k]) / 2); if (!insideRoom(m)) break; keep.push(path[i]); }
    if (keep.length < 2) return;
    const pts = keep.map((q) => P(...q));
    const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(pts.length * 3), 3));
    const line = new THREE.Line(g, new THREE.LineBasicMaterial({ vertexColors: true, toneMapped: false, fog: false }));
    S.root.add(line); view.rays.push({ line, pts, cum, born });
  });
  // Come back into the building while it rings, among the paths.
  setTimeout(() => { exterior = false; reveal(1); }, 1800);
  // Once inside, drift slowly while it rings.
  setTimeout(() => { const s = now(), A = ROOM_UI.inside(MID); cut((t) => ({ p: lerp(A.p, [A.p[0] + 8, A.p[1] * 0.5, A.p[2] - 3], ease((t - s) / 8)), a: A.a }), 0); }, 3100);
  await sleep(9000);
  await cardOff();
  fog(0.009);
  await cut(PLAY_SHOT(), 6);
  clearInterval(tick);
  const end = setInterval(() => { if (done() >= total) { count.classList.add('gone'); clearInterval(end); clearInterval(home); } else count.textContent = `${done()} / ${total}`; }, 400);

  // IV. Play
  await card('IV', 'Choose something to play', '', 2200);
  await cardOff();
  drawSongs();
  $('#ui').classList.remove('gone');
}

// Skip: everything the build would have left behind, at once.
let storyTimers = [];
function toPlay(traced) {
  for (const id of storyTimers) clearInterval(id);
  $('#skip').classList.add('gone'); $('#steps').classList.add('gone'); $('#card').classList.add('gone');
  INKED();
  view.moving.clear();
  for (const r of Object.values(rank)) { r.from = r.from || now(); r.apart = 0; for (const p of r.pipes) { organ.offset(p, new THREE.Vector3()); p.state = null; organ.setPipe(p, results.has(p.id) ? 'voiced' : 'unbuilt'); } }
  onVoiced = (id) => { const p = byId.get(id); if (p && p !== hero) organ.setPipe(p, 'voiced'); };
  for (const r of view.rays) S.root.remove(r.line);
  view.rays = [];
  caseLines.material.opacity = 1;
  church = 0.55; reveal(1); fog(0.009);
  S.camera.fov = baseFov; S.camera.updateProjectionMatrix();
  traced.then((tr) => { audio.setEcho(tr); audio.openEcho(1.5, 1); });
  const count = $('#count');
  const tick = setInterval(() => { if (results.size >= pipes.length) { count.classList.add('gone'); clearInterval(tick); } else { count.classList.remove('gone'); count.textContent = `${results.size} / ${pipes.length}`; } }, 400);
  cut(PLAY_SHOT(), 2.5);
  drawSongs();
  $('#ui').classList.remove('gone');
}

// ---- Songs
let current = null;
function drawSongs() {
  const ol = $('#songs'); ol.innerHTML = '';
  for (const s of [...SONGS, { title: 'Your own MIDI…', choose: true }]) {
    const li = document.createElement('li'), b = document.createElement('button');
    b.textContent = s.title; b.setAttribute('aria-pressed', s === current);
    if (s.by) { const by = document.createElement('span'); by.textContent = s.by; b.append(by); }
    b.onclick = () => { if (s.choose) pick.click(); else play(s); };
    li.append(b); ol.append(li);
  }
}
const pick = Object.assign(document.createElement('input'), { type: 'file', accept: '.mid,.midi,audio/midi' });
pick.onchange = async () => {
  const f = pick.files[0]; if (!f) return;
  const own = { title: f.name.replace(/\.midi?$/i, ''), by: 'your MIDI', data: await f.arrayBuffer(), auto: true };
  SONGS.push(own); play(own);
};
// BitMidi search (its API and files allow loading from the browser).
const BITMIDI = 'https://bitmidi.com';
$('#find').onsubmit = async (e) => {
  e.preventDefault();
  const q = $('#q').value.trim(); if (!q) return;
  const ol = $('#results'); ol.innerHTML = '<li><button disabled>…</button></li>';
  try {
    const r = await (await fetch(`${BITMIDI}/api/midi/search?q=${encodeURIComponent(q)}`)).json();
    const rows = (r?.result?.results || []).slice(0, 8);
    ol.innerHTML = '';
    if (!rows.length) { ol.innerHTML = '<li><button disabled>No MIDI found</button></li>'; return; }
    for (const row of rows) {
      const li = document.createElement('li'), b = document.createElement('button');
      const title = String(row.name).replace(/\.midi?$/i, '').replace(/[-_]+/g, ' ').trim();
      b.textContent = title;
      b.onclick = async () => {
        const url = row.downloadUrl || `/uploads/${row.id}.mid`;
        const data = await (await fetch(url.startsWith('http') ? url : BITMIDI + url)).arrayBuffer();
        const s = { title, by: 'BitMidi', data, auto: true };
        SONGS.push(s); ol.innerHTML = ''; $('#q').value = ''; play(s);
      };
      li.append(b); ol.append(li);
    }
  } catch { ol.innerHTML = '<li><button disabled>BitMidi is not answering</button></li>'; }
};

let playing = null, stopped = false;
function showList() {
  playing = null; stopped = false; $('#stopbtn').classList.add('gone'); church = 0.55; reveal(1); if (bloom) bloom.strength = 0.55;
  $('#ui').classList.remove('gone'); cut(PLAY_SHOT(), 5);
}
// While a song plays, a click or Esc stops it and brings the list back.
function stop() {
  if (!playing) return;
  stopped = true; cardOff();
  audio.node.port.postMessage({ voiced: {}, style: STYLES.york, groups: ORGAN_SOURCES.map(() => []) });
}
canvas.addEventListener('click', stop);
$('#stopbtn').onclick = stop;
addEventListener('keydown', (e) => { if (e.key === 'Escape') stop(); });

async function play(song) {
  current = song; stopped = false; drawSongs();
  const midi = parseMidi(song.data ?? await (await fetch(song.file)).arrayBuffer());
  const arr = orchestrate(midi, { from: song.from, to: song.to, solo: song.solo, keep: song.keep, speed: 0.82, offset: 0.4 });
  song.why = arr.plan?.why;
  if (!arr.events.length) { await card('', 'No notes there', 'That MIDI file has nothing to play in its first minute.', 3000); await cardOff(); return; }
  const missing = () => arr.pipes.filter((p) => !results.has(`${p.stop}:${p.key}`));
  if (missing().length) {
    // Voice exactly the pipes this song still needs, now, alongside the rest.
    const need = missing(), n = Math.max(2, Math.min(4, hc - 2));
    for (let i = 0; i < n; i++) {
      const w = new Worker('../engine/voicer-worker.js', { type: 'module' });
      w.onmessage = (e) => { if (e.data.done) { w.terminate(); return; } if (!results.has(e.data.id)) { results.set(e.data.id, e.data); onVoiced(e.data.id); } };
      w.postMessage({ sr: SR, pipes: need.filter((_, k) => k % n === i).map((p) => ({ stop: p.stop, key: p.key })), audible: [] });
    }
    await card('', 'Voicing its pipes', `${need.length} still to voice.`);
    while (missing().length) { $('#card p').textContent = `${missing().length} still to voice.`; await sleep(300); }
  }
  const voiced = Object.fromEntries([...results.values()].map((v) => [v.id, v.params]));
  const groups = ORGAN_SOURCES.map((id) => arr.events.filter((e) => organSource(e, STOPS[e.stop].feet).id === id));
  audio.node.port.postMessage({ voiced, style: STYLES.york, groups, box: arr.box });
  $('#ui').classList.add('gone');
  playing = song; $('#stopbtn').classList.remove('gone'); church = 0.3; reveal(1); if (bloom) bloom.strength = 0.95;
  card('', song.title, song.by).then(() => sleep(5000)).then(() => { if (current === song) cardOff(); });
  // The camera drifts closer while it plays, and the sound goes with it.
  const s = now(), P0 = PLAY_SHOT(), c = [MID[0], 0, MID[2] - 0.5];
  cut((t) => {
    const u = ease((t - s) / Math.max(20, arr.length));
    return { p: lerp(P0.p, [P0.p[0] + (MID[0] - P0.p[0]) * 0.15, 0, P0.p[2] + 0.6], u), a: P0.a };
  }, 3);
  audio.node.port.onmessage = (e) => {
    if (e.data.finished) {
      for (const p of pipes) if (p !== hero) { p.level = 0; organ.setPipe(p, 'voiced'); }
      INKED();
      $('#progress').style.width = '0';
      setTimeout(() => { if (current === song) showList(); }, stopped ? 0 : 7000);
      return;
    }
    $('#progress').style.width = `${Math.min(100, (100 * e.data.t) / arr.length)}%`;
    const L = e.data.levels;
    for (const p of pipes) {
      const l = L[p.id] || 0;
      if (p === hero) { heroColour.copy(l > 0.02 ? NEON : INK).multiplyScalar(l > 0.02 ? 0.8 + 2.4 * l : 0.9); continue; }
      if (Math.abs(l - (p.level || 0)) > 0.04 || (l === 0 && p.level)) { p.level = l; p.state = null; organ.setPipe(p, l > 0.02 ? 'sounding' : 'voiced', l); }
    }
  };
}
window.voicerInfo = () => ({ calls: S.renderer.info.render.calls, lines: S.renderer.info.render.lines, voiced: results.size, shot: view.shot(now()) });
