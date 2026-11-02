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
// A real car (CAR_PROFILES, keyed by the preset's name) replaces h, the overhangs and the eight
// shape numbers. Colour, a pickup's open bed and a stripe stay with the archetype.
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
  suv:     {h:1.70,ovF:0.30,ovR:0.26,nose:0.46,hood:0.58,ws:0.72,rf:0.62,rr:0.08,bk:0.04,deck:0.60,tail:0.56,col:'#556677'},
  openwheel:{h:0.96,ovF:0.22,ovR:0.16,nose:0.18,hood:0.24,ws:0.52,rf:0.50,rr:0.40,bk:0.20,deck:0.42,tail:0.40,col:'#ffaa22',stripe:1}
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
// A saved real car carries body.name, which selects its profile. A chassis change clears the body,
// so the picture becomes the archetype, the same moment the car stops being that car.
function carProfileLook(v,base){
  const spec=v&&v.body&&typeof CAR_PROFILES!=='undefined'&&CAR_PROFILES[v.body.name];
  if(!spec) return base;
  const wb=v.body.wb;
  if(!(wb>0)||!(spec.len>wb)||!(spec.front>0)||!(spec.len-wb-spec.front>0)) return base;
  const L=Object.assign({},base,{h:spec.h,ovF:spec.front/wb,ovR:(spec.len-wb-spec.front)/wb,
    nose:spec.nose,hood:spec.hood,ws:spec.ws,rf:spec.rf,rr:spec.rr,bk:spec.bk,deck:spec.deck,tail:spec.tail});
  if(spec.belt!=null) L.belt=spec.belt;
  if(spec.tub) L.tub=1;
  return L;
}
function carGeometry(v){
  const ch=CHASSIS[v.chassis]||CHASSIS.coupe,L=carProfileLook(v,CAR_LOOK[v.chassis]||CAR_LOOK.coupe);
  const wb=(v.body&&v.body.wb)||ch.wb;
  const wheel=v.wheelDia||18,tw=v.tireWidth||225,ta=v.tireAspect||40;
  const rTyre=((wheel*25.4)/2+tw*ta/100)/1000;                       // m, the same sum buildVehicle does
  let clear=(RIDE_M[v.suspension]||RIDE_M.sport)+(v.chassis==='pickup'||v.chassis==='suv'?0.08:0)-(v.chassis==='proto'?0.03:0);
  clear=Math.max(0.05,Math.min(clear,L.h-0.35));                     // the body stays a body on a tall ride height
  // 26 cells a metre, unless this car would leave the grid: a crew-cab then shrinks, wheels with it,
  // and keeps its shape. Anything shorter stays at the real scale, so a kei is still small.
  let pxm=CAR_PXM;
  const lenM=wb*(1+L.ovF+L.ovR);
  if(lenM*pxm>CAR_GW-12) pxm=(CAR_GW-12)/lenM;
  if(L.h*pxm>CAR_GY-2) pxm=(CAR_GY-2)/L.h;
  const wbPx=wb*pxm,lenPx=lenM*pxm;
  const x0=(CAR_GW-lenPx)/2;
  return {L,wb,wbPx,lenPx,x0,clear,rTyre,rPx:rTyre*pxm,pxm,rimFrac:(wheel*25.4/2)/(rTyre*1000),
    xr:x0+L.ovR*wbPx,xf:x0+(L.ovR+1)*wbPx,
    bodyBot:CAR_GY-clear*pxm,bodyH:Math.max(8,(L.h-clear)*pxm)};
}
function drawCarSprite(buf,v,e,t){
  v=v||DEFAULT_VEHICLE;t=t||0;
  const G=carGeometry(v),L=G.L,col=L.col;
  const X=u=>G.x0+u*G.lenPx,Y=f=>G.bodyBot-f*G.bodyH;
  // Side glass stops at belt when the profile sets one (a high boot must not shorten the doors).
  // Otherwise it is just above the higher of the bonnet and the deck, as the archetypes always were.
  const belt=Y(L.belt!=null?L.belt:Math.max(L.hood,L.deck)+0.02),lower=Y(0.30);
  const hi=shadeHex(col,0.4),lo=shadeHex(col,-0.3),glass='#1a2a3a';
  if(L.tub){
    // An open-wheeler: a pontoon, a nose and a hoop. The cabin is the empty space inside the hoop.
    const sh=0.40;
    buf.poly([[X(0),Y(0.20)],[X(0.05),Y(sh)],[X(0.96),Y(sh*0.85)],[X(1),Y(Math.min(0.26,L.nose))],
      [X(1),Y(0.10)],[X(0.985),Y(0)],[X(0.015),Y(0)],[X(0),Y(0.16)]],col);
    const yTop=Y(0.96),ySh=Y(sh),xH0=X(L.rr),xH1=X(L.rf);
    buf.rect(xH0,yTop,Math.max(2,xH1-xH0),2,col);
    buf.rect(xH0,yTop,1.6,Math.max(2,ySh-yTop),col);
    buf.rect(xH1-1.6,yTop,1.6,Math.max(2,ySh-yTop),col);
    buf.rect(xH1-1.6,yTop+2,1.6,Math.max(2,(ySh-yTop)*0.35),'#1a2a3a');
  }else{
    // the silhouette, rear bumper to nose
    const top=[[0,L.tail],[0.03,L.deck],[L.bk,L.deck],[L.rr,1],[L.rf,1],[L.ws,L.hood],[0.95,L.nose+0.06],[1,L.nose]];
    const pts=top.map(p=>[X(p[0]),Y(p[1])]);
    pts.push([X(1),Y(0.16)],[X(0.985),Y(0)],[X(0.015),Y(0)],[X(0),Y(0.18)]);
    buf.poly(pts,col);
    // roof line per column, for the glass, the highlight and the stripes
    const topAt=x=>{const u=(x-G.x0)/G.lenPx;
      for(let k=0;k+1<top.length;k++){const a=top[k],b=top[k+1];if(u>=a[0]&&u<=b[0])return Y(a[1]+(b[1]-a[1])*(u-a[0])/Math.max(1e-6,b[0]-a[0]));}
      return Y(L.nose);};
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
  }
  if(L.tub){
    for(let x=Math.ceil(X(0));x<=Math.floor(X(1));x++){
      let ty=null;for(let y=0;y<buf.h;y++)if(buf.get(x,y)===col){ty=y;break;}
      if(ty!=null)buf.set(x,ty,hi);
      for(let y=Math.ceil(lower);y<G.bodyBot;y++)if(buf.get(x,y)===col)buf.set(x,y,lo);
    }
  }
  // glint on the screen, door shut-line, lamps. An open-wheeler has no door.
  if(!L.tub){
    buf.set(X(L.ws)-4,belt-3,'#00ccff');buf.set(X(L.ws)-5,belt-4,'#00ccff');
    for(let y=Math.ceil(belt);y<G.bodyBot-2;y++)buf.set(X((L.rf+L.ws)/2),y,shadeHex(col,-0.45));
  }
  buf.rect(X(1)-2,Y(L.nose)+1,2,1,'#fff2a8');
  buf.rect(X(0),Y(L.tail)+1,1,2,'#ff4444');
  if(L.stripe)buf.rect(X(0.06),belt+2,G.lenPx*0.86,1,v.chassis==='proto'?'#00ff88':'#f0f0f0');
  // a race-stripped car wears a number
  if(v.weightRed==='race'){const cx=X((L.rf+L.rr)/2),cy=(belt+G.bodyBot)/2;buf.disc(cx,cy,3,'#f0f0f0');buf.rect(cx-0.5,cy-1.5,1,3,'#111118');}
  // the engine, x-rayed where it sits, so front-, mid- and rear-engined cars read differently
  const place=enginePlace(v);
  // A rear engine sits in the tail, behind the tyre, or a wide rear wheel covers the only clue that it is a 911.
  const rearOf=G.xr-Math.max(G.wbPx*0.10,G.rPx+4);
  const eu=(place==='front'?G.xf-G.wbPx*0.14:place==='mid'?G.xr+G.wbPx*0.24:rearOf)-G.x0;
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
// One front three-quarter for every layout, composed in engine-art.js from the parts on the form.
// drawEngineSprite is the entry paintEngine, the garage and the tests already call.
const ENG_GW=ENG_ART_W,ENG_GH=ENG_ART_H;
function drawEngineSprite(buf,e,t,live){
  e=e||DEFAULT_ENGINE;t=t||0;
  if(e.type==='electric')return drawMotorSprite(buf,e,t);
  drawEngineArt(buf,e,t,live);
}
function engineCaption(e){
  if(e.type==='electric')return motorCaption(e);
  // the same geometry buildEngine uses (a Wankel chamber is 3√3·e·R·W), so an unbuilt form reads right
  const B=(e.bore_mm||86)/10,S=(e.stroke_mm||86)/10,n=e.cylinders||4;
  const d=e.type==='rotary'?3*Math.sqrt(3)*(Math.min(e.ecc_mm||B*10/7,B*2)/10)*B*S*n/1000:Math.PI/4*B*B*S*n/1000;
  const conf=e.type==='rotary'?(e.cylinders||2)+'-ROTOR':((e.layout==='v'?'V':e.layout==='boxer'?'FLAT-':'I')+(e.cylinders||4));
  const ind=e.intake==='turbo'?' TURBO':e.intake==='supercharger'?' SC':'';
  return conf+' '+d.toFixed(1)+'L'+ind;
}
// One scratch grid and one scratch canvas for the preview, reused every frame. The static
// layers of a configuration live in drawEngineArt's cache; only the spinning parts are new.
let _engFrame=null,_engBlit=null;
function paintEngine(cv,e,opts){
  opts=opts||{};
  const gh=opts.caption?ENG_GH+12:ENG_GH;
  const F=fitPixCanvas(cv,ENG_GW,gh);if(!F)return false;
  const {g,k,ox,bw,bh}=F;
  pixBackdrop(g,bw,bh,k,ox,null);
  if(!_engFrame||_engFrame.w!==ENG_GW||_engFrame.h!==ENG_GH)_engFrame=new PixBuf(ENG_GW,ENG_GH);
  else _engFrame.c.fill(null);
  drawEngineSprite(_engFrame,e,opts.t||0,opts.live);
  if(!_engBlit||_engBlit.width!==ENG_GW||_engBlit.height!==ENG_GH){
    _engBlit=document.createElement('canvas');_engBlit.width=ENG_GW;_engBlit.height=ENG_GH;
  }
  const ig=_engBlit.getContext('2d'),img=ig.createImageData(ENG_GW,ENG_GH),d=img.data,cells=_engFrame.c;
  for(let i=0;i<cells.length;i++){const col=cells[i];if(!col)continue;const rgb=hexRgb(col);
    d[i*4]=rgb[0];d[i*4+1]=rgb[1];d[i*4+2]=rgb[2];d[i*4+3]=255;}
  ig.putImageData(img,0,0);
  g.drawImage(_engBlit,ox,0,ENG_GW*k,ENG_GH*k);
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
  // Live crank / turbo / blower angles exist once the LIVE tab has been turning the cutaway.
  // Until then the picture sweeps idle to redline on previewT (see engMotion).
  const live=(typeof crankAngle==='number'&&typeof state!=='undefined'&&state)?{rpm:state.rpm,crank:crankAngle,turbo:turboAngle,sc:scAngle}:null;
  paintEngine(cv,e,{t:previewT,live,caption:true,title:engineCaption(e),sub:tr(e.type==='electric'?'ELECTRIC':(ENGINE_TYPE[e.type]||ENGINE_TYPE.petrol4).label)});
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
