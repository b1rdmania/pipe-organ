# Pipes that face a direction (`p.face`)

`layoutOrganSplit` (organ-layout-split.js) gives every pipe a `face`, in radians about the vertical:

- `0` = facing west (York's façade, the current behaviour)
- `+π/2` = facing south (the north case)
- `−π/2` = facing north (the south case)

`pipeSegments(p)` draws a pipe in its local frame: Three x = the face normal (always 0, the lines are flat), Three y = up, Three z = across the face. Turn the local segments about Three's y axis by `p.face`, then add the foot position. This is `Matrix4.makeRotationY(face)`, i.e. `x' = c·x + s·z`, `z' = −s·x + c·z`.

## organLines: the merged geometry

```js
for (const p of pipes) {
  if (p === hero) continue;
  const v = pipeSegments(p), o = P(p.mx, p.my, p.mz);
  const c = Math.cos(p.face ?? 0), s = Math.sin(p.face ?? 0);
  p.v0 = pos.length / 3; p.vn = v.length / 3;
  for (let i = 0; i < v.length; i += 3) {
    const x = v[i], z = v[i + 2];
    pos.push(c * x + s * z + o.x, v[i + 1] + o.y, -s * x + c * z + o.z);
    col.push(0, 0, 0);
  }
}
```

`offset()` works unchanged because `base` is copied after the rotation.

## The hero and the thick-line hero

Both are separate objects, so rotate the object, not the vertices:

```js
hero.obj.rotation.y = hero.face ?? 0;   // in organLines, after position.copy(...)
fat.rotation.y = hero.face ?? 0;        // in app.js, after fat.position.copy(...)
```

`shapeHero(v)` needs no change, because the object's rotation applies to the new positions.

## Other places in app.js that assume a west-facing façade

- `apartOffset` moves waiting ranks with `P(-d, 0, …)`, which is toward the west. For a facing pipe, move it toward the viewer of its case, along `(−cos face, −sin face)` in cathedral x/y: `P(-d * Math.cos(f), -d * Math.sin(f), 0.12 * r.i * u)`, with `f` taken from the rank's pipes (all pipes in one case share `face`, so use `p.face` for each pipe and not one value for each rank).
- Case framing (`y0..y1`, `MID`, `caseDist`, `orbit`) measures the case across `my`. With two cases the width runs along `mx` (100.65–110.35) and each case is at `my ≈ ±5.35…6.6`. Frame one case at a time (`p.my > 0` = north, the C side), and look at it from across the choir. Example camera: from `[105.5, -10, 10.5]` toward `[105.5, 6, 11.8]`, fov 52.
- `orbit()` angle 0 looks east. To look at the north case, use an angle of −π/2 (camera south of the target).
