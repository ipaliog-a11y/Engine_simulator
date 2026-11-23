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
// cc = the cornering stiffness per unit load, per degree (sources at corneringDrag, below).
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
// a slick 90-110), not derived. Wet grip comes from each compound's tread and pressure (RACE_TREAD, race.js).
const TIRE_TYPE={
  eco:     {label:'ECO/TOURING', mu:0.90,cc:0.28,crr:0.010,cost:400, rating:'H', tOpt:55, tWin:40,wear:0.55},
  // premium (build 353): a premium touring tyre built for low rolling resistance, the kind EVs leave the factory on
  // (Tesla Model 3: Michelin Primacy 4; Model Y: Continental ProContact RX / Hankook Ventus S1 evo3 ev: probable,
  // from parts listings). Grip as street, rolling resistance as eco; the race window and wear sit between the two.
  premium: {label:'PREMIUM TOURING',mu:0.95,cc:0.28,crr:0.010,cost:800, rating:'W', tOpt:60, tWin:38,wear:0.65},
  street:  {label:'STREET',      mu:0.95,cc:0.28,crr:0.012,cost:600, rating:'V', tOpt:65, tWin:36,wear:0.75},
  sport:   {label:'SPORT',       mu:1.00,cc:0.32,crr:0.013,cost:1000,rating:'Y', tOpt:78, tWin:32,wear:1.00},
  semi:    {label:'SEMI-SLICK',  mu:1.13,cc:0.42,crr:0.014,cost:1600,rating:'YY',tOpt:88, tWin:26,wear:1.45},
  slick:   {label:'RACE SLICK',  mu:1.30,cc:0.54,crr:0.016,cost:2400,rating:'YY',tOpt:98, tWin:22,wear:2.00},
  drag:    {label:'DRAG RADIAL', mu:1.70,cc:0.20,crr:0.018,cost:2000,rating:'T', tOpt:70, tWin:22,wear:4.00}
};
// Aero elements — each adds a downforce coefficient (Cl·A, m²) and a drag penalty (ΔCd). The
// floor/diffuser is the efficient one (lots of downforce, little drag). Scaled by chassis.aero.
// The kit WING (build 415) is no longer a table row: it is a wing part (wingAero below), drawn from the car's own wing
// (fit.wingR / fit.wingF), else its class's, else the PARTS page's starting wing as wide as the car's track (kitWing).
// Until then it was ClA 0.60 (front) and 0.75 (rear) times the class's aero factor, ΔCd 0.028 and 0.035: fitted.
const AERO_FRONT={none:{cl:0,cd:0},splitter:{cl:0.25,cd:0.010},wing:{cl:0,cd:0,part:true}};
const AERO_REAR ={none:{cl:0,cd:0},lip:{cl:0.20,cd:0.008},wing:{cl:0,cd:0,part:true}};
// front = the share of a floor's downforce on the front axle: a flat undertray works the whole floor and
// acts near mid-wheelbase; a diffuser's suction peaks at its throat, ahead of the rear axle.
const AERO_FLOOR={none:{cl:0,cd:0},undertray:{cl:0.35,cd:0.006,front:0.5},diffuser:{cl:0.80,cd:0.014,front:0.35}};
// A rear wing as a part (build 291): its span, chord, angle, camber and end plates, by Prandtl's lifting line for an
// untwisted wing of elliptic loading (Anderson, Fundamentals of Aerodynamics, ch. 4 and 5):
//   lift slope a = a0 / (1 + a0 / (pi AR)), with a0 = 2 pi per radian for a thin section;
//   zero-lift angle -2 f/c for a parabolic camber line of height f (thin-aerofoil theory);
//   induced drag CL^2 / (pi AR).
// End plates raise the aspect ratio the wing works at: AR (1 + 1.9 h/b) (Hoerner & Borst, Fluid-Dynamic Lift, ch. 3).
// Profile drag is turbulent skin friction on both faces, Cf = 0.074 Re^-0.2 (Prandtl; Schlichting, Boundary-Layer
// Theory), times a section's form factor 1 + 2 t/c + 60 (t/c)^4 (Hoerner, Fluid-Dynamic Drag, ch. 6); the plates add
// their own skin. The model's ClA and CdA do not change with speed, so the Reynolds number is taken at WING_V.
// Not modelled: the body's flow the wing sits in (it is taken in clean air), what it does to the body's own lift and
// drag, its overhang behind the axle, and the fall of lift past the stall (the lift is held at WING_CLMAX there).
const WING_A0=2*Math.PI;
const WING_CLMAX=1.5;   // a single cambered element's stall: NACA 4412, about 1.5 at Re 3e6 (Abbott & von Doenhoff, Theory of Wing Sections; probable at a car wing's lower Re)
const WING_TC=0.12;     // the section's thickness over its chord: the 12% of the common NACA 4412 / 6412 family, taken for every wing
const WING_V=50;        // m/s (180 km/h): where the skin friction's Reynolds number is taken
const AIR_NU=1.5e-5;    // m2/s, air's kinematic viscosity at 20 C
// A front wing (build 306) is the same wing low over the road, height_mm to its quarter chord. The ground takes away part
// of its downwash, as a mirror image of its trailing vortices does: the induced drag is that of a free wing times
// phi = (16 h/b)^2 / (1 + (16 h/b)^2), so the wing works at an aspect ratio AR/phi (Wieselsberger 1921; McCormick,
// Aerodynamics, Aeronautics and Flight Mechanics, ch. 9). Only this span effect is modelled: the venturi under a wing
// within a tenth of its chord of the road, which adds more suction and then stalls it (Zerihan & Zhang, J. Aircraft 37,
// 2000), is not; nor the bumper's flow it sits in.
function wingGround(b,hg){if(!(hg>0))return 1;const x=Math.pow(16*hg/b,2);return x/(1+x);}
function wingAero(p){
  const b=p.span_mm/1000,c=p.chord_mm/1000,h=p.plate_mm/1000,S=b*c,AR0=b/c,ge=wingGround(b,(p.height_mm||0)/1000),AR=AR0*(1+1.9*h/b)/ge;
  const a=WING_A0/(1+WING_A0/(Math.PI*AR)),want=a*(p.angle_deg*Math.PI/180+2*p.camber_pct/100),CL=clamp(want,0,WING_CLMAX);
  const Cf=0.074*Math.pow(WING_V*c/AIR_NU,-0.2),cd0=2*Cf*(1+2*WING_TC+60*Math.pow(WING_TC,4)),cdi=CL*CL/(Math.PI*AR);
  const plates=4*Cf*h*c;   // two plates, two faces each, a chord long
  return {S,AR0,AR,ge,slope:a,CL,want,stalled:want>WING_CLMAX,cd0,cdi,clA:CL*S,cdA:(cd0+cdi)*S+plates};
}
// The geometry of the kit wing a car carries (build 415): the car's own, else its class's, else the starting wing of the
// PARTS page (as wide as the track, 250 mm chord, 8 degrees (front 6), 6% camber; the front 100 mm off the road).
function kitWing(v,front){
  const ch=CHASSIS[v.chassis]||{},own=v.body&&v.body.fit&&v.body.fit[front?'wingF':'wingR'],cls=ch.fit&&ch.fit[front?'wingF':'wingR'];
  if(own||cls)return own||cls;
  const b=Math.round(((front?v.trackF:0)||v.track||ch.track||1.5)*100)*10;
  return front?{span_mm:b,chord_mm:250,angle_deg:6,camber_pct:6,plate_mm:100,height_mm:100}:{span_mm:b,chord_mm:250,angle_deg:8,camber_pct:6,plate_mm:150};
}
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
const R13H_Z=0.8;   // the deceleration (g) up to which the front axle must lock first (UN ECE R13-H annex 5)
function brakeForceCap(v){
  const bt=BRAKE_TYPE[v.brakeType]||BRAKE_TYPE.slotted, p=BRAKE_LINE_BAR*1e5;
  const axle=(pist,D)=>2*(2*bt.pad*p*pist.reduce((a,d)=>a+Math.PI/4*(d/1000)*(d/1000),0)*0.4*D);
  // A real car carries its own front caliper where the type's catalogue one is not it (build 211: the GNX's single 2.5 in
  // piston, the Grand Cherokee SRT's Brembo six-pot), while its factory brakes are fitted.
  const own=v.body&&v.body.fit&&v.body.fit.caliperF&&v.brakeType===v.body.fit.brake?v.body.fit.caliperF:null;
  const f=axle(own||bt.caliper.f,v.rotor/1000);
  // Both axles see the same line pressure, so the pistons and rotor radii fix the split (build 117). Build 203: the rear
  // is sized to the car, as its maker sizes it, not taken from the kit. Until then every car braked 71-74% on the front,
  // the kit's split, whatever its weight: a 911's rears did too little and stayed near cold on a lap, where measured ones
  // run as hot as the fronts. The rule: UN ECE R13-H (and FMVSS 135) require the front axle to lock first at every
  // deceleration from 0.15 to 0.8 g, so the front's share of the braking is at least its share of the load while
  // braking at 0.8 g, fWt + 0.8 h/L; makers sit at that line, where the rears do the most they safely can. The front
  // calipers stay the kit's, and the rear's force follows.
  if(v.brakePart){const q=brakePartPress(v.brakePart),r=q.r*axle(Array(v.brakePart.rearPistons).fill(v.brakePart.rearPistonD_mm),v.brakePart.rearRotor_mm/1000);
    v.brakeFrontShare=q.f*f/(q.f*f+r);return (q.f*f+r)/v.rTire;}
  const ideal=v.fWt>0&&v.wb>0?v.fWt+R13H_Z*(v.cg||0.5)/v.wb:0;
  const fH=ideal>0?clamp(ideal,0.5,0.85):f/(f+axle(bt.caliper.r,0.9*v.rotor/1000));
  const r=f*(1-fH)/fH;
  v.brakeFrontShare=fH;
  return (f+r)/v.rTire;
}
// ---- brake balance as a part (build 312) ----
// A race pedal box: the pedal pushes a balance bar between two master cylinders, one for each axle. The bar's pivot
// gives the front cylinder `bar` of the pedal's force and the rear the rest, and each cylinder's bore turns its force
// into its line's pressure, p = F / (pi/4 d^2). The driver's push stays the one BRAKE_LINE_BAR is quoted at: a 50/50
// bar on two cylinders of the reference bore gives each line BRAKE_LINE_BAR, as one cylinder does. Reference bore
// 0.75 in (19.05 mm), the most fitted size in the makers' race ranges (Tilton 78-series, AP Racing CP2623; PROBABLE as
// "typical"). The front calipers and rotor stay the kit's; the rear caliper (pistons a side) and rotor are the part's.
// The front share is then the hydraulics' alone, f/(f+r), in place of the R13-H line the factory rear is sized to.
const BRAKE_MC_REF_MM=19.05;
function brakePartPress(p){
  const k=d=>(BRAKE_MC_REF_MM/d)*(BRAKE_MC_REF_MM/d);
  return {f:2*p.bar_pct/100*k(p.mcF_mm),r:2*(1-p.bar_pct/100)*k(p.mcR_mm)};   // each line's pressure over BRAKE_LINE_BAR
}
// The deceleration (g) at which each axle reaches its grip with no ABS, at a fixed front share fH, the tyres' grip mu,
// the static front share fW and h/L: the front at mu fW/(fH - mu h/L), the rear at mu (1-fW)/(1-fH + mu h/L). The
// first to arrive locks; past the crossover zc = (fH - fW) L/h the rear locks first (R13-H wants zc >= 0.8).
function brakeLockOrder(fH,mu,fW,hL){
  const zF=fH>mu*hL?mu*fW/(fH-mu*hL):Infinity,zR=mu*(1-fW)/(1-fH+mu*hL);
  return {zF,zR,z:Math.min(zF,zR),first:zF<=zR?'front':'rear',zc:(fH-fW)/hL};
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
// zeta = the dampers' ratio to critical damping in bounce (build 216): passenger cars 0.2-0.3 (the textbooks' figure,
// and ~0.3 measured on passenger cars: Slaski), race cars 0.5-0.7 (Kasprzak, A Guide to Your Dampers, FSAE), and 0.45
// called the optimum for a racing car (Milliken). A sports setup and track coilovers sit between.
const SUSPENSION={
  comfort: {label:'COMFORT',    hz:1.0, camber:-0.5,zeta:0.25,cost:400},
  sport:   {label:'SPORT',      hz:1.25,camber:-1.0,zeta:0.30,cost:1500},
  coilover:{label:'COILOVERS',  hz:1.6, camber:-1.8,zeta:0.45,cost:3200},
  race:    {label:'RACE/ADJUST',hz:2.0, camber:-2.5,zeta:0.60,cost:6500}
};
// Springs and anti-roll bars, each axle its own (build 174). With no part fitted, the kit's: an axle's springs resist
// roll with k t^2/2, k each wheel's rate: from the ride frequency, k = (m_axle/2)(2 pi f)^2, so
// K_springs = m_axle (2 pi f)^2 t^2 / 4. Its bar adds BAR_SHARE of that: a third of the total roll stiffness, which
// brings a typical car (roll arm 0.40 m, track 1.55 m) to the skidpad figures above, 6.1 / 3.9 / 2.4 / 1.5 deg/g. Both
// axles share the kit's frequency, so the roll stiffness splits as m t^2, the weight split on equal tracks: NEUTRAL.
// SPRINGS, BARS & DAMPERS as a part (build 420, in place of build 174's SOFT/STIFF steps): each axle's rates from
// their dimensions (suspAxle below).
const BAR_SHARE=0.55;
//   spring  a helical coil's rate k = G d^4 / (8 D^3 n): d the wire, D the mean coil diameter, n the active coils
//           (Shigley, Mechanical Engineering Design, 10th ed., eq. 10-9); at the wheel MR^2 k, MR the spring's travel
//           over the wheel's. G = 77.2 GPa, chrome-silicon spring wire (ASTM A401; Shigley table 10-5).
//   bar     a solid torsion bar of diameter d between its two arms, length L: GJ/L, J = pi d^4 / 32. Rolling the car by
//           phi moves each link by MR phi t/2, which twists the bar by MR phi t / a over its arms a, and the arm's force
//           comes back to the wheels as a couple: K = (GJ/L) (MR t / a)^2 (Milliken & Milliken, RCVD, ch. 16).
//           G = 79.3 GPa, carbon and alloy steels (Shigley table A-5). The arms' bending and the bushes' give are left out.
//   damper  its low-speed slope in bound (N s/m, a damper dyno's figure) and its rebound over bound (build 364's
//           DAMPER_RB, here the part's own); at the wheel MR^2 of it, on the spring's MR (a coilover).
const SPRING_G=77.2e9, BAR_G=79.3e9;
const springRate=(dMm,DMm,n)=>SPRING_G*Math.pow(dMm/1000,4)/(8*Math.pow(DMm/1000,3)*n);         // N/m at the spring
const barTwistK=(dMm,LMm)=>BAR_G*Math.PI*Math.pow(dMm/1000,4)/32/(LMm/1000);                      // N m per rad of twist
const barRollK=(P,ax,t)=>{const a=P['barArm'+ax+'_mm']/1000,m=P['barMr'+ax];return barTwistK(P['barD'+ax+'_mm'],P['barL'+ax+'_mm'])*Math.pow(m*t/a,2);};
// One axle's rates from a fitted part ('F' or 'R'), or null for the kit's: the wheel rate ks (N/m), the bar's roll
// stiffness kb (N m/rad), the mean damping at the wheel cs (N s/m, bound and rebound's mean) and rebound over bound rb.
function suspAxle(v,ax){
  const P=v&&v.suspPart;if(!P)return null;
  const m2=P['mr'+ax]*P['mr'+ax],rb=P['rb'+ax],t=ax==='F'?v.trackF:v.trackR;
  return {ks:m2*springRate(P['wireD'+ax+'_mm'],P['coilD'+ax+'_mm'],P['coils'+ax]),kb:barRollK(P,ax,t),cs:m2*P['damp'+ax]*(1+rb)/2,rb};
}
const STIFF_STEP_COST={spring:400,bar:250,damper:350};   // per axle, a part's springs, bars and dampers (build 216)
// Roll stiffness of each axle (N m per rad) for car v (mass, fWt, tracks, kit, or its SPRINGS, BARS & DAMPERS part).
function rollStiffness(v){
  const w=2*Math.PI*(SUSPENSION[v.suspension]||SUSPENSION.sport).hz,w2=w*w;
  const ax=(m,t,a)=>{const s=suspAxle(v,a);if(s)return s.ks*t*t/2+s.kb;const k=m*w2*t*t/4;return k+BAR_SHARE*k;};
  return {F:ax(v.mass*v.fWt,v.trackF,'F'),R:ax(v.mass*(1-v.fWt),v.trackR,'R')};
}
// ---- dampers and the road (build 216) ----
// In a steady corner a damper does nothing: it only works while the suspension moves. On a real circuit it always
// moves, because the road is not flat, and every bump makes the tyres' load swing about its mean. A tyre's grip
// grows less than in proportion to its load (tyreMu, load sensitivity), so a tyre whose load swings grips less on
// average than one held steady at the same mean, and a wheel that leaves the road grips not at all. The dampers and
// springs decide how much the load swings: that is what they do on a lap.
// Each corner is a quarter car: the body's share on the spring and damper, the unsprung wheel under it, and the
// tyre's vertical stiffness under that, driven by the road's profile. The road is ISO 8608's: a displacement
// spectrum Gd(n) = Gd(n0) (n/n0)^-2 at n0 = 0.1 cycle/m (class A, very good, up to 32e-6 m3; B 32-128e-6; each class
// 4x the one before). Driven at v, the road is a white velocity input whose strength grows with v, so the tyre's
// load swings by sigma = c sqrt(Gd(n0) v): c is worked out once per axle, from the quarter car's response.
// The unsprung mass is the corner's own parts, weighed (unsprungMass, build 262); until then 12% of the corner's mass
// for every car. The tyre's vertical stiffness is Rhyne's relation (build 418, retiring build 216's one 250 kN/m):
//   kt = 0.0274 p sqrt(Wf D) + 3.38   daN/mm, p the inflation pressure in bar, Wf the footprint width and D the outer
// diameter in mm (Rhyne, Tire Sci. Tech. 33(3), 2005, fitted to a wide range of radials; as quoted with its units by
// Redrouthu & Das, Chalmers MSc thesis 2014:24, sec. 3.4 and appendix; the same constants in kg/mm, 0.00028 p[kPa] and
// 3.45). The first term is the air's, the constant the carcass's own stiffness with no air. Wf = 0.7 of the section
// width, the thesis's own assumption (PROBABLE). A 205/55R16 at 230 kPa: 224 kN/m, an 11-12 Hz wheel hop.
const RHYNE_A=0.0274, RHYNE_B=3.38, RHYNE_WF=0.7, ISO_N0=0.1;
function tyreKz(twMm,odMm,kPa){return (RHYNE_A*kPa/100*Math.sqrt(RHYNE_WF*twMm*odMm)+RHYNE_B)*1e4;}   // N/m
// ---- tyre pressure as a part (build 313) ----
// A designed pair of cold pressures (front, rear). Unfitted, every car stands for TYRE_P_REF. Fitted:
//   stiffness   Rhyne's relation above at the set pressure (build 418).
//   load        the tyre's load capacity (build 418): ETRTO's load formula is linear in the pressure, (p + P0), P0 the
//               structure's own capacity with no air (Malinverni, ETRTO, More than 50 years of standardisation, 2015).
//               A standard-load tyre's load index is its load at 250 kPa, and no more above it. P0 = 44.5 kPa is the
//               least-squares fit of ETRTO's standard-load table (Standards Manual 2005, LI 62-125 at 22-36 psi, as
//               reprinted in Toyo's Load & Inflation Tables 2013): 0.7% rms, 2.2% at worst.
//   grip        the grip's load sensitivity (tyreMu) reads the load against the tyre's capacity at its set pressure:
//               the compound's mu stands at TYRE_REF_SHARE of the load index at TYRE_P_REF, and that reference load
//               moves with the capacity (build 418). Less air, a given load is a larger share of what the tyre carries.
//   rolling     SAE J2452's form, Crr ~ p^alpha, alpha -0.4 for passenger radials (Grover, SAE 980251, 1998; PROBABLE).
//   hot         the air at constant volume: p_hot + atm = (p_cold + atm)(273 + T_tyre)/(273 + 20), the cold set at 20 C.
// Not modelled: the friction's own pressure term (Magic Formula 6.1's ppy3/ppy4), which measurements show to be tyre
// dependent with no general sign (Schmeitz, Besselink & Jansen, VSD 43 suppl., 2005); the cornering stiffness's.
// TYRE_P_REF: the cold placard pressure the compounds' mu and Crr stand for, ~230 kPa on a 205/55R16 (PROBABLE,
// door placards of mid-size cars).
const ETRTO_P0=44.5, ETRTO_P_LI=250;
const tyreLoadShare=kPa=>Math.min(1,(kPa+ETRTO_P0)/(ETRTO_P_LI+ETRTO_P0));      // of the load index
const tyreRefScale=kPa=>kPa?tyreLoadShare(kPa)/tyreLoadShare(TYRE_P_REF):1;      // FzRef's move from TYRE_P_REF
const TYRE_P_REF=230, TYRE_P_ALPHA=-0.4, P_ATM_KPA=101.3;
const tyreColdKPa=(v,front)=>v&&v.tyrePart?v.tyrePart[front?'front_kPa':'rear_kPa']:null;
const tyreHotKPa=(cold,tC)=>(cold+P_ATM_KPA)*(273.15+tC)/293.15-P_ATM_KPA;
// The compounds' Crr scaled by the pressure, the two axles weighted by their load; 1 without the part.
function tyrePressCrr(v){
  if(!v||!v.tyrePart)return 1;const f=v.fWt||0.5,a=TYRE_P_ALPHA;
  return f*Math.pow(v.tyrePart.front_kPa/TYRE_P_REF,a)+(1-f)*Math.pow(v.tyrePart.rear_kPa/TYRE_P_REF,a);
}
// A CORNER'S UNSPRUNG MASS, FROM ITS PARTS (build 262): what moves with the wheel over a bump.
//   tyre and wheel   the masses roadWheelInertia already weighs, at this axle's own tyre width;
//   rotor            the brake model's own disc (brakeThermal: its ring, vanes and hat; a carbon-ceramic one is light);
//   caliper          a sliding cast-iron caliper with its bracket ~4.5 kg, a fixed alloy opposed-piston one ~3 kg, a
//                    truck's twin-piston slider ~7 kg (makers' catalogue weights; probable);
//   upright and hub  knuckle, hub and bearing, sized by the load they carry: 9 kg on a 350 kg corner (teardown
//                    weights of mid-size cars; probable), in proportion to the corner's mass;
//   links            half of the arms, spring and damper (the other half hangs on the body): 4 kg on that corner;
//   driveshaft       half of a driven corner's shaft, ~3.5 kg;
//   a beam           a solid axle is unsprung whole: its tube and, driven, its differential and shafts (a Ford
//                    8.8 in axle ~80 kg bare; probable), half to each wheel, in place of upright, links and shaft
//                    shares above 1/3; a twist beam (~20 kg) hangs half on the body.
const UNSPRUNG={calSlide:4.5,calFixed:3.0,calHD:7,upright:9/350,links:4/350,shaft:3.5,solidDriven:80,solidDead:35,twist:20};
function unsprungMass(v,front){
  const U=UNSPRUNG,mc=v.mass*(front?v.fWt:1-v.fWt)/2;
  const D=2*(v.rTire||0.32),dr=(v.wheelDia||16)*0.0254,w=((front&&v.tireWidthF)||v.tireWidth||225)/1000;
  const tyre=15*Math.PI*D*w+6*2*Math.PI/4*(D*D-dr*dr),wheel=0.075*(v.wheelDia||16)*(0.8*w/0.0254);
  const bt=BRAKE_TYPE[v.brakeType]||BRAKE_TYPE.slotted,th=v.rotor?brakeThermal(v):null,rotor=th?(front?th.front:th.rear).m:6;
  const pist=(bt.caliper[front?'f':'r']||[]).length,cal=v.brakeType==='hd'?U.calHD:pist>1?U.calFixed:U.calSlide;
  const driven=v.drive==='awd'||(v.drive==='rwd')!==front,geo=front?v.suspFront:v.suspRear;
  let rest=U.upright*mc+U.links*mc+(driven?U.shaft:0);
  if(geo==='solid')rest=(driven?U.solidDriven:U.solidDead)/2+U.upright*mc/3;
  else if(geo==='twist')rest=U.twist/4+U.upright*mc+U.links*mc/2;
  return tyre+wheel+rotor+cal+rest;
}
// A corner's quarter car for axle 'F' or 'R' of car v: sprung and unsprung mass (kg), wheel rate, damping, tyre rate.
function quarterCar(v,ax){
  const front=ax==='F',mc=v.mass*(front?v.fWt:1-v.fWt)/2,kit=SUSPENSION[v.suspension]||SUSPENSION.sport,w=2*Math.PI*kit.hz;
  const mu=Math.min(unsprungMass(v,front),0.5*mc),ms=mc-mu,k0=mc*w*w,P=suspAxle(v,ax);   // the rate rollStiffness uses
  // unfitted, the kit's spring and damper, the damper matched to the kit's spring; fitted, the part's (build 420)
  const ks=P?P.ks:k0,cs=P?P.cs:2*kit.zeta*Math.sqrt(k0*ms);
  const tw=((front&&v.tireWidthF)||v.tireWidth||225)/1000,od=2*(v.rTire||0.32);
  const p=tyreColdKPa(v,front);
  return {ms,mu,ks,cs,rb:P?P.rb:0,kt:tyreKz(tw*1000,od*1000,p||TYRE_P_REF)};
}
// The quarter car's response to the road at frequency f (Hz), for a road movement of 1 m: the tyre's load swing (N)
// and the body's acceleration (m/s2), as squared magnitudes.
function quarterResponse(q,f){
  // the equations of motion at w, for road movement 1:  a Zs + b Zu = 0,  b Zs + d Zu = kt
  const w=2*Math.PI*f,w2=w*w;
  const a=[q.ks-q.ms*w2,w*q.cs],b=[-q.ks,-w*q.cs],d=[q.ks+q.kt-q.mu*w2,w*q.cs];
  const mul=(x,y)=>[x[0]*y[0]-x[1]*y[1],x[0]*y[1]+x[1]*y[0]],div=(x,y)=>{const n=y[0]*y[0]+y[1]*y[1];return [(x[0]*y[0]+x[1]*y[1])/n,(x[1]*y[0]-x[0]*y[1])/n];};
  const ad=mul(a,d),bb=mul(b,b),det=[ad[0]-bb[0],ad[1]-bb[1]];
  const zu=div([a[0]*q.kt,a[1]*q.kt],det);          // the wheel
  const zs=div(mul([-b[0],-b[1]],zu),a);             // the body
  return {F2:q.kt*q.kt*((1-zu[0])*(1-zu[0])+zu[1]*zu[1]),A2:w2*w2*(zs[0]*zs[0]+zs[1]*zs[1])};
}
// Over the road's spectrum at Gd(n0) = 1 and v = 1 m/s (the velocity input is then (2 pi n0)^2 Gd(n0) v, white): the
// tyre's load swing per root of Gd(n0) v, and the body's acceleration likewise. 0.05-80 Hz holds all of both.
function quarterCoef(q){
  let F=0,A=0;const r=1.02;
  for(let f=0.05;f<80;f*=r){const df=f*(r-1),R=quarterResponse(q,f),G0=ISO_N0*ISO_N0/(f*f);F+=R.F2*G0*df;A+=R.A2*G0*df;}
  return {F:Math.sqrt(F),A:Math.sqrt(A)};
}
// The grip a tyre keeps when its load swings by s of its mean: the force at the mean load being 1, E[L^(1 - LOAD_SENS)]
// for a load L that swings as a Gaussian about its mean but cannot pull on the road (clipped at 0). The clipped loads are
// rescaled to keep their mean at 1: on average the tyres still carry the car, so a wheel in the air is made up by a
// harder landing. Tabulated from s = 0 to 3; past 3 the tyre is off the road most of the time.
// Built on first use: LOAD_SENS is declared further down this file.
const ROAD_G_N=300,ROAD_G_MAX=3;let ROAD_G=null;
function roadGripTable(){
  ROAD_G=new Float64Array(ROAD_G_N+1);
  for(let k=0;k<=ROAD_G_N;k++){const sd=k/ROAD_G_N*ROAD_G_MAX;let a=0,m=0,wt=0;
    for(let i=-6;i<=6;i+=0.02){const p=Math.exp(-i*i/2),x=Math.max(0,1+sd*i);a+=p*Math.pow(x,1-LOAD_SENS);m+=p*x;wt+=p;}
    ROAD_G[k]=m>0?(a/wt)/Math.pow(m/wt,1-LOAD_SENS):1;}   // E[(L/mean)^0.85] = E[L^0.85] / mean^0.85
  return ROAD_G;
}
function roadGrip(s){if(!(s>0))return 1;const T=ROAD_G||roadGripTable(),x=Math.min(s,ROAD_G_MAX)/ROAD_G_MAX*ROAD_G_N,k=Math.min(ROAD_G_N-1,x|0);return T[k]+(T[k+1]-T[k])*(x-k);}
// The road under the lap being solved: its Gd(n0) (m3). 0 is a perfectly smooth surface, the one the acceleration,
// braking and skidpad tests are run on. simulateLap sets it from the circuit and puts it back.
const ROAD={gd:0};
// The ride (build 216): the body's RMS vertical acceleration (m/s2), front and rear averaged, at 80 km/h on a class B road
// (64e-6 m3, the middle of ISO 8608's 'good'). Unweighted: ISO 2631's comfort weighting is not applied, so it reads
// somewhat above what the standard's tables would; it is for comparing setups, not a comfort grade.
function rideRms(v){const k=Math.sqrt(64e-6*80/3.6);return (v.rideF+v.rideR)/2*k;}
// Each axle's tyre load swing (N) at speed v on the current road.
function roadSigma(ax,v){return ROAD.gd>0&&v>0?(ax==='F'?vehicle.roughF:vehicle.roughR)*Math.sqrt(ROAD.gd*v):0;}
// A circuit's road (build 216). No circuit's surface has been measured to ISO 8608 that we can find, so these are
// estimates by kind of circuit, and labelled so: a permanent circuit's asphalt, laid and kept for racing, half of class
// A's middle (8e-6 m3); a circuit run on public or park roads, or one whose bumps its drivers complain of, class A's
// middle (16e-6); the Nordschleife, a public toll road from 1927, the A/B boundary (32e-6).
const TRACK_ROAD={smooth:8e-6,bumpy:16e-6,road:32e-6};
const TRACK_ROAD_OF={nord:'road',tech:'bumpy',cota:'bumpy',interlagos:'bumpy',mexico:'bumpy',montreal:'bumpy',melbourne:'bumpy',sochi:'bumpy',brands:'bumpy',oschersleben:'bumpy',norisring:'bumpy',lime_rock:'bumpy',laguna:'bumpy',road_atlanta:'bumpy',vir:'bumpy',lemans:'bumpy'};
function trackRoad(key){const T=TRACKS[key];return T&&T.road?T.road:TRACK_ROAD_OF[key]||(T&&T.imported?'bumpy':'smooth');}   // an imported trace: unknown, so the middle
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
//   bump, droop (m, build 364) — the wheel's travel from its static ride height up to the bump rubber and down to full
//     droop (the damper's rebound stop). Passenger cars run ~70-100 mm each way at the wheel; a strut's travel is
//     bounded by its own length, so the least, and a solid axle's beam needs the most (Reimpell et al., The Automotive
//     Chassis, ch. 5, spring travel: PROBABLE by type, no maker publishes each car's).
//   svF, svR (m, build 365) — the side-view swing arm at the front and at the rear: [e, d], its instant centre's height
//     above the ground and its length from the wheel centre, toward the car's middle. A tyre's longitudinal force Fx
//     reaches the body through it with a vertical part Fx e/d (torque reacting on the upright: outboard brakes, a live
//     axle's drive) or Fx (e - r)/d (torque reacting on the body: inboard brakes, drive through half-shafts), which the
//     springs do not carry: anti-dive % = brake share x (e/d) x L/h (Milliken & Milliken, RCVD, ch. 17). Road cars run
//     0-50 % anti-dive and up to ~100 % anti-squat (ibid.); a strut's arm is short of height (its top mount), a
//     trailing twist beam's instant centre is its own pivot, ~0.5 m ahead near wheel-centre height (Reimpell, The
//     Automotive Chassis, ch. 3, pitch poles). PROBABLE by type: no maker publishes each car's.
const SUSP_GEO={
  strut:    {label:'MACPHERSON STRUT',fvsa:3.0,rc:0.08, front:true, cost:2500,bump:0.070,droop:0.080,svF:[0.15,3.0],svR:[0.40,2.5]},
  wishbone: {label:'DOUBLE WISHBONE', fvsa:1.6,rc:0.06, front:true, cost:5500,bump:0.080,droop:0.090,svF:[0.20,2.5],svR:[0.45,2.5]},
  multilink:{label:'MULTI-LINK',      fvsa:2.0,rc:0.10, front:true, cost:4500,bump:0.080,droop:0.090,svF:[0.20,2.5],svR:[0.50,2.0]},
  twist:    {label:'TWIST BEAM',      recov:0.4,rc:0.125,front:false,cost:1500,bump:0.085,droop:0.095,svF:[0.15,3.0],svR:[0.32,0.55]},
  solid:    {label:'SOLID AXLE',      recov:1,  rc:null, front:true, cost:2000,bump:0.100,droop:0.110,svF:[0.15,2.5],svR:[0.35,2.5]}
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
  // a car whose preset carries its own geometry (build 199: batch 1) is built on it, as vehicleFromPreset fits it
  const f=(CHASSIS[v&&v.chassis]||CHASSIS.coupe).fit,b=v&&v.body&&v.body.fit||{};
  return {f:b.geoF||f.geoF||'strut',r:b.geoR||f.geoR||'multilink'};
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
// load, per compound (TIRE_TYPE.cc, per degree; build 266):
//   eco, street  0.28  a measured 205/60R15 91V road tyre at 2.2 bar, from its Magic Formula 5.2 file (PKY1 -20.505,
//                      PKY2 2.0284: K/Fz = PKY1 sin(2 atan(1/PKY2)) = 16.3/rad at its nominal load). Gillespie's
//                      round figure for a radial (ch. 10), used for every tyre until build 266, was 0.2.
//   slick        0.54  a race tyre, Milliken & Milliken, RCVD fig. 2.9: the side force peaks at 1.08 of the load at
//                      6.0 deg (1350 lbf). The brush model slides fully at tan(alpha) = 3 mu / CC, so CC = 30.8/rad.
//                      The same relation on the road tyre above gives its peak near 10 deg (production tyres: 6-10).
//   sport, semi  0.32, 0.42  NOT SOURCED: between the two measured tyres by the compound's grip (register: TYRE_CC).
//   drag         0.20  NOT SOURCED: a soft-walled tyre, left at Gillespie's figure.
// The stiffness per unit load falls as the load rises (build 267). The Magic Formula's own form for it is
// K = K0 sin(2 atan(Fz / (PKY2 Fz0))), which per unit load and against its value at the nominal load is
// (P^2 + 1) / (P^2 + x^2), x = Fz / Fz0, with P = PKY2 = 2.0284 from the road tyre's file above. The nominal
// load is taken as the tyre's reference load (FzRef, 60% of its rated load; a Magic Formula file's is usually
// near two thirds: probable). Against the race tyre of RCVD fig. 2.9, with its middle load taken as nominal:
// 1.12 and 0.87 at 2/3 and 4/3 of it, where the measured peaks give 1.09 and 0.80.
const TYRE_CC_P2=2.0284*2.0284;
const tyreCCLoad=x=>(TYRE_CC_P2+1)/(TYRE_CC_P2+x*x);
// For the lap, each tyre is taken at the mean wheel load N/4. Load moved across an axle lowers the pair's
// stiffness further, so with the line below this is still the least the drag can be.
// The drag is taken as linear right up to the limit, where a real tyre's slip angle runs further, so this is the
// least it can cost.
const tyreCC=type=>((TIRE_TYPE[type]||TIRE_TYPE.sport).cc||0.2)*180/Math.PI;   // per radian
function corneringDrag(m,ay,N){const n=Math.max(1,N);return m*m*ay*ay/(n*(vehicle.tyreCC||tyreCC(vehicle.tireType))*tyreCCLoad(n/(4*vehicle.FzRef)));}
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
// sg: the tyres' load swing on the road (N, build 216): each tyre keeps roadGrip of its force, the lightly loaded inside one
// the least of it.
function axleLatCap(Nax,d,FzRef,sg){
  const F=Nax/2,o=Math.max(0,F+d),inr=Math.max(0,F-d);
  if(!(sg>0))return tyreMu(o,FzRef)*o+(inr>0?tyreMu(inr,FzRef)*inr:0);
  return tyreMu(o,FzRef)*o*roadGrip(sg/Math.max(1,o))+(inr>0?tyreMu(inr,FzRef)*inr*roadGrip(sg/inr):0);
}
// v: the speed, for the road's bumps (build 216); none on a smooth test surface. q: the line point, for the kerbs under the
// wheels (build 217): the car's warp q.kw (rad) and its rate along the line q.kws (rad/m) twist it through the springs,
// bars and dampers, the warp moment Mk = K_warp kw + C_warp kws v, and each axle's outside tyre gains or loses Mk over its
// track (front and rear opposite: the diagonal pair gains, the other loses).
function latBalance(N,ay,dn,ax,v,q){
  const m=vehicle.mass,fWt=vehicle.fWt||0.55,aF=vehicle.aeroBal!=null?vehicle.aeroBal:0.5,lt=vehicle.lltdF!=null?vehicle.lltdF:fWt;
  const tr=ax||0;   // longitudinal load transfer onto the front (N): braking +, accelerating -
  const Nf=clamp((N-(dn||0))*fWt+(dn||0)*aF+tr,0.05*N,0.95*N),Nr=N-Nf;
  // the transfer's roll moment m ay h, shared by the roll balance and taken across each axle's own track (build 173)
  const M=m*Math.abs(ay)*vehicle.cg,tF=vehicle.trackF||vehicle.track,tR=vehicle.trackR||vehicle.track;
  const rF=vehicle.camRecF!=null?vehicle.camRecF:CAMBER_RECOVERY,rR=vehicle.camRecR!=null?vehicle.camRecR:CAMBER_RECOVERY;
  const cF=vehicle.camberF!=null?vehicle.camberF:vehicle.camber,cR=vehicle.camberR!=null?vehicle.camberR:vehicle.camber;
  let kF=0,kR=0;
  if(q&&q.kw){const Mk=(vehicle.warpK||0)*q.kw+(vehicle.warpC||0)*(q.kws||0)*(v||0);kF=-q.turn*Mk/Math.max(0.8,tF);kR=q.turn*Mk/Math.max(0.8,tR);}
  const capF=axleLatCap(Nf,M*lt/Math.max(0.8,tF)+kF,vehicle.FzRefF,roadSigma('F',v))*latCamberF(ay,cF,rF),
        capR=axleLatCap(Nr,M*(1-lt)/Math.max(0.8,tR)+kR,vehicle.FzRef,roadSigma('R',v))*latCamberF(ay,cR,rR);
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
// gripTq (optional): the driven axle's grip as a torque at the wheels, N m; a designed diff's preload is read against it.
function diffTractionAt(df,aLat,cgH,tqFrac,gripTq){
  const asym=axleAsym(tqFrac==null?1:tqFrac);
  const xfer=clamp((aLat/G)*(cgH/1.55),0,0.5-asym);           // lateral transfer, capped at lift
  const openUse=2*Math.max(0,0.5-asym-xfer);
  if(df.part)return diffPartUse(df,openUse,gripTq);
  const use=df.lock+(1-df.lock)*openUse;
  const useRef=df.lock+(1-df.lock)*2*(0.5-DIFF_ASYM0);        // the reference `traction` is quoted at
  return df.traction*(use/useRef);
}
// ---- the differential as a part (build 310) ----
// A designed clutch-plate (Salisbury, ramp) limited-slip. The carrier drives the cross-shafts, which sit in V-notches
// in two pressure rings at radius rRamp; the notch's face at the ramp angle theta (from the plane of rotation: 90 deg
// is a flat face and no lock) turns the drive force T_in/rRamp into an axial force (T_in/rRamp)·cot(theta) that
// squeezes the two clutch packs, each with `faces` friction faces at a mean radius rFace. The friction torque the two
// packs carry between the wheels is then dT = T_pre + L·T_in, L = 2·faces·mu·rFace·cot(theta)/rRamp: the ramp's
// statics (Milliken & Milliken, Race Car Vehicle Dynamics, 1995, the chapter on differentials). Torque bias
// ratio (1+L)/(1-L). DIFF_MU: plates running in limited-slip oil, 0.08-0.13 quoted (PROBABLE, makers' oil notes).
const DIFF_MU=0.10;
function diffPartLock(p){
  const th=p.ramp_deg*Math.PI/180;
  return p.ramp_deg>=90?0:Math.min(1,2*p.faces*DIFF_MU*(p.rFace_mm/p.rRamp_mm)*Math.cos(th)/Math.sin(th));
}
// The usable share of the axle's grip: the light wheel holds openUse/2 of it, the heavy one at most dT more. With the
// axle driven at its grip, T_in = use·T_g and T_light = (T_in - dT)/2, so use = (openUse + T_pre/T_g)/(1 - L), at most 1.
// Open (L 0, no preload) is openUse, as the open diff; a weld (L 1) is 1, as the spool's lock.
function diffPartUse(df,openUse,gripTq){
  if(df.lock>=1)return 1;
  return Math.min(1,(openUse+(gripTq>0?df.preload/gripTq:0))/(1-df.lock));
}
// The part as the physics reads it. Its scrub in a corner (`corner`) is the factory table's, read across at its lock:
// the table's rule until the table is retired (`DIFF_ASYM0` in plans/fitted-register.json).
function diffSpec(p){
  const L=diffPartLock(p),keys=['open','visc','clsd','spool'];
  let corner=1;for(let i=1;i<keys.length;i++){const a=DIFF[keys[i-1]],b=DIFF[keys[i]];if(L<=b.lock){corner=a.corner+(b.corner-a.corner)*(L-a.lock)/(b.lock-a.lock);break;}}
  return {label:'CLUTCH-PLATE LSD',part:true,lock:L,preload:p.preload_Nm,tbr:L>=1?Infinity:(1+L)/(1-L),corner,cost:DIFF.clsd.cost,
    traction:Math.min(1,2*(0.5-DIFF_ASYM0)/(1-L))};   // the readout's figure: a standing start, no preload
}
// The factory clutch-plate LSD in the stepped car (build 318): a road car's, by its locking ratio, (T_fast - T_slow)
// over the input torque, which is the ramp's lock L. Porsche quotes 37% on overrun for the manual 911 GT3 (991.2; press
// kit, engine and transmission); owners' notes on older GT3s give 28-40% (PROBABLE). Taken the same on drive and coast
// (a 2-way) unless the preset's own unit has published ramps below. Preload 60 N m: the PARTS page's road starting
// point (PROBABLE).
const DIFF_CLSD_ROAD={pre:60,L:0.37};
// Coast ramps where the maker publishes them (build 405): L on drive, Lc on the coast (overrun), from the two ramp
// angles. Only one preset's own unit has both figures:
// 718 Cayman GT4 manual: 22% under traction, 27% on overrun (Porsche Newsroom, 2020, "PDK for the 718 Spyder and
// Cayman GT4": the PDK cars' 30/37 "compared to 22 and 27 percent with the six-speed manual").
// Left open: the 911 GT3 (991.2) preset is the PDK car, whose rear lock is electronically controlled; the 30/37 Porsche
// quotes is the manual's. The Mustang GT (2018) preset is the Performance Pack car, whose diff is a Torsen (Ford: 3.73
// Torsen, manual), not a clutch pack: it biases on the coast too, and Ford publishes no bias ratio. The ND MX-5's
// asymmetric LSD (stronger on the coast) is the 2024 car's, and Mazda gives no ratios. No other preset's maker
// publishes drive and coast figures for its factory unit.
const DIFF_CLSD_RAMPS={'Porsche 718 Cayman GT4 (2020)':{L:0.22,Lc:0.27}};
// A viscous coupling (build 318): interleaved plates shearing a silicone fluid. A Newtonian film between two annuli
// carries T = pi·mu·dw·(rO^4 - rI^4)/(2·gap), and 2·pairs - 1 films act in parallel, so the coupling is a rate c (N m
// per rad/s). Fluid 60,000 cSt dimethyl silicone and 24 plate pairs: the working example of US patent 5,597,369
// (transfer case with a viscous coupling). Gap 0.3 mm (0.2-0.5 quoted for these units) and plates 70-110 mm across:
// PROBABLE. c = 110 N m s. Left out: the fluid thins under shear (PDMS above ~100 1/s), heats, and "humps" (the plates
// touch and lock) on a long slip, so at large dw the real coupling carries less, then suddenly more.
const DIFF_VCU={nu:0.06,rho:975,rO:0.055,rI:0.035,gap:0.3e-3,pairs:24};
function diffVcuRate(p){return (2*p.pairs-1)*Math.PI*p.nu*p.rho*(Math.pow(p.rO,4)-Math.pow(p.rI,4))/(2*p.gap);}
// How the stepped car couples an axle's two wheels: open (none), a friction pack (Coulomb: it holds the wheels together
// up to preload + lock·|input torque|, then slips at that), a viscous coupling (c·dw), or a spool (always together).
// Lc: the friction pack's lock on the coast (input torque negative); the same as L for a 2-way.
// name (optional): the preset's, for its published ramps (DIFF_CLSD_RAMPS).
function diffCoupling(df,name){
  if(!df||df===DIFF.open||!(df.lock>0))return {type:'open'};
  if(df.lock>=1)return {type:'spool'};
  if(df.part)return {type:'fric',pre:df.preload,L:df.lock,Lc:df.lock};
  if(df===DIFF.visc)return {type:'visc',c:diffVcuRate(DIFF_VCU)};
  const r=DIFF_CLSD_RAMPS[name];
  return {type:'fric',pre:DIFF_CLSD_ROAD.pre,L:r?r.L:DIFF_CLSD_ROAD.L,Lc:r?r.Lc:DIFF_CLSD_ROAD.L};
}
// THE CENTRE COUPLING of an all-wheel-drive car in the stepped car (build 320), by preset. f is the front axle's share
// of the drive torque where a differential splits it; type as diffCoupling's, plus 'lock': an electronically controlled
// multi-plate clutch, closed on the first slip (the stepped car's rule since build 264; no maker publishes the control,
// so PROBABLE), which a car with no entry also gets.
// Torsen (T-3, planetary): lock 0.25, from a Torsen T-3 technical sheet's "20 to 30%" locking (PROBABLE).
// Viscous: the coupling of the axle's own (DIFF_VCU, PROBABLE: no maker publishes its plates) on the propshaft, so
// c x fd^2 at the wheels.
const CENTRE_TORSEN_L=0.25;
const CENTRE_DIFF={
  // Torsen T-3 centre, 40:60: Toyota technical FAQ (toyota-club.net, "Toyota all-wheel drive. Torsen AWD")
  'Toyota Land Cruiser 200 VX 4.5 D-4D (2015)':{type:'fric',f:0.40,L:CENTRE_TORSEN_L},
  // Torsen centre, 40:60: Volkswagen Australia, 4MOTION
  'Volkswagen Amarok 3.0 V6 TDI (2018)':{type:'fric',f:0.40,L:CENTRE_TORSEN_L},
  // Torsen centre, 40:60: Lamborghini's launch figures (carsales; Autocar)
  'Lamborghini Urus (2018)':{type:'fric',f:0.40,L:CENTRE_TORSEN_L},
  // epicyclic centre, 47:53, with a Ferguson viscous coupling: Hagerty buyer's guide; evo
  'Lancia Delta HF Integrale Evoluzione (1992)':{type:'visc',f:0.47,vcu:true},
  // open centre, 50:50, locked only by the driver's knob: Audi media, quattro driveline
  'Audi Sport quattro (1984)':{type:'open',f:0.50},
  // rear driven, a viscous coupling to the front, no centre differential (PROBABLE)
  'Porsche 911 Turbo (993, 1995)':{type:'visc',f:0,vcu:true},
  'Lamborghini Diablo VT (1993)':{type:'visc',f:0,vcu:true},
  'Lamborghini Murciélago LP640 (2006)':{type:'visc',f:0,vcu:true},
  // Clutches with a published limit (build 404): f 0 or 1 names the primary axle; the clutch passes the other at most
  // L x the drive torque.
  // ATTESA E-TS: 0:100 in normal driving, "adjusted up to 50:50": Nissan Europe newsroom, 2017 GT-R
  'Nissan GT-R (R35, 2017)':{type:'lock',f:0,L:0.5,dc:true},
  // ATTESA E-TS Pro: the same 0:100 to 50:50 (Nissan; the ATTESA literature, PROBABLE for this car)
  'Nissan Skyline GT-R V-spec (R34, 1999)':{type:'lock',f:0,L:0.5,dc:true},
  // front driven, "a maximum of 70% of drive torque to the rear axle": Ford of Europe, Focus RS AWD technical sheet
  'Ford Focus RS (Mk3, 2016)':{type:'lock',f:1,L:0.7,dc:true},
  // DCCD (2004 GD STI): planetary 35:65 torque split + electromagnetic clutch, releases on handbrake: Subaru 2004 STI spec
  'Subaru Impreza WRX STI (GD, 2004)':{type:'fric',f:0.35,L:0.35,dc:true},
  // ACD (Evo IX): 50:50 bevel centre diff + hydraulic multi-plate clutch (Tarmac mode), releases on handbrake: Mitsubishi Evo IX manual
  'Mitsubishi Lancer Evolution IX (2006)':{type:'fric',f:0.50,L:0.30,dc:true},
  // GR-FOUR: multi-plate clutch (Normal 60:40, Sport 30:70, Track 50:50), disconnects on handbrake: Toyota GR Yaris press kit
  'Toyota GR Yaris (2020)':{type:'fric',f:0.40,L:0.35,dc:true},
  // Electro-hydraulic Haldex V AWD, 30:70 nominal rear bias: Lamborghini Huracán LP610-4 press kit
  'Lamborghini Huracán LP610-4 (2014)':{type:'fric',f:0.30,L:0.35,dc:true}
  // Left open: the 992 Turbo S's PTM, "up to 500 Nm to the front wheels" (Porsche press kit), as 500 N m on the
  // propshaft cuts its stepped 0-100 from 2.87 to 3.24 s (Porsche: 2.7); where the 500 is measured is not published.
  // the rest ('lock', no limit published): Haldex (RS3), xDrive (X5 M), PTM (Cayenne, 992), Quadra-Trac (Grand Cherokee SRT),
  // the Raptor's 4A: all electronically controlled clutches (PROBABLE).
};
const AWD_DIFF_MODES=['auto','sport','open','lock'];
function centreCoupling(v){
  const m=v&&v.awdMode;
  if(m==='sport')return {type:'fric',f:0.30,L:0.20,dc:true};
  if(m==='open')return {type:'open',f:0.40};
  if(m==='lock')return {type:'lock',f:0.5};
  const e=CENTRE_DIFF[v&&v.body&&v.body.name];
  if(!e)return {type:'lock',f:0.5};
  const o=Object.assign({},e);if(o.vcu){o.c=diffVcuRate(DIFF_VCU)*Math.pow(v.finalDrive||1,2);delete o.vcu;}
  return o;
}
// Cornering-only form, kept for the lap solver's readability.
function lapDiffTraction(df,aLat,cgH){return diffTractionAt(df,aLat,cgH,1);}
// Share of the ENGINE's weight on the front axle, from where it sits: a front-engined car carries it
// just behind the front axle (~0.1 of the wheelbase), a mid-engined one ahead of the rear axle (~0.7), a
// rear-engined one behind it (~1.1), so 1 - x/wheelbase. Used only for the CHANGE an engine swap makes.
const ENGINE_FRONT_SHARE={front:0.9,mid:0.3,rear:-0.1};
const engineLayoutOf=(chassis,body)=>(body&&body.engPos)||(['super','hyper','proto','openwheel'].includes(chassis)?'mid':'front');
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
