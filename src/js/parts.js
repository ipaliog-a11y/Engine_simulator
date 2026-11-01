// ---- PARTS: the part designer (build 205; the intake manifold, build 206) ----
// A part is a physical thing with dimensions, designed on its own page, saved to a library in this browser and
// fitted on the ENGINE tab. The first kind was the EXHAUST. It needs no new physics: the three factory exhausts
// (EXHAUST in fuels-engine-types.js) were always only three sets of dimensions read by the breathing model
// (deriveGasDynamics, exhaustWaveP, scavengeGain, backPressureBar) and the sound (exhaustSound). A designed exhaust
// gives those same models its own dimensions instead:
//   construction   the header's spread in path length (sigma): a cast log manifold, an off-the-shelf tubular header,
//                  an equal-length header built on a jig; the same three spreads the factory exhausts carry;
//   primaries      diameter and length, in mm; on a turbo engine the length is set by packaging (as before) and
//                  the length here is not used;
//   system         the pipes after the collector: how many, their diameter, their length;
//   silencer       what it does to the sound (SILENCER in sound.js). Its own back-pressure is not modelled yet: a
//                  factory system's restriction is in its pipe (sysV), and so is a designed one's.
// The INTAKE MANIFOLD (build 206) is its runners, the other half of the breathing model, read by the integrated intake
// stroke (intakeFill, buildFillTable) and its tuning (intakeRamGain, helmholtzHz):
//   runners        length, plenum to head (the port in the head is added, as on the factory manifolds), and
//                  diameter; the factory runner is sized to the port behind it (THROAT_RATIO), a designed one need not;
//   variable       a second, shorter length opened by a flap, the fill table taking whichever fills better (a DISA,
//                  a VarioRam), as the factory VARIABLE manifold does with 460 and 150 mm.
// Not in it yet: the plenum's volume (the model takes the plenum as holding steady pressure) and the throttle.
// A build carries the full part (engine.exhaustPart, engine.intakePart), so a saved build, a file and a share link work in another
// browser that never saw the part; loading such a build adds the part to that browser's library.

const EXHAUST_BUILD={
  cast:   {label:'CAST MANIFOLD',      sigma:EXHAUST.stock.sigma,cls:'stock',cost:0},
  tubular:{label:'TUBULAR HEADER',     sigma:EXHAUST.sport.sigma,cls:'sport',cost:550},
  equal:  {label:'EQUAL-LENGTH HEADER',sigma:EXHAUST.race.sigma, cls:'race', cost:1400}
};
// the silencer, by the factory system whose silencer it is (SILENCER and GAS_SILENCER_HZ in sound.js)
const EXHAUST_SILENCER={
  chambered: {label:'CHAMBERED',              cls:'stock'},
  absorptive:{label:'STRAIGHT-THROUGH',       cls:'sport'},
  straight:  {label:'NONE (STRAIGHT PIPE)',   cls:'race'}
};
// What a part's numbers may be. The pipe diameter is the range the factory sizing clamps to (deriveGasDynamics);
// a primary is 200-1000 mm, past either end of the 350-900 mm a fabricator can route round an engine bay. A runner
// runs from a 40 mm stub (an ITB's trumpet) to 800 mm, past the factory LONG's 460.
const PART_LIMITS={primD_mm:[25,76],primL_mm:[200,1000],pipes:[1,2],sysD_mm:[30,110],sysL_m:[0.8,4.5],
  runnerL_mm:[40,800],runnerD_mm:[20,80],shortL_mm:[40,400],area_m2:[0.02,3],inletD_mm:[30,160]};

// ---- the air filter (build 210) ----
// What a filter restricts is its pressure drop at the flow through it, and the charge is that much thinner (computeVE).
// Two terms, each from a measured or a textbook law:
//   the media     Darcy's law: the drop goes with the face velocity, the flow over the media's (pleated) area. How much
//                 a medium passes is its air permeability, measured at 200 Pa (EN ISO 9237): Dziubak (Materials 13, 3498,
//                 2020) measured car intake papers at 540-685 m3/m2h, the lower one with a nanofibre layer; oiled cotton
//                 is its makers' claim, ~50% more than paper, there being no measured figure;
//   the housing   a velocity head, K (rho/2) v^2, at the inlet: an airbox's snorkel, bends and box (K ~3, entry, expansion
//                 and contraction losses together), or an open element's neck (K ~0.5, a plain entry).
// The flow is the engine's at its manifold pressure, as volume at ambient density (a turbo's filter passes its boost's
// worth). On a boosted engine the drop is taken off the charge the same way, which holds where the compressor is at its
// limit and overstates it where the wastegate could make it up.
const FILTER_MEDIA={
  paper: {label:'PAPER (CELLULOSE)',perm:685/3600},
  nano:  {label:'PAPER + NANOFIBRE',perm:540/3600},
  cotton:{label:'OILED COTTON',     perm:1.5*685/3600}
};
const FILTER_HOUSING={airbox:{label:'AIRBOX',K:3.0},open:{label:'OPEN ELEMENT',K:0.5},none:{label:'NONE (STACKS)',K:0}};
const FILTER_FACE_V=0.25;   // a factory element's face velocity at full flow (m/s): sizes its media area
const AIR_RHO0=1.2;
// The engine's flow through its filter (m3/s at ambient density): its displacement at this speed, filling, and the
// manifold pressure's worth of air.
const airFlowM3s=(rpm,map,ve)=>{const e=engine;return (e.displacement_L/1000)*(rpm/60)*(e.chargesPerRev||0.5)*ve*Math.max(0.1,map);};
// The full flow a factory filter is sized to: the most the engine draws, over its range, at the boost the ECU asks for
// there (its taper and its governor; the torque limit is solved later, on the finished engine).
function filterQref(e){
  let best=0;
  for(let r=1000;r<=e.redline;r+=100)
    best=Math.max(best,r*(e.intake==='na'?1:1+(e.boost_bar||0)*boostTaperFrac(r)*govBoostFrac(r)));
  return (e.displacement_L/1000)*(best/60)*(e.chargesPerRev||0.5)*0.95;
}
const filterDp=Q=>{const f=engine.filt;return f?f.a*Q+f.b*Q*Q:0;};   // Pa
// The filter's coefficients (a: Pa per m3/s, the media; b: Pa per (m3/s)^2, the housing), from a designed filter or a
// factory one sized to this engine's full flow.
function deriveFilter(){
  const e=engine,P=e.filterPart||null;
  if(P){
    const H=FILTER_HOUSING[P.housing];
    if(P.housing==='none'){e.filt={a:0,b:0};return;}
    const Ain=Math.PI/4*Math.pow(P.inletD_mm/1000,2);
    e.filt={a:200/(FILTER_MEDIA[P.media].perm*P.area_m2),b:H.K*AIR_RHO0/2/(Ain*Ain)};
    return;
  }
  const F=AIR_FILTER[e.airFilter]||AIR_FILTER.stock,Q=filterQref(e);
  if(!(F.kPa>0)||!(Q>0)){e.filt={a:0,b:0};return;}
  const dpm=200*FILTER_FACE_V/FILTER_MEDIA[F.media].perm;
  if(F.clogged){   // the stock box, its element loaded with dust: the media takes the rest
    const S=AIR_FILTER.stock,dph=S.kPa*1000-200*FILTER_FACE_V/FILTER_MEDIA[S.media].perm;
    e.filt={a:(F.kPa*1000-dph)/Q,b:dph/(Q*Q)};
  }else e.filt={a:dpm/Q,b:(F.kPa*1000-dpm)/(Q*Q)};
}
// A filter, as the factory class the rest of the app reads (sprites, sound, cost): by its housing.
const filterClass=p=>({none:'none',open:'perf',airbox:'stock'})[p.housing]||'stock';
const PARTS_KEY='pes.parts',PARTS_MAX=40;
const PART_KINDS=[
  {kind:'exhaust',label:'EXHAUST',ready:true},
  {kind:'intake', label:'INTAKE MANIFOLD',ready:true},
  {kind:'filter', label:'AIR FILTER',ready:true},
  {kind:'cat',    label:'CATALYTIC CONVERTER',ready:false}
];
// A designed intake, as the factory class the rest of the app reads: a variable one is VARIABLE, a fixed one the
// factory length it is nearest.
function intakeClass(p){
  if(p.variable)return 'variable';
  let best='medium',d=1e9;for(const k of ['long','medium','short']){const x=Math.abs(RUNNER[k].mm-p.runnerL_mm);if(x<d){d=x;best=k;}}
  return best;
}
// Each kind: the engine field that carries the part, the field that carries the factory class, the ENGINE tab's select.
const PART_DEF={
  exhaust:{field:'exhaustPart',cls:'exhaust',select:'edExhaust',def:'stock',valid:k=>!!EXHAUST[k],clsOf:p=>EXHAUST_BUILD[p.build].cls,
    label:k=>EXHAUST[k].label,newName:'MY EXHAUST',factory:['stock','sport','race']},
  intake: {field:'intakePart', cls:'runner', select:'edRunner', def:'medium',valid:k=>!!RUNNER[k], clsOf:intakeClass,
    label:k=>RUNNER[k].label,newName:'MY INTAKE',factory:['long','medium','short','variable']},
  filter: {field:'filterPart', cls:'airFilter', select:'edAirFilter', def:'stock',valid:k=>!!AIR_FILTER[k], clsOf:filterClass,
    label:k=>AIR_FILTER[k].label,newName:'MY AIR FILTER',factory:['none','perf','stock','restrictive']}
};

let partLib=[];
function loadParts(){
  let raw;try{raw=localStorage.getItem(PARTS_KEY);}catch(e){raw=null;}
  try{const a=raw?JSON.parse(raw):[];partLib=Array.isArray(a)?a.filter(p=>p&&p.id&&PART_DEF[p.kind||'exhaust']).map(normPart):[];}
  catch(e){partLib=[];}
  return partLib;
}
function persistParts(){
  try{localStorage.setItem(PARTS_KEY,JSON.stringify(partLib));return true;}
  catch(e){flash(tr('PARTS NOT SAVED (storage blocked)'),'err');return false;}
}
const partById=id=>partLib.find(p=>p.id===id);
const newPartId=()=>'p'+Date.now().toString(36)+Math.floor(Math.random()*1296).toString(36);
// A part as the physics reads it: every number in its range, every choice one that exists.
function normPart(p){
  const L=PART_LIMITS,n=(v,k,d)=>{const x=+v;return Number.isFinite(x)?clamp(x,L[k][0],L[k][1]):d;};
  const id=String(p.id||newPartId());
  if(p.kind==='filter')return {id,kind:'filter',name:String(p.name||'AIR FILTER').slice(0,40),
    media:FILTER_MEDIA[p.media]?p.media:'paper',area_m2:n(p.area_m2,'area_m2',0.4),
    housing:FILTER_HOUSING[p.housing]?p.housing:'airbox',inletD_mm:n(p.inletD_mm,'inletD_mm',70)};
  if(p.kind==='intake'){
    const rL=n(p.runnerL_mm,'runnerL_mm',320),variable=!!p.variable;
    return {id,kind:'intake',name:String(p.name||'INTAKE').slice(0,40),runnerL_mm:rL,runnerD_mm:n(p.runnerD_mm,'runnerD_mm',40),
      variable,shortL_mm:Math.min(n(p.shortL_mm,'shortL_mm',150),Math.max(L.shortL_mm[0],rL-20))};
  }
  return {id,kind:'exhaust',name:String(p.name||'EXHAUST').slice(0,40),
    build:EXHAUST_BUILD[p.build]?p.build:'tubular',
    primD_mm:n(p.primD_mm,'primD_mm',40),primL_mm:n(p.primL_mm,'primL_mm',550),
    pipes:Math.round(n(p.pipes,'pipes',1)),sysD_mm:n(p.sysD_mm,'sysD_mm',57),sysL_m:n(p.sysL_m,'sysL_m',2.6),
    silencer:EXHAUST_SILENCER[p.silencer]?p.silencer:'absorptive'};
}
const samePart=(a,b)=>JSON.stringify(Object.assign({},normPart(a),{id:''}))===JSON.stringify(Object.assign({},normPart(b),{id:''}));
// A build's part, into this browser's library: the same part if it is there, a copy if the library's has since changed.
function ensurePart(p){
  const q=normPart(p),have=partById(q.id);
  if(have&&samePart(have,q))return have.id;
  const twin=partLib.find(x=>samePart(x,q));if(twin)return twin.id;
  if(have)q.id=newPartId();
  partLib.push(q);if(partLib.length>PARTS_MAX)partLib.shift();
  persistParts();fillPartSelects();
  return q.id;
}
// The class the rest of the app reads (sprites, drawings, cost tables): a designed exhaust is drawn as its construction.
const exhaustClass=e=>e.exhaustPart?EXHAUST_BUILD[e.exhaustPart.build].cls:e.exhaust;
const silencerKey=e=>e.exhaustPart?EXHAUST_SILENCER[e.exhaustPart.silencer].cls:e.exhaust;
const exhaustName=e=>e.exhaustPart?e.exhaustPart.name:(EXHAUST[e.exhaust]||EXHAUST.stock).label;

// The engine form's choices: the factory parts, then the library's of that kind under MY PARTS. A part is 'part:<id>'.
function fillPartSelect(kind){
  const D=PART_DEF[kind],s=document.getElementById(D.select);if(!s)return;
  const keep=s.value,mine=partLib.filter(p=>p.kind===kind);
  let g=s.querySelector('optgroup');
  if(!mine.length){if(g)g.remove();if(s.value!==keep||!s.value)s.value=D.def;return;}
  if(!g){g=document.createElement('optgroup');s.appendChild(g);}
  g.label=tr('MY PARTS');
  g.innerHTML=mine.map(p=>'<option value="part:'+esc(p.id)+'">'+esc(p.name)+'</option>').join('');
  s.value=keep;if(s.value!==keep)s.value=D.def;
}
function fillPartSelects(){for(const k in PART_DEF)fillPartSelect(k);}
const fillExhaustSelect=fillPartSelects;
// readEngineFromForm's parts: for each kind, a factory key, or the class and the whole part.
function partsFromForm(){
  const o={};
  for(const [kind,D] of Object.entries(PART_DEF)){
    const v=document.getElementById(D.select).value;
    const p=v.startsWith('part:')?partById(v.slice(5)):null;
    if(p&&p.kind===kind){const q=normPart(p);o[D.cls]=D.clsOf(q);o[D.field]=q;}
    else o[D.cls]=D.valid(v)?v:D.def;
  }
  return o;
}
function partsToForm(e){
  for(const D of Object.values(PART_DEF)){
    const s=document.getElementById(D.select);
    if(e[D.field]){const id=ensurePart(e[D.field]);fillPartSelects();s.value='part:'+id;}
    else s.value=e[D.cls]||D.def;
  }
}

// ---- the physics of a part on this engine, without touching the build ----
// Everything buildEngine derives from the exhaust and the runners, from deriveGasDynamics on; nothing before it reads them.
function rederiveBreathing(){
  const e=engine;
  deriveFilter();
  deriveGasDynamics();
  if(e.turboConfig==='sequential'&&e.intake==='turbo'&&e.turbineArea>0){
    e.seqStageRpm=0;let st=e.redline+1;
    for(let r=1000;r<=e.redline;r+=100)if(steadyBoost(r)>=0.98*boostTarget(r)){st=r;break;}
    e.seqStageRpm=st;
  }
  buildBoostTable(26);
  e.tqLimTable=null;if(e.tqLimit>0){buildTorqueLimit();buildBoostTable(26);}
  e.govPhi0=null;
  e.wotRich=wotNeedsEnrichment();
  {const p=peakEgts();e.peakEgt=p.probe;e.peakEgtGas=p.gas;}
}
// Run fn on a copy of the engine with another part of a kind: a designed one, or a factory key. The build, the live
// state and the caches are as they were afterwards. The copy gets its own score object: the knock-timing and fuel-map
// caches are keyed on it, and would otherwise hand the copy the timing worked out for the part it replaced.
function withPart(kind,x,fn){
  const D=PART_DEF[kind],keep=engine,sv=Object.assign({},state),dc=dynoCache,dk=dynoCacheKey,kc=_knockCache;
  engine=Object.assign({},keep,{score:Object.assign({},keep.score),_fmaps:null,_fcyc:null});
  if(typeof x==='string'){engine[D.cls]=x;delete engine[D.field];}
  else{engine[D.field]=normPart(Object.assign({},x,{kind}));engine[D.cls]=D.clsOf(engine[D.field]);}
  try{rederiveBreathing();return fn(engine);}
  finally{engine=keep;Object.assign(state,sv);dynoCache=dc;dynoCacheKey=dk;_knockCache=kc;}
}
const withExhaust=(x,fn)=>withPart('exhaust',x,fn);
// The flat-out pull the score is taken on (scoreEngine: best-power mixture, 25 C air, a warm engine).
function wotPull(){
  const sv=Object.assign({},state),am=engine.afrMode;
  engine.afrMode='fixed';
  Object.assign(state,{iat:25,coolant:90,oil:100,engineHealth:1,blown:false,elecLoad:0.3});
  state.afr=engine.ci?engine.stoichAFR*SMOKE_LAMBDA_CI:engine.stoichAFR*0.86;
  const pts=[];let hp=0,hpR=0,tq=0,tqR=0;
  for(let r=1000;r<=engine.redline;r+=100){const p=calcAtRpm(r);pts.push({rpm:r,hp:p.powerHP,tq:p.torque});
    if(p.powerHP>hp){hp=p.powerHP;hpR=r;}if(p.torque>tq){tq=p.torque;tqR=r;}}
  engine.afrMode=am;Object.assign(state,sv);
  return {pts,peakHP:Math.round(hp),peakHPrpm:hpR,peakTQ:Math.round(tq),peakTQrpm:tqR};
}
// What the designer reads out for an exhaust on this engine.
function exhaustReport(x){
  return withExhaust(x,e=>{
    const pull=wotPull(),T=exhaustGasT(1.0,pull.peakHPrpm);
    const m3s=(e.dispCyl_L/1000)*(T/320)*e.cylinders*(pull.peakHPrpm/60*(e.chargesPerRev||0.5))/(e.sysPipes||1);
    return Object.assign(pull,{primD:e.primD,primL:e.primL,primK:e.primK,sysD:e.sysD,sysL:e.sysL,sysPipes:e.sysPipes,sigma:e.exhSigma,
      scavPeakRpm:e.scavPeakRpm,bpKPa:backPressureBar(pull.peakHPrpm,T)*100,pipeV:m3s/(Math.PI/4*e.sysD*e.sysD)});
  });
}
// The runner diameter the factory manifold gives this engine: matched to the ports behind it (deriveGasDynamics).
const portRunnerD=e=>e.ivDia_mm?Math.sqrt(e.ivCount)*THROAT_RATIO*e.ivDia_mm:0.42*e.bore_mm;
// The speed a runner's own main tuning lands at: its Helmholtz frequency against the cylinder, at Engelman's ratio.
const runnerTuneRpm=(e,L)=>helmholtzHz(e.runnerA,L,e.vEffCyl,313)*60/ENGELMAN_K;
// The gas in the runner while the valve draws: the mean piston speed through the runner's bore (intakeRamGain's u).
const runnerGasV=(e,rpm,Dmm)=>2*(e.stroke_mm/1000)*rpm/60*Math.pow(e.bore_mm/Dmm,2);
// What the designer reads out for an intake on this engine.
function intakeReport(x){
  return withPart('intake',x,e=>{
    const pull=wotPull(),tb=e.fillTable;
    let cross=0;
    if(e.runnerVariable&&tb)for(const r of tb)if(r.L===e.runnerLShort&&r.rpm>=1000&&r.rpm<=e.redline){cross=r.rpm;break;}
    return Object.assign(pull,{runnerL:e.runnerL,runnerLShort:e.runnerLShort,runnerD:e.runnerD_mm,variable:e.runnerVariable,
      ramPeakRpm:e.ramPeakRpm,ramPeakGain:e.ramPeakGain,cross,fill:!!tb,
      tuneRpm:runnerTuneRpm(e,e.runnerL),tuneShort:e.runnerVariable?runnerTuneRpm(e,e.runnerLShort):0,
      gasV:runnerGasV(e,pull.peakHPrpm,e.runnerD_mm),portD:portRunnerD(e)});
  });
}
// What the designer reads out for an air filter on this engine: the pull, and the drop at peak power, media and housing.
function filterReport(x){
  return withPart('filter',x,e=>{
    const pull=wotPull(),r=pull.peakHPrpm,map=wotMapAt(r);
    const sv=Object.assign({},state);Object.assign(state,{iat:25,coolant:90,oil:100});
    const ve=calcAtRpm(r,map).ve;Object.assign(state,sv);
    const Q=airFlowM3s(r,map,ve),f=e.filt;
    return Object.assign(pull,{Q,dp:filterDp(Q),dpMedia:f.a*Q,dpHousing:f.b*Q*Q,Qref:filterQref(e)});
  });
}
// A factory part, as this engine has it, written down as a part: the start of a design.
function partFromFactory(key,kind){
  kind=kind||'exhaust';
  if(kind==='filter')return withPart('filter',key,e=>{
    const F=AIR_FILTER[key],Q=filterQref(e),f=e.filt,H=FILTER_HOUSING[F.housing];
    // the media's area from its coefficient (a clogged element is the area its dust cake leaves it), the inlet's from
    // the housing's
    const area=f.a>0?200/(FILTER_MEDIA[F.media].perm*f.a):Q/FILTER_FACE_V;
    const inletD=f.b>0&&H.K>0?Math.sqrt(4/Math.PI*Math.sqrt(H.K*AIR_RHO0/2/f.b))*1000:70;
    return normPart({kind:'filter',name:tr(F.label),media:F.media,area_m2:+area.toFixed(6),housing:F.housing,inletD_mm:+inletD.toFixed(4)});
  });
  if(kind==='intake')return withPart('intake',key,e=>normPart({kind:'intake',name:tr(RUNNER[key].label),
    runnerL_mm:RUNNER[key].mm!=null?RUNNER[key].mm:RUNNER.long.mm,runnerD_mm:+e.runnerD_mm.toFixed(2),
    variable:key==='variable',shortL_mm:RUNNER.short.mm}));
  return withExhaust(key,e=>normPart({name:tr(EXHAUST[key].label),build:{stock:'cast',sport:'tubular',race:'equal'}[key],
    primD_mm:+(e.primD*1000).toFixed(2),primL_mm:Math.round((e.intake==='turbo'?(EXHAUST[key].fixedL||0.55):e.primL)*1000),
    pipes:e.sysPipes,sysD_mm:+(e.sysD*1000).toFixed(2),sysL_m:e.sysL,
    silencer:{stock:'chambered',sport:'absorptive',race:'straight'}[key]}));
}
// The primary a fabricator cuts for a speed: the tuning relation solved for length at the lowest order that can be
// routed (350-900 mm), as deriveGasDynamics cuts a factory header.
function primaryFor(rpm){
  const T=exhaustGasT(1.0,rpm),theta=(engine.camDur||240)/2+90;
  for(let k=1;k<=9;k+=2){const L=theta*sonic(T)/(12*rpm*k);if(L>=0.35&&L<=0.90)return Math.round(L*1000);}
  return Math.round(clamp(theta*sonic(T)/(12*rpm*3),0.35,0.90)*1000);
}
// The pipe for a gas speed at the power peak (design practice: ~75 m/s; see EXHAUST).
function pipeFor(v,pipes,rpm){
  const T=exhaustGasT(1.0,rpm);
  const m3s=(engine.dispCyl_L/1000)*(T/320)*engine.cylinders*(rpm/60*(engine.chargesPerRev||0.5))/Math.max(1,pipes);
  return +clamp(Math.sqrt(4/Math.PI*m3s/v)*1000,PART_LIMITS.sysD_mm[0],PART_LIMITS.sysD_mm[1]).toFixed(1);
}
// Where the integrated intake stroke fills best (deriveGasDynamics' search, on the fill table as it stands).
function fillPeakRpm(e){
  let bf=-9,at=0;
  for(let n=Math.max(1200,e.idleRpmEff||1200);n<=e.redline;n+=25){const f=fillAt(n);if(f>bf){bf=f;at=n;}}
  return at;
}
// The runner cut for a speed: the length (plenum to head, the port added after) at which the integrated intake
// stroke fills best there, for a runner of this bore. Not the runner's resonance alone: the column's momentum moves
// the fill's peak 20-25% above it (build 206), so the length is searched on the fill model itself. Not a bisection:
// a stub too short to carry a column fills best LOWER again (40 mm on the M3 below 150 mm), so the lengths are
// scanned every 20 mm and the nearest refined every 5. Nearest peak wins; on a tie, the fuller fill at the speed.
function runnerFor(rpm,Dmm){
  const [lo0,hi0]=PART_LIMITS.runnerL_mm;
  return withPart('intake',{name:'',runnerL_mm:320,runnerD_mm:Dmm,variable:false},e=>{
    const port=0.95*e.bore_mm/1000;
    let best=null;
    const tryL=Lmm=>{e.runnerL=Lmm/1000+port;buildFillTable();const d=Math.abs(fillPeakRpm(e)-rpm),f=fillAt(rpm);
      if(!best||d<best.d-1e-9||(Math.abs(d-best.d)<1e-9&&f>best.f))best={L:Lmm,d,f};};
    for(let L=lo0;L<=hi0;L+=20)tryL(L);
    const c=best.L;for(let L=Math.max(lo0,c-15);L<=Math.min(hi0,c+15);L+=5)tryL(L);
    return best.L;
  });
}

// ---- the PARTS page ----
const partsUI={kind:'exhaust',edit:{exhaust:null,intake:null},timer:0};
const pv=id=>document.getElementById(id);
const fittedPart=kind=>engine&&engine[PART_DEF[kind].field];
// the ids of each kind's editor
const PART_UI={
  exhaust:{box:'partsExhaust',list:'partList',from:'ptFrom',neu:'ptNew',save:'ptSave',saveFit:'ptSaveFit',guide:'partGuide',canvas:'partCanvas',legend:'partLegend',
    none:"No exhausts designed yet. Start from one of this engine's factory exhausts below.",
    fields:['ptName','ptBuild','ptPrimD','ptPrimL','ptPipes','ptSysD','ptSysL','ptSil'],
    spec:p=>tr(EXHAUST_BUILD[p.build].label)+' · '+p.primD_mm+'/'+p.primL_mm+' mm · '+p.pipes+'× '+p.sysD_mm+' mm'},
  intake:{box:'partsIntake',list:'piList',from:'piFrom',neu:'piNew',save:'piSave',saveFit:'piSaveFit',guide:'piGuide',canvas:'piCanvas',legend:'piLegend',
    none:"No intakes designed yet. Start from one of this engine's factory manifolds below.",
    fields:['piName','piL','piD','piVar','piShort'],
    spec:p=>p.runnerL_mm+' × '+p.runnerD_mm+' mm'+(p.variable?' · '+tr('VARIABLE')+' '+p.shortL_mm+' mm':'')},
  filter:{box:'partsFilter',list:'pfList',from:'pfFrom',neu:'pfNew',save:'pfSave',saveFit:'pfSaveFit',guide:'pfGuide',canvas:'pfCanvas',legend:'pfLegend',
    none:"No air filters designed yet. Start from one of this engine's factory filters below.",
    fields:['pfName','pfMedia','pfArea','pfHousing','pfInlet'],
    spec:p=>tr(FILTER_MEDIA[p.media].label)+' · '+p.area_m2+' m² · '+tr(FILTER_HOUSING[p.housing].label)+(p.housing==='none'?'':' '+p.inletD_mm+' mm')}
};
function renderParts(){
  const types=pv('partTypes');if(!types)return;
  types.innerHTML=PART_KINDS.map(k=>'<button type="button" data-kind="'+k.kind+'"'+(k.ready?'':' disabled')+(partsUI.kind===k.kind?' class="on"':'')+'>'
    +esc(tr(k.label))+(k.ready?'':'<span class="soon">'+esc(tr('LATER'))+'</span>')+'</button>').join('');
  types.querySelectorAll('button[data-kind]').forEach(b=>b.addEventListener('click',()=>{partsUI.kind=b.dataset.kind;renderParts();}));
  const noEng=!engine||isElectric();
  pv('partsNoEngine').hidden=!noEng;
  for(const k in PART_UI)pv(PART_UI[k].box).hidden=noEng||partsUI.kind!==k;
  if(noEng)return;
  const kind=partsUI.kind,U=PART_UI[kind],D=PART_DEF[kind];
  const list=pv(U.list),fitted=fittedPart(kind)&&fittedPart(kind).id,mine=partLib.filter(p=>p.kind===kind),ed=partsUI.edit[kind];
  list.innerHTML=mine.length?mine.map(p=>'<div class="part-row'+(ed&&ed.id===p.id?' sel':'')+'">'
    +'<span class="pn">'+esc(p.name)+(fitted===p.id?' <b>'+esc(tr('FITTED'))+'</b>':'')+'</span>'
    +'<span class="ps">'+esc(U.spec(p))+'</span>'
    +'<button type="button" data-a="edit" data-id="'+esc(p.id)+'">'+esc(tr('EDIT'))+'</button>'
    +'<button type="button" data-a="fit" data-id="'+esc(p.id)+'">'+esc(tr('FIT'))+'</button>'
    +'<button type="button" data-a="del" data-id="'+esc(p.id)+'">'+esc(tr('DELETE'))+'</button></div>').join('')
    :'<div class="hint">'+esc(tr(U.none))+'</div>';
  list.querySelectorAll('button[data-a]').forEach(b=>b.addEventListener('click',()=>partAction(b.dataset.a,b.dataset.id)));
  if(!ed)pv(U.from).value=D.valid(engine[D.cls])?engine[D.cls]:D.def;
  if(!ed)partsUI.edit[kind]=fittedPart(kind)?Object.assign({},fittedPart(kind))
    :Object.assign(partFromFactory(D.valid(engine[D.cls])?engine[D.cls]:D.def,kind),{name:tr(D.newName)});
  partToEditor(kind,partsUI.edit[kind]);
  previewPart(kind);
}
function partToEditor(kind,p){
  const peak=Math.round((engine.score&&engine.score.peakHPrpm||engine.redline*0.9)/100)*100;
  if(kind==='filter'){
    pv('pfName').value=p.name;pv('pfMedia').value=p.media;pv('pfArea').value=p.area_m2;pv('pfHousing').value=p.housing;pv('pfInlet').value=p.inletD_mm;
    pv('pfInlet').disabled=p.housing==='none';pv('pfMedia').disabled=pv('pfArea').disabled=p.housing==='none';
    return;
  }
  if(kind==='intake'){
    pv('piName').value=p.name;pv('piL').value=p.runnerL_mm;pv('piD').value=p.runnerD_mm;pv('piVar').value=p.variable?'yes':'no';pv('piShort').value=p.shortL_mm;
    pv('piShort').disabled=!p.variable;
    if(!pv('piCutRpm').value)pv('piCutRpm').value=Math.round((engine.score&&engine.score.peakTQrpm||engine.redline*0.6)/100)*100;
    return;
  }
  pv('ptName').value=p.name;pv('ptBuild').value=p.build;pv('ptPrimD').value=p.primD_mm;pv('ptPrimL').value=p.primL_mm;
  pv('ptPipes').value=String(p.pipes);pv('ptSysD').value=p.sysD_mm;pv('ptSysL').value=p.sysL_m;pv('ptSil').value=p.silencer;
  if(!pv('ptCutRpm').value)pv('ptCutRpm').value=peak;
}
function partFromEditor(kind){
  kind=kind||'exhaust';
  const ed=partsUI.edit[kind],newName=tr(PART_DEF[kind].newName);
  if(kind==='filter')return normPart({kind,id:ed&&ed.id,name:pv('pfName').value.trim()||newName,media:pv('pfMedia').value,
    area_m2:pv('pfArea').value,housing:pv('pfHousing').value,inletD_mm:pv('pfInlet').value});
  if(kind==='intake')return normPart({kind,id:ed&&ed.id,name:pv('piName').value.trim()||newName,runnerL_mm:pv('piL').value,runnerD_mm:pv('piD').value,
    variable:pv('piVar').value==='yes',shortL_mm:pv('piShort').value});
  return normPart({kind,id:ed&&ed.id,name:pv('ptName').value.trim()||newName,build:pv('ptBuild').value,
    primD_mm:pv('ptPrimD').value,primL_mm:pv('ptPrimL').value,pipes:pv('ptPipes').value,sysD_mm:pv('ptSysD').value,
    sysL_m:pv('ptSysL').value,silencer:pv('ptSil').value});
}
function partAction(a,id){
  const p=partById(id);if(!p)return;
  const kind=p.kind,D=PART_DEF[kind];
  if(a==='edit'){partsUI.edit[kind]=Object.assign({},p);renderParts();}
  else if(a==='fit')fitPart(p.id);
  else if(a==='del'){
    partLib=partLib.filter(x=>x.id!==id);persistParts();
    const f=fittedPart(kind);
    if(f&&f.id===id){pv(D.select).value=engine[D.cls];fillPartSelects();buildEngine();
      flash(tr(kind==='intake'?'PART DELETED: THE ENGINE HAS ITS FACTORY INTAKE':kind==='filter'?'PART DELETED: THE ENGINE HAS ITS FACTORY AIR FILTER':'PART DELETED: THE ENGINE HAS ITS FACTORY EXHAUST'));}
    else{fillPartSelects();flash(tr('PART DELETED'));}
    if(partsUI.edit[kind]&&partsUI.edit[kind].id===id)partsUI.edit[kind]=null;
    renderParts();
  }
}
function savePart(kind){
  kind=kind||partsUI.kind;
  const p=partFromEditor(kind),i=partLib.findIndex(x=>x.id===p.id);
  if(i>=0)partLib[i]=p;else{if(partLib.length>=PARTS_MAX){flash(tr('PARTS LIBRARY FULL'),'warn');return null;}partLib.push(p);}
  if(!persistParts())return null;
  partsUI.edit[kind]=Object.assign({},p);fillPartSelects();
  // the engine wearing this part takes the new dimensions
  const f=fittedPart(kind);if(f&&f.id===p.id)buildEngine();
  flash(tr('PART SAVED'));renderParts();
  return p;
}
function fitPart(id){
  const p=partById(id);
  fillPartSelects();pv(PART_DEF[p.kind].select).value='part:'+id;buildEngine();
  flash(tr('PART FITTED')+': '+p.name);renderParts();
}
function newPartFrom(kind,key){partsUI.edit[kind]=Object.assign(partFromFactory(key,kind),{id:newPartId(),name:tr(PART_DEF[kind].newName)});renderParts();}
const fmt=(x,d=0)=>(+x).toFixed(d),dlt=(a,b)=>{const d=a-b;return (d>=0?'+':'')+d;};
const headline=(what,r,now)=>tr(what)+': <b>'+r.peakHP+' hp</b> @ '+r.peakHPrpm+' · <b>'+r.peakTQ+' Nm</b> @ '+r.peakTQrpm
  +' <span class="dim">('+tr('now')+' '+now.peakHP+' hp, '+now.peakTQ+' Nm: '+dlt(r.peakHP,now.peakHP)+' hp, '+dlt(r.peakTQ,now.peakTQ)+' Nm)</span>';
function previewPart(kind){
  kind=kind||'exhaust';
  if(kind==='intake')return previewIntake();
  if(kind==='filter')return previewFilter();
  const p=partFromEditor('exhaust'),now=exhaustReport(engine.exhaustPart||engine.exhaust),r=exhaustReport(p);
  partsUI.last={kind,p,now,r};
  const turbo=engine.intake==='turbo',ported=!!engine.ports;
  const lines=[];
  lines.push(headline('With this exhaust',r,now));
  lines.push(tr('Primary')+': '+fmt(p.primD_mm,1)+' mm = '+fmt(p.primD_mm/engine.bore_mm,2)+' × '+tr('bore')
    +' <span class="dim">('+tr('the factory exhausts: cast 0.38, tubular 0.46, race 0.54')+')</span>');
  if(turbo)lines.push(tr('On a turbo engine the manifold is as short as packaging allows: the primary length is not used, and its suction wave turns into a compression against the turbine.'));
  else if(ported)lines.push(tr('A port-timed engine has no valve overlap to scavenge through: the header changes its back-pressure, not its filling.'));
  else lines.push(tr('Scavenging is strongest at')+' <b>'+r.scavPeakRpm+' rpm</b>'+(r.primK?' ('+tr('wave order')+' '+r.primK+')':'')
    +'; '+tr('peak power is at')+' '+r.peakHPrpm+' rpm.');
  lines.push(tr('Gas speed in the pipe at peak power')+': <b>'+fmt(r.pipeV)+' m/s</b> <span class="dim">('+tr('design practice ~75; quieter road systems run faster, race systems slower')+')</span>');
  lines.push(tr('Back-pressure at peak power')+': <b>'+fmt(r.bpKPa,1)+' kPa</b> <span class="dim">('+tr('now')+' '+fmt(now.bpKPa,1)+')</span>');
  lines.push('<span class="dim">'+tr('The silencer changes the sound only; its own back-pressure is not modelled yet.')+'</span>');
  pv('partGuide').innerHTML=lines.map(l=>'<div>'+l+'</div>').join('');
  drawPartCurves('exhaust',now,r);
}
function previewIntake(){
  const p=partFromEditor('intake'),now=intakeReport(engine.intakePart||engine.runner),r=intakeReport(p);
  partsUI.last={kind:'intake',p,now,r};
  pv('piShort').disabled=!p.variable;
  const port=Math.round(0.95*engine.bore_mm),lines=[];
  lines.push(headline('With this intake',r,now));
  if(!r.fill){
    lines.push(tr('A port-timed engine has no intake valve for the runners to tune against: the runners change nothing.'));
  }else{
    lines.push(tr('Runner')+': '+fmt(p.runnerL_mm)+' mm + '+port+' mm '+tr('of port in the head')+' = '+fmt(r.runnerL*1000)+' mm; '
      +tr('its resonance alone would tune it for')+' <b>'+fmt(r.tuneRpm/50)*50+' rpm</b>'
      +(r.variable?', '+tr('the short one at')+' '+fmt(r.tuneShort/50)*50+' rpm':'')+'.');
    lines.push(tr('The intake stroke fills best at')+' <b>'+r.ramPeakRpm+' rpm</b> (+'+fmt(r.ramPeakGain*100)+'% '+tr('over its slowest')+'); '
      +tr('peak torque is at')+' '+r.peakTQrpm+', '+tr('peak power at')+' '+r.peakHPrpm+' rpm.');
    if(r.variable)lines.push(r.cross?tr('The flap opens the short runners from')+' <b>'+r.cross+' rpm</b>.':tr('The short runners never fill better here: the flap stays shut.'));
    lines.push(tr('Runner bore')+': '+fmt(p.runnerD_mm,1)+' mm <span class="dim">('+tr('matched to this engine\'s ports')+': '+fmt(r.portD,1)+' mm)</span>; '
      +tr('gas speed while the valve draws, at peak power')+': <b>'+fmt(r.gasV)+' m/s</b>.');
  }
  lines.push('<span class="dim">'+tr('The plenum\'s volume and the throttle are not part of the design yet: the plenum is taken as holding steady pressure.')+'</span>');
  pv('piGuide').innerHTML=lines.map(l=>'<div>'+l+'</div>').join('');
  drawPartCurves('intake',now,r);
}
function previewFilter(){
  const p=partFromEditor('filter'),now=filterReport(engine.filterPart||engine.airFilter),r=filterReport(p);
  partsUI.last={kind:'filter',p,now,r};
  const none=p.housing==='none';
  pv('pfInlet').disabled=none;pv('pfMedia').disabled=pv('pfArea').disabled=none;
  const kPa=x=>fmt(x/1000,2)+' kPa',lines=[];
  lines.push(headline('With this filter',r,now));
  lines.push(tr('Restriction at peak power')+': <b>'+kPa(r.dp)+'</b> ('+tr('media')+' '+kPa(r.dpMedia)+', '+tr('housing')+' '+kPa(r.dpHousing)+')'
    +' <span class="dim">('+tr('now')+' '+kPa(now.dp)+'; '+tr('new filters read 2-3.75 kPa at full throttle, clogged ones 6-7')+')</span>');
  if(!none){
    const vFace=r.Q/p.area_m2,vIn=r.Q/(Math.PI/4*Math.pow(p.inletD_mm/1000,2));
    lines.push(tr('Air through the media')+': <b>'+fmt(vFace,2)+' m/s</b> <span class="dim">('+tr('a factory element is sized for')+' '+FILTER_FACE_V+')</span>; '
      +tr('through the inlet')+': <b>'+fmt(vIn)+' m/s</b>.');
  }else lines.push(tr('Open stacks: nothing in the way, and nothing filtered.'));
  if(engine.intake!=='na')lines.push('<span class="dim">'+tr('On a boosted engine the drop is taken off the charge, as if the turbo were at its limit; with boost to spare the wastegate would make most of it up.')+'</span>');
  lines.push('<span class="dim">'+tr('Oiled cotton\'s permeability is its makers\' claim (about 50% more than paper); paper\'s is measured.')+'</span>');
  pv('pfGuide').innerHTML=lines.map(l=>'<div>'+l+'</div>').join('');
  drawPartCurves('filter',now,r);
}
function drawPartCurves(kind,now,r){
  const U=PART_UI[kind],c=pv(U.canvas);if(!c)return;
  const w=c.clientWidth||480,h=c.clientHeight||200,dpr=window.devicePixelRatio||1;
  c.width=Math.round(w*dpr);c.height=Math.round(h*dpr);
  const g=c.getContext('2d');g.setTransform(dpr,0,0,dpr,0,0);g.clearRect(0,0,w,h);
  const L=34,R=w-34,T=12,B=h-20,rMax=engine.redline;
  const hpMax=Math.max(...now.pts.map(p=>p.hp),...r.pts.map(p=>p.hp))*1.1,tqMax=Math.max(...now.pts.map(p=>p.tq),...r.pts.map(p=>p.tq))*1.1;
  const X=rpm=>L+(rpm-1000)/(rMax-1000)*(R-L);
  g.strokeStyle='#223';g.lineWidth=1;g.fillStyle='#667';g.font='8px monospace';
  for(let rpm=1000;rpm<=rMax;rpm+=1000){g.beginPath();g.moveTo(X(rpm),T);g.lineTo(X(rpm),B);g.stroke();g.fillText(String(rpm/1000)+'k',X(rpm)-6,h-6);}
  const line=(pts,k,max,col,dash)=>{g.strokeStyle=col;g.lineWidth=dash?1.5:2;g.setLineDash(dash?[4,3]:[]);g.beginPath();
    pts.forEach((p,i)=>{const x=X(p.rpm),y=B-(p[k]/max)*(B-T);i?g.lineTo(x,y):g.moveTo(x,y);});g.stroke();g.setLineDash([]);};
  line(now.pts,'tq',tqMax,'#4a8',true);line(now.pts,'hp',hpMax,'#c84',true);
  line(r.pts,'tq',tqMax,'#6fc',false);line(r.pts,'hp',hpMax,'#fa4',false);
  g.fillStyle='#fa4';g.fillText('hp',R+4,T+8);g.fillStyle='#6fc';g.fillText('Nm',4,T+8);
  pv(U.legend).innerHTML='<span style="color:#fa4">━ '+esc(tr(kind==='intake'?'this intake':kind==='filter'?'this filter':'this exhaust'))+'</span> <span style="color:#c84">┅ '+esc(tr('now'))+'</span>';
}
function schedulePreview(){clearTimeout(partsUI.timer);partsUI.timer=setTimeout(()=>{if(vizMode==='parts')previewPart(partsUI.kind);},120);}
function wireParts(){
  loadParts();fillPartSelects();
  for(const [kind,U] of Object.entries(PART_UI)){
    U.fields.forEach(id=>{const el=pv(id);el.addEventListener('input',schedulePreview);el.addEventListener('change',schedulePreview);});
    pv(U.save).addEventListener('click',()=>savePart(kind));
    pv(U.saveFit).addEventListener('click',()=>{const p=savePart(kind);if(p)fitPart(p.id);});
    pv(U.neu).addEventListener('click',()=>newPartFrom(kind,pv(U.from).value));
  }
  pv('ptCut').addEventListener('click',()=>{pv('ptPrimL').value=primaryFor(clamp(+pv('ptCutRpm').value||6000,1500,engine.redline));previewPart('exhaust');});
  pv('ptSize').addEventListener('click',()=>{const r=(engine.score&&engine.score.peakHPrpm)||engine.redline*0.9;pv('ptSysD').value=pipeFor(75,+pv('ptPipes').value,r);previewPart('exhaust');});
  pv('piCut').addEventListener('click',()=>{
    const want=clamp(+pv('piCutRpm').value||5000,1000,engine.redline);
    pv('piL').value=runnerFor(want,+pv('piD').value||portRunnerD(engine));previewPart('intake');
    const got=partsUI.last&&partsUI.last.r.ramPeakRpm;
    if(got&&Math.abs(got/want-1)>0.08)flash(tr('NO RUNNER FILLS BEST THERE ON THIS ENGINE: THE NEAREST IS SET'),'warn');
  });
  pv('pfSize').addEventListener('click',()=>{const r=filterReport(partFromEditor('filter'));pv('pfArea').value=+(r.Q/FILTER_FACE_V).toFixed(3);previewPart('filter');});
  pv('piMatch').addEventListener('click',()=>{pv('piD').value=+portRunnerD(engine).toFixed(1);previewPart('intake');});
  window.addEventListener('resize',()=>{if(vizMode==='parts'&&partsUI.last)drawPartCurves(partsUI.last.kind,partsUI.last.now,partsUI.last.r);});
}
