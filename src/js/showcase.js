// ====== CAR SHOWCASE (build 237) ======
// Every factory car in one place: its showroom picture (src/js/car-art.js), its order number, and the figures its maker
// published, as the presets carry them with their sources. Pick a card to see the car large; DRIVE THIS CAR loads it
// with its own engine, exactly as the FACTORY CAR picker on the VEHICLE tab does, and opens that tab.
//
// What it shows is the maker's figures only, never the sim's: those come from the physics once the car is loaded, and
// the VEHICLE tab shows them beside the maker's. So nothing here is computed, and no number in the sim moves.
//   · power and torque: the factory engine's `real` (FACTORY_ENGINES); a hybrid adds the system output where the
//     maker gave one (sysKW). The electric drives carry no single published power figure in their presets, so their
//     line shows the drive itself.
//   · mass: the body's curb mass (body.kg); 0–100 and top speed: the car's `real`, with `limited` for a governed top.
//   · drive: the factory fitment's driven wheels.
// Opened from the title menu (CAR SHOWCASE); BACK returns there. Arrow keys walk the cards, Enter drives, Escape backs.
const SC_ALL='ALL';
const showcase={open:false,fam:SC_ALL,sel:0,from:null};
// The cars of the family shown, in order-number order: the number is the car's place in the collection.
function scList(){
  return FACTORY_CARS.map((p,i)=>({p,i})).filter(x=>showcase.fam===SC_ALL||x.p.cat===showcase.fam)
    .sort((a,b)=>(CAR_NO[a.p.name]||999)-(CAR_NO[b.p.name]||999));
}
// The figures one card shows: the maker's, read from the presets. Missing figures are left out, never estimated.
function scFigures(p){
  const ep=FACTORY_ENGINES.find(x=>x.name===p.engine)||{},er=ep.real||{},cr=p.real||{},rows=[];
  const n=(v,d)=>Number(v).toLocaleString('en-US',{maximumFractionDigits:d||0});
  rows.push(['ENGINE',ep.name||p.engine]);
  if(er.hp)rows.push(['POWER',n(er.hp)+' hp'+(er.hpRpm?' @ '+n(er.hpRpm)+' rpm':'')]);
  if(er.tq)rows.push(['TORQUE',n(er.tq)+' Nm'+(er.tqRpm?' @ '+n(er.tqRpm)+' rpm':'')]);
  if(er.sysKW)rows.push(['SYSTEM POWER',n(er.sysKW)+' kW ('+n(er.sysKW/0.7457)+' hp)']);
  if(p.body&&p.body.kg)rows.push(['MASS',n(p.body.kg)+' kg']);
  if(cr.t100)rows.push(['0–100 km/h',cr.t100.toFixed(1)+' s']);
  if(cr.top)rows.push(['TOP SPEED',n(cr.top)+' km/h'+(cr.limited?' ('+tr('governed')+')':'')]);
  const dr=p.fit&&p.fit.drive;
  if(dr)rows.push(['DRIVEN WHEELS',dr.toUpperCase()]);
  return rows;
}
function scCard(x,k){
  const p=x.p,url=carArtUrl(p.name);
  return '<button type="button" class="sc-card'+(k===showcase.sel?' on':'')+'" data-k="'+k+'" aria-pressed="'+(k===showcase.sel)+'">'+
    (url?'<img src="'+esc(url)+'" alt="" loading="lazy" decoding="async" width="960" height="640">':'<span class="sc-noart"></span>')+
    '<span class="sc-no">'+esc(carNo(p.name))+'</span><span class="sc-nm">'+esc(p.name)+'</span></button>';
}
function renderShowcaseFilters(){
  const box=document.getElementById('scFilters');if(!box)return;
  const fams=[SC_ALL].concat(FACTORY_CAR_CATS.filter(c=>FACTORY_CARS.some(p=>p.cat===c)));
  box.innerHTML=fams.map(c=>'<button type="button" class="toggle'+(c===showcase.fam?' on':'')+'" data-fam="'+esc(c)+'" aria-pressed="'+(c===showcase.fam)+'">'+
    esc(tr(c))+'</button>').join('');
}
function renderShowcaseDetail(){
  const box=document.getElementById('scDetail');if(!box)return;
  const L=scList(),x=L[showcase.sel];
  if(!x){box.innerHTML='';return;}
  const p=x.p,url=carArtUrl(p.name);
  box.innerHTML=(url?'<img class="sc-big" src="'+esc(url)+'" alt="'+esc(p.name)+'" decoding="async" width="960" height="640">':'')+
    '<h3 id="scName"><span>'+esc(carNo(p.name))+'</span> '+esc(p.name)+'</h3>'+
    '<p class="sc-cat">'+esc(tr(p.cat))+' · '+(showcase.sel+1)+' / '+L.length+'</p>'+
    '<dl class="sc-figs">'+scFigures(p).map(([k,v])=>'<dt>'+esc(tr(k))+'</dt><dd>'+esc(v)+'</dd>').join('')+'</dl>'+
    '<p class="sc-src">'+esc(tr("The maker's published figures. The sim works out its own from the physics once you drive the car."))+'</p>'+
    '<div class="sc-act"><button type="button" id="scPrev" aria-label="'+esc(tr('Previous car'))+'">&lt;</button>'+
    '<button type="button" id="scDrive" class="sc-drive">'+esc(tr('DRIVE THIS CAR'))+'</button>'+
    '<button type="button" id="scNext" aria-label="'+esc(tr('Next car'))+'">&gt;</button></div>';
}
function renderShowcase(){
  const grid=document.getElementById('scGrid');if(!grid)return;
  const L=scList();
  if(showcase.sel>=L.length)showcase.sel=0;
  const h=document.getElementById('scHeading');if(h)h.textContent=tr('CAR SHOWCASE');
  const cnt=document.getElementById('scCount');if(cnt)cnt.textContent=L.length+' '+tr(L.length===1?'car':'cars');
  const back=document.getElementById('scClose');if(back)back.textContent=tr('BACK');
  const fl=document.getElementById('scFilters');if(fl)fl.setAttribute('aria-label',tr('Car families'));
  renderShowcaseFilters();
  grid.innerHTML=L.map(scCard).join('');
  renderShowcaseDetail();
}
// Move the choice without rebuilding the grid, so the pictures already loaded stay put and the list keeps its scroll.
// On a wide screen the grid scrolls beside the detail, so the card is brought into view. On a phone the page is one
// column with the detail on top: a card picked by touch (reveal) scrolls the page up to it, and opening leaves it be.
function scSelect(k,focus,reveal){
  const L=scList();if(!L.length)return;
  showcase.sel=((k%L.length)+L.length)%L.length;
  document.querySelectorAll('#scGrid .sc-card').forEach(b=>{const on=+b.dataset.k===showcase.sel;b.classList.toggle('on',on);b.setAttribute('aria-pressed',on);});
  renderShowcaseDetail();
  const card=document.querySelector('#scGrid .sc-card[data-k="'+showcase.sel+'"]');
  const narrow=window.matchMedia&&window.matchMedia('(max-width:800px)').matches;
  if(card){
    if(!narrow)card.scrollIntoView({block:'nearest'});
    else if(reveal){const d=document.getElementById('scDetail');if(d)d.scrollIntoView({block:'start'});}
    if(focus)card.focus({preventScroll:true});
  }
}
function scDrive(){
  const x=scList()[showcase.sel];if(!x)return;
  closeShowcase(true);
  setTab('vehicle');
  loadFactoryCarUI(x.i);
}
function openShowcase(from){
  const el=document.getElementById('showcase');if(!el)return;
  showcase.from=from||null;
  // open on the car you have loaded, when it is a factory car; else where you last left it
  const cur=typeof vehBody!=='undefined'&&vehBody&&!vehBody.copyOf?vehBody.name:null;
  if(cur){
    if(!scList().some(x=>x.p.name===cur))showcase.fam=SC_ALL;
    showcase.sel=Math.max(0,scList().findIndex(x=>x.p.name===cur));
  }
  el.hidden=false;showcase.open=true;
  document.body.classList.add('showcase-open');
  el.scrollTop=0;
  renderShowcase();
  requestAnimationFrame(()=>scSelect(showcase.sel,true));
}
// leaving: back to the title menu if that is where you came from, unless you are off to drive the car
function closeShowcase(stay){
  const el=document.getElementById('showcase');if(!el||el.hidden)return;
  el.hidden=true;showcase.open=false;
  document.body.classList.remove('showcase-open');
  if(!stay&&showcase.from==='title')openTitleScreen();
}
function bindShowcase(){
  const el=document.getElementById('showcase');if(!el)return;
  el.addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b||!el.contains(b))return;
    if(b.id==='scClose')closeShowcase();
    else if(b.id==='scDrive')scDrive();
    else if(b.id==='scPrev')scSelect(showcase.sel-1);
    else if(b.id==='scNext')scSelect(showcase.sel+1);
    else if(b.dataset.fam!=null){showcase.fam=b.dataset.fam;showcase.sel=0;renderShowcase();scSelect(0);}
    else if(b.dataset.k!=null)scSelect(+b.dataset.k,false,true);
  });
  el.addEventListener('dblclick',e=>{const b=e.target.closest('.sc-card');if(b){scSelect(+b.dataset.k);scDrive();}});
  document.addEventListener('keydown',e=>{
    if(el.hidden)return;
    const inFilters=e.target&&e.target.closest&&e.target.closest('#scFilters');
    if(e.key==='Escape'){closeShowcase();}
    else if(inFilters&&e.key==='Enter')return;               // a family button: let it press itself
    else if(e.key==='ArrowRight'||e.key==='ArrowDown'){scSelect(showcase.sel+1,true);}
    else if(e.key==='ArrowLeft'||e.key==='ArrowUp'){scSelect(showcase.sel-1,true);}
    else if(e.key==='Enter'&&!(e.target&&e.target.id&&/^sc(Close|Prev|Next)$/.test(e.target.id))){scDrive();}
    else return;
    e.preventDefault();e.stopPropagation();
  },true);
}
