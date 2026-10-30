// ---- Corners: find them on the racing line, number and name them, and take a speed trap ----
// A corner is a local MINIMUM of the racing-line radius that is prominent enough to be a corner
// rather than a wobble: the radius has to open out by at least 55% on both sides before the next
// one, and two apexes closer than 45 m are the same corner (a double-apex is one corner). Working
// from minima rather than "every stretch under some radius" is what stops a long sweeping section
// being reported as a single 600 m corner.
const CORNER_R=170;
function detectCorners(line){
  const n=line.length,r=line.map(q=>q.r);
  const cand=[];
  for(let i=0;i<n;i++){
    let isMin=true;
    for(let d=-4;d<=4;d++){const j=(i+d+n)%n;if(r[j]<r[i]-1e-9){isMin=false;break;}}
    if(isMin&&r[i]<CORNER_R)cand.push(i);
  }
  // collapse plateaus / near-duplicates into one apex per 45 m
  const merged=[];
  for(const i of cand){
    const prev=merged[merged.length-1];
    if(prev!=null){
      let gap=0,d=((i-prev)+n)%n;
      for(let k=0;k<d;k++)gap+=line[(prev+k)%n].ds;
      if(gap<45){if(r[i]<r[prev])merged[merged.length-1]=i;continue;}
    }
    merged.push(i);
  }
  // Prominence: between two apexes the radius has to open out, or they are the same corner.
  // Repeatedly drop the shallower of the least-prominent adjacent pair until all pairs separate,
  // otherwise a single long sweep reports as three corners sharing one apex.
  const keep=merged.slice();
  const peakBetween=(i,j)=>{let peak=r[i],d=((j-i)+n)%n||n;for(let k=0;k<d;k++)peak=Math.max(peak,r[(i+k)%n]);return peak;};
  while(keep.length>2){
    let worst=-1,worstRatio=Infinity;
    for(let a=0;a<keep.length;a++){
      const i=keep[a],j=keep[(a+1)%keep.length];
      const ratio=peakBetween(i,j)/Math.min(r[i],r[j]);
      if(ratio<worstRatio){worstRatio=ratio;worst=a;}
    }
    if(worstRatio>=1.8)break;
    const i=keep[worst],j=keep[(worst+1)%keep.length];
    keep.splice(r[i]>=r[j]?worst:(worst+1)%keep.length,1);   // drop the shallower one
  }
  return keep;
}
function lapCorners(L){
  if(!L)return [];
  const p=L.track.line,n=p.length,v=L.v,names=L.track.names||[];
  const apexes=detectCorners(p).sort((x,y)=>x-y);
  const m=apexes.length,out=[];
  for(let c=0;c<m;c++){
    const apex=apexes[c],prev=apexes[(c-1+m)%m],next=apexes[(c+1)%m];
    // Each corner owns the stretch up to the midpoint toward its neighbours, so two apexes can
    // never claim the same window (and so never report the same speed trap).
    const halfBack=Math.floor((((apex-prev)+n)%n||n)/2),halfFwd=Math.floor((((next-apex)+n)%n||n)/2);
    let a=apex,b=apex;
    for(let k=1;k<=halfBack;k++){const j=(apex-k+n)%n;if(p[j].r>CORNER_R)break;a=j;}
    for(let k=1;k<=halfFwd;k++){const j=(apex+k)%n;if(p[j].r>CORNER_R)break;b=j;}
    let arc=0,len=((b-a)+n)%n+1;
    for(let k=0;k<len;k++)arc+=p[(a+k)%n].ds;
    // the trap sits at the slowest point inside the corner, which is the true apex
    let ap=apex;for(let k=0;k<len;k++){const j=(a+k)%n;if(v[j]<v[ap])ap=j;}
    out.push({apex:ap,entry:a,exit:b,arc,radius:p[apex].r,
      vApex:v[ap]*3.6,vEntry:v[a]*3.6,vExit:v[b]*3.6,
      grade:(p[ap].grade||0)*100,gear:(L.gears?L.gears[ap]:0)+1,s:p[ap].s});
  }
  out.sort((x,y)=>x.s-y.s);
  out.forEach((c,i)=>{c.idx=i+1;c.tag='T'+(i+1);c.name=names[i]||('Turn '+(i+1));});
  return out;
}
// Where the driver is flat. "On power" means the car is accelerating as hard as it is allowed to,
// whether the cap is the engine or the driven tyres — pedal down either way. It is reported apart
// from the engine-limited share, because a car that is traction-limited everywhere it accelerates
// is telling you something different from one that is running out of engine.
function lapThrottleStats(L){
  const p=L.track.line,n=p.length;let wot=0,eng=0,brake=0,total=0;
  for(let i=0;i<n;i++){
    total+=p[i].ds;
    if(L.lim[i]==='power'){wot+=p[i].ds;eng+=p[i].ds;}
    else if(L.lim[i]==='traction')wot+=p[i].ds;
    else if(L.lim[i]==='brake')brake+=p[i].ds;
  }
  return {wotPct:wot/total*100,engPct:eng/total*100,brakePct:brake/total*100,total};
}
function fmtT(t){return (t==null)?'—':t.toFixed(2)+'s';}
function fmtLap(t){if(t==null)return '—';const mm=Math.floor(t/60);return (mm?mm+':':'')+(t-mm*60).toFixed(2).padStart(mm?5:1,'0');}
function fmtTrap(mk){return mk?Math.round(mk.v*3.6)+' km/h':'';}
function updateVehicleSummary(){
  const el=document.getElementById('vehicleSummary');if(!el)return;
  const dl={fwd:'FWD',rwd:'RWD',awd:'AWD'}[vehicle.drive]||'RWD';
  el.className='design-summary vehicleSummaryWrap';
  const stock=isFactoryFit(vehicle);
  el.innerHTML='<b>'+tr(vehicle.chLabel)+'</b> • '+dl+' • '+(vehicle.ev?tr('SINGLE-SPEED'):vehicle.ecvt?'eCVT':vehicle.gears+tr('-speed'))+
    ' <span style="color:'+(stock?'#7a8':'#ffcc00')+'">'+tr(stock?'(factory spec)':'(modified)')+'</span>'+
    '<br>'+tr('Curb weight')+' <b>'+Math.round(vehicle.mass)+' kg</b> ('+tr('engine')+' ~'+vehicle.engineMass+' kg) • '+vehicle.powerToWeight.toFixed(0)+' hp/t'+
    (vehicle.body?'<br>'+tr('Body')+' <b>'+tr(CHASSIS[vehicle.chassis].label)+'</b> '+tr('class')+' • Cd '+vehicle.body.cd.toFixed(2)+' × '+vehicle.area.toFixed(2)+' m² • '+tr('wheelbase')+' '+vehicle.wb.toFixed(2)+' m • '+Math.round(vehicle.fWt*100)+'% '+tr('front'):'')+
    '<br>'+tr('Tyres')+' <b>'+tr((TIRE_TYPE[vehicle.tireType]||TIRE_TYPE.sport).label)+'</b> '+vehicle.tireWidth+'/'+vehicle.tireAspect+' R'+vehicle.wheelDia+' • '+tr('grip')+' μ<b>'+vehicle.mu.toFixed(2)+'</b>'+
    '<br>'+tr('Brakes')+' <b>'+tr((BRAKE_TYPE[vehicle.brakeType]||BRAKE_TYPE.slotted).label)+'</b> '+vehicle.rotor+'mm ('+(vehicle.brakeDecelCap/G).toFixed(2)+'g) • '+tr('Susp')+' <b>'+trOpt((SUSPENSION[vehicle.suspension]||SUSPENSION.sport).label)+'</b> • '+tr('roll')+' <b>'+vehicle.rollGrad.toFixed(1)+'°/g</b>'+
    '<br>'+tr('Geometry')+' <b>'+trOpt(SUSP_GEO[vehicle.suspFront].label)+'</b> / <b>'+trOpt(SUSP_GEO[vehicle.suspRear].label)+'</b> • '+
    tr('track width')+' '+vehicle.trackF.toFixed(2)+' / '+vehicle.trackR.toFixed(2)+' m • '+tr('load transfer')+' '+Math.round(vehicle.lltdF*100)+'% '+tr('front')+
    '<br>'+tr('Gearbox')+' <b>'+tr(vehicle.gbLabel)+'</b> • '+tr('shift')+' '+(vehicle.shiftTime*1000).toFixed(0)+' ms'+(vehicle.gb.powershift?' ('+tr('no drive cut')+')':'')+' • '+tr('driveline')+' '+(vehicle.driveEff*100).toFixed(0)+'%'+(vehicle.gb.stall?' • '+tr('converter stall')+' '+vehicle.gb.stall+' rpm ×'+vehicle.gb.mult.toFixed(1):'')+
    '<br>'+tr('Diff')+' <b>'+tr(vehicle.diffLabel)+'</b> • '+tr('puts down')+' '+(vehicle.diffTraction*100).toFixed(0)+'% '+tr('of axle grip')+
    '<br>'+tr('Speed limiter')+' <b>'+(vehicle.governor>0?vehicle.governor+' km/h':tr('removed'))+'</b>'+(perf&&perf.governed?' • '+tr('free top speed')+' '+Math.round(perf.freeSpeed)+' km/h':'')+
    ' • '+tr('traction control')+' <b>'+(vehicle.tc===false?tr('off'):tr('on'))+'</b>'+(perf&&perf.spinT>0.05?' • '+tr('wheelspin')+' '+perf.spinT.toFixed(1)+' '+tr('s to 100'):'')+
    (vehicle.ev?'':isHybrid()?hybridCycleLine(vehicle):engineCycleLine(vehicle))+   // an engine's WLTP fuel (build 187), a hybrid's (188)
    '<br>'+tr('Drag')+' CdA <b>'+vehicle.cdA.toFixed(2)+'</b> • '+tr('downforce')+' ClA <b>'+vehicle.clA.toFixed(2)+'</b> • '+tr('final drive')+' <b>'+vehicle.finalDrive.toFixed(2)+'</b>'+
    (vehicle.ev?evDrivelineLine(vehicle)+evCycleLine(vehicle):   // one reduction and its regeneration (build 180), the WLTP cycle (184)
    vehicle.ecvt?psDrivelineLine(vehicle):   // a power-split's planetary and its two machines (build 189)
    '<br>'+tr('Ratios')+' <b>'+vehicle.ratios.map(x=>x.toFixed(2)).join(' · ')+'</b> '+
    tr(vehicle.spacing==='stock'?(vehicle.gearsetApprox?'(family average)':'(published)'):vehicle.spacing==='custom'?'(custom)':'('+(GEAR_SPACING[vehicle.spacing]||GEAR_SPACING.std).label.toLowerCase()+')'))+
    '<br>'+tr('Vehicle cost')+' <b>'+fmtCost(vehicle.cost)+'</b> • '+tr('with engine')+' <b>'+fmtCost(vehicle.cost+(engine.cost||0))+'</b>';
  renderPerformance();
}
function renderPerformance(){
  const head=document.getElementById('perfHead'),grid=document.getElementById('perfGrid'),note=document.getElementById('perfNote');
  if(!head||!grid)return;
  const p=perf;
  if(!p){head.textContent='—';grid.innerHTML='';if(note)note.textContent='';return;}
  head.innerHTML='<b>'+tr(vehicle.chLabel)+'</b> • '+(engine.score?engine.score.peakHP:0)+' hp • '+Math.round(vehicle.mass)+' kg • <b>'+p.ptw.toFixed(0)+'</b> hp/t';
  const cell=(k,v,u,cls)=>'<div class="perf-cell '+(cls||'')+'"><span class="k">'+k+'</span><div class="v">'+v+'</div><span class="u">'+(u||'')+'</span></div>';
  const b100=p.brake100?Math.round(p.brake100.dist)+' m':'—';
  const zz=(p.zt!=null)?p.zt.toFixed(1)+'s':'—';
  const zzU=(p.zd!=null)?Math.round(p.zd)+' '+tr('m total'):tr('not reached');
  grid.innerHTML=
    cell(tr('0–100 km/h'),fmtT(p.t100),'',' hero')+
    cell(tr('TOP SPEED'),Math.round(p.topSpeed),p.governed?'km/h · '+tr('limited'):'km/h','hero')+
    cell('400 m',fmtT(p.q400&&p.q400.t),fmtTrap(p.q400))+
    cell('800 m',fmtT(p.q800&&p.q800.t),fmtTrap(p.q800))+
    cell('1000 m',fmtT(p.q1000&&p.q1000.t),fmtTrap(p.q1000))+
    cell(tr('POWER/WT'),p.ptw.toFixed(0),tr('hp/tonne'))+
    cell(tr('100–0 BRAKING'),b100,'')+
    cell(tr('0–200–0'),zz,zzU);
  // A car that can out-run its own tyres is not a fast car, it is a tyre failure waiting to happen.
  // Deliberately NOT a silent speed cap: the reference cars that stop short of their drag-limited
  // speed do so because of a manufacturer governor, and capping them here would produce the right
  // number by the wrong mechanism.
  if(vehicle.ratedKmh&&p.topSpeed>vehicle.ratedKmh){
    grid.innerHTML+='<div class="perf-cell" style="grid-column:1/-1;border-color:#ff6b6b">'+
      '<span class="k" style="color:#ff6b6b">'+tr('TYRE SPEED RATING EXCEEDED')+'</span><div class="v" style="font-size:11px;color:#ff6b6b">'+
      Math.round(p.topSpeed)+' km/h vs '+(SPEED_RATING[vehicle.speedRating]||{}).label+'</div>'+
      '<span class="u">'+tr('the carcass overheats and the tread can delaminate — fit a higher rating')+'</span></div>';
  }
  if(note)note.textContent=tr('Best-power run through the gearbox with a traction-limited launch, then braking (tyre- and brake-limited, with fade).');
}

// ---- Dynamic thermal model (temps drift over time under load) ----
// Heat generated by load is balanced against the cooling subsystem's capacity.
// Airflow through the radiator scales with RPM (ram air); the fan provides a
// floor so the engine can still cool at idle. Under-cooled builds heat-soak.
function coolingEffectiveness(){
  const af=clamp((state.rpm-800)/(engine.redline-800),0,1);        // ram-air proxy
  const fanTerm=engine.fanFloor+(engine.fan==='mechanical'?0.30*af:0);
  return clamp(engine.radCap*(0.40+0.50*af+fanTerm),0.30,2.20);
}
function stepThermal(dt){
  if(isElectric())return;   // the motor's heat is stepped with its losses (stepMotorBench)
  if(!autoThermal)return;
  const loadFrac=clamp((state.rpm-800)/(engine.redline-800),0,1)*0.6
                +clamp((state.map-0.4)/(engine.mapMax-0.4),0,1)*0.4;
  const cooling=coolingEffectiveness();
  // Heat load raises temps; cooling capacity divides that rise back down.
  let heat=loadFrac*34+(state.knockRisk>60?6:0);
  let coolantTarget=clamp(engine.thermostat+heat/cooling,engine.thermostat,140);
  let oilDelta=(8+loadFrac*30)*(engine.oilCooler?0.6:1.0);
  let oilTarget=clamp(state.coolant+oilDelta,40,150);
  state.coolant+=(coolantTarget-state.coolant)*(1-Math.exp(-0.08*dt));
  state.oil+=(oilTarget-state.oil)*(1-Math.exp(-0.05*dt));
  dynoCache=null;
  document.getElementById('coolant').value=Math.round(state.coolant);
  document.getElementById('oil').value=Math.round(state.oil);
}

