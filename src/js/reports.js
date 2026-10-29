// ====== DYNO REPORT: a printable sheet laid out like a real dynamometer print-out ======
// Rendered onto an offscreen A4 canvas at print resolution (white paper, dark ink — not the
// app's dark theme, because this is meant to be printed and shared), then exported as PNG or
// wrapped in a minimal one-page PDF. Everything is drawn with the Canvas 2D API already in use;
// no libraries, so it still works completely offline.
const RPT={W:1240,H:1754,ink:'#111',rule:'#c8c8d0',faint:'#eceef2',hp:'#c1121f',tq:'#1d4e89',accent:'#0a0a14'};
// The engine spec, as label/value pairs — the block a real sheet prints under the graph.
function reportSpecRows(){
  const e=engine,d=e.displacement_L;
  const unit=e.type==='rotary'?e.cylinders+'-ROTOR':e.cylinders+'-CYL '+(LAYOUT_LABEL[e.layout]||'');
  let ind;
  const ic=e.intercooler==='none'?', no intercooler':', '+(e.intercooler==='large'?'large':'small')+' intercooler';
  if(e.intake==='na')ind='Naturally aspirated';
  else if(e.intake==='turbo')ind=(TURBO_CONFIG[e.turboConfig]||{label:''}).label+' turbo, '+e.turboSize+' frame @ '+e.boost_bar.toFixed(2)+' bar'+ic+(e.vgt?', variable geometry':'')+(e.antilag?', anti-lag':'');
  else ind=(SC_TYPE[e.scType]||{label:''}).label+' supercharger @ '+e.boost_bar.toFixed(2)+' bar'+ic;
  if(e.nitrous&&e.nitrous!=='none')ind+=' + '+(e.nitrous==='large'?'large':'small')+' nitrous shot';
  const rows=[
    ['Engine type',(ENGINE_TYPE[e.type]||{label:e.type}).label||e.type],
    ['Configuration',unit],
    ['Displacement',(d<1?d.toFixed(3):d.toFixed(2))+' L ('+Math.round(d*1000)+' cc)'],
    ['Bore × stroke',e.bore_mm.toFixed(1)+' × '+e.stroke_mm.toFixed(1)+' mm'],
    ['Compression ratio',e.compression.toFixed(1)+' : 1'],
    ['Rev limit',e.redline+' rpm'],
    ['Induction',ind],
    ['Metering',(INTAKE_SYS[e.intakeSys]||{label:e.intakeSys}).label+', '+e.airFilter+' filter'],
    ['Valvetrain',e.ports?'Port induction (no poppet valves)':(e.cam+' cam'+(e.vvt?' + VVT':''))],
    ['Fuel',(FUELS[e.fuel]||{label:e.fuel}).label+(e.fuel==='gasoline'?' — '+e.octane+' RON':'')],
    ['Injection',e.injector==='direct'?'Direct injection':'Port injection'],
    ['Ignition',e.ci?'Compression ignition':(e.timingMode==='auto'?'ECU mapped, knock-limited':e.ignitionAdv+'° BTDC fixed')+' — '+e.ignitionType],
    ['Mixture',e.afrMode==='auto'?'ECU fuel map (load × rpm)'+(fuelMapCustom?', hand-tuned':''):'Fixed '+state.afr.toFixed(1)+' : 1'],
    ['Exhaust',e.exhaust+(e.cat&&e.cat!=='none'?', '+e.cat+' catalyst':', no catalyst')],
    ['Cooling',e.radiator+' radiator, '+e.fan+' fan'+(e.oilCooler?', oil cooler':'')+', '+e.thermostat+'°C stat'],
    ['Charging',e.altMaxA+' A alternator'],
    ['Est. installed mass',engineMass()+' kg']
  ];
  return rows;
}
// The measurement conditions block — the equivalent of a real sheet's correction/ambient box.
function reportCondRows(){
  const s=engine.score||{};
  return [
    ['Intake air temp',Math.round(state.iat)+' °C'],
    ['Coolant / oil',Math.round(state.coolant)+' / '+Math.round(state.oil)+' °C'],
    ['Mixture at run',engine.afrMode==='auto'?'ECU map':state.afr.toFixed(1)+' : 1 AFR'],
    // The graph is the run as tuned right now; the scorecard evaluates the design at its
    // best-power mixture. Printing both stops the two numbers looking like a contradiction.
    ['Design potential',(s.peakHP||0)+' hp @ '+(s.peakHPrpm||0)+' rpm (best-power AFR)'],
    ['Specific output',(s.hpPerL||0)+' hp/L'],
    ['Thermal efficiency',(s.thEff||0)+' %'],
    ['Powerband (≥80 % peak)',(s.band||0)+' rpm wide'],
    ['Design grade',(s.grade||'—')+' ('+(s.overall||0)+'/100)'],
    ['Correction','None applied — simulated STD conditions']
  ];
}
function dynoReportCanvas(scale){
  scale=scale||2;
  const W=RPT.W,H=RPT.H;
  const cv=document.createElement('canvas');cv.width=Math.round(W*scale);cv.height=Math.round(H*scale);
  const g=cv.getContext('2d');g.scale(scale,scale);
  g.textBaseline='alphabetic';
  const px=n=>n+'px "Press Start 2P"';        // pixel face for headings — the app's identity
  const sans=(n,b)=>(b?'bold ':'')+n+'px ui-sans-serif,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif';
  // Paper
  g.fillStyle='#fff';g.fillRect(0,0,W,H);
  // ---- Header band ----
  g.fillStyle=RPT.accent;g.fillRect(0,0,W,96);
  g.fillStyle='#ffcc00';g.font=px(20);g.fillText('PIXEL ENGINE SIM',40,44);
  g.fillStyle='#fff';g.font=px(11);g.fillText('DYNAMOMETER REPORT',40,72);
  const now=new Date();
  g.fillStyle='#9aa';g.font=sans(13);
  const stamp=now.toISOString().slice(0,10)+'  '+now.toTimeString().slice(0,5);
  g.textAlign='right';g.fillText(stamp,W-40,44);
  g.fillText('SIMULATED RUN — NOT A MEASUREMENT',W-40,68);
  g.textAlign='left';
  // ---- Engine title ----
  const name=engine.name||((engine.displacement_L<1?engine.displacement_L.toFixed(2):engine.displacement_L.toFixed(1))+'L '+(engine.type==='rotary'?engine.cylinders+'-rotor':engine.cylinders+'-cyl'));
  g.fillStyle=RPT.ink;g.font=sans(30,true);g.fillText(name,40,142);
  g.fillStyle='#667';g.font=sans(15);
  g.fillText(reportSpecRows()[1][1]+'  •  '+reportSpecRows()[2][1]+'  •  '+reportSpecRows()[6][1],40,168);
  // ---- Chart ----
  const data=getDynoData();
  const gX=96,gY=210,gW=W-96-96,gH=560;
  let maxT=0,maxP=0,pkT={r:0,v:0},pkP={r:0,v:0};
  data.forEach(p=>{if(p.torque>maxT){maxT=p.torque;pkT={r:p.rpm,v:p.torque};}if(p.powerHP>maxP){maxP=p.powerHP;pkP={r:p.rpm,v:p.powerHP};}});
  dynoPulls.forEach(pl=>pl.pts.forEach(p=>{maxT=Math.max(maxT,p.torque);maxP=Math.max(maxP,p.powerHP);}));
  const niceMax=v=>{const s=Math.pow(10,Math.floor(Math.log10(v)));return Math.ceil(v/(s/2))*(s/2);};
  maxP=niceMax(Math.max(maxP*1.12,20));maxT=niceMax(Math.max(maxT*1.12,20));
  const r0=1000,r1=engine.redline;
  const X=r=>gX+(r-r0)/(r1-r0)*gW, YP=v=>gY+gH-v/maxP*gH, YT=v=>gY+gH-v/maxT*gH;
  // grid
  g.strokeStyle=RPT.faint;g.lineWidth=1;
  const rStep=r1-r0>9000?2000:(r1-r0>4500?1000:500);
  g.font=sans(12);g.textAlign='center';
  for(let r=Math.ceil(r0/rStep)*rStep;r<=r1;r+=rStep){
    g.beginPath();g.moveTo(X(r),gY);g.lineTo(X(r),gY+gH);g.stroke();
    g.fillStyle='#667';g.fillText(r>=1000?(r/1000)+'k':r,X(r),gY+gH+22);
  }
  for(let i=1;i<=5;i++){const y=gY+gH-i/5*gH;
    g.beginPath();g.moveTo(gX,y);g.lineTo(gX+gW,y);g.stroke();
    g.textAlign='right';g.fillStyle=RPT.hp;g.fillText(Math.round(maxP*i/5),gX-10,y+4);
    g.textAlign='left';g.fillStyle=RPT.tq;g.fillText(Math.round(maxT*i/5),gX+gW+10,y+4);
  }
  g.strokeStyle=RPT.rule;g.lineWidth=2;g.strokeRect(gX,gY,gW,gH);
  // previously logged pulls, faded, for comparison
  dynoPulls.forEach(pl=>{
    g.strokeStyle=pl.color;g.globalAlpha=0.30;g.lineWidth=2;
    g.beginPath();pl.pts.forEach((p,i)=>i?g.lineTo(X(p.rpm),YP(p.powerHP)):g.moveTo(X(p.rpm),YP(p.powerHP)));g.stroke();
    g.beginPath();pl.pts.forEach((p,i)=>i?g.lineTo(X(p.rpm),YT(p.torque)):g.moveTo(X(p.rpm),YT(p.torque)));g.stroke();
    g.globalAlpha=1;
  });
  // this run
  g.lineWidth=3.5;g.lineJoin='round';
  g.strokeStyle=RPT.tq;g.beginPath();data.forEach((p,i)=>i?g.lineTo(X(p.rpm),YT(p.torque)):g.moveTo(X(p.rpm),YT(p.torque)));g.stroke();
  g.strokeStyle=RPT.hp;g.beginPath();data.forEach((p,i)=>i?g.lineTo(X(p.rpm),YP(p.powerHP)):g.moveTo(X(p.rpm),YP(p.powerHP)));g.stroke();
  // peak callouts
  const dot=(x,y,c)=>{g.fillStyle=c;g.beginPath();g.arc(x,y,5,0,6.284);g.fill();g.strokeStyle='#fff';g.lineWidth=2;g.stroke();};
  dot(X(pkP.r),YP(pkP.v),RPT.hp);dot(X(pkT.r),YT(pkT.v),RPT.tq);
  g.font=sans(13,true);g.textAlign='center';
  g.fillStyle=RPT.hp;g.fillText(pkP.v.toFixed(1)+' hp @ '+pkP.r+' rpm',clamp(X(pkP.r),gX+90,gX+gW-90),YP(pkP.v)-14);
  g.fillStyle=RPT.tq;g.fillText(pkT.v.toFixed(1)+' Nm @ '+pkT.r+' rpm',clamp(X(pkT.r),gX+90,gX+gW-90),YT(pkT.v)+26);
  // axis titles
  g.save();g.translate(30,gY+gH/2);g.rotate(-Math.PI/2);
  g.fillStyle=RPT.hp;g.font=sans(14,true);g.textAlign='center';g.fillText('POWER (hp)',0,0);g.restore();
  g.save();g.translate(W-26,gY+gH/2);g.rotate(Math.PI/2);
  g.fillStyle=RPT.tq;g.textAlign='center';g.fillText('TORQUE (Nm)',0,0);g.restore();
  g.fillStyle='#667';g.font=sans(13);g.textAlign='center';g.fillText('ENGINE SPEED (rpm)',gX+gW/2,gY+gH+46);
  g.textAlign='left';
  // ---- Peak result band ----
  const by=gY+gH+70;
  g.fillStyle='#f4f5f8';g.fillRect(40,by,W-80,92);
  g.strokeStyle=RPT.rule;g.lineWidth=1;g.strokeRect(40,by,W-80,92);
  const kW=pkP.v*0.7457, lbft=pkT.v*0.73756;
  const big=(x,lbl,val,sub,col)=>{
    g.fillStyle='#667';g.font=sans(12);g.fillText(lbl,x,by+26);
    g.fillStyle=col;g.font=sans(34,true);g.fillText(val,x,by+64);
    g.fillStyle='#889';g.font=sans(12);g.fillText(sub,x,by+82);
  };
  big(70,'PEAK POWER',pkP.v.toFixed(1)+' hp',Math.round(kW)+' kW  @ '+pkP.r+' rpm',RPT.hp);
  big(490,'PEAK TORQUE',pkT.v.toFixed(1)+' Nm',Math.round(lbft)+' lb-ft  @ '+pkT.r+' rpm',RPT.tq);
  const s=engine.score||{};
  big(890,'GRADE',(s.grade||'—'),(s.overall||0)+'/100  •  '+(s.hpPerL||0)+' hp/L',RPT.ink);
  // ---- Spec + conditions tables ----
  const ty=by+126;
  const col=(x,w,title,rows)=>{
    g.fillStyle=RPT.accent;g.fillRect(x,ty,w,26);
    g.fillStyle='#fff';g.font=px(9);g.fillText(title,x+10,ty+18);
    g.font=sans(13);
    rows.forEach((r,i)=>{
      const y=ty+26+22*(i+1);
      if(i%2===0){g.fillStyle=RPT.faint;g.fillRect(x,y-16,w,22);}
      g.fillStyle='#667';g.fillText(r[0],x+10,y);
      g.fillStyle=RPT.ink;g.font=sans(13,true);
      let v=String(r[1]);
      while(g.measureText(v).width>w-165&&v.length>4)v=v.slice(0,-2);
      if(v!==String(r[1]))v+='…';
      g.fillText(v,x+160,y);g.font=sans(13);
    });
    return ty+26+22*(rows.length+1);
  };
  const specRows=reportSpecRows(),condRows=reportCondRows();
  const endA=col(40,580,'ENGINE SPECIFICATION',specRows);
  const endB=col(640,560,'RUN CONDITIONS & RESULT',condRows);
  // ---- Run data table: the tabulated pull a real sheet prints beside the graph ----
  const dy=Math.max(endA,endB)+20;
  const at=r=>{                                    // interpolate the sampled curve at an rpm
    if(r<=data[0].rpm)return data[0];
    for(let i=1;i<data.length;i++)if(r<=data[i].rpm){
      const a=data[i-1],b=data[i],t=(r-a.rpm)/(b.rpm-a.rpm);
      return {powerHP:a.powerHP+(b.powerHP-a.powerHP)*t,torque:a.torque+(b.torque-a.torque)*t};
    }
    return data[data.length-1];
  };
  const dStep=Math.max(100,Math.round((r1-r0)/33/50)*50);
  const samples=[];for(let r=r0;r<=r1;r+=dStep)samples.push(r);
  if(samples[samples.length-1]!==r1)samples.push(r1);
  const nCol=3,perCol=Math.ceil(samples.length/nCol),cw=(W-80)/nCol;
  g.fillStyle=RPT.accent;g.fillRect(40,dy,W-80,26);
  g.fillStyle='#fff';g.font=px(9);g.fillText('RUN DATA',50,dy+18);
  g.font=sans(12);
  for(let c=0;c<nCol;c++){
    const x=40+c*cw;
    g.fillStyle='#667';g.font=sans(11,true);
    g.fillText('RPM',x+10,dy+44);g.fillText('HP',x+95,dy+44);g.fillText('Nm',x+175,dy+44);g.fillText('lb-ft',x+255,dy+44);
    g.font=sans(12);
    for(let i=0;i<perCol;i++){
      const idx=c*perCol+i;if(idx>=samples.length)break;
      const r=samples[idx],v=at(r),y=dy+44+18*(i+1);
      if(i%2===0){g.fillStyle=RPT.faint;g.fillRect(x,y-13,cw-8,18);}
      g.fillStyle='#667';g.fillText(String(r),x+10,y);
      g.fillStyle=RPT.hp;g.fillText(v.powerHP.toFixed(1),x+95,y);
      g.fillStyle=RPT.tq;g.fillText(v.torque.toFixed(1),x+175,y);
      g.fillStyle='#889';g.fillText((v.torque*0.73756).toFixed(1),x+255,y);
    }
  }
  // ---- Footer ----
  const fy=dy+44+18*(perCol+1)+16;
  g.strokeStyle=RPT.rule;g.lineWidth=1;
  g.beginPath();g.moveTo(40,fy);g.lineTo(W-40,fy);g.stroke();
  g.fillStyle='#889';g.font=sans(12);
  g.fillText('Generated by PIXEL ENGINE SIM — a simplified physics simulator for education and fun.',40,fy+22);
  g.fillText('Figures are SIMULATED, not measured on a real dynamometer, and carry no correction factor.',40,fy+42);
  if(dynoPulls.length)g.fillText(dynoPulls.length+' previously logged pull(s) overlaid faintly for comparison.',40,fy+62);
  return cv;
}
function reportFileName(ext){
  const n=(engine.name||engine.displacement_L.toFixed(1)+'L').replace(/[^a-z0-9]+/gi,'_').replace(/^_|_$/g,'');
  return (n||'engine')+'_dyno_'+new Date().toISOString().slice(0,10)+'.'+ext;
}
function downloadBlob(blob,fn){
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);a.download=fn;document.body.appendChild(a);a.click();
  setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1000);
}
function exportDynoPNG(){
  if(isElectric()){flash(tr(EV_REPORT_NOTE),'warn');return;}
  if(!engine.score){flash(tr('BUILD AN ENGINE FIRST'),'warn');return;}
  const cv=dynoReportCanvas(2),fn=reportFileName('png');
  cv.toBlob(b=>{if(!b){flash(tr('REPORT FAILED'),'err');return;}downloadBlob(b,fn);flash(tr('SAVED REPORT:')+' '+fn);},'image/png');
}
// A minimal single-page PDF holding the report as a JPEG. PDF supports JPEG natively via the
// DCTDecode filter, so the canvas bytes can be dropped straight in — no encoder, no library.
function exportDynoPDF(){
  if(isElectric()){flash(tr(EV_REPORT_NOTE),'warn');return;}
  if(!engine.score){flash(tr('BUILD AN ENGINE FIRST'),'warn');return;}
  canvasToPDF(dynoReportCanvas(2),reportFileName('pdf'));
}
function canvasToPDF(cv,fn){
  const jpg=cv.toDataURL('image/jpeg',0.92).split(',')[1];
  const bin=atob(jpg),img=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++)img[i]=bin.charCodeAt(i);
  const PW=595,PH=842;   // A4 in PDF points
  const parts=[],offs=[];let len=0;
  const push=u8=>{parts.push(u8);len+=u8.length;};
  const str=s=>{const u=new Uint8Array(s.length);for(let i=0;i<s.length;i++)u[i]=s.charCodeAt(i)&0xff;return u;};
  push(str('%PDF-1.4\n'));
  const obj=(n,body,stream)=>{
    offs[n]=len;
    push(str(n+' 0 obj\n'+body+'\n'));
    if(stream){push(str('stream\n'));push(stream);push(str('\nendstream\n'));}
    push(str('endobj\n'));
  };
  obj(1,'<< /Type /Catalog /Pages 2 0 R >>');
  obj(2,'<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(3,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+PW+' '+PH+'] '+
        '/Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>');
  obj(4,'<< /Type /XObject /Subtype /Image /Width '+cv.width+' /Height '+cv.height+
        ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+img.length+' >>',img);
  const content=str('q '+PW+' 0 0 '+PH+' 0 0 cm /Im0 Do Q');
  obj(5,'<< /Length '+content.length+' >>',content);
  const xref=len;
  let x='xref\n0 6\n0000000000 65535 f \n';
  for(let i=1;i<=5;i++)x+=String(offs[i]).padStart(10,'0')+' 00000 n \n';
  x+='trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n';
  push(str(x));
  const out=new Uint8Array(len);let o=0;
  for(const p of parts){out.set(p,o);o+=p.length;}
  downloadBlob(new Blob([out],{type:'application/pdf'}),fn);
  flash(tr('SAVED REPORT:')+' '+fn);
}
// ====== RACE REPORT (build 141): the race on one printable sheet ======
// The same paper stock as the dyno and hot lap reports (RPT, canvasToPDF): the classification, a lap chart
// (position by lap), every car's lap times with the track's wetness behind them, and each car's stints by
// compound. Drawn from the race record, so it is the race as it was run, not as the replay stands.
const RACE_RPT_COLS=['#d62246','#1d6fb8','#c98a00','#1a7f37','#e06c00','#7b3fbf','#444455','#d64a9b'];
const RACE_RPT_TYRE={eco:'#7fb89a',street:'#9a9aa8',sport:'#d9a400',semi:'#e06c00',slick:'#c1121f',drag:'#7b3fbf',inter:'#1a9f47',wet:'#1d6fb8'};
function raceReportCanvas(R,scale){
  scale=scale||2;
  const W=RPT.W,H=RPT.H,cfg=R.cfg;
  const cv=document.createElement('canvas');cv.width=Math.round(W*scale);cv.height=Math.round(H*scale);
  const g=cv.getContext('2d');g.scale(scale,scale);g.textBaseline='alphabetic';
  const px_=n=>n+'px "Press Start 2P"';
  const sans=(n,b)=>(b?'bold ':'')+n+'px ui-sans-serif,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif';
  const res=raceResults(R),fl=raceFastest(R,R.t),N=cfg.laps;
  const colOf=id=>RACE_RPT_COLS[id%RACE_RPT_COLS.length];
  g.fillStyle='#fff';g.fillRect(0,0,W,H);
  // ---- header ----
  g.fillStyle=RPT.accent;g.fillRect(0,0,W,96);
  g.fillStyle='#ffcc00';g.font=px_(20);g.fillText('PIXEL ENGINE SIM',40,44);
  g.fillStyle='#fff';g.font=px_(11);g.fillText('RACE REPORT',40,72);
  const now=new Date();
  g.fillStyle='#9aa';g.font=sans(13);g.textAlign='right';
  g.fillText(now.toISOString().slice(0,10)+'  '+now.toTimeString().slice(0,5),W-40,44);
  g.fillText('SIMULATED RACE — NOBODY DROVE',W-40,68);
  g.textAlign='left';
  // ---- title ----
  const T=TRACKS[cfg.track]||{label:cfg.track},wx={dry:'Dry',damp:'Damp',wet:'Wet',rain:'Rain during the race',drying:'Wet, drying'}[cfg.weather]||'Dry';
  g.fillStyle=RPT.ink;g.font=sans(30,true);g.fillText(T.label+' — '+N+' laps',40,142);
  g.fillStyle='#667';g.font=sans(15);
  g.fillText(wx+'  ·  air '+cfg.air+' °C  ·  '+(cfg.grid==='reverse'?'reversed grid':'grid by qualifying')+'  ·  '+
    (cfg.warmers?'tyre warmers  ·  ':'')+'seed '+cfg.seed+'  ·  race time '+fmtLap(R.t),40,168);
  // ---- classification ----
  let y=200;
  const cols=[40,80,420,470,520,650,760,1010,1110];
  g.fillStyle='#f4f5f8';g.fillRect(40,y,W-80,28);
  g.fillStyle='#667';g.font=sans(12,true);
  ['POS','CAR','GRID','LAPS','TIME / GAP','BEST LAP','STOPS & TYRES','FUEL','DRIVING'].forEach((h,k)=>g.fillText(h,cols[k]+6,y+19));
  y+=28;
  for(const x of res){
    g.strokeStyle=RPT.rule;g.lineWidth=1;g.beginPath();g.moveTo(40,y+30);g.lineTo(W-40,y+30);g.stroke();
    g.fillStyle=colOf(x.id);g.fillRect(cols[1]+6,y+10,10,10);
    g.fillStyle=RPT.ink;g.font=sans(14,true);g.fillText(x.state==='dnf'?'—':String(x.pos),cols[0]+6,y+21);
    g.font=sans(14);let nm=x.name;while(g.measureText(nm).width>310&&nm.length>4)nm=nm.slice(0,-2);if(nm!==x.name)nm+='…';
    g.fillText(nm,cols[1]+22,y+21);
    g.fillText(String(x.grid),cols[2]+6,y+21);g.fillText(String(x.laps),cols[3]+6,y+21);
    g.fillText(x.state==='dnf'?'DNF ('+(x.why||'').toLowerCase()+')':x.pos===1?fmtLap(x.time):x.lapsDown>0?'+'+x.lapsDown+(x.lapsDown>1?' laps':' lap'):'+'+(x.gap||0).toFixed(2)+' s',cols[4]+6,y+21);
    g.fillStyle=fl&&fl.car===x.id?'#7b3fbf':RPT.ink;g.font=sans(14,fl&&fl.car===x.id);g.fillText(x.best!=null?fmtLap(x.best):'—',cols[5]+6,y+21);
    g.fillStyle=RPT.ink;g.font=sans(14);g.fillText(String(x.stops),cols[6]+6,y+21);
    x.stints.forEach((st,k)=>{const bx=cols[6]+26+k*44;g.fillStyle=RACE_RPT_TYRE[st.tyre]||'#888';g.fillRect(bx,y+8,40,16);
      g.fillStyle='#fff';g.font=sans(10,true);g.fillText((RACE_TYRE_LOOK[st.tyre]||['?'])[0]+' L'+st.from,bx+4,y+20);});
    g.fillStyle=RPT.ink;g.font=sans(14);g.fillText(x.fuelL.toFixed(1)+' L',cols[7]+6,y+21);
    g.fillText(({push:'push',normal:'normal',save:'fuel save'}[x.mode]||x.mode)+(x.driver&&x.driver!=='BALANCED'?', '+x.driver.toLowerCase():''),cols[8]+6,y+21);
    y+=30;
  }
  if(fl){g.fillStyle='#7b3fbf';g.font=sans(13);g.fillText('Fastest lap: '+fmtLap(fl.t)+' — '+(R.cars.find(c=>c.id===fl.car)||{M:{name:'?'}}).M.name,40,y+22);}
  // ---- a chart frame ----
  const frame=(x0,y0,w,h,title,yLab)=>{
    g.fillStyle=RPT.ink;g.font=sans(16,true);g.fillText(title,x0,y0-12);
    g.strokeStyle=RPT.rule;g.lineWidth=1;g.strokeRect(x0,y0,w,h);
    g.fillStyle='#667';g.font=sans(11);g.save();g.translate(x0-(yLab==='position'?30:62),y0+h/2);g.rotate(-Math.PI/2);g.textAlign='center';g.fillText(yLab,0,0);g.restore();
  };
  const lapX=(x0,w,n)=>x0+(N>1?(n-1)/(N-1):0.5)*w;
  const lapTicks=(x0,y0,w,h)=>{g.fillStyle='#889';g.font=sans(11);g.textAlign='center';
    const step=Math.max(1,Math.ceil(N/20));for(let n=1;n<=N;n+=step)g.fillText(String(n),lapX(x0,w,n),y0+h+16);
    g.fillText('lap',x0+w/2,y0+h+32);g.textAlign='left';};
  // ---- lap chart: position after each lap ----
  const C1={x:110,y:y+80,w:W-190,h:300},P=R.cars.length;
  frame(C1.x,C1.y,C1.w,C1.h,'Lap chart — position at the end of each lap','position');
  g.fillStyle='#889';g.font=sans(11);g.textAlign='right';
  for(let p=1;p<=P;p++){const py=C1.y+(p-0.5)/P*C1.h;g.fillText(String(p),C1.x-8,py+4);
    g.strokeStyle=RPT.faint;g.beginPath();g.moveTo(C1.x,py);g.lineTo(C1.x+C1.w,py);g.stroke();}
  g.textAlign='left';
  for(const c of R.cars){
    g.strokeStyle=colOf(c.id);g.lineWidth=3;g.beginPath();
    c.laps.forEach((l,k)=>{const x=lapX(C1.x,C1.w,l.n),py=C1.y+(Math.min(P,l.pos)-0.5)/P*C1.h;k?g.lineTo(x,py):g.moveTo(x,py);});
    g.stroke();
    for(const l of c.laps)if(l.pit){const x=lapX(C1.x,C1.w,l.n),py=C1.y+(Math.min(P,l.pos)-0.5)/P*C1.h;
      g.fillStyle='#fff';g.fillRect(x-5,py-5,10,10);g.strokeStyle=colOf(c.id);g.lineWidth=2;g.strokeRect(x-5,py-5,10,10);}
  }
  lapTicks(C1.x,C1.y,C1.w,C1.h);
  // ---- lap times, with the track's wetness behind them ----
  const C2={x:110,y:C1.y+C1.h+90,w:W-190,h:330};
  frame(C2.x,C2.y,C2.w,C2.h,'Lap times'+(cfg.weather!=='dry'?' — blue shading: how wet the track was':''),'lap time (s)');
  const all=[].concat(...R.cars.map(c=>c.laps.filter(l=>!l.pit&&l.n>1).map(l=>l.t)));
  const lo=all.length?Math.min(...all):60,hi=all.length?Math.max(...all):90;
  const tLo=Math.floor(lo-1),tHi=Math.ceil(Math.max(lo+2,Math.min(hi,lo*1.6))+1);
  const ty=t=>C2.y+C2.h-(clamp(t,tLo,tHi)-tLo)/(tHi-tLo)*C2.h;
  {const lead=R.cars.reduce((a,c)=>c.laps.length>a.laps.length?c:a,R.cars[0]);   // the wetness, from the car that saw every lap
   for(const l of lead.laps){const wv=clamp((l.wet||0)/RACE.wetFull,0,1);if(wv<0.02)continue;
     const x0=lapX(C2.x,C2.w,l.n-0.5),x1=lapX(C2.x,C2.w,l.n+0.5);g.fillStyle='rgba(29,111,184,'+(0.08+0.22*wv)+')';
     g.fillRect(Math.max(C2.x,x0),C2.y,Math.min(C2.x+C2.w,x1)-Math.max(C2.x,x0),C2.h);}}
  g.fillStyle='#889';g.font=sans(11);g.textAlign='right';
  const tStep=Math.max(1,Math.round((tHi-tLo)/6));
  for(let t=Math.ceil(tLo);t<=tHi;t+=tStep){const yy=ty(t);g.fillText(fmtLap(t),C2.x-8,yy+4);g.strokeStyle=RPT.faint;g.beginPath();g.moveTo(C2.x,yy);g.lineTo(C2.x+C2.w,yy);g.stroke();}
  g.textAlign='left';
  for(const c of R.cars){
    g.strokeStyle=colOf(c.id);g.lineWidth=2;g.beginPath();let on=false;
    for(const l of c.laps){if(l.pit||l.n===1){on=false;continue;}const x=lapX(C2.x,C2.w,l.n),yy=ty(l.t);on?g.lineTo(x,yy):g.moveTo(x,yy);on=true;}
    g.stroke();
  }
  lapTicks(C2.x,C2.y,C2.w,C2.h);
  g.fillStyle='#889';g.font=sans(11);g.fillText('Lap 1 (the standing start) and the laps into the pits are left out.',C2.x,C2.y+C2.h+50);
  // ---- stints ----
  const C3={x:110,y:C2.y+C2.h+100,w:W-190};
  g.fillStyle=RPT.ink;g.font=sans(16,true);g.fillText('Stints — tyres and stops',C3.x,C3.y-12);
  res.forEach((x,k)=>{
    const c=R.cars.find(o=>o.id===x.id),yy=C3.y+k*26,last=Math.max(1,c.lapsDone);
    g.fillStyle=colOf(c.id);g.fillRect(C3.x-30,yy+4,10,10);
    c.stints.forEach((st,s)=>{
      const to=s+1<c.stints.length?c.stints[s+1].from-1:last;if(to<st.from)return;
      const x0=C3.x+(st.from-1)/N*C3.w,x1=C3.x+to/N*C3.w;
      g.fillStyle=RACE_RPT_TYRE[st.tyre]||'#888';g.fillRect(x0,yy,x1-x0-2,18);
      g.fillStyle='#fff';g.font=sans(10,true);if(x1-x0>60)g.fillText(raceCompound(st.tyre).label,x0+5,yy+13);
    });
  });
  // ---- what happened: the moves, the stops, the weather and the mistakes, in order ----
  {
    const ky=C3.y+res.length*26+50,fy0=H-120,rowH=19,colW=(W-80)/2;
    const evs=R.events.filter(e=>['pass','dive','pit','mistake','rain','dry','dnf'].includes(e.type));
    const rows=Math.max(0,Math.floor((fy0-ky-10)/rowH))*2;
    if(evs.length&&rows>0){
      g.fillStyle=RPT.ink;g.font=sans(16,true);g.fillText('Key moments',40,ky);
      const nm=id=>{const c=R.cars.find(o=>o.id===id);return c?c.M.name:'';};
      const txt=e=>e.type==='pass'?nm(e.car)+' passes '+nm(e.on):e.type==='pit'?nm(e.car)+' pits: '+raceCompound(e.tyre).label.toLowerCase()+', '+e.fuelL.toFixed(1)+' L'+(e.why==='weather'?' (for the weather)':'')
        :e.type==='dive'?(e.ok?nm(e.car)+' dives down the inside of '+nm(e.on):nm(e.car)+' tries a late move on '+nm(e.on)+' and runs wide')
        :e.type==='mistake'?nm(e.car)+' makes a mistake':e.type==='rain'?'Rain starts to fall':e.type==='dry'?'The track is dry':nm(e.car)+' retires ('+(e.why||'').toLowerCase()+')';
      const show=evs.length>rows?evs.slice(0,rows-1):evs;
      show.forEach((e,k)=>{const col=k<Math.ceil(show.length/2)?0:1,r=col?k-Math.ceil(show.length/2):k,x=40+col*colW,yy=ky+22+r*rowH;
        g.fillStyle='#889';g.font=sans(12);g.fillText(fmtLap(e.t)+'  L'+Math.max(1,e.lap),x,yy);
        g.fillStyle=e.car>=0?colOf(e.car):'#1d6fb8';g.fillRect(x+110,yy-9,8,8);
        g.fillStyle=RPT.ink;let s_=txt(e);while(g.measureText(s_).width>colW-140&&s_.length>4)s_=s_.slice(0,-2);g.fillText(s_,x+124,yy);});
      if(evs.length>rows){g.fillStyle='#889';g.font=sans(12);g.fillText('… and '+(evs.length-show.length)+' more',40+colW,ky+22+(Math.ceil(show.length/2))*rowH);}
    }
  }
  // ---- footer ----
  const fy=H-100;
  g.strokeStyle=RPT.rule;g.lineWidth=1;g.beginPath();g.moveTo(40,fy);g.lineTo(W-40,fy);g.stroke();
  g.fillStyle='#889';g.font=sans(12);
  g.fillText('Pace, braking, fuel flow and tyre and brake heat come from the lap solver and the engine model; tyre grip windows, wear, wet grip and tank sizes are fitted.',40,fy+22);
  g.fillText('Overtaking, the tow, dirty air, pit-lane loss, driver variation and mistakes, and when the rain comes, are rules drawn from the seed: seed '+cfg.seed+' replays this race exactly.',40,fy+42);
  g.fillText('Figures are SIMULATED, not measured.',40,fy+62);
  return cv;
}
function raceReportFileName(ext){
  const R=raceUI.run,t=((R&&TRACKS[R.cfg.track]||{}).label||'race').replace(/[^a-z0-9]+/gi,'_');
  return (t+'_race_'+new Date().toISOString().slice(0,10)+'.'+ext).replace(/_+/g,'_');
}
function exportRacePNG(){
  if(!raceUI.run){flash(tr('RUN A RACE FIRST'),'warn');return;}
  const cv=raceReportCanvas(raceUI.run,2),fn=raceReportFileName('png');
  cv.toBlob(b=>{if(!b){flash(tr('REPORT FAILED'),'err');return;}downloadBlob(b,fn);flash(tr('SAVED REPORT:')+' '+fn);},'image/png');
}
function exportRacePDF(){
  if(!raceUI.run){flash(tr('RUN A RACE FIRST'),'warn');return;}
  canvasToPDF(raceReportCanvas(raceUI.run,2),raceReportFileName('pdf'));
}
// ====== HOT LAP REPORT: a printable telemetry sheet for the lap ======
// Same paper stock as the dyno report: A4, white, dark ink, drawn offscreen and exported as PNG
// or wrapped in the same library-free PDF.
function lapVehicleRows(){
  const v=vehicle,e=engine,s=e.score||{};
  const dl={fwd:'Front-wheel drive',rwd:'Rear-wheel drive',awd:'All-wheel drive'}[v.drive]||v.drive;
  return [
    ['Engine',(e.displacement_L<1?e.displacement_L.toFixed(2):e.displacement_L.toFixed(1))+' L '+(e.type==='rotary'?e.cylinders+'-rotor':e.cylinders+'-cyl')+(e.intake==='na'?' NA':e.intake==='turbo'?' turbo':' supercharged')],
    ['Peak power',(s.peakHP||0)+' hp @ '+(s.peakHPrpm||0)+' rpm'],
    ['Peak torque',(s.peakTQ||0)+' Nm @ '+(s.peakTQrpm||0)+' rpm'],
    ['Chassis',v.chLabel],
    ['Kerb weight',Math.round(v.mass)+' kg  ('+v.powerToWeight.toFixed(0)+' hp/tonne)'],
    ['Drivetrain',dl],
    ['Gearbox',tr(v.gbLabel)+', '+v.gears+'-speed, '+v.finalDrive.toFixed(2)+':1 final'],
    ['Differential',tr(v.diffLabel)],
    ['Tyres',(TIRE_TYPE[v.tireType]||{}).label+'  '+v.tireWidth+'/'+v.tireAspect+'R'+v.wheelDia],
    ['Grip coefficient','μ '+v.mu.toFixed(2)],
    ['Brakes',(BRAKE_TYPE[v.brakeType]||{}).label+' '+v.rotor+' mm  ('+(v.brakeDecelCap/G).toFixed(2)+' g)'],
    ['Suspension',(SUSPENSION[v.suspension]||{}).label+'  ('+v.rollGrad.toFixed(1)+' deg/g roll)'],
    ['Geometry',(SUSP_GEO[v.suspFront]||{}).label+' / '+(SUSP_GEO[v.suspRear]||{}).label],
    ['Aero',(v.clA>0.01?'ClA '+v.clA.toFixed(2)+' m²':'no downforce')+'  ·  CdA '+v.cdA.toFixed(2)+' m²'],
    ['Build cost',fmtCost(v.cost+(e.cost||0))]
  ];
}
function hotLapReportCanvas(scale){
  scale=scale||2;
  const L=lapResult;if(!L)return null;
  const W=RPT.W,H=RPT.H;
  const cv=document.createElement('canvas');cv.width=Math.round(W*scale);cv.height=Math.round(H*scale);
  const g=cv.getContext('2d');g.scale(scale,scale);g.textBaseline='alphabetic';
  const px_=n=>n+'px "Press Start 2P"';
  const sans=(n,b)=>(b?'bold ':'')+n+'px ui-sans-serif,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif';
  const BRK='#c1121f',WOT='#1a7f37',CORN='#b8860b',NEU='#7a7a88';
  g.fillStyle='#fff';g.fillRect(0,0,W,H);
  // ---- Header ----
  g.fillStyle=RPT.accent;g.fillRect(0,0,W,96);
  g.fillStyle='#ffcc00';g.font=px_(20);g.fillText('PIXEL ENGINE SIM',40,44);
  g.fillStyle='#fff';g.font=px_(11);g.fillText('HOT LAP REPORT',40,72);
  const now=new Date();
  g.fillStyle='#9aa';g.font=sans(13);g.textAlign='right';
  g.fillText(now.toISOString().slice(0,10)+'  '+now.toTimeString().slice(0,5),W-40,44);
  g.fillText('SIMULATED LAP — NOT A MEASUREMENT',W-40,68);
  g.textAlign='left';
  // ---- Title: circuit + car ----
  const T=L.track;
  g.fillStyle=RPT.ink;g.font=sans(30,true);g.fillText(T.label,40,142);
  g.fillStyle='#667';g.font=sans(15);
  g.fillText((T.length/1000).toFixed(2)+' km  ·  '+T.wLabel+' wide  ·  '+T.corners+' corners      '+
    (engine.name||engine.displacement_L.toFixed(1)+'L')+'  in  '+vehicle.chLabel,40,168);
  // ---- Lap + sector band ----
  const by=186;
  g.fillStyle='#f4f5f8';g.fillRect(40,by,W-80,86);
  g.strokeStyle=RPT.rule;g.lineWidth=1;g.strokeRect(40,by,W-80,86);
  g.fillStyle='#667';g.font=sans(12);g.fillText('LAP TIME',70,by+26);
  g.fillStyle=RPT.ink;g.font=sans(34,true);g.fillText(fmtLap(L.lap),70,by+64);
  const secX=[360,560,760];
  ['SECTOR 1','SECTOR 2','SECTOR 3'].forEach((lb,i)=>{
    g.fillStyle='#667';g.font=sans(12);g.fillText(lb,secX[i],by+26);
    g.fillStyle=RPT.ink;g.font=sans(24,true);g.fillText(L.sectors[i].toFixed(2)+'s',secX[i],by+60);
  });
  g.fillStyle='#667';g.font=sans(12);g.fillText('AVG SPEED',960,by+26);
  g.fillStyle=RPT.ink;g.font=sans(24,true);g.fillText(Math.round(L.avg)+' km/h',960,by+60);
  // ---- Circuit map with braking / full-throttle highlighted and every corner tagged ----
  const my=292,mh=620;
  const line=T.line,n=line.length;
  const sc=Math.min((W-140)/(T.maxX-T.minX),(mh-40)/(T.maxY-T.minY));
  const ox=70+((W-140)-(T.maxX-T.minX)*sc)/2, oy=my+((mh-40)-(T.maxY-T.minY)*sc)/2+20;
  const MX=q=>ox+(q.x-T.minX)*sc, MY=q=>oy+(q.y-T.minY)*sc;
  g.lineCap='round';g.lineJoin='round';
  g.fillStyle='#e3e4e9';trackRibbon(g,T,MX,MY,sc,2.5);
  g.lineWidth=Math.max(2.5,4.2*sc/1.2);
  for(let i=0;i<n;i++){
    const j=(i+1)%n,k=L.lim[i];
    g.strokeStyle=k==='brake'?BRK:(k==='power'?WOT:(k==='traction'?'#6aa84f':CORN));
    g.beginPath();g.moveTo(MX(line[i]),MY(line[i]));g.lineTo(MX(line[j]),MY(line[j]));g.stroke();
  }
  // corner tags + speed traps
  const corners=lapCorners(L);
  g.font=sans(11,true);g.textAlign='center';
  corners.forEach(c=>{
    const q=line[c.apex],x=MX(q),y=MY(q);
    // push the label away from the track centre so it doesn't sit on the line
    const cx=(T.minX+T.maxX)/2,cy=(T.minY+T.maxY)/2;
    const dx=q.x-cx,dy=q.y-cy,dl=Math.hypot(dx,dy)||1;
    const lx=x+dx/dl*27,ly=y+dy/dl*27;
    g.fillStyle='#fff';g.beginPath();g.arc(x,y,4.5,0,6.284);g.fill();
    g.strokeStyle=RPT.ink;g.lineWidth=1.6;g.stroke();
    g.strokeStyle='#fff';g.lineWidth=3;g.strokeText(c.tag,lx,ly+4);   // halo, so tags stay legible
    g.fillStyle=RPT.ink;g.fillText(c.tag,lx,ly+4);
  });
  g.textAlign='left';
  // start/finish
  g.fillStyle=RPT.ink;g.fillRect(MX(line[0])-5,MY(line[0])-5,10,10);
  g.fillStyle='#fff';g.fillRect(MX(line[0])-2,MY(line[0])-2,4,4);
  // map legend
  const th=lapThrottleStats(L);
  let lx2=70;const ly2=my+mh+12;
  g.font=sans(12);
  [[WOT,'FULL THROTTLE '+th.wotPct.toFixed(0)+'%'],[BRK,'BRAKING '+th.brakePct.toFixed(0)+'%'],[CORN,'CORNERING '+(100-th.wotPct-th.brakePct).toFixed(0)+'%']].forEach(([col,lab])=>{
    g.fillStyle=col;g.fillRect(lx2,ly2-9,11,11);
    g.fillStyle='#556';g.fillText(lab,lx2+16,ly2);
    lx2+=g.measureText(lab).width+46;
  });
  // ---- Speed trace ----
  const ty=my+mh+40,tH=170,tX=96,tW=W-166;
  g.fillStyle='#667';g.font=sans(12,true);g.fillText('SPEED TRACE',40,ty-8);
  g.strokeStyle=RPT.rule;g.lineWidth=1;g.strokeRect(tX,ty,tW,tH);
  const vMaxT=Math.max(...L.v)*3.6*1.08;
  const SX=s=>tX+s/L.lineLength*tW, SY=v=>ty+tH-v/vMaxT*tH;
  // shade braking zones behind the trace
  for(let i=0;i<n;i++)if(L.lim[i]==='brake'){
    const a=SX(line[i].s),b=SX(line[(i+1)%n].s||L.lineLength);
    g.fillStyle='#fbe3e5';g.fillRect(a,ty+1,Math.max(1,b-a),tH-2);
  }
  for(let i=0;i<n;i++)if(L.lim[i]==='power'){
    const a=SX(line[i].s),b=SX(line[(i+1)%n].s||L.lineLength);
    g.fillStyle='#e4f3e7';g.fillRect(a,ty+1,Math.max(1,b-a),tH-2);
  }
  g.strokeStyle='#ccd';g.setLineDash([3,4]);
  g.font=sans(10);g.textAlign='right';
  for(let k=1;k<=4;k++){const y=ty+tH-k/4*tH;
    if(k<4){g.beginPath();g.moveTo(tX,y);g.lineTo(tX+tW,y);g.stroke();}
    g.fillStyle='#99a';g.fillText(Math.round(vMaxT*k/4),tX-6,y+3);}
  g.setLineDash([]);g.textAlign='left';
  g.strokeStyle=RPT.tq;g.lineWidth=2;g.beginPath();
  for(let i=0;i<n;i++){const x=SX(line[i].s),y=SY(L.v[i]*3.6);i?g.lineTo(x,y):g.moveTo(x,y);}
  g.stroke();
  // corner ticks under the trace
  g.font=sans(9);g.textAlign='center';
  corners.forEach(c=>{
    const x=SX(c.s);
    g.strokeStyle='#aab';g.lineWidth=1;g.beginPath();g.moveTo(x,ty+tH);g.lineTo(x,ty+tH+5);g.stroke();
    g.fillStyle='#667';g.fillText(c.tag,x,ty+tH+16);
  });
  g.textAlign='left';
  g.fillStyle='#99a';g.font=sans(10);g.textAlign='right';g.fillText('km/h vs distance (m)',tX+tW,ty+tH+30);g.textAlign='left';
  // ---- Elevation profile, on the same distance axis as the speed trace above it ----
  const ey=ty+tH+40,eH=74;
  g.fillStyle='#667';g.font=sans(12,true);g.fillText('ELEVATION PROFILE',40,ey-4);
  g.strokeStyle=RPT.rule;g.lineWidth=1;g.strokeRect(tX,ey,tW,eH);
  const zLo=Math.min(...line.map(q=>q.z)),zHi=Math.max(...line.map(q=>q.z)),zSpan=Math.max(4,zHi-zLo);
  const EY=z=>ey+eH-((z-zLo)/zSpan)*(eH-10)-5;
  g.beginPath();g.moveTo(tX,ey+eH);
  for(let i=0;i<n;i++)g.lineTo(SX(line[i].s),EY(line[i].z));
  g.lineTo(tX+tW,ey+eH);g.closePath();
  g.fillStyle='#eceff4';g.fill();
  g.strokeStyle='#6b7a8f';g.lineWidth=1.6;g.beginPath();
  for(let i=0;i<n;i++){const x=SX(line[i].s),y=EY(line[i].z);i?g.lineTo(x,y):g.moveTo(x,y);}
  g.stroke();
  g.font=sans(10);g.textAlign='right';g.fillStyle='#99a';
  g.fillText(zHi.toFixed(0)+' m',tX-6,EY(zHi)+4);g.fillText(zLo.toFixed(0)+' m',tX-6,EY(zLo)+4);
  g.textAlign='left';
  g.fillStyle='#99a';g.font=sans(10);
  g.fillText((zHi-zLo).toFixed(0)+' m of elevation · '+L.climb.toFixed(0)+' m climbed per lap · steepest '+
    (Math.max(...line.map(q=>Math.abs(q.grade)))*100).toFixed(1)+'%',40,ey+eH+18);
  // ---- Corner speed traps + vehicle spec ----
  const tabY=ty+tH+40+74+34;
  const colHdr=(x,w,title)=>{g.fillStyle=RPT.accent;g.fillRect(x,tabY,w,26);g.fillStyle='#fff';g.font=px_(9);g.fillText(title,x+10,tabY+18);};
  colHdr(40,660,'CORNER SPEED TRAPS');
  colHdr(720,480,'VEHICLE');
  g.font=sans(11,true);g.fillStyle='#667';
  ['','CORNER','ENTRY','APEX','EXIT','GEAR','RADIUS','GRADE'].forEach((h,i)=>{
    const xs=[52,86,286,366,446,524,572,634];if(h)g.fillText(h,xs[i],tabY+44);
  });
  const rowH=Math.min(20,(H-120-tabY-40)/Math.max(1,corners.length));
  g.font=sans(11);
  corners.forEach((c,i)=>{
    const y=tabY+44+rowH*(i+1);
    if(i%2===0){g.fillStyle=RPT.faint;g.fillRect(40,y-rowH+5,660,rowH);}
    g.fillStyle=RPT.ink;g.font=sans(11,true);g.fillText(c.tag,52,y);
    g.font=sans(11);g.fillStyle='#334';g.fillText(c.name,86,y);
    g.fillStyle='#667';g.fillText(Math.round(c.vEntry)+' km/h',286,y);
    g.fillStyle=BRK;g.font=sans(11,true);g.fillText(Math.round(c.vApex)+' km/h',366,y);
    g.font=sans(11);g.fillStyle='#667';g.fillText(Math.round(c.vExit)+' km/h',446,y);
    g.fillStyle='#334';g.fillText(String(c.gear),524,y);
    g.fillStyle='#889';g.fillText(Math.round(c.radius)+' m',572,y);
    // uphill corners brake better and exit worse; downhill the reverse — worth showing
    const gr=c.grade;g.fillStyle=Math.abs(gr)<1.5?'#889':(gr>0?'#1a7f37':'#c1121f');
    g.fillText((gr>0?'+':'')+gr.toFixed(1)+'%',634,y);
  });
  const vr=lapVehicleRows();
  g.font=sans(12);
  vr.forEach((r,i)=>{
    const y=tabY+44+20*(i+1);
    if(i%2===0){g.fillStyle=RPT.faint;g.fillRect(720,y-15,480,20);}
    g.fillStyle='#667';g.font=sans(12);g.fillText(r[0],730,y);
    g.fillStyle=RPT.ink;g.font=sans(12,true);
    let val=String(r[1]);
    while(g.measureText(val).width>300&&val.length>4)val=val.slice(0,-2);
    if(val!==String(r[1]))val+='…';
    g.fillText(val,890,y);
  });
  // ---- Footer ----
  const fy=Math.max(tabY+44+rowH*(corners.length+1),tabY+44+20*(vr.length+1))+22;
  g.strokeStyle=RPT.rule;g.lineWidth=1;g.beginPath();g.moveTo(40,fy);g.lineTo(W-40,fy);g.stroke();
  g.fillStyle='#889';g.font=sans(12);
  g.fillText('Best-case hot lap on this car\'s own minimum-time racing line, inside the track width: no traffic, no tyre wear, no fuel burn, no driver error.',40,fy+22);
  g.fillText('"Full throttle" = accelerating at the limit (engine or driven tyres); '+th.engPct.toFixed(0)+'% of the lap is engine-limited.',40,fy+42);
  g.fillText('Figures are SIMULATED, not measured. Slowest point '+Math.round(L.vMin)+' km/h · fastest '+Math.round(L.vMax)+' km/h · '+L.shifts+' gear changes.',40,fy+62);
  return cv;
}
function lapFileName(ext){
  const t=(lapResult?lapResult.track.label:'lap').replace(/[^a-z0-9]+/gi,'_');
  const c=(engine.name||engine.displacement_L.toFixed(1)+'L').replace(/[^a-z0-9]+/gi,'_');
  return (t+'_'+c+'_hotlap_'+new Date().toISOString().slice(0,10)+'.'+ext).replace(/_+/g,'_');
}
function exportLapPNG(){
  if(!lapResult){flash(tr('BUILD AN ENGINE FIRST'),'warn');return;}
  const cv=hotLapReportCanvas(2),fn=lapFileName('png');
  cv.toBlob(b=>{if(!b){flash(tr('REPORT FAILED'),'err');return;}downloadBlob(b,fn);flash(tr('SAVED REPORT:')+' '+fn);},'image/png');
}
function exportLapPDF(){
  if(!lapResult){flash(tr('BUILD AN ENGINE FIRST'),'warn');return;}
  canvasToPDF(hotLapReportCanvas(2),lapFileName('pdf'));
}
function openFileDialog(){document.getElementById('fileInput').click();}
function readBuildFile(file){
  const r=new FileReader();
  r.onload=()=>{try{const nm=applyBuild(JSON.parse(r.result));flash(tr('OPENED:')+' '+nm);setTab('dyno');}catch(e){flash(tr('OPEN FAILED — not a valid engine file'),'err');}};
  r.onerror=()=>flash(tr('OPEN FAILED — could not read file'),'err');
  r.readAsText(file);
}
