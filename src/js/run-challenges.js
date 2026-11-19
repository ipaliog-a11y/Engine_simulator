// ====== VEHICLE RUN CHALLENGES (build 341; real roads 343; moose 345) ======
// Dynamic tests on the CHALLENGES tab — not the ENGINE career/scorecard list in challenges.js.
// Economy, fixed-time stages (build 352), moose (345), S-route powerslide (358) and skid pad (367).
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
    desc:'A 200 ft (61 m) circle. Highest speed the car holds on it, as steady lateral g.'}
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
  return{ok:false,reason:'unimplemented',challenge:ch};
}
