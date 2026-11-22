import { FluePipe } from '../engine/pipe.js';
const sr = 48000;
function harm(x, f) { const out=[]; for (let k=1;k<=8;k++){ let re=0,im=0; const w=2*Math.PI*k*f/sr; for(let i=0;i<x.length;i++){re+=x[i]*Math.cos(w*i); im+=x[i]*Math.sin(w*i);} out.push(Math.hypot(re,im)); } const m=out[0]||1e-9; return out.map(v=>(20*Math.log10(v/m+1e-9)).toFixed(0)); }
import { measure } from '../engine/pitch.js';
for (const off of [-0.1, -0.2, -0.35, -0.5]) for (const stopped of [false,true]) { const f=262;
  const bore = stopped ? sr/(2*f) : sr/f;
  const p = new FluePipe(sr, { bore, jetRatio: stopped?0.5:0.45, jetRefl: 0.5, endRefl: 0.5, bright: 8, breath: 0.95, noise: 0.01, chiff: 0, stopped, gain: 1, offset: off }, 3);
  p.noteOn(); const n=sr*0.6, x=new Float32Array(n); for(let i=0;i<n;i++) x[i]=p.tick(1);
  const m=measure(x.subarray(n-12000),sr,f/2.5,f*3.5); const seg=x.subarray(n-Math.round(sr/m.f*50));
  console.log(`off=${off} stopped=${stopped} ratio=${(m.f/f).toFixed(3)} rms=${m.rms.toFixed(2)} harm: ${harm(seg,m.f).join(' ')}`);
}
