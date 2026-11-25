// Robot Organ: a guided build in a cathedral (York or St Paul's), then you play it.
//   I.   The pipe: one pipe is drawn, sounds wrong, and is voiced step by step.
//   II.  The organ: every rank floats apart, is voiced for real, and slides home.
//   III. The cathedral: the building draws itself, then one chord is played
//        and its echo is traced through it, ray by ray.
//   IV.  Choose something to play.
// Everything is computed here: the voicing (workers), the echo (ray tracing in
// workers), and the organ itself (an AudioWorklet). The sound follows the
// camera: each part of the case is a source where it is drawn (HRTF), plus
// the traced two-ear echo of the room. Sound is in sound.js, the song list in
// songs.js.
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
import { ROOMS } from '../engine/rooms.js';
import { layoutOrgan, organLines, pipeSegments, NEON, INK } from './organ-view.js';
import { SR, buildAudio, renderNotes } from './sound.js';
import { SONGS, songList } from './songs.js';

// The rooms. Each has its building, its acoustic model, how its organ stands,
// and the shots that show it.
// St Paul's is built (?room=stpauls) but held back from the demo for now.
const ROOM_ID = 'york';
const ROOM_UI = {
  york: {
    name: 'York Cathedral', model: ROOMS.york,
    line: '160 metres of stone, glass and timber.',
    echoAt: [62, 0, 1.7], // the east end of the nave
    wide: { p: [-48, -150, 92], a: [76, 0, 6] },
    inside: () => ({ p: [50, -9, 9], a: [82, 0, 24] }), // the east end of the nave, looking up into the crossing
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
document.title = `Robot Organ · ${ROOM_UI.name}`;
document.getElementById('roomname').textContent = ROOM_UI.name;
for (const a of document.querySelectorAll('#rooms a')) if (a.dataset.room === ROOM_ID) a.setAttribute('aria-current', 'page');
const ECHO_AT = ROOM_UI.echoAt;
const HERO = 'ymDiap8a:63'; // arrives badly wrong: it overblows to the octave and beyond

const $ = (s) => document.querySelector(s);
// While the guided build runs, every wait can be cut short by Skip.
const SKIP = new Error('skip');
let skipSignal = null;
const sleep = (ms) => { const p = new Promise((r) => setTimeout(r, ms)); return skipSignal ? Promise.race([p, skipSignal]) : p; };
const ease = (u) => { u = Math.min(1, Math.max(0, u)); return u * u * (3 - 2 * u); };
const lerp = (a, b, u) => a.map((v, i) => v + (b[i] - v) * u);

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
const CORE = ['ymDiap8a', 'ymStopped8', 'ymOctave4', 'ymDiap8b', 'ymDouble16', 'ymPedSub16', 'ymPedDiap16', 'ymPedPrin8', 'ymPrincipal4', 'ymSuper2', 'ymPedWood16', 'ymPedWood32'];
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

// The echo's sound paths, drawn as thick lines.
const rayMat = new LineMaterial({ vertexColors: true, linewidth: 2, transparent: true, toneMapped: false, fog: false });
rayMat.resolution.set(innerWidth, innerHeight);
addEventListener('resize', () => rayMat.resolution.set(innerWidth, innerHeight));

// ---- The frame loop: a camera shot is a function of time.
const view = { shot: () => orbit(HC, 6, 0.9), rays: [], moving: new Set() };
let audio = null;
let lastDraw = 0;
const t0 = performance.now();
const now = () => (performance.now() - t0) / 1000;
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
    const P6 = r.line.geometry.attributes.instanceStart.data, C6 = r.line.geometry.attributes.instanceColorStart.data;
    // Segments behind the front are whole; the one at the front ends where the sound has got to.
    for (let i = 0; i < Math.min(k, n - 1); i++) { const q = r.pts[i + 1]; P6.array.set([q.x, q.y, q.z], i * 6 + 3); }
    if (k < n - 1) { const u = (d - r.cum[k]) / (r.cum[k + 1] - r.cum[k]), q = r.pts[k].clone().lerp(r.pts[k + 1], u); P6.array.set([q.x, q.y, q.z], k * 6 + 3); }
    // Bright near the front, dimmer behind it; the whole path fades with the echo.
    const tail = Math.max(0, 1 - age / 12);
    const g = (i) => tail * (0.3 + 1.6 * Math.exp(-Math.max(0, d - r.cum[Math.min(i, n - 1)]) / 14));
    for (let i = 0; i <= Math.min(k, n - 2); i++) { const a = g(i), b = g(i + 1); C6.array.set([NEON.r * a, NEON.g * a, NEON.b * a, NEON.r * b, NEON.g * b, NEON.b * b], i * 6); }
    P6.needsUpdate = true; C6.needsUpdate = true;
    r.line.geometry.instanceCount = Math.min(n - 1, k + 1);
    if (tail <= 0) { S.root.remove(r.line); r.line.geometry.dispose(); r.gone = true; }
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

// ---- Notes on the organ
const CHORD_GAIN = 4;
// What a pipe goes back to after it sounds: 'resting' (dimmed) while a passage plays, so only sounding pipes stand out.
let restState = 'voiced';
// Notes on one rank as [key, start s, length s]; its pipes light as they sound.
function phrase(r, notes, gain = CHORD_GAIN) {
  const stop = r.pipes[0].stop, list = [];
  for (const [k, t, d] of notes) {
    const v = results.get(`${stop}:${k}`); if (!v) continue;
    list.push({ params: v.params, key: k, t, d });
    const p = byId.get(`${stop}:${k}`);
    if (p && p !== hero) {
      setTimeout(() => { p.lit = (p.lit || 0) + 1; p.state = null; organ.setPipe(p, 'sounding', 1); }, t * 1000);
      setTimeout(() => { p.lit--; if (!p.lit) { p.state = null; organ.setPipe(p, restState); } }, (t + Math.max(d, 0.3) + 0.25) * 1000);
    }
  }
  if (list.length) audio.play(renderNotes(list), rankCentre(r), r.pipes[0].pedal ? 'pedal' : 'great', gain);
}
// A held chord, D minor by default; the pedal plays low D.
const chord = (r, keys = [50, 53, 57, 62], sec = 3.4, gain = CHORD_GAIN) => phrase(r, (r.pipes[0].pedal ? [38, 50] : keys).map((k) => [k, 0, sec]), gain);
const ready = () => ORDER.map((n) => rank[n]).filter((r) => r.pipes.every((p) => results.has(p.id)));
// The opening of Bach's Toccata in D minor: the mordent A-G-A in octaves, a
// pause, and the run down to D, over a low pedal D.
const TOCCATA = {
  manual: [[81, 0, 0.09], [79, 0.09, 0.09], [81, 0.18, 1.2], [69, 0, 0.09], [67, 0.09, 0.09], [69, 0.18, 1.2],
    ...[79, 77, 76, 74, 73].flatMap((k, i) => [[k, 2.0 + i * 0.13, 0.13], [k - 12, 2.0 + i * 0.13, 0.13]]), [74, 2.65, 1.4], [62, 2.65, 1.4]],
  pedal: [[38, 2.65, 1.4]],
};
const rankCentre = (r) => { const c = [0, 0, 0]; for (const p of r.pipes) { c[0] += p.mx; c[1] += p.my; c[2] += p.mz + p.foot; } return c.map((v) => v / r.pipes.length); };

// The building's cells, to keep drawn rays inside it.
const ROOM = buildRoom();
const insideRoom = (q) => {
  const i = Math.floor(q[0] / ROOM.res), j = Math.floor((q[1] - ROOM.y0) / ROOM.res);
  if (i < 0 || j < 0 || i >= ROOM.nx || j >= ROOM.ny) return false;
  const k = j * ROOM.nx + i;
  return ROOM.h[k] > 0 && q[2] >= ROOM.f[k] - 0.5 && q[2] <= ROOM.h[k] + 0.5;
};

// The pipes the built-in songs use, worked out while the page loads, so they
// can be voiced first and the songs are ready when the list appears.
const arrange = (midi, song) => orchestrate(midi, { from: song.from, to: song.to, solo: song.solo, keep: song.keep, speed: 0.82, offset: 0.4 });
const songPipes = Promise.all(SONGS.map(async (song) => {
  try { return arrange(parseMidi(await (await fetch(song.file)).arrayBuffer()), song).pipes.map((p) => `${p.stop}:${p.key}`); } catch { return []; }
})).then((lists) => new Set(lists.flat()));
const size = (p) => STOPS[p.stop].feet * 2 ** (-p.key / 12);

// ---- Work in the background: voicing and tracing.
const results = new Map();
const hc = navigator.hardwareConcurrency || 4;
let onVoiced = () => {};
async function startVoicing() {
  const heroDone = new Promise((ok) => {
    const w = new Worker('../engine/voicer-worker.js', { type: 'module' });
    w.onmessage = (e) => { if (e.data.done) { w.terminate(); return; } results.set(e.data.id, e.data); ok(e.data); };
    w.postMessage({ sr: SR, pipes: [{ stop: hero.stop, key: hero.key }], audible: [HERO] });
  });
  // The first row (shown next), then every pipe the songs use, biggest first,
  // then the rest of the organ.
  const wanted = await songPipes;
  const first = rank[hero.stop].pipes;
  const songs = pipes.filter((p) => p !== hero && p.stop !== hero.stop && wanted.has(p.id)).sort((a, b) => size(b) - size(a));
  const taken = new Set([...first, ...songs]);
  const queue = [...first, ...songs, ...ORDER.flatMap((r) => rank[r].pipes.filter((p) => !taken.has(p)))].map((p) => ({ stop: p.stop, key: p.key }));
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
    w.postMessage({ id: s.id, src: [s.pos[0], 0, s.pos[2]], rec: ECHO_AT, rays: 30000, seed: 17 + i * 101, sr: SR, maxTime: ROOM_ID === 'stpauls' ? 10 : 7.5, paths: 60, direct: false, room: ROOM_ID });
  })));
}

// ---- The story
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
// On a tall screen, aim lower so the pipe stands clear of the text below it.
view.shot = () => { const f = hero.face ?? 0, d = heroDist() * (portrait() ? 1.6 : 1.25), z = HC[2] - (portrait() ? hero.h * 0.42 : 0); return { p: [HC[0] - Math.cos(f) * d, HC[1] - Math.sin(f) * d, z], a: [HC[0], HC[1], z] }; };

$('#begin').onclick = async () => {
  $('#begin').disabled = true;
  const ctx = new AudioContext({ sampleRate: SR });
  await ctx.resume();
  await ctx.audioWorklet.addModule('../engine/organ-multi-worklet.js');
  audio = buildAudio(ctx, { pipes, organSource, sources: ORGAN_SOURCES });
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
  const say = async (line) => { stepLine.style.opacity = 0; await sleep(200); stepLine.textContent = line; stepLine.style.opacity = 1; };

  // I. The pipe. Four shots: the whole pipe; in to the mouth; up to the top
  // for its length; back out to the whole pipe.
  INKED();
  await card('', 'Nothing here is recorded', 'Your browser builds each pipe from its physics and plays it, live.', 3200);
  await card('I', 'The pipe', 'Air blows in at the bottom and across a slot called the mouth. That sets the air inside the pipe ringing.');
  await sleep(1600);
  const v = await heroReady;
  await sleep(500);
  await cardOff();
  const heard = v.steps.filter((s) => s.audio);
  const fin = heard.at(-1);
  const shape = (s) => {
    const nicks = heard.slice(0, heard.indexOf(s) + 1).filter((x) => x.action === 'nick languid').length;
    fatGeo.setPositions(pipeSegments(hero, { len: s.bore / fin.bore, cut: s.jetRatio / fin.jetRatio, toe: s.foot / fin.foot, nicks }));
  };
  const pos = [hero.mx, hero.my, hero.mz + hero.foot];
  const MOUTH = [hero.mx, hero.my, hero.mz + hero.foot + hero.w * 0.4];
  const close = () => Math.max(0.35, (hero.w * 9) / 2 / halfV());
  const first = heard[0];
  shape(first);
  await cut(leftThird(MOUTH, close()), 2);
  steps.classList.remove('gone');
  LIT();
  await say('As made, it sounds wrong.');
  audio.play(first.audio, pos);
  await sleep(1700);
  // The software voices it as an organ builder would: mouth, foot, length.
  await say('So the software voices it, as an organ builder would.');
  cut(leftThird(HC, heroDist() * 1.15), 1.6);
  const m0 = now();
  await new Promise((ok) => { const step = () => {
    const u = ease((now() - m0) / 1.4), mix = (k) => first[k] + (fin[k] - first[k]) * u;
    fatGeo.setPositions(pipeSegments(hero, { len: mix('bore') / fin.bore, cut: mix('jetRatio') / fin.jetRatio, toe: mix('foot') / fin.foot, nicks: Math.round(u * heard.filter((x) => x.action === 'nick languid').length) }));
    if (u < 1) requestAnimationFrame(step); else ok();
  }; step(); });
  shape(fin);
  await say('Now it plays its note, in tune.');
  audio.play(fin.audio, pos);
  await sleep(1700);
  INKED();
  steps.classList.add('gone');

  // The rank: the rest of the hero's row, one pipe per key, built out beside
  // it and played as a run up the keyboard.
  {
    const r = rank[hero.stop];
    const row = [hero, ...r.pipes].sort((a, b) => a.key - b.key);
    const c = rankCentre(r), off = apartOffset(r, 1, row[1] ?? hero);
    let ya = Infinity, yb = -Infinity, za = Infinity, zb = -Infinity;
    for (const p of row) { ya = Math.min(ya, p.my); yb = Math.max(yb, p.my); za = Math.min(za, p.mz); zb = Math.max(zb, p.mz + p.h); }
    // Fit the whole row, tallest pipe included, with room for the card below.
    const span = Math.max(3, Math.abs(yb - ya) + 2), tall = zb - za;
    const d = Math.max(span / 2 / (halfV() * S.camera.aspect), (tall * 1.45) / 2 / halfV()), f = hero.face ?? 0;
    // Aim below the row's middle so it sits in the upper part of the picture.
    const mid = [c[0] + off.x, c[1] - off.z, (za + zb) / 2 - d * halfV() * 0.18];
    cut({ p: [mid[0] - Math.cos(f) * d, mid[1] - Math.sin(f) * d, mid[2]], a: mid }, 3.5);
    await card('', 'A row of pipes', `One pipe for every key on the keyboard: ${row.length} of them, each made the same way.`);
    while (r.pipes.some((p) => !results.has(p.id))) await sleep(200);
    for (const p of row) {
      if (p === hero) { LIT(); setTimeout(INKED, 300); }
      else { organ.setPipe(p, 'voicing'); setTimeout(() => organ.setPipe(p, 'voiced'), 260); }
      const v = p === hero ? { params: fin.params ?? results.get(HERO).params } : results.get(p.id);
      if (v && p.key % 2 === 0) audio.play(renderNotes([{ params: v.params, key: p.key, t: 0, d: 0.22 }], 0.25), [p.mx, p.my, p.mz + p.foot], 'great', 2.5);
      await sleep(70);
    }
    await sleep(1800);
    await cardOff();
  }

  // II. The organ, as an exploded drawing: a long lens, three-quarter high,
  // every rank on its own layer, swinging to dead front as the ranks close.
  const total = pipes.length;
  lens(20, 3);
  await card('II', 'The organ', `Seventeen rows like that make the organ: ${total} pipes.`);
  const R = () => caseDist() * (portrait() ? 1.6 : 2.15);
  // Swing from three-quarter to dead front while the rows go home.
  { const s0 = now(); cut((t) => { const u = ease((t - s0) / 5); return orbit([MID[0] - 3, MID[1], MID[2] + 1.5], R(), 0.75 - 0.75 * u, 9 - 9 * u); }, 3); }
  traced.then((tr) => { audio.setEcho(tr); audio.openEcho(4, 0.45); });
  for (const r of ORDER) { for (const p of rank[r].pipes) organ.setPipe(p, 'unbuilt'); await sleep(60); }
  const flash = (id) => {
    const p = byId.get(id); if (!p || p === hero) return;
    rank[p.stop].done++;
    organ.setPipe(p, 'voicing');
    setTimeout(() => organ.setPipe(p, 'voiced'), 160);
  };
  // Pipes already made light up in a rush; the rest as they are finished.
  const pending = [...results.keys()].filter((id) => id !== HERO);
  onVoiced = (id) => pending.push(id);
  const rush = setInterval(() => { for (let k = Math.max(1, Math.ceil(pending.length / 60)); k > 0 && pending.length; k--) flash(pending.shift()); }, 40);
  storyTimers.push(rush);
  await sleep(600);
  // The rows go home quickly, one after another. A row still being made goes
  // home dim and lights later.
  for (const name of ORDER) {
    const r = rank[name];
    r.from = now(); view.moving.add(r);
    await sleep(110);
  }
  await sleep(1700);
  // Settle every pipe to ink first, so the only pink is what is playing.
  clearInterval(rush); onVoiced = flash; for (const id of pending.splice(0)) flash(id);
  // Dim the case, so the only bright lines are the pipes playing.
  restState = 'resting';
  for (const p of pipes) if (p !== hero && results.has(p.id)) organ.setPipe(p, 'resting');
  heroColour.copy(INK).multiplyScalar(0.28);
  if (bloom) bloom.strength = 1.6;
  await sleep(500);
  // Full organ: the opening of Bach's Toccata in D minor, lit on the pipes.
  for (const r of ready()) phrase(r, r.pipes[0].pedal ? TOCCATA.pedal : TOCCATA.manual, CHORD_GAIN * 1.2);
  await sleep(4300);
  restState = 'voiced'; if (bloom) bloom.strength = 0.55;
  for (const p of pipes) if (p !== hero && p.state === 'resting') organ.setPipe(p, 'voiced');
  INKED();
  await cardOff();

  // III. The cathedral: the building draws itself with a low D under it, and
  // the room's echo opens as its walls arrive. Then one held chord, and the
  // sound's paths through the building as the echo rings.
  fog(0.0016);
  lens(baseFov, 4);
  await card('III', 'The cathedral', ROOM_UI.line);
  const WIDE = ROOM_UI.wide;
  exterior = true;
  cut(WIDE, 5);
  const pedalD = rank.ymPedSub16;
  if (pedalD.done === pedalD.pipes.length) chord(pedalD, undefined, 5.5, CHORD_GAIN * 0.7);
  audio.openEcho(5, 1);
  const sIII = now();
  await new Promise((ok) => { const step = () => { const u = (now() - sIII) / 5; reveal(ease(u)); if (u < 1) requestAnimationFrame(step); else ok(); }; step(); });
  const tr = await traced;
  if (!audio.make || audio.make === 9) audio.setEcho(tr);
  await sleep(500);
  await card('', 'Its echo', 'Every bounce traced, and tuned to real recordings from the University of York. One chord, slowed 12×.');
  // The church dims and goes quiet; then one held chord, and its echo is left
  // ringing on its own.
  const dim0 = now();
  const dimmer = setInterval(() => { const u = Math.min(1, (now() - dim0) / 0.8); church = 0.55 - 0.3 * u; reveal(1); if (u >= 1) clearInterval(dimmer); }, 50);
  storyTimers.push(dimmer);
  await sleep(600);
  if (bloom) bloom.strength = 1.1;
  for (const r of ready()) chord(r, undefined, 2.5, CHORD_GAIN * 1.3);
  // The chord's sound paths, kept inside the drawn building, leave with it.
  const born = now();
  for (const r of tr) for (const path of r.paths) {
    const keep = [path[0]];
    for (let i = 1; i < path.length; i++) { const m = path[i - 1].map((v, k) => (v + path[i][k]) / 2); if (!insideRoom(m)) break; keep.push(path[i]); }
    if (keep.length < 2) continue;
    const pts = keep.map((q) => P(...q));
    const cum = [0]; for (let j = 1; j < pts.length; j++) cum.push(cum[j - 1] + pts[j].distanceTo(pts[j - 1]));
    const seg = []; for (let j = 0; j + 1 < pts.length; j++) seg.push(pts[j].x, pts[j].y, pts[j].z, pts[j + 1].x, pts[j + 1].y, pts[j + 1].z);
    const g = new LineSegmentsGeometry(); g.setPositions(seg); g.setColors(new Float32Array(seg.length)); g.instanceCount = 0;
    const line = new LineSegments2(g, rayMat); line.frustumCulled = false;
    S.root.add(line); view.rays.push({ line, pts, cum, born });
  }
  // Watch it bounce from outside for a moment, then one sweep down into the
  // building to the seat in front of the organ, the room's look easing back
  // to normal on the way.
  await sleep(1000);
  const SWEEP = 6;
  cut(PLAY_SHOT(), SWEEP);
  const sw0 = now(), b0 = bloom ? bloom.strength : 0;
  const settle = setInterval(() => {
    const u = ease((now() - sw0) / SWEEP);
    fog(0.0016 + (0.009 - 0.0016) * u);
    church = 0.25 + 0.3 * u;
    if (bloom) bloom.strength = b0 + (0.55 - b0) * u;
    if (exterior && u > 0.5) exterior = false;
    reveal(1);
    if (u >= 1) clearInterval(settle);
  }, 50);
  storyTimers.push(settle);
  await sleep(SWEEP * 1000);
  await cardOff();

  // IV. Play
  await card('IV', 'Choose something to play', '', 900);
  await cardOff();
  list.draw();
  $('#ui').classList.remove('gone');
}

// Skip: everything the build would have left behind, at once.
let storyTimers = [];
function toPlay(traced) {
  for (const id of storyTimers) clearInterval(id);
  restState = 'voiced';
  $('#skip').classList.add('gone'); $('#steps').classList.add('gone'); $('#card').classList.add('gone');
  INKED();
  view.moving.clear();
  for (const r of Object.values(rank)) { r.from = r.from || now(); r.apart = 0; for (const p of r.pipes) { organ.offset(p, new THREE.Vector3()); p.state = null; organ.setPipe(p, results.has(p.id) ? 'voiced' : 'unbuilt'); } }
  onVoiced = (id) => { const p = byId.get(id); if (p && p !== hero) organ.setPipe(p, 'voiced'); };
  for (const r of view.rays) S.root.remove(r.line);
  view.rays = [];
  church = 0.55; reveal(1); fog(0.009); if (bloom) bloom.strength = 0.55;
  S.camera.fov = baseFov; S.camera.updateProjectionMatrix();
  traced.then((tr) => { audio.setEcho(tr); audio.openEcho(1.5, 1); });
  cut(PLAY_SHOT(), 2.5);
  list.draw();
  $('#ui').classList.remove('gone');
}

// ---- Songs
const list = songList(play);
let playing = null, stopped = false;
function showList() {
  playing = null; stopped = false; $('#stopbtn').classList.add('gone'); church = 0.55; reveal(1); if (bloom) bloom.strength = 0.55;
  $('#ui').classList.remove('gone'); cut(PLAY_SHOT(), 5);
}
// While a song plays, Stop or Esc ends it and brings the list back.
function stop() {
  if (!playing) return;
  stopped = true; cardOff();
  audio.node.port.postMessage({ voiced: {}, style: STYLES.york, groups: ORGAN_SOURCES.map(() => []) });
}
$('#stopbtn').onclick = stop;
addEventListener('keydown', (e) => { if (e.key === 'Escape') stop(); });

let picked = 0;
async function play(song) {
  const mine = ++picked; // a newer pick wins
  stopped = false;
  const midi = parseMidi(song.data ?? await (await fetch(song.file)).arrayBuffer());
  const arr = arrange(midi, song);
  if (!arr.events.length) { await card('', 'No notes there', 'That MIDI file has nothing to play in its first minute.', 3000); await cardOff(); return; }
  const missing = () => arr.pipes.filter((p) => !results.has(`${p.stop}:${p.key}`));
  if (missing().length) {
    // Voice exactly the pipes this song still needs, now, alongside the rest.
    // Biggest first: they take longest.
    const need = missing().sort((a, b) => size(b) - size(a)), n = Math.max(2, Math.min(4, hc - 2));
    for (let i = 0; i < n; i++) {
      const w = new Worker('../engine/voicer-worker.js', { type: 'module' });
      w.onmessage = (e) => { if (e.data.done) { w.terminate(); return; } if (!results.has(e.data.id)) { results.set(e.data.id, e.data); onVoiced(e.data.id); } };
      w.postMessage({ sr: SR, pipes: need.filter((_, k) => k % n === i).map((p) => ({ stop: p.stop, key: p.key })), audible: [] });
    }
    await card('', 'Making its pipes', `${need.length} to go.`);
    while (missing().length && mine === picked) { $('#card p').textContent = `${missing().length} to go.`; await sleep(300); }
  }
  if (mine !== picked) return;
  const voiced = Object.fromEntries([...results.values()].map((v) => [v.id, v.params]));
  const groups = ORGAN_SOURCES.map((id) => arr.events.filter((e) => organSource(e, STOPS[e.stop].feet).id === id));
  audio.node.port.postMessage({ voiced, style: STYLES.york, groups, box: arr.box });
  $('#ui').classList.add('gone');
  playing = song; $('#stopbtn').classList.remove('gone'); church = 0.3; reveal(1); if (bloom) bloom.strength = 0.95;
  card('', song.title, song.by).then(() => sleep(5000)).then(() => { if (list.isCurrent(song)) cardOff(); });
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
      setTimeout(() => { if (list.isCurrent(song)) showList(); }, stopped ? 0 : 7000);
      return;
    }
    $('#progress').style.width = `${Math.min(100, (100 * e.data.t) / arr.length)}%`;
    glowLevels(e.data.levels);
  };
}
// Light the pipes that are sounding, from the audio thread's levels.
function glowLevels(L) {
  for (const p of pipes) {
    const l = L[p.id] || 0;
    if (p === hero) { heroColour.copy(l > 0.02 ? NEON : INK).multiplyScalar(l > 0.02 ? 0.8 + 2.4 * l : 0.9); continue; }
    if (Math.abs(l - (p.level || 0)) > 0.04 || (l === 0 && p.level)) { p.level = l; p.state = null; organ.setPipe(p, l > 0.02 ? 'sounding' : 'voiced', l); }
  }
}

// ---- Play it yourself: the organ as an instrument, in the cathedral.
// On-screen keys (multi-touch), the computer keyboard (A W S E D F T G Y H U
// J K O L P), or a MIDI keyboard. Choose the stops; the pedal follows the
// lowest note held.
const LIVE_STOPS = [
  { name: 'Diapason 8′', ranks: ['ymDiap8a'], on: true },
  { name: 'Flute 8′', ranks: ['ymStopped8'], on: false },
  { name: 'Octave 4′', ranks: ['ymOctave4'], on: true },
  { name: '2′', ranks: ['ymSuper2'], on: false },
  { name: 'Mixture', ranks: ['ymMix15', 'ymMix19', 'ymMix22'], on: false },
  { name: '16′', ranks: ['ymDouble16'], on: false },
  { name: 'Pedal', ranks: ['ymPedSub16', 'ymPedDiap16'], on: true, pedal: true },
];
const live = { on: false, held: new Map(), pedalKey: null, base: 48, sent: 0 };
const groupOf = (stop, key, pedal) => ORGAN_SOURCES.indexOf(organSource({ key, pedal }, STOPS[stop].feet).id);
function sendOn(stop, key, pedal = false) {
  const id = `${stop}:${key}`;
  if (results.has(id)) audio.node.port.postMessage({ on: [groupOf(stop, key, pedal), id, pedal ? 0.8 : 1] });
}
const sendOff = (stop, key, pedal = false) => audio.node.port.postMessage({ off: [groupOf(stop, key, pedal), `${stop}:${key}`] });
const manualRanks = () => LIVE_STOPS.filter((s) => s.on && !s.pedal).flatMap((s) => s.ranks);
function pedalFollow() {
  const low = Math.min(...live.held.keys());
  let k = Number.isFinite(low) ? low - 12 : null;
  if (k != null) { while (k > 67) k -= 12; while (k < 36) k += 12; }
  const ped = LIVE_STOPS.find((s) => s.pedal);
  if (k === live.pedalKey && ped.on) return;
  if (live.pedalKey != null) for (const r of ped.ranks) sendOff(r, live.pedalKey, true);
  live.pedalKey = ped.on ? k : null;
  if (live.pedalKey != null) for (const r of ped.ranks) sendOn(r, live.pedalKey, true);
}
function keyDown(k) {
  if (!live.on || live.held.has(k) || k < 36 || k > 93) return;
  const ranks = manualRanks();
  live.held.set(k, ranks);
  for (const r of ranks) sendOn(r, k);
  pedalFollow(); drawKeys();
}
function keyUp(k) {
  const ranks = live.held.get(k); if (!ranks) return;
  live.held.delete(k);
  for (const r of ranks) sendOff(r, k);
  pedalFollow(); drawKeys();
}
const BLACK = [1, 3, 6, 8, 10];
function buildKeys() {
  const box = $('#keys'); box.innerHTML = '';
  const octaves = innerWidth < 700 ? 2 : 3;
  const whites = [];
  for (let k = live.base; k < live.base + 12 * octaves + 1; k++) if (!BLACK.includes(k % 12)) whites.push(k);
  for (const k of whites) { const d = document.createElement('div'); d.className = 'w'; d.dataset.k = k; box.append(d); }
  const w = 100 / whites.length;
  whites.forEach((k, i) => { if (BLACK.includes((k + 1) % 12) && k + 1 < live.base + 12 * octaves) { const d = document.createElement('div'); d.className = 'b'; d.dataset.k = k + 1; d.style.insetInlineStart = `${(i + 0.68) * w}%`; d.style.inlineSize = `${w * 0.64}%`; box.append(d); } });
  drawKeys();
}
function drawKeys() { for (const d of $('#keys').children) d.classList.toggle('on', live.held.has(+d.dataset.k)); }
function buildStops() {
  const box = $('#stops'); box.innerHTML = '';
  for (const s of LIVE_STOPS) {
    const b = document.createElement('button'); b.textContent = s.name; b.setAttribute('aria-pressed', s.on);
    b.onclick = () => { s.on = !s.on; b.setAttribute('aria-pressed', s.on); if (s.pedal) pedalFollow(); };
    box.append(b);
  }
  for (const [label, d] of [['Lower', -12], ['Higher', 12]]) {
    const b = document.createElement('button'); b.textContent = label;
    b.onclick = () => { for (const k of [...live.held.keys()]) keyUp(k); live.base = Math.max(36, Math.min(60, live.base + d)); buildKeys(); };
    box.append(b);
  }
}
// Pointer: each finger plays the key under it, and slides across keys.
const touches = new Map();
const keyAt = (x, y) => { const el = document.elementFromPoint(x, y); return el?.dataset?.k ? +el.dataset.k : null; };
$('#keys').addEventListener('pointerdown', (e) => { e.preventDefault(); $('#keys').setPointerCapture(e.pointerId); const k = keyAt(e.clientX, e.clientY); touches.set(e.pointerId, k); if (k != null) keyDown(k); });
$('#keys').addEventListener('pointermove', (e) => { if (!touches.has(e.pointerId)) return; const k = keyAt(e.clientX, e.clientY), was = touches.get(e.pointerId); if (k !== was) { if (was != null) keyUp(was); if (k != null) keyDown(k); touches.set(e.pointerId, k); } });
for (const ev of ['pointerup', 'pointercancel']) $('#keys').addEventListener(ev, (e) => { const k = touches.get(e.pointerId); touches.delete(e.pointerId); if (k != null) keyUp(k); });
const KEYMAP = 'awsedftgyhujkolp;';
addEventListener('keydown', (e) => { if (!live.on || e.repeat || e.target.tagName === 'INPUT') return; const i = KEYMAP.indexOf(e.key.toLowerCase()); if (i >= 0) keyDown(live.base + 12 + i); });
addEventListener('keyup', (e) => { if (!live.on) return; const i = KEYMAP.indexOf(e.key.toLowerCase()); if (i >= 0) keyUp(live.base + 12 + i); });
// A MIDI keyboard, if one is plugged in and the browser allows it.
async function midiIn() {
  if (!navigator.requestMIDIAccess) return;
  try {
    const access = await navigator.requestMIDIAccess();
    const hook = (input) => { input.onmidimessage = ({ data: [st, k, v] }) => { const t = st & 0xf0; if (t === 0x90 && v > 0) keyDown(k); else if (t === 0x80 || (t === 0x90 && v === 0)) keyUp(k); }; };
    access.inputs.forEach(hook);
    access.onstatechange = (e) => { if (e.port.type === 'input' && e.port.state === 'connected') hook(e.port); };
  } catch { /* no MIDI permission: the screen and keyboard still work */ }
}
let liveSync = 0;
function openLive() {
  if (playing) stop();
  live.on = true;
  document.body.classList.add('live');
  const voiced = Object.fromEntries([...results.values()].map((v) => [v.id, v.params]));
  live.sent = results.size;
  audio.node.port.postMessage({ live: { voiced, style: STYLES.york, groups: ORGAN_SOURCES.length } });
  audio.node.port.onmessage = (e) => { if (e.data.levels) glowLevels(e.data.levels); };
  // Pipes still being voiced join as they are finished.
  liveSync = setInterval(() => { if (results.size > live.sent) { const more = Object.fromEntries([...results.values()].slice(live.sent).map((v) => [v.id, v.params])); live.sent = results.size; audio.node.port.postMessage({ more }); } }, 1500);
  $('#ui').classList.add('gone'); $('#live').classList.remove('gone'); $('#livedone').classList.remove('gone');
  church = 0.3; reveal(1); if (bloom) bloom.strength = 0.95;
  buildStops(); buildKeys(); midiIn();
  cut(PLAY_SHOT(), 2);
  liftView();
  card('', 'Play it yourself', 'Use the keys, your computer keyboard (A to K), or a MIDI keyboard.').then(() => sleep(4000)).then(cardOff);
}
// While the keyboard is up, move the picture up by half the panel's height,
// so the organ sits in the clear space above the keys.
function liftView(on = true) {
  const w = innerWidth, h = innerHeight, lift = on ? Math.round($('#live').getBoundingClientRect().height / 2) : 0;
  if (lift) S.camera.setViewOffset(w, h, 0, lift, w, h); else S.camera.clearViewOffset();
  S.camera.updateProjectionMatrix();
}
addEventListener('resize', () => { if (live.on) liftView(); });
function closeLive() {
  liftView(false);
  for (const k of [...live.held.keys()]) keyUp(k);
  live.on = false; clearInterval(liveSync);
  document.body.classList.remove('live');
  if (live.pedalKey != null) { for (const r of LIVE_STOPS.find((s) => s.pedal).ranks) sendOff(r, live.pedalKey, true); live.pedalKey = null; }
  $('#live').classList.add('gone'); $('#livedone').classList.add('gone');
  setTimeout(() => audio.node.port.postMessage({ voiced: {}, style: STYLES.york, groups: ORGAN_SOURCES.map(() => []) }), 1500);
  showList();
}
$('#liveopen').onclick = openLive;
$('#livedone').onclick = closeLive;
addEventListener('resize', () => { if (live.on) buildKeys(); });
window.voicerInfo = () => ({ calls: S.renderer.info.render.calls, lines: S.renderer.info.render.lines, voiced: results.size, shot: view.shot(now()) });
