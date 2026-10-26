// ====== PIXEL SPRITES: the car and the engine you built, drawn as 8-bit art ======
// The ENGINE, VEHICLE and GARAGE tabs were forms and nothing else: you could build a mid-engine
// hypercar on semi-slicks with a rear wing and never once see it. These sprites are drawn FROM the
// build, not picked from a gallery: wheelbase sets the car's length, tyre width × aspect its
// sidewall, the suspension its ride height, bore and stroke the shape of the block. Change a
// field and the picture changes with it.
//
// Everything is drawn into a PixBuf, a grid of whole cells, then blown up with smoothing off. A
// sprite can therefore never land on a fractional pixel and blur — the same lesson the main
// canvas learned (see sizeCanvas). Shapes are rasterised at cell centres, not stroked, so edges
// stay hard at any zoom.
function PixBuf(w,h){this.w=w;this.h=h;this.c=new Array(w*h).fill(null);}
PixBuf.prototype={
  set(x,y,col){x=Math.round(x);y=Math.round(y);if(x>=0&&y>=0&&x<this.w&&y<this.h)this.c[y*this.w+x]=col;},
  get(x,y){x=Math.round(x);y=Math.round(y);return(x>=0&&y>=0&&x<this.w&&y<this.h)?this.c[y*this.w+x]:null;},
  rect(x,y,w,h,col){x=Math.round(x);y=Math.round(y);w=Math.round(w);h=Math.round(h);
    for(let j=y;j<y+h;j++)for(let i=x;i<x+w;i++)this.set(i,j,col);},
  disc(cx,cy,r,col){
    for(let j=Math.floor(cy-r);j<=Math.ceil(cy+r);j++)for(let i=Math.floor(cx-r);i<=Math.ceil(cx+r);i++){
      const dx=i+0.5-cx,dy=j+0.5-cy;if(dx*dx+dy*dy<=r*r)this.set(i,j,col);}},
  // Even-odd fill at cell centres: a hard-edged polygon, never an antialiased one.
  poly(pts,col){
    let y0=Infinity,y1=-Infinity;for(const p of pts){y0=Math.min(y0,p[1]);y1=Math.max(y1,p[1]);}
    for(let j=Math.floor(y0);j<=Math.ceil(y1);j++){
      const yc=j+0.5,xs=[];
      for(let k=0;k<pts.length;k++){const a=pts[k],b=pts[(k+1)%pts.length];
        if((a[1]<=yc)!==(b[1]<=yc))xs.push(a[0]+(yc-a[1])/(b[1]-a[1])*(b[0]-a[0]));}
      xs.sort((p,q)=>p-q);
      for(let k=0;k+1<xs.length;k+=2)for(let i=Math.ceil(xs[k]-0.5);i<=Math.floor(xs[k+1]-0.5);i++)this.set(i,j,col);
    }},
  line(x0,y0,x1,y1,col){const n=Math.max(1,Math.round(Math.max(Math.abs(x1-x0),Math.abs(y1-y0))));
    for(let k=0;k<=n;k++)this.set(x0+(x1-x0)*k/n,y0+(y1-y0)*k/n,col);},
  // A dark rim round everything drawn so far — what makes a sprite read as a sprite.
  outline(col){
    const o=this.c,w=this.w,h=this.h,out=o.slice();
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      if(o[y*w+x])continue;
      if((x>0&&o[y*w+x-1])||(x<w-1&&o[y*w+x+1])||(y>0&&o[(y-1)*w+x])||(y<h-1&&o[(y+1)*w+x]))out[y*w+x]=col;
    }
    this.c=out;},
  // Only into empty cells: shadows and floors go behind what is already there.
  under(x,y,w,h,col){for(let j=Math.round(y);j<Math.round(y+h);j++)for(let i=Math.round(x);i<Math.round(x+w);i++)if(!this.get(i,j))this.set(i,j,col);},
  canvas(){
    const cv=document.createElement('canvas');cv.width=this.w;cv.height=this.h;
    const g=cv.getContext('2d'),img=g.createImageData(this.w,this.h),d=img.data;
    for(let k=0;k<this.c.length;k++){const col=this.c[k];if(!col)continue;const rgb=hexRgb(col);
      d[k*4]=rgb[0];d[k*4+1]=rgb[1];d[k*4+2]=rgb[2];d[k*4+3]=255;}
    g.putImageData(img,0,0);return cv;}
};
const _rgbCache={};
function hexRgb(h){let r=_rgbCache[h];if(r)return r;const n=parseInt(h.slice(1),16);
  r=_rgbCache[h]=[(n>>16)&255,(n>>8)&255,n&255];return r;}
// f > 0 mixes toward white, f < 0 toward black.
function shadeHex(h,f){const c=hexRgb(h),t=f<0?0:255,a=Math.abs(f);
  return '#'+c.map(v=>Math.round(v+(t-v)*a).toString(16).padStart(2,'0')).join('');}
// Size a canvas to its CSS box in device pixels and hand back a whole-number cell size, so a grid of
// gw x gh cells always lands on exact pixels. A hidden canvas has no box; then it draws nothing.
function fitPixCanvas(cv,gw,gh){
  const cssW=cv.getBoundingClientRect().width;if(!cssW)return null;
  const dpr=Math.min(3,Math.max(1,window.devicePixelRatio||1));
  const bw=Math.round(cssW*dpr),bh=Math.round(bw*gh/gw);
  if(cv.width!==bw||cv.height!==bh){cv.width=bw;cv.height=bh;}
  const g=cv.getContext('2d');g.setTransform(1,0,0,1,0,0);g.imageSmoothingEnabled=false;
  const k=Math.max(1,Math.floor(bw/gw));
  return {g,k,ox:Math.floor((bw-gw*k)/2),oy:0,bw,bh};
}
// The backdrop both previews share: the app's navy, a dot grid like a workshop floor.
function pixBackdrop(g,bw,bh,k,ox,floorY){
  g.fillStyle='#0a0a10';g.fillRect(0,0,bw,bh);
  g.fillStyle='#161624';
  for(let y=4;y*k<bh;y+=8)for(let x=4;ox+x*k<bw;x+=8)g.fillRect(ox+x*k,y*k,k,k);
  if(floorY!=null){g.fillStyle='#12121c';g.fillRect(0,floorY*k,bw,bh-floorY*k);
    g.fillStyle='#26263a';g.fillRect(0,floorY*k,bw,k);}
}

// The name on the left, the figures on the right; a long name is cut short rather than run into them.
function pixCaption(g,k,ox,gw,gh,title,sub){
  const y=(gh+8)*k,fs=Math.max(7,Math.round(k*4));
  g.font=fs+'px "Press Start 2P"';g.textBaseline='alphabetic';
  sub=sub||'';title=title||'';
  const room=(gw-8)*k-g.measureText(sub).width-fs*2;
  if(g.measureText(title).width>room){while(title.length>1&&g.measureText(title+'…').width>room)title=title.slice(0,-1);title+='…';}
  g.fillStyle='#ffcc00';g.textAlign='left';g.fillText(title,ox+4*k,y);
  g.fillStyle='#00ccff';g.textAlign='right';g.fillText(sub,ox+(gw-4)*k,y);g.textAlign='left';
}
// ---- the car, side on ----
// u runs from the rear bumper (0) to the nose (1); heights are shares of the body's own height.
// ws = base of the windscreen, rf/rr = the roof's front and rear, bk = base of the rear glass.
// ovF/ovR are the overhangs as a share of the wheelbase. Length then comes from the wheelbase
// itself, so a kei is short and a pickup long without either being drawn to a fixed size.
const CAR_LOOK={
  kei:     {h:1.55,ovF:0.20,ovR:0.14,nose:0.40,hood:0.52,ws:0.80,rf:0.70,rr:0.10,bk:0.04,deck:0.55,tail:0.50,col:'#ffcc00'},
  hatch:   {h:1.44,ovF:0.30,ovR:0.18,nose:0.36,hood:0.50,ws:0.70,rf:0.56,rr:0.14,bk:0.06,deck:0.55,tail:0.50,col:'#ff4444'},
  roadster:{h:1.24,ovF:0.30,ovR:0.26,nose:0.32,hood:0.52,ws:0.56,rf:0.50,rr:0.36,bk:0.28,deck:0.58,tail:0.52,col:'#44aaff'},
  coupe:   {h:1.32,ovF:0.34,ovR:0.30,nose:0.30,hood:0.48,ws:0.66,rf:0.54,rr:0.34,bk:0.14,deck:0.58,tail:0.54,col:'#00ccff'},
  sedan:   {h:1.44,ovF:0.34,ovR:0.36,nose:0.36,hood:0.52,ws:0.68,rf:0.58,rr:0.30,bk:0.18,deck:0.58,tail:0.54,col:'#9a9aaa'},
  muscle:  {h:1.36,ovF:0.40,ovR:0.36,nose:0.40,hood:0.56,ws:0.62,rf:0.52,rr:0.34,bk:0.14,deck:0.58,tail:0.56,col:'#ff6600',stripe:1},
  rally:   {h:1.44,ovF:0.30,ovR:0.18,nose:0.36,hood:0.50,ws:0.70,rf:0.56,rr:0.14,bk:0.06,deck:0.55,tail:0.50,col:'#3355ff',stripe:1},
  gt:      {h:1.30,ovF:0.38,ovR:0.30,nose:0.30,hood:0.48,ws:0.58,rf:0.48,rr:0.30,bk:0.12,deck:0.56,tail:0.52,col:'#2a9a6a'},
  super:   {h:1.16,ovF:0.36,ovR:0.36,nose:0.24,hood:0.36,ws:0.70,rf:0.60,rr:0.44,bk:0.16,deck:0.62,tail:0.58,col:'#ff2244'},
  hyper:   {h:1.12,ovF:0.36,ovR:0.40,nose:0.22,hood:0.34,ws:0.70,rf:0.60,rr:0.46,bk:0.18,deck:0.62,tail:0.60,col:'#c0c0d0'},
  proto:   {h:1.02,ovF:0.30,ovR:0.36,nose:0.24,hood:0.34,ws:0.66,rf:0.56,rr:0.44,bk:0.22,deck:0.66,tail:0.62,col:'#e8e8f0',stripe:1},
  pickup:  {h:1.86,ovF:0.26,ovR:0.34,nose:0.50,hood:0.60,ws:0.72,rf:0.66,rr:0.47,bk:0.46,deck:0.60,tail:0.60,col:'#a0603a',bed:1},
  suv:     {h:1.70,ovF:0.30,ovR:0.26,nose:0.46,hood:0.58,ws:0.72,rf:0.62,rr:0.08,bk:0.04,deck:0.60,tail:0.56,col:'#556677'}
};
const CAR_GW=168,CAR_GH=62,CAR_GY=56,CAR_PXM=26;      // grid, ground row, cells per metre
const RIDE_M={comfort:0.16,sport:0.13,coilover:0.11,race:0.085};
const CALIPER_COL={steel:'#6a6a7a',slotted:'#ff4444',big:'#ff4444',carbon:'#ffcc00'};
function carLivery(v){return (CAR_LOOK[(v&&v.chassis)||'coupe']||CAR_LOOK.coupe).col;}
// Where the engine sits: the same answer the weight split uses (engineLayoutOf), so the picture and
// the physics cannot disagree about a 911.
function enginePlace(v){return engineLayoutOf(v.chassis,v.body);}
// The shape of the car from its record alone (never from what is loaded now), so a garage thumbnail
// shows the car that was saved. Old records may lack fields; each falls back to the archetype.
function carGeometry(v){
  const ch=CHASSIS[v.chassis]||CHASSIS.coupe,L=CAR_LOOK[v.chassis]||CAR_LOOK.coupe;
  const wb=(v.body&&v.body.wb)||ch.wb;
  const wheel=v.wheelDia||18,tw=v.tireWidth||225,ta=v.tireAspect||40;
  const rTyre=((wheel*25.4)/2+tw*ta/100)/1000;                       // m, the same sum buildVehicle does
  let clear=(RIDE_M[v.suspension]||RIDE_M.sport)+(v.chassis==='pickup'||v.chassis==='suv'?0.08:0)-(v.chassis==='proto'?0.03:0);
  clear=Math.max(0.05,clear);
  const wbPx=wb*CAR_PXM,lenPx=wbPx*(1+L.ovF+L.ovR);
  const x0=(CAR_GW-lenPx)/2;
  return {L,wb,wbPx,lenPx,x0,clear,rTyre,rPx:rTyre*CAR_PXM,rimFrac:(wheel*25.4/2)/(rTyre*1000),
    xr:x0+L.ovR*wbPx,xf:x0+(L.ovR+1)*wbPx,
    bodyBot:CAR_GY-clear*CAR_PXM,bodyH:(L.h-clear)*CAR_PXM};
}
function drawCarSprite(buf,v,e,t){
  v=v||DEFAULT_VEHICLE;t=t||0;
  const G=carGeometry(v),L=G.L,col=L.col;
  const X=u=>G.x0+u*G.lenPx,Y=f=>G.bodyBot-f*G.bodyH;
  // the silhouette, rear bumper to nose
  const top=[[0,L.tail],[0.03,L.deck],[L.bk,L.deck],[L.rr,1],[L.rf,1],[L.ws,L.hood],[0.95,L.nose+0.06],[1,L.nose]];
  const pts=top.map(p=>[X(p[0]),Y(p[1])]);
  pts.push([X(1),Y(0.16)],[X(0.985),Y(0)],[X(0.015),Y(0)],[X(0),Y(0.18)]);
  buf.poly(pts,col);
  // roof line per column, for the glass, the highlight and the stripes
  const topAt=x=>{const u=(x-G.x0)/G.lenPx;
    for(let k=0;k+1<top.length;k++){const a=top[k],b=top[k+1];if(u>=a[0]&&u<=b[0])return Y(a[1]+(b[1]-a[1])*(u-a[0])/Math.max(1e-6,b[0]-a[0]));}
    return Y(L.nose);};
  const belt=Y(Math.max(L.hood,L.deck)+0.02),lower=Y(0.30);
  const hi=shadeHex(col,0.4),lo=shadeHex(col,-0.3),glass='#1a2a3a';
  for(let x=Math.ceil(X(0));x<=Math.floor(X(1));x++){
    const ty=Math.ceil(topAt(x+0.5)-0.5);
    if(buf.get(x,ty)===col)buf.set(x,ty,hi);
    for(let y=Math.ceil(lower);y<G.bodyBot;y++)if(buf.get(x,y)===col)buf.set(x,y,lo);
    const u=(x+0.5-G.x0)/G.lenPx;
    if(u>L.bk+0.02&&u<L.ws-0.015&&ty+2<belt){
      const pillar=Math.abs(u-(L.rf+L.rr)/2)*G.lenPx<1.2&&v.chassis!=='roadster';
      for(let y=ty+1;y<belt;y++)buf.set(x,y,pillar?col:glass);
    }
  }
  // the pickup's bed is open
  if(L.bed)for(let x=Math.ceil(X(0.04));x<X(L.bk-0.02);x++){buf.set(x,Math.ceil(Y(L.deck)),'#2a2a3a');buf.set(x,Math.ceil(Y(L.deck))+1,lo);}
  // glint on the screen, door shut-line, lamps
  buf.set(X(L.ws)-4,belt-3,'#00ccff');buf.set(X(L.ws)-5,belt-4,'#00ccff');
  for(let y=Math.ceil(belt);y<G.bodyBot-2;y++)buf.set(X((L.rf+L.ws)/2),y,shadeHex(col,-0.45));
  buf.rect(X(1)-2,Y(L.nose)+1,2,1,'#fff2a8');
  buf.rect(X(0),Y(L.tail)+1,1,2,'#ff4444');
  if(L.stripe)buf.rect(X(0.06),belt+2,G.lenPx*0.86,1,v.chassis==='proto'?'#00ff88':'#f0f0f0');
  // a race-stripped car wears a number
  if(v.weightRed==='race'){const cx=X((L.rf+L.rr)/2),cy=(belt+G.bodyBot)/2;buf.disc(cx,cy,3,'#f0f0f0');buf.rect(cx-0.5,cy-1.5,1,3,'#111118');}
  // the engine, x-rayed where it sits, so front-, mid- and rear-engined cars read differently
  const place=enginePlace(v);
  const eu=(place==='front'?G.xf-G.wbPx*0.14:place==='mid'?G.xr+G.wbPx*0.24:G.xr-G.wbPx*0.10)-G.x0;
  const ex=X(Math.min(0.93,Math.max(0.07,eu/G.lenPx))),ey=G.bodyBot-G.bodyH*0.24;
  buf.rect(ex-4,ey-2,8,4,'#0d0d18');buf.rect(ex-3,ey-1,6,2,'#00ff88');
  if(e&&e.intake==='turbo')buf.rect(ex-6,ey-1,2,2,'#ff6600');
  if(e&&e.intake==='supercharger')buf.rect(ex-1,ey-4,3,2,'#ffcc00');
  // aero
  const dark='#3a3a4a';
  if(v.aeroFront==='splitter')buf.rect(X(0.94),G.bodyBot,X(1)-X(0.94)+3,1,dark);
  if(v.aeroFront==='wing'){buf.rect(X(0.96),G.bodyBot-1,X(1)-X(0.96)+5,2,dark);buf.rect(X(1)+4,G.bodyBot-3,1,4,dark);}
  if(v.aeroRear==='lip')buf.rect(X(0.01),Y(L.deck)-1,4,1,lo);
  if(v.aeroRear==='wing'){
    const wy=Y(L.deck)-6;
    buf.rect(X(0.05),wy,1,6,dark);buf.rect(X(0.10),wy,1,6,dark);
    buf.rect(X(0)-1,wy-2,X(0.13)-X(0)+2,2,lo);buf.rect(X(0)-1,wy-4,1,6,dark);
  }
  if(v.aeroFloor==='undertray')buf.rect(X(0.05),G.bodyBot,G.lenPx*0.9,1,'#26263a');
  if(v.aeroFloor==='diffuser')for(let k=0;k<3;k++)buf.line(X(0)+k*3,G.bodyBot+1,X(0)+k*3+4,G.bodyBot-2,dark);
  // wheels: a dark arch first, then tyre, rim, spokes, caliper and the hub
  const driven=v.drive||'rwd',slick=v.tireType==='slick',calip=CALIPER_COL[v.brakeType]||CALIPER_COL.slotted;
  for(const [wx,isFront] of [[G.xr,false],[G.xf,true]]){
    const r=G.rPx,cy=CAR_GY-r,rr=r*G.rimFrac;
    buf.disc(wx,cy,r+1.6,'#05050a');
    buf.disc(wx,cy,r,'#1c1c26');
    if(!slick)for(let k=0;k<12;k++){const a=t+k*Math.PI/6;buf.set(wx+Math.cos(a)*(r-0.7)-0.5,cy+Math.sin(a)*(r-0.7)-0.5,'#33334a');}
    buf.disc(wx,cy,rr,'#6a6a7a');buf.disc(wx,cy,rr-1,'#9a9aaa');
    for(let k=0;k<5;k++){const a=t+k*Math.PI*2/5;buf.line(wx-0.5,cy-0.5,wx-0.5+Math.cos(a)*(rr-1),cy-0.5+Math.sin(a)*(rr-1),'#c0c0d0');}
    for(let k=-1;k<=1;k++){const a=-Math.PI*0.62+k*0.32;buf.set(wx-0.5+Math.cos(a)*(rr-1.2),cy-0.5+Math.sin(a)*(rr-1.2),calip);}
    const powered=driven==='awd'||(driven==='fwd')===isFront;
    buf.rect(wx-1,cy-1,2,2,powered?'#00ff88':'#3a3a4a');
  }
  buf.outline('#05050a');
  buf.under(G.x0-2,CAR_GY,G.lenPx+4,1,'#05050a');                      // contact shadow
  return G;
}
// Paint a car into a canvas: backdrop, sprite and (optionally) the caption band under it.
function paintCar(cv,v,e,opts){
  opts=opts||{};
  const gh=opts.caption?CAR_GH+12:CAR_GH;
  const F=fitPixCanvas(cv,CAR_GW,gh);if(!F)return false;
  const {g,k,ox,bw,bh}=F;
  pixBackdrop(g,bw,bh,k,ox,CAR_GY+1);
  const buf=new PixBuf(CAR_GW,CAR_GH);
  drawCarSprite(buf,v,e,opts.t||0);
  g.drawImage(buf.canvas(),ox,0,CAR_GW*k,CAR_GH*k);
  if(opts.caption)pixCaption(g,k,ox,CAR_GW,CAR_GH,opts.title,opts.sub);
  return true;
}

// ---- the engine, from outside ----
// An inline is drawn side on, so you can count its cylinders; a V and a boxer are drawn from the front,
// because the angle between the banks IS the layout; a rotary is its stack of housings. Around the
// block sit the parts you chose, each where it really lives: induction on top, exhaust and turbos
// on the hot side, intercooler and radiator out front, the nitrous bottle off to the side.
const ENG_GW=150,ENG_GH=78;
const CAM_COL={stock:'#4a4a5e',sport:'#ff4444',race:'#ffcc00'};
const FUEL_COL={gasoline:'#00cc66',race:'#9a44ff',e85:'#44aaff',methanol:'#00ccff',diesel:'#2a2a2a'};
const HDR_COL={stock:'#6a4a3a',sport:'#c08040',race:'#e0a060'};
function drawEngineSprite(buf,e,t){
  e=e||DEFAULT_ENGINE;t=t||0;
  const n=Math.max(1,e.cylinders||4),bore=e.bore_mm||86,stroke=e.stroke_mm||86;
  const type=e.type||'petrol4',two=type==='twostroke';
  const layout=type==='rotary'?'rotary':(e.layout||'inline');
  const block='#6a6a7a',head='#9a9aaa',cover=type==='diesel'&&e.cam==='stock'?'#2a6a4a':(CAM_COL[e.cam]||CAM_COL.stock);
  const chrome='#c0c0d0',steel='#9a9aaa',dark='#3a3a4a';
  let top,left,right,exX,exY,pulley,bankTops=[];    // anchors the bolt-ons hang from
  if(layout==='inline'){
    const pitch=Math.max(4,Math.min(Math.round(bore/11),Math.floor(78/n)));
    const bw=n*pitch+6,bh=Math.max(12,Math.min(24,Math.round(stroke/5)));
    const bx=Math.round(70-bw/2),yb=66;
    buf.rect(bx+3,yb,bw-6,5,dark);                                       // sump
    buf.rect(bx,yb-bh,bw,bh,block);
    for(let k=1;k<n;k++)buf.rect(bx+3+k*pitch,yb-bh+2,1,bh-4,shadeHex(block,-0.25));
    const hy=yb-bh-6;
    if(two){for(let k=0;k<3;k++)buf.rect(bx+1,hy+k*2,bw-2,1,head);}     // finned two-stroke head
    else{buf.rect(bx+1,hy,bw-2,6,head);buf.rect(bx+2,hy-4,bw-4,4,cover);
      for(let k=0;k<n;k++)buf.rect(bx+3+k*pitch+Math.floor(pitch/2)-1,hy-3,2,2,type==='diesel'?chrome:'#111118');
      if(e.vvt)buf.rect(bx+bw-5,hy-3,2,2,'#00ff88');}
    top={x0:bx+2,x1:bx+bw-2,y:two?hy:hy-4,cyls:n,pitch,bx0:bx+3};
    left=bx;right=bx+bw;exX=bx-2;exY=yb-4;
    // headers, one primary per cylinder, sweeping back to the collector
    const hc=HDR_COL[e.exhaust]||HDR_COL.stock;
    // headers: a cast log on a stock engine, a primary per cylinder into a collector rail otherwise
    const ry=hy+(e.exhaust==='stock'?6:10);
    if(e.exhaust==='stock')buf.rect(bx+2,hy+6,bw-4,3,hc);
    else{for(let k=0;k<n;k++)buf.rect(bx+3+k*pitch+Math.floor(pitch/2)-1,hy+6,e.exhaust==='race'?1:2,4,hc);
      buf.rect(bx+2,ry,bw-4,2,hc);}
    buf.line(bx+2,ry+1,exX,exY,hc);
    buf.rect(exX-1,exY-1,3,3,hc);
    pulley={x:right+3,y:yb-4,cam:two?null:{x:right+2,y:hy+2}};
  }else if(layout==='rotary'){
    const r=Math.max(1,Math.min(4,n)),hw=11,hh=Math.max(26,Math.min(36,Math.round((e.bore_mm||105)/3.3)));
    const bw=r*hw+(r+1)*3,bx=Math.round(70-bw/2),yb=66;
    buf.rect(bx,yb-hh,bw,hh,dark);                                       // end and intermediate plates
    for(let k=0;k<r;k++){const x=bx+3+k*(hw+3);
      buf.poly([[x+2,yb-hh],[x+hw-2,yb-hh],[x+hw,yb-hh+3],[x+hw,yb-3],[x+hw-2,yb],[x+2,yb],[x,yb-3],[x,yb-hh+3]],head);
      buf.rect(x+2,yb-hh+4,hw-4,1,shadeHex(head,0.3));}
    buf.rect(bx+3,yb,bw-6,4,dark);
    top={x0:bx+2,x1:bx+bw-2,y:yb-hh,cyls:r*2,pitch:Math.floor((bw-4)/(r*2)),bx0:bx+2};
    left=bx;right=bx+bw;exX=bx-2;exY=yb-10;
    buf.rect(exX-1,exY-1,3,3,HDR_COL[e.exhaust]||HDR_COL.stock);
    buf.line(bx,yb-hh/2,exX,exY,HDR_COL[e.exhaust]||HDR_COL.stock);
    pulley={x:right+3,y:yb-hh/2,cam:null};
  }else{
    // front view: the crank in the middle, a bank up each side
    const boxer=layout==='boxer',cx=70,cy=boxer?46:54;
    const ang=boxer?Math.PI/2:Math.PI/6;                                 // from vertical
    const bl=Math.max(12,Math.min(22,Math.round(stroke/5))),bwid=Math.max(9,Math.min(15,Math.round(bore/7)));
    const seg=(s,d0,d1,w,col)=>{const dx=Math.sin(s*ang),dy=-Math.cos(s*ang),px_=-dy,py_=dx,h=w/2;
      buf.poly([[cx+dx*d0+px_*h,cy+dy*d0+py_*h],[cx+dx*d1+px_*h,cy+dy*d1+py_*h],[cx+dx*d1-px_*h,cy+dy*d1-py_*h],[cx+dx*d0-px_*h,cy+dy*d0-py_*h]],col);
      return [cx+dx*d1,cy+dy*d1];};
    buf.disc(cx,cy,11,block);
    buf.rect(cx-11,cy+(boxer?6:4),22,boxer?8:12,dark);                 // sump
    for(const s of [-1,1]){
      seg(s,5,5+bl,bwid,block);seg(s,5+bl,11+bl,bwid+2,head);
      const end=two?seg(s,11+bl,11+bl,bwid,head):seg(s,11+bl,15+bl,bwid,cover);
      bankTops.push(end);
      if(e.vvt&&!two){buf.rect(end[0]-1,end[1]-1,2,2,'#00ff88');}
    }
    const vt=boxer?cy-12:cy-bl-6;
    top={x0:cx-(boxer?10:7),x1:cx+(boxer?10:7),y:vt,cyls:2,pitch:boxer?10:7,bx0:cx-(boxer?10:7)};
    left=cx-(boxer?bl+16:Math.sin(ang)*(bl+15)+bwid/2);right=2*cx-left;
    // exhaust leaves each bank's outer, lower face and runs to a collector under the left bank
    const hc=HDR_COL[e.exhaust]||HDR_COL.stock;
    exX=Math.round(left)-2;exY=boxer?cy+14:cy+10;
    for(const s of [-1,1]){const [hx,hy]=seg(s,7+bl,7+bl,0,head);
      buf.line(hx+s*(bwid/2+1),hy+(boxer?bwid/2+1:2),s<0?exX:hx+s*2,s<0?exY:exY+2,hc);
      if(s>0)buf.line(hx+s*2,exY+2,exX,exY+2,hc);}
    buf.rect(exX-1,exY-1,3,4,hc);
    pulley={x:cx,y:cy,cam:null,front:true};
  }
  // ---- crank pulley and the accessory belt ----
  const spin=t*4;
  const pul=(x,y,r)=>{buf.disc(x,y,r,dark);buf.disc(x,y,r-1,steel);buf.set(x-0.5+Math.cos(spin)*(r-1.5),y-0.5+Math.sin(spin)*(r-1.5),'#111118');};
  pul(pulley.x,pulley.y,pulley.front?5:4);
  if(pulley.cam){pul(pulley.cam.x+1,pulley.cam.y,3);buf.line(pulley.x+3,pulley.y,pulley.cam.x+3,pulley.cam.y,'#111118');}
  // ---- induction ----
  const sys=e.intakeSys||'efi',filt=e.airFilter||'stock';
  const filterAt=(x,y,big)=>{
    if(filt==='none')return;
    if(filt==='perf'){buf.poly([[x,y-2],[x-5,y-3],[x-5,y+3],[x,y+2]],'#ff4444');buf.rect(x-6,y-3,1,6,'#cc2222');}
    else if(filt==='stock')buf.rect(x-6,y-3,6,6,'#222230');
    else buf.rect(x-4,y-2,4,4,'#222230');};
  let iy=top.y;                                                     // the top of whatever we have stacked so far
  const wide=top.x1-top.x0;
  const sc=e.intake==='supercharger'&&(e.scType||'roots')!=='centrifugal';
  // plenum: everything except ITBs, sidedrafts and the mechanical stacks sits on one
  const plenumless=sys==='itb'||sys==='mech'||sys==='sidedraft';
  if(!plenumless||sc){
    for(let x=top.x0+2;x<top.x1-2;x+=Math.max(3,top.pitch))buf.rect(x,iy-3,2,3,steel);
    buf.rect(top.x0,iy-7,wide,4,'#8a8a9a');iy-=7;
  }
  if(sc){                                                            // the blower sits on the manifold
    const sw=Math.min(wide,26),sx=Math.round((top.x0+top.x1-sw)/2),sh=e.scType==='screw'?7:9;
    buf.rect(sx,iy-sh,sw,sh,e.scType==='screw'?steel:chrome);
    for(let x=sx+2;x<sx+sw-1;x+=3)buf.rect(x,iy-sh+1,1,sh-2,dark);
    buf.disc(sx+sw+2,iy-sh/2,3,dark);buf.disc(sx+sw+2,iy-sh/2,2,steel);
    buf.line(sx+sw+4,iy-sh/2,pulley.x+(pulley.front?5:4),pulley.y,'#111118');
    iy-=sh;
  }
  if(sys==='itb'||sys==='mech'){
    const k=Math.min(top.cyls,Math.max(1,Math.floor(wide/4)));
    for(let j=0;j<k;j++){const x=Math.round(top.x0+(j+0.5)*wide/k);
      buf.rect(x-1,iy-6,2,6,sys==='mech'?steel:chrome);buf.rect(x-2,iy-7,4,1,chrome);
      if(filt!=='none')buf.rect(x-2,iy-9,4,2,filt==='perf'?'#ff4444':'#222230');}
    if(sys==='mech')buf.rect(top.x1+1,iy-4,4,4,'#4a4a5e');
    iy-=9;
  }else if(sys==='sidedraft'){
    const k=Math.max(1,Math.min(Math.ceil(top.cyls/2),Math.floor(wide/7)));
    for(let j=0;j<k;j++){const x=Math.round(top.x0+(j+0.5)*wide/k);
      buf.rect(x-3,iy-5,6,5,steel);buf.rect(x-2,iy-8,4,3,chrome);
      if(filt!=='none')buf.rect(x-3,iy-10,6,2,filt==='perf'?'#ff4444':'#222230');}
    iy-=10;
  }else if(sys==='carb1'||sys==='carb2'||sys==='carb4'){
    const cx=Math.round((top.x0+top.x1)/2),cw=sys==='carb4'?8:6;
    buf.rect(cx-cw/2,iy-4,cw,4,steel);
    if(filt==='none'){buf.rect(cx-cw/2+1,iy-7,cw-2,3,chrome);iy-=7;}
    else{const pw=sys==='carb4'?18:sys==='carb2'?14:10;
      buf.rect(cx-pw/2,iy-7,pw,3,filt==='perf'?'#ff4444':chrome);buf.rect(cx-pw/2+1,iy-6,pw-2,1,'#222230');iy-=7;}
  }else if(!sc||e.intake!=='supercharger'){
    // EFI: a throttle body on the plenum's back end and a pipe to the filter
    buf.rect(top.x0-3,iy+2,3,4,chrome);
    if(e.intake!=='turbo'){buf.rect(top.x0-9,iy+3,6,2,dark);filterAt(top.x0-9,iy+4);}
  }
  // ---- forced induction ----
  const icW=e.intake==='na'?0:e.intercooler==='large'?7:e.intercooler==='small'?5:0,icH=e.intercooler==='large'?24:14;
  const icX=Math.max(right+8,112),icY=56-icH;
  if(icW){buf.rect(icX,icY,icW,icH,dark);for(let y=icY+1;y<icY+icH-1;y+=2)buf.rect(icX+1,y,icW-2,1,'#6a6a7a');}
  if(e.intake==='turbo'){
    const R={small:5,medium:6,large:8}[e.turboSize]||6,cfg=e.turboConfig||'single';
    const units=cfg==='single'?[R]:cfg==='twin'?[R-1,R-1]:cfg==='sequential'?[R-2,R]:[R-1,R+1];
    let ty=exY-R-2,tx=Math.min(exX-R-3,left-R-4);
    units.forEach((r,j)=>{
      const x=Math.max(r+12,tx),y=ty-j*(r*2+3);
      buf.disc(x,y,r,'#c06030');buf.disc(x+1,y-1,r-2,'#ff6600');    // turbine, glowing
      if(e.vgt)for(let k=0;k<8;k++){const a=k*Math.PI/4;buf.set(x+0.5+Math.cos(a)*(r-1),y+Math.sin(a)*(r-1),'#ffcc00');}
      const cxx=x,cyy=y-r-2;buf.disc(cxx,cyy,r-1,steel);
      for(let k=0;k<3;k++){const a=t*9+k*Math.PI*2/3;buf.line(cxx-0.5,cyy-0.5,cxx-0.5+Math.cos(a)*(r-2),cyy-0.5+Math.sin(a)*(r-2),'#4a4a5e');}
      if(j===0)buf.line(x,y+r,exX,exY,HDR_COL[e.exhaust]||HDR_COL.stock);
    });
    // charge pipe: compressor, over the top, to the intercooler (or straight into the plenum)
    const cy0=ty-units.length*(R*2+3)+R,pipeY=Math.max(3,iy-4),cxp=Math.max(units[0]+12,tx);
    buf.line(cxp,cy0,cxp,pipeY,steel);
    if(icW){buf.line(cxp,pipeY,icX+icW/2,pipeY,steel);buf.line(icX+icW/2,pipeY,icX+icW/2,icY,steel);}
    else buf.line(cxp,pipeY,top.x0,pipeY,steel);
    filterAt(cxp-R,cy0+1);
    if(e.antilag)buf.rect(cxp-1,ty+R+1,2,2,'#ffcc00');
  }
  if(e.intake==='supercharger'&&e.scType==='centrifugal'){
    const x=right+6,y=pulley.y-12;buf.disc(x,y,5,steel);buf.disc(x,y,3,chrome);
    buf.line(x,y+5,pulley.x,pulley.y,'#111118');
    buf.line(x,y-5,x,Math.max(3,iy-3),steel);buf.line(x,Math.max(3,iy-3),top.x1-2,Math.max(3,iy-3),steel);
  }
  // ---- exhaust tail: cat brick, then the pipe out of frame ----
  const hc=HDR_COL[e.exhaust]||HDR_COL.stock,pipeT=e.exhaust==='race'?3:2;
  const tailY=72;
  buf.line(exX,exY,exX,tailY,hc);buf.rect(1,tailY,exX,pipeT,shadeHex(hc,-0.2));
  if(e.cat&&e.cat!=='none'){const cw=e.cat==='stock'?9:6;buf.rect(Math.round(exX/2-cw/2),tailY-2,cw,pipeT+4,steel);
    for(let x=Math.round(exX/2-cw/2)+1;x<exX/2+cw/2-1;x+=2)buf.rect(x,tailY-1,1,pipeT+2,dark);}
  // ---- radiator and oil cooler, out front ----
  const radH={small:24,stock:32,large:40}[e.radiator]||32,rx=Math.max(icX+icW+3,140)-(icW?0:4);
  buf.rect(rx,70-radH,6,radH,'#26263a');
  for(let y=70-radH+2;y<68;y+=2)buf.rect(rx+1,y,4,1,'#4a4a5e');
  buf.rect(rx,70-radH-2,6,2,'#00ccff');
  if(e.oilCooler)buf.rect(rx-1,71,8,3,'#6a6a7a');
  // ---- nitrous bottle and fuel can ----
  if(e.nitrous&&e.nitrous!=='none'){const h=e.nitrous==='large'?22:15;buf.rect(4,66-h,5,h,'#4466ff');buf.rect(5,64-h,3,2,chrome);buf.rect(4,60-h/2,5,1,'#f0f0f0');}
  const fc=FUEL_COL[e.fuel]||FUEL_COL.gasoline;
  buf.rect(12,62,5,6,fc);buf.rect(13,61,2,1,type==='diesel'?'#ffcc00':chrome);
  buf.outline('#05050a');
  buf.under(0,75,ENG_GW,1,'#26263a');
}
function engineCaption(e){
  // the same geometry buildEngine uses (a Wankel chamber is 3√3·e·R·W), so an unbuilt form reads right
  const B=(e.bore_mm||86)/10,S=(e.stroke_mm||86)/10,n=e.cylinders||4;
  const d=e.type==='rotary'?3*Math.sqrt(3)*(Math.min(e.ecc_mm||B*10/7,B*2)/10)*B*S*n/1000:Math.PI/4*B*B*S*n/1000;
  const conf=e.type==='rotary'?(e.cylinders||2)+'-ROTOR':((e.layout==='v'?'V':e.layout==='boxer'?'FLAT-':'I')+(e.cylinders||4));
  const ind=e.intake==='turbo'?' TURBO':e.intake==='supercharger'?' SC':'';
  return conf+' '+d.toFixed(1)+'L'+ind;
}
function paintEngine(cv,e,opts){
  opts=opts||{};
  const gh=opts.caption?ENG_GH+12:ENG_GH;
  const F=fitPixCanvas(cv,ENG_GW,gh);if(!F)return false;
  const {g,k,ox,bw,bh}=F;
  pixBackdrop(g,bw,bh,k,ox,null);
  const buf=new PixBuf(ENG_GW,ENG_GH);
  drawEngineSprite(buf,e,opts.t||0);
  g.drawImage(buf.canvas(),ox,0,ENG_GW*k,ENG_GH*k);
  if(opts.caption)pixCaption(g,k,ox,ENG_GW,ENG_GH,opts.title,opts.sub);
  return true;
}

// ---- the live previews on the ENGINE and VEHICLE tabs ----
// Redrawn every frame while their tab is open (see loop): the car is the BUILT car, which buildVehicle
// refreshes on every field change; the engine is the FORM, so it changes as you edit, before BUILD.
// Wheels turn and the turbo spins slowly unless the system asks for reduced motion.
let previewT=0;
const previewStill=!!(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches);
function renderCarPreview(){
  const cv=document.getElementById('carPreview');if(!cv||!vehicle||!vehicle.chassis)return;
  const dl={fwd:'FWD',rwd:'RWD',awd:'AWD'}[vehicle.drive]||'RWD';
  const fw=(vehicle.fWt!=null?vehicle.fWt:(CHASSIS[vehicle.chassis]||CHASSIS.coupe).fWt);
  paintCar(cv,vehicle,engine,{t:previewT*2.5,caption:true,title:tr(vehicle.chLabel||''),
    sub:dl+' • '+Math.round(vehicle.mass||0)+' kg • '+Math.round(fw*100)+'% F'});
}
function renderEnginePreview(){
  const cv=document.getElementById('enginePreview');if(!cv)return;
  const e=readEngineFromForm();
  paintEngine(cv,e,{t:previewT,caption:true,title:engineCaption(e),sub:tr((ENGINE_TYPE[e.type]||ENGINE_TYPE.petrol4).label)});
}
function stepPreviews(dt){
  if(!previewStill)previewT+=dt;
  if(vizMode==='design')renderEnginePreview();
  else if(vizMode==='vehicle')renderCarPreview();
}
// ---- top-down car for the track map ----
// 14 x 8 cells, built once per livery and pedal state and then rotated: a car you can see turning,
// still green on the throttle and red on the brake like the arrow it replaces.
const topCarCache={};
function topCarSprite(col,state){
  const key=col+state;if(topCarCache[key])return topCarCache[key];
  const b=new PixBuf(16,10),hi=shadeHex(col,0.35),lo=shadeHex(col,-0.35);
  b.rect(2,1,3,1,'#1c1c26');b.rect(10,1,3,1,'#1c1c26');b.rect(2,8,3,1,'#1c1c26');b.rect(10,8,3,1,'#1c1c26');   // tyres
  b.rect(1,2,14,6,col);b.rect(1,2,14,1,hi);b.rect(1,7,14,1,lo);
  b.rect(9,3,2,4,'#1a2a3a');b.rect(4,3,1,4,'#1a2a3a');               // windscreen, rear glass
  b.rect(5,3,4,4,shadeHex(col,0.15));                                 // roof
  b.rect(15,2,1,2,'#fff2a8');b.rect(15,6,1,2,'#fff2a8');              // headlamps
  b.rect(0,2,1,2,state==='brk'?'#ff2222':'#882222');b.rect(0,6,1,2,state==='brk'?'#ff2222':'#882222');
  b.outline('#000000');
  const cv=b.canvas();topCarCache[key]=cv;return cv;
}
function drawTopCar(g,x,y,heading,col,state){
  const spr=topCarSprite(col,state),s=1.5;
  g.save();g.translate(x,y);g.rotate(heading);g.imageSmoothingEnabled=false;
  if(state!=='coast'){g.fillStyle=state==='brk'?'rgba(255,85,85,0.35)':'rgba(0,255,136,0.35)';
    g.fillRect(-spr.width*s/2-2,-spr.height*s/2-2,spr.width*s+4,spr.height*s+4);}
  g.drawImage(spr,-spr.width*s/2,-spr.height*s/2,spr.width*s,spr.height*s);
  g.restore();
}
