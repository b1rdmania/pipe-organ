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
};

// An organ = what each division plays, plus how the wind behaves.
export const STYLES = {
  cathedral: { name: 'Cathedral', manual: ['principal8', 'octave4', 'fifteenth2'], pedal: ['subbass16', 'pedal8'], tremulant: 0, wobble: 0.004 },
  chamber:   { name: 'Chamber',   manual: ['gedackt8', 'flute4'], pedal: ['subbass16'], tremulant: 0, wobble: 0.003 },
  theatre:   { name: 'Theatre',   manual: ['tibia8', 'tibia4'], pedal: ['subbass16'], tremulant: 0.05, tremRate: 6.5, wobble: 0.002 },
};
