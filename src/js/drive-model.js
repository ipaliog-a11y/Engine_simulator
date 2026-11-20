// ================================================================================================
// THE CAR STEPPED IN TIME (build 263): four wheels, a driver's inputs, one step. The base of a driving game.
//
// The lap, the 0-100 and the race solve a whole run at once, on one line, at the limit (quasi-steady). A game needs
// the other thing: where is the car one step later, given the wheel, the pedals and the gear. That is stepCar().
//
// Two halves, kept apart on purpose:
//   driveCar()                 reads the designed car (vehicle, powertrain) and returns PLAIN DATA: numbers and arrays,
//                              nothing else. JSON.stringify(driveCar()) is a complete car.
//   stepCar(car, s, u, dt)     advances state s by dt under inputs u. It reads only its arguments and Math: no page,
//                              no canvas, no globals of this app. A separate game can load this file and a car's JSON.
//
//   driveLine(lap), driveDriver(car, s, line, d)   a lap's racing line as plain data, and a driver that takes the car
//                              round it with the wheel and the pedals (build 269). See above driveDriver.
//
// WHAT IS MODELLED
//   Body      three freedoms in the plane: forward and sideways speed and yaw. m(vx' - vy r) = sum Fx, m(vy' + vx r) =
//             sum Fy, Izz r' = sum of the tyre forces' moments (Milliken & Milliken, RCVD ch. 5). Izz = m a b, the yaw
//             inertia of a car whose dynamic index is 1 (road cars measure 0.9-1.1, NHTSA's inertia database: probable).
//   Loads     each wheel's share of the weight, the downforce by its balance, and the transfer under acceleration
//             (m ax h / L) and cornering (m ay h / t, shared between the axles by the car's own roll stiffness and
//             roll centres, vehicle.lltdF). The transfer follows the body as it rolls and pitches on its springs and
//             dampers (build 317: driveBody), not at once. Since phase G6 each load is the tyre's own deflection (THE WHEELS).
//   Tyre      the brush model (Fiala 1954; Pacejka, Tyre and Vehicle Dynamics ch. 3): tread elements that deflect with
//             slip until the pressure can no longer hold them. With theta = C / (3 mu Fz), the force is
//             mu Fz (3s - 3s^2 + s^3) up to full sliding at s = 1. Drive, braking and cornering share one slip vector,
//             so using the grip one way leaves less the other way: combined slip needs no extra rule. Its inputs are
//             the lap's own: the grip mu(Fz) with its load sensitivity, the cornering stiffness (the compound's,
//             TIRE_TYPE.cc, falling with the load as tyreCCLoad has it), the longitudinal peak at TYRE_SLIP_OPT, braking and traction at TYRE_MU_X of the
//             lateral grip, and past the peak the launch model's own falling curve (0.81 in a full slide).
//             A tyre's side force builds over a rolling distance, the relaxation length (about the tyre's radius;
//             Pacejka ch. 5: probable).
//   Wheels    each spins on its own: I w' = drive - brake - Fx r - rolling resistance. This is what lets a wheel spin
//             up or lock.
//   Drive     the engine's full-load curve by the pedal, its own overrun torque off it, its inertia, a clutch that
//             slips (capacity 1.5 x peak torque), the gearbox with its shift time, the differential (open: equal
//             torque; limited-slip: friction plates, a viscous coupling or a spool, each by its own law: diffCoupling), all-wheel drive by its centre coupling (a clutch closed on slip, an open, Torsen or viscous centre: centreCoupling).
//   Stall     below the speed it can fire at, the engine stops; a starter or a bump start brings it back.
//   Brakes    the hydraulics' own force and front share; ABS and traction control as wheel-slip limits when fitted.
//   Aids      the ECU's calibration of ABS, traction control and stability control, as a tune (build 281). See DRIVE_AIDS.
//   Aero      drag and downforce on the square of the speed; rolling resistance by the load.
//   Steering  the torque the front tyres put on the hand wheel, s.steerTorque (phase G2): see DRIVE_CASTER.
//   Camber    each wheel's lean on the road, from its static camber, the body's roll and its own travel by the linkage,
//             s.camber (phase G4), and its camber thrust. See THE CAMBER.
//   Toe       each wheel steers a little by the body's roll and by its own side force, s.toe (phase G5). See THE TOE.
//
//   Turbo     the shaft in time (build 274): its energy rises by the turbine's power less the compressor's and the
//             bearings', and the boost it has built sets the torque. See driveTurbo.
//
//   Electric  a hybrid's or an electric car's pack is a state (build 275): the motor's help and its regeneration by
//             the charge, the charge by what they draw and return. See driveElectric.
//
//   Wheels up and down  each wheel on its tyre and its spring, the tyre's load its own deflection (phase G6). See THE WHEELS.
// NOT YET (named, so nobody rediscovers them): tyre and brake temperatures, a power-split's engine speed, the motor's
// and the pack's heat.
// ================================================================================================
const DRIVE_G=9.81, DRIVE_RHO=1.20;
// THE DRIVER AIDS AS A TUNE (build 281). These are a calibration, as the fuel map is: the numbers an engineer sets on
// the car, and here the player's to change (vehicle.aids overrides any of them). The defaults are the values stepCar
// used before they had names, and for stability control what the car's own data gives.
//   ABS       a wheel's brake is released while it slips more than absSlip x the tyre's peak slip [front, rear], at
//             absRel of its pressure a second, and reapplied at absApp. (Bosch Automotive Handbook, "Antilock braking
//             system": the controller cycles the pressure to hold the slip about the peak of the friction curve.)
//             So absSlip is 1, the peak itself (build 319; it was 1.3, unsourced, from build 264).
//   TC        the throttle is closed while the worst driven wheel slips more than tcSlip x the peak, by tcGain a
//             second for a slip twice the target.
//   ESP       van Zanten, Erhardt and Pfaff, "VDC, the vehicle dynamics control system of Bosch" (SAE 950759):
//             the controller holds the car's slip angle and its yaw rate by braking single wheels. A real one must
//             estimate the slip from its sensors; the model knows it. Against a spin (build 380; van Zanten, "Bosch ESP
//             systems: 5 years of experience", SAE 2000-01-1633): the yaw rate against the reference below, lagged
//             as the car itself would follow it, by the single-track model's equivalent delay B/C - m v a/(Cr L)
//             (Abe, Vehicle Handling Dynamics, ch. 3). Past it by espBand, the outer front wheel is braked for
//             Izz x excess / espTau, while the rear tyres slip more than espBeta (rad; by default the angle they
//             peak at, atan(3 mu / C)). (Without that gate, build 328 braked a hot lap's rear-drivers on 26-30% of
//             it; with it, 2-6%, against 4-12% on the slip angle alone.) An electric car's regeneration is cut while it works (MSR). Against a push: the yaw rate the driver asks for is the
//             steady turn of the car's own single-track model, v delta / (L (1 + K v^2)), K its understeer gradient
//             from the tyres' cornering stiffness at the static loads and the toe's steady share (car.Kus, THE TOE), and never more than the grip can
//             turn the car, mu g / v; short of it by espBand (rad/s) with the front tyres past their peak, the inner
//             rear wheel is braked for Izz x shortfall / espTau. With espCut the throttle closes over espTau while
//             it works. Off below espVmin. espBand, espTau and espVmin are a calibration (probable: no maker
//             publishes its own).
//             Its grip, and the angles the tyres peak at, are those of what the wheels stand on (THE SURFACE, THE SOIL).
// Which cars have what: traction control is the preset's (vehicle.tc). No preset says yet whether a car had ABS or
// ESP: ABS is taken as fitted, and ESP as fitted where traction control is (it works through the same hardware).
const DRIVE_AIDS={abs:true,absSlip:[1,1],absRel:25,absApp:12,tcSlip:1,tcGain:12,
  esp:null,espBand:3*Math.PI/180,espTau:0.2,espBeta:null,espCut:true,espVmin:4};
function driveAids(v){const A=Object.assign({},DRIVE_AIDS,v.aids||{});A.absSlip=[].concat(A.absSlip).slice(0,2);if(A.absSlip.length<2)A.absSlip[1]=A.absSlip[0];
  if(A.tc==null)A.tc=!!v.tc;if(A.esp==null)A.esp=A.tc;return A;}
// The designed car as plain data. Everything stepCar needs, and nothing that is not a number, a string or an array.
// The body on its springs (build 317): roll about the roll axis and pitch, each a damped degree of freedom.
//   roll   Ixx phi'' = m ay (h - z_axis) - K phi - C phi'. K is the springs' and bars' (rollStiffness, the lap's own
//          rollK); C each axle's dampers at the wheel, c t^2 / 2. What goes through the roll centres (m ay z at each
//          axle's share of the weight) reaches the tyres at once; the rest goes through each axle's springs (by rollKF)
//          and dampers (by its own c t^2 / 2). Steady, this is the lap's lltdF and rollGrad exactly. Ixx about the roll
//          axis: m (kx^2 + arm^2), kx 0.39 of the mean track (NHTSA's measured inertias, Heydinger et al., SAE
//          1999-01-1336: sedans' roll radius of gyration ~0.6 m on a 1.55 m track; PROBABLE).
//   pitch  Iyy theta'' = m ax h less the four corners' forces at their arms (each corner's wheel rate and damping:
//          quarterCar; since phase G6 through each wheel's own travel, THE WHEELS). The transfer is m ax h / L when
//          steady. Iyy = m a b: a dynamic index of 1 in pitch (Gillespie, Fundamentals of Vehicle Dynamics, ch. 5:
//          road cars 0.8-1.2). Since build 369 the links carry the anti-dive and anti-squat share (THE LINKS).
//   Left out: the weight's own roll moment as the body leans (m g arm sin phi, 9-10% more roll; it pushed test170 past
//   its caps, so it lands with the lap's rollGrad, which leaves it out too), and the unsprung masses' share of the transfer.
// THE WHEELS (phase G6). Each wheel moves up and down on its own, between its tyre and its spring: a quarter car at
// each corner (quarterCar: the unsprung mass from its parts, the wheel rate, the damper, the tyre's vertical rate),
// under a body that heaves as well as rolls and pitches (the sprung mass, the car's less its four wheels').
//   tyre    its load is its own deflection: Fz = the corner's load at rest + kt (road - wheel), never less than 0 (it
//           has left the road). The road's height under each wheel is u.road.z, four of them (m; flat without).
//   wheel   mu z'' = the tyre's change - the spring's, the bar's and the damper's - what the links carry through the
//           roll centre (m ay z / t, at once, as before). The spring works on the axle's mean travel and the roll
//           stiffness (springs and bar, the lap's own rollK by rollKF) on the difference of its two wheels, so one
//           wheel over a bump loads the other through the bar.
//   body    heave, roll and pitch by the four corners' forces, the downforce at its balance, and the road's crests
//           and dips (v^2 kv) through the springs. So pitchK is now the springs on the tyres with the body free to
//           heave, L^2 / (1/kF + 1/kR), k = 2 ks kt / (ks + kt) an axle; the body's roll includes the tyres' give.
//   The wheel hop is sqrt((ks + kt) / mu), 10-15 Hz: at the 1 ms step that is 0.06-0.1 rad a step, and the damper is
//   taken implicitly in the wheel's own speed, so no smaller step is needed (test205 halves the step: the same).
//   s.zu, s.heave (m, up), s.rr (each axle's roll on its springs, which the camber's recovery and the roll steer go by).
//   ends   (build 364) each corner's travel c (up on the body, from static) by the axle's type (SUSP_GEO bump, droop).
//          Past bump the bump rubber: a progressive spring, F = kb x / (1 - x/xb), kb the wheel rate at first touch,
//          rising as the rubber squashes and without end at xb, its solid height (jounce bumpers of polyurethane foam
//          stiffen ~20x over their stroke: Reimpell, ch. 5, auxiliary springs; xb 25 mm and kb = ks PROBABLE). At
//          c = bump + xb, and at full droop, the wheel is stopped on the body: its speed on the body there is held at
//          zero, and what that takes passes to the body (at droop the wheel hangs from it, off the road if need be).
//   damper (build 364) bound and rebound apart: rebound DAMPER_RB times bound (passenger dampers ~3:1, Dixon, The
//          Shock Absorber Handbook, 2007, ch. 1: PROBABLE), their mean the kit's cs, so the lap's quarter car, which
//          meets a road wave with that mean (the describing function, as the suspension calculator), is unchanged.
//   links  (build 369) anti-dive, anti-squat and anti-lift: each tyre's longitudinal force Fl reaches the body through
//          its side-view swing arm (SUSP_GEO svF/svR: [e, d]) with a vertical part J = (Fl e - Tb)/d, Tb the torque on
//          the wheel that reacts on the body (drive through half-shafts on an independent axle, inboard brakes; a live
//          axle's and outboard brakes' react on the upright), lifting the body at the front and pulling it down at the
//          rear when braking (Milliken & Milliken, RCVD, ch. 17). J is a force between wheel and body: the body gets it
//          at the corner, the wheel its reaction, so the springs carry the transfer less J, and their sum heaves the
//          body (jacking). Brakes are outboard unless the car says v.inboardF / v.inboardR (no preset does).
//   Left out, named: the tyre's own damping, the damper's blow-off, the arm's change
//   with travel, and travel by the kit (a lowered car keeps its type's).
const DRIVE_BUMP_RUBBER=0.025,DAMPER_RB=3;
function driveBody(v,a,b){
  const gF=SUSP_GEO[v.suspFront]||SUSP_GEO.strut,gR=SUSP_GEO[v.suspRear]||SUSP_GEO.multilink;
  const qF=quarterCar(v,'F'),qR=quarterCar(v,'R'),tF=v.trackF||v.track,tR=v.trackR||v.track,fw=v.fWt;
  const zF=v.rcF||0,zR=v.rcR||0,zAx=fw*zF+(1-fw)*zR,arm=Math.max(0,v.cg-zAx),kx=0.39*(tF+tR)/2;
  const K=v.rollK||(()=>{const k=rollStiffness(v);return k.F+k.R;})(),KF=v.rollKF==null?0.5:v.rollKF;
  const kz=q=>2*q.ks*q.kt/(q.ks+q.kt),L=a+b;      // an axle's vertical rate, its springs on its tyres
  // the full steady roll per unit ay (small-physics step 3): each axle's springs (K) on its tyres (kt t^2 / 2), the
  // tyres also carrying what goes through the roll centre. Phi (rad s^2/m) and each axle's roll on its springs, which
  // the roll steer goes by (THE TOE). The weight's own moment is left out, as in the roll above.
  const KF0=K*KF,KR0=K*(1-KF),TF=qF.kt*tF*tF/2,TR=qR.kt*tR*tR/2,cF=1/(1/KF0+1/TF),cR=1/(1/KR0+1/TR),gF0=fw*zF,gR0=(1-fw)*zR;
  const phi=v.mass*(arm+cF*gF0/TF+cR*gR0/TR)/(cF+cR);
  return {rollI:v.mass*(kx*kx+arm*arm),rollArm:arm,rollK:K,rollKF:KF,KaF:K*KF,KaR:K*(1-KF),
    rcGF:fw*zF,rcGR:(1-fw)*zR,
    ksF:qF.ks,ksR:qR.ks,cdF:qF.cs,cdR:qR.cs,bumpF:gF.bump,bumpR:gR.bump,droopF:gF.droop,droopR:gR.droop,svF:gF.svF,svR:gR.svR,
    liveF:v.suspFront==='solid',liveR:v.suspRear==='solid',inbF:!!v.inboardF,inbR:!!v.inboardR,unsF:qF.mu,unsR:qR.mu,mS:v.mass-2*(qF.mu+qR.mu),
    pitchI:v.mass*a*b,pitchK:L*L/(1/kz(qF)+1/kz(qR)),
    rollFull:phi,rrAyF:cF*(phi-v.mass*gF0/TF)/KF0,rrAyR:cR*(phi-v.mass*gR0/TR)/KR0,
    indF:v.suspFront!=='solid',indR:v.suspRear!=='solid'&&v.suspRear!=='twist'};
}
// THE STEERING TORQUE (phase G2). Each front tyre's side force acts behind the steering axis, so it turns the wheel
// back: Mz = -Fy (t + n) about the axis, and the hand wheel feels the two fronts' sum through the steering ratio.
//   t   the pneumatic trail, closed form from the same brush model driveTyre uses (Pacejka, Tyre and Vehicle
//       Dynamics, ch. 3, parabolic pressure): t = a (1-s)^3 / (3 - 3s + s^2), a/3 at no slip and 0 in a full slide,
//       s being driveTyre's share of the grip in use. So Fy t peaks at s = 1/4, well before Fy does at s = 1: the
//       steering goes light at the limit. a is half the contact length: the tyre as a circle of radius r pressed
//       flat by its deflection Fz/kt (kt the quarter car's tyre rate), a = sqrt(2 r d - d^2) (geometry; the real
//       patch's ends round off, so PROBABLE). At 4 kN on a 205/55R16 that is a = 0.10 m, t = 33 mm.
//   n   the caster trail, r tan(caster), the steering axis through the wheel's centre (no caster offset). vehicle.caster
//       (degrees) from a maker's alignment sheet where a preset has one; none does yet, so every car takes DRIVE_CASTER:
//       road cars run about 3-7 degrees (Reimpell et al., The Automotive Chassis, ch. 3: PROBABLE as one value).
//   rs  the scrub radius (build 376, plan small-physics step 4): each front tyre's longitudinal force (drive or brake)
//       acts rs outboard of the steering axis's ground point, Mz = -Fx rs on the left wheel, +Fx rs on the right; equal
//       forces cancel. vehicle.scrubRadius (m) where a preset has one; none does, so every car takes DRIVE_SCRUB:
//       passenger cars run -20 to +20 mm (Reimpell et al., The Automotive Chassis, ch. 3: PROBABLE as one value; a
//       value by suspension type is left open, no source gives one per type).
//   s.steerTorque is the column's load before any assist. s.handTorque (build 376) is what the driver holds at the hand
//   wheel, positive with the steer: see DRIVE_ASSIST. Nothing reads it yet (for force feedback later).
//   Left out, named: the torque steer of unequal driveshafts (no preset gives shaft angles), the moment of Fx on the
//   tread's sideways deflection, and a hydraulic or EPS curve per car (one curve serves every car).
const DRIVE_CASTER=5,DRIVE_SCRUB=0.010;
// THE POWER ASSISTANCE AND THE STEERING'S FRICTION (build 376). A boost curve gives the assist from the driver's own
// torque and the speed, as EPS and hydraulic systems are tuned (Pfeffer & Harrer, Steering Handbook, 2017, ch. 6-7:
// a threshold before any assist, a gain that falls with speed, a motor's ceiling). Every number PROBABLE:
//   assist = K(v) (|Th| - T0) above T0, at most Amax (Nm at the column), K(v) = Kv + (K0 - Kv) e^(-v/vK),
//   so Th = (|L| + K T0)/(1 + K) for a load L above T0: about 1/(1+K) of the load at speed, less when parking.
// The friction Tf (Coulomb, as felt at the hand wheel; PROBABLE) adds against a turning wheel; on a held wheel it
// takes up to Tf of the load, so the wheel holds itself near the centre (a dead band).
const DRIVE_ASSIST={T0:1,K0:8,Kv:1.5,vK:15,Amax:60,Tf:1.5};
function driveHandTorque(L,v,rate){
  const A=DRIVE_ASSIST,K=A.Kv+(A.K0-A.Kv)*Math.exp(-v/A.vK),aL=Math.abs(L);
  let th=aL<=A.T0?aL:(aL+K*A.T0)/(1+K);
  if(aL-th>A.Amax)th=aL-A.Amax;                       // the motor at its ceiling: the driver takes the rest
  th*=Math.sign(L);
  if(Math.abs(rate)>1e-4)return th+A.Tf*Math.sign(rate);
  return Math.sign(th)*Math.max(0,Math.abs(th)-A.Tf);
}
function driveCar(){
  const v=vehicle,pt=powertrain(),L=v.wb,a=L*(1-v.fWt),b=L*v.fWt;
  const curve=pt.torqueCurve(),rl=pt.maxRpm(),peak=curve.reduce((m,p)=>Math.max(m,p.tq),0);
  const ride=(SUSPENSION[v.suspension]||SUSPENSION.sport).hz;
  const grid=pt.hasShaft()?pt.torqueGrid():null,el=driveElectric(pt,curve,rl);
  const aids=driveAids(v),cc=v.tyreCC||tyreCC(v.tireType),muR=tyreMu(v.FzRef,v.FzRef);
  // the axles' cornering stiffness at the static loads (N/rad), for the understeer gradient K = m/L^2 (b/Cf - a/Cr)
  const Cax=(W,ref)=>2*cc*(W/2)*(TYRE_CC_P2+1)/(TYRE_CC_P2+Math.pow(W/2/ref,2));
  const CaF=Cax(v.mass*DRIVE_G*b/L,v.FzRefF||v.FzRef),CaR=Cax(v.mass*DRIVE_G*a/L,v.FzRef),Kus=v.mass/(L*L)*(b/CaF-a/CaR);
  if(aids.espBeta==null)aids.espBeta=(aids.espSlide||1)*Math.atan(3*muR/cc);
  const body=driveBody(v,a,b),toe=driveToe(v);
  // the toe's steady share of the understeer gradient (THE TOE), to the same K: roll steer by each axle's roll on its
  // springs per ay, the full roll (with the tyres' give), and compliance steer by each
  // wheel's share of the side force, m (b, a) / (2 L) per unit ay
  const Ktoe=(toe.rsF*body.rrAyF+toe.rsR*body.rrAyR+(toe.csF*b+toe.csR*a)*v.mass/(2*L))/L;
  return {
    aids,esp:!!aids.esp,Kus:Kus+Ktoe,CaF,CaR,...toe,pkF:Math.atan(3*tyreMu(v.FzRefF||v.FzRef,v.FzRefF||v.FzRef)/cc),
    turbo:grid&&grid.laggy?driveTurbo(pt,grid):null,el,
    name:v.chLabel||'',m:v.mass,Izz:v.mass*a*b,a,b,h:v.cg,tF:v.trackF||v.track,tR:v.trackR||v.track,
    r:v.rTire,tw:(v.tireWidth||225)/1000,Iw:(v.wheelI||2)/4,
    mu:muR,muF:tyreMu(v.FzRefF||v.FzRef,v.FzRefF||v.FzRef),FzRef:v.FzRef,FzRefF:v.FzRefF||v.FzRef,
    loadSens:LOAD_SENS,muX:TYRE_MU_X,cc,ccP2:TYRE_CC_P2,slipOpt:TYRE_SLIP_OPT,slipC:TYRE_SLIP_C,relax:v.rTire,
    cdA:v.cdA,clA:v.clA||0,aeroBal:v.aeroBal==null?0.5:v.aeroBal,crr:v.crr,
    lltdF:v.lltdF==null?v.fWt:v.lltdF,tauLoad:1/(2*Math.PI*ride),
    ...body,
    drive:el&&el.front?(v.driveMech==='fwd'?'fwd':'rwd'):v.drive,centre:v.drive==='awd'&&!(el&&el.front)?centreCoupling(v):null,diff:diffCoupling(v.df),ratios:(v.ratios||[1]).slice(),fd:v.finalDrive||1,eff:v.driveEff||0.9,
    shiftTime:v.shiftCut||0,ev:!!v.ev||!!pt.direct,tc:!!aids.tc,abs:!!aids.abs,
    rpm:curve.map(p=>p.rpm),tq:curve.map(p=>p.tq),ov:pt.overrunTable(rl),idle:pt.idleRpm()||0,redline:rl,
    Ie:pt.inertia()||0.15,clutchCap:1.5*peak,
    fireRpm:FIRE_RPM,fireTurns:1/(engine.chargesPerRev||0.5),starterT0:v.ev?0:starterStallTorque(),starterFree:STARTER_FREE_RPM,   // stalling and starting, as on the bench
    // where the engine is held to pull away flat out: the speed the 0-100 solver found quickest of its five tries,
    // as a launch control is set (build 276). Until then it was the torque peak, no higher than 60% of the redline,
    // which left a turbo unlit on the line (the GT-R at 2400 rpm) and a powerful car short of flywheel.
    launchRpm:(()=>{const A=v.ev||pt.direct?null:simulateAccelRun();return A&&A.launchRpm>0?A.launchRpm:Math.min(curve.reduce((m,p)=>p.tq>m.tq?p:m,curve[0]).rpm,0.6*rl);})(),
    brakeF:brakeForceCap(v),brakeFront:v.brakeFrontShare,
    // The lever brake (build 382): rear wheels only, outside the ABS (a cable to the rear calipers or a drum-in-hat).
    // Its force at the road (N, both wheels): the rear service brake's, as if the lever reached its full line force
    // (PROBABLE: no maker publishes a lever-brake torque), and never under the floor UN ECE R13-H (parking brake) and FMVSS 135 S7.12
    // set, holding the laden car on a 20% grade, m g sin(atan 0.2) = 0.196 m g.
    hbCap:Math.max(brakeForceCap(v)*(1-v.brakeFrontShare),v.mass*DRIVE_G*Math.sin(Math.atan(0.2))),
    steerLock:8.5/(v.steerRatio||15),       // 2.7 turns of the hand wheel lock to lock (probable), through the ratio
    // the steering's feel (build 323, phase G2): the front tyres' vertical rate for their contact length, and the caster trail
    steerRatio:v.steerRatio||15,ktF:quarterCar(v,'F').kt,ktR:quarterCar(v,'R').kt,casterTrail:v.rTire*Math.tan((v.caster==null?DRIVE_CASTER:v.caster)*Math.PI/180),scrub:v.scrubRadius==null?DRIVE_SCRUB:v.scrubRadius,
    // the camber (phase G4): static (rad) and the share of the roll recovered, each axle; see THE CAMBER
    camF:(v.camberF!=null?v.camberF:v.camber||0)*Math.PI/180,camR:(v.camberR!=null?v.camberR:v.camber||0)*Math.PI/180,
    recF:v.camRecF!=null?v.camRecF:CAMBER_RECOVERY,recR:v.camRecR!=null?v.camRecR:CAMBER_RECOVERY
  };
}
// A car at rest, in neutral for a clutch car until the driver asks for a gear.
function driveState(car){
  return {soc:car.el?car.el.soc0:0,eng:true,engT:0,Pm:0,shE:0,boost:0,t:0,x:0,y:0,psi:0,vx:0,vy:0,yaw:0,w:[0,0,0,0],we:car.idle*Math.PI/30,gear:1,shiftT:0,
    axF:0,ayF:0,roll:0,rollV:0,pitch:0,pitchV:0,zu:[0,0,0,0],zuV:[0,0,0,0],heave:0,heaveV:0,rr:[0,0],al:[0,0,0,0],abs:[1,1,1,1],tcF:1,esp:[0,0,0,0],yawRef:0,espOver:false,espF:1,clF:1,pull:false,firing:true,
    ax:0,ay:0,Fz:[0,0,0,0],kappa:[0,0,0,0],alpha:[0,0,0,0],Fx:[0,0,0,0],Fy:[0,0,0,0],camber:[0,0,0,0],cg:[0,0,0,0],toe:[0,0,0,0],Fyw:[0,0,0,0],rpm:car.idle,speed:0,delta:0,steerTorque:0,handTorque:0};
}
// THE ELECTRIC SIDE AS PLAIN DATA (build 275): a hybrid's motor and pack, or an electric car's. null without one.
// The full-load curve the car carries is already the engine's and the motor's together at the pack's rated charge, and
// its overrun already holds the regeneration (powertrain()). What was missing is the pack as a state, and a controller:
//   Split    the pedal asks a torque of the shaft (full load by the pedal, the overrun off it). The engine gives all
//            of it that it can, driving or dragging, and the motor only the rest (the lap's rule, hybridLap): help
//            past the engine's full load, regeneration past its own drag.
//   Window   the tune's CHARGE window bounds both. The motor's help is whole down to 10 points of charge above the
//            window's low and falls to nothing at the low; its regeneration is whole up to 10 points under the high
//            and nothing at the high, where the pack takes no more. (10 points: the band the bench's controller
//            works over, hybControl; the window's own half where that is narrower.) An electric car's help is cut by
//            its battery management's own law (EV_BMS). Regeneration fades to nothing at rest below the table's
//            first speed.
//   Shifting with LOAD-POINT SHIFTING on, while driving, the engine works harder or easier than the pedal asks and
//            the motor takes the difference, to bring the charge to its target: the bench controller's law
//            (hybControl: half the pack's charging power, over those 10 points). The wheels feel no difference.
//   Charge   the pack gives the motor's shaft power and its losses (read off the motor on a grid of speed and torque)
//            and its own I2R at the bus voltage.
//   Front    a front axle motor (the 918's) drives the front wheels by its own force over road speed; the engine and
//            the main motor then drive the rear, or the front too if that is the axle the car's gearbox was set to
//            before the motor was fitted (vehicle.driveMech, build 279). Its losses are its own, by its torque.
//   Pack     (build 279, a hybrid's) the motors' help is also cut to what the pack can give at this charge: the
//            lower of its rate and the power at its cut-off voltage (packMaxPower's law), each motor its share. The
//            curve is already cut to that at the rated charge; lower in the window the cells' voltage is lower.
//   Stop     (build 288, a P2's) the engine stops and its clutch opens, and the motor drives the gearbox alone, by the
//            LIVE bench's AUTO rule (HYB_BENCH, hybrid-bench.js): it starts when the pedal asks more power than the
//            motor's share (evShare of what the motor and the pack give, or the tune's EV POWER; a plug-in with charge to
//            spare, all of it), past EV UP TO, or when the charge is 10 points under its target; it stops at 0.7 of
//            that share, and once started or stopped it stays so for 2 s unless the charge is at the low. The pedal's
//            ask (driveAsk) is at the shaft's speed, no lower than idle (the bench takes the shaft's own, so at rest it
//            asks nothing). Starting is instant and costs the pack nothing: the motor turning the engine up is not stepped.
// A power-split's shaft is its traction motor's and its engine's part is the steady eCVT curve's (psCurves): the
// battery's part of that curve is treated as the motor's here. Its engine's own speed is not stepped.
function driveElectric(pt,curve,rl){
  const e=engine,hy=isHybrid()?e.hy:null;if(!hy&&!isElectric())return null;
  const src=hy||e,m=src.motor,pack=src.pack,V=hy?hybBusV(hy):motorRatedV(e),tc=m.cool.tCool,temp={w:tc+20,c:tc+15,r:60};   // warm, as the lap's energy count has it
  const tu=hy?hybTune(e):null,c=hy?hybCurves():null,NS=13,NT=5,rpm=[],tmax=[],loss=[];
  for(let i=0;i<NS;i++){const n=Math.max(1,m.nMax*i/(NS-1)),T=motorMaxTorque(m,n,V,60);rpm.push(n);tmax.push(T);
    for(let j=0;j<NT;j++)loss.push(motorLosses(m,T*j/(NT-1),n,V,temp).total);}
  const el={capJ:pack.kWh*3.6e6,V:packOcv(pack,hy?HYB_SOC:0.5),R:pack.R,
    // the charge window: [low, target, high], the motor's share at the low, and the charge it starts with
    // the charge it starts with (a plug-in full, as in the race: build 279) and holds; the window [lo, hi], the bands the help and the regeneration fade over
    // inside it, and the share of the help left at the low
    soc0:hy?(e.hyPlug?tu.socHi:tu.socT)/100:0.5,tg:hy?tu.socT/100:0.5,lo:hy?tu.socLo/100:EV_BMS.limp,hi:hy?tu.socHi/100:1,
    dn:hy?Math.min(0.1,(tu.socT-tu.socLo)/100):EV_BMS.low-EV_BMS.limp,up:hy?Math.min(0.1,(tu.socHi-tu.socT)/100):0,kLo:hy?0:EV_BMS.lowFloor,
    lps:hy&&tu.lps?HYB_BENCH.chargeShare*pack.pChargeMax:0,lpsBand:0.1,
    mrpm:rpm,tmax,loss,
    crpm:(hy?c.eng:curve).map(q=>q.rpm),mot:hy?c.mot.slice():curve.map(q=>q.tq),regen:hy?hybRegenTable(rl):pt.overrunTable(rl),front:null};
  if(hy){                                                 // the pack's own limit at a charge (build 279)
    const cool={w:tc,c:tc,r:60};                          // as the curve was cut (hybMotorTq)
    el.ocv=[];for(let k=0;k<=10;k++)el.ocv.push(packOcv(pack,k/10));
    el.vMin=pack.vMin;el.iMax=pack.iMax;el.share=hy.shareR||1;
    // what the full help draws: on a P2 the motor's shaft power and losses; a power-split's or a series hybrid's curve
    // is the pack's power passed through the eCVT, so there the help follows the pack's power against the rated one
    if(pt.direct)el.pRef=packMaxPower(pack,HYB_SOC);
    else{el.ml=el.crpm.map((n,i)=>motorLosses(m,el.mot[i],Math.max(n,1),V,cool).total);
      el.full=c.full.slice();el.stop={share:HYB_BENCH.evShare,kw:tu.evKw*1000,kmh:tu.evKmh,plug:!!e.hyPlug,dwell:HYB_BENCH.dwell};}   // a P2: the motor alone
  }
  if(hy&&hy.front&&vehicle.frontTab){const f=hy.front,v=vehicle,F=v.frontTab.slice(),lf=[];
    for(let k=0;k<F.length;k++){const n=k*0.5/v.rTire*v.frontFd*30/Math.PI;
      for(let j=0;j<NT;j++)lf.push(F[k]>0?motorLosses(f.motor,F[k]*j/(NT-1)*v.rTire/(v.frontFd*HYB_FRONT_EFF),Math.max(n,1),V,temp).total:0);}
    el.front={F,loss:lf,eff:HYB_FRONT_EFF,share:f.shareF};}   // the force at full help every 0.5 m/s, and the motor's losses there at 0, 25 .. 100% of it
  return el;
}
// The shares the charge allows: [of the motor's help, of its regeneration].
function driveShares(el,soc){
  return [soc>=el.lo+el.dn?1:soc>el.lo?el.kLo+(1-el.kLo)*(soc-el.lo)/el.dn:0,el.up>0?Math.max(0,Math.min(1,(el.hi-soc)/el.up)):soc<el.hi?1:0];
}
// The share of a motor's full help the pack can carry at this charge (build 279): Pm its shaft power at full help (W),
// loss its losses there, share its part of the pack.
function drivePackMax(el,soc){
  const x=Math.max(0,Math.min(1,soc))*10,i=Math.min(9,Math.floor(x)),V0=el.ocv[i]+(el.ocv[i+1]-el.ocv[i])*(x-i);
  const I=Math.min(el.iMax,(V0-el.vMin)/el.R);return Math.max(0,(V0-I*el.R)*I);
}
function drivePack(el,soc,Pm,loss,share){
  if(!el.ocv||!(Pm>1))return 1;
  const Pmax=drivePackMax(el,soc);
  return Math.max(0,Math.min(1,el.pRef?Pmax/el.pRef:(Pmax*share-loss)/Pm));
}
// The same for the shaft's motor at a speed, mot its full help there (Nm).
const driveHelp=(el,soc,rpm,mot)=>el.ocv?drivePack(el,soc,mot*rpm*Math.PI/30,el.ml?driveLerp(el.crpm,el.ml,rpm):0,el.share):1;
// The shaft's motor's losses (W) at a speed and torque, straight between the grid's points.
function driveMotorLoss(el,rpm,Tm){
  const NT=el.loss.length/el.mrpm.length,[i,fi]=driveAt(el.mrpm,rpm),tmx=el.tmax[i]+(el.tmax[i+1]-el.tmax[i])*fi;
  const x=Math.min(1,Math.abs(Tm)/Math.max(1e-6,tmx))*(NT-1),j=Math.min(NT-2,Math.floor(x)),fj=x-j,at=(a,b)=>el.loss[a*NT+b];
  return rpm*Math.PI/30>1||Tm!==0?(at(i,j)*(1-fi)+at(i+1,j)*fi)*(1-fj)+(at(i,j+1)*(1-fi)+at(i+1,j+1)*fi)*fj:0;
}
// The torque the pedal asks of the shaft (Nm): the same whether the engine runs or not, as the wheels feel no difference
// (the Split above); at least at idle speed, so a car standing still asks what it would pull away with.
const driveAsk=(car,thr,rpm,soc)=>driveEngine(car,thr,Math.max(rpm,car.idle),null,soc);
// A P2's motor alone on the shaft, its engine stopped (build 288): all of the ask, up to its full torque (by the charge
// and the pack) driving and its regeneration dragging. Off the pedal there is no engine drag, so the car coasts further.
function driveMotorOnly(car,thr,rpm,soc){
  const el=car.el,[k,r]=driveShares(el,soc),full=driveLerp(el.crpm,el.full,rpm);
  const cut=drivePack(el,soc,full*rpm*Math.PI/30,driveMotorLoss(el,rpm,full),el.share);
  const reg=el.regen[Math.max(0,Math.min(el.regen.length-1,Math.round((rpm-500)/250)))]||0;
  return Math.max(-r*reg*Math.min(1,rpm/500),Math.min(k*cut*full,driveAsk(car,thr,rpm,soc)));
}
// Whether a P2's engine runs this step (see Stop above): pedal the driver's, rpm the shaft's, v the road speed.
function driveStartStop(car,s,pedal,rpm,v,h){
  const el=car.el,E=el.stop,on=s.eng,ns=Math.max(rpm,1000),mot=driveLerp(el.crpm,el.full,ns)*ns*Math.PI/30;
  const Pmax=drivePackMax(el,s.soc)*el.share,deplete=E.plug&&s.soc>el.tg+0.02;
  const Pev=deplete?Math.min(Pmax,mot):E.kw>0?E.kw:E.share*Math.min(Pmax,mot);
  const Pd=Math.max(0,driveAsk(car,pedal,rpm,s.soc))*Math.max(rpm,car.idle)*Math.PI/30;
  const want=pedal>0.01&&(Pd>(on?(deplete?0.9:0.7):1)*Pev||s.soc<el.tg-0.1||(E.kmh>0&&v*3.6>E.kmh))||s.soc<el.lo;
  const next=want===on||s.soc<el.lo||s.engT>=E.dwell?want:on;
  if(next!==on){s.engT=0;s.eng=next;if(next){s.firing=true;s.we=Math.max(s.we,car.idle*Math.PI/30);}}else s.engT+=h;
}
// What the shaft's motor does this step, and the pack with it. thr and rpm are the shaft's; Ff, vf the front motor's
// force (N) and its wheels' speed. Leaves s.soc and s.Pm (the motors' power at their shafts, W; negative charging).
function driveCharge(car,s,thr,rpm,Ff,vf,h,Toff){
  const el=car.el,w=Math.max(0,rpm)*Math.PI/30,[k,r]=driveShares(el,s.soc);
  const motF=driveLerp(el.crpm,el.mot,rpm),wotE=Math.max(0,driveEngine(car,1,rpm,s.boost)-motF),T=driveEngine(car,thr,rpm,s.boost,s.soc);
  const ix=Math.max(0,Math.min(el.regen.length-1,Math.round((rpm-500)/250))),regF=el.regen[ix]||0,reg=r*regF*Math.min(1,rpm/500);
  const ovE=car.ev?0:Math.max(0,(car.ov[ix]||0)-regF);                      // the engine's own drag, its throttle shut
  let Te=Math.max(-ovE,Math.min(wotE,T));
  if(el.lps&&wotE>0&&thr>0&&w>1)Te=Math.max(0,Math.min(wotE,Te+Math.max(-1,Math.min(1,(el.tg-s.soc)/el.lpsBand))*el.lps/w));
  const Tm=Toff!=null?Toff:Math.max(-reg,Math.min(k*driveHelp(el,s.soc,rpm,motF)*motF,T-Te));   // the engine stopped: all of it
  const NT=el.loss.length/el.mrpm.length,ls=driveMotorLoss(el,rpm,Tm);
  let Pm=Tm*w,P=Pm+ls;
  if(el.front&&Ff>0){const q=Math.max(0,vf)/0.5,a=Math.min(el.front.F.length-2,Math.floor(q)),full=el.front.F[a]+(el.front.F[a+1]-el.front.F[a])*(q-a);
    const fx=full>0?Math.min(1,Ff/full)*(NT-1):0,fj2=Math.min(NT-2,Math.floor(fx)),lf=(b,d)=>el.front.loss[b*NT+d],ln=d=>lf(a,d)+(lf(a+1,d)-lf(a,d))*(q-a);
    Pm+=Ff*vf;P+=Ff*vf/el.front.eff+ln(fj2)+(ln(fj2+1)-ln(fj2))*(fx-fj2);}   // its own losses at this speed and torque (build 279)
  const I=P/el.V;
  s.soc=Math.max(0,Math.min(1,s.soc-(P+I*I*el.R)*h/el.capJ));s.Pm=Pm;
}
// THE TURBO AS PLAIN DATA (build 274). The bench, the 0-100 and the lap step one shaft (advanceShaft): its energy
// E = J w^2 / 2 gains the turbine's power less the compressor's and the bearings', the boost is what the wheel makes at
// that speed, and on a lift the boost falls only as fast as the engine empties the charge pipes. That needs the whole
// engine model, which a game does not load. So the same balance is read off the engine once, on a grid of engine speed,
// shaft speed and throttle: the shaft's net power P (W), the boost the wheel supports bS (bar) and the compressor's
// efficiency eta. At each point the air is what the engine swallows AT that boost (a fixed point, since a rising
// boost follows the shaft at once). Beside it: the air swallowed at 1 bar and the charge temperature over engine
// speed (for the emptying and the fill), and the torque over engine speed and boost (the lap's own grid).
function driveTurbo(pt,grid){
  const e=engine,iat0=state.iat;state.iat=20;                 // design conditions, as the 0-100 and the lap pin them
  const T01=293.15,NR=10,NN=16,TH=[0.08,0.25,0.45,0.65,0.82,1],lo=Math.min(1000,pt.idleRpm()||1000),hi=pt.maxRpm();
  const rp=[],ns=[],u=[],P=[],bS=[],eta=[],air=[],Tch=[],bAv=grid.rpms.map(r=>pt.boostAvail(r));
  for(let i=0;i<NN;i++)ns.push(e.shaftMax*i/(NN-1));
  for(let i=0;i<NR;i++){const rpm=lo+(hi-lo)*i/(NR-1),bt=pt.boostTarget(rpm);rp.push(rpm);
    air.push(airFlowAt(rpm,1));u.push(unitsAt(rpm));Tch.push(effIAT(1+bt/2,rpm)+273.15);
    for(const n of ns)for(const th of TH){
      const T3=exhaustGasT(Math.max(0.3,th),rpm);let b=0,r=null;
      for(let k=0;k<8;k++){r=shaftNetPower(n,airFlowAt(rpm,1+b)*th,T3,T01,rpm);b=0.5*b+0.5*Math.max(0,Math.min(bt,r.pr-1));}
      P.push(r.net-shaftLossPower(n));bS.push(b);eta.push(Math.max(0.3,Math.min(0.85,r.eta||0.7)));
    }}
  state.iat=iat0;
  return {J:e.shaftJ,nMax:e.shaftMax,V:e.chargeVol||0,T01,rp,u,n:ns,th:TH,P,bS,eta,air,Tch,
    rpm:grid.rpms.slice(),boosts:grid.boosts.slice(),tq:grid.tq.map(r=>r.slice()),bAvail:bAv,
    flatShift:['dct','sequential','auto'].includes(vehicle.gearbox)};   // a spark-cut shift keeps the throttle open (the lap's rule)
}
// Where x sits in a rising list: [index below, share of the way to the next].
function driveAt(xs,x){const n=xs.length;if(x<=xs[0])return [0,0];if(x>=xs[n-1])return [n-2,1];let i=1;while(xs[i]<x)i++;return [i-1,(x-xs[i-1])/(xs[i]-xs[i-1])];}
// One step of the shaft: s.shE (J) and s.boost (bar) under the engine's speed and the throttle, as advanceShaft has it.
function driveShaft(tb,s,rpm,thr,h){
  const th=Math.max(0.08,Math.min(1,thr)),Emax=0.5*tb.J*Math.pow(tb.nMax*Math.PI/30,2);
  const n=Math.sqrt(2*s.shE/tb.J)*30/Math.PI,[i,fi]=driveAt(tb.rp,rpm),[j,fj]=driveAt(tb.n,n),[k,fk]=driveAt(tb.th,th);
  const NN=tb.n.length,NT=tb.th.length,at=(A,a,b,c)=>A[(a*NN+b)*NT+c];
  const tri=A=>{let v=0;for(let a=0;a<2;a++)for(let b=0;b<2;b++)for(let c=0;c<2;c++)v+=(a?fi:1-fi)*(b?fj:1-fj)*(c?fk:1-fk)*at(A,i+a,j+b,k+c);return v;};
  const bSh=tri(tb.bS),Tc=tb.Tch[i]+(tb.Tch[i+1]-tb.Tch[i])*fi,air=tb.air[i]+(tb.air[i+1]-tb.air[i])*fi;
  // falling, the charge pipes empty at the rate the engine swallows them: tau = air held / air swallowed
  const b=s.boost,b2=bSh>=b?bSh:bSh+(b-bSh)*Math.exp(-h*air*th*287*Tc/Math.max(1e-9,tb.V*1e5));
  // rising, the air that fills them costs the compressor's work per kg, shared by the turbos running (build 290)
  const pr=1+0.5*(b+b2),fill=tb.V*Math.max(0,b2-b)*1e5/(287*Tc)*1005*tb.T01*(Math.pow(pr,0.286)-1)/tri(tb.eta)/tb.u[fi<0.5?i:i+1];
  s.shE=Math.max(0,Math.min(Emax,s.shE+tri(tb.P)*h-fill));s.boost=b2;
}
// A car on the line, ready to launch: the engine held at its launch speed with the clutch down, and a turbo spun up
// for the 1.2 s the 0-100 solver holds it there (its brake-boost). driveState() is the car at rest at idle.
function driveLaunch(car){
  const s=driveState(car);if(car.ev)return s;
  s.we=car.launchRpm*Math.PI/30;s.rpm=car.launchRpm;
  if(car.turbo)for(let i=0;i<1200;i++)driveShaft(car.turbo,s,car.launchRpm,1,0.001);
  return s;
}
function driveLerp(xs,ys,x){
  const n=xs.length;if(x<=xs[0])return ys[0];if(x>=xs[n-1])return ys[n-1];
  let i=1;while(xs[i]<x)i++;
  return ys[i-1]+(ys[i]-ys[i-1])*(x-xs[i-1])/(xs[i]-xs[i-1]);
}
// THE CAMBER (phase G4). Each wheel leans on the road by its static camber (vehicle.camberF/R, the kit's alignment;
// 0 on a solid axle) and by the body's roll less the share its linkage recovers (vehicle.camRecF/R: (t/2)/fvsa by
// the axle's type, SUSP_GEO, Milliken & Milliken RCVD ch. 17). These are the lap's own inputs (latCamberF).
// gam is the lean to the left (rad), top of the wheel towards +y, s.camber.
//   thrust a leaning tyre pushes towards its lean. In the brush model the tread base of a cambered wheel runs on a curve
//          of curvature sin(gam)/R through the contact patch, so the tread on a straight track deflects by
//          (a^2-x^2) sin(gam)/(2R): Fy = (2/3) c_p a^3 gam / R, against the cornering stiffness 2 c_p a^2. So the camber
//          stiffness is C a/(3R), a the patch's half length as G2 has it (Pacejka, Tyre and Vehicle Dynamics ch. 3,
//          the brush model's geometry). It is taken as an equivalent slip angle, so it saturates with the side force,
//          and like the slip it builds over the relaxation length as the wheel rolls (none at rest).
//          The brush model has no carcass, and no measured camber stiffness for a radial road tyre was found to set it
//          against: PROBABLE. About 0.11 of C on a road tyre (a 0.1 m, R 0.31 m).
// Left out, named: the grip by camber. The lap's law (latCamberF: CAMBER_LOSS a degree off CAMBER_BEST, by the axle's
// outside wheel) cost the stepped car 1-6% of its skidpad grip, and the test driver, who takes the lap's speeds, then
// left the line by up to 7.8 m and slid the Model 3 to 31 degrees (test170); it waits for a driver that judges the
// car's own grip, and the camber's own aligning moment. Tried again with the yaw-rate ESP (small-physics step 6): by
// each wheel's own lean the 911 GT3 left the line (15 m, 68 deg); by each axle's outside wheel, as the lap has it,
// 11.8 m and 41 deg, the Model 3 9.5 m and 38 deg, the Civic 7.9 m, against OFF_KNOWN's 4.8 m. Named until after v1.0.
//   heave  (small-physics step 3) each wheel's own travel on the body moves its camber too, not only the axle's roll: the same
//          swing arm, 1/fvsa a metre of travel (2 rec / t), the top inwards in bump, so heave and pitch camber the
//          wheels as well (Reimpell, The Automotive Chassis, ch. 3, camber change over travel: PROBABLE as the roll's
//          own curve). A solid axle or twist beam keeps its wheels' camber in parallel travel (their recovery is roll only).
// THE TOE (phase G5). Each wheel steers by the body's roll (roll steer) and by its own side force (lateral force
// compliance steer: the bushes give). Both in the understeer sense positive: a front wheel steers out of the turn, a
// rear one into it. The figures are a fleet's, not each suspension type's: no figure by type was found published. Each is
// the middle of the measured range in "Summary of typical vehicle parameter measurements" (ResearchGate 329552571; its
// sign convention is the one used here):
//   roll steer         front 0.2 us to 0.1 os deg/deg: 0.05; rear 0.13 us to 0.06 os: 0.035
//   compliance steer   front 0.60 us to 0.22 os deg/kN: 0.19; rear 0.02 us to 0.22 os: -0.10 (oversteer)
// The same summary's understeer gradients, 0.7-8.2 deg/g, are what they add to. vehicle.rollSteerF/R (deg/deg) and
// compSteerF/R (deg/kN) override them. The side force is the wheel's own of the step before, so its toe lags a step.
// Bump steer (small-physics step 3): roll steer is each wheel's toe change with its own travel, so a wheel in heave or pitch toes
// by the same curve, rs / (t/2) a metre, out in bump at the front for an understeering rs (Reimpell, ch. 3, toe change
// over travel: PROBABLE as the roll's own). In pure heave the two wheels toe equal and opposite. Not on a solid axle
// or twist beam, whose roll steer is the axle's own yaw.
// Left out, named: the aligning-torque compliance steer (front 0.4-1.6 deg/100 Nm us in the same summary), bump steer
// in heave, and a figure per suspension type.
const DRIVE_TOE={rollSteerF:0.05,rollSteerR:0.035,compSteerF:0.19,compSteerR:-0.10};
function driveToe(v){const k=n=>v[n]!=null?v[n]:DRIVE_TOE[n],kN=Math.PI/180/1000;
  return {rsF:k('rollSteerF'),rsR:k('rollSteerR'),csF:k('compSteerF')*kN,csR:k('compSteerR')*kN};}
// A wheel's contact half length (m): the tyre as a circle of radius r pressed flat by Fz/kt (see DRIVE_CASTER).
function drivePatch(r,kt,Fz){if(!(kt>0))return 0;const d=Math.min(r,Math.max(0,Fz)/kt);return Math.sqrt(Math.max(0,2*r*d-d*d));}
// One tyre: the force along and across the wheel (N) for a load Fz, a slip ratio and a slip angle (rad), tg, its
// camber's equivalent slip (tan, as relaxed: see THE CAMBER), and gq, the grip of what it stands on (THE SURFACE; 1 without).
// Returns [Fl, Ft, s, dFl/dkappa]: s is the share of the grip in use (1 = sliding all over the contact patch).
function driveTyre(car,Fz,kappa,alpha,front,tg,gq){
  if(!(Fz>1))return [0,0,0,0];
  const ref=front?car.FzRefF:car.FzRef,muY=(gq==null?1:gq)*(front?car.muF:car.mu)*Math.pow(Math.max(200,Fz)/ref,-car.loadSens),muX=car.muX*muY;
  const xz=Fz/ref,Ca=car.cc*Fz*(car.ccP2+1)/(car.ccP2+xz*xz),Ck=3*muX*Fz/car.slipOpt;                 // the longitudinal peak sits at slipOpt, as the launch has it
  const ty=Math.tan(alpha)+(tg||0);
  const sx=Ck*kappa/(3*muX*Fz),sy=Ca*ty/(3*muY*Fz),s=Math.hypot(sx,sy);
  if(s<1e-9)return [0,0,0,Ck];
  let f;
  if(s<=1)f=3*s-3*s*s+s*s*s;
  else{const B=Math.tan(Math.PI/(2*car.slipC))/car.slipOpt;f=Math.sin(car.slipC*Math.atan(B*car.slipOpt*Math.min(s,30)));}   // sliding: the launch's curve
  return [muX*Fz*f*sx/s,muY*Fz*f*sy/s,s,Ck*Math.max(0.02,s<1?(1-s)*(1-s):0.02)];
}
// The engine's torque at the crank (Nm) for a pedal and a speed: full load by the pedal, its own drag off it,
// nothing past the limiter, and an idle governor that holds it up.
function driveEngine(car,thr,rpm,boost,soc){
  let wot;
  if(car.turbo&&boost!=null){const tb=car.turbo,[i,fi]=driveAt(tb.rpm,rpm),[j,fj]=driveAt(tb.boosts,Math.min(boost,tb.bAvail[i]+(tb.bAvail[i+1]-tb.bAvail[i])*fi));
    const a=tb.tq[j][i]+(tb.tq[j][i+1]-tb.tq[j][i])*fi,c=tb.tq[j+1][i]+(tb.tq[j+1][i+1]-tb.tq[j+1][i])*fi;wot=a+(c-a)*fj;}
  else wot=driveLerp(car.rpm,car.tq,rpm);
  let ov=car.ev&&!car.el?0:car.ov[Math.max(0,Math.min(car.ov.length-1,Math.round((rpm-500)/250)))]||0;
  if(car.el){                                       // the motor's help and its regeneration, by what the charge allows
    const el=car.el,[k,r]=soc==null?[1,1]:driveShares(el,soc),reg=el.regen[Math.max(0,Math.min(el.regen.length-1,Math.round((rpm-500)/250)))]||0;
    const mot=driveLerp(el.crpm,el.mot,rpm);wot-=(1-k*(soc==null?1:driveHelp(el,soc,rpm,mot)))*mot;ov=Math.max(0,ov-reg)+r*reg*Math.min(1,rpm/500);
  }
  if(rpm>=car.redline)return -ov;
  let T=thr*wot-(1-thr)*ov;
  if(!car.ev&&rpm<car.idle)T+=Math.min(0.4*wot+ov,(car.idle-rpm)*0.5);
  return T;
}
// THREE MANOEUVRES THAT SHOW WHAT THE AIDS DO (build 282), each from a car as plain data.
// A car rolling at vk km/h in the highest gear that keeps the engine at 2000 rpm.
function driveRolling(car,vk){
  const v=vk/3.6,s=driveState(car);s.vx=v;s.w=s.w.map(()=>v/car.r);
  for(let g=car.ratios.length;g>=1;g--){s.gear=g;if(v/car.r*car.ratios[g-1]*car.fd*30/Math.PI>=2000)break;}
  s.we=v/car.r*car.ratios[s.gear-1]*car.fd;return s;
}
// A full stop from 100 km/h: the distance (m) and whether a wheel locked.
function driveStop100(car){
  const s=driveRolling(car,100);let lock=false;
  while(s.vx>0.3&&s.t<15){stepCar(car,s,{steer:0,throttle:0,brake:1},0.005);if(s.vx>3&&s.w.some(w=>w*car.r<0.2*s.vx))lock=true;}
  return {dist:s.x,lock};
}
// A standing start to 100 km/h, flat out: the time (s; null if it never gets there) and the most the driven tyres slipped.
function driveSprint(car){
  const s=driveLaunch(car);let slip=0;
  while(s.vx<100/3.6&&s.t<30){stepCar(car,s,{steer:0,throttle:1,brake:0},0.005);for(let i=0;i<4;i++)slip=Math.max(slip,s.kappa[i]);}
  return {t:s.vx>=100/3.6?s.t:null,slip};
}
// FMVSS 126's sine with dwell, the rule a stability control is approved on (49 CFR 571.126): from 80 km/h off the
// pedal, one cycle of a 0.7 Hz sine on the wheel with a 0.5 s hold at its second peak, at mult (up to 6.5) times the
// steering that gives 0.3 g, and no more than 270 degrees at the hand wheel. With no mult, the final run (S7.9.4: the
// greater of 6.5 x and 270 degrees). It passes with the yaw rate under 35% of
// its peak 1 s after the steering ends and under 20% after 1.75 s, and 1.83 m moved sideways 1.07 s in.
// Returns those, the most the car went sideways (deg) and its path [[x, y, heading]...] every 0.1 s.
function driveSineDwell(car,mult){
  const s=driveRolling(car,80),v=80/3.6,L=car.a+car.b,T=1/0.7,t0=0.5,end=t0+T+0.5;
  const A6=0.3*DRIVE_G*L*(1+car.Kus*v*v)/(v*v),A270=car.steerLock*4.71/8.5,A=mult?Math.min(mult*A6,A270):Math.max(6.5*A6,A270);
  const st=t=>t<0?0:t<0.75*T?Math.sin(2*Math.PI*0.7*t):t<0.75*T+0.5?-1:t<T+0.5?Math.sin(2*Math.PI*0.7*(t-0.5)):0;
  let pk=0,y=0,r1=0,r175=0,beta=0,n=0;const path=[];
  while(s.t<end+2){const t=s.t-t0;stepCar(car,s,{steer:A*st(t)/car.steerLock,throttle:0,brake:0,gear:s.gear},0.005);
    if(t>0.5*T)pk=Math.max(pk,Math.abs(s.yaw));if(Math.abs(t-1.07)<0.003)y=Math.abs(s.y);
    if(Math.abs(s.t-end-1)<0.003)r1=Math.abs(s.yaw);if(Math.abs(s.t-end-1.75)<0.003)r175=Math.abs(s.yaw);
    beta=Math.max(beta,Math.abs(Math.atan2(s.vy,Math.max(1,s.vx)))*180/Math.PI);
    if(n++%20===0)path.push([s.x,s.y,s.psi]);}
  r1/=pk||1;r175/=pk||1;
  return {r1,r175,y,beta,path,pass:r1<=0.35&&r175<=0.20&&y>=1.83};
}
// A lap's racing line as plain data for the driver below: where it runs, how fast the lap solver takes each point, and
// the road's height there. lap is what simulateLap() returns.
function driveLine(lap){return lap.track.line.map((q,i)=>({x:q.x,y:q.y,v:lap.v[i],grade:q.sinT||0,kv:q.kv||0}));}
// THE SURFACE (phase G7): what is under each wheel, from where the wheel is on the circuit.
//   grip    as a share of the tyre's own on dry asphalt: the surface's friction over dry asphalt's, both from one table
//           of locked-wheel stops (Noon, Engineering Analysis of Vehicular Accidents, CRC 1994, as quoted by Cenek,
//           Jamieson & McLarin, "Frictional characteristics of roadside grass types", Opus Central Laboratories NZ):
//           dry asphaltic concrete 0.65, wet 0.50, gravel and dirt road 0.35, wet grassy field 0.20. Grass, dry and
//           wet, is Cenek's own: a car locked from 40 km/h on rye-grass, 0.36-0.38 dry (0.37) and 0.21-0.24 wet (0.22);
//           white clover gave 0.21 and 0.17. That the share holds for any tyre, and at the tyre's peak as when locked,
//           is PROBABLE: no measurement of it was found.
//   kerbs   the lap's own (kerbZones, build 217: the FIA's 5 cm Vallelunga and Melbourne ramps, 0.8 m wide), outside
//           the track's edge; beyond a kerb, or the edge where there is none, grass at the height the kerb left it.
//   traps   gravel where the circuit's picture draws a trap (SCENE_TRAP: outside a bend, 3.15-8.4 m past the edge),
//           wet or dry alike (a trap drains; PROBABLE).
//   rolling a wheel on grass or gravel rolls against the ground as well as its own tyre (DRIVE_SOIL).
//   bumps   ISO 8608's road, Gd(n) = Gd(n0) (n/n0)^-2 over the standard's own band, 0.011-2.83 cycle/m, at the Gd(n0)
//           the lap takes for the circuit (TRACK_ROAD), as a sum of 48 waves of fixed phases (a wave's amplitude is the
//           root of 2 Gd dn). One profile under the left wheels and one under the right, so a rear wheel meets what
//           the front met a wheelbase earlier.
// OPEN: a painted kerb's grip and its ribs, the bumps of grass, the narrow gravel verge the picture draws along the
// edge (grass here), how alike the left and right profiles are at long waves (apart here), a tyre's stiffness on soft
// ground, wet ground's own rolling resistance, and aquaplaning.
const DRIVE_SURFACE={asphalt:1,wet:0.50/0.65,gravel:0.35/0.65,grass:0.37/0.65,grassWet:0.22/0.65};
// THE SOIL (small-physics step 7): the rolling resistance of the ground a wheel stands on, in place of the tyre's own
// (car.crr) on a hard road.
//   gravel  Bekker's sinkage of a rigid wheel (Wong, Theory of Ground Vehicles, ch. 2): the pressure under it
//           p = (kc/b + kphi) z^n sinks it by z0 = [3 W / ((3-n)(kc + b kphi) sqrt D)]^(2/(2n+1)), and the work of
//           pressing the rut gives Rc = (kc + b kphi) z0^(n+1) / (n+1); b the tyre's width, D its diameter. A tyre
//           counts as rigid while its inflation holds more than the ground under it (here ~115 kPa against ~220).
//           The ground is Wong's dry sand (Table 2.3, Land Locomotion Lab: n 1.1, kc 0.99 kN/m^(n+1), kphi
//           1528.43 kN/m^(n+2)), as a trap's loose rounded gravel: PROBABLE, no Bekker values for gravel were found.
//           A car's wheel (4 kN, 225 mm, 0.63 m) gives 0.29 of its load, against 0.30 measured for car tyres on sand
//           (Wong, Table 1.1).
//   grass   a circuit's verge as firm ground: car tyres on medium-hard soil, 0.08 of the load (Wong, Table 1.1;
//           Bosch's handbook gives a field 0.1-0.35). PROBABLE that a mown verge is medium-hard.
const DRIVE_SOIL={gravel:{n:1.1,kc:0.99e3,kphi:1528.43e3},grass:{f:0.08}};
// A wheel's rolling resistance (N) under load Fz on soil (null: the road).
function driveRollF(car,Fz,soil){if(!soil)return car.crr*Fz;if(soil.f!=null)return soil.f*Fz;if(!(Fz>0))return 0;
  const b=car.tw||0.225,D=2*car.r,k=soil.kc+b*soil.kphi,n=soil.n;
  const z0=Math.pow(3*Fz/((3-n)*k*Math.sqrt(D)),2/(2*n+1));return k*Math.pow(z0,n+1)/(n+1);}
// A lap's circuit as plain data: its centreline, edges and kerbs, gd its road's Gd(n0) (m3; 0 is smooth), wet or dry.
function driveSurface(lap,gd,wet){const T=lap.track,c=T.pts,K=T.kerbs,n=c.length,arc=[0],W=[],cv=sceneCurv(c);
  for(let i=1;i<n;i++)arc.push(arc[i-1]+Math.hypot(c[i].x-c[i-1].x,c[i].y-c[i-1].y));
  if(gd>0)for(let k=0;k<48;k++){const lo=0.011*Math.pow(2.83/0.011,k/48),hi=0.011*Math.pow(2.83/0.011,(k+1)/48),nk=Math.sqrt(lo*hi);
    const ph=q=>{const x=Math.sin(12.9898*(k+1)+78.233*q)*43758.5453;return 2*Math.PI*(x-Math.floor(x));};   // fixed, so a lap repeats
    W.push([2*Math.PI*nk,Math.sqrt(2*gd*0.01/(nk*nk)*(hi-lo)),ph(1),ph(2)]);}
  return {x:c.map(q=>q.x),y:c.map(q=>q.y),nx:c.map(q=>q.nx),ny:c.map(q=>q.ny),hw:c.map(q=>q.hw!=null?q.hw:T.width/2),arc,
    P:K?Array.from(K.P):null,N:K?Array.from(K.N):null,kw:KERB_W,waves:W,road:wet?DRIVE_SURFACE.wet:1,off:wet?DRIVE_SURFACE.grassWet:DRIVE_SURFACE.grass,
    trap:cv.map(k=>Math.abs(k)<SCENE_TRAP.curv?0:k>=0?-1:1),trapIn:SCENE_TRAP.in,trapOut:SCENE_TRAP.out,gravel:DRIVE_SURFACE.gravel};}
// The road under the four wheels of a car at s: {z, grip, soil} for u.road (soil: DRIVE_SOIL's, or null on the road). It reads only its arguments; m is its memory ({i},
// the centreline point the car is at).
function driveRoadAt(S,car,s,m){const n=S.x.length,z=[0,0,0,0],grip=[1,1,1,1],soil=[null,null,null,null],c=Math.cos(s.psi),sn=Math.sin(s.psi);
  const d2=i=>(s.x-S.x[i])*(s.x-S.x[i])+(s.y-S.y[i])*(s.y-S.y[i]);
  if(m.i==null){m.i=0;for(let i=1;i<n;i++)if(d2(i)<d2(m.i))m.i=i;}
  for(let k=0;k<n&&d2((m.i+1)%n)<d2(m.i);k++)m.i=(m.i+1)%n;
  for(let k=0;k<n&&d2((m.i-1+n)%n)<d2(m.i);k++)m.i=(m.i-1+n)%n;
  for(let q=0;q<4;q++){const xw=q<2?car.a:-car.b,yw=(q%2?-1:1)*(q<2?car.tF:car.tR)/2,px=s.x+xw*c-yw*sn,py=s.y+xw*sn+yw*c;
    let i=m.i;const al=j=>(px-S.x[j])*S.ny[j]-(py-S.y[j])*S.nx[j];                       // how far past point j, along the track
    for(let k=0;k<4&&al(i)<0;k++)i=(i-1+n)%n;for(let k=0;k<4&&al((i+1)%n)>=0;k++)i=(i+1)%n;
    const y=(px-S.x[i])*S.nx[i]+(py-S.y[i])*S.ny[i],out=Math.abs(y)-S.hw[i],H=out>0&&S.P?(y>0?S.P:S.N)[i]:0,a=S.arc[i]+al(i);
    for(const w of S.waves)z[q]+=w[1]*Math.cos(w[0]*a+w[2+q%2]);
    if(out>0){z[q]+=H*Math.min(1,out/S.kw);
      if(H&&out<=S.kw)grip[q]=S.road;
      else if(S.trap&&S.trap[i]===Math.sign(y)&&out>=S.trapIn&&out<=S.trapOut){grip[q]=S.gravel;soil[q]=DRIVE_SOIL.gravel;}
      else{grip[q]=S.off;soil[q]=DRIVE_SOIL.grass;}}
    else grip[q]=S.road;}
  return {z,grip,soil};}
// A DRIVER FOR A LINE (build 269): the inputs that take the car round a line of points {x, y, v, grade, kv}. It reads
// only its arguments (d is its memory: {i} the point it is at; it leaves d.e, how far left of the line the front
// axle is). What it does is a driver's manner, not the car's physics; its settings are in the register (DRIVE_DRIVER), kept as a rule by the owner's sign-off (build 278).
//   Wheel    it points the FRONT TYRES, not the car: at the direction the front axle is travelling, plus the slip
//            angle it wants from them. That is the path's direction against the axle's travel and a pull back to the
//            line that fades with speed (the two terms of Stanley's steering law: Hoffmann et al., ACC 2007), plus the
//            slip the corner just ahead needs (the front's share of m v^2 / R over its cornering stiffness). Never
//            more than a little past the angle the tyre peaks at: more lock past the peak only scrubs.
//            Because the reference is where the axle is going, a tail that steps out is met with opposite lock with
//            no extra rule; and once the rear tyres are past their peak, the front's slip is taken off by as much,
//            through zero if need be, so the front stops pulling the nose in while the rear recovers.
//   Pedals   by the force the plan asks of the tyres: the line's own change of speed, a correction for the speed
//            error, and what the air, the tyres and the slope take. Throttle is that force over what the engine has in
//            this gear; brake is the rest over what the brakes have. So a steady corner is held on part throttle, not
//            coasted on the engine's drag. With the rear past its peak the plan is dropped for a neutral pedal.
function driveDriver(car,s,line,d){
  const N=line.length,L=car.a+car.b,g=DRIVE_G,wrap=x=>x-2*Math.PI*Math.round(x/(2*Math.PI));
  const PREVIEW=0.15,PULL=d.pull||1.5,PAST=1.2,SPEED=1;  // s of road read ahead; 1/s to the line (d.pull: the moose driver's, build 353); of the peak slip; 1/s on the speed error
  const fx=s.x+car.a*Math.cos(s.psi),fy=s.y+car.a*Math.sin(s.psi);
  let bi=d.i||0,bd=1e18;                                 // the nearest point, looked for ahead of the last one
  for(let k=0;k<40;k++){const j=((d.i||0)+k)%N,q=line[j],dd=(q.x-fx)*(q.x-fx)+(q.y-fy)*(q.y-fy);if(dd<bd){bd=dd;bi=j;}}
  d.i=bi;
  const p0=line[bi],p1=line[(bi+1)%N],hp=Math.atan2(p1.y-p0.y,p1.x-p0.x),ds=Math.hypot(p1.x-p0.x,p1.y-p0.y)||1;
  const e=-(fx-p0.x)*Math.sin(hp)+(fy-p0.y)*Math.cos(hp);d.e=e;
  const la=Math.max(1,Math.round(s.vx*PREVIEW/ds)),c=line[(bi+la)%N],c1=line[(bi+la+1)%N],c0=line[(bi+la-1+N)%N];
  const kap=wrap(Math.atan2(c1.y-c.y,c1.x-c.x)-Math.atan2(c.y-c0.y,c.x-c0.x))/(Math.hypot(c.x-c0.x,c.y-c0.y)||1);
  // ---- the wheel
  const vf=Math.atan2(s.vy+car.a*s.yaw,Math.max(1,s.vx));               // where the front axle is going, against the car
  const pkF=Math.atan(3*car.muF/car.cc),pkR=Math.atan(3*car.mu/car.cc);  // the slip angles the tyres peak at
  const need=s.vx*s.vx*kap/(g*car.cc);                                  // (m b/L) v^2 kap over the front's C = cc (m g b/L)
  const aR=(s.alpha[2]+s.alpha[3])/2,over=Math.sign(aR)*Math.max(0,Math.abs(aR)-pkR);
  const want=wrap(hp-s.psi-vf)+need-Math.atan2(PULL*e,3+s.vx)-over;
  // the angle wanted is the front wheels' own on the road: the roll and the side force toe them out of it (THE TOE)
  const toeF=s.toe?(s.toe[0]+s.toe[1])/2:0,delta=vf-toeF+Math.max(-PAST*pkF,Math.min(PAST*pkF,want));
  // ---- the pedals
  const ease=Math.max(0,Math.min(1,2*(Math.max(Math.abs(s.alpha[2]),Math.abs(s.alpha[3]))/pkR-1)));   // rear past its peak: off the plan by 1.5 x
  const plan=(p1.v*p1.v-p0.v*p0.v)/(2*ds)+SPEED*(p0.v-s.vx);
  const F=car.m*plan*(1-ease)+0.5*DRIVE_RHO*car.cdA*s.vx*s.vx+car.crr*car.m*g+car.m*g*p0.grade;
  const k=s.gear>0?car.ratios[s.gear-1]*car.fd*car.eff/car.r:0,wot=driveEngine(car,1,s.rpm,s.boost,s.soc),ov=-driveEngine(car,0,s.rpm,s.boost,s.soc);
  let thr=k>0?(F/k+ov)/Math.max(1,wot+ov):0,brk=0;
  if(thr<0){brk=Math.min(1,-(F+ov*k)/car.brakeF);thr=0;}
  return {steer:delta/car.steerLock,throttle:Math.min(1,thr),brake:brk,road:{sinT:p0.grade,kv:p0.kv}};
}
// Advance s by dt (s) under u = {steer -1..1 (left positive), throttle 0..1, brake 0..1, clutch 0..1 or null for an
// automatic clutch, gear 1.. or null for automatic shifts, road {sinT: the grade along the car, positive uphill; kv: the
// road's vertical curvature along it, 1/m, negative over a crest; z and grip: the height (m) and the grip under each
// wheel, four of each, as driveRoadAt gives them} or nothing for a flat road}. Returns s, with what happened in it for the instruments.
function stepCar(car,s,u,dt){
  const H=0.001,n=Math.max(1,Math.ceil(dt/H)),h=dt/n,g=DRIVE_G,L=car.a+car.b;
  const xw=[car.a,car.a,-car.b,-car.b],yw=[car.tF/2,-car.tF/2,car.tR/2,-car.tR/2];
  const drv=car.drive==='awd'?[1,1,1,1]:car.drive==='fwd'?[1,1,0,0]:[0,0,1,1],nd=drv[0]+drv[1]+drv[2]+drv[3];
  // the share of the drive torque each wheel gets: equal, unless a centre differential splits it unequally (build 320)
  const CD=nd===4&&car.centre&&car.centre.type!=='lock'?car.centre:null,sg=CD?[CD.f/2,CD.f/2,(1-CD.f)/2,(1-CD.f)/2]:null;
  const wMean=()=>{let a=0;if(sg){for(let i=0;i<4;i++)a+=sg[i]*s.w[i];return a;}for(let i=0;i<4;i++)if(drv[i])a+=s.w[i];return a/nd;};
  const steer=Math.max(-1,Math.min(1,u.steer||0)),brake=Math.max(0,Math.min(1,u.brake||0)),hb=Math.max(0,Math.min(1,u.handbrake||0));
  let thr=Math.max(0,Math.min(1,u.throttle||0));
  const rd=u.road||{},sinT=rd.sinT||0,cosT=Math.sqrt(Math.max(0,1-sinT*sinT)),kv=rd.kv||0,zr=rd.z,gr=rd.grip,sl=rd.soil,W0F=car.m*g*car.b/L/2,W0R=car.m*g*car.a/L/2;
  const sRate=(steer*car.steerLock-(s.delta||0))/dt;   // the hand wheel's rate this call, for the friction (DRIVE_ASSIST)
  for(let k=0;k<n;k++){
    const v=Math.hypot(s.vx,s.vy),delta=steer*car.steerLock;
    // ---- gearbox
    const top=car.ratios.length;
    if(s.shiftT>0){s.shiftT-=h;
      // with an automatic clutch the driver matches the revs for the gear coming (a blip going down), so the clutch
      // takes up without a jolt through the driven tyres
      if(s.shiftT<=0&&u.clutch==null&&!car.ev&&s.gear>0)s.we=Math.max(car.idle*Math.PI/30,wMean()*car.ratios[s.gear-1]*car.fd);}
    if(u.gear!=null){const gq=Math.max(0,Math.min(top,u.gear|0));if(gq!==s.gear){s.gear=gq;s.shiftT=car.shiftTime;}}
    else if(!car.ev&&s.shiftT<=0&&s.gear>0){
      const rpmNow=wMean()*car.ratios[s.gear-1]*car.fd*30/Math.PI;      // the speed the wheels give the engine in this gear
      if(rpmNow>0.97*car.redline&&s.gear<top){s.gear++;s.shiftT=car.shiftTime;}
      else if(s.gear>1&&rpmNow<0.42*car.redline&&rpmNow*car.ratios[s.gear-2]/car.ratios[s.gear-1]<0.85*car.redline&&thr<0.99){s.gear--;s.shiftT=car.shiftTime;}
      else if(s.gear>1&&rpmNow<Math.max(car.idle*1.15,0.22*car.redline)){s.gear--;s.shiftT=car.shiftTime;}
    }
    const ratio=s.gear>0?car.ratios[Math.min(top,s.gear)-1]*car.fd:0;
    // ---- loads
    // the road under the car: on a grade the weight presses with its cosine, and over a crest (kv < 0) or through a
    // dip (kv > 0) the car's own speed adds v^2 kv, as the lap has it. With nothing left the car is in the air.
    const gz=Math.max(0,g*cosT+s.vx*s.vx*kv);
    const down=0.5*DRIVE_RHO*car.clA*v*v;
    // each tyre's load is its own deflection, between the road and its wheel (THE WHEELS)
    if(!s.zu){s.zu=[0,0,0,0];s.zuV=[0,0,0,0];s.heave=0;s.heaveV=0;s.rr=[0,0];}
    const Fz=s.Fz;
    for(let i=0;i<4;i++)Fz[i]=Math.max(0,(i<2?W0F:W0R)+(i<2?car.ktF:car.ktR)*((zr?zr[i]||0:0)-s.zu[i]));
    // ---- tyres
    let FX=0,FY=0,MZ=0,MK=0;const dF=[0,0,0,0],Fl=[0,0,0,0];
    if(!s.toe){s.toe=[0,0,0,0];s.Fyw=[0,0,0,0];}
    for(let i=0;i<4;i++){
      const front=i<2,vxw=s.vx-s.yaw*yw[i],vyw=s.vy+s.yaw*xw[i];
      // the axle's mean travel on the body (heave and pitch), and the wheel's side, right +1 (THE CAMBER, THE TOE)
      const q0=front?0:2,ind=front?car.indF!==false:car.indR!==false,sd=i%2?1:-1,tw=front?car.tF:car.tR;
      const cm=ind?(s.zu[q0]+s.zu[q0+1])/2-s.heave-s.pitch*xw[i]:0;
      // the toe (THE TOE): out of the turn at the front, into it at the rear, for understeer figures
      const tq=car.rsF==null?0:front?-car.rsF*(s.rr[0]+sd*2*cm/tw)-car.csF*s.Fyw[i]:car.rsR*(s.rr[1]+sd*2*cm/tw)+car.csR*s.Fyw[i];s.toe[i]=tq;
      const dw=(front?delta:0)+tq,cw=Math.cos(dw),sw=Math.sin(dw);
      const vl=vxw*cw+vyw*sw,vt=-vxw*sw+vyw*cw,den=Math.max(Math.abs(vl),3);
      const kap=(s.w[i]*car.r-vl)/den,alp=-Math.atan2(vt,Math.max(Math.abs(vl),0.5));
      s.al[i]+=(alp-s.al[i])*Math.min(1,Math.abs(vl)*h/car.relax);          // the side force builds over the relaxation length
      // the wheel's lean to the left: static camber, its top towards the car's middle, and the roll less what is recovered
      const ah=drivePatch(car.r,front?car.ktF:car.ktR,Fz[i]);let tg=0;
      if(car.camF!=null){const gam=(i%2?-1:1)*(front?car.camF:car.camR)-s.roll+(front?car.recF:car.recR)*((front?s.rr[0]:s.rr[1])+sd*2*cm/tw);
        if(!s.cg){s.cg=[0,0,0,0];s.camber=[0,0,0,0];}s.camber[i]=gam;
        tg=s.cg[i]+=(ah/(3*car.r)*Math.sin(gam)-s.cg[i])*Math.min(1,Math.abs(vl)*h/car.relax);}   // its thrust builds as the slip does
      const T=driveTyre(car,Fz[i],kap,s.al[i],front,tg,gr?gr[i]:1);
      Fl[i]=T[0];dF[i]=T[3]*car.r/den;s.kappa[i]=kap;s.alpha[i]=s.al[i];s.Fyw[i]=T[1];
      const fx=T[0]*cw-T[1]*sw,fy=T[0]*sw+T[1]*cw;
      s.Fx[i]=fx;s.Fy[i]=fy;FX+=fx;FY+=fy;MZ+=xw[i]*fy-yw[i]*fx;
      if(front&&car.ktF){const q=T[2];   // the steering torque: see DRIVE_CASTER
        MK+=-T[1]*((q<1?ah*(1-q)*(1-q)*(1-q)/(3-3*q+q*q):0)+car.casterTrail)+sd*T[0]*car.scrub;}
    }
    s.steerTorque=MK/car.steerRatio;
    s.handTorque=driveHandTorque(-s.steerTorque,v,sRate);   // see DRIVE_ASSIST
    // ---- engine, clutch, driveline
    const wd=wMean();
    // How far the driven tyres are past their peak, as a rate for whoever is holding them there (the ECU's traction
    // control on the throttle, or the driver's clutch foot pulling away): zero at the peak, closing fast beyond it.
    let worst=0;for(let i=0;i<4;i++)if(drv[i]||(i<2&&car.el&&car.el.front))worst=Math.max(worst,s.kappa[i]);
    const hold=Math.max(-30,Math.min(8,12*(1-worst/car.slipOpt)));
    const A=car.aids,holdTc=Math.max(-30,Math.min(8,A.tcGain*(1-worst/(car.slipOpt*A.tcSlip))));
    const pulling=!car.ev&&u.clutch==null&&s.gear===1&&s.shiftT<=0&&s.we-wd*car.ratios[0]*car.fd>1;   // the clutch is still slipping from rest
    if(car.tc&&!pulling){s.tcF=Math.max(0.05,Math.min(1,s.tcF+holdTc*h));thr*=s.tcF;}else s.tcF=1;
    // ---- stability control: one wheel's brake for the yaw moment the car is short of or has too much of (DRIVE_AIDS)
    const eT=s.esp;eT[0]=eT[1]=eT[2]=eT[3]=0;
    if(car.esp){let M=0;
      if(s.vx>A.espVmin){
        // the grip is the tyres' own on what is under them or, where the car is already turning harder (downforce, a
        // banked dip), what it has shown. On a lower grip the brush tyre peaks at a smaller angle, tan by the grip.
        const gF=gr?(gr[0]+gr[1])/2:1,gB=gr?(gr[2]+gr[3])/2:1,pkF=gF<1?Math.atan(gF*Math.tan(car.pkF)):car.pkF,pkB=gB<1?Math.atan(gB*Math.tan(A.espBeta)):A.espBeta;
        const lim=Math.max(car.mu*gz*(gF+gB)/2,Math.abs(s.ayF))/s.vx,ref=Math.max(-lim,Math.min(lim,s.vx*delta/(L*Math.max(0.1,1+car.Kus*s.vx*s.vx))));
        // too little yaw counts only once the front tyres are past their peak, where more lock does nothing
        const sg=Math.sign(ref),ex=(ref-s.yaw)*sg-A.espBand;
        if(ex>0&&Math.abs(s.alpha[0]+s.alpha[1])/2>pkF)M+=sg*car.Izz*ex/A.espTau;
        // too much yaw: more than the reference as the car itself would follow it, lagged by the single-track model's
        // equivalent delay, tau = B/C - m v a/(Cr L) (Abe, Vehicle Handling Dynamics, ch. 3)
        const v=s.vx,Cf=car.CaF,Cr=car.CaR,B=car.m*(car.a*car.a*Cf+car.b*car.b*Cr)+car.Izz*(Cf+Cr),
          C=Cf*Cr*L*L/v*Math.max(0.1,1+car.Kus*v*v),tau=Math.max(h,B/C-car.m*v*car.a/(Cr*L));
        s.yawRef+=(ref-s.yawRef)*Math.min(1,h/tau);
        const sy=Math.sign(s.yaw),ox=(s.yaw-s.yawRef)*sy-A.espBand;
        // the car turning faster than asked: a moment against it, once the rear tyres are past their peak (espBeta),
        // where they hold no more
        s.espOver=ox>0&&Math.abs(s.alpha[2]+s.alpha[3])/2>pkB;
        if(s.espOver)M-=sy*car.Izz*ox/A.espTau;
      }else{s.yawRef=s.yaw;s.espOver=false;}
      if(M!==0){const fr=M*s.yaw<0,q=(fr?0:2)+(M>0?0:1);                   // against the yaw: an outer front wheel; with it: an inner rear
        eT[q]=Math.abs(M)/((fr?car.tF:car.tR)/2)*car.r;}
      s.espF=Math.max(0,Math.min(1,s.espF+(M!==0?-1:1)*h/A.espTau));
      if(A.espCut)thr*=s.espF;
    }else s.espF=1;
    // a P2 hybrid's engine stops and starts (build 288)
    const p2=car.el&&car.el.stop&&!car.ev;
    if(p2)driveStartStop(car,s,Math.max(0,Math.min(1,u.throttle||0)),Math.max(0,wd)*ratio*30/Math.PI,v,h);
    const rpm=s.we*30/Math.PI;
    // An engine turning too slowly to fire stalls: then it is only its own drag, until the starter (u.starter) or
    // the wheels through the clutch (a bump start) turn it fast enough again.
    if(!car.ev&&s.eng){if(s.firing&&rpm<0.8*car.fireRpm)s.firing=false;
      else if(!s.firing){s.turns=rpm>=car.fireRpm?(s.turns||0)+rpm/60*h:0;if(s.turns>=car.fireTurns){s.firing=true;s.turns=0;}}}   // one whole cycle to draw and compress a charge
    // the shaft sees the throttle; through a shift a spark-cut gearbox holds it open and a manual's driver lifts to
    // 0.35 (both as the lap has them); a stalled engine pumps next to nothing
    if(car.turbo)driveShaft(car.turbo,s,rpm,!s.firing||!s.eng?0:s.shiftT>0&&!car.turbo.flatShift?Math.min(thr,0.35):thr,h);
    let Te=s.firing||car.ev?driveEngine(car,s.shiftT>0?0:thr,rpm,s.boost,s.soc):-(car.ov[0]||0)*Math.tanh(s.we/5)+(u.starter?car.starterT0*Math.max(0,1-rpm/car.starterFree):0);   // the driver lifts for a shift
    let Tw=0;                                                              // torque at the driven wheels, all of them (Nm)
    // a front axle motor: its force by the front wheels' speed, by the pedal and by what the charge allows
    let Ff=0,vf=0;
    if(car.el&&car.el.front){const F=car.el.front.F;vf=Math.max(0,(s.w[0]+s.w[1])/2*car.r);const q=vf/0.5,a=Math.min(F.length-2,Math.floor(q));
      const full=F[a]+(F[a+1]-F[a])*(q-a),E=car.el.front,NT=E.loss.length/F.length;
      Ff=thr*driveShares(car.el,s.soc)[0]*drivePack(car.el,s.soc,full*vf/E.eff,E.loss[a*NT+NT-1],E.share)*full;}
    if(car.ev){const rm=Math.max(0,wd)*ratio*30/Math.PI;Tw=driveEngine(car,thr,rm,null,s.soc)*ratio*car.eff;s.we=Math.abs(wd)*ratio;
      if(car.el)driveCharge(car,s,thr,rm,Ff,vf,h);}
    else if(!s.eng){                                                       // the engine stopped, its clutch open
      const rm=Math.max(0,wd)*ratio*30/Math.PI,T=ratio===0||s.shiftT>0?0:driveMotorOnly(car,thr,rm,s.soc);
      s.we=Math.abs(wd)*ratio;s.clF=1;s.pull=false;Tw=T*ratio*car.eff;
      driveCharge(car,s,thr,rm,Ff,vf,h,T);}
    else{
      // The clutch. A pedal if the driver gives one; otherwise a driver's two feet pulling away: the left feeds the
      // clutch in no faster than the tyres can take, the right holds the engine at the speed the pedal asks (idle off
      // it, the launch speed flat out) until the wheels have caught up and the clutch locks.
      const auto=u.clutch==null,slip=s.we-wd*ratio,pedal=Math.max(0,Math.min(1,u.throttle||0));
      let cap=ratio===0||s.shiftT>0?0:car.clutchCap*(auto?1:1-Math.max(0,Math.min(1,u.clutch)));
      if(auto&&cap>0&&slip>1&&(s.gear===1||wd*ratio<car.idle*Math.PI/30)){
        const wT=(car.idle+(s.gear===1?pedal*(car.launchRpm-car.idle):0))*Math.PI/30,avail=Math.max(0,driveEngine(car,thr,rpm,s.boost,s.soc));
        if(!s.pull){s.pull=true;s.clF=0.1;}                                   // the bite point, then in
        s.clF=Math.max(0.05,Math.min(1,s.clF+hold*h));
        cap*=s.clF;
        if(s.we<wT)cap=Math.min(cap,Math.max(0,avail-4*(wT-s.we)));        // below it: let the engine come back up
        else Te=Math.min(Te,cap+4*(wT-s.we));            // above it: no more fuel than holds it there
      }else{s.clF=1;s.pull=false;}
      // Locked, the clutch passes exactly the torque that keeps the engine and the wheels turning together (the
      // torque that brings their slip to nothing in this step, from each side's own acceleration: Karnopp's stick
      // condition); it slips when that is more than it can hold, and then passes what it can hold.
      let Id=0,aW=0;for(let i=0;i<4;i++)if(drv[i]){const Iq=car.Iw+h*car.r*dF[i];Id+=Iq;aW-=(Fl[i]*car.r+driveRollF(car,Fz[i],sl&&sl[i])*car.r*Math.tanh(s.w[i]*car.r/0.5))/Iq;}
      aW/=nd;
      // under an unequal split, the carrier turns at the shares' weighted mean of the wheels, sum sg w (Willis), and
      // each wheel takes its share of the torque, so the driveline's own inertia is 1 / sum(sg^2 / I)
      if(sg){aW=0;let iI=0;for(let i=0;i<4;i++){const Iq=car.Iw+h*car.r*dF[i];aW-=sg[i]*(Fl[i]*car.r+driveRollF(car,Fz[i],sl&&sl[i])*car.r*Math.tanh(s.w[i]*car.r/0.5))/Iq;iI+=sg[i]*sg[i]/Iq;}Id=1/iI;}
      let Tcl=(slip/h+Te/car.Ie-ratio*aW)/(1/car.Ie+ratio*ratio*car.eff/Id);
      Tcl=Math.max(-cap,Math.min(cap,Tcl));
      s.we=Math.max(0,s.we+h*(Te-Tcl)/car.Ie);
      Tw=Tcl*ratio*car.eff;
      if(car.el)driveCharge(car,s,s.firing&&s.shiftT<=0?thr:0,rpm,Ff,vf,h);
    }
    // Regeneration is braking at the driven wheels alone, so the anti-lock system that eases a locking wheel's brake
    // eases the motor's braking by as much (every electric car cuts regeneration when its ABS works).
    if(car.el&&car.abs&&Tw<0){let m=1;for(let i=0;i<4;i++)if(drv[i])m=Math.min(m,s.abs[i]);Tw*=m;}
    // and the stability control cuts it while it catches a spin (Bosch's drag-torque control, MSR: Bosch Automotive
    // Handbook, "Electronic stability program"), so the driven rear tyres keep their side grip
    if(car.el&&car.esp&&s.espOver&&Tw<0)Tw=0;
    // ---- wheels
    const Tbd=[0,0,0,0];                                                   // each wheel's torque reacting on the body (THE LINKS)
    for(let ax=0;ax<2;ax++){
      const i=ax*2,j=i+1,driven=drv[i],Td=driven?(sg?Tw*sg[i]:Tw/nd):0;
      let Ti=Td+(ax===0?Ff*car.r/2:0),Tj=Ti;
      if(!(ax===0?car.liveF:car.liveR))Tbd[i]=Tbd[j]=Td;
      const share=ax===0?car.brakeFront:1-car.brakeFront;
      for(const [q,Tq] of [[i,Ti],[j,Tj]]){
        if(car.abs){const vl=Math.abs(s.vx);s.abs[q]=Math.max(0.05,Math.min(1,s.abs[q]+((s.kappa[q]<-car.slipOpt*car.aids.absSlip[ax]&&vl>2)?-car.aids.absRel:car.aids.absApp)*h));}
        const cap=car.brakeF*share/2*car.r;let Tb=Math.min(cap,brake*cap+s.esp[q])*(car.abs?s.abs[q]:1);   // the pedal's and the stability control's
        if(hb>0&&ax===1)Tb+=hb*car.hbCap/2*car.r;                         // the lever's, which the ABS does not ease
        const roll=driveRollF(car,Fz[q],sl&&sl[q])*car.r*Math.tanh(s.w[q]*car.r/0.5);
        const Iq=car.Iw+h*car.r*dF[q];                                      // the tyre's own stiffness taken implicitly
        let wq=s.w[q]+h*(Tq-Fl[q]*car.r-roll)/Iq;
        if(ax===0?car.inbF:car.inbR)Tbd[q]-=Math.sign(wq)*Tb;
        const db=h*Tb/Iq;                                                  // the brake can stop a wheel, never turn it back
        if(Math.abs(wq)<=db)wq=0;else wq-=Math.sign(wq)*db;
        s.w[q]=wq;
      }
    }
    // The axle's differential (build 318), after the wheels have moved, as the centre coupling below: the torque that
    // would bring the two wheels to one speed in this step (Karnopp's stick condition), taken from the faster wheel and
    // given to the slower. A spool always passes it; a friction pack passes it up to its capacity, preload + lock x the
    // axle's input torque (the ramp's statics, the same on drive and coast: a 2-way), and slides at that; a viscous
    // coupling passes c x dw, taken implicitly so that any c is stable. See diffCoupling.
    if(car.diff.type!=='open')for(let ax=0;ax<2;ax++){const i=ax*2,j=i+1;if(!drv[i])continue;
      const Ii=car.Iw+h*car.r*dF[i],Ij=car.Iw+h*car.r*dF[j],dw=s.w[i]-s.w[j],k=h*(1/Ii+1/Ij),D=car.diff;
      let Tc=dw/k;
      if(D.type==='fric'){const cap=D.pre+D.L*Math.abs(Tw)*(sg?sg[i]+sg[j]:2/nd);Tc=Math.max(-cap,Math.min(cap,Tc));}
      else if(D.type==='visc')Tc=D.c*dw/(1+D.c*k);
      s.w[i]-=h*Tc/Ii;s.w[j]+=h*Tc/Ij;}
    // All-wheel drive: the centre coupling (build 320, by type: centreCoupling). 'lock', an electronically controlled
    // clutch: the two axles turn together, the clutch closed on the first slip (no maker publishes its control map, so
    // this is PROBABLE), the torque going to the axle that can use it; open under the brakes, as these systems are, so
    // the anti-lock works on each axle alone; where a limit is published (build 403) the secondary axle gets at most
    // that. The others are mechanical and work on the brakes too: an open centre
    // passes nothing between the axles beyond its split; a Torsen holds them up to lock x the input torque; a viscous
    // coupling passes c x the difference of the axles' mean speeds. Each as the axle's differential above: Karnopp's
    // stick torque, the one that leaves the two axles' mean speeds equal after this step, taken from the faster.
    if(car.centre&&nd===4&&(CD||brake===0)&&(!CD||CD.type!=='open')){let inv=0;for(let q=0;q<4;q++)inv+=1/(car.Iw+h*car.r*dF[q]);
      let Tc=2*((s.w[0]+s.w[1])-(s.w[2]+s.w[3]))/(h*inv);
      const C=car.centre;if(!CD&&C.L>0){   // the limit: the secondary axle (front if f is 0) takes between nothing and it
        const b=C.L*Tw,lo=Math.min(0,b),hi=Math.max(0,b);
        Tc=C.f===0?Math.max(Tw/2-hi,Math.min(Tw/2-lo,Tc)):Math.max(lo-Tw/2,Math.min(hi-Tw/2,Tc));}
      if(CD&&CD.type==='fric'){const cap=(CD.pre||0)+CD.L*Math.abs(Tw);Tc=Math.max(-cap,Math.min(cap,Tc));}
      else if(CD&&CD.type==='visc'){const k=h*inv/4;Tc=CD.c*(Tc*k)/(1+CD.c*k);}
      for(let q=0;q<4;q++)s.w[q]+=(q<2?-1:1)*h*Tc/2/(car.Iw+h*car.r*dF[q]);}
    // ---- body
    const drag=0.5*DRIVE_RHO*car.cdA*v*s.vx,ax=(FX-drag)/car.m-g*sinT,ay=FY/car.m;
    s.vx+=h*(ax+s.vy*s.yaw);s.vy+=h*(ay-s.vx*s.yaw);s.yaw+=h*MZ/car.Izz;
    if(brake>0&&thr===0&&Math.abs(s.vx)<0.05&&Math.abs(s.vy)<0.05){s.vx=0;s.vy=0;s.yaw=0;}   // held on the brakes
    s.psi+=h*s.yaw;const c=Math.cos(s.psi),sn=Math.sin(s.psi);
    s.x+=h*(s.vx*c-s.vy*sn);s.y+=h*(s.vx*sn+s.vy*c);
    const kL=Math.min(1,h/car.tauLoad);s.axF+=(ax-s.axF)*kL;s.ayF+=(ay-s.ayF)*kL;
    // the wheels, and the body on them (THE WHEELS). c: a corner's travel, compressed positive.
    const dg=gz-g;let SS=0,MP=0,MR=0;
    for(let q=0;q<2;q++){const i=q*2,j=i+1,f=q===0,t=f?car.tF:car.tR,ks=f?car.ksF:car.ksR,cs=f?car.cdF:car.cdR,mu=f?car.unsF:car.unsR,W0=f?W0F:W0R;
      const zb=s.heave+s.pitch*xw[i],zbV=s.heaveV+s.pitchV*xw[i],rl=s.roll*t/2,rlV=s.rollV*t/2;
      const cL=s.zu[i]-zb-rl,cR=s.zu[j]-zb+rl,e=ks*(cL+cR)/2,pr=(cR-cL)/t,bar=(f?car.KaF:car.KaR)*pr/t,D=car.m*ay*(f?car.rcGF:car.rcGR)/t;
      // each wheel: its spring, bar, bump rubber and damper (bound or rebound by its direction, taken implicitly in
      // the wheel's own speed on the body), then its two stops; what the corner passes to the body is what changed
      // the wheel's momentum other than the tyre, the links and its weight
      const up=f?car.bumpF:car.bumpR,dn=f?car.droopF:car.droopR,top=up+DRIVE_BUMP_RUBBER,cb=2*cs/(1+DAMPER_RB),cr=cb*DAMPER_RB;
      const wheel=(w,cc,vb,Fs,Fl)=>{const x=Math.min(cc-up,0.95*DRIVE_BUMP_RUBBER),rub=x>0?ks*x/(1-x/DRIVE_BUMP_RUBBER):0;
        const A=s.zuV[w]+h*(Fz[w]-W0-Fs-rub+Fl-mu*dg)/mu-vb;               // the wheel's speed on the body, undamped
        let vr=A/(1+h*(A>0?cb:cr)/mu);                                      // the damper's sign is A's, whichever c
        const cn=cc+h*vr;if(cn>top)vr=(top-cc)/h;else if(cn<-dn)vr=(-dn-cc)/h;
        const vw=vb+vr,S=Fz[w]-W0+Fl-mu*dg-mu*(vw-s.zuV[w])/h;s.zuV[w]=vw;s.zu[w]+=h*vw;return S;};
      const sv=f?car.svF:car.svR,sx=f?1:-1,JL=sx*(Fl[i]*sv[0]-Tbd[i])/sv[1],JR=sx*(Fl[j]*sv[0]-Tbd[j])/sv[1];   // THE LINKS
      const SL=wheel(i,cL,zbV+rlV,e-bar,D+JL)-JL,SR=wheel(j,cR,zbV-rlV,e+bar,-D+JR)-JR;
      SS+=SL+SR;MP+=xw[i]*(SL+SR);MR+=(SR-SL)*t/2;s.rr[q]=pr;}
    s.heaveV+=h*(SS-car.mS*dg-down)/car.mS;s.heave+=h*s.heaveV;
    s.rollV+=h*(car.m*ay*car.rollArm-MR)/car.rollI;s.roll+=h*s.rollV;
    s.pitchV+=h*(car.m*ax*car.h+MP-down*(car.aeroBal*car.a-(1-car.aeroBal)*car.b))/car.pitchI;s.pitch+=h*s.pitchV;
    s.ax=ax;s.ay=ay;s.delta=delta;s.t+=h;
  }
  s.rpm=s.we*30/Math.PI;s.speed=Math.hypot(s.vx,s.vy);
  return s;
}
