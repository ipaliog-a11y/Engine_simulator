// ====== VEHICLE RUN CHALLENGES (build 341; real roads 343; moose 345) ======
// Dynamic tests on the CHALLENGES tab — not the ENGINE career/scorecard list in challenges.js.
// Economy, fixed-time stages (build 352), moose (345), S-route powerslide (358), skid pad (368),
// spiral pad and figure 8 (course-pads.js).
const RUN_CHALLENGES=[
  {id:'economy',kind:'economy',name:'Mountain Economy',
    desc:'Open mountain road. Finish inside the time limit; burn as little fuel as you can.',
    road:'alpine'},
  {id:'economy-dragon',kind:'economy',name:'Dragon Economy',
    desc:'Tail of the Dragon, US 129. Finish inside the time limit; burn as little fuel as you can.',
    road:'dragon'},
  {id:'economy-bigsur',kind:'economy',name:'Big Sur Economy',
    desc:'Big Sur Coast Highway mid-coast. Finish inside the time limit; burn as little fuel as you can.',
    road:'bigsur'},
  {id:'economy-napoleon',kind:'economy',name:'Napoleon Economy',
    desc:'Route Napoleon Digne to Grasse. Finish inside the time limit; burn as little fuel as you can.',
    road:'napoleon'},
  {id:'economy-highland',kind:'economy',name:'Highland Economy',
    desc:'Scotland A85 Oban to Lochearnhead. Finish inside the time limit; burn as little fuel as you can.',
    road:'highland'},
  {id:'economy-targa',kind:'economy',name:'Targa Economy',
    desc:'Targa Florio Piccolo open stage. Finish inside the time limit; burn as little fuel as you can.',
    road:'targa'},
  // Fixed-time stages (build 352): one target for every car; slower is a DNF. Authored content, set from a reference:
  // a VW Golf GTI Mk7 preset's min-time on each road (ecoMinTime at build 352: 410.2, 873.9, 969.8, 2743.2, 1742.6,
  // 1931.2 s) plus 2%, rounded up to 5 s — the margin the track objectives keep (challenges.js). A hot hatch at the
  // limit just makes it; an NA MX-5, a Fiat 500 or a Prius does not. Re-set the same way if the physics moves it.
  {id:'stage-alpine',kind:'stage',name:'Alpine Stage',road:'alpine',target:420,
    desc:'Alpine Pass against the clock. Make the set time or DNF.'},
  {id:'stage-dragon',kind:'stage',name:'Dragon Stage',road:'dragon',target:895,
    desc:'Tail of the Dragon against the clock. Make the set time or DNF.'},
  {id:'stage-bigsur',kind:'stage',name:'Big Sur Stage',road:'bigsur',target:990,
    desc:'Big Sur mid-coast against the clock. Make the set time or DNF.'},
  {id:'stage-napoleon',kind:'stage',name:'Napoleon Stage',road:'napoleon',target:2800,
    desc:'Route Napoleon Digne to Grasse against the clock. Make the set time or DNF.'},
  {id:'stage-highland',kind:'stage',name:'Highland Stage',road:'highland',target:1780,
    desc:'A85 Oban to Lochearnhead against the clock. Make the set time or DNF.'},
  {id:'stage-targa',kind:'stage',name:'Targa Stage',road:'targa',target:1970,
    desc:'Targa Florio Piccolo against the clock. Make the set time or DNF.'},
  {id:'moose',kind:'moose',name:'Moose Avoidance',
    desc:'ISO 3888-2 double lane change. Highest entry speed with no cone touched.'},
  {id:'drift-s',kind:'drift',name:'S-Route Powerslide',
    desc:'Point-to-point S: two linked corners. Hold a controlled powerslide through both, or fail honestly.'},
  {id:'skidpad',kind:'skidpad',name:'Skid Pad',
    desc:'A 200 ft (61 m) circle. Highest speed the car holds on it, as steady lateral g.'},
  {id:'spiral',kind:'spiral',name:'Spiral Skid Pad',
    desc:'One turn out from a 12 m bend to the skid pad radius. The speed target rises as the bend opens.'},
  {id:'fig8',kind:'fig8',name:'Figure 8',
    desc:'A lemniscate, one loop each way. Highest speed held through both, tightest bend half the skid pad.'}
];
let activeRunChallenge='economy';
let chalResult=null;
// Pace = target / min-time (eco-rally). UI: 125%, 150%, 200%. Economy only (stages and moose hide it).
let chalPaceFactor=1.25;
const CHAL_PACE_OPTS=[1.25,1.5,2];
function runChallengeById(id){
  return RUN_CHALLENGES.find(c=>c.id===id)||RUN_CHALLENGES[0];
}
function solveRunChallenge(id){
  const ch=runChallengeById(id||activeRunChallenge);
  if(!ch)return null;
  if(ch.kind==='economy')return simulateEconomyChallenge(ch.road,chalPaceFactor);
  if(ch.kind==='stage')return simulateStageChallenge(ch.road,ch.target);
  if(ch.kind==='moose')return simulateMooseChallenge();
  if(ch.kind==='drift')return simulateDriftChallenge();
  if(ch.kind==='skidpad')return simulateSkidpadChallenge();
  if(ch.kind==='spiral')return simulateSpiralChallenge();
  if(ch.kind==='fig8')return simulateFig8Challenge();
  return{ok:false,reason:'unimplemented',challenge:ch};
}
// Each challenge's own score, for the ranking (build 370, src/js/chal-rank.js). Keyed by kind; an entry may carry its
// own `score` instead. A new challenge registers here (or on its entry) and the ranking needs no change.
// score(R) runs with that car loaded and returns {v, higher, pass, text}: v sorts (higher is better when `higher`),
// pass is the challenge's own pass/fail, text is shown. Return null when R has nothing to rank.
const RUN_CHALLENGE_SCORES={
  // Economy: each car against its own target time. Sorted by energy drawn from the tank or pack (fuel: litres ×
  // density × LHV from FUELS; EV: pack kWh × 3.6 MJ), so petrol, diesel and EVs share one scale; shown in their own unit.
  economy:R=>{
    const f=!R.ev&&powertrain().fuel(),mj=R.ev?R.kWh*3.6:R.fuelL*(f?f.density*f.LHV:0);
    return{v:mj,higher:false,pass:Math.abs(R.time-R.target)<=Math.max(1,0.01*R.target),
      text:(R.ev?R.kWh.toFixed(2)+' kWh':R.fuelL.toFixed(2)+' L')+' · '+mj.toFixed(1)+' MJ'};
  },
  stage:R=>({v:R.time,higher:false,pass:!R.dnf,text:R.time.toFixed(1)+' s'}),
  moose:R=>({v:R.speedKmh,higher:true,pass:R.outcome==='CLEAR',text:R.speedKmh+' km/h · '+tr(R.outcome)}),
  // Skid pad (build 368): the magazines' figure v²/(g·R) from the held lap; HOLD passes.
  skidpad:R=>({v:R.gLap,higher:true,pass:R.outcome==='HOLD',text:R.gLap.toFixed(2)+' g · '+tr(R.outcome)}),
  // Spiral: the speed it actually carries at the outer bend (the target climbs with the radius). Figure 8: the
  // speed held through both loops. HOLD passes either.
  spiral:R=>({v:R.exitKmh,higher:true,pass:R.outcome==='HOLD',text:R.exitKmh.toFixed(0)+' km/h · '+R.gExit.toFixed(2)+' g'}),
  fig8:R=>({v:R.speedKmh,higher:true,pass:R.outcome==='HOLD',text:R.speedKmh.toFixed(0)+' km/h · '+R.gLap.toFixed(2)+' g'}),
  drift:R=>({v:R.score||0,higher:true,pass:R.outcome==='CLEAR',text:(R.score||0)+' · '+(R.vCornerKmh||0).toFixed(0)+' km/h · '+R.peakBeta.toFixed(1)+'° · '+tr(R.outcome)})
};
function runChallengeScore(ch,R){
  if(!R||!R.ok)return null;
  const f=ch.score||RUN_CHALLENGE_SCORES[ch.kind];
  return f?f(R):null;
}
