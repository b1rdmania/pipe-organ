// Offline: build a Tesseract project where picture and sound share one organ.
// The engine voices the organ and renders dry stems; each stem is a cluster of
// pipes on the façade. One camera path drives the 3D view and, through the
// binaural effect, where every cluster is heard from.
// node tools/film.mjs <song.mid> <place> <style> <fromSec> <toSec> <outDir>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { parseMidi } from '../engine/midi.js';
import { arrange, tempoFor } from '../engine/arranger.js';
import { STOPS, STYLES } from '../engine/organ.js';
import { voicePipe } from '../engine/voicer.js';
import { Player } from '../engine/player.js';
import { PLACES, rt60 } from '../engine/room.js';
import { facade, mouth } from '../engine/facade.js';

const [file, placeId, styleId, from, to, outDir] = process.argv.slice(2);
const sr = 48000;
const place = PLACES[placeId];
const rt = rt60(place);
const style = STYLES[styleId];
const arr = arrange(parseMidi(readFileSync(file)), styleId, { from: +from, to: +to, speed: tempoFor((rt[2] + rt[3]) / 2) });
const pipes = facade(arr.pipes, style);
const byId = Object.fromEntries(pipes.map((p) => [p.id, p]));

// ---- Voice. The hero is the biggest pipe of the lead rank: centre of the mitre.
const lead = style.manual[0];
const heroKey = Math.min(...arr.pipes.filter((p) => p.stop === lead).map((p) => p.key));
const voiced = {};
let heroV;
for (const { stop, key } of arr.pipes) {
  const isHero = stop === lead && key === heroKey;
  const v = voicePipe(sr, STOPS[stop], key, { keepAudio: isHero });
  voiced[`${stop}:${key}`] = v.params;
  if (isHero) heroV = v;
}
const hero = byId[`${lead}:${heroKey}`];
const attempts = heroV.steps.filter((s) => s.audio);

// ---- Timeline (seconds).
const gapS = 0.25;
const tries = [];
let t = 0.6;
for (const s of attempts) { tries.push({ t, dur: s.audio.length / sr, s }); t += s.audio.length / sr + gapS; }
const tuneEnd = t;
const buildDur = 1.6;
const S = tuneEnd + buildDur; // organ starts
const L = arr.length + 1.5;
const END = S + L + 1.0;

// ---- Camera path: close on the hero, pull back down the nave, then walk in.
const heroMid = [hero.x, hero.y + hero.foot + hero.len * 0.45, hero.z];
const keysCam = [
  { t: 0, p: [hero.x + 0.5, heroMid[1] - 0.2, -3.4], a: heroMid },
  { t: tuneEnd, p: [hero.x + 0.3, heroMid[1] - 0.1, -3.0], a: heroMid },
  { t: S + 3.0, p: [0, 3.0, -14], a: [0, 8.1, 0] },
  { t: END, p: [0, 3.5, -10], a: [0, 8.3, 0] },
];
const ease = (u) => u * u * (3 - 2 * u);
function cam(time) {
  let i = 0;
  while (i < keysCam.length - 2 && time > keysCam[i + 1].t) i++;
  const A = keysCam[i], B = keysCam[i + 1];
  const u = ease(Math.min(1, Math.max(0, (time - A.t) / (B.t - A.t))));
  const lerp = (x, y) => x.map((v, k) => v + (y[k] - v) * u);
  return { p: lerp(A.p, B.p), a: lerp(A.a, B.a) };
}
const sub = (a, b) => a.map((v, i) => v - b[i]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => { const l = Math.hypot(...a); return a.map((v) => v / l); };
// Direction of a point as heard by the camera (x right, y up, z ahead; metres).
function heard(c, q) {
  const f = norm(sub(c.a, c.p));
  const r = norm([f[2], 0, -f[0]]);
  const up = norm(sub([0, 1, 0], f.map((v) => v * f[1])));
  const v = sub(q, c.p);
  const x = dot(v, r), y = dot(v, up), z = dot(v, f);
  return { az: (Math.atan2(x, z) * 180) / Math.PI, el: (Math.atan2(y, Math.hypot(x, z)) * 180) / Math.PI, d: Math.hypot(x, y, z) };
}

// ---- Sound clusters: pipes within about a metre of each other share a stem.
const clusterOf = (p) => (p.id === hero.id ? 'hero' : `${p.pedal ? 'ped' : 'man'}${Math.round(p.x / 1.0)}`);
const clusters = {};
for (const p of pipes) (clusters[clusterOf(p)] ??= []).push(p);
const pos = Object.fromEntries(Object.entries(clusters).map(([k, ps]) => [k, [0, 1, 2].map((i) => ps.reduce((a, p) => a + mouth(p)[i], 0) / ps.length)]));

// ---- Render stems, each padded so the organ starts at S.
mkdirSync(outDir, { recursive: true });
const pad = Math.round(S * sr);
const total = pad + Math.ceil(L * sr);
const stems = {};
let peak = 0;
for (const k of Object.keys(clusters)) {
  const ids = new Set(clusters[k].map((p) => p.id));
  const ev = arr.events.filter((e) => ids.has(`${e.stop}:${e.key}`));
  if (!ev.length) continue;
  const player = new Player(sr, { voiced, style });
  player.load(ev);
  const x = new Float32Array(total);
  const body = x.subarray(pad);
  for (let i = 0; i < body.length; i += 128) player.process(body.subarray(i, Math.min(body.length, i + 128)));
  stems[k] = x;
  for (const v of x) peak = Math.max(peak, Math.abs(v));
}
// The hero's voicing attempts go on the hero's stem, before the organ starts.
let tp = 0;
for (const a of attempts) for (const v of a.audio) tp = Math.max(tp, Math.abs(v));
stems.hero ??= new Float32Array(total);
const heroGain = (0.6 * peak) / tp; // as loud as the organ's loudest moment, near enough
for (const tr of tries) stems.hero.set(tr.s.audio.map((v) => v * heroGain), Math.round(tr.t * sr));

function wav(path, x, g) {
  const b = Buffer.alloc(44 + x.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + x.length * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24);
  b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(x.length * 2, 40);
  for (let i = 0; i < x.length; i++) b.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(x[i] * g * 32767))), 44 + i * 2);
  writeFileSync(path, b);
}
const g = 0.3 / peak;
for (const [k, x] of Object.entries(stems)) wav(`${outDir}/${k}.wav`, x, g);

// ---- Tesseract actions.
const PX = 100;
const P = ([x, y, z]) => [x * PX, -y * PX, z * PX];
const ms = (s) => Math.round(s * 1000);
const acts = [];
// Keys sorted, one per millisecond (a later key at the same ms wins).
const clean = (keys) => {
  const m = new Map();
  for (const [tt, v] of keys.slice().sort((a, b) => a[0] - b[0])) m.set(Math.round(tt * 1000), v);
  return [...m].map(([k, v]) => [k / 1000, v]);
};
const anim = (itemId, propertyName, keys, type = 'float') => acts.push({
  type: 'setFxAnimator', compositionId: 'main',
  target: { type: 'styleProperty', layerId: 1, itemId, propertyName },
  animator: { type: 'keyframes', enabled: true, keyframes: clean(keys).map(([tt, v], i) => ({ id: `${propertyName}-${itemId}-${i}`, layerTime: ms(tt), value: { type, value: v }, easing: { type: 'linear' } })) },
  dependencies: [], layerRefBindings: [],
});

acts.push({ type: 'createFxScene3DLayer', compositionId: 'main', layerId: 1, name: 'Organ', pixelsPerMeter: PX, view: { id: 9, exposure: 0 },
  activeRange: { start: 0, duration: ms(END) }, transform: { anchorPoint: [0, 0], position: [0, 0], scale: [100, 100], rotation: 0, opacity: 100 },
  world: { id: 2, background: { type: 'color', color: [0.003, 0.003, 0.005, 1] } },
  renderSettings: { id: 97, filmGate: null, overscan: null, lightGroups: [], lightCollections: [], lightLinks: [], outputs: [], previewOutput: null } });
const c0 = cam(0);
acts.push({ type: 'addFxScene3DLayer', compositionId: 'main', layerId: 1, item: { type: 'Camera3D', id: 3, parentId: null, name: 'Listener',
  transform: { position: P(c0.p), relationships: { constraints: [{ type: 'aim', id: 80, target: { id: 800, target: { type: 'world' }, offset: P(c0.a), offsetSpace: 'world' }, upSpace: 'world', forwardAxis: 'positiveZ' }] } },
  lens: { type: 'angle', projection: { type: 'perspective', angleOfView: 42 } } } });
acts.push({ type: 'setFxScene3DActiveCamera', compositionId: 'main', layerId: 1, cameraItemId: 3 });

const step = 0.2;
const times = [];
for (let tt = 0; tt <= END + 1e-9; tt += step) times.push(+tt.toFixed(3));
anim(3, 'position', times.map((tt) => [tt, P(cam(tt).p)]), 'vector3');
anim(800, 'offset', times.map((tt) => [tt, P(cam(tt).a)]), 'vector3');

// Pipes: a neon rod with a dark mouth. Ids: data 1000+, items 5000+, bindings 9000+.
const PINK = [1, 0.046, 0.155];
const UNBUILT = 0.03, IDLE = 0.22, LIT = 4.5;
const data = [], items = [];
const order = pipes.map((p) => p.id).sort((a, b) => Math.abs(byId[a].x - hero.x) - Math.abs(byId[b].x - hero.x));
pipes.forEach((p, i) => {
  const h = p.foot + p.len;
  const bodyD = 1000 + i * 2, mouthD = bodyD + 1, bodyI = 5000 + i * 2, mouthI = bodyI + 1, bind = 9000 + i * 2, bindM = bind + 1;
  const mh = Math.max(0.012, p.d * STOPS[p.stop].jr * 0.9);
  p.ids = { bodyI, mouthI, bind, h, mh };
  const reg = [{ key: 'primary', name: 'Primary' }, { key: 'side', name: 'Side' }];
  data.push({ type: 'mesh', id: bodyD, name: `${p.id} body`, geometry: { type: 'cylinder', radius: (p.d / 2) * PX, height: h * PX }, regions: reg });
  data.push({ type: 'mesh', id: mouthD, name: `${p.id} mouth`, geometry: { type: 'box', size: [p.d * 0.8 * PX, mh * PX, p.d * 0.3 * PX] }, regions: reg });
  items.push({ type: 'Mesh3D', id: bodyI, parentId: null, name: `${STOPS[p.stop].name} ${p.key}`, dataId: bodyD, packing: 'whole',
    transform: { position: P([p.x, p.y, p.z]), anchorPoint: [0, (h / 2) * PX, 0] },
    materialSlots: [{ id: bind + 20000, name: 'Neon', binding: { id: bind, inputs: { baseColor: { type: 'constant', value: [0, 0, 0] }, emissiveColor: { type: 'constant', value: PINK }, emissiveStrength: { type: 'constant', value: UNBUILT } } } }],
    regionSlots: [{ region: 'primary', slotId: bind + 20000 }, { region: 'side', slotId: bind + 20000 }] });
  items.push({ type: 'Mesh3D', id: mouthI, parentId: null, name: `${STOPS[p.stop].name} ${p.key} mouth`, dataId: mouthD, packing: 'whole',
    transform: { position: P([p.x, p.y + p.foot + mh / 2, p.z - p.d / 2]) },
    materialSlots: [{ id: bindM + 20000, name: 'Mouth', binding: { id: bindM, inputs: { baseColor: { type: 'constant', value: [0, 0, 0] }, roughness: { type: 'constant', value: 1 } } } }],
    regionSlots: [{ region: 'primary', slotId: bindM + 20000 }, { region: 'side', slotId: bindM + 20000 }] });
});
for (let i = 0; i < data.length; i += 40) acts.push({ type: 'addFxScene3DFragment', compositionId: 'main', layerId: 1, data: data.slice(i, i + 40), items: items.slice(i, i + 40) });

// Light per pipe: dark until built, a flash as it is voiced, dim at rest, bright while it speaks.
const notes = {};
for (const e of arr.events) (notes[`${e.stop}:${e.key}`] ??= []).push([S + e.t, S + e.t + e.dur]);
for (const p of pipes) {
  const k = [];
  if (p.id === hero.id) {
    k.push([0, IDLE * 0.5]);
    for (const tr of tries) k.push([tr.t, IDLE * 0.5], [tr.t + 0.04, LIT], [tr.t + tr.dur, LIT * 0.8], [tr.t + tr.dur + 0.12, IDLE * 0.5]);
    k.push([tuneEnd, IDLE]);
    // Length and mouth follow the voicer's knife.
    const fin = heroV.params;
    const sk = [[0, [100, (100 * attempts[0].bore) / fin.bore, 100]]];
    const mk = [[0, [100, (100 * attempts[0].jetRatio) / fin.jetRatio, 100]]];
    for (const tr of tries) {
      sk.push([tr.t - 0.08, sk.at(-1)[1]], [tr.t, [100, (100 * tr.s.bore) / fin.bore, 100]]);
      mk.push([tr.t - 0.08, mk.at(-1)[1]], [tr.t, [100, (100 * tr.s.jetRatio) / fin.jetRatio, 100]]);
    }
    sk.push([tuneEnd, [100, 100, 100]]); mk.push([tuneEnd, [100, 100, 100]]);
    anim(p.ids.bodyI, 'scale', sk.filter((x, i, a) => !i || x[0] > a[i - 1][0]), 'vector3');
    anim(p.ids.mouthI, 'scale', mk.filter((x, i, a) => !i || x[0] > a[i - 1][0]), 'vector3');
  } else {
    const tb = tuneEnd + (buildDur * 0.85 * order.indexOf(p.id)) / order.length;
    k.push([0, UNBUILT], [tb, UNBUILT], [tb + 0.06, 1.6], [tb + 0.35, IDLE]);
  }
  const iv = (notes[p.id] || []).sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [a, b] of iv) { if (merged.length && a < merged.at(-1)[1] + 0.3) merged.at(-1)[1] = Math.max(merged.at(-1)[1], b); else merged.push([a, b]); }
  for (const [a, b] of merged) k.push([a - 0.01, IDLE], [a + 0.03, LIT], [b, LIT * 0.75], [b + 0.3, IDLE]);
  anim(p.ids.bind, 'emissiveStrength', k.filter((x, i, a) => !i || x[0] > a[i - 1][0] + 0.0005));
}
acts.push({ type: 'addFxLayerEffect', compositionId: 'main', layerId: 1, effectId: 50, effect: { type: 'glow', glowThreshold: 30, glowRadius: 28, glowIntensity: 1.6 } });

// Sound: one audio layer per cluster, placed by the camera path. Ids 300+, effects 700+.
let lid = 300, eid = 700;
const durMs = Math.floor((total / sr) * 1000);
for (const k of Object.keys(stems)) {
  const L1 = lid++, E = eid++;
  acts.push({ type: 'createFxAudioLayer', compositionId: 'main', layerId: L1, name: k === 'hero' ? `Hero pipe ${STOPS[hero.stop].name} ${heroKey}` : `Pipes ${k}`,
    activeRange: { start: 0, duration: durMs }, sourceRange: { start: 0, duration: durMs }, sourceIntrinsicDuration: durMs, source: { assetId: `stem-${k}` } });
  const h0 = heard(cam(0), pos[k]);
  acts.push({ type: 'addFxMixerEffect', compositionId: 'main', layerId: L1, effect: { id: E, effect: { type: 'binaural', azimuthDegrees: h0.az, elevationDegrees: h0.el, distanceMeters: h0.d, widthDegrees: 0, rolloff: 0.5, doppler: 0 } } });
  acts.push({ type: 'applyFxMixerRoomPreset', compositionId: 'main', layerId: L1, effectId: E, presetId: 'cathedral' });
  const H = times.map((tt) => [tt, heard(cam(tt), pos[k])]);
  // Unwrap azimuth so it never jumps across ±180.
  for (let i = 1; i < H.length; i++) { while (H[i][1].az - H[i - 1][1].az > 180) H[i][1].az -= 360; while (H[i][1].az - H[i - 1][1].az < -180) H[i][1].az += 360; }
  for (const [param, f] of [['azimuthDegrees', 'az'], ['elevationDegrees', 'el'], ['distanceMeters', 'd']]) {
    acts.push({ type: 'setFxAutomationKeyframes', compositionId: 'main', layerId: L1, control: { type: 'effect', effectId: E, paramName: param },
      keyframes: H.map(([tt, h], i) => ({ id: `${f}-${L1}-${i}`, layerTime: ms(tt), value: { type: 'float', value: +h[f].toFixed(3) }, easing: { type: 'linear' } })) });
  }
}

// Master: bring the far-away organ up to a normal listening level (about -16 LUFS).
acts.push({ type: 'addFxMixerEffect', compositionId: 'main', effect: { id: 690, effect: { type: 'limiter', ceilingDb: -1, releaseMs: 150, lookaheadMs: 5, truePeak: true, inputDb: 14, stereoLink: 1 } } });

writeFileSync(`${outDir}/actions.json`, JSON.stringify(acts));
const meta = { song: file, place: placeId, style: styleId, end: END, organStarts: S, tuneEnd, pipes: pipes.length, events: arr.events.length,
  stems: Object.keys(stems), hero: { id: hero.id, tries: tries.map((tr) => ({ t: +tr.t.toFixed(2), cents: +tr.s.cents.toFixed(1), action: tr.s.action })) },
  facadeWidth: Math.max(...pipes.map((p) => p.x)) - Math.min(...pipes.map((p) => p.x)) };
writeFileSync(`${outDir}/film.json`, JSON.stringify(meta, null, 2));
console.log(JSON.stringify(meta));
console.log(acts.length, 'actions');
