// ====== TITLE SCREEN ======
// The sim used to open on the live bench, which is the right place once you are building and the wrong
// place the first time you arrive. This is the front door: four ways in, over four workshops, and the car
// showcase (build 237, src/js/showcase.js).
//
// Four rooms cycle behind the menu, five seconds each, with a slow left-to-right pan: a pickup on the hoist
// in a back-street workshop, an F355 on stands with its wheels off, an electric car's service bay with its
// drive unit on a dolly, and the F355 in a race pit (build 230). They are pictures the owner generated
// (assets/landing/README.md), with the makers' and sponsors' logos pixelated out; until build 229 they were
// drafts drawn in code. Each is shown as an <img>, not drawn on a canvas, so the page can open from file://
// without tainting anything, and smoothly scaled: they are detailed pictures, not a cell grid.
//
// The automated tests drive the bench directly and never ask for this screen, so it stays down when the
// browser reports itself as automated. ?title=1 forces it (the test for this screen) and ?title=0
// suppresses it. A shared build in the hash opens on the bench too: the link is the destination.
const TITLE_ROOMS=['workshop-pickup','garage-f355','service-bay-ev','pit-f355'].map(n=>'assets/landing/'+n+'.webp');
// Each picture is shown 12% past covering the stage, so it always has room to pan. A room holds five seconds; the next
// fades in over it for the last FADE_MS of its walk (build 237).
const SCENE_MS=5000, FADE_MS=700, TITLE_ZOOM=1.12;
let titleRAF=0,titleSel=0,titleT0=0,titleShown=-1,titleStageKey='',titleSeek=false;
// The smooth pan (build 237). Until then the menu moved one <img> by its `left`, rounded to a whole picture pixel and
// then to a whole screen pixel, 20 times a second, and swapped its src at each room (a fresh decode of a 1920 px
// picture, and a jump cut back to the start of the pan). Now:
//   · all four rooms are their own <img>, stacked, each decoded once before it is first shown;
//   · each room's walk is a Web Animation of its transform, so the browser runs it on the compositor every frame,
//     at sub-pixel positions, whatever the main thread is doing;
//   · a room walks for SCENE_MS + FADE_MS at one speed, so it is still moving while the next one fades in over it;
//   · the bench behind the menu stops drawing while it is covered (controls-boot.js, appCovered);
//   · with "reduce motion" asked for, the rooms hold still and change without a fade.
// The script still keeps the clock, so titleAdvance() can put any moment of the carousel on the stage for a test.
const titleRooms=[];   // {im, anim, key, ready}
const titleReduced=()=>!!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);
// The pictures load once, the first time the menu opens; a room not decoded yet stays out of the rotation's view and
// leaves the stage its plain colour.
function titlePreload(){
  const stage=document.querySelector('#titleScreen .title-stage');
  if(titleRooms.length||!stage)return;
  TITLE_ROOMS.forEach((src,i)=>{
    const im=document.createElement('img'),R={im,anim:null,key:'',ready:false};
    im.className='title-room';im.alt='';im.setAttribute('aria-hidden','true');im.decoding='async';im.draggable=false;im.dataset.room=i;
    const ready=()=>{if(R.ready)return;R.ready=true;if(i===titleShown)titleShown=-1;paintTitle();};
    im.addEventListener('load',()=>{if(im.decode)im.decode().then(ready,ready);else ready();});
    im.src=src;stage.appendChild(im);titleRooms.push(R);
  });
}
// The geometry of one frame, in the picture's own pixels: how wide the view onto it is, and how far the pan has walked.
// The walk spans SCENE_MS + FADE_MS, so it reaches the picture's far edge as the room has faded out under the next.
function titleGeom(idx,local){
  const st=document.querySelector('#titleScreen .title-stage'),r=st?st.getBoundingClientRect():{width:0,height:0};
  const R=titleRooms[idx],im=R&&R.im,iw=(im&&im.naturalWidth)||1920,ih=(im&&im.naturalHeight)||1060;
  const bw=r.width||1280,bh=r.height||720;
  const scale=Math.max(bw/iw,bh/ih)*TITLE_ZOOM, viewW=bw/scale, maxPan=Math.max(0,iw-viewW);
  const walk=titleReduced()?0:Math.min(1,Math.max(0,local)/(SCENE_MS+FADE_MS));
  return {scale,iw,ih,bw,bh,viewW,maxPan,pan:walk*maxPan};
}

function titleNow(){return performance.now();}
function titleSceneState(now){
  const t0=titleT0||now||0;
  const elapsed=Math.max(0,(now||titleNow())-t0);
  const n=TITLE_ROOMS.length;
  const idx=Math.floor(elapsed/SCENE_MS)%n;
  const local=elapsed%SCENE_MS;
  const G=titleGeom(idx,local);
  return {idx,pan:Math.round(G.pan),n,local,elapsed,maxPan:Math.round(G.maxPan)};
}
// Tests and the menu itself read this: how many rooms, how long each holds, how far the pan walks (picture pixels).
function titleSceneInfo(){
  const G=titleGeom(0,SCENE_MS);
  return {n:TITLE_ROOMS.length,holdMs:SCENE_MS,fadeMs:FADE_MS,viewW:Math.round(G.viewW),sceneW:G.iw,pan:G.iw-Math.round(G.viewW),rooms:TITLE_ROOMS.slice()};
}
// The <img> of the room on the stage now (tests read its box).
function titleRoomEl(){const R=titleRooms[titleSceneState(titleNow()).idx];return R?R.im:null;}
// Jump the carousel clock so a test can assert the pan and the scene change without waiting.
function titleAdvance(ms){
  titleT0=titleNow()-Math.max(0,ms);
  titleShown=-1;titleSeek=true;
  paintTitle();
  return titleSceneState(titleNow());
}
// One room's size on this stage, and its walk as a Web Animation, made again only when the stage changes size.
function titleRoomAnim(i){
  const R=titleRooms[i],G=titleGeom(i,0),im=R.im;
  const key=[G.bw,G.bh,G.iw,G.ih,titleReduced()].join('|');
  if(R.anim&&R.key===key)return R.anim;
  im.style.width=G.iw*G.scale+'px';im.style.height=G.ih*G.scale+'px';
  im.style.left='0px';im.style.top=(G.bh-G.ih*G.scale)/2+'px';
  if(R.anim)R.anim.cancel();
  R.key=key;R.anim=null;
  const dist=titleReduced()?0:G.maxPan*G.scale;
  if(im.animate){
    R.anim=im.animate([{transform:'translate3d(0,0,0)'},{transform:'translate3d('+(-dist)+'px,0,0)'}],
      {duration:SCENE_MS+FADE_MS,easing:'linear',fill:'both'});
    R.anim.pause();
  }
  return R.anim;
}
// Put room i at a moment `t` of its walk, and leave it running from there.
function titleRoomAt(i,t){
  const a=titleRoomAnim(i);if(!a)return;
  a.currentTime=Math.min(SCENE_MS+FADE_MS,Math.max(0,t));
  a.play();
}
// Called on every animation frame while the menu is up, but it only does work when a room starts (or a picture has just
// become ready, or the stage changed size): the walking itself is the browser's.
function paintTitle(){
  if(!titleRooms.length)return;
  const now=titleNow();
  if(!titleT0)titleT0=now;
  const st=titleSceneState(now),n=TITLE_ROOMS.length,prev=(st.idx+n-1)%n;
  const fading=!titleReduced()&&st.elapsed>=SCENE_MS&&st.local<FADE_MS;   // the room before is still under this one
  // a stage of another size (or motion preference): the rooms on view are laid out again and rejoin their walk
  const G0=titleGeom(st.idx,0),sk=[G0.bw,G0.bh,titleReduced()].join('|');
  if(sk!==titleStageKey){titleStageKey=sk;titleShown=-1;titleSeek=true;}
  if(titleShown!==st.idx){
    titleShown=st.idx;
    const seek=titleSeek;titleSeek=false;
    titleRooms.forEach((R,k)=>{
      if(!R.ready)return;
      if(k===st.idx)titleRoomAt(k,st.local);
      // the room before keeps the walk it is on, unless the clock jumped (a resize, a test) and it must rejoin it
      else if(k===prev&&fading){if(!R.anim||R.anim.playState!=='running'||seek)titleRoomAt(k,SCENE_MS+st.local);}
      else if(R.anim)R.anim.pause();
    });
  }
  titleRooms.forEach((R,k)=>{
    const on=R.ready&&(k===st.idx||(k===prev&&fading)),z=String(k===st.idx?2:k===prev?1:0);
    if(R.im.classList.contains('on')!==on)R.im.classList.toggle('on',on);
    if(R.im.style.zIndex!==z)R.im.style.zIndex=z;
  });
}

function titleButtons(){return [...document.querySelectorAll('#titleScreen .title-menu button')];}
function titleMark(){
  titleButtons().forEach((b,i)=>b.classList.toggle('on',i===titleSel));
}
function titleGo(mode){
  closeTitleScreen();
  if(mode==='showcase'){openShowcase('title');return;}   // the car showcase is a page of its own (build 237)
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
  titleT0=titleNow();titleShown=-1;titleSeek=true;titlePreload();
  requestAnimationFrame(()=>{paintTitle();const b=titleButtons()[0];if(b)b.focus();});
  if(!titleRAF)titleRAF=requestAnimationFrame(titleLoop);
}
function closeTitleScreen(){
  const el=document.getElementById('titleScreen');if(!el||el.hidden)return;
  el.hidden=true;
  document.body.classList.remove('title-open');
  titleRooms.forEach(R=>{if(R.anim)R.anim.pause();});   // nothing walks behind a closed menu
}
function titleLoop(now){
  const el=document.getElementById('titleScreen');
  if(!el||el.hidden){titleRAF=0;return;}
  paintTitle();   // cheap unless a room starts: the walks are the browser's own animations
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
