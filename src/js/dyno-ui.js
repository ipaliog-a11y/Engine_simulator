// ---- the dyno result as a static sheet ----
// The DYNO canvas draws the pull with small tags, and the figures under it are the scorecard's — two
// different pulls, never labelled as such, so "what is the peak power?" had no clear answer short of
// exporting the PDF. This is the same information as the PDF's result band and run-data table, in
// real text under the curve: the BEST-POWER pull (the scorecard / objective figures) and YOUR pull
// as currently tuned (the curve drawn above, which is also what the PDF tabulates).
let dynoResultKey='';
function renderDynoResult(force){
  const box=document.getElementById('dynoResult');
  if(!box||box.hidden||!engine.score)return;
  const data=getDynoData();
  const key=buildRev+'|'+dynoCacheKey+'|'+dynoPulls.length+'|'+currentLang;
  if(!force&&key===dynoResultKey)return;
  dynoResultKey=key;
  const s=engine.score, kW=hp=>hp*0.7457, lbft=nm=>nm*0.73756;
  let pP={v:0,r:0},pT={v:0,r:0};
  data.forEach(p=>{if(p.powerHP>pP.v)pP={v:p.powerHP,r:p.rpm};if(p.torque>pT.v)pT={v:p.torque,r:p.rpm};});
  const at=r=>{for(let i=1;i<data.length;i++)if(r<=data[i].rpm){const a=data[i-1],b=data[i],t=(r-a.rpm)/(b.rpm-a.rpm);
    return {hp:a.powerHP+(b.powerHP-a.powerHP)*t,tq:a.torque+(b.torque-a.torque)*t,map:(a.map||1)+((b.map||1)-(a.map||1))*t};}
    const z=data[data.length-1];return {hp:z.powerHP,tq:z.torque,map:z.map||1};};
  const lam=(state.afr/engine.stoichAFR).toFixed(2);
  const tuned=engine.afrMode==='auto'?tr('ECU fuel map'):'AFR '+state.afr.toFixed(1)+' (λ'+lam+')';
  const card=(cls,k,v,sub)=>'<div class="dr-card '+cls+'"><div class="k">'+k+'</div><div class="v">'+v+'</div><div class="s">'+sub+'</div></div>';
  const step=engine.redline>8000?500:engine.redline>5000?500:250;
  const rows=[];for(let r=1000;r<=engine.redline;r+=step)rows.push(r);
  if(rows[rows.length-1]!==engine.redline)rows.push(engine.redline);
  const boosted=engine.intake!=='na';
  const near=(r,pk)=>Math.abs(r-pk)<step/2;
  box.innerHTML='<h4>'+tr('DYNO RESULT')+'</h4>'+
    '<div class="dr-cards">'+
      card('hp',tr('PEAK POWER')+' — '+tr('BEST-POWER PULL'),s.peakHP+' hp',Math.round(kW(s.peakHP))+' kW @ '+s.peakHPrpm+' rpm')+
      card('tq',tr('PEAK TORQUE')+' — '+tr('BEST-POWER PULL'),s.peakTQ+' Nm',Math.round(lbft(s.peakTQ))+' lb-ft @ '+s.peakTQrpm+' rpm')+
      card('',tr('YOUR PULL (AS TUNED)'),pP.v.toFixed(1)+' hp',pT.v.toFixed(1)+' Nm @ '+pT.r+' • '+Math.round(kW(pP.v))+' kW @ '+pP.r)+
    '</div>'+
    '<p class="dr-note"><b>'+tr('BEST-POWER PULL')+'</b> — '+tr('wide open throttle at the best-power mixture, 25 °C intake, 90 °C coolant: the figures the grade and the objectives use, and what MAX POWER on the LIVE tab drives to.')+'<br>'+
    '<b>'+tr('YOUR PULL (AS TUNED)')+'</b> — '+tr('the curve drawn above, at the mixture and conditions set right now')+' ('+tuned+', '+Math.round(state.iat)+' °C). '+
    tr('It is what the PDF report tabulates.')+(dynoPulls.length?' '+dynoPulls.length+' '+tr('logged pull(s) overlaid on the chart.'):'')+'</p>'+
    '<table class="dr-table"><thead><tr><th>RPM</th><th>HP</th><th>kW</th><th>Nm</th><th>lb-ft</th>'+(boosted?'<th>'+tr('BOOST')+' bar</th>':'')+'</tr></thead><tbody>'+
    rows.map(r=>{const v=at(r);return '<tr'+(near(r,pP.r)||near(r,pT.r)?' class="pk"':'')+'><td>'+r+'</td><td class="hp">'+v.hp.toFixed(1)+'</td><td>'+kW(v.hp).toFixed(1)+
      '</td><td class="tq">'+v.tq.toFixed(1)+'</td><td>'+lbft(v.tq).toFixed(1)+'</td>'+(boosted?'<td>'+Math.max(0,v.map-1).toFixed(2)+'</td>':'')+'</tr>';}).join('')+
    '</tbody></table>';
}
function drawDyno(){
  const W=vizW,H=vizH,rMax=engine.redline;
  ctx.fillStyle=C.bg;ctx.fillRect(0,0,W,H);
  drawPixelRect(0,0,W,28,'#12121c');
  ctx.fillStyle=C.yellow;ctx.font='10px "Press Start 2P"';ctx.fillText(tr('DYNO CURVE • POWER & TORQUE'),12,19);
  ctx.fillStyle=C.green;ctx.fillText(Math.round(state.rpm)+' RPM',W-110,19);

  const data=getDynoData();
  let maxT=0,maxP=0,peakT={rpm:0,v:0},peakP={rpm:0,v:0};
  data.forEach(p=>{if(p.torque>maxT){maxT=p.torque;peakT={rpm:p.rpm,v:p.torque}}if(p.powerHP>maxP){maxP=p.powerHP;peakP={rpm:p.rpm,v:p.powerHP}}});
  dynoPulls.forEach(pl=>pl.pts.forEach(p=>{maxT=Math.max(maxT,p.torque);maxP=Math.max(maxP,p.powerHP)}));  // fit overlays too
  maxT=Math.max(maxT*1.15,40);maxP=Math.max(maxP*1.15,40);

  const gX=55,gY=48,gW=530,gH=262;
  drawPixelRect(gX,gY,gW,gH,'#0a0a14');ctx.strokeStyle='#333';ctx.lineWidth=2;ctx.strokeRect(gX,gY,gW,gH);
  ctx.strokeStyle='#1a1a28';ctx.lineWidth=1;
  for(let i=1;i<8;i++){
    const x=gX+(gW/8)*i;ctx.beginPath();ctx.moveTo(x,gY);ctx.lineTo(x,gY+gH);ctx.stroke();
    const y=gY+(gH/6)*i;ctx.beginPath();ctx.moveTo(gX,y);ctx.lineTo(gX+gW,y);ctx.stroke();
  }
  ctx.fillStyle='#666';ctx.font='7px "Press Start 2P"';
  for(let f=0;f<=1.001;f+=0.25){
    const rpmLbl=Math.round((1000+(rMax-1000)*f)/100)*100;
    ctx.fillText(rpmLbl.toString(),gX+gW*f-(f>0?12:5),gY+gH+14);
  }
  ctx.fillText('RPM',gX+gW/2-15,gY+gH+28);
  ctx.fillStyle=C.cyan;ctx.fillText('0',gX-25,gY+gH+3);ctx.fillText(Math.round(maxT/2).toString(),gX-30,gY+gH/2+3);ctx.fillText(Math.round(maxT).toString(),gX-30,gY+10);ctx.fillText('Nm',gX-28,gY+gH/2-12);
  ctx.fillStyle=C.yellow;ctx.fillText('0',gX+gW+6,gY+gH+3);ctx.fillText(Math.round(maxP/2).toString(),gX+gW+6,gY+gH/2+3);ctx.fillText(Math.round(maxP).toString(),gX+gW+6,gY+10);ctx.fillText('HP',gX+gW+6,gY+gH/2-12);

  const rpmToX=r=>gX+((r-1000)/(rMax-1000))*gW,tToY=t=>gY+gH-(t/maxT)*gH,pToY=p=>gY+gH-(p/maxP)*gH;
  // Overlaid saved pulls (faint, behind the current curves) for comparison
  ctx.lineWidth=1.5;
  dynoPulls.forEach(pl=>{
    ctx.strokeStyle=pl.color;ctx.globalAlpha=0.55;
    ctx.beginPath();pl.pts.forEach((p,i)=>{if(p.rpm<1000||p.rpm>rMax)return;const x=rpmToX(p.rpm),y=pToY(p.powerHP);i===0?ctx.moveTo(x,y):ctx.lineTo(x,y)});ctx.stroke();
    ctx.globalAlpha=0.30;
    ctx.beginPath();pl.pts.forEach((p,i)=>{if(p.rpm<1000||p.rpm>rMax)return;const x=rpmToX(p.rpm),y=tToY(p.torque);i===0?ctx.moveTo(x,y):ctx.lineTo(x,y)});ctx.stroke();
  });
  ctx.globalAlpha=1;
  ctx.strokeStyle=C.cyan;ctx.lineWidth=3;ctx.beginPath();
  data.forEach((p,i)=>{const x=rpmToX(p.rpm),y=tToY(p.torque);i===0?ctx.moveTo(x,y):ctx.lineTo(x,y)});ctx.stroke();
  ctx.strokeStyle=C.yellow;ctx.lineWidth=3;ctx.beginPath();
  data.forEach((p,i)=>{const x=rpmToX(p.rpm),y=pToY(p.powerHP);i===0?ctx.moveTo(x,y):ctx.lineTo(x,y)});ctx.stroke();

  const curX=rpmToX(clamp(state.rpm,1000,rMax));
  ctx.strokeStyle=C.green;ctx.lineWidth=2;ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(curX,gY);ctx.lineTo(curX,gY+gH);ctx.stroke();ctx.setLineDash([]);
  ctx.fillStyle=C.cyan;ctx.beginPath();ctx.arc(rpmToX(peakT.rpm),tToY(peakT.v),5,0,Math.PI*2);ctx.fill();
  ctx.fillStyle=C.yellow;ctx.beginPath();ctx.arc(rpmToX(peakP.rpm),pToY(peakP.v),5,0,Math.PI*2);ctx.fill();

  // Info strip below the graph: peaks + scorecard + overlaid-pull legend
  const iy=gY+gH+30;
  drawPixelRect(0,iy-14,W,H-(iy-14),'#12121c');
  ctx.font='7px "Press Start 2P"';
  ctx.fillStyle=C.cyan;ctx.fillText(tr('TQ')+' '+peakT.v.toFixed(0)+'Nm@'+peakT.rpm,gX+4,iy);
  ctx.fillStyle=C.yellow;ctx.fillText(tr('PWR')+' '+peakP.v.toFixed(0)+'HP@'+peakP.rpm,gX+160,iy);
  const s=engine.score;
  if(s){
    const gc=s.overall>=76?C.green:s.overall>=46?C.yellow:C.red;
    ctx.fillStyle=gc;ctx.font='11px "Press Start 2P"';ctx.fillText(tr('GRADE')+' '+s.grade+' '+s.overall,gX+320,iy+1);
    ctx.font='6px "Press Start 2P"';ctx.fillStyle='#99aabb';
    ctx.fillText(s.hpPerL+'hp/L • '+s.nmPerL+'Nm/L • '+tr('band')+' '+s.band+'rpm • '+tr('eff')+' '+s.thEff+'% • '+tr('safety')+' '+s.safety+' • '+tr('drive')+' '+s.drive+'% • '+tr('emit')+' '+s.emissions+' • '+tr('rel')+' '+s.reliability,gX+4,iy+15);
  }
  // Strategy: cost / power-per-dollar, and the active challenge verdict
  const chNow=CHALLENGES.find(c=>c.id===activeChallenge)||CHALLENGES[0];
  const m=buildMetrics(chNow);
  ctx.font='6px "Press Start 2P"';ctx.fillStyle='#cbb26a';
  const lapNow=(vehicle&&vehicle.mass)?lapFor(trackKey):null;
  const costTxt=tr('COST')+' '+fmtCost(m.cost)+' • '+m.hpPerK+' hp/$1k'+
    (lapNow!=null?'  •  '+tr('LAP')+' '+fmtLap(lapNow)+' '+((TRACKS[trackKey]||{}).label||''):'');
  ctx.fillText(costTxt,gX+4,iy+28);
  const ch=CHALLENGES.find(c=>c.id===activeChallenge);
  if(ch&&ch.id!=='free'){
    const ev=evalChallenge(ch,m);
    ctx.fillStyle=ev.pass?C.green:C.red;
    // Right-aligned to the chart's edge, beside the cost line when there is room and on the line below when not: at a
    // fixed x it ran into the cost line once that line carried the lap and the circuit's name.
    const verdict=(ev.pass?'✓ ':'✗ ')+chName(ch).toLocaleUpperCase(currentLang)+' — '+trIn('dyno',ev.pass?'PASSED':'NOT MET');
    const fits=ctx.measureText(costTxt).width+ctx.measureText(verdict).width+24<=gW;
    ctx.textAlign='right';ctx.fillText(verdict,gX+gW,fits?iy+28:iy+41);ctx.textAlign='left';
  }
  ctx.font='6px "Press Start 2P"';
  if(dynoPulls.length){
    dynoPulls.forEach((pl,i)=>{ctx.fillStyle=pl.color;ctx.fillText('— '+pl.label,gX+4+i*132,iy+41);});
  }else{ctx.fillStyle='#667';ctx.fillText(tr('LOG PULL to snapshot & overlay a curve for comparison'),gX+4,iy+41);}
}
function updateUI(){
  if(vizMode==='design')updateFuelMapMarker();
  document.getElementById('valThrottle').textContent=Math.round(state.throttle*100);
  document.getElementById('valLoad').textContent=Math.round(state.load*100);
  document.getElementById('valElec').textContent=Math.round(state.elecLoad*100);
  const boost=state.map-1.0;
  document.getElementById('readout').textContent=
    'RPM '+Math.round(state.rpm)+' • MAP '+state.map.toFixed(2)+' bar'+
    (engine.intake!=='na'?' • BOOST '+(boost>=0?'+':'')+boost.toFixed(2):'')+
    ' • BATT '+state.systemVoltage.toFixed(1)+'V';
  document.getElementById('valAFR').textContent=state.afr.toFixed(1);
  document.getElementById('valIAT').textContent=state.iat;
  document.getElementById('valCool').textContent=Math.round(state.coolant);
  document.getElementById('valOil').textContent=Math.round(state.oil);
  document.querySelector('#statHP .value').textContent=state.powerHP.toFixed(1);
  document.querySelector('#statTQ .value').textContent=state.torque.toFixed(1);
  document.querySelector('#statBSFC .value').textContent=state.bsfc>500?'---':state.bsfc.toFixed(0);
  document.querySelector('#statEff .value').textContent=state.thermalEff.toFixed(1);
  document.querySelector('#statFuel .value').textContent=state.fuelFlowLph.toFixed(1);
  const knockEl=document.querySelector('#statKnock .value');
  if(state.knockRisk<25){knockEl.textContent=tr('LOW');document.getElementById('statKnock').className='stat'}
  else if(state.knockRisk<55){knockEl.textContent=tr('MED');document.getElementById('statKnock').className='stat warning'}
  else{knockEl.textContent=tr('HIGH');document.getElementById('statKnock').className='stat danger'}
  const hp=Math.round(state.engineHealth*100),healthEl=document.getElementById('statHealth');
  healthEl.querySelector('.value').textContent=state.blown?tr('DEAD'):hp;
  healthEl.className='stat'+(state.blown||hp<30?' danger':(hp<70?' warning':''));
  const status=document.getElementById('status'),legend=document.getElementById('legend');
  if(performance.now()<statusFlashUntil){/* keep transient flash message */}
  else if(vizMode==='design'){status.textContent=tr('DESIGN MODE • CONFIGURE & BUILD');status.className='status-bar'}
  else if(state.blown){status.textContent=tr('ENGINE FAILURE')+' ('+tr(state.wearCause)+') — '+tr('REBUILD WITH BUILD & DYNO');status.className='status-bar err'}
  else if(state.wearCause){status.textContent=tr('DAMAGE')+': '+tr(state.wearCause)+' — '+tr('HEALTH')+' '+hp+'% '+tr('FALLING');status.className='status-bar err'}
  else if(state.knockRisk>70){status.textContent=tr('DETONATION RISK — RETARDING SPARK / POWER CUT');status.className='status-bar err'}
  else if(state.coolant>115){status.textContent=tr('OVERHEAT — REDUCE LOAD OR INCREASE COOLING');status.className='status-bar err'}
  else if(state.oil<55){status.textContent=tr('COLD OIL — HIGH FRICTION, WARM UP RECOMMENDED');status.className='status-bar warn'}
  else if(state.systemVoltage<11.6){status.textContent=tr('LOW VOLTAGE')+' '+state.systemVoltage.toFixed(1)+'V — '+tr('WEAK SPARK / MISFIRE');status.className='status-bar err'}
  else if(state.rpm>=engine.redline-30){status.textContent=tr('REV LIMITER')+' • '+Math.round(state.rpm)+' RPM';status.className='status-bar warn'}
  else if(state.fuelCut){status.textContent=tr('OVERRUN')+' • '+tr('FUEL CUT-OFF (DFCO)')+' • '+Math.round(state.rpm)+' RPM';status.className='status-bar'}
  else if(state.powerHP>5){status.textContent=tr('RUNNING')+' • '+state.powerHP.toFixed(0)+' HP @ '+Math.round(state.rpm)+' RPM • BMEP '+state.bmep.toFixed(1)+' bar';status.className='status-bar'}
  else{status.textContent=tr('IDLE / LOW LOAD')+' • '+Math.round(state.rpm)+' RPM';status.className='status-bar'}
  if(vizMode==='design')legend.innerHTML=tr('Bore/stroke set displacement. Octane+compression+boost+ignition feed the knock model.')+'<br>'+tr('Cooling (radiator/fan/oil cooler/thermostat) sets running temps in AUTO THERMAL mode.');
  else if(vizMode==='engine')legend.innerHTML=tr('THROTTLE makes power; LOAD (dyno brake) sets the hold RPM — more load = lower RPM, zero = free-rev to limiter.')+'<br>'+tr('Lift off at speed → engine braking + fuel cut. Detonation/overheat/lean-boost/over-rev wear the engine.');
  else legend.innerHTML=tr('Dyno shows full power & torque curves to redline.')+'<br>'+tr('Green line = current RPM. Peaks marked with dots.');
}

function setTab(mode){
  const prevMode=vizMode;
  if(mode!=='race'&&racePage.open)closeRacePage();
  if(mode!=='track'&&trackPage.open)closeTrackPage();
  vizMode=mode;
  ['Design','Vehicle','Garage','Track','Race','Engine','Dyno','Guide','Options'].forEach(m=>
    document.getElementById('tab'+m).classList.toggle('active',mode===m.toLowerCase()));
  // DESIGN / VEHICLE / GUIDE / OPTIONS are full-panel overlays that replace the canvas.
  const overlay=mode==='design'||mode==='vehicle'||mode==='garage'||mode==='guide'||mode==='options';
  canvas.style.display=overlay?'none':'block';
  // The canvas has no layout size while hidden, so re-measure whenever it comes back.
  if(!overlay)sizeCanvas();
  document.getElementById('designPanel').classList.toggle('active',mode==='design');
  document.getElementById('vehiclePanelTab').classList.toggle('active',mode==='vehicle');
  document.getElementById('garagePanel').classList.toggle('active',mode==='garage');
  if(mode==='garage')renderGarage();
  document.getElementById('guidePanel').classList.toggle('active',mode==='guide');
  document.querySelector('.main').classList.toggle('wide',mode==='guide');
  if(mode==='guide'&&typeof startGuideArt==='function')requestAnimationFrame(startGuideArt);   // after the panel has a size
  // On the track map a touch drag pans the map; everywhere else it must still scroll the page.
  canvas.style.touchAction=mode==='track'||mode==='race'?'none':'';
  document.getElementById('optionsPanel').classList.toggle('active',mode==='options');
  const dr=document.getElementById('dynoResult');if(dr){dr.hidden=(mode!=='dyno');if(mode==='dyno')renderDynoResult(true);}
  // Right column: runtime Engine Controls while driving/dyno; the Performance panel on VEHICLE.
  document.getElementById('controlsPanel').style.display=(mode==='engine'||mode==='dyno')?'':'none';
  document.getElementById('vehiclePanel').style.display=(mode==='vehicle')?'':'none';
  document.getElementById('trackPanel').style.display=(mode==='track')?'':'none';
  document.getElementById('racePanel').style.display=(mode==='race')?'':'none';
  // the engine's live readout belongs to the engine; on the track the lap has its own instruments
  document.getElementById('livePanel').style.display=(mode==='track'||mode==='race')?'none':'';
  if(mode==='vehicle'){buildVehicle();updateVehicleSummary();}
  if(mode==='track'){buildVehicle();refreshLap();}
  if(mode==='race'){const ts=document.getElementById('raceTrk');fillTrackSelect(ts,ts.value||trackKey);raceFillAdd();openRacePage(prevMode);renderRaceSetup();renderRacePanel(true);}
  updateUI();
}

