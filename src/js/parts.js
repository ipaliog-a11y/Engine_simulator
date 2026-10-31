// ---- PARTS: the part designer (build 205) ----
// A part is a physical thing with dimensions, designed on its own page, saved to a library in this browser and
// fitted on the ENGINE tab. The first kind is the EXHAUST. It needs no new physics: the three factory exhausts
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
// A build carries the full part (engine.exhaustPart), so a saved build, a file and a share link work in another
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
// a primary is 200-1000 mm, past either end of the 350-900 mm a fabricator can route round an engine bay.
const PART_LIMITS={primD_mm:[25,76],primL_mm:[200,1000],pipes:[1,2],sysD_mm:[30,110],sysL_m:[0.8,4.5]};
const PARTS_KEY='pes.parts',PARTS_MAX=40;
const PART_KINDS=[
  {kind:'exhaust',label:'EXHAUST',ready:true},
  {kind:'intake', label:'INTAKE MANIFOLD',ready:false},
  {kind:'filter', label:'AIR FILTER',ready:false},
  {kind:'cat',    label:'CATALYTIC CONVERTER',ready:false}
];

let partLib=[];
function loadParts(){
  let raw;try{raw=localStorage.getItem(PARTS_KEY);}catch(e){raw=null;}
  try{const a=raw?JSON.parse(raw):[];partLib=Array.isArray(a)?a.filter(p=>p&&p.id&&p.kind==='exhaust').map(normPart):[];}
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
  return {id:String(p.id||newPartId()),kind:'exhaust',name:String(p.name||'EXHAUST').slice(0,40),
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
  persistParts();fillExhaustSelect();
  return q.id;
}
// The class the rest of the app reads (sprites, drawings, cost tables): a designed exhaust is drawn as its construction.
const exhaustClass=e=>e.exhaustPart?EXHAUST_BUILD[e.exhaustPart.build].cls:e.exhaust;
const silencerKey=e=>e.exhaustPart?EXHAUST_SILENCER[e.exhaustPart.silencer].cls:e.exhaust;
const exhaustName=e=>e.exhaustPart?e.exhaustPart.name:(EXHAUST[e.exhaust]||EXHAUST.stock).label;

// The engine form's EXHAUST choice: the three factory systems, then the library. A part is 'part:<id>'.
function fillExhaustSelect(){
  const s=document.getElementById('edExhaust');if(!s)return;
  const keep=s.value;
  let g=s.querySelector('optgroup');
  if(!partLib.length){if(g)g.remove();if(!s.querySelector('option[value="'+CSS.escape(keep)+'"]'))s.value='stock';return;}
  if(!g){g=document.createElement('optgroup');s.appendChild(g);}
  g.label=tr('MY PARTS');
  g.innerHTML=partLib.map(p=>'<option value="part:'+esc(p.id)+'">'+esc(p.name)+'</option>').join('');
  s.value=keep;if(s.value!==keep)s.value='stock';
}
// readEngineFromForm's exhaust: a factory key, or the class and the whole part.
function exhaustFromForm(){
  const v=document.getElementById('edExhaust').value;
  if(v.startsWith('part:')){const p=partById(v.slice(5));if(p){const q=normPart(p);return {exhaust:EXHAUST_BUILD[q.build].cls,exhaustPart:q};}}
  return {exhaust:EXHAUST[v]?v:'stock'};
}
function exhaustToForm(e){
  const s=document.getElementById('edExhaust');
  if(e.exhaustPart){const id=ensurePart(e.exhaustPart);fillExhaustSelect();s.value='part:'+id;}
  else s.value=e.exhaust;
}

// ---- the physics of a part on this engine, without touching the build ----
// Everything buildEngine derives from the exhaust, from deriveGasDynamics on; nothing before it reads the exhaust.
function rederiveExhaust(){
  const e=engine;
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
// Run fn on a copy of the engine with another exhaust: a part, or a factory key. The build, the live state and the
// caches are as they were afterwards. The copy gets its own score object: the knock-timing and fuel-map caches are
// keyed on it, and would otherwise hand the copy the timing worked out for the exhaust it replaced.
function withExhaust(x,fn){
  const keep=engine,sv=Object.assign({},state),dc=dynoCache,dk=dynoCacheKey,kc=_knockCache;
  engine=Object.assign({},keep,{score:Object.assign({},keep.score),_fmaps:null,_fcyc:null});
  if(typeof x==='string'){engine.exhaust=x;delete engine.exhaustPart;}
  else{engine.exhaustPart=normPart(x);engine.exhaust=EXHAUST_BUILD[engine.exhaustPart.build].cls;}
  try{rederiveExhaust();return fn(engine);}
  finally{engine=keep;Object.assign(state,sv);dynoCache=dc;dynoCacheKey=dk;_knockCache=kc;}
}
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
// A factory exhaust, as this engine has it, written down as a part: the start of a design.
function partFromFactory(key){
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

// ---- the PARTS page ----
const partsUI={kind:'exhaust',edit:null,timer:0};
const pv=id=>document.getElementById(id);
function renderParts(){
  const types=pv('partTypes');if(!types)return;
  types.innerHTML=PART_KINDS.map(k=>'<button type="button" data-kind="'+k.kind+'"'+(k.ready?'':' disabled')+(partsUI.kind===k.kind?' class="on"':'')+'>'
    +esc(tr(k.label))+(k.ready?'':'<span class="soon">'+esc(tr('LATER'))+'</span>')+'</button>').join('');
  types.querySelectorAll('button[data-kind]').forEach(b=>b.addEventListener('click',()=>{partsUI.kind=b.dataset.kind;renderParts();}));
  const noEx=!engine||isElectric();
  pv('partsNoEngine').hidden=!noEx;
  pv('partsExhaust').hidden=noEx||partsUI.kind!=='exhaust';
  if(noEx)return;
  // the library
  const list=pv('partList');
  const fitted=engine.exhaustPart&&engine.exhaustPart.id;
  list.innerHTML=partLib.length?partLib.map(p=>'<div class="part-row'+(partsUI.edit&&partsUI.edit.id===p.id?' sel':'')+'">'
    +'<span class="pn">'+esc(p.name)+(fitted===p.id?' <b>'+esc(tr('FITTED'))+'</b>':'')+'</span>'
    +'<span class="ps">'+esc(tr(EXHAUST_BUILD[p.build].label))+' · '+p.primD_mm+'/'+p.primL_mm+' mm · '+p.pipes+'× '+p.sysD_mm+' mm</span>'
    +'<button type="button" data-a="edit" data-id="'+esc(p.id)+'">'+esc(tr('EDIT'))+'</button>'
    +'<button type="button" data-a="fit" data-id="'+esc(p.id)+'">'+esc(tr('FIT'))+'</button>'
    +'<button type="button" data-a="del" data-id="'+esc(p.id)+'">'+esc(tr('DELETE'))+'</button></div>').join('')
    :'<div class="hint">'+esc(tr('No exhausts designed yet. Start from one of this engine\'s factory exhausts below.'))+'</div>';
  list.querySelectorAll('button[data-a]').forEach(b=>b.addEventListener('click',()=>partAction(b.dataset.a,b.dataset.id)));
  if(!partsUI.edit)partsUI.edit=engine.exhaustPart?Object.assign({},engine.exhaustPart):Object.assign(partFromFactory(EXHAUST[engine.exhaust]?engine.exhaust:'stock'),{name:tr('MY EXHAUST')});
  partToEditor(partsUI.edit);
  previewPart();
}
function partToEditor(p){
  pv('ptName').value=p.name;pv('ptBuild').value=p.build;pv('ptPrimD').value=p.primD_mm;pv('ptPrimL').value=p.primL_mm;
  pv('ptPipes').value=String(p.pipes);pv('ptSysD').value=p.sysD_mm;pv('ptSysL').value=p.sysL_m;pv('ptSil').value=p.silencer;
  if(!pv('ptCutRpm').value)pv('ptCutRpm').value=Math.round((engine.score&&engine.score.peakHPrpm||engine.redline*0.9)/100)*100;
}
function partFromEditor(){
  return normPart({id:partsUI.edit&&partsUI.edit.id,name:pv('ptName').value.trim()||tr('MY EXHAUST'),build:pv('ptBuild').value,
    primD_mm:pv('ptPrimD').value,primL_mm:pv('ptPrimL').value,pipes:pv('ptPipes').value,sysD_mm:pv('ptSysD').value,
    sysL_m:pv('ptSysL').value,silencer:pv('ptSil').value});
}
function partAction(a,id){
  const p=partById(id);if(!p)return;
  if(a==='edit'){partsUI.edit=Object.assign({},p);renderParts();}
  else if(a==='fit')fitPart(p.id);
  else if(a==='del'){
    partLib=partLib.filter(x=>x.id!==id);persistParts();
    if(engine.exhaustPart&&engine.exhaustPart.id===id){pv('edExhaust').value=exhaustClass(engine);fillExhaustSelect();buildEngine();flash(tr('PART DELETED: THE ENGINE HAS ITS FACTORY EXHAUST'));}
    else{fillExhaustSelect();flash(tr('PART DELETED'));}
    if(partsUI.edit&&partsUI.edit.id===id)partsUI.edit=null;
    renderParts();
  }
}
function savePart(){
  const p=partFromEditor(),i=partLib.findIndex(x=>x.id===p.id);
  if(i>=0)partLib[i]=p;else{if(partLib.length>=PARTS_MAX){flash(tr('PARTS LIBRARY FULL'),'warn');return null;}partLib.push(p);}
  if(!persistParts())return null;
  partsUI.edit=Object.assign({},p);fillExhaustSelect();
  // the engine wearing this part takes the new dimensions
  if(engine.exhaustPart&&engine.exhaustPart.id===p.id)buildEngine();
  flash(tr('PART SAVED'));renderParts();
  return p;
}
function fitPart(id){
  fillExhaustSelect();pv('edExhaust').value='part:'+id;buildEngine();
  flash(tr('PART FITTED')+': '+partById(id).name);renderParts();
}
function newPartFrom(key){partsUI.edit=Object.assign(partFromFactory(key),{id:newPartId(),name:tr('MY EXHAUST')});renderParts();}
function previewPart(){
  const p=partFromEditor(),now=exhaustReport(engine.exhaustPart||engine.exhaust),r=exhaustReport(p);
  partsUI.last={p,now,r};
  const f=(x,d=0)=>(+x).toFixed(d),dlt=(a,b)=>{const d=a-b;return (d>=0?'+':'')+d;};
  const turbo=engine.intake==='turbo',ported=!!engine.ports;
  const lines=[];
  lines.push(tr('With this exhaust')+': <b>'+r.peakHP+' hp</b> @ '+r.peakHPrpm+' · <b>'+r.peakTQ+' Nm</b> @ '+r.peakTQrpm
    +' <span class="dim">('+tr('now')+' '+now.peakHP+' hp, '+now.peakTQ+' Nm: '+dlt(r.peakHP,now.peakHP)+' hp, '+dlt(r.peakTQ,now.peakTQ)+' Nm)</span>');
  lines.push(tr('Primary')+': '+f(p.primD_mm,1)+' mm = '+f(p.primD_mm/engine.bore_mm,2)+' × '+tr('bore')
    +' <span class="dim">('+tr('the factory exhausts: cast 0.38, tubular 0.46, race 0.54')+')</span>');
  if(turbo)lines.push(tr('On a turbo engine the manifold is as short as packaging allows: the primary length is not used, and its suction wave turns into a compression against the turbine.'));
  else if(ported)lines.push(tr('A port-timed engine has no valve overlap to scavenge through: the header changes its back-pressure, not its filling.'));
  else lines.push(tr('Scavenging is strongest at')+' <b>'+r.scavPeakRpm+' rpm</b>'+(r.primK?' ('+tr('wave order')+' '+r.primK+')':'')
    +'; '+tr('peak power is at')+' '+r.peakHPrpm+' rpm.');
  lines.push(tr('Gas speed in the pipe at peak power')+': <b>'+f(r.pipeV)+' m/s</b> <span class="dim">('+tr('design practice ~75; quieter road systems run faster, race systems slower')+')</span>');
  lines.push(tr('Back-pressure at peak power')+': <b>'+f(r.bpKPa,1)+' kPa</b> <span class="dim">('+tr('now')+' '+f(now.bpKPa,1)+')</span>');
  lines.push('<span class="dim">'+tr('The silencer changes the sound only; its own back-pressure is not modelled yet.')+'</span>');
  pv('partGuide').innerHTML=lines.map(l=>'<div>'+l+'</div>').join('');
  drawPartCurves(now,r);
}
function drawPartCurves(now,r){
  const c=pv('partCanvas');if(!c)return;
  const w=c.clientWidth||480,h=c.clientHeight||200,dpr=window.devicePixelRatio||1;
  c.width=Math.round(w*dpr);c.height=Math.round(h*dpr);
  const g=c.getContext('2d');g.setTransform(dpr,0,0,dpr,0,0);g.clearRect(0,0,w,h);
  const L=34,R=w-34,T=12,B=h-20,rMax=engine.redline;
  const hpMax=Math.max(...now.pts.map(p=>p.hp),...r.pts.map(p=>p.hp))*1.1,tqMax=Math.max(...now.pts.map(p=>p.tq),...r.pts.map(p=>p.tq))*1.1;
  const X=rpm=>L+(rpm-1000)/(rMax-1000)*(R-L);
  g.strokeStyle='#223';g.lineWidth=1;g.fillStyle='#667';g.font='8px monospace';
  for(let rpm=Math.ceil(1000/1000)*1000;rpm<=rMax;rpm+=1000){g.beginPath();g.moveTo(X(rpm),T);g.lineTo(X(rpm),B);g.stroke();g.fillText(String(rpm/1000)+'k',X(rpm)-6,h-6);}
  const line=(pts,k,max,col,dash)=>{g.strokeStyle=col;g.lineWidth=dash?1.5:2;g.setLineDash(dash?[4,3]:[]);g.beginPath();
    pts.forEach((p,i)=>{const x=X(p.rpm),y=B-(p[k]/max)*(B-T);i?g.lineTo(x,y):g.moveTo(x,y);});g.stroke();g.setLineDash([]);};
  line(now.pts,'tq',tqMax,'#4a8',true);line(now.pts,'hp',hpMax,'#c84',true);
  line(r.pts,'tq',tqMax,'#6fc',false);line(r.pts,'hp',hpMax,'#fa4',false);
  g.fillStyle='#fa4';g.fillText('hp',R+4,T+8);g.fillStyle='#6fc';g.fillText('Nm',4,T+8);
  pv('partLegend').innerHTML='<span style="color:#fa4">━ '+esc(tr('this exhaust'))+'</span> <span style="color:#c84">┅ '+esc(tr('now'))+'</span>';
}
function schedulePreview(){clearTimeout(partsUI.timer);partsUI.timer=setTimeout(()=>{if(vizMode==='parts')previewPart();},120);}
function wireParts(){
  loadParts();fillExhaustSelect();
  ['ptName','ptBuild','ptPrimD','ptPrimL','ptPipes','ptSysD','ptSysL','ptSil'].forEach(id=>{const el=pv(id);
    el.addEventListener('input',schedulePreview);el.addEventListener('change',schedulePreview);});
  pv('ptCut').addEventListener('click',()=>{pv('ptPrimL').value=primaryFor(clamp(+pv('ptCutRpm').value||6000,1500,engine.redline));previewPart();});
  pv('ptSize').addEventListener('click',()=>{const r=(engine.score&&engine.score.peakHPrpm)||engine.redline*0.9;pv('ptSysD').value=pipeFor(75,+pv('ptPipes').value,r);previewPart();});
  pv('ptSave').addEventListener('click',()=>savePart());
  pv('ptSaveFit').addEventListener('click',()=>{const p=savePart();if(p)fitPart(p.id);});
  pv('ptNew').addEventListener('click',()=>newPartFrom(pv('ptFrom').value));
  window.addEventListener('resize',()=>{if(vizMode==='parts'&&partsUI.last)drawPartCurves(partsUI.last.now,partsUI.last.r);});
}
