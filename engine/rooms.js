// The rooms the Voicer can play in. Each has an acoustic cell model (build),
// a calibration against a measured impulse response, and its organ.
import * as york from './minster.js';
import * as stpauls from './stpauls.js';
export const ROOMS = { york, stpauls };
