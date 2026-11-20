// ====== ECONOMY CHALLENGE: open road at a target time (build 341, EV energy build 342) ======
// Standing start, open centreline, no racing-line optimiser. Min-time first; target =
// timeFactor × that car's Tmin (eco-rally style: use the allotted time, do not rush). A speed
// cap on the open solve hits the target. ICE: fuel from engineFuelAt (warm oil). EV: pack energy
// from motorLosses + packDraw + regen, same stack as evCycle / the lap (grade included here).
// Hybrid (build 383): hybridCycle on the road's profile (ecoHybrid below). Distance DP (build 400, ecoDP) for ICE and EV.
// eco (build 352): {tab:ecoDriverTable(), s} limits the drive and the slowing to the eco driver's (below); s in [0,1]
// blends both limits back toward the car's own when the eco driver alone cannot make the target.
function ecoMinTime(line,speedCap,eco){
  const pt=powertrain(),frontF=vv=>pt.frontForce?pt.frontForce(vv):0;
  if(!pt.ready()||!vehicle.mass)return null;
  const p=line,n=p.length;
  const curve=pt.torqueCurve();
  const tqAt=rpm=>{if(rpm<=curve[0].rpm)return curve[0].tq;for(let i=1;i<curve.length;i++){if(rpm<=curve[i].rpm){const a=curve[i-1],b=curve[i];return a.tq+(b.tq-a.tq)*(rpm-a.rpm)/(b.rpm-a.rpm);}}return curve[curve.length-1].tq;};
  const m=vehicle.mass,rT=vehicle.rTire,fd=vehicle.finalDrive,eff=vehicle.driveEff,ratios=vehicle.ratios;
  const idle=pt.idleRpm(),rl=pt.maxRpm(),TWO_PI=Math.PI*2;
  const df=vehicle.df||DIFF.open,dCorner=df.corner!=null?df.corner:1;
  const muLatAt=(N,ay,vv,q)=>latBalance(N,ay,down(vv),0,vv,q).mu*dCorner;
  const axleTqMax=Math.max(1,curve.reduce((a,q)=>Math.max(a,q.tq),0)*ratios[0]*fd*(vehicle.gb&&vehicle.gb.mult||1));
  const down=v=>0.5*AIR_RHO*vehicle.clA*v*v;
  const KVCAP=0.6*m*G;
  const loadAt=(q,vv)=>Math.max(m*G*0.15,m*G*q.cosT+down(vv)+clamp(m*vv*vv*q.kv,-KVCAP,KVCAP));
  const drag=v=>0.5*AIR_RHO*vehicle.cdA*v*v;
  const rollF=v=>crrAt(vehicle.crr,v)*m*G;
  const VMAX0=vehicle.governor>0?Math.min(140,vehicle.governor/3.6):140;
  const VMAX=speedCap>0?Math.min(VMAX0,speedCap):VMAX0;
  function gearAt(v){
    let bi=ratios.length-1,bf=-1,bq=0;
    for(let i=0;i<ratios.length;i++){
      const tot=ratios[i]*fd,rpm=v*tot/rT*60/TWO_PI;
      if(rpm>rl)continue;
      const f=tqAt(clamp(rpm,idle,rl))*tot*eff/rT+frontF(v);
      if(f>bf){bf=f;bi=i;bq=tqAt(clamp(rpm,idle,rl))*tot;}
    }
    return{gear:bi,F:Math.max(0,bf),tqFrac:bq/axleTqMax};
  }
  function ceilAt(q){
    let vv=0,muLat=vehicle.mu*dCorner;
    for(let outer=0;outer<3;outer++){
      for(let it=0;it<2;it++){
        const kvTerm=it===0?-m*q.kv*muLat:0;
        const extra=it===0?0:clamp(m*vv*vv*q.kv,-KVCAP,KVCAP)*muLat;
        const denom=m/q.r-0.5*AIR_RHO*vehicle.clA*muLat+kvTerm;
        const num=muLat*m*G*q.cosT+extra;
        vv=denom>1e-6?Math.min(VMAX,Math.sqrt(Math.max(0,num/denom))):VMAX;
      }
      muLat=muLatAt(loadAt(q,vv),vv*vv/q.r,vv,q);
    }
    return vv;
  }
  const hL=vehicle.cg/Math.max(0.5,vehicle.wb),sgn=vehicle.drive==='rwd'?1:vehicle.drive==='fwd'?-1:0;
  const fWt=vehicle.fWt||0.55;
  function brakeCap(q,vi0,vNext){
    let vi=Math.min(vi0,vNext);
    for(let it=0;it<3;it++){
      const N=loadAt(q,vi),ay=vi*vi/q.r;
      const B=latBalance(N,ay,down(vi),0,vi,q);
      const u=clamp(ay/Math.max(0.1,B.mu*dCorner*N/m),0,1);
      const aTyre=B.mu*dCorner*Math.sqrt(Math.max(0,1-u*u))*G*q.cosT;
      const aBrake=Math.min(vehicle.brakeDecelCap||12,aTyre)+(drag(vi)+corneringDrag(m,ay,N))/m+G*q.sinT;
      const cap=Math.sqrt(Math.max(0,vNext*vNext+2*Math.max(0.1,aBrake)*q.ds3));
      const nv=Math.min(vi0,cap);if(Math.abs(nv-vi)<1e-4)break;vi=nv;
    }
    return vi;
  }
  function accCap(q,vi){
    const N=loadAt(q,vi),dn=down(vi);
    const N0=(N-dn)*vehicle.drivenWt+dn*vehicle.drivenAero;
    const aLat=vi*vi/q.r;
    const B=latBalance(N,aLat,dn,0,vi,q);
    const uFa=clamp(m*aLat*fWt/Math.max(1,B.capF*dCorner),0,1),uRa=clamp(m*aLat*(1-fWt)/Math.max(1,B.capR*dCorner),0,1);
    const uD=vehicle.drive==='fwd'?uFa:vehicle.drive==='rwd'?uRa:Math.max(uFa,uRa);
    const bg=gearAt(vi);
    const R=(drag(vi)+rollF(vi)*q.cosT+corneringDrag(m,aLat,N))/m+G*q.sinT;
    const nD=vehicle.drive==='awd'?4:2;
    const kk=tyreMuX(N0/nD,vehicle.drive==='fwd'?vehicle.FzRefF:vehicle.FzRef)*diffTractionAt(df,aLat,vehicle.cg,bg.tqFrac,0)*Math.sqrt(Math.max(0,1-uD*uD));
    const mE=vehicleMassEff(ratios[bg.gear]*fd);
    const aGrip=(kk*N0-m*R)/(m*Math.max(0.2,1-sgn*kk*hL)),aPow=(bg.F-m*R)/mE;
    return Math.sqrt(Math.max(1,vi*vi+2*Math.min(aPow,aGrip)*q.ds3));
  }
  // The corner ceilings depend on the cap only through VMAX's clamp: an eco solve keeps the uncapped ones (eco.vC0)
  // and clamps them, rather than solving every corner again for each cap the search tries.
  let vC;
  if(eco&&eco.vC0&&eco.vC0.length===n)vC=eco.vC0.map(x=>Math.min(x,VMAX));
  else{vC=new Array(n);for(let i=0;i<n;i++)vC[i]=ceilAt(p[i]);if(eco&&!(speedCap>0))eco.vC0=vC.slice();}
  const v=vC.slice();
  // Eco limits: slow by lifting (overrun, or regen on an EV) plus s × a 12 m/s² brake; drive at the best-efficiency
  // force plus s × 30 m/s² (the car's own grip and power still cap both, through brakeCap and accCap).
  const Rq=(q,vv)=>(drag(vv)+rollF(vv)*q.cosT)/m+G*q.sinT;
  for(let pass=0;pass<2;pass++)for(let i=n-2;i>=0;i--){
    const cap=brakeCap(p[i],v[i],v[i+1]);if(cap<v[i])v[i]=cap;
    if(eco){const vn=v[i+1],aL=ecoTabAt(eco.tab.lift,vn)/eco.tab.mEff+Rq(p[i],vn)+eco.s*12;
      const c2=Math.sqrt(vn*vn+2*Math.max(0.05,aL)*p[i].ds3);if(c2<v[i])v[i]=c2;}
  }
  v[0]=Math.min(v[0],0.5);
  for(let pass=0;pass<2;pass++)for(let i=0;i<n-1;i++){
    const cap=accCap(p[i],v[i]);if(cap<v[i+1])v[i+1]=cap;
    if(eco){const vi=v[i],aE=Math.max(0,(ecoTabAt(eco.tab.drive,vi)/eco.tab.mEff-Rq(p[i],vi)))+eco.s*30;
      const c2=Math.sqrt(Math.max(1,vi*vi+2*aE*p[i].ds3));if(c2<v[i+1])v[i+1]=c2;}
  }
  let t=0;for(let i=0;i<n-1;i++)t+=p[i].ds3/Math.max(2,(v[i]+v[i+1])/2);
  return{v,vC,t};
}
// ---- The eco driver (build 352) ----
// What eco-driving research finds for a trip that must take a set time:
//  · ICE: work the engine at its best-efficiency point, then glide. Pulse-and-glide studies run the engine between
//    its minimum-BSFC point and idle or fuel cut (Li, Li, Wang & Peng, ACC 2011, "Mechanism analysis of
//    pulse-and-gliding", skoge.folk.ntnu.no/prost/proceedings/acc11/data/papers/0275.pdf). Shifting up early saves
//    fuel (Saerens et al., cited in Linköping MSc thesis LiTH-ISY-EX--12; fleet guidance gives 2000–2500 rpm on
//    petrol, 1200–1500 on diesel, Webfleet). Here the drive force at each speed is the gear and torque with the lowest
//    BSFC on this engine's own fuel map, so the shift speed comes out of the map, not a rule.
//  · Slowing: lift early. An ICE slows on engine braking in fuel cut (DFCO: no fuel), in the gear under the redline
//    that brakes most (downshifting for it), so a descent into a corner needs no brake. An EV slows on regen alone, up to its regen table (mainstream EVs reach ~2.5 m/s² on
//    regen, ~5 with friction: field study, par.nsf.gov/servlets/purl/10511946). Friction braking turns the energy to
//    heat, so the eco driver plans its slowing inside what regen can take.
//  · EV drive: the motor torque with the highest efficiency T·w / (T·w + losses) at that speed (motorLosses).
// Tables over speed (1 m/s steps) of the drive force and the lift force at the wheels (N).
const ECO_BLENDS=[0,0.05,0.2,1];   // eco-limit blends searched (0 pure eco, 1 the car's own limits)
function ecoTabAt(a,v){const x=clamp(v,0,a.length-1),i=Math.min(a.length-2,Math.floor(x)),f=x-i;return a[i]*(1-f)+a[i+1]*f;}
function ecoDriverTable(){
  const pt=powertrain(),r=vehicle.rTire,fd=vehicle.finalDrive,eff=vehicle.driveEff,ratios=vehicle.ratios;
  const rl=pt.maxRpm(),ov=pt.overrunTable(rl),ovAt=rpm=>ov[clamp(Math.round((rpm-500)/250),0,ov.length-1)]||0;
  const drive=[],lift=[],shift=[],vTop=Math.ceil(Math.min(140,(vehicle.governor>0?vehicle.governor/3.6:140)))+2;
  const ev=isElectric()&&engine.motor;
  const mEff=vehicle.mass+(vehicle.wheelI||0)/(r*r);
  if(ev){
    const e=engine,V=motorRatedV(e),temp=Object.assign({},EV_CYCLE.temp),curve=pt.torqueCurve();
    const tqAt=rpm=>{let q=curve[curve.length-1].tq;for(let i=1;i<curve.length;i++)if(rpm<=curve[i].rpm){const a=curve[i-1],b=curve[i];q=a.tq+(b.tq-a.tq)*(rpm-a.rpm)/(b.rpm-a.rpm);break;}return rpm<=curve[0].rpm?curve[0].tq:q;};
    for(let v=0;v<=vTop;v++){
      const rpm=Math.max(300,v/r*fd*60/(2*Math.PI)),w=rpm*Math.PI/30,Tm=tqAt(rpm);
      let bT=Tm,bE=-1;
      for(let k=1;k<=10;k++){const T=Tm*k/10,L=motorLosses(e.motor,T,rpm,V,temp).total,eta=T*w/(T*w+L);if(eta>bE){bE=eta;bT=T;}}
      drive.push(bT*fd*eff/r);lift.push(ovAt(rpm)*fd/r);shift.push(1);
    }
    return{drive,lift,shift,mEff,ev:true};
  }
  const e=engine,C=FUEL_CYCLE,M=engineFuelMap(95),curve=pt.torqueCurve();
  const Tmax=rpm=>{if(rpm<=curve[0].rpm)return curve[0].tq;for(let i=1;i<curve.length;i++)if(rpm<=curve[i].rpm)return curve[i-1].tq+(curve[i].tq-curve[i-1].tq)*(rpm-curve[i-1].rpm)/(curve[i].rpm-curve[i-1].rpm);return 0;};
  const rpmMin=Math.max(e.idleRpmEff*C.idleMargin,e.ci?C.minRpmCI:C.minRpm);
  for(let v=0;v<=vTop;v++){
    let bF=0,bB=Infinity,bG=1,lf=0;
    for(let g=0;g<ratios.length;g++){
      const tot=ratios[g]*fd,rpm=v/r*tot*60/(2*Math.PI);
      if(rpm>Math.min(rl,e.redline))continue;
      if(rpm<rpmMin&&g>0)continue;
      const rE=Math.max(rpm,rpmMin),w=rE*Math.PI/30,Tm=C.reserve*Tmax(rE);
      for(let k=3;k<=10;k++){
        const T=Tm*k/10,gs=engineFuelAtMap(M,rE,T);if(!(gs>0))continue;
        const b=gs/(T*w);if(b<bB){bB=b;bF=T*tot*eff/r;bG=g+1;}
      }
      if(rpm>=C.cutRpm)lf=Math.max(lf,ovAt(rpm)*tot/r);   // engine braking in fuel cut, the gear that brakes most
    }
    drive.push(bF);lift.push(lf);shift.push(bG);
  }
  return{drive,lift,shift,mEff,ev:false};
}
// The engine's fuel rule on the economy road (build 400; ecoFuelKg and the distance DP both use it). Warm oil; the gear
// with least fuel, as WLTP. Overrun: fuel cut needs a gear whose engine braking is no more than the slowing asked for
// (the brakes add the rest); a gentler glide is in neutral at idle fuel (until build 400 every glide was free and
// drag-free). Past the 90% torque reserve in every gear the engine runs at full load in the gear that costs least,
// and a demand past the fuel map's full load is charged pro rata at that point's BSFC. Until build 400 such a point
// fell through to 3 × idle fuel (the map has no fuel past its own full load), which the eco blends leaned on.
function ecoFuelRule(){
  const e=engine,C=FUEL_CYCLE,M=engineFuelMap(95),r=vehicle.rTire,fd=vehicle.finalDrive,eff=vehicle.driveEff,ratios=vehicle.ratios;
  const curve=powertrain().torqueCurve();
  const Tmax=rpm=>{if(rpm<=curve[0].rpm)return curve[0].tq;for(let i=1;i<curve.length;i++)if(rpm<=curve[i].rpm)return curve[i-1].tq+(curve[i].tq-curve[i-1].tq)*(rpm-curve[i-1].rpm)/(curve[i].rpm-curve[i-1].rpm);return 0;};
  const rpmMin=Math.max(e.idleRpmEff*C.idleMargin,e.ci?C.minRpmCI:C.minRpm);
  const ov=COMBUSTION.overrunTable(Math.max(e.redline,powertrain().maxRpm())),ovAt=rpm=>ov[clamp(Math.round((rpm-500)/250),0,ov.length-1)]||0;
  // The map's own full load at an engine speed (its top finite torque on both rows engineFuelAtMap blends).
  const tops=M.tq.map((tr,i)=>tr.reduce((a,t,j)=>isFinite(M.fg[i][j])?Math.max(a,t):a,0));
  const topAt=rpm=>{const R=M.rpms,x=clamp((rpm-R[0])/(R[R.length-1]-R[0]),0,1)*(R.length-1),i=Math.min(R.length-2,Math.floor(x));return Math.min(tops[i],tops[i+1]);};
  const gearsAt=vm=>{const out=[];for(let g=0;g<ratios.length;g++){
    const tot=ratios[g]*fd,rpm=vm/r*tot*60/(2*Math.PI);
    if(rpm>e.redline)continue;
    if(rpm<rpmMin&&g>0)continue;
    const rpmE=Math.max(rpm,rpmMin);out.push({g,tot,rpm,rpmE,w:rpmE*Math.PI/30,Tm:Tmax(rpmE)});}return out;};
  // {gs (g/s), rpm, g (1-based)} at mean speed vm (m/s) and wheel force F (N); gs is null if no gear can turn at vm.
  const at=(vm,F,gears)=>{
    gears=gears||gearsAt(vm);
    let gs=null,rpm=0,g=0;
    for(const q of gears){
      let x;
      if(F<=0)x=q.rpmE>C.cutRpm&&ovAt(q.rpm)*q.tot/r<=-F?0:M.idleGs;
      else{const T=F*vm/eff/q.w+C.auxW/q.w;if(T>C.reserve*q.Tm)continue;x=engineFuelAtMap(M,q.rpmE,T);if(!isFinite(x))continue;}
      if(gs==null||x<gs){gs=x;rpm=q.rpmE;g=q.g+1;}
    }
    if(gs==null&&F>0)for(const q of gears){
      const T=F*vm/eff/q.w+C.auxW/q.w,Tt=Math.min(T,q.Tm,topAt(q.rpmE)*0.999),x=Tt>0?engineFuelAtMap(M,q.rpmE,Tt)*T/Tt:NaN;
      if(isFinite(x)&&(gs==null||x<gs)){gs=x;rpm=q.rpmE;g=q.g+1;}
    }
    return{gs,rpm,g};
  };
  return{at,gearsAt,ovF:q=>ovAt(q.rpm)*q.tot/r,M,C};
}
// Fuel (kg) along a speed profile on an open line (ecoFuelRule at each step).
// stats (build 352), if given, gets the time-weighted mean engine speed while driving (rpm) and the top gear used.
function ecoFuelKg(line,v,stats){
  if(isElectric())return null;
  const p=line,n=p.length,m=vehicle.mass+FUEL_CYCLE.massAdd,r=vehicle.rTire,fd=vehicle.finalDrive,e=engine;
  const X=ecoFuelRule(),meff=m+(vehicle.wheelI||0)/(r*r)+(e.inertia||0.15)*(vehicle.ratios[0]*fd/r)**2;
  let fuel=0,rpmT=0,tDrive=0,topG=0;
  for(let i=0;i<n-1;i++){
    const ds=p[i].ds3,v0=v[i],v1=v[i+1],vm=Math.max(0.5,(v0+v1)/2),dt=ds/vm;
    const a=(v1*v1-v0*v0)/(2*Math.max(0.05,ds));
    const F=meff*a+0.5*AIR_RHO*vehicle.cdA*vm*vm+crrAt(vehicle.crr,vm)*m*G*p[i].cosT+m*G*p[i].sinT;
    const q=X.at(vm,F),gs=q.gs!=null?q.gs:X.M.idleGs*3;
    fuel+=gs*dt;
    if(F>0&&q.rpm){rpmT+=q.rpm*dt;tDrive+=dt;topG=Math.max(topG,q.g);}
  }
  if(stats){stats.rpm=tDrive>0?rpmT/tDrive:0;stats.topGear=topG;}
  return fuel/1000;
}
function ecoTimeOf(line,v){
  let t=0;for(let i=0;i<line.length-1;i++)t+=line[i].ds3/Math.max(2,(v[i]+v[i+1])/2);return t;
}
// Pack energy (J drawn, net after regen) along a speed profile. Same rules as evCycle: test mass +100 kg,
// 250 W aux, regen table, packDraw heat. Grade is on the open road.
function ecoEnergyJ(line,v){
  if(!isElectric()||!engine.motor||!engine.pack)return null;
  const e=engine,C=EV_CYCLE,m=vehicle.mass+C.massAdd,r=vehicle.rTire,fd=vehicle.finalDrive,eff=vehicle.driveEff;
  const V=motorRatedV(e),temp=Object.assign({},C.temp),regen=evRegenTable(e,e.redline);
  // Losses memoised on a 10 rpm × 1 Nm grid (build 352): a long road repeats the same points, and motorLosses is slow.
  const memo=new Map(),loss=(T,rpm)=>{const kr=Math.round(rpm/10),kt=Math.round(T),k=kr*100000+kt;let L=memo.get(k);
    if(L===undefined){L=motorLosses(e.motor,kt,Math.max(kr*10,1),V,temp).total;memo.set(k,L);}return L;};
  const meff=m+(vehicle.wheelI||0)/(r*r)+e.motor.J*(fd/r)**2;
  let E=0,back=0;
  for(let i=0;i<line.length-1;i++){
    const ds=line[i].ds3,v0=v[i],v1=v[i+1],vm=Math.max(0.5,(v0+v1)/2),dt=ds/vm;
    const a=(v1*v1-v0*v0)/(2*Math.max(0.05,ds));
    const F=meff*a+0.5*AIR_RHO*vehicle.cdA*vm*vm+crrAt(vehicle.crr,vm)*m*G*line[i].cosT+m*G*line[i].sinT;
    const rpm=vm/r*fd*60/(2*Math.PI),w=rpm*Math.PI/30;
    let T=0;
    if(F>0)T=F*r/(fd*eff);
    else if(F<0&&rpm>=500)T=-Math.min(-F*r*eff/fd,regen[Math.min(regen.length-1,Math.floor((rpm-500)/250))]);
    const L=T||rpm>0?loss(T,rpm):0;
    const P=T*w+L,d=packDraw(e.pack,C.soc,P),Pb=P+(d?d.heat:0)+C.auxW;
    E+=Pb*dt;if(T<0)back-=T*w*dt;
  }
  return{E,regenJ:back};
}
// A hybrid on the road (build 383): the speed profile as hybridCycle's steps (fuel-cycle.js), so the charge-sustaining
// energy manager (ECMS: electric only, engine with load-point shifting, regen within the motor's and the pack's limits,
// the same rule as hybRegenTable) runs on the road's own grade. Warm start at the tune's target charge; the pack ends
// where it started (or the R154 charge correction is added as fuel, as on WLTC). Same mass and 12 V load as ecoFuelKg.
function ecoHybrid(line,v){
  if(!isHybrid())return null;
  const segs=[];
  for(let i=0;i<line.length-1;i++){
    const ds=line[i].ds3,v0=v[i],v1=v[i+1],vm=Math.max(0.5,(v0+v1)/2);
    segs.push({vm,dt:ds/vm,a:(v1*v1-v0*v0)/(2*Math.max(0.05,ds)),sinT:line[i].sinT,cosT:line[i].cosT});
  }
  return hybridCycle(vehicle,{segs});
}
// ---- Distance DP (build 400) ----
// The eco driver above follows fixed rules (best-BSFC drive, lift, a speed cap). This finds the speed profile itself:
// a dynamic programme over distance in stages of ~50 m (state: speed on a 0.5 m/s grid, from rest; within a stage v²
// is linear, i.e. constant acceleration), minimising fuel (ICE, g) or pack energy (EV, J) plus λ × time, with λ
// bisected so the finish time meets the target (the Lagrangian form of "least fuel in a set time"). Its cost is the
// pricing below (ecoFuelKg's gear pick and overrun rule, ecoEnergyJ's motor and pack), tabulated over speed × wheel
// force, so it can choose pulse-and-glide (best-BSFC pulse, neutral glide at idle) and lift-coast before climbs and
// corners where they pay. Speeds stay under the min-time profile (corner and braking limits), drive force under the
// full-load force (the reserve ecoFuelKg allows), braking under ECO_DP.aBrake. The profile is then priced by the
// same functions as the eco driver. Hybrids are not solved here (named open).
// Pulse-and-glide as optimal control under a time constraint: Li, Li, Wang & Peng, ACC 2011 (cited above).
const ECO_DP={on:true,stage:50,dv:0.5,aBrake:4,nF:48,iters:10};
function ecoCostTable(nS,dv){
  const hv=dv/2,nJ=2*nS+1,nF=ECO_DP.nF,r=vehicle.rTire,fd=vehicle.finalDrive,eff=vehicle.driveEff,ratios=vehicle.ratios;
  const tab=new Float64Array(nJ*nF),Fmax=new Float64Array(nJ),Fmin=new Float64Array(nJ),glide=new Float64Array(nJ),idle=new Float64Array(nJ);
  const curve=powertrain().torqueCurve();
  const Tmax=rpm=>{if(rpm<=curve[0].rpm)return curve[0].tq;for(let i=1;i<curve.length;i++)if(rpm<=curve[i].rpm)return curve[i-1].tq+(curve[i].tq-curve[i-1].tq)*(rpm-curve[i-1].rpm)/(curve[i].rpm-curve[i-1].rpm);return 0;};
  const e=engine;
  if(isElectric()){   // pack power (W) as ecoEnergyJ: motor, regen up to its table, pack heat, 250 W aux
    const C=EV_CYCLE,m=vehicle.mass+C.massAdd,V=motorRatedV(e),temp=Object.assign({},C.temp),regen=evRegenTable(e,e.redline);
    const meff=m+(vehicle.wheelI||0)/(r*r)+e.motor.J*(fd/r)**2;
    for(let j=1;j<nJ;j++){
      const vm=j*hv,rpm=vm/r*fd*60/(2*Math.PI),w=rpm*Math.PI/30;
      const Treg=rpm>=500?regen[Math.min(regen.length-1,Math.floor((rpm-500)/250))]:0;
      Fmax[j]=rpm>e.redline?-1:Tmax(rpm)*fd*eff/r;Fmin[j]=-Treg*fd/(r*eff)-1;
      for(let q=0;q<nF;q++){
        const F=Fmin[j]+(Math.max(0,Fmax[j])-Fmin[j])*q/(nF-1);
        const T=F>0?F*r/(fd*eff):F<0&&rpm>=500?-Math.min(-F*r*eff/fd,Treg):0;
        const P=T*w+(T||rpm>0?motorLosses(e.motor,T,Math.max(rpm,1),V,temp).total:0),d=packDraw(e.pack,C.soc,P);
        tab[j*nF+q]=P+(d?d.heat:0)+C.auxW;
      }
    }
    return{tab,Fmax,Fmin,glide,idle,nF,m,meff,ev:true};
  }
  const X=ecoFuelRule(),C=X.C,m=vehicle.mass+C.massAdd;
  const meff=m+(vehicle.wheelI||0)/(r*r)+(e.inertia||0.15)*(ratios[0]*fd/r)**2;
  for(let j=1;j<nJ;j++){
    const vm=j*hv,gears=X.gearsAt(vm);let fx=-1;
    for(const q of gears)fx=Math.max(fx,(q.Tm*q.w-C.auxW)*eff/vm);   // full load (the reserve is priced, not a wall)
    Fmax[j]=gears.length?fx:-1;
    for(let q=0;q<nF;q++){const z=X.at(vm,Math.max(0,fx)*q/(nF-1),gears);tab[j*nF+q]=z.gs!=null?z.gs:X.M.idleGs*3;}
    // F ≤ 0: a step function of F (fuel cut past the weakest engine braking, else idle): sampled exactly in rate()
    let gl=Infinity;for(const q of gears)if(q.rpmE>C.cutRpm)gl=Math.min(gl,X.ovF(q));
    glide[j]=gl;idle[j]=X.M.idleGs;
  }
  return{tab,Fmax,Fmin,glide,idle,nF,m,meff,ev:false};
}
// env: the min-time profile (upper bound at each point). Returns {v,t,ms} or null if no λ makes the target.
function ecoDP(line,env,target){
  const t0=performance.now(),n=line.length,dv=ECO_DP.dv;
  const K=Math.max(1,Math.round(ECO_DP.stage/Math.max(1,line[0].ds3||5)));
  const B=[0];for(let i=K;i<n-1-K/2;i+=K)B.push(i);B.push(n-1);
  const S=B.length-1;
  let vTop=0;for(const x of env)vTop=Math.max(vTop,x);
  const nS=Math.ceil(vTop/dv)+1,T=ecoCostTable(nS,dv),nF=T.nF,m=T.m,meff=T.meff;
  const nJ=2*nS+1,aero=new Float64Array(nJ),roll=new Float64Array(nJ);
  for(let j=0;j<nJ;j++){const vm=j*dv/2;aero[j]=0.5*AIR_RHO*vehicle.cdA*vm*vm;roll[j]=crrAt(vehicle.crr,vm)*m*G;}
  const rate=(j,F)=>{
    if(!T.ev&&F<=0)return -F>=T.glide[j]?0:T.idle[j];
    const lo=T.Fmin[j],x=(Math.max(F,lo)-lo)/Math.max(1e-9,T.Fmax[j]-lo)*(nF-1),q=Math.min(nF-2,Math.floor(x)),f=x-q,o=j*nF+q;
    return T.tab[o]*(1-f)+T.tab[o+1]*f;
  };
  const L=new Float64Array(S),gr=new Float64Array(S),cosA=new Float64Array(S),cap=new Int32Array(S+1);
  for(let s=0;s<S;s++){let l=0,si=0,co=0;for(let i=B[s];i<B[s+1];i++){const d=line[i].ds3;l+=d;si+=d*line[i].sinT;co+=d*line[i].cosT;}
    L[s]=Math.max(0.1,l);gr[s]=m*G*si/L[s];cosA[s]=co/L[s];}
  for(let b=0;b<=S;b++)cap[b]=Math.max(0,Math.min(nS-1,Math.floor(env[B[b]]/dv+1e-9)));   // between nodes: clamped below
  cap[0]=0;
  const pred=new Int16Array(S*nS),aB=ECO_DP.aBrake;
  let cost=new Float64Array(nS),nc=new Float64Array(nS);
  const solve=lam=>{
    cost.fill(Infinity);cost[0]=0;
    for(let s=0;s<S;s++){
      nc.fill(Infinity);const l=L[s],cA=cosA[s],g=gr[s],c1=cap[s+1],po=s*nS;
      for(let i=0;i<=cap[s];i++){
        const ci=cost[i];if(ci===Infinity)continue;
        const vi=i*dv,kLo=Math.ceil(Math.sqrt(Math.max(0,vi*vi-2*aB*l))/dv-1e-9);
        for(let k=Math.max(kLo,i===0?1:0);k<=c1;k++){
          const j=i+k,vm=j*dv/2,vk=k*dv,F=meff*(vk*vk-vi*vi)/(2*l)+aero[j]+roll[j]*cA+g;
          if(F>T.Fmax[j])break;
          const c=ci+(rate(j,F)+lam)*l/vm;
          if(c<nc[k]){nc[k]=c;pred[po+k]=i;}
        }
      }
      const tmp=cost;cost=nc;nc=tmp;
    }
    let kb=-1,cb=Infinity;for(let k=0;k<nS;k++)if(cost[k]<cb){cb=cost[k];kb=k;}
    if(kb<0)return null;
    const node=new Int32Array(S+1);node[S]=kb;for(let s=S-1;s>=0;s--)node[s]=pred[s*nS+node[s+1]];
    const v=new Array(n);
    for(let s=0;s<S;s++){const a2=(node[s]*dv)**2,b2=(node[s+1]*dv)**2;let x=0;
      for(let i=B[s];i<B[s+1];i++){v[i]=Math.min(env[i],Math.sqrt(a2+(b2-a2)*x/L[s]));x+=line[i].ds3;}}
    v[n-1]=Math.min(env[n-1],node[S]*dv);v[0]=env[0];   // the standing start as ecoMinTime has it (≤ 0.5 m/s)
    return{v,t:ecoTimeOf(line,v)};
  };
  // λ scale: the cost rate of a 20 m/s cruise on the flat; bisect log λ over 10⁻² … 10² of it.
  const j0=Math.min(nJ-1,80),r0=Math.max(1e-6,rate(j0,aero[j0]+roll[j0]));
  let lo=Math.log(r0*1e-2),hi=Math.log(r0*1e2),best=solve(Math.exp(hi));
  if(!best||best.t>target)return null;
  let slow=null;
  for(let it=0;it<ECO_DP.iters;it++){const mid=(lo+hi)/2,r=solve(Math.exp(mid));if(r&&r.t<=target){hi=mid;best=r;}else{lo=mid;if(r)slow=r;}}
  // The time jumps between neighbouring λ (a discrete plan); mix the last plan too slow and the first in time,
  // speed by speed, and bisect the mix so the finish lands on the target rather than up to ~4% early.
  if(slow&&best.t<target*0.999){
    let a=0,b=1;
    for(let it=0;it<12;it++){const c=(a+b)/2,v=best.v.map((x,i)=>x*(1-c)+slow.v[i]*c),t=ecoTimeOf(line,v);
      if(t<=target){a=c;best={v,t};}else b=c;}
  }
  best.ms=performance.now()-t0;best.stages=S;best.states=nS;
  return best;
}
// Eco strategy (build 352): the eco driver (ecoDriverTable) on the open solve, then a speed cap so the finish time hits
// the target (not early). If the eco driver alone is too slow for the target, its limits are blended back toward the
// car's own (s) until it makes it. factorOpt (build 344): UI pace 1.25 / 1.5 / 2.0; else the road's timeFactor.
function simulateEconomyChallenge(roadKey,factorOpt){
  const road=buildRoad(roadKey||'alpine');if(!road)return null;
  const pt=powertrain();if(!pt.ready()||!vehicle.mass)return null;
  // cap: the road's speed limit, m/s (a user GPX road; the built-in roads carry none, 0 = no cap).
  const line=road.line,cap=road.vLimit||0,mt=ecoMinTime(line,cap);if(!mt)return null;
  const factor=factorOpt>0?factorOpt:(road.timeFactor||1.25),target=mt.t*factor;
  const tab=ecoDriverTable(),km=road.length/1000,fp=FUELS[engine.fuel]||FUELS.gasoline;
  // For a blend s of the eco limits, the speed cap that finishes on the target (or, if the eco limits are too slow
  // even uncapped, no cap); then the blend that spends least. s = 0 is the pure eco driver; s = 1 is the plain speed
  // cap that shipped in build 341, so the search can only match or beat it.
  const vC0=mt.vC;
  const solveAt=s=>{
    const eo={tab,s,vC0:vC0};let best=ecoMinTime(line,cap,eo);
    if(best.t>target)return null;
    let lo=15/3.6,hi=Math.max(...best.v)+1;
    for(let k=0;k<10;k++){const mid=(lo+hi)/2,r=ecoMinTime(line,cap>0?Math.min(mid,cap):mid,eo);if(r.t>target)lo=mid;else{hi=mid;best=r;}}
    return best;
  };
  const hyb=isHybrid(),hybOf=new Map(),hybAt=vv=>hybOf.get(vv)||(hybOf.set(vv,ecoHybrid(line,vv)),hybOf.get(vv));   // a plan's hybrid result, priced once (build 406)
  const cost=r=>isElectric()?(ecoEnergyJ(line,r.v)||{E:Infinity}).E:hyb?hybAt(r.v).kg:ecoFuelKg(line,r.v);
  // Engine cars and EVs: the distance DP (build 400). On the 190 runs measured at Alpine and the Dragon it beat the eco
  // driver every time, by 9-32%, so the eco driver's blends run only when the DP finds no plan for the target (each
  // blend costs ~11 capped solves; running both pushed long roads past 4 s). Hybrids keep the blends.
  let best=null,s=1,bestC=Infinity,dpMs=null,dpUsed=false;
  if(ECO_DP.on&&!hyb){const d=ecoDP(line,mt.v,target);if(d){dpMs=d.ms;best=d;dpUsed=true;s=0;}}
  if(!best){
    for(const sk of ECO_BLENDS){const r=solveAt(sk);if(!r)continue;const c=cost(r);if(c<bestC){bestC=c;best=r;s=sk;}}
    if(!best){best=solveAt(1)||mt;s=1;}
  }
  const v=best.v,time=best.t;
  // Peak acceleration and deceleration of the eco profile (m/s²), shown so the driving style can be read off the result.
  let aUp=0,aDn=0;for(let i=0;i<line.length-1;i++){const a=(v[i+1]*v[i+1]-v[i]*v[i])/(2*Math.max(0.05,line[i].ds3));if(a>aUp)aUp=a;if(-a>aDn)aDn=-a;}
  const base={ok:true,ev:isElectric(),road,time,limit:target,target,tMin:mt.t,pace:time/mt.t,v,vMin:mt.v,lengthKm:km,factor,
    ecoBlend:s,ecoDP:dpUsed,dpMs,aUp,aDn,vTop:Math.max(...v)*3.6};
  if(isElectric()){
    const en=ecoEnergyJ(line,v),enMin=ecoEnergyJ(line,mt.v);
    if(!en)return{ok:false,reason:'electric',road};
    const kWh=en.E/3.6e6,whkm=en.E/3600/km,kWhMin=enMin?enMin.E/3.6e6:null;
    return Object.assign(base,{kWh,whkm,regenKWh:en.regenJ/3.6e6,kWhMin});
  }
  if(hyb){   // fuel (charge-sustained) and the pack's energy out and back (build 383)
    const h=hybAt(v),hm=hybAt(mt.v),L=h.kg/fp.density;
    if(engine)engine._hmemo=null;   // the shared loss and fuel tables (hybridCycle) are freed once the run is priced
    return Object.assign(base,{hybrid:true,fuelL:L,fuelKg:h.kg,l100:L/km*100,fuelLMin:hm.kg/fp.density,engOff:1-h.onShare,
      packOutKWh:h.packOutKWh,packInKWh:h.packInKWh,dSocKWh:h.dSocKJ/3600,corrected:h.corrected,limitShare:h.limitShare});
  }
  const st={},kg=ecoFuelKg(line,v,st);
  const L=kg/fp.density,kgMin=ecoFuelKg(line,mt.v),Lmin=kgMin/fp.density;
  return Object.assign(base,{fuelL:L,fuelKg:kg,l100:L/km*100,fuelLMin:Lmin,rpmDrive:st.rpm,topGear:st.topGear});
}
// ====== FIXED-TIME STAGE (build 352) ======
// Point to point against a set time, the same for every car: the car's min-time on the open road (ecoMinTime, from
// rest) against the stage's target. Slower than the target is a DNF (did not finish inside the time), not an error.
function simulateStageChallenge(roadKey,target){
  const road=buildRoad(roadKey||'alpine');if(!road)return null;
  const pt=powertrain();if(!pt.ready()||!vehicle.mass)return null;
  const mt=ecoMinTime(road.line,road.vLimit||0);if(!mt)return null;
  const km=road.length/1000;
  return{ok:true,kind:'stage',road,time:mt.t,target,tMin:mt.t,margin:mt.t-target,dnf:mt.t>target,v:mt.v,vMin:mt.v,
    lengthKm:km,avgKmh:km/(mt.t/3600),vTop:Math.max(...mt.v)*3.6};
}
