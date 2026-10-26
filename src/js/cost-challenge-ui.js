// ---- Strategy layer: what the build costs (parts $) ----
// Rough per-part pricing so budget challenges and hp-per-dollar have meaning. Values are
// ballpark "build" money, not a real quote — tuned so a sensible street build lands in a
// believable range and exotic choices (big turbos, ITBs, race cams) cost real money.
function computeCost(){
  let c=900*engine.cylinders+350*engine.displacement_L;          // block, machining, internals
  c+={petrol4:0,diesel:2500,twostroke:-400,rotary:1200}[engine.type]||0;  // cycle-specific build cost
  c+={inline:0,v:700,boxer:1100,rotary:0}[engine.layout]||0;
  if(engine.redline>7500)c+=(engine.redline-7500)*0.9;           // high-rpm valvetrain/internals
  if(engine.compression>11)c+=(engine.compression-11)*250;       // forged high-compression pistons
  if(engine.intake==='turbo'){
    c+=({small:1200,medium:1800,large:2600}[engine.turboSize]||1800)*({single:1,twin:1.8,sequential:2.6,compound:3.0}[engine.turboConfig]||1)
       *(engine.vgt?1.7:1);   // a vane ring, its bearings and an actuator, in nickel alloy
    if(engine.antilag)c+=700;
  }else if(engine.intake==='supercharger'){
    c+={roots:2200,screw:3200,centrifugal:2600}[engine.scType]||2200;
  }
  if(engine.intake!=='na'){
    c+={none:0,small:450,large:950}[engine.intercooler]||0;
    c+=engine.boost_bar*900;                                     // fuelling/plumbing for boost
  }
  c+={none:0,small:500,large:900}[engine.nitrous]||0;
  c+={stock:0,sport:550,race:1400}[engine.exhaust]||0;
  c+={none:0,sport:500,stock:300}[engine.cat]||0;
  c+={carb1:200,carb2:350,carb4:600,sidedraft:1400,mech:1900,efi:1200,itb:2600}[engine.intakeSys]||0;
  c+={none:0,perf:200,stock:60,restrictive:30}[engine.airFilter]||0;
  c+={stock:0,sport:700,race:1600}[engine.cam]||0;
  if(engine.vvt)c+=1200;
  if(engine.injector==='direct')c+=900;
  c+={distributor:150,wasted:400,coil:900}[engine.ignitionType]||0;
  if(engine.timingMode==='auto')c+=600;
  c+={gasoline:0,race:0,e85:300,methanol:500}[engine.fuel]||0;
  c+={small:200,stock:400,large:800}[engine.radiator]||0;
  c+={none:0,mechanical:150,electric:350}[engine.fan]||0;
  if(engine.oilCooler)c+=500;
  c+={'60':150,'120':250,'180':450}[engine.alternator]||0;
  return Math.max(500,Math.round(c/50)*50);   // round to nearest $50
}
// A lap time for scoring, cached on the engine + vehicle build so it isn't re-solved on every
// frame or every slider nudge. Solving the Nordschleife takes ~100 ms, which is fine once but not
// sixty times a second.
let lapScoreCache={key:'',val:null};
function lapFor(circuit){
  if(!engine.score||!vehicle||!vehicle.mass||!TRACKS[circuit])return null;
  const key=buildRev+'|'+vehRev+'|'+circuit;
  if(lapScoreCache.key===key)return lapScoreCache.val;
  let val=null;
  try{const L=simulateLap(circuit);val=L?L.lap:null;}catch(e){val=null;}
  lapScoreCache={key,val};
  return val;
}
// Metrics available to a challenge objective (score + cost + derived power-per-dollar). A lap
// time is only solved when the active objective actually asks for one.
function buildMetrics(ch){
  const s=engine.score||{};
  const totalCost=(engine.cost||0)+((vehicle&&vehicle.cost)||0);
  const m={peakHP:s.peakHP||0,hpPerL:s.hpPerL||0,peakTQ:s.peakTQ||0,nmPerL:s.nmPerL||0,
    thEff:s.thEff||0,emissions:s.emissions||0,safety:s.safety||0,drive:s.drive||0,band:s.band||0,
    reliability:s.reliability||0,grade:s.overall||0,cost:engine.cost||0,buildCost:totalCost,
    hpPerK:engine.cost>0?+((s.peakHP||0)/(engine.cost/1000)).toFixed(1):0};
  if(ch&&ch.circuit){
    const t=lapFor(ch.circuit);
    m.lap=t!=null?+t.toFixed(2):9999;      // 9999 = no car yet, so the target simply reads as unmet
  }
  return m;
}
function evalChallenge(ch,m){
  const results=(ch.targets||[]).map(t=>{
    const v=m[t.key],pass=t.op==='<='?v<=t.t:v>=t.t;
    return {label:t.label,v,t:t.t,op:t.op,unit:t.unit||'',pass};
  });
  // A track objective is about the whole car, so its budget covers engine + vehicle; an
  // engine-only objective keeps costing just the engine, as before.
  const spend=ch.circuit?m.buildCost:m.cost;
  const budgetPass=ch.budget?spend<=ch.budget:true;
  return {results,budgetPass,cost:spend,budget:ch.budget||0,pass:results.every(r=>r.pass)&&budgetPass};
}
function fmtCost(v){return '$'+Math.round(v).toLocaleString();}
// Build names are typed by the user and can also arrive from a .pes.json file or a share link,
// and they end up inside innerHTML. Escape them at the boundary rather than trusting the source.
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function renderChallenge(){
  const el=document.getElementById('challengeCard');
  if(!el)return;
  const ch=CHALLENGES.find(c=>c.id===activeChallenge)||CHALLENGES[0];
  const m=buildMetrics(ch);
  const relCol=m.reliability>=75?'#00ff88':m.reliability>=50?'#ffcc00':'#ff6666';
  let html='<div class="ch-desc">'+chDesc(ch)+'</div>';
  html+='<div class="ch-stats"><span>'+tr('COST')+' <b>'+fmtCost(ch.circuit?m.buildCost:m.cost)+'</b>'+(ch.circuit?' <i>'+tr('car')+'</i>':'')+'</span>'
    +'<span>'+tr('REL')+' <b style="color:'+relCol+'">'+m.reliability+'</b></span>'
    +'<span><b>'+m.hpPerK+'</b> hp/$1k</span></div>';
  if(ch.circuit){
    const T=TRACKS[ch.circuit];
    html+='<div class="ch-hint">'+tr('Timed on')+' <b>'+(T?T.label:ch.circuit)+'</b> — '+tr('build the car on the VEHICLE tab')+'</div>';
  }
  if((ch.targets&&ch.targets.length)||ch.budget){
    const ev=evalChallenge(ch,m);
    if(ch.budget){
      const over=m.cost>ch.budget,frac=clamp(m.cost/ch.budget,0,1.15);
      html+='<div class="ch-budget"><div class="ch-bud-lbl">'+tr('BUDGET')+' '+fmtCost(m.cost)+' / '+fmtCost(ch.budget)+(over?' — '+tr('OVER'):'')+'</div>'
        +'<div class="ch-bar"><div class="ch-bar-fill" style="width:'+Math.min(100,frac*100)+'%;background:'+(over?'#ff4444':'#00ff88')+'"></div></div></div>';
    }
    ev.results.forEach(r=>{
      // A lap reads far better as 1:16.70 than as 76.7 — and 9999 means "no car yet".
      const isLap=r.unit==='s'&&/lap/i.test(r.label);
      const val=isLap?(r.v>=9999?'—':fmtLap(r.v))
        :(typeof r.v==='number'?(Number.isInteger(r.v)?r.v:r.v.toFixed(1)):r.v);
      const tgt=isLap?fmtLap(r.t):r.t+r.unit;
      html+='<div class="ch-tgt '+(r.pass?'ok':'no')+'">'+(r.pass?'✓':'✗')+' '+tr(r.label)+': <b>'+val+(isLap?'':r.unit)+'</b> <span>('+tr('need')+' '+(r.op==='<='?'≤':'≥')+' '+tgt+')</span></div>';
    });
    html+='<div class="ch-verdict '+(ev.pass?'pass':'fail')+'">'+(ev.pass?'✓ '+tr('CHALLENGE PASSED'):'✗ '+tr('NOT MET YET'))+'</div>';
  }else{
    html+='<div class="ch-hint">'+tr('Pick an objective above to set targets, or keep building freely.')+'</div>';
  }
  el.innerHTML=html;
}
function updateEngineLabels(){
  const disp=engine.displacement_L.toFixed(engine.displacement_L<1?2:1);
  const boostTxt=engine.intake==='na'?'NA':tr(engine.intake.toUpperCase())+' '+engine.boost_bar.toFixed(1)+'bar';
  const unit=engine.type==='rotary'?engine.cylinders+tr('-ROTOR'):engine.cylinders+tr('-CYL')+' '+tr(LAYOUT_LABEL[engine.layout]);
  const fuelTag=engine.ci?tr('DIESEL'):engine.octane+'RON';
  const typeTag={petrol4:'',diesel:'DIESEL',twostroke:'2-STR',rotary:'ROTARY'}[engine.type];
  document.getElementById('subtitle').textContent=
    (typeTag?tr(typeTag)+' ':'')+unit+' • '+disp+'L • '+boostTxt+' • '+fuelTag;
  document.getElementById('engineCanvas').setAttribute('aria-label',
    tr('Test-bench schematic of a {d} litre {t} engine').replace('{d}',disp).replace('{t}',tr(ENGINE_TYPE[engine.type].label)));
  const nb=document.getElementById('btnNitrous');
  nb.disabled=engine.nitrous==='none';nb.classList.remove('on');nb.setAttribute('aria-pressed','false');
}
function updateDesignSummary(){
  const disp=engine.displacement_L.toFixed(engine.displacement_L<1?3:2);
  const specific=(engine.displacement_L>0? (state.powerHP/engine.displacement_L):0).toFixed(0);
  const note=(engine.layout==='v'||engine.layout==='boxer')?'<br><span style="color:#886">'+tr('Note:')+' '+tr(LAYOUT_LABEL[engine.layout])+' '+tr('bank visuals are simplified for now.')+'</span>':'';
  const unitWord=engine.type==='rotary'?(engine.cylinders+tr('-ROTOR')):(engine.cylinders+tr('-CYL')+' '+tr(LAYOUT_LABEL[engine.layout]));
  let induction;
  const icTxt=engine.intercooler==='none'?' ('+tr('no IC')+')':' ('+(engine.intercooler==='large'?'LG':'SM')+' IC)';
  if(engine.intake==='na')induction=tr('Naturally aspirated');
  else if(engine.intake==='turbo'){
    induction=tr(TURBO_CONFIG[engine.turboConfig].label)+' '+tr('TURBO')+' ('+tr(engine.turboSize.toUpperCase())+', A/R '+(engine.turbineAR||0).toFixed(2)+')'+(engine.vgt?' VGT':'')+(engine.antilag?' +ALS':'')+' @ '+engine.boost_bar.toFixed(2)+' bar'+icTxt+', '+tr('50% boost @')+' '+Math.round(engine.spool50)+' rpm';
    // Say plainly when the engine is asking the frame for more air than it is rated to move —
    // otherwise the power just quietly stops arriving and there is nothing to learn from.
    induction+='<br>'+tr('Compressor')+' '+Math.round(engine.turboFlow)+' '+tr('of')+' '+Math.round(engine.turboCap)+' '+tr('lb/min rated')+' ('+
      Math.round(engine.turboLoad*100)+'%) • '+Math.round(engine.compEff*100)+'% '+tr('efficient');
    if(engine.turboLoad>1)induction+=' • <span style="color:#ff5555">'+tr('OFF THE COMPRESSOR MAP — fit a bigger frame')+'</span>';
    else if(engine.turboLoad>0.9)induction+=' • <span style="color:#ffcc00">'+tr('at the limit of this frame')+'</span>';
    // The vane sweep in the units a turbine is actually specified in, plus the warning that is the
    // whole reason this is a diesel part: the vanes live in the gas stream.
    if(engine.vgtShut>0){
      induction+='<br>'+tr('Turbine throat')+' '+Math.round(engine.vgtShut*1e6)+'–'+Math.round(engine.turbineArea*1e6)+
        ' mm² ('+(engine.turbineArea/engine.vgtShut).toFixed(1)+':1 '+tr('vane sweep')+') • '+tr('gas at the vanes')+' '+
        Math.round(engine.peakEgt-273)+' °C';
      if(engine.peakEgtGas>VANE_T_LIMIT+1)
        induction+=' • <span style="color:#ffcc00">'+tr('above the vane material limit — it will not last')+'</span>';
    }
  }
  else induction=tr(SC_TYPE[engine.scType].label)+' S/C @ '+engine.boost_bar.toFixed(2)+' bar'+icTxt;
  if(engine.nitrous!=='none')induction+=' • <span style="color:#ff66cc">'+tr(engine.nitrous==='large'?'BIG NITROUS':'SMALL NITROUS')+'</span>';
  const dimLabel=engine.type==='rotary'?'rotor':'mm';
  const valveLine=engine.ports?'<br>'+tr('Induction ports')+' <b>'+tr('(no poppet valvetrain)')+'</b>':
    '<br>'+tr('Cam')+' <b>'+trOpt(engine.cam.toUpperCase())+(engine.vvt?' + VVT':'')+'</b>';
  const mixTxt=' • '+tr('Mixture')+' <b>'+tr(engine.afrMode==='auto'?'AUTO (ECU map)':'MANUAL')+'</b>';
  const ignTxt=tr(engine.ignitionType.toUpperCase());
  const sparkLine=engine.ci?
    '<br><b>'+tr('Compression ignition')+'</b> • <b>'+tr('Direct inj')+'</b> • '+tr('Diesel (cetane)')+mixTxt:
    '<br>'+(engine.injector==='direct'?'<b>'+tr('Direct inj')+'</b> • ':'')+tr('Ignition')+' <b>'+(engine.timingMode==='auto'?tr('AUTO (ECU)'):engine.ignitionAdv+'° '+tr('fixed'))+' '+ignTxt+'</b>'+mixTxt;
  const elecLine=engine.ci?
    '<br>'+tr('Electrical')+' <b>'+engine.altMaxA+'A '+tr('alt')+'</b> • '+tr('glow-plug start (no spark)'):
    '<br>'+tr('Electrical')+' <b>'+engine.altMaxA+'A '+tr('alt')+'</b> • '+tr('Ignition misfire above')+' <b>~'+engine.dwellLimit+'</b> rpm ('+ignTxt+')';
  document.getElementById('designSummary').innerHTML=
    '<b>'+tr(ENGINE_TYPE[engine.type].label)+'</b> • <b>'+unitWord+'</b>'+
    '<br><b>'+engine.cylinders+' × '+engine.bore_mm+'×'+engine.stroke_mm+dimLabel+'</b> → <b>'+disp+' L</b>'+
    '<br>'+tr('Compression')+' <b>'+engine.compression.toFixed(1)+':1</b> • '+tr('Redline')+' <b>'+engine.redline+'</b> rpm'+
    '<br>'+tr('Induction')+' <b>'+induction+'</b>'+
    '<br>'+tr('Intake')+' <b>'+tr(INTAKE_SYS[engine.intakeSys].label)+'</b> • '+tr('Filter')+' <b>'+tr(AIR_FILTER[engine.airFilter].label)+'</b>'+
    '<br>'+tr('Exhaust')+' <b>'+trOpt(engine.exhaust.toUpperCase())+'</b> • '+tr('Cat')+' <b>'+trOpt(CAT[engine.cat].label.split(' ')[0])+'</b>'+valveLine+
    '<br>'+tr('Fuel')+' <b>'+tr(FUELS[engine.fuel].label)+'</b> ('+(engine.ci?'CI':engine.effOctane+' '+tr('oct'))+', '+engine.stoichAFR.toFixed(1)+':1 '+tr('stoich')+(engine.chargeCool?', −'+engine.chargeCool+'°C '+tr('charge'):'')+')'+
    sparkLine+
    '<br>'+tr('Cooling')+' <b>'+trOpt(engine.radiator.toUpperCase())+' '+tr('RAD')+'</b> • <b>'+trOpt(engine.fan.toUpperCase())+' '+tr('FAN')+'</b>'+(engine.oilCooler?' • <b>'+tr('OIL COOLER')+'</b>':'')+' • '+tr('Thermostat')+' <b>'+engine.thermostat+'°C</b>'+
    elecLine+note+
    scoreLine(engine.score);
}
function scoreLine(s){
  if(!s)return'';
  const gc=s.overall>=76?'#00ff88':s.overall>=46?'#ffcc00':'#ff6666';
  const relCol=s.reliability>=75?'#00ff88':s.reliability>=50?'#ffcc00':'#ff6666';
  return '<br><span style="color:'+gc+'">'+tr('SCORE')+' <b>'+s.grade+' ('+s.overall+')</b></span> • '+s.peakHP+'hp @'+s.peakHPrpm+' • '+s.peakTQ+'Nm @'+s.peakTQrpm+
    '<br><span style="color:#889">'+s.hpPerL+'hp/L • '+tr('band')+' '+s.band+'rpm • '+tr('eff')+' '+s.thEff+'% • '+tr('safety')+' '+s.safety+' • '+tr('drive')+' '+s.drive+'% • '+tr('emit')+' '+s.emissions+'</span>'+
    '<br>'+tr('Cost')+' <b>'+fmtCost(engine.cost||0)+'</b> • '+tr('Reliability')+' <b style="color:'+relCol+'">'+(s.reliability||0)+'</b> • <b>'+(engine.cost>0?(s.peakHP/(engine.cost/1000)).toFixed(1):0)+'</b> hp/$1k'+
    scoreLapLine();
}
// Lap time is REPORTED on the scorecard, not folded into the letter grade. The grade rates the
// engine; a lap rates the whole car, and mixing them would make an engine's grade move when you
// changed the tyres. Shown for whichever circuit is selected on the TRACK tab.
function scoreLapLine(){
  if(!vehicle||!vehicle.mass)return '';
  const t=lapFor(trackKey);if(t==null)return '';
  const T=TRACKS[trackKey];
  return '<br><span style="color:#7fd">'+tr('Lap')+' <b>'+fmtLap(t)+'</b></span> <span style="color:#889">'+
    (T?T.label:'')+' • '+tr('car')+' '+fmtCost((engine.cost||0)+(vehicle.cost||0))+'</span>';
}

