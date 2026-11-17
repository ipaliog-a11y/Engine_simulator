// ====== MOOSE AVOIDANCE (ISO 3888-2) ======
// Solved double lane change for the CHALLENGES tab. Cone geometry matches tests/test173.mjs (build 277):
// throttle released at entry, top gear. The driver's plans and the speed search: see MOOSE_SHAPES (build 353). Width and overhangs from CAR_DIMS when the body is a known car;
// otherwise track + tyre width and a share of wheelbase for overhangs.
function mooseDims(){
  const name=(vehicle&&vehicle.body&&vehicle.body.name)||(vehicle&&vehicle.chLabel)||'';
  const p=typeof FACTORY_CARS!=='undefined'?FACTORY_CARS.find(x=>x.name===name):null;
  const D=p?carDims(p):null;
  if(D&&D.w)return{w:D.w,ovF:D.ovF,ovR:D.ovR,name:D.name,src:'dims'};
  const track=(vehicle.trackF&&vehicle.trackR)?(vehicle.trackF+vehicle.trackR)/2:(vehicle.track||1.55);
  const tw=(vehicle.tireWidth||225)/1000;
  const w=track+tw,wb=vehicle.wb||2.5;
  return{w,ovF:0.35*wb,ovR:0.35*wb,name:name||'build',src:'estimate'};
}
function mooseGates(w){
  const w1=1.1*w+0.25,w2=w+1;
  return{w,w1,w2,y2:w1/2+1+w2/2,y3:(3-w1)/2};
}
// shape [A0,A1,B0,B1,f,f2,pull]: across between x A0 and A1, back between B0 and B1 (quintic steps); f the share of
// each lane's spare width the line uses (lane 1 on its right, lane 2 on its right side, the exit lane on its left: the
// side that shortens the move; f2 for lane 2 if given); pull the driver's gain onto the line (1/s, driveDriver's).
function mooseLine(G,v,shape){
  const [A0,A1,B0,B1,f=0,f2=f]=shape,line=[],w=G.w||0;
  const Y0=-f*Math.max(0,G.w1-w)/2,Y2=G.y2-f2*Math.max(0,G.w2-w)/2,Y3=G.y3+f*Math.max(0,3-w)/2;
  const sm=(x,x0,x1,y0,y1)=>{const u=Math.max(0,Math.min(1,(x-x0)/(x1-x0)));return y0+(y1-y0)*(u*u*u*(10-15*u+6*u*u));};
  for(let x=-60;x<=140;x+=0.5)line.push({x,y:x<=(A1+B0)/2?sm(x,A0,A1,Y0,Y2):sm(x,B0,B1,Y2,Y3),v,grade:0,kv:0});
  return line;
}
function mooseConeHit(car,s,D,G){
  const b=D.w,c=Math.cos(s.psi),sn=Math.sin(s.psi);
  for(const [dx,dy] of [[car.a+D.ovF,b/2],[car.a+D.ovF,-b/2],[-car.b-D.ovR,b/2],[-car.b-D.ovR,-b/2]]){
    const X=s.x+dx*c-dy*sn,Y=s.y+dx*sn+dy*c;
    if((X>=0&&X<=12&&Math.abs(Y)>G.w1/2)||(X>=25.5&&X<=36.5&&Math.abs(Y-G.y2)>G.w2/2)||(X>=49&&X<=61&&Math.abs(Y-G.y3)>1.5))return true;
  }
  return false;
}
// After entry: ICE lifts (engine braking). EV throttle=0 is full regen — far stronger than ICE overrun — so
// Model Y / 3 / Plaid stopped before the exit (~x 40–55) and still scored clear (exit cones never reached).
// Coast = thr that zeros motor torque: T = thr·wot − (1−thr)·ov = 0.
function mooseCoastPedals(car,s,u,D){
  if(s.x+car.a+D.ovF<=0)return;
  u.brake=0;
  if(!car.ev){u.throttle=0;return;}
  const T0=driveEngine(car,0,s.rpm,null,s.soc),T1=driveEngine(car,1,s.rpm,null,s.soc);
  u.throttle=T1>T0?Math.max(0,Math.min(1,-T0/(T1-T0))):0;
}
// One pass at entry speed vk (km/h). Returns {ok,ay,beta,line,outcome,...} (and optional samples for a later replay).
// ok requires clearing the exit gate (x past 61) with no cone touch — not merely surviving the first two lanes.
// Failure modes (build 352), worst first:
//   ROLLOVER  both wheels on one side off the ground (Fz = 0) and the car then tips past its outer tyres. Once a side
//             is up the springs no longer hold the roll, so the whole car is taken as one rigid body pivoting on its
//             outer contact patches: I_o·φ'' = m·(a_out·z − g·d), z = (t/2)·sinφ + h·cosφ the CG's height and
//             d = (t/2)·cosφ − h·sinφ its distance inside the pivot, I_o = I_roll + m·(h² + (t/2)²), starting at the
//             body's roll rate. It tips over when d ≤ 0, φ = atan(t / 2h); from rest it starts only if a_out > g·t/2h
//             (the static stability factor, NHTSA). The vehicle model itself does not carry the tip: this is a check
//             on top of it, so the tyres still see the lifted side's loads as 0.
//   SPIN      the car turns more than 90° from the course (pointing sideways: control is gone, not a judgement call).
//   CONE      a corner of the body passes outside a lane.
//   CLEAR     none of these. A 2-WHEEL LIFT that lands again is reported as a warning, not a failure.
const MOOSE_RANK={CLEAR:0,CONE:1,SPIN:2,ROLLOVER:3};
// quick: stop at the first cone (the speed search needs only ok; outcome is then CONE at worst)
function mooseRun(car,D,vk,shape,sample,quick){
  const G=mooseGates(D.w),v=vk/3.6,line=mooseLine(G,v,shape);
  const s=driveState(car),d={i:0,pull:shape[6]};
  s.x=-25;s.y=line[0].y;s.vx=v;   // 25 m of straight before the cones (60 until build 353: the same, only slower)s.w=s.w.map(()=>v/car.r);
  for(let g=car.ratios.length;g>=1;g--){s.gear=g;if(v/car.r*car.ratios[g-1]*car.fd*30/Math.PI>=2000)break;}
  s.we=v/car.r*car.ratios[s.gear-1]*car.fd;
  const o={ok:true,ay:0,beta:0,line,samples:sample?[]:null,maxX:s.x,cone:false,coneX:null,coneY:null,spin:false,rolled:false,
    lift2:0,liftSide:0,tipMax:0};
  const h=car.h,tH=(car.tF+car.tR)/4,Io=car.rollI+car.m*(h*h+tH*tH),gG=9.81;
  const tip={phi:0,phiV:0,side:0};
  let nextT=0;const dt=0.005;
  while(s.x<70&&s.t<20){
    const u=driveDriver(car,s,line,d);u.gear=s.gear;
    mooseCoastPedals(car,s,u,D);
    stepCar(car,s,u,dt);
    o.maxX=Math.max(o.maxX,s.x);
    o.ay=Math.max(o.ay,Math.abs(s.ayF)/gG);
    o.beta=Math.max(o.beta,Math.abs(Math.atan2(s.vy,Math.max(1,s.vx)))*180/Math.PI);
    if(mooseConeHit(car,s,D,G)){o.ok=false;if(!o.cone){o.cone=true;o.coneX=s.x;o.coneY=s.y;}}
    // two-wheel lift and the rigid tip about the outer tyres. +ay is to the left: a left turn loads the right (outer)
    // side and lifts the left wheels, so the outward acceleration is −side·ay with side −1 for the left wheels up
    const leftUp=s.Fz[0]<=0&&s.Fz[2]<=0,rightUp=s.Fz[1]<=0&&s.Fz[3]<=0;
    if(leftUp||rightUp){o.lift2+=dt;o.liftSide=leftUp?-1:1;}
    if(tip.phi<=0&&(leftUp||rightUp)){tip.side=leftUp?-1:1;tip.phi=1e-6;tip.phiV=Math.abs(s.rollV||0);}
    if(tip.phi>0){
      const aOut=Math.max(0,-tip.side*s.ayF),c=Math.cos(tip.phi),sn=Math.sin(tip.phi);
      const z=tH*sn+h*c,dd=tH*c-h*sn;
      tip.phiV+=dt*car.m*(aOut*z-gG*dd)/Io;tip.phi+=dt*tip.phiV;
      if(tip.phi<=0){tip.phi=0;tip.phiV=0;}
      o.tipMax=Math.max(o.tipMax,tip.phi);
      if(tH*Math.cos(tip.phi)-h*Math.sin(tip.phi)<=0){o.rolled=true;o.ok=false;}
    }
    if(Math.abs(s.psi)>Math.PI/2){o.spin=true;o.ok=false;}
    if(sample&&s.t>=nextT&&s.x>=-10){   // replay from 10 m before the first cones (build 352)
      o.samples.push({t:s.t,x:s.x,y:s.y,psi:s.psi,v:s.speed,roll:s.roll,zu:s.zu.slice(),Fz:s.Fz.slice(),Fy:s.Fy.slice(),camber:s.camber.slice(),ay:s.ayF/gG,
        tip:tip.phi*tip.side,cone:o.cone});
      nextT=s.t+0.02;
    }
    if(o.rolled||o.spin||(quick&&!o.ok))break;
  }
  if(!(o.maxX>=61))o.ok=false;   // must pass the exit cones (49–61 m)
  o.outcome=o.rolled?'ROLLOVER':o.spin?'SPIN':!o.ok?'CONE':'CLEAR';
  return o;
}
// The driver's best of the plans at one entry speed: any that clears; else the mildest outcome, then the least sideways.
function mooseBestAt(car,D,vk,sample){
  let best=null,bs=null;
  for(const sh of MOOSE_SHAPES){const r=mooseRun(car,D,vk,sh,false,true);if(r.ok){best=r;bs=sh;break;}}
  if(!best)for(const sh of MOOSE_SHAPES){
    const r=mooseRun(car,D,vk,sh);
    if(!best||MOOSE_RANK[r.outcome]<MOOSE_RANK[best.outcome]||(r.outcome===best.outcome&&r.beta<best.beta)){best=r;bs=sh;}
  }
  return sample?Object.assign(mooseRun(car,D,vk,bs,true),{shape:bs}):Object.assign(best,{shape:bs});
}
// The driver's plans (build 353). Until then: twelve lines through the lanes' centres, across by x 25-28, at the
// default gain, found by bisecting each line's speed. That driver used 0.63 g of a Model 3 (skidpad 0.80 g) and cleared
// 56 km/h (Teknikens Värld: 72): its lines finished the move as the front reached lane 2 and lagged it by ~1 m, so the
// rear swung into lane 2's far cone. A test driver turns in sooner, uses the lanes' spare width and tracks tightly:
// the move done by x 20-28, f 0 or 1/2 of each lane's spare width (0.85 in lane 2), pull 1.5 (the lap driver's) or 2.5.
// 48 plans; varying A0 (9/11) and B1 (47/50) as well moved the best speeds by ±2 km/h either way at 4x the time.
const MOOSE_SHAPES=[];
for(const pull of [1.5,2.5])for(const [f,f2] of [[0,0],[0.5,0.5],[0.5,0.85]])for(const A1 of [20,22,25,28])for(const B0 of [32,34])
  MOOSE_SHAPES.push([10,A1,B0,48,f,f2,pull]);
// Entry speeds (build 352). ISO 3888-2 sets none: the speed is raised step by step until a cone falls (best clear
// speed, mode 0; from build 353 the search does the same, 1 km/h a step from 50, the last good plan tried first, until
// three speeds in a row clear with no plan: the clear speed is not monotone in the plan, so bisection missed some).
// Two fixed speeds from the magazines that run it: Teknikens Värld's pass mark, 72 km/h (70 in older
// reports; Toyota RAV4 2019 failed at 68), and km77's reference entry speed, 77 km/h (Nissan Ariya and Peugeot e-2008
// cleared it; a Dacia Sandero reached 73).
const MOOSE_SPEEDS=[0,72,77];
let chalMooseSpeed=0;
function simulateMooseChallenge(speedOpt){
  const pt=powertrain();if(!pt.ready()||!vehicle.mass)return null;
  const car=driveCar(),D=mooseDims();if(!(D.w>0))return{ok:false,reason:'width'};
  const G=mooseGates(D.w),mode=speedOpt==null?chalMooseSpeed:speedOpt;
  const pack=(R,extra)=>Object.assign({
    ok:true,kind:'moose',speedKmh:R.vk,shape:R.shape,peakAy:R.ay,peakBeta:R.beta,
    dims:D,cones:G,line:R.line,samples:R.samples||[],
    mu:car.mu,trackW:D.w,
    // for the frontal diagram's scale (build 352): track, CG height and tyre radius in metres
    track:(car.tF+car.tR)/2,cgH:car.h,rT:car.r,
    outcome:R.outcome,coneX:R.coneX,coneY:R.coneY,lift2:R.lift2,liftSide:R.liftSide,tipMax:R.tipMax,
    ssf:(car.tF+car.tR)/4/car.h
  },extra);
  if(mode>0){
    const R=mooseBestAt(car,D,mode,true);R.vk=mode;
    return pack(R,{mode:'fixed'});
  }
  let best=0,shape=null,cur=MOOSE_SHAPES[0],miss=0;
  const clears=vk=>{for(const sh of [cur,...MOOSE_SHAPES])if(mooseRun(car,D,vk,sh,false,true).ok)return sh;return null;};
  let v0=50;while(v0>30&&!clears(v0))v0-=5;
  for(let vk=v0;vk<=130&&miss<3;vk++){const sh=clears(vk);if(sh){best=vk;shape=cur=sh;miss=0;}else miss++;}
  if(!shape)return{ok:false,reason:'no-clear',challenge:'moose',dims:D,cones:G};
  const R=mooseRun(car,D,best,shape,true);R.vk=best;R.shape=shape;
  const F=mooseBestAt(car,D,best+1,false);   // how it fails one step up
  return pack(R,{mode:'best',failAt:best+1,failBy:F.outcome});
}
