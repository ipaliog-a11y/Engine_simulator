// ---- Save / load full builds (localStorage) ----
// ---- Shared build (de)serialization for localStorage, files and share links ----
function serializeBuild(name,note){
  const b={app:APP_TAG,v:APP_VER,name:name||'engine',note:note||'',date:new Date().toISOString().slice(0,10),
    engine:readEngineFromForm(),   // clean design spec only (no derived fields)
    vehicle:readVehicleFromForm(),
    tune:{throttle:state.throttle,load:state.load,elecLoad:state.elecLoad,afr:state.afr,iat:state.iat,coolant:state.coolant,oil:state.oil,autoThermal}};
  // Only persist the fuel map when it's a hand-tuned custom grid (factory maps regenerate).
  if(fuelMapCustom&&Array.isArray(fuelMap))b.fuelMap=fuelMap.map(row=>row.map(v=>+v.toFixed(3)));
  return b;
}
function applyBuild(s){
  if(!s||!s.engine)throw new Error('not an engine build');
  applyEngineToForm(Object.assign({},DEFAULT_ENGINE,s.engine));
  buildEngine();
  // Restore a saved custom fuel map (buildEngine regenerated the factory grid); dims must match.
  if(Array.isArray(s.fuelMap)&&s.fuelMap.length===FM_ROWS&&s.fuelMap.every(r=>Array.isArray(r)&&r.length===FM_COLS)){
    fuelMap=s.fuelMap.map(r=>r.map(Number));fuelMapCustom=true;fmSel=null;dynoCache=null;renderFuelMap();
  }
  applyVehicleToForm(Object.assign({},DEFAULT_VEHICLE,s.vehicle||{}));
  buildVehicle();updateVehicleSummary();
  const t=s.tune||s.state||{};
  ['throttle','load','elecLoad','afr','iat','coolant','oil'].forEach(k=>{if(typeof t[k]==='number')state[k]=t[k];});
  state.throttle=clamp(state.throttle,0,1);state.load=clamp(state.load,0,1);state.elecLoad=clamp(state.elecLoad,0,1);
  setAutoThermal(!!t.autoThermal);
  dynoCache=null;syncSliders();
  return s.name||'engine';
}
// ---- picking a preset in two steps: a family, then a build in it ----
// One long list of 43 engines (and 28 cars) was the problem; each family holds a handful. The chosen
// build stays selected after loading, so the page always says what it came from.
let enginePicker=null,carPicker=null;
function wireFamilyPicker(famId,itemId,cats,items,catOf,placeholder,onPick){
  const fam=document.getElementById(famId),sel=document.getElementById(itemId);
  if(!fam||!sel)return null;
  const used=cats.filter(c=>items.some(p=>catOf(p)===c));
  fam.innerHTML=used.map(c=>'<option value="'+esc(c)+'">'+esc(tr(c))+'</option>').join('');
  const fill=(keep)=>{
    // a family whose items carry an era (the supercars) is grouped by it
    let era=null,html='';
    items.forEach((p,i)=>{if(catOf(p)!==fam.value)return;
      if(p.era&&p.era!==era){html+=(era?'</optgroup>':'')+'<optgroup label="'+esc(tr(p.era))+'">';era=p.era;}
      html+='<option value="'+i+'">'+esc(p.name)+'</option>';});
    sel.innerHTML='<option value="">'+esc(tr(placeholder))+'</option>'+html+(era?'</optgroup>':'');
    sel.value=keep!=null?String(keep):'';
  };
  fam.addEventListener('change',()=>fill());
  sel.addEventListener('change',()=>{if(sel.value!=='')onPick(+sel.value);});
  fill();
  // show a build as the current choice without loading it (garage loads, saved sessions)
  return {show(i){if(i==null||!items[i]){sel.value='';return;}fam.value=catOf(items[i]);fill(i);},
    // a language change: the same family and build, in the new words
    relabel(){const f=fam.value,s=sel.value;
      fam.innerHTML=used.map(c=>'<option value="'+esc(c)+'">'+esc(tr(c))+'</option>').join('');
      fam.value=f;fill(s===''?null:+s);}};
}
// What was last loaded, and the form it produced, so the strip can say when you have changed it since.
const loaded={engine:null,car:null};
function markLoaded(kind,name){
  loaded[kind]={name,form:kind==='engine'?JSON.stringify(readEngineFromForm()):null};
  updateBuildStrip();
}
function updateBuildStrip(){
  const be=document.getElementById('bsEngine'),bc=document.getElementById('bsCar');
  if(!be||!bc||!engine)return;
  const disp=engine.displacement_L?engine.displacement_L.toFixed(engine.displacement_L<1?2:1)+'L':'';
  const L=loaded.engine;
  let et;
  if(L&&L.form===JSON.stringify(readEngineFromForm()))et=L.name;
  else if(L)et=L.name+' ('+tr('modified')+')';
  else et=disp+' '+tr('custom');
  if(engine.score)et+=' • '+engine.score.peakHP+' hp';
  be.textContent=et;be.title=et;
  let ct=(vehicle&&vehicle.chLabel)?tr(vehicle.chLabel):'—';
  if(vehicle&&vehicle.chLabel&&!isFactoryFit(readVehicleFromForm()))ct+=' ('+tr('modified')+')';
  if(perf&&perf.t100)ct+=' • 0–100 '+perf.t100.toFixed(1)+'s';
  bc.textContent=ct;bc.title=ct;
  document.getElementById('bsEngineK').textContent=tr('ENGINE');document.getElementById('bsCarK').textContent=tr('CAR');
}
// A real car from VEHICLE_PRESETS: its factory engine, then its body and fitment.
function loadVehiclePreset(p){
  const ep=PRESETS.find(x=>x.name===p.engine);
  if(!ep)throw new Error('no engine preset '+p.engine);
  applyBuild({engine:Object.assign({},ep.engine),tune:Object.assign({},STD_TUNE),vehicle:vehicleFromPreset(p),name:p.name});
  engine.name=ep.name;
  return p.name;
}
function saveSetup(){
  try{localStorage.setItem(SAVE_KEY,JSON.stringify(serializeBuild('quicksave','')));flash(tr('BUILD SAVED'));}
  catch(e){flash(tr('SAVE FAILED (storage blocked)'),'err');}
}
function loadSetup(){
  let raw;try{raw=localStorage.getItem(SAVE_KEY);}catch(e){raw=null;}
  if(!raw){flash(tr('NO SAVED BUILD'),'warn');return;}
  try{applyBuild(JSON.parse(raw));flash(tr('BUILD LOADED'));}
  catch(e){flash(tr('LOAD FAILED (corrupt data)'),'err');}
}
// ---- Garage: any number of named chassis+engine combos, kept side by side ----
// SAVE/LOAD above is a single quicksave slot — saving again overwrites it. The garage is the
// other half of that: a build you name is kept until you delete it, so you can put the same
// engine in three chassis, or three engines in one chassis, and flip between them.
// A garage entry is just a serializeBuild() record, so it is exactly what SAVE FILE writes and
// what a share link carries — one format, and file/link/garage can never drift apart.
const GARAGE_KEY='pes.garage', GARAGE_MAX=24;
let garage=[];
function loadGarage(){
  let raw;try{raw=localStorage.getItem(GARAGE_KEY);}catch(e){raw=null;}
  if(!raw){garage=[];return garage;}
  try{const a=JSON.parse(raw);garage=Array.isArray(a)?a.filter(x=>x&&x.build&&x.build.engine):[];}
  catch(e){garage=[];}
  return garage;
}
function persistGarage(){
  try{localStorage.setItem(GARAGE_KEY,JSON.stringify(garage));return true;}
  catch(e){flash(tr('GARAGE FULL OR STORAGE BLOCKED'),'err');return false;}
}
// The headline numbers, snapshotted when the build is saved. They are a label on the card, not a
// source of truth — loading the build recomputes everything from the spec.
function garageStats(kind){
  const s=engine.score||{};
  const eng={hp:s.peakHP||0,tq:s.peakTQ||0,hpRpm:s.peakHPrpm||0,tqRpm:s.peakTQrpm||0,
    engine:engine.name||(engine.displacement_L?engine.displacement_L.toFixed(1)+'L':'engine')};
  if(kind==='engine')return Object.assign(eng,{cost:engine.cost||0});
  return Object.assign(eng,{kg:Math.round((vehicle&&vehicle.mass)||0),
    t100:(perf&&perf.t100!=null)?+perf.t100.toFixed(2):null,
    vmax:(perf&&perf.topSpeed!=null)?Math.round(perf.topSpeed):null,
    cost:(engine.cost||0)+((vehicle&&vehicle.cost)||0),
    lap:lapFor(trackKey),circuit:(TRACKS[trackKey]||{}).label||'',
    chassis:(vehicle&&vehicle.chLabel)||''});
}
// Two kinds of entry in one list: a CAR (engine, body, parts and tune) and an ENGINE (engine and tune
// only). Entries saved before build 103 carry no kind and are cars, which is what they were.
const gKind=g=>g.kind==='engine'?'engine':'car';
const GARAGE_NAME_ID={car:'garageName',engine:'engSaveName'};
function garageSave(kind){
  kind=kind==='engine'?'engine':'car';
  const inp=document.getElementById(GARAGE_NAME_ID[kind]);
  const name=((inp&&inp.value)||'').trim().slice(0,28);
  if(!name){flash(tr(kind==='engine'?'NAME THE ENGINE FIRST':'NAME THE BUILD FIRST'),'warn');if(inp)inp.focus();return;}
  if(!engine.score||(kind==='car'&&(!vehicle||!vehicle.mass))){flash(tr(kind==='engine'?'BUILD AN ENGINE FIRST':'BUILD A CAR FIRST'),'warn');return;}
  const same=garage.filter(g=>gKind(g)===kind);
  const at=garage.findIndex(g=>gKind(g)===kind&&g.name.toLowerCase()===name.toLowerCase());
  if(at>=0&&typeof confirm==='function'&&!confirm(tr('Overwrite the saved build')+' "'+garage[at].name+'"?'))return;
  if(at<0&&same.length>=GARAGE_MAX){flash(tr('GARAGE FULL')+' ('+GARAGE_MAX+')','warn');return;}
  const build=serializeBuild(name,'');
  if(kind==='engine')delete build.vehicle;
  const entry={id:at>=0?garage[at].id:'g'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),
    kind,name,date:new Date().toISOString().slice(0,10),stats:garageStats(kind),build};
  if(at>=0)garage[at]=entry;else garage.unshift(entry);
  if(persistGarage())flash(at>=0?tr('BUILD UPDATED'):tr(kind==='engine'?'ENGINE SAVED TO GARAGE':'SAVED TO GARAGE'));
  renderGarage();
}
function garageLoad(id){
  const g=garage.find(x=>x.id===id);if(!g)return;
  const kind=gKind(g);
  // An engine goes into the car you have: its record carries no vehicle, so hand applyBuild this one.
  try{applyBuild(kind==='engine'?Object.assign({},g.build,{vehicle:readVehicleFromForm()}):g.build);}
  catch(e){flash(tr('LOAD FAILED (corrupt data)'),'err');return;}
  engine.name=g.name;
  if(enginePicker)enginePicker.show(null);
  if(kind==='car'&&carPicker)carPicker.show(null);
  markLoaded('engine',kind==='engine'?g.name:((g.stats&&g.stats.engine)||g.name));
  if(kind==='car')markLoaded('car',g.name);
  const inp=document.getElementById(GARAGE_NAME_ID[kind]);if(inp)inp.value=g.name;
  flash(tr('LOADED')+': '+g.name.toUpperCase());
  renderGarage();
}
function garageDelete(id){
  const g=garage.find(x=>x.id===id);if(!g)return;
  if(typeof confirm==='function'&&!confirm(tr('Delete the saved build')+' "'+g.name+'"?'))return;
  garage=garage.filter(x=>x.id!==id);
  persistGarage();flash(tr('DELETED')+': '+g.name.toUpperCase());
  renderGarage();
}
// What VIEW opens: the spec the entry will load, read from its record (not from what is built now).
const garageOpen=new Set();
function garageDetail(g){
  const e=g.build.engine||{},v=g.build.vehicle,row=(k,x)=>'<b>'+k+'</b> '+esc(x)+'<br>';
  const typ=(ENGINE_TYPE[e.type]||ENGINE_TYPE.petrol4).label;
  const unit=e.type==='rotary'?e.cylinders+'-rotor':e.cylinders+'-cyl '+(LAYOUT_LABEL[e.layout]||'');
  const ind=e.intake==='na'?'NA':(e.intake==='turbo'?'turbo':'supercharged')+(e.boost_bar?' '+(+e.boost_bar).toFixed(2)+' bar':'');
  let h=row(tr('Engine'),typ+' • '+unit)+
    row(tr('Bore × stroke'),e.type==='rotary'?'R '+e.bore_mm+' × W '+e.stroke_mm+' mm, e '+(e.ecc_mm||'—'):e.bore_mm+' × '+e.stroke_mm+' mm')+
    row(tr('Compression'),(+e.compression).toFixed(1)+' • '+tr('redline')+' '+e.redline)+
    row(tr('Induction'),ind+(e.intake==='turbo'?' • '+(e.turboSize||'')+' '+(e.turboConfig||'')+(e.vgt?' VGT':''):''))+
    row(tr('Fuel'),(e.fuel||'gasoline')+(e.octane?' • '+e.octane+' RON':''));
  const st=g.stats||{};
  if(st.hp)h+=row(tr('Output'),st.hp+' hp'+(st.hpRpm?' @ '+st.hpRpm:'')+' • '+st.tq+' Nm'+(st.tqRpm?' @ '+st.tqRpm:''));
  if(v){
    const b=v.body;
    h+=row(tr('Car'),(b?b.name:tr((CHASSIS[v.chassis]||{}).label||v.chassis))+' • '+String(v.drive||'').toUpperCase()+' • '+v.gears+'-speed '+(v.gearbox||''))+
      row(tr('Tyres'),(TIRE_TYPE[v.tireType]||{}).label+' '+v.tireWidth+'/'+v.tireAspect+'R'+v.wheelDia+' • '+(SPEED_RATING[v.speedRating]||{label:'—'}).label)+
      row(tr('Speed limiter'),v.governor>0?v.governor+' km/h':tr('removed'))+
      row(tr('Traction control'),v.tc===false?tr('off'):tr('on'));
  }
  return '<div class="garage-detail">'+h+'</div>';
}
// A saved car or engine as a picture, drawn from its own record. Drawn at one cell per pixel and
// scaled up by CSS (image-rendering: pixelated); kept by content, so re-listing redraws nothing.
const garageThumbs=new Map();
function garageThumb(g){
  const b=g&&g.build;if(!b||!b.engine)return '';
  const car=gKind(g)==='car'&&b.vehicle;
  const key=(car?'c':'e')+JSON.stringify(car?[b.vehicle,b.engine.intake]:b.engine);
  if(garageThumbs.has(key))return garageThumbs.get(key);
  let url='';
  try{
    const gw=car?CAR_GW:ENG_GW,gh=car?CAR_GH:ENG_GH,buf=new PixBuf(gw,gh);
    if(car)drawCarSprite(buf,Object.assign({},DEFAULT_VEHICLE,b.vehicle),b.engine,0.4);
    else drawEngineSprite(buf,Object.assign({},DEFAULT_ENGINE,b.engine),0);
    const cv=document.createElement('canvas');cv.width=gw;cv.height=gh;
    const cg=cv.getContext('2d');pixBackdrop(cg,gw,gh,1,0,car?CAR_GY+1:null);cg.drawImage(buf.canvas(),0,0);
    url=cv.toDataURL('image/png');
  }catch(err){url='';}                                // an odd old record just goes without a picture
  garageThumbs.set(key,url);return url;
}
function garageCard(g,cur){
  const s=g.stats||{},bits=[];
  if(s.hp)bits.push('<b>'+s.hp+'</b> hp');
  if(s.tq)bits.push('<b>'+s.tq+'</b> Nm');
  if(s.kg)bits.push('<b>'+s.kg+'</b> kg');
  if(s.t100!=null)bits.push('0–100 <b>'+s.t100.toFixed(2)+'s</b>');
  if(s.vmax)bits.push('<b>'+s.vmax+'</b> km/h');
  if(s.lap!=null)bits.push(tr('Lap')+' <b>'+fmtLap(s.lap)+'</b>'+(s.circuit?' @ '+s.circuit:''));
  if(s.cost)bits.push(fmtCost(s.cost));
  const open=garageOpen.has(g.id);
  const thumb=garageThumb(g);
  return '<div class="garage-item'+(cur&&g.name.toLowerCase()===cur?' current':'')+'">'+
    (thumb?'<img class="garage-thumb" alt="" src="'+thumb+'">':'')+
    '<div class="garage-head"><span class="garage-name">'+esc(g.name)+'</span><span class="garage-date">'+esc(g.date||'')+'</span></div>'+
    '<div class="garage-spec">'+esc(s.engine||'')+(s.chassis?' '+tr('in')+' '+esc(tr(s.chassis)):'')+'</div>'+
    '<div class="garage-stats">'+bits.join(' &middot; ')+'</div>'+
    (open?garageDetail(g):'')+
    '<div class="garage-btns"><button data-gview="'+g.id+'">'+tr(open?'HIDE':'VIEW')+'</button>'+
    '<button data-gload="'+g.id+'">'+tr('LOAD')+'</button>'+
    '<button class="del" data-gdel="'+g.id+'">'+tr('DELETE')+'</button></div></div>';
}
function renderGarage(){
  const lists={car:document.getElementById('garageList'),engine:document.getElementById('garageEngList')};
  const empty={car:'No saved cars yet. On the VEHICLE tab, name the car and press SAVE CAR — the body, every part on it and the engine inside are all kept together.',
               engine:'No saved engines yet. On the ENGINE tab, name the engine and press SAVE ENGINE.'};
  for(const kind of ['car','engine']){
    const list=lists[kind];if(!list)continue;
    const items=garage.filter(g=>gKind(g)===kind);
    const cnt=document.getElementById(kind==='car'?'garageCarCount':'garageEngCount');
    if(cnt)cnt.textContent=items.length+' / '+GARAGE_MAX;
    if(!items.length){list.innerHTML='<div class="garage-empty">'+tr(empty[kind])+'</div>';continue;}
    const cur=((document.getElementById(GARAGE_NAME_ID[kind])||{}).value||'').trim().toLowerCase();
    list.innerHTML=items.map(g=>garageCard(g,cur)).join('');
  }
}
// ---- Save to / open from file (named, with a note) ----
function exportBuild(){
  const name=(typeof prompt==='function'?prompt('Engine name:',(engine.name||'My Engine')):'My Engine');
  if(name===null)return;
  const note=(typeof prompt==='function'?(prompt('Note (optional):','')||''):'');
  const build=serializeBuild(name,note);
  const fn=(name.replace(/[^a-z0-9]+/gi,'_').replace(/^_|_$/g,'')||'engine')+'.pes.json';
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([JSON.stringify(build,null,2)],{type:'application/json'}));
  a.download=fn;document.body.appendChild(a);a.click();
  setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1000);
  flash(tr('SAVED FILE:')+' '+fn);
}
