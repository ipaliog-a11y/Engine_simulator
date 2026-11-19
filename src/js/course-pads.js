// ====== SPIRAL SKID PAD AND FIGURE 8 (build 390) ======
// Two courses for the same stepped car and driver as the skid pad (skidpad-run.js). The lane is that pad's
// SKID_TOL (1 m either side of the line: this game's lane, not a standard). Outcomes use its words:
//   SPIN   body slip β over 25°, or the nose more than 90° off the line
//   WIDE   the CG more than SKID_TOL to the right of the line (on the spiral, the outside)
//   TIGHT  more than SKID_TOL to the left (on the spiral, toward the centre)
//   SLOW   still in the lane, but the course not finished in time
//   HOLD   none of these
// driveDriver's speed loop is proportional, so the car sits a little under a rising target. ESC stays as the car is set.
//
// SPIRAL. An Archimedean spiral r = r0 + b θ (the circle is the case b = 0), one turn, counter-clockwise.
// The outer radius is the skid pad's own (SKID_R, a 200 ft circle). The inner radius is 12 m: a 2.9 m wheelbase
// (the grand-tourer chassis) at the model's steering lock, δ = 8.5/steerRatio from 2.7 turns lock to lock
// (driveCar, probable), has an Ackermann radius L/tan δ ≈ 4.6 m, and 12 m asks L/ρ ≈ 0.25 rad of road wheel,
// under half that lock, so the stop is not what ends the run. The local radius of curvature is
// ρ = (r² + b²)^(3/2) / (r² + 2 b²). The line's speed is sqrt(ay · ρ): the same lateral demand all the way,
// and a faster bend as it opens. ay is searched. A short lead-in at the inner curvature lets the tyres and
// the roll settle before the spiral is judged.
//
// FIGURE 8. Bernoulli's lemniscate, (x² + y²)² = 2 c² (x² − y²), in the form
// x = a cos t / (1 + sin² t), y = a sin t cos t / (1 + sin² t). Curvature is 0 at the crossing and
// tightest at the two outer vertices, where ρ = a/3. a is chosen so that bend is half the skid pad's
// radius (SKID_R/2): one loop each way, the crossing straight, the highest constant speed that stays in the lane.
const SPIRAL_R0=12,SPIRAL_TURNS=1;
const FIG8_RHO=SKID_R/2,FIG8_A=3*FIG8_RHO;
let spiralGeom=null,fig8Geom=null;
function arcLead(p,dist){
  const ds=0.5;let X=p.x,Y=p.y,P=p.psi+Math.PI,K=-p.kap,raw=[[X,Y]],n=Math.ceil(dist/ds);
  for(let i=0;i<n;i++){P+=K*ds;X+=Math.cos(P)*ds;Y+=Math.sin(P)*ds;raw.push([X,Y]);}
  raw.reverse();const line=[];
  for(let i=0;i<raw.length-1;i++){const a=raw[i],b=raw[i+1];
    line.push({x:a[0],y:a[1],v:p.v,grade:0,kv:0,psi:Math.atan2(b[1]-a[1],b[0]-a[0]),kap:p.kap});}
  return line;
}
function spiralGeomBuild(){
  const r0=SPIRAL_R0,r1=SKID_R,Th=SPIRAL_TURNS*2*Math.PI,b=(r1-r0)/Th,th0=-Math.PI/2,ds=0.5;
  const rho=r=>{const r2=r*r,b2=b*b;return Math.pow(r2+b2,1.5)/(r2+2*b2);};
  const at=th=>{const r=r0+b*th,ph=th0+th,dx=b*Math.cos(ph)-r*Math.sin(ph),dy=b*Math.sin(ph)+r*Math.cos(ph),rc=rho(r);
    return {x:r*Math.cos(ph),y:r*Math.sin(ph),v:Math.sqrt(rc),grade:0,kv:0,psi:Math.atan2(dy,dx),kap:1/rc};};
  const course=[];let th=0;
  while(th<Th){course.push(at(th));th+=ds/Math.hypot(r0+b*th,b);}
  course.push(at(Th));
  const ext=[];let thE=Th,e=0;
  while(e<30){const r=r0+b*thE;thE+=ds/Math.hypot(r,b);e+=ds;ext.push(at(thE));}
  const lead=arcLead(course[0],20),course0=lead.length,end=lead.length+course.length;
  return {line:lead.concat(course,ext),course0,end,rho0:rho(r0),rho1:rho(r1),b};
}
function fig8Point(a,t){
  const s=Math.sin(t),c=Math.cos(t),d=1+s*s;
  return {x:a*c/d,y:a*s*c/d};
}
function fig8Frame(a,t){
  const dt=1e-4,p=fig8Point(a,t),p1=fig8Point(a,t+dt),m=fig8Point(a,t-dt);
  const xp=(p1.x-m.x)/(2*dt),yp=(p1.y-m.y)/(2*dt),xpp=(p1.x-2*p.x+m.x)/(dt*dt),ypp=(p1.y-2*p.y+m.y)/(dt*dt);
  const sp=Math.hypot(xp,yp)||1e-9;
  return {x:p.x,y:p.y,v:1,grade:0,kv:0,psi:Math.atan2(yp,xp),kap:(xp*ypp-yp*xpp)/(sp*sp*sp),sp};
}
function fig8GeomBuild(){
  const a=FIG8_A,ds=0.5,pts=[];
  for(let t=-Math.PI;t<Math.PI-1e-4;){const f=fig8Frame(a,t);pts.push(f);t+=ds/f.sp;}
  const leadN=Math.round(pts.length*0.28),lead=pts.slice(pts.length-leadN),ext=pts.slice(0,70);
  const course0=lead.length,end=lead.length+pts.length;
  return {line:lead.concat(pts,ext),course0,end,rho:FIG8_RHO,a};
}
function courseScaled(G,k){
  return {line:G.line.map(p=>({x:p.x,y:p.y,v:p.v*k,grade:0,kv:0,psi:p.psi,kap:p.kap})),course0:G.course0,end:G.end};
}
function coursePlace(car,s,p){
  s.x=p.x;s.y=p.y;s.psi=p.psi;s.vx=p.v;s.vy=0;s.yaw=p.v*(p.kap||0);
  s.w=s.w.map(()=>p.v/Math.max(0.2,car.r));
  const ratios=car.ratios.length?car.ratios:[1];s.gear=1;
  for(let k=ratios.length;k>=1;k--){s.gear=k;if(p.v/car.r*ratios[k-1]*car.fd*30/Math.PI>=2500)break;}
  s.we=Math.max((car.idle||0)*Math.PI/30,p.v/car.r*ratios[s.gear-1]*car.fd);
}
// Follow `line`: a lead-in, the judged course [course0, end), then a tail so the driver's lookahead,
// which wraps, never lands back on the start.
function courseRun(car,line,course0,end,sample){
  const tol=SKID_TOL,N=line.length,s=driveState(car),d={i:0},p0=line[0];
  coursePlace(car,s,p0);
  const o={eMin:0,eMax:0,betaMax:0,ayMean:0,vMean:0,vEntry:0,vExit:0,lapT:0,steer:0,samples:sample?[]:null};
  const dt=0.005,vRef=Math.max(4,line[course0].v),tMax=(end*0.5)/vRef*2.2+6;
  let ayS=0,vS=0,stS=0,n=0,enS=0,enN=0,exS=0,exN=0,nextT=0,spin=false,done=false;
  const span=Math.max(1,end-course0),entryTo=course0+Math.max(3,Math.round(span*0.08)),exitFrom=end-Math.max(3,Math.round(span*0.1));
  while(s.t<tMax){
    const u=driveDriver(car,s,line,d);stepCar(car,s,u,dt);
    const i=Math.min(N-2,d.i||0),pA=line[i],pB=line[i+1],hp=Math.atan2(pB.y-pA.y,pB.x-pA.x);
    const e=-(s.x-pA.x)*Math.sin(hp)+(s.y-pA.y)*Math.cos(hp);
    let dh=s.psi-hp;dh-=2*Math.PI*Math.round(dh/(2*Math.PI));
    const beta=Math.atan2(s.vy,Math.max(0.5,s.vx));
    if(Math.abs(beta)>25*Math.PI/180||Math.abs(dh)>Math.PI/2)spin=true;
    const judged=i>=course0&&i<end;
    if(judged){
      o.eMax=Math.max(o.eMax,e);o.eMin=Math.min(o.eMin,e);o.betaMax=Math.max(o.betaMax,Math.abs(beta));
      ayS+=Math.abs(s.ayF);vS+=s.speed;stS+=Math.abs(s.delta||0);n++;
      if(i<entryTo){enS+=s.speed;enN++;}
      if(i>=exitFrom){exS+=s.speed;exN++;}
      if(sample&&s.t>=nextT){
        o.samples.push({t:s.t,x:s.x,y:s.y,psi:s.psi,v:s.speed,beta,yaw:s.yaw,delta:s.delta||0,thr:u.throttle,brk:u.brake||0,
          gear:s.gear,rpm:s.rpm,ax:s.ax||0,ay:s.ay||0,e,alpha:s.alpha.slice()});
        nextT=s.t+0.04;
      }
    }
    if(i>=end){done=true;o.lapT=s.t;break;}
    if(spin)break;
    if(!sample&&judged&&(o.eMin<-tol||o.eMax>tol))break;
    if(s.t>3&&s.speed<0.8)break;
  }
  o.ayMean=n?ayS/n/DRIVE_G:0;o.vMean=n?vS/n:0;o.steer=n?stS/n:0;
  o.vEntry=enN?enS/enN:o.vMean;o.vExit=exN?exS/exN:o.vMean;
  o.outcome=spin?'SPIN':o.eMin<-tol?'WIDE':o.eMax>tol?'TIGHT':!done?'SLOW':'HOLD';
  o.ok=o.outcome==='HOLD';
  return o;
}
function coursePack(car,R,line,course0,end){
  const D=typeof mooseDims==='function'?mooseDims():{w:(car.tF+car.tR)/2+0.3,ovF:0.35*(car.a+car.b),ovR:0.35*(car.a+car.b)};
  R.samples=R.samples||[];
  R.line=line.slice(course0,end);
  R.trackW=D.w;R.body={f:car.a+D.ovF,r:car.b+D.ovR};R.drive=car.drive;R.mu=car.mu;R.tol=SKID_TOL;
  R.betaMax*=180/Math.PI;R.steerDeg=R.steer*180/Math.PI;
  R.entryKmh=R.vEntry*3.6;R.exitKmh=R.vExit*3.6;R.speedKmh=R.vMean*3.6;
  return R;
}
function spiralBest(car){
  if(!spiralGeom)spiralGeom=spiralGeomBuild();
  const g0=(car.mu||0.9)*DRIVE_G,run=ay=>courseRun(car,courseScaled(spiralGeom,Math.sqrt(Math.max(0.2,ay))).line,spiralGeom.course0,spiralGeom.end,false);
  let lo=0.45*g0,hi=1.05*g0;
  while(lo>1.2&&!run(lo).ok)lo*=0.82;
  if(!(lo>1.2))return null;
  while(run(hi).ok&&hi<1.7*g0)hi*=1.08;
  while(hi-lo>0.04){const m=(lo+hi)/2;if(run(m).ok)lo=m;else hi=m;}
  return lo;
}
function simulateSpiralChallenge(){
  const pt=powertrain();if(!pt.ready()||!vehicle.mass)return null;
  if(!spiralGeom)spiralGeom=spiralGeomBuild();
  const car=driveCar(),ay=spiralBest(car);
  if(!ay)return {ok:false,reason:'no-hold',kind:'spiral'};
  const G=spiralGeom,Sc=courseScaled(G,Math.sqrt(ay)),R=courseRun(car,Sc.line,G.course0,G.end,true);
  const v1=Math.sqrt(ay*G.rho1),ayFail=Math.pow(v1+1/3.6,2)/G.rho1,F=courseRun(car,courseScaled(G,Math.sqrt(ayFail)).line,G.course0,G.end,false);
  coursePack(car,R,Sc.line,G.course0,G.end);
  R.ok=R.outcome==='HOLD';R.kind='spiral';R.failBy=F.outcome;R.gExit=R.vExit*R.vExit/(DRIVE_G*G.rho1);
  R.r0=SPIRAL_R0;R.r1=SKID_R;R.rho1=G.rho1;R.ayTarget=ay/DRIVE_G;
  return R;
}
function fig8Best(car){
  if(!fig8Geom)fig8Geom=fig8GeomBuild();
  const v0=Math.sqrt((car.mu||0.9)*DRIVE_G*FIG8_RHO),run=v=>courseRun(car,courseScaled(fig8Geom,v).line,fig8Geom.course0,fig8Geom.end,false);
  let lo=0.5*v0,hi=1.05*v0;
  while(lo>3&&!run(lo).ok)lo*=0.82;
  if(!(lo>3))return null;
  while(run(hi).ok&&hi<50)hi*=1.08;
  while(hi-lo>0.06){const m=(lo+hi)/2;if(run(m).ok)lo=m;else hi=m;}
  return lo;
}
function simulateFig8Challenge(){
  const pt=powertrain();if(!pt.ready()||!vehicle.mass)return null;
  if(!fig8Geom)fig8Geom=fig8GeomBuild();
  const car=driveCar(),v=fig8Best(car);
  if(!v)return {ok:false,reason:'no-hold',kind:'fig8'};
  const G=fig8Geom,Sc=courseScaled(G,v),R=courseRun(car,Sc.line,G.course0,G.end,true);
  const F=courseRun(car,courseScaled(G,v+1/3.6).line,G.course0,G.end,false);
  coursePack(car,R,Sc.line,G.course0,G.end);
  R.ok=R.outcome==='HOLD';R.kind='fig8';R.failBy=F.outcome;R.gLap=R.vMean*R.vMean/(DRIVE_G*G.rho);R.rho=G.rho;R.a=G.a;
  return R;
}
