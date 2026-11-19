// ====== CHALLENGES: rank several cars on one challenge (build 369) ======
// Each car is loaded in turn (withBuild, as the race does), solved by the challenge's own solver with the settings
// on screen, and scored by runChallengeScore (src/js/run-challenges.js). One car per step, the page yields between
// cars, so the progress bar moves and CANCEL is heard; a car already solving finishes first (the powerslide's
// worst search is ~3 s). Nothing here changes a solver.
const CHAL_RANK_MAX=12;
const chalRank={cars:[],rows:null,ch:null,busy:false,stop:false,prog:0,progTxt:''};
function chalRankAdd(){
  if(chalRank.cars.length>=CHAL_RANK_MAX){flash(tr('TWELVE CARS AT MOST'),'warn');return;}
  const sel=document.getElementById('chalRankAddSel');if(!sel)return;
  const e=raceEntrantFrom(sel.value);if(!e)return;
  const same=chalRank.cars.filter(x=>x.base===e.name).length;
  e.base=e.name;if(same)e.name=e.name+' #'+(same+1);
  chalRank.cars.push(e);renderChalRank();
}
// Pass first, then by score (each challenge says which way is better); cars with no result last.
function chalRankSort(rows){
  return rows.slice().sort((a,b)=>{
    if(!a.s||!b.s)return(a.s?0:1)-(b.s?0:1);
    if(a.s.pass!==b.s.pass)return a.s.pass?-1:1;
    return a.s.higher?b.s.v-a.s.v:a.s.v-b.s.v;
  });
}
async function chalRankRun(){
  if(chalRank.busy||!chalRank.cars.length)return;
  const ch=runChallengeById(activeRunChallenge),cars=chalRank.cars.slice(),rows=[];
  chalRank.busy=true;chalRank.stop=false;chalRank.rows=null;chalRank.ch=ch;
  try{
    for(let k=0;k<cars.length&&!chalRank.stop;k++){
      const e=cars[k];
      chalRank.prog=k/cars.length;chalRank.progTxt=tr('SOLVING')+' '+e.name+' ('+(k+1)+'/'+cars.length+')';renderChalRank();
      await raceYield();await raceYield();
      if(chalRank.stop)break;
      let s=null,err='';
      try{s=withBuild(e.build,()=>{
        if(!powertrain().ready()||!vehicle||!vehicle.mass)return null;
        return runChallengeScore(ch,solveRunChallenge(ch.id));
      });}catch(x){err=String(x&&x.message||x);}
      rows.push({name:e.name,s,err});
    }
  }finally{
    chalRank.busy=false;chalRank.rows=chalRankSort(rows);chalRank.prog=1;
    if(chalRank.stop)flash(tr('RANKING CANCELLED'),'warn');
    renderChalRank();
  }
}
function renderChalRank(){
  const box=document.getElementById('chalRankCars');if(!box)return;
  box.innerHTML=chalRank.cars.length?chalRank.cars.map((e,k)=>
    '<div class="race-ent"><span title="'+esc(e.name)+'">'+esc(e.name)+'</span>'+
    '<button data-rm="'+k+'" aria-label="'+esc(tr('Remove'))+'"'+(chalRank.busy?' disabled':'')+'>✕</button></div>').join('')
    :'<div class="perf-note">'+tr('Add cars to rank them on this challenge: the car you have built, a garage build or a factory car.')+'</div>';
  box.querySelectorAll('button[data-rm]').forEach(b=>b.addEventListener('click',()=>{if(chalRank.busy)return;chalRank.cars.splice(+b.dataset.rm,1);renderChalRank();}));
  const go=document.getElementById('chalRankGo'),stop=document.getElementById('chalRankStop'),add=document.getElementById('chalRankAddBtn');
  if(go){go.disabled=chalRank.busy||!chalRank.cars.length;go.hidden=chalRank.busy;}
  if(stop)stop.hidden=!chalRank.busy;
  if(add)add.disabled=chalRank.busy;
  const pg=document.getElementById('chalRankProg');
  if(pg){pg.hidden=!chalRank.busy;pg.querySelector('.race-prog-bar').style.width=Math.round(chalRank.prog*100)+'%';pg.querySelector('span').textContent=chalRank.progTxt;}
  const out=document.getElementById('chalRankOut');if(!out)return;
  if(!chalRank.rows||chalRank.busy){out.innerHTML='';return;}
  out.innerHTML='<div class="perf-head">'+esc(tr(chalRank.ch.name))+'</div><table class="chal-rank"><thead><tr><th>#</th><th>'+tr('CAR')+'</th><th>'+tr('SCORE')+'</th><th>'+tr('RESULT')+'</th></tr></thead><tbody>'+
    chalRank.rows.map((r,i)=>'<tr><td>'+(i+1)+'</td><td title="'+esc(r.name)+'">'+esc(r.name)+'</td><td>'+(r.s?esc(r.s.text):'—')+'</td>'+
      '<td style="color:'+(r.s?(r.s.pass?'#55dd66':'#ff4444'):'#888')+'">'+(r.s?tr(r.s.pass?'PASS':'FAIL'):tr(r.err?'ERROR':'NO RESULT'))+'</td></tr>').join('')+
    '</tbody></table>';
}
function bindChalRank(){
  if(typeof raceFillAdd==='function')raceFillAdd('chalRankAddSel');
  const g=id=>document.getElementById(id);
  if(g('chalRankAddBtn'))g('chalRankAddBtn').addEventListener('click',chalRankAdd);
  if(g('chalRankGo'))g('chalRankGo').addEventListener('click',chalRankRun);
  if(g('chalRankStop'))g('chalRankStop').addEventListener('click',()=>{chalRank.stop=true;});
  renderChalRank();
}
