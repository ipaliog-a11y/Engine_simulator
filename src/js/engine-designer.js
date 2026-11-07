// ====== THE COMBUSTION ENGINE AS CARDS (build 239) ======
// The ENGINE tab's combustion fields, grouped in six cards (src/shell.html, #icDesigner), with the cards of
// src/js/design-cards.js around them: a slider and the factory engines' ticks beside each number, a "?" that explains
// it, the effect of each change, and a side panel of what the engine gives and what holds it back.
// The preview is BUILD itself: buildEngineCore (src/js/engine-build.js) on the form, run against the live engine and
// state, which are put back afterwards (icdCompute). Its peaks are the scorecard's; tools/fingerprint.mjs is identical.
// A full build takes ~50-150 ms, so the preview waits until a slider stops for 150 ms, where the motor's runs every frame.

const ICD_CARDS=[
  {id:'block',title:'BLOCK',guide:'bottom',viz:'cyl',vizH:190,cap:'To scale: one cylinder, the piston at the top of its stroke (solid) and at the bottom (outline), and the space left above it at the top, which the compression ratio sets.'},
  {id:'head',title:'HEAD & VALVES',guide:'valvetrain'},
  {id:'air',title:'AIR & BOOST',guide:'turbo'},
  {id:'flow',title:'INTAKE & EXHAUST',guide:'airpath'},
  {id:'fuel',title:'FUEL & SPARK',guide:'ignition'},
  {id:'cool',title:'COOLING & ELECTRICS',guide:'heat'}
];
// One entry per field: its help, its guide page where it is not the card's, and whether it is an advanced setting.
const ICD_FIELDS={
  edCyl:{what:'How many cylinders (or rotors, on a rotary) share the displacement.',
    trade:'More, smaller cylinders rev higher and run smoother, but add friction, parts and cost. Fewer, bigger ones make their torque lower down and cost less.'},
  edLayout:{guide:'firing',what:'How the cylinders are arranged: in a row, in two banks at an angle (V), or flat and opposed (BOXER).',
    trade:'A V or a boxer is shorter than an inline engine and costs more to build. The layout also sets the firing order, and so the exhaust pulses.'},
  edBore:{what:'The diameter of each cylinder.',
    trade:'A wider bore leaves room for bigger valves, so the engine breathes better at high rpm, but the flame has further to travel and the end gas knocks sooner.'},
  edStroke:{what:'How far each piston travels, set by the crank throw.',
    trade:'A longer stroke adds displacement and low-down torque. The pistons move faster at a given rpm, which limits how high the engine can rev.'},
  edEcc:{what:"A rotary engine's crank throw: how far the rotor's centre swings.",
    trade:"With the rotor's radius and width it sets each chamber's volume. More eccentricity is more displacement, up to a fifth of the radius, past which the apex seals no longer seal."},
  edCR:{guide:'knock',what:'How much the mixture is squeezed: the volume above the piston at the bottom of its stroke, over the volume at the top.',
    trade:'Higher compression burns the fuel more efficiently and adds torque everywhere, but brings knock closer: it needs more octane, less boost or later spark.'},
  edRedline:{guide:'redline',what:'The highest rpm the engine is allowed to reach.',
    trade:'More rpm is more power while the engine still breathes there, but the pistons and rods carry more load and the valves may float. VALVE FLOAT, on HEAD & VALVES, says how high the valvetrain can go.'},
  edValves:{what:'How many valves each cylinder has.',
    trade:'More valves give more flow area, so better breathing at high rpm. Two valves in a wedge head are cheaper and give their best low down.'},
  edCam:{what:'How far and how long the cam opens the valves.',
    trade:'A wilder cam breathes better at high rpm, at the cost of low-end torque and a rougher idle. ATKINSON closes the intake late: more efficient, less power.'},
  edVVT:{guide:'vvt',what:'Whether the ECU can shift the cam timing while the engine runs.',
    trade:'VVT gives back most of the low end a wilder cam costs: a broad power band, strong at the bottom and the top.'},
  valOverlap:{what:'How long the intake and exhaust valves are open together, in crank degrees, as the form stands.',
    trade:'Overlap lets the exhaust pull fresh charge in at high rpm. At low rpm it lets exhaust back in: a rougher idle and more emissions.'},
  edValveMat:{adv:true,what:'What the valves are made of.',
    trade:'Titanium valves are much lighter, so the springs keep them on the cam to a higher rpm before they float. They cost more.'},
  edSpring:{adv:true,what:'How stiff the valve springs are.',
    trade:'Stiffer springs keep the valves following the cam to a higher rpm. They cost more.'},
  valFloat:{what:'The rpm where the springs can no longer keep the valves on the cam, as the form stands.',
    trade:'Above it the valves bounce: power falls and the engine can be damaged. Keep it above the redline: lighter valves or stiffer springs raise it.'},
  edEgr:{adv:true,guide:'backpressure',what:'Cooled exhaust gas fed back into the intake.',
    trade:'It dilutes the charge, which slows and cools the burn: it holds off knock and cuts NOx. Where it is on it costs a little power.'},
  edIntake:{what:'How the air gets in: drawn in by the pistons, or pushed in by a turbo or a supercharger.',
    trade:'Boost packs more air into the same displacement, so more power, but brings knock closer and loads the internals. A turbo runs on exhaust energy and can lag; a supercharger is driven by the crank and answers at once.'},
  edBoost:{guide:'wastegate',what:'The pressure the turbo or supercharger aims for, above the air outside.',
    trade:"Each bar of boost adds about another engine's worth of air. More boost needs more octane or less compression, and costs reliability."},
  edIntercooler:{guide:'intercooler',what:'A radiator that cools the air after the compressor.',
    trade:'Cooler air is denser and knocks less. A larger core cools more, for a little pressure loss.'},
  edTurboSize:{what:'The size of the turbocharger.',
    trade:'A small turbo spools early and runs out of breath at high rpm; a large one makes more at the top and comes on later.'},
  edTurboConfig:{what:'How many turbos, and how they are arranged.',
    trade:'Twin turbos share the flow; sequential ones bring the second in as rpm rises; compound ones feed one into the other for high boost. Each costs more.'},
  edCompWheel:{adv:true,guide:'compmap',what:"The compressor wheel's diameter. 0 takes it from TURBO SIZE.",
    trade:'A bigger wheel flows more air at the top, and takes longer to spool.'},
  edHousing:{adv:true,guide:'lag',what:"The turbine housing's A/R: how tight the exhaust's path into the turbine is.",
    trade:'A tight housing spools the turbo sooner but chokes the exhaust at high rpm; a loose one does the opposite.'},
  edVGT:{adv:true,guide:'vgt',what:'Vanes that change the turbine housing while the engine runs.',
    trade:'It works like a tight housing low down and a loose one at the top. It costs more, and takes the place of the housing choice.'},
  edAntilag:{adv:true,guide:'lag',what:'Keeps the turbo spinning off the throttle by burning fuel in the exhaust.',
    trade:'No lag after a lift, at the cost of heat in the turbo and the exhaust.'},
  edScType:{guide:'supercharger',what:'The kind of supercharger.',
    trade:'A Roots or a twin-screw gives its boost from low rpm; a centrifugal one builds boost with rpm, like a turbo without the lag.'},
  edTaperRpm:{adv:true,guide:'wastegate',what:'The rpm from which the ECU lets the boost fall. 0 holds it to the limiter.',
    trade:'Tapering the boost at the top eases the load on the internals where it is highest, for a little top-end power.'},
  edTaperPct:{adv:true,guide:'wastegate',what:'How much of the boost is left at the limiter when it tapers.',
    trade:'Less boost at the limiter: less power at the top, more reliability.'},
  edTqLimit:{adv:true,guide:'wastegate',what:'A ceiling the ECU holds the torque to, by cutting the boost. 0 is none.',
    trade:'It protects the gearbox and the internals and flattens the torque curve; the torque above it is given up.'},
  edGovRpm:{adv:true,guide:'types',what:"A diesel's rated speed: where its governor starts to take fuel away. 0 is none.",
    trade:'It keeps a diesel from over-revving; the power falls away above it.'},
  edNitrous:{guide:'nitrous',what:'A shot of nitrous oxide, which adds oxygen while it lasts.',
    trade:'A big gain in power for as long as the bottle lasts, with more heat and more knock.'},
  edIntakeSys:{guide:'induction',what:'How the fuel is metered into the air.',
    trade:'Carburettors are simple and cheap but meter less precisely. Fuel injection is precise and cleaner, and individual throttle bodies (ITB) breathe best.'},
  edAirFilter:{adv:true,what:'The filter on the air inlet.',
    trade:'A freer filter restricts the flow less, so a little more power at high rpm, and filters less.'},
  edRunner:{guide:'waves',what:'The length of the intake runners, which tunes the pressure waves in them.',
    trade:'Long runners ram the most air in at low rpm (torque), short ones at high rpm (power). A variable manifold switches between them. The PARTS tab designs your own.'},
  valRam:{guide:'waves',what:'The runner length the form gives, and the rpm where its pressure wave rams the most air in.',
    trade:'Move the peak with INTAKE RUNNER.'},
  edExhaust:{guide:'header',what:'The exhaust manifold or header.',
    trade:'A tuned header pulls exhaust out of the cylinders with its pressure waves at the rpm it is tuned for: more power there, for more cost. The PARTS tab designs your own.'},
  valScav:{guide:'header',what:"The header's primary length, and how much its pulses scavenge the cylinders.",
    trade:'Tune it with EXHAUST.'},
  edCat:{guide:'emissions',what:'The catalytic converter.',
    trade:'A catalyst cleans the exhaust, for some back-pressure. Without one the engine breathes a little better and its emissions are dirty.'},
  edFuel:{guide:'fuels',what:'What the engine burns.',
    trade:'Race gas, E85 and methanol resist knock far better than pump gas, so they allow more compression or boost. E85 and methanol carry less energy per kg, so the engine burns more of them.'},
  edOctane:{guide:'fuels',what:"Pump gas's octane rating (RON).",
    trade:'Higher octane resists knock: more compression, boost or spark advance before it knocks.'},
  edInjector:{guide:'fuelmap',what:'Where the fuel is sprayed: into the port, or straight into the cylinder.',
    trade:'Direct injection cools the charge as the fuel evaporates, which holds off knock and fills the cylinder a little better. It needs fuel injection.'},
  edIgnType:{adv:true,guide:'electrical',what:'How the spark reaches the plugs.',
    trade:'Coil-on-plug gives the strongest spark at high rpm and at low voltage; a distributor is the first to misfire when the battery runs down.'},
  edTiming:{what:'Whether the spark timing is fixed, or set by the ECU against knock.',
    trade:'AUTO advances the spark as far as knock allows at every rpm and load. FIXED holds the advance you set: more power if it is right, knock if it is too far.'},
  edIgnAdv:{guide:'knock',what:'How many degrees before top dead centre the spark fires, with FIXED timing.',
    trade:'More advance gives the flame time to burn: more torque, until it knocks.'},
  edAfrMode:{guide:'fuelmap',what:'Who sets the mixture: you, or the ECU from its fuel map.',
    trade:'AUTO follows the ECU FUEL MAP under the cards; MANUAL holds the AFR you set on the LIVE bench.'},
  edRadiator:{what:'The size of the radiator.',
    trade:'A bigger radiator holds the coolant cooler at high power, for a little mass and cost.'},
  edFan:{what:'What pulls air through the radiator when the car is slow.',
    trade:'An electric fan runs only when it is needed; a mechanical one always takes some power.'},
  edOilCooler:{guide:'friction',what:'A small radiator for the oil.',
    trade:'It keeps the oil from overheating under long, hard use.'},
  edThermostat:{adv:true,what:'The temperature at which the thermostat opens.',
    trade:'A cooler setting holds the engine cooler, a little further from knock; a warmer one wastes less heat.'},
  edAlternator:{guide:'electrical',what:'How much current the alternator can give.',
    trade:'A bigger alternator keeps the battery up under a heavy electrical load, and takes more power from the crank while it charges.'}
};
// Where a field's value lives on a factory engine, and how a choice is written there.
const ICD_KEY={edCyl:'cylinders',edLayout:'layout',edBore:'bore_mm',edStroke:'stroke_mm',edEcc:'ecc_mm',edCR:'compression',edRedline:'redline',
  edValves:'valves',edCam:'cam',edVVT:'vvt',edValveMat:'valveMat',edSpring:'valveSpring',edEgr:'egr',edIntake:'intake',edBoost:'boost_bar',
  edIntercooler:'intercooler',edTurboSize:'turboSize',edTurboConfig:'turboConfig',edCompWheel:'compExd_mm',edHousing:'housing',edVGT:'vgt',
  edAntilag:'antilag',edScType:'scType',edTaperRpm:'taperRpm',edTaperPct:'taperPct',edTqLimit:'tqLimit',edGovRpm:'govRpm',edNitrous:'nitrous',
  edIntakeSys:'intakeSys',edAirFilter:'airFilter',edRunner:'runner',edExhaust:'exhaust',edCat:'cat',edFuel:'fuel',edOctane:'octane',
  edInjector:'injector',edIgnType:'ignitionType',edTiming:'timingMode',edIgnAdv:'ignitionAdv',edAfrMode:'afrMode',edRadiator:'radiator',
  edFan:'fan',edOilCooler:'oilCooler',edThermostat:'thermostat',edAlternator:'alternator'};
const ICD_DEPS=['edIntake','edFuel','edTiming','edIntakeSys','edVGT'];   // their change enables or disables other fields

// The factory combustion engines behind the ticks, by their own name ("GM LS3"), or their car's where the name is only
// a description ("3.0 Turbo I6 (2JZ)" -> "2JZ") or a hybrid's ("Toyota 2ZR-FXE 1.8 + power-split (Prius)" -> "Prius").
function icdRealEngines(){
  return FACTORY_ENGINES.filter(p=>p.engine.type!=='electric').map(p=>{
    const m=/^(.*?)\s*\(([^)]+)\)\s*$/.exec(p.name),name=m?(/^\d/.test(m[1])||p.cat==='Hybrid'?m[2]:m[1]):p.name;
    return {name,e:p.engine};
  });
}
// Zero on these is "none" or "automatic", not a real engine's value: they get no tick.
const ICD_ZERO_NONE=['edCompWheel','edTaperRpm','edTqLimit','edGovRpm','edBoost'];
const icdTicks=id=>ICD_KEY[id]?dcTicks(icdRealEngines(),ICD_KEY[id],d=>!(ICD_ZERO_NONE.includes(id)&&!(+d.e[ICD_KEY[id]]>0))):[];
const icdChoice=v=>typeof v==='boolean'?(v?'yes':'no'):v;
function icdUsing(id,val){
  const k=ICD_KEY[id];if(!k)return [];
  if(ICD_ZERO_NONE.includes(id)&&!(+val>0))return [];
  return icdRealEngines().filter(d=>d.e[k]!=null&&+d.e[k]===+val).map(d=>d.name);
}

// ---- the preview: BUILD on the form, against the live engine and state, which are put back ----
function icdCompute(){
  if(document.getElementById('edType').value==='electric')return null;
  const keep={engine,state:Object.assign({},state),rev:buildRev,dc:dynoCache,dck:dynoCacheKey,kc:_knockCache};
  try{
    buildEngineCore((engine&&engine.stoichAFR)||14.7,true);
    const e=engine,s=e.score,am=e.afrMode;
    // the curve: the scorecard's own sweep (a warm, healthy engine at its best-power mixture), so it meets its peaks
    e.afrMode='fixed';
    Object.assign(state,{iat:25,coolant:90,oil:100,engineHealth:1,blown:false,elecLoad:0.3,afr:e.ci?e.stoichAFR*SMOKE_LAMBDA_CI:e.stoichAFR*0.86});
    const pts=[];for(let r=1000;r<=e.redline;r+=100){const q=calcAtRpm(r);pts.push({x:r,a:q.powerHP,b:q.torque});}
    e.afrMode=am;
    return {hp:s.peakHP,hpRpm:s.peakHPrpm,tq:s.peakTQ,tqRpm:s.peakTQrpm,disp:e.displacement_L,overall:s.overall,grade:s.grade,rel:s.reliability,
      safety:s.safety,knock:100-s.safety,cost:e.cost,redline:e.redline,float:e.floatRpm||0,ports:!!e.ports,rotary:e.type==='rotary',
      piston:2*e.stroke_mm/1000*e.redline/60,pts,bore:e.bore_mm,stroke:e.stroke_mm,cr:e.compression,cyl:e.cylinders,boost:e.intake==='na'?0:e.boost_bar};
  }finally{
    engine=keep.engine;
    for(const k of Object.keys(state))if(!(k in keep.state))delete state[k];
    Object.assign(state,keep.state);
    buildRev=keep.rev;dynoCache=keep.dc;dynoCacheKey=keep.dck;_knockCache=keep.kc;
  }
}
const icdKnockOver=r=>r.knock>KNOCK_TARGET+0.5;   // past the end-gas limit an AUTO ECU retards to (share-scoring.js)
const icdFloatShort=r=>r.float>0&&r.float<r.redline;

function icdSummary(c,r){
  const g=id=>document.getElementById(id).value,o=dcOptText,f=dcFmt;
  switch(c){
    case 'block':return (r&&r.rotary?g('edCyl')+'× '+tr('ROTOR'):g('edCyl')+'× '+o('edLayout'))+(r?' · '+f(r.disp,1)+' L':'')+
      ' · '+g('edBore')+'×'+g('edStroke')+' mm · '+g('edCR')+':1 · '+f(+g('edRedline'))+' rpm';
    case 'head':return r&&r.ports?tr('no poppet valves'):o('edValves')+' · '+o('edCam')+(g('edVVT')==='yes'?' · VVT':'')+(r&&r.float?' · '+tr('float')+' '+f(Math.round(r.float/100)*100)+' rpm':'');
    case 'air':return o('edIntake')+(g('edIntake')==='na'?'':' · '+(+g('edBoost')).toFixed(2)+' bar · '+(g('edIntake')==='turbo'?o('edTurboSize')+' '+o('edTurboConfig'):o('edScType')))+
      (g('edNitrous')!=='none'?' · N2O':'');
    case 'flow':return o('edIntakeSys')+' · '+o('edRunner')+' · '+o('edExhaust')+' · '+o('edCat');
    case 'fuel':return o('edFuel')+(document.getElementById('edOctane').disabled?'':' · '+g('edOctane')+' RON')+' · '+o('edTiming');
    case 'cool':return o('edRadiator')+' · '+o('edFan')+' · '+o('edAlternator');
  }
  return '';
}

const ICD=new DesignCards({
  prefix:'icd',root:'icDesigner',cards:ICD_CARDS,fields:ICD_FIELDS,depFields:ICD_DEPS,realHead:'REAL ENGINES',delay:150,
  ticks:icdTicks,using:icdUsing,choices:id=>ICD_KEY[id]?dcUsers(icdRealEngines(),ICD_KEY[id],null,icdChoice):new Map(),
  compute:icdCompute,
  active:()=>document.getElementById('edType').value!=='electric',
  h1:()=>'WHAT YOUR ENGINE DOES',
  helpEmpty:"Press ? beside any input, or change one: what it is, what it trades and the factory engines' values show here.",
  deltas:[['hp',' hp',0,1,''],['tq',' Nm',0,1,''],['disp',' L',2,0,''],['rel','',0,1,'reliability'],['overall','',0,1,'grade'],['cost','',-2,-1,'cost']],
  stats:(r,d)=>[['PEAK POWER',dcFmt(r.hp),'hp',d('hp',1,0)],['TORQUE',dcFmt(r.tq),'Nm',d('tq',1,0)],['DISPLACEMENT',dcFmt(r.disp,2),'L',''],
    ['GRADE',r.grade,' '+r.overall,d('overall',1,0)],['RELIABILITY',dcFmt(r.rel),'',d('rel',1,0)],['COST','$'+dcFmt(r.cost/1000,1),'k',d('cost',-1,0)]],
  slowText:r=>tr('Peak power at {p} rpm, peak torque at {t} rpm').replace('{p}',dcFmt(r.hpRpm)).replace('{t}',dcFmt(r.tqRpm))+
    (r.rotary?'':' · '+tr('mean piston speed at the redline {v} m/s').replace('{v}',dcFmt(r.piston,1))),
  legend:[['p','power (hp)'],['t','torque (Nm)']],curveLabel:'Power and torque against engine speed',
  curve:r=>({xMax:r.redline,mark:null,pts:r.pts}),
  // what holds it back: the valvetrain against the redline, and knock against its limit
  limits:r=>{
    const groups=[];
    if(r.float>0)groups.push({head:'REVS',rows:[['valve float',r.float],['redline',r.redline]],lit:icdFloatShort(r)?0:1,fmt:v=>dcFmt(v/1000,1)+'k'});
    groups.push({head:'KNOCK',rows:[['knock',r.knock],['limit',KNOCK_TARGET]],lit:icdKnockOver(r)?0:1,fmt:v=>dcFmt(v)});
    let v;
    if(icdFloatShort(r))v=tr('The valves float at {f} rpm, before the {r} rpm redline: stiffer springs, lighter valves or a lower redline.')
      .replace('{f}',dcFmt(Math.round(r.float/100)*100)).replace('{r}',dcFmt(r.redline));
    else if(icdKnockOver(r))v=tr('It knocks past what the ECU can hold off: more octane, less compression or boost, or AUTO ignition timing.');
    else v=tr('Breathing sets the peak: {hp} hp at {rpm} rpm, with knock under its limit.').replace('{hp}',dcFmt(r.hp)).replace('{rpm}',dcFmt(r.hpRpm))+
      (r.float>0?' '+tr('The valves are safe to {f} rpm.').replace('{f}',dcFmt(Math.round(r.float/100)*100)):'');
    return {groups,verdict:v};
  },
  mini:r=>[[dcFmt(r.hp),' hp'],[dcFmt(r.tq),' Nm'],[dcFmt(r.disp,1),' L'],[r.grade,' '+r.overall]],
  summary:icdSummary,
  warnings:r=>{const w={};
    if(icdFloatShort(r))w.edRedline=tr('The valves float at {f} rpm, under this redline.').replace('{f}',dcFmt(Math.round(r.float/100)*100));
    if(icdKnockOver(r)){w.edCR=tr('It knocks past what the ECU can hold off.');if(document.getElementById('edTiming').value==='fixed')w.edIgnAdv=w.edCR;}
    return w;},
  drawViz:(dc,r)=>icdDrawCylinder(dc,r),
  icons:{
    block:(P,C)=>{P(C.steel,[[2,1,2,12],[10,1,2,12],[2,12,10,1]]);P(C.fg,[[4,6,6,3]]);P(C.dim,[[6,9,2,3]]);},
    head:(P,C)=>{P(C.steel,[[1,2,12,2]]);P(C.fg,[[3,4,1,6],[10,4,1,6]]);P(C.yellow,[[2,10,3,1],[9,10,3,1]]);},
    air:(P,C)=>{P(C.cyan,[[1,6,5,2]]);P(C.steel,[[6,3,6,8]]);P(C.fg,[[8,5,2,4]]);},
    flow:(P,C)=>{P(C.copper,[[1,3,6,2],[1,9,6,2],[7,3,2,8],[9,6,4,2]]);},
    fuel:(P,C)=>{P(C.red,[[3,2,6,10]]);P(C.fg,[[9,4,3,1],[11,4,1,5]]);P(C.yellow,[[5,5,2,2]]);},
    cool:(P,C)=>{P(C.cyan,[[2,2,10,10]]);P(C.well,[[3,3,8,1],[3,6,8,1],[3,9,8,1]]);}
  }
});
const icdState=ICD.st;
// Called by syncDesignEnable whenever the form is synced: on for a combustion engine (with or without a hybrid), off else.
function icdSync(on){ICD.sync(on?'ice':'');}

// ---- the picture: one cylinder to scale, the piston at the top and the bottom of its stroke ----
function icdDrawCylinder(dc,r){
  const cv=dc.vizCanvas('block');if(!cv)return;
  const C=DC_COLOURS,x=dcCtx(cv),W=cv.width,H=cv.height;
  x.font='7px "Press Start 2P"';x.textAlign='center';
  if(r.rotary){x.fillStyle=C.dim;x.fillText(tr('ROTOR'),W/2,H/2);return;}
  const s=0.95,B=r.bore*s,S=r.stroke*s,clr=S/(r.cr-1),pH=Math.min(34,B*0.42);   // the clearance height: Vc = Vs/(CR-1)
  const cx=W/2-20,top=14,bdcY=top+clr+S;   // the piston's crown at TDC sits clr below the head, at BDC a stroke lower
  x.fillStyle=C.steel;x.fillRect(cx-B/2-6,top-6,B+12,6);   // the head
  x.fillRect(cx-B/2-6,top,6,clr+S+pH);x.fillRect(cx+B/2,top,6,clr+S+pH);   // the walls
  x.fillStyle='#3a2a1a';x.fillRect(cx-B/2,top,B,clr);   // the clearance volume
  x.strokeStyle=C.dim;x.lineWidth=1;x.strokeRect(cx-B/2+.5,bdcY+.5,B-1,pH-1);   // the piston at the bottom of its stroke
  x.fillStyle='#b8b8c8';x.fillRect(cx-B/2,top+clr,B,pH);   // the piston at the top
  x.fillStyle=C.yellow;x.fillRect(cx-B/2,top+clr-1,B,1);
  // dimensions
  const dx=cx+B/2+14;
  x.strokeStyle=C.cyan;x.beginPath();x.moveTo(dx,top+clr);x.lineTo(dx,bdcY);x.stroke();
  x.fillStyle=C.cyan;x.textAlign='left';x.fillText(tr('STROKE'),dx+4,top+clr+S/2-2);x.fillText(dcFmt(r.stroke,1),dx+4,top+clr+S/2+8);
  x.fillStyle=C.green;x.textAlign='center';x.fillText('Ø'+dcFmt(r.bore,1),cx,Math.min(H-14,bdcY+pH+12));
  x.fillStyle=C.yellow;x.textAlign='left';x.fillText(dcFmt(r.cr,1)+':1',dx+4,top+Math.max(6,clr/2+3));
  x.fillStyle=C.dim;x.textAlign='center';x.fillText(dcFmt(r.cyl)+'× · '+dcFmt(r.disp,2)+' L',W/2,H-4);
}
