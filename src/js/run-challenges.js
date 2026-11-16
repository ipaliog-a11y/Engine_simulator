// ====== VEHICLE RUN CHALLENGES (build 341; real roads 343; moose 345) ======
// Dynamic tests on the CHALLENGES tab — not the ENGINE career/scorecard list in challenges.js.
// Economy + moose ship here. Later: skill, skidpad.
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
  {id:'moose',kind:'moose',name:'Moose Avoidance',
    desc:'ISO 3888-2 double lane change. Highest entry speed with no cone touched.'}
];
let activeRunChallenge='economy';
let chalResult=null;
// Pace = target / min-time (eco-rally). UI: 125%, 150%, 200%. Unused by moose.
let chalPaceFactor=1.25;
const CHAL_PACE_OPTS=[1.25,1.5,2];
function runChallengeById(id){
  return RUN_CHALLENGES.find(c=>c.id===id)||RUN_CHALLENGES[0];
}
function solveRunChallenge(id){
  const ch=runChallengeById(id||activeRunChallenge);
  if(!ch)return null;
  if(ch.kind==='economy')return simulateEconomyChallenge(ch.road,chalPaceFactor);
  if(ch.kind==='moose')return simulateMooseChallenge();
  return{ok:false,reason:'unimplemented',challenge:ch};
}
