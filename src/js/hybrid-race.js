// ====== HYBRID RACE: a plug-in's own charge spent over the distance (build 196) ======
// Step 3.5c of plans/hybrid-electric/. A hybrid in a race (src/js/race.js) runs charge-sustaining laps: every lap the motors
// give what braking puts back (hybridLap), within the class's deploy and harvest limits a lap (the HYBRID TUNE's DEPLOY
// LIMIT and HARVEST LIMIT). A plug-in starts the race on a full pack (the charge window's HIGH) and has its own charge to
// spend on top, down to the charge it then sustains (the TARGET):
//   the grid      a second pace grid, the same grip and tank levels solved with the motors free of the balance (all they
//                 give, to the deploy limit): the depleting laps. Between it and the sustaining grid the car runs at a
//                 share x, the pace and the fuel straight between the two;
//   the price     the pack's net spend a depleting lap (what the motors draw less what braking puts back), at the nominal
//                 lap (full grip, half a tank), spread over the lap's distance: a car at share x spends x of it a metre;
//   the manager   chooses x so the charge lasts the laps that are left with a margin in hand (all of it if the race is
//                 short enough), and chooses again at every crossing of the line with what is left. A spent pack runs
//                 the sustaining laps.
// Qualifying is a hot lap on a full pack: the depleting grid's.
const HYB_RACE={margin:0.97};
// The plug-in's race model, solved with the build loaded (raceCarModel): solve(grip, ff, opts) a lap at that grip and
// tank, fuelRate the powertrain's flow along a lap. Returns null for a hybrid that is not a plug-in.
function hybRaceModel(solve,grips,fuelRate,line){
  const e=engine;if(!e.hy||!e.hyPlug)return null;
  const t=hybTune(e),n=line.length,prof=[];let nomD=null;
  for(const gr of grips)for(const ff of RACE_FUEL){
    const L=solve(gr,ff,{hyExtraKJ:Infinity});if(gr===1&&ff===0.5)nomD=L;
    prof.push({v:Float32Array.from(L.v),fr:fuelRate(L),lap:L.lap});
  }
  const D=Math.max(0,nomD.hy.deployKJ-nomD.hy.regenKJ);   // kJ a depleting lap takes from the pack
  const usable=Math.max(0,(t.socHi-t.socT)/100)*e.hy.pack.kWh*3600;
  const top=(grips.length-1)*RACE_FUEL.length,fr=prof[top+1].fr;
  let fpl=0;for(let i=0;i<n;i++){const j=(i+1)%n;fpl+=fr[i]*line[i].ds3/Math.max(2,(nomD.v[i]+nomD.v[j])/2);}
  return {prof,D,usable,fplKg:fpl/1000,qual:prof[top].lap,lapD:nomD.lap,socHi:t.socHi,socT:t.socT,
    deployKJ:nomD.hy.deployKJ,regenKJ:nomD.hy.regenKJ};
}
// The share of the depleting laps that E kJ lasts over the laps left (1: all of them).
function hybRacePlanX(M,E,left){
  const H=M.hy;if(!H||!(H.D>0)||left<=0)return 0;
  return clamp(E*HYB_RACE.margin/(left*H.D),0,1);
}
// A car's pack at the start: full, the manager's share from the plan.
function hybRaceCarInit(c,plan){c.hyE=c.M.hy.usable;c.hyX=plan.hyX||0;}
// What the car spends over a stretch of ds metres at its share; a spent pack runs the sustaining laps.
function hybRaceSpend(M,c,ds){
  if(!(c.hyX>0))return;
  c.hyE-=c.hyX*M.hy.D*ds/M.L3;
  if(c.hyE<=0){c.hyE=0;c.hyX=0;}
}
// At each crossing of the line, with what is left for the laps that are left.
function hybRaceManage(M,c,left){c.hyX=c.hyE>0?hybRacePlanX(M,c.hyE,left):0;}
// The pack's charge (%) with E kJ of the plug-in's own charge left.
const hybRaceSoc=(M,E)=>M.hy.socT+(M.hy.socHi-M.hy.socT)*E/Math.max(1,M.hy.usable);
// The RACE tab's line for a plug-in: the pack and the share as the car last crossed the line before time t.
function hybRaceLine(c,t){
  let l=null;for(const x of c.laps)if(x.end<=t)l=x;
  const E=l?l.hyE:c.M.hy.usable,X=l?l.hyX:c.plan.hyX||0;
  return '<div class="rt-k">'+tr('PACK')+' <b>'+Math.round(hybRaceSoc(c.M,E))+'%</b> • '+tr('PLUG-IN DEPLOY')+' <b>'+Math.round(X*100)+'%</b></div>';
}
