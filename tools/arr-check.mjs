// Before/after check of the pop arrangements against the design's pass marks
// (REVIEW-MIDI-ENGINE.md). "Before" is the app's old path (autoParts +
// arrange with REG.pop), saved once to tools/arr-baseline.json; "after" is
// orchestrate. The Bach files must give the same events as before.
// node tools/arr-check.mjs            table
// node tools/arr-check.mjs --baseline save the old path's numbers
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseMidi } from '../engine/midi.js';
import { arrange, autoParts } from '../engine/arranger.js';
import { STYLES } from '../engine/organ.js';
import { metrics, regStr } from './arr-metrics.mjs';

const REG = {
  pop: { great: ['ymDiap8a', 'ymOctave4'], manual: ['ymDiap8a', 'ymOctave4'], swell: { ranks: ['ymStopped8', 'ymDiap8b'], gain: 0.5 }, pedal: ['ymPedSub16', 'ymPedPrin8'], pedalGain: 0.8 },
  full: { manual: STYLES.york.manual, pedal: STYLES.york.pedal },
};
// The app's songs as they were, plus Total Eclipse as a stress case.
export const SONGS = [
  { title: 'Believe', file: 'songs/cher-believe.mid', from: 59.9, to: 92, reg: 'pop', keep: ['17/15', '9/6', '4/1'], solo: '17/15' },
  { title: 'Whiter Shade', file: 'songs/procol-whiter-shade-bitmidi.mid', auto: true, solo: '2/2' },
  { title: 'All I Want', file: 'songs/mariah-aiwfc.mid', auto: true },
  { title: 'Never Gonna', file: 'songs/rick-astley-nggyu.mid', auto: true },
  { title: 'Total Eclipse', file: 'songs/bonnie-tyler-total-eclipse.mid', auto: true },
  { title: 'Toccata', file: 'songs/ToccataFugue.mid', from: 0, to: 20, bach: true },
  { title: 'Passacaglia', file: 'songs/bwv582.mid', from: 0, to: 42, bach: true },
  { title: 'Fantasia', file: 'songs/bwv542-a4-1.mid', from: 0, to: 48, bach: true },
];
const BASE = new URL('./arr-baseline.json', import.meta.url);
export const hash = (events) => createHash('sha1').update(JSON.stringify(events)).digest('hex').slice(0, 12);

export function legacy(midi, s) {
  s = { ...s };
  if (s.auto) { const a = autoParts(midi); Object.assign(s, { keep: a.keep, from: a.from, to: a.to, solo: s.solo ?? a.solo, reg: 'pop' }); }
  const arr = arrange(midi, 'york', { from: s.from, to: s.to, speed: 0.82, keep: s.keep, ...REG[s.reg || 'full'], solo: s.solo });
  return { ...arr, from: s.from, to: s.to, speed: 0.82 };
}

// Pass marks. Bach is judged only on sameness.
export function judge(m, s, same) {
  if (s.bach) return same ? [] : ['events changed'];
  const f = [];
  if (m.pc < 85) f.push(`pc ${m.pc}`);
  if (m.bass < 85) f.push(`bass ${m.bass}`);
  if (m.regFail.length) f.push(`register ${m.regFail.join(',')}`);
  if (m.span < 6) f.push(`span ${m.span}`);
  if (m.peak > 100) f.push(`peak ${m.peak}`);
  if (m.restrike) f.push(`restrike ${m.restrike}`);
  return f;
}

const row = (m) => `${String(m.kept).padStart(4)}% ${String(m.pc).padStart(4)}% ${String(m.bass).padStart(4)}% ${String(m.polySrc).padStart(5)}→${String(m.polyArr).padEnd(5)} ${String(m.span).padStart(2)} ${String(m.peak).padStart(4)} ${String(m.restrike).padStart(4)}  ${['tune', 'harmony', 'bass'].map((k) => m.role[k] ?? 0).join('/')}`;
const head = `${'song'.padEnd(14)} ${'kept'.padStart(5)} ${'pc'.padStart(5)} ${'bass'.padStart(5)} ${'poly'.padStart(11)} sp peak rstk  tune/harm/bass`;

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes('--baseline')) {
    const out = {};
    for (const s of SONGS) {
      const midi = parseMidi(readFileSync(s.file));
      const arr = legacy(midi, s);
      out[s.title] = { m: metrics(midi, arr), hash: hash(arr.events), n: arr.events.length, from: arr.from, to: arr.to };
    }
    writeFileSync(BASE, JSON.stringify(out, null, 1));
    console.log('saved', BASE.pathname);
  }
  const base = existsSync(BASE) ? JSON.parse(readFileSync(BASE)) : {};
  const { orchestrate } = await import('../engine/orchestrate.js').catch(() => ({}));
  console.log(head);
  const fails = [];
  for (const s of SONGS) {
    const midi = parseMidi(readFileSync(s.file));
    const b = base[s.title];
    if (b) console.log(`${(s.title + ' was').padEnd(14)} ${row(b.m)}  ${b.from.toFixed(1)}–${b.to.toFixed(1)}`);
    if (!orchestrate) continue;
    const arr = orchestrate(midi, { ...(s.bach ? { from: s.from, to: s.to } : {}), solo: s.title === 'Whiter Shade' ? '2/2' : undefined });
    const m = metrics(midi, arr);
    const same = s.bach ? hash(arr.events) === b?.hash : null;
    const f = judge(m, s, same);
    console.log(`${(s.title + ' now').padEnd(14)} ${row(m)}  ${arr.from.toFixed(1)}–${arr.to.toFixed(1)}  ${s.bach ? (same ? 'same events' : 'CHANGED') : ''} ${f.length ? 'FAIL ' + f.join('; ') : 'pass'}`);
    if (!s.bach) console.log(`${''.padEnd(14)} register src ${regStr(m.regSrc)} | arr ${regStr(m.regArr)}`);
    if (f.length) fails.push(s.title);
  }
  if (orchestrate) console.log(fails.length ? `\nfailing: ${fails.join(', ')}` : '\nall pass');
}
