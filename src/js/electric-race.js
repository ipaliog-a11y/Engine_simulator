// ====== ELECTRIC RACE: energy instead of fuel, no charging mid-race (build 181) ======
// Step 2.4 of plans/hybrid-electric/. The race (src/js/race.js) solves each car's pace once, up front, over a grid of grip
// levels and tank loads, and burns fuel along it. An electric car carries the same race with three differences:
//   the store      the pack's usable energy (kWh) stands where the tank's fuel stood. It weighs the same full or empty,
//                  so the second axis of the pace grid is not the tank's mass: it is the battery power the car runs
//                  at, as a share of what its rated curve draws at its peak (EV_RACE.caps): full, about two thirds,
//                  and under a third. Each is a lap solved through the same solver, the torque curve cut to that power;
//   the price      every point of a solved lap is priced in battery energy: the shaft power, the motor's and the
//                  inverter's losses (motorLosses) and the cells' own (packDraw), less what the regeneration takes back
//                  braking. The race spends it as it spends fuel, scaled by how the car is actually being driven there;
//   the manager    there is no charging in the pit lane (decision 8), so the energy has to last. The plan chooses the
//                  most power that brings the car home with a margin (evRacePlanFF), and at every crossing of the line
//                  the manager chooses again for the laps that are left, as a Formula E car's does. Within the lap the
//                  battery management and the controller have the last word: the pack's power falls as its charge
//                  falls (packMaxPower) and as it heats past 50 C (packDerate), and the controller cuts the current as
//                  the winding and the magnets heat (motorDerate). The pack and the motor are carried from lap to lap
//                  (one lump each, as on the TRACK tab), so a long race is where an electric car runs out of temperature
//                  before it runs out of charge, or out of charge if the plan was too greedy.
// The pace grid holds the power between the caps; below the lowest the car runs at the lowest (the floor of the grid).
// A car that empties the pack retires: OUT OF CHARGE.
const EV_RACE={
  socStart:0.95,    // a race starts on a full pack: charged to 95%, the top left free so regeneration has somewhere to go
  socFloor:0.05,    // and the cut-off the battery management holds back
  caps:[1,0.65,0.3],// the battery power at the grid's three tank-axis points (RACE_FUEL 0, 0.5, 1), a share of evRefPower
  margin:0.97       // the plan keeps 3% in hand
};
// The tank axis of the pace grid (0..1) for a power cap, and back.
function evRaceFF(cap){
  const C=EV_RACE.caps;
  if(cap>=C[0])return 0;
  if(cap>=C[1])return 0.5*(C[0]-cap)/(C[0]-C[1]);
  if(cap>=C[2])return 0.5+0.5*(C[1]-cap)/(C[1]-C[2]);
  return 1;
}
const evRaceCap=ff=>{const C=EV_RACE.caps;return ff<=0.5?C[0]+(C[1]-C[0])*ff/0.5:C[1]+(C[2]-C[1])*(ff-0.5)/0.5;};
// The pack's state of charge with E kWh of usable energy left.
const evRaceSoc=(M,E)=>EV_RACE.socFloor+E/M.ev.kWh;
// The race's view of an electric car, solved with the build loaded (raceCarModel). Returns the pace grid in the race's
// layout (prof[grip × cap] of {v, fr, tq, lap}: fr is battery power / 3600, so the race's burn, fr dt / 1000, counts kWh),
// the nominal lap (full grip, full power), the standing start, and what the race needs to carry the drive's state.
function evRaceModel(key,line,grips){
  const e=engine,v=vehicle,n=line.length,V=motorRatedV(e),tc=e.motor.cool.tCool,cool={w:tc,c:tc,r:60};
  const solve=(grip,ff,o)=>{
    evPowerCap=evRaceCap(ff);
    try{return withRaceTrim(grip,0,()=>simulateLap(key,Object.assign({line,evRace:true},o)));}finally{evPowerCap=1;}
  };
  // a solved lap in battery energy: the drive's own losses and the cells', against the shaft
  const price=L=>{
    const O=L.evOp,fr=new Float32Array(n);
    for(let i=0;i<n;i++){
      const rpm=Math.max(1,O.rpm[i]),T=O.tq[i],P=T*rpm*Math.PI/30+motorLosses(e.motor,Math.abs(T),rpm,V,cool).total;
      const d=packDraw(e.pack,0.5,P);
      fr[i]=(P+(d?d.heat:0))/3600;
    }
    return {v:Float32Array.from(L.v),fr,tq:Float32Array.from(O.tq),lap:L.lap};
  };
  const kWhLap=q=>{let E=0;for(let i=0;i<n;i++){const j=(i+1)%n;E+=q.fr[i]*line[i].ds3/Math.max(2,(q.v[i]+q.v[j])/2);}return E/1000;};
  const nom=solve(1,0),prof=[];
  for(const gr of grips)for(const ff of RACE_FUEL)prof.push(price(gr===1&&ff===0?nom:solve(gr,ff)));
  const rest=solve(1,0,{fromRest:true});
  const top=(grips.length-1)*RACE_FUEL.length,usable=e.pack.kWh*(EV_RACE.socStart-EV_RACE.socFloor);
  return {nom,prof,rest,usable,
    ev:{motor:e.motor,pack:e.pack,V,pRef:evRefPower(e),kWh:e.pack.kWh,rl:e.redline,tCool:tc,
      k:v.ratios[0]*v.finalDrive*60/(2*Math.PI*v.rTire),                     // motor rpm per m/s
      epl:RACE_FUEL.map((_,b)=>kWhLap(prof[top+b]))}};                       // kWh a lap at each cap, full grip
}
// The energy a lap at a point on the cap axis (kWh), straight between the solved caps.
function evRaceEpl(M,ff){const E=M.ev.epl;return ff<=0.5?E[0]+(E[1]-E[0])*ff/0.5:E[1]+(E[2]-E[1])*(ff-0.5)/0.5;}
// The energy manager: the most power (the lowest ff) at which E kWh lasts the laps left with the margin in hand. Saving
// (the race's SAVE mode: lifting and coasting) spends 10% less a lap at any power; k is what the car has been spending
// against the solved laps' prediction (evRaceManage). Returns {ff, fpl: kWh a lap}.
function evRacePlanFF(M,laps,mode,E,k){
  const save=(mode==='save'?0.9:1)*(k||1),need=(E!=null?E:M.tankKg)*EV_RACE.margin/Math.max(1,laps);
  const at=ff=>evRaceEpl(M,ff)*save;
  let ff;
  if(at(0)<=need)ff=0;
  else if(at(1)>need)ff=1;
  else{let lo=0,hi=1;for(let k=0;k<30;k++){const mid=(lo+hi)/2;if(at(mid)>need)lo=mid;else hi=mid;}ff=hi;}
  return {ff,fpl:at(ff)};
}
// A car's drive at the start: the manager's choice from the plan, the motor at its coolant, the pack pre-conditioned.
function evRaceCarInit(c,plan){
  const tc=c.M.ev.tCool;
  c.evFF=plan.evFF;c.evT={w:tc,c:tc,r:tc,b:PACK_COOLANT};c.evPeak={w:tc,b:PACK_COOLANT};c.evK=1;c.evPred=0;c.evCut=false;
}
// At each crossing of the line the manager chooses again for the laps that are left, with what is left. The solved laps
// are a car on its limit with fresh tyres and nothing in the way; a car in a race runs a little under that and spends a
// little less, and a pack held back by its temperature spends less still. So the manager learns: the energy the last
// lap took against what it predicted for it, half of each new lap's ratio into a running one (from the second lap: the
// first is a standing start). A lap on which the battery management or the controller held the power below the
// manager's is no lesson: the energy it did not spend was not the prediction's error.
function evRaceManage(M,c,left,mode){
  const last=c.laps[c.laps.length-1];
  if(last&&c.lapsDone>=2&&c.evPred>0&&!c.evCut)c.evK=clamp(0.5*c.evK+0.5*last.fuelKg/c.evPred,0.6,1.4);
  c.evCut=false;
  const p=evRacePlanFF(M,left,mode,c.fuelKg,c.evK);
  c.evFF=p.ff;c.plan.fpl=p.fpl;c.evPred=p.fpl;
}
// Where on the cap axis the car runs now: the manager's choice, unless the pack (its charge and its temperature) or the
// controller (the winding's and the magnets') allow less. The controller cuts the current, so the torque; taken here as
// the same share of the power.
function evRaceFFNow(M,c){
  const X=M.ev,want=evRaceCap(c.evFF),bms=packMaxPower(X.pack,evRaceSoc(M,c.fuelKg))*packDerate(c.evT.b)/X.pRef;
  const cap=Math.min(want,bms,motorDerate(X,c.evT));
  if(cap<want-0.01)c.evCut=true;
  return evRaceFF(cap);
}
// The motor's torque (Nm, negative regenerating) the pace grid gives at a fractional point, as racePaceAt gives speed.
function evRaceTqAt(M,i,f,g,ff){
  const tq=k=>{
    const GR=M.grips,NG=GR.length,NF=RACE_FUEL.length;
    let a=0;while(a<NG-2&&g>GR[a+1])a++;
    const fa=clamp((g-GR[a])/(GR[a+1]-GR[a]),0,1),b=ff>=0.5?1:0,fb=(ff-RACE_FUEL[b])/(RACE_FUEL[b+1]-RACE_FUEL[b]),P=M.prof;
    return (P[a*NF+b].tq[k]*(1-fb)+P[a*NF+b+1].tq[k]*fb)*(1-fa)+(P[(a+1)*NF+b].tq[k]*(1-fb)+P[(a+1)*NF+b+1].tq[k]*fb)*fa;
  };
  const x=tq(i);return x+(tq((i+1)%M.n)-x)*f;
}
// One step of the drive's heat on track: the cells take the current the power draws at this charge, the motor its
// losses at the speed and the torque it is running at (both scaled, as the race's burn is, by how close to the solved
// pace the car is going: r).
function evRaceHeatStep(M,c,r,dt,save){
  const X=M.ev,t=c.evT,P=c._fr*3600*r*r*save;
  const d=packDraw(X.pack,evRaceSoc(M,c.fuelKg),P);
  packHeatStep(X.pack,t,d?d.heat:0,dt);
  const rpm=clamp(c.v*X.k,1,X.rl),T=c._tq*r;
  motorHeatStep(X.motor,t,motorLosses(X.motor,Math.abs(T),rpm,X.V,t),dt);
  c.evPeak.w=Math.max(c.evPeak.w,t.w);c.evPeak.b=Math.max(c.evPeak.b,t.b);
  // a pack at 95% takes back nothing more than would fill it: the excess goes to the friction brakes
  if(c.fuelKg>M.tankKg){c.fuelUsed+=c.fuelKg-M.tankKg;c.fuelKg=M.tankKg;}
}
// Parked in the pit box: the pack's cooling plate and the motor's coolant keep working with nothing drawn.
const EV_IDLE_LOSS={cu:0,fe:0,mech:0,inv:0,total:0};
function evRaceCool(c,dt){
  const X=c.M.ev;packHeatStep(X.pack,c.evT,0,dt);motorHeatStep(X.motor,c.evT,EV_IDLE_LOSS,dt);
}
// The RACE tab's line for an electric car: the pack and the winding as the car last crossed the line before time t
// (the recording is the tyres', the tank's and the brakes'; the drive's heat is kept per lap).
function raceEvLine(c,t){
  let l=null;for(const x of c.laps)if(x.end<=t)l=x;
  const tc=c.M.ev.tCool,b=l?l.pack:PACK_COOLANT,w=l?l.winding:tc;
  const col=(v,lim)=>v>=lim?'#ff4444':v>=lim-10?'#ffcc00':'#00ff88';
  return '<div class="rt-k">'+tr('BATTERY')+' <b style="color:'+col(b,50)+'">'+Math.round(b)+'°C</b> • '+tr('MOTOR')+' <b style="color:'+col(w,150)+'">'+
    Math.round(w)+'°C</b></div>';
}
