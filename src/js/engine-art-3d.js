// ====== REAL-ENGINE 3D-TO-8-BIT PIXEL RENDERER ======
// Builds the configured combustion engine or electric drive in real millimetres
// (bore, stroke, cylinders, bank angle, rotor radius, motor rotor D x stack)
// inside a single Z-buffered 3D camera, then shades and outlines it on an 8-bit
// pixel grid (280 x 156) with quantized cel bands, 2x2 Bayer dithering and
// 1 px silhouette/part-seam outlines.
//
// World coordinates (mm):
//   X: width across engine (-X = intake / left bank, +X = exhaust / right bank)
//   Y: vertical UP (Y = 0 is the crankshaft / rotor shaft centreline)
//   Z: along the shaft (+Z = FRONT pulleys & timing cover, -Z = REAR flywheel)

const _packHexCache=new Map();
function _rgbPack(r,g,b){
  return (((r<0?0:r>255?255:r|0)<<16)|((g<0?0:g>255?255:g|0)<<8)|(b<0?0:b>255?255:b|0))>>>0;
}
function _hexPack(h){const c=hexRgb(h);return _rgbPack(c[0],c[1],c[2]);}
function _packToHex(v){
  const k=v&0xFFFFFF;
  let s=_packHexCache.get(k);
  if(!s){s='#'+k.toString(16).padStart(6,'0');if(_packHexCache.size<4096)_packHexCache.set(k,s);}
  return s;
}

function Pix3D(w,h){
  this.w=w;this.h=h;
  this.col=new Uint32Array(w*h);
  this.z=new Float32Array(w*h);
  this.id=new Uint16Array(w*h);
  this._cv=null;this._img=null;
  this.clear();
}
Pix3D.prototype={
  clear(){this.col.fill(0);this.z.fill(-1e9);this.id.fill(0);},
  setCamera(yawDeg,pitchDeg,scale,cx,cy,tx,ty,tz){
    const ry=yawDeg*Math.PI/180,rp=pitchDeg*Math.PI/180;
    this.cyaw=Math.cos(ry);this.syaw=Math.sin(ry);
    this.cpit=Math.cos(rp);this.spit=Math.sin(rp);
    this.scale=scale;this.cx=cx;this.cy=cy;
    this.tx=tx||0;this.ty=ty||0;this.tz=tz||0;
    this.fov=2600;
  },
  toCam(x,y,z){
    const dx=x-this.tx,dy=y-this.ty,dz=z-this.tz;
    const x1=dx*this.cyaw+dz*this.syaw;
    const z1=-dx*this.syaw+dz*this.cyaw;
    return [x1,dy*this.cpit-z1*this.spit,dy*this.spit+z1*this.cpit];
  },
  shadeRGB(rgb,nx,ny,nz,specPow,glow){
    const dot1=Math.max(0,nx*-0.38+ny*0.72+nz*0.58);
    const dot2=Math.max(0,nx*0.65+ny*0.15-nz*0.30);
    let spec=0;
    if(specPow>0&&nz>0){
      const hd=Math.max(0,nx*-0.21+ny*0.40+nz*0.89);
      spec=Math.pow(hd,specPow)*0.55;
    }
    const raw=glow?(0.65+dot1*0.45):(0.28+dot1*0.64+dot2*0.12+spec);
    const steps=5,scaled=Math.max(0,Math.min(steps-0.001,raw*(steps-1)));
    const lo=Math.floor(scaled),frac=scaled-lo;
    const bLo=0.30+(lo/(steps-1))*0.88,bHi=0.30+((lo+1)/(steps-1))*0.88;
    const pack=b=>{
      let r=rgb[0]*b,g=rgb[1]*b,bl=rgb[2]*b;
      if(b>1.05){const w=(b-1.05)*140;r+=w;g+=w;bl+=w;}
      return (0xFF000000|_rgbPack(r,g,bl))>>>0;
    };
    return [pack(bLo),pack(bHi),frac];
  },
  tri(p0,p1,p2,baseHex,partId,opts){
    opts=opts||{};
    const c0=this.toCam(p0[0],p0[1],p0[2]),c1=this.toCam(p1[0],p1[1],p1[2]),c2=this.toCam(p2[0],p2[1],p2[2]);
    const ux=c1[0]-c0[0],uy=c1[1]-c0[1],uz=c1[2]-c0[2];
    const vx=c2[0]-c0[0],vy=c2[1]-c0[1],vz=c2[2]-c0[2];
    let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
    const nl=Math.hypot(nx,ny,nz);if(nl<1e-6)return;
    nx/=nl;ny/=nl;nz/=nl;
    if(opts.cull&&nz<=0)return;
    if(nz<0){nx=-nx;ny=-ny;nz=-nz;}
    const f0=this.fov/(this.fov-c0[2]),f1=this.fov/(this.fov-c1[2]),f2=this.fov/(this.fov-c2[2]);
    const x0=this.cx+c0[0]*this.scale*f0,y0=this.cy-c0[1]*this.scale*f0,z0=c0[2];
    const x1=this.cx+c1[0]*this.scale*f1,y1=this.cy-c1[1]*this.scale*f1,z1=c1[2];
    const x2=this.cx+c2[0]*this.scale*f2,y2=this.cy-c2[1]*this.scale*f2,z2=c2[2];
    const area=(x1-x0)*(y2-y0)-(x2-x0)*(y1-y0);
    if(Math.abs(area)<0.05)return;
    const minX=Math.max(0,Math.floor(Math.min(x0,x1,x2))),maxX=Math.min(this.w-1,Math.ceil(Math.max(x0,x1,x2)));
    const minY=Math.max(0,Math.floor(Math.min(y0,y1,y2))),maxY=Math.min(this.h-1,Math.ceil(Math.max(y0,y1,y2)));
    if(minX>maxX||minY>maxY)return;
    const [colLo,colHi,frac]=opts.flat
      ?[(0xFF000000|_hexPack(baseHex))>>>0,(0xFF000000|_hexPack(baseHex))>>>0,0]
      :this.shadeRGB(hexRgb(baseHex),nx,ny,nz,opts.spec||0,opts.glow);
    const invA=1/area,zBias=opts.zBias||0,w=this.w,zbuf=this.z,cbuf=this.col,idbuf=this.id;
    const useDither=frac>0.32&&frac<0.68,solidCol=frac>=0.5?colHi:colLo;
    for(let py=minY;py<=maxY;py++){
      const sy=py+0.5,row=py*w;
      for(let px=minX;px<=maxX;px++){
        const sx=px+0.5;
        const w0=((x1-sx)*(y2-sy)-(x2-sx)*(y1-sy))*invA;if(w0<-1e-4)continue;
        const w1=((x2-sx)*(y0-sy)-(x0-sx)*(y2-sy))*invA;if(w1<-1e-4)continue;
        const w2=1-w0-w1;if(w2<-1e-4)continue;
        const pz=w0*z0+w1*z1+w2*z2+zBias,idx=row+px;
        if(pz>zbuf[idx]){zbuf[idx]=pz;cbuf[idx]=useDither?(((px^py)&1)?colHi:colLo):solidCol;idbuf[idx]=partId;}
      }
    }
  },
  quad(p0,p1,p2,p3,col,id,opts){this.tri(p0,p1,p2,col,id,opts);this.tri(p0,p2,p3,col,id,opts);},
  prismZ(xyPts,z0,z1,col,id,opts){
    opts=opts||{};
    const n=xyPts.length;let cx=0,cy=0,signed=0;
    for(let i=0;i<n;i++){const a=xyPts[i],b=xyPts[(i+1)%n];cx+=a[0];cy+=a[1];signed+=a[0]*b[1]-b[0]*a[1];}
    cx/=n;cy/=n;
    const pts=signed<0?xyPts.slice().reverse():xyPts;
    const zMin=Math.min(z0,z1),zMax=Math.max(z0,z1);
    if(!opts.noCaps){
      for(let i=0;i<n;i++){
        const a=pts[i],b=pts[(i+1)%n];
        this.tri([cx,cy,zMax],[a[0],a[1],zMax],[b[0],b[1],zMax],col,id,opts);
        this.tri([cx,cy,zMin],[b[0],b[1],zMin],[a[0],a[1],zMin],col,id,opts);
      }
    }
    for(let i=0;i<n;i++){
      const a=pts[i],b=pts[(i+1)%n];
      this.quad([a[0],a[1],zMax],[a[0],a[1],zMin],[b[0],b[1],zMin],[b[0],b[1],zMax],col,id,opts);
    }
  },
  box(cx,cy,cz,sx,sy,sz,col,id,opts){
    const hx=sx*0.5,hy=sy*0.5,hz=sz*0.5;
    this.prismZ([[cx-hx,cy-hy],[cx+hx,cy-hy],[cx+hx,cy+hy],[cx-hx,cy+hy]],cz-hz,cz+hz,col,id,opts);
  },
  cylinder(p0,p1,r0,r1,segs,col,id,opts){
    opts=opts||{};
    const dx=p1[0]-p0[0],dy=p1[1]-p0[1],dz=p1[2]-p0[2],len=Math.hypot(dx,dy,dz);
    if(len<1e-4)return;
    const ax=dx/len,ay=dy/len,az=dz/len;
    const ref=Math.abs(ay)<0.9?[0,1,0]:[1,0,0];
    let ux=ay*ref[2]-az*ref[1],uy=az*ref[0]-ax*ref[2],uz=ax*ref[1]-ay*ref[0];
    const ul=Math.hypot(ux,uy,uz)||1;ux/=ul;uy/=ul;uz/=ul;
    const vx=ay*uz-az*uy,vy=az*ux-ax*uz,vz=ax*uy-ay*ux;
    const rot=opts.rot||0,ring0=[],ring1=[];
    for(let i=0;i<segs;i++){
      const a=rot+i*Math.PI*2/segs,ca=Math.cos(a),sa=Math.sin(a);
      const bx=ux*ca+vx*sa,by=uy*ca+vy*sa,bz=uz*ca+vz*sa;
      ring0.push([p0[0]+bx*r0,p0[1]+by*r0,p0[2]+bz*r0]);
      ring1.push([p1[0]+bx*r1,p1[1]+by*r1,p1[2]+bz*r1]);
    }
    for(let i=0;i<segs;i++){
      const j=(i+1)%segs,cSide=opts.stripe&&(i%2===0)?opts.stripe:col;
      this.quad(ring0[i],ring0[j],ring1[j],ring1[i],cSide,id,opts);
      if(!opts.open0&&r0>0.2)this.tri(p0,ring0[j],ring0[i],opts.cap0Col||col,id,opts);
      if(!opts.open1&&r1>0.2)this.tri(p1,ring1[i],ring1[j],opts.cap1Col||col,id,opts);
    }
  },
  pulleyZ(cx,cy,z0,z1,r,rot,col,id,opts){
    opts=opts||{};
    const segs=opts.segs||14,zF=Math.max(z0,z1),zB=Math.min(z0,z1);
    this.cylinder([cx,cy,zB],[cx,cy,zF],r,r,segs,col,id,{rot,spec:16});
    this.cylinder([cx,cy,zF-1],[cx,cy,zF+0.5],r*0.76,r*0.76,segs,shadeHex(col,-0.34),id,{rot});
    const sp=opts.spokes||5;
    for(let k=0;k<sp;k++){
      const a=rot+k*Math.PI*2/sp;
      this.cylinder([cx,cy,zF+1],[cx+Math.cos(a)*r*0.74,cy+Math.sin(a)*r*0.74,zF+1],r*0.10,r*0.08,5,shadeHex(col,0.24),id,{spec:20});
    }
    this.cylinder([cx,cy,zF],[cx,cy,zF+5],r*0.28,r*0.24,8,'#3a3e52',id,{spec:16});
    this.cylinder([cx,cy,zF+4],[cx,cy,zF+8],r*0.14,r*0.14,6,'#d8dee8',id,{spec:24});
    if(opts.teeth){
      const nt=opts.teeth,zm=(zB+zF)*0.5;
      for(let k=0;k<nt;k++){
        const a=rot+k*Math.PI*2/nt;
        this.cylinder([cx+Math.cos(a)*(r-2),cy+Math.sin(a)*(r-2),zm],[cx+Math.cos(a)*(r+3),cy+Math.sin(a)*(r+3),zm],3.5,2.5,4,shadeHex(col,0.16),id);
      }
    }
  },
  beltZ(pulleys,zMid,depth,phase,col,id){
    const z0=zMid-depth*0.5,z1=zMid+depth*0.5,thick=5,pts=[],n=pulleys.length;
    for(let i=0;i<n;i++){
      const p=pulleys[i],prev=pulleys[(i-1+n)%n],next=pulleys[(i+1)%n];
      const a1=Math.atan2(p.y-prev.y,p.x-prev.x)-Math.PI/2,a2=Math.atan2(next.y-p.y,next.x-p.x)-Math.PI/2;
      let da=a2-a1;while(da<0)da+=Math.PI*2;if(da>Math.PI*1.6)da=0.2;
      const steps=Math.max(2,Math.round(da/0.5));
      for(let k=0;k<=steps;k++){const a=a1+da*k/steps;pts.push([p.x+Math.cos(a)*(p.r+1),p.y+Math.sin(a)*(p.r+1),Math.cos(a),Math.sin(a)]);}
    }
    const c1=col||'#202230',c2='#34384c';
    for(let i=0;i<pts.length;i++){
      const a=pts[i],b=pts[(i+1)%pts.length],bc=(Math.floor(i+phase*8)&1)===0?c1:c2;
      this.quad([a[0]+a[2]*thick,a[1]+a[3]*thick,z1],[b[0]+b[2]*thick,b[1]+b[3]*thick,z1],[b[0]+b[2]*thick,b[1]+b[3]*thick,z0],[a[0]+a[2]*thick,a[1]+a[3]*thick,z0],bc,id);
      this.quad([a[0],a[1],z1],[b[0],b[1],z1],[b[0]+b[2]*thick,b[1]+b[3]*thick,z1],[a[0]+a[2]*thick,a[1]+a[3]*thick,z1],c1,id);
      this.quad([b[0],b[1],z0],[a[0],a[1],z0],[a[0]+a[2]*thick,a[1]+a[3]*thick,z0],[b[0]+b[2]*thick,b[1]+b[3]*thick,z0],c1,id);
    }
  },
  tube(pts,r,segs,col,id,opts){
    opts=opts||{};let path=pts;
    if(opts.smooth&&pts.length>=3){
      path=[pts[0]];
      for(let i=1;i<pts.length-1;i++){
        const p0=pts[i-1],p1=pts[i],p2=pts[i+1];
        const a=[p1[0]+(p0[0]-p1[0])*0.34,p1[1]+(p0[1]-p1[1])*0.34,p1[2]+(p0[2]-p1[2])*0.34];
        const b=[p1[0]+(p2[0]-p1[0])*0.34,p1[1]+(p2[1]-p1[1])*0.34,p1[2]+(p2[2]-p1[2])*0.34];
        for(let k=0;k<=3;k++){const u=k/3,mu=1-u;path.push([mu*mu*a[0]+2*mu*u*p1[0]+u*u*b[0],mu*mu*a[1]+2*mu*u*p1[1]+u*u*b[1],mu*mu*a[2]+2*mu*u*p1[2]+u*u*b[2]]);}
      }
      path.push(pts[pts.length-1]);
    }
    const rings=[];let prevU=null;
    for(let i=0;i<path.length;i++){
      const p=path[i],pP=path[Math.max(0,i-1)],pN=path[Math.min(path.length-1,i+1)];
      let tx=pN[0]-pP[0],ty=pN[1]-pP[1],tz=pN[2]-pP[2];
      const tl=Math.hypot(tx,ty,tz)||1;tx/=tl;ty/=tl;tz/=tl;
      let ux,uy,uz;
      if(!prevU){const ref=Math.abs(ty)<0.9?[0,1,0]:[1,0,0];ux=ty*ref[2]-tz*ref[1];uy=tz*ref[0]-tx*ref[2];uz=tx*ref[1]-ty*ref[0];}
      else{const d=prevU[0]*tx+prevU[1]*ty+prevU[2]*tz;ux=prevU[0]-d*tx;uy=prevU[1]-d*ty;uz=prevU[2]-d*tz;}
      const ul=Math.hypot(ux,uy,uz)||1;ux/=ul;uy/=ul;uz/=ul;
      const vx=ty*uz-tz*uy,vy=tz*ux-tx*uz,vz=tx*uy-ty*ux;
      prevU=[ux,uy,uz];
      const ring=[];
      for(let s=0;s<segs;s++){const a=s*Math.PI*2/segs,ca=Math.cos(a),sa=Math.sin(a);ring.push([p[0]+(ux*ca+vx*sa)*r,p[1]+(uy*ca+vy*sa)*r,p[2]+(uz*ca+vz*sa)*r]);}
      rings.push(ring);
    }
    for(let i=0;i<rings.length-1;i++){
      const sc=opts.heat?shadeHex(col,(1-i/Math.max(1,rings.length-1))*0.16):col;
      for(let s=0;s<segs;s++){const ns=(s+1)%segs;this.quad(rings[i][s],rings[i][ns],rings[i+1][ns],rings[i+1][s],sc,id,{spec:opts.spec||14});}
    }
    if(opts.couplers&&pts.length>=3){
      const cc=opts.couplerCol||'#226ee8';
      for(let i=1;i<pts.length-1;i++){
        const p=pts[i],pN=pts[i+1],dx=pN[0]-p[0],dy=pN[1]-p[1],dz=pN[2]-p[2],dl=Math.hypot(dx,dy,dz)||1;
        this.cylinder([p[0]-dx/dl*12,p[1]-dy/dl*12,p[2]-dz/dl*12],[p[0]+dx/dl*12,p[1]+dy/dl*12,p[2]+dz/dl*12],r*1.28,r*1.28,segs,cc,id+1,{spec:18});
      }
    }
  },
  turboZ(cx,cy,cz,sc,rot,idBase,opts){
    opts=opts||{};
    const rComp=68*sc,rTurb=60*sc,zTurb=cz-50*sc,zComp=cz+48*sc;
    const drawVol=(zc,R,tr0,col,id,glow)=>{
      const nR=12,nT=6,rings=[];
      for(let i=0;i<=nR;i++){
        const a=i*Math.PI*2/nR,grow=0.72+0.42*(i/nR),rad=R*(0.62+0.22*(i/nR)),tr=tr0*grow,ca=Math.cos(a),sa=Math.sin(a),ring=[];
        for(let j=0;j<nT;j++){const b=j*Math.PI*2/nT,rr=rad+tr*Math.cos(b);ring.push([cx+ca*rr,cy+sa*rr,zc+Math.sin(b)*tr]);}
        rings.push(ring);
      }
      for(let i=0;i<nR;i++)for(let j=0;j<nT;j++){const nj=(j+1)%nT;this.quad(rings[i][j],rings[i][nj],rings[i+1][nj],rings[i+1][j],col,id,{spec:glow?8:20,glow});}
    };
    drawVol(zTurb,rTurb,25*sc,'#8a4428',idBase,false);
    this.cylinder([cx,cy,zTurb-22*sc],[cx,cy,zTurb+18*sc],rTurb*0.48,rTurb*0.48,10,'#e85e1c',idBase,{glow:true});
    if(opts.vgt)this.cylinder([cx,cy,zTurb-12*sc],[cx,cy,zTurb+14*sc],rTurb*0.76,rTurb*0.76,10,'#d4a638',idBase,{spec:24,open0:true,open1:true});
    this.cylinder([cx,cy,zTurb+16*sc],[cx,cy,zComp-20*sc],26*sc,26*sc,8,'#44485c',idBase+1,{spec:12});
    drawVol(zComp,rComp,28*sc,'#c2c8dc',idBase+2,false);
    const zIn=zComp+28*sc;
    this.cylinder([cx,cy,zComp+4*sc],[cx,cy,zIn],rComp*0.54,rComp*0.56,10,'#cfd5e8',idBase+2,{spec:24,open1:true});
    this.cylinder([cx,cy,zComp+6*sc],[cx,cy,zIn-2],rComp*0.44,rComp*0.44,10,'#141620',idBase+2,{flat:true});
    for(let k=0;k<6;k++){
      const a=rot*2.6+k*Math.PI/3;
      this.cylinder([cx,cy,zComp+16*sc],[cx+Math.cos(a)*rComp*0.41,cy+Math.sin(a)*rComp*0.41,zIn-4],4*sc,2.5*sc,4,k%2?'#eef2ff':'#969cb4',idBase+2,{spec:28});
    }
    this.cylinder([cx,cy,zComp+14*sc],[cx,cy,zIn-1],9*sc,5*sc,8,'#e8ecf8',idBase+2,{spec:28});
    const outPt=[cx-(opts.outDir||1)*rComp*0.55,cy+rComp*0.95,zComp];
    this.cylinder([cx-(opts.outDir||1)*rComp*0.55,cy+rComp*0.35,zComp],outPt,20*sc,20*sc,8,'#c8cedf',idBase+2,{spec:22});
    this.cylinder([cx,cy+rComp*0.85,cz-8*sc],[cx,cy+rComp*0.85,cz+34*sc],17*sc,17*sc,8,'#c99b44',idBase+3,{spec:20});
    if(opts.antilag&&rot>0){
      const fl=24+Math.sin(rot*6)*10;
      this.cylinder([cx,cy,zTurb-24*sc],[cx,cy,zTurb-24*sc-fl],20*sc,4*sc,6,'#ff6618',idBase+3,{glow:true});
    }
    return {inPt:[cx,cy,zIn],outPt,exhInPt:[cx,cy-rTurb*0.55,zTurb],exhOutPt:[cx,cy,zTurb-26*sc]};
  },
  airFilterAt(p0,p1,rBase,rTip,id,filt){
    if(filt==='none')return;
    if(filt==='perf'){
      const mid=[p0[0]+(p1[0]-p0[0])*0.16,p0[1]+(p1[1]-p0[1])*0.16,p0[2]+(p1[2]-p0[2])*0.16];
      const end=[p0[0]+(p1[0]-p0[0])*0.90,p0[1]+(p1[1]-p0[1])*0.90,p0[2]+(p1[2]-p0[2])*0.90];
      this.cylinder(p0,mid,rBase*0.72,rBase*0.76,8,'#222434',id);
      this.cylinder(mid,end,rBase,rTip,10,'#c82b38',id,{stripe:'#e64452'});
      this.cylinder(end,p1,rTip*0.98,rTip*0.88,10,'#cfd5e8',id,{spec:24});
    }else{
      const cx=(p0[0]+p1[0])*0.5,cy=(p0[1]+p1[1])*0.5,cz=(p0[2]+p1[2])*0.5;
      const sz=filt==='restrictive'?56:74;
      this.box(cx,cy,cz,sz,sz*0.85,sz*0.9,'#262838',id,{spec:8});
    }
  },
  applyOutlines(){
    const w=this.w,h=this.h,col=this.col,id=this.id,z=this.z;
    const out=new Uint32Array(col),SIL=0xFF06060B>>>0;
    for(let y=1;y<h-1;y++){
      const row=y*w;
      for(let x=1;x<w-1;x++){
        const k=row+x,c=col[k];
        if(!c){if(col[k-1]||col[k+1]||col[k-w]||col[k+w])out[k]=SIL;}
        else{
          const myId=id[k],myZ=z[k];
          if((col[k-1]&&id[k-1]!==myId&&z[k-1]>myZ+18)||(col[k-w]&&id[k-w]!==myId&&z[k-w]>myZ+18)){
            out[k]=(0xFF000000|_rgbPack(((c>>16)&255)*0.42,((c>>8)&255)*0.42,(c&255)*0.42))>>>0;
          }
        }
      }
    }
    this.col=out;
  },
  // Write quantized hex colours directly into a PixBuf (keeps saves-garage & test64 compatible).
  blitToPixBuf(buf){
    const w=Math.min(this.w,buf.w),h=Math.min(this.h,buf.h),col=this.col,out=buf.c;
    for(let y=0;y<h;y++){
      const sRow=y*this.w,dRow=y*buf.w;
      for(let x=0;x<w;x++){const v=col[sRow+x];if(v)out[dRow+x]=_packToHex(v);}
    }
  },
  toCanvas(){
    if(!this._cv||this._cv.width!==this.w||this._cv.height!==this.h){
      this._cv=document.createElement('canvas');this._cv.width=this.w;this._cv.height=this.h;
      this._img=this._cv.getContext('2d').createImageData(this.w,this.h);
    }
    const d=this._img.data,col=this.col;
    for(let k=0;k<col.length;k++){
      const c=col[k],i=k*4;
      if(!c){d[i+3]=0;continue;}
      d[i]=(c>>16)&255;d[i+1]=(c>>8)&255;d[i+2]=c&255;d[i+3]=255;
    }
    this._cv.getContext('2d').putImageData(this._img,0,0);
    return this._cv;
  }
};

// Shared scratch rasterizer to avoid per-frame typed-array allocation.
let _eng3DScratch=null;
function getEng3D(w,h){
  if(!_eng3DScratch||_eng3DScratch.w!==w||_eng3DScratch.h!==h)_eng3DScratch=new Pix3D(w,h);
  else _eng3DScratch.clear();
  return _eng3DScratch;
}

const ENG3D_VIEWS=[
  {id:'exh34',label:'3/4 EXH',yaw:-38,pitch:18},
  {id:'int34',label:'3/4 INT',yaw:38,pitch:18},
  {id:'front',label:'FRONT',yaw:0,pitch:8},
  {id:'side',label:'SIDE',yaw:-86,pitch:10}
];

function _stand3D(R,halfW,zF,zR,yBot){
  const fy=yBot-26;
  R.box(-halfW,fy,(zF+zR)*0.5,24,20,(zF-zR)+66,'#962832',1);
  R.box(halfW,fy,(zF+zR)*0.5,24,20,(zF-zR)+66,'#962832',1);
  R.box(0,fy,zF+22,halfW*2+22,18,22,'#84222c',1);
  R.box(0,fy,zR-22,halfW*2+22,18,22,'#84222c',1);
  for(const sx of [-1,1])for(const sz of [zF+22,zR-22]){
    R.cylinder([sx*halfW-8,fy-16,sz],[sx*halfW+8,fy-16,sz],15,15,8,'#222432',2);
  }
  for(const sx of [-1,1])for(const sz of [zF-16,zR+16]){
    R.box(sx*halfW,(fy+yBot+36)*0.5,sz,18,(yBot+42-fy),18,'#464a5e',2);
  }
}

function _vtKind(e){
  const s=String(e.valvetrain||'dohc');
  return s.startsWith('ohv')?'ohv':s.startsWith('sohc')?'sohc':'dohc';
}
function _turboScale(e){
  if(+e.compExd_mm>0)return clamp(+e.compExd_mm/64,0.72,1.28);
  return ({small:0.84,medium:1.0,large:1.18})[e.turboSize]||1.0;
}
function _hdrStyle(e){
  const ex=e.exhaust||'stock';
  if(ex==='stock')return {kind:'stock',col:'#62483c'};
  if(ex==='race')return {kind:'race',col:'#e0b476'};
  return {kind:'sport',col:'#bc824a'};   // covers 'sport' and user-designed custom headers
}

// ---- 3D-to-8-bit Electric Drive (PM/induction motor + inverter + HV cables + battery sled) ----
function drawMotor3D(R,e,t,opts){
  opts=opts||{};
  const cam=opts.cam||ENG3D_VIEWS[0],cutaway=!!opts.cutaway;
  const D=clamp(e.evRotorD||150,80,260),Ls=clamp(e.evStack||134,40,250),kwh=clamp(e.evKWh||75,10,200);
  const statorR=D*0.72,L=Ls*1.45+90,zF=L*0.5,zR=-L*0.5;
  const batL=clamp(200+kwh*2.2,240,600),batW=clamp(240+kwh*0.9,260,420),batY=-statorR-74;
  const span=Math.max(batL+140,batW*1.35,(statorR*2+180)*1.5,580);
  const sc=Math.min(0.28,220/span);
  R.setCamera(cam.yaw,cam.pitch,sc,R.w*0.50,R.h*0.56,0,-12,0);

  // Underfloor battery pack tray coloured by cell chemistry
  const cellCol=e.evChem==='lfp'?'#348a68':e.evChem==='lead'?'#5c6070':'#3668a8';
  R.box(0,batY,0,batW,46,batL,'#22303c',10,{spec:10});
  const mods=Math.max(3,Math.min(7,Math.round(batL/80)));
  for(let k=0;k<mods;k++){
    const zk=-batL*0.42+k*(batL*0.84)/Math.max(1,mods-1);
    R.box(0,batY+24,zk,batW*0.84,10,batL/(mods*1.45),cellCol,11,{spec:18});
  }
  // Cradle mounts from pack tray to motor end-bells
  for(const sz of [zR+20,zF-20])R.box(0,(batY+24-statorR)*0.5,sz,statorR*1.4,statorR-batY-24,26,'#44485c',12);

  // Finned cylindrical stator barrel + bolted end-bells
  R.cylinder([0,0,zR-26],[0,0,zR+4],statorR*0.78,statorR*0.96,16,'#44485c',20,{spec:14});
  R.cylinder([0,0,zF-4],[0,0,zF+26],statorR*0.96,statorR*0.78,16,'#44485c',21,{spec:14});
  R.cylinder([0,0,zR],[0,0,zF],statorR,statorR,18,'#6a7086',22,{spec:18,stripe:'#565c72'});
  const nFins=Math.max(4,Math.min(10,Math.round(L/32)));
  for(let k=0;k<nFins;k++){
    const fz=zR+22+k*(L-44)/Math.max(1,nFins-1);
    R.cylinder([0,0,fz-5],[0,0,fz+5],statorR*1.07,statorR*1.07,18,'#8e94aa',22,{spec:22,open0:true,open1:true});
  }
  // Liquid cooling jacket ports on top shoulders when jacket/spray/slot cooling is fitted
  if(e.evCooling==='jacket'||e.evCooling==='spray'||e.evCooling==='slot'){
    for(const sz of [zR+34,zF-34])R.cylinder([statorR*0.72,statorR*0.62,sz],[statorR*1.08,statorR*0.96,sz],15,15,8,'#2e78b8',24,{spec:20});
  }
  // Cutaway X-Ray: copper stator windings + spinning permanent-magnet rotor inside!
  if(cutaway){
    R.cylinder([0,0,zF+10],[0,0,zF+27],statorR*0.74,statorR*0.74,16,'#141620',90,{flat:true,zBias:18});
    R.cylinder([0,0,zF+14],[0,0,zF+28],statorR*0.68,statorR*0.68,16,'#cf7a32',91,{spec:22,stripe:'#e8984c',zBias:22});
    R.cylinder([0,0,zF+18],[0,0,zF+29],statorR*0.48,statorR*0.48,14,'#9aa0b8',92,{rot:t*7,spec:24,stripe:'#44485c',zBias:28});
  }
  // Spinning output shaft + keyed drive flange
  R.cylinder([0,0,zF+24],[0,0,zF+108],26,24,10,'#cfd5e8',25,{rot:t*7,spec:26,stripe:'#9aa0b8'});
  R.pulleyZ(0,0,zF+90,zF+106,42,t*7,'#aeb4c8',25,{spokes:4,segs:12});

  // Power-electronics inverter perched on top + 3-phase orange HV cables!
  const invY=statorR+48;
  R.box(0,invY,0,statorR*1.55,52,Math.min(L*0.86,260),'#2d4236',30,{spec:14});
  R.box(0,invY+28,0,statorR*1.35,8,Math.min(L*0.76,220),'#4c6e5a',30,{spec:20});
  R.box(statorR*0.45,invY+10,Math.min(L*0.43,130)+2,18,10,6,'#00ff88',31,{glow:true});
  // Orange HV cables: 3-phase bus inverter -> motor, and DC bus battery -> inverter
  for(const dz of [-24,0,24]){
    R.tube([[statorR*0.55,invY-18,dz],[statorR*0.95,invY-28,dz],[statorR*0.85,statorR*0.45,dz]],9,6,'#ff7a00',32,{smooth:true});
  }
  R.tube([[-statorR*0.65,invY-14,zR*0.35],[-batW*0.44,invY-24,zR*0.35],[-batW*0.44,batY+16,zR*0.35]],11,6,'#ff7a00',33,{smooth:true});
  R.tube([[-statorR*0.65,invY-14,zR*0.35-28],[-batW*0.44-16,invY-24,zR*0.35-28],[-batW*0.44-16,batY+16,zR*0.35-28]],11,6,'#ff7a00',33,{smooth:true});

  R.applyOutlines();
}

// ---- 3D-to-8-bit Combustion Engine Builder (Inline, V, Boxer, Rotary) ----
function buildRealEngine3D(R,e,t,opts){
  opts=opts||{};
  e=e||DEFAULT_ENGINE;t=t||0;
  if(e.type==='electric')return drawMotor3D(R,e,t,opts);
  const cam=opts.cam||ENG3D_VIEWS[0],cutaway=!!opts.cutaway;
  const n=Math.max(1,Math.min(12,Math.round(e.cylinders||4)));
  const bore=clamp(e.bore_mm||86,60,115),stroke=clamp(e.stroke_mm||86,50,130);
  const type=e.type||'petrol4',two=type==='twostroke',diesel=type==='diesel';
  let layout=type==='rotary'?'rotary':(e.layout||'inline');
  if((layout==='v'||layout==='boxer')&&n<2)layout='inline';   // 1-cyl V/boxer gracefully renders as single cylinder
  const vt=_vtKind(e);
  const coverCol=diesel&&(e.cam==='stock'||e.cam==='atkinson')?'#2c7252':(({stock:'#5a6074',atkinson:'#5a6074',sport:'#cc2c3a',race:'#d4a428'})[e.cam]||'#5a6074');
  const blockCol=diesel?'#505666':'#6c7286',headCol='#b2b8cc',castAlu='#a4aac0';
  const hdr=_hdrStyle(e),hc=hdr.col,filt=e.airFilter||'stock',ign=e.ignitionType||'coil';
  const spin=t*5.0,hy=!!(e.hyMode&&e.hyMode!=='none');
  const tSc=_turboScale(e),icStr=String(e.intercooler||'none');
  const icWta=icStr.startsWith('wta'),icOn=icStr!=='none'&&icStr!=='false';

  // =========================================================================
  // 1) INLINE (I1..I12) — Crossflow 3/4 with exposed top valve cover
  // =========================================================================
  if(layout==='inline'){
    const pitch=bore*1.15,L=n*pitch+56,zF=L*0.5,zR=-L*0.5;
    const deckY=stroke*1.85+bore*0.60,headH=two?78:94,headTop=deckY+headH;
    const vcH=two?0:(vt==='dohc'?56:vt==='sohc'?42:36);
    const blkHalfW=bore*0.96,skirtHalfW=bore*1.24,sumpBot=-stroke*1.65;
    const span=Math.max(L+220,(headTop+vcH-sumpBot)*1.68,720);
    R.setCamera(cam.yaw,cam.pitch,Math.min(0.24,214/span),R.w*0.50,R.h*0.56,15,(headTop+vcH*0.4+sumpBot)*0.46,0);

    _stand3D(R,skirtHalfW+18,zF-20,zR+20,sumpBot+10);
    const fwR=Math.max(125,stroke*1.55);
    R.pulleyZ(0,0,zR-36,zR-8,fwR,spin*0.6,'#484c60',10,{spokes:6,teeth:20,segs:18});
    if(hy){
      R.cylinder([0,0,zR-82],[0,0,zR-38],fwR*0.92,fwR*0.92,16,'#2f6e58',11,{spec:16});
      R.tube([[-58,fwR*0.7,zR-58],[-138,fwR*0.85,zR-58],[-158,sumpBot,zR-58]],11,6,'#ff7a00',12,{smooth:true});
      R.tube([[-24,fwR*0.82,zR-58],[-112,fwR*0.96,zR-58],[-132,sumpBot,zR-58]],10,6,'#ff7a00',12,{smooth:true});
    }
    // Stepped oil sump pan + flared block
    R.prismZ([[-skirtHalfW*0.78,sumpBot],[skirtHalfW*0.78,sumpBot],[skirtHalfW*0.92,-55],[-skirtHalfW*0.92,-55]],zR+8,zR+L*0.56,'#2e3244',15,{spec:8});
    R.prismZ([[-skirtHalfW*0.74,sumpBot*0.68],[skirtHalfW*0.74,sumpBot*0.68],[skirtHalfW*0.90,-55],[-skirtHalfW*0.90,-55]],zR+L*0.50,zF-8,'#353a4e',15,{spec:8});
    R.prismZ([[-skirtHalfW,-58],[skirtHalfW,-58],[skirtHalfW*0.96,26],[blkHalfW,56],[blkHalfW,deckY],[-blkHalfW,deckY],[-blkHalfW,56],[-skirtHalfW*0.96,26]],zR,zF,blockCol,20,{spec:10});
    for(let k=0;k<n;k++){
      const zk=zF-28-(k+0.5)*pitch;
      R.cylinder([blkHalfW-4,deckY*0.56,zk],[blkHalfW+5,deckY*0.56,zk],17,17,8,'#c99b44',21,{spec:20});
      if(k>0)R.box(blkHalfW+2,deckY*0.58,zF-28-k*pitch,6,deckY*0.66,9,shadeHex(blockCol,-0.15),20);
    }
    R.cylinder([skirtHalfW*0.92,-10,zF*0.45],[skirtHalfW*1.48,-32,zF*0.45],32,32,10,'#2258b2',22,{spec:18});
    R.cylinder([skirtHalfW*0.95,16,zR*0.45],[skirtHalfW*0.95,16,zR+18],30,30,8,'#3c4054',23,{spec:10});
    // Head + copper gasket + exposed valve cover
    R.prismZ([[-blkHalfW*1.06,deckY-3],[blkHalfW*1.06,deckY-3],[blkHalfW*1.06,deckY+4],[-blkHalfW*1.06,deckY+4]],zR-2,zF+2,'#d48640',25);
    R.prismZ([[-blkHalfW*1.08,deckY+4],[blkHalfW*1.08,deckY+4],[blkHalfW*1.08,headTop],[-blkHalfW*1.08,headTop]],zR,zF,two?'#8a90a6':headCol,26,{spec:16});
    if(two){
      for(let fy=deckY+18;fy<headTop;fy+=18)R.box(0,fy,0,blkHalfW*2.38,6,L+12,'#cfd5e8',26,{spec:20});
    }else{
      if(vt==='dohc'){
        const w=blkHalfW*1.02;
        R.prismZ([[-w,headTop],[w,headTop],[w,headTop+vcH*0.82],[w*0.42,headTop+vcH],[w*0.28,headTop+vcH*0.62],[-w*0.28,headTop+vcH*0.62],[-w*0.42,headTop+vcH],[-w,headTop+vcH*0.82]],zR+10,zF-6,coverCol,30,{spec:20});
      }else if(vt==='sohc'){
        const w=blkHalfW*0.82;
        R.prismZ([[-w,headTop],[w,headTop],[w*0.84,headTop+vcH],[-w*0.84,headTop+vcH]],zR+10,zF-6,coverCol,30,{spec:18});
      }else{
        const w=blkHalfW*0.66;
        R.prismZ([[-w,headTop],[w,headTop],[w*0.86,headTop+vcH],[-w*0.86,headTop+vcH]],zR+10,zF-6,coverCol,30,{spec:16});
        for(let k=0;k<n;k++){const zk=zF-28-(k+0.5)*pitch;R.cylinder([blkHalfW+6,40,zk-10],[blkHalfW+6,deckY+12,zk-10],7,7,5,'#cfd5e8',31,{spec:24});R.cylinder([blkHalfW+6,40,zk+10],[blkHalfW+6,deckY+12,zk+10],7,7,5,'#cfd5e8',31,{spec:24});}
      }
      R.cylinder([blkHalfW*0.56,headTop+vcH-4,zF-46],[blkHalfW*0.56,headTop+vcH+14,zF-46],19,17,8,'#242636',32,{spec:16});
      if(e.vvt)R.cylinder([blkHalfW*0.86,headTop+18,zF-20],[blkHalfW*1.18,headTop+18,zF-20],14,14,8,'#00cc77',33,{spec:20});
      for(let k=0;k<n;k++){
        const zk=zF-28-(k+0.5)*pitch,iy=vt==='dohc'?headTop+vcH*0.65:headTop+vcH;
        if(ign==='distributor'){
          R.cylinder([0,iy,zk],[0,iy+22,zk],8,8,5,'#eef2fc',34);
          R.tube([[26,headTop+22,zR-14],[14,iy+50,(zR+zk)*0.5],[0,iy+22,zk]],5,5,'#d43438',35,{smooth:true});
        }else if(ign==='wasted'){
          R.cylinder([0,iy,zk],[0,iy+18,zk],8,8,5,'#d8dee8',34);
          R.tube([[0,iy+40,zR*0.3],[0,iy+18,zk]],4.5,5,'#383e54',35);
        }else{
          R.box(0,iy+10,zk,24,20,24,diesel?'#cfd5e8':'#262838',34,{spec:16});
          R.box(0,iy+21,zk,13,5,13,diesel?'#ffcc00':'#d83844',34);
        }
      }
      if(ign==='distributor')R.cylinder([26,headTop+22,zR+4],[26,headTop+22,zR-36],28,26,8,'#a64228',35,{spec:12});
      else if(ign==='wasted')R.box(0,headTop+vcH+20,zR*0.3,46,24,42,'#262838',35,{spec:14});
      if(e.nitrous&&e.nitrous!=='none'){
        R.box(-blkHalfW*0.72,headTop+vcH+16,22,22,24,22,'#2468ff',36,{spec:20});
        R.box(-blkHalfW*0.72,headTop+vcH+16,-20,22,24,22,'#d83444',36,{spec:20});
      }
    }
    if(cutaway){
      for(let k=0;k<Math.min(2,n);k++){
        const zk=zF-28-(k+0.5)*pitch,ang=spin+k*Math.PI,pY=deckY-12-stroke*(0.5-0.5*Math.cos(ang));
        const crX=Math.sin(ang)*stroke*0.35,crY=-Math.cos(ang)*stroke*0.35;
        R.box(blkHalfW*0.92,deckY*0.56,zk,18,deckY*0.78,bore*0.88,'#12141e',90,{flat:true,zBias:20});
        if(Math.cos(ang)>0.65)R.box(blkHalfW*0.95,deckY-16,zk,14,24,bore*0.78,'#ffaa33',91,{glow:true,zBias:25});
        R.box(blkHalfW*0.96,pY-22,zk,16,44,bore*0.82,'#dce2f0',92,{spec:24,zBias:30});
        R.cylinder([blkHalfW*0.96,pY-38,zk],[blkHalfW*0.96+crX*0.15,crY,zk],10,12,6,'#969cb4',93,{zBias:28});
      }
    }
    // Front timing cover, toothed cam sprockets & serpentine accessory belt
    const zBelt=zF+32,zTim=zF+18,rCrank=74,rWP=46,rAlt=34,rIdl=28,rCam=50;
    const wpPos=[-12,deckY*0.62],altPos=[-blkHalfW*1.72,deckY*0.78],idlPos=[blkHalfW*0.95,deckY*0.42];
    R.prismZ([[-blkHalfW*0.85,-40],[blkHalfW*0.85,-40],[blkHalfW*0.75,deckY+20],[-blkHalfW*0.75,deckY+20]],zF,zF+14,'#7d8398',40,{spec:12});
    R.cylinder([altPos[0],altPos[1],zF-66],[altPos[0],altPos[1],zF+4],52,52,10,'#8e94aa',41,{spec:16,stripe:'#565c72'});
    if(!two&&vt!=='ohv'){
      const camY=headTop+vcH*0.44;
      if(vt==='dohc'){
        const c1=[-blkHalfW*0.54,camY],c2=[blkHalfW*0.54,camY];
        R.beltZ([{x:0,y:0,r:44},{x:c1[0],y:c1[1],r:rCam},{x:c2[0],y:c2[1],r:rCam}],zTim,18,t,'#1e202e',42);
        R.pulleyZ(c1[0],c1[1],zTim-10,zTim+10,rCam,spin*0.5,'#c99b44',43,{teeth:12,spokes:5});
        R.pulleyZ(c2[0],c2[1],zTim-10,zTim+10,rCam,spin*0.5,'#c99b44',43,{teeth:12,spokes:5});
      }else{
        R.beltZ([{x:0,y:0,r:44},{x:0,y:camY,r:rCam+4}],zTim,18,t,'#1e202e',42);
        R.pulleyZ(0,camY,zTim-10,zTim+10,rCam+4,spin*0.5,'#c99b44',43,{teeth:14,spokes:5});
      }
    }
    const scRoots=e.intake==='supercharger'&&(e.scType||'roots')!=='centrifugal';
    const scCent=e.intake==='supercharger'&&e.scType==='centrifugal';
    const acc=[{x:0,y:0,r:rCrank},{x:altPos[0],y:altPos[1],r:rAlt},{x:wpPos[0],y:wpPos[1],r:rWP},{x:idlPos[0],y:idlPos[1],r:rIdl}];
    if(scRoots){
      const sp=[-blkHalfW*2.1,headTop+18];acc.splice(2,0,{x:sp[0],y:sp[1],r:36});
      R.pulleyZ(sp[0],sp[1],zBelt-9,zBelt+9,36,spin*1.9,'#d4daea',46,{teeth:10,spokes:4});
    }else if(scCent){
      const cp=[blkHalfW*1.65,deckY*0.88];acc.push({x:cp[0],y:cp[1],r:34});
      R.pulleyZ(cp[0],cp[1],zBelt-9,zBelt+9,34,spin*2.3,'#d4a644',46,{teeth:10,spokes:4});
      const cs=R.turboZ(cp[0]+10,cp[1],zF-40,0.9,spin,72,{outDir:1});
      R.tube([cs.outPt,[cs.outPt[0],headTop+62,zF+10],[-blkHalfW*2.1,headTop-10,zF-10]],19,7,'#c8cedf',75,{smooth:true,couplers:true});
    }
    R.beltZ(acc,zBelt,16,t,'#202230',44);
    R.pulleyZ(0,0,zBelt-12,zBelt+12,rCrank,spin,'#5c6276',45,{spokes:6});
    R.pulleyZ(wpPos[0],wpPos[1],zBelt-9,zBelt+9,rWP,-spin*1.3,'#969cb4',45,{spokes:4});
    R.pulleyZ(altPos[0],altPos[1],zBelt-8,zBelt+8,rAlt,spin*1.9,'#c4cadc',45,{spokes:3});
    R.pulleyZ(idlPos[0],idlPos[1],zBelt-7,zBelt+7,rIdl,-spin*2.1,'#7a8096',45,{spokes:3});
    if(e.fan==='mechanical'){
      const fz=zBelt+24;
      R.cylinder([wpPos[0],wpPos[1],zBelt+6],[wpPos[0],wpPos[1],fz+8],24,20,8,'#464a5e',47);
      for(let k=0;k<5;k++){
        const a=t*7+k*Math.PI*2/5;
        R.quad([wpPos[0]+Math.cos(a)*18,wpPos[1]+Math.sin(a)*18,fz],[wpPos[0]+Math.cos(a)*102,wpPos[1]+Math.sin(a)*102,fz],
          [wpPos[0]+Math.cos(a+0.32)*96,wpPos[1]+Math.sin(a+0.32)*96,fz-12],[wpPos[0]+Math.cos(a+0.32)*18,wpPos[1]+Math.sin(a+0.32)*18,fz-6],'#aeb4c8',47,{spec:16});
      }
    }
    // Crossflow Intake (-X)
    const sys=e.intakeSys||'efi',portY=deckY+headH*0.56,plenX=-blkHalfW*2.15,plenY=portY-8,tbPt=[plenX,plenY,zF+12];
    if(sys==='itb'||sys==='mech'){
      for(let k=0;k<n;k++){
        const zk=zF-28-(k+0.5)*pitch,p0=[-blkHalfW*1.05,portY,zk],p1=[-blkHalfW*1.78,portY+26,zk],p2=[-blkHalfW*2.02,portY+84,zk];
        R.tube([p0,p1,p2],17,7,'#cfd5e8',50,{smooth:true,spec:24});
        R.cylinder([p2[0]+4,p2[1]-12,zk],[p2[0]-4,p2[1]+10,zk],18,29,8,'#eef2ff',50,{spec:28,open1:true});
        R.cylinder([p2[0],p2[1]-6,zk],[p2[0]-3,p2[1]+7,zk],15,21,8,'#161824',50,{flat:true});
      }
      R.cylinder([-blkHalfW*1.48,portY+34,zR+24],[-blkHalfW*1.48,portY+34,zF-24],9,9,6,'#d43440',51,{spec:20});
      if(sys==='mech')R.box(-blkHalfW*1.75,deckY*0.65,zF*0.3,58,64,72,'#4c5268',52,{spec:14});
    }else if(sys==='sidedraft'){
      const pairs=Math.max(1,Math.ceil(n/2));
      for(let k=0;k<pairs;k++){
        const zk=zF-30-(k+0.5)*Math.max(40,L-60)/pairs;
        R.box(-blkHalfW*1.75,portY+4,zk,72,70,Math.min(pitch*1.65,150),'#b2b8cc',50,{spec:18});
        for(const dz of [-pitch*0.4,pitch*0.4])R.cylinder([-blkHalfW*2.1,portY+4,zk+dz],[-blkHalfW*2.72,portY+8,zk+dz],17,24,8,'#e4e8f6',50,{spec:26});
      }
    }else if(sys==='carb1'||sys==='carb2'||sys==='carb4'){
      for(let k=0;k<n;k++){const zk=zF-28-(k+0.5)*pitch;R.tube([[-blkHalfW*1.04,portY,zk],[plenX,plenY,0]],17,6,castAlu,50,{smooth:true});}
      const cr=sys==='carb4'?82:sys==='carb2'?68:54;
      R.box(plenX,plenY+26,0,62,44,62,'#a89a74',51,{spec:18});
      if(filt!=='none'){
        R.cylinder([plenX,plenY+46,0],[plenX,plenY+76,0],cr,cr,14,filt==='perf'?'#c82b38':'#2a2e3e',52,{stripe:filt==='perf'?'#e84856':null});
        R.cylinder([plenX,plenY+76,0],[plenX,plenY+88,0],cr+6,cr-10,14,'#dce2f0',52,{spec:26});
      }
    }else{
      for(let k=0;k<n;k++){const zk=zF-28-(k+0.5)*pitch;R.tube([[-blkHalfW*1.04,portY,zk],[-blkHalfW*1.65,portY+28,zk],[plenX,plenY,zk]],18,7,castAlu,50,{smooth:true,spec:16});}
      R.cylinder([plenX,plenY,zR+22],[plenX,plenY,zF-18],42,46,10,'#b4bacd',51,{spec:18});
      R.cylinder([-blkHalfW*1.46,portY+32,zR+24],[-blkHalfW*1.46,portY+32,zF-24],9,9,6,e.injector==='direct'?'#cfd5e8':'#288858',52,{spec:18});
      R.cylinder([plenX,plenY,zF-18],tbPt,32,34,10,'#d8dee8',53,{spec:24});
      R.cylinder([plenX,plenY,zF+8],[plenX,plenY,zF+14],24,24,8,'#161824',53,{flat:true});
      if(scRoots){
        R.box(plenX,headTop+18,0,104,84,L*0.72,e.scType==='screw'?'#8c92a8':'#cfd5e8',54,{spec:22});
        R.cylinder([plenX,headTop+18,zF*0.36],[plenX,headTop+18,zBelt],24,24,8,'#a4aac0',54,{spec:18});
      }else if(e.intake==='na'){
        const pEnd=[plenX-44,plenY-12,zF+80];
        R.tube([tbPt,[plenX-18,plenY-6,zF+48],pEnd],21,7,'#8c92a8',55,{smooth:true,couplers:true});
        R.airFilterAt(pEnd,[pEnd[0]-40,pEnd[1]-10,pEnd[2]+70],44,30,56,filt);
      }
    }
    // Crossflow Exhaust (+X) + Turbo(s) + Charge Pipe
    const isTurbo=e.intake==='turbo',collPt=[blkHalfW*2.15,isTurbo?deckY-18:20,isTurbo?16:-30];
    if(hdr.kind==='stock'&&!isTurbo){
      R.cylinder([blkHalfW*1.48,portY-6,zR+28],[blkHalfW*1.48,portY-6,zF-28],26,26,8,hc,60,{spec:8});
      for(let k=0;k<n;k++){const zk=zF-28-(k+0.5)*pitch;R.cylinder([blkHalfW*1.04,portY-4,zk],[blkHalfW*1.50,portY-6,zk],18,18,6,hc,60);}
      R.tube([[blkHalfW*1.55,portY-12,-20],[blkHalfW*1.85,40,-60],[blkHalfW*1.55,-75,zR-40]],23,7,hc,60,{smooth:true});
    }else{
      const rP=hdr.kind==='race'?15:17;
      for(let k=0;k<n;k++){
        const zk=zF-28-(k+0.5)*pitch;
        R.tube([[blkHalfW*1.04,portY-4,zk],[blkHalfW*2.10,isTurbo?portY+24+(k%2)*16:portY-22,zk],collPt],rP,7,hc,60,{smooth:true,heat:true,spec:16});
      }
      if(!isTurbo)R.tube([collPt,[blkHalfW*1.95,-55,zR*0.55],[blkHalfW*1.45,-90,zR-55]],23,7,hc,60,{smooth:true,heat:true});
    }
    if(e.cat&&e.cat!=='none'&&!isTurbo){
      R.cylinder([blkHalfW*1.58,-80,zR-12],[blkHalfW*1.42,-92,zR-62],32,32,8,'#8c92a8',63,{spec:14});
    }
    if(isTurbo){
      const cfg=e.turboConfig||'single';
      const units=cfg==='single'?[{z:16,sc:tSc}]:cfg==='twin'?[{z:zF*0.42,sc:tSc*0.84},{z:zR*0.42,sc:tSc*0.84}]
        :cfg==='compound'?[{z:zF*0.42,sc:tSc*1.08},{z:zR*0.36,sc:tSc*0.76}]:[{z:zF*0.44,sc:tSc*0.76},{z:zR*0.36,sc:tSc*0.98}];
      const tPts=[];
      units.forEach((u,j)=>{
        const tx=blkHalfW*2.30,ty=deckY+14;
        const pts=R.turboZ(tx,ty,u.z,u.sc,spin,70+j*4,{outDir:1,vgt:e.vgt,antilag:e.antilag&&j===0});
        R.tube([pts.exhOutPt,[tx+12,ty-65,u.z-120],[blkHalfW*1.55,-75,zR-56]],21,7,hc,61,{smooth:true,heat:true});
        tPts.push(pts);
      });
      if(cfg==='compound'&&tPts.length>1)R.tube([tPts[0].outPt,[blkHalfW*2.45,deckY+78,0],tPts[1].inPt],16,6,'#c8cedf',79,{smooth:true,couplers:true});
      const pIn=tPts[0].inPt;
      R.airFilterAt(pIn,[pIn[0]+10,pIn[1]-8,pIn[2]+88],40,28,78,filt);
      const pOut=tPts[0].outPt;
      if(icOn&&!icWta){
        const icZ=zF+135,icY=sumpBot+58,icW=icStr==='large'?250:190,icH=icStr==='large'?92:76;
        R.box(0,icY,icZ,icW-44,icH,34,'#767c92',80,{spec:16});
        for(let fy=icY-icH*0.36;fy<=icY+icH*0.36;fy+=18)R.box(0,fy,icZ+16,icW-50,5,5,'#b8bed4',80,{spec:20});
        R.box(-icW*0.5+14,icY,icZ,30,icH+4,40,'#c8cedf',81,{spec:22});
        R.box(icW*0.5-14,icY,icZ,30,icH+4,40,'#c8cedf',81,{spec:22});
        R.tube([pOut,[pOut[0]+16,pOut[1]+12,icZ],[icW*0.5+8,icY+12,icZ],[icW*0.5-4,icY+10,icZ]],17,7,'#c8cedf',82,{smooth:true,couplers:true});
        R.tube([[-icW*0.5+4,icY+10,icZ],[plenX-10,icY+40,icZ],[plenX,plenY,icZ-35],tbPt],17,7,'#96c0e4',83,{smooth:true,couplers:true});
      }else{
        R.tube([pOut,[pOut[0]-15,headTop+58,zF+54],[plenX,headTop+48,zF+54],tbPt],17,7,'#c8cedf',82,{smooth:true,couplers:true});
        if(icWta){
          // Compact water-to-air charge cooler barrel perched on the top charge pipe!
          R.cylinder([-30,headTop+52,zF+54],[55,headTop+54,zF+54],30,30,10,'#aeb4c8',81,{spec:22});
          R.cylinder([10,headTop+78,zF+54],[10,headTop+96,zF+54],10,10,6,'#00ccff',81);
        }
      }
    }

  // =========================================================================
  // 2) V-ENGINE (V2..V12) — Continuous 60°/90° cast banks + in-valley induction
  // =========================================================================
  }else if(layout==='v'){
    const perBank=Math.max(1,Math.ceil(n/2)),pitch=bore*1.16,L=perBank*pitch+62,zF=L*0.5,zR=-L*0.5;
    const vHalf=(n===6||n===12)?(30*Math.PI/180):(45*Math.PI/180);
    const bankDeck=stroke*1.75+bore*0.52,headH=two?72:88,vcH=two?0:(vt==='dohc'?54:vt==='sohc'?40:32);
    const bankHalfW=bore*0.88,sumpBot=-stroke*1.55;
    const bankXY=(s,d,tOff)=>{const su=Math.sin(s*vHalf),sv=Math.cos(s*vHalf),pu=Math.cos(s*vHalf),pv=-Math.sin(s*vHalf);return [su*d+pu*tOff,sv*d+pv*tOff];};
    const topY=Math.cos(vHalf)*(bankDeck+headH+vcH)+95,halfSpanX=Math.sin(vHalf)*(bankDeck+headH+vcH)+bankHalfW+85;
    const span=Math.max(L+220,halfSpanX*2.0,(topY-sumpBot)*1.52,740);
    R.setCamera(cam.yaw,cam.pitch,Math.min(0.23,218/span),R.w*0.50,R.h*0.57,0,(topY+sumpBot)*0.36,0);

    _stand3D(R,145,zF-20,zR+20,sumpBot+10);
    const fwR=Math.max(130,stroke*1.5);
    R.pulleyZ(0,0,zR-36,zR-8,fwR,spin*0.6,'#484c60',10,{spokes:6,teeth:20,segs:18});
    if(hy)R.cylinder([0,0,zR-82],[0,0,zR-38],fwR*0.92,fwR*0.92,16,'#2f6e58',11,{spec:16});
    R.prismZ([[-112,sumpBot],[112,sumpBot],[128,-56],[-128,-56]],zR+8,zF-8,'#2e3244',15,{spec:8});
    const vBlk=[[-128,-56],[128,-56],bankXY(1,56,bankHalfW),bankXY(1,bankDeck,bankHalfW),bankXY(1,bankDeck,-bankHalfW*0.92),[0,74],bankXY(-1,bankDeck,bankHalfW*0.92),bankXY(-1,bankDeck,-bankHalfW),bankXY(-1,56,-bankHalfW)];
    R.prismZ(vBlk,zR,zF,blockCol,20,{spec:10});

    for(const s of [-1,1]){
      const zOff=s>0?12:-12,hw=bankHalfW*1.08;
      R.prismZ([bankXY(s,bankDeck,-hw),bankXY(s,bankDeck,hw),bankXY(s,bankDeck+headH,hw),bankXY(s,bankDeck+headH,-hw)],zR+zOff,zF+zOff,headCol,s<0?26:27,{spec:16});
      if(!two){
        const vw=vt==='dohc'?hw*1.04:vt==='sohc'?hw*0.84:hw*0.68;
        R.prismZ([bankXY(s,bankDeck+headH,-vw),bankXY(s,bankDeck+headH,vw),bankXY(s,bankDeck+headH+vcH,vw*0.86),bankXY(s,bankDeck+headH+vcH,-vw*0.86)],zR+zOff+10,zF+zOff-8,coverCol,s<0?30:31,{spec:20});
        for(let k=0;k<perBank;k++){
          const zk=zF+zOff-30-(k+0.5)*pitch,[ix,iy]=bankXY(s,bankDeck+headH+vcH+8,0);
          R.box(ix,iy,zk,22,20,22,ign==='distributor'?'#c83438':'#262838',34);
        }
      }
      if(cutaway){
        const ang=spin+(s>0?Math.PI:0),u=0.5-0.5*Math.cos(ang),dP=76+u*(bankDeck-102);
        const [bx,by]=bankXY(s,dP,0),[hx,hy]=bankXY(s,bankDeck-12,0),[p1x,p1y]=bankXY(s,dP+36,0);
        R.cylinder([0,0,zF+zOff+4],[bx,by,zF+zOff+4],10,10,6,'#969cb4',92,{zBias:20});
        R.cylinder([bx,by,zF+zOff+4],[hx,hy,zF+zOff+4],bore*0.42,bore*0.42,8,'#141620',90,{flat:true,zBias:15});
        R.cylinder([bx,by,zF+zOff+4],[p1x,p1y,zF+zOff+4],bore*0.40,bore*0.40,8,'#dce2f0',91,{spec:24,zBias:25});
      }
    }
    const sys=e.intakeSys||'efi',scBlower=e.intake==='supercharger'&&(e.scType||'roots')!=='centrifugal';
    const valY=Math.cos(vHalf)*(bankDeck+headH*0.35),tbPt=[0,valY+46,zF+16],zBelt=zF+36;
    if(scBlower){
      const sw=88,sh=e.scType==='screw'?76:96;
      R.prismZ([[-sw,valY],[sw,valY],[sw+10,valY+sh*0.62],[sw-16,valY+sh],[-sw+16,valY+sh],[-sw-10,valY+sh*0.62]],zR+24,zF-10,e.scType==='screw'?'#8c92a8':'#cfd5e8',54,{spec:22});
      for(let kz=zR+46;kz<zF-24;kz+=34)R.box(0,valY+sh*0.52,kz,sw*2.12,sh*0.72,10,'#5a6074',54,{spec:12});
      if((e.scType||'roots')==='roots'){
        R.prismZ([[-62,valY+sh],[62,valY+sh],[52,valY+sh+48],[-52,valY+sh+48]],zR+75,zF-4,'#dce2f0',55,{spec:26});
        R.cylinder([-24,valY+sh+24,zF-4],[-24,valY+sh+24,zF+4],16,16,8,'#cc2838',55);
        R.cylinder([24,valY+sh+24,zF-4],[24,valY+sh+24,zF+4],16,16,8,'#cc2838',55);
      }
      R.cylinder([0,valY+sh*0.56,zF-12],[0,valY+sh*0.56,zBelt],24,24,8,'#aeb4c8',54,{spec:20});
    }else if(sys==='itb'||sys==='mech'){
      const tipY=Math.cos(vHalf)*(bankDeck+headH+vcH)+52;
      for(let k=0;k<perBank;k++){
        const zk=zF-30-(k+0.5)*pitch;
        for(const s of [-1,1]){
          const p0=[s*36,valY-4,zk],p1=[s*42,tipY,zk];
          R.cylinder(p0,p1,17,20,8,'#d4daea',50,{spec:26});
          R.cylinder([p1[0],p1[1]-6,zk],[p1[0]+s*3,p1[1]+16,zk],20,31,8,'#eef2ff',50,{spec:28,open1:true});
          R.cylinder([p1[0],p1[1],zk],[p1[0]+s*2,p1[1]+13,zk],16,23,8,'#161824',50,{flat:true});
        }
      }
    }else if(sys==='carb1'||sys==='carb2'||sys==='carb4'||sys==='sidedraft'){
      R.prismZ([[-74,valY-12],[74,valY-12],[52,valY+34],[-52,valY+34]],zR+28,zF-28,'#969cb0',50,{spec:14});
      R.box(0,valY+56,0,86,46,86,'#a89a74',51,{spec:18});
      if(filt!=='none'){
        R.cylinder([0,valY+78,0],[0,valY+116,0],118,118,16,filt==='perf'?'#c82b38':'#2a2e3e',52,{stripe:filt==='perf'?'#e84856':null});
        R.cylinder([0,valY+116,0],[0,valY+130,0],126,110,16,'#dce2f0',52,{spec:28});
      }
    }else{
      const pCol=e.cam==='race'?'#383c4e':'#9aa0b4';
      R.prismZ([[-78,valY-4],[78,valY-4],[66,valY+66],[-66,valY+66]],zR+20,zF-14,pCol,50,{spec:18});
      for(const s of [-1,1])R.cylinder([s*76,valY+50,zR+28],[s*76,valY+50,zF-24],9,9,6,'#d43440',51,{spec:20});
      R.cylinder([0,valY+46,zF-14],tbPt,34,36,10,'#d8dee8',52,{spec:24});
      R.cylinder([0,valY+46,zF+12],[0,valY+46,zF+18],26,26,8,'#161824',52,{flat:true});
      if(e.intake==='na')R.airFilterAt(tbPt,[0,valY+46,zF+108],44,30,56,filt);
    }
    const rCrank=76,rWP=52,rAlt=36,rPS=36,wpPos=[0,118],altPos=[148,122],psPos=[-142,92];
    R.cylinder([altPos[0],altPos[1],zF-64],[altPos[0],altPos[1],zF+4],50,50,10,'#8e94aa',41,{spec:16,stripe:'#565c72'});
    if(!two&&vt!=='ohv'){
      const zTim=zF+20,cams=[];
      for(const s of [-1,1]){if(vt==='dohc')cams.push(bankXY(s,bankDeck+headH+20,-34),bankXY(s,bankDeck+headH+20,34));else cams.push(bankXY(s,bankDeck+headH+20,0));}
      R.beltZ([{x:0,y:0,r:44},{x:cams[0][0],y:cams[0][1],r:42},{x:cams[cams.length-1][0],y:cams[cams.length-1][1],r:42}],zTim,16,t,'#1c1e2c',42);
      for(const [cx,cy] of cams)R.pulleyZ(cx,cy,zTim-9,zTim+9,42,spin*0.5,'#c99b44',43,{teeth:12,spokes:4});
    }
    const beltPts=[{x:0,y:0,r:rCrank},{x:psPos[0],y:psPos[1],r:rPS},{x:wpPos[0],y:wpPos[1],r:rWP},{x:altPos[0],y:altPos[1],r:rAlt}];
    if(scBlower){
      const sh=e.scType==='screw'?76:96,snY=valY+sh*0.56;
      beltPts.splice(2,0,{x:0,y:snY,r:40});
      R.pulleyZ(0,snY,zBelt-10,zBelt+10,40,spin*1.9,'#d4daea',46,{teeth:12,spokes:5});
    }
    R.beltZ(beltPts,zBelt,16,t,'#202230',44);
    R.pulleyZ(0,0,zBelt-12,zBelt+12,rCrank,spin,'#5c6276',45,{spokes:6});
    R.pulleyZ(wpPos[0],wpPos[1],zBelt-9,zBelt+9,rWP,-spin*1.3,'#969cb4',45,{spokes:4});
    R.pulleyZ(altPos[0],altPos[1],zBelt-8,zBelt+8,rAlt,spin*1.9,'#c4cadc',45,{spokes:3});
    R.pulleyZ(psPos[0],psPos[1],zBelt-8,zBelt+8,rPS,spin*1.5,'#7a8096',45,{spokes:3});

    const isTurbo=e.intake==='turbo',rP=hdr.kind==='race'?15:17;
    for(const s of [-1,1]){
      const zOff=s>0?12:-12,[cx,cy]=bankXY(s,bankDeck*0.65,s*bankHalfW*1.95),pColl=[cx,cy,isTurbo?30:zR+28];
      for(let k=0;k<perBank;k++){
        const zk=zF+zOff-30-(k+0.5)*pitch;
        R.tube([[...bankXY(s,bankDeck+headH*0.50,s*bankHalfW*1.05),zk],[...bankXY(s,bankDeck+headH*0.45,s*bankHalfW*1.90),zk],pColl],rP,6,hc,s<0?60:61,{smooth:true,heat:true,spec:16});
      }
      if(!isTurbo)R.tube([pColl,[cx*0.92,-65,zR-55]],22,7,hc,s<0?60:61,{smooth:true,heat:true});
      else if(e.turboConfig!=='single'||s>0){
        const scT=(e.turboConfig==='single'?1.0:0.86)*tSc;
        const pts=R.turboZ(cx+s*22,cy+16,46,scT,spin,s<0?70:74,{outDir:s,vgt:e.vgt,antilag:e.antilag});
        R.airFilterAt(pts.inPt,[pts.inPt[0]+s*10,pts.inPt[1],pts.inPt[2]+80],36,24,78,filt);
        R.tube([pts.exhOutPt,[cx+s*10,cy-55,zR-45]],19,6,hc,62,{smooth:true,heat:true});
        R.tube([pts.outPt,[cx*0.72,valY+75,zF+38],tbPt],17,7,'#c8cedf',82,{smooth:true,couplers:true});
      }
    }

  // =========================================================================
  // 3) BOXER / FLAT (Flat-2..Flat-12) — 180° opposed banks + boxer timing belt
  // =========================================================================
  }else if(layout==='boxer'){
    const perBank=Math.max(1,Math.ceil(n/2)),pitch=bore*1.16,L=perBank*pitch+56,zF=L*0.5,zR=-L*0.5;
    const bankOut=105+stroke*1.65,headLen=84,vcLen=48,bankHalfH=bore*0.82,sumpBot=-stroke*1.45;
    const totalW=(bankOut+headLen+vcLen)*2,span=Math.max(totalW*1.18,L+210,740);
    R.setCamera(cam.yaw,cam.pitch,Math.min(0.24,224/span),R.w*0.50,R.h*0.58,0,42,0);

    _stand3D(R,155,zF-16,zR+16,sumpBot+8);
    R.pulleyZ(0,0,zR-36,zR-8,128,spin*0.6,'#484c60',10,{spokes:6,teeth:18,segs:16});
    R.prismZ([[-118,sumpBot],[118,sumpBot],[134,-bankHalfH*0.8],[-134,-bankHalfH*0.8]],zR+8,zF-8,'#2e3244',15);
    R.prismZ([[-bankOut,-bankHalfH],[bankOut,-bankHalfH],[bankOut,bankHalfH],[96,bankHalfH+22],[-96,bankHalfH+22],[-bankOut,bankHalfH]],zR,zF,blockCol,20,{spec:12});
    R.box(0,bankHalfH+24,0,10,10,L+4,'#44485c',21);

    for(const s of [-1,1]){
      const zOff=s>0?12:-12,x0=s*bankOut,x1=s*(bankOut+headLen),x2=s*(bankOut+headLen+vcLen);
      R.prismZ([[x0,-bankHalfH*1.06],[x1,-bankHalfH*1.06],[x1,bankHalfH*1.06],[x0,bankHalfH*1.06]],zR+zOff,zF+zOff,headCol,s<0?26:27,{spec:16});
      R.prismZ([[x1,-bankHalfH*0.98],[x2,-bankHalfH*0.88],[x2,bankHalfH*0.88],[x1,bankHalfH*0.98]],zR+zOff+10,zF+zOff-8,coverCol,s<0?30:31,{spec:20});
      if(cutaway){
        const ang=spin+(s>0?Math.PI:0),u=0.5-0.5*Math.cos(ang),px=s*(88+u*(bankOut-122));
        R.cylinder([0,0,zF+zOff+4],[px,0,zF+zOff+4],10,10,6,'#969cb4',92,{zBias:20});
        R.cylinder([px,0,zF+zOff+4],[px+s*38,0,zF+zOff+4],bore*0.42,bore*0.42,8,'#dce2f0',91,{spec:24,zBias:25});
      }
    }
    const zTim=zF+26,zAcc=zF+44,camX=bankOut+headLen*0.48,camY=bankHalfH*0.52;
    if(!two&&vt!=='ohv'){
      R.beltZ([{x:0,y:0,r:58},{x:-camX,y:-camY,r:42},{x:-camX,y:camY,r:42},{x:0,y:bankHalfH*0.72,r:28},{x:camX,y:camY,r:42},{x:camX,y:-camY,r:42}],zTim,18,t,'#1e202e',42);
      for(const [cx,cy] of (vt==='dohc'?[[-camX,camY],[-camX,-camY],[camX,camY],[camX,-camY]]:[[-camX,0],[camX,0]])){
        R.pulleyZ(cx,cy,zTim-10,zTim+10,42,spin*0.5,'#c99b44',43,{teeth:12,spokes:4});
      }
    }
    const altPos=[-48,bankHalfH+74];
    R.cylinder([altPos[0],altPos[1],zF-56],[altPos[0],altPos[1],zF+8],46,46,10,'#8e94aa',41,{spec:16,stripe:'#565c72'});
    R.beltZ([{x:0,y:0,r:66},{x:altPos[0],y:altPos[1],r:34}],zAcc,14,t,'#202230',44);
    R.pulleyZ(0,0,zAcc-10,zAcc+10,66,spin,'#5c6276',45,{spokes:6});
    R.pulleyZ(altPos[0],altPos[1],zAcc-8,zAcc+8,34,spin*1.9,'#c4cadc',45,{spokes:3});

    const sys=e.intakeSys||'efi',manCol=e.cam==='sport'?'#cc2c3a':e.cam==='race'?'#d4a428':'#a4aac0';
    if(sys==='itb'||sys==='mech'){
      for(let k=0;k<perBank;k++){const zk=zF-28-(k+0.5)*pitch;for(const s of [-1,1]){const ux=s*(bankOut+headLen*0.45);R.cylinder([ux,bankHalfH,zk],[ux,bankHalfH+102,zk],17,21,8,'#dce2f0',50,{spec:26});R.cylinder([ux,bankHalfH+96,zk],[ux,bankHalfH+116,zk],21,31,8,'#eef2ff',50,{spec:28,open1:true});}}
    }else{
      for(let k=0;k<perBank;k++){const zk=zF-28-(k+0.5)*pitch;for(const s of [-1,1])R.tube([[s*(bankOut+headLen*0.45),bankHalfH,zk],[s*145,bankHalfH+92,zk],[s*42,bankHalfH+104,zk]],18,7,manCol,50,{smooth:true,spec:18});}
      R.cylinder([0,bankHalfH+104,zR+24],[0,bankHalfH+104,zF-24],42,42,10,manCol,51,{spec:18});
    }
    const isTurbo=e.intake==='turbo',pUp=[155,-75,zR+28];
    for(let k=0;k<perBank;k++){
      const zk=zF-28-(k+0.5)*pitch;
      R.tube([[-(bankOut+headLen*0.45),-bankHalfH,zk],[-125,sumpBot-14,zk],[40,sumpBot-18,zR+40],pUp],16,6,hc,60,{smooth:true,heat:true});
      R.tube([[(bankOut+headLen*0.45),-bankHalfH,zk],[160,sumpBot-10,zk],pUp],16,6,hc,61,{smooth:true,heat:true});
    }
    if(isTurbo){
      const tPts=R.turboZ(148,bankHalfH+64,zR-18,0.90*tSc,spin,70,{outDir:1,vgt:e.vgt,antilag:e.antilag});
      R.tube([pUp,[168,12,zR-16],tPts.exhInPt],19,7,hc,62,{smooth:true,heat:true});
      R.airFilterAt(tPts.inPt,[tPts.inPt[0]+18,tPts.inPt[1],tPts.inPt[2]+72],36,24,78,filt);
      if(icOn){
        const icW=icStr==='large'||icStr==='wta-large'?245:185,icY=bankHalfH+162,icZ=zR+30;
        R.box(0,icY,icZ,icW-44,34,126,'#767c92',80,{spec:16});
        for(let ix=-icW*0.36;ix<=icW*0.36;ix+=24)R.box(ix,icY+16,icZ,8,6,118,'#c2c8dc',80,{spec:20});
        R.box(-icW*0.5+14,icY,icZ,30,38,130,'#cfd5e8',81,{spec:22});
        R.box(icW*0.5-14,icY,icZ,30,38,130,'#cfd5e8',81,{spec:22});
        R.tube([tPts.outPt,[105,icY,icZ]],17,7,'#226ee8',82,{smooth:true});
      }
    }

  // =========================================================================
  // 4) WANKEL ROTARY (1..4 Rotors) — Peanut epitrochoid housings + curved UIM
  // =========================================================================
  }else{
    const rotors=Math.max(1,Math.min(4,n)),rW=80,plateW=36,L=rotors*rW+(rotors+1)*plateW,zF=L*0.5,zR=-L*0.5;
    const rRad=Math.max(118,bore*1.15),span=Math.max(L+260,rRad*3.8,620);
    R.setCamera(cam.yaw,cam.pitch,Math.min(0.26,218/span),R.w*0.50,R.h*0.55,16,26,0);

    _stand3D(R,115,zF-10,zR+10,-rRad-36);
    R.pulleyZ(0,0,zR-36,zR-8,122,spin*0.6,'#484c60',10,{spokes:6,teeth:18,segs:16});
    R.prismZ([[-98,-rRad-44],[98,-rRad-44],[108,-rRad+10],[-108,-rRad+10]],zR+6,zF-6,'#2e3244',15);

    const peanutXY=s=>{const pts=[];for(let i=0;i<22;i++){const a=i*Math.PI*2/22,rad=rRad*s*(1-0.14*Math.cos(2*a));pts.push([Math.cos(a)*rad*0.88,Math.sin(a)*rad]);}return pts;};
    const ironPoly=peanutXY(1.03),aluPoly=peanutXY(0.99),finPoly=peanutXY(1.04);
    let cz=zR;
    for(let k=0;k<=rotors;k++){
      R.prismZ(ironPoly,cz,cz+plateW,'#3c4054',20+k*2,{spec:10});cz+=plateW;
      if(k<rotors){
        R.prismZ(aluPoly,cz,cz+rW,'#bcc2d6',21+k*2,{spec:20});
        for(const fz of [cz+18,cz+40,cz+62])R.prismZ(finPoly,fz-4,fz+4,'#d6dce8',21+k*2,{spec:24,noCaps:true});
        R.cylinder([rRad*0.78,36,cz+rW*0.5],[rRad*1.05,36,cz+rW*0.5],11,10,6,'#eef2ff',34);
        R.cylinder([rRad*0.78,-36,cz+rW*0.5],[rRad*1.05,-36,cz+rW*0.5],11,10,6,'#eef2ff',34);
        cz+=rW;
      }
    }
    if(cutaway){
      R.prismZ(peanutXY(0.84),zF-2,zF+4,'#12141e',90,{flat:true,zBias:20});
      const ra=t*3.5,ex=Math.cos(ra*3)*14,ey=Math.sin(ra*3)*14;
      const tri=[0,1,2].map(i=>{const a=ra+i*Math.PI*2/3;return [ex+Math.cos(a)*rRad*0.58,ey+Math.sin(a)*rRad*0.64];});
      R.prismZ(tri,zF+2,zF+14,'#d49a42',91,{spec:22,zBias:26});
      R.cylinder([ex,ey,zF+10],[ex,ey,zF+18],22,22,8,'#262838',92,{zBias:30});
    }else{
      const zBelt=zF+32,wpPos=[-16,76],altPos=[-52,rRad+34];
      R.cylinder([altPos[0],altPos[1],zF-58],[altPos[0],altPos[1],zF+6],44,44,10,'#8e94aa',41,{spec:16,stripe:'#565c72'});
      R.beltZ([{x:0,y:0,r:58},{x:altPos[0],y:altPos[1],r:32},{x:wpPos[0],y:wpPos[1],r:38}],zBelt,16,t,'#202230',44);
      R.pulleyZ(0,0,zBelt-10,zBelt+10,58,spin,'#5c6276',45,{spokes:5});
      R.pulleyZ(wpPos[0],wpPos[1],zBelt-8,zBelt+8,38,-spin*1.3,'#969cb4',45,{spokes:4});
      R.pulleyZ(altPos[0],altPos[1],zBelt-8,zBelt+8,32,spin*1.9,'#c4cadc',45,{spokes:3});
    }
    const manCol=e.cam==='sport'?'#cc2c3a':e.cam==='race'?'#d4a428':'#b8bed4';
    for(let k=0;k<rotors;k++){
      const zk=zR+plateW+k*(rW+plateW)+rW*0.5;
      R.tube([[-rRad*0.80,12,zk],[-rRad*1.05,rRad*0.92,zk],[0,rRad+66,zk],[rRad*0.55,rRad+48,zk]],21,7,manCol,50,{smooth:true,spec:18});
    }
    const tbPt=[rRad*0.55,rRad+48,zF+18];
    R.cylinder([rRad*0.55,rRad+48,zR+plateW],tbPt,30,32,10,'#cfd5e8',51,{spec:22});
    R.cylinder([tbPt[0],tbPt[1],tbPt[2]-4],[tbPt[0],tbPt[1],tbPt[2]+3],22,22,8,'#161824',51,{flat:true});
    if(e.intake==='na')R.airFilterAt(tbPt,[tbPt[0],tbPt[1],tbPt[2]+88],38,26,56,filt);
    const isTurbo=e.intake==='turbo',collPt=[rRad*1.48,-42,0];
    for(let k=0;k<rotors;k++){const zk=zR+plateW+k*(rW+plateW)+rW*0.5;R.tube([[rRad*0.80,-48,zk],[rRad*1.38,-48,zk],collPt],17,7,hc,60,{smooth:true,heat:true});}
    if(isTurbo){
      const twin=e.turboConfig!=='single';
      const t1=R.turboZ(rRad*1.65,-24,twin?zF*0.40:12,(twin?0.82:0.98)*tSc,spin,70,{outDir:1,vgt:e.vgt,antilag:e.antilag});
      if(twin)R.turboZ(rRad*1.65,-24,zR*0.45,0.82*tSc,spin,74,{outDir:1,vgt:e.vgt});
      R.airFilterAt(t1.inPt,[t1.inPt[0]+10,t1.inPt[1],t1.inPt[2]+80],36,24,78,filt);
      R.tube([t1.outPt,[rRad*1.40,rRad*0.65,zF+26],[rRad*0.90,rRad+48,zF+28],tbPt],17,7,'#c8cedf',82,{smooth:true,couplers:true});
    }
  }
  R.applyOutlines();
}
