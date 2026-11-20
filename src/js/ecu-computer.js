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
// Scope channels: name, unit, decimals and the scale the trace is drawn on. A fixed physical scale (0 to redline, 0 to
// 100 %) keeps a steady value flat instead of stretching noise across the screen; a reading outside it widens it.
function ecuChannels(ev){
  const e=engine||{};
  return ev
    ?[{n:'VOLT',u:'V',d:0,lo:0,hi:null},{n:'AMPS',u:'A',d:0,lo:0,hi:(e.pack&&e.pack.iMax)||null},
      {n:'WIND',u:'°C',d:0,lo:0,hi:200},{n:'SOC',u:'%',d:0,lo:0,hi:100}]
    :[{n:'RPM',u:'',d:0,lo:0,hi:e.redline||null},{n:'MAP',u:'bar',d:2,lo:0,hi:Math.max(1.05,e.mapMax||1)},
      {n:'LAMBDA',u:'',d:2,lo:0.7,hi:1.3},{n:'KNOCK',u:'%',d:0,lo:0,hi:100}];
}
const ECU_COLS=['#00ff88','#ffcc00','#00ccff','#ff6666'],ECU_SPAN=10;
function ecuSample(){
  if(ecu.freeze||!engine)return;
  const ev=typeof isElectric==='function'&&isElectric(),now=performance.now()/1000;
  const last=ecu.buf[ecu.buf.length-1];
  // A new powertrain, or a gap while the laptop was shut, starts a fresh trace rather than joining unlike samples.
  if(ecu.ev!==ev||(last&&now-last.t>0.5)){ecu.buf=[];ecu.ev=ev;}
  const v=ev
    ?[state.systemVoltage||0,state.battI||0,state.mT?state.mT.w:0,(state.soc||0)*100]
    :[state.rpm||0,state.map||1,(engine.stoichAFR?state.afr/engine.stoichAFR:1),state.knockRisk||0];
  ecu.buf.push({t:now,v});
  while(ecu.buf.length>ECU_N||(ecu.buf.length>2&&now-ecu.buf[0].t>ECU_SPAN))ecu.buf.shift();
}
function ecuDrawScope(){
  const c=document.getElementById('ecuScope');if(!c)return;
  const still=matchMedia('(prefers-reduced-motion: reduce)').matches,now=performance.now();
  if(still&&ecu.drawnAt&&now-ecu.drawnAt<1000)return;   // reduced motion: a still picture, refreshed once a second
  ecu.drawnAt=now;
  const dpr=Math.min(2,window.devicePixelRatio||1),cw=Math.round((c.clientWidth||480)*dpr),ch=Math.round((c.clientHeight||160)*dpr);
  if(c.width!==cw||c.height!==ch){c.width=cw;c.height=ch;}
  const g=c.getContext('2d'),w=cw,h=ch,k=dpr,fs=Math.round(7*k);
  g.fillStyle='#04140c';g.fillRect(0,0,w,h);
  g.font=fs+"px 'Press Start 2P',monospace";g.textBaseline='top';
  const chans=ecuChannels(!!ecu.ev),buf=ecu.buf,cur=buf.length?buf[buf.length-1]:null;
  // legend: one column per channel, its live value and the scale its trace uses
  const top=Math.round(26*k),bot=h-Math.round(14*k),L=Math.round(4*k),R=w-Math.round(4*k),colW=(R-L)/4;
  const fmt=(x,d)=>(Math.abs(x)>=1000?Math.round(x).toString():x.toFixed(d));
  const scales=chans.map((cd,i)=>{
    let lo=cd.lo,hi=cd.hi;
    buf.forEach(r=>{const x=r.v[i];if(hi==null||x>hi)hi=x;if(x<lo)lo=x;});
    if(hi==null||!(hi>lo))hi=lo+1;
    if(cd.hi==null)hi*=1.1;   // headroom on a channel with no natural ceiling
    return {lo,hi};
  });
  chans.forEach((cd,i)=>{
    const x=L+i*colW;
    g.fillStyle=ECU_COLS[i];g.fillRect(x,Math.round(2*k),Math.round(6*k),Math.round(6*k));
    g.fillText(tr(cd.n),x+Math.round(9*k),Math.round(1*k));
    g.fillStyle='#e8e8f0';
    g.fillText(cur?fmt(cur.v[i],cd.d)+(cd.u?' '+cd.u:''):'--',x,Math.round(11*k));
    g.fillStyle='#5a7a68';
    const sc=fmt(scales[i].lo,cd.d)+'-'+fmt(scales[i].hi,cd.d);
    g.save();g.font=Math.round(6*k)+"px 'Press Start 2P',monospace";g.fillText(sc,x,Math.round(19*k));g.restore();
  });
  // grid: four bands up, one division per second across, labelled from -10 s to now
  g.strokeStyle='#123a24';g.lineWidth=1;g.beginPath();
  for(let j=0;j<=4;j++){const y=Math.round(top+(bot-top)*j/4)+0.5;g.moveTo(L,y);g.lineTo(R,y);}
  for(let s=0;s<=ECU_SPAN;s++){const x=Math.round(R-(R-L)*s/ECU_SPAN)+0.5;g.moveTo(x,top);g.lineTo(x,bot);}
  g.stroke();
  g.fillStyle='#5a7a68';g.textBaseline='bottom';
  [ECU_SPAN,5,0].forEach(s=>{
    const lab=s?'-'+s+' s':tr('NOW'),tw=g.measureText(lab).width;
    const x=R-(R-L)*s/ECU_SPAN;g.fillText(lab,Math.max(L,Math.min(R-tw,x-tw/2)),h-Math.round(1*k));
  });
  if(ecu.freeze){g.fillStyle='#ffcc00';const t=tr('FROZEN');g.fillText(t,R-g.measureText(t).width,bot-Math.round(2*k));}
  if(buf.length<2)return;
  const tNow=cur.t;
  g.lineWidth=Math.max(1,Math.round(1.5*k));
  chans.forEach((cd,i)=>{
    const {lo,hi}=scales[i];
    g.strokeStyle=ECU_COLS[i];g.beginPath();
    buf.forEach((r,j)=>{
      const x=R-(tNow-r.t)/ECU_SPAN*(R-L),y=bot-(r.v[i]-lo)/(hi-lo)*(bot-top);
      if(j)g.lineTo(x,y);else g.moveTo(x,y);
    });
    g.stroke();
  });
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
  // the text screens follow the bench too, a few times a second
  const now=performance.now();
  if(now-(ecu.textAt||0)>250){
    ecu.textAt=now;
    if(ecu.screen==='delta')ecuRenderDelta();
    else if(ecu.screen==='diag'&&now-(ecu.diagAt||0)>1000){ecu.diagAt=now;ecuRenderDiag();}
  }
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
