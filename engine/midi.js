// Standard MIDI file -> notes in seconds. Handles format 0/1, running status,
// tempo changes. Notes: { t, dur, key, vel, track, ch }.
export function parseMidi(buf) {
  const d = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let p = 0;
  const u32 = () => (d[p++] << 24 | d[p++] << 16 | d[p++] << 8 | d[p++]) >>> 0;
  const u16 = () => (d[p++] << 8) | d[p++];
  const vlq = () => { let v = 0, b; do { b = d[p++]; v = (v << 7) | (b & 0x7f); } while (b & 0x80); return v; };
  const str = (n) => { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(d[p + i]); return s; };
  if (str(4) !== 'MThd') throw new Error('not a MIDI file');
  p += 4; const hl = u32(); const fmt = u16(); const ntr = u16(); const div = u16(); p += hl - 6;
  if (div & 0x8000) throw new Error('SMPTE timing not supported');
  const tempos = [{ tick: 0, uspq: 500000 }];
  const raw = []; // {tick, key, vel, on, track, ch}
  const names = [];
  for (let tr = 0; tr < ntr && p < d.length; tr++) {
    while (str(4) !== 'MTrk') { p += 4; p += u32(); if (p >= d.length) break; }
    p += 4; const len = u32(); const end = p + len;
    let tick = 0, status = 0;
    while (p < end) {
      tick += vlq();
      let b = d[p];
      if (b & 0x80) { status = b; p++; }
      const hi = status & 0xf0, ch = status & 0x0f;
      if (status === 0xff) {
        const type = d[p++]; const l = vlq();
        if (type === 0x51) tempos.push({ tick, uspq: (d[p] << 16) | (d[p + 1] << 8) | d[p + 2] });
        if (type === 0x03) names[tr] = str(l);
        p += l;
      } else if (status === 0xf0 || status === 0xf7) {
        p += vlq();
      } else if (hi === 0x90 || hi === 0x80) {
        const key = d[p++], vel = d[p++];
        raw.push({ tick, key, vel, on: hi === 0x90 && vel > 0, track: tr, ch });
      } else if (hi === 0xc0 || hi === 0xd0) p += 1;
      else p += 2;
    }
    p = end;
  }
  tempos.sort((a, b) => a.tick - b.tick);
  const sec = (tick) => {
    let t = 0, last = 0, us = tempos[0].uspq;
    for (const tm of tempos) {
      if (tm.tick > tick) break;
      t += ((tm.tick - last) * us) / div / 1e6; last = tm.tick; us = tm.uspq;
    }
    return t + ((tick - last) * us) / div / 1e6;
  };
  raw.sort((a, b) => a.tick - b.tick || (a.on ? 1 : -1));
  const open = new Map(), notes = [];
  for (const e of raw) {
    const id = `${e.track}:${e.ch}:${e.key}`;
    if (e.on) {
      if (open.has(id)) { const o = open.get(id); o.end = e.tick; notes.push(o); }
      open.set(id, { ...e, start: e.tick });
    } else if (open.has(id)) {
      const o = open.get(id); open.delete(id); o.end = e.tick; notes.push(o);
    }
  }
  const out = notes.map((n) => {
    const t = sec(n.start);
    return { t, dur: Math.max(0.03, sec(n.end) - t), key: n.key, vel: n.vel, track: n.track, ch: n.ch };
  }).sort((a, b) => a.t - b.t);
  return { format: fmt, tracks: ntr, names, notes: out, length: out.reduce((m, n) => Math.max(m, n.t + n.dur), 0) };
}
