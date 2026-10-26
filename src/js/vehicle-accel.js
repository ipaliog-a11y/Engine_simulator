// The rolling diameter the fitted tyre actually gives (in), for the fitment read-out.
function fitmentLabel(v){
  const dia=(v.wheelDia*25.4+2*v.tireWidth*v.tireAspect/100)/25.4;
  return v.tireWidth+'/'+v.tireAspect+'R'+v.wheelDia+' ('+dia.toFixed(1)+'in Ø)';
}
// True when every fitted part still matches the chassis' factory spec.
function isFactoryFit(v){
  const ch=CHASSIS[v.chassis];if(!ch||!ch.fit)return false;const f=v.body?v.body.fit:ch.fit;
  return v.drive===(v.body?f.drive:ch.drive)&&(v.governor||0)===(f.gov||0)&&(v.tc!==false)===(f.tc!==false)&&v.gears===f.gears&&v.gearing===f.gearing&&v.spacing===(v.body?'stock':'std')&&!(v.finalDriveSet>0)&&v.gearbox===f.gearbox&&v.diff===f.diff&&
    v.tireType===f.tire&&v.tireWidth===f.tw&&(v.tireWidthF||0)===(f.twF||0)&&!stepOf(v.springF)&&!stepOf(v.springR)&&!stepOf(v.barF)&&!stepOf(v.barR)&&v.tireAspect===f.ta&&v.wheelDia===f.wheel&&
    v.aeroFront===f.aF&&v.aeroRear===f.aR&&v.aeroFloor===f.aFl&&v.weightRed===f.weight&&
    v.brakeType===f.brake&&v.rotor===f.rotor&&v.suspension===f.susp&&geoStock(v);
}
// Both axles on the factory's geometry (build 173); a save from before carries none, which is the factory's.
function geoStock(v){const fg=factoryGeo(v);return (v.suspFront||fg.f)===fg.f&&(v.suspRear||fg.r)===fg.r;}
function computeVehicleCost(ch,tt,wr){
  let c=ch.cost+tt.cost+wr.cost;
  c+=(AERO_COST[vehicle.aeroFront]||0)+(AERO_COST[vehicle.aeroRear]||0)+(AERO_COST[vehicle.aeroFloor]||0);
  c+=(BRAKE_TYPE[vehicle.brakeType]||BRAKE_TYPE.slotted).cost+(SUSPENSION[vehicle.suspension]||SUSPENSION.sport).cost;
  // a geometry the car was not built with is a conversion: new subframe mounts, arms and uprights
  {const fg=factoryGeo(vehicle);
   if(vehicle.suspFront&&vehicle.suspFront!==fg.f)c+=(SUSP_GEO[vehicle.suspFront]||{cost:0}).cost;
   if(vehicle.suspRear&&vehicle.suspRear!==fg.r)c+=(SUSP_GEO[vehicle.suspRear]||{cost:0}).cost;}
  // springs and bars off STANDARD are new parts (build 174)
  c+=(stepOf(vehicle.springF)?1:0)*STIFF_STEP_COST.spring+(stepOf(vehicle.springR)?1:0)*STIFF_STEP_COST.spring+
     (stepOf(vehicle.barF)?1:0)*STIFF_STEP_COST.bar+(stepOf(vehicle.barR)?1:0)*STIFF_STEP_COST.bar;
  c+=Math.max(0,vehicle.rotor-320)*6;
  c+={fwd:0,rwd:800,awd:2500}[vehicle.drive]||0;
  c+=(GEARBOX[vehicle.gearbox]||GEARBOX.manual).cost+(DIFF[vehicle.diff]||DIFF.open).cost;
  c+=Math.max(0,vehicle.gears-5)*400;
  c+=Math.max(0,vehicle.wheelDia-16)*120+Math.max(0,vehicle.tireWidth-205)*4;
  return Math.max(3000,Math.round(c/50)*50);
}
let vehRev=0;                      // bumped on every rebuild, so lap results can be cached
function buildVehicle(){
  vehRev++;
  vehicle=readVehicleFromForm();
  const ch=CHASSIS[vehicle.chassis]||CHASSIS.coupe, tt=TIRE_TYPE[vehicle.tireType]||TIRE_TYPE.sport, wr=WEIGHT_RED[vehicle.weightRed]||WEIGHT_RED.none;
  const body=vehicle.body;
  vehicle.chLabel=body?body.name:ch.label;
  const sidewall=vehicle.tireWidth*(vehicle.tireAspect/100);           // mm
  vehicle.rTire=((vehicle.wheelDia*25.4)/2+sidewall)/1000;            // rolling radius (m)
  vehicle.wheelI=roadWheelInertia(vehicle);                                // kg m2, all four
  const susp=SUSPENSION[vehicle.suspension]||SUSPENSION.sport;
  {const D=2*vehicle.rTire,d=vehicle.wheelDia*0.0254;
   vehicle.tyreRatedKg=TYRE_RATED_KG_M3*Math.PI/4*(D*D-d*d)*(vehicle.tireWidth/1000);}
  vehicle.muRef=tt.mu;vehicle.FzRef=TYRE_REF_SHARE*vehicle.tyreRatedKg*G;
  // a staggered car's front tyres (build 157): their rated load scales with their width on the same wheel
  vehicle.FzRefF=vehicle.FzRef*((vehicle.tireWidthF>0?vehicle.tireWidthF:vehicle.tireWidth)/vehicle.tireWidth);
  vehicle.camber=susp.camber;
  vehicle.crr=tt.crr;
  vehicle.speedRating=document.getElementById('vhRating').value||tt.rating;
  vehicle.ratedKmh=(SPEED_RATING[vehicle.speedRating]||SPEED_RATING.Y).kmh;
  vehicle.brakeTh=brakeThermal(vehicle);   // rotors, material and pads: brake temperature and fade (build 107)
  vehicle.engineMass=engineMass();
  // A real car is quoted at curb mass with its own engine in it. The platform is what is left when
  // that engine comes out, taken once from the engine first fitted, so a swap then moves the mass by
  // the difference between the two engines, as it would on the real car.
  if(body&&!(body.mass>0))body.mass=Math.max(250,body.kg-vehicle.engineMass);
  if(body&&!(body.engKg>0))body.engKg=vehicle.engineMass;   // the factory engine, for the weight split below
  vehicle.mass=Math.max(380,(body?body.mass:ch.mass)+vehicle.engineMass-wr.kg);
  // Brakes: the deceleration the hydraulics can command (m/s2, before fade).
  vehicle.brakeDecelCap=brakeForceCap(vehicle)/vehicle.mass;
  vehicle.wb=body?body.wb:ch.wb;vehicle.cg=ch.cg;vehicle.area=body?body.area:ch.area;
  vehicle.track=(body&&body.track)||ch.track;
  // Each axle's own track and geometry (build 173): a real car's published front and rear tracks, else the archetype's
  // for both. The camber the outside wheel wins back from the roll follows the axle's track (geoRecovery); a solid axle
  // carries no static camber, the axle sets it; a solid axle's roll centre is its own wheel centre.
  {const sr=body&&SUSP_REAL[body.name],fg=factoryGeo(vehicle);
   vehicle.trackF=sr?sr.tf:vehicle.track;vehicle.trackR=sr?sr.tr:vehicle.track;
   vehicle.track=(vehicle.trackF+vehicle.trackR)/2;
   if(!SUSP_GEO[vehicle.suspFront])vehicle.suspFront=fg.f;
   if(!SUSP_GEO[vehicle.suspRear])vehicle.suspRear=fg.r;
   const gF=SUSP_GEO[vehicle.suspFront],gR=SUSP_GEO[vehicle.suspRear];
   vehicle.camRecF=geoRecovery(gF,vehicle.trackF);vehicle.camRecR=geoRecovery(gR,vehicle.trackR);
   vehicle.camberF=vehicle.suspFront==='solid'?0:susp.camber;vehicle.camberR=vehicle.suspRear==='solid'?0:susp.camber;
   vehicle.rcF=gF.rc!=null?gF.rc:vehicle.rTire;vehicle.rcR=gR.rc!=null?gR.rc:vehicle.rTire;}
  // The headline mu (summary, g-meter): the tyre's, at the car's own weight shared over four tyres.
  vehicle.mu=tyreMu(vehicle.mass*G/4);
  // The weight split moves with an engine swap, by the difference in engine mass at the engine's
  // position (build 105). A real car's split is quoted with its own engine in it; a heavier one in a
  // front-engined car loads the nose, in a mid-engined car the tail. Archetypes keep their class split,
  // which is not tied to any one engine.
  vehicle.fWt=ch.fWt;
  if(body){
    const dm=vehicle.engineMass-body.engKg, share=ENGINE_FRONT_SHARE[engineLayoutOf(vehicle.chassis,body)];
    vehicle.fWt=clamp((body.fWt*body.kg+dm*share)/Math.max(1,body.kg+dm),0.25,0.75);
  }
  const af=AERO_FRONT[vehicle.aeroFront]||AERO_FRONT.none, ar=AERO_REAR[vehicle.aeroRear]||AERO_REAR.none, al=AERO_FLOOR[vehicle.aeroFloor]||AERO_FLOOR.none;
  vehicle.clA=(af.cl+ar.cl+al.cl)*ch.aero;                            // downforce coefficient·area
  // Where that downforce lands (build 105). It was split 50/50 whatever was fitted, so a rear wing helped
  // a front-driver's traction as much as a rear-driver's. Front parts load the front axle, rear parts the
  // rear, and the floor at its centre of pressure (AERO_FLOOR.front).
  const clF=(af.cl+al.cl*(al.front!=null?al.front:0.5))*ch.aero;
  vehicle.aeroBal=vehicle.clA>0?clF/vehicle.clA:0.5;   // share of the downforce on the front axle
  // the driven axle's share of the weight (static) and of the downforce
  vehicle.drivenWt=vehicle.drive==='awd'?1:vehicle.drive==='rwd'?1-vehicle.fWt:vehicle.fWt;
  // Roll balance (build 157): the front's share of the lateral load transfer. Build 173 splits the transfer m ay h in two
  // (Milliken & Milliken, RCVD ch. 18). Each axle's own mass, at its own roll centre, pushes on its tyres through the
  // links: fWt zF at the front, (1 - fWt) zR at the rear, so a high roll centre puts transfer on its own axle. What is
  // left is the body rolling about the roll axis (the line through the two roll centres, at fWt zF + (1 - fWt) zR under
  // the centre of mass), and that goes through the springs and anti-roll bars by their stiffness split (build 174:
  // rollStiffness; at STANDARD the weight split, each axle's tyres then carrying the same share of it as of the weight).
  // Stiffer front springs or bars move transfer forward, which costs the front grip (understeer); stiffer rear ones
  // move it back (oversteer). With both roll centres on the ground this is build 157's split.
  // The body rolls about the roll axis by its roll moment m ay (h - z_axis) over the two axles' stiffness together
  // (build 174; until then each kit rolled a fixed deg/g whatever the car): a tall car on a narrow track rolls more.
  {const fw=vehicle.fWt,zAx=fw*vehicle.rcF+(1-fw)*vehicle.rcR,arm=Math.max(0,vehicle.cg-zAx),K=rollStiffness(vehicle);
   vehicle.rollKF=K.F/(K.F+K.R);vehicle.rollK=K.F+K.R;
   vehicle.rollGrad=vehicle.mass*G*arm/vehicle.rollK*180/Math.PI;   // deg per g
   vehicle.lltdF=clamp((arm*vehicle.rollKF+fw*vehicle.rcF)/Math.max(0.05,arm+zAx),0.15,0.85);}
  vehicle.drivenAero=vehicle.drive==='awd'?1:vehicle.drive==='rwd'?1-vehicle.aeroBal:vehicle.aeroBal;
  vehicle.cdA=((body?body.cd:ch.cd)+af.cd+ar.cd+al.cd)*vehicle.area;  // drag coefficient·area
  const gb=GEARBOX[vehicle.gearbox]||GEARBOX.manual,df=DIFF[vehicle.diff]||DIFF.open;
  vehicle.gb=gb;vehicle.gbLabel=gb.label;
  vehicle.df=df;vehicle.diffLabel=df.label;vehicle.diffTraction=df.traction;
  vehicle.shiftTime=gb.shift;
  vehicle.shiftCut=gb.powershift?0:gb.shift;   // the drive lost on an upshift (build 171): none on a powershift box
  vehicle.driveEff=(DRIVE_EFF[vehicle.drive]||0.90)*gb.eff;          // layout loss × gearbox loss
  const gs=gearRatiosFor(vehicle);
  vehicle.ratios=gs.r;vehicle.gearsetApprox=!!gs.approx;vehicle.fdPublished=gs.fd>0?gs.fd:0;
  // Final drive derived from the engine, not read off a slider.
  //
  // It used to be lerp(4.9, 2.6, gearing/100) and nothing else — so a 3800 rpm diesel was handed
  // the same ratios as a 9000 rpm screamer. Measured against real cars the consequence was stark:
  // the drag-limited top speed was already right (Golf TDI 219 km/h against a real 216, Corvette
  // 310 against 306, GTI 252 against 246) and the cars simply ran out of GEAR before reaching it,
  // topping out at 167, 260 and 242. Three builds were leaving 2-2.5x their top-speed drag power
  // unused, and the TDI made its rated power to within 1% while being 58% slow to 100 km/h.
  //
  // A car is geared for maximum speed when the engine sits at its POWER PEAK exactly as drag
  // consumes that power — not at the limiter, where it is already past peak and cannot hold the
  // speed. So solve the drag balance for v, then pick the ratio that puts peakHPrpm there:
  //     P_peak * eta = 0.5*rho*CdA*v^3 + Crr(v)*m*g*v        ->  v_max
  //     fd = peakHPrpm * 2pi * r_tire / 60 / (v_max * topGearRatio)
  // Gearing slightly longer than that is what makes top gear an overdrive and moves Vmax a gear
  // down; the top-speed solver already scans every gear, so that falls out rather than being
  // arranged. The slider survives as a BIAS about the derived value — 1.28x (short, for
  // acceleration) to 0.74x (tall, for cruising), passing through 1.00 at its default of 52. That
  // 1.73x span is close to the old slider's 1.88x, so the design choice stays as meaningful as it
  // was; what changed is that it is now a choice ABOUT a sensible baseline instead of an absolute
  // ratio handed to every engine alike.
  // A real car's published final drive (build 169) stands in for the matched one, biased by the slider about it
  // just the same; a hand-set final drive overrides both.
  vehicle.finalDrive=vehicle.finalDriveSet>0?clamp(vehicle.finalDriveSet,FD_MIN,FD_MAX)
    :gs.fd>0?clamp(gs.fd*gearingBias(vehicle.gearing)/gearingBias(52),FD_MIN,FD_MAX):matchedFinalDrive();
  vehicle.cost=computeVehicleCost(ch,tt,wr);
  vehicle.powerToWeight=engine.score?engine.score.peakHP/(vehicle.mass/1000):0;   // hp per tonne
  perf=simulateAccel();
  if(perf){
    perf.brake100=simulateBraking(100/3.6);        // 100→0 stopping distance
    perf.brake200=simulateBraking(200/3.6);        // 200→0 (used by the 0-200-0 test)
    if(perf.t200!=null){                            // 0-200-0: accelerate to 200 then brake to 0
      perf.zt=perf.t200+perf.brake200.time;
      perf.zd=perf.x200+perf.brake200.dist;
    }else{perf.zt=null;perf.zd=null;}
  }
  // The lap solver is heavier than the straight-line runs, so only re-run it while it's on screen.
  if(typeof vizMode!=='undefined'&&vizMode==='track'&&typeof refreshLap==='function')refreshLap();
  if(typeof updateBuildStrip==='function')updateBuildStrip();
}
// Braking run from v0 (m/s) to a stop: decel is the lesser of tyre grip (μ·(weight+downforce))
// and what the brakes can command (capacity, fading as they absorb heat), with aero drag also
// helping to slow the car. Returns stopping distance (m) and time (s).
function simulateBraking(v0,T0){
  const m=vehicle.mass,dt=0.005,th=vehicle.brakeTh;let v=v0,x=0,t=0;
  const st={F:T0!=null?T0:BRAKE_AMBIENT,R:T0!=null?T0:BRAKE_AMBIENT};   // a stop from cold unless told
  while(v>0.15&&t<25){
    const down=0.5*AIR_RHO*vehicle.clA*v*v;
    const gripDecel=tyreMuX((m*G+down)/4)*(m*G+down)/m;             // tyre-limited, at the load on each tyre
    const brakeDecel=vehicle.brakeDecelCap*brakeFadeAt(st.F,th);   // brake-limited, at the rotor's temperature
    // mechanical (tyre/brake) decel, rising to it over the pressure build-up time
    const mech=Math.min(gripDecel,brakeDecel)*Math.min(1,t/BRAKE_RISE_S);
    const aero=(0.5*AIR_RHO*vehicle.cdA*v*v)/m;                    // drag also decelerates
    brakeHeatStep(st,th,mech,v,dt);                               // the work, into the rotors
    v=Math.max(0,v-(mech+aero)*dt);x+=v*dt;t+=dt;
  }
  return {dist:x,time:t,tF:st.F,tR:st.R};
}
// A best-power torque curve (Nm vs rpm) so performance reflects the engine's DESIGN potential,
// independent of the live driving state. Every live variable that feeds torque — mixture,
// temps, engine health, battery voltage (spark strength) and any armed nitrous — is set to its
// ideal value here, then fully restored, so 0-100 etc. depend only on the engine + vehicle
// build, never on throttle history, temperature or a drained battery.
// The conditions and mixture the SCORECARD rates peak power at (scoreEngine), so that the LIVE
// tab's MAX POWER button lands on the number the DYNO tab prints.
const DYNO_STD={iat:25,coolant:90,oil:100};
const bestPowerLambda=()=>engine.ci?SMOKE_LAMBDA_CI:0.86;
// LOAD slider value that makes the dyno brake hold this rpm: target = redline - load*(redline - idle).
const loadForRpm=rpm=>clamp((engine.redline-rpm)/Math.max(1,engine.redline-engine.idleRpmEff),0,1);
// Throttle opening that gives manifold fraction f of upstream pressure at this rpm — mapTarget()
// solved backwards.
function throttleForMapFrac(f,rpm){
  const c=THR_K*rpm/1000, F=clamp(f,0.01,0.999), tA=F*c/(1-F+F*c);
  return clamp(Math.pow(Math.max(0,(tA-IDLE_AIR)/(1-IDLE_AIR)),1/1.2),0,1);
}
// Brake specific fuel consumption at a steady operating point, by the same arithmetic the live
// readout uses (updatePhysics), so the ECO point is the one the BSFC tile will agree with.
function steadyBSFC(rpm,map){
  const r=calcAtRpm(rpm,map);
  if(!(r.powerKW>0.5))return {bsfc:Infinity,r};
  const T=effIAT(map,rpm)+273.15, Vd=engine.displacement_L/1000;
  const air=(map*1e5*Vd*(rpm/60)*engine.chargesPerRev*r.ve)/(287*T);
  const fuel=(air/curAFR(rpm,map))/engine.meteringEff*engine.typeBsfc;
  return {bsfc:fuel*3600*1000/r.powerKW,r};
}
function operatingPoint(kind){
  const s=engine.score;
  if(kind==='power')return {rpm:s.peakHPrpm,throttle:1,lambda:bestPowerLambda(),expect:s.peakHP+' hp',
                           tq:s.peakHP*745.7/(s.peakHPrpm*2*Math.PI/60)};
  if(kind==='torque')return {rpm:s.peakTQrpm,throttle:1,lambda:bestPowerLambda(),expect:s.peakTQ+' Nm',tq:s.peakTQ};
  // ECO: the eye of the BSFC map — the speed, load and mixture that burn the least fuel per kWh.
  // Searched rather than asserted, because where it sits depends on the build: friction and
  // pumping losses push it toward high load and modest rpm, knock pulls a boosted engine off WOT.
  const sv={afr:state.afr,iat:state.iat,coolant:state.coolant,oil:state.oil};
  Object.assign(state,DYNO_STD);
  const lams=engine.ci?[1.2,1.4,1.6,1.8,2.0,2.4]:[0.95,1.0,1.05,1.1,1.15,1.2];
  const r0=Math.max(engine.idleRpmEff+300,1200), r1=engine.redline*0.85;
  let best={bsfc:Infinity};
  for(let rpm=r0;rpm<=r1;rpm+=(r1-r0)/14)
    for(const fr of [0.35,0.45,0.55,0.65,0.75,0.85,0.95,1])
      for(const lam of lams){
        state.afr=lam*engine.stoichAFR;
        const map=fr>=1?wotMapAt(rpm):fr;
        const {bsfc,r}=steadyBSFC(rpm,map);
        if(r.knock>KNOCK_TARGET||r.powerHP<0.15*s.peakHP)continue;   // a real point, not a knocking one
        if(bsfc<best.bsfc)best={bsfc,rpm,throttle:fr>=1?1:throttleForMapFrac(fr,rpm),lambda:lam,hp:r.powerHP,tq:r.torque};
      }
  Object.assign(state,sv);
  if(!isFinite(best.bsfc))return {rpm:s.peakTQrpm,throttle:0.5,lambda:engine.ci?1.4:1.0,expect:'—'};
  return {rpm:best.rpm,throttle:best.throttle,lambda:best.lambda,tq:best.tq,
          expect:Math.round(best.bsfc)+' g/kWh at '+Math.round(best.hp)+' hp'};
}
function buildTorqueCurve(){
  const sv={afr:state.afr,coolant:state.coolant,oil:state.oil,engineHealth:state.engineHealth,blown:state.blown,iat:state.iat,systemVoltage:state.systemVoltage,nitrousActive:state.nitrousActive};
  const savedAfrMode=engine.afrMode;engine.afrMode='fixed';   // use the fixed best-power AFR below
  state.coolant=90;state.oil=100;state.engineHealth=1;state.blown=false;state.iat=20;state.systemVoltage=14.0;state.nitrousActive=false;
  state.afr=engine.ci?engine.stoichAFR*SMOKE_LAMBDA_CI:engine.stoichAFR*0.88;
  const pts=[];for(let r=1000;r<=engine.redline;r+=100)pts.push({rpm:r,tq:calcAtRpm(r).torque});
  engine.afrMode=savedAfrMode;
  Object.assign(state,sv);   // restore the exact live state (correct keys — no accidental heal)
  return pts;
}
// Torque over rpm AND boost. Once boost is a state variable with its own history, a 1-D curve in
// rpm cannot describe the engine: at 4000 rpm a turbo might be at 0.1 bar because you just floored
// it, or at full boost because you have been flat for two seconds. The old 1-D curve held only the
// fully-spooled case, so every acceleration run started with the turbo already lit and lag cost
// nothing at all. Built once and bilinearly interpolated, because computeVE now carries two wave
// solves and a nozzle bisection and is far too expensive to call per step.
function buildTorqueGrid(){
  const sv={afr:state.afr,coolant:state.coolant,oil:state.oil,engineHealth:state.engineHealth,
            blown:state.blown,iat:state.iat,systemVoltage:state.systemVoltage,nitrousActive:state.nitrousActive};
  const savedAfrMode=engine.afrMode;engine.afrMode='fixed';
  state.coolant=90;state.oil=100;state.engineHealth=1;state.blown=false;state.iat=20;
  state.systemVoltage=14.0;state.nitrousActive=false;
  state.afr=engine.ci?engine.stoichAFR*SMOKE_LAMBDA_CI:engine.stoichAFR*0.88;
  const rpms=[];for(let r=1000;r<=engine.redline;r+=100)rpms.push(r);
  // Only a turbo needs the boost axis. A supercharger is belt-driven, so its boost follows rpm with
  // no shaft of its own to spin up, and an NA engine has none at all.
  const laggy=engine.intake==='turbo'&&engine.maxBoost>0;
  const boosts=laggy?Array.from({length:9},(_,i)=>engine.maxBoost*i/8):[engine.maxBoost||0];
  const tq=boosts.map(b=>rpms.map(r=>calcAtRpm(r,1+b).torque));
  engine.afrMode=savedAfrMode;Object.assign(state,sv);
  return{rpms,boosts,tq,laggy};
}
// The grid depends only on the engine, and buildEngine makes a new engine.score every time it changes,
// so the 0-100 run and the lap share the one built until then.
let _lapGrid=null,TURBO_ITERS=2;
function lapTorqueGrid(){
  // keyed on the builder too (build 131), so a harness that swaps buildTorqueGrid for a scaled one gets its own
  const fn=window.buildTorqueGrid;
  if(!_lapGrid||_lapGrid.score!==engine.score||_lapGrid.fn!==fn)_lapGrid={score:engine.score,fn,g:fn()};
  return _lapGrid.g;
}
function gridTorque(g,rpm,boost){
  const R=g.rpms,B=g.boosts;
  let i=1;while(i<R.length-1&&rpm>R[i])i++;
  const fr=clamp((rpm-R[i-1])/(R[i]-R[i-1]),0,1);
  if(B.length===1){const row=g.tq[0];return row[i-1]+(row[i]-row[i-1])*fr;}
  let j=1;while(j<B.length-1&&boost>B[j])j++;
  const fb=clamp((boost-B[j-1])/(B[j]-B[j-1]),0,1);
  const lo=g.tq[j-1],hi=g.tq[j];
  const a=lo[i-1]+(lo[i]-lo[i-1])*fr, c=hi[i-1]+(hi[i]-hi[i-1])*fr;
  return a+(c-a)*fb;
}
// Integrate the standing-start acceleration run through the gearbox with a traction-limited
// launch (weight transfer + downforce), aero drag and rolling resistance.
function simulateAccelRun(){
  if(!engine.score)return null;
  // Performance figures are a design-potential number, not "whatever the live bench happens to be
  // doing". buildTorqueGrid already freezes health/AFR/IAT for the torque surface; the shaft
  // integrator also reads state.iat (via effIAT → T01), so pin ambient for the whole run and
  // restore afterwards. Without this, an abused bench (hot intake, low battery…) leaked into
  // 0–100 by a single timestep and failed the independence check.
  const svLive={iat:state.iat,engineHealth:state.engineHealth,blown:state.blown,
                systemVoltage:state.systemVoltage,nitrousActive:state.nitrousActive};
  state.iat=20;state.engineHealth=1;state.blown=false;state.systemVoltage=14.0;state.nitrousActive=false;
  const curve=buildTorqueCurve();
  const tqAt=rpm=>{if(rpm<=curve[0].rpm)return curve[0].tq;for(let i=1;i<curve.length;i++){if(rpm<=curve[i].rpm){const p=curve[i-1],q=curve[i];return p.tq+(q.tq-p.tq)*(rpm-p.rpm)/(q.rpm-p.rpm);}}return curve[curve.length-1].tq;};
  // Torque during the RUN comes off the 2-D grid, because boost is a state with history. The 1-D
  // curve above is still right for the top-speed scan: a car sitting at terminal velocity has been
  // at full throttle a long time and is fully spooled by definition.
  const grid=lapTorqueGrid();   // one per engine, shared with the lap (build 131: each costs a knock search per point)
  const m=vehicle.mass,r=vehicle.rTire,fd=vehicle.finalDrive,eff=vehicle.driveEff,ratios=vehicle.ratios;
  const vGov=(vehicle.governor||0)/3.6;   // m/s, 0 when the limiter is removed
  const idle=engine.idleRpmEff,rl=engine.redline,TWO_PI=Math.PI*2,dt=0.005;
  const gb=vehicle.gb||GEARBOX.manual;
  const shiftTime=gb.shift,tcStall=gb.stall>0?clamp(gb.stall,idle,rl*0.85):0;
  const df=vehicle.df||DIFF.open;
  // Most axle torque the car will ever put down — first gear at peak torque. The diff's usable
  // share is referenced against this, so a launch behaves exactly as before while a tall gear
  // stops being charged the launch penalty.
  const axleTqMax=Math.max(1,curve.reduce((a,p)=>Math.max(a,p.tq),0)*ratios[0]*fd*(gb.mult||1));
  // Build 154: the driven wheels turn at their own speed, and the tyre pushes the car through SLIP. Below the
  // optimum the force rises with slip; past it, it falls to a sliding plateau (sin(C atan(B s)), C 1.4: 0.82 of
  // the peak in a full slide, measured tyres 0.75-0.85), so a wheel that breaks away keeps breaking away. The
  // peak is the traction the hard clip used to be (the tyre, the load, the diff), at a slip of 0.10: dry-asphalt
  // tyres peak at about 10% slip (6-15% measured), and one figure is used for every compound, the per-compound
  // spread not being established. With TRACTION CONTROL the ECU trims the torque to hold that slip, which is what
  // the clip did; without it the driver holds that slip through the launch (build 155, below), and from the first
  // upshift the run is flat out: the engine's torque spins the tyres past the peak and the slip dynamics decide.
  // The launch rpm is the best of several (below).
  const tcOn=vehicle.tc!==false, Iw=vehicle.wheelI||0, Iwd=Iw*(vehicle.drive==='awd'?1:0.5), mv=m+(Iw-Iwd)/(r*r);
  function run(launchRpm){
  let boostNow=grid.laggy?0:engine.maxBoost, shaftE=0;
  // The shaft does not start from rest. A standing start is made with the engine already held at
  // its launch speed on a slipping clutch or a stalled converter, at full throttle — which is what
  // brake-boosting is, and why a turbo car does not leave the line completely flat.
  // Cap the pre-spool at ~1.2 s: long enough for a small frame to light, short enough that a large
  // frame still leaves partially flat. Two full seconds of brake-boost made every frame fully lit
  // and erased the spool ordering from the standing start.
  if(grid.laggy&&engine.shaftJ){
    let E=0,b0=0;
    for(let i=0;i<240;i++){const a=advanceShaft(E,launchRpm,b0,1,0.005);E=a.shaftE;b0=a.boost;}
    shaftE=E;boostNow=b0;
  }
  // The clutch launch (build 106). The engine waits at launchRpm and the clutch passes what the tyres
  // can take, up to its own capacity (CLUTCH_MARGIN x peak torque). Where that is more than the engine
  // makes, the difference comes out of the flywheel, which slows until it meets the gearbox and the
  // clutch locks: the energy a dumped clutch puts into a launch. Until it locks the engine is not
  // coupled, so the car carries only its own and the wheels' inertia.
  const Ie=engine.inertia||0.1, tqCap=CLUTCH_MARGIN*curve.reduce((q,p)=>Math.max(q,p.tq),0);
  let slipping=!tcStall, slipW=launchRpm*TWO_PI/60;
  let v=0,x=0,t=0,gear=0,a=0,shiftT=0,w=0;   // w: the driven wheels' angular speed (rad/s)
  const M={t100:null,q400:null,q800:null,q1000:null,v200:null,gripT:0,lagT:0,spinT:0,launchRpm,shifts:[]},V100=100/3.6,V200=200/3.6;
  for(let step=0;step<48000&&t<150;step++){
    // the gearbox input turns with the driven WHEELS, not with the road: in wheelspin the engine revs with them
    let totalRatio=ratios[gear]*fd,rpm=w*totalRatio*60/TWO_PI;
    // Upshift where the NEXT gear pulls harder at this road speed — the wheel-torque crossover,
    //     tq(rpm)·ratio[g]  <=  tq(rpm·ratio[g+1]/ratio[g])·ratio[g+1]
    // or at the limiter, whichever comes first. This used to be the limiter alone, in every gear of
    // every car, which is the worst possible point for anything whose torque falls away before the
    // redline: a 2.0 TDI held to 4800 rpm ran 13.75 s to 100 against a real 8.6 s, and shifting it at
    // 3800 instead was four seconds quicker on 12 hp LESS. A car with less power cannot be that much
    // quicker; the shift rule was. This is the same rule simulateLap's bestGear already used, so the
    // straight-line run and the lap now drive the car the same way. Read off the steady curve, as a
    // driver's shift light is — not off the momentary boost, which would hold a laggy turbo in gear
    // waiting for torque the next gear would also get.
    if(shiftT<=0&&gear<ratios.length-1&&(rpm>=rl||
       tqAt(clamp(rpm*ratios[gear+1]/ratios[gear],idle,rl))*ratios[gear+1]>=tqAt(clamp(rpm,idle,rl))*ratios[gear])){
      const rpm0=rpm;gear++;shiftT=shiftTime;totalRatio=ratios[gear]*fd;rpm=w*totalRatio*60/TWO_PI;
      M.shifts.push({g:gear-1,v,rpm:rpm0,rpmTo:rpm});}   // where the run changed up (the GEAR RATIOS graph draws them)
    // `rpm` is what the gearbox input wants to turn at this road speed. How the engine couples to
    // it depends on the gearbox:
    //   Torque-converter auto — the impeller stalls up against a slow turbine and MULTIPLIES
    //     torque while the two slip, fading to 1:1 as the turbine catches up and the converter
    //     couples. That multiplication is why an auto launches harder than a manual even though
    //     it loses more of the engine's output to the driveline on the way.
    //   Clutch boxes (manual/sequential/DCT) — from a standstill the clutch slips, holding the
    //     engine at the launch rpm while road speed brings the input up to meet it, then locks.
    //     That's what a real launch does, and it's why a peaky high-revving engine can still
    //     leave the line hard. Slipping only ever costs engine speed, never adds torque.
    // Either way drive force is capped by traction below, so the launch stays grip-limited.
    let engineRpm,tqMult=1;
    if(tcStall){
      if(rpm<tcStall){engineRpm=tcStall;tqMult=1+(gb.mult-1)*(1-rpm/tcStall);}else engineRpm=rpm;
      engineRpm=clamp(engineRpm,idle,rl);
    }else{
      if(slipping&&(gear>0||rpm*TWO_PI/60>=slipW))slipping=false;   // the clutch has locked
      engineRpm=clamp(slipping?slipW*60/TWO_PI:rpm,idle,rl);
    }
    // The rev limiter. In any gear below top the loop above has already upshifted, so the only way
    // to be over the redline here is to be in top gear with nowhere left to go — and then the
    // limiter cuts fuel. Without this the clamp above quietly hands back full redline torque for
    // ever, and the car keeps pulling past the fastest speed its gearing can actually reach.
    const overRev=rpm>rl;
    let driveF=0;
    // mid-shift with the drive cut (a manual or a sequential); a powershift box drives on through it (build 171)
    const cutNow=shiftT>0&&!gb.powershift;
    // Spin the turbo up alongside the car. Off throttle during a shift the exhaust cools and the
    // shaft coasts down, which is why an upshift costs boost and why it costs a big frame more.
    // Throttle floor during the shift is deliberately not zero: a lift to 0.15 dumped so much shaft
    // energy that high-traction cars (which shift earlier and more often) were lag-punished harder
    // than grip-limited ones — AWD on slicks lost to FWD on slicks, which is the wrong ordering.
    // 0.35 still costs boost on a laggy frame without inverting the traction ladder.
    if(grid.laggy){
      const adv=advanceShaft(shaftE,engineRpm,boostNow,cutNow?0.35:1,dt);
      shaftE=adv.shaftE;boostNow=adv.boost;
    }
    const down=0.5*AIR_RHO*vehicle.clA*v*v,Wtot=m*G+down,transfer=m*a*vehicle.cg/vehicle.wb;
    let drivenN;
    if(vehicle.drive==='awd')drivenN=Wtot;
    else if(vehicle.drive==='rwd')drivenN=m*G*(1-vehicle.fWt)+down*vehicle.drivenAero+Math.max(0,transfer);
    else drivenN=m*G*vehicle.fWt+down*vehicle.drivenAero-Math.max(0,transfer);
    if(shiftT>0)shiftT-=dt;
    if(!cutNow&&!overRev){
      const Teng=gridTorque(grid,engineRpm,boostNow)*tqMult;
      if(slipping){
        const want=tyreMuX(drivenN/(vehicle.drive==='awd'?4:2))*diffTractionAt(df,0,vehicle.cg,1)*Math.max(0,drivenN)*r/(totalRatio*eff);
        const Tcl=Math.min(tqCap,Math.max(Teng,want));
        slipW=Math.max(rpm*TWO_PI/60,slipW+(Teng-Tcl)/Ie*dt);       // the flywheel pays the difference
        driveF=Tcl*totalRatio*eff/r;
      }else driveF=Teng*totalRatio*eff/r;
    }
    // The differential decides how much of the driven axle's grip is actually usable: an open
    // diff is governed by the lighter-loaded wheel and throws the rest away, an LSD recovers
    // most of it, a spool all of it. This only bites while the car is traction-limited.
    const tqFrac=(driveF*r)/axleTqMax;                       // how hard the axle is being driven
    const trac=tyreMuX(drivenN/(vehicle.drive==='awd'?4:2))*diffTractionAt(df,0,vehicle.cg,tqFrac)*Math.max(0,drivenN);
    const drag=0.5*AIR_RHO*vehicle.cdA*v*v,roll=v>0.2?crrAt(vehicle.crr,v)*m*G:0,res=drag+roll;
    // A road-speed governor cuts fuel at its set speed: past it the engine gives only what holds it.
    if(vGov>0&&v>=vGov)driveF=Math.min(driveF,res);
    // Spinning parts (build 106), now on their own equation (build 154). The driven wheels, and the engine
    // through the gearing when the clutch is locked and the converter past stall, are turned by the drive
    // torque and held back by the tyre: Id dw/dt = T - F r. The car, with the undriven wheels' inertia,
    // is pushed by the tyre: mv dv/dt = F - R. Below the slip optimum the two run together and this is
    // the old a = (F - R)/mE; past it the surplus torque spins the wheels and the engine with them.
    // (mid-shift on a powershift box the oncoming clutch is slipping: it passes the engine's torque but not its
    // flywheel, whose speed it is pulling down to the new gear's)
    const coupled=shiftT<=0&&!slipping&&!(tcStall&&rpm<tcStall);
    const Id=Iwd+(coupled?Ie*totalRatio*totalRatio*eff:0),Tw=driveF*r,NS=10,h=dt/NS;
    // Build 155: without traction control the DRIVER holds the slip through the launch, in first gear, with the
    // clutch and the throttle: the optimum is flat (8-12% slip within 0.5% of the time), so a driver feeling for
    // it finds it. From the first upshift the run is flat out and a car with the power for it spins in second.
    const holdSlip=tcOn||gear===0;
    let Fs=0,tcCut=false,sMax=0;
    for(let k=0;k<NS;k++){
      // The tyre is stiff against the wheel's inertia at low speed (a time constant under a millisecond at
      // walking pace), so the wheel is stepped implicitly on the force linearised in slip: stable at any step.
      const vf=Math.max(v,1),s0=(w*r-v)/vf,F0=trac*tyreSlipMu(s0),dF=trac*tyreSlipMuD(s0)*r/vf;
      let w1=(w+h/Id*(Tw-r*F0+r*dF*w))/(1+h/Id*r*dF);
      if(holdSlip){const wMax=(v+TYRE_SLIP_OPT*vf)/r;if(w1>wMax){w1=wMax;tcCut=true;}}   // the ECU, or the driver's foot, trims the torque
      w=Math.max(0,w1);
      const s1=(w*r-v)/vf,F=trac*tyreSlipMu(s1);sMax=Math.max(sMax,s1);
      v=Math.max(0,v+(F-res)/mv*h);Fs+=F;
    }
    a=(Fs/NS-res)/mv;
    const limited=tcCut||sMax>=TYRE_SLIP_OPT*0.98;
    if(!M.t100){if(limited)M.gripT+=dt;if(sMax>1.5*TYRE_SLIP_OPT)M.spinT+=dt;
      if(shiftT<=0&&grid.laggy&&boostNow<0.9*boostTarget(engineRpm))M.lagT+=dt;}
    x+=v*dt;t+=dt;
    if(!M.t100&&v>=V100)M.t100=t;
    if(!M.q400&&x>=400)M.q400={t,v};
    if(!M.q800&&x>=800)M.q800={t,v};
    if(!M.q1000&&x>=1000)M.q1000={t,v};
    if(!M.v200&&v>=V200)M.v200={t,x};
    if(x>=1000&&(M.v200||a<0.03))break;   // have the marks and either hit 200 or can't
  }
  return M;
  }
  // The launch rpm, the best of several tries, as a magazine's figure is (and as a launch control is set):
  // launched at five speeds from just off idle to three quarters of the limiter, the quickest to 100 km/h is
  // the car's time. (Build 155: this was the driver's only, without traction control; a car with it was run at
  // 55% of the limiter, which left an R34 0.13 s.) A converter launches at its stall speed.
  const lDef=clamp(rl*0.55,idle+400,rl*0.72);
  let M=run(lDef);
  if(!tcStall){
    const key=R=>R.t100||(R.q400?R.q400.t+100:1e9);
    for(const f of [0.30,0.42,0.65,0.75]){const R=run(clamp(rl*f,idle+300,rl*0.8));if(key(R)<key(M))M=R;}
  }
  // Top speed: the fastest the car can actually hold — the best any gear manages, not just top
  // gear. For each gear, scan DOWN from its limiter speed and take the highest speed where drive
  // force still beats drag+roll. Two reasons it works this way: scanning up from a crawl would
  // stop at the low-speed torque hole a peaky engine has in a tall gear (and the car never pulls
  // top gear from walking pace — it gets there through the lower gears), and a peaky or
  // over-geared car genuinely reaches its top speed one gear down, on the cam, rather than
  // bogging in top.
  let vTop=0;
  for(const gr of ratios){
    const tot=gr*fd,vLim=rl*TWO_PI*r/60/tot;
    for(let vv=Math.min(vLim,160);vv>vTop;vv-=0.5){
      const rpm=clamp(vv*tot/r*60/TWO_PI,idle,rl);
      const F=tqAt(rpm)*tot*eff/r,drag=0.5*AIR_RHO*vehicle.cdA*vv*vv;
      if(F>drag+crrAt(vehicle.crr,vv)*m*G){vTop=vv;break;}
    }
  }
  const vRedline=rl*TWO_PI*r/60/(ratios[ratios.length-1]*fd);
  const vFree=vTop||vRedline;
  // The governor caps what the car could otherwise hold; it cannot add speed the car does not have.
  const governed=vGov>0&&vFree>vGov, topSpeed=(governed?vGov:vFree)*3.6;
  Object.assign(state,svLive);
  // gripT / lagT: seconds of the 0-100 spent traction-limited, and on throttle below 90% of target
  // boost — WHY a car takes the time it takes, so a claim about what limits it can be checked.
  return {t100:M.t100,q400:M.q400,q800:M.q800,q1000:M.q1000,topSpeed,governed,freeSpeed:vFree*3.6,mass:m,ptw:vehicle.powerToWeight,
    gripT:M.gripT,lagT:M.lagT,spinT:M.spinT,launchRpm:M.launchRpm,shifts:M.shifts.map(x=>({g:x.g,v:x.v,rpm:x.rpm,rpmTo:x.rpmTo})),
    t200:M.v200?M.v200.t:null,x200:M.v200?M.v200.x:null};
}
