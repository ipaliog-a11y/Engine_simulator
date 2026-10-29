// ====== HYBRID: an engine with a motor and a battery (build 186, step 3.1 of plans/hybrid-electric/) ======
// Decision 12: HYBRID is a field on every combustion engine, not an engine type. NONE is exactly the engine it was;
// PARALLEL (P2) puts an electric motor on the gearbox's input shaft, between the engine's clutch and the gearbox
// (the Hyundai Ioniq's, the BMW 330e's, the Porsche Cayenne E-Hybrid's arrangement), with a small pack of hybrid
// cells. The motor and the pack are the electric drive's own (src/js/electric.js), designed in the same MOTOR,
// INVERTER and BATTERY fields an electric car uses.
//
// What a P2 motor does, from where it sits:
//   it turns at engine speed, so its torque adds to the engine's at every rpm and goes through every gear: the
//   0-100, the lap and the race read the sum (HYBRID in src/js/powertrain.js), cut to what the pack can give;
//   lifting off and braking, it brakes the car as a generator, added to the engine's own overrun, as an electric
//   car's regeneration is (build 180);
//   charge-sustaining (decision 13): over a lap the pack must take back at least what it gave. The controller lets
//   the engine do everything it can and the motor give only what the engine cannot (the most efficient use of a
//   small pack), and where a lap would still spend more than braking returns, the deploy is cut to the share that
//   balances (hybridLap). The race burns fuel for the engine's share of the power only.
const HYBRID_MODES={none:{label:'NONE'},p2:{label:'PARALLEL (P2)'}};
// DEPLOY: how the controller uses the motor at full throttle. FULL gives everything the motor and pack can. ECO is an
// efficiency-first calibration (the Ioniq's): the motor only fills the engine's curve up to its peak torque, so it helps
// off the line and low in the revs and adds nothing at speed, where the pack's energy is spent least well. Hyundai's
// own figures say 104 kW together; MotorWeek's instrumented run (0-60 mph 9.6 s, a 17.4 s quarter mile at 81 mph) is
// the engine's alone at the top end, which is what ECO gives.
const HYBRID_DEPLOY={full:{label:'FULL'},eco:{label:'ECO (TORQUE FILL)'}};
// A hybrid's motor and pack when HYBRID is first chosen: a pancake motor in the bellhousing (200 mm across, 40 mm long,
// 12 poles) and a 1.56 kWh pack of hybrid cells, the size of the Ioniq Hybrid's 32 kW / 170 Nm system.
const HYB_DEFAULT={evMotorType:'pm',evRotorD:200,evStack:40,evPoles:12,evTurns:28,evMagnet:'ndfeb',evRetention:'bridges',evCooling:'jacket',
  evMaxRpm:8000,evInverter:'igbt',evAmps:400,evRearCount:1,evFront:'none',evChem:'liHEV',evSeries:64,evKWh:1.56,evYear:2016};
const HYB_SOC=0.6;   // a charge-sustaining hybrid holds its pack about here, with room above it to take back braking
const isHybrid=()=>!!engine&&engine.type!=='electric'&&!!engine.hy;
// Build the hybrid system of a combustion engine from its form fields (the electric drive's), or none.
function buildHybrid(e){
  if(!e.hyMode||e.hyMode==='none'){delete e.hy;return null;}
  const motor=motorBuild({type:e.evMotorType,rotorD:e.evRotorD,stackL:e.evStack,poles:e.evPoles,turns:e.evTurns,magnet:e.evMagnet,
    retention:e.evRetention,cooling:e.evCooling,inverter:e.evInverter,invAmps:e.evAmps,maxRpm:e.evMaxRpm});
  const pack=packBuild({chem:e.evChem,series:e.evSeries,kWh:e.evKWh,year:e.evYear});
  e.hy={mode:e.hyMode,motor,pack,mass:Math.round(motor.mass+pack.mass),cost:motor.cost+pack.cost};
  return e.hy;
}
// The motor's torque at an engine speed (Nm): its envelope at the pack's charge-sustaining voltage, magnets at 60 C,
// cut to what the pack gives there (the electric car's own law), and to nothing past the motor's top speed.
function hybMotorTq(hy,rpm){
  if(rpm>hy.motor.nMax)return 0;
  const V=packOcv(hy.pack,HYB_SOC),tc=hy.motor.cool.tCool,cool={w:tc,c:tc,r:60};
  const Pb=packMaxPower(hy.pack,HYB_SOC);
  return driveTorqueRated(hy,Math.max(rpm,1),V,cool,Pb);
}
// The deploy share the charge-sustaining controller allows (1 = all the motor gives); hybridLap sets it for a lap.
let hybDeployShare=1;
// The engine's full-load curve and the motor's, on the engine curve's rpm points, cached per engine build.
function hybCurves(){
  const e=engine,hy=e.hy;
  if(hy._c&&hy._c.score===e.score)return hy._c;
  const eng=buildTorqueCurve(),full=eng.map(p=>hybMotorTq(hy,p.rpm));
  const pk=Math.max(...eng.map(p=>p.tq));
  const mot=e.hyDeploy==='eco'?full.map((t,i)=>Math.min(t,Math.max(0,pk-eng[i].tq))):full;
  hy._c={score:e.score,eng,mot,full};
  return hy._c;
}
const hybMotorAt=rpm=>{const c=hybCurves(),R=c.eng;
  if(rpm<=R[0].rpm)return c.mot[0];
  for(let i=1;i<R.length;i++)if(rpm<=R[i].rpm)return c.mot[i-1]+(c.mot[i]-c.mot[i-1])*(rpm-R[i-1].rpm)/(R[i].rpm-R[i-1].rpm);
  return c.mot[c.mot.length-1];};
// The motor's regeneration on the engine's overrun table (Nm, 500 rpm up in 250s): the electric car's law.
const hybRegenTable=rl=>evRegenTable(engine.hy,rl);
// A solved lap in the hybrid's terms: per point the motor's power (W: + deploying, the part of the lap's power the
// engine's full load could not give; - regenerating, its share of the overrun), and the pack's energy over the lap.
function hybLapEnergy(L){
  const hy=engine.hy,R=L.replay,n=R.rpm.length,c=hybCurves(),V=packOcv(hy.pack,HYB_SOC),tc=hy.motor.cool.tCool,temp={w:tc+20,c:tc+15,r:60};
  const v=L.v,p=L.track.line,m=vehicle.mass,rl=engine.redline,regen=hybRegenTable(rl),ov=COMBUSTION.overrunTable(rl);
  const engAt=rpm=>{const R0=c.eng;if(rpm<=R0[0].rpm)return R0[0].tq;for(let i=1;i<R0.length;i++)if(rpm<=R0[i].rpm)return R0[i-1].tq+(R0[i].tq-R0[i-1].tq)*(rpm-R0[i-1].rpm)/(R0[i].rpm-R0[i-1].rpm);return R0[R0.length-1].tq;};
  const pm=new Float32Array(n);let deployJ=0,regenJ=0;
  for(let i=0;i<n;i++){
    const j=(i+1)%n,dt=p[i].ds3/Math.max(2,(v[i]+v[j])/2),rpm=R.rpm[i],w=rpm*Math.PI/30;
    if(R.pwr[i]>0){
      const Pm=Math.max(0,R.pwr[i]-engAt(rpm)*w);
      if(Pm>0){const T=Pm/Math.max(1,w);pm[i]=Pm;deployJ+=(Pm+motorLosses(hy.motor,T,Math.max(rpm,1),V,temp).total)*dt;}
    }else if(R.eb&&R.eb[i]>0&&rpm>=500){
      const k=Math.min(regen.length-1,Math.floor((rpm-500)/250)),Tr=regen[k],To=ov[Math.min(ov.length-1,k)]||0;
      const share=Tr/Math.max(1e-6,Tr+To),P=R.eb[i]*m*v[i]*share*(vehicle.driveEff||0.9);   // at the shaft, through the driveline
      const T=P/Math.max(1,w),Pb=Math.max(0,P-motorLosses(hy.motor,T,Math.max(rpm,1),V,temp).total);
      pm[i]=-P;regenJ+=Pb*dt;
    }
  }
  return {pm,deployKJ:deployJ/1000,regenKJ:regenJ/1000};
}
// A lap on a charge-sustaining hybrid: solved with the motor at full deploy; if it spends more of the pack than
// braking returns, solved again with the deploy cut in proportion, until it balances (two rounds settle it).
function hybridLap(key,opts){
  if(opts&&opts.quick)return simulateLapRun(key,opts);   // the racing line's quick laps: full deploy, no replay to balance
  // each round scales the share by what came back over what went out, a hair under, so it settles from the safe side
  let k=1,used=1,L=null,E=null;
  try{
    for(let it=0;it<6;it++){
      used=k;hybDeployShare=k;L=simulateLapRun(key,opts);if(!L)return null;E=hybLapEnergy(L);
      if(E.deployKJ<=E.regenKJ||E.deployKJ<1e-6)break;
      k=clamp(k*E.regenKJ/E.deployKJ*0.995,0,1);
    }
  }finally{hybDeployShare=1;}
  L.hy={share:used,pm:E.pm,deployKJ:E.deployKJ,regenKJ:E.regenKJ};
  return L;
}
// The design summary's line for a hybrid.
function hybSummaryLine(e){
  const hy=e.hy;if(!hy)return '';
  const c=hybCurves();let sys=0,sysR=0,tq=0;
  c.eng.forEach((p,i)=>{const t=p.tq+c.mot[i],P=t*p.rpm*Math.PI/30;if(P>sys){sys=P;sysR=p.rpm;}tq=Math.max(tq,t);});
  return '<br><b>'+tr('HYBRID')+'</b> '+tr(HYBRID_MODES[hy.mode].label)+', '+tr((HYBRID_DEPLOY[e.hyDeploy]||HYBRID_DEPLOY.full).label)+' • '+tr('motor')+' <b>'+Math.round(Math.max(...c.full))+' Nm</b> • '+
    tr('pack')+' '+hy.pack.kWh+' kWh '+tr(hy.pack.chem.label)+' • +'+hy.mass+' kg • '+tr('system')+' <b>'+Math.round(sys/1000)+' kW</b> '+tr('at')+' '+sysR+' rpm, <b>'+Math.round(tq)+' Nm</b>';
}
