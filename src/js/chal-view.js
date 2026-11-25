// ====== CHALLENGES tab UI (build 341; EV 342; pace + hover 344; moose 345) ======
const chalHover={i:-1,map:null};
let chalMooseT0=0;
// Replay speed (build 353): 1, 0.5 or 0.25 of real time. Changing it restarts the replay from its first frame.
let chalMooseRate=1;const CHAL_MOOSE_RATES=[1,0.5,0.25];
function chalMooseNow(){return((typeof performance!=='undefined'?performance.now():Date.now())-chalMooseT0)/1000*chalMooseRate;}
const chalUI={phase:'setup'};
function syncDriveAidsUI(){
  const tcOn=vehicle.tc!==false;
  const espOn=vehicle.aids&&vehicle.aids.esp!=null?!!vehicle.aids.esp:tcOn;
  const isAwd=vehicle.drive==='awd';
  const awdM=vehicle.awdMode||'auto';
  const ch=typeof activeRunChallenge!=='undefined'&&typeof runChallengeById==='function'?runChallengeById(activeRunChallenge):null;
  const isDrift=!!(ch&&ch.kind==='drift');
  for(const id of['trkTc','raceTc']){const el=document.getElementById(id);if(el)el.value=tcOn?'on':'off';}
  for(const id of['trkEsp','raceEsp']){const el=document.getElementById(id);if(el)el.value=espOn?'on':'off';}
  const cTc=document.getElementById('chalTc'),cEsp=document.getElementById('chalEsp');
  if(cTc)cTc.value=(isDrift?(chalDriftTc===true):tcOn)?'on':'off';
  if(cEsp)cEsp.value=(isDrift?(chalDriftEsp===true):espOn)?'on':'off';
  for(const id of['vhAwdMode','trkAwdMode','chalAwdMode','raceAwdMode']){
    const el=document.getElementById(id);
    if(el){el.value=awdM;const row=el.closest('.field');if(row)row.style.display=isAwd?'':'none';}
  }
}
function chalSyncFields(ch){
  const live=chalUI.phase==='live';
  const pace=document.getElementById('chalPace');
  if(pace){const row=pace.closest('.field');if(row)row.style.display=ch.kind==='economy'?'':'none';}
  if(typeof syncUserRoadUi==='function')syncUserRoadUi();
  const ms=document.getElementById('chalMooseSpeed');
  if(ms){const row=ms.closest('.field');if(row)row.style.display=ch.kind==='moose'?'':'none';}
  for(const id of['chalDriftEntry','chalDriftMethod']){const el=document.getElementById(id);
    if(el){const row=el.closest('.field');if(row)row.style.display=ch.kind==='drift'?'':'none';}}
  const mr=document.getElementById('chalMooseRate');
  if(mr){const row=mr.closest('.field');if(row)row.style.display=(live&&(ch.kind==='moose'||ch.kind==='drift'||ch.kind==='skidpad'||ch.kind==='spiral'||ch.kind==='fig8'))?'':'none';}
  const bk=document.getElementById('btnChalBack');if(bk)bk.hidden=!live;
  const go=document.getElementById('btnChalSolve');if(go)go.textContent=tr(live?'RUN AGAIN':'START CHALLENGE');
  syncDriveAidsUI();
}
function chalShowSetup(){
  chalUI.phase='setup';
  const ch=runChallengeById(activeRunChallenge);
  chalSyncFields(ch);
  chalHover.i=-1;chalHover.map=null;
  const head=document.getElementById('chalHead'),grid=document.getElementById('chalGrid'),note=document.getElementById('chalNote');
  if(head){
    const road=ch.road&&typeof buildRoad==='function'?buildRoad(ch.road):null;
    head.innerHTML='<b>'+esc(tr(ch.name))+'</b>'+(road?' · '+(road.length/1000).toFixed(1)+' km · '+road.corners+' '+tr('corners'):'');
  }
  if(grid)grid.innerHTML='';
  if(note)note.textContent=tr(ch.desc);
}
function refreshChallenge(){
  // Do not call buildVehicle here: it hooks back into refreshChallenge (same pattern as refreshLap).
  if(typeof chalRank!=='undefined'&&chalRank.busy)return;   // a ranking is swapping cars in (chal-rank.js)
  const ch=runChallengeById(activeRunChallenge);
  chalResult=solveRunChallenge(ch.id);
  chalUI.phase='live';
  chalHover.i=-1;
  const key=chalResult&&chalResult.road?chalResult.road.label:'';if(key!==chalView.key){chalView.key=key;chalViewReset();}
  chalMooseT0=(typeof performance!=='undefined'?performance.now():Date.now());
  chalSyncFields(ch);
  renderRunChallenge();
}
function renderRunChallenge(){
  const head=document.getElementById('chalHead'),grid=document.getElementById('chalGrid'),note=document.getElementById('chalNote');
  if(!head)return;
  const ch=runChallengeById(activeRunChallenge);
  const R=chalResult;
  if(!R){head.textContent=tr('Build a car first.');grid.innerHTML='';note.textContent=tr(ch.desc);return;}
  if(!R.ok){head.textContent=tr('This challenge is not ready yet.');grid.innerHTML='';note.textContent=tr(ch.desc);return;}
  const cell=(k,v)=>'<div class="perf-cell"><div class="k">'+tr(k)+'</div><div class="v">'+v+'</div></div>';
  if(R.kind==='moose'){
    const col=MOOSE_OUT_COL[R.outcome]||'#e0e0e0',warn=R.lift2>0?' · '+tr('2-WHEEL LIFT'):'';
    head.innerHTML=tr(ch.name)+' · <b>'+R.speedKmh+' km/h</b> · <span style="color:'+col+'">'+tr(R.outcome)+'</span>'+warn;
    grid.innerHTML=cell('ENTRY',R.speedKmh+' km/h'+(R.mode==='best'?' ('+tr('BEST')+')':''))+
      cell('RESULT','<span style="color:'+col+'">'+tr(R.outcome)+'</span>')+
      (R.mode==='best'&&R.failBy&&R.failBy!=='CLEAR'?cell('FAILS AT',R.failAt+' km/h: '+tr(R.failBy)):'')+
      cell('PEAK ay',R.peakAy.toFixed(2)+' g')+
      cell('PEAK β',R.peakBeta.toFixed(1)+'°')+
      cell('WIDTH',R.trackW.toFixed(2)+' m')+
      cell('LANE 1',R.cones.w1.toFixed(2)+' m')+
      cell('OFFSET',R.cones.w2.toFixed(2)+' m')+
      cell('2-WHEEL LIFT',R.lift2>0?R.lift2.toFixed(2)+' s':tr('none'))+
      cell('MAX TIP',(R.tipMax*180/Math.PI).toFixed(1)+'°')+
      cell('STABILITY t/2h',R.ssf.toFixed(2));
    note.textContent=tr(ch.desc)+' '+tr('Throttle released at entry, top gear; the best of 12 lines. BEST CLEAR raises the speed until a cone falls (ISO 3888-2); 72 and 77 km/h are the entry speeds Teknikens Värld and km77 judge by. A car fails by a CONE, a SPIN (turned past 90°) or a ROLLOVER (two wheels up and tipped past its outer tyres).');
    return;
  }
  if(R.kind==='drift'){
    const col=DRIFT_OUT_COL[R.outcome]||'#e0e0e0';
    head.innerHTML=tr(ch.name)+' · <b>'+R.speedKmh+' km/h</b> · <span style="color:'+col+'">'+tr(R.outcome)+'</span>'+(R.score?' · <b>'+R.score+'</b>':'');
    grid.innerHTML=cell('RESULT','<span style="color:'+col+'">'+tr(R.outcome)+'</span>')+
      cell('SCORE',R.score?String(R.score):'—')+
      cell('ENTRY',R.speedKmh+' km/h'+(R.entryMode==='best'?' ('+tr('BEST')+')':''))+
      cell('DRIFT SPEED',(R.vCornerKmh||0).toFixed(1)+' km/h')+
      cell('METHOD',tr(({power:'POWER-OVER',kick:'CLUTCH KICK',flick:'FLICK',handbrake:'HANDBRAKE'})[R.init]||'—')+(R.method==='auto'?' ('+tr('AUTO')+')':''))+
      cell('PEAK β',R.peakBeta.toFixed(1)+'°')+
      cell('CORNER 1 β',R.beta1.toFixed(1)+'°')+
      cell('CORNER 2 β',R.beta2.toFixed(1)+'°')+
      cell('SLIDE 1',R.past1.toFixed(2)+' s')+
      cell('SLIDE 2',R.past2.toFixed(2)+' s')+
      cell('TARGET β',(R.betaT*180/Math.PI).toFixed(0)+'°')+
      cell('RADIUS',R.radius+' m')+
      cell('DRIVE',tr((R.drive||'').toUpperCase())+(R.centre?' · '+tr(({lock:'CLUTCH',fric:'TORSEN',visc:'VISCOUS',open:'OPEN'})[R.centre.type]||'')+' '+Math.round(100*R.centre.f)+':'+Math.round(100*(1-R.centre.f)):''));
    note.textContent=tr(ch.desc)+' '+tr('ESP and traction control off. METHOD picks how the slide starts: POWER-OVER (throttle), CLUTCH KICK (clutch down, the engine revs itself, then the clutch is dropped), FLICK (lift and steer away, then sharply in, each for half the body’s natural period, so its rebound helps turn-in; FWD lifts to rotate) or HANDBRAKE (the lever locks the rears at turn-in; a FWD car holds it while short of the target slip, with part throttle on the fronts). AUTO tries the dynamic methods first and falls back to HANDBRAKE; AWD has no HANDBRAKE. ENTRY fixes the speed, or BEST picks the highest-scoring CLEAR (mean corner speed × sin(mean sustained β), discounted for near-spin spikes). The driver anticipates each bend, holds body slip with active countersteer and throttle, unwinds cleanly and accelerates across the mid-straight into the second bend. CLEAR needs a sustained slide in both. Failures: NO_SLIDE, FADE (one corner), STALL, OFF (any body corner over the edge), or SPIN. AWD powers over as far as its centre coupling lets the rear spin faster than the front. Loose surfaces are not modelled yet.');
    return;
  }
  if(R.kind==='skidpad'){
    const col=SKID_OUT_COL[R.outcome]||'#e0e0e0';
    head.innerHTML=tr(ch.name)+' · <b>'+R.gLap.toFixed(2)+' g</b> · '+R.speedKmh.toFixed(1)+' km/h';
    grid.innerHTML=cell('LATERAL g',R.gLap.toFixed(2)+' g')+
      cell('SPEED',R.speedKmh.toFixed(1)+' km/h')+
      cell('LAP',R.lapT.toFixed(2)+' s')+
      cell('RESULT','<span style="color:'+col+'">'+tr(R.outcome)+'</span>')+
      cell('FAILS AT','+1 km/h: '+tr(R.failBy))+
      cell('MEAN ay',R.ayMean.toFixed(2)+' g')+
      cell('PEAK β',R.betaMax.toFixed(1)+'°')+
      cell('STEER',R.steerDeg.toFixed(1)+'°')+
      cell('OFF LINE',Math.max(-R.eMin,R.eMax).toFixed(2)+' m')+
      cell('DIAMETER',(2*R.radius).toFixed(1)+' m')+
      cell('DRIVE',tr((R.drive||'').toUpperCase()));
    note.textContent=tr(ch.desc)+' '+tr('A 200 ft circle, as Motor Trend and Road & Track use (Car and Driver: 300 ft). The driver holds the circle while the speed is raised; the best is the fastest lap that stays within 1 m of the line with no spin. LATERAL g is the magazines\' figure from that lap\'s time, v²/(g·R); MEAN ay is the body\'s own. One step faster it runs WIDE (understeer), TIGHT (the tail steps out) or SPINs.');
    return;
  }
  if(R.kind==='spiral'||R.kind==='fig8'){
    const col=SKID_OUT_COL[R.outcome]||'#e0e0e0',sp=R.kind==='spiral';
    head.innerHTML=sp
      ?tr(ch.name)+' · <b>'+R.exitKmh.toFixed(0)+' km/h</b> · '+R.gExit.toFixed(2)+' g'
      :tr(ch.name)+' · <b>'+R.speedKmh.toFixed(0)+' km/h</b>';
    grid.innerHTML=(sp
      ?cell('EXIT',R.exitKmh.toFixed(0)+' km/h')+cell('ENTRY',R.entryKmh.toFixed(0)+' km/h')+cell('LATERAL g',R.gExit.toFixed(2)+' g')
      :cell('SPEED',R.speedKmh.toFixed(0)+' km/h')+cell('BEND g',R.gLap.toFixed(2)+' g')+cell('TIME',R.lapT.toFixed(1)+' s'))+
      cell('RESULT','<span style="color:'+col+'">'+tr(R.outcome)+'</span>')+
      cell('FAILS AT','+1 km/h: '+tr(R.failBy))+
      cell('MEAN ay',R.ayMean.toFixed(2)+' g')+
      cell('PEAK β',R.betaMax.toFixed(1)+'°')+
      cell('STEER',R.steerDeg.toFixed(1)+'°')+
      cell('OFF LINE',Math.max(-R.eMin,R.eMax).toFixed(2)+' m')+
      (sp?cell('INNER',R.r0.toFixed(0)+' m')+cell('OUTER',R.r1.toFixed(1)+' m'):cell('BEND',R.rho.toFixed(1)+' m'))+
      cell('DRIVE',tr((R.drive||'').toUpperCase()));
    note.textContent=tr(ch.desc)+' '+(sp
      ?tr('An Archimedean spiral, one turn, counter-clockwise. The line speed is sqrt(lateral g times the local radius of curvature), so it climbs as the bend opens, from 12 m out to the skid pad radius. The best g that stays within 1 m is kept. TIGHT is toward the centre, WIDE is the outside. One step faster, 1 km/h at the exit, is how it fails.')
      :tr('Bernoulli lemniscate: curvature is zero at the crossing and tightest at the two outer bends, at half the skid pad radius. The best constant speed that stays within 1 m for a full figure is kept. TIGHT is left of the line, WIDE is right. One step faster is how it fails.'));
    return;
  }
  if(R.kind==='stage'){
    const mg=(R.margin>=0?'+':'−')+Math.abs(R.margin).toFixed(1)+' s';
    head.innerHTML=tr(ch.name)+' · <b>'+(R.dnf?tr('DNF'):R.time.toFixed(1)+' s')+'</b> · '+mg+' '+tr('vs')+' '+R.target+' s';
    grid.innerHTML=cell('RESULT',R.dnf?tr('DNF'):tr('FINISHED'))+
      cell('BEST TIME',R.time.toFixed(1)+' s')+
      cell('SET TIME',R.target+' s')+
      cell('MARGIN',mg)+
      cell('AVG SPEED',R.avgKmh.toFixed(1)+' km/h')+
      cell('TOP SPEED',Math.round(R.vTop)+' km/h')+
      cell('DISTANCE',R.lengthKm.toFixed(1)+' km');
    note.textContent=tr(R.road.blurb)+' '+tr('One set time for every car. The run is the car\'s min-time from a standing start; slower than the set time is a DNF.');
    return;
  }
  const onTarget=Math.abs(R.time-R.target)<=Math.max(1,0.01*R.target);
  const score=R.ev
    ?('<b>'+R.kWh.toFixed(2)+' kWh</b> · '+Math.round(R.whkm)+' Wh/km')
    :('<b>'+R.fuelL.toFixed(2)+' L</b> · '+R.l100.toFixed(1)+' L/100 km');
  // Time ≈ target by construction; show the target once, not both.
  head.innerHTML=tr(ch.name)+' · '+score+' · '+(onTarget?tr('ON TARGET'):tr('OFF TARGET'))+' '+R.target.toFixed(0)+' s';
  let cells='';
  if(R.ev){
    cells+=cell('ENERGY',R.kWh.toFixed(2)+' kWh')+
      cell('Wh/km',String(Math.round(R.whkm)))+
      cell('REGEN',R.regenKWh.toFixed(2)+' kWh')+
      cell('FLAT-OUT',R.kWhMin!=null?R.kWhMin.toFixed(2)+' kWh':'—');
  }else{
    cells+=cell('FUEL',R.fuelL.toFixed(2)+' L')+
      cell('L/100 km',R.l100.toFixed(1))+
      cell('FLAT-OUT FUEL',R.fuelLMin.toFixed(2)+' L');
  }
  if(R.hybrid)cells+=cell('ENGINE OFF',Math.round(R.engOff*100)+' %')+cell('PACK OUT',R.packOutKWh.toFixed(2)+' kWh')+
    cell('PACK IN',R.packInKWh.toFixed(2)+' kWh')+(R.limitShare>0.005?cell('OVER HYBRID LIMITS',Math.round(R.limitShare*100)+' %'):'');
  if(!R.ev&&R.rpmDrive)cells+=cell('AVG RPM ON POWER',String(Math.round(R.rpmDrive)))+cell('TOP GEAR',String(R.topGear));
  cells+=cell('PEAK ACCEL',R.aUp.toFixed(1)+' m/s²')+cell('PEAK DECEL',R.aDn.toFixed(1)+' m/s²')+
    (R.ecoDP?cell('ECO DRIVER','DP'):cell('ECO BLEND',(R.ecoBlend*100).toFixed(0)+' %'));
  cells+=cell('TARGET',R.target.toFixed(1)+' s')+
    cell('MIN TIME',R.tMin.toFixed(1)+' s')+
    cell('PACE',(R.pace*100).toFixed(0)+' %')+
    cell('DISTANCE',R.lengthKm.toFixed(1)+' km');
  grid.innerHTML=cells;
  note.textContent=tr(R.road.blurb)+' '+tr('Target time is')+' '+(R.factor*100).toFixed(0)+'% '+tr('of this car\'s min-time (eco-rally).')+' '+
    tr(R.ev?'Eco driver: accelerates at the motor\'s most efficient torque and slows on regen where it can.':'Eco driver: accelerates at the engine\'s best-BSFC point, shifts up early, and slows on engine braking in fuel cut.')+' '+
    tr('ECO BLEND is how far it had to move toward the car\'s full grip and power to make the time (0% pure eco). Not yet an optimal plan.');
}
// Route map zoom (1 = fitted, up to CHAL_ZMAX) and pan in canvas units; reset when the route changes (build 354).
const chalView={key:'',z:1,x:0,y:0};
const CHAL_ZMAX=20;
function chalMapProject(R){
  const T=R.road,p=T.pts,pad=28,dx=T.maxX-T.minX||1,dy=T.maxY-T.minY||1;
  const sc0=Math.min((vizW-2*pad)/dx,(vizH-2*pad)/dy),V=chalView,z=V.z,cx=vizW/2,cy=vizH/2;
  return{
    pad,sc:sc0*z,T,p,
    MX:q=>cx+(pad+(q.x-T.minX)*sc0-cx)*z+V.x,
    MY:q=>cy+(vizH-pad-(q.y-T.minY)*sc0-cy)*z+V.y
  };
}
// Zoom by f about the canvas point (vx,vy), keeping the map point under it fixed.
function chalZoomAt(vx,vy,f){
  const V=chalView,z0=V.z,z1=Math.max(1,Math.min(CHAL_ZMAX,z0*f));if(z1===z0)return;
  const cx=vizW/2,cy=vizH/2,bx=cx+(vx-cx-V.x)/z0,by=cy+(vy-cy-V.y)/z0;
  V.z=z1;V.x=vx-cx-(bx-cx)*z1;V.y=vy-cy-(by-cy)*z1;
  if(z1<=1.0001){V.x=0;V.y=0;}
}
function chalViewReset(){chalView.z=1;chalView.x=0;chalView.y=0;}
// Nearest centreline index under a viz-space point, or -1 if farther than hitPx.
function chalHoverAt(mx,my,hitPx){
  const R=chalResult;if(!R||!R.road)return-1;
  const map=chalMapProject(R),p=map.p,n=p.length,hit=(hitPx!=null?hitPx:14);
  let best=-1,bd=hit*hit;
  for(let i=0;i<n;i++){
    const dx=map.MX(p[i])-mx,dy=map.MY(p[i])-my,d=dx*dx+dy*dy;
    if(d<bd){bd=d;best=i;}
  }
  return best;
}
function chalHoverInfo(i){
  const R=chalResult;if(!R||!R.road||i<0)return null;
  const q=R.road.line[i],v=R.v&&R.v[i]!=null?R.v[i]:null;
  const grade=q.grade||0;
  return{
    i,s:q.s||0,
    vKmh:v!=null?v*3.6:null,
    gradePct:grade*100,
    gradeDeg:Math.atan(grade)*180/Math.PI,
    z:q.z||0
  };
}
function mooseSampleAt(R,t){
  const S=R.samples;if(!S||!S.length)return null;
  const t0=S[0].t,t1=S[S.length-1].t,span=Math.max(0.05,t1-t0);
  const u=((t-t0)%span+span)%span+t0;
  let i=0;while(i<S.length-1&&S[i+1].t<u)i++;
  return S[i];
}
const MOOSE_OUT_COL={CLEAR:'#55dd66',CONE:'#ffcc00',SPIN:'#ff8833',ROLLOVER:'#ff4444'};
const SKID_OUT_COL={HOLD:'#55dd66',SLOW:'#b088ff',TIGHT:'#ffcc00',WIDE:'#ff8833',SPIN:'#ff4444'};
const DRIFT_OUT_COL={CLEAR:'#55dd66',FADE:'#ffcc00',NO_SLIDE:'#4aa3ff',STALL:'#b088ff',OFF:'#ff8833',SPIN:'#ff4444'};
function driftSampleAt(R,t){
  const S=R.samples;if(!S||!S.length)return null;
  const t0=S[0].t,t1=S[S.length-1].t,span=Math.max(0.05,t1-t0);
  const u=((t-t0)%span+span)%span+t0;
  let i=0;while(i<S.length-1&&S[i+1].t<u)i++;
  return S[i];
}
function drawDriftChallenge(g,R){
  chalHover.map=null;
  g.fillStyle='#0a0e14';g.fillRect(0,0,vizW,vizH);
  const line=R.line;if(!line||!line.length)return;
  let minX=1e9,maxX=-1e9,minY=1e9,maxY=-1e9;
  for(const q of line){minX=Math.min(minX,q.x);maxX=Math.max(maxX,q.x);minY=Math.min(minY,q.y);maxY=Math.max(maxY,q.y);}
  const hw=R.halfW||DRIFT_HALF_W;minX-=hw+2;maxX+=hw+2;minY-=hw+2;maxY+=hw+2;
  const pad=14,dx=maxX-minX||1,dy=maxY-minY||1;
  const sc=Math.min((vizW-2*pad)/dx,(vizH-2*pad)/dy);
  const MX=x=>pad+(x-minX)*sc,MY=y=>vizH-pad-(y-minY)*sc;
  // road band
  g.strokeStyle='#1c2330';g.lineWidth=Math.max(4,2*hw*sc);g.lineJoin='round';g.lineCap='round';
  g.beginPath();for(let i=0;i<line.length;i++){const X=MX(line[i].x),Y=MY(line[i].y);if(i)g.lineTo(X,Y);else g.moveTo(X,Y);}g.stroke();
  g.strokeStyle='#445566';g.lineWidth=1;g.setLineDash([4,4]);
  g.beginPath();for(let i=0;i<line.length;i++){const X=MX(line[i].x),Y=MY(line[i].y);if(i)g.lineTo(X,Y);else g.moveTo(X,Y);}g.stroke();g.setLineDash([]);
  // path coloured by zone
  const zcol={approach:'#4aa3ff',c1:'#ffcc00',mid:'#8899aa',c2:'#ffcc00',exit:'#4aa3ff'};
  g.lineWidth=2;
  for(let i=0;i<line.length-1;i++){
    g.strokeStyle=zcol[(R.zones&&R.zones[i])||'approach']||'#4aa3ff';
    g.beginPath();g.moveTo(MX(line[i].x),MY(line[i].y));g.lineTo(MX(line[i+1].x),MY(line[i+1].y));g.stroke();
  }
  const S=R.samples||[];
  if(S.length>1){g.strokeStyle='rgba(85,221,102,0.25)';g.lineWidth=Math.max(2,(R.trackW||1.8)*sc);
    g.beginPath();for(let i=0;i<S.length;i++){const X=MX(S[i].x),Y=MY(S[i].y);if(i)g.lineTo(X,Y);else g.moveTo(X,Y);}g.stroke();}
  const s=driftSampleAt(R,chalMooseNow());
  if(s){
    const B=R.body||{f:2,r:2.3},c=Math.cos(s.psi||0),sn=Math.sin(s.psi||0),tw=(R.trackW||1.8)/2;
    g.fillStyle=DRIFT_OUT_COL[R.outcome]||'#55dd66';g.beginPath();
    [[B.f,tw],[B.f,-tw],[-B.r,-tw],[-B.r,tw]].forEach(([dx,dy],k)=>{const X=MX(s.x+dx*c-dy*sn),Y=MY(s.y+dx*sn+dy*c);if(k)g.lineTo(X,Y);else g.moveTo(X,Y);});
    g.closePath();g.fill();
    g.fillStyle='#e0e0e0';g.font='8px "Press Start 2P"';
    const bdeg=(Math.abs(s.beta||0)*180/Math.PI).toFixed(0);
    g.fillText('β '+bdeg+'° · '+(s.zone||''),10,20);
  }
  g.fillStyle='#9ab';g.font='7px "Press Start 2P"';
  g.fillText(tr('S-ROUTE')+' · R '+R.radius+' m · ±'+hw+' m',10,vizH-10);
  if(s&&s.rpm!=null)drawDriftHud(s);
}
// Dashboard in the lower right (build 361): the track view's dials, pedals, g-meter and wheel, read from the
// replayed sample. No power strip or brake temperatures: the run does not model them.
function drawDriftHud(s){
  const w=REPLAY_HUD_W,h=208,x0=vizW-w-10,y0=vizH-h-10,PS='"Press Start 2P"';
  ctx.fillStyle='rgba(10,10,18,0.86)';ctx.fillRect(x0,y0,w,h);
  ctx.strokeStyle='#33334a';ctx.lineWidth=2;ctx.strokeRect(x0,y0,w,h);
  const rl=Math.max(1000,engine.redline),rMax=Math.ceil(rl/1000+0.5)*1000,v=(s.v||0)*3.6;
  drawDial(x0+47,y0+47,40,0,rMax,s.rpm,1000,'x1000',rl,x=>String(x/1000));
  ctx.fillStyle=C.yellow;ctx.font='8px '+PS;ctx.textAlign='center';ctx.fillText(String(s.gear),x0+47,y0+79);
  const top=Math.max(160,(perf&&perf.topSpeed)||160),vMax=Math.ceil(top*1.1/20)*20,vs=niceStep(vMax,7);
  drawDial(x0+137,y0+47,40,0,Math.ceil(vMax/vs)*vs,v,vs,'km/h',null,x=>String(x));
  ctx.fillStyle=C.green;ctx.font='7px '+PS;ctx.fillText(String(Math.round(v)),x0+137,y0+80);
  ctx.textAlign='left';
  const yb=y0+126,pedal=(xx,val,col,lbl)=>{ctx.fillStyle='#1d1d2b';ctx.fillRect(xx,yb-26,10,52);
    const hh=52*clamp(val,0,1);ctx.fillStyle=col;ctx.fillRect(xx,yb+26-hh,10,hh);
    ctx.fillStyle='#778';ctx.font='5px '+PS;ctx.fillText(lbl,xx-1,yb+34);};
  pedal(x0+40,s.thr||0,'#00ff88','T');pedal(x0+56,s.brk||0,'#ff5555','B');
  drawGMeter({gLat:-(s.ay||0)/DRIVE_G,gLong:(s.ax||0)/DRIVE_G},x0+148,yb,26,yb+36);
  const sw=steerText({steer:-(s.delta||0)*180/Math.PI}),ys=y0+172;   // drift steer is left-positive; the wheel reads R positive
  ctx.fillStyle=C.yellow;ctx.font='6px '+PS;ctx.fillText(sw.txt,x0+60,ys+12);
  ctx.fillStyle='#667';ctx.font='5px '+PS;ctx.fillText(sw.road,x0+60,ys+24);
  drawSteerWheel(x0+150,ys+16,15,sw.wheel);
}
// Skid pad (build 368): the circle and its 1 m lane from above, the car replaying the judged lap, the dashboard.
function drawSkidpadChallenge(g,R){
  chalHover.map=null;
  g.fillStyle='#0a0e14';g.fillRect(0,0,vizW,vizH);
  const Rr=R.radius,tol=R.tol,pad=24,sc=Math.min(vizW-2*pad,vizH-2*pad)/(2*(Rr+tol+3));
  const cx=Math.min(vizW/2,pad+(Rr+tol+3)*sc),cy=vizH/2,MX=x=>cx+x*sc,MY=y=>cy-(y-Rr)*sc;
  g.strokeStyle='#1c2330';g.lineWidth=Math.max(3,2*tol*sc);g.beginPath();g.arc(cx,cy,Rr*sc,0,2*Math.PI);g.stroke();
  g.strokeStyle='#ffcc00';g.lineWidth=1;g.setLineDash([4,4]);g.beginPath();g.arc(cx,cy,Rr*sc,0,2*Math.PI);g.stroke();g.setLineDash([]);
  const S=R.samples||[];
  if(S.length>1){g.strokeStyle='rgba(85,221,102,0.35)';g.lineWidth=Math.max(2,(R.trackW||1.8)*sc);
    g.beginPath();for(let i=0;i<S.length;i++){const X=MX(S[i].x),Y=MY(S[i].y);if(i)g.lineTo(X,Y);else g.moveTo(X,Y);}g.stroke();}
  const s=driftSampleAt(R,chalMooseNow());
  if(s){
    const B=R.body||{f:2,r:2.3},c=Math.cos(s.psi||0),sn=Math.sin(s.psi||0),tw=(R.trackW||1.8)/2;
    g.fillStyle=SKID_OUT_COL[R.outcome]||'#55dd66';g.beginPath();
    [[B.f,tw],[B.f,-tw],[-B.r,-tw],[-B.r,tw]].forEach(([dx,dy],k)=>{const X=MX(s.x+dx*c-dy*sn),Y=MY(s.y+dx*sn+dy*c);if(k)g.lineTo(X,Y);else g.moveTo(X,Y);});
    g.closePath();g.fill();
    g.fillStyle='#e0e0e0';g.font='8px "Press Start 2P"';
    g.fillText((Math.abs(s.ay||0)/DRIVE_G).toFixed(2)+' g · β '+(Math.abs(s.beta||0)*180/Math.PI).toFixed(1)+'°',10,20);
  }
  g.fillStyle='#9ab';g.font='7px "Press Start 2P"';
  g.fillText(tr('SKID PAD')+' · '+(2*Rr).toFixed(1)+' m '+tr('circle')+' · ±'+tol+' m',10,vizH-10);
  if(s&&s.rpm!=null)drawDriftHud(s);
}
// Spiral and figure 8: the judged line from above, the 1 m lane, the car replaying the run.
function drawCourseChallenge(g,R){
  chalHover.map=null;
  g.fillStyle='#0a0e14';g.fillRect(0,0,vizW,vizH);
  const line=R.line||[],tol=R.tol||1;
  if(!line.length)return;
  let minX=1e9,maxX=-1e9,minY=1e9,maxY=-1e9;
  for(const q of line){minX=Math.min(minX,q.x);maxX=Math.max(maxX,q.x);minY=Math.min(minY,q.y);maxY=Math.max(maxY,q.y);}
  const m=tol+4;minX-=m;maxX+=m;minY-=m;maxY+=m;
  const pad=16,sc=Math.min((vizW-2*pad)/(maxX-minX||1),(vizH-2*pad)/(maxY-minY||1));
  const MX=x=>pad+(x-minX)*sc,MY=y=>vizH-pad-(y-minY)*sc;
  g.strokeStyle='#1c2330';g.lineWidth=Math.max(3,2*tol*sc);g.lineJoin='round';g.lineCap='round';
  g.beginPath();for(let i=0;i<line.length;i++){const X=MX(line[i].x),Y=MY(line[i].y);if(i)g.lineTo(X,Y);else g.moveTo(X,Y);}g.stroke();
  g.strokeStyle='#ffcc00';g.lineWidth=1;g.setLineDash([4,4]);
  g.beginPath();for(let i=0;i<line.length;i++){const X=MX(line[i].x),Y=MY(line[i].y);if(i)g.lineTo(X,Y);else g.moveTo(X,Y);}g.stroke();g.setLineDash([]);
  const vs=line.map(q=>q.v),lo=Math.min(...vs),hi=Math.max(...vs);
  if(hi-lo>0.4){g.lineWidth=Math.max(2,(R.trackW||1.6)*sc*0.35);
    for(let i=0;i<line.length-1;i++){const u=(line[i].v-lo)/(hi-lo);
      g.strokeStyle=u<0.5?'#4aa3ff':'#55dd66';
      g.beginPath();g.moveTo(MX(line[i].x),MY(line[i].y));g.lineTo(MX(line[i+1].x),MY(line[i+1].y));g.stroke();}}
  const S=R.samples||[];
  if(S.length>1){g.strokeStyle='rgba(85,221,102,0.35)';g.lineWidth=Math.max(2,(R.trackW||1.8)*sc);
    g.beginPath();for(let i=0;i<S.length;i++){const X=MX(S[i].x),Y=MY(S[i].y);if(i)g.lineTo(X,Y);else g.moveTo(X,Y);}g.stroke();}
  const s=driftSampleAt(R,chalMooseNow());
  if(s){
    const B=R.body||{f:2,r:2.3},c=Math.cos(s.psi||0),sn=Math.sin(s.psi||0),tw=(R.trackW||1.8)/2;
    g.fillStyle=SKID_OUT_COL[R.outcome]||'#55dd66';g.beginPath();
    [[B.f,tw],[B.f,-tw],[-B.r,-tw],[-B.r,tw]].forEach(([dx,dy],k)=>{const X=MX(s.x+dx*c-dy*sn),Y=MY(s.y+dx*sn+dy*c);if(k)g.lineTo(X,Y);else g.moveTo(X,Y);});
    g.closePath();g.fill();
    g.fillStyle='#e0e0e0';g.font='8px "Press Start 2P"';
    g.fillText(Math.round((s.v||0)*3.6)+' km/h · '+(Math.abs(s.ay||0)/DRIVE_G).toFixed(2)+' g',10,20);
  }
  g.fillStyle='#9ab';g.font='7px "Press Start 2P"';
  const cap=R.kind==='spiral'
    ?(tr('SPIRAL')+' · '+R.r0.toFixed(0)+'→'+R.r1.toFixed(1)+' m · '+R.entryKmh.toFixed(0)+'→'+R.exitKmh.toFixed(0)+' km/h · ±'+tol+' m')
    :(tr('FIGURE 8')+' · '+R.rho.toFixed(1)+' m '+tr('bends')+' · '+R.speedKmh.toFixed(0)+' km/h · ±'+tol+' m');
  g.fillText(cap,10,vizH-10);
  if(s&&s.rpm!=null)drawDriftHud(s);
}
function drawMooseTopDown(g,R,x0,y0,w,h){
  const G=R.cones,line=R.line;if(!line||!line.length)return;
  // the course (cones 0-61 m) with a little run-in and run-out, so the car's width reads at scale (build 354)
  let minX=-15,maxX=75,minY=1e9,maxY=-1e9;
  for(const q of line){minY=Math.min(minY,q.y-2);maxY=Math.max(maxY,q.y+2);}
  minY=Math.min(minY,-G.w1/2-1);maxY=Math.max(maxY,G.y2+G.w2/2+1,G.y3+2);
  const pad=10,dx=maxX-minX||1,dy=maxY-minY||1;
  const sc=Math.min((w-2*pad)/dx,(h-2*pad)/dy);
  const MX=x=>x0+pad+(x-minX)*sc,MY=y=>y0+h-pad-(y-minY)*sc;
  g.save();g.beginPath();g.rect(x0,y0,w,h);g.clip();
  const lane=(xA,xB,yc,hw,col)=>{
    g.strokeStyle=col;g.lineWidth=1;g.setLineDash([3,3]);
    g.beginPath();g.moveTo(MX(xA),MY(yc-hw));g.lineTo(MX(xB),MY(yc-hw));g.stroke();
    g.beginPath();g.moveTo(MX(xA),MY(yc+hw));g.lineTo(MX(xB),MY(yc+hw));g.stroke();
    g.setLineDash([]);
    g.fillStyle='#ffcc00';
    for(const yy of [yc-hw,yc+hw]){g.beginPath();g.arc(MX(xA),MY(yy),2.5,0,Math.PI*2);g.fill();g.beginPath();g.arc(MX(xB),MY(yy),2.5,0,Math.PI*2);g.fill();}
  };
  // the lanes between the cones, as road (build 354)
  g.fillStyle='#1c2330';
  for(const [xA,xB,yc,hw] of [[0,12,0,G.w1/2],[25.5,36.5,G.y2,G.w2/2],[49,61,G.y3,1.5]])g.fillRect(MX(xA),MY(yc+hw),(xB-xA)*sc,2*hw*sc);
  lane(0,12,0,G.w1/2,'#445566');
  lane(25.5,36.5,G.y2,G.w2/2,'#445566');
  lane(49,61,G.y3,1.5,'#445566');
  g.strokeStyle='#4aa3ff';g.lineWidth=2;g.beginPath();
  for(let i=0;i<line.length;i++){const X=MX(line[i].x),Y=MY(line[i].y);if(i)g.lineTo(X,Y);else g.moveTo(X,Y);}
  g.stroke();
  // the road the car's body sweeps: its full width along the path it drove (build 354)
  const S=R.samples||[],bw=(R.trackW||1.8)*sc;
  if(S.length>1){g.strokeStyle='rgba(85,221,102,0.22)';g.lineWidth=Math.max(2,bw);g.lineCap='butt';g.lineJoin='round';
    g.beginPath();for(let i=0;i<S.length;i++){const X=MX(S[i].x),Y=MY(S[i].y);if(i)g.lineTo(X,Y);else g.moveTo(X,Y);}g.stroke();}
  const now=chalMooseNow();
  const s=mooseSampleAt(R,now);
  if(s){   // the car at true size: width × (CG to front bumper + CG to rear bumper), turned by its heading
    const B=R.body||{f:2,r:2.3},c=Math.cos(s.psi||0),sn=Math.sin(s.psi||0),hw=(R.trackW||1.8)/2;
    g.fillStyle='#55dd66';g.beginPath();
    [[B.f,hw],[B.f,-hw],[-B.r,-hw],[-B.r,hw]].forEach(([dx,dy],k)=>{const X=MX(s.x+dx*c-dy*sn),Y=MY(s.y+dx*sn+dy*c);if(k)g.lineTo(X,Y);else g.moveTo(X,Y);});
    g.closePath();g.fill();}
  if(R.coneX!=null){const X=MX(R.coneX),Y=MY(R.coneY);g.strokeStyle='#ff4444';g.lineWidth=2;   // where a cone was first touched
    g.beginPath();g.moveTo(X-5,Y-5);g.lineTo(X+5,Y+5);g.moveTo(X+5,Y-5);g.lineTo(X-5,Y+5);g.stroke();}
  g.restore();
  g.fillStyle='#9ab';g.font='7px "Press Start 2P"';
  g.fillText(tr('ISO 3888-2')+' · '+R.speedKmh+' km/h · '+tr('car width')+' '+(R.trackW||0).toFixed(2)+' m · '+tr('lanes')+' '+G.w1.toFixed(2)+' / '+G.w2.toFixed(2)+' / 3.00 m',x0+8,y0+12);
}
// Arrow helpers for the moose frontal free-body sketch (owner diagram: yellow body, blue wheels, red springs, cyan forces).
function mooseArrow(g,x1,y1,x2,y2,col,lw){
  const dx=x2-x1,dy=y2-y1,L=Math.hypot(dx,dy)||1,ux=dx/L,uy=dy/L,ah=Math.min(10,L*0.35);
  g.strokeStyle=col;g.fillStyle=col;g.lineWidth=lw||2;g.lineCap='round';
  g.beginPath();g.moveTo(x1,y1);g.lineTo(x2,y2);g.stroke();
  g.beginPath();g.moveTo(x2,y2);g.lineTo(x2-ah*ux+ah*0.45*uy,y2-ah*uy-ah*0.45*ux);g.lineTo(x2-ah*ux-ah*0.45*uy,y2-ah*uy+ah*0.45*ux);g.closePath();g.fill();
}
function mooseSpring(g,x1,y1,x2,y2,col){
  const n=6,dx=x2-x1,dy=y2-y1,L=Math.hypot(dx,dy)||1,ux=dx/L,uy=dy/L,px=-uy,py=ux,amp=5;
  g.strokeStyle=col;g.lineWidth=2;g.lineCap='round';g.beginPath();g.moveTo(x1,y1);
  for(let i=1;i<n;i++){const t=i/n,s=(i%2?1:-1)*amp;g.lineTo(x1+dx*t+px*s,y1+dy*t+py*s);}
  g.lineTo(x2,y2);g.stroke();
}
// Front axle free-body (build 352; the owner's sketch of build 351, redrawn to scale with every force labelled).
// Seen from behind, so the car's left is on the left. Sample sign convention (stepCar): +y, +ay and +Fy point left;
// +roll lowers the right side; camber is the wheel's tilt, + top to the left. Index 0 is front left, 1 front right.
// Every arrow is a force on the front axle and the body it carries, all on one scale (px per kN):
//   W   the axle's weight, Fz(L)+Fz(R) at rest, down through the CG;
//   m·ay the axle's inertial (d'Alembert) force, outward from the turn: −(Fy(L)+Fy(R)) = m_front · ay at the front
//        axle. In the quick yaw of a lane change this differs from ay at the CG (yaw acceleration × CG-to-axle), so
//        the readout gives both;
//   Fz  each tyre's ground reaction, up at its contact patch;
//   Fy  each tyre's side force, along the ground at its contact patch, toward the turn.
// Roll and camber are drawn at their true angles (a soft car rolls 4–6° here, plain to see).
const MOOSE_ANG_X=1;   // (fixed-speed runs and failure modes: build 352)
function mooseLabel(g,txt,x,y,col,align){
  g.font='7px "Press Start 2P"';const w=g.measureText(txt).width,X=align==='r'?x-w:align==='c'?x-w/2:x;
  g.fillStyle='rgba(10,14,20,0.85)';g.fillRect(X-2,y-8,w+4,10);g.fillStyle=col;g.fillText(txt,X,y);
}
function drawMooseFrontal(g,R,x0,y0,w,h){
  const now=chalMooseNow();
  const s=mooseSampleAt(R,now);if(!s)return;
  const COL={body:'#ffcc00',glass:'#1d3550',wheel:'#4aa3ff',tyre:'#151a22',spring:'#ff4444',arm:'#8899aa',
    fz:'#66ddff',fy:'#55dd66',w:'#ffffff',in:'#ff9944',road:'#3a4454',ink:'#e0e0e0',dim:'#9ab'};
  const kN=f=>(f/1000).toFixed(2)+' kN';
  const Fz=s.Fz||[0,0,0,0],Fy=s.Fy||[0,0,0,0],cam=s.camber||[0,0,0,0];
  const FzL=Fz[0]||0,FzR=Fz[1]||0,FyL=Fy[0]||0,FyR=Fy[1]||0;
  const S0=R.samples[0]||s,Wf=(S0.Fz[0]||0)+(S0.Fz[1]||0);   // axle weight: the loads at rest, before the first steer
  const Fin=-(FyL+FyR),roll=s.roll||0;
  // scale: px per metre from the overall width and height; px per N so the weight arrow is 70% of the CG height
  const trackM=R.track||1.5,widthM=R.trackW||trackM+0.2,heightM=1.35,rM=R.rT||0.3,cgM=R.cgH||0.5;
  const ground=y0+h*0.66;
  const k=Math.min((w*0.62)/widthM,(ground-y0-26)/heightM);
  const cx=x0+w/2,fs=(cgM*k*0.95)/Math.max(1,Wf);
  // road and hatching
  g.strokeStyle=COL.road;g.lineWidth=2;g.beginPath();g.moveTo(x0+8,ground);g.lineTo(x0+w-8,ground);g.stroke();
  g.lineWidth=1;for(let X=x0+12;X<x0+w-8;X+=10){g.beginPath();g.moveTo(X,ground);g.lineTo(X-6,ground+6);g.stroke();}
  // a two-wheel lift (build 352): the whole axle tips about the outer tyre's contact, by the rigid tip angle
  const tipA=s.tip||0;
  if(tipA){const px=cx+Math.sign(tipA)*-(trackM/2)*k;g.save();g.translate(px,ground);g.rotate(-tipA);g.translate(-px,-ground);}
  // body: rolls about the roll centre, taken at ground level + 0.1 m (a typical strut front; drawn, not solved)
  const rc=[cx,ground-0.1*k],ang=roll*MOOSE_ANG_X,c=Math.cos(ang),sn=Math.sin(ang);
  const B=(xm,ym)=>{const dx=xm*k,dy=-ym*k;return[rc[0]+dx*c-dy*sn,rc[1]+dx*sn+dy*c];};
  const hw=widthM/2;
  const poly=(pts,fill,stroke,lw)=>{g.beginPath();pts.forEach((q,i)=>{const P=B(q[0],q[1]);if(i)g.lineTo(P[0],P[1]);else g.moveTo(P[0],P[1]);});g.closePath();
    if(fill){g.fillStyle=fill;g.fill();}if(stroke){g.strokeStyle=stroke;g.lineWidth=lw||2;g.lineJoin='round';g.stroke();}};
  // lower body (sills to shoulders), greenhouse, bumper; heights in metres above the roll centre's base
  poly([[-hw*0.97,0.22],[hw*0.97,0.22],[hw,0.55],[hw*0.92,0.78],[-hw*0.92,0.78],[-hw,0.55]],'rgba(255,204,0,0.10)',COL.body,2.5);
  poly([[-hw*0.80,0.78],[hw*0.80,0.78],[hw*0.60,1.22],[-hw*0.60,1.22]],COL.glass,COL.body,2.5);
  poly([[-hw*0.55,1.22],[hw*0.55,1.22],[hw*0.5,1.26],[-hw*0.5,1.26]],null,COL.body,2);
  for(const sd of [-1,1])poly([[sd*hw*0.80,0.86],[sd*hw*1.06,0.86],[sd*hw*1.06,0.94],[sd*hw*0.84,0.94]],null,COL.body,1.5);   // mirrors
  poly([[-0.26,0.40],[0.26,0.40],[0.26,0.52],[-0.26,0.52]],null,COL.dim,1.5);   // number plate
  // wheels on the ground (travel is millimetres: not drawn), tilted by camber about the contact patch
  const tw=Math.max(8,0.21*k),th=2*rM*k;
  const wheel=(side,gam)=>{const xc=cx+side*trackM/2*k,a=-gam*MOOSE_ANG_X;   // + camber tilts the top left (screen −x)
    const P=(dx,dy)=>[xc+dx*Math.cos(a)-dy*Math.sin(a),ground+dx*Math.sin(a)+dy*Math.cos(a)];
    return{xc,P,hub:P(0,-th/2),top:P(0,-th*0.85)};};
  const WL=wheel(-1,cam[0]||0),WR=wheel(1,cam[1]||0);
  // suspension: lower arm hub → body, strut (spring) from the arm to the tower
  for(const [W,sd] of [[WL,-1],[WR,1]]){
    const inner=B(sd*hw*0.35,0.22),tower=B(sd*hw*0.62,0.70);
    g.strokeStyle=COL.arm;g.lineWidth=2;g.beginPath();g.moveTo(W.hub[0],W.hub[1]);g.lineTo(inner[0],inner[1]);g.stroke();
    mooseSpring(g,W.top[0],W.top[1],tower[0],tower[1],COL.spring);
  }
  for(const W of [WL,WR]){
    const q=[W.P(-tw/2,0),W.P(tw/2,0),W.P(tw/2,-th),W.P(-tw/2,-th)];
    g.beginPath();q.forEach((P,i)=>i?g.lineTo(P[0],P[1]):g.moveTo(P[0],P[1]));g.closePath();
    g.fillStyle=COL.tyre;g.fill();g.strokeStyle=(W===WL?FzL:FzR)<=0?'#ff4444':COL.wheel;g.lineWidth=2.5;g.stroke();
    g.fillStyle=COL.wheel;g.beginPath();g.arc(W.hub[0],W.hub[1],Math.max(2,tw*0.25),0,Math.PI*2);g.fill();
  }
  // CG (checkered disc)
  const cg=B(0,cgM-0.1);
  g.fillStyle='#fff';g.beginPath();g.arc(cg[0],cg[1],5,0,Math.PI*2);g.fill();
  g.fillStyle='#0a0e14';g.beginPath();g.moveTo(cg[0],cg[1]);g.arc(cg[0],cg[1],5,0,Math.PI/2);g.closePath();g.fill();
  g.beginPath();g.moveTo(cg[0],cg[1]);g.arc(cg[0],cg[1],5,Math.PI,Math.PI*1.5);g.closePath();g.fill();
  // forces
  const L=f=>Math.max(4,Math.abs(f)*fs);
  mooseArrow(g,cg[0],cg[1],cg[0],cg[1]+L(Wf),COL.w,2);
  mooseLabel(g,'W '+kN(Wf),cg[0]+6,cg[1]+L(Wf)-2,COL.w);
  if(Math.abs(Fin)>100){const d=Math.sign(-Fin);   // Fin is + to the left (screen −x)
    mooseArrow(g,cg[0],cg[1],cg[0]+d*L(Fin),cg[1],COL.in,2.5);
    mooseLabel(g,'m·ay(front) '+kN(Math.abs(Fin)),cg[0]+d*(L(Fin)+4),cg[1]-6,COL.in,d>0?'l':'r');}
  for(const [W,fz,fy,sd] of [[WL,FzL,FyL,-1],[WR,FzR,FyR,1]]){
    const x=W.xc;
    mooseArrow(g,x,ground+L(fz),x,ground+1,COL.fz,2.5);
    mooseLabel(g,'Fz '+kN(fz),x,ground+L(fz)+12,COL.fz,'c');   // below its arrow; Fy's label sits higher, beside it
    if(Math.abs(fy)>100){const d=-Math.sign(fy),yy=ground+4;
      mooseArrow(g,x,yy,x+d*L(fy),yy,COL.fy,2.5);
      mooseLabel(g,'Fy '+kN(Math.abs(fy)),x+d*L(fy)+(d>0?4:-4),ground+14,COL.fy,d>0?'l':'r');}
  }
  // roll arc about the roll centre, with the true angle
  const rollDeg=roll*180/Math.PI;
  if(Math.abs(rollDeg)>0.05){
    const a0=-Math.PI/2,a1=a0+ang;
    const rr=1.0*k;
    g.strokeStyle=COL.body;g.lineWidth=1;g.setLineDash([3,3]);g.beginPath();g.moveTo(rc[0],rc[1]);g.lineTo(rc[0],rc[1]-rr);g.stroke();g.setLineDash([]);
    g.lineWidth=2;g.beginPath();g.arc(rc[0],rc[1],rr,a0,a1,ang<0);g.stroke();
    mooseLabel(g,'roll '+Math.abs(rollDeg).toFixed(1)+'°',rc[0]+(ang>0?8:-8),rc[1]-rr-4,COL.body,ang>0?'l':'r');
  }
  if(tipA)g.restore();
  // outcome of the run, top right
  g.font='10px "Press Start 2P"';const oc=tr(R.outcome||'CLEAR'),ow=g.measureText(oc).width;
  g.fillStyle=MOOSE_OUT_COL[R.outcome]||COL.ink;g.fillText(oc,x0+w-ow-12,y0+18);
  g.font='7px "Press Start 2P"';let ry=y0+32;
  for(const [on,t2,c2] of [[s.cone,tr('cone hit'),COL.dim],[tipA,tr('two wheels up')+' · '+tr('tip')+' '+(Math.abs(tipA)*180/Math.PI).toFixed(0)+'°','#ff4444']])
    if(on){g.fillStyle=c2;g.fillText(t2,x0+w-g.measureText(t2).width-12,ry);ry+=12;}
  // readout
  g.fillStyle=COL.ink;g.font='8px "Press Start 2P"';
  const ay=s.ay||0,ayF=Wf>0?Fin/Wf:0;   // the front axle's lateral acceleration in g: ΣFy / (W_front / g)
  const lines=[Math.round((s.v||0)*3.6)+' km/h','ay CG '+Math.abs(ay).toFixed(2)+' g','ay front '+Math.abs(ayF).toFixed(2)+' g','t '+(s.t||0).toFixed(2)+' s'];
  for(let i=0;i<lines.length;i++)g.fillText(lines[i],x0+10,y0+16+i*13);
  g.fillStyle=COL.dim;g.font='7px "Press Start 2P"';
  g.fillText(tr('Front axle, seen from behind. Forces to one scale; true roll and camber. Tap to switch view.'),x0+10,y0+h-20);
  const leg=[[COL.w,'W'],[COL.in,'m·ay(front)'],[COL.fz,'Fz'],[COL.fy,'Fy'],[COL.spring,tr('spring')]];
  let lx=x0+10;for(const [col,t] of leg){g.fillStyle=col;g.fillRect(lx,y0+h-14,8,6);g.fillStyle=COL.dim;g.fillText(t,lx+11,y0+h-8);lx+=g.measureText(t).width+24;}
}
// View from above (build 357): tap the lower diagram to switch between it and the front axle. Car-fixed, nose up,
// to true scale and true angles. The yaw axis (z) is drawn through the CG with the yaw rate r round it. The pivot is
// the point on the car's centre line that has no sideways velocity, x = −vy/r: at the rear axle in a slow turn, moving
// forward as the rear tyres slip more. Understeer or oversteer is read from the slip angles, the textbook way: the
// front axle slips more than the rear (αF > αR) in understeer, less in oversteer (Gillespie, Fundamentals of Vehicle
// Dynamics, ch. 6; Milliken & Milliken, RCVD ch. 5). Two arcs ahead compare the path the car takes (curvature r/V)
// with the one the same steer gives at neutral steer and low speed (δ/L, Ackermann).
let chalMooseView='front';
const MOOSE_NEUTRAL_DEG=0.5;   // display band: |αF−αR| under 0.5° reads NEUTRAL (a choice for legibility, not physics)
function mooseBalance(s,R){
  const A=s.alpha||[0,0,0,0],aF=(A[0]+A[1])/2,aR=(A[2]+A[3])/2;
  const sg=Math.sign(aF+aR)||1,d=(aF-aR)*sg*180/Math.PI;   // > 0: the front slips more (understeer)
  // front and rear slipping opposite ways: the car is being turned from one lane to the next (a yaw moment, not a
  // steady balance), where understeer and oversteer are not defined
  const tag=Math.abs(s.ay||0)<0.05?'STRAIGHT':aF*aR<0&&Math.min(Math.abs(aF),Math.abs(aR))>0.2*Math.PI/180?'TRANSITION':
    Math.abs(d)<MOOSE_NEUTRAL_DEG?'NEUTRAL':d>0?'UNDERSTEER':'OVERSTEER';
  return{aF,aR,d,tag};
}
const MOOSE_BAL_COL={STRAIGHT:'#9ab',TRANSITION:'#bb88ff',NEUTRAL:'#55dd66',UNDERSTEER:'#4aa3ff',OVERSTEER:'#ff8833'};
function drawMoosePlan(g,R,x0,y0,w,h){
  const s=mooseSampleAt(R,chalMooseNow());if(!s)return;
  g.save();g.beginPath();g.rect(x0,y0,w,h);g.clip();
  const COL={body:'#ffcc00',wheel:'#4aa3ff',tyre:'#151a22',fy:'#55dd66',vel:'#ffffff',ink:'#e0e0e0',dim:'#9ab',yaw:'#ff66cc'};
  const a=R.a||1.2,b=R.b||1.4,L=a+b,tF=R.tF||R.track||1.5,tR=R.tR||R.track||1.5,rT=R.rT||0.3;
  const B=R.body||{f:a+0.9,r:b+0.9},hw=(R.trackW||tF+0.2)/2;
  const k=Math.min((h-70)/(B.f+B.r+3.2),w*0.30/(2*hw+1.2)),cx=x0+w/2,cy=y0+34+(B.f+2.6)*k;
  const P=(x,y)=>[cx-y*k,cy-x*k];   // vehicle frame (x forward, y left) to screen, seen from above
  const poly=(pts,fill,stroke,lw)=>{g.beginPath();pts.forEach((q,i)=>{const p=P(q[0],q[1]);if(i)g.lineTo(p[0],p[1]);else g.moveTo(p[0],p[1]);});g.closePath();
    if(fill){g.fillStyle=fill;g.fill();}if(stroke){g.strokeStyle=stroke;g.lineWidth=lw||2;g.lineJoin='round';g.stroke();}};
  const arrow=(x1,y1,x2,y2,col,lw)=>{const p=P(x1,y1),q=P(x2,y2);mooseArrow(g,p[0],p[1],q[0],q[1],col,lw);};
  const bal=mooseBalance(s,R),bc=MOOSE_BAL_COL[bal.tag];
  const vx=s.vx!=null?s.vx:(s.v||0),vy=s.vy||0,r=s.yaw||0,V=Math.max(0.1,Math.hypot(vx,vy)),dl=s.delta||0;
  // the two paths ahead from the CG, 9 m long: neutral steer (δ/L) dashed, the car's own (r/V) in the balance colour
  const arc=(kap,col,dash)=>{let x=0,y=0,th=Math.atan2(vy,vx);g.strokeStyle=col;g.lineWidth=2;g.setLineDash(dash);g.beginPath();
    let p=P(x,y);g.moveTo(p[0],p[1]);for(let i=0;i<45;i++){x+=0.2*Math.cos(th);y+=0.2*Math.sin(th);th+=0.2*kap;p=P(x,y);g.lineTo(p[0],p[1]);}g.stroke();g.setLineDash([]);};
  arc(Math.tan(dl)/L,'rgba(255,255,255,0.55)',[4,4]);
  arc(r/V,bc,[]);
  // body
  poly([[B.f,-hw*0.85],[B.f-0.15,-hw],[-B.r+0.1,-hw],[-B.r,-hw*0.9],[-B.r,hw*0.9],[-B.r+0.1,hw],[B.f-0.15,hw],[B.f,hw*0.85]],'rgba(255,204,0,0.08)',COL.body,2.5);
  poly([[a*0.55,-hw*0.78],[a*0.55,hw*0.78],[a*0.05,hw*0.82],[a*0.05,-hw*0.82]],'#1d3550',COL.body,1.5);   // windscreen
  // wheels: true size, the fronts at the road-wheel steer angle; each tyre's travel direction from its velocity
  const xw=[a,a,-b,-b],yw=[tF/2,-tF/2,tR/2,-tR/2],Fy=s.Fy||[0,0,0,0],A=s.alpha||[0,0,0,0];
  const Fz0=(R.samples[0].Fz||[1,1,1,1]).reduce((p,q)=>p+q,0)/4,fs=1.1/Math.max(1,Fz0);   // metres of arrow per newton: a wheel's static load = 1.1 m
  for(let i=0;i<4;i++){
    const d=i<2?dl:0,c=Math.cos(d),sn=Math.sin(d),lx=rT,ly=0.11;
    const q=[[lx,ly],[lx,-ly],[-lx,-ly],[-lx,ly]].map(([u,v])=>[xw[i]+u*c-v*sn,yw[i]+u*sn+v*c]);
    const hot=(i<2&&bal.tag==='UNDERSTEER')||(i>=2&&bal.tag==='OVERSTEER');   // the axle that slips more
    poly(q,COL.tyre,hot?bc:COL.wheel,hot?3:2);
    const ux=vx-r*yw[i],uy=vy+r*xw[i],U=Math.hypot(ux,uy)||1;   // the contact patch's velocity
    const p=P(xw[i],yw[i]),e=P(xw[i]+1.3*ux/U,yw[i]+1.3*uy/U);
    g.strokeStyle=COL.vel;g.lineWidth=1;g.setLineDash([2,3]);g.beginPath();g.moveTo(p[0],p[1]);g.lineTo(e[0],e[1]);g.stroke();g.setLineDash([]);
    if(Math.abs(Fy[i])>100){arrow(xw[i],yw[i],xw[i],yw[i]+Fy[i]*fs,COL.fy,2.5);}
  }
  for(const [ax,nm,al] of [[a,'αF',bal.aF],[-b,'αR',bal.aR]]){const p=P(ax,0);
    mooseLabel(g,nm+' '+(Math.abs(al)*180/Math.PI).toFixed(1)+'°',p[0]+(hw+1.5)*k,p[1]+3,COL.dim,'l');}
  // the z axis at the CG (out of the page) and the yaw rate round it
  const cg=P(0,0),rr=0.75*k,ry=Math.max(-1,Math.min(1,r/1.2))*Math.PI*1.4;   // a full 1.4π of arc at 1.2 rad/s
  g.strokeStyle=COL.yaw;g.lineWidth=1.5;g.beginPath();g.arc(cg[0],cg[1],7,0,Math.PI*2);g.stroke();
  g.fillStyle=COL.yaw;g.beginPath();g.arc(cg[0],cg[1],2.5,0,Math.PI*2);g.fill();
  if(Math.abs(ry)>0.05){const a0=-Math.PI/2,a1=a0-ry;   // + r turns the nose left: anticlockwise on screen
    g.lineWidth=2.5;g.beginPath();g.arc(cg[0],cg[1],rr,a0,a1,ry>0);g.stroke();
    const ex=cg[0]+rr*Math.cos(a1),ey=cg[1]+rr*Math.sin(a1),tx=ry>0?Math.sin(a1):-Math.sin(a1),ty=ry>0?-Math.cos(a1):Math.cos(a1);
    mooseArrow(g,ex-tx*8,ey-ty*8,ex,ey,COL.yaw,2.5);}
  mooseLabel(g,'z · r '+Math.abs(r*180/Math.PI).toFixed(0)+'°/s',cg[0]+rr+6,cg[1]+3,COL.yaw,'l');
  // the CG's velocity, and the body slip angle β between it and the heading
  arrow(0,0,1.9*vx/V,1.9*vy/V,COL.vel,2);
  const beta=Math.atan2(vy,Math.max(0.1,vx))*180/Math.PI;
  // the pivot: no sideways velocity there
  // off the panel it is named at the edge with its distance from the CG (far ahead in oversteer, behind in a skid)
  if(Math.abs(r)>0.03){const xp=-vy/r,xMax=(cy-y0-14)/k,xMin=-(y0+h-44-cy)/k,xc=Math.max(xMin,Math.min(xMax,xp)),p=P(xc,0);
    const lbl=tr('pivot')+' '+(xp>=0?'+':'')+xp.toFixed(1)+' m';
    g.strokeStyle=COL.ink;g.lineWidth=2;g.setLineDash(xc===xp?[]:[3,3]);g.beginPath();g.moveTo(p[0]-hw*k-6,p[1]);g.lineTo(p[0]+hw*k+6,p[1]);g.stroke();g.setLineDash([]);
    g.beginPath();g.arc(p[0],p[1],4,0,Math.PI*2);g.fillStyle=COL.ink;g.fill();
    mooseLabel(g,lbl,p[0]-hw*k-10,p[1]+3,COL.ink,'r');}
  // balance tag and gauge, top right
  g.font='10px "Press Start 2P"';const tt=tr(bal.tag),tw=g.measureText(tt).width;g.fillStyle=bc;g.fillText(tt,x0+w-tw-12,y0+18);
  const gw=Math.min(180,w*0.3),gx=x0+w-gw-12,gy=y0+30,u=Math.max(-1,Math.min(1,-bal.d/5));
  g.fillStyle='#1c2330';g.fillRect(gx,gy,gw,8);g.fillStyle=MOOSE_BAL_COL.UNDERSTEER;g.fillRect(gx,gy,4,8);g.fillStyle=MOOSE_BAL_COL.OVERSTEER;g.fillRect(gx+gw-4,gy,4,8);
  if(bal.tag!=='TRANSITION'&&bal.tag!=='STRAIGHT'){g.fillStyle=bc;g.fillRect(gx+gw/2+u*gw/2-2,gy-3,4,14);}
  g.font='7px "Press Start 2P"';g.fillStyle=COL.dim;g.fillText(tr('UNDER'),gx,gy+20);const ov=tr('OVER');g.fillText(ov,gx+gw-g.measureText(ov).width,gy+20);
  const dd='αF−αR '+(bal.d>=0?'+':'')+bal.d.toFixed(1)+'°';g.fillText(dd,gx+gw/2-g.measureText(dd).width/2,gy+20);
  // readout
  g.fillStyle=COL.ink;g.font='8px "Press Start 2P"';
  const lines=[Math.round(V*3.6)+' km/h','ay '+Math.abs(s.ay||0).toFixed(2)+' g','β '+Math.abs(beta).toFixed(1)+'°','δ '+(Math.abs(dl)*180/Math.PI).toFixed(1)+'°','t '+(s.t||0).toFixed(2)+' s'];
  for(let i=0;i<lines.length;i++)g.fillText(lines[i],x0+10,y0+16+i*13);
  g.fillStyle=COL.dim;g.font='7px "Press Start 2P"';
  g.fillText(tr('Seen from above, nose up. True scale and angles. Tap to switch view.'),x0+10,y0+h-20);
  const leg=[[COL.yaw,tr('yaw axis z, rate r')],[COL.fy,'Fy'],[COL.vel,tr('tyre travel')],['rgba(255,255,255,0.55)',tr('neutral path')],[bc,tr('path')]];
  let lx=x0+10;for(const [col,t] of leg){g.fillStyle=col;g.fillRect(lx,y0+h-14,8,6);g.fillStyle=COL.dim;g.fillText(t,lx+11,y0+h-8);lx+=g.measureText(t).width+24;}
  g.restore();
}
function mooseStrip(){return Math.min(120,Math.floor(vizH*0.32));}
function drawMooseChallenge(g,R){
  chalHover.map=null;
  g.fillStyle='#0a0e14';g.fillRect(0,0,vizW,vizH);
  const strip=mooseStrip();
  drawMooseTopDown(g,R,0,0,vizW,strip);
  g.strokeStyle='#2a3344';g.beginPath();g.moveTo(0,strip);g.lineTo(vizW,strip);g.stroke();
  if(chalMooseView==='plan')drawMoosePlan(g,R,0,strip,vizW,vizH-strip);else drawMooseFrontal(g,R,0,strip,vizW,vizH-strip);
}
function drawChallengePreview(g,ch){
  const W=vizW,H=vizH,topBar=34,botBar=52;
  chalHover.map=null;
  g.fillStyle='#0a0e14';g.fillRect(0,0,W,H);
  let stats='';
  if(ch.road&&typeof buildRoad==='function'){
    const T=buildRoad(ch.road);
    if(T&&T.pts&&T.pts.length>1){
      const p=T.pts,n=p.length,pad=24,dx=T.maxX-T.minX||1,dy=T.maxY-T.minY||1;
      const sc=Math.min((W-2*pad)/dx,(H-topBar-botBar-2*pad)/dy);
      const ox=(W-dx*sc)/2,oy=topBar+(H-topBar-botBar-dy*sc)/2;
      const MX=q=>ox+(q.x-T.minX)*sc,MY=q=>oy+(T.maxY-q.y)*sc;
      g.strokeStyle='#2a3344';g.lineWidth=Math.max(4,T.width*sc);g.lineJoin='round';g.lineCap='round';
      g.beginPath();for(let i=0;i<n;i++){if(i)g.lineTo(MX(p[i]),MY(p[i]));else g.moveTo(MX(p[i]),MY(p[i]));}g.stroke();
      g.strokeStyle='#4aa3ff';g.lineWidth=2;
      g.beginPath();for(let i=0;i<n;i++){if(i)g.lineTo(MX(p[i]),MY(p[i]));else g.moveTo(MX(p[i]),MY(p[i]));}g.stroke();
      g.fillStyle='#00ff88';g.beginPath();g.arc(MX(p[0]),MY(p[0]),5,0,Math.PI*2);g.fill();
      g.fillStyle='#ff5555';g.beginPath();g.arc(MX(p[n-1]),MY(p[n-1]),5,0,Math.PI*2);g.fill();
      let z0=Infinity,z1=-Infinity;for(const q of p){const z=q.z||0;if(z<z0)z0=z;if(z>z1)z1=z;}
      stats=(T.length/1000).toFixed(1)+' km • '+T.corners+' '+tr('corners')+' • '+Math.round(z1-z0)+'m '+tr('elevation')+
        (ch.kind==='stage'?' • '+tr('SET TIME')+' '+ch.target+' s':' • '+tr('PACE')+' '+Math.round(chalPaceFactor*100)+'%');
    }
  }else{
    const cx=W/2,cy=topBar+(H-topBar-botBar)/2,rMax=Math.min(W-80,H-topBar-botBar-44)/2;
    g.lineCap='round';g.lineJoin='round';
    if(ch.kind==='moose'){
      const x0=cx-W*0.36,x1=cx+W*0.36,lx=x1-x0,yLo=cy+28,yHi=cy-28;
      g.strokeStyle='#2a3344';g.lineWidth=34;
      g.beginPath();g.moveTo(x0,yLo);g.lineTo(x0+lx*0.28,yLo);g.bezierCurveTo(x0+lx*0.38,yLo,x0+lx*0.40,yHi,x0+lx*0.50,yHi);
      g.lineTo(x0+lx*0.62,yHi);g.bezierCurveTo(x0+lx*0.72,yHi,x0+lx*0.74,yLo,x0+lx*0.84,yLo);g.lineTo(x1,yLo);g.stroke();
      g.setLineDash([6,5]);g.strokeStyle='#00ff88';g.lineWidth=2;g.stroke();g.setLineDash([]);
      g.fillStyle='#ff7722';
      for(const [fx,fy] of [[0.06,yLo-18],[0.16,yLo-18],[0.26,yLo-18],[0.06,yLo+18],[0.16,yLo+18],[0.26,yLo+18],
        [0.46,yHi-18],[0.56,yHi-18],[0.64,yHi-18],[0.46,yHi+18],[0.56,yHi+18],[0.64,yHi+18],
        [0.82,yLo-18],[0.92,yLo-18],[0.82,yLo+18],[0.92,yLo+18]])g.fillRect(x0+lx*fx-3,fy-3,6,6);
      stats='ISO 3888-2 • 61 m • '+tr('DOUBLE LANE CHANGE');
    }else if(ch.kind==='drift'){
      const R=rMax*0.58;
      g.strokeStyle='#2a3344';g.lineWidth=26;
      g.beginPath();g.moveTo(cx-R*2,cy+R);g.lineTo(cx-R,cy+R);g.arc(cx-R,cy,R,Math.PI/2,-Math.PI/2,true);
      g.arc(cx+R,cy,R,-Math.PI/2,Math.PI/2,false);g.lineTo(cx+R*2,cy+R);g.stroke();
      g.setLineDash([6,5]);g.strokeStyle='#ffaa00';g.lineWidth=2;g.stroke();g.setLineDash([]);
      stats=tr('S-ROUTE')+' • '+tr('2 LINKED CORNERS')+' • '+tr('POWERSLIDE');
    }else if(ch.kind==='skidpad'){
      const R=rMax*0.82;
      g.strokeStyle='#2a3344';g.lineWidth=22;g.beginPath();g.arc(cx,cy,R,0,Math.PI*2);g.stroke();
      g.setLineDash([6,5]);g.strokeStyle='#4aa3ff';g.lineWidth=2;g.beginPath();g.arc(cx,cy,R,0,Math.PI*2);g.stroke();g.setLineDash([]);
      stats='200 ft (61.0 m) '+tr('CIRCLE')+' • '+tr('STEADY LATERAL g');
    }else if(ch.kind==='spiral'){
      const drawSp=()=>{g.beginPath();for(let k=0;k<=120;k++){const a=k/120*Math.PI*2,r=rMax*(0.32+0.62*k/120),x=cx+Math.cos(a)*r,y=cy+Math.sin(a)*r;if(k)g.lineTo(x,y);else g.moveTo(x,y);}g.stroke();};
      g.strokeStyle='#2a3344';g.lineWidth=18;drawSp();
      g.setLineDash([6,5]);g.strokeStyle='#4aa3ff';g.lineWidth=2;drawSp();g.setLineDash([]);
      stats='12 m → 30.5 m '+tr('SPIRAL')+' • '+tr('RISING SPEED');
    }else if(ch.kind==='fig8'){
      const A=Math.min(W*0.36,rMax*1.45);
      const draw8=()=>{g.beginPath();for(let k=0;k<=160;k++){const t=k/160*Math.PI*2,d=1+Math.sin(t)*Math.sin(t),x=cx+A*Math.cos(t)/d,y=cy+A*Math.sin(t)*Math.cos(t)/d;if(k)g.lineTo(x,y);else g.moveTo(x,y);}g.stroke();};
      g.strokeStyle='#2a3344';g.lineWidth=18;draw8();
      g.setLineDash([6,5]);g.strokeStyle='#4aa3ff';g.lineWidth=2;draw8();g.setLineDash([]);
      stats=tr('LEMNISCATE')+' • '+tr('BOTH DIRECTIONS');
    }
  }
  g.fillStyle='rgba(13,13,24,0.86)';g.fillRect(0,H-botBar,W,botBar);
  drawPixelRect(0,0,W,28,'#12121c');
  g.fillStyle=C.yellow;g.font='10px "Press Start 2P"';
  g.fillText(tr('CHALLENGES')+' • '+tr(ch.name),12,19);
  g.font='7px "Press Start 2P"';g.fillStyle='#99a';
  g.fillText(stats||tr(ch.desc).slice(0,72),12,H-botBar+16);
  g.fillStyle=C.green;
  g.fillText(tr('Select a challenge and press START CHALLENGE.'),12,H-botBar+34);
}
function drawChallenge(){
  const R=chalResult,g=ctx;g.fillStyle='#0a0e14';g.fillRect(0,0,vizW,vizH);
  if(chalUI.phase!=='live'||!R){
    if(canvas.style.touchAction!=='')canvas.style.touchAction='';
    drawChallengePreview(g,runChallengeById(activeRunChallenge));
    return;
  }
  const ta=R&&R.road?'none':'';if(canvas.style.touchAction!==ta)canvas.style.touchAction=ta;   // a touch drag pans the route map
  if(R&&R.kind==='moose'&&R.ok){drawMooseChallenge(g,R);return;}
  if(R&&R.kind==='drift'&&R.ok){drawDriftChallenge(g,R);return;}
  if(R&&R.kind==='skidpad'&&R.ok){drawSkidpadChallenge(g,R);return;}
  if(R&&(R.kind==='spiral'||R.kind==='fig8')&&R.ok){drawCourseChallenge(g,R);return;}
  if(!R||!R.road){g.fillStyle='#556';g.font='10px "Press Start 2P"';g.fillText(tr('CHALLENGES'),16,28);chalHover.map=null;return;}
  const map=chalMapProject(R),p=map.p,n=p.length,MX=map.MX,MY=map.MY,T=map.T;
  chalHover.map=map;
  g.strokeStyle='#2a3344';g.lineWidth=Math.max(3,T.width*map.sc);g.lineJoin='round';g.lineCap='round';
  g.beginPath();for(let i=0;i<n;i++){const X=MX(p[i]),Y=MY(p[i]);if(i)g.lineTo(X,Y);else g.moveTo(X,Y);}g.stroke();
  if(R.v&&R.v.length===n){
    g.lineWidth=Math.max(2,T.width*map.sc*0.45);
    for(let i=0;i<n-1;i++){
      const u=R.v[i]/Math.max(1,R.vMin?R.vMin[i]:R.v[i]);
      g.strokeStyle=u>0.92?'#55dd66':u>0.7?'#ffcc00':'#4aa3ff';
      g.beginPath();g.moveTo(MX(p[i]),MY(p[i]));g.lineTo(MX(p[i+1]),MY(p[i+1]));g.stroke();
    }
  }
  g.fillStyle='#8f8';g.beginPath();g.arc(MX(p[0]),MY(p[0]),4,0,Math.PI*2);g.fill();
  g.fillStyle='#f88';g.beginPath();g.arc(MX(p[n-1]),MY(p[n-1]),4,0,Math.PI*2);g.fill();
  g.fillStyle='#9ab';g.font='8px "Press Start 2P"';
  g.fillText(tr(T.label)+' · '+(T.length/1000).toFixed(1)+' km · '+T.corners+' '+tr('corners')+' · '+(R.kind==='stage'?R.target+' s':(R.factor*100).toFixed(0)+'%'),10,18);
  const hi=chalHover.i,info=chalHoverInfo(hi);
  if(info){
    const X=MX(p[hi]),Y=MY(p[hi]);
    g.fillStyle='#fff';g.beginPath();g.arc(X,Y,5,0,Math.PI*2);g.fill();
    g.strokeStyle='#0a0e14';g.lineWidth=2;g.stroke();
    const lines=[
      (info.s/1000).toFixed(2)+' km',
      info.vKmh!=null?(Math.round(info.vKmh)+' km/h'):'—',
      (info.gradePct>=0?'+':'')+info.gradePct.toFixed(1)+'% / '+info.gradeDeg.toFixed(1)+'°'
    ];
    g.font='8px "Press Start 2P"';
    const padX=8,padY=6,lh=12,tw=Math.max(...lines.map(t=>g.measureText(t).width));
    const bw=tw+padX*2,bh=lines.length*lh+padY*2;
    let bx=X+12,by=Y-bh-8;
    if(bx+bw>vizW-4)bx=X-12-bw;
    if(by<4)by=Y+12;
    if(by+bh>vizH-4)by=vizH-4-bh;
    g.fillStyle='#151522';g.strokeStyle='#666';g.lineWidth=2;
    g.fillRect(bx,by,bw,bh);g.strokeRect(bx,by,bw,bh);
    g.fillStyle='#e0e0e0';
    for(let k=0;k<lines.length;k++)g.fillText(lines[k],bx+padX,by+padY+lh*(k+1)-3);
  }
}
function bindChallengeHover(){
  const toViz=e=>{
    const r=canvas.getBoundingClientRect();
    return{x:(e.clientX-r.left)*vizW/r.width,y:(e.clientY-r.top)*vizH/r.height};
  };
  const active=()=>vizMode==='challenges'&&!!chalResult&&!!chalResult.road;
  // Route maps zoom and scroll like the track map (build 354): wheel or pinch zooms, one pointer drags, double-click resets.
  canvas.addEventListener('wheel',e=>{if(!active())return;e.preventDefault();const p=toViz(e);chalZoomAt(p.x,p.y,Math.exp(-e.deltaY*0.0015));},{passive:false});
  canvas.addEventListener('dblclick',()=>{if(active())chalViewReset();});
  // a tap on the moose run's lower diagram switches it between the front axle and the view from above (build 357)
  canvas.addEventListener('click',e=>{const R=chalResult;
    if(vizMode!=='challenges'||!R||R.kind!=='moose'||!R.ok||toViz(e).y<mooseStrip())return;
    chalMooseView=chalMooseView==='plan'?'front':'plan';drawChallenge();});
  const ptrs=new Map();let last=null,pinch=null;
  canvas.addEventListener('pointerdown',e=>{
    if(!active())return;
    canvas.setPointerCapture(e.pointerId);ptrs.set(e.pointerId,toViz(e));
    if(ptrs.size===1)last=toViz(e);
    if(ptrs.size===2){const [a,b]=[...ptrs.values()];pinch={d:Math.hypot(a.x-b.x,a.y-b.y)};}
  });
  canvas.addEventListener('pointermove',e=>{
    if(!active())return;
    const p=toViz(e);
    if(ptrs.has(e.pointerId)){
      ptrs.set(e.pointerId,p);
      if(ptrs.size>=2&&pinch){const [a,b]=[...ptrs.values()],d=Math.hypot(a.x-b.x,a.y-b.y);if(pinch.d>1)chalZoomAt((a.x+b.x)/2,(a.y+b.y)/2,d/pinch.d);pinch.d=d;}
      else if(last&&chalView.z>1.0001){chalView.x+=p.x-last.x;chalView.y+=p.y-last.y;last=p;}
    }
    const i=chalHoverAt(p.x,p.y);
    if(i!==chalHover.i)chalHover.i=i;
  });
  const up=e=>{ptrs.delete(e.pointerId);if(ptrs.size<2)pinch=null;last=ptrs.size===1?[...ptrs.values()][0]:null;};
  canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',up);
  canvas.addEventListener('pointerleave',()=>{if(chalHover.i>=0)chalHover.i=-1;});
}
