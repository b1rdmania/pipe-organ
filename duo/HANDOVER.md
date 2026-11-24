# Robot Organ: iPhone Duo app — handover

24 Nov 2026. For the agent in Bitrig. Read all of this before you write code.

## What it is

A pipe organ for iPhone Duo. No samples: every pipe is a physical model, voiced in advance, played through the measured echo of York Minster. It is the same engine as The Voicer plug-in in `../vst/`.

The fold is the console. In tabletop posture the upright half shows the organ case and the flat half has the keys and stops. The hinge angle works the swell box: fold the phone shut and the organ gets darker and quieter.

Name: **Robot Organ**. Bundle ID `fyi.birdmania.robotorgan`. Company: Birdmania.

## Rules

- Native SwiftUI. Do not use JUCE in this app.
- Do not change files in `../vst/`, `../engine/` or `../minster/`. Copy what you need into `duo/`.
- iOS 27.1+ for the fold APIs. The SDK on this Mac is 27.2.
- Do not push, do not upload to TestFlight, and do not create App Store records. Andy decides those.
- Commit in `duo/` only, in small steps.

## The engine (copy, do not rewrite)

Pure C++20, no JUCE: `../vst/Source/FluePipe.h`, `Organ.h`, `Organ.cpp`. Copy them to `duo/Engine/` and call them through Swift C++ interop (`SWIFT_OBJC_INTEROP_MODE = objcxx`).

`voicer::Organ` API:
- `load(pipes)`: a vector of `("rank:key", Pipe)`. Build it from `voiced.json`. For the field mapping, see `VoicerProcessor::VoicerProcessor()` in `../vst/Source/PluginProcessor.cpp`. The JSON keys match the `PipeParams` fields. `group` gives `part` (great/upper/pedal). `sag` is an index in `greatC, greatCs, upperC, upperCs, pedalC, pedalCs`.
- `prepare(maxBlock)`, then `setStop(group, on)`, `noteOn(key)`, `noteOff(key)`, `allOff()`.
- `render(parts, n)` adds n mono samples into three buffers, one per case part. Clear them first.
- `sounding(idx)` and `pipeInfo()` drive the pipe drawing. They are safe to read from the UI thread.
- The organ runs at **48 kHz only**. Set the audio session to 48 kHz. If the hardware refuses, resample (see `processBlock` in the same file).
- Keys: manual 36–93, pedal 36–67. Stops in order: Diapason 8′, Flute 8′, Octave 4′, 2′, Mixture, 16′, Pedal. The defaults are on, off, on, off, off, off, on.

Resources, copied to `duo/Resources/`: `../vst/Resources/voiced.json` and `ir-great.wav`, `ir-upper.wav`, `ir-pedal.wav` (each is stereo, 48 kHz, float32, 8 s).

## The audio chain (port of `render48`)

Port `VoicerProcessor::render48` in `../vst/Source/PluginProcessor.cpp`, in this order:

1. `organ.render` into three part buffers, 512-sample chunks.
2. Echo: each part goes mono to stereo through its own IR, then the three are summed. JUCE's `Convolution` is not available. Write a partitioned FFT convolver in C++ with Accelerate (`vDSP`). Start with uniform 1024 partitions. If one block takes more than about 30% of the audio callback budget on device, use non-uniform partitions (a short head, then a long tail on a worker thread).
3. EQ on the echo only: low shelf 220 Hz −5 dB (Q 0.707), peak 420 Hz −2.5 dB (Q 0.9). Use biquads with `vDSP_biquad`.
4. Mix: wet × sin(m·π/2) × `make`, plus dry × cos(m·π/2). Dry = 0.24 × the sum of the three parts. `make` = 0.24 / RMS of all IR samples. Default echo m = 1.
5. **Swell (new):** a one-pole low-pass and a gain on the mix, driven by the hinge. Box open: no low-pass, 0 dB. Box shut: corner 900 Hz, −15 dB. Smooth it over 50 ms.
6. Compressor: threshold −10 dB, ratio 12, attack 3 ms, release 250 ms. Then output gain, then the −1 dBFS peak limiter as written.

Run it in an `AVAudioSourceNode` on `AVAudioEngine`. No allocation and no locks in the render block. Send notes from the UI with a lock-free queue.

**Proof the port is right:** use `../vst/test/render_test.cpp` (build it with the Mac CMake build in `../vst/build`) to render one fixed chord to a WAV. Render the same chord through the Swift app's engine offline, with the swell open. They must match within −60 dB RMS difference. Put this in a unit test.

The test fails unless these match the plug-in exactly:
- **Events.** `render_test` does more than one chord: D minor (50, 53, 57, 62) on at 0.2 s, Mixture and 16′ drawn at 3.2 s, all keys off at 4.7 s, 10 s total, 48 kHz, 512-sample blocks. Read its `main` and replay the same events at the same sample positions.
- **Sample-accurate notes.** `renderWithMidi48` splits each block at every event. Do the same; do not quantise notes to block starts.
- **Zero-latency echo.** JUCE's `Convolution` adds no delay. A plain uniform-partition convolver delays the output by one partition and puts the test 1024 samples out. Convolve the partial current block each callback (as JUCE does), or give the head a direct-form section.
- **Filter coefficients.** Copy the formulas in JUCE's `IIR::Coefficients::makeLowShelf` and `makePeakFilter`. Other textbook versions give a different curve.
- **Compressor.** Port `juce::dsp::Compressor` and its `BallisticsFilter` as written (level detector, attack and release coefficients). A generic compressor will not match.
- **Voice order.** Pipe noise comes from each voice's seed (voice i uses seed i + 1). Take voices from the pool in the same order as `Organ::start`. If you copy `Organ.cpp` without changes, this already holds.

## The fold

- `onHingeChange { old, new in }` gives `DeviceHingeContext`. `hinge?.status` is `.closed`, `.partiallyOpen` or `.fullyOpen`, and `hinge?.angle` is an `Angle`. On a phone with no hinge, `hinge` is nil.
- The fold position: `GeometryProxy.reservedRegions(kind: .division)`. A region wider than it is tall means tabletop posture. Taller than it is wide means book posture. Check the exact names in the iOS 27.1 docs; press articles spell them differently.
- Swell from angle: 180° = open. 90° = halfway. 30° or less = shut. Read the angle for the sound and use `status` for the layout. Apple says the angle update rate can change.
- Not known yet: whether the simulator can fold. Check the Bitrig Duo preview first, then the Simulator Device menu. If neither folds, add a debug slider for the angle and test the real fold on a device.

| Posture | Layout |
|---|---|
| Tabletop (main) | Upright half: the case, pipes light as they sound, swell shutters. Flat half: one row of stops above two octaves of keys that scroll. |
| Open flat | Case on the top 40%. Then stops. Then two manuals stacked, Great over Swell. Swell box fully open. |
| Book | Left page: the case and stops. Right page: keys, rotated to run top to bottom. |
| Closed (outer, 5.4″) | Pocket: a thin strip of the case, one row of four stops (8′, 4′, Mixture, Pedal), one and a half octaves of keys. |

## Art direction

This is set. Do not add a new style.

- Colours: background `#000000`, neon `#FF3D6E`, ink `#F2F2F2`, dim `#3A3A3A`. Use nothing else.
- Type: Helvetica Neue for everything. Use mono for numbers only. Left-aligned, 24 pt margin. The only text on screen is the name "Robot Organ" at top left in 15 pt bold, with a 20 × 2 pt neon rule under it, and the stop names.
- Lines: 1 pt hairlines. No gradients, wood, shadows, cards or rounded panels. The only fills are the 12% neon on a stop that is on and a pressed key. The only blur is the pipe glow.
- The case: the organ front as line art. The Diapason 8′ is a mitre in the centre (C side left, C♯ side right, tallest in the middle). The Pedal 16′ is towers on each side. Pipe lengths are the voiced lengths, and each mouth is a small gap. Port the geometry and glow rule from `../vst/Source/PipeView.h` to a SwiftUI `Canvas`. The plug-in (also named Robot Organ from 0.1.1) already draws the case, keys and title this way: use it as the reference.
- **Pipes must light when they sound.** Ink outline goes to neon, with a soft glow (blur 6 pt, 40% neon). This is the main thing the earlier art review found missing. A chord must make the brightest frame on screen.
- **The swell shutters:** horizontal dim hairlines across the case, spaced 6 pt. They close down over the pipes as the hinge closes. Open: hidden. Shut: they cover the case, and pipes glow through at 35%. This is the only animation that is not a pipe.
- Stops: text buttons. Off = dim outline and ink text. On = neon outline, 12% neon fill, neon text. At least 44 pt tall.
- Keys: white keys in ink, black keys black with a dim outline. A pressed key turns neon. Allow several fingers at once (multi-touch). A finger that slides across the keys plays glissando.
- Do not add helper text, onboarding, tips or taglines.

## Phases

1. **Sound.** A SwiftUI app in `duo/RobotOrgan.xcodeproj`: engine, convolver, the stops, two octaves of keys, flat layout only. Passes the match test. Plays on the Duo simulator.
2. **Fold.** The four postures, hinge to swell, shutters, pocket mode.
3. **Songs** (later, ask Andy first). The organ plays MIDI by itself while you work the swell. This needs ports of `../engine/midi.js` and `../minster/orchestrate.js`.
4. **AUv3 + TestFlight** (later; needs Andy's paid Apple developer account).

Stop after each phase and show Andy a recording in the Duo frame.

## Already done (context only)

- `../vst/` builds for iOS with JUCE (AUv3 + Standalone): `cmake -S . -B build-ios -G Xcode -DCMAKE_SYSTEM_NAME=iOS -DCMAKE_OSX_DEPLOYMENT_TARGET=16.0`. It runs on the Duo simulator outer screen. It is a fallback AUv3 only; do not build on it.
- Live web version: https://the-voicer.andy-ff7.workers.dev. Repo: github.com/b1rdmania/pipe-organ.
