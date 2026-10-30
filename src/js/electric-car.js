// ====== ELECTRIC CAR: the drive on the road — one reduction, regenerative braking, heat over a lap (build 180) ======
// Step 2.3 of plans/hybrid-electric/. The 0-100, the top speed and the lap run the electric drive through the same
// solvers as an engine (powertrain(), build 177); what an electric car does differently is here:
//   the driveline  a single fixed reduction, no gearbox: no shifts, no clutch, no launch rpm. The ratio is matched so
//                  the motor's top speed falls where drag meets the drive's peak power (an engine's top gear is matched
//                  to its power peak the same way, matchedFinalDrive), and the GEARING slider biases it as it does an
//                  engine's final drive. A reduction and a differential lose ~3% (a manual gearbox and its shafts ~10%);
//   regeneration   lifting off, the motor brakes the car as a generator, through the same path as an engine's
//                  overrun (the lap's engine braking, build 149-150): it adds to the brakes on the driven axle, never
//                  past the tyres' grip, and takes heat off the rotors. How hard is the lower of the motor's own
//                  torque at that speed and what the pack can take back (CHEM.cCharge);
//   heat           the motor (winding, core, rotor) and the pack are walked round the lap in time, a preparation lap
//                  then the timed one, as the brakes are (build 135); where the controller or the battery management
//                  cuts the current, the drive there is cut with it and the lap is solved again, as a turbo's boost
//                  is (build 118).
const EV_REDUCTION={label:'SINGLE-SPEED REDUCTION',shift:0,powershift:true,eff:1,stall:0,mult:1,cost:900};
const EV_DRIVE_EFF={fwd:0.97,rwd:0.97,awd:0.95};   // reduction gears and differential; AWD adds a transfer path
const EV_FD_MIN=4,EV_FD_MAX=14;                    // single-speed EVs run ~7.5 (Model S Plaid) to ~11 (small city cars)

// Set the driveline of an electric car: called by buildVehicle once the vehicle is otherwise built.
function electricDriveline(v){
  const e=engine,gb=EV_REDUCTION;
  v.gb=gb;v.gbLabel=gb.label;v.shiftTime=0;v.shiftCut=0;
  // a front motor drives the front wheels (build 183): all-wheel drive, whatever the form held when it was read
  if(e.motor.parts&&e.motor.parts.length>1)v.drive='awd';
  v.driveEff=EV_DRIVE_EFF[v.drive]||0.97;
  v.ratios=[1];v.gearsetApprox=false;
  // a real car's published reduction (build 183: the Teslas) stands in for the matched one, as an engine's final drive does
  const pub=v.body&&v.body.fit&&v.body.fit.fd>0?v.body.fit.fd:0;v.fdPublished=pub;
  // matched: the motor's top speed at the speed where drag and rolling resistance take the drive's peak power
  const s=e.score,vMax=dragLimitedV(s.peakKW*v.driveEff,v.cdA,v.crr,v.mass);
  const matched=vMax>1?e.redline*2*Math.PI*v.rTire/60/vMax:9;
  v.reductionMatched=matched;
  v.finalDrive=v.finalDriveSet>0?clamp(v.finalDriveSet,EV_FD_MIN,EV_FD_MAX)
    :clamp((pub?pub/gearingBias(52):matched)*gearingBias(v.gearing),EV_FD_MIN,EV_FD_MAX);
}
// The drive's torque at the wheels' motor speed, at its rated conditions (the pack at half charge, magnets at 60 C, the
// winding at coolant temperature): the design figure, as an engine's curve is taken at best power and 25 C. Cached per
// build (buildElectric makes a new score each time) and per power cap.
// evPowerCap (build 181): the race solves the car's pace with the battery power held to a share of what the rated curve
// draws at its peak (evRefPower); the race's energy manager, the battery management and the controller then choose
// between those paces as the race goes (src/js/electric-race.js). 1 everywhere else.
let evPowerCap=1;
function evCurve(e){
  const cap=evPowerCap,c=e._curve;
  if(c&&c.score===e.score&&c.cap===cap)return c.pts;
  const pts=evCurveAt(e,cap<1?cap*evRefPower(e):Infinity);
  e._curve={score:e.score,cap,pts};return pts;
}
function evCurveAt(e,Pcap){
  const V=motorRatedV(e),tc=e.motor.cool.tCool,cool={w:tc,c:tc,r:60},pts=[];
  const step=Math.max(50,Math.round(e.redline/120/50)*50);
  for(let r=0;r<=e.redline;r+=step)pts.push({rpm:r,tq:driveTorqueRated(e,Math.max(r,1),V,cool,Pcap)});
  if(pts[pts.length-1].rpm<e.redline)pts.push({rpm:e.redline,tq:driveTorqueRated(e,e.redline,V,cool,Pcap)});
  return pts;
}
// The most battery power the rated curve draws (W): the shaft power and the drive's losses at its peak.
function evRefPower(e){
  if(e._pRef&&e._pRef.score===e.score)return e._pRef.P;
  const V=motorRatedV(e),tc=e.motor.cool.tCool,cool={w:tc,c:tc,r:60};let P=0;
  for(const q of evCurveAt(e,Infinity)){const r=Math.max(q.rpm,1);P=Math.max(P,q.tq*r*Math.PI/30+motorLosses(e.motor,q.tq,r,V,cool).total);}
  e._pRef={score:e.score,P};return P;
}
// driveMaxTorque without the bench's live health and charge: the motor's envelope cut to the pack's power at half charge
// (or to Pcap, if lower).
function driveTorqueRated(e,rpm,V,temp,Pcap){
  const m=e.motor,w=rpm*Math.PI/30,Pb=Math.min(packMaxPower(e.pack,0.5),Pcap==null?Infinity:Pcap);
  let T=motorMaxTorque(m,rpm,V,temp.r);
  const need=t=>t*w+motorLosses(m,t,rpm,V,temp).total;
  if(T>0&&need(T)>Pb){let lo=0,hi=T;for(let k=0;k<30;k++){const mid=(lo+hi)/2;if(need(mid)>Pb)hi=mid;else lo=mid;}T=lo;}
  return T;
}
// The torque grid the runs read (gridTorque): one row, no boost axis.
function evGrid(e){const c=evCurve(e);return {rpms:c.map(p=>p.rpm),boosts:[0],tq:[c.map(p=>p.tq)],laggy:false};}
// Regeneration as overrun torque (Nm, positive), on the engine's 500-rpm-up table: the motor's torque at that speed,
// capped by the power the pack takes back. Below ~500 rpm a real car fades it out to stop smoothly; the table's floor
// does the same.
function evRegenTable(e,rl){
  const out=[],V=motorRatedV(e),Pc=e.pack.pChargeMax;
  for(let r=500;r<=rl+250;r+=250){
    const w=Math.min(r,rl)*Math.PI/30,T=motorMaxTorque(e.motor,Math.min(r,rl),V,60);
    out.push(Math.max(0,Math.min(T,Pc/Math.max(1,w))));
  }
  return out;
}
// The heat over a lap. prof: per point the time step (s), the motor speed (rpm) and torque (Nm, negative regenerating).
// Walks the lap twice from coolant temperature (a preparation lap, then the timed one) and gives, per point of the timed
// lap, the share of the drive the controller and the pack allow, and the temperatures it ran at.
function evLapHeat(e,prof){
  const m=e.motor,b=e.pack,V=motorRatedV(e),n=prof.dt.length,tc=m.cool.tCool;
  const t={w:tc,c:tc,r:tc},tb={b:PACK_COOLANT};
  const share=new Float64Array(n),tW=new Float64Array(n),tR=new Float64Array(n),tB=new Float64Array(n);
  let regenJ=0,driveJ=0;
  for(let lap=0;lap<2;lap++)for(let i=0;i<n;i++){
    // A timed lap starts on a pack cooled to its coolant beforehand (a track mode pre-conditions it): ~400 kg of cells
    // take a whole flat-out lap to heat, so the preparation lap that brings the motor and the rotors to their working
    // temperature would hand the timed lap a pack already hot. The race (step 2.4) carries the pack's heat lap to lap.
    if(lap===1&&i===0)tb.b=PACK_COOLANT;
    // the controller and the battery management act as the heat builds, not after it: the torque asked for is cut by the
    // share the temperatures allow at that moment, which is what holds a hot pack near its limit instead of past it
    const now=motorDerate(e,t)*packDerate(tb.b);
    const rpm=prof.rpm[i],T=prof.tq[i]*now,dt=prof.dt[i],w=rpm*Math.PI/30;
    const L=motorLosses(m,Math.abs(T),rpm,V,t);
    const P=T*w+L.total;                         // battery power: drawing (+), or taking back (-) less the losses
    const d=packDraw(b,0.5,P)||{heat:0,I:0};
    motorHeatStep(m,t,L,dt);packHeatStep(b,tb,d.heat,dt);
    if(lap===1){share[i]=motorDerate(e,t)*packDerate(tb.b);tW[i]=t.w;tR[i]=t.r;tB[i]=tb.b;
      if(P>0)driveJ+=P*dt;else regenJ-=P*dt;}
  }
  return {share,tW,tR,tB,driveKWh:driveJ/3.6e6,regenKWh:regenJ/3.6e6};
}
// The VEHICLE tab for an electric car: no gearbox type, speeds or spacing to choose, and GEARING sets the reduction.
// Called on every build, so an engine gets its own fields back.
function syncEvVehicleForm(ev){
  evDriveLock(ev&&!!(engine.motor&&engine.motor.parts&&engine.motor.parts.length>1)||isHybrid()&&!!engine.hy.front);   // a hybrid's front axle motor too (build 195)
  ['vhGearbox','vhGears','vhSpacing'].forEach(id=>{const el=document.getElementById(id);
    if(el){const f=el.closest('.field');if(f)f.style.display=ev?'none':'';}});
  const lb=document.getElementById('lblGearing');
  if(lb){if(lb.dataset.ice==null)lb.dataset.ice=lb.textContent;lb.textContent=ev?tr('GEARING (REDUCTION)'):tr(lb.dataset.ice);}
  // the readout is the reduction the car runs, not the engine slider's nominal final drive
  const out=document.getElementById('valGearing'),sl=document.getElementById('vhGearing');
  if(ev&&out&&sl&&vehicle&&vehicle.finalDrive)out.textContent=(vehFinalDriveSet>0?tr('SET BY HAND'):sl.value)+' · '+vehicle.finalDrive.toFixed(2)+':1';
}
// The vehicle summary's driveline line for an electric car, in place of the ratios.
function evDrivelineLine(v){
  return '<br>'+tr('Reduction')+' <b>'+v.finalDrive.toFixed(2)+':1</b> ('+tr('matched')+' '+v.reductionMatched.toFixed(2)+':1) • '+
    tr('regeneration up to')+' <b>'+Math.round(engine.pack.pChargeMax/1000)+' kW</b> • '+tr('motor and pack')+' '+powertrain().mass()+' kg';
}
// The TRACK panel's cells for an electric car: the motor's hottest and how much of the lap it was cut back, the pack's
// hottest, and the energy the lap drew and took back.
function evLapCells(ev,cell){
  const hot=(t,lim)=>'<span style="color:'+(t>=lim?'#ff5555':t>=lim-15?'#ffcc00':'#00ff88')+'">'+Math.round(t)+'°C</span>';
  return cell(tr('MOTOR'),hot(ev.wMax,150),ev.derated>0.005?tr('cut back')+' '+Math.round(ev.derated*100)+'% '+tr('of the lap'):tr('winding peak'))+
    cell(tr('BATTERY'),hot(ev.bMax,50),tr('pack peak'))+
    cell(tr('ENERGY'),ev.driveKWh.toFixed(2),'kWh · '+tr('regen')+' '+ev.regenKWh.toFixed(2));
}
