# The Voicer: art direction and UX pass

23 Nov 2026. Review only; no code changed. Based on 16 of the 39 run frames and the code. I did not hear it and did not see the cards on screen; card findings are worked out from `app.html` and `app.js`.

## Did the earlier feedback land

- **Organ vs church:** half. In the wide shot the organ now reads. In the play shot (84 s on) the church lines run straight through the pipes and the case is an empty box outline.
- **Pull back to the whole cathedral:** the shot exists but is nearly black.
- **Chord with the echo:** the chord is fired in code; the picture does not answer it.
- **Rank chords:** right idea, but nothing on screen lights when a chord sounds.
- **Quicker early stages:** quicker, but the chapter I lines cannot be read.

## Ranked changes

### 1. The wide shot is dim because of fog, not opacity
`scene.js:331` sets `FogExp2(0.009)`. The WIDE camera sits about 240 m out, so church lines and rays keep under 3% of their light (57 s, 60 s). Raising 0.45 to 0.55 will not show. The rays (`app.js:469`) have no `fog: false` either, which is why they are dark crimson, not neon.
- Set `fog: false` on rays. Drive fog density per shot: about 0.002 in III, 0.009 in IV.
- Reframe WIDE: the building sits low-left, right third empty. Centre the crossing.

### 2. Light the pipes whenever they sound
In II and III the chords play through `audio.play` and no pipe changes. Pipes glow only in IV. In `rankChord` callers, set the chord's pipes to `sounding` for the chord's length. The tutti (about 40 s) and the echo chord (about 58 s) should be the two brightest frames in the film.

### 3. A black matte behind the organ, and a real case
At 84 s vault and choir lines cross the pipes, so the organ is a grey tangle. Add one black quad in the case outline shape just east of the back rank (depth write on). 
The case (`caseLines`) reads as a UI box: thin outline, doubled cornice lines, empty towers (39 s). Draw it with the thick line material at 2 px, drop the three cornice segments, keep the impost. Fade it in only when every rank is home.

### 4. Chapter I: frame the mouth, and make the words readable
- The pipe is a 35 px sliver in a 1500 px frame (3 s to 18 s), cropped at the top at 12 s. Every voicing change happens in the bottom 15%. By my arithmetic the card (`bottom: 9vh`) sits over the foot and mouth.
- Each step card is fully visible for about a quarter of a second: 0.7 s wait, 1.2 s fade in, 1.45 s sleep (`card`, `.fade`).
- No bloom on the pipe at 12 s or 18 s. Check `fatMat` against the bloom threshold.

Shot list:
1. Full pipe draws, ink, 2.5 s. Pipe on the left third.
2. Push in to the mouth and foot. Wrong note twice, neon. Hold here for Cut-up, Nicks, Toe.
3. Tilt up to the top for Length.
4. Pull back to the full pipe for "In tune", and keep pulling back into II.

Replace the fading step cards with a fixed list to the right of the pipe: `Cut-up  Length  Toe  Nicks`, mono, pending dim, active neon, done ink. One short line under it, swapped with a 0.2 s fade.

### 5. Chapter II: an exploded drawing, not a pile
- 24 s is the weakest frame: oblique, pipes cut off at the top, a stray piece at the right edge. At 30 s the near ranks are huge and off-frame, so "layers" does not read.
- Shoot it like an exploded axonometric: fov about 20, further back, three-quarter high, all 17 layers inside the frame. Swing to dead front as the ranks close.
- Ranks still unvoiced at the end of II float outside the case in III (48 s, left of the case). On leaving II, slide every rank home dim and let it brighten when voiced.
- Landing: 0.8 s of silence before the tutti. Then chord, all pipes neon, case at full, on the same frame.

### 6. Chapter III: shorter, and let the tail be the event
- The 13 s draw is silent and dim. Cut to 8 s. Hold one soft pedal D under it and ramp the echo send from 0.45 to 1 with `reveal(u)`, so the room arrives as the walls do.
- Echo chord: make it short (0.8 s, not 3 s) and release. The seven-second tail is the content. Hold the camera still while it rings; move only after.
- Rays: give each a bright head (last segment at full neon, tail at 30%) and a flash at each bounce. Fade them with the tail; today they are removed in one frame (`app.js:474`).
- Some rays leave the drawn building to the east and south (60 s, 66 s). It reads as a bug. Clip them.

### 7. Chapter IV: the best frame, cluttered
The one-point view down the nave (84 s) is the strongest composition.
- Church lines to about 0.3 while a song plays. Keep vault ribs, drop the floor grid.
- The glow at 105 s is one small blob. Raise bloom strength while playing, or widen sounding pipes to 2 px.
- No way to stop or change song. Any click or Esc brings the list back. One hairline along the bottom edge for progress.

### 8. Type and layout
- Three families (Georgia, system sans, mono) and everything centred. This is the main "generated" read. Use Helvetica Neue for all text, mono for numerals only. Set cards bottom-left on the 24 px margin, in line with the list and counter.
- Landing: show the one pipe already drawn in dim ink, title set left. Begin lights it.
- Picker: add the artist, right-aligned, dim (`by` is never shown). Drop the "Play" heading.
- "York Cathedral" is York Minster to anyone who knows it. Keep only if deliberate.

## Copy

| Card | Change to |
|---|---|
| Landing | No samples. Every pipe is built and tuned in front of you. Headphones. |
| I | Wind in at the foot. A jet across the mouth. A column of air answers. |
| As made | Too long. Mouth too low. Toe wide open. |
| Cut-up | Raise the mouth. It stops leaping the octave. |
| Length | Trim the top. Pitch. |
| Toe | Close the toe. Level. |
| Nicks | Nick the languid. A clean start. |
| II | Seventeen ranks. 830 pipes. Each voiced the same way. |
| III | 160 metres of stone, glass and timber. |
| Echo | One chord. Its sound, slowed twelve times. |

## Moments that must land

1. **The wrong note** (about 5 s): tight on the mouth, neon, no card over it.
2. **Tutti** (about 40 s): silence, then chord, glow and case together.
3. **Echo chord** (about 58 s): short chord, bright rays, still camera, long tail.
4. **First song note** (IV): church dims as the first pipes light.

## Order for one day

1, 2, 3, then 4 with the copy, then 6, 5, 7, 8.
