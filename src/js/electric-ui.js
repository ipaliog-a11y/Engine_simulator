// ====== ELECTRIC: the design form, the build, the bench and the dyno for a battery-electric drive (build 179) ======
// Step 2.2 of plans/hybrid-electric/. ELECTRIC is a fifth engine type: choosing it swaps the ENGINE tab's combustion
// sections for MOTOR, INVERTER and BATTERY (decision 6), and the bench, the dyno and the scorecard run on the physics
// of src/js/electric.js. The combustion code is not touched: each of its entry points (buildEngine, the bench steps,
// the dyno, the sound, the cutaway, the readouts) hands over to the function here when the built engine is electric,
// so a combustion build runs exactly as before (tools/fingerprint.mjs).
//
// The car does not drive on it yet. A single-speed reduction, regenerative braking and the motor's heat over a lap
// are step 2.3; until then the VEHICLE, TRACK and RACE tabs say so instead of running an electric car through a
// combustion gearbox. New words are English for now (decision 11): tr() shows the English where Greek is missing.
const EV_DEFAULT={evMotorType:'pm',evRotorD:150,evStack:134,evPoles:6,evTurns:12,evMagnet:'ndfeb',evRetention:'bridges',evCooling:'jacket',
  evMaxRpm:18000,evInverter:'igbt',evAmps:950,evRearCount:1,evFront:'none',evFrontD:130,evFrontStack:110,evFrontPoles:4,evFrontTurns:12,evFrontAmps:700,evChem:'nca',evSeries:96,evKWh:75,evYear:2020};
// The race spends energy, not fuel (step 2.4): until then an electric car drives the 0-100 and the lap but does not race.
// One reduction is all an electric car has: GEARING on the VEHICLE tab sets it (build 180).
const EV_GEAR_NOTE='An electric car has one fixed reduction: set it with GEARING on the VEHICLE tab.';
const isElectric=()=>!!engine&&engine.type==='electric';
const EV_REPORT_NOTE='The printable report for a motor comes in a later build: the DYNO tab has its curves and table.';
// The engine's sound would be an engine's; a motor's (inverter whine, gear mesh) is step 4, so it is quiet until then.
function muteEngineSound(){
  const t=Sound.ctx.currentTime;
  if(Sound.node)Sound.node.parameters.get('level').setTargetAtTime(0,t,0.08);
  if(Sound.gain)Sound.gain.gain.setTargetAtTime(0,t,0.08);
  if(Sound.gasGain)Sound.gasGain.gain.setTargetAtTime(0,t,0.08);
}

// What the rotor's temperature is the temperature of: the magnets, or an induction motor's cage.
const rotorWord=m=>m.im?'ROTOR':'MAGNETS';

// ---- the design form ----
function readElectricFromForm(){
  const g=id=>document.getElementById(id),num=(id,lo,hi)=>clamp(+g(id).value||EV_DEFAULT[id],lo,hi);
  return {evMotorType:g('evMotorType').value==='im'?'im':'pm',evRotorD:num('evRotorD',80,260),evStack:num('evStack',40,250),evPoles:+g('evPoles').value||6,
    evTurns:Math.round(num('evTurns',4,120)),evMagnet:g('evMagnet').value,evRetention:g('evRetention').value,
    evCooling:g('evCooling').value,evMaxRpm:Math.round(num('evMaxRpm',4000,25000)),evInverter:g('evInverter').value,
    evAmps:Math.round(num('evAmps',100,1600)),evRearCount:g('evRearCount').value==='2'?2:1,
    evFront:['pm','im'].includes(g('evFront').value)?g('evFront').value:'none',evFrontD:num('evFrontD',80,260),evFrontStack:num('evFrontStack',40,250),
    evFrontPoles:+g('evFrontPoles').value||4,evFrontTurns:Math.round(num('evFrontTurns',4,60)),evFrontAmps:Math.round(num('evFrontAmps',100,1600)),evChem:g('evChem').value,evSeries:Math.round(num('evSeries',20,400)),
    evKWh:num('evKWh',0.5,200),evYear:Math.round(num('evYear',1990,2026))};
}
function applyElectricToForm(e){
  for(const k in EV_DEFAULT){const el=document.getElementById(k);if(el)el.value=String(e&&e[k]!=null?e[k]:EV_DEFAULT[k]);}
}
// Combustion sections are everything from the Bottom End grid down to the summary that is not marked data-ev; they are
// tagged once, then the panel's .ev class shows one set or the other (styles in app.css). Called from syncDesignEnable.
let evTagged=false;
function syncElectricSections(){
  const typeSel=document.getElementById('edType'),panel=document.getElementById('designPanel');
  if(!typeSel||!panel)return false;
  if(!evTagged){
    const grid=typeSel.closest('.design-grid');
    [...grid.children].forEach(f=>{if(!f.contains(typeSel))f.classList.add('ice-only');});
    for(let el=grid.nextElementSibling;el&&el.id!=='designSummary';el=el.nextElementSibling)
      if(!el.hasAttribute('data-ev'))el.classList.add('ice-only');
    evTagged=true;
  }
  const ev=typeSel.value==='electric',hs=document.getElementById('edHybrid'),hy=!ev&&!!hs&&hs.value!=='none';
  panel.classList.toggle('ev',ev);
  panel.classList.toggle('hy',hy);   // a hybrid's motor and battery, under its engine (build 186)
  if(hs){const d=document.getElementById('edHyDeploy');if(d)d.disabled=!hy||hs.value==='ps'||hs.value==='series';   // a power-split deploys all it has (build 189)
    const r=document.getElementById('edHyRpm');if(r&&d)r.disabled=d.disabled||!/^(above|below)$/.test(d.value);}
  if(ev||hy){
    // a chemistry that had not reached cars by the technology year is offered disabled (decision 9)
    const year=clamp(+document.getElementById('evYear').value||2020,1990,2026),chem=document.getElementById('evChem');
    [...chem.options].forEach(o=>{o.disabled=!chemAvailable(o.value,year);});
    if(!chemAvailable(chem.value,year))chem.value=['nca','ncaP','liHEV','lfp','nimhHEV','nimh','lead'].find(c=>chemAvailable(c,year));
    // an induction motor has no magnets to grade or to hold in (build 182): its rotor is a copper cage
    const im=document.getElementById('evMotorType').value==='im';
    document.getElementById('evMagnet').disabled=im;document.getElementById('evRetention').disabled=im;
  }
  if(ev){
    // a front motor (build 183): its fields, and the car is all-wheel drive
    const front=document.getElementById('evFront').value!=='none';
    ['evFrontD','evFrontStack','evFrontPoles','evFrontTurns','evFrontAmps'].forEach(id=>{document.getElementById(id).disabled=!front;});
    evDriveLock(front);
  }else evDriveLock(false);
  return ev;
}

// A front motor drives the front wheels: the drivetrain is all-wheel drive while it is fitted, and goes back to what
// it was when it is taken off.
function evDriveLock(on){
  const dr=document.getElementById('vhDrive');if(!dr)return;
  if(on){if(!dr.disabled)dr.dataset.prev=dr.value;dr.value='awd';dr.disabled=true;}
  else if(dr.disabled){dr.value=dr.dataset.prev||dr.value;dr.disabled=false;}
}

// ---- the build ----
function buildElectric(){
  engine=readEngineFromForm();   // type 'electric'; the combustion fields stay with it, for switching back
  const e=engine;
  const rear=motorBuild({type:e.evMotorType,rotorD:e.evRotorD,stackL:e.evStack,poles:e.evPoles,turns:e.evTurns,magnet:e.evMagnet,
    retention:e.evRetention,cooling:e.evCooling,inverter:e.evInverter,invAmps:e.evAmps,maxRpm:e.evMaxRpm});
  // more than one motor (build 183): the rear group, and a front motor sharing the magnet grade, cooling and inverter
  const parts=[{m:rear,n:e.evRearCount===2?2:1}];
  if(e.evFront==='pm'||e.evFront==='im')parts.push({m:motorBuild({type:e.evFront,rotorD:e.evFrontD,stackL:e.evFrontStack,poles:e.evFrontPoles,
    turns:e.evFrontTurns,magnet:e.evMagnet,retention:e.evRetention,cooling:e.evCooling,inverter:e.evInverter,invAmps:e.evFrontAmps,maxRpm:e.evMaxRpm}),n:1});
  e.motor=parts.length===1&&parts[0].n===1?rear:motorSet(parts);
  e.pack=packBuild({chem:e.evChem,series:e.evSeries,kWh:e.evKWh,year:e.evYear});
  // What the rest of the app reads off any engine: its speed range, its inertia, and the bench brake's scale.
  e.redline=Math.floor(e.motor.nMax/50)*50;e.idleRpmEff=0;e.inertia=e.motor.J;
  e.intake='na';e.maxBoost=0;e.mapMax=1;e.afrMode='fixed';e.stoichAFR=14.7;e.ci=false;e.displacement_L=0;
  e.score=scoreMotor(e);
  e.loadRefTq=e.score.peakTQ;e.brakeGain=e.loadRefTq/220;
  e.cost=e.motor.cost+e.pack.cost;
  // a fresh drive on a charged pack
  const tc=e.motor.cool.tCool;
  state.mT={w:tc,c:tc,r:tc};state.soc=0.9;state.battI=0;state.battKW=0;
  state.engineHealth=1;state.blown=false;state.wearCause='';state.boostActual=0;state.nitrousActive=false;
  state.map=1;state.rpm=clamp(state.rpm,0,e.redline);
  buildRev++;dynoCache=null;
  setLiveLabels(true);
  updateEngineLabels();updateDesignSummary();renderChallenge();
  if(document.getElementById('vhChassis')){buildVehicle();updateVehicleSummary();}
}
// The bus voltage the rated figures are taken at: the pack's open-circuit voltage at half charge.
const motorRatedV=e=>packOcv(e.pack,0.5);
// The most torque the drive gives at a speed, motor and battery together: the motor's envelope (the voltage, the
// magnets' temperature), cut to what the pack can supply less the drive's own losses, and by the controller's thermal
// derating. The battery cut is solved by bisection on the torque: T w + losses(T) <= the pack's limit.
function driveMaxTorque(e,rpm,Vdc,temp,soc){
  const m=e.motor;let T=motorMaxTorque(m,rpm,Vdc,temp.r)*motorDerate(e,temp)*(state.engineHealth||1);
  const w=rpm*Math.PI/30,Pb=packMaxPower(e.pack,soc);
  const need=t=>t*w+motorLosses(m,t,rpm,Vdc,temp).total;
  if(T>0&&need(T)>Pb){let lo=0,hi=T;for(let k=0;k<30;k++){const mid=(lo+hi)/2;if(need(mid)>Pb)hi=mid;else lo=mid;}T=lo;}
  return T;
}
// The controller protects the drive: full current until the winding reaches 150 C (class H insulation is rated 180),
// none at 180; the magnets likewise over their last 20 C below the grade's limit.
function motorDerate(e,temp){
  const tm=e.motor.mag.Tmax;
  return clamp((180-temp.w)/30,0,1)*clamp((tm-temp.r)/20,0,1);
}
// The scorecard at the rated voltage, magnets at 60 C, a cool winding: peaks, the speed range at 80% of peak power,
// the best efficiency on the full-load line, the continuous power the cooling holds, and how long it holds the peak.
function scoreMotor(e){
  const m=e.motor,V=motorRatedV(e),cool={w:m.cool.tCool,c:m.cool.tCool,r:60},rMax=e.redline;
  let peakHP=0,peakHPrpm=0,peakTQ=0,peakTQrpm=0;const pts=[];
  for(let r=100;r<=rMax;r+=100){
    const T=driveMaxTorque(e,r,V,cool,0.5),kW=T*r*Math.PI/30/1000,hp=kW/0.7457;
    pts.push({rpm:r,T,hp});
    if(hp>peakHP){peakHP=hp;peakHPrpm=r;}
    if(T>peakTQ+0.5){peakTQ=T;peakTQrpm=r;}
  }
  // a drive held to the pack's power is flat on top: its peak is where the plateau starts (within 0.1%), not whichever
  // point of it rounding happens to favour
  peakHPrpm=(pts.find(p=>p.hp>=0.999*peakHP)||{rpm:peakHPrpm}).rpm;
  let lo=rMax,hi=0;pts.forEach(p=>{if(p.hp>=0.8*peakHP){lo=Math.min(lo,p.rpm);hi=Math.max(hi,p.rpm);}});
  let best={e:0,rpm:0,T:0};
  for(let r=500;r<=rMax;r+=250)for(const f of [0.15,0.25,0.4,0.6,0.8,1]){
    const p=pts[Math.min(pts.length-1,Math.round(r/100)-1)],T=p.T*f;if(!(T>1))continue;
    const ef=motorEfficiency(m,T,r,V,{w:90,r:70});if(ef>best.e)best={e:ef,rpm:r,T};
  }
  const cont=motorContinuousKW(e,V),hold=motorPeakHold(e,V);
  // The grade rates the drive the way the engine grade rates an engine, on what the design decides: power per kg of
  // motor (2-6 kW/kg spans production motors), the constant-power range, peak efficiency (93-98%), how much of the
  // peak the cooling holds for good, and how long the peak itself lasts (10 s to 2 minutes). Tailpipe emissions are
  // nil, so they are reported but not scored.
  const kWkg=peakHP*0.7457/m.mass;
  const sPower=clamp((kWkg-2)/4,0,1)*100,sBand=clamp((hi-lo)/(rMax*0.75),0,1)*100,sEff=clamp((best.e*100-93)/5,0,1)*100;
  const sCont=clamp(cont/(peakHP*0.7457)/0.6,0,1)*100,sHold=clamp((hold-10)/110,0,1)*100;
  const overall=Math.round(0.30*sPower+0.15*sBand+0.20*sEff+0.20*sCont+0.15*sHold);
  const grade=overall>=88?'S':overall>=76?'A':overall>=62?'B':overall>=46?'C':overall>=30?'D':'F';
  const reliability=clamp(Math.round(100-Math.max(0,60-sCont)*0.5-(m.mag.Tmax<160?8:0)),0,100);
  const tq2000=(pts.find(p=>p.rpm>=2000)||pts[0]).T;
  return {peakHP:Math.round(peakHP),peakHPrpm,peakTQ:Math.round(peakTQ),peakTQrpm,hpPerL:0,nmPerL:0,band:Math.max(0,hi-lo),
    thEff:Math.round(best.e*1000)/10,safety:100,drive:Math.round(clamp(tq2000/Math.max(1,peakTQ),0,1)*100),emissions:100,
    reliability,overall,grade,peakKW:Math.round(peakHP*0.7457),contKW:Math.round(cont),holdS:Math.round(hold),
    bestEff:best,kWkg:Math.round(kWkg*10)/10,knee:Math.round(motorBaseW(m,V,motorPsi(m,60))*30/Math.PI)};
}
// The continuous power (kW): the most the drive holds for good at 1.5x the knee, with the winding settling at 150 C or
// less and the magnets 20 C under their limit. Bisection on the torque over motorSteadyTemps.
function motorContinuousKW(e,V){
  const m=e.motor,rpm=Math.min(e.redline,1.5*motorBaseW(m,V,motorPsi(m,60))*30/Math.PI),w=rpm*Math.PI/30;
  const Tmax=motorMaxTorque(m,rpm,V,60),ok=T=>{const s=motorSteadyTemps(m,T,rpm,V);return s.w<=150&&s.r<=m.mag.Tmax-20;};
  if(!ok(1))return 0;
  let lo=1,hi=Tmax;if(ok(hi))return hi*w/1000;
  for(let k=0;k<24;k++){const mid=(lo+hi)/2;if(ok(mid))lo=mid;else hi=mid;}
  return lo*w/1000;
}
// How long the peak torque lasts (s), from coolant temperature, before the winding reaches the 150 C where the
// controller starts to cut it; capped at 300 s (a drive that holds it that long holds it).
function motorPeakHold(e,V){
  const m=e.motor,rpm=Math.max(500,motorBaseW(m,V,motorPsi(m,60))*30/Math.PI*0.8),tc=m.cool.tCool,t={w:tc,c:tc,r:tc};
  const T=motorMaxTorque(m,rpm,V,60);let s=0;
  for(;s<300&&t.w<150;s+=0.5)motorHeatStep(m,t,motorLosses(m,T,rpm,V,t),0.5);
  return s;
}

// ---- the bench ----
// The live loop's electric half (stepEngine hands over to it): the throttle asks for a share of the torque the drive
// can give at this speed; the pack supplies it and sags; the motor heats; the dyno brake (the same brakeTorque law as an
// engine's) holds the speed. With the throttle closed the motor simply coasts down on its own drag.
function stepMotorBench(dt){
  const e=engine,m=e.motor,b=e.pack,st=state;
  const Voc=packOcv(b,st.soc),Vdc=Math.max(b.vMin,Voc-(st.battI||0)*b.R);
  const T=st.soc>0.005?st.throttle*driveMaxTorque(e,st.rpm,Vdc,st.mT,st.soc):0;
  const L=motorLosses(m,T,st.rpm,Vdc,st.mT),w=st.rpm*Math.PI/30,Pb=T*w+L.total;
  const d=packDraw(b,st.soc,Math.max(0,Pb))||{V:b.vMin,I:0,heat:0};
  st.soc=Math.max(0,st.soc-d.I*dt/(b.Ah*3600));
  st.battI=d.I;st.battKW=d.V*d.I/1000;st.systemVoltage=d.V;
  motorHeatStep(m,st.mT,L,dt);
  // A rotor has a third of an engine's inertia against the same stiff brake law, so a whole frame in one step overshoots
  // and rings; the speed is stepped in pieces short enough for the brake (a half of its own time constant).
  const drag=w>1?(L.mech)/w:0,hMax=0.5*e.inertia*Math.PI/(30*e.brakeGain),ns=Math.max(1,Math.ceil(dt/hMax)),h=dt/ns;
  for(let k=0;k<ns;k++){
    const omega=st.rpm*Math.PI/30+(T-drag-brakeTorque())/e.inertia*h;
    st.rpm=clamp(omega*30/Math.PI,0,e.redline);
  }
  st.torque=T;st.powerKW=T*w/1000;st.powerHP=st.powerKW/0.7457;
  st.thermalEff=Pb>100?clamp(T*w/Pb*100,0,100):0;
  st.fuelFlowLph=0;st.bsfc=999;st.knockRisk=0;st.fuelCut=false;
}
// Damage the controller cannot prevent: magnets past their grade's limit lose flux for good (the remanence a hot NdFeB
// magnet gives up past its coercivity does not come back), a winding past 200 C cooks its insulation.
function stepMotorWear(dt){
  const st=state,m=engine.motor;
  let cause='';
  if(st.mT.r>m.mag.Tmax){st.engineHealth=Math.max(0.3,st.engineHealth-0.004*(st.mT.r-m.mag.Tmax)*dt);cause=m.im?'ROTOR CAGE OVERHEATING':'MAGNETS DEMAGNETISING';}
  if(st.mT.w>200){st.engineHealth=Math.max(0,st.engineHealth-0.01*(st.mT.w-200)*dt);cause='WINDING INSULATION BURNING';}
  st.wearCause=cause;
  if(st.engineHealth<=0.001){st.blown=true;}
}
// The bench's operating points (the LIVE tab's PEAK TORQUE, MAX POWER and ECO buttons), the way operatingPoint gives
// an engine's.
function motorOperatingPoint(kind){
  const s=engine.score;
  if(kind==='power')return {rpm:s.peakHPrpm,throttle:1,lambda:1,tq:s.peakHP*745.7/(s.peakHPrpm*Math.PI/30),expect:s.peakKW+' kW'};
  if(kind==='torque'){const r=Math.max(500,Math.round(s.knee*0.5/100)*100);return {rpm:r,throttle:1,lambda:1,tq:s.peakTQ,expect:s.peakTQ+' Nm'};}
  const b=s.bestEff,full=driveMaxTorque(engine,b.rpm,motorRatedV(engine),{w:90,c:80,r:70},0.5);
  return {rpm:b.rpm,throttle:clamp(b.T/Math.max(1,full),0.05,1),lambda:1,tq:b.T,expect:(b.e*100).toFixed(1)+'% at '+Math.round(b.T*b.rpm*Math.PI/30/1000)+' kW'};
}

// ---- the dyno ----
// A pull at the live state: the pack's voltage now, the magnets as hot as they are now, so a hot or drained drive shows
// on the curve. Torque, power and the drive's efficiency on the full-load line.
function motorDynoData(){
  const e=engine,st=state,key=[buildRev,Math.round(st.soc*200),Math.round(st.mT.r/2),Math.round(st.mT.w/2),st.engineHealth.toFixed(3)].join('|');
  if(dynoCache&&dynoCacheKey===key)return dynoCache;
  const V=packOcv(e.pack,st.soc),pts=[],step=Math.max(100,Math.round(e.redline/70/50)*50);
  for(let rpm=step;rpm<=e.redline;rpm+=step){
    const T=driveMaxTorque(e,rpm,V,st.mT,st.soc),kW=T*rpm*Math.PI/30/1000;
    pts.push({rpm,torque:T,powerKW:kW,powerHP:kW/0.7457,eff:T>1?motorEfficiency(e.motor,T,rpm,V,st.mT):0});
  }
  dynoCache=pts;dynoCacheKey=key;return pts;
}
function drawMotorDyno(){
  const W=vizW,H=vizH,rMax=engine.redline,s=engine.score,data=motorDynoData();
  ctx.fillStyle=C.bg;ctx.fillRect(0,0,W,H);
  drawPixelRect(0,0,W,28,'#12121c');
  ctx.fillStyle=C.yellow;ctx.font='10px "Press Start 2P"';ctx.fillText(tr('DYNO • MOTOR TORQUE, POWER & EFFICIENCY'),12,19);
  ctx.fillStyle=C.green;ctx.fillText(Math.round(state.rpm)+' RPM',W-110,19);
  let maxT=40,maxP=40;data.forEach(p=>{maxT=Math.max(maxT,p.torque);maxP=Math.max(maxP,p.powerKW);});
  dynoPulls.forEach(pl=>pl.pts.forEach(p=>{maxT=Math.max(maxT,p.torque);maxP=Math.max(maxP,p.powerKW||p.powerHP*0.7457);}));
  maxT*=1.15;maxP*=1.15;
  const gX=55,gY=48,gW=530,gH=262;
  drawPixelRect(gX,gY,gW,gH,'#0a0a14');ctx.strokeStyle='#333';ctx.lineWidth=2;ctx.strokeRect(gX,gY,gW,gH);
  ctx.strokeStyle='#1a1a28';ctx.lineWidth=1;
  for(let i=1;i<8;i++){const x=gX+(gW/8)*i;ctx.beginPath();ctx.moveTo(x,gY);ctx.lineTo(x,gY+gH);ctx.stroke();
    const y=gY+(gH/6)*i;ctx.beginPath();ctx.moveTo(gX,y);ctx.lineTo(gX+gW,y);ctx.stroke();}
  ctx.fillStyle='#666';ctx.font='7px "Press Start 2P"';
  for(let f=0;f<=1.001;f+=0.25)ctx.fillText(String(Math.round(rMax*f/100)*100),gX+gW*f-(f>0?12:5),gY+gH+14);
  ctx.fillText('RPM',gX+gW/2-15,gY+gH+28);
  ctx.fillStyle=C.cyan;ctx.fillText('0',gX-25,gY+gH+3);ctx.fillText(String(Math.round(maxT)),gX-30,gY+10);ctx.fillText('Nm',gX-28,gY+gH/2-12);
  ctx.fillStyle=C.yellow;ctx.fillText('0',gX+gW+6,gY+gH+3);ctx.fillText(String(Math.round(maxP)),gX+gW+6,gY+10);ctx.fillText('kW',gX+gW+6,gY+gH/2-12);
  const X=r=>gX+r/rMax*gW,YT=t=>gY+gH-t/maxT*gH,YP=p=>gY+gH-p/maxP*gH,YE=f=>gY+gH-clamp((f-0.7)/0.3,0,1)*gH;
  const line=(col,w,f)=>{ctx.strokeStyle=col;ctx.lineWidth=w;ctx.beginPath();data.forEach((p,i)=>{const x=X(p.rpm),y=f(p);i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.stroke();};
  ctx.lineWidth=1.5;
  dynoPulls.forEach(pl=>{ctx.strokeStyle=pl.color;ctx.globalAlpha=0.5;ctx.beginPath();
    pl.pts.forEach((p,i)=>{const x=X(p.rpm),y=YP(p.powerKW||p.powerHP*0.7457);i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.stroke();});
  ctx.globalAlpha=1;
  // efficiency on its own scale, 70-100%, faint behind the two curves that matter most
  ctx.setLineDash([3,3]);line('#66dd99',1.5,p=>YE(p.eff));ctx.setLineDash([]);
  line(C.cyan,3,p=>YT(p.torque));line(C.yellow,3,p=>YP(p.powerKW));
  ctx.fillStyle='#66dd99';ctx.font='6px "Press Start 2P"';ctx.fillText('EFF 70-100%',gX+gW-80,gY+12);
  const cx=X(clamp(state.rpm,0,rMax));
  ctx.strokeStyle=C.green;ctx.lineWidth=2;ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(cx,gY);ctx.lineTo(cx,gY+gH);ctx.stroke();ctx.setLineDash([]);
  // the knee, where the voltage runs out and the torque starts to fall
  const kx=X(s.knee);ctx.strokeStyle='#556';ctx.setLineDash([2,4]);ctx.beginPath();ctx.moveTo(kx,gY);ctx.lineTo(kx,gY+gH);ctx.stroke();ctx.setLineDash([]);
  ctx.fillStyle='#889';ctx.fillText(tr('KNEE'),kx+3,gY+gH-6);
  const iy=gY+gH+30;
  drawPixelRect(0,iy-14,W,H-(iy-14),'#12121c');
  ctx.font='7px "Press Start 2P"';
  const pk=data.reduce((a,p)=>p.powerKW>a.powerKW?p:a,data[0]||{powerKW:0,rpm:0}),pt=data.reduce((a,p)=>p.torque>a.torque?p:a,data[0]||{torque:0,rpm:0});
  ctx.fillStyle=C.cyan;ctx.fillText(tr('TQ')+' '+pt.torque.toFixed(0)+'Nm@'+pt.rpm,gX+4,iy);
  ctx.fillStyle=C.yellow;ctx.fillText(tr('PWR')+' '+pk.powerKW.toFixed(0)+'kW@'+pk.rpm,gX+160,iy);
  const gc=s.overall>=76?C.green:s.overall>=46?C.yellow:C.red;
  ctx.fillStyle=gc;ctx.font='11px "Press Start 2P"';ctx.fillText(tr('GRADE')+' '+s.grade+' '+s.overall,gX+320,iy+1);
  ctx.font='6px "Press Start 2P"';ctx.fillStyle='#99aabb';
  ctx.fillText(s.kWkg+' kW/kg • '+tr('cont')+' '+s.contKW+' kW • '+tr('peak holds')+' '+s.holdS+' s • '+tr('best eff')+' '+s.thEff+'% • '+tr('knee')+' '+s.knee+' rpm',gX+4,iy+14);
  const t=state.mT,lim=engine.motor.mag.Tmax;
  ctx.fillStyle=t.w>150?C.red:'#cbb26a';
  ctx.fillText(tr('WINDING')+' '+Math.round(t.w)+'°C • '+tr(rotorWord(engine.motor))+' '+Math.round(t.r)+'°C ('+tr('limit')+' '+lim+') • '+tr('PACK')+' '+state.systemVoltage.toFixed(0)+' V, '+Math.round(state.soc*100)+'%',gX+4,iy+28);
  ctx.fillStyle='#667';ctx.fillText(dynoPulls.length?dynoPulls.map(p=>'— '+p.label).join('   '):tr('LOG PULL to snapshot & overlay a curve for comparison'),gX+4,iy+41);
}
function renderMotorResult(force){
  const box=document.getElementById('dynoResult');
  if(!box||box.hidden||!engine.score)return;
  const data=motorDynoData(),key='ev|'+buildRev+'|'+dynoCacheKey+'|'+currentLang;
  if(!force&&key===dynoResultKey)return;
  dynoResultKey=key;
  const s=engine.score,m=engine.motor,b=engine.pack;
  const card=(cls,k,v,sub)=>'<div class="dr-card '+cls+'"><div class="k">'+k+'</div><div class="v">'+v+'</div><div class="s">'+sub+'</div></div>';
  const step=engine.redline>12000?1000:500,rows=[];
  for(let r=step;r<=engine.redline;r+=step)rows.push(r);
  const at=r=>{for(let i=1;i<data.length;i++)if(r<=data[i].rpm){const a=data[i-1],c=data[i],f=(r-a.rpm)/(c.rpm-a.rpm);
    return {kW:a.powerKW+(c.powerKW-a.powerKW)*f,tq:a.torque+(c.torque-a.torque)*f,eff:a.eff+(c.eff-a.eff)*f};}
    const z=data[data.length-1]||{powerKW:0,torque:0,eff:0};return {kW:z.powerKW,tq:z.torque,eff:z.eff};};
  box.innerHTML='<h4>'+tr('DYNO RESULT')+'</h4><div class="dr-cards">'+
    card('hp',tr('PEAK POWER'),s.peakKW+' kW',s.peakHP+' hp @ '+s.peakHPrpm+' rpm')+
    card('tq',tr('PEAK TORQUE'),s.peakTQ+' Nm','0 - '+s.knee+' rpm ('+tr('knee')+')')+
    card('',tr('CONTINUOUS'),s.contKW+' kW',tr('peak holds')+' '+s.holdS+' s • '+tr('best eff')+' '+s.thEff+'%')+
    '</div><p class="dr-note">'+tr('Rated at the pack\'s half-charge voltage')+' ('+Math.round(motorRatedV(engine))+' V), '+
    tr('magnets at 60 °C. The curve above is the drive as it is right now: the pack\'s charge and the magnets\' heat move it.')+
    ' '+tr(m.mag.label)+', '+m.poles+' '+tr('poles')+', '+m.N+' '+tr('turns')+' • '+tr(b.chem.label)+' '+b.series+'s, '+b.kWh+' kWh</p>'+
    '<table class="dr-table"><thead><tr><th>RPM</th><th>kW</th><th>HP</th><th>Nm</th><th>'+tr('EFF')+' %</th></tr></thead><tbody>'+
    rows.map(r=>{const v=at(r);return '<tr><td>'+r+'</td><td class="hp">'+v.kW.toFixed(1)+'</td><td>'+(v.kW/0.7457).toFixed(1)+
      '</td><td class="tq">'+v.tq.toFixed(1)+'</td><td>'+(v.eff*100).toFixed(1)+'</td></tr>';}).join('')+'</tbody></table>';
}

// ---- the readouts ----
// The LIVE panel's tiles, retitled for a motor; the engine's titles come back when an engine is built again.
const EV_TILES={statHP:['POWER','HP'],statTQ:['TORQUE','Nm'],statBSFC:['BATTERY','kW'],statEff:['DRIVE EFF','%'],
  statFuel:['CHARGE','%'],statKnock:['WINDING','°C'],statHealth:['MOTOR HEALTH','%']};
function setLiveLabels(ev){
  for(const id in EV_TILES){
    const el=document.getElementById(id);if(!el)continue;
    const L=el.querySelector('.label'),U=el.querySelector('.unit');
    if(L.dataset.ice==null){L.dataset.ice=L.textContent;U.dataset.ice=U.textContent;}
    L.textContent=ev?tr(EV_TILES[id][0]):tr(L.dataset.ice);U.textContent=ev?EV_TILES[id][1]:U.dataset.ice;
  }
  // what a motor has no use for leaves the panel: mixture, intake air, the engine's coolant and oil, the alternator's
  // load, auto-thermal and nitrous, and the printable report (EV_REPORT_NOTE); it comes back with an engine
  ['afr','iat','coolant','oil','elec'].forEach(id=>{const el=document.getElementById(id);
    if(el){el.disabled=ev;const grp=el.closest('.control-group');if(grp)grp.style.display=ev?'none':'';}});
  ['btnAutoThermal','btnReportPng'].forEach(id=>{const el=document.getElementById(id);
    if(el){const row=el.closest('.btn-row');if(row)row.style.display=ev?'none':'';}});
  if(ev){const nb=document.getElementById('btnNitrous');if(nb)nb.disabled=true;}
}
function updateMotorUI(){
  const st=state,g=id=>document.getElementById(id);
  g('valThrottle').textContent=Math.round(st.throttle*100);
  g('valLoad').textContent=Math.round(st.load*100);
  g('valElec').textContent='—';
  g('readout').textContent='RPM '+Math.round(st.rpm)+' • BUS '+st.systemVoltage.toFixed(0)+' V • '+Math.round(st.battI||0)+' A • SOC '+Math.round(st.soc*100)+'%';
  document.querySelector('#statHP .value').textContent=st.powerHP.toFixed(1);
  document.querySelector('#statTQ .value').textContent=st.torque.toFixed(1);
  document.querySelector('#statBSFC .value').textContent=(st.battKW||0).toFixed(1);
  document.querySelector('#statEff .value').textContent=st.thermalEff.toFixed(1);
  document.querySelector('#statFuel .value').textContent=Math.round(st.soc*100);
  const wEl=g('statKnock');wEl.querySelector('.value').textContent=Math.round(st.mT.w);
  wEl.className='stat'+(st.mT.w>165?' danger':st.mT.w>140?' warning':'');
  const hp=Math.round(st.engineHealth*100),hEl=g('statHealth');
  hEl.querySelector('.value').textContent=st.blown?tr('DEAD'):hp;
  hEl.className='stat'+(st.blown||hp<30?' danger':(hp<70?' warning':''));
  const status=g('status'),legend=g('legend'),der=motorDerate(engine,st.mT);
  if(performance.now()<statusFlashUntil){/* keep the flash */}
  else if(vizMode==='design'){status.textContent=tr('DESIGN MODE • CONFIGURE & BUILD');status.className='status-bar';}
  else if(st.blown){status.textContent=tr('MOTOR FAILURE')+' ('+tr(st.wearCause)+') — '+tr('REBUILD WITH BUILD & DYNO');status.className='status-bar err';}
  else if(st.wearCause){status.textContent=tr('DAMAGE')+': '+tr(st.wearCause)+' — '+tr('HEALTH')+' '+hp+'%';status.className='status-bar err';}
  else if(st.soc<0.02){status.textContent=tr('PACK EMPTY — REBUILD TO RECHARGE');status.className='status-bar err';}
  else if(der<0.999){status.textContent=tr('THERMAL DERATE')+' • '+Math.round(der*100)+'% '+tr('of full current')+' • '+tr('WINDING')+' '+Math.round(st.mT.w)+'°C';status.className='status-bar warn';}
  else if(st.rpm>=engine.redline-30){status.textContent=tr('SPEED LIMIT')+' • '+Math.round(st.rpm)+' RPM';status.className='status-bar warn';}
  else if(st.powerKW>3){status.textContent=tr('RUNNING')+' • '+st.powerKW.toFixed(0)+' kW @ '+Math.round(st.rpm)+' RPM • '+st.thermalEff.toFixed(1)+'%';status.className='status-bar';}
  else{status.textContent=tr('COASTING')+' • '+Math.round(st.rpm)+' RPM';status.className='status-bar';}
  if(vizMode==='design')legend.innerHTML=tr('Rotor size, poles and turns set the torque and the knee; the battery sets the voltage the knee is reached at.')+'<br>'+tr('Cooling decides how long the peak lasts and what the drive holds for good.');
  else if(vizMode==='engine')legend.innerHTML=tr('THROTTLE asks for torque; LOAD (dyno brake) sets the hold RPM — zero = free-rev to the speed limit.')+'<br>'+tr('Hold the peak and watch the winding heat: past 150 °C the controller cuts the current.');
  else legend.innerHTML=tr('Dyno shows the drive\'s torque, power and efficiency at the pack\'s charge and the magnets\' heat right now.')+'<br>'+tr('Green line = current RPM.');
}
function updateMotorLabels(){
  const e=engine,m=e.motor,b=e.pack;
  document.getElementById('subtitle').textContent=tr('ELECTRIC')+' • '+tr('PM MOTOR')+' '+e.evRotorD+'×'+e.evStack+' mm • '+m.poles+'-'+tr('POLE')+
    ' • '+b.kWh+' kWh '+tr(b.chem.label)+' '+Math.round(b.Vnom)+' V';
  document.getElementById('engineCanvas').setAttribute('aria-label',tr('Test bench of an electric motor and its battery'));
  const nb=document.getElementById('btnNitrous');nb.disabled=true;nb.classList.remove('on');nb.setAttribute('aria-pressed','false');
}
function updateMotorSummary(){
  const e=engine,m=e.motor,b=e.pack,s=e.score,V=motorRatedV(e);
  const lim=m.nMax>=(e.evMaxRpm||0)-1?tr('the design speed'):m.nMax>=m.nTip-1?tr('the rotor surface')+' ('+m.ret.vTip+' m/s)':tr('the inverter frequency');
  const whkg=b.kWh*1000/b.mass;
  document.getElementById('designSummary').innerHTML=
    '<b>'+tr('ELECTRIC (BATTERY)')+'</b> • <b>'+tr(m.im?'INDUCTION MOTOR':'PERMANENT-MAGNET MOTOR')+'</b>'+
    '<br>'+tr('Rotor')+' <b>'+e.evRotorD+' × '+e.evStack+' mm</b> • <b>'+m.poles+'</b> '+tr('poles')+', '+m.slots+' '+tr('slots')+' • <b>'+m.N+'</b> '+tr('turns per phase')+
    (m.im?'<br>'+tr('Rotor')+' <b>'+tr(m.mag.label)+'</b>, '+m.Qr+' '+tr('bars')+' ('+tr('air gap')+' '+m.Bg.toFixed(2)+' T, '+tr('magnetising')+' '+Math.round(m.ImR)+' A, '+tr('limit')+' '+m.mag.Tmax+' °C)'
      :'<br>'+tr('Magnets')+' <b>'+tr(m.mag.label)+'</b> ('+tr('air gap')+' '+m.Bg.toFixed(2)+' T, '+tr('limit')+' '+m.mag.Tmax+' °C) • '+tr(m.ret.label))+
    '<br>'+tr('Knee')+' <b>'+s.knee+'</b> rpm '+tr('at')+' '+Math.round(V)+' V • '+tr('Top speed')+' <b>'+e.redline+'</b> rpm, '+tr('set by')+' '+lim+
    (m.parts?'<br>'+tr('Motors')+' <b>'+m.parts.map(q=>(q.n>1?q.n+' × ':'')+tr(q===m.parts[0]?'rear':'front')+' '+tr(q.m.im?'induction':'magnet')+' '+
      q.m.s.rotorD+'×'+q.m.s.stackL+' mm, '+q.m.Imax+' A').join(' + ')+'</b>':'')+
    '<br>'+tr('Inverter')+' <b>'+tr(m.inv.label)+'</b> '+m.Imax+' A • '+tr('Cooling')+' <b>'+tr(m.cool.label)+'</b>'+
    '<br>'+tr('Motor')+' <b>'+Math.round(m.mass)+' kg</b> ('+m.mCu.toFixed(1)+' kg '+tr('copper')+', '+(m.im?m.mCage.toFixed(1)+' kg '+tr('cage'):m.mMag.toFixed(1)+' kg '+tr('magnet'))+') • <b>'+s.kWkg+'</b> kW/kg'+
    '<br>'+tr('Battery')+' <b>'+tr(b.chem.label)+'</b> '+b.series+'s • <b>'+b.kWh+' kWh</b>, '+Math.round(b.Vnom)+' V, '+Math.round(b.Ah)+' Ah • <b>'+Math.round(b.mass)+' kg</b> ('+Math.round(whkg)+' Wh/kg) • '+e.evYear+
    '<br>'+tr('Pack gives')+' <b>'+Math.round(packMaxPower(b,0.9)/1000)+'</b> kW '+tr('full')+', '+Math.round(packMaxPower(b,0.2)/1000)+' kW '+tr('at 20%')+
    '<br><span style="color:#7fd">'+tr('Peak')+' <b>'+s.peakKW+' kW</b> ('+s.peakHP+' hp) • <b>'+s.peakTQ+' Nm</b> • '+tr('continuous')+' <b>'+s.contKW+' kW</b> • '+tr('peak holds')+' <b>'+s.holdS+' s</b></span>'+
    motorScoreLine(s,m,b);
}
// The engine scorecard's line, in a motor's terms: what the grade is made of, then the cost and its split.
function motorScoreLine(s,m,b){
  const gc=s.overall>=76?'#00ff88':s.overall>=46?'#ffcc00':'#ff6666',relCol=s.reliability>=75?'#00ff88':s.reliability>=50?'#ffcc00':'#ff6666';
  return '<br><span style="color:'+gc+'">'+tr('SCORE')+' <b>'+s.grade+' ('+s.overall+')</b></span> • '+s.kWkg+' kW/kg • '+tr('band')+' '+s.band+' rpm • '+
    tr('best eff')+' '+s.thEff+'% • '+tr('cont')+' '+s.contKW+' kW • '+tr('peak holds')+' '+s.holdS+' s'+
    '<br>'+tr('Cost')+' <b>'+fmtCost(engine.cost||0)+'</b> ('+tr('motor & inverter')+' '+fmtCost(m.cost)+', '+tr('battery')+' '+fmtCost(b.cost)+') • '+
    tr('Reliability')+' <b style="color:'+relCol+'">'+s.reliability+'</b> • <b>'+(engine.cost>0?(s.peakHP/(engine.cost/1000)).toFixed(1):0)+'</b> hp/$1k'+scoreLapLine();
}

// ---- the motor on the ENGINE view: no cutaway (decision 7), the bench's instruments ----
function drawMotorView(dt){
  const W=vizW,H=vizH,st=state,m=engine.motor,s=engine.score;
  ctx.fillStyle=C.bg;ctx.fillRect(0,0,W,H);
  drawPixelRect(0,0,W,28,'#12121c');
  ctx.fillStyle=C.yellow;ctx.font='10px "Press Start 2P"';ctx.fillText(tr('MOTOR ON THE BENCH'),12,19);
  ctx.fillStyle=C.green;ctx.fillText(Math.round(st.rpm)+' RPM',W-110,19);
  // the motor, end on, its rotor turning with the shaft
  const cx=150,cy=170,R=90;
  ctx.fillStyle='#2a2a3a';ctx.beginPath();ctx.arc(cx,cy,R+14,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#4a4a5c';ctx.beginPath();ctx.arc(cx,cy,R,0,Math.PI*2);ctx.fill();
  const wc=clamp((st.mT.w-40)/140,0,1);
  ctx.fillStyle='rgb('+Math.round(180+75*wc)+','+Math.round(120-80*wc)+','+Math.round(60-40*wc)+')';   // the copper glows as it heats
  for(let k=0;k<m.slots;k++){const a=k/m.slots*Math.PI*2;ctx.save();ctx.translate(cx+Math.cos(a)*(R-14),cy+Math.sin(a)*(R-14));ctx.rotate(a);ctx.fillRect(-6,-2,12,4);ctx.restore();}
  st.rotA=((st.rotA||0)+st.rpm/60*Math.PI*2*(dt||0)*0.02)%(Math.PI*2);   // shown slowed, a stroboscope's view
  ctx.fillStyle='#777788';ctx.beginPath();ctx.arc(cx,cy,R-26,0,Math.PI*2);ctx.fill();
  for(let k=0;k<m.poles;k++){const a=st.rotA+k/m.poles*Math.PI*2;ctx.fillStyle=k%2?'#cc3344':'#3355cc';
    ctx.save();ctx.translate(cx+Math.cos(a)*(R-40),cy+Math.sin(a)*(R-40));ctx.rotate(a);ctx.fillRect(-4,-10,8,20);ctx.restore();}
  ctx.fillStyle='#bbbbcc';ctx.beginPath();ctx.arc(cx,cy,12,0,Math.PI*2);ctx.fill();
  // the instruments
  const bar=(x,y,label,v,max,lim,unit,col)=>{
    ctx.fillStyle='#99aabb';ctx.font='7px "Press Start 2P"';ctx.fillText(label,x,y-4);
    drawPixelRect(x,y,240,12,'#1a1a28');
    ctx.fillStyle=col;ctx.fillRect(x,y,240*clamp(v/max,0,1),12);
    if(lim!=null){ctx.fillStyle='#ff5555';ctx.fillRect(x+240*clamp(lim/max,0,1)-1,y-2,2,16);}
    ctx.fillStyle='#e0e0e0';ctx.fillText(Math.round(v)+unit,x+248,y+10);
  };
  const x0=330;
  bar(x0,60,tr('TORQUE'),st.torque,Math.max(1,s.peakTQ),null,' Nm',C.cyan);
  bar(x0,95,tr('POWER'),st.powerKW,Math.max(1,s.peakKW),null,' kW',C.yellow);
  bar(x0,130,tr('WINDING'),st.mT.w,200,180,' °C',st.mT.w>150?'#ff5555':'#ffaa44');
  bar(x0,165,tr(rotorWord(m)),st.mT.r,200,m.mag.Tmax,' °C',st.mT.r>m.mag.Tmax-20?'#ff5555':'#cc88ff');
  bar(x0,200,tr('STATOR CORE'),st.mT.c,200,null,' °C','#88aacc');
  bar(x0,235,tr('CHARGE'),st.soc*100,100,null,' %','#66dd99');
  ctx.fillStyle='#99aabb';ctx.font='7px "Press Start 2P"';
  ctx.fillText(tr('BUS')+' '+st.systemVoltage.toFixed(0)+' V • '+Math.round(st.battI||0)+' A • '+(st.battKW||0).toFixed(0)+' kW '+tr('from the pack'),x0,275);
  ctx.fillText(tr('DRIVE EFF')+' '+st.thermalEff.toFixed(1)+'% • '+tr('derate')+' '+Math.round(motorDerate(engine,st.mT)*100)+'%',x0,292);
  ctx.fillStyle='#667';ctx.fillText(tr('No cutaway for a motor yet: the bench\'s instruments instead.'),12,H-12);
}

// ---- the motor as pixel art (the ENGINE tab's preview and the garage) ----
function drawMotorSprite(buf,e,t){
  const D=clamp(e.evRotorD||150,80,260),Ls=clamp(e.evStack||134,40,250);
  const h=Math.round(18+D/9),w=Math.round(30+Ls/5),x0=Math.round(70-w/2),y0=Math.round(52-h/2);
  const body='#5a5a6a',hi='#8a8a9a',lo='#3a3a48',fin='#4a4a58';
  buf.rect(x0-8,y0+4,8,h-8,lo);buf.rect(x0+w,y0+4,8,h-8,lo);                      // end bells
  buf.rect(x0,y0,w,h,body);buf.rect(x0,y0,w,2,hi);buf.rect(x0,y0+h-2,w,2,lo);
  for(let k=4;k<w-2;k+=4)buf.rect(x0+k,y0+1,1,h-2,fin);                           // cooling fins / jacket ribs
  if(e.evCooling==='jacket'||e.evCooling==='spray'||e.evCooling==='slot'){buf.rect(x0+6,y0-4,3,4,'#3a6a9a');buf.rect(x0+w-9,y0-4,3,4,'#3a6a9a');}
  const spin=Math.floor((t||0)*8)%2;
  buf.rect(x0+w+8,y0+Math.round(h/2)-2,14,4,'#c0c0d0');buf.rect(x0+w+18,y0+Math.round(h/2)-2+spin,2,4-spin,'#9a9aaa');   // shaft
  // the inverter on top and its orange high-voltage cables
  buf.rect(x0+Math.round(w/2)-10,y0-12,20,8,'#2a3a2a');buf.rect(x0+Math.round(w/2)-10,y0-12,20,1,'#5a7a5a');
  buf.rect(x0+Math.round(w/2)-6,y0-4,2,4,'#ff8800');buf.rect(x0+Math.round(w/2)+4,y0-4,2,4,'#ff8800');
  // the battery underneath, as long as its capacity
  const bw=Math.round(clamp(20+(e.evKWh||75)*0.9,24,140)),bx=Math.round(70-bw/2);
  buf.rect(bx,68,bw,7,'#22303a');buf.rect(bx,68,bw,1,'#44606a');
  for(let k=4;k<bw-2;k+=6)buf.rect(bx+k,70,4,3,e.evChem==='lfp'?'#3a7a5a':e.evChem==='lead'?'#5a5a5a':'#3a5a8a');
  buf.rect(bx+bw-2,64,2,4,'#ff8800');buf.rect(bx+bw-2,y0+h-2,2,64-(y0+h-2),'#ff8800');
  buf.outline('#000000');
}
const motorCaption=e=>'PM '+(e.evRotorD||150)+'×'+(e.evStack||134)+' '+(e.evKWh||75)+'kWh';
