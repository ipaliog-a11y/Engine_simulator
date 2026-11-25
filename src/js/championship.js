// ---- CHAMPIONSHIP (post-v1.0): seasons on top of simulateRace ----
// Orchestrates classes, calendars, points, economy, teams, career, soft BoP and endurance
// regs. Race physics stay in race.js; sporting numbers here are named rules.
const CHAMP={
  seedPrime:10007,     // round i uses seed + i * seedPrime
  maxGrid:8,
  historyN:8,
  tyreDry:3,           // dry sets per weekend (P3)
  tyreWet:2,
  entryFee:5000,       // credits (P3)
  prize:[20000,12000,8000,5000,3000,2000,1000,500],
  vscMistakes:3,       // mistakes that open a VSC (P5)
  vscPace:0.6,         // speed under VSC as a share of free pace
  vscLaps:1,           // VSC lasts this many leader laps
  blueIgnorePen:5,     // s added for ignoring blue (P5)
  ballastStep:10,      // kg soft BoP steps (P7)
  tyreSetCost:1500     // credits per extra tyre set in career mode
};
const CHAMP_POINTS={
  top8:[10,8,6,5,4,3,2,1],
  f1:[25,18,15,12,10,8,6,4,2,1]
};
// Racing classes: eligibility from preset tags (chassis / cat / powertrain / published hp).
const CHAMP_CLASSES={
  kei_cup:{id:'kei_cup',label:'KEI CUP',eligible:p=>{
    return p.chassis==='kei'||p.cat==='Kei & City';
  }},
  hot_hatch:{id:'hot_hatch',label:'HOT HATCH',eligible:p=>{
    const hp=champEngineHp(p);return (p.chassis==='hatch'||p.cat==='Compact Turbo')&&hp>=100&&hp<=360;
  }},
  sports:{id:'sports',label:'SPORTS',eligible:p=>{
    const hp=champEngineHp(p);return (p.chassis==='roadster'||p.chassis==='coupe'||p.cat==='NA Sports')&&hp>0&&hp<=400
      &&p.cat!=='Supercar'&&p.cat!=='American V8'&&p.cat!=='Electric'&&p.cat!=='Hybrid';
  }},
  muscle:{id:'muscle',label:'MUSCLE',eligible:p=>{
    return p.chassis==='muscle'||p.cat==='American V8';
  }},
  touring:{id:'touring',label:'TOURING',eligible:p=>{
    return p.chassis==='sedan'||p.chassis==='rally';
  }},
  gt:{id:'gt',label:'GT',eligible:p=>{
    const hp=champEngineHp(p);return (p.chassis==='gt'||p.chassis==='super'||p.cat==='Supercar')&&hp>=300&&hp<=700;
  }},
  proto:{id:'proto',label:'PROTO',eligible:p=>{
    return p.chassis==='proto'||p.chassis==='openwheel'||p.cat==='Track';
  }},
  ev_cup:{id:'ev_cup',label:'EV CUP',eligible:p=>p.cat==='Electric'},
  hyb_cup:{id:'hyb_cup',label:'HYBRID CUP',eligible:p=>p.cat==='Hybrid'},
  open:{id:'open',label:'OPEN',eligible:()=>true}
};
function champEngineHp(p){
  if(p&&p._hp!=null)return p._hp;
  const ep=(typeof FACTORY_ENGINES!=='undefined'?FACTORY_ENGINES:[]).find(e=>e.name===p.engine);
  return ep&&ep.real&&ep.real.hp||0;
}
function champMarque(name){return String(name||'').split(/\s+/)[0]||'—';}
function champPowertrain(p){
  if(p.cat==='Electric')return 'electric';
  if(p.cat==='Hybrid')return 'hybrid';
  return 'combustion';
}
// Soft BoP (P7): ballast kg so that published power/mass sits nearer the class median. Rule, not a fit of the engine.
function champBallastKg(p,cls){
  if(!cls||cls.id==='open')return 0;
  const pool=champEligiblePresets(cls.id);if(pool.length<3)return 0;
  const ratio=q=>{const hp=champEngineHp(q),m=(q.body&&q.body.kg)||1200;return hp/Math.max(1,m);};
  const rs=pool.map(ratio).sort((a,b)=>a-b),med=rs[Math.floor(rs.length/2)];
  const r=ratio(p);if(!(r>med*1.08))return 0;
  const kg=Math.round((1-med/r)*((p.body&&p.body.kg)||1200)/CHAMP.ballastStep)*CHAMP.ballastStep;
  return clamp(kg,0,120);
}
function champEligiblePresets(classId){
  const cls=CHAMP_CLASSES[classId]||CHAMP_CLASSES.open;
  return FACTORY_CARS.filter(p=>cls.eligible(p));
}
function champEligibleIndices(classId){
  const cls=CHAMP_CLASSES[classId]||CHAMP_CLASSES.open;
  return FACTORY_CARS.map((p,i)=>cls.eligible(p)?i:-1).filter(i=>i>=0);
}
// Authored calendars (shipped tracks only).
const CHAMP_SERIES=[
  {id:'pixel_gt',name:'PIXEL GT',classId:'gt',pointsId:'top8',unlock:null,
    calendar:[
      {track:'silverstone',laps:8,weather:'dry'},
      {track:'spa',laps:7,weather:'rain'},
      {track:'monza',laps:10,weather:'dry'},
      {track:'suzuka',laps:8,weather:'damp'},
      {track:'yasmarina',laps:8,weather:'dry'}
    ],    regs:{weekend:'quali_race',flPoint:true,economy:true,vsc:true,bop:true}},
  {id:'hatch_cup',name:'HOT HATCH CUP',classId:'hot_hatch',pointsId:'top8',unlock:null,
    calendar:[
      {track:'brands',laps:10,weather:'dry'},
      {track:'hungaro',laps:12,weather:'dry'},
      {track:'zandvoort',laps:10,weather:'damp'},
      {track:'mixed',laps:8,weather:'dry'}
    ],regs:{weekend:'quali_race',flPoint:true,economy:true,vsc:true,bop:true}},
  {id:'sports_trophy',name:'SPORTS TROPHY',classId:'sports',pointsId:'top8',unlock:null,
    calendar:[
      {track:'catalunya',laps:8,weather:'dry'},
      {track:'spielberg',laps:10,weather:'dry'},
      {track:'tech',laps:8,weather:'dry'},
      {track:'fast',laps:6,weather:'dry'}
    ],regs:{weekend:'feature',flPoint:false,economy:false,vsc:true}},
  {id:'kei_cup',name:'KEI CUP',classId:'kei_cup',pointsId:'top8',unlock:null,
    calendar:[
      {track:'brands',laps:10,weather:'dry'},
      {track:'tech',laps:8,weather:'dry'},
      {track:'suzuka',laps:6,weather:'damp'}
    ],regs:{weekend:'quali_race',flPoint:true,economy:true,vsc:true,bop:true}},
  {id:'muscle_cup',name:'MUSCLE SERIES',classId:'muscle',pointsId:'top8',unlock:null,
    calendar:[
      {track:'laguna',laps:8,weather:'dry'},
      {track:'cota',laps:7,weather:'dry'},
      {track:'montreal',laps:8,weather:'damp'},
      {track:'fast',laps:8,weather:'dry'}
    ],regs:{weekend:'quali_race',flPoint:true,economy:true,vsc:true,bop:true}},
  {id:'touring_cup',name:'TOURING CUP',classId:'touring',pointsId:'top8',unlock:null,
    calendar:[
      {track:'brands',laps:10,weather:'dry'},
      {track:'zandvoort',laps:9,weather:'damp'},
      {track:'spielberg',laps:9,weather:'dry'},
      {track:'nurgp',laps:7,weather:'rain'}
    ],regs:{weekend:'quali_race',flPoint:true,economy:true,vsc:true,bop:true}},
  {id:'proto_cup',name:'PROTOTYPE SERIES',classId:'proto',pointsId:'top8',unlock:null,
    calendar:[
      {track:'lemans',laps:6,weather:'dry'},
      {track:'spa',laps:8,weather:'damp'},
      {track:'silverstone',laps:9,weather:'dry'},
      {track:'monza',laps:10,weather:'dry'}
    ],regs:{weekend:'quali_race',flPoint:true,economy:true,vsc:true,bop:true}},
  {id:'hybrid_cup',name:'HYBRID CUP',classId:'hyb_cup',pointsId:'top8',unlock:null,
    calendar:[
      {track:'interlagos',laps:8,weather:'dry'},
      {track:'shanghai',laps:8,weather:'damp'},
      {track:'catalunya',laps:8,weather:'dry'},
      {track:'yasmarina',laps:8,weather:'dry'}
    ],regs:{weekend:'quali_race',flPoint:true,economy:true,vsc:true,bop:true}},
  {id:'ev_series',name:'EV SERIES',classId:'ev_cup',pointsId:'top8',unlock:'hatch_cup',
    calendar:[
      {track:'shanghai',laps:8,weather:'dry'},
      {track:'montreal',laps:8,weather:'dry'},
      {track:'sepang',laps:7,weather:'wet'}
    ],regs:{weekend:'quali_race',flPoint:true,economy:true,vsc:true}},
  {id:'enduro_cup',name:'ENDURO CUP',classId:'gt',pointsId:'top8',unlock:'pixel_gt',
    calendar:[
      {track:'spa',laps:0,durationMin:20,weather:'dry',minStops:1},
      {track:'nurgp',laps:0,durationMin:25,weather:'damp',minStops:1},
      {track:'interlagos',laps:0,durationMin:20,weather:'dry',minStops:1}
    ],    regs:{weekend:'feature',flPoint:true,economy:true,vsc:true,endurance:true,bop:true}},
  {id:'multi_open',name:'OPEN WEEKEND',classIds:['gt','hot_hatch'],classId:'open',pointsId:'top8',unlock:null,
    calendar:[
      {track:'cota',laps:6,weather:'dry'},
      {track:'melbourne',laps:6,weather:'dry'}
    ],regs:{weekend:'feature',flPoint:false,economy:false,vsc:true,multiClass:true,bop:true}}
];
function champSeries(id){return CHAMP_SERIES.find(s=>s.id===id)||CHAMP_SERIES[0];}
function champPointsTable(id){return CHAMP_POINTS[id]||CHAMP_POINTS.top8;}
function champRoundSeed(seasonSeed,roundIdx){return ((seasonSeed>>>0)+roundIdx*CHAMP.seedPrime)>>>0;}
// ---- persistence ----
function champLoad(key,fallback){
  try{const raw=localStorage.getItem(key);if(!raw)return fallback;return JSON.parse(raw);}catch(e){return fallback;}
}
function champSave(key,val){
  try{localStorage.setItem(key,JSON.stringify(val));return true;}catch(e){return false;}
}
function champActive(){return champLoad('pes.champ.active',null);}
function champSaveActive(S){return champSave('pes.champ.active',S);}
function champClearActive(){try{localStorage.removeItem('pes.champ.active');}catch(e){}}
function champHistory(){return champLoad('pes.champ.history',[]);}
function champPushHistory(S){
  const h=champHistory();
  h.unshift({id:S.id,seriesId:S.seriesId,name:S.name,seed:S.seed,standings:S.standings,teamStandings:S.teamStandings||[],
    finishedAt:new Date().toISOString().slice(0,10),rounds:S.results.length});
  champSave('pes.champ.history',h.slice(0,CHAMP.historyN));
}
function champCareer(){return champLoad('pes.champ.career',{unlocked:['pixel_gt','hatch_cup','sports_trophy','kei_cup','muscle_cup','touring_cup','proto_cup','hybrid_cup','multi_open'],finished:[],credits:50000});}
function champSaveCareer(C){return champSave('pes.champ.career',C);}
function champTeam(){return champLoad('pes.champ.team',null);}
function champSaveTeam(T){return champSave('pes.champ.team',T);}
// ---- entrants ----
function champEntrantFromPreset(i,opts){
  const p=FACTORY_CARS[i],ep=p&&FACTORY_ENGINES.find(x=>x.name===p.engine);if(!ep)return null;
  const cls=opts&&opts.classId?CHAMP_CLASSES[opts.classId]:null;
  const ballast=opts&&opts.bop?champBallastKg(p,cls):0;
  const vehicle=vehicleFromPreset(p);
  if(ballast)vehicle.ballastKg=(vehicle.ballastKg||0)+ballast;
  const drivers=Object.keys(RACE_DRIVERS);
  const drv=(opts&&opts.driver)||drivers[(i*3+1)%drivers.length];
  const teamId=opts&&opts.teamId||null;
  const classTag=opts&&opts.classTag||(cls?cls.id:null);
  return {name:p.name,base:p.name,presetIdx:i,teamId,classTag,ballast,
    build:{engine:Object.assign({},ep.engine),tune:Object.assign({},STD_TUNE),vehicle,name:p.name},
    strat:{stops:'auto',mode:'normal',start:'auto',wetCall:'auto',driver:drv}};
}
function champFillGrid(classId,n,seed,opts){
  opts=opts||{};
  const idxs=champEligibleIndices(classId);if(!idxs.length)return [];
  const rnd=mulberry32((seed>>>0)||1),pick=idxs.slice();
  for(let i=pick.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));const t=pick[i];pick[i]=pick[j];pick[j]=t;}
  const out=[],take=Math.min(n||CHAMP.maxGrid,pick.length,CHAMP.maxGrid);
  for(let k=0;k<take;k++){
    const e=champEntrantFromPreset(pick[k],{classId,bop:!!opts.bop,classTag:classId});
    if(e)out.push(e);
  }
  return out;
}
function champFillMultiGrid(classIds,nEach,seed,opts){
  const out=[];
  (classIds||[]).forEach((cid,i)=>{
    const part=champFillGrid(cid,nEach||3,seed+i*17,Object.assign({},opts,{bop:true}));
    part.forEach(e=>{e.classTag=cid;out.push(e);});
  });
  return out.slice(0,CHAMP.maxGrid);
}
// ---- standings / points ----
function champBlankStandings(entrants){
  return entrants.map((e,id)=>({id,name:e.name,pts:0,wins:0,poles:0,fl:0,teamId:e.teamId||null,classTag:e.classTag||null,marque:champMarque(e.name)}));
}
function champApplyPoints(standings,results,table,extras){
  extras=extras||{};
  const byId=new Map(standings.map(s=>[s.id,s]));
  results.forEach((r,k)=>{
    const s=byId.get(r.id);if(!s)return;
    if(r.state==='dnf'||r.state==='dsq')return;
    const pts=(table[k]||0)+(extras.flId===r.id?(extras.flPoint?1:0):0);
    s.pts+=pts;if(k===0)s.wins++;
  });
  if(extras.poleId!=null){const s=byId.get(extras.poleId);if(s)s.poles++;}
  if(extras.flId!=null){const s=byId.get(extras.flId);if(s)s.fl++;}
  standings.sort((a,b)=>b.pts-a.pts||b.wins-a.wins||a.name.localeCompare(b.name));
  return standings;
}
function champTeamStandings(standings){
  const map=new Map();
  for(const s of standings){
    const tid=s.teamId;if(!tid)continue;
    if(!map.has(tid))map.set(tid,{id:tid,name:tid,pts:0,wins:0});
    const t=map.get(tid);t.pts+=s.pts;t.wins+=s.wins;
  }
  return [...map.values()].sort((a,b)=>b.pts-a.pts||b.wins-a.wins);
}
function champClassStandings(standings,classTag){
  return standings.filter(s=>s.classTag===classTag).slice().sort((a,b)=>b.pts-a.pts||b.wins-a.wins);
}
function champFastestLapId(results){
  let best=null,id=null;
  for(const r of results){if(r.best!=null&&(best==null||r.best<best)){best=r.best;id=r.id;}}
  return id;
}
// ---- player team class eligibility ----
function champSeatDescriptor(seat){
  if(!seat)return null;
  const ref=seat.ref!=null?String(seat.ref):'';
  const pIdx=seat.presetIdx!=null?seat.presetIdx:(ref.startsWith('p:')?+ref.slice(2):null);
  if(pIdx!=null&&Number.isInteger(pIdx)&&FACTORY_CARS[pIdx])return FACTORY_CARS[pIdx];
  const e=ref==='cur'?raceEntrantFrom('cur'):(ref.startsWith('g:')?raceEntrantFrom(ref):null);
  if(!e||!e.build)return null;
  const b=e.build,v=b.vehicle||{},eng=b.engine||{};
  const ev=!!eng.ev||eng.powertrain==='electric';
  const hy=!ev&&!!(eng.hyMode&&eng.hyMode!=='none');
  let hp=0;
  if(ref==='cur'&&typeof powertrain==='function'&&powertrain().ready())hp=powertrain().rating().peakHP||0;
  else if(b.score&&b.score.peakHP)hp=b.score.peakHP;
  else if(typeof withBuild==='function'){try{hp=withBuild(b,()=>powertrain().ready()?powertrain().rating().peakHP||0:0);}catch(err){hp=0;}}
  return {name:e.name,chassis:v.chassis||'',cat:ev?'Electric':hy?'Hybrid':'',body:{kg:v.mass||1200},_hp:hp};
}
function champSeatEligible(seat,series){
  if(!series)return true;
  const multi=!!(series.regs&&series.regs.multiClass&&series.classIds&&series.classIds.length);
  if(!multi&&(!series.classId||series.classId==='open'))return true;
  const desc=champSeatDescriptor(seat);
  if(!desc)return false;
  if(multi)return series.classIds.some(cid=>CHAMP_CLASSES[cid]&&CHAMP_CLASSES[cid].eligible(desc));
  const cls=CHAMP_CLASSES[series.classId];
  return !cls||cls.eligible(desc);
}
function champCheckTeamEligibility(team,series){
  if(!team||!team.cars||!team.cars.length)return {ok:true,bad:[]};
  const bad=[];
  team.cars.slice(0,2).forEach(seat=>{
    if(!champSeatEligible(seat,series)){
      const desc=champSeatDescriptor(seat);
      bad.push((desc&&desc.name)||seat.ref||'—');
    }
  });
  return {ok:!bad.length,bad};
}
// ---- season lifecycle ----
function champNewSeason(seriesId,opts){
  opts=opts||{};
  const series=champSeries(seriesId);
  const career=champCareer();
  const mode=opts.mode||'round'; // 'round'|'instant'|'career'
  const isCareer=mode==='career';
  const seed=(opts.seed>>>0)||(1+Math.floor(Math.random()*99999));
  const multi=series.regs&&series.regs.multiClass&&series.classIds;
  let entrants;
  if(opts.entrants&&opts.entrants.length>=2)entrants=opts.entrants.slice(0,CHAMP.maxGrid);
  else if(multi)entrants=champFillMultiGrid(series.classIds,Math.ceil(CHAMP.maxGrid/series.classIds.length),seed,{bop:true});
  else entrants=champFillGrid(series.classId,CHAMP.maxGrid,seed,{bop:!!(series.regs&&series.regs.bop)});
  // attach player team cars (P4) with class eligibility check
  const team=champTeam(),ineligibleTeam=[];
  if(team&&team.cars&&team.cars.length&&(opts.useTeam||isCareer)){
    const bop=!!(series.regs&&series.regs.bop);
    team.cars.slice(0,2).forEach(seat=>{
      if(!champSeatEligible(seat,series)){
        const d=champSeatDescriptor(seat);
        ineligibleTeam.push((d&&d.name)||seat.ref||'—');
        return;
      }
      const ref=seat.ref!=null?String(seat.ref):'';
      const pIdx=seat.presetIdx!=null?seat.presetIdx:(ref.startsWith('p:')?+ref.slice(2):null);
      let clsId=series.classId;
      if(multi){
        const d=champSeatDescriptor(seat);
        clsId=(d&&series.classIds.find(cid=>CHAMP_CLASSES[cid]&&CHAMP_CLASSES[cid].eligible(d)))||series.classIds[0];
      }
      let e=null;
      if(pIdx!=null&&Number.isInteger(pIdx))e=champEntrantFromPreset(pIdx,{classId:clsId,classTag:clsId,driver:seat.driver||'balanced',teamId:team.id,bop});
      else if(ref==='cur')e=raceEntrantFrom('cur');
      else if(ref.startsWith('g:'))e=raceEntrantFrom(ref);
      if(e){
        if(entrants.length>=CHAMP.maxGrid)entrants.pop();
        e.teamId=team.id;
        if(!e.classTag)e.classTag=clsId;
        e.strat=e.strat||{stops:'auto',mode:'normal',start:'auto',wetCall:'auto',driver:seat.driver||'balanced'};
        e.strat.driver=seat.driver||e.strat.driver||'balanced';
        entrants.unshift(e);
      }
    });
  }
  const hasEco=isCareer||!!(series.regs&&series.regs.economy);
  const dryInit=isCareer?CHAMP.tyreDry+Math.max(0,series.calendar.length-1):CHAMP.tyreDry;
  const wetInit=isCareer?CHAMP.tyreWet+Math.max(0,Math.floor(series.calendar.length/2)):CHAMP.tyreWet;
  const economy=hasEco?{
    credits:opts.credits!=null?opts.credits:(career.credits||50000),
    tyres:entrants.map(()=>({dry:dryInit,wet:wetInit})),
    spent:0,earned:0,tyresBought:0,career:isCareer
  }:null;
  const S={
    id:'s'+Date.now().toString(36),
    seriesId:series.id,name:series.name,seed,roundIdx:0,
    entrants,standings:champBlankStandings(entrants),teamStandings:[],
    results:[],economy,regs:Object.assign({},series.regs),
    classId:series.classId,classIds:series.classIds||null,pointsId:series.pointsId,
    calendar:series.calendar.slice(),mode,ineligibleTeam
  };
  champSaveActive(S);return S;
}
function champRoundCfg(S,roundIdx){
  const round=S.calendar[roundIdx];if(!round)return null;
  const seed=champRoundSeed(S.seed,roundIdx);
  // timed races: plan fuel/stops for ~100 s/lap worth of distance (rule of thumb for strategy only)
  const laps=round.laps>0?round.laps:(round.durationMin?Math.max((round.minStops||0)+2,Math.ceil(round.durationMin*60/100)):5);
  return {
    track:round.track,laps,durationSec:round.durationMin?round.durationMin*60:0,
    minStops:round.minStops||0,weather:round.weather||'dry',air:RACE.air,
    grid:'quali',warmers:false,seed,strategy:'auto',
    vsc:!!(S.regs&&S.regs.vsc),cars:S.entrants.map(e=>{
      const x=Object.assign({},e.strat||{});if(/^\d$/.test(x.stops))x.stops=+x.stops;return x;
    })
  };
}
function champRunQuali(S,roundIdx){
  const cfg=champRoundCfg(S,roundIdx);if(!cfg)return null;
  // one hot-lap each via raceCarModel.qual (already solved inside the model)
  const models=S.entrants.map(e=>raceCarModel(e,cfg.track,{wet:cfg.weather!=='dry'}));
  const order=models.map((M,k)=>({id:k,qual:M.qual,name:M.name})).sort((a,b)=>a.qual-b.qual||a.id-b.id);
  return {models,order,poleId:order[0].id,cfg};
}
function champApplyRaceToSeason(S,R,meta){
  meta=meta||{};
  let results=raceResults(R);
  // post-race time penalties (P5) already folded into finishT when set on cars; re-sort if needed
  const table=champPointsTable(S.pointsId);
  const flId=champFastestLapId(results);
  const flPoint=!!(S.regs&&S.regs.flPoint);
  champApplyPoints(S.standings,results,table,{flId,flPoint,poleId:meta.poleId});
  S.teamStandings=champTeamStandings(S.standings);
  // economy (P3): entry fee, tyre set consumption across rounds, player prize credits; career persists credits
  if(S.economy){
    const team=champTeam(),teamId=team&&team.id;
    S.economy.credits-=CHAMP.entryFee;
    S.economy.spent=(S.economy.spent||0)+CHAMP.entryFee;
    if(S.economy.tyres){
      results.forEach(r=>{
        const ts=S.economy.tyres[r.id];if(!ts)return;
        const stints=r.stints&&r.stints.length?r.stints:[{tyre:(R.cfg&&R.cfg.weather==='wet')?'wet':'dry'}];
        let dryUsed=0,wetUsed=0;
        stints.forEach(st=>{if(st.tyre==='wet'||st.tyre==='inter')wetUsed++;else dryUsed++;});
        let extra=0;
        if(dryUsed>ts.dry){extra+=dryUsed-ts.dry;ts.dry=0;}else ts.dry-=dryUsed;
        if(wetUsed>ts.wet){extra+=wetUsed-ts.wet;ts.wet=0;}else ts.wet-=wetUsed;
        if(extra>0&&S.mode==='career'){
          const ent=S.entrants&&S.entrants[r.id];
          if(ent&&ent.teamId&&(!teamId||ent.teamId===teamId)){
            const cost=extra*CHAMP.tyreSetCost;
            S.economy.credits-=cost;
            S.economy.spent=(S.economy.spent||0)+cost;
            S.economy.tyresBought=(S.economy.tyresBought||0)+extra;
          }
        }
      });
    }
    results.forEach((r,k)=>{
      if(r.state==='dnf'||r.state==='dsq')return;
      const ent=S.entrants&&S.entrants[r.id];
      if(ent&&ent.teamId&&(!teamId||ent.teamId===teamId)){
        const p=CHAMP.prize[k]||0;
        S.economy.credits+=p;
        S.economy.earned=(S.economy.earned||0)+p;
      }
    });
    if(S.mode==='career'){const career=champCareer();career.credits=S.economy.credits;champSaveCareer(career);}
  }
  S.results.push({roundIdx:S.roundIdx,track:R.cfg.track,seed:R.cfg.seed,classification:results,
    poleId:meta.poleId,flId,quali:meta.quali||null});
  S.roundIdx++;
  if(S.roundIdx>=S.calendar.length)champFinishSeason(S);
  else champSaveActive(S);
  return S;
}
function champFinishSeason(S){
  S.done=true;
  champPushHistory(S);
  // career unlock (P6): finishing a series opens dependents that list it as unlock; credits persist in career mode
  const career=champCareer();
  if(!career.finished)career.finished=[];
  if(career.finished.indexOf(S.seriesId)<0)career.finished.push(S.seriesId);
  if(career.unlocked.indexOf(S.seriesId)<0)career.unlocked.push(S.seriesId);
  CHAMP_SERIES.filter(s=>s.unlock===S.seriesId).forEach(s=>{
    if(career.unlocked.indexOf(s.id)<0)career.unlocked.push(s.id);
  });
  if(S.economy&&S.mode==='career')career.credits=S.economy.credits;
  champSaveCareer(career);
  champClearActive();
  champSave('pes.champ.last',S);
  return S;
}
async function champSimulateRound(S,opts){
  opts=opts||{};
  const yieldFn=opts.yieldFn||(()=>new Promise(r=>setTimeout(r,0)));
  const cfg=champRoundCfg(S,S.roundIdx);if(!cfg)throw new Error('no round');
  let poleId=null,quali=null,models;
  if(S.regs&&S.regs.weekend==='quali_race'){
    const Q=champRunQuali(S,S.roundIdx);
    models=Q.models;poleId=Q.poleId;quali=Q.order;
    // feature grid follows quali order: raceInit already sorts by .qual on models
  }else{
    models=[];
    for(let k=0;k<S.entrants.length;k++){
      if(opts.onProg)opts.onProg(k/S.entrants.length*0.7,S.entrants[k].name);
      await yieldFn();
      models.push(raceCarModel(S.entrants[k],cfg.track,{wet:cfg.weather!=='dry'}));
    }
  }
  if(opts.onProg)opts.onProg(0.75,'RACING');
  await yieldFn();
  const R=raceInit(models,cfg);
  while(!raceRun(R,40)){if(opts.onProg)opts.onProg(0.75+0.25*Math.min(1,R.t/Math.max(1,cfg.durationSec||models[0].lapNom*cfg.laps)),'RACING');await yieldFn();}
  champApplyRaceToSeason(S,R,{poleId,quali});
  return R;
}
async function champSimulateSeason(S,opts){
  opts=opts||{};
  let lastR=null;
  while(!S.done&&S.roundIdx<S.calendar.length){
    if(opts.onRound)opts.onRound(S.roundIdx);
    lastR=await champSimulateRound(S,opts);
    if(opts.onRoundDone)opts.onRoundDone(lastR,S.roundIdx-1);
  }
  return S;
}
// Default one-car privateer team (P4).
function champEnsureTeam(){
  let T=champTeam();
  if(T)return T;
  T={id:'player',name:'PLAYER TEAM',credits:50000,cars:[{ref:'cur',driver:'balanced',number:1}],drivers:['balanced','smooth']};
  champSaveTeam(T);return T;
}
