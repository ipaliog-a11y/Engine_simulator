// ====== THE ELECTRIC DRIVE AS CARDS: the ENGINE tab's motor, inverter and battery, explained as you set them (build 238) ======
// The fields are the ones electric-ui.js has always read (#evRotorD and the rest, in src/shell.html), grouped into
// cards. This file adds, around them, what a player needs to set them without guessing:
//   · a menu of the cards, one open at a time (on a phone the cards stack and fold instead);
//   · a slider beside each number, with a tick for every real drive in the presets and their range shaded;
//   · a "?" that explains the input in the side panel: what it is, what it trades, the real drives' values, the guide;
//   · the effect of each change, beside the input that made it: + or - kW, Nm, top rpm, kg and cost;
//   · a side panel of what the drive gives, its curve, and what holds it back (the battery or the motor; the rim, the
//     inverter or the design limit for the top speed). On a phone it is a bar at the bottom that opens.
// Nothing here is physics of its own. The preview runs the functions the build and the dyno run: evMotorOf and
// driveTorqueRated for an electric car (exactly scoreMotor's sweep, so its peaks are the DYNO's), buildHybrid and
// hybMotorTq for a hybrid's motor. tools/fingerprint.mjs is identical across this build.
// Adding a parameter: its field in src/shell.html inside the right card, and one entry in EVD_FIELDS. The card's layout,
// slider, ticks, help and Greek (through tr) come from that.

const EVD_CARDS=[
  {id:'size',title:'ROTOR & STATOR',guide:'evmotor',viz:'section',cap:'To scale: the stator and its slots, the rotor with its N (red) and S (blue) poles, and the length of the stack beside it.'},
  {id:'wind',title:'WINDING',guide:'evmotor',viz:'knee',cap:"The knee: where the motor's back-EMF at full current meets the most voltage the battery lets the inverter make."},
  {id:'mag',title:'MAGNETS & TOP SPEED',guide:'evmotor'},
  {id:'cool',title:'COOLING & IRON',guide:'evmotor'},
  {id:'inv',title:'INVERTER',guide:'inverter'},
  {id:'more',title:'MORE MOTORS',guide:'evmotors'},
  {id:'batt',title:'BATTERY',guide:'battery',viz:'pack',cap:'Cells in series set the voltage; cells in parallel share the current.'}
];
// One entry per field: its help, whether it is an advanced setting, and how its slider runs (log for a range of decades).
const EVD_FRONT_HELP={what:"The front motor's own size, winding and current, as for the main motor.",
  trade:'Each works as the same input does on the ROTOR & STATOR, WINDING and INVERTER cards.'};
const EVD_FIELDS={
  evMotorType:{what:'How the rotor gets its magnetic field.',
    trade:'Magnets give the most torque per amp and the best efficiency, but cost money and weaken when hot. An induction rotor, a copper cage, buys its field with current: less torque per amp and a hotter rotor, but no magnets, and no drag when it gives no torque.'},
  evRotorD:{what:'The diameter of the rotor. The stator around it is about 1.5 times as wide.',
    trade:"Torque grows with the diameter squared. A wider rotor is heavier, has more inertia, and its rim reaches the speed its magnets can stand at a lower rpm."},
  evStack:{what:'How long the rotor and the stator are, along the shaft.',
    trade:'Torque grows in proportion to the length, with no effect on the speed limits. It adds mass, and the back-EMF grows with it, so the knee comes at a lower rpm.'},
  evPoles:{what:'How many magnetic poles go round the rotor.',
    trade:"More poles: shorter end windings and a thinner, lighter core. The electrical frequency rises with them: more iron loss, and the inverter's highest frequency stops the motor sooner."},
  evTurns:{what:'How many turns of copper each of the three phases has.',
    trade:"More turns: more torque per amp, but more back-EMF per rpm, so the knee comes earlier and there is less power at speed. Match the turns to the battery's voltage and the inverter's current."},
  evWire:{adv:true,what:'The shape of the copper in the slots.',
    trade:'Hairpin bars fill 70% of a slot, round wire 40%: less resistance and less heat. Thick bars lose more to eddy currents at high frequency.'},
  evConductor:{adv:true,what:'The metal of the winding.',
    trade:'Aluminium has about 60% more resistance than copper, but weighs a third as much and costs less: a lighter, cheaper motor that makes more heat.'},
  evMagnet:{what:"What the rotor's magnets are made of.",
    trade:'Ferrite is cheap and stands 250 °C, but it is a third as strong. NdFeB is the strong standard, good to 150 °C. Dysprosium raises that to 180 °C, for a little less strength and a higher price.'},
  evRetention:{adv:true,what:'What holds the magnets in against the spin.',
    trade:'Iron bridges in the steel let the rim reach 150 m/s. A carbon-fibre sleeve allows 220 m/s, so a much higher top speed, for about $450.'},
  evMaxRpm:{adv:true,what:'The speed the bearings, the balance and the gearing are built for.',
    trade:"The motor stops at the lowest of this, the rim's limit and the inverter's frequency. WHAT HOLDS IT BACK shows which one."},
  evCooling:{what:'How the heat leaves the copper and the magnets.',
    trade:'It hardly moves the peak, which is taken with the motor cool. It decides how long the peak lasts, and how much power the motor holds for good.'},
  evLamination:{adv:true,what:'How thick the steel sheets of the core are.',
    trade:'Eddy-current loss falls with the square of the thickness: 0.20 mm sheets waste less at high speed, for $4 more per kg of steel.'},
  evInverter:{what:"The power switches that turn the battery's direct current into the motor's three phases.",
    trade:'Silicon carbide loses less in switching, and reaches 2 kHz against 1.2 kHz: a higher top speed with many poles. It costs more per amp.'},
  evAmps:{what:'The most current the inverter sends to the motor.',
    trade:'It sets the torque below the knee: torque is flux times current, until the iron saturates. Each amp costs money, and more current makes more heat in the copper.'},
  evRegen:{what:'How hard the motor brakes as a generator.',
    trade:'HIGH takes back all the motor and the battery can; LOW half of that; OFF none. Energy taken back goes into the battery for the rest of the lap.'},
  evRearCount:{what:'One rear motor, or one for each rear wheel.',trade:'Two motors give twice the torque, and add their mass and cost. They share the battery.'},
  evFront:{what:'A motor on the front axle, which makes the car all-wheel drive.',
    trade:'A magnet motor adds the most. An induction motor has no drag when it gives no torque, so at a cruise the controller lets it idle, as Tesla does.'},
  evFrontD:EVD_FRONT_HELP,evFrontStack:EVD_FRONT_HELP,evFrontPoles:EVD_FRONT_HELP,evFrontTurns:EVD_FRONT_HELP,evFrontAmps:EVD_FRONT_HELP,
  evFrontFd:{what:"The front motor's own reduction gear. 0 lets the game match it to the main motor.",
    trade:'A higher ratio multiplies the front torque at the wheels, and the front motor reaches its top speed at a lower road speed.'},
  evChem:{what:'What the cells are made of.',
    trade:'It sets the energy per kg (range), the power per kg (acceleration), the cost and the voltage. Hybrid cells give and take a lot of power from a small pack.'},
  evSeries:{what:'How many cells are connected end to end.',
    trade:"The pack's voltage is the cells in series times a cell's voltage. More voltage moves the knee to a higher rpm, so the power holds to a higher speed."},
  evKWh:{log:true,what:'How much energy the pack stores.',
    trade:'More capacity: more range, and more cells in parallel to share the current, so more power too. It costs mass and money.'},
  evYear:{adv:true,what:'The year the cells are made in.',
    trade:'Energy per kg and cost per kWh improve with the year. A chemistry is offered only from the year it reached cars.'}
};
const EVD_SPEED_FIELDS=['evMotorType','evFront','evYear'];   // their change enables or disables other fields

const evdState={ready:false,card:'size',adv:false,help:null,res:null,prev:null,last:null,chips:'',mode:'ev',queued:0,timer:0,slow:null};
const evdG=id=>document.getElementById(id);
const evdFmt=(x,d=0)=>(+x).toLocaleString('en-US',{maximumFractionDigits:d,minimumFractionDigits:d});
// Narrow is the panel's width, as the stylesheet's container queries read it (700 px); hidden, the screen's.
const evdPhone=()=>{const p=evdG('designPanel'),w=p?p.getBoundingClientRect().width:0;
  if(w>0)return w<=700;try{return matchMedia('(max-width:760px)').matches;}catch(e){return false;}};
const evdField=id=>{const el=evdG(id);return el&&el.closest('.field');};
const evdCardFields=c=>[...document.querySelectorAll('#evdCard-'+c+' .evd-fields>.field')];
const evdOptText=id=>{const el=evdG(id);return el&&el.selectedOptions&&el.selectedOptions[0]?el.selectedOptions[0].textContent:'';};

// The real drives behind the ticks: the factory electric and hybrid presets, by a short name.
function evdRealDrives(){
  return EV_ENGINE_PRESETS.concat(HYB_ENGINE_PRESETS).map(p=>{
    const m=/\(([^)]+)\)\s*$/.exec(p.name),
      name=p.cat==='Electric'?p.name.replace(/ drive \(.*$/,''):(m?m[1]:p.name);
    return {name,e:p.engine};
  });
}
function evdTicks(id){
  const by=new Map();
  for(const d of evdRealDrives()){const v=d.e[id];if(v==null||v==='none')continue;
    if(/^evFront(D|Stack|Poles|Turns|Amps)$/.test(id)&&!(d.e.evFront==='pm'||d.e.evFront==='im'))continue;
    if(!by.has(+v))by.set(+v,[]);by.get(+v).push(d.name);}
  return [...by].map(([v,names])=>({v,names})).sort((a,b)=>a.v-b.v);
}
function evdUsing(id,val){
  return evdRealDrives().filter(d=>d.e[id]!=null&&String(d.e[id])===String(val)&&
    !(/^evFront(D|Stack|Poles|Turns|Amps)$/.test(id)&&!(d.e.evFront==='pm'||d.e.evFront==='im'))).map(d=>d.name);
}

// ---- the preview: what the drive gives, from the same functions the build and the dyno use ----
function evdCompute(){
  const e=readEngineFromForm(),hybrid=e.type!=='electric';
  if(hybrid){
    if(!e.hyMode)return null;
    const hy=buildHybrid(e);if(!hy)return null;
    const m=hy.motor,V=hybBusV(hy),pb=packMaxPower(hy.pack,HYB_SOC)*(hy.shareR||1)/1000,pts=[];
    let pk=0,tq=0,pkM=0;
    for(let r=100;r<=m.nMax;r+=100){
      const T=hybMotorTq(hy,r),Tm=motorMaxTorque(m,r,V,60),w=r*Math.PI/30;
      pts.push({r,T,Tm});pk=Math.max(pk,T*w/1000);tq=Math.max(tq,T);pkM=Math.max(pkM,Tm*w/1000);
    }
    return {hybrid,m,pack:hy.pack,V,pb,pts,pk,tq,pkM,top:m.nMax,mass:m.mass,packMass:hy.pack.mass,cost:m.cost+hy.pack.cost,
      knee:motorBaseW(m,V,motorPsi(m,60))*30/Math.PI,nTip:m.nTip,nFreq:m.nFreq,poles:m.poles,vTip:m.ret.vTip,maxRpm:e.evMaxRpm};
  }
  const m=evMotorOf(e),pack=packBuild({chem:e.evChem,series:e.evSeries,kWh:e.evKWh,year:e.evYear});
  const d={motor:m,pack,redline:Math.floor(m.nMax/50)*50},V=packOcv(pack,0.5),tc=m.cool.tCool,cool={w:tc,c:tc,r:60},pts=[];
  // scoreMotor's sweep at the rated voltage, so the peaks here are the ones the DYNO reports after BUILD
  let pk=0,tq=0,pkM=0;
  for(let r=100;r<=d.redline;r+=100){
    const T=driveTorqueRated(d,r,V,cool),Tm=motorMaxTorque(m,r,V,60),w=r*Math.PI/30;
    pts.push({r,T,Tm});if(T*w>pk*1000)pk=T*w/1000;if(T>tq+0.5)tq=T;pkM=Math.max(pkM,Tm*w/1000);
  }
  const parts=m.parts?m.parts.map(q=>q.m):[m];
  return {hybrid,d,m,pack,V,pb:packMaxPower(pack,0.5)/1000,pts,pk,tq,pkM,top:m.nMax,mass:m.mass,packMass:pack.mass,cost:m.cost+pack.cost,
    knee:motorBaseW(m,V,motorPsi(m,60))*30/Math.PI,nTip:Math.min(...parts.map(q=>q.nTip)),nFreq:Math.min(...parts.map(q=>q.nFreq)),
    poles:m.poles,vTip:m.ret.vTip,maxRpm:e.evMaxRpm};
}
// How long the peak lasts and what the cooling holds for good (electric only): slower, so worked out after a pause.
function evdComputeSlow(r){
  if(!r||r.hybrid)return null;
  return {hold:motorPeakHold(r.d,r.V),cont:motorContinuousKW(r.d,r.V)};
}

// ---- building the cards around the fields (once) ----
function evdInit(){
  const box=evdG('evDesigner');if(!box||evdState.ready)return!!box;
  evdState.ready=true;
  try{evdState.adv=localStorage.getItem('pes.evdAdv')==='1';const c=localStorage.getItem('pes.evdCard');if(EVD_CARDS.some(k=>k.id===c))evdState.card=c;}catch(e){}
  const cards=evdG('evdCards');
  const bar=document.createElement('div');bar.className='evd-bar';
  bar.innerHTML='<div class="evd-seg" role="group" id="evdLevel"><button type="button" data-lv="0"></button><button type="button" data-lv="1"></button></div>';
  cards.prepend(bar);
  bar.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>evdSetAdv(b.dataset.lv==='1')));
  for(const c of EVD_CARDS){
    const card=evdG('evdCard-'+c.id);
    const head=document.createElement('button');head.type='button';head.className='evd-head';head.setAttribute('aria-controls','evdCard-'+c.id);
    head.innerHTML='<canvas class="evd-ic" width="14" height="14" data-icon="'+c.id+'"></canvas><span class="evd-ht"><span class="evd-t"></span><span class="evd-sum"></span></span><span class="evd-ar"></span>';
    head.addEventListener('click',()=>{if(!evdPhone())return;evdState.card=evdState.card===c.id?null:c.id;evdLayout();});
    card.prepend(head);
    const body=card.querySelector('.evd-fields');
    const wrap=document.createElement('div');wrap.className='evd-body'+(c.viz?'':' noviz');
    card.insertBefore(wrap,body);wrap.appendChild(body);
    if(c.viz){const v=document.createElement('div');v.className='evd-viz';
      v.innerHTML='<canvas id="evdViz-'+c.id+'" width="232" height="'+(c.viz==='section'?200:150)+'"></canvas><div class="evd-cap"></div>';wrap.appendChild(v);}
    const more=document.createElement('div');more.className='evd-more';body.appendChild(more);
    const rb=document.createElement('button');rb.type='button';rb.className='evd-rb';rb.id='evdRb-'+c.id;rb.setAttribute('aria-controls','evdCard-'+c.id);
    rb.innerHTML='<canvas class="evd-ic" width="14" height="14" data-icon="'+c.id+'"></canvas><span class="evd-t"></span><span class="evd-sum"></span>';
    rb.addEventListener('click',()=>{evdState.card=c.id;evdLayout();try{localStorage.setItem('pes.evdCard',c.id);}catch(e){}});
    evdG('evdRail').appendChild(rb);
  }
  document.querySelectorAll('#evDesigner .evd-fields>.field').forEach(evdEnhance);
  evdG('evdSide').innerHTML=
    '<button type="button" class="evd-mini" id="evdMini" aria-expanded="false" aria-controls="evdSide"></button>'+
    '<section class="evd-panel"><h4 id="evdH1"></h4><div class="evd-stats" id="evdStats"></div>'+
    '<canvas id="evdCurve" width="320" height="150"></canvas><div class="evd-legend" id="evdLegend"></div><div class="evd-slow" id="evdSlow"></div></section>'+
    '<section class="evd-panel"><h4 id="evdH2"></h4><div class="evd-lims" id="evdLims"></div><div class="evd-verdict" id="evdVerdict"></div></section>'+
    '<section class="evd-panel evd-helpbox" aria-live="polite"><h4 id="evdH3"></h4><div class="evd-help" id="evdHelp"></div></section>';
  evdG('evdMini').addEventListener('click',()=>{const o=evdG('evdSide').classList.toggle('open');evdG('evdMini').setAttribute('aria-expanded',o);evdRenderResults();});
  box.addEventListener('input',e=>{if(e.target.matches('.evd-fields input[type=number]'))evdChanged(e.target.id,false);});
  box.addEventListener('change',e=>{if(e.target.matches('.evd-fields input[type=number], .evd-fields select'))evdChanged(e.target.id,true);});
  let wasNarrow=null;window.addEventListener('resize',()=>{const n=evdPhone();if(n!==wasNarrow){wasNarrow=n;evdLayout();}evdDrawViz();evdDrawCurve();});
  return true;
}
// One field: [?] LABEL [slider] [box], then a line that appears when there is something to say, then the help (phone).
function evdEnhance(f){
  const ctl=f.querySelector('input,select'),id=ctl.id,spec=EVD_FIELDS[id]||{};
  f.classList.add('evd-row');if(spec.adv)f.classList.add('evd-adv');
  const q=document.createElement('button');q.type='button';q.className='evd-q';q.textContent='?';q.dataset.f=id;q.setAttribute('aria-expanded','false');
  q.addEventListener('click',()=>evdShowHelp(evdState.help===id?null:id));
  f.prepend(q);
  if(ctl.type==='number'){
    const lo=+ctl.min,hi=+ctl.max,tr0=document.createElement('div');tr0.className='evd-track';
    const pos=v=>spec.log?Math.log(v/lo)/Math.log(hi/lo)*100:(v-lo)/(hi-lo)*100;
    const ticks=evdTicks(id);
    if(ticks.length){const a=pos(ticks[0].v),b=pos(ticks[ticks.length-1].v);
      tr0.insertAdjacentHTML('beforeend','<span class="evd-band" style="left:'+a+'%;width:'+Math.max(1.5,b-a)+'%"></span>');}
    const rng=document.createElement('input');rng.type='range';rng.min=0;rng.max=1000;rng.step=1;rng.tabIndex=-1;rng.setAttribute('aria-hidden','true');
    rng.dataset.f=id;tr0.appendChild(rng);
    const toVal=k=>{const x=spec.log?lo*Math.pow(hi/lo,k/1000):lo+(hi-lo)*k/1000,st=+ctl.step||1;return Math.round(x/st)*st;};
    rng.addEventListener('input',()=>{ctl.value=+toVal(+rng.value).toFixed(2);evdChanged(id,false);});
    rng.addEventListener('change',()=>{ctl.dispatchEvent(new Event('change',{bubbles:true}));});
    for(const t of ticks){const b=document.createElement('button');b.type='button';b.className='evd-tick';b.style.left=pos(t.v)+'%';
      b.dataset.v=t.v;b.dataset.names=t.names.join(', ');
      b.addEventListener('click',()=>{ctl.value=t.v;ctl.dispatchEvent(new Event('change',{bubbles:true}));});tr0.appendChild(b);}
    tr0._pos=pos;
    f.insertBefore(tr0,ctl);
  }
  const meta=document.createElement('div');meta.className='evd-meta';meta.id='evdMeta-'+id;f.appendChild(meta);
  const ih=document.createElement('div');ih.className='evd-inhelp evd-help';ih.hidden=true;ih.dataset.f=id;f.appendChild(ih);
}

// ---- reacting to the form ----
function evdChanged(id,done){
  const el=evdG(id);if(!el)return;
  if(done&&EVD_SPEED_FIELDS.includes(id)){syncDesignEnable();return;}   // syncs the dependent fields, then evdSync
  evdState.last=id;
  evdQueue(true);
  if(evdState.help||!evdPhone())evdShowHelp(id,true);
}
// Called by syncElectricSections whenever the form is synced (a preset, the engine type, the language).
function evdSync(ev,hy){
  if(!(ev||hy)){evdState.res=null;return;}
  if(!evdInit())return;
  evdState.mode=ev?'ev':'hy';
  evdRenderText();
  evdQueue(false);
}
// The preview is worked out once per frame at most, while a slider is dragged.
function evdQueue(change){
  if(change)evdState.prev=evdState.res;else{evdState.prev=null;evdState.last=null;}
  if(evdState.queued)return;
  evdState.queued=requestAnimationFrame(()=>{evdState.queued=0;evdUpdate();});
}
function evdUpdate(){
  const panel=evdG('designPanel');if(!panel||!(panel.classList.contains('ev')||panel.classList.contains('hy')))return;
  let r=null;try{r=evdCompute();}catch(e){r=null;}
  const before=evdState.prev||null;
  evdState.res=r;
  evdState.chips=before&&r&&evdState.last?evdChips(before,r):'';
  evdState.slow=null;clearTimeout(evdState.timer);
  if(r&&!r.hybrid)evdState.timer=setTimeout(()=>{try{evdState.slow=evdComputeSlow(evdState.res);}catch(e){evdState.slow=null;}evdRenderResults();},250);
  evdRenderFields();evdRenderResults();
}

// ---- the effect of a change, as chips ----
const EVD_DELTA=[['pk',' kW',0,1,''],['tq',' Nm',0,1,''],['top',' rpm',-2,1,'top'],['mass',' kg',1,-1,'motor'],['packMass',' kg',0,-1,'pack'],['cost','',-2,-1,'cost']];
function evdChips(a,b){
  const out=[];
  for(const [k,u,dp,good,w] of EVD_DELTA){
    const d=b[k]-a[k];if(Math.abs(d)<Math.max(1e-6,0.004*Math.abs(a[k])))continue;
    const n=dp<0?evdFmt(Math.round(Math.abs(d)/Math.pow(10,-dp))*Math.pow(10,-dp)):evdFmt(Math.abs(d),dp);
    out.push('<span class="evd-chip '+(Math.sign(d)===good?'up':'dn')+'">'+(d>0?'+':'−')+(k==='cost'?'$':'')+n+u+(w?' '+tr(w):'')+'</span>');
  }
  return out.join('')||'<span class="evd-chip eq">'+tr('no change to the peak figures')+'</span>';
}

// ---- drawing the text: card names, summaries, labels (on every sync, so a language change shows at once) ----
function evdRenderText(){
  for(const c of EVD_CARDS){
    document.querySelectorAll('#evdCard-'+c.id+' .evd-t, #evdRb-'+c.id+' .evd-t').forEach(t=>t.textContent=tr(c.title));
    const cap=document.querySelector('#evdCard-'+c.id+' .evd-cap');if(cap)cap.textContent=tr(c.cap);
  }
  const lv=evdG('evdLevel');lv.setAttribute('aria-label',tr('Detail'));
  lv.children[0].textContent=tr('BASIC');lv.children[1].textContent=tr('ADVANCED');
  document.querySelectorAll('#evDesigner .evd-q').forEach(q=>{const l=q.parentElement.querySelector('label');q.setAttribute('aria-label',tr('About this input')+': '+(l?l.textContent:''));});
  document.querySelectorAll('#evDesigner .evd-tick').forEach(b=>{const t=b.dataset.names+': '+evdFmt(+b.dataset.v,+b.dataset.v%1?2:0);b.title=t;b.setAttribute('aria-label',tr('Set to')+' '+t);});
  evdG('evdH1').textContent=tr(evdState.mode==='hy'?'WHAT THE MOTOR DOES':'WHAT YOUR DRIVE DOES');
  evdG('evdH2').textContent=tr('WHAT HOLDS IT BACK');evdG('evdH3').textContent=tr('ABOUT THIS INPUT');
  evdG('evdLegend').innerHTML='<span><i class="p"></i>'+tr('power')+'</span><span><i class="t"></i>'+tr('torque')+'</span><span><i class="m"></i>'+tr('motor alone')+'</span>';
  evdG('evdCurve').setAttribute('aria-label',tr('Torque and power against motor speed'));
  evdLayout();
  evdShowHelp(evdState.help,true);
}
function evdSetAdv(on){
  evdState.adv=on;try{localStorage.setItem('pes.evdAdv',on?'1':'0');}catch(e){}
  evdRenderFields();
}
// Which card is open: on a desktop, the one chosen in the menu; on a phone, the one unfolded (or none).
function evdLayout(){
  if(!evdState.card&&!evdPhone())evdState.card='size';
  for(const c of EVD_CARDS){const on=c.id===evdState.card,card=evdG('evdCard-'+c.id);
    card.classList.toggle('on',on);evdG('evdRb-'+c.id).setAttribute('aria-current',on?'true':'false');
    const h=card.querySelector('.evd-head');h.setAttribute('aria-expanded',on?'true':'false');h.querySelector('.evd-ar').textContent=on?'▲':'▼';}
  evdDrawIcons();evdDrawViz();
}

// ---- each field's state, warnings and slider ----
function evdRenderFields(){
  const r=evdState.res;
  const lv=evdG('evdLevel');if(lv){lv.children[0].setAttribute('aria-pressed',!evdState.adv);lv.children[1].setAttribute('aria-pressed',evdState.adv);}
  const warn={};
  if(r){
    if(r.nTip<Math.min(r.maxRpm,r.nFreq)-1)warn.evRotorD=tr('The rim reaches {v} m/s at {n} rpm: the motor stops there.').replace('{v}',r.vTip).replace('{n}',evdFmt(Math.round(r.nTip/100)*100));
    if(r.nFreq<Math.min(r.maxRpm,r.nTip)-1)warn.evPoles=tr("With {p} poles the inverter's frequency stops the motor at {n} rpm.").replace('{p}',r.poles).replace('{n}',evdFmt(Math.round(r.nFreq/100)*100));
  }
  const warnCards=new Set();
  document.querySelectorAll('#evDesigner .evd-row').forEach(f=>{
    const ctl=f.querySelector('input:not([type=range]),select'),id=ctl.id;
    f.classList.toggle('evd-off',ctl.disabled);   // a magnet grade on an induction motor, a front motor's size with none fitted
    f.classList.toggle('evd-hide',f.classList.contains('evd-adv')&&!evdState.adv);
    const rng=f.querySelector('input[type=range]');
    if(rng){const tr0=rng.parentElement,v=+ctl.value;rng.value=Math.round(Math.max(0,Math.min(100,tr0._pos(v)))*10);}
    let h='';
    if(warn[id]){h+='<span class="evd-warn">▲ '+warn[id]+'</span>';warnCards.add(f.closest('.evd-card').dataset.card);}
    if(id===evdState.last&&evdState.chips)h+=evdState.chips;
    else if(ctl.type==='number'){const u=evdUsing(id,ctl.value);if(u.length)h+='<span class="evd-real">• '+u.slice(0,2).join(', ')+(u.length>2?' +'+(u.length-2):'')+'</span>';}
    evdG('evdMeta-'+id).innerHTML=h;
  });
  for(const c of EVD_CARDS){
    const s=evdSummary(c.id,r);
    document.querySelectorAll('#evdCard-'+c.id+' .evd-sum, #evdRb-'+c.id+' .evd-sum').forEach(t=>t.textContent=s);
    evdG('evdRb-'+c.id).classList.toggle('warn',warnCards.has(c.id));
    const hidden=evdCardFields(c.id).filter(f=>f.classList.contains('evd-hide')&&!f.classList.contains('evd-off')&&evdVisibleByMode(f)).length;
    const more=document.querySelector('#evdCard-'+c.id+' .evd-more');
    more.innerHTML=hidden?'<button type="button">'+tr('{n} more in ADVANCED').replace('{n}',hidden)+'</button>':'';
    const b=more.querySelector('button');if(b)b.addEventListener('click',()=>evdSetAdv(true));
  }
  evdDrawViz();
}
// data-ev-only and data-hy fields are not shown in the other mode: they are not "more" either.
function evdVisibleByMode(f){
  if(evdState.mode==='hy'&&f.hasAttribute('data-ev-only'))return false;
  if(evdState.mode==='ev'&&f.hasAttribute('data-hy'))return false;
  return true;
}
function evdSummary(c,r){
  const g=id=>evdG(id).value,km=x=>evdFmt(x);
  switch(c){
    case 'size':return evdOptText('evMotorType')+' · Ø'+g('evRotorD')+' × '+g('evStack')+' mm · '+g('evPoles')+' '+tr('poles')+(r?' · '+km(r.mass)+' kg':'');
    case 'wind':return g('evTurns')+' '+tr('turns')+' · '+evdOptText('evWire')+(r&&r.knee<r.top?' · '+tr('knee')+' '+km(Math.round(r.knee/100)*100)+' rpm':'');
    case 'mag':return (evdG('evMagnet').disabled?'':evdOptText('evMagnet')+' · ')+tr('top')+' '+(r?km(Math.round(r.top/100)*100):g('evMaxRpm'))+' rpm';
    case 'cool':return evdOptText('evCooling')+' · '+evdOptText('evLamination');
    case 'inv':return evdOptText('evInverter')+' · '+g('evAmps')+' A';
    case 'more':return (evdState.mode==='ev'?evdOptText('evRearCount')+' · ':'')+evdOptText('evFront');
    case 'batt':return evdOptText('evChem')+(r?' · '+km(r.V)+' V':'')+' · '+g('evKWh')+' kWh'+(r?' · '+km(r.packMass)+' kg':'');
  }
  return '';
}

// ---- the side panel ----
function evdRenderResults(){
  const r=evdState.res,p=evdState.prev;if(!evdG('evdStats'))return;
  if(!r){evdG('evdStats').innerHTML='';evdG('evdLims').innerHTML='';evdG('evdVerdict').textContent='';evdG('evdMini').textContent='';return;}
  const d=(k,good,dp)=>{if(!p||!evdState.last)return'';const x=r[k]-p[k];if(Math.abs(x)<Math.max(1e-6,0.004*Math.abs(p[k])))return'';
    return'<span class="'+(Math.sign(x)===good?'up':'dn')+'">'+(x>0?'+':'−')+(k==='cost'?'$':'')+evdFmt(Math.abs(x),dp)+'</span>';};
  const st=[['PEAK POWER',evdFmt(r.pk),'kW',d('pk',1,0)],['TORQUE',evdFmt(r.tq),'Nm',d('tq',1,0)],['TOP RPM',evdFmt(r.top/1000,1),'k rpm',d('top',1,0)],
    ['MOTOR',evdFmt(r.mass),'kg',d('mass',-1,1)],['PACK',evdFmt(r.packMass),'kg',d('packMass',-1,0)],['COST','$'+evdFmt(r.cost/1000,1),'k',d('cost',-1,0)]];
  evdG('evdStats').innerHTML=st.map(([l,v,u,dd])=>'<div class="evd-stat"><span class="l">'+tr(l)+'</span><span class="v">'+v+'<small>'+u+'</small></span><span class="dd">'+dd+'</span></div>').join('');
  const s=evdState.slow;
  evdG('evdSlow').textContent=r.hybrid?'':s?tr('Cooling: peak torque for {s} s, and the motor alone holds {c} kW for good').replace('{s}',s.hold>=300?'300+':evdFmt(s.hold)).replace('{c}',evdFmt(s.cont)):'…';
  // what holds it back: the power, then the top speed; the one that binds is lit
  const bind=r.pk<r.pkM*0.99;
  const rows=(list,lit,fmt)=>list.map(([n,v],i)=>'<div class="evd-lim'+(i===lit?' bind':'')+'"><span>'+tr(n)+'</span><span class="bar"><span style="width:'+
    (v/Math.max(...list.map(x=>x[1]))*100)+'%"></span></span><span class="n">'+fmt(v)+'</span></div>').join('');
  const N=[['rotor rim',r.nTip],['inverter frequency',r.nFreq],['design limit',r.maxRpm]];
  const nLit=N.reduce((a,x,i)=>x[1]<N[a][1]?i:a,0);
  evdG('evdLims').innerHTML='<div class="lh">'+tr('PEAK POWER')+'</div>'+rows([['motor alone',r.pkM],['battery',r.pb]],bind?1:0,v=>evdFmt(v)+' kW')+
    '<div class="lh">'+tr('TOP RPM')+'</div>'+rows(N,nLit,v=>evdFmt(v/1000,1)+'k');
  const pTxt=bind?tr('The battery sets the peak: it gives {P} kW at {V} V. A bigger motor adds nothing here; more capacity, more cells in series or a power chemistry does.')
    :tr('The motor sets the peak. The battery could give {P} kW: more current, a bigger rotor, or turns matched to the voltage would use it.');
  const nTxt=[tr("Top speed: the rotor's rim ({v} m/s)."),tr("Top speed: the inverter's frequency over {n} poles."),tr('Top speed: the design limit.')][nLit];
  evdG('evdVerdict').textContent=pTxt.replace('{P}',evdFmt(r.pb)).replace('{V}',evdFmt(r.V))+' '+nTxt.replace('{v}',r.vTip).replace('{n}',r.poles);
  const open=evdG('evdSide').classList.contains('open');
  evdG('evdMini').innerHTML='<span>'+evdFmt(r.pk)+'<small> kW</small></span><span>'+evdFmt(r.tq)+'<small> Nm</small></span><span>'+evdFmt(r.top/1000,1)+
    '<small>k rpm</small></span><span>'+evdFmt(r.mass+r.packMass)+'<small> kg</small></span><span class="ar">'+(open?'▼':'▲')+'</span>';
  evdDrawCurve();
}

// ---- help: in the side panel, or under the field on a phone ----
function evdHelpHTML(id){
  const spec=EVD_FIELDS[id]||{},ctl=evdG(id),f=evdField(id),lab=f?f.querySelector('label').textContent:id;
  let h='<span class="hn">'+lab+'</span><b>'+tr('WHAT IT IS')+'</b><span>'+tr(spec.what||'')+'</span><b>'+tr('WHAT IT TRADES')+'</b><span>'+tr(spec.trade||'')+'</span>';
  const real=evdTicks(id);
  if(ctl.tagName==='SELECT'){
    const used=new Map();for(const d of evdRealDrives()){const v=d.e[id];if(v!=null){const k=String(v);used.set(k,(used.get(k)||[]).concat(d.name));}}
    h+='<b>'+tr('THE CHOICES')+'</b><ul>'+[...ctl.options].filter(o=>!o.disabled||o.selected).map(o=>'<li class="'+(o.selected?'on':'')+'"><span>'+o.textContent+'</span>'+
      (used.get(o.value)||used.get(String(+o.value))||[]).slice(0,4).join(', ')+'</li>').join('')+'</ul>';
  }else if(real.length){
    h+='<b>'+tr('REAL DRIVES')+'</b><ul>'+real.map(t=>'<li class="'+(+ctl.value===t.v?'on':'')+'"><span>'+evdFmt(t.v,t.v%1?2:0)+'</span>'+t.names.join(', ')+'</li>').join('')+'</ul>';
  }
  const card=EVD_CARDS.find(c=>c.id===(f&&f.closest('.evd-card').dataset.card));
  if(card)h+='<button type="button" class="evd-guide" data-gp="'+card.guide+'">'+tr('GUIDE')+' ▸</button>';
  return h;
}
function evdShowHelp(id,quiet){
  if(id&&!evdG(id))id=null;
  evdState.help=id;
  document.querySelectorAll('#evDesigner .evd-row').forEach(f=>f.classList.toggle('sel',!!id&&f.contains(evdG(id))));
  document.querySelectorAll('#evDesigner .evd-q').forEach(q=>q.setAttribute('aria-expanded',q.dataset.f===id?'true':'false'));
  const box=evdG('evdHelp');if(!box)return;
  box.innerHTML=id?evdHelpHTML(id):'<span class="empty">'+tr("Press ? beside any input, or change one: what it is, what it trades and the real drives' values show here.")+'</span>';
  document.querySelectorAll('#evDesigner .evd-inhelp').forEach(x=>{const on=!!id&&x.dataset.f===id&&evdPhone();x.hidden=!on;x.innerHTML=on?box.innerHTML:'';});
  document.querySelectorAll('#evDesigner .evd-guide').forEach(b=>b.addEventListener('click',()=>{const t=evdG('tabGuide');if(t)t.click();if(typeof showGuide==='function')showGuide(b.dataset.gp);}));
  if(!quiet&&id&&evdPhone()){const f=evdField(id);if(f)f.scrollIntoView({block:'nearest'});}
}

// ---- pictures: the motor in section, the knee, the pack; and the curve ----
const EVD_C={well:'#12121c',edge:'#26263a',edge2:'#3a3a55',dim:'#8a8aa6',green:'#00ff88',cyan:'#00ccff',yellow:'#ffcc00',red:'#ff4d5e',blue:'#3d7bff',copper:'#d9853b',steel:'#6b6b85',fg:'#d8d8e8'};
const evdCtx=cv=>{const x=cv.getContext('2d');x.imageSmoothingEnabled=false;x.fillStyle=EVD_C.well;x.fillRect(0,0,cv.width,cv.height);return x;};
const evdShown=cv=>!!cv&&cv.offsetParent!==null;
function evdDrawViz(){
  const r=evdState.res;if(!r)return;
  const C=EVD_C;
  let cv=evdG('evdViz-size');
  if(evdShown(cv)){
    const x=evdCtx(cv),H=cv.height,g=id=>+evdG(id).value,scale=0.42;   // px per mm, fixed: a bigger motor draws bigger
    const D=g('evRotorD'),L=g('evStack'),poles=g('evPoles'),im=evdG('evMotorType').value==='im';
    const rm=r.m.parts?r.m.parts[0].m:r.m,cx=86,cy=H/2-6;
    const rOD=rm.OD*1000/2*scale,rB=rm.Ds*1000/2*scale,rR=D/2*scale,rSh=0.47*D/2*scale,hS=(rOD-rB)*0.6;
    x.fillStyle=C.steel;x.beginPath();x.arc(cx,cy,rOD,0,7);x.fill();
    for(let i=0;i<rm.slots;i++){x.save();x.translate(cx,cy);x.rotate(i/rm.slots*Math.PI*2);x.fillStyle=C.copper;
      const w=Math.max(1,Math.PI*2*(rB+hS/2)/rm.slots*0.5);x.fillRect(rB,-w/2,hS,w);x.restore();}
    x.fillStyle=C.well;x.beginPath();x.arc(cx,cy,rB,0,7);x.fill();
    x.fillStyle='#4a4a60';x.beginPath();x.arc(cx,cy,rR,0,7);x.fill();
    if(!im){for(let i=0;i<poles;i++){const a=i/poles*Math.PI*2,da=Math.PI*2/poles;x.fillStyle=i%2?C.blue:C.red;
      x.beginPath();x.arc(cx,cy,rR,a+0.08,a+da-0.08);x.arc(cx,cy,rR*0.78,a+da-0.08,a+0.08,true);x.closePath();x.fill();}
      if(evdG('evRetention').value==='sleeve'){x.strokeStyle='#111';x.lineWidth=2;x.beginPath();x.arc(cx,cy,rR-1,0,7);x.stroke();}}
    else{const q=rm.Qr||40;x.fillStyle=C.copper;for(let i=0;i<q;i++){const a=i/q*Math.PI*2;x.fillRect(cx+Math.cos(a)*rR*0.86-1,cy+Math.sin(a)*rR*0.86-1,3,3);}}
    x.fillStyle='#22222e';x.beginPath();x.arc(cx,cy,rSh,0,7);x.fill();
    // the side view, at half scale along the shaft so the longest stack fits
    const sx=178,Lp=Math.max(2,L*scale*0.5),hh=rOD*2;
    x.fillStyle=C.steel;x.fillRect(sx,cy-hh/2,Lp,hh);
    x.fillStyle=C.copper;x.fillRect(sx-4,cy-hh/2+3,4,hh-6);x.fillRect(sx+Lp,cy-hh/2+3,4,hh-6);
    x.fillStyle=C.dim;x.fillRect(sx-12,cy-2,Lp+24,4);
    x.font='8px "Press Start 2P"';x.textAlign='center';x.fillStyle=C.fg;
    x.fillText('Ø'+D,cx,H-8);x.fillText(L+'mm',sx+Lp/2,H-8);
    x.fillStyle=C.dim;x.fillText('½',sx+Lp/2,12);
  }
  cv=evdG('evdViz-wind');
  if(evdShown(cv)){
    const x=evdCtx(cv),W=cv.width,H=cv.height,pad=18,iw=W-pad*2,ih=H-pad*2-8,m=r.m.parts?r.m.parts[0].m:r.m,psi=motorPsi(m,60);
    const vMax=r.V/Math.sqrt(6)*Math.SQRT2,emf=n=>(m.vDrop||V_DROP)*m.p*psi*n*Math.PI/30,top=vMax*2.2;
    const X=n=>pad+n/r.top*iw,Y=v=>pad+ih-Math.min(v,top)/top*ih;
    x.strokeStyle=C.edge;x.lineWidth=1;x.strokeRect(pad+.5,pad+.5,iw,ih);
    x.strokeStyle=C.cyan;x.lineWidth=2;x.beginPath();x.moveTo(X(0),Y(vMax));x.lineTo(X(r.top),Y(vMax));x.stroke();
    x.strokeStyle=C.copper;x.beginPath();x.moveTo(X(0),Y(0));for(let n=0;n<=r.top;n+=r.top/40)x.lineTo(X(n),Y(emf(n)));x.stroke();
    x.font='7px "Press Start 2P"';x.textAlign='left';x.fillStyle=C.cyan;x.fillText(tr('BATTERY')+' '+evdFmt(r.V)+' V',pad+4,Y(vMax)-5);
    x.fillStyle=C.copper;x.fillText(tr('BACK-EMF'),pad+4,pad+ih-6);
    if(r.knee<r.top){x.fillStyle=C.yellow;x.fillRect(X(r.knee)-3,Y(vMax)-3,6,6);x.textAlign='center';
      x.fillText(evdFmt(Math.round(r.knee/100)*100)+' rpm',Math.min(W-44,Math.max(44,X(r.knee))),Y(vMax)+16);}
    x.fillStyle=C.dim;x.textAlign='center';x.fillText(tr('motor speed')+' →',W/2,H-5);
  }
  cv=evdG('evdViz-batt');
  if(evdShown(cv)){
    const x=evdCtx(cv),W=cv.width,H=cv.height,ser=+evdG('evSeries').value,ah=r.pack.Ah;
    // drawn as 5 Ah cells: the shape of the pack (how many across, how many deep), not its real cell count
    const par=Math.max(1,Math.round(ah/5)),cols=Math.min(ser,48),rows=Math.min(par,14),cw=Math.max(2,Math.floor((W-20)/cols)),ch=Math.max(2,Math.floor((H-50)/rows));
    for(let i=0;i<cols;i++)for(let j=0;j<rows;j++){x.fillStyle=j%2?'#2b8f5e':'#33a86e';x.fillRect(10+i*cw,10+j*ch,Math.max(1,cw-1),Math.max(1,ch-1));}
    x.font='7px "Press Start 2P"';x.textAlign='left';x.fillStyle=C.cyan;
    x.fillText(ser+' '+tr('IN SERIES')+' → '+evdFmt(r.V)+' V',10,H-22);
    x.fillStyle=C.green;x.fillText(evdFmt(ah)+' Ah '+tr('IN PARALLEL'),10,H-8);
  }
}
function evdDrawCurve(){
  const r=evdState.res,cv=evdG('evdCurve');if(!r||!evdShown(cv))return;
  const C=EVD_C,x=evdCtx(cv),W=cv.width,H=cv.height,pl=30,pr=30,pt=10,pb=18,iw=W-pl-pr,ih=H-pt-pb;
  const rMax=Math.ceil(r.top/2000)*2000,Pm=Math.max(20,Math.ceil(Math.max(r.pkM,r.pk)/50)*50),Tm=Math.max(20,Math.ceil(Math.max(r.tq,...r.pts.map(p=>p.Tm))/50)*50);
  const X=n=>pl+n/rMax*iw,YP=v=>pt+ih-v/Pm*ih,YT=v=>pt+ih-v/Tm*ih;
  x.font='7px "Press Start 2P"';x.strokeStyle=C.edge;x.lineWidth=1;
  for(let i=0;i<=4;i++){const y=Math.round(pt+ih*i/4)+.5;x.beginPath();x.moveTo(pl,y);x.lineTo(W-pr,y);x.stroke();
    x.textAlign='right';x.fillStyle=C.green;x.fillText(evdFmt(Pm*(1-i/4)),pl-3,y+3);x.textAlign='left';x.fillStyle=C.yellow;x.fillText(evdFmt(Tm*(1-i/4)),W-pr+3,y+3);}
  x.fillStyle=C.dim;x.textAlign='center';for(let k=0;k<=4;k++)x.fillText(evdFmt(rMax*k/4000)+'k',X(rMax*k/4),H-5);
  if(r.knee<r.top){x.strokeStyle=C.edge2;x.setLineDash([3,3]);x.beginPath();x.moveTo(Math.round(X(r.knee))+.5,pt);x.lineTo(Math.round(X(r.knee))+.5,pt+ih);x.stroke();x.setLineDash([]);
    x.fillStyle=C.dim;x.fillText(tr('knee'),X(r.knee),pt+8);}
  const line=(f,col,w,dash)=>{x.strokeStyle=col;x.lineWidth=w;x.setLineDash(dash||[]);x.beginPath();r.pts.forEach((p,i)=>{const [a,b]=f(p);i?x.lineTo(a,b):x.moveTo(a,b);});x.stroke();x.setLineDash([]);};
  const w=p=>p.r*Math.PI/30/1000;
  line(p=>[X(p.r),YP(p.Tm*w(p))],C.dim,1,[2,3]);line(p=>[X(p.r),YT(p.Tm)],C.dim,1,[2,3]);
  line(p=>[X(p.r),YT(p.T)],C.yellow,2);line(p=>[X(p.r),YP(p.T*w(p))],C.green,2);
}
function evdDrawIcons(){
  const C=EVD_C;
  document.querySelectorAll('#evDesigner canvas[data-icon]').forEach(cv=>{
    if(cv.dataset.drawn)return;cv.dataset.drawn='1';
    const x=cv.getContext('2d'),P=(c,pts)=>{x.fillStyle=c;pts.forEach(([a,b,w,h])=>x.fillRect(a,b,w||1,h||1));};
    switch(cv.dataset.icon){
      case 'size':P(C.steel,[[3,1,8,1],[1,3,1,8],[12,3,1,8],[3,12,8,1],[2,2],[11,2],[2,11],[11,11]]);P(C.red,[[5,4,4,3]]);P(C.blue,[[5,7,4,3]]);break;
      case 'wind':P(C.copper,[[2,2,10,2],[2,6,10,2],[2,10,10,2],[2,2,2,10],[10,2,2,10]]);break;
      case 'mag':P(C.red,[[2,2,4,10]]);P(C.blue,[[8,2,4,10]]);P(C.fg,[[6,2,2,2]]);break;
      case 'cool':P(C.cyan,[[6,1,2,12],[1,6,12,2],[3,3,2,2],[9,3,2,2],[3,9,2,2],[9,9,2,2]]);break;
      case 'inv':P(C.yellow,[[7,1,3,5],[4,5,6,2],[4,7,3,6]]);break;
      case 'more':P(C.steel,[[1,4,4,6],[9,4,4,6]]);P(C.fg,[[5,6,4,2]]);P(C.red,[[2,6,2,2]]);P(C.blue,[[10,6,2,2]]);break;
      case 'batt':P(C.green,[[1,3,11,8]]);P(C.fg,[[12,5,2,4]]);P(C.well,[[3,5,2,4],[7,5,2,4]]);break;
    }
  });
}
