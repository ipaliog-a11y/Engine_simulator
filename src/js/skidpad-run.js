// ====== SKID PAD (build 367) ======
// Steady cornering on a 200 ft (61 m) diameter circle, the pad Motor Trend and Road & Track report their skidpad g on
// (Car and Driver uses a 300 ft circle). The magazines time laps at the highest speed the car holds on the circle and
// give g = v²/(g·R) with v = 2πR / lap time; so does this. Physics: stepCar driven by driveDriver round a closed line
// (it wraps), counter-clockwise; the car is symmetric, so the other direction gives the same figure.
//
// One run at speed v: the car starts on the circle at v with the yaw rate v/R, settles for one lap, and is judged on
// the next. Outcomes (worst first):
//   SPIN   body slip β over 25°, or heading more than 90° off the circle
//   WIDE   the CG more than SKID_TOL outside the circle (pushed wide: understeer at the limit)
//   TIGHT  the CG more than SKID_TOL inside it (the tail stepped out and tucked the nose in)
//   SLOW   on the line, but the judged lap not finished in time
//   HOLD   none of these: the car holds the circle at its own steady speed
// driveDriver's speed loop is proportional (1/s), so the car settles a little under v, short by the tyres' cornering
// drag; v only drives the search. The score is the judged lap's own time, as on a real pad.
// SKID_TOL (1 m either side) is this game's lane, not a standard: the magazines' drivers keep to a painted circle.
const SKID_D=60.96,SKID_R=SKID_D/2,SKID_TOL=1;
const SKID_RANK={HOLD:0,SLOW:1,TIGHT:2,WIDE:3,SPIN:4};
function skidLine(R,v){
  const N=Math.round(2*Math.PI*R/0.5),line=[];
  for(let k=0;k<N;k++){const a=-Math.PI/2+2*Math.PI*k/N;line.push({x:R*Math.cos(a),y:R+R*Math.sin(a),v,grade:0,kv:0});}
  return line;
}
function skidRun(car,v,sample){
  const R=SKID_R,line=skidLine(R,v),g=DRIVE_G;
  const s=driveState(car),d={i:0};
  s.vx=v;s.yaw=v/R;s.w=s.w.map(()=>v/car.r);
  for(let k=car.ratios.length;k>=1;k--){s.gear=k;if(v/car.r*car.ratios[k-1]*car.fd*30/Math.PI>=2500)break;}
  s.we=v/car.r*car.ratios[s.gear-1]*car.fd;
  const o={v,eMax:0,eMin:0,betaMax:0,ayMean:0,lapT:0,vMean:0,steer:0,samples:sample?[]:null,line,R};
  const dt=0.005,tMax=4*2*Math.PI*R/Math.max(3,v)+5;
  let ang=0,pa=-Math.PI/2,judging=false,tJ=0,ayS=0,vS=0,stS=0,n=0,nextT=0,spin=false;
  while(s.t<tMax){
    const u=driveDriver(car,s,line,d);
    stepCar(car,s,u,dt);
    const a=Math.atan2(s.y-R,s.x);let da=a-pa;while(da>Math.PI)da-=2*Math.PI;while(da<-Math.PI)da+=2*Math.PI;ang+=da;pa=a;
    const beta=Math.atan2(s.vy,Math.max(0.5,s.vx));
    let dh=s.psi-(a+Math.PI/2);dh-=2*Math.PI*Math.round(dh/(2*Math.PI));
    if(Math.abs(beta)>25*Math.PI/180||Math.abs(dh)>Math.PI/2){spin=true;}
    if(!judging&&ang>=2*Math.PI){judging=true;tJ=s.t;}
    if(judging){
      const e=R-Math.hypot(s.x,s.y-R);   // + inside the circle
      o.eMax=Math.max(o.eMax,e);o.eMin=Math.min(o.eMin,e);o.betaMax=Math.max(o.betaMax,Math.abs(beta));
      ayS+=Math.abs(s.ayF);vS+=s.speed;stS+=Math.abs(s.delta||0);n++;
      if(sample&&s.t>=nextT){
        o.samples.push({t:s.t,x:s.x,y:s.y,psi:s.psi,v:s.speed,beta,yaw:s.yaw,delta:s.delta||0,thr:u.throttle,brk:u.brake||0,
          gear:s.gear,rpm:s.rpm,ax:s.ax||0,ay:s.ay||0,e});
        nextT=s.t+0.04;
      }
      if(ang>=4*Math.PI){o.lapT=s.t-tJ;break;}
      if(!sample&&(o.eMin<-SKID_TOL||o.eMax>SKID_TOL))break;
    }
    if(spin)break;
  }
  o.ayMean=n?ayS/n/g:0;o.vMean=n?vS/n:0;o.steer=n?stS/n:0;
  o.outcome=spin?'SPIN':!o.lapT&&!(o.eMin<-SKID_TOL||o.eMax>SKID_TOL)?'SLOW'
    :o.eMin<-SKID_TOL?'WIDE':o.eMax>SKID_TOL?'TIGHT':'HOLD';
  o.ok=o.outcome==='HOLD';
  // the magazines' figure: the judged lap's time at the circle's radius
  o.gLap=o.lapT>0?4*Math.PI*Math.PI*R/(g*o.lapT*o.lapT):0;
  return o;
}
// The highest speed held: bracket around the tyres' own sqrt(μ g R), then bisect to 0.05 m/s. The held speed need
// not be monotone in v (an aid or a gear change can bite at one speed only); bisection takes the first edge it finds.
function skidBest(car){
  const v0=Math.sqrt((car.mu||0.9)*DRIVE_G*SKID_R);
  let lo=0.6*v0,hi=1.3*v0;
  while(lo>3&&!skidRun(car,lo).ok)lo*=0.8;
  if(!(lo>3))return null;
  while(skidRun(car,hi).ok&&hi<80)hi*=1.2;
  while(hi-lo>0.05){const m=(lo+hi)/2;if(skidRun(car,m).ok)lo=m;else hi=m;}
  return lo;
}
function simulateSkidpadChallenge(){
  const pt=powertrain();if(!pt.ready()||!vehicle.mass)return null;
  const car=driveCar(),v=skidBest(car);
  if(!v)return{ok:false,reason:'no-hold',kind:'skidpad'};
  const R=skidRun(car,v,true),F=skidRun(car,v+1/3.6);   // how it fails 1 km/h faster (target speed)
  const D=typeof mooseDims==='function'?mooseDims():{w:(car.tF+car.tR)/2+0.3,ovF:0.35*(car.a+car.b),ovR:0.35*(car.a+car.b)};
  return{ok:true,kind:'skidpad',outcome:R.outcome,speedKmh:R.vMean*3.6,targetKmh:v*3.6,gLap:R.gLap,ayMean:R.ayMean,lapT:R.lapT,
    betaMax:R.betaMax*180/Math.PI,steerDeg:R.steer*180/Math.PI,eMin:R.eMin,eMax:R.eMax,failBy:F.outcome,
    radius:SKID_R,tol:SKID_TOL,samples:R.samples,trackW:D.w,body:{f:car.a+D.ovF,r:car.b+D.ovR},drive:car.drive};
}
