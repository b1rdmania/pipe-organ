// Ranks (stops) and the organs the Voicer can build from them.
// feet: 8 = sounds at written pitch, 4 = an octave up, 16 = an octave down.
// jr: jet travel as a fraction of the period (the mouth's cut-up).
// bright: loss corner in harmonics. rad: radiation tilt (0 flute, 1 principal).
export const STOPS = {
  principal8: { name: 'Principal 8′', feet: 8, stopped: false, jr: 0.45, bright: 10, breath: 0.95, rad: 0.9, noise: 0.012, chiff: 0.25, level: 1.0 },
  octave4:    { name: 'Octave 4′',    feet: 4, stopped: false, jr: 0.45, bright: 10, breath: 0.95, rad: 0.8, noise: 0.012, chiff: 0.2,  level: 0.75 },
  fifteenth2: { name: 'Fifteenth 2′', feet: 2, stopped: false, jr: 0.45, bright: 10, breath: 0.95, rad: 0.7, noise: 0.015, chiff: 0.15, level: 0.5 },
  gedackt8:   { name: 'Gedackt 8′',   feet: 8, stopped: true,  jr: 0.5,  bright: 6,  breath: 0.95, rad: 0.2, noise: 0.02,  chiff: 0.45, level: 0.9 },
  flute4:     { name: 'Flute 4′',     feet: 4, stopped: false, jr: 0.45, bright: 4,  breath: 0.93, rad: 0.15, noise: 0.03, chiff: 0.35, level: 0.6 },
  tibia8:     { name: 'Tibia 8′',     feet: 8, stopped: true,  jr: 0.5,  bright: 4,  breath: 0.97, rad: 0.0, noise: 0.006, chiff: 0.0,  level: 1.0 },
  tibia4:     { name: 'Tibia 4′',     feet: 4, stopped: true,  jr: 0.5,  bright: 4,  breath: 0.97, rad: 0.0, noise: 0.006, chiff: 0.0,  level: 0.55 },
  subbass16:  { name: 'Subbass 16′',  feet: 16, stopped: true, jr: 0.5,  bright: 6,  breath: 0.97, rad: 0.1, noise: 0.01,  chiff: 0.15, level: 1.1 },
  pedal8:     { name: 'Octave 8′',    feet: 8, stopped: false, jr: 0.45, bright: 10, breath: 0.95, rad: 0.7, noise: 0.012, chiff: 0.2,  level: 0.7 },

  // York Minster (stoplist: NPOR D04217). Flue stops only; no reeds yet.
  // English diapasons: big scale, round and strong. Wood pipes: softer, fewer upper harmonics.
  ymDouble16:    { name: 'Double Open Diapason 16′', feet: 16, stopped: false, jr: 0.45, bright: 8, breath: 0.95, rad: 0.8, noise: 0.01, chiff: 0.15, level: 0.8, seed: 101 },
  ymDiap8a:      { name: 'Open Diapason I 8′', feet: 8, stopped: false, jr: 0.45, bright: 8, breath: 0.95, rad: 0.85, noise: 0.012, chiff: 0.2, level: 1.0, seed: 102 },
  ymDiap8b:      { name: 'Open Diapason II 8′', feet: 8, stopped: false, jr: 0.45, bright: 10, breath: 0.95, rad: 0.9, noise: 0.012, chiff: 0.2, level: 0.85, seed: 103 },
  ymStopped8:    { name: 'Stopped Diapason 8′', feet: 8, stopped: true, jr: 0.5, bright: 6, breath: 0.95, rad: 0.2, noise: 0.02, chiff: 0.4, level: 0.6, seed: 104 },
  ymOctave4:     { name: 'Octave 4′', feet: 4, stopped: false, jr: 0.45, bright: 9, breath: 0.95, rad: 0.8, noise: 0.012, chiff: 0.2, level: 0.75, seed: 105 },
  ymPrincipal4:  { name: 'Principal 4′', feet: 4, stopped: false, jr: 0.45, bright: 10, breath: 0.95, rad: 0.85, noise: 0.012, chiff: 0.2, level: 0.65, seed: 106 },
  ymQuint:       { name: 'Octave Quint 2⅔′', feet: 8 / 3, stopped: false, jr: 0.45, bright: 10, breath: 0.95, rad: 0.7, noise: 0.015, chiff: 0.15, level: 0.45, seed: 107 },
  ymSuper2:      { name: 'Superoctave 2′', feet: 2, stopped: false, jr: 0.45, bright: 10, breath: 0.95, rad: 0.7, noise: 0.015, chiff: 0.15, level: 0.5, seed: 108 },
  ymMix15:       { name: 'Mixture III (15)', feet: 2, stopped: false, jr: 0.45, bright: 10, breath: 0.95, rad: 0.7, noise: 0.015, chiff: 0.15, level: 0.35, seed: 109 },
  ymMix19:       { name: 'Mixture III (19)', feet: 4 / 3, stopped: false, jr: 0.45, bright: 10, breath: 0.95, rad: 0.7, noise: 0.015, chiff: 0.15, level: 0.3, seed: 110, breaks: [79, 91] },
  ymMix22:       { name: 'Mixture III (22)', feet: 1, stopped: false, jr: 0.45, bright: 10, breath: 0.95, rad: 0.7, noise: 0.015, chiff: 0.15, level: 0.28, seed: 111, breaks: [72, 84] },
  ymPedWood32:   { name: 'Double Open Wood 32′', feet: 32, stopped: false, jr: 0.45, bright: 5, breath: 0.97, rad: 0.3, noise: 0.01, chiff: 0.1, level: 1.0, seed: 121 },
  ymPedWood16:   { name: 'Open Wood 16′', feet: 16, stopped: false, jr: 0.45, bright: 5, breath: 0.97, rad: 0.35, noise: 0.01, chiff: 0.1, level: 1.0, seed: 122 },
  ymPedDiap16:   { name: 'Open Diapason 16′ (Pedal)', feet: 16, stopped: false, jr: 0.45, bright: 8, breath: 0.95, rad: 0.7, noise: 0.01, chiff: 0.15, level: 0.8, seed: 123 },
  ymPedSub16:    { name: 'Sub Bass 16′', feet: 16, stopped: true, jr: 0.5, bright: 6, breath: 0.97, rad: 0.1, noise: 0.01, chiff: 0.15, level: 0.8, seed: 124 },
  ymPedPrin8:    { name: 'Principal 8′ (Pedal)', feet: 8, stopped: false, jr: 0.45, bright: 9, breath: 0.95, rad: 0.75, noise: 0.012, chiff: 0.2, level: 0.7, seed: 125 },
  ymPedFif4:     { name: 'Fifteenth 4′ (Pedal)', feet: 4, stopped: false, jr: 0.45, bright: 9, breath: 0.95, rad: 0.7, noise: 0.012, chiff: 0.2, level: 0.5, seed: 126 },
};

// An organ = what each division plays, plus how the wind behaves.
export const STYLES = {
  cathedral: { name: 'Cathedral', manual: ['principal8', 'octave4', 'fifteenth2'], pedal: ['subbass16', 'pedal8'], tremulant: 0, wobble: 0.004 },
  chamber:   { name: 'Chamber',   manual: ['gedackt8', 'flute4'], pedal: ['subbass16'], tremulant: 0, wobble: 0.003 },
  // York Minster, full Great and Pedal flue chorus (the Toccata registration, less reeds).
  york:      { name: 'York Minster', manual: ['ymDiap8a', 'ymDouble16', 'ymDiap8b', 'ymStopped8', 'ymOctave4', 'ymPrincipal4', 'ymQuint', 'ymSuper2', 'ymMix15', 'ymMix19', 'ymMix22'],
               pedal: ['ymPedWood32', 'ymPedWood16', 'ymPedDiap16', 'ymPedSub16', 'ymPedPrin8', 'ymPedFif4'], pedalRange: [36, 67], manualRange: [36, 93], tremulant: 0, wobble: 0.003 },
  theatre:   { name: 'Theatre',   manual: ['tibia8', 'tibia4'], pedal: ['subbass16'], tremulant: 0.05, tremRate: 6.5, wobble: 0.002 },
};

// The note a pipe sounds, in Hz. A mixture rank "breaks back" an octave where
// its pipes would get too small to make, as real mixtures do.
export function pipeHz(stop, key) {
  const breaks = (stop.breaks ?? []).filter((b) => key >= b).length;
  return (440 * 2 ** ((key - 69) / 12) * (8 / stop.feet)) / 2 ** breaks;
}
