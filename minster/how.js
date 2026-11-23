// Figures for "How we built it": the pipe and the organ in 3D (drag to turn),
// the cathedral's acoustic plan, a pipe voiced live with its measurements, and
// the echo against the measured recordings.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { STOPS, STYLES } from '../engine/organ.js';
import { voicePipe, highlights } from '../engine/voicer.js';
import { build } from '../engine/minster.js';
import { layoutOrgan, organLines, pipeSegments, NEON, INK } from './organ-view.js';

const INKC = '#e9e7e1', NEONC = '#ff3d6e', DIM = '#6d6b66', GRID = '#2a2a30';
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---- A small 3D stage: renders only while something moves.
function stage(el, { fov = 35 } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  renderer.setClearColor(0x000000);
  el.append(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(fov, 1, 0.01, 500);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.enablePan = false; controls.enableZoom = false;
  controls.autoRotate = !reduced; controls.autoRotateSpeed = 0.6;
  controls.addEventListener('start', () => { controls.autoRotate = false; });
  const mats = [];
  const size = () => { const r = el.getBoundingClientRect(); renderer.setSize(r.width, r.height, false); camera.aspect = r.width / r.height; camera.updateProjectionMatrix(); for (const m of mats) m.resolution.set(r.width, r.height); };
  new ResizeObserver(size).observe(el);
  let visible = false, after = () => {};
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(el);
  const loop = () => { requestAnimationFrame(loop); if (!visible) return; controls.update(); renderer.render(scene, camera); after(camera, el); };
  loop();
  return { scene, camera, controls, mats, size, onFrame: (f) => { after = f; } };
}
const thick = (positions, colour, width, mats) => {
  const g = new LineSegmentsGeometry(); g.setPositions(positions);
  const m = new LineMaterial({ color: colour, linewidth: width }); mats.push(m);
  return new LineSegments2(g, m);
};

// ---- Figure 1: one pipe, labelled.
{
  const el = document.getElementById('fig-pipe');
  const S = stage(el, { fov: 32 });
  const [p] = layoutOrgan([{ stop: 'ymDiap8a', key: 48 }]);
  S.scene.add(thick(pipeSegments(p), 0xe9e7e1, 1.6, S.mats));
  const h = p.h, f = p.foot, r = p.w / 2, mh = p.w * STOPS[p.stop].jr * 0.9;
  S.controls.target.set(0, h * 0.45, 0);
  S.camera.position.set(-h * 2.4, h * 0.75, h * 1.0);
  S.size();
  const tags = [
    ['Body', [0, h * 0.7, r * 1.05], 1],
    ['Mouth and cut-up', [-r, f + mh, 0], 1],
    ['Languid', [-r * 0.6, f, 0], -1],
    ['Foot', [0, f * 0.5, r * 0.6], 1],
    ['Toe', [0, 0, 0], -1],
  ].map(([text, at, side]) => { const d = document.createElement('div'); d.className = 'tag'; d.textContent = text; d.style.translate = `${side * 50}% 0`; el.append(d); return { d, v: new THREE.Vector3(...at) }; });
  const q = new THREE.Vector3();
  S.onFrame((cam, box) => { const w = box.clientWidth, hh = box.clientHeight; for (const t of tags) { q.copy(t.v).project(cam); t.d.style.left = `${(q.x * 0.5 + 0.5) * w}px`; t.d.style.top = `${(-q.y * 0.5 + 0.5) * hh}px`; } });
}

// ---- Figure 4: the organ, every pipe.
{
  const el = document.getElementById('fig-organ');
  const S = stage(el, { fov: 30 });
  const ALL = [];
  for (const stop of STYLES.york.manual) for (let k = 36; k <= 93; k++) ALL.push({ stop, key: k });
  for (const stop of STYLES.york.pedal) for (let k = 36; k <= 67; k++) ALL.push({ stop, key: k, pedal: true });
  const pipes = layoutOrgan(ALL);
  const root = new THREE.Group(); S.scene.add(root);
  const org = organLines(root, pipes, pipes[0]);
  for (const q of pipes) org.setPipe(q, q.stop === 'ymDiap8a' ? 'voicing' : 'voiced');
  const box = new THREE.Box3().setFromObject(root), c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
  S.controls.target.copy(c);
  S.camera.position.set(c.x - sz.z * 1.7, c.y + sz.y * 0.25, c.z - sz.z * 0.45);
  S.size();
}

// ---- Figure 5: the plan of York Minster from the acoustic model.
{
  const el = document.getElementById('fig-plan');
  const m = build();
  const cv = document.createElement('canvas'); el.append(cv);
  const draw = () => {
    const r = el.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio);
    cv.width = r.width * dpr; cv.height = r.height * dpr;
    const g = cv.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, cv.width, cv.height);
    const s = Math.min(cv.width / (m.nx + 8), cv.height / (m.ny + 8)), ox = (cv.width - m.nx * s) / 2, oy = (cv.height - m.ny * s) / 2;
    let top = 0; for (const v of m.h) top = Math.max(top, v);
    for (let j = 0; j < m.ny; j++) for (let i = 0; i < m.nx; i++) {
      const hh = m.h[j * m.nx + i]; if (!hh) continue;
      const l = Math.round(40 + 200 * Math.sqrt(hh / top));
      g.fillStyle = `rgb(${l},${l - 2},${l - 6})`;
      g.fillRect(ox + i * s, oy + (m.ny - 1 - j) * s, Math.ceil(s), Math.ceil(s));
    }
    // The measured pair: source under the tower, listener in the nave.
    const at = (x, y) => [ox + (x / m.res) * s, oy + (m.ny - 1 - (y - m.y0) / m.res) * s];
    const src = [(75 + 89.5) / 2, 0], rec = [src[0] - 23.69, 0];
    g.strokeStyle = NEONC; g.lineWidth = 2 * dpr; g.setLineDash([4 * dpr, 4 * dpr]);
    g.beginPath(); g.moveTo(...at(...src)); g.lineTo(...at(...rec)); g.stroke(); g.setLineDash([]);
    g.fillStyle = NEONC;
    for (const p of [src, rec]) { const [x, y] = at(...p); g.beginPath(); g.arc(x, y, 5 * dpr, 0, 2 * Math.PI); g.fill(); }
    g.font = `${12 * dpr}px ui-monospace, Menlo, monospace`; g.fillStyle = INKC;
    const [sx, sy] = at(...src), [rx, ry] = at(...rec);
    const label = (t, x, y) => { const w = g.measureText(t).width; g.fillStyle = 'rgba(0,0,0,0.75)'; g.fillRect(x - 4 * dpr, y - 12 * dpr, w + 8 * dpr, 16 * dpr); g.fillStyle = INKC; g.fillText(t, x, y); };
    label('source', sx + 8 * dpr, sy - 10 * dpr); label('listener', rx - 40 * dpr, ry - 10 * dpr);
    g.fillStyle = DIM; g.fillText('west', ox, oy + m.ny * s + 4 * dpr); g.textAlign = 'end'; g.fillText('east', ox + m.nx * s, oy + m.ny * s + 4 * dpr);
  };
  new ResizeObserver(draw).observe(el);
}

// ---- Small line charts (hand-written SVG): one axis, recessive grid, a
// tooltip on hover, direct labels on the last point.
function lineChart(host, { title, x, series, y0, y1, unit, ticks, clip }) {
  const W = 320, H = 190, L = 40, R = 14, T = 12, B = 30;
  const wrap = document.createElement('div'); wrap.className = 'chart';
  wrap.innerHTML = `<h4>${title}</h4>`;
  const sx = (i) => L + (i * (W - L - R)) / (x.length - 1), sy = (v) => T + ((y1 - Math.max(y0, Math.min(y1, v))) * (H - T - B)) / (y1 - y0);
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${title}">`;
  for (const t of ticks) svg += `<line x1="${L}" x2="${W - R}" y1="${sy(t)}" y2="${sy(t)}" stroke="${GRID}" stroke-width="1"/><text x="${L - 6}" y="${sy(t) + 4}" fill="${DIM}" font-size="10" text-anchor="end" font-family="ui-monospace,Menlo,monospace">${t}${unit}</text>`;
  const every = Math.ceil(x.length / 7);
  x.forEach((lab, i) => { if (i % every === 0 || i === x.length - 1) svg += `<text x="${sx(i)}" y="${H - 10}" fill="${DIM}" font-size="10" text-anchor="middle" font-family="ui-monospace,Menlo,monospace">${lab}</text>`; });
  for (const s of series) {
    const d = s.values.map((v, i) => `${i ? 'L' : 'M'}${sx(i).toFixed(1)} ${sy(v).toFixed(1)}`).join('');
    svg += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" ${s.dash ? 'stroke-dasharray="5 4"' : ''}/>`;
    s.values.forEach((v, i) => { const off = clip && (v > y1 || v < y0); svg += `<circle cx="${sx(i)}" cy="${sy(v)}" r="4" fill="${s.hollow ? '#000' : s.color}" stroke="${s.hollow ? s.color : '#000'}" stroke-width="2"/>${off ? `<text x="${sx(i)}" y="${sy(v) + (v > y1 ? -8 : 14)}" fill="${DIM}" font-size="9" text-anchor="middle">${v > 0 ? '+' : ''}${Math.round(v)}</text>` : ''}`; });
  }
  // Hover: a column per x, with every series' value.
  svg += x.map((_, i) => `<rect data-i="${i}" x="${sx(i) - (W - L - R) / (x.length - 1) / 2}" y="${T}" width="${(W - L - R) / (x.length - 1)}" height="${H - T - B}" fill="transparent"/>`).join('');
  svg += '</svg>';
  wrap.insertAdjacentHTML('beforeend', svg + '<div class="tip"></div>');
  const tip = wrap.querySelector('.tip');
  wrap.querySelectorAll('rect[data-i]').forEach((rc) => {
    const show = () => { const i = +rc.dataset.i; tip.innerHTML = `${x[i]}<br>` + series.map((s) => `${s.name}: ${s.fmt ? s.fmt(s.values[i], i) : s.values[i]}`).join('<br>'); tip.style.opacity = 1; const b = rc.getBoundingClientRect(), w = wrap.getBoundingClientRect(); tip.style.left = `${Math.min(w.width - 150, b.left - w.left + b.width / 2 + 8)}px`; tip.style.top = '24px'; };
    rc.addEventListener('pointerenter', show); rc.addEventListener('pointerdown', show);
    rc.addEventListener('pointerleave', () => { tip.style.opacity = 0; });
  });
  host.append(wrap);
}

// ---- Figure 6 and its table: echo time, measured against the model.
{
  const BANDS = ['125', '250', '500', '1k', '2k', '4k'];
  // York: tools/room-ir.mjs and the OpenAIR York Minster IR. St Paul's: the
  // same against OpenAIR P1 (source under the dome, listener in the nave).
  const D = {
    york: { measured: [7.56, 8.19, 8.37, 7.74, 5.88, 3.54], before: [5.45, 7.06, 7.94, 8.54, 7.22, 3.82], after: [7.53, 8.22, 8.37, 7.68, 5.89, 3.58] },
    stpauls: { measured: [9.16, 10.31, 10.88, 9.13, 6.78, 4.06], before: [9.78, 11.47, 11.23, 10.35, 7.67, 3.97], after: [9.2, 10.4, 10.98, 9.13, 6.74, 4.02] },
  };
  const host = document.getElementById('fig-t30');
  const sec = (v) => `${v.toFixed(2)} s`;
  for (const [room, name] of [['york', 'York Minster'], ['stpauls', "St Paul's"]]) for (const [k, when] of [['before', 'before tuning'], ['after', 'after tuning']]) {
    const d = D[room];
    lineChart(host, {
      title: `${name}, ${when}`, x: BANDS.map((b) => `${b} Hz`), y0: 0, y1: 12, unit: 's', ticks: [0, 4, 8, 12],
      series: [
        { name: 'measured', values: d.measured, color: INKC, dash: true, hollow: true, fmt: sec },
        { name: 'model', values: d[k], color: NEONC, fmt: (v, i) => `${sec(v)} (${v >= d.measured[i] ? '+' : ''}${Math.round((100 * (v - d.measured[i])) / d.measured[i])}%)` },
      ],
    });
  }
  const t = document.getElementById('t30-table');
  t.innerHTML = `<thead><tr><th>Band</th><th>York measured</th><th>before</th><th>after</th><th>St Paul's measured</th><th>before</th><th>after</th></tr></thead><tbody>${BANDS.map((b, i) => `<tr><td>${b} Hz</td>${['york', 'stpauls'].map((r) => ['measured', 'before', 'after'].map((k) => `<td>${D[r][k][i].toFixed(2)}</td>`).join('')).join('')}</tr>`).join('')}</tbody>`;
}

// ---- Figure 3: a pipe voiced live, with its measurements.
{
  const host = document.getElementById('fig-voicing'), play = document.getElementById('fig-voicing-play');
  const run = () => {
    const v = voicePipe(48000, STOPS.ymDiap8a, 63, { keepAudio: true });
    const st = v.steps.filter((s) => s.action !== 'steady' && s.action !== 'unsteady');
    const x = st.map((_, i) => `${i + 1}`);
    const act = (val, i) => `${val} · ${st[i].action}`;
    lineChart(host, { title: 'Pitch error', x, y0: -150, y1: 150, unit: '¢', ticks: [-150, 0, 150], clip: true, series: [{ name: 'cents', values: st.map((s) => s.cents ?? 1200), color: NEONC, fmt: (val, i) => act(`${val > 0 ? '+' : ''}${val.toFixed(1)}`, i) }] });
    lineChart(host, { title: 'Level against target', x, y0: -6, y1: 6, unit: 'dB', ticks: [-6, 0, 6], clip: true, series: [{ name: 'dB', values: st.map((s) => s.level), color: NEONC, fmt: (val, i) => act(val.toFixed(1), i) }] });
    lineChart(host, { title: 'Tone (centroid, harmonics)', x, y0: 0, y1: 8, unit: '', ticks: [0, 4, 8], series: [{ name: 'tone', values: st.map((s) => s.bright), color: NEONC, fmt: (val, i) => act(val.toFixed(2), i) }] });
    let ctx = null;
    highlights(v.steps.filter((s) => s.audio), 7).forEach((s, i, all) => {
      const b = document.createElement('button');
      b.textContent = i === 0 ? 'As made' : i === all.length - 1 ? 'In tune' : s.action[0].toUpperCase() + s.action.slice(1);
      b.onclick = () => {
        ctx ??= new AudioContext({ sampleRate: 48000 });
        const buf = new AudioBuffer({ length: s.audio.length, sampleRate: 48000 }); buf.copyToChannel(s.audio, 0);
        const src = new AudioBufferSourceNode(ctx, { buffer: buf }), g = new GainNode(ctx, { gain: 3 });
        src.connect(g).connect(ctx.destination); src.start();
        for (const o of play.children) o.classList.toggle('on', o === b);
      };
      play.append(b);
    });
  };
  // Voice it when the figure comes near the screen, so the page loads quickly.
  const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { io.disconnect(); setTimeout(run, 50); } }, { rootMargin: '400px' });
  io.observe(host);
}
