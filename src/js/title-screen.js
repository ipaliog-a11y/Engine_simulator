// ====== TITLE SCREEN ======
// The sim used to open on the live bench, which is the right place once you are building and the wrong
// place the first time you arrive. This is the front door: four ways in, over a workshop drawn the same
// way as the car and the engine (a PixBuf, whole cells, no smoothing). It is a draft of that room —
// a hoist, an engine on it, a toolbox — not a second game.
//
// The automated tests drive the bench directly and never ask for this screen, so it stays down when the
// browser reports itself as automated. ?title=1 forces it (the test for this screen) and ?title=0
// suppresses it. A shared build in the hash opens on the bench too: the link is the destination.
const SHOP_W=192,SHOP_H=112;
let titlePhase=0,titleRAF=0,titleLast=0,titleSel=0;

function pixBox(buf,x,y,w,h,fill,hi,lo){
  buf.rect(x,y,w,h,fill);
  if(hi){buf.rect(x,y,w,1,hi);buf.rect(x,y,1,h,hi);}
  if(lo){buf.rect(x,y+h-1,w,1,lo);buf.rect(x+w-1,y,1,h,lo);}
}

// A tidy bay, side on. Daylight stays out: the whole app lives in the same navy, and a bright sky
// would be a different game. The room is clean on purpose — grout lines, a hazard stripe, one tray
// under the engine — rather than a stained garage.
function drawWorkshop(buf,t){
  const wall='#1b2433',mortar='#121820';
  buf.rect(0,0,SHOP_W,90,wall);
  for(let y=6;y<88;y+=8){
    buf.rect(0,y,SHOP_W,1,mortar);
    const off=(Math.round(y/8)%2)?10:0;
    for(let x=off;x<SHOP_W;x+=20)buf.rect(x,y-5,1,5,mortar);
  }
  // one high window, left, so the hoist stays the subject
  pixBox(buf,10,8,44,24,'#243044','#c0c0d0','#3a3a4a');
  buf.rect(12,10,40,9,'#31425c');
  buf.rect(18,13,7,5,'#d8d0b0');
  buf.set(20,14,'#fff8e0');
  buf.rect(31,10,1,20,'#6a6a7a');
  buf.rect(12,19,40,1,'#6a6a7a');
  buf.set(42,14,'#c0c0d0');buf.set(46,17,'#889');buf.set(38,12,'#c0c0d0');
  buf.rect(12,30,40,2,'#9a9aaa');
  // pegboard behind the bay, drawn before the hoist so the chain sits in front of it
  buf.rect(70,28,48,26,'#243028');
  buf.rect(70,28,48,1,'#3a5244');
  for(let y=32;y<52;y+=4)for(let x=74;x<116;x+=4)buf.set(x,y,'#1a2820');
  buf.rect(78,34,8,2,'#c0c0d0');buf.rect(78,32,2,2,'#c0c0d0');buf.rect(84,32,2,2,'#c0c0d0');
  buf.rect(96,33,2,12,'#c08040');buf.rect(94,42,6,2,'#ffcc00');

  // hazard stripe, then the tiled floor
  buf.rect(0,88,SHOP_W,4,'#1a1a22');
  for(let x=0;x<SHOP_W;x+=8)buf.rect(x,88,4,4,'#e0b000');
  buf.rect(0,92,SHOP_W,SHOP_H-92,'#2a2a34');
  for(let y=92;y<SHOP_H;y+=10)buf.rect(0,y,SHOP_W,1,'#1e1e28');
  for(let x=0;x<SHOP_W;x+=16)buf.rect(x,92,1,SHOP_H-92,'#1e1e28');
  // the pool of the shop lamp, a few tiles lighter, under the engine
  buf.rect(78,102,36,8,'#34343e');

  const sway=Math.sin(t)>0.5?1:Math.sin(t)<-0.5?-1:0;
  // gantry: two posts, a yellow beam, a trolley, a chain
  pixBox(buf,64,22,4,66,'#8a8a98','#c0c0d0','#3a3a4a');
  pixBox(buf,124,22,4,66,'#8a8a98','#c0c0d0','#3a3a4a');
  pixBox(buf,58,84,16,4,'#5a5a68','#9a9aaa','#2a2a3a');
  pixBox(buf,118,84,16,4,'#5a5a68','#9a9aaa','#2a2a3a');
  pixBox(buf,60,16,72,6,'#e0b000','#ffe070','#8a6800');
  const hx=88+sway;
  pixBox(buf,hx,22,14,6,'#3a3a4a','#6a6a7a','#1a1a22');
  buf.rect(hx+2,24,2,2,(Math.floor(t*2)%10===0)?'#886622':'#00ff88');
  for(let y=28;y<48;y+=3)buf.rect(hx+6,y,2,2,(Math.floor(y/3)%2)?'#c0c0d0':'#6a6a7a');
  buf.rect(hx+5,48,4,2,'#ffcc00');
  buf.rect(hx+8,50,2,3,'#ffcc00');
  // lamp, fixed to the beam, not to the swaying trolley
  buf.rect(104,22,1,8,'#3a3a4a');
  pixBox(buf,98,30,14,4,'#3a3a4a','#6a6a7a','#1a1a22');
  buf.rect(100,34,10,2,'#fff2a8');

  // the engine, hung clear of the floor. Same block / gold cover / header colours as the engine sprite.
  const ex=hx-12,ey=54;
  buf.rect(ex+4,106,30,2,'#14141c');
  pixBox(buf,ex+2,100,32,3,'#3a3a28','#6a6a40','#1a1a14');
  pixBox(buf,ex,ey+8,34,12,'#6a6a7a','#9a9aaa','#3a3a4a');
  for(let k=1;k<4;k++)buf.rect(ex+k*8,ey+10,1,8,'#4a4a58');
  pixBox(buf,ex+4,ey+20,26,4,'#2a2a3a','#4a4a5a','#1a1a22');
  pixBox(buf,ex+1,ey+4,32,5,'#9a9aaa','#c0c0d0','#5a5a68');
  pixBox(buf,ex+4,ey,26,5,'#e0b000','#ffe070','#8a6800');
  buf.rect(ex+8,ey+1,2,2,'#3a3a4a');buf.rect(ex+15,ey+1,2,2,'#3a3a4a');buf.rect(ex+22,ey+1,2,2,'#3a3a4a');
  // the hook's eye, so the chain meets the cover
  buf.rect(hx+6,ey-2,4,2,'#ffcc00');
  pixBox(buf,ex+8,ey-5,14,4,'#2a2a3a','#4a4a5a','#1a1a22');
  const hc='#c08040';
  buf.rect(ex+2,ey+15,28,3,hc);
  buf.rect(ex-1,ey+14,4,5,hc);
  buf.disc(ex+36,ey+14,4,'#3a3a4a');buf.disc(ex+36,ey+14,2,'#9a9aaa');
  pixBox(buf,ex-8,ey+11,7,7,'#ff6600','#ffaa44','#8a3000');

  // toolbox, on the floor, to the right of the hoist
  const tx=150,ty=52;
  buf.rect(tx+2,106,32,2,'#14141c');
  pixBox(buf,tx,ty+12,36,32,'#c42828','#ff5a5a','#6a1414');
  pixBox(buf,tx-1,ty+5,38,8,'#e23a3a','#ff7070','#8a1818');
  buf.rect(tx+13,ty+2,12,4,'#3a3a4a');
  buf.rect(tx+15,ty,8,2,'#6a6a7a');
  for(let i=0;i<3;i++){
    const dy=ty+16+i*9;
    buf.rect(tx+3,dy,30,7,i%2?'#a82020':'#b42424');
    buf.rect(tx+14,dy+2,8,2,'#e8e8f0');
  }
  // a wrench lying on the lid
  buf.rect(tx+4,ty+7,11,2,'#c0c0d0');
  buf.rect(tx+4,ty+5,3,2,'#c0c0d0');
  buf.rect(tx+12,ty+5,3,2,'#c0c0d0');

  // a spare tyre against the wall, left of the gantry
  buf.disc(46,86,11,'#0e0e14');
  buf.disc(46,86,9,'#1c1c26');
  buf.disc(46,86,4,'#6a6a7a');
  buf.rect(42,86,8,1,'#33334a');
}

function paintTitle(){
  const cv=document.getElementById('titleBg');if(!cv)return;
  const stage=cv.parentElement,rect=stage.getBoundingClientRect();
  if(rect.width<2||rect.height<2)return;
  const dpr=Math.min(2,window.devicePixelRatio||1);
  const bw=Math.max(1,Math.round(rect.width*dpr)),bh=Math.max(1,Math.round(rect.height*dpr));
  if(cv.width!==bw||cv.height!==bh){cv.width=bw;cv.height=bh;}
  const g=cv.getContext('2d');
  g.setTransform(1,0,0,1,0,0);g.imageSmoothingEnabled=false;
  g.fillStyle='#1b2433';g.fillRect(0,0,bw,bh);
  const buf=new PixBuf(SHOP_W,SHOP_H);
  drawWorkshop(buf,titlePhase);
  const k=Math.max(1,Math.floor(Math.min(bw/SHOP_W,bh/SHOP_H)));
  const iw=SHOP_W*k,ih=SHOP_H*k;
  g.drawImage(buf.canvas(),Math.floor((bw-iw)/2),Math.floor((bh-ih)/2),iw,ih);
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
  if(now-titleLast>90){titleLast=now;titlePhase+=0.45;paintTitle();}
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
