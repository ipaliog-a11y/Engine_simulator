// ====== ECONOMY CHALLENGE: min fuel on an open road at a target time (build 341) ======
// Standing start, open centreline, no racing-line optimiser. Min-time first; target =
// timeFactor × that car's Tmin (eco-rally style: use the allotted time, do not rush). A speed
// cap on the open solve hits the target; fuel from engineFuelAt (warm oil), same map as WLTP.
// Named gap: speed cap is not optimal lift-coast DP. (A pure "finish by T" limit would pick
// flat-out here: hard braking is fuel-cut, so slower paced profiles often burn more.)
function ecoMinTime(line,speedCap){
  const pt=powertrain(),frontF=vv=>pt.frontForce?pt.frontForce(vv):0;
  if(!pt.ready()||!vehicle.mass)return null;
  const p=line,n=p.length;
  const curve=pt.torqueCurve();
  const tqAt=rpm=>{if(rpm<=curve[0].rpm)return curve[0].tq;for(let i=1;i<curve.length;i++){if(rpm<=curve[i].rpm){const a=curve[i-1],b=curve[i];return a.tq+(b.tq-a.tq)*(rpm-a.rpm)/(b.rpm-a.rpm);}}return curve[curve.length-1].tq;};
  const m=vehicle.mass,rT=vehicle.rTire,fd=vehicle.finalDrive,eff=vehicle.driveEff,ratios=vehicle.ratios;
  const idle=pt.idleRpm(),rl=pt.maxRpm(),TWO_PI=Math.PI*2;
  const df=vehicle.df||DIFF.open,dCorner=df.corner!=null?df.corner:1;
  const muLatAt=(N,ay,vv,q)=>latBalance(N,ay,down(vv),0,vv,q).mu*dCorner;
  const axleTqMax=Math.max(1,curve.reduce((a,q)=>Math.max(a,q.tq),0)*ratios[0]*fd*(vehicle.gb&&vehicle.gb.mult||1));
  const down=v=>0.5*AIR_RHO*vehicle.clA*v*v;
  const KVCAP=0.6*m*G;
  const loadAt=(q,vv)=>Math.max(m*G*0.15,m*G*q.cosT+down(vv)+clamp(m*vv*vv*q.kv,-KVCAP,KVCAP));
  const drag=v=>0.5*AIR_RHO*vehicle.cdA*v*v;
  const rollF=v=>crrAt(vehicle.crr,v)*m*G;
  const VMAX0=vehicle.governor>0?Math.min(140,vehicle.governor/3.6):140;
  const VMAX=speedCap>0?Math.min(VMAX0,speedCap):VMAX0;
  function gearAt(v){
    let bi=ratios.length-1,bf=-1,bq=0;
    for(let i=0;i<ratios.length;i++){
      const tot=ratios[i]*fd,rpm=v*tot/rT*60/TWO_PI;
      if(rpm>rl)continue;
      const f=tqAt(clamp(rpm,idle,rl))*tot*eff/rT+frontF(v);
      if(f>bf){bf=f;bi=i;bq=tqAt(clamp(rpm,idle,rl))*tot;}
    }
    return{gear:bi,F:Math.max(0,bf),tqFrac:bq/axleTqMax};
  }
  function ceilAt(q){
    let vv=0,muLat=vehicle.mu*dCorner;
    for(let outer=0;outer<3;outer++){
      for(let it=0;it<2;it++){
        const kvTerm=it===0?-m*q.kv*muLat:0;
        const extra=it===0?0:clamp(m*vv*vv*q.kv,-KVCAP,KVCAP)*muLat;
        const denom=m/q.r-0.5*AIR_RHO*vehicle.clA*muLat+kvTerm;
        const num=muLat*m*G*q.cosT+extra;
        vv=denom>1e-6?Math.min(VMAX,Math.sqrt(Math.max(0,num/denom))):VMAX;
      }
      muLat=muLatAt(loadAt(q,vv),vv*vv/q.r,vv,q);
    }
    return vv;
  }
  const hL=vehicle.cg/Math.max(0.5,vehicle.wb),sgn=vehicle.drive==='rwd'?1:vehicle.drive==='fwd'?-1:0;
  const fWt=vehicle.fWt||0.55;
  function brakeCap(q,vi0,vNext){
    let vi=Math.min(vi0,vNext);
    for(let it=0;it<3;it++){
      const N=loadAt(q,vi),ay=vi*vi/q.r;
      const B=latBalance(N,ay,down(vi),0,vi,q);
      const u=clamp(ay/Math.max(0.1,B.mu*dCorner*N/m),0,1);
      const aTyre=B.mu*dCorner*Math.sqrt(Math.max(0,1-u*u))*G*q.cosT;
      const aBrake=Math.min(vehicle.brakeDecelCap||12,aTyre)+(drag(vi)+corneringDrag(m,ay,N))/m+G*q.sinT;
      const cap=Math.sqrt(Math.max(0,vNext*vNext+2*Math.max(0.1,aBrake)*q.ds3));
      const nv=Math.min(vi0,cap);if(Math.abs(nv-vi)<1e-4)break;vi=nv;
    }
    return vi;
  }
  function accCap(q,vi){
    const N=loadAt(q,vi),dn=down(vi);
    const N0=(N-dn)*vehicle.drivenWt+dn*vehicle.drivenAero;
    const aLat=vi*vi/q.r;
    const B=latBalance(N,aLat,dn,0,vi,q);
    const uFa=clamp(m*aLat*fWt/Math.max(1,B.capF*dCorner),0,1),uRa=clamp(m*aLat*(1-fWt)/Math.max(1,B.capR*dCorner),0,1);
    const uD=vehicle.drive==='fwd'?uFa:vehicle.drive==='rwd'?uRa:Math.max(uFa,uRa);
    const bg=gearAt(vi);
    const R=(drag(vi)+rollF(vi)*q.cosT+corneringDrag(m,aLat,N))/m+G*q.sinT;
    const nD=vehicle.drive==='awd'?4:2;
    const kk=tyreMuX(N0/nD,vehicle.drive==='fwd'?vehicle.FzRefF:vehicle.FzRef)*diffTractionAt(df,aLat,vehicle.cg,bg.tqFrac,0)*Math.sqrt(Math.max(0,1-uD*uD));
    const mE=vehicleMassEff(ratios[bg.gear]*fd);
    const aGrip=(kk*N0-m*R)/(m*Math.max(0.2,1-sgn*kk*hL)),aPow=(bg.F-m*R)/mE;
    return Math.sqrt(Math.max(1,vi*vi+2*Math.min(aPow,aGrip)*q.ds3));
  }
  const vC=new Array(n);for(let i=0;i<n;i++)vC[i]=ceilAt(p[i]);
  const v=vC.slice();
  for(let pass=0;pass<2;pass++)for(let i=n-2;i>=0;i--){
    const cap=brakeCap(p[i],v[i],v[i+1]);if(cap<v[i])v[i]=cap;
  }
  v[0]=Math.min(v[0],0.5);
  for(let pass=0;pass<2;pass++)for(let i=0;i<n-1;i++){
    const cap=accCap(p[i],v[i]);if(cap<v[i+1])v[i+1]=cap;
  }
  let t=0;for(let i=0;i<n-1;i++)t+=p[i].ds3/Math.max(2,(v[i]+v[i+1])/2);
  return{v,vC,t};
}
// Fuel (kg) along a speed profile on an open line. Warm oil; economy gear pick as WLTP.
function ecoFuelKg(line,v){
  if(isElectric())return null;
  const p=line,n=p.length,m=vehicle.mass+FUEL_CYCLE.massAdd,r=vehicle.rTire,fd=vehicle.finalDrive,eff=vehicle.driveEff;
  const e=engine,C=FUEL_CYCLE,M=engineFuelMap(95),fp=FUELS[e.fuel]||FUELS.gasoline;
  const curve=powertrain().torqueCurve();
  const Tmax=rpm=>{if(rpm<=curve[0].rpm)return curve[0].tq;for(let i=1;i<curve.length;i++)if(rpm<=curve[i].rpm)return curve[i-1].tq+(curve[i].tq-curve[i-1].tq)*(rpm-curve[i-1].rpm)/(curve[i].rpm-curve[i-1].rpm);return 0;};
  const rpmMin=Math.max(e.idleRpmEff*C.idleMargin,e.ci?C.minRpmCI:C.minRpm);
  const oilT=95;let fuel=0;
  for(let i=0;i<n-1;i++){
    const ds=p[i].ds3,v0=v[i],v1=v[i+1],vm=Math.max(0.5,(v0+v1)/2),dt=ds/vm;
    const a=(v1*v1-v0*v0)/(2*Math.max(0.05,ds));
    const meff=m+(vehicle.wheelI||0)/(r*r)+(e.inertia||0.15)*(vehicle.ratios[0]*fd/r)**2;
    const F=meff*a+0.5*AIR_RHO*vehicle.cdA*vm*vm+crrAt(vehicle.crr,vm)*m*G*p[i].cosT+m*G*p[i].sinT;
    let best=null;
    for(let g=0;g<vehicle.ratios.length;g++){
      const tot=vehicle.ratios[g]*fd,rpm=vm/r*tot*60/(2*Math.PI);
      if(rpm>e.redline)continue;
      if(rpm<rpmMin&&g>0)continue;
      const rpmE=Math.max(rpm,rpmMin),w=rpmE*Math.PI/30;
      let gs;
      if(F<=0)gs=rpmE>C.cutRpm?0:M.idleGs;
      else{
        const T=F*vm/eff/w+C.auxW/w;
        if(T>C.reserve*Tmax(rpmE))continue;
        gs=engineFuelAt(rpmE,T,oilT);if(!isFinite(gs))continue;
      }
      if(!best||gs<best)best=gs;
    }
    if(best==null)best=engineFuelAt(rpmMin,Tmax(rpmMin)*C.reserve,oilT)||M.idleGs*3;
    fuel+=best*dt;
  }
  return fuel/1000;
}
function ecoTimeOf(line,v){
  let t=0;for(let i=0;i<line.length-1;i++)t+=line[i].ds3/Math.max(2,(v[i]+v[i+1])/2);return t;
}
// Eco strategy: speed-cap the open min-time solve so finish time hits the target (not early).
function simulateEconomyChallenge(roadKey){
  const road=buildRoad(roadKey||'alpine');if(!road)return null;
  if(isElectric())return{ok:false,reason:'electric',road};
  const pt=powertrain();if(!pt.ready()||!vehicle.mass)return null;
  const line=road.line,mt=ecoMinTime(line);if(!mt)return null;
  const factor=road.timeFactor||1.25,target=mt.t*factor;
  let lo=15/3.6,hi=Math.max(...mt.v)+1,best=mt;
  for(let k=0;k<18;k++){
    const mid=(lo+hi)/2,tryMt=ecoMinTime(line,mid);if(!tryMt){lo=mid;continue;}
    if(tryMt.t>target)lo=mid;else{hi=mid;best=tryMt;}
  }
  // Nudge onto the target from below: last lo still overshot, hi/best is under — prefer closest under.
  const v=best.v,time=best.t,kg=ecoFuelKg(line,v),fp=FUELS[engine.fuel]||FUELS.gasoline;
  const L=kg/fp.density,km=road.length/1000;
  const kgMin=ecoFuelKg(line,mt.v),Lmin=kgMin/fp.density;
  return{
    ok:true,road,time,limit:target,target,tMin:mt.t,pace:time/mt.t,fuelL:L,fuelKg:kg,l100:L/km*100,
    fuelLMin:Lmin,v,vMin:mt.v,lengthKm:km,factor
  };
}
