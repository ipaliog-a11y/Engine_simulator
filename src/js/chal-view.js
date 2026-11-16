// ====== CHALLENGES tab UI (build 341; EV 342; pace + route hover 344) ======
const chalHover={i:-1,map:null};
function refreshChallenge(){
  // Do not call buildVehicle here: it hooks back into refreshChallenge (same pattern as refreshLap).
  const ch=runChallengeById(activeRunChallenge);
  chalResult=solveRunChallenge(ch.id);
  chalHover.i=-1;
  renderChallenge();
}
function renderChallenge(){
  const head=document.getElementById('chalHead'),grid=document.getElementById('chalGrid'),note=document.getElementById('chalNote');
  if(!head)return;
  const ch=runChallengeById(activeRunChallenge);
  const R=chalResult;
  if(!R){head.textContent='—';grid.innerHTML='';note.textContent=tr('Build a car first.');return;}
  if(!R.ok){head.textContent='—';grid.innerHTML='';note.textContent=tr('This challenge is not ready yet.');return;}
  const onTarget=Math.abs(R.time-R.target)<=Math.max(1,0.01*R.target);
  const score=R.ev
    ?('<b>'+R.kWh.toFixed(2)+' kWh</b> · '+Math.round(R.whkm)+' Wh/km')
    :('<b>'+R.fuelL.toFixed(2)+' L</b> · '+R.l100.toFixed(1)+' L/100 km');
  // Time ≈ target by construction; show the target once, not both.
  head.innerHTML=tr(ch.name)+' · '+score+' · '+(onTarget?tr('ON TARGET'):tr('OFF TARGET'))+' '+R.target.toFixed(0)+' s';
  const cell=(k,v)=>'<div class="perf-cell"><div class="k">'+tr(k)+'</div><div class="v">'+v+'</div></div>';
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
function drawChallenge(){
  const R=chalResult,g=ctx;g.fillStyle='#0a0e14';g.fillRect(0,0,vizW,vizH);
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
