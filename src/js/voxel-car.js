// A voxel body for a real car, drawn by sprite stacking in the track's chase view (build 324, a prototype).
//
// Off unless the page is opened with ?voxel, or localStorage 'pes.voxel' is '1'. With it on, the TEST TRACK replay
// draws your car as a stack of horizontal slices instead of the flat top-down shape. The Ferrari F40 is the car it
// was made on: its colours are sampled from its picture. Any other car in CAR_DIMS gets the same shape rules in its
// class's colour; open-wheelers are left on the flat shape.
//
// Nothing here is modelled by hand. The side silhouette is the one drawCarSprite draws (carGeometry, from
// CAR_PROFILES), length, width and height are carDims's, the ride height is carGeometry's. The plan view is a
// reading, not a measurement: a rounded rectangle the car's width, and a glasshouse that narrows to 72% of it at
// the roof. The wheels are separate parts: each tyre's diameter and width (carDims), at the wheelbase and the
// tracks, so they turn with the distance driven and the fronts steer. Drawing only: no number in the sim reads this.
const VOX_M=0.07;   // m per voxel: a 4.4 m car is 63 long, one pixel each at the chase view's 14 px/m
// Colours sampled once from the car's picture (assets/cars/, 960x640): the median of a box of pixels, the rim's
// at the 80th percentile (its spokes are dark between). Boxes: door 360-540 x 390-460, bonnet top 200-300 x 380-400,
// sill 330-640 x 470-500, side glass 400-430 x 330-350, tyre 175-290 x 495-520, rim 205-265 x 440-500.
const VOX_PAL={
  'Ferrari F40 (1987)':{body:'#ad0406',top:'#c61011',low:'#a30305',glass:'#486c83',tyre:'#292b2e',rim:'#9a9590'}
};
function voxelOn(){
  try{if(/[?&]voxel\b/.test(location.search))return true;return localStorage.getItem('pes.voxel')==='1';}catch(e){return false;}
}
// The model: one canvas per layer (VOX_M high, a pixel per voxel, x from the rear bumper, y from the left side),
// and the wheels as numbers. null when the car has no body data.
function voxelCar(v){
  const name=v&&v.body&&v.body.name;
  if(!name||typeof CAR_DIMS==='undefined'||!CAR_DIMS[name])return null;
  const D=carDims({name,chassis:v.chassis,body:v.body}),G=carGeometry(v),L=G.L;
  if(L.tub||!D||!(D.len>0)||!(D.h>0))return null;
  const len=D.len,w=D.w||(Math.max(D.trackF,D.trackR)+D.tyreR.w),h=D.h,clear=G.clear,bh=h-clear;
  const col=VOX_PAL[name]||(c=>({body:c,top:shadeHex(c,0.2),low:shadeHex(c,-0.3),glass:'#1a2a3a',tyre:'#1c1c26',rim:'#9a9aaa'}))(L.col);
  // the side silhouette, as drawCarSprite's: [u, share of the body's height above the sill]
  const top=[[0,L.tail],[0.03,L.deck],[L.bk,L.deck],[L.rr,1],[L.rf,1],[L.ws,L.hood],[0.95,L.nose+0.06],[1,L.nose]];
  const topAt=u=>{for(let k=0;k+1<top.length;k++){const a=top[k],b=top[k+1];if(u>=a[0]&&u<=b[0])return a[1]+(b[1]-a[1])*(u-a[0])/Math.max(1e-6,b[0]-a[0]);}return L.nose;};
  const botAt=u=>u>0.985?0.16*(u-0.985)/0.015:u<0.015?0.18*(0.015-u)/0.015:0;
  const belt=L.belt!=null?L.belt:Math.max(L.hood,L.deck)+0.02,zBelt=clear+belt*bh;
  const wheels=[[D.ovR,D.trackR,D.tyreR,false],[D.ovR+D.wb,D.trackF,D.tyreF,true]].map(([x,t,ty,front])=>({x,t,r:ty.dia/2,tw:ty.w,rim:ty.rim/2,front}));
  const nx=Math.ceil(len/VOX_M),ny=Math.ceil(w/VOX_M),nz=Math.ceil(h/VOX_M);
  const solid=(i,j,k)=>{
    const x=(i+0.5)*VOX_M,y=w/2-(j+0.5)*VOX_M,z=(k+0.5)*VOX_M,u=x/len;
    if(z<clear+botAt(u)*bh||z>clear+topAt(u)*bh)return false;
    let hw=w/2*Math.pow(1-Math.pow(Math.abs(2*u-1),5),1/5);                // the plan: a rounded rectangle
    if(z>zBelt&&u>L.bk&&u<L.ws)hw*=1-0.28*(z-zBelt)/Math.max(0.05,h-zBelt);   // the glasshouse leans in
    if(Math.abs(y)>hw)return false;
    for(const q of wheels)                                                  // the wheel arches
      if(Math.abs(x-q.x)<q.r+0.05&&z<2*q.r+0.04&&Math.abs(y)>q.t/2-q.tw/2-0.04)return false;
    return true;
  };
  const layers=[];
  for(let k=0;k<nz;k++){
    const cv=document.createElement('canvas');cv.width=nx;cv.height=ny;
    const g=cv.getContext('2d');let any=false;
    for(let i=0;i<nx;i++)for(let j=0;j<ny;j++){
      if(!solid(i,j,k))continue;any=true;
      const u=(i+0.5)*VOX_M/len,z=(k+0.5)*VOX_M,y=w/2-(j+0.5)*VOX_M,roofTop=!solid(i,j,k+1);
      let c=roofTop?col.top:z<clear+0.30*bh?col.low:col.body;
      if(z>zBelt&&u>L.bk+0.01&&u<L.ws-0.01&&!(roofTop&&u>L.rr&&u<L.rf))c=col.glass;
      if(u>0.985&&Math.abs(y)>w*0.22&&Math.abs(z-(clear+L.nose*bh*0.7))<VOX_M*1.5)c='#fff2a8';
      if(u<0.015&&Math.abs(y)>w*0.2&&Math.abs(z-(clear+L.tail*bh*0.8))<VOX_M*1.5)c='#c41a1a';
      g.fillStyle=shadeHex(c,-0.4*(1-z/h));g.fillRect(i,j,1,1);   // lower is darker, so the sides read as sides
    }
    layers.push(any?cv:null);
  }
  return {name,len,w,h,wb:D.wb,wheels,layers,col};
}
let _voxCache=null;
function voxelCarFor(v){
  if(!voxelOn())return null;
  const key=v&&v.body?[v.body.name,v.chassis,v.suspension].join('|'):'';
  if(!_voxCache||_voxCache.key!==key)_voxCache={key,m:key?voxelCar(v):null};
  return _voxCache.m;
}
