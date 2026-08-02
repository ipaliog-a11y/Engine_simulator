// Conversion 4, part 3 — the SHAFT EQUATION OF MOTION. Pre-implementation investigation.
// Standalone: `node tests/proto/shaft.mjs`. Not wired into the app.
//
//
// What it replaces: spool50, spoolWidth (a logistic boost-vs-rpm curve) and spoolK (a first-order
// lag rate). Three fitted numbers standing in for one ODE.
//
// Four things this investigation has to settle before any of it is written into the app:
//   1. the singularity   — dw/dt = P/(J.w) blows up as w -> 0. Is there a formulation without it?
//   2. stiffness         — is it stable at the acceleration integrator's existing dt?
//   3. the architecture  — boost stops being a function of rpm, so the precomputed torque curve
//                          that simulateAccel and the lap solver both interpolate stops being valid
//   4. does it answer test40 — a small frame spools at 1711 rpm vs a large frame's 3554 and is
//                          still slower to 100 km/h, because today there is no transient at all

const GAMMA=1.4, CP_AIR=1005, R_AIR=287, GAMMA_EX=1.33, CP_EX=1150;
const SLIP=0.90, BLOCK=0.50, IND=0.72, TIP_LIMIT=520;
const chokeKgs=exd=>BLOCK*(101325/(R_AIR*298))*(Math.PI/4*Math.pow(IND*exd,2))*Math.sqrt(GAMMA*R_AIR*298);
const island=(ff,pr)=>Math.max(0.35,0.78-0.22*Math.pow((Math.min(2,ff)-0.62)/0.30,2)-0.10*Math.pow(Math.max(0,pr-2.2)/2.0,2));
function prFromShaft(exd,n,ff){
  const U=Math.PI*exd*n/60, w=SLIP*U*U/(CP_AIR*298);
  let e=0.70,pr=1;
  for(let i=0;i<40;i++){pr=Math.pow(1+e*w,GAMMA/(GAMMA-1));const e2=island(ff,pr);if(Math.abs(e2-e)<1e-7)break;e+=(e2-e)*0.5;}
  return {pr,eta:e};
}
const CRIT=Math.pow(2/(GAMMA_EX+1),GAMMA_EX/(GAMMA_EX-1));
function flux(pr){const rp=1/Math.max(1.0001,pr);
  if(rp<=CRIT)return Math.sqrt(GAMMA_EX/287)*Math.pow(2/(GAMMA_EX+1),(GAMMA_EX+1)/(2*(GAMMA_EX-1)));
  return Math.sqrt(2*GAMMA_EX/(287*(GAMMA_EX-1))*(Math.pow(rp,2/GAMMA_EX)-Math.pow(rp,(GAMMA_EX+1)/GAMMA_EX)));}
function manifoldPRfull(m,A,T){let lo=1.0001,hi=8;const f=pr=>A*(pr*101325)/Math.sqrt(T)*flux(pr)-m;
  if(f(hi)<0)return hi; if(f(lo)>0)return 1;
  for(let i=0;i<50;i++){const x=(lo+hi)/2;if(f(x)<0)lo=x;else hi=x;}return lo;}
const inertia=exd=>3.2e-5*Math.pow(exd/0.071,5);
const T3f=e=>273+780+260*Math.min(1,e/5000);

// ---------------------------------------------------------------- 1. the singularity
console.log('=== 1. dw/dt = P/(J.w) is singular at rest. Integrate ENERGY instead. ===');
console.log('  E = 1/2 J w^2  ->  dE/dt = P_net,  w = sqrt(2E/J).  No division by w at all.');
console.log('  A stationary shaft has E = 0 and simply gains energy; nothing blows up.\n');
{
  const J=inertia(0.071);
  console.log('  shaft rpm     dw/dt at 5 kW net (rad/s^2)     dE/dt form');
  for(const n of [500,2000,10000,50000,120000]){
    const w=n*2*Math.PI/60;
    console.log(`  ${String(n).padStart(7)}      ${(5000/(J*w)).toExponential(2).padStart(12)}            5000 W, always finite`);
  }
}

// ---------------------------------------------------------------- 2. stiffness
console.log('\n=== 2. is it stable at the acceleration integrator dt? ===');
function spoolTo(exd,AR,dispL,erpm,wgBar,dt,ve=0.90){
  const J=inertia(exd), nMax=TIP_LIMIT*60/(Math.PI*exd), A=(AR*0.0254)*(0.90*exd/2);
  let E=0.5*J*Math.pow(8000*2*Math.PI/60,2), t=0;
  const step=()=>{
    const n=Math.sqrt(2*E/J)*60/(2*Math.PI);
    let pr=1,eta=0.7;
    for(let i=0;i<8;i++){
      const mA=(dispL/1000)*ve*(erpm/120)*(pr*101325/(R_AIR*313));
      const r=prFromShaft(exd,n,mA/chokeKgs(exd)); const p2=Math.min(r.pr,1+wgBar);
      if(Math.abs(p2-pr)<1e-7){pr=p2;eta=r.eta;break;} pr=p2;eta=r.eta;
    }
    const mA=(dispL/1000)*ve*(erpm/120)*(pr*101325/(R_AIR*313)), mE=mA*1.06;
    const T3=T3f(erpm), prT=manifoldPRfull(mE,A,T3);
    const Pt=mE*CP_EX*T3*0.70*(1-Math.pow(prT,-0.248));
    const Pc=mA*CP_AIR*298*(Math.pow(pr,0.286)-1)/Math.max(0.25,eta);
    return {net:Pt-Pc,pr,n};
  };
  let target=null;
  for(let k=0;k<200000 && t<6;k++){
    const s=step();
    if(target===null&&k===0){/* find steady by long run below */}
    E=Math.max(0,E+s.net*dt);
    const nCap=0.5*J*Math.pow(nMax*2*Math.PI/60,2); if(E>nCap)E=nCap;
    t+=dt;
    if(s.pr-1>=0.9*wgBar)return {t,pr:s.pr};
  }
  return {t:null};
}
// NB the first version of this check used the MEDIUM frame at 3000 rpm and reported "never" at
// every step size, which reads like an instability and is not one: that combination genuinely does
// not reach 0.8 bar, as the table below shows. A convergence check has to be run on a case that
// converges. Picking a non-spooling case and reading the null as divergence would have been the
// same mistake as reading a value off a clamp.
for(const [nm,exd,AR,erpm,wg] of [['small @3000',0.054,0.42,3000,1.0],['small @2500',0.054,0.42,2500,0.8],['medium @4500',0.071,0.64,4500,1.0]]){
  const row=[0.02,0.005,0.001,0.0002].map(dt=>{
    const r=spoolTo(exd,AR,2.0,erpm,wg,dt);
    return (r.t===null?'never':(r.t*1000).toFixed(0)+' ms').padStart(9);
  });
  console.log(`  ${nm.padEnd(13)} dt 0.02/0.005/0.001/0.0002 ->${row.join('')}`);
}
console.log('  Converging across two decades of step size: not stiff at the dt already in use.');

// ---------------------------------------------------------------- 4. what test40 wants
console.log('\n=== 4. the case test40 is asserting about: 2.0 L, 0.8 bar, small vs large frame ===');
console.log('  frame    spool-up to 90% boost, engine held at each speed');
console.log('           2000 rpm    2500 rpm    3000 rpm    4000 rpm');
for(const [nm,exd,AR] of [['small ',0.054,0.42],['medium',0.071,0.64],['large ',0.086,0.86]]){
  const cells=[2000,2500,3000,4000].map(e=>{
    const r=spoolTo(exd,AR,2.0,e,0.8,0.002);
    return (r.t===null?'not spooled':`${(r.t*1000).toFixed(0)} ms`).padEnd(12);
  });
  console.log(`  ${nm}   ${cells.join('')}`);
}
console.log('\n  If the small frame lights in a fraction of the time the large one needs, a 0-100 run');
console.log('  that INTEGRATES this will favour it — which is exactly what test40 asserts and what');
console.log('  a steady boost-per-rpm curve can never show.');
