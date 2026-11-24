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
  let fpl=0,rpmSum=0;for(let i=0;i<n;i++){const j=(i+1)%n;fpl+=fr[i]*line[i].ds3/Math.max(2,(nomD.v[i]+nomD.v[j])/2);rpmSum+=nomD.replay.rpm[i]||0;}
  const lapD=Math.max(1,nomD.lap);
  return {prof,D,usable,fplKg:fpl/1000,qual:prof[top].lap,lapD:nomD.lap,socHi:t.socHi,socT:t.socT,
    deployKJ:nomD.hy.deployKJ,regenKJ:nomD.hy.regenKJ,
    motor:e.hy.motor,pack:e.hy.pack,V:hybBusV(e.hy),tCool:e.hy.motor.cool.tCool,
    pDeployW:nomD.hy.deployKJ*1000/lapD,pRegenW:nomD.hy.regenKJ*1000/lapD,rpmAvg:Math.max(500,rpmSum/Math.max(1,n))};
}
// The share of the depleting laps that E kJ lasts over the laps left (1: all of them).
function hybRacePlanX(M,E,left){
  const H=M.hy;if(!H||!(H.D>0)||left<=0)return 0;
  return clamp(E*HYB_RACE.margin/(left*H.D),0,1);
}
// A car's pack at the start: full, the manager's share from the plan, motor & pack at coolant temperature.
function hybRaceCarInit(c,plan){
  const H=c.M.hy,tc=H.tCool!=null?H.tCool:65;
  c.hyE=H.usable;c.hyXWant=plan.hyX||0;c.hyX=c.hyXWant;
  c.hyT={w:tc,c:tc,r:tc,b:PACK_COOLANT};c.hyPeak={w:tc,b:PACK_COOLANT};c.hyDerate=1;
}
// Step hybrid pack and motor temperatures during a race; thermal derating reduces deploy share c.hyX.
function hybRaceHeatStep(M,c,dt){
  const H=M.hy;if(!H||!H.pack||!H.motor||!(dt>0))return;
  if(!c.hyT){const tc=H.tCool!=null?H.tCool:65;c.hyT={w:tc,c:tc,r:tc,b:PACK_COOLANT};c.hyPeak={w:tc,b:PACK_COOLANT};c.hyDerate=1;}
  const t=c.hyT,x=clamp(c.hyX||0,0,1),soc=clamp(hybRaceSoc(M,c.hyE||0)/100,0.05,0.98);
  const Pdep=(H.pRegenW||0)+x*Math.max(0,(H.pDeployW||0)-(H.pRegenW||0)),Preg=H.pRegenW||0;
  const dDep=Pdep>0?packDrawClamped(H.pack,soc,Pdep/0.4,t.b):{heat:0};
  const dReg=Preg>0?packDrawClamped(H.pack,soc,-Preg/0.25,t.b):{heat:0};
  packHeatStep(H.pack,t,0.4*dDep.heat+0.25*dReg.heat,dt);
  const rpm=H.rpmAvg||3000,w=rpm*Math.PI/30,Tm=motorMaxTorque(H.motor,rpm,H.V,t.r);
  const Ldep=Pdep>0?motorLosses(H.motor,Math.min(Pdep/0.4/w,Tm),rpm,H.V,t):{cu:0,rcu:0,fe:0,feS:0,feR:0,mech:0,inv:0,total:0,rpm};
  const Lreg=Preg>0?motorLosses(H.motor,Math.min(Preg/0.25/w,Tm),rpm,H.V,t):{cu:0,rcu:0,fe:0,feS:0,feR:0,mech:0,inv:0,total:0,rpm};
  const L={cu:0.4*Ldep.cu+0.25*Lreg.cu,rcu:0.4*(Ldep.rcu||0)+0.25*(Lreg.rcu||0),fe:0.4*Ldep.fe+0.25*Lreg.fe,
    feS:0.4*(Ldep.feS||0)+0.25*(Lreg.feS||0),feR:0.4*(Ldep.feR||0)+0.25*(Lreg.feR||0),
    mech:0.4*Ldep.mech+0.25*Lreg.mech,inv:0.4*Ldep.inv+0.25*Lreg.inv,rpm};
  motorHeatStep(H.motor,t,L,dt);
  c.hyPeak.w=Math.max(c.hyPeak.w,t.w);c.hyPeak.b=Math.max(c.hyPeak.b,t.b);
  c.hyDerate=motorDerate({motor:H.motor},t)*packDerate(t.b);
  if(c.hyXWant==null)c.hyXWant=c.hyX||0;
  c.hyX=c.hyE>0?c.hyXWant*c.hyDerate:0;
}
// What the car spends over a stretch of ds metres at its share; a spent pack runs the sustaining laps.
function hybRaceSpend(M,c,ds){
  hybRaceHeatStep(M,c,ds/Math.max(1,c.v||30));
  if(!(c.hyX>0))return;
  c.hyE-=c.hyX*M.hy.D*ds/M.L3;
  if(c.hyE<=0){c.hyE=0;c.hyX=0;c.hyXWant=0;}
}
// At each crossing of the line, with what is left for the laps that are left.
function hybRaceManage(M,c,left){
  c.hyXWant=c.hyE>0?hybRacePlanX(M,c.hyE,left):0;
  c.hyX=c.hyXWant*(c.hyDerate!=null?c.hyDerate:1);
}
// The pack's charge (%) with E kJ of the plug-in's own charge left.
const hybRaceSoc=(M,E)=>M.hy.socT+(M.hy.socHi-M.hy.socT)*E/Math.max(1,M.hy.usable);
// The RACE tab's line for a plug-in: the pack and the share as the car last crossed the line before time t.
function hybRaceLine(c,t){
  let l=null;for(const x of c.laps)if(x.end<=t)l=x;
  const E=l?l.hyE:c.M.hy.usable,X=l?l.hyX:c.plan.hyX||0;
  return '<div class="rt-k">'+tr('PACK')+' <b>'+Math.round(hybRaceSoc(c.M,E))+'%</b> • '+tr('PLUG-IN DEPLOY')+' <b>'+Math.round(X*100)+'%</b></div>';
}
