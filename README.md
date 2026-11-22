# The Voicer

The organ was the original robot instrument. This is the next one.

Pick a song and a place. The Voicer builds an organ for them, tunes every pipe by ear, and plays.

## Run

```sh
python3 -m http.server 5320 --bind 127.0.0.1
```

Open http://127.0.0.1:5320. Drop any MIDI file on the page to use it.

Offline render to WAV:

```sh
node tools/render.mjs songs/ToccataFugue.mid cathedral cathedral 0 32
```

## Engine

| File | Job |
|---|---|
| `engine/pipe.js` | One flue pipe: a jet-drive waveguide (jet, lip, air column). |
| `engine/voicer.js` | Cuts each pipe long, listens, trims or reshapes the mouth until it speaks in tune and holds its note. |
| `engine/organ.js` | Stops (ranks) and organ styles. |
| `engine/arranger.js` | Song + place → organ style, pedal and manual parts, tempo for the echo. |
| `engine/room.js` | Places as sound: mirror-image early reflections and a late tail per octave band (Eyring). |
| `engine/player.js` | Plays the arrangement on one shared, slightly unsteady wind supply. |
| `engine/organ-worklet.js` | The player on the audio thread. |
| `engine/voicer-worker.js` | Voicing in parallel workers. |

No samples. The sound is physics; the AI's job is design, arranging and voicing.
