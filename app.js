import { parseMidi } from './engine/midi.js';
import { arrange, tempoFor, chooseStyle } from './engine/arranger.js';
import { STOPS, STYLES } from './engine/organ.js';
import { PLACES, impulseResponse, rt60 } from './engine/room.js';
import { midiHz } from './engine/pitch.js';

const SONGS = [
  { id: 'toccata', name: 'Toccata in D minor — Bach', file: 'songs/ToccataFugue.mid', mood: 'grand', from: 0, to: 34 },
  { id: 'air', name: 'Air — Bach', file: 'songs/bach_air_bmv_1068.mid', mood: 'tender', from: 0, to: 64 },
  { id: 'wedding', name: 'Wedding March — Mendelssohn', file: 'songs/Sommernachtstraum-wedding-march.mid', mood: 'showy', from: 0, to: 40 },
];
const NOTE = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const noteName = (k) => NOTE[k % 12] + (Math.floor(k / 12) - 1);

const $ = (s) => document.querySelector(s);
const state = { song: SONGS[0], place: 'cathedral', pipes: [], busy: false, own: null };

// ---------- picking ----------
function list(el, items, current, onPick) {
  el.innerHTML = '';
  for (const it of items) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.textContent = it.name;
    b.setAttribute('aria-pressed', String(it.id === current));
    b.onclick = () => { onPick(it); [...el.querySelectorAll('button')].forEach((x) => x.setAttribute('aria-pressed', String(x === b))); };
    li.append(b); el.append(li);
  }
}
function drawLists() {
  const songs = state.own ? [...SONGS, state.own] : SONGS;
  list($('#songs'), songs, state.song.id, (s) => (state.song = s));
  list($('#places'), Object.entries(PLACES).map(([id, p]) => ({ id, name: p.name })), state.place, (p) => (state.place = p.id));
}
drawLists();
// Drop any MIDI file on the page to use it.
addEventListener('dragover', (e) => e.preventDefault());
addEventListener('drop', async (e) => {
  e.preventDefault();
  const f = e.dataTransfer.files[0];
  if (!f) return;
  state.own = { id: 'own', name: f.name.replace(/\.midi?$/i, ''), data: await f.arrayBuffer(), mood: 'grand', from: 0, to: 60 };
  state.song = state.own;
  drawLists();
});

// ---------- audio ----------
let ctx, organNode, convolver, master;
async function audio() {
  if (ctx) return;
  ctx = new AudioContext({ sampleRate: 48000, latencyHint: 'playback' });
  await ctx.audioWorklet.addModule('engine/organ-worklet.js');
  convolver = new ConvolverNode(ctx, { disableNormalization: true });
  const limit = new DynamicsCompressorNode(ctx, { threshold: -6, knee: 6, ratio: 12, attack: 0.003, release: 0.25 });
  master = new GainNode(ctx, { gain: 0.5 });
  convolver.connect(limit).connect(master).connect(ctx.destination);
  organNode = new AudioWorkletNode(ctx, 'organ', { numberOfInputs: 0, outputChannelCount: [2] });
  organNode.connect(convolver);
  organNode.port.onmessage = (e) => {
    if (e.data.levels) { state.levels = e.data.levels; state.playT = e.data.t; }
    if (e.data.finished) { state.levels = {}; state.busy = false; $('#build').disabled = false; }
  };
}
function setRoom(placeId) {
  const ir = impulseResponse(PLACES[placeId], ctx.sampleRate);
  const buf = ctx.createBuffer(2, ir.channels[0].length, ctx.sampleRate);
  buf.copyToChannel(ir.channels[0], 0); buf.copyToChannel(ir.channels[1], 1);
  convolver.buffer = buf;
}
function blip(samples, gain) {
  const b = ctx.createBuffer(1, samples.length, ctx.sampleRate);
  b.copyToChannel(samples, 0);
  const src = new AudioBufferSourceNode(ctx, { buffer: b });
  const g = new GainNode(ctx, { gain });
  const n = samples.length, fade = Math.min(n, 2400);
  g.gain.setValueAtTime(gain, ctx.currentTime + (n - fade) / ctx.sampleRate);
  g.gain.linearRampToValueAtTime(0, ctx.currentTime + n / ctx.sampleRate);
  src.connect(g).connect(convolver);
  src.start();
}

// ---------- build ----------
$('#build').onclick = async () => {
  if (state.busy) return;
  state.busy = true; $('#build').disabled = true;
  await audio();
  await ctx.resume();
  const place = PLACES[state.place];
  const rt = rt60(place); const rtMid = (rt[2] + rt[3]) / 2;
  setRoom(state.place);
  const song = state.song;
  const data = song.data ?? (await (await fetch(song.file)).arrayBuffer());
  const midi = parseMidi(data);
  const styleId = chooseStyle(song, { rt: rtMid, size: place.size });
  const speed = tempoFor(rtMid);
  const arr = arrange(midi, styleId, { from: song.from, to: song.to, speed });
  state.style = styleId;
  state.levels = {};
  layout(arr.pipes);
  say(`${STYLES[styleId].name} organ\n${arr.pipes.length} pipes · ${place.name} · ${rtMid.toFixed(1)} s echo`);

  // Voice in parallel workers. The first three pipes are heard as they are tuned.
  const audible = pickAudible(arr.pipes);
  const nw = Math.max(1, Math.min(6, (navigator.hardwareConcurrency || 4) - 1));
  const results = new Map();
  const queue = buildOrder(arr.pipes, audible);
  let finished = 0;
  new Promise((resolve) => {
    for (let w = 0; w < nw; w++) {
      const worker = new Worker('engine/voicer-worker.js', { type: 'module' });
      const mine = queue.filter((_, i) => i % nw === w);
      worker.onmessage = (e) => {
        if (e.data.done) { worker.terminate(); if (++finished === nw) resolve(); return; }
        results.set(e.data.id, e.data);
        state.arrived = results;
      };
      worker.postMessage({ sr: ctx.sampleRate, pipes: mine, audible: audible.map((p) => p.id) });
    }
    state.arrived = results;
  });
  // Let the build montage catch up with the workers, then play.
  await montageDone(queue, results);
  const voiced = Object.fromEntries([...results].map(([id, r]) => [id, r.params]));
  say(`${STYLES[styleId].name} organ · ${place.name}\n${song.name}`);
  organNode.port.postMessage({ voiced, style: STYLES[styleId], events: arr.events });
};

function pickAudible(pipes) {
  // Three pipes from the middle of the main rank: easiest to hear being tuned.
  const main = pipes.filter((p) => !STOPS[p.stop].feet || STOPS[p.stop].feet === 8);
  const mid = main.sort((a, b) => Math.abs(a.key - 60) - Math.abs(b.key - 60)).slice(0, 3);
  return mid.map((p) => ({ ...p, id: `${p.stop}:${p.key}` }));
}
function buildOrder(pipes, audible) {
  const ids = new Set(audible.map((p) => p.id));
  const rest = pipes.filter((p) => !ids.has(`${p.stop}:${p.key}`)).sort((a, b) => STOPS[b.stop].feet - STOPS[a.stop].feet || a.key - b.key);
  return [...audible.map(({ stop, key }) => ({ stop, key })), ...rest];
}

// ---------- the montage: each pipe appears, sounds wrong, tunes itself ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function montageDone(queue, results) {
  for (let i = 0; i < queue.length; i++) {
    const id = `${queue[i].stop}:${queue[i].key}`;
    while (!results.has(id)) await sleep(30);
    const r = results.get(id);
    const pipe = state.pipes.find((p) => p.id === id);
    pipe.state = 'voicing';
    const slow = i < 3;
    for (const s of r.steps) {
      pipe.step = s;
      const st = STOPS[queue[i].stop];
      say(`${st.name} · ${noteName(queue[i].key)}\n${s.cents == null ? '—' : (s.cents > 0 ? '+' : '') + s.cents.toFixed(1) + '¢'} · ${s.action}`);
      if (slow && s.audio) blip(s.audio, (0.1 * st.level) / Math.max(0.05, rms(s.audio)) * 0.8);
      await sleep(slow ? 650 : Math.max(6, 50 * Math.pow(0.93, i)));
    }
    pipe.state = 'voiced';
    pipe.final = r.params;
  }
}
const rms = (x) => { let s = 0; for (let i = x.length >> 1; i < x.length; i++) s += x[i] * x[i]; return Math.sqrt(s / (x.length >> 1)); };
function say(t) { $('#readout').textContent = t; }

// ---------- the picture: placeholder neon lines ----------
const cv = $('#stage'), g = cv.getContext('2d');
function layout(pipes) {
  // Physical speaking length: open pipe = half a wavelength, stopped = a quarter.
  const byRank = {};
  for (const p of pipes) (byRank[p.stop] ??= []).push(p);
  const out = [];
  for (const [stop, ps] of Object.entries(byRank)) {
    ps.sort((a, b) => a.key - b.key);
    // Façade order: tallest in the middle, alternating out (a mitre).
    const order = [];
    ps.forEach((p, i) => (i % 2 ? order.push(p) : order.unshift(p)));
    for (const p of order) {
      const f = midiHz(p.key) * (8 / STOPS[stop].feet);
      const len = STOPS[stop].stopped ? 343 / (4 * f) : 343 / (2 * f);
      out.push({ id: `${stop}:${p.key}`, stop, key: p.key, len, rank: stop, state: 'unbuilt' });
    }
    out.push({ gap: true });
  }
  out.pop();
  state.pipes = out.filter((p) => !p.gap);
  state.slots = out;
}
function frame() {
  const dpr = devicePixelRatio || 1;
  const w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== w * dpr || cv.height !== h * dpr) { cv.width = w * dpr; cv.height = h * dpr; }
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  const slots = state.slots || [];
  if (slots.length) {
    const pad = 32, n = slots.length;
    const dx = (w - pad * 2) / n;
    const maxLen = Math.max(...state.pipes.map((p) => p.len));
    const base = h - 48;
    const scale = (h - 120) / Math.pow(maxLen, 0.55);
    const levels = state.levels || {};
    slots.forEach((p, i) => {
      if (p.gap) return;
      const x = pad + dx * (i + 0.5);
      let len = p.len;
      let jr = STOPS[p.stop].jr;
      if (p.state === 'voicing' && p.step) {
        const nominal = STOPS[p.stop].stopped ? 48000 / (2 * midiHz(p.key) * (8 / STOPS[p.stop].feet)) : 48000 / (midiHz(p.key) * (8 / STOPS[p.stop].feet));
        len = p.len * (p.step.bore / nominal);
        jr = p.step.jetRatio;
      } else if (p.final) jr = p.final.jetRatio;
      const ph = Math.pow(len, 0.55) * scale;
      const pw = Math.max(1.5, Math.min(dx * 0.7, ph * 0.09));
      const mouth = Math.max(2, pw * jr * 1.6);
      const foot = Math.min(24, ph * 0.12);
      const lv = levels[p.id] || 0;
      const top = base - ph;
      let col, alpha;
      if (p.state === 'unbuilt') { col = '#2a2a30'; alpha = 1; }
      else if (p.state === 'voicing') { col = '#ff3d6e'; alpha = 1; }
      else { col = lv > 0.01 ? '#ff3d6e' : '#e9e7e1'; alpha = lv > 0.01 ? 0.45 + 0.55 * lv : 0.55; }
      g.globalAlpha = alpha;
      g.strokeStyle = col;
      g.lineWidth = 1;
      if (lv > 0.01) { g.shadowColor = '#ff3d6e'; g.shadowBlur = 14 * lv; } else g.shadowBlur = 0;
      // Body: two walls, with the mouth left open as a gap in the front.
      const mTop = base - foot - mouth;
      g.beginPath();
      g.moveTo(x - pw / 2, base - foot); g.lineTo(x - pw / 2, top);
      g.moveTo(x + pw / 2, base - foot); g.lineTo(x + pw / 2, top);
      if (STOPS[p.stop].stopped) { g.moveTo(x - pw / 2, top); g.lineTo(x + pw / 2, top); }
      // Foot: a cone down to the windchest.
      g.moveTo(x - pw / 2, base - foot); g.lineTo(x, base);
      g.moveTo(x + pw / 2, base - foot); g.lineTo(x, base);
      g.stroke();
      // Mouth: the face. Upper lip moves with the cut-up.
      g.beginPath();
      g.moveTo(x - pw * 0.35, base - foot); g.lineTo(x + pw * 0.35, base - foot);
      g.moveTo(x - pw * 0.35, mTop); g.lineTo(x + pw * 0.35, mTop);
      g.stroke();
    });
    g.globalAlpha = 1; g.shadowBlur = 0;
    g.strokeStyle = '#2a2a30'; g.beginPath(); g.moveTo(pad, base + 0.5); g.lineTo(w - pad, base + 0.5); g.stroke();
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
