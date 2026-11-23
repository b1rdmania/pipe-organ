// York Minster as a plan of cells. Each cell is open air from `f` (floor) to
// `h` (ceiling); h = 0 is solid (a pier, a wall, outside). The same model feeds
// the acoustic tracer and the 3D picture.
//
// Sources: total length 159.9 m outside (Structurae, Bigland 1815); nave
// 103 ft (31.4 m) wide inside and about 29-30 m high with a wooden vault;
// pier arches 51 ft (15.5 m) (Willis 1848); transepts 95 ft (29 m) wide with
// clerestory 18 ft lower than the nave; choir 31 m high; central tower 72 m
// outside; nave 8 bays, choir 9 bays; crossing about the central vessel's width.
// Where no source gives a number (lantern vault height, aisle vault height,
// pier sizes) the value is an estimate and marked "est".
//
// Axes, metres: x west -> east (0 = inside of the west wall), y south -> north
// (0 = centre line), z up.

export const RES = 0.5; // cell size, metres

// Absorption coefficients by octave band 125 Hz .. 4 kHz (standard tables).
export const MATERIALS = {
  limestone: [0.02, 0.02, 0.03, 0.04, 0.05, 0.05],
  floor: [0.01, 0.01, 0.015, 0.02, 0.02, 0.02], // stone flags
  woodVault: [0.15, 0.11, 0.1, 0.07, 0.06, 0.07], // boarded vault on timber ribs
  glass: [0.35, 0.25, 0.18, 0.12, 0.07, 0.04], // large leaded windows
  stalls: [0.12, 0.13, 0.13, 0.12, 0.12, 0.12], // carved oak choir stalls
  organCase: [0.12, 0.1, 0.08, 0.07, 0.07, 0.07],
};

const NAVE_W = 14.5; // central vessel, est from 103 ft total less aisles
const AISLE = 8.5; // est, so the total is 31.5 m
const half = NAVE_W / 2;
const outer = half + AISLE;
export const X = {
  naveEnd: 75, // 8 bays of about 9.4 m
  crossEnd: 89.5, // square crossing
  choirEnd: 148, // inside of the east wall
};
export const H = {
  nave: 29.5, naveAisle: 14, // aisle vault est
  lantern: 55, // est: lantern vault, tower 72 m outside
  transept: 24, transeptAisle: 12.5,
  choir: 31, choirAisle: 14,
};
export const TRANSEPT = { west: 67.75, east: 96.75, reach: 33 }; // 29 m wide; 66 m north-south inside
export const SCREEN = { x0: 89.5, x1: 92, top: 7.5 }; // pulpitum (choir screen), est height
export const ORGAN = { x0: 89.6, x1: 91.9, y0: -4.5, y1: 4.5, top: 16 }; // case on the screen, est

export function build() {
  const nx = Math.round(152 / RES), ny = Math.round(70 / RES);
  const y0 = -35;
  const f = new Float32Array(nx * ny);
  const h = new Float32Array(nx * ny);
  const ceil = new Uint8Array(nx * ny); // material index of the ceiling
  const flo = new Uint8Array(nx * ny); // material index of the floor
  const zone = new Uint8Array(nx * ny); // for the picture: 1 nave, 2 aisle, 3 crossing, 4 transept, 5 choir
  const names = Object.keys(MATERIALS);
  const M = Object.fromEntries(names.map((n, i) => [n, i]));
  const at = (i, j) => j * nx + i;
  const rect = (xa, xb, ya, yb, hh, mat, z, fl = 0, fmat = 'floor') => {
    for (let i = Math.max(0, Math.floor(xa / RES)); i < Math.min(nx, Math.ceil(xb / RES)); i++)
      for (let j = Math.max(0, Math.floor((ya - y0) / RES)); j < Math.min(ny, Math.ceil((yb - y0) / RES)); j++) {
        const k = at(i, j);
        h[k] = hh; f[k] = fl; ceil[k] = M[mat]; flo[k] = M[fmat]; zone[k] = z;
      }
  };
  // Aisles first, then the taller vessels over them.
  rect(0, X.naveEnd, -outer, outer, H.naveAisle, 'limestone', 2);
  rect(X.crossEnd, X.choirEnd, -outer, outer, H.choirAisle, 'limestone', 2);
  rect(TRANSEPT.west, TRANSEPT.east, -TRANSEPT.reach, TRANSEPT.reach, H.transeptAisle, 'limestone', 4);
  rect(X.naveEnd, X.crossEnd, -TRANSEPT.reach, TRANSEPT.reach, H.transept, 'woodVault', 4);
  rect(0, X.naveEnd, -half, half, H.nave, 'woodVault', 1);
  rect(X.crossEnd, X.choirEnd, -half, half, H.choir, 'woodVault', 5);
  rect(X.naveEnd, X.crossEnd, -half, half, H.lantern, 'woodVault', 3);
  // Choir stalls along the quire, west part of the choir.
  rect(SCREEN.x1, 118, -half, -half + 2.5, H.choir, 'woodVault', 5, 0, 'stalls');
  rect(SCREEN.x1, 118, half - 2.5, half, H.choir, 'woodVault', 5, 0, 'stalls');
  // Piers: arcade piers every bay, 1.6 x 2.2 m est. Crossing piers 4 m est.
  const solid = (xa, xb, ya, yb) => rect(xa, xb, ya, yb, 0, 'limestone', 0);
  const bay = X.naveEnd / 8;
  for (let b = 1; b < 8; b++) for (const s of [-1, 1]) solid(b * bay - 1.1, b * bay + 1.1, s * half - (s > 0 ? 0 : 1.6), s * half + (s > 0 ? 1.6 : 0));
  const cb = (X.choirEnd - X.crossEnd) / 9;
  for (let b = 1; b < 9; b++) for (const s of [-1, 1]) solid(X.crossEnd + b * cb - 1.0, X.crossEnd + b * cb + 1.0, s * half - (s > 0 ? 0 : 1.6), s * half + (s > 0 ? 1.6 : 0));
  for (const xc of [X.naveEnd, X.crossEnd]) for (const s of [-1, 1]) solid(xc - 2, xc + 2, s * half - 2, s * half + 2);
  // Transept arcade piers (one row each side of the central vessel, three bays out).
  for (const xp of [X.naveEnd, X.crossEnd]) for (const s of [-1, 1]) for (let b = 1; b <= 2; b++) solid(xp - 0.9, xp + 0.9, s * (outer + b * 8.4) - 0.9, s * (outer + b * 8.4) + 0.9);
  // Pulpitum: solid stone to its top; the organ case stands on it.
  rect(SCREEN.x0, SCREEN.x1, -half, half, H.lantern, 'woodVault', 3, SCREEN.top, 'limestone');
  rect(ORGAN.x0, ORGAN.x1, ORGAN.y0, ORGAN.y1, H.lantern, 'woodVault', 3, ORGAN.top, 'organCase');
  return { nx, ny, x0: 0, y0, res: RES, f, h, ceil, flo, zone, materials: names.map((n) => MATERIALS[n]), M };
}

// Glass share of a wall at height z. Outer walls hold windows above the dado;
// a wall above a lower roof (a clerestory) is mostly glass. Great West and East
// windows fill most of the end walls.
export function glassShare(x, z, clerestory, outerWall) {
  if (outerWall) {
    if (x < 1 && z > 8) return 0.6; // Great West Window
    if (x > X.choirEnd - 1 && z > 4) return 0.75; // Great East Window
    return z > 4 && z < 13 ? 0.55 : 0.05;
  }
  if (clerestory) return 0.65;
  return 0;
}

// Calibration against the OpenAIR York Minster IR (tools/minster-ir.mjs,
// 200k rays, 4 rounds): one factor per band on all absorption. With it, T30
// is within 1 % in every band; EDT within 8 % up to 1 kHz, 16-25 % long at
// 2-4 kHz (the model has too little high-frequency scattering).
export const CALIB = [0.71, 0.84, 0.93, 1.12, 1.37, 1.22];

// Where each part of the organ speaks from, on the pulpitum (metres; est from
// photographs of the case: Great in the main case, upper work above it,
// pedal at the sides). C side to the north (+y), C♯ side to the south.
export function organSource(e, feet) {
  const side = e.key % 2 === 0 ? 1 : -1;
  const x = 90.75;
  if (e.pedal) return { id: `pedal${side > 0 ? 'C' : 'Cs'}`, pos: [x, side * 4.2, 8.6] };
  return feet < 4 ? { id: `upper${side > 0 ? 'C' : 'Cs'}`, pos: [x, side * 2.2, 12.8] } : { id: `great${side > 0 ? 'C' : 'Cs'}`, pos: [x, side * 2.6, 10.2] };
}
export const ORGAN_SOURCES = ['greatC', 'greatCs', 'upperC', 'upperCs', 'pedalC', 'pedalCs'];
