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
// Frontal free-body: body outline rolls; wheels move with travel; springs; Fz up, Fy at contact, ay at CG, roll arc.
function drawMooseFrontal(g,R,x0,y0,w,h){
  const now=((typeof performance!=='undefined'?performance.now():Date.now())-chalMooseT0)/1000;
  const s=mooseSampleAt(R,now);if(!s)return;
  const COL={body:'#ffcc00',wheel:'#4aa3ff',spring:'#ff4444',force:'#66ddff',road:'#2a3344',ink:'#e0e0e0',dim:'#9ab'};
  const cx=x0+w/2,ground=y0+h*0.88,track=Math.min(w*0.58,h*1.05);
  const roll=s.roll||0,c=Math.cos(roll),sn=Math.sin(roll);
  const Fz=s.Fz||[0,0,0,0],Fy=s.Fy||[0,0,0,0],zu=s.zu||[0,0,0,0];
  const zL=zu[0]||0,zR=zu[1]||0,FzL=Fz[0]||0,FzR=Fz[1]||0,FyL=Fy[0]||0,FyR=Fy[1]||0;
  const FzSum=Math.max(1,FzL+FzR+(Fz[2]||0)+(Fz[3]||0)),ay=s.ay||0;
  const bodyW=track*0.55,bodyH=h*0.34,heave=((zL+zR)/2)*36;
  const pivY=ground-bodyH*0.55+heave;
  const rot=(px,py)=>{const dx=px-cx,dy=py-pivY;return[cx+dx*c-dy*sn,pivY+dx*sn+dy*c];};
  // road
  g.strokeStyle=COL.road;g.lineWidth=2;g.beginPath();g.moveTo(x0+12,ground);g.lineTo(x0+w-12,ground);g.stroke();
  // wheel centres (not rolled with body — contact stays near the ground; travel moves them vertically)
  const wh=Math.max(22,bodyH*0.55),ww=Math.max(10,track*0.07);
  const wheel=(side,zW)=>{
    const wx=cx+side*(track/2),wy=ground-wh/2+zW*36;
    return{wx,wy,top:wy-wh/2,bot:wy+wh/2,side};
  };
  const wL=wheel(-1,zL),wR=wheel(1,zR);
  // body silhouette (roof + cabin), outline only — matches the owner's sketch
  const roof=bodyH*0.38,cab=bodyH*0.62,half=bodyW/2;
  const bodyPts=[[-half*0.72,-bodyH/2],[-half*0.45,-bodyH/2-roof*0.15],[half*0.45,-bodyH/2-roof*0.15],[half*0.72,-bodyH/2],
    [half,bodyH/2],[-half,bodyH/2]].map(([px,py])=>rot(cx+px,pivY+py));
  g.strokeStyle=COL.body;g.lineWidth=2.5;g.lineJoin='round';g.beginPath();
  g.moveTo(bodyPts[0][0],bodyPts[0][1]);for(let i=1;i<bodyPts.length;i++)g.lineTo(bodyPts[i][0],bodyPts[i][1]);
  g.closePath();g.stroke();
  // body bottom corners (spring mounts) and CG
  const mountL=rot(cx-half*0.85,pivY+cab*0.15),mountR=rot(cx+half*0.85,pivY+cab*0.15);
  const cg=rot(cx,pivY-bodyH*0.05);
  // red springs body → wheels
  mooseSpring(g,mountL[0],mountL[1],wL.wx+ww*0.2,wL.top+4,COL.spring);
  mooseSpring(g,mountR[0],mountR[1],wR.wx-ww*0.2,wR.top+4,COL.spring);
  // blue wheels
  for(const W of [wL,wR]){
    g.strokeStyle=COL.wheel;g.lineWidth=2.5;g.strokeRect(W.wx-ww/2,W.top,ww,wh);
  }
  // cyan forces: Fz up under each wheel (length ∝ load), Fy at contact (sign = body-frame lateral)
  const fzScale=Math.min(48,h*0.18)/Math.max(FzL,FzR,FzSum*0.35);
  const fyScale=Math.min(40,w*0.06)/800;
  for(const [W,FzW,FyW] of [[wL,FzL,FyL],[wR,FzR,FyR]]){
    const fzLen=Math.max(8,FzW*fzScale);
    mooseArrow(g,W.wx,ground+2,W.wx,ground+2-fzLen,COL.force,2);
    const fyLen=Math.max(6,Math.min(42,Math.abs(FyW)*fyScale))*(FyW>=0?1:-1);
    // sketch: contact force into/along the turn — draw from outer edge toward the arrow tip
    mooseArrow(g,W.wx-Math.sign(fyLen||1)*ww*0.8,W.bot-2,W.wx-Math.sign(fyLen||1)*ww*0.8+fyLen,W.bot-2,COL.force,2);
  }
  // suspension geometry cues (body corner → wheel centre)
  g.strokeStyle=COL.force;g.lineWidth=1.5;g.setLineDash([4,3]);
  g.beginPath();g.moveTo(mountL[0],mountL[1]);g.lineTo(wL.wx,wL.wy);g.stroke();
  g.beginPath();g.moveTo(mountR[0],mountR[1]);g.lineTo(wR.wx,wR.wy);g.stroke();
  g.setLineDash([]);
  // lateral force at CG (ay)
  const ayLen=Math.max(8,Math.min(50,Math.abs(ay)*55))*(ay>=0?1:-1);
  g.beginPath();g.arc(cg[0],cg[1],4,0,Math.PI*2);g.fillStyle=COL.force;g.fill();
  mooseArrow(g,cg[0],cg[1],cg[0]+ayLen,cg[1],COL.force,2);
  // roll arc above the body (direction of roll rate / angle)
  const arcR=bodyW*0.42,sense=roll>=0?1:-1;
  g.strokeStyle=COL.force;g.lineWidth=2;g.beginPath();
  g.arc(cg[0],cg[1]-bodyH*0.15,arcR,sense>0?-1.1:-0.2,sense>0?-0.2:1.1,sense<=0);
  g.stroke();
  const a0=sense>0?-0.2:1.1,ax=cg[0]+arcR*Math.cos(a0),ayp=cg[1]-bodyH*0.15+arcR*Math.sin(a0);
  const tx=-Math.sin(a0)*sense,ty=Math.cos(a0)*sense;
  mooseArrow(g,ax-tx*8,ayp-ty*8,ax+tx*2,ayp+ty*2,COL.force,2);
  // stats
  g.fillStyle=COL.ink;g.font='8px "Press Start 2P"';
  const lines=[
    Math.round((s.v||0)*3.6)+' km/h',
    'ay '+ay.toFixed(2)+' g',
    'roll '+(roll*180/Math.PI).toFixed(1)+'°',
    'Fz L/R '+Math.round(FzL)+'/'+Math.round(FzR)+' N'
  ];
  for(let i=0;i<lines.length;i++)g.fillText(lines[i],x0+10,y0+16+i*14);
  g.fillStyle=COL.dim;g.font='7px "Press Start 2P"';
  g.fillText(tr('yellow body · blue wheels · red springs · cyan forces'),x0+10,y0+h-10);
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
