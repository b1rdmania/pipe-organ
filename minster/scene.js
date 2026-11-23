// York Minster in Three.js, built from the same numbers as the acoustic model
// (engine/minster.js). Gothic detail is generated: clustered piers, pointed
// arcades, clerestory and aisle windows, ribbed vaults, the screen and organ.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { X, H, TRANSEPT, SCREEN, ORGAN } from '../engine/minster.js';

const NAVE_W = 14.5, AISLE = 8.5, half = NAVE_W / 2, outer = half + AISLE;
// Minster axes (x east, y north, z up) to Three (x east, y up, z south).
export const P = (x, y, z) => new THREE.Vector3(x, z, -y);

export function createScene(canvas, { width, height, organPipes = [], lineArt = false, organCase: drawCase = true }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.62;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05050a);
  scene.fog = new THREE.FogExp2(0x0d0b10, 0.011);
  const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 600);

  // ---- Materials
  const stoneTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#cdbfa6'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${90 + Math.random() * 60},${80 + Math.random() * 50},${60 + Math.random() * 40},${Math.random() * 0.06})`; g.fillRect(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 6, 2 + Math.random() * 6); }
    g.strokeStyle = 'rgba(70,60,45,0.25)'; g.lineWidth = 1.2;
    for (let y = 0; y <= 256; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); for (let x = (y / 32) % 2 ? 0 : 32; x < 256; x += 64) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 32); g.stroke(); } }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const floorTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { const v = 120 + ((i + j) % 2) * 14 + Math.random() * 10; g.fillStyle = `rgb(${v},${v - 8},${v - 22})`; g.fillRect(i * 64, j * 64, 64, 64); }
    g.strokeStyle = 'rgba(40,35,30,0.5)'; for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, 256); g.moveTo(0, i * 64); g.lineTo(256, i * 64); g.stroke(); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.repeat.set(80, 36); return t;
  })();
  const stone = new THREE.MeshStandardMaterial({ color: 0xffffff, map: stoneTex, roughness: 0.92, metalness: 0 });
  stone.map.repeat.set(0.25, 0.25);
  const stoneDark = new THREE.MeshStandardMaterial({ color: 0xa99d88, roughness: 0.95 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x8d7a60, roughness: 0.85 }); // painted to look like stone
  const caseWood = new THREE.MeshStandardMaterial({ color: 0x3a2418, roughness: 0.6 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xb38b3c, roughness: 0.35, metalness: 0.8 });
  const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.6 });

  // Stained glass: a procedural leaded-glass texture, emissive (daylight behind).
  const glassTex = (seed, cols) => {
    const c = document.createElement('canvas'); c.width = 128; c.height = 256;
    const g = c.getContext('2d');
    let s = seed; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    g.fillStyle = '#111'; g.fillRect(0, 0, 128, 256);
    for (let y = 0; y < 256; y += 16) for (let x = 0; x < 128; x += 16) {
      const col = cols[Math.floor(r() * cols.length)];
      g.fillStyle = col; g.globalAlpha = 0.6 + r() * 0.4; g.fillRect(x + 1.5, y + 1.5, 13, 13);
    }
    g.globalAlpha = 1; g.strokeStyle = '#0a0a0a'; g.lineWidth = 3;
    for (let y = 0; y < 256; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(128, y); g.stroke(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
  };
  const rich = ['#8a1f2a', '#1d3f8f', '#2e6b3a', '#c99a2e', '#6b2a7a', '#b8432a', '#2a5f8f'];
  const grisaille = ['#9fa7a0', '#b8bdb2', '#8f9893', '#a9b1aa', '#c6c9bd', '#7f8a85'];
  const glassMat = (seed, cols, intensity = 1.6) => new THREE.MeshStandardMaterial({ map: glassTex(seed, cols), emissive: 0xffffff, emissiveMap: glassTex(seed, cols), emissiveIntensity: intensity, roughness: 1, side: THREE.DoubleSide });

  const root = new THREE.Group(); scene.add(root);
  const add = (geo, mat, cast = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true; root.add(m); return m; };

  // ---- Shapes
  // Equilateral-ish pointed arch outline, base at y=0, width w, spring height sh, apex ah.
  const pointed = (w, sh, ah, x0 = 0, steps = 16) => {
    const pts = [[x0, 0], [x0, sh]];
    const r = w * 0.8; // radius of each arc: >w/2 gives a pointed arch
    const cxL = x0 + r, cxR = x0 + w - r;
    const rise = ah - sh;
    for (let i = 1; i <= steps; i++) { const a = (i / steps); const ang = Math.PI - a * Math.acos((cxL - (x0 + w / 2)) / r); pts.push([cxL + r * Math.cos(ang), sh + (r * Math.sin(ang)) * (rise / Math.sqrt(r * r - (r - w / 2) ** 2))]); }
    for (let i = steps - 1; i >= 0; i--) { const a = (i / steps); const ang = a * Math.acos((x0 + w / 2 - cxR) / r); pts.push([cxR + r * Math.cos(ang), sh + (r * Math.sin(ang)) * (rise / Math.sqrt(r * r - (r - w / 2) ** 2))]); }
    pts.push([x0 + w, 0]);
    return pts;
  };
  const toPath = (pts, cls = THREE.Path) => { const p = new cls(); p.moveTo(pts[0][0], pts[0][1]); for (const q of pts.slice(1)) p.lineTo(q[0], q[1]); return p; };

  // A wall in the x-z plane (Minster coords) from x0..x1, height h, at y = yw,
  // thickness t, with pointed openings [{x, w, z0, sh, ah, glass}].
  function wall(x0, x1, h, yw, t, openings = [], mat = stone) {
    const s = new THREE.Shape(); s.moveTo(x0, 0); s.lineTo(x1, 0); s.lineTo(x1, h); s.lineTo(x0, h); s.lineTo(x0, 0);
    for (const o of openings) {
      const pts = pointed(o.w, o.sh, o.ah, o.x - o.w / 2).map(([a, b]) => [a, b + o.z0]);
      s.holes.push(toPath(pts));
      if (o.glass) {
        const gs = toPath(pts, THREE.Shape);
        const gm = new THREE.Mesh(new THREE.ShapeGeometry(gs), o.glass);
        const uv = gm.geometry.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) - (o.x - o.w / 2)) / o.w, (uv.getY(i) - o.z0) / (o.ah) * (o.ah / o.w / 2));
        gm.rotation.x = 0; gm.position.set(0, 0, -yw + (yw > 0 ? -t * 0.3 : t * 0.3) * 0);
        const grp = new THREE.Group(); grp.add(gm); grp.position.z = 0; root.add(grp);
        gm.position.z = -yw;
      }
    }
    const geo = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false, curveSegments: 6 });
    geo.translate(0, 0, -t / 2);
    const m = add(geo, mat);
    m.position.z = -yw;
    return m;
  }
  // Same, but a wall across the building (y-z plane) at x = xw, from y0..y1.
  function crossWall(y0, y1, h, xw, t, openings = [], mat = stone) {
    const g = new THREE.Group();
    const s = new THREE.Shape(); s.moveTo(y0, 0); s.lineTo(y1, 0); s.lineTo(y1, h); s.lineTo(y0, h); s.lineTo(y0, 0);
    for (const o of openings) {
      const pts = (o.round ? circle(o.x, o.z0 + o.r, o.r) : pointed(o.w, o.sh, o.ah, o.x - o.w / 2).map(([a, b]) => [a, b + o.z0]));
      s.holes.push(toPath(pts));
      if (o.glass) {
        const gm = new THREE.Mesh(new THREE.ShapeGeometry(toPath(pts, THREE.Shape)), o.glass);
        const uv = gm.geometry.attributes.uv; const w = o.w || o.r * 2;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) - (o.x - w / 2)) / w, (uv.getY(i) - o.z0) / w * 0.5);
        g.add(gm);
      }
    }
    const geo = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false, curveSegments: 8 });
    geo.translate(0, 0, -t / 2);
    const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = true; g.add(m);
    // Shape is in (y, z); rotate so its x axis runs along -Three z (north).
    g.rotation.y = Math.PI / 2; g.position.x = xw;
    g.scale.x = 1; root.add(g);
    return g;
  }
  const circle = (cx, cy, r, n = 40) => Array.from({ length: n }, (_, i) => [cx + r * Math.cos((i / n) * Math.PI * 2), cy + r * Math.sin((i / n) * Math.PI * 2)]);

  // Clustered pier: core plus eight shafts, with a moulded capital.
  function pier(x, y, h, r = 0.8) {
    const g = new THREE.Group();
    const core = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.05, h, 16), stone); core.position.y = h / 2; g.add(core);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2, rr = i % 2 ? r * 0.28 : r * 0.36;
      const sh = new THREE.Mesh(new THREE.CylinderGeometry(rr, rr, h, 10), stone);
      sh.position.set(Math.cos(a) * r * 0.95, h / 2, Math.sin(a) * r * 0.95); g.add(sh);
    }
    const base = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.6, r * 1.75, 0.9, 16), stoneDark); base.position.y = 0.45; g.add(base);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.55, r * 1.25, 0.8, 16), stoneDark); cap.position.y = h - 0.4; g.add(cap);
    g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    g.position.copy(P(x, y, 0)); root.add(g); return g;
  }

  // Pointed barrel vault over a vessel (along x), springing at sh, apex at ah,
  // with a transverse rib each bay and diagonal ribs.
  function vault(x0, x1, yc, w, sh, ah, bays, mat) {
    const pts = pointed(w, 0.01, ah - sh, -w / 2, 18).slice(1, -1).map(([a, b]) => new THREE.Vector2(a, b));
    // Build as a ribbon swept along x.
    const n = pts.length, L = x1 - x0;
    const pos = [], idx = [];
    for (let i = 0; i < n; i++) for (const xx of [x0, x1]) pos.push(xx, sh + pts[i].y, -(yc + pts[i].x));
    for (let i = 0; i < n - 1; i++) { const a = i * 2, b = a + 1, c = a + 2, d = a + 3; idx.push(a, c, b, b, c, d); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    const m = add(geo, new THREE.MeshStandardMaterial({ color: mat === wood ? 0x9a8a70 : 0xb9ad96, roughness: 0.9, side: THREE.DoubleSide }), false);
    // Ribs
    const ribMat = mat === wood ? new THREE.MeshStandardMaterial({ color: 0x7a6a52, roughness: 0.7 }) : stoneDark;
    const curve = (xx, skew = 0) => new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(xx + skew * (p.x / (w / 2)), sh + p.y, -(yc + p.x))));
    const bay = L / bays;
    for (let b = 0; b <= bays; b++) add(new THREE.TubeGeometry(curve(x0 + b * bay), 40, 0.22, 6), ribMat, false);
    for (let b = 0; b < bays; b++) {
      add(new THREE.TubeGeometry(curve(x0 + (b + 0.5) * bay, bay / 2), 40, 0.15, 6), ribMat, false);
      add(new THREE.TubeGeometry(curve(x0 + (b + 0.5) * bay, -bay / 2), 40, 0.15, 6), ribMat, false);
      // Boss at the crown
      const boss = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), gold); boss.position.copy(P(x0 + (b + 0.5) * bay, yc, ah - 0.3)); root.add(boss);
    }
    // Ridge rib
    add(new THREE.CylinderGeometry(0.15, 0.15, L, 6).rotateZ(Math.PI / 2).translate((x0 + x1) / 2, ah - 0.05, -yc), ribMat, false);
    return m;
  }

  // ---- Floor
  const floor = add(new THREE.PlaneGeometry(160, 72).rotateX(-Math.PI / 2).translate(76, 0, 0), floorMat, false);

  // ---- Nave: arcades (pier arches 15.5 m), clerestory above the aisle roof.
  const naveBays = 8, bayN = X.naveEnd / naveBays;
  const clere = (i, glass) => ({ x: (i + 0.5) * bayN, w: bayN * 0.62, z0: H.naveAisle + 3.2, sh: 6.5, ah: 11.5, glass });
  for (const s of [-1, 1]) {
    const op = [];
    for (let i = 0; i < naveBays; i++) op.push({ x: (i + 0.5) * bayN, w: bayN - 2.4, z0: 0, sh: 10.5, ah: 15.5 });
    for (let i = 0; i < naveBays; i++) op.push(clere(i, glassMat(11 + i * 7 + (s > 0 ? 3 : 0), rich, 1.4)));
    wall(0, X.naveEnd - 2, H.nave - 7.5, s * half, 1.4, op);
    for (let i = 1; i < naveBays; i++) pier(i * bayN, s * half, 15.5 - 4.5 + 0.2, 0.85);
    // Aisle outer wall with windows.
    const ow = [];
    for (let i = 0; i < naveBays; i++) ow.push({ x: (i + 0.5) * bayN, w: bayN * 0.6, z0: 3.5, sh: 5.5, ah: 9.6, glass: glassMat(101 + i * 13 + (s > 0 ? 5 : 0), rich, 1.2) });
    wall(0, X.naveEnd, H.naveAisle, s * outer, 1.6, ow);
    vault(0, X.naveEnd, s * (half + AISLE / 2), AISLE, H.naveAisle - 4.5, H.naveAisle, naveBays, stone);
  }
  vault(0, X.naveEnd, 0, NAVE_W + 0.6, H.nave - 7.5, H.nave, naveBays, wood);
  // West wall with the Great West Window (the "Heart of Yorkshire").
  crossWall(-outer, outer, H.nave, 0, 2.2, [
    { x: 0, w: 10.5, z0: 9, sh: 10, ah: 18.5, glass: glassMat(7, rich, 2.0) },
    { x: -half - AISLE / 2, w: 4, z0: 4, sh: 5, ah: 8, glass: glassMat(8, rich, 1.2) },
    { x: half + AISLE / 2, w: 4, z0: 4, sh: 5, ah: 8, glass: glassMat(9, rich, 1.2) },
  ]);

  // ---- Crossing and lantern tower.
  for (const xc of [X.naveEnd, X.crossEnd]) for (const s of [-1, 1]) pier(xc, s * half, H.transept - 1, 2.0);
  for (const s of [-1, 1]) wall(X.naveEnd, X.crossEnd, H.lantern, s * half, 1.4, [0, 1, 2].map((i) => ({ x: X.naveEnd + 2.8 + i * 4.45, w: 3.2, z0: 32, sh: 11, ah: 17, glass: glassMat(300 + i + s, grisaille, 1.8) })).concat([{ x: (X.naveEnd + X.crossEnd) / 2, w: 12, z0: 0, sh: 16, ah: H.transept - 1 }]));
  crossWall(-half, half, H.lantern, X.naveEnd, 1.4, [{ x: 0, w: 12, z0: 0, sh: 20, ah: H.nave - 1 }, ...[0, 1, 2].map((i) => ({ x: -4.5 + i * 4.5, w: 3.2, z0: 32, sh: 11, ah: 17, glass: glassMat(310 + i, grisaille, 1.8) }))]);
  crossWall(-half, half, H.lantern, X.crossEnd, 1.4, [{ x: 0, w: 12, z0: 0, sh: 22, ah: H.choir - 1 }, ...[0, 1, 2].map((i) => ({ x: -4.5 + i * 4.5, w: 3.2, z0: 32, sh: 11, ah: 17, glass: glassMat(320 + i, grisaille, 1.8) }))]);
  vault(X.naveEnd, X.crossEnd, 0, NAVE_W, H.lantern - 6, H.lantern, 1, wood);

  // ---- Transepts: Five Sisters (north), rose window (south).
  for (const s of [-1, 1]) {
    const y0 = s * half, y1 = s * TRANSEPT.reach;
    for (const xw of [X.naveEnd, X.crossEnd]) {
      const g = new THREE.Group();
      // side walls of the transept arms, along y
      const len = Math.abs(y1 - y0);
      const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(len, 0); sh.lineTo(len, H.transept); sh.lineTo(0, H.transept); sh.lineTo(0, 0);
      for (let i = 0; i < 3; i++) sh.holes.push(toPath(pointed(5, 9, 13.5, 1.5 + i * 8.7).map(([a, b]) => [a, b])));
      const geo = new THREE.ExtrudeGeometry(sh, { depth: 1.2, bevelEnabled: false }); geo.translate(0, 0, -0.6);
      const m = new THREE.Mesh(geo, stone); m.castShadow = m.receiveShadow = true; g.add(m);
      g.rotation.y = s > 0 ? Math.PI / 2 : -Math.PI / 2; g.position.set(xw, 0, -y0); root.add(g);
    }
    for (const xw of [TRANSEPT.west, TRANSEPT.east]) {
      const g = new THREE.Group();
      const len = Math.abs(y1) - outer;
      const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(len, 0); sh.lineTo(len, H.transeptAisle); sh.lineTo(0, H.transeptAisle); sh.lineTo(0, 0);
      const geo = new THREE.ExtrudeGeometry(sh, { depth: 1.4, bevelEnabled: false });
      const m = new THREE.Mesh(geo, stone); m.castShadow = m.receiveShadow = true; g.add(m);
      g.rotation.y = s > 0 ? Math.PI / 2 : -Math.PI / 2; g.position.set(xw, 0, -s * outer); root.add(g);
    }
    // End wall
    const endOps = s > 0
      ? [0, 1, 2, 3, 4].map((i) => ({ x: (TRANSEPT.west + TRANSEPT.east) / 2 + (i - 2) * 3.2, w: 1.6, z0: 3.5, sh: 15, ah: 16.3, glass: glassMat(500 + i, grisaille, 1.7) })) // Five Sisters, 16.3 m tall
      : [{ round: true, x: (TRANSEPT.west + TRANSEPT.east) / 2, z0: 12, r: 5.2, glass: glassMat(600, rich, 2.0) }, ...[0, 1, 2, 3].map((i) => ({ x: (TRANSEPT.west + TRANSEPT.east) / 2 + (i - 1.5) * 3.4, w: 1.8, z0: 3.5, sh: 5, ah: 7.5, glass: glassMat(610 + i, rich, 1.4) }))];
    const g = new THREE.Group();
    const w = TRANSEPT.east - TRANSEPT.west;
    const sh = new THREE.Shape(); sh.moveTo(TRANSEPT.west, 0); sh.lineTo(TRANSEPT.east, 0); sh.lineTo(TRANSEPT.east, H.transeptAisle); sh.lineTo(X.crossEnd, H.transeptAisle); sh.lineTo(X.crossEnd, H.transept); sh.lineTo(X.naveEnd, H.transept); sh.lineTo(X.naveEnd, H.transeptAisle); sh.lineTo(TRANSEPT.west, H.transeptAisle); sh.lineTo(TRANSEPT.west, 0);
    for (const o of endOps) {
      const pts = o.round ? circle(o.x, o.z0 + o.r, o.r) : pointed(o.w, o.sh, o.ah, o.x - o.w / 2).map(([a, b]) => [a, b + o.z0]);
      sh.holes.push(toPath(pts));
      const gm = new THREE.Mesh(new THREE.ShapeGeometry(toPath(pts, THREE.Shape)), o.glass);
      const uv = gm.geometry.attributes.uv; const ww = o.w || o.r * 2;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) - (o.x - ww / 2)) / ww, (uv.getY(i) - o.z0) / ww * 0.5);
      gm.position.z = 0; g.add(gm);
    }
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 1.8, bevelEnabled: false }); geo.translate(0, 0, -0.9);
    const m = new THREE.Mesh(geo, stone); m.castShadow = m.receiveShadow = true; g.add(m);
    g.position.z = -y1; root.add(g);
  }
  // Transept vaults run north-south: build in a rotated group.
  for (const s of [-1, 1]) {
    const g = new THREE.Group();
    const len = TRANSEPT.reach - half;
    const pts = pointed(NAVE_W, 0.01, 6, -NAVE_W / 2, 18).slice(1, -1);
    const pos = [], idx = [];
    for (let i = 0; i < pts.length; i++) for (const yy of [half, TRANSEPT.reach]) pos.push((X.naveEnd + X.crossEnd) / 2 + pts[i][0], H.transept - 6 + pts[i][1], -s * yy);
    for (let i = 0; i < pts.length - 1; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    add(geo, new THREE.MeshStandardMaterial({ color: 0x9a8a70, roughness: 0.9, side: THREE.DoubleSide }), false);
    // Transept aisle ceilings (flat, low)
    for (const [xa, xb] of [[TRANSEPT.west, X.naveEnd], [X.crossEnd, TRANSEPT.east]]) add(new THREE.PlaneGeometry(xb - xa, len).rotateX(Math.PI / 2).translate((xa + xb) / 2, H.transeptAisle, -s * (half + len / 2)), new THREE.MeshStandardMaterial({ color: 0xb0a48e, side: THREE.DoubleSide }), false);
    for (const xp of [X.naveEnd, X.crossEnd]) for (let b = 1; b <= 2; b++) pier(xp, s * (outer + b * 8.4), H.transeptAisle - 1, 0.75);
  }

  // ---- Choir (quire) and the Great East Window.
  const choirBays = 9, bayC = (X.choirEnd - X.crossEnd) / choirBays;
  for (const s of [-1, 1]) {
    const op = [];
    for (let i = 0; i < choirBays; i++) op.push({ x: X.crossEnd + (i + 0.5) * bayC, w: bayC - 2.2, z0: 0, sh: 10, ah: 15 });
    for (let i = 0; i < choirBays; i++) op.push({ x: X.crossEnd + (i + 0.5) * bayC, w: bayC * 0.62, z0: H.choirAisle + 3.4, sh: 7.5, ah: 13, glass: glassMat(700 + i * 3 + s, rich, 1.5) });
    wall(X.crossEnd + 2, X.choirEnd, H.choir - 8, s * half, 1.4, op);
    for (let i = 1; i < choirBays; i++) pier(X.crossEnd + i * bayC, s * half, 15 - 4.5 + 0.2, 0.75);
    const ow = [];
    for (let i = 0; i < choirBays; i++) ow.push({ x: X.crossEnd + (i + 0.5) * bayC, w: bayC * 0.6, z0: 3.5, sh: 5.5, ah: 9.6, glass: glassMat(800 + i * 5 + s, rich, 1.2) });
    wall(X.crossEnd, X.choirEnd, H.choirAisle, s * outer, 1.6, ow);
    vault(X.crossEnd, X.choirEnd, s * (half + AISLE / 2), AISLE, H.choirAisle - 4.5, H.choirAisle, choirBays, stone);
  }
  vault(X.crossEnd, X.choirEnd, 0, NAVE_W + 0.6, H.choir - 8, H.choir, choirBays, wood);
  crossWall(-outer, outer, H.choir, X.choirEnd, 2.2, [{ x: 0, w: 12.5, z0: 4.5, sh: 15, ah: 23.7, glass: glassMat(900, rich, 2.3) }]); // Great East Window, about 23.7 m tall
  // Choir stalls
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(118 - SCREEN.x1, 3.2, 2.5).translate((118 + SCREEN.x1) / 2, 1.6, -s * (half - 1.25)), caseWood);

  // ---- The pulpitum (stone screen) with its row of kings, and the organ case.
  const scr = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(SCREEN.x1 - SCREEN.x0, SCREEN.top, NAVE_W), stone);
  body.position.set((SCREEN.x0 + SCREEN.x1) / 2, SCREEN.top / 2, 0); scr.add(body);
  for (let i = 0; i < 15; i++) {
    const y = -half + 0.6 + i * ((NAVE_W - 1.2) / 14);
    if (Math.abs(y) < 1.4) continue; // central doorway
    const niche = new THREE.Mesh(new THREE.BoxGeometry(0.25, 2.6, 0.7), new THREE.MeshStandardMaterial({ color: 0x5a5146, roughness: 1 }));
    niche.position.set(SCREEN.x0 - 0.1, 4.2, -y); scr.add(niche);
    const king = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 1.3, 4, 8), stone); king.position.set(SCREEN.x0 - 0.25, 4.1, -y); scr.add(king);
  }
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.3, 4.2, 2.4), new THREE.MeshStandardMaterial({ color: 0x0c0a08 })); door.position.set(SCREEN.x0 - 0.05, 2.1, 0); scr.add(door);
  scr.traverse((m) => { if (m.isMesh) { m.castShadow = m.receiveShadow = true; } });
  root.add(scr);
  const caseH = ORGAN.top - SCREEN.top;
  if (drawCase) {
  const organCase = new THREE.Mesh(new THREE.BoxGeometry(ORGAN.x1 - ORGAN.x0, caseH * 0.55, ORGAN.y1 - ORGAN.y0), caseWood);
  organCase.position.set((ORGAN.x0 + ORGAN.x1) / 2, SCREEN.top + caseH * 0.275, 0); organCase.castShadow = true; root.add(organCase);
  // Case towers with pinnacles at each end.
  for (const s of [-1, 1]) for (const yy of [ORGAN.y0, ORGAN.y1]) {
    const tw = new THREE.Mesh(new THREE.BoxGeometry(ORGAN.x1 - ORGAN.x0 + 0.2, caseH * 0.95, 0.5), caseWood);
    tw.position.set((ORGAN.x0 + ORGAN.x1) / 2, SCREEN.top + caseH * 0.475, -yy + s * 0); root.add(tw);
    const pin = new THREE.Mesh(new THREE.ConeGeometry(0.35, 2.2, 6), gold); pin.position.set((ORGAN.x0 + ORGAN.x1) / 2, SCREEN.top + caseH * 0.95 + 1.1, -yy); root.add(pin);
  }
  }

  // ---- Organ façade pipes: neon, from the Voicer's own pipe map. Each pipe
  // is a mesh whose glow follows the music.
  const pipeMeshes = new Map();
  const neon = new THREE.Color('#ff3d6e');
  for (const p of organPipes) {
    const h = p.len + p.foot;
    const mat = new THREE.MeshStandardMaterial({ color: 0x15121a, metalness: 0.9, roughness: 0.25, emissive: neon, emissiveIntensity: 0.18 });
    const m = new THREE.Mesh(new THREE.CylinderGeometry(p.d / 2, p.d / 2, h, 14), mat);
    m.position.copy(P(p.mx, p.my, p.mz + h / 2));
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.02, Math.max(0.02, p.d * 0.4), p.d * 0.8), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    mouth.position.copy(P(p.mx - p.d / 2 - 0.005, p.my, p.mz + p.foot + 0.02));
    root.add(m); root.add(mouth);
    pipeMeshes.set(p.id, mat);
  }

  // ---- Line art: every surface becomes its edges, every rib its curve.
  // All lines are merged into a few dozen batches (one draw call each), in
  // order west to east and floor to vault, so the building can draw itself in.
  let lines = [];
  if (lineArt) {
    renderer.shadowMap.enabled = false;
    scene.background = new THREE.Color(0x000000);
    scene.fog = new THREE.FogExp2(0x000000, 0.009);
    root.updateMatrixWorld(true);
    const meshes = [];
    root.traverse((o) => { if (o.isMesh) meshes.push(o); });
    const items = []; // { pos: number[] (segments, world), col: [r,g,b], order }
    const STONE = new THREE.Color(0xe9e7e1), GLASS = new THREE.Color(0xff3d6e);
    const v3 = new THREE.Vector3();
    for (const m of meshes) {
      const g = m.geometry;
      m.parent.remove(m);
      if (g.type === 'SphereGeometry' || g.type === 'CapsuleGeometry') continue; // bosses, statues: too busy as lines
      const glass = !!m.material.emissiveMap;
      let seg = [];
      if (g.type === 'TubeGeometry') { const pts = g.parameters.path.getPoints(48); for (let i = 0; i < pts.length - 1; i++) seg.push(pts[i].x, pts[i].y, pts[i].z, pts[i + 1].x, pts[i + 1].y, pts[i + 1].z); }
      else if (g.type === 'CylinderGeometry') {
        // Columns as a drawing would show them: rings at top and bottom and a
        // few verticals. The small shafts round each pier are left out.
        const { radiusTop: rt, radiusBottom: rb, height: hh, radialSegments: rs } = g.parameters;
        if (rs <= 10) continue;
        const ring = (r, y) => { for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2, c = ((i + 1) / 24) * Math.PI * 2; seg.push(r * Math.cos(a), y, r * Math.sin(a), r * Math.cos(c), y, r * Math.sin(c)); } };
        ring(rt, hh / 2); ring(rb, -hh / 2);
        if (hh > 2) for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.3; seg.push(rt * Math.cos(a), hh / 2, rt * Math.sin(a), rb * Math.cos(a), -hh / 2, rb * Math.sin(a)); }
      } else seg = Array.from(new THREE.EdgesGeometry(g, 28).attributes.position.array);
      // To world space.
      let cx = 0, cy = 0;
      for (let i = 0; i < seg.length; i += 3) { v3.set(seg[i], seg[i + 1], seg[i + 2]).applyMatrix4(m.matrixWorld); seg[i] = v3.x; seg[i + 1] = v3.y; seg[i + 2] = v3.z; cx += v3.x; cy += v3.y; }
      const n = seg.length / 3 || 1;
      const alpha = glass ? 0.55 : g.type === 'TubeGeometry' ? 0.35 : 0.5;
      items.push({ pos: seg, col: (glass ? GLASS : STONE).clone().multiplyScalar(alpha), order: cx / n + (cy / n) * 1.2 });
    }
    // Floor: a faint grid of flags.
    const grid = [];
    for (let x = 0; x <= X.choirEnd; x += 3) grid.push(x, 0.01, half + AISLE, x, 0.01, -(half + AISLE));
    for (let y = -(half + AISLE); y <= half + AISLE; y += 3) grid.push(0, 0.01, -y, X.choirEnd, 0.01, -y);
    items.push({ pos: grid, col: STONE.clone().multiplyScalar(0.08), order: -1 });
    items.sort((p, q) => p.order - q.order);
    const BUCKETS = 40;
    for (let k = 0; k < BUCKETS; k++) {
      const part = items.slice(Math.floor((k * items.length) / BUCKETS), Math.floor(((k + 1) * items.length) / BUCKETS));
      const pos = [], col = [];
      for (const it of part) { pos.push(...it.pos); for (let i = 0; i < it.pos.length / 3; i++) col.push(it.col.r, it.col.g, it.col.b); }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      const L = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, fog: true }));
      L.userData.rank = k / BUCKETS; L.userData.alpha = 1;
      L.frustumCulled = false;
      root.add(L); lines.push(L);
    }
  }

  // ---- Light: daylight through the glass, a warm key down the nave, ambient.
  if (!lineArt) {
  scene.add(new THREE.HemisphereLight(0x6a7088, 0x1a1410, 0.28));
  const sun = new THREE.DirectionalLight(0xffe2b0, 2.6);
  sun.position.set(40, 80, 60); sun.target.position.set(60, 0, 0); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -90, right: 90, top: 60, bottom: -60, near: 1, far: 260 });
  scene.add(sun, sun.target);
  for (let i = 0; i < 8; i++) { const l = new THREE.PointLight(0xffc890, 45, 30, 2); l.position.copy(P((i + 0.5) * bayN, 0, 11)); scene.add(l); }
  for (let i = 0; i < 3; i++) { const l = new THREE.PointLight(0xffe0b8, 140, 60, 2); l.position.copy(P(X.naveEnd + 2 + i * 5, 0, 40)); scene.add(l); }
  const organLight = new THREE.SpotLight(0xffd3a0, 900, 70, 0.5, 0.6, 1.5); organLight.position.copy(P(60, 0, 20)); organLight.target.position.copy(P(SCREEN.x0, 0, 12)); scene.add(organLight, organLight.target);
  const eastLight = new THREE.PointLight(0xa0b8ff, 300, 80, 2); eastLight.position.copy(P(X.choirEnd - 6, 0, 18)); scene.add(eastLight);
  // Light shafts from the clerestory (additive, soft).
  const shaftMat = new THREE.MeshBasicMaterial({ color: 0xffe6c0, transparent: true, opacity: 0.018, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  for (let i = 1; i < naveBays && !lineArt; i += 2) {
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 2.6, 30, 12, 1, true), shaftMat);
    shaft.position.copy(P((i + 0.5) * bayN + 4, -1.5, 13)); shaft.rotation.set(0.5, 0, 0.55); scene.add(shaft);
  }

  }

  // ---- Post: bloom for glass and neon.
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(width, height), 0.55, 0.6, 0.82));
  composer.addPass(new OutputPass());

  return {
    renderer, scene, camera, composer, root, lines,
    // Draw the building in: u from 0 (nothing) to 1 (all lines).
    reveal(u) { for (const L of lines) { const k = Math.min(1, Math.max(0, (u - L.userData.rank * 0.85) / 0.15)); L.material.opacity = L.userData.alpha * k; L.visible = k > 0; } },
    setCamera(pos, target) { camera.position.copy(P(...pos)); camera.lookAt(P(...target)); },
    setPipes(levels) { for (const [id, mat] of pipeMeshes) { const l = levels[id] || 0; mat.emissiveIntensity = 0.18 + l * 5.5; } },
    render() { composer.render(); },
  };
}
