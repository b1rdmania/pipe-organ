// Frame renderer for the 30-second clip (tools/clip.mjs writes the timeline).
// window.voicer.frame(t) draws time t. ?clip=<json>&w=&h=
import { createScene, P } from './scene.js';
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { layoutOrgan, organLines, pipeSegments, NEON, INK } from './organ-view.js';

const q = new URLSearchParams(location.search);
const W = +(q.get('w') || 1080), H = +(q.get('h') || 1350);
const clip = await (await fetch(q.get('clip') || '../out/clip/clip.json', { cache: 'no-store' })).json();

const canvas = document.getElementById('c');
const S = createScene(canvas, { width: W, height: H, lineArt: true });
S.renderer.setPixelRatio(1);
S.renderer.setSize(W, H, false);
S.composer.setSize(W, H);
S.camera.aspect = W / H;
S.camera.fov = 40;
S.camera.updateProjectionMatrix();

const pipes = layoutOrgan(clip.pipes);
const byId = new Map(pipes.map((p) => [p.id, p]));
const hero = byId.get(clip.heroId);
const organ = organLines(S.root, pipes, hero);
// The hero in thick lines, so it reads at phone size.
hero.obj.visible = false;
const fatMat = new LineMaterial({ color: 0xffffff, linewidth: 3.2, toneMapped: false, fog: false });
fatMat.resolution.set(W, H);
const fatGeo = new LineSegmentsGeometry();
const fat = new LineSegments2(fatGeo, fatMat);
fat.position.copy(P(hero.mx, hero.my, hero.mz));
S.root.add(fat);
function shapeFat(v, colour) {
  fatGeo.setPositions(pipeSegments(hero, v));
  fat.computeLineDistances?.();
  fatMat.color.copy(colour);
}

// Frame the case from its real size.
let y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
for (const p of pipes.filter((p) => !p.pedal)) { y0 = Math.min(y0, p.my - p.w); y1 = Math.max(y1, p.my + p.w); z0 = Math.min(z0, p.mz); z1 = Math.max(z1, p.mz + p.h); }
const half = Math.tan((20 * Math.PI) / 180);
const caseDist = Math.max(((z1 - z0) * 1.45) / 2 / half, ((y1 - y0) * 1.2) / 2 / (half * W / H));
const mid = [hero.mx, (y0 + y1) / 2, (z0 + z1) / 2];

const ease = (u) => { u = Math.min(1, Math.max(0, u)); return u * u * (3 - 2 * u); };
const mixv = (a, b, u) => a.map((v, i) => v + (b[i] - v) * u);

// Camera: close on the hero pipe, pull back to the case, then back down the
// crossing as the Minster draws itself around it.
const hc = [hero.mx, hero.my, hero.mz + hero.h * 0.5];
const fit = (hero.h * 1.25) / 2 / Math.tan((20 * Math.PI) / 180);
const CLOSE = { p: [hero.mx - fit, hero.my, hc[2]], a: hc };
const CLOSE2 = { p: [hero.mx - fit * 0.88, hero.my, hc[2]], a: hc };
const CASE = { p: [mid[0] - caseDist, mid[1], mid[2]], a: mid };
const WIDE = { p: [mid[0] - caseDist * 2.0, mid[1], mid[2] - 3], a: [mid[0], mid[1], mid[2] + 1.5] };
function cam(t) {
  const m0 = clip.montage0, s0 = clip.song0;
  if (t < m0) return { p: mixv(CLOSE.p, CLOSE2.p, t / m0), a: CLOSE.a };
  if (t < s0 + 0.5) { const u = ease((t - m0) / (s0 + 0.5 - m0)); return { p: mixv(CLOSE2.p, CASE.p, u), a: mixv(CLOSE2.a, CASE.a, u) }; }
  const u = ease((t - s0 - 0.5) / (clip.end - s0 - 0.5));
  return { p: mixv(CASE.p, WIDE.p, u), a: mixv(CASE.a, WIDE.a, u) };
}

// The Minster draws outward from the organ screen.
const R0 = 0.6;
function reveal(u) {
  for (const L of S.lines) {
    const k = Math.min(1, Math.max(0, (u * 1.2 - Math.abs(L.userData.rank - R0) * 1.6) / 0.25));
    L.material.opacity = L.userData.alpha * k; L.visible = k > 0;
  }
}

function level(id, t) {
  const iv = clip.notes[id]; if (!iv) return 0;
  let l = 0;
  for (const [a, b] of iv) {
    if (a > t) break;
    if (t < b) return Math.min(1, (t - a) / 0.03);
    if (t < b + 0.35) l = Math.max(l, 1 - (t - b) / 0.35);
  }
  return l;
}

window.voicer = {
  end: clip.end, fps: clip.fps,
  // The camera path and the hero's mouth, for the sound (tools/clip.mjs).
  path(step = 0.25) {
    const out = [];
    for (let t = 0; t <= clip.end + 1e-9; t += step) { const c = cam(t); out.push({ t: +t.toFixed(3), p: c.p, a: c.a }); }
    return { path: out, hero: [hero.mx + 0.05, hero.my, hero.mz + hero.foot] };
  },
  frame(t) {
    // Hero: the shape of the step being heard.
    const st = [...clip.hero].reverse().find((s) => t >= s.t) || clip.hero[0];
    const voicingHero = t < clip.montage0;
    const hl = level(hero.id, t);
    shapeFat(st, voicingHero ? NEON.clone().multiplyScalar(2.2) : t >= clip.song0 && hl > 0.02 ? NEON.clone().multiplyScalar(0.8 + 2.4 * hl) : INK.clone().multiplyScalar(0.55));
    // Everyone else: unbuilt until voiced in the rush, then sounding.
    for (const p of pipes) {
      if (p === hero) { organ.setPipe(p, voicingHero ? 'voicing' : t < clip.song0 ? 'voiced' : 'sounding', level(p.id, t)); continue; }
      const m = clip.montage.find((x) => x.id === p.id);
      if (t >= clip.song0) organ.setPipe(p, 'sounding', level(p.id, t));
      else if (!m || t < m.t) organ.setPipe(p, voicingHero ? 'unbuilt' : 'unbuilt');
      else if (t < m.t + 0.12) organ.setPipe(p, 'voicing');
      else organ.setPipe(p, 'voiced');
    }
    reveal(ease((t - clip.montage0 - 0.6) / 6));
    const c = cam(t);
    S.setCamera(c.p, c.a);
    S.render();
    return true;
  },
  async capture(from, to, url = '/frame/') {
    for (let f = from; f < to; f++) {
      this.frame(f / clip.fps);
      const blob = await new Promise((ok) => canvas.toBlob(ok, 'image/png'));
      await fetch(url + f, { method: 'POST', body: blob });
    }
    return to;
  },
  ready: true,
};
if (!q.get('still')) {
  const t0 = performance.now();
  const loop = () => { window.voicer.frame(((performance.now() - t0) / 1000) % clip.end); requestAnimationFrame(loop); };
  loop();
}
