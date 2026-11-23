# Review: the MIDI engine

Review and design only. No code was changed. Numbers come from Node scripts run on `songs/*.mid` with the current `arrange` / `autoParts` and the windows and registrations in `minster/app.js`.

## Why pop sounds narrow

The low notes do reach the pedals. The narrowness has five other causes.

**1. Pop gets 2 ranks per note. Bach gets 11.** `REG.full` draws the 16′ manual double, the mixtures and the 32′ pedal. `REG.pop` draws 8′ + 4′ on the Great, two 8′ on the Swell at half gain, and 16′ + 8′ on the pedal. The Bach arrangements sound from C0 to C7 (lowest fundamental MIDI 12). The pop ones stop at C1 and have almost nothing above C6. The 32′ and the manual 16′ never sound in a pop song.

**2. Most of the song is thrown away.** `autoParts` keeps at most four parts. Share of the source (non-drum, inside the window) that survives:

| Song | Note-seconds kept | Pitch classes covered | Bass note right | Polyphony src → kept |
|---|---|---|---|---|
| Believe (great) | 47% | 93% | 89% | 8.7 → 4.1 |
| Whiter Shade | 75% | 100% | 94% | 8.1 → 6.1 |
| All I Want | 18% | 46% | 97% | 10.2 → 1.9 |
| Never Gonna | 27% | 45% | 38% | 7.1 → 1.9 |
| Total Eclipse (dropped) | 50% | 52% | 38% | 4.5 → 2.2 |
| Bach ×3 | 100% | 100% | 100% | same |

The two coverage columns rank the songs the same way Andy's ear did. They are the test.

**3. There is a hole in the middle.** Believe and All I Want have 0% of their sound in the octave C3–B3. All I Want also has only 2% in C4–B4. The source has 24% and 49% there. The result is a tune and a bass with nothing between them.

**4. The window is the intro.** `autoParts` starts where the first kept part starts. All I Want plays 7.5–47.5 s, the slow intro: the bass has 12 notes, the chosen chord part has 0 notes in the window, and the string pad that does play (29 notes, 4.2 s each, with CC11 swells) is dropped. No part lands on the Swell, so the split is pedal 44% / Great 56%. That is "levels all wrong". Total Eclipse plays the three-part verse (11 bass notes).

**5. Short notes and octave folds.** In Never Gonna, 94% of bass notes are shorter than 120 ms, so the bass sounds in only 38% of frames. A 16′ pipe at 41 Hz has a 24 ms period and probably does not speak fully in that time (not measured; `tools/speech.mjs` can check). `pedalRange` folds each note alone: 130 of 169 bass notes in Never Gonna and 70 of 98 in Believe jump up an octave while their neighbours at 36–37 stay, so the line changes shape.

Also: velocity is parsed and never used. Believe track 6/3 has velocity 1 and CC7 0 (a muted ghost of the tune).

## The parser

`midi.js` reads notes, tempo, track names and the first program per part. It skips every controller (`else p += 2`), pitch bend, later program changes and the time signature.

What the files hold: CC7 is a static mix level in all five pop files (Believe: bass 85, tune 62, pads 38 and 25). CC11 moves in All I Want (strings 8–127, 734 events). CC64 has 303 events in Whiter Shade, so its piano notes are cut short now. Pitch bend: 539 / 587 / 1,316 events in Believe / Never Gonna / Total Eclipse. No part changes program.

Read: CC7, CC11, CC64, all program changes, time signature (meta 0x58). Apply CC64 in the parser (extend note ends to pedal-up). Ignore pitch bend and CC1: pipes do not bend.

```js
midi.ctl = { '4/1': { vol: [[t, 0..1]], expr: [[t, 0..1]], programs: [[t, p]] } }
midi.timeSig = [[t, num, den]]
```

## Design: `orchestrate(midi) → plan`, then `arrange(midi, plan)`

If every part is an organ or pipe program and there are no drums, play the score as written (today's path). Bach must not change.

```js
plan = {
  window: { from, to },
  sections: [{ t0, t1, level }],            // level 1..4
  parts: [{ id, role, div, shift, mix }],   // shift = whole octaves for the part
  box: [[t, gain]],                         // swell shutters over time
  score: { pitchClass, bass, register, share, peakVoices }
}
```

### Roles

Classify every non-drum part. Drop none until the end.

| Role | Test | Division |
|---|---|---|
| bass | lowest average, mostly one note at a time | Pedal |
| melody | named or lead/reed/pipe program, one note at a time, average ≥ 58 | Great (solo) |
| pad | long notes (mean ≥ 0.8 s), chords | Swell |
| counter | one note at a time, not the melody, not a copy of it | Swell + 4′ |
| rhythm | ≥ 50% of notes under 120 ms or ≥ 25% re-struck within 300 ms | reduce, then Swell |
| drop | velocity < 10, CC7 = 0, octave copy, fewer than 8 notes in the window | — |

Merge all pad and reduced rhythm parts into one Swell part. Remove duplicate pitches. Keep at most 5 notes per chord.

### Registration by level

| Level | Pedal | Great (tune) | Swell (harmony) |
|---|---|---|---|
| 1 verse | Sub Bass 16, Principal 8 | Diapason I 8 | Stopped 8 |
| 2 | + Open Diapason 16 | + Octave 4 | + Diapason II 8 |
| 3 chorus | + Open Wood 16 | + Principal 4 | + Double 16 (notes ≥ key 48 only) |
| 4 last chorus | + Open Wood 32 (notes ≥ 0.5 s only) | + Superoctave 2 | + Octave 4, coupled to Great |

"Coupled" means the harmony notes also play on the Great ranks. The 16′ manual stop is what fills the hole below the tune. Keep it off notes below tenor C or it turns to mud.

### Low notes

- **Bass part:** shift the whole part by octaves until its lowest note is ≥ 36. On the 16′ it then sounds at the written pitch (bass E1, key 28, becomes pedal key 40 = 41 Hz). The line keeps its shape. Fold single notes only if they pass 67.
- **Manual notes below 36** (piano left hand): if no pedal note sounds, give the note to the pedal. If the pedal already has that pitch class, drop it. Never fold up.
- **Tenor hole:** if the Swell part has no note in 48–59 for more than half a bar, copy its lowest note an octave down.

### Drums

Drop them as sound. A 32′ pipe is too slow for a kick, and an 8-second echo turns accents to mud. Use them as data: drum hits per second mark the sections, and kick times say which bass notes to keep when thinning.

### Density (8 s echo)

- Bass: merge same-pitch re-strikes inside one beat. Hold each note to 85% of the gap to the next, minimum 250 ms.
- Rhythm parts: replace with one held chord per half bar (the pitch classes played, voiced in 48–72).
- Pads: tie re-strikes of the same key under 300 ms.
- Melody: keep every note, minimum 120 ms, leave a 60 ms gap before a repeat.
- Cap: `peakVoices` ≤ 100. The player pool is 128 and drops extra notes without a warning.

### Dynamics

An organ has no touch. Do not map velocity to note gain.

- Part mix = CC7, as a starting point only.
- Swell box `box(t)` = CC11 of the pad parts × section level (0.45 at level 1 to 0.9 at level 4), smoothed over 1 s. The player needs about five lines: events carry `div`, and `process` multiplies Swell voices by the curve.
- Loudness changes by adding ranks at section starts, as an organist does.

### Sections and the window

Two-second frames of pitch-class weight. Compare 32 s blocks by cosine similarity. Score = energy² × (1 + repeats/3). A prototype picks 60 s for All I Want (after the intro), 82 s for Never Gonna (the first chorus is near there) and 194 s for Believe. Take the first block that repeats, snap to a bar, and start 4 bars earlier at one level lower so the chorus arrives as a step up.

### Balance

Set division gains so that rendered RMS per stem (`tools/stems.mjs`) is: tune 35–45%, harmony 30–40%, pedal 15–25%. Solve after the first render and render once more.

## Build order (two days)

1. `tools/arr-check.mjs`: the table above for every song. Do this first; it is the baseline.
2. Parser: controllers, CC64, time signature.
3. Roles, whole-part octave shift, low-note rule.
4. Density rules.
5. Sections and window.
6. Level table, box curve, the player change.
7. Balance pass, then listen.

## Pass marks per song

- Pitch-class coverage ≥ 85%. Bass agreement ≥ 85%.
- Register: each octave with ≥ 5% of the source has at least half that share in the arrangement. Chorus spans ≥ 6 octaves.
- Balance inside the bands above. `peakVoices` ≤ 100.
- No Swell or pedal pipe re-struck within 250 ms.
- The three Bach arrangements produce the same events as today.

## Limits

- Percentages are note-seconds, not measured loudness.
- York has flue stops only. A solo reed for the tune would do more for pop than any rule here. It is outside this scope.
