// ====== G-G DIAGRAM window (build 200) ======
// Over the VEHICLE tab: what the car can do at a road speed, sideways against along the road. Every number is the lap's
// own (simulateLapRun's probe), so nothing here is a second model of the car:
//   · the cornering limit, the tightest corner the lap's ceiling lets the car take at that speed;
//   · for each lateral acceleration up to it, the most the car can brake (the backward pass's brakeFrom: each axle's
//     grip after the cornering, the brakes' split and fade, the drag) and accelerate (the forward pass's accFrom: the
//     best gear, the driven axle's grip through the diff, the drag and rolling resistance);
// on level road, the brakes cold, the engine's own braking left out. Drawn at three road speeds, so what speed changes
// shows: the downforce widens the envelope, the power and the drag shrink the top of it. Under them, every point of the
// lap of the circuit chosen on the TRACK tab: how much of its envelope the car uses, and where.
const GG_SPEEDS=[60,120,180];   // km/h; a speed past the car's top speed is left out
const GG_DS=0.05;               // m: the step the solvers take, short enough that the speed hardly moves over it
const GG_N=24;                  // lateral steps from straight ahead to the limit
const gg={open:false,env:null,lap:null,key:''};
// The lap's solvers on a single point of level road.
const ggPoint=r=>({r,cosT:1,sinT:0,kv:0,ds:GG_DS,ds3:GG_DS,grade:0});
function ggProbe(){return simulateLapRun(trackKey||'tech',{probe:true,quick:true,line:[ggPoint(1e6)]});}
// The envelope at road speed vk (km/h): the cornering limit (g) and, from straight ahead to it, the braking and the drive
// (g, along the road, drag included) with what sets each. null past what the car can reach.
function ggEnvelope(vk,P){
  P=P||ggProbe();if(!P)return null;
  const v=vk/3.6;
  if(P.ceilAt(ggPoint(1e6))<v)return null;
  // the tightest radius whose cornering ceiling still reaches v, by bisection on its logarithm
  let lo=0,hi=Math.log(1e6);
  for(let k=0;k<60;k++){const mid=(lo+hi)/2;if(P.ceilAt(ggPoint(Math.exp(mid)))>=v)hi=mid;else lo=mid;}
  const ayMax=v*v/Math.exp(hi)/G,pts=[];
  for(let k=0;k<=GG_N;k++){
    const ay=ayMax*Math.sin(k/GG_N*Math.PI/2)*(1-1e-6),Q=ggPoint(ay>1e-9?v*v/(ay*G):1e6);   // denser towards the limit
    const cb=P.brakeFrom(Q,1e9,v,1,0,1),brakes=P.brakesBound(),A=P.accFrom(Q,v);
    pts.push({ay,brake:(cb*cb-v*v)/(2*GG_DS)/G,acc:(A.cap*A.cap-v*v)/(2*GG_DS)/G,kind:A.kind,brakes});
  }
  return {vk,ayMax,pts};
}
function ggCompute(){
  const P=ggProbe();if(!P)return;
  const top=perf&&perf.topSpeed>0?perf.topSpeed:Infinity;   // the cornering ceiling on a straight is the solver's cap, not the car's top speed
  gg.env=GG_SPEEDS.filter(vk=>vk<=top).map(vk=>ggEnvelope(vk,P)).filter(Boolean);
  const key=carLineKey()+'|'+(trackKey||'tech');
  if(gg.key!==key){gg.key=key;const L=simulateLap(trackKey||'tech');gg.lap=L&&L.replay?{lat:L.replay.gLat.slice(),lon:L.replay.gLong.slice(),name:L.track.label}:null;}
}
function openGGWin(){
  const w=document.getElementById('ggWin');if(!w||!vehicle||!powertrain().ready())return;
  w.hidden=false;gg.open=true;ggCompute();renderGGWin();
  document.getElementById('ggClose').focus();
}
function closeGGWin(){
  const w=document.getElementById('ggWin');if(!w||w.hidden)return;
  w.hidden=true;gg.open=false;
  const b=document.getElementById('btnGG');if(b)b.focus();
}
const GG_COL=['#00ccff','#00ff88','#ffcc00'];
const ggLimitLabel=p=>({acc:tr(p.kind==='power'?'power':'traction'),brake:tr(p.brakes?'brakes':'tyres')});
function renderGGWin(){
  if(!gg.open)return;
  const el=id=>document.getElementById(id),V=vehicle;
  el('ggTitle').textContent=tr('G-G DIAGRAM');
  el('ggSub').textContent=tr(V.chLabel)+' · '+Math.round(V.mass)+' kg';
  el('ggClose').setAttribute('aria-label',tr('CLOSE'));
  el('ggT').textContent=tr('ACCELERATION ALONG THE ROAD AGAINST SIDEWAYS (g)');
  el('ggLeg').innerHTML=gg.env.map((e,k)=>'<span><i style="border-color:'+GG_COL[k]+'"></i>'+e.vk+' km/h</span>').join('')+
    (gg.lap?'<span><i class="b" style="background:#556;width:7px"></i>'+esc(tr('the lap'))+': '+esc(tr(gg.lap.name))+'</span>':'');
  // the readout: each speed's three limits and what sets them, then the lap's peaks
  let h='';
  for(const e of gg.env){
    const p0=e.pts[0],l=ggLimitLabel(p0);
    h+='<div class="gg-row"><b>'+e.vk+' km/h</b> '+esc(tr('sideways'))+' <b>'+e.ayMax.toFixed(2)+' g</b> · '+esc(tr('braking'))+' <b>'+p0.brake.toFixed(2)+' g</b> ('+esc(l.brake)+') · '+
      esc(tr('accelerating'))+' <b>'+p0.acc.toFixed(2)+' g</b> ('+esc(l.acc)+')</div>';
  }
  if(gg.lap){const mx=a=>a.reduce((m,x)=>Math.max(m,x),0);
    h+='<div class="gg-row">'+esc(tr('the lap'))+': '+esc(tr('sideways'))+' <b>'+mx(gg.lap.lat.map(Math.abs)).toFixed(2)+' g</b> · '+esc(tr('braking'))+' <b>'+mx(gg.lap.lon.map(x=>-x)).toFixed(2)+' g</b> · '+
      esc(tr('accelerating'))+' <b>'+mx(gg.lap.lon).toFixed(2)+' g</b></div>';}
  el('ggRead').innerHTML=h;
  el('ggNote').textContent=tr('Every point is the lap\'s own physics at that speed on level road: the tightest corner the car can take, and at each share of it the most it can brake and drive. The downforce widens the envelope with speed; the drag and the power shrink its top. The dots are every point of the lap on the TRACK tab\'s circuit: a car driven at its limit runs round the edge, and past it where a dip in the road presses it down.');
  drawGG();
}
function drawGG(){
  const C=gwCanvas('ggCanvas');if(!C||!gg.env)return;const {g,W,H}=C;
  // equal scales both ways, centred on zero, to the largest limit rounded up to the next 0.5 g
  let X=0.5,Y=0.5;
  for(const e of gg.env){X=Math.max(X,e.ayMax);for(const p of e.pts)Y=Math.max(Y,p.brake,p.acc);}
  if(gg.lap){for(const x of gg.lap.lat)X=Math.max(X,Math.abs(x));for(const y of gg.lap.lon)Y=Math.max(Y,Math.abs(y));}
  X=Math.ceil(X*2)/2;Y=Math.ceil(Y*2)/2;
  const s=Math.min((W-50)/(2*X),(H-30)/(2*Y)),cx=W/2+10,cy=H/2,px=x=>cx+x*s,py=y=>cy-y*s;
  gg.layout={X,Y,s,cx,cy};
  g.lineWidth=1;g.strokeStyle='#1e1e2c';g.fillStyle='#667';
  for(let x=-X;x<=X+1e-9;x+=0.5){g.beginPath();g.moveTo(px(x),py(-Y));g.lineTo(px(x),py(Y));g.stroke();g.textAlign='center';g.fillText(x.toFixed(1),px(x),py(-Y)+9);}
  for(let y=-Y;y<=Y+1e-9;y+=0.5){g.beginPath();g.moveTo(px(-X),py(y));g.lineTo(px(X),py(y));g.stroke();g.textAlign='right';g.fillText(y.toFixed(1),px(-X)-4,py(y));}
  g.strokeStyle='#444';g.beginPath();g.moveTo(px(-X),cy);g.lineTo(px(X),cy);g.moveTo(cx,py(-Y));g.lineTo(cx,py(Y));g.stroke();
  g.fillStyle='#667';g.textAlign='left';g.fillText(tr('DRIVE'),cx+4,py(Y)+6);g.fillText(tr('BRAKING'),cx+4,py(-Y)-6);
  g.textAlign='right';g.fillText(tr('SIDEWAYS'),px(X),cy-8);
  // the lap, recessive
  if(gg.lap){g.fillStyle='#556';for(let i=0;i<gg.lap.lat.length;i++)g.fillRect(px(gg.lap.lat[i])-1,py(gg.lap.lon[i])-1,2,2);}
  // each speed's envelope: up one side, over the top, down the other, back along the bottom
  gg.env.forEach((e,k)=>{
    const P=e.pts,ring=[];
    for(let i=P.length-1;i>=0;i--)ring.push([-P[i].ay,P[i].acc]);
    for(let i=0;i<P.length;i++)ring.push([P[i].ay,P[i].acc]);
    for(let i=P.length-1;i>=0;i--)ring.push([P[i].ay,-P[i].brake]);
    for(let i=0;i<P.length;i++)ring.push([-P[i].ay,-P[i].brake]);
    g.strokeStyle=GG_COL[k];g.lineWidth=2;g.lineJoin='round';g.beginPath();
    ring.forEach(([x,y],j)=>j?g.lineTo(px(x),py(y)):g.moveTo(px(x),py(y)));g.closePath();g.stroke();g.lineWidth=1;
    g.fillStyle=GG_COL[k];g.textAlign='left';g.fillText(String(e.vk),px(e.ayMax)+3,cy+8+k*9);
  });
}
function wireGGWin(){
  const b=document.getElementById('btnGG'),w=document.getElementById('ggWin');if(!b||!w)return;
  b.addEventListener('click',openGGWin);
  document.getElementById('ggClose').addEventListener('click',closeGGWin);
  w.addEventListener('click',e=>{if(e.target===w)closeGGWin();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&gg.open)closeGGWin();});
  window.addEventListener('resize',()=>{if(gg.open)drawGG();});
}
