// Conversion 4 — turbo maps. The working model from the pre-implementation investigation.
// Standalone: `node tests/proto/turbo.mjs`. Nothing here is wired into the app yet.
//
// It replaces 22 fitted numbers: TURBO{spool50,width,choke,k,flow} x3 frames,
// TURBO_CONFIG{spool,width,choke,k,flow} x4 configurations, TURBO_PR_REF and SPOOL_PR_EXP.
//
// Part 3 of the investigation — the piece that was missing, and it is a big one.
//
// turbo4's shaft crawled: net power sat at 0.01 kW and nothing ever spooled. The cause was a
// modelling error, not a numerical one. I was setting the TURBINE's expansion ratio equal to the
// COMPRESSOR's pressure ratio. That makes spool impossible by construction: a slow shaft makes no
// boost, so it gets no expansion, so it gets no power, so it stays slow. A turbo could never start.
//
// A turbine is a NOZZLE OF FIXED EFFECTIVE AREA. Exhaust cannot leave the manifold except through
// it, so manifold pressure rises until the flow fits:  mdot = A_eff · f(PR_t).  The expansion ratio
// is therefore set by MASS FLOW AND AREA, not by whatever the compressor happens to be doing. Even
// a stationary shaft has full manifold pressure available to start it turning.
//
// This is also exactly what a turbo's A/R spec means, and why it is the number people agonise over:
// a small A/R is a small nozzle, so more expansion, faster spool, and more back-pressure up top.
// It has been sitting in the app as part of the lumped "spool50" all along.
const GAMMA=1.4, CP_AIR=1005, R_AIR=287, GAMMA_EX=1.33, R_EX=287, CP_EX=1150;
const SLIP=0.90, BLOCKAGE=0.50, INDUCER_RATIO=0.72, TIP_LIMIT=520;
const chokeFlow=exd=>BLOCKAGE*(101325/(R_AIR*298))*(Math.PI/4*Math.pow(INDUCER_RATIO*exd,2))*Math.sqrt(GAMMA*R_AIR*298);
const tip=(exd,n)=>Math.PI*exd*n/60;
const compEff=(ff,pr)=>Math.max(0.35,0.78-0.22*Math.pow((ff-0.62)/0.30,2)-0.10*Math.pow(Math.max(0,pr-2.2)/2.0,2));
function prAt(exd,n,ff){const U=tip(exd,n),w=SLIP*U*U/(CP_AIR*298);let e=0.70,pr=1;
  for(let i=0;i<40;i++){pr=Math.pow(1+e*w,GAMMA/(GAMMA-1));const e2=compEff(ff,pr);if(Math.abs(e2-e)<1e-7)break;e+=(e2-e)*0.5;}
  return{pr,eta:e};}

// ---- the turbine as a nozzle ----
// Compressible flow through a restriction, referred to upstream stagnation conditions. Above the
// critical ratio it chokes and mass flow stops caring about downstream pressure.
const CRIT=Math.pow(2/(GAMMA_EX+1),GAMMA_EX/(GAMMA_EX-1));      // ~0.54
function nozzleFlux(prT){                       // kg/s per m^2 per sqrt(T)/p, dimensionless-ish
  const rp=1/Math.max(1.0001,prT);
  if(rp<=CRIT) return Math.sqrt(GAMMA_EX/R_EX)*Math.pow(2/(GAMMA_EX+1),(GAMMA_EX+1)/(2*(GAMMA_EX-1)));
  return Math.sqrt(2*GAMMA_EX/(R_EX*(GAMMA_EX-1))*(Math.pow(rp,2/GAMMA_EX)-Math.pow(rp,(GAMMA_EX+1)/GAMMA_EX)));
}
// Solve manifold pressure for a given flow: mdot = A·p0/sqrt(T0)·flux(PR)
function turbinePR(mdot,A,T0,pAmb=101325){
  let lo=1.0001,hi=6;
  const f=pr=>A*(pr*pAmb)/Math.sqrt(T0)*nozzleFlux(pr)-mdot;
  if(f(hi)<0)return hi;
  for(let i=0;i<60;i++){const m=(lo+hi)/2; if(f(m)<0)lo=m;else hi=m;} return lo;
}
// Turbine effective area from its wheel. A/R is the real spec; effective nozzle area scales with
// the turbine wheel's own frontal area times the A/R chosen.
const turbineArea=(exd,AR)=>Math.PI/4*Math.pow(0.90*exd,2)*AR*0.55;

console.log('=== the turbine is a nozzle: expansion ratio comes from FLOW and AREA ===');
console.log('  GT2871R-ish, 0.64 A/R, exhaust at 1300 K\n');
console.log('  exhaust kg/s   manifold PR   available turbine power');
const A=turbineArea(0.071,0.64);
for(const m of [0.02,0.05,0.08,0.12,0.18,0.25]){
  const pr=turbinePR(m,A,1300);
  const P=m*CP_EX*1300*0.70*(1-Math.pow(1/pr,(GAMMA_EX-1)/GAMMA_EX));
  console.log(`     ${m.toFixed(2)}          ${pr.toFixed(2)}            ${(P/1000).toFixed(1)} kW`);
}
console.log('  Note the 0.05 kg/s row — a 2.0 L at 3000 rpm off boost. turbo4 gave that ~0 kW');
console.log('  because it used the compressor PR. It is really several kW, which is why turbos spool.\n');

const inertia=exd=>3.2e-5*Math.pow(exd/0.071,5);
const T3f=e=>273+780+260*Math.min(1,e/5000);
function state(exd,AR,dispL,erpm,n,wgBar,ve=0.90){
  let pr=1,eta=0.7,ff=0.3;
  for(let i=0;i<14;i++){
    const mAir=(dispL/1000)*ve*(erpm/120)*(pr*101325/(R_AIR*313));
    ff=mAir/chokeFlow(exd);
    const r=prAt(exd,n,ff); const p2=Math.min(r.pr,1+wgBar);
    if(Math.abs(p2-pr)<1e-6){pr=p2;eta=r.eta;break;} pr=p2;eta=r.eta;
  }
  const mAir=(dispL/1000)*ve*(erpm/120)*(pr*101325/(R_AIR*313)), mEx=mAir*1.06;
  const T3=T3f(erpm), prT=turbinePR(mEx,turbineArea(exd,AR),T3);
  const Pt=mEx*CP_EX*T3*0.70*(1-Math.pow(1/prT,(GAMMA_EX-1)/GAMMA_EX));
  const Pc=mAir*CP_AIR*298*(Math.pow(pr,(GAMMA-1)/GAMMA)-1)/Math.max(0.25,eta);
  return {pr,eta,ff,net:Pt-Pc,prT,Pt,Pc};
}
console.log('=== time to 90% boost, with the turbine modelled as a nozzle (2.0 L, 1.0 bar gate) ===');
console.log('  frame       2000 rpm   3000 rpm   4000 rpm   5000 rpm    back-pressure @5000');
for(const [nm,exd,AR] of [['GT1548',0.049,0.42],['GT2871R',0.071,0.64],['GT3582R',0.082,0.82],['GT4508R',0.108,1.06]]){
  const J=inertia(exd),nMax=TIP_LIMIT*60/(Math.PI*exd);
  const cells=[2000,3000,4000,5000].map(erpm=>{
    // steady target
    let lo=3000,hi=nMax;
    if(state(exd,AR,2.0,erpm,hi,1.0).net>0)lo=hi;
    else{for(let i=0;i<50;i++){const m=(lo+hi)/2; if(state(exd,AR,2.0,erpm,m,1.0).net>0)lo=m;else hi=m;}}
    const tgt=state(exd,AR,2.0,erpm,lo,1.0);
    if(tgt.pr<=1.02)return 'no spool'.padEnd(11);
    let n=Math.max(6000,0.08*nMax),t=0;const dt=2e-4;
    for(let s=0;s<25000;s++){
      const st=state(exd,AR,2.0,erpm,n,1.0);
      const om=n*2*Math.PI/60;
      n=Math.max(3000,Math.min(nMax,(om+st.net/(J*om)*dt)*60/(2*Math.PI)));
      t+=dt;
      if(st.pr-1>=0.9*(tgt.pr-1))return `${(t*1000).toFixed(0)} ms`.padEnd(11);
    }
    return '>5 s'.padEnd(11);
  });
  const bp=state(exd,AR,2.0,5000,0.55*(TIP_LIMIT*60/(Math.PI*exd)),1.0);
  console.log(`  ${nm.padEnd(10)}  ${cells.join('')} ${(bp.prT-1).toFixed(2)} bar`);
}
console.log('\n  real: small frame ~0.2-0.4 s at 3000 rpm, big frame 1-2 s; back-pressure 0.5-1.5 bar');
console.log('  on a boosted engine — dominated by the TURBINE, not the pipe. Conversion 3 models');
console.log('  only the pipe, so a turbo engine is currently missing most of its back-pressure.');
