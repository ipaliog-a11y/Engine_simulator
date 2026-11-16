// ====== CHALLENGES tab UI (build 341; EV 342; pace + hover 344; moose 345) ======
const chalHover={i:-1,map:null};
let chalMooseT0=0;
function refreshChallenge(){
  // Do not call buildVehicle here: it hooks back into refreshChallenge (same pattern as refreshLap).
  const ch=runChallengeById(activeRunChallenge);
  chalResult=solveRunChallenge(ch.id);
  chalHover.i=-1;
  chalMooseT0=(typeof performance!=='undefined'?performance.now():Date.now());
  const pace=document.getElementById('chalPace');
  if(pace){const row=pace.closest('.field');if(row)row.style.display=ch.kind==='moose'?'none':'';}
  renderChallenge();
}
function renderChallenge(){
  const head=document.getElementById('chalHead'),grid=document.getElementById('chalGrid'),note=document.getElementById('chalNote');
  if(!head)return;
  const ch=runChallengeById(activeRunChallenge);
  const R=chalResult;
  if(!R){head.textContent='—';grid.innerHTML='';note.textContent=tr('Build a car first.');return;}
  if(!R.ok){head.textContent='—';grid.innerHTML='';note.textContent=tr('This challenge is not ready yet.');return;}
  const cell=(k,v)=>'<div class="perf-cell"><div class="k">'+tr(k)+'</div><div class="v">'+v+'</div></div>';
  if(R.kind==='moose'){
    head.innerHTML=tr(ch.name)+' · <b>'+R.speedKmh+' km/h</b> · '+tr('CLEAR');
    grid.innerHTML=cell('ENTRY',R.speedKmh+' km/h')+
      cell('PEAK ay',R.peakAy.toFixed(2)+' g')+
      cell('PEAK β',R.peakBeta.toFixed(1)+'°')+
      cell('WIDTH',R.trackW.toFixed(2)+' m')+
      cell('LANE 1',R.cones.w1.toFixed(2)+' m')+
      cell('OFFSET',R.cones.w2.toFixed(2)+' m');
    note.textContent=tr(ch.desc)+' '+tr('Throttle released at entry, top gear. Score is the highest entry speed that touches no cone (ISO 3888-2).');
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
  cells+=cell('TARGET',R.target.toFixed(1)+' s')+
    cell('MIN TIME',R.tMin.toFixed(1)+' s')+
    cell('PACE',(R.pace*100).toFixed(0)+' %')+
    cell('DISTANCE',R.lengthKm.toFixed(1)+' km');
  grid.innerHTML=cells;
  note.textContent=tr(R.road.blurb)+' '+tr('Target time is')+' '+(R.factor*100).toFixed(0)+'% '+tr('of this car\'s min-time (eco-rally). A speed cap hits the target; not yet an optimal lift-coast plan.');
}
function chalMapProject(R){
  const T=R.road,p=T.pts,pad=28,dx=T.maxX-T.minX||1,dy=T.maxY-T.minY||1;
  const sc=Math.min((vizW-2*pad)/dx,(vizH-2*pad)/dy);
  return{
    pad,sc,T,p,
    MX:q=>pad+(q.x-T.minX)*sc,
    MY:q=>vizH-pad-(q.y-T.minY)*sc
  };
}
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
function drawMooseTopDown(g,R,x0,y0,w,h){
  const G=R.cones,line=R.line;if(!line||!line.length)return;
  let minX=1e9,maxX=-1e9,minY=1e9,maxY=-1e9;
  for(const q of line){minX=Math.min(minX,q.x);maxX=Math.max(maxX,q.x);minY=Math.min(minY,q.y-2);maxY=Math.max(maxY,q.y+2);}
  minY=Math.min(minY,-G.w1/2-1);maxY=Math.max(maxY,G.y2+G.w2/2+1,G.y3+2);
  const pad=10,dx=maxX-minX||1,dy=maxY-minY||1;
  const sc=Math.min((w-2*pad)/dx,(h-2*pad)/dy);
  const MX=x=>x0+pad+(x-minX)*sc,MY=y=>y0+h-pad-(y-minY)*sc;
  const lane=(xA,xB,yc,hw,col)=>{
    g.strokeStyle=col;g.lineWidth=1;g.setLineDash([3,3]);
    g.beginPath();g.moveTo(MX(xA),MY(yc-hw));g.lineTo(MX(xB),MY(yc-hw));g.stroke();
    g.beginPath();g.moveTo(MX(xA),MY(yc+hw));g.lineTo(MX(xB),MY(yc+hw));g.stroke();
    g.setLineDash([]);
    g.fillStyle='#ffcc00';
    for(const yy of [yc-hw,yc+hw]){g.beginPath();g.arc(MX(xA),MY(yy),2.5,0,Math.PI*2);g.fill();g.beginPath();g.arc(MX(xB),MY(yy),2.5,0,Math.PI*2);g.fill();}
  };
  lane(0,12,0,G.w1/2,'#445566');
  lane(25.5,36.5,G.y2,G.w2/2,'#445566');
  lane(49,61,G.y3,1.5,'#445566');
  g.strokeStyle='#4aa3ff';g.lineWidth=2;g.beginPath();
  for(let i=0;i<line.length;i++){const X=MX(line[i].x),Y=MY(line[i].y);if(i)g.lineTo(X,Y);else g.moveTo(X,Y);}
  g.stroke();
  const now=((typeof performance!=='undefined'?performance.now():Date.now())-chalMooseT0)/1000;
  const s=mooseSampleAt(R,now);
  if(s){g.fillStyle='#55dd66';g.beginPath();g.arc(MX(s.x),MY(s.y),4,0,Math.PI*2);g.fill();}
  g.fillStyle='#9ab';g.font='7px "Press Start 2P"';
  g.fillText(tr('ISO 3888-2')+' · '+R.speedKmh+' km/h',x0+8,y0+12);
}
function drawMooseFrontal(g,R,x0,y0,w,h){
  const now=((typeof performance!=='undefined'?performance.now():Date.now())-chalMooseT0)/1000;
  const s=mooseSampleAt(R,now);if(!s)return;
  const cx=x0+w/2,ground=y0+h*0.82,track=Math.min(w*0.55,h*0.9);
  const roll=s.roll||0,c=Math.cos(roll),sn=Math.sin(roll);
  const Fz=s.Fz||[0,0,0,0],Fy=s.Fy||[0,0,0,0],zu=s.zu||[0,0,0,0];
  // Front axle wheels: 0 left, 1 right (drive-model order).
  const zL=zu[0]||0,zR=zu[1]||0;
  const FzL=Fz[0]||0,FzR=Fz[1]||0,FyL=Fy[0]||0,FyR=Fy[1]||0;
  const FzSum=Math.max(1,FzL+FzR+Fz[2]+Fz[3]);
  const bodyW=track*0.72,bodyH=h*0.28;
  const bodyY=ground-bodyH-18+((zL+zR)/2)*40;
  // road
  g.fillStyle='#1a2030';g.fillRect(x0,ground,w,h*0.18);
  g.strokeStyle='#2a3344';g.beginPath();g.moveTo(x0+8,ground);g.lineTo(x0+w-8,ground);g.stroke();
  const rot=(px,py)=>{const dx=px-cx,dy=py-bodyY-bodyH/2;return[cx+dx*c-dy*sn,bodyY+bodyH/2+dx*sn+dy*c];};
  // body
  const corners=[[-bodyW/2,-bodyH/2],[bodyW/2,-bodyH/2],[bodyW/2,bodyH/2],[-bodyW/2,bodyH/2]].map(([px,py])=>rot(cx+px,bodyY+bodyH/2+py));
  g.fillStyle='#c44';g.beginPath();g.moveTo(corners[0][0],corners[0][1]);
  for(let i=1;i<4;i++)g.lineTo(corners[i][0],corners[i][1]);g.closePath();g.fill();
  g.strokeStyle='#ffcc00';g.lineWidth=1;g.stroke();
  // wheels + load / Fy
  const drawWheel=(side,FzW,FyW,zW)=>{
    const tx=cx+side*track/2,ty=ground-8+zW*40;
    const [wx,wy]=rot(tx,ty-12);
    g.fillStyle='#222';g.fillRect(wx-7,wy,14,18);
    g.strokeStyle='#888';g.strokeRect(wx-7,wy,14,18);
    const loadH=Math.max(2,Math.min(40,40*(FzW/(FzSum/2))));
    g.fillStyle=FzW>FzSum*0.3?'#55dd66':'#ffcc00';
    g.fillRect(wx+(side>0?10:-14),wy+18-loadH,4,loadH);
    const fyPix=Math.max(-30,Math.min(30,FyW/800));
    g.strokeStyle='#4aa3ff';g.lineWidth=2;
    g.beginPath();g.moveTo(wx,wy+9);g.lineTo(wx+fyPix,wy+9);g.stroke();
  };
  drawWheel(-1,FzL,FyL,zL);drawWheel(1,FzR,FyR,zR);
  // stats
  g.fillStyle='#e0e0e0';g.font='8px "Press Start 2P"';
  const lines=[
    Math.round((s.v||0)*3.6)+' km/h',
    'ay '+(s.ay||0).toFixed(2)+' g',
    'roll '+(roll*180/Math.PI).toFixed(1)+'°',
    'Fz L/R '+Math.round(FzL)+'/'+Math.round(FzR)+' N'
  ];
  for(let i=0;i<lines.length;i++)g.fillText(lines[i],x0+10,y0+16+i*14);
}
function drawMooseChallenge(g,R){
  chalHover.map=null;
  g.fillStyle='#0a0e14';g.fillRect(0,0,vizW,vizH);
  const strip=Math.min(120,Math.floor(vizH*0.32));
  drawMooseTopDown(g,R,0,0,vizW,strip);
  g.strokeStyle='#2a3344';g.beginPath();g.moveTo(0,strip);g.lineTo(vizW,strip);g.stroke();
  drawMooseFrontal(g,R,0,strip,vizW,vizH-strip);
}
function drawChallenge(){
  const R=chalResult,g=ctx;g.fillStyle='#0a0e14';g.fillRect(0,0,vizW,vizH);
  if(R&&R.kind==='moose'&&R.ok){drawMooseChallenge(g,R);return;}
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
  g.fillText(tr(T.label)+' · '+(T.length/1000).toFixed(1)+' km · '+T.corners+' '+tr('corners')+' · '+(R.factor*100).toFixed(0)+'%',10,18);
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
  canvas.addEventListener('pointermove',e=>{
    if(vizMode!=='challenges'||!chalResult||!chalResult.road)return;
    const p=toViz(e),i=chalHoverAt(p.x,p.y);
    if(i!==chalHover.i)chalHover.i=i;
  });
  canvas.addEventListener('pointerleave',()=>{if(chalHover.i>=0)chalHover.i=-1;});
}
