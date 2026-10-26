// ---- Share via encoded link (URL hash) ----
function encodeBuild(b){return btoa(unescape(encodeURIComponent(JSON.stringify(b))));}
function decodeBuild(s){return JSON.parse(decodeURIComponent(escape(atob(s))));}
function shareBuild(){
  const name=(typeof prompt==='function'?prompt('Name this shared engine:',(engine.name||'My Engine')):'My Engine');
  if(name===null)return;
  const code=encodeBuild(serializeBuild(name,''));
  const url=location.origin+location.pathname+'#b='+code;
  try{location.hash='b='+code;}catch(e){}
  if(navigator.share){navigator.share({title:'Pixel Engine Sim — '+name,url:url}).catch(()=>{});}
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(url).then(()=>flash(tr('SHARE LINK COPIED TO CLIPBOARD')),()=>flash(tr('SHARE LINK IN ADDRESS BAR')));
  }else flash(tr('SHARE LINK IN ADDRESS BAR'));
}
function loadFromHash(){
  const h=location.hash||'';
  if(h.indexOf('#b=')!==0)return false;
  try{const nm=applyBuild(decodeBuild(h.slice(3)));flash(tr('LOADED SHARED:')+' '+nm);return true;}
  catch(e){return false;}
}
// ---- Dyno pull logging (overlay saved curves for comparison) ----
function logPull(){
  const data=getDynoData().map(p=>({rpm:p.rpm,torque:p.torque,powerHP:p.powerHP}));
  let peak=0;data.forEach(p=>peak=Math.max(peak,p.powerHP));
  dynoPulls.push({label:(engine.name||engine.displacement_L.toFixed(1)+'L')+' '+Math.round(peak)+'hp',pts:data,color:PULL_COLORS[dynoPulls.length%PULL_COLORS.length]});
  if(dynoPulls.length>4)dynoPulls.shift();
  flash(tr('PULL LOGGED')+' ('+dynoPulls.length+' '+tr('overlaid')+') — '+tr('SEE DYNO'));
}
function clearPulls(){dynoPulls=[];flash(tr('DYNO PULLS CLEARED'));}
// ---- Scoring: rate the design at a standard WOT best-power condition ----
function scoreEngine(){
  const sv={afr:state.afr,iat:state.iat,coolant:state.coolant,oil:state.oil,eh:state.engineHealth,bl:state.blown,el:state.elecLoad,map:state.map,rpm:state.rpm};
  const savedAfrMode=engine.afrMode;engine.afrMode='fixed';   // score against the explicit sweep AFRs, independent of the ECU map
  state.iat=25;state.coolant=90;state.oil=100;state.engineHealth=1;state.blown=false;state.elecLoad=0.3;
  const rMax=engine.redline;
  // best-power WOT sweep → peaks, powerband, low-end torque. Diesel makes peak power lean,
  // at the smoke limit (SMOKE_LAMBDA_CI); spark engines peak rich (λ≈0.86).
  const powerAfr=engine.ci?engine.stoichAFR*SMOKE_LAMBDA_CI:engine.stoichAFR*0.86;
  const effAfr=engine.ci?engine.stoichAFR*1.5:engine.stoichAFR;
  state.afr=powerAfr;
  let peakHP=0,peakHPrpm=0,peakTQ=0,peakTQrpm=0;const pts=[];
  for(let r=1000;r<=rMax;r+=100){const p=calcAtRpm(r);pts.push(p);
    if(p.powerHP>peakHP){peakHP=p.powerHP;peakHPrpm=r;}if(p.torque>peakTQ){peakTQ=p.torque;peakTQrpm=r;}}
  let lo=rMax,hi=1000;pts.forEach(p=>{if(p.powerHP>=0.8*peakHP){lo=Math.min(lo,p.rpm);hi=Math.max(hi,p.rpm);}});
  const band=Math.max(0,hi-lo);
  const tqLow=(pts.find(p=>p.rpm>=2000)||pts[0]).torque,drive=clamp(tqLow/peakTQ,0,1);
  // safety: worst knock over a stoich WOT stress sweep
  state.afr=engine.stoichAFR;let maxKnock=0;
  for(let r=1000;r<=rMax;r+=200)maxKnock=Math.max(maxKnock,computeKnockRisk(r,wotMapAt(r)));
  const safety=clamp(1-maxKnock/100,0,1);
  // efficiency: best brake thermal efficiency across a high-load / mid-rpm island (where
  // BSFC is best — pumping/friction are the smallest fraction there)
  state.afr=effAfr;let thEff=0;
  for(const mm of [0.8,1.0,Math.min(1.2,engine.mapMax)]){const cm=Math.min(mm,engine.mapMax);
    for(const rf of [0.6,0.85,1.05]){const rr=Math.round(clamp(peakTQrpm*rf,1200,rMax));
      const cr=calcAtRpm(rr,cm);
      const airMass=(cm*1e5*(engine.displacement_L/1000)*(rr/60)*engine.chargesPerRev*cr.ve)/(287*(effIAT(cm,rr)+273.15));
      const fuelPower=((airMass/curAFR(rr,cm))/engine.meteringEff*engine.typeBsfc)*engine.fuelLHV*1e6/1000;
      if(fuelPower>0.1)thEff=Math.max(thEff,clamp((cr.powerKW/fuelPower)*100,0,46));
    }}
  // emissions: cleanliness at a representative stoich cruise + part-load (where a modern
  // engine spends its regulated life). Rewards a cat + precise metering; a decatted, carb'd
  // or overlap-heavy build rates dirty even run at stoich.
  state.afr=engine.ci?engine.stoichAFR*1.7:engine.stoichAFR;let emSum=0,emN=0;   // diesel cruises lean
  for(const [rf,mm] of [[0.45,0.5],[0.7,0.7],[0.9,Math.min(0.95,engine.mapMax)]]){
    state.rpm=Math.round(clamp(peakTQrpm*rf,1000,rMax));state.map=Math.min(mm,engine.mapMax);
    emSum+=computeEmissions();emN++;
  }
  const emissions=Math.round(emSum/emN);
  engine.afrMode=savedAfrMode;
  Object.assign(state,{afr:sv.afr,iat:sv.iat,coolant:sv.coolant,oil:sv.oil,engineHealth:sv.eh,blown:sv.bl,elecLoad:sv.el,map:sv.map,rpm:sv.rpm});
  computeEmissions();   // restore live emissions readout at the real operating point

  const hpPerL=peakHP/engine.displacement_L,nmPerL=peakTQ/engine.displacement_L;
  const sPower=clamp((hpPerL-30)/120,0,1)*100, sTorque=clamp((nmPerL-60)/100,0,1)*100;
  const sBand=clamp(band/(rMax*0.55),0,1)*100, sEff=clamp((thEff-10)/16,0,1)*100;
  const sSafe=safety*100, sDrive=clamp((drive-0.4)/0.5,0,1)*100, sEmit=emissions;
  const overall=Math.round(0.26*sPower+0.12*sTorque+0.15*sBand+0.12*sEff+0.15*sSafe+0.10*sDrive+0.10*sEmit);
  const grade=overall>=88?'S':overall>=76?'A':overall>=62?'B':overall>=46?'C':overall>=30?'D':'F';
  // Design reliability index (0-100): a static estimate of how much abuse the build invites,
  // from knock margin, boost/specific-output stress, high-strung choices and cooling adequacy.
  let rel=100;
  rel-=(1-safety)*45;                                   // knock-prone = grenade
  // Boost stress on internals: half of it in the midrange (peak boost), half where it is still held at the
  // limiter (build 131), where the rods and bearings carry the highest inertia and gas loads together. With no
  // taper the two halves are the old single term.
  rel-=Math.max(0,engine.maxBoost-0.5)*11+Math.max(0,boostTarget(engine.redline)-0.5)*11;
  rel-=Math.max(0,hpPerL-110)*0.30;                    // highly-strung specific output
  rel-=engine.antilag?15:0;                            // ALS cooks turbo/exhaust
  // The vane ring is the hottest MOVING part in the exhaust, and this is the real reason VGT is a
  // diesel technology rather than a universal one. The nickel-base alloys the vanes and their
  // linkage are made from creep above ~1100 K, and soot and scale seize the bushings. A diesel is
  // quality-governed and always lean, so its full-load gas arrives at 870-900 K; a petrol engine
  // runs rich for power and sends 1200-1250 K at the vanes. exhaustGasT already derives that split
  // from the mixture, so the penalty falls out of the build instead of being asserted per engine
  // type — and a petrol VGT is then exactly what it is in life: it works, and it does not last.
  if(engine.vgt&&engine.intake==='turbo')
    rel-=clamp((engine.peakEgtGas-VANE_T_LIMIT)/100*14,0,28);
  rel-=engine.nitrous!=='none'?12:0;                   // chemical stress
  rel-=Math.max(0,engine.redline-(engine.ports?9800:7500))/100*2;   // sky-high redline (rotary/2-str rev high by design)
  const coolNeed=clamp(peakHP/260,0,1.6);
  const coolHave=engine.radCap+(engine.oilCooler?0.4:0)+(engine.fan==='none'?0:0.2);
  rel-=Math.max(0,coolNeed-coolHave)*30;               // under-cooled for the power
  rel+=engine.ci?16:0;                                 // diesels are built heavy & robust
  rel-=engine.type==='rotary'?18:0;                    // apex-seal wear
  rel-=engine.type==='twostroke'?12:0;                 // ring/port wear, oil dependency
  const reliability=clamp(Math.round(rel),0,100);
  return {peakHP:Math.round(peakHP),peakHPrpm,peakTQ:Math.round(peakTQ),peakTQrpm,hpPerL:Math.round(hpPerL),
    nmPerL:Math.round(nmPerL),band,thEff:Math.round(thEff),safety:Math.round(sSafe),drive:Math.round(drive*100),emissions,reliability,overall,grade};
}
function flash(msg,cls){
  const status=document.getElementById('status');
  status.textContent=msg;status.className='status-bar'+(cls?' '+cls:'');
  statusFlashUntil=performance.now()+1600;
}
function setAutoThermal(on){
  autoThermal=on;
  const btn=document.getElementById('btnAutoThermal');
  btn.classList.toggle('on',on);btn.setAttribute('aria-pressed',on);
  document.getElementById('coolant').disabled=on;
  document.getElementById('oil').disabled=on;
}

const canvas=document.getElementById('engineCanvas'),ctx=canvas.getContext('2d');
// ---- Canvas resolution ----
// The three visualisations share this one canvas and draw on a fixed 640x420 LOGICAL grid. The
// backing store used to be 640x420 too, while CSS stretched it to whatever the panel was — 744 px
// wide on a desktop, and twice that again on a high-DPI screen. Every 7 px glyph therefore landed
// on fractional pixels and smeared, which is why the readouts were unreadable.
// Now the backing store is sized to the real device pixels and the context is scaled, so all the
// drawing code keeps its 640x420 coordinates while the output is pixel-exact.
let vizW=640,vizH=420,vizScale=1;
function sizeCanvas(){
  const dpr=Math.min(3,Math.max(1,window.devicePixelRatio||1));
  const cssW=canvas.getBoundingClientRect().width||vizW;
  vizScale=Math.max(1,Math.min(4,(cssW/vizW)*dpr));
  const bw=Math.round(vizW*vizScale),bh=Math.round(vizH*vizScale);
  if(canvas.width!==bw||canvas.height!==bh){canvas.width=bw;canvas.height=bh;}
  ctx.setTransform(vizScale,0,0,vizScale,0,0);
}
addEventListener('resize',()=>{sizeCanvas();});
const C={bg:'#0d0d18',block:'#2a2a3a',metal:'#6a6a7a',metalDark:'#3a3a4a',metalLight:'#9a9aaa',piston:'#c0c0d0',pistonTop:'#e0e0f0',rod:'#888898',fire:'#ff6600',spark:'#ffff00',intake:'#44aaff',exhaust:'#ff4422',text:'#e0e0e0',green:'#00ff88',yellow:'#ffcc00',red:'#ff4444',cyan:'#00ccff'};

function drawPixelRect(x,y,w,h,color){ctx.fillStyle=color;ctx.fillRect(Math.floor(x),Math.floor(y),Math.floor(w),Math.floor(h))}
