// ====== PARTS DESIGNER 3D-TO-8-BIT PIXEL RENDERER ======
// Uses the Build 433 Pix3D Z-buffered rasterizer (src/js/engine-art-3d.js) to draw
// all 13 part types in real millimetres with quantized cel shading, 2x2 Bayer
// dithering, 1 px silhouette/part-seam outlines, angle presets, drag-to-orbit and
// X-RAY cutaways.

const PART3D_VIEWS=[
  {id:'iso34',label:'3/4',yaw:-38,pitch:20},
  {id:'front',label:'FRONT',yaw:0,pitch:8},
  {id:'side', label:'SIDE',yaw:-88,pitch:8},
  {id:'top',  label:'TOP',yaw:-24,pitch:66}
];

const PART3D_HERO={
  exhaust:    {yaw:-36,pitch:22},
  intake:     {yaw:-56,pitch:22},
  filter:     {yaw:-32,pitch:24},
  cam:        {yaw:-62,pitch:20},
  intercooler:{yaw:-28,pitch:18},
  head:       {yaw:-28,pitch:18},
  turbo:      {yaw:-54,pitch:18},
  wing:       {yaw:-46,pitch:24},
  fwing:      {yaw:-46,pitch:22},
  diff:       {yaw:-28,pitch:18},
  brake:      {yaw:-26,pitch:18},
  tyre:       {yaw:-28,pitch:18},
  susp:       {yaw:-32,pitch:18}
};

function _partBankCyls(e){
  if(!e||e.type==='electric')return 4;
  const n=Math.max(1,Math.round(+e.cylinders||4));
  if(e.type==='rotary')return clamp(n,1,4);
  const lay=e.layout||'inline';
  const per=(lay==='v'||lay==='boxer')?Math.ceil(n/2):n;
  return clamp(per,1,6);
}

function _partPortsZ(n,pitch){
  const pts=[];
  for(let i=0;i<n;i++)pts.push((i-(n-1)*0.5)*pitch);
  return pts;
}

function _drawWing3D(R,p,t,cam,xray,isFront){
  const spanMm=clamp(+p.span_mm||1500,600,2200),chord=clamp(+p.chord_mm||240,80,600);
  const halfS=spanMm*0.5,ang=clamp(+p.angle_deg||8,0,25)*Math.PI/180,camPct=clamp(+p.camber_pct||5,0,12)/100;
  const plate=clamp(+p.plate_mm||0,0,400),hRoad=isFront?clamp(+p.height_mm||90,30,400):0;
  const span=Math.max(spanMm*1.08,chord*3.4,900);
  R.setCamera(cam.yaw,cam.pitch,Math.min(0.22,228/span),R.w*0.50,R.h*(isFront?0.50:0.56),0,isFront?hRoad*0.25:0,0);

  // Inverted NACA 4-digit cambered airfoil profile in [y, z] (+Z = leading edge)
  const N=12,upper=[],lower=[],thickness=0.12,ca=Math.cos(ang),sa=Math.sin(ang);
  const rotYZ=(y,z)=>[y*ca-z*sa,y*sa+z*ca];
  for(let i=0;i<=N;i++){
    const u=i/N,z0=(0.5-u)*chord;
    const yt=5*thickness*chord*(0.2969*Math.sqrt(u)-0.126*u-0.3516*u*u+0.2843*u*u*u-0.1015*u*u*u*u);
    const yc=-camPct*chord*4*u*(1-u);
    upper.push(rotYZ(yc+yt,z0));
    lower.push(rotYZ(yc-yt,z0));
  }
  const yLift=isFront?hRoad+chord*0.35:40;
  const foil=upper.concat(lower.slice(1,-1).reverse()).map(([y,z])=>[y+yLift,z]);

  if(!xray){
    R.prismX(foil,-halfS,halfS,'#2e3446',10,{spec:22});
    const le=foil[0];
    R.cylinder([-halfS,le[0],le[1]],[halfS,le[0],le[1]],7,7,6,'#5a6482',11,{spec:26});
  }else{
    R.cylinder([-halfS,yLift,chord*0.12],[halfS,yLift,chord*0.12],chord*0.06,chord*0.06,8,'#d4a428',12,{spec:24});
    for(let i=0;i<7;i++){
      const rx=-halfS*0.94+i*(halfS*1.88)/6;
      R.prismX(foil,rx-7,rx+7,'#6c7696',14,{spec:20});
    }
    const phase=(t*1.4)%1,le=foil[0],te=foil[N];
    for(const sx of [-halfS*0.55,0,halfS*0.55]){
      R.tube([[sx,le[0]+15,le[1]+160],[sx,yLift-chord*0.18-camPct*chord*0.9,0],[sx,te[0]+Math.sin(ang)*140,te[1]-180]],7,5,'#38c8ff',35,{smooth:true,glow:true});
      R.box(sx,yLift-chord*0.15,le[1]+140-phase*(chord+300),16,10,26,'#00ff88',36,{glow:true});
    }
  }
  if(plate>0){
    const epL=chord*1.32;
    for(const s of [-1,1])R.box(s*(halfS+8),yLift,-chord*0.04,14,plate,epL,'#cc2c38',s<0?20:21,{spec:20});
  }
  const pyX=Math.min(halfS*0.38,280);
  if(!isFront){
    for(const s of [-1,1]){
      R.box(s*pyX,yLift-125,-chord*0.06,18,220,chord*0.44,'#7a8298',25,{spec:22});
      R.box(s*pyX,yLift-235,-chord*0.06,52,16,chord*0.56,'#4c5266',26);
    }
  }else{
    for(const s of [-1,1])R.box(s*pyX*0.72,yLift+110,-chord*0.05,18,190,chord*0.42,'#7a8298',25,{spec:22});
    R.plinth(halfS*1.08,chord*1.25,0,'#1a1e2e');
  }
}

function buildPart3D(R,kind,p,t,opts){
  opts=opts||{};p=p||{};t=t||0;
  const hero=PART3D_HERO[kind]||PART3D_VIEWS[0];
  const cam=opts.cam?(opts.cam.id==='iso34'?{yaw:hero.yaw,pitch:hero.pitch}:opts.cam):hero;
  const xray=!!opts.cutaway;
  const eng=opts.engine||(typeof engine!=='undefined'?engine:null);

  if(kind==='exhaust'){
    const nC=_partBankCyls(eng),pitch=96,zPorts=_partPortsZ(nC,pitch),flangeL=Math.max(120,nC*pitch+16);
    const primR=clamp(+p.primD_mm||42,25,76)*0.52,sysR=clamp(+p.sysD_mm||60,30,110)*0.52;
    const primL=clamp(+p.primL_mm||520,200,1000),sysL=clamp(+p.sysL_m||2.2,0.8,4.5);
    const pipes=Number(p.pipes)===2?2:1,build=p.build||'tubular',sil=p.silencer||'absorptive';
    const sysVisL=210+sysL*95,primSpan=125+(primL-200)*0.26;
    const span=Math.max(sysVisL+primSpan+110,flangeL*1.35,620);
    R.setCamera(cam.yaw,cam.pitch,Math.min(0.35,248/span),R.w*0.50,R.h*0.55,45,5,0);

    const hc=build==='cast'?'#6a4c3e':build==='equal'?'#e2b678':'#c0844c';
    const pipeCol=build==='equal'?'#c8cedf':'#969cb0',xHead=-sysVisL*0.44;
    R.box(xHead,75,0,14,72,flangeL,'#7c8296',10,{spec:20});
    for(const zp of zPorts)R.cylinder([xHead-9,75,zp],[xHead+2,75,zp],primR*0.92,primR*0.92,8,'#141620',11,{flat:true});
    const xColl=xHead+primSpan,yColl=-42;
    if(build==='cast'){
      const zSpan=Math.max(40,flangeL*0.44);
      R.cylinder([xHead+58,60,-zSpan],[xHead+58,60,zSpan],primR*1.45,primR*1.45,10,hc,20,{spec:10});
      for(const zp of zPorts)R.cylinder([xHead+4,75,zp],[xHead+58,60,zp],primR*1.05,primR*1.05,8,hc,20,{spec:10});
      R.tube([[xHead+58,60,0],[xHead+95,12,0],[xColl,yColl,0]],sysR*0.95,8,hc,21,{smooth:true,heat:true});
    }else{
      const zHalf=Math.max(48,flangeL*0.5);
      for(let i=0;i<nC;i++){
        const zp=zPorts[i],loop=build==='equal'?(1-Math.abs(zp)/zHalf)*(primSpan*0.55):0;
        const pts=build==='equal'
          ?[[xHead+6,75,zp],[xHead+65+loop*0.6,86+loop*0.35,zp*1.04],[xHead+primSpan*0.58+loop*0.4,24+loop*0.2,zp*0.55],[xColl,yColl,zp*0.14]]
          :[[xHead+6,75,zp],[xHead+primSpan*0.45,62,zp*0.9],[xHead+primSpan*0.78,0,zp*0.35],[xColl,yColl,zp*0.12]];
        R.tube(pts,primR,8,hc,20+i,{smooth:true,heat:true,spec:18});
      }
    }
    R.cylinder([xColl-18,yColl,0],[xColl+52,yColl,0],primR*1.65,sysR*1.12,10,shadeHex(hc,0.08),30,{spec:20});
    const zPipes=pipes===2?[-56,56]:[0],xEnd=xColl+sysVisL*0.76,xSil0=xEnd-175,xSil1=xEnd-30;
    for(let pi=0;pi<zPipes.length;pi++){
      const zp=zPipes[pi],idB=40+pi*10;
      if(pipes===2)R.tube([[xColl+44,yColl,0],[xColl+105,yColl,zp*0.75],[xSil0+6,yColl,zp]],sysR,8,pipeCol,idB,{smooth:true,spec:18});
      else R.cylinder([xColl+46,yColl,0],[xSil0+6,yColl,0],sysR,sysR,10,pipeCol,idB,{spec:18});
      if(sil==='chambered'||sil==='baffled'){
        const mw=68+sysR*0.9,mh=42+sysR*0.65;
        if(!xray)R.box((xSil0+xSil1)*0.5,yColl,zp,xSil1-xSil0,mh*2,mw*1.5,'#8a90a6',idB+2,{spec:18});
        else{
          R.box((xSil0+xSil1)*0.5,yColl,zp-mw*0.7,xSil1-xSil0,mh*2,10,'#5a6074',idB+2);
          R.box((xSil0+xSil1)*0.5,yColl-mh,zp,xSil1-xSil0,8,mw*1.4,'#4c5266',idB+2);
          for(const bx of [xSil0+44,xSil0+96])R.box(bx,yColl,zp,8,mh*1.7,mw*1.3,'#c89a48',idB+3,{spec:18});
          R.tube([[xSil0,yColl,zp],[xSil0+108,yColl+18,zp],[xSil0+36,yColl-16,zp],[xSil1+38,yColl,zp]],sysR*0.68,6,'#e87830',idB+4,{smooth:true,glow:true});
        }
      }else if(sil==='absorptive'){
        const mr=sysR*1.95;
        if(!xray)R.cylinder([xSil0,yColl,zp],[xSil1,yColl,zp],mr,mr,12,'#a8b0c6',idB+2,{spec:24});
        else{
          R.cylinder([xSil0,yColl,zp],[xSil1,yColl,zp],mr,mr,12,'#5c6278',idB+2,{arc:Math.PI,rot:Math.PI*0.5,open0:true,open1:true});
          R.cylinder([xSil0+8,yColl,zp],[xSil1-8,yColl,zp],mr*0.84,mr*0.84,10,'#d8b65a',idB+3,{arc:Math.PI,rot:Math.PI*0.5,stripe:'#b8963e'});
          R.cylinder([xSil0-4,yColl,zp],[xSil1+6,yColl,zp],sysR*0.92,sysR*0.92,8,'#f08832',idB+4,{stripe:'#222634',glow:true});
        }
      }else{
        R.cylinder([xSil0,yColl,zp],[xSil1,yColl,zp],sysR,sysR,10,pipeCol,idB+2,{spec:20});
        const pulse=18+Math.sin(t*9)*10;
        R.cylinder([xEnd+6,yColl,zp],[xEnd+6+pulse,yColl,zp],sysR*0.8,3,6,'#ff7722',idB+5,{glow:true});
      }
      R.cylinder([xSil1-4,yColl,zp],[xEnd+10,yColl,zp],sysR*1.15,sysR*1.18,10,'#dce2f0',idB+6,{spec:28,open1:true});
      R.cylinder([xEnd+4,yColl,zp],[xEnd+11,yColl,zp],sysR*0.94,sysR*0.94,10,'#12141e',idB+6,{flat:true});
    }
  }else if(kind==='intake'){
    const nC=_partBankCyls(eng),pitch=96,zPorts=_partPortsZ(nC,pitch),flangeL=Math.max(120,nC*pitch+16),zPl=flangeL*0.46;
    const r=clamp(+p.runnerD_mm||44,20,80)*0.5,L=clamp(+p.runnerL_mm||340,40,800),variable=!!p.variable;
    const shortL=clamp(+p.shortL_mm||150,40,400),itb=!variable&&L<=95;
    const span=Math.max(flangeL*1.15,L*0.95+220,430);
    R.setCamera(cam.yaw,cam.pitch,Math.min(0.36,238/span),R.w*0.50,R.h*0.58,-10,L*0.12,0);

    R.box(-120,-40,0,18,78,flangeL,'#7c8296',10,{spec:20});
    R.cylinder([-85,6,-zPl],[-85,6,zPl],12,12,8,'#cc2c3a',15,{spec:22});
    for(const zp of zPorts)R.cylinder([-105,-24,zp],[-85,2,zp],8,8,6,'#303444',16);
    if(itb){
      for(let i=0;i<nC;i++){
        const zp=zPorts[i],h=Math.max(55,L*1.25);
        R.cylinder([-112,-40,zp],[-112+h*0.65,-40+h*0.65,zp],r,r*1.04,10,'#cfd5e8',20+i,{spec:24});
        R.cylinder([-112+h*0.62,-40+h*0.62,zp],[-112+h*0.92,-40+h*0.92,zp],r*1.04,r*1.48,12,'#eef2ff',28+i,{spec:28,open1:true});
        if(xray){const open=0.35+0.5*Math.sin(t*2.4);R.box(-112+h*0.25,-40+h*0.25,zp,r*1.6,4+open*10,r*1.5,'#d4a428',36,{spec:24});}
      }
    }else{
      const archH=clamp(L*0.36,65,245),archX=clamp(L*0.40,70,270);
      const plX=-112+archX,plY=-20+archH*0.32,plR=clamp(r*1.65,42,72);
      for(let i=0;i<nC;i++){
        const zp=zPorts[i];
        R.tube([[-112,-40,zp],[-112+archX*0.42,-30+archH,zp],[plX,plY+plR*0.3,zp]],r,8,'#b4bacf',20+i,{smooth:true,spec:20});
      }
      if(!xray)R.cylinder([plX,plY,-zPl],[plX,plY,zPl],plR,plR,14,'#9ea4ba',30,{spec:20});
      else{
        R.cylinder([plX,plY,-zPl],[plX,plY,zPl],plR,plR,14,'#565c72',30,{arc:Math.PI,rot:Math.PI*0.5,open0:true,open1:true});
        R.cylinder([plX,plY,zPl*0.88],[plX,plY,-zPl*0.80],plR*0.28,plR*0.16,6,'#38c8ff',33,{glow:true});
      }
      R.cylinder([plX,plY,zPl-2],[plX,plY,zPl+52],plR*0.68,plR*0.68,12,'#cfd5e8',35,{spec:24,open1:true});
      R.cylinder([plX,plY,zPl+40],[plX,plY,zPl+53],plR*0.56,plR*0.56,10,'#141620',35,{flat:true});
      const tbAng=Math.sin(t*2.2)*0.6;
      R.box(plX,plY,zPl+44,plR*1.05,5+Math.abs(tbAng)*26,8,'#d4a428',36,{spec:24});
      if(variable){
        const uShort=clamp(shortL/Math.max(L,120),0.18,0.82);
        const sx=-112+archX*uShort*0.72,sy=-35+archH*(0.45+0.45*uShort);
        if(!xray)R.cylinder([sx,sy,-zPl*0.96],[sx,sy,zPl*0.96],r*1.15,r*1.15,10,'#363c50',40,{spec:16});
        else{
          R.cylinder([sx,sy,-zPl*0.96],[sx,sy,zPl*0.96],r*1.15,r*1.15,10,'#363c50',40,{arc:Math.PI,rot:Math.PI*0.5,open0:true,open1:true});
          const flapOpen=Math.sin(t*2.8)>0;
          for(const zp of zPorts)R.box(sx,sy,zp,flapOpen?r*1.5:6,flapOpen?6:r*1.5,r*1.4,flapOpen?'#00ff88':'#ffcc00',42,{glow:true});
        }
        R.cylinder([sx,sy,zPl*0.96],[sx,sy,zPl+34],r*0.85,r*0.72,10,'#28a0d8',41,{spec:20});
      }
    }
  }else if(kind==='filter'){
    const housing=p.housing||'airbox',media=p.media||'paper';
    const area=clamp(+p.area_m2||0.45,0.02,3),inR=clamp(+p.inletD_mm||72,30,160)*0.5;
    const mCol=media==='cotton'?'#c82b38':media==='nano'?'#8ec0e8':'#deb85c',mStripe=shadeHex(mCol,-0.25);
    if(housing==='none'){
      R.setCamera(cam.yaw,cam.pitch,0.46,R.w*0.50,R.h*0.58,0,10,0);
      R.box(0,-52,0,320,16,110,'#6a7086',10,{spec:18});
      for(let i=0;i<4;i++){
        const x=-114+i*76;
        R.cylinder([x,-44,0],[x,42,0],22,24,12,'#cfd5e8',20+i,{spec:24});
        R.cylinder([x,38,0],[x,66,0],24,38,14,'#eef2ff',24+i,{spec:28,open1:true});
        R.cylinder([x,46,0],[x,65,0],21,21,10,'#141620',24+i,{flat:true});
      }
    }else if(housing==='open'){
      const areaSc=Math.sqrt(clamp(area,0.05,2.5)/0.45);
      const coneL=clamp(120*areaSc,80,260),rBase=clamp(Math.max(inR*1.45,58*areaSc),48,128),rTip=rBase*0.68;
      const span=Math.max(coneL+140,rBase*2.9,300);
      R.setCamera(cam.yaw-26,cam.pitch,Math.min(0.54,232/span),R.w*0.50,R.h*0.54,0,0,0);
      R.cylinder([0,0,-coneL*0.5-58],[0,0,-coneL*0.5],inR,inR*1.06,14,'#242636',10,{spec:12});
      R.cylinder([0,0,-coneL*0.5-38],[0,0,-coneL*0.5-24],inR*1.12,inR*1.12,14,'#cfd5e8',11,{spec:26});
      R.cylinder([0,0,-coneL*0.5-6],[0,0,-coneL*0.5+8],rBase*1.02,rBase*1.02,16,'#262838',12);
      const pleats=Math.round(clamp(14+area*10,14,30));
      if(!xray){
        R.cylinder([0,0,-coneL*0.5+8],[0,0,coneL*0.5],rBase,rTip,pleats,mCol,20,{stripe:mStripe,spec:10});
        R.cylinder([0,0,coneL*0.5],[0,0,coneL*0.5+14],rTip*1.03,rTip*0.94,16,'#cfd5e8',22,{spec:26});
      }else{
        R.cylinder([0,0,-coneL*0.5+8],[0,0,coneL*0.5],rBase,rTip,pleats,mCol,20,{arc:Math.PI,rot:Math.PI*0.5,stripe:mStripe,open0:true,open1:true});
        R.cylinder([0,0,-coneL*0.5],[0,0,-coneL*0.2],inR*0.88,inR*1.25,12,'#cfd5e8',24,{spec:26,open1:true});
        R.cylinder([0,0,coneL*0.5],[0,0,coneL*0.12],rTip*0.72,10,10,'#7c849c',25,{spec:20});
        R.cylinder([0,0,coneL*0.1],[0,0,-coneL*0.5-45],inR*0.35,inR*0.25,8,'#38c8ff',26,{glow:true});
      }
    }else{
      const areaSc=Math.sqrt(clamp(area,0.05,2.5)/0.45);
      const bw=clamp(185*areaSc,130,360),bd=clamp(150*areaSc,110,290),bh=clamp(95+inR*0.75,95,165);
      const span=Math.max(bw+inR*2+160,bd+160,400);
      R.setCamera(cam.yaw,cam.pitch,Math.min(0.46,234/span),R.w*0.50,R.h*0.55,0,0,0);
      R.box(0,-bh*0.25,0,bw,bh*0.5,bd,'#262a3a',10,{spec:10});
      R.cylinder([-bw*0.5-88,-bh*0.22,0],[-bw*0.5+4,-bh*0.22,0],inR*1.12,inR,12,'#2e3244',12,{spec:12,open0:true});
      R.cylinder([-bw*0.5-90,-bh*0.22,0],[-bw*0.5-78,-bh*0.22,0],inR*0.94,inR*0.94,12,'#10121a',12,{flat:true});
      R.cylinder([bw*0.5-4,bh*0.16,0],[bw*0.5+84,bh*0.16,0],inR*0.94,inR*0.94,12,'#3a4054',14,{spec:16});
      R.box(bw*0.5+36,bh*0.16+inR*0.9,0,30,22,26,'#485068',15,{spec:16});
      const nPleats=Math.round(clamp(7+area*10,7,22));
      R.box(0,2,0,bw*0.94,12,bd*0.94,'#1a1c26',20);
      for(let i=0;i<nPleats;i++){
        const px=-bw*0.42+i*(bw*0.84)/Math.max(1,nPleats-1);
        R.box(px,6,0,Math.max(4,bw*0.5/nPleats),26,bd*0.84,i%2?mCol:mStripe,21,{spec:8});
      }
      if(!xray){
        R.box(0,bh*0.28,0,bw*1.02,bh*0.42,bd*1.02,'#32364a',30,{spec:12});
        for(const sx of [-bw*0.34,bw*0.34])R.box(sx,8,bd*0.52,14,24,8,'#c8cedf',31,{spec:24});
      }else{
        R.box(0,bh*0.65,-bd*0.48,bw,6,12,'#4a526e',30);
        R.cylinder([-bw*0.5-60,-bh*0.22,0],[0,-bh*0.18,0],inR*0.32,inR*0.32,6,'#38c8ff',35,{glow:true});
        R.cylinder([0,28,0],[bw*0.5+65,bh*0.16,0],inR*0.32,inR*0.25,6,'#00ff88',36,{glow:true});
      }
    }
  }else if(kind==='cam'){
    const nC=_partBankCyls(eng),pitch=114,shaftL=Math.max(220,nC*pitch+52),z0=-shaftL*0.5,z1=shaftL*0.5;
    const M=2.8,baseR=16.5*M,lift=clamp(+p.lift_mm||10,4,16)*M;
    const dur=clamp(+p.dur||240,180,320),lsa=clamp(+p.lsa||112,98,130),vvt=clamp(+p.vvt_deg||0,0,60);
    const prof=p.profile||'street',spin=t*1.4;
    const span=Math.max(shaftL+120,420);
    R.setCamera(cam.yaw,cam.pitch,Math.min(0.42,226/span),R.w*0.49,R.h*0.54,0,0,18);

    if(!xray)R.cylinder([0,0,z0],[0,0,z1+35],11.5*M,11.5*M,12,'#6c7286',10,{spec:22});
    else{
      R.cylinder([0,0,z0],[0,0,z1+35],11.5*M,11.5*M,12,'#50566a',10,{arc:Math.PI,rot:Math.PI*0.5,open0:true,open1:true});
      R.cylinder([0,0,z0+10],[0,0,z1+30],4.8*M,4.8*M,8,'#f0b830',11,{glow:true});
    }
    for(let i=0;i<=nC;i++){
      const zj=z0+24+i*(shaftL-48)/nC;
      R.cylinder([0,0,zj-13],[0,0,zj+13],15*M,15*M,14,'#cfd5e8',15,{spec:28});
    }
    const camHalf=(dur*0.25)*Math.PI/180,dwellExp=prof==='race'?0.55:prof==='street'?0.85:1.35;
    const makeLobe=phaseRad=>{
      const pts=[],N=24;
      for(let i=0;i<N;i++){
        const a=i*Math.PI*2/N;
        let da=a-phaseRad;while(da>Math.PI)da-=Math.PI*2;while(da<-Math.PI)da+=Math.PI*2;
        let r=baseR;
        if(Math.abs(da)<camHalf){const u=Math.cos((da/camHalf)*Math.PI*0.5);r+=lift*Math.pow(Math.max(0,u),dwellExp);}
        pts.push([Math.cos(a)*r,Math.sin(a)*r]);
      }
      return pts;
    };
    const lsaRad=lsa*Math.PI/180,cylZ=_partPortsZ(nC,pitch);
    for(let i=0;i<nC;i++){
      const zc=cylZ[i],phIn=spin+(i*Math.PI*2/Math.max(1,nC)),phEx=phIn+lsaRad;
      R.prismZ(makeLobe(phIn),zc-30,zc-5,'#9cb6d8',20+i*2,{spec:26});
      R.prismZ(makeLobe(phEx),zc+5,zc+30,'#d8a87c',21+i*2,{spec:26});
    }
    const zGear=z1+36;
    if(vvt>0){
      const drumR=25*M+vvt*0.22;
      R.gearZ(0,0,zGear-14,zGear+14,drumR*1.12,20,spin,'#585e72',40,{spec:22});
      if(!xray){
        R.cylinder([0,0,zGear+12],[0,0,zGear+44],drumR*0.88,drumR*0.85,16,'#d4a428',41,{spec:24});
        R.cylinder([0,0,zGear+42],[0,0,zGear+48],drumR*0.32,drumR*0.32,10,'#cfd5e8',42,{spec:28});
      }else{
        R.cylinder([0,0,zGear+12],[0,0,zGear+42],drumR*0.88,drumR*0.88,16,'#262a3a',41,{open1:true});
        const sweep=(vvt/60)*0.45;
        for(let k=0;k<4;k++){
          const a=spin+k*Math.PI*0.5+Math.sin(t*2.5)*sweep;
          R.cylinder([0,0,zGear+28],[Math.cos(a)*drumR*0.78,Math.sin(a)*drumR*0.78,zGear+28],10,8,6,'#00e090',43,{glow:true});
        }
      }
    }else R.gearZ(0,0,zGear-12,zGear+12,27*M,20,spin,'#b8bed4',40,{spec:24});
    if(xray){
      const zRef=cylZ[cylZ.length-1]+38;
      for(let s=0;s<24;s++){
        const a0=s*Math.PI*2/24,a1=(s+1)*Math.PI*2/24;
        R.cylinder([Math.cos(a0)*(baseR+lift),Math.sin(a0)*(baseR+lift),zRef],[Math.cos(a1)*(baseR+lift),Math.sin(a1)*(baseR+lift),zRef],2.5,2.5,4,'#38c8ff',48,{glow:true});
      }
    }
  }else if(kind==='intercooler'){
    const w=clamp(+p.w||500,150,900),h=clamp(+p.h||220,80,800),d=clamp(+p.d||70,30,120);
    const fpi=clamp(+p.fpi||18,8,30),pipeM=clamp(+p.pipe_m||2,0.3,5);
    if(p.type==='water'){
      const rw=clamp(+p.radW||520,200,900),rh=clamp(+p.radH||260,100,600),rd=clamp(+p.radD||32,16,80);
      const pump=clamp(+p.pump_lpm||20,2,60),span=Math.max(rw+240,w+320,rh+h+220,740);
      R.setCamera(cam.yaw,cam.pitch,Math.min(0.26,224/span),R.w*0.50,R.h*0.56,0,20,0);
      R.box(0,-40,120,rw,rh,rd,'#7a8298',10,{spec:16});
      R.box(-rw*0.5-16,-40,120,32,rh+8,rd+6,'#2c3042',11,{spec:12});
      R.box(rw*0.5+16,-40,120,32,rh+8,rd+6,'#2c3042',12,{spec:12});
      const cy=95;
      if(!xray){
        R.box(0,cy,-120,w,h,d,'#bcc2d6',20,{spec:22});
        R.cylinder([-w*0.5-52,cy,-120],[-w*0.5,cy,-120],34,42,10,'#cfd5e8',21,{spec:24});
        R.cylinder([w*0.5,cy,-120],[w*0.5+52,cy,-120],42,34,10,'#cfd5e8',22,{spec:24});
      }else{
        R.box(0,cy,-120-d*0.35,w,h,d*0.25,'#5a6074',20);
        R.box(0,cy,-120,w*0.9,h*0.8,d*0.55,'#269ce0',23,{glow:true});
        for(let k=-2;k<=2;k++)R.box(0,cy+k*(h*0.16),-120+6,w*0.96,10,d*0.45,'#e87830',24,{glow:true});
      }
      const pR=26+pump*0.42;
      R.cylinder([rw*0.32,-rh*0.38,12],[rw*0.32,-rh*0.38,74],pR,pR,12,'#348a98',30,{spec:20});
      R.tube([[rw*0.5,-40-rh*0.3,118],[rw*0.35,-rh*0.38,42],[w*0.35,cy-h*0.45,-120]],13,6,'#28b8e8',35,{smooth:true,spec:16});
      R.tube([[-w*0.35,cy+h*0.42,-120],[-rw*0.42,40,0],[-rw*0.5,-40+rh*0.3,118]],13,6,'#207898',36,{smooth:true,spec:16});
    }else{
      const tankW=72,pipeReach=70+pipeM*36,span=Math.max(w+tankW*2+pipeReach*0.9,h*1.9+140,620);
      R.setCamera(cam.yaw,cam.pitch,Math.min(0.28,226/span),R.w*0.50,R.h*0.56,0,0,0);
      if(!xray){
        R.box(0,0,0,w,h,d,'#8e96ac',10,{spec:18});
        const rows=Math.round(clamp(h/28,4,16));
        for(let i=0;i<rows;i++){
          const ry=-h*0.44+i*(h*0.88)/Math.max(1,rows-1);
          R.box(0,ry,0,w-4,Math.max(4,h/(rows*2.8)),d+4,'#cfd5e8',11,{spec:24});
        }
        const cols=Math.round(clamp((w/100)*(fpi/12),5,22));
        for(let i=0;i<cols;i++){
          const rx=-w*0.45+i*(w*0.90)/Math.max(1,cols-1);
          R.box(rx,0,d*0.5+1,3,h*0.92,3,'#585e72',12,{flat:true});
        }
      }else{
        R.box(0,0,-d*0.35,w,h,d*0.28,'#545a6e',10);
        const rows=Math.round(clamp(h/34,4,12)),grad=['#ef5b25','#ea7b2e','#d69d40','#8cb878','#44b8cc','#2a9cf0'];
        for(let r=0;r<rows;r++){
          const ry=-h*0.42+r*(h*0.84)/Math.max(1,rows-1);
          for(let s=0;s<6;s++){
            const sw=(w*0.96)/6,x0=-w*0.48+s*sw;
            R.box(x0+sw*0.5,ry,2,sw+1,Math.max(7,h/(rows*2.1)),d*0.52,grad[s],14,{glow:true});
          }
        }
      }
      for(const s of [-1,1]){
        const x0=s*w*0.5,x1=s*(w*0.5+tankW),py=-h*0.12;
        R.prismZ([[x0,-h*0.5],[x1,-h*0.36],[x1,h*0.36],[x0,h*0.5]],-d*0.52,d*0.52,'#bcc2d6',s<0?20:21,{spec:22});
        R.tube([[x1,py,0],[x1+s*pipeReach*0.55,py,-pipeReach*0.25],[x1+s*pipeReach*0.55,py+75,-pipeReach*0.55]],30,8,'#cfd5e8',s<0?30:31,{smooth:true,couplers:true,spec:24});
      }
      for(const sx of [-w*0.34,w*0.34])R.box(sx,h*0.5+16,0,28,32,14,'#70768a',25,{spec:18});
    }
  }else if(kind==='head'){
    const M=2.2,inR=clamp(+p.valveD_mm||34,15,75)*0.5*M,exR=clamp(+p.exValveD_mm||28,12,65)*0.5*M;
    const throat=clamp(+p.throat||0.85,0.75,0.92),seatN=clamp(+p.seat_N||300,100,1500),rateN=clamp(+p.rate_Nmm||40,10,200);
    const boreR=Math.max(inR+exR+14,92),span=Math.max(boreR*3.8,440);
    R.setCamera(cam.yaw,cam.pitch,Math.min(0.42,212/span),R.w*0.50,R.h*0.62,0,58,0);

    const hw=boreR*1.45,hh=138,hd=boreR*1.25;
    if(!xray){
      R.box(0,8,0,hw*2.06,18,hd*1.78,'#8c94aa',9,{spec:20});
      R.box(0,hh*0.5+8,0,hw*1.98,hh,hd*1.66,'#a8b0c6',10,{spec:18});
      for(const ry of [44,78,112])R.box(0,ry,0,hw*2.04,7,hd*1.74,'#bcc4d8',11,{spec:22});
      for(const sx of [-hw*0.82,hw*0.82])for(const sz of [-hd*0.68,hd*0.68])R.cylinder([sx,14,sz],[sx,hh+24,sz],16,16,8,'#7c849a',12,{spec:20});
      R.cylinder([-hw-6,hh*0.58,0],[-hw+8,hh*0.58,0],inR*throat*1.15,inR*throat*1.15,12,'#8690a8',13,{spec:20});
      R.cylinder([-hw-8,hh*0.58,0],[-hw+4,hh*0.58,0],inR*throat*0.92,inR*throat*0.92,12,'#141824',13,{flat:true});
      R.cylinder([hw-8,hh*0.58,0],[hw+6,hh*0.58,0],exR*throat*1.15,exR*throat*1.15,12,'#8c7066',14,{spec:20});
      R.cylinder([hw-4,hh*0.58,0],[hw+8,hh*0.58,0],exR*throat*0.92,exR*throat*0.92,12,'#1c1414',14,{flat:true});
    }else{
      R.box(0,hh*0.5+4,-hd*0.45,hw*2,hh,hd*0.78,'#7e869c',10,{spec:14});
      R.tube([[-hw-16,hh*0.64,0],[-boreR*0.52,hh*0.50,0],[-boreR*0.44,18,0]],inR*throat*0.85,8,'#3098d8',13,{smooth:true,glow:true});
      R.tube([[boreR*0.44,18,0],[boreR*0.52,hh*0.50,0],[hw+16,hh*0.64,0]],exR*throat*0.85,8,'#e86828',14,{smooth:true,glow:true});
    }
    R.cylinder([0,32,0],[0,hh+62,0],12,12,8,'#eef2ff',18,{spec:24});
    R.cylinder([0,hh+16,0],[0,hh+38,0],17,17,6,'#969cb4',19,{spec:24});
    const inLift=Math.max(0,Math.sin(t*3.0))*26,exLift=Math.max(0,Math.sin(t*3.0+Math.PI))*24;
    const wireR=clamp(3.2+(rateN/200)*5.2,3.2,8.8),turns=clamp(4+(seatN/1500)*3.5,4,7.5);
    const drawValve=(side,vR,lift,col,idB)=>{
      const ang=side*0.24,cx=side*boreR*0.44,cy=6,dx=Math.sin(ang),dy=Math.cos(ang),hX=cx-dx*lift,hY=cy-dy*lift;
      R.cylinder([cx-dx*2,cy-dy*2,0],[cx+dx*10,cy+dy*10,0],vR*1.04,vR*throat,14,'#c89b44',idB,{spec:22});
      R.cylinder([hX-dx*8,hY-dy*8,0],[hX+dx*6,hY+dy*6,0],vR,vR*0.85,14,col,idB+1,{spec:28});
      R.cylinder([hX+dx*4,hY+dy*4,0],[hX+dx*204,hY+dy*204,0],7,7,8,'#dce2f0',idB+2,{spec:28});
      R.cylinder([cx+dx*56,cy+dy*56,0],[cx+dx*124,cy+dy*124,0],13,13,8,'#c8903c',idB+3,{spec:20});
      const sTopX=hX+dx*196,sTopY=hY+dy*196,sBotX=cx+dx*122,sBotY=cy+dy*122;
      R.cylinder([sTopX-dx*6,sTopY-dy*6,0],[sTopX+dx*8,sTopY+dy*8,0],vR*0.72,vR*0.66,12,'#4a526a',idB+4,{spec:24});
      const coilR=clamp(vR*0.62,22,44),steps=Math.round(turns*9),pts=[],px=Math.cos(ang),py=-Math.sin(ang);
      for(let i=0;i<=steps;i++){
        const u=i/steps,a=u*turns*Math.PI*2,bx=sBotX+(sTopX-sBotX)*u,by=sBotY+(sTopY-sBotY)*u;
        pts.push([bx+Math.cos(a)*coilR*px,by+Math.cos(a)*coilR*py,Math.sin(a)*coilR]);
      }
      R.tube(pts,wireR,5,rateN>80?'#e04040':'#42a4e8',idB+5,{spec:22});
    };
    drawValve(-1,inR,inLift,'#d8e4f6',20);
    drawValve(1,exR,exLift,'#e6b892',30);
  }else if(kind==='turbo'){
    const rC=clamp(+p.compD_mm||64,30,120)*1.15,rT=clamp(+p.turbD_mm||56,25,130)*1.10;
    const arSc=clamp(0.68+clamp(+p.ar||0.68,0.25,1.6)*0.52,0.78,1.55);
    const zTurb=-82,zComp=82,span=Math.max((rC+rT)*1.95,320),spin=t*5.2;
    R.setCamera(cam.yaw,cam.pitch,Math.min(0.62,236/span),R.w*0.50,R.h*0.56,0,8,0);

    const drawVol=(zc,R0,tr0,col,id,cut)=>{
      const nR=16,nT=7,rings=[],maxI=cut?11:nR;
      for(let i=0;i<=maxI;i++){
        const a=(cut?Math.PI*0.35:0)+i*Math.PI*2/nR,grow=0.65+0.50*(i/nR),rad=R0*(0.68+0.22*(i/nR)),tr=tr0*grow;
        const ca=Math.cos(a),sa=Math.sin(a),ring=[];
        for(let j=0;j<nT;j++){const b=j*Math.PI*2/nT,rr=rad+tr*Math.cos(b);ring.push([ca*rr,sa*rr,zc+Math.sin(b)*tr]);}
        rings.push(ring);
      }
      for(let i=0;i<rings.length-1;i++)for(let j=0;j<nT;j++){const nj=(j+1)%nT;R.quad(rings[i][j],rings[i][nj],rings[i+1][nj],rings[i+1][j],col,id,{spec:22});}
    };
    drawVol(zTurb,rT,rT*0.34*arSc,'#8a4428',10,xray);
    R.box(0,-rT*1.08,zTurb,rT*0.72,22,rT*0.66,'#703820',11,{spec:12});
    R.cylinder([0,0,zTurb-28],[0,0,zTurb+18],rT*0.54,rT*0.66,12,'#e85e1c',12,{glow:true});
    for(let k=0;k<9;k++){const a=spin+k*Math.PI*2/9;R.cylinder([0,0,zTurb],[Math.cos(a)*rT*0.64,Math.sin(a)*rT*0.64,zTurb-14],5,3,4,'#ffaa44',13,{glow:true});}
    if(!xray)R.cylinder([0,0,zTurb+20],[0,0,zComp-22],38,38,12,'#4a5064',20,{spec:16});
    else{
      R.cylinder([0,0,zTurb+20],[0,0,zComp-22],38,38,12,'#3a4054',20,{arc:Math.PI,rot:Math.PI*0.5,open0:true,open1:true});
      R.cylinder([0,0,zTurb-18],[0,0,zComp+28],11,11,10,'#eef2ff',21,{spec:28});
      R.cylinder([0,0,-28],[0,0,28],19,19,10,'#d4a428',22,{spec:24});
    }
    R.cylinder([0,34,0],[0,68,0],12,12,8,'#d4a428',23,{spec:24});
    R.cylinder([0,-34,0],[0,-68,0],15,15,8,'#7a8096',24);
    drawVol(zComp,rC,rC*0.36,'#c2c8dc',30,xray);
    const zIn=zComp+rC*0.44;
    if(!xray){
      R.cylinder([0,0,zComp+8],[0,0,zIn],rC*0.60,rC*0.62,14,'#cfd5e8',31,{spec:26,open1:true});
      R.cylinder([0,0,zComp+10],[0,0,zIn-2],rC*0.49,rC*0.49,12,'#141620',31,{flat:true});
    }
    R.cylinder([-rC*0.62,rC*0.45,zComp],[-rC*0.62,rC*1.15,zComp],rC*0.28,rC*0.28,10,'#c8cedf',32,{spec:24});
    for(let k=0;k<8;k++){const a=spin+k*Math.PI*0.25;R.cylinder([0,0,zComp+6],[Math.cos(a)*rC*0.56,Math.sin(a)*rC*0.56,zComp+22],5.5,3,4,k%2?'#eef2ff':'#8ec4f8',34,{spec:28});}
    R.cylinder([0,0,zComp+12],[0,0,zIn-4],rC*0.14,rC*0.06,8,'#eef2ff',35,{spec:28});
    R.cylinder([rC*0.72,rC*0.78,zComp-22],[rC*0.72,rC*0.78,zComp+32],22,22,10,'#c99b44',36,{spec:22});
    R.cylinder([rC*0.72,rC*0.78,zComp-22],[rT*0.55,rT*0.55,zTurb+8],4,4,6,'#cfd5e8',37);
  }else if(kind==='wing'||kind==='fwing'){
    _drawWing3D(R,p,t,cam,xray,kind==='fwing');
  }else if(kind==='diff'){
    const M=2.4,plateR=clamp(+p.rFace_mm||46,25,70)*M,rampR=clamp(+p.rRamp_mm||34,20,60)*M;
    const faces=Math.round(clamp(+p.faces||4,1,10)),rampDeg=clamp(+p.ramp_deg||45,25,90),preload=clamp(+p.preload_Nm||60,0,400);
    const packW=clamp(24+faces*9,34,115),caseR=Math.max(plateR*1.24,118),ringR=caseR*1.38;
    const span=Math.max(ringR*3.1,packW*2+280,480),spin=t*1.4;
    R.setCamera(cam.yaw,cam.pitch,Math.min(0.32,188/span),R.w*0.50,R.h*0.52,0,0,0);

    R.cylinder([-packW-130,0,0],[packW+130,0,0],24,24,10,'#8e96ac',10,{rot:spin,spec:22});
    R.cylinder([-packW-18,0,0],[-packW+6,0,0],ringR,ringR,20,'#62687e',14,{rot:spin,spec:20});
    for(let k=0;k<22;k++){const a=spin+k*Math.PI*2/22;R.cylinder([-packW-14,Math.cos(a)*ringR*0.90,Math.sin(a)*ringR*0.90],[-packW-14,Math.cos(a)*ringR*1.07,Math.sin(a)*ringR*1.07],9,6,4,'#969eb6',15,{spec:22});}
    if(!xray){
      R.cylinder([-packW-8,0,0],[packW+8,0,0],caseR,caseR,16,'#50566a',20,{rot:spin,spec:16});
      for(let k=0;k<4;k++){const a=spin+k*Math.PI*0.5;R.box(0,Math.cos(a)*caseR*0.98,Math.sin(a)*caseR*0.98,42,28,28,'#181a24',21,{flat:true});}
    }else{
      R.cylinder([-packW-8,0,0],[packW+8,0,0],caseR,caseR,16,'#40465a',20,{arc:Math.PI,rot:Math.PI*0.5,open0:true,open1:true});
      R.cylinder([0,-rampR*1.15,0],[0,rampR*1.15,0],11,11,8,'#eef2ff',30,{spec:28});
      for(const sy of [-rampR*0.72,rampR*0.72])R.cylinder([0,sy-14,0],[0,sy+14,0],22,16,10,'#d4a428',31,{spec:24});
      const wedge=clamp(Math.cos(rampDeg*Math.PI/180)*32,4,30);
      for(const s of [-1,1]){
        R.cylinder([s*16,0,0],[s*(32+wedge*0.4),0,0],rampR*1.15,rampR*1.25,14,'#e07a32',32,{spec:24});
        R.box(s*18,rampR,14,14+wedge,10,10,'#ffcc00',33,{glow:true});
        const xStart=s*38,step=(packW-42)/Math.max(1,faces);
        for(let f=0;f<faces;f++){const xf=xStart+s*f*step;R.cylinder([xf,0,0],[xf+s*Math.max(4,step*0.65),0,0],plateR,plateR,14,f%2?'#c88838':'#b8c0d8',35+f,{spec:22});}
        if(preload>0){const preW=4+(preload/400)*14;R.cylinder([s*(packW-preW),0,0],[s*packW,0,0],plateR*1.05,plateR*0.92,14,'#34b8e8',48,{glow:true});}
      }
    }
  }else if(kind==='brake'){
    const rRotor=clamp(+p.rearRotor_mm||300,200,450)*0.5,barPct=clamp(+p.bar_pct||58,30,70);
    const rF=clamp(+p.mcF_mm||19,14,28)*1.5,rR=clamp(+p.mcR_mm||19,14,28)*1.5;
    const nP=Math.round(clamp(+p.rearPistons||1,1,3)),pR=clamp(+p.rearPistonD_mm||38,25,60)*0.52;
    const span=Math.max(rRotor*2.4+340,660),spin=t*1.1;
    R.setCamera(cam.yaw,cam.pitch,Math.min(0.32,224/span),R.w*0.50,R.h*0.54,0,0,0);

    const bx=-195;
    R.box(bx,0,-58,175,105,18,'#464c60',10,{spec:14});
    const drawMC=(mx,rad,col,id)=>{
      if(!xray){R.cylinder([mx,0,-52],[mx,0,88],rad,rad*0.92,12,'#969eb4',id,{spec:22});R.cylinder([mx,0,84],[mx,0,102],rad*0.96,rad*0.85,12,col,id+1,{spec:24});}
      else{R.cylinder([mx,0,-52],[mx,0,88],rad,rad,12,'#5a6076',id,{arc:Math.PI,rot:Math.PI*0.5,open0:true,open1:true});R.cylinder([mx,0,-32],[mx,0,84],rad*0.72,rad*0.72,10,col,id+1,{glow:true});}
      R.cylinder([mx,0,-118],[mx,0,-48],7,7,6,'#dce2f0',id+2,{spec:26});
    };
    drawMC(bx-52,rF,'#28b8f0',12);drawMC(bx+52,rR,'#f09828',16);
    R.cylinder([bx-74,0,-118],[bx+74,0,-118],9,9,8,'#c8cedf',20,{spec:24,stripe:'#7a8096'});
    const barOff=((50-barPct)/20)*38;
    R.box(bx+barOff,0,-118,22,34,26,'#e04048',21,{spec:24});
    R.box(bx+barOff,-56,-118,16,86,18,'#383e52',22,{spec:14});

    const rx=128;
    if(!xray)R.cylinder([rx,0,-16],[rx,0,16],rRotor,rRotor,24,'#b8c0d4',30,{rot:spin,spec:24,stripe:'#9ea6bc'});
    else{
      R.cylinder([rx,0,-16],[rx,0,-4],rRotor,rRotor,24,'#7a8298',30,{rot:spin,spec:18});
      for(let k=0;k<16;k++){const a=spin+k*Math.PI*2/16;R.cylinder([rx+Math.cos(a)*rRotor*0.56,Math.sin(a)*rRotor*0.56,2],[rx+Math.cos(a)*rRotor*0.94,Math.sin(a)*rRotor*0.94,2],5,5,4,'#f07828',31,{glow:true});}
    }
    R.cylinder([rx,0,-20],[rx,0,26],rRotor*0.44,rRotor*0.40,14,'#363c4e',32,{rot:spin,spec:18});
    for(let k=0;k<5;k++){const a=spin+k*Math.PI*2/5;R.cylinder([rx+Math.cos(a)*rRotor*0.28,Math.sin(a)*rRotor*0.28,22],[rx+Math.cos(a)*rRotor*0.28,Math.sin(a)*rRotor*0.28,34],7,7,6,'#eef2ff',33,{spec:28});}
    const calArc=clamp(0.45+nP*0.28,0.65,1.35),calRIn=rRotor*0.68,calROut=rRotor*1.10,pts=[];
    for(let i=0;i<=6;i++){const a=-calArc*0.5+i*calArc/6;pts.push([rx+Math.cos(a)*calROut,Math.sin(a)*calROut]);}
    for(let i=6;i>=0;i--){const a=-calArc*0.5+i*calArc/6;pts.push([rx+Math.cos(a)*calRIn,Math.sin(a)*calRIn]);}
    if(!xray)R.prismZ(pts,-44,44,'#cc2c38',40,{spec:24});
    else{
      R.prismZ(pts,-44,-18,'#8a222c',40,{spec:16});R.prismZ(pts,14,24,'#d4a428',41,{spec:16});
      for(let i=0;i<nP;i++){
        const a=nP===1?0:(-calArc*0.34+i*(calArc*0.68)/(nP-1)),px=rx+Math.cos(a)*(rRotor*0.84),py=Math.sin(a)*(rRotor*0.84);
        R.cylinder([px,py,20],[px,py,48],pR,pR,12,'#e2e8f6',44+i,{spec:28});
        R.cylinder([px,py,36],[px,py,50],pR*0.72,pR*0.72,10,'#ff8828',48,{glow:true});
      }
    }
  }else if(kind==='tyre'){
    const fK=clamp(+p.front_kPa||230,80,350),rK=clamp(+p.rear_kPa||230,80,350);
    R.setCamera(cam.yaw,cam.pitch,0.31,R.w*0.50,R.h*0.53,0,-10,0);
    R.plinth(310,165,-145,'#1d202e');
    const drawTyre=(cx,kPa,idB)=>{
      const uP=clamp((kPa-80)/270,0,1),squish=(1-uP)*28,bulge=(1-uP)*24;
      const rRim=96,rOut=150,wHalf=72,cy=-145+rOut-squish;
      const pCol=kPa<140?'#e85a38':kPa>290?'#38b8ff':'#30d080',segs=20,arcMax=xray?14:segs;
      const outerPts=zSign=>{
        const arr=[];
        for(let i=0;i<=arcMax;i++){
          const a=(xray?Math.PI*0.45:0)+i*Math.PI*2/segs;
          let tx=Math.cos(a)*rOut,ty=cy+Math.sin(a)*rOut,tw=wHalf;
          if(ty<-144){const pen=-144-ty;ty=-144;tw+=bulge*clamp(pen/22,0,1);}
          else if(Math.sin(a)<-0.3)tw+=bulge*0.45*(-Math.sin(a)-0.3);
          arr.push([cx+tx,ty,zSign*tw]);
        }
        return arr;
      };
      const ringF=outerPts(1),ringB=outerPts(-1);
      for(let i=0;i<arcMax;i++){
        R.quad(ringF[i],ringF[i+1],ringB[i+1],ringB[i],(i%2===0)?'#262834':'#323646',idB,{spec:8});
        const a0=(xray?Math.PI*0.45:0)+i*Math.PI*2/segs,a1=(xray?Math.PI*0.45:0)+(i+1)*Math.PI*2/segs;
        R.quad([cx+Math.cos(a0)*rRim,cy+Math.sin(a0)*rRim,wHalf*0.88],[cx+Math.cos(a1)*rRim,cy+Math.sin(a1)*rRim,wHalf*0.88],ringF[i+1],ringF[i],'#2c303e',idB+1,{spec:10});
        R.quad([cx+Math.cos(a1)*rRim,cy+Math.sin(a1)*rRim,-wHalf*0.88],[cx+Math.cos(a0)*rRim,cy+Math.sin(a0)*rRim,-wHalf*0.88],ringB[i],ringB[i+1],'#242836',idB+1,{spec:8});
      }
      R.cylinder([cx,cy,-wHalf*0.85],[cx,cy,wHalf*0.85],rRim,rRim,16,'#9ca4bc',idB+2,{spec:24,open1:true});
      R.cylinder([cx,cy,-wHalf*0.4],[cx,cy,wHalf*0.45],rRim*0.34,rRim*0.30,10,'#cfd5e8',idB+3,{spec:26});
      for(let s=0;s<6;s++){const a=t*0.6+s*Math.PI/3;R.cylinder([cx,cy,wHalf*0.42],[cx+Math.cos(a)*rRim*0.92,cy+Math.sin(a)*rRim*0.92,wHalf*0.64],10,8,5,'#dce2f0',idB+3,{spec:26});}
      R.cylinder([cx,cy,wHalf*0.46],[cx,cy,wHalf*0.56],20,20,10,pCol,idB+4,{glow:true});
      R.box(cx,-142,0,clamp(65+squish*5.2,55,195),3,(wHalf+bulge*0.6)*1.9,pCol,idB+5,{glow:true});
      if(xray)R.cylinder([cx,cy,-wHalf*0.5],[cx,cy,wHalf*0.5],rRim*1.28,rRim*1.28,12,pCol,idB+6,{arc:Math.PI*1.1,rot:-Math.PI*0.5,glow:true,open0:true,open1:true});
    };
    drawTyre(-158,fK,10);drawTyre(158,rK,20);
  }else if(kind==='susp'){
    const ax=opts.axle==='R'?'R':'F';
    const wireR=clamp(+p['wireD'+ax+'_mm']||12,5,25)*0.5,coilR=clamp(+p['coilD'+ax+'_mm']||110,40,250)*0.5;
    const coils=clamp(+p['coils'+ax]||7,2,20),barD=clamp(+p['barD'+ax+'_mm']||0,0,45);
    const barArm=clamp(+p['barArm'+ax+'_mm']||180,80,400),barL=clamp(+p['barL'+ax+'_mm']||980,300,1600);
    const damp=clamp(+p['damp'+ax]||3200,100,30000),rb=clamp(+p['rb'+ax]||2.2,1,5);
    const barSpan=barD>0?barL*0.42:0,span=Math.max(500,coilR*4.6,barSpan+260);
    R.setCamera(cam.yaw,cam.pitch,Math.min(0.32,198/span),R.w*0.50,R.h*0.50,0,-10,0);

    const cyc=(t*0.7)%1,bumpFrac=1/(1+rb*0.6);
    const stroke=cyc<bumpFrac?Math.sin((cyc/bumpFrac)*Math.PI*0.5):Math.cos(((cyc-bumpFrac)/(1-bumpFrac))*Math.PI*0.5);
    const comp=stroke*42,cx=barD>0?-125:0,yBot=-170,yTop=165-comp,dampR=clamp(24+(damp/20000)*14,24,38);
    R.cylinder([cx,yBot-16,-20],[cx,yBot-16,20],20,20,10,'#5a6076',10,{spec:20});
    const yBodyTop=yBot+195;
    if(!xray)R.cylinder([cx,yBot,0],[cx,yBodyTop,0],dampR,dampR,14,'#c89b38',12,{spec:24,stripe:'#a67e28'});
    else{
      R.cylinder([cx,yBot,0],[cx,yBodyTop,0],dampR,dampR,14,'#7a6228',12,{arc:Math.PI,rot:Math.PI*0.5,open0:true,open1:true});
      R.cylinder([cx,yBot+8,0],[cx,yBot+54,0],dampR*0.78,dampR*0.78,10,'#38b8ff',13,{glow:true});
      R.cylinder([cx,yBot+54,0],[cx,yBot+64,0],dampR*0.84,dampR*0.84,10,'#eef2ff',14);
      R.cylinder([cx,yBot+66,0],[cx,yBodyTop-6,0],dampR*0.74,dampR*0.74,10,'#d88228',15);
      const py=yBot+135-comp;
      R.cylinder([cx,py-10,0],[cx,py+10,0],dampR*0.88,dampR*0.88,10,'#ff4048',16,{glow:true});
    }
    R.cylinder([cx,yBodyTop-55-comp,0],[cx,yTop+12,0],11,11,10,'#eef2ff',18,{spec:28});
    R.cylinder([cx,yTop+4,0],[cx,yTop+20,0],Math.max(coilR*1.15,58),Math.max(coilR*1.15,58),14,'#cc2c38',19,{spec:24});
    const ySpr0=yBot+55,ySpr1=yTop-4;
    R.cylinder([cx,ySpr0-12,0],[cx,ySpr0+4,0],coilR+wireR*1.2,coilR+wireR*1.2,14,'#2868c8',20,{spec:22});
    R.cylinder([cx,ySpr1-4,0],[cx,ySpr1+8,0],coilR+wireR*1.2,coilR+wireR*1.2,14,'#2868c8',21,{spec:22});
    if(!xray)R.helixY(cx,ySpr0+wireR,ySpr1-wireR,0,coilR,wireR,coils,'#f0c428',24,{segsPerTurn:10,spec:22});
    else{
      const steps=Math.max(20,Math.round(coils*12));
      for(let i=0;i<steps;i++){
        const u0=i/steps,u1=(i+1)/steps,a0=u0*coils*Math.PI*2,a1=u1*coils*Math.PI*2;
        if(Math.sin((a0+a1)*0.5)>0.25)continue;
        R.cylinder([cx+Math.cos(a0)*coilR,ySpr0+wireR+(ySpr1-ySpr0-wireR*2)*u0,Math.sin(a0)*coilR],
          [cx+Math.cos(a1)*coilR,ySpr0+wireR+(ySpr1-ySpr0-wireR*2)*u1,Math.sin(a1)*coilR],wireR,wireR,5,'#f0c428',24,{spec:22});
      }
    }
    if(barD>0){
      const bx=110,br=barD*0.65,halfL=clamp(barL*0.16,65,210),armL=clamp(barArm*0.55,55,190),twist=stroke*18;
      R.tube([[bx-25,-55+twist,-halfL],[bx+armL,-55,-halfL],[bx+armL,-55,halfL],[bx-25,-55-twist,halfL]],br,8,'#2888e0',30,{smooth:true,spec:24});
      for(const bz of [-halfL*0.55,halfL*0.55])R.box(bx+armL,-55,bz,br*2.8,br*2.8,30,'#e04838',32,{spec:16});
      for(const [bz,ty] of [[-halfL,twist],[halfL,-twist]])R.cylinder([bx-25,-55+ty,bz],[bx-25,-125+ty,bz],7,7,6,'#cfd5e8',34,{spec:24});
    }
  }
  R.applyOutlines();
}

// ---- live interactive 3D preview on the PARTS tab ----
let partPreviewDirty=true,_partPreviewBound=false,_partViewLang='';
let partPreviewCam={id:'iso34',yaw:-38,pitch:20},partPreviewCutaway=false,partPreviewAxle='F';

function markPartPreviewDirty(){partPreviewDirty=true;}

function _syncPartViewBar(kind){
  const bar=document.getElementById('partViewBar');if(!bar)return;
  const lang=typeof curLang==='string'?curLang:'en';
  if(_partViewLang!==lang){
    _partViewLang=lang;
    bar.querySelectorAll('button[data-partview]').forEach(b=>{
      const v=PART3D_VIEWS.find(x=>x.id===b.dataset.partview);
      if(v)b.textContent=tr(v.label);
    });
    const xb=document.getElementById('partCutawayBtn');if(xb)xb.textContent=tr('X-RAY');
  }
  bar.querySelectorAll('button[data-partview]').forEach(b=>{
    const on=b.dataset.partview===partPreviewCam.id;
    b.classList.toggle('active',on);b.setAttribute('aria-pressed',on?'true':'false');
  });
  const xb=document.getElementById('partCutawayBtn');
  if(xb){xb.classList.toggle('active',partPreviewCutaway);xb.setAttribute('aria-pressed',partPreviewCutaway?'true':'false');}
  const ab=document.getElementById('partAxleBtn');
  if(ab){
    const isSusp=(kind||(typeof partsUI!=='undefined'&&partsUI.kind))==='susp';
    ab.hidden=!isSusp;
    ab.textContent=tr(partPreviewAxle==='R'?'REAR AXLE':'FRONT AXLE');
    ab.classList.toggle('active',partPreviewAxle==='R');
    ab.setAttribute('aria-pressed',partPreviewAxle==='R'?'true':'false');
  }
}

function _bindPartPreviewControls(){
  if(_partPreviewBound)return;
  const cv=document.getElementById('partPreview3d');if(!cv)return;
  _partPreviewBound=true;
  const bar=document.getElementById('partViewBar');
  if(bar){
    bar.addEventListener('click',ev=>{
      const b=ev.target.closest('button');if(!b)return;
      if(b.id==='partCutawayBtn'){partPreviewCutaway=!partPreviewCutaway;partPreviewDirty=true;_syncPartViewBar();renderPartPreview();return;}
      if(b.id==='partAxleBtn'){partPreviewAxle=partPreviewAxle==='F'?'R':'F';partPreviewDirty=true;_syncPartViewBar();renderPartPreview();return;}
      const v=PART3D_VIEWS.find(x=>x.id===b.dataset.partview);
      if(v){partPreviewCam={id:v.id,yaw:v.yaw,pitch:v.pitch};partPreviewDirty=true;_syncPartViewBar();renderPartPreview();}
    });
  }
  let drag=null;
  cv.addEventListener('pointerdown',ev=>{
    const k=typeof partsUI!=='undefined'?partsUI.kind:'exhaust';
    const cur=partPreviewCam.id==='iso34'?(PART3D_HERO[k]||PART3D_VIEWS[0]):partPreviewCam;
    drag={id:ev.pointerId,x:ev.clientX,y:ev.clientY,yaw:cur.yaw,pitch:cur.pitch,moved:false};
  });
  cv.addEventListener('pointermove',ev=>{
    if(!drag||ev.pointerId!==drag.id)return;
    const dx=ev.clientX-drag.x,dy=ev.clientY-drag.y;
    if(!drag.moved&&Math.abs(dx)<6&&Math.abs(dy)<14)return;
    if(!drag.moved){drag.moved=true;try{cv.setPointerCapture(ev.pointerId);}catch{}}
    partPreviewCam={id:'custom',yaw:drag.yaw+dx*0.55,pitch:clamp(drag.pitch+dy*0.38,-22,68)};
    partPreviewDirty=true;_syncPartViewBar();renderPartPreview();
  });
  const end=ev=>{if(drag&&ev.pointerId===drag.id)drag=null;};
  cv.addEventListener('pointerup',end);cv.addEventListener('pointercancel',end);
  const pp=document.getElementById('partsPanel');
  if(pp){const dirty=()=>{partPreviewDirty=true;};pp.addEventListener('input',dirty);pp.addEventListener('change',dirty);}
  _syncPartViewBar();
}

function paintPart3D(cv,kind,p,opts){
  opts=opts||{};
  const gh=opts.caption?ENG_GH+12:ENG_GH;
  const F=fitPixCanvas(cv,ENG_GW,gh);if(!F)return false;
  const {g,k,ox,bw,bh}=F;
  _drawEngBay(g,bw,bh,k,ox,opts.bay||null);
  const R=getEng3D(ENG_GW,ENG_GH);
  buildPart3D(R,kind,p,opts.t||0,{cam:opts.cam,cutaway:opts.cutaway,axle:opts.axle,engine:opts.engine});
  g.drawImage(R.toCanvas(),ox,0,ENG_GW*k,ENG_GH*k);
  if(opts.caption){
    g.fillStyle='#0c0c14';g.fillRect(0,152*k,bw,bh-152*k);
    g.fillStyle='#222436';g.fillRect(0,152*k,bw,k);
    pixCaption(g,k,ox,ENG_GW,ENG_GH,opts.title,opts.sub);
  }
  return true;
}

function syncPartPreview3D(kind){
  partPreviewDirty=true;
  _syncPartViewBar(kind);
  renderPartPreview(kind);
}

function renderPartPreview(kind){
  const cv=document.getElementById('partPreview3d');if(!cv)return;
  const wrap=document.getElementById('partPreviewWrap');if(wrap&&wrap.hidden)return;
  _bindPartPreviewControls();
  kind=kind||(typeof partsUI!=='undefined'?partsUI.kind:'exhaust');
  _syncPartViewBar(kind);
  const p=typeof partFromEditor==='function'?partFromEditor(kind):{};
  const meta=typeof PART_KINDS!=='undefined'?PART_KINDS.find(x=>x.kind===kind):null;
  const baseLabel=meta?tr(meta.label):kind.toUpperCase();
  const title=baseLabel+(kind==='susp'?' ('+tr(partPreviewAxle==='R'?'REAR':'FRONT')+')':'')+(partPreviewCutaway?' [X-RAY]':'');
  const sub=typeof PART_UI!=='undefined'&&PART_UI[kind]&&PART_UI[kind].spec?PART_UI[kind].spec(p):'';
  paintPart3D(cv,kind,p,{t:typeof previewT==='number'?previewT:0,bay:'part:'+kind,cam:partPreviewCam,
    cutaway:partPreviewCutaway,axle:partPreviewAxle,caption:true,title,sub});
  partPreviewDirty=false;
}
