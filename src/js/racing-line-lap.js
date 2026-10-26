// ---- Racing line: minimum time for the car, within the track width (build 115) ----
// Nobody drives the centreline. A driver uses the full width to straighten a corner, which raises
// the radius and so the speed. The first step is the MINIMUM-CURVATURE line: hold each point on its
// own cross-track normal and move them together to the least total bending, clamped at the edge.
// Out-in-out through corners, straightened esses and linked complexes all emerge from it.
// Minimum curvature is not minimum TIME, for two reasons. It is symmetric, valuing a metre of radius at
// corner entry as much as at the exit, though exit speed is carried down whatever follows; and it pays
// no attention to distance. Until build 115 a fitted bias (3 x how open the next 90 m were) faked the
// first. Now the line is refined for the car (step 2 below), from the lap time itself.
// T = the track, margin = half the car's width (its centre may come no closer to an edge), lapOf =
// a function that solves the car's speed on a candidate line (null: minimum curvature only).
function optimiseLine(T,margin,lapOf){
  const c=T.pts,n=c.length,half=T.width/2,mg=margin||0;
  const nx=new Array(n),ny=new Array(n),lim=new Array(n);
  for(let i=0;i<n;i++){
    const a=c[(i-1+n)%n],b=c[(i+1)%n];
    let tx=b.x-a.x,ty=b.y-a.y;const L=Math.hypot(tx,ty)||1;
    nx[i]=-ty/L;ny[i]=tx/L;
    c[i].nx=nx[i];c[i].ny=ny[i];              // the map draws its edges from these
    // Track width varies around the lap, so the room available is per-point, not a constant.
    // Also don't let the line cut so far inside a tight corner that the geometry folds on itself.
    // The car's CENTRE runs on the line, so it may come no closer to the edge than half the car (build 115).
    lim[i]=Math.max(0,Math.min((c[i].hw!=null?c[i].hw:half)-mg,Math.max(1,c[i].r*0.45)));
  }
  // Solved on a COARSE subset of the samples, not all of them. At 5 m spacing the bending of one point
  // barely changes and the solver crawls; worse, the centreline is a Catmull-Rom cubic, which already
  // sits at a stationary point. Coarse nodes (~25 m apart) make the same problem well conditioned; the
  // offsets are then interpolated back over the fine grid.
  const K=Math.max(4,Math.round(25/Math.max(1,c[0].ds||5))),m=Math.floor(n/K);
  const idx=[];for(let j=0;j<m;j++)idx.push(Math.round(j*n/m));
  const co=new Array(m).fill(0);
  const qx=new Array(m),qy=new Array(m);
  const qsync=j=>{const i=idx[j];qx[j]=c[i].x+co[j]*nx[i];qy[j]=c[i].y+co[j]*ny[i];};
  for(let j=0;j<m;j++)qsync(j);
  const curv=j=>{const a=(j-1+m)%m,b=(j+1)%m;
    const ax=qx[j]-qx[a],ay=qy[j]-qy[a],bx=qx[b]-qx[j],by=qy[b]-qy[j],cx=qx[b]-qx[a],cy=qy[b]-qy[a];
    const la=Math.hypot(ax,ay),lb=Math.hypot(bx,by),lc=Math.hypot(cx,cy);
    return {k:la*lb*lc>1e-9?2*Math.abs(ax*by-ay*bx)/(la*lb*lc):0,l:(la+lb)/2};};
  const seg=j=>{const b=(j+1)%m;return Math.hypot(qx[b]-qx[j],qy[b]-qy[j]);};
  // Projected gradient descent of an objective made of terms that each depend on a node and its
  // neighbours: gradient by central difference along each node's normal, all nodes moved together
  // (one node alone cannot move a whole bend outwards), the largest move per pass shrinking to settle.
  function descend(local,iters,lo,hi,maxMove){
    const gr=new Array(m),H=0.05;
    for(let k=0;k<iters;k++){
      let gmax=0;
      for(let j=0;j<m;j++){
        const c0=co[j];
        co[j]=c0+H;qsync(j);const ep=local(j);
        co[j]=c0-H;qsync(j);const em=local(j);
        co[j]=c0;qsync(j);
        gr[j]=(ep-em)/(2*H);gmax=Math.max(gmax,Math.abs(gr[j]));
      }
      if(gmax<1e-12)break;
      const step=(maxMove*(1-k/iters)+0.02)/gmax;
      for(let j=0;j<m;j++){co[j]=clamp(co[j]-step*gr[j],lo[j],hi[j]);qsync(j);}
    }
  }
  const lo=idx.map(i=>-lim[i]),hi=idx.map(i=>lim[i]);
  // 1. Minimum curvature: the least bending, sum of kappa^2 l. (Build 115: this used to be sum |Q''|^2,
  //    the raw second difference, which is not curvature: per node it is ~ l^2 x the turn, so a SHORTER
  //    line scored better, and on a constant bend, where the turning cannot be spread out, it pulled the
  //    line to the inside: a 150 m circle was driven at 145 m, not 155. Averaging with the neighbours
  //    instead would minimise edge length, the shortest path, which cuts every apex tight.)
  const bend=j=>{const q=curv(j);return q.k*q.k*q.l;};
  descend(j=>bend((j-1+m)%m)+bend(j)+bend((j+1)%m),600,lo,hi,0.6);
  // The fine line from the coarse offsets: interpolated (a cosine blend keeps it smooth), a few gentle
  // passes to take out the kinks where it runs onto and off the edge, then measured: its own spacing,
  // distance and curvature. Elevation is the centreline's at the same station: the line moves a few
  // metres sideways, the elevation changes over hundreds.
  function build(){
    // Catmull-Rom through the coarse offsets: smooth slope at every node. (Until build 115 a cosine blend,
    // flat at every node, so the offset made an S between each pair: curvature ripples of up to ~1/60 m
    // laid over the line, which the solver then had to drive.)
    const off=new Array(n).fill(0);
    for(let j=0;j<m;j++){
      const i0=idx[j],i1=idx[(j+1)%m],span=((i1-i0)+n)%n||n;
      const p0=co[(j-1+m)%m],p1=co[j],p2=co[(j+1)%m],p3=co[(j+2)%m];
      for(let d=0;d<span;d++){
        const t=d/span,t2=t*t,t3=t2*t,i=(i0+d)%n;
        const o=0.5*(2*p1+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t2+(-p0+3*p1-3*p2+p3)*t3);
        off[i]=clamp(o,-lim[i],lim[i]);
      }
    }
    // a few gentle passes to round off where the line runs onto and off the edge
    for(let k=0;k<4;k++){
      const prev=off.slice();
      for(let i=0;i<n;i++){
        const a=(i-1+n)%n,b=(i+1)%n;
        off[i]=clamp((prev[a]+2*prev[i]+prev[b])/4,-lim[i],lim[i]);
      }
    }
    return measure(off);
  }
  // A line point from its offset, and the measures that need its neighbours: the step to the next
  // point (ds, and ds3 along the surface) and the radius of the path there.
  // The radius is the offset curve's own, from the centreline's curvature kc (signed, positive turning
  // towards +normal) and the offset's slope and bend along it (build 115):
  //     kappa = [A (o'' + kc A) + o' (2 kc o' + kc' o)] / (A^2 + o'^2)^1.5,   A = 1 - kc o
  // It used to be the circle through the line's points 3 either side: a 30 m chord that rounds off a
  // curvature peak the car still has to drive, and that the line optimiser learned to hide curvature
  // between. Through the neighbouring points instead, it is all noise: the spacing of the line's points
  // bunches on the inside of a bend, and a 25 m corner read radii of 3 m. The offset curve's curvature
  // depends on neither.
  const kc=new Array(n),dkc=new Array(n);
  for(let i=0;i<n;i++){const a=c[(i-1+n)%n],b=c[(i+1)%n],q=c[i];
    const cr=(q.x-a.x)*(b.y-q.y)-(q.y-a.y)*(b.x-q.x);kc[i]=(cr>=0?1:-1)/Math.max(1,q.r);}
  for(let i=0;i<n;i++){const a=(i-1+n)%n,b=(i+1)%n;dkc[i]=(kc[b]-kc[a])/Math.max(0.1,c[a].ds+c[i].ds);}
  const radiusAt=(i,oa,o,ob)=>{
    const a=(i-1+n)%n,h1=Math.max(0.1,c[a].ds),h2=Math.max(0.1,c[i].ds);
    const o1=(ob-oa)/(h1+h2),o2=2*(ob*h1-o*(h1+h2)+oa*h2)/(h1*h2*(h1+h2));
    const A=1-kc[i]*o,num=A*(o2+kc[i]*A)+o1*(2*kc[i]*o1+dkc[i]*o),den=Math.pow(A*A+o1*o1,1.5);
    const k=Math.abs(num/Math.max(1e-9,den));
    return k>1e-6?Math.min(1e6,1/k):1e6;};
  const pointAt=(i,o)=>({x:c[i].x+o*nx[i],y:c[i].y+o*ny[i],z:c[i].z||0,off:o,
    grade:c[i].grade||0,sinT:c[i].sinT||0,cosT:c[i].cosT!=null?c[i].cosT:1,kv:c[i].kv||0});
  const stepOf=(q,nq)=>{q.ds=Math.max(0.05,Math.hypot(nq.x-q.x,nq.y-q.y));q.ds3=Math.max(0.05,Math.hypot(q.ds,nq.z-q.z));};
  const radiusOf=(a,b,d)=>{
    const ab=Math.hypot(b.x-a.x,b.y-a.y),bd=Math.hypot(d.x-b.x,d.y-b.y),da=Math.hypot(a.x-d.x,a.y-d.y);
    const area=Math.abs((b.x-a.x)*(d.y-a.y)-(d.x-a.x)*(b.y-a.y))/2;
    const kk=(ab*bd*da)>1e-6?4*area/(ab*bd*da):0;
    return kk>1e-5?1/kk:1e6;};
  function measure(off){
    const L=[];
    for(let i=0;i<n;i++)L.push(pointAt(i,off[i]));
    for(let i=0;i<n;i++)stepOf(L[i],L[(i+1)%n]);
    for(let i=0;i<n;i++)L[i].r=radiusAt(i,off[(i-1+n)%n],off[i],off[(i+1)%n]);
    return finish(L);
  }
  function finish(L){
    let s=0;for(let i=0;i<n;i++){L[i].s=s;s+=L[i].ds3;}
    L.length_=s;
    return L;
  }
  let best=build();
  if(!lapOf)return best;
  // 2. Minimum time for this car. Move the line by a smooth bump around one point, re-solve the car's
  //    speed where that can change it, and keep the move if the lap is quicker. Where it can change it
  //    is bounded: the speed profile is pinned wherever the car is on its cornering limit, so a move
  //    between two such points changes speeds only between them. Re-solving that stretch with the lap
  //    solver's own per-point physics (lapOf(...).model) gives the exact lap-time change of the move,
  //    at a cost that does not grow with the circuit. A move that would shift a pin is not taken.
  //    Nothing here describes a racing line: late apexes, wide entries and straightened exits are
  //    whatever the car's own grip, power and brakes make quickest. Sweeps from coarse to fine moves.
  const res=lapOf(best),M=res.model,v=res.v.slice(),vC=res.vC.slice(),vB=res.vB.slice(),L=best,off=L.map(q=>q.off);
  let B=2*K,EDGE=B+4;const REACH=Math.min(600,n>>1),EPS=1e-9;
  const segT=(q,a,b)=>q.ds3/Math.max(2,(a+b)/2);
  const wrap=i=>((i%n)+n)%n;
  let lastLo=0,lastHi=0;
  function tryMove(ctr,d){
    // the moved offsets, and the points whose geometry changes (the radius looks one either side)
    const no=new Map();
    for(let k=-B;k<=B;k++){const i=wrap(ctr+k),o=clamp(off[i]+d*(1+Math.cos(Math.PI*k/B))/2,-lim[i],lim[i]);
      if(Math.abs(o-off[i])>1e-9)no.set(i,o);}
    if(!no.size)return 0;
    const P=new Map(),get=i=>P.get(i)||L[i];
    for(let k=-EDGE;k<=EDGE;k++){const i=wrap(ctr+k);P.set(i,pointAt(i,no.has(i)?no.get(i):off[i]));}
    for(let k=-EDGE;k<=EDGE;k++){const i=wrap(ctr+k);stepOf(P.get(i),get(wrap(i+1)));P.get(i).r=L[i].r;}
    const offAt=i=>no.has(i)?no.get(i):off[i];
    for(let k=-B-1;k<=B+1;k++){const i=wrap(ctr+k);P.get(i).r=radiusAt(i,offAt(wrap(i-1)),offAt(i),offAt(wrap(i+1)));}
    // Re-solve outward from the change, and stop where the speeds come back to the ones already solved:
    // past that point nothing the move touched can reach. Exact, and only as long as the move's reach.
    // braking pass, leftwards from the right edge of the change (to its right nothing changed)
    const nb=new Map(),nc=new Map(),vbAt=i=>nb.has(i)?nb.get(i):vB[i];
    let k=EDGE,lo;
    for(;;k--){
      if(k<-REACH)return 0;
      const i=wrap(ctr+k),q=get(i),c0=P.has(i)?(nc.has(i)?nc.get(i):(nc.set(i,M.ceilAt(q)),nc.get(i))):vC[i];
      const b=Math.min(c0,M.brakeFrom(q,c0,vbAt(wrap(i+1)),1));
      if(k<-EDGE&&Math.abs(b-vB[i])<EPS){lo=k;break;}
      nb.set(i,b);
    }
    // forward pass, from the last unchanged point rightwards, until it rejoins the solved speeds
    const nv=new Map(),vAt=i=>nv.has(i)?nv.get(i):v[i];
    let hi;
    for(k=lo;;k++){
      if(k>REACH)return 0;
      const i=wrap(ctr+k),j=wrap(i+1),q=get(i);
      const f=Math.min(vbAt(j),M.accFrom(q,vAt(i)).cap);
      if(k+1>EDGE&&Math.abs(f-v[j])<EPS){hi=k+1;break;}
      nv.set(j,f);
    }
    let dt=0;
    for(k=lo;k<hi;k++){const i=wrap(ctr+k),j=wrap(i+1);dt+=segT(get(i),vAt(i),vAt(j))-segT(L[i],v[i],v[j]);}
    if(!(dt<-1e-6))return 0;
    // keep it
    for(const [i,o] of no)off[i]=o;
    for(const [i,q] of P)L[i]=q;
    for(const [i,x] of nc)vC[i]=x;
    for(const [i,x] of nb)vB[i]=x;
    for(const [i,x] of nv)v[i]=x;
    lastLo=ctr+lo;lastHi=ctr+hi;
    return dt;
  }
  // Move centres every K points, shifted by half a step on alternate sweeps. A centre is tried again
  // only once a move nearby has changed the speeds around it (dirty), and the way it last paid first.
  const H2=K>>1,dirty=new Uint8Array(n),pref=new Int8Array(n).fill(1);
  // wide, large moves first to reshape whole corners, then finer ones to settle
  for(const [bw,d] of [[4,1.2],[2,0.6],[2,0.25],[2,0.1]]){
    B=bw*K;EDGE=B+4;
    dirty.fill(1);
    for(let sweep=0;sweep<4;sweep++){
      let gain=0,tried=0;
      for(let ctr=(sweep&1)*H2;ctr<n;ctr+=K){
        if(!dirty[ctr])continue;
        // a move only pays where the car is cornering: skip straights
        let bendy=false;for(let k=-B;k<=B&&!bendy;k+=2)if(L[(ctr+k+n)%n].r<1500)bendy=true;
        dirty[ctr]=0;
        if(!bendy)continue;
        tried++;
        let g=tryMove(ctr,pref[ctr]*d);
        if(!g){g=tryMove(ctr,-pref[ctr]*d);if(g)pref[ctr]=-pref[ctr];}
        if(g){gain+=g;for(let k=lastLo-B;k<=lastHi+B;k++)dirty[(k%n+n)%n]=1;}
      }
      if(!tried||(gain>-1e-3&&sweep>0))break;
    }
  }
  best=finish(L);
  return best;
}
// The racing line for the car being driven (build 115), cached per car. Half the width over the tyres'
// outer walls (the track between the tyre centres plus one tyre) keeps the car on the tarmac, and the
// minimum-time refinement solves this car's own speeds on each candidate line.
const carHalfWidth=()=>((vehicle.track||1.6)+(vehicle.tireWidth||225)/1000)/2;
function carLineKey(){
  const v=vehicle,s=engine.score||{};
  return [v.mass,v.muRef,v.FzRef,v.clA,v.cdA,v.aeroBal,v.drivenAero,v.drivenWt,v.track,v.tireWidth,v.cg,v.wb,v.fWt,
    v.finalDrive,(v.ratios||[]).join('/'),v.driveEff,v.drive,v.diff,v.brakeDecelCap,v.governor,v.tc,v.camber,v.rollGrad,
    v.trackF,v.trackR,v.lltdF,v.FzRefF,v.camRecF,v.camRecR,v.camberF,v.camberR,
    s.peakHP,s.peakTQ,engine.redline].map(x=>typeof x==='number'?+x.toFixed(4):x).join('|');
}
function lineFor(T,key){
  const k=carLineKey();
  T.lines=T.lines||{};
  if(!T.lines[k]){
    const names=Object.keys(T.lines);if(names.length>12)delete T.lines[names[0]];   // a few cars per circuit
    T.lines[k]=optimiseLine(T,carHalfWidth(),line=>simulateLap(key,{line,quick:true}));
  }
  return T.lines[k];
}
// Quasi-steady-state lap: a cornering-speed ceiling at every point, then a backward braking pass
// and a forward traction/power pass, taking the lower speed at each point. Gearbox shift time is
// charged per gear change around the lap, so a slow-shifting box loses real time on a circuit.
function simulateLapRun(key,opts){
  if(!engine.score||!vehicle.mass)return null;
  const quick=!!(opts&&opts.quick);
  // fromRest (build 137): the lap of a standing start. The car leaves point 0 from rest and the forward pass
  // does not wrap round to it, so the profile is the launch, joining the flying lap at the first braking zone.
  const fromRest=!!(opts&&opts.fromRest);
  const T0=buildTrack(key),T=Object.assign({},T0,{line:opts&&opts.line||lineFor(T0,key)}),p=T.line,n=p.length;   // this car's racing line
  if(!quick){if(p._corners==null)p._corners=detectCorners(p).length;T.corners=p._corners;}   // counted on the line it drives
  const curve=buildTorqueCurve();
  const tqAt=rpm=>{if(rpm<=curve[0].rpm)return curve[0].tq;for(let i=1;i<curve.length;i++){if(rpm<=curve[i].rpm){const a=curve[i-1],b=curve[i];return a.tq+(b.tq-a.tq)*(rpm-a.rpm)/(b.rpm-a.rpm);}}return curve[curve.length-1].tq;};
  const m=vehicle.mass,rT=vehicle.rTire,fd=vehicle.finalDrive,eff=vehicle.driveEff,ratios=vehicle.ratios;
  const idle=engine.idleRpmEff,rl=engine.redline,TWO_PI=Math.PI*2;
  const df=vehicle.df||DIFF.open;
  const dCorner=df.corner!=null?df.corner:1;   // locking the diff scrubs lateral grip
  // Lateral grip at a normal load and lateral acceleration: the tyres under load transfer and roll
  // camber (latMuEff, build 109), less the diff's scrub.
  const muLatAt=(N,ay,vv)=>latMuEff(N,ay,down(vv))*dCorner;   // vv: the speed, for the downforce's share of N
  const axleTqMax=Math.max(1,curve.reduce((a,q)=>Math.max(a,q.tq),0)*ratios[0]*fd*(vehicle.gb&&vehicle.gb.mult||1));
  const down=v=>0.5*AIR_RHO*vehicle.clA*v*v;
  // Normal load at a point: weight resolved onto the slope + downforce − vertical-curvature term.
  // The vertical term is capped at ±0.6 g: real suspension runs out of travel and hits the bump
  // stops, so a deep compression stops adding grip long before the maths says it should — and
  // uncapped it would let a dip make a corner effectively unlimited. Floored above zero so a
  // violent crest cannot produce zero or negative grip.
  // Sign: kv < 0 is a crest (the grade falls away), and there N = m·g·cosθ + m·v²·kv, i.e. the
  // car is unloaded. kv > 0 is a compression and loads it up. Adding the term, not subtracting.
  const KVCAP=0.6*m*G;
  const loadAt=(q,vv)=>Math.max(m*G*0.15,m*G*q.cosT+down(vv)+clamp(m*vv*vv*q.kv,-KVCAP,KVCAP));
  const normalLoad=(i,vv)=>loadAt(p[i],vv);
  const drag=v=>0.5*AIR_RHO*vehicle.cdA*v*v;
  const rollF=v=>crrAt(vehicle.crr,v)*m*G;
  // Best gear at a road speed = the one giving the most wheel torque without over-revving.
  // Every gear that would over-rev is skipped — INCLUDING the top one. That last part is the rev
  // limiter, and leaving it out is not a small error: exempting top gear (so the car could keep
  // pulling clamped-to-redline torque at any speed) let an over-geared car run on down the
  // straight until aerodynamic drag alone stopped it, tens of km/h past the speed its own gearing
  // allows. Past the limiter in every gear, bf stays -1 and the force below floors to zero, which
  // is exactly what a fuel cut does; drag then brings the car back to the top-gear redline speed.
  // The gear index still defaults to top so the gear readout and shift count stay sensible up
  // there rather than snapping back to first.
  const VMAX_BG=vehicle.governor>0?Math.min(140,vehicle.governor/3.6):140;
  function bestGear(v){
    let bi=ratios.length-1,bf=-1,bq=0;
    for(let i=0;i<ratios.length;i++){
      const tot=ratios[i]*fd,rpm=v*tot/rT*60/TWO_PI;
      if(rpm>rl)continue;
      const f=tqAt(clamp(rpm,idle,rl))*tot*eff/rT;
      if(f>bf){bf=f;bi=i;bq=tqAt(clamp(rpm,idle,rl))*tot;}
    }
    return{gear:bi,F:Math.max(0,bf),tqFrac:bq/axleTqMax};
  }
  // The same, tabulated every 0.05 m/s and interpolated: it depends only on the speed, and the line
  // optimiser asks for it hundreds of thousands of times (build 115).
  const BG_DV=0.05,bgTab=[];
  for(let k=0;k*BG_DV<=VMAX_BG;k++)bgTab.push(bestGear(k*BG_DV));
  function gearAt(v){
    const x=v/BG_DV,k=Math.floor(x);
    if(k<0||k>=bgTab.length-1)return bestGear(v);
    const a=bgTab[k],b=bgTab[k+1],t=x-k;
    return {gear:t<0.5?a.gear:b.gear,F:a.F+(b.F-a.F)*t,tqFrac:a.tqFrac+(b.tqFrac-a.tqFrac)*t};
  }
  // 1. Cornering ceiling. m·v²/r = muLat·N, where the normal load N is the weight resolved onto
  //    the slope, plus downforce, minus what vertical curvature takes away:
  //        N = m·g·cosθ + ½ρ·ClA·v² + m·v²·kv
  //    kv < 0 is a crest, which throws the car light exactly when it is going fastest; kv > 0 is a
  //    compression, which presses it down and lets it carry far more speed. Both the downforce and
  //    the crest terms scale with v², so this still solves for v² in closed form.
  const vC=new Array(n),lim=new Array(n);
  // 504 km/h ceiling, so a straight is bounded; a fitted speed limiter is a lower one.
  const VMAX=vehicle.governor>0?Math.min(140,vehicle.governor/3.6):140;
  // Each step of the solver is a function of one point of the line (q), so the racing-line optimiser
  // can re-solve a stretch of a candidate line with exactly this physics (build 115).
  function ceilAt(q){
    // Two passes: solve the closed form ignoring the cap, then re-solve with the vertical term
    // evaluated (and clamped) at that speed. Converges immediately because the cap only binds
    // where the uncapped answer was already unphysically high.
    let vv=0,muLat=vehicle.mu*dCorner;
    // The grip depends on the load and the cornering it is doing (build 109), and both on the speed: solve
    // at a grip, take the grip at that speed's load and lateral acceleration, and solve again.
    for(let outer=0;outer<3;outer++){
    for(let it=0;it<2;it++){
      // pass 0: closed form with the vertical term inside the v² coefficient (uncapped)
      // pass 1: re-solve with that term evaluated and clamped at the speed just found
      const kvTerm=it===0?-m*q.kv*muLat:0;
      const extra=it===0?0:clamp(m*vv*vv*q.kv,-KVCAP,KVCAP)*muLat;
      const denom=m/q.r-0.5*AIR_RHO*vehicle.clA*muLat+kvTerm;
      const num=muLat*m*G*q.cosT+extra;
      vv=denom>1e-6?Math.min(VMAX,Math.sqrt(Math.max(0,num/denom))):VMAX;
    }
    muLat=muLatAt(loadAt(q,vv),vv*vv/q.r,vv);
    }
    return vv;
  }
  for(let i=0;i<n;i++){vC[i]=ceilAt(p[i]);lim[i]='corner';}
  const accKind=new Array(n).fill('power'),latUse=new Array(n).fill(0);
  const fadeF=new Array(n).fill(1);   // brake capacity left at each point (see 2b below)
  const fadeR=new Array(n).fill(1);   // the rears' (build 150: each axle fades with its own rotors)
  const hL=vehicle.cg/Math.max(0.5,vehicle.wb), sgn=vehicle.drive==='rwd'?1:vehicle.drive==='fwd'?-1:0;
  // Braking into point q's successor at vNext: the fastest the car can be at q (vi0 = the most it may
  // be there anyway). fade = the brakes' capacity left; ea = the engine's own braking there (build 149), which
  // adds to the brakes' capacity and, like it, cannot take the tyres past their grip.
  // Build 150: per axle. Braking moves load forward (m a h/L) and the downforce splits by the aero balance, so each
  // axle's tyres have their own grip; the hydraulics give each axle its share of the brakes at full line pressure
  // (brakeFrontShare), ABS/EBD easing an axle's pressure once it reaches its grip; the engine brakes the driven
  // axle (shared by weight on four-wheel drive) and ABS cannot ease that. Each axle stops with the lesser of its
  // grip and what its brakes and the engine give it, and the car with the sum. Until build 150 the car stopped with
  // all four tyres' grip pooled, whatever the brakes' split, so an axle whose brakes are too small for its grip
  // under braking cost nothing.
  const fWt=vehicle.fWt||0.55,aeroF=vehicle.aeroBal!=null?vehicle.aeroBal:0.5,fH=vehicle.brakeFrontShare||0.7;
  const engFront=vehicle.drive==='fwd'?1:vehicle.drive==='awd'?fWt:0;   // the engine's braking: the driven axle's share
  // The axles at point q, speed vv, slowing at a (m/s2, the tyres' share) while cornering at ay: their loads and the
  // grip each has left along the road. Build 157: each axle's own side force (the mass it carries times ay) against
  // its own lateral grip at the load the braking leaves it, so braking into a corner unloads the rear and it runs out
  // first (the car turns in on the brakes, and a driver who brakes too hard there spins it). Until build 157 both axles
  // used the whole car's pooled lateral use.
  function axles(q,vv,a,ay){
    const N=loadAt(q,vv),dn=down(vv),tr=m*a*hL;
    const B=latBalance(N,ay,dn,tr),Nf=B.Nf,Nr=B.Nr;
    const uF=clamp(m*ay*fWt/Math.max(1,B.capF*dCorner),0,1),uR=clamp(m*ay*(1-fWt)/Math.max(1,B.capR*dCorner),0,1);
    return {Nf,Nr,uF,uR,gF:tyreMuX(Nf/2,vehicle.FzRefF)*Nf*Math.sqrt(Math.max(0,1-uF*uF)),gR:tyreMuX(Nr/2)*Nr*Math.sqrt(Math.max(0,1-uR*uR))};
  }
  let bfBound=false;   // the brakes, not the tyres, set the last answer
  function brakeFrom(q,vi0,vNext,fade,ea=0,fadeRr=fade){
    let vi=Math.min(vi0,vNext),cap=vi0,aT=0.8*G;
    for(let it=0;it<4;it++){
    const N=loadAt(q,vi);
    const ayi=vi*vi/q.r;
    const cBF=vehicle.brakeDecelCap*fade*m*fH,cBR=vehicle.brakeDecelCap*fadeRr*m*(1-fH),eF=ea*m*engFront,eR=ea*m*(1-engFront);
    // the load transfer follows the deceleration it makes: three rounds from the first guess, then one a round, carrying
    // the deceleration found (the speed moves little between rounds)
    for(let k=0;k<(it===0?3:1);k++){
      const ax=axles(q,vi,aT,ayi);
      aT=(Math.min(ax.gF,cBF+eF)+Math.min(ax.gR,cBR+eR))/m;
      bfBound=cBF+eF<ax.gF||cBR+eR<ax.gR;
    }
    // Build 157: with each axle's own lateral grip the rear can run out as braking moves load off it, so the rounds can
    // end on a deceleration its own load transfer does not support. Step down to what that transfer gives until it
    // does: with the rear out of grip, less braking also takes load off the front, so this takes a few steps, each
    // smaller (the front's grip grows more slowly than the braking it carries).
    for(let k=0;k<8;k++){const ax=axles(q,vi,aT,ayi),aC=(Math.min(ax.gF,cBF+eF)+Math.min(ax.gR,cBR+eR))/m;
      if(!(aC<aT-1e-4))break;aT=aC;bfBound=cBF+eF<ax.gF||cBR+eR<ax.gR;}
    const aBrake=aT+(drag(vi)+corneringDrag(m,ayi,N))/m+G*q.sinT;
    cap=Math.sqrt(Math.max(0,vNext*vNext+2*Math.max(0.1,aBrake)*q.ds3));
    const nv=Math.min(vi0,cap);
    if(Math.abs(nv-vi)<1e-4)break;   // converged
    vi=nv;
    }
    return cap;
  }
  // Accelerating from q at vi: the fastest the car can be at the next point, what limits it, and the
  // share of the tyre in use sideways.
  // The drive in one given gear: none past the limiter, which cuts the fuel.
  function inGear(vi,g){
    const tot=ratios[g]*fd,rpm=vi*tot/rT*60/TWO_PI;
    if(rpm>rl)return{gear:g,F:0,tqFrac:0};
    const tq=tqAt(clamp(rpm,idle,rl));
    return{gear:g,F:tq*tot*eff/rT,tqFrac:tq*tot/axleTqMax};
  }
  function accFrom(q,vi,boostShare=1,gear=-1){
    const N=loadAt(q,vi),dn=down(vi);
    const N0=(N-dn)*vehicle.drivenWt+dn*vehicle.drivenAero;
    const aLat=vi*vi/q.r;
    // the share of the grip in use sideways: the car's (for the 'corner' call) and the driven axle's own, which is
    // what is left for the drive (build 157: a rear-driver's rears may be nearer their limit than the car is)
    const B=latBalance(N,aLat,dn),aLatMax=B.mu*dCorner*N/m,u=clamp(aLat/Math.max(0.1,aLatMax),0,1);
    const uFa=clamp(m*aLat*vehicle.fWt/Math.max(1,B.capF*dCorner),0,1),uRa=clamp(m*aLat*(1-vehicle.fWt)/Math.max(1,B.capR*dCorner),0,1);
    const uD=vehicle.drive==='fwd'?uFa:vehicle.drive==='rwd'?uRa:Math.max(uFa,uRa);
    // Diff traction is evaluated at the lateral load transfer actually happening here, so an
    // open diff falls apart on a fast corner exit while a locked one doesn't.
    const g0=gear>=0?inGear(vi,gear):gearAt(vi),bg=boostShare<1?{gear:g0.gear,F:g0.F*boostShare,tqFrac:g0.tqFrac*boostShare}:g0;
    const R=(drag(vi)+rollF(vi)*q.cosT+corneringDrag(m,aLat,N))/m+G*q.sinT;
    const kk=tyreMuX(N0/(vehicle.drive==='awd'?4:2),vehicle.drive==='fwd'?vehicle.FzRefF:vehicle.FzRef)*diffTractionAt(df,aLat,vehicle.cg,bg.tqFrac)*Math.sqrt(Math.max(0,1-uD*uD));
    // On power the drive force also spins up the engine and wheels (vehicleMassEff, build 106): a = (F -
    // m R) / mE. On grip the tyres are slipping, the surplus only spins the wheels, and the car gets the
    // tyre's force over its own mass, with the load transfer following that acceleration:
    //     a = (k N0 - m R) / (m (1 - s k h/L))
    // The tyres hold exactly while the power figure is the smaller, so the car takes the lesser.
    const mE=vehicleMassEff(ratios[bg.gear]*fd);
    const aGrip=(kk*N0-m*R)/(m*Math.max(0.2,1-sgn*kk*hL)), aPow=(bg.F-m*R)/mE;
    // Gravity along the slope is in R: a climb eats acceleration, a descent adds to it.
    // aAcc may be NEGATIVE — a climb steep enough, or drag at terminal speed, genuinely slows the
    // car. Clamping it at zero (as this did) let the car hold speed up any gradient, which is why
    // a 43% climb used to cost nothing. Floored at 1 m/s so the profile can't collapse to zero.
    const aAcc=Math.min(aPow,aGrip);
    return {cap:Math.sqrt(Math.max(1,vi*vi+2*aAcc*q.ds3)),kind:aPow<aGrip?'power':'traction',u};
  }
  let v,vB,shiftsCut=false,boostShare=null;
  const cutAt=new Uint8Array(n);
  const ebA=new Float64Array(n),brakeBound=new Uint8Array(n);   // the engine's braking at each point, m/s2 (build 149)
  const holdAt=new Int8Array(n).fill(-1);   // the gear held where the driver chose not to change up (build 121)
  function passes(){
    v=vC.slice();brakeBound.fill(0);
  // 2. Backward pass: brake into every corner. Lateral grip in use eats the longitudinal budget
  //    (friction circle), and the brakes' own capacity caps it too. The cornering grip carries the
  //    diff's scrub (muLat); braking in a straight line does not — a locked diff binds only when the
  //    wheels must turn at different speeds, so the longitudinal budget is the tyre's own mu (build 105).
  for(let pass=0;pass<2;pass++)for(let k=n;k>0;k--){
    const i=(k-1+n)%n,j=(i+1)%n;
    // The grip left for braking depends on how much cornering the car is doing AT THE SPEED IT WILL HAVE
    // HERE, which is what this pass is solving for, so iterate it (build 114). It used to read the friction
    // circle at v[i] as it stood, the cornering ceiling, where the tyre is all used sideways: almost no
    // braking left, so the car crept into corners. On the Nordschleife a 911 GT3 rolled 250 m at 82 km/h
    // down a 13% hill into a 42 m corner, and laps came out 6-20% slow.
    // Gravity along the slope: climbing helps you stop, descending fights the brakes.
    const cap=brakeFrom(p[i],v[i],v[j],fadeF[i],ebA[i],fadeR[i]);
    if(cap<v[i]){v[i]=cap;brakeBound[i]=bfBound?1:0;}
  }
  vB=v.slice();   // the braking pass's speeds, before the forward pass: the line optimiser re-solves from them
  // 3. Forward pass: accelerate out. Drive force is capped by the driven axle's grip (via the
  //    diff) and again by the friction circle, then drag and rolling resistance are subtracted.
  //    The driven axle's load is its share of the weight and of the downforce (aero balance), plus
  //    the load acceleration moves onto the rear, m a h/L (build 105; the straight-line run always
  //    had it, the lap did not, so a rear-driver got no exit traction from squat and a front-driver
  //    lost none to it). Grip depends on that load and the load on the acceleration, so solve it:
  //        a = k (N0 - s m R h/L) / (m (1 - s k h/L)),   k = mu x diff x sqrt(1 - u^2)
  //    with s = +1 RWD, -1 FWD, 0 AWD and R the resistances (the transfer follows the NET acceleration).
  //    Gear shifts (build 117): an upshift taken on the power cuts the drive for the gearbox's shift time,
  //    and the car rolls on against drag, rolling resistance and the slope for the distance it covers
  //    meanwhile. A downshift costs nothing: it is made braking or lifting, with no drive to cut. Until
  //    build 117 every gear change, up or down, was charged half a shift time after the lap was solved.
  //    Whether an upshift pays (build 121). A driver who will be braking soon holds the gear rather than
  //    lose the drive for a shift. So before changing up, run on from j both ways, holding gear g or
  //    shifting (the drive cut, then the best gear), each until it meets the braking envelope vB; from
  //    there on both follow it, so the quicker to that later point is the better choice. Before build 121
  //    every car changed up at the best-force point even a car length before the brakes.
  function upshiftPays(j,g){
    let vh=v[j],vs=v[j],th=0,ts=0,cutL=vehicle.shiftCut,doneH=false,doneS=false;
    for(let k=0;k<n;k++){
      const i=(j+k)%n,env=vB[(i+1)%n],q=p[i],bs=boostShare?boostShare[i]:1;
      let nh=env,ns=env;
      if(!doneH){const c=accFrom(q,vh,bs,g).cap;if(c<env)nh=c;else doneH=true;}
      if(!doneS){
        let c;
        if(cutL>0){
          const R=(drag(vs)+rollF(vs)*q.cosT+corneringDrag(m,vs*vs/q.r,loadAt(q,vs)))/m+G*q.sinT;
          const dtS=q.ds3/Math.max(1,vs),f=Math.min(1,cutL/dtS);
          let sq=vs*vs-2*R*q.ds3;
          if(f<1){const a=accFrom(q,vs,bs).cap;sq=f*sq+(1-f)*a*a;}
          c=Math.sqrt(Math.max(1,sq));cutL-=dtS;
        }else c=accFrom(q,vs,bs).cap;
        if(c<env)ns=c;else doneS=true;
      }
      th+=q.ds3/Math.max(1,(vh+nh)/2);ts+=q.ds3/Math.max(1,(vs+ns)/2);vh=nh;vs=ns;
      if(doneH&&doneS)return ts<th;
    }
    return true;   // flat out for a whole lap: change up
  }
  let held=-1,cut=0,hold=-1;
  if(fromRest)v[0]=Math.min(v[0],0.5);
  for(let pass=0;pass<2;pass++)for(let k=0;k<n;k++){
    const i=k%n,j=(i+1)%n;
    if(fromRest&&j===0)continue;   // the launch does not arrive back at its own start
    let cap;
    if(cut>0){
      const R=(drag(v[i])+rollF(v[i])*p[i].cosT+corneringDrag(m,v[i]*v[i]/p[i].r,loadAt(p[i],v[i])))/m+G*p[i].sinT;
      // The shift ends part-way along its last step: coast that share of it, drive the rest. Cutting
      // whole 5 m steps made a 0.35 s shift last anything up to 0.5 s, by where the steps happened to fall.
      const dtS=p[i].ds3/Math.max(1,v[i]),f=Math.min(1,cut/dtS);
      let sq=v[i]*v[i]-2*R*p[i].ds3;
      if(f<1){const st=accFrom(p[i],v[i],boostShare?boostShare[i]:1);sq=f*sq+(1-f)*st.cap*st.cap;accKind[i]=st.kind;latUse[i]=st.u;}
      cap=Math.sqrt(Math.max(1,sq));
      cut-=dtS;
      if(shiftsCut)cutAt[i]=1;
    }else{
      cutAt[i]=0;holdAt[i]=hold;
      const st=accFrom(p[i],v[i],boostShare?boostShare[i]:1,hold);cap=st.cap;
      accKind[i]=st.kind;latUse[i]=st.u;
    }
    // on the power = the car is accelerating as hard as it can here; on the second time round the speeds
    // already equal that, so it is not "cap < v[j]"
    const onPower=cap<=v[j]*(1+1e-9);
    if(cap<v[j])v[j]=cap;
    if(shiftsCut){
      const g=gearAt(v[j]).gear;
      if(held<0)held=g;
      if(hold>=0&&!onPower){hold=-1;held=g;}   // off the power: the held gear is let go
      if(hold<0){
        if(g>held){
          if(onPower&&cut<=0){if(upshiftPays(j,held)){cut=vehicle.shiftCut;held=g;}else hold=held;}
          else held=g;
        }
        else if(g<held&&!onPower)held=g;   // on the power the driver stays in the gear just selected
      }
    }else hold=-1;
  }
  }
  passes();
  // the line optimiser only needs the speeds on a candidate line (no brake temperatures, no recording, and
  // no gear shifts: the stretches it re-solves do not carry the gearbox's state, nor the engine braking it gives)
  if(quick){let tq=0;for(let i=0;i<n;i++){const j=(i+1)%n;tq+=p[i].ds3/Math.max(2,(v[i]+v[j])/2);}return {lap:tq,v,vC,vB,kind:accKind,model:{ceilAt,brakeFrom,accFrom}};}
  // 2b. Brake temperature on the lap (build 107; build 105 counted heat per stop against a fitted
  //     budget). Run the solved profile through the rotors in time order, set each point's brake
  //     capacity from the front rotor's temperature there, and solve again if it bites. The last pass
  //     is kept for the replay. The lap is a HOT LAP (build 135): the rotors start from ambient, take one
  //     preparation lap at the same pace, and the hot lap is the second. It used to repeat laps until the
  //     temperature at the line did, which is a race stint's rotors, not a hot lap's (the tyres, too, are
  //     taken at their working temperature, which an out-lap gives them, not a stint's).
  // 2a. The gearbox through the braking zones (build 149). The gear used to be read off the speed point by point
  //     (the most wheel force there), so under braking it dropped a gear the instant the next one stopped
  //     over-revving, took no time to do it and gave no engine braking; and the readout merged any gear held for
  //     under 40 m into the one before, so a hard stop showed 4th to 1st in one step. Now the driver works down the
  //     box in time order: one gear at a time (a sequential's drum and a twin-clutch's alternating shafts cannot
  //     skip; on an H-pattern or an automatic a driver on the limit goes down one at a time anyway, blipping each
  //     to match the revs), each taking the gearbox's own shift time, each only when the revs after it are inside
  //     the limiter (the box's over-rev protection), and never below the gear the corner's slowest point wants.
  //     In gear, the engine brakes the car: its own overrun torque, friction and pumping against a closed throttle
  //     with the fuel cut (brakeTorqueRaw, the same engine the dyno runs), back through the gearing and the
  //     driveline. Mid-shift the clutch is open and there is none. It adds to the brakes and cannot take the
  //     tyres past their grip, so on a hot lap, where the tyres are the limit, it mostly takes work off the brakes
  //     (cooler rotors, less fade); it only shortens a stop where the brakes themselves are the limit.
  const ovTab=[];
  {
    const sv={coolant:state.coolant,oil:state.oil,engineHealth:state.engineHealth,systemVoltage:state.systemVoltage,nitrousActive:state.nitrousActive};
    state.coolant=90;state.oil=100;state.engineHealth=1;state.systemVoltage=14.0;state.nitrousActive=false;
    for(let r=500;r<=rl+250;r+=250){
      const mc=engine.ci?1:clamp(IDLE_AIR/(IDLE_AIR+THR_K*(r/1000)*(1-IDLE_AIR)),0.12,1);   // a closed throttle (mapTarget's law); no plate on a diesel
      ovTab.push(Math.max(0,-brakeTorqueRaw(r,mc,true)));
    }
    Object.assign(state,sv);
  }
  const overrunTq=r=>{const x=(clamp(r,500,rl)-500)/250,k=Math.min(ovTab.length-2,Math.floor(x));return ovTab[k]+(ovTab[k+1]-ovTab[k])*(x-k);};
  const rpmIn=(g,vv)=>vv*ratios[g]*fd/rT*60/TWO_PI;
  const engineBrakeA=(g,vv)=>overrunTq(clamp(rpmIn(g,vv),idle,rl))*ratios[g]*fd/(rT*eff*m);
  // what the tyres slow the car by at i (brakes and engine; not the air, rolling, cornering drag or the hill)
  const mechAt=i=>{const j=(i+1)%n,a=(v[j]*v[j]-v[i]*v[i])/(2*p[i].ds3);
    return -a-(drag(v[i])+rollF(v[i])*p[i].cosT+corneringDrag(m,v[i]*v[i]/p[i].r,loadAt(p[i],v[i])))/m-G*p[i].sinT;};
  const brakingAt=i=>mechAt(i)>0.3;
  // The axles at i under a deceleration at (m/s2) of which ea is the engine's (build 150): the engine's share on
  // the driven axle, the brakes' in the hydraulic split, ABS moving the excess off an axle at its grip onto the
  // other. Returns each axle's share of its grip in use and the brakes' front share (for the rotors' heat).
  function axleUse(i,at,ea){
    const ay=v[i]*v[i]/p[i].r;
    const ax=axles(p[i],v[i],Math.max(0,at),ay),eF=ea*m*engFront,eR=ea*m*(1-engFront);
    const Fb=Math.max(0,m*at-eF-eR);
    let bf=Fb*fH,br=Fb-bf;
    if(bf+eF>ax.gF){bf=Math.max(0,ax.gF-eF);br=Fb-bf;}
    else if(br+eR>ax.gR){br=Math.max(0,ax.gR-eR);bf=Fb-br;}
    return {useF:(bf+eF)/Math.max(1,ax.gF),useR:(br+eR)/Math.max(1,ax.gR),fr:Fb>0?bf/Fb:fH,gF:ax.gF,gR:ax.gR};
  }
  // Engine braking that the driven axle can carry at i: ABS can ease the brakes but not the engine, so a downshift
  // whose engine braking alone is more than the driven tyres can hold slides them (the rear of a rear-driver steps
  // out). A driver, or the car's drag-torque control, does not make that downshift yet.
  const engineHolds=(i,ea)=>{const x=axleUse(i,Math.max(0,mechAt(i)),0);
    return ea*m*engFront<=x.gF*(1+1e-9)&&ea*m*(1-engFront)<=x.gR*(1+1e-9);};
  // Once in gear the driven tyres' grip can still fall below the engine's braking: deep into a corner on the brakes,
  // the tyres are nearly all used sideways and have almost nothing left along the road, and the rear of a rear-driver
  // steps out on a closed throttle. Cars carry a drag-torque control for it (the ECU opens the throttle enough to
  // hold the driven wheels' slip; a slipper clutch does the same mechanically, a driver with the throttle), so the
  // engine brakes with no more than the driven axle can hold, and where it is trimmed is recorded (build 150).
  const engineCap=i=>{const x=axleUse(i,Math.max(0,mechAt(i)),0);
    return engFront>=1?x.gF/m:engFront<=0?x.gR/m:Math.min(x.gF/(m*engFront),x.gR/(m*(1-engFront)));};
  function gearWalk(){
    const g=new Int8Array(n),eb=new Float64Array(n),brk=new Uint8Array(n),endV=new Float64Array(n),trim=new Uint8Array(n);
    for(let i=0;i<n;i++)brk[i]=brakingAt(i)?1:0;
    // the speed each braking stretch ends at: the corner's slowest point, whose gear is the lowest the driver wants
    for(let pass=0;pass<2;pass++)for(let k=n-1;k>=0;k--)endV[k]=brk[k]?endV[(k+1)%n]:v[k];
    let i0=0;for(let i=1;i<n;i++)if(v[i]>v[i0])i0=i;
    let gear=holdAt[i0]>=0?holdAt[i0]:gearAt(v[i0]).gear,tS=0;
    for(let k=0;k<n;k++){
      const i=(i0+k)%n,j=(i+1)%n,dt=p[i].ds3/Math.max(2,(v[i]+v[j])/2);
      if(tS<=0){
        if(brk[i]){
          if(gear>gearAt(endV[i]).gear&&rpmIn(gear-1,v[i])<=rl&&engineHolds(i,engineBrakeA(gear-1,v[i]))){gear--;tS=vehicle.shiftTime;}
        }else{
          const tgt=holdAt[i]>=0?holdAt[i]:gearAt(v[i]).gear;
          if(tgt>gear)gear=tgt;                                    // the forward pass made this change, and charged its cut
          else if(tgt<gear&&rpmIn(gear-1,v[i])<=rl){gear--;tS=vehicle.shiftTime;}   // still going down after the brakes
        }
      }
      g[i]=gear;
      if(brk[i]&&tS<=0){
        const e0=engineBrakeA(gear,v[i]),c=engineCap(i);
        eb[i]=Math.min(e0,c);trim[i]=e0>c*(1+1e-6)?1:0;
      }
      tS-=dt;
    }
    return {g,eb,trim};
  }
  {
    const gw=gearWalk();ebA.set(gw.eb);
    let bites=false;for(let i=0;i<n;i++)if(brakeBound[i]&&ebA[i]>0){bites=true;break;}
    if(bites)passes();   // the engine adds to brakes that were the limit somewhere: solve again with it
  }
  const th=vehicle.brakeTh;
  function brakeTemps(){
    const st={F:BRAKE_AMBIENT,R:BRAKE_AMBIENT},TF=new Array(n),TR=new Array(n);
    for(let lap=0;lap<1+BRAKE_PREP_LAPS;lap++){   // the preparation lap, then the hot lap kept in TF/TR
      for(let i=0;i<n;i++){
        const j=(i+1)%n,va=Math.max(2,(v[i]+v[j])/2),dt=p[i].ds3/va;
        const aLong=(v[j]*v[j]-v[i]*v[i])/(2*p[i].ds3);
        const mech=-aLong-(drag(v[i])+rollF(v[i])*p[i].cosT)/m-G*p[i].sinT;   // what the brakes did
        // the engine's share is not the rotors' (build 149); the brakes' own split by axle (build 150)
        brakeHeatStep(st,th,Math.max(0,mech-ebA[i]),va,dt,undefined,mech>1e-6?axleUse(i,mech,ebA[i]).fr:undefined);
        TF[i]=st.F;TR[i]=st.R;
      }
    }
    return {TF,TR};
  }
  let BT=brakeTemps();
  {
    let faded=false;
    for(let i=0;i<n;i++){fadeF[i]=brakeFadeAt(BT.TF[i],th);fadeR[i]=brakeFadeAt(BT.TR[i],th);if(fadeF[i]<0.999||fadeR[i]<0.999)faded=true;}
    if(faded){passes();BT=brakeTemps();}
  }
  // what the shifts cost: the same lap with and without the drive cut
  const lapOf=()=>{let tq=0;for(let i=0;i<n;i++){const j=(i+1)%n;tq+=p[i].ds3/Math.max(2,(v[i]+v[j])/2);}return tq;};
  const tNoShift=lapOf();
  shiftsCut=true;passes();
  const shiftLoss=Math.max(0,lapOf()-tNoShift);
  // Turbo lag on the lap (build 118). The solve so far gave a turbo its full boost wherever it was flat,
  // as if the shaft were always spun up. Boost is a state with history (advanceShaft, the same shaft the
  // 0-100 run and the bench integrate): it builds while the exhaust drives the shaft and bleeds off on
  // a lift, under braking and through a shift. So run the shaft along the lap in time order, at each
  // point's revs and throttle, until it repeats lap to lap; the torque the boost actually there gives,
  // against what full boost gives, scales the drive, and the forward pass is solved again. The throttle
  // depends on the drive available, so this goes round twice.
  // The driver's foot (build 152). The solve gives a throttle point by point: full wherever the engine is the
  // limit, the drive the profile needs elsewhere, nothing mid-shift. Read straight, that pumps 1-0-1 in a single
  // 5 m step (~0.07 s), 75-115 times a Spa lap: the line's radius flickers, so the corner throttle does too, and
  // every upshift lifts. A driver holds a steady throttle through a corner, keeps it flat through a shift on a
  // gearbox that cuts the spark for it (dual-clutch, sequential, automatic: the turbo stays spun up), lifts for
  // an H-pattern shift, and moves the pedal no faster than a foot does: fully off in 0.10 s, fully on in 0.25 s.
  // target(i) is what the driver aims for at a point, cut(i) what a shift leaves it at; the pedal follows it in
  // time round the lap (twice, so the lap closes on itself).
  const flatShift=['dct','sequential','auto'].includes(vehicle.gearbox);
  const PEDAL_OFF=0.10,PEDAL_ON=0.25;
  const cornerish=i=>latUse[i]>0.65||(v[i]>=vC[i]*0.97&&vC[i]<VMAX*0.99);
  function driverPedal(target,liftTo){
    const raw=new Float64Array(n);
    for(let i=0;i<n;i++)raw[i]=cutAt[i]?NaN:clamp(target(i),0,1);
    // steady through a corner: the ±2 points (±10 m) the steering is averaged over. Every driving point in that window
    // counts, not only the corner's own (build 169): through a long sweeper the line's corner speed flickers point to
    // point (150, 211, 158, 205 km/h on the mixed circuit's), so a point or two between two apexes reads as a straight
    // and asked for full throttle between two holds, a stab a foot does not make.
    const aim=new Float64Array(n);
    for(let i=0;i<n;i++){
      if(Number.isNaN(raw[i])){aim[i]=NaN;continue;}
      // (a corner point asking for no drive counts too unless the brakes are working there (build 171): on the grip
      // limit the solve can ask for a hair of slowdown, 122-123-123 km/h, that a driver holds with the throttle part
      // open; read alone it snapped the pedal shut for one point. Mid-shift the drive cut used to hide it.)
      const brakes=q=>raw[q]<=0&&brakingAt(q);
      if(!cornerish(i)||brakes(i)){aim[i]=raw[i];continue;}
      let a=0,c=0;for(let k=-2;k<=2;k++){const q=(i+k+n)%n;if(!Number.isNaN(raw[q])&&!brakes(q)){a+=raw[q];c++;}}
      aim[i]=a/c;
    }
    // out of a corner: once the car is accelerating the driver does not back off again until it stops (the solve's
    // grip and traction limits trade places point to point on an exit; the foot only goes on)
    for(let pass=0;pass<2;pass++)for(let i=0;i<n;i++){
      const h=(i-1+n)%n,j=(i+1)%n,a=(v[j]*v[j]-v[i]*v[i])/(2*p[i].ds3);
      if(!Number.isNaN(aim[i])&&!Number.isNaN(aim[h])&&a>0.5&&aim[h]>aim[i])aim[i]=aim[h];
    }
    // through a shift: flat on a spark-cut gearbox (held at what it was), lifted on a manual
    let held=0;for(let i=n-1;i>=0;i--)if(!Number.isNaN(aim[i])){held=aim[i];break;}
    for(let i=0;i<n;i++){if(Number.isNaN(aim[i]))aim[i]=flatShift?held:liftTo;else held=aim[i];}
    const out=new Float64Array(n);let pd=aim[n-1];
    for(let pass=0;pass<2;pass++)for(let i=0;i<n;i++){
      const h=(i-1+n)%n,dt=p[h].ds3/Math.max(2,(v[h]+v[i])/2);   // the time since the last point
      pd=aim[i]>pd?Math.min(aim[i],pd+dt/PEDAL_ON):Math.max(aim[i],pd-dt/PEDAL_OFF);
      out[i]=pd;
    }
    return out;
  }
  let boostLap=null;
  if(engine.intake==='turbo'&&engine.maxBoost>0&&engine.shaftJ){
    const grid=lapTorqueGrid(),iat0=state.iat;state.iat=20;   // design figures, like simulateAccel
    boostShare=new Float64Array(n).fill(1);boostLap=new Float64Array(n);
    const rpmOf=i=>{const g=holdAt[i]>=0?holdAt[i]:gearAt(v[i]).gear;return clamp(v[i]*ratios[g]*fd/rT*60/TWO_PI,idle,rl);};
    // Where the car is fastest it has been flat for a while, so the shaft is spun up to what the revs there
    // support: start it settled there and one walk round the lap is the lap-to-lap state (the shaft's
    // memory is well under a second). Re-walking from rest cost 1.3 s on the Nordschleife.
    let i0=0;for(let i=1;i<n;i++)if(v[i]>v[i0])i0=i;
    for(let it=0;it<TURBO_ITERS;it++){
      // throttle = the drive force the speed profile asks for, against what the engine has here
      // (mid-shift on a manual it is 0.35, as the standing-start run lifts for it; flat on a spark-cut box)
      const thrS=driverPedal(i=>{
        const j=(i+1)%n,g=holdAt[i]>=0?inGear(v[i],holdAt[i]):gearAt(v[i]),a=(v[j]*v[j]-v[i]*v[i])/(2*p[i].ds3);
        const need=vehicleMassEff(ratios[g.gear]*fd)*a+drag(v[i])+rollF(v[i])*p[i].cosT+m*G*p[i].sinT
                   +corneringDrag(m,v[i]*v[i]/p[i].r,loadAt(p[i],v[i]));
        return need<=0?0:need/Math.max(1,g.F*boostShare[i]);
      },0.35);
      let E=0,b=0;
      for(let k=0;k<200;k++){const r=advanceShaft(E,rpmOf(i0),b,1,0.01);E=r.shaftE;b=r.boost;}   // 2 s flat
      for(let k=0;k<n;k++){
        const i=(i0+k)%n,j=(i+1)%n;
        const dt=p[i].ds3/Math.max(2,(v[i]+v[j])/2);
        // 10 ms steps: against 2 ms no lap moves by more than 0.01 s, at a fifth of the cost
        const r=advanceShaft(E,rpmOf(i),b,thrS[i],dt,0.01);E=r.shaftE;b=r.boost;
        boostLap[i]=b;
      }
      for(let i=0;i<n;i++){
        const rpm=rpmOf(i),full=gridTorque(grid,rpm,boostAvail(rpm));
        boostShare[i]=full>1?clamp(gridTorque(grid,rpm,Math.min(boostLap[i],boostAvail(rpm)))/full,0,1):1;
      }
      passes();
    }
    state.iat=iat0;
  }
  const GW=gearWalk();ebA.set(GW.eb);   // the gearbox through the lap as it is now driven
  BT=brakeTemps();   // the rotors through the lap as it is now driven
  // Classify from the FINISHED profile, not during the passes — the backward pass touches almost
  // every point on a twisty circuit, so labelling as it goes would call the whole lap "braking".
  // What's actually limiting the car is: losing speed → brakes; sitting on the cornering ceiling
  // → grip; otherwise gaining speed, capped by either engine output or the driven axle.
  const aL=new Array(n);
  for(let i=0;i<n;i++){
    const j=(i+1)%n;
    const aLong=(v[j]*v[j]-v[i]*v[i])/(2*p[i].ds3);   // m/s², negative = slowing
    aL[i]=aLong;
    // Order matters. Hard deceleration is braking. Otherwise, if most of the tyre is already
    // committed sideways the car is grip-limited — call that cornering, not "traction", even
    // though the friction circle has squeezed the longitudinal budget to nearly nothing.
    // Only when the tyres have capacity left does it make sense to ask whether the engine or
    // the driven axle is the ceiling.
    if(aLong<-1.0)lim[i]='brake';
    else if(latUse[i]>0.65||(v[i]>=vC[i]*0.97&&vC[i]<VMAX*0.99))lim[i]='corner';
    else lim[i]=accKind[i];
  }
  // 4. Integrate the lap and gather stats.
  let t=0,vMin=1e9,vMax=0;
  const sect=[0,0,0],third=p.length_/3,gears=new Array(n);
  for(let i=0;i<n;i++){
    const j=(i+1)%n,vAvg=Math.max(2,(v[i]+v[j])/2),dtSeg=p[i].ds3/vAvg;
    t+=dtSeg;sect[Math.min(2,Math.floor(p[i].s/third))]+=dtSeg;
    gears[i]=GW.g[i];
    if(v[i]<vMin)vMin=v[i];if(v[i]>vMax)vMax=v[i];
  }
  // Count real shifts, not solver chatter: picking the best gear point-by-point flickers between
  // two near-equal ratios, so collapse any run shorter than 40 m into its neighbour first. On the power only:
  // under braking each gear is a real downshift, spaced by the shift time, however short its run (build 149).
  let shifts=0;
  {
    const MINRUN=40;let runStart=0;
    for(let i=1;i<=n;i++){
      if(i<n&&gears[i]===gears[runStart])continue;
      // (a run that starts with a downshift is one: build 157, where the rear running out of grip on the brakes trims the
      // engine's braking to nothing, ebA alone no longer marks it)
      if(p[(i-1+n)%n].s-p[runStart].s<MINRUN&&runStart>0&&ebA[runStart]===0&&!brakingAt(runStart)&&!(gears[runStart]<gears[runStart-1]))
        for(let k=runStart;k<i;k++)gears[k]=gears[runStart-1];
      runStart=i;
    }
    for(let i=0;i<n;i++)if(gears[i]!==gears[(i-1+n)%n])shifts++;
  }
  // 5. The lap as a recording, for the live replay (build 104): what the car is doing at each point.
  //   time    the clock at each point
  //   pedals  flat wherever the car accelerates as hard as it may (engine- or traction-limited). On the
  //           cornering ceiling the driver holds speed: the drive force that takes, against what this
  //           gear has, is the throttle. Slowing harder than drag and the slope do on their own is the
  //           brake, as a share of what the brakes can command.
  //   g       lateral v^2/r, signed by which way the line turns; longitudinal from the speed change
  //   rpm     from the gear the car is in
  //   steer   the front wheels' angle (rad, + = right, i.e. clockwise on the map) from kinematic (Ackermann) steering, atan(wheelbase / r)
  //           on the line's own radius (build 130). Geometry only: no slip angle, so no understeer or
  //           oversteer correction. The HUD multiplies it by the steering ratio for the wheel in the hands.
  //   pwr     crank power (W): the drive force the speed profile spends, times speed, back through the
  //           driveline's efficiency, and never more than the engine makes at full throttle at this rpm
  //           (with the boost the shaft has built). Zero coasting, braking and mid-shift.
  const tAt=new Array(n),thr=new Array(n),brk=new Array(n),gLat=new Array(n),gLong=new Array(n),rpmAt=new Array(n),mapAt=new Array(n);
  const steerRaw=new Array(n),pwr=new Array(n),tgt=new Float64Array(n),wb=vehicle.wb||2.6;
  // each axle's share of its grip in use under braking (build 150), and the engine's alone on the driven axle
  const useF=new Float64Array(n),useR=new Float64Array(n),frB=new Float64Array(n).fill(fH);let engUseMax=0;
  {
    let tc=0;
    for(let i=0;i<n;i++){
      const j=(i+1)%n,h=(i-1+n)%n;tAt[i]=tc;
      tc+=p[i].ds3/Math.max(2,(v[i]+v[j])/2);
      const resist=drag(v[i])+rollF(v[i])*p[i].cosT+m*G*p[i].sinT+corneringDrag(m,v[i]*v[i]/p[i].r,loadAt(p[i],v[i])), need=vehicleMassEff(ratios[gears[i]]*fd)*aL[i]+resist;
      // what the driver aims the pedal at (driverPedal, below, turns it into a foot's movement): full where the engine
      // or the driven tyres are the limit (on the tyres' limit the pedal is down and the traction control trims the
      // torque to the grip, as on a road car at a track day)
      if(cutAt[i]){tgt[i]=0;brk[i]=0;}   // mid-shift: clutch in, no drive
      else if(lim[i]==='power'||lim[i]==='traction'){tgt[i]=1;brk[i]=0;}
      else if(need>=0){tgt[i]=clamp(need/Math.max(1,(holdAt[i]>=0?inGear(v[i],holdAt[i]):bestGear(v[i])).F*(boostShare?boostShare[i]:1)),0,1);brk[i]=0;}
      else{tgt[i]=0;brk[i]=clamp((-need/m-ebA[i])/Math.max(0.1,vehicle.brakeDecelCap),0,1);}   // the engine's braking is not the pedal's
      const ax=p[i].x-p[h].x,ay=p[i].y-p[h].y,bx=p[j].x-p[i].x,by=p[j].y-p[i].y;
      gLat[i]=Math.sign(ax*by-ay*bx)*v[i]*v[i]/Math.max(1,p[i].r)/G;
      steerRaw[i]=Math.sign(ax*by-ay*bx)*Math.atan(wb/Math.max(1,p[i].r));
      gLong[i]=aL[i]/G;
      rpmAt[i]=clamp(v[i]*ratios[gears[i]]*fd/rT*60/TWO_PI,idle,rl);
      {const mc=mechAt(i);if(mc>0.3){const x=axleUse(i,mc,ebA[i]);useF[i]=x.useF;useR[i]=x.useR;frB[i]=x.fr;
        engUseMax=Math.max(engUseMax,ebA[i]*m*engFront/Math.max(1,x.gF),ebA[i]*m*(1-engFront)/Math.max(1,x.gR));}}
      const omega=rpmAt[i]*TWO_PI/60;
      pwr[i]=cutAt[i]||need<=0?0:Math.min(need*v[i]/eff,tqAt(rpmAt[i])*omega*(boostShare?boostShare[i]:1));
    }
    const ped=driverPedal(i=>tgt[i],0);
    for(let i=0;i<n;i++){
      thr[i]=ped[i];
      mapAt[i]=steadyMapAt(rpmAt[i],thr[i]);
      if(boostLap)mapAt[i]=Math.min(mapAt[i],1+boostLap[i]);   // what the shaft has built by here
    }
  }
  // The line's radius comes from three samples 15 m apart and flickers a little point to point; a wheel
  // in a driver's hands does not, so the angle is averaged over ±2 points (±10 m).
  const steer=steerRaw.map((_,i)=>{let a=0;for(let k=-2;k<=2;k++)a+=steerRaw[(i+k+n)%n];return a/5;});
  // Elevation summary for the readouts: metres climbed per lap and the height range.
  let climb=0,zMin=1e9,zMax=-1e9;
  for(let i=0;i<n;i++){const dz=p[(i+1)%n].z-p[i].z;if(dz>0)climb+=dz;zMin=Math.min(zMin,p[i].z);zMax=Math.max(zMax,p[i].z);}
  const counts={corner:0,brake:0,power:0,traction:0};
  for(let i=0;i<n;i++)counts[lim[i]]+=p[i].ds3;
  // Balance (build 157): through the corner-limited stretches, which axle runs out first. Front = understeer.
  const balance={under:0,over:0,margin:0};
  for(let i=0;i<n;i++)if(lim[i]==='corner'){
    const B=latBalance(loadAt(p[i],v[i]),v[i]*v[i]/p[i].r,down(v[i]));
    if(B.muF<B.muR)balance.under+=p[i].ds3;else balance.over+=p[i].ds3;
    balance.margin+=(B.muR-B.muF)/Math.max(1e-6,B.mu)*p[i].ds3;   // + = the rear has grip to spare
  }
  balance.margin/=Math.max(1,balance.under+balance.over);
  return {track:T,lap:t,sectors:sect,v,lim,balance,vMin:vMin*3.6,vMax:vMax*3.6,
    avg:p.length_/t*3.6,shifts,shiftLoss,counts,gears,climb,zMin,zMax,length:T.length,lineLength:p.length_,
    // The peak the power readout is measured against: the curve this lap drives (best-power mixture), which
    // can sit a little above the as-tuned figure quoted on DYNO.
    pwrPeak:curve.reduce((a,q)=>Math.max(a,q.tq*q.rpm*TWO_PI/60),0),
    replay:{tAt,thr,brk,cut:Array.from(cutAt),gLat,gLong,rpm:rpmAt,map:mapAt,steer,pwr,tF:BT.TF,tR:BT.TR,fade:fadeF.slice(),fadeR:fadeR.slice(),
      useF:Array.from(useF),useR:Array.from(useR),eb:Array.from(ebA),frB:Array.from(frB)},
    engBrakeUseMax:engUseMax,
    // metres of braking where the engine's braking had to be trimmed to the driven tyres' grip (build 150): where a
    // car without drag-torque control, a slipper clutch or a blip would have stepped out
    engTrimM:GW.trim.reduce((a,t,i)=>a+(t?p[i].ds3:0),0),
    brakeMaxF:Math.max(...BT.TF),brakeMaxR:Math.max(...BT.TR),brakeOnset:th.onset,
    corners:T.corners,width:T.width,wLabel:T.wLabel};
}
