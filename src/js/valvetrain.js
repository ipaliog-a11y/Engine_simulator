// ================================================================================================
// PHYSICS CORE — VALVETRAIN AND PORT FLOW
// ------------------------------------------------------------------------------------------------
// First of the v1.0 conversions: quantities DERIVED from geometry and mechanics, replacing
// coefficients that were fitted until the outputs matched. Nothing here was tuned against this
// simulator's own engines. Where a constant comes from published experiment rather than from first
// principles it says so, and it is a general result, not a fit to our presets.
//
// How big can the intake valves be? A packing limit you can measure off a real cylinder head.
// A 2-valve wedge head cants the valve and fits a bigger one than a flat deck allows (an LS runs
// 55 mm in a 104 mm bore = 0.53); a 4-valve pent-roof packs two at 0.39 (S2000: 35/85 = 0.41).
// What falls out of this is worth noting: total intake area over bore area is 0.250 for two valves,
// 0.304 for four and 0.288 for five — five valves are WORSE than four, which is why the industry
// abandoned them.
const VALVE_PACK={2:{n:1,dOverB:0.50},4:{n:2,dOverB:0.39},5:{n:3,dOverB:0.31}};
const VALVE_MAT={steel:{rho:7800,label:'STEEL'},titanium:{rho:4500,label:'TITANIUM'}};
// Real spring loads span a far wider range than one "performance" step: an LS3 runs about 400 N on
// the seat at 60 N/mm, an order above a small-engine stock spring. Picking the spring is a real
// design decision, and picking one too soft for your redline is a real way to ruin an engine — so
// the app lets you do it, and then tells you where the valves let go.
const VALVE_SPRING={
  stock:{seat:250,rate:22,label:'STOCK'},
  perf: {seat:400,rate:40,label:'PERFORMANCE'},
  race: {seat:550,rate:60,label:'RACE'}
};
const STEM_D=7,STEM_L=105;    // mm — a valve stem is sized by deck height and guide wear, not by
                              // how big its head is, so it does NOT scale with valve diameter.
const VALVE_EFF_MASS=1.40;    // valve + retainer + collets + ~1/3 of the spring
const THROAT_RATIO=0.85;      // throat diameter as a fraction of valve head diameter
// Mass of one poppet valve (kg) from its own geometry: a head disc that scales with diameter, on a
// stem that does not. Scaling the stem too — the obvious mistake — makes a 52 mm valve weigh 227 g
// when a real one weighs 152, and then predicts a big V8 floating at 3800 rpm.
function valveMass(D_mm,mat){
  const head=Math.PI/4*D_mm*D_mm*(0.14*D_mm), stem=Math.PI/4*STEM_D*STEM_D*STEM_L;
  return (head+stem)*1e-9*((VALVE_MAT[mat]||VALVE_MAT.steel).rho);
}
// Effective flow area: the lesser of the curtain the valve opens and the throat behind it. Past
// L/D = 0.18 the curtain already exceeds the throat, so more lift buys no flow while costing
// inertia in full — which is exactly why real designs stop around L/D 0.22–0.28.
function valveFlowArea(D_mm,lift_mm){
  return Math.min(Math.PI*D_mm*lift_mm, Math.PI/4*Math.pow(THROAT_RATIO*D_mm,2));
}
// Valve float. Approximating the lift as harmonic over the opening duration, the peak deceleration
// over the nose is a = accel·(L/2)·(2π/θ_cam)²·ω_cam². The valve stays on the cam while the spring
// at full lift can supply m·a:
//        m_eff · accel · (L/2) · (2π/θ)² · ω_cam²  ≤  F_seat + k·L
// Solved for crank rpm. The cam turns at half crank speed on a four-stroke, which is why a
// four-stroke can rev twice as far into trouble as the cam alone would suggest.
function valveFloatRpm(lift_mm,dur_crank_deg,spring,mass_kg,accel,camRatio){
  const L=lift_mm/1000, theta=(dur_crank_deg/(camRatio||2))*Math.PI/180;
  const F=spring.seat+spring.rate*lift_mm, m=mass_kg*VALVE_EFF_MASS;
  const coef=accel*(L/2)*Math.pow(2*Math.PI/theta,2);
  return Math.sqrt(F/(m*coef))*60/(2*Math.PI)*(camRatio||2);
}
// Inlet Mach index (Taylor): Z = (A_piston / n·A_valve) · mean piston speed / (Ci · speed of sound).
// Taylor's engine data show VE holding flat to about Z = 0.5 and falling away past it. The loss
// term grows with the SQUARE of the excess, which is what a dynamic-pressure loss does; the two
// constants reproduce his published curve (0.75 of peak at Z = 0.7, ~0.43 at Z = 0.9). They come
// from that curve, not from tuning these engines.
const Z_KNEE=0.50,Z_WIDTH=0.35;
function inletMachZ(rpm,chargeK){
  const e=engine;
  if(!e.ivDia_mm)return 0;
  const mps=2*(e.stroke_mm/1000)*rpm/60;
  const areaRatio=(e.bore_mm*e.bore_mm)/(e.ivCount*e.ivDia_mm*e.ivDia_mm);
  // Mean inlet flow coefficient rises with L/D and plateaus near 0.42 — a standard flow-bench
  // result for a poppet valve, not a free parameter.
  const Ci=Math.min(0.42,1.5*(e.ivLift_mm/e.ivDia_mm));
  const c=20.05*Math.sqrt(Math.max(200,chargeK||320));    // sqrt(gamma·R·T) for air
  return areaRatio*mps/(Ci*c);
}
const veMachLoss=Z=>1/(1+Math.pow(Math.max(0,Z-Z_KNEE)/Z_WIDTH,2));
// Past float the spring can only support the fraction (N_float/N)² of the cam's acceleration, so
// that is the fraction of the lift the valve actually reaches. Flow then follows the reduced area.
function veFloatLoss(rpm){
  const e=engine;
  if(!e.floatRpm||rpm<=e.floatRpm)return 1;
  const lift=e.ivLift_mm*Math.pow(e.floatRpm/rpm,2);
  return valveFlowArea(e.ivDia_mm,lift)/Math.max(1e-6,valveFlowArea(e.ivDia_mm,e.ivLift_mm));
}
// Derive the whole valvetrain from the engine's own geometry. Poppet valves only — a rotary has
// ports in the housing and a piston-ported two-stroke has no valvetrain to float.
// Show where the valves let go, next to the choices that decide it. Floating below the redline is
// a real design error — the engine cannot use the rev range it claims — so it is called out.
function updateFloatLabel(){
  const el=document.getElementById('valFloat');if(!el)return;
  const e=engine;
  if(!e.floatRpm){el.textContent='n/a';el.style.color='#778';return;}
  const short=e.floatRpm<e.redline;
  el.textContent=Math.round(e.floatRpm)+' rpm'+(short?' — BELOW REDLINE':'');
  el.style.color=short?'#ff6b6b':(e.floatMargin<1.10?'#e8974a':'#7ee08a');
}
// Show what the pipes came out as. These are the numbers that used to be asserted by peakShift,
// topGain and scav, so they belong on screen next to the choices that decide them.
function updateGasLabels(){
  const e=engine,set=(id,txt,col)=>{const el=document.getElementById(id);if(!el)return;el.textContent=txt;el.style.color=col||'#cfe';};
  const ov=document.getElementById('valOverlap');
  if(ov){
    if(e.ports||!e.overlap&&e.overlap!==0){set('valOverlap','n/a','#778');}
    else if(e.overlap<=0)set('valOverlap',Math.round(e.overlap)+'\u00b0 — '+tr('NONE'),'#778');
    else set('valOverlap',Math.round(e.overlap)+'\u00b0',e.overlap>55?'#e8974a':'#cfe');
  }
  if(!e.primL){set('valRam','n/a','#778');set('valScav','n/a','#778');return;}
  set('valRam',Math.round(e.runnerL*1000)+'mm \u00b7 '+(e.runnerVariable?tr('VAR')+' ':'')+
    Math.round(e.ramPeakRpm)+' rpm +'+(e.ramPeakGain*100).toFixed(1)+'%');
  set('valScav',Math.round(e.primL*1000)+'mm k='+e.primK+' \u00b7 '+
    (e.scavPeakGain>0.002?Math.round(e.scavPeakRpm)+' rpm +'+(e.scavPeakGain*100).toFixed(1)+'%':tr('no scavenging')),
    e.scavPeakGain>0.002?'#7ee08a':'#778');
}
function deriveValvetrain(){
  const e=engine;
  if(e.type==='rotary'||e.ports){e.ivDia_mm=0;e.floatRpm=0;e.valveMass_g=0;return;}
  const pack=VALVE_PACK[e.valves]||VALVE_PACK[4];
  const cam=CAM[e.cam]||CAM.stock;
  const spring=VALVE_SPRING[e.valveSpring]||VALVE_SPRING.stock;
  e.ivCount=pack.n;
  e.ivDia_mm=pack.dOverB*e.bore_mm;
  e.ivLift_mm=cam.lOverD*e.ivDia_mm;
  e.valveMass_g=valveMass(e.ivDia_mm,e.valveMat)*1000;
  e.floatRpm=valveFloatRpm(e.ivLift_mm,cam.dur,spring,e.valveMass_g/1000,cam.accel,2);
  e.floatMargin=e.floatRpm/Math.max(1,e.redline);
}
