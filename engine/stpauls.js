// St Paul's Cathedral, London, as a plan of cells (the same model as
// minster.js: each cell is open air from `f` to `h`; h = 0 is solid).
//
// Sources: interior length 479 ft (146 m); width across nave and aisles
// 102 ft (31 m), between the piers 41 ft (12.5 m); central aisle 89 ft
// (27.1 m) high; across the transepts 250 ft (76 m); octagon at the crossing
// 107 ft (32.6 m); drum 112 ft (34 m) across, Whispering Gallery cornice at
// 30 m, drum cornice at 53 m, inner dome to 65 m (Official Guide via
// Dovaston; Wikipedia; Foteinou et al. 2025, Acoustics 7(3) 49). Volume
// 152,000 m3 (Lewers & Anderson 1984). Nave 223 ft (68 m), choir 167 ft (51 m).
// Where no source gives a number (aisle height, pier sizes, bay lengths, the
// organ cases) the value is an estimate and marked "est".
//
// Axes, metres: x west -> east (0 = inside of the west wall), y south -> north
// (0 = centre line), z up.

export const RES = 0.5;

export const MATERIALS = {
  limestone: [0.02, 0.02, 0.03, 0.04, 0.05, 0.05], // Portland stone (0.03 measured below 2 kHz, Lewers & Anderson)
  floor: [0.01, 0.01, 0.015, 0.02, 0.02, 0.02], // marble
  dome: [0.02, 0.02, 0.03, 0.03, 0.04, 0.05], // painted brick and plaster
  glass: [0.35, 0.25, 0.18, 0.12, 0.07, 0.04],
  stalls: [0.12, 0.13, 0.13, 0.12, 0.12, 0.12], // carved oak choir stalls (Grinling Gibbons)
  chairs: [0.06, 0.08, 0.1, 0.1, 0.1, 0.1], // empty wooden chairs, est
  organCase: [0.12, 0.1, 0.08, 0.07, 0.07, 0.07],
};

const NAVE_W = 12.5, half = NAVE_W / 2;
const outer = 15.5; // nave plus aisles, 31 m
export const X = {
  naveEnd: 66, // the nave to the dome piers, est from 68 m with the west wall
  crossC: 82.3, // centre of the dome
  crossEnd: 98.6, // octagon 32.6 m
  choirEnd: 140, // choir to the apse, est
  apseEnd: 146, // apse, interior length 146 m
};
export const H = {
  nave: 27.1, aisle: 13.5, // aisle est
  gallery: 30, drum: 53, apex: 65, // Whispering Gallery, drum cornice, inner dome
  transept: 27.1, choir: 27.1,
};
export const DOME_R = 17; // drum, 34 m across
export const TRANSEPT = { reach: 38 };
// The Grand Organ (Willis 1872, rebuilt by Mander): its cases stand north and
// south over the west end of the choir stalls, facing each other across the
// choir (est positions and sizes from photographs).
export const ORGAN = { x0: 100.5, x1: 110.5, y: 5.2, depth: 1.6, z0: 6.5, top: 17 };

export function build() {
  const nx = Math.round(150 / RES), ny = Math.round(80 / RES);
  const y0 = -40;
  const f = new Float32Array(nx * ny);
  const h = new Float32Array(nx * ny);
  const ceil = new Uint8Array(nx * ny);
  const flo = new Uint8Array(nx * ny);
  const zone = new Uint8Array(nx * ny); // 1 nave, 2 aisle, 3 dome, 4 transept, 5 choir
  const names = Object.keys(MATERIALS);
  const M = Object.fromEntries(names.map((n, i) => [n, i]));
  const at = (i, j) => j * nx + i;
  const each = (xa, xb, ya, yb, fn) => {
    for (let i = Math.max(0, Math.floor(xa / RES)); i < Math.min(nx, Math.ceil(xb / RES)); i++)
      for (let j = Math.max(0, Math.floor((ya - y0) / RES)); j < Math.min(ny, Math.ceil((yb - y0) / RES)); j++)
        fn(at(i, j), (i + 0.5) * RES, y0 + (j + 0.5) * RES);
  };
  const rect = (xa, xb, ya, yb, hh, mat, z, fl = 0, fmat = 'floor') => each(xa, xb, ya, yb, (k) => { h[k] = hh; f[k] = fl; ceil[k] = M[mat]; flo[k] = M[fmat]; zone[k] = z; });
  const solid = (xa, xb, ya, yb) => rect(xa, xb, ya, yb, 0, 'limestone', 0);

  // Aisles, then the central vessels over them.
  rect(0, X.naveEnd, -outer, outer, H.aisle, 'limestone', 2);
  rect(X.crossEnd, X.choirEnd, -outer, outer, H.aisle, 'limestone', 2);
  rect(X.crossC - outer, X.crossC + outer, -TRANSEPT.reach, TRANSEPT.reach, H.aisle, 'limestone', 4);
  rect(X.crossC - half, X.crossC + half, -TRANSEPT.reach, TRANSEPT.reach, H.transept, 'limestone', 4, 0, 'floor');
  rect(0, X.naveEnd, -half, half, H.nave, 'limestone', 1, 0, 'chairs');
  rect(X.crossEnd, X.choirEnd, -half, half, H.choir, 'limestone', 5);
  // Apse: a half circle on the choir's width.
  each(X.choirEnd, X.apseEnd, -half, half, (k, x, y) => { if (Math.hypot(x - X.choirEnd, y) <= half) { h[k] = H.choir; f[k] = 0; ceil[k] = M.limestone; flo[k] = M.floor; zone[k] = 5; } });
  // The octagon under the dome: the drum and dome over a circle, the
  // pendentives (up to the Whispering Gallery) in the corners.
  const r8 = X.crossEnd - X.crossC; // 16.3, half the octagon across the flats
  each(X.crossC - r8, X.crossEnd, -r8, r8, (k, x, y) => {
    const dx = Math.abs(x - X.crossC), dy = Math.abs(y);
    if (Math.max(dx, dy, (dx + dy) / Math.SQRT2) > r8) return;
    const r = Math.hypot(dx, dy);
    h[k] = r < DOME_R ? H.drum + (H.apex - H.drum) * Math.sqrt(Math.max(0, 1 - (r / DOME_R) ** 2)) : H.gallery;
    f[k] = 0; ceil[k] = M.dome; flo[k] = M.chairs; zone[k] = 3;
  });
  // Choir stalls, both sides of the choir's west half.
  rect(X.crossEnd + 1, 124, -half, -half + 3, H.choir, 'limestone', 5, 0, 'stalls');
  rect(X.crossEnd + 1, 124, half - 3, half, H.choir, 'limestone', 5, 0, 'stalls');
  // The eight dome piers: masses in the four corners of the crossing, outside
  // the octagon (est 6 m across each way).
  each(X.crossC - r8 - 1.5, X.crossC + r8 + 1.5, -r8 - 1.5, r8 + 1.5, (k, x, y) => {
    const dx = Math.abs(x - X.crossC), dy = Math.abs(y);
    if (dx > half + 1 && dy > half + 1 && Math.max(dx, dy, (dx + dy) / Math.SQRT2) > r8 && dx < r8 + 1.5 && dy < r8 + 1.5) { h[k] = 0; zone[k] = 0; }
  });
  // Arcade piers: nave and choir three bays each, est 3.2 x 2.6 m with pilasters.
  for (const xp of [X.naveEnd - 16, X.naveEnd - 32, X.naveEnd - 48]) for (const s of [-1, 1]) solid(xp - 1.6, xp + 1.6, s > 0 ? half : -half - 2.6, s > 0 ? half + 2.6 : -half);
  for (const xp of [X.crossEnd + 14, X.crossEnd + 28]) for (const s of [-1, 1]) solid(xp - 1.6, xp + 1.6, s > 0 ? half : -half - 2.6, s > 0 ? half + 2.6 : -half);
  // Transept arcade: one pier each side of each arm, est.
  for (const s of [-1, 1]) for (const sx of [-1, 1]) solid(X.crossC + sx * half - (sx > 0 ? 0 : 2.6), X.crossC + sx * half + (sx > 0 ? 2.6 : 0), s * 27 - 1.6, s * 27 + 1.6);
  // Organ cases: solid wood from their floor to their top, over the stalls.
  for (const s of [-1, 1]) rect(ORGAN.x0, ORGAN.x1, s > 0 ? ORGAN.y : -ORGAN.y - ORGAN.depth, s > 0 ? ORGAN.y + ORGAN.depth : -ORGAN.y, H.choir, 'limestone', 5, ORGAN.top, 'organCase');
  return { nx, ny, x0: 0, y0, res: RES, f, h, ceil, flo, zone, materials: names.map((n) => MATERIALS[n]), M, glassShare };
}

// Glass share of a wall at height z: aisle windows, the clerestory, and the
// windows of the drum (in threes between the pilasters).
export function glassShare(x, z, clerestory, outerWall) {
  if (Math.abs(x - X.crossC) < DOME_R + 1 && z > H.gallery + 2) return 0.3;
  if (outerWall) return z > 4 && z < 12 ? 0.35 : 0.02;
  if (clerestory) return 0.45;
  return 0;
}

// Calibration against the OpenAIR St Paul's IR P1 (tools/room-ir.mjs,
// 150k rays). Uncalibrated, T30 was within 2-13 % in every band; with this,
// within 1 %. EDT runs 8-26 % long. C80 at 2-4 kHz is about 8 dB under the
// measurement, which used a directional speaker aimed at the microphone.
export const CALIB = [1.07, 1.10, 1.02, 1.17, 1.25, 0.96];

// Where each part of the organ speaks from: the C side in the north case,
// the C♯ side in the south case, the pedal low in the cases (est).
export function organSource(e, feet) {
  const side = e.key % 2 === 0 ? 1 : -1;
  const y = side * (ORGAN.y + 0.4);
  if (e.pedal) return { id: `pedal${side > 0 ? 'C' : 'Cs'}`, pos: [108, y, 8] };
  return feet < 4 ? { id: `upper${side > 0 ? 'C' : 'Cs'}`, pos: [104, y, 14.5] } : { id: `great${side > 0 ? 'C' : 'Cs'}`, pos: [105, y, 11.5] };
}
export const ORGAN_SOURCES = ['greatC', 'greatCs', 'upperC', 'upperCs', 'pedalC', 'pedalCs'];

// The 2022 measurement (Foteinou et al.): source under the dome apex, 1.62 m
// high; receiver on the nave's centre aisle 31.64 m away, 1.40 m high.
export const MEASURED = { file: 'ref/st-pauls/P1-dome-nave.wav', src: [X.crossC, 0, 1.62], rec: [X.crossC - 31.64, 0, 1.4] };
