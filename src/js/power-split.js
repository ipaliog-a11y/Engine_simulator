// ====== POWER-SPLIT: the planetary eCVT (build 189, step 3.3 of plans/hybrid-electric/) ======
// Toyota's Hybrid Synergy Drive (the Prius since 1997, and its licensees) has no gearbox. One planetary gearset splits
// the engine's power: the engine drives the carrier, a small motor-generator (MG1) the sun, and the ring turns with the
// wheels, where the traction motor (MG2) also drives. Speeds and torques in a planetary are fixed by its teeth
// (Willis: Zs ns + Zr nr = (Zs + Zr) ne), so with rho = Zs/Zr
//   the sun's speed       ns = ((1 + rho) ne - nr) / rho: MG1 sets the engine's speed for any road speed (an eCVT);
//   the ring's torque     Tr = Te / (1 + rho): ~72% of the engine's torque goes to the wheels through the gears;
//   the sun's torque      Ts = rho Te / (1 + rho): MG1 holds it, generating while it turns forward, and its power
//                         goes to MG2 as electricity (the electrical path), with the pack's own on top.
// So the engine can sit at whatever speed burns least for the power asked of it, and stop altogether: MG2 then drives
// alone and MG1 spins backwards freely. What limits it: MG1's torque (it must hold the engine's reaction), MG1's speed,
// MG2's torque and speed, and the pack.
// What is derived: every speed and torque above, and the losses on the electrical path (motorLosses for each machine
// at its own speed and torque). What is a rule, and named:
//   the gears        the 4th-generation Prius's (P610 transaxle): 30 sun and 78 ring teeth, and MG2 geared 65:17 to
//                    the ring's counter gear (10.84:1 to the wheels with its 2.834 differential);
//   the bus          a boost converter raises the pack to 600 V for both machines (Toyota's since 2004);
//   MG1              the traction motor's design (the GEN-4 MG1 and MG2 share a stator diameter), its stack and
//                    current set for 110% of the engine's peak reaction torque and for 31% of the engine's peak power
//                    (22.5 kW against 72 kW on the 4th-generation Prius).
const PS={rho:30/78,k2:65/17,busV:600,mg1Margin:1.1,mg1Share:22.5/72};
const isPowerSplit=()=>isHybrid()&&engine.hy.mode==='ps';
// MG1, from MG2's design: with the winding kept, the torque goes with stack x current and the knee speed against the
// stack, so the stack sets the knee (MG1's power over its torque) and the current the torque.
function psMg1Build(e,mg2){
  const s=mg2.s,rho=PS.rho,T1=PS.mg1Margin*e.score.peakTQ*rho/(1+rho),P1=PS.mg1Share*e.score.peakHP*745.7;
  const T2=motorMaxTorque(mg2,100,PS.busV,60);
  let k2=mg2.nMax;for(let r=100;r<=mg2.nMax;r+=100)if(motorMaxTorque(mg2,r,PS.busV,60)<T2*0.999){k2=r;break;}
  const knee1=P1/T1*30/Math.PI,stack=Math.max(5,s.stackL*k2/knee1);
  let amps=s.invAmps*(T1/T2)/(stack/s.stackL),m=null;
  for(let it=0;it<4;it++){   // saturation bends torque from current: settle the current on the torque
    m=motorBuild(Object.assign({},s,{stackL:stack,invAmps:amps}));
    amps*=T1/Math.max(1,motorMaxTorque(m,100,PS.busV,60));
  }
  return motorBuild(Object.assign({},s,{stackL:stack,invAmps:amps}));
}
// The electrical power MG1 puts on the bus (W, negative drawing) holding the sun torque Ts at the sun speed ns.
function psMg1Elec(hy,Ts,ns,temp){
  const P=Ts*ns*Math.PI/30;
  return P-motorLosses(hy.mg1,Math.abs(Ts),Math.max(Math.abs(ns),1),PS.busV,temp).total;
}
// MG2's most torque (Nm, negative braking) for the electrical power Pin it has (W): T w + losses(T) <= Pin, on its envelope.
function psMg2For(hy,n2,Pin,temp){
  const m=hy.motor,Tm=motorMaxTorque(m,Math.max(n2,1),PS.busV,60),w=n2*Math.PI/30;
  const need=t=>t*w+motorLosses(m,Math.abs(t),Math.max(n2,1),PS.busV,temp).total;
  if(need(Tm)<=Pin)return Tm;
  if(need(-Tm)>Pin)return -Tm;
  let lo=-Tm,hi=Tm;for(let k=0;k<28;k++){const mid=(lo+hi)/2;if(need(mid)>Pin)hi=mid;else lo=mid;}
  return lo;
}
// The engine speeds MG1 allows at a ring speed (rpm): |ns| within MG1's top speed.
function psEngineRange(hy,nr){
  const rho=PS.rho,n1=hy.mg1.nMax,e=engine;
  return {lo:Math.max(0,(nr-n1*rho)/(1+rho)),hi:Math.min(e.redline,(n1*rho+nr)/(1+rho))};
}
// Full throttle at an MG2 speed (rpm): the engine at the speed that gives the most at the wheels, its torque cut to
// what MG1 can hold, MG1's power through MG2, and the pack's Pb (W) on top. Returns the torque at the MG2 shaft (the
// powertrain's shaft: the ring's torque comes in through the 65:17 gear) and the engine's speed and power there.
function psFullLoad(n2,Pb,tqAt){
  const e=engine,hy=e.hy,rho=PS.rho,nr=n2/PS.k2,R=psEngineRange(hy,nr),tc=hy.motor.cool.tCool,temp={w:tc,c:tc,r:60};
  let best={tq:psMg2For(hy,n2,Pb,temp),ne:0,Pe:0};   // the engine stopped: MG2 on the pack alone
  if(R.hi>R.lo){
    const N=24,r0=Math.max(R.lo,e.idleRpmEff||700);
    for(let k=0;k<=N;k++){
      const ne=r0+(R.hi-r0)*k/N;if(ne<=0)continue;
      const ns=((1+rho)*ne-nr)/rho;
      const T1=motorMaxTorque(hy.mg1,Math.max(Math.abs(ns),1),PS.busV,60);
      const Te=Math.min(tqAt(ne),T1*(1+rho)/rho);if(!(Te>0))continue;
      const Ts=Te*rho/(1+rho),Pe1=psMg1Elec(hy,Ts,ns,temp);
      const T2=psMg2For(hy,n2,Pe1+Pb,temp),tq=Te/(1+rho)/PS.k2+T2;
      if(tq>best.tq)best={tq,ne,Pe:Te*ne*Math.PI/30};
    }
  }
  return best;
}
// The curves the vehicle reads, on MG2's speed from rest to its top speed: the eCVT on the engine alone (eng), what the
// pack adds at full deploy (mot), and the share of the engine's power that reaches the shaft (eta: the electrical
// path's losses), which the lap's fuel uses.
function psCurves(){
  const e=engine,hy=e.hy,curve=buildTorqueCurve();
  const tqAt=rpm=>{if(rpm<=curve[0].rpm)return curve[0].tq;for(let i=1;i<curve.length;i++)if(rpm<=curve[i].rpm)return curve[i-1].tq+(curve[i].tq-curve[i-1].tq)*(rpm-curve[i-1].rpm)/(curve[i].rpm-curve[i-1].rpm);return 0;};
  const Pb=packMaxPower(hy.pack,HYB_SOC),nMax=hy.motor.nMax,step=Math.max(50,Math.round(nMax/100/50)*50);
  const eng=[],mot=[],full=[],eta=[],ne=[];
  for(let r=0;r<=nMax+1;r+=step){
    const n=Math.min(r,nMax),a=psFullLoad(n,0,tqAt),b=psFullLoad(n,Pb,tqAt),w=Math.max(n,1)*Math.PI/30;
    eng.push({rpm:n,tq:Math.max(0,a.tq)});mot.push(Math.max(0,b.tq-Math.max(0,a.tq)));full.push(b.tq);ne.push(a.ne);
    eta.push(a.Pe>0?clamp(Math.max(0,a.tq)*w/a.Pe,0.5,1):0.9);
    if(n>=nMax)break;
  }
  return {eng,mot,full,eta,ne};
}
// The engine's best line (the optimal operating line): for each power, the speed that burns least, at the map's
// warm temperature. A power-split's controller holds the engine on it. Cached per build.
function psOol(){
  const e=engine;
  if(e._ool&&e._ool.score===e.score)return e._ool;
  const curve=buildTorqueCurve(),r0=Math.max(1000,e.idleRpmEff||800),r1=e.redline,NP=48,NR=36,P=[],ne=[],gs=[];
  let Pmax=0;for(const q of curve)Pmax=Math.max(Pmax,q.tq*q.rpm*Math.PI/30);
  const tqAt=rpm=>{if(rpm<=curve[0].rpm)return curve[0].tq;for(let i=1;i<curve.length;i++)if(rpm<=curve[i].rpm)return curve[i-1].tq+(curve[i].tq-curve[i-1].tq)*(rpm-curve[i-1].rpm)/(curve[i].rpm-curve[i-1].rpm);return 0;};
  for(let i=1;i<=NP;i++){
    const Pi=Pmax*i/NP;let b=null;
    for(let j=0;j<=NR;j++){
      const rpm=r0+(r1-r0)*j/NR,w=rpm*Math.PI/30,T=Pi/w;
      if(T>tqAt(rpm)*0.98)continue;
      const f=engineFuelAt(rpm,T,95);if(isFinite(f)&&(!b||f<b.f))b={f,rpm};
    }
    if(b){P.push(Pi);ne.push(b.rpm);gs.push(b.f);}
  }
  e._ool={score:e.score,P,ne,gs,Pmax:P.length?P[P.length-1]:Pmax};
  return e._ool;
}
// The best line's engine speed and fuel (g/s) for an engine power (W).
function psOolAt(Pe){
  const O=psOol(),P=O.P;
  if(!P.length)return {ne:engine.idleRpmEff,gs:NaN};
  if(Pe<=P[0])return {ne:O.ne[0],gs:O.gs[0]*Pe/P[0]};
  for(let i=1;i<P.length;i++)if(Pe<=P[i]){const f=(Pe-P[i-1])/(P[i]-P[i-1]);return {ne:O.ne[i-1]+(O.ne[i]-O.ne[i-1])*f,gs:O.gs[i-1]+(O.gs[i]-O.gs[i-1])*f};}
  return {ne:O.ne[P.length-1],gs:O.gs[P.length-1]*Pe/P[P.length-1]};
}
// The driveline: one fixed reduction from MG2 to the wheels, as an electric car's (src/js/electric-car.js), matched so
// MG2's top speed falls where drag takes the system's peak power, or the car's published one.
function psDriveline(v){
  const gb=PS_REDUCTION,pt=powertrain();
  v.gb=gb;v.gbLabel=gb.label;v.shiftTime=0;v.shiftCut=0;
  v.driveEff=EV_DRIVE_EFF[v.drive]||0.97;
  v.ratios=[1];v.gearsetApprox=false;
  const pub=v.body&&v.body.fit&&v.body.fit.fd>0?v.body.fit.fd:0;v.fdPublished=pub;
  let P=0;for(const q of pt.torqueCurve())P=Math.max(P,q.tq*q.rpm*Math.PI/30);
  const vMax=dragLimitedV(P/1000*v.driveEff,v.cdA,v.crr,v.mass),nMax=pt.maxRpm();
  const matched=vMax>1?nMax*2*Math.PI*v.rTire/60/vMax:11;
  v.reductionMatched=matched;
  v.finalDrive=v.finalDriveSet>0?clamp(v.finalDriveSet,EV_FD_MIN,EV_FD_MAX)
    :clamp((pub?pub/gearingBias(52):matched)*gearingBias(v.gearing),EV_FD_MIN,EV_FD_MAX);
}
const PS_GEAR_NOTE='A power-split hybrid has no gears: one reduction from its traction motor, set with GEARING on the VEHICLE tab.';
const PS_REDUCTION={label:'eCVT (POWER-SPLIT)',shift:0,powershift:true,eff:1,stall:0,mult:1,cost:900};
// The lap's and the race's fuel: per point, the engine's share of the shaft power (the replay's power less what the pack
// gave) over the eCVT's path efficiency at that speed, burnt on the best line. Off the power the engine stops.
function psFuelRate(){
  const c=hybCurves(),R0=c.eng;
  const etaAt=rpm=>{if(rpm<=R0[0].rpm)return c.eta[0];for(let i=1;i<R0.length;i++)if(rpm<=R0[i].rpm)return c.eta[i-1]+(c.eta[i]-c.eta[i-1])*(rpm-R0[i-1].rpm)/(R0[i].rpm-R0[i-1].rpm);return c.eta[c.eta.length-1];};
  return L=>{const R=L.replay,n=R.rpm.length,out=new Float32Array(n);
    for(let i=0;i<n;i++){
      const Ps=R.pwr[i]-(L.hy?Math.max(0,L.hy.pm[i]):0);
      out[i]=Ps>0?psOolAt(Ps/etaAt(R.rpm[i])).gs:0;
    }
    return out;};
}
// The driveline line of the VEHICLE summary.
function psDrivelineLine(v){
  const hy=engine.hy;
  return '<br>'+tr('eCVT (POWER-SPLIT)')+' • '+tr('Reduction')+' <b>'+v.finalDrive.toFixed(2)+':1</b> ('+tr('matched')+' '+v.reductionMatched.toFixed(2)+':1) • MG1 '+
    Math.round(motorMaxTorque(hy.mg1,100,PS.busV,60))+' Nm • MG2 '+Math.round(motorMaxTorque(hy.motor,100,PS.busV,60))+' Nm';
}
// The engine's speed at full throttle for an MG2 speed (rpm), off the curves: what the replay's sound plays.
function psEngineRpmAt(n2){
  const c=hybCurves(),R=c.eng;
  if(n2<=R[0].rpm)return c.ne[0];
  for(let i=1;i<R.length;i++)if(n2<=R[i].rpm)return c.ne[i-1]+(c.ne[i]-c.ne[i-1])*(n2-R[i-1].rpm)/(R[i].rpm-R[i-1].rpm);
  return c.ne[c.ne.length-1];
}
