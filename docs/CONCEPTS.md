# Voicer: concepts

22 Nov 2026. Research and invention only. Nothing built, nothing spent, nobody contacted.

## Altitude

Make the way a space changes a sound into something anyone can see, play and post: an organ where the room is the instrument, the sound is real air, and the machine does the parts no hand can do.

Why this and not "an organ project": the organ is the one instrument that is built together with its room. A pipe is a small room. A room is a large pipe. Size and time are the only difference between a note and a reverb. Most of the concepts below come from that sentence.

## What the research says

- **The pipe design space is mostly unexplored.** Organ acousticians say only a narrow range of the possible pipe dimensions is in use, and most of the limits have no basis in science ([Angster, Rucz, Miklós, Acoustics Today 2017](https://acousticstoday.org/wp-content/uploads/2017/01/Acoustics-of-Organ-Pipes-and-Future-Trends-in-the-Research-Judit-Angster.pdf)).
- **Inverse design of bores is a solved research problem, and now runs in a browser.** [Acoustic Voxels](https://www.cs.columbia.edu/cg/lego/) (2016) put a tuned trumpet inside a hippo shape. [TubeLab](https://arxiv.org/abs/2609.22468) (Sept 2026) does browser inverse design and matched 16 CNC didgeridoos to 9.6 cents RMS. [DidgeLab](https://github.com/didgitaldoo/didge-lab) evolves didgeridoo bores. Yamaha built a [GA-optimised trumpet leadpipe](https://doi.org/10.61782/fa.2025.0629). Rucz tuned chimney-pipe resonators to lift a chosen harmonic by more than 15 dB ([thesis](http://www.hit.bme.hu/~rucz/pub/Rucz_-_PhD_Thesis.pdf)). All of these optimise the resonator. None of them is a public toy, and none of them touches the mouth, which is where voicing lives.
- **3D-printed flue pipes work, with care at the mouth.** [Krzyzaniak's Organ Pipe Maker](https://www.michaelkrzyzaniak.com/organ_pipe_maker/) made a 24-pipe rank. [Drahflow's organ](https://drahflow.name/pipe-organ.html) worked on the first try. Jet thickness needs about ±0.1 mm ([WebPipeCalc](https://www.ccoors.de/webpipecalc/)).
- **The hyperorgan scene has moved to wind control.** gamut inc's [BLACK SQUARE](https://gamutinc.org/black-square/) (2025, Tony Decap) has 128 pipes with pressure control on each pipe, measured about 1,000 times a second ([Ars Organi 2026](https://www.gdo.de/fileadmin/gdo/pdfs/AO-2603-Sledziecki.pdf)). [AGGREGATE](https://gamutinc.org/aggregate/) 2026 was programmed to open at Konzerthaus Berlin on 30 September. The [Orgelpark symposium 2025](https://www.orgelpark.nl/en/symposia/2025-new-research) ran a Global Hyperorgan event between Los Angeles, Amsterdam and Melbourne.
- **Robot pipe organs that listen to themselves exist.** Krzyzaniak's robots find their own notes by microphone ([2022](https://doi.org/10.1145/3561212.3561225)). A 2016 prototype tunes reed pipes by motor in under 10 seconds to 0.5 cents ([DAAAM](https://www.daaam.info/Downloads/Pdfs/proceedings/proceedings_2016/115.pdf)). Both stop at pitch. I found no pipe that changes its own mouth by ear (two searches; treat as likely, not proven).
- **Real-time drawn wind instruments were done in 2015, on desktop.** [Aerophones in Flatland](https://www.microsoft.com/en-us/research/publication/aerophones-flatland-interactive-wave-simulation-wind-instruments/) (Allen and Raghuvanshi, SIGGRAPH) runs a 2D wave solver at 128 kHz on a GPU. You draw a bore and hear it. I found no browser version.
- **Scale-model reverb is 90 years old and almost unused as an instrument.** Spandöck played sped-up tape in 1:5 models in 1934 ([Katz and Stitt](https://doi.org/10.25144/16013)). The [Stupaphonic Experiment](https://doi.org/10.14279/depositonce-4) (Katz, Noisternig, Delarozière, 2014) used a 1:12 model, 42 cm wide, as a "physical convolution reverberator" with ultrasonic speakers. The known flaw is air absorption, which does not scale. Labs fix it with dry air or nitrogen ([Elbphilharmonie 1:10 tests](https://www.akutek.info/Mitt%20Bibliotek/IOA%20Auditorium%20Acoustics%20Hamburg%202018/Additional/papers/p12.pdf)).
- **Sound designers already slow ultrasonic recordings to make small things huge.** A hinge becomes a castle door ([A Sound Effect](https://www.asoundeffect.com/gizmo-sound-effects/)). Recording at 192 kHz with an ultrasonic mic is what makes 2 to 3 octave drops sound good ([Bergsland and Engum 2015](https://www.arpjournal.com/asarpwp/unheard-sounds-the-aesthetics-of-inaudible-sounds-made-audible/)). I found nobody who built an instrument for it.
- **Very small pipes speak.** A 1902 Galton pipe gave pure tones down to 8 mm of pipe length, and 12.4 kHz at 5.35 mm ([Edinburgh Medical Journal](https://pmc.ncbi.nlm.nih.gov/articles/PMC5273509/)).
- **Found and force-driven organs are a small, loved canon.** [Zadar Sea Organ](https://en.wikipedia.org/wiki/Sea_organ) (Bašić, 2005). [Wave Organ](https://www.exploratorium.edu/exhibits/the-wave-organ) (Richards and Gonzalez, 1986, 25 pipes). [Blackpool High Tide Organ](https://www.theguardian.com/music/2014/jan/21/10-strangest-musical-instruments). [Singing Ringing Tree](https://intergalva.com/awards/global-galvanizing-awards-2009/the-singing-ringing-tree/) (Tonkin Liu, 2006, 320 tubes, 25 slotted). [Aeolus](https://lukejerram.com/aeolus/) (Jerram, 310 tubes). [Great Stalacpipe Organ](https://luraycaverns.com/news/the-great-stalacpipe-organ/) (Sprinkle, three years, 37 stalactites chosen from over 3,000 tapped). [Organ of Corti](https://www.liminal.org.uk/portfolio/organ-of-corti/index.html) (liminal, 2011) filtered traffic noise through a sonic crystal, and its own report says the effect was weaker than hoped.
- **Fire organs have been done, including with control.** [Kastner's pyrophone](https://collection.sciencemuseumgroup.org.uk/objects/co5867/kastners-pyrophone-1873-1876) (1873). [Galbraith's fire organ](https://www.odt.co.nz/news/dunedin/flaming-wonderful-musician-with-flare-fspdr8qj) (2009, 25 glass tubes). [Union College thermoacoustic organ](https://pubs.aip.org/asa/jasa/article/118/3_Supplement/1926/536794/Development-of-a-thermoacoustic-organ) (2005, 14 notes). [Rijke Organ, CTU Prague](https://doi.org/10.1016/j.ifacol.2020.12.1404) (2019, 11 electric tubes, aimed at MIDI).
- **Reverberant spaces as instruments.** [Inchindown](https://acousticengineering.wordpress.com/2014/01/31/an-acoustic-analysis-of-the-worlds-longest-echo/): 112 s at 125 Hz, 7.9 s at 4 kHz, 75 s broadband, impulse responses free on Freesound. [The TANK](https://tanksounds.org/about), Rangely: about 40 s.
- **Lineage.** [Vaucanson's Flute Player](https://www.cambridge.org/core/journals/organised-sound/article/embedding-algorithms-in-musical-instruments-from-automata-to-artificial-intelligencedriven-music/0BADCB00B66C47D25C1DA0B45035E8A7) (1737–38). [Winkel's Componium](https://www.mim.be/en/collection-piece/componium-0) (1821, two barrels and a random switch). [Trimpin](https://en.wikipedia.org/wiki/Trimpin): acoustic sound, MIDI control, "go beyond human physical limitations". [Metheny's Orchestrion](https://www.wired.com/2010/01/orchestrion/) (2010, about 40 LEMUR instruments, plus a blown-bottle organ by Peterson). [Fullman's Long String Instrument](https://www.ellenfullman.com/about) (from 1980).

---

## The concepts

### 1. ONE EIGHTH

**Pitch.** A robot pipe organ that fits in a box, recorded in ultrasound and slowed eight times, so it becomes a full organ in a vast room with no reverb added.

**Clip.**
1. 0–4 s. A small steel or glass box on a desk. Inside: a row of pipes from 16 cm down to 1 cm. Caption: "This is a pipe organ."
2. 4–8 s. It plays. Real speed. A two-second burst of insect chirps and valve ticks.
3. 8–10 s. Caption: "Same recording. Eight times slower. Nothing added."
4. 10–26 s. The same footage in slow motion (240 fps played at 30 is also exactly 8×). Valves open like church doors. The sound is a 16-foot organ in a long dark room. The tail rings on after the last valve shuts.
5. 26–30 s. Wide shot of the box next to a coffee cup. Caption: "Send it a MIDI file."

**How it works.**
- Physics. Linear acoustics scales exactly. Shrink a pipe and a room by 8 and every frequency rises 3 octaves and every time shrinks by 8. Record at 384 kHz, play at 48 kHz, and you undo it. A pipe sounding C2 to C6 after slowing must really sound 523 Hz to 8.4 kHz. That is a stopped pipe from about 16 cm to 1 cm, the same sizes as the top ranks of a normal organ. The Galton pipe shows the smallest end speaks.
- What does not scale: air absorption and wall losses. The tail will be long in the low mids and short on top. My estimate is about 8 s at 1 kHz and about 1 s at 5 kHz after slowing, in room air (unverified, from textbook absorption figures). Inchindown has the same shape. Dry air in a sealed box extends the top, as the scale-model labs do.
- AI. Designs the box interior for a target decay. Arranges any MIDI for the pipes and for what the valves can do at 8× tempo. An agent runs the queue and plays it as an organist.
- Robotics. A valve per pipe. One servo-driven wall in the box, so "reverb size" is a moving part you can see.

**Character.** The smallest cathedral. The box is the character: plain, sealed, a window, a slow clock. Lead line for Andy: "I have always been obsessed with reverb, so I built a room for it that fits on my desk."

**New vs precedent.** Spandöck and Stupaphonic put loudspeakers in models to test halls. Sound designers slow found objects. Nobody has put real pipes in the model, driven them by robot, and opened it to the public as an instrument. The contrast is short: "No reverb. No samples. No AI in the sound. A small box and a slow clock."

**Connectors.** MCP: `play(midi)` returns a WAV and a slow-motion MP4. Ableton: a render device. Send a clip, get the audio back. A four-minute piece plays in 30 seconds, so it bounces faster than real time through real air. MIDI out is not needed. A second input can play any audio stem through an ultrasonic speaker for reverb only.

**Judge.**
- Measured: after slowing, each pipe is within 10 cents of target and the decay at 500 Hz is over 4 s.
- Blind: five people hear the slowed audio alone. They say "church" or "organ" without a prompt.
- Clip: the cut from chirp to slow motion gets "no way" from 3 of 5.
- Scene: a reply from the scale-model acoustics people (Katz, Cox) or from AGGREGATE.

**Feasibility.** Hardware first. This is the one concept where the browser is the front door, not the proof. Parts: a 384 kHz ultrasonic mic or bat recorder, a used 2-foot pipe rank or printed pipes, small fast valves, a fan, a hard box (prices unverified, low hundreds). Claude Code covers the MIDI arranger, the queue, the resampling and the web page. A live page with a camera and a queue gives the zero-install part: anyone drops a MIDI file and gets a clip back.

**Risk.** Three. Valves must switch in about 15 ms for fast music (unverified for cheap valves), so slow music suits it first. Fan and valve noise slow down into rumble and thuds, which may read as charm or as mud. Not real time, so it is a render instrument and not a keyboard.

---

### 2. FLATLAND ORGAN

**Pitch.** Draw any shape in the browser, blow air into it, and watch and hear the wave fill it, from a pipe to a room.

**Clip.**
1. 0–5 s. A finger draws a blob with one opening. A jet starts at the mouth. Coloured pressure waves slosh inside. It sings one note.
2. 5–12 s. The finger drags a wall. The pitch bends as the wave pattern stretches.
3. 12–22 s. The finger draws a large chamber around the pipe. The wave leaks out of the mouth, crosses the chamber, hits the far wall and comes back. You hear the echo arrive when you see it arrive.
4. 22–30 s. Eight drawn pipes in one drawn hall play a chord from a MIDI keyboard. Caption: "Every sound here is this picture."

**How it works.**
- Physics. A 2D finite-difference wave solver on the GPU, with a jet-drive mouth model coupled to the field, as in Aerophones in Flatland. Pipe and room are one pressure field, so reverb is not an effect. It is the same simulation, further away.
- AI. An inverse-design button: "make this shape sing A" moves the walls for you. Claude can draw instruments through the connector.
- Robotics. None in version one. A drawn instrument can be exported as a flat cavity for laser-cut acrylic, blown by a fan.

**Character.** The wave is the character. It has no face. This is the weak point.

**New vs precedent.** Aerophones in Flatland did the solver in 2015 on desktop and stopped at the bell. TubeLab does 1D bores in the browser. The new part is the room in the same field, the browser, and the organ identity.

**Connectors.** MIDI in for notes. MCP: `draw(shape)`, `blow(pressure)`, `listen()`. Ableton: audio out through a virtual device, or the browser as an external instrument.

**Judge.** A laser-cut flat pipe matches the drawn pipe's pitch within 20 cents. A viewer with no physics can say what they are seeing after one watch.

**Feasibility.** Browser only, solo, hard. WebGPU does the solver. Getting audio-rate samples off the GPU without glitches is the main engineering job. A 2 m by 2 m hall at 1 cm cells is about 2 billion cell updates a second, which a recent laptop GPU should manage (unverified). A cathedral at full bandwidth is out of reach.

**Risk.** 2D rooms ring like plates, not like halls. It is a "single-file browser synth" at first glance, which is a crowded lane. No character.

---

### 3. THE VOICER

**Pitch.** One organ pipe with a motorised mouth that teaches itself to sing while you watch.

**Clip.**
1. 0–3 s. One pipe on a stand. Three tiny servos at its mouth. Caption: "This pipe has never been touched by a voicer."
2. 3–15 s. Jump cuts of attempts. Hiss. Squeal. A cough. An overblown shriek. The lip moves a fraction each time. A counter runs: try 4, try 19, try 37.
3. 15–22 s. Try 41. A clean, round note. The lip stops.
4. 22–30 s. Split screen: the chat log where the agent says "cut-up 0.2 mm higher, try again", and the pipe doing it.

**How it works.**
- Physics. A real flue pipe. Pitch comes from length. Tone and attack come from the cut-up height, the flue width, the jet angle and the wind pressure. These are the voicer's hand moves.
- AI. A closed loop. Blow, record, compare to a target spectrum and attack, choose the next setting. Bayesian optimisation or an agent in the loop.
- Robotics. Fine-pitch servos on the upper lip, the languid and a tuning piston. A fan with speed control.

**Character.** Strong and free. Pipe parts are already called mouth, lip, ears, beard, foot and body. A pipe with a moving lip that fails in public is the eyebrows.

**New vs precedent.** Robots that find their own notes (Krzyzaniak) and tune reeds (DAAAM 2016) stop at pitch. Decap's valve controls pressure, not geometry. Voicing is still a hand craft. A pipe that voices itself looks new.

**Connectors.** MCP is the product here: `set_cutup`, `set_flue`, `set_pressure`, `blow`, `listen` returns a spectrum. "I asked Claude to voice an organ pipe" is a post. Once voiced, the piston makes it a one-voice MIDI instrument.

**Judge.** An organ voicer hears the result blind and calls it a properly speaking pipe. The loop reaches the target in under 100 tries from a random start, three times running.

**Feasibility.** Browser first with a simulated pipe and the same knobs, in days. Then one printed pipe and three servos. Solo is realistic.

**Risk.** The flue needs 0.1 mm control, which is hard with hobby servos. The browser version alone is an optimiser tuning a synth, which nobody shares. One pipe is a performance, not an instrument anyone can play.

---

### 4. MUTANT RANK

**Pitch.** Let a machine evolve organ pipes no builder would make, then print the winners and play them.

**Clip.**
1. 0–8 s. A grid of 64 strange pipes: knotted, branching, bulbed. Each blips its note. The bad ones vanish.
2. 8–16 s. Generations tick over. The shapes get stranger and the sound gets cleaner.
3. 16–24 s. A hand lifts the same shape off a printer and puts it on a wind chest.
4. 24–30 s. It speaks. Overlay: simulated spectrum against measured spectrum.

**How it works.**
- Physics. Transfer-matrix or finite-element model of the resonator, plus the jet-drive mouth. The resonator's peaks decide which harmonics are strong.
- AI. Evolution or gradient search over free-form bore shapes for a target pitch, harmonic recipe and attack.
- Robotics. The printer, then a small valve chest.

**Character.** A cabinet of specimens. Each pipe gets a number and a family tree.

**New vs precedent.** Acoustic Voxels, DidgeLab, TubeLab, Rucz and Yamaha all do this for a resonator. The new part is flue pipes, free form, shown as a public evolution, with the organ research's own remark that the space is unexplored.

**Connectors.** MIDI in to the simulated rank. MCP: `breed(target)`, `export_stl(id)`. Ableton via the browser as an instrument.

**Judge.** A printed pipe within 10 cents of its simulation, and its first six harmonics within 3 dB. TubeLab reached 9.6 cents on real instruments, so pitch is likely. Timbre is the real test.

**Feasibility.** Browser first, solo, reasonable. One print proves it.

**Risk.** A steady blown pipe is always harmonic, so "a pipe that sounds like a bell" is not available. The differences between evolved pipes may be small to the ear. It can look like TubeLab with a new skin.

---

### 5. DRAUGHT

**Pitch.** An organ with no player and no blower, sounded by a force the city already makes.

**Clip.**
1. 0–6 s. A cluster of pipes fixed over a grate or on a river wall. Silence. A caption names the place.
2. 6–18 s. The force arrives: a train below, a boat's wash, a gust. The pipes swell into a chord.
3. 18–26 s. It fades as the force passes.
4. 26–30 s. Caption: "Played by the 08:14."

**How it works.**
- Physics. Moving air or water pushes air through low-pressure flue pipes, as at Zadar, Blackpool and the Wave Organ.
- AI. Designs pipes that speak at very low pressure and picks a pipe set where any random mix is consonant.
- Robotics. None, or shutters that choose which pipes are open.

**Character.** The place is the character. The title names the force.

**New vs precedent.** Sea, tide and hill wind are taken. A transit system or river traffic as the player looks open.

**Connectors.** MIDI out: a mic and pitch tracker turn the organ's chords into MIDI for Ableton. An MCP shutter control is possible.

**Judge.** A pipe speaks from the chosen force alone, on camera, with no fan.

**Feasibility.** Poor for the Tube. Measured air speed in a metro draught relief shaft was 2 m/s at most ([Taipei study](https://ui.adsabs.harvard.edu/abs/2008AppTE..28..372L/abstract)). That is a few pascals. A normal flue pipe wants about 500. A funnel helps but may not close the gap. River wash and roof wind are easier. Permission is the larger job.

**Risk.** Not playable by anyone. The AI is thin. Site permission can take months.

---

### 6. EMBER

**Pitch.** A MIDI organ of glass tubes that sing when a coil inside them glows.

**Clip.** Dark room. A coil reddens inside a glass tube. A low tone grows out of nothing. More tubes light. A slow chord. Hands on a keyboard in the corner.

**How it works.**
- Physics. A Rijke tube. A heater a quarter of the way up an open tube drives the air column. No jet, no reed.
- AI. Thin: composition for an instrument where each note takes seconds to start.
- Robotics. Heater power per tube, and a shared speaker to start and stop notes fast, as the Prague build does.

**Character.** Good. Fire you can see is physics you can see.

**New vs precedent.** Not new. Kastner 1873, Union College 2005, Galbraith 2009, CTU Prague 2019.

**Connectors.** MIDI in. Heat is slow, so it is a drone instrument.

**Judge.** A recognisable tune at a normal tempo. The Prague build added a speaker and active control to work towards that.

**Feasibility.** Hardware only. Hot glass and mains heaters.

**Risk.** Derivative, slow, and a burn hazard. No browser version.

---

### 7. SPRINKLE

**Pitch.** A machine that walks into any place, taps everything, and finds the organ already hidden there.

**Clip.**
1. 0–8 s. A hand-held tapper touches a railing, a radiator, a pipe, a lamp post. A screen logs a pitch for each.
2. 8–14 s. A map of the place lights up with 37 chosen notes.
3. 14–30 s. Solenoids clipped to those objects play a tune across a stairwell.

**How it works.**
- Physics. Struck objects ring at their own modes. Leland Sprinkle did this by hand in Luray Caverns for three years.
- AI. Pitch and decay analysis of each tap, then a search for the best set of notes across what is there.
- Robotics. Magnetic solenoid tappers and contact mics.

**Character.** The building as the instrument. Named for Sprinkle.

**New vs precedent.** Stalacpipe did the search by hand. Trimpin plays found objects. The survey done by machine is the new part.

**Connectors.** MIDI in to the tappers. MCP: `survey()`, `assign(scale)`.

**Judge.** A tune in tune, on found objects, with nothing sanded or moved.

**Feasibility.** Reasonable. A phone app does the survey. Twelve solenoids do the rest.

**Risk.** It is percussion, not an organ. "Solenoids play a room" has been filmed many times. The clever part does not show on camera.

---

## Rejected on the way

- A choir of printed throats blown by air. Howard's [Vocal Tract Organ](https://www.jcms.org.uk/article/id/506/) exists, and it sits too close to Chimera.
- An MCP server for church organs as the concept. It is a connector and a finale, not an idea. It belongs under the winner.
- Pipes printed to match one building's resonances. Large rooms have too many modes for the tuning to be heard.

## Red team

The reviewer who hates AI slop, one concept at a time.

1. **ONE EIGHTH.** "No AI anywhere near the audio, and I can check it with a ruler and a sample rate. If the slowed sound is mud, it is a tape trick from 1934 in a nice box. Show me the raw file."
2. **FLATLAND ORGAN.** "Honest physics, and I have seen the paper it comes from. It will sound thin and I will close the tab in a minute. A demo, not an instrument."
3. **THE VOICER.** "The only one where AI does a job a person trains ten years for, in the open, with a real pipe as the judge. If the servo cannot hold a tenth of a millimetre it is theatre."
4. **MUTANT RANK.** "Genetic algorithm plus a synth is the definition of what I ignore. Print one, measure it, and I will listen. Until then it is a screensaver."
5. **DRAUGHT.** "No slop, no product either. Sound art. I cannot review a grate."
6. **EMBER.** "Lovely and done before. You would be the fifth."
7. **SPRINKLE.** "A sampler with extra steps, unless the survey really finds notes nobody expected."

## Ranking

1. **ONE EIGHTH.** Strongest clip. Carries Andy's reverb line without forcing it. Sound is all physics. Covers come free through the queue.
2. **THE VOICER.** Strongest character and the best use of an agent. Weak on "anyone can play".
3. **FLATLAND ORGAN.** The zero-install door. Weak alone.

They stack. ONE EIGHTH is the instrument. THE VOICER is the pipe inside it, later. FLATLAND ORGAN is how the web page explains it.

## Recommendation: ONE EIGHTH

Build the smallest cathedral. It is the only concept here where the reveal is a fact a viewer can check, where the room is half the instrument, and where every user cover is a physical performance with video proof.

### Cheapest first proof (two days, no robot)

The question is one thing: does a slowed small pipe in a small hard space sound like an organ in a large room, or like mud?

**Day 1. No printing.**
1. Take any recorder that does 192 kHz. That gives 4× (two octaves). Use the best small-capsule mic to hand.
2. Take the highest whistles in reach: a tin whistle, a sopranino recorder, a dog whistle.
3. Take three hard vessels: a steel stock pot with a lid, a glass tank, a tiled shower.
4. Record single notes, a three-note chord, and a clap in each. Film on a phone at 120 fps.
5. Slow audio and video 4×. Listen on headphones.

**Day 2. One printed part.**
1. Print one block of four stopped pipes tuned to a chord at about 2 to 4 kHz, with one shared wind inlet. Use the [Organ Pipe Maker](https://www.michaelkrzyzaniak.com/organ_pipe_maker/) or [WebPipeCalc](https://www.ccoors.de/webpipecalc/) numbers.
2. Blow it by tube inside the best vessel from day 1. Record and slow.
3. Cut the 30-second clip from the footage.

**Pass.**
- The slowed chord holds pitch within 20 cents and the tail at mid frequencies lasts over 3 seconds.
- Three of five people who hear only the slowed audio say "organ" or "church".
- The same people react to the reveal.

**Fail.** The slowed sound is noise and rumble with no clear pitch, in every vessel. Then the valve and fan noise problem is real and the concept needs the 384 kHz mic and a quieter wind supply before any more work, or it stops here.

If it passes, the next spend is the 384 kHz microphone, which moves the instrument from 4× to 8×.
