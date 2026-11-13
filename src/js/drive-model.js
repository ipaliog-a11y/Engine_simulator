// ================================================================================================
// THE CAR STEPPED IN TIME (build 263): four wheels, a driver's inputs, one step. The base of a driving game.
//
// The lap, the 0-100 and the race solve a whole run at once, on one line, at the limit (quasi-steady). A game needs
// the other thing: where is the car one step later, given the wheel, the pedals and the gear. That is stepCar().
//
// Two halves, kept apart on purpose:
//   driveCar()                 reads the designed car (vehicle, powertrain) and returns PLAIN DATA: numbers and arrays,
//                              nothing else. JSON.stringify(driveCar()) is a complete car.
//   stepCar(car, s, u, dt)     advances state s by dt under inputs u. It reads only its arguments and Math: no page,
//                              no canvas, no globals of this app. A separate game can load this file and a car's JSON.
//
//   driveLine(lap), driveDriver(car, s, line, d)   a lap's racing line as plain data, and a driver that takes the car
//                              round it with the wheel and the pedals (build 269). See above driveDriver.
//
// WHAT IS MODELLED
//   Body      three freedoms in the plane: forward and sideways speed and yaw. m(vx' - vy r) = sum Fx, m(vy' + vx r) =
//             sum Fy, Izz r' = sum of the tyre forces' moments (Milliken & Milliken, RCVD ch. 5). Izz = m a b, the yaw
//             inertia of a car whose dynamic index is 1 (road cars measure 0.9-1.1, NHTSA's inertia database: probable).
//   Loads     each wheel's share of the weight, the downforce by its balance, and the transfer under acceleration
//             (m ax h / L) and cornering (m ay h / t, shared between the axles by the car's own roll stiffness and
//             roll centres, vehicle.lltdF). The transfer follows the acceleration through the springs, not at once:
//             a first-order lag at the body's ride frequency.
//   Tyre      the brush model (Fiala 1954; Pacejka, Tyre and Vehicle Dynamics ch. 3): tread elements that deflect with
//             slip until the pressure can no longer hold them. With theta = C / (3 mu Fz), the force is
//             mu Fz (3s - 3s^2 + s^3) up to full sliding at s = 1. Drive, braking and cornering share one slip vector,
//             so using the grip one way leaves less the other way: combined slip needs no extra rule. Its inputs are
//             the lap's own: the grip mu(Fz) with its load sensitivity, the cornering stiffness (the compound's,
//             TIRE_TYPE.cc, falling with the load as tyreCCLoad has it), the longitudinal peak at TYRE_SLIP_OPT, braking and traction at TYRE_MU_X of the
//             lateral grip, and past the peak the launch model's own falling curve (0.81 in a full slide).
//             A tyre's side force builds over a rolling distance, the relaxation length (about the tyre's radius;
//             Pacejka ch. 5: probable).
//   Wheels    each spins on its own: I w' = drive - brake - Fx r - rolling resistance. This is what lets a wheel spin
//             up or lock.
//   Drive     the engine's full-load curve by the pedal, its own overrun torque off it, its inertia, a clutch that
//             slips (capacity 1.5 x peak torque), the gearbox with its shift time, the differential (open: equal
//             torque; limited-slip: torque moved to the slower wheel by its lock), all-wheel drive split evenly.
//   Stall     below the speed it can fire at, the engine stops; a starter or a bump start brings it back.
//   Brakes    the hydraulics' own force and front share; ABS and traction control as wheel-slip limits when fitted.
//   Aero      drag and downforce on the square of the speed; rolling resistance by the load.
//   Hybrid    (build 273) the motor, the pack and the controller apart from the engine, the pack's charge stepped in
//             time. See above driveHybrid.
//
// NOT YET (named, so nobody rediscovers them): the turbo's shaft in time (boost is the settled curve's), tyre and
// brake temperatures, camber and roll steer, the road's bumps and kerbs. The lap solver has
// each of these; they move here in later builds of phase E.
// ================================================================================================
const DRIVE_G=9.81, DRIVE_RHO=1.20;
// The designed car as plain data. Everything stepCar needs, and nothing that is not a number, a string or an array.
function driveCar(){
  const v=vehicle,pt=powertrain(),L=v.wb,a=L*(1-v.fWt),b=L*v.fWt;
  const curve=pt.torqueCurve(),rl=pt.maxRpm(),peak=curve.reduce((m,p)=>Math.max(m,p.tq),0);
  // a hybrid (build 273): the engine's curve and overrun are its own (a power-split's or a series hybrid's: what reaches
  // the motor's shaft with the pack giving nothing), and the motors and the pack go beside them as car.hy
  const hy=driveHybridData(v,pt,rl),own=hy?hybCurves().eng:curve,direct=!!pt.direct;
  const ride=(SUSPENSION[v.suspension]||SUSPENSION.sport).hz;
  const car={
    name:v.chLabel||'',m:v.mass,Izz:v.mass*a*b,a,b,h:v.cg,tF:v.trackF||v.track,tR:v.trackR||v.track,
    r:v.rTire,Iw:(v.wheelI||2)/4,
    mu:tyreMu(v.FzRef,v.FzRef),muF:tyreMu(v.FzRefF||v.FzRef,v.FzRefF||v.FzRef),FzRef:v.FzRef,FzRefF:v.FzRefF||v.FzRef,
    loadSens:LOAD_SENS,muX:TYRE_MU_X,cc:v.tyreCC||tyreCC(v.tireType),ccP2:TYRE_CC_P2,slipOpt:TYRE_SLIP_OPT,slipC:TYRE_SLIP_C,relax:v.rTire,
    cdA:v.cdA,clA:v.clA||0,aeroBal:v.aeroBal==null?0.5:v.aeroBal,crr:v.crr,
    lltdF:v.lltdF==null?v.fWt:v.lltdF,tauLoad:1/(2*Math.PI*ride),
    drive:v.driveMech||v.drive,lock:(v.df&&v.df.lock)||0,ratios:(v.ratios||[1]).slice(),fd:v.finalDrive||1,eff:v.driveEff||0.9,
    shiftTime:v.shiftCut||0,ev:!!v.ev||direct,tc:!!v.tc,abs:true,
    rpm:own.map(p=>p.rpm),tq:own.map(p=>p.tq),ov:hy&&!direct?COMBUSTION.overrunTable(rl):pt.overrunTable(rl),idle:pt.idleRpm()||0,redline:rl,
    Ie:pt.inertia()||0.15,clutchCap:1.5*peak,
    fireRpm:FIRE_RPM,fireTurns:1/(engine.chargesPerRev||0.5),starterT0:v.ev?0:starterStallTorque(),starterFree:STARTER_FREE_RPM,   // stalling and starting, as on the bench
    // where a driver holds the engine to pull away flat out: at its torque peak, no higher than 60% of the redline
    launchRpm:Math.min(curve.reduce((m,p)=>p.tq>m.tq?p:m,curve[0]).rpm,0.6*rl),
    brakeF:brakeForceCap(v),brakeFront:v.brakeFrontShare,
    steerLock:8.5/(v.steerRatio||15)        // 2.7 turns of the hand wheel lock to lock (probable), through the ratio
  };
  if(hy)car.hy=hy;                          // the one member that is an object: plain data all the way down
  return car;
}
// A HYBRID AS PLAIN DATA (build 273), or null. Each motor is its envelope at the bus (Nm on n, rpm) and its losses (W)
// at 0, 25, 50, 75 and 100% of that envelope, from motorMaxTorque and motorLosses, the lap's own; tm is the help the
// HYBRID TUNE lets the main motor give flat out (hybCurves().mot). The pack is its open-circuit voltage every 10% of
// charge, its resistance, capacity and limits (packBuild). The controller's numbers are the tune's charge window and
// regeneration, and the LIVE bench's two charging rules (HYB_BENCH.chargeShare, and its 10% band about the target).
function driveHybridData(v,pt,rl){
  if(!isHybrid())return null;
  const e=engine,h=e.hy,c=hybCurves(),t=hybTune(e),V=hybBusV(h),b=h.pack;
  const tab=(m,ns)=>{const tc=m.cool.tCool,temp={w:tc+20,c:tc+15,r:60},env=ns.map(n=>n>m.nMax?0:motorMaxTorque(m,Math.max(n,1),V,60));
    return {n:ns,env,loss:[0,0.25,0.5,0.75,1].map(f=>ns.map((n,i)=>motorLosses(m,f*env[i],Math.max(n,1),V,temp).total))};};
  const M=tab(h.motor,c.eng.map(p=>p.rpm));M.tm=c.mot.slice();
  let F=null;
  if(h.front&&v.frontFd>0){const m=h.front.motor,ns=[];for(let k=0;k<=40;k++)ns.push(m.nMax*k/40);
    F=tab(m,ns);F.tq=ns.map(n=>hybFrontTq(h,n));F.fd=v.frontFd;F.eff=HYB_FRONT_EFF;F.share=h.front.shareF;}
  const ocv=[];for(let k=0;k<=10;k++)ocv.push(packOcv(b,k/10));
  return {m:M,front:F,share:h.shareR||1,pack:{ocv,R:b.R,Ah:b.Ah,vMin:b.vMin,iMax:b.iMax,pChg:b.pChargeMax},
    socLo:t.socLo/100,socT:t.socT/100,socHi:t.socHi/100,soc0:(e.hyPlug?t.socHi:t.socT)/100,   // a plug-in sets off full, as in the race
    kRegen:(HYB_REGEN[t.regen]||HYB_REGEN.high).k,lps:!!t.lps,chargeShare:HYB_BENCH.chargeShare,band:0.1};
}
// A motor's losses (W) at a torque and a speed, from its table.
function driveLoss(M,T,n){
  const env=driveLerp(M.n,M.env,n),x=env>0?Math.min(1,Math.abs(T)/env)*4:0,j=Math.min(3,Math.floor(x)),f=x-j;
  return driveLerp(M.n,M.loss[j],n)*(1-f)+driveLerp(M.n,M.loss[j+1],n)*f;
}
// A HYBRID'S CONTROLLER, ONE STEP (build 273): from the pedal p, the engine's speed nE and the main motor's nM (rpm; a
// P2's motor turns with the gearbox input, a power-split's or a series hybrid's is the shaft), what the engine is asked
// (s.thrE, its own throttle) and what the motors give (s.Tm Nm at the main motor, s.Tf at the front one), and the pack's
// charge s.soc after h seconds. on: the main motor is connected (a P2's is not in neutral or through a shift).
//   The pedal   asks the shaft for p of everything (the engine flat out and the motor's help) less (1 - p) of the
//               engine's overrun: the engine's own pedal law, with the motor. Right off the pedal the motor regenerates
//               on top of the overrun, as the lap has it.
//   The split   decision 13 of plans/hybrid-electric/, the lap's: the engine does all it can and the motor gives only
//               what the engine cannot. Charge-sustaining as the LIVE bench's AUTO: away from the target charge the
//               engine is asked for more (the motor charging with it) or less (the motor helping), by chargeShare of
//               the pack's charging power across a 10% band; without LOAD-POINT SHIFTING only under the low charge.
//   The pack    gives no more than its cut-off voltage and its rate allow at this charge (packMaxPower's law), nothing
//               under the window's low, and takes nothing over its high. Its charge moves by the current that carries
//               the motors' power and losses, P = (Voc - I R) I.
//   The front   motor gives the same share of its own torque as the main motor of its help; it does not regenerate
//               (the lap's does not either).
// Not here (named): the engine switched off for electric driving, the DRIVE MODEs, the fuel, the motors' and the
// pack's temperatures, a power-split's engine speed (its ring torque is the settled curve's).
function driveHybrid(car,s,p,nE,nM,nF,on,h){
  const hy=car.hy,M=hy.m,B=hy.pack,w=Math.max(nM,1)*Math.PI/30;
  const V0=driveLerp([0,0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9,1],B.ocv,s.soc),Ic=Math.min(B.iMax,(V0-B.vMin)/B.R);
  const Pmax=s.soc>hy.socLo?Math.max(0,(V0-Ic*B.R)*Ic):0,Pchg=s.soc<hy.socHi?B.pChg:0;
  const eFull=driveEngine(car,1,nE),eOff=driveEngine(car,0,nE);
  const help=on?driveLerp(M.n,M.tm,nM):0,chg=on?Math.min(driveLerp(M.n,M.env,nM),Pchg/w)*Math.min(1,nM/500):0;   // regeneration fades out under 500 rpm, as the lap's table has it
  const Tt=p*(eFull+help)+(1-p)*eOff-(p>0?0:hy.kRegen*chg);
  let Pc=Math.max(-1,Math.min(1,(hy.socT-s.soc)/hy.band))*hy.chargeShare*B.pChg;
  if(!hy.lps&&s.soc>=hy.socLo)Pc=Math.min(0,Pc);
  const TeW=Math.max(eOff,Math.min(eFull,Tt+(p>0?Pc/w:0)));
  let Tm=Math.max(-chg,Math.min(help,Tt-TeW)),P=Tm*w+(on?driveLoss(M,Tm,nM):0);
  if(Tm>0&&P>Pmax*hy.share){Tm=Math.max(0,(Pmax*hy.share-driveLoss(M,Tm,nM))/w);P=Tm*w+driveLoss(M,Tm,nM);}   // what is left after the losses it had: never over
  let Tf=0;const F=hy.front;
  if(F&&Tm>0&&help>0&&nF<F.n[F.n.length-1]){
    const wf=Math.max(nF,1)*Math.PI/30;Tf=Tm/help*driveLerp(F.n,F.tq,nF);
    let Pf=Tf*wf+driveLoss(F,Tf,nF);
    if(Pf>Pmax*F.share){Tf=Math.max(0,(Pmax*F.share-driveLoss(F,Tf,nF))/wf);Pf=Tf*wf+driveLoss(F,Tf,nF);}
    P+=Pf;
  }
  const Te=Math.max(eOff,Math.min(eFull,Tt-Tm));
  s.thrE=eFull>eOff?(Te-eOff)/(eFull-eOff):p;s.Tm=Tm;s.Tf=Tf;s.Pb=P;
  const I=(V0-Math.sqrt(Math.max(0,V0*V0-4*B.R*P)))/(2*B.R);
  s.soc=Math.max(0,Math.min(1,s.soc-I*h/(B.Ah*3600)));
}
// A car at rest, in neutral for a clutch car until the driver asks for a gear.
function driveState(car){
  return {t:0,x:0,y:0,psi:0,vx:0,vy:0,yaw:0,w:[0,0,0,0],we:car.idle*Math.PI/30,gear:1,shiftT:0,
    axF:0,ayF:0,al:[0,0,0,0],abs:[1,1,1,1],tcF:1,clF:1,pull:false,firing:true,soc:car.hy?car.hy.soc0:0,thrE:0,Tm:0,Tf:0,Pb:0,
    ax:0,ay:0,Fz:[0,0,0,0],kappa:[0,0,0,0],alpha:[0,0,0,0],Fx:[0,0,0,0],Fy:[0,0,0,0],rpm:car.idle,speed:0,delta:0};
}
function driveLerp(xs,ys,x){
  const n=xs.length;if(x<=xs[0])return ys[0];if(x>=xs[n-1])return ys[n-1];
  let i=1;while(xs[i]<x)i++;
  return ys[i-1]+(ys[i]-ys[i-1])*(x-xs[i-1])/(xs[i]-xs[i-1]);
}
// One tyre: the force along and across the wheel (N) for a load Fz, a slip ratio and a slip angle (rad).
// Returns [Fl, Ft, s, dFl/dkappa]: s is the share of the grip in use (1 = sliding all over the contact patch).
function driveTyre(car,Fz,kappa,alpha,front){
  if(!(Fz>1))return [0,0,0,0];
  const ref=front?car.FzRefF:car.FzRef,muY=(front?car.muF:car.mu)*Math.pow(Math.max(200,Fz)/ref,-car.loadSens),muX=car.muX*muY;
  const xz=Fz/ref,Ca=car.cc*Fz*(car.ccP2+1)/(car.ccP2+xz*xz),Ck=3*muX*Fz/car.slipOpt;                 // the longitudinal peak sits at slipOpt, as the launch has it
  const sx=Ck*kappa/(3*muX*Fz),sy=Ca*Math.tan(alpha)/(3*muY*Fz),s=Math.hypot(sx,sy);
  if(s<1e-9)return [0,0,0,Ck];
  let f;
  if(s<=1)f=3*s-3*s*s+s*s*s;
  else{const B=Math.tan(Math.PI/(2*car.slipC))/car.slipOpt;f=Math.sin(car.slipC*Math.atan(B*car.slipOpt*Math.min(s,30)));}   // sliding: the launch's curve
  return [muX*Fz*f*sx/s,muY*Fz*f*sy/s,s,Ck*Math.max(0.02,s<1?(1-s)*(1-s):0.02)];
}
// The engine's torque at the crank (Nm) for a pedal and a speed: full load by the pedal, its own drag off it,
// nothing past the limiter, and an idle governor that holds it up.
function driveEngine(car,thr,rpm){
  const wot=driveLerp(car.rpm,car.tq,rpm),ov=car.ev?0:car.ov[Math.max(0,Math.min(car.ov.length-1,Math.round((rpm-500)/250)))]||0;
  if(rpm>=car.redline)return -ov;
  let T=thr*wot-(1-thr)*ov;
  if(!car.ev&&rpm<car.idle)T+=Math.min(0.4*wot+ov,(car.idle-rpm)*0.5);
  return T;
}
// A lap's racing line as plain data for the driver below: where it runs, how fast the lap solver takes each point, and
// the road's height there. lap is what simulateLap() returns.
function driveLine(lap){return lap.track.line.map((q,i)=>({x:q.x,y:q.y,v:lap.v[i],grade:q.sinT||0,kv:q.kv||0}));}
// A DRIVER FOR A LINE (build 269): the inputs that take the car round a line of points {x, y, v, grade, kv}. It reads
// only its arguments (d is its memory: {i} the point it is at; it leaves d.e, how far left of the line the front
// axle is). What it does is a driver's manner, not the car's physics; its settings are in the register (DRIVE_DRIVER).
//   Wheel    it points the FRONT TYRES, not the car: at the direction the front axle is travelling, plus the slip
//            angle it wants from them. That is the path's direction against the axle's travel and a pull back to the
//            line that fades with speed (the two terms of Stanley's steering law: Hoffmann et al., ACC 2007), plus the
//            slip the corner just ahead needs (the front's share of m v^2 / R over its cornering stiffness). Never
//            more than a little past the angle the tyre peaks at: more lock past the peak only scrubs.
//            Because the reference is where the axle is going, a tail that steps out is met with opposite lock with
//            no extra rule; and once the rear tyres are past their peak, the front's slip is taken off by as much,
//            through zero if need be, so the front stops pulling the nose in while the rear recovers.
//   Pedals   by the force the plan asks of the tyres: the line's own change of speed, a correction for the speed
//            error, and what the air, the tyres and the slope take. Throttle is that force over what the engine has in
//            this gear; brake is the rest over what the brakes have. So a steady corner is held on part throttle, not
//            coasted on the engine's drag. With the rear past its peak the plan is dropped for a neutral pedal.
function driveDriver(car,s,line,d){
  const N=line.length,L=car.a+car.b,g=DRIVE_G,wrap=x=>x-2*Math.PI*Math.round(x/(2*Math.PI));
  const PREVIEW=0.15,PULL=1.5,PAST=1.2,SPEED=1;        // s of road read ahead; 1/s to the line; of the peak slip; 1/s on the speed error
  const fx=s.x+car.a*Math.cos(s.psi),fy=s.y+car.a*Math.sin(s.psi);
  let bi=d.i||0,bd=1e18;                                 // the nearest point, looked for ahead of the last one
  for(let k=0;k<40;k++){const j=((d.i||0)+k)%N,q=line[j],dd=(q.x-fx)*(q.x-fx)+(q.y-fy)*(q.y-fy);if(dd<bd){bd=dd;bi=j;}}
  d.i=bi;
  const p0=line[bi],p1=line[(bi+1)%N],hp=Math.atan2(p1.y-p0.y,p1.x-p0.x),ds=Math.hypot(p1.x-p0.x,p1.y-p0.y)||1;
  const e=-(fx-p0.x)*Math.sin(hp)+(fy-p0.y)*Math.cos(hp);d.e=e;
  const la=Math.max(1,Math.round(s.vx*PREVIEW/ds)),c=line[(bi+la)%N],c1=line[(bi+la+1)%N],c0=line[(bi+la-1+N)%N];
  const kap=wrap(Math.atan2(c1.y-c.y,c1.x-c.x)-Math.atan2(c.y-c0.y,c.x-c0.x))/(Math.hypot(c.x-c0.x,c.y-c0.y)||1);
  // ---- the wheel
  const vf=Math.atan2(s.vy+car.a*s.yaw,Math.max(1,s.vx));               // where the front axle is going, against the car
  const pkF=Math.atan(3*car.muF/car.cc),pkR=Math.atan(3*car.mu/car.cc);  // the slip angles the tyres peak at
  const need=s.vx*s.vx*kap/(g*car.cc);                                  // (m b/L) v^2 kap over the front's C = cc (m g b/L)
  const aR=(s.alpha[2]+s.alpha[3])/2,over=Math.sign(aR)*Math.max(0,Math.abs(aR)-pkR);
  const want=wrap(hp-s.psi-vf)+need-Math.atan2(PULL*e,3+s.vx)-over;
  const delta=vf+Math.max(-PAST*pkF,Math.min(PAST*pkF,want));
  // ---- the pedals
  const ease=Math.max(0,Math.min(1,2*(Math.max(Math.abs(s.alpha[2]),Math.abs(s.alpha[3]))/pkR-1)));   // rear past its peak: off the plan by 1.5 x
  const plan=(p1.v*p1.v-p0.v*p0.v)/(2*ds)+SPEED*(p0.v-s.vx);
  const F=car.m*plan*(1-ease)+0.5*DRIVE_RHO*car.cdA*s.vx*s.vx+car.crr*car.m*g+car.m*g*p0.grade;
  const k=s.gear>0?car.ratios[s.gear-1]*car.fd*car.eff/car.r:0,M=car.hy&&s.gear>0?car.hy.m:null,wot=driveEngine(car,1,s.rpm)+(M?driveLerp(M.n,M.tm,s.rpm):0),ov=-driveEngine(car,0,s.rpm);
  let thr=k>0?(F/k+ov)/Math.max(1,wot+ov):0,brk=0;
  if(thr<0){brk=Math.min(1,-(F+ov*k)/car.brakeF);thr=0;}
  return {steer:delta/car.steerLock,throttle:Math.min(1,thr),brake:brk,road:{sinT:p0.grade,kv:p0.kv}};
}
// Advance s by dt (s) under u = {steer -1..1 (left positive), throttle 0..1, brake 0..1, clutch 0..1 or null for an
// automatic clutch, gear 1.. or null for automatic shifts, road {sinT: the grade along the car, positive uphill; kv: the
// road's vertical curvature along it, 1/m, negative over a crest} or nothing for a flat road}. Returns s, with what happened in it for the instruments.
function stepCar(car,s,u,dt){
  const H=0.001,n=Math.max(1,Math.ceil(dt/H)),h=dt/n,g=DRIVE_G,L=car.a+car.b;
  const xw=[car.a,car.a,-car.b,-car.b],yw=[car.tF/2,-car.tF/2,car.tR/2,-car.tR/2];
  const drv=car.drive==='awd'?[1,1,1,1]:car.drive==='fwd'?[1,1,0,0]:[0,0,1,1],nd=drv[0]+drv[1]+drv[2]+drv[3];
  const steer=Math.max(-1,Math.min(1,u.steer||0)),brake=Math.max(0,Math.min(1,u.brake||0));
  let thr=Math.max(0,Math.min(1,u.throttle||0));
  const rd=u.road||{},sinT=rd.sinT||0,cosT=Math.sqrt(Math.max(0,1-sinT*sinT)),kv=rd.kv||0;
  for(let k=0;k<n;k++){
    const v=Math.hypot(s.vx,s.vy),delta=steer*car.steerLock,cd=Math.cos(delta),sd=Math.sin(delta);
    // ---- gearbox
    const top=car.ratios.length;
    if(s.shiftT>0){s.shiftT-=h;
      // with an automatic clutch the driver matches the revs for the gear coming (a blip going down), so the clutch
      // takes up without a jolt through the driven tyres
      if(s.shiftT<=0&&u.clutch==null&&!car.ev&&s.gear>0){let wm=0,nm=0;for(let i=0;i<4;i++)if(drv[i]){wm+=s.w[i];nm++;}
        s.we=Math.max(car.idle*Math.PI/30,wm/nm*car.ratios[s.gear-1]*car.fd);}}
    if(u.gear!=null){const gq=Math.max(0,Math.min(top,u.gear|0));if(gq!==s.gear){s.gear=gq;s.shiftT=car.shiftTime;}}
    else if(!car.ev&&s.shiftT<=0&&s.gear>0){
      let wdn=0,nn=0;for(let i=0;i<4;i++)if(drv[i]){wdn+=s.w[i];nn++;}
      const rpmNow=wdn/nn*car.ratios[s.gear-1]*car.fd*30/Math.PI;      // the speed the wheels give the engine in this gear
      if(rpmNow>0.97*car.redline&&s.gear<top){s.gear++;s.shiftT=car.shiftTime;}
      else if(s.gear>1&&rpmNow<0.42*car.redline&&rpmNow*car.ratios[s.gear-2]/car.ratios[s.gear-1]<0.85*car.redline&&thr<0.99){s.gear--;s.shiftT=car.shiftTime;}
      else if(s.gear>1&&rpmNow<Math.max(car.idle*1.15,0.22*car.redline)){s.gear--;s.shiftT=car.shiftTime;}
    }
    const ratio=s.gear>0?car.ratios[Math.min(top,s.gear)-1]*car.fd:0;
    // ---- loads
    // the road under the car: on a grade the weight presses with its cosine, and over a crest (kv < 0) or through a
    // dip (kv > 0) the car's own speed adds v^2 kv, as the lap has it. With nothing left the car is in the air.
    const gz=Math.max(0,g*cosT+s.vx*s.vx*kv);
    const down=0.5*DRIVE_RHO*car.clA*v*v,WF=car.m*gz*car.b/L+down*car.aeroBal,WR=car.m*gz*car.a/L+down*(1-car.aeroBal);
    const dX=car.m*s.axF*car.h/L,dYF=car.lltdF*car.m*s.ayF*car.h/car.tF,dYR=(1-car.lltdF)*car.m*s.ayF*car.h/car.tR;
    const Fz=s.Fz;
    Fz[0]=Math.max(0,(WF-dX)/2-dYF);Fz[1]=Math.max(0,(WF-dX)/2+dYF);Fz[2]=Math.max(0,(WR+dX)/2-dYR);Fz[3]=Math.max(0,(WR+dX)/2+dYR);
    // ---- tyres
    let FX=0,FY=0,MZ=0;const dF=[0,0,0,0],Fl=[0,0,0,0];
    for(let i=0;i<4;i++){
      const front=i<2,vxw=s.vx-s.yaw*yw[i],vyw=s.vy+s.yaw*xw[i];
      const vl=front?vxw*cd+vyw*sd:vxw,vt=front?-vxw*sd+vyw*cd:vyw,den=Math.max(Math.abs(vl),3);
      const kap=(s.w[i]*car.r-vl)/den,alp=-Math.atan2(vt,Math.max(Math.abs(vl),0.5));
      s.al[i]+=(alp-s.al[i])*Math.min(1,Math.abs(vl)*h/car.relax);          // the side force builds over the relaxation length
      const T=driveTyre(car,Fz[i],kap,s.al[i],front);
      Fl[i]=T[0];dF[i]=T[3]*car.r/den;s.kappa[i]=kap;s.alpha[i]=s.al[i];
      const fx=front?T[0]*cd-T[1]*sd:T[0],fy=front?T[0]*sd+T[1]*cd:T[1];
      s.Fx[i]=fx;s.Fy[i]=fy;FX+=fx;FY+=fy;MZ+=xw[i]*fy-yw[i]*fx;
    }
    // ---- engine, clutch, driveline
    let wd=0;for(let i=0;i<4;i++)if(drv[i])wd+=s.w[i];wd/=nd;
    // How far the driven tyres are past their peak, as a rate for whoever is holding them there (the ECU's traction
    // control on the throttle, or the driver's clutch foot pulling away): zero at the peak, closing fast beyond it.
    let worst=0;for(let i=0;i<4;i++)if(drv[i]||(i<2&&car.hy&&car.hy.front))worst=Math.max(worst,s.kappa[i]);
    const hold=Math.max(-30,Math.min(8,12*(1-worst/car.slipOpt)));
    const pulling=!car.ev&&u.clutch==null&&s.gear===1&&s.shiftT<=0&&s.we-wd*car.ratios[0]*car.fd>1;   // the clutch is still slipping from rest
    if(car.tc&&!pulling){s.tcF=Math.max(0.05,Math.min(1,s.tcF+hold*h));thr*=s.tcF;}else s.tcF=1;
    const rpm=s.we*30/Math.PI;
    // a hybrid: the controller shares the pedal between the engine and the motors (driveHybrid)
    let thrE=thr,Tm=0,Tf=0;const hy=car.hy;
    if(hy){const nM=Math.abs(wd)*ratio*30/Math.PI,F=hy.front;
      driveHybrid(car,s,thr,car.ev?nM:rpm,nM,F?Math.abs(s.w[0]+s.w[1])/2*F.fd*30/Math.PI:0,car.ev||(ratio>0&&s.shiftT<=0),h);
      thrE=s.thrE;Tm=s.Tm;Tf=F?s.Tf*F.fd*F.eff:0;}                           // Tf: now at the front wheels
    // An engine turning too slowly to fire stalls: then it is only its own drag, until the starter (u.starter) or
    // the wheels through the clutch (a bump start) turn it fast enough again.
    if(!car.ev){if(s.firing&&rpm<0.8*car.fireRpm)s.firing=false;
      else if(!s.firing){s.turns=rpm>=car.fireRpm?(s.turns||0)+rpm/60*h:0;if(s.turns>=car.fireTurns){s.firing=true;s.turns=0;}}}   // one whole cycle to draw and compress a charge
    let Te=s.firing||car.ev?driveEngine(car,s.shiftT>0?0:thrE,rpm):-(car.ov[0]||0)*Math.tanh(s.we/5)+(u.starter?car.starterT0*Math.max(0,1-rpm/car.starterFree):0);   // the driver lifts for a shift
    let Tw=0;                                                              // torque at the driven wheels, all of them (Nm)
    if(car.ev){Tw=(driveEngine(car,thrE,Math.abs(wd)*ratio*30/Math.PI)+Tm)*ratio*car.eff;s.we=Math.abs(wd)*ratio;}
    else{
      // The clutch. A pedal if the driver gives one; otherwise a driver's two feet pulling away: the left feeds the
      // clutch in no faster than the tyres can take, the right holds the engine at the speed the pedal asks (idle off
      // it, the launch speed flat out) until the wheels have caught up and the clutch locks.
      const auto=u.clutch==null,slip=s.we-wd*ratio,pedal=Math.max(0,Math.min(1,u.throttle||0));
      let cap=ratio===0||s.shiftT>0?0:car.clutchCap*(auto?1:1-Math.max(0,Math.min(1,u.clutch)));
      if(auto&&cap>0&&slip>1&&(s.gear===1||wd*ratio<car.idle*Math.PI/30)){
        const wT=(car.idle+(s.gear===1?pedal*(car.launchRpm-car.idle):0))*Math.PI/30,avail=Math.max(0,driveEngine(car,thrE,rpm));
        if(!s.pull){s.pull=true;s.clF=0.1;}                                   // the bite point, then in
        s.clF=Math.max(0.05,Math.min(1,s.clF+hold*h));
        cap*=s.clF;
        if(s.we<wT)cap=Math.min(cap,Math.max(0,avail-4*(wT-s.we)));        // below it: let the engine come back up
        else Te=Math.min(Te,cap+4*(wT-s.we));            // above it: no more fuel than holds it there
      }else{s.clF=1;s.pull=false;}
      // Locked, the clutch passes exactly the torque that keeps the engine and the wheels turning together (the
      // torque that brings their slip to nothing in this step, from each side's own acceleration: Karnopp's stick
      // condition); it slips when that is more than it can hold, and then passes what it can hold.
      let Id=0,aW=0;for(let i=0;i<4;i++)if(drv[i]){const Iq=car.Iw+h*car.r*dF[i];Id+=Iq;aW-=(Fl[i]*car.r+car.crr*Fz[i]*car.r*Math.tanh(s.w[i]*car.r/0.5)-Tm*ratio*car.eff/nd-(i<2?Tf/2:0))/Iq;}
      aW/=nd;
      let Tcl=(slip/h+Te/car.Ie-ratio*aW)/(1/car.Ie+ratio*ratio*car.eff/Id);
      Tcl=Math.max(-cap,Math.min(cap,Tcl));
      s.we=Math.max(0,s.we+h*(Te-Tcl)/car.Ie);
      Tw=(Tcl+Tm)*ratio*car.eff;                                           // a P2's motor is on the gearbox's input
    }
    // ---- wheels
    for(let ax=0;ax<2;ax++){
      const i=ax*2,j=i+1,driven=drv[i];
      let Ti=(driven?Tw/nd:0)+(ax===0?Tf/2:0),Tj=Ti;
      if(driven&&car.lock>0){const Tc=Math.max(-car.clutchCap*car.fd,Math.min(car.clutchCap*car.fd,car.lock*300*(s.w[i]-s.w[j])));Ti-=Tc;Tj+=Tc;}
      const share=ax===0?car.brakeFront:1-car.brakeFront;
      for(const [q,Tq] of [[i,Ti],[j,Tj]]){
        if(car.abs){const vl=Math.abs(s.vx);s.abs[q]=Math.max(0.05,Math.min(1,s.abs[q]+((s.kappa[q]<-car.slipOpt*1.3&&vl>2)?-25:12)*h));}
        const Tb=brake*car.brakeF*share/2*car.r*(car.abs?s.abs[q]:1);
        const roll=car.crr*Fz[q]*car.r*Math.tanh(s.w[q]*car.r/0.5);
        const Iq=car.Iw+h*car.r*dF[q];                                      // the tyre's own stiffness taken implicitly
        let wq=s.w[q]+h*(Tq-Fl[q]*car.r-roll)/Iq;
        const db=h*Tb/Iq;                                                  // the brake can stop a wheel, never turn it back
        if(Math.abs(wq)<=db)wq=0;else wq-=Math.sign(wq)*db;
        s.w[q]=wq;
      }
    }
    // ---- body
    const drag=0.5*DRIVE_RHO*car.cdA*v*s.vx,ax=(FX-drag)/car.m-g*sinT,ay=FY/car.m;
    s.vx+=h*(ax+s.vy*s.yaw);s.vy+=h*(ay-s.vx*s.yaw);s.yaw+=h*MZ/car.Izz;
    if(brake>0&&thr===0&&Math.abs(s.vx)<0.05&&Math.abs(s.vy)<0.05){s.vx=0;s.vy=0;s.yaw=0;}   // held on the brakes
    s.psi+=h*s.yaw;const c=Math.cos(s.psi),sn=Math.sin(s.psi);
    s.x+=h*(s.vx*c-s.vy*sn);s.y+=h*(s.vx*sn+s.vy*c);
    const kL=Math.min(1,h/car.tauLoad);s.axF+=(ax-s.axF)*kL;s.ayF+=(ay-s.ayF)*kL;
    s.ax=ax;s.ay=ay;s.delta=delta;s.t+=h;
  }
  s.rpm=s.we*30/Math.PI;s.speed=Math.hypot(s.vx,s.vy);
  return s;
}
