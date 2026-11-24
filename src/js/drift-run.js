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
// Plans: entry speed v (m/s), target |β| (rad), initiation (power-over, clutch kick, flick, or handbrake), radius R (m).
// Build 382: handbrake (Velenis et al., CDC 2011) is searched last, only if the dynamic methods do not CLEAR.
// Active drift controller (Hindiyeh 2013; Velenis AVEC 2010): steering stabilizes β and yaw rate while throttle sustains
// rear saturation and corner speed, so higher entry speeds (36–65 km/h) and deeper angles (14–25°) are searched on R=20 m.
const DRIFT_INITS=[{init:'power',kick:0},{init:'kick',kick:15},{init:'flick',kick:0},{init:'handbrake',kick:0}];
const DRIFT_PLANS=[];
for(const I of DRIFT_INITS)for(const v of[10,12,14,16,18])for(const betaT of[0.20,0.30,0.40])
  DRIFT_PLANS.push({v,betaT,kick:I.kick,init:I.init,R:20,gear:2,pull:2.2,initThr:0.92});
// Driver settings (build 360, Challenges UI): entry speed in km/h (0 = the search's best) and initiation method.
let chalDriftEntry=0,chalDriftMethod='auto';
const DRIFT_ENTRY_OPTS=[0,35,40,45,50,55,60,65,70],DRIFT_METHODS=['auto','power','kick','flick','handbrake'];
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
  return{line,zones,halfW,R,mid,xE,yE,ds,i1:zones.indexOf('c1'),e1:zones.lastIndexOf('c1'),i2:zones.indexOf('c2'),e2:zones.lastIndexOf('c2')};
}
// Active drift controller (Hindiyeh 2013; Velenis AVEC 2010):
//   - Pre-corner anticipation: initiates turn-in and builds throttle/boost ~0.35 s before each bend.
//   - Corners (RWD/AWD): velocity-vector path tracking + proportional countersteer on (β − β_des) and yaw-rate damping
//     (full steering lock available via δ = vf − toeF + α_f,cmd), while throttle sustains rear saturation and speed.
//   - Mid-S transition: active countersteer smoothly unwinds corner 1's slip, then accelerates back to entry pace
//     before swinging into corner 2.
//   - FWD: power-over stays on the grip path (NO_SLIDE); flick and handbrake (Velenis CDC 2011) rotate the rear.
//   - AWD (build 379): takes the RWD path; centre coupling in stepCar decides whether the rear can overspeed the front.
function driftDriver(car,s,C,d,plan){
  const base=driveDriver(car,s,C.line,d);
  const idx=Math.max(0,Math.min(C.zones.length-1,d.i||0));
  const z=C.zones[idx]||'exit';d.zone=z;
  const drifting=z==='c1'||z==='c2';
  const v=Math.max(1,Math.hypot(s.vx,s.vy));
  const beta=Math.atan2(s.vy,Math.max(0.5,s.vx));
  const pkF=car.pkF||Math.atan(3*(car.muF||car.mu)/car.cc);
  const pkR=Math.atan(3*car.mu/car.cc);
  const wrap=x=>x-2*Math.PI*Math.round(x/(2*Math.PI));
  // Flick (pendulum turn, build 360): lift and steer away from the corner, then sharply into it, each for half the
  // body's natural roll period π·tauLoad so the rebound helps turn-in.
  if(plan.init==='flick'&&(z==='approach'||z==='mid')){
    const next=z==='approach'?C.i1:C.i2,dir=z==='approach'?1:-1;
    const tTo=(next-idx)*C.ds/Math.max(2,s.vx),tF=Math.PI*(car.tauLoad||0.1);
    if(tTo<2*tF){
      const away=tTo>tF,pk=pkF/car.steerLock;
      base.steer=Math.max(-1,Math.min(1,base.steer+(away?-dir:dir)*pk));
      base.throttle=away||car.drive==='fwd'?0:1;base.brake=0;d.flicked=true;return base;
    }
  }
  // Corner anticipation (non-grip, non-flick): ~0.35 s before c1 or c2, start turning in and building throttle/boost
  // so the car enters the bend already rotating instead of reacting late.
  if(!plan.gripOnly&&plan.init!=='flick'&&(z==='approach'||z==='mid')){
    const next=z==='approach'?C.i1:C.i2,dir=z==='approach'?1:-1;
    const tTo=(next-idx)*C.ds/Math.max(3,s.vx);
    if(tTo>0&&tTo<0.35){
      const stPre=base.steer+0.4*dir*pkF/car.steerLock;
      const thrPre=car.drive==='fwd'?Math.max(0.4,base.throttle||0):Math.max(base.throttle||0,plan.initThr||0.92);
      return{steer:Math.max(-1,Math.min(1,stPre)),throttle:Math.min(1,thrPre),brake:0,gear:null};
    }
  }
  if(!drifting){
    if(z==='mid'){
      // Mid-S transition: use active countersteer to unwind corner 1's slip cleanly, then accelerate back
      // to target entry speed so the car carries pace and boost into corner 2 instead of coasting 34 m.
      const unwinding=Math.abs(beta)>0.10||s.yaw>0.35;
      if(unwinding&&!plan.gripOnly&&car.drive!=='fwd'){
        const p0=C.line[idx],p1=C.line[Math.min(C.line.length-1,idx+1)];
        const hp=Math.atan2(p1.y-p0.y,p1.x-p0.x);
        const eCG=-(s.x-p0.x)*Math.sin(hp)+(s.y-p0.y)*Math.cos(hp);
        const psiVDes=hp-Math.atan2(1.35*eCG,Math.max(5,v));
        const yawDes=1.4*wrap(psiVDes-(s.psi+beta));
        const vf=Math.atan2(s.vy+car.a*s.yaw,Math.max(1,s.vx));
        const toeF=s.toe?(s.toe[0]+s.toe[1])/2:0;
        const alphaCmd=Math.max(-1.25*pkF,Math.min(1.25*pkF,1.85*beta+0.55*(yawDes-s.yaw)));
        base.steer=Math.max(-1,Math.min(1,(vf-toeF+alphaCmd)/car.steerLock));
        base.throttle=Math.abs(beta)>0.28?0.2:0.42;base.brake=0;
      }else if(unwinding){
        base.throttle=Math.min(base.throttle||0,0.35);base.brake=0;
      }else{
        const vDef=plan.v-v;
        if(vDef>0){base.throttle=Math.max(base.throttle||0,Math.min(1,0.65+0.25*vDef));base.brake=0;}
        else if(v<plan.v+2){base.throttle=Math.max(0.35,base.throttle||0);base.brake=0;}
      }
    }
    base.gear=null;
    return base;
  }
  if(plan.gripOnly){base.throttle=Math.min(base.throttle||0,0.45);base.gear=null;return base;}
  // FWD after a flick or on handbrake (Velenis CDC 2011): power pulls the nose straight; handbrake holds rear slip
  // until β reaches target while part-throttle keeps forward speed up.
  if(car.drive==='fwd'){
    const dirF=z==='c1'?1:-1,absB=Math.abs(beta),over=absB>plan.betaT,pk=z==='c1'?'seen1':'seen2';
    if(Math.abs((s.alpha[2]+s.alpha[3])/2)>pkR)d[pk]=true;
    const pull=plan.init==='handbrake'&&absB<plan.betaT;
    const stF=base.steer+(pull&&!d[pk]?dirF*pkF/car.steerLock:over?-0.16*dirF:0);
    const thrF=pull?Math.max(0.45,base.throttle||0):over?0.75:0.15;
    const uF={steer:Math.max(-1,Math.min(1,stF)),throttle:Math.min(1,thrF),brake:0,gear:pull?s.gear:null};
    if(pull)uF.handbrake=1;
    return uF;
  }
  const aR=(s.alpha[2]+s.alpha[3])/2;
  // dir: +1 left corner (c1, β<0), −1 right corner (c2, β>0).
  const dir=z==='c1'?1:-1,absB=Math.abs(beta);
  // Corner-exit anticipation: taper target β slightly in the final ~0.28 s of c1 to flow cleanly into the S transition.
  const tExit=((z==='c1'?C.e1:C.e2)-idx)*C.ds/Math.max(3,s.vx);
  const absT=(z==='c1'&&tExit<0.28)?plan.betaT*Math.max(0.4,0.4+0.6*tExit/0.28):plan.betaT;
  const betaDes=-dir*absT;
  const pastKey=z==='c1'?'seen1':'seen2';
  if(Math.abs(aR)>pkR)d[pastKey]=true;
  // ---- Active countersteer & velocity-vector path tracking ----
  const p0=C.line[idx],p1=C.line[Math.min(C.line.length-1,idx+1)];
  const hp=Math.atan2(p1.y-p0.y,p1.x-p0.x);
  const eCG=-(s.x-p0.x)*Math.sin(hp)+(s.y-p0.y)*Math.cos(hp);
  const wide=-dir*eCG;   // > 0 when drifting wide toward the outside edge of the bend
  const la=Math.max(4,Math.min(20,Math.round(0.32*v/C.ds)));
  const q0=C.line[Math.min(C.line.length-2,idx+la)],q1=C.line[Math.min(C.line.length-1,idx+la+1)];
  const hpLa=Math.atan2(q1.y-q0.y,q1.x-q0.x);
  const psiVDes=hpLa-Math.atan2(1.35*eCG,Math.max(4,v));
  const ePsiV=wrap(psiVDes-(s.psi+beta));
  const yawDes=dir*v/C.R+1.65*ePsiV;
  const vf=Math.atan2(s.vy+car.a*s.yaw,Math.max(1,s.vx));
  const toeF=s.toe?(s.toe[0]+s.toe[1])/2:0;
  // Front slip command: turn-in bias + β stabilization + yaw-rate damping; more authority when catching an overshoot.
  const limF=(absB>absT+0.10?1.35:1.15)*pkF;
  const alphaCmd=Math.max(-limF,Math.min(limF,dir*0.36*pkF+2.1*(beta-betaDes)+0.68*(yawDes-s.yaw)));
  const st=Math.max(-1,Math.min(1,(vf-toeF+alphaCmd)/car.steerLock));
  // ---- Sustained throttle control (β + yaw-rate trend + speed floor + wide-line protection) ----
  const betaOver=absB-absT;
  const yawOver=dir*s.yaw-v/C.R;
  const excess=betaOver+0.18*yawOver;
  let thr;
  if(excess<0)thr=Math.min(1,0.86-1.5*excess);
  else if(absB<absT+0.24)thr=Math.max(0.48,0.86-1.4*excess);
  else thr=Math.max(0.10,0.48-2.4*(absB-(absT+0.24)));
  // Keep pushing if speed sags mid-corner while angle and line are under control.
  if(v<0.92*plan.v&&absB<absT+0.16&&wide<5.5)thr=Math.min(1,thr+0.24*(0.92*plan.v-v));
  if(!d[pastKey]&&absB<0.65*absT)thr=Math.max(thr,plan.initThr||0.92);
  // Wide-line protection: predict lateral offset 0.5 s ahead from outward velocity. AWD eases earlier because front
  // drive torque shares the front tyres' friction circle; well-lined RWD drifts stay hard on power.
  const wideRate=-dir*v*Math.sin(wrap(s.psi+beta-hp));
  const widePred=wide+0.5*Math.max(0,wideRate);
  const wideLim=car.drive==='awd'?3.45:4.8;
  if(widePred>wideLim)thr*=Math.max(0.08,1-(car.drive==='awd'?0.36:0.28)*(widePred-wideLim));
  const vGrip=Math.sqrt(car.mu*DRIVE_G*C.R);
  if(v>1.12*vGrip&&absB<0.65*absT)thr*=Math.max(0.2,1-0.30*(v-1.12*vGrip));
  // Clutch kick (build 359): pedal down, full throttle, rev up for plan.kick steps, then dump.
  // Direct-drive EVs have no friction clutch to kick or disengage.
  let clutch=null;const kKey=z==='c1'?'kick1':'kick2';
  if(!car.ev&&!d[pastKey]&&d[kKey]>0&&absB<0.55*absT&&s.we<0.88*car.redline*Math.PI/30){clutch=1;thr=1;d[kKey]--;d.kicking=true;}
  else if(d.kicking){clutch=0;d.kicking=false;}
  // Handbrake (RWD & electronic-clutch AWD, build 382/440): clutch down (ICE only) and lever up until β reaches 72% of target
  // (once per corner, while speed > 5 m/s), then drop lever, close clutch, and hold the slide on power.
  let hb=0;const hbKey=z==='c1'?'hb1':'hb2';
  if(plan.init==='handbrake'&&!d[hbKey]){
    if(absB>=0.72*absT||v<5){d[hbKey]=true;if(d.hbing){if(!car.ev)clutch=0;d.hbing=false;}}
    else{hb=1;thr=0;if(!car.ev)clutch=1;d.hbing=true;}
  }else if(d.hbing){if(!car.ev)clutch=0;d.hbing=false;}
  const u={steer:st,throttle:Math.max(0,Math.min(1,thr)),brake:0,gear:(clutch!=null||hb)?s.gear:null};
  if(clutch!=null)u.clutch=clutch;
  if(hb)u.handbrake=hb;
  return u;
}
function driftCornerOk(past,beta,ctr){
  return past>=0.25&&beta>8*Math.PI/180&&(ctr>=0.08||past>=0.6);
}
// Lateral reach (m) of the body's farthest corner from its CG, at heading error dh to the path: a box f ahead,
// r behind, w wide, turned by dh (build 359; the front axle ± half track had ignored the swept tail).
function driftReach(D,dh){const c=Math.abs(Math.cos(dh)),sn=Math.abs(Math.sin(dh));return D.w/2*c+Math.max(D.f,D.r)*sn;}
// Composite powerslide score: mean corner speed (km/h) × sin(mean sustained corner β) × 10, discounted for near-spin
// spikes above ~48° so clean, fast, sustained slides beat slow crawls and sloppy tank-slappers.
function driftScore(vCornerKmh,bMean1,bMean2,peakBeta){
  const bMean=Math.min(0.65,0.5*(bMean1+bMean2));
  const clean=peakBeta>0.84?Math.max(0.45,1-(peakBeta-0.84)):1;
  return Math.round(vCornerKmh*Math.sin(bMean)*10*clean);
}
function driftRun(car,plan,sample,D){
  D=D||{w:(car.tF+car.tR)/2+0.3,f:1.35*car.a,r:1.35*car.b};
  const gripOnly=!!plan.gripOnly||(car.drive==='fwd'&&plan.init!=='flick'&&plan.init!=='handbrake');
  const C=driftSCourse(plan.R,plan.halfW||DRIFT_HALF_W,plan.mid||DRIFT_MID);
  for(const p of C.line)p.v=plan.v;
  const s=driveState(car),L0=C.line[0];
  s.x=L0.x;s.y=L0.y;s.psi=Math.atan2(C.line[1].y-L0.y,C.line[1].x-L0.x);
  s.vx=plan.v;s.w=s.w.map(()=>plan.v/car.r);
  // A single-speed car (an EV) has no second gear: until build 379 it was put in gear 2 and never drove (STALL).
  s.gear=Math.min(plan.gear||2,car.ratios.length);s.we=plan.v/car.r*car.ratios[s.gear-1]*car.fd;
  const k0=gripOnly||car.ev?0:(plan.kick|0);
  const d={i:0,kick1:k0,kick2:k0,pull:plan.pull||2.2,seen1:false,seen2:false};
  let len=0;for(let k=1;k<C.line.length;k++)len+=Math.hypot(C.line[k].x-C.line[k-1].x,C.line[k].y-C.line[k-1].y);
  const tMax=3*len/plan.v;let slowT=0;   // three times the course at entry speed, or 2 s near standstill: STALL
  const pkR=Math.atan(3*car.mu/car.cc),pl=Object.assign({},plan,{gripOnly});
  const o={ok:false,past1:0,past2:0,beta1:0,beta2:0,ctr1:0,ctr2:0,peakBeta:0,off:false,spin:false,eMax:0,fin:false,
    line:C.line,zones:C.zones,halfW:C.halfW,R:C.R,samples:sample?[]:null,maxI:0,pkR,vCornerKmh:0,score:0};
  let nextT=0,vSum=0,vCnt=0,bSum1=0,bCnt1=0,bSum2=0,bCnt2=0;const dt=0.01;
  while(s.t<tMax){
    const u=driftDriver(car,s,C,d,pl);
    stepCar(car,s,u,dt);
    const beta=Math.atan2(s.vy,Math.max(0.5,s.vx));
    // the rear is past its peak by slip angle, or (build 382) locked by the lever: past the peak of its combined slip
    const aR=u.handbrake>0&&Math.min(s.kappa[2],s.kappa[3])<-car.slipOpt?Math.PI/2:(s.alpha[2]+s.alpha[3])/2;
    o.peakBeta=Math.max(o.peakBeta,Math.abs(beta));
    o.eMax=Math.max(o.eMax,Math.abs(d.e||0));o.maxI=Math.max(o.maxI,d.i||0);
    const p0=C.line[d.i],p1=C.line[Math.min(C.line.length-1,d.i+1)];
    const hp=Math.atan2(p1.y-p0.y,p1.x-p0.x);
    let dh=s.psi-hp;dh=Number.isFinite(dh)?dh-2*Math.PI*Math.round(dh/(2*Math.PI)):0;
    const eCG=-(s.x-p0.x)*Math.sin(hp)+(s.y-p0.y)*Math.cos(hp);
    if(Math.abs(eCG)+driftReach(D,dh)>C.halfW)o.off=true;
    const spd=s.speed||Math.hypot(s.vx,s.vy);
    slowT=spd<1?slowT+dt:0;if(slowT>2)break;
    if(Math.abs(dh)>0.7*Math.PI||Math.abs(beta)>1.35)o.spin=true;
    if(d.zone==='c1'){vSum+=spd;vCnt++;bSum1+=Math.abs(beta);bCnt1++;o.beta1=Math.max(o.beta1,Math.abs(beta));if(Math.abs(aR)>pkR)o.past1+=dt;
      if(u.steer*s.yaw<0&&Math.abs(beta)>8*Math.PI/180)o.ctr1+=dt;}
    if(d.zone==='c2'){vSum+=spd;vCnt++;bSum2+=Math.abs(beta);bCnt2++;o.beta2=Math.max(o.beta2,Math.abs(beta));if(Math.abs(aR)>pkR)o.past2+=dt;
      if(u.steer*s.yaw<0&&Math.abs(beta)>8*Math.PI/180)o.ctr2+=dt;}
    if(sample&&s.t>=nextT){
      o.samples.push({t:s.t,x:s.x,y:s.y,psi:s.psi,v:spd,beta,yaw:s.yaw,delta:s.delta||0,
        thr:u.throttle,steer:u.steer,zone:d.zone,alpha:s.alpha.slice(),
        brk:u.brake||0,hb:u.handbrake||0,gear:s.gear,rpm:(s.we||0)*30/Math.PI,ax:s.ax||0,ay:s.ay||0});   // for the dashboard (build 361)
      nextT=s.t+0.04;
    }
    if(o.spin||o.off)break;
    if(d.i>=C.line.length-3&&s.t>3){o.fin=true;break;}
  }
  const s1=driftCornerOk(o.past1,o.beta1,o.ctr1),s2=driftCornerOk(o.past2,o.beta2,o.ctr2);
  o.outcome=o.spin?'SPIN':o.off?'OFF':!o.fin?'STALL':(!s1&&!s2)?'NO_SLIDE':(!s1||!s2)?'FADE':'CLEAR';
  o.ok=o.outcome==='CLEAR';o.plan=pl;o.slide1=s1;o.slide2=s2;
  o.vCornerKmh=vCnt?vSum/vCnt*3.6:0;
  o.score=o.ok?driftScore(o.vCornerKmh,bCnt1?bSum1/bCnt1:0,bCnt2?bSum2/bCnt2:0,o.peakBeta):0;
  return o;
}
// The plans for the driver settings: a fixed entry speed replaces the searched ones; a method keeps its own plans.
// FWD: no kick, and one target β for power and flick; handbrake keeps all three. EV: no clutch kick. AWD: no handbrake unless electronic-clutch.
function driftCanAwdHb(car){return car.drive==='awd'&&!car.ev&&car.centre&&(car.centre.dc||car.centre.type==='lock');}
function driftPlans(car,entryKmh,method){
  let P=DRIFT_PLANS;
  if((car.drive==='fwd'||car.ev)&&method==='kick')method='power';   // no clutch kick on FWD grip path or clutchless EV
  if(car.ev)P=P.filter(p=>p.init!=='kick');
  if(car.drive==='awd'&&!driftCanAwdHb(car)){if(method==='handbrake')method='power';P=P.filter(p=>p.init!=='handbrake');}
  if(method&&method!=='auto')P=P.filter(p=>p.init===method);
  if(entryKmh>0)P=P.filter(p=>p.v===DRIFT_PLANS[0].v).map(p=>Object.assign({},p,{v:entryKmh/3.6}));
  if(car.drive==='fwd')P=P.filter(p=>p.init==='handbrake'||(p.init==='flick'||p.init==='power')&&p.betaT===DRIFT_PLANS[0].betaT);
  return P;
}
function driftBest(car,sample,D,entryKmh,method){
  let best=null;
  const plans=driftPlans(car,entryKmh,method);
  for(const pl of plans){
    // In AUTO mode, handbrake is last-resort: skip it once a dynamic method already CLEARed.
    if((!method||method==='auto')&&pl.init==='handbrake'&&best&&best.outcome==='CLEAR')break;
    const r=driftRun(car,pl,false,D);
    const better=!best||DRIFT_RANK[r.outcome]<DRIFT_RANK[best.outcome]
      ||(r.outcome===best.outcome&&r.outcome==='CLEAR'&&r.score>best.score)
      ||(r.outcome===best.outcome&&r.outcome!=='CLEAR'&&(r.maxI>best.maxI||(r.maxI===best.maxI&&(r.past1+r.past2)>(best.past1+best.past2))));
    if(better)best=Object.assign(r,{plan:pl});
    if(car.drive==='fwd'&&pl.init!=='flick'&&r.outcome==='NO_SLIDE'&&r.fin&&(method==='power'||method==='kick')){best=Object.assign(r,{plan:pl});break;}
  }
  if(!best)return null;
  return sample?Object.assign(driftRun(car,best.plan,true,D),{plan:best.plan}):best;
}
// Optional TC/ESP override from the Challenges setup panel: null = default (both off for powerslide).
let chalDriftTc=null,chalDriftEsp=null;
function simulateDriftChallenge(){
  const pt=powertrain();if(!pt.ready()||!vehicle.mass)return null;
  const car=driveCar();
  const tcOn=chalDriftTc===true,espOn=chalDriftEsp===true;
  car.esp=espOn;car.tc=tcOn;if(car.aids){car.aids.esp=espOn;car.aids.tc=tcOn;}
  const D=typeof mooseDims==='function'?mooseDims():{w:(car.tF+car.tR)/2+0.3,ovF:0.35*(car.a+car.b),ovR:0.35*(car.a+car.b)};
  const R=driftBest(car,true,{w:D.w,f:car.a+D.ovF,r:car.b+D.ovR},chalDriftEntry,chalDriftMethod);if(!R)return{ok:false,reason:'no-run',kind:'drift'};
  return{
    ok:true,kind:'drift',outcome:R.outcome,drive:car.drive,
    speedKmh:Math.round(R.plan.v*3.6),vCornerKmh:R.vCornerKmh,score:R.score,
    betaT:R.plan.betaT,kick:R.plan.kick|0,radius:R.plan.R,init:R.plan.init,
    entryMode:chalDriftEntry>0?'fixed':'best',method:chalDriftMethod,
    peakBeta:R.peakBeta*180/Math.PI,beta1:R.beta1*180/Math.PI,beta2:R.beta2*180/Math.PI,
    past1:R.past1,past2:R.past2,ctr1:R.ctr1,ctr2:R.ctr2,eMax:R.eMax,
    halfW:R.halfW,line:R.line,zones:R.zones,samples:R.samples||[],plan:R.plan,
    trackW:D.w,body:{f:car.a+D.ovF,r:car.b+D.ovR},
    slide1:R.slide1,slide2:R.slide2,pkR:R.pkR,
    centre:car.drive==='awd'&&car.centre?{type:car.centre.type,f:car.centre.f}:null   // AWD power-over is as far as this lets the rear slip (build 379)
  };
}
