// ====== GUIDED BUILD (build 306, phase G) ======
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
const guided={open:false,step:0,fam:null,budget:Infinity,goal:'quick',pick:0,from:null};
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
    tr({eco:'Hard, low-rolling-resistance rubber: it saves fuel and lasts, but grips least.',street:'An everyday tyre: grip and comfort in balance.',
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
    '<div class="gb-act"><button type="button" id="gbBuild" class="sc-drive">'+esc(tr('BUILD THIS CAR'))+'</button></div>'+
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
  }else html=gbResult();
  box.innerHTML=html;
}
// each step opens at its top: the result's first control is below the car's picture and parts, so it takes focus unscrolled
function gbFocus(){const box=document.getElementById('gbBody');if(box)box.scrollTop=0;
  requestAnimationFrame(()=>{const b=document.querySelector(guided.step===3?'#gbBuild':'#gbBody .gb-opt');if(b)b.focus({preventScroll:true});});}
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
function gbBack(){if(guided.step>0){guided.step--;guided.pick=0;renderGuided();gbFocus();}else closeGuided();}
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
