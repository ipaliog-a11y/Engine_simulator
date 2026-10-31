// ====== THE HYBRID ON THE LIVE BENCH (build 190, step 3.6a of plans/hybrid-electric/; decisions 16-19) ======
// Until now the LIVE bench ran a hybrid's engine alone: its motor, pack and controller lived only in the 0-100, the lap,
// the race and the WLTP cycle. Here they run second by second with the engine, on the dyno's shaft:
//   PARALLEL (P2)     the motor turns with the gearbox input; the brake loads that shaft. With the engine on and its clutch
//                     closed the two turn together (the shaft never below the engine's idle); with the engine off the
//                     clutch is open and the motor turns the shaft alone.
//   POWER-SPLIT       the brake loads MG2's shaft (the ring side, through the 65:17 gear). The engine's speed is MG1's to
//                     set (src/js/power-split.js): it follows the controller's target, its torque splits 1/(1+rho) to the
//                     ring and the rest into MG1 as electricity; off, it stops and MG1 spins backwards freely.
// The engine is the bench's own engine (its manifold, boost and combustion as the combustion bench runs them) at the
// throttle the controller gives it; THROTTLE is the driver's pedal. The pack's charge drains and refills through
// packDraw, the motor and the pack heat as the electric car's do (build 180).
// DRIVE MODE (decision 18): the controller's job, as real hybrids offer it, or MANUAL:
//   AUTO          charge-sustaining: electric below a demand, the engine on above it or when the pack is low, the motor
//                 helping or the engine charging to bring the charge back to 60%;
//   EV            the engine off while the pack lasts (it starts again under 35%);
//   HOLD          as AUTO, holding the charge it had when chosen;
//   CHARGE        the engine on and charging towards 85%;
//   SPORT         the engine flat to the pedal and the motor's full help on top;
//   ENGINE ONLY   the pack does nothing (a P2's motor idle; a power-split's MG2 passing on exactly what MG1 makes);
//   MANUAL        the engine to the pedal, the motor to MOTOR COMMAND (-100% regenerating to +100% helping) and, on a
//                 power-split, the engine at ENGINE SPEED.
const HYB_DRIVE={auto:{label:'AUTO'},ev:{label:'EV'},hold:{label:'HOLD'},charge:{label:'CHARGE'},sport:{label:'SPORT'},engine:{label:'ENGINE ONLY'},manual:{label:'MANUAL'}};
// Named rules: the electric-driving threshold (a share of what the motor and pack can give together), the charge
// window, the charging rate the controller asks of the engine, the engine-speed response MG1 gives, the 12 V load, and the
// shortest time the engine stays started or stopped in AUTO and HOLD (2 s; build 198).
const HYB_BENCH={evShare:0.35,socLo:0.35,socHi:0.85,socAuto:0.6,chargeShare:0.5,neTau:0.25,auxW:300,neMax:0.97,dwell:2};
let hybBench=null;   // the bench's hybrid state; rebuilt when the engine's hybrid system is
function hybBenchState(){
  const hy=engine.hy;
  if(hybBench&&hybBench.hy===hy)return hybBench;
  const prev=hybBench,tc=hy.motor.cool.tCool;
  hybBench={hy,view:prev?prev.view:'flow',trail:[],mode:prev?prev.mode:'auto',soc:prev?prev.soc:HYB_SOC,hold:prev?prev.hold:HYB_SOC,cmd:prev?prev.cmd:0,neSet:prev?prev.neSet:0,
    n:hy.mode!=='p2'?0:engine.idleRpmEff,engOn:true,thrE:state.throttle,Te:0,Tm:0,T1:0,ns:0,ne:engine.idleRpmEff,
    Pe:0,Pm:0,P1:0,Pb:0,Psys:0,mT:{w:tc,c:tc,r:tc},tB:{b:PACK_COOLANT},lowFlash:0};
  state.rpm=engine.idleRpmEff;
  return hybBench;
}
// The engine's full-load curve at design conditions (what the controller plans on), cached per build.
function hybEngTq(rpm){
  const hy=engine.hy;
  if(!hy._eng||hy._eng.score!==engine.score)hy._eng={score:engine.score,c:buildTorqueCurve()};
  const c=hy._eng.c;
  if(rpm<=c[0].rpm)return c[0].tq;
  for(let i=1;i<c.length;i++)if(rpm<=c[i].rpm)return c[i-1].tq+(c[i].tq-c[i-1].tq)*(rpm-c[i-1].rpm)/(c[i].rpm-c[i-1].rpm);
  return c[c.length-1].tq;
}
// The motor's most torque (Nm, negative braking) for the electrical power Pin it may draw (W), on its envelope.
function hybMotorFor(hy,n,Pin,temp){
  const m=hy.motor,V=hybBusV(hy),Tm=motorMaxTorque(m,Math.max(n,1),V,60),w=n*Math.PI/30;
  const need=t=>t*w+motorLosses(m,Math.abs(t),Math.max(n,1),V,temp).total;
  if(need(Tm)<=Pin)return Tm;
  if(need(-Tm)>Pin)return -Tm;
  let lo=-Tm,hi=Tm;for(let k=0;k<26;k++){const mid=(lo+hi)/2;if(need(mid)>Pin)hi=mid;else lo=mid;}
  return lo;
}
// The engine's own throttle in place of the pedal, for the engine code the bench calls.
function withEngThr(H,fn){const p=state.throttle;state.throttle=H.thrE;try{return fn();}finally{state.throttle=p;}}
// The dyno brake on the bench's shaft: LOAD sets a hold speed between the shaft's top and its floor, and the brake
// pushes back above it (brakeTorque's law, scaled to the shaft's speed range and torque).
function hybBrakeAt(n,nMax,nMin,ref){
  if(state.load<=0.001)return 0;
  const target=nMax-state.load*(nMax-nMin),over=n-target,gain=ref/(220*nMax/engine.redline);
  return over>0?Math.min(over*gain,ref*3):0;
}
// The controller: from the pedal, the mode and the charge, whether the engine runs, what it is asked for, and the motor's
// torque (P2) or MG2's (power-split) before the pack's limits.
function hybControl(H,dt){
  const e=engine,hy=e.hy,B=HYB_BENCH,ps=hy.mode!=='p2',p=state.throttle,mode=H.mode,n=H.n,w=Math.max(n,1)*Math.PI/30;   // ps: the traction motor's shaft (a power-split, or a series hybrid, build 193)
  const pack=hy.pack,Pmax=packMaxPower(pack,clamp(H.soc,0.05,1)),Pchg=pack.pChargeMax;
  // the HYBRID TUNE (build 192): its charge window, electric-driving power, regeneration and load-point shifting
  const tu=hybTune(e),lo=tu.socLo/100,hi=tu.socHi/100,kRegen=(HYB_REGEN[tu.regen]||HYB_REGEN.high).k;
  // what the shaft can have flat out, and what the pedal asks of it
  let full,TmMax;
  if(ps){const c=hybCurves(),R=c.eng,i=Math.min(R.length-1,Math.max(0,Math.round(n/Math.max(1,R[1].rpm-R[0].rpm))));full=R[i].tq+c.mot[i];TmMax=motorMaxTorque(hy.motor,Math.max(n,1),hybBusV(hy),60);}
  else{TmMax=hybMotorTq(hy,n);full=hybEngTq(Math.max(n,e.idleRpmEff))+TmMax;}
  const D=(mode==='ev'?TmMax:full)*p,Pd=D*w;
  // the charge the mode wants, and the engine
  if(mode==='hold'&&H.lastMode!=='hold')H.hold=H.soc;
  H.lastMode=mode;
  const socT=mode==='charge'?hi:mode==='hold'?H.hold:tu.socT/100;
  // a plug-in with charge to spare drives on it (build 194): electric up to all the motor and pack give, the motor helping
  const deplete=e.hyPlug&&(mode==='auto')&&H.soc>tu.socT/100+0.02;
  const Pev=deplete?Math.min(Pmax,motorMaxTorque(hy.motor,Math.max(n,1000),hybBusV(hy),60)*Math.max(n,1000)*Math.PI/30):tu.evKw>0?tu.evKw*1000:B.evShare*Math.min(Pmax,motorMaxTorque(hy.motor,Math.max(n,1000),hybBusV(hy),60)*Math.max(n,1000)*Math.PI/30);
  let on=H.engOn;
  if(mode==='ev'){on=H.soc<lo;if(on&&!H.lowFlash){H.lowFlash=1;flash(tr('PACK LOW • ENGINE STARTED'),'warn');}if(!on)H.lowFlash=0;}
  else if(mode==='auto'||mode==='hold'){
    const low=H.soc<socT-0.1;
    // a hysteresis band: the engine starts past the motor's share and stops only well below it (a depleting plug-in's band
    // is narrow, so it stops as soon as the motor can clearly do it), and once it has started or stopped it stays so for
    // B.dwell seconds unless the charge is low (build 198). Without both, a demand at the threshold flips the engine every
    // frame: starting, it drags the shaft down for a moment, which takes the demand back under the threshold.
    const want=p>0.01&&(Pd>(on?(deplete?0.9:0.7):1)*Pev||low)||H.soc<lo;
    on=want===on||H.soc<lo||(H.dwell||0)>=B.dwell?want:on;
  }else on=true;
  if(on!==H.engOn)H.dwell=0;else H.dwell=(H.dwell||0)+dt;
  H.engOn=on;
  // the charging power the controller asks of the engine (W, + charging), from how far the charge is from its target
  let Pc=mode==='charge'?(H.soc<hi?B.chargeShare*Pchg:0):clamp((socT-H.soc)/0.1,-1,1)*B.chargeShare*Pchg;
  if(!tu.lps&&mode!=='charge'&&H.soc>=lo)Pc=Math.min(0,Pc);
  if(deplete)Pc=-B.chargeShare*Pchg;   // no load-point shifting: the engine charges only a low pack
  const pedalThr=mode==='sport'||mode==='engine'||mode==='manual';
  if(ps){
    const nr=n/PS.k2,R=psEngineRange(hy,nr),O=psOol();
    if(on){
      let ne;
      if(mode==='manual')ne=H.neSet||e.idleRpmEff;
      else if(mode==='sport')ne=psEngineRpmAt(n);
      else if(mode==='engine')ne=psOolAt(Math.max(O.P[0],p*O.Pmax)).ne;
      else{const Pe=clamp(Pd+Pc,O.P[0],O.Pmax);H.PeWant=Pe;ne=psOolAt(Pe).ne;}
      // never held on the redline: the ECU keeps the engine under the over-rev margin (stepWear wears it past 98.5%)
      const neHi=Math.min(R.hi,e.redline*HYB_BENCH.neMax);
      H.neT=clamp(ne,Math.max(R.lo,e.idleRpmEff),Math.max(neHi,e.idleRpmEff));
    }
    H.TeWant=on&&!pedalThr?(H.PeWant||0)/Math.max(1,H.neT*Math.PI/30):null;
  }else{
    H.TeWant=on&&!pedalThr?clamp(D+Pc/w,0,hybEngTq(Math.max(n,e.idleRpmEff))):null;
  }
  // the engine's throttle: the pedal, or the ECU closing on the torque asked of it
  if(!on)H.thrE=0;
  else if(pedalThr)H.thrE=p;
  else{const ref=Math.max(20,e.score.peakTQ);H.thrE=clamp(H.thrE+dt*4*(H.TeWant-H.Te)/ref,0,1);}
  // the motor's torque before the pack's limits
  const Tring=ps&&on?H.Te*hybGear(hy,state.rpm,n).kr:0,TeShaft=ps?Tring:(on?H.Te:0);
  // a P2's help to the engine within ASSIST's window and the assist map at this speed and pedal (the tune)
  const help=ps?TmMax:TmMax*hybAssistWindow(e,n)*hybAssistShare(n/e.redline,p,tu);
  if(mode==='manual')H.TmWant=H.cmd>=0?H.cmd*TmMax:H.cmd*Math.min(TmMax,Pchg/w)*kRegen;
  else if(mode==='engine')H.TmWant=ps?null:0;   // null: MG2 passes on what MG1 makes
  else if(mode==='sport')H.TmWant=p*help;
  else H.TmWant=on&&!ps?Math.min(D-TeShaft,help):D-TeShaft;
  return {Pmax,Pchg};
}
// One bench step for a hybrid, in place of stepEngine.
function stepHybridBench(dt){
  const e=engine,hy=e.hy,H=hybBenchState(),B=HYB_BENCH,ps=hy.mode!=='p2',m=hy.motor,pack=hy.pack;
  const lim=hybControl(H,dt);
  // the engine's air path and torque at its own throttle; off, it coasts to a stop with its manifold at the air
  if(H.engOn){
    withEngThr(H,()=>{stepBoost(dt);state.map+=(mapTarget()-state.map)*(1-Math.exp(-MAP_K*e.intakeRespK*dt));});
    const cut=state.rpm>=e.redline||withEngThr(H,overrunFuelCut);
    H.Te=withEngThr(H,()=>brakeTorqueRaw(Math.max(state.rpm,e.idleRpmEff),state.map,cut));
  }else{H.Te=0;state.map+=(1-state.map)*(1-Math.exp(-MAP_K*dt));}
  const tc=m.cool.tCool,temp=H.mT,w0=Math.max(H.n,1)*Math.PI/30;
  // MG1 (power-split): the engine's speed and its reaction
  let P1=0;
  if(ps){
    if(H.engOn){state.rpm+=(H.neT-state.rpm)*(1-Math.exp(-dt/B.neTau));state.rpm=clamp(state.rpm,e.idleRpmEff,e.redline);}
    else state.rpm=Math.max(0,state.rpm-4000*dt);
    H.ne=state.rpm;const G=hybGear(hy,H.ne,H.n);H.ns=G.ns;
    const Ts=H.engOn?H.Te*G.ks:0;H.T1=Ts;
    P1=H.engOn&&Ts!==0?psMg1Elec(hy,Ts,H.ns,{w:tc+20,c:tc+15,r:60}):0;
  }
  // the motor within what the pack can give and take: discharging no more than its limit, charging no more than it
  // takes, with the 12 V load and MG1's power on the same bus
  const PinMax=lim.Pmax+P1-B.auxW,PinMin=-lim.Pchg+P1-B.auxW;
  let Tm=H.TmWant==null?hybMotorFor(hy,H.n,P1-B.auxW,temp):H.TmWant;
  Tm=Math.min(Tm,hybMotorFor(hy,H.n,H.soc>0.02?PinMax:P1-B.auxW,temp));
  Tm=Math.max(Tm,hybMotorFor(hy,H.n,H.soc<0.98?PinMin:P1-B.auxW,temp)*(H.n>5?1:0));
  const V=hybBusV(hy),L=motorLosses(m,Math.abs(Tm),Math.max(H.n,1),V,temp);
  const Pm=Tm*w0+(Tm!==0||H.n>0?L.total:0);
  const Pbus=Pm-P1+B.auxW,d=packDraw(pack,H.soc,Pbus)||packDraw(pack,H.soc,Math.min(Pbus,lim.Pmax))||{I:0,V:packOcv(pack,H.soc),heat:0};
  H.soc=clamp(H.soc-d.I*dt/(pack.Ah*3600),0,1);
  motorHeatStep(m,temp,L,dt);packHeatStep(pack,H.tB,d.heat,dt);
  H.Tm=Tm;H.Pm=Tm*w0/1000;H.P1=P1/1000;H.Pb=d.V*d.I/1000;
  // the shaft
  const drag=H.n>1?L.mech/w0:0;
  if(ps){
    const Tring=H.engOn?H.Te*hybGear(hy,H.ne,H.n).kr:0,ref=Math.max(50,Math.max(...hybCurves().eng.map(q=>q.tq))),J=m.J+0.02;
    const hMax=0.5*J*Math.PI/(30*ref/(220*m.nMax/e.redline)),ns=Math.max(1,Math.ceil(dt/hMax)),h=dt/ns;
    for(let k=0;k<ns;k++){const om=H.n*Math.PI/30+(Tring+Tm-drag-hybBrakeAt(H.n,m.nMax,0,ref))/J*h;H.n=clamp(om*30/Math.PI,0,m.nMax);}
    H.Tshaft=Tring+Tm;
  }else if(H.engOn){
    // the clutch closed: the engine and the motor turn the shaft together, never below the engine's idle
    if(H.n<e.idleRpmEff)H.n=e.idleRpmEff;
    const J=e.inertia+m.J,ref=e.loadRefTq,hMax=0.5*J*Math.PI/(30*e.brakeGain),ns=Math.max(1,Math.ceil(dt/hMax)),h=dt/ns;
    for(let k=0;k<ns;k++){const om=H.n*Math.PI/30+(H.Te+Tm-drag-hybBrakeAt(H.n,e.redline,e.idleRpmEff,ref))/J*h;H.n=clamp(om*30/Math.PI,e.idleRpmEff,e.redline);}
    state.rpm=H.n;H.ne=H.n;H.Tshaft=H.Te+Tm;
  }else{
    // the clutch open: the motor alone; the engine runs down to a stop
    const J=m.J+0.05,ref=e.loadRefTq,hMax=0.5*J*Math.PI/(30*e.brakeGain),ns=Math.max(1,Math.ceil(dt/hMax)),h=dt/ns;
    for(let k=0;k<ns;k++){const om=H.n*Math.PI/30+(Tm-drag-hybBrakeAt(H.n,e.redline,e.idleRpmEff,ref))/J*h;H.n=clamp(om*30/Math.PI,0,Math.min(e.redline,m.nMax));}
    state.rpm=Math.max(0,state.rpm-4000*dt);H.ne=state.rpm;H.Tshaft=Tm;
  }
  H.Pe=H.engOn?H.Te*Math.max(H.ne,1)*Math.PI/30/1000:0;
  H.Psys=H.Tshaft*Math.max(H.n,0)*Math.PI/30/1000;
  state.systemVoltage=14.0;   // the 12 V side runs off the pack through a DC-DC converter
}
// The engine's live figures for a hybrid: as the combustion bench's at the engine's own throttle, or nothing when it is off.
function hybUpdatePhysics(run){
  const H=hybBenchState();
  if(!H.engOn||state.rpm<engine.idleRpmEff*0.5){
    state.torque=0;state.powerKW=0;state.powerHP=0;state.fuelFlowLph=0;state.bsfc=999;state.thermalEff=0;state.knockRisk=0;state.fuelCut=true;
    return;
  }
  withEngThr(H,run);
}
const hybBenchEngineOff=()=>isHybrid()&&hybBench&&hybBench.hy===engine.hy&&!hybBench.engOn&&state.rpm<engine.idleRpmEff*0.5;

// ---- the LIVE tab's hybrid panel: the power-flow diagram, the battery gauge, the drive mode and the manual controls ----
// Colours (decision 17): orange the engine driving, blue the pack driving, green regeneration, purple the engine charging.
const HYB_FLOW_COL={eng:'#ff9a3c',bat:'#4aa3ff',regen:'#00ff88',charge:'#b48cff',idle:'#3a3a4a'};
function updateHybridPanel(){
  const panel=document.getElementById('hybridPanel');if(!panel)return;
  const show=isHybrid()&&(vizMode==='engine'||vizMode==='dyno');
  panel.hidden=!show;if(!show)return;
  const H=hybBenchState(),hy=engine.hy,ps=hy.mode==='ps',ser=hy.mode==='series',g=id=>document.getElementById(id);
  // the gauge: the charge in its window, the pack's power and heat
  const soc=H.soc*100,fill=g('hySocFill');
  if(fill){fill.style.width=soc.toFixed(1)+'%';fill.style.background=H.soc<HYB_BENCH.socLo?'#ff5555':H.soc>HYB_BENCH.socHi?'#ffcc00':'#00ff88';}
  const meter=g('hySoc');if(meter)meter.setAttribute('aria-valuenow',Math.round(soc));
  const sl=g('hySocSet');if(sl&&document.activeElement!==sl)sl.value=Math.round(soc);
  if(g('valHySoc'))g('valHySoc').textContent=Math.round(soc);
  const pb=H.Pb;
  if(g('hyPack'))g('hyPack').textContent=tr('PACK')+' '+(Math.abs(pb)<0.05?'0.0 kW':(pb>0?tr('DISCHARGING')+' ':tr('CHARGING')+' ')+Math.abs(pb).toFixed(1)+' kW')+' • '+Math.round(H.tB.b)+'°C';
  if(g('hyReadout'))g('hyReadout').textContent=tr('ENGINE')+' '+(H.engOn?Math.round(H.ne)+' rpm '+H.Pe.toFixed(1)+' kW':tr('OFF'))+
    ' • '+(ps?'MG2':tr('MOTOR'))+' '+(H.Pm>=0?'+':'')+H.Pm.toFixed(1)+' kW'+(ps||ser?' • '+(ps?'MG1':tr('GEN'))+' '+(H.P1>=0?'+':'')+H.P1.toFixed(1)+' kW':'')+
    ' • '+tr('SHAFT')+' '+Math.round(H.n)+' rpm '+H.Psys.toFixed(1)+' kW';
  const ds=g('hyDrive');if(ds&&document.activeElement!==ds&&ds.value!==H.mode)ds.value=H.mode;
  panel.classList.toggle('manual',H.mode==='manual');panel.classList.toggle('ps',ps||ser);   // an engine-speed target for both (build 193)
  if(g('valHyCmd'))g('valHyCmd').textContent=Math.round(H.cmd*100);
  const ne=g('hyNe');if(ne){ne.max=engine.redline;if(!H.neSet)H.neSet=Math.round(engine.score.peakTQrpm||3000);if(document.activeElement!==ne)ne.value=H.neSet;}
  if(g('valHyNe'))g('valHyNe').textContent=Math.round(H.neSet);
  // the view (build 191): the power flow, the power-split's lever, or the engine's BSFC map with the operating point
  if(H.view==='lever'&&!ps)H.view='flow';
  const vs=g('hyView');if(vs){const lo=vs.querySelector('option[value="lever"]');if(lo)lo.disabled=!ps;if(document.activeElement!==vs&&vs.value!==(H.view||'flow'))vs.value=H.view||'flow';}
  hybTrailPush(H);
  if(H.view==='lever')drawHybridLever(H);else if(H.view==='map')drawHybridMap(H);else drawHybridFlow(H);
}
// The power-flow diagram: each part a box, each path an arrow as wide as the power on it, coloured by what it is doing.
function drawHybridFlow(H){
  const cv=document.getElementById('hyFlow');if(!cv)return;
  const dpr=window.devicePixelRatio||1,W=cv.clientWidth||300,Hh=Math.round(W*0.5);
  if(cv.width!==Math.round(W*dpr)||cv.height!==Math.round(Hh*dpr)){cv.width=Math.round(W*dpr);cv.height=Math.round(Hh*dpr);}
  const c=cv.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,W,Hh);c.fillStyle='#0a0a10';c.fillRect(0,0,W,Hh);
  const hy=engine.hy,ps=hy.mode==='ps',C=HYB_FLOW_COL,S=W/300,F=s=>Math.round(s*S)+"px 'Press Start 2P',monospace";
  const box=(x,y,w,h,label,sub,on)=>{c.fillStyle=on?'#161622':'#0e0e16';c.fillRect(x*S,y*S,w*S,h*S);c.strokeStyle=on?'#8a8aa0':'#3a3a4a';c.lineWidth=2*S/1.5;c.strokeRect(x*S,y*S,w*S,h*S);
    c.fillStyle=on?'#e0e0e0':'#666';c.font=F(6);c.textAlign='center';c.textBaseline='middle';c.fillText(label,(x+w/2)*S,(y+h/2-(sub?4:0))*S);
    if(sub){c.fillStyle='#ffcc00';c.font=F(5);c.fillText(sub,(x+w/2)*S,(y+h/2+6)*S);}};
  const ref=Math.max(10,(engine.score.peakKW||engine.score.peakHP*0.7457)+packMaxPower(hy.pack,HYB_SOC)/1000);
  // a path through points carrying kW (sign: + from the first point to the last), coloured col: as wide as its power,
  // its head and figure on its longest leg; grey and thin under 0.2 kW
  const flow=(pts,kw,col)=>{
    const a=Math.abs(kw),on=a>=0.2,wd=on?(1.5+7*Math.min(1,a/ref))*S:1;
    const P=(kw<0?pts.slice().reverse():pts).map(q=>[q[0]*S,q[1]*S]);
    c.strokeStyle=on?col:C.idle;c.lineWidth=wd;c.lineJoin='round';c.beginPath();c.moveTo(P[0][0],P[0][1]);for(const q of P.slice(1))c.lineTo(q[0],q[1]);c.stroke();
    if(!on)return;
    let k=0,best=0;for(let i=0;i<P.length-1;i++){const d=Math.hypot(P[i+1][0]-P[i][0],P[i+1][1]-P[i][1]);if(d>best){best=d;k=i;}}
    const [X1,Y1]=P[k],[X2,Y2]=P[k+1],ang=Math.atan2(Y2-Y1,X2-X1),fr=Math.abs(P[k+1][1]-P[k][1])>Math.abs(P[k+1][0]-P[k][0])?0.25:0.4,mx=X1+(X2-X1)*fr,my=Y1+(Y2-Y1)*fr,hd=Math.max(5*S,wd*1.4);
    c.fillStyle=col;c.beginPath();c.moveTo(mx+Math.cos(ang)*hd,my+Math.sin(ang)*hd);
    c.lineTo(mx+Math.cos(ang+2.5)*hd,my+Math.sin(ang+2.5)*hd);c.lineTo(mx+Math.cos(ang-2.5)*hd,my+Math.sin(ang-2.5)*hd);c.fill();
    const horiz=Math.abs(Y2-Y1)<Math.abs(X2-X1);
    c.font=F(5);c.fillStyle='#e0e0e0';c.textAlign=horiz?'center':'left';c.textBaseline=horiz?'bottom':'middle';
    c.fillText(a.toFixed(1),horiz?mx:mx+wd/2+3*S,horiz?my-wd/2-2*S:my);
  };
  const motCol=H.Pm>=0?(H.Pb>0.2?C.bat:C.eng):(H.engOn&&H.Pe>0.5?C.charge:C.regen);
  const batCol=H.Pb>=0?C.bat:(H.engOn&&H.Pe>0.5?C.charge:C.regen);
  if(hy.mode==='series'){
    // ENGINE - GENERATOR, then the bus to the MOTOR - BRAKE; the PACK on the bus between them (build 193)
    const Pmot=H.P1+H.Pb-HYB_BENCH.auxW/1000;
    flow([[62,37],[82,37]],H.engOn?H.Pe:0,C.eng);
    flow([[107,54],[107,82],[150,82]],H.P1,H.P1>=0?C.charge:C.bat);
    flow([[150,82],[189,82],[189,54]],Pmot,Pmot>=0?(H.Pb>0.2?C.bat:C.charge):C.regen);
    flow([[150,104],[150,84]],H.Pb,batCol);
    flow([[218,37],[238,37]],H.Psys,H.Psys>=0?motCol:C.regen);
    c.fillStyle='#ffcc00';c.fillRect(147*S,79*S,6*S,6*S);c.font=F(4.5);c.textAlign='left';c.textBaseline='bottom';c.fillStyle='#888';c.fillText(Math.round(hybBusV(hy))+' V',155*S,78*S);
    box(4,20,58,34,tr('ENGINE'),H.engOn?Math.round(H.ne)+' rpm':tr('OFF'),H.engOn);
    box(82,20,50,34,tr('GEN'),Math.round(H.T1)+' Nm',Math.abs(H.P1)>0.2);
    box(160,20,58,34,tr('MOTOR'),(H.Tm>=0?'+':'')+Math.round(H.Tm)+' Nm',Math.abs(H.Pm)>0.2);
    box(238,20,58,34,tr('BRAKE'),Math.round(H.n)+' rpm',H.n>1);
    box(124,104,52,30,tr('PACK'),Math.round(H.soc*100)+'%',Math.abs(H.Pb)>0.2);
  }else if(!ps){
    // ENGINE -clutch- MOTOR - BRAKE in a row, the PACK under the motor
    c.fillStyle=H.engOn?'#8a8aa0':'#3a3a4a';c.fillRect(104*S,28*S,3*S,18*S);c.fillRect((H.engOn?108:110)*S,28*S,3*S,18*S);
    c.font=F(4.5);c.textAlign='center';c.textBaseline='top';c.fillStyle='#888';c.fillText(tr(H.engOn?'CLOSED':'OPEN'),108*S,58*S);
    flow([[72,37],[118,37]],H.engOn?H.Pe:0,C.eng);
    flow([[182,37],[228,37]],H.Psys,H.engOn&&H.Pe>0.5?(H.Pm>0.2?C.bat:C.eng):(H.Psys>=0?C.bat:C.regen));
    flow([[150,100],[150,54]],H.Pb,batCol);
    box(8,20,64,34,tr('ENGINE'),H.engOn?Math.round(H.ne)+' rpm':tr('OFF'),H.engOn);
    box(118,20,64,34,tr('MOTOR'),(H.Tm>=0?'+':'')+Math.round(H.Tm)+' Nm',Math.abs(H.Pm)>0.2);
    box(228,20,64,34,tr('BRAKE'),Math.round(H.n)+' rpm',H.n>1);
    box(118,100,64,34,tr('PACK'),Math.round(H.soc*100)+'%',Math.abs(H.Pb)>0.2);
  }else{
    // the shafts in a row (ENGINE -> the planetary -> BRAKE), MG1 above the planetary, MG2 under the ring shaft; the
    // electrical bus down the middle joins MG1, MG2 and the PACK
    flow([[62,63],[98,63]],H.engOn?H.Pe:0,C.eng);
    flow([[150,63],[238,63]],H.Psys,H.engOn?C.eng:H.Psys>=0?C.bat:C.regen);
    flow([[222,96],[222,63]],H.Pm,motCol);
    flow([[148,17],[164,17],[164,109],[196,109]],H.P1,H.P1>=0?C.charge:C.bat);
    flow([[148,125],[164,125],[164,111]],-H.Pb,batCol);
    c.fillStyle='#ffcc00';c.fillRect(161*S,106*S,6*S,6*S);c.font=F(4.5);c.textAlign='left';c.textBaseline='top';c.fillStyle='#888';c.fillText(PS.busV+' V',168*S,126*S);
    box(4,46,58,34,tr('ENGINE'),H.engOn?Math.round(H.ne)+' rpm':tr('OFF'),H.engOn);
    box(98,46,52,34,'PSD','ρ '+PS.rho.toFixed(3),H.engOn);
    box(98,4,52,26,'MG1',Math.round(H.ns)+' rpm',Math.abs(H.P1)>0.2);
    box(238,46,58,34,tr('BRAKE'),Math.round(H.n)+' rpm',H.n>1);
    box(196,96,52,26,'MG2',(H.Tm>=0?'+':'')+Math.round(H.Tm)+' Nm',Math.abs(H.Pm)>0.2);
    box(96,112,52,26,tr('PACK'),Math.round(H.soc*100)+'%',Math.abs(H.Pb)>0.2);
  }
  c.textAlign='left';c.textBaseline='alphabetic';c.font=F(5);c.fillStyle='#888';
  c.fillText(tr((HYBRID_MODES[hy.mode]||{}).label||'')+' • '+tr(HYB_DRIVE[H.mode].label),6*S,(Hh/S-4)*S);
}
function bindHybridPanel(){
  const g=id=>document.getElementById(id);if(!g('hybridPanel'))return;
  g('hyDrive').addEventListener('change',e=>{if(!isHybrid())return;const H=hybBenchState();H.mode=e.target.value;flash(tr('DRIVE MODE')+' • '+tr(HYB_DRIVE[H.mode].label));});
  g('hySocSet').addEventListener('input',e=>{if(!isHybrid())return;hybBenchState().soc=clamp(+e.target.value/100,0,1);});
  g('hyCmd').addEventListener('input',e=>{if(!isHybrid())return;hybBenchState().cmd=clamp(+e.target.value/100,-1,1);});
  g('hyNe').addEventListener('input',e=>{if(!isHybrid())return;hybBenchState().neSet=+e.target.value;});
  g('hyView').addEventListener('change',e=>{if(!isHybrid())return;hybBenchState().view=e.target.value;});
}
