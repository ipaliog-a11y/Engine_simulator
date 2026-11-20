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
// The scope's signals. Each is read from the running state; the picker below the scope chooses up to four, one lane
// each. [key, name, unit, decimals, least scale span, reader]. O2 SENSOR is the zirconia cell's voltage from the
// Nernst model in obd.js (lambdaSensorMv), what a narrowband sensor sends the ECU, beside the lambda it is read from.
function ecuLam(){return state.fuelCut||(typeof obdRunning==='function'&&!obdRunning())?99:state.afr/(engine.stoichAFR||14.7);}
const ECU_SIG={
  ice:[['rpm','ENGINE SPEED','rpm',0,200,()=>state.rpm],['map','MANIFOLD PRESSURE','bar',2,0.1,()=>state.map||1],
    ['lam','LAMBDA','',2,0.05,()=>engine.stoichAFR?state.afr/engine.stoichAFR:1],['knock','KNOCK RISK','%',0,10,()=>state.knockRisk],
    ['o2','O2 SENSOR','mV',0,50,()=>lambdaSensorMv(ecuLam())],['thr','THROTTLE','%',0,5,()=>state.throttle*100],
    ['tq','TORQUE','Nm',0,10,()=>state.torque],['kw','POWER','kW',0,5,()=>state.powerKW],['clt','COOLANT','°C',0,5,()=>state.coolant]],
  ev:[['v','PACK VOLTAGE','V',0,10,()=>state.systemVoltage],['a','PACK CURRENT','A',0,10,()=>state.battI],
    ['wind','WINDING TEMP','°C',0,5,()=>state.mT?state.mT.w:0],['soc','CHARGE','%',0,2,()=>(state.soc||0)*100],
    ['rpm','MOTOR SPEED','rpm',0,200,()=>state.rpm],['tq','TORQUE','Nm',0,10,()=>state.torque],['kw','POWER','kW',0,5,()=>state.powerKW]]};
const ECU_DEF={ice:['rpm','map','lam','knock'],ev:['v','a','wind','soc']},ECU_MAX=4;
function ecuKind(){return typeof isElectric==='function'&&isElectric()?'ev':'ice';}
function ecuPicked(kind){
  let p=null;
  try{p=JSON.parse(localStorage.getItem('pes.scopeCh')||'null');}catch(e){}
  const keys=ECU_SIG[kind].map(s=>s[0]),l=p&&Array.isArray(p[kind])?p[kind].filter(k=>keys.includes(k)).slice(0,ECU_MAX):[];
  return l.length?keys.filter(k=>l.includes(k)):ECU_DEF[kind];
}
function ecuPick(key){
  const kind=ecuKind(),cur=ecuPicked(kind);
  let next=cur.includes(key)?cur.filter(k=>k!==key):cur.concat(key);
  if(!next.length)return;
  if(next.length>ECU_MAX){flash(tr('Up to 4 traces')+' • '+tr('switch one off first'));return;}
  let all={};
  try{all=JSON.parse(localStorage.getItem('pes.scopeCh')||'{}')||{};}catch(e){}
  all[kind]=next;
  try{localStorage.setItem('pes.scopeCh',JSON.stringify(all));}catch(e){}
  ecu.picked=null;ecuRenderPicker();
}
function ecuRenderPicker(){
  const box=document.getElementById('ecuChans');if(!box)return;
  const kind=ecuKind(),on=ecuPicked(kind);
  if(ecu.picked===kind+on.join())return;
  ecu.picked=kind+on.join();
  box.innerHTML=ECU_SIG[kind].map(s=>'<button type="button" data-ch="'+s[0]+'" aria-pressed="'+on.includes(s[0])+'"'+(on.includes(s[0])?' class="on"':'')+'>'+tr(s[1])+'</button>').join('');
}
function ecuSample(){
  if(ecu.freeze||!engine)return;
  const kind=ecuKind();
  if(ecu.kind!==kind){ecu.kind=kind;ecu.buf=[];}
  const row={t:performance.now()/1000};   // t: seconds, for the time axis
  ECU_SIG[kind].forEach(s=>{let v=0;try{v=+s[5]();}catch(e){}row[s[0]]=isFinite(v)?v:0;});
  ecu.buf.push(row);
  if(ecu.buf.length>ECU_N)ecu.buf.shift();
}
// The scope draws each channel in its own lane: its name, unit and present value in its colour, its scale
// on the right, and a shared time axis in seconds before now. One colour per lane, from the bench palette.
function ecuNice(lo,hi,minSpan){
  if(hi-lo<minSpan){const m=(lo+hi)/2;lo=m-minSpan/2;hi=m+minSpan/2;}
  const raw=(hi-lo)/2,p=Math.pow(10,Math.floor(Math.log10(raw))),f=raw/p,step=(f<=1?1:f<=2?2:f<=5?5:10)*p;
  const a=Math.floor(lo/step),n=Math.ceil(hi/step)-a;
  return [a*step,(a+n+(n%2))*step];   // an even count of steps, so the middle line is on a step too
}
function ecuFmt(v,dp){return dp?v.toFixed(dp):Math.round(v).toLocaleString('en-US');}
function ecuDrawScope(){
  const c=document.getElementById('ecuScope');if(!c||ecu.buf.length<2)return;
  const dpr=Math.min(2,window.devicePixelRatio||1),w=Math.max(260,Math.round(c.clientWidth||480)),h=236;
  if(c.width!==Math.round(w*dpr)||c.height!==Math.round(h*dpr)){c.width=Math.round(w*dpr);c.height=Math.round(h*dpr);}
  const g=c.getContext('2d'),still=matchMedia('(prefers-reduced-motion: reduce)').matches;
  g.setTransform(dpr,0,0,dpr,0,0);
  g.fillStyle='#04140c';g.fillRect(0,0,w,h);
  const FONT=n=>n+'px "Press Start 2P", monospace';
  const cols=['#00ff88','#ffcc00','#00ccff','#ff6666'],grid='#1c3a2a',ink='#8fb8a0';
  const kind=ecuKind(),on=ecuPicked(kind),chans=ECU_SIG[kind].filter(s=>on.includes(s[0]));
  const buf=ecu.buf,last=buf[buf.length-1],t1=last.t||0,span=Math.max(1,t1-(buf[0].t||0));
  const src=still?[last]:buf;
  const L=6,R=w-50,top=16,bot=h-22,lh=(bot-top)/chans.length;
  g.textBaseline='top';g.font=FONT(7);g.fillStyle=ink;g.textAlign='left';
  g.fillText(tr(ecu.freeze?'FROZEN':'LIVE')+' • '+tr('last')+' '+Math.round(span)+' s',L,4);
  g.textAlign='right';g.fillText(tr('TIME (s)'),w-4,4);g.textAlign='left';
  const xOf=t=>R-(t1-t)/span*(R-L);
  for(let ch=0;ch<chans.length;ch++){
    const [key,name,unit,dp,minSpan]=chans[ch],y0=top+ch*lh,y1=y0+lh-4;
    let lo=Infinity,hi=-Infinity;
    buf.forEach(row=>{lo=Math.min(lo,row[key]);hi=Math.max(hi,row[key]);});
    [lo,hi]=ecuNice(lo,hi,minSpan);
    const yOf=v=>y1-(v-lo)/(hi-lo)*(y1-y0-12)-1;
    // grid and scale: top, middle and bottom of the lane
    g.strokeStyle=grid;g.lineWidth=1;g.font=FONT(6);g.fillStyle=ink;g.textAlign='left';
    [hi,(lo+hi)/2,lo].forEach(v=>{
      const y=Math.round(yOf(v))+0.5;
      g.beginPath();g.moveTo(L,y);g.lineTo(R,y);g.stroke();
      g.fillText(ecuFmt(v,dp||((hi-lo)/2<1?1:0)),R+4,Math.max(y0,Math.min(y1-6,y-3)));
    });
    // the trace
    g.strokeStyle=cols[ch];g.lineWidth=2;g.beginPath();
    if(src.length<2){const y=yOf(last[key]);g.moveTo(L,y);g.lineTo(R,y);}
    else src.forEach((row,i)=>{const x=xOf(row.t||t1),y=yOf(row[key]);if(i)g.lineTo(x,y);else g.moveTo(x,y);});
    g.stroke();
    g.fillStyle=cols[ch];g.fillRect(R-3,yOf(last[key])-3,6,6);
    // name, unit and present value, on a dark plate so the trace cannot hide it
    const label=tr(name)+(unit?' ('+unit+')':'')+'  '+ecuFmt(last[key],dp);
    g.font=FONT(7);
    const tw=g.measureText(label).width;
    g.fillStyle='rgba(4,20,12,0.85)';g.fillRect(L,y0,tw+6,10);
    g.fillStyle=cols[ch];g.fillText(label,L+2,y0+1);
  }
  // time axis: seconds before now
  const steps=[1,2,5,10,20,30,60,120],step=steps.find(s=>span/s<=5)||120;
  g.strokeStyle=ink;g.lineWidth=1;g.beginPath();g.moveTo(L,bot+0.5);g.lineTo(R,bot+0.5);g.stroke();
  g.font=FONT(6);g.fillStyle=ink;g.textAlign='center';
  for(let s=0;s<=span+1e-6;s+=step){
    const x=Math.round(R-s/span*(R-L))+0.5;
    g.beginPath();g.moveTo(x,bot);g.lineTo(x,bot+4);g.stroke();
    g.fillText(s?'-'+s:tr('NOW'),Math.max(L+12,x),bot+7);
  }
  g.textAlign='left';
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
  if(ecu.screen==='scope'){ecuRenderPicker();ecuDrawScope();}
  if(ecu.screen==='maps'&&typeof updateFuelMapMarker==='function')updateFuelMapMarker();
}
function bindEcu(){
  const el=document.getElementById('ecuComputer');if(!el)return;
  el.addEventListener('click',e=>{
    const scr=e.target.closest('[data-ecu]');if(scr){ecuScreen(scr.dataset.ecu);return;}
    const mp=e.target.closest('[data-ecu-map]');if(mp){ecu.map=mp.dataset.ecuMap;ecuPlaceMaps();return;}
    const chb=e.target.closest('[data-ch]');if(chb){ecuPick(chb.dataset.ch);if(ecu.buf.length>1)ecuDrawScope();return;}
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
