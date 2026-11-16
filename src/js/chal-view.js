// ====== CHALLENGES tab UI (build 341, EV energy build 342) ======
function refreshChallenge(){
  // Do not call buildVehicle here: it hooks back into refreshChallenge (same pattern as refreshLap).
  const ch=runChallengeById(activeRunChallenge);
  chalResult=solveRunChallenge(ch.id);
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
function drawChallenge(){
  const R=chalResult,g=ctx;g.fillStyle='#0a0e14';g.fillRect(0,0,vizW,vizH);
  if(!R||!R.road){g.fillStyle='#556';g.font='10px "Press Start 2P"';g.fillText(tr('CHALLENGES'),16,28);return;}
  const T=R.road,p=T.pts,n=p.length;
  const pad=28,dx=T.maxX-T.minX||1,dy=T.maxY-T.minY||1;
  const sc=Math.min((vizW-2*pad)/dx,(vizH-2*pad)/dy);
  const MX=q=>pad+(q.x-T.minX)*sc,MY=q=>vizH-pad-(q.y-T.minY)*sc;
  g.strokeStyle='#2a3344';g.lineWidth=Math.max(3,T.width*sc);g.lineJoin='round';g.lineCap='round';
  g.beginPath();for(let i=0;i<n;i++){const X=MX(p[i]),Y=MY(p[i]);if(i)g.lineTo(X,Y);else g.moveTo(X,Y);}g.stroke();
  if(R.v&&R.v.length===n){
    g.lineWidth=Math.max(2,T.width*sc*0.45);
    for(let i=0;i<n-1;i++){
      const u=R.v[i]/Math.max(1,R.vMin?R.vMin[i]:R.v[i]);
      g.strokeStyle=u>0.92?'#55dd66':u>0.7?'#ffcc00':'#4aa3ff';
      g.beginPath();g.moveTo(MX(p[i]),MY(p[i]));g.lineTo(MX(p[i+1]),MY(p[i+1]));g.stroke();
    }
  }
  g.fillStyle='#8f8';g.beginPath();g.arc(MX(p[0]),MY(p[0]),4,0,Math.PI*2);g.fill();
  g.fillStyle='#f88';g.beginPath();g.arc(MX(p[n-1]),MY(p[n-1]),4,0,Math.PI*2);g.fill();
  g.fillStyle='#9ab';g.font='8px "Press Start 2P"';
  g.fillText(tr(T.label)+' · '+(T.length/1000).toFixed(1)+' km · '+T.corners+' '+tr('corners'),10,18);
}
