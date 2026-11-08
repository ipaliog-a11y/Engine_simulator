// ====== THE VEHICLE AS CARDS (build 247) ======
// The VEHICLE tab's fields, grouped in seven cards (CHASSIS NUMBERS since build 250) (src/shell.html, #vhDesigner), with the cards of src/js/design-cards.js
// around them: a slider and the factory cars' ticks beside each number, a "?" that explains it, the effect of each
// change, and a side panel of what the car does and what holds it back.
// The form is live: each field's own input listener (src/js/controls-boot.js) runs buildVehicle, which fits the car and
// runs the 0-100 and top-speed run. The preview only reads the car and its run (vcdCompute), so it is the PERFORMANCE
// panel's figures exactly, and nothing here is physics.

const VCD_CARDS=[
  {id:'chassis',title:'CHASSIS & DRIVE',guide:'vehicle'},
  {id:'dims',title:'CHASSIS NUMBERS',guide:'vehicle'},
  {id:'gearbox',title:'GEARBOX',guide:'gearbox'},
  {id:'tyres',title:'WHEELS & TYRES',guide:'tyres',viz:'tyre',vizH:150,cap:'To scale: the tyre in section, its tread width and its sidewall (the width times the aspect) around the rim.'},
  {id:'aero',title:'AERO & WEIGHT',guide:'aero'},
  {id:'brakes',title:'BRAKES & STEERING',guide:'brakes'},
  {id:'susp',title:'SUSPENSION',guide:'suspension'}
];
const VCD_FIELDS={
  vhChassis:{what:'The body the engine goes into. Each class is the median real car of its class: its weight, drag, size and factory parts.',
    trade:'Picking one fits its whole factory spec. A lighter, smaller body accelerates and turns better; a bigger one carries more and is more stable.'},
  vhDrive:{guide:'traction',what:'Which wheels the engine drives: the front, the rear, or all four.',
    trade:'Weight moves to the rear under acceleration, so the rear wheels can put down more than the front. AWD uses all four tyres, for more mass, cost and driveline loss.'},
  vhDiff:{guide:'traction',what:'How the differential splits the drive between the two wheels on an axle.',
    trade:'An open diff lets the lighter-loaded wheel spin; a limited-slip diff sends the torque to the wheel that grips. A spool locks them together: the most traction, the worst in tight corners.'},
  vhTC:{guide:'traction',what:'Whether the ECU holds the driven tyres at their best slip when they would spin.',
    trade:'On, the launch stays at the limit of grip. Off, the launch is the driver\'s, and a powerful car spins its tyres.'},
  vhLimiter:{guide:'performance',what:'A governor that cuts the drive at a set road speed.',
    trade:'Many fast cars are limited to 250 km/h. It holds the top speed down; it cannot add speed the car does not have.'},
  vhLimitKmh:{guide:'performance',what:'The road speed the limiter holds, when it is on.',
    trade:'Set it under the tyres\' speed rating. Off, the figure is kept for when you turn it back on.'},
  vhDims:{what:'FACTORY: the car\'s own wheelbase, tracks, CG height and weight split. DESIGNED: the numbers below, set by hand.',
    trade:'Changing any number below makes it DESIGNED. Ballast works on either.'},
  vhWb:{what:'The distance between the front and rear axles.',
    trade:'A longer wheelbase moves less weight between the axles under braking and acceleration: steadier, less traction gained at the driven rear. It does not add mass or drag here.'},
  vhTrackF:{what:'How far apart the front wheels are, centre to centre.',
    trade:'A wider track rolls less and moves less weight across the car. On the same springs a wider axle is also stiffer in roll (as the track squared), so it takes more of the roll, like a stiffer bar: a wider front leans toward understeer.'},
  vhTrackR:{what:'How far apart the rear wheels are, centre to centre.',
    trade:'A wider rear track rolls less, and on the same springs takes more of the roll, like a stiffer rear bar: toward oversteer.'},
  vhCg:{what:'The height of the car\'s centre of gravity above the road. Makers rarely publish it: the factory figure is its class\'s.',
    trade:'Lower is better everywhere: less weight moved in corners, under braking and under power, and less roll. A tall car loses grip to its own load transfer.'},
  vhFwt:{what:'The share of the car\'s weight on the front axle at rest, with this engine in it.',
    trade:'More weight on the driven axle gives more traction at launch. Nearer 50% balances the two axles in corners. Swapping the engine moves the FACTORY split, not a designed one.'},
  vhBallast:{guide:'vehicle',what:'Added mass, bolted to the floor: a race series\' minimum weight, or a way to move the balance.',
    trade:'Every kg slows acceleration, braking and cornering. Placed low and forward or rearward, it moves the weight split and lowers the centre of gravity.'},
  vhBallastPos:{what:'Where the ballast sits along the car: the share of its weight on the front axle.',
    trade:'0% is on the rear axle, 100% on the front axle, 50% half way. It moves the weight split by its mass against the car\'s.'},
  vhBallastH:{what:'The height of the ballast\'s own centre above the road.',
    trade:'Below the car\'s centre of gravity it lowers it, above it raises it, by its mass against the car\'s.'},
  vhGearbox:{what:'The kind of gearbox.',
    trade:'A manual is light and cheap, with a cut in drive at every shift. A sequential or a dual-clutch shifts faster (a DCT without a cut), and a torque-converter auto multiplies torque at launch, for more loss.'},
  vhGears:{guide:'gearing',what:'How many forward gears.',
    trade:'More gears keep the engine nearer its peak power at every speed, for more mass and cost.'},
  vhSpacing:{guide:'gearing',what:'How the ratios are spread between first and top: close, standard or wide, the real car\'s own box, or your own.',
    trade:'Close ratios keep the engine in its power band and give a lower top gear; wide ones cruise at lower rpm. GEAR RATIOS sets each one by hand.'},
  vhGearing:{guide:'gearing',what:'The final drive: one ratio that every gear goes through. Short to the left, tall to the right.',
    trade:'Shorter gearing multiplies the torque at the wheels, for quicker acceleration, but reaches the redline at a lower speed in top. Taller gearing can cost top speed too, when the engine can no longer pull top gear.'},
  vhTire:{guide:'tyres',what:'The tyre\'s rubber and tread: from eco tyres that roll easily to race slicks.',
    trade:'A stickier compound grips more, to accelerate, brake and turn, and rolls with more resistance. It is sold rated for a speed: a new compound raises the rating to its usual one.'},
  vhRating:{guide:'tyres',what:'The highest speed the tyre is built to hold.',
    trade:'A car that can go faster than its tyres are rated for is running on a tyre failure. Fit a rating at least as high as the top speed.'},
  vhWheel:{guide:'tyres',what:'The diameter of the wheel rim.',
    trade:'With the sidewall it sets the tyre\'s radius, and so the gearing. A larger wheel with a lower sidewall steers more sharply, for more mass and a harder ride.'},
  vhTireW:{guide:'tyres',what:'The width of the tyre\'s tread, in mm (the rears\', on a car with staggered tyres).',
    trade:'A wider tyre carries more load before its grip falls away, so it grips more, for more drag, rolling resistance and mass.'},
  vhTireA:{guide:'tyres',what:'The sidewall\'s height as a share of the tyre\'s width.',
    trade:'A lower sidewall flexes less: sharper steering, a harder ride. With the wheel it sets the rolling radius.'},
  vhTireWF:{adv:true,guide:'tyres',what:'The front tyres\' width, when they differ from the rears. 0 is the same as the rears.',
    trade:'Narrower fronts on a rear-drive car move the balance toward understeer and save drag; the rears carry the drive.'},
  vhAeroF:{what:'What the front of the car carries to make downforce.',
    trade:'A splitter or a front wing presses the front tyres down at speed, for more grip in fast corners and a little more drag.'},
  vhAeroR:{what:'What the rear of the car carries to make downforce.',
    trade:'A wing makes the most downforce at the rear, and the most drag: it costs top speed and gains grip in fast corners.'},
  vhAeroFl:{what:'The underside of the car.',
    trade:'A flat undertray and a diffuser make downforce from the air under the car, with little drag: the most efficient downforce there is.'},
  vhWeight:{guide:'vehicle',what:'How much mass is stripped out of the car.',
    trade:'Every kg less is quicker acceleration, braking and cornering. Each stage costs more and strips more comfort.'},
  vhBrake:{what:'The brake discs and their material.',
    trade:'Bigger and better-cooled brakes hold their temperature lap after lap before they fade. Carbon-ceramics are light and fade the least, and cost the most.'},
  vhRotor:{what:'The brake disc\'s diameter, in mm.',
    trade:'A bigger disc has more leverage and more mass to soak up heat, so it fades later, for more unsprung mass. It must fit inside the wheel.'},
  vhSteer:{adv:true,what:'How many degrees the steering wheel turns for one degree at the road wheels.',
    trade:'A quicker (lower) ratio needs less steering-wheel angle: sharper, and more nervous. Only the live-timing wheel reads it; the lap does not.'},
  vhSusp:{what:'The suspension kit: its springs, dampers and anti-roll bars together.',
    trade:'Stiffer suspension rolls less and keeps the tyres flatter in corners, for a harsher ride and less grip over bumps.'},
  vhGeoF:{what:'How the front wheels are located.',
    trade:'A double wishbone or multi-link holds the tyre flatter as the car rolls than a strut; a strut is cheaper and lighter. A solid axle is the simplest and the least precise.'},
  vhGeoR:{what:'How the rear wheels are located.',
    trade:'Independent geometry keeps each tyre on the road on its own; a twist beam or a solid axle is cheaper and ties the two sides together.'},
  vhSpringF:{adv:true,what:'The front springs, softer or stiffer than the kit\'s.',
    trade:'Stiffer at the front moves the balance toward understeer and rolls less; softer grips better over bumps.'},
  vhSpringR:{adv:true,what:'The rear springs, softer or stiffer than the kit\'s.',
    trade:'Stiffer at the rear moves the balance toward oversteer.'},
  vhBarF:{adv:true,what:'The front anti-roll bar, softer or stiffer than the kit\'s.',
    trade:'A stiffer front bar carries more of the load transfer at the front: more understeer, less roll.'},
  vhBarR:{adv:true,what:'The rear anti-roll bar, softer or stiffer than the kit\'s.',
    trade:'A stiffer rear bar carries more of the load transfer at the rear: more oversteer, less roll.'},
  vhDamperF:{adv:true,guide:'dampers',what:'The front dampers, softer or stiffer than the kit\'s.',
    trade:'Stiffer dampers settle the body faster after a bump, and pass more of the road through to the cabin.'},
  vhDamperR:{adv:true,guide:'dampers',what:'The rear dampers, softer or stiffer than the kit\'s.',
    trade:'Stiffer dampers settle the body faster after a bump, and pass more of the road through to the cabin.'}
};
// Where a field's value lives on a factory car (vehicleFromPreset), and how a choice is written there.
const VCD_KEY={vhChassis:'chassis',vhDrive:'drive',vhDiff:'diff',vhTC:'tc',vhLimiter:'governor',vhLimitKmh:'governor',vhGearbox:'gearbox',vhGears:'gears',
  vhTire:'tireType',vhRating:'speedRating',vhWheel:'wheelDia',vhTireW:'tireWidth',vhTireA:'tireAspect',vhTireWF:'tireWidthF',
  vhAeroF:'aeroFront',vhAeroR:'aeroRear',vhAeroFl:'aeroFloor',vhWeight:'weightRed',vhBrake:'brakeType',vhRotor:'rotor',vhSusp:'suspension',
  vhGeoF:'suspFront',vhGeoR:'suspRear',vhWb:'dWb',vhTrackF:'dTrackF',vhTrackR:'dTrackR',vhCg:'dCg',vhFwt:'dFwt'};
const VCD_ZERO_NONE=['vhLimitKmh','vhTireWF'];   // 0 is "none" or "the same", not a real car's value: no tick
const VCD_CHOICE={vhTC:v=>v?'on':'off',vhLimiter:v=>+v>0?'on':'off'};

// The factory cars behind the ticks, each as the form its preset loads, named without its code and year.
let vcdCars=null;
function vcdRealCars(){
  if(vcdCars)return vcdCars;
  vcdCars=[];
  // each with its factory chassis numbers (build 250), for the CHASSIS NUMBERS card's ticks
  for(const p of FACTORY_CARS){try{const e=vehicleFromPreset(p),F=factoryDims(e);
    Object.assign(e,{dWb:F.wb,dTrackF:F.trackF,dTrackR:F.trackR,dCg:F.cg,dFwt:+(F.fWt*100).toFixed(1)});
    vcdCars.push({name:p.name.replace(/\s*\([^)]*\)\s*$/,''),e});}catch(e){}}
  return vcdCars;
}
const vcdTicks=id=>VCD_KEY[id]?dcTicks(vcdRealCars(),VCD_KEY[id],d=>!(VCD_ZERO_NONE.includes(id)&&!(+d.e[VCD_KEY[id]]>0))):[];
function vcdUsing(id,val){
  const k=VCD_KEY[id];if(!k||VCD_ZERO_NONE.includes(id)&&!(+val>0))return [];
  return vcdRealCars().filter(d=>d.e[k]!=null&&+d.e[k]===+val).map(d=>d.name);
}

// ---- the preview: the car and its run as buildVehicle left them ----
function vcdCompute(){
  const V=vehicle,p=perf;if(!V||!p||!V.ratios)return null;
  return {t100:p.t100,top:p.topSpeed,free:p.freeSpeed,governed:p.governed,q400:p.q400?p.q400.t:null,b100:p.brake100?p.brake100.dist:null,
    mass:V.mass,ptw:V.powerToWeight,mu:V.mu,cost:V.cost,rated:V.ratedKmh,gov:V.governor,gripT:p.gripT||0,lagT:p.lagT||0,spinT:p.spinT||0,
    fd:V.finalDrive,eff:V.driveEff,ev:!!V.ev,tw:V.tireWidth,twF:V.tireWidthF,ta:V.tireAspect,wheel:V.wheelDia,rTire:V.rTire,...vcdForce(V,p.topSpeed)};
}
// Drive force at the wheels in the best gear, against drag and rolling, over road speed (kN): the gear window's force
// graph (src/js/gear-window.js), one line. They cross at the top speed. The dotted line is the driven tyres' grip at rest.
function vcdForce(V,top){
  const pt=powertrain(),curve=pt.torqueCurve(),rl=pt.maxRpm(),idle=V.ev?0:(pt.idleRpm()||800),fd=V.finalDrive,r=V.rTire,eff=V.driveEff;
  const tq=rpm=>{if(rpm<=curve[0].rpm)return curve[0].tq;for(let k=1;k<curve.length;k++)if(rpm<=curve[k].rpm){const a=curve[k-1],b=curve[k];return a.tq+(b.tq-a.tq)*(rpm-a.rpm)/(b.rpm-a.rpm);}return curve[curve.length-1].tq;};
  const grip=V.mu*V.mass*G*V.drivenWt/1000,xMax=Math.max(100,(top||0)*1.15),pts=[];
  for(let vk=2;vk<=xMax;vk+=2){
    const v=vk/3.6;let best=0;
    V.ratios.forEach((g,i)=>{const rpm=v*g*fd/r*60/(2*Math.PI);if(rpm>rl||rpm<idle&&i)return;best=Math.max(best,tq(Math.max(rpm,idle))*g*fd*eff/r);});
    pts.push({x:vk,a:best/1000,b:(0.5*AIR_RHO*V.cdA*v*v+crrAt(V.crr,v)*V.mass*G)/1000,a0:grip});
  }
  return {pts,xMax};
}
const vcdTyresShort=r=>r.rated>0&&r.top>r.rated+0.5;   // (Y), over 300, is rated for any speed (Infinity)
const vcdGripBound=r=>r.t100!=null&&r.gripT>0.5*r.t100;

function vcdSummary(c,r){
  const g=id=>document.getElementById(id).value,o=dcOptText,f=dcFmt;
  switch(c){
    case 'chassis':return o('vhChassis')+' · '+o('vhDrive')+' · '+o('vhDiff')+(r?' · '+f(r.mass)+' kg':'');
    case 'dims':return o('vhDims')+' · '+g('vhWb')+' m · '+g('vhCg')+' m · '+g('vhFwt')+'% '+tr('front')+(+g('vhBallast').value>0?' · +'+g('vhBallast')+' kg':'');
    case 'gearbox':return (r&&r.ev?tr('SINGLE-SPEED'):o('vhGearbox')+' · '+g('vhGears')+' '+tr('speeds'))+(r?' · '+tr('final drive')+' '+f(r.fd,2):'');
    case 'tyres':return o('vhTire')+' · '+g('vhTireW')+'/'+g('vhTireA')+' R'+g('vhWheel')+' · '+g('vhRating').replace('YY','(Y)');
    case 'aero':return [o('vhAeroF'),o('vhAeroR'),o('vhAeroFl')].join(' / ')+' · '+o('vhWeight');
    case 'brakes':return o('vhBrake')+' · '+g('vhRotor')+' mm'+(r&&r.b100?' · 100–0 '+f(r.b100)+' m':'');
    case 'susp':return o('vhSusp')+' · '+o('vhGeoF')+' / '+o('vhGeoR');
  }
  return '';
}

const VCD=new DesignCards({
  prefix:'vcd',root:'vhDesigner',panel:'vehiclePanelTab',live:true,cards:VCD_CARDS,fields:VCD_FIELDS,realHead:'REAL CARS',
  ticks:vcdTicks,using:vcdUsing,choices:id=>VCD_KEY[id]?dcUsers(vcdRealCars(),VCD_KEY[id],null,VCD_CHOICE[id]):new Map(),
  compute:vcdCompute,
  active:()=>!!vehicle,
  visible:f=>f.style.display!=='none',   // an electric car has no gearbox type, speeds or spacing (syncEvVehicleForm)
  h1:()=>'WHAT YOUR CAR DOES',
  helpEmpty:"Press ? beside any input, or change one: what it is, what it trades and the factory cars' values show here.",
  deltas:[['t100',' s',2,-1,'0–100'],['top',' km/h',0,1,'top speed'],['mass',' kg',0,-1,''],['mu','',2,1,'grip'],['b100',' m',0,-1,'braking'],['cost','',-2,-1,'cost']],
  stats:(r,d)=>[['0–100 km/h',r.t100!=null?dcFmt(r.t100,2):'—','s',d('t100',-1,2)],['TOP SPEED',dcFmt(r.top),'km/h',d('top',1,0)],
    ['400 m',r.q400!=null?dcFmt(r.q400,2):'—','s',d('q400',-1,2)],['WEIGHT',dcFmt(r.mass),'kg',d('mass',-1,0)],['GRIP',dcFmt(r.mu,2),'μ',d('mu',1,2)],
    ['COST','$'+dcFmt(r.cost/1000,1),'k',d('cost',-1,0)]],
  slowText:r=>(r.b100?tr('100–0 km/h in {b} m').replace('{b}',dcFmt(r.b100))+' · ':'')+tr('{p} hp/t').replace('{p}',dcFmt(r.ptw))+' · '+
    tr('driveline {e}%').replace('{e}',dcFmt(r.eff*100)),
  legend:[['p','drive force, best gear (kN)'],['t','drag and rolling (kN)'],['m','driven tyres\' grip']],curveLabel:'Drive force and resistance against road speed',
  curve:r=>({xMax:r.xMax,xStep:50,xLab:v=>dcFmt(v),yStep:5,shared:true,mark:{x:r.top,label:dcFmt(r.top)},pts:r.pts}),
  // what holds it back: the top speed (power and drag, the limiter, the tyres' rating) and the launch (grip, boost)
  limits:r=>{
    const groups=[],top=[['power and drag',r.free]];
    if(isFinite(r.rated))top.push(['tyre rating',r.rated]);
    if(r.gov>0)top.push(['limiter',r.gov]);
    groups.push({head:'TOP SPEED',rows:top,lit:r.governed?top.length-1:vcdTyresShort(r)?1:0,fmt:v=>dcFmt(v)});
    if(r.t100!=null)groups.push({head:'0–100 KM/H',rows:[['0–100',r.t100],['at the grip limit',r.gripT],['below full boost',r.lagT]],
      lit:vcdGripBound(r)?1:r.lagT>0.3*r.t100?2:0,fmt:v=>dcFmt(v,1)+' s'});
    let v;
    if(vcdTyresShort(r))v=tr('The car reaches {v} km/h on tyres rated for {r}: fit a higher speed rating.').replace('{v}',dcFmt(r.top)).replace('{r}',dcFmt(r.rated));
    else if(r.governed)v=tr('The limiter holds it to {g} km/h; without it the car would reach {f}.').replace('{g}',dcFmt(r.gov)).replace('{f}',dcFmt(r.free));
    else if(vcdGripBound(r))v=tr('The tyres hold it back: {s} s of the 0–100 is spent at the limit of grip. Stickier or wider tyres, or more driven wheels.').replace('{s}',dcFmt(r.gripT,1));
    else v=tr('Power against drag sets the top speed, {v} km/h, and the engine the 0–100.').replace('{v}',dcFmt(r.top));
    return {groups,verdict:v};
  },
  mini:r=>[[r.t100!=null?dcFmt(r.t100,1):'—',' s'],[dcFmt(r.top),' km/h'],[dcFmt(r.mass),' kg'],[dcFmt(r.ptw),' hp/t']],
  summary:vcdSummary,
  warnings:r=>{const w={};
    if(vcdTyresShort(r))w.vhRating=tr('The car reaches {v} km/h, past this rating.').replace('{v}',dcFmt(r.top));
    return w;},
  drawViz:(dc,r)=>vcdDrawTyre(dc,r),
  icons:{
    chassis:(P,C)=>{P(C.steel,[[3,4,7,3],[1,7,12,3]]);P(C.cyan,[[4,5,2,2],[7,5,2,2]]);P(C.fg,[[2,10,3,3],[9,10,3,3]]);},
    dims:(P,C)=>{P(C.fg,[[1,9,3,3],[10,9,3,3]]);P(C.steel,[[2,6,10,2]]);P(C.cyan,[[6,3,2,2]]);P(C.yellow,[[1,13,12,1]]);},
    gearbox:(P,C)=>{P(C.steel,[[2,2,2,10],[6,2,2,10],[10,2,2,10],[2,6,10,2]]);P(C.yellow,[[10,10,2,2]]);},
    tyres:(P,C)=>{P(C.dim,[[3,1,8,12],[1,3,12,8]]);P(C.well,[[4,4,6,6]]);P(C.fg,[[6,6,2,2]]);},
    aero:(P,C)=>{P(C.fg,[[1,3,12,2]]);P(C.steel,[[3,5,1,6],[10,5,1,6]]);P(C.cyan,[[1,11,12,1]]);},
    brakes:(P,C)=>{P(C.steel,[[2,2,10,10]]);P(C.well,[[5,5,4,4]]);P(C.red,[[9,1,4,5]]);},
    susp:(P,C)=>{P(C.yellow,[[4,1,6,1],[4,3,6,1],[4,5,6,1],[4,7,6,1],[4,9,6,1]]);P(C.steel,[[6,10,2,3],[3,12,8,1]]);}
  }
});
// Called after every change to the car (updateVehicleSummary): the first time it builds the cards; after a language
// change it renews their text. A change made on a card has already named its field, so the change's chips survive.
function vcdRefresh(){
  const st=VCD.st;if(!document.getElementById('vhDesigner'))return;
  if(!st.ready||st.lang!==currentLang){st.lang=currentLang;VCD.sync('veh');return;}
  st.last=null;VCD.queue(true,true);
}

// ---- the picture: the tyre in section, to scale ----
function vcdDrawTyre(dc,r){
  const cv=dc.vizCanvas('tyres');if(!cv)return;
  const C=DC_COLOURS,x=dcCtx(cv),W=cv.width,H=cv.height;
  const sw=r.tw*r.ta/100,rim=r.wheel*25.4,D=rim+2*sw,s=Math.min((H-(r.twF>0?40:30))/D,(W-110)/r.tw);
  const tw=r.tw*s,th=D*s,cx=Math.round(W/2-24),top=10,left=Math.round(cx-tw/2),swp=sw*s;
  x.fillStyle='#2a2a33';x.fillRect(left,top,tw,th);   // the tyre
  x.fillStyle='#14141a';for(let i=3;i<tw-2;i+=5){x.fillRect(left+i,top,2,3);x.fillRect(left+i,top+th-3,2,3);}   // tread
  x.fillStyle=C.steel;x.fillRect(left+2,top+swp,tw-4,th-2*swp);   // the rim
  x.fillStyle=C.dim;x.fillRect(left-4,Math.round(top+th/2)-1,tw+8,2);   // the axle
  x.font='7px "Press Start 2P"';
  const dx=left+tw+10;
  x.strokeStyle=C.cyan;x.beginPath();x.moveTo(dx+.5,top);x.lineTo(dx+.5,top+swp);x.stroke();
  x.fillStyle=C.cyan;x.textAlign='left';x.fillText(dcFmt(sw)+' mm',dx+5,top+swp/2+3);
  x.fillStyle=C.dim;x.fillText('R'+r.wheel,dx+5,top+th/2+3);
  x.fillStyle=C.yellow;x.fillText('Ø'+dcFmt(D)+' mm',dx+5,top+th-4);
  x.fillStyle=C.green;x.textAlign='center';x.fillText(dcFmt(r.tw)+' mm',cx,top+th+12);
  if(r.twF>0){x.fillStyle=C.dim;x.fillText(tr('front')+' '+dcFmt(r.twF),cx,top+th+22);}
}
