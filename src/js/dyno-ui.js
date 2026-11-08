// ---- the dyno result as a static sheet ----
// The DYNO canvas draws the pull with small tags, and the figures under it are the scorecard's — two
// different pulls, never labelled as such, so "what is the peak power?" had no clear answer short of
// exporting the PDF. This is the same information as the PDF's result band and run-data table, in
// real text under the curve: the BEST-POWER pull (the scorecard / objective figures) and YOUR pull
// as currently tuned (the curve drawn above, which is also what the PDF tabulates).
let dynoResultKey='';
// The pull's table, a row every 250 or 500 rpm, is behind a button: the cards above carry the peaks. Whether it is
// open is kept for the session and across a re-render.
let dynoTableOpen=false;
function dynoTableToggle(step){
  return '<div class="btn-row dr-tbl-btn"><button type="button" id="btnDynoTable" aria-expanded="'+dynoTableOpen+'" aria-controls="dynoTable" data-step="'+step+'">'
    +esc(tr(dynoTableOpen?'HIDE TABLE':'SHOW TABLE'))+' ('+tr('every')+' '+step+' rpm)</button></div>';
}
function toggleDynoTable(){
  dynoTableOpen=!dynoTableOpen;
  const t=document.getElementById('dynoTable'),b=document.getElementById('btnDynoTable');
  if(t)t.hidden=!dynoTableOpen;
  if(b){b.setAttribute('aria-expanded',String(dynoTableOpen));b.textContent=tr(dynoTableOpen?'HIDE TABLE':'SHOW TABLE')+' ('+tr('every')+' '+b.dataset.step+' rpm)';}
}
// The MORE menu on the DYNO tab: the same buttons, opened under it and closed by a pick, Escape or a click elsewhere.
function setMoreMenu(open){
  const m=document.getElementById('ctlMore'),b=document.getElementById('btnMore');if(!m||!b)return;
  m.classList.toggle('open',!!open);b.setAttribute('aria-expanded',String(!!open));
}
// Diagnose: read the build's specs, the scorecard and the as-tuned dyno pull (build 248).
// err  = not running smoothly (float, knock past the ECU, damage)
// warn = the pull or the cell is unfair right now (mixture, cold oil, overheat, low voltage)
// info = design character / trade-offs (race-cam lope, peaky band, reliability) — a GT3 that lopes is
//        still "smooth" in the fault sense; factory cars must not all read as broken.
// Thresholds come from KNOCK_TARGET, PISTON_SPEED_LIMIT and the scorecard, not fitted cut-offs.
function diagnoseEngine(){
  if(!engine||!engine.score)return {ok:false,smooth:false,findings:[{sev:'warn',id:'nobuild',
    title:tr('NO BUILD'),detail:tr('Nothing to diagnose yet.'),suggest:tr('Press BUILD & DYNO on the ENGINE tab.')}]};
  if(isElectric())return diagnoseMotor();
  const e=engine,s=e.score,findings=[],add=(sev,id,title,detail,suggest)=>findings.push({sev,id,title,detail,suggest});
  const knock=100-s.safety;
  // Valves float before the redline: the valvetrain cannot follow the cam (valvetrain.js / ICD).
  if(e.floatRpm>0&&e.floatRpm<e.redline)
    add('err','float',tr('VALVE FLOAT'),
      tr('The valves float at {f} rpm, before the {r} rpm redline.').replace('{f}',Math.round(e.floatRpm/100)*100).replace('{r}',e.redline),
      tr('Stiffer springs, lighter valves, a milder cam, or a lower redline.'));
  // Knock past what an AUTO ECU holds off (KNOCK_TARGET is the end-gas integral of 1).
  if(knock>KNOCK_TARGET+0.5)
    add('err','knock',tr('KNOCK PAST THE ECU'),
      tr('Worst knock on a stoich WOT sweep is {k}, above the limit of {t}.')
        .replace('{k}',Math.round(knock)).replace('{t}',KNOCK_TARGET),
      tr('More octane, less compression or boost, a larger intercooler, or AUTO ignition timing.'));
  // Cam-overlap lope only — engine.lumpiness also folds in diesel clatter and two-stroke ring-ding for
  // the sound, which are not a lumpy idle. VVT multiplies the same way the sound does.
  {const ov=Math.max(0,e.overlap||0),camLope=(ov/90)*(e.vvt?0.7:1);
    if(ov>=50&&camLope>=0.45)
      add('info','lope',tr('RACE-CAM IDLE LOPE'),
        tr('Cam overlap is {o}° — a lopey idle is normal for this cam, not a fault.')
          .replace('{o}',Math.round(ov)),
        tr('A milder cam or VVT if you want a smoother street idle.'));}
  // Narrow powerband / weak low-end: design character. Full band mark is 55% of redline; note only when
  // it is clearly peaky (<25%), so ordinary factory cars are not all flagged.
  if(s.band<e.redline*0.25)
    add('info','band',tr('PEAKY POWERBAND'),
      tr('Power stays above 80% of peak for only {b} rpm of a {r} rpm redline.')
        .replace('{b}',s.band).replace('{r}',e.redline),
      tr('A milder cam, longer intake runners, or less boost taper for a wider band.'));
  if(s.drive<40)
    add('info','drive',tr('WEAK LOW-END TORQUE'),
      tr('Torque at 2000 rpm is {d}% of peak.').replace('{d}',s.drive),
      tr('More displacement per cylinder, a milder cam, more low-rpm boost, or an ECU torque plateau.'));
  // Mean piston speed past the reliability limit (25 m/s, share-scoring.js).
  if(e.type!=='rotary'){
    const mps=2*(e.stroke_mm/1000)*e.redline/60;
    if(mps>PISTON_SPEED_LIMIT)
      add('info','piston',tr('HIGH PISTON SPEED'),
        tr('Mean piston speed at redline is {v} m/s (limit {l}).')
          .replace('{v}',mps.toFixed(1)).replace('{l}',PISTON_SPEED_LIMIT),
        tr('A shorter stroke, a lower redline, or accept the reliability cost.'));
  }
  // Cooling undersized for the scored peak power (same terms as the reliability index).
  {const coolNeed=clamp(s.peakHP/260,0,1.6);
    const coolHave=e.radCap*Math.max(260,e.radHp||0)/260+(e.oilCooler?0.4:0)+(e.fan==='none'?0:0.2);
    if(coolNeed>coolHave+0.05)
      add('info','cool',tr('UNDER-COOLED FOR THIS POWER'),
        tr('Peak power asks for more cooling than this radiator, fan and oil cooler give.'),
        tr('A larger radiator, an oil cooler, or a working fan; or less power.'));}
  // Petrol VGT: vane metal past creep (VANE_T_LIMIT) — reliability already charges it.
  if(e.vgt&&e.intake==='turbo'&&!e.ci&&e.peakEgtGas>VANE_T_LIMIT)
    add('info','vgt',tr('PETROL VGT HEAT'),
      tr('Exhaust at the vanes reaches {t} K; nickel alloys creep above {l} K.')
        .replace('{t}',Math.round(e.peakEgtGas)).replace('{l}',VANE_T_LIMIT),
      tr('Drop the boost, richen for cooler gas, or leave VGT to diesels.'));
  // As-tuned pull well below the best-power scorecard: mixture or conditions, not the design.
  {const data=getDynoData();let your=0;data.forEach(p=>{if(p.powerHP>your)your=p.powerHP;});
    if(s.peakHP>1&&your/s.peakHP<0.92)
      add('warn','tune',tr('AS-TUNED BELOW BEST-POWER'),
        tr('Your pull peaks at {y} hp against the best-power {b} hp.')
          .replace('{y}',your.toFixed(0)).replace('{b}',s.peakHP),
        tr('Set AFR nearer the best-power mixture (or AUTO fuel), cool the intake, and warm the oil.'));}
  if(s.emissions<40)
    add('info','emit',tr('DIRTY EMISSIONS'),
      tr('The cruise / part-load emit mark is {e}.').replace('{e}',s.emissions),
      tr('A catalytic converter, precise injection, less overlap, and a stoich cruise.'));
  if(s.reliability<45)
    add('info','rel',tr('LOW RELIABILITY INDEX'),
      tr('The design reliability index is {r}/100.').replace('{r}',s.reliability),
      tr('Ease knock, boost, piston speed or cooling — see the findings above.'));
  // Live bench state, if the engine is already hurting on the cell.
  if(state.blown)
    add('err','blown',tr('ENGINE BLOWN'),
      tr('The bench reports a failure')+' ('+tr(state.wearCause||'FAILURE')+').',
      tr('Rebuild with BUILD & DYNO, then fix the cause (knock, heat, float, lean boost).'));
  else if(state.wearCause)
    add('err','wear',tr('DAMAGE IN PROGRESS'),
      tr('Health is falling from')+' '+tr(state.wearCause)+'.',
      tr('Back off load and rpm; fix the cause before another pull.'));
  else if(state.coolant>115)
    add('warn','hot',tr('OVERHEAT ON THE BENCH'),
      tr('Coolant is at {t} °C.').replace('{t}',Math.round(state.coolant)),
      tr('More cooling, less load, or AUTO THERMAL.'));
  else if(state.oil<55)
    add('warn','oil',tr('COLD OIL'),
      tr('Oil is at {t} °C — friction is high and the pull is not fair.').replace('{t}',Math.round(state.oil)),
      tr('Warm the oil (AUTO THERMAL, or raise OIL TEMP) before reading the curve.'));
  else if(!e.dcdc&&state.systemVoltage<11.6)
    add('warn','volt',tr('LOW VOLTAGE / MISFIRE RISK'),
      tr('System voltage is {v} V.').replace('{v}',state.systemVoltage.toFixed(1)),
      tr('A stronger alternator, less electrical load, or a cooler idle.'));
  // "Not smooth" = faults or an unfair cell; design notes alone leave smooth true.
  const hasErr=findings.some(f=>f.sev==='err'),hasWarn=findings.some(f=>f.sev==='warn');
  return {ok:!hasErr,smooth:!hasErr&&!hasWarn,findings,grade:s.grade,overall:s.overall};
}
function diagnoseMotor(){
  const e=engine,s=e.score,findings=[],add=(sev,id,title,detail,suggest)=>findings.push({sev,id,title,detail,suggest});
  if(s.holdS!=null&&s.holdS<10)
    add('info','hold',tr('SHORT PEAK HOLD'),
      tr('Peak power only holds for {s} s before thermal cutback.').replace('{s}',s.holdS),
      tr('More motor cooling, a lower continuous rating demand, or accept the burst.'));
  if(state.soc!=null&&state.soc<0.15)
    add('warn','soc',tr('PACK LOW'),
      tr('State of charge is {p}% — the curve is already limited.').replace('{p}',Math.round(state.soc*100)),
      tr('Raise BATTERY CHARGE on the LIVE / DYNO controls before reading the pull.'));
  if(state.mT&&state.mT.w>140)
    add('warn','wind',tr('HOT WINDING'),
      tr('Winding temperature is {t} °C.').replace('{t}',Math.round(state.mT.w)),
      tr('Cool the motor, or ease the load until it recovers.'));
  if(state.blown||(state.engineHealth!=null&&state.engineHealth<0.3))
    add('err','health',tr('MOTOR DAMAGED'),
      tr('Motor health is low — rebuild the drive.'),
      tr('Press BUILD & DYNO after cooling and resetting abuse.'));
  const hasErr=findings.some(f=>f.sev==='err'),hasWarn=findings.some(f=>f.sev==='warn');
  return {ok:!hasErr,smooth:!hasErr&&!hasWarn,findings,grade:s.grade,overall:s.overall};
}
function dynoDiagHtml(d){
  if(!d)return '';
  if(!d.findings.length)
    return '<div class="dr-diag ok" id="dynoDiag"><h5>'+esc(tr('DIAGNOSIS'))+'</h5><p class="dr-diag-ok">'+
      esc(tr('Running smoothly — the scorecard, the valvetrain and the as-tuned pull show no issues.'))+'</p></div>';
  const onlyNotes=d.smooth&&d.findings.every(f=>f.sev==='info');
  const head=!d.smooth?tr('DIAGNOSIS — NOT RUNNING SMOOTH'):onlyNotes?tr('DIAGNOSIS — NOTES'):tr('DIAGNOSIS');
  const cls=!d.ok?' bad':onlyNotes?' notes':'';
  return '<div class="dr-diag'+cls+'" id="dynoDiag"><h5>'+esc(head)+'</h5><ul>'+
    d.findings.map(f=>'<li class="sev-'+f.sev+'"><b>'+esc(f.title)+'</b> — '+esc(f.detail)+
      ' <span class="sug">'+esc(tr('Try')+': '+f.suggest)+'</span></li>').join('')+
    '</ul></div>';
}
function renderDynoResult(force){
  if(isElectric())return renderMotorResult(force);
  const box=document.getElementById('dynoResult');
  if(!box||box.hidden||!engine.score)return;
  const data=getDynoData();
  const key=buildRev+'|'+dynoCacheKey+'|'+dynoPulls.length+'|'+currentLang+'|'+Math.round(state.coolant)+'|'+Math.round(state.oil)+'|'+state.systemVoltage.toFixed(1);
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
  const diag=diagnoseEngine();
  box.innerHTML='<h4>'+tr('DYNO RESULT')+'</h4>'+
    '<div class="dr-cards">'+
      card('hp',tr('PEAK POWER')+' — '+tr('BEST-POWER PULL'),s.peakHP+' hp',Math.round(kW(s.peakHP))+' kW @ '+s.peakHPrpm+' rpm')+
      card('tq',tr('PEAK TORQUE')+' — '+tr('BEST-POWER PULL'),s.peakTQ+' Nm',Math.round(lbft(s.peakTQ))+' lb-ft @ '+s.peakTQrpm+' rpm')+
      card('',tr('YOUR PULL (AS TUNED)'),pP.v.toFixed(1)+' hp',pT.v.toFixed(1)+' Nm @ '+pT.r+' • '+Math.round(kW(pP.v))+' kW @ '+pP.r)+
    '</div>'+
    '<p class="dr-note"><b>'+tr('BEST-POWER PULL')+'</b> — '+tr('wide open throttle at the best-power mixture, 25 °C intake, 90 °C coolant: the figures the grade and the objectives use, and what MAX POWER on the LIVE tab drives to.')+'<br>'+
    '<b>'+tr('YOUR PULL (AS TUNED)')+'</b> — '+tr('the curve drawn above, at the mixture and conditions set right now')+' ('+tuned+', '+Math.round(state.iat)+' °C). '+
    tr('It is what the PDF report tabulates.')+(dynoPulls.length?' '+dynoPulls.length+' '+tr('logged pull(s) overlaid on the chart.'):'')+'</p>'+
    dynoDiagHtml(diag)+
    dynoTableToggle(step)+
    '<table class="dr-table" id="dynoTable"'+(dynoTableOpen?'':' hidden')+'><thead><tr><th>RPM</th><th>HP</th><th>kW</th><th>Nm</th><th>lb-ft</th>'+(boosted?'<th>'+tr('BOOST')+' bar</th>':'')+'</tr></thead><tbody>'+
    rows.map(r=>{const v=at(r);return '<tr'+(near(r,pP.r)||near(r,pT.r)?' class="pk"':'')+'><td>'+r+'</td><td class="hp">'+v.hp.toFixed(1)+'</td><td>'+kW(v.hp).toFixed(1)+
      '</td><td class="tq">'+v.tq.toFixed(1)+'</td><td>'+lbft(v.tq).toFixed(1)+'</td>'+(boosted?'<td>'+Math.max(0,v.map-1).toFixed(2)+'</td>':'')+'</tr>';}).join('')+
    '</tbody></table>';
}
function drawDyno(){
  if(isElectric())return drawMotorDyno();
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
  updateHybridPanel();   // build 190: shown for a hybrid, hidden otherwise
  if(isElectric())return updateMotorUI();
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
  else if(hybBenchEngineOff()){status.textContent=tr('ENGINE OFF')+' • '+tr('ELECTRIC DRIVE')+' • '+tr('SHAFT')+' '+Math.round(hybBench.n)+' RPM';status.className='status-bar'}   // build 190
  else if(state.rpm>=engine.redline-30){status.textContent=tr('REV LIMITER')+' • '+Math.round(state.rpm)+' RPM';status.className='status-bar warn'}
  else if(state.fuelCut){status.textContent=tr('OVERRUN')+' • '+tr('FUEL CUT-OFF (DFCO)')+' • '+Math.round(state.rpm)+' RPM';status.className='status-bar'}
  else if(state.powerHP>5){status.textContent=tr('RUNNING')+' • '+state.powerHP.toFixed(0)+' HP @ '+Math.round(state.rpm)+' RPM • BMEP '+state.bmep.toFixed(1)+' bar';status.className='status-bar'}
  else{status.textContent=tr('IDLE / LOW LOAD')+' • '+Math.round(state.rpm)+' RPM';status.className='status-bar'}
  if(vizMode==='design')legend.innerHTML=tr('Bore/stroke set displacement. Octane+compression+boost+ignition feed the knock model.')+'<br>'+tr('Cooling (radiator/fan/oil cooler/thermostat) sets running temps in AUTO THERMAL mode.');
  else if(vizMode==='engine')legend.innerHTML=tr('THROTTLE makes power; LOAD (dyno brake) sets the hold RPM — more load = lower RPM, zero = free-rev to limiter.')+'<br>'+tr('Lift off at speed → engine braking + fuel cut. Detonation/overheat/lean-boost/valve float wear the engine.');
  else legend.innerHTML=tr('Dyno shows full power & torque curves to redline.')+'<br>'+tr('Green line = current RPM. Peaks marked with dots.');
}

function setTab(mode){
  const prevMode=vizMode;
  if(mode!=='race'&&racePage.open)closeRacePage();
  if(mode!=='track'&&trackPage.open)closeTrackPage();
  vizMode=mode;
  ['Design','Vehicle','Parts','Garage','Track','Race','Engine','Dyno','Guide','Options'].forEach(m=>
    document.getElementById('tab'+m).classList.toggle('active',mode===m.toLowerCase()));
  // DESIGN / VEHICLE / GUIDE / OPTIONS are full-panel overlays that replace the canvas.
  const overlay=mode==='design'||mode==='vehicle'||mode==='parts'||mode==='garage'||mode==='guide'||mode==='options';
  canvas.style.display=overlay?'none':'block';
  // The canvas has no layout size while hidden, so re-measure whenever it comes back.
  if(!overlay)sizeCanvas();
  document.getElementById('designPanel').classList.toggle('active',mode==='design');
  document.getElementById('vehiclePanelTab').classList.toggle('active',mode==='vehicle');
  document.getElementById('garagePanel').classList.toggle('active',mode==='garage');
  if(mode==='garage')renderGarage();
  document.getElementById('partsPanel').classList.toggle('active',mode==='parts');
  if(mode==='parts')renderParts();
  document.getElementById('guidePanel').classList.toggle('active',mode==='guide');
  // The right column holds the engine's live readout and controls (LIVE, DYNO), the car's figures (VEHICLE) and the
  // lap's and race's panels. The other tabs have nothing to put there, so their page takes the whole width.
  document.querySelector('.main').classList.toggle('wide',['guide','design','parts','garage','options'].includes(mode));
  if(mode==='guide'&&typeof startGuideArt==='function')requestAnimationFrame(startGuideArt);   // after the panel has a size
  // On the track map a touch drag pans the map; everywhere else it must still scroll the page.
  canvas.style.touchAction=mode==='track'||mode==='race'?'none':'';
  document.getElementById('optionsPanel').classList.toggle('active',mode==='options');
  const dr=document.getElementById('dynoResult');if(dr){dr.hidden=(mode!=='dyno');if(mode==='dyno')renderDynoResult(true);}
  // Right column: runtime Engine Controls while driving/dyno; the Performance panel on VEHICLE.
  document.getElementById('controlsPanel').style.display=(mode==='engine'||mode==='dyno')?'':'none';
  // On DYNO the controls below RESET fold into the MORE menu; on LIVE they stay laid out, since they drive the engine.
  document.getElementById('controlsPanel').classList.toggle('menu',mode==='dyno');
  setMoreMenu(false);
  document.getElementById('vehiclePanel').style.display=(mode==='vehicle')?'':'none';
  document.getElementById('trackPanel').style.display=(mode==='track')?'':'none';
  document.getElementById('racePanel').style.display=(mode==='race')?'':'none';
  // the engine's live readout belongs to the running engine: the LIVE and DYNO tabs only
  document.getElementById('livePanel').style.display=(mode==='engine'||mode==='dyno')?'':'none';
  if(mode==='vehicle'){buildVehicle();updateVehicleSummary();}
  if(mode==='track'){buildVehicle();refreshLap();}
  if(mode==='race'){const ts=document.getElementById('raceTrk');fillTrackSelect(ts,ts.value||trackKey);raceFillAdd();openRacePage(prevMode);renderRaceSetup();renderRacePanel(true);}
  updateUI();
}

