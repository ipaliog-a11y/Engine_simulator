// ---- RACE tab (build 137; weather, per-car strategy and the report, build 141): pick the cars, compute the race, then watch it ----
// Nothing here drives a car. The viewer can pause, change the speed, scrub, follow a car and zoom the
// map; everything the cars do was settled by raceRun before the first frame was drawn.
const RACE_COLS=['#ff4466','#33ccff','#ffcc00','#55dd66','#ff8833','#cc66ff','#eeeeee','#ff77cc'];
const RACE_MAX=8;
const raceUI={entrants:[],run:null,phase:'setup',t:0,playing:true,speed:5,follow:-1,panelAt:0,prog:0,progTxt:'',scrubbing:false};
function raceTyreColour(T,th){
  if(T<th.tOpt-th.tWin)return '#4aa3ff';
  if(T<=th.tOpt+th.tWin*0.5)return '#00ff88';
  if(T<=th.tOpt+th.tWin)return '#ffcc00';
  return '#ff4444';
}
function fillTrackSelect(sel,value){
  sel.innerHTML='';
  const groups=[['TEST CIRCUITS',t=>!t.real&&!t.imported],['REAL CIRCUITS',t=>t.real],['IMPORTED',t=>t.imported]];
  for(const [name,f] of groups){
    const keys=Object.keys(TRACKS).filter(k=>f(TRACKS[k]));if(!keys.length)continue;
    const g=document.createElement('optgroup');g.label=tr(name);
    for(const k of keys){const o=document.createElement('option');o.value=k;o.textContent=TRACKS[k].label;g.appendChild(o);}
    sel.appendChild(g);
  }
  sel.value=TRACKS[value]?value:Object.keys(TRACKS)[0];
}
// Where an entrant can come from: what is built now, the garage's cars, and the factory cars.
function raceFillAdd(){
  const sel=document.getElementById('raceAddSel');if(!sel)return;
  const cars=garage.filter(g=>gKind(g)==='car');
  let h='<optgroup label="'+esc(tr('THIS BUILD'))+'"><option value="cur">'+esc(tr('The car on the VEHICLE tab'))+'</option></optgroup>';
  if(cars.length)h+='<optgroup label="'+esc(tr('GARAGE'))+'">'+cars.map(g=>'<option value="g:'+esc(g.id)+'">'+esc(g.name)+'</option>').join('')+'</optgroup>';
  const cats=[...new Set(FACTORY_CARS.map(p=>p.cat))];
  for(const c of cats)h+='<optgroup label="'+esc(tr(c))+'">'+FACTORY_CARS.map((p,i)=>p.cat===c?'<option value="p:'+i+'">'+esc(p.name)+'</option>':'').join('')+'</optgroup>';
  const keep=sel.value;sel.innerHTML=h;if(keep&&[...sel.options].some(o=>o.value===keep))sel.value=keep;
}
function raceEntrantFrom(v){
  if(v==='cur'){
    if(!powertrain().ready()||!vehicle||!vehicle.mass){flash(tr('BUILD A CAR FIRST'),'warn');return null;}
    const name=(loaded.car&&loaded.car.name)||((engine.name?engine.name+' · ':'')+tr(vehicle.chLabel||'')).trim()||tr('This build');
    return {name,build:serializeBuild(name,'')};
  }
  if(v.startsWith('g:')){const g=garage.find(x=>x.id===v.slice(2));return g?{name:g.name,build:JSON.parse(JSON.stringify(g.build))}:null;}
  if(v.startsWith('p:')){
    const p=FACTORY_CARS[+v.slice(2)],ep=p&&FACTORY_ENGINES.find(x=>x.name===p.engine);if(!ep)return null;
    return {name:p.name,build:{engine:Object.assign({},ep.engine),tune:Object.assign({},STD_TUNE),vehicle:vehicleFromPreset(p),name:p.name}};
  }
  return null;
}
function raceAdd(v){
  if(raceUI.entrants.length>=RACE_MAX){flash(tr('EIGHT CARS AT MOST'),'warn');return;}
  const e=raceEntrantFrom(v||document.getElementById('raceAddSel').value);if(!e)return;
  const same=raceUI.entrants.filter(x=>x.base===e.name).length;
  e.base=e.name;if(same)e.name=e.name+' #'+(same+1);
  e.strat={stops:'auto',mode:'normal',start:'auto',wetCall:'auto',driver:'balanced'};
  raceUI.entrants.push(e);renderRaceSetup();
}
// Each car's own plan (build 141): how many stops, how hard it is driven, what it starts on, and whether it
// changes tyres for the weather.
const RACE_STRAT={
  stops:[['auto','AUTO STOPS'],['0','NO STOP'],['1','1 STOP'],['2','2 STOPS'],['3','3 STOPS'],['none','NO PITS']],
  mode:[['push','PUSH'],['normal','NORMAL'],['save','SAVE FUEL']],
  start:[['auto','TYRES: AUTO'],['own','OWN TYRES'],['inter','INTERS'],['wet','WETS']],
  wetCall:[['auto','WET CALL: AUTO'],['stay','STAY OUT']],
  driver:Object.entries(RACE_DRIVERS).map(([k,d])=>[k,'DRIVER: '+d.label])
};
function renderRaceSetup(){
  const box=document.getElementById('raceEntrants');if(!box)return;
  const sel=(k,f,v)=>'<select class="opt-select" data-k="'+k+'" data-f="'+f+'" aria-label="'+f+'">'+RACE_STRAT[f].map(([val,lb])=>
    '<option value="'+val+'"'+(String(v)===val?' selected':'')+'>'+esc(tr(lb))+'</option>').join('')+'</select>';
  box.innerHTML=raceUI.entrants.length?raceUI.entrants.map((e,k)=>
    '<div class="race-ent"><i style="background:'+RACE_COLS[k]+'"></i><span title="'+esc(e.name)+'">'+esc(e.name)+'</span>'+
    '<button data-rm="'+k+'" aria-label="'+esc(tr('Remove'))+'">✕</button></div>'+
    '<div class="race-strat">'+sel(k,'driver',e.strat.driver||'balanced')+sel(k,'stops',e.strat.stops)+sel(k,'mode',e.strat.mode)+sel(k,'start',e.strat.start)+sel(k,'wetCall',e.strat.wetCall)+'</div>').join('')
    :'<div class="perf-note">'+tr('Add two or more cars: the car you have built, a garage build or a factory car.')+'</div>';
  box.querySelectorAll('button[data-rm]').forEach(b=>b.addEventListener('click',()=>{raceUI.entrants.splice(+b.dataset.rm,1);renderRaceSetup();}));
  box.querySelectorAll('select[data-k]').forEach(sl=>sl.addEventListener('change',()=>{const e=raceUI.entrants[+sl.dataset.k];if(e)e.strat[sl.dataset.f]=sl.value;}));
  const st=document.getElementById('raceStart');if(st)st.disabled=raceUI.entrants.length<2||raceUI.phase==='computing';
  document.getElementById('raceSetup').hidden=raceUI.phase==='live';
  document.getElementById('raceLive').hidden=raceUI.phase!=='live';
  const pg=document.getElementById('raceProg');
  if(pg){pg.hidden=raceUI.phase!=='computing';pg.querySelector('.race-prog-bar').style.width=Math.round(raceUI.prog*100)+'%';pg.querySelector('span').textContent=raceUI.progTxt;}
  raceTopInfo();
}
function raceConfig(){
  const g=id=>document.getElementById(id);
  return {track:g('raceTrk').value,laps:clamp(Math.round(+g('raceLaps').value||5),1,100),
    strategy:'auto',grid:g('raceGrid').value,warmers:g('raceWarmers').checked,
    weather:g('raceWeather').value,air:+g('raceAir').value||RACE.air,
    cars:raceUI.entrants.map(e=>{const x=Object.assign({},e.strat);if(/^\d$/.test(x.stops))x.stops=+x.stops;return x;}),
    seed:(Math.round(+g('raceSeed').value)>>>0)||1};
}
const raceYield=()=>new Promise(r=>setTimeout(r,0));
async function raceStart(){
  if(raceUI.phase==='computing'||raceUI.entrants.length<2)return;
  const cfg=raceConfig();
  raceUI.phase='computing';raceUI.prog=0;raceUI.progTxt='';raceUI.run=null;renderRaceSetup();
  const models=[];
  try{
    for(let k=0;k<raceUI.entrants.length;k++){
      const e=raceUI.entrants[k];
      raceUI.progTxt=tr('SOLVING')+' '+e.name;raceUI.prog=k/raceUI.entrants.length*0.75;renderRaceSetup();
      await raceYield();await raceYield();
      models.push(raceCarModel(e,cfg.track,{wet:cfg.weather!=='dry'}));
    }
    raceUI.progTxt=tr('RACING');renderRaceSetup();await raceYield();
    const R=raceInit(models,cfg);
    const est=Math.max(...models.map(M=>M.lapNom))*cfg.laps*1.15;
    while(!raceRun(R,40)){raceUI.prog=0.75+0.25*Math.min(1,R.t/est);renderRaceSetup();await raceYield();}
    raceUI.run=R;raceUI.t=0;raceUI.playing=true;raceUI.follow=-1;raceUI.phase='live';
    const rb=document.querySelector('.race-body');if(rb)rb.scrollTop=0;
    const rs=document.getElementById('raceSide');if(rs)rs.scrollTop=0;
    trackViewReset();
    const pb=document.getElementById('racePlay');if(pb){pb.textContent=tr('PAUSE');pb.classList.add('on');}
  }catch(err){
    raceUI.phase='setup';flash(tr('RACE FAILED')+': '+(err&&err.message||err),'err');
  }
  renderRaceSetup();renderRacePanel(true);
}
// ---- reading the recording back ----
function raceSample(R,k,t){
  const rc=R.rec,K=rc.K,d=rc.data[k],x=clamp(t/rc.dt,0,rc.n-1),a=Math.floor(x),b=Math.min(rc.n-1,a+1),f=x-a;
  const A=a*K,B=b*K,M=R.cars[k].M;
  const lerp=o=>d[A+o]+(d[B+o]-d[A+o])*f;
  let pa=d[A],pb=d[B];if(pb<pa-M.n/2)pb+=M.n;   // over the line
  return {pos:(pa+(pb-pa)*f)%M.n,v:lerp(1),T:[lerp(2),lerp(3),lerp(4),lerp(5)],W:[lerp(6),lerp(7),lerp(8),lerp(9)],
    fuelL:lerp(10),brk:lerp(11),flag:d[(f<0.5?A:B)+12],sTot:lerp(13),pass:d[A+14],laps:d[(f<0.5?A:B)+15],
    brkR:lerp(16),tyre:d[(f<0.5?A:B)+17],wet:lerp(18),def:d[A+19]>0.5};
}
// The time (s) the car reached race distance s, from its own recording.
function raceTimeAt(R,k,s){
  const rc=R.rec,K=rc.K,d=rc.data[k];
  let lo=0,hi=rc.n-1;
  if(d[hi*K+13]<s)return null;
  while(hi-lo>1){const mid=(lo+hi)>>1;if(d[mid*K+13]<s)lo=mid;else hi=mid;}
  const a=d[lo*K+13],b=d[hi*K+13],f=b>a?(s-a)/(b-a):0;
  return (lo+clamp(f,0,1))*rc.dt;
}
// The order and the gaps at time t.
function raceStandings(R,t){
  const S=R.cars.map((c,k)=>{
    const s=raceSample(R,k,t);
    const fin=R.events.find(e=>e.type==='finish'&&e.car===c.id&&e.t<=t);
    const dnf=R.events.find(e=>e.type==='dnf'&&e.car===c.id&&e.t<=t);
    const laps=c.laps.filter(l=>l.end<=t);
    const pits=R.events.filter(e=>e.car===c.id&&e.type==='pit'&&e.t<=t);
    const lastOut=R.events.filter(e=>e.car===c.id&&e.type==='pitout'&&e.t<=t).pop();
    return {k,c,s,fin,dnf,laps,last:laps.length?laps[laps.length-1].t:null,best:laps.length?Math.min(...laps.map(l=>l.t)):null,
      pits:pits.length,inPit:s.flag===1&&!fin,tyreAge:lastOut?laps.filter(l=>l.end>lastOut.t).length:laps.length};
  });
  S.sort((a,b)=>{
    if(a.dnf&&!b.dnf)return 1;if(b.dnf&&!a.dnf)return -1;
    if(a.fin&&b.fin)return b.laps.length-a.laps.length||a.fin.t-b.fin.t;
    if(a.fin&&!b.fin)return b.s.sTot>a.s.sTot+1?1:-1;
    if(b.fin&&!a.fin)return a.s.sTot>b.s.sTot+1?-1:1;
    return b.s.sTot-a.s.sTot;
  });
  const lead=S[0],Lc=R.Lc;
  S.forEach((x,p)=>{
    x.pos=p+1;
    if(p===0){x.gap=null;return;}
    const ld=lead.laps.length-x.laps.length;
    if(x.dnf){x.gap='DNF';return;}
    if(x.fin&&lead.fin&&ld===0){x.gap='+'+(x.fin.t-lead.fin.t).toFixed(1);return;}
    const down=Math.floor((lead.s.sTot-x.s.sTot)/Lc);
    if(down>=1&&!x.fin){x.gap='+'+down+' '+tr(down>1?'LAPS':'LAP');return;}
    if(x.fin&&ld>0){x.gap='+'+ld+' '+tr(ld>1?'LAPS':'LAP');return;}
    const tl=raceTimeAt(R,lead.k,x.s.sTot);
    x.gap=tl==null?'—':'+'+Math.max(0,t-tl).toFixed(1);
  });
  return S;
}
function raceFastest(R,t){
  let best=null;for(const c of R.cars)for(const l of c.laps)if(l.end<=t&&(!best||l.t<best.t))best={t:l.t,car:c.id};
  return best;
}
const raceEventText=(R,e)=>{
  const nm=id=>{const c=R.cars.find(x=>x.id===id);return c?c.M.name:'?';};
  switch(e.type){
    case 'pass':return nm(e.car)+' '+tr('passes')+' '+nm(e.on);
    case 'pit':return nm(e.car)+' '+tr('pits')+' — '+(e.fuelL>0?e.fuelL.toFixed(1)+' L, ':'')+tr(raceCompound(e.tyre).label)+', '+(RACE.pitLoss+e.service).toFixed(1)+' s';
    case 'rain':return tr('Rain is falling');
    case 'dry':return tr('The track is dry');
    case 'pitout':return nm(e.car)+' '+tr('rejoins');
    case 'mistake':return nm(e.car)+' — '+tr('a mistake, off line');
    case 'dive':return e.ok?nm(e.car)+' '+tr('dives down the inside of')+' '+nm(e.on):nm(e.car)+' '+tr('runs wide trying to pass')+' '+nm(e.on);
    case 'defend':return nm(e.car)+' '+tr('defends from')+' '+nm(e.from);
    case 'blue':return tr('Blue flag')+': '+nm(e.car);
    case 'dnf':return nm(e.car)+' — '+tr('OUT')+' ('+tr(e.why)+')';
    case 'finish':return 'P'+e.pos+' '+nm(e.car)+' — '+tr('FINISH');
    default:return '';
  }
};
// The compound a car is on at a recorded moment, and how a compound is shown: a letter in its colour.
const RACE_TYRE_LOOK={eco:['E','#99ccaa'],street:['T','#cccccc'],sport:['S','#ffcc00'],semi:['M','#ff8833'],slick:['R','#ff4444'],drag:['D','#cc66ff'],inter:['I','#33dd66'],wet:['W','#3399ff']};
function raceSampleTyre(c,s){return s.tyre===1?raceCompound('inter'):s.tyre===2?raceCompound('wet'):c.M.tyre;}
function raceTyreBadge(ty){const L=RACE_TYRE_LOOK[ty.key]||['?','#888'];return '<b class="race-ty" style="color:'+L[1]+';border-color:'+L[1]+'" title="'+esc(tr(ty.label))+'">'+L[0]+'</b>';}
function raceWeatherText(w){
  const x=w/RACE.wetFull;
  return x<0.02?'☀ '+tr('DRY'):x<0.5?'🌦 '+tr('DAMP')+' '+Math.round(x*100)+'%':'🌧 '+tr('WET')+' '+Math.round(x*100)+'%';
}
// ---- the panel: controls, the timing tower, the cars' telemetry, the result ----
function renderRacePanel(force){
  const R=raceUI.run;if(!R||raceUI.phase!=='live')return;
  const now=performance.now();if(!force&&now-raceUI.panelAt<100)return;raceUI.panelAt=now;
  raceTopInfo();
  const t=raceUI.t,S=raceStandings(R,t),fl=raceFastest(R,t),done=t>=R.t-1e-6;
  const sc=document.getElementById('raceScrub');if(sc&&!raceUI.scrubbing)sc.value=Math.round(t/R.t*1000);
  const lapNow=Math.min(R.cfg.laps,Math.max(1,S[0].laps.length+(S[0].fin?0:1)));
  const wNow=S[0].s.wet;
  document.getElementById('raceHead').innerHTML='<b>'+esc(TRACKS[R.cfg.track].label)+'</b> • '+tr('LAP')+' '+lapNow+'/'+R.cfg.laps+' • '+fmtLap(t)+
    (fl?' • '+tr('FASTEST')+' <span class="race-fl">'+fmtLap(fl.t)+'</span>':'')+
    '<br>'+raceWeatherText(wNow)+' • '+tr('AIR')+' '+R.cfg.air+'°C • '+tr('TRACK')+' '+Math.round(raceTrackTemp(R.cfg.air,wNow))+'°C';
  const row=x=>{
    const c=x.c,col=RACE_COLS[c.id];
    const lastCls=x.last!=null&&fl&&x.last===fl.t&&fl.car===c.id?'race-fl':(x.last!=null&&x.last===x.best?'race-pb':'');
    return '<tr data-car="'+c.id+'" class="'+(raceUI.follow===c.id?'sel':'')+'"><td>'+x.pos+'</td><td class="nm"><i style="background:'+col+'"></i>'+esc(c.M.name)+'</td>'+
      '<td>'+(x.pos===1?(x.fin?tr('FLAG'):tr('LEADER')):x.gap)+'</td>'+
      '<td class="'+lastCls+'">'+(x.inPit?tr('PIT'):x.last!=null?fmtLap(x.last):'—')+'</td>'+
      '<td class="'+(fl&&x.best===fl.t&&fl.car===c.id?'race-fl':'')+'">'+(x.best!=null?fmtLap(x.best):'—')+'</td>'+
      '<td>'+raceTyreBadge(raceSampleTyre(c,x.s))+'</td><td>'+x.pits+'</td></tr>';
  };
  document.getElementById('raceTower').innerHTML='<table class="race-tower"><thead><tr><th>P</th><th>'+tr('CAR')+'</th><th>'+tr('GAP')+'</th><th>'+tr('LAST')+'</th><th>'+tr('BEST')+'</th><th>'+tr('TYRE')+'</th><th>'+tr('PIT')+'</th></tr></thead><tbody>'+S.map(row).join('')+'</tbody></table>';
  document.querySelectorAll('#raceTower tr[data-car]').forEach(tr_=>tr_.addEventListener('click',()=>{
    const id=+tr_.dataset.car;raceUI.follow=raceUI.follow===id?-1:id;
    if(raceUI.follow<0)trackViewReset();else trackView.z=Math.max(trackView.z,3);   // the camera goes in close on the car
    renderRacePanel(true);}));
  // telemetry: every car, in race order
  const tyre=(T,W,th,lbl)=>'<div class="rt-t" style="border-color:'+raceTyreColour(T,th)+'"><b style="color:'+raceTyreColour(T,th)+'">'+Math.round(T)+'°</b><span>'+lbl+' '+Math.round(W*100)+'%</span></div>';
  document.getElementById('raceTele').innerHTML=S.map(x=>{
    const c=x.c,M=c.M,s=x.s,th=raceSampleTyre(c,s),fpl=c.plan.fpl/M.fuelRho||M.fuelPerLapKg/M.fuelRho;
    const fade=Math.round((1-brakeFadeAt(s.brk,M.brakeTh))*100);
    const fuelPct=clamp(s.fuelL/M.tankL,0,1),lapsLeft=fpl>0?s.fuelL/fpl:0;
    const state=x.dnf?tr('OUT'):x.fin?tr('FINISHED'):x.inPit?tr('IN THE PITS'):Math.round(s.v*3.6)+' km/h';
    return '<div class="rt-card'+(raceUI.follow===c.id?' sel':'')+'"><div class="rt-head"><i style="background:'+RACE_COLS[c.id]+'"></i><span>P'+x.pos+' '+esc(M.name)+'</span><em>'+state+'</em></div>'+
      '<div class="rt-body"><div class="rt-tyres">'+tyre(s.T[0],s.W[0],th,'FL')+tyre(s.T[1],s.W[1],th,'FR')+tyre(s.T[2],s.W[2],th,'RL')+tyre(s.T[3],s.W[3],th,'RR')+'</div>'+
      '<div class="rt-side"><div class="rt-k">'+esc(tr(th.label))+' • '+tr('age')+' '+x.tyreAge+'</div>'+
      '<div class="rt-k">'+tr(M.ev?'ENERGY':'FUEL')+' '+s.fuelL.toFixed(1)+' / '+M.tankL+' '+(M.unit||'L')+' • '+lapsLeft.toFixed(1)+' '+tr('laps')+'</div>'+
      (M.ev?raceEvLine(c,t):'')+
      '<div class="rt-bar"><div style="width:'+Math.round(fuelPct*100)+'%;background:'+(lapsLeft<1.5?'#ff4444':lapsLeft<3?'#ffcc00':'#00ccff')+'"></div></div>'+
      '<div class="rt-k">'+tr('BRAKES')+' <b style="color:'+brakeTempColour(s.brk,M.brakeOnset)+'">'+Math.round(s.brk)+'°</b> / <b style="color:'+brakeTempColour(s.brkR,M.brakeOnset)+'">'+Math.round(s.brkR)+'°C</b>'+
        (fade>0?' <b style="color:#ff4444">'+tr('FADE')+' −'+fade+'%</b>':'')+'</div>'+
      '<div class="rt-k">'+tr(RACE_STRAT.mode.find(m=>m[0]===c.cc.mode)[1])+' • '+tr(c.cc.drv.label||'BALANCED')+(s.def?' • <b style="color:#ffcc00">'+tr('DEFENDING')+'</b>':'')+'</div></div></div></div>';
  }).join('');
  // the result, at the flag
  const res=document.getElementById('raceResults');
  if(done){
    const rs=raceResults(R),flAll=raceFastest(R,R.t);
    res.innerHTML='<div class="design-section">'+tr('Result')+'</div><table class="race-tower"><thead><tr><th>P</th><th>'+tr('CAR')+'</th><th>'+tr('TIME')+'</th><th>'+tr('BEST')+'</th><th>'+tr('PIT')+'</th><th>'+tr('FUEL')+'</th></tr></thead><tbody>'+
      rs.map(x=>'<tr><td>'+(x.state==='dnf'?'—':x.pos)+'</td><td class="nm"><i style="background:'+RACE_COLS[x.id]+'"></i>'+esc(x.name)+'</td><td>'+
        (x.state==='dnf'?'DNF':x.pos===1?fmtLap(x.time):x.lapsDown>0?'+'+x.lapsDown+' '+tr(x.lapsDown>1?'LAPS':'LAP'):'+'+(x.gap||0).toFixed(1))+'</td><td class="'+(flAll&&flAll.car===x.id?'race-fl':'')+'">'+(x.best!=null?fmtLap(x.best):'—')+
        '</td><td>'+x.stops+' '+x.stints.map(st=>raceTyreBadge(raceCompound(st.tyre))).join('')+'</td><td>'+x.fuelL.toFixed(1)+' '+(x.unit||'L')+'</td></tr>').join('')+'</tbody></table>'+
      '<div class="perf-note">'+tr('Grid')+': '+rs.slice().sort((a,b)=>a.grid-b.grid).map(x=>x.grid+'. '+esc(x.name)).join(' · ')+' • '+tr('seed')+' '+R.cfg.seed+'</div>';
  }else res.innerHTML='';
}
function stepRaceView(dt){
  const R=raceUI.run;if(!R||raceUI.phase!=='live')return;
  if(raceUI.playing&&!raceUI.scrubbing){
    raceUI.t=Math.min(R.t,raceUI.t+dt*raceUI.speed);
    if(raceUI.t>=R.t){raceUI.playing=false;const pb=document.getElementById('racePlay');if(pb){pb.textContent=tr('PLAY');pb.classList.remove('on');}renderRacePanel(true);}
  }
  renderRacePanel(false);
}
// ---- the map ----
function drawRace(){
  const W=vizW,H=vizH;
  ctx.fillStyle=C.bg;ctx.fillRect(0,0,W,H);
  drawPixelRect(0,0,W,28,'#12121c');
  ctx.fillStyle=C.yellow;ctx.font='10px "Press Start 2P"';
  const R=raceUI.run;
  ctx.fillText(tr('RACE')+(R?' • '+TRACKS[R.cfg.track].label:''),12,19);
  if(!R||raceUI.phase!=='live'){
    ctx.font='8px "Press Start 2P"';ctx.fillStyle='#778';
    if(raceUI.phase==='computing'){
      ctx.fillText(raceUI.progTxt,12,60);
      ctx.fillStyle='#26263a';ctx.fillRect(12,72,W-24,10);ctx.fillStyle=C.green;ctx.fillRect(12,72,(W-24)*raceUI.prog,10);
    }else{
      ctx.fillText(tr('Pick two or more cars on the right,'),12,60);
      ctx.fillText(tr('then START RACE. Nobody drives:'),12,76);
      ctx.fillText(tr('the cars race on their own physics.'),12,92);
    }
    return;
  }
  const t=raceUI.t,S=raceStandings(R,t),topBar=40,botBar=34;
  // the clock and the lap, in the title bar
  const lapNow=Math.min(R.cfg.laps,Math.max(1,S[0].laps.length+(S[0].fin?0:1)));
  ctx.textAlign='right';ctx.font='7px "Press Start 2P"';ctx.fillStyle='#99a';
  const spd=raceUI.speed+'×'+(raceUI.playing?'':' ❚❚');ctx.fillText(spd,W-44,19);
  const sw=ctx.measureText(spd).width+14;
  ctx.fillStyle=C.green;ctx.font='10px "Press Start 2P"';ctx.fillText(tr('LAP')+' '+lapNow+'/'+R.cfg.laps+'  '+fmtLap(t),W-44-sw,19);
  ctx.textAlign='left';
  ctx.font='6px "Press Start 2P"';ctx.fillStyle='#88aacc';ctx.textAlign='right';
  ctx.fillText(raceWeatherText(S[0].s.wet)+'  '+R.cfg.air+'°C',W-44,topBar-2);ctx.textAlign='left';
  const T=buildTrack(R.cfg.track);
  const {px,py,scV}=trackMapView(T,W,H,topBar,botBar,W);
  // follow a car: pan the view so it stays in the middle
  if(raceUI.follow>=0){
    const k=R.cars.findIndex(c=>c.id===raceUI.follow),M=R.cars[k].M,s=raceSample(R,k,t),i=Math.floor(s.pos)%M.n,j=(i+1)%M.n,f=s.pos-Math.floor(s.pos);
    const q={x:M.line[i].x+(M.line[j].x-M.line[i].x)*f,y:M.line[i].y+(M.line[j].y-M.line[i].y)*f};
    trackView.x+=trackView.mcx-px(q);trackView.y+=trackView.mcy-py(q);
  }
  ctx.save();ctx.beginPath();ctx.rect(0,topBar-8,W,H-topBar-botBar+8);ctx.clip();
  drawTrackSurface(T,px,py,scV);
  const wNow=S[0].s.wet,wx=wNow/RACE.wetFull;
  if(wx>0.02){   // a wet surface: the ribbon darkened and sheened blue
    ctx.globalAlpha=0.45*wx;ctx.fillStyle='#1d3a66';trackRibbon(ctx,T,px,py,scV,3);ctx.globalAlpha=1;
  }
  const p0=T.pts[0];
  ctx.fillStyle='#fff';ctx.fillRect(px(p0)-4,py(p0)-4,8,8);ctx.fillStyle='#000';ctx.fillRect(px(p0)-2,py(p0)-2,4,4);
  // the cars, back of the field first so the leader is drawn on top
  const pitN=[];
  for(const x of S.slice().reverse()){
    const k=x.k,c=x.c,M=c.M,s=x.s;
    if(x.dnf&&s.v<0.1&&s.flag===3){continue;}
    if(s.flag===1||(x.fin&&s.v<0.1&&t>x.fin.t+0.5)){pitN.push(x);continue;}
    const i=Math.floor(s.pos)%M.n,j=(i+1)%M.n,f=s.pos-Math.floor(s.pos);
    const q={x:M.line[i].x+(M.line[j].x-M.line[i].x)*f,y:M.line[i].y+(M.line[j].y-M.line[i].y)*f};
    let cx=px(q),cy=py(q);const hd=Math.atan2(py(M.line[j])-py(M.line[i]),px(M.line[j])-px(M.line[i]));
    if(s.pass>0.5){const o=Math.max(5,2.5*scV);cx+=Math.sin(hd)*o;cy-=Math.cos(hd)*o;}   // alongside
    drawTopCar(ctx,cx,cy,hd,RACE_COLS[c.id],'thr');
    ctx.font='6px "Press Start 2P"';ctx.fillStyle=RACE_COLS[c.id];ctx.fillText(String(x.pos),cx+7,cy-6);
    if(raceUI.follow===c.id){ctx.strokeStyle='#fff';ctx.lineWidth=1;ctx.strokeRect(cx-9,cy-9,18,18);}
  }
  // rain, falling at the race clock's pace
  if(wx>0.02){
    ctx.strokeStyle='rgba(150,180,255,'+(0.25+0.3*wx)+')';ctx.lineWidth=1;ctx.beginPath();
    const nDrops=Math.round(40+160*wx),ph=t*9;
    for(let k=0;k<nDrops;k++){
      const x0=((k*97.13)%W+ph*37*(1+k%3))%W,y0=topBar+((k*53.7+ph*120*(1+k%2))%(H-topBar-botBar));
      ctx.moveTo(x0,y0);ctx.lineTo(x0-3,y0+9);
    }
    ctx.stroke();
  }
  ctx.restore();
  // pit lane / finished cars, parked by the line
  ctx.font='6px "Press Start 2P"';
  pitN.forEach((x,n)=>{const bx=W-110,by=topBar+8+n*11;ctx.fillStyle=RACE_COLS[x.c.id];ctx.fillRect(bx,by-5,6,6);
    ctx.fillStyle='#99a';ctx.fillText((x.fin?tr('FINISHED'):tr('PIT'))+' P'+x.pos,bx+10,by+1);});
  // the order, top-left: only when the timing tower is not beside the map (a phone, where it sits below)
  ctx.font='6px "Press Start 2P"';
  if(!racePage.open||innerWidth<=800)S.forEach((x,n)=>{const y=topBar+8+n*11;ctx.fillStyle='rgba(10,10,18,0.75)';ctx.fillRect(8,y-7,150,10);
    ctx.fillStyle=RACE_COLS[x.c.id];ctx.fillRect(10,y-5,6,6);ctx.fillStyle='#ddd';
    const nm=x.c.M.name.length>13?x.c.M.name.slice(0,12)+'…':x.c.M.name;
    ctx.fillText(x.pos+' '+nm,20,y+1);ctx.fillStyle='#889';ctx.textAlign='right';ctx.fillText(x.pos===1?'':String(x.gap),156,y+1);ctx.textAlign='left';});
  // what just happened
  const ev=R.events.filter(e=>e.t<=t&&e.type!=='lap'&&e.type!=='blue'&&e.type!=='defend').slice(-2);
  ctx.font='7px "Press Start 2P"';
  ev.forEach((e,n)=>{ctx.fillStyle=n===ev.length-1?'#ffcc00':'#778';ctx.fillText(fmtLap(e.t)+'  '+raceEventText(R,e),12,H-botBar+10+n*12);});
  if(t>=R.t-1e-6){
    const txt='🏁 '+tr('WINNER')+': '+S[0].c.M.name;ctx.font='9px "Press Start 2P"';
    const w=ctx.measureText(txt).width+20,y=H-botBar-14;
    ctx.fillStyle='rgba(10,10,18,0.85)';ctx.fillRect(W/2-w/2,y-12,w,18);
    ctx.fillStyle='#fff';ctx.textAlign='center';ctx.fillText(txt,W/2,y+1);ctx.textAlign='left';
  }
}
function bindRace(){
  const g=id=>document.getElementById(id);
  fillTrackSelect(g('raceTrk'),trackKey);
  g('raceSeed').value=1+Math.floor(Math.random()*99999);
  g('raceReroll').addEventListener('click',()=>{g('raceSeed').value=1+Math.floor(Math.random()*99999);});
  g('raceAddBtn').addEventListener('click',()=>raceAdd());
  g('raceStart').addEventListener('click',raceStart);
  g('racePlay').addEventListener('click',()=>{
    const R=raceUI.run;if(!R)return;
    if(!raceUI.playing&&raceUI.t>=R.t)raceUI.t=0;
    raceUI.playing=!raceUI.playing;g('racePlay').textContent=tr(raceUI.playing?'PAUSE':'PLAY');g('racePlay').classList.toggle('on',raceUI.playing);
  });
  g('raceSpeed').addEventListener('change',e=>{raceUI.speed=+e.target.value||1;});
  g('raceSkip').addEventListener('click',()=>{if(raceUI.run){raceUI.t=raceUI.run.t;renderRacePanel(true);}});
  g('raceNew').addEventListener('click',()=>{raceUI.phase='setup';raceUI.run=null;raceUI.follow=-1;renderRaceSetup();});
  g('raceRptPng').addEventListener('click',exportRacePNG);
  g('raceRptPdf').addEventListener('click',exportRacePDF);
  const sc=g('raceScrub');
  sc.addEventListener('input',()=>{if(!raceUI.run)return;raceUI.scrubbing=true;raceUI.t=raceUI.run.t*(+sc.value)/1000;renderRacePanel(true);});
  sc.addEventListener('change',()=>{raceUI.scrubbing=false;});
  raceFillAdd();renderRaceSetup();
}
// ---- the race page (build 141): RACE as a page of its own, filling the window ----
// Opening it moves the map canvas and the RACE panel into the page (the same elements, so every draw,
// zoom, pan and handler keeps working untouched) and sizes the canvas to the page's stage; closing puts
// both back where they came from. The page holds everything the race needs, which is also the seam along
// which it could one day be lifted out as a game of its own.
const racePage={open:false,from:'track',homes:null};
function sizeRaceStage(){
  if(!racePage.open)return;
  const r=document.getElementById('raceStage').getBoundingClientRect();
  if(!(r.width>0&&r.height>0))return;
  // the drawing grid follows the stage: about one unit per CSS pixel on a desktop, no narrower than 560
  // on a phone (below that the pixel font stops being readable)
  vizW=Math.round(clamp(r.width,560,1100));
  vizH=Math.round(clamp(vizW*r.height/r.width,380,1400));
  sizeCanvas();
}
function openRacePage(from){
  if(racePage.open)return;
  const pg=document.getElementById('racePage'),panel=document.getElementById('racePanel');
  racePage.homes=[[canvas,canvas.parentNode,canvas.nextSibling],[panel,panel.parentNode,panel.nextSibling]];
  racePage.from=from&&from!=='race'?from:'track';
  document.getElementById('raceStage').appendChild(canvas);
  document.getElementById('raceSide').appendChild(panel);
  pg.hidden=false;document.body.classList.add('race-open');racePage.open=true;
  canvas.style.display='block';panel.style.display='';
  sizeRaceStage();
}
function closeRacePage(){
  if(!racePage.open)return;
  if(document.fullscreenElement)(document.exitFullscreen||document.webkitExitFullscreen||(()=>{})).call(document);
  for(const [el,home,next] of racePage.homes)home.insertBefore(el,next&&next.parentNode===home?next:null);
  document.getElementById('racePage').hidden=true;document.body.classList.remove('race-open');racePage.open=false;
  vizW=640;vizH=420;sizeCanvas();
}
function raceTopInfo(){
  const el=document.getElementById('raceTopInfo');if(!el)return;
  const R=raceUI.run;
  if(!R||raceUI.phase!=='live'){el.textContent=raceUI.phase==='computing'?raceUI.progTxt:tr('Set up the race');return;}
  const S=raceStandings(R,raceUI.t),lapNow=Math.min(R.cfg.laps,Math.max(1,S[0].laps.length+(S[0].fin?0:1)));
  el.textContent=TRACKS[R.cfg.track].label+' • '+tr('LAP')+' '+lapNow+'/'+R.cfg.laps+' • '+fmtLap(raceUI.t)+' • '+raceWeatherText(S[0].s.wet);
}
function bindRacePage(){
  document.getElementById('raceBack').addEventListener('click',()=>setTab(racePage.from));
  const fs=document.getElementById('raceFs'),pg=document.getElementById('racePage');
  if(!(pg.requestFullscreen||pg.webkitRequestFullscreen))fs.hidden=true;
  fs.addEventListener('click',()=>{
    if(!document.fullscreenElement)(pg.requestFullscreen||pg.webkitRequestFullscreen).call(pg);
    else (document.exitFullscreen||document.webkitExitFullscreen).call(document);
  });
  addEventListener('resize',sizeRaceStage);
  addEventListener('keydown',e=>{if(e.key==='Escape'&&racePage.open&&!document.fullscreenElement)setTab(racePage.from);});
}
