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
// Optional 2-speed EV gearbox (Porsche Taycan rear 2-speed planetary, 2020: 1st 15.56:1 / 2nd 8.05:1 = 1.933;
// Porsche Technical Data 2020; wet-clutch powershift ~0.12 s, +18 kg, +$1,400).
const EV_REDUCTION_2SPD={label:'2-SPEED EV GEARBOX',shift:0.12,powershift:true,eff:0.99,stall:0,mult:1,cost:2300,ratios:[1.93,1.0],mass:18};
const EV_GEARBOXES={'1spd':{label:'1-SPEED REDUCTION',gb:EV_REDUCTION},'2spd':{label:'2-SPEED (1.93 / 1.00)',gb:EV_REDUCTION_2SPD}};
const EV_DRIVE_EFF={fwd:0.97,rwd:0.97,awd:0.95};   // reduction gears and differential; AWD adds a transfer path
const EV_FD_MIN=4,EV_FD_MAX=14;                    // single-speed EVs run ~7.5 (Model S Plaid) to ~11 (small city cars)

// Set the driveline of an electric car: called by buildVehicle once the vehicle is otherwise built.
function electricDriveline(v){
  const e=engine,twoSpd=e.evGearbox==='2spd',gb=twoSpd?EV_REDUCTION_2SPD:EV_REDUCTION;
  v.gb=gb;v.gbLabel=gb.label;v.shiftTime=gb.shift;v.shiftCut=twoSpd?0.06:0;
  // a front motor drives the front wheels (build 183): all-wheel drive, whatever the form held when it was read
  if(e.motor.parts&&e.motor.parts.length>1)v.drive='awd';
  v.driveEff=(EV_DRIVE_EFF[v.drive]||0.97)*gb.eff;
  v.ratios=twoSpd?EV_REDUCTION_2SPD.ratios.slice():[1];v.gearsetApprox=false;
  // a real car's published reduction (build 183: the Teslas) stands in for the matched one, as an engine's final drive does
  const pub=v.body&&v.body.fit&&v.body.fit.fd>0?v.body.fit.fd:0;v.fdPublished=pub;
  // matched: the motor's top speed at the speed where drag and rolling resistance take the drive's peak power
  const s=e.score,vMax=dragLimitedV(s.peakKW*v.driveEff,v.cdA,v.crr,v.mass);
  const matched=vMax>1?e.redline*2*Math.PI*v.rTire/60/vMax:9;
  v.reductionMatched=matched;
  v.finalDrive=v.finalDriveSet>0?clamp(v.finalDriveSet,EV_FD_MIN,EV_FD_MAX)
    :clamp((pub?pub/gearingBias(52):matched)*gearingBias(v.gearing),EV_FD_MIN,EV_FD_MAX);
  // Per-axle front reduction ratio for multi-motor pure EVs (evFrontFd > 0 overrides matched front = rear ratio)
  v.frontFd=0;
  if(e.motor.parts&&e.motor.parts.length>1){
    const fdF=e.evFrontFd>0?clamp(e.evFrontFd,EV_FD_MIN,EV_FD_MAX):v.finalDrive;
    v.frontFd=fdF;
    const kNew=fdF/v.finalDrive;
    if(Math.abs((e.motor.parts[1].k||1)-kNew)>1e-6){
      e.motor.parts[1].k=kNew;
      e._curve=null;e._pRef=null;e._gain=null;
    }
  }
  // Dual-rear EV independent motor torque vectoring (one motor per rear wheel, no mechanical differential)
  v.dualRearTV=!!(e.motor&&e.motor.dualRear);
  if(v.dualRearTV){
    const rm=e.motor.parts[0].m,V=motorRatedV(e),tOne=motorMaxTorque(rm,500,V,60);
    const trk=v.trackR||v.track||1.6;
    v.tvYawCap=trk*tOne*v.finalDrive*v.driveEff/Math.max(0.2,v.rTire);   // peak active yaw moment (N m)
  }else v.tvYawCap=0;
}
// Independent dual-rear motor torque vectoring yaw assist: distributes rear torque asymmetrically between outer and
// inner rear wheels (up to each motor's envelope and each tyre's friction circle) to generate direct yaw moment Mz
// (N m) without the drag or turn-in resistance of a mechanical clutch-plate LSD.
function evRearTorqueVector(m,v,ay,vx,Treq=0){
  if(!m||!m.dualRear||!v||!v.rTire||!v.finalDrive)return {active:false,tOut:0,tIn:0,dT:0,Mz:0};
  const rm=m.parts[0].m,V=motorRatedV(engine),fd=v.finalDrive*(v.ratios?v.ratios[0]:1),eff=v.driveEff||0.95;
  const rpm=clamp(Math.abs(vx)/v.rTire*fd*30/Math.PI,1,rm.nMax);
  const tLim=motorMaxTorque(rm,rpm,V,60);
  const trk=v.trackR||v.track||1.6,mass=v.mass||1800,fWt=v.fWt||0.48,cg=v.cg||0.48,mu=v.mu||1.0;
  const FzR=mass*G*(1-fWt),dFz=clamp(mass*Math.abs(ay)*cg/trk*(1-fWt),0,FzR*0.48);
  const FzOut=FzR/2+dFz,FzIn=Math.max(0,FzR/2-dFz);
  const FxMaxOut=mu*FzOut,FxMaxIn=mu*FzIn;
  const tBase=clamp(Treq/2,-tLim,tLim),sg=ay>=0?1:-1;
  // Request outer-wheel boost and inner-wheel reduction proportional to lateral acceleration (up to motor & tyre limits)
  const wantDT=Math.min(tLim,Math.abs(ay)/(mu*G)*tLim*0.5);
  const tOut=clamp(tBase+wantDT,-tLim,Math.min(tLim,FxMaxOut*v.rTire/(fd*eff)));
  const tIn=clamp(tBase-wantDT,-Math.min(tLim,FxMaxIn*v.rTire/(fd*eff)),Math.min(tLim,FxMaxIn*v.rTire/(fd*eff)));
  const Fout=tOut*fd*eff/v.rTire,Fin=tIn*fd*eff/v.rTire;
  return {active:true,tOut,tIn,dT:(tOut-tIn)/2,Mz:sg*(trk/2)*(Fout-Fin)};
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
// (or to Pcap, if lower). tC: the cells' temperature (°C) for the pack's power (packR); omitted, 25 °C, the rated curve.
function driveTorqueRated(e,rpm,V,temp,Pcap,tC){
  const m=e.motor,w=rpm*Math.PI/30,Pb=Math.min(packMaxPower(e.pack,0.5,tC),Pcap==null?Infinity:Pcap);
  let T=motorMaxTorque(m,rpm,V,temp.r);
  const need=t=>t*w+motorLosses(m,t,rpm,V,temp).total;
  if(T>0&&need(T)>Pb){let lo=0,hi=T;for(let k=0;k<30;k++){const mid=(lo+hi)/2;if(need(mid)>Pb)hi=mid;else lo=mid;}T=lo;}
  return T;
}
// The drive's torque with the pack at tB °C over its rated (25 °C) torque, at a motor speed (build 373). The lap's
// curve is the rated one; the lap walks the pack's temperature (evLapHeat) and scales the torque by this, so where
// the pack's power is the limit, warmer cells give a little more and cold cells derate via Arrhenius impedance rise
// (packR). Taken on the curve's speeds every 5 °C from -15 to +60 °C, straight between; cached per build and power cap.
const EV_GAIN_T0=-15,EV_GAIN_DT=5,EV_GAIN_NT=16;
function evPackGain(e,rpm,tB){
  const cap=evPowerCap;let g=e._gain;
  if(!g||g.score!==e.score||g.cap!==cap){
    const base=evCurve(e),V=motorRatedV(e),tc=e.motor.cool.tCool,cool={w:tc,c:tc,r:60},Pcap=cap<1?cap*evRefPower(e):Infinity;
    const rows=[];
    for(let k=0;k<EV_GAIN_NT;k++)rows.push(base.map(q=>q.tq>0?driveTorqueRated(e,Math.max(q.rpm,1),V,cool,Pcap,EV_GAIN_T0+k*EV_GAIN_DT)/q.tq:1));
    g=e._gain={score:e.score,cap,rpms:base.map(q=>q.rpm),rows};
  }
  const x=clamp((tB-EV_GAIN_T0)/EV_GAIN_DT,0,EV_GAIN_NT-1),k=Math.min(EV_GAIN_NT-2,Math.floor(x)),fk=x-k;
  const R=g.rpms,n=R.length,r=clamp(rpm,0,R[n-1]);let j=0;while(j<n-2&&r>R[j+1])j++;
  const fj=R[j+1]>R[j]?(r-R[j])/(R[j+1]-R[j]):0,at=row=>row[j]+(row[j+1]-row[j])*fj;
  return at(g.rows[k])*(1-fk)+at(g.rows[k+1])*fk;
}
// The torque grid the runs read (gridTorque): one row, no boost axis.
function evGrid(e){const c=evCurve(e);return {rpms:c.map(p=>p.rpm),boosts:[0],tq:[c.map(p=>p.tq)],laggy:false};}
// Regeneration as overrun torque (Nm, positive), on the engine's 500-rpm-up table: the motor's torque at that speed,
// capped by the power the pack takes back, then by the maker's calibration (evRegenRule: a deceleration on car v, and a
// regen kW limit). Below ~500 rpm a real car fades it out to stop smoothly; the table's floor does the same.
function evRegenTable(e,rl,v=typeof vehicle!=='undefined'?vehicle:null,soc=0.5,tC=PACK_T_REF){
  const out=[],V=motorRatedV(e),R=evRegenRule(e),Pc=Math.min(packChargePower(e.pack,soc,tC),R.kW?R.kW*1000:Infinity),k=(EV_REGEN[e.evRegen]||EV_REGEN.high).k;
  // the torque that slows car v (test mass and inertias) by g: the eco run's F = T·fd/(r·eff), turned round
  const Tg=v&&v.rTire&&v.finalDrive?R.g*G*(v.mass+(v.wheelI||0)/(v.rTire*v.rTire)+e.motor.J*(v.finalDrive/v.rTire)**2)*v.rTire*(v.driveEff||1)/v.finalDrive:Infinity;
  for(let r=500;r<=rl+250;r+=250){
    const w=Math.min(r,rl)*Math.PI/30,T=motorMaxTorque(e.motor,Math.min(r,rl),V,60);
    out.push(k*Math.max(0,Math.min(T,Pc/Math.max(1,w),Tg)));
  }
  return out;
}
// The heat over a lap. prof: per point the time step (s), the motor speed (rpm) and torque (Nm, negative regenerating).
// Walks the lap twice from coolant/start temperature (a preparation lap, then the timed one) and gives, per point of the timed
// lap, the share of the drive the controller and the pack allow, and the temperatures it ran at.
function evLapHeat(e,prof,soc0=0.8){
  const m=e.motor,b=e.pack,V=motorRatedV(e),n=prof.dt.length,tc=m.cool.tCool,b0=packStartT(b);
  const t={w:tc,c:tc,r:tc,inv:tc},tb={b:b0};
  const share=new Float64Array(n),tW=new Float64Array(n),tR=new Float64Array(n),tB=new Float64Array(n);
  let regenJ=0,driveJ=0,soc=clamp(soc0,0.05,1),invMax=tc;
  for(let lap=0;lap<2;lap++)for(let i=0;i<n;i++){
    // A timed lap starts on a pack at its start/pre-conditioned temperature: ~400 kg of cells take a whole flat-out lap
    // to heat, so the preparation lap that brings the motor and rotors to working temp would hand the timed lap a hot pack.
    if(lap===1&&i===0){tb.b=b0;soc=clamp(soc0,0.05,1);}
    // the controller and the battery management act as the heat builds, not after it: the torque asked for is cut by the
    // share the temperatures allow at that moment, which is what holds a hot pack near its limit instead of past it
    // and, since build 373, the pack's power at its temperature over the rated curve's 25 °C (evPackGain)
    const rpm=prof.rpm[i],now=motorDerate(e,t)*packDerate(tb.b)*evPackGain(e,rpm,tb.b),T=prof.tq[i]*now,dt=prof.dt[i],w=rpm*Math.PI/30;
    const L=motorLosses(m,Math.abs(T),rpm,V,t);
    let P=T*w+L.total;                           // battery power: drawing (+), or taking back (-) less the losses
    if(P<0){const Pc=packChargePower(b,soc,tb.b)*packDerate(tb.b);if(-P>Pc)P=-Pc;}
    const d=packDrawClamped(b,soc,P,tb.b);       // at live SOC and pack temperature
    soc=clamp(soc-d.I*dt/(b.Ah*3600),0,1);
    motorHeatStep(m,t,L,dt);packHeatStep(b,tb,d.heat,dt);
    if(lap===1){share[i]=motorDerate(e,t)*packDerate(tb.b)*evPackGain(e,rpm,tb.b);tW[i]=t.w;tR[i]=t.r;tB[i]=tb.b;
      if(t.inv>invMax)invMax=t.inv;
      if(P>0)driveJ+=P*dt;else regenJ-=P*dt;}
  }
  return {share,tW,tR,tB,invMax,socEnd:soc,driveKWh:driveJ/3.6e6,regenKWh:regenJ/3.6e6};
}
// The VEHICLE tab for an electric car: no gearbox type, speeds or spacing to choose, and GEARING sets the reduction.
// Called on every build, so an engine gets its own fields back.
function syncEvVehicleForm(ev){
  evDriveLock(ev&&!!(engine.motor&&engine.motor.parts&&engine.motor.parts.length>1)||isHybrid()&&(!!engine.hy.front||engine.hy.mode==='p4'));   // a hybrid's front/P4 axle motor too
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
  const gStr=v.ratios&&v.ratios.length>1?tr('2-Speed')+' <b>'+v.ratios.map(r=>r.toFixed(2)).join(' / ')+'</b> × ':'';
  const fStr=v.frontFd>0&&Math.abs(v.frontFd-v.finalDrive)>0.01?' • '+tr('front')+' <b>'+v.frontFd.toFixed(2)+':1</b>':'';
  const tvStr=v.dualRearTV?' • '+tr('active rear TV'):'';
  return '<br>'+gStr+tr('Reduction')+' <b>'+v.finalDrive.toFixed(2)+':1</b> ('+tr('matched')+' '+v.reductionMatched.toFixed(2)+':1)'+fStr+tvStr+' • '+
    tr('regeneration up to')+' <b>'+Math.round(Math.min(engine.pack.pChargeMax/1000,evRegenRule(engine).kW||Infinity)*(EV_REGEN[engine.evRegen]||EV_REGEN.high).k)+' kW</b> • '+tr('motor and pack')+' '+powertrain().mass()+' kg';
}
// The TRACK panel's cells for an electric car: the motor's hottest and how much of the lap it was cut back, the pack's
// hottest, and the energy the lap drew and took back.
function evLapCells(ev,cell){
  const hot=(t,lim)=>'<span style="color:'+(t>=lim?'#ff5555':t>=lim-15?'#ffcc00':'#00ff88')+'">'+Math.round(t)+'°C</span>';
  return cell(tr('MOTOR'),hot(ev.wMax,150),ev.derated>0.005?tr('cut back')+' '+Math.round(ev.derated*100)+'% '+tr('of the lap'):tr('winding peak'))+
    cell(tr('BATTERY'),hot(ev.bMax,50),tr('pack peak'))+
    cell(tr('ENERGY'),ev.driveKWh.toFixed(2),'kWh · '+tr('regen')+' '+ev.regenKWh.toFixed(2));
}
