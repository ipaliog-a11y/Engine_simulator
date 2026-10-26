// ====== VEHICLE: build spec, mass, gearing, aero and the acceleration simulation ======
const lerp=(a,b,t)=>a+(b-a)*t;
// Estimate the engine's installed mass (kg) from its spec — fed into the car's curb weight.
function engineMass(){
  let m=50+18*engine.displacement_L+7*engine.cylinders;
  if(engine.ci)m*=1.35;                                   // diesels: iron block, strong internals
  if(engine.intake==='turbo')m+=15+engine.boost_bar*10;
  else if(engine.intake==='supercharger')m+=25;
  if(engine.layout==='v'||engine.layout==='boxer')m+=10;
  return Math.round(m);
}
// Parse a numeric field, keeping a legitimate 0 (unlike `+v||fallback`).
const numOr=(v,fallback)=>{const n=parseFloat(v);return Number.isFinite(n)?n:fallback;};
// Speed at which drag and rolling resistance consume exactly the power available at the wheels.
// Bracketed bisection rather than a fixed point: the residual is monotonic in v, so this either
// brackets the crossing or returns the bracket edge, and cannot quietly return a non-solution.
function dragLimitedV(kW,cdA,crr,mass){
  if(!(kW>0)||!(cdA>0))return 0;
  const need=v=>(0.5*AIR_RHO*cdA*v*v*v+crrAt(crr,v)*mass*G*v)/1000;
  let lo=1,hi=200;
  if(need(hi)<kW)return hi;
  for(let i=0;i<60;i++){const m=(lo+hi)/2;if(need(m)<kW)lo=m;else hi=m;}
  return lo;
}
// The final drive a builder would choose for this engine in this car, biased by the gearing slider.
// Falls back to the old slider-only ramp before an engine exists to gear for.
const gearingBias=g=>lerp(1.28,0.74,g/100);   // 1.00 at the slider's default of 52
const FD_MIN=2.2, FD_MAX=6.0;   // the mechanical range of a real final drive
function matchedFinalDrive(){
  const bias=gearingBias(vehicle.gearing);
  const s=engine&&engine.score;
  const topGear=vehicle.ratios[vehicle.ratios.length-1];
  if(!s||!(s.peakHP>0)||!(s.peakHPrpm>0)||!(topGear>0)||!(vehicle.rTire>0))
    return lerp(4.9,2.6,vehicle.gearing/100);
  const vMax=dragLimitedV(s.peakHP*0.7457*vehicle.driveEff,vehicle.cdA,vehicle.crr,vehicle.mass);
  if(!(vMax>1))return lerp(4.9,2.6,vehicle.gearing/100);
  const fd=s.peakHPrpm*2*Math.PI*vehicle.rTire/60/(vMax*topGear);
  return clamp(fd*bias,FD_MIN,FD_MAX);
}
// Gear spacing (build 169). The ratios were one geometric progression from 3.35 to 0.82 for every car: a 4-speed and
// an 8-speed spanned the same range, and the steps were even. Real gearboxes are built otherwise. Adding gears widens
// the span (1st over top), and the steps shrink towards the top, because the speed lost on an upshift grows with the
// speed the shift is made at (Naunheimer et al., Automotive Transmissions, 2nd ed., §6.3). The standard design is the
// progressive one:
//     i_j = i_n · φ1^(n−j) · φ2^((n−j)(n−j−1)/2)
// φ2 = 1 is the even geometric box; the textbook gives 1.0-1.2 for cars. Fitted by least squares to the 30 distinct
// published boxes in GEARSETS, φ2 runs 1.00 (Corvette TR-6060) to 1.15 (Aygo), and it falls as gears are added (a
// five-speed's is near 1.1, the ten-speed Allison's 1.02): a fixed φ2 would turn a ten-speed's top gears back on
// themselves. What holds steady is the share of the span the progression makes, p = ln(φ2)·(n−1)(n−2)/2 / ln(span);
// the rest, (1−p)·ln(span), is the even part, φ1^(n−1). The span grows with the gear count as
//     ln(span) = 0.065 + 0.910·ln(n−1)
// CLOSE, STANDARD and WIDE are the lower quartile, the median and the upper quartile of those boxes, in the span's
// residual about that line and in p. The top gear sits at 0.82, as before; the final drive is matched to it.
const PROG_Q=[0.280,0.390,0.448];   // p: lower quartile, median, upper quartile of the published boxes
const GEAR_SPACING={
  close:{label:'CLOSE RATIO',res:-0.099,prog:PROG_Q[0]},
  std:  {label:'STANDARD',res:0.028,prog:PROG_Q[1]},
  wide: {label:'WIDE RATIO',res:0.102,prog:PROG_Q[2]}
};
const GEAR_SPAN_D=0.065, GEAR_SPAN_C=0.910, GEAR_TOP=0.82, GEARS_MIN=4, GEARS_MAX=10;
const gearSpan=(n,res)=>Math.exp(GEAR_SPAN_D+GEAR_SPAN_C*Math.log(n-1)+res);
function progressiveRatios(n,span,prog){
  const k1=n-1,L=Math.log(span),phi1=Math.exp((1-prog)*L/k1),phi2=k1>1?Math.exp(prog*L/(k1*(k1-1)/2)):1,out=[];
  for(let j=1;j<=n;j++){const k=n-j;out.push(GEAR_TOP*Math.pow(phi1,k)*Math.pow(phi2,k*(k-1)/2));}
  return out;
}
function genRatios(n,spacing){
  n=clamp(Math.round(n),GEARS_MIN,GEARS_MAX);const sp=GEAR_SPACING[spacing]||GEAR_SPACING.std;
  return progressiveRatios(n,gearSpan(n,sp.res),sp.prog);
}
// The same fit for one box: its span residual and its progression φ2 (least squares on ln(i_j/i_n)).
function fitGearbox(r){
  const n=r.length;let Saa=0,Sab=0,Sbb=0,Sya=0,Syb=0;
  for(let j=0;j<n;j++){const k=n-1-j,y=Math.log(r[j]/r[n-1]),fb=k*(k-1)/2;Saa+=k*k;Sab+=k*fb;Sbb+=fb*fb;Sya+=y*k;Syb+=y*fb;}
  const det=Saa*Sbb-Sab*Sab,a=(Sya*Sbb-Syb*Sab)/det,b=(Saa*Syb-Sab*Sya)/det;
  const L=Math.log(r[0]/r[n-1]);
  return {res:L-(GEAR_SPAN_D+GEAR_SPAN_C*Math.log(n-1)),phi2:Math.exp(b),phi1:Math.exp(a),prog:b*(n-1)*(n-2)/2/L};
}
// A real car's own box: its published set when there is one for its gear count; otherwise the average of the published
// boxes in its family (span residual and φ2), with the final drive matched to the engine. approx marks the second.
function stockGearset(name,n){
  const g=GEARSETS[name];
  if(g&&g.r.length===n)return {r:g.r.slice(),fd:g.fd,approx:false,src:g.src};
  const p=VEHICLE_PRESETS.find(q=>q.name===name);
  const fam=VEHICLE_PRESETS.filter(q=>q!==p&&(!p||q.cat===p.cat)&&GEARSETS[q.name]).map(q=>fitGearbox(GEARSETS[q.name].r));
  const pool=fam.length?fam:Object.values(GEARSETS).map(x=>fitGearbox(x.r));
  const res=pool.reduce((a,f)=>a+f.res,0)/pool.length, prog=pool.reduce((a,f)=>a+f.prog,0)/pool.length;
  return {r:progressiveRatios(n,gearSpan(n,res),prog),fd:null,approx:true,src:'the average of the published boxes in its family'};
}
// The ratios the car runs. CUSTOM keeps the hand-set ratios when there is one per gear, each taller than the one before.
function gearRatiosFor(v){
  const n=clamp(Math.round(v.gears||6),GEARS_MIN,GEARS_MAX);
  if(v.spacing==='custom'&&Array.isArray(v.ratioSet)&&v.ratioSet.length===n&&v.ratioSet.every((x,i)=>x>0&&(i===0||x<v.ratioSet[i-1])))
    return {r:v.ratioSet.slice(),fd:null};
  if(v.spacing==='stock'&&v.body){const s=stockGearset(v.body.name,n);return {r:s.r,fd:s.fd,approx:s.approx};}
  return {r:genRatios(n,v.spacing==='custom'||v.spacing==='stock'?'std':v.spacing),fd:null};
}
function readVehicleFromForm(){
  const g=id=>document.getElementById(id);
  return {
    chassis:g('vhChassis').value,drive:g('vhDrive').value,gearbox:g('vhGearbox').value,diff:g('vhDiff').value,
    // gearing may legitimately be 0 (shortest final drive), so fall back only on a non-number.
    gears:clamp(Math.round(+g('vhGears').value||6),GEARS_MIN,GEARS_MAX),gearing:clamp(numOr(g('vhGearing').value,52),0,100),
    tireType:g('vhTire').value,tireWidth:clamp(Math.round(+g('vhTireW').value||225),135,355),
    // the front tyres' width when narrower or wider than the rears (0 = the same), and the roll balance (build 157)
    tireWidthF:+g('vhTireWF').value>0?clamp(Math.round(+g('vhTireWF').value),135,355):0,
    tireAspect:clamp(Math.round(+g('vhTireA').value||40),25,70),wheelDia:clamp(Math.round(+g('vhWheel').value||18),13,22),
    aeroFront:g('vhAeroF').value,aeroRear:g('vhAeroR').value,aeroFloor:g('vhAeroFl').value,weightRed:g('vhWeight').value,
    brakeType:g('vhBrake').value,rotor:clamp(Math.round(+g('vhRotor').value||330),250,420),suspension:g('vhSusp').value,
    // each axle's geometry (build 173)
    suspFront:g('vhGeoF').value,suspRear:g('vhGeoR').value,
    // each axle's springs and anti-roll bar, steps about the kit (build 174)
    springF:stepOf(g('vhSpringF').value),springR:stepOf(g('vhSpringR').value),barF:stepOf(g('vhBarF').value),barR:stepOf(g('vhBarR').value),
    speedRating:g('vhRating').value,body:vehBody,
    // Steering-wheel turns per road-wheel turn. Only the live-timing wheel reads it; the lap does not.
    steerRatio:clamp(numOr(g('vhSteer').value,15),8,22),
    // Road-speed governor in km/h, 0 when removed. limitKmh keeps the set figure while it is off.
    governor:g('vhLimiter').value==='on'?clamp(Math.round(+g('vhLimitKmh').value||250),80,400):0,
    limitKmh:clamp(Math.round(+g('vhLimitKmh').value||250),80,400),
    // Traction control (build 154): the ECU holds the driven tyres at their best slip. Off, the launch is the driver's.
    tc:g('vhTC').value!=='off',
    // Gear spacing (build 169): CLOSE / STANDARD / WIDE, STOCK (a real car's own box) or CUSTOM. The hand-set ratios
    // and a hand-set final drive (0 = matched to the engine) live beside the form, like the body.
    spacing:g('vhSpacing').value,ratioSet:vehRatioSet?vehRatioSet.slice():null,finalDriveSet:vehFinalDriveSet
  };
}
// A spring or bar step from a form value or a record: an integer from -2 to 2, 0 when missing.
function stepOf(x){return clamp(Math.round(+x||0),-2,2);}
// The real car's body when one is loaded (see VEHICLE_PRESETS), else null and the archetype stands.
// It has no form fields of its own yet, so it lives here and travels with every saved build.
let vehBody=null, vehRatioSet=null, vehFinalDriveSet=0;
// The spacing choices on offer: STOCK only on a real car. A save from before build 169 carries none: a real car's
// own box, an archetype's STANDARD.
function fillSpacingSelect(hasBody,val){
  const sel=document.getElementById('vhSpacing');if(!sel)return;
  const opts=(hasBody?['stock']:[]).concat(Object.keys(GEAR_SPACING),'custom');
  sel.innerHTML=opts.map(k=>'<option value="'+k+'">'+esc(tr(k==='stock'?'STOCK':k==='custom'?'CUSTOM':GEAR_SPACING[k].label))+'</option>').join('');
  sel.value=opts.includes(val)?val:(hasBody?'stock':'std');
}
function applyVehicleToForm(v){
  const g=id=>document.getElementById(id);
  vehBody=v.body||null;
  vehRatioSet=Array.isArray(v.ratioSet)?v.ratioSet.map(Number):null;vehFinalDriveSet=+v.finalDriveSet>0?+v.finalDriveSet:0;
  fillSpacingSelect(!!vehBody,v.spacing);
  if(v.speedRating&&SPEED_RATING[v.speedRating])g('vhRating').value=v.speedRating;
  g('vhLimiter').value=v.governor>0?'on':'off';g('vhLimitKmh').value=v.governor>0?v.governor:(v.limitKmh||250);
  g('vhTC').value=v.tc===false?'off':'on';   // saves from before build 154 carry none: on
  g('vhChassis').value=v.chassis||'coupe';g('vhDrive').value=v.drive||'rwd';g('vhGearbox').value=v.gearbox||'manual';g('vhDiff').value=v.diff||'open';
  g('vhGears').value=v.gears||6;g('vhGearing').value=v.gearing!=null?v.gearing:52;
  g('vhTire').value=v.tireType||'sport';g('vhTireW').value=v.tireWidth||235;g('vhTireWF').value=v.tireWidthF||0;g('vhTireA').value=v.tireAspect||40;g('vhWheel').value=v.wheelDia||18;
  g('vhAeroF').value=v.aeroFront||'none';g('vhAeroR').value=v.aeroRear||'none';g('vhAeroFl').value=v.aeroFloor||'none';g('vhWeight').value=v.weightRed||'none';
  g('vhBrake').value=v.brakeType||'slotted';g('vhRotor').value=v.rotor||330;g('vhSusp').value=v.suspension||'sport';
  {const fg=factoryGeo(v);g('vhGeoF').value=SUSP_GEO[v.suspFront]?v.suspFront:fg.f;g('vhGeoR').value=SUSP_GEO[v.suspRear]?v.suspRear:fg.r;}   // saves from before build 173 carry none
  // saves from before build 174 carry ROLL BALANCE (arbBal), the front bar against the rear: it becomes the front bar
  g('vhSpringF').value=String(stepOf(v.springF));g('vhSpringR').value=String(stepOf(v.springR));
  g('vhBarF').value=String(stepOf(v.barF!=null?v.barF:v.arbBal));g('vhBarR').value=String(stepOf(v.barR));
  g('vhSteer').value=v.steerRatio||15;   // saves from before build 130 carry none
  updateGearingLabel();
}
// Fit a chassis with its factory-spec parts, so picking a chassis gives a coherent car instead of
// a hypercar on kei-car tyres. Everything stays editable afterwards — this only sets the baseline.
// A real car's body brings its own factory fitment, which wins over the archetype's.
function applyChassisFit(key,body){
  const ch=CHASSIS[key];if(!ch||!ch.fit)return null;
  const f=body?body.fit:ch.fit,g=id=>document.getElementById(id);
  g('vhChassis').value=key;   // self-contained: callers may fit a chassis without touching the select
  g('vhDrive').value=body?f.drive:ch.drive;g('vhGearbox').value=f.gearbox;g('vhDiff').value=f.diff;
  g('vhGears').value=f.gears;g('vhGearing').value=f.gearing;
  fillSpacingSelect(!!body,body?'stock':'std');vehRatioSet=null;vehFinalDriveSet=0;
  g('vhTire').value=f.tire;g('vhTireW').value=f.tw;g('vhTireWF').value=f.twF||0;
  ['vhSpringF','vhSpringR','vhBarF','vhBarR'].forEach(id=>g(id).value='0');g('vhTireA').value=f.ta;g('vhWheel').value=f.wheel;
  g('vhRating').value=(TIRE_TYPE[f.tire]||TIRE_TYPE.sport).rating;
  if(body){const top=VEHICLE_PRESETS.find(p=>p.name===body.name);
    if(top)g('vhRating').value=vehicleFromPreset(top).speedRating;}
  // A governor is factory equipment of a real car; an archetype ships without one.
  g('vhLimiter').value=f.gov>0?'on':'off';if(f.gov>0)g('vhLimitKmh').value=f.gov;
  g('vhTC').value=f.tc===false?'off':'on';   // a real car's traction control is factory equipment (build 154)
  g('vhAeroF').value=f.aF;g('vhAeroR').value=f.aR;g('vhAeroFl').value=f.aFl;g('vhWeight').value=f.weight;
  g('vhBrake').value=f.brake;g('vhRotor').value=f.rotor;g('vhSusp').value=f.susp;
  {const fg=factoryGeo({chassis:key,body});g('vhGeoF').value=fg.f;g('vhGeoR').value=fg.r;}
  updateGearingLabel();
  return ch;
}
// The GEARING slider is a final-drive ratio: 0 = shortest (4.90:1 — quick acceleration, low top
// speed), 100 = tallest (2.60:1 — relaxed revs, higher top speed). Show the ratio it means.
function updateGearingLabel(){
  const el=document.getElementById('vhGearing'),out=document.getElementById('valGearing');
  if(!el||!out)return;
  out.textContent=el.value+' · '+lerp(4.9,2.6,(+el.value)/100).toFixed(2)+':1';
  // a final drive set in the GEAR RATIOS window (build 170) overrides the slider
  el.disabled=vehFinalDriveSet>0;if(vehFinalDriveSet>0)out.textContent=tr('SET BY HAND')+' · '+vehFinalDriveSet.toFixed(2)+':1';
}
