// ====== TITLE SCREEN ======
// The sim used to open on the live bench, which is the right place once you are building and the wrong
// place the first time you arrive. This is the front door: four ways in, over a workshop drawn the same
// way as the car and the engine (a PixBuf, whole cells, no smoothing).
//
// Four rooms cycle behind the menu, five seconds each, with a slow left-to-right pan across a wider
// scene than the stage shows: the original hoist bay, a tyre bay (four-post lift, changer, balancer),
// a V8 laid flat on the floor, and a race pit with the car on stands and its wheels off. The rooms are
// drafts of those places — not a second game.
//
// The automated tests drive the bench directly and never ask for this screen, so it stays down when the
// browser reports itself as automated. ?title=1 forces it (the test for this screen) and ?title=0
// suppresses it. A shared build in the hash opens on the bench too: the link is the destination.
const VIEW_W=192,SCENE_W=288,SHOP_H=112,SCENE_MS=5000;
let titlePhase=0,titleRAF=0,titleLast=0,titleSel=0,titleT0=0;

function pixBox(buf,x,y,w,h,fill,hi,lo){
  buf.rect(x,y,w,h,fill);
  if(hi){buf.rect(x,y,w,1,hi);buf.rect(x,y,1,h,hi);}
  if(lo){buf.rect(x,y+h-1,w,1,lo);buf.rect(x+w-1,y,1,h,lo);}
}

function shopWallFloor(buf){
  const wall='#1b2433',mortar='#121820';
  buf.rect(0,0,SCENE_W,90,wall);
  for(let y=6;y<88;y+=8){
    buf.rect(0,y,SCENE_W,1,mortar);
    const off=(Math.round(y/8)%2)?10:0;
    for(let x=off;x<SCENE_W;x+=20)buf.rect(x,y-5,1,5,mortar);
  }
  buf.rect(0,88,SCENE_W,4,'#1a1a22');
  for(let x=0;x<SCENE_W;x+=8)buf.rect(x,88,4,4,'#e0b000');
  buf.rect(0,92,SCENE_W,SHOP_H-92,'#2a2a34');
  for(let y=92;y<SHOP_H;y+=10)buf.rect(0,y,SCENE_W,1,'#1e1e28');
  for(let x=0;x<SCENE_W;x+=16)buf.rect(x,92,1,SHOP_H-92,'#1e1e28');
}

function shopWindow(buf,x,y){
  pixBox(buf,x,y,44,24,'#243044','#c0c0d0','#3a3a4a');
  buf.rect(x+2,y+2,40,9,'#31425c');
  buf.rect(x+8,y+5,7,5,'#d8d0b0');
  buf.set(x+10,y+6,'#fff8e0');
  buf.rect(x+21,y+2,1,20,'#6a6a7a');
  buf.rect(x+2,y+11,40,1,'#6a6a7a');
  buf.set(x+32,y+6,'#c0c0d0');buf.set(x+36,y+9,'#889');buf.set(x+28,y+4,'#c0c0d0');
  buf.rect(x+2,y+22,40,2,'#9a9aaa');
}

function pixTyre(buf,cx,cy,r,rim){
  buf.disc(cx,cy,r,'#0e0e14');
  buf.disc(cx,cy,r-2,'#1c1c26');
  buf.disc(cx,cy,Math.max(2,Math.round(r*0.35)),rim||'#6a6a7a');
  buf.rect(cx-Math.round(r*0.35),cy,Math.round(r*0.7),1,'#33334a');
}

// A tidy bay, side on. Daylight stays out: the whole app lives in the same navy, and a bright sky
// would be a different game. The room is clean on purpose — grout lines, a hazard stripe, one tray
// under the engine — rather than a stained garage.
function drawWorkshop(buf,t){
  shopWallFloor(buf);
  shopWindow(buf,10,8);
  // pegboard behind the bay, drawn before the hoist so the chain sits in front of it
  buf.rect(70,28,48,26,'#243028');
  buf.rect(70,28,48,1,'#3a5244');
  for(let y=32;y<52;y+=4)for(let x=74;x<116;x+=4)buf.set(x,y,'#1a2820');
  buf.rect(78,34,8,2,'#c0c0d0');buf.rect(78,32,2,2,'#c0c0d0');buf.rect(84,32,2,2,'#c0c0d0');
  buf.rect(96,33,2,12,'#c08040');buf.rect(94,42,6,2,'#ffcc00');
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
  pixTyre(buf,46,86,11);

  // the extra width the pan walks into: a workbench and hanging hoses
  pixBox(buf,210,48,64,40,'#4a3420','#6a4a2a','#2a1a10');
  for(let i=0;i<3;i++)buf.rect(216+i*18,52,14,4,'#2a2a3a');
  buf.rect(218,58,12,6,'#c0c0d0');buf.rect(236,58,10,8,'#ff6600');buf.rect(252,60,14,3,'#e0b000');
  pixBox(buf,210,44,64,5,'#3a2a18','#5a3a20','#1a1208');
  for(let x=220;x<270;x+=10){
    buf.rect(x,20,1,24,'#3a3a4a');
    buf.disc(x,44,2,'#6a6a7a');
  }
  pixTyre(buf,268,86,10,'#8a8a98');
  shopWindow(buf,230,8);
}

// Tyre bay: four-post alignment lift with a car up, a tyre changer, and a balancer.
function drawTireBay(buf,t){
  shopWallFloor(buf);
  shopWindow(buf,8,6);
  shopWindow(buf,200,6);
  // wall rack of tyres
  for(let i=0;i<5;i++)pixTyre(buf,24+i*18,40,8,i%2?'#8a8a98':'#6a6a7a');
  buf.rect(12,48,96,2,'#3a3a4a');

  // four-post lift
  pixBox(buf,52,18,8,70,'#9a9aaa','#c0c0d0','#4a4a58');
  pixBox(buf,168,18,8,70,'#9a9aaa','#c0c0d0','#4a4a58');
  pixBox(buf,52,16,124,5,'#e0b000','#ffe070','#8a6800');
  pixBox(buf,60,48,108,4,'#6a6a7a','#9a9aaa','#3a3a4a');
  pixBox(buf,60,72,108,4,'#6a6a7a','#9a9aaa','#3a3a4a');
  // car on the lift (side silhouette, wheels hanging)
  const cy=40;
  buf.rect(74,cy+18,96,14,'#2a4060');
  buf.rect(78,cy+10,88,10,'#3a5880');
  buf.rect(86,cy+4,50,8,'#4a6a90');
  buf.rect(92,cy+2,30,4,'#1a2838');
  buf.rect(100,cy+6,18,6,'#88cce8');
  buf.rect(128,cy+6,14,6,'#88cce8');
  buf.rect(70,cy+28,18,3,'#1a1a22');
  buf.rect(150,cy+28,18,3,'#1a1a22');
  pixTyre(buf,82,cy+30,7);
  pixTyre(buf,158,cy+30,7);
  // alignment turnplates under the fronts
  pixBox(buf,72,78,20,3,'#4a4a58','#7a7a88','#2a2a3a');
  pixBox(buf,148,78,20,3,'#4a4a58','#7a7a88','#2a2a3a');
  const blink=(Math.floor(t)%4===0);
  buf.rect(56,22,2,2,blink?'#00ff88':'#226633');
  buf.rect(172,22,2,2,blink?'#00ff88':'#226633');

  // tyre changing machine
  const mx=210,my=50;
  pixBox(buf,mx,my+10,40,36,'#c0c0d0','#e8e8f0','#6a6a7a');
  pixBox(buf,mx+6,my+16,28,22,'#1a1a22','#3a3a4a','#0a0a10');
  pixTyre(buf,mx+20,my+28,11,'#e0b000');
  buf.rect(mx+18,my+4,4,14,'#3a3a4a');
  buf.rect(mx+14,my,12,5,'#ff6600');
  buf.rect(mx+32,my+8,14,3,'#8a8a98');
  buf.rect(mx+42,my+6,3,8,'#c0c0d0');
  buf.rect(mx+2,my+46,36,2,'#14141c');

  // tyre balancer
  const bx=252,by=58;
  pixBox(buf,bx,by+8,30,30,'#3a3a4a','#6a6a7a','#1a1a22');
  pixBox(buf,bx+4,by+12,22,18,'#1a1a22','#3a3a4a','#0a0a10');
  const spin=Math.floor(t*3)%2;
  pixTyre(buf,bx+15,by+22,9,spin?'#ffcc00':'#c0c0d0');
  buf.rect(bx+8,by,16,8,'#243044');
  buf.rect(bx+10,by+2,5,3,blink?'#00ff88':'#226633');
  buf.rect(bx+18,by+2,5,3,'#ffcc00');
  buf.rect(bx+2,by+38,26,2,'#14141c');

  // loose tyre waiting by the changer
  pixTyre(buf,198,90,9);
  // floor paint for the alignment bay
  buf.rect(64,100,120,2,'#e0b000');
}

// Top-down: a V8 opened out flat on the workshop floor.
function drawEngineFlatlay(buf,t){
  // concrete floor fills the frame — this room is seen from above
  buf.rect(0,0,SCENE_W,SHOP_H,'#2a2a34');
  for(let y=0;y<SHOP_H;y+=14)buf.rect(0,y,SCENE_W,1,'#22222c');
  for(let x=0;x<SCENE_W;x+=14)buf.rect(x,0,1,SHOP_H,'#22222c');
  // work mat
  buf.rect(24,10,240,92,'#1a2218');
  for(let y=14;y<98;y+=8)for(let x=28;x<260;x+=8)buf.set(x,y,'#243028');
  buf.rect(24,10,240,1,'#3a5244');buf.rect(24,101,240,1,'#0e140e');

  // block, centre
  const bx=110,by=40;
  pixBox(buf,bx,by,68,36,'#6a6a7a','#9a9aaa','#3a3a4a');
  for(let i=0;i<4;i++){
    buf.disc(bx+10+i*16,by+12,6,'#2a2a3a');
    buf.disc(bx+10+i*16,by+12,3,'#1a1a22');
    buf.disc(bx+10+i*16,by+26,6,'#2a2a3a');
    buf.disc(bx+10+i*16,by+26,3,'#1a1a22');
  }
  // main bearing saddles
  for(let i=0;i<5;i++)buf.rect(bx+4+i*14,by+16,8,6,'#4a4a58');

  // crankshaft below the block
  pixBox(buf,bx-4,by+44,76,10,'#8a8a98','#c0c0d0','#4a4a58');
  for(let i=0;i<4;i++){
    buf.rect(bx+6+i*16,by+42,6,14,'#6a6a7a');
    buf.disc(bx+9+i*16,by+49,3,'#3a3a4a');
  }
  buf.rect(bx-8,by+46,6,6,'#c0c0d0');
  buf.rect(bx+72,by+46,8,6,'#c0c0d0');

  // left bank head + cover
  pixBox(buf,40,18,56,22,'#5a5a68','#8a8a98','#2a2a3a');
  for(let i=0;i<4;i++){buf.disc(50+i*12,26,3,'#1a1a22');buf.disc(50+i*12,34,3,'#1a1a22');}
  pixBox(buf,44,8,48,10,'#e0b000','#ffe070','#8a6800');
  buf.rect(52,10,8,2,'#3a3a4a');buf.rect(72,10,8,2,'#3a3a4a');

  // right bank head + cover
  pixBox(buf,192,18,56,22,'#5a5a68','#8a8a98','#2a2a3a');
  for(let i=0;i<4;i++){buf.disc(202+i*12,26,3,'#1a1a22');buf.disc(202+i*12,34,3,'#1a1a22');}
  pixBox(buf,196,8,48,10,'#e0b000','#ffe070','#8a6800');
  buf.rect(204,10,8,2,'#3a3a4a');buf.rect(224,10,8,2,'#3a3a4a');

  // intake manifold above the block
  pixBox(buf,bx+8,18,52,16,'#9a9aaa','#c0c0d0','#5a5a68');
  for(let i=0;i<4;i++)buf.rect(bx+12+i*12,20,8,10,'#4a4a58');
  buf.rect(bx+24,14,20,6,'#ff6600');

  // pistons and rods laid out left
  for(let i=0;i<4;i++){
    const px=32,py=48+i*14;
    pixBox(buf,px,py,12,10,'#c0c0d0','#e8e8f0','#6a6a7a');
    buf.rect(px+3,py+2,6,2,'#3a3a4a');
    buf.rect(px+14,py+3,18,3,'#8a8a98');
    buf.disc(px+34,py+4,3,'#4a4a58');
  }
  // pistons and rods right
  for(let i=0;i<4;i++){
    const px=244,py=48+i*14;
    pixBox(buf,px,py,12,10,'#c0c0d0','#e8e8f0','#6a6a7a');
    buf.rect(px+3,py+2,6,2,'#3a3a4a');
    buf.rect(px-18,py+3,18,3,'#8a8a98');
    buf.disc(px-20,py+4,3,'#4a4a58');
  }

  // oil pan below
  pixBox(buf,bx+6,by+58,56,14,'#4a4a58','#7a7a88','#2a2a3a');
  buf.rect(bx+20,by+68,28,3,'#2a2a3a');

  // gasket sheet and bolts
  buf.rect(200,78,40,16,'#3a5244');
  for(let i=0;i<8;i++)buf.set(206+(i%4)*8,82+Math.floor(i/4)*6,'#c0c0d0');
  // torque wrench
  buf.rect(48,92,70,3,'#c0c0d0');
  buf.rect(48,90,8,7,'#3a3a4a');
  buf.rect(110,90,12,7,'#ffcc00');
  // a drip of oil that blinks once in a while so the room is alive
  if(Math.floor(t*2)%7===0)buf.set(bx+34,by+38,'#3a3a18');
}

// Race pit: car on stands, wheels off, the bay open to the lane.
function drawPitGarage(buf,t){
  // back wall of the garage
  buf.rect(0,0,SCENE_W,70,'#1a2030');
  for(let y=8;y<60;y+=10)buf.rect(0,y,SCENE_W,1,'#121820');
  // sponsor stripe
  buf.rect(0,12,SCENE_W,10,'#c42828');
  buf.rect(0,14,SCENE_W,6,'#e0b000');
  for(let x=16;x<SCENE_W;x+=36){
    buf.rect(x,15,20,4,'#1a1a22');
  }
  // open mouth onto the pit lane
  buf.rect(220,20,68,70,'#0e1828');
  for(let i=0;i<6;i++)buf.rect(224+i*10,24,2,62,'#152030');
  buf.rect(220,78,68,4,'#e0b000');
  // floor
  buf.rect(0,70,SCENE_W,SHOP_H-70,'#2a2a34');
  for(let x=0;x<SCENE_W;x+=12)buf.rect(x,70,1,SHOP_H-70,'#1e1e28');
  buf.rect(0,70,SCENE_W,2,'#3a3a4a');
  // lane asphalt visible through the opening
  buf.rect(220,82,68,30,'#1a1a22');
  buf.rect(220,94,68,3,'#e8e8f0');

  // jack stands
  function stand(x,y){
    pixBox(buf,x,y,10,4,'#e0b000','#ffe070','#8a6800');
    buf.rect(x+4,y-10,2,10,'#c0c0d0');
    buf.rect(x+1,y-12,8,3,'#8a8a98');
  }
  stand(72,86);stand(96,86);stand(148,86);stand(172,86);

  // race car body, wheels off, sitting on the stands
  const cx=70,cy=48;
  buf.rect(cx+8,cy+16,100,18,'#e02020');
  buf.rect(cx+14,cy+8,88,12,'#ff3030');
  buf.rect(cx+20,cy+2,50,10,'#ff5050');
  // canopy / windscreen
  buf.rect(cx+40,cy+4,28,8,'#88cce8');
  buf.rect(cx+42,cy+5,10,6,'#1a2838');
  // rear wing
  buf.rect(cx+96,cy,20,4,'#1a1a22');
  buf.rect(cx+104,cy+4,4,14,'#1a1a22');
  // nose
  buf.rect(cx,cy+14,14,12,'#ff3030');
  buf.rect(cx-6,cy+20,10,6,'#e0b000');
  // number roundel
  buf.disc(cx+70,cy+18,7,'#e8e8f0');
  buf.rect(cx+67,cy+15,6,7,'#1a1a22');
  // wheel arches empty
  buf.rect(cx+16,cy+28,18,6,'#1a1a22');
  buf.rect(cx+86,cy+28,18,6,'#1a1a22');
  // undertray shadow on the stands
  buf.rect(cx+20,cy+34,80,2,'#14141c');

  // wheels off, leaning / on the floor
  pixTyre(buf,40,92,11,'#c0c0d0');
  pixTyre(buf,58,94,11,'#c0c0d0');
  pixTyre(buf,200,90,11,'#e0b000');
  pixTyre(buf,218,92,11,'#e0b000');

  // air gun and hose
  buf.rect(30,60,4,20,'#3a3a4a');
  buf.rect(28,56,8,6,'#ff6600');
  for(let i=0;i<8;i++)buf.set(34+i,76+((i%2)?1:0),'#6a6a7a');
  // toolbox
  pixBox(buf,188,58,28,24,'#c42828','#ff5a5a','#6a1414');
  for(let i=0;i<3;i++)buf.rect(190,62+i*6,24,4,i%2?'#a82020':'#b42424');
  // pit board leaning by the lane
  pixBox(buf,248,40,28,36,'#1a1a22','#3a3a4a','#0a0a10');
  buf.rect(252,46,20,4,'#00ff88');
  buf.rect(252,54,20,4,'#ffcc00');
  buf.rect(252,62,14,4,'#e8e8f0');
  // a lamp flicker over the bay
  const lit=(Math.floor(t*2)%9!==0);
  buf.rect(100,8,40,2,lit?'#fff2a8':'#6a6a40');
  if(lit)buf.rect(90,72,60,2,'#34343e');
}

const TITLE_SCENES=[drawWorkshop,drawTireBay,drawEngineFlatlay,drawPitGarage];

function titleNow(){return performance.now();}
function titleSceneState(now){
  const t0=titleT0||now||0;
  const elapsed=Math.max(0,(now||titleNow())-t0);
  const n=TITLE_SCENES.length;
  const idx=Math.floor(elapsed/SCENE_MS)%n;
  const local=elapsed%SCENE_MS;
  const maxPan=SCENE_W-VIEW_W;
  const pan=Math.min(maxPan,Math.floor((local/SCENE_MS)*maxPan));
  return {idx,pan,n,local,elapsed,maxPan};
}
// Tests and the menu itself read this: how many rooms, how long each holds, how far the pan walks.
function titleSceneInfo(){
  return {n:TITLE_SCENES.length,holdMs:SCENE_MS,viewW:VIEW_W,sceneW:SCENE_W,pan:SCENE_W-VIEW_W};
}
// Jump the carousel clock so a test can assert the pan and the scene change without waiting.
function titleAdvance(ms){
  titleT0=titleNow()-Math.max(0,ms);
  paintTitle();
  return titleSceneState(titleNow());
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
  const now=titleNow();
  if(!titleT0)titleT0=now;
  const st=titleSceneState(now);
  const buf=new PixBuf(SCENE_W,SHOP_H);
  TITLE_SCENES[st.idx](buf,titlePhase);
  const k=Math.max(1,Math.floor(Math.min(bw/VIEW_W,bh/SHOP_H)));
  const iw=VIEW_W*k,ih=SHOP_H*k;
  const dx=Math.floor((bw-iw)/2),dy=Math.floor((bh-ih)/2);
  // crop the wide scene to the stage and walk the crop left → right over the five seconds
  g.drawImage(buf.canvas(),st.pan,0,VIEW_W,SHOP_H,dx,dy,iw,ih);
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
  titleT0=titleNow();
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
  // pan wants a steadier clock than the old 90 ms tick; the rooms still breathe on titlePhase
  if(now-titleLast>50){titleLast=now;titlePhase+=0.25;paintTitle();}
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
