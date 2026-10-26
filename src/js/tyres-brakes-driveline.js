// ================================================================================================
// PHYSICS CORE — TYRE
// ------------------------------------------------------------------------------------------------
// Rolling resistance is not a constant. Hysteresis in a rolling tyre grows with how fast the
// carcass is deformed, so Crr climbs roughly with v². Michelin passenger-tyre data: about 0.010 at
// 80 km/h, 0.013 at 160, 0.016 at 200 — a 60% increase across the range a fast car actually uses,
// which the old fixed Crr simply ignored. Catalogue Crr below is the value quoted at 80 km/h.
const CRR_VREF=80/3.6;
const CRR_BETA=(0.016/0.010-1)/(Math.pow(200/3.6,2)-CRR_VREF*CRR_VREF);   // ≈2.31e-4 per (m/s)²
const crrAt=(crr0,v)=>crr0*(1+CRR_BETA*(v*v-CRR_VREF*CRR_VREF));
// Speed rating is the carcass limit: above it a tyre builds heat faster than it sheds it and a
// standing wave forms in the tread. The failure is delamination, not a gentle power cut.
//
// It is deliberately NOT derived here. Rating comes from the belt package and materials, and the
// obvious geometric proxy — sidewall height — gets it badly wrong: it rates a McLaren F1's tall
// 315/45R17 at 170 km/h when the real tyre is good for 390. So it is what it is in real life, a
// spec you choose when you buy the tyre.
//
// Exceeding it does NOT silently cap top speed. Four of the reference cars stop short of their
// drag-limited speed because of a manufacturer GOVERNOR, and capping them with a tyre rating would
// produce the right number through the wrong mechanism. The model says so instead, and wears the
// tyre out.
const SPEED_RATING={
  T:{kmh:190,label:'T (190)'},H:{kmh:210,label:'H (210)'},V:{kmh:240,label:'V (240)'},
  W:{kmh:270,label:'W (270)'},Y:{kmh:300,label:'Y (300)'},YY:{kmh:Infinity,label:'(Y) over 300'}
};
// "(Y)", the rating in brackets, is not a higher fixed figure. It means above 300 km/h, with the tyre
// tested to the top speed of the car it is made for, so it has no ceiling of its own to exceed. It was
// stored as 340, which warned on every car faster than that even on the best tyre there is.
// ================================================================================================
// Tyre compound: mu = peak grip coefficient (dry), crr = rolling resistance at 80 km/h, cost,
// rating = the speed rating such a tyre is typically sold in (an editable default, not a law).
// mu is the tyre on road asphalt at its reference load (tyreMu), the surface skidpads and brake tests
// are run on. Build 111: the sport, street, semi and slick values had been set nearer test-rig figures
// (abrasive belt surfaces grip ~15% harder than asphalt), so with build 109's load model the sport-tyre
// cars pulled 1.02-1.11 g against published 0.87-1.00, and the GT3 on Cup 2s 1.31 against ~1.10. Eco
// already matched. Re-set to asphalt, the skidpads land in the published range and the 100-0 stops
// lengthen with them, by the same amount (an E46 M3: 37.8 m against ~38.6 from its 161 ft from 70 mph).
// The drag radial keeps 1.70, a prepared drag strip's figure: that is the surface it is made for.
// For a race (build 137) each compound also has a working temperature window and a wear rate: tOpt the
// tread temperature (C) it grips best at, tWin how far either side it keeps most of that, wear the relative
// rate the tread goes for the same slip work. A softer, grippier compound works hotter in a narrower window
// and wears faster. These are fitted to the usual published ranges (a road tyre ~40-80 C, a semi 80-100,
// a slick 90-110), not derived. wetKeep (build 141) is the share of its dry grip a compound keeps on a
// wet track: a treaded road tyre clears water and keeps ~70%, a semi-slick about half, a slick, with no
// grooves at all, little over a third (it aquaplanes). Fitted to the usual wet-braking and wet-skidpad gaps.
const TIRE_TYPE={
  eco:     {label:'ECO/TOURING', mu:0.90,crr:0.010,cost:400, rating:'H', tOpt:55, tWin:40,wear:0.55,wetKeep:0.72},
  street:  {label:'STREET',      mu:0.95,crr:0.012,cost:600, rating:'V', tOpt:65, tWin:36,wear:0.75,wetKeep:0.70},
  sport:   {label:'SPORT',       mu:1.00,crr:0.013,cost:1000,rating:'Y', tOpt:78, tWin:32,wear:1.00,wetKeep:0.66},
  semi:    {label:'SEMI-SLICK',  mu:1.13,crr:0.014,cost:1600,rating:'YY',tOpt:88, tWin:26,wear:1.45,wetKeep:0.52},
  slick:   {label:'RACE SLICK',  mu:1.30,crr:0.016,cost:2400,rating:'YY',tOpt:98, tWin:22,wear:2.00,wetKeep:0.36},
  drag:    {label:'DRAG RADIAL', mu:1.70,crr:0.018,cost:2000,rating:'T', tOpt:70, tWin:22,wear:4.00,wetKeep:0.30}
};
// Aero elements — each adds a downforce coefficient (Cl·A, m²) and a drag penalty (ΔCd). The
// floor/diffuser is the efficient one (lots of downforce, little drag). Scaled by chassis.aero.
const AERO_FRONT={none:{cl:0,cd:0},splitter:{cl:0.25,cd:0.010},wing:{cl:0.60,cd:0.028}};
const AERO_REAR ={none:{cl:0,cd:0},lip:{cl:0.20,cd:0.008},wing:{cl:0.75,cd:0.035}};
// front = the share of a floor's downforce on the front axle: a flat undertray works the whole floor and
// acts near mid-wheelbase; a diffuser's suction peaks at its throat, ahead of the rear axle.
const AERO_FLOOR={none:{cl:0,cd:0},undertray:{cl:0.35,cd:0.006,front:0.5},diffuser:{cl:0.80,cd:0.014,front:0.35}};
const AERO_COST={none:0,splitter:600,wing:1800,lip:400,undertray:900,diffuser:2200};
// Weight reduction stages: kg removed and cost.
const WEIGHT_RED={none:{kg:0,cost:0},street:{kg:45,cost:1200},sport:{kg:95,cost:3500},race:{kg:170,cost:9000}};
// Brakes. Since build 107 fade comes from TEMPERATURE (brakeThermal): mat is the rotor material, vented
// whether it has cooling vanes, duct whether the kit brings a brake duct to the front rotors (build 110),
// and onset the rotor temperature (C) at which its pads begin to lose friction: a street pad ~400, a
// performance street pad ~550, a track pad ~650, carbon-ceramic ~1000.
// Since build 113 the torque comes from the hydraulics (brakeTorqueCap), not a fitted peak deceleration:
// pad = the pad's friction coefficient (an OE street pad ~0.38, a performance pad ~0.40, a track or
// carbon-ceramic pad ~0.45), and caliper = the piston diameters (mm) acting on ONE side of the rotor,
// front and rear: a sliding caliper's single piston (its reaction clamps the other pad with the same
// force), an opposed 4- or 6-pot's two or three per side. Catalogue sizes for each class of system.
const BRAKE_TYPE={
  // vented = the FRONT discs (build 144: every type; a plain road car's fronts are vented too, its rears are
  // solid, which ventR carries). Until build 144 the steel disc was solid all round.
  steel:  {label:'STEEL DISC',     pad:0.38,caliper:{f:[54],r:[34]},         mat:'iron',vented:true, ventR:false,onset:400, cost:600},
  slotted:{label:'SLOTTED/VENTED', pad:0.40,caliper:{f:[57],r:[38]},         mat:'iron',vented:true, ventR:true, onset:550, cost:1400},
  big:    {label:'BIG BRAKE KIT',  pad:0.45,caliper:{f:[40,44],r:[38]},      mat:'iron',vented:true, ventR:true, onset:650, duct:true,cost:3200},
  carbon: {label:'CARBON-CERAMIC', pad:0.45,caliper:{f:[34,38,44],r:[36,40]},mat:'ccm', vented:true, ventR:true, onset:1000,duct:true,cost:7000},
  // a heavy-duty truck's: twin-piston sliding calipers (two 60 mm pistons on one side), sized for 3+ tonnes
  hd:     {label:'HEAVY-DUTY',     pad:0.40,caliper:{f:[60,60],r:[54]},      mat:'iron',vented:true, ventR:true, onset:550, cost:1800}
};
// The most line pressure a driver can make in an emergency stop: the vacuum booster's run-out pressure
// plus what a hard push adds unassisted, ~100 bar on a road car.
const BRAKE_LINE_BAR=100;
// Pressure build-up (build 113): from the pedal going down to the brakes reaching the limit of the stop
// takes ~0.2 s (Limpert, Brake Design and Safety: 0.2-0.3 s for a hydraulic system with a booster; brake
// assist sits at the short end). Deceleration rises through it, which costs a 100-0 stop ~v x 0.1 s.
const BRAKE_RISE_S=0.2;
// Brake force the system can put on the road (N), pre-fade: per wheel 2 pads x pad mu x line pressure x
// piston area x effective radius (the middle of the friction ring, 0.4 D), over the tyre's radius.
function brakeForceCap(v){
  const bt=BRAKE_TYPE[v.brakeType]||BRAKE_TYPE.slotted, p=BRAKE_LINE_BAR*1e5;
  const axle=(pist,D)=>2*(2*bt.pad*p*pist.reduce((a,d)=>a+Math.PI/4*(d/1000)*(d/1000),0)*0.4*D);
  const f=axle(bt.caliper.f,v.rotor/1000),r=axle(bt.caliper.r,0.9*v.rotor/1000);
  // Both axles see the same line pressure, so the pistons and rotor radii fix the split (build 117).
  v.brakeFrontShare=f/(f+r);
  return (f+r)/v.rTire;
}
// ---- brake temperature (build 107; cooling rebuilt in build 110) ----
// Each rotor is a lump of material heated by the brakes and cooled by the air, and its pads lose grip
// above their onset temperature. The rotor, from its diameter D: a friction ring from 0.6 D to D, ~9% of
// D thick on a vented disc (two cheeks, 70% solid, around a vane gap of 0.4 of the thickness) and ~4.5%
// on a solid one; rears 0.9 of the fronts. Materials: grey iron 7200 kg/m3, cp 500 J/kgK, emissivity
// 0.55; carbon-ceramic 2450, 800, 0.8.
// Heat in: what the brakes (not the air, the tyres' rolling or the hill) take out of the car, m a v,
// shared front/rear by the axle loads while braking (ideal bias: f + (a/g) h/L), 90% into the rotor.
// Heat out, three ways (Limpert, Brake Design and Safety, ch. 3):
//  - the two faces and the rim, in the air the car drives through: h = 0.04 (k/D) Re^0.8 at the car's
//    speed (turbulent, Re > 2.4e5; 0.70 (k/D) Re^0.55 below);
//  - on a vented disc, the vanes, which are a centrifugal pump: the wheel turning at n rpm drives air
//    through them at 0.0158 n sqrt(Do^2 - Di^2) m/s, and they lose heat as a short duct does,
//    h = 0.023 [1 + (dh/l)^0.67] Re^0.8 Pr^0.33 (k/dh), no more than the air passing through can carry;
//  - radiation, from the outside surfaces only (the vanes face each other).
// Build 110: until then the faces saw half the car's speed in a flat-plate correlation, and the vanes
// were counted as 0.8 of extra face area in the outside air, radiating too; the 911 GT3 took 200 s to
// cool from 600 to 300 C at 150 km/h. Track kits (duct) also feed the front vanes from a brake duct:
// a 76 mm (3 in) hose whose inlet sees the car's dynamic pressure, against the hose's losses (entry
// 0.5, two bends 0.3 each, ~1 m of hose at f L/d 0.4, the dump into the rotor 1.0: K 2.5).
// Fade: pad friction falls from the onset, to the 35% loss the stops have always allowed, over 150 C.
const ROTOR_MAT={iron:{rho:7200,cp:500,eps:0.55},ccm:{rho:2450,cp:800,eps:0.80}};
const BRAKE_AMBIENT=25, FADE_SPAN=150, FADE_MAX=0.35;
const BRAKE_PREP_LAPS=1;   // laps the rotors run before the hot lap (build 135)
// air at a typical film temperature (~150 C): conductivity, kinematic viscosity, Prandtl, density, cp
const BRAKE_AIR={k:0.034,nu:2.9e-5,pr:0.70,rho:0.83,cp:1015};
const BRAKE_DUCT={d:0.076,K:2.5};
function brakeThermal(v){
  const bt=BRAKE_TYPE[v.brakeType]||BRAKE_TYPE.slotted, mat=ROTOR_MAT[bt.mat];
  const disc=(D,duct,vented)=>{
    const Di=0.6*D, t=(vented?0.09:0.045)*D, ring=Math.PI/4*(D*D-Di*Di);
    // The hat (build 144): a one-piece iron rotor's bell, from the hub bore (~0.3 D) out to the ring (0.6 D),
    // ~6 mm thick, plus its cylinder (~0.12 D deep) — about a fifth of the rotor's mass, and it heats and
    // cools with the ring. A carbon-ceramic disc rides on a separate alloy bell that is kept cool, so none.
    const hat=bt.mat==='iron'?ROTOR_MAT.iron.rho*0.006*(Math.PI/4*(Di*Di-0.09*D*D)+Math.PI*Di*0.12*D):0;
    const d={D,m:mat.rho*ring*t*(vented?0.7:1)+hat,Aout:2*ring+Math.PI*D*t,vented,duct:0};
    if(vented){
      // vanes: gap g, radial length l, pitch 1.5 g around the mean circumference; the channel faces are
      // the inside of both cheeks (less the vanes' footprint) and the two sides of every vane
      const g=0.4*t, l=(D-Di)/2, N=Math.PI*(D+Di)/2/(1.5*g);
      Object.assign(d,{g,l,dh:g,pump:0.0158*Math.sqrt(D*D-Di*Di),
        Avane:2*ring/1.5+2*N*l*g, Aflow:Math.PI*Di*g/1.5});
      if(duct) d.duct=Math.PI/4*BRAKE_DUCT.d*BRAKE_DUCT.d/Math.sqrt(BRAKE_DUCT.K);   // m3/s per m/s of car speed
    }
    return d;
  };
  const f=disc(v.rotor/1000,!!bt.duct,bt.vented), r=disc(0.9*v.rotor/1000,false,bt.ventR!==false);
  return {front:f,rear:r,cp:mat.cp,eps:mat.eps,onset:bt.onset,rTire:v.rTire};
}
// The heat the air takes from a rotor at T (C), the car at vCar (m/s): W.
function rotorCooling(T,disc,th,vCar){
  const amb=th.amb!=null?th.amb:BRAKE_AMBIENT;   // a race sets the day's air (build 141)
  const A=BRAKE_AIR, dT=T-amb, v=Math.max(1,vCar);
  const Re=v*disc.D/A.nu, h=(Re>2.4e5?0.04*Math.pow(Re,0.8):0.70*Math.pow(Re,0.55))*A.k/disc.D;
  const Tk=T+273.15, Ta=amb+273.15;
  let q=h*disc.Aout*dT+th.eps*5.67e-8*disc.Aout*(Tk*Tk*Tk*Tk-Ta*Ta*Ta*Ta);
  if(disc.vented){
    const rpm=vCar/th.rTire*60/(2*Math.PI), uPump=disc.pump*rpm, uDuct=disc.duct*vCar/disc.Aflow;
    const u=Math.max(0.1,Math.hypot(uPump,uDuct)), Rd=u*disc.dh/A.nu;
    // The duct correlation is for developed turbulent flow; the vanes run at Re ~1e3 and it gives ~25 W/m2K at
    // 800 rpm. Measured on a rotor with straight radial vanes, the vane coefficient is 27.0, 52.7 and 78.3 W/m2K
    // at 342, 684 and 1025 rpm, close to 0.076 per rpm (J. Applied Sciences 8 (2008) 3583; build 144): the
    // flow in a spinning passage is stirred, not developed. Take whichever is the higher.
    const hv=Math.max(0.076*rpm,0.023*(1+Math.pow(disc.dh/disc.l,0.67))*Math.pow(Rd,0.8)*Math.pow(A.pr,0.33)*A.k/disc.dh);
    // the air through the vanes warms as it goes: an exchanger of NTU = hA / (m cp)
    const mcp=A.rho*u*disc.Aflow*A.cp;
    q+=mcp*dT*(1-Math.exp(-hv*disc.Avane/mcp));
  }
  return q;
}
// One rotor over a time step: heat in (W), car speed (m/s). Returns the new temperature (C).
function rotorStep(T,disc,th,P,vCar,dt){
  return T+(0.9*P-rotorCooling(T,disc,th,vCar))*dt/(disc.m*th.cp);
}
const brakeFadeAt=(T,th)=>1-FADE_MAX*clamp((T-th.onset)/FADE_SPAN,0,1);
// Front/rear rotors through one braking step: decel a (m/s2) that the brakes do, at speed v. cv is the car
// (the loaded vehicle unless a race hands in one of its own: mass, brakeFrontShare, fWt, cg, wb, mu).
function brakeHeatStep(st,th,a,vCar,dt,cv,frIn){
  cv=cv||vehicle;
  const m=cv.mass, P=Math.max(0,m*a*vCar);
  // How the braking is shared (build 117). The hydraulics split it in a fixed ratio (the calipers and
  // rotors: brakeFrontShare). That holds until one axle's tyres reach their grip at its load, which the
  // load transfer moves forward as the car slows harder; ABS then holds that axle at its grip and the
  // other takes the rest, so at the limit the split is the axle loads'. It was the ideal load split at
  // every deceleration, floored at 50/50, so a light lift on a rear-engined car put half the heat in its
  // small, unducted rears and they ran hotter than the fronts.
  const fH=cv.brakeFrontShare||0.7, fL=clamp(cv.fWt+(a/G)*cv.cg/Math.max(0.5,cv.wb),0.05,0.95);
  const lim=(cv.mu||1)*TYRE_MU_X*G;   // the tyres' longitudinal grip, as a deceleration
  let fr=fH;
  if(frIn!=null)fr=frIn;                          // the lap solver's axle split (build 150), engine braking and all
  else if(a>1e-6){
    if(fH>fL)fr=Math.min(fH,lim*fL/a);            // the fronts saturate first: held at their grip
    else fr=Math.max(fH,1-lim*(1-fL)/a);          // the rears do
  }
  st.F=rotorStep(st.F,th.front,th,P*fr/2,vCar,dt);
  st.R=rotorStep(st.R,th.rear,th,P*(1-fr)/2,vCar,dt);
}
// Suspension: how far the body rolls per g of cornering (deg/g), the figure that separates them on a
// skidpad — a soft road car ~6, a sports setup ~4, coilovers ~2.5, a race car ~1.5. Roll tips the loaded
// outside tyre over onto positive camber, which costs it grip (latMuEff). Build 109: this replaces a
// fitted grip multiplier (0.95-1.10).
// Build 174: the roll is the car's own, from its springs and bars (rollStiffness). hz = the kit's ride frequency,
// the bounce of each corner's mass on its spring: a soft road car ~1.0 Hz, a sports setup ~1.25, track coilovers
// ~1.6, a race car without big aero ~2.0 (passenger cars 0.5-1.5 Hz, OptimumG, Springs & Dampers).
// camber = the static negative camber each is set up with (deg): a road alignment ~-0.5, a sports one ~-1,
// track coilovers ~-1.8, a race car ~-2.5, so that under roll the loaded tyre stands near its best angle.
const SUSPENSION={
  comfort: {label:'COMFORT',    hz:1.0, camber:-0.5,cost:400},
  sport:   {label:'SPORT',      hz:1.25,camber:-1.0,cost:1500},
  coilover:{label:'COILOVERS',  hz:1.6, camber:-1.8,cost:3200},
  race:    {label:'RACE/ADJUST',hz:2.0, camber:-2.5,cost:6500}
};
// Springs and anti-roll bars, each axle its own (build 174), in steps from SOFT -2 to STIFF +2 about the kit.
// An axle's springs resist roll with k t^2/2, k each wheel's rate: from the ride frequency, k = (m_axle/2)(2 pi f)^2,
// so K_springs = m_axle (2 pi f)^2 t^2 / 4. Its bar adds BAR_SHARE of that at STANDARD: a third of the total roll
// stiffness, which brings a typical car (roll arm 0.40 m, track 1.55 m) to the skidpad figures above, 6.1 / 3.9 /
// 2.4 / 1.5 deg/g. A spring step is 1.3x the rate (1.14x the frequency), a bar step 1.5x the bar: about 4% of the
// load transfer, build 157's ROLL BALANCE step. At STANDARD both axles share the kit's frequency, so the roll
// stiffness splits as m t^2, the weight split on equal tracks: build 157's NEUTRAL.
const BAR_SHARE=0.55, SPRING_STEP=1.3, BAR_STEP=1.5;
const STIFF_STEP_COST={spring:400,bar:250};   // per axle off STANDARD
// Roll stiffness of each axle (N m per rad) for car v (mass, fWt, tracks, kit, steps).
function rollStiffness(v){
  const w=2*Math.PI*(SUSPENSION[v.suspension]||SUSPENSION.sport).hz,w2=w*w;
  const ax=(m,t,sp,bar)=>{const k=m*w2*t*t/4;return k*Math.pow(SPRING_STEP,sp||0)+BAR_SHARE*k*Math.pow(BAR_STEP,bar||0);};
  return {F:ax(v.mass*v.fWt,v.trackF,v.springF,v.barF),R:ax(v.mass*(1-v.fWt),v.trackR,v.springR,v.barR)};
}
// Suspension geometry, each axle its own (build 173). Two things separate the types in a corner:
//   camber recovery — the share of the body roll the linkage claws back at the loaded outside wheel. An independent
//     wheel swings about its front-view instant centre, so rolling the body by phi moves the wheel phi*t/2 into bump
//     and turns it back by (phi*t/2)/fvsa: recovery = (t/2)/fvsa, from the axle's own track t and the front-view
//     swing-arm length fvsa (Milliken & Milliken, RCVD ch. 17). A strut's near-horizontal arm and tall strut put the
//     instant centre far out (~3 m: a quarter back); unequal wishbones bring it in (~1.6 m: about half); a road
//     multi-link sits between (~2 m). A solid axle keeps both wheels square to the road: all of it. A twist beam is
//     two trailing arms (none of it) tied by a beam (all of it) about 40% of the way back from the pivots.
//   roll centre (m) — the height at which the linkage takes the axle's side force. The load transfer of the mass
//     over the axle at that height goes through the links, not the springs, so a high roll centre puts more of the
//     car's transfer on its own axle. Independents 0.06-0.10 at ride height (rear independents 80-150 mm, twist
//     beams 100-150: Wang et al., K&C of a torsion beam suspension, VEHITS 2019); a solid axle's Panhard rod, Watt's
//     link or leaf springs locate it at its own wheel centre (rc null: the rolling radius).
//   front:false — a twist beam cannot steer. cost — fitting it where the car did not have it.
const SUSP_GEO={
  strut:    {label:'MACPHERSON STRUT',fvsa:3.0,rc:0.08, front:true, cost:2500},
  wishbone: {label:'DOUBLE WISHBONE', fvsa:1.6,rc:0.06, front:true, cost:5500},
  multilink:{label:'MULTI-LINK',      fvsa:2.0,rc:0.10, front:true, cost:4500},
  twist:    {label:'TWIST BEAM',      recov:0.4,rc:0.125,front:false,cost:1500},
  solid:    {label:'SOLID AXLE',      recov:1,  rc:null, front:true, cost:2000}
};
// The real cars' suspension (front, rear) and front and rear track (m). Sources: maker sheets where found
// (BMW media 2012, Porsche US 2021, GM, Nissan heritage), spec databases (carsales/Redbook, carexpert, conceptcarz,
// lambocars, encycarpedia, auto-data) where not; unsure marks a single weak source or sources that disagree.
const SUSP_REAL={
  'Suzuki Alto Works (HA36S, 2015)':{f:'strut',r:'twist',tf:1.295,tr:1.300,unsure:true},
  'Toyota Aygo 1.0 (2014)':{f:'strut',r:'twist',tf:1.430,tr:1.420},
  'Fiat 500 TwinAir 85 (2011)':{f:'strut',r:'twist',tf:1.413,tr:1.407},
  'Ford Fiesta 1.0 EcoBoost 125 (2013)':{f:'strut',r:'twist',tf:1.473,tr:1.461},
  'VW Golf GTI (Mk7, 2013)':{f:'strut',r:'multilink',tf:1.533,tr:1.514},
  'Toyota GR Yaris (2020)':{f:'strut',r:'wishbone',tf:1.535,tr:1.565},
  'Honda Civic Type R (FK8, 2017)':{f:'strut',r:'multilink',tf:1.600,tr:1.593,unsure:true},
  'Mazda MX-5 1.6 (NA, 1989)':{f:'wishbone',r:'wishbone',tf:1.405,tr:1.420},
  'Toyota Corolla Levin GT-APEX (AE86)':{f:'strut',r:'solid',tf:1.355,tr:1.345},
  'Honda S2000 (AP1, 2000)':{f:'wishbone',r:'wishbone',tf:1.470,tr:1.510},
  'BMW M3 (E46, 2000)':{f:'strut',r:'multilink',tf:1.508,tr:1.525},
  'Porsche 911 GT3 (991.2, 2017)':{f:'strut',r:'multilink',tf:1.551,tr:1.555},
  'Toyota Supra RZ (A80, 1993)':{f:'wishbone',r:'wishbone',tf:1.520,tr:1.525},
  'Nissan Skyline GT-R V-spec (R34, 1999)':{f:'multilink',r:'multilink',tf:1.480,tr:1.490},
  'Subaru Impreza WRX STI (GD, 2004)':{f:'strut',r:'strut',tf:1.490,tr:1.500,unsure:true},
  'Mitsubishi Lancer Evolution IX (2006)':{f:'strut',r:'multilink',tf:1.515,tr:1.515},
  'Audi RS3 Sportback (8V, 2017)':{f:'strut',r:'multilink',tf:1.559,tr:1.528},
  'Chevrolet Corvette (C6, LS3, 2008)':{f:'wishbone',r:'wishbone',tf:1.577,tr:1.542},
  'Chevrolet Corvette Z06 (C6, 2006)':{f:'wishbone',r:'wishbone',tf:1.607,tr:1.580,unsure:true},
  'Ford Mustang GT (2018)':{f:'strut',r:'multilink',tf:1.582,tr:1.648},
  'Dodge Challenger SRT Hellcat (2015)':{f:'wishbone',r:'multilink',tf:1.625,tr:1.618},
  'Ferrari F355 Berlinetta (1994)':{f:'wishbone',r:'wishbone',tf:1.514,tr:1.615},
  'Lamborghini Diablo VT (1993)':{f:'wishbone',r:'wishbone',tf:1.540,tr:1.640},
  'McLaren F1 (1994)':{f:'wishbone',r:'wishbone',tf:1.567,tr:1.473},
  'Porsche 911 Turbo (993, 1995)':{f:'strut',r:'multilink',tf:1.411,tr:1.504,unsure:true},
  'Ferrari Enzo (2002)':{f:'wishbone',r:'wishbone',tf:1.660,tr:1.650},
  'Porsche Carrera GT (2004)':{f:'wishbone',r:'wishbone',tf:1.612,tr:1.587},
  'Ford GT (2005)':{f:'wishbone',r:'wishbone',tf:1.600,tr:1.618},
  'Lamborghini Murciélago LP640 (2006)':{f:'wishbone',r:'wishbone',tf:1.635,tr:1.695},
  'Ferrari 458 Italia (2010)':{f:'wishbone',r:'multilink',tf:1.672,tr:1.606},
  'Lamborghini Huracán LP610-4 (2014)':{f:'wishbone',r:'wishbone',tf:1.668,tr:1.620},
  'McLaren 720S (2017)':{f:'wishbone',r:'wishbone',tf:1.674,tr:1.629},
  'Ferrari 812 Superfast (2017)':{f:'wishbone',r:'multilink',tf:1.672,tr:1.645,unsure:true},
  'Porsche 911 Turbo S (992, 2020)':{f:'strut',r:'multilink',tf:1.583,tr:1.600},
  'Lamborghini Huracán STO (2021)':{f:'wishbone',r:'wishbone',tf:1.688,tr:1.647,unsure:true},
  'Chevrolet Corvette Z06 (C8, 2023)':{f:'wishbone',r:'wishbone',tf:1.685,tr:1.678},
  'McLaren 750S (2023)':{f:'wishbone',r:'wishbone',tf:1.680,tr:1.629},
  'Mazda RX-7 (FD, 1993)':{f:'wishbone',r:'wishbone',tf:1.460,tr:1.460},
  'Mazda RX-8 (2004)':{f:'wishbone',r:'multilink',tf:1.496,tr:1.506},
  'VW Golf 2.0 TDI 150 (Mk7, 2013)':{f:'strut',r:'multilink',tf:1.549,tr:1.520,unsure:true},
  'BMW 330d (F30, 2012)':{f:'strut',r:'multilink',tf:1.543,tr:1.582},
  'Chevrolet Silverado 2500HD Duramax (2020)':{f:'wishbone',r:'solid',tf:1.745,tr:1.716}
};
// The factory geometry of a car record: a real car's own, else its archetype's. Saves from before build 173 carry
// none and take it from here, as their body's name still finds the car.
function factoryGeo(v){
  const r=v&&v.body&&SUSP_REAL[v.body.name];if(r)return {f:r.f,r:r.r};
  const f=(CHASSIS[v&&v.chassis]||CHASSIS.coupe).fit;return {f:f.geoF||'strut',r:f.geoR||'multilink'};
}
// One axle's camber recovery: (t/2)/fvsa for an independent wheel, the type's own figure otherwise.
function geoRecovery(g,track){return g.recov!=null?g.recov:clamp(track/2/g.fvsa,0,1);}
// ---- tyre grip from load (build 109) ----
// A tyre's friction coefficient falls as it is loaded harder — load sensitivity: about 10% less mu each
// time the load doubles, mu = mu_ref (Fz/Fz_ref)^-0.15. The compound's mu (TIRE_TYPE) is taken at 60%
// of the tyre's rated load, near what a road car puts on a tyre at rest. The rated load follows the
// tyre's air volume, pi/4 (D^2 - d^2) w, at ~16,300 kg per m3: it reproduces the load index of a
// 165/65R14 (437 kg), 205/55R16 (615) and 305/30R20 (875) within 3%. So a bigger tyre grips harder at
// the same load, a light car on big tyres harder still, and a heavy one less: the work three fitted
// multipliers did (chassis grip, suspension grip, a width bonus), done by one mechanism.
const LOAD_SENS=0.15, TYRE_RATED_KG_M3=16300, TYRE_REF_SHARE=0.6;
// Camber: a tyre makes its most lateral force leaning slightly into the turn, ~-1.5 deg, and loses ~1.5%
// of it per degree either side. The loaded outside tyre's angle is the static camber plus the body roll
// the suspension geometry does not claw back. Until build 173 that was half for every car; now each axle's own
// geometry sets it (SUSP_GEO), and CAMBER_RECOVERY stays only for a car object built without one.
const CAMBER_RECOVERY=0.5, CAMBER_LOSS=0.015, CAMBER_BEST=-1.5;
// The load-sensitivity curve (Fz/FzRef)^-LOAD_SENS, tabulated and interpolated: this is the lap solver's most-called
// function (a third of the time on a long circuit, build 157) and Math.pow its cost. 16384 steps over 0.05-8 times the
// reference load keep it within 2 parts in a million of the power law; outside that range it is computed.
const TMU_R0=0.05,TMU_N=16384,TMU_DR=(8-TMU_R0)/TMU_N,TMU_T=new Float64Array(TMU_N+1);
for(let k=0;k<=TMU_N;k++)TMU_T[k]=Math.pow(TMU_R0+k*TMU_DR,-LOAD_SENS);
function tyreMu(Fz,FzRef){
  const r=Math.max(200,Fz)/(FzRef||vehicle.FzRef),x=(r-TMU_R0)/TMU_DR,k=x|0;
  return vehicle.muRef*(k>=0&&k<TMU_N?TMU_T[k]+(TMU_T[k+1]-TMU_T[k])*(x-k):Math.pow(r,-LOAD_SENS));
}
// The friction ellipse (build 111): a tyre pulls harder along its length than across it. Peak
// longitudinal force runs 10-20% over peak lateral in tyre test data (Milliken & Milliken, RCVD ch. 2):
// driving or braking, the whole contact patch shears the same way at once, while a cornering tyre builds
// its force along the patch and only its rear part slides at the peak. The compound mu is the lateral
// figure (skidpads); braking and traction take 1.15 of it, and combined use follows the ellipse.
const TYRE_MU_X=1.15;
function tyreMuX(Fz,FzRef){return TYRE_MU_X*tyreMu(Fz,FzRef);}
// The tyre's force against its longitudinal slip (build 154), as a share of its peak: sin(C atan(B s)), the
// shape of Pacejka's Magic Formula with B set so the peak sits at TYRE_SLIP_OPT. C 1.4 leaves sin(0.7 pi) =
// 0.82 of the peak in a full slide (measured tyres 0.75-0.85). The peak at ~10% slip is dry asphalt's (6-15%
// measured); one figure for every compound.
const TYRE_SLIP_OPT=0.10, TYRE_SLIP_C=1.4, TYRE_SLIP_B=Math.tan(Math.PI/(2*TYRE_SLIP_C))/TYRE_SLIP_OPT;
function tyreSlipMu(s){const x=clamp(s,-3,3);return Math.sin(TYRE_SLIP_C*Math.atan(TYRE_SLIP_B*x));}
function tyreSlipMuD(s){const x=clamp(s,-3,3),u=TYRE_SLIP_B*x;
  return Math.abs(s)>3?0:Math.cos(TYRE_SLIP_C*Math.atan(u))*TYRE_SLIP_C*TYRE_SLIP_B/(1+u*u);}
// Cornering drag (build 119). A tyre makes its side force by running at a slip angle: its wheel points
// alpha off the way the car is going, and the force it makes, square to the wheel, leans back against
// the travel by that angle. Below the limit the side force is the cornering stiffness times the angle,
// Fy = CC Fz alpha, so the drag is Fy alpha = Fy^2 / (CC Fz), and summed over four tyres each carrying
// its share of the load, (m ay)^2 / (CC N). CC is the cornering coefficient, cornering stiffness per unit
// load: about 0.2 per degree for a radial tyre (Gillespie, Fundamentals of Vehicle Dynamics, ch. 10).
// Taken as linear right up to the limit, where a real tyre's slip angle runs further, so this is the
// least it can cost.
const TYRE_CC=0.2*180/Math.PI;   // per radian
function corneringDrag(m,ay,N){return m*m*ay*ay/(Math.max(1,N)*TYRE_CC);}
// The car's lateral grip as a share of its normal load N while cornering at ay (m/s2), dn of N being downforce.
// Build 157: per axle. Each axle has its own normal load (its weight share, and its share of the downforce by the
// aero balance), its own share of the lateral load transfer m ay h / t (the roll-stiffness distribution, set by the
// anti-roll bars: vehicle.lltdF), its own tyres (a staggered car's fronts are narrower), and the outside tyre's
// roll camber. In a steady corner each axle must make the side force for the mass it carries (front: m ay fWt),
// so the car corners only as hard as the axle that runs out first allows: the front (understeer) or the rear
// (oversteer). Until build 157 the four tyres' grip was pooled, so no car could be out of balance.
// Build 173: per axle, its own static camber and the share of the roll its geometry recovers (SUSP_GEO).
function latCamberF(ay,camber,recov){return 1-CAMBER_LOSS*Math.abs(camber+vehicle.rollGrad*Math.abs(ay)/G*(1-recov)-CAMBER_BEST);}
// one axle's two tyres at normal load Nax with lateral transfer d across them (N)
function axleLatCap(Nax,d,FzRef){
  const F=Nax/2,o=F+d,inr=Math.max(0,F-d);
  return tyreMu(o,FzRef)*o+(inr>0?tyreMu(inr,FzRef)*inr:0);
}
function latBalance(N,ay,dn,ax){
  const m=vehicle.mass,fWt=vehicle.fWt||0.55,aF=vehicle.aeroBal!=null?vehicle.aeroBal:0.5,lt=vehicle.lltdF!=null?vehicle.lltdF:fWt;
  const tr=ax||0;   // longitudinal load transfer onto the front (N): braking +, accelerating -
  const Nf=clamp((N-(dn||0))*fWt+(dn||0)*aF+tr,0.05*N,0.95*N),Nr=N-Nf;
  // the transfer's roll moment m ay h, shared by the roll balance and taken across each axle's own track (build 173)
  const M=m*Math.abs(ay)*vehicle.cg,tF=vehicle.trackF||vehicle.track,tR=vehicle.trackR||vehicle.track;
  const rF=vehicle.camRecF!=null?vehicle.camRecF:CAMBER_RECOVERY,rR=vehicle.camRecR!=null?vehicle.camRecR:CAMBER_RECOVERY;
  const cF=vehicle.camberF!=null?vehicle.camberF:vehicle.camber,cR=vehicle.camberR!=null?vehicle.camberR:vehicle.camber;
  const capF=axleLatCap(Nf,M*lt/Math.max(0.8,tF),vehicle.FzRefF)*latCamberF(ay,cF,rF),
        capR=axleLatCap(Nr,M*(1-lt)/Math.max(0.8,tR),vehicle.FzRef)*latCamberF(ay,cR,rR);
  // the lateral acceleration each axle alone would allow, as a share of N
  const muF=capF/Math.max(1,fWt*N),muR=capR/Math.max(1,(1-fWt)*N);
  return {mu:Math.min(muF,muR),muF,muR,capF,capR,Nf,Nr};
}
function latMuEff(N,ay,dn){return latBalance(N,ay,dn).mu;}
// Gearbox type. Four things separate them:
//   shift  — how long an upshift takes (s). A manual has to unload the clutch, move a lever and
//            re-engage; a sequential just bangs the next dog in under an ignition cut.
//   powershift — (build 171) the drive is NOT cut for it. A dual-clutch box and a planetary automatic
//            shift clutch to clutch: in the torque phase the oncoming clutch takes the torque as the
//            off-going one lets go, and in the inertia phase it slips while it pulls the engine down to the
//            new gear's speed, the ECU trimming the engine's torque to hold the output smooth (GM's
//            power-on upshift patents US 5046383, US 7762925, US 9327733; Goetz, Levesley & Crolla,
//            Proc IMechE D 219, 2005). The output never drops below the next gear's: the shift time is how
//            long the change takes, not a gap in the drive. A manual and a sequential do cut it.
//   eff    — driveline efficiency multiplier on top of the drive layout. Gear-to-gear losses are
//            small and similar; the outlier is the torque-converter auto, which slips fluid until
//            the lockup clutch engages.
//   stall/mult — torque converter only: the rpm it stalls up to against the brakes, and the
//            torque multiplication it gives while slipping. This is why an auto launches harder
//            than a manual despite being less efficient.
const GEARBOX={
  manual:    {label:'MANUAL (H-PATTERN)',shift:0.35,eff:1.00,stall:0,   mult:1.0, cost:1500},
  sequential:{label:'SEQUENTIAL',        shift:0.06,eff:0.99,stall:0,   mult:1.0, cost:7000},
  dct:       {label:'DUAL-CLUTCH (DCT)', shift:0.03,powershift:true,eff:0.98,stall:0,   mult:1.0, cost:9000},
  auto:      {label:'TORQUE-CONV AUTO',  shift:0.20,powershift:true,eff:0.93,stall:2400,mult:1.9, cost:3000}
};
// Differential. An axle's two driven wheels are never loaded exactly alike — road camber, engine
// torque reaction, axle wind-up and suspension geometry all unload one side. An OPEN diff can
// only feed each wheel the torque the *lesser-loaded* one can hold, so the usable share of the
// axle's grip is 1 − 2·asym for that asymmetry: it spins the light wheel and throws the rest
// away. A limited-slip locks the two together against a preload and recovers most of it; a spool
// welds them and recovers all of it.
//   traction — fraction of the driven axle's grip the diff can actually put down.
//   corner  — lateral-grip multiplier. The mirror image: locking the wheels together forces the
//             outer wheel to travel a longer arc at the same speed as the inner one, so a tyre
//             has to scrub, and the grip it burns scrubbing isn't available for cornering. An
//             open diff never binds and corners best; a spool binds hardest and pushes wide.
// Note traction only bites when the car is traction-limited: an engine-limited car sees no
// difference, which is why a diff transforms a powerful build and does nothing for a slow one.
// Together the two columns are the real trade: a spool is the best thing you can fit for a
// standing start and the worst for a lap.
// The clutch LSD is deliberately traction:1.00 — the model before differentials existed applied
// no penalty at all, so saves from then (which inherit DEFAULT_VEHICLE's clutch LSD) reproduce
// their old numbers exactly.
//   lock    — how strongly the two wheels are tied together (0 = open, 1 = welded). This is what
//             makes cornering different from a straight line: lateral load transfer unloads the
//             inside wheel far more than the small standing asymmetry does, so an open diff that
//             gives up 22% on a drag strip gives up most of its drive on a fast corner exit,
//             while a locked one keeps all of it. See lapDiffTraction().
const DIFF={
  open:  {label:'OPEN',            traction:0.78,corner:1.00,lock:0.00,cost:0},
  visc:  {label:'VISCOUS LSD',     traction:0.92,corner:0.99,lock:0.55,cost:900},
  clsd:  {label:'CLUTCH-PLATE LSD',traction:1.00,corner:0.97,lock:0.80,cost:2200},
  spool: {label:'SPOOL / LOCKED',  traction:1.04,corner:0.90,lock:1.00,cost:1200}
};
const DIFF_ASYM0=0.11;   // load asymmetry across a driven axle AT LAUNCH (gives open its 0.78)
const DIFF_CAMBER=0.03;  // …and what is left of it in a tall gear: road camber, essentially
// Load asymmetry across the driven axle, as a fraction of the axle's load. It is not a constant.
// Most of it is TORQUE REACTION — driveshaft wind-up, suspension anti-lift geometry, torque steer
// on a transverse layout — and that is proportional to the torque actually going through the
// axle. In first gear under full multiplication it is large; in third at 100 km/h the axle sees a
// fraction of that torque and little more than road camber is left. Treating the launch figure as
// if it applied at every speed is what pinned a powerful front-driver against the traction cap all
// the way to 100 km/h.
function axleAsym(tqFrac){return DIFF_CAMBER+(DIFF_ASYM0-DIFF_CAMBER)*clamp(tqFrac,0,1);}
// How much of the driven axle's grip the diff can actually use, given the lateral acceleration
// (which unloads the inside wheel) and how hard the axle is being driven. An open diff is governed
// by the lighter-loaded wheel; a locked one always commands the whole axle.
// Normalised so that at full axle torque and zero lateral g it returns exactly the quoted
// straight-line `traction` figure — so a standing start is unchanged, and with it the whole
// drag-strip diff trade and every saved build.
function diffTractionAt(df,aLat,cgH,tqFrac){
  const asym=axleAsym(tqFrac==null?1:tqFrac);
  const xfer=clamp((aLat/G)*(cgH/1.55),0,0.5-asym);           // lateral transfer, capped at lift
  const openUse=2*Math.max(0,0.5-asym-xfer);
  const use=df.lock+(1-df.lock)*openUse;
  const useRef=df.lock+(1-df.lock)*2*(0.5-DIFF_ASYM0);        // the reference `traction` is quoted at
  return df.traction*(use/useRef);
}
// Cornering-only form, kept for the lap solver's readability.
function lapDiffTraction(df,aLat,cgH){return diffTractionAt(df,aLat,cgH,1);}
// Share of the ENGINE's weight on the front axle, from where it sits: a front-engined car carries it
// just behind the front axle (~0.1 of the wheelbase), a mid-engined one ahead of the rear axle (~0.7), a
// rear-engined one behind it (~1.1), so 1 - x/wheelbase. Used only for the CHANGE an engine swap makes.
const ENGINE_FRONT_SHARE={front:0.9,mid:0.3,rear:-0.1};
const engineLayoutOf=(chassis,body)=>(body&&body.engPos)||(['super','hyper','proto'].includes(chassis)?'mid':'front');
// ---- rotating parts (build 106) ----
// The flywheel is sized by the clutch it carries, and the clutch by the torque it must hold: ~1.3x peak,
// the usual design margin. A single dry plate has two faces, mu ~0.3, at a face pressure ~0.25 MPa with
// the inner radius 0.65 of the outer; its capacity n mu p pi (Ro^2 - Ri^2) r_mean comes to 0.226e6 Ro^3,
// so Ro = (T_cap / 0.226e6)^(1/3): 252 mm across for a 2.0 turbo, 298 for an LS, as real ones are. The
// flywheel is a steel disc 15% larger and 25 mm thick, 1/2 rho pi R^4 t; the clutch cover and plate add
// ~30% of that and the crank, rods and pistons ~25%. ~0.10 kg m2 for a 2.0, ~0.23 for a V8.
const CLUTCH_MARGIN=1.3;
const clutchRadius=tq=>Math.cbrt(Math.max(5,tq*CLUTCH_MARGIN)/0.226e6);
function engineInertia(peakTq){
  const R=1.15*clutchRadius(peakTq), fly=0.5*7800*Math.PI*Math.pow(R,4)*0.025;
  return fly*(1+0.30+0.25);
}
// The wheels and tyres, all four, from the fitted size. A tyre's mass is mostly tread and belts across
// its width at the outside (~15 kg/m2) and sidewall (~6 kg/m2); an alloy wheel ~0.075 kg per square inch
// of diameter x rim width, the rim ~0.8 of the tyre's width. That gives 8-11 kg tyres and 8-12 kg
// wheels across 15-20 inch fitments, as they weigh. Radii of gyration: 0.85 of the tyre's outer radius
// (the mass is at the tread), 0.7 of the rim's.
function roadWheelInertia(v){
  const D=2*v.rTire,dr=v.wheelDia*0.0254,w=v.tireWidth/1000;
  const mt=15*Math.PI*D*w+6*2*Math.PI/4*(D*D-dr*dr), mw=0.075*v.wheelDia*(0.8*w/0.0254);
  return 4*(mt*Math.pow(0.85*D/2,2)+mw*Math.pow(0.7*dr/2,2));
}
// The mass a drive force has to accelerate in a gear: the car, plus its spinning parts seen through the
// gearing, I/r^2 at the wheel (Gillespie). The engine counts only while it is coupled to the wheels:
// not while the clutch slips or a shift is under way. (Ratio 0 = not coupled.)
function vehicleMassEff(totalRatio){
  const r=vehicle.rTire;
  return vehicle.mass+((vehicle.wheelI||0)+(totalRatio>0?(powertrain().inertia()||0)*totalRatio*totalRatio*vehicle.driveEff:0))/(r*r);
}
// Drivetrain: driveline efficiency (crank→wheels) and the driven-axle description.
const DRIVE_EFF={fwd:0.92,rwd:0.90,awd:0.86};
const AIR_RHO=1.20;   // air density kg/m³
const G=9.81;
