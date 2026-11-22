import { FluePipe } from '../engine/pipe.js';
const sr = 48000;
function f0(x) { // normalized autocorrelation with parabolic peak
  const N = x.length, maxLag = Math.floor(sr/30), minLag = 4;
  let best = -1, bl = 0; const r = new Float64Array(maxLag+2);
  let e0=0; for (let i=0;i<N-maxLag;i++) e0+=x[i]*x[i];
  for (let l=minLag;l<=maxLag;l++){ let s=0,e1=0; for(let i=0;i<N-maxLag;i++){s+=x[i]*x[i+l]; e1+=x[i+l]*x[i+l];} r[l]=s/Math.sqrt(e0*e1+1e-12); }
  // first peak above 0.9*max
  let mx=0; for(let l=minLag;l<=maxLag;l++) if(r[l]>mx) mx=r[l];
  for (let l=minLag+1;l<maxLag;l++) if (r[l]>0.92*mx && r[l]>=r[l-1] && r[l]>=r[l+1]) { bl=l; break; }
  const a=r[bl-1],b=r[bl],c=r[bl+1]; const d=0.5*(a-c)/(a-2*b+c||1e-9);
  return { f: sr/(bl+d), clarity: mx };
}
const base = { jetRatio: 0.32, jetRefl: 0.5, endRefl: 0.5, loss: 0.7, breath: 0.9, noise: 0.02, chiff: 0.0, gain: 1 };
for (const stopped of [false, true]) for (const jr of [0.2,0.32,0.45]) for (const bore of [50,100,200,400]) {
  const p = new FluePipe(sr, { ...base, bore, jetRatio: jr, stopped }, 7);
  p.noteOn(); const n = sr*0.4; const x = new Float32Array(n); let peak=0;
  for (let i=0;i<n;i++){ x[i]=p.tick(1); peak=Math.max(peak,Math.abs(x[i])); }
  const tail = x.subarray(n/2); let rms=0; for (const v of tail) rms+=v*v; rms=Math.sqrt(rms/tail.length);
  const {f, clarity} = f0(tail);
  console.log(`stopped=${stopped} jr=${jr} bore=${bore} f=${f.toFixed(1)} f*bore/sr=${(f*bore/sr).toFixed(3)} clar=${clarity.toFixed(2)} rms=${rms.toFixed(3)} peak=${peak.toFixed(2)}`);
}
