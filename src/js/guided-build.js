// ====== GUIDED BUILD (build 308, phase G) ======
// For the learner: three questions (what kind of car, what budget, what matters most) give a complete, working car,
// with each of its parts explained. The car is a real one from FACTORY_CARS, loaded with its own engine exactly as the
// FACTORY CAR picker loads it, so every part is sourced and nothing here is fitted or computed. After loading, every
// part stays open on its card (ENGINE and VEHICLE tabs) for the enthusiast.
//   · kind: the factory car families (FACTORY_CAR_CATS);
//   · budget: the sim's own build price, engine plus car, read from CAR_PRICE (tools/car-prices.mjs writes it; pricing
//     a car means working its engine out, about a second each, too slow to do while the player waits);
//   · what matters: the maker's 0–100, the maker's curb mass, or the price. Missing figures rank last, never estimated.
// Opened from the title menu (GUIDED BUILD); BACK steps back a question, and from the first returns to the menu.
const GB_BUDGETS=[20000,30000,45000,60000,80000,Infinity];
const GB_GOALS={quick:{label:'QUICKEST',why:'the quickest 0–100 its maker published'},
  light:{label:'LIGHTEST',why:'the lightest, which is the easiest to learn on: less mass to stop and turn'},
  cheap:{label:'CHEAPEST',why:'the lowest build price'}};
const guided={open:false,step:0,fam:null,budget:Infinity,goal:'quick',pick:0,from:null,ws:0,dirty:false};
const gbPrice=p=>CAR_PRICE[p.name];
function gbCars(fam){return FACTORY_CARS.map((p,i)=>({p,i})).filter(x=>x.p.cat===fam);}
// The cars that answer all three questions, best first. If none is within the budget, the cheapest of the family is
// offered instead, and the result says so.
function gbMatches(){
  const all=gbCars(guided.fam),fit=all.filter(x=>gbPrice(x.p)<=guided.budget);
  const key={quick:x=>(x.p.real&&x.p.real.t100)||Infinity,light:x=>(x.p.body&&x.p.body.kg)||Infinity,cheap:x=>gbPrice(x.p)}[guided.goal];
  const L=(fit.length?fit:all.slice().sort((a,b)=>gbPrice(a.p)-gbPrice(b.p)).slice(0,1));
  return {over:!fit.length,list:L.slice().sort((a,b)=>key(a)-key(b)||gbPrice(a.p)-gbPrice(b.p))};
}
// What each part is and why a car like this has it, from the car's own fitment. [where to change it, the part, why]
function gbExplain(p){
  const ep=FACTORY_ENGINES.find(x=>x.name===p.engine)||{},e=ep.engine||{},v=vehicleFromPreset(p),out=[];
  const E=(part,why)=>out.push(['ENGINE',part,why]),V=(part,why)=>out.push(['VEHICLE',part,why]);
  if(e.type==='electric')E(tr('Electric motor'),tr('Full torque from standstill and one gear; the battery is the tank, so range is the price of its weight.'));
  else{
    const L=e.cylinders*Math.PI/4*Math.pow(e.bore_mm/10,2)*(e.stroke_mm/10)/1000;
    const size=e.type==='rotary'?e.cylinders+tr('-ROTOR'):(L.toFixed(1)+' L, '+e.cylinders+tr('-CYL'));
    const kind={diesel:'Diesel: the heat of compression lights the fuel. Big torque low down and frugal, but it stops revving early.',
      rotary:'Rotary: spinning rotors in place of pistons. Small, light and eager to rev, but thirsty.',
      twostroke:'Two-stroke: it fires on every turn. Simple and light, but dirty and thirsty.'}[e.type]||
      (e.type!=='rotary'&&L<1.3?'A small engine: light and frugal, made for town.':L>4?'A big engine: torque everywhere, but heavy and thirsty.':'A mid-size engine: the usual balance of power, weight and thirst.');
    E(size,tr(kind));
    if(e.intake==='turbo')E(tr('TURBO'),tr('Exhaust gas spins a turbine that blows more air in: big power from a small engine, after a short wait for boost (lag).'));
    else if(e.intake==='supercharger')E(tr('SUPERCHARGER'),tr('A belt-driven compressor gives boost from idle, paid for with some of the engine\'s own power.'));
    else E(tr('Naturally aspirated'),tr('No turbo: the throttle answers at once, and power comes from litres and revs.'));
    if(e.hyMode)E(tr('Hybrid'),tr('A motor shares the work with the engine and turns braking back into charge.'));
  }
  V(tr({fwd:'FRONT-WHEEL DRIVE',rwd:'REAR-WHEEL DRIVE',awd:'ALL-WHEEL DRIVE'}[v.drive]||String(v.drive).toUpperCase()),
    tr({fwd:'Light and cheap, with the engine\'s weight over the wheels it drives; it runs out of grip with big power.',
        rwd:'The front steers and the rear pushes: balanced, and the classic layout for sports cars, but it can slide.',
        awd:'All four wheels push: the best launch and grip on a wet road, at the cost of weight and price.'}[v.drive]||''));
  if(v.gearbox&&GEARBOX[v.gearbox]&&!p.cat.match(/Electric/))V(tr(GEARBOX[v.gearbox].label),
    tr({manual:'You shift, with a clutch: cheap and light, a little slower between gears.',sequential:'A racing box: straight back and forth, quick shifts.',
        dct:'Two clutches swap gears with almost no gap in the drive.',auto:'A torque converter: smooth and easy, at some cost in speed and fuel.'}[v.gearbox]||''));
  if(TIRE_TYPE[v.tireType])V(tr(TIRE_TYPE[v.tireType].label)+' '+v.tireWidth+'/'+v.tireAspect+' R'+v.wheelDia,
    tr({eco:'Hard, low-rolling-resistance rubber: it saves fuel and lasts, but grips least.',street:'An everyday tyre: grip and comfort in balance.',premium:'A quality touring tyre: everyday grip, yet it rolls as easily as an eco tyre.',
        sport:'Softer rubber for more grip, worn sooner.',semi:'Almost a race tyre: big grip once warm, poor in the rain.',
        slick:'No tread at all: the most grip on a dry track, none to spare in the wet.',drag:'Made to launch in a straight line.'}[v.tireType]||''));
  if(BRAKE_TYPE[v.brakeType])V(tr(BRAKE_TYPE[v.brakeType].label),
    tr({steel:'Plain discs: enough for a light car on the road.',slotted:'Vented discs shed heat, so they keep stopping lap after lap.',
        big:'Bigger discs and calipers for a heavy or fast car.',carbon:'Carbon-ceramic: light and fade-free when hot, very expensive.',
        hd:'Heavy-duty brakes for a truck\'s weight and towing.'}[v.brakeType]||''));
  if(SUSPENSION[v.suspension])V(tr(SUSPENSION[v.suspension].label),
    tr({comfort:'Soft springs ride bumps well; the body leans in corners.',sport:'Firmer springs and dampers: less lean, a harder ride.',
        coilover:'Adjustable springs and dampers, set for the track.',race:'Stiff and adjustable: for a smooth circuit only.'}[v.suspension]||''));
  if(p.body&&p.body.kg)V(tr('Mass')+' '+p.body.kg+' kg',tr(p.body.kg<1000?'Light: it accelerates, stops and turns with little effort.':
    p.body.kg>1700?'Heavy: it needs big power, brakes and tyres to move it quickly.':'A usual weight for its size.'));
  return out;
}
function gbChoice(attr,val,label,sub,on){
  return '<button type="button" class="gb-opt'+(on?' on':'')+'" data-'+attr+'="'+esc(String(val))+'">'+esc(label)+
    (sub?'<span>'+esc(sub)+'</span>':'')+'</button>';
}
function gbQuestion(n,q,opts){return '<p class="gb-step">'+esc(tr('QUESTION'))+' '+n+' / 3</p><h3>'+esc(tr(q))+'</h3><div class="gb-opts">'+opts+'</div>';}
function gbResult(){
  const M=gbMatches(),x=M.list[guided.pick]||M.list[0];if(!x)return '';
  const p=x.p,url=carArtUrl(p.name),cr=p.real||{},n=M.list.length;
  const why=tr('Of {n} that fit, this is {why}.').replace('{n}',n+' '+tr(n===1?'car':'cars')).replace('{why}',tr(GB_GOALS[guided.goal].why));
  return '<div class="gb-res">'+(url?'<img class="gb-art" src="'+esc(url)+'" alt="'+esc(p.name)+'" decoding="async" width="960" height="640">':'')+
    '<h3 id="gbName"><span>'+esc(carNo(p.name))+'</span> '+esc(p.name)+'</h3>'+
    '<p class="gb-why">'+esc(M.over?tr('Nothing in this family fits that budget: this is its cheapest.'):why)+'</p>'+
    '<dl class="sc-figs"><dt>'+esc(tr('BUILD PRICE'))+'</dt><dd>'+fmtCost(gbPrice(p))+'</dd>'+
    (cr.t100?'<dt>0–100 km/h</dt><dd>'+cr.t100.toFixed(1)+' s</dd>':'')+(p.body&&p.body.kg?'<dt>'+esc(tr('MASS'))+'</dt><dd>'+p.body.kg+' kg</dd>':'')+'</dl>'+
    '<h4>'+esc(tr('WHY THESE PARTS'))+'</h4><ul class="gb-parts">'+gbExplain(p).map(([tab,part,w])=>
      '<li><b>'+esc(part)+'</b> <i>'+esc(tr(tab))+'</i><br>'+esc(w)+'</li>').join('')+'</ul>'+
    '<p class="sc-src">'+esc(tr('Every part stays open on its card: change any of them once the car is built.'))+'</p>'+
    '<div class="gb-act"><button type="button" id="gbBuild" class="sc-drive">'+esc(tr('BUILD THIS CAR'))+'</button>'+
    '<button type="button" id="gbShape">'+esc(tr('SHAPE IT'))+'</button></div>'+
    (n>1?'<h4>'+esc(tr('OR'))+'</h4><div class="gb-opts">'+M.list.slice(0,4).map((y,k)=>k===guided.pick?'':
      gbChoice('pick',k,y.p.name,fmtCost(gbPrice(y.p)),false)).join('')+'</div>':'')+'</div>';
}
function renderGuided(){
  const box=document.getElementById('gbBody');if(!box)return;
  const h=document.getElementById('gbHeading');if(h)h.textContent=tr('GUIDED BUILD');
  const back=document.getElementById('gbClose');if(back)back.textContent=tr('BACK');
  let html='';
  if(guided.step===0){
    html=gbQuestion(1,'What kind of car?',FACTORY_CAR_CATS.filter(c=>FACTORY_CARS.some(p=>p.cat===c)).map(c=>{
      const L=gbCars(c).map(x=>gbPrice(x.p));
      const lo=Math.min(...L),hi=Math.max(...L);
      return gbChoice('fam',c,tr(c),fmtCost(lo)+(hi>lo?' – '+fmtCost(hi):''),c===guided.fam);}).join(''));
  }else if(guided.step===1){
    const L=gbCars(guided.fam).map(x=>gbPrice(x.p)),lo=Math.min(...L),hi=Math.max(...L);
    // only the budgets that change the answer: those that buy at least one car and not yet all of them
    const B=GB_BUDGETS.filter(b=>b>=lo&&b<hi);
    html=gbQuestion(2,'What budget?',B.concat([Infinity]).map(b=>{
      const n=L.filter(v=>v<=b).length;
      return gbChoice('budget',b,b===Infinity?tr('NO LIMIT'):tr('UP TO')+' '+fmtCost(b),n+' '+tr(n===1?'car':'cars'),b===guided.budget);}).join(''));
  }else if(guided.step===2){
    html=gbQuestion(3,'What matters most?',Object.keys(GB_GOALS).map(k=>gbChoice('goal',k,tr(GB_GOALS[k].label),'',k===guided.goal)).join(''));
  }else if(guided.step===3)html=gbResult();
  else if(guided.step===5)html=gfRender();
  else html=gwRender();
  box.innerHTML=html;
  gwHintQueue();
}
// each step opens at its top: the result's first control is below the car's picture and parts, so it takes focus unscrolled
function gbFocus(){const box=document.getElementById('gbBody');if(box)box.scrollTop=0;
  requestAnimationFrame(()=>{const b=document.querySelector(guided.step===3?'#gbBuild':guided.step===4?'#gwNext':guided.step===5?'#gfDrive':'#gbBody .gb-opt');if(b)b.focus({preventScroll:true});});}
function openGuided(from){
  const el=document.getElementById('guided');if(!el)return;
  guided.from=from||null;guided.step=0;guided.pick=0;
  el.hidden=false;guided.open=true;document.body.classList.add('guided-open');el.scrollTop=0;
  renderGuided();gbFocus();
}
function closeGuided(stay){
  const el=document.getElementById('guided');if(!el||el.hidden)return;
  el.hidden=true;guided.open=false;document.body.classList.remove('guided-open');
  if(!stay&&guided.from==='title')openTitleScreen();
}
function gbBack(){if(guided.step===5){guided.step=4;renderGuided();gbFocus();}else if(guided.step===4&&guided.ws>0){guided.ws--;renderGuided();gbFocus();}else if(guided.step>0){guided.step--;guided.pick=0;renderGuided();gbFocus();}else closeGuided();}
// The same load as the FACTORY CAR picker, then the VEHICLE tab, where the car's parts are open on their cards.
function gbBuild(){
  const x=gbMatches().list[guided.pick];if(!x)return;
  closeGuided(true);setTab('vehicle');loadFactoryCarUI(x.i);
}
function bindGuided(){
  const el=document.getElementById('guided');if(!el)return;
  el.addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b||!el.contains(b))return;
    const d=b.dataset;
    if(b.id==='gbClose')gbBack();
    else if(b.id==='gbBuild')gbBuild();
    else if(b.id==='gbShape'){const x=gbMatches().list[guided.pick];if(x)gbShapeCar(x.i);return;}
    else if(b.id==='gwNext'){const n=gwSteps().length;if(guided.ws<n-1)guided.ws++;else{gwFinish();return;}}
    else if(b.id==='gwSkip'){gwFinish();return;}
    else if(b.id==='gfDrive'){closeGuided(true);setTab('vehicle');return;}
    else if(b.id==='gfSteps'){guided.step=4;}
    else if(b.id==='gfOver'){gbShapeCar(guided.car);return;}
    else if(b.dataset.adv!=null){gwAdvanced(b.dataset.adv);return;}
    else if(d.v!=null){const c=document.getElementById(d.f);if(c&&!c.disabled){c.value=d.v;gwSend(c,true);}}
    else if(d.fam!=null){guided.fam=d.fam;guided.budget=Infinity;guided.step=1;}
    else if(d.budget!=null){guided.budget=+d.budget;guided.step=2;}
    else if(d.goal!=null){guided.goal=d.goal;guided.pick=0;guided.step=3;}
    else if(d.pick!=null){guided.pick=+d.pick;}
    else return;
    if(guided.open){renderGuided();gbFocus();}
  });
  document.addEventListener('keydown',e=>{
    if(el.hidden||e.key!=='Escape')return;
    gbBack();e.preventDefault();e.stopPropagation();
  },true);
}

// ====== SHAPE IT: the walk-through (build G8; plans/guided-build.md, build 1) ======
// After the three questions, SHAPE IT loads the matched car and walks through its design one decision at a time. Each step
// shows one to four fields of one card, and edits the real form: a change here writes the card's own input and sends it
// the events a person's change would, so the card's preview, its coupled fields (syncDesignEnable) and the VEHICLE
// tab's live rebuild all run as they do on the cards. Nothing is computed here. A step whose fields are all disabled is
// skipped, and the list is worked out again after every change. FINISH builds the engine only if an engine field moved,
// so skipping every step leaves the factory car exactly as it loaded. Timing stays as the car has it (AUTO or FIXED):
// it is set on the FUEL & SPARK card only.
const GW_STEPS={
  cyl:{t:'Cylinders and layout',rot:'Rotors',f:['edCyl','edLayout']},
  bore:{t:'Bore and stroke',rot:'Rotor size',f:['edBore','edStroke','edEcc']},
  fuel:{t:'Fuel',f:['edFuel','edOctane'],timing:1},
  cr:{t:'Compression and air',f:['edCR','edIntake'],timing:1},   // the intake comes before the boost it enables
  boost:{t:'Boost',f:['edTurboSize','edScType','edBoost','edIntercooler']},
  head:{t:'Head and cam',f:['edValves','edCam','edVVT']},
  redline:{t:'Redline',f:['edRedline','edGovRpm']},
  breath:{t:'Breathing',f:['edRunner','edExhaust']},
  hybrid:{t:'Hybrid layout',f:['edHybrid','edHyDeploy','edHyPlug']},
  motor:{t:'Motor kind',f:['evMotorType']},
  msize:{t:'Motor size',f:['evRotorD','evStack']},
  wind:{t:'Winding',f:['evTurns']},
  amps:{t:'Inverter current',f:['evAmps']},
  pack:{t:'Battery',f:['evChem','evSeries','evKWh']},
  more:{t:'More motors',f:['evFront','evRearCount']},
  body:{t:'Body and drive',f:['vhChassis','vhDrive']},
  mass:{t:'Mass',f:['vhWeight']},
  gears:{t:'Gearbox and gearing',f:['vhGearbox','vhGears','vhGearing']},
  fd:{t:'Final drive',f:['vhGearing']},
  tyres:{t:'Tyres',f:['vhTire','vhTireW']}
};
const gwEl=id=>document.getElementById(id);
const gwOn=id=>{const c=gwEl(id);return !!c&&!c.disabled;};
// The steps for the car in the form, in order: the engine (or the drive), then the car.
function gwSteps(){
  const ev=(gwEl('edType')||{}).value==='electric',hy=!ev&&(gwEl('edHybrid')||{}).value!=null&&gwEl('edHybrid').value!=='none';
  const keys=ev?['motor','msize','wind','amps','pack','more','body','mass','fd','tyres']:
    ['cyl','bore','fuel','cr','boost','head','redline','breath'].concat(hy?['hybrid','msize','amps','pack']:[],['body','mass','gears','tyres']);
  return keys.filter(k=>GW_STEPS[k].f.some(gwOn));
}
const gwCards=id=>id.startsWith('ev')?EVD:id.startsWith('vh')?VCD:ICD;
// One field as the card has it: its label, a slider with the real examples' ticks for a number, the list for a choice,
// and the card's own line on what it is.
function gwField(id){
  const c=gwEl(id),f=c&&c.closest('.field'),dc=gwCards(id),spec=dc.cfg.fields[id]||{};
  const lab=f&&f.querySelector('label'),name=lab?lab.textContent:id;
  let h='<div class="gw-f"><label for="gw-'+id+'">'+esc(name)+'</label>';
  if(c.tagName==='SELECT'){
    h+='<select id="gw-'+id+'" data-f="'+id+'">'+[...c.options].filter(o=>!o.disabled||o.selected).map(o=>
      '<option value="'+esc(o.value)+'"'+(o.value===c.value?' selected':'')+'>'+esc(o.textContent)+'</option>').join('')+'</select>';
  }else{
    const lo=+c.min,hi=+c.max,v=+c.value,log=!!spec.log&&c.type==='number';
    const pos=x=>Math.max(0,Math.min(100,log?Math.log(Math.max(x,lo)/lo)/Math.log(hi/lo)*100:(x-lo)/(hi-lo)*100));
    let ticks=[];if(c.type==='number')try{ticks=dc.cfg.ticks(id)||[];}catch(e){ticks=[];}
    h+='<div class="evd-track gw-track">'+(ticks.length?'<span class="evd-band" style="left:'+pos(ticks[0].v)+'%;width:'+
      Math.max(1.5,pos(ticks[ticks.length-1].v)-pos(ticks[0].v))+'%"></span>':'')+
      '<input type="range" min="0" max="1000" step="1" value="'+Math.round(pos(v)*10)+'" data-f="'+id+'" data-k="1"'+(log?' data-log="1"':'')+
      ' aria-label="'+esc(name)+'">'+ticks.map(t=>'<button type="button" class="evd-tick" style="left:'+pos(t.v)+'%" data-f="'+id+'" data-v="'+t.v+
      '" title="'+esc(t.names.slice(0,4).join(', ')+': '+dcFmt(t.v,t.v%1?2:0))+'" aria-label="'+esc(tr('Set to')+' '+t.names[0]+': '+dcFmt(t.v,t.v%1?2:0))+'"></button>').join('')+'</div>'+
      (c.type==='number'?'<input type="number" id="gw-'+id+'" data-f="'+id+'" min="'+c.min+'" max="'+c.max+'" step="'+c.step+'" value="'+esc(c.value)+'">':'');
  }
  return h+(spec.what?'<p class="gw-what">'+esc(tr(spec.what))+'</p>':'')+(gwHintable(id)?'<p class="gw-hint" data-h="'+id+'">…</p>':'')+'</div>';
}
function gwRender(){
  const L=gwSteps();guided.ws=Math.max(0,Math.min(guided.ws,L.length-1));
  const k=L[guided.ws],S=GW_STEPS[k],rot=(gwEl('edType')||{}).value==='rotary',last=guided.ws===L.length-1;
  const fixed=S.timing&&gwOn('edTiming')&&gwEl('edTiming').value==='fixed';
  return '<p class="gb-step" id="gwStep" data-k="'+k+'">'+esc(tr('STEP'))+' '+(guided.ws+1)+' / '+L.length+'</p>'+
    '<h3>'+esc(tr(rot&&S.rot||S.t))+'</h3>'+S.f.filter(gwOn).map(gwField).join('')+
    (fixed?'<p class="gw-what gw-note">'+esc(tr('This car\'s spark timing is FIXED, so the ECU does not advance it to the knock limit. Timing is set on the FUEL & SPARK card.'))+'</p>':'')+
    '<div class="gw-act"><button type="button" id="gwNext" class="sc-drive">'+esc(tr(last?'FINISH':'NEXT'))+'</button>'+
    (last?'':'<button type="button" id="gwSkip">'+esc(tr('SKIP TO FINISH'))+'</button>')+
    '<button type="button" data-adv="'+S.f.find(gwOn)+'">'+esc(tr('ADVANCED'))+'</button></div>';
}
// Write the card's input as a person would: input while a slider moves, change (and a fresh step list) when it settles.
function gwSend(c,done){
  if(!c.id.startsWith('vh'))guided.dirty=true;
  c.dispatchEvent(new Event('input',{bubbles:true}));
  if(!done){gwHintCancel();return;}
  c.dispatchEvent(new Event('change',{bubbles:true}));
  const a=document.activeElement,fid=a&&a.dataset&&a.dataset.f,kind=a&&a.dataset&&a.dataset.k;
  renderGuided();
  const back=fid&&document.querySelector('#gbBody [data-f="'+fid+'"]'+(kind?'[data-k]':':not([data-k]):not(.evd-tick)'));if(back)back.focus({preventScroll:true});
}
function gwInput(e,done){
  const t=e.target,c=t.dataset&&t.dataset.f?gwEl(t.dataset.f):null;if(!c||c.disabled||guided.step!==4)return;
  if(t.dataset.k){
    const lo=+c.min,hi=+c.max,x=t.dataset.log?lo*Math.pow(hi/lo,t.value/1000):lo+(hi-lo)*t.value/1000,s=+c.step||1;
    c.value=+(Math.round(x/s)*s).toFixed(4);
    const box=document.getElementById('gw-'+c.id);if(box)box.value=c.value;
  }else if(t.tagName==='SELECT'){if(!done)return;c.value=t.value;}
  else{if(t.value==='')return;c.value=t.value;}
  gwSend(c,done);
}
function gbShapeCar(i){
  setTab('vehicle');loadFactoryCarUI(i);
  guided.step=4;guided.ws=0;guided.dirty=false;guided.car=i;guided.base=gfFigures();
  if(guided.open){renderGuided();gbFocus();}
}
// The full card for a step's field: the dialog closes on that card, opened.
function gwAdvanced(id){
  const c=gwEl(id),card=c&&c.closest('.evd-card'),dc=gwCards(id);
  closeGuided(true);setTab(id.startsWith('vh')?'vehicle':'design');
  if(card&&dc.st.ready){dc.st.card=card.id.slice((dc.p+'Card-').length);dc.layout();card.scrollIntoView({block:'nearest'});}
}
// FINISH: build the engine (and so the car) only if an engine field moved; then the finish screen (gfRender).
function gwFinish(){
  if(guided.dirty){buildEngine();guided.dirty=false;}
  guided.step=5;
  if(guided.open){renderGuided();gbFocus();}
}
function bindShape(){
  const el=document.getElementById('guided');if(!el)return;
  el.addEventListener('input',e=>gwInput(e,false));
  el.addEventListener('change',e=>gwInput(e,true));
}

// ====== Goal hints (build G9; plans/guided-build.md, build 2) ======
// Under each field of a step, one line: what the next value down and the next value up do to the goal chosen in the
// three questions, worked out by the card's own preview (icdCompute, evdCompute, or the car rebuilt as the VEHICLE tab
// builds it), and the limit that value meets. A neighbour is 5% of the field's range away, or the nearest real
// example's tick if that is closer; for a choice, the options either side of it. Nothing searches for a best value.
// The form is put back after every run, and so are the engine (icdCompute does that) and the car (gwCarAt).
// Fields that enable or disable others (fuel, intake, motor kind, hybrid layout...) get no hint: their neighbour would
// be worked out on a form that syncDesignEnable has not set for it.
const GW_COUPLED=ICD_DEPS.concat(EVD_SPEED_FIELDS,['edGovRpm','edHybrid','edHyDeploy']);
// The goal's measures in each preview's result: [key, unit, decimals, which way is better].
const GW_MEASURE={
  ice:{quick:[['hp',' hp',0,1],['tq',' Nm',0,1]],light:[['mass',' kg',0,-1]],cheap:[['cost','$',0,-1]]},
  ev:{quick:[['pk',' kW',0,1],['tq',' Nm',0,1]],light:[['kg',' kg',0,-1]],cheap:[['cost','$',0,-1]]},
  car:{quick:[['t100',' s',2,-1]],light:[['mass',' kg',0,-1]],cheap:[['cost','$',0,-1]]}};
const gwKind=id=>id.startsWith('vh')?'car':id.startsWith('ev')||id.startsWith('edHy')?'ev':'ice';
const gwHintable=id=>!GW_COUPLED.includes(id);
// The car as the VEHICLE tab would build it from the form now, with the live car and its run put back after.
function gwCarAt(){
  const keep={vehicle,perf,rev:vehRev,viz:vizMode};
  try{vizMode='';buildVehicle();return vcdCompute();}
  finally{vehicle=keep.vehicle;perf=keep.perf;vehRev=keep.rev;vizMode=keep.viz;if(typeof updateBuildStrip==='function')updateBuildStrip();}
}
function gwPreview(kind){
  if(kind==='car')return gwCarAt();
  if(kind==='ev'){const r=evdCompute();return r&&Object.assign(r,{kg:r.mass+r.packMass});}
  return icdCompute();
}
// The value next to the field's own, one way (dir -1 or +1), or null at the end of its range.
function gwNear(c,dir){
  if(c.tagName==='SELECT'){
    const o=[...c.options].filter(x=>!x.disabled||x.selected),i=o.findIndex(x=>x.value===c.value),n=o[i+dir];
    return n?{v:n.value,t:n.textContent}:null;
  }
  const lo=+c.min,hi=+c.max,v=+c.value,s=+c.step||1;let x=v+dir*0.05*(hi-lo),t=[];
  try{t=gwCards(c.id).cfg.ticks(c.id)||[];}catch(e){t=[];}
  for(const k of t)if(dir>0?k.v>v&&k.v<x:k.v<v&&k.v>x)x=k.v;
  x=Math.max(lo,Math.min(hi,+(Math.round(x/s)*s).toFixed(4)));
  return (dir>0?x>v:x<v)?{v:x,t:dcFmt(x,s<1?(String(s).split('.')[1]||'').length:0)}:null;
}
// The limit a result meets, in the cards' own terms; '' if none.
function gwLimit(kind,r){
  if(kind==='ice'){
    if(icdFloatShort(r))return tr('meets valve float at {f} rpm').replace('{f}',dcFmt(Math.round(r.float/100)*100));
    if(typeof icdPreIgn==='function'&&icdPreIgn(r))return tr('pre-ignition before spark');
    if(typeof icdPmaxOver==='function'&&icdPmaxOver(r))return tr('cylinder pressure ({p} bar) exceeds {l} bar').replace('{p}',dcFmt(Math.round(r.pMax))).replace('{l}',dcFmt(r.pMaxLim));
    if(icdKnockOver(r))return tr('knocks past its limit');
  }else if(kind==='ev'){
    if(r.nTip<Math.min(r.maxRpm||Infinity,r.nFreq)-1)return tr('the rotor rim stops the motor at {n} rpm').replace('{n}',dcFmt(Math.round(r.nTip/100)*100));
    if(r.nFreq<Math.min(r.maxRpm||Infinity,r.nTip)-1)return tr('inverter frequency stops the motor at {n} rpm').replace('{n}',dcFmt(Math.round(r.nFreq/100)*100));
    if(r.pk<r.pkM*0.99)return tr('the battery sets the peak');
  }else{
    if(vcdTyresShort(r))return tr('past the tyres\' speed rating');
    if(vcdGripBound(r))return tr('grip-bound launch');
  }
  return '';
}
const gwSigned=(d,u,dp)=>(d>0?'+':d<0?'−':'±')+(u==='$'?'$':'')+dcFmt(Math.abs(d),dp)+(u==='$'?'':u);
// One side of a field's hint: "Higher (7,000): +14 hp, +6 Nm, toward QUICKEST · meets valve float at 6,800 rpm".
function gwHintSide(kind,dir,n,r0,r){
  const M=GW_MEASURE[kind][guided.goal]||GW_MEASURE[kind].quick,head=tr(dir>0?'Higher':'Lower')+' ('+n.t+'): ';
  if(!r)return head+tr('no result');
  const parts=[],m=M[0],d0=r[m[0]]!=null&&r0[m[0]]!=null?+(r[m[0]]-r0[m[0]]).toFixed(m[2]):0;
  for(const x of M){const d=r[x[0]]!=null&&r0[x[0]]!=null?+(r[x[0]]-r0[x[0]]).toFixed(x[2]):0;if(d)parts.push(gwSigned(d,x[1],x[2]));}
  if(kind==='ice'&&r.ci&&r.rel!==r0.rel)parts.push(tr('reliability')+' '+gwSigned(r.rel-r0.rel,'',0));   // a diesel has no knock limit
  const way=d0?tr(d0*m[3]>0?'toward {g}':'away from {g}').replace('{g}',tr(GB_GOALS[guided.goal].label)):'';
  const lim=gwLimit(kind,r),txt=parts.concat(way?[way]:[]).join(', ');
  return head+(txt||tr('no change'))+(lim?' · '+lim:'');
}
// Run the hints of the step on screen: one preview per job, a tick apart, so a moved field (gwHintCancel) stops them.
let gwHintT=0;
function gwHintCancel(){guided.hint=(guided.hint||0)+1;clearTimeout(gwHintT);}
function gwHintQueue(){
  gwHintCancel();
  const box=document.getElementById('gbBody');if(box)box.dataset.hints=guided.open&&guided.step===4?'working':'';
  if(!guided.open||guided.step!==4)return;
  const tok=guided.hint;gwHintT=setTimeout(()=>gwHintRun(tok),150);   // the cards' own delay after a change
}
function gwHintRun(tok){
  const box=document.getElementById('gbBody'),ps=box?[...box.querySelectorAll('.gw-hint[data-h]')]:[];
  if(!ps.length){if(box)box.dataset.hints='done';return;}
  box.dataset.hints='working';const t0=performance.now(),jobs=[];let r0={};
  const kinds=[...new Set(ps.map(p=>gwKind(p.dataset.h)))];
  kinds.forEach(k=>jobs.push(()=>{r0[k]=gwPreview(k);}));
  for(const p of ps){
    const id=p.dataset.h,c=gwEl(id),k=gwKind(id),out=[];
    for(const dir of [-1,1]){const n=gwNear(c,dir);if(!n)continue;
      jobs.push(()=>{const keep=c.value;let r=null;try{c.value=n.v;r=gwPreview(k);}catch(e){r=null;}finally{c.value=keep;}
        out.push(r0[k]?gwHintSide(k,dir,n,r0[k],r):'');p.textContent=out.filter(Boolean).join('\n');});}
  }
  const step=()=>{
    if(guided.hint!==tok||!guided.open||guided.step!==4)return;
    const j=jobs.shift();if(j)j();
    if(jobs.length)gwHintT=setTimeout(step,0);
    else{box.dataset.hints='done';guided.hintMs=performance.now()-t0;ps.forEach(p=>{if(p.textContent==='…')p.textContent='';});}
  };
  step();
}

// ====== The finish screen (build G10; plans/guided-build.md, build 3) ======
// The build against the factory car it started from, in the figures BUILD left: the scorecard's (engine.score), the car's
// run (perf) and its price (engine plus car, as the budget question counts it). No new estimate is made here.
function gfFigures(){
  const s=(engine&&engine.score)||{},P=perf||{};
  return {hp:s.peakHP,tq:s.peakTQ,t100:P.t100,top:P.topSpeed,mass:vehicle&&vehicle.mass,
    cost:((engine&&engine.cost)||0)+((vehicle&&vehicle.cost)||0),rel:s.reliability};
}
// [key, label, unit, decimals, which way is better, the goal it answers]
const GF_ROWS=[['hp','PEAK POWER',' hp',0,1],['tq','TORQUE',' Nm',0,1],['t100','0–100 km/h',' s',2,-1,'quick'],['top','TOP SPEED',' km/h',0,1],
  ['mass','WEIGHT',' kg',0,-1,'light'],['cost','PRICE','$',0,-1,'cheap'],['rel','RELIABILITY','',0,1]];
// The limit the build sits on: the first lit of knock and valve float (the ENGINE card), then tyre rating and grip
// (the VEHICLE card), in that card's own verdict; '' if none is lit.
function gfLimit(){
  const ri=typeof icdCompute==='function'?icdCompute():null;
  if(ri&&(icdKnockOver(ri)||icdFloatShort(ri)||(typeof icdPreIgn==='function'&&icdPreIgn(ri))||(typeof icdPmaxOver==='function'&&icdPmaxOver(ri))))return ICD.cfg.limits(ri).verdict;
  const re=typeof evdCompute==='function'?evdCompute():null;
  if(re&&(re.pk<re.pkM*0.99||re.nTip<Math.min(re.maxRpm||Infinity,re.nFreq)-1||re.nFreq<Math.min(re.maxRpm||Infinity,re.nTip)-1))return EVD.cfg.limits(re).verdict;
  const rc=vehicle?vcdCompute():null;
  if(rc&&(vcdTyresShort(rc)||vcdGripBound(rc)))return VCD.cfg.limits(rc).verdict;
  return '';
}
function gfRender(){
  const a=guided.base||{},b=gfFigures(),fmt=(v,u,dp)=>v==null||!isFinite(v)?'—':(u==='$'?'$':'')+dcFmt(v,dp)+(u==='$'?'':u);
  const rows=GF_ROWS.map(([k,l,u,dp,good,goal])=>{
    const d=a[k]!=null&&b[k]!=null?+(b[k]-a[k]).toFixed(dp):0;
    const dd=d?'<span class="'+(Math.sign(d)===good?'up':'dn')+'">'+gwSigned(d,u,dp)+'</span>':'';
    return '<tr data-k="'+k+'"'+(goal===guided.goal?' class="on"':'')+'><th>'+esc(tr(l))+'</th><td>'+fmt(a[k],u,dp)+'</td><td>'+fmt(b[k],u,dp)+'</td><td>'+dd+'</td></tr>';}).join('');
  const lim=gfLimit(),p=FACTORY_CARS[guided.car];
  return '<p class="gb-step">'+esc(tr('FINISH'))+'</p><h3>'+esc(tr('Your build against the car it started from'))+'</h3>'+
    '<table class="gf-tab"><thead><tr><th></th><td>'+esc(p?p.name:tr('FACTORY'))+'</td><td>'+esc(tr('YOUR BUILD'))+'</td><td></td></tr></thead><tbody>'+rows+'</tbody></table>'+
    '<p class="gw-what" id="gfLimit">'+esc(lim||tr('No limit on the cards is lit: no knock, valve float, tyre rating or grip holds it back.'))+'</p>'+
    '<div class="gw-act"><button type="button" id="gfDrive" class="sc-drive">'+esc(tr('DRIVE IT'))+'</button>'+
    '<button type="button" id="gfSteps">'+esc(tr('BACK TO STEPS'))+'</button><button type="button" id="gfOver">'+esc(tr('START OVER'))+'</button></div>';
}
