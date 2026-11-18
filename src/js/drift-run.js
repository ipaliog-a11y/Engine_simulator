// ====== S-ROUTE POWERSLIDE (build 358) ======
// Point-to-point S: straight → left 90° → short straight → right 90° → straight. The driver aims a drift line
// (sustain the slide), not the minimum-time racing line. Physics: stepCar with ESP/TC off. Methods and failure
// modes: plans/drift-challenge.md (Hindiyeh 2013; Velenis AVEC 2010).
//
// Outcomes (worst first): SPIN, OFF, NO_SLIDE, FADE, CLEAR.
//   CLEAR     both corners: rear past its peak for ≥0.25 s, body slip β > 8°, and countersteer (or a long slide)
//   FADE      only one corner qualified (initiated then lost the other, or never linked)
//   NO_SLIDE  finished on the road with neither corner past the rear peak (typical FWD on power-over)
//   OFF       left the road half-width, or never reached the exit
//   SPIN      heading > ~0.7π from the path, or β > ~77°
const DRIFT_RANK={CLEAR:0,FADE:1,NO_SLIDE:2,OFF:3,SPIN:4};
const DRIFT_HALF_W=12;   // half road width (m): a drift-pad lane, not a single carriageway
const DRIFT_MID=34;      // short straight between the two corners (m)
// Plans: entry speed v (m/s), target |β| (rad), clutch-kick steps, corner radius R (m). Mild β first — Velenis's
// expert data was ~32° on dirt; dry asphalt here holds ~12–30° with power-over / clutch kick.
const DRIFT_PLANS=[];
for(const betaT of[0.20,0.24,0.28])for(const v of[9,10,11,12])for(const kick of[0,10,20])for(const R of[18,20,22])
  DRIFT_PLANS.push({v,betaT,kick,R,gear:2,pull:2.2,initThr:0.8});
function driftSCourse(R,halfW,mid){
  const line=[],zones=[],ds=0.5;
  const add=(x,y,z)=>{line.push({x,y,v:10,grade:0,kv:0});zones.push(z);};
  for(let x=-50;x<0;x+=ds)add(x,0,'approach');
  for(let a=-Math.PI/2+ds/R;a<=0+1e-9;a+=ds/R)add(R*Math.cos(a),R+R*Math.sin(a),'c1');
  const y1=2*R;
  for(let y=y1+ds;y<y1+mid;y+=ds)add(0,y,'mid');
  const y2=y1+mid;
  for(let a=Math.PI-ds/R;a>=Math.PI/2-1e-9;a-=ds/R)add(R+R*Math.cos(a),y2+R*Math.sin(a),'c2');
  const xE=2*R,yE=y2+R;
  for(let x=xE+ds;x<=xE+60;x+=ds)add(x,yE,'exit');
  return{line,zones,halfW,R,mid,xE,yE};
}
// Path from driveDriver; in the corners, throttle holds a target β (Velenis: steering + drive torque). FWD stays
// on the grip path (handbrake not modelled — named gap): NO_SLIDE is the honest result for power-over.
function driftDriver(car,s,C,d,plan){
  const base=driveDriver(car,s,C.line,d);
  const z=C.zones[Math.max(0,Math.min(C.zones.length-1,d.i||0))]||'exit';d.zone=z;
  const drifting=z==='c1'||z==='c2';
  if(!drifting){if(z==='mid')base.throttle=Math.min(base.throttle||0,0.1);return base;}
  if(plan.gripOnly){base.throttle=Math.min(base.throttle||0,0.45);return base;}
  const beta=Math.atan2(s.vy,Math.max(0.5,s.vx));
  const pkR=Math.atan(3*car.mu/car.cc),aR=(s.alpha[2]+s.alpha[3])/2;
  const sign=z==='c1'?1:-1,bT=plan.betaT*sign,absB=Math.abs(beta),absT=Math.abs(bT);
  let thr;
  if(absB>absT+0.06)thr=Math.max(0,0.25-3*(absB-absT));
  else if(absB>absT)thr=0.3;
  else thr=Math.min(1,0.5+2*(absT-absB));
  const pastKey=z==='c1'?'seen1':'seen2';
  if(Math.abs(aR)>pkR)d[pastKey]=true;
  if(!d[pastKey]&&absB<0.65*absT)thr=Math.max(thr,plan.initThr||0.85);
  let clutch=null;
  if(!d[pastKey]&&d.kick>0&&absB<0.55*absT){clutch=1;thr=1;s.we=0.88*car.redline*Math.PI/30;d.kick--;}
  let st=base.steer;
  if(absB>absT)st-=0.12*Math.sign(beta);else st+=0.06*Math.sign(bT-beta);
  const u={steer:Math.max(-1,Math.min(1,st)),throttle:Math.max(0,Math.min(1,thr)),brake:0,gear:s.gear};
  if(clutch!=null)u.clutch=clutch;
  return u;
}
function driftCornerOk(past,beta,ctr){
  return past>=0.25&&beta>8*Math.PI/180&&(ctr>=0.08||past>=0.6);
}
function driftRun(car,plan,sample){
  const gripOnly=!!plan.gripOnly||car.drive==='fwd';
  const C=driftSCourse(plan.R,plan.halfW||DRIFT_HALF_W,plan.mid||DRIFT_MID);
  for(const p of C.line)p.v=plan.v;
  const s=driveState(car),L0=C.line[0];
  s.x=L0.x;s.y=L0.y;s.psi=Math.atan2(C.line[1].y-L0.y,C.line[1].x-L0.x);
  s.vx=plan.v;s.w=s.w.map(()=>plan.v/car.r);
  s.gear=plan.gear||2;s.we=plan.v/car.r*car.ratios[s.gear-1]*car.fd;
  const d={i:0,kick:gripOnly?0:(plan.kick|0),pull:plan.pull||2.2,seen1:false,seen2:false};
  const pkR=Math.atan(3*car.mu/car.cc),pl=Object.assign({},plan,{gripOnly});
  const o={ok:false,past1:0,past2:0,beta1:0,beta2:0,ctr1:0,ctr2:0,peakBeta:0,off:false,spin:false,eMax:0,fin:false,
    line:C.line,zones:C.zones,halfW:C.halfW,R:C.R,samples:sample?[]:null,maxI:0};
  let nextT=0;const dt=0.01;
  while(s.t<60){
    const u=driftDriver(car,s,C,d,pl);
    stepCar(car,s,u,dt);
    const beta=Math.atan2(s.vy,Math.max(0.5,s.vx)),aR=(s.alpha[2]+s.alpha[3])/2;
    o.peakBeta=Math.max(o.peakBeta,Math.abs(beta));
    o.eMax=Math.max(o.eMax,Math.abs(d.e||0));o.maxI=Math.max(o.maxI,d.i||0);
    const halfBody=(car.tF+car.tR)/4+0.2;
    if(Math.abs(d.e||0)+halfBody>C.halfW)o.off=true;
    const p0=C.line[d.i],p1=C.line[Math.min(C.line.length-1,d.i+1)];
    const hp=Math.atan2(p1.y-p0.y,p1.x-p0.x);
    let dh=s.psi-hp;while(dh>Math.PI)dh-=2*Math.PI;while(dh<-Math.PI)dh+=2*Math.PI;
    if(Math.abs(dh)>0.7*Math.PI||Math.abs(beta)>1.35)o.spin=true;
    if(d.zone==='c1'){o.beta1=Math.max(o.beta1,Math.abs(beta));if(Math.abs(aR)>pkR)o.past1+=dt;
      if(u.steer*s.yaw<0&&Math.abs(beta)>8*Math.PI/180)o.ctr1+=dt;}
    if(d.zone==='c2'){o.beta2=Math.max(o.beta2,Math.abs(beta));if(Math.abs(aR)>pkR)o.past2+=dt;
      if(u.steer*s.yaw<0&&Math.abs(beta)>8*Math.PI/180)o.ctr2+=dt;}
    if(sample&&s.t>=nextT){
      o.samples.push({t:s.t,x:s.x,y:s.y,psi:s.psi,v:s.speed,beta,yaw:s.yaw,delta:s.delta||0,
        thr:u.throttle,steer:u.steer,zone:d.zone,alpha:s.alpha.slice()});
      nextT=s.t+0.04;
    }
    if(o.spin||o.off)break;
    if(d.i>=C.line.length-3&&s.t>3){o.fin=true;break;}
  }
  const s1=driftCornerOk(o.past1,o.beta1,o.ctr1),s2=driftCornerOk(o.past2,o.beta2,o.ctr2);
  o.outcome=o.spin?'SPIN':o.off||!o.fin?'OFF':(!s1&&!s2)?'NO_SLIDE':(!s1||!s2)?'FADE':'CLEAR';
  o.ok=o.outcome==='CLEAR';o.plan=pl;o.slide1=s1;o.slide2=s2;
  return o;
}
function driftBest(car,sample){
  let best=null;
  for(const pl of DRIFT_PLANS){
    const r=driftRun(car,pl,false);
    const better=!best||DRIFT_RANK[r.outcome]<DRIFT_RANK[best.outcome]
      ||(r.outcome===best.outcome&&r.maxI>best.maxI)
      ||(r.outcome===best.outcome&&r.maxI===best.maxI&&(r.past1+r.past2)>(best.past1+best.past2));
    if(better)best=Object.assign(r,{plan:pl});
    if(r.outcome==='CLEAR'){best=Object.assign(r,{plan:pl});break;}
    if(car.drive==='fwd'&&r.outcome==='NO_SLIDE'&&r.fin){best=Object.assign(r,{plan:pl});break;}
  }
  if(!best)return null;
  return sample?Object.assign(driftRun(car,best.plan,true),{plan:best.plan}):best;
}
function simulateDriftChallenge(){
  const pt=powertrain();if(!pt.ready()||!vehicle.mass)return null;
  const car=driveCar();
  car.esp=false;car.tc=false;if(car.aids){car.aids.esp=false;car.aids.tc=false;}
  const D=typeof mooseDims==='function'?mooseDims():{w:(car.tF+car.tR)/2+0.3,ovF:0.35*(car.a+car.b),ovR:0.35*(car.a+car.b)};
  const R=driftBest(car,true);if(!R)return{ok:false,reason:'no-run',kind:'drift'};
  return{
    ok:true,kind:'drift',outcome:R.outcome,drive:car.drive,
    speedKmh:Math.round(R.plan.v*3.6),betaT:R.plan.betaT,kick:R.plan.kick|0,radius:R.plan.R,
    peakBeta:R.peakBeta*180/Math.PI,beta1:R.beta1*180/Math.PI,beta2:R.beta2*180/Math.PI,
    past1:R.past1,past2:R.past2,ctr1:R.ctr1,ctr2:R.ctr2,eMax:R.eMax,
    halfW:R.halfW,line:R.line,zones:R.zones,samples:R.samples||[],plan:R.plan,
    trackW:D.w,body:{f:car.a+D.ovF,r:car.b+D.ovR},
    slide1:R.slide1,slide2:R.slide2
  };
}
