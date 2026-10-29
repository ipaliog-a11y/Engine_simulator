// Fuel properties. density kg/L, LHV MJ/kg, stoich AFR (mass), octane (null → use the
// RON slider), chargeCool = evaporative charge cooling °C (denser charge + less knock),
// knockBonus = extra knock margin beyond octane. Alcohols: low energy/kg (more fuel flow)
// but great knock resistance + big charge cooling → more power headroom.
const FUELS={
  gasoline:{label:'PUMP GAS',density:0.745,LHV:44.0,stoich:14.7,octane:null,chargeCool:0, knockBonus:0},
  race:    {label:'RACE GAS',density:0.735,LHV:43.5,stoich:14.7,octane:105, chargeCool:2, knockBonus:2},
  e85:     {label:'E85',     density:0.785,LHV:29.2,stoich:9.8, octane:102, chargeCool:15,knockBonus:8},
  methanol:{label:'METHANOL',density:0.792,LHV:19.9,stoich:6.45,octane:109, chargeCool:25,knockBonus:14},
  diesel:  {label:'DIESEL',  density:0.832,LHV:42.8,stoich:14.5,octane:null,chargeCool:0, knockBonus:0}   // compression-ignition; octane N/A (cetane)
};
// ---- Engine cycle / type ----
// Each type reshapes the physics: strokeDiv is the power-stroke divisor in the torque
// equation (4π for 4-stroke, 2π for a power stroke every rev → 2-stroke & rotary), ci marks
// compression ignition (diesel: no spark, no spark-knock, runs lean), ports means no poppet
// valvetrain (2-stroke/rotary: cam & VVT don't apply). imep/eff/bsfc scale peak pressure,
// thermal efficiency and thirst; the cr/redline/afr ranges retarget the design sliders.
const ENGINE_TYPE={
  petrol4:  {label:'PETROL 4-STROKE',strokeDiv:4*Math.PI,ci:false,ports:false,imep:1.00,eff:1.00,bsfc:1.00,
             crDef:11,crMin:8,crMax:14,redlineDef:7000,redMin:5000,redMax:9500,fuel:null,maxCyl:12},
  diesel:   {label:'DIESEL (CI)',    strokeDiv:4*Math.PI,ci:true, ports:false,imep:1.02,eff:1.30,bsfc:1.00,
             crDef:18,crMin:15,crMax:24,redlineDef:4800,redMin:2000,redMax:5800,fuel:'diesel',maxCyl:12},
  twostroke:{label:'2-STROKE',       strokeDiv:2*Math.PI,ci:false,ports:true, imep:0.60,eff:0.80,bsfc:1.45,
             crDef:9, crMin:7,crMax:12,redlineDef:8000,redMin:5500,redMax:11000,fuel:null,maxCyl:6},
  // bsfc is fuel delivered per unit of fuel trapped, the charge that leaves unburned: a two-stroke
  // short-circuits ~30% of what it delivers (1/0.69 = 1.45). A rotary was 1.48 until build 100, which
  // only offset air flow being counted at half its real rate (one charge per two turns, the
  // four-stroke's): with the rate right it is 1, since a side-ported rotor has almost no overlap
  // to lose fresh charge through, and its thirst comes from what its charge does (imep), not from
  // charge it never burns.
  rotary:   {label:'ROTARY (WANKEL)',strokeDiv:2*Math.PI,ci:false,ports:true, imep:0.70,eff:0.74,bsfc:1.00,
             crDef:9.4,crMin:8.5,crMax:11,redlineDef:9000,redMin:6500,redMax:11000,fuel:null,maxCyl:4}
};
const LAYOUT_LABEL={inline:'INLINE',v:'V',boxer:'BOXER',rotary:'ROTARY'};
// Exhaust systems, as GEOMETRY rather than as an asserted VE bonus. What each grade means:
//   stock  a cast log manifold. Short, small-bore, and not a tuned pipe at all — every runner is a
//          different length, so the reflections arrive smeared and cancel. sigma says so.
//   sport  an off-the-shelf tubular header, cut for a generic mid-range rather than for this engine.
//   race   equal-length primaries cut on a jig FOR THIS ENGINE's power peak.
// dOverBore sizes the primary off the bore; sysD/sysL are everything downstream of the collector,
// which is where most of the back-pressure actually comes from. sigma is the spread in path length
// — literally what the claim "equal-length header" is about, and the reason nobody tunes past the
// 5th order. targetRpm null means "designed for whatever engine it is bolted to".
// sysV is the CYCLE-MEAN gas speed the system downstream of the collector is sized to reach at the
// power peak — the pipe diameter is then solved from the engine's own flow, because a 6.5 V12 and a
// 1.0 kei car do not run the same tailpipe. Design practice puts it near 75 m/s; a stock system is
// sized tighter for noise and cost, a race system is sized loose.
const EXHAUST={
  stock:{label:'STOCK CAST',   dOverBore:0.38,sysV:105,sysL:3.0,sigma:0.35,fixedL:0.55,targetRpm:null},
  sport:{label:'SPORT HEADER', dOverBore:0.46,sysV: 78,sysL:2.6,sigma:0.12,fixedL:null,targetRpm:5200},
  race: {label:'RACE HEADER',  dOverBore:0.54,sysV: 58,sysL:2.2,sigma:0.05,fixedL:null,targetRpm:null}
};
// Intake runner length, plenum to valve, before the head port is added. Measured geometry, not
// intent: a torque manifold really is about half a metre and an ITB stack really is a stub on the
// head. VARIABLE is a manifold with a flap in it — long below the crossover, short above — which
// is all a DISA or a VarioRam actually is.
const RUNNER={
  long:    {label:'LONG (TORQUE)', mm:460},
  medium:  {label:'MEDIUM',        mm:320},
  short:   {label:'SHORT (POWER)', mm:150},
  variable:{label:'VARIABLE',      mm:null}
};
// Camshaft profiles: bigger cams (more duration/lift/overlap) move the VE peak up,
// add top-end breathing & scavenging, but cost low-end VE and idle quality.
// Cam profiles now carry REAL GEOMETRY alongside the older shape multipliers:
//   lOverD  peak valve lift as a fraction of valve diameter
//   dur     seat-to-seat intake duration, crank degrees
//   accel   peak deceleration over the nose, as a fraction of what simple harmonic motion gives
//           for the same lift and duration. A gentle stock lobe stays near 0.80; a race lobe is
//           ground far more aggressively to buy area under the curve, and pays for it by floating
//           earlier at the same spring load. That is a trade a cam designer really makes.
//   lsa     lobe separation angle, ground into the cam. Wide (112-116) keeps a stock engine idling
//           smoothly and emissions-legal; race cams are ground tight (104-108) to buy overlap.
// Overlap is NOT a separate input — it falls out of duration and LSA as (dur_in + dur_ex)/2 - 2·LSA,
// and the sign convention is real: a stock cam comes out slightly NEGATIVE, which is exactly why a
// stock engine idles smoothly and scavenges nothing however good a header you bolt to it.
// scav/peakShift/lowLoss are GONE — the gas-dynamics conversion derives all three.
const CAM={
  stock:{ampMul:1.00,loWiden:1.00,idleRpm:0,  lOverD:0.22,dur:220,accel:0.80,lsa:114},
  sport:{ampMul:1.04,loWiden:0.82,idleRpm:150,lOverD:0.25,dur:252,accel:0.88,lsa:110},
  race: {ampMul:1.08,loWiden:0.66,idleRpm:400,lOverD:0.28,dur:284,accel:0.98,lsa:106},
  // Atkinson (build 188): the intake held open ~75 degrees past BDC (IVC = LSA + dur/2 - 180), so the piston pushes
  // part of the charge back out before it compresses: a shorter compression stroke than expansion stroke. The
  // breathing and cycle models take it from the closing angle (intakeFill, the compression from IVC): less charge,
  // so less power, and more expansion for what is burnt, so less fuel per kWh. A hybrid's motor fills in the torque.
  // Its phaser is built for it: 15 degrees of advance (vvtMax, against 45), so even fully advanced the intake closes
  // ~60 degrees after BDC and the engine stays an Atkinson flat out (the Ioniq's 105 PS from 1.6 L).
  atkinson:{ampMul:1.00,loWiden:1.00,idleRpm:0,lOverD:0.24,dur:260,accel:0.80,lsa:125,vvtMax:15}
};
