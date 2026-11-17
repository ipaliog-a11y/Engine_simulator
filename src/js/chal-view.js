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
  if(pace){const row=pace.closest('.field');if(row)row.style.display=ch.kind==='economy'?'':'none';}
  const msel=document.getElementById('chalMooseSpeed');
  if(msel){const row=msel.closest('.field');if(row)row.style.display=ch.kind==='moose'?'':'none';}
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
  if(!R.ev&&R.rpmDrive)cells+=cell('AVG RPM ON POWER',String(Math.round(R.rpmDrive)))+cell('TOP GEAR',String(R.topGear));
  cells+=cell('PEAK ACCEL',R.aUp.toFixed(1)+' m/s²')+cell('PEAK DECEL',R.aDn.toFixed(1)+' m/s²')+
    cell('ECO BLEND',(R.ecoBlend*100).toFixed(0)+' %');
  cells+=cell('TARGET',R.target.toFixed(1)+' s')+
    cell('MIN TIME',R.tMin.toFixed(1)+' s')+
    cell('PACE',(R.pace*100).toFixed(0)+' %')+
    cell('DISTANCE',R.lengthKm.toFixed(1)+' km');
  grid.innerHTML=cells;
  note.textContent=tr(R.road.blurb)+' '+tr('Target time is')+' '+(R.factor*100).toFixed(0)+'% '+tr('of this car\'s min-time (eco-rally).')+' '+
    tr(R.ev?'Eco driver: accelerates at the motor\'s most efficient torque and slows on regen where it can.':'Eco driver: accelerates at the engine\'s best-BSFC point, shifts up early, and slows on engine braking in fuel cut.')+' '+
    tr('ECO BLEND is how far it had to move toward the car\'s full grip and power to make the time (0% pure eco). Not yet an optimal plan.');
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
const MOOSE_OUT_COL={CLEAR:'#55dd66',CONE:'#ffcc00',SPIN:'#ff8833',ROLLOVER:'#ff4444'};
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
  if(R.coneX!=null){const X=MX(R.coneX),Y=MY(R.coneY);g.strokeStyle='#ff4444';g.lineWidth=2;   // where a cone was first touched
    g.beginPath();g.moveTo(X-5,Y-5);g.lineTo(X+5,Y+5);g.moveTo(X+5,Y-5);g.lineTo(X-5,Y+5);g.stroke();}
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
  const now=((typeof performance!=='undefined'?performance.now():Date.now())-chalMooseT0)/1000;
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
  g.fillText(tr('Front axle, seen from behind. Forces to one scale; true roll and camber.'),x0+10,y0+h-20);
  const leg=[[COL.w,'W'],[COL.in,'m·ay(front)'],[COL.fz,'Fz'],[COL.fy,'Fy'],[COL.spring,tr('spring')]];
  let lx=x0+10;for(const [col,t] of leg){g.fillStyle=col;g.fillRect(lx,y0+h-14,8,6);g.fillStyle=COL.dim;g.fillText(t,lx+11,y0+h-8);lx+=g.measureText(t).width+24;}
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
  canvas.addEventListener('pointermove',e=>{
    if(vizMode!=='challenges'||!chalResult||!chalResult.road)return;
    const p=toViz(e),i=chalHoverAt(p.x,p.y);
    if(i!==chalHover.i)chalHover.i=i;
  });
  canvas.addEventListener('pointerleave',()=>{if(chalHover.i>=0)chalHover.i=-1;});
}
