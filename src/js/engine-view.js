// ---- Engine test-bench schematic (replaces the old blur animation) ----
// Live values annotate each subsystem around a central engine. Laid out in a base
// 640×420 space and uniformly scaled to the canvas.
// ====== ENGINE VIEW: an animated cutaway ======
// This used to be six boxes of 7 px text painted onto a canvas that was then stretched by CSS —
// unreadable, and a canvas is the wrong place for a table anyway. The numbers already live in the
// LIVE OUTPUT panel beside it, so the canvas now does what only a canvas can: it SHOWS the engine
// running. Piston, rod and crank move on real crank-slider geometry at the real crank angle,
// valves open on the real four-stroke cycle, the charge glows when it burns and the turbo spins
// with actual boost. Everything on screen is driven by simulation state, not decoration.
//
// Crank angle is integrated from live rpm, not from wall-clock time, so what you see is the engine
// you built: a long-stroke diesel lopes, a 9000 rpm screamer blurs.
let crankAngle=0;          // radians, 0..4π for a four-stroke cycle (720°)
let rotorAngle=0;          // rotary output shaft
let flashT=0;              // combustion flash decay, seconds
let turboAngle=0;
// Seconds-per-cycle is the reciprocal of these: 0.30 -> a 3.3 s cycle at idle, 0.90 -> 1.1 s at
// the limiter. Slow enough to follow a valve opening, quick enough that the limiter feels urgent.
const ANIM_SLOW=0.30, ANIM_FAST=0.90;
// Phase within the cycle. cyl 0 is the one drawn large; the rest are offset by the firing interval.
// FIRING ORDER. Cylinders do not fire in the order they are numbered, and the live bank used to
// pretend they did: cylinder i was given phase i*cycle/n, so every engine ran 1-2-3-...-n (and
// backwards, because of the sign), and the caption read "FIRING ORDER 1-4". A real inline four
// fires 1-3-4-2 — which is also what puts pistons 1 and 4 at the top together and 2 and 3 at the
// bottom, so the right firing order is what makes the drawing's crank geometry right as well.
// V and boxer engines are numbered bank by bank (bank A 1..k on the top row, bank B after it), the
// BMW / Audi / Ferrari / Porsche convention, which is also how the bank is drawn; the published
// orders below are in that numbering. Counts with no production layout fall back to firing in
// sequence, which is still evenly spaced and so still a buildable crank.
const FIRING_ORDER={
  inline:{1:[1],2:[1,2],3:[1,2,3],4:[1,3,4,2],5:[1,2,4,5,3],6:[1,5,3,6,2,4],8:[1,6,2,5,8,3,7,4]},
  v:     {2:[1,2],4:[1,3,2,4],6:[1,4,3,6,2,5],8:[1,5,4,8,6,3,7,2],10:[1,6,5,10,2,7,3,8,4,9],
          12:[1,7,5,11,3,9,6,12,2,8,4,10]},
  boxer: {2:[1,2],4:[1,4,3,2],6:[1,6,2,4,3,5]}
};
function firingOrder(layout,n){
  const t=(FIRING_ORDER[layout]||FIRING_ORDER.inline)[n];
  return t||Array.from({length:n},(_,i)=>i+1);
}
// Phase of cylinder i (0-based, by number). Cylinder 1 is the big cutaway and sets the clock; the
// cylinder that fires k-th in the order reaches the same point k*cycle/n LATER, so it lags.
function cylPhase(i,n,cycle,order){
  const k=order?Math.max(0,order.indexOf(i+1)):i;
  return ((crankAngle-k*cycle/n)%cycle+cycle)%cycle;
}
// Crank-slider: piston position from crank angle, as a fraction of stroke below TDC.
// x = r(1−cos θ) + L − √(L² − r²sin²θ), normalised by the 2r stroke. rodRatio L/r ≈ 3.2 is typical.
function pistonFrac(theta,rodRatio){
  const s=Math.sin(theta),c=Math.cos(theta);
  const L=rodRatio;
  return ((1-c)+L-Math.sqrt(Math.max(0,L*L-s*s)))/2;
}
// Valve lift 0..1 across an opening window, with a smooth cam-like ramp.
function valveLift(deg,open,close){
  let d=deg-open; if(d<0)d+=720; let span=close-open; if(span<0)span+=720;
  if(d>span)return 0;
  return Math.sin(Math.PI*d/span);
}
function drawEngine(dt){
  if(isElectric())return drawMotorView(dt);
  const W=vizW,H=vizH;
  const S=Math.min(W/640,H/420),offX=(W-640*S)/2,offY=(H-420*S)/2;
  const px=x=>offX+x*S,py=y=>offY+y*S,F=n=>Math.round(n*S)+'px "Press Start 2P"';
  const LW=n=>Math.max(1,n*S);
  ctx.fillStyle=C.bg;ctx.fillRect(0,0,W,H);

  const e=engine,m=liveMap(),rpm=state.rpm;
  const rotary=e.type==='rotary',two=e.type==='twostroke';
  const cycle=(two||rotary)?Math.PI*2:Math.PI*4;          // radians per full cycle
  // ---- Animation speed is deliberately NOT real time ----
  // A crank at 5000 rpm turns 83 times a SECOND. Drawn literally at 60 fps that is a strobe, not
  // a picture — you cannot see a piston move, let alone a valve open. This is a diagram of what
  // the engine is doing, so it runs at a pace you can actually read: one full four-stroke cycle
  // takes between ANIM_SLOW and ANIM_FAST seconds. It still RANKS with rpm, so idle is visibly
  // lazier than the limiter, but it never blurs. The true speed is on the tachometer above it
  // and in the engine note — the animation's job is to make the CYCLE legible.
  const cyclesPerSec=(r)=>{
    const f=clamp((r-e.idleRpmEff)/Math.max(1,e.redline-e.idleRpmEff),0,1);
    return ANIM_SLOW+(ANIM_FAST-ANIM_SLOW)*f;              // full cycles per second on screen
  };
  const rate=state.blown?0:cyclesPerSec(rpm)*cycle;        // radians of crank per second
  crankAngle=(crankAngle+rate*dt)%cycle;
  rotorAngle=(rotorAngle+rate*dt/3)%(Math.PI*2);           // rotor turns at 1/3 shaft speed
  // The turbo is geared to the same clock, so it visibly picks up with boost without spinning
  // into a blur of its own.
  // The turbo turns with the shaft speed the spool model integrates (build 164; it followed the manifold
  // pressure), at a readable pace: a quarter turn a second stopped to under three at the shaft's limit.
  const nShaft=e.shaftJ?Math.sqrt(2*Math.max(0,state.shaftE||0)/e.shaftJ)*60/(2*Math.PI):0;
  turboAngle=(turboAngle+(state.blown?0:(0.25+2.6*clamp(nShaft/Math.max(1,e.shaftMax),0,1))*Math.PI*2)*dt)%(Math.PI*2);
  // A Roots or screw blower is geared to the crank on screen as on the engine; a centrifugal's 12:1 would blur.
  const scD=(SC_SOUND[e.scType]||SC_SOUND.roots).drive;
  scAngle=(scAngle+(state.blown?0:(e.scType==='centrifugal'?(0.25+2.6*clamp(rpm/e.redline,0,1))*Math.PI*2:rate*scD))*dt)%(Math.PI*2*12);
  vizFlow+=dt*(state.blown?0:0.4+2.2*clamp(rpm/e.redline,0,1)*clamp(m,0.2,3)/Math.max(1,1+(e.boost_bar||0)));
  if(vizBovT>0)vizBovT-=dt;
  vizDens=vizFlowFrac(m);
  if(flashT>0)flashT-=dt;

  const deg=crankAngle*180/Math.PI;                        // 0..720 for a four-stroke
  const nCyl=Math.max(1,e.cylinders);
  const rodRatio=3.2;
  // Bore and stroke drive the drawing, so an oversquare engine really is wider and shorter.
  const bsr=clamp(e.bore_mm/e.stroke_mm,0.55,1.9);

  // ---------- title + tachometer ----------
  ctx.fillStyle=C.yellow;ctx.font=F(9);
  ctx.fillText(tr('ENGINE CUTAWAY'),px(14),py(15));
  ctx.fillStyle=state.rpm>e.redline*0.92?C.red:C.green;ctx.font=F(11);
  ctx.textAlign='right';ctx.fillText(Math.round(rpm)+' RPM',px(560),py(16));ctx.textAlign='left';
  const tbX=14,tbY=26,tbW=546,tbH=6,rl=e.redline;
  ctx.fillStyle='#1a1a28';ctx.fillRect(px(tbX),py(tbY),tbW*S,tbH*S);
  ctx.fillStyle='#3a1414';ctx.fillRect(px(tbX+tbW*0.92),py(tbY),tbW*0.08*S,tbH*S);
  const rf=clamp(rpm/rl,0,1);
  ctx.fillStyle=rf>0.92?C.red:C.green;ctx.fillRect(px(tbX),py(tbY),tbW*rf*S,tbH*S);

  if(rotary)drawRotaryCutaway(px,py,S,F,LW,dt,m);
  else drawPistonCutaway(px,py,S,F,LW,deg,nCyl,rodRatio,bsr,two,m);

  // ---------- status strip ----------
  ctx.fillStyle='#12121c';ctx.fillRect(px(0),py(398),640*S,24*S);
  const alarm=state.blown||state.wearCause||state.knockRisk>70;
  ctx.fillStyle=alarm?C.red:(state.knockRisk>40||state.engineHealth<0.7?C.yellow:C.green);ctx.font=F(8);
  let msg;
  if(state.blown)msg=tr('ENGINE FAILURE')+' — '+state.wearCause+' • '+tr('REBUILD WITH BUILD & DYNO');
  else if(state.wearCause)msg=tr('DAMAGE')+': '+state.wearCause+' — '+tr('HEALTH')+' '+Math.round(state.engineHealth*100)+'%';
  else if(state.nitrousActive&&nitrousImep()>0)msg='NITROUS! • '+state.powerHP.toFixed(0)+' HP • '+tr('BOTTLE')+' '+Math.round(state.nitrousCharge*100)+'%';
  else msg=(state.powerHP>5?tr('RUNNING'):tr('IDLE'))+' • '+(Math.round(state.powerHP)||0)+' HP • '+(Math.round(state.torque)||0)+' Nm • '
    +tr('COOL')+' '+Math.round(state.coolant)+'C • '+tr('HEALTH')+' '+Math.round(state.engineHealth*100)+'%';
  if(state.nitrousActive&&nitrousImep()>0)ctx.fillStyle='#ff66cc';
  ctx.fillText(msg,px(10),py(414));
}

// ---- Four-stroke / two-stroke: one cylinder drawn large, the whole bank drawn small ----
// ---- the instruments round a cutaway, shared by the piston and the rotary views ----
// These were written inside drawPistonCutaway, so the Wankel view had none of them: no turbo, no
// exhaust, no EGT, no ignition advance, no output. Shared now, so both engine types show the same
// information in the same place.
// ---- the air and gas paths, and the turbo or supercharger in them (build 164) ----
// The boosters were a circle with six spokes hung off the intake pipe: a turbo had no turbine and no
// exhaust reaching it, and a supercharger looked the same in yellow. They are drawn now as they are
// built and turned by the model: a turbo is two snail housings on one shaft, the turbine fed by the
// exhaust manifold and the compressor pushing the charge round through the intercooler to the throttle,
// spinning with the shaft speed the spool model integrates; a supercharger is belted to the crank.
let scAngle=0,vizFlow=0,vizChargeP=0,vizBovT=0;
const VIZ_TX=352,VIZ_TTY=160,VIZ_CTY=234,VIZ_CHG_Y=340,VIZ_IC_X=31,VIZ_SC_X=44;
function vizPipe(px,py,LW,pts,w,col){
  ctx.strokeStyle=col;ctx.lineWidth=LW(w);ctx.lineJoin='round';
  ctx.beginPath();ctx.moveTo(px(pts[0][0]),py(pts[0][1]));
  for(let i=1;i<pts.length;i++)ctx.lineTo(px(pts[i][0]),py(pts[i][1]));
  ctx.stroke();
}
// the gas moving: dashes travelling down the pipe at a pace that ranks with the mass flow
// (build 166) as dense as the mass flow: packed at full load at the limiter, sparse at idle
let vizDens=0.5;
function vizFlowDash(px,py,S,LW,pts,col){
  const gap=2+16*(1-clamp(vizDens,0,1)),per=3+gap;
  ctx.save();ctx.setLineDash([3*S,gap*S]);ctx.lineDashOffset=-((vizFlow*10)%per)*S;
  vizPipe(px,py,LW,pts,1.5,col);ctx.restore();
}
// ---- the tracts, to scale (build 166) ----
// The intake runner and the exhaust primaries are drawn at one scale, TRACT_MM millimetres to a drawing unit,
// so a torque manifold's long runner and a race header's long primaries look as long as they are against a
// short-runner, short-manifold build. (The cylinder itself is drawn to its own scale.)
const TRACT_MM=4.5;
function runnerLAt(rpm){                       // the runner length in use: a variable manifold's flap, as the fill table chose it
  const tb=engine.fillTable;if(!tb||tb[0].L==null)return engine.runnerL;
  let b=tb[0];for(const r of tb)if(Math.abs(r.rpm-rpm)<Math.abs(b.rpm-rpm))b=r;return b.L;
}
// the mass flow now as a share of the most the engine swallows (at the limiter, at full boost)
function vizFlowFrac(m){
  const e=engine,top=airFlowAt(e.redline,1+(e.intake==='na'?0:(e.boost_bar||0)));
  return clamp(airFlowAt(state.rpm,Math.max(0.05,m))*(state.throttle>0.02?1:0.3)/Math.max(1e-9,top),0,1);
}
// Where the header's tuned return reaches the port, in the drawing's crank degrees: primK round trips of the
// primary at the speed of sound in gas at T (K), after the exhaust valve opens. The header is cut (deriveGas)
// for this to land theta = dur/2 + 90 after EVO at its target speed and design temperature.
function headerReturnAt(rpm,T){
  const e=engine,ev=valveEvents(rpm);
  return wrap720(ev.evo+2*Math.max(1,e.primK||1)*e.primL*6*rpm/sonic(T));
}
function vizBox(px,py,S,LW,x,y,w,h,fill,edge){ctx.fillStyle=fill;ctx.fillRect(px(x),py(y),w*S,h*S);ctx.strokeStyle=edge;ctx.lineWidth=LW(1.1);ctx.strokeRect(px(x),py(y),w*S,h*S);}
// boost against its target, as a bar
function drawBoostBar(px,py,S,F,LW,x,y,w,boost,target){
  const top=Math.max(0.3,target*1.25),f=b=>clamp(b/top,0,1);
  ctx.fillStyle='#1a1a28';ctx.fillRect(px(x),py(y),w*S,6*S);
  ctx.fillStyle=boost>=target-0.01&&target>0.02?C.yellow:'#c9a640';ctx.fillRect(px(x),py(y),w*f(boost)*S,6*S);
  ctx.fillStyle='#fff';ctx.fillRect(px(x+w*f(target)-0.5),py(y-2),1.2*S,10*S);
}
// The compressor map: pressure ratio against flow as a share of the inducer's choke flow, with the efficiency
// islands the model's compressor has (compIslandEff), its choke line, the engine's full-throttle operating line
// (the steady boost at each rpm) and where the compressor is working now, with its recent track. The model has
// no surge line, so none is drawn.
let vizMapTrail=[];
function drawCompMap(px,py,S,F,LW,x,y,w,h,m){
  const e=engine;if(!(e.chokeFlow_kgs>0))return;
  const prMax=Math.max(2.4,1+(e.boost_bar||0)*1.5),fMax=1.25;
  const X=f=>x+clamp(f,0,fMax)/fMax*w,Y=pr=>y+h-clamp((pr-1)/(prMax-1),0,1)*h;
  const key=e.score+'|'+S+'|'+prMax;
  if(drawCompMap.key!==key){
    // the islands, once per engine: bands of efficiency
    const cv=document.createElement('canvas');cv.width=Math.ceil(w*S);cv.height=Math.ceil(h*S);
    const g=cv.getContext('2d'),step=Math.max(1,Math.round(S));
    for(let i=0;i<cv.width;i+=step)for(let j=0;j<cv.height;j+=step){
      const f=i/cv.width*fMax,pr=1+(1-j/cv.height)*(prMax-1),eta=compIslandEff(f,pr);
      g.fillStyle=f>1?'#1a0e12':eta>=0.76?'#2f6a3a':eta>=0.72?'#2a5232':eta>=0.66?'#223c2a':eta>=0.58?'#1a2a22':'#13181c';
      g.fillRect(i,j,step,step);}
    const line=[];
    for(let r=Math.max(1000,e.idleRpmEff);r<=e.redline;r+=250){const pr=1+Math.min(boostTarget(r),steadyBoost(r));line.push([compFlowFrac(r,airFlowAt(r,pr)),pr]);}
    Object.assign(drawCompMap,{key,cv,line});vizMapTrail=[];
  }
  ctx.drawImage(drawCompMap.cv,px(x),py(y),w*S,h*S);
  ctx.strokeStyle=C.metal;ctx.lineWidth=LW(1);ctx.strokeRect(px(x),py(y),w*S,h*S);
  ctx.save();ctx.setLineDash([2*S,2*S]);ctx.strokeStyle=C.red;ctx.beginPath();ctx.moveTo(px(X(1)),py(y));ctx.lineTo(px(X(1)),py(y+h));ctx.stroke();ctx.restore();
  ctx.strokeStyle='rgba(255,204,0,0.55)';ctx.lineWidth=LW(1.2);ctx.beginPath();
  drawCompMap.line.forEach(([f,pr],i)=>{if(i)ctx.lineTo(px(X(f)),py(Y(pr)));else ctx.moveTo(px(X(f)),py(Y(pr)));});ctx.stroke();
  const f0=compFlowFrac(state.rpm,airFlowAt(state.rpm,Math.max(0.1,m))),pr0=1+Math.max(0,state.boostActual||0);
  vizMapTrail.push([f0,pr0]);if(vizMapTrail.length>45)vizMapTrail.shift();
  vizMapTrail.forEach(([f,pr],i)=>{ctx.fillStyle=`rgba(0,204,255,${(i/vizMapTrail.length)*0.6})`;ctx.fillRect(px(X(f)-0.8),py(Y(pr)-0.8),1.6*S,1.6*S);});
  ctx.fillStyle=C.cyan;ctx.beginPath();ctx.arc(px(X(f0)),py(Y(pr0)),2.4*S,0,6.284);ctx.fill();
  ctx.fillStyle='#89b';ctx.font=F(4);
  ctx.fillText(tr('COMPRESSOR MAP'),px(x),py(y-3));ctx.font=F(4.5);
  ctx.fillText('PR '+prMax.toFixed(1),px(x+2),py(y+6));ctx.textAlign='right';ctx.fillStyle=C.red;ctx.fillText(tr('CHOKE'),px(X(1)-1),py(y+h-2));ctx.textAlign='left';
}
// A volute seen end-on. The passage round the wheel grows from nothing at the tongue to its full width g
// after one turn, then runs out along the tangent. A compressor's wheel flings the air round and the
// passage widens as it collects it (dir +1: it grows clockwise on screen, the way the wheels turn); a
// turbine's gas comes in through the duct and is fed onto the wheel all the way round as the passage
// narrows, so its passage grows the other way (dir -1). Returns the end of the duct, where the pipe joins.
function vizScroll(px,py,S,LW,cx,cy,rw,g,dir,tongue,duct,gas,wall){
  const P=(r,a)=>[cx+r*Math.cos(a),cy+r*Math.sin(a)];
  const tx=-Math.sin(tongue)*dir,ty=Math.cos(tongue)*dir;
  const i0=P(rw,tongue),o0=P(rw+g,tongue);
  ctx.beginPath();
  for(let i=0;i<=60;i++){const u=i/60,q=P(rw+g*u,tongue+dir*u*2*Math.PI);
    if(i)ctx.lineTo(px(q[0]),py(q[1]));else ctx.moveTo(px(q[0]),py(q[1]));}
  ctx.lineTo(px(o0[0]+tx*duct),py(o0[1]+ty*duct));
  ctx.lineTo(px(i0[0]+tx*duct),py(i0[1]+ty*duct));
  ctx.closePath();
  ctx.fillStyle=gas;ctx.fill();
  ctx.strokeStyle=wall;ctx.lineWidth=LW(2.2);ctx.lineJoin='round';ctx.stroke();
  ctx.fillStyle='#0a0a12';ctx.beginPath();ctx.arc(px(cx),py(cy),(rw-0.8)*S,0,6.284);ctx.fill();
  return [(i0[0]+o0[0])/2+tx*duct,(i0[1]+o0[1])/2+ty*duct];
}
// compressor wheel: COMP_BLADES full blades and as many splitters, swept back against the rotation
function vizCompWheel(px,py,S,LW,cx,cy,r,ang,col){
  ctx.strokeStyle=col;ctx.lineCap='round';
  const n=COMP_BLADES*2;
  for(let i=0;i<n;i++){const a=ang+i*2*Math.PI/n,full=i%2===0,r0=r*(full?0.3:0.56);
    ctx.lineWidth=LW(full?1.6:1.1);ctx.beginPath();
    ctx.moveTo(px(cx+r0*Math.cos(a)),py(cy+r0*Math.sin(a)));
    ctx.quadraticCurveTo(px(cx+r*0.72*Math.cos(a-0.2)),py(cy+r*0.72*Math.sin(a-0.2)),px(cx+r*Math.cos(a-0.6)),py(cy+r*Math.sin(a-0.6)));
    ctx.stroke();}
  ctx.lineCap='butt';
  ctx.fillStyle=C.metalLight;ctx.beginPath();ctx.arc(px(cx),py(cy),r*0.27*S,0,6.284);ctx.fill();
  ctx.fillStyle='#0a0a12';ctx.beginPath();ctx.arc(px(cx),py(cy),r*0.1*S,0,6.284);ctx.fill();
}
// turbine wheel: straight radial blades (they carry the hot gas's load in bending, not in camber), and
// the exducer the gas leaves through, towards you
function vizTurbWheel(px,py,S,LW,cx,cy,r,ang,col){
  ctx.strokeStyle=col;ctx.lineWidth=LW(1.4);
  for(let i=0;i<11;i++){const a=ang+i*2*Math.PI/11;ctx.beginPath();
    ctx.moveTo(px(cx+r*0.3*Math.cos(a)),py(cy+r*0.3*Math.sin(a)));ctx.lineTo(px(cx+r*Math.cos(a)),py(cy+r*Math.sin(a)));ctx.stroke();}
  ctx.strokeStyle='#7a4030';ctx.lineWidth=LW(1);ctx.beginPath();ctx.arc(px(cx),py(cy),r*0.64*S,0,6.284);ctx.stroke();
  ctx.fillStyle=C.metalLight;ctx.beginPath();ctx.arc(px(cx),py(cy),r*0.24*S,0,6.284);ctx.fill();
}
// lobed rotor seen end-on: n lobes, depth d of the radius
function vizRotor(px,py,S,cx,cy,r,n,d,ang,col){
  ctx.fillStyle=col;ctx.beginPath();
  for(let i=0;i<=72;i++){const a=i/72*2*Math.PI,rr=r*(1-d+d*Math.pow(Math.abs(Math.cos(n*(a-ang)/2)),0.6));
    const x=px(cx+rr*Math.cos(a)),y=py(cy+rr*Math.sin(a));if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);}
  ctx.fill();
  ctx.fillStyle='#0a0a12';ctx.beginPath();ctx.arc(px(cx),py(cy),r*0.16*S,0,6.284);ctx.fill();
}
function vizCore(px,py,S,LW,x,y,w,h,hot){
  ctx.fillStyle='#152030';ctx.fillRect(px(x),py(y),w*S,h*S);
  ctx.strokeStyle=hot;ctx.lineWidth=LW(0.8);
  for(let k=y+3;k<y+h-1;k+=3){ctx.beginPath();ctx.moveTo(px(x+1),py(k));ctx.lineTo(px(x+w-1),py(k));ctx.stroke();}
  ctx.strokeStyle=C.metal;ctx.lineWidth=LW(1.2);ctx.strokeRect(px(x),py(y),w*S,h*S);
}
// The compressor's outlet temperature, before the intercooler gives most of the rise back (effIAT), and what
// the charge pipe is coloured by: the isentropic rise over the compressor's efficiency at this flow.
function compOutletT(map,rpm){
  const PR=Math.max(1,map),t=state.iat;
  const eta=(rpm>0&&engine.intake==='turbo'&&engine.chokeFlow_kgs>0)
    ?compIslandEff(compFlowFrac(rpm,airFlowAt(rpm,PR)),PR):engine.compEff;
  return t+(t+273.15)*(Math.pow(PR,0.283)-1)/clamp(eta||0.72,0.30,0.85);
}
function vizTempCol(T){const f=clamp((T-20)/160,0,1);return `rgb(${Math.round(68+170*f)},${Math.round(170-70*f)},${Math.round(255-200*f)})`;}

function drawIntakeSide(px,py,S,F,LW,m,portYc,itX,crank){
  const e=engine,turbo=e.intake==='turbo',sc=e.intake==='supercharger',na=e.intake==='na';
  // the throttle body is fed by open air, the supercharger's outlet, or the turbo's charge pipe
  // (which is drawn with the turbo, on the exhaust side)
  const x0=turbo?VIZ_IC_X:sc?VIZ_SC_X:52;
  const chargeCol=na?C.intake:vizTempCol(effIAT(m,state.rpm));
  const sys=e.intakeSys||'efi',indiv=na&&(sys==='itb'||sys==='sidedraft'||sys==='mech'),carb=na&&/^carb/.test(sys);
  // the runner outside the head, to scale (the rest of it is the port, drawn in the head)
  const Lmm=Math.max(30,(e.intakePart?e.intakePart.runnerL_mm:e.runnerVariable?RUNNER.long.mm:e.runnerL*1000-0.95*e.bore_mm));
  const rPx=clamp(Lmm/TRACT_MM,10,itX-x0-44),rX=itX-rPx;
  const thr=state.throttle;
  const butterfly=(bx,r)=>{ctx.strokeStyle='#cfe';ctx.lineWidth=LW(2.4);ctx.beginPath();
    ctx.moveTo(px(bx-r*Math.cos(thr*1.4)),py(portYc-r*Math.sin(thr*1.4)));ctx.lineTo(px(bx+r*Math.cos(thr*1.4)),py(portYc+r*Math.sin(thr*1.4)));ctx.stroke();};
  vizPipe(px,py,LW,[[rX,portYc],[itX,portYc]],7,chargeCol);
  if(indiv){
    // individual throttles: a trumpet on each runner breathing straight from the air (or through a sock),
    // its own butterfly (or carburettor) part way down
    ctx.fillStyle='#2a3a4a';ctx.beginPath();ctx.moveTo(px(rX),py(portYc-4));ctx.lineTo(px(rX-9),py(portYc-10));ctx.lineTo(px(rX-9),py(portYc+10));ctx.lineTo(px(rX),py(portYc+4));ctx.closePath();ctx.fill();
    if(e.airFilter!=='none'){ctx.strokeStyle='#8a8a7a';ctx.lineWidth=LW(1);ctx.strokeRect(px(rX-17),py(portYc-12),12*S,24*S);
      for(let k=0;k<5;k++){ctx.beginPath();ctx.moveTo(px(rX-16+k*2.4),py(portYc-12));ctx.lineTo(px(rX-16+k*2.4),py(portYc+12));ctx.stroke();}}
    const bx=rX+rPx*0.35;
    if(sys==='sidedraft')vizBox(px,py,S,LW,bx-6,portYc-9,12,18,'#3a3a2a','#aa9');
    butterfly(bx,5);
    vizFlowDash(px,py,S,LW,[[rX-9,portYc],[itX,portYc]],'#dff');
  }else{
    // a plenum the runners hang off, fed by one throttle body (or a carburettor on top)
    const plX=rX-20;
    vizBox(px,py,S,LW,plX,portYc-11,20,22,'#18283a','#6a7a8a');
    if(carb){
      vizBox(px,py,S,LW,plX+4,portYc-23,12,12,'#3a3a2a','#aa9');                 // the carburettor
      ctx.fillStyle='#4a4a3a';ctx.beginPath();ctx.ellipse(px(plX+10),py(portYc-27),11*S,4*S,0,0,6.284);ctx.fill();   // its air cleaner
      ctx.strokeStyle='#cfe';ctx.lineWidth=LW(2);ctx.beginPath();
      ctx.moveTo(px(plX+10-4*Math.cos(thr*1.4)),py(portYc-17+4*Math.sin(thr*1.4)));ctx.lineTo(px(plX+10+4*Math.cos(thr*1.4)),py(portYc-17-4*Math.sin(thr*1.4)));ctx.stroke();
    }else{
      vizPipe(px,py,LW,[[x0,portYc],[plX,portYc]],8,chargeCol);
      vizFlowDash(px,py,S,LW,[[x0,portYc],[plX,portYc]],'#dff');
      butterfly(plX-8,7);
      if(na){                                                      // the air filter, or an open bellmouth
        if(e.airFilter==='none'){ctx.fillStyle='#2a3a4a';ctx.beginPath();ctx.moveTo(px(x0),py(portYc-4));ctx.lineTo(px(x0-8),py(portYc-10));ctx.lineTo(px(x0-8),py(portYc+10));ctx.lineTo(px(x0),py(portYc+4));ctx.closePath();ctx.fill();}
        else{const dense=e.airFilter==='restrictive'?1.6:e.airFilter==='stock'?2.2:3;
          vizBox(px,py,S,LW,x0-26,portYc-10,26,20,'#2a2a22','#8a8a7a');
          ctx.strokeStyle='#6a6a5a';ctx.lineWidth=LW(0.8);for(let k=x0-24;k<x0-1;k+=dense){ctx.beginPath();ctx.moveTo(px(k),py(portYc-9));ctx.lineTo(px(k+dense/2),py(portYc+9));ctx.stroke();}}
      }
    }
    vizFlowDash(px,py,S,LW,[[rX,portYc],[itX,portYc]],'#dff');
  }
  // a variable manifold: a second plenum part way along the runner, opened to it by a flap above the crossover
  let rLnow=e.runnerL;
  if(e.runnerVariable){
    rLnow=runnerLAt(state.rpm);const shortOn=rLnow<(e.runnerL+e.runnerLShort)/2;
    const sx=itX-clamp((e.intakePart?e.intakePart.shortL_mm:RUNNER.short.mm)/TRACT_MM,8,rPx-4);
    vizBox(px,py,S,LW,sx-8,portYc+5,16,9,'#18283a','#6a7a8a');
    ctx.strokeStyle=shortOn?C.yellow:'#aab';ctx.lineWidth=LW(1.6);ctx.beginPath();
    if(shortOn){ctx.moveTo(px(sx-5),py(portYc+5));ctx.lineTo(px(sx-1),py(portYc+11));}else{ctx.moveTo(px(sx-6),py(portYc+4.5));ctx.lineTo(px(sx+6),py(portYc+4.5));}
    ctx.stroke();
  }
  drawIntakeSide.dbg={rPx,rX,itX,rLnow,indiv,carb};   // read by test90
  ctx.fillStyle=C.intake;ctx.font=F(6.5);
  ctx.fillText(tr('THROTTLE')+' '+Math.round(thr*100)+'%',px(52),py(carb?portYc-34:portYc-14));
  ctx.fillStyle='#89b';ctx.font=F(6);
  ctx.fillText('MAP '+m.toFixed(2)+' bar',px(52),py(portYc+20));
  ctx.fillText('IAT '+Math.round(effIAT(m,state.rpm))+'C',px(52),py(portYc+30));
  ctx.fillText(tr('RUNNER')+' '+Math.round(rLnow*1000)+' mm'+(indiv?' ITB':''),px(52),py(portYc+40));
  if(sc)drawSupercharger(px,py,S,F,LW,m,portYc,crank);
}
// A supercharger is driven off the crank by a belt: a Roots or a twin-screw on a ~2:1 pulley turns with
// the crank on screen as it does on the engine (the same drive ratios the engine sound uses, SC_SOUND); a
// centrifugal's ~12:1 step-up would be a blur, so it turns at a readable pace and says its speed.
function drawSupercharger(px,py,S,F,LW,m,portYc,crank){
  const e=engine,t=e.scType||'roots',snd=SC_SOUND[t]||SC_SOUND.roots;
  const bx=VIZ_SC_X,by=222,boost=Math.max(0,m-1);
  const hotT=compOutletT(Math.max(1,m),state.rpm),hot=vizTempCol(hotT);
  vizPipe(px,py,LW,[[bx,276],[bx,by]],8,C.intake);                  // air in, from below
  vizFlowDash(px,py,S,LW,[[bx,276],[bx,by]],'#dff');
  let outX=bx;
  if(t==='centrifugal'){
    const end=vizScroll(px,py,S,LW,bx,by,13,7,1,Math.PI,10,'#14243a','#7ab');
    outX=end[0];vizPipe(px,py,LW,[[end[0],end[1]],[end[0],portYc]],8,hot);
    vizCompWheel(px,py,S,LW,bx,by,11.5,scAngle,C.metalLight);
  }else{
    vizPipe(px,py,LW,[[bx,by],[bx,portYc]],8,hot);
    // the casing: a figure of eight round the two rotors, the air in at the bottom and out at the top
    ctx.fillStyle='#1a1a26';ctx.strokeStyle=C.metal;ctx.lineWidth=LW(1.4);
    ctx.beginPath();ctx.arc(px(bx-14),py(by),16*S,0,6.284);ctx.moveTo(px(bx+30),py(by));ctx.arc(px(bx+14),py(by),16*S,0,6.284);ctx.fill();ctx.stroke();
    ctx.fillStyle='#1a1a26';ctx.fillRect(px(bx-5),py(by-15),10*S,30*S);
    if(t==='screw'){       // a 4-lobe male rotor driving a 6-flute female one, which turns at 4/6 of its speed
      vizRotor(px,py,S,bx-14,by,14,4,0.4,scAngle,C.metalLight);
      vizRotor(px,py,S,bx+15,by,14,6,0.28,-scAngle*4/6+Math.PI/6,'#8a8a9a');
    }else{                 // two 3-lobe rotors turning against each other, the air carried round the outside
      vizRotor(px,py,S,bx-14,by,14,3,0.5,scAngle,C.metalLight);
      vizRotor(px,py,S,bx+14,by,14,3,0.5,-scAngle+Math.PI/3,C.metalLight);
    }
  }
  vizFlowDash(px,py,S,LW,[[outX,by-14],[outX,portYc]],'#fff');
  if(e.intercooler&&e.intercooler!=='none')vizCore(px,py,S,LW,outX-9,122,18,44,hot);
  // the belt, from the crank pulley to the blower's: the blower's is smaller by the drive ratio
  const rc=9,rp=t==='centrifugal'?4:rc/snd.drive;
  const dx=bx-crank.x,dy=by-crank.y,L=Math.hypot(dx,dy),nx=-dy/L,ny=dx/L;
  ctx.save();ctx.strokeStyle='#3a3a44';ctx.lineWidth=LW(2.2);
  ctx.setLineDash([5*S,2*S]);ctx.lineDashOffset=-((crankAngle*rc)%7)*S;
  ctx.beginPath();ctx.moveTo(px(crank.x+nx*rc),py(crank.y+ny*rc));ctx.lineTo(px(bx+nx*rp),py(by+ny*rp));
  ctx.moveTo(px(crank.x-nx*rc),py(crank.y-ny*rc));ctx.lineTo(px(bx-nx*rp),py(by-ny*rp));ctx.stroke();ctx.restore();
  ctx.strokeStyle='#55556a';ctx.lineWidth=LW(2);
  ctx.beginPath();ctx.arc(px(crank.x),py(crank.y),rc*S,0,6.284);ctx.stroke();
  ctx.beginPath();ctx.arc(px(bx),py(by),rp*S,0,6.284);ctx.stroke();
  vizBox(px,py,S,LW,bx-11,276,22,12,'#2a2a22','#8a8a7a');                         // the air filter at its inlet
  ctx.fillStyle='#89b';ctx.font=F(5.5);ctx.fillText(tr('AIR IN'),px(bx-14),py(296));
  // readout along the bottom
  const nSc=state.rpm*snd.drive;
  ctx.font=F(6.5);ctx.fillStyle=boost>0.02?C.yellow:'#667';
  ctx.fillText((t==='roots'?'ROOTS':t==='screw'?'TWIN-SCREW':'CENTRIFUGAL')+' '+tr('SUPERCHARGER')+' +'+boost.toFixed(2)+' bar',px(40),py(356));
  ctx.fillStyle='#89b';ctx.font=F(6);
  ctx.fillText(snd.drive.toFixed(snd.drive<10?1:0)+':1 '+tr('OFF THE CRANK')+' • '+Math.round(nSc/100)*100+' rpm • '+tr('OUTLET')+' '+Math.round(hotT)+'C',px(40),py(368));
  drawBoostBar(px,py,S,F,LW,40,376,200,boost,e.boost_bar||0);
}
function drawExhaustSide(px,py,S,F,LW,m,portYc,exX){
  const e=engine;
  const exHot=clamp(state.powerHP/Math.max(60,engine.score?engine.score.peakHP:200),0,1);
  const gasCol=state.blown?'#444':`rgb(${Math.round(120+120*exHot)},${Math.round(60+30*exHot)},40)`;
  const egtK=egtAt(state.rpm,m),egt=Math.round(state.powerHP>1?egtK-273:state.coolant);
  ctx.fillStyle=C.exhaust;ctx.font=F(6.5);
  if(e.intake==='turbo'){
    drawTurbo(px,py,S,F,LW,m,portYc,exX,gasCol);
    ctx.fillStyle=C.exhaust;ctx.font=F(6.5);ctx.fillText(tr('EXHAUST'),px(400),py(portYc-14));
    ctx.fillStyle='#89b';ctx.font=F(6);
    ctx.fillText((e.exhaustPart?e.exhaustPart.name.toUpperCase():e.exhaust.toUpperCase())+' • '+tr('CAT')+' '+CAT[e.cat].label.split(' ')[0],px(400),py(portYc+2));
    ctx.fillText(tr('EGT')+' '+egt+'C '+tr('AT THE TURBINE'),px(400),py(portYc+12));
    return;
  }
  // the primary to scale (a cast log manifold is a short fat one), the collector, the cat and the silencer
  const ex=EXHAUST[e.exhaust]||EXHAUST.sport,log=!!ex.fixedL;
  const primPx=clamp((e.primL||0.5)*1000/TRACT_MM,16,220),colX=exX+primPx;
  vizPipe(px,py,LW,[[exX,portYc],[colX,portYc]],log?11:6,gasCol);
  ctx.fillStyle=gasCol;ctx.beginPath();ctx.moveTo(px(colX),py(portYc-4));ctx.lineTo(px(colX+8),py(portYc-3));ctx.lineTo(px(colX+8),py(portYc+3));ctx.lineTo(px(colX),py(portYc+4));ctx.closePath();ctx.fill();
  let xe=colX+8;const tail=[];
  if(e.cat!=='none'){vizPipe(px,py,LW,[[xe,portYc],[xe+8,portYc]],6,'#7a4a30');vizBox(px,py,S,LW,xe+8,portYc-7,20,14,'#3a2a22','#a87');
    ctx.fillStyle='#a87';ctx.font=F(4.5);ctx.fillText(tr('CAT'),px(xe+11),py(portYc+2));xe+=28;}
  vizPipe(px,py,LW,[[xe,portYc],[xe+10,portYc]],6,'#7a4a30');
  ctx.fillStyle='#2a2a30';ctx.strokeStyle='#889';ctx.lineWidth=LW(1.1);ctx.beginPath();ctx.ellipse(px(xe+26),py(portYc),16*S,8*S,0,0,6.284);ctx.fill();ctx.stroke();
  vizPipe(px,py,LW,[[xe+42,portYc],[Math.max(xe+54,600),portYc]],5,'#6a4a3a');
  vizFlowDash(px,py,S,LW,[[exX,portYc],[Math.max(xe+54,600),portYc]],'#fc8');
  // The blowdown pulse leaves the port when the exhaust valve opens and runs down the primary at the speed of
  // sound in the gas; at the open collector it reflects as a suction wave, at the port's end it reflects as it
  // came, and so back and forth. The header is cut (primL, primK) for the primK-th return to reach the port as a
  // suction near the overlap TDC at its target speed: if it is back while both valves are open, it pulls the
  // last of the burnt gas out and the fresh charge in behind it. Timed in crank degrees, as the model times it.
  let waveTxt=null;
  if(e.type!=='rotary'&&e.type!=='twostroke'&&!e.ports&&e.primL>0){
    const ev=valveEvents(state.rpm),d=crankAngle*180/Math.PI,degPerM=6*state.rpm/sonic(egtK);
    const k=Math.max(1,e.primK||1),L=e.primL,dist=wrap720(d-ev.evo)/degPerM,toPx=x=>x/L*primPx;
    if(state.powerHP>1&&dist<2*k*L){
      const seg=Math.floor(dist/L),w=dist-seg*L,xw=seg%2===0?exX+toPx(w):colX-toPx(w);
      const suction=Math.floor((seg+1)/2)%2===1;   // flipped at the open collector, kept at the port end
      ctx.fillStyle=suction?'#66ccff':'#ffdd88';ctx.beginPath();ctx.ellipse(px(xw),py(portYc),3*S,5*S,0,0,6.284);ctx.fill();
    }
    const back=headerReturnAt(state.rpm,egtK),inOv=liftIn(back,ev.ivo,ev.ivc)>0&&liftIn(back,ev.evo,ev.evc)>0;
    const rel=back>360?back-720:back;               // degrees from the overlap TDC (0 = 720)
    waveTxt={t:tr('WAVE BACK')+(k>1?' ('+k+'x)':'')+' '+Math.round(Math.abs(rel))+'°'+(rel<0?'BTDC':'ATDC'),ok:inOv};
  }
  ctx.fillStyle=C.exhaust;ctx.font=F(6.5);
  ctx.fillText(tr('EXHAUST'),px(330),py(portYc-14));
  ctx.fillStyle='#89b';ctx.font=F(6);
  ctx.fillText((e.exhaustPart?e.exhaustPart.name.toUpperCase():e.exhaust.toUpperCase())+' '+Math.round((e.primL||0)*1000)+' mm • '+tr('CAT')+' '+CAT[e.cat].label.split(' ')[0],px(330),py(portYc+20));
  drawExhaustSide.dbg={exX,colX,primPx,wave:waveTxt};   // read by test90
  if(waveTxt){ctx.fillStyle=waveTxt.ok?C.green:'#89b';ctx.fillText(waveTxt.t+(waveTxt.ok?' • '+tr('SCAVENGING'):''),px(330),py(portYc+40));}
  // The model's own exhaust temperature at this load — the same call back-pressure uses. This read
  // 320 + 520 x (power / peak power) until build 85: a display formula with no physics in it, which
  // showed a diesel at full power as hot as a petrol engine.
  ctx.fillStyle='#89b';ctx.fillText(tr('EGT')+' '+egt+'C',px(330),py(portYc+30));
}
function drawTurbo(px,py,S,F,LW,m,portYc,exX,gasCol){
  const e=engine,TX=VIZ_TX,TY=VIZ_TTY,CY=VIZ_CTY;
  const vgt=e.vgtShut>0,rwT=vgt?19:15,gT=8,rwC=17,gC=9;
  const n=e.shaftJ?Math.sqrt(2*Math.max(0,state.shaftE||0)/e.shaftJ)*60/(2*Math.PI):0;
  const boost=Math.max(0,state.boostActual||0),target=boostTarget(state.rpm);
  // the wastegate holds the target: shut while the shaft cannot make it, open once it has it
  const gate=!vgt&&state.throttle>0.3&&target>0.02&&boost>=target-0.01;
  const dX=TX+rwT+gT/2;                                   // the turbine's inlet duct
  // downpipe first, so the housing sits in front of it: from the exducer, round and away to the cat
  const down=[[TX,TY],[388,TY],[388,112],[596,112]];
  vizPipe(px,py,LW,down,7,'#7a4a30');vizFlowDash(px,py,S,LW,down,'#c96');
  if(e.cat!=='none'){vizBox(px,py,S,LW,470,105,22,14,'#3a2a22','#a87');ctx.fillStyle='#a87';ctx.font=F(4.5);ctx.fillText(tr('CAT'),px(474),py(114));}
  ctx.fillStyle='#2a2a30';ctx.strokeStyle='#889';ctx.lineWidth=LW(1.1);ctx.beginPath();ctx.ellipse(px(548),py(112),17*S,8*S,0,0,6.284);ctx.fill();ctx.stroke();
  // exhaust port -> manifold -> down into the turbine's duct
  const man=[[exX,portYc],[dX,portYc],[dX,TY-18]];
  vizPipe(px,py,LW,man,7,gasCol);vizFlowDash(px,py,S,LW,man,'#fc8');
  if(!vgt){                                                // the wastegate: a valve bypassing the turbine
    const wy=128,vx=(dX+388)/2;
    vizPipe(px,py,LW,[[dX,wy],[388,wy]],4,'#7a4a30');
    if(gate)vizFlowDash(px,py,S,LW,[[dX,wy],[388,wy]],'#fc8');
    ctx.fillStyle='#22222e';ctx.strokeStyle=gate?C.yellow:'#aab';ctx.lineWidth=LW(1.2);
    ctx.beginPath();ctx.arc(px(vx),py(wy),4.5*S,0,6.284);ctx.fill();ctx.stroke();
    const a=gate?1.2:0;                                   // the poppet, lifted off its seat when open
    ctx.beginPath();ctx.moveTo(px(vx-3*Math.cos(a)),py(wy-3*Math.sin(a)));ctx.lineTo(px(vx+3*Math.cos(a)),py(wy+3*Math.sin(a)));ctx.stroke();
    ctx.fillStyle=gate?C.yellow:'#89b';ctx.font=F(5);ctx.textAlign='center';ctx.fillText('WG',px(vx),py(wy-7));ctx.textAlign='left';
  }
  if(e.turboConfig&&e.turboConfig!=='single'){            // a second unit, behind
    ctx.save();ctx.globalAlpha=0.5;
    vizScroll(px,py,S,LW,TX-12,TY-12,rwT*0.8,gT*0.8,-1,0,8,'#3a1a14',gasCol);
    vizScroll(px,py,S,LW,TX-12,CY-12,rwC*0.8,gC*0.8,1,0,8,'#14243a','#7ab');
    ctx.restore();
  }
  // centre housing: the shaft and its bearings, oil-cooled, between the hot side and the cold
  ctx.fillStyle='#2a2a38';ctx.fillRect(px(TX-6),py(TY+rwT+gT-2),12*S,(CY-rwC-gC-TY-rwT-gT+4)*S);
  ctx.strokeStyle=C.metal;ctx.lineWidth=LW(1);ctx.strokeRect(px(TX-6),py(TY+rwT+gT-2),12*S,(CY-rwC-gC-TY-rwT-gT+4)*S);
  ctx.strokeStyle=C.metalLight;ctx.lineWidth=LW(2);ctx.beginPath();ctx.moveTo(px(TX),py(TY));ctx.lineTo(px(TX),py(CY));ctx.stroke();
  // turbine: the gas comes down the duct and spirals in, clockwise, onto the wheel
  vizScroll(px,py,S,LW,TX,TY,rwT,gT,-1,0,16,'#3a1a14',gasCol);
  vizTurbWheel(px,py,S,LW,TX,TY,rwT-(vgt?7:2),turboAngle,'#c8a090');
  if(vgt){
    // the vane ring: shut, the vanes lie nearly along the passage and speed the gas onto the wheel; open,
    // they stand radial and let it through. Opened as far as the model schedules them for this point.
    const area=turbineThroatAt(state.rpm,Math.max(1,m),egtAt(state.rpm,m));
    const f=clamp((area-e.vgtShut)/Math.max(1e-12,e.turbineArea-e.vgtShut),0,1);
    ctx.strokeStyle=C.yellow;ctx.lineWidth=LW(1.2);
    for(let i=0;i<11;i++){const a=i*2*Math.PI/11,r=rwT-3.2,x=TX+r*Math.cos(a),y=TY+r*Math.sin(a),va=a+Math.PI/2-(0.25+1.0*f);
      ctx.beginPath();ctx.moveTo(px(x-2.4*Math.cos(va)),py(y-2.4*Math.sin(va)));ctx.lineTo(px(x+2.4*Math.cos(va)),py(y+2.4*Math.sin(va)));ctx.stroke();}
    drawTurbo.vane=f;
  }
  drawTurbo.gate=gate;   // read by test88
  // compressor: air drawn in at the eye, towards you, flung round and out of the widening scroll
  const hotT=compOutletT(Math.max(1,1+boost),state.rpm),hot=vizTempCol(hotT);
  const end=vizScroll(px,py,S,LW,TX,CY,rwC,gC,1,0,12,'#14243a','#7ab');
  vizCompWheel(px,py,S,LW,TX,CY,rwC-1.5,turboAngle,C.metalLight);
  ctx.fillStyle='#89b';ctx.font=F(5.5);ctx.textAlign='right';ctx.fillText(tr('AIR IN'),px(TX-9),py(CY-rwC-gC-3));ctx.textAlign='left';
  // the charge pipe: down, along under the engine, up through the intercooler to the throttle body
  const ic=e.intercooler&&e.intercooler!=='none';
  const chg=[[end[0],end[1]],[end[0],VIZ_CHG_Y],[VIZ_IC_X,VIZ_CHG_Y],[VIZ_IC_X,portYc]];
  vizPipe(px,py,LW,chg.slice(0,3).concat([[VIZ_IC_X,ic?250:portYc]]),7,hot);
  if(ic){vizPipe(px,py,LW,[[VIZ_IC_X,150],[VIZ_IC_X,portYc]],7,vizTempCol(effIAT(1+boost,state.rpm)));
    vizCore(px,py,S,LW,VIZ_IC_X-10,150,20,100,hot);
    ctx.fillStyle='#89b';ctx.font=F(5.5);
    ctx.fillText(tr('INTERCOOLER'),px(VIZ_IC_X+14),py(272));
    ctx.fillText(Math.round(hotT)+'C -> '+Math.round(effIAT(1+boost,state.rpm))+'C',px(VIZ_IC_X+14),py(282));}
  vizFlowDash(px,py,S,LW,chg,'#fff');
  // the blow-off valve: when the throttle shuts on a pipe full of boost it vents it, once
  if(!e.ci){
    if(state.throttle>=0.1)vizChargeP=boost;else if(vizChargeP>0.15){vizBovT=0.7;vizChargeP=0;}
    ctx.fillStyle='#aab';ctx.fillRect(px(VIZ_IC_X+4),py(306),6*S,6*S);
    if(vizBovT>0){ctx.fillStyle='#dde';for(let k=0;k<6;k++){const f=1-vizBovT/0.7,x=VIZ_IC_X+12+f*28+(k%3)*4,y=304+(k*7%11)-f*6;
      ctx.fillRect(px(x),py(y),2*S,2*S);}
      ctx.font=F(5.5);ctx.fillText(tr('BLOW-OFF'),px(VIZ_IC_X+14),py(300));}
  }
  // anti-lag: off throttle it keeps burning fuel in the manifold to hold the shaft up
  if(e.antilag&&state.throttle<0.2&&state.rpm>2500&&Math.random()<0.5){
    ctx.fillStyle=Math.random()<0.5?C.yellow:C.fire;
    for(let k=0;k<4;k++)ctx.fillRect(px(dX-4+Math.random()*8),py(TY-34+Math.random()*16),3*S,3*S);}
  // readout along the bottom
  ctx.font=F(6.5);ctx.fillStyle=boost>0.02?C.yellow:'#667';
  const cfg=e.turboConfig&&e.turboConfig!=='single'?TURBO_CONFIG[e.turboConfig].label+' ':'';
  ctx.fillText(cfg+tr('TURBO')+' +'+boost.toFixed(2)+' bar ('+tr('TARGET')+' '+target.toFixed(2)+')',px(40),py(356));
  ctx.fillStyle='#89b';ctx.font=F(6);
  // where the compressor is working now: its flow over its inducer's choke flow (compFlowFrac)
  const fl=compFlowFrac(state.rpm,airFlowAt(state.rpm,Math.max(0.1,m)));
  ctx.fillText((Math.round(n/1000)*1000).toLocaleString('en-US').replace(/,/g,' ')+' rpm • '+Math.round(fl*100)+'% '+tr('of choke flow')+' • '
    +(vgt?tr('VANES')+' '+Math.round((drawTurbo.vane||0)*100)+tr('% OPEN'):tr(gate?'WASTEGATE OPEN':'WASTEGATE SHUT')),px(40),py(368));
  drawBoostBar(px,py,S,F,LW,40,376,200,boost,target);
  drawCompMap(px,py,S,F,LW,308,276,56,58,m);
}
function drawFuelSpark(px,py,S,F,m){
  // bottom right, under the bank (build 164: the left column carries the intake and the boosters now)
  const e=engine;
  const fx=400,fy=336,kx=508;
  ctx.fillStyle='#778';ctx.font=F(6);ctx.fillText(tr('FUEL & SPARK'),px(fx),py(fy+4));
  const lam=state.afr/engine.stoichAFR;
  const lamCol=lam<0.85?C.yellow:lam>1.08?C.red:C.green;
  ctx.font=F(6);
  ctx.fillStyle='#cde';ctx.fillText(FUELS[e.fuel].label+(e.fuel==='gasoline'?' '+e.octane+' RON':''),px(fx),py(fy+16));
  ctx.fillStyle=state.fuelCut&&state.rpm<e.redline?C.cyan:'#cde';
  ctx.fillText(state.fuelCut&&state.rpm<e.redline?tr('OVERRUN CUT'):state.fuelFlowLph.toFixed(1)+' L/h',px(fx),py(fy+27));
  ctx.fillStyle=lamCol;ctx.fillText('AFR '+state.afr.toFixed(1)+' λ'+lam.toFixed(2),px(fx),py(fy+38));
  ctx.fillStyle='#cde';
  ctx.fillText(e.ci?tr('DIESEL: NO SPARK'):tr('ADV')+' '+Math.round(activeAdvance(state.rpm,m))+'°'+(e.timingMode==='auto'?' '+tr('AUTO'):''),px(fx),py(fy+49));
  // knock bar — the readout that decides whether the build survives
  ctx.fillStyle='#778';ctx.font=F(6);ctx.fillText(tr('KNOCK RISK'),px(kx),py(fy+16));
  ctx.fillStyle='#1a1a28';ctx.fillRect(px(kx),py(fy+20),88*S,9*S);
  const kf=clamp(state.knockRisk/100,0,1);
  ctx.fillStyle=state.knockRisk>60?C.red:state.knockRisk>30?C.yellow:C.green;
  ctx.fillRect(px(kx),py(fy+20),88*kf*S,9*S);
  ctx.fillStyle='#cde';ctx.textAlign='right';ctx.fillText(Math.round(state.knockRisk),px(kx+85),py(fy+27));ctx.textAlign='left';
}
function drawShaftOutput(px,py,F,x,y,label){
  ctx.font=F(7);ctx.textAlign='center';
  ctx.fillStyle='#778';ctx.font=F(6);ctx.fillText(label,px(x),py(y));
  ctx.font=F(8);
  const z=v=>Math.round(v)||0;   // never "-0": a motored engine's fraction of a negative unit reads 0
  ctx.fillStyle=C.green;ctx.fillText(z(state.powerHP)+' HP',px(x),py(y+16));
  ctx.fillStyle=C.cyan;ctx.fillText(z(state.torque)+' Nm',px(x),py(y+30));
  ctx.textAlign='left';
}
function drawTempGauges(px,py,S,F,LW,x,y,w){
  gaugeBar(px,py,S,F,LW,x,y+12,w,tr('COOLANT'),state.coolant,60,125,108,115);
  gaugeBar(px,py,S,F,LW,x,y+34,w,tr('OIL'),state.oil,60,140,115,125);
}
// ---- the head, timed by the model (build 165) ----
// The valves opened at fixed angles (intake 20 BTDC to 50 ABDC on every cam) and the spark fired at 340 deg on
// every engine, whatever its advance. Now the events are the cam's: duration and lobe separation from the cam
// profile, the intake lobe advanced by the phaser as far as the model's fill table schedules it at this rpm, the
// lift the cam's L/D on the model's valve. The spark fires at the model's advance and the charge burns over the
// Wiebe burn the model's work uses (SI_BURN_DEG); a diesel's fuel goes in near TDC and burns over BURN_T_CI.
// Crank degrees here are the drawing's: 0 = TDC at the start of the intake stroke, 360 = firing TDC.
function valveEvents(rpm){
  const e=engine,dur=e.camDur||220,lsa=e.camLSA||112,adv=camAdvAt(rpm);
  // the same conventions as the breathing model: IVC = LSA + dur/2 - 180 - advance ABDC (ivcAbdc), the exhaust
  // lobe centred LSA before overlap TDC (EVO at 360 - LSA - dur/2 after firing TDC, as in the blowdown model)
  const ivo=-(dur/2-lsa+adv), ivc=lsa+dur/2-adv, evo=720-lsa-dur/2, evc=720-lsa+dur/2;
  return {ivo,ivc,evo,evc,adv,dur,lsa,overlap:dur-2*lsa};
}
const wrap720=x=>((x%720)+720)%720;
// lift 0..1 through a window, the same half-sine the cam lobe below is ground to
function liftIn(d,open,close){let a=wrap720(d-open),span=close-open;return a<span?Math.sin(Math.PI*a/span):0;}
// A cam seen end-on: base circle rb, the lobe rising by L over a half-width hw (cam degrees) either side of its
// nose, the half-sine the valve follows. noseAng: where the nose points on screen.
function drawCamLobe(px,py,S,LW,x,y,rb,L,hw,noseAng,col){
  ctx.fillStyle=col;ctx.beginPath();
  for(let i=0;i<=90;i++){const a=i/90*2*Math.PI;let dpsi=((a-noseAng)*180/Math.PI+540)%360-180;
    const r=rb+(Math.abs(dpsi)<hw?L*Math.cos(Math.PI*dpsi/(2*hw)):0);
    const X=px(x+r*Math.cos(a)),Y=py(y+r*Math.sin(a));if(i)ctx.lineTo(X,Y);else ctx.moveTo(X,Y);}
  ctx.fill();
  ctx.fillStyle='#0c0c14';ctx.beginPath();ctx.arc(px(x),py(y),rb*0.35*S,0,6.284);ctx.fill();
}
let knockCycle=false,lastCycleD=0;
function drawPistonCutaway(px,py,S,F,LW,deg,nCyl,rodRatio,bsr,two,m){
  const e=engine;
  // Geometry of the big cylinder. Bore/stroke ratio decides how wide and how tall it is, so an
  // oversquare engine really is drawn short and wide and a long-stroke one tall and narrow. The
  // crank centre is placed so the whole crank circle stays inside the block casting.
  const cx=252,headY=54,bore=clamp(50*bsr,34,72),strokeLen=clamp(78/bsr,58,104);
  const boreTop=headY+38;
  const crankY=boreTop+strokeLen+42;
  const cycleDeg=two?360:720;
  const th=(deg%cycleDeg)*(two?2:1)*Math.PI/180;          // crank radians for the drawn cylinder
  const frac=pistonFrac(th,rodRatio);
  const pistonH=20;
  const topY=boreTop+frac*strokeLen;                      // crown position

  // ---- combustion: the spark at the model's advance, the charge burning over the model's burn ----
  const d=(deg%cycleDeg);
  const fired=!state.blown&&state.powerHP>1&&!state.fuelCut;
  const adv=activeAdvance(state.rpm,Math.max(0.2,m));
  // a two-stroke fires once a turn: its firing TDC is the drawing's 180
  const tdcF=two?180:360;
  const burnDeg=e.ci?Math.max(20,BURN_T_CI*state.rpm*6):SI_BURN_DEG;
  const burnStart=tdcF+(e.ci?SOC_CI:-adv);
  const into=wrap720(d-burnStart);
  const xb=fired&&into<burnDeg+120&&wrap720(d-burnStart)<360?1-Math.exp(-WIEBE_A*Math.pow(Math.min(1,into/burnDeg),WIEBE_M+1)):0;
  const burning=fired&&into<burnDeg;
  // knock: on the share of cycles the knock model says detonate, the end gas goes off ahead of the flame
  if(d<lastCycleD)knockCycle=Math.random()<clamp((state.knockRisk-KNOCK_TARGET)/60,0,1);
  lastCycleD=d;

  // ---- block casting: head deck on top, crankcase below ----
  const blkX=cx-bore/2-20,blkW=bore+40,blkY=headY,blkH=crankY-headY+46;
  ctx.fillStyle='#15151f';ctx.fillRect(px(blkX),py(blkY),blkW*S,blkH*S);
  ctx.strokeStyle=C.metal;ctx.lineWidth=LW(1.5);ctx.strokeRect(px(blkX),py(blkY),blkW*S,blkH*S);
  ctx.strokeStyle='#26263a';ctx.lineWidth=LW(1);
  ctx.beginPath();ctx.moveTo(px(blkX),py(boreTop-4));ctx.lineTo(px(blkX+blkW),py(boreTop-4));ctx.stroke();

  // ---- cylinder bore ----
  const boreH=strokeLen+pistonH+4;
  ctx.fillStyle='#0c0c14';ctx.fillRect(px(cx-bore/2),py(boreTop-4),bore*S,boreH*S);
  // charge in the chamber: colour by what is in it right now
  const chamberH=Math.max(3,(topY-boreTop+4));
  // the combustion chamber is in the head: a pent roof over the bore, the valves seated in its slopes, the plug
  // at its peak (a two-stroke's head is a flat dome)
  const roofH=(!two&&!e.ports)?clamp(bore*0.16,5,11):0;
  const seatAt=x=>boreTop-4-roofH*(1-Math.min(1,Math.abs(x-cx)/(bore/2)));
  const chamber=()=>{ctx.beginPath();ctx.moveTo(px(cx-bore/2+2),py(boreTop-3+chamberH));ctx.lineTo(px(cx-bore/2+2),py(boreTop-3));
    ctx.lineTo(px(cx),py(boreTop-3-roofH));ctx.lineTo(px(cx+bore/2-2),py(boreTop-3));ctx.lineTo(px(cx+bore/2-2),py(boreTop-3+chamberH));ctx.closePath();};
  let chargeCol='#12203a';                                 // fresh air
  const inBurn=fired&&wrap720(d-burnStart)<(two?180:400);   // from the spark to the exhaust opening
  if(!two){
    if(d<180)chargeCol='#12304a';                          // intake
    else if(!inBurn&&d<540)chargeCol='#1b3a55';            // compression
    else if(d<540)chargeCol='#5a2a18';                     // power / burnt
    else chargeCol='#3a2420';                              // exhaust
  }else chargeCol=d<170?'#1b3a55':'#3a2420';
  ctx.fillStyle=chargeCol;chamber();ctx.fill();
  if(burning||(fired&&into<burnDeg+30)){
    // the flame: a front spreading from the plug (or the diesel's sprays), its swept area the burned share
    ctx.save();chamber();ctx.clip();
    const fy=boreTop-1-roofH,Rmax=Math.hypot(bore/2,chamberH+roofH),R=Math.sqrt(Math.max(0.02,xb))*Rmax;
    const glow=burning?1:Math.max(0,1-(into-burnDeg)/30);
    ctx.globalAlpha=0.35+0.65*glow;
    ctx.fillStyle='#ffcc44';
    if(e.ci){for(const a of [0.55,1.2,1.95,2.6]){ctx.beginPath();ctx.ellipse(px(cx+Math.cos(a)*R*0.45),py(fy+Math.sin(a)*R*0.45),R*0.42*S,R*0.2*S,a,0,6.284);ctx.fill();}}
    else{ctx.beginPath();ctx.arc(px(cx),py(fy),R*S,0,6.284);ctx.fill();
      ctx.fillStyle='#fff2a8';ctx.beginPath();ctx.arc(px(cx),py(fy),R*0.55*S,0,6.284);ctx.fill();}
    // detonation: the end gas, out at the bore wall, goes off before the flame reaches it
    if(knockCycle&&!e.ci&&xb>0.35&&burning){ctx.globalAlpha=1;
      for(const sx of [-1,1]){const kx=cx+sx*(bore/2-4),ky=boreTop-2;
        ctx.fillStyle='#ff3311';ctx.beginPath();ctx.arc(px(kx),py(ky),(4+Math.random()*3)*S,0,6.284);ctx.fill();
        ctx.fillStyle='#ffffff';ctx.beginPath();ctx.arc(px(kx),py(ky),2*S,0,6.284);ctx.fill();}}
    ctx.restore();
    // the pressure waves a detonation sends ringing round the chamber: what a knock sensor hears
    if(knockCycle&&!e.ci&&xb>0.35&&into<burnDeg+40){ctx.strokeStyle='#ff6644';ctx.lineWidth=LW(1);
      for(let k=0;k<3;k++){const r=6+k*7+(into%7);ctx.beginPath();ctx.arc(px(cx+bore/2-4),py(boreTop-2),r*S,Math.PI*0.5,Math.PI*1.5);ctx.stroke();}}
    ctx.save();
    ctx.restore();
  }
  ctx.strokeStyle=C.metal;ctx.lineWidth=LW(1.2);
  ctx.strokeRect(px(cx-bore/2),py(boreTop-4),bore*S,boreH*S);
  // crankcase: the open space the rod swings in, with the main bearing at its centre
  ctx.fillStyle='#0a0a12';ctx.fillRect(px(blkX+3),py(boreTop-4+boreH),(blkW-6)*S,(crankY+40-(boreTop+boreH))*S);
  ctx.strokeStyle='#26263a';ctx.lineWidth=LW(1);
  ctx.beginPath();ctx.arc(px(cx),py(crankY),Math.min(strokeLen/2+10,blkW/2-6)*S,0,6.284);ctx.stroke();

  // ---- piston + rings + rod + crank ----
  const throwR=strokeLen/2, pinY=topY+pistonH-4;
  const crankX=cx+Math.sin(th)*throwR, crankPinY=crankY-Math.cos(th)*throwR;
  ctx.fillStyle=state.blown?'#5a5a3a':C.piston;
  ctx.fillRect(px(cx-bore/2+3),py(topY),(bore-6)*S,pistonH*S);
  ctx.strokeStyle='#0c0c14';ctx.lineWidth=LW(1);
  for(let r=0;r<3;r++){ctx.beginPath();ctx.moveTo(px(cx-bore/2+3),py(topY+4+r*3.5));ctx.lineTo(px(cx+bore/2-3),py(topY+4+r*3.5));ctx.stroke();}
  ctx.strokeStyle=C.rod;ctx.lineWidth=LW(4);
  ctx.beginPath();ctx.moveTo(px(cx),py(pinY));ctx.lineTo(px(crankX),py(crankPinY));ctx.stroke();
  // crank web + counterweight, so the rotation reads at a glance
  ctx.strokeStyle=C.metalLight;ctx.lineWidth=LW(6);
  ctx.beginPath();ctx.moveTo(px(cx),py(crankY));ctx.lineTo(px(crankX),py(crankPinY));ctx.stroke();
  ctx.fillStyle='#3a3a4e';ctx.beginPath();
  ctx.arc(px(cx-Math.sin(th)*throwR*0.85),py(crankY+Math.cos(th)*throwR*0.85),10*S,0,6.284);ctx.fill();
  ctx.fillStyle=C.metalLight;ctx.beginPath();ctx.arc(px(crankX),py(crankPinY),4*S,0,6.284);ctx.fill();
  ctx.fillStyle=C.metalLight;ctx.beginPath();ctx.arc(px(cx),py(crankY),8*S,0,6.284);ctx.fill();
  ctx.fillStyle='#0c0c14';ctx.beginPath();ctx.arc(px(cx),py(crankY),3*S,0,6.284);ctx.fill();
  drawShaftOutput(px,py,F,cx,crankY+62,tr('AT THE CRANK'));

  // ---- head: the valvetrain and the ports, or the liner's ports on a two-stroke ----
  const headTop=headY+6;
  let camTxt=null,lifts=null;
  if(!two&&!e.ports){
    const ev=valveEvents(state.rpm);
    // lift to scale on the drawn bore: the cam's L/D on the model's valve diameter
    const mmPx=bore/e.bore_mm, L=Math.max(1.5,(e.ivLift_mm||8)*mmPx), vw=Math.max(7,(e.ivDia_mm||e.bore_mm*0.4)*mmPx);
    const float=e.floatRpm>0&&state.rpm>e.floatRpm;
    const vIn=cx-bore*0.25,vEx=cx+bore*0.25;
    // the valve's lift: the cam's, plus, past the float speed, the valve not following it shut: it bounces
    const lv=(open,close)=>{let l=liftIn(d,open,close);
      if(float){const a=wrap720(d-close);if(a<50)l=Math.max(l,0.4*Math.exp(-a/18)*Math.abs(Math.sin(a/7)));}return l;};
    const lIn=lv(ev.ivo,ev.ivc),lEx=lv(ev.evo,ev.evc);lifts={lIn,lEx,ev};
    // ports: the runner's passage through the head to the back of each valve
    ctx.lineCap='round';
    ctx.strokeStyle='#1a3550';ctx.lineWidth=LW(7);
    ctx.beginPath();ctx.moveTo(px(cx-bore/2-20),py(headY+20));ctx.quadraticCurveTo(px(vIn-4),py(headY+20),px(vIn),py(seatAt(vIn)-2));ctx.stroke();
    ctx.strokeStyle='#4a2418';
    ctx.beginPath();ctx.moveTo(px(cx+bore/2+20),py(headY+20));ctx.quadraticCurveTo(px(vEx+4),py(headY+20),px(vEx),py(seatAt(vEx)-2));ctx.stroke();
    ctx.lineCap='butt';
    const camY=headY-8,rb=6;
    const valve=(vx,lift,col)=>{                     // stem, head on its seat, spring
      const yHead=seatAt(vx)+lift*L,yTop=camY+rb+3+lift*L;
      ctx.strokeStyle='#556';ctx.lineWidth=LW(1);   // the spring, coiled round the stem under the retainer
      for(let k=0;k<4;k++){const y0=yTop+3+k*((headTop+6-yTop)/4);ctx.beginPath();ctx.moveTo(px(vx-4),py(y0));ctx.lineTo(px(vx+4),py(y0+2));ctx.stroke();}
      ctx.strokeStyle=col;ctx.lineWidth=LW(2.2);
      ctx.beginPath();ctx.moveTo(px(vx),py(yTop));ctx.lineTo(px(vx),py(yHead));ctx.stroke();
      ctx.fillStyle=lift>0.02?col:'#4a4a5e';
      ctx.beginPath();ctx.moveTo(px(vx-vw/2),py(yHead));ctx.lineTo(px(vx+vw/2),py(yHead));
      ctx.lineTo(px(vx+vw/2-2),py(yHead+3));ctx.lineTo(px(vx-vw/2+2),py(yHead+3));ctx.closePath();ctx.fill();
      return yTop;
    };
    // the cam turns at half the crank: a lobe's nose points at its follower at the valve's centreline
    const camAt=c=>c/2;                               // cam degrees from crank degrees
    const nose=(cl,down)=>(down+(d/2-camAt(cl)))*Math.PI/180;
    const hw=ev.dur/4;                                // half the lobe, in cam degrees
    const clIn=(ev.ivo+ev.ivc)/2,clEx=(ev.evo+ev.evc)/2;
    if(e.valves===2){
      // Two valves: pushrods, as on the presets that have two (the American V8s): one cam in the block,
      // lifters and pushrods up the wall to rockers over the valves.
      const camX=cx-bore/2-10,camBY=boreTop+strokeLen*0.55;
      ctx.fillStyle='#15151f';ctx.fillRect(px(cx-bore/2-20),py(camY-8),(bore+40)*S,(headY-camY+8)*S);     // the rocker cover
      ctx.strokeStyle=C.metal;ctx.lineWidth=LW(1.2);ctx.strokeRect(px(cx-bore/2-20),py(camY-8),(bore+40)*S,(headY-camY+8)*S);
      const tIn=valve(vIn,lIn,C.intake),tEx=valve(vEx,lEx,C.exhaust);
      drawCamLobe(px,py,S,LW,camX,camBY,rb,L,hw,nose(clIn,-90),'#9a9aaa');
      ctx.save();ctx.globalAlpha=0.7;drawCamLobe(px,py,S,LW,camX,camBY,rb,L,hw,nose(clEx,-90),'#c08a7a');ctx.restore();
      ctx.strokeStyle='#8a8a9a';ctx.lineWidth=LW(1.6);
      for(const [ox,l,tv,vx] of [[-2,lIn,tIn,vIn],[2,lEx,tEx,vEx]]){
        const top=camY-2-l*L;                          // the pushrod rises with the lift
        ctx.beginPath();ctx.moveTo(px(camX+ox),py(camBY-rb-l*L));ctx.lineTo(px(camX+ox),py(top));ctx.stroke();
        ctx.beginPath();ctx.moveTo(px(camX+ox),py(top));ctx.lineTo(px(vx),py(tv));ctx.stroke();   // the rocker
      }
      ctx.fillStyle='#aab';ctx.beginPath();ctx.arc(px((camX+vIn)/2),py(camY-3),1.8*S,0,6.284);ctx.fill();ctx.beginPath();ctx.arc(px(cx+6),py(camY-3),1.8*S,0,6.284);ctx.fill();
      camTxt='OHV';
    }else{
      // overhead cams over bucket followers: one shaft for the intake valves, one for the exhaust
      ctx.fillStyle='#15151f';ctx.fillRect(px(cx-bore/2-20),py(camY-9),(bore+40)*S,(headY-camY+9)*S);
      ctx.strokeStyle=C.metal;ctx.lineWidth=LW(1.2);ctx.strokeRect(px(cx-bore/2-20),py(camY-9),(bore+40)*S,(headY-camY+9)*S);
      for(const [vx,l,col,cl,lobe] of [[vIn,lIn,C.intake,clIn,'#9ab0c8'],[vEx,lEx,C.exhaust,clEx,'#c8a090']]){
        const tv=valve(vx,l,col);
        ctx.fillStyle='#6a6a7a';ctx.fillRect(px(vx-4),py(tv-3),8*S,3*S);          // bucket
        drawCamLobe(px,py,S,LW,vx,camY,rb,L,hw,nose(cl,90),lobe);
      }
      if(e.vvt){ctx.strokeStyle=C.cyan;ctx.lineWidth=LW(1);ctx.beginPath();ctx.arc(px(vIn),py(camY),(rb+L+2)*S,0,6.284);ctx.stroke();}
      camTxt='DOHC '+e.valves+'V';
    }
    // the cam's events, where the model has them
    const fmt=(v,a,b)=>Math.round(Math.abs(v))+'°'+(v>=0?a:b);
    camTxt={t:camTxt,
      inTxt:tr('IN')+' '+fmt(-ev.ivo,'BTDC','ATDC')+' '+fmt(ev.ivc-180,'ABDC','BBDC'),
      exTxt:tr('EX')+' '+fmt(540-ev.evo,'BBDC','ABDC')+' '+fmt(ev.evc-720,'ATDC','BTDC'),
      ov:tr('OVERLAP')+' '+Math.round(ev.overlap+ev.adv)+'°',adv:ev.adv,float,L:e.ivLift_mm};
  }else{
    // Ports in the liner: uncovered when the piston crown drops past them.
    const portY=boreTop+strokeLen*0.62;
    const open=topY>portY-4;
    ctx.fillStyle=open?C.intake:'#2a2a3a';ctx.fillRect(px(cx-bore/2-6),py(portY),6*S,12*S);
    ctx.fillStyle=open?C.exhaust:'#2a2a3a';ctx.fillRect(px(cx+bore/2),py(portY-6),6*S,12*S);
  }
  // spark plug, or the diesel's injector, in the middle of the roof
  const sparkNow=fired&&!e.ci&&wrap720(d-burnStart)<6;
  drawPistonCutaway.dbg={d,burnStart,xb,sparkNow,knockCycle,lifts,valvetrain:camTxt&&camTxt.t,float:!!(camTxt&&camTxt.float)};   // read by test89
  if(!e.ci){
    ctx.strokeStyle=sparkNow?'#fff2a8':'#8898aa';ctx.lineWidth=LW(2.5);
    ctx.beginPath();ctx.moveTo(px(cx),py(headTop-6));ctx.lineTo(px(cx),py(boreTop-4-roofH));ctx.stroke();
    if(sparkNow){ctx.fillStyle='#ffffff';ctx.beginPath();ctx.arc(px(cx),py(boreTop-1-roofH),3*S,0,6.284);ctx.fill();}
  }else{
    ctx.strokeStyle=C.yellow;ctx.lineWidth=LW(2.5);
    ctx.beginPath();ctx.moveTo(px(cx),py(headTop-6));ctx.lineTo(px(cx),py(boreTop-4-roofH));ctx.stroke();
  }
  // the fuel going in, at a typical calibration's timing: a port injector sprays on the back of the shut intake
  // valve before it opens, a petrol direct injector into the cylinder early in the intake stroke, a diesel's
  // just before TDC. How long it sprays goes with the fuel per cycle (the torque).
  if(fired&&!two){
    const load=clamp(state.torque/Math.max(1,(e.score&&e.score.peakTQ)||1),0.05,1);
    let a0,len,ox,oy,dir;
    if(e.ci){a0=tdcF+SOC_CI-6;len=Math.max(6,burnDeg*0.6)*load+4;}
    else if(!(INTAKE_SYS[e.intakeSys]||{}).di&&/carb|sidedraft/.test(e.intakeSys||'')){a0=0;len=-1;}   // a carburettor meters the fuel into the air
    else if(e.injector==='direct'&&(INTAKE_SYS[e.intakeSys]||{di:true}).di){a0=70;len=20+110*load;}
    else{a0=wrap720((e.ports?0:valveEvents(state.rpm).ivo)-20-160*load);len=20+150*load;}
    const t=wrap720(d-a0);
    if(t<len){
      ctx.fillStyle='rgba(220,240,255,0.85)';
      if(e.ci){for(const a of [0.5,1.2,1.95,2.65])for(let k=1;k<6;k++){const r=k*3.2;ctx.fillRect(px(cx+Math.cos(a)*r),py(boreTop-3-roofH+Math.sin(a)*r),1.6*S,1.6*S);}}
      else if(e.injector==='direct'&&(INTAKE_SYS[e.intakeSys]||{di:true}).di){const ix=cx-bore/2+3,iy=boreTop-2;
        ctx.strokeStyle='#aab';ctx.lineWidth=LW(2);ctx.beginPath();ctx.moveTo(px(ix-8),py(iy-6));ctx.lineTo(px(ix),py(iy));ctx.stroke();
        for(let k=1;k<9;k++)for(const sp of [-0.25,0,0.25]){const r=k*3,a=0.55+sp;ctx.fillRect(px(ix+Math.cos(a)*r),py(iy+Math.sin(a)*r),1.4*S,1.4*S);}}
      else{const ix=cx-bore/2-12,iy=headY+12;
        ctx.strokeStyle='#aab';ctx.lineWidth=LW(2);ctx.beginPath();ctx.moveTo(px(ix-5),py(iy-6));ctx.lineTo(px(ix),py(iy));ctx.stroke();
        for(let k=1;k<8;k++)for(const sp of [-0.2,0.2]){const r=k*2.6,a=0.75+sp;ctx.fillRect(px(ix+Math.cos(a)*r),py(iy+Math.sin(a)*r),1.4*S,1.4*S);}}
    }
  }
  // stroke label, so the animation teaches the cycle rather than just moving: up in the title bar, where the
  // cam cover now sits over the head
  const strokeName=two?(d<170?tr('COMPRESSION'):tr('POWER/SCAVENGE'))
    :(d<180?tr('INTAKE'):d<360?tr('COMPRESSION'):d<540?tr('POWER'):tr('EXHAUST'));
  ctx.fillStyle=C.cyan;ctx.font=F(8);ctx.textAlign='center';
  ctx.fillText(strokeName,px(cx+30),py(16));
  ctx.textAlign='left';
  // ---- intake tract (drawn before the left column's text, so the belt and pipes pass behind it) with a throttle butterfly, and the blower or turbo feeding it ----
  const portYc=headY+20;
  drawIntakeSide(px,py,S,F,LW,m,portYc,cx-bore/2-20,{x:cx,y:crankY});

  // ---- exhaust tract, hot when it is flowing ----
  drawExhaustSide(px,py,S,F,LW,m,portYc,cx+bore/2+20);

  // volumetric efficiency belongs on the cylinder — it IS how well this bore is breathing
  ctx.textAlign='left';
  // VE and the cam sit in the clear column beside the casting — next to the parts they describe,
  // but outside the drawing so neither is obscured.
  const labX=84;   // the left column (build 164: the turbo sits on the right)
  ctx.font=F(6);ctx.fillStyle='#778';ctx.fillText(tr('BREATHING'),px(labX),py(130));
  ctx.font=F(7);ctx.fillStyle='#cde';ctx.fillText('VE '+(state.ve*100).toFixed(0)+'%',px(labX),py(142));
  ctx.font=F(6);ctx.fillStyle='#778';ctx.fillText(tr('CAM'),px(labX),py(160));
  ctx.font=F(7);ctx.fillStyle='#cde';
  ctx.fillText(e.ports?tr('PORTS'):e.cam.toUpperCase()+(camTxt?' • '+camTxt.t:''),px(labX),py(172));
  if(camTxt){ctx.font=F(5.5);ctx.fillStyle='#9ab';
    ctx.fillText(camTxt.inTxt,px(labX),py(184));ctx.fillText(camTxt.exTxt,px(labX),py(194));ctx.fillText(camTxt.ov,px(labX),py(204));
    ctx.fillText(tr('LIFT')+' '+(camTxt.L||0).toFixed(1)+' mm',px(labX),py(214));
    if(e.vvt){ctx.fillStyle=C.cyan;ctx.fillText('VVT +'+Math.round(camTxt.adv)+'°',px(labX),py(224));}
    if(camTxt.float){ctx.fillStyle=C.red;ctx.font=F(6.5);ctx.fillText(tr('VALVE FLOAT'),px(labX),py(236));}}


  // ---- knock: shake the block and flag it, because it is the thing that kills engines ----
  if(state.knockRisk>55&&!state.blown){
    const j=(state.knockRisk-55)/45;
    ctx.fillStyle=C.red;ctx.font=F(7);ctx.textAlign='center';
    ctx.fillText(tr('KNOCK')+' '+Math.round(state.knockRisk),px(420+(Math.random()-0.5)*j*4),py(16));   // in the title bar, clear of the output
    ctx.textAlign='left';
  }

  // ---- the whole bank, small: every cylinder at its real phase ----
  const bx0=396,by0=132,bw=200,bh=150;
  ctx.fillStyle='#10101a';ctx.fillRect(px(bx0),py(by0),bw*S,bh*S);
  ctx.strokeStyle=C.metal;ctx.lineWidth=LW(1.2);ctx.strokeRect(px(bx0),py(by0),bw*S,bh*S);
  ctx.fillStyle=C.metal;ctx.font=F(6.5);
  const layoutTxt=engine.cylinders+'-CYL '+(LAYOUT_LABEL[engine.layout]||'')+'  '+engine.displacement_L.toFixed(engine.displacement_L<1?2:1)+'L';
  ctx.fillText(layoutTxt,px(bx0+8),py(by0+14));
  const vee=engine.layout==='v'||engine.layout==='boxer';
  const perBank=vee?Math.ceil(nCyl/2):nCyl;
  const slotW=Math.min(26,(bw-24)/perBank), cylTop=by0+30, cylH=vee?40:60;
  const order=firingOrder(engine.layout,nCyl);
  for(let b=0;b<(vee?2:1);b++){
    for(let i=0;i<perBank;i++){
      const idx=b*perBank+i; if(idx>=nCyl)break;
      const sx=bx0+12+i*slotW, sy=cylTop+b*(cylH+14);
      const ph=cylPhase(idx,nCyl,Math.PI*(two?2:4),order);
      const f=pistonFrac(ph*(two?2:1),rodRatio);
      ctx.fillStyle='#0c0c14';ctx.fillRect(px(sx),py(sy),(slotW-5)*S,cylH*S);
      // firing cylinder glows
      const pd=(ph*180/Math.PI)%(two?360:720);
      const firing=!state.blown&&state.powerHP>1&&pd>(two?170:340)&&pd<(two?230:430);
      ctx.fillStyle=firing?'#ffcc44':'#1b3a55';
      ctx.fillRect(px(sx+1),py(sy+1),(slotW-7)*S,Math.max(2,f*cylH*0.42)*S);
      ctx.fillStyle=state.blown?'#5a5a3a':C.piston;
      ctx.fillRect(px(sx+1),py(sy+2+f*cylH*0.42),(slotW-7)*S,10*S);
      ctx.strokeStyle=C.metal;ctx.lineWidth=LW(1);ctx.strokeRect(px(sx),py(sy),(slotW-5)*S,cylH*S);
      // Cylinder number above the bore, lit while that cylinder fires so the order can be read off
      // the drawing as it runs.
      ctx.fillStyle=firing?'#ffcc44':'#9ab';ctx.font=F(slotW<18?5:6);ctx.textAlign='center';
      ctx.fillText(String(idx+1),px(sx+(slotW-5)/2),py(sy-3));ctx.textAlign='left';
    }
  }
  ctx.fillStyle='#778';ctx.font=F(6);
  // A V12's order is 26 characters; shrink the caption to the box rather than run off its edge.
  const foTxt=tr('FIRING ORDER')+' '+order.join('-');
  let foSize=6;while(foSize>3.5&&ctx.measureText(foTxt).width>(bw-14)*S){foSize-=0.5;ctx.font=F(foSize);}
  ctx.fillText(foTxt,px(bx0+8),py(by0+bh-14));ctx.font=F(6);
  ctx.fillText(engine.ports?tr('PORTS'):e.cam.toUpperCase()+(e.vvt?'+VVT':''),px(bx0+8),py(by0+bh-5));

  drawTempGauges(px,py,S,F,LW,bx0,by0+bh,bw);

  drawFuelSpark(px,py,S,F,m);
}

// Small labelled bar with warn/danger thresholds — legible where a 6 px number was not.
function gaugeBar(px,py,S,F,LW,x,y,w,label,val,lo,hi,warn,danger){
  const f=clamp((val-lo)/(hi-lo),0,1);
  ctx.fillStyle='#778';ctx.font=F(6);ctx.fillText(label,px(x),py(y-2));
  ctx.fillStyle='#1a1a28';ctx.fillRect(px(x),py(y),w*S,9*S);
  ctx.fillStyle=val>danger?C.red:val>warn?C.yellow:C.green;
  ctx.fillRect(px(x),py(y),w*f*S,9*S);
  ctx.fillStyle='#cde';ctx.font=F(6);ctx.textAlign='right';
  ctx.fillText(Math.round(val)+'C',px(x+w-3),py(y+7));ctx.textAlign='left';
}

// ---- Wankel ----
// The housing is a true two-lobe epitrochoid, x = R·cosθ + e·cos3θ, y = R·sinθ + e·sin3θ, and the
// rotor is an equilateral triangle whose apexes sit at radius R from a centre that orbits the
// housing centre at radius e. That geometry is what forces the 3:1 relationship: the eccentric
// shaft turns three times for every one turn of the rotor, which is why a 1.3 L rotary sounds and
// revs like something far smaller than its torque suggests.
// The Wankel, drawn with the same instruments as a piston engine. The housing is a true two-lobe
// epitrochoid, x = R·cosθ + e·cos3θ, y = R·sinθ + e·sin3θ, and the rotor's centre orbits the shaft
// at radius e three times for every turn of the rotor — which is what forces the 3:1 relationship.
//
// WHERE THINGS ARE. The chamber reaches minimum volume at the housing's two WAISTS (the minor axis),
// so a Wankel has two "top dead centres": one between exhaust and intake, where the ports sit, and
// one between compression and power, where the spark plugs sit. This used to draw the ports at the
// end of the long axis, which is where a chamber is at its LARGEST. Ports are now at the top waist —
// which also lines them up with the intake and exhaust tracts the piston view uses — and the plugs at
// the bottom one. The rotor turns anticlockwise on screen, so a face goes intake (left lobe) →
// compression → fires at the bottom waist → power (right lobe) → exhaust → back to the top.
// Every phase happens at a FIXED PLACE in the housing, which is the thing worth seeing, so the four
// are labelled where they happen and each chamber is coloured by what is in it, with the same
// colours as the piston chamber.
const ROTARY_PHASE_COL={intake:'#12304a',compression:'#1b3a55',power:'#5a2a18',exhaust:'#3a2420'};
function rotaryFacePhase(faceAng){
  // faceAng: direction of a face's midpoint from the housing centre, canvas radians (y down).
  const d=((faceAng*180/Math.PI)%360+360)%360;
  return d>=180&&d<270?'intake':d>=90&&d<180?'compression':d<90?'power':'exhaust';
}
function drawRotorAt(px,py,S,LW,cx,cy,R,ecc,theta,opts){
  // theta: rotor angle, already in screen sense. Apex i sits on the housing at parameter theta+i·120°.
  const ex=cx+ecc*Math.cos(3*theta), ey=cy+ecc*Math.sin(3*theta);
  const apexA=i=>theta+i*2.0944;
  const hp=a=>({x:cx+R*Math.cos(a)+ecc*Math.cos(3*a),y:cy+R*Math.sin(a)+ecc*Math.sin(3*a)});
  let firing=false;
  for(let i=0;i<3;i++){
    const a0=apexA(i),a1=apexA(i+1),mid=hp((a0+a1)/2);
    const ph=rotaryFacePhase(Math.atan2(mid.y-cy,mid.x-cx));
    const fireNow=ph==='power'&&Math.abs(Math.atan2(mid.y-cy,mid.x-cx)-Math.PI/2)<0.35;
    if(fireNow)firing=true;
    if(opts.fill){
      ctx.fillStyle=fireNow&&opts.burning?'#ffcc44':ROTARY_PHASE_COL[ph];
      ctx.beginPath();
      for(let a=a0;a<=a1+1e-6;a+=0.06){const p=hp(a);a===a0?ctx.moveTo(px(p.x),py(p.y)):ctx.lineTo(px(p.x),py(p.y));}
      const p1=hp(a1),p0=hp(a0);ctx.lineTo(px(p1.x),py(p1.y));ctx.lineTo(px(p0.x),py(p0.y));ctx.closePath();ctx.fill();
    }
  }
  ctx.fillStyle=state.blown?'#5a5a3a':C.piston;ctx.beginPath();
  for(let i=0;i<3;i++){const p=hp(apexA(i));i?ctx.lineTo(px(p.x),py(p.y)):ctx.moveTo(px(p.x),py(p.y));}
  ctx.closePath();ctx.fill();
  ctx.strokeStyle=C.metalLight;ctx.lineWidth=LW(opts.small?1:1.5);ctx.stroke();
  if(!opts.small){
    ctx.fillStyle='#e8e8f0';
    for(let i=0;i<3;i++){const p=hp(apexA(i));ctx.beginPath();ctx.arc(px(p.x),py(p.y),2.4*S,0,6.284);ctx.fill();}
    ctx.strokeStyle='#3a3a4e';ctx.lineWidth=LW(2);
    ctx.beginPath();ctx.arc(px(cx),py(cy),ecc*S,0,6.284);ctx.stroke();
    ctx.fillStyle=C.metalLight;ctx.beginPath();ctx.arc(px(ex),py(ey),9*S,0,6.284);ctx.fill();
    ctx.fillStyle='#0c0c14';ctx.beginPath();ctx.arc(px(cx),py(cy),4*S,0,6.284);ctx.fill();
  }
  return firing;
}
function drawHousing(px,py,LW,cx,cy,R,ecc,lw){
  ctx.fillStyle='#15151f';ctx.beginPath();
  for(let a=0;a<=6.2832;a+=0.04){
    const x=cx+R*Math.cos(a)+ecc*Math.cos(3*a), y=cy+R*Math.sin(a)+ecc*Math.sin(3*a);
    a?ctx.lineTo(px(x),py(y)):ctx.moveTo(px(x),py(y));
  }
  ctx.closePath();ctx.fill();ctx.strokeStyle=C.metal;ctx.lineWidth=LW(lw);ctx.stroke();
}
function drawRotaryCutaway(px,py,S,F,LW,dt,m){
  const e=engine;
  // R/e is 7 on a real Wankel, which makes the lobing almost invisible at this size; 5.5 keeps
  // the shape honest while letting you actually see it is not a circle.
  const cx=236,cy=176,R=72,ecc=R/5.5;
  const topW=cy-(R-ecc), botW=cy+(R-ecc);             // the two waists
  const theta=-rotorAngle;                            // anticlockwise on screen
  drawHousing(px,py,LW,cx,cy,R,ecc,2);
  const burning=flashT>0;
  const fires=drawRotorAt(px,py,S,LW,cx,cy,R,ecc,theta,{fill:true,burning});
  if(!state.blown&&state.powerHP>1&&flashT<=0&&fires)flashT=0.09;
  // spark plugs at the bottom waist — a leading and a trailing plug, as on a 13B
  ctx.strokeStyle=burning?'#fff2a8':'#8898aa';ctx.lineWidth=LW(2.5);
  for(const dx of [-10,10]){ctx.beginPath();ctx.moveTo(px(cx+dx),py(botW));ctx.lineTo(px(cx+dx),py(botW+14));ctx.stroke();}
  if(burning){ctx.fillStyle='#fff2a8';ctx.beginPath();ctx.arc(px(cx),py(botW-6),7*S,0,6.284);ctx.fill();}
  // ports at the top waist, fed by the same intake and exhaust tracts as the piston view
  const portYc=74, inX=cx-26, exX=cx+26;
  drawIntakeSide(px,py,S,F,LW,m,portYc,inX,{x:cx,y:cy});
  ctx.strokeStyle=C.intake;ctx.lineWidth=LW(8);
  ctx.beginPath();ctx.moveTo(px(inX),py(portYc));ctx.lineTo(px(inX),py(topW+4));ctx.stroke();
  drawExhaustSide(px,py,S,F,LW,m,portYc,exX);
  const exHot=clamp(state.powerHP/Math.max(60,engine.score?engine.score.peakHP:200),0,1);
  ctx.strokeStyle=state.blown?'#444':`rgb(${Math.round(120+120*exHot)},${Math.round(60+30*exHot)},40)`;
  ctx.lineWidth=LW(7);
  ctx.beginPath();ctx.moveTo(px(exX),py(portYc));ctx.lineTo(px(exX),py(topW+4));ctx.stroke();
  // where each phase happens — fixed in the housing, unlike a piston engine
  ctx.font=F(6);
  const lab=(t,x,y,col,al)=>{ctx.fillStyle=col;ctx.textAlign=al;ctx.fillText(tr(t),px(x),py(y));};
  lab('INTAKE',cx-R-ecc-4,cy-14,'#5aa0d0','right');
  lab('COMPRESSION',cx-56,botW+22,'#7fa8c8','right');
  lab('POWER',cx+56,botW+22,'#e0905a','left');
  lab('EXHAUST',cx+34,topW-8,'#c07050','left');   // by its port: the turbo sits beyond the housing (build 164)
  ctx.textAlign='left';
  // breathing column, as on the piston view
  const labX=60;
  ctx.font=F(6);ctx.fillStyle='#778';ctx.fillText(tr('BREATHING'),px(labX),py(130));
  ctx.font=F(7);ctx.fillStyle='#cde';ctx.fillText('VE '+(state.ve*100).toFixed(0)+'%',px(labX),py(142));
  ctx.font=F(6);ctx.fillStyle='#778';ctx.fillText(tr('PORTS'),px(labX),py(154));
  // output on the eccentric shaft
  drawShaftOutput(px,py,F,cx,botW+44,tr('AT THE SHAFT'));
  // ---- the rotor bank: every rotor at its own phase, numbered, lit as it fires ----
  const n=Math.max(1,e.cylinders);
  const bx0=396,by0=132,bw=200,bh=150;
  ctx.fillStyle='#10101a';ctx.fillRect(px(bx0),py(by0),bw*S,bh*S);
  ctx.strokeStyle=C.metal;ctx.lineWidth=LW(1.2);ctx.strokeRect(px(bx0),py(by0),bw*S,bh*S);
  ctx.fillStyle=C.metal;ctx.font=F(6.5);
  ctx.fillText(n+'-ROTOR WANKEL  '+e.displacement_L.toFixed(2)+'L',px(bx0+8),py(by0+14));
  // Rotors sit on an eccentric shaft with their lobes 360/n degrees apart, so they fire evenly, one
  // every 360/n degrees of SHAFT rotation, in sequence along the shaft.
  const slot=(bw-16)/n, r=Math.min(26,slot*0.40), ee=r/5.5;
  const order=Array.from({length:n},(_,i)=>i+1);
  for(let k=0;k<n;k++){
    const mx=bx0+8+slot*(k+0.5), my=by0+70;
    drawHousing(px,py,LW,mx,my,r,ee,1);
    const fk=drawRotorAt(px,py,S,LW,mx,my,r,ee,-(rotorAngle-k*(2*Math.PI/n)/3),{fill:true,small:true,burning:true});
    const lit=fk&&!state.blown&&state.powerHP>1;
    ctx.fillStyle=lit?'#ffcc44':'#9ab';ctx.font=F(6);ctx.textAlign='center';
    ctx.fillText(String(k+1),px(mx),py(my-r-8));ctx.textAlign='left';
  }
  ctx.fillStyle='#778';ctx.font=F(6);
  ctx.fillText(tr('FIRING ORDER')+' '+order.join('-'),px(bx0+8),py(by0+bh-14));
  ctx.fillText(tr('ROTOR TURNS AT 1/3 SHAFT SPEED'),px(bx0+8),py(by0+bh-5));
  drawTempGauges(px,py,S,F,LW,bx0,by0+bh,bw);
  drawFuelSpark(px,py,S,F,m);
}
