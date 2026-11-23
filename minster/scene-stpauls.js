// St Paul's Cathedral in line art, built from the same numbers as the acoustic
// model (engine/stpauls.js): nave and choir of three bays with saucer domes,
// the octagon of eight arches, the Whispering Gallery, the drum with its
// windows in threes, the inner dome with its oculus, the apse, the stalls
// and the two organ cases. Classical, not Gothic: round arches, pilasters,
// an entablature, coffered arches.
//
// Lines are emitted directly in cathedral coordinates (x east, y north, z up)
// and batched with the same machinery as York (minster/lineart.js), so the
// return shape matches createScene(..., { lineArt: true }).
//
// Heights the sources give: nave 27.1, Whispering Gallery 30, drum cornice
// 53, inner dome 65, drum 34 m across, octagon 32.6 m. Everything else is an
// estimate from photographs and drawings and is marked "est".
import * as THREE from 'three';
import { X, H, DOME_R, TRANSEPT, ORGAN } from '../engine/stpauls.js';
import { P, item, floorGrid, bucketLines, bloomComposer, revealLines, lineRenderer, makeLines } from './lineart.js';

export { P };

const NAVE_W = 12.5, half = NAVE_W / 2, outer = 15.5; // stpauls.js
const PIER_D = 2.6, PIER_W = 3.2; // arcade piers, est (stpauls.js)
const back = half + PIER_D; // aisle face of the arcade
const R8 = X.crossEnd - X.crossC; // octagon, half across the flats (16.3)
const RV = R8 / Math.cos(Math.PI / 8); // octagon, centre to corner

// Elevation of the main vessels (est): arcade arches up to the aisle
// vault, giant Corinthian pilasters, an entablature, an attic, transverse
// arches, and a saucer dome over each bay up to the nave height.
const ARC_TOP = 13.2; // arcade arch crowns, just under the aisle (13.5, est)
const CAP0 = 15.5, ENT0 = 16.8, ENT1 = 18.6, SPRING = 19.6; // est
const TA_APEX = 25.85; // transverse arches, semicircular on the nave width
const CROWN = H.nave; // saucer crowns, 27.1
const AISLE_SPRING = 9.5; // aisle transverse arches, est

export function createStPaulsScene(canvas, { width, height, organCase = true, exterior = true } = {}) {
  const { renderer, scene, camera, root } = lineRenderer(canvas, width, height);

  // ---- Line builder: polylines in cathedral metres, flushed into items.
  const items = [];
  const extItems = [];
  let cur = [];
  const v = (p) => P(p[0], p[1], p[2]);
  const seg = (a, b) => { const A = v(a), B = v(b); cur.push(A.x, A.y, A.z, B.x, B.y, B.z); };
  const poly = (pts, closed = false) => { for (let i = 0; i < pts.length - 1; i++) seg(pts[i], pts[i + 1]); if (closed) seg(pts[pts.length - 1], pts[0]); };
  const emit = (alpha = 0.5, glass = false, to = items) => { if (cur.length) to.push(item(cur, alpha, glass)); cur = []; };
  const box = (p0, p1, m = (p) => p) => {
    const [x0, y0, z0] = p0, [x1, y1, z1] = p1;
    const c = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    for (let i = 0; i < 4; i++) { const [a, b] = c[i], [d, e] = c[(i + 1) % 4]; seg(m([a, b, z0]), m([d, e, z0])); seg(m([a, b, z1]), m([d, e, z1])); seg(m([a, b, z0]), m([a, b, z1])); }
  };
  const ring = (cx, cy, r, z, n = 96, a0 = 0, a1 = Math.PI * 2) => {
    const pts = []; for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a), z]); }
    poly(pts);
  };
  // A round-headed outline in a local (u, z) plane: jambs from z0 to the
  // spring, a semicircle (or a half ellipse with `rise`) over width w.
  const roundHead = (w, z0, zs, { rise = w / 2, n = 16, closed = false, arcOnly = false } = {}) => {
    const r = w / 2, pts = arcOnly ? [] : [[-r, z0]];
    for (let i = 0; i <= n; i++) { const a = Math.PI - (Math.PI * i) / n; pts.push([r * Math.cos(a), zs + rise * Math.sin(a)]); }
    if (!arcOnly) pts.push([r, z0]);
    if (closed) pts.push([-r, z0]);
    return pts;
  };

  // ---- A main vessel (nave, choir, a transept arm): an arcade each side,
  // aisles, transverse arches and saucer domes. `map(a, c, z)` turns local
  // (along, across, up) into cathedral coordinates; `sup` are the pier
  // centres along the vessel, the first and last being walls or dome piers.
  function vessel(map, sup, { transverse = [], endPilasters = false } = {}) {
    const a0 = sup[0], a1 = sup[sup.length - 1];
    for (const s of [-1, 1]) {
      const cf = s * half, cb = s * back, co = s * outer, ca = s * (back + outer) / 2;
      for (let i = 0; i < sup.length - 1; i++) {
        const A = sup[i], B = sup[i + 1];
        const o0 = A + PIER_W / 2, o1 = B - PIER_W / 2, w = o1 - o0, mid = (o0 + o1) / 2;
        const zs = ARC_TOP - w / 2;
        // Arcade arch: the nave face, the aisle face, the archivolt.
        const arch = roundHead(w, 0, zs, { n: 20 });
        poly(arch.map(([u, z]) => map(mid + u, cf, z)));
        emit(0.55);
        poly(arch.map(([u, z]) => map(mid + u, cb, z)));
        for (const [u, z] of [arch[0], arch[1], arch[11], arch[21], arch[22]]) seg(map(mid + u, cf, z), map(mid + u, cb, z));
        emit(0.28);
        poly(roundHead(w + 1.4, 0, zs, { n: 20, arcOnly: true }).map(([u, z]) => map(mid + u, cf - s * 0.05, z)));
        poly([map(o0 - 0.7, cf, zs), map(o0, cf, zs)]); poly([map(o1, cf, zs), map(o1 + 0.7, cf, zs)]); // imposts
        emit(0.32);
        // Lunette over the entablature, with its clerestory window.
        const lw = B - A - 1.6;
        poly(roundHead(lw, SPRING, SPRING, { rise: TA_APEX - SPRING - 0.3, n: 24, arcOnly: true }).map(([u, z]) => map((A + B) / 2 + u, cf, z)));
        emit(0.38);
        poly(roundHead(4.2, SPRING + 0.6, SPRING + 2.4, { closed: true }).map(([u, z]) => map((A + B) / 2 + u, cf, z)));
        emit(0.5, true);
        // Aisle: outer wall window, the aisle's saucer dome.
        poly(roundHead(3.2, 4, 10, { closed: true }).map(([u, z]) => map((A + B) / 2 + u, co, z)));
        emit(0.42, true);
        const ea = (B - A) / 2 - 1.0, ec = (outer - back) / 2 - 0.1;
        const el = (k, z) => { const pts = []; for (let j = 0; j <= 48; j++) { const t = (j / 48) * Math.PI * 2; pts.push(map((A + B) / 2 + ea * k * Math.cos(t), ca + ec * k * Math.sin(t), z)); } return pts; };
        poly(el(1, ARC_TOP - 0.4)); poly(el(0.35, H.aisle));
        emit(0.24);
        // Main saucer dome over the bay, on pendentives (est rise).
        saucer(map, A, B);
      }
      // Pilasters on the nave face of every pier; plain strips on the aisle wall.
      const inner = endPilasters ? sup : sup.slice(1, -1);
      for (const a of inner) {
        const m = (p) => map(p[0], p[1], p[2]);
        const pw = 1.1, pr = s * 0.35;
        box([a - pw, cf, 1.2], [a + pw, cf - pr, CAP0], m);
        box([a - pw - 0.2, cf, 0], [a + pw + 0.2, cf - pr - s * 0.15, 1.2], m);
        box([a - pw - 0.25, cf, CAP0], [a + pw + 0.25, cf - pr - s * 0.2, ENT0], m);
        seg(m([a - pw - 0.1, cf - pr - s * 0.15, CAP0 + 0.55]), m([a + pw + 0.1, cf - pr - s * 0.15, CAP0 + 0.55])); // the capital's leaf row
        emit(0.46);
        seg(map(a - 0.7, co, 0), map(a - 0.7, co, AISLE_SPRING)); seg(map(a + 0.7, co, 0), map(a + 0.7, co, AISLE_SPRING));
        emit(0.22);
      }
      // Aisle transverse arches, at every pier and at both ends.
      for (const a of sup) for (const d of [-0.6, 0.6]) {
        if ((a === a0 && d < 0) || (a === a1 && d > 0)) continue;
        poly(roundHead(outer - back, AISLE_SPRING, AISLE_SPRING, { arcOnly: true, n: 12 }).map(([u, z]) => map(a + d, ca + s * u, z)));
      }
      emit(0.24);
      // Entablature: architrave, frieze, cornice, running the whole length.
      for (const [z, d] of [[ENT0, 0.45], [ENT0 + 0.7, 0.45], [ENT0 + 1.25, 0.55], [ENT1, 0.95], [SPRING, 0.2]]) seg(map(a0, cf - s * d, z), map(a1, cf - s * d, z));
      emit(0.42);
      // Aisle outer wall: base, impost course, top.
      for (const z of [0, AISLE_SPRING, H.aisle]) seg(map(a0, co, z), map(a1, co, z));
      emit(0.2);
    }
    // Transverse arches, coffered: two faces and the coffer ribs between.
    for (const a of transverse) {
      const arc = roundHead(NAVE_W, SPRING, SPRING, { arcOnly: true, n: 24 });
      for (const d of [-0.8, 0.8]) poly(arc.map(([u, z]) => map(a + d, u, z)));
      for (let k = 2; k < 24; k += 2) seg(map(a - 0.8, arc[k][0], arc[k][1]), map(a + 0.8, arc[k][0], arc[k][1]));
      emit(0.45);
    }
  }

  // A saucer dome over the bay A..B of a vessel: the ring where it meets the
  // transverse arches, two rings and eight meridians up to its crown, and
  // the pendentives curving up from the corners (est rise 1.25 m).
  function saucer(map, A, B) {
    const xc = (A + B) / 2, ea = (B - A) / 2 - 0.8, eb = half;
    const at = (k, t) => { const rise = CROWN - TA_APEX; return map(xc + ea * k * Math.cos(t), eb * k * Math.sin(t), TA_APEX + rise * (1 - k * k)); };
    for (const k of [1, 0.62, 0.22]) { const pts = []; for (let j = 0; j <= 64; j++) pts.push(at(k, (j / 64) * Math.PI * 2)); poly(pts); }
    for (let m = 0; m < 8; m++) { const t = (m / 8) * Math.PI * 2 + Math.PI / 8, pts = []; for (let j = 0; j <= 10; j++) pts.push(at(1 - (0.78 * j) / 10, t)); poly(pts); }
    emit(0.34);
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const c0 = [xc + sx * ((B - A) / 2 - 0.8), sy * half], t = Math.atan2(sy, sx), e = [xc + ea * Math.cos(t), eb * Math.sin(t)];
      const pts = [];
      for (let j = 0; j <= 10; j++) { const u = j / 10, h = Math.sin((u * Math.PI) / 2); pts.push(map(c0[0] + (e[0] - c0[0]) * u * u, c0[1] + (e[1] - c0[1]) * u * u, SPRING + (TA_APEX - SPRING) * h)); }
      poly(pts);
    }
    emit(0.26);
  }

  // A flat end wall across a vessel at `a` (west front, transept ends):
  // the great door, a round window over it, the lunette window, aisle windows.
  function endWall(map, a) {
    const at = (u, z) => map(a, u, z);
    poly(roundHead(5, 0, 7, { n: 16 }).map(([u, z]) => at(u, z)));
    emit(0.5);
    const rose = []; for (let j = 0; j <= 40; j++) { const t = (j / 40) * Math.PI * 2; rose.push(at(2.3 * Math.cos(t), 12.6 + 2.3 * Math.sin(t))); } poly(rose);
    poly(roundHead(4.2, SPRING + 0.6, SPRING + 2.4, { closed: true }).map(([u, z]) => at(u, z)));
    for (const s of [-1, 1]) poly(roundHead(2.6, 4, 9.2, { closed: true }).map(([u, z]) => at(s * (back + outer) / 2 + u, z)));
    emit(0.5, true);
    for (const z of [ENT0, ENT0 + 1.25, ENT1]) seg(at(-half, z), at(half, z));
    for (const s of [-1, 1]) for (const z of [0, AISLE_SPRING, H.aisle]) seg(at(s * back, z), at(s * outer, z));
    for (const s of [-1, 1]) for (const u of [3.6, 4.8]) seg(at(s * u, 1.2), at(s * u, ENT0));
    emit(0.4);
    poly(roundHead(NAVE_W, SPRING, SPRING, { arcOnly: true, n: 24 }).map(([u, z]) => at(u, z)));
    emit(0.4);
  }

  // ---- Nave: three bays plus the west bay, est piers at 18, 34, 50.
  const nave = (a, c, z) => [a, c, z];
  vessel(nave, [0, X.naveEnd - 48, X.naveEnd - 32, X.naveEnd - 16, X.naveEnd], { transverse: [X.naveEnd - 48, X.naveEnd - 32, X.naveEnd - 16] });
  endWall(nave, 0);

  // ---- Choir: three bays to the apse.
  const choir = (a, c, z) => [a, c, z];
  vessel(choir, [X.crossEnd, X.crossEnd + 14, X.crossEnd + 28, X.choirEnd], { transverse: [X.crossEnd + 14, X.crossEnd + 28, X.choirEnd] });
  // Choir aisles end in a wall at the apse.
  for (const s of [-1, 1]) {
    poly([[X.choirEnd, s * back, 0], [X.choirEnd, s * outer, 0], [X.choirEnd, s * outer, H.aisle], [X.choirEnd, s * back, H.aisle]]);
    poly(roundHead(2.6, 4, 9.2, { closed: true }).map(([u, z]) => [X.choirEnd, s * (back + outer) / 2 + u, z]));
  }
  emit(0.3);

  // ---- Transepts: two bays each, one pier at 27 m (stpauls.js), the end
  // walls at TRANSEPT.reach.
  for (const s of [-1, 1]) {
    const tr = (a, c, z) => [X.crossC + s * c, s * a, z];
    vessel(tr, [R8, 27, TRANSEPT.reach], { transverse: [27, TRANSEPT.reach] });
    endWall(tr, TRANSEPT.reach);
  }

  // ---- Apse: a half circle on the choir's width, a half dome (conch).
  {
    const ax = X.choirEnd, R = half; // reaches 146.25; stpauls.js gives 146
    for (const [z, rr] of [[0, R], [1.2, R], [ENT0, R - 0.45], [ENT0 + 1.25, R - 0.55], [ENT1, R - 0.95], [SPRING, R]]) ring(ax, 0, rr, z, 32, -Math.PI / 2, Math.PI / 2);
    emit(0.42);
    for (const t of [-1.18, -0.39, 0.39, 1.18]) { // pilasters (est)
      for (const d of [-0.55, 0.55]) { const tt = t + d / R; seg([ax + R * Math.cos(tt), R * Math.sin(tt), 1.2], [ax + R * Math.cos(tt), R * Math.sin(tt), ENT0]); }
    }
    emit(0.4);
    for (const t of [-0.785, 0, 0.785]) {
      const c = [ax + R * Math.cos(t), R * Math.sin(t)], tg = [-Math.sin(t), Math.cos(t)];
      poly(roundHead(2.4, 4.5, 11.5, { closed: true }).map(([u, z]) => [c[0] + tg[0] * u, c[1] + tg[1] * u, z]));
    }
    emit(0.5, true);
    // Conch: meridians and two half rings, coffered (est).
    for (let k = 0; k <= 8; k++) { const t = -Math.PI / 2 + (k / 8) * Math.PI, pts = []; for (let j = 0; j <= 12; j++) { const b = (j / 12) * (Math.PI / 2); pts.push([ax + R * Math.cos(b) * Math.cos(t), R * Math.cos(b) * Math.sin(t), SPRING + R * Math.sin(b)]); } poly(pts); }
    for (const b of [0.45, 0.9, 1.25]) ring(ax, 0, R * Math.cos(b), SPRING + R * Math.sin(b), 32, -Math.PI / 2, Math.PI / 2);
    emit(0.36);
    // The baldacchino over the high altar (1958): four twisted columns, an
    // entablature and a small dome (est sizes).
    const bx = X.choirEnd - 3;
    for (const sx of [-1.8, 1.8]) for (const sy of [-2.8, 2.8]) {
      box([bx + sx - 0.5, sy - 0.5, 0], [bx + sx + 0.5, sy + 0.5, 1.6]);
      for (const ph of [0, Math.PI]) { const pts = []; for (let j = 0; j <= 48; j++) { const u = j / 48, a = ph + u * Math.PI * 2 * 3; pts.push([bx + sx + 0.35 * Math.cos(a), sy + 0.35 * Math.sin(a), 1.6 + u * 8]); } poly(pts); }
    }
    box([bx - 2.5, -3.5, 9.6], [bx + 2.5, 3.5, 10.8]);
    box([bx - 2.8, -3.8, 10.8], [bx + 2.8, 3.8, 11.2]);
    for (let k = 0; k < 8; k++) { const t = (k / 8) * Math.PI * 2, pts = []; for (let j = 0; j <= 8; j++) { const b = (j / 8) * (Math.PI / 2); pts.push([bx + 2.4 * Math.cos(b) * Math.cos(t), 2.4 * Math.cos(b) * Math.sin(t), 11.2 + 3 * Math.sin(b)]); } poly(pts); }
    ring(bx, 0, 2.4, 11.2, 32);
    seg([bx, 0, 14.2], [bx, 0, 15.6]); seg([bx, -0.35, 15.1], [bx, 0.35, 15.1]);
    emit(0.42);
  }

  // ---- The octagon: eight faces round the dome, the four wide arches to
  // nave, choir and transepts, the four narrower diagonal ones.
  {
    const C = [X.crossC, 0];
    const half8 = R8 * Math.tan(Math.PI / 8); // 6.75
    for (let k = 0; k < 8; k++) {
      const phi = (k * Math.PI) / 4, n = [Math.cos(phi), Math.sin(phi)], t = [-Math.sin(phi), Math.cos(phi)];
      const at = (u, z, d = 0) => [C[0] + (R8 + d) * n[0] + u * t[0], C[1] + (R8 + d) * n[1] + u * t[1], z];
      const axis = k % 2 === 0;
      if (axis) {
        // Main arch, 11.5 m (est; the arm is 12.5), coffered soffit 2.5 m deep (est).
        const arch = roundHead(11.5, 0, SPRING, { n: 24 });
        poly(arch.map(([u, z]) => at(u, z))); poly(arch.map(([u, z]) => at(u, z, 2.5)));
        emit(0.55);
        for (let j = 2; j < 25; j += 2) seg(at(arch[j][0], arch[j][1]), at(arch[j][0], arch[j][1], 2.5));
        poly(roundHead(13, 0, SPRING, { n: 24, arcOnly: true }).map(([u, z]) => at(u, z, -0.05)));
        emit(0.42);
      } else {
        // Diagonal face: a low arch into the corner chapel, pilasters,
        // the entablature, a blind arch with a gallery opening (est).
        const low = roundHead(6.5, 0, 8.5, { n: 16 });
        poly(low.map(([u, z]) => at(u, z))); poly(low.map(([u, z]) => at(u, z, 2.5)));
        poly(roundHead(7.7, 0, 8.5, { n: 16, arcOnly: true }).map(([u, z]) => at(u, z, -0.05)));
        emit(0.5);
        for (const sgn of [-1, 1]) {
          const m = (p) => at(p[0], p[2], p[1]);
          box([sgn * 3.9, 0, 1.2], [sgn * 5.3, -0.35, CAP0], m);
          box([sgn * 3.9 - 0.25, 0, CAP0], [sgn * 5.3 + 0.25, -0.55, ENT0], m);
          box([sgn * 3.9 - 0.2, 0, 0], [sgn * 5.3 + 0.2, -0.5, 1.2], m);
        }
        for (const [z, d] of [[ENT0, -0.45], [ENT0 + 0.7, -0.45], [ENT0 + 1.25, -0.55], [ENT1, -0.95]]) seg(at(-half8, z, d), at(half8, z, d));
        poly(roundHead(11.5, SPRING, SPRING, { n: 24, arcOnly: true }).map(([u, z]) => at(u, z)));
        poly(roundHead(13, SPRING, SPRING, { n: 24, arcOnly: true }).map(([u, z]) => at(u, z, -0.05)));
        poly(roundHead(4, SPRING + 0.4, SPRING + 2.4, { closed: true }).map(([u, z]) => at(u, z)));
        emit(0.44);
      }
      // The corner (a dome pier) and its pendentive up to the gallery.
      const va = phi + Math.PI / 8, pts = [];
      pts.push([C[0] + RV * Math.cos(va), RV * Math.sin(va), 0]);
      for (let j = 0; j <= 10; j++) { const u = j / 10, r = RV + (DOME_R + 0.3 - RV) * u * u; pts.push([C[0] + r * Math.cos(va), r * Math.sin(va), SPRING + (H.gallery - 0.8 - SPRING) * u]); }
      poly(pts);
      emit(0.45);
    }

    // ---- The Whispering Gallery: cornice, the gallery floor, its railing.
    const cx = X.crossC;
    ring(cx, 0, DOME_R + 0.3, H.gallery - 0.8); ring(cx, 0, DOME_R + 0.8, H.gallery - 0.1);
    ring(cx, 0, DOME_R - 0.2, H.gallery); ring(cx, 0, DOME_R - 0.2, H.gallery + 1.1);
    emit(0.5);
    for (let k = 0; k < 96; k++) { const a = (k / 96) * Math.PI * 2; seg([cx + (DOME_R - 0.2) * Math.cos(a), (DOME_R - 0.2) * Math.sin(a), H.gallery], [cx + (DOME_R - 0.2) * Math.cos(a), (DOME_R - 0.2) * Math.sin(a), H.gallery + 1.1]); }
    emit(0.24);

    // ---- The drum, 34 m across, from the gallery to the cornice at 53:
    // eight bays over the eight faces, three windows in each, single
    // pilasters between the windows and paired ones between the bays.
    const R = DOME_R;
    const D0 = H.gallery + 1.6, DCAP = 45.6, DENT = 46.8, DENT1 = 48.6; // est
    for (const [z, r] of [[D0, R + 0.25], [DCAP, R - 0.1], [DENT, R - 0.25], [DENT + 0.9, R - 0.25], [DENT1, R - 0.7], [51, R], [H.drum, R - 0.3]]) ring(cx, 0, r, z, 128);
    emit(0.5);
    const at = (a, z, r = R) => [cx + r * Math.cos(a), r * Math.sin(a), z];
    const pil = (a, w) => { for (const d of [-w / 2, w / 2]) seg(at(a + d / R, D0), at(a + d / R, DENT)); };
    for (let b = 0; b < 8; b++) {
      const c = (b * Math.PI) / 4;
      for (const off of [-1.4, 1.4]) pil(c + Math.PI / 8 + off / R, 0.9); // paired, over the corners
      for (const off of [-0.5, 0.5]) pil(c + (off * 2 * Math.PI) / 4 / 4, 0.7); // singles between the windows
    }
    emit(0.4);
    for (let b = 0; b < 8; b++) for (const w of [-1, 0, 1]) {
      const c = (b * Math.PI) / 4 + (w * Math.PI) / 4 / 3;
      poly(roundHead(2.2, 35, 41, { closed: true, n: 12 }).map(([u, z]) => at(c + u / R, z, R - 0.05)));
    }
    emit(0.5, true);

    // ---- Inner dome: from the cornice at 53 to 65, a half ellipse on the
    // drum (stpauls.js), the oculus at the top (est 3 m radius). Thornhill's
    // eight painted scenes are framed by paired ribs over the corners.
    const RB = R - 0.3, rise = H.apex - H.drum, OC = 3;
    const aOc = Math.acos(OC / RB);
    const dome = (az, al) => [cx + RB * Math.cos(al) * Math.cos(az), RB * Math.cos(al) * Math.sin(az), H.drum + rise * Math.sin(al)];
    const meridian = (az) => { const pts = []; for (let j = 0; j <= 24; j++) pts.push(dome(az, (j / 24) * aOc)); poly(pts); };
    for (let b = 0; b < 8; b++) { const c = (b * Math.PI) / 4 + Math.PI / 8; meridian(c - 0.035); meridian(c + 0.035); }
    emit(0.6);
    for (let b = 0; b < 8; b++) for (const o of [-1, 0, 1]) meridian((b * Math.PI) / 4 + (o * Math.PI) / 16);
    emit(0.3);
    for (const al of [0.32, 0.72, 1.08]) { const pts = []; for (let j = 0; j <= 128; j++) pts.push(dome((j / 128) * Math.PI * 2, al)); poly(pts); }
    emit(0.45);
    const zo = H.drum + rise * Math.sin(aOc);
    ring(cx, 0, OC, zo, 48); ring(cx, 0, OC + 0.5, zo - 0.1, 48);
    emit(0.6);
    // Through the oculus: the lantern's light well (est).
    ring(cx, 0, 2.6, zo + 4, 32); ring(cx, 0, 2.6, zo + 7, 32);
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; seg([cx + 2.6 * Math.cos(a), 2.6 * Math.sin(a), zo], [cx + 2.6 * Math.cos(a), 2.6 * Math.sin(a), zo + 7]); }
    emit(0.3);

    // ---- The floor under the dome: the marble compass (est pattern).
    for (const r of [2.2, 6.5, 10.8, 15]) ring(cx, 0, r, 0.02, 96);
    for (let k = 0; k < 32; k++) { const a = (k / 32) * Math.PI * 2, r0 = k % 4 === 0 ? 2.2 : 6.5; seg([cx + r0 * Math.cos(a), r0 * Math.sin(a), 0.02], [cx + 15 * Math.cos(a), 15 * Math.sin(a), 0.02]); }
    emit(0.12);

    // ---- Outside (optional): Wren's brick cone, the outer dome on its
    // peristyle, the lantern, ball and cross to 111 m. All est from
    // published sections, except the cross height.
    if (exterior) {
      const E = (fn, a) => { fn(); emit(a, false, extItems); };
      E(() => { for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; seg([cx + 17.6 * Math.cos(a), 17.6 * Math.sin(a), H.drum], [cx + 4.2 * Math.cos(a), 4.2 * Math.sin(a), 85]); } ring(cx, 0, 4.2, 85, 32); }, 0.12);
      E(() => { for (const [z, r] of [[39.5, 24.5], [40.6, 24.5], [52, 24.5], [53.5, 25], [55, 24.6]]) ring(cx, 0, r, z, 128); for (let k = 0; k < 32; k++) { const a = (k / 32) * Math.PI * 2; seg([cx + 24.2 * Math.cos(a), 24.2 * Math.sin(a), 40.6], [cx + 24.2 * Math.cos(a), 24.2 * Math.sin(a), 52]); } }, 0.32);
      E(() => { for (const [z, r] of [[55, 20.5], [62, 20.5], [66.5, 20.8]]) ring(cx, 0, r, z, 128); for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; seg([cx + 20.5 * Math.cos(a), 20.5 * Math.sin(a), 55], [cx + 20.5 * Math.cos(a), 20.5 * Math.sin(a), 66.5]); } }, 0.3);
      const OR = 20.2, oz = 66.5, orise = 18.5; // outer dome
      const od = (az, al) => [cx + OR * Math.cos(al) * Math.cos(az), OR * Math.cos(al) * Math.sin(az), oz + orise * Math.sin(al)];
      const oTop = Math.acos(4.6 / OR);
      E(() => { for (let k = 0; k < 32; k++) { const az = (k / 32) * Math.PI * 2, pts = []; for (let j = 0; j <= 24; j++) pts.push(od(az, (j / 24) * oTop)); poly(pts); } }, 0.34);
      E(() => { for (const al of [0, 0.5, 0.95]) { const pts = []; for (let j = 0; j <= 128; j++) pts.push(od((j / 128) * Math.PI * 2, al)); poly(pts); } }, 0.4);
      const gz = oz + orise * Math.sin(oTop); // Golden Gallery
      E(() => {
        ring(cx, 0, 5.2, gz, 48); ring(cx, 0, 5.2, gz + 1, 48);
        ring(cx, 0, 3.4, gz + 1, 32); ring(cx, 0, 3.4, gz + 11, 32); ring(cx, 0, 3.9, gz + 11.8, 32);
        for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2 + Math.PI / 8; seg([cx + 3.4 * Math.cos(a), 3.4 * Math.sin(a), gz + 1], [cx + 3.4 * Math.cos(a), 3.4 * Math.sin(a), gz + 11]); }
        for (let k = 0; k < 8; k++) { const az = (k / 8) * Math.PI * 2, pts = []; for (let j = 0; j <= 10; j++) { const b = (j / 10) * (Math.PI / 2); pts.push([cx + 3.2 * Math.cos(b) * Math.cos(az), 3.2 * Math.cos(b) * Math.sin(az), gz + 11.8 + 4 * Math.sin(b)]); } poly(pts); }
        ring(cx, 0, 1.0, 106, 24); ring(cx, 0, 0.7, 106.7, 24); ring(cx, 0, 0.7, 105.3, 24);
        seg([cx, 0, gz + 15.8], [cx, 0, 105]); seg([cx, 0, 107], [cx, 0, 111]); seg([cx, -1.1, 109.6], [cx, 1.1, 109.6]);
      }, 0.5);
    }
  }

  // ---- Choir stalls along the choir's west half (Grinling Gibbons), est.
  for (const s of [-1, 1]) {
    const x0 = X.crossEnd + 1, x1 = 124;
    box([x0, s * (half - 3), 0], [x1, s * (half - 2.4), 1.05]);
    box([x0, s * (half - 1.4), 0], [x1, s * (half - 0.9), 1.15]);
    for (const z of [0.95, 4.2]) seg([x0, s * (half - 0.3), z], [x1, s * (half - 0.3), z]);
    box([x0 - 0.2, s * (half - 1.3), 4.2], [x1 + 0.2, s * (half - 0.3), 4.8]);
    for (let x = x0; x <= x1 + 0.01; x += (x1 - x0) / 20) seg([x, s * (half - 0.3), 0.95], [x, s * (half - 0.3), 4.2]);
    emit(0.36);
  }

  // ---- The two organ cases over the west end of the stalls (est profile:
  // three towers, flats between, a cornice; the pipes are drawn by the app).
  if (organCase) {
    for (const s of [-1, 1]) {
      const yf = s * ORGAN.y, yb = s * (ORGAN.y + ORGAN.depth);
      const m = (p) => p;
      box([ORGAN.x0 - 0.2, yf + s * -0.2, ORGAN.z0], [ORGAN.x1 + 0.2, yb, ORGAN.z0 + 1.1], m);
      const towers = [[ORGAN.x0, ORGAN.x0 + 1.9], [(ORGAN.x0 + ORGAN.x1) / 2 - 0.95, (ORGAN.x0 + ORGAN.x1) / 2 + 0.95], [ORGAN.x1 - 1.9, ORGAN.x1]];
      for (const [a, b] of towers) {
        box([a, yf - s * 0.35, ORGAN.z0 + 1.1], [b, yb, ORGAN.top - 0.8], m);
        box([a - 0.15, yf - s * 0.5, ORGAN.top - 0.8], [b + 0.15, yb, ORGAN.top], m);
      }
      for (let i = 0; i < 2; i++) {
        const a = towers[i][1], b = towers[i + 1][0];
        seg([a, yf, ORGAN.top - 2.4], [b, yf, ORGAN.top - 2.4]); seg([a, yf - s * 0.2, ORGAN.top - 1.9], [b, yf - s * 0.2, ORGAN.top - 1.9]);
      }
      emit(0.4);
    }
  }

  // ---- Floor: the flags, over the plan.
  items.push(floorGrid([[0, X.choirEnd, -outer, outer], [X.crossC - outer, X.crossC + outer, -TRANSEPT.reach, -outer], [X.crossC - outer, X.crossC + outer, outer, TRANSEPT.reach]], 3, 0.08));

  const lines = bucketLines(root, items, 40);
  // The outside of the dome draws last (rank 1), in its own batches.
  const ext = [];
  if (extItems.length) {
    extItems.sort((p, q) => p.order - q.order);
    for (let k = 0; k < 3; k++) {
      const L = makeLines(extItems.slice(Math.floor((k * extItems.length) / 3), Math.floor(((k + 1) * extItems.length) / 3)));
      L.userData.rank = 0.92 + k * 0.03; L.userData.alpha = 1; L.userData.exterior = true;
      root.add(L); lines.push(L); ext.push(L);
    }
  }

  const composer = bloomComposer(renderer, scene, camera, width, height);
  return {
    renderer, scene, camera, composer, root, lines,
    reveal(u) { revealLines(lines, u); },
    // Show or hide the outer dome, cone and lantern (inside shots look
    // cleaner without them). Sets alpha, so any reveal() respects it.
    setExterior(on) { for (const L of ext) L.userData.alpha = on ? 1 : 0; },
    setCamera(pos, target) { camera.position.copy(P(...pos)); camera.lookAt(P(...target)); },
    setPipes() {},
    render() { composer.render(); },
  };
}
