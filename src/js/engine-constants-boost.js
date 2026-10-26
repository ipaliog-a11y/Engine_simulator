const RAD_CAP={small:0.75,stock:1.0,large:1.35};   // relative heat-rejection capacity
const IMEP_K=13.2;   // bar — ONLY scales the dyno brake's reference torque now (loadRefTq); torque itself comes from fuel
// Dynamic (throttle-driven) model tuning:
const PUMP_K=0.9;    // pumping loss (bar) at full manifold vacuum → engine braking
const MAP_K=9;       // manifold-pressure response rate (1/s) — fast
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
const TURB_WHEEL=0.90;         // turbine wheel as a fraction of the compressor exducer
// Turbine throat for a housing A/R. A/R is the volute throat area over the radius to its centroid,
// so A_throat = (A/R) x R. A vane ring sets its own throat (vaneThroatArea, build 168).
function setTurbineAR(ar){
  const e=engine, exd=e.compExd;
  // R is the radius to the centroid of the throat section (build 133; it was the wheel's radius, which made every
  // throat 1.5-1.8x too small). The section sits just outside the wheel tip, a circle of area A = k R, so
  // R = r_tip + sqrt(k R / pi): a quadratic in sqrt(R).
  const rt=TURB_WHEEL*exd/2, k=ar*AR_INCH;
  const sq=(Math.sqrt(k/Math.PI)+Math.sqrt(k/Math.PI+4*rt))/2;
  const a0=k*sq*sq;
  e.turbineAR=ar;
  // a VGT's throat is its vane ring's, not the volute's (build 168): the housing A/R does not size it
  e.turbineArea=e.vgt?vaneThroatArea(exd,VANE_BETA_MAX):a0;
  e.vgtShut=e.vgt?vaneThroatArea(exd,VANE_BETA_MIN):0;
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
const boostTarget=rpm=>Math.min(engine.maxBoost*boostTaperFrac(rpm)*govBoostFrac(rpm),tqLimitBoost(rpm));
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
  const sv={afr:state.afr,coolant:state.coolant,oil:state.oil,engineHealth:state.engineHealth,blown:state.blown,iat:state.iat,systemVoltage:state.systemVoltage,nitrousActive:state.nitrousActive};
  const savedAfrMode=e.afrMode;e.afrMode='fixed';
  state.coolant=90;state.oil=100;state.engineHealth=1;state.blown=false;state.iat=20;state.systemVoltage=14.0;state.nitrousActive=false;
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
// The frame an engine runs (build 131): the size class, or the maker's own compressor wheel where it is known
// (COMPRESSOR WHEEL, mm at the exducer), with its housings scaled with it (a geometrically similar volute: A/R is
// a length).
function turboFrame(e){
  const tb=TURBO[e.turboSize]||TURBO.medium;
  if(!(e.compExd_mm>0))return tb;
  const exd=e.compExd_mm/1000,k=exd/tb.exd;
  return Object.assign({},tb,{exd,ars:tb.ars.map(a=>a*k)});
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
const compChokeFlow=exd=>COMP_BLOCKAGE*(101325/(287*298))
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
const TURBO_PR_REF=2.0;   // frames are characterised at 1.0 bar of boost
// How strongly the spool point follows shaft speed. Calibrated (not guessed) so a small frame
// keeps its early-spooling character at low boost and clearly gives it up at high boost.
const SPOOL_PR_EXP=1.45;
// Turbo configuration: multipliers on the base (size) spool point / width / top-end choke /
// response / rated flow. Twin spools earlier & flows better; sequential spools very early and
// stays flat; compound stages two compressors, so it makes big low-end and flows the most.
const TURBO_CONFIG={
  single:    {label:'SINGLE',     spool:1.00,width:1.00,flow:1.00},
  twin:      {label:'TWIN',       spool:0.82,width:1.10,flow:1.85},
  sequential:{label:'SEQUENTIAL', spool:0.60,width:1.55,flow:1.55},
  compound:  {label:'COMPOUND',   spool:0.68,width:1.35,flow:2.30}
};
// Supercharger types: boost fraction vs rpm = clamp(lo + (hi-lo)*(rpm/redline)^exp). Roots &
// twin-screw are positive-displacement (near-full boost from low rpm); centrifugal is a
// belt-driven compressor (boost rises with rpm²). drag = relative parasitic belt load.
const SC_TYPE={
  roots:      {label:'ROOTS',      lo:0.82,hi:1.00,exp:1,drag:1.25},
  screw:      {label:'TWIN-SCREW', lo:0.78,hi:1.00,exp:1,drag:1.00},
  centrifugal:{label:'CENTRIFUGAL',lo:0.04,hi:1.00,exp:2,drag:0.80}
};
const NITROUS_BAR={none:0,small:2.2,large:4.2};   // extra IMEP (bar) from a nitrous shot
// Intercooler core: heat = residual charge-heat added per bar of boost (°C). A bigger core
// cools the charge far better (denser air, more knock margin) but its extra volume adds a
// little turbo spool lag (more plumbing to pressurise). None = no intercooler.
// Intercooler: `eff` is heat-exchanger effectiveness — the fraction of the compressor's
// temperature rise it gives back to ambient, which is how a core is actually rated. `lag` is the
// extra volume to fill, which costs spool response.
const INTERCOOLER={
  // pipe: metres of charge ducting compressor -> throttle; core: litres inside the intercooler. A
  // top-mount small core sits close; a front-mount large core runs the ducting the length of the bay.
  none: {label:'NONE',      eff:0.00,pipe:1.0,core:0.0},
  small:{label:'SMALL CORE',eff:0.62,pipe:1.5,core:1.2},
  large:{label:'LARGE CORE',eff:0.82,pipe:3.0,core:4.5}
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

