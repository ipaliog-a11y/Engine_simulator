// ---- Turbo spool: how much of the target boost is available at a given RPM ----
// A turbo needs exhaust energy to spool, so boost builds with RPM along a logistic
// curve. Smaller turbos spool early (strong midrange) but choke the top end; larger
// turbos are laggy down low but flow more up top.
function spoolFrac(rpm){
  return 1/(1+Math.exp(-(rpm-engine.spool50)/engine.spoolWidth));
}
// Steady compressor pressure ratio above atmosphere at an RPM (turbo spools with RPM;
// a supercharger is crank-driven so it makes boost almost from idle).
function boostAvail(rpm){
  if(engine.intake==='turbo'){
    // Steady boost is now SOLVED from the shaft power balance, not read off a logistic curve in
    // rpm. spool50 and spoolWidth are gone: where a turbo comes on song is where its turbine can
    // finally supply what its compressor is drawing, which depends on the wheel, the housing A/R,
    // the exhaust energy available and the engine's own swallowing capacity.
    const tb=engine.boostTable;
    if(!tb||!tb.length)return engine.boost_bar*spoolFrac(rpm);
    if(rpm<=tb[0].rpm)return tb[0].bar;
    for(let i=1;i<tb.length;i++)if(rpm<=tb[i].rpm){
      const a=tb[i-1],b=tb[i];return a.bar+(b.bar-a.bar)*(rpm-a.rpm)/(b.rpm-a.rpm);
    }
    return tb[tb.length-1].bar;
  }
  if(engine.intake==='supercharger'){
    const sc=SC_TYPE[engine.scType]||SC_TYPE.roots;
    return Math.min(engine.boost_bar*boostTaperFrac(rpm)*clamp(sc.lo+(sc.hi-sc.lo)*Math.pow(rpm/engine.redline,sc.exp),0,1),tqLimitBoost(rpm));   // the bypass valve holds the taper and the torque limit
  }
  return 0;
}
// Extra IMEP (bar) from an active nitrous shot (WOT only, while the bottle has charge).
function nitrousImep(){return state.nitrousActive&&state.nitrousCharge>0&&state.throttle>0.5?engine.nitrousBar:0;}
// Wide-open-throttle manifold pressure at an RPM (used for the dyno sweep).
function wotMapAt(rpm){return 1.0+boostAvail(rpm);}
// Live manifold pressure is now an integrated state variable (see stepEngine).
function liveMap(){return state.map;}

// ---- Physics (all derived from the engine spec + live state) ----
// The intercooler's effectiveness at a charge flow (build 136). It was the core's quoted figure at every flow;
// a heat exchanger's rises as the flow through it falls, since each kilogram meets the same surface for longer.
// eps = 1 - exp(-NTU), NTU = UA / (m cp), the cooling air's capacity taken as large against the charge's. The
// quoted figure (INTERCOOLER eff) is read at the engine's peak flow at 1 bar of boost, where such figures are quoted,
// which fixes NTU there. UA is the two sides in series: the charge side's film coefficient follows the flow as m^0.8 (turbulent
// flow in the tubes, Dittus-Boelter), the cooling side's does not depend on it, and a gas-to-gas core is designed
// with the two sides' conductance balanced (Shah & Sekulic), so at the reference each carries half the resistance.
function icEffAt(m){
  const e0=engine.icEff;
  if(!(e0>0&&e0<1)||!(m>0)||!(engine.icRefFlow>0))return e0||0;
  const r=engine.icRefFlow/m, ntu=-Math.log(1-e0)*r*2/(1+Math.pow(r,0.8));
  return 1-Math.exp(-ntu);
}
function effIAT(map,rpm){
  // Forced induction heats the charge; an intercooler removes most of it. High-enthalpy
  // fuels (ethanol/methanol) evaporatively cool the charge — denser air and less knock.
  let t=state.iat;
  if(engine.intake!=='na'){
    // Real compression heating, not a per-bar constant. Squeezing air heats it by
    // T1·(PR^((γ−1)/γ) − 1) if the compressor were perfect, and by that divided by the
    // compressor's efficiency in the real world — so the term grows faster than linearly with
    // boost, and grows again as efficiency falls off the map. The intercooler then gives back
    // its effectiveness times that rise. This is the term that punishes over-boosting a small
    // frame: at PR 3.5 on a frame running 0.59 efficient, the charge arrives ~240 °C before the
    // core and still ~70 °C after it, where a flat 5 °C/bar said 38 °C.
    const PR=Math.max(1,map);
    // At the efficiency the compressor has AT THIS FLOW, not one design figure for the whole map: near
    // choke at the top end a frame runs well off its island and the charge arrives hotter — a real
    // part of why a turbo engine rolls off before its limiter. (Turbos only; a supercharger's
    // efficiency is another law, and it keeps its design value.)
    const rise=compOutletT(map,rpm)-t;
    t+=rise*(1-(rpm>0?icEffAt(airFlowAt(rpm,PR)):(engine.icEff!=null?engine.icEff:0.82)));
  }
  t-=engine.chargeCool*(engine.injector==='direct'?1.15:1.0);   // DI cools the charge slightly more
  return t;
}
function mbtAdvance(rpm,map){
  // Simplified "minimum advance for best torque": more at speed, less under load.
  return clamp(18+(rpm/engine.redline)*14-(map-1)*6,8,40);
}
function computeVE(rpm,map){
  // backPressureBar reads engine.boostNow, and the overlap term (scavengeGain) calls it below. This was
  // only set further down, AFTER scavengeGain had run, so every turbo VE was computed with the PREVIOUS
  // call's boost: within a sweep the point 100 rpm earlier, and at the start of a sweep whatever ran
  // last — often the last sweep's redline. On a 2.0 turbo that was a 16% torque error at 1200 rpm,
  // and the dyno, the design curve and the live bench could disagree depending on call order.
  engine.boostNow=map;
  const peak=engine.vePeakRpm;
  // Asymmetric generalized-bell (Cauchy/Lorentzian-family) curve: flat plateau around
  // the peak; the low-rpm side is narrower (torque builds later) and the high-rpm side
  // wider (shoulders fall off far more gently than a Gaussian, so power holds up top).
  const w=rpm<peak?engine.veWidthLo:engine.veWidthHi;
  // Where the engine's own breathing physics is modelled, there is no bell: the shape comes out of
  // late-IVC backflow (low end), wave action (structure) and port Mach / valve float (top end), with
  // veAmp as a flat ceiling. Where it is not, the fitted bell remains — see engine.veBell.
  // Build 122: where the intake stroke is integrated (fillTable) it carries the whole of the filling, heated and
  // cam-shaped, so the flat ceiling and the cam bonus are not applied on top of it.
  let ve=engine.veBell?engine.veAmp/(1+Math.pow(Math.abs((rpm-peak)/w),2*engine.veShoulder)):engine.fillTable?1:engine.veAmp;
  // ---- derived gas dynamics (see PHYSICS CORE) ----
  // These four lines replace EXHAUST{topGain,lowLoss} and CAM{scav,lowLoss} — four fitted numbers
  // for two physical effects. Both waves swing both ways, so a badly matched pipe COSTS VE here.
  if(engine.primL){
    const chargeK=effIAT(map,rpm)+273.15, Tex=egtAt(rpm,map);
    // The intake stroke, integrated (build 121, intakeFill): the late-IVC loss, the column's momentum and
    // the runner's tuning in one. Until build 121 the geometric trapping loss and a ram wave that could
    // only repay it.
    ve*=fillAt(rpm);
    ve*=1+scavengeGain(rpm,Tex);
    engine.boostNow=map;
    ve*=1-residualLoss(1+backPressureBar(rpm,Tex),Math.max(0.3,map),engine.compression);
  }
  // What makes a turbo fall off up top, all derived now:
  //   · CHOKE — the compressor cannot pass more air past the inducer's sonic limit (below, from the
  //     same inducer area as the flow rating, so the rating and the limit cannot disagree);
  //   · the compressor off its island near choke, so the charge arrives hotter (effIAT, per point);
  //   · the turbine off its best blade-speed ratio at high flow, so back-pressure rises to make the
  //     compressor's work (turbineWorkMean), costing pumping work and residual knock.
  // `turboChoke` — a fitted VE taper of 2.5-10% per frame from the VE peak to the redline — stood in for
  // all of this until build 94. It came out once a fitted knock step stopped deciding whether turbo
  // engines collapsed at the top (knockAt).
  if(engine.chokeFlow_kgs>0){
    const rho=map*101325/(287*(effIAT(map,rpm)+273.15));
    const demand=(engine.displacement_L/1000)*ve*(rpm/60*engine.chargesPerRev)*rho;
    if(demand>engine.chokeFlow_kgs)ve*=engine.chokeFlow_kgs/demand;
  }
  // Induction system + air filter: restriction/flow weighted by airflow demand (rpm).
  const breathe=clamp(rpm/engine.redline,0,1);
  ve*=1+engine.inductionFlowTop*breathe+engine.inductionFlowLow*(1-breathe);
  ve*=(0.97+0.03*clamp(map/engine.mapMax,0,1.2));
  // ---- derived valvetrain limits (see PHYSICS CORE) ----
  // These replace a valve-float term that only fired ABOVE the redline and so never ran inside the
  // engine's own rev range — which is why four presets made peak power exactly at the limiter,
  // something no real engine does. Port choking and valve float now come out of the head's own
  // geometry and the spring's own rate.
  if(engine.ivDia_mm){
    ve*=veMachLoss(inletMachZ(rpm,effIAT(map,rpm)+273.15));
    ve*=veFloatLoss(rpm);
  }
  return clamp(ve,0.2,1.2);
}
// ---- ECU fuel map: the AFR target as a 3D function of load (MAP) and RPM ----
// A real ECU doesn't hold one AFR everywhere — its map runs near stoich at light load for
// economy/emissions and enriches under load & boost for power and exhaust-temperature control.
// baseFuelLambda() is the factory curve (λ); the editable grid (fuelMap) overrides it cell by
// cell. In AUTO mode the mixture is looked up here; in MANUAL mode the AFR slider is used.
function baseFuelLambda(rpm,map){
  if(engine.ci){
    // Diesel: quality-governed fuelling — very lean at light load, to the smoke limit at full pedal.
    // LOAD is the share of the air available AT THIS RPM, not of the engine's best-case boost. It used
    // to be map / mapMax, so a diesel floored at 2000 rpm, before its turbo had lit, read as 29% load
    // and was fuelled at lambda 2.7 — about 40% of the torque a full rack gives. A real diesel at full
    // pedal injects up to the smoke limit for whatever air it has, at every speed.
    const l=clamp((map/Math.max(0.3,wotMapAt(rpm))-0.45)/0.55,0,1);
    return 3.4-(3.4-SMOKE_LAMBDA_CI)*l;
  }
  // Petrol (build 202). A road ECU runs closed loop at stoichiometric over almost all of its map, because the
  // three-way catalyst only converts all three pollutants there; it leaves it only near full load, and only to cool the
  // exhaust (the fuel's evaporation and the part that cannot burn carry heat away from the catalyst and the turbine).
  // Until build 202 this map began enriching at 35% manifold pressure and reached lambda 0.93 by 70%: every point a
  // hybrid holds its engine at burned 5-10% more fuel than its ECU would give it. Now: slightly lean at light load as
  // before, lambda 1 to 85% of the full-load line, and the old full-load enrichment above it only on an engine whose
  // exhaust at lambda 1 would pass the catalyst's limit (wotNeedsEnrichment). An Atkinson hybrid engine's never does.
  // The top band is 85-100% of the engine's full-load pressure (mapMax, the map's top row), so a turbo engine at part
  // boost is closed loop too, and the enrichment sits where the load and the exhaust heat are highest; at full load each
  // term is what it was before build 202. (Against each speed's own full-load pressure the 6-row grid smears the rich
  // cells back into part load.)
  const boost=Math.max(0,map-1.0),rich=engine.wotRich!==false,mx=Math.max(1,engine.mapMax||1);
  let lam=1.02-0.02*clamp((map-0.35)/0.15,0,1);                          // light load a little lean, then lambda 1
  if(rich){
    const top=clamp((map/mx-0.85)/0.15,0,1);                              // the band the ECU enriches in
    lam-=top*(0.14+0.07*clamp(boost/1.2,0,1.1)                            // full-load enrichment → ~λ0.86, more under boost
      +0.015*clamp((rpm-engine.redline*0.85)/(engine.redline*0.2),0,1)); // and a little at the top end
  }
  return clamp(lam,0.78,1.05);
}
// Whether the engine's exhaust at lambda 1 on its full-load line passes the catalyst's limit anywhere in its range:
// then the ECU enriches there. CAT_T_LIMIT is a three-way catalyst's continuous ceiling, ~950 C (above it the washcoat
// sinters and the precious metal grows), applied here to the gas at the port, with no allowance for the pipe's cooling
// on the way. Diesels are lean and carry no catalyst limit of this kind; carburetted engines have no ECU to enrich.
// A ported engine (rotary, two-stroke) keeps it whatever its exhaust: its ECU enriches against detonation as much as
// heat (a boosted rotary famously runs rich for it), and its knock here is the points score that reads the enrichment
// (KNOCK_RICH), not the end-gas integral. The exhaust model cannot tell either: rich of stoichiometric its temperature
// is flat by construction (exhaustGasT caps the heat released and does not count the extra fuel's evaporation).
const CAT_T_LIMIT=950+273.15;
function wotNeedsEnrichment(){
  if(engine.ci||!engine.canAutoAFR||engine.ports)return true;
  for(let r=Math.max(1000,engine.idleRpmEff||800);r<=engine.redline;r+=250)if(egtAt(r,wotMapAt(r),1.0)>CAT_T_LIMIT)return true;
  return false;
}
function mappedAFR(rpm,map){
  const st=engine.stoichAFR;
  if(fuelMap){   // bilinear-interpolate the (editable) λ grid over its breakpoints
    const fc=clamp((rpm-1000)/Math.max(1,engine.redline-1000)*(FM_COLS-1),0,FM_COLS-1);
    const fr=fmRowOf(rpm,map);
    const c0=Math.floor(fc),c1=Math.min(c0+1,FM_COLS-1),tc=fc-c0;
    const r0=Math.floor(fr),r1=Math.min(r0+1,FM_ROWS-1),trr=fr-r0;
    const lam=(fuelMap[r0][c0]*(1-tc)+fuelMap[r0][c1]*tc)*(1-trr)+(fuelMap[r1][c0]*(1-tc)+fuelMap[r1][c1]*tc)*trr;
    return st*lam;
  }
  return st*baseFuelLambda(rpm,map);
}
// The AFR actually run at an operating point: the ECU map (AUTO) or the fixed slider (MANUAL).
// The mixture actually burned. A diesel's injection system will not fuel past its full-load floor
// (smoke, turbine temperature), whatever the map or the slider asks for.
function curAFR(rpm,map){
  const afr=engine.afrMode==='auto'?mappedAFR(rpm,map):state.afr;
  return engine.ci?Math.max(afr,engine.stoichAFR*dieselLambdaFloor(rpm)):afr;
}
// ---- Fuel-map visualiser: a load×RPM grid of the target AFR (shown when the mixture is AUTO) ----
const FM_COLS=8, FM_ROWS=6;
const fmRpmAt=c=>Math.round(lerp(1000,engine.redline,c/(FM_COLS-1)));
const fmMapAt=r=>lerp(0.3,engine.mapMax,r/(FM_ROWS-1));   // r=0 light load … r=ROWS-1 full load
// A DIESEL's rows are load — the share of the air available at that rpm, 15% to full pedal — not an
// absolute manifold pressure. A diesel's full-load line moves with boost, so on absolute-MAP rows a
// floored diesel crossed rows as its turbo lit and the interpolation smeared it to lambda 1.2-1.43
// at 1600-1800 rpm where the map itself said 1.05. A petrol ECU really does schedule on MAP, so its
// rows stay as they were.
const FM_LOAD0=0.15;
const fmLoadAt=r=>lerp(FM_LOAD0,1,r/(FM_ROWS-1));
const fmMapAtRC=(r,c)=>engine.ci?fmLoadAt(r)*wotMapAt(fmRpmAt(c)):fmMapAt(r);
const fmRowOf=(rpm,map)=>engine.ci
  ?clamp((map/Math.max(0.3,wotMapAt(rpm))-FM_LOAD0)/(1-FM_LOAD0)*(FM_ROWS-1),0,FM_ROWS-1)
  :clamp((map-0.3)/Math.max(0.1,engine.mapMax-0.3)*(FM_ROWS-1),0,FM_ROWS-1);
// Fill a fresh λ grid from the factory curve at each breakpoint.
function generateFuelMap(){
  const g=[];for(let r=0;r<FM_ROWS;r++){const row=[];for(let c=0;c<FM_COLS;c++)row.push(baseFuelLambda(fmRpmAt(c),fmMapAtRC(r,c)));g.push(row);}
  return g;
}
// Keep the map in sync with the engine: regenerate (discarding edits) when the map-relevant
// params change or there's no map yet; keep the user's custom grid otherwise.
function manageFuelMap(){
  const key=engine.mapMax.toFixed(2)+'|'+engine.redline+'|'+engine.stoichAFR.toFixed(1)+'|'+(engine.ci?'d':'p');
  const dimsOk=Array.isArray(fuelMap)&&fuelMap.length===FM_ROWS&&fuelMap[0]&&fuelMap[0].length===FM_COLS;
  if(!dimsOk||!fuelMapCustom||fuelMapKey!==key){fuelMap=generateFuelMap();fuelMapKey=key;fuelMapCustom=false;fmSel=null;}
}
const FM_LMIN=0.72,FM_LMAX=1.10,FM_LMIN_CI=1.0,FM_LMAX_CI=3.8;   // editable λ bounds
function selectFmCell(c,r){fmSel={c:clamp(c,0,FM_COLS-1),r:clamp(r,0,FM_ROWS-1)};renderFuelMap();}
function adjustFmCell(delta){
  if(!fmSel||!fuelMap)return;
  const lo=engine.ci?FM_LMIN_CI:FM_LMIN,hi=engine.ci?FM_LMAX_CI:FM_LMAX;
  fuelMap[fmSel.r][fmSel.c]=clamp(fuelMap[fmSel.r][fmSel.c]+delta,lo,hi);
  fuelMapCustom=true;dynoCache=null;renderFuelMap();
}
function resetFuelMap(){fuelMap=generateFuelMap();fuelMapCustom=false;fmSel=null;dynoCache=null;renderFuelMap();flash(tr('FUEL MAP RESET TO FACTORY'));}
function renderFuelMap(){
  const box=document.getElementById('fuelMapBox'),hdr=document.getElementById('fuelMapHdr');
  if(!box||!hdr)return;
  const show=engine.afrMode==='auto';
  box.style.display=show?'block':'none';hdr.style.display=show?'':'none';
  const edHide=document.getElementById('fuelMapEdit');if(edHide&&!show)edHide.style.display='none';
  if(!show){box.innerHTML='';return;}
  const st=engine.stoichAFR;
  let h='<table class="fuelmap"><tr><th>'+(engine.ci?tr('load').toUpperCase():'MAP')+'\\RPM</th>';
  for(let c=0;c<FM_COLS;c++){const rp=fmRpmAt(c);h+='<th>'+(rp>=1000?(rp/1000).toFixed(1)+'k':rp)+'</th>';}
  h+='</tr>';
  for(let r=FM_ROWS-1;r>=0;r--){
    const mp=fmMapAt(r);
    h+='<tr><th>'+(engine.ci?Math.round(fmLoadAt(r)*100)+'%':(mp>1.001?'+'+(mp-1).toFixed(1):mp.toFixed(1)))+'</th>';
    for(let c=0;c<FM_COLS;c++){
      const afr=mappedAFR(fmRpmAt(c),fmMapAtRC(r,c)),lam=afr/st;
      const rr=clamp((1.12-lam)/0.34,0,1),hue=Math.round(lerp(210,12,rr));
      const selCls=fmSel&&fmSel.c===c&&fmSel.r===r?' sel':'';
      h+='<td class="fm-cell'+selCls+'" data-c="'+c+'" data-r="'+r+'" style="background:hsl('+hue+',60%,40%)">'+(engine.ci?lam.toFixed(1):afr.toFixed(1))+'</td>';
    }
    h+='</tr>';
  }
  h+='</table><div class="fuelmap-note">'+tr(engine.ci?'Rows = load (share of the air available at that rpm, top = full pedal) · Columns = RPM · cell = target':'Rows = load (MAP bar, top = full) · Columns = RPM · cell = target')+' '+(engine.ci?'λ':'AFR')+'. '+tr('Warm = rich, blue = lean. Tap a cell to tune it; outlined = live point.')+(fuelMapCustom?' <b style="color:#ffcc00">'+tr('CUSTOM MAP')+'</b>':'')+'</div>';
  box.innerHTML=h;
  // Edit controls
  const ed=document.getElementById('fuelMapEdit');
  if(ed){
    ed.style.display='flex';
    const info=document.getElementById('fmSelInfo');
    if(fmSel){const afr=mappedAFR(fmRpmAt(fmSel.c),fmMapAtRC(fmSel.r,fmSel.c)),mp=fmMapAt(fmSel.r);
      info.textContent=Math.round(fmRpmAt(fmSel.c))+'rpm • '+(engine.ci?Math.round(fmLoadAt(fmSel.r)*100)+'% '+tr('load'):(mp>1.001?'+'+(mp-1).toFixed(1):mp.toFixed(1))+'bar')+' → '+(engine.ci?'λ'+(afr/st).toFixed(2):afr.toFixed(1)+' AFR');
    }else info.textContent=tr('Tap a cell to select');
  }
  updateFuelMapMarker();
}
function updateFuelMapMarker(){
  const box=document.getElementById('fuelMapBox');
  if(!box||engine.afrMode!=='auto'||box.style.display==='none')return;
  const c=clamp(Math.round((state.rpm-1000)/(engine.redline-1000)*(FM_COLS-1)),0,FM_COLS-1);
  const r=Math.round(fmRowOf(state.rpm,state.map));
  const prev=box.querySelector('td.live');if(prev)prev.classList.remove('live');
  const cell=box.querySelector('td[data-c="'+c+'"][data-r="'+r+'"]');if(cell)cell.classList.add('live');
}
// MIXTURE -> TORQUE, from the fuel-air cycle rather than a fitted bell.
// This was a Gaussian 0.19 wide in lambda, centred on 0.86. It got best power right and nothing else:
// at stoichiometric it said a petrol engine makes 41% less torque than at best power (real engines:
// about 3% less), and at lambda 1.10 it had already hit its floor. That made rich the most economical
// mixture in the model, and it ran every light-load point of the AUTO fuel map — which sits at
// stoich, where a catalyst works — 37% weak. The diesel side was as steep the other way.
//
// What actually happens: torque follows the fuel that BURNS times how efficiently it burns.
//   · Lean of stoich every gram burns, so heat release goes as fuel, phi = 1/lambda, and the
//     indicated efficiency RISES as the mixture leans out (higher gamma, less dissociation, cooler
//     gas) — from Heywood's fuel-air cycle results, about +12% from phi 1.0 to 0.8, flattening by
//     phi 0.25.
//   · Rich of stoich the oxygen runs out first, so the extra fuel cannot all burn and efficiency
//     falls: about -14% at phi 1.2 and -28% at phi 1.4 in the same tables.
// imep is proportional to phi * eta(phi), which gives a maximum near phi 1.2 (lambda 0.83) about 3%
// above stoich, 4% down at lambda 1.10 and 9% down at 1.20 — the shape a real SI engine shows.
// The two roll-offs that limit a real engine at the extremes stay as they were: lean-limit burn
// deterioration past lambda 1.12, and rich misfire below 0.75.
//
// ANCHORED, so the scorecard does not move: the curve is scaled to equal the old one's value at the
// mixture the scorecard rates peak power at (lambda 0.86 spark, 1.05 diesel). Only the shape away
// from best power changes. (The acceleration curve is built at 0.88, where this reads 0.2% under
// the new curve's own value at 0.86 and 1.0% over the old curve's — the one figure set that shifts.)
const faEta=phi=>phi<=1?1+0.6*(1-phi)-0.4*(1-phi)*(1-phi):Math.max(0.3,1-0.71*(phi-1));
const imepRel=lam=>{const phi=1/Math.max(0.3,lam);return phi*faEta(phi);};
// Work per unit of stoichiometric fuel energy, by mixture: phi x faEta(phi), with the two roll-offs a
// real spark engine has at the extremes (rich misfire, lean-limit burn deterioration).
function sparkMixture(lam){
  let f=imepRel(lam);
  if(lam<0.75)f*=0.85+0.6*(lam-0.68);   // very rich: misfire
  if(lam>1.12)f*=1.0-1.5*(lam-1.12);    // very lean: burn deteriorates toward the lean limit
  return Math.max(0.03,f);
}
// ---- A spark engine's torque, from the fuel it burns (build 95) ----
// Spark engines took IMEP from AIR: IMEP_K (13.2) x typeImep x map x VE x a mixture factor anchored at
// lambda 0.86 x crFactor. Air density times phi x faEta(phi) IS fuel times an efficiency, so the shape
// was already right; what was fitted was the constant that carried the efficiency, and every fuel was
// handed the same energy per kg of air. Now, as for the diesel (dieselGrossImep):
//     gross IMEP = eta x (m_air / AFR_st) x LHV x sparkMixture(lambda)
// with the efficiency from Heywood's rule that a real engine reaches ~0.8 of the FUEL-AIR cycle, whose
// efficiency at phi 1 follows 1 - CR^-(gamma-1) with an effective gamma ~1.28 (0.47 at CR 10, Heywood
// fig. 5-9). Spark timing (ignF), ignition health, coolant, engine health and nitrous stay as they were.
// The model's old constant implied 0.383 at CR 9.4 and lambda 1; this gives 0.373, so spark torque
// falls ~2.7% across the board — the honest cost of replacing the fit. Methanol now carries the 3% more
// energy per kg of air it really does. Rotary and two-stroke keep their measured type factors
// (typeImep 0.70 / 0.60), still fitted and labelled.
const REAL_TO_FUELAIR=0.80, GAMMA_FA=1.28;
function sparkGrossImep(rpm,map,ve){
  const e=engine,st=e.stoichAFR||14.7;
  const air=map*1e5/(287*(effIAT(map,rpm)+273.15))*ve;               // kg of trapped air per m3 swept
  const eta=REAL_TO_FUELAIR*(1-Math.pow(Math.max(1.5,e.compression),1-GAMMA_FA))*wallImepFactor(rpm);
  return eta*e.typeImep*air/st*(e.fuelLHV||44)*1e6*sparkMixture(curAFR(rpm,map)/st)/1e5;   // bar
}
function tempFactors(coolant,oil){
  let coolF=1.0-0.00045*Math.pow(coolant-91,2);
  if(coolant>108)coolF-=0.10*((coolant-108)/22);
  if(coolant<55)coolF-=0.04;
  coolF=clamp(coolF,0.75,1.04);
  let oilFrictionMult=1.0;
  if(oil<80)oilFrictionMult=1.0+0.65*(1-oil/80);
  else if(oil>115)oilFrictionMult=1.0+0.35*((oil-115)/35);
  oilFrictionMult=clamp(oilFrictionMult,1.0,1.70);
  return{coolF,oilFrictionMult};
}
function ignBonus(){return {distributor:-2,wasted:0,coil:2}[engine.ignitionType]||0;}
// ---- Knock: the end gas's own chemistry (build 131) ----
// Knock is the unburned gas ahead of the flame igniting on its own before the flame reaches it. The gas is
// compressed by the piston and then by the burning charge behind it, and it ignites when the integral of
// dt / tau over its life reaches 1 (Livengood & Wu), tau being its ignition delay at the pressure and
// temperature it is at. The delay is Douaud & Eyzat's correlation for a fuel of octane number ON:
//     tau [ms] = 17.68 (ON/100)^3.402 p[atm]^-1.7 exp(3800 / T)
// The gas is traced on this model's own cycle (the trace wallTrace runs): from BDC, compressed and then
// heated by the Wiebe burn phased at CA50, the unburned part following the pressure isentropically
// (gamma 1.35, an unburned mixture), until 90% of the charge has burned and there is no end gas left.
// Where it starts: the fresh charge at the intake temperature (effIAT), mixed by enthalpy at the intake
// pressure with the residual the exhaust left in the clearance volume (residualFrac, the residual at the
// exhaust temperature expanded back to intake pressure): T = (1 + f) / (1/T_fresh + f/T_res). With direct
// injection the fuel evaporates in the cylinder and takes its latent heat from the charge,
// dT = h_fg (F/A) / cp (gasoline 350 kJ/kg). A port-injected engine's fuel evaporates mostly off the port
// walls and cools the charge little.
// Until build 131 this was a points score: 30 a bar of boost, 8 a unit of compression, 0.8 a degree of charge
// temperature, -2.2 an octane, -12 for direct injection, more for rpm, coolant and alcohol, each set by hand.
// It left a 10:1 engine at 2.4 bar on 98 RON at its best spark, which no real one is.
// Kept from the score: the measured trend that knock-limited spark gains ~3 degrees per 0.1 of enrichment
// below lambda 0.95 and loses about as much leaner (end-gas chemistry Douaud & Eyzat do not carry), applied to
// the phasing the gas sees; the ignition system's margin (ignBonus); nitrous's extra cylinder pressure, as
// before. The score the rest of the model reads is KNOCK_TARGET x the integral: 40 is knock onset.
function ignBonus(){return {distributor:-2,wasted:0,coil:2}[engine.ignitionType]||0;}
const DE_A=17.68,DE_ON=3.402,DE_P=1.7,DE_T=3800, HFG={gasoline:350e3,race:350e3,e85:840e3,methanol:1100e3};
// Octane sensitivity S = RON - MON (build 132). Douaud & Eyzat fitted their delay on primary reference fuels (iso-octane
// and n-heptane), which have none; a real fuel autoignites like the reference fuel of its OCTANE INDEX,
// OI = RON - K S (Kalghatgi, SAE 2005-01-0239), K set by how hot the unburned gas is at a given pressure:
// K = 0.0056 T_comp15 - 4.68, T_comp15 the unburned temperature when compression reaches 15 bar (0 at the RON test's
// ~836 K, 1 at the MON test's hotter ~1014 K). A boosted engine compresses colder gas to high pressure, so its K is
// negative (Kalghatgi measures -0.4 to -0.74 on DI engines at 2000 rpm) and a sensitive fuel resists better than its
// RON says. S: pump gasoline 10 (EN 228's RON 95 / MON 85 minimums), E85 17, methanol 20 (RON 108.7 / MON 88.6);
// race fuel taken at gasoline's 10, its MON not being specified.
const OCT_SENS={gasoline:10,race:10,e85:17,methanol:20};
let _knockCache=null;
// The cycle the end gas lives on: a Wankel chamber's volume, slow burn and late best-torque phasing for a rotary
// (rotaryLostWork's), the crank-slider's for everything else.
function burnCycle(){
  return engine.type==='rotary'?{vol:wankelVol,burn:ROTARY_BURN_DEG,ca50:ROTARY_CA50,bdc:-270}
                               :{vol:pistonVol,burn:SI_BURN_DEG,ca50:SI_CA50,bdc:-180};
}
function endGasIntegral(rpm,map,ca50){
  const e=engine,cr=Math.max(1.5,e.compression),R=287,g=1.30,cv=R/(g-1),k=(1.35-1)/1.35;
  const st=e.stoichAFR||14.7,lam=curAFR(rpm,map)/st,q=(e.fuelLHV||44)*1e6/(Math.max(1,lam)*st);
  const Tf=effIAT(map,rpm)+273.15-(e.injector==='direct'?(HFG[e.fuel]||350e3)/(lam*st)/1005:0);
  const Tex=egtAt(rpm,map),prev=e.boostNow;e.boostNow=map;
  const pExh=1+backPressureBar(rpm,Tex);e.boostNow=prev;
  const pInt=Math.max(0.3,map),f=Math.min(0.5,residualFrac(pExh,pInt,cr));
  const Tres=Math.max(Tf,Tex*Math.pow(Math.min(1,pInt/pExh),(GAMMA_EXH-1)/GAMMA_EXH));
  const T1=(1+f)/(1/Tf+f/Tres);
  const cyc=burnCycle(),burn=cyc.burn,soc=ca50-wiebeX50()*burn,d=0.5,dt=d/(6*Math.max(300,rpm));
  const B=e.bore_mm/1000,Sp=2*e.stroke_mm/1000*rpm/60,disc=Math.PI/4*B*B,Vd=disc*e.stroke_mm/1000,Vc=Vd/(cr-1);
  // Compression starts where the intake valve closes, on the charge the intake stroke trapped (build 134). It
  // started at BDC with the cylinder full at intake pressure, whatever the engine had breathed: at low speed a
  // late-closing valve has let part of it back out, and at the tuned peak the column has packed in more. Now the
  // gas is computeVE's (the fresh charge the torque is made from) plus the residual mixed into it, and it is
  // compressed from the volume at IVC. Ported engines and the rotary keep BDC and a full cylinder.
  const ivc=cyc.bdc===-180&&!e.ports?ivcAt(rpm):null;
  let th0=cyc.bdc,mTot=pInt*1e5*Vc*cr/(R*T1);
  if(ivc!=null){
    const prevB=e.boostNow,ve=computeVE(rpm,map);e.boostNow=prevB;
    const mF=ve*Vd*pInt*1e5/(R*(effIAT(map,rpm)+273.15));
    th0=cyc.bdc+ivc;mTot=mF*(1+f*Tf/Tres);
  }
  const V00=cyc.vol(th0,cr),v1=Vc*cr/mTot,p1=mTot*R*T1/(Vc*V00);
  const xb=th=>th<=soc?0:1-Math.exp(-WIEBE_A*Math.pow(Math.min(1,(th-soc)/burn),WIEBE_M+1));
  // the octane index: the reference fuel this fuel autoignites like, at this engine's T_comp15
  const T15=T1*Math.pow(15e5/p1,k),Kk=0.0056*T15-4.68;
  const OI=(e.effOctane||95)-Kk*(OCT_SENS[e.fuel]??10);
  const onF=DE_A*Math.pow(Math.max(50,OI)/100,DE_ON);
  // Below ~5 bar the delay is seconds (exp(3800/T) at the gas's few hundred kelvin), so the integral only counts
  // once compression has the pressure there; the trace still runs from IVC so the gas's state is right.
  // Heat to the walls (build 132), at Woschni's flux and his 450 K wall, as wallTrace takes it: the bulk loses it, which
  // lowers the pressure, and so does the end gas, which is the gas against the walls. It matters most at low speed,
  // where the gas has longest.
  const ends=disc*(e.type==='rotary'?2:1+1/Math.cos(SI_ROOF_DEG*Math.PI/180));
  const hW=(p,TT,w)=>WOSCHNI_C*Math.pow(B,-0.2)*Math.pow(p/1000,0.8)*Math.pow(TT,-0.55)*Math.pow(w,0.8);
  let T=T1,Tu=T1,I=0,V0=V00,x0=0,pPrev=p1;
  const c1=dt*1000/onF,pRef=5e5;
  for(let th=th0;th<soc+burn;th+=d){
    if(x0>=0.9)break;
    const Vn=cyc.vol(th+d,cr),p=R*T*cr/(v1*V0),xn=xb(th+d),A=ends+4*Vc*V0/B;
    const w=Math.max(0.1,2.28*Sp+(th>=soc?3.24e-3*Vd*T1/(p1*Vc*V00)*(p-p1*Math.pow(V00/V0,g)):0));
    Tu=Tu*Math.pow(p/pPrev,k)-hW(p,Tu,w)*A*(Tu-T_WALL)*dt/(mTot*cv);pPrev=p;
    if(p>pRef)I+=c1*Math.pow(p/101325,DE_P)*Math.exp(-DE_T/Tu);
    T+=(q*(xn-x0)-p*v1*(Vn-V0)/cr-hW(p,T,w)*A*(T-T_WALL)*dt/mTot)/cv;
    V0=Vn;x0=xn;
  }
  return I;
}
// Rotaries and two-strokes keep the points score this replaced (knockScorePorted, below, as it was in build 122):
// the end-gas integral above is a four-stroke poppet engine's cycle, and a Wankel's end gas (a thin trailing pocket
// against a cool housing) or a two-stroke's scavenged charge is not that gas. Retire it when their cycles are
// derived, as their VE bell and type factors will be.
function knockScorePorted(rpm,map,adv){
  if(engine.ci)return 0;   // compression ignition — no spark knock (limited by smoke/EGT instead)
  const mbt=mbtAdvance(rpm,map);
  let k=0;
  k+=Math.max(0,map-1.0)*30;                            // boost
  k+=Math.max(0,engine.compression-9)*8;                // static compression
  k+=Math.max(0,effIAT(map,rpm)-30)*0.8;                    // hot intake charge
  k+=Math.max(0,state.coolant-95)*1.0;                  // hot chamber
  k+=Math.max(0,rpm-engine.redline*0.8)/60;             // less time = more heat soak
  k+=(adv-mbt-ignBonus())*2.5;                          // spark timing vs MBT (signed)
  const lam=curAFR(rpm,map)/engine.stoichAFR;
  k+=Math.max(0,(lam-0.95))*60;                         // lean burns hotter
  // Rich suppresses knock — continuously. This was `if (lam < 0.87) k *= 0.5`: a step that halved the
  // whole score, so lambda 0.86 and 0.88 differed by up to 40 points, and at high boost the design curve
  // (rated at 0.88) collapsed into knock retard while the scorecard (0.86) did not — a 33% torque
  // disagreement between two views of one engine, from a 2% mixture change. It is not evaporative
  // cooling: the extra fuel at 0.86 cools the charge by ~1 K after port-wall losses. It is end-gas
  // chemistry, which this points-based score does not represent, so the replacement is the measured
  // TREND, labelled as such: knock-limited spark advance gains ~3 degrees per 0.1 of enrichment below
  // ~0.95, and this score prices a degree of timing at 2.5 points. (The real derivation is an end-gas
  // autoignition integral, Livengood-Wu — a conversion of its own.)
  const KNOCK_RICH=75;                                  // points per unit lambda: 3 deg/0.1 x 2.5 pts/deg
  k-=Math.max(0,(0.95-lam))*KNOCK_RICH;
  k-=(engine.effOctane-90)*2.2;                         // fuel octane resists knock
  k-=engine.fuelKnockBonus;                             // alcohol extra knock margin
  if(engine.injector==='direct')k-=12;                  // DI charge cooling
  k+=nitrousImep()*4;                                   // nitrous raises cylinder pressure → more knock
  k+=residualKnockPorted(rpm,map);                            // hot burnt gas the exhaust could not push out
  return clamp(k,0,100);
}
function residualKnockPorted(rpm,map){
  const e=engine;
  if(!(e.compression>1))return 0;
  const Tfresh=effIAT(map,rpm)+273.15;
  const Tex=egtAt(rpm,map);
  const prev=e.boostNow;e.boostNow=map;                 // backPressureBar reads it for the turbine
  const pExh=1+backPressureBar(rpm,Tex);
  e.boostNow=prev;
  const pInt=Math.max(0.3,map);
  // The trapped gas does not arrive at port temperature: it expands back into the cylinder as the
  // piston descends, and cools doing it.
  const Tres=Math.max(Tfresh,Tex*Math.pow(Math.min(1,pInt/pExh),(GAMMA_EXH-1)/GAMMA_EXH));
  const dF=clamp(residualFrac(pExh,pInt,e.compression)-1/Math.max(1.5,e.compression-1),0,0.30);
  return dF*(Tres-Tfresh)*0.8;                          // same per-degree sensitivity as above
}
// The phasing the end gas sees at a spark advance: CA50 moves with the spark, degree for degree, about the
// model's best-torque phasing (SI_CA50 at mbtAdvance); enrichment and a stronger spark act as that much retard.
function knockCa50(rpm,map,adv){
  const lam=curAFR(rpm,map)/(engine.stoichAFR||14.7);
  const mix=lam<0.95?30*(0.95-lam):-30*(lam-0.95);     // ~3 deg per 0.1 lambda, the measured trend
  return burnCycle().ca50+mbtAdvance(rpm,map)+ignBonus()+mix-adv;
}
function knockAt(rpm,map,adv){
  const e=engine;
  if(e.ci)return 0;   // compression ignition — no spark knock (limited by smoke/EGT instead)
  if(e.ports)return knockScorePorted(rpm,map,adv);
  if(!_knockCache||_knockCache.score!==e.score)_knockCache={score:e.score,m:new Map()};
  const lam=curAFR(rpm,map)/(e.stoichAFR||14.7);
  const key=Math.round(rpm/10)+'|'+map.toFixed(3)+'|'+adv.toFixed(2)+'|'+effIAT(map,rpm).toFixed(1)+'|'+lam.toFixed(3)+'|'+e.effOctane+'|'+e.ignitionType;
  let I=_knockCache.m.get(key);
  if(I==null){
    I=endGasIntegral(rpm,map,knockCa50(rpm,map,adv));
    if(_knockCache.m.size>20000)_knockCache.m.clear();
    _knockCache.m.set(key,I);
  }
  return clamp(KNOCK_TARGET*I+nitrousImep()*4,0,100);   // nitrous raises cylinder pressure → more knock
}
// The spark advance actually run at an operating point. FIXED = the designed value; AUTO = an ECU that runs
// best-torque spark where the end gas survives it, and otherwise the most advance at which it just does
// (the knock limit), never more than CA50_RETARD past the cycle's own best-torque phasing.
const KNOCK_TARGET=40, CA50_RETARD=37;   // the furthest retard past best-torque phasing: CA50 ~45 deg ATDC on a piston
function activeAdvance(rpm,map){
  const mbt=mbtAdvance(rpm,map);
  if(engine.ci)return mbt;   // diesel: no spark timing (injection-timed); treat as on-MBT
  if(engine.timingMode!=='auto')return engine.ignitionAdv;
  if(engine.ports){                                      // the ported engines' score, as in build 122
    const k0=knockAt(rpm,map,mbt);
    return k0<=KNOCK_TARGET?mbt:clamp(mbt-(k0-KNOCK_TARGET)/2.5,6,mbt);
  }
  // the same operating point is asked for several times per torque figure: remember the answer
  if(!_knockCache||_knockCache.score!==engine.score)_knockCache={score:engine.score,m:new Map()};
  const key='A|'+Math.round(rpm/10)+'|'+map.toFixed(3)+'|'+effIAT(map,rpm).toFixed(1)+'|'+(curAFR(rpm,map)/(engine.stoichAFR||14.7)).toFixed(3)+'|'+engine.effOctane+'|'+engine.ignitionType+'|'+nitrousImep();
  const hit=_knockCache.m.get(key);if(hit!=null)return hit;
  let adv=mbt;
  if(knockAt(rpm,map,mbt)>KNOCK_TARGET){
    // As far back as an ECU will go: a piston's burn phased ~45 deg after TDC, where it turns unstable and the
    // exhaust too hot to go further, the same distance past best-torque phasing on a rotary (build 131; it stopped
    // at a fitted 6 deg BTDC, which at full load under ~2000 rpm left the end gas knocking at any spark).
    let lo=Math.min(mbt,knockCa50(rpm,map,0)-(burnCycle().ca50+CA50_RETARD)),hi=mbt;
    if(knockAt(rpm,map,lo)>KNOCK_TARGET)adv=lo;            // knocks even fully retarded: the floor
    else{for(let i=0;i<9;i++){const m=(lo+hi)/2;if(knockAt(rpm,map,m)>KNOCK_TARGET)hi=m;else lo=m;}adv=lo;}   // to ~0.06 deg
  }
  _knockCache.m.set(key,adv);
  return adv;
}
function computeKnockRisk(rpm,map){return knockAt(rpm,map,activeAdvance(rpm,map));}
// What a spark advance costs in work (build 131): the cycle efficiency of the Wiebe burn at the phasing it
// gives, against best-torque phasing (wiebePhasingEff), replacing a fitted 1 - 0.004 x (degrees off MBT)^2.
function sparkTimingFactor(rpm,map){
  if(engine.ports)return clamp(1-0.004*Math.pow(activeAdvance(rpm,map)-mbtAdvance(rpm,map),2),0.72,1.0);   // as in build 122
  const off=mbtAdvance(rpm,map)-activeAdvance(rpm,map),cr=engine.compression,x50=wiebeX50(),cyc=burnCycle();
  const eff=c=>wiebePhasingEff(cyc.burn,c-x50*cyc.burn,cr,cyc.vol);
  return clamp(eff(cyc.ca50+off)/eff(cyc.ca50),0.3,1);
}
// The pumping loop: PMEP = p_exhaust - p_intake, both absolute. Charged in two halves, because
// only one of them is honestly derived here.
//
//   EXHAUST side, (p_exh - 1). Fully derived, and it was missing ENTIRELY. The old term charged
//   only for intake depression against atmosphere — i.e. the pumping loop with p_exhaust ASSUMED to
//   be 1 bar. On a boosted engine the piston is not pushing against the atmosphere, it is pushing
//   against the turbine, and backPressureBar already computes that. Leaving it out meant a tight
//   turbine housing cost nothing at the top end, so nothing in the model pushed back on making one
//   tighter — which is precisely why turbine housing sizing could not be derived.
//
//   INTAKE side, (1 - map). Throttling, unchanged, and it keeps its `ci` reduction. That factor is
//   NOT physics: it compensates for mapTarget() giving a diesel a throttle plate it should not
//   have. A real diesel is quality-governed — the intake sits at ambient+boost at every load and
//   torque is set by fuel quantity, which is also why a diesel has so little engine braking that
//   trucks need exhaust brakes. Fixing it means re-plumbing diesel load through fuelling rather
//   than through map, which is its own change; labelled here rather than quietly carried.
//
// Deliberately NOT granting negative PMEP when boost exceeds back-pressure, even though positive
// pumping work is real: this model's imep is a lumped correlation proportional to map, so it
// already carries some of the pressure-level effect. Handing a supercharged engine +0.5 bar on top
// of that would be a much larger claim than the missing exhaust term this change is fixing.
function pumpingMEP(rpm,map){
  const Tex=egtAt(rpm,map);
  const prev=engine.boostNow;engine.boostNow=map;                  // backPressureBar reads it for the turbine
  const pExh=1+backPressureBar(rpm,Tex);
  engine.boostNow=prev;
  // A diesel's IMEP is gross (fuel-based), so its gas exchange is the whole loop, signed: the piston
  // pushes out against p_exh and is pushed down by p_int. A turbo that makes more boost than
  // back-pressure gives work back. Below atmosphere the throttle term stays as described above.
  if(engine.ci)return pExh-Math.max(1,map)+PUMP_K*Math.max(0,1.0-map)*0.15;
  return Math.max(0,pExh-1)+PUMP_K*Math.max(0,1.0-map);
}
// Friction + pumping mean effective pressure.
function pumpFrictionMEP(rpm,map,oilFrictionMult){
  let fmep=(0.55+1.8e-8*rpm*rpm)*oilFrictionMult*engine.strokeFrictionMult;
  if(engine.intake==='supercharger')
    fmep+=0.18*(SC_TYPE[engine.scType]||SC_TYPE.roots).drag*Math.max(0,map-1.0)*(0.4+0.6*rpm/engine.redline);  // parasitic drive (by type)
  fmep+=pumpingMEP(rpm,map);
  fmep+=engine.altDragMEP;                                         // alternator belt drag (baseline)
  return fmep;
}
// ---- Electrical: alternator, battery and ignition health ----
function altOutputA(rpm){         // ~35% of rated at idle, full by ~2500 rpm
  return engine.altMaxA*clamp((rpm-500)/2000,0.35,1);
}
function elecDemandA(){           // ECU/pump baseline + accessories + electric fan (when hot)
  return ELEC_BASE_A+state.elecLoad*ELEC_ACC_A+(engine.fan==='electric'&&state.coolant>92?ELEC_FAN_A:0);
}
// Parasitic crank torque (Nm) to spin the alternator for the current actually generated —
// significant at idle (low RPM), negligible up top.
function electricalDragTorque(rpm){
  const genA=Math.min(altOutputA(rpm),elecDemandA());
  const watts=genA*14.0/0.55;     // electrical power / alternator efficiency
  return watts/(Math.max(rpm,500)*2*Math.PI/60);
}
// Spark strength falls with low system voltage; combined with the dwell limit this sets the
// misfire onset RPM. Weak battery + a distributor = early top-end misfire.
function ignVFactor(){return clamp((state.systemVoltage-9.5)/(13-9.5),0.35,1);}
function ignitionHealth(rpm){
  if(engine.ci)return 1;   // compression ignition — no spark dwell limit
  const lim=engine.dwellLimit*ignVFactor();
  return rpm<=lim?1:clamp(1-(rpm-lim)/(engine.dwellLimit*0.45),0.5,1);
}
// Diesels have no spark-knock ceiling, so raw IMEP would scale with boost×compression without
// limit. In reality peak cylinder pressure, the smoke limit and turbo/EGT constraints cap how
// much work a diesel makes per cycle — production & built diesels top out around ~22-24 bar
// BMEP. Softly saturate diesel IMEP toward that ceiling (low-boost/NA diesels are untouched).
function dieselImepLimit(imep){
  if(!engine.ci)return imep;
  const knee=17,span=7;   // → asymptotes near ~24 bar IMEP (~22 bar BMEP)
  return imep>knee?knee+span*Math.tanh((imep-knee)/span):imep;
}
// ---- Combustion takes TIME, and a diesel cannot buy it back with rpm ----
// This replaces the diesel's fitted VE bell, which was what made its torque fall above 3000 rpm.
// That fall is not a breathing problem: with the bell removed the derived breathing holds VE at
// 0.77-0.85 to the redline, and the torque stays flat to 4800 rpm (214 hp from an engine sold at 150).
//
// In a spark engine the flame front is carried by in-cylinder turbulence, and turbulence scales
// with piston speed, so the burn takes roughly the same number of CRANK DEGREES at every rpm. Its
// phasing loss is the same everywhere and already lives in typeImep. A diesel's burn is set by how
// fast the injector can deliver fuel and the spray can find air: a fixed TIME. At 2000 rpm 2.5 ms
// is 30 crank degrees; at 4800 it is 72, and the heat released late into the expansion stroke does
// less work. Each increment of heat is worth the Otto efficiency of the expansion still ahead of it,
//     eta(theta) = 1 - (V_bdc/V(theta))^(1-gamma),
// weighted by a Wiebe burn x = 1 - exp(-a (t/t_burn)^(m+1)) (Heywood's a = 5, m = 2).
//
// Why the ECU does not simply inject earlier to recentre the burn: that recovers almost all of the
// loss on paper (a free start of combustion leaves 96% at 4800 rpm), but a full-load diesel is
// already at its peak-pressure and NOx limits, so production calibrations hold the start of
// combustion a few degrees before TDC. That limit is a calibration constant, stated here, not fitted.
//
// What is NOT burned into work goes down the exhaust (exhaustGasT), and that is the second half: it
// pushes the exhaust toward the turbine's material limit, and the ECU stops adding fuel there
// (dieselLambdaFloor). Neither half needs a shape asserted.
//
// Anchored at 2000 rpm, where the diesel type constants (ENGINE_TYPE.diesel.imep) were calibrated,
// so the low-speed figures do not move: the factor is efficiency relative to that point.
const BURN_T_CI=0.0025;     // s — DI diesel full-load burn, injection + mixing-controlled (Heywood ch. 10)
const SOC_CI=-6;            // crank degrees — start of combustion, held near TDC by peak pressure / NOx
const WIEBE_A=5, WIEBE_M=2;
const BURN_REF_RPM=2000;
const ROD_RATIO=3.2;
// Chamber volume in clearance volumes, against degrees after TDC. A piston follows the crank-slider;
// a Wankel chamber goes TDC to BDC over 270 degrees of eccentric shaft, near-sinusoidally.
const pistonVol=(th,cr)=>{const t=th*Math.PI/180,s=Math.sin(t);
  return 1+(cr-1)*((1-Math.cos(t))+ROD_RATIO-Math.sqrt(ROD_RATIO*ROD_RATIO-s*s))/2;};
const wankelVol=(th,cr)=>1+(cr-1)*(1-Math.cos(Math.PI*clamp(th,-270,270)/270))/2;
function wiebePhasingEff(durDeg,socDeg,cr,volFn){
  const g=1.30, Vt=th=>(volFn||pistonVol)(th,cr);
  const N=120;let e=0,xp=0;
  for(let i=1;i<=N;i++){
    const x=1-Math.exp(-WIEBE_A*Math.pow(i/N,WIEBE_M+1));
    e+=(x-xp)*(1-Math.pow(cr/Vt(socDeg+durDeg*(i-0.5)/N),1-g));xp=x;
  }
  return e/(1-Math.pow(cr,1-g));   // relative to all the heat released at TDC
}
// Tabulated per build (it depends only on rpm and compression ratio), since calcAtRpm is hot.
// ---- the rotary's slow burn, and where its heat goes ----
// A Wankel chamber is long and thin and moving, and its flame has to cross it: published combustion
// runs 120-140 degrees of eccentric shaft, roughly constant from 3000 to 6000 rpm (a turbulent flame,
// like a piston SI engine's — so a fixed ANGLE, not a fixed time), with best torque at CA50 35-40
// degrees after TDC. A piston SI engine burns in ~50 crank degrees with CA50 near 8 ATDC (Heywood).
// On their own volume curves that phasing is worth 0.86 of the ideal expansion work on the rotary
// against 0.96 on the piston: about a tenth of the cycle's work is never done.
//
// The rotary's torque already carries that loss — it is part of what its measured type constant
// (ENGINE_TYPE.rotary.imep 0.70) absorbs. What was missing is where the heat GOES: work not done in
// expansion is still in the gas when the port opens. So the difference is routed to the exhaust, as
// the diesel's late burn is (exhaustHeatFrac). None of the burn outlasts exhaust-port opening (195
// ATDC on a 13B peripheral port), so this is late phasing, not burning in the port.
// Sources: Vorraro, Turner & Akehurst, SAE 2022-01-0591 (burn duration); hydrogen dual-spark Wankel
// study, MBT at CA50 35-40 ATDC. Rotary CA50 taken mid-range, 37.5; burn 130.
const ROTARY_BURN_DEG=130, ROTARY_CA50=37.5, SI_BURN_DEG=50, SI_CA50=8;
const wiebeX50=()=>Math.pow(Math.log(2)/WIEBE_A,1/(WIEBE_M+1));   // fraction of the burn at 50% mass
function rotaryLostWork(cr){
  const x50=wiebeX50();
  const rot=wiebePhasingEff(ROTARY_BURN_DEG,ROTARY_CA50-x50*ROTARY_BURN_DEG,cr,wankelVol);
  const pis=wiebePhasingEff(SI_BURN_DEG,SI_CA50-x50*SI_BURN_DEG,cr,pistonVol);
  return Math.max(0,1-rot/pis);       // share of the piston-referenced work the rotary does not do
}
function buildBurnTable(){
  const e=engine;
  e.burnTab=null;
  e.rotaryLost=e.type==='rotary'?rotaryLostWork(e.compression):0;
  if(!e.ci)return;
  const ref=wiebePhasingEff(6*BURN_REF_RPM*BURN_T_CI,SOC_CI,e.compression),tab=[];
  for(let r=0;r<=e.redline*1.3+200;r+=100)tab.push(wiebePhasingEff(6*Math.max(r,300)*BURN_T_CI,SOC_CI,e.compression)/ref);
  e.burnTab=tab;
}
function burnPhasing(rpm){
  const t=engine.burnTab;
  if(!t)return 1;
  const f=clamp(rpm/100,0,t.length-1.001),i=Math.floor(f);
  return t[i]+(t[i+1]-t[i])*(f-i);
}
// The ECU's full-load fuel limit. Richer than the smoke limit the extra fuel only makes soot, and on
// a turbo diesel it may not push the gas at the turbine past what the vanes (or wheel) survive —
// VANE_T_LIMIT, the same figure the reliability score already warns on. Solved from the exhaust
// energy balance in closed form: T = 300 + LHV/(AFR cp) * f_exh at full load, so
//     lambda_min = LHV f_exh / (AFR_stoich cp (T_lim - 300)).
// At low rpm this sits below the smoke limit and changes nothing; at high rpm the late burn raises
// f_exh, and the floor rises with it.
// The smoke limit: the richest a diesel can be fuelled before the fuel cannot find air in the time it
// has, and comes out as soot. A modern common-rail engine at full load sits at lambda 1.15-1.25
// (Bosch, Diesel-Engine Management). This used to be 1.02, which only worked because torque was taken
// from AIR times a fitted constant: the model needed 20% more fuel than a real engine to make a real
// engine's torque, and its exhaust-temperature model (which assumed a realistic lambda) never agreed
// with the mixture actually burned.
const SMOKE_LAMBDA_CI=1.20;
// The governor (build 172). A diesel has no throttle on its air and nothing in its combustion that stops it short of
// the speed at which friction eats its fuel, so every diesel carries a governor: from its RATED speed (the breakpoint,
// where it makes its rated power) to its governed maximum (high idle, the most it will turn with no load) the fuel at
// full pedal is taken away in proportion to the speed, until at the maximum it is only what holds the engine there
// unloaded (Bosch, Governors for Inline Injection Pumps; Cummins: the breakpoint is where the governor 'begins to
// reduce torque below the rated power value', the span to high idle its droop). An electronic diesel does the same in
// its fuel map. The rated speed is the maker's (GM's L5P: 2800 rpm rated, 3450 maximum powered speed) and the governed
// maximum is the engine's own limit, its redline here. Without it this model fuelled a diesel at its smoke limit to
// the redline and made peak power there, which a diesel never does: the Cummins's 400 hp at 2800 came out as 550 at
// 3500, and every other diesel carried a boost taper, solved to its rating, in its place.
//     q(N) = q_full x (1 - x (1 - phi0)),   x = (N - N_rated) / (N_max - N_rated)
// phi0 is the share of the full fuel whose work only meets friction, pumping and the alternator at N_max: the engine's
// own brake torque there is zero. Solved on the torque itself (the leaner mixture burns a little more efficiently, so
// work is not quite in proportion to fuel), by bisection, once per build.
function govPhi0(){
  const e=engine;
  if(e.govPhi0>0)return e.govPhi0;
  if(e.govSolving)return 1;
  const rl=e.redline;let lo=0.002,hi=1,ok=true;
  e.govSolving=true;
  try{
    for(let i=0;i<32;i++){
      e.govPhi0=(lo+hi)/2;
      const T=brakeTorqueRaw(rl,wotMapAt(rl),false);
      if(!Number.isFinite(T)){ok=false;break;}
      if(T>0)hi=e.govPhi0;else lo=e.govPhi0;
    }
  }catch(err){ok=false;}finally{e.govSolving=false;}
  // early in buildEngine the engine is half set: no governor until it is whole, and nothing cached
  if(!ok){e.govPhi0=null;return 1;}
  e.govPhi0=(lo+hi)/2;return e.govPhi0;
}
function govFuelFrac(rpm){
  const e=engine,g0=e.govRpm||0;
  if(!e.ci||!(g0>0)||g0>=e.redline||rpm<=g0||e.govBusy)return 1;
  if(!(e.govPhi0>0)&&e.govSolving)return 1;
  const x=clamp((rpm-g0)/(e.redline-g0),0,1);
  return 1-x*(1-govPhi0());
}
function dieselLambdaFloor(rpm){
  const e=engine;
  if(!e.ci)return 0;
  return dieselLambdaFull(rpm)/govFuelFrac(rpm);   // less fuel in the same air: a leaner mixture
}
// the leanest a diesel is fuelled at full pedal before the governor: its smoke limit, or its turbine's
function dieselLambdaFull(rpm){
  const e=engine;
  if(e.intake!=='turbo')return SMOKE_LAMBDA_CI;
  // T = 300 + LHV f / ((AFR_st lam + 1) cp), and f itself moves with lam (a leaner diesel works its
  // fuel harder), so solve by fixed point from the smoke limit: three steps settle it to <0.1%.
  let lam=SMOKE_LAMBDA_CI;
  for(let i=0;i<4;i++){
    // against the GAS temperature, not the probe's: see peakEgt for why the vanes follow the mass average
    const f=exhaustHeatFrac(rpm,lam);
    lam=Math.max(SMOKE_LAMBDA_CI,((e.fuelLHV||44)*1e6*f/(CP_EXH*(VANE_T_LIMIT-300))-1)/(e.stoichAFR||14.5));
  }
  return lam;
}
// ---- A diesel's torque, from the fuel it burns ----
// Every other engine here takes IMEP from AIR: IMEP_K x typeImep x map x VE x a mixture factor, a
// correlation calibrated on spark engines. A diesel used it too, with typeImep = 1.02 and its own
// mixture anchor, and that is what forced the lambda 1.02 above: to make 320 Nm from the air a real
// TDI has, the correlation needed the fuel of lambda 1.05.
//
// A diesel is quality-governed — torque IS fuel quantity — so here it is computed as exactly that:
//     gross IMEP = eta_gross x (m_fuel x LHV) / V_d,     m_fuel = m_air / (lambda x AFR_st)
// with m_air the charge the cylinder actually traps (density at the valve x VE), the same mass the
// fuel-flow readout meters. The efficiency is built from the pieces this model already derives:
//   · compression ratio — the Otto efficiency ratio, as crFactor does for the spark engines;
//   · mixture — the fuel-air cycle (faEta): leaner burns more efficiently;
//   · burn phasing — the fixed-time diesel burn (burnPhasing).
// One reference figure: ETA_GROSS_CI, the gross indicated efficiency of a passenger-car DI diesel at
// full load (CR 17, lambda 1.2, 2000 rpm). Production engines run 200-210 g/kWh there, i.e. ~0.40
// brake; with ~0.88 mechanical efficiency and a little pumping work that is 0.45-0.47 gross. Taken as
// 0.46, from those published figures, not fitted to any engine in this file.
//
// GROSS, because the gas exchange is now charged separately and with its sign (pumpingMEP): the
// textbook split of the cycle, which the air correlation could not use.
const ETA_GROSS_CI=0.46, CR_REF_CI=17, LAMBDA_REF_CI=1.20;
function dieselGrossImep(rpm,map,ve){
  const e=engine,st=e.stoichAFR||14.5;
  const air=map*1e5/(287*(effIAT(map,rpm)+273.15))*ve;                 // kg of trapped air per m3 swept
  const lam=curAFR(rpm,map)/st;
  const eta=ETA_GROSS_CI*otto(e.compression)/otto(CR_REF_CI)
           *faEta(1/lam)/faEta(1/LAMBDA_REF_CI)*burnPhasing(rpm)*wallImepFactor(rpm);
  return eta*air/(lam*st)*(e.fuelLHV||42.8)*1e6/1e5;               // bar
}
// mapOverride lets the live view pass the integrated manifold pressure; the dyno omits
// it and uses wide-open throttle (steady state) at each RPM.
function calcAtRpm(rpm,mapOverride){
  const map=mapOverride!=null?mapOverride:wotMapAt(rpm);
  const {coolF,oilFrictionMult}=tempFactors(state.coolant,state.oil);
  const ve=computeVE(rpm,map);
  let imep;
  if(engine.ci){
    imep=(dieselGrossImep(rpm,map,ve)*coolF+nitrousImep())*healthFactor();
  }else{
    const ignF=sparkTimingFactor(rpm,map);
    imep=(sparkGrossImep(rpm,map,ve)*coolF*ignF*ignitionHealth(rpm)+nitrousImep())*healthFactor();
  }
  imep=dieselImepLimit(imep);          // diesel peak-cylinder-pressure / smoke ceiling

  let bmep=Math.max(0.05,imep-pumpFrictionMEP(rpm,map,oilFrictionMult));

  const Vd=engine.displacement_L/1000;
  let torque=(bmep*1e5*Vd)/engine.strokeDiv-electricalDragTorque(rpm);   // power strokes/rev per type, minus alternator load
  let powerKW=torque*rpm*2*Math.PI/60/1000;
  let powerHP=powerKW/0.7457;

  const knock=computeKnockRisk(rpm,map);
  if(knock>60){const derate=1-0.32*((knock-60)/40);powerKW*=derate;powerHP*=derate;torque*=derate;}
  return {rpm,torque,powerHP,powerKW,bmep,ve,knock,map};
}
// Raw brake torque (Nm) at an operating point — NOT floored, so it goes negative under
// vacuum (engine braking). fuelCut zeroes combustion for the rev limiter / overrun.
function brakeTorqueRaw(rpm,map,fuelCut){
  const {coolF,oilFrictionMult}=tempFactors(state.coolant,state.oil);
  let imep=0;
  if(!fuelCut){
    const ve=computeVE(rpm,map);
    if(engine.ci)imep=(dieselGrossImep(rpm,map,ve)*coolF+nitrousImep())*healthFactor();
    else{
      const ignF=sparkTimingFactor(rpm,map);
      imep=(sparkGrossImep(rpm,map,ve)*coolF*ignF*ignitionHealth(rpm)+nitrousImep())*healthFactor();
    }
    imep=dieselImepLimit(imep);
    const knock=computeKnockRisk(rpm,map);
    if(knock>60)imep*=1-0.32*((knock-60)/40);
  }
  const bmep=imep-pumpFrictionMEP(rpm,map,oilFrictionMult);
  return (bmep*1e5*(engine.displacement_L/1000))/engine.strokeDiv-electricalDragTorque(rpm);
}
// Advance the turbo's actual boost toward what it can make at the current RPM (spool lag).
// Spool is the shaft equation of motion, integrated as ENERGY rather than angular velocity.
// dw/dt = P/(J.w) is singular at rest — at 500 shaft rpm a 5 kW imbalance is 3e6 rad/s^2, which no
// explicit integrator survives. E = 1/2.J.w^2 gives dE/dt = P_net and w = sqrt(2E/J), with no
// division by w anywhere: a stationary shaft simply has E = 0 and gains energy. That formulation
// replaces spoolK, the fitted lag rate.
// One step of the turbo shaft, as a pure function of its own state. Shared by the live engine and
// by simulateAccel, so the two cannot drift apart — the acceleration solver having its own idea of
// spool is exactly the kind of divergence that took two bugs to find last time.
function advanceShaft(shaftE,rpm,boostNow,throttle,dt,hMax=0.002){
  const J=engine.shaftJ;
  if(!J)return{shaftE:0,boost:boostAvail(rpm)};
  const wMax=engine.shaftMax*2*Math.PI/60, Emax=0.5*J*wMax*wMax;
  const th=clamp(throttle,0,1);
  // Load for exhaust TEMPERATURE is throttle, not manifold pressure over its boosted maximum.
  // map/mapMax made a turbo at wide open throttle that has not spooled read as 29% load — cold
  // exhaust, weak turbine, never spools. Same bootstrap shape as taking the turbine's expansion
  // ratio from the compressor's: the thing needed to start the process derived from the process
  // having started.
  const T3=exhaustGasT(clamp(th,0.3,1.1),rpm);
  const sub=Math.max(1,Math.ceil(dt/hMax));   // the shaft is faster than the vehicle; sub-step it
  const h=dt/sub;
  let E=clamp(shaftE,0,Emax), b=clamp(boostNow,0,boostTarget(rpm));
  // Charge-system fill (see bearingCoeff's neighbour): only while boost is climbing, so a lit launch
  // pays nothing; the air to raise the charge volume from b to b2 costs the compressor's work per kg.
  const V=engine.chargeVol||0, T01=(state.iat!=null?state.iat:20)+273.15;
  for(let k=0;k<sub;k++){
    const n=Math.sqrt(2*E/J)*60/(2*Math.PI);
    // Closing the throttle throttles BOTH sides. Cooling the exhaust while leaving the compressor
    // swallowing full airflow makes a lift actively BRAKE the shaft rather than let it coast.
    // The compressor draws AMBIENT air. This passed the charge temperature after the compressor and the
    // intercooler as its inlet, so a build with no intercooler paid ~25% extra compressor work on every
    // spool — enough to hide the larger fill a front-mount core really costs.
    const r=shaftNetPower(n,airFlowAt(rpm,1+b)*Math.max(0.08,th),T3,T01,rpm);
    const loss=shaftLossPower(n);
    // Boost is the pressure in the charge volume, so it is a STATE, not a readout of shaft speed. It
    // rises when the shaft supports more, and pays the fill energy below for the air that takes. It
    // FALLS only as fast as the engine empties the volume: tau = (air held) / (air swallowed). Letting
    // it fall instantly with every dip in shaft speed, and charging the refill each time, burned
    // energy in a loop — with a real-sized charge volume that stalled spool above 1 bar.
    const bShaft=clamp(r.pr-1,0,boostTarget(rpm));
    let b2=bShaft;
    if(bShaft<b){
      const Tch=effIAT(1+b,rpm)+273.15, held=V*(1+b)*1e5/(287*Tch), swallow=Math.max(1e-4,airFlowAt(rpm,1+b)*Math.max(0.08,th));
      b2=bShaft+(b-bShaft)*Math.exp(-h*swallow/Math.max(1e-6,held));
    }
    const dB=Math.max(0,b2-b);
    const pr=1+0.5*(b+b2), dm=V*dB*1e5/(287*(effIAT(pr,rpm)+273.15));
    const fill=dm*1005*T01*(Math.pow(pr,0.286)-1)/clamp(r.eta||0.7,0.3,0.85);
    E=clamp(E+(r.net-loss)*h-fill,0,Emax);
    b=b2;
  }
  return{shaftE:E,boost:b};
}
function stepBoost(dt){
  if(engine.intake!=='turbo'||!engine.shaftJ){state.boostActual=boostAvail(state.rpm);return;}
  if(state.shaftE==null)state.shaftE=0;
  const r=advanceShaft(state.shaftE,state.rpm,state.boostActual,
                       state.throttle!=null?state.throttle:1,dt);
  state.shaftE=r.shaftE;state.boostActual=r.boost;
}
// Target manifold pressure from throttle opening, RPM and available boost.
function mapTarget(){
  const Pup=1.0+state.boostActual;                       // upstream pressure (atmo + boost)
  const tArea=IDLE_AIR+(1-IDLE_AIR)*Math.pow(state.throttle,1.2);
  const frac=tArea/(tArea+THR_K*(state.rpm/1000)*(1-tArea));
  return clamp(Pup*frac,0.12,Pup);
}
// Steady manifold pressure (bar abs) at an rpm and a share of full-throttle torque, for the live-timing
// boost gauge (build 112). The charge, and so the torque, scales with manifold pressure, so a share thr
// of full-throttle drive wants thr of the full-throttle pressure, 1 + boostAvail(rpm). It cannot fall
// below what a closed throttle holds against the engine's pumping (mapTarget's own throttle law, with
// the turbo's blow-off open: atmosphere upstream). A diesel has no throttle plate: its manifold stays at
// atmosphere and only the boost follows the fuelling. Steady boost: simulateLap caps it with the boost
// the turbo's shaft has actually built at each point (build 118).
function steadyMapAt(rpm,thr){
  const b=boostAvail(rpm),t=clamp(thr,0,1);
  if(engine.ci)return 1+b*t;
  const closed=Math.max(0.12,IDLE_AIR/(IDLE_AIR+THR_K*(rpm/1000)*(1-IDLE_AIR)));   // mapTarget's floor
  return Math.max(closed,t*(1+b));
}
// Deceleration (overrun) fuel cut-off: on a closed throttle above idle, an injection system
// cuts fuel entirely (no combustion, zero fuel flow) — saves fuel and adds engine braking.
function overrunFuelCut(){
  return engine.canDFCO&&state.throttle<0.03&&state.rpm>engine.idleRpmEff+150;
}
// LOAD as a dyno brake targeting a hold-RPM: it only resists ABOVE that target, so the
// engine can always rev up to it (no getting trapped below a torque valley). load 0 →
// target = redline (free-rev to the limiter); load 1 → target = idle.
function brakeTorque(){
  if(state.load<=0.001)return 0;
  const target=engine.redline-state.load*(engine.redline-engine.idleRpmEff);
  const over=state.rpm-target;
  return over>0?Math.min(over*engine.brakeGain,engine.loadRefTq*3):0;
}
// Integrate the dynamic engine: spool → manifold fill → net torque → RPM via inertia.
function stepEngine(dt){
  if(isElectric())return stepMotorBench(dt);
  if(isHybrid())return stepHybridBench(dt);   // the motor, the pack and the controller with the engine (build 190)
  stepBoost(dt);
  state.map+=(mapTarget()-state.map)*(1-Math.exp(-MAP_K*engine.intakeRespK*dt));
  if(state.nitrousActive){   // deplete the bottle while spraying at WOT (~14 s per fill)
    if(state.throttle>0.5&&state.nitrousCharge>0)state.nitrousCharge=Math.max(0,state.nitrousCharge-0.07*dt);
    if(state.nitrousCharge<=0)state.nitrousActive=false;
  }
  const cut=state.rpm>=engine.redline||overrunFuelCut();
  // On a closed throttle with the fuel cut this is the engine braking itself: friction and pumping against the
  // vacuum the plate holds (build 149). A fitted 0.14-0.44 x the reference torque was subtracted on top of it, 2-6
  // times the engine's own figure, and on a turbo engine it scaled with the boosted torque: a 2.0 turbo was
  // braking with ~14 bar, which a closed throttle cannot hold.
  let tq=brakeTorqueRaw(state.rpm,state.map,cut);
  tq-=brakeTorque();
  const omega=state.rpm*2*Math.PI/60+tq/engine.inertia*dt;
  state.rpm=clamp(omega*60/(2*Math.PI),engine.idleRpmEff,engine.redline);
}
// Integrate the battery: charge when the alternator out-supplies demand, drain otherwise.
// System voltage tracks state of charge; a flat battery weakens the spark (see ignVFactor).
function stepElectrical(dt){
  if(isElectric()||isHybrid())return;   // no alternator: the traction pack is the bench's (stepMotorBench, stepHybridBench)
  const netA=altOutputA(state.rpm)-elecDemandA();
  state.batterySOC=clamp(state.batterySOC+netA*dt*0.0004,0,1);
  const charging=netA>0&&state.batterySOC<0.999;
  state.systemVoltage=clamp(11.4+1.6*state.batterySOC+(charging?0.6:0),10.5,14.4);
}
// ---- Reliability / wear ----
// A worn engine makes less power (down on compression, more friction). Health drops fast
// under detonation, overheat, lean-under-boost, and over-rev — the things that really kill
// engines. A clean tune barely wears. At zero health the engine lets go (rebuild = BUILD).
function healthFactor(){return state.blown?0:(0.5+0.5*state.engineHealth);}
function stepWear(dt){
  if(isElectric())return stepMotorWear(dt);
  if(!wearEnabled){state.engineHealth=1;state.blown=false;state.wearCause='';return;}  // invincible
  if(state.blown)return;   // stays dead until rebuilt; keep the cause that killed it
  const lam=state.afr/engine.stoichAFR;
  let w=0,worst=0,cause='';
  const add=(a,label)=>{if(a>0){w+=a;if(a>worst){worst=a;cause=label;}}};
  add(state.knockRisk>55?(state.knockRisk-55)/45*0.060:0,'DETONATION');          // knock is the big killer
  add(state.coolant>112?(state.coolant-112)/18*0.030:0,'OVERHEAT');
  add(state.oil>132?(state.oil-132)/22*0.025:0,'OIL TEMP');
  add(state.rpm>engine.redline*0.985?0.006:0,'OVER-REV');
  if(!engine.ci)add(Math.max(0,lam-1.05)*Math.max(0,state.map-0.9)*0.14,'LEAN/BOOST');  // burnt pistons (diesels run lean by design)
  if(engine.ci)add(state.emPM>35?(state.emPM-35)/40*0.020:0,'OVER-FUEL/EGT');     // diesel: over-fuelling → soot & heat
  add(state.oil<55&&state.powerHP>15?0.004:0,'COLD-OIL');
  add(nitrousImep()>0?0.011:0,'NITROUS');                                        // nitrous stresses everything
  add(engine.antilag&&state.rpm>2500?0.004:0,'ANTI-LAG');                        // ALS cooks the turbo/exhaust
  w+=0.000006;   // baseline fatigue (negligible — hours of clean running)
  state.engineHealth=clamp(state.engineHealth-w*dt,0,1);
  state.wearCause=worst>0.001?cause:'';
  if(state.engineHealth<=0){state.blown=true;state.engineHealth=0;state.wearCause=cause||'FAILURE';}
}
// ---- Emissions: engine-out CO / HC / NOx vs mixture & combustion temperature, then a
// three-way catalytic converter that only cleans efficiently in a narrow window around
// stoich. Stored on state for the analyser display; also fed a 0-100 cleanliness rating.
//   CO  — incomplete combustion: high when RICH (no O2), near-zero at/above stoich.
//   HC  — unburned fuel: U-shaped — high rich (excess fuel) AND very lean (misfire), plus
//         cam-overlap scavenging, imprecise metering (carbs) and a cold engine.
//   NOx — thermal: peaks slightly LEAN (~λ1.08, hot + excess O2), scaling with combustion
//         temperature (load, compression, spark advance, hot charge/chamber).
// The cat needs excess O2 to oxidise CO/HC (works stoich→lean) but a reducing, O2-free
// exhaust to reduce NOx (works stoich→rich) — so only stoich cleans all three at once.
function computeEmissions(){
  const map=liveMap(),lam=state.afr/engine.stoichAFR;
  const load=clamp((state.rpm-800)/(engine.redline-800),0,1)*0.5+clamp((map-0.3)/(engine.mapMax-0.3),0,1)*0.5;
  const adv=activeAdvance(state.rpm,map),mbt=mbtAdvance(state.rpm,map);
  const tempF=clamp(0.4+load*0.9+Math.max(0,engine.compression-9)*0.05
    +Math.max(0,effIAT(map,state.rpm)-30)*0.006+Math.max(0,adv-mbt+8)*0.010
    +Math.max(0,state.coolant-90)*0.004,0.2,2.4);
  const cold=state.coolant<60?(60-state.coolant)/60:0;
  const meterSlop=1-engine.meteringEff;   // carbs/mech injection run imprecise & rich
  // Engine-out pollutants differ sharply by cycle. PM (soot) is a diesel-specific pollutant.
  let coEO,hcEO,noxEO,pmEO=0;
  if(engine.ci){
    // Diesel: lean CI. Low CO/HC, high thermal NOx, and soot (PM) that climbs toward the
    // smoke limit (λ→1, lots of fuel in little excess air) and with imprecise metering.
    const fuelling=clamp((1.7-lam)/1.0,0,1);           // ~0 very lean, ~1 near smoke limit
    coEO =3+fuelling*9;
    hcEO =2+fuelling*6+cold*20;
    noxEO=8+130*clamp(tempF*0.62,0,1.4);               // hot lean flame → lots of NOx
    pmEO =2+Math.pow(fuelling,1.6)*80+meterSlop*30;    // black smoke near full fuelling
  }else if(engine.type==='twostroke'){
    coEO =6+Math.max(0,1.0-lam)*260+meterSlop*120;
    hcEO =42+Math.max(0,1.0-lam)*120+engine.typeBsfc*18;   // oil burning + short-circuit scavenging → very high HC
    noxEO=2+42*Math.exp(-Math.pow((lam-1.08)/0.13,2))*tempF;
  }else if(engine.type==='rotary'){
    coEO =6+Math.max(0,1.0-lam)*300+meterSlop*120;
    hcEO =26+Math.max(0,1.0-lam)*120+Math.max(0,lam-1.06)*200;   // apex-seal leakage → high HC
    noxEO=2+55*Math.exp(-Math.pow((lam-1.08)/0.12,2))*tempF;
  }else{
    coEO =4+Math.max(0,1.0-lam)*300+meterSlop*140;
    hcEO =3+Math.max(0,1.0-lam)*95+Math.max(0,lam-1.06)*280+Math.max(0,engine.overlap||0)/90*0.08*130+meterSlop*70+cold*45;
    noxEO=2+100*Math.exp(-Math.pow((lam-1.08)/0.11,2))*tempF;
  }
  if(state.fuelCut){coEO=Math.min(coEO,1);hcEO=Math.min(hcEO,2);noxEO=Math.min(noxEO,1);pmEO=0;}
  // Aftertreatment. Diesel uses DOC (CO/HC) + DPF (PM) always, plus SCR (NOx) on the full
  // "stock" system; a spark engine's three-way cat only works in the stoich window.
  let oxEff,redEff,pmEff=0;
  if(engine.ci){
    const hot=state.coolant<50?0.3:1;
    oxEff =engine.catConv*hot;                       // DOC oxidises CO/HC
    pmEff =engine.catConv*hot;                       // DPF traps soot
    redEff=(engine.cat==='stock'?0.9:0)*hot;         // SCR reduces NOx (full system only)
  }else{
    const w=Math.exp(-Math.pow((lam-1.0)/0.02,2));
    const leanO2=clamp((lam-1.0)/0.05,0,1),richRed=clamp((1.0-lam)/0.05,0,1);
    const litoff=state.coolant<50?0.25:1;
    oxEff =engine.catConv*litoff*Math.max(w,leanO2*0.85);
    redEff=engine.catConv*litoff*Math.max(w,richRed*0.85);
  }
  state.emCO=coEO*(1-oxEff);state.emHC=hcEO*(1-oxEff);state.emNOx=noxEO*(1-redEff);state.emPM=pmEO*(1-pmEff);
  // Cleanliness rating 0-100 (higher = cleaner): saturating penalties per pollutant, weighted
  // to each cycle's signature (diesel = NOx + soot; spark = CO/HC/NOx).
  const coBad=clamp(state.emCO/40,0,1),hcBad=clamp(state.emHC/25,0,1),noxBad=clamp(state.emNOx/70,0,1),pmBad=clamp(state.emPM/45,0,1);
  if(engine.ci)state.emRating=Math.round(clamp(100-(coBad*14+hcBad*12+noxBad*36+pmBad*34),0,100));
  else state.emRating=Math.round(clamp(100-(coBad*38+hcBad*30+noxBad*32),0,100));
  return state.emRating;
}
function updatePhysics(){
  if(isElectric())return;   // the bench step does it (stepMotorBench)
  if(isHybrid())return hybUpdatePhysics(updateEnginePhysics);   // at the engine's own throttle, or off (build 190)
  updateEnginePhysics();
}
function updateEnginePhysics(){
  const map=liveMap();
  // AUTO (ECU MAP) mode: the ECU sets the live mixture from its load×rpm map, so the AFR
  // readout, fuel flow, emissions and wear all reflect the mapped value.
  if(engine.afrMode==='auto')state.afr=mappedAFR(state.rpm,map);
  computeEmissions();
  state.fuelCut=overrunFuelCut()||state.rpm>=engine.redline;
  const r=calcAtRpm(state.rpm,map);
  state.torque=r.torque;state.powerKW=r.powerKW;state.powerHP=r.powerHP;
  state.bmep=r.bmep;state.ve=r.ve;state.knockRisk=r.knock;

  if(state.fuelCut){   // overrun / limiter fuel cut → no fuel burned, engine braking
    state.fuelFlowLph=0;state.bsfc=999;state.thermalEff=0;
    if(state.rpm<engine.redline){state.torque=Math.min(0,brakeTorqueRaw(state.rpm,map,true));state.powerKW=state.torque*state.rpm*2*Math.PI/60/1000;state.powerHP=state.powerKW/0.7457;}
    return;
  }
  const T_k=effIAT(map,state.rpm)+273.15,MAP_pa=map*1e5,Vd=engine.displacement_L/1000;
  const airMass_kg_s=(MAP_pa*Vd*(state.rpm/60)*engine.chargesPerRev*state.ve)/(287*T_k);
  // Imprecise metering (carbs / mechanical injection) wastes fuel; the cycle's thirst factor
  // (typeBsfc) captures combustion/scavenging losses — a 2-stroke short-circuits fresh charge
  // out the exhaust (>1, thirsty). A diesel is 1: its torque is computed from this same fuel.
  const meteredFuel=(airMass_kg_s/curAFR(state.rpm,map))/engine.meteringEff*engine.typeBsfc;
  state.fuelFlowLph=(meteredFuel*3600)/engine.fuelDensity;
  const fuelPower=meteredFuel*engine.fuelLHV*1e6/1000;
  state.thermalEff=fuelPower>0.1?clamp((state.powerKW/fuelPower)*100,0,46):0;
  state.bsfc=state.powerKW>0.5?(meteredFuel*3600*1000)/state.powerKW:999;
}
function getDynoData(){
  if(isElectric())return motorDynoData();
  const key=[buildRev,state.afr.toFixed(1),state.iat,Math.round(state.coolant),Math.round(state.oil)].join('|');
  if(dynoCache&&dynoCacheKey===key)return dynoCache;
  const pts=[],rMax=engine.redline,step=Math.max(50,Math.round((rMax-1000)/70/50)*50);
  for(let rpm=1000;rpm<=rMax;rpm+=step)pts.push(calcAtRpm(rpm));
  dynoCache=pts;dynoCacheKey=key;return pts;
}

