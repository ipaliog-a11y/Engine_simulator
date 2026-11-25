// Global ambient environment (ISO 2533 International Standard Atmosphere, troposphere h <= 11 km):
//   p(h) = P0 * (1 - L/T0 * h)^(g*M/(R*L)), P0 = 1.01325 bar, L/T0 = 2.25577e-5 /m, exp = 5.25588.
// airRho is anchored at 1.20 kg/m³ at sea level (alt_m = 0) and 20 °C so sea-level defaults stay identical.
const ISA_P0=1.01325, ISA_LAPSE_K=2.25577e-5, ISA_EXP=5.25588;
const ENV={alt_m:0,tempC:20,headwind_ms:0};
function pAmbBar(alt_m){
  const h=clamp(alt_m==null?ENV.alt_m:alt_m,-500,11000);
  return ISA_P0*Math.pow(1-ISA_LAPSE_K*h,ISA_EXP);
}
const pAmbAtm=alt_m=>pAmbBar(alt_m)/ISA_P0;
function airRho(alt_m,tempC){
  const p=pAmbBar(alt_m),T=273.15+(tempC==null?ENV.tempC:tempC);
  return 1.20*(p/ISA_P0)*(293.15/Math.max(200,T));
}
function envAirRho(opts){
  const alt=opts&&opts.alt_m!=null?opts.alt_m:ENV.alt_m;
  const temp=opts&&opts.tempC!=null?opts.tempC:ENV.tempC;
  return airRho(alt,temp);
}
function envWind(opts){return opts&&opts.headwind_ms!=null?opts.headwind_ms:(ENV.headwind_ms||0);}
const RAD_CAP={small:0.75,stock:1.0,large:1.35};   // relative heat-rejection capacity
const IMEP_K=13.2;   // bar — ONLY scales the dyno brake's reference torque now (loadRefTq); torque itself comes from fuel
// Dynamic (throttle-driven) model tuning:
const PUMP_K=0.9;    // pumping loss (bar) at full manifold vacuum → engine braking
// How fast the manifold's pressure follows the throttle (build 263). The manifold is a volume the cylinders pump down:
// emptying it, dp/dt = -(R T / V_m) m_cyl, so the pressure relaxes at K = VE Vd (N/60)(charges per rev) / V_m (the
// filling-and-emptying model, Heywood 7.6.2; Hendricks' mean-value engine model). V_m is what lies between the
// throttle and the valves: behind one throttle, the plenum and all the runners; with a throttle per cylinder, one
// runner fed by one cylinder's flow, which is why such an engine answers the pedal at once. The plenum is taken as
// the engine's displacement, the usual size of a road manifold (probable; to become the intake part's own figure).
// Until build 263 a constant 9 /s times a factor per induction system (0.90 to 1.25).
function mapRateK(rpm){
  const e=engine,Vd=e.displacement_L/1000,n=Math.max(1,e.cylinders||1),run=(e.runnerL||0.3)*(e.runnerA||8e-4);
  const flow=(state.ve||0.85)*Vd*Math.max(rpm,300)/60*(e.chargesPerRev||0.5);
  return e.throttlePerCyl?flow/n/run:flow/(Vd+n*run);
}
const THR_K=0.12;    // throttle-vs-rpm restriction (higher = more vacuum at rpm)
const IDLE_AIR=0.03; // idle bypass air (fraction of throttle area at 0% pedal)
const IDLE_RPM=850;  // idle-controller floor — the engine can't stall below this
// Electrical: alternator rated output (A) and constant belt drag (bar of FMEP).
const ALT={'60':{maxA:60,drag:0.020},'120':{maxA:120,drag:0.035},'180':{maxA:180,drag:0.050}};
const ELEC_BASE_A=12;   // ECU / fuel pump / ignition baseline draw
const ELEC_ACC_A=55;    // max accessory draw (lights, AC, audio…) at 100% ELEC LOAD
const ELEC_FAN_A=22;    // electric cooling fan draw when running
// Ignition dwell limit (rpm) before spark energy falls off → misfire, by ignition type.
const DWELL_RPM={distributor:5200,wasted:6800,coil:9000};
// Turbo characteristics as fractions of redline: 50% spool point, ramp width,
// top-end choke, and boost-response speed (larger turbo = laggier). `flow` is the frame's
// rated compressor flow in lb/min — the quantity a real compressor map is drawn against, and
// what decides whether an engine is asking more of a turbo than it can actually deliver.
// Figures are the usual real classes: TD04/GT2560R, GT3076R, GT3582R.
// The spool figures are quoted AT THE REFERENCE PRESSURE RATIO below; asking for more boost
// than that moves the spool point up, because pressure has to be paid for in shaft speed.
// Turbo frames are WHEELS. Real turbos are named by exducer diameter — a GT2871R is a 71 mm
// wheel — and the flow rating people quote is that wheel's inducer choking, not an independent
// spec. Solving the old fitted flow ratings (32/55/82 lb/min) for the diameter that would produce
// them gives 54, 71 and 86 mm: standard, real wheel sizes (GT2554R, GT2871R, GT3586R). Those
// fitted numbers were consistent with real hardware all along, so `flow` is now DERIVED from `exd`
// and comes out on the old values to within 1%.
//
// `ar` is the turbine housing A/R, the spec people agonise over when choosing a turbo. It has a
// real geometric meaning — volute throat area divided by the radius to its centroid, quoted in
// inches — and it is what sets how much the turbine restricts the exhaust. It has been buried
// inside the lumped `spool50` until now. Frames are sold with a matched housing, so it scales with
// the wheel.
const TURBO={
  // ars: the housings a maker sells for the frame (tight / stock / loose), on this model's R_wheel
  // convention (see backPressureBar) — the stock step is the single A/R each frame used to have.
  small: {exd:0.054,ars:[0.35,0.42,0.50],spool50:0.26,width:0.06},
  medium:{exd:0.071,ars:[0.48,0.64,0.82],spool50:0.40,width:0.08},
  large: {exd:0.086,ars:[0.63,0.86,1.06],spool50:0.54,width:0.10}
};
const AR_INCH=0.0254;          // A/R is quoted in inches
const TURB_WHEEL=0.90;         // turbine wheel as a fraction of the compressor exducer, every factory turbo (a designed turbo sets its own)
// Electric turbo / MGU-H (E5): coaxial motor-generator on the turbocharger shaft.
//   e48   Garrett 48 V E-Turbo (e.g. Mercedes-AMG M139l): ~4-6 kW continuous/peak e-assist & recuperation
//         at ~88% motor + 48 V MOSFET inverter efficiency (Garrett Motion technical specs; SAE 2021).
//   mguh  HV MGU-H (FIA F1 2014-2025 PU Regs Art. 5.1.4/5.2): unlimited ES-MGU-H transfer, ~90 kW
//         peak shaft motoring/recovery on HV bus at ~92% PMSM + SiC/IGBT inverter efficiency.
// baseFrac (0.35 of shaftMax) sets the corner speed for peak motor torque T_max = maxW / (baseFrac * wMax).
const E_TURBO={
  none:{label:'NONE',maxW:0,eta:1,vBus:0,baseFrac:0.35,massKg:0,cost:0},
  e48: {label:'E-TURBO (48 V)',maxW:6000,eta:0.88,vBus:48,baseFrac:0.35,massKg:4.5,cost:1600},
  mguh:{label:'MGU-H (HV)',maxW:90000,eta:0.92,vBus:400,baseFrac:0.35,massKg:7.0,cost:6500}
};
// Turbine throat for a housing A/R. A/R is the volute throat area over the radius to its centroid,
// so A_throat = (A/R) x R. A vane ring sets its own throat (vaneThroatArea, build 168).
function setTurbineAR(ar){
  const e=engine, exd=e.compExd;
  // R is the radius to the centroid of the throat section (build 133; it was the wheel's radius, which made every
  // throat 1.5-1.8x too small). The section sits just outside the wheel tip, a circle of area A = k R, so
  // R = r_tip + sqrt(k R / pi): a quadratic in sqrt(R).
  const rt=e.turbK*exd/2, k=ar*AR_INCH;
  const sq=(Math.sqrt(k/Math.PI)+Math.sqrt(k/Math.PI+4*rt))/2;
  const a0=k*sq*sq;
  e.turbineAR=ar;
  // a VGT's throat is its vane ring's, not the volute's (build 168): the housing A/R does not size it
  e.turbineArea=e.vgt?vaneThroatArea(exd,VANE_BETA_MAX,e.turbK):a0;
  e.vgtShut=e.vgt?vaneThroatArea(exd,VANE_BETA_MIN,e.turbK):0;
}
// The boost the ECU asks for at an rpm (build 131). Real ECUs pull boost back toward the limiter, where the
// rods and bearings carry the highest inertia and gas loads together, the turbine runs hottest and fastest and
// the end gas is least able to wait: a calibration choice for life, not physics. BOOST TAPER FROM (rpm, 0 = off)
// and BOOST AT LIMITER (%) set it: the wastegate target falls linearly from the full setting at the first to
// that share of it at the redline. The physics below does not know about it; it only meets a lower target.
function boostTaperFrac(rpm){
  const e=engine,r0=e.taperRpm||0;
  if(!(r0>0)||r0>=e.redline)return 1;
  const f=clamp((e.taperPct!=null?e.taperPct:100)/100,0.2,1);
  return 1-(1-f)*clamp((rpm-r0)/(e.redline-r0),0,1);
}
// A diesel ECU sets its boost from the fuel it injects (Bosch, Diesel-Engine Management): as the governor takes the fuel
// (build 172) the boost target goes with it, to none at the governed maximum, where the engine runs unloaded.
const govBoostFrac=rpm=>{const e=engine,g0=e.govRpm||0;return e.ci&&g0>0&&g0<e.redline&&rpm>g0?1-clamp((rpm-g0)/(e.redline-g0),0,1):1;};
const boostTarget=rpm=>Math.min(engine.maxBoost*boostTaperFrac(rpm)*govBoostFrac(rpm),tqLimitBoost(rpm),knockLimitBoost(rpm));
// The ECU's torque limit (build 138). A torque-based ECU holds the engine to a calibrated torque (for the gearbox,
// the driveline, the clutch) by asking for less boost where the engine would make more: the flat torque plateaus
// makers quote ("350 Nm from 1500 to 4400 rpm") are this, not the engine's own curve. ECU TORQUE LIMIT (Nm, 0 =
// off) sets it. Solved once per engine: at each rpm, the boost at which the engine makes the limit (bisected on the
// engine's own torque at that boost), and the wastegate, vanes and bypass are asked for no more than that. Like the
// taper it is a calibration, not physics: the engine below it is unchanged and only meets a lower target. Boosted
// engines only (an NA engine's throttle would do it, and no NA preset is torque-limited).
function tqLimitBoost(rpm){
  const tb=engine.tqLimTable;
  if(!tb)return Infinity;
  if(rpm<=tb[0].rpm)return tb[0].bar;
  for(let i=1;i<tb.length;i++)if(rpm<=tb[i].rpm){const a=tb[i-1],b=tb[i];return a.bar+(b.bar-a.bar)*(rpm-a.rpm)/(b.rpm-a.rpm);}
  return tb[tb.length-1].bar;
}
function buildTorqueLimit(){
  const e=engine;e.tqLimTable=null;
  if(!(e.tqLimit>0)||e.intake==='na'||!(e.maxBoost>0))return;
  const sv={afr:state.afr,coolant:state.coolant,oil:state.oil,engineHealth:state.engineHealth,blown:state.blown,turboBlown:state.turboBlown,iat:state.iat,systemVoltage:state.systemVoltage,nitrousActive:state.nitrousActive,icFaceV:state.icFaceV};
  const savedAfrMode=e.afrMode;e.afrMode='fixed';
  state.coolant=90;state.oil=100;state.engineHealth=1;state.blown=false;state.turboBlown=false;state.iat=20;state.systemVoltage=14.0;state.nitrousActive=false;state.icFaceV=null;
  state.afr=e.ci?e.stoichAFR*SMOKE_LAMBDA_CI:e.stoichAFR*0.88;
  const tb=[];
  for(let r=1000;r<=e.redline+199;r+=200){
    const rr=Math.min(r,e.redline),b0=boostAvail(rr),tq=b=>calcAtRpm(rr,1+b).torque;
    let bar=e.maxBoost;
    if(tq(b0)>e.tqLimit){
      let lo=0,hi=b0;
      if(tq(0)>=e.tqLimit)hi=0;
      else for(let i=0;i<14;i++){const m=(lo+hi)/2;if(tq(m)>e.tqLimit)hi=m;else lo=m;}
      bar=hi===0?0:lo;
    }
    tb.push({rpm:rr,bar});
  }
  e.afrMode=savedAfrMode;Object.assign(state,sv);
  e.tqLimTable=tb;
}
// The knock limit on boost (build 307): where the end gas knocks at the ECU's furthest retard and richest mixture
// (activeAdvance, knockEnrichLambda), the ECU lowers the boost until it does not, as a production one pulls its boost
// target on knock. Solved once per engine, at the bench's intake air, like the torque limit. Only with AUTO timing on
// its derived table: a hand-set spark has no knock control to ask for less.
function knockLimitBoost(rpm){
  const tb=engine.knockLimTable;
  if(!tb)return Infinity;
  if(rpm<=tb[0].rpm)return tb[0].bar;
  for(let i=1;i<tb.length;i++)if(rpm<=tb[i].rpm){const a=tb[i-1],b=tb[i];return a.bar+(b.bar-a.bar)*(rpm-a.rpm)/(b.rpm-a.rpm);}
  return tb[tb.length-1].bar;
}
function buildKnockLimit(){
  const e=engine;e.knockLimTable=null;
  if(e.ci||e.ports||e.intake==='na'||!(e.maxBoost>0)||e.timingMode!=='auto'||sparkMapCustom)return false;
  const sv={iat:state.iat,afr:state.afr,coolant:state.coolant,nitrousActive:state.nitrousActive,icFaceV:state.icFaceV,turboBlown:state.turboBlown};
  state.iat=25;state.afr=e.stoichAFR||14.7;state.coolant=90;state.nitrousActive=false;state.icFaceV=null;state.turboBlown=false;
  try{
    _knockCache={score:e.score,m:new Map()};   // the engine built before shares the score object until it is rescored
    const over=(r,b)=>{const m=1+b;return knockAt(r,m,activeAdvance(r,m))>KNOCK_TARGET;};
    const tb=[];let any=false;
    for(let r=1000;r<=e.redline+199;r+=200){
      const rr=Math.min(r,e.redline),b0=boostAvail(rr);
      let bar=e.maxBoost;
      if(b0>0&&over(rr,b0)){
        any=true;let lo=0,hi=b0;
        if(over(rr,0))hi=0;
        else for(let i=0;i<12;i++){const m=(lo+hi)/2;if(over(rr,m))hi=m;else lo=m;}
        bar=lo;
      }
      tb.push({rpm:rr,bar});
    }
    e.knockLimTable=any?tb:null;
    return any;
  }finally{Object.assign(state,sv);}
}
// The frame an engine runs (build 131): the size class, or the maker's own compressor wheel where it is known
// (COMPRESSOR WHEEL, mm at the exducer), with its housings scaled with it (a geometrically similar volute: A/R is
// a length).
// turbK: the turbine wheel over the compressor exducer. A designed turbo (build 288, parts.js: engine.turboPart) brings its
// own compressor and turbine wheels and its one housing A/R, in place of the frame's wheel, TURB_WHEEL and the housing step.
function turboFrame(e){
  const tb=TURBO[e.turboSize]||TURBO.medium,P=e.turboPart;
  if(P){const cD=Math.max(30,P.compD_mm||0),exd=cD/1000;return Object.assign({},tb,{exd,turbK:P.turbD_mm/cD,ars:[P.ar,P.ar,P.ar]});}
  if(!(e.compExd_mm>0))return Object.assign({},tb,{turbK:TURB_WHEEL});
  const exd=clamp(e.compExd_mm,30,110)/1000,k=exd/tb.exd;
  return Object.assign({},tb,{exd,turbK:TURB_WHEEL,ars:tb.ars.map(a=>a*k)});
}
// Steady wide-open-throttle boost against rpm, sampled once per engine: solving the shaft balance
// costs a few thousand iterations, and boostAvail is called for every rpm of every curve build.
function buildBoostTable(N){
  const e=engine;
  e.boostTable=null;
  if(e.intake!=='turbo'||!(e.turbineArea>0))return;
  const lo=Math.max(600,e.idleRpmEff||800),hi=e.redline,tb=[];
  for(let i=0;i<=N;i++){const r=lo+(hi-lo)*i/N;tb.push({rpm:r,bar:steadyBoost(r)});}
  e.boostTable=tb;
}
// ---- the turbine housing: a hardware choice, and the user's ----
// A housing is a compromise — tighter spools earlier, looser breathes at the top — and WHICH side of
// it to take is a design intent, not physics. Build 91 tried deriving it (tests/proto/README.md,
// housing sizing attempts 2 and 3): every objective tried decides that intent silently for every
// engine. Minimum in-gear sweep time handed the GTI a loose housing and 287 hp against the 220 VW
// chose to make with a small turbine for response; average power bought top end with spool. So the
// housing is offered the way a maker offers it, three A/R steps per frame, and the build says which.
const TURBINE_HOUSING={tight:0,stock:1,loose:2};
const COMP_BLOCKAGE=0.50;      // blade blockage + swirl at the inducer throat
const INDUCER_RATIO=0.72;      // inducer/exducer, near-constant across a maker's range
// Flow rating = the inducer choking. Checked against quoted ratings for real frames: derived comes
// out 9-33% above quoted, and the sign is right, because makers quote usable flow at the edge of
// the efficiency island rather than hard choke.
const compChokeFlow=(exd,alt_m)=>COMP_BLOCKAGE*(pAmbBar(alt_m)*1e5/(287*298))
  *(Math.PI/4*Math.pow(INDUCER_RATIO*exd,2))*Math.sqrt(1.4*287*298)*132.28;   // lb/min
const ISLAND_FLOW=0.62;    // best efficiency sits near 62% of choke flow
const ISLAND_PEAK=0.78;    // island-centre efficiency for an automotive centrifugal wheel
const ISLAND_WF=0.30;      // how fast efficiency falls either side, in flow fraction
const ISLAND_WP=2.00;      // and with pressure ratio, past the point where losses start to bite
// The island follows the speed line (build 133). The wheel is most efficient where the gas meets its blades at
// the design incidence, which is a fixed flow coefficient Q/(U D^2): the velocity triangles are similar, so the
// best flow scales with the tip speed U, and so does the island's width. That is why a real map's island runs
// diagonally up from the origin, and why a turbo compresses efficiently at low flow when it is only asked for a
// low pressure ratio. It was fixed at the flow the island has at PR_ISLAND, where pressure losses begin, so low
// flow at low pressure (a turbo spooling at low rpm) always read as the edge of the map. U comes from the
// pressure ratio through Euler's work at a common efficiency. Only BELOW that speed: above it the inducer's
// relative Mach number nears 1, the speed lines steepen into the choke flow instead of moving right, and the
// island stays where it is (with the pressure losses below).
const PR_ISLAND=2.2;
const islandSpeed=pr=>Math.sqrt(clamp((Math.pow(Math.max(1,pr),0.2857)-1)/(Math.pow(PR_ISLAND,0.2857)-1),0.0025,1));
const compIslandEff=(flowFrac,pr)=>{
  const u=islandSpeed(pr);
  return clamp(
  ISLAND_PEAK-0.22*Math.pow((clamp(flowFrac,0,2)-ISLAND_FLOW*u)/(ISLAND_WF*u),2)
             -0.10*Math.pow(Math.max(0,pr-PR_ISLAND)/ISLAND_WP,2),0.35,ISLAND_PEAK);
};
// Centrifugal compressor surge line (Watson & Janota, Turbocharging the ICE, ch. 3; Garrett GT/GTX maps):
// diffuser/inducer stall occurs below a minimum flow coefficient Q/(U*D^2), ~0.22 of choke flow at PR_ISLAND = 2.2
// and scaling with tip speed U ~ sqrt(PR^0.2857 - 1). Only active under boost (PR > 1.15).
const SURGE_FLOW_REF=0.22;
function compSurgeFlowFrac(pr){
  if(!(pr>1.15))return 0;
  return SURGE_FLOW_REF*Math.sqrt((Math.pow(pr,0.2857)-1)/(Math.pow(PR_ISLAND,0.2857)-1));
}
function isCompSurge(flowFrac,pr){return pr>1.15&&flowFrac<compSurgeFlowFrac(pr);}
const TURBO_PR_REF=2.0;   // frames are characterised at 1.0 bar of boost
// How strongly the spool point follows shaft speed. Calibrated (not guessed) so a small frame
// keeps its early-spooling character at low boost and clearly gives it up at high boost.
const SPOOL_PR_EXP=1.45;
// Turbo layouts (build 290): how many turbos, each its own wheel, turbine and shaft, so the pair's choke flow is two
// wheels' and each turbine takes its share of the exhaust. A sequential pair runs its primary alone until the pair is
// needed (unitsAt). Twin and sequential carried flow multiples of one wheel (1.85, 1.55) and spool and width multiples
// for the logistic fallback; retired. A COMPOUND is two stages in series, a large wheel feeding the frame's, each sized
// and stepped in compoundStage (build 294; it was one frame with 2.30 of its flow).
const TURBO_CONFIG={
  single:    {label:'SINGLE',     units:1},
  twin:      {label:'TWIN',       units:2},
  sequential:{label:'SEQUENTIAL', units:2},
  compound:  {label:'COMPOUND',   units:1}
};
// Supercharger types: boost fraction vs rpm = clamp(lo + (hi-lo)*(rpm/redline)^exp). Roots &
// twin-screw are positive-displacement (near-full boost from low rpm); centrifugal is a
// belt-driven compressor (boost rises with rpm²). drag = relative parasitic belt load.
const SC_TYPE={
  roots:      {label:'ROOTS',      lo:0.82,hi:1.00,exp:1,drag:1.25},
  screw:      {label:'TWIN-SCREW', lo:0.78,hi:1.00,exp:1,drag:1.00},
  centrifugal:{label:'CENTRIFUGAL',lo:0.04,hi:1.00,exp:2,drag:0.80}
};
// Off-boost bypass / mechanical parasitic drive floor as a fraction of full-boost drag:
// belt flexure, step-up drive, rotor windage and bypass circulation still draw ~15% at map <= 1
// (Eaton TVS bypass parasitic loss measurements; Heywood §6.8.2).
const SC_BYPASS_FRAC=0.15;
// Supercharger adiabatic (isentropic) efficiency by blower type, pressure ratio and speed fraction.
//   · Roots (Eaton TVS): no internal compression; ideal backflow efficiency is
//     (PR^((γ-1)/γ) - 1) / (((γ-1)/γ)*(PR - 1)) (Heywood §6.8.2 Eq. 6.36), scaled by ~0.74
//     volumetric/port efficiency for 4-lobe twisted rotors with clearance back-leakage roll-off above PR 2.0.
//   · Twin-screw (Lysholm/Whipple): internal compression (built-in volume ratio ~1.7 → PR ~2.0)
//     peaks ~0.74 around PR 2.0 and tapers with off-design over/under-compression (Whipple/Lysholm maps).
//   · Centrifugal (Rotrex/Vortech): belt-driven radial wheel tracking a parabolic operating line,
//     peaking ~0.77 at high speed and moderate PR, tapering at low speed and high PR > 2.4 (Rotrex/Vortech maps).
function scAdiabaticEff(scType,pr,rpmFrac){
  const PR=Math.max(1,pr||1),f=clamp(rpmFrac==null?0.85:rpmFrac,0,1);
  if(scType==='screw')return clamp(0.74-0.06*Math.pow(PR-2.0,2),0.45,0.76);
  if(scType==='centrifugal')return clamp(0.77-0.10*Math.pow(1-f,2)-0.05*Math.pow(Math.max(0,PR-2.4),2),0.45,0.78);
  const g=0.2857;   // (gamma - 1) / gamma for air (gamma = 1.4)
  const ideal=PR<=1.001?1:(Math.pow(PR,g)-1)/(g*(PR-1));
  return clamp(0.74*ideal-0.08*Math.pow(Math.max(0,PR-2.0),1.5),0.35,0.65);
}
const NITROUS_BAR={none:0,small:2.2,large:4.2};   // extra IMEP (bar) from a nitrous shot
// Water / methanol injection (E2): port/plenum mist under boost cools the intake charge by evaporation
// and (when methanol is blended) adds chemical knock resistance.
// Derived from:
//   · latent heat of vaporization: water h_fg = 2257 kJ/kg (at 100 °C, NIST / Moran & Shapiro),
//     methanol h_fg = 1100 kJ/kg (NIST / Heywood), dry air c_p = 1.005 kJ/(kg·K);
//   · BMW M4 GTS (S55, Bosch WaterBoost) reference: 5.0 L trunk tank, ~10-15% of WOT fuel mass flow
//     (~1.2% of air mass), ~25 °C charge cooling at full load, ~80% port evaporation effectiveness.
//   · 50/50 by mass: h_fg = 0.5*2257 + 0.5*1100 = 1678.5 kJ/kg, density = 1/(0.5/1.0 + 0.5/0.792) = 0.884 kg/L;
//     methanol RON 109 (FUELS.methanol) blended at ~15% of fuel mass raises effective octane.
const HFG_WATER=2257, HFG_METHANOL=1100, CP_AIR_KJ=1.005, WM_EVAP_EFF=0.80;
const WM_PUMP_AMPS=10;        // high-pressure diaphragm/Bosch pump current draw at 14 V (~140 W) when spraying
const WM_ONSET_MAP=1.10;      // bar abs (0.10 bar boost): progressive controller onset
const WM_FULL_MAP=1.40;       // bar abs (0.40 bar boost): full injection flow ratio
const WATER_METH={
  none: {label:'NONE',             flowRatio:0,     waterFrac:0,   methFrac:0,   hfg:0,      density:1.000, tankL:0,   cost:0,   massKg:0},
  water:{label:'WATER (H2O)',      flowRatio:0.012, waterFrac:1.0, methFrac:0.0, hfg:2257,   density:1.000, tankL:5.0, cost:850, massKg:8.0},
  wm50: {label:'50/50 WATER-METH', flowRatio:0.015, waterFrac:0.5, methFrac:0.5, hfg:1678.5, density:0.884, tankL:5.0, cost:950, massKg:7.5}
};
// Intercooler core: heat = residual charge-heat added per bar of boost (°C). A bigger core
// cools the charge far better (denser air, more knock margin) but its extra volume adds a
// little turbo spool lag (more plumbing to pressurise). None = no intercooler.
// Intercooler: `eff` is heat-exchanger effectiveness — the fraction of the compressor's
// temperature rise it gives back to ambient, which is how a core is actually rated. `lag` is the
// extra volume to fill, which costs spool response.
const INTERCOOLER={
  // pipe: metres of charge ducting compressor -> throttle; core: litres inside the intercooler. A
  // top-mount small core sits close; a front-mount large core runs the ducting the length of the bay.
  // w, h, d: the core's face (width along the charge's path, height) and depth in mm, fpi its cooling fins per inch
  // (build 255, the intercooler as a part): a top-mount's 250x150x80 and a front-mount's 600x250x75, about the cores
  // sold for such cars (probable). Each holds `core` of charge at IC_SIGMA of its gross volume (src/js/parts.js).
  // The quoted effectiveness each carried (0.62, 0.82) is retired (build 256): it comes from the core (icEps).
  none: {label:'NONE',      pipe:1.0,core:0.0},
  small:{label:'SMALL CORE',pipe:1.5,core:1.2,w:250,h:150,d:80,fpi:14},
  large:{label:'LARGE CORE',pipe:3.0,core:4.5,w:600,h:250,d:75,fpi:14}
};
// Catalytic converter: a three-way cat only cleans efficiently in a narrow window around
// stoich. conv = peak conversion efficiency; restrict = exhaust back-pressure (a small
// top-end VE loss, like an extra air filter). A modern engine uses a stock (high-flow-
// enough, high-conversion) cat; race builds delete it for flow at the cost of emissions.
const CAT={
  none: {label:'NONE (DECAT)',conv:0.00,restrict:0.00},
  sport:{label:'SPORT CAT',   conv:0.85,restrict:0.02},
  stock:{label:'STOCK CAT',   conv:0.97,restrict:0.05}
};

