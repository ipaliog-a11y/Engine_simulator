// ====== USER ROAD: an open road from the player's own GPX file (build G7) ======
// Read locally (FileReader), never uploaded. Produces the same def as ROADS (eco-roads.js), so buildRoad gives it the
// same ds / radius / grade / kv the economy run reads. Not gpxToTrack: that closes the loop and bridges the ends.
// Assumptions, named: GPX carries no speed limit, so USER_ROAD_LIMIT (90 km/h, the common rural single-carriageway limit
// in Italy, Spain and Greece; France 80, Germany 100) applies unless the player sets one; width 7.5 m, modelled, as the
// real ROADS; a file with elevation on under half its points is flat; a missing <ele> elsewhere takes its neighbour's.
const USER_ROAD_KEY='pes.userRoad',USER_ROAD_LIMIT=90,USER_ROAD_STEP=10,USER_ROAD_KM=[0.5,200];
// Ordered points of the first non-empty kind: track points, else route points (waypoints are unordered).
function gpxRoadPoints(text){
  for(const tag of ['trkpt','rtept']){
    const re=new RegExp('<'+tag+'\\b([^>]*?)(?:\\/>|>([\\s\\S]*?)<\\/'+tag+'>)','g'),out=[];let m;
    while((m=re.exec(text))){
      const la=/\blat\s*=\s*["']([-+\d.eE]+)["']/.exec(m[1]),lo=/\blon\s*=\s*["']([-+\d.eE]+)["']/.exec(m[1]);
      if(!la||!lo)continue;
      const lat=+la[1],lon=+lo[1],e=m[2]&&/<ele>\s*([-+\d.eE]+)\s*<\/ele>/.exec(m[2]);
      if(!isFinite(lat)||!isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)continue;
      out.push({lat,lon,ele:e&&isFinite(+e[1])?+e[1]:null});
    }
    if(out.length)return out;
  }
  return [];
}
// GPX text -> ROADS-shaped def. Throws Error(code): 'nopts', 'short', 'long'.
function gpxToRoad(text,opts){
  opts=opts||{};
  const raw=gpxRoadPoints(String(text||''));
  if(raw.length<2)throw new Error('nopts');
  const withEle=raw.filter(p=>p.ele!=null).length,hasEle=withEle>=raw.length/2;
  let last=null;for(const p of raw){if(p.ele!=null)last=p.ele;else p.ele=last;}
  last=null;for(let i=raw.length-1;i>=0;i--){if(raw[i].ele!=null)last=raw[i].ele;else raw[i].ele=last;}
  // Metres by stepping along the trace with each leg's own cos(latitude): local, so a long road keeps its distances.
  const R=6371000,rad=Math.PI/180,P=[{x:0,y:0,z:hasEle?raw[0].ele:0}];
  for(let i=1;i<raw.length;i++){
    const a=raw[i-1],b=raw[i],q=P[P.length-1];
    const dx=(b.lon-a.lon)*rad*R*Math.cos((a.lat+b.lat)/2*rad),dy=-(b.lat-a.lat)*rad*R;
    const z=hasEle?b.ele:0;
    if(Math.hypot(dx,dy)>0.5)P.push({x:q.x+dx,y:q.y+dy,z});else P[P.length-1]=Object.assign({},q,{x:q.x+dx,y:q.y+dy});
  }
  let total=0;const cum=[0];
  for(let i=1;i<P.length;i++){total+=Math.hypot(P[i].x-P[i-1].x,P[i].y-P[i-1].y);cum.push(total);}
  if(total<USER_ROAD_KM[0]*1000)throw new Error('short');
  if(total>USER_ROAD_KM[1]*1000)throw new Error('long');
  // Even 10 m spacing: GPX points bunch and spread with speed, and a starved spline invents corners.
  const N=Math.round(total/USER_ROAD_STEP)+1,pts=[];let k=0;
  for(let j=0;j<N;j++){
    const want=j*total/(N-1);
    while(k<cum.length-2&&cum[k+1]<want)k++;
    const a=P[k],b=P[k+1],seg=cum[k+1]-cum[k],w=seg>1e-9?clamp((want-cum[k])/seg,0,1):0;
    pts.push({x:a.x+(b.x-a.x)*w,y:a.y+(b.y-a.y)*w,z:a.z+(b.z-a.z)*w});
  }
  // Plan: two (1,2,1)/4 passes, ends held, so metre-scale GPS jitter does not read as curvature (the radius is then
  // buildRoad's three-point fit). Height: a ±50 m moving average, since GPS height jitters by metres between fixes and
  // over a 10 m step that reads as tens of percent grade.
  for(let s=0;s<2;s++){const o=pts.map(p=>({x:p.x,y:p.y}));
    for(let i=1;i<N-1;i++){pts[i].x=(o[i-1].x+2*o[i].x+o[i+1].x)/4;pts[i].y=(o[i-1].y+2*o[i].y+o[i+1].y)/4;}}
  const H=5,zs=pts.map(p=>p.z);
  for(let i=0;i<N;i++){let a=0,c=0;for(let d=-H;d<=H;d++){const j=i+d;if(j>=0&&j<N){a+=zs[j];c++;}}pts[i].z=a/c;}
  const minX=Math.min(...pts.map(p=>p.x)),minY=Math.min(...pts.map(p=>p.y)),zMin=Math.min(...pts.map(p=>p.z));
  const lim=clamp(Math.round(+opts.limitKmh||USER_ROAD_LIMIT),30,130);
  const nm=/<name>\s*([^<]{1,60}?)\s*<\/name>/.exec(text);
  return {label:String(opts.name||(nm&&nm[1])||'MY ROAD').replace(/\s+/g,' ').toUpperCase().slice(0,28),
    width:7.5,timeFactor:1.25,open:true,user:true,hasEle,limitKmh:lim,vLimit:lim/3.6,srcPoints:raw.length,
    blurb:'Your GPX road. Distance, bends and grades come from your file'+(hasEle?'':' (no elevation in it, so flat)')+
      '; the speed limit is the one set here (90 km/h unless changed); width modelled 7.5 m.',
    pts:pts.map(p=>({x:+(p.x-minX).toFixed(1),y:+(p.y-minY).toFixed(1),z:+(p.z-zMin).toFixed(1)}))};
}
// One user road at a time: it is ROADS.user, and the challenge 'economy-user' runs on it.
function setUserRoad(def,dom){
  ROADS.user=def;delete roadCache.user;
  if(!RUN_CHALLENGES.find(c=>c.id==='economy-user'))RUN_CHALLENGES.push({id:'economy-user',kind:'economy',name:'My Road Economy',
    desc:'Your own GPX road. Finish inside the time limit at or under its speed limit; burn as little fuel as you can.',road:'user'});
  const sel=dom&&document.getElementById('chalSel');
  if(sel&&!Array.from(sel.options).some(o=>o.value==='economy-user')){
    const gp=sel.querySelector('optgroup')||sel,o=document.createElement('option');
    o.value='economy-user';o.textContent=tr('My Road Economy');gp.appendChild(o);}
}
function saveUserRoad(){try{localStorage.setItem(USER_ROAD_KEY,JSON.stringify(Object.assign({},ROADS.user,
  {pts:ROADS.user.pts.map(p=>[p.x,p.y,p.z])})));}catch(e){}}
function loadUserRoad(){
  try{const o=JSON.parse(localStorage.getItem(USER_ROAD_KEY)||'null');
    if(o&&Array.isArray(o.pts)&&o.pts.length>=2&&o.open)setUserRoad(Object.assign(o,{pts:o.pts.map(a=>({x:a[0],y:a[1],z:a[2]}))}));
  }catch(e){}
}
const USER_ROAD_ERR={nopts:'GPX ROAD: no track or route points found',short:'GPX ROAD: under 0.5 km',long:'GPX ROAD: over 200 km'};
function importUserRoad(text,fallbackName){
  let def;
  try{def=gpxToRoad(text,{name:/<name>/.test(text)?null:fallbackName,limitKmh:ROADS.user&&ROADS.user.limitKmh});}
  catch(e){flash(tr(USER_ROAD_ERR[e.message]||'GPX ROAD: could not read the file'),'err');return null;}
  setUserRoad(def,true);saveUserRoad();
  const T=buildRoad('user');
  activeRunChallenge='economy-user';const sel=document.getElementById('chalSel');if(sel)sel.value='economy-user';
  flash(trIn('msg','IMPORTED')+' '+def.label+' • '+(T.length/1000).toFixed(1)+' km • '+def.limitKmh+' km/h'+(def.hasEle?'':' • '+tr('no elevation: flat')));
  if(typeof refreshChallenge==='function')refreshChallenge();
  return T;
}
function setUserRoadLimit(kmh){
  if(!ROADS.user)return;const lim=clamp(Math.round(+kmh||USER_ROAD_LIMIT),30,130);
  ROADS.user.limitKmh=lim;ROADS.user.vLimit=lim/3.6;delete roadCache.user;saveUserRoad();
}
// CHALLENGES tab: IMPORT GPX ROAD and the road's speed limit (shown with the user road picked).
function bindUserRoad(){
  const b=document.getElementById('btnImportRoad'),f=document.getElementById('roadGpxInput'),L=document.getElementById('chalRoadLimit');
  if(b&&f){b.addEventListener('click',()=>f.click());
    f.addEventListener('change',e=>{const x=e.target.files&&e.target.files[0];
      if(x){const r=new FileReader();r.onload=()=>{importUserRoad(r.result,x.name.replace(/\.gpx$/i,''));syncUserRoadUi();};
        r.onerror=()=>flash(tr('COULD NOT READ FILE'),'err');r.readAsText(x);}
      e.target.value='';});}
  if(L)L.addEventListener('change',e=>{setUserRoadLimit(e.target.value);syncUserRoadUi();if(typeof refreshChallenge==='function')refreshChallenge();});
  syncUserRoadUi();
}
function syncUserRoadUi(){
  const L=document.getElementById('chalRoadLimit');if(!L)return;
  L.parentNode.style.display=activeRunChallenge==='economy-user'&&ROADS.user?'':'none';
  if(ROADS.user)L.value=String(ROADS.user.limitKmh);
}
loadUserRoad();
