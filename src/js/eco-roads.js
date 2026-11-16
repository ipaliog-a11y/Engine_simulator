// ====== OPEN ROADS: point-to-point paths for vehicle challenges (build 341) ======
// Closed TRACKS loop; these do not. Centripetal Catmull-Rom with reflected end ghosts, then the same
// ds / radius / grade / kv fields the lap solver uses — open indexing, no wrap.
const ROADS={
  // ~12 km mountain pass: valley, switchback climb, crest, descent, valley straight, finish rise.
  // Authored control points (metres). timeFactor: finish within this × the car's own min-time.
  alpine:{label:'ALPINE PASS',width:8,timeFactor:1.25,open:true,
    blurb:'A mountain road: switchbacks, a crest, a long descent and a valley straight. Finish inside the time limit; burn as little fuel as you can.',
    pts:(()=>{
      const p=[];
      const add=(x,y,z)=>p.push({x,y,z});
      // Valley approach east, gentle climb
      for(let i=0;i<=8;i++)add(i*250,20*Math.sin(i*0.4),180+i*4);
      // Switchbacks climbing north (~350 m rise)
      let x=2000,y=0,z=212;
      const hair=[
        [600,400,40],[200,700,55],[-500,300,50],[200,600,45],[-450,280,48],[250,550,42],
        [-400,250,40],[300,500,38],[-350,220,36],[400,450,35]
      ];
      for(const [dx,dy,dz] of hair){
        const steps=6;
        for(let s=1;s<=steps;s++){
          const t=s/steps;
          add(x+dx*t+40*Math.sin(t*Math.PI)*Math.sign(dy||1),y+dy*t,z+dz*t);
        }
        x+=dx;y+=dy;z+=dz;
      }
      // Crest ridge west then long descent south-east
      for(let i=1;i<=6;i++)add(x-i*180,y+80+i*30,z+8-i*2);
      x-=6*180;y+=80+6*30;z+=8-12;
      for(let i=1;i<=14;i++)add(x+i*220,y-i*180,z-i*22);
      x+=14*220;y-=14*180;z-=14*22;
      // Valley straight
      for(let i=1;i<=10;i++)add(x+i*280,y+30*Math.sin(i*0.5),z+i*1.5);
      x+=10*280;y+=0;z+=15;
      // Finish climb
      for(let i=1;i<=8;i++)add(x+i*150,y+i*120,z+i*18);
      return p;
    })()}
};
const roadCache={};
// Open centripetal Catmull-Rom through control points, resampled at `step` metres along the curve.
function catmullOpen(cp,step){
  const n=cp.length,dense=[];
  if(n<2)return cp.slice();
  const ghost=(a,b)=>({x:2*a.x-b.x,y:2*a.y-b.y,z:2*(a.z||0)-(b.z||0)});
  const pts=[ghost(cp[0],cp[1]),...cp,ghost(cp[n-1],cp[n-2])];
  const lerp=(a,b,ta,tb,t)=>{const w=(tb-ta)>1e-9?(t-ta)/(tb-ta):0;return {x:a.x+(b.x-a.x)*w,y:a.y+(b.y-a.y)*w,z:(a.z||0)+((b.z||0)-(a.z||0))*w};};
  const kn=(a,b)=>Math.max(1e-6,Math.sqrt(Math.hypot(b.x-a.x,b.y-a.y)));
  for(let i=0;i<n-1;i++){
    const p0=pts[i],p1=pts[i+1],p2=pts[i+2],p3=pts[i+3];
    const t0=0,t1=t0+kn(p0,p1),t2=t1+kn(p1,p2),t3=t2+kn(p2,p3);
    const steps=Math.max(4,Math.ceil(Math.hypot(p2.x-p1.x,p2.y-p1.y)/step*4));
    for(let j=0;j<steps;j++){
      const t=t1+(t2-t1)*j/steps;
      const A1=lerp(p0,p1,t0,t1,t),A2=lerp(p1,p2,t1,t2,t),A3=lerp(p2,p3,t2,t3,t);
      const B1=lerp(A1,A2,t0,t2,t),B2=lerp(A2,A3,t1,t3,t);
      dense.push(lerp(B1,B2,t1,t2,t));
    }
  }
  dense.push({x:cp[n-1].x,y:cp[n-1].y,z:cp[n-1].z||0});
  let total=0;const cum=[0];
  for(let i=0;i<dense.length-1;i++){total+=Math.hypot(dense[i+1].x-dense[i].x,dense[i+1].y-dense[i].y);cum.push(total);}
  const N=Math.max(8,Math.round(total/step)),out=[];
  let k=0;
  for(let j=0;j<N;j++){
    const want=j*total/Math.max(1,N-1);
    while(k<cum.length-2&&cum[k+1]<want)k++;
    const a=dense[k],b=dense[Math.min(dense.length-1,k+1)],seg=cum[k+1]-cum[k],w=seg>1e-9?(want-cum[k])/seg:0;
    out.push({x:a.x+(b.x-a.x)*w,y:a.y+(b.y-a.y)*w,z:(a.z||0)+((b.z||0)-(a.z||0))*w});
  }
  return out;
}
function buildRoad(key){
  if(roadCache[key])return roadCache[key];
  const def=ROADS[key];if(!def)return null;
  const p=catmullOpen(def.pts,5),n=p.length;
  for(let i=0;i<n-1;i++)p[i].ds=Math.hypot(p[i+1].x-p[i].x,p[i+1].y-p[i].y);
  p[n-1].ds=p[n-2]?p[n-2].ds:5;
  let s=0;for(let i=0;i<n;i++){p[i].s=s;s+=i<n-1?p[i].ds:0;}
  const idx=(i)=>clamp(i,0,n-1);
  for(let i=0;i<n;i++){
    const a=p[idx(i-3)],b=p[i],c=p[idx(i+3)];
    const ab=Math.hypot(b.x-a.x,b.y-a.y),bc=Math.hypot(c.x-b.x,c.y-b.y),ca=Math.hypot(a.x-c.x,a.y-c.y);
    const area=Math.abs((b.x-a.x)*(c.y-a.y)-(c.x-a.x)*(b.y-a.y))/2;
    const k=(ab*bc*ca)>1e-6?4*area/(ab*bc*ca):0;
    p[i].r=k>1e-5?1/k:1e6;
  }
  for(let i=0;i<n;i++){
    const q=p[Math.min(n-1,i+1)],dz=(q.z||0)-(p[i].z||0);
    p[i].dz=i<n-1?dz:0;
    p[i].grade=p[i].ds>1e-6&&i<n-1?dz/p[i].ds:0;
    const gg=p[i].grade;
    p[i].sinT=gg/Math.sqrt(1+gg*gg);
    p[i].cosT=1/Math.sqrt(1+gg*gg);
    p[i].ds3=i<n-1?Math.hypot(p[i].ds,dz):0;
  }
  for(let i=0;i<n;i++){
    const a2=p[idx(i-3)],b2=p[idx(i+3)];
    let span=0;for(let k=-3;k<3;k++)span+=p[idx(i+k)].ds||0;
    const dg=(b2.grade-a2.grade)/Math.max(1e-6,span),gg=p[i].grade;
    p[i].kv=dg/Math.pow(1+gg*gg,1.5);
  }
  const W0=def.width||8;
  for(let i=0;i<n;i++){
    p[i].w=W0;p[i].hw=W0/2;
    const a=p[idx(i-1)],b=p[idx(i+1)];
    let tx=b.x-a.x,ty=b.y-a.y;const L=Math.hypot(tx,ty)||1;
    p[i].nx=-ty/L;p[i].ny=tx/L;
  }
  const xs=p.map(q=>q.x),ys=p.map(q=>q.y);
  const length=p[n-1].s;
  // Corner count without wrap (detectCorners is closed-loop).
  let corners=0;const COR=typeof CORNER_R==='number'?CORNER_R:80;
  for(let i=4;i<n-4;i++){
    let isMin=true;for(let d=-4;d<=4;d++)if(p[i+d].r<p[i].r-1e-9){isMin=false;break;}
    if(isMin&&p[i].r<COR)corners++;
  }
  const T={key,label:def.label,blurb:def.blurb,open:true,timeFactor:def.timeFactor||1.25,
    pts:p,line:p,length,corners,width:W0,wMin:W0,wMax:W0,wLabel:Math.round(W0)+' m',
    minX:Math.min(...xs),maxX:Math.max(...xs),minY:Math.min(...ys),maxY:Math.max(...ys)};
  roadCache[key]=T;return T;
}
