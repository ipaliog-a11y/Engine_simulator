// ---- TRACK map: the circuit drawn from the same sampled centreline the lap solver used, with
// the racing line coloured by what is limiting the car at each point. ----
const LIMC={corner:'#ffcc00',brake:'#ff5555',power:'#55dd66',traction:'#4aa3ff'};
const LIMLBL={corner:'CORNERING (grip)',brake:'BRAKING',power:'POWER',traction:'TRACTION (diff/tyres)'};
// Track map view: zoom (1 = fitted) and pan (canvas units), reset whenever the circuit changes.
const trackView={key:'',z:1,x:0,y:0,mcx:320,mcy:210};
const TRACK_ZMAX=16;
// Zoom by factor f about the canvas point (vx,vy), keeping the map point under it fixed.
function trackZoomAt(vx,vy,f){
  const z0=trackView.z, z1=clamp(z0*f,1,TRACK_ZMAX);
  if(z1===z0)return;
  // map-space point under the cursor, in base (unzoomed) canvas coordinates
  const bx=trackView.mcx+(vx-trackView.mcx-trackView.x)/z0, by=trackView.mcy+(vy-trackView.mcy-trackView.y)/z0;
  trackView.z=z1;
  trackView.x=vx-trackView.mcx-(bx-trackView.mcx)*z1;
  trackView.y=vy-trackView.mcy-(by-trackView.mcy)*z1;
  if(z1<=1.0001){trackView.x=0;trackView.y=0;}
}
function trackViewReset(){trackView.z=1;trackView.x=0;trackView.y=0;}
function bindTrackZoom(){
  // canvas CSS pixels -> the 640x420 drawing space
  const toViz=e=>{const r=canvas.getBoundingClientRect();
    // the full-screen track view may be turned a quarter clockwise (a phone held upright): its x runs down
    // the screen and its y from right to left
    if(trackPage.open&&trackPage.rot)return {x:(e.clientY-r.top)*vizW/r.height,y:(r.right-e.clientX)*vizH/r.width};
    return {x:(e.clientX-r.left)*vizW/r.width,y:(e.clientY-r.top)*vizH/r.height};};
  const active=()=>(vizMode==='track'&&!!lapResult)||(vizMode==='race'&&!!raceUI.run&&raceUI.phase==='live');
  canvas.addEventListener('wheel',e=>{
    if(!active())return;
    e.preventDefault();
    const p=toViz(e);trackZoomAt(p.x,p.y,Math.exp(-e.deltaY*0.0015));
  },{passive:false});
  canvas.addEventListener('dblclick',e=>{if(active())trackViewReset();});
  // Pointer events cover mouse, pen and touch: one pointer drags, two pinch.
  const ptrs=new Map();let last=null,pinch=null;
  canvas.addEventListener('pointerdown',e=>{
    if(!active())return;
    canvas.setPointerCapture(e.pointerId);ptrs.set(e.pointerId,toViz(e));
    if(ptrs.size===1)last=toViz(e);
    if(ptrs.size===2){const [a,b]=[...ptrs.values()];pinch={d:Math.hypot(a.x-b.x,a.y-b.y)};}
  });
  canvas.addEventListener('pointermove',e=>{
    if(!active()||!ptrs.has(e.pointerId))return;
    const p=toViz(e);ptrs.set(e.pointerId,p);
    if(ptrs.size>=2&&pinch){
      const [a,b]=[...ptrs.values()],d=Math.hypot(a.x-b.x,a.y-b.y);
      if(pinch.d>1)trackZoomAt((a.x+b.x)/2,(a.y+b.y)/2,d/pinch.d);
      pinch.d=d;
    }else if(last&&trackView.z>1.0001){
      if(vizMode==='race')raceUI.follow=-1;   // a drag takes the camera back from the car it was following
      trackView.x+=p.x-last.x;trackView.y+=p.y-last.y;last=p;
    }
  });
  const up=e=>{ptrs.delete(e.pointerId);if(ptrs.size<2)pinch=null;last=ptrs.size===1?[...ptrs.values()][0]:null;};
  canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',up);
}
// ---- live timing: the solved lap, replayed against the clock (build 104) ----
// No new physics: simulateLap already knows the speed, gear, limit and pedals at every point of the
// racing line (its .replay), so this only runs a clock along it and reads them off.
const lapReplay={playing:true,t:0,speed:1,src:null,laps:0,gauges:'digital'};
try{if(localStorage.getItem('pes.gauges')==='analog')lapReplay.gauges='analog';}catch(e){}
function stepReplay(dt){
  const L=lapResult;if(!L||!L.replay)return;
  if(lapReplay.src!==L){lapReplay.src=L;lapReplay.t=0;lapReplay.laps=0;}
  if(!lapReplay.playing)return;
  lapReplay.t+=dt*lapReplay.speed;
  if(lapReplay.t>=L.lap){lapReplay.t-=L.lap;lapReplay.laps++;}
}
// Everything the car is doing at time t into the lap, interpolated between the solver's points.
function replayAt(L,t){
  const R=L.replay,line=L.track.line,n=line.length,tt=R.tAt;
  let lo=0,hi=n-1;
  while(hi-lo>1){const mid=(lo+hi)>>1;if(tt[mid]<=t)lo=mid;else hi=mid;}
  const i=t>=tt[n-1]?n-1:lo,j=(i+1)%n,tEnd=j?tt[j]:L.lap;
  const f=clamp((t-tt[i])/Math.max(1e-6,tEnd-tt[i]),0,1),mix=(a,b)=>a+(b-a)*f;
  const third=L.lineLength/3,sAt=mix(line[i].s,j?line[j].s:L.lineLength);
  return {i,x:mix(line[i].x,line[j].x),y:mix(line[i].y,line[j].y),
    hd:Math.atan2(line[j].y-line[i].y,line[j].x-line[i].x),
    v:mix(L.v[i],L.v[j])*3.6,gear:L.gears[i]+1,rpm:mix(R.rpm[i],R.rpm[j]),map:R.map?mix(R.map[i],R.map[j]):1,
    thr:R.thr[i],brk:R.brk[i],gLat:mix(R.gLat[i],R.gLat[j]),gLong:mix(R.gLong[i],R.gLong[j]),
    tF:R.tF?mix(R.tF[i],R.tF[j]):null,tR:R.tR?mix(R.tR[i],R.tR[j]):null,fade:R.fade?R.fade[i]:1,
    steer:R.steer?mix(R.steer[i],R.steer[j])*180/Math.PI:0,pwr:R.pwr?mix(R.pwr[i],R.pwr[j]):0,
    sector:Math.min(2,Math.floor(sAt/third))};
}
// The clock at which each sector ends, from the same recording (equal thirds of the line, as L.sectors).
function sectorEnds(L){
  if(L._sectorEnds)return L._sectorEnds;
  const line=L.track.line,third=L.lineLength/3,out=[];
  for(const b of [third,2*third]){let i=0;while(i<line.length-1&&line[i].s<b)i++;out.push(L.replay.tAt[i]);}
  out.push(L.lap);
  return (L._sectorEnds=out);
}
// The instruments, drawn over the map: speed, gear, rpm, the two pedals and a g-meter.
const REPLAY_HUD_W=184;
// Brake temperature colour: blue cold, green working, yellow near the pads' onset, red past it (fading).
function brakeTempColour(T,onset){
  if(T>=onset)return '#ff4444';
  if(T>=0.85*onset)return '#ffcc00';
  if(T>=150)return '#00ff88';
  return '#00ccff';
}
// Steering and power (build 130). The wheel in the driver's hands is the road wheels' angle times the
// steering ratio set on VEHICLE; power is the crank's, against the engine's peak.
function drawSteerWheel(cx,cy,R,deg){
  ctx.save();ctx.translate(cx,cy);ctx.rotate(deg*Math.PI/180);
  ctx.strokeStyle='#bbc';ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,R,0,Math.PI*2);ctx.stroke();
  ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-R,0);ctx.lineTo(R,0);ctx.moveTo(0,0);ctx.lineTo(0,R);ctx.stroke();
  ctx.fillStyle='#ff5555';ctx.fillRect(-2,-R-2,4,4);   // the top-dead-centre stripe
  ctx.fillStyle='#ccccd8';ctx.fillRect(-3,-3,6,6);
  ctx.restore();ctx.lineWidth=1;
}
function steerText(st){
  const wd=st.steer*(vehicle.steerRatio||15),side=Math.abs(wd)<0.5?'':(wd>0?' R':' L');
  return {wheel:wd,txt:Math.round(Math.abs(wd))+'°'+side,road:'δ '+Math.abs(st.steer).toFixed(1)+'°'};
}
function powerReadout(st,L){
  const hp=st.pwr/1000/0.7457,peak=Math.max(1,L&&L.pwrPeak?L.pwrPeak/745.7:(engine.score?engine.score.peakHP:1));
  return {hp,kW:st.pwr/1000,frac:clamp(hp/peak,0,1)};
}
function drawReplayHud(L,st,W,y0){
  const w=REPLAY_HUD_W,h=232,x0=W-w-10,PS='"Press Start 2P"';
  ctx.fillStyle='rgba(10,10,18,0.86)';ctx.fillRect(x0,y0,w,h);
  ctx.strokeStyle='#33334a';ctx.lineWidth=2;ctx.strokeRect(x0,y0,w,h);
  ctx.fillStyle=C.green;ctx.font='16px '+PS;ctx.fillText(String(Math.round(st.v)),x0+10,y0+26);
  ctx.fillStyle='#778';ctx.font='7px '+PS;ctx.fillText('km/h',x0+12+ctx.measureText(String(Math.round(st.v))).width*16/7,y0+26);
  ctx.fillStyle=C.yellow;ctx.font='12px '+PS;ctx.fillText('G'+st.gear,x0+10,y0+48);
  ctx.fillStyle='#99a';ctx.font='7px '+PS;ctx.fillText(Math.round(st.rpm)+' rpm',x0+48,y0+46);
  // rev bar to the redline
  const rf=clamp(st.rpm/Math.max(1,engine.redline),0,1);
  ctx.fillStyle='#1d1d2b';ctx.fillRect(x0+10,y0+54,96,6);
  ctx.fillStyle=rf>0.92?'#ff5555':rf>0.8?C.yellow:'#00ccff';ctx.fillRect(x0+10,y0+54,96*rf,6);
  // pedals
  const bar=(lbl,val,col,yy)=>{ctx.fillStyle='#778';ctx.font='6px '+PS;ctx.fillText(lbl,x0+10,yy+6);
    ctx.fillStyle='#1d1d2b';ctx.fillRect(x0+40,yy,66,7);ctx.fillStyle=col;ctx.fillRect(x0+40,yy,66*clamp(val,0,1),7);};
  bar('THR',st.thr,'#00ff88',y0+70);bar('BRK',st.brk,st.fade<0.999?'#ff8800':'#ff5555',y0+84);
  ctx.fillStyle='#667';ctx.font='6px '+PS;
  ctx.fillText(Math.round(st.thr*100)+'% / '+Math.round(st.brk*100)+'%',x0+10,y0+106);
  if(engine.intake!=='na'){const b=st.map-1;ctx.fillStyle=b>0.02?'#ff8800':'#99a';
    ctx.fillText(tr('BOOST')+' '+(b>=0?'+':'')+b.toFixed(2)+' bar',x0+10,y0+124);}
  drawGMeter(st,x0+146,y0+86,30,y0+128);
  // engine power now, as a bar against the peak
  const pw=powerReadout(st,L);
  bar(tr('PWR'),pw.frac,'#ffaa00',y0+136);
  ctx.fillStyle='#99a';ctx.font='6px '+PS;ctx.fillText(Math.round(pw.hp)+' hp • '+Math.round(pw.kW)+' kW',x0+10,y0+156);
  // steering wheel
  const sw=steerText(st);
  drawSteerWheel(x0+150,y0+168,16,sw.wheel);
  ctx.fillStyle='#778';ctx.font='6px '+PS;ctx.fillText(tr('STEER'),x0+10,y0+174);
  ctx.fillStyle=C.yellow;ctx.font='8px '+PS;ctx.fillText(sw.txt,x0+50,y0+175);
  ctx.fillStyle='#667';ctx.font='6px '+PS;ctx.fillText(sw.road,x0+10,y0+188);
  drawBrakeCells(L,st,x0,y0+h-30);
}
// g-meter: lateral across, longitudinal up for braking (the way a driver is thrown), rings at 1 g
// and at the tyre's grip. Shared by both instrument sets.
function drawGMeter(st,cx,cy,R,yTxt){
  const PS='"Press Start 2P"',gMax=Math.max(1.5,vehicle.mu*1.2),sc=R/gMax;
  ctx.strokeStyle='#26263a';ctx.lineWidth=1;ctx.beginPath();ctx.arc(cx,cy,R,0,Math.PI*2);ctx.stroke();
  ctx.beginPath();ctx.moveTo(cx-R,cy);ctx.lineTo(cx+R,cy);ctx.moveTo(cx,cy-R);ctx.lineTo(cx,cy+R);ctx.stroke();
  ctx.strokeStyle='#44445e';ctx.beginPath();ctx.arc(cx,cy,sc,0,Math.PI*2);ctx.stroke();
  ctx.setLineDash([2,3]);ctx.strokeStyle='#886622';ctx.beginPath();ctx.arc(cx,cy,vehicle.mu*sc,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
  const gx=cx+clamp(st.gLat,-gMax,gMax)*sc,gy=cy-clamp(-st.gLong,-gMax,gMax)*sc;
  ctx.fillStyle=C.yellow;ctx.fillRect(gx-3,gy-3,6,6);
  ctx.fillStyle='#99a';ctx.font='6px '+PS;ctx.textAlign='center';
  ctx.fillText(Math.hypot(st.gLat,st.gLong).toFixed(2)+' g',cx,yTxt);ctx.textAlign='left';
  ctx.fillStyle='#556';ctx.fillText('1g',cx+sc*0.72+2,cy-sc*0.72);
}
// Brake temperatures, front and rear, with the pads' fade showing when the fronts pass their onset.
function drawBrakeCells(L,st,x0,yb){
  if(st.tF!=null){
    const on=L.brakeOnset,PS2='6px "Press Start 2P"';
    const cell=(lbl,T,xx)=>{ctx.fillStyle='#778';ctx.font=PS2;ctx.fillText(lbl,xx,yb);
      ctx.fillStyle=brakeTempColour(T,on);ctx.fillRect(xx+8,yb-7,8,8);
      ctx.font='8px "Press Start 2P"';ctx.fillText(Math.round(T)+'°',xx+20,yb+1);};
    cell('F',st.tF,x0+10);cell('R',st.tR,x0+80);
    ctx.font=PS2;
    if(st.fade<0.999){ctx.fillStyle='#ff4444';ctx.fillText(tr('BRAKE FADE')+' −'+Math.round((1-st.fade)*100)+'%',x0+10,yb+14);}
    else{ctx.fillStyle='#556';ctx.fillText(tr('BRAKES')+' • '+tr('fade from')+' '+on+'°C',x0+10,yb+14);}
  }
}
// Analog instruments (build 112): a rev counter, a speedometer and, on a turbo or supercharged engine, a
// boost gauge reading manifold pressure against atmosphere (vacuum below zero), the way a dashboard does.
// Same readings as the digital set, from the same replay.
const niceStep=(span,n)=>{const raw=span/n;for(const s of [0.25,0.5,1,2,5,10,20,25,40,50,100])if(s>=raw)return s;return 100;};
// One dial: value v on a scale lo..hi swept over 270 degrees from bottom-left; red from `red` up.
function drawDial(cx,cy,R,lo,hi,v,step,lbl,red,fmt){
  const PS='"Press Start 2P"',a0=0.75*Math.PI,sw=1.5*Math.PI,ang=x=>a0+sw*clamp((x-lo)/(hi-lo),0,1);
  ctx.fillStyle='#0c0c14';ctx.beginPath();ctx.arc(cx,cy,R,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='#44445e';ctx.lineWidth=2;ctx.beginPath();ctx.arc(cx,cy,R,0,Math.PI*2);ctx.stroke();
  if(red!=null&&red<hi){ctx.strokeStyle='#aa2222';ctx.lineWidth=4;ctx.beginPath();ctx.arc(cx,cy,R-4,ang(red),ang(hi));ctx.stroke();}
  ctx.lineWidth=1;ctx.font='5px '+PS;ctx.textAlign='center';ctx.textBaseline='middle';
  const nT=Math.round((hi-lo)/step),every=nT>8?2:1;
  for(let k=0;k<=nT;k++){
    const x=lo+k*step,a=ang(x),c=Math.cos(a),sn=Math.sin(a),big=k%every===0;
    ctx.strokeStyle=red!=null&&x>=red?'#ff5555':'#99a';
    ctx.beginPath();ctx.moveTo(cx+c*(R-2),cy+sn*(R-2));ctx.lineTo(cx+c*(R-(big?8:5)),cy+sn*(R-(big?8:5)));ctx.stroke();
    if(big){ctx.fillStyle='#bbc';ctx.fillText(fmt(x),cx+c*(R-14),cy+sn*(R-14));}
  }
  ctx.fillStyle='#667';ctx.fillText(lbl,cx,cy+R*0.38);
  const a=ang(v);
  ctx.strokeStyle='#ff6633';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(cx-Math.cos(a)*4,cy-Math.sin(a)*4);
  ctx.lineTo(cx+Math.cos(a)*(R-6),cy+Math.sin(a)*(R-6));ctx.stroke();
  ctx.fillStyle='#ccccd8';ctx.fillRect(cx-2,cy-2,4,4);
  ctx.textAlign='left';ctx.textBaseline='alphabetic';ctx.lineWidth=1;
}
function drawAnalogHud(L,st,W,y0){
  const w=REPLAY_HUD_W,h=250,x0=W-w-10,PS='"Press Start 2P"';
  ctx.fillStyle='rgba(10,10,18,0.86)';ctx.fillRect(x0,y0,w,h);
  ctx.strokeStyle='#33334a';ctx.lineWidth=2;ctx.strokeRect(x0,y0,w,h);
  // rev counter in thousands, red from the redline; the gear in its face
  const rl=Math.max(1000,engine.redline),rMax=Math.ceil(rl/1000+0.5)*1000;
  drawDial(x0+47,y0+47,40,0,rMax,st.rpm,1000,'x1000',rl,x=>String(x/1000));
  ctx.fillStyle=C.yellow;ctx.font='8px '+PS;ctx.textAlign='center';ctx.fillText(String(st.gear),x0+47,y0+79);
  // speedometer to the car's top speed with some room above it
  const top=Math.max(160,(perf&&perf.topSpeed)||L.vMax||160),vMax=Math.ceil(top*1.1/20)*20,vs=niceStep(vMax,7);
  drawDial(x0+137,y0+47,40,0,Math.ceil(vMax/vs)*vs,st.v,vs,'km/h',null,x=>String(x));
  ctx.fillStyle=C.green;ctx.font='7px '+PS;ctx.textAlign='center';ctx.fillText(String(Math.round(st.v)),x0+137,y0+80);
  ctx.textAlign='left';
  // boost gauge on a forced engine; the pedals beside it either way
  const yb=y0+126;
  if(engine.intake!=='na'){
    const peak=Math.max(0.5,...(L.replay.map||[1]).map(x=>x-1)),bHi=Math.ceil((peak+0.25)*2)/2;
    drawDial(x0+34,yb,26,-1,bHi,st.map-1,0.5,'bar',null,x=>x===0?'0':(Math.abs(x%1)<1e-9?String(x):''));
    ctx.fillStyle='#778';ctx.font='5px '+PS;ctx.textAlign='center';ctx.fillText(tr('BOOST'),x0+34,yb+33);ctx.textAlign='left';
  }
  const pedal=(xx,val,col,lbl)=>{ctx.fillStyle='#1d1d2b';ctx.fillRect(xx,yb-26,10,52);
    const hh=52*clamp(val,0,1);ctx.fillStyle=col;ctx.fillRect(xx,yb+26-hh,10,hh);
    ctx.fillStyle='#778';ctx.font='5px '+PS;ctx.fillText(lbl,xx-1,yb+34);};
  const px0=engine.intake!=='na'?x0+70:x0+40;
  pedal(px0,st.thr,'#00ff88','T');pedal(px0+16,st.brk,st.fade<0.999?'#ff8800':'#ff5555','B');
  drawGMeter(st,x0+148,yb,26,yb+36);
  // power bar and steering wheel, in a strip above the brakes
  const pw=powerReadout(st,L),sw=steerText(st),ys=y0+182;
  ctx.fillStyle='#778';ctx.font='5px '+PS;ctx.fillText(tr('PWR'),x0+10,ys+6);
  ctx.fillStyle='#1d1d2b';ctx.fillRect(x0+34,ys,74,7);ctx.fillStyle='#ffaa00';ctx.fillRect(x0+34,ys,74*pw.frac,7);
  ctx.fillStyle='#99a';ctx.font='6px '+PS;ctx.fillText(Math.round(pw.hp)+' hp',x0+10,ys+22);
  ctx.fillStyle=C.yellow;ctx.fillText(sw.txt,x0+70,ys+22);
  ctx.fillStyle='#667';ctx.font='5px '+PS;ctx.fillText(sw.road,x0+70,ys+34);
  drawSteerWheel(x0+150,ys+16,15,sw.wheel);
  drawBrakeCells(L,st,x0,y0+h-22);
}
// The circuit fitted to the canvas, then the view's zoom and pan (shared by TRACK and RACE).
// ZOOM AND PAN. The fitted map is the base view; the view transform scales it about the map centre and
// shifts it, so zoom = 1 and pan = 0 is exactly the fitted drawing. Line widths that are drawn to scale
// (the track ribbon) grow with the zoom, which is the point: zoomed in you can see the racing line using
// the width of a hairpin.
function trackMapView(T,W,H,topBar,botBar,Wm){
  const pad=40;
  const sx=(Wm-pad*2)/(T.maxX-T.minX),sy=(H-topBar-botBar-pad)/(T.maxY-T.minY);
  const sc=Math.min(sx,sy);
  const ox=pad+((Wm-pad*2)-(T.maxX-T.minX)*sc)/2, oy=topBar+((H-topBar-botBar-pad)-(T.maxY-T.minY)*sc)/2;
  if(trackView.key!==T.label){trackView.key=T.label;trackView.z=1;trackView.x=0;trackView.y=0;}
  const z=trackView.z, mcx=W/2, mcy=(topBar+H-botBar)/2;
  trackView.mcx=mcx;trackView.mcy=mcy;
  const px=q=>mcx+(ox+(q.x-T.minX)*sc-mcx)*z+trackView.x, py=q=>mcy+(oy+(q.y-T.minY)*sc-mcy)*z+trackView.y;
  return {px,py,scV:sc*z,z};
}
// Track surface: the full width of the circuit, drawn from the centreline. Width is to scale, so you can
// see the racing line using it. The centreline, faint, so the racing line's use of the width reads clearly.
function drawTrackSurface(T,px,py,scV){
  const pts=T.pts,n=pts.length;
  ctx.lineCap='round';ctx.lineJoin='round';
  ctx.fillStyle='#23232f';trackRibbon(ctx,T,px,py,scV,3);
  ctx.strokeStyle='#34344a';ctx.lineWidth=1;ctx.setLineDash([4,6]);
  ctx.beginPath();ctx.moveTo(px(pts[0]),py(pts[0]));
  for(let i=1;i<n;i++)ctx.lineTo(px(pts[i]),py(pts[i]));
  ctx.closePath();ctx.stroke();ctx.setLineDash([]);
}
function drawTrack(){
  const W=vizW,H=vizH;
  ctx.fillStyle=C.bg;ctx.fillRect(0,0,W,H);
  drawPixelRect(0,0,W,28,'#12121c');
  ctx.fillStyle=C.yellow;ctx.font='10px "Press Start 2P"';
  const L=lapResult;
  ctx.fillText(tr('TEST TRACK')+' • '+(L?L.track.label:''),12,19);
  if(!L){ctx.fillStyle='#778';ctx.font='8px "Press Start 2P"';ctx.fillText(tr('BUILD AN ENGINE FIRST'),12,60);return;}
  // Lap time sits below the title bar.
  // Live clock, with the solved lap beside it and the sector splits as they are crossed.
  const live=L.replay?replayAt(L,lapReplay.t):null;
  ctx.fillStyle=C.green;ctx.font='14px "Press Start 2P"';ctx.fillText(fmtLap(live?lapReplay.t:L.lap),12,50);
  ctx.font='7px "Press Start 2P"';ctx.fillStyle='#778';
  let lx0=14+ctx.measureText(fmtLap(L.lap)).width*2;
  ctx.fillText(live?tr('LAP')+' '+fmtLap(L.lap):tr('LAP TIME'),lx0,50);
  if(live){
    const ends=sectorEnds(L);lx0+=ctx.measureText(tr('LAP')+' '+fmtLap(L.lap)).width+16;
    for(let k=0;k<3;k++){
      const done=k<live.sector,cur=k===live.sector;
      ctx.fillStyle=done?C.yellow:cur?'#00ccff':'#556';
      const txt='S'+(k+1)+' '+(done?L.sectors[k].toFixed(2):cur?(lapReplay.t-(k?ends[k-1]:0)).toFixed(1):'—');
      ctx.fillText(txt,lx0,50);lx0+=ctx.measureText(txt).width+12;
    }
  }
  const T=L.track,topBar=62,botBar=52;
  // with the instruments up, the map fits the width beside them rather than under them
  const Wm=live?W-REPLAY_HUD_W-14:W;
  const {px,py,scV,z}=trackMapView(T,W,H,topBar,botBar,Wm);
  ctx.save();ctx.beginPath();ctx.rect(0,topBar-8,W,H-topBar-botBar+8);ctx.clip();
  const line=T.line,n=T.pts.length;
  drawTrackSurface(T,px,py,scV);
  // The optimised racing line, coloured per segment by the limiting factor.
  ctx.lineWidth=Math.min(9,Math.max(2.5,4*scV/1.2));
  for(let i=0;i<n;i++){
    const j=(i+1)%n;
    ctx.strokeStyle=LIMC[L.lim[i]]||'#888';
    ctx.beginPath();ctx.moveTo(px(line[i]),py(line[i]));ctx.lineTo(px(line[j]),py(line[j]));ctx.stroke();
  }
  // Start/finish line + slowest-corner marker.
  let slow=0;for(let i=1;i<n;i++)if(L.v[i]<L.v[slow])slow=i;
  ctx.fillStyle='#fff';ctx.fillRect(px(line[0])-4,py(line[0])-4,8,8);
  ctx.fillStyle='#000';ctx.fillRect(px(line[0])-2,py(line[0])-2,4,4);
  ctx.fillStyle=C.yellow;ctx.font='7px "Press Start 2P"';
  ctx.fillText(Math.round(L.v[slow]*3.6)+' km/h',px(line[slow])+8,py(line[slow])+3);
  ctx.fillStyle='#ff5555';ctx.fillRect(px(line[slow])-3,py(line[slow])-3,6,6);
  // The car: a trail over the last two seconds, then the car itself in its livery, pointing along the
  // line, with a green glow on the throttle and a red one (and lit brake lamps) on the brake.
  if(live){
    const tt=L.replay.tAt;let k=live.i,steps=0;
    ctx.strokeStyle='rgba(255,255,255,0.35)';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(px(live),py(live));
    while(steps<n&&lapReplay.t-tt[k]<2&&lapReplay.t>=tt[k]){ctx.lineTo(px(line[k]),py(line[k]));k=(k-1+n)%n;steps++;}
    ctx.stroke();
    drawTopCar(ctx,px(live),py(live),live.hd,carLivery(vehicle),live.brk>0.05?'brk':live.thr>0.95?'thr':'coast');
  }
  ctx.restore();
  if(live)(lapReplay.gauges==='analog'?drawAnalogHud:drawReplayHud)(L,live,W,topBar);
  // how to drive the view, and where it is
  ctx.font='6px "Press Start 2P"';ctx.fillStyle='#556';ctx.textAlign='right';
  ctx.fillText((z>1.01?tr('ZOOM')+' '+z.toFixed(1)+'×  •  ':'')+tr('scroll or pinch to zoom • drag to pan • double-click to reset'),W-12,H-botBar+4);
  ctx.textAlign='left';
  // Legend along the bottom: how much of the lap distance each limit accounts for.
  ctx.font='7px "Press Start 2P"';
  let lx=14;const ly=H-30;
  for(const k of ['power','traction','corner','brake']){
    const pct=Math.round(L.counts[k]/L.lineLength*100);
    ctx.fillStyle=LIMC[k];ctx.fillRect(lx,ly-6,8,8);
    ctx.fillStyle='#99a';ctx.fillText(tr(LIMLBL[k])+' '+pct+'%',lx+12,ly+1);
    lx+=ctx.measureText(tr(LIMLBL[k])+' '+pct+'%').width+30;
  }
  ctx.fillStyle='#778';
  ctx.fillText((T.length/1000).toFixed(2)+' km • '+T.wLabel+' '+tr('wide')+' • '+T.corners+' '+tr('corners')+' • '+Math.round(L.zMax-L.zMin)+'m '+tr('elevation')+' • '+tr('avg')+' '+Math.round(L.avg)+' km/h',14,H-12);
}
function renderLap(){
  const head=document.getElementById('lapHead'),grid=document.getElementById('lapGrid'),note=document.getElementById('lapNote');
  if(!head||!grid)return;
  const L=lapResult;
  if(!L){head.textContent='—';grid.innerHTML='';if(note)note.textContent='';return;}
  head.innerHTML='<b>'+L.track.label+'</b> • '+(L.length/1000).toFixed(2)+' km • '+L.corners+' '+tr('corners')+' • '+Math.round(L.zMax-L.zMin)+' m '+tr('elevation');
  const cell=(k,v,u,cls)=>'<div class="perf-cell '+(cls||'')+'"><span class="k">'+k+'</span><div class="v">'+v+'</div><span class="u">'+(u||'')+'</span></div>';
  grid.innerHTML=
    cell(tr('LAP TIME'),fmtLap(L.lap),'','hero wide')+
    cell(tr('AVG SPEED'),Math.round(L.avg),'km/h')+
    cell(tr('SECTOR 1'),L.sectors[0].toFixed(2),'s')+
    cell(tr('SECTOR 2'),L.sectors[1].toFixed(2),'s')+
    cell(tr('SECTOR 3'),L.sectors[2].toFixed(2),'s')+
    cell(tr('SLOWEST'),Math.round(L.vMin),'km/h')+
    cell(tr('FASTEST'),Math.round(L.vMax),'km/h')+
    cell(tr('SHIFTS'),L.shifts,'−'+L.shiftLoss.toFixed(2)+'s')+
    (L.balance&&L.balance.under+L.balance.over>0?(()=>{const b=L.balance,us=b.under/(b.under+b.over),mg=Math.abs(b.margin)*100;
      const w=mg<1.5?tr('NEUTRAL'):us>=0.5?tr('UNDERSTEER'):tr('OVERSTEER');
      return cell(tr('BALANCE'),w,mg<1.5?'':(us>=0.5?tr('front'):tr('rear'))+' '+tr('limits')+' · '+mg.toFixed(0)+'%');})():'')+
    (L.brakeMaxF!=null?cell(tr('BRAKE TEMP'),'<span style="color:'+brakeTempColour(L.brakeMaxF,L.brakeOnset)+'">'+Math.round(L.brakeMaxF)+'°C</span>',
      L.brakeMaxF>=L.brakeOnset?tr('BRAKE FADE')+' −'+Math.round((1-Math.min(...L.replay.fade))*100)+'%':tr('fade from')+' '+L.brakeOnset+'°C'):'');
  if(note)note.textContent=tr(L.track.blurb);
}
