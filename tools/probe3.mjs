import { FluePipe } from '../engine/pipe.js';
import { measure } from '../engine/pitch.js';
const sr = 48000;
function harm(x, f) { const out=[]; for (let k=1;k<=8;k++){ let re=0,im=0; const w=2*Math.PI*k*f/sr; for(let i=0;i<x.length;i++){re+=x[i]*Math.cos(w*i); im+=x[i]*Math.sin(w*i);} out.push(Math.hypot(re,im)); } const m=out[0]||1e-9; return out.map(v=>(20*Math.log10(v/m+1e-9)).toFixed(0)); }
for (const [stopped, bright, jr, breath] of [[false,8,0.45,0.92],[false,8,0.45,0.97],[false,8,0.45,1.02],[true,6,0.5,0.97]]) for (const f of [65, 262, 1047]) {
  const bore = stopped ? sr/(2*f) : sr/f;
  const p = new FluePipe(sr, { bore, jetRatio: jr, jetRefl: 0.5, endRefl: 0.5, bright, breath, noise: 0.01, chiff: 0, stopped, gain: 1 }, 3);
  p.noteOn(); const n = sr*1.0, x = new Float32Array(n); for (let i=0;i<n;i++) x[i]=p.tick(1);
  const rmsAt = t => { const s=x.subarray(Math.floor(t*sr)-2400, Math.floor(t*sr)); return Math.sqrt(s.reduce((a,v)=>a+v*v,0)/s.length).toFixed(2); };
  const m = measure(x.subarray(n-12000), sr, f/2.5, f*3.5);
  const seg = x.subarray(n - Math.round(sr/ (m.f||f) * Math.floor(0.2*(m.f||f))));
  console.log(`st=${stopped} br=${bright} jr=${jr} b=${breath} f=${f} ratio=${(m.f/f).toFixed(3)} rms@.1/.2/.4/1: ${rmsAt(.1)} ${rmsAt(.2)} ${rmsAt(.4)} ${rmsAt(1)} harm dB: ${harm(seg, m.f||f).join(' ')}`);
}
