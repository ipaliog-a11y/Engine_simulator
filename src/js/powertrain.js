// ====== POWERTRAIN: what drives the wheels, as the vehicle, the lap and the race see it (build 177) ======
// The 0-100 run, the lap, the race and the GEAR RATIOS window used to reach into the engine wherever they needed
// something: engine.redline here, engine.score there, a turbo's shaft, the fuel map, a block of overrun torque
// built inline in the lap. That is fine while there is only one kind of engine; an electric drive (step 2 of
// plans/hybrid-electric/) has no boost, no fuel and no overrun map, and would have had to be threaded through
// every one of those places. So every reach from the vehicle side now goes through powertrain(), and the
// combustion engine is its one implementation.
//
// Nothing here computes anything new. Each member is the expression its callers used to write inline, moved
// here unchanged, so every 0-100, lap and race is bit-for-bit what it was (checked with tools/fingerprint.mjs
// against build 176). Members read the engine when called, never when defined, so a rebuilt engine, or a test
// that swaps buildTorqueGrid or buildTorqueCurve, is seen exactly as before.
const COMBUSTION={
  kind:'combustion',
  // Built and rated. buildEngine makes a new score every time the engine changes, so the score is also the
  // identity a cache is keyed on: {peakHP, peakHPrpm, peakTQ, peakTQrpm, …}.
  ready:()=>!!engine.score,
  rating:()=>engine.score,
  // The speeds the vehicle may run it between (rpm), its own inertia (kg m², before the clutch), installed mass (kg).
  idleRpm:()=>engine.idleRpmEff,
  maxRpm:()=>engine.redline,
  inertia:()=>engine.inertia,
  mass:()=>engineMass(),
  // Torque at the design conditions: the steady full-load curve [{rpm,tq}], and the rpm × boost surface the
  // runs integrate on (gridTorque reads it; grid.laggy marks a boost axis).
  torqueCurve:()=>buildTorqueCurve(),
  torqueGrid:()=>lapTorqueGrid(),
  // Boost with history: a turbo's shaft, spun up by the exhaust and bled off on a lift (advanceShaft).
  maxBoost:()=>engine.maxBoost,
  hasShaft:()=>engine.intake==='turbo'&&engine.maxBoost>0&&engine.shaftJ,
  advanceShaft:(shaftE,rpm,boost,throttle,dt,hMax)=>advanceShaft(shaftE,rpm,boost,throttle,dt,hMax),
  boostTarget:rpm=>boostTarget(rpm),
  boostAvail:rpm=>boostAvail(rpm),
  // Overrun: the engine's own braking torque (Nm, positive) against a closed throttle with the fuel cut, from 500
  // rpm to past maxRpm in 250 rpm steps (brakeTorqueRaw, the same engine the dyno runs). The lap's engine braking.
  overrunTable(rl){
    const ovTab=[];
    const sv={coolant:state.coolant,oil:state.oil,engineHealth:state.engineHealth,systemVoltage:state.systemVoltage,nitrousActive:state.nitrousActive};
    state.coolant=90;state.oil=100;state.engineHealth=1;state.systemVoltage=14.0;state.nitrousActive=false;
    for(let r=500;r<=rl+250;r+=250){
      const mc=engine.ci?1:clamp(IDLE_AIR/(IDLE_AIR+THR_K*(r/1000)*(1-IDLE_AIR)),0.12,1);   // a closed throttle (mapTarget's law); no plate on a diesel
      ovTab.push(Math.max(0,-brakeTorqueRaw(r,mc,true)));
    }
    Object.assign(state,sv);
    return ovTab;
  },
  // What it carries and burns. fuel(): the FUELS entry (density, label). fuelRate(nom,n): from a solved lap
  // (nom, its replay of rpm, manifold pressure and power), a function that gives a lap's fuel flow (g/s) at each
  // of its n points.
  fuel:()=>FUELS[engine.fuel]||FUELS.gasoline,
  fuelRate(nom,n){
    // BSFC (g/kWh) over rpm × MAP, from the engine's own map at design conditions, so the race loop never
    // calls engine code. Fuel flow at a point is then the power the lap spends there times the BSFC.
    const iat0=state.iat;state.iat=20;
    let mapLo=1e9,mapHi=0;for(const q of nom.replay.map){mapLo=Math.min(mapLo,q);mapHi=Math.max(mapHi,q);}
    mapLo=Math.max(0.2,mapLo*0.95);mapHi=Math.max(mapLo+0.1,mapHi*1.02);
    const NR=16,NM=10,r0=engine.idleRpmEff,r1=engine.redline,bs=new Float64Array(NR*NM);
    for(let a=0;a<NR;a++)for(let b=0;b<NM;b++){
      const x=steadyBSFC(r0+(r1-r0)*a/(NR-1),mapLo+(mapHi-mapLo)*b/(NM-1)).bsfc;
      bs[a*NM+b]=clamp(isFinite(x)?x:900,150,900);
    }
    state.iat=iat0;
    const bsfcAt=(rpm,map)=>{
      const x=clamp((rpm-r0)/(r1-r0),0,1)*(NR-1),y=clamp((map-mapLo)/(mapHi-mapLo),0,1)*(NM-1);
      const a=Math.min(NR-2,Math.floor(x)),b=Math.min(NM-2,Math.floor(y)),fx=x-a,fy=y-b;
      return (bs[a*NM+b]*(1-fx)+bs[(a+1)*NM+b]*fx)*(1-fy)+(bs[a*NM+b+1]*(1-fx)+bs[(a+1)*NM+b+1]*fx)*fy;
    };
    // Off the power the injectors cut and only idle flows; a carburettor cannot cut, and keeps feeding.
    const carb=!(INTAKE_SYS[engine.intakeSys]||INTAKE_SYS.efi).di&&/^carb|sidedraft/.test(engine.intakeSys);
    const idleGs=0.12*engine.displacement_L*(carb?2.5:1);
    return L=>{const R=L.replay,out=new Float32Array(n);
      for(let i=0;i<n;i++)out[i]=R.pwr[i]>0?R.pwr[i]*bsfcAt(R.rpm[i],R.map[i])/3.6e6+idleGs*0.3:idleGs;
      return out;};
  }
};
// The electric drive (builds 179-180): built and rated on the bench (src/js/electric-ui.js), driven on the road through
// one reduction (src/js/electric-car.js). Its torque is the rated curve (the pack at half charge, magnets at 60 C), with
// no boost axis and no shaft; its overrun is regeneration; it has no fuel, and the race (2.4) is not yet its.
const ELECTRIC={
  kind:'electric',
  ready:()=>!!engine.score,
  rating:()=>engine.score,
  idleRpm:()=>0,
  maxRpm:()=>engine.redline,
  inertia:()=>engine.inertia,
  mass:()=>Math.round(engine.motor.mass+engine.pack.mass),
  torqueCurve:()=>evCurve(engine),
  torqueGrid:()=>evGrid(engine),
  maxBoost:()=>0,
  hasShaft:()=>false,
  boostTarget:()=>0,
  boostAvail:()=>0,
  overrunTable:rl=>evRegenTable(engine,rl)
};
// A combustion engine with a hybrid system (build 186, src/js/hybrid.js): the engine's own powertrain with a P2 motor's
// torque added at every engine speed (cut by the charge-sustaining controller's share, hybDeployShare), its regeneration
// added to the overrun, its motor and pack added to the mass, and the fuel burnt only for the engine's share of the power.
const HYBRID=Object.assign({},COMBUSTION,{
  kind:'hybrid',
  mass:()=>engineMass()+engine.hy.mass,
  torqueCurve:()=>{const c=hybCurves(),k=hybDeployShare;return c.eng.map((p,i)=>({rpm:p.rpm,tq:p.tq+k*c.mot[i]}));},
  torqueGrid:()=>{const g=lapTorqueGrid(),k=hybDeployShare,mt=g.rpms.map(r=>k*hybMotorAt(r));
    return Object.assign({},g,{tq:g.tq.map(row=>row.map((t,i)=>t+mt[i]))});},
  overrunTable(rl){const a=COMBUSTION.overrunTable(rl),b=hybRegenTable(rl);return a.map((t,i)=>t+(b[i]||0));},
  fuelRate(nom,n){
    const base=COMBUSTION.fuelRate(nom,n);
    // the replay's power is the engine's and the motor's: the fuel map is read with the engine's alone
    return L=>{if(!L.hy)return base(L);const R=L.replay,orig=R.pwr;
      R.pwr=orig.map((p,i)=>p>0?Math.max(0,p-Math.max(0,L.hy.pm[i])):p);
      try{return base(L);}finally{R.pwr=orig;}};
  }
});
// A power-split hybrid (build 189, src/js/power-split.js): the vehicle's shaft is MG2's, geared to the wheels through one
// reduction as an electric car's motor is, and the engine reaches it through the planetary at whatever speed MG1 holds
// it: no clutch, no gears, no boost axis (the eCVT's curve is a steady one). Its overrun is MG2's regeneration (the
// engine stops), and the fuel is burnt on the engine's best line for its share of the power.
const POWERSPLIT=Object.assign({},HYBRID,{
  direct:true,
  idleRpm:()=>0,
  maxRpm:()=>engine.hy.motor.nMax,
  inertia:()=>engine.hy.motor.J,
  torqueGrid:()=>{const c=POWERSPLIT.torqueCurve();return {rpms:c.map(p=>p.rpm),boosts:[0],tq:[c.map(p=>p.tq)],laggy:false};},
  maxBoost:()=>0,
  hasShaft:()=>false,
  boostTarget:()=>0,
  boostAvail:()=>0,
  overrunTable:rl=>hybRegenTable(rl),
  fuelRate:()=>psFuelRate()
});
// The powertrain of the car being built: the engine's type chooses it (a saved build without one is combustion).
function powertrain(){return isElectric()?ELECTRIC:isHybrid()?(engine.hy.mode==='ps'||engine.hy.mode==='series'?POWERSPLIT:HYBRID):COMBUSTION;}   // a series hybrid drives as a power-split does (build 193)
