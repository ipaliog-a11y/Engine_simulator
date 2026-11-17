// ====== MOOSE AVOIDANCE (ISO 3888-2) ======
// Solved double lane change for the CHALLENGES tab. Cone geometry and search began as tests/test173.mjs
// (build 277): throttle released 2 m in, top gear, best of arc lines (build 353), binary-search max
// entry speed with no cone touched. Width and overhangs from CAR_DIMS when the body is a known car;
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
// ISO 3888-2:2011 Table 1 and Figure 3 (build 353): lane 1 is 1.1·w + 0.25 wide, lane 3 w + 1 and set 1 m beyond
// lane 1's edge, lane 5 1.3·w + 0.25 but not less than 3 m, with its right edge in line with lane 1's. Each lane is
// five cones a side, evenly spaced over its length (a–e, f–j, k–o), and "the track limits shall be tangential to
// the base circles of the cones" (4.2), whose base is Ø185 mm (Figure 2): the cone centres stand 92.5 mm outside.
const MOOSE_CONE_R=0.0925;
function mooseGates(w){
  const w1=1.1*w+0.25,w2=w+1,w5=Math.max(3,1.3*w+0.25);
  const G={w,w1,w2,w5,y2:w1/2+1+w2/2,y3:-w1/2+w5/2,list:[]};
  for(const [x0,len,yc,lw] of [[0,12,0,w1],[25.5,11,G.y2,w2],[49,12,G.y3,w5]])
    for(let k=0;k<5;k++){const x=x0+len*k/4;G.list.push([x,yc+lw/2+MOOSE_CONE_R],[x,yc-lw/2-MOOSE_CONE_R]);}
  return G;
}
// The driver's line (build 353): two lane changes, each an arc and a counter-arc of equal and constant curvature,
// the shape that moves the car across with the least peak lateral acceleration (4·Δy/L² against 5.77·Δy/L² for the
// quintic smoothstep used before, which minimises jerk instead: a test driver asks the tyres for a steady force, not a
// smooth one). The minimum-time solutions of this manoeuvre are bang-bang in the same way (Hendrikx, Meijlink and
// Kriens, "Application of optimal control theory to inverse simulation of car handling", Vehicle System Dynamics 26,
// 1996). k is the share of lane 1's (and lane 5's) spare width the car keeps to the outer side of, m the share of
// lane 3's it holds away from (+) or towards (−) lane 1: a driver uses the room the cones leave.
function mooseLine(G,v,shape){
  const [A0,A1,B0,B1,k,m]=shape,line=[];
  const ya=-k*(G.w1-G.w)/2,yb=G.y2+m*(G.w2-G.w)/2,yc=G.y3-k*(G.w5-G.w)/2;
  const arc=(x,x0,x1,y0,y1)=>{const u=Math.max(0,Math.min(1,(x-x0)/(x1-x0)));return y0+(y1-y0)*(u<0.5?2*u*u:1-2*(1-u)*(1-u));};
  for(let x=-60;x<=140;x+=0.5)line.push({x,y:x<=(A1+B0)/2?arc(x,A0,A1,ya,yb):arc(x,B0,B1,yb,yc),v,grade:0,kv:0});
  return line;
}
// A cone is displaced when the body's plan rectangle (overall width, without mirrors, and its overhangs) reaches its
// base circle; between cones the body may pass over the limit line (build 353: before, the four corners were held
// inside a continuous wall, which missed a cone touching the body's side between its corners).
function mooseConeHit(car,s,D,G){
  const c=Math.cos(s.psi),sn=Math.sin(s.psi),xf=car.a+D.ovF,xr=-car.b-D.ovR,hw=D.w/2,R2=MOOSE_CONE_R*MOOSE_CONE_R;
  for(const [X,Y] of G.list){
    const dx=X-s.x,dy=Y-s.y,lx=dx*c+dy*sn,ly=-dx*sn+dy*c;
    const qx=Math.max(xr,Math.min(xf,lx)),qy=Math.max(-hw,Math.min(hw,ly));
    if((lx-qx)*(lx-qx)+(ly-qy)*(ly-qy)<R2)return true;
  }
  return false;
}
// After entry: ICE lifts (engine braking). EV throttle=0 is full regen — far stronger than ICE overrun — so
// Model Y / 3 / Plaid stopped before the exit (~x 40–55) and still scored clear (exit cones never reached).
// Coast = thr that zeros motor torque: T = thr·wot − (1−thr)·ov = 0.
// ISO 3888-2:2002 Annex A.2.2 b): "At 2 m after entering section 1, release the throttle" (build 353; was at the
// first cones).
function mooseCoastPedals(car,s,u,D){
  if(s.x+car.a+D.ovF<=2)return;
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
function mooseRun(car,D,vk,shape,sample){
  const G=mooseGates(D.w),v=vk/3.6,line=mooseLine(G,v,shape);
  const s=driveState(car),d={i:0};
  s.x=-60;s.vx=v;s.w=s.w.map(()=>v/car.r);
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
    if(o.rolled||o.spin)break;
  }
  if(!(o.maxX>=61))o.ok=false;   // must pass the exit cones (49–61 m)
  o.outcome=o.rolled?'ROLLOVER':o.spin?'SPIN':!o.ok?'CONE':'CLEAR';
  return o;
}
// The driver's best of the twelve lines at one entry speed: the mildest outcome, then the least sideways.
function mooseBestAt(car,D,vk,sample){
  let best=null,bs=null;
  for(const sh of MOOSE_SHAPES){
    const r=mooseRun(car,D,vk,sh);
    if(!best||MOOSE_RANK[r.outcome]<MOOSE_RANK[best.outcome]||(r.outcome===best.outcome&&r.beta<best.beta)){best=r;bs=sh;}
  }
  return sample?Object.assign(mooseRun(car,D,vk,bs,true),{shape:bs}):Object.assign(best,{shape:bs});
}
const MOOSE_SHAPES=[];for(const A0 of [8,10])for(const A1 of [28,31])for(const B0 of [31,34])for(const B1 of [52,56])for(const k of [0.5,0.8])
  if(B0>=A1)MOOSE_SHAPES.push([A0,A1,B0,B1,k,0]);
// Entry speeds (build 352). ISO 3888-2 sets none: the speed is raised step by step until a cone falls (best clear
// speed, mode 0). Two fixed speeds from the magazines that run it: Teknikens Värld's pass mark, 72 km/h (70 in older
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
  let best=0,shape=null;
  for(const sh of MOOSE_SHAPES){
    if(!mooseRun(car,D,Math.max(40,best+1),sh).ok)continue;
    let lo=Math.max(40,best+1),hi=120;
    while(hi-lo>1){const m=(lo+hi)>>1;if(mooseRun(car,D,m,sh).ok)lo=m;else hi=m;}
    if(lo>best){best=lo;shape=sh;}
  }
  if(!shape)return{ok:false,reason:'no-clear',challenge:'moose',dims:D,cones:G};
  // how it fails one step up. Clearing is not monotonic in speed on every line, so if another line clears one step up,
  // that is the best speed (the driver keeps trying) (build 353)
  let F=mooseBestAt(car,D,best+1,false);
  while(F.outcome==='CLEAR'&&best<120){best++;shape=F.shape;F=mooseBestAt(car,D,best+1,false);}
  const R=mooseRun(car,D,best,shape,true);R.vk=best;R.shape=shape;
  return pack(R,{mode:'best',failAt:best+1,failBy:F.outcome});
}
