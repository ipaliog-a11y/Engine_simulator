// ====== SUSPENSION CALCULATOR window (build 218) ======
// Over the VEHICLE tab: one corner of the car as a quarter car, to be read and played with. It opens on the car's own
// front or rear corner, the quarterCar() the lap runs on (build 216), and every input can then be changed: the sprung
// and unsprung mass, the spring rate and its motion ratio, the damping in bound and in rebound, the tyre's rate, and
// the height of a step in the road. Nothing typed here goes back to the car: it is a calculator, and the lap, the tests
// and the car's own figures do not move.
//
// What it works out, all from the two masses and three rates (Gillespie, Fundamentals of Vehicle Dynamics, ch. 5;
// Milliken & Milliken, RCVD ch. 16; Dixon, The Shock Absorber Handbook, 2007, ch. 1 and 3):
//   · the rates at the wheel. A spring or damper whose end moves MR times the wheel's travel acts at the wheel with
//     MR^2 of its rate: the force is MR times as large and is felt over MR times the travel. The ride rate is the
//     spring and the tyre in series, ks kt / (ks + kt);
//   · the two natural frequencies, exactly: the undamped two-mass system's modes, the roots of
//     ms mu w^4 - (ms (ks + kt) + mu ks) w^2 + ks kt = 0. The textbook shortcuts are shown beside them: the body on its
//     ride rate, sqrt(kr / ms), and the wheel between the spring and the tyre, sqrt((ks + kt) / mu);
//   · the damping as a share of critical, 2 sqrt(ks ms), in bound and in rebound. The car's own figure (vehicle.zetaF)
//     is taken against the same wheel rate;
//   · the response to a road wave, frequency by frequency, of the body and the wheel (their movement over the road's).
//     A damper stiffer one way than the other is not linear, so this uses its describing function: under a sine
//     movement the force's first harmonic is the mean of the two coefficients (the bound half-cycle at cb, the rebound
//     half-cycle at cr), so (cb + cr) / 2 is the damper a road wave meets. The difference shows as a steady offset,
//     the damper's 'jacking', which a frequency response cannot show and the step can;
//   · the car driven onto a step in the road, in time, with the real damper (cb while the damper closes, cr while it
//     opens), and the tyre unable to pull on the road: its load is the static load plus kt times its squash, and never
//     below zero. Time stepped with fourth-order Runge-Kutta at 0.1 ms, a hundredth of a 100 Hz wheel hop's period.
// Left out, as in the lap's quarter car: bump stops and the end of the travel, the spring's preload and progression,
// the damper's blow-off (its force against speed is taken as straight), the tyre's own damping and its width over a
// short bump (it is a point on the road).
const SC_DT=1e-4, SC_T=2.0, SC_KEEP=20;   // s: the time step, the time the step response runs for, a sample kept every 2 ms
const SC_FMIN=0.3, SC_FMAX=40, SC_NF=240;  // Hz: the frequency response's range and its points, spaced evenly in log f
const SC_SETTLE=0.05;                       // the body has settled once it stays within 5% of the step
const sc={open:false,ax:'F',p:null,r:null,rev:-1};   // rev: the car (vehRev) the inputs were taken from
// the inputs: key, label, unit, smallest and largest accepted, step of the field, decimals shown
const SC_IN=[
  ['ms','SPRUNG MASS (kg)',5,3000,1,0],
  ['mu','UNSPRUNG MASS (kg)',1,500,0.5,1],
  ['k','SPRING RATE (N/mm)',0.5,2000,0.5,1],
  ['mr','MOTION RATIO (spring / wheel travel)',0.2,1.5,0.01,2],
  ['cb','BOUND DAMPING (N·s/m)',0,100000,10,0],
  ['cr','REBOUND DAMPING (N·s/m)',0,100000,10,0],
  ['kt','TYRE RATE (N/mm)',10,2000,1,0],
  ['step','STEP IN THE ROAD (mm)',-150,150,1,0]
];
// The car's own corner, at the wheel (motion ratio 1), and a 25 mm step: about a kerb's lip or a raised drain cover.
function scFromCar(ax){
  const q=quarterCar(vehicle,ax);
  return {ms:q.ms,mu:q.mu,k:q.ks/1000,mr:1,cb:q.cs,cr:q.cs,kt:q.kt/1000,step:25};
}
// Everything at the wheel, in SI units.
function scWheel(p){
  const m2=p.mr*p.mr;
  return {ms:p.ms,mu:p.mu,ks:p.k*1000*m2,cb:p.cb*m2,cr:p.cr*m2,kt:p.kt*1000};
}
// The undamped modes (Hz): the body's (the lower) and the wheel's.
function scModes(w){
  const a=w.ms*w.mu,b=w.ms*(w.ks+w.kt)+w.mu*w.ks,c=w.ks*w.kt,d=Math.sqrt(Math.max(0,b*b-4*a*c));
  const lo=(b-d)/(2*a),hi=(b+d)/(2*a),hz=x=>Math.sqrt(Math.max(0,x))/(2*Math.PI);
  return {body:hz(lo),hop:hz(hi)};
}
// The response at f (Hz) to a road wave of amplitude 1, with a linear damper c at the wheel: the body's and the wheel's
// movement (amplitude ratios) and the tyre's load swing (N per m of road).
function scFreq(w,c,f){
  const om=2*Math.PI*f,o2=om*om;
  // ms Zs'' = ks (Zu - Zs) + c (Zu' - Zs');  mu Zu'' = -ks (Zu - Zs) - c (Zu' - Zs') + kt (Zr - Zu)
  // as  a Zs + b Zu = 0,  b Zs + d Zu = kt Zr  with complex a, b, d
  const a=[w.ks-w.ms*o2,om*c],b=[-w.ks,-om*c],d=[w.ks+w.kt-w.mu*o2,om*c];
  const mul=(x,y)=>[x[0]*y[0]-x[1]*y[1],x[0]*y[1]+x[1]*y[0]],div=(x,y)=>{const n=y[0]*y[0]+y[1]*y[1];return [(x[0]*y[0]+x[1]*y[1])/n,(x[1]*y[0]-x[0]*y[1])/n];};
  const ad=mul(a,d),bb=mul(b,b),det=[ad[0]-bb[0],ad[1]-bb[1]];
  const zu=div([a[0]*w.kt,a[1]*w.kt],det),zs=div(mul([-b[0],-b[1]],zu),a);
  return {body:Math.hypot(zs[0],zs[1]),wheel:Math.hypot(zu[0],zu[1]),load:w.kt*Math.hypot(1-zu[0],zu[1])};
}
// The quarter car in time over a road zr(t) (m), from rest at its static height. Positions are measured from there,
// upward. Returns the samples kept and what the run did: the tyre's least and greatest load, and the time it spent in
// the air.
function scSim(w,road,T){
  const g=G,Fst=(w.ms+w.mu)*g,n=Math.round(T/SC_DT);
  let s=[0,0,0,0];   // body position, body speed, wheel position, wheel speed
  const acc=(t,x)=>{
    const vr=x[3]-x[1],c=vr>0?w.cb:w.cr;   // the damper closing (the wheel rising on the body) is bound
    const Fs=w.ks*(x[2]-x[0])+c*vr;         // what the spring and damper push the body up and the wheel down with
    const Ft=Math.max(0,Fst+w.kt*(road(t)-x[2]));   // the tyre: its static load and its squash, never pulling
    return [x[1],Fs/w.ms,x[3],(Ft-Fst-Fs)/w.mu];   // the static loads balance: (ms + mu) g = Fst
  };
  const add=(x,k,h)=>x.map((v,i)=>v+k[i]*h);
  const out={t:[],zs:[],zu:[],zr:[],ft:[],air:0,ftMin:Infinity,ftMax:0};
  for(let i=0;i<=n;i++){
    const t=i*SC_DT,Ft=Math.max(0,Fst+w.kt*(road(t)-s[2]));
    if(Ft<=0)out.air+=SC_DT;
    out.ftMin=Math.min(out.ftMin,Ft);out.ftMax=Math.max(out.ftMax,Ft);
    if(i%SC_KEEP===0){out.t.push(t);out.zs.push(s[0]);out.zu.push(s[2]);out.zr.push(road(t));out.ft.push(Ft);}
    if(i===n)break;
    const k1=acc(t,s),k2=acc(t+SC_DT/2,add(s,k1,SC_DT/2)),k3=acc(t+SC_DT/2,add(s,k2,SC_DT/2)),k4=acc(t+SC_DT,add(s,k3,SC_DT));
    s=s.map((v,j)=>v+SC_DT/6*(k1[j]+2*k2[j]+2*k3[j]+k4[j]));
  }
  out.Fst=Fst;
  return out;
}
// Everything the window shows, for inputs p.
function scCalc(p){
  const w=scWheel(p),m=scModes(w),ce=(w.cb+w.cr)/2,cc=2*Math.sqrt(w.ks*w.ms);
  const kr=w.ks*w.kt/(w.ks+w.kt);
  const r={w,modes:m,ce,kr,
    simple:{body:Math.sqrt(kr/w.ms)/(2*Math.PI),hop:Math.sqrt((w.ks+w.kt)/w.mu)/(2*Math.PI)},
    zb:w.cb/cc,zr:w.cr/cc,ze:ce/cc,zh:ce/(2*Math.sqrt((w.ks+w.kt)*w.mu))};
  r.fd=r.ze<1?m.body*Math.sqrt(1-r.ze*r.ze):0;   // the body's damped frequency: none past critical, it does not swing
  // the frequency response, and the two peaks: the body's below the point between the modes, the wheel's above it
  r.f=[];r.body=[];r.wheel=[];r.load=[];
  const fMid=Math.sqrt(m.body*m.hop);
  r.pkB={f:0,a:0};r.pkW={f:0,a:0};
  for(let i=0;i<SC_NF;i++){
    const f=SC_FMIN*Math.pow(SC_FMAX/SC_FMIN,i/(SC_NF-1)),x=scFreq(w,ce,f);
    r.f.push(f);r.body.push(x.body);r.wheel.push(x.wheel);r.load.push(x.load);
    if(f<fMid&&x.body>r.pkB.a)r.pkB={f,a:x.body};
    if(f>=fMid&&x.wheel>r.pkW.a)r.pkW={f,a:x.wheel};
  }
  // the step: up (or down) by p.step mm at t = 0
  const h=p.step/1000;
  r.sim=scSim(w,t=>t>0?h:0,SC_T);
  if(Math.abs(h)>1e-6){
    const zs=r.sim.zs,peak=zs.reduce((a,z)=>Math.max(a,z/h),-Infinity);
    r.over=Math.max(0,peak-1);
    let last=0;for(let i=0;i<zs.length;i++)if(Math.abs(zs[i]-h)>SC_SETTLE*Math.abs(h))last=r.sim.t[i];
    r.settle=last<SC_T-SC_KEEP*SC_DT?last:null;   // null: still moving at the end of the run
  }else{r.over=0;r.settle=0;}
  return r;
}
function openSuspWin(){
  const w=document.getElementById('susWin');if(!w||!vehicle||!vehicle.mass)return;
  w.hidden=false;sc.open=true;
  if(!sc.p||sc.rev!==vehRev){sc.p=scFromCar(sc.ax);sc.rev=vehRev;}   // a car changed since: start again from its corner
  buildSuspForm();renderSuspWin();
  document.getElementById('susClose').focus();
}
function closeSuspWin(){
  const w=document.getElementById('susWin');if(!w||w.hidden)return;
  w.hidden=true;sc.open=false;
  const b=document.getElementById('btnSusp');if(b)b.focus();
}
// The left column: which corner, the inputs, and the button that puts the car's own corner back.
function buildSuspForm(){
  const el=id=>document.getElementById(id);
  el('susTitle').textContent=tr('SUSPENSION CALCULATOR');
  el('susClose').setAttribute('aria-label',tr('CLOSE'));
  el('susKC').textContent=tr('CORNER');
  el('susCorner').innerHTML=['F','R'].map(a=>'<button type="button" data-ax="'+a+'" class="'+(sc.ax===a?'on':'')+'">'+esc(tr(a==='F'?'FRONT':'REAR'))+'</button>').join('');
  el('susForm').innerHTML=SC_IN.map(([k,lab,lo,hi,st,dp])=>
    '<label class="sc-row"><span>'+esc(tr(lab))+'</span><input type="number" id="sc_'+k+'" min="'+lo+'" max="'+hi+'" step="'+st+'" value="'+(+sc.p[k]).toFixed(dp)+'"></label>').join('');
  el('susReset').textContent=tr('FROM THE CAR');
}
function scReadForm(){
  for(const [k,,lo,hi] of SC_IN){const i=document.getElementById('sc_'+k);if(!i)continue;const v=parseFloat(i.value);if(isFinite(v))sc.p[k]=clamp(v,lo,hi);}
}
const SC_COL={body:'#00ccff',wheel:'#ffcc00',road:'#667',load:'#ff6b6b'};
function renderSuspWin(){
  if(!sc.open)return;
  const el=id=>document.getElementById(id),r=sc.r=scCalc(sc.p),w=r.w,f1=x=>x.toFixed(1),f2=x=>x.toFixed(2);
  el('susSub').textContent=tr(vehicle.chLabel)+' · '+tr(sc.ax==='F'?'front':'rear');
  const row=(k,v,x)=>'<div class="gg-row">'+esc(tr(k))+' <b>'+v+'</b>'+(x?' <span class="sc-dim">('+esc(tr('shortcut'))+' '+x+')</span>':'')+'</div>';
  let h='';
  h+=row('Body bounce',f2(r.modes.body)+' Hz',f2(r.simple.body)+' Hz');
  h+=row('Wheel hop',f1(r.modes.hop)+' Hz',f1(r.simple.hop)+' Hz');
  h+=row('Wheel rate',f1(w.ks/1000)+' N/mm')+row('Ride rate',f1(r.kr/1000)+' N/mm');
  h+=row('Damping, share of critical',f2(r.zb)+' '+esc(tr('bound'))+' · '+f2(r.zr)+' '+esc(tr('rebound'))+' · '+f2(r.ze)+' '+esc(tr('on a road wave')));
  h+=row('Damped body bounce',r.fd>0?f2(r.fd)+' Hz':esc(tr('none: past critical')));
  h+=row('Wheel hop damping',f2(r.zh)+' '+esc(tr('of critical')));
  h+=row('Resonance: body',(r.pkB.a>0?'×'+f2(r.pkB.a)+' '+esc(tr('at'))+' '+f2(r.pkB.f)+' Hz':'—'));
  h+=row('Resonance: wheel',(r.pkW.a>0?'×'+f2(r.pkW.a)+' '+esc(tr('at'))+' '+f1(r.pkW.f)+' Hz':'—'));
  if(Math.abs(sc.p.step)>0){
    h+=row('Over the step: body overshoot',Math.round(r.over*100)+'%')+
       row('Settles within 5%',r.settle==null?esc(tr('not within 2 s')):f2(r.settle)+' s')+
       row('Tyre load',Math.round(r.sim.ftMin/r.sim.Fst*100)+'–'+Math.round(r.sim.ftMax/r.sim.Fst*100)+'% '+esc(tr('of static')))+
       row('Wheel in the air',r.sim.air>0?Math.round(r.sim.air*1000)+' ms':esc(tr('never')));
  }
  el('susRead').innerHTML=h;
  el('susTF').textContent=tr('RESPONSE TO A ROAD WAVE: MOVEMENT OVER THE ROAD\'S');
  el('susLegF').innerHTML='<span><i style="border-color:'+SC_COL.body+'"></i>'+esc(tr('body'))+'</span><span><i style="border-color:'+SC_COL.wheel+'"></i>'+esc(tr('wheel'))+'</span>'+
    '<span><i class="d" style="border-color:#556"></i>'+esc(tr('the two natural frequencies'))+'</span>';
  el('susTS').textContent=tr('OVER A STEP IN THE ROAD (mm)');
  el('susLegS').innerHTML='<span><i style="border-color:'+SC_COL.body+'"></i>'+esc(tr('body'))+'</span><span><i style="border-color:'+SC_COL.wheel+'"></i>'+esc(tr('wheel'))+'</span>'+
    '<span><i style="border-color:'+SC_COL.road+'"></i>'+esc(tr('road'))+'</span>';
  el('susNote').textContent=tr('A calculator: it starts from the car\'s own corner, the quarter car the lap runs on, and nothing changed here goes back to the car. The rates are taken at the wheel through the motion ratio squared. A road wave meets the mean of the bound and rebound damping; the step uses each in its own direction, and the tyre cannot pull on the road. Bump stops, preload and the damper\'s blow-off are left out.');
  drawSuspFreq();drawSuspStep();
}
function drawSuspFreq(){
  const C=gwCanvas('susFreq');if(!C||!sc.r)return;const {g,W,H}=C,r=sc.r;
  const yMax=Math.max(1.5,Math.ceil(Math.max(...r.body,...r.wheel)*2)/2);
  const x0=40,x1=W-10,y0=H-26,y1=16,lf0=Math.log(SC_FMIN),lf1=Math.log(SC_FMAX);
  const px=f=>x0+(x1-x0)*(Math.log(f)-lf0)/(lf1-lf0),py=a=>y0-(y0-y1)*a/yMax;
  g.lineWidth=1;g.strokeStyle='#1e1e2c';g.fillStyle='#667';g.textAlign='center';
  for(const f of [0.5,1,2,5,10,20]){g.beginPath();g.moveTo(px(f),y0);g.lineTo(px(f),y1);g.stroke();g.fillText(String(f),px(f),y0+9);}
  const st=gwNice(yMax,5);g.textAlign='right';
  for(let a=0;a<=yMax+1e-9;a+=st){g.beginPath();g.moveTo(x0,py(a));g.lineTo(x1,py(a));g.stroke();g.fillText(a.toFixed(st<1?1:0),x0-4,py(a));}
  g.strokeStyle='#444';g.beginPath();g.moveTo(x0,y1);g.lineTo(x0,y0);g.lineTo(x1,y0);g.stroke();
  g.fillStyle='#667';g.textAlign='right';g.fillText('Hz',x1,y0+19);
  // the road's own movement, 1, and the two modes
  g.setLineDash([4,3]);g.strokeStyle='#556';
  for(const f of [r.modes.body,r.modes.hop])if(f>SC_FMIN&&f<SC_FMAX){g.beginPath();g.moveTo(px(f),y0);g.lineTo(px(f),y1);g.stroke();}
  g.beginPath();g.moveTo(x0,py(1));g.lineTo(x1,py(1));g.stroke();g.setLineDash([]);
  const line=(ys,col)=>{g.strokeStyle=col;g.lineWidth=2;g.beginPath();r.f.forEach((f,i)=>{const X=px(f),Y=py(Math.min(yMax,ys[i]));i?g.lineTo(X,Y):g.moveTo(X,Y);});g.stroke();g.lineWidth=1;};
  line(r.wheel,SC_COL.wheel);line(r.body,SC_COL.body);
  // the peaks, labelled
  g.fillStyle='#e0e0e0';g.textAlign='left';
  if(r.pkB.a>0)g.fillText(r.pkB.f.toFixed(2)+' Hz',px(r.pkB.f)+4,py(Math.min(yMax,r.pkB.a))-7);
  if(r.pkW.a>0)g.fillText(r.pkW.f.toFixed(1)+' Hz',Math.min(x1-50,px(r.pkW.f)+4),py(Math.min(yMax,r.pkW.a))-7);
}
function drawSuspStep(){
  const C=gwCanvas('susStep');if(!C||!sc.r)return;const {g,W,H}=C,s=sc.r.sim;
  const mm=a=>a*1000,all=[...s.zs,...s.zu,...s.zr].map(mm);
  let lo=Math.min(0,...all),hi=Math.max(0,...all);if(hi-lo<1){hi+=0.5;lo-=0.5;}
  const st=gwNice(hi-lo,5);lo=Math.floor(lo/st)*st;hi=Math.ceil(hi/st)*st;
  const x0=40,x1=W-10,y0=H-26,y1=16,px=t=>x0+(x1-x0)*t/SC_T,py=v=>y0-(y0-y1)*(v-lo)/(hi-lo);
  g.lineWidth=1;g.strokeStyle='#1e1e2c';g.fillStyle='#667';g.textAlign='center';
  for(let t=0;t<=SC_T+1e-9;t+=0.25){g.beginPath();g.moveTo(px(t),y0);g.lineTo(px(t),y1);g.stroke();if(Math.abs(t*2-Math.round(t*2))<1e-9)g.fillText(String(t),px(t),y0+9);}
  g.textAlign='right';
  for(let v=lo;v<=hi+1e-9;v+=st){g.beginPath();g.moveTo(x0,py(v));g.lineTo(x1,py(v));g.stroke();g.fillText(String(Math.round(v*10)/10),x0-4,py(v));}
  g.strokeStyle='#444';g.beginPath();g.moveTo(x0,y1);g.lineTo(x0,y0);g.lineTo(x1,y0);g.stroke();
  g.fillStyle='#667';g.textAlign='right';g.fillText('s',x1,y0+19);
  // the wheel in the air, shaded
  g.fillStyle='rgba(255,107,107,0.25)';
  for(let i=0;i<s.t.length;i++)if(s.ft[i]<=0)g.fillRect(px(s.t[i])-1,y1,Math.max(1,px(SC_KEEP*SC_DT)-px(0)),y0-y1);
  const line=(ys,col,w)=>{g.strokeStyle=col;g.lineWidth=w;g.beginPath();s.t.forEach((t,i)=>{const X=px(t),Y=py(mm(ys[i]));i?g.lineTo(X,Y):g.moveTo(X,Y);});g.stroke();g.lineWidth=1;};
  line(s.zr,SC_COL.road,1);line(s.zu,SC_COL.wheel,2);line(s.zs,SC_COL.body,2);
}
function wireSuspWin(){
  const b=document.getElementById('btnSusp'),w=document.getElementById('susWin');if(!b||!w)return;
  b.addEventListener('click',openSuspWin);
  document.getElementById('susClose').addEventListener('click',closeSuspWin);
  w.addEventListener('click',e=>{if(e.target===w)closeSuspWin();});
  document.getElementById('susCorner').addEventListener('click',e=>{
    const a=e.target.closest('button[data-ax]');if(!a)return;
    sc.ax=a.dataset.ax;sc.p=scFromCar(sc.ax);sc.rev=vehRev;buildSuspForm();renderSuspWin();
  });
  document.getElementById('susForm').addEventListener('input',()=>{scReadForm();renderSuspWin();});
  document.getElementById('susReset').addEventListener('click',()=>{sc.p=scFromCar(sc.ax);sc.rev=vehRev;buildSuspForm();renderSuspWin();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&sc.open)closeSuspWin();});
  window.addEventListener('resize',()=>{if(sc.open){drawSuspFreq();drawSuspStep();}});
}
