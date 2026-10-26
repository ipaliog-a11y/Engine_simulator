// ---- the guide's pictures: 8-bit drawings made in code ----
// Every picture is a function of a 160 x 72 grid of cells (and, if it moves, of time t in seconds), drawn
// with whole-cell rectangles through fitPixCanvas, so it stays crisp at any width, weighs nothing in
// the offline cache and can show a mechanism moving rather than describe it. A page names its pictures
// with <canvas class="gart" data-art="name">; the index draws the first one small as the page's icon.
const GA_W=160,GA_H=72;
const GP={bg:'#0a0a10',ink:'#e0e0e0',dim:'#667',line:'#26263a',steel:'#8a94a6',steelD:'#4a5262',steelL:'#c4ccd8',
  y:'#ffcc00',c:'#00ccff',r:'#ff4444',o:'#ff8833',g:'#55dd66',b:'#4aa3ff',burnt:'#7a6a5a',dark:'#16161f',
  rub:'#26262e',white:'#ffffff',brown:'#8a5a2a',ice:'#bfe8ff',grass:'#2f7a3a',road:'#3a3a46'};
// The pen: cell coordinates, origin at the grid's top left.
function gaPainter(g,k,ox,oy){
  const P={g,k,
    r(x,y,w,h,c){if(w<=0||h<=0)return;g.fillStyle=c;g.fillRect(ox+Math.round(x)*k,oy+Math.round(y)*k,Math.round(w)*k,Math.round(h)*k);},
    p(x,y,c){P.r(x,y,1,1,c);},
    line(x0,y0,x1,y1,c){x0=Math.round(x0);y0=Math.round(y0);x1=Math.round(x1);y1=Math.round(y1);
      const dx=Math.abs(x1-x0),sx=x0<x1?1:-1,dy=-Math.abs(y1-y0),sy=y0<y1?1:-1;let e=dx+dy,n=0;
      for(;;){P.p(x0,y0,c);if((x0===x1&&y0===y1)||++n>2000)break;const e2=2*e;if(e2>=dy){e+=dy;x0+=sx;}if(e2<=dx){e+=dx;y0+=sy;}}},
    disc(cx,cy,rad,c){for(let dy=-rad;dy<=rad;dy++){const h=Math.floor(Math.sqrt(Math.max(0,rad*rad-dy*dy))+0.5);P.r(cx-h,cy+dy,2*h+1,1,c);}},
    ring(cx,cy,rad,c){const n=Math.max(8,Math.ceil(rad*7));for(let i=0;i<n;i++){const a=i/n*2*Math.PI;P.p(Math.round(cx+rad*Math.cos(a)),Math.round(cy+rad*Math.sin(a)),c);}},
    box(x,y,w,h,c){P.r(x,y,w,1,c);P.r(x,y+h-1,w,1,c);P.r(x,y,1,h,c);P.r(x+w-1,y,1,h,c);},
    arrow(x0,y0,x1,y1,c){P.line(x0,y0,x1,y1,c);const a=Math.atan2(y1-y0,x1-x0);
      for(const s of [-1,1])P.line(x1,y1,x1-3*Math.cos(a+s*0.6),y1-3*Math.sin(a+s*0.6),c);},
    // a curve u in [0,1] -> v in [0,1] across a box, v measured up from the bottom
    plot(x,y,w,h,fn,c,u1){let px=null,py=null;const n=Math.max(1,Math.round(w*(u1==null?1:u1)));
      for(let i=0;i<=n;i++){const u=i/w,v=fn(u);if(v==null||!isFinite(v)){px=null;continue;}
        const X=x+i,Y=y+h-1-Math.round(clamp(v,0,1)*(h-1));if(px!=null)P.line(px,py,X,Y,c);else P.p(X,Y,c);px=X;py=Y;}},
    axes(x,y,w,h){P.r(x,y,1,h,GP.dim);P.r(x,y+h-1,w,1,GP.dim);},
    txt(x,y,s,c,sz){const fs=Math.max(6,Math.round(k*4*(sz||1)));g.font=fs+'px "Press Start 2P"';g.textBaseline='top';
      g.fillStyle=c||GP.ink;g.textAlign='left';g.fillText(s,ox+Math.round(x)*k,oy+Math.round(y)*k);},
    ctxt(x,y,s,c,sz){const fs=Math.max(6,Math.round(k*4*(sz||1)));g.font=fs+'px "Press Start 2P"';g.textBaseline='top';
      g.fillStyle=c||GP.ink;g.textAlign='center';g.fillText(s,ox+Math.round(x)*k,oy+Math.round(y)*k);g.textAlign='left';},
    // rows of characters, each one a palette key ('.' = empty)
    spr(x,y,rows,pal){rows.forEach((row,j)=>{for(let i=0;i<row.length;i++){const c=pal[row[i]];if(c)P.p(x+i,y+j,c);}});},
    // spokes / blades round a hub
    blades(cx,cy,r0,r1,n,a0,c){for(let i=0;i<n;i++){const a=a0+i/n*2*Math.PI;P.line(cx+r0*Math.cos(a),cy+r0*Math.sin(a),cx+r1*Math.cos(a),cy+r1*Math.sin(a),c);}}
  };
  return P;
}
const gaFrac=x=>x-Math.floor(x);
const gaTri=x=>1-Math.abs(2*gaFrac(x)-1);          // 0 -> 1 -> 0 over one period
// A cylinder with its piston at stroke fraction s (0 = TDC), drawn from the top of the bore.
function gaCylinder(P,x,y,w,h,s,fill){
  const top=y+3, py=top+Math.round(s*(h-12));
  P.r(x-2,y,w+4,3,GP.steelD);                                   // head
  P.r(x-2,top,2,h,GP.steel);P.r(x+w,top,2,h,GP.steel);          // liner walls
  if(fill)P.r(x,top,w,py-top,fill);
  P.r(x,py,w,6,GP.steelL);P.r(x,py+1,w,1,GP.steelD);P.r(x,py+3,w,1,GP.steelD);   // piston with ring grooves
  return py;
}
// The crank-slider: piston position for crank angle a (radians, 0 = TDC), as a fraction of the stroke.
function gaSlider(a,lam){const L=lam||0.29,r=0.5,l=r/L;return (r*(1-Math.cos(a))+l-Math.sqrt(l*l-r*r*Math.sin(a)*Math.sin(a)));}
function gaCar(P,x,y,col,flip){
  const rows=['......aaaaaaaaa.........','....aaccccaccccaa.......','..aaaccccaaccccaaaaaa...',
    'aaaaaaaaaaaaaaaaaaaaaaaa','aaaaaaaaaaaaaaaaaaaaaaaa','.aa..aaaaaaaaaaaa..aa...'];
  const pal={a:col,c:GP.c};
  const rr=flip?rows.map(s=>s.split('').reverse().join('')):rows;
  P.spr(x,y,rr,pal);P.disc(x+4,y+6,2,GP.rub);P.disc(x+19,y+6,2,GP.rub);P.p(x+4,y+6,GP.steel);P.p(x+19,y+6,GP.steel);
}
function gaFlame(P,cx,cy,r,t){for(let i=0;i<r*3;i++){const a=i*2.4+t*9,d=(i%r)+0.5*Math.sin(t*20+i);
  P.p(cx+Math.round(Math.cos(a)*d),cy+Math.round(Math.sin(a)*d*0.8),i%3?GP.o:GP.y);}}
function gaGauge(P,cx,cy,rad,v,red,label){
  for(let i=0;i<=20;i++){const a=Math.PI*(0.75+1.5*i/20);P.p(cx+Math.round(rad*Math.cos(a)),cy+Math.round(rad*Math.sin(a)),i/20>=red?GP.r:GP.steel);}
  const a=Math.PI*(0.75+1.5*clamp(v,0,1));P.line(cx,cy,cx+(rad-2)*Math.cos(a),cy+(rad-2)*Math.sin(a),GP.y);P.disc(cx,cy,1,GP.steelL);
  if(label)P.ctxt(cx,cy+rad-2,label,GP.dim,0.75);
}
const GUIDE_ART={
  // --- getting started ---
  dynocell:{anim:1,draw(P,t){
    P.r(0,58,160,14,GP.dark);P.r(0,58,160,1,GP.line);
    P.r(14,30,40,24,GP.steelD);P.r(16,26,36,4,GP.steel);for(let i=0;i<4;i++)P.r(18+i*9,22,6,4,GP.r);   // engine, coils
    P.r(20,54,4,4,GP.steel);P.r(44,54,4,4,GP.steel);
    P.r(54,40,30,4,GP.steel);for(let i=0;i<5;i++)P.r(54+Math.floor(gaFrac(t*3+i/5)*30),40,2,4,GP.steelD);   // spinning shaft
    P.disc(98,42,13,GP.steelD);P.ring(98,42,13,GP.steel);P.blades(98,42,3,12,6,t*6,GP.steel);P.disc(98,42,2,GP.y);
    P.r(118,10,38,30,GP.dark);P.box(118,10,38,30,GP.c);
    const u1=gaFrac(t/4);P.plot(121,13,32,24,u=>0.9*Math.sin(Math.min(1,u*1.15)*2.6)*0.95,GP.y,u1);
    P.plot(121,13,32,24,u=>0.25+0.5*u,GP.c,u1);P.txt(120,44,'DYNO',GP.c,0.75);
    P.txt(10,62,'BUILD',GP.y,0.75);P.txt(60,62,'MEASURE',GP.c,0.75);P.txt(116,62,'LEARN',GP.g,0.75);}},
  levels:{anim:1,draw(P,t){
    const st=[[10,52,'LV1 REAL LIFE',GP.g],[50,36,'LV2 IN THE GAME',GP.c],[90,20,'LV3 THE PHYSICS',GP.y]];
    st.forEach(([x,y,s,c])=>{P.r(x,y,60,4,c);P.r(x,y+4,60,68-y,GP.dark);P.txt(x+2,y+6,s,c,0.6);});
    const ph=gaFrac(t/6)*3,i=Math.min(2,Math.floor(ph)),f=ph-i,[x,y]=st[i];
    const hx=x+6+f*40,hy=y-8-Math.round(Math.abs(Math.sin(t*8))*2);
    P.spr(hx,hy,['.yy.','yyyy','.cc.','c..c'],{y:GP.y,c:GP.c});}},
  devloop:{anim:1,draw(P,t){
    const lit=Math.floor(t*0.8)%3,cs=[GP.y,GP.c,GP.g];
    const xs=[14,66,118];
    xs.forEach((x,i)=>{P.box(x,14,30,30,i===lit?cs[i]:GP.line);});
    P.r(18,20,22,16,GP.ice);P.line(20,34,36,22,GP.b);P.line(20,22,30,34,GP.b);P.r(26,36,2,6,GP.steel);   // drafting board
    P.disc(81,29,9,GP.steelD);P.blades(81,29,2,8,6,t*4,GP.steel);                                       // dyno roller
    P.r(124,18,2,22,GP.steel);for(let j=0;j<4;j++)for(let i=0;i<4;i++)if((i+j)%2===0)P.r(126+i*4,18+j*3,4,3,GP.white);   // flag
    P.arrow(46,29,62,29,GP.dim);P.arrow(98,29,114,29,GP.dim);P.line(133,46,133,56,GP.dim);P.line(133,56,29,56,GP.dim);P.arrow(29,56,29,47,GP.dim);
    P.ctxt(29,60,'ENGINE',GP.y,0.6);P.ctxt(81,48,'DYNO',GP.c,0.6);P.ctxt(133,60,'TRACK',GP.g,0.6);}},
  twocurves:{anim:0,draw(P){
    P.axes(20,6,130,56);
    P.plot(21,6,128,55,u=>0.85*Math.sin(Math.min(1,u*1.1)*2.5),GP.steelD);
    P.plot(21,6,128,55,u=>0.95*Math.sin(Math.min(1,u*1.05)*2.4)-0.05*(1-u),GP.y);
    P.txt(100,8,'AFTER',GP.y,0.6);P.txt(100,16,'BEFORE',GP.steel,0.6);P.txt(22,64,'RPM ->',GP.dim,0.6);P.txt(2,6,'HP',GP.dim,0.6);}},
  dynobrake:{anim:1,draw(P,t){
    P.r(0,60,160,12,GP.dark);
    P.r(12,26,36,28,GP.steelD);P.r(14,22,32,4,GP.steel);P.r(48,36,30,4,GP.steel);
    P.disc(94,38,16,GP.steelD);P.ring(94,38,16,GP.r);P.blades(94,38,3,15,8,t*3,GP.steel);
    const v=0.5+0.4*Math.sin(t*0.9);gaGauge(P,138,30,14,v,0.8,'LOAD');
    P.txt(8,62,'ENGINE',GP.y,0.6);P.txt(76,62,'BRAKE',GP.r,0.6);
    P.arrow(64,20,64,34,GP.o);P.txt(52,12,'TORQUE',GP.o,0.6);}},
  crankslider:{anim:1,draw(P,t){
    const a=t*2.2;const s=gaSlider(a,0.3);
    gaCylinder(P,14,2,22,50,s,'#1a2a44');
    const cx=25,cy=60,cr=7,px=cx+cr*Math.sin(a),py=cy-cr*Math.cos(a);
    const pin=2+3+Math.round(s*(50-12))+3;P.line(25,pin,px,py,GP.steelL);P.ring(cx,cy,cr,GP.steelD);P.disc(px,py,1,GP.y);
    P.axes(52,4,104,56);
    P.plot(53,4,102,55,u=>1-gaSlider(u*2*Math.PI,0.3),GP.y);
    P.plot(53,4,102,55,u=>0.5+0.5*Math.cos(u*2*Math.PI),GP.steelD);
    const u=gaFrac(a/(2*Math.PI));P.disc(53+Math.round(u*102),4+54-Math.round((1-s)*54),1,GP.r);
    P.txt(56,62,'TDC',GP.dim,0.6);P.txt(98,62,'BDC',GP.dim,0.6);P.txt(130,62,'TDC',GP.dim,0.6);
    P.txt(108,6,'PISTON',GP.y,0.6);P.txt(108,13,'SINE',GP.steel,0.6);}},
  gauges:{anim:1,draw(P,t){
    const rpm=0.5+0.45*Math.sin(t*0.7);
    gaGauge(P,26,32,20,rpm,0.82,'RPM');gaGauge(P,80,32,20,clamp(rpm*1.1-0.2,0,1),0.9,'BOOST');
    P.box(112,10,40,8,GP.steel);P.r(113,11,Math.round(38*clamp(rpm-0.35,0,1)),6,rpm>0.85?GP.r:GP.g);P.txt(112,21,'KNOCK',GP.dim,0.6);
    P.box(112,34,40,8,GP.steel);P.r(113,35,Math.round(38*(0.3+0.3*rpm)),6,GP.o);P.txt(112,45,'EGT',GP.dim,0.6);
    P.txt(4,60,(Math.round(rpm*7000/100)*100)+' RPM',GP.y,0.75);}},
  // --- how an engine works ---
  fourstroke:{anim:1,draw(P,t){
    const cyc=gaFrac(t/5)*4*Math.PI, a=cyc%(2*Math.PI), st=Math.floor(cyc/Math.PI);
    const s=gaSlider(cyc,0.3);
    const fills=['#1d3d6e','#2a4f8a','#ff8833','#5a4a3a'],names=['INTAKE','COMPRESS','POWER','EXHAUST'],cols=[GP.b,GP.c,GP.o,GP.steel];
    const fill=st===2&&s<0.25?(Math.floor(t*12)%2?GP.y:GP.o):fills[st];
    const py=gaCylinder(P,50,10,40,42,s,fill);
    const iv=st===0?Math.sin(Math.min(Math.PI,cyc)):0, ev=st===3?Math.sin(cyc-3*Math.PI):0;
    P.r(54,4+Math.round(iv*4),10,2,GP.steelL);P.r(58,0,2,6+Math.round(iv*4),GP.steelL);         // intake valve
    P.r(76,4+Math.round(ev*4),10,2,GP.steelL);P.r(80,0,2,6+Math.round(ev*4),GP.steelL);         // exhaust valve
    P.r(40,4,14,4,GP.b);P.r(86,4,14,4,GP.burnt);
    if(st===2&&s<0.1)gaFlame(P,70,16,3,t);
    P.r(68,9,4,2,GP.y);                                                                           // spark plug tip
    const cx=70,cy=62,cr=5,px=cx+cr*Math.sin(cyc),pyy=cy-cr*Math.cos(cyc);P.line(70,py+3,px,pyy,GP.steelL);P.ring(cx,cy,cr,GP.steelD);
    names.forEach((n,i)=>P.txt(i<2?4:108,i%2?40:20,(i+1)+' '+n,i===st?cols[i]:GP.line,0.6));
    P.txt(4,62,'SUCK',st===0?GP.b:GP.line,0.6);P.txt(28,62,'SQUEEZE',st===1?GP.c:GP.line,0.6);
    P.txt(96,62,'BANG',st===2?GP.o:GP.line,0.6);P.txt(122,62,'BLOW',st===3?GP.steel:GP.line,0.6);}},
  pvloop:{anim:1,draw(P,t){
    P.axes(20,4,120,58);P.txt(2,4,'P',GP.dim,0.6);P.txt(124,64,'V',GP.dim,0.6);
    const pts=[];const CR=9;
    for(let i=0;i<=40;i++){const v=1-i/40*(1-1/CR);pts.push([v,0.06*Math.pow(1/v,1.3)]);}
    for(let i=0;i<=40;i++){const v=1/CR+i/40*(1-1/CR);pts.push([v,0.06*3.4*Math.pow(1/v,1.3)*Math.min(1,0.75+i/12)]);}
    const pmax=0.06*3.4*Math.pow(CR,1.3)*1.05;const X=v=>21+Math.round((v-1/CR)/(1-1/CR)*118),Y=p=>61-Math.round(clamp(p/pmax,0,1)*56);
    for(let i=1;i<pts.length;i++)P.line(X(pts[i-1][0]),Y(pts[i-1][1]),X(pts[i][0]),Y(pts[i][1]),i<41?GP.c:GP.o);
    P.line(X(1),Y(pts[40+40][1]),X(1),Y(pts[0][1]),GP.steel);
    const j=Math.floor(gaFrac(t/4)*pts.length);P.disc(X(pts[j][0]),Y(pts[j][1]),1,GP.y);
    P.txt(80,10,'AREA = WORK',GP.y,0.6);P.txt(70,48,'COMPRESSION',GP.c,0.6);P.txt(30,8,'COMBUSTION',GP.o,0.6);}},
  firetriangle:{anim:1,draw(P,t){
    P.line(80,6,40,62,GP.b);P.line(80,6,120,62,GP.y);P.line(40,62,120,62,GP.o);
    P.txt(10,34,'AIR',GP.b,0.75);P.txt(126,34,'SPARK',GP.y,0.75);P.ctxt(80,64,'FUEL',GP.o,0.75);
    for(let i=0;i<40;i++){const a=i*0.9,h=8+12*gaFrac(i*0.37+t*1.5);P.p(80+Math.round(Math.sin(a+t*6)*(10-h*0.4)),56-Math.round(h),h>16?GP.y:i%2?GP.o:GP.r);}
    P.txt(4,4,'14.7 : 1',GP.c,0.6);}},
  wrench:{anim:1,draw(P,t){
    const a=-0.4+0.25*Math.sin(t*1.5);const cx=30,cy=40;
    P.disc(cx,cy,6,GP.steelD);P.spr(cx-2,cy-2,['yyyyy','y...y','y...y','y...y','yyyyy'],{y:GP.y});
    const ex=cx+44*Math.cos(a),ey=cy+44*Math.sin(a);for(let w=-1;w<=1;w++)P.line(cx,cy+w,ex,ey+w,GP.steel);
    P.arrow(ex,ey-12,ex,ey-2,GP.r);P.txt(ex-6,ey-20,'F',GP.r,0.75);P.txt(20,58,'TORQUE = F x ARM',GP.y,0.6);
    P.axes(96,6,60,50);P.plot(97,6,58,49,u=>0.7+0.25*Math.sin(u*2.6)-0.3*u*u,GP.c);P.plot(97,6,58,49,u=>u*(0.7+0.25*Math.sin(u*2.6)-0.3*u*u)*1.25,GP.y);
    P.txt(98,58,'TQ',GP.c,0.6);P.txt(120,58,'POWER',GP.y,0.6);}},
  tacho:{anim:1,draw(P,t){
    const v=gaTri(t/5)*1.0;const cx=56,cy=40,R=30;
    for(let i=0;i<=40;i++){const a=Math.PI*(0.75+1.5*i/40);const rc=i>=33?GP.r:GP.steel;
      P.p(cx+Math.round(R*Math.cos(a)),cy+Math.round(R*Math.sin(a)),rc);if(i%5===0)P.line(cx+(R-3)*Math.cos(a),cy+(R-3)*Math.sin(a),cx+R*Math.cos(a),cy+R*Math.sin(a),rc);}
    const a=Math.PI*(0.75+1.5*v);P.line(cx,cy,cx+(R-4)*Math.cos(a),cy+(R-4)*Math.sin(a),GP.y);P.disc(cx,cy,2,GP.steelL);
    P.ctxt(cx,cy+12,'x1000',GP.dim,0.6);
    const lim=['PISTON SPEED','VALVE FLOAT','BREATHING','BURN TIME'];lim.forEach((s,i)=>P.txt(100,10+i*12,s,v>0.82?GP.r:GP.steelD,0.55));
    if(v>0.82&&Math.floor(t*6)%2)P.txt(14,62,'REV LIMIT!',GP.r,0.75);}},
  // --- designing the engine ---
  enginetypes:{anim:1,draw(P,t){
    const a=t*3;
    gaCylinder(P,8,8,18,40,gaSlider(a),'#1d3d6e');P.ctxt(17,58,'PETROL',GP.y,0.55);
    gaCylinder(P,48,8,18,40,gaSlider(a+1),'#2a4f8a');P.r(55,8,4,6,GP.c);P.ctxt(57,58,'DIESEL',GP.c,0.55);
    const s=gaSlider(a+2);gaCylinder(P,88,8,18,40,s,'#2a3a2a');P.r(86,34,2,8,s>0.7?GP.b:GP.steel);P.r(106,30,2,8,s>0.6?GP.burnt:GP.steel);P.ctxt(97,58,'2-STROKE',GP.g,0.55);
    P.ring(140,30,14,GP.steel);const ra=t*1.2;const tri=[0,1,2].map(i=>[140+9*Math.cos(ra+i*2.094),30+9*Math.sin(ra+i*2.094)]);
    for(let i=0;i<3;i++)P.line(tri[i][0],tri[i][1],tri[(i+1)%3][0],tri[(i+1)%3][1],GP.o);P.disc(140,30,2,GP.steelL);P.ctxt(140,58,'WANKEL',GP.o,0.55);}},
  borestroke:{anim:1,draw(P,t){
    const a=t*3;
    gaCylinder(P,14,14,46,30,gaSlider(a),'#1d3d6e');P.ctxt(37,52,'OVERSQUARE',GP.y,0.6);P.ctxt(37,60,'SHORT, WIDE',GP.dim,0.5);
    gaCylinder(P,104,2,26,52,gaSlider(a),'#2a4f8a');P.ctxt(117,60,'UNDERSQUARE',GP.c,0.6);
    P.arrow(14,8,60,8,GP.y);P.arrow(60,8,14,8,GP.y);P.txt(30,1,'BORE',GP.y,0.55);
    P.arrow(140,6,140,46,GP.c);P.arrow(140,46,140,6,GP.c);P.txt(143,22,'S',GP.c,0.6);}},
  crank4:{anim:1,draw(P,t){
    const a=t*2.4,order=[1,3,4,2],ph=[0,Math.PI,Math.PI,0];
    for(let i=0;i<4;i++){const ca=a+ph[i],s=gaSlider(ca);
      const cyc=gaFrac((a+[0,3,1,2][i]*Math.PI)/(4*Math.PI));const fire=cyc<0.08;
      const x=14+i*36;gaCylinder(P,x,2,24,40,s,fire?GP.o:'#1d3d6e');P.ctxt(x+12,48,String(i+1),fire?GP.y:GP.dim,0.75);
      const cx=x+12,cy=60,px=cx+5*Math.sin(ca),py=cy-5*Math.cos(ca);P.line(cx,2+3+Math.round(s*28)+3,px,py,GP.steelL);P.disc(px,py,1,GP.steel);}
    P.r(8,60,148,1,GP.steelD);P.txt(4,66,'FIRES 1-3-4-2',GP.y,0.55);}},
  camlobe:{anim:1,draw(P,t){
    const a=t*2,cx=26,cy=48,base=10;
    const lift=th=>{const d=Math.cos(th);return d>0.35?Math.pow((d-0.35)/0.65,1.5)*8:0;};
    for(let i=0;i<64;i++){const th=i/64*2*Math.PI,rr=base+lift(th-a+Math.PI/2);
      P.p(Math.round(cx+rr*Math.cos(th)),Math.round(cy-rr*Math.sin(th)),GP.steel);}
    P.disc(cx,cy,3,GP.steelD);const L=lift(Math.PI/2-a+Math.PI/2);
    const fy=cy-base-Math.round(L)-3;P.r(cx-6,fy,12,3,GP.steelL);P.r(cx-1,fy-24,2,24,GP.steelL);P.r(cx-7,fy-26,14,2,GP.y);
    for(let j=0;j<5;j++)P.r(cx-5,fy-22+j*4,10,1,GP.c);
    P.axes(60,8,96,48);P.plot(61,8,94,47,u=>{const d=Math.cos((u-0.5)*2*Math.PI);return d>0.35?Math.pow((d-0.35)/0.65,1.5):0;},GP.y);
    const u=gaFrac(-(a)/(2*Math.PI)+0.5);P.r(61+Math.round(u*94),8,1,48,GP.line);
    P.txt(62,60,'LIFT vs CRANK ANGLE',GP.dim,0.55);P.txt(100,10,'DURATION',GP.y,0.55);}},
  vvtshift:{anim:1,draw(P,t){
    const sh=0.08*Math.sin(t*1.2);
    const bump=c=>u=>{const d=Math.cos((u-c)*Math.PI*3.2);return Math.abs(u-c)<0.3?Math.max(0,d):0;};
    P.axes(10,6,140,52);
    P.plot(11,6,138,51,bump(0.38),GP.burnt);P.plot(11,6,138,51,bump(0.62-sh),GP.b);
    P.txt(20,8,'EXHAUST',GP.burnt,0.55);P.txt(100,8,'INTAKE',GP.b,0.55);
    P.r(11+Math.round(0.5*138),6,1,52,GP.dim);P.ctxt(80,60,'TDC: OVERLAP',GP.y,0.55);
    P.arrow(110-Math.round(sh*138),40,96-Math.round(sh*138),40,GP.c);P.txt(112-Math.round(sh*138),37,'PHASER',GP.c,0.5);}},
  throttle:{anim:1,draw(P,t){
    const open=gaTri(t/4);
    P.r(10,18,140,3,GP.steel);P.r(10,51,140,3,GP.steel);
    const a=(1-open)*1.2;const cx=80,cy=36;P.line(cx-15*Math.sin(a+0.15),cy-15*Math.cos(a+0.15),cx+15*Math.sin(a+0.15),cy+15*Math.cos(a+0.15),GP.y);
    P.disc(cx,cy,1,GP.steelL);
    const n=Math.round(4+open*20);for(let i=0;i<n;i++){const x=10+gaFrac(i*0.618+t*(0.3+open*0.9))*140,y=22+((i*7)%28);
      if(!(Math.abs(x-80)<4&&open<0.3))P.p(x,y,x<80?GP.b:GP.c);}
    P.txt(10,4,'THROTTLE '+Math.round(open*100)+'%',GP.y,0.6);P.txt(10,58,'MAP '+(0.3+0.7*open).toFixed(2)+' BAR',GP.c,0.6);}},
  injector:{anim:1,draw(P,t){
    P.r(20,4,10,18,GP.steel);P.r(22,22,6,4,GP.steelD);P.r(23,0,4,4,GP.c);
    if(Math.floor(t*3)%2===0)for(let i=0;i<50;i++){const a=(i%11-5)*0.07,d=4+gaFrac(i*0.31+t*3)*34;P.p(25+Math.round(Math.sin(a)*d),26+Math.round(Math.cos(a)*d),i%2?GP.c:GP.ice);}
    const xs=8,ys=6;for(let j=0;j<ys;j++)for(let i=0;i<xs;i++){const lam=1-0.15*(j/(ys-1))*(i/(xs-1)+0.4);
      P.r(70+i*10,8+j*8,9,7,lam<0.88?GP.r:lam<0.95?GP.o:GP.g);}
    const ci=Math.floor(gaFrac(t/6)*8),cj=Math.floor(gaFrac(t/9)*6);P.box(70+ci*10-1,8+cj*8-1,11,9,GP.y);
    P.txt(70,58,'RPM ->',GP.dim,0.55);P.txt(136,58,'LOAD',GP.dim,0.55);}},
  sparkplug:{anim:1,draw(P,t){
    const cyc=gaFrac(t/2.5),a=cyc*2*Math.PI,s=gaSlider(a);
    const py=gaCylinder(P,40,8,60,50,s,'#1d3d6e');P.r(66,4,8,8,GP.white);P.r(68,10,4,3,GP.steelL);
    const fire=cyc>0.92||cyc<0.18;if(cyc>0.92&&cyc<0.95)for(let i=0;i<6;i++)P.p(69+(i%2),13+i,GP.c);
    if(fire){const f=cyc>0.5?(cyc-0.92)/0.26:(cyc+0.08)/0.26;const rr=Math.round(3+f*20);
      for(let y=-rr;y<=rr;y++){const w=Math.round(Math.sqrt(Math.max(0,rr*rr-y*y))*1.4);const yy=16+y;if(yy>11&&yy<py)P.r(70-w,yy,2*w,1,y<-rr*0.5?GP.y:GP.o);}}
    P.txt(108,10,'SPARK',GP.c,0.6);P.txt(108,18,'BEFORE TDC',GP.c,0.5);P.txt(108,34,'FLAME',GP.o,0.6);P.txt(108,42,'PEAKS AFTER',GP.o,0.5);}},
  wiebe:{anim:1,draw(P,t){
    P.axes(20,4,130,56);const W=u=>1-Math.exp(-5*Math.pow(clamp(u,0,1),3));
    P.plot(21,4,128,55,u=>W((u-0.25)/0.5),GP.o);
    P.plot(21,4,128,55,u=>{const x=(u-0.25)/0.5;return x<0||x>1?0:15*x*x*Math.exp(-5*x*x*x)/3.2;},GP.y);
    const u=gaFrac(t/5);P.disc(21+Math.round(u*128),4+55-Math.round(W((u-0.25)/0.5)*55),1,GP.c);
    const c50=0.25+0.5*Math.pow(Math.log(2)/5,1/3);P.r(21+Math.round(c50*128),4,1,56,GP.line);P.txt(23+Math.round(c50*128),30,'CA50',GP.c,0.55);
    P.txt(100,10,'BURNED',GP.o,0.55);P.txt(30,10,'RATE',GP.y,0.55);P.txt(22,62,'CRANK ANGLE ->',GP.dim,0.55);}},
  energysplit:{anim:0,draw(P){
    const parts=[[0.30,'WORK',GP.g],[0.33,'EXHAUST',GP.r],[0.27,'COOLANT',GP.b],[0.10,'FRICTION+',GP.steel]];
    let x=8;P.txt(8,4,'100% OF THE FUEL',GP.y,0.6);P.r(8,14,144,10,GP.y);P.arrow(80,25,80,32,GP.dim);
    parts.forEach(([f,n,c],i)=>{const w=Math.round(f*144);P.r(x,34,w-1,12,c);P.txt(x,50+(i%2)*8,n,c,0.5);x+=w;});}},
  radiator:{anim:1,draw(P,t){
    P.r(10,8,60,52,GP.steelD);for(let i=0;i<14;i++)P.r(12+i*4,10,2,48,GP.steel);
    P.disc(110,34,20,GP.dark);P.ring(110,34,20,GP.steel);P.blades(110,34,3,18,5,t*8,GP.steelL);P.disc(110,34,3,GP.steelD);
    for(let i=0;i<10;i++){const y=12+gaFrac(i*0.37+t*0.5)*44;P.p(4,y,GP.r);P.p(74,y,GP.b);}
    P.txt(8,62,'HOT IN',GP.r,0.5);P.txt(52,62,'COOL OUT',GP.b,0.5);P.txt(96,62,'FAN',GP.steel,0.5);}},
  friction:{anim:1,draw(P,t){
    const s=gaSlider(t*2.2);const py=gaCylinder(P,30,4,40,56,s,'#1d3d6e');
    for(let i=0;i<8;i++)P.p(28-(i%2),py+i,GP.y),P.p(71+(i%2),py+i,GP.y);
    P.txt(80,8,'RINGS SCRAPE',GP.y,0.55);P.txt(80,16,'OIL FILM',GP.o,0.55);
    P.r(80,52,76,3,GP.steel);const bx=86+Math.round(gaTri(t/2)*44);P.r(bx,40,20,12,GP.steelD);
    for(let i=0;i<5;i++)P.p(bx+(gaFrac(t*3+i/5)<0.5?-2-i:21+i),50-(i%3),i%2?GP.o:GP.y);P.txt(80,60,'FRICTION = HEAT',GP.o,0.5);}},
  alternator:{anim:1,draw(P,t){
    P.disc(30,34,14,GP.steelD);P.blades(30,34,2,13,6,t*4,GP.steel);P.disc(30,34,3,GP.steelL);P.txt(14,52,'CRANK',GP.dim,0.55);
    P.disc(100,24,7,GP.steelD);P.blades(100,24,1,6,4,t*8,GP.steel);P.txt(110,22,'ALT',GP.y,0.55);
    P.line(30,20,100,17,GP.rub);P.line(30,48,100,31,GP.rub);
    for(let i=0;i<4;i++){const f=gaFrac(i/4+t*0.6);P.p(30+f*70,20-f*3,GP.y);}
    P.r(118,40,32,20,GP.steelD);P.r(122,36,6,4,GP.r);P.r(140,36,6,4,GP.steel);P.r(122,46,24,6,GP.g);P.txt(118,62,'12 V',GP.g,0.55);}},
  // --- breathing ---
  airpath:{anim:1,draw(P,t){
    const segs=[[2,'FILTER',GP.steel],[30,'THROTTLE',GP.y],[58,'RUNNER',GP.b],[86,'VALVE',GP.c],[110,'HEADER',GP.r],[136,'CAT',GP.o]];
    P.r(2,28,156,14,GP.dark);P.r(2,27,156,1,GP.steel);P.r(2,42,156,1,GP.steel);
    segs.forEach(([x,n,c],i)=>{P.r(x+10,24,2,22,c);P.txt(x,i%2?16:6,n,c,0.5);});
    gaCylinder(P,90,46,14,24,gaSlider(t*3),'#2a4f8a');
    for(let i=0;i<30;i++){const x=2+gaFrac(i*0.618+t*0.6)*156,y=30+((i*5)%11);P.p(x,y,x<96?GP.b:x<130?GP.r:GP.o);}}},
  helmholtz:{anim:1,draw(P,t){
    P.r(10,10,30,40,GP.dark);P.box(10,10,30,40,GP.steel);P.r(20,2,10,9,GP.dark);P.r(19,2,1,9,GP.steel);P.r(30,2,1,9,GP.steel);
    const v=Math.sin(t*6);P.r(22,4+Math.round(v*2),6,3,GP.c);P.txt(6,54,'BOTTLE',GP.dim,0.55);
    P.r(56,26,80,1,GP.steel);P.r(56,40,80,1,GP.steel);P.r(136,22,18,22,GP.steelD);
    const x=56+gaTri(t/2)*80;for(let y=27;y<40;y++)P.r(Math.round(x)-1,y,3,1,gaFrac(t/2)<0.5?GP.y:GP.b);
    P.txt(56,14,'RUNNER: A PULSE BOUNCES',GP.y,0.5);P.txt(132,48,'VALVE',GP.c,0.5);P.txt(56,48,'PLENUM',GP.dim,0.5);}},
  header:{anim:1,draw(P,t){
    for(let i=0;i<4;i++){const y=8+i*12;P.r(4,y,8,8,GP.steelD);P.line(12,y+4,100,34,GP.steel);}
    P.r(100,30,58,8,GP.steelD);
    const f=gaFrac(t/2);const going=f<0.5,u=going?f*2:2-f*2;const x=12+u*88,y=12+(34-12)*u;
    P.disc(Math.round(x),Math.round(y),2,going?GP.r:GP.b);
    P.txt(4,58,going?'BLOWDOWN PULSE ->':'<- SUCTION WAVE',going?GP.r:GP.b,0.55);P.txt(100,42,'COLLECTOR',GP.dim,0.5);}},
  backpress:{anim:1,draw(P,t){
    P.r(2,28,156,10,GP.dark);P.r(2,27,156,1,GP.steel);P.r(2,38,156,1,GP.steel);
    P.r(46,22,26,22,GP.steelD);for(let j=0;j<5;j++)P.r(47,24+j*4,24,1,GP.dark);
    P.r(98,18,40,30,GP.steelD);P.box(98,18,40,30,GP.steel);
    for(let i=0;i<40;i++){const raw=gaFrac(i*0.618+t*0.5),x=2+raw*156;const slow=x>46&&x<138;const y=30+((i*3)%7);P.p(Math.round(x),y,slow?GP.o:GP.r);}
    P.txt(46,12,'CAT',GP.o,0.55);P.txt(102,8,'SILENCER',GP.steel,0.55);P.txt(2,50,'EVERY RESTRICTION = PRESSURE',GP.y,0.5);P.txt(2,58,'THE PISTON PUSHES AGAINST',GP.y,0.5);}},
  turbo:{anim:1,draw(P,t){
    const sp=t*14;
    P.disc(46,34,24,'#3a1a14');P.ring(46,34,24,GP.r);P.blades(46,34,4,20,9,sp,GP.o);P.disc(46,34,4,GP.steelL);
    P.disc(114,34,24,'#14243a');P.ring(114,34,24,GP.c);P.blades(114,34,4,20,9,-sp,GP.b);P.disc(114,34,4,GP.steelL);
    P.r(70,32,20,4,GP.steelL);
    P.ctxt(46,64,'TURBINE',GP.r,0.55);P.ctxt(114,64,'COMPRESSOR',GP.c,0.55);P.ctxt(80,2,'ONE SHAFT',GP.y,0.55);
    for(let i=0;i<8;i++){const f=gaFrac(i/8+t*0.8);P.p(2+f*18,10+i*2,GP.r);P.p(140+f*18,10+i*2,GP.b);}}},
  compmap:{anim:1,draw(P,t){
    P.axes(16,4,140,58);
    [[0.90,8],[0.80,14],[0.72,20],[0.65,26]].forEach(([e,r],i)=>{for(let j=0;j<60;j++){const a=j/60*2*Math.PI;
      P.p(Math.round(84+r*1.9*Math.cos(a)),Math.round(30+r*0.9*Math.sin(a)-r*0.3*Math.cos(a)),[GP.g,GP.y,GP.o,GP.r][i]);}});
    P.line(20,58,52,6,GP.r);P.txt(20,6,'SURGE',GP.r,0.5);P.line(150,58,148,8,GP.steel);P.txt(126,6,'CHOKE',GP.steel,0.5);
    const u=gaTri(t/6);P.disc(Math.round(40+u*96),Math.round(54-u*40),2,GP.c);
    P.txt(18,64,'AIR FLOW ->',GP.dim,0.5);P.txt(0,30,'PR',GP.dim,0.5);}},
  wastegate:{anim:1,draw(P,t){
    const b=clamp(gaTri(t/5)*1.4,0,1),open=b>0.85?(b-0.85)/0.15:0;
    P.r(2,30,96,10,GP.dark);P.r(2,29,96,1,GP.steel);P.r(2,40,96,1,GP.steel);
    P.disc(110,35,10,'#3a1a14');P.blades(110,35,2,9,7,t*12*(0.4+b),GP.o);
    P.r(60,16,10,13,GP.dark);P.r(59,16,1,13,GP.steel);P.r(70,16,1,13,GP.steel);
    P.line(60,29,60+Math.round(10*Math.cos(open*1.2)),29-Math.round(10*Math.sin(open*1.2)),GP.y);
    for(let i=0;i<14;i++){const x=2+gaFrac(i*0.618+t)*58;P.p(x,32+(i%6),GP.r);}
    if(open>0)for(let i=0;i<6;i++){P.p(62+(i%3)*2,22-Math.round(gaFrac(i/6+t*2)*10),GP.r);}
    gaGauge(P,138,24,14,b,0.86,'BOOST');P.txt(46,8,open>0?'GATE OPEN':'GATE SHUT',open>0?GP.y:GP.dim,0.55);}},
  lag:{anim:1,draw(P,t){
    P.axes(16,4,140,58);const f=gaFrac(t/6);
    P.plot(17,4,138,57,u=>u<0.2?0.05:0.95,GP.y,f);
    P.plot(17,4,138,57,u=>u<0.2?0.02:0.9*(1-Math.exp(-Math.pow((u-0.2)*5,2))),GP.c,f);
    P.txt(30,6,'THROTTLE',GP.y,0.55);P.txt(90,40,'BOOST',GP.c,0.55);P.txt(18,64,'TIME ->',GP.dim,0.5);
    P.r(17+Math.round(0.2*138),4,1,58,GP.line);P.txt(46,24,'LAG',GP.r,0.6);}},
  vgt:{anim:1,draw(P,t){
    const b=0.37+0.6*gaTri(t/5);
    P.disc(56,36,30,'#24140f');P.disc(56,36,10,'#3a1a14');P.blades(56,36,2,9,7,t*10,GP.o);
    for(let i=0;i<11;i++){const a=i/11*2*Math.PI,x=56+20*Math.cos(a),y=36+20*Math.sin(a),va=a+Math.PI/2-b;
      P.line(x-5*Math.cos(va),y-5*Math.sin(va),x+5*Math.cos(va),y+5*Math.sin(va),GP.steelL);}
    P.ring(56,36,30,GP.steel);
    P.txt(96,14,b<0.7?'VANES SHUT':'VANES OPEN',GP.y,0.6);P.txt(96,26,b<0.7?'FAST GAS':'FREE FLOW',GP.c,0.55);P.txt(96,34,b<0.7?'EARLY BOOST':'TOP END',GP.c,0.55);}},
  roots:{anim:1,draw(P,t){
    const a=t*2.5;
    const lobe=(cx,cy,ph,col)=>{for(let i=0;i<120;i++){const th=i/120*2*Math.PI,rr=8+6*Math.abs(Math.cos(th));
      P.p(Math.round(cx+rr*Math.cos(th+ph)),Math.round(cy+rr*Math.sin(th+ph)),col);}P.disc(cx,cy,2,GP.steelL);};
    P.box(36,6,88,58,GP.steel);lobe(64,35,a,GP.y);lobe(96,35,-a+Math.PI/2,GP.c);
    for(let i=0;i<8;i++){const f=gaFrac(i/8+t*0.7);P.p(80+(i%3)-1,62-f*8,GP.b);P.p(80+(i%3)-1,8-f*6,GP.o);}
    P.txt(2,2,'BELT',GP.dim,0.55);P.ring(14,30,8,GP.steel);P.blades(14,30,1,7,3,a,GP.steel);P.line(14,22,56,24,GP.rub);
    P.txt(128,62,'IN',GP.b,0.5);P.txt(128,2,'OUT',GP.o,0.5);}},
  intercooler:{anim:1,draw(P,t){
    P.r(44,10,72,52,GP.steelD);for(let i=0;i<17;i++)P.r(46+i*4,12,2,48,GP.steel);
    P.r(2,30,42,10,GP.dark);P.r(116,30,42,10,GP.dark);
    for(let i=0;i<24;i++){const f=gaFrac(i*0.618+t*0.5),x=2+f*156,y=31+((i*3)%8);const c=x<44?GP.r:x<116?(x<80?GP.o:GP.c):GP.b;P.p(Math.round(x),y,c);}
    for(let i=0;i<6;i++){const y=8+gaFrac(i/6+t)*56;P.p(40,Math.round(y),GP.ice);P.p(120,Math.round(y),GP.ice);}
    P.txt(2,20,'HOT',GP.r,0.55);P.txt(130,20,'COOL',GP.b,0.55);P.txt(56,2,'AIR TO AIR',GP.dim,0.5);}},
  nitrous:{anim:1,draw(P,t){
    P.r(12,10,22,52,GP.b);P.r(14,10,4,52,'#7cc0ff');P.r(18,4,10,6,GP.steel);P.r(28,6,30,2,GP.steel);
    P.txt(14,30,'N2O',GP.white,0.55);
    P.r(58,16,90,1,GP.steel);P.r(58,50,90,1,GP.steel);P.r(58,4,4,12,GP.steel);
    const on=Math.floor(t/1.5)%2===0;if(on)for(let i=0;i<60;i++){const d=gaFrac(i*0.37+t*2)*80,a=(i%13-6)*0.035;P.p(62+Math.round(d),18+Math.round(14+Math.sin(a)*d*0.9)-14+((i*7)%30),i%3?GP.ice:GP.white);}
    P.txt(70,58,on?'SPRAY: +O2, COLD':'BUTTON OFF',on?GP.c:GP.dim,0.55);}},
  // --- knock & limits ---
  knock:{anim:1,draw(P,t){
    const f=gaFrac(t/3);
    P.r(8,8,64,40,'#1d3d6e');P.box(8,8,64,40,GP.steel);P.r(10,6,6,2,GP.white);
    const rr=Math.round(f*70);for(let y=8;y<48;y++)for(let x=8;x<72;x+=1){const d=Math.hypot(x-12,y-9);if(d<rr&&d>rr-3)P.p(x,y,GP.o);else if(d<rr-3&&(x+y)%3===0)P.p(x,y,'#5a3010');}
    const kn=f>0.45;if(kn){const kr=Math.round((f-0.45)*60);P.disc(62,40,Math.min(9,kr),Math.floor(t*14)%2?GP.y:GP.r);}
    P.txt(6,52,'SPARK FLAME',GP.o,0.5);if(kn)P.txt(40,58,'END GAS GOES BANG',GP.r,0.5);
    P.axes(84,8,72,44);P.plot(85,8,70,43,u=>{const b=Math.exp(-Math.pow((u-0.45)/0.15,2));const ring=u>0.47?0.25*Math.exp(-(u-0.47)*12)*Math.sin((u-0.47)*140):0;return 0.1+0.75*b+ring;},GP.y,f*1.05);
    P.txt(86,56,'PRESSURE',GP.dim,0.5);}},
  pumps:{anim:0,draw(P){
    [['95',GP.g],['98',GP.y],['E85',GP.b],['M',GP.c]].forEach(([s,c],i)=>{const x=10+i*38;
      P.r(x,14,26,44,GP.steelD);P.r(x+3,18,20,12,GP.dark);P.ctxt(x+13,21,s,c,0.75);P.r(x+3,36,20,4,c);P.r(x+26,22,4,2,GP.steel);P.r(x+29,22,2,20,GP.rub);});
    P.txt(10,62,'OCTANE = KNOCK RESISTANCE',GP.y,0.5);}},
  blown:{anim:1,draw(P,t){
    P.r(30,22,70,38,GP.steelD);P.r(34,16,62,6,GP.steel);P.r(30,60,70,4,GP.dark);
    P.r(60,34,10,10,GP.dark);P.line(64,40,86,6,GP.steelL);P.line(65,40,87,6,GP.steelL);P.disc(86,6,2,GP.steel);
    for(let i=0;i<30;i++){const f=gaFrac(i*0.27+t*0.4),x=66+Math.sin(i+t)*10*f+i%5,y=34-f*30;P.p(Math.round(x),Math.round(y),f<0.3?GP.o:GP.steelD);}
    for(let i=0;i<10;i++)P.p(32+i*7,62+(i%2),GP.o);
    P.txt(104,24,'HEALTH',GP.dim,0.55);P.box(104,32,50,6,GP.steel);P.r(105,33,Math.round(48*gaFrac(-t/8)),4,GP.r);P.txt(104,44,'0% = BLOWN',GP.r,0.55);}},
  catalyst:{anim:1,draw(P,t){
    P.r(40,14,80,44,GP.steelD);for(let j=0;j<10;j++)for(let i=0;i<20;i++)P.r(42+i*4,16+j*4,3,3,(i+j)%2?'#5a5a66':'#6a6a78');
    const mols=[['CO',GP.r,'CO2',GP.steel],['HC',GP.o,'H2O',GP.b],['NOX',GP.y,'N2',GP.g]];
    mols.forEach(([a,ca,b,cb],i)=>{const f=gaFrac(t/4+i/3),x=2+f*138,s2=x<80?a:b;P.r(Math.round(x)-1,19+i*12,s2.length*2+2,5,GP.dark);P.txt(Math.round(x),20+i*12,s2,x<80?ca:cb,0.5);});
    P.txt(46,62,'THREE-WAY CAT @ LAMBDA 1',GP.y,0.5);}},
  // --- the car ---
  car:{anim:0,draw(P){
    P.r(0,56,160,16,GP.road);P.r(0,56,160,1,GP.steel);
    const big=['..........aaaaaaaaaaaaaaaaaa..............','.......aaaccccccccaaccccccccaa............',
      '.....aaaccccccccccaaccccccccccaaaa........','..aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa..','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','.aaaa......aaaaaaaaaaaaaaaaaa......aaaaaa.'];
    for(let s=0;s<2;s++)big.forEach((row,j)=>{for(let i=0;i<row.length;i++){const c=row[i]==='a'?GP.r:row[i]==='c'?GP.c:null;if(c)P.r(38+i*2,28+j*3,2,3,c);}});
    for(const x of [52,108]){P.disc(x,54,7,GP.rub);P.disc(x,54,3,GP.steel);}
    P.r(46,40,14,6,GP.g);P.txt(4,4,'ENGINE IN FRONT, DRIVEN WHEELS',GP.dim,0.5);P.txt(4,12,'WHEELBASE, TRACK, CG HEIGHT',GP.dim,0.5);
    P.arrow(52,66,108,66,GP.y);P.arrow(108,66,52,66,GP.y);}},
  tyre:{anim:1,draw(P,t){
    P.disc(36,30,24,GP.rub);P.disc(36,30,12,GP.steelD);P.blades(36,30,3,11,5,t,GP.steel);P.r(14,54,44,4,GP.o);P.txt(10,62,'CONTACT PATCH',GP.o,0.5);
    P.ring(116,34,26,GP.steel);P.r(90,34,53,1,GP.line);P.r(116,8,1,53,GP.line);
    const a=t*0.9,rr=22+3*Math.sin(t*2.3);P.disc(Math.round(116+rr*Math.sin(a)),Math.round(34-rr*1.0*Math.cos(a)),2,GP.y);
    P.txt(108,0,'BRAKE',GP.dim,0.5);P.txt(108,64,'DRIVE',GP.dim,0.5);P.txt(74,30,'TURN',GP.dim,0.5);P.txt(146,30,'TURN',GP.dim,0.5);}},
  gears:{anim:1,draw(P,t){
    const g1=(cx,cy,r,n,a,c)=>{P.disc(cx,cy,r-2,GP.steelD);for(let i=0;i<n;i++){const th=a+i/n*2*Math.PI;P.r(Math.round(cx+r*Math.cos(th))-1,Math.round(cy+r*Math.sin(th))-1,3,3,c);}P.disc(cx,cy,2,GP.steelL);};
    const a=t*1.5;g1(48,36,14,10,a,GP.y);g1(48+14+22,36,24,17,-a*10/17+0.18,GP.c);
    P.txt(30,60,'SMALL: FAST',GP.y,0.5);P.txt(78,64,'BIG: SLOW + STRONG',GP.c,0.5);P.txt(4,4,'RATIO = TEETH OUT / IN',GP.dim,0.5);}},
  sawtooth:{anim:0,draw(P){
    P.axes(16,4,140,58);const gs=[3.5,2.2,1.55,1.18,0.95,0.8];
    gs.forEach((g,i)=>{const vmax=1/g*0.78,vstart=i===0?0:1/gs[i-1]*0.78;
      const rpmAt=v=>v*g/0.78;P.line(16+Math.round(vstart*140),62-Math.round(rpmAt(vstart)*56),16+Math.round(vmax*140),62-56,[GP.r,GP.o,GP.y,GP.g,GP.c,GP.b][i]);});
    P.txt(18,64,'ROAD SPEED ->',GP.dim,0.5);P.txt(0,4,'RPM',GP.dim,0.5);P.txt(60,4,'REDLINE',GP.r,0.5);}},
  diff:{anim:1,draw(P,t){
    P.r(10,20,140,4,GP.steel);P.disc(80,22,8,GP.steelD);P.ring(80,22,8,GP.y);P.r(78,24,4,30,GP.steel);
    P.r(4,10,14,24,GP.rub);for(let i=0;i<4;i++)P.r(4,10+Math.round(gaFrac(t*4+i/4)*24),14,1,GP.steel);
    P.r(142,10,14,24,GP.rub);P.r(142,14+Math.round(gaFrac(t*0.4)*16),14,1,GP.steel);
    P.r(0,34,24,6,GP.ice);P.txt(0,42,'ICE',GP.ice,0.5);P.txt(124,42,'GRIP',GP.g,0.5);
    P.txt(30,58,'OPEN DIFF: THE LIGHT',GP.y,0.5);P.txt(30,64,'WHEEL SPINS, CAR STAYS',GP.y,0.5);}},
  aero:{anim:1,draw(P,t){
    const body=x=>{const u=(x-30)/100;if(u<0||u>1)return null;return 44-Math.round(14*Math.sin(Math.PI*Math.min(1,u*1.2))*(u<0.85?1:0.6));};
    for(let x=30;x<=130;x++){const y=body(x);if(y!=null)P.r(x,y,1,50-y,GP.r);}
    P.r(118,24,18,2,GP.y);P.r(126,26,2,6,GP.steel);P.disc(48,50,5,GP.rub);P.disc(112,50,5,GP.rub);
    for(let k=0;k<5;k++){const y0=6+k*6;for(let i=0;i<14;i++){const x=Math.round(2+gaFrac(i/14+t*0.5+k*0.1)*156);const yb=body(x);const y=yb!=null?Math.min(y0,yb-2-(4-k)):y0;P.p(x,y,GP.c);}}
    P.arrow(80,52,80,62,GP.g);P.txt(84,58,'DOWNFORCE',GP.g,0.5);P.arrow(136,40,152,40,GP.r);P.txt(124,46,'DRAG',GP.r,0.5);}},
  brakedisc:{anim:1,draw(P,t){
    const h=gaTri(t/6);const col=h<0.25?GP.steel:h<0.5?'#a05040':h<0.75?GP.r:GP.o;
    P.disc(50,36,28,col);P.disc(50,36,14,GP.steelD);for(let i=0;i<6;i++){const a=i/6*2*Math.PI;P.disc(Math.round(50+8*Math.cos(a)),Math.round(36+8*Math.sin(a)),1,GP.dark);}
    P.r(70,18,14,36,GP.y);P.r(72,20,10,32,'#c09000');
    P.txt(96,8,'SPEED',GP.c,0.55);P.txt(96,16,'BECOMES',GP.c,0.55);P.txt(96,24,'HEAT',GP.r,0.55);
    P.txt(96,40,Math.round(150+h*700)+' C',col,0.6);if(h>0.8)P.txt(96,52,'FADE!',GP.r,0.6);}},
  roll:{anim:1,draw(P,t){
    const r=0.12*Math.sin(t*1.2);P.r(0,62,160,10,GP.road);
    const cx=80,cy=34;const pt=(x,y)=>[cx+(x-cx)*Math.cos(r)-(y-cy)*Math.sin(r),cy+(x-cx)*Math.sin(r)+(y-cy)*Math.cos(r)];
    for(let y=16;y<46;y++)for(let x=44;x<116;x+=1){if(y<28&&(x<58+(28-y)||x>102-(28-y)))continue;const [X,Y]=pt(x,y);P.r(Math.round(X),Math.round(Y),2,2,y<28?GP.c:GP.r);}
    for(const [x,s] of [[46,-1],[114,1]]){const lean=-r*1.5*(s);for(let y=46;y<62;y++)P.r(Math.round(x-4+(y-54)*lean),y,8,1,GP.rub);}
    P.txt(4,4,r>0?'<- TURNING LEFT':'TURNING RIGHT ->',GP.y,0.5);P.txt(4,12,'BODY ROLLS, OUTSIDE TYRE LEANS',GP.dim,0.5);}},
  dragstrip:{anim:1,draw(P,t){
    const f=gaFrac(t/4);P.r(0,50,160,22,GP.road);for(let x=0;x<160;x+=16)P.r(x,60,8,1,GP.steel);
    P.r(14,4,10,40,GP.dark);['#ffcc00','#ffcc00','#ffcc00','#55dd66'].forEach((c,i)=>P.disc(19,10+i*9,3,f>i*0.1&&f<0.45?c:GP.line));
    const go=f>0.3,u=go?Math.pow((f-0.3)/0.7,2):0;gaCar(P,30+Math.round(u*110),44,GP.r);
    if(go&&u<0.2)for(let i=0;i<5;i++)P.p(26+Math.round(u*110)-i,50,GP.steel);
    P.txt(40,4,'0-100 KM/H: '+(go?(u*5.2).toFixed(1):'0.0')+' S',GP.y,0.55);}},
  // --- the track ---
  racingline:{anim:1,draw(P,t){
    const cx=14,cy=70,ri=40,ro=62;
    for(let y=0;y<72;y++)for(let x=cx;x<cx+ro+1;x++){const d=Math.hypot(x-cx,y-cy);
      if(d>=ri&&d<=ro)P.p(x,y,d<ri+1.5?((x+y)%4<2?GP.r:GP.white):d>ro-1.5?GP.white:GP.road);}
    // out-in-out: wide on entry, the inside kerb at the apex (late, past halfway), wide again on exit
    const line=s=>{const a=Math.PI/2*(1-s),rr=ro-3-(ro-ri-6)*Math.pow(Math.sin(Math.PI*Math.pow(s,1.2)),1.4);return [cx+rr*Math.cos(a),cy-rr*Math.sin(a)];};
    for(let i=0;i<=80;i++){const [x,y]=line(i/80);P.p(Math.round(x),Math.round(y),GP.y);}
    const [qx,qy]=line(gaFrac(t/4));P.disc(Math.round(qx),Math.round(qy),2,GP.c);
    P.txt(96,8,'1 OUT',GP.y,0.55);P.txt(96,18,'2 IN (APEX)',GP.y,0.55);P.txt(96,28,'3 OUT',GP.y,0.55);P.txt(96,46,'LATE APEX',GP.c,0.5);P.txt(96,54,'= FAST EXIT',GP.c,0.5);}},
  speedtrace:{anim:0,draw(P){
    P.axes(10,4,146,58);const v=u=>0.55+0.35*Math.sin(u*9)+0.08*Math.sin(u*23);let px=null,py=null;
    for(let i=0;i<=144;i++){const u=i/144,vv=v(u),d=v(u+0.004)-vv;const c=d>0.004?GP.g:d<-0.006?GP.r:GP.b;const X=11+i,Y=4+57-Math.round(vv*55);if(px!=null)P.line(px,py,X,Y,c);px=X;py=Y;}
    P.txt(12,64,'POWER',GP.g,0.5);P.txt(56,64,'BRAKING',GP.r,0.5);P.txt(108,64,'GRIP',GP.b,0.5);}},
  crest:{anim:1,draw(P,t){
    const road=x=>40-14*Math.sin((x-10)/140*2*Math.PI);
    for(let x=0;x<160;x++){const y=Math.round(road(x));P.r(x,y,1,72-y,GP.grass);P.r(x,y,1,2,GP.road);}
    const x=Math.round(10+gaFrac(t/5)*140),y=Math.round(road(x));gaCar(P,x-12,y-8,GP.y);
    const crest=Math.sin((x-10)/140*2*Math.PI)>0.6,dip=Math.sin((x-10)/140*2*Math.PI)<-0.6;
    P.txt(4,4,crest?'CREST: LIGHT, LESS GRIP':dip?'DIP: PRESSED DOWN, MORE GRIP':'GRAVITY + SHAPE OF THE ROAD',crest?GP.r:dip?GP.g:GP.dim,0.5);}},
  gps:{anim:1,draw(P,t){
    P.r(12,6,12,8,GP.steelL);P.r(4,8,8,4,GP.b);P.r(24,8,8,4,GP.b);
    for(let i=0;i<4;i++){const f=gaFrac(i/4+t*0.6);P.p(18+Math.round(f*30),14+Math.round(f*20),GP.c);}
    const pts=[];for(let i=0;i<44;i++){const a=i/44*2*Math.PI;pts.push([100+40*Math.cos(a)+8*Math.cos(3*a),38+22*Math.sin(a)+4*Math.sin(2*a)]);}
    pts.forEach(([x,y],i)=>{if(i<=Math.floor(gaFrac(t/5)*44))P.disc(Math.round(x+((i*7)%3)-1),Math.round(y+((i*5)%3)-1),0,GP.y);});
    P.txt(4,62,'GPX POINTS -> A CIRCUIT',GP.y,0.5);}},
  printer:{anim:1,draw(P,t){
    const f=gaFrac(t/4);P.r(30,30,100,24,GP.steelD);P.r(34,26,92,4,GP.steel);P.r(118,40,6,3,GP.g);
    const h=Math.round(f*28);P.r(46,30-h,68,h,GP.white);for(let j=0;j<h-2;j+=3)P.r(50,30-h+2+j,40+((j*7)%20),1,j%2?GP.r:'#1d4e89');
    P.r(40,54,80,4,GP.dark);P.txt(32,62,'LAP + DYNO REPORTS',GP.y,0.5);}},
  reportcard:{anim:0,draw(P){
    P.r(30,4,100,64,GP.white);P.r(30,4,100,10,'#1d4e89');P.txt(34,6,'SCORECARD',GP.white,0.55);
    [['POWER','A'],['TORQUE','B'],['BAND','A'],['EFF','C'],['SAFETY','B'],['DRIVE','A'],['EMIT','B']].forEach(([n,g],i)=>{P.txt(34,17+i*7,n,'#333',0.45);P.txt(112,17+i*7,g,g==='A'?'#1a7f37':g==='B'?'#1d4e89':'#c1121f',0.45);});
    P.txt(136,24,'A',GP.y,1.5);}},
  coins:{anim:1,draw(P,t){
    for(let s=0;s<5;s++)for(let i=0;i<=s;i++){P.r(14+s*14,58-i*5,12,4,GP.y);P.r(14+s*14,58-i*5,12,1,'#ffe680');}
    P.r(96,20,54,30,GP.dark);P.box(96,20,54,30,GP.g);P.txt(100,24,'BUDGET',GP.g,0.5);P.txt(100,36,'$'+Math.round(18000+4000*Math.sin(t)),GP.y,0.6);
    P.txt(4,4,'EVERY PART HAS A PRICE',GP.dim,0.5);}},
  race:{anim:1,draw(P,t){
    // a loop of track, three cars at slightly different paces, and the pit board
    const cx=56,cy=36,rx=46,ry=24,pt=a=>[cx+rx*Math.cos(a),cy+ry*Math.sin(a)];
    for(let i=0;i<120;i++){const a=i/120*2*Math.PI;for(const d of [-4,4]){P.p(Math.round(cx+(rx+d)*Math.cos(a)),Math.round(cy+(ry+d)*Math.sin(a)),GP.steel);}}
    for(let y=cy-ry-3;y<=cy+ry+3;y++)for(let x=cx-rx-3;x<=cx+rx+3;x++){const q=Math.pow((x-cx)/rx,2)+Math.pow((y-cy)/ry,2);if(q>0.84&&q<1.18&&(x+y)%2)P.p(x,y,GP.road);}
    P.r(cx-1,cy+ry-4,2,9,GP.white);
    const cars=[[GP.r,0.200,0],[GP.c,0.196,0.05],[GP.y,0.190,0.11]];
    cars.forEach(([c,sp,o])=>{const a=-(t*sp+o)*2*Math.PI;const [x,y]=pt(a);P.r(Math.round(x)-2,Math.round(y)-1,4,3,c);});
    P.r(112,8,44,40,GP.dark);P.box(112,8,44,40,GP.steel);
    const gap=((0.4+0.3*Math.sin(t/3))).toFixed(1);
    P.txt(116,12,'P1',GP.r,0.6);P.txt(116,22,'+'+gap,GP.c,0.6);P.txt(116,32,'LAP '+(1+Math.floor(t*0.2)%9),GP.y,0.6);
    const tt=Math.round(70+20*Math.sin(t*0.7));for(let k=0;k<4;k++)P.r(116+k*9,52,7,6,tt>85?GP.y:GP.g);P.txt(116,60,'TYRES '+tt+'C',GP.dim,0.45);}},
  // --- options & reference ---
  speaker:{anim:1,draw(P,t){
    P.r(8,20,12,32,GP.steelD);P.line(20,20,36,8,GP.steel);P.line(20,52,36,64,GP.steel);P.r(36,8,2,57,GP.steel);
    for(let i=0;i<3;i++){const r=10+i*8+Math.round(gaFrac(t*2)*6);for(let a=-0.7;a<=0.7;a+=0.05)P.p(Math.round(36+r*Math.cos(a)),Math.round(36+r*Math.sin(a)),GP.c);}
    P.axes(76,8,80,50);let px=null,py=null;for(let i=0;i<80;i++){const ph=gaFrac(i/20+t*0.5);const v=Math.exp(-ph*6)*Math.sin(ph*40);const X=77+i,Y=33-Math.round(v*20);if(px!=null)P.line(px,py,X,Y,GP.y);px=X;py=Y;}
    P.txt(78,62,'FIRING PULSES',GP.y,0.5);}},
  caution:{anim:0,draw(P){
    for(let y=0;y<44;y++){const w=Math.round(y*0.9);P.r(80-w,10+y,2*w+1,1,y<3?GP.y:GP.y);}
    for(let y=3;y<40;y++){const w=Math.round((y-3)*0.9)-3;if(w>0)P.r(80-w,10+y,2*w+1,1,GP.dark);}
    P.r(78,24,4,16,GP.y);P.r(78,44,4,4,GP.y);P.txt(30,62,'WHAT THE MODEL LEAVES OUT',GP.dim,0.5);}},
  scales:{anim:1,draw(P,t){
    const tilt=0.06*Math.sin(t*1.3);P.r(78,20,4,40,GP.steel);P.r(60,60,40,4,GP.steelD);
    const L=[80-50*Math.cos(tilt),20-50*Math.sin(tilt)],R=[80+50*Math.cos(tilt),20+50*Math.sin(tilt)];P.line(L[0],L[1],R[0],R[1],GP.steelL);
    for(const [x,y,s,c] of [[L[0],L[1],'MODEL',GP.c],[R[0],R[1],'REAL CAR',GP.y]]){P.line(x,y,x-8,y+14,GP.steel);P.line(x,y,x+8,y+14,GP.steel);P.r(x-10,y+14,20,2,c);P.ctxt(x,y+18,s,c,0.5);}
    P.ctxt(80,4,'TEST41: 2.66% RMS',GP.g,0.5);}},
  book:{anim:0,draw(P){
    P.r(30,10,48,54,GP.b);P.r(82,10,48,54,GP.b);P.r(32,12,46,50,GP.white);P.r(82,12,46,50,GP.white);P.r(78,10,4,54,'#1d4e89');
    ['A  AFR','B  BMEP','C  CA50','D  DIFF'].forEach((s,i)=>P.txt(35,16+i*10,s,'#333',0.45));['E  EGT','F  FMEP','G  GEAR','H  HP'].forEach((s,i)=>P.txt(85,16+i*10,s,'#333',0.45));}}
};
// Draw one picture into its canvas at time t. The art name comes from data-art; a missing name draws
// nothing rather than throwing, so a typo in a page cannot take the guide down.
function drawGuideArt(cv,t){
  const art=GUIDE_ART[cv.dataset.art];if(!art)return false;
  let g,k,ox,oy=0,bw,bh;
  if(cv.classList.contains('gthumb')){
    // index icons: one cell per pixel, scaled down by CSS
    if(cv.width!==GA_W)cv.width=GA_W;if(cv.height!==GA_H)cv.height=GA_H;
    g=cv.getContext('2d');g.setTransform(1,0,0,1,0,0);g.imageSmoothingEnabled=false;k=1;ox=0;bw=GA_W;bh=GA_H;
  }else{
    const fit=fitPixCanvas(cv,GA_W,GA_H);if(!fit)return false;({g,k,ox,bw,bh}=fit);
  }
  pixBackdrop(g,bw,bh,k,ox,null);
  try{art.draw(gaPainter(g,k,ox,oy),t||0);}catch(e){console.error('guide art',cv.dataset.art,e);return false;}
  return true;
}
// Pictures that move are redrawn at 12 frames a second (an 8-bit pace, and cheap) while the GUIDE tab
// is open, and only for the page in view. Leaving the page or the tab ends the loop by itself. With
// reduced motion requested the first frame stays as a still.
let guideArtRaf=0,guideArtLast=0;
const guideReduceMotion=()=>{try{return matchMedia('(prefers-reduced-motion: reduce)').matches;}catch(e){return false;}};
function guideVisibleArt(){
  if(typeof vizMode==='undefined'||vizMode!=='guide'||!guideCur)return [];
  const pg=document.getElementById('gp-'+guideCur);
  return pg&&!pg.hidden?[...pg.querySelectorAll('canvas.gart')]:[];
}
function guideArtFrame(now){
  guideArtRaf=0;
  const cvs=guideVisibleArt().filter(cv=>(GUIDE_ART[cv.dataset.art]||{}).anim);
  if(!cvs.length)return;
  if(now-guideArtLast>=83){guideArtLast=now;cvs.forEach(cv=>drawGuideArt(cv,now/1000));}
  guideArtRaf=requestAnimationFrame(guideArtFrame);
}
function startGuideArt(){
  guideVisibleArt().forEach(cv=>drawGuideArt(cv,0));
  if(!guideReduceMotion()&&!guideArtRaf)guideArtRaf=requestAnimationFrame(guideArtFrame);
}

// ---- the guide: an index, and one page at a time ----
// The page list is the DOM itself (each <section class="guide-page"> carries its category and
// title), so a page added to the HTML appears in the index and in the prev/next order without
// touching this code.
const GUIDE_CATS={start:'Getting started',basics:'How an engine works',engine:'Designing the engine',
  air:'Breathing & boost',limits:'Knock, heat & wear',car:'The car',track:'The track',score:'Scoring & career',
  more:'Options & reference'};
const guidePages=()=>[...document.querySelectorAll('#guidePanel .guide-page')];
let guideCur=null;
function renderGuideIndex(){
  const idx=document.getElementById('guideIndex');if(!idx)return;
  const groups={};let n=0;
  for(const pg of guidePages()){n++;(groups[pg.dataset.cat]=groups[pg.dataset.cat]||[]).push([n,pg]);}
  // Each entry carries its page's first picture as an icon.
  const thumb=pg=>{const a=pg.querySelector('canvas.gart');return a?'<canvas class="gthumb" data-art="'+a.dataset.art+'"></canvas>':'';};
  idx.innerHTML=Object.entries(groups).map(([c,list])=>'<div><div class="gcat">'+tr(GUIDE_CATS[c]||c)+'</div>'+
    list.map(([k,pg])=>'<button data-gp="'+pg.id.slice(3)+'">'+thumb(pg)+'<span class="n">'+k+'</span><span>'+tr(pg.dataset.title)+'</span></button>').join('')+
    '</div>').join('');
  idx.querySelectorAll('button[data-gp]').forEach(b=>b.addEventListener('click',()=>showGuide(b.dataset.gp)));
  idx.querySelectorAll('canvas.gthumb').forEach(cv=>drawGuideArt(cv,0));
  const q=document.getElementById('guideSearch');filterGuideIndex(q?q.value:'');
}
// Search: every word typed has to appear in the page's title, its tags or its text. Hidden entries stay
// in the index (display:none), so the index always holds one entry per page.
function filterGuideIndex(q){
  const idx=document.getElementById('guideIndex');if(!idx)return;
  const words=String(q||'').toLowerCase().split(/\s+/).filter(Boolean);let shown=0;
  idx.querySelectorAll('button[data-gp]').forEach(b=>{
    const pg=document.getElementById('gp-'+b.dataset.gp);
    const hay=pg?(tr(pg.dataset.title)+' '+pg.dataset.title+' '+(pg.dataset.tags||'')+' '+pg.textContent).toLowerCase():'';
    const ok=words.every(w=>hay.includes(w));b.style.display=ok?'':'none';if(ok)shown++;
  });
  idx.querySelectorAll(':scope>div').forEach(d=>{d.style.display=[...d.querySelectorAll('button[data-gp]')].some(b=>b.style.display!=='none')?'':'none';});
  const none=document.getElementById('guideNoHit');if(none)none.hidden=!(words.length&&!shown);
}
function guideNavHtml(i,list){
  const pg=list[i];
  return '<button data-go="prev"'+(i>0?'':' disabled')+'>◀ '+tr('PREV')+'</button>'+
    '<button data-go="index">☰ '+tr('INDEX')+'</button>'+
    '<button data-go="next"'+(i<list.length-1?'':' disabled')+'>'+tr('NEXT')+' ▶</button>'+
    '<span class="crumb">'+tr(GUIDE_CATS[pg.dataset.cat]||'')+' › '+tr('page')+' '+(i+1)+' '+tr('of')+' '+list.length+'</span>';
}
function showGuide(id){
  const list=guidePages(), i=list.findIndex(p=>p.id==='gp-'+id);
  guideCur=i>=0?id:null;
  list.forEach((p,k)=>p.hidden=(k!==i));
  document.getElementById('guideIndex').hidden=(i>=0);
  const sb=document.getElementById('guideSearchBox');if(sb)sb.hidden=(i>=0);
  if(i>=0){const nh=document.getElementById('guideNoHit');if(nh)nh.hidden=true;}
  for(const nid of ['guideNav','guideNavFoot']){
    const nav=document.getElementById(nid);if(!nav)continue;
    nav.hidden=(i<0);
    if(i<0)continue;
    nav.innerHTML=guideNavHtml(i,list);
    nav.querySelectorAll('button[data-go]').forEach(b=>b.addEventListener('click',()=>{
      const g=b.dataset.go;
      showGuide(g==='index'?null:list[i+(g==='next'?1:-1)].id.slice(3));
    }));
  }
  if(i<0)renderGuideIndex();
  const panel=document.getElementById('guidePanel');if(panel)panel.scrollTop=0;
  try{localStorage.setItem('pes.guidePage',guideCur||'');}catch(e){}
  startGuideArt();
}
function initGuide(){
  // Links between pages: <a data-gp="id"> anywhere in a page, the glossary included.
  const panel=document.getElementById('guidePanel');
  if(panel&&!panel.dataset.linked){panel.dataset.linked='1';
    panel.addEventListener('click',e=>{const a=e.target.closest('a[data-gp]');if(!a)return;e.preventDefault();
      if(document.getElementById('gp-'+a.dataset.gp))showGuide(a.dataset.gp);});
    const q=document.getElementById('guideSearch');if(q)q.addEventListener('input',()=>filterGuideIndex(q.value));
    // the pictures are sized to the panel, so a resize redraws the page in view
    window.addEventListener('resize',()=>{if(vizMode==='guide')startGuideArt();});}
  let saved=null;try{saved=localStorage.getItem('pes.guidePage')||null;}catch(e){}
  showGuide(saved&&document.getElementById('gp-'+saved)?saved:null);
}

