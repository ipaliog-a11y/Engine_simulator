// ================================================================================================
// ---- RACE (build 137): two to eight builds on one circuit, run to a lap count, nobody driving ----
// The race is computed first and watched afterwards. Each car's physics is solved once, up front,
// through the same lap solver the TRACK tab uses: on the car's own racing line, at a grid of grip
// levels (what the tyres and the surface leave it) and fuel loads (the mass that burns off), plus a
// standing start. The race loop then runs every car along its line on a 50 ms clock, reading its speed
// off that grid for the grip and fuel it has at that moment, and adds what the single-car solver cannot
// know about: the other cars, the tyres' temperature and wear, the brakes' heat from lap to lap, the
// weather, the fuel tank, the pit lane and the driver. It needs no globals, so the same seed gives the
// same race, and it can be scrubbed.
//
// What is derived and what is a rule:
//   - pace, braking, gears, launch, fuel flow: the lap solver and the engine's own BSFC map
//   - tyre heat: slip work and rolling hysteresis in, air, water and track out, per tyre, from the loads
//   - brake heat: the lap solver's own rotor model (brakeHeatStep), run through the whole race (build 141)
//   - tyre grip from temperature, wear and water, wear rates, tank sizes: fitted (commented where they sit)
//   - traffic, overtaking, slipstream, dirty air, mistakes, pit loss, the weather's timing: rules
const RACE={
  dt:0.05,            // s, the race clock's step
  air:22,             // C, the default air temperature: the tyres' and rotors' start, and what cools them
  warmers:70,         // C, the tyres' start temperature from blankets
  gridGap:8,          // m between grid slots
  poleOffset:2,       // m behind the line the pole car starts
  pitLoss:20,         // s, the time the pit lane costs against driving past it, at its speed limit
  refuelLps:2.5,      // L/s through a pit-lane rig
  tyreChange:6,       // s to change four tyres (alongside refuelling)
  pitExitKmh:60,      // km/h, the pit lane's speed limit, where the car rejoins
  follow:12,          // m: closer than this, the car behind is in the way of the car ahead
  close:6,            // m: how close a car that cannot pass sits
  slipGap:60,         // m: within this behind on a straight, the tow (build 147: it grows as the gap closes)
  slipDrag:0.45,      // the share of its drag a car loses right behind another; e^(-gap/25) of it at a gap (~30% at 10 m)
  slipK:0.07,         // speed gained per unit of drag lost, at 70 m/s (on the straight the car is part power-, part
                      //   drag-limited, so less than the top-speed v ~ drag^-1/3): ~2% at 10 m, ~0.6% at 40 m
  defendKmh:3,        // km/h more pace a car needs to pass a car that has moved over to defend
  defendCost:0.99,    // the defender's speed through the next corner, off the line it would have taken
  diveGap:10,         // m: close enough to try a late-braking move into a braking zone
  dirty:0.985,        // speed through a corner within a second behind: a few % less downforce/grip, v ~ sqrt(mu)
  passKmh:4,          // km/h of pace advantage needed to pass on a 12 m wide circuit (narrower = more)
  pace:0.006,         // up to 0.6% off the car's limit, drawn per lap: no driver is on it every lap
  mistake:0.012,      // chance per lap of a mistake on a healthy car
  wearLimit:0.8,      // the wear the strategy plans its stints to
  wetFull:0.7,        // the wetness of a properly wet track (1 would be standing water everywhere)
  rainRamp:240,       // s from the first drops to a wet track
  recDt:0.25          // s between recorded samples
};
// Drivers (build 147): four traits, 0-1, 0.5 the average driver the race had before. aggr = how readily they attack,
// defend and dive (and how hard on the tyres and how error-prone that is); cons = how close to the limit every lap
// is, and how rarely they make a mistake; care = how gently they work the tyres; wet = their pace in the rain.
const RACE_DRIVERS={
  balanced:  {label:'BALANCED',   aggr:0.5,cons:0.5,care:0.5,wet:0.5},
  aggressive:{label:'AGGRESSIVE', aggr:0.9,cons:0.4,care:0.3,wet:0.5},
  smooth:    {label:'SMOOTH',     aggr:0.3,cons:0.8,care:0.85,wet:0.5},
  rain:      {label:'RAIN MASTER',aggr:0.5,cons:0.6,care:0.5,wet:0.95},
  rookie:    {label:'ROOKIE',     aggr:0.6,cons:0.2,care:0.3,wet:0.3}
};
// A V8 bug (fixed in V8 15.2, Chrome 152; nodejs/node#66457, V8 issue 547819997): in code compiled by Maglev's
// on-stack replacement, an object literal returned by a function with hot loops can share the boxes that hold
// its number fields with the next one the same site builds, so an earlier result's lap time, lengths and
// speeds turn into a later call's (a Golf's lap of the technical circuit read as its Spa lap, about one run
// in forty, in the suite's Chromium 141). Copied here, outside the loops, into an object of its own before
// anyone holds it, with the plain objects inside it (the balance, the 0-100 run's marks) that are built in the
// same loops; arrays, typed arrays and the track are left shared. Build 167.
function detachResult(o,depth=2){
  const c={};
  for(const k in o){const v=o[k];
    c[k]=depth>0&&k!=='track'&&v&&typeof v==='object'&&Object.getPrototypeOf(v)===Object.prototype?detachResult(v,depth-1):v;}
  return c;
}
function simulateLap(key,opts){const r=powertrain().kind==='hybrid'?hybridLap(key,opts):simulateLapRun(key,opts);return r&&detachResult(r);}   // a hybrid balances its pack over the lap (build 186)
function raceDriver(d){return Object.assign({},RACE_DRIVERS.balanced,typeof d==='string'?RACE_DRIVERS[d]:d||{});}
// Fuel tank by body (litres). Typical of the class, not of any one car: a kei car carries ~30 L,
// a GT ~80. The quoted curb masses are taken with the tank full, so a race car is lighter by what it burns.
const RACE_TANK_L={kei:30,hatch:50,roadster:45,coupe:60,sedan:62,muscle:70,rally:55,gt:80,super:80,hyper:85,proto:60,pickup:90,suv:80};
// The pace grid: grip scale × tank share. A race that can be wet also solves the lower grip levels.
const RACE_GRIP=[0.72,0.80,0.88,0.94,1.00], RACE_GRIP_WET=[0.42,0.52,0.62,0.72,0.80,0.88,0.94,1.00], RACE_FUEL=[0,0.5,1];
// Rain tyres, for the race only (build 141): a grooved tread that clears water, on a softer, cooler-running
// compound. mu is on a dry road, wetKeep the share of it kept on a fully wet one (the compounds in TIRE_TYPE
// carry theirs). heat scales the slip work into the tread: a wet compound is soft and overheats on a dry
// line, and dryWear is how much faster it wears there. Fitted, like the rest of the tyre figures.
const RACE_RAIN_TYRES={
  inter:{label:'INTERMEDIATE',mu:0.98,crr:0.014,tOpt:60,tWin:30,wear:1.6,wetKeep:0.74,heat:1.3,dryWear:3},
  wet:  {label:'FULL WET',    mu:0.90,crr:0.015,tOpt:50,tWin:30,wear:2.2,wetKeep:0.82,heat:1.6,dryWear:5}
};
// Tyres (fitted, build 137; water and the track, build 141). One lump per tyre, the tread and the rubber
// under it that warms with it:
//   heat in  = slip work (force × speed × the share that is sliding, which rises with how much of the grip
//              is in use) + rolling hysteresis (the rolling resistance's work, nearly all of it into the tyre)
//   heat out = convection to the air, h = H0 + H1 v^0.8 over the tyre's surface; to the water on a wet
//              track, hWet × wetness; and conduction into the track surface, hTrack
// Grip: 1 at the compound's tOpt, falling with the square of the distance from it in units of its window,
// twice as fast hot as cold; wear takes a little off at first and then a lot (the cliff).
// Set so a road car on sport tyres settles near its compound's tOpt on a short circuit and a set lasts it
// about an hour of hard laps to the wear limit, a semi-slick on a GT3 about half that.
const TYRE_RACE={slip:0.03,roll:0.8,H0:12,H1:7,hWet:150,hTrack:10,cp:4500,cold:0.03,hot:0.12,gMin:0.72,wearK:8e-8,wearHot:3,
  wLin:0.06,wCliff:1.2,wKnee:0.7};
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
// A compound as the race uses it: one of the car's own (TIRE_TYPE) or a rain tyre.
function raceCompound(key){
  const t=RACE_RAIN_TYRES[key]||TIRE_TYPE[key]||TIRE_TYPE.sport;
  return Object.assign({key,heat:1,dryWear:0,rain:!!RACE_RAIN_TYRES[key]},t);
}
function tyreTempGrip(T,th){
  const x=(T-th.tOpt)/th.tWin;
  return clamp(1-(x<0?TYRE_RACE.cold:TYRE_RACE.hot)*x*x,TYRE_RACE.gMin,1);
}
function tyreWearGrip(w){const k=Math.max(0,w-TYRE_RACE.wKnee);return clamp(1-TYRE_RACE.wLin*w-TYRE_RACE.wCliff*k*k,0.6,1);}
// What the surface leaves a compound: all of it dry, its wetKeep on a fully wet track (RACE.wetFull).
const raceWetGrip=(ty,w)=>1-clamp(w/RACE.wetFull,0,1.2)*(1-ty.wetKeep);
// The grip the car has, as a share of its own tyres at their best on a dry track: the compound against the
// car's own, the water, and the four tyres' temperature and wear weighted by the load they carry.
function raceGrip(M,ty,T,W,w){
  const f=M.fWt/2,r=(1-M.fWt)/2;let g=0;
  for(let k=0;k<4;k++)g+=(k<2?f:r)*tyreTempGrip(T[k],ty)*tyreWearGrip(W[k]);
  return g*(ty.mu/M.mu0)*raceWetGrip(ty,w||0);
}
// The four tyres over one step: speed v (m/s), lateral acceleration ay (m/s2, + = turning right, so the
// left tyres are outside), longitudinal ax (m/s2), on compound ty; env = {air, track, w}. T and W are
// [FL,FR,RL,RR], changed in place. Returns the slip power (W) the tyres took.
function raceTyreStep(M,ty,T,W,v,ay,ax,dt,env){
  const air=env?env.air:RACE.air, trk=env?env.track:air, w=env?env.w:0, sk=env&&env.slipK||1;
  const m=M.massNow, down=0.5*AIR_RHO*M.clA*v*v, drag=0.5*AIR_RHO*M.cdA*v*v;
  const Ntot=m*G+down, dLong=m*ax*M.cg/M.wb;
  const Nf=Math.max(0.1*Ntot,Ntot*M.fWt+down*(M.aeroBal-M.fWt)-dLong), Nr=Math.max(0.1*Ntot,Ntot-Nf);
  const dLat=m*Math.abs(ay)*M.cg/M.track, outL=ay>0;
  const N=[Nf/2+(outL?1:-1)*dLat*M.fWt,Nf/2+(outL?-1:1)*dLat*M.fWt,Nr/2+(outL?1:-1)*dLat*(1-M.fWt),Nr/2+(outL?-1:1)*dLat*(1-M.fWt)];
  for(let k=0;k<4;k++)N[k]=Math.max(50,N[k]);
  const Nsum=N[0]+N[1]+N[2]+N[3], Fy=m*Math.abs(ay), Fx=m*ax+drag;
  const A=M.tyreArea, Gair=A*(TYRE_RACE.H0+TYRE_RACE.H1*Math.pow(Math.max(0,v),0.8)+TYRE_RACE.hWet*w), Gtrk=A*TYRE_RACE.hTrack;
  const muNow=ty.mu*raceWetGrip(ty,w);
  const dryWear=1+ty.dryWear*Math.max(0,0.3-w/RACE.wetFull)/0.3;   // a rain tyre on a drying line
  let Pslip=0;
  for(let k=0;k<4;k++){
    const front=k<2;
    let fx;
    if(Fx>=0){   // driving: the driven wheels, by load
      const share=M.drive==='awd'?N[k]/Nsum:((M.drive==='fwd')===front?N[k]/(front?N[0]+N[1]:N[2]+N[3]):0);
      fx=Fx*share;
    }else{       // braking: the hydraulics' split, then by load across the axle
      fx=Fx*(front?M.brakeF:1-M.brakeF)*N[k]/(front?N[0]+N[1]:N[2]+N[3]);
    }
    const fy=Fy*N[k]/Nsum, F=Math.hypot(fx,fy), u=Math.min(1.3,F/Math.max(1,muNow*N[k]));
    const ps=F*v*TYRE_RACE.slip*u*ty.heat*sk, pr=TYRE_RACE.roll*ty.crr*N[k]*v;
    T[k]+=(ps+pr-Gair*(T[k]-air)-Gtrk*(T[k]-trk))*dt/M.tyreC;
    const over=Math.max(0,(T[k]-ty.tOpt-ty.tWin)/ty.tWin);
    W[k]=Math.min(1,W[k]+TYRE_RACE.wearK*ty.wear*dryWear*ps*(1+TYRE_RACE.wearHot*over)*dt);
    Pslip+=ps;
  }
  return Pslip;
}
// Put a build on the bench for a moment: load it, run fn, and put the user's own build back exactly as it
// was (serializeBuild before = after; the test checks it).
function withBuild(rec,fn){
  const saved=serializeBuild((engine&&engine.name)||'engine',''), name=engine.name;
  const ld={engine:loaded.engine,car:loaded.car}, tk=trackKey;
  try{fuelMapCustom=false;applyBuild(rec);if(rec.name)engine.name=rec.name;return fn();}
  finally{fuelMapCustom=false;applyBuild(saved);engine.name=name;loaded.engine=ld.engine;loaded.car=ld.car;trackKey=tk;updateBuildStrip();}
}
// The loaded car at another mass and grip, for one solve: what depends on the mass (the brakes' deceleration,
// the headline mu) moves with it; the tyres' mu is scaled about the compound's.
function withRaceTrim(grip,dm,fn){
  const sv={mass:vehicle.mass,muRef:vehicle.muRef,brakeDecelCap:vehicle.brakeDecelCap,mu:vehicle.mu};
  try{
    vehicle.mass=sv.mass+dm;vehicle.muRef=sv.muRef*grip;
    vehicle.brakeDecelCap=brakeForceCap(vehicle)/vehicle.mass;vehicle.mu=tyreMu(vehicle.mass*G/4);
    return fn();
  }finally{Object.assign(vehicle,sv);}
}
// Everything the race needs to know about one car, solved with the car loaded. A record from the garage,
// a factory car or the current build: {name, build}. opts.wet solves the low grip levels a wet race needs.
function raceCarModel(entry,key,opts){
  return withBuild(entry.build,()=>{
    const pt=powertrain();
    if(!pt.ready()||!vehicle||!vehicle.mass)throw new Error('incomplete build: '+entry.name);
    const T=buildTrack(key), line=lineFor(T,key), n=line.length;
    const grips=opts&&opts.wet?RACE_GRIP_WET:RACE_GRIP;
    // an electric car (build 181): its pack's usable energy in the tank's place, the pace grid over battery power
    // instead of the tank's mass, every point priced in kWh (src/js/electric-race.js)
    const EV=pt.kind==='electric'?evRaceModel(key,line,grips):null;
    let fuel,tankL,tankKg,nom,prof,rest,HY=null;
    if(EV){fuel={density:1,label:'kWh'};tankKg=EV.usable;tankL=Math.round(tankKg*10)/10;nom=EV.nom;prof=EV.prof;rest=EV.rest;}
    else{
      fuel=pt.fuel();tankL=RACE_TANK_L[vehicle.chassis]||60;tankKg=tankL*fuel.density;
      const solve=(grip,ff,o)=>withRaceTrim(grip,(ff-1)*tankKg,()=>simulateLap(key,Object.assign({line},o)));
      nom=solve(1,0.5);
      // fuel flow (g/s) at each point of a solved lap, from the powertrain's own map, so the race loop never calls it
      const fuelRate=pt.fuelRate(nom,n);
      prof=[];
      for(const gr of grips)for(const ff of RACE_FUEL){
        const L=(gr===1&&ff===0.5)?nom:solve(gr,ff);
        prof.push({v:Float32Array.from(L.v),fr:fuelRate(L),lap:L.lap});
      }
      rest=solve(1,0.5,{fromRest:true});
      HY=pt.kind==='hybrid'?hybRaceModel(solve,grips,fuelRate,line):null;   // a plug-in's depleting laps (build 196)
    }
    const cum=new Float64Array(n+1);for(let i=0;i<n;i++)cum[i+1]=cum[i]+line[i].ds3;
    const kap=new Float32Array(n),sinT=new Float32Array(n),lim=new Array(n);
    for(let i=0;i<n;i++){
      const h=(i-1+n)%n,j=(i+1)%n,ax=line[i].x-line[h].x,ay=line[i].y-line[h].y,bx=line[j].x-line[i].x,by=line[j].y-line[i].y;
      kap[i]=Math.sign(ax*by-ay*bx)/Math.max(1,line[i].r);lim[i]=nom.lim[i];sinT[i]=line[i].sinT||0;
    }
    // Where the car is braking, the speed it is braking down to (the next minimum of the profile): with the
    // rotors hotter or cooler than on the solved lap, the braking zone stretches or shrinks toward it.
    const vNom=Float32Array.from(nom.v),vApex=Float32Array.from(nom.v);
    for(let pass=0;pass<2;pass++)for(let k=n-1;k>=0;k--){const j=(k+1)%n;vApex[k]=vNom[j]<vNom[k]?vApex[j]:vNom[k];}   // twice: round the line
    const tt=TIRE_TYPE[vehicle.tireType]||TIRE_TYPE.sport, NF=RACE_FUEL.length, top=(grips.length-1)*NF;
    const qual=HY?Math.min(prof[top].lap,HY.qual):prof[top].lap;   // full grip, empty tank (a plug-in: on a full pack)
    // fuel per lap: the flow along the nominal lap (full grip, half a tank), over the time at each point
    const frNom=prof[top+1].fr;
    let fpl=0;for(let i=0;i<n;i++){const j=(i+1)%n;fpl+=frNom[i]*line[i].ds3/Math.max(2,(nom.v[i]+nom.v[j])/2);}
    if(EV)fpl=EV.ev.epl[0]*1000;   // an electric car's: at full power
    return {name:entry.name,key,n,line:line.map(q=>({x:q.x,y:q.y})),cum,L3:cum[n],kap,sinT,lim,prof,grips,
      vRest:Float32Array.from(rest.v),vNom,vApex,tF:Float32Array.from(nom.replay.tF),fadeProf:Float32Array.from(nom.replay.fade),
      ebProf:Float32Array.from(nom.replay.eb||[]),frProf:Float32Array.from(nom.replay.frB||[]),
      brakeOnset:nom.brakeOnset,brakeTh:vehicle.brakeTh,
      brakeCar:{mass:vehicle.mass,brakeFrontShare:vehicle.brakeFrontShare||0.7,fWt:vehicle.fWt,cg:vehicle.cg,wb:vehicle.wb,mu:vehicle.mu},
      lapNom:nom.lap,qual,fuelPerLapKg:fpl/1000,
      tankL,tankKg,fuelRho:fuel.density,fuelLabel:fuel.label,
      mass:vehicle.mass,fWt:vehicle.fWt,cg:vehicle.cg,wb:vehicle.wb,track:vehicle.track,drive:vehicle.drive,
      clA:vehicle.clA,cdA:vehicle.cdA,aeroBal:vehicle.aeroBal,crr:vehicle.crr,muRef:vehicle.muRef,mu0:tt.mu,
      brakeF:vehicle.brakeFrontShare||0.7,
      tyre:raceCompound(vehicle.tireType),
      tyreArea:0.25+vehicle.tireWidth/1000,tyreC:TYRE_RACE.cp*vehicle.tireWidth/225,
      chassis:vehicle.chassis,chLabel:vehicle.chLabel,hp:pt.rating().peakHP,
      ...(EV?{ev:EV.ev,unit:'kWh'}:{}),...(HY?{hy:HY}:{})};
  });
}
// Speed (m/s) and fuel flow (g/s) the car's limit gives at line point i, for grip g and tank share ff. A plug-in hybrid
// (build 196) at share x of its depleting laps: straight between its sustaining grid and its depleting one.
function racePace(M,i,g,ff,x){
  const GR=M.grips||RACE_GRIP,NG=GR.length,NF=RACE_FUEL.length;
  g=clamp(g,GR[0],1);ff=clamp(ff,0,1);
  let a=0;while(a<NG-2&&g>GR[a+1])a++;
  const fa=(g-GR[a])/(GR[a+1]-GR[a]);
  const b=ff>=0.5?1:0,fb=(ff-RACE_FUEL[b])/(RACE_FUEL[b+1]-RACE_FUEL[b]);
  const at=P=>{const p00=P[a*NF+b],p01=P[a*NF+b+1],p10=P[(a+1)*NF+b],p11=P[(a+1)*NF+b+1];
    return {v:(p00.v[i]*(1-fb)+p01.v[i]*fb)*(1-fa)+(p10.v[i]*(1-fb)+p11.v[i]*fb)*fa,
      fr:(p00.fr[i]*(1-fb)+p01.fr[i]*fb)*(1-fa)+(p10.fr[i]*(1-fb)+p11.fr[i]*fb)*fa};};
  const s=at(M.prof);
  if(!(x>0)||!M.hy)return s;
  const d=at(M.hy.prof);
  return {v:s.v+(d.v-s.v)*x,fr:s.fr+(d.fr-s.fr)*x};
}
// The car's speed at a fractional point (i, f along segment i): the two ends of the segment, interpolated.
function racePaceAt(M,i,f,g,ff,x){
  const j=(i+1)%M.n,a=racePace(M,i,g,ff,x),b=racePace(M,j,g,ff,x);
  return {v:a.v+(b.v-a.v)*f,fr:a.fr+(b.fr-a.fr)*f};
}
// The launch profile by distance from the start (own line), interpolated.
function raceLaunchV(M,d){
  if(d<=0)return M.vRest[0];
  let lo=0,hi=M.n;while(hi-lo>1){const mid=(lo+hi)>>1;if(M.cum[mid]<=d)lo=mid;else hi=mid;}
  if(lo>=M.n-1)return 1e9;
  const f=(d-M.cum[lo])/Math.max(1e-6,M.cum[lo+1]-M.cum[lo]);
  return M.vRest[lo]+(M.vRest[lo+1]-M.vRest[lo])*f;
}
// ---- the weather (build 141) ----
// How wet the track is (0 dry .. RACE.wetFull wet) at race time t. When the rain comes, and how fast a line
// dries, are rules drawn from the seed, not a forecast.
function raceWetAt(R,t){
  const X=R.wx;
  switch(X.kind){
    case 'wet':return RACE.wetFull;
    case 'damp':return 0.4*RACE.wetFull;
    case 'rain':return t<X.tRain?0:Math.min(RACE.wetFull,(t-X.tRain)/RACE.rainRamp*RACE.wetFull);
    case 'drying':return Math.max(0,RACE.wetFull*(1-t/X.tDry));
    default:return 0;
  }
}
// The track surface: in the sun it runs well above the air; wet, it sits at the air's temperature.
const raceTrackTemp=(air,w)=>air+14*(1-clamp(w/0.25,0,1));
// What a compound is worth to a car at this wetness, as a share of its own tyres' dry grip. No compound counts
// for more than the car's own on a dry track (the pace grid stops there), and a rain tyre on a drying line is
// marked down for the heat and wear it is about to take.
function raceTyreScore(M,ty,w){
  const x=clamp(w/RACE.wetFull,0,1);
  let g=Math.min(1,ty.mu/M.mu0)*raceWetGrip(ty,w);
  if(ty.rain)g*=1-0.12*Math.max(0,0.3-x)/0.3;
  return g;
}
// The compound a car would choose now: the most grip at this wetness, its own compound on a near tie.
function raceBestCompound(M,w){
  let best=M.tyre.key,bg=raceTyreScore(M,M.tyre,w)*1.01;
  for(const k of ['inter','wet']){const g=raceTyreScore(M,raceCompound(k),w);if(g>bg){bg=g;best=k;}}
  return best;
}
// The car's own lap at a grip level (half a tank), read off its solved pace grid.
function raceLapAtGrip(M,g){
  const GR=M.grips||RACE_GRIP,NF=RACE_FUEL.length;g=clamp(g,GR[0],1);
  let a=0;while(a<GR.length-2&&g>GR[a+1])a++;
  const f=(g-GR[a])/(GR[a+1]-GR[a]);
  return M.prof[a*NF+1].lap*(1-f)+M.prof[(a+1)*NF+1].lap*f;
}
// Whether changing to that compound pays: the time its grip wins back on the car's own solved laps, over the
// laps left, against what the stop costs.
function raceTyreCallPays(M,cur,next,w,left){
  const gc=raceTyreScore(M,cur,w),gn=raceTyreScore(M,raceCompound(next),w);
  return gn>gc&&(raceLapAtGrip(M,gc)-raceLapAtGrip(M,gn))*left>RACE.pitLoss+RACE.tyreChange;
}
// A solo run of the car on its own pace, no traffic and no driver error, for the strategy: how many laps a
// set of tyres lasts to the wear limit, with the lap time at each age, in the conditions at the start.
function racePractice(M,cfg,maxLaps,mode,ff0,hx){
  const air=cfg.air!=null?cfg.air:RACE.air,w=0;
  const env={air,track:raceTrackTemp(air,w),w};
  const ty=M.tyre,T=[0,0,0,0].fill(cfg.warmers&&ty.key!=='eco'?RACE.warmers:air),W=[0,0,0,0],laps=[];
  const ff=ff0!=null?ff0:0.5,sv=mode==='save'?0.99:1;let life=null;
  M.massNow=M.ev?M.mass:M.mass-M.tankKg*0.5;
  for(let lap=0;lap<maxLaps;lap++){
    let t=0;
    for(let i=0;i<M.n;i++){
      const g=raceGrip(M,ty,T,W,w),P=racePace(M,i,g,ff,hx),j=(i+1)%M.n,Pn=racePace(M,j,g,ff,hx);
      const va=Math.max(2,(P.v+Pn.v)/2)*sv,ds=M.cum[i+1]-M.cum[i],dti=ds/va;
      const ax=(Pn.v*Pn.v-P.v*P.v)/(2*Math.max(0.05,ds))*sv*sv;
      raceTyreStep(M,ty,T,W,va,va*va*M.kap[i],ax,dti,env);
      t+=dti;
    }
    laps.push({t,wear:Math.max(...W)});
    if(life==null&&Math.max(...W)>=RACE.wearLimit)life=lap+1;
    if(life!=null&&lap>=life+1)break;
  }
  return {laps,life:life||Infinity};
}
// The stops, chosen once at the start (build 137; per car, build 141). cc.stops is 'auto' (the fewest the
// fuel and the tyres allow, or one or two more if the time fresher tyres win back pays for the pit lane),
// a number of stops, or 'none'. Fuel saving burns ~10% less a lap.
// An electric car (build 181) cannot charge in the pit lane: it starts full, stops only for tyres, and its energy manager
// chooses the power that lasts the distance (evRacePlanFF).
function racePlan(M,cfg,cc){
  const ev=M.ev?evRacePlanFF(M,cfg.laps,cc.mode):null;
  // a plug-in hybrid (build 196): its share of the depleting laps, and the fuel a lap between the two
  const hx=M.hy?hybRacePlanX(M,M.hy.usable,cfg.laps):0,fplH=M.hy?M.fuelPerLapKg+(M.hy.fplKg-M.fuelPerLapKg)*hx:M.fuelPerLapKg;
  const N=cfg.laps, fpl=ev?ev.fpl:fplH*1.03*(cc.mode==='save'?0.9:1);
  const want=cc.stops==null?(cfg.strategy==='none'?'none':'auto'):cc.stops;
  if(want==='none')return Object.assign({stops:[],startKg:M.tankKg,est:null,fpl,want,hyX:hx},ev?{evFF:ev.ff}:{});
  const pr=racePractice(M,cfg,Math.min(N,200),cc.mode,ev?ev.ff:undefined,hx);
  const lapAt=age=>{const L=pr.laps;return L.length?L[Math.min(L.length-1,age)].t:M.lapNom;};
  const lifeLaps=pr.life===Infinity?Infinity:Math.max(1,Math.floor(pr.life));
  const sFuel=ev?0:Math.max(0,Math.ceil(N*fpl/(M.tankKg*0.97)-1e-9)-1);
  const sTyre=lifeLaps===Infinity?0:Math.max(0,Math.ceil(N/lifeLaps)-1);
  const stintsOf=s=>{const a=[];for(let k=0;k<=s;k++)a.push(Math.round((k+1)*N/(s+1))-Math.round(k*N/(s+1)));return a;};
  let best=null;
  if(want==='auto'){
    const sMin=Math.max(sFuel,sTyre);
    for(let s=sMin;s<=sMin+2&&s<N;s++){
      const stints=stintsOf(s);
      if(!ev&&stints.some(x=>x*fpl>M.tankKg*0.97))continue;
      let est=s*(RACE.pitLoss+RACE.tyreChange);
      for(const L of stints)for(let a=0;a<L;a++)est+=lapAt(a);
      if(!best||est<best.est)best={s,stints,est};
    }
  }else{
    const s=clamp(Math.round(+want)||0,0,Math.max(0,N-1));best={s,stints:stintsOf(s),est:null};
  }
  if(!best){const s=Math.max(sFuel,sTyre);best={s,stints:stintsOf(s),est:null};}
  const stops=[];let acc=0;for(let k=0;k<best.stints.length-1;k++){acc+=best.stints[k];stops.push(acc);}
  return Object.assign({stops,stints:best.stints,startKg:ev?M.tankKg:Math.min(M.tankKg,(best.stints[0]+1)*fpl),est:best.est,life:lifeLaps,fpl,want,hyX:hx},
    ev?{evFF:ev.ff}:{});
}
// ---- the race itself ----
// cfg: track, laps, seed, grid ('quali'|'reverse'), strategy ('auto'|'none': the default for every car),
// warmers, air (C), weather ('dry'|'damp'|'wet'|'rain'|'drying'), cars: per-car settings in the models' order,
// {stops:'auto'|0..3|'none', mode:'push'|'normal'|'save', wetCall:'auto'|'stay', start:'auto'|'own'|'inter'|'wet'}.
function raceInit(models,cfg){
  cfg=Object.assign({air:RACE.air,weather:'dry',cars:[]},cfg);
  const rnd=mulberry32((cfg.seed>>>0)||1);
  const T0=buildTrack(cfg.track),pts=T0.pts,nC=pts.length;
  const Lc=pts[nC-1].s+pts[nC-1].ds;
  const width=T0.width||12;
  const est=Math.max(...models.map(M=>M.lapNom))*cfg.laps;
  const R={cfg,models,rnd,t:0,done:false,Lc,cS:pts.map(q=>q.s),
    passMs:clamp(RACE.passKmh*(12/Math.max(6,width)),2.5,9)/3.6,
    wx:{kind:cfg.weather,tRain:est*(0.25+0.35*rnd()),tDry:est*(0.4+0.3*rnd())},
    cars:[],events:[],rec:null,wetNow:0,raining:false};
  const air=cfg.air,w0=raceWetAt(R,0);
  for(const M of models){M.brakeTh=Object.assign({},M.brakeTh,{amb:air});}
  // grid: by qualifying, a hot lap each on an empty tank (the solver's lap, at full grip); or reversed
  const order=models.map((M,k)=>k).sort((a,b)=>models[a].qual-models[b].qual||a-b);
  if(cfg.grid==='reverse')order.reverse();
  order.forEach((k,pos)=>{
    const M=models[k],cc=Object.assign({stops:null,mode:'normal',wetCall:'auto',start:'auto'},cfg.cars[k]||{}),plan=racePlan(M,cfg,cc);
    cc.drv=raceDriver(cc.driver);
    const off=RACE.poleOffset+RACE.gridGap*pos;
    // the slot: back from the line along the car's own line
    let i=M.n-1;while(i>0&&M.L3-M.cum[i]<off)i--;
    const f=clamp((M.L3-off-M.cum[i])/Math.max(1e-6,M.cum[i+1]-M.cum[i]),0,1);
    const tyKey=cc.start==='auto'?raceBestCompound(M,w0):cc.start==='own'?M.tyre.key:cc.start;
    const ty=raceCompound(tyKey);
    const tw=cfg.warmers&&tyKey!=='eco'?RACE.warmers:air;
    R.cars.push({id:k,M,cc,grid:pos+1,i,f,lapsDone:-1,v:0,ax:0,ty,T:[tw,tw,tw,tw],W:[0,0,0,0],BT:{F:air,R:air},
      fuelKg:plan.startKg,plan,stopsDone:0,pit:null,launch:{d:0},mistake:null,pace:1,blue:0,passing:-1,
      state:'run',finishT:null,lapStart:0,laps:[],best:null,fuelUsed:0,sTot:0,lastLapKg:plan.startKg,
      stints:[{tyre:tyKey,from:1}],react:rnd()<0.5?1:0,wantFor:0,
      // the driver's tyre work: 1 for the average driver; a careful one slides them less, an aggressive one more
      defendT:-8,wide:null,dive:null,yieldT:0,diveZone:-1,switchT:0,slipK:(1.15-0.3*cc.drv.care)*(0.85+0.3*cc.drv.aggr)});
    if(M.ev)evRaceCarInit(R.cars[R.cars.length-1],plan);
    if(M.hy)hybRaceCarInit(R.cars[R.cars.length-1],plan);
  });
  for(const c of R.cars)c.sTot=raceDist(R,c);
  // recording, sized for the race and grown if it runs long
  const recEst=est*1.3*(cfg.laps+1)/cfg.laps+60;
  const recDt=Math.max(RACE.recDt,recEst/40000);
  R.rec={dt:recDt,n:0,cap:Math.ceil(recEst/recDt)+10,K:20,data:null,next:0};
  R.rec.data=R.cars.map(()=>new Float32Array(R.rec.cap*R.rec.K));
  return R;
}
// Centreline distance (m) of a car's point, for comparing cars whose lines differ: lines are sampled
// point for point against the centreline, so the index carries across.
function raceCentre(R,c){
  const n=R.cS.length,i=c.i,j=(i+1)%n,a=R.cS[i],b=j?R.cS[j]:R.Lc;
  return a+(b-a)*c.f;
}
function raceDist(R,c){return c.lapsDone*R.Lc+raceCentre(R,c);}
const RACE_TYRE_CODE={inter:1,wet:2};
function raceRecord(R){
  const rc=R.rec;
  if(rc.n>=rc.cap){
    const cap=rc.cap*2;
    rc.data=rc.data.map(a=>{const b=new Float32Array(cap*rc.K);b.set(a);return b;});rc.cap=cap;
  }
  const flag={run:0,pit:1,fin:2,dnf:3};
  R.cars.forEach((c,k)=>{
    const d=rc.data[k],o=rc.n*rc.K;
    d[o]=c.i+c.f;d[o+1]=c.v;d[o+2]=c.T[0];d[o+3]=c.T[1];d[o+4]=c.T[2];d[o+5]=c.T[3];
    d[o+6]=c.W[0];d[o+7]=c.W[1];d[o+8]=c.W[2];d[o+9]=c.W[3];
    d[o+10]=c.fuelKg/c.M.fuelRho;d[o+11]=c.BT.F;d[o+12]=flag[c.state];d[o+13]=c.sTot;
    d[o+14]=c.passing>=0?1:0;d[o+15]=c.lapsDone;d[o+16]=c.BT.R;d[o+17]=RACE_TYRE_CODE[c.ty.key]||0;d[o+18]=R.wetNow;d[o+19]=c.defendT>0?1:0;
  });
  rc.n++;
}
function raceEvent(R,c,type,extra){R.events.push(Object.assign({t:R.t,type,car:c?c.id:-1,lap:c?c.lapsDone+1:0},extra||{}));}
// A car takes on a new car to pass. If it was already passing another and is now ahead of it, that move is done
// first (in a crowd the car ahead changes before the last move is confirmed, and the pass must still count).
function raceSetPassing(R,c,id,pos){
  if(c.passing>=0&&c.passing!==id){
    const o=R.cars.find(x=>x.id===c.passing);
    if(o&&o.state==='run'){let g=pos.get(c)-pos.get(o);if(g<-R.Lc/2)g+=R.Lc;if(g>R.Lc/2)g-=R.Lc;
      if(g>0&&c.sTot-o.sTot<R.Lc/2)raceEvent(R,c,'pass',{on:o.id});}
  }
  c.passing=id;
}
// One step of the race clock.
function raceStepOnce(R){
  const cfg=R.cfg,dt=RACE.dt,rnd=R.rnd,Lc=R.Lc,cars=R.cars;
  const w=raceWetAt(R,R.t),air=cfg.air,env={air,track:raceTrackTemp(air,w),w};
  if(w>0.02&&!R.raining&&R.wx.kind==='rain'){R.raining=true;raceEvent(R,null,'rain');}
  if(R.wx.kind==='drying'&&w<=0&&R.wetNow>0)raceEvent(R,null,'dry');
  R.wetNow=w;
  const onTrack=cars.filter(c=>c.state==='run');
  // what is physically ahead of each car on the circuit, and how far (centreline m)
  const pos=new Map(onTrack.map(c=>[c,raceCentre(R,c)]));
  for(const c of onTrack){
    let ah=null,gap=1e9;
    for(const o of onTrack){if(o===c)continue;let g=pos.get(o)-pos.get(c);if(g<0)g+=Lc;if(g<gap){gap=g;ah=o;}}
    c._ahead=ah;c._gap=gap;
  }
  // targets
  for(const c of onTrack){
    const M=c.M;
    const g=raceGrip(M,c.ty,c.T,c.W,w),ff=M.ev?evRaceFFNow(M,c):c.fuelKg/M.tankKg;
    // look half a step ahead so the speed is the segment's middle, not its start
    let i=c.i,f=c.f,ahead=c.v*dt/2;
    while(ahead>0){const L=M.cum[i+1]-M.cum[i],rem=(1-f)*L;if(ahead<rem){f+=ahead/L;ahead=0;}else{ahead-=rem;i=(i+1)%M.n;f=0;}}
    const P=racePaceAt(M,i,f,g,ff,c.hyX),lim=M.lim[i];
    if(M.ev)c._tq=evRaceTqAt(M,i,f,clamp(g,M.grips[0],1),ff);
    let vLim=P.v;
    // the brakes as they are now against the brakes the lap was solved with: a braking zone to the speed
    // it brakes down to, v^2 = apex^2 + (fade now / fade solved) (v^2 - apex^2)
    if(lim==='brake'){
      const fr=brakeFadeAt(c.BT.F,M.brakeTh)/Math.max(0.3,M.fadeProf[i]);
      if(Math.abs(fr-1)>1e-3){const ap=M.vApex[i]*P.v/Math.max(1,M.vNom[i]);vLim=Math.sqrt(Math.max(0,ap*ap+fr*(P.v*P.v-ap*ap)));}
    }
    let vt=vLim*c.pace;
    if(c.cc.mode==='save')vt*=lim==='power'?0.985:0.995;   // lifting and coasting into the braking zones
    c._fr=P.fr;c._pv=P.v;
    if(c.launch){
      const vl=raceLaunchV(M,c.launch.d);
      if(vl<vt)vt=vl;else if(c.launch.d>30)c.launch=null;
    }
    if(c.mistake&&c.mistake.d!=null){vt*=0.55+0.45*Math.min(1,c.mistake.d/120);}
    if(c.wide&&c.wide.d!=null){vt*=0.85+0.15*Math.min(1,c.wide.d/80);}   // a dive that did not stick: wide, and back
    // a dive that sticks: later on the brakes for 60 m, then a tighter, slower line through the corner's exit
    if(c.dive){vt*=c.dive.d<60?1.06:0.98;}
    if(c.yieldT>0)vt*=0.94;   // squeezed off the line by a car alongside on the inside
    if(c.blue>0)vt*=0.97;
    // the driver in the rain: up to 1.5% either side of the average in a properly wet race
    if(w>0.02)vt*=1+0.03*(c.cc.drv.wet-0.5)*Math.min(1,w/RACE.wetFull);
    if(c.defendT>0&&lim==='corner')vt*=RACE.defendCost;   // on the inside line, the exit is slower
    const ah=c._ahead;
    if(ah){
      // the tow: the drag behind a car falls away with the gap, and the closer the more speed it gives; in the wet
      // the spray is no tow worth taking
      if(c._gap<RACE.slipGap&&lim==='power'&&c.v>28&&w<0.3){
        const d=RACE.slipDrag*Math.exp(-c._gap/25);
        vt*=1+RACE.slipK*d*Math.min(1.4,(c.v/70)*(c.v/70));
      }
      else if(c._gap<Math.max(10,c.v)&&(lim==='corner'||w>0.2))vt*=RACE.dirty;
    }
    c._vt=vt;c._lim=lim;
  }
  // traffic: in order from the front of the race, so a car reacts to what the car ahead does this step
  const byRace=onTrack.slice().sort((a,b)=>b.sTot-a.sTot);
  const passMs=R.passMs*(1+w/RACE.wetFull);   // the wet narrows the circuit to one dry line
  for(const c of byRace){
    let v=c._vt;const ah=c._ahead;
    // defending (build 147): with a car close behind on the way to a braking zone, the car ahead may move over to
    // the inside line. It holds the place for a while (the car behind needs more to get by) and costs a slower exit.
    const racing=ah&&c.sTot-ah.sTot<Lc/2&&ah.sTot-c.sTot<Lc/2;
    // Only against a car that has the pace to try (it is faster than the car ahead right here), and not again for
    // a while after (a driver does not weave down every straight).
    if(racing&&c._gap<RACE.follow*1.8&&ah.defendT<=-8&&ah.passing<0&&c._lim==='power'&&c._vt>ah.v*1.003&&rnd()<dt*(0.1+0.6*ah.cc.drv.aggr)){
      ah.defendT=6;raceEvent(R,ah,'defend',{from:c.id});
    }
    if(ah&&c._gap<RACE.follow&&v>ah.v){
      const lapping=c.sTot-ah.sTot>Lc/2, drv=c.cc.drv;
      // the pace needed to get by: less for an aggressive driver and straight after being passed (the switchback),
      // more past a car that is defending
      const need=passMs*(1.3-0.6*drv.aggr)*(c.switchT>0?0.5:1)+(ah.defendT>0?RACE.defendKmh/3.6*(0.5+ah.cc.drv.aggr):0);
      if(lapping){ if(ah.blue<=0)raceEvent(R,ah,'blue',{by:c.id}); ah.blue=2; raceSetPassing(R,c,ah.id,pos); }
      else if(c.passing===ah.id||ah.passing===c.id){/* alongside: neither gives way */}
      else if(v-ah.v>need&&(c._lim==='power'||c._lim==='brake')&&rnd()<dt*3*(0.5+drv.aggr))raceSetPassing(R,c,ah.id,pos);
      // a late-braking move (build 147): held up into a braking zone, close enough, once a zone. Whether it sticks is
      // the two cars' grip and brakes and the two drivers; if not, the attacker runs wide and loses time.
      else if(c._lim==='brake'&&c._gap<RACE.diveGap&&v>ah.v*1.005&&c.diveZone!==(c.i>>4)&&!c.wide){
        c.diveZone=c.i>>4;
        if(rnd()<(0.6*drv.aggr-0.15)*(ah.defendT>0?0.7:1)){
          const gC=raceGrip(c.M,c.ty,c.T,c.W,R.wetNow),gA=raceGrip(ah.M,ah.ty,ah.T,ah.W,R.wetNow);
          const fC=brakeFadeAt(c.BT.F,c.M.brakeTh),fA=brakeFadeAt(ah.BT.F,ah.M.brakeTh);
          const pOk=clamp(0.4+2*(gC-gA)+1.5*(fC-fA)+0.3*(drv.aggr-ah.cc.drv.aggr)-(ah.defendT>0?0.15:0),0.08,0.85);
          // it sticks: the attacker brakes later, alongside on the inside, and the car ahead has to concede the line
          if(rnd()<pOk){raceSetPassing(R,c,ah.id,pos);c.dive={d:0};ah.yieldT=3;ah.switchT=6;raceEvent(R,c,'dive',{on:ah.id,ok:true});}
          else{c.wide={d:0};raceEvent(R,c,'dive',{on:ah.id,ok:false});}
        }
      }
      // held up: sit a few metres back at the speed of the car ahead (a lift, not an emergency stop)
      if(c.passing!==ah.id&&ah.passing!==c.id)v=Math.min(v,Math.max(ah.v*0.92,ah.v+(c._gap-RACE.close)*1.0));
    }
    if(c.passing>=0){
      const o=cars[cars.findIndex(x=>x.id===c.passing)];
      if(!o||o.state!=='run'){c.passing=-1;}
      else{
        let g=pos.get(c)-pos.get(o);if(g<-Lc/2)g+=Lc;if(g>Lc/2)g-=Lc;
        if(g>4){ if(c.sTot-o.sTot<Lc/2)raceEvent(R,c,'pass',{on:o.id}); c.passing=-1; }
        else if(g<-RACE.follow*2)c.passing=-1;   // dropped back: the move is off
      }
    }
    c.v=Math.max(0,v);
  }
  // move, heat, burn
  for(const c of onTrack){
    const M=c.M,vOld=c._vOld==null?c.v:c._vOld;
    c.ax=0.8*c.ax+0.2*clamp((c.v-vOld)/dt,-15,12);c._vOld=c.v;
    M.massNow=M.ev?M.mass:M.mass-M.tankKg+c.fuelKg;
    raceTyreStep(M,c.ty,c.T,c.W,c.v,c.v*c.v*M.kap[c.i],c.ax,dt,c.slipK===1?env:Object.assign({},env,{slipK:c.slipK}));
    if(c.defendT>-8)c.defendT-=dt;if(c.switchT>0)c.switchT-=dt;   // below 0, the defend's cool-down
    if(c.wide){c.wide.d+=c.v*dt;if(c.wide.d>80)c.wide=null;}
    if(c.dive){c.dive.d+=c.v*dt;if(c.dive.d>130)c.dive=null;}
    if(c.yieldT>0)c.yieldT-=dt;
    // the rotors: what the brakes did (the slowing that drag, rolling and the slope did not), through the
    // lap solver's own rotor model, carried from lap to lap
    {
      const drag=0.5*AIR_RHO*M.cdA*c.v*c.v,roll=M.crr*M.massNow*G;
      const mech=Math.max(0,-c.ax-(drag+roll)/M.massNow-G*M.sinT[c.i]);
      M.brakeCar.mass=M.massNow;
      // the engine's share of the slowing is not the rotors', and the brakes split by axle as on the lap (build 150)
      const eb=M.ebProf&&M.ebProf.length?Math.min(mech,M.ebProf[c.i]):0;
      brakeHeatStep(c.BT,M.brakeTh,mech-eb,c.v,dt,M.brakeCar,mech>0.3&&M.frProf&&M.frProf.length?M.frProf[c.i]:undefined);
    }
    const r=clamp(c.v/Math.max(1,c._pv),0,1.05);
    const burn=c._fr*r*r*(c.cc.mode==='save'?0.9:1)*dt/1000;
    c.fuelKg-=burn;c.fuelUsed+=burn;
    if(M.ev)evRaceHeatStep(M,c,r,dt,c.cc.mode==='save'?0.9:1);
    if(M.hy)hybRaceSpend(M,c,c.v*dt);
    if(c.blue>0)c.blue-=dt;
    let adv=c.v*dt;
    if(c.launch)c.launch.d+=adv;
    if(c.mistake&&c.mistake.d!=null){c.mistake.d+=adv;if(c.mistake.d>120)c.mistake=null;}
    while(adv>0){
      const L=M.cum[c.i+1]-M.cum[c.i],rem=(1-c.f)*L;
      if(adv<rem){c.f+=adv/L;adv=0;break;}
      adv-=rem;c.i=(c.i+1)%M.n;c.f=0;
      if(c.mistake&&c.mistake.d==null&&c.i===c.mistake.at){c.mistake.d=0;raceEvent(R,c,'mistake');}
      if(c.i===0){raceCross(R,c);if(c.state!=='run')break;}
    }
    if(c.fuelKg<=0&&c.state==='run'){c.fuelKg=0;c.state='dnf';c.v=0;raceEvent(R,c,'dnf',{why:M.ev?'OUT OF CHARGE':'OUT OF FUEL'});}
    c.sTot=raceDist(R,c);
  }
  // the pit lane: the car sits in its box while the rotors cool
  for(const c of cars){
    if(c.state!=='pit')continue;
    brakeHeatStep(c.BT,c.M.brakeTh,0,0,dt,c.M.brakeCar);
    if(c.M.ev)evRaceCool(c,dt);
    c.pit.t-=dt;
    if(c.pit.t<=0){
      const M=c.M;
      c.fuelKg+=c.pit.fuelKg;
      c.ty=raceCompound(c.pit.tyre);
      const tw=R.cfg.warmers&&c.ty.key!=='eco'?RACE.warmers:air+10;
      c.T=[tw,tw,tw,tw];c.W=[0,0,0,0];
      c.state='run';c.pit=null;c.v=RACE.pitExitKmh/3.6;
      let d=0;for(let i=0;i<M.n-1;i++){if(M.vRest[i]>=c.v){d=M.cum[i];break;}}
      c.launch={d};
      raceEvent(R,c,'pitout');
    }
  }
  R.t+=dt;
  if(R.t>=R.rec.next){raceRecord(R);R.rec.next+=R.rec.dt;}
  if(cars.every(c=>c.state==='fin'||c.state==='dnf')){R.done=true;raceRecord(R);}
  else if(R.t>R.cfg.laps*Math.max(...cars.map(c=>c.M.lapNom))*4+600){   // nobody is getting there
    for(const c of cars)if(c.state!=='fin'&&c.state!=='dnf'){c.state='dnf';raceEvent(R,c,'dnf',{why:'TIME LIMIT'});}
    R.done=true;raceRecord(R);
  }
}
// A car crossing the line: a lap done, the flag, or the pit lane.
function raceCross(R,c){
  const cfg=R.cfg,M=c.M,w=R.wetNow;
  c.lapsDone++;
  if(c.lapsDone>=1){
    const t=R.t,lt=t-c.lapStart;c.lapStart=t;
    const pos=1+R.cars.filter(o=>o!==c&&o.state!=='dnf'&&o.sTot>=c.lapsDone*R.Lc).length;   // further round the race (a car finished a lap down is not)
    const lap={n:c.lapsDone,t:lt,end:t,fuelKg:c.lastLapKg-c.fuelKg,wear:Math.max(...c.W),pit:false,tyre:c.ty.key,wet:w,pos,
      brake:c.BT.F};
    if(M.ev){lap.pack=c.evT.b;lap.winding=c.evT.w;}
    if(M.hy){lap.hyE=c.hyE;lap.hyX=c.hyX;}
    c.lastLapKg=c.fuelKg;c.laps.push(lap);
    if(c.best==null||lt<c.best)c.best=lt;
    raceEvent(R,c,'lap',{time:lt,n:c.lapsDone});
  }
  // the flag: the leader at the full distance, then every car the next time it reaches the line
  if(c.lapsDone>=cfg.laps||(R.chequered&&c.lapsDone>=1)){R.chequered=true;c.state='fin';c.finishT=R.t;c.v=0;raceEvent(R,c,'finish',{pos:R.cars.filter(x=>x.state==='fin').length});return;}
  const mode=c.cc.mode;
  const drv=c.cc.drv;
  c.pace=1-R.rnd()*RACE.pace*(mode==='push'?0.5:1)*(1.6-1.2*drv.cons);
  // a mistake somewhere on this lap: more likely on tyres that are past it, on faded brakes, in the wet,
  // and from a driver who is pushing
  const hot=Math.max(0,...c.T.map(T=>(T-c.ty.tOpt-c.ty.tWin)/c.ty.tWin)),worn=Math.max(0,Math.max(...c.W)-0.6);
  const fade=1-brakeFadeAt(c.BT.F,M.brakeTh);
  const pMis=RACE.mistake*(1+4*hot+4*worn+3*fade+2*(1.5-drv.wet)*w/RACE.wetFull)*(mode==='push'?1.6:mode==='save'?0.6:1)
    *(1.6-1.2*drv.cons)*(0.8+0.4*drv.aggr);
  if(c.lapsDone>=1&&R.rnd()<pMis){
    const corners=[];for(let i=0;i<M.n;i++)if(M.lim[i]==='corner')corners.push(i);
    if(corners.length)c.mistake={at:corners[Math.floor(R.rnd()*corners.length)],d:null};
  }
  if(c.lapsDone<0)return;
  // an electric car's energy manager looks again at what is left for the laps that are left
  if(M.ev&&cfg.laps-c.lapsDone>0)evRaceManage(M,c,cfg.laps-c.lapsDone,mode);
  if(M.hy&&cfg.laps-c.lapsDone>0)hybRaceManage(M,c,cfg.laps-c.lapsDone);   // a plug-in's, for its own charge (build 196)
  // the pit lane: on the planned lap; now if the fuel or the tyres will not see another; or for the weather
  const left=cfg.laps-c.lapsDone, fpl=c.plan.fpl||M.fuelPerLapKg*1.03;
  const noStops=c.plan.want==='none';
  let tyre=c.ty.key;
  if(c.cc.wetCall!=='stay'&&left>=2){
    const want=raceBestCompound(M,w);
    if(want!==c.ty.key&&raceTyreCallPays(M,c.ty,want,w,left)){c.wantFor++;if(c.wantFor>c.react)tyre=want;}else c.wantFor=0;
  }
  const weather=tyre!==c.ty.key;
  const planned=c.plan.stops.includes(c.lapsDone);
  const need=planned&&!noStops||(!noStops&&!M.ev&&c.fuelKg<fpl*1.05&&left>0)||(!noStops&&Math.max(...c.W)>0.95&&left>2)||weather;
  if(need){
    if(!weather&&left>0&&raceBestCompound(M,w)!==tyre&&c.cc.wetCall!=='stay')tyre=raceBestCompound(M,w);
    // an unplanned stop takes the place of a planned one coming up soon
    const nextIdx=c.plan.stops.findIndex(l=>l>c.lapsDone);
    if(!planned&&nextIdx>=0){
      const prev=c.lapsDone,next=c.plan.stops[nextIdx],after=c.plan.stops[nextIdx+1]!=null?c.plan.stops[nextIdx+1]:cfg.laps;
      if(next-prev<(after-prev)*0.4)c.plan.stops.splice(nextIdx,1);
    }
    const nx=c.plan.stops.find(l=>l>c.lapsDone),stint=Math.min(left,(nx!=null?nx:cfg.laps)-c.lapsDone);
    const want=Math.min(M.tankKg,(stint+1)*fpl),add=M.ev?0:Math.max(0,want-c.fuelKg);   // no charging in the pit lane
    const service=Math.max(RACE.tyreChange,add/M.fuelRho/RACE.refuelLps);
    c.state='pit';c.pit={t:RACE.pitLoss+service,fuelKg:add,service,tyre};c.v=0;c.stopsDone++;c.passing=-1;c.wantFor=0;
    if(c.laps.length)c.laps[c.laps.length-1].pit=true;
    c.stints.push({tyre,from:c.lapsDone+1});
    raceEvent(R,c,'pit',{fuelL:add/M.fuelRho,service,tyre,why:weather?'weather':planned?'plan':'need'});
  }
}
// Run the race to the flag (or for a slice of wall time when budgetMs is given, so a page can keep
// drawing a progress bar).
function raceRun(R,budgetMs){
  const t0=performance.now();
  while(!R.done){
    for(let k=0;k<200&&!R.done;k++)raceStepOnce(R);
    if(budgetMs!=null&&performance.now()-t0>budgetMs)break;
  }
  return R.done;
}
// The classification at the flag (or as it stands): finishers by laps then time, then the rest by distance.
function raceResults(R){
  const cars=R.cars.slice().sort((a,b)=>{
    const fa=a.state==='fin',fb=b.state==='fin';
    if(fa&&fb)return b.lapsDone-a.lapsDone||a.finishT-b.finishT;
    if(fa!==fb)return fa?-1:1;
    return b.sTot-a.sTot;
  });
  const lead=cars[0];
  return cars.map((c,k)=>({pos:k+1,id:c.id,name:c.M.name,laps:Math.max(0,c.lapsDone),time:c.finishT,
    gap:k===0?null:(c.state==='fin'&&lead.state==='fin'&&c.lapsDone===lead.lapsDone?c.finishT-lead.finishT:null),
    lapsDown:lead.lapsDone-Math.max(0,c.lapsDone),best:c.best,stops:c.stopsDone,fuelL:c.fuelUsed/c.M.fuelRho,
    state:c.state,grid:c.grid,stints:c.stints,mode:c.cc.mode,driver:c.cc.drv.label||'',
    brakeMax:Math.max(0,...c.laps.map(l=>l.brake||0)),
    why:(R.events.find(e=>e.type==='dnf'&&e.car===c.id)||{}).why||'',
    ...(c.M.ev?{unit:'kWh',packMax:c.evPeak.b,windingMax:c.evPeak.w}:{})}));
}
// Simulate the whole race in one go (headless use and the tests).
function simulateRace(entries,cfg){
  cfg=Object.assign({laps:5,strategy:'auto',warmers:false,seed:1,weather:'dry',air:RACE.air},cfg);
  const models=entries.map(e=>raceCarModel(e,cfg.track,{wet:cfg.weather!=='dry'}));
  if(!cfg.cars)cfg.cars=entries.map(e=>e.strat||{});
  const R=raceInit(models,cfg);raceRun(R);
  return R;
}
