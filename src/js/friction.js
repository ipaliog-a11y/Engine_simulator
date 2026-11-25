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
// ---- Engine balance & NVH (Taylor, The Internal-Combustion Engine in Theory and Practice, vol. 2, ch. 8) ----
// Reciprocating inertia force of one cylinder along its axis:
//   F_rec(theta) = m_rec * r * w^2 * [cos(theta + alpha - psi) + lambda * cos(2*(theta + alpha - psi))]
// where r = S/2, lambda = r/L = 1/ROD_RATIO, psi is the bank angle from +y, alpha is the crankpin phase.
// Crankshaft counterweights cancel the forward-rotating 1st-order component (50% on inline, 100% on 90-deg V-twin/V8).
// Typical reciprocating mass (piston + pin + rings + ~1/3 conrod): ~0.55 kg at 86 mm bore, scaling ~B^2.5 (+25% CI).
function balanceLayoutAngles(layout,nc){
  if(layout==='inline'){
    if(nc===1)return {psi:[0],alpha:[0],z:[0],bays:1};
    const pitch=1,z=Array.from({length:nc},(_,k)=>(k-(nc-1)/2)*pitch);
    const alphas={
      2:[0,Math.PI],
      3:[0,2*Math.PI/3,4*Math.PI/3],
      4:[0,Math.PI,Math.PI,0],
      5:[0,4*Math.PI/5,8*Math.PI/5,2*Math.PI/5,6*Math.PI/5],
      6:[0,2*Math.PI/3,4*Math.PI/3,4*Math.PI/3,2*Math.PI/3,0],
      8:[0,Math.PI,Math.PI/2,3*Math.PI/2,3*Math.PI/2,Math.PI/2,Math.PI,0],
      10:[0,4*Math.PI/5,8*Math.PI/5,2*Math.PI/5,6*Math.PI/5,6*Math.PI/5,2*Math.PI/5,8*Math.PI/5,4*Math.PI/5,0]
    };
    return {psi:Array(nc).fill(0),alpha:alphas[nc]||Array.from({length:nc},(_,k)=>k*2*Math.PI/nc),z,bays:nc};
  }
  const pairs=Math.max(1,Math.floor(nc/2));
  if(layout==='boxer'){
    const throwA=pairs===1?[0]:pairs===2?[0,Math.PI]:pairs===3?[0,2*Math.PI/3,4*Math.PI/3]:
      pairs===4?[0,Math.PI,Math.PI,0]:pairs===5?[0,4*Math.PI/5,8*Math.PI/5,2*Math.PI/5,6*Math.PI/5]:
      [0,2*Math.PI/3,4*Math.PI/3,4*Math.PI/3,2*Math.PI/3,0];
    const psi=[],alpha=[],z=[],bankOff=0.35;
    for(let t=0;t<pairs;t++){
      const zb=t-(pairs-1)/2;
      psi.push(-Math.PI/2,Math.PI/2);
      alpha.push(throwA[t],throwA[t]+Math.PI);
      z.push(zb-bankOff/2,zb+bankOff/2);
    }
    return {psi,alpha,z,bays:pairs};
  }
  // V-engine: standard bank angles (90 deg V2/V4/V6/V8, 72 deg V10, 60 deg V12)
  const bankDeg=nc===12?60:nc===10?72:90;
  const halfB=(bankDeg*Math.PI/180)/2;
  const throwA=pairs===1?[0]:pairs===2?[0,Math.PI]:pairs===3?[0,2*Math.PI/3,4*Math.PI/3]:
    pairs===4?[0,Math.PI/2,3*Math.PI/2,Math.PI]:pairs===5?[0,4*Math.PI/5,8*Math.PI/5,2*Math.PI/5,6*Math.PI/5]:
    [0,2*Math.PI/3,4*Math.PI/3,4*Math.PI/3,2*Math.PI/3,0];
  const split=nc===6?(15*Math.PI/180):0;   // 30-deg split pins on 90-deg even-fire V6
  const psi=[],alpha=[],z=[],bankOff=0.25;
  for(let t=0;t<pairs;t++){
    const zb=t-(pairs-1)/2;
    psi.push(-halfB,halfB);
    alpha.push(throwA[t]-split,throwA[t]+split);
    z.push(zb-bankOff/2,zb+bankOff/2);
  }
  return {psi,alpha,z,bays:pairs};
}
function computeEngineBalance(spec){
  if(!spec||spec.type==='rotary'||spec.type==='electric'){
    return {mRec_kg:0,lambda:0,f1_N:0,f2_N:0,m1_Nm:0,m2_Nm:0,totalForce_N:0,totalMoment_Nm:0,smoothness:100,balShaftType:'none',balShaftActive:false,refRpm:spec?spec.redline||6000:6000};
  }
  const nc=spec.cylinders||4,B=(spec.bore_mm||86)/1000,S=(spec.stroke_mm||86)/1000,r=S/2;
  const lambda=1/(typeof ROD_RATIO==='number'?ROD_RATIO:3.2);
  const mRec_kg=0.55*Math.pow(B/0.086,2.5)*(spec.ci?1.25:1.0);
  const pitch=1.15*B;
  const g=balanceLayoutAngles(spec.layout||'inline',nc);
  let a1x=0,b1x=0,a1y=0,b1y=0,a2x=0,b2x=0,a2y=0,b2y=0;
  let c1x=0,d1x=0,c1y=0,d1y=0,c2x=0,d2x=0,c2y=0,d2y=0;
  for(let k=0;k<g.psi.length;k++){
    const psi=g.psi[k],del=g.alpha[k]-psi,z=g.z[k]*pitch,ux=Math.sin(psi),uy=Math.cos(psi);
    const c1=Math.cos(del),s1=Math.sin(del),c2=Math.cos(2*del),s2=Math.sin(2*del);
    a1x+=c1*ux;b1x+=-s1*ux;a1y+=c1*uy;b1y+=-s1*uy;
    a2x+=c2*ux;b2x+=-s2*ux;a2y+=c2*uy;b2y+=-s2*uy;
    c1x+=z*c1*ux;d1x+=-z*s1*ux;c1y+=z*c1*uy;d1y+=-z*s1*uy;
    c2x+=z*c2*ux;d2x+=-z*s2*ux;c2y+=z*c2*uy;d2y+=-z*s2*uy;
  }
  // Subtract forward-rotating 1st-order vector (cancelled by crankshaft counterweights)
  const f1axp=(a1x-b1y)/2,f1bxp=(b1x+a1y)/2;
  const r1ax=a1x-f1axp,r1bx=b1x-f1bxp,r1ay=a1y-f1bxp,r1by=b1y+f1axp;
  const m1axp=(c1x-d1y)/2,m1bxp=(d1x+c1y)/2;
  const q1ax=c1x-m1axp,q1bx=d1x-m1bxp,q1ay=c1y-m1bxp,q1by=d1y+m1axp;

  const rms4=(a,b,c,d)=>Math.sqrt(0.5*(a*a+b*b+c*c+d*d));
  let f1c=rms4(r1ax,r1bx,r1ay,r1by), f2c=rms4(a2x,b2x,a2y,b2y);
  let m1c=rms4(q1ax,q1bx,q1ay,q1by), m2c=rms4(c2x,d2x,c2y,d2y);
  if(f1c<1e-6)f1c=0;if(f2c<1e-6)f2c=0;if(m1c<1e-6)m1c=0;if(m2c<1e-6)m2c=0;

  const balShaftType=f1c>0?'1x-force':f2c>0?'2x-force':m1c>0?'1x-couple':m2c>0?'2x-couple':'none';
  const balShaftActive=!!spec.balShaft&&balShaftType!=='none';
  if(balShaftActive){
    if(balShaftType==='1x-force')f1c=0;
    else if(balShaftType==='2x-force')f2c=0;
    else if(balShaftType==='1x-couple')m1c=0;
    else if(balShaftType==='2x-couple')m2c=0;
  }
  const refRpm=Math.min(spec.redline||6000,5000),w=2*Math.PI*refRpm/60,scale=mRec_kg*r*w*w;
  const f1_N=f1c*scale, f2_N=f2c*scale*lambda, m1_Nm=m1c*scale, m2_Nm=m2c*scale*lambda;
  const totalForce_N=Math.hypot(f1_N,f2_N), totalMoment_Nm=Math.hypot(m1_Nm,m2_Nm);
  const lMount=Math.max(0.25,g.bays*pitch);
  const fEq=Math.hypot(totalForce_N,totalMoment_Nm/lMount);
  const smoothness=Math.round(100*Math.exp(-fEq/14000));
  return {mRec_kg,lambda,f1_N,f2_N,m1_Nm,m2_Nm,totalForce_N,totalMoment_Nm,smoothness,balShaftType,balShaftActive,refRpm};
}
function deriveBalance(){
  engine.balance=computeEngineBalance(engine);
  if(!engine.balance.balShaftActive)engine.balShaft=false;
}
// The engine's fixed geometry for the model, once per build (deriveFriction, after deriveValvetrain).
function deriveFriction(){
  const e=engine;
  e.vtMech=VALVETRAIN[e.valvetrain]?e.valvetrain:valvetrainDefault(e.valves);
  if(e.type==='rotary'||e.ports){e.fric=null;return;}
  const nc=e.cylinders,banks=e.layout==='inline'?1:2,perBank=Math.ceil(nc/banks);
  const vt=VALVETRAIN[e.vtMech];
  const bal=e.balance&&e.balance.balShaftActive;
  const bal2x=bal&&(e.balance.balShaftType==='2x-force'||e.balance.balShaftType==='2x-couple');
  e.fric={B:e.bore_mm,S:e.stroke_mm,nc,rc:e.compression,vt,
    nMain:perBank+1,                                   // a main bearing either side of each throw (V and flat: shared throws)
    nPin:nc,
    nCam:vt.cams?vt.cams*banks*(perBank+1):perBank+1,   // OHV: one cam in the block, on as many journals as the crank
    nv:(e.valves||4)*nc,
    Lv:e.ivLift_mm||0.28*0.39*e.bore_mm,
    Dm:FRIC_MAIN_D*e.bore_mm,Dp:FRIC_PIN_D*e.bore_mm,
    balBrg:bal?(bal2x?4:2):0,balMul:bal2x?2:1,Db:0.30*e.bore_mm};
}
// Rubbing + auxiliary friction mean effective pressure (bar) at N rpm and intake pressure map (bar absolute).
// actFrac (1 by default, 0.5 with half-cylinder deactivation) scales combustion gas ring load and
// valve/follower actuation (cam bearings still spin, while collapsed lifters/lobes have zero lift).
function mechFrictionMEP(N,map,actFrac=1){
  // Dry-sump multi-stage scavenge pump drag: P = Vdot * dp / eta.
  // 3x over-scavenge of oil flow (~2.5 L/min per L per 1000 rpm) against 1.2 bar crankcase vacuum + cyclone/line drop
  // at eta = 0.60 (~3.0 kPa FMEP), plus belt/shaft bearing drag (~1.5 kPa at 6000 rpm).
  const scavKpa=(engine.drySump&&engine.type!=='twostroke')?(3.0+1.5*(N/6000)):0;
  // Common-rail high-pressure pump (Bosch CP3/CP4): P = Vdot * dp / eta_pump (eta_pump = 0.70, rho_fuel = 835 kg/m3, ~1.2x metered flow).
  const pRail=typeof dieselRailBar==='function'?dieselRailBar(engine):0;
  const crKpa=pRail>0?(9.36e-3*pRail*Math.max(0.5,map)):0;
  const f=engine.fric;
  if(!f){
    let fm=(0.55+1.8e-8*N*N)*(1+(engine.stroke_mm-86)/320);   // rotary / two-stroke: the old curve (see above)
    if(engine.balance&&engine.balance.balShaftActive)fm+=0.02*(N/6000);
    return fm+(scavKpa+crKpa)/100;
  }
  N=Math.max(N,300);
  const {B,S,nc,rc,vt,nMain,nPin,nCam,nv,Lv,Dm,Dp}=f,B2S=B*B*S,Sp=2*S*N/60000,bnd=1+500/N;
  const brg=(D,n)=>3.03e-4*N*D*D*D*FRIC_BRG_LD*D*n/(B2S*nc);
  const crank=1.22e5*Dm/(B2S*nc)+brg(Dm,nMain)+1.35e-10*Dm*Dm*N*N*nMain/nc;
  const recip=2.94e2*Sp/B+4.06e4*bnd/(B*B)+brg(Dp,nPin);
  const gas=6.89*Math.max(0.2,map)*(0.088*rc+0.182*Math.pow(rc,1.33-2*FRIC_K*Sp))*actFrac;
  const valve=244*N*nCam/(B2S*nc)+(4.12+vt.ff*bnd*nv/(S*nc)+vt.rf*N*nv/(S*nc)
             +vt.oh*Math.pow(Lv,1.5)*Math.sqrt(N)*nv/(B*S*nc)+vt.om*bnd*Lv*nv/(S*nc))*actFrac;
  const aux=6.23+5.22e-3*N-1.79e-7*N*N;
  const bal=f.balBrg?(brg(f.Db,f.balBrg)*f.balMul+0.0005*N*f.balMul):0;   // balance shaft bearings + chain/gear mesh
  return (crank+recip+gas+valve+aux+bal+scavKpa+crKpa)/100;
}
