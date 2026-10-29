// ====== FUEL CYCLE: an engine's consumption over the WLTP cycle (build 187, step 3.2a of plans/hybrid-electric/) ======
// The WLTC class 3b trace (src/js/electric-cycle.js) driven second by second with an engine, as the electric car's is
// with a motor: the force the trace asks for (inertia, drag, rolling), the gear that burns least for it, and the fuel
// that engine burns there, read off its own steady-state map (steadyBSFC: the same air, mixture and friction the dyno
// runs). What is derived: the map, every gear's speed and load, and so the fuel. What is a rule, and named:
//   the test mass   the car plus 100 kg, as for the electric cars;
//   the 12 V load   300 W on the crank (the alternator; an engine car has no traction pack to take it from);
//   the gearbox     each second in the gear that burns least, among those that keep the engine at least 15% over
//                   its idle (and 1100 rpm, 950 a diesel) and give the torque with 10% in hand: an automatic's or a
//                   good driver's economy shifting. WLTP prescribes a manual's shift points by a formula on its
//                   power and ratios; this is close to what that formula gives, never above it;
//   idle and cut    standing, the engine idles (no start-stop; a hybrid's stops are 3.2b's); slowing on the
//                   overrun above 1300 rpm, the injectors are cut;
//   the cold start  WLTP starts from an engine soaked at 23 C. Cold oil is thick, and the model's friction knows it
//                   (tempFactors: 1.46x at 23 C, 1x from 80 C), so the warm-up is derived, not added: the engine and
//                   its fluids (~460 J/kgK of iron and aluminium, 6 L of coolant, 5 L of oil) take 30% of the fuel's
//                   energy until the thermostat opens, the oil 10 C behind the coolant, and each second reads the
//                   fuel map at the temperature it has reached.
const FUEL_CYCLE={massAdd:100,auxW:300,idleMargin:1.15,minRpm:1100,minRpmCI:950,reserve:0.9,cutRpm:1300,
  soak:23,toCoolant:0.30,oilLag:10,temps:[23,45,70,95]};
// The engine's fuel map: torque (Nm) and fuel (g/s) over rpm × manifold pressure, at design conditions (20 C, the
// mixture the ECU runs). Cached per build.
function engineFuelMap(oilT){
  const e=engine,tk=oilT==null?95:oilT;
  e._fmaps=e._fmaps&&e._fmaps.score===e.score?e._fmaps:{score:e.score};
  if(e._fmaps[tk])return e._fmaps[tk];
  const sv={iat:state.iat,coolant:state.coolant,oil:state.oil,engineHealth:state.engineHealth,afr:state.afr};
  state.iat=20;state.coolant=Math.min(90,tk+10);state.oil=tk;state.engineHealth=1;
  const r0=Math.max(e.idleRpmEff,600),r1=e.redline,NR=18,maps=[];
  const mLo=e.ci?0.95:0.22,mHi=e.mapMax||1;for(let j=0;j<12;j++)maps.push(mLo+(mHi-mLo)*j/11);
  const rpms=[],tq=[],fg=[];
  for(let i=0;i<NR;i++){
    const rpm=r0+(r1-r0)*i/(NR-1);rpms.push(rpm);const tr=[],fr=[];
    for(const map of maps){
      const s=steadyBSFC(rpm,map),T=s.r.torque,P=s.r.powerKW*1000;
      tr.push(T);fr.push(isFinite(s.bsfc)&&P>0?s.bsfc*P/3.6e6:NaN);
    }
    tq.push(tr);fg.push(fr);
  }
  Object.assign(state,sv);
  e._fmaps[tk]={rpms,tq,fg,idleGs:0.12*e.displacement_L};
  return e._fmaps[tk];
}
// Fuel (g/s) at an engine speed and a torque, on one row of the map: straight between the map's points; below its
// lightest load, along the Willans line through its two lightest points (fuel falls straight with torque).
function fuelRowAt(tr,fr,T){
  const pts=tr.map((t,j)=>({t,f:fr[j]})).filter(p=>isFinite(p.f)).sort((a,b)=>a.t-b.t);
  if(!pts.length)return NaN;
  if(T<=pts[0].t){const a=pts[0],b=pts[1]||a,k=(b.f-a.f)/Math.max(1e-6,b.t-a.t);return Math.max(0,a.f+(T-a.t)*k);}
  for(let j=1;j<pts.length;j++)if(T<=pts[j].t){const a=pts[j-1],b=pts[j];return a.f+(b.f-a.f)*(T-a.t)/Math.max(1e-6,b.t-a.t);}
  return NaN;   // more than the engine has at this speed
}
function engineFuelAtMap(M,rpm,T){
  const R=M.rpms;
  const x=clamp((rpm-R[0])/(R[R.length-1]-R[0]),0,1)*(R.length-1),i=Math.min(R.length-2,Math.floor(x)),f=x-i;
  const a=fuelRowAt(M.tq[i],M.fg[i],T),b=fuelRowAt(M.tq[i+1],M.fg[i+1],T);
  return a*(1-f)+b*f;
}
// ... at an oil temperature: between the maps taken at FUEL_CYCLE.temps.
function engineFuelAt(rpm,T,oilT){
  const ts=FUEL_CYCLE.temps,t=clamp(oilT==null?ts[ts.length-1]:oilT,ts[0],ts[ts.length-1]);
  let k=0;while(k<ts.length-2&&t>ts[k+1])k++;
  const f=(t-ts[k])/(ts[k+1]-ts[k]),a=engineFuelAtMap(engineFuelMap(ts[k]),rpm,T),b=engineFuelAtMap(engineFuelMap(ts[k+1]),rpm,T);
  return a*(1-f)+b*f;
}
// The car over the cycle. Returns litres per 100 km, CO2 (g/km), the fuel's mass and the gear and speed it chose.
function engineCycle(v){
  const e=engine,C=FUEL_CYCLE,key=[v.mass,v.finalDrive,v.cdA,v.crr,v.rTire,v.driveEff,v.ratios.join(','),C.soak].join('|');
  if(e._fcyc&&e._fcyc.score===e.score&&e._fcyc.key===key)return e._fcyc.res;
  const m=v.mass+C.massAdd,r=v.rTire,fd=v.finalDrive,eff=v.driveEff,M=engineFuelMap();
  const fp0=FUELS[e.fuel]||FUELS.gasoline,heatC=engineMass()*460+6*3600+5*1900,stat=e.thermostat||88;
  let Tc=C.soak;   // the coolant; the oil follows it oilLag behind
  const curve=buildTorqueCurve(),Tmax=rpm=>{if(rpm<=curve[0].rpm)return curve[0].tq;for(let i=1;i<curve.length;i++)if(rpm<=curve[i].rpm)return curve[i-1].tq+(curve[i].tq-curve[i-1].tq)*(rpm-curve[i-1].rpm)/(curve[i].rpm-curve[i-1].rpm);return 0;};
  const rpmMin=Math.max(e.idleRpmEff*C.idleMargin,e.ci?C.minRpmCI:C.minRpm);
  let fuel=0,x=0,gearSum=0,moving=0,warmAt=null;
  for(let i=0;i<WLTC_3B.length-1;i++){
    const v0=WLTC_3B[i]/36,v1=WLTC_3B[i+1]/36,vm=(v0+v1)/2,a=v1-v0;x+=vm;
    const oilT=Math.max(C.soak,Tc-C.oilLag);if(warmAt==null&&Tc>=stat)warmAt=i;
    const warm=gs=>{fuel+=gs;if(Tc<stat)Tc=Math.min(stat,Tc+gs/1000*(fp0.LHV||44)*1e6*C.toCoolant/heatC);};
    if(vm<0.1&&a<=0){warm(M.idleGs*(1+0.5*Math.max(0,(80-oilT)/57)));continue;}   // standing: idle (a cold engine idles richer and faster)
    let best=null;
    for(let g=0;g<v.ratios.length;g++){
      const tot=v.ratios[g]*fd,rpm=vm/r*tot*60/(2*Math.PI);
      if(rpm>e.redline)continue;
      const meff=m+(v.wheelI||0)/(r*r)+(e.inertia||0.15)*(tot/r)**2;
      const F=meff*a+0.5*AIR_RHO*v.cdA*vm*vm+crrAt(v.crr,vm)*m*G;
      const rpmE=Math.max(rpm,rpmMin),w=rpmE*Math.PI/30;   // below it, first gear's clutch slips at rpmMin
      if(rpm<rpmMin&&g>0)continue;
      let gs;
      if(F<=0)gs=rpmE>C.cutRpm?0:M.idleGs;   // the overrun: injectors cut, or idling down to the stop
      else{
        const T=F*vm/eff/w+C.auxW/w;
        if(T>C.reserve*Tmax(rpmE))continue;
        gs=engineFuelAt(rpmE,T,oilT);if(!isFinite(gs))continue;
      }
      if(!best||gs<best.gs)best={gs,g};
    }
    if(!best){best={gs:engineFuelAt(rpmMin,Tmax(rpmMin)*C.reserve,oilT)||M.idleGs*3,g:0};}   // asked more than any gear has: flat out in first
    warm(best.gs);gearSum+=best.g+1;moving++;
  }
  const km=x/1000,kg=fuel/1000,fp=FUELS[e.fuel]||FUELS.gasoline,L=kg/fp.density;
  // CO2: the carbon in the fuel, burnt to CO2 (petrol ~86.5% carbon by mass, diesel ~86.2%)
  const res={km,l100:L/km*100,co2:kg*0.865*44/12*1000/km,kg,meanGear:gearSum/Math.max(1,moving),warmS:warmAt};
  e._fcyc={score:e.score,key,res};return res;
}
function engineCycleLine(v){
  const c=engineCycle(v);
  return '<br>'+tr('WLTP cycle')+' <b>'+c.l100.toFixed(1)+' L/100 km</b> • CO₂ '+Math.round(c.co2)+' g/km';
}
