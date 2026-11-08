// ---- RACE in 3D (build 247): the recorded race, drawn as an 8-bit world ----
// Nothing here works anything out about the race. The race is solved and recorded before the first frame (race.js),
// and this file draws that recording from a camera instead of from above. Everything it shows comes from data the
// simulator already has:
//   - the road: the circuit's own centreline, its height at every point (a GPX trace's for a real road), its width
//     there and its kerbs, the same sampled points the lap solver drives (buildTrack, kerbZones);
//   - where each car is: its distance along its own racing line, its speed and whether it is passing, read off the
//     race's 50 ms recording (raceSample), as the map reads them. A pass is drawn 2.5 m alongside, as on the map;
//   - each car's shape: wheelbase, overhangs, height and side silhouette from its profile (CAR_PROFILES, through
//     carGeometry, the same numbers the side sprite uses), its ride height, and its tyres' diameter and width;
//   - the wheels: they turn through the distance travelled over the tyre's radius, and the fronts steer to the
//     line's curvature by the kinematic angle atan(wheelbase x curvature);
//   - the body's roll: the car's own roll gradient (deg per g, from its springs, bars and roll centres, the number the
//     lap solver uses) times the lateral acceleration it is pulling, v^2 x curvature.
// Decoration, not data: the grass, the banks, the barriers and the trees beside the road (the track data has only the
// road), the sky, every colour, and the body's width, which is drawn a little narrower than the width the racing line
// keeps from the edge (track + one tyre) so that the wheels show.
//
// The picture is drawn with WebGL into a small canvas, about a third of the screen's resolution, and blown up onto the
// map canvas with smoothing off, so every pixel is a hard square. Light comes in a few bands, dithered into each
// other with a 4x4 Bayer pattern, and the shadows are a checkerboard of dark pixels: the look of 8-bit art, from a 3D
// scene. No library: the page must still open from file:// with nothing installed.
const R3D={mode:'map',gl:null,cv:null,prog:null,loc:null,failed:false,warned:false,track:null,cars:null,carsFor:null,
  unit:null,wheel:null};
const R3D_FAR=650;           // m, the far clip; the fog closes in well before it
const R3D_BANK=1.5;          // horizontal metres per metre of drop on the banks beside the road (decoration)
// ---- matrices, column-major as WebGL takes them ----
const m4={
  mul(a,b){const o=new Float32Array(16);
    for(let c=0;c<4;c++)for(let r=0;r<4;r++){let s=0;for(let k=0;k<4;k++)s+=a[k*4+r]*b[c*4+k];o[c*4+r]=s;}return o;},
  persp(fovy,asp,n,f){const t=1/Math.tan(fovy/2),o=new Float32Array(16);
    o[0]=t/asp;o[5]=t;o[10]=(f+n)/(n-f);o[11]=-1;o[14]=2*f*n/(n-f);return o;},
  look(e,c,u){
    const z=v3.norm(v3.sub(e,c)),x=v3.norm(v3.cross(u,z)),y=v3.cross(z,x),o=new Float32Array(16);
    o[0]=x[0];o[4]=x[1];o[8]=x[2];o[1]=y[0];o[5]=y[1];o[9]=y[2];o[2]=z[0];o[6]=z[1];o[10]=z[2];
    o[12]=-v3.dot(x,e);o[13]=-v3.dot(y,e);o[14]=-v3.dot(z,e);o[15]=1;return o;},
  // a frame: local x along f, y along u, z along s, origin at p
  frame(f,u,s,p){const o=new Float32Array(16);
    o[0]=f[0];o[1]=f[1];o[2]=f[2];o[4]=u[0];o[5]=u[1];o[6]=u[2];o[8]=s[0];o[9]=s[1];o[10]=s[2];
    o[12]=p[0];o[13]=p[1];o[14]=p[2];o[15]=1;return o;},
  // a turn about local z, then a move: a wheel on its axle
  wheel(x,y,z,ang,steer){const c=Math.cos(ang),s=Math.sin(ang),cs=Math.cos(steer),ss=Math.sin(steer),o=new Float32Array(16);
    // spin about z, then steer about y (a positive steer turns the wheel's front toward -z, the car's left)
    o[0]=cs*c;o[1]=s;o[2]=-ss*c;o[4]=-cs*s;o[5]=c;o[6]=ss*s;o[8]=ss;o[9]=0;o[10]=cs;
    o[12]=x;o[13]=y;o[14]=z;o[15]=1;return o;},
  scale(x,y,z){const o=new Float32Array(16);o[0]=x;o[5]=y;o[10]=z;o[15]=1;return o;},
  id(){return m4.scale(1,1,1);}
};
const v3={
  sub:(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],add:(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]],
  mul:(a,k)=>[a[0]*k,a[1]*k,a[2]*k],dot:(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],
  cross:(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],
  norm:a=>{const l=Math.hypot(a[0],a[1],a[2])||1;return [a[0]/l,a[1]/l,a[2]/l];}
};
const r3dRgb=h=>[parseInt(h.slice(1,3),16)/255,parseInt(h.slice(3,5),16)/255,parseInt(h.slice(5,7),16)/255];
// ---- a mesh: flat-shaded triangles, each vertex position, normal, colour ----
function R3dMesh(){this.a=[];}
R3dMesh.prototype={
  // ref: a point the face looks away from (the inside of a body, a point under the ground), so lighting is right
  tri(p,q,r,col,ref){
    let n=v3.norm(v3.cross(v3.sub(q,p),v3.sub(r,p)));
    if(ref){const m=[(p[0]+q[0]+r[0])/3,(p[1]+q[1]+r[1])/3,(p[2]+q[2]+r[2])/3];if(v3.dot(n,v3.sub(m,ref))<0)n=v3.mul(n,-1);}
    const c=typeof col==='string'?r3dRgb(col):col;
    for(const v of [p,q,r])this.a.push(v[0],v[1],v[2],n[0],n[1],n[2],c[0],c[1],c[2]);
  },
  quad(p,q,r,s,col,ref){this.tri(p,q,r,col,ref);this.tri(p,r,s,col,ref);},
  count(){return this.a.length/9;}
};
// ---- the GL side ----
const R3D_VS='attribute vec3 aP;attribute vec3 aN;attribute vec3 aC;uniform mat4 uVP;uniform mat4 uM;uniform vec3 uSun;uniform vec3 uEye;'+
  'varying vec3 vC;varying float vL;varying float vD;'+
  'void main(){vec4 w=uM*vec4(aP,1.0);gl_Position=uVP*w;vec3 n=normalize((uM*vec4(aN,0.0)).xyz);'+
  'vL=max(dot(n,uSun),0.0);vC=aC;vD=distance(w.xyz,uEye);}';
const R3D_FS='precision mediump float;varying vec3 vC;varying float vL;varying float vD;uniform vec3 uFog;uniform vec2 uFogR;uniform float uShadow;'+
  'float b2(vec2 a){a=floor(a);return fract(a.x/2.0+a.y*a.y*0.75);}'+
  'float b4(vec2 a){return b2(0.5*a)*0.25+b2(a);}'+
  'void main(){float th=b4(gl_FragCoord.xy);'+
  'if(uShadow>0.5){if(mod(floor(gl_FragCoord.x)+floor(gl_FragCoord.y),2.0)<0.5)discard;gl_FragColor=vec4(0.06,0.06,0.09,1.0);return;}'+
  'float l=0.58+0.42*vL;l=floor(l*5.0+th)/5.0;'+
  'float f=clamp((vD-uFogR.x)/(uFogR.y-uFogR.x),0.0,1.0);f=floor(f*4.0+th)/4.0;'+
  'gl_FragColor=vec4(mix(vC*l,uFog,f),1.0);}';
function r3dInit(){
  if(R3D.gl&&!R3D.gl.isContextLost())return true;
  if(R3D.failed)return false;
  try{
    const cv=R3D.cv||document.createElement('canvas');R3D.cv=cv;
    if(!cv.dataset.bound){cv.dataset.bound='1';
      cv.addEventListener('webglcontextlost',e=>{e.preventDefault();R3D.gl=null;},false);
      cv.addEventListener('webglcontextrestored',()=>{R3D.gl=null;},false);}
    const gl=cv.getContext('webgl',{antialias:false,preserveDrawingBuffer:true,alpha:false});
    if(!gl)throw new Error('no WebGL');
    const sh=(type,src)=>{const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);
      if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;};
    const pr=gl.createProgram();
    gl.attachShader(pr,sh(gl.VERTEX_SHADER,R3D_VS));gl.attachShader(pr,sh(gl.FRAGMENT_SHADER,R3D_FS));gl.linkProgram(pr);
    if(!gl.getProgramParameter(pr,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(pr));
    const loc={};
    for(const a of ['aP','aN','aC'])loc[a]=gl.getAttribLocation(pr,a);
    for(const u of ['uVP','uM','uSun','uEye','uFog','uFogR','uShadow'])loc[u]=gl.getUniformLocation(pr,u);
    R3D.gl=gl;R3D.prog=pr;R3D.loc=loc;R3D.track=null;R3D.cars=null;R3D.carsFor=null;R3D.unit=null;
    return true;
  }catch(err){R3D.failed=true;R3D.gl=null;return false;}
}
function r3dUpload(mesh){
  const gl=R3D.gl,b=gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(mesh.a),gl.STATIC_DRAW);
  return {b,n:mesh.count()};
}
function r3dDraw(buf,M){
  if(!buf||!buf.n)return;
  const gl=R3D.gl,L=R3D.loc;
  gl.bindBuffer(gl.ARRAY_BUFFER,buf.b);
  gl.vertexAttribPointer(L.aP,3,gl.FLOAT,false,36,0);
  gl.vertexAttribPointer(L.aN,3,gl.FLOAT,false,36,12);
  gl.vertexAttribPointer(L.aC,3,gl.FLOAT,false,36,24);
  gl.uniformMatrix4fv(L.uM,false,M);
  gl.drawArrays(gl.TRIANGLES,0,buf.n);
}
// ---- the circuit, in GL space: x east, y up, z the map's y (down the map), so the overhead view reads as the map ----
const R3D_COL={road:['#55555f','#4c4c56'],line:'#d8d8d8',kerb:['#cc2a2a','#e8e8e8'],grass:['#2f7a3a','#2a6e34'],
  bank:'#2a6430',ground:'#24572b',barrier:'#9a9aaa',trunk:'#5a3a22',leaf:['#1f5a2a','#2a7034'],sky:'#6c9fd8',skyWet:'#7a8494'};
function r3dTrackMesh(key){
  const T=buildTrack(key),c=T.pts,n=c.length,K=T.kerbs||{P:[],N:[]};
  const step=Math.max(1,Math.ceil(n/3500)),idx=[];for(let i=0;i<n;i+=step)idx.push(i);
  let zMin=Infinity;for(const q of c)zMin=Math.min(zMin,q.z||0);
  const zG=zMin-3,me=new R3dMesh(),UP=[0,1,0],DOWN=[0,-1e4,0];
  const below=p=>[p[0],p[1]-1e4,p[2]];
  // the room on each side before the ground folds back on itself inside a bend
  const side=new Array(n);
  for(let i=0;i<n;i++){
    const a=c[(i-1+n)%n],b=c[(i+1)%n],q=c[i],cr=(q.x-a.x)*(b.y-q.y)-(q.y-a.y)*(b.x-q.x),room=0.85*Math.max(1,q.r);
    side[i]={P:cr>0?room:1e9,N:cr>0?1e9:room};
  }
  const at=(i,sg,d,dh)=>{const q=c[i],nx=q.nx||0,ny=q.ny||0,lim=sg>0?side[i].P:side[i].N,dd=Math.min(d,Math.max(lim,q.hw||5));
    return [q.x+sg*nx*dd,(q.z||0)+(dh||0),q.y+sg*ny*dd];};
  const VERGE=10,BAR=0.75;
  const m=idx.length;
  for(let k=0;k<m;k++){
    const i=idx[k],j=idx[(k+1)%m],a=c[i],hwA=a.hw||5,hwB=c[j].hw||5,s=a.s||0;
    const band=(arr,len)=>arr[Math.floor(s/len)%2];
    // the road, its white edge lines
    me.quad(at(i,1,hwA),at(j,1,hwB),at(j,-1,hwB),at(i,-1,hwA),band(R3D_COL.road,8),below(at(i,1,0)));
    for(const sg of [1,-1]){
      me.quad(at(i,sg,hwA-0.15,0.01),at(j,sg,hwB-0.15,0.01),at(j,sg,hwB-0.4,0.01),at(i,sg,hwA-0.4,0.01),R3D_COL.line,below(at(i,1,0)));
      // the kerb, if this side has one here: a 0.8 m ribbon outside the edge (the FIA's width, as the line uses it)
      const kh=sg>0?K.P[i]:K.N[i];let out=0;
      if(kh){
        out=KERB_W;
        // in red and white blocks of about 1.5 m, whatever the spacing of the points
        const len=Math.hypot(c[j].x-a.x,c[j].y-a.y),nb=Math.max(1,Math.round(len/1.5)),k0=Math.round(s/1.5);
        const lerp=(p,q,u)=>[p[0]+(q[0]-p[0])*u,p[1]+(q[1]-p[1])*u,p[2]+(q[2]-p[2])*u];
        const i0=at(i,sg,hwA,0.03),j0=at(j,sg,hwB,0.03),i1=at(i,sg,hwA+KERB_W,0.03),j1=at(j,sg,hwB+KERB_W,0.03);
        for(let b=0;b<nb;b++)me.quad(lerp(i0,j0,b/nb),lerp(i0,j0,(b+1)/nb),lerp(i1,j1,(b+1)/nb),lerp(i1,j1,b/nb),
          R3D_COL.kerb[(k0+b)%2],below(at(i,1,0)));
      }
      // the verge, the barrier at its far edge, then a bank down to the ground
      const g0=hwA+out,g0b=hwB+out,v=hwA+VERGE,vb=hwB+VERGE;
      me.quad(at(i,sg,g0,-0.04),at(j,sg,g0b,-0.04),at(j,sg,vb,-0.04),at(i,sg,v,-0.04),band(R3D_COL.grass,12),below(at(i,1,0)));
      me.quad(at(i,sg,v,-0.04),at(j,sg,vb,-0.04),at(j,sg,vb,BAR),at(i,sg,v,BAR),R3D_COL.barrier,at(i,sg,0));
      const dA=Math.min(30,((a.z||0)-zG)*R3D_BANK),dB=Math.min(30,((c[j].z||0)-zG)*R3D_BANK);
      const bA=at(i,sg,v+dA,-dA/R3D_BANK),bB=at(j,sg,vb+dB,-dB/R3D_BANK);
      me.quad(at(i,sg,v,-0.04),at(j,sg,vb,-0.04),bB,bA,R3D_COL.bank,below(at(i,sg,v)));
      // where the bank stops short of the ground, a face straight down to it
      if(bA[1]>zG+0.1||bB[1]>zG+0.1)me.quad(bA,bB,[bB[0],zG,bB[2]],[bA[0],zG,bA[2]],R3D_COL.bank,at(i,sg,0));
    }
  }
  // the start line: a chequer across the road
  {const q=c[0],nx=q.nx||0,ny=q.ny||0,hw=q.hw||5,tx=-ny,ty=nx,cells=8;
    for(let r=0;r<2;r++)for(let k=0;k<cells;k++){
      const d0=-hw+2*hw*k/cells,d1=-hw+2*hw*(k+1)/cells,l0=r*0.8,l1=(r+1)*0.8;
      const P=(d,l)=>[q.x+nx*d+tx*l,(q.z||0)+0.02,q.y+ny*d+ty*l];
      me.quad(P(d0,l0),P(d1,l0),P(d1,l1),P(d0,l1),(k+r)%2?'#111118':'#eeeeee',below(P(0,0)));
    }}
  // the ground under it all
  {const pad=2500,x0=T.minX-pad,x1=T.maxX+pad,y0=T.minY-pad,y1=T.maxY+pad;
    me.quad([x0,zG,y0],[x1,zG,y0],[x1,zG,y1],[x0,zG,y1],R3D_COL.ground,[0,zG-10,0]);}
  // trees, beyond the barriers: placed by a seeded draw, kept clear of every stretch of road
  {const rnd=mulberry32(Array.from(key).reduce((h,ch)=>(h*31+ch.charCodeAt(0))|0,7)),cell=30,grid=new Map();
    for(let i=0;i<n;i++){const q=c[i],g=Math.floor(q.x/cell)+','+Math.floor(q.y/cell);if(!grid.has(g))grid.set(g,[]);grid.get(g).push(q);}
    const clear=(x,y)=>{const gx=Math.floor(x/cell),gy=Math.floor(y/cell);
      for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++){const L=grid.get((gx+a)+','+(gy+b));if(!L)continue;
        for(const q of L)if(Math.hypot(q.x-x,q.y-y)<(q.hw||5)+VERGE+2)return false;}return true;};
    const every=Math.max(1,Math.round(18/Math.max(0.5,(T.length||1000)/n)));
    for(let i=0;i<n;i+=every)for(const sg of [1,-1]){
      if(rnd()>0.55)continue;
      const q=c[i],off=(q.hw||5)+VERGE+3+rnd()*22,lim=sg>0?side[i].P:side[i].N;
      if(off>lim)continue;
      const x=q.x+sg*(q.nx||0)*off,y=q.y+sg*(q.ny||0)*off;
      if(!clear(x,y))continue;
      const drop=Math.min(Math.min(30,((q.z||0)-zG)*R3D_BANK),Math.max(0,off-(q.hw||5)-VERGE))/R3D_BANK;
      r3dTree(me,x,Math.max(zG,(q.z||0)-0.04-drop),y,3+rnd()*3,rnd()<0.5?0:1);
    }}
  return {key,mesh:me,zG,T};
}
function r3dTree(me,x,y,z,h,shade){
  const ctr=[x,y+h*0.5,z],tw=0.25;
  const box=(x0,x1,y0,y1,z0,z1,col)=>{
    me.quad([x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],col,ctr);me.quad([x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1],col,ctr);
    me.quad([x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0],col,ctr);me.quad([x1,y0,z0],[x1,y0,z1],[x1,y1,z1],[x1,y1,z0],col,ctr);};
  box(x-tw,x+tw,y,y+h*0.35,z-tw,z+tw,R3D_COL.trunk);
  // two four-sided cones
  for(const [b,top,r] of [[0.3,0.75,0.42],[0.6,1,0.3]]){
    const yb=y+h*b,yt=y+h*top,R=h*r,apex=[x,yt,z],ring=[[x-R,yb,z],[x,yb,z-R],[x+R,yb,z],[x,yb,z+R]];
    for(let k=0;k<4;k++)me.tri(ring[k],ring[(k+1)%4],apex,R3D_COL.leaf[(k+shade)%2],[x,yb-1,z]);
  }
}
// ---- a car, in its own frame: x forward from the middle of the wheelbase, y up from the road, z to its right ----
function r3dCarLook(v,M,col){
  const vv=Object.assign({},DEFAULT_VEHICLE||{},v||{});
  const G=carGeometry(vv),L=G.L,wb=M&&M.wb>0?M.wb:G.wb,lenM=wb*(1+L.ovF+L.ovR);
  const tw=(vv.tireWidth||225)/1000,track=M&&M.track>0?M.track:1.55;
  const hwB=track/2+tw*0.2;                       // drawn inside the line's width so the wheels show (see the top)
  const clear=G.clear,h=Math.max(L.h,clear+0.3);
  const X=u=>-wb/2-L.ovR*wb+u*lenM,Y=f=>clear+f*(h-clear);
  const me=new R3dMesh(),inC=[0,(clear+h)/2,0],body=col,hi=shadeHex(col,0.25),glass='#1a2a3a';
  const belt=L.belt!=null?L.belt:Math.max(L.hood,L.deck)+0.02;
  if(L.tub){
    const top=[[0,0.20],[0.05,0.40],[0.96,0.34],[1,Math.min(0.26,L.nose)]],hw=track*0.22;
    r3dExtrude(me,top,X,Y,()=>hw,()=>body,inC,clear);
    // the hoop over the driver
    const x0=X(L.rr),x1=X(L.rf),y0=Y(0.38),y1=Y(0.96),w=0.12;
    r3dBox(me,x0,x0+0.12,y0,y1,-w,w,hi,inC);r3dBox(me,x0,x1,y1-0.1,y1,-w,w,hi,inC);
  }else{
    const raw=[[0,L.tail],[0.03,L.deck],[L.bk,L.deck],[L.rr,1],[L.rf,1],[L.ws,L.hood],[0.95,L.nose+0.06],[1,L.nose]];
    const top=[];for(const p of raw){const u=Math.max(p[0],top.length?top[top.length-1][0]:0);top.push([u,p[1]]);}
    const hwAt=f=>f>belt?hwB*(1-0.22*(f-belt)/Math.max(0.05,1-belt)):hwB;
    const cabin=u=>u>L.bk+0.005&&u<L.ws-0.005;
    const topCol=(ua,ub)=>{const um=(ua+ub)/2;
      if(um>L.rf&&um<L.ws)return glass;          // the windscreen
      if(um>L.bk&&um<L.rr)return glass;          // the back window
      if(um>=L.rr&&um<=L.rf)return hi;           // the roof
      return body;};
    r3dExtrude(me,top,X,Y,hwAt,topCol,inC,clear,belt,cabin,glass);
    // lamps on the nose and the tail
    const yl=Y(Math.max(0.2,L.nose-0.12)),yt=Y(Math.max(0.2,L.tail-0.12)),xf=X(1)+0.01,xr=X(0)-0.01;
    for(const sg of [1,-1]){
      const z0=sg*hwB*0.55,z1=sg*hwB*0.9;
      me.quad([xf,yl-0.06,z0],[xf,yl-0.06,z1],[xf,yl+0.06,z1],[xf,yl+0.06,z0],'#ffeeaa',[0,yl,0]);
      me.quad([xr,yt-0.06,z0],[xr,yt-0.06,z1],[xr,yt+0.06,z1],[xr,yt+0.06,z0],'#ff3344',[0,yt,0]);
    }
  }
  // a rear wing, when one is fitted
  if(vv.aeroRear==='wing'){
    const xw0=X(0.01),xw1=X(0.11),yw=Y(L.tub?0.9:Math.max(L.deck,L.tail)+0.28),w=hwB*0.95;
    me.quad([xw0,yw,-w],[xw1,yw,-w],[xw1,yw,w],[xw0,yw,w],shadeHex(col,-0.3),[0,yw-1,0]);
    for(const sg of [1,-1])r3dBox(me,xw0+0.03,xw0+0.08,Y(L.tub?0.4:L.deck),yw,sg*w*0.5-0.03,sg*w*0.5+0.03,'#333344',inC);
  }
  const rT=G.rTyre,rim=Math.max(0.3,Math.min(0.85,G.rimFrac||0.7));
  return {mesh:me,wheel:r3dWheelMesh(rT,tw,rim),wb,track,rT,len:lenM,hw:hwB};
}
// The silhouette extruded across the car: two sides, a top, a nose and a tail.
function r3dExtrude(me,top,X,Y,hwAt,topCol,inC,clear,belt,cabin,glass){
  const yb=clear;
  for(let k=0;k+1<top.length;k++){
    const [ua,fa]=top[k],[ub,fb]=top[k+1];if(ub-ua<1e-4)continue;
    const xa=X(ua),xb=X(ub),ya=Y(fa),yb2=Y(fb),wa=hwAt(fa),wbb=hwAt(fb),col=topCol(ua,ub);
    for(const sg of [1,-1]){
      if(belt!=null&&cabin&&cabin((ua+ub)/2)&&fa>belt&&fb>belt){
        const yB=Y(belt),w0=hwAt(belt);
        me.quad([xa,yb,sg*w0],[xb,yb,sg*w0],[xb,yB,sg*w0],[xa,yB,sg*w0],topCol(0,0),inC);
        me.quad([xa,yB,sg*w0],[xb,yB,sg*w0],[xb,yb2,sg*wbb],[xa,ya,sg*wa],glass,inC);
      }else me.quad([xa,yb,sg*wa],[xb,yb,sg*wbb],[xb,yb2,sg*wbb],[xa,ya,sg*wa],topCol(0,0),inC);
    }
    me.quad([xa,ya,-wa],[xb,yb2,-wbb],[xb,yb2,wbb],[xa,ya,wa],col,inC);
  }
  const f0=top[0],f1=top[top.length-1];
  const w0=hwAt(f0[1]),w1=hwAt(f1[1]),c0=topCol(0,0);
  me.quad([X(f0[0]),yb,-w0],[X(f0[0]),yb,w0],[X(f0[0]),Y(f0[1]),w0],[X(f0[0]),Y(f0[1]),-w0],c0,inC);
  me.quad([X(f1[0]),yb,-w1],[X(f1[0]),yb,w1],[X(f1[0]),Y(f1[1]),w1],[X(f1[0]),Y(f1[1]),-w1],c0,inC);
  me.quad([X(f0[0]),yb,-w0],[X(f1[0]),yb,-w1],[X(f1[0]),yb,w1],[X(f0[0]),yb,w0],'#15151c',inC);
}
function r3dBox(me,x0,x1,y0,y1,z0,z1,col,ref){
  me.quad([x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],col,ref);me.quad([x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1],col,ref);
  me.quad([x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0],col,ref);me.quad([x1,y0,z0],[x1,y0,z1],[x1,y1,z1],[x1,y1,z0],col,ref);
  me.quad([x0,y1,z0],[x1,y1,z0],[x1,y1,z1],[x0,y1,z1],col,ref);
}
// A wheel about its own axle (local z): an eight-sided tyre, and a rim in two shades so it is seen to turn.
function r3dWheelMesh(r,w,rimFrac){
  const me=new R3dMesh(),N=8,hz=w/2,ri=r*rimFrac,ctr=[0,0,0];
  const P=(k,rad,z)=>{const a=2*Math.PI*k/N;return [Math.cos(a)*rad,Math.sin(a)*rad,z];};
  for(let k=0;k<N;k++){
    me.quad(P(k,r,-hz),P(k+1,r,-hz),P(k+1,r,hz),P(k,r,hz),'#1c1c22',ctr);
    for(const z of [-hz,hz]){
      me.quad(P(k,ri,z),P(k+1,ri,z),P(k+1,r,z),P(k,r,z),'#26262e',[0,0,0]);
      me.tri([0,0,z],P(k,ri,z),P(k+1,ri,z),k%2?'#a4a4b4':'#6a6a7a',[0,0,0]);
    }
  }
  return me;
}
// ---- along a car's line ----
function r3dLineAt(M,T,pos){
  const n=M.n,i=((Math.floor(pos)%n)+n)%n,j=(i+1)%n,f=pos-Math.floor(pos),a=M.line[i],b=M.line[j];
  const za=T.pts[i]?T.pts[i].z||0:0,zb=T.pts[j]?T.pts[j].z||0:0;
  return {x:a.x+(b.x-a.x)*f,y:a.y+(b.y-a.y)*f,z:za+(zb-za)*f,i,f};
}
// the line point s metres along from position pos (negative: behind)
function r3dAlong(M,pos,s){
  const n=M.n,i=((Math.floor(pos)%n)+n)%n,f=pos-Math.floor(pos);
  let d=M.cum[i]+(M.cum[i+1]-M.cum[i])*f+s;d=((d%M.L3)+M.L3)%M.L3;
  let lo=0,hi=n;while(hi-lo>1){const mid=(lo+hi)>>1;if(M.cum[mid]<=d)lo=mid;else hi=mid;}
  return lo+(d-M.cum[lo])/Math.max(1e-6,M.cum[lo+1]-M.cum[lo]);
}
// ---- the view ----
function race3dOn(){return R3D.mode==='chase'||R3D.mode==='top';}
function r3dCars(R){
  if(R3D.carsFor===R&&R3D.cars)return R3D.cars;
  R3D.cars=R.cars.map(c=>{
    const e=raceUI.entrants[c.id],v=e&&e.build&&e.build.vehicle;
    let rg=0;
    // the car's own roll gradient (deg per g), from the build the race was solved with
    try{if(e&&e.build)rg=withBuild(e.build,()=>vehicle.rollGrad||0);}catch(err){rg=0;}
    const look=r3dCarLook(v,c.M,RACE_COLS[c.id]);
    return {body:r3dUpload(look.mesh),wheel:r3dUpload(look.wheel),look,rollGrad:isFinite(rg)?rg:0};
  });
  R3D.carsFor=R;
  return R3D.cars;
}
// Where a car is and how it sits: its frame for the body, and its frame for the wheels (which do not roll).
function r3dCarPose(R,T,x,t){
  const c=x.c,M=c.M,s=x.s,A=r3dLineAt(M,T,s.pos),ahead=r3dLineAt(M,T,r3dAlong(M,s.pos,2)),back=r3dLineAt(M,T,r3dAlong(M,s.pos,-2));
  let f=v3.norm([ahead.x-back.x,ahead.z-back.z,ahead.y-back.y]);
  const up0=[0,1,0],sd=v3.norm(v3.cross(f,up0)),up=v3.cross(sd,f);
  let p=[A.x,A.z,A.y];
  if(s.pass>0.5)p=v3.add(p,v3.mul(sd,-2.5));                  // alongside, as the map draws a pass
  // curvature of the line here, signed toward the car's right (sd)
  const kap=M.kap?M.kap[A.i]:0;
  const mid=[(ahead.x+back.x)/2,(ahead.z+back.z)/2,(ahead.y+back.y)/2],bend=v3.sub([A.x,A.z,A.y],mid);
  const toRight=v3.dot(bend,sd)<0?1:-1;                         // the centre of the turn is opposite the bulge
  const ay=s.v*s.v*Math.abs(kap);                                // m/s2, pulled toward the centre of the turn
  const roll=clamp((x.rg||0)*ay/9.81,-8,8)*Math.PI/180;
  // the body leans away from the centre of the turn
  const lean=-toRight*roll,cr=Math.cos(lean),sr=Math.sin(lean);
  const upB=v3.add(v3.mul(up,cr),v3.mul(sd,sr)),sdB=v3.cross(f,upB);
  return {p,f,up,sd,body:m4.frame(f,upB,sdB,p),base:m4.frame(f,up,sd,p),steer:Math.atan(M.wb*Math.abs(kap))*toRight,dist:s.sTot};
}
function r3dVP(R,T,S,asp){
  // follow the chosen car, or the leader
  const k=raceUI.follow>=0?R.cars.findIndex(c=>c.id===raceUI.follow):-1,x=k>=0?S.find(y=>y.k===k):S[0];
  const M=x.c.M,s=x.s,car=r3dLineAt(M,T,s.pos),P=[car.x,car.z,car.y];
  let eye,at,fov,fog;
  if(R3D.mode==='chase'){
    const b=r3dLineAt(M,T,r3dAlong(M,s.pos,-8.5)),a=r3dLineAt(M,T,r3dAlong(M,s.pos,6));
    eye=[b.x,b.z+2.6,b.y];at=[a.x,a.z+0.9,a.y];fov=55;fog=[110,380];
  }else{
    eye=[P[0],P[1]+24,P[2]+22];at=[P[0],P[1]+0.5,P[2]];fov=32;fog=[70,190];   // fixed to the map's north, as a top-down game's camera
  }
  return {VP:m4.mul(m4.persp(fov*Math.PI/180,asp,0.5,R3D_FAR),m4.look(eye,at,[0,1,0])),eye,fog,x};
}
// Draw the race at time t into the region (x0,y0,w,h) of the map canvas. False when the 3D view is off or cannot
// run (no WebGL), and the map draws instead.
function race3dDraw(R,t,S,x0,y0,w,h){
  if(!race3dOn())return false;
  if(!r3dInit()){r3dGiveUp();return false;}
  const gl=R3D.gl,L=R3D.loc;
  const pw=clamp(Math.round(w/2.5),160,440),ph=Math.max(90,Math.round(pw*h/w));
  if(R3D.cv.width!==pw||R3D.cv.height!==ph){R3D.cv.width=pw;R3D.cv.height=ph;}
  if(!R3D.track||R3D.track.key!==R.cfg.track){
    const tm=r3dTrackMesh(R.cfg.track);R3D.track={key:tm.key,buf:r3dUpload(tm.mesh),zG:tm.zG,T:tm.T};
  }
  if(!R3D.unit){const u=new R3dMesh();u.quad([-0.5,0,-0.5],[0.5,0,-0.5],[0.5,0,0.5],[-0.5,0,0.5],'#000000',[0,-1,0]);R3D.unit=r3dUpload(u);}
  const T=R3D.track.T,cars=r3dCars(R);
  const wet=clamp((S[0].s.wet||0)/RACE.wetFull,0,1),sky=r3dRgb(R3D_COL.sky),skyW=r3dRgb(R3D_COL.skyWet);
  const fogC=sky.map((v,i)=>v+(skyW[i]-v)*wet);
  const V=r3dVP(R,T,S,pw/ph);
  gl.viewport(0,0,pw,ph);gl.clearColor(fogC[0],fogC[1],fogC[2],1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.useProgram(R3D.prog);
  for(const a of ['aP','aN','aC'])gl.enableVertexAttribArray(L[a]);
  gl.uniformMatrix4fv(L.uVP,false,V.VP);gl.uniform3fv(L.uSun,v3.norm([0.4,0.85,0.3]));gl.uniform3fv(L.uEye,V.eye);
  const near=V.fog[0]*(1-0.45*wet),far=V.fog[1]*(1-0.35*wet);
  gl.uniform3fv(L.uFog,fogC);gl.uniform2f(L.uFogR,near,far);gl.uniform1f(L.uShadow,0);
  r3dDraw(R3D.track.buf,m4.id());
  const drawn=[];
  for(const x of S){
    if(raceParked(x,t))continue;
    const C=cars[x.k];if(!C)continue;
    const P=r3dCarPose(R,T,Object.assign({rg:C.rollGrad},x),t),lk=C.look;
    // the shadow: a chequer of dark pixels on the road under the car
    gl.uniform1f(L.uShadow,1);
    r3dDraw(R3D.unit,m4.mul(P.base,m4.mul(m4.frame([1,0,0],[0,1,0],[0,0,1],[0,0.05,0]),m4.scale(lk.len*1.04,1,lk.hw*2.3))));
    gl.uniform1f(L.uShadow,0);
    r3dDraw(C.body,P.body);
    const spin=-(P.dist||0)/Math.max(0.1,lk.rT);
    for(const ax of [1,-1])for(const sg of [1,-1])
      r3dDraw(C.wheel,m4.mul(P.base,m4.wheel(ax*lk.wb/2,lk.rT,sg*lk.track/2,spin,ax>0?-P.steer:0)));
    drawn.push({x,p:P.p});
  }
  // onto the map canvas, every pixel a hard square
  const sm=ctx.imageSmoothingEnabled;ctx.imageSmoothingEnabled=false;
  ctx.drawImage(R3D.cv,x0,y0,w,h);ctx.imageSmoothingEnabled=sm;
  // the position over each car, and what the camera is following
  ctx.font='6px "Press Start 2P"';ctx.textAlign='center';
  for(const d of drawn){
    const q=r3dProject(V.VP,[d.p[0],d.p[1]+2.2,d.p[2]]);if(!q)continue;
    const sx=x0+(q[0]*0.5+0.5)*w,sy=y0+(0.5-q[1]*0.5)*h;
    if(sx<x0||sx>x0+w||sy<y0||sy>y0+h)continue;
    ctx.fillStyle='rgba(10,10,18,0.75)';ctx.fillRect(sx-8,sy-8,16,10);
    ctx.fillStyle=RACE_COLS[d.x.c.id];ctx.fillText(String(d.x.pos),sx,sy);
  }
  ctx.textAlign='left';
  const f=V.x,nm=f.c.M.name.length>22?f.c.M.name.slice(0,21)+'…':f.c.M.name;
  const txt='P'+f.pos+' '+nm+'  '+Math.round(f.s.v*3.6)+' km/h';
  ctx.font='7px "Press Start 2P"';const tw=ctx.measureText(txt).width;
  ctx.fillStyle='rgba(10,10,18,0.8)';ctx.fillRect(x0+6,y0+h-20,tw+16,14);
  ctx.fillStyle=RACE_COLS[f.c.id];ctx.fillRect(x0+10,y0+h-16,6,6);
  ctx.fillStyle='#eee';ctx.fillText(txt,x0+20,y0+h-10);
  return true;
}
function r3dProject(VP,p){
  const x=VP[0]*p[0]+VP[4]*p[1]+VP[8]*p[2]+VP[12],y=VP[1]*p[0]+VP[5]*p[1]+VP[9]*p[2]+VP[13],w=VP[3]*p[0]+VP[7]*p[1]+VP[11]*p[2]+VP[15];
  return w>0.1?[x/w,y/w]:null;
}
// No WebGL here: say so once, and go back to the map.
function r3dGiveUp(){
  R3D.mode='map';
  const sel=document.getElementById('raceView');if(sel)sel.value='map';
  if(!R3D.warned){R3D.warned=true;flash(tr('3D needs WebGL, which this browser has turned off: showing the map'),'warn');}
}
function race3dSetMode(m){
  R3D.mode=m==='chase'||m==='top'?m:'map';
  try{localStorage.setItem('pes.raceView',R3D.mode);}catch(e){}
  const sel=document.getElementById('raceView');if(sel&&sel.value!==R3D.mode)sel.value=R3D.mode;
}
function race3dBind(){
  let m='map';try{m=localStorage.getItem('pes.raceView')||'map';}catch(e){}
  race3dSetMode(m);
  const sel=document.getElementById('raceView');
  if(sel)sel.addEventListener('change',()=>race3dSetMode(sel.value));
}
