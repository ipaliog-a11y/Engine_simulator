// ====== GEAR RATIOS window (build 170) ======
// Over the vehicle tab: the spacing, a slider per gear and one for the final drive, and two graphs of what they do.
// Every change is the car's own: it goes into the form (CUSTOM ratios, a hand-set final drive) and the car is rebuilt,
// so the 0-100, the top speed and the lap are the model's, not a preview's. The graphs:
//   · engine rpm against road speed, each gear a ray from the origin to its limiter; over them the path the 0-100 run
//     actually takes (its launch, the shift points its wheel-torque crossover picked, the drop at each), the band from
//     peak torque to peak power, and the top speed;
//   · drive at the wheels against road speed, T(N)·i·i_f·η/r in each gear, the best of them, the ideal a gearbox with
//     infinitely many gears would give (peak power at every speed, P·η/v), drag plus rolling resistance, and the
//     driven tyres' grip. The space between the best gear and the ideal is what the gaps between the gears cost.
// Gears are told apart by their number, drawn on each line, not by colour: ten gears are more than colour can carry.
// One accent marks what the car does (the path, the best gear); the rest is recessive.
const gw={open:false,lap:null,lapKey:'',hover:{saw:null,force:null},busy:false};
const gwOrd=i=>tr(['1st','2nd','3rd'][i]||((i+1)+'th'));
function openGearWin(){
  if(isElectric()){flash(tr(EV_GEAR_NOTE),'warn');return;}   // one fixed reduction, no gears to space (build 180)
  const w=document.getElementById('gearWin');if(!w)return;
  w.hidden=false;gw.open=true;gw.lap=null;renderGearWin();
  document.getElementById('gwClose').focus();
}
function closeGearWin(){
  const w=document.getElementById('gearWin');if(!w||w.hidden)return;
  w.hidden=true;gw.open=false;
  const b=document.getElementById('btnGearRatios');if(b)b.focus();
}
// Rebuild the car from the form and redraw, at most once a frame while a slider is dragged.
function gwRebuild(){
  if(gw.busy)return;gw.busy=true;
  requestAnimationFrame(()=>{gw.busy=false;updateGearingLabel();buildVehicle();updateVehicleSummary();gw.lap=null;renderGearWin();});
}
function gwSetSpacing(k){
  const sel=document.getElementById('vhSpacing');
  if(k==='custom'&&!(vehRatioSet&&vehRatioSet.length===vehicle.ratios.length))vehRatioSet=vehicle.ratios.slice();
  sel.value=k;gwRebuild();
}
// One gear moved: the set becomes CUSTOM, and the gear stays between its neighbours (each at least 1% apart, so the
// order a gearbox has cannot be crossed by dragging).
function gwSetGear(i,r){
  const set=(vehicle.spacing==='custom'&&vehRatioSet&&vehRatioSet.length===vehicle.ratios.length?vehRatioSet:vehicle.ratios).slice();
  const hi=i>0?set[i-1]/1.01:Infinity,lo=i<set.length-1?set[i+1]*1.01:0;
  set[i]=clamp(r,lo,hi);vehRatioSet=set;document.getElementById('vhSpacing').value='custom';gwRebuild();
}
function gwSetFinal(fd){vehFinalDriveSet=fd>0?clamp(fd,FD_MIN,FD_MAX):0;gwRebuild();}
function gwReset(){
  vehRatioSet=null;vehFinalDriveSet=0;
  fillSpacingSelect(!!vehBody,vehBody?'stock':'std');gwRebuild();
}
// Road speed (m/s) in a gear at an engine speed, and back.
const gwV=(rpm,i)=>rpm*(2*Math.PI)/60*vehicle.rTire/(vehicle.ratios[i]*vehicle.finalDrive);
function renderGearWin(){
  if(!gw.open||!vehicle||!powertrain().ready())return;
  const V=vehicle,n=V.ratios.length,rl=powertrain().maxRpm(),el=id=>document.getElementById(id);
  el('gwTitle').textContent=tr('GEAR RATIOS');
  el('gwSub').textContent=tr(V.chLabel)+' · '+n+tr('-speed')+' '+tr(V.gbLabel);
  el('gwKSp').textContent=tr('SPACING');el('gwKR').textContent=tr('RATIO · ROAD SPEED AT THE LIMITER');
  el('gwReset').textContent=tr('RESET');el('gwClose').setAttribute('aria-label',tr('CLOSE'));
  el('gwTSaw').textContent=tr('ENGINE RPM AGAINST ROAD SPEED');el('gwTForce').textContent=tr('DRIVE AT THE WHEELS AGAINST ROAD SPEED');
  // spacing
  const opts=(vehBody?['stock']:[]).concat(Object.keys(GEAR_SPACING),'custom');
  el('gwSpacing').innerHTML=opts.map(k=>'<button type="button" data-sp="'+k+'" class="'+(V.spacing===k?'on':'')+'" aria-pressed="'+(V.spacing===k)+'">'+
    esc(tr(k==='stock'?'STOCK':k==='custom'?'CUSTOM':GEAR_SPACING[k].label))+'</button>').join('');
  // sliders: a ratio on a log scale (a step is the same share of the ratio anywhere), its speed at the limiter
  const lg=x=>Math.round(Math.log(x)*1000);
  let h='';
  for(let i=0;i<n;i++){
    const r=V.ratios[i];
    h+='<div class="gw-row"><span class="n">'+esc(gwOrd(i))+'</span><input type="range" data-g="'+i+'" min="'+lg(0.3)+'" max="'+lg(6.5)+'" step="1" value="'+lg(r)+'" aria-label="'+esc(gwOrd(i))+' '+esc(tr('gear ratio'))+'">'+
      '<span class="r">'+r.toFixed(2)+'</span><span class="v">'+Math.round(gwV(rl,i)*3.6)+' km/h</span></div>';
  }
  const fdAuto=!(vehFinalDriveSet>0);
  h+='<div class="gw-row fd"><span class="n">'+esc(tr('FINAL'))+'</span><input type="range" id="gwFd" min="'+Math.round(FD_MIN*100)+'" max="'+Math.round(FD_MAX*100)+'" step="1" value="'+Math.round(V.finalDrive*100)+'" aria-label="'+esc(tr('final drive'))+'">'+
     '<span class="r">'+V.finalDrive.toFixed(2)+'</span><span class="v">'+esc(tr(fdAuto?(V.fdPublished?'published':'matched'):'by hand'))+'</span></div>'+
     '<div class="gw-fdrow"><button type="button" id="gwFdAuto" class="'+(fdAuto?'on':'')+'" aria-pressed="'+fdAuto+'">'+esc(tr('AUTO'))+'</button>'+
     esc(tr(fdAuto?(V.fdPublished?'the car\'s published final drive, and the GEARING slider':'matched to the engine, and the GEARING slider'):'the GEARING slider is off while this is set'))+'</div>';
  el('gwSliders').innerHTML=h;
  // the note: where the ratios come from
  const src=V.spacing==='stock'&&V.body?(GEARSETS[V.body.name]&&GEARSETS[V.body.name].r.length===n?tr('Published ratios')+': '+GEARSETS[V.body.name].src:tr('No published ratios for this car: the average spacing of the published boxes in its family.'))
    :V.spacing==='custom'?tr('Your own ratios. Each gear stays at least 1% taller than the one below it.')
    :tr('The textbook\'s progressive spacing, fitted to 30 published gearboxes')+' ('+tr(GEAR_SPACING[V.spacing].label)+').';
  el('gwNote').textContent=src;
  // the read-out: the model's own runs on the car as it now is
  const P=perf||{},key=JSON.stringify([V.ratios,V.finalDrive,vehRev]);
  if(gw.lapKey!==key){gw.lapKey=key;gw.lap=null;
    setTimeout(()=>{if(!gw.open||gw.lapKey!==key)return;try{const L=simulateLap('tech');gw.lap=L&&L.lap;}catch(e){gw.lap=null;}gwReadout();},60);}
  gwReadout();
  const lg2=(col,lab,cls)=>'<span><i class="'+(cls||'')+'" style="'+(cls==='b'?'background:':'border-color:')+col+'"></i>'+esc(tr(lab))+'</span>';
  el('gwLegSaw').innerHTML=lg2('#00ff88','THE 0–100 RUN')+lg2('#3a3a58','EACH GEAR (ITS NUMBER AT ITS END)')+lg2('rgba(0,204,255,0.35)','PEAK TORQUE TO PEAK POWER','b')+lg2('#aa3333','LIMITER','d')+lg2('#ffcc00','TOP SPEED','d');
  el('gwLegForce').innerHTML=lg2('#00ff88','BEST GEAR')+lg2('#3a3a58','EACH GEAR')+lg2('#666688','IDEAL (PEAK POWER EVERYWHERE)','d')+lg2('rgba(255,204,0,0.3)','LOST TO THE GAPS','b')+lg2('#cc7744','DRAG + ROLLING','d')+lg2('#4a7a8a','GRIP (AT REST)','d');
  drawGearSaw();drawGearForce();
}
function gwReadout(){
  const P=perf||{},el=document.getElementById('gwRead');if(!el)return;
  const f=(k,v)=>'<span>'+esc(tr(k))+' <b>'+v+'</b></span>';
  el.innerHTML=f('0–100',P.t100?P.t100.toFixed(2)+' s':'—')+f('0–200',P.t200?P.t200.toFixed(2)+' s':'—')+
    f('top speed',P.topSpeed?Math.round(P.topSpeed)+' km/h'+(P.governed?' ('+tr('governed')+')':''):'—')+
    f('Ashdown Park lap',gw.lap?fmtLap(gw.lap):'…');
}
// A canvas sized to its box at the screen's pixel density, with the pixel font at a readable size.
function gwCanvas(id){
  const c=document.getElementById(id);if(!c)return null;
  const dpr=Math.min(2,window.devicePixelRatio||1),W=Math.max(200,c.clientWidth),H=Math.max(100,c.clientHeight-4);
  if(c.width!==Math.round(W*dpr)||c.height!==Math.round(H*dpr)){c.width=Math.round(W*dpr);c.height=Math.round(H*dpr);}
  const g=c.getContext('2d');g.setTransform(dpr,0,0,dpr,0,0);g.clearRect(0,0,W,H);
  g.font="7px 'Press Start 2P', monospace";g.textBaseline='middle';
  return {c,g,W,H};
}
// Axes and gridlines: recessive, the ticks in muted ink.
function gwAxes(g,L,xMax,yMax,xStep,yStep,yFmt,xLab,yLab){
  g.strokeStyle='#1e1e2c';g.lineWidth=1;g.fillStyle='#667';
  g.textAlign='right';
  for(let y=0;y<=yMax+1e-9;y+=yStep){const py=L.y(y);g.beginPath();g.moveTo(L.x0,py);g.lineTo(L.x1,py);g.stroke();g.fillText(yFmt(y),L.x0-4,py);}
  g.textAlign='center';
  for(let x=0;x<=xMax+1e-9;x+=xStep){const px=L.x(x);g.beginPath();g.moveTo(px,L.y0);g.lineTo(px,L.y1);g.stroke();g.fillText(String(x),px,L.y0+9);}
  g.strokeStyle='#444';g.beginPath();g.moveTo(L.x0,L.y1);g.lineTo(L.x0,L.y0);g.lineTo(L.x1,L.y0);g.stroke();
  g.fillStyle='#667';g.textAlign='right';g.fillText(xLab,L.x1,L.y0+19);g.textAlign='left';g.fillText(yLab,L.x0-30,L.y1-9);
}
const gwNice=(x,steps)=>{const raw=x/steps,p=Math.pow(10,Math.floor(Math.log10(raw))),m=raw/p;return (m<=1?1:m<=2?2:m<=2.5?2.5:m<=5?5:10)*p;};
// The speed range both graphs share: to a little past the top speed, or the top gear's limiter if that is lower.
function gwXMax(){
  const P=perf||{},vTop=(P.freeSpeed||P.topSpeed||200),n=vehicle.ratios.length;
  const vLimTop=gwV(powertrain().maxRpm(),n-1)*3.6,x=Math.min(vLimTop,vTop*1.12);
  const st=gwNice(x,7);return {xMax:Math.ceil(x/st)*st,xStep:st};
}
function gwLayout(W,H,xMax,yMax){
  const x0=40,x1=W-10,y0=H-26,y1=16;
  return {x0,x1,y0,y1,x:v=>x0+(x1-x0)*v/xMax,y:u=>y0-(y0-y1)*u/yMax,vx:px=>(px-x0)/(x1-x0)*xMax};
}
function drawGearSaw(){
  const C=gwCanvas('gwSaw');if(!C)return;const {g,W,H}=C,V=vehicle,n=V.ratios.length,rl=powertrain().maxRpm(),P=perf||{},s=powertrain().rating();
  const {xMax,xStep}=gwXMax(),yMax=Math.ceil(rl*1.08/1000)*1000;
  const L=gwLayout(W,H,xMax,yMax);gw.layoutSaw={L,xMax,yMax};
  // the band from peak torque to peak power, where the engine pulls hardest
  if(s.peakTQrpm>0&&s.peakHPrpm>s.peakTQrpm){g.fillStyle='rgba(0,204,255,0.08)';g.fillRect(L.x0,L.y(s.peakHPrpm),L.x1-L.x0,L.y(s.peakTQrpm)-L.y(s.peakHPrpm));
  }
  gwAxes(g,L,xMax,yMax,xStep,gwNice(yMax,5),y=>y>=1000?(y/1000)+'k':String(y),'km/h','rpm');
  // the limiter
  g.strokeStyle='#aa3333';g.setLineDash([4,3]);g.beginPath();g.moveTo(L.x0,L.y(rl));g.lineTo(L.x1,L.y(rl));g.stroke();g.setLineDash([]);
  g.fillStyle='#cc5555';g.textAlign='right';g.fillText(String(rl),L.x1-2,L.y(rl)+8);
  // each gear: a ray from the origin to its limiter, its number at the end
  g.lineWidth=1.5;
  for(let i=0;i<n;i++){
    const vEnd=Math.min(gwV(rl,i)*3.6,xMax),rEnd=vEnd/(gwV(rl,i)*3.6)*rl;
    g.strokeStyle=gw.hl===i?'#ffcc00':'#3a3a58';g.beginPath();g.moveTo(L.x(0),L.y(0));g.lineTo(L.x(vEnd),L.y(rEnd));g.stroke();
    g.fillStyle=gw.hl===i?'#ffcc00':'#889';g.textAlign='center';g.fillText(String(i+1),L.x(vEnd)-(vEnd>=xMax?6:0),L.y(rEnd)-8);
  }
  // the path the 0-100 run takes: the clutch slipping at its launch revs, then each gear to its shift, the drop, on
  const sh=P.shifts||[],pts=[];
  const lr=P.launchRpm||rl*0.55,vLock=gwV(lr,0)*3.6;
  pts.push([0,lr],[vLock,lr]);
  let vPrev=vLock;
  for(const x of sh){const vk=x.v*3.6;if(vk>xMax)break;pts.push([vk,x.rpm],[vk,x.rpmTo]);vPrev=vk;}
  const gLast=sh.length?Math.min(n-1,sh[sh.length-1].g+1):0,vEndRun=Math.min(P.topSpeed||xMax,xMax);
  if(vEndRun>vPrev)pts.push([vEndRun,vEndRun/(gwV(rl,gLast)*3.6)*rl]);
  gw.path=pts;   // kept for the test: the path drawn is the run's
  g.strokeStyle='#00ff88';g.lineWidth=2.5;g.lineJoin='round';g.beginPath();
  pts.forEach(([v,r],k)=>{const px=L.x(v),py=L.y(Math.min(r,yMax));k?g.lineTo(px,py):g.moveTo(px,py);});g.stroke();g.lineWidth=1;
  // the drop at each shift, where there is room for it
  g.fillStyle='#8a9';g.textAlign='left';
  let lastPx=-99;
  for(const x of sh){const vk=x.v*3.6;if(vk>xMax)break;const px=L.x(vk);if(px-lastPx<34)continue;lastPx=px;
    g.fillText('−'+Math.round(x.rpm-x.rpmTo),px+3,L.y((x.rpm+x.rpmTo)/2));}
  // top speed
  if(P.topSpeed){const px=L.x(Math.min(P.topSpeed,xMax));g.strokeStyle='#ffcc00';g.setLineDash([2,3]);g.beginPath();g.moveTo(px,L.y0);g.lineTo(px,L.y1);g.stroke();g.setLineDash([]);
    g.fillStyle='#ffcc00';g.textAlign='right';g.fillText(String(Math.round(P.topSpeed)),px-3,L.y0-8);}
  gwCross(g,L,'saw',H);
}
function drawGearForce(){
  const C=gwCanvas('gwForce');if(!C)return;const {g,W,H}=C,V=vehicle,n=V.ratios.length,pt=powertrain(),rl=pt.maxRpm(),s=pt.rating();
  const curve=pt.torqueCurve(),idle=pt.idleRpm()||800;
  const tq=rpm=>{if(rpm<=curve[0].rpm)return curve[0].tq;for(let k=1;k<curve.length;k++)if(rpm<=curve[k].rpm){const a=curve[k-1],b=curve[k];return a.tq+(b.tq-a.tq)*(rpm-a.rpm)/(b.rpm-a.rpm);}return curve[curve.length-1].tq;};
  // the ideal from the same curve the gears are drawn from, so no gear can touch more than it
  const eff=V.driveEff,r=V.rTire,fd=V.finalDrive,Pmax=curve.reduce((m,q)=>Math.max(m,q.tq*q.rpm*(2*Math.PI)/60),0);
  const Fgear=(i,vms)=>{const rpm=vms*(V.ratios[i]*fd)/r*60/(2*Math.PI);return rpm<idle||rpm>rl?null:tq(rpm)*V.ratios[i]*fd*eff/r;};
  const Fres=vms=>0.5*AIR_RHO*V.cdA*vms*vms+crrAt(V.crr,vms)*V.mass*G;
  const grip=V.mu*V.mass*G*V.drivenWt;   // the driven tyres' grip at rest (weight transfer and downforce move it)
  const {xMax,xStep}=gwXMax();
  let fMax=0;for(let i=0;i<n;i++)for(let vk=2;vk<=xMax;vk+=2){const f=Fgear(i,vk/3.6);if(f)fMax=Math.max(fMax,f);}
  const yStep=gwNice(fMax/1000*1.1,5),yMax=Math.ceil(fMax/1000*1.1/yStep)*yStep;
  const L=gwLayout(W,H,xMax,yMax);gw.layoutForce={L,xMax,yMax,Fgear,Fres,Pmax,eff,grip};
  gwAxes(g,L,xMax,yMax,xStep,yStep,y=>String(+y.toFixed(1)),'km/h','kN');
  const line=(fn,from,col,w,dash)=>{g.strokeStyle=col;g.lineWidth=w;g.setLineDash(dash||[]);g.beginPath();let on=false;
    for(let vk=from;vk<=xMax;vk+=1){const f=fn(vk/3.6);if(f==null||f/1000>yMax*1.02){on=false;continue;}const px=L.x(vk),py=L.y(f/1000);on?g.lineTo(px,py):g.moveTo(px,py);on=true;}
    g.stroke();g.setLineDash([]);g.lineWidth=1;};
  // the ideal: every speed at peak power
  line(vms=>Pmax*eff/vms,8,'#666688',1.5,[5,4]);
  // what the gaps cost: the space between the ideal and the best gear
  g.fillStyle='rgba(255,204,0,0.07)';
  for(let vk=8;vk<=xMax;vk+=1){let b=0;for(let i=0;i<n;i++){const f=Fgear(i,vk/3.6);if(f)b=Math.max(b,f);}
    const id=Math.min(Pmax*eff/(vk/3.6),yMax*1000);if(b>0&&id>b)g.fillRect(L.x(vk),L.y(id/1000),Math.max(1,L.x(vk+1)-L.x(vk)),L.y(b/1000)-L.y(id/1000));}
  // each gear, its number at its peak
  for(let i=0;i<n;i++){
    line(vms=>Fgear(i,vms),1,gw.hl===i?'#ffcc00':'#3a3a58',1.5);
    let bv=0,bf=0;for(let vk=1;vk<=xMax;vk+=1){const f=Fgear(i,vk/3.6);if(f&&f>bf){bf=f;bv=vk;}}
    if(bf>0&&bf/1000<=yMax){g.fillStyle=gw.hl===i?'#ffcc00':'#889';g.textAlign='center';g.fillText(String(i+1),L.x(bv),L.y(bf/1000)-8);}
  }
  // the best gear at each speed: what the car can put down
  line(vms=>{let b=null;for(let i=0;i<n;i++){const f=Fgear(i,vms);if(f!=null&&(b==null||f>b))b=f;}return b;},1,'#00ff88',2.5);
  // drag and rolling, and the driven tyres' grip
  line(Fres,1,'#cc7744',1.5,[3,3]);
  if(grip/1000<=yMax){g.strokeStyle='#4a7a8a';g.setLineDash([6,3]);g.beginPath();g.moveTo(L.x0,L.y(grip/1000));g.lineTo(L.x1,L.y(grip/1000));g.stroke();g.setLineDash([]);
    g.fillStyle='#6a9aaa';g.textAlign='right';g.fillText(tr('GRIP'),L.x1-2,L.y(grip/1000)-7);}
  gwCross(g,L,'force',H);
}
// The hover: a crosshair at the pointer's road speed, and what each graph has there.
function gwCross(g,L,which,H){
  const vk=gw.hover[which];if(vk==null||vk<0)return;
  const px=L.x(vk);g.strokeStyle='#888';g.setLineDash([2,2]);g.beginPath();g.moveTo(px,L.y0);g.lineTo(px,L.y1);g.stroke();g.setLineDash([]);
}
function gwTip(which,ev){
  const c=document.getElementById(which==='saw'?'gwSaw':'gwForce'),tip=document.getElementById(which==='saw'?'gwTipSaw':'gwTipForce');
  const lay=which==='saw'?gw.layoutSaw:gw.layoutForce;if(!c||!tip||!lay)return;
  if(!ev){gw.hover[which]=null;tip.style.display='none';which==='saw'?drawGearSaw():drawGearForce();return;}
  const rc=c.getBoundingClientRect(),mx=ev.clientX-rc.left,vk=lay.L.vx(mx);
  if(vk<0||vk>lay.xMax){gwTip(which,null);return;}
  gw.hover[which]=vk;which==='saw'?drawGearSaw():drawGearForce();
  const V=vehicle,n=V.ratios.length,vms=vk/3.6;let h='<b>'+Math.round(vk)+' km/h</b>';
  if(which==='saw'){
    const pt=powertrain(),rl=pt.maxRpm();
    for(let i=0;i<n;i++){const rpm=vk/(gwV(rl,i)*3.6)*rl;if(rpm>=(pt.idleRpm()||800)&&rpm<=rl)h+='<br>'+esc(gwOrd(i))+' '+Math.round(rpm)+' rpm';}
  }else{
    let b=null,bi=-1;for(let i=0;i<n;i++){const f=lay.Fgear(i,vms);if(f!=null&&(b==null||f>b)){b=f;bi=i;}}
    if(b!=null)h+='<br>'+esc(tr('best'))+': '+esc(gwOrd(bi))+' '+(b/1000).toFixed(2)+' kN';
    if(vms>2)h+='<br>'+esc(tr('ideal'))+' '+(lay.Pmax*lay.eff/vms/1000).toFixed(2)+' kN';
    h+='<br>'+esc(tr('drag + rolling'))+' '+(lay.Fres(vms)/1000).toFixed(2)+' kN';
  }
  tip.innerHTML=h;tip.style.display='block';
  const tw=tip.offsetWidth,left=mx+14+tw>rc.width?mx-14-tw:mx+14;
  tip.style.left=Math.max(0,left)+'px';tip.style.top=(c.offsetTop+10)+'px';
}
function wireGearWin(){
  const b=document.getElementById('btnGearRatios'),w=document.getElementById('gearWin');if(!b||!w)return;
  b.addEventListener('click',openGearWin);
  document.getElementById('gwClose').addEventListener('click',closeGearWin);
  w.addEventListener('click',e=>{if(e.target===w)closeGearWin();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&gw.open)closeGearWin();});
  document.getElementById('gwSpacing').addEventListener('click',e=>{const k=e.target.closest('button');if(k&&k.dataset.sp)gwSetSpacing(k.dataset.sp);});
  const sl=document.getElementById('gwSliders');
  sl.addEventListener('input',e=>{const t=e.target;
    if(t.dataset.g!=null)gwSetGear(+t.dataset.g,Math.exp(+t.value/1000));
    else if(t.id==='gwFd')gwSetFinal(+t.value/100);});
  sl.addEventListener('click',e=>{if(e.target.id==='gwFdAuto')gwSetFinal(vehFinalDriveSet>0?0:vehicle.finalDrive);});
  // the gear under the pointer or the keyboard is drawn in the graphs
  const hl=e=>{const t=e.target;gw.hl=t&&t.dataset&&t.dataset.g!=null?+t.dataset.g:null;drawGearSaw();drawGearForce();};
  sl.addEventListener('pointerover',hl);sl.addEventListener('focusin',hl);
  sl.addEventListener('pointerleave',()=>{gw.hl=null;drawGearSaw();drawGearForce();});
  document.getElementById('gwReset').addEventListener('click',gwReset);
  for(const [id,k] of [['gwSaw','saw'],['gwForce','force']]){const c=document.getElementById(id);
    c.addEventListener('pointermove',e=>gwTip(k,e));c.addEventListener('pointerleave',()=>gwTip(k,null));}
  window.addEventListener('resize',()=>{if(gw.open){drawGearSaw();drawGearForce();}});
}
