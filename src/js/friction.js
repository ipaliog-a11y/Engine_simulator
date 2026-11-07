// ================================================================================================
// PHYSICS CORE — MECHANICAL FRICTION (build 243)
// ------------------------------------------------------------------------------------------------
// Until build 243 the engine's rubbing friction was one fitted curve, (0.55 + 1.8e-8·N²) bar times a stroke factor
// 1 + (S − 86)/320, the same for a pushrod V8 and a bucket-tappet four. Nothing in it came from a measurement.
//
// It is now the Patton–Nitschke–Heywood friction model (SAE 890836, 1989) as revised by Sandoval and Heywood
// ("An Improved Friction Model for Spark-Ignition Engines", SAE 2003-01-0725; D. Sandoval, MIT thesis 2002, App. A-2),
// built from the engine's own bore, stroke, cylinders, valves, compression ratio, valvetrain and intake pressure. Each
// term is a lubrication regime (boundary: constant; hydrodynamic: ~N; turbulent dissipation: ~N²) on one part:
//
//   crankshaft     main-bearing seals, main-bearing hydrodynamic, oil pumped through the bearings
//   reciprocating  piston skirt, rings (mixed), connecting-rod bearings, and the rings' extra load from gas pressure
//   valvetrain     camshaft bearings, cam/follower contact (flat or roller), the valves and lifters in their guides
//   auxiliary      oil pump, water pump and an uncharged alternator
//
// All in kPa; B, S, bearing sizes and valve lift in mm; N in rpm; mean piston speed Sp in m/s. Pumping is not here:
// the sim derives its own gas-exchange loop (pumpingMEP), so the thesis's pumping terms are left out.
//
// What is held at the model's reference rather than derived per engine, and why:
//   · oil viscosity: the model's 10W-30 at 90 C (√(μ/μ0) = 1). Warm-up and overheating still go through the existing
//     oil-temperature factor (tempFactors), applied to the whole as before. Replacing that with the thesis's Vogel
//     viscosity is left open.
//   · ring tension and liner roughness (Ft/Ft0, Cr) = 1: the thesis gives no values, only that a modern ring pack is
//     lower; 1 is Patton's original engine, so this errs on the side of more friction.
//   · bearing sizes: no preset carries them. Main journal 0.65 × bore and crankpin 0.56 × bore are the means of maker
//     figures (Honda B16A 55/45 mm at 81 bore, BMW S14 60/48 at 93.4, Toyota 2JZ 62/53 at 86, GM LS1 64.5/53.3 at 99,
//     Ford 289 57.2/53.2 at 101.6, VW EA827 54/47.8 at 81; service-manual figures, probable). Bearing width 0.35 ×
//     its diameter, typical of passenger-car shells (probable).
//   · rotaries and two-strokes have no poppet valvetrain and a different crank; the model was built for four-stroke
//     piston engines, so they keep the old curve.
const FRIC_MAIN_D=0.65,FRIC_PIN_D=0.56,FRIC_BRG_LD=0.35,FRIC_K=2.38e-2;
// Table 4.2 of the thesis: cam follower (flat Cff, roller Crf), oscillating hydrodynamic (Coh) and oscillating mixed
// (Com) constants by mechanism. A follower is flat or rolling, so only one of Cff, Crf applies. The thesis prints
// Crf = 0.5 for OHV, the same as its Coh and 33 times the other rollers: taken as a misprint, and an OHV roller uses
// the SOHC rocker's 0.0151, since the thesis says the other mechanisms were scaled from SOHC and OHV's flat constant
// equals the rocker's.
const VALVETRAIN={
  'dohc-bucket': {label:'DOHC, BUCKET',      cams:2,ff:133,rf:0,     oh:0.5,om:10.7},
  'dohc-finger': {label:'DOHC, ROCKER',      cams:2,ff:600,rf:0,     oh:0.2,om:25.8},
  'dohc-roller': {label:'DOHC, ROLLER FINGER',cams:2,ff:0, rf:0.0227,oh:0.2,om:25.8},
  'sohc-bucket': {label:'SOHC, BUCKET',      cams:1,ff:200,rf:0,     oh:0.5,om:10.7},
  'sohc-rocker': {label:'SOHC, ROCKER',      cams:1,ff:400,rf:0,     oh:0.5,om:21.4},
  'sohc-roller': {label:'SOHC, ROLLER ROCKER',cams:1,ff:0, rf:0.0151,oh:0.5,om:21.4},
  'ohv':         {label:'PUSHROD',           cams:0,ff:400,rf:0,     oh:0.5,om:32.1},
  'ohv-roller':  {label:'PUSHROD, ROLLER',   cams:0,ff:0, rf:0.0151,oh:0.5,om:32.1}
};
// A design that does not say: four or five valves are almost always two cams over buckets, two valves one cam and rockers.
const valvetrainDefault=valves=>(+valves||4)>=4?'dohc-bucket':'sohc-rocker';
// The engine's fixed geometry for the model, once per build (deriveFriction, after deriveValvetrain).
function deriveFriction(){
  const e=engine;
  e.vtMech=VALVETRAIN[e.valvetrain]?e.valvetrain:valvetrainDefault(e.valves);
  if(e.type==='rotary'||e.ports){e.fric=null;return;}
  const nc=e.cylinders,banks=e.layout==='inline'?1:2,perBank=Math.ceil(nc/banks);
  const vt=VALVETRAIN[e.vtMech];
  e.fric={B:e.bore_mm,S:e.stroke_mm,nc,rc:e.compression,vt,
    nMain:perBank+1,                                   // a main bearing either side of each throw (V and flat: shared throws)
    nPin:nc,
    nCam:vt.cams?vt.cams*banks*(perBank+1):perBank+1,   // OHV: one cam in the block, on as many journals as the crank
    nv:(e.valves||4)*nc,
    Lv:e.ivLift_mm||0.28*0.39*e.bore_mm,
    Dm:FRIC_MAIN_D*e.bore_mm,Dp:FRIC_PIN_D*e.bore_mm};
}
// Rubbing + auxiliary friction mean effective pressure (bar) at N rpm and intake pressure map (bar absolute).
function mechFrictionMEP(N,map){
  const f=engine.fric;
  if(!f)return (0.55+1.8e-8*N*N)*(1+(engine.stroke_mm-86)/320);   // rotary / two-stroke: the old curve (see above)
  N=Math.max(N,300);
  const {B,S,nc,rc,vt,nMain,nPin,nCam,nv,Lv,Dm,Dp}=f,B2S=B*B*S,Sp=2*S*N/60000,bnd=1+500/N;
  const brg=(D,n)=>3.03e-4*N*D*D*D*FRIC_BRG_LD*D*n/(B2S*nc);
  const crank=1.22e5*Dm/(B2S*nc)+brg(Dm,nMain)+1.35e-10*Dm*Dm*N*N*nMain/nc;
  const recip=2.94e2*Sp/B+4.06e4*bnd/(B*B)+brg(Dp,nPin);
  const gas=6.89*Math.max(0.2,map)*(0.088*rc+0.182*Math.pow(rc,1.33-2*FRIC_K*Sp));
  const valve=244*N*nCam/(B2S*nc)+4.12+vt.ff*bnd*nv/(S*nc)+vt.rf*N*nv/(S*nc)
             +vt.oh*Math.pow(Lv,1.5)*Math.sqrt(N)*nv/(B*S*nc)+vt.om*bnd*Lv*nv/(S*nc);
  const aux=6.23+5.22e-3*N-1.79e-7*N*N;
  return (crank+recip+gas+valve+aux)/100;
}
