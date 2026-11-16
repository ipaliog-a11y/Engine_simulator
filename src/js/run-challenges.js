// ====== VEHICLE RUN CHALLENGES (build 341) ======
// Dynamic tests on the CHALLENGES tab — not the ENGINE career/scorecard list in challenges.js.
// Each entry has a kind; only economy ships here. Later: skill, moose, skidpad.
const RUN_CHALLENGES=[
  {id:'economy',kind:'economy',name:'Mountain Economy',
    desc:'Open mountain road. Finish inside the time limit; burn as little fuel as you can.',
    road:'alpine'}
];
let activeRunChallenge='economy';
let chalResult=null;
function runChallengeById(id){
  return RUN_CHALLENGES.find(c=>c.id===id)||RUN_CHALLENGES[0];
}
function solveRunChallenge(id){
  const ch=runChallengeById(id||activeRunChallenge);
  if(!ch)return null;
  if(ch.kind==='economy')return simulateEconomyChallenge(ch.road);
  return{ok:false,reason:'unimplemented',challenge:ch};
}
