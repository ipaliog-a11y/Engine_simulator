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
const HYBRID_MODES={none:{label:'NONE'},p2:{label:'PARALLEL (P2)'},ps:{label:'POWER-SPLIT (eCVT)'},series:{label:'SERIES'}};   // power-split: build 189, src/js/power-split.js; series: build 193
// DEPLOY: how the controller uses the motor at full throttle. FULL gives everything the motor and pack can. ECO is an
// efficiency-first calibration (the Ioniq's): the motor only fills the engine's curve up to its peak torque, so it helps
// off the line and low in the revs and adds nothing at speed, where the pack's energy is spent least well. Hyundai's
// own figures say 104 kW together; MotorWeek's instrumented run (0-60 mph 9.6 s, a 17.4 s quarter mile at 81 mph) is
// the engine's alone at the top end, which is what ECO gives.
// Build 192 (3.6c) widens DEPLOY into ASSIST, the first field of the HYBRID TUNE: ABOVE gives the motor's help only from
// ASSIST RPM up (a top-end boost), BELOW only up to it (a launch and low-revs helper). On a power-split it is always FULL.
const HYBRID_DEPLOY={full:{label:'FULL'},eco:{label:'ECO (TORQUE FILL)'},above:{label:'ABOVE RPM'},below:{label:'BELOW RPM'}};
// ---- the HYBRID TUNE (build 192, step 3.6c; decision 16) ----
// The calibration a hybrid's engineer sets, saved with the build and read wherever the hybrid runs: the 0-100, the lap and
// the race (the motor's curve, its regeneration), the WLTP cycle's energy manager and the LIVE bench's controller.
//   rpm      ASSIST RPM, for ABOVE and BELOW (engine rpm on a P2);
//   map      the ASSIST MAP: the share (0-100%) of the motor's help the controller gives, over the shaft's speed (0, 25,
//            50, 75 and 100% of its top) and the pedal (25, 50, 75, 100%); flat out reads the 100% row. It shapes the
//            motor helping the engine, not the motor driving alone;
//   regen    REGENERATION: OFF, LOW (half the motor's and pack's limit), HIGH (all of it);
//   lps      LOAD-POINT SHIFTING: the engine working harder to charge the pack while it drives (off: only braking and a
//            pack under its low charge are charged from);
//   evKmh    EV UP TO: the highest road speed the energy manager drives on the motor alone (0: no limit);
//   evKw     EV POWER: the most it asks of the motor alone before starting the engine (0: the controller's own rule);
//   socLo, socT, socHi   the CHARGE window (%): the engine starts under the low, the controller holds the target, the
//            pack takes no more charge over the high.
// The defaults are the controller of builds 186-191, so a build without a tune drives exactly as it did.
const HYB_TUNE_DEFAULT={rpm:4000,map:Array(20).fill(100),regen:'high',lps:true,evKmh:0,evKw:0,socLo:35,socT:60,socHi:85};
const HYB_REGEN={off:{label:'OFF',k:0},low:{label:'LOW',k:0.5},high:{label:'HIGH',k:1}};
const HYB_MAP_N=[0,0.25,0.5,0.75,1],HYB_MAP_P=[0.25,0.5,0.75,1];
function hybTune(e){
  const t=Object.assign({},HYB_TUNE_DEFAULT,(e||engine).hyTune||{});
  if(!Array.isArray(t.map)||t.map.length!==20)t.map=HYB_TUNE_DEFAULT.map.slice();
  t.flat=t.map.every(v=>v===100);   // all 100%: the share is exactly 1, so an untuned build is bit-for-bit what it was
  return t;
}
// The assist map's share (0..1) at a fraction of the shaft's top speed and a pedal fraction: straight between its cells,
// held below the first pedal row.
function hybAssistShare(nf,pedal,t){
  t=t||hybTune();if(t.flat)return 1;const m=t.map;
  const x=clamp(nf,0,1)*4,i=Math.min(3,Math.floor(x)),fx=x-i;
  const y=(clamp(pedal,0.25,1)-0.25)/0.25,j=Math.min(2,Math.floor(y)),fy=y-j;
  const at=(a,b)=>m[b*5+a]/100;
  return (at(i,j)*(1-fx)+at(i+1,j)*fx)*(1-fy)+(at(i,j+1)*(1-fx)+at(i+1,j+1)*fx)*fy;
}
// ASSIST's window at an engine speed (a P2's ABOVE and BELOW): 1 inside it, 0 outside.
const hybAssistWindow=(e,rpm)=>{const t=hybTune(e);return e.hyDeploy==='above'?(rpm>=t.rpm?1:0):e.hyDeploy==='below'?(rpm<=t.rpm?1:0):1;};
// A hybrid's motor and pack when HYBRID is first chosen: a pancake motor in the bellhousing (200 mm across, 40 mm long,
// 12 poles) and a 1.56 kWh pack of hybrid cells, the size of the Ioniq Hybrid's 32 kW / 170 Nm system.
const HYB_DEFAULT={evMotorType:'pm',evRotorD:200,evStack:40,evPoles:12,evTurns:28,evMagnet:'ndfeb',evRetention:'bridges',evCooling:'jacket',
  evMaxRpm:8000,evInverter:'igbt',evAmps:400,evRearCount:1,evFront:'none',evChem:'liHEV',evSeries:64,evKWh:1.56,evYear:2016};
// A power-split's when it is first chosen (build 189): the 4th-generation Prius's MG2 (53 kW and 163 Nm on the 600 V bus,
// 17,000 rpm) and its 1.31 kWh nickel-metal hydride pack of 168 cells (201.6 V).
const HYB_DEFAULT_PS={evMotorType:'pm',evRotorD:150,evStack:60,evPoles:8,evTurns:100,evMagnet:'ndfeb',evRetention:'bridges',evCooling:'jacket',
  evMaxRpm:17000,evInverter:'igbt',evAmps:100,evRearCount:1,evFront:'none',evChem:'nimhHEV',evSeries:168,evKWh:1.31,evYear:2016};
// A series hybrid's when it is first chosen (build 193): the Nissan Qashqai e-POWER's traction motor (140 kW, 330 Nm) and
// its 2.1 kWh pack of hybrid cells.
const HYB_DEFAULT_SERIES={evMotorType:'pm',evRotorD:160,evStack:100,evPoles:8,evTurns:26,evMagnet:'ndfeb',evRetention:'bridges',evCooling:'jacket',
  evMaxRpm:14000,evInverter:'igbt',evAmps:450,evRearCount:1,evFront:'none',evChem:'liHEV',evSeries:96,evKWh:2.1,evYear:2021};
const HYB_SOC=0.6;   // a charge-sustaining hybrid holds its pack about here, with room above it to take back braking
const isHybrid=()=>!!engine&&engine.type!=='electric'&&!!engine.hy;
// Build the hybrid system of a combustion engine from its form fields (the electric drive's), or none.
function buildHybrid(e){
  if(!e.hyMode||e.hyMode==='none'){delete e.hy;return null;}
  const motor=motorBuild({type:e.evMotorType,rotorD:e.evRotorD,stackL:e.evStack,poles:e.evPoles,turns:e.evTurns,magnet:e.evMagnet,
    retention:e.evRetention,cooling:e.evCooling,inverter:e.evInverter,invAmps:e.evAmps,maxRpm:e.evMaxRpm});
  const pack=packBuild({chem:e.evChem,series:e.evSeries,kWh:e.evKWh,year:e.evYear});
  e.hy={mode:e.hyMode,motor,pack,mass:Math.round(motor.mass+pack.mass),cost:motor.cost+pack.cost};
  if(e.hyMode==='ps'){   // the eCVT: MG1 sized to the engine, and the planetary set (~12 kg) in place of a gearbox
    const mg1=psMg1Build(e,motor);e.hy.mg1=mg1;e.hy.mass=Math.round(motor.mass+mg1.mass+pack.mass+12);e.hy.cost+=mg1.cost+600;
  }
  if(e.hyMode==='series'){   // the generator on the crank, sized to the engine (build 193); one reduction, no gearbox (~8 kg)
    const gen=seriesGenBuild(e,motor,packOcv(pack,HYB_SOC));e.hy.mg1=gen;e.hy.mass=Math.round(motor.mass+gen.mass+pack.mass+8);e.hy.cost+=gen.cost+300;
  }
  return e.hy;
}
// The motor's torque at an engine speed (Nm): its envelope at the pack's charge-sustaining voltage, magnets at 60 C,
// cut to what the pack gives there (the electric car's own law), and to nothing past the motor's top speed.
// The bus the motors run on: the pack's own voltage, or a power-split's boost converter's.
const hybBusV=hy=>hy.mode==='ps'?PS.busV:packOcv(hy.pack,HYB_SOC);
function hybMotorTq(hy,rpm){
  if(rpm>hy.motor.nMax)return 0;
  const V=hybBusV(hy),tc=hy.motor.cool.tCool,cool={w:tc,c:tc,r:60};
  const Pb=packMaxPower(hy.pack,HYB_SOC);
  return driveTorqueRated(hy,Math.max(rpm,1),V,cool,Pb);
}
// The deploy share the charge-sustaining controller allows (1 = all the motor gives); hybridLap sets it for a lap.
let hybDeployShare=1;
// The engine's full-load curve and the motor's, on the engine curve's rpm points, cached per engine build.
function hybCurves(){
  const e=engine,hy=e.hy;
  if(hy._c&&hy._c.score===e.score)return hy._c;
  const t=hybTune(e);
  if(hy.mode==='ps'||hy.mode==='series'){   // on MG2's (the traction motor's) speed (builds 189, 193); the assist map's flat-out row on top (192)
    hy._c=Object.assign({score:e.score},psCurves());const R=hy._c.eng,nMax=hy.motor.nMax;
    hy._c.mot=hy._c.mot.map((m,i)=>m*hybAssistShare(R[i].rpm/nMax,1,t));return hy._c;
  }
  const eng=buildTorqueCurve(),full=eng.map(p=>hybMotorTq(hy,p.rpm));
  const pk=Math.max(...eng.map(p=>p.tq));
  const mot=(e.hyDeploy==='eco'?full.map((t,i)=>Math.min(t,Math.max(0,pk-eng[i].tq))):full)
    .map((m,i)=>m*hybAssistWindow(e,eng[i].rpm)*hybAssistShare(eng[i].rpm/e.redline,1,t));   // the tune (build 192)
  hy._c={score:e.score,eng,mot,full};
  return hy._c;
}
const hybMotorAt=rpm=>{const c=hybCurves(),R=c.eng;
  if(rpm<=R[0].rpm)return c.mot[0];
  for(let i=1;i<R.length;i++)if(rpm<=R[i].rpm)return c.mot[i-1]+(c.mot[i]-c.mot[i-1])*(rpm-R[i-1].rpm)/(R[i].rpm-R[i-1].rpm);
  return c.mot[c.mot.length-1];};
// The motor's regeneration on the engine's overrun table (Nm, 500 rpm up in 250s): the electric car's law, on the bus.
function hybRegenTable(rl){
  const hy=engine.hy,out=[],V=hy.mode==='ps'?PS.busV:motorRatedV(hy),Pc=hy.pack.pChargeMax,k=(HYB_REGEN[hybTune().regen]||HYB_REGEN.high).k;
  for(let r=500;r<=rl+250;r+=250){
    const n=Math.min(r,rl),w=n*Math.PI/30,T=motorMaxTorque(hy.motor,n,V,60);
    out.push(k*Math.max(0,Math.min(T,Pc/Math.max(1,w))));   // REGENERATION's share (build 192)
  }
  return out;
}
// A solved lap in the hybrid's terms: per point the motor's power (W: + deploying, the part of the lap's power the
// engine's full load could not give; - regenerating, its share of the overrun), and the pack's energy over the lap.
function hybLapEnergy(L){
  const hy=engine.hy,R=L.replay,n=R.rpm.length,c=hybCurves(),V=hybBusV(hy),tc=hy.motor.cool.tCool,temp={w:tc+20,c:tc+15,r:60};
  const pt=powertrain(),v=L.v,p=L.track.line,m=vehicle.mass,rl=pt.maxRpm(),regen=hybRegenTable(rl),ov=hy.mode!=='p2'?[]:COMBUSTION.overrunTable(rl);   // a power-split's engine stops: no overrun
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
  if(hy.mode==='series'){   // the generator and the traction motor (build 193)
    c.eng.forEach((p,i)=>{const P=(p.tq+c.mot[i])*p.rpm*Math.PI/30;if(P>sys)sys=P;});
    const V=hybBusV(hy);
    return '<br><b>'+tr('HYBRID')+'</b> '+tr(HYBRID_MODES.series.label)+' • '+tr('generator')+' <b>'+Math.round(motorMaxTorque(hy.mg1,100,V,60))+' Nm</b>, '+tr('motor')+' <b>'+Math.round(motorMaxTorque(hy.motor,100,V,60))+' Nm</b> • '+
      tr('pack')+' '+hy.pack.kWh+' kWh '+tr(hy.pack.chem.label)+' • +'+hy.mass+' kg • '+tr('system')+' <b>'+Math.round(sys/1000)+' kW</b>';
  }
  if(hy.mode==='ps'){   // on MG2's shaft, the system's power and the two machines (build 189)
    c.eng.forEach((p,i)=>{const P=(p.tq+c.mot[i])*p.rpm*Math.PI/30;if(P>sys)sys=P;});
    return '<br><b>'+tr('HYBRID')+'</b> '+tr(HYBRID_MODES.ps.label)+' • MG1 <b>'+Math.round(motorMaxTorque(hy.mg1,100,PS.busV,60))+' Nm</b>, MG2 <b>'+Math.round(motorMaxTorque(hy.motor,100,PS.busV,60))+' Nm</b> • '+
      tr('pack')+' '+hy.pack.kWh+' kWh '+tr(hy.pack.chem.label)+' • +'+hy.mass+' kg • '+tr('system')+' <b>'+Math.round(sys/1000)+' kW</b>';
  }
  c.eng.forEach((p,i)=>{const t=p.tq+c.mot[i],P=t*p.rpm*Math.PI/30;if(P>sys){sys=P;sysR=p.rpm;}tq=Math.max(tq,t);});
  return '<br><b>'+tr('HYBRID')+'</b> '+tr(HYBRID_MODES[hy.mode].label)+', '+tr((HYBRID_DEPLOY[e.hyDeploy]||HYBRID_DEPLOY.full).label)+' • '+tr('motor')+' <b>'+Math.round(Math.max(...c.full))+' Nm</b> • '+
    tr('pack')+' '+hy.pack.kWh+' kWh '+tr(hy.pack.chem.label)+' • +'+hy.mass+' kg • '+tr('system')+' <b>'+Math.round(sys/1000)+' kW</b> '+tr('at')+' '+sysR+' rpm, <b>'+Math.round(tq)+' Nm</b>';
}
// ---- the HYBRID TUNE's fields on the ENGINE tab (build 192) ----
let hybMapForm=HYB_TUNE_DEFAULT.map.slice();
function readHybTuneFromForm(){
  const g=id=>document.getElementById(id),D=HYB_TUNE_DEFAULT;
  const num=(id,lo,hi,d)=>{const v=+g(id).value;return clamp(Math.round(isFinite(v)&&g(id).value!==''?v:d),lo,hi);};
  const socLo=num('edHySocLo',10,60,D.socLo),socHi=Math.max(socLo+10,num('edHySocHi',40,95,D.socHi)),socT=clamp(num('edHySocT',20,80,D.socT),socLo+5,socHi-5);
  return {rpm:num('edHyRpm',1000,12000,D.rpm),map:hybMapForm.slice(),regen:HYB_REGEN[g('edHyRegen').value]?g('edHyRegen').value:'high',
    lps:g('edHyLps').value!=='off',evKmh:num('edHyEvKmh',0,200,D.evKmh),evKw:num('edHyEvKw',0,400,D.evKw),socLo,socT,socHi};
}
function applyHybTuneToForm(t){
  const g=id=>document.getElementById(id);if(!g('edHyRpm'))return;
  t=Object.assign({},HYB_TUNE_DEFAULT,t||{});
  g('edHyRpm').value=t.rpm;g('edHyRegen').value=HYB_REGEN[t.regen]?t.regen:'high';g('edHyLps').value=t.lps===false?'off':'on';
  g('edHyEvKmh').value=t.evKmh;g('edHyEvKw').value=t.evKw;g('edHySocLo').value=t.socLo;g('edHySocT').value=t.socT;g('edHySocHi').value=t.socHi;
  hybMapForm=Array.isArray(t.map)&&t.map.length===20?t.map.slice():HYB_TUNE_DEFAULT.map.slice();
  renderHybMap();
}
// The assist map as a table: pedal rows (100% at the top), speed columns; a cell steps down 25% a click, 0 back to 100.
function renderHybMap(){
  const box=document.getElementById('hyAssistMap');if(!box)return;
  let h='<table class="hy-map" aria-label="'+tr('Assist map')+'"><tr><th>'+tr('PEDAL')+' / '+tr('SPEED')+'</th>'+HYB_MAP_N.map(n=>'<th>'+Math.round(n*100)+'%</th>').join('')+'</tr>';
  for(let j=3;j>=0;j--){
    h+='<tr><th>'+Math.round(HYB_MAP_P[j]*100)+'%</th>';
    for(let i=0;i<5;i++){const v=hybMapForm[j*5+i],c=Math.round(40+150*v/100);
      h+='<td tabindex="0" data-k="'+(j*5+i)+'" style="background:rgb(10,'+c+','+Math.round(c*0.6)+');color:'+(v>50?'#0a0a10':'#e0e0e0')+'" aria-label="'+tr('pedal')+' '+Math.round(HYB_MAP_P[j]*100)+'%, '+tr('speed')+' '+Math.round(HYB_MAP_N[i]*100)+'%: '+v+'%">'+v+'</td>';}
    h+='</tr>';
  }
  box.innerHTML=h+'</table>';
}
function bindHybMap(){
  const box=document.getElementById('hyAssistMap');if(!box)return;
  const step=td=>{const k=+td.dataset.k;hybMapForm[k]=hybMapForm[k]<=0?100:hybMapForm[k]-25;renderHybMap();const n=box.querySelector('td[data-k="'+k+'"]');if(n)n.focus();};
  box.addEventListener('click',e=>{const td=e.target.closest('td[data-k]');if(td)step(td);});
  box.addEventListener('keydown',e=>{const td=e.target.closest('td[data-k]');if(td&&(e.key==='Enter'||e.key===' ')){e.preventDefault();step(td);}});
}
