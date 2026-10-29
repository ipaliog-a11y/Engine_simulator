function bindControls(){
  // Throttle & load are fractions (0..1); AFR/temps are direct values.
  document.getElementById('throttle').addEventListener('input',e=>state.throttle=(+e.target.value)/100);
  document.getElementById('load').addEventListener('input',e=>state.load=(+e.target.value)/100);
  document.getElementById('elec').addEventListener('input',e=>state.elecLoad=(+e.target.value)/100);
  ['afr','iat','coolant','oil'].forEach(id=>{
    document.getElementById(id).addEventListener('input',()=>{
      state[id]=parseFloat(document.getElementById(id).value);
      dynoCache=null;
    });
  });
  // The three operating-point buttons. Until build 85 these were three fixed sets of slider values
  // shared by every engine: MAX POWER held 50% load (halfway between idle and redline, wherever the
  // power peak really was) at a petrol AFR of 12.6 — sooty-rich on a diesel — and quietly cooled the
  // intake air to 15 C, which is changing the weather, not the driving. Each one is now a real point
  // on the engine you built, at the standard conditions the dyno uses, so MAX POWER on the LIVE tab
  // lands on the DYNO tab's peak figure.
  function applyOperatingPoint(kind){
    if(!engine.score){flash(tr('BUILD AN ENGINE FIRST'),'warn');return;}
    const op=operatingPoint(kind);
    // The dyno brake only pushes back ABOVE its target, so the engine settles where brake torque
    // equals engine torque: over = torque / brakeGain. Aim that much low, or every point sits
    // 100-200 rpm past where it was meant to be.
    const aim=op.rpm-Math.max(0,op.tq||0)/Math.max(1e-6,engine.brakeGain);
    applyPreset({throttle:op.throttle,load:loadForRpm(aim),afr:op.lambda*engine.stoichAFR,
                 iat:DYNO_STD.iat,coolant:DYNO_STD.coolant,oil:DYNO_STD.oil});
    const what=kind==='power'?'MAX POWER':kind==='torque'?'PEAK TORQUE':'ECO';
    flash(tr(what)+' • '+(op.throttle>=0.999?'WOT':Math.round(op.throttle*100)+'% '+tr('THROTTLE'))+' @ '+
      Math.round(op.rpm)+' rpm • λ'+op.lambda.toFixed(2)+' • '+tr('expect')+' '+op.expect+
      (engine.afrMode==='auto'?' • '+tr('the ECU map sets the mixture'):''));
  }
  function applyPreset(p){
    state.throttle=p.throttle;state.load=p.load;
    if(p.elec!=null)state.elecLoad=p.elec;
    state.afr=p.afr;state.iat=p.iat;state.coolant=p.coolant;state.oil=p.oil;
    dynoCache=null;syncSliders();
  }
  document.getElementById('btnOptimal').addEventListener('click',()=>applyOperatingPoint('torque'));
  document.getElementById('btnMaxPower').addEventListener('click',()=>applyOperatingPoint('power'));
  document.getElementById('btnEco').addEventListener('click',()=>applyOperatingPoint('eco'));
  document.getElementById('btnReset').addEventListener('click',()=>{setAutoThermal(false);state.engineHealth=1.0;state.blown=false;state.wearCause='';state.coolant=90;state.oil=100;state.batterySOC=1.0;applyPreset({throttle:0.10,load:0.20,afr:14.7,iat:25,coolant:90,oil:100})});
  document.getElementById('btnAutoThermal').addEventListener('click',()=>setAutoThermal(!autoThermal));
  document.getElementById('btnWear').addEventListener('click',()=>{
    wearEnabled=!wearEnabled;
    const b=document.getElementById('btnWear');
    b.classList.toggle('on',wearEnabled);b.setAttribute('aria-pressed',wearEnabled);b.textContent=tr(wearEnabled?'WEAR ON':'WEAR OFF');
    flash(tr(wearEnabled?'WEAR ON • ENGINE CAN BE DAMAGED':'WEAR OFF • ENGINE INVINCIBLE'));
  });
  document.getElementById('btnNitrous').addEventListener('click',()=>{
    if(engine.nitrous==='none'){flash(tr('NO NITROUS FITTED — ADD A SHOT ON THE ENGINE TAB'),'warn');return;}
    if(state.nitrousCharge<=0){flash(tr('NITROUS BOTTLE EMPTY — REBUILD TO REFILL'),'warn');return;}
    state.nitrousActive=!state.nitrousActive;
    const b=document.getElementById('btnNitrous');b.classList.toggle('on',state.nitrousActive);b.setAttribute('aria-pressed',state.nitrousActive);
    flash(tr(state.nitrousActive?'NITROUS ARMED — SPRAYS AT WOT':'NITROUS OFF'));
  });
  document.getElementById('btnSound').addEventListener('click',()=>setSound(!Sound.on));
  const sm=document.getElementById('edSoundModel');sm.value=Sound.model;sm.addEventListener('change',e=>setSoundModel(e.target.value));
  document.getElementById('btnSave').addEventListener('click',saveSetup);
  document.getElementById('btnLoad').addEventListener('click',loadSetup);
  document.getElementById('btnExport').addEventListener('click',exportBuild);
  document.getElementById('btnImport').addEventListener('click',openFileDialog);
  document.getElementById('btnShare').addEventListener('click',shareBuild);
  document.getElementById('btnLogPull').addEventListener('click',logPull);
  document.getElementById('btnClearPulls').addEventListener('click',clearPulls);
  document.getElementById('btnReportPng').addEventListener('click',exportDynoPNG);
  document.getElementById('btnReportPdf').addEventListener('click',exportDynoPDF);
  document.getElementById('btnLapPng').addEventListener('click',exportLapPNG);
  document.getElementById('btnLapPdf').addEventListener('click',exportLapPDF);
  document.getElementById('fileInput').addEventListener('change',e=>{const f=e.target.files&&e.target.files[0];if(f)readBuildFile(f);e.target.value='';});

  document.getElementById('tabDesign').addEventListener('click',()=>setTab('design'));
  document.getElementById('tabVehicle').addEventListener('click',()=>setTab('vehicle'));
  document.getElementById('tabTrack').addEventListener('click',()=>setTab('track'));
  document.getElementById('tabRace').addEventListener('click',()=>setTab('race'));
  loadImportedTracks();
  const trkSel=document.getElementById('trkSel');
  if(trkSel){refreshTrackList();trkSel.addEventListener('change',e=>{trackKey=e.target.value;refreshLap();});}
  const bImp=document.getElementById('btnImportGpx'),gIn=document.getElementById('gpxInput');
  if(bImp&&gIn){
    bImp.addEventListener('click',()=>gIn.click());
    gIn.addEventListener('change',e=>{
      const f=e.target.files&&e.target.files[0];
      if(f){const r=new FileReader();
        r.onload=()=>loadGpxTrack(r.result,f.name.replace(/\.gpx$/i,''));
        r.onerror=()=>flash(tr('COULD NOT READ FILE'),'err');
        r.readAsText(f);}
      e.target.value='';
    });
  }
  document.getElementById('tabEngine').addEventListener('click',()=>setTab('engine'));
  document.getElementById('tabDyno').addEventListener('click',()=>setTab('dyno'));
  document.getElementById('tabGuide').addEventListener('click',()=>setTab('guide'));
  document.getElementById('tabOptions').addEventListener('click',()=>setTab('options'));
  document.getElementById('tabGarage').addEventListener('click',()=>setTab('garage'));
  const rb=document.getElementById('btnReplay');
  rb.addEventListener('click',()=>{lapReplay.playing=!lapReplay.playing;rb.classList.toggle('on',lapReplay.playing);
    rb.setAttribute('aria-pressed',String(lapReplay.playing));rb.textContent=tr(lapReplay.playing?'PAUSE':'PLAY');});
  document.getElementById('btnReplayRestart').addEventListener('click',()=>{lapReplay.t=0;lapReplay.laps=0;});
  document.getElementById('replaySpeed').addEventListener('change',e=>{lapReplay.speed=+e.target.value||1;});
  const gs=document.getElementById('replayGauges');gs.value=lapReplay.gauges;
  gs.addEventListener('change',e=>{lapReplay.gauges=e.target.value==='analog'?'analog':'digital';
    try{localStorage.setItem('pes.gauges',lapReplay.gauges);}catch(err){}});
  // Vehicle design: recompute performance live on any change. Picking a chassis fits its whole
  // factory spec (drivetrain, gearbox, tyres/wheels, brakes, suspension, aero, weight).
  ['vhChassis','vhDrive','vhGearbox','vhDiff','vhGears','vhSpacing','vhGearing','vhLimiter','vhLimitKmh','vhTC','vhRating','vhTire','vhTireW','vhTireWF','vhTireA','vhWheel','vhAeroF','vhAeroR','vhAeroFl','vhWeight','vhBrake','vhRotor','vhSusp','vhGeoF','vhGeoR','vhSpringF','vhSpringR','vhBarF','vhBarR','vhSteer'].forEach(id=>{
    const el=document.getElementById(id);if(!el)return;
    el.addEventListener('input',()=>{
      if(id==='vhChassis'){
        vehBody=null;   // a generic chassis, not the real car any more
        const ch=applyChassisFit(el.value);
        if(ch)flash(tr('FITTED')+': '+tr(ch.label)+' • '+fitmentLabel(readVehicleFromForm()));
      }
      // A compound is sold in at least its usual rating, so a new compound raises the rating to that
      // if it was lower; it never lowers one you chose.
      if(id==='vhTire'){
        const keys=Object.keys(SPEED_RATING),rs=document.getElementById('vhRating'),want=(TIRE_TYPE[el.value]||{}).rating;
        if(want&&keys.indexOf(rs.value)<keys.indexOf(want))rs.value=want;
      }
      updateGearingLabel();
      buildVehicle();updateVehicleSummary();
    });
  });
  wireGearWin();
  // Refit the current chassis to its factory spec (undo your part swaps).
  const btnFit=document.getElementById('btnRefit');
  if(btnFit)btnFit.addEventListener('click',()=>{
    const ch=applyChassisFit(document.getElementById('vhChassis').value,vehBody);
    document.getElementById('valGearing').textContent=document.getElementById('vhGearing').value;
    buildVehicle();updateVehicleSummary();
    if(ch)flash(tr('REFITTED TO FACTORY SPEC')+': '+(vehBody?vehBody.name:tr(ch.label)));
  });
  // Real cars: the factory engine and the car's own body and fitment, together.
  carPicker=wireFamilyPicker('vhFamily','vhPreset',FACTORY_CAR_CATS,FACTORY_CARS,p=>p.cat,'— load a real car —',i=>{
    const name=loadVehiclePreset(FACTORY_CARS[i]);
    const ei=FACTORY_ENGINES.findIndex(p=>p.name===FACTORY_CARS[i].engine);
    if(enginePicker)enginePicker.show(ei);
    markLoaded('engine',FACTORY_CARS[i].engine);markLoaded('car',name);
    flash(tr('LOADED:')+' '+name+(perf&&perf.t100?' • 0–100 '+perf.t100.toFixed(1)+'s':''));
  });
  // Garage. The list is rebuilt on every change, so LOAD/DELETE are delegated off the container
  // rather than rebound per card.
  for(const [kind,btnId] of [['car','btnGarageSave'],['engine','btnEngineSave']]){
    const btn=document.getElementById(btnId),nm=document.getElementById(GARAGE_NAME_ID[kind]);
    if(btn)btn.addEventListener('click',()=>garageSave(kind));
    if(nm){
      nm.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();garageSave(kind);}});
      nm.addEventListener('input',renderGarage);       // highlights the card you are about to overwrite
    }
  }
  for(const id of ['garageList','garageEngList']){
    const list=document.getElementById(id);
    if(list)list.addEventListener('click',e=>{
      const b=e.target.closest('button');if(!b)return;
      if(b.dataset.gview){garageOpen.has(b.dataset.gview)?garageOpen.delete(b.dataset.gview):garageOpen.add(b.dataset.gview);renderGarage();}
      else if(b.dataset.gload)garageLoad(b.dataset.gload);
      else if(b.dataset.gdel)garageDelete(b.dataset.gdel);
    });
  }
  loadGarage();renderGarage();

  // the race page's own ⛶: its stage resizes going in and out of full screen
  document.addEventListener('fullscreenchange',()=>{if(racePage.open)sizeRaceStage();if(trackPage.open)sizeTrackStage();});

  document.getElementById('edIntake').addEventListener('change',syncDesignEnable);
  document.getElementById('edFuel').addEventListener('change',syncDesignEnable);
  document.getElementById('edTiming').addEventListener('change',syncDesignEnable);
  document.getElementById('edIntakeSys').addEventListener('change',syncDesignEnable);
  // Fitting a hybrid system starts from a hybrid's motor and pack, not an electric car's (build 186); changing the layout,
  // from that layout's (build 189: a power-split's MG2 and pack are the Prius's).
  document.getElementById('edHybrid').addEventListener('change',e=>{
    const v=e.target.value,hybPrev=engine&&engine.type!=='electric'&&engine.hyMode||'none';
    if(v!=='none'&&(+document.getElementById('evKWh').value>10||hybPrev!=='none'&&hybPrev!==v||v==='ps'))
      applyElectricToForm(Object.assign({},EV_DEFAULT,v==='ps'?HYB_DEFAULT_PS:HYB_DEFAULT));
    syncDesignEnable();
  });
  // Switching engine type resets CR / redline / cylinders to that cycle's sensible defaults.
  document.getElementById('edType').addEventListener('change',e=>{
    const tp=ENGINE_TYPE[e.target.value]||ENGINE_TYPE.petrol4,g=id=>document.getElementById(id);
    g('edCR').value=tp.crDef;g('edRedline').value=tp.redlineDef;
    if(e.target.value==='rotary'&&+g('edCyl').value>(tp.maxCyl||12))g('edCyl').value=2;
    if(tp.ports){g('edCam').value='stock';g('edVVT').value='no';}
    syncDesignEnable();
  });
  // Editable ECU fuel map: click a cell to select it, then nudge its target richer/leaner.
  const fmBox=document.getElementById('fuelMapBox');
  if(fmBox)fmBox.addEventListener('click',e=>{
    const td=e.target.closest('td.fm-cell');if(!td)return;
    selectFmCell(+td.dataset.c,+td.dataset.r);
  });
  const fmStep=()=>engine.ci?0.08:0.02;   // λ per nudge (diesel grid is wider)
  const fmLean=document.getElementById('fmLean'),fmRich=document.getElementById('fmRich'),fmReset=document.getElementById('fmReset');
  if(fmLean)fmLean.addEventListener('click',()=>adjustFmCell(fmStep()));    // leaner = higher λ
  if(fmRich)fmRich.addEventListener('click',()=>adjustFmCell(-fmStep()));   // richer = lower λ
  if(fmReset)fmReset.addEventListener('click',resetFuelMap);
  // Populate & wire the preset dropdown
  enginePicker=wireFamilyPicker('edFamily','edPreset',FACTORY_ENGINE_CATS,FACTORY_ENGINES,p=>p.cat||'Archetypes','— choose a build —',i=>{
    const p=FACTORY_ENGINES[i];
    // The car you have stays: an engine preset is an engine, dropped into whatever car is built.
    applyBuild({engine:Object.assign({},p.engine),tune:Object.assign({},STD_TUNE),vehicle:readVehicleFromForm(),name:p.name});
    engine.name=p.name;
    markLoaded('engine',p.name);
    flash(tr('LOADED:')+' '+p.name+' • '+(isElectric()?engine.score.peakKW+' kW':engine.displacement_L.toFixed(engine.displacement_L<1?2:1)+'L')+(engine.score?' • '+engine.score.grade:''));
    setTab('dyno');
  });
  document.getElementById('bsEngine').addEventListener('click',()=>setTab('design'));
  document.getElementById('bsCar').addEventListener('click',()=>setTab('vehicle'));
  updateBuildStrip();
  // Career / challenge selector
  const chSel=document.getElementById('edChallenge');
  CHALLENGES.forEach(c=>{const o=document.createElement('option');o.value=c.id;o.textContent=chName(c);chSel.appendChild(o);});
  chSel.value=activeChallenge;
  chSel.addEventListener('change',e=>{activeChallenge=e.target.value;renderChallenge();
    const ch=CHALLENGES.find(c=>c.id===activeChallenge);flash(tr('OBJECTIVE')+': '+(ch?chName(ch):''));});
  // Language selector
  const langSel=document.getElementById('edLang');
  if(langSel){langSel.value=currentLang;langSel.addEventListener('change',e=>{applyLang(e.target.value);flash(e.target.value==='el'?'Γλώσσα: Ελληνικά':'Language: English');});}
  document.getElementById('btnBuild').addEventListener('click',()=>{buildEngine();flash(isElectric()?tr('DRIVE BUILT')+' • '+engine.score.peakKW+' kW':tr('ENGINE BUILT')+' • '+engine.displacement_L.toFixed(engine.displacement_L<1?2:1)+'L');setTab('dyno')});
  document.getElementById('btnDesignReset').addEventListener('click',()=>{applyEngineToForm(Object.assign({},DEFAULT_ENGINE));buildEngine();flash(tr('DESIGN RESET TO DEFAULTS'))});
}
function syncSliders(){
  document.getElementById('throttle').value=Math.round(state.throttle*100);
  document.getElementById('load').value=Math.round(state.load*100);
  document.getElementById('elec').value=Math.round(state.elecLoad*100);
  document.getElementById('afr').value=state.afr;
  document.getElementById('iat').value=state.iat;
  document.getElementById('coolant').value=state.coolant;
  document.getElementById('oil').value=state.oil;
}
function loop(now){
  const dt=Math.min((now-lastTime)/1000,0.05);lastTime=now;
  stepThermal(dt);
  stepEngine(dt);
  stepElectrical(dt);
  updatePhysics();
  stepWear(dt);
  updateSound();
  if(vizMode==='engine')drawEngine(dt);
  else if(vizMode==='dyno'){drawDyno();renderDynoResult(false);}
  else if(vizMode==='track'){stepReplay(dt);drawTrack();}
  else if(vizMode==='race'){stepRaceView(dt);drawRace();}
  else stepPreviews(dt);
  updateUI();
  requestAnimationFrame(loop);
}
bindControls();applyEngineToForm(Object.assign({},DEFAULT_ENGINE));buildEngine();
applyVehicleToForm(DEFAULT_VEHICLE);buildVehicle();updateVehicleSummary();
loadFromHash();   // open a shared build if the URL carries one
applyLang(currentLang);   // localise the UI (persisted choice)
initGuide();               // index, or the page you were last reading
bindTrackZoom();
bindRace();
bindRacePage();
bindTrackPage();
sizeCanvas();updatePhysics();updateUI();requestAnimationFrame(loop);

// Register service worker for offline/installable PWA (no-op on file://).
if('serviceWorker' in navigator && location.protocol.startsWith('http')){
  window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
}
