// ====== TITLE SCREEN ======
// The sim used to open on the live bench, which is the right place once you are building and the wrong
// place the first time you arrive. This is the front door: four ways in, over four workshops.
//
// Four rooms cycle behind the menu, five seconds each, with a slow left-to-right pan: a pickup on the hoist
// in a back-street workshop, an F355 on stands with its wheels off, an electric car's service bay with its
// drive unit on a dolly, and the F355 in a race pit (build 229). They are pictures the owner generated
// (assets/landing/README.md), with the makers' and sponsors' logos pixelated out; until build 228 they were
// drafts drawn in code. Each is shown as an <img>, not drawn on a canvas, so the page can open from file://
// without tainting anything, and smoothly scaled: they are detailed pictures, not a cell grid.
//
// The automated tests drive the bench directly and never ask for this screen, so it stays down when the
// browser reports itself as automated. ?title=1 forces it (the test for this screen) and ?title=0
// suppresses it. A shared build in the hash opens on the bench too: the link is the destination.
const TITLE_ROOMS=['workshop-pickup','garage-f355','service-bay-ev','pit-f355'].map(n=>'assets/landing/'+n+'.webp');
const SCENE_MS=5000, TITLE_ZOOM=1.12;   // each picture is shown 12% past covering the stage, so it always has room to pan
let titleRAF=0,titleLast=0,titleSel=0,titleT0=0,titleShown=-1;
const titleImgs=[];
// The pictures load once, the first time the menu opens; a picture not loaded yet leaves the stage its plain colour.
function titlePreload(){
  if(titleImgs.length)return;
  TITLE_ROOMS.forEach((src,i)=>{const im=new Image();im.decoding='async';im.onload=()=>{if(i===titleShown)titleShown=-1;paintTitle();};im.src=src;titleImgs.push(im);});
}
// The geometry of one frame, in the picture's own pixels: how wide the view onto it is, and how far the pan has walked.
function titleGeom(idx,local){
  const st=document.querySelector('#titleScreen .title-stage'),r=st?st.getBoundingClientRect():{width:0,height:0};
  const im=titleImgs[idx],iw=(im&&im.naturalWidth)||1920,ih=(im&&im.naturalHeight)||1060;
  const bw=r.width||1280,bh=r.height||720;
  const scale=Math.max(bw/iw,bh/ih)*TITLE_ZOOM, viewW=bw/scale, maxPan=Math.max(0,iw-viewW);
  return {scale,iw,ih,bw,bh,viewW,maxPan,pan:Math.round(Math.min(1,local/SCENE_MS)*maxPan)};
}

function titleNow(){return performance.now();}
function titleSceneState(now){
  const t0=titleT0||now||0;
  const elapsed=Math.max(0,(now||titleNow())-t0);
  const n=TITLE_ROOMS.length;
  const idx=Math.floor(elapsed/SCENE_MS)%n;
  const local=elapsed%SCENE_MS;
  const G=titleGeom(idx,local);
  return {idx,pan:G.pan,n,local,elapsed,maxPan:Math.round(G.maxPan)};
}
// Tests and the menu itself read this: how many rooms, how long each holds, how far the pan walks (picture pixels).
function titleSceneInfo(){
  const G=titleGeom(0,SCENE_MS);
  return {n:TITLE_ROOMS.length,holdMs:SCENE_MS,viewW:Math.round(G.viewW),sceneW:G.iw,pan:G.iw-Math.round(G.viewW),rooms:TITLE_ROOMS.slice()};
}
// Jump the carousel clock so a test can assert the pan and the scene change without waiting.
function titleAdvance(ms){
  titleT0=titleNow()-Math.max(0,ms);
  paintTitle();
  return titleSceneState(titleNow());
}

function paintTitle(){
  const img=document.getElementById('titleImg');if(!img)return;
  const now=titleNow();
  if(!titleT0)titleT0=now;
  const st=titleSceneState(now),G=titleGeom(st.idx,st.local),pic=titleImgs[st.idx];
  if(!pic||!pic.complete||!pic.naturalWidth){img.hidden=true;return;}
  if(titleShown!==st.idx){img.src=pic.src;titleShown=st.idx;}
  img.hidden=false;
  // the picture covers the stage, centred top to bottom, and walks left → right over the five seconds
  img.style.width=Math.round(G.iw*G.scale)+'px';img.style.height=Math.round(G.ih*G.scale)+'px';
  img.style.left=Math.round(-G.pan*G.scale)+'px';img.style.top=Math.round((G.bh-G.ih*G.scale)/2)+'px';
}

function titleButtons(){return [...document.querySelectorAll('#titleScreen .title-menu button')];}
function titleMark(){
  titleButtons().forEach((b,i)=>b.classList.toggle('on',i===titleSel));
}
function titleGo(mode){
  closeTitleScreen();
  setTab(mode);
}
function openTitleScreen(){
  const el=document.getElementById('titleScreen');if(!el)return;
  const h1=document.querySelector('header h1');
  const ver=document.getElementById('titleVer');
  if(ver&&h1)ver.textContent=h1.textContent;
  el.hidden=false;
  document.body.classList.add('title-open');
  titleSel=0;titleMark();
  titleT0=titleNow();titlePreload();
  requestAnimationFrame(()=>{paintTitle();const b=titleButtons()[0];if(b)b.focus();});
  if(!titleRAF)titleRAF=requestAnimationFrame(titleLoop);
}
function closeTitleScreen(){
  const el=document.getElementById('titleScreen');if(!el||el.hidden)return;
  el.hidden=true;
  document.body.classList.remove('title-open');
}
function titleLoop(now){
  const el=document.getElementById('titleScreen');
  if(!el||el.hidden){titleRAF=0;return;}
  // the pan wants a steady clock: a step every 50 ms
  if(now-titleLast>50){titleLast=now;paintTitle();}
  titleRAF=requestAnimationFrame(titleLoop);
}
function titleOnLoad(){
  const q=new URLSearchParams(location.search);
  if(q.get('title')==='0')return false;
  if(q.get('title')==='1')return true;
  if(navigator.webdriver)return false;
  if(location.hash&&location.hash.length>1)return false;
  return true;
}
function bindTitleScreen(){
  const el=document.getElementById('titleScreen');if(!el)return;
  titleButtons().forEach((b,i)=>{
    b.addEventListener('click',()=>titleGo(b.dataset.go));
    b.addEventListener('focus',()=>{titleSel=i;titleMark();});
  });
  document.getElementById('btnMenu').addEventListener('click',openTitleScreen);
  document.addEventListener('keydown',e=>{
    if(el.hidden)return;
    const n=titleButtons().length;
    if(e.key==='ArrowDown'||e.key==='ArrowRight'){titleSel=(titleSel+1)%n;titleMark();titleButtons()[titleSel].focus();e.preventDefault();}
    else if(e.key==='ArrowUp'||e.key==='ArrowLeft'){titleSel=(titleSel+n-1)%n;titleMark();titleButtons()[titleSel].focus();e.preventDefault();}
    else if(e.key==='Enter'){titleGo(titleButtons()[titleSel].dataset.go);e.preventDefault();}
    else if(e.key==='Escape'){closeTitleScreen();e.preventDefault();}
    else return;
    e.stopPropagation();
  },true);
  window.addEventListener('resize',()=>{if(!el.hidden)paintTitle();});
}
