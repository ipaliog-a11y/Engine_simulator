// ====== S-ROUTE POWERSLIDE (build 358; course, countersteer, kick and judging fixed in build 359) ======
// Point-to-point S: straight → left 90° → short straight → right 90° → straight. The driver aims a drift line
// (sustain the slide), not the minimum-time racing line. Physics: stepCar with ESP/TC off. Methods and failure
// modes: plans/drift-challenge.md (Hindiyeh 2013; Velenis AVEC 2010).
//
// Outcomes (worst first): SPIN, OFF, NO_SLIDE, FADE, CLEAR.
//   CLEAR     both corners: rear past its peak for ≥0.25 s, body slip β > 8°, and countersteer (or a long slide)
//   FADE      only one corner qualified (initiated then lost the other, or never linked)
//   NO_SLIDE  finished on the road with neither corner past the rear peak (typical FWD on power-over)
//   STALL     stayed on the road but stopped or never reached the exit in time (build 359)
//   OFF       any corner of the body, swept at its slip angle, crossed the road edge (build 359)
//   SPIN      heading > ~0.7π from the path, or β > ~77°
const DRIFT_RANK={CLEAR:0,FADE:1,NO_SLIDE:2,STALL:3,OFF:4,SPIN:5};
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
  // Left 90° about (0,R): (0,0) heading +x → (R,R) heading +y. Mid straight on x=R. Right 90° about (2R,y2):
  // (R,y2) heading +y → (2R,y2+R) heading +x. Build 359: the straights had been drawn at x=0 and from x=2R, gaps of
  // 28.9 m and 20.9 m at R=20 that the car drove across while still scored as in a corner.
  for(let a=-Math.PI/2+ds/R;a<=0+1e-9;a+=ds/R)add(R*Math.cos(a),R+R*Math.sin(a),'c1');
  for(let y=R+ds;y<R+mid;y+=ds)add(R,y,'mid');
  const y2=R+mid;
  for(let a=Math.PI;a>=Math.PI/2-1e-9;a-=ds/R)add(2*R+R*Math.cos(a),y2+R*Math.sin(a),'c2');
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
  // dir: +1 left corner, −1 right (steer is left-positive). A left drift has β<0 (velocity right of the nose).
  const dir=z==='c1'?1:-1,absB=Math.abs(beta),absT=plan.betaT;
  let thr;
  if(absB>absT+0.06)thr=Math.max(0,0.25-3*(absB-absT));
  else if(absB>absT)thr=0.3;
  else thr=Math.min(1,0.5+2*(absT-absB));
  const pastKey=z==='c1'?'seen1':'seen2';
  if(Math.abs(aR)>pkR)d[pastKey]=true;
  if(!d[pastKey]&&absB<0.65*absT)thr=Math.max(thr,plan.initThr||0.85);
  // Clutch kick (build 359): pedal down, full throttle, the engine revs itself up through stepCar (its own torque
  // and inertia) for at most plan.kick steps of this corner's budget, then the clutch is dumped (0 = closed).
  let clutch=null;const kKey=z==='c1'?'kick1':'kick2';
  if(!d[pastKey]&&d[kKey]>0&&absB<0.55*absT&&s.we<0.88*car.redline*Math.PI/30){clutch=1;thr=1;d[kKey]--;d.kicking=true;}
  else if(d.kicking){clutch=0;d.kicking=false;}
  // Countersteer (build 359: the sign had steered into the slide): past the target, steer out of the corner.
  let st=base.steer;
  if(absB>absT)st-=0.12*dir;else st+=0.06*dir;
  const u={steer:Math.max(-1,Math.min(1,st)),throttle:Math.max(0,Math.min(1,thr)),brake:0,gear:s.gear};
  if(clutch!=null)u.clutch=clutch;
  return u;
}
function driftCornerOk(past,beta,ctr){
  return past>=0.25&&beta>8*Math.PI/180&&(ctr>=0.08||past>=0.6);
}
// Lateral reach (m) of the body's farthest corner from its CG, at heading error dh to the path: a box f ahead,
// r behind, w wide, turned by dh (build 359; the front axle ± half track had ignored the swept tail).
function driftReach(D,dh){const c=Math.abs(Math.cos(dh)),sn=Math.abs(Math.sin(dh));return D.w/2*c+Math.max(D.f,D.r)*sn;}
function driftRun(car,plan,sample,D){
  D=D||{w:(car.tF+car.tR)/2+0.3,f:1.35*car.a,r:1.35*car.b};
  const gripOnly=!!plan.gripOnly||car.drive==='fwd';
  const C=driftSCourse(plan.R,plan.halfW||DRIFT_HALF_W,plan.mid||DRIFT_MID);
  for(const p of C.line)p.v=plan.v;
  const s=driveState(car),L0=C.line[0];
  s.x=L0.x;s.y=L0.y;s.psi=Math.atan2(C.line[1].y-L0.y,C.line[1].x-L0.x);
  s.vx=plan.v;s.w=s.w.map(()=>plan.v/car.r);
  s.gear=plan.gear||2;s.we=plan.v/car.r*car.ratios[s.gear-1]*car.fd;
  const k0=gripOnly?0:(plan.kick|0);
  const d={i:0,kick1:k0,kick2:k0,pull:plan.pull||2.2,seen1:false,seen2:false};
  let len=0;for(let k=1;k<C.line.length;k++)len+=Math.hypot(C.line[k].x-C.line[k-1].x,C.line[k].y-C.line[k-1].y);
  const tMax=3*len/plan.v;let slowT=0;   // three times the course at entry speed, or 2 s near standstill: STALL
  const pkR=Math.atan(3*car.mu/car.cc),pl=Object.assign({},plan,{gripOnly});
  const o={ok:false,past1:0,past2:0,beta1:0,beta2:0,ctr1:0,ctr2:0,peakBeta:0,off:false,spin:false,eMax:0,fin:false,
    line:C.line,zones:C.zones,halfW:C.halfW,R:C.R,samples:sample?[]:null,maxI:0};
  let nextT=0;const dt=0.01;
  while(s.t<tMax){
    const u=driftDriver(car,s,C,d,pl);
    stepCar(car,s,u,dt);
    const beta=Math.atan2(s.vy,Math.max(0.5,s.vx)),aR=(s.alpha[2]+s.alpha[3])/2;
    o.peakBeta=Math.max(o.peakBeta,Math.abs(beta));
    o.eMax=Math.max(o.eMax,Math.abs(d.e||0));o.maxI=Math.max(o.maxI,d.i||0);
    const p0=C.line[d.i],p1=C.line[Math.min(C.line.length-1,d.i+1)];
    const hp=Math.atan2(p1.y-p0.y,p1.x-p0.x);
    let dh=s.psi-hp;while(dh>Math.PI)dh-=2*Math.PI;while(dh<-Math.PI)dh+=2*Math.PI;
    const eCG=-(s.x-p0.x)*Math.sin(hp)+(s.y-p0.y)*Math.cos(hp);
    if(Math.abs(eCG)+driftReach(D,dh)>C.halfW)o.off=true;
    slowT=(s.speed||Math.hypot(s.vx,s.vy))<1?slowT+dt:0;if(slowT>2)break;
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
  o.outcome=o.spin?'SPIN':o.off?'OFF':!o.fin?'STALL':(!s1&&!s2)?'NO_SLIDE':(!s1||!s2)?'FADE':'CLEAR';
  o.ok=o.outcome==='CLEAR';o.plan=pl;o.slide1=s1;o.slide2=s2;
  return o;
}
// FWD ignores betaT and kick (grip path), so it searches only the 12 distinct (v,R) plans (build 359).
function driftBest(car,sample,D){
  let best=null;
  const plans=car.drive==='fwd'?DRIFT_PLANS.filter(p=>p.betaT===DRIFT_PLANS[0].betaT&&p.kick===0):DRIFT_PLANS;
  for(const pl of plans){
    const r=driftRun(car,pl,false,D);
    const better=!best||DRIFT_RANK[r.outcome]<DRIFT_RANK[best.outcome]
      ||(r.outcome===best.outcome&&r.maxI>best.maxI)
      ||(r.outcome===best.outcome&&r.maxI===best.maxI&&(r.past1+r.past2)>(best.past1+best.past2));
    if(better)best=Object.assign(r,{plan:pl});
    if(r.outcome==='CLEAR'){best=Object.assign(r,{plan:pl});break;}
    if(car.drive==='fwd'&&r.outcome==='NO_SLIDE'&&r.fin){best=Object.assign(r,{plan:pl});break;}
  }
  if(!best)return null;
  return sample?Object.assign(driftRun(car,best.plan,true,D),{plan:best.plan}):best;
}
function simulateDriftChallenge(){
  const pt=powertrain();if(!pt.ready()||!vehicle.mass)return null;
  const car=driveCar();
  car.esp=false;car.tc=false;if(car.aids){car.aids.esp=false;car.aids.tc=false;}
  const D=typeof mooseDims==='function'?mooseDims():{w:(car.tF+car.tR)/2+0.3,ovF:0.35*(car.a+car.b),ovR:0.35*(car.a+car.b)};
  const R=driftBest(car,true,{w:D.w,f:car.a+D.ovF,r:car.b+D.ovR});if(!R)return{ok:false,reason:'no-run',kind:'drift'};
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
