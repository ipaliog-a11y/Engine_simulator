// ---- CHAMP tab: season setup, standings, round-by-round or instant simulate ----
const champUI={phase:'hub',busy:false,lastRun:null,prog:0,progTxt:''};
function champUnlockedIds(){
  const C=champCareer();
  // a series with unlock:X opens once X is finished (or the series itself was added to unlocked)
  return CHAMP_SERIES.filter(s=>{
    if(!s.unlock)return true;
    if(C.unlocked.indexOf(s.id)>=0)return true;
    return (C.finished||[]).indexOf(s.unlock)>=0;
  }).map(s=>s.id);
}
function champFillSeriesSel(){
  const sel=document.getElementById('champSeries');if(!sel)return;
  const open=new Set(champUnlockedIds());
  sel.innerHTML=CHAMP_SERIES.map(s=>{
    const lock=!open.has(s.id);
    return '<option value="'+s.id+'"'+(lock?' disabled':'')+'>'+esc(tr(s.name))+(lock?' ('+tr('LOCKED')+')':'')+'</option>';
  }).join('');
}
function champRenderHub(){
  const box=document.getElementById('champHub');if(!box)return;
  const S=champActive(),hist=champHistory(),career=champCareer(),team=champEnsureTeam();
  let html='';
  if(S&&!S.done){
    html+='<div class="design-section">'+tr('ACTIVE SEASON')+'</div>';
    html+='<div class="perf-note">'+esc(tr(S.name))+' • '+tr('ROUND')+' '+(S.roundIdx+1)+'/'+S.calendar.length+
      (S.economy?' • '+tr('CREDITS')+' '+Math.round(S.economy.credits):'')+'</div>';
    html+='<div class="build-row"><button id="champResume">'+tr('CONTINUE')+'</button>'+
      '<button id="champAbandon">'+tr('ABANDON')+'</button></div>';
  }else{
    html+='<div class="design-section">'+tr('NEW SEASON')+'</div>';
    html+='<div class="field"><label for="champSeries">'+tr('SERIES')+'</label><select id="champSeries"></select></div>';
    html+='<div class="race-row"><div class="field"><label for="champSeed">'+tr('SEED')+'</label>'+
      '<div class="race-seed"><input type="number" id="champSeed" min="1" max="99999" step="1" value="'+(1+Math.floor(Math.random()*99999))+'">'+
      '<button id="champReroll" type="button" aria-label="'+esc(tr('New seed'))+'">🎲</button></div></div>';
    html+='<div class="field"><label for="champMode">'+tr('MODE')+'</label><select id="champMode">'+
      '<option value="round">'+tr('ROUND BY ROUND')+'</option>'+
      '<option value="instant">'+tr('INSTANT SEASON')+'</option>'+
      '<option value="career">'+tr('CAREER')+'</option></select></div></div>';
    html+='<label class="race-check"><input type="checkbox" id="champUseTeam"> <span>'+tr('USE MY TEAM')+'</span></label>';
    html+='<div class="perf-note" id="champEligNote" hidden style="color:#ff8833"></div>';
    html+='<div class="build-row"><button id="champStart">'+tr('START SEASON')+'</button></div>';
  }
  html+='<div class="design-section">'+tr('TEAM')+'</div>';
  html+='<div class="perf-note">'+esc(team.name)+' • '+tr('CREDITS')+' '+Math.round(career.credits)+'</div>';
  html+='<div class="field"><label for="champTeamName">'+tr('TEAM NAME')+'</label><input id="champTeamName" value="'+esc(team.name)+'"></div>';
  html+='<div class="field"><label for="champTeamDriver">'+tr('DRIVER')+'</label><select id="champTeamDriver">'+
    Object.entries(RACE_DRIVERS).map(([k,d])=>'<option value="'+k+'"'+(team.cars[0]&&team.cars[0].driver===k?' selected':'')+'>'+esc(tr(d.label))+'</option>').join('')+
    '</select></div>';
  html+='<div class="field"><label for="champTeamCar">'+tr('CAR')+'</label><select id="champTeamCar"></select></div>';
  html+='<div class="build-row"><button id="champSaveTeam">'+tr('SAVE TEAM')+'</button></div>';
  if(hist.length){
    html+='<div class="design-section">'+tr('HISTORY')+'</div><table class="race-tower"><thead><tr><th>'+tr('SERIES')+
      '</th><th>'+tr('CHAMPION')+'</th><th>'+tr('PTS')+'</th></tr></thead><tbody>';
    hist.forEach(h=>{
      const top=(h.standings&&h.standings[0])||{};
      html+='<tr><td class="nm">'+esc(tr(h.name||h.seriesId))+'</td><td class="nm">'+esc(top.name||'—')+
        '</td><td>'+(top.pts!=null?top.pts:'—')+'</td></tr>';
    });
    html+='</tbody></table>';
  }
  box.innerHTML=html;
  if(!S||S.done){
    champFillSeriesSel();
    const serSel=document.getElementById('champSeries');
    if(serSel)serSel.addEventListener('change',()=>{drawChamp();champUpdateEligNote();});
    const modeSel=document.getElementById('champMode');
    if(modeSel)modeSel.addEventListener('change',champUpdateEligNote);
    const useT=document.getElementById('champUseTeam');
    if(useT)useT.addEventListener('change',champUpdateEligNote);
    const rr=document.getElementById('champReroll');
    if(rr)rr.addEventListener('click',()=>{document.getElementById('champSeed').value=1+Math.floor(Math.random()*99999);});
    document.getElementById('champStart').addEventListener('click',champStartSeason);
  }else{
    document.getElementById('champResume').addEventListener('click',()=>champShowSeason(S));
    document.getElementById('champAbandon').addEventListener('click',()=>{champClearActive();champRenderHub();flash(tr('SEASON ABANDONED'));});
  }
  const carSel=document.getElementById('champTeamCar');
  if(carSel){
    raceFillAdd('champTeamCar');
    if(team.cars[0]&&team.cars[0].ref)carSel.value=team.cars[0].ref;
    carSel.addEventListener('change',champUpdateEligNote);
  }
  const saveT=document.getElementById('champSaveTeam');
  if(saveT)saveT.addEventListener('click',()=>{
    const T=champEnsureTeam();
    T.name=document.getElementById('champTeamName').value||'PLAYER TEAM';
    T.cars=[{ref:document.getElementById('champTeamCar').value||'cur',
      driver:document.getElementById('champTeamDriver').value||'balanced',number:1}];
    champSaveTeam(T);champUpdateEligNote();flash(tr('TEAM SAVED'));
  });
  champUpdateEligNote();
}
function champUpdateEligNote(){
  const note=document.getElementById('champEligNote');if(!note)return;
  const serSel=document.getElementById('champSeries'),modeSel=document.getElementById('champMode'),useT=document.getElementById('champUseTeam');
  const active=(useT&&useT.checked)||(modeSel&&modeSel.value==='career');
  if(!active||!serSel){note.hidden=true;return;}
  const series=champSeries(serSel.value),T=champEnsureTeam();
  const carSel=document.getElementById('champTeamCar');
  const teamView=carSel?Object.assign({},T,{cars:[{ref:carSel.value||'cur',driver:(T.cars&&T.cars[0]&&T.cars[0].driver)||'balanced'}]}):T;
  const chk=champCheckTeamEligibility(teamView,series);
  if(chk.ok){note.hidden=true;return;}
  const cls=CHAMP_CLASSES[series.classId];
  note.textContent=tr('TEAM CAR NOT ELIGIBLE FOR CLASS')+' ('+tr((cls&&cls.label)||series.classId)+'): '+chk.bad.join(', ');
  note.hidden=false;
}
function champStartSeason(){
  const seriesId=document.getElementById('champSeries').value;
  const seed=+document.getElementById('champSeed').value||1;
  const mode=document.getElementById('champMode').value||'round';
  const useTeam=document.getElementById('champUseTeam').checked;
  const series=champSeries(seriesId);
  const open=champUnlockedIds();
  if(open.indexOf(seriesId)<0){flash(tr('SERIES LOCKED'),'warn');return;}
  if(useTeam||mode==='career'){
    const chk=champCheckTeamEligibility(champEnsureTeam(),series);
    if(!chk.ok){
      const cls=CHAMP_CLASSES[series.classId];
      flash(tr('TEAM CAR NOT ELIGIBLE FOR CLASS')+' ('+tr((cls&&cls.label)||series.classId)+'): '+chk.bad.join(', '),'warn');
      return;
    }
  }
  if(mode==='career'&&(champCareer().credits||0)<CHAMP.entryFee){
    flash(tr('INSUFFICIENT CREDITS'),'warn');return;
  }
  const S=champNewSeason(seriesId,{seed,mode,useTeam:useTeam||mode==='career',credits:champCareer().credits});
  if(mode==='instant')champRunInstant(S);
  else champShowSeason(S);
}
function champShowSeason(S){
  champUI.phase='season';
  document.getElementById('champHub').hidden=true;
  document.getElementById('champSeason').hidden=false;
  champRenderSeason(S);
}
function champBackHub(){
  champUI.phase='hub';
  document.getElementById('champHub').hidden=false;
  document.getElementById('champSeason').hidden=true;
  champRenderHub();
}
function champWatchReplay(){
  const R=champUI.lastRun||raceUI.run;
  if(!R){flash(tr('NO REPLAY AVAILABLE'),'warn');return;}
  raceUI.run=R;raceUI.phase='live';raceUI.t=0;raceUI.playing=true;raceUI.follow=-1;
  const pb=document.getElementById('racePlay');if(pb){pb.textContent=tr('PAUSE');pb.classList.add('on');}
  setTab('race');
}
function champRenderSeason(S){
  const box=document.getElementById('champSeason');if(!box)return;
  const round=S.calendar[S.roundIdx];
  const done=!!S.done||S.roundIdx>=S.calendar.length;
  const modeTag=S.mode==='career'?tr('CAREER'):tr('SANDBOX');
  let tyreNote='';
  if(S.economy&&S.economy.tyres&&S.economy.tyres.length){
    const team=champTeam(),tid=team&&team.id;
    const idx=Math.max(0,S.entrants.findIndex(e=>e.teamId&&(!tid||e.teamId===tid)));
    const ts=S.economy.tyres[idx];
    if(ts)tyreNote=' • '+tr('TYRES')+' '+ts.dry+'D/'+ts.wet+'W';
  }
  let html='<div class="perf-head">'+esc(tr(S.name))+' • '+esc(modeTag)+(S.economy?' • '+tr('CREDITS')+' '+Math.round(S.economy.credits)+tyreNote:'')+'</div>';
  if(!done&&round){
    const trk=(TRACKS[round.track]||{}).label||round.track;
    html+='<div class="perf-note">'+tr('ROUND')+' '+(S.roundIdx+1)+'/'+S.calendar.length+' • '+esc(trk)+
      (round.durationMin?' • '+round.durationMin+' '+tr('min'):' • '+round.laps+' '+tr('LAPS'))+
      ' • '+esc(tr((round.weather||'dry').toUpperCase()))+'</div>';
  }
  html+='<div class="design-section">'+tr('STANDINGS')+'</div>';
  html+=champStandingsTable(S.standings);
  if(S.teamStandings&&S.teamStandings.length){
    html+='<div class="design-section">'+tr('CONSTRUCTORS')+'</div>'+champStandingsTable(S.teamStandings,true);
  }
  if(S.regs&&S.regs.multiClass&&S.classIds){
    S.classIds.forEach(cid=>{
      const cls=CHAMP_CLASSES[cid];
      html+='<div class="design-section">'+esc(tr((cls&&cls.label)||cid))+'</div>'+
        champStandingsTable(champClassStandings(S.standings,cid));
    });
  }
  html+='<div class="race-prog" id="champProg" '+(champUI.busy?'':'hidden')+'><div class="race-prog-track"><div class="race-prog-bar" style="width:'+
    Math.round(champUI.prog*100)+'%"></div></div><span>'+esc(champUI.progTxt||'')+'</span></div>';
  html+='<div class="build-row">';
  if(!done)html+='<button id="champNext" '+(champUI.busy?'disabled':'')+'>'+tr('RUN ROUND')+'</button>';
  else html+='<div class="perf-note">'+tr('SEASON COMPLETE')+' — '+(S.standings[0]?esc(S.standings[0].name):'—')+'</div>';
  if((champUI.lastRun||raceUI.run)&&S.results.length)html+='<button id="champWatch" '+(champUI.busy?'disabled':'')+'>'+tr('WATCH REPLAY')+'</button>';
  html+='<button id="champToHub">'+tr('BACK')+'</button></div>';
  if(S.results.length){
    html+='<div class="design-section">'+tr('RESULTS')+'</div><table class="race-tower"><thead><tr><th>#</th><th>'+
      tr('CIRCUIT')+'</th><th>'+tr('WINNER')+'</th></tr></thead><tbody>';
    S.results.forEach((r,i)=>{
      const w=(r.classification&&r.classification[0])||{};
      html+='<tr><td>'+(i+1)+'</td><td class="nm">'+esc((TRACKS[r.track]||{}).label||r.track)+
        '</td><td class="nm">'+esc(w.name||'—')+'</td></tr>';
    });
    html+='</tbody></table>';
  }
  box.innerHTML=html;
  const back=document.getElementById('champToHub');if(back)back.addEventListener('click',champBackHub);
  const next=document.getElementById('champNext');
  if(next)next.addEventListener('click',()=>champRunNext(S));
  const watch=document.getElementById('champWatch');
  if(watch)watch.addEventListener('click',champWatchReplay);
}
function champStandingsTable(rows,isTeam){
  if(!rows||!rows.length)return '<div class="perf-note">—</div>';
  let h='<table class="race-tower"><thead><tr><th>P</th><th>'+tr(isTeam?'TEAM':'DRIVER')+
    '</th><th>'+tr('PTS')+'</th><th>'+tr('WINS')+'</th></tr></thead><tbody>';
  rows.forEach((s,i)=>{
    h+='<tr><td>'+(i+1)+'</td><td class="nm">'+esc(s.name)+'</td><td>'+s.pts+'</td><td>'+s.wins+'</td></tr>';
  });
  return h+'</tbody></table>';
}
async function champRunNext(S){
  if(champUI.busy||S.done)return;
  champUI.busy=true;champUI.prog=0;champUI.progTxt=tr('SOLVING');champRenderSeason(S);
  try{
    const R=await champSimulateRound(S,{
      onProg:(p,txt)=>{champUI.prog=p;champUI.progTxt=tr(txt||'');const pg=document.getElementById('champProg');
        if(pg){pg.hidden=false;pg.querySelector('.race-prog-bar').style.width=Math.round(p*100)+'%';pg.querySelector('span').textContent=champUI.progTxt;}}
    });
    champUI.lastRun=R;
    // hand the race to the race page for replay
    raceUI.entrants=S.entrants.map(e=>({name:e.name,build:e.build,strat:e.strat,base:e.base||e.name}));
    raceUI.run=R;raceUI.t=0;raceUI.playing=true;raceUI.phase='live';raceUI.follow=-1;
    flash(tr('ROUND COMPLETE'));
    if(S.done)flash(tr('SEASON COMPLETE')+': '+(S.standings[0]?S.standings[0].name:''));
  }catch(err){
    flash(tr('ROUND FAILED')+': '+(err&&err.message||err),'err');
  }
  champUI.busy=false;champRenderSeason(champActive()||S);
}
async function champRunInstant(S){
  champUI.busy=true;champUI.prog=0;champUI.progTxt=tr('ROUND')+' 1/'+S.calendar.length;
  champShowSeason(S);
  const totalRounds=Math.max(1,S.calendar.length);
  try{
    await champSimulateSeason(S,{
      onProg:(p,txt)=>{
        const frac=clamp((S.roundIdx+p)/totalRounds,0,1);
        champUI.prog=frac;champUI.progTxt=tr('ROUND')+' '+Math.min(S.roundIdx+1,totalRounds)+'/'+totalRounds+(txt?' • '+tr(txt):'');
        const pg=document.getElementById('champProg');
        if(pg){pg.hidden=false;pg.querySelector('.race-prog-bar').style.width=Math.round(frac*100)+'%';pg.querySelector('span').textContent=champUI.progTxt;}
      },
      onRound:i=>{champUI.prog=i/totalRounds;champUI.progTxt=tr('ROUND')+' '+(i+1)+'/'+totalRounds;champRenderSeason(S);},
      onRoundDone:R=>{
        champUI.lastRun=R;
        raceUI.entrants=S.entrants.map(e=>({name:e.name,build:e.build,strat:e.strat,base:e.base||e.name}));
        raceUI.run=R;raceUI.t=0;raceUI.playing=true;raceUI.phase='live';raceUI.follow=-1;
      }
    });
    flash(tr('SEASON COMPLETE')+': '+(S.standings[0]?S.standings[0].name:''));
  }catch(err){flash(tr('SEASON FAILED')+': '+(err&&err.message||err),'err');}
  champUI.busy=false;champRenderSeason(champActive()||S);
}
function bindChamp(){
  champRenderHub();
}
function refreshChamp(){
  if(champUI.phase==='season'){
    const S=champActive();if(S)champRenderSeason(S);else champBackHub();
  }else champRenderHub();
}
function drawChamp(){
  const S=champActive();
  if(champUI.phase==='season'&&S&&S.calendar&&S.calendar.length){
    const idx=Math.min(S.roundIdx,S.calendar.length-1),rd=S.calendar[idx];
    const dist=rd.durationMin?rd.durationMin+' '+tr('min'):rd.laps+' '+tr('LAPS');
    const sub=S.done
      ?[tr('SEASON COMPLETE')+' • '+(S.standings[0]?S.standings[0].name:'—')]
      :[tr('ROUND')+' '+(idx+1)+'/'+S.calendar.length+' • '+dist+' • '+tr('Press RUN ROUND to race.')];
    drawTrackPreview(rd.track,{weather:rd.weather||'dry',title:tr(S.name),sub});
    return;
  }
  const sel=document.getElementById('champSeries');
  const ser=(sel&&champSeries(sel.value))||(S&&!S.done&&champSeries(S.seriesId))||CHAMP_SERIES[0];
  if(!ser||!ser.calendar||!ser.calendar.length){
    drawTrackPreview(trackKey,{weather:'dry',title:tr('CHAMPIONSHIP'),sub:[tr('Pick a series on the right, then START SEASON.')]});
    return;
  }
  const rd0=ser.calendar[0];
  const cls=CHAMP_CLASSES[ser.classId];
  const cal=ser.calendar.map((r,i)=>'R'+(i+1)+' '+((TRACKS[r.track]||{}).label||r.track)).join(' · ');
  const calLine=cal.length>76?cal.slice(0,75)+'…':cal;
  drawTrackPreview(rd0.track,{weather:rd0.weather||'dry',title:tr(ser.name),
    sub:[ser.calendar.length+' '+tr('ROUNDS')+(cls?' • '+tr(cls.label):'')+' • '+tr('Pick a series and press START SEASON.'),calLine]});
}
