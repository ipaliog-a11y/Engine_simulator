// ---- On-board diagnostics: fault codes and the check-engine lamp (build 309) ----
// The bench's ECU watches signals the simulation already computes and stores SAE J2012 / ISO 15031-6 generic codes, under
// the OBD-II rules (CARB, 13 CCR 1968.2): a fault seen once is PENDING; seen again on the next drive cycle it is CONFIRMED
// and lights the MIL. A misfire bad enough to damage the catalyst flashes the MIL at once. The MIL goes out after three
// drive cycles in a row that ran without the fault; the code stays stored as HISTORY until cleared. The first
// detection keeps a freeze frame. A drive cycle here is one engine run: from a start (or a build) to the next start.
// Read-only: nothing here changes a number the engine makes (limp modes are a later build).
// Each condition reuses a threshold the simulation already has; the hold times are game rules, as are the misfire
// rates (real ones are set per engine by its maker against emissions and catalyst temperature, 1968.2 (e)(3)).
const OBD_CODES={
  P0324:{t:'Knock control system error',      hold:1, why:'Knock is past what the ECU can hold off by retarding the spark (KNOCK_TARGET).'},
  P0217:{t:'Engine coolant over temperature', hold:2, why:'Coolant is above 112 °C, where the wear model starts charging OVERHEAT.'},
  P0171:{t:'System too lean (bank 1)',        hold:2, why:'λ above 1.05 under boost (the LEAN/BOOST wear condition), or the lambda sensor reads leaner than the ECU can hold.'},
  P0172:{t:'System too rich (bank 1)',        hold:2, why:'The lambda sensor reads richer than the ECU can hold at part load.'},
  P0300:{t:'Random/multiple cylinder misfire detected',hold:1, why:'The spark cannot fire every cycle (weak voltage past the dwell limit), the valves float, or the mixture is past its flammability limit.'},
  P0420:{t:'Catalyst system efficiency below threshold (bank 1)',hold:10, why:'A warm engine with no working catalyst converts almost nothing.'},
  P0562:{t:'System voltage low',              hold:5, why:'The 12 V side is below 11.6 V while the engine runs.'},
  P0326:{t:'Pre-ignition detected',           hold:1, why:'Mixture autoignites before spark (I >= 1.0) — retarding ignition timing cannot stop it.'},
  P0330:{t:'Cylinder over-pressure',          hold:1, why:'Peak cylinder pressure exceeds the structural ceiling (130 bar SI / 200 bar CI).'},
  P0196:{t:'Engine oil temperature over limit',hold:2, why:'Oil sump temperature is above 151 °C (OIL_WEAR_C), where oil film breakdown begins.'},
  P0524:{t:'Engine oil pressure too low',     hold:2, why:'Oil gallery pressure is below 0.8 bar while the engine runs.'},
  P0234:{t:'Turbocharger overboost / ECU boost cut',hold:1, why:'ECU knock limiter is pulling boost down to hold knock at the limit.'},
  P0299:{t:'Turbocharger underboost / cartridge failed',hold:1, why:'Turbocharger cartridge failed from sustained overspeed (>520 m/s tip speed) or compressor surge; boost collapsed to atmosphere.'}
};
const OBD_MISFIRE=0.02, OBD_MISFIRE_CAT=0.10;   // misfire share that sets P0300, and that flashes the MIL (game rules)
const OBD_CLEAN_CYCLES=3, OBD_MIN_RUN=20;       // clean cycles to put the MIL out; seconds a run needs to count as one
let obd={codes:{},timers:{},cycleSeen:{},runS:0,wasRunning:true,flash:false,open:false};
function obdReset(){obd.codes={};obd.timers={};obd.cycleSeen={};obd.runS=0;obd.wasRunning=obdRunning();obd.flash=false;if(typeof o2Loop!=='undefined'){o2Loop.trim=0;o2Loop.int=0;o2Loop.side=0;o2Loop.hist.length=0;o2Loop.seen=1;o2Loop.mv=null;}}
function obdRunning(){
  if(isElectric())return false;
  if(isHybrid())return !!hybBenchState().engOn;
  return state.firing!==false&&!state.blown;
}
// The share of combustion events lost: spark (ignitionHealth), valve float, or extreme lean/rich mixture misfire.
function obdMisfire(){
  if(engine.ci)return 0;
  let m=1-ignitionHealth(state.rpm);
  if(engine.floatRpm>0&&state.rpm>engine.floatRpm)m=Math.max(m,OBD_MISFIRE);
  if(typeof mixtureMisfireFrac==='function'){
    const lam=state.afr/(engine.stoichAFR||14.7);
    m=Math.max(m,mixtureMisfireFrac(lam));
  }
  return m;
}
// Which conditions are present right now, by code.
function obdConditions(){
  const on={};if(!obdRunning()||state.fuelCut)return on;
  const lam=state.afr/(engine.stoichAFR||14.7);
  if(!engine.ci&&state.knockRisk>KNOCK_TARGET+0.5)on.P0324=1;
  if(state.coolant>112)on.P0217=1;
  if(!engine.ci&&lam>1.05&&state.map>0.9)on.P0171=1;
  {const t=lambdaTrimFault(lam);if(t)on[t>0?'P0171':'P0172']=1;}
  if(obdMisfire()>OBD_MISFIRE)on.P0300=1;
  if(!engine.ci&&(engine.catConv||0)<0.5&&state.coolant>=70)on.P0420=1;
  if(!engine.dcdc&&state.systemVoltage<11.6)on.P0562=1;
  if(!engine.ci&&(state.preIgn||0)>=1.0)on.P0326=1;
  if((state.cylPmax||0)>(typeof cylPmaxLimit==='function'?cylPmaxLimit():130))on.P0330=1;
  if(state.oil>OIL_WEAR_C)on.P0196=1;
  if(state.oilP!=null&&isFinite(state.oilP)&&state.rpm>400&&state.oilP<0.8)on.P0524=1;
  if(engine.intake==='turbo'&&typeof knockBoostCutInfo==='function'&&knockBoostCutInfo()&&(state.boostActual||0)>0.1)on.P0234=1;
  if(engine.intake==='turbo'&&state.turboBlown)on.P0299=1;
  return on;
}
// ---- The lambda sensor (build 337) ----
// Narrowband (zirconia switching sensor, Bosch LSF): a Nernst cell between the exhaust and the air,
//   E = (R T / 4F) ln(pO2 air / pO2 exhaust),
// with its platinum electrode bringing the gas to equilibrium. Lean, the exhaust's O2 is the excess air's. Rich, there
// is none free and it is what CO + 1/2 O2 = CO2 leaves at the element's temperature, from the CO2/CO the water-gas
// balance gives (pipeProducts): Kp from dG = -282.4 + 0.0868 T kJ/mol (JANAF; -195.6 at 1000 K). So it reads ~0.9 V
// rich and under 0.1 V lean, with a step at lambda 1, and can only say which side the mixture is on. At lambda 1
// itself the cell is at 450 mV by convention (the set-point Bosch's controllers hold); LAMBDA_P_STOICH is that pO2.
// LAMBDA_T: the heated element, ~700 C (probable: Bosch quotes 650-780 C for the LSU).
// Wideband (Bosch LSU): a pump cell holds that Nernst cell at 450 mV and the pump current gives lambda itself, from
// 0.65 to air (Bosch Motorsport, LSU ADV data sheet).
const LAMBDA_T=973,LAMBDA_NERNST=8.314*LAMBDA_T/(4*96485),LAMBDA_P_STOICH=0.21*Math.exp(-0.45/LAMBDA_NERNST),LAMBDA_WIDE_MIN=0.65;
function lambdaSensorMv(lam){
  const y=engine.fuelHC!=null?engine.fuelHC:1.87,z=engine.fuelOC!=null?engine.fuelOC:0,aS=1+y/4-z/2;
  let p;
  if(lam>=1)p=LAMBDA_P_STOICH+aS*(lam-1)/(1+y/2+aS*(lam-1)+AIR_N2_PER_O2*aS*lam);
  else{
    const pr=pipeProducts(y,z,lam,1),co2=pr.co2/MW_CO2,co=pr.co/MW_CO,Kp=Math.exp((282400-86.8*LAMBDA_T)/(8.314*LAMBDA_T));
    p=co>1e-12?Math.min(LAMBDA_P_STOICH,Math.pow(co2/co/Kp,2)):LAMBDA_P_STOICH;
  }
  return 1000*LAMBDA_NERNST*Math.log(0.21/Math.max(1e-40,p));
}
// The wideband's own output is its pump current, Ip. Bosch Motorsport, Lambda Sensor LSU 4.9 data sheet (69034379, 2026):
// [Ip mA, lambda], monotonic from 0.65 to air; the ECU reads lambda back through the same table. Accuracy there:
// 0.80 +/- 0.01, 1.016 +/- 0.007, 1.70 +/- 0.05. Its heater (same sheet) starts at 8.5 V and ramps at most 0.4 V/s to
// 13 V, so the sensor is not ready for (13 - 8.5) / 0.4 = 11.25 s after start, plus a condensation phase the sheet leaves
// to the application (not modelled).
const LSU49_IP=[[-2.000,0.650],[-1.602,0.700],[-1.243,0.750],[-0.927,0.800],[-0.800,0.822],[-0.652,0.850],[-0.405,0.900],
  [-0.183,0.950],[-0.106,0.970],[-0.040,0.990],[0,1.003],[0.015,1.010],[0.097,1.050],[0.193,1.100],[0.250,1.132],[0.329,1.179],
  [0.671,1.429],[0.938,1.701],[1.150,1.990],[1.385,2.434],[1.700,3.413],[2.000,5.391],[2.150,7.506],[2.250,10.119]];
const LSU_READY_S=(13-8.5)/0.4;
function lambdaSensorIp(lam){
  const T=LSU49_IP;if(lam<=T[0][1])return T[0][0];if(lam>=T[T.length-1][1])return T[T.length-1][0];
  let i=1;while(T[i][1]<lam)i++;
  const a=T[i-1],b=T[i];return a[0]+(b[0]-a[0])*(lam-a[1])/(b[1]-a[1]);
}
function lambdaFromIp(ip){
  const T=LSU49_IP;if(ip<=T[0][0])return T[0][1];if(ip>=T[T.length-1][0])return 99;   // past the table: air
  let i=1;while(T[i][0]<ip)i++;
  const a=T[i-1],b=T[i];return a[1]+(b[1]-a[1])*(ip-a[0])/(b[0]-a[0]);
}
// ---- The closed fuel loop (trial) ----
// A real ECU never holds lambda still. It reads the sensor late: the charge burns about one cycle after it is metered
// (2 revs, 4-stroke), then the gas flows to the sensor, then the element answers. A narrowband sensor says only RICH or
// LEAN, so the ECU jumps its trim (P) and ramps it (I) the other way until the sensor flips: a limit cycle, lambda a few
// % either side of 1 and the voltage swinging ~0.1-0.9 V, ~1 Hz at idle and 2-3 Hz at cruise (Kiencke & Nielsen,
// Automotive Control Systems, ch. 4). A wideband one gives lambda itself, so a PI on the error settles with no cycle.
// O2_PIPE_VOL: valve-to-sensor volume, x displacement (probable: manifold + downpipe). O2_T_RATIO: exhaust over intake
// temperature, ~900 K / 300 K (probable). O2_SENSOR_TAU: element response (probable: Bosch quotes < 100 ms for LSF/LSU).
// O2_P, O2_I: jump and ramp of a narrowband trim (probable: no maker publishes a calibration).
// The narrowband element's own lag is on its voltage, slower falling than rising. Bosch LSF 4.2 (Bosch sensors catalogue
// 2022, "Type LSF-4.2"): 600 -> 300 mV in < 125 ms, 300 -> 600 mV in < 60 ms. A first-order lag between this model's
// ~850 and ~70 mV crosses those in 0.835 and 0.788 time constants, so tau <= 150 and <= 76 ms; the bounds are used.
// The same sheet gives 800 +/- 55 mV at lambda 0.97 and 50 +/- 30 mV at 1.10: the model gives 52 mV there, but 895 mV at
// 0.97, 40 mV over the band (open: a real electrode does not reach full equilibrium rich; not tuned).
const O2_PIPE_VOL=1.5,O2_T_RATIO=3,O2_SENSOR_TAU=0.1,O2_P=0.01,O2_I=0.05,O2_TRIM_MAX=0.25,O2_TAU_FALL=0.150,O2_TAU_RISE=0.076;
let o2Loop={live:false,on:true,trim:0,int:0,t:0,hist:[],seen:1,side:0,mv:null};
function o2LoopActive(){
  const s=engine.lambdaSensor;
  return o2Loop.on&&!!s&&s!=='none'&&!engine.ci&&engine.afrMode==='auto'&&!isElectric()&&obdRunning()&&!state.fuelCut&&
    (s!=='wide'||obd.runS>=LSU_READY_S)&&
    state.coolant>=70&&state.map<0.85*Math.max(1,wotMapAt(state.rpm));
}
function o2DeadTime(){
  const rps=Math.max(5,state.rpm/60),Vd=engine.displacement_L;
  const flow=Vd*rps*engine.chargesPerRev*Math.max(0.2,state.ve||0.8)*Math.max(0.2,state.map||0.4)*O2_T_RATIO;   // L/s of exhaust
  return 1/(rps*engine.chargesPerRev)+O2_PIPE_VOL*Vd/flow;   // one cycle late, then the pipe
}
// The voltage the sensor sends now: the loop's own reading while it runs, else the gas at the sensor.
function o2SensorMv(lam){return o2Loop.mv!=null&&o2LoopActive()?o2Loop.mv:lambdaSensorMv(lam);}
function o2LoopFactor(){return o2Loop.live&&o2Loop.on&&o2LoopActive()?1+o2Loop.trim:1;}
function o2LoopStep(dt){
  const L=o2Loop;L.dt=dt;
  if(!o2LoopActive()){L.trim=0;L.int=0;L.side=0;L.hist.length=0;L.seen=state.afr/(engine.stoichAFR||14.7);L.mv=null;return;}
  L.t+=dt;
  if(!L.hist.length)L.hist.push([L.t,L.seen]);
  const dTime=o2DeadTime();let late=L.hist[0][1];
  while(L.hist.length>1&&L.hist[1][0]<=L.t-dTime)L.hist.shift();
  if(L.hist[0][0]<=L.t-dTime)late=L.hist[0][1];
  L.seen+=(late-L.seen)*(1-Math.exp(-dt/O2_SENSOR_TAU));   // the element's own lag
  if(engine.lambdaSensor==='narrow'){
    const v=lambdaSensorMv(late);if(L.mv==null)L.mv=v;
    L.mv+=(v-L.mv)*(1-Math.exp(-dt/(v<L.mv?O2_TAU_FALL:O2_TAU_RISE)));   // what the ECU reads
    const side=L.mv>450?1:-1;                                // rich: lean it off
    if(side!==L.side){L.trim+=side*O2_P;L.side=side;}
    L.trim+=side*O2_I*dt;
  }else{
    // wideband PI, SIMC-tuned on the dead time (Skogestad 2003: Kc = tau/(theta+tc), Ti = min(tau, 4(theta+tc)), tc = theta)
    const th=dTime,tau=O2_SENSOR_TAU,kc=tau/(2*th),ti=Math.min(tau,8*th);
    const target=mappedAFR(state.rpm,state.map)/engine.stoichAFR,e=lambdaFromIp(lambdaSensorIp(L.seen))/target-1;   // read through Ip
    const maxInt=O2_TRIM_MAX*ti/Math.max(1e-6,kc);
    L.int=clamp((L.int||0)+e*dt,-maxInt,maxInt);
    L.trim=-kc*(e+L.int/ti);
  }
  L.trim=clamp(L.trim,-O2_TRIM_MAX,O2_TRIM_MAX);
  const lam=curAFR(state.rpm,liveMap())/engine.stoichAFR*(1+L.trim);L.hist.push([L.t,lam]);   // what this frame burns
}
// What the sensor says of the tune: +1 too lean, -1 too rich, 0 fine or not judged. Judged only where the ECU runs
// closed loop: warm (70 C, as P0420) and below the band the factory map enriches in (85% of the full-load pressure,
// baseFuelLambda). A narrowband sensor can only hold lambda 1, so a mixture set anywhere else there (the AFR slider, a
// hand-edited fuel map) is a fault. A wideband one holds whatever the map asks, lean included, so its fault is the
// mixture missing the map's target (a wrong VE table). LAMBDA_TRIM, 3%, is a game rule, set above the factory map's own
// 1.02 at light load; a real ECU sets these codes when its fuel trim runs out, typically past 20-25%.
const LAMBDA_TRIM=0.03;
function lambdaTrimFault(lam){
  const s=engine.lambdaSensor;
  if(engine.ci||!s||s==='none'||state.coolant<70||state.map>=0.85*Math.max(1,wotMapAt(state.rpm)))return 0;
  const auto=engine.afrMode==='auto',target=auto?mappedAFR(state.rpm,state.map)/engine.stoichAFR:1;
  const stuck=s==='narrow'&&(!auto||fuelMapCustom)?lam-1:0;   // commanded off lambda 1 where only lambda 1 can be held
  const miss=auto?lam/target-1:0;                              // measured against commanded
  const e=Math.abs(stuck)>Math.abs(miss)?stuck:miss;
  return e>LAMBDA_TRIM?1:e<-LAMBDA_TRIM?-1:0;
}
// The LIVE tile: millivolts and the side for a narrowband sensor, lambda for a wideband one.
function updateLambdaTile(){
  const el=document.getElementById('statLambda');if(!el)return;
  const s=engine.lambdaSensor||'none',V=el.querySelector('.value'),U=el.querySelector('.unit');
  const run=obdRunning(),lam=state.fuelCut||!run?99:state.afr/(engine.stoichAFR||14.7);
  let cls='';
  if(s==='none'){V.textContent='—';U.textContent=tr('NO SENSOR');}
  else if(!run){V.textContent='—';U.textContent=tr(s==='wide'?'WIDEBAND':'NARROWBAND');}
  else{
    if(s==='wide'){
      if(obd.runS<LSU_READY_S){V.textContent='—';U.textContent=tr('HEATING');}
      else{const l=o2LoopActive()?o2Loop.seen:lam,ip=lambdaSensorIp(l);
        V.textContent=l>9?tr('AIR'):lambdaFromIp(ip).toFixed(2);U.textContent='λ • '+ip.toFixed(2)+' mA • '+tr('WIDEBAND');}
    }
    else{const mv=o2SensorMv(lam);V.textContent=Math.round(mv);U.textContent='mV • '+tr(mv>455?'RICH':mv<445?'LEAN':'STOICH');}
    if(!state.fuelCut&&lambdaTrimFault(lam))cls=' warning';
  }
  el.className='stat'+cls;
}
// A drive cycle ends: count clean cycles for the lit codes, drop pending ones the cycle did not see again.
function obdEndCycle(){
  if(obd.runS>=OBD_MIN_RUN)for(const k in obd.codes){
    const c=obd.codes[k];if(obd.cycleSeen[k])continue;
    if(c.status==='pending')delete obd.codes[k];
    else if(c.status==='confirmed'&&++c.clean>=OBD_CLEAN_CYCLES)c.status='history';
  }
  for(const k in obd.codes)obd.codes[k].newCycle=true;
  obd.cycleSeen={};obd.timers={};obd.runS=0;
}
function obdStep(dt){
  const run=obdRunning();
  if(run&&!obd.wasRunning)obdEndCycle();   // a start begins the next drive cycle
  obd.wasRunning=run;
  if(!run){obd.flash=false;return;}
  obd.runS+=dt;
  const on=obdConditions();
  for(const k in OBD_CODES){
    obd.timers[k]=on[k]?(obd.timers[k]||0)+dt:0;
    if(obd.timers[k]<OBD_CODES[k].hold||obd.cycleSeen[k])continue;
    obd.cycleSeen[k]=true;
    const c=obd.codes[k];
    if(!c||c.status==='history')obd.codes[k]={status:'pending',clean:0,newCycle:false,ff:obdFreezeFrame()};
    else{c.clean=0;if(c.status==='pending'&&c.newCycle)c.status='confirmed';}
  }
  obd.flash=obdMisfire()>OBD_MISFIRE_CAT;
  if(obd.flash&&obd.codes.P0300)obd.codes.P0300.status='confirmed';   // catalyst-damaging misfire: lit at once
}
function obdFreezeFrame(){
  const ff={rpm:Math.round(state.rpm),load:Math.round(state.load*100),map:+state.map.toFixed(2),
    coolant:Math.round(state.coolant),oil:Math.round(state.oil),lam:+(state.afr/(engine.stoichAFR||14.7)).toFixed(2),
    boost:+(state.boostActual||0).toFixed(2),volt:+state.systemVoltage.toFixed(1),
    pMax:Math.round(state.cylPmax||0),preIgn:+(state.preIgn||0).toFixed(2)};
  if(state.oilP!=null&&isFinite(state.oilP))ff.oilP=+state.oilP.toFixed(1);
  return ff;
}
// 'flash', 'on' (a confirmed code), 'pending' (only a scan tool would see it on a real car), or ''.
function obdLamp(){
  const v=Object.values(obd.codes);
  return obd.flash?'flash':v.some(c=>c.status==='confirmed')?'on':v.some(c=>c.status==='pending')?'pending':'';
}
function obdClear(){obd.codes={};obd.timers={};obd.cycleSeen={};obd.flash=false;renderObd();}
// The lamp row calls this each frame: the open list is redrawn only when a code or its status changes.
let obdSig='';
function obdRefresh(){const s=JSON.stringify(Object.entries(obd.codes).map(([k,c])=>k+c.status));if(s!==obdSig){obdSig=s;renderObd();}}
function toggleObd(){obd.open=!obd.open;renderObd();}
function renderObd(){
  const box=document.getElementById('obdPanel'),b=document.getElementById('lampFault');if(!box)return;
  box.hidden=!obd.open;if(b)b.setAttribute('aria-expanded',String(obd.open));
  if(!obd.open)return;
  const keys=Object.keys(obd.codes),st={pending:tr('PENDING'),confirmed:tr('CONFIRMED'),history:tr('HISTORY')};
  let h='<div class="obd-h">'+esc(tr('FAULT CODES'))+'</div>';
  if(!keys.length)h+='<div class="obd-none">'+esc(isElectric()?tr('No combustion engine: no OBD codes.'):tr('No codes stored.'))+'</div>';
  keys.forEach(k=>{
    const c=obd.codes[k],d=OBD_CODES[k],f=c.ff;
    h+='<div class="obd-code obd-'+c.status+'"><b>'+k+'</b> '+esc(tr(d.t))+' • '+st[c.status]+'<br>'+esc(tr(d.why))
      +'<br><span class="obd-ff">'+esc(tr('FREEZE FRAME'))+': '+f.rpm+' rpm • '+tr('load')+' '+f.load+'% • MAP '+f.map+' bar • '
      +tr('coolant')+' '+f.coolant+' °C • λ '+f.lam+' • '+tr('boost')+' '+f.boost+' bar • '+f.volt+' V'
      +(f.pMax?' • Pmax '+f.pMax+' bar':'')+(f.oilP!=null?' • '+tr('oil')+' '+f.oilP+' bar':'')+'</span></div>';
  });
  h+='<div class="btn-row"><button type="button" id="btnObdClear">'+esc(tr('CLEAR CODES'))+'</button></div>';
  box.innerHTML=h;
  document.getElementById('btnObdClear').addEventListener('click',()=>{obdClear();flash(tr('FAULT CODES CLEARED'));});
}
