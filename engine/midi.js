// Standard MIDI file -> notes in seconds. Handles format 0/1, running status,
// tempo changes. Notes: { t, dur, key, vel, track, ch }.
// Also: ctl['track/ch'] = { vol, expr, programs: [[t, value]] } (CC7 and CC11
// as 0..1), timeSig [[t, num, den]], bars (start of each bar, seconds).
// The sustain pedal (CC64) is applied: a note held by it ends at pedal-up.
// Pitch bend and other controllers are skipped: pipes do not bend.
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
  const programs = {}; // 'track/ch' -> General MIDI program (first one set)
  const ctlRaw = []; // { tick, id, kind, v }
  const sigs = [{ tick: 0, num: 4, den: 4 }];
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
        if (type === 0x58) sigs.push({ tick, num: d[p], den: 2 ** d[p + 1] });
        p += l;
      } else if (status === 0xf0 || status === 0xf7) {
        const l = vlq(); p += l; // read the length first: "p += vlq()" adds to the old p
      } else if (hi === 0x90 || hi === 0x80) {
        const key = d[p++], vel = d[p++];
        raw.push({ tick, key, vel, on: hi === 0x90 && vel > 0, track: tr, ch });
      } else if (hi === 0xc0) {
        const id = `${tr}/${ch}`; if (!(id in programs)) programs[id] = d[p];
        ctlRaw.push({ tick, id, kind: 'programs', v: d[p] }); p += 1;
      } else if (hi === 0xb0) {
        const c = d[p], v = d[p + 1], id = `${tr}/${ch}`;
        if (c === 7) ctlRaw.push({ tick, id, kind: 'vol', v: v / 127 });
        else if (c === 11) ctlRaw.push({ tick, id, kind: 'expr', v: v / 127 });
        else if (c === 64) ctlRaw.push({ tick, id, kind: 'sus', v: v >= 64 ? 1 : 0, track: tr, ch });
        p += 2;
      }
      else if (hi === 0xd0) p += 1;
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
  // Sustain pedal: a note released while the pedal is down sounds on to
  // pedal-up, or to the next strike of the same key.
  const sus = {};
  for (const c of ctlRaw) if (c.kind === 'sus') (sus[`${c.track}:${c.ch}`] ??= []).push(c);
  if (Object.keys(sus).length) {
    const next = new Map(); // same key, later start
    const byKey = {};
    for (const n of notes) (byKey[`${n.track}:${n.ch}:${n.key}`] ??= []).push(n);
    for (const ns of Object.values(byKey)) { ns.sort((a, b) => a.start - b.start); ns.forEach((n, i) => next.set(n, ns[i + 1]?.start ?? Infinity)); }
    for (const n of notes) {
      const cs = sus[`${n.track}:${n.ch}`];
      if (!cs) continue;
      let down = false, up = null;
      for (const c of cs) {
        if (c.tick <= n.end) down = c.v === 1;
        else if (down && c.v === 0) { up = c.tick; break; }
      }
      if (down) n.end = Math.max(n.end, Math.min(up ?? n.end, next.get(n)));
    }
  }
  const out = notes.map((n) => {
    const t = sec(n.start);
    return { t, dur: Math.max(0.03, sec(n.end) - t), key: n.key, vel: n.vel, track: n.track, ch: n.ch };
  }).sort((a, b) => a.t - b.t);
  const ctl = {};
  for (const c of ctlRaw.sort((a, b) => a.tick - b.tick)) if (c.kind !== 'sus') ((ctl[c.id] ??= { vol: [], expr: [], programs: [] })[c.kind]).push([sec(c.tick), c.v]);
  if (sigs.length > 1 && sigs.some((g, i) => i && g.tick === 0)) sigs.shift(); // the file's own 4/4 default
  sigs.sort((a, b) => a.tick - b.tick);
  const timeSig = sigs.map((g) => [sec(g.tick), g.num, g.den]);
  const length = out.reduce((m, n) => Math.max(m, n.t + n.dur), 0);
  // Bars: step through the ticks by the time signature in force.
  const bars = [];
  const lastTick = raw.length ? raw.at(-1).tick : 0;
  for (let tick = 0, i = 0; tick <= lastTick + 1; ) {
    while (i + 1 < sigs.length && sigs[i + 1].tick <= tick) i++;
    bars.push(sec(tick));
    tick += Math.max(1, Math.round((sigs[i].num * div * 4) / sigs[i].den));
  }
  return { format: fmt, tracks: ntr, names, programs, ctl, timeSig, bars, notes: out, length };
}
