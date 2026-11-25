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
  const e=engine,C=FUEL_CYCLE,key=[v.mass,v.finalDrive,v.cdA,v.clA||0,v.crr,v.rTire,v.driveEff,v.ratios.join(','),C.soak,ENV.alt_m,ENV.tempC,ENV.headwind_ms].join('|');
  if(e._fcyc&&e._fcyc.score===e.score&&e._fcyc.key===key)return e._fcyc.res;
  const m=v.mass+C.massAdd,r=v.rTire,fd=v.finalDrive,eff=v.driveEff,M=engineFuelMap(),rho=envAirRho(),vW=envWind();
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
    const va=Math.max(0,vm+vW),dn=0.5*rho*(v.clA||0)*va*va;
    for(let g=0;g<v.ratios.length;g++){
      const tot=v.ratios[g]*fd,rpm=vm/r*tot*60/(2*Math.PI);
      if(rpm>e.redline)continue;
      const meff=m+(v.wheelI||0)/(r*r)+(e.inertia||0.15)*(tot/r)**2;
      const F=meff*a+0.5*rho*v.cdA*va*va+crrAt(v.crr,vm)*(m*G+dn);
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
// ---- a hybrid over the cycle (build 188, step 3.2b) ----
// A charge-sustaining hybrid's energy manager, second by second: the equivalent-consumption minimisation every
// production hybrid controller is a version of (ECMS: Paganelli et al., 2002). Each second it takes, among
//   electric only (the engine off and its clutch open, the motor driving through the gearbox),
//   the engine on in a gear, the motor adding to it or charging from it (load-point shifting), and
//   braking, the motor regenerating within its own and the pack's limits,
// the one that costs least in fuel plus the pack's energy priced at an equivalence factor s (grams of fuel a joule of
// pack energy is worth). There is one s that leaves the pack where it started after the cycle, and that is the
// charge-sustaining controller: it is found by bisection, so the controller's only parameter comes from the cycle,
// not from a fit. Rules, named: the engine runs until its coolant reaches 50 C (the catalyst lights and the cabin
// heats on a real one), and stops at a standstill after; the pack is kept between 35% and 85%; its 12 V load (the
// alternator's 300 W) comes from the pack. Build 189: a hybrid's engine runs so little that its warm-up is what its
// makers design for, and both validation cars carry an exhaust heat exchanger into the coolant until it is warm
// (Toyota's EHR, on the Prius since 2009; Hyundai's EHRS on the Ioniq). About a third of the fuel's energy leaves in
// the exhaust at light load, and such an exchanger takes about half of it: 15% of the fuel's energy more to the coolant.
// A power-split's engine can also charge the pack standing still (the brakes hold the ring and MG1 takes it all).
// splitsDirect (build 210): an eCVT or a series hybrid samples its engine's power at nine points, not five. Its range
// runs from what the pack can cover to what it can take back, so a larger pack spaced five points so far apart that
// the Prius's cycle scattered ~2% either way (build 207: 4.24 and 4.34 L/100 km at five, 4.31 and 4.32 at 17 or 33).
const HYB_CYCLE={warmC:50,socLo:0.35,socHi:0.85,splits:[0,0.25,0.5,0.75,1],splitsDirect:[0,0.125,0.25,0.375,0.5,0.625,0.75,0.875,1],ehr:0.15};
// prof (build 383, the economy road): {segs:[{vm,a,dt,sinT,cosT}]} replaces the WLTC's 1 s steps with the road's own
// (grade included), started warm; nothing cached, no plug-in cycles. Without it the cycle is exactly as before.
function hybridCycle(v,prof){
  const e=engine,hy=e.hy,C=FUEL_CYCLE,H=HYB_CYCLE;
  const key=[v.mass,v.finalDrive,v.cdA,v.clA||0,v.crr,v.rTire,v.driveEff,v.ratios.join(','),C.soak,e.hyDeploy,hy.mode,JSON.stringify(e.hyTune||null),!!e.hyPlug,ENV.alt_m,ENV.tempC,ENV.headwind_ms].join('|');
  if(!prof&&e._hcyc&&e._hcyc.score===e.score&&e._hcyc.key===key)return e._hcyc.res;
  const m=v.mass+C.massAdd,r=v.rTire,fd=v.finalDrive,eff=v.driveEff,M=engineFuelMap(),pack=hy.pack,mot=hy.motor,rho=envAirRho(),vW=envWind();
  const curve=buildTorqueCurve(),Tmax=rpm=>{if(rpm<=curve[0].rpm)return curve[0].tq;for(let i=1;i<curve.length;i++)if(rpm<=curve[i].rpm)return curve[i-1].tq+(curve[i].tq-curve[i-1].tq)*(rpm-curve[i-1].rpm)/(curve[i].rpm-curve[i-1].rpm);return 0;};
  const rpmMin=Math.max(e.idleRpmEff*C.idleMargin,e.ci?C.minRpmCI:C.minRpm);
  const fp0=FUELS[e.fuel]||FUELS.gasoline,heatC=engineMass()*460+6*3600+5*1900,stat=e.thermostat||88;
  const capJ=pack.kWh*3.6e6,tc=mot.cool.tCool,temp={w:tc+20,c:tc+15,r:60};
  // the motor at a shaft speed: what it can give, what it can take back (its own torque, and the pack's acceptance)
  const memo=f=>{const c=new Map();return rpm=>{const k=Math.round(rpm/10);let y=c.get(k);if(y===undefined){y=f(k*10);c.set(k,y);}return y;};};
  const ps=hy.mode==='ps',direct=ps||hy.mode==='series',busV=soc=>ps?PS.busV:packOcv(pack,soc);   // a power-split's machines run on its 600 V bus (build 189); a series hybrid is driven as one (193)
  const motUp=memo(rpm=>hybMotorTq(hy,rpm)),motDn=memo(rpm=>Math.min(motorMaxTorque(mot,Math.max(rpm,1),busV(HYB_SOC),60),pack.pChargeMax/Math.max(1,rpm*Math.PI/30)));
  // the pack's chemical energy for a motor torque at a speed for one second (+ drawn), with the 12 V load; Pin: what
  // else is on the bus (a power-split's MG1, generating)
  // On the road (prof) the losses and the engine's fuel are memoised on a 10 rpm × 1 Nm grid (0.5 Nm for the engine, the
  // pack's charge to 1%), as ecoEnergyJ does: the bisection runs the same road ~20 times. The WLTC path is unchanged.
  // Build 406: the two tables are kept on the engine while the car is the same (score, key, motor and pack), so the
  // economy run's ~6 solves share them; a loss is kept by charge (bar a charge under 0.5% off a power-split's bus, which reads
  // the exact charge), then speed and torque, and the fuel by the oil's temperature.
  if(prof&&!(e._hmemo&&e._hmemo.score===e.score&&e._hmemo.key===key&&e._hmemo.mot===mot&&e._hmemo.pack===pack))
    e._hmemo={score:e.score,key,mot,pack,mL:new Map(),mF:new Map()};
  const mL=prof?e._hmemo.mL:null,mF=prof?e._hmemo.mF:null,mL0=new Map();
  const lossAt=prof?(T,rpm,soc)=>{const kt=Math.round(Math.abs(T)),kr=Math.round(Math.max(rpm,1)/10),ks=ps?0:Math.round(soc*100),k=kr*1e5+kt;
      const m=!ps&&ks===0?mL0:mL.get(ks)||(mL.set(ks,new Map()),mL.get(ks));   // small-integer keys: fast
      let L=m.get(k);if(L===undefined){L=motorLosses(mot,kt,Math.max(kr*10,1),busV(ks/100||soc),temp).total;m.set(k,L);}return L;}
    :(T,rpm,soc)=>motorLosses(mot,Math.abs(T),Math.max(rpm,1),busV(soc),temp).total;
  const fuelAt=prof?(rpm,T,oilT)=>{const kr=Math.round(rpm/10),kt=Math.max(1,Math.round(T*2)),k=kr*1e6+kt;
      const m=mF.get(oilT)||(mF.set(oilT,new Map()),mF.get(oilT));
      let g=m.get(k);if(g===undefined){g=engineFuelAt(kr*10,kt/2,oilT);m.set(k,g);}return g;}:engineFuelAt;
  const packJ=(T,rpm,soc,Pin=0)=>{const w=rpm*Math.PI/30,P=T*w+(T||rpm>0?lossAt(T,rpm,soc):0)+C.auxW-Pin;
    const d=packDraw(pack,soc,P);return P+(d?d.heat:0);};
  // packJ for a kept step (build 406): its power before the pack's own losses held while the charge's 1% (the losses'
  // key on the road) is the same, and its fuel while the oil's temperature is
  const tagOf=soc=>prof?(ps?0:Math.round(soc*100)):soc;
  // ... and packDraw's heat written out (its 25 C resistance, the step's open-circuit voltage V0)
  const pRes=packR(pack),heatAt=(P,V0)=>{const disc=V0*V0-4*pRes*P;if(disc<0)return 0;
    const I=(V0-Math.sqrt(disc))/(2*pRes),V=V0-I*pRes;if(P>0&&(V<pack.vMin||I>pack.iMax))return 0;return I*I*pRes;};
  const packJc=(q,T,rpm,soc,V0,Pin=0)=>{const t=tagOf(soc);let P;
    if(q.pt===t)P=q.pP;else{P=T*(rpm*Math.PI/30)+(T||rpm>0?lossAt(T,rpm,soc):0)+C.auxW-Pin;q.pt=t;q.pP=P;}
    return P+heatAt(P,V0);};
  const fuelAtc=(q,rpm,T,oilT)=>q.ft===oilT?q.fg:(q.ft=oilT,q.fg=fuelAt(rpm,T,oilT));
  const Pbat=packMaxPower(pack,HYB_SOC),Pchg=pack.pChargeMax;
  // the HYBRID TUNE (build 192): the charge window, the regeneration, the motor's help, electric driving, load-point
  // shifting. Its defaults are the rules above, so an untuned build runs exactly as before.
  const tu=hybTune(e),socLo=tu.socLo/100,socHi=tu.socHi/100,soc0=tu.socT/100,kRegen=(HYB_REGEN[tu.regen]||HYB_REGEN.high).k;
  const evOk=(vm,P)=>(tu.evKmh<=0||vm*3.6<=tu.evKmh)&&(tu.evKw<=0||P<=tu.evKw*1000);
  const assist=(rpm,nf,dfrac)=>hybAssistWindow(e,rpm)*hybAssistShare(nf,dfrac,tu);
  // Build 406: what a step offers that the charge and the engine's warmth do not change (its shaft speeds and torques,
  // the machines' limits, MG1's electrical power) is worked out on the first pass and kept for the secant's other ~20,
  // which then price only fuel and pack: the same arithmetic in the same order, so the same results, 5-10x sooner.
  const segC=[];
  // a power-split's (or series) engine candidates, as psOn below prices them
  const psCands=(T,n2,stand)=>{
    const out=[],nr=n2/PS.k2,R=psEngineRange(hy,nr),Pd=Math.max(0,T*n2*Math.PI/30),O=psOol();
    const Plo=Math.max(O.P[0],Pd-Pbat*assist(0,n2/mot.nMax,Pd/(O.Pmax+Pbat))),Phi=Math.min(O.Pmax,Pd+Pchg);
    if(!(R.hi>R.lo)||!(Phi>=Plo))return out;
    for(const k of H.splitsDirect){
      const Pe=Plo+(Phi-Plo)*k,ne=clamp(psOolAt(Pe).ne,Math.max(R.lo,rpmMin),R.hi),Te=Pe/(ne*Math.PI/30);
      if(Te>Tmax(ne)*C.reserve)continue;
      const G=hybGear(hy,ne,n2),ns=G.ns,Ts=Te*G.ks;   // the planetary, or a series hybrid's generator on the crank
      if(Ts>motorMaxTorque(hy.mg1,Math.max(Math.abs(ns),1),hybBusV(hy),60))continue;
      const T2=stand?0:T-Te*G.kr;
      if(Math.abs(T2)>(T2>0?motUp(n2):motorMaxTorque(mot,Math.max(n2,1),hybBusV(hy),60)))continue;
      out.push({ne,Te,T2,Pin:psMg1Elec(hy,Ts,ns,temp)});
    }
    return out;
  };
  // cd (build 194, a plug-in's charge-depleting cycles): start from cd.soc with the engine at cd.Tc, and do not run the
  // engine to warm it (a plug-in drives away on its pack; the engine starts when it is asked for, cold)
  const run0=(s,cd)=>{
    let fuel=0,E=0,x=0,Tc=cd?cd.Tc:C.soak,evS=0,onS=0,stopS=0,warmS=null,firstOn=null,Jout=0,Jin=0,fbS=0;
    const N=prof?prof.segs.length:WLTC_3B.length-1;
    for(let i=0;i<N;i++){
      let vm,a,dt=1,sinT=0,cosT=1;
      if(prof){const q=prof.segs[i];vm=q.vm;a=q.a;dt=q.dt;sinT=q.sinT;cosT=q.cosT;}
      else{const v0=WLTC_3B[i]/36,v1=WLTC_3B[i+1]/36;vm=(v0+v1)/2;a=v1-v0;}
      x+=vm*dt;
      const soc=(cd?cd.soc:soc0)+E/capJ,oilT=Math.max(C.soak,Tc-C.oilLag),cold=!cd&&Tc<H.warmC,V0=packOcv(pack,soc);if(!cold&&warmS==null)warmS=i;
      let best=null,bC=Infinity,bG=0,bJ=0,bOn=false,has=false;
      const consider=(gs,J,on)=>{if(J>0&&soc<socLo)return;if(J<0&&soc>socHi)J=0;const cost=gs+s*J;if(!has||cost<bC){has=true;bC=cost;bG=gs;bJ=J;bOn=on;}};
      // a power-split's engine on its best line at powers from what the pack cannot give to what it can take back: the
      // engine's speed where MG1 lets it be, the ring's share of its torque to the wheels and MG2 carrying the rest
      // (standing, the brakes hold the ring and MG1 takes it all, charging)
      const psOn=(c,n2)=>{
        for(const q of c){
          const gs=fuelAtc(q,q.ne,q.Te,oilT);if(!isFinite(gs))continue;
          const J=packJc(q,q.T2,n2,soc,V0,q.Pin);
          if(!tu.lps&&J<0&&soc>=socLo)continue;   // no load-point shifting: the engine charges only a low pack
          consider(gs,J,true);
        }
      };
      if(vm<0.1&&a<=0){   // standing: the engine stops when it is warm, or idles
        if(!cold)consider(0,packJ(0,0,soc),false);
        consider(M.idleGs,C.auxW,true);
        if(direct)psOn(segC[i]||(segC[i]=psCands(0,0,true)),0);
      }else if(direct){   // the eCVT (build 189), or a series hybrid (193): MG2 alone, or the engine on its best line, MG1 and MG2 carrying the difference
        let q=segC[i];
        if(!q){
          const tot=fd,n2=vm/r*tot*60/(2*Math.PI);
          const meff=m+(v.wheelI||0)/(r*r)+(mot.J||0.01)*(tot/r)**2;
          const va=Math.max(0,vm+vW),dn=0.5*rho*(v.clA||0)*va*va;
          const F=meff*a+0.5*rho*v.cdA*va*va+crrAt(v.crr,vm)*(m*G*cosT+dn)+m*G*sinT;
          const T=F>0?F*r/(tot*eff):F*r*eff/tot;   // at MG2's shaft
          q=segC[i]=T<=0?{T,n2,Tm:Math.max(T,-motDn(n2)*kRegen)}:{T,n2,ev:T<=motUp(n2)&&evOk(vm,T*n2*Math.PI/30),c:psCands(T,n2,false)};
        }
        const n2=q.n2;
        if(q.T<=0)consider(cold?M.idleGs:0,packJc(q,q.Tm,n2,soc,V0),cold);
        else{
          if(!cold&&q.ev)consider(0,packJc(q,q.T,n2,soc,V0),false);
          psOn(q.c,n2);
        }
      }else{
        let gs0=segC[i];
        if(!gs0){gs0=segC[i]=[];
          const va=Math.max(0,vm+vW),dn=0.5*rho*(v.clA||0)*va*va;
          for(let g=0;g<v.ratios.length;g++){
            const tot=v.ratios[g]*fd,rpm=vm/r*tot*60/(2*Math.PI);if(rpm>e.redline)continue;
            const meff=m+(v.wheelI||0)/(r*r)+(e.inertia||0.15)*(tot/r)**2;
            const F=meff*a+0.5*rho*v.cdA*va*va+crrAt(v.crr,vm)*(m*G*cosT+dn)+m*G*sinT;
            const T=F>0?F*r/(tot*eff):F*r*eff/tot;   // at the gearbox input: what the wheels need, or what braking gives back
            if(T<=0){gs0.push({rpm,T,Tm:Math.max(T,-motDn(rpm)*kRegen)});continue;}
            const q={rpm,T,ev:T<=motUp(rpm)&&evOk(vm,T*rpm*Math.PI/30),c:[]};gs0.push(q);
            if(rpm<rpmMin)continue;
            const Te0=Math.min(Tmax(rpm)*C.reserve,T+motDn(rpm)),help=motUp(rpm)*assist(rpm,rpm/e.redline,T/(Tmax(rpm)+motUp(rpm)));
            for(const k of H.splits){   // the engine from the least it can give with the motor's help to its most, charging
              const Te=Math.max(0,T-help)+(Te0-Math.max(0,T-help))*k,Tm=T-Te;
              if(Te<=0||Te>Tmax(rpm)*C.reserve)continue;
              q.c.push({Te,Tm});
            }
          }
        }
        for(const q of gs0){
          const rpm=q.rpm;
          if(q.T<=0){   // slowing: regenerate what the motor and pack can; the engine cut (or idling, cold)
            consider(cold?(rpm>C.cutRpm?0:M.idleGs):0,packJc(q,q.Tm,rpm,soc,V0),cold);continue;
          }
          if(!cold&&q.ev)consider(0,packJc(q,q.T,rpm,soc,V0),false);   // electric only
          for(const c of q.c){
            if(!tu.lps&&c.Tm<0&&soc>=socLo)continue;   // no load-point shifting: the engine charges only a low pack
            const gs=fuelAtc(c,rpm,c.Te,oilT);if(!isFinite(gs))continue;
            consider(gs,packJc(c,c.Tm,rpm,soc,V0),true);
          }
        }
      }
      if(has)best={gs:bG,J:bJ,on:bOn};
      if(!best&&prof){   // on the road: a climb asks more than the controller's machine limits allow (a power-split's MG1
        // and MG2 at speed; a parallel's engine plus motor). The engine gives it on its best line up to 90% of its top,
        // the pack the rest up to its power (above its floor) through a 90% electrical path (as the charge correction
        // below). Energy is charged in full; only those limits are set aside. Time spent so: limitShare (named gap).
        const va=Math.max(0,vm+vW),dn=0.5*rho*(v.clA||0)*va*va;
        const Pw=Math.max(0,(m*a+0.5*rho*v.cdA*va*va+crrAt(v.crr,vm)*(m*G*cosT+dn)+m*G*sinT)*vm/eff),O=psOol();
        const Pe=Math.min(Pw,O.Pmax*C.reserve),Pp=soc>socLo?Math.min(Pbat,Pw-Pe):0;
        best={gs:psOolAt(Pe).gs,J:Pp/0.9+C.auxW,on:true};fbS+=dt;
      }
      if(!best){best={gs:engineFuelAt(rpmMin,Tmax(rpmMin)*C.reserve,oilT)||M.idleGs*3,J:C.auxW,on:true};fbS+=dt;}   // flat out in first
      fuel+=best.gs*dt;E-=best.J*dt;if(best.J>0)Jout+=best.J*dt;else Jin-=best.J*dt;
      if(best.on&&firstOn==null)firstOn=x-vm*dt;
      if(best.on){onS+=dt;if(Tc<stat)Tc=Math.min(stat,Tc+best.gs*dt/1000*(fp0.LHV||44)*1e6*(C.toCoolant+(Tc<H.warmC?H.ehr:0))/heatC);}
      else if(vm<0.1)stopS+=dt;else evS+=dt;
    }
    return {fuel,E,x,evS,onS,stopS,warmS,Tc,firstOn,Jout,Jin,fbS};
  };
  // the equivalence factor that sustains the charge: more s, the pack worth more, the controller charges more. A
  // bracketed secant on the pack's end energy, to within 0.5% of the pack's capacity.
  // On the road (prof) the engine starts warm, at the tune's target charge: run0's cd start (no warm-up rule)
  const cs0=prof?{soc:soc0,Tc:stat}:undefined,run=s=>run0(s,cs0);
  let lo=2e-5,hi=3e-4,Rlo=run(lo),Rhi=run(hi),R=Rlo,sBest=lo;
  // The bracket must hold the root (build 202): an engine efficient enough at high load charges the pack even at the
  // lowest factor (the Ioniq on a 75% target, once its ECU stopped enriching there), and the secant only pressed against
  // the bracket's edge. Widened until the pack's end energy changes sign across it; where it already did, unchanged.
  for(let k=0;k<6&&Rlo.E>0;k++){hi=lo;Rhi=Rlo;lo/=3;Rlo=run(lo);}
  for(let k=0;k<6&&Rhi.E<0;k++){lo=hi;Rlo=Rhi;hi*=3;Rhi=run(hi);}
  R=Rlo;sBest=lo;
  for(let k=0;k<10;k++){
    const sm=clamp(lo-Rlo.E*(hi-lo)/(Rhi.E-Rlo.E||1e-9),lo+(hi-lo)*0.05,hi-(hi-lo)*0.05);
    R=run(sm);sBest=sm;
    if(Math.abs(R.E)<capJ*0.005)break;
    if(R.E<0){lo=sm;Rlo=R;}else{hi=sm;Rhi=R;}
  }
  // ... and where the secant has not got there in ten, bisection does (build 202). The end energy can sit on two plateaus
  // with a steep step between (the controller charging all it may, or none), where a secant crawls; the Ioniq on a 75%
  // target needed the factor to 1e-7. Cycles the secant settled are not touched.
  for(let k=0;k<30&&!(Math.abs(R.E)<capJ*0.005);k++){
    const sm=(lo+hi)/2;R=run(sm);sBest=sm;
    if(R.E<0){lo=sm;Rlo=R;}else{hi=sm;Rhi=R;}
  }
  // A tune that cannot sustain the charge (build 192: load-point shifting off, a narrow window) ends the cycle with the
  // pack short or over. WLTP corrects such a hybrid's fuel by the energy it borrowed (UN R154, the charge-balance
  // correction, which prices it at the engine's efficiency through an alternator's): here at the engine's best BSFC
  // through a 90% electrical path, and added as fuel. Within the 0.5% tolerance nothing is corrected.
  const bestBsfc=Math.min(...psOol().P.map((P,i)=>psOol().gs[i]*3.6e6/P));
  const corr=Math.abs(R.E)>=capJ*0.005?-R.E/3.6e6*bestBsfc/0.9:0;
  const km=R.x/1000,kg=(R.fuel+corr)/1000,L=kg/fp0.density,l100=km>0?L/km*100:0;
  if(prof){const tT=R.evS+R.onS+R.stopS;
    return {km,l100,L,kg,evShare:tT>0?R.evS/tT:0,onShare:tT>0?R.onS/tT:0,dSocKJ:R.E/1000,s:sBest,corrected:corr!==0,
      packOutKWh:R.Jout/3.6e6,packInKWh:R.Jin/3.6e6,limitShare:tT>0?R.fbS/tT:0};}
  const res={km,l100,co2:km>0?kg*0.865*44/12*1000/km:0,kg,evShare:R.evS/(WLTC_3B.length-1),onShare:R.onS/(WLTC_3B.length-1),dSocKJ:R.E/1000,s:sBest,warmS:R.warmS,corrected:corr!==0};
  if(e.hyPlug)res.plug=plugCycles(run0,res,tu,capJ,fp0);   // a plug-in's charge-depleting cycles (build 194)
  e._hcyc={score:e.score,key,res};return res;
}
// ---- a plug-in hybrid over WLTP (build 194, step 3.5a) ----
// The regulation's procedure for an off-vehicle-charging hybrid (UN R154 / EU 2017/1151): from a full pack, the cycle is
// driven again and again, charge-depleting, until the pack reaches the charge it then sustains; the figures quoted are
// the all-electric range, the charge-depleting cycles' fuel and electricity, and their weighting with the charge-
// sustaining test by the utility factor, the share of driving a European fleet does within a distance d:
//   UF(d) = 1 - exp(-sum c_i (d/800 km)^i), c = 26.25, -38.94, -631.05, 5964.83, -25095, 60380.2, -87517, 75513.8,
//   -35749, 7154.94 (the EU curve, used until 2024).
// What is a rule, and named: the pack starts at the charge window's HIGH and depletes to its LOW (the tune's); while it
// depletes the energy manager prices the pack's energy at 2% of a charge-sustaining hybrid's (electricity is what a
// plug-in is charged with), so the engine starts only when the motor and pack cannot do the job; electricity at the
// socket is the pack's over a 90% charger.
const PLUG={uf:[26.25,-38.94,-631.05,5964.83,-25095,60380.2,-87517,75513.8,-35749,7154.94],ufD:800,sShare:0.02,charger:0.9,maxCycles:15};
const plugUF=km=>{let a=0;for(let i=0;i<10;i++)a+=PLUG.uf[i]*Math.pow(km/PLUG.ufD,i+1);return 1-Math.exp(-a);};
function plugCycles(run,cs,tu,capJ,fp){
  const lo=tu.socLo/100;let soc=tu.socHi/100,Tc=FUEL_CYCLE.soak,km=0,aer=null;const cyc=[];
  for(let j=0;j<PLUG.maxCycles;j++){
    const R=run(cs.s*PLUG.sShare,{soc,Tc});
    const d=R.x/1000;if(aer==null&&R.firstOn!=null)aer=km+R.firstOn/1000;
    cyc.push({km:d,kg:R.fuel/1000,kWh:-R.E/3.6e6,soc0:soc,soc1:soc+R.E/capJ});
    km+=d;soc+=R.E/capJ;Tc=R.Tc;
    // the transition cycle: the pack has reached the charge it sustains (within 2% of its floor), or a cycle moved it by
    // under 1% of its capacity (the regulation's own end is a change of under 4% of the cycle's energy)
    if(soc<=lo+0.02||Math.abs(R.E)<capJ*0.01)break;
  }
  if(aer==null)aer=km;
  // weighted: each depleting cycle by the utility factor's step over it, the sustaining test by what is left
  let uf0=0,d=0,L=0,kWh=0;
  for(const c of cyc){d+=c.km;const uf=plugUF(d),w=uf-uf0;uf0=uf;L+=w*c.kg/fp.density/c.km*100;kWh+=w*c.kWh/PLUG.charger/c.km*100;}
  L+=(1-uf0)*cs.l100;
  return {cycles:cyc.length,cdKm:km,aer,l100:L,kWh100:kWh,co2:L*fp.density*0.865*44/12*10,uf:uf0};
}
// The VEHICLE tab's line for a hybrid. The energy manager takes ~1 s, so the panel draws first and the line fills in
// after (once per car: it is cached until the car or its engine changes).
let hybCycleTimer=0;
function hybridCycleLine(v){
  const txt=c=>c.plug?   // a plug-in's figures (build 194): weighted by the utility factor, its electric range, its electricity
    tr('WLTP weighted')+' <b>'+c.plug.l100.toFixed(1)+' L/100 km</b> • CO₂ '+Math.round(c.plug.co2)+' g/km • '+tr('electric range')+' <b>'+Math.round(c.plug.aer)+' km</b> • '+
      c.plug.kWh100.toFixed(1)+' kWh/100 km • '+tr('sustaining')+' '+c.l100.toFixed(1)+' L/100 km':
    tr('WLTP cycle')+' <b>'+c.l100.toFixed(1)+' L/100 km</b>'+(c.corrected?' ('+tr('charge-corrected')+')':'')+' • CO₂ '+Math.round(c.co2)+' g/km • '+tr('engine off')+' '+Math.round((1-c.onShare)*100)+'%';
  const e=engine;
  if(e._hcyc&&e._hcyc.score===e.score)return '<br><span id="hybCycle">'+txt(hybridCycle(v))+'</span>';
  clearTimeout(hybCycleTimer);
  hybCycleTimer=setTimeout(()=>{if(!isHybrid())return;const el=document.getElementById('hybCycle');const c=hybridCycle(vehicle);if(el)el.innerHTML=txt(c);},50);
  return '<br><span id="hybCycle">'+tr('WLTP cycle')+' …</span>';
}
