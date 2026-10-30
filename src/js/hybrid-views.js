// ====== HOW THE CONTROLLER THINKS: the lever diagram and the BSFC map (build 191, step 3.6b; decision 17) ======
// Two more views of the LIVE tab's hybrid panel, beside the power flow (src/js/hybrid-bench.js):
//   LEVER      the power-split's nomograph, Toyota's own way of drawing its planetary: three vertical bars for the sun
//              (MG1), the carrier (the engine) and the ring (the wheels' side, MG2's speed over the 65:17 gear), each
//              point at its speed. Willis's equation makes the three points lie on one straight line, with the carrier
//              1/(1+rho) of the way from the sun to the ring; so MG1 pivots the line about the ring to set the engine's
//              speed, and with the engine stopped the line through zero sends MG1 backwards. Arrows give the torques:
//              the engine's up the carrier, MG1's reaction on the sun, MG2's (at ring speed) on the ring.
//   BSFC MAP   the engine's fuel per kWh over speed and torque, off its own map (engineFuelAt: the same air, mixture and
//              friction the dyno runs), with its full-load curve, its best line (for each power, the speed that burns
//              least: psOol), and the point the controller holds it at now with the last few seconds behind it. Load-
//              point shifting is visible: charging pushes the point up towards the best line, the motor's help pulls
//              it down.
// One canvas, set up the way the power-flow diagram sets it up.
function hybCanvas(){
  const cv=document.getElementById('hyFlow');if(!cv)return null;
  const dpr=window.devicePixelRatio||1,W=cv.clientWidth||300,Hh=Math.round(W*0.5);
  if(cv.width!==Math.round(W*dpr)||cv.height!==Math.round(Hh*dpr)){cv.width=Math.round(W*dpr);cv.height=Math.round(Hh*dpr);}
  const c=cv.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,W,Hh);c.fillStyle='#0a0a10';c.fillRect(0,0,W,Hh);
  const S=W/300;
  return {c,W,Hh,S,F:s=>Math.round(s*S)+"px 'Press Start 2P',monospace"};
}
// The operating point's recent past (every few frames while the engine runs), for the map.
function hybTrailPush(H){
  H.trailK=(H.trailK||0)+1;if(H.trailK%4)return;
  if(H.engOn&&state.rpm>engine.idleRpmEff*0.5)H.trail.push({rpm:state.rpm,T:H.Te});else H.trail.push(null);
  if(H.trail.length>60)H.trail.shift();
}
// ---- the lever ----
// The three speeds (rpm) and where each bar stands, sun 0 to ring 1.
function psLever(H){
  const nr=H.n/PS.k2;
  return {ns:H.ns,ne:H.ne,nr,xs:0,xc:1/(1+PS.rho),xr:1};
}
function drawHybridLever(H){
  const K=hybCanvas();if(!K)return;const {c,S,F,Hh}=K,L=psLever(H);
  const x0=46,x1=262,yTop=18,yBot=Hh/S-30,y0=(yTop+yBot)/2;
  // the scale follows the largest speed, eased so the picture does not jump
  const want=Math.max(engine.redline,Math.abs(L.ns),Math.abs(L.ne),Math.abs(L.nr))*1.1;
  H.levScale=H.levScale?H.levScale+(want-H.levScale)*0.08:want;
  const yAt=n=>y0-n/H.levScale*(yBot-yTop)/2,X=f=>x0+(x1-x0)*f;
  c.strokeStyle='#3a3a4a';c.lineWidth=1;c.setLineDash([3*S,3*S]);c.beginPath();c.moveTo(x0*S-8*S,yAt(0)*S);c.lineTo(x1*S+8*S,yAt(0)*S);c.stroke();c.setLineDash([]);
  c.font=F(4.5);c.fillStyle='#666';c.textAlign='right';c.textBaseline='middle';c.fillText('0',(x0-10)*S,yAt(0)*S);
  const bars=[['MG1',L.xs,L.ns,'#b48cff'],[tr('ENGINE'),L.xc,L.ne,'#ff9a3c'],[tr('RING'),L.xr,L.nr,'#4aa3ff']];
  for(const [lab,f,n,col] of bars){
    c.strokeStyle='#5a5a6a';c.lineWidth=3*S;c.beginPath();c.moveTo(X(f)*S,yTop*S);c.lineTo(X(f)*S,yBot*S);c.stroke();
    c.font=F(5);c.fillStyle=col;c.textAlign='center';c.textBaseline='top';c.fillText(lab,X(f)*S,(yBot+4)*S);
    c.fillStyle='#888';c.font=F(4.5);c.fillText(Math.round(n)+' rpm',X(f)*S,(yBot+13)*S);
  }
  // the line through the three speeds (Willis: they lie on it)
  c.strokeStyle='#e0e0e0';c.lineWidth=2*S;c.beginPath();c.moveTo(X(L.xs)*S,yAt(L.ns)*S);c.lineTo(X(L.xr)*S,yAt(L.nr)*S);c.stroke();
  for(const [,f,n,col] of bars){c.fillStyle=col;c.beginPath();c.arc(X(f)*S,yAt(n)*S,4*S,0,Math.PI*2);c.fill();}
  // the torques: the engine's up the carrier, MG1's reaction on the sun, MG2's on the ring (scaled to the engine's peak)
  const Tref=Math.max(20,engine.score.peakTQ),arrow=(f,n,T,col)=>{
    if(Math.abs(T)<0.5)return;const len=clamp(T/Tref,-1,1)*28,x=X(f)*S+7*S,y=yAt(n)*S;
    c.strokeStyle=col;c.fillStyle=col;c.lineWidth=2*S;c.beginPath();c.moveTo(x,y);c.lineTo(x,y-len*S);c.stroke();
    const d=len>0?-1:1;c.beginPath();c.moveTo(x,y-len*S);c.lineTo(x-3*S,y-len*S-d*4*S);c.lineTo(x+3*S,y-len*S-d*4*S);c.fill();
    c.font=F(4.5);c.textAlign='left';c.textBaseline='middle';c.fillText(Math.round(T)+' Nm',x+4*S,y-len*S/2);
  };
  if(H.engOn){arrow(L.xc,L.ne,H.Te,'#ff9a3c');arrow(L.xs,L.ns,-H.T1,'#b48cff');}
  arrow(L.xr,L.nr,H.Tm*PS.k2,'#4aa3ff');
  c.font=F(5);c.fillStyle='#888';c.textAlign='left';c.textBaseline='alphabetic';
  c.fillText(tr('LEVER')+' • ρ '+PS.rho.toFixed(3)+' • '+tr('RING')+' = MG2 ÷ '+PS.k2.toFixed(2)+' • '+tr(HYB_DRIVE[H.mode].label),6*S,(Hh/S-4)*S);
}
// ---- the BSFC map ----
// BSFC (g/kWh) over speed x torque, its full-load curve and its best, at the warm engine's map; cached per build.
function hybBsfcMap(){
  const e=engine,hy=e.hy;
  if(hy._bsfc&&hy._bsfc.score===e.score)return hy._bsfc;
  const NR=40,NT=30,r0=Math.max(800,e.idleRpmEff||700),r1=e.redline,T1=e.score.peakTQ*1.08,g=new Float32Array(NR*NT);
  let best={b:Infinity};
  for(let i=0;i<NR;i++){
    const rpm=r0+(r1-r0)*i/(NR-1),w=rpm*Math.PI/30,Tf=hybEngTq(rpm);
    for(let j=0;j<NT;j++){
      const T=T1*(j+0.5)/NT;let b=NaN;
      if(T<=Tf){const f=engineFuelAt(rpm,T,95);if(isFinite(f)&&T*w>500)b=f/(T*w)*3.6e6;}
      g[i*NT+j]=b;if(b<best.b)best={b,rpm,T};
    }
  }
  hy._bsfc={score:e.score,NR,NT,r0,r1,T1,g,best,img:null};
  return hy._bsfc;
}
// The map's colour for a BSFC: the best deep blue, through green and yellow, to red at 1.6 times it.
function bsfcColour(b,best){
  if(!isFinite(b))return [14,14,22];
  const t=clamp((b/best-1)/0.6,0,1),stops=[[30,60,170],[30,150,160],[60,200,90],[230,210,60],[230,90,50],[150,30,40]];
  const x=t*(stops.length-1),k=Math.min(stops.length-2,Math.floor(x)),f=x-k,a=stops[k],b2=stops[k+1];
  return [0,1,2].map(i=>Math.round(a[i]+(b2[i]-a[i])*f));
}
function drawHybridMap(H){
  const K=hybCanvas();if(!K)return;const {c,S,F,Hh}=K,M=hybBsfcMap(),e=engine;
  const x0=34,x1=290,yTop=10,yBot=Hh/S-24,X=rpm=>x0+(x1-x0)*(rpm-M.r0)/(M.r1-M.r0),Y=T=>yBot-(yBot-yTop)*T/M.T1;
  // the map, painted once per build at its own resolution and stretched
  if(!M.img){
    const off=document.createElement('canvas');off.width=M.NR;off.height=M.NT;const oc=off.getContext('2d'),im=oc.createImageData(M.NR,M.NT);
    for(let i=0;i<M.NR;i++)for(let j=0;j<M.NT;j++){const [r,g,b]=bsfcColour(M.g[i*M.NT+j],M.best.b),k=((M.NT-1-j)*M.NR+i)*4;im.data[k]=r;im.data[k+1]=g;im.data[k+2]=b;im.data[k+3]=255;}
    oc.putImageData(im,0,0);M.img=off;
  }
  c.imageSmoothingEnabled=true;c.drawImage(M.img,x0*S,yTop*S,(x1-x0)*S,(yBot-yTop)*S);
  // the full-load curve
  c.strokeStyle='#e0e0e0';c.lineWidth=1.5*S;c.beginPath();
  for(let k=0;k<=40;k++){const rpm=M.r0+(M.r1-M.r0)*k/40,T=Math.min(M.T1,hybEngTq(rpm));k?c.lineTo(X(rpm)*S,Y(T)*S):c.moveTo(X(rpm)*S,Y(T)*S);}
  c.stroke();
  // the best line: for each power, the speed that burns least
  const O=psOol();c.strokeStyle='#ffcc00';c.setLineDash([4*S,3*S]);c.lineWidth=1.5*S;c.beginPath();let first=true;
  O.P.forEach((P,i)=>{const rpm=O.ne[i],T=P/(rpm*Math.PI/30);if(rpm<M.r0||T>M.T1)return;first?c.moveTo(X(rpm)*S,Y(T)*S):c.lineTo(X(rpm)*S,Y(T)*S);first=false;});
  c.stroke();c.setLineDash([]);
  // the best point, and the axes
  c.fillStyle='#ffffff';c.beginPath();c.arc(X(M.best.rpm)*S,Y(M.best.T)*S,2*S,0,Math.PI*2);c.fill();
  c.font=F(4.5);c.fillStyle='#888';c.textAlign='center';c.textBaseline='top';
  for(let r=Math.ceil(M.r0/1000)*1000;r<=M.r1;r+=1000)c.fillText(r/1000+'k',X(r)*S,(yBot+2)*S);
  c.textAlign='right';c.textBaseline='middle';
  for(let T=0;T<=M.T1;T+=50)c.fillText(T,(x0-3)*S,Y(T)*S);
  // the trail and the point the controller holds the engine at now
  H.trail.forEach((p,i)=>{if(!p||p.T<=0)return;const a=(i+1)/H.trail.length;c.fillStyle='rgba(255,255,255,'+(0.15+0.5*a).toFixed(2)+')';c.fillRect(X(p.rpm)*S-1*S,Y(Math.min(p.T,M.T1))*S-1*S,2*S,2*S);});
  if(H.engOn&&state.rpm>e.idleRpmEff*0.5&&H.Te>0){
    const x=X(clamp(state.rpm,M.r0,M.r1))*S,y=Y(Math.min(H.Te,M.T1))*S;
    c.strokeStyle='#ff9a3c';c.lineWidth=2*S;c.beginPath();c.arc(x,y,4.5*S,0,Math.PI*2);c.stroke();
    c.fillStyle='#ff9a3c';c.font=F(5);c.textAlign=x>(x0+x1)/2*S?'right':'left';c.textBaseline='bottom';
    c.fillText((state.bsfc<900?Math.round(state.bsfc):'---')+' g/kWh',x+(x>(x0+x1)/2*S?-6:6)*S,y-4*S);
  }
  c.font=F(5);c.fillStyle='#888';c.textAlign='left';c.textBaseline='alphabetic';
  c.fillText('BSFC • '+tr('best')+' '+Math.round(M.best.b)+' g/kWh • '+(H.engOn?Math.round(state.rpm)+' rpm '+Math.round(H.Te)+' Nm':tr('ENGINE OFF')),6*S,(Hh/S-4)*S);
}
