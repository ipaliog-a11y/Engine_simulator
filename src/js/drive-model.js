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
//             TIRE_TYPE.cc, falling with the load: ccLoad), the longitudinal peak at TYRE_SLIP_OPT, braking and traction at TYRE_MU_X of the
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
//   Road      its height under the car (build 268), given with the inputs: the slope along the car (u.grade, the sine
//             of the climb) pulls it back by g sin, and the road's curvature in height (u.kv, 1/m, negative over a
//             crest) presses the tyres by m v^2 kv, as the lap solver's loadAt has it. Past v^2 kv = -g cos the car
//             is in the air: no load, no tyre force. s.z is the height climbed.
//
// NOT YET (named, so nobody rediscovers them): the turbo's shaft in time (boost is the settled curve's), tyre and
// brake temperatures, camber and roll steer, the road's side slope, bumps and kerbs (one
// height for the whole car: the front axle meets a crest no sooner than the rear), a hybrid's controller. The lap solver has
// each of these; they move here in later builds of phase E.
// ================================================================================================
const DRIVE_G=9.81, DRIVE_RHO=1.20;
// The designed car as plain data. Everything stepCar needs, and nothing that is not a number, a string or an array.
function driveCar(){
  const v=vehicle,pt=powertrain(),L=v.wb,a=L*(1-v.fWt),b=L*v.fWt;
  const curve=pt.torqueCurve(),rl=pt.maxRpm(),peak=curve.reduce((m,p)=>Math.max(m,p.tq),0);
  const ride=(SUSPENSION[v.suspension]||SUSPENSION.sport).hz;
  return {
    name:v.chLabel||'',m:v.mass,Izz:v.mass*a*b,a,b,h:v.cg,tF:v.trackF||v.track,tR:v.trackR||v.track,
    r:v.rTire,Iw:(v.wheelI||2)/4,
    mu:tyreMu(v.FzRef,v.FzRef),muF:tyreMu(v.FzRefF||v.FzRef,v.FzRefF||v.FzRef),FzRef:v.FzRef,FzRefF:v.FzRefF||v.FzRef,
    loadSens:LOAD_SENS,muX:TYRE_MU_X,cc:v.tyreCC||tyreCC(v.tireType),ccLoad:TYRE_CC_LOAD,slipOpt:TYRE_SLIP_OPT,slipC:TYRE_SLIP_C,relax:v.rTire,
    cdA:v.cdA,clA:v.clA||0,aeroBal:v.aeroBal==null?0.5:v.aeroBal,crr:v.crr,
    lltdF:v.lltdF==null?v.fWt:v.lltdF,tauLoad:1/(2*Math.PI*ride),
    drive:v.drive,lock:(v.df&&v.df.lock)||0,ratios:(v.ratios||[1]).slice(),fd:v.finalDrive||1,eff:v.driveEff||0.9,
    shiftTime:v.shiftCut||0,ev:!!v.ev,tc:!!v.tc,abs:true,
    rpm:curve.map(p=>p.rpm),tq:curve.map(p=>p.tq),ov:pt.overrunTable(rl),idle:pt.idleRpm()||0,redline:rl,
    Ie:pt.inertia()||0.15,clutchCap:1.5*peak,
    fireRpm:FIRE_RPM,fireTurns:1/(engine.chargesPerRev||0.5),starterT0:v.ev?0:starterStallTorque(),starterFree:STARTER_FREE_RPM,   // stalling and starting, as on the bench
    // where a driver holds the engine to pull away flat out: at its torque peak, no higher than 60% of the redline
    launchRpm:Math.min(curve.reduce((m,p)=>p.tq>m.tq?p:m,curve[0]).rpm,0.6*rl),
    brakeF:brakeForceCap(v),brakeFront:v.brakeFrontShare,
    steerLock:8.5/(v.steerRatio||15)        // 2.7 turns of the hand wheel lock to lock (probable), through the ratio
  };
}
// A car at rest, in neutral for a clutch car until the driver asks for a gear.
function driveState(car){
  return {t:0,x:0,y:0,z:0,psi:0,vx:0,vy:0,yaw:0,w:[0,0,0,0],we:car.idle*Math.PI/30,gear:1,shiftT:0,
    axF:0,ayF:0,al:[0,0,0,0],abs:[1,1,1,1],tcF:1,clF:1,pull:false,firing:true,
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
  const p2=car.ccLoad*car.ccLoad,xz=Fz/ref,Ca=car.cc*Fz*(p2?(p2+1)/(p2+xz*xz):1),Ck=3*muX*Fz/car.slipOpt;                 // the longitudinal peak sits at slipOpt, as the launch has it
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
// Advance s by dt (s) under u = {steer -1..1 (left positive), throttle 0..1, brake 0..1, clutch 0..1 or null for an
// automatic clutch, gear 1.. or null for automatic shifts, grade and kv for the road's height (see Road above)}. Returns s, with what happened in it for the instruments.
function stepCar(car,s,u,dt){
  const H=0.001,n=Math.max(1,Math.ceil(dt/H)),h=dt/n,g=DRIVE_G,L=car.a+car.b;
  const xw=[car.a,car.a,-car.b,-car.b],yw=[car.tF/2,-car.tF/2,car.tR/2,-car.tR/2];
  const drv=car.drive==='awd'?[1,1,1,1]:car.drive==='fwd'?[1,1,0,0]:[0,0,1,1],nd=drv[0]+drv[1]+drv[2]+drv[3];
  const steer=Math.max(-1,Math.min(1,u.steer||0)),brake=Math.max(0,Math.min(1,u.brake||0));
  let thr=Math.max(0,Math.min(1,u.throttle||0));
  const sinT=Math.max(-0.7,Math.min(0.7,u.grade||0)),cosT=Math.sqrt(1-sinT*sinT),kv=u.kv||0;
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
    const gN=Math.max(0,g*cosT+v*v*kv);                                    // what presses the car on the road, per kg
    const down=0.5*DRIVE_RHO*car.clA*v*v,WF=car.m*gN*car.b/L+down*car.aeroBal,WR=car.m*gN*car.a/L+down*(1-car.aeroBal);
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
    let worst=0;for(let i=0;i<4;i++)if(drv[i])worst=Math.max(worst,s.kappa[i]);
    const hold=Math.max(-30,Math.min(8,12*(1-worst/car.slipOpt)));
    const pulling=!car.ev&&u.clutch==null&&s.gear===1&&s.shiftT<=0&&s.we-wd*car.ratios[0]*car.fd>1;   // the clutch is still slipping from rest
    if(car.tc&&!pulling){s.tcF=Math.max(0.05,Math.min(1,s.tcF+hold*h));thr*=s.tcF;}else s.tcF=1;
    const rpm=s.we*30/Math.PI;
    // An engine turning too slowly to fire stalls: then it is only its own drag, until the starter (u.starter) or
    // the wheels through the clutch (a bump start) turn it fast enough again.
    if(!car.ev){if(s.firing&&rpm<0.8*car.fireRpm)s.firing=false;
      else if(!s.firing){s.turns=rpm>=car.fireRpm?(s.turns||0)+rpm/60*h:0;if(s.turns>=car.fireTurns){s.firing=true;s.turns=0;}}}   // one whole cycle to draw and compress a charge
    let Te=s.firing||car.ev?driveEngine(car,s.shiftT>0?0:thr,rpm):-(car.ov[0]||0)*Math.tanh(s.we/5)+(u.starter?car.starterT0*Math.max(0,1-rpm/car.starterFree):0);   // the driver lifts for a shift
    let Tw=0;                                                              // torque at the driven wheels, all of them (Nm)
    if(car.ev){Tw=driveEngine(car,thr,Math.abs(wd)*ratio*30/Math.PI)*ratio*car.eff;s.we=Math.abs(wd)*ratio;}
    else{
      // The clutch. A pedal if the driver gives one; otherwise a driver's two feet pulling away: the left feeds the
      // clutch in no faster than the tyres can take, the right holds the engine at the speed the pedal asks (idle off
      // it, the launch speed flat out) until the wheels have caught up and the clutch locks.
      const auto=u.clutch==null,slip=s.we-wd*ratio,pedal=Math.max(0,Math.min(1,u.throttle||0));
      let cap=ratio===0||s.shiftT>0?0:car.clutchCap*(auto?1:1-Math.max(0,Math.min(1,u.clutch)));
      if(auto&&cap>0&&slip>1&&(s.gear===1||wd*ratio<car.idle*Math.PI/30)){
        const wT=(car.idle+(s.gear===1?pedal*(car.launchRpm-car.idle):0))*Math.PI/30,avail=Math.max(0,driveEngine(car,thr,rpm));
        if(!s.pull){s.pull=true;s.clF=0.1;}                                   // the bite point, then in
        s.clF=Math.max(0.05,Math.min(1,s.clF+hold*h));
        cap*=s.clF;
        if(s.we<wT)cap=Math.min(cap,Math.max(0,avail-4*(wT-s.we)));        // below it: let the engine come back up
        else Te=Math.min(Te,cap+4*(wT-s.we));            // above it: no more fuel than holds it there
      }else{s.clF=1;s.pull=false;}
      // Locked, the clutch passes exactly the torque that keeps the engine and the wheels turning together (the
      // torque that brings their slip to nothing in this step, from each side's own acceleration: Karnopp's stick
      // condition); it slips when that is more than it can hold, and then passes what it can hold.
      let Id=0,aW=0;for(let i=0;i<4;i++)if(drv[i]){const Iq=car.Iw+h*car.r*dF[i];Id+=Iq;aW-=(Fl[i]*car.r+car.crr*Fz[i]*car.r*Math.tanh(s.w[i]*car.r/0.5))/Iq;}
      aW/=nd;
      let Tcl=(slip/h+Te/car.Ie-ratio*aW)/(1/car.Ie+ratio*ratio*car.eff/Id);
      Tcl=Math.max(-cap,Math.min(cap,Tcl));
      s.we=Math.max(0,s.we+h*(Te-Tcl)/car.Ie);
      Tw=Tcl*ratio*car.eff;
    }
    // ---- wheels
    for(let ax=0;ax<2;ax++){
      const i=ax*2,j=i+1,driven=drv[i];
      let Ti=driven?Tw/nd:0,Tj=Ti;
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
    const drag=0.5*DRIVE_RHO*car.cdA*v*s.vx,ax=(FX-drag)/car.m,ay=FY/car.m;
    s.vx+=h*(ax-g*sinT+s.vy*s.yaw);s.vy+=h*(ay-s.vx*s.yaw);s.yaw+=h*MZ/car.Izz;
    if(brake>0&&thr===0&&Math.abs(s.vx)<0.05&&Math.abs(s.vy)<0.05){s.vx=0;s.vy=0;s.yaw=0;}   // held on the brakes
    s.psi+=h*s.yaw;const c=Math.cos(s.psi),sn=Math.sin(s.psi);
    s.x+=h*cosT*(s.vx*c-s.vy*sn);s.y+=h*cosT*(s.vx*sn+s.vy*c);s.z+=h*s.vx*sinT;
    const kL=Math.min(1,h/car.tauLoad);s.axF+=(ax-s.axF)*kL;s.ayF+=(ay-s.ayF)*kL;
    s.ax=ax;s.ay=ay;s.delta=delta;s.t+=h;
  }
  s.rpm=s.we*30/Math.PI;s.speed=Math.hypot(s.vx,s.vy);
  return s;
}
