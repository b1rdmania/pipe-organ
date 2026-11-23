# The Voicer: Higher Power review

22 Nov 2026. Review only; no code changed. I read the engine, ran the metric tools, and measured the audio and frames. I cannot listen. Nobody but Andy has.

## Verdict

The engine is real and a day old. The presentation has drifted from the hook to a claim it cannot hold. "Physics is right" invites experts to judge it on their terms, and on their terms it loses today. The hook still wins. Put it back in front.

## 1. Altitude

**What it is for.** A stranger sees a machine make an instrument, hears it get a note wrong and fix it, then hears a song they know in a place they cannot go. The proof is that they send it to someone.

**What stops a scroll.** A wrong note that corrects itself in the first three seconds, then Rick Astley in York Minster. Not a T30 table.

**What makes experts take it seriously.** Stated limits and one test they would accept. Not accuracy claims.

**Is York plus "physics is right" the right frame?** No. York is a good first place. "Physics is right" is the wrong claim: scrollers cannot hear it, and experts can hear that it is not. The claim that holds is "No samples. Every pipe is built and tuned in front of you."

**Is voicing still the hook?** Yes, and the presentation buries it.
- In the app it comes third, after the church draws and the rays trace.
- The York walk film has no voicing at all. Music starts in second 0.
- The Tesseract film has it, in a different visual language.

There are three looks (neon, line art, lit render) and two front ends. Pick one.

## 2. Depth

### The calibration claim is not honest as stated

- **It is a fit.** `tools/minster-ir.mjs` turns six knobs until six numbers match one measurement. Within 1% is what a fit does. There is no second measured position held back to test it.
- **It is not true of the sound.** The 1% is on the ray histogram. The synthesized IR on disk (`out/minster/ir-sim-measured-pair.wav`), measured with the repo's own tool against the OpenAIR file:

| Band (Hz) | 125 | 250 | 500 | 1k | 2k | 4k |
|---|---|---|---|---|---|---|
| T30 error | −4% | −1% | 0% | +1% | +5% | +21% |
| EDT error | +1% | +1% | +7% | −1% | +14% | +43% |
| C80 error (dB) | −7.5 | −5.4 | −0.7 | −2.3 | −2.7 | +2.6 |

  A listener notices about 1 dB of C80. The low bands are off by 5 to 7.
- **It is the wrong path.** The measurement is a loudspeaker on the floor under the tower. The organ speaks from 8 to 13 m up on the screen. Nothing measured covers that path.
- **The room stops at six bands.** The reverb is shaped noise from 125 Hz to 4 kHz. The 32′ and 16′ pedal stops sit below it. The air above 5.6 kHz is not modelled.

Say this instead: "Tuned to one measured response. Decay time matches. Early sound and clarity do not yet."

### "Voicing" is tuning

An organ builder will say so in ten seconds.
- The loop changes the pipe length until the pitch matches. ±1 cent on 278 pipes is the loop converging, not a result.
- The error is scripted: `roughness()` cuts each pipe 2–5% long, then the loop removes it.
- Real voicing sets speech, tone and loudness: cut-up, languid, nicking, toe hole. Tuning comes after, with a slide.
- Loudness is set by a gain after the fact (`0.1 × level / rms`), not by the pipe.

`pitch.js` already measures brightness. The loop could voice for onset time, harmonic balance and level, then tune. That would earn the name.

### The York organ is a list of names

- 17 ranks share about three parameter sets. No pipe diameters, mouth widths or wind pressures.
- No reeds. The York full organ is reeds and the Tuba Mirabilis.
- The stoplist is the 1995 spec. Harrison & Harrison rebuilt the organ in 2018–21.
- The York renders are dark. In the Toccata, 2.8–5.6 kHz sits 21 dB under 180–710 Hz. The earlier generic cathedral render sits 8 dB under. The "accurate" version lost 13 dB of brilliance. A diapason chorus with mixtures should not.

### Rawest material, in order

1. The B-format IR already in `ref/york-minster/`. Only the omni file is used. It holds measured direction.
2. Any other OpenAIR York positions. Check; one would be the hold-out test.
3. A commercial recording of the York organ made after 2021, for long-term spectrum and note onsets.
4. The Harrison & Harrison rebuild specification and the current NPOR survey.
5. One real diapason pipe, close-miked: the attack and the steady tone. Fit the pipe model to that before anything else.

### Instruments they would use

- Acoustician: ISO 3382 at several positions, a hybrid model (image sources early, rays late), a measured HRTF (SADIE II is free, and from York), scattering per surface.
- Organ builder: a scale sheet per rank (Töpfer), wind pressure per division, a mixture composition with real breaks.
- Sound designer: reference tracks, a spectrum match, loudness at −14 LUFS for social, phone-speaker checks. 16 Hz pedal does not exist on a phone.

## 3. Range

**The verbs.** The presentation is not "an app". It is: get a stranger to believe a machine made an instrument, feel it learn, and pass it on. Right now it does a different job: it shows how much was built.

| Crew | What they change |
|---|---|
| Trailer editor | The wrong pipe is second 0. No church drawing, no ray tracing, no title. Song title at second 3. Full organ by second 8. One cut to a second song at the end. |
| Short-form creator | Pop song first, Bach never. Vertical. Text on screen: song and place only. The cover is the format: users make their own. |
| Organist | Registers each song by hand. Says the Toccata without reeds is thin. Asks for one honest stop played well over 17 named ones. |
| Acoustician | Removes "within 1%". Adds one seat they can check. Wants the early sound right before the tail. |
| Museum curator | Keeps the automaton lineage (Vaucanson, the Componium) as one line of text. Cuts every number from the screen. |

**The app sequence.** Build, then the hero pipe at once, then the church appears around it, then the song. The ray trace runs behind it and is not narrated.

**The screen.** The line art is a dense wireframe and the organ is a few pixels. The readout is 13 px dim monospace that explains what is happening. That is helper text. Cut it, and let the pipe fill the frame.

## 4. The judge

| Claim | Test | Status |
|---|---|---|
| The room sounds like York | Same dry stem through the measured IR and the synthesized IR, same position. ABX, ten listeners. | Can run tomorrow. The C80 numbers predict a fail. |
| The organ loft path is right | A measured IR from the screen to the nave. | **No judge exists.** |
| The organ sounds like York | Spectrum and onsets of one flue-only passage against a named post-2021 recording. | **No judge yet.** No recording in the repo. No reeds, so full organ fails by design. |
| The loop is voicing | An organ builder watches 60 seconds and says whether they would use the word. | Not run. |
| The hook works | Five people, cold, no words from Andy. What did you see? Would you send it? | Not run. `CONCEPT.md` set this as the first proof. It is still open. |
| The whole thing | The same MIDI on a MIDI-ready pipe organ in a real church, recorded, side by side. | Not built. It is also the best content. |

## 5. Cut list

- "Physics is right" and "T30 within 1%" as public claims.
- "17 ranks from the Minster's stoplist" on screen.
- The root neon app (`index.html`, `app.js`).
- Two of the three looks. Keep one film route.
- Six of the eight songs before launch. One pop, one Bach.
- BitMidi search before launch. It is a second product.
- The narrated ray trace and all readout text.
- MCP, Ableton, robotics. The research found those lanes crowded and flat.
- More cathedrals and more ranks, until one pipe and one seat pass a test.
- Hiring experts. Buy one paid hour each instead, after the listening test.

## 6. Next three moves

1. **Run the two cheap judges.** Render the A/B pair (measured IR against ours, same stem). Show the current clip to five people cold.
   *Worked if:* listeners pick the real room at chance, and three of five describe the pipe fixing itself unprompted. Either fail says what to build next.
2. **Make the loop voice, then put it first.** Target onset, tone and level; tune last. Recut the 30 seconds: wrong pipe at second 0, pop song by second 8, one look.
   *Worked if:* an organ builder accepts the word "voicing", and four of five cold viewers watch to the end.
3. **Post one clip, then book the real organ.** One song, York, the new cut. If it clears a view count Andy sets before posting, the second post is the same MIDI on a real pipe organ.
   *Worked if:* the number is met. If not, stop, as `CONCEPT.md` says.

Moves 2 and 3 involve other people's time and possible spend. They need Andy's yes.
