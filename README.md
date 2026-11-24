# Robot Organ

A pipe organ rebuilt in software. Every pipe is a physical model that is made and voiced in front of you, then played in a cathedral whose echo is ray-traced and checked against a real recording. No samples.

Live: https://the-voicer.andy-ff7.workers.dev (headphones)

## Run

```sh
python3 -m http.server 5320 --bind 127.0.0.1
```

Open http://127.0.0.1:5320.

## Plug-in

**Robot Organ**: VST3, AU and a standalone app for macOS 11 or later (Apple silicon and Intel). Download from [Releases](https://github.com/b1rdmania/pipe-organ/releases). It has the organ front with pipes that light as they sound, and a 61-note keyboard you can play with the mouse or the computer keys. The build is not notarised: read `INSTALL.txt` in the zip.

Build from source:

```sh
cd vst
git clone --depth 1 --branch 9.0.6 https://github.com/juce-framework/JUCE.git
cmake -S . -B build -G Ninja -DCMAKE_BUILD_TYPE=Release "-DCMAKE_OSX_ARCHITECTURES=arm64;x86_64"
cmake --build build --target TheVoicer_VST3 TheVoicer_AU TheVoicer_Standalone
```

## What it does

1. **The pipe.** A flue pipe as a jet-drive waveguide. It arrives as a pipe maker leaves it (cut long, mouth low, toe open) and the voicer sets its toe (level), cut-up (tone), nicks (onset noise) and length (pitch), measuring each step, then checks it holds its note under unsteady wind.
2. **The organ.** All 830 pipes of a York Minster flue chorus (17 ranks) are voiced the same way in Web Workers.
3. **The room.** York Minster and St Paul's Cathedral as cell models, ray-traced in six octave bands and calibrated against measured impulse responses from OpenAIR. The organ plays through the traced two-ear echo, with each part of the case as an HRTF source; the listener is the camera.
4. **Play.** Any MIDI file is arranged for the organ (pedal, Great, enclosed Swell) and played live in an AudioWorklet.

## Inside

| Path | Job |
|---|---|
| `engine/pipe.js` | One flue pipe: jet, lip, air column. |
| `engine/voicer.js` | Voices a pipe: toe, cut-up, nicks, length, steadiness. |
| `engine/organ.js` | Ranks (stops) and the York stoplist. |
| `engine/arranger.js`, `engine/orchestrate.js` | MIDI to organ parts, divisions and registration. |
| `engine/acoustics.js`, `engine/auralize.js` | Ray tracer and two-ear impulse responses. |
| `engine/minster.js`, `engine/stpauls.js` | The two cathedrals as acoustic models, with sources and calibration. |
| `engine/player.js`, `engine/organ-multi-worklet.js` | Plays an arrangement on the voiced pipes. |
| `minster/app.html`, `minster/app.js` | The app: the guided build, the camera, and playing. |
| `minster/sound.js`, `minster/songs.js` | The spatial sound graph; the song list and MIDI search. |
| `minster/scene.js`, `minster/scene-stpauls.js` | The cathedrals in line art (Three.js). |
| `tools/` | Room calibration (`room-ir.mjs`), arrangement checks (`arr-check.mjs`), offline renders, the clip. |
| `docs/` | Design notes and reviews. |

## Measured data

Impulse responses in `ref/` are from the OpenAIR library (University of York), CC BY 4.0: York Minster, and St Paul's Cathedral (Foteinou, Stevens and Murphy, 2022).
