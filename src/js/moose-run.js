// ====== MOOSE AVOIDANCE (ISO 3888-2) ======
// Solved double lane change for the CHALLENGES tab. Cone geometry and search match tests/test173.mjs
// (build 277): throttle released at entry, top gear, best of smooth quintic lines, binary-search max
// entry speed with no cone touched. Width and overhangs from CAR_DIMS when the body is a known car;
// otherwise track + tyre width and a share of wheelbase for overhangs.
function mooseDims(){
  const name=(vehicle&&vehicle.body&&vehicle.body.name)||(vehicle&&vehicle.chLabel)||'';
  const p=typeof FACTORY_CARS!=='undefined'?FACTORY_CARS.find(x=>x.name===name):null;
  const D=p?carDims(p):null;
  if(D&&D.w)return{w:D.w,ovF:D.ovF,ovR:D.ovR,name:D.name,src:'dims'};
  const track=(vehicle.trackF&&vehicle.trackR)?(vehicle.trackF+vehicle.trackR)/2:(vehicle.track||1.55);
  const tw=(vehicle.tireWidth||225)/1000;
  const w=track+tw,wb=vehicle.wb||2.5;
  return{w,ovF:0.35*wb,ovR:0.35*wb,name:name||'build',src:'estimate'};
}
function mooseGates(w){
  const w1=1.1*w+0.25,w2=w+1;
  return{w1,w2,y2:w1/2+1+w2/2,y3:(3-w1)/2};
}
function mooseLine(G,v,shape){
  const [A0,A1,B0,B1]=shape,line=[];
  const sm=(x,x0,x1,y0,y1)=>{const u=Math.max(0,Math.min(1,(x-x0)/(x1-x0)));return y0+(y1-y0)*(u*u*u*(10-15*u+6*u*u));};
  for(let x=-60;x<=140;x+=0.5)line.push({x,y:x<=(A1+B0)/2?sm(x,A0,A1,0,G.y2):sm(x,B0,B1,G.y2,G.y3),v,grade:0,kv:0});
  return line;
}
function mooseConeHit(car,s,D,G){
  const b=D.w,c=Math.cos(s.psi),sn=Math.sin(s.psi);
  for(const [dx,dy] of [[car.a+D.ovF,b/2],[car.a+D.ovF,-b/2],[-car.b-D.ovR,b/2],[-car.b-D.ovR,-b/2]]){
    const X=s.x+dx*c-dy*sn,Y=s.y+dx*sn+dy*c;
    if((X>=0&&X<=12&&Math.abs(Y)>G.w1/2)||(X>=25.5&&X<=36.5&&Math.abs(Y-G.y2)>G.w2/2)||(X>=49&&X<=61&&Math.abs(Y-G.y3)>1.5))return true;
  }
  return false;
}
// After entry: ICE lifts (engine braking). EV throttle=0 is full regen — far stronger than ICE overrun — so
// Model Y / 3 / Plaid stopped before the exit (~x 40–55) and still scored clear (exit cones never reached).
// Coast = thr that zeros motor torque: T = thr·wot − (1−thr)·ov = 0.
function mooseCoastPedals(car,s,u,D){
  if(s.x+car.a+D.ovF<=0)return;
  u.brake=0;
  if(!car.ev){u.throttle=0;return;}
  const T0=driveEngine(car,0,s.rpm,null,s.soc),T1=driveEngine(car,1,s.rpm,null,s.soc);
  u.throttle=T1>T0?Math.max(0,Math.min(1,-T0/(T1-T0))):0;
}
// One pass at entry speed vk (km/h). Returns {ok,ay,beta,line} (and optional samples for a later replay).
// ok requires clearing the exit gate (x past 61) with no cone touch — not merely surviving the first two lanes.
function mooseRun(car,D,vk,shape,sample){
  const G=mooseGates(D.w),v=vk/3.6,line=mooseLine(G,v,shape);
  const s=driveState(car),d={i:0};
  s.x=-60;s.vx=v;s.w=s.w.map(()=>v/car.r);
  for(let g=car.ratios.length;g>=1;g--){s.gear=g;if(v/car.r*car.ratios[g-1]*car.fd*30/Math.PI>=2000)break;}
  s.we=v/car.r*car.ratios[s.gear-1]*car.fd;
  const o={ok:true,ay:0,beta:0,line,samples:sample?[]:null,maxX:s.x};
  let nextT=0;
  while(s.x<70&&s.t<20){
    const u=driveDriver(car,s,line,d);u.gear=s.gear;
    mooseCoastPedals(car,s,u,D);
    stepCar(car,s,u,0.005);
    o.maxX=Math.max(o.maxX,s.x);
    o.ay=Math.max(o.ay,Math.abs(s.ayF)/9.81);
    o.beta=Math.max(o.beta,Math.abs(Math.atan2(s.vy,Math.max(1,s.vx)))*180/Math.PI);
    if(mooseConeHit(car,s,D,G))o.ok=false;
    if(sample&&s.t>=nextT){
      o.samples.push({t:s.t,x:s.x,y:s.y,psi:s.psi,v:s.speed,roll:s.roll,zu:s.zu.slice(),Fz:s.Fz.slice(),Fy:s.Fy.slice(),camber:s.camber.slice(),ay:s.ayF/9.81});
      nextT=s.t+0.02;
    }
  }
  if(!(o.maxX>=61))o.ok=false;   // must pass the exit cones (49–61 m)
  return o;
}
function simulateMooseChallenge(){
  const pt=powertrain();if(!pt.ready()||!vehicle.mass)return null;
  const car=driveCar(),D=mooseDims();if(!(D.w>0))return{ok:false,reason:'width'};
  const G=mooseGates(D.w);
  let best=0,shape=null,bestRun=null;
  for(const A0 of [9,10,11])for(const A1 of [25,28])for(const B0 of [34,36]){
    const sh=[A0,A1,B0,50];
    if(!mooseRun(car,D,Math.max(40,best+1),sh).ok)continue;
    let lo=Math.max(40,best+1),hi=120;
    while(hi-lo>1){const m=(lo+hi)>>1;if(mooseRun(car,D,m,sh).ok)lo=m;else hi=m;}
    if(lo>best){best=lo;shape=sh;}
  }
  if(!shape)return{ok:false,reason:'no-clear',challenge:'moose',dims:D,cones:G};
  bestRun=mooseRun(car,D,best,shape,true);
  return{
    ok:true,kind:'moose',speedKmh:best,shape,peakAy:bestRun.ay,peakBeta:bestRun.beta,
    dims:D,cones:G,line:bestRun.line,samples:bestRun.samples||[],
    mu:car.mu,trackW:D.w
  };
}
