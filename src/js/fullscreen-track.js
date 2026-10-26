// ---- the full-screen track view (build 143): the lap, its live instruments and the replay controls ----
// For a phone. ⛶ in the live-timing row moves the map canvas and the replay controls into a page that fills
// the screen (the same elements, so the replay, zoom and pan keep working), asks for real full screen and a
// landscape lock, and where the lock is not to be had (iOS) and the phone is held upright, turns the page a
// quarter itself. The drawing keeps at least 380 units of height, which the instruments need, and takes the
// screen's shape for its width.
const trackPage={open:false,rot:false,homes:null};
function sizeTrackStage(){
  if(!trackPage.open)return;
  const pg=document.getElementById('trackPage');
  trackPage.rot=innerHeight>innerWidth;
  pg.classList.toggle('rot',trackPage.rot);
  const st=document.getElementById('trackStage'),w=st.clientWidth,h=st.clientHeight;   // layout size, before the turn
  if(!(w>0&&h>0))return;
  vizH=Math.round(clamp(h,380,900));
  vizW=Math.round(clamp(vizH*w/h,560,1600));
  sizeCanvas();
}
function openTrackPage(){
  if(trackPage.open||!lapResult)return;
  const pg=document.getElementById('trackPage'),row=document.getElementById('trackReplayRow');
  trackPage.homes=[[canvas,canvas.parentNode,canvas.nextSibling],[row,row.parentNode,row.nextSibling]];
  document.getElementById('trackStage').appendChild(canvas);
  document.getElementById('trackBar').appendChild(row);
  pg.hidden=false;document.body.classList.add('track-open');trackPage.open=true;
  const b=document.getElementById('btnTrackFull');b.textContent='✕';b.title=tr('Leave full screen');
  if(!lapReplay.playing)document.getElementById('btnReplay').click();
  sizeTrackStage();
  // real full screen, then landscape where the browser allows it; either may be refused, and the page works without
  const req=pg.requestFullscreen||pg.webkitRequestFullscreen;
  if(req){try{const pr=req.call(pg);if(pr&&pr.then)pr.then(()=>{if(screen.orientation&&screen.orientation.lock)screen.orientation.lock('landscape').catch(()=>{}).finally(sizeTrackStage);else sizeTrackStage();},()=>{});}catch(e){}}
}
function closeTrackPage(){
  if(!trackPage.open)return;
  try{if(screen.orientation&&screen.orientation.unlock)screen.orientation.unlock();}catch(e){}
  if(document.fullscreenElement)(document.exitFullscreen||document.webkitExitFullscreen||(()=>{})).call(document);
  for(const [el,home,next] of trackPage.homes)home.insertBefore(el,next&&next.parentNode===home?next:null);
  const pg=document.getElementById('trackPage');pg.hidden=true;pg.classList.remove('rot');
  document.body.classList.remove('track-open');trackPage.open=false;trackPage.rot=false;
  const b=document.getElementById('btnTrackFull');b.textContent='⛶';b.title=tr('Full screen');
  vizW=640;vizH=420;sizeCanvas();
}
function bindTrackPage(){
  document.getElementById('btnTrackFull').addEventListener('click',()=>{trackPage.open?closeTrackPage():openTrackPage();});
  addEventListener('resize',sizeTrackStage);
  addEventListener('orientationchange',()=>setTimeout(sizeTrackStage,200));
  addEventListener('keydown',e=>{if(e.key==='Escape'&&trackPage.open&&!document.fullscreenElement)closeTrackPage();});
  // leaving the browser's full screen (a swipe, the back gesture, Esc) leaves the view too
  document.addEventListener('fullscreenchange',()=>{if(trackPage.open&&!document.fullscreenElement&&trackPage.fsWas)closeTrackPage();trackPage.fsWas=!!document.fullscreenElement;});
}
// Imported circuits live alongside the built-in ones and persist in localStorage, so a track you
// loaded is still there next session. Only geometry is stored — it is the user's own file.
const GPX_KEY='pes.tracks';
function refreshTrackList(){
  const sel=document.getElementById('trkSel');if(!sel)return;
  sel.innerHTML='';
  // Three groups: the hand-built test circuits, the real ones, and the user's own imports.
  const groups=[['TEST CIRCUITS',t=>!t.real&&!t.imported],['REAL CIRCUITS',t=>t.real],['IMPORTED',t=>t.imported]];
  for(const [name,f] of groups){
    const keys=Object.keys(TRACKS).filter(k=>f(TRACKS[k]));if(!keys.length)continue;
    const g=document.createElement('optgroup');g.label=name;
    for(const k of keys){
      const o=document.createElement('option');
      o.value=k;o.textContent=TRACKS[k].label+(TRACKS[k].imported?' *':'');
      g.appendChild(o);
    }
    sel.appendChild(g);
  }
  sel.value=trackKey;
}
function saveImportedTracks(){
  try{
    const out={};
    for(const [k,t] of Object.entries(TRACKS))if(t.imported)out[k]={label:t.label,width:t.width,wvar:t.wvar,wprof:t.wprof,blurb:t.blurb,pts:t.pts,names:t.names||[]};
    localStorage.setItem(GPX_KEY,JSON.stringify(out));
  }catch(e){}
}
function loadImportedTracks(){
  try{
    const raw=localStorage.getItem(GPX_KEY);if(!raw)return;
    const o=JSON.parse(raw);
    for(const [k,t] of Object.entries(o))if(t&&Array.isArray(t.pts)&&t.pts.length>20)TRACKS[k]=Object.assign({imported:true},t);
  }catch(e){}
}
function loadGpxTrack(text,fallbackName){
  let def;
  try{def=gpxToTrack(text,{name:gpxTrackName(text)||fallbackName});}
  catch(e){flash(tr('GPX IMPORT FAILED — no usable track points'),'err');return;}
  const key='gpx_'+Date.now().toString(36);
  TRACKS[key]=def;delete trackCache[key];
  trackKey=key;refreshTrackList();saveImportedTracks();
  buildVehicle();refreshLap();
  const T=buildTrack(key);
  flash(trIn('msg','IMPORTED')+' '+def.label+' • '+(T.length/1000).toFixed(2)+' km • '+T.corners+' '+tr('CORNERS'));
  setTab('track');
}
function refreshLap(){
  if(!engine.score||!vehicle.mass){lapResult=null;}
  else lapResult=simulateLap(trackKey);
  renderLap();
}
