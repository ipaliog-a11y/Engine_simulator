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
  P0171:{t:'System too lean (bank 1)',        hold:2, why:'λ above 1.05 under boost: the LEAN/BOOST wear condition.'},
  P0300:{t:'Random/multiple cylinder misfire detected',hold:1, why:'The spark cannot fire every cycle (weak voltage past the dwell limit), or the valves float.'},
  P0420:{t:'Catalyst system efficiency below threshold (bank 1)',hold:10, why:'A warm engine with no working catalyst converts almost nothing.'},
  P0562:{t:'System voltage low',              hold:5, why:'The 12 V side is below 11.6 V while the engine runs.'}
};
const OBD_MISFIRE=0.02, OBD_MISFIRE_CAT=0.10;   // misfire share that sets P0300, and that flashes the MIL (game rules)
const OBD_CLEAN_CYCLES=3, OBD_MIN_RUN=20;       // clean cycles to put the MIL out; seconds a run needs to count as one
let obd={codes:{},timers:{},cycleSeen:{},runS:0,wasRunning:true,flash:false,open:false};
function obdReset(){obd.codes={};obd.timers={};obd.cycleSeen={};obd.runS=0;obd.wasRunning=obdRunning();obd.flash=false;}
function obdRunning(){
  if(isElectric())return false;
  if(isHybrid())return !!hybBenchState().engOn;
  return state.firing!==false&&!state.blown;
}
// The share of combustion events lost: spark (ignitionHealth) or a valve past float.
function obdMisfire(){
  if(engine.ci)return 0;
  let m=1-ignitionHealth(state.rpm);
  if(engine.floatRpm>0&&state.rpm>engine.floatRpm)m=Math.max(m,OBD_MISFIRE);
  return m;
}
// Which conditions are present right now, by code.
function obdConditions(){
  const on={};if(!obdRunning()||state.fuelCut)return on;
  const lam=state.afr/(engine.stoichAFR||14.7);
  if(!engine.ci&&state.knockRisk>KNOCK_TARGET+0.5)on.P0324=1;
  if(state.coolant>112)on.P0217=1;
  if(!engine.ci&&lam>1.05&&state.map>0.9)on.P0171=1;
  if(obdMisfire()>OBD_MISFIRE)on.P0300=1;
  if(!engine.ci&&(engine.catConv||0)<0.5&&state.coolant>=70)on.P0420=1;
  if(!engine.dcdc&&state.systemVoltage<11.6)on.P0562=1;
  return on;
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
  return {rpm:Math.round(state.rpm),load:Math.round(state.load*100),map:+state.map.toFixed(2),
    coolant:Math.round(state.coolant),lam:+(state.afr/(engine.stoichAFR||14.7)).toFixed(2),
    boost:+(state.boostActual||0).toFixed(2),volt:+state.systemVoltage.toFixed(1)};
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
      +tr('coolant')+' '+f.coolant+' °C • λ '+f.lam+' • '+tr('boost')+' '+f.boost+' bar • '+f.volt+' V</span></div>';
  });
  h+='<div class="btn-row"><button type="button" id="btnObdClear">'+esc(tr('CLEAR CODES'))+'</button></div>';
  box.innerHTML=h;
  document.getElementById('btnObdClear').addEventListener('click',()=>{obdClear();flash(tr('FAULT CODES CLEARED'));});
}
