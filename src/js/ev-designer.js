// ====== THE ELECTRIC DRIVE AS CARDS: the ENGINE tab's motor, inverter and battery, explained as you set them (build 238) ======
// The fields are the ones electric-ui.js has always read (#evRotorD and the rest, in src/shell.html), grouped into
// cards. This file adds, around them, what a player needs to set them without guessing:
//   · a menu of the cards, one open at a time (on a phone the cards stack and fold instead);
//   · a slider beside each number, with a tick for every real drive in the presets and their range shaded;
//   · a "?" that explains the input in the side panel: what it is, what it trades, the real drives' values, the guide;
//   · the effect of each change, beside the input that made it: + or - kW, Nm, top rpm, kg and cost;
//   · a side panel of what the drive gives, its curve, and what holds it back (the battery or the motor; the rim, the
//     inverter or the design limit for the top speed). On a phone it is a bar at the bottom that opens.
// The cards themselves are src/js/design-cards.js (shared with the combustion engine since build 239); this file is the
// electric drive's config. Nothing here is physics of its own. The preview runs the functions the build and the dyno run: evMotorOf and
// driveTorqueRated for an electric car (exactly scoreMotor's sweep, so its peaks are the DYNO's), buildHybrid and
// hybMotorTq for a hybrid's motor. tools/fingerprint.mjs is identical across this build.
// Adding a parameter: its field in src/shell.html inside the right card, and one entry in EVD_FIELDS. The card's layout,
// slider, ticks, help and Greek (through tr) come from that.

const EVD_CARDS=[
  {id:'size',title:'ROTOR & STATOR',guide:'evmotor',viz:'section',vizH:200,cap:'To scale: the stator and its slots, the rotor with its N (red) and S (blue) poles, and the length of the stack beside it.'},
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
  evMagT:{adv:true,what:"How thick each magnet bar is, in the direction it is magnetised.",
    trade:'A thicker bar pushes more flux across the air gap, until the stator\'s steel saturates. It adds magnet mass and cost.'},
  evMagW:{adv:true,what:"How wide the two bars of each pole are together, as a share of the pole's width.",
    trade:'Wider magnets cover more of the pole: more flux and torque per amp, more magnet to pay for.'},
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
    if(!evdFrontOnly(id,d))continue;
    if(!by.has(+v))by.set(+v,[]);by.get(+v).push(d.name);}
  return [...by].map(([v,names])=>({v,names})).sort((a,b)=>a.v-b.v);
}
function evdUsing(id,val){
  return evdRealDrives().filter(d=>d.e[id]!=null&&String(d.e[id])===String(val)&&evdFrontOnly(id,d)).map(d=>d.name);
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

// ---- the cards: src/js/design-cards.js, with this drive's preview, limits and pictures ----
const evdG=id=>document.getElementById(id),evdFmt=dcFmt,evdOptText=dcOptText,evdCtx=dcCtx,evdShown=dcShown,EVD_C=DC_COLOURS;
const evdFrontOnly=(id,d)=>!(/^evFront(D|Stack|Poles|Turns|Amps)$/.test(id)&&!(d.e.evFront==='pm'||d.e.evFront==='im'));
const EVD=new DesignCards({
  prefix:'evd',root:'evDesigner',cards:EVD_CARDS,fields:EVD_FIELDS,depFields:EVD_SPEED_FIELDS,realHead:'REAL DRIVES',
  ticks:evdTicks,using:evdUsing,choices:id=>dcUsers(evdRealDrives(),id),
  compute:evdCompute,slow:evdComputeSlow,
  active:()=>{const p=evdG('designPanel');return !!p&&(p.classList.contains('ev')||p.classList.contains('hy'));},
  visible:(f,mode)=>!(mode==='hy'&&f.hasAttribute('data-ev-only'))&&!(mode==='ev'&&f.hasAttribute('data-hy')),
  h1:()=>evdState.mode==='hy'?'WHAT THE MOTOR DOES':'WHAT YOUR DRIVE DOES',
  helpEmpty:"Press ? beside any input, or change one: what it is, what it trades and the real drives' values show here.",
  deltas:[['pk',' kW',0,1,''],['tq',' Nm',0,1,''],['top',' rpm',-2,1,'top'],['mass',' kg',1,-1,'motor'],['packMass',' kg',0,-1,'pack'],['cost','',-2,-1,'cost']],
  stats:(r,d)=>[['PEAK POWER',evdFmt(r.pk),'kW',d('pk',1,0)],['TORQUE',evdFmt(r.tq),'Nm',d('tq',1,0)],['TOP RPM',evdFmt(r.top/1000,1),'k rpm',d('top',1,0)],
    ['MOTOR',evdFmt(r.mass),'kg',d('mass',-1,1)],['PACK',evdFmt(r.packMass),'kg',d('packMass',-1,0)],['COST','$'+evdFmt(r.cost/1000,1),'k',d('cost',-1,0)]],
  slowText:(r,s)=>r.hybrid?'':s?tr('Cooling: peak torque for {s} s, and the motor alone holds {c} kW for good').replace('{s}',s.hold>=300?'300+':evdFmt(s.hold)).replace('{c}',evdFmt(s.cont)):'…',
  legend:[['p','power'],['t','torque'],['m','motor alone']],curveLabel:'Torque and power against motor speed',
  curve:r=>({xMax:r.top,mark:{x:r.knee,label:tr('knee')},pts:r.pts.map(q=>{const w=q.r*Math.PI/30/1000;return {x:q.r,a:q.T*w,b:q.T,a0:q.Tm*w,b0:q.Tm};})}),
  // what holds it back: the battery or the motor for the power; the rim, the inverter or the design limit for the speed
  limits:r=>{
    const bind=r.pk<r.pkM*0.99,N=[['rotor rim',r.nTip],['inverter frequency',r.nFreq],['design limit',r.maxRpm]];
    const nLit=N.reduce((a,x,i)=>x[1]<N[a][1]?i:a,0);
    const pTxt=bind?tr('The battery sets the peak: it gives {P} kW at {V} V. A bigger motor adds nothing here; more capacity, more cells in series or a power chemistry does.')
      :tr('The motor sets the peak. The battery could give {P} kW: more current, a bigger rotor, or turns matched to the voltage would use it.');
    const nTxt=[tr("Top speed: the rotor's rim ({v} m/s)."),tr("Top speed: the inverter's frequency over {n} poles."),tr('Top speed: the design limit.')][nLit];
    return {groups:[{head:'PEAK POWER',rows:[['motor alone',r.pkM],['battery',r.pb]],lit:bind?1:0,fmt:v=>evdFmt(v)+' kW'},
        {head:'TOP RPM',rows:N,lit:nLit,fmt:v=>evdFmt(v/1000,1)+'k'}],
      verdict:pTxt.replace('{P}',evdFmt(r.pb)).replace('{V}',evdFmt(r.V))+' '+nTxt.replace('{v}',r.vTip).replace('{n}',r.poles)};
  },
  mini:r=>[[evdFmt(r.pk),' kW'],[evdFmt(r.tq),' Nm'],[evdFmt(r.top/1000,1),'k rpm'],[evdFmt(r.mass+r.packMass),' kg']],
  summary:evdSummary,
  warnings:r=>{const w={};
    if(r.nTip<Math.min(r.maxRpm,r.nFreq)-1)w.evRotorD=tr('The rim reaches {v} m/s at {n} rpm: the motor stops there.').replace('{v}',r.vTip).replace('{n}',evdFmt(Math.round(r.nTip/100)*100));
    if(r.nFreq<Math.min(r.maxRpm,r.nTip)-1)w.evPoles=tr("With {p} poles the inverter's frequency stops the motor at {n} rpm.").replace('{p}',r.poles).replace('{n}',evdFmt(Math.round(r.nFreq/100)*100));
    return w;},
  drawViz:()=>evdDrawViz(),
  icons:{
    size:(P,C)=>{P(C.steel,[[3,1,8,1],[1,3,1,8],[12,3,1,8],[3,12,8,1],[2,2],[11,2],[2,11],[11,11]]);P(C.red,[[5,4,4,3]]);P(C.blue,[[5,7,4,3]]);},
    wind:(P,C)=>P(C.copper,[[2,2,10,2],[2,6,10,2],[2,10,10,2],[2,2,2,10],[10,2,2,10]]),
    mag:(P,C)=>{P(C.red,[[2,2,4,10]]);P(C.blue,[[8,2,4,10]]);P(C.fg,[[6,2,2,2]]);},
    cool:(P,C)=>P(C.cyan,[[6,1,2,12],[1,6,12,2],[3,3,2,2],[9,3,2,2],[3,9,2,2],[9,9,2,2]]),
    inv:(P,C)=>P(C.yellow,[[7,1,3,5],[4,5,6,2],[4,7,3,6]]),
    more:(P,C)=>{P(C.steel,[[1,4,4,6],[9,4,4,6]]);P(C.fg,[[5,6,4,2]]);P(C.red,[[2,6,2,2]]);P(C.blue,[[10,6,2,2]]);},
    batt:(P,C)=>{P(C.green,[[1,3,11,8]]);P(C.fg,[[12,5,2,4]]);P(C.well,[[3,5,2,4],[7,5,2,4]]);}
  }
});
const evdState=EVD.st;
// Called by syncElectricSections whenever the form is synced (a preset, the engine type, the language).
function evdSync(ev,hy){EVD.sync(ev?'ev':hy?'hy':'');}

// ---- pictures: the motor in section, the knee, the pack ----
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
