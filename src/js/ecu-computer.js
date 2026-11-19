// The bench laptop: a scope, the fuel/spark/VE tables, the fault list and a pull or lap delta.
// It reads the running state. It does not change the engine model.
const ECU_N=600;
const ecu={screen:'scope',map:'fuel',freeze:false,buf:[]};
function ecuNarrow(){return matchMedia('(max-width: 900px), (max-height: 520px)').matches;}
function ecuWants(){return ['engine','dyno','track','challenges'].includes(vizMode);}
function ecuMapsOn(){const el=document.getElementById('ecuComputer');return !!(el&&!el.hidden&&ecu.screen==='maps');}
function ecuSync(){
  const el=document.getElementById('ecuComputer'),btn=document.getElementById('btnEcu');
  const want=ecuWants(),narrow=ecuNarrow();
  if(btn)btn.hidden=!(want&&narrow);
  if(!el)return;
  el.hidden=!(want&&(!narrow||el.classList.contains('open')));
  ecuPlaceMaps();
  if(ecu.screen==='diag'&&!el.hidden)ecuRenderDiag();
  if(ecu.screen==='delta'&&!el.hidden)ecuRenderDelta();
}
function ecuScreen(name){
  ecu.screen=name;
  document.querySelectorAll('[data-ecu-screen]').forEach(s=>s.hidden=s.dataset.ecuScreen!==name);
  document.querySelectorAll('[data-ecu]').forEach(b=>b.classList.toggle('on',b.dataset.ecu===name));
  ecuSync();
}
function ecuPlaceMaps(){
  const home=document.getElementById('ecuMapHome'),host=document.getElementById('ecuMapHost');
  const el=document.getElementById('ecuComputer');
  if(!home||!host||!el)return;
  const docked=!el.hidden&&ecu.screen==='maps';
  const to=docked?host:home,from=docked?home:host;
  while(from.firstChild)to.appendChild(from.firstChild);
  ['fuel','spark','ve'].forEach(k=>{
    ['MapHdr','MapBox','MapEdit'].forEach(suf=>{
      const n=document.getElementById(k+'Map'+suf.slice(3));
      if(!n)return;
      if(!docked||k===ecu.map)delete n.dataset.ecuHide;else n.dataset.ecuHide='1';
    });
  });
}
function ecuSel(){return ecu.map==='spark'?skSel:ecu.map==='ve'?veSel:fmSel;}
function ecuNudge(steps){
  if(!ecuSel()){flash(tr('Tap a cell to select'));return;}
  if(ecu.map==='fuel')adjustFmCell((engine.ci?0.08:0.02)*steps);
  else if(ecu.map==='spark')adjustSkCell(steps);
  else adjustVeCell(steps);
}
function ecuHold(){
  const sel=ecuSel();
  if(!sel||!engine){flash(tr('Tap a cell to select'));return;}
  const rpm=fmRpmAt(sel.c),aim=Math.min(rpm,0.99*engine.redline);
  state.load=loadForRpm(aim);
  state.throttle=clamp(fmMapAtRC(sel.r,sel.c)/Math.max(0.4,engine.mapMax||1),0.08,1);
  if(typeof syncSliders==='function')syncSliders();
  if(vizMode!=='engine')setTab('engine');
  flash(tr('HOLD CELL')+' • '+Math.round(rpm)+' rpm');
}
function ecuSample(){
  if(ecu.freeze||!engine)return;
  const ev=typeof isElectric==='function'&&isElectric();
  const row=ev
    ?[state.systemVoltage||0,state.battI||0,state.mT?state.mT.w:0,(state.soc||0)*100]
    :[state.rpm||0,state.map||1,(engine.stoichAFR?state.afr/engine.stoichAFR:1),state.knockRisk||0];
  ecu.buf.push(row);
  if(ecu.buf.length>ECU_N)ecu.buf.shift();
}
function ecuDrawScope(){
  const c=document.getElementById('ecuScope');if(!c||ecu.buf.length<2)return;
  const g=c.getContext('2d'),w=c.width,h=c.height,still=matchMedia('(prefers-reduced-motion: reduce)').matches;
  g.fillStyle='#04140c';g.fillRect(0,0,w,h);
  const cols=['#00ff88','#ffcc00','#00ccff','#ff6666'];
  const src=still?[ecu.buf[ecu.buf.length-1]]:ecu.buf;
  for(let ch=0;ch<4;ch++){
    let lo=Infinity,hi=-Infinity;
    ecu.buf.forEach(row=>{lo=Math.min(lo,row[ch]);hi=Math.max(hi,row[ch]);});
    if(!(hi>lo)){lo-=1;hi+=1;}
    g.strokeStyle=cols[ch];g.beginPath();
    src.forEach((row,i)=>{
      const x=src.length<2?w/2:i/(src.length-1)*(w-8)+4;
      const y=h-8-(row[ch]-lo)/(hi-lo)*(h-16);
      if(i)g.lineTo(x,y);else g.moveTo(x,y);
    });
    if(src.length<2){g.lineTo(w-4,h/2);g.moveTo(4,h/2);}
    g.stroke();
  }
}
function ecuLeds(){
  const set=(id,on)=>{const n=document.getElementById(id);if(n)n.classList.toggle('on',!!on);};
  if(!engine)return;
  set('ecuLedLink',state.firing||state.ignOn);
  set('ecuLedLoop',engine.afrMode==='auto'&&state.coolant>70);
  set('ecuLedKnock',state.knockRisk>40);
  let base=state.afr;
  try{base=mappedAFR(state.rpm,state.map);}catch(e){}
  set('ecuLedEgt',engine.intake==='turbo'&&state.afr<base-0.2);
  const mil=typeof obdLamp==='function'?obdLamp():'';
  set('ecuLedMil',mil==='on'||mil==='flash');
}
function ecuRenderDiag(){
  const box=document.getElementById('ecuDiag');if(!box)return;
  const d=typeof diagnoseEngine==='function'?diagnoseEngine():{findings:[]};
  let h='';
  (d.findings||[]).forEach(f=>{h+='<p class="ecu-find"><b>'+f.title+'</b><br>'+f.detail+'</p>';});
  const keys=typeof obd!=='undefined'&&obd.codes?Object.keys(obd.codes):[];
  if(!keys.length)h+='<p>'+tr('No codes stored.')+'</p>';
  keys.forEach(k=>{h+='<p class="ecu-find"><b>'+k+'</b> <button type="button" data-ff="'+k+'">'+tr('REPRODUCE FREEZE FRAME')+'</button></p>';});
  box.innerHTML=h;
}
function ecuReproduce(k){
  const f=obd.codes[k]&&obd.codes[k].ff;if(!f||!engine)return;
  state.load=loadForRpm(Math.min(f.rpm,0.99*engine.redline));
  state.coolant=f.coolant;
  if(engine.afrMode!=='auto')state.afr=f.lam*(engine.stoichAFR||14.7);
  state.throttle=clamp((f.map||1)/Math.max(0.4,engine.mapMax||1),0.08,1);
  if(typeof syncSliders==='function')syncSliders();
  if(vizMode!=='engine'&&vizMode!=='dyno')setTab('engine');
  flash(tr('FREEZE FRAME')+' • '+k);
}
function ecuRenderDelta(){
  const box=document.getElementById('ecuDelta');if(!box)return;
  if((vizMode==='track'||vizMode==='challenges')&&lapResult&&typeof replayAt==='function'){
    const s=replayAt(lapResult,(typeof lapReplay!=='undefined'&&lapReplay.t)||0);
    box.textContent=Math.round(s.v)+' km/h • '+Math.round(s.rpm)+' rpm • G'+s.gear+' • '+s.gLat.toFixed(2)+' g';
    return;
  }
  const pull=dynoPulls&&dynoPulls[0];
  if(!pull){box.textContent=tr('Log a pull to compare.');return;}
  const pts=pull.pts,rpm=state.rpm;let i=0;while(i<pts.length-1&&pts[i+1].rpm<rpm)i++;
  const a=pts[i],b=pts[Math.min(pts.length-1,i+1)],f=b.rpm===a.rpm?0:(rpm-a.rpm)/(b.rpm-a.rpm);
  const hp=a.powerHP+(b.powerHP-a.powerHP)*f,tq=a.torque+(b.torque-a.torque)*f;
  box.textContent='dHP '+(state.powerHP-hp).toFixed(1)+' • dNm '+(state.torque-tq).toFixed(1);
}
function ecuTick(){
  const el=document.getElementById('ecuComputer');
  if(!el||el.hidden)return;
  ecuSample();ecuLeds();
  if(ecu.screen==='scope')ecuDrawScope();
  if(ecu.screen==='maps'&&typeof updateFuelMapMarker==='function')updateFuelMapMarker();
}
function bindEcu(){
  const el=document.getElementById('ecuComputer');if(!el)return;
  el.addEventListener('click',e=>{
    const scr=e.target.closest('[data-ecu]');if(scr){ecuScreen(scr.dataset.ecu);return;}
    const mp=e.target.closest('[data-ecu-map]');if(mp){ecu.map=mp.dataset.ecuMap;ecuPlaceMaps();return;}
    const ff=e.target.closest('[data-ff]');if(ff)ecuReproduce(ff.dataset.ff);
  });
  document.getElementById('ecuFreeze').addEventListener('click',()=>{ecu.freeze=!ecu.freeze;document.getElementById('ecuFreeze').classList.toggle('on',ecu.freeze);});
  document.getElementById('ecuN5').addEventListener('click',()=>ecuNudge(-5));
  document.getElementById('ecuN1').addEventListener('click',()=>ecuNudge(-1));
  document.getElementById('ecuP1').addEventListener('click',()=>ecuNudge(1));
  document.getElementById('ecuP5').addEventListener('click',()=>ecuNudge(5));
  document.getElementById('ecuHold').addEventListener('click',ecuHold);
  const open=document.getElementById('btnOpenEcu');
  if(open)open.addEventListener('click',()=>{setTab('engine');ecuScreen('maps');});
  const tog=document.getElementById('btnEcu');
  if(tog)tog.addEventListener('click',()=>{el.classList.toggle('open');ecuSync();});
  document.addEventListener('keydown',e=>{
    if(!ecuMapsOn()||e.target.closest('input,select,textarea'))return;
    const sel=ecuSel();if(!sel)return;
    const move={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,1],ArrowDown:[0,-1]}[e.key];
    if(!move)return;
    e.preventDefault();
    const c=sel.c+move[0],r=sel.r+move[1];
    if(ecu.map==='spark')selectSkCell(c,r);else if(ecu.map==='ve')selectVeCell(c,r);else selectFmCell(c,r);
  });
  ecuScreen('scope');
}
