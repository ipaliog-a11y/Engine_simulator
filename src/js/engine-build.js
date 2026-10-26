// ---- Build: read the design spec and precompute derived characteristics ----
function readEngineFromForm(){
  const g=id=>document.getElementById(id);
  const intake=g('edIntake').value;
  const type=g('edType').value, tp=ENGINE_TYPE[type]||ENGINE_TYPE.petrol4;
  const maxCyl=(ENGINE_TYPE[type]||ENGINE_TYPE.petrol4).maxCyl||12;   // rotary 4 rotors, 2-stroke 6 cylinders
  let fuel=g('edFuel').value;
  if(tp.ci)fuel='diesel'; else if(fuel==='diesel')fuel='gasoline';   // fuel follows the cycle
  const e={
    type,
    cylinders:clamp(Math.round(+g('edCyl').value||4),1,maxCyl),
    bore_mm:clamp(+g('edBore').value||86,60,110),
    stroke_mm:clamp(+g('edStroke').value||86,50,130),   // to 130: a Cummins 6.7 is 107 x 124
    ecc_mm:clamp(+g('edEcc').value||15,8,25),           // rotary only: crank throw of the eccentric shaft
    compression:clamp(+g('edCR').value||tp.crDef,tp.crMin,tp.crMax),
    layout:type==='rotary'?'rotary':g('edLayout').value,
    redline:clamp(Math.round(+g('edRedline').value||tp.redlineDef),tp.redMin,tp.redMax),
    intake,
    boost_bar:intake==='na'?0:clamp(+g('edBoost').value||0,0,2.5),
    taperRpm:clamp(Math.round(+g('edTaperRpm').value||0),0,12000),taperPct:clamp(+g('edTaperPct').value||100,20,100),
    // a diesel's rated speed, where its governor starts to take the fuel away (build 172); 0 = no governor
    govRpm:clamp(Math.round(+g('edGovRpm').value||0),0,8000),
    tqLimit:clamp(Math.round(+g('edTqLimit').value||0),0,5000),
    intercooler:g('edIntercooler').value,
    turboSize:g('edTurboSize').value,compExd_mm:clamp(+g('edCompWheel').value||0,0,110),
    turboConfig:g('edTurboConfig').value,
    vgt:g('edVGT').value==='yes',housing:g('edHousing').value,
    antilag:g('edAntilag').value==='yes',
    scType:g('edScType').value,
    nitrous:g('edNitrous').value,
    exhaust:g('edExhaust').value,
    cat:g('edCat').value,
    intakeSys:g('edIntakeSys').value,
    airFilter:g('edAirFilter').value,
    cam:g('edCam').value,
    runner:g('edRunner').value,
    vvt:g('edVVT').value==='yes',
    valves:clamp(Math.round(+g('edValves').value||4),2,5),
    valveMat:g('edValveMat').value,
    valveSpring:g('edSpring').value,
    fuel,
    octane:clamp(Math.round(+g('edOctane').value||95),87,110),
    injector:g('edInjector').value,
    ignitionAdv:clamp(Math.round(+g('edIgnAdv').value||22),5,40),
    ignitionType:g('edIgnType').value,
    timingMode:g('edTiming').value,
    afrMode:g('edAfrMode').value,
    radiator:g('edRadiator').value,
    fan:g('edFan').value,
    oilCooler:g('edOilCooler').value==='yes',
    thermostat:clamp(Math.round(+g('edThermostat').value||88),71,95),
    alternator:g('edAlternator').value
  };
  if(type==='electric')Object.assign(e,readElectricFromForm());   // the motor and battery (build 179)
  return e;
}
function applyEngineToForm(e){
  const g=id=>document.getElementById(id);
  g('edType').value=e.type||'petrol4';
  g('edCyl').value=e.cylinders;g('edLayout').value=(e.layout==='rotary'?'inline':e.layout);g('edBore').value=e.bore_mm;
  g('edStroke').value=e.stroke_mm;g('edCR').value=e.compression;g('edRedline').value=e.redline;
  // Builds saved before the eccentricity existed: every production Mazda rotor has R/e = 7.
  g('edEcc').value=e.ecc_mm||+(e.bore_mm/7).toFixed(1);
  // Migrate legacy boolean intercooler (true→large, false→none) from older saved builds.
  g('edIntake').value=e.intake;g('edBoost').value=e.boost_bar;g('edTaperRpm').value=e.taperRpm||0;g('edTaperPct').value=e.taperPct!=null?e.taperPct:100;g('edTqLimit').value=e.tqLimit||0;g('edGovRpm').value=e.govRpm||0;
  g('edIntercooler').value=(e.intercooler===true?'large':e.intercooler===false?'none':(e.intercooler||'large'));
  g('edTurboSize').value=e.turboSize||'medium';g('edCompWheel').value=e.compExd_mm||0;
  g('edTurboConfig').value=e.turboConfig||'single';g('edVGT').value=e.vgt?'yes':'no';g('edHousing').value=e.housing||'stock';
  g('edAntilag').value=e.antilag?'yes':'no';
  g('edScType').value=e.scType||'roots';g('edNitrous').value=e.nitrous||'none';
  g('edIntakeSys').value=e.intakeSys||'efi';g('edAirFilter').value=e.airFilter||'stock';
  g('edRunner').value=e.runner||'medium';g('edCam').value=e.cam||'stock';g('edVVT').value=e.vvt?'yes':'no';
  g('edValves').value=String(e.valves||4);g('edValveMat').value=e.valveMat||'steel';
  g('edSpring').value=e.valveSpring||'stock';
  g('edFuel').value=e.fuel||'gasoline';
  g('edExhaust').value=e.exhaust;g('edCat').value=e.cat||'stock';g('edOctane').value=e.octane;g('edInjector').value=e.injector;
  g('edIgnAdv').value=e.ignitionAdv;g('edIgnType').value=e.ignitionType;g('edTiming').value=e.timingMode||'fixed';g('edAfrMode').value=e.afrMode||'fixed';
  g('edRadiator').value=e.radiator||'stock';g('edFan').value=e.fan||'electric';
  g('edOilCooler').value=e.oilCooler?'yes':'no';g('edThermostat').value=e.thermostat||88;
  g('edAlternator').value=e.alternator||'120';
  applyElectricToForm(e);
  syncDesignEnable();
}
function syncDesignEnable(){
  if(syncElectricSections())return;   // an electric build has its own sections (build 179)
  const g=id=>document.getElementById(id);
  const type=g('edType').value, tp=ENGINE_TYPE[type]||ENGINE_TYPE.petrol4;
  // Diesel is compression-ignition (no spark, runs on diesel); 2-stroke & rotary use ports
  // (no poppet valvetrain); rotary has rotors, not a bank layout.
  if(tp.ci)g('edFuel').value='diesel'; else if(g('edFuel').value==='diesel')g('edFuel').value='gasoline';
  g('lblCyl').textContent=tr(type==='rotary'?'ROTORS':'CYLINDERS');
  g('lblBore').textContent=tr(type==='rotary'?'ROTOR R (mm)':'BORE (mm)');
  g('lblStroke').textContent=tr(type==='rotary'?'ROTOR W (mm)':'STROKE (mm)');
  g('edLayout').disabled=type==='rotary';
  g('edEcc').disabled=type!=='rotary';
  // Cylinder / rotor count is capped per type: production Wankels top out at four rotors (Mazda
  // 26B) and two-strokes at six cylinders. Counts above the cap are shown disabled rather than
  // silently clamped at build time, which used to turn a 12-rotor choice into 3 with no word said.
  const maxCyl=tp.maxCyl||12, cylSel=g('edCyl');
  [...cylSel.options].forEach(o=>{o.disabled=+o.value>maxCyl;});
  if(+cylSel.value>maxCyl)cylSel.value=String(Math.min(maxCyl,4));
  g('edFuel').disabled=tp.ci;                              // diesel fuel is fixed
  g('edGovRpm').disabled=!tp.ci;                           // a governor is a diesel's (build 172)
  // Boost / intercooler only matter for forced induction; turbo size only for turbos.
  const intake=g('edIntake').value,na=intake==='na';
  g('edBoost').disabled=na;g('edTaperRpm').disabled=na;g('edTaperPct').disabled=na;g('edTqLimit').disabled=na;
  g('edIntercooler').disabled=na;
  const turbo=intake==='turbo';
  g('edTurboSize').disabled=!turbo;g('edCompWheel').disabled=!turbo;
  g('edTurboConfig').disabled=!turbo;
  // a vane ring sets its own throat, so the housing A/R is a fixed-housing choice only (build 168)
  g('edVGT').disabled=!turbo;g('edHousing').disabled=!turbo||g('edVGT').value==='yes';
  g('edAntilag').disabled=!turbo;
  g('edScType').disabled=intake!=='supercharger';
  // No poppet valvetrain on 2-stroke / rotary.
  g('edCam').disabled=tp.ports;
  g('edVVT').disabled=tp.ports;
  ['edValves','edValveMat','edSpring'].forEach(id=>{g(id).disabled=tp.ports;});
  // Spark & timing only exist on spark-ignition engines (diesel is CI).
  g('edIgnType').disabled=tp.ci;
  g('edTiming').disabled=tp.ci;
  // Octane only matters for spark-ignition pump gas.
  g('edOctane').disabled=tp.ci||g('edFuel').value!=='gasoline';
  // Fixed advance value only applies to spark-ignition in FIXED timing mode.
  g('edIgnAdv').disabled=tp.ci||g('edTiming').value!=='fixed';
  // Injector: diesel is direct-injection only; else DI needs an EFI intake.
  const sys=INTAKE_SYS[g('edIntakeSys').value]||INTAKE_SYS.efi;
  if(tp.ci)g('edInjector').value='direct';
  g('edInjector').disabled=tp.ci||!sys.di;
  // The AUTO (ECU MAP) mixture needs electronic fuel injection; carbs/mech injection are manual.
  const efi=g('edIntakeSys').value==='efi'||g('edIntakeSys').value==='itb';
  if(!efi)g('edAfrMode').value='fixed';
  g('edAfrMode').disabled=!efi;
}
function buildEngine(){
  if(document.getElementById('edType').value==='electric')return buildElectric();   // build 179
  setLiveLabels(false);
  const prevStoich=(engine&&engine.stoichAFR)||14.7;   // to preserve lambda across fuel swaps
  engine=readEngineFromForm();
  // Engine cycle/type: power-stroke divisor, compression-ignition & port-induction flags, and
  // the peak-pressure / thirst multipliers that give each type its character.
  const et=ENGINE_TYPE[engine.type]||ENGINE_TYPE.petrol4;
  engine.strokeDiv=et.strokeDiv;engine.ci=et.ci;engine.ports=et.ports;
  engine.govPhi0=null;   // the governor's fuel at the governed maximum, found on first use (govPhi0)
  engine.typeImep=et.imep;engine.typeBsfc=et.bsfc;engine.typeLabel=et.label;
  // Charges drawn per shaft revolution, per cylinder or rotor: a four-stroke breathes every other turn;
  // a two-stroke every turn; a rotor fills one of its three chambers every shaft turn (it turns once
  // for three of the shaft). Every air-flow rate below is displacement x rpm x this.
  engine.chargesPerRev=2*Math.PI/engine.strokeDiv;
  if(engine.ports){engine.cam='stock';engine.vvt=false;}   // 2-stroke / rotary: no poppet valvetrain
  if(engine.ci)engine.injector='direct';                   // diesel: direct injection
  // Fuel: energy content, stoichiometry, knock rating and charge cooling.
  const fp=FUELS[engine.fuel]||FUELS.gasoline;
  engine.fuelDensity=fp.density;engine.fuelLHV=fp.LHV;engine.stoichAFR=fp.stoich;
  engine.effOctane=fp.octane!=null?fp.octane:engine.octane;
  engine.fuelKnockBonus=fp.knockBonus;engine.chargeCool=fp.chargeCool;
  // Geometry → displacement (bore/stroke in mm → cm³ → L).
  // A Wankel chamber is not a cylinder. Its swept volume is the difference between the largest and
  // smallest volume one rotor flank encloses in the epitrochoid housing, 3√3·e·R·W per chamber, with
  // e the eccentricity, R the generating radius (centre to apex) and W the rotor width. Each rotor
  // fills one chamber per shaft turn, which is why displacement counts one chamber per rotor: the
  // 13B (e 15, R 105, W 80) is 654 cc a rotor, 1308 cc in all. Until build 100 this was the piston
  // formula on R and W, π/4·R²·W, which has no eccentricity in it at all. The eccentricity is held
  // under R/5, beyond which the apex seals lean too far over the housing to seal.
  if(engine.type==='rotary')engine.ecc_mm=Math.min(engine.ecc_mm||engine.bore_mm/7,engine.bore_mm/5);
  const vcyl_cc=engine.type==='rotary'
    ?3*Math.sqrt(3)*(engine.ecc_mm/10)*(engine.bore_mm/10)*(engine.stroke_mm/10)
    :Math.PI/4*Math.pow(engine.bore_mm/10,2)*(engine.stroke_mm/10);
  engine.displacement_L=vcyl_cc*engine.cylinders/1000;
  engine.boreStroke=engine.bore_mm/engine.stroke_mm;
  // The VE ceiling: the plateau the derived terms below shape (or the bell's height, where kept).
  engine.veAmp=0.95+(engine.injector==='direct'?0.02:0);
  // THE VE BELL — retired for every poppet-valve petrol engine, NA, supercharged and turbo alike, and
  // carried only where the physics that replaces it does not exist yet.
  //
  // Two derivations failed before this one: Taylor's Mach knee put every peak at 0.92-0.97 of
  // redline, and a flat port-flow envelope took the real-car calibration from 3.3% to 10.9%. The
  // third (builds 82-84) found that the bell had been covering for two errors, not one engine shape:
  //   1. trappedFraction closed every intake 16-24 degrees early (see ivcAbdc), so late-IVC backflow
  //      was understated at low rpm and the bell's left side was faking it; and
  //   2. the intake ram term put its main tuning peak 22-57% too high in rpm (see ENGELMAN_K), so
  //      every runner rang at the redline. With the bell gone that put peak power ON the limiter; and
  //      on turbos the bell's right side had been rolling torque off to hide it, which is why
  //      removing it failed on test41's all-turbo set every time and looked like missing "boost
  //      taper" physics.
  // With both fixed, removing the bell takes test41 from 4.02% to 3.34%, leaves no preset peaking on
  // the limiter, and cuts the boost-threshold torque cliffs from 5 to 4. What remains fitted here:
  //   · diesels keep it (their load runs through a throttle they should not have; see pumpingMEP),
  //   · rotaries and two-strokes keep it (no poppet valves, so no trapping/Mach/float physics),
  //   · CAM.ampMul still scales veAmp by cam grade (+4% sport, +8% race).
  engine.veBell=!!et.ports;
  // For the engines that keep it, vePeakRpm is still asserted:
  engine.vePeakRpm=clamp(engine.redline*0.60+(engine.boreStroke-1)*1500,3000,engine.redline*0.95);
  // Asymmetric generalized-bell breathing curve: a steeper low-rpm side (so torque
  // builds later and peaks up in the midrange) and a gentle high-rpm side (so power
  // keeps climbing toward redline instead of falling off a Gaussian cliff).
  engine.veWidthLo=engine.redline*0.42;
  engine.veWidthHi=engine.redline*0.66;
  engine.veShoulder=1.4;
  // Camshaft: a wilder cam shifts the VE peak up and adds top-end breathing at the cost of
  // low-end VE and idle quality. VVT recovers most of the low end (cam advances down low),
  // giving a broad powerband — strong bottom AND top.
  const cam=CAM[engine.cam]||CAM.stock;
  deriveValvetrain();
  updateFloatLabel();
  let loWiden=cam.loWiden,idlePenalty=cam.idleRpm;
  if(engine.vvt){loWiden+= (1-loWiden)*0.8;idlePenalty*=0.3;engine.veWidthHi*=1.06;}
  engine.veAmp*=cam.ampMul;
  engine.veWidthLo*=loWiden;
  // peakShift is gone: where the powerband sits now comes out of the intake runner length via the
  // Helmholtz resonance, not from a per-cam constant asserting it.
  // Diesels breathe poorly up top (airflow/turbo-limited) and make their power low in the rev
  // range: pull the VE peak down and steepen the high-rpm falloff so torque tapers before the
  // (low) redline and peak power lands realistically early, instead of climbing to the limiter.
  // Induction system (metering + throttle) and air filter → breathing, AFR precision,
  // manifold response, idle quality. Direct injection is only possible on EFI systems.
  const sys=INTAKE_SYS[engine.intakeSys]||INTAKE_SYS.efi,filt=AIR_FILTER[engine.airFilter]||AIR_FILTER.stock;
  if(!sys.di)engine.injector='port';          // carbs / mechanical injection: no DI
  engine.canAutoAFR=(engine.intakeSys==='efi'||engine.intakeSys==='itb');   // only EFI has an ECU fuel map
  if(!engine.canAutoAFR)engine.afrMode='fixed';   // carbs / mechanical injection: mixture is mechanical
  // Catalytic converter: conversion efficiency + a small exhaust back-pressure that costs
  // top-end breathing (folded into the top-end flow term, like an extra restrictive filter).
  const catp=CAT[engine.cat]||CAT.stock;
  engine.catConv=catp.conv;engine.catRestrict=catp.restrict;
  engine.inductionFlowTop=sys.flowTop+filt.flowTop-catp.restrict;
  engine.inductionFlowLow=sys.flowLow;
  engine.meteringEff=sys.metering;            // AFR precision → thermal efficiency
  engine.intakeRespK=sys.resp;                // manifold fill speed (dynamic model)
  engine.idleRpmEff=IDLE_RPM+idlePenalty+sys.idle;   // wild cam / race intake idle higher & lumpier
  engine.crFactor=otto(engine.compression)/otto(10.5);   // 1.0 at CR 10.5
  buildBurnTable();         // diesel burn phasing vs rpm; exhaustGasT reads it from here on
  deriveGasDynamics();      // runner + header geometry; needs crFactor, catRestrict and idleRpmEff
  updateGasLabels();
  engine.strokeFrictionMult=1+(engine.stroke_mm-86)/320;  // longer stroke = more friction
  engine.maxBoost=engine.intake==='na'?0:engine.boost_bar;
  engine.mapMax=engine.intake==='na'?1.05:1.0+engine.maxBoost;
  // Intercooler core: charge-heat residual (feeds effIAT) and its spool-lag penalty.
  const ic=INTERCOOLER[engine.intercooler]||INTERCOOLER.large;
  engine.icEff=ic.eff;
  // the flow the core's effectiveness is quoted at: the engine's peak revs at the 1 bar the frames are characterised at
  // (TURBO_PR_REF). Not at this build's boost: the core is hardware, and more boost runs it past its rating.
  engine.icRefFlow=airFlowAt(engine.redline,TURBO_PR_REF);
  // charge volume between compressor and throttle, m3 — ducting bore follows the compressor OUTLET,
  // ~0.72 of the exducer (a GT28: 2-inch outlet on a 71 mm wheel)
  const duct=0.72*turboFrame(engine).exd;
  engine.chargeVol=ic.pipe*Math.PI/4*duct*duct+ic.core/1000;
  // Turbo spool characteristics scaled to redline, then modified by the turbo config
  // (twin/sequential/compound), anti-lag (keeps it spooled) and intercooler volume (lag).
  const tb=turboFrame(engine), cfg=TURBO_CONFIG[engine.turboConfig]||TURBO_CONFIG.single;
  const als=engine.antilag?0.62:1.0;
  // ---- How hard is this engine leaning on that frame? ----
  // Air demanded at peak power, in lb/min — the axis a real compressor map is drawn against.
  // Deliberately computed from the DESIGN VE amplitude and a fixed reference charge
  // temperature rather than the live VE/IAT solution: those depend on compressor efficiency,
  // which depends on this, and the loop would not close.
  const PR=1+engine.maxBoost;
  const perRev=engine.chargesPerRev;                      // intake events per revolution
  const rhoRef=PR*1e5/(287*(273+40));
  const kgs=rhoRef*(engine.displacement_L/1000)*perRev*(engine.redline*0.85/60)*engine.veAmp;
  engine.turboFlow=kgs*132.28;                            // kg/s → lb/min
  engine.turboCap=compChokeFlow(tb.exd)*cfg.flow;         // derived from the wheel, not tabulated
  engine.turboLoad=engine.intake==='turbo'?engine.turboFlow/engine.turboCap:0;   // 1.0 = at rating
  // Compressor efficiency, as a position on the frame's own map rather than a formula in PR.
  // A compressor has an efficiency ISLAND: it peaks near a particular fraction of its choke flow
  // and falls away in every direction — toward surge if you starve it, toward choke if you shove
  // too much through, and with pressure ratio because the losses grow with the work done. Peak
  // efficiency near 62% of choke flow and ~0.78 at the island centre are standard for an
  // automotive centrifugal wheel, not fitted to these engines.
  //
  // This is what makes over-flowing a small frame a real penalty rather than a free lunch: past
  // choke the wheel cannot pass more air however fast it spins, and the efficiency it does have
  // collapses, so what does get through arrives hot. That heat then costs density through effIAT
  // and knock margin on top — the punishment is paid in physics rather than by a `choke` constant.
  engine.compEff=engine.intake==='na'?1:compIslandEff(engine.turboLoad,PR);
  // ---- Spool point and rate, both priced off pressure ratio ----
  // A compressor makes pressure by spinning, and shaft speed has to be bought with exhaust
  // energy. Turbine speed for a given pressure ratio goes like √(PR^0.283 − 1), so asking a
  // frame for more than it was characterised at pushes its spool point up and slows its
  // response; asking for less brings both forward. Over-flowing the frame delays it further.
  const shaft=pr=>Math.sqrt(Math.max(0,Math.pow(pr,0.283)-1));
  const prMul=engine.intake==='turbo'
    ? Math.pow(shaft(PR)/shaft(TURBO_PR_REF),SPOOL_PR_EXP)*(1+0.25*Math.max(0,engine.turboLoad-1))
    : 1;
  engine.spoolPRMul=prMul;
  engine.spool50=tb.spool50*cfg.spool*als*prMul*engine.redline;
  engine.spoolWidth=tb.width*cfg.width*engine.redline;
  // Past its rated flow the compressor runs out of map and the top end chokes off in earnest.
  // The hard airflow ceiling this frame can pass, in kg/s. Derived from the same inducer choke as
  // the flow rating, so the rating and the limit cannot disagree.
  engine.chokeFlow_kgs=engine.intake==='turbo'?compChokeFlow(tb.exd)*cfg.flow/132.28:0;
  // Solving the shaft balance costs a few thousand iterations, and boostAvail is called for every
  // rpm of every torque-curve build. Sample it once per engine into a table and interpolate — the
  // same reason a compressor map is a map and not a formula evaluated at runtime.
  if(engine.turboConfig==='sequential'&&engine.intake==='turbo'&&engine.turbineArea>0){
    engine.seqStageRpm=0;                                    // both turbines everywhere, to find where the pair holds
    let st=engine.redline+1;
    for(let r=1000;r<=engine.redline;r+=100)if(steadyBoost(r)>=0.98*boostTarget(r)){st=r;break;}
    engine.seqStageRpm=st;
  }
  buildBoostTable(26);
  engine.nitrousBar=NITROUS_BAR[engine.nitrous]||0;
  state.boostActual=0;state.nitrousActive=false;state.nitrousCharge=1.0;   // fresh tanks
  state.engineHealth=1.0;state.blown=false;state.wearCause='';   // a fresh (rebuilt) engine
  // Reference brake torque (~peak) used to scale the dyno brake load.
  engine.loadRefTq=(IMEP_K*engine.typeImep*engine.mapMax*0.95*1e5*(engine.displacement_L/1000))/engine.strokeDiv;
  // Rotating inertia, from the parts that spin (build 106). It was 0.04 + 0.06 L^1.5 x stroke/86, a
  // feel for how the live bench revs, which gave a 6.2 V8 ~1.0 kg m2, about three times a real one; it
  // did not matter while only the bench used it, and the car now does (vehicleMassEff).
  engine.inertia=engineInertia(engine.loadRefTq);   // provisional; re-sized on the real peak below
  engine.brakeGain=engine.loadRefTq/220;   // dyno-brake torque per rpm over the hold target
  engine.canDFCO=(engine.intakeSys==='efi'||engine.intakeSys==='itb');   // injection can cut fuel on overrun
  // Cooling: radiator core capacity, plus a fixed fan contribution to airflow
  // that keeps the engine cool at low speed (idle) where ram-air is negligible.
  engine.radCap=RAD_CAP[engine.radiator]||1.0;
  engine.fanFloor={none:0,mechanical:0.15,electric:0.5}[engine.fan];
  // Electrical: alternator rated output & belt drag; ignition dwell (misfire) limit.
  const alt=ALT[engine.alternator]||ALT['120'];
  engine.altMaxA=alt.maxA;engine.altDragMEP=alt.drag;
  engine.dwellLimit=DWELL_RPM[engine.ignitionType]||6800;
  // Engine "note" character: how lumpy/lopey the idle & low end sound. Big cams (overlap),
  // few cylinders, cross-plane V8s and anti-lag all add burble; VVT smooths it back out.
  // Lope is overlap: burnt gas and fresh charge trading places at idle is literally what makes the
  // sound. Now that overlap is derived, the note comes from the same number the physics uses.
  engine.lumpiness=clamp(Math.max(0,engine.overlap||0)/90
    +(engine.layout==='v'&&engine.cylinders===8?0.25:0)
    +(engine.cylinders<=4?0.15:0)
    +(engine.antilag?0.20:0)
    +(engine.ci?0.30:0)                        // diesel clatter
    +(engine.type==='twostroke'?0.22:0),0,1)   // two-stroke ring-ding
    *(engine.vvt?0.7:1)
    *(engine.type==='rotary'?0.25:1);          // rotaries are turbine-smooth

  // Keep the live operating point valid for the new engine.
  state.rpm=clamp(state.rpm,engine.idleRpmEff,engine.redline);
  state.map=clamp(state.map,0.12,engine.mapMax);
  // Re-range the AFR slider. Diesel is quality-governed: air is unthrottled and power is set
  // by how much fuel is injected, so it always runs lean (λ≥1) from the smoke limit to idle.
  const afrEl=document.getElementById('afr'),lam=state.afr/prevStoich;
  if(engine.ci){
    afrEl.min=(engine.stoichAFR*SMOKE_LAMBDA_CI).toFixed(1);   // smoke limit (full fuelling)
    afrEl.max=(engine.stoichAFR*4.2).toFixed(1);    // light-load / idle (very lean)
    afrEl.step=0.2;
    state.afr=clamp(state.afr<engine.stoichAFR*SMOKE_LAMBDA_CI?engine.stoichAFR*1.4:lam*engine.stoichAFR,+afrEl.min,+afrEl.max);
  }else{
    afrEl.min=(engine.stoichAFR*0.68).toFixed(1);
    afrEl.max=(engine.stoichAFR*1.22).toFixed(1);
    afrEl.step=engine.stoichAFR<10?0.05:0.1;
    state.afr=clamp(lam*engine.stoichAFR,+afrEl.min,+afrEl.max);
  }
  syncSliders();
  buildBoostTable(26);
  engine.tqLimTable=null;
  if(engine.tqLimit>0){buildTorqueLimit();buildBoostTable(26);}   // the ECU's torque limit lowers the target: re-solve the shaft
  engine.govPhi0=null;   // the governor's share, against the finished engine (it was taken mid-build, on a half-set one)
  {const p=peakEgts();engine.peakEgt=p.probe;engine.peakEgtGas=p.gas;}   // needs the boost table (wotMapAt) and the burn table

  buildRev++;dynoCache=null;
  engine.cost=computeCost();
  engine.score=scoreEngine();
  engine.inertia=engineInertia(engine.score.peakTQ);   // the clutch is sized for the torque it carries
  updateEngineLabels();
  updateDesignSummary();
  renderChallenge();
  // In AUTO (ECU MAP) mode the ECU sets the mixture, so the manual AFR slider is read-only.
  const afrSlider=document.getElementById('afr');if(afrSlider)afrSlider.disabled=(engine.afrMode==='auto');
  manageFuelMap();renderFuelMap();
  if(document.getElementById('vhChassis')){buildVehicle();updateVehicleSummary();}   // refresh vehicle performance for the new engine
}
