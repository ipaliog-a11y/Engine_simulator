// ---- PARTS: the part designer (build 205; the intake manifold, build 206) ----
// A part is a physical thing with dimensions, designed on its own page, saved to a library in this browser and
// fitted on the ENGINE tab. The first kind was the EXHAUST. It needs no new physics: the three factory exhausts
// (EXHAUST in fuels-engine-types.js) were always only three sets of dimensions read by the breathing model
// (deriveGasDynamics, exhaustWaveP, scavengeGain, backPressureBar) and the sound (exhaustSound). A designed exhaust
// gives those same models its own dimensions instead:
//   construction   the header's spread in path length (sigma): a cast log manifold, an off-the-shelf tubular header,
//                  an equal-length header built on a jig; the same three spreads the factory exhausts carry;
//   primaries      diameter and length, in mm; on a turbo engine the length is set by packaging (as before) and
//                  the length here is not used;
//   system         the pipes after the collector: how many, their diameter, their length;
//   silencer       what it does to the sound (SILENCER in sound.js). Its own back-pressure is not modelled yet: a
//                  factory system's restriction is in its pipe (sysV), and so is a designed one's.
// The INTAKE MANIFOLD (build 206) is its runners, the other half of the breathing model, read by the integrated intake
// stroke (intakeFill, buildFillTable) and its tuning (intakeRamGain, helmholtzHz):
//   runners        length, plenum to head (the port in the head is added, as on the factory manifolds), and
//                  diameter; the factory runner is sized to the port behind it (THROAT_RATIO), a designed one need not;
//   variable       a second, shorter length opened by a flap, the fill table taking whichever fills better (a DISA,
//                  a VarioRam), as the factory VARIABLE manifold does with 460 and 150 mm.
// Not in it yet: the plenum's volume (the model takes the plenum as holding steady pressure) and the throttle.
// The CAMSHAFT (build 249) is the valve events the breathing model already reads from the factory cams (CAM):
//   duration       seat to seat, crank degrees; the exhaust lobe is taken as the same (overlapDeg is symmetric);
//   lift           at the valve, mm (a factory cam's is a share of the valve, lOverD);
//   separation     the lobe separation angle: with the duration it sets the overlap and the intake's closing;
//   lobe profile   how hard the nose is ground (accel, against simple harmonic motion): valve float;
//   phaser range   how far a VVT phaser may advance it (45 degrees; an Atkinson cam's 15).
// The INTERCOOLER (build 255) is a core and its pipes, read by the charge path (deriveCharge, icEffAt):
//   face, depth    the core's width (the charge's path), height and depth, mm; with IC_SIGMA they set the charge
//                  volume to fill (spool) and the charge side's flow area;
//   fins           the cooling side's fins per inch: its surface;
//   pipe           metres of ducting, compressor to throttle, at the compressor outlet's bore.
// Its effectiveness comes from its fins on both sides (icEps), and its pressure drop is what the compressor has to make
// up on top of the boost (icDpBar), for every core, the factory two included (build 256).
// What the factory cams still carry as fitted grades (CAM.ampMul, loWiden, idleRpm: the airflow estimates, the idle) a
// designed cam takes from the factory cam its duration and separation are nearest (camClass). Retiring them is the next
// build (plans/parts-design-space.md).
// The CYLINDER HEAD (build 283) is the valve and port the valvetrain model reads (deriveValvetrain), and its springs:
//   intake valve   head diameter, mm, in place of the packing ratio of the head's layout (VALVE_PACK.dOverB); the
//                  number of valves stays the engine's;
//   exhaust valve  head diameter, mm (build 286), in place of 0.83 of the intake (EV_RATIO): the exhaust port's bore,
//                  so the heat the gas leaves in the port (portLossShare). A part saved without one has 0.83 of its intake;
//   port throat    as a share of the valve, in place of THROAT_RATIO's 0.85: the flow area at full lift, Taylor's
//                  plateau of the inlet flow coefficient (inletCi) and the factory runner matched to the port;
//   springs        seat load (N) and rate (N/mm), in place of the maker's spring sized for the factory cam and the
//                  redline (springRpm), times the STOCK, PERFORMANCE or RACE step. They are what holds the valve on
//                  the cam: valve float (valveFloatRpm).
// A factory head written as a part is the engine's own: its valve, 0.85, and the springs it is fitted with, as sized.
// Not in it: whether the valves physically fit the bore (a designed valve may pass the factory packing; the preview
// says so), the spring's travel to coil bind, and the springs' load on the cam's friction (the friction model, Patton
// and Sandoval, has no spring-load term), and the exhaust valve's own flow: the blowdown and the pumping loop do not
// read its size. A factory head still takes 0.85, 0.83 and the packing ratio (plans/fitted-register.json) until each
// real car's own valve sizes are sourced.
// The TURBOCHARGER (build 288) is the wheels and the housing the shaft model reads (deriveGasDynamics, steadyBoost,
// advanceShaft): the compressor's exducer (its choke flow, map, top speed and the shaft's inertia), the turbine wheel
// (its tip speed and the radius the housing's throat sits at, in place of TURB_WHEEL's 0.90 of the exducer) and the
// housing's A/R (the throat, in place of the frame's TIGHT / STOCK / LOOSE step). How many turbos and how they are
// piped, the VGT, the boost and the wastegate stay on the ENGINE tab. A factory turbo written as a part is the engine's own.
// Not in it: the shaft's inertia still scales with the compressor alone, and twin, sequential and compound layouts keep
// TURBO_CONFIG's flow multiplier (the next build).
// A build carries the full part (engine.exhaustPart, engine.intakePart), so a saved build, a file and a share link work in another
// browser that never saw the part; loading such a build adds the part to that browser's library.

const EXHAUST_BUILD={
  cast:   {label:'CAST MANIFOLD',      sigma:EXHAUST.stock.sigma,cls:'stock',cost:0},
  tubular:{label:'TUBULAR HEADER',     sigma:EXHAUST.sport.sigma,cls:'sport',cost:550},
  equal:  {label:'EQUAL-LENGTH HEADER',sigma:EXHAUST.race.sigma, cls:'race', cost:1400}
};
// the silencer, by the factory system whose silencer it is (SILENCER and GAS_SILENCER_HZ in sound.js)
const EXHAUST_SILENCER={
  chambered: {label:'CHAMBERED',              cls:'stock'},
  absorptive:{label:'STRAIGHT-THROUGH',       cls:'sport'},
  straight:  {label:'NONE (STRAIGHT PIPE)',   cls:'race'}
};
// What a part's numbers may be. The pipe diameter is the range the factory sizing clamps to (deriveGasDynamics);
// a primary is 200-1000 mm, past either end of the 350-900 mm a fabricator can route round an engine bay. A runner
// runs from a 40 mm stub (an ITB's trumpet) to 800 mm, past the factory LONG's 460.
// a cam's lobe: the three grinds the factory cams use (CAM.accel)
const CAM_PROFILE={
  gentle:{label:'GENTLE (OEM)',accel:0.80},
  street:{label:'STREET',      accel:0.88},
  race:  {label:'RACE',        accel:0.98}
};
// A cam runs from 180 degrees (shorter than any factory cam's 220) to 320 (past a race cam's 284); lift 4-16 mm at the
// valve; the separation from 98 to 130 degrees, about the 106-125 the factory cams span; a phaser to 60 degrees.
// A head's intake valve 15-75 mm (a 50 cc single's to a big-bore diesel's); its throat 0.75 of the valve (a restrictive
// production port) to 0.92 (a fully ported race head: the 45 degree seat needs the rest); springs 100-1500 N on the seat
// and 10-200 N/mm, past the RACE step on the biggest factory valve (sized for a Hellcat's redline, ~1180 N and 130 N/mm).
const PART_LIMITS={span_mm:[600,2200],chord_mm:[80,600],angle_deg:[0,25],camber_pct:[0,12],plate_mm:[0,400],valveD_mm:[15,75],exValveD_mm:[12,65],throat:[0.75,0.92],seat_N:[100,1500],rate_Nmm:[10,200],dur:[180,320],lift_mm:[4,16],lsa:[98,130],vvt_deg:[0,60],primD_mm:[25,76],primL_mm:[200,1000],pipes:[1,2],sysD_mm:[30,110],sysL_m:[0.8,4.5],
  runnerL_mm:[40,800],runnerD_mm:[20,80],shortL_mm:[40,400],area_m2:[0.02,3],inletD_mm:[30,160],
  w:[150,900],h:[80,800],d:[30,120],fpi:[8,30],pipe_m:[0.3,5],
  // a turbo's compressor 30-120 mm at the exducer (a kei car's to a big diesel's), its turbine 25-130 mm, a housing
  // A/R of 0.25-1.6 (on this model's convention, setTurbineAR: the frames' housings run 0.35-1.06)
  compD_mm:[30,120],turbD_mm:[25,130],ar:[0.25,1.6]};

// ---- the air filter (build 210) ----
// What a filter restricts is its pressure drop at the flow through it, and the charge is that much thinner (computeVE).
// Two terms, each from a measured or a textbook law:
//   the media     Darcy's law: the drop goes with the face velocity, the flow over the media's (pleated) area. How much
//                 a medium passes is its air permeability, measured at 200 Pa (EN ISO 9237): Dziubak (Materials 13, 3498,
//                 2020) measured car intake papers at 540-685 m3/m2h, the lower one with a nanofibre layer; oiled cotton
//                 is its makers' claim, ~50% more than paper, there being no measured figure;
//   the housing   a velocity head, K (rho/2) v^2, at the inlet: an airbox's snorkel, bends and box (K ~3, entry, expansion
//                 and contraction losses together), or an open element's neck (K ~0.5, a plain entry).
// The flow is the engine's at its manifold pressure, as volume at ambient density (a turbo's filter passes its boost's
// worth). On a boosted engine the drop is taken off the charge the same way, which holds where the compressor is at its
// limit and overstates it where the wastegate could make it up.
const FILTER_MEDIA={
  paper: {label:'PAPER (CELLULOSE)',perm:685/3600},
  nano:  {label:'PAPER + NANOFIBRE',perm:540/3600},
  cotton:{label:'OILED COTTON',     perm:1.5*685/3600}
};
const FILTER_HOUSING={airbox:{label:'AIRBOX',K:3.0},open:{label:'OPEN ELEMENT',K:0.5},none:{label:'NONE (STACKS)',K:0}};
const FILTER_FACE_V=0.25;   // a factory element's face velocity at full flow (m/s): sizes its media area
const AIR_RHO0=1.2;
// The engine's flow through its filter (m3/s at ambient density): its displacement at this speed, filling, and the
// manifold pressure's worth of air.
const airFlowM3s=(rpm,map,ve)=>{const e=engine;return (e.displacement_L/1000)*(rpm/60)*(e.chargesPerRev||0.5)*ve*Math.max(0.1,map);};
// The full flow a factory filter is sized to: the most the engine draws, over its range, at the boost its ECU's taper
// asks for there (the hardware's, so not the diesel governor's: a governor set or not leaves the engine below it as it
// was, test93; the torque limit is solved later, on the finished engine).
function filterQref(e){
  let best=0;
  for(let r=1000;r<=e.redline;r+=100)
    best=Math.max(best,r*(e.intake==='na'?1:1+(e.boost_bar||0)*boostTaperFrac(r)));
  return (e.displacement_L/1000)*(best/60)*(e.chargesPerRev||0.5)*0.95;
}
const filterDp=Q=>{const f=engine.filt;return f?f.a*Q+f.b*Q*Q:0;};   // Pa
// A carburettor's venturi (build 244). Until build 244 every induction system scaled the charge by a fitted ramp from
// idle to the redline (a 4-barrel −3% at the redline, a 1-barrel −16%, mechanical injection +5%, ITBs +8%). (The
// catalyst's −2 to −5% rode on the same ramp and still does, for now: see buildEngineCore.) A carburettor's restriction is its venturis, and carburettors are rated by it: the
// air they pass at a set pressure drop, 1.5 inHg (5.08 kPa) for a four-barrel (Holley's and the industry's rating;
// one- and two-barrels are rated at 3.0 inHg, the same venturi measured harder). A venturi's drop goes with the square
// of the flow. No preset gives its carburettor's rating, so it is sized by the makers' rule, CFM = CID x rpm x VE /
// 3456 at the redline with VE 0.85 (Holley), every type at the 1.5 inHg rating. Injection (single throttle, ITBs or
// mechanical) has no venturi; its throttle plates wide open are left out, as before.
const CARB_DP_REF=5080;   // Pa, 1.5 inHg
const carbDp=Q=>{const r=engine.carbQref;return r>0?CARB_DP_REF*(Q/r)*(Q/r):0;};   // Pa
function deriveCarb(){
  const e=engine,carb={carb1:1,carb2:1,carb4:1,sidedraft:1}[e.intakeSys];
  e.carbQref=carb?(e.displacement_L/1000)*(e.redline/60)*(e.chargesPerRev||0.5)*0.85:0;   // m3/s at its rating
}
// The filter's coefficients (a: Pa per m3/s, the media; b: Pa per (m3/s)^2, the housing), from a designed filter or a
// factory one sized to this engine's full flow.
function deriveFilter(){
  const e=engine,P=e.filterPart||null;
  if(P){
    const H=FILTER_HOUSING[P.housing];
    if(P.housing==='none'){e.filt={a:0,b:0};return;}
    const Ain=Math.PI/4*Math.pow(P.inletD_mm/1000,2);
    e.filt={a:200/(FILTER_MEDIA[P.media].perm*P.area_m2),b:H.K*AIR_RHO0/2/(Ain*Ain)};
    return;
  }
  const F=AIR_FILTER[e.airFilter]||AIR_FILTER.stock,Q=filterQref(e);
  if(!(F.kPa>0)||!(Q>0)){e.filt={a:0,b:0};return;}
  const dpm=200*FILTER_FACE_V/FILTER_MEDIA[F.media].perm;
  if(F.clogged){   // the stock box, its element loaded with dust: the media takes the rest
    const S=AIR_FILTER.stock,dph=S.kPa*1000-200*FILTER_FACE_V/FILTER_MEDIA[S.media].perm;
    e.filt={a:(F.kPa*1000-dph)/Q,b:dph/(Q*Q)};
  }else e.filt={a:dpm/Q,b:(F.kPa*1000-dpm)/(Q*Q)};
}
// A filter, as the factory class the rest of the app reads (sprites, sound, cost): by its housing.
const filterClass=p=>({none:'none',open:'perf',airbox:'stock'})[p.housing]||'stock';

// ---- the intercooler (build 255) ----
// IC_SIGMA: the share of a bar-and-plate core's gross volume the charge flows through (charge layers about half the
// stack, their internal fins taking ~15% of that; probable), so also the charge side's free-flow share of its h x d end.
const IC_SIGMA=0.4,IC_FIN={s:2.5,h:7,t:0.2,l:3.2};   // IC_FIN: the charge passages' offset-strip fins (see icDp)
const icGrossL=p=>p.w*p.h*p.d/1e6, icCoreL=p=>icGrossL(p)*IC_SIGMA;
// The core's effectiveness at a charge flow m (kg/s), from its dimensions (build 256; it was the factory cores' quoted
// 0.62 and 0.82, INTERCOOLER.eff). UA is the two sides in series, each a film coefficient from a measured j-factor
// over its surface with its fins' efficiency (aluminium, k 180 and 200 W/m K):
//   charge side   the offset-strip fins of IC_FIN, Manglik & Bergles' j (Exp. Thermal Fluid Sci. 10, 1995); its
//                 surface 4 V / Dh over the charge volume;
//   cooling side  louvred fins (IC_LOUVER, a typical automotive core: probable), Chang & Wang's j (Int. J. Heat Mass
//                 Transfer 40, 1997, Re_Lp 100-3000; a 75-80 mm core is deeper than the cores it was fitted to);
//                 its fins 2/Fp and walls 2/Fl per unit of the cooling layers' volume;
//   cooling air   through the face at IC_FACE_V, 11 m/s: a radiator's face velocity at freeway speed, ~25 mph (US
//                 patent 6818254's account of measured cars; probable), the same for every car (owner's decision).
// Cross-flow, both fluids unmixed (Incropera): eps = 1 - exp(NTU^0.22/Cr (exp(-Cr NTU^0.78) - 1)), on the smaller
// capacity; returned as the share of the charge's own rise it gives back.
const IC_LOUVER={Lp:1.0,th:27,Fl:8,Ll:6.4,df:0.1,Tp:16},IC_FACE_V=11,IC_PR=0.71,IC_CP=1005;
const IC_DH=(F=>4*F.s*F.h*F.l/(2*(F.s*F.l+F.h*F.l+F.t*F.h)+F.t*F.s)/1000)({s:2.5,h:7,t:0.2,l:3.2});
const finEff=(h,k,t,L)=>{const x=Math.sqrt(2*h/(k*t))*L;return x>0?Math.tanh(x)/x:1;};
function icEps(P,m){
  if(!P||!P.w||!(m>0))return 0;
  const F=IC_FIN,L=IC_LOUVER,w=P.w/1e3,h=P.h/1e3,d=P.d/1e3,muc=2.08e-5,mua=1.84e-5,rhoa=1.18,pr=Math.pow(IC_PR,-2/3);
  const G=m/(h*d*IC_SIGMA),Re=G*IC_DH/muc,al=F.s/F.h,de=F.t/F.l,ga=F.t/F.s;
  const jc=0.6522*Math.pow(Re,-0.5403)*Math.pow(al,-0.1541)*Math.pow(de,0.1499)*Math.pow(ga,-0.0678)
    *Math.pow(1+5.269e-5*Math.pow(Re,1.340)*Math.pow(al,0.504)*Math.pow(de,0.456)*Math.pow(ga,-1.055),0.1);
  const hc=jc*G*IC_CP*pr,Ac=4*w*h*d*IC_SIGMA/IC_DH,oc=1-F.h/(F.s+F.h)*(1-finEff(hc,180,F.t/1e3,F.h/2e3));
  const Fp=25.4/P.fpi,sa=(L.Fl/L.Tp)*(1-L.df/Fp),Vc=IC_FACE_V/sa,ReL=rhoa*Vc*L.Lp/1e3/mua;
  const ja=Math.pow(ReL,-0.49)*Math.pow(L.th/90,0.27)*Math.pow(Fp/L.Lp,-0.14)*Math.pow(L.Fl/L.Lp,-0.29)*Math.pow(P.d/L.Lp,-0.23)
    *Math.pow(L.Ll/L.Lp,0.68)*Math.pow(L.Tp/L.Lp,-0.28)*Math.pow(L.df/L.Lp,-0.05);
  const ha=ja*rhoa*Vc*IC_CP*pr,Aa=w*h*d*(L.Fl/L.Tp)*(2e3/Fp+2e3/L.Fl),fa=(1/Fp)/(1/Fp+1/L.Fl);
  const oa=1-fa*(1-finEff(ha,200,L.df/1e3,L.Fl/2e3));
  const UA=1/(1/(oc*hc*Ac)+1/(oa*ha*Aa)),Cc=m*IC_CP,Ca=rhoa*IC_FACE_V*w*h*IC_CP,Cmin=Math.min(Cc,Ca),Cr=Cmin/Math.max(Cc,Ca),NTU=UA/Cmin;
  return (1-Math.exp(Math.pow(NTU,0.22)/Cr*(Math.exp(-Cr*Math.pow(NTU,0.78))-1)))*Cmin/Cc;
}
// A factory core is sized for its engine (build 256, one rule for every car, as the factory air filter is): its listed
// size, or taller when the engine's full flow (at the redline at full boost) is more than that size is rated to carry.
// The rating is Garrett's: its 610 x 203 x 89 mm air-air core (703520-6010) for 600 hp, which Garrett's own airflow
// rule (lb/min = hp x AFR x BSFC / 60, AFR 12 and BSFC 0.55 in its example) puts at 0.50 kg/s through its 203 x 89 end.
const IC_RATED_FLUX=600*12*0.55/60*0.45359/60/(0.203*0.089);   // kg/s per m2 of the charge end
function icFactoryGeom(e,key){
  const F=INTERCOOLER[key];if(!F||!F.w)return null;
  const k=airFlowAt(e.redline,e.mapMax||1)/(IC_RATED_FLUX*F.h*F.d/1e6);
  return k>1?Object.assign({},F,{h:+(F.h*k).toFixed(1)}):F;
}
// The core an engine has: a designed one, or its factory core as sized for it (none for NONE).
const icGeom=e=>e.icPart||icFactoryGeom(e,INTERCOOLER[e.intercooler]?e.intercooler:'large');
// The drop in bar the compressor must make up at a charge flow and manifold pressure (build 256), the charge taken
// at 313 K, the temperature airFlowAt takes it at (the circle would not close on the live charge temperature).
function icDpBar(m,map){
  if(!(m>0)||engine.intake==='na')return 0;
  const d=icDp(engine,m,Math.max(1,map),313);return (d.core+d.pipe)/1e5;
}
const icClass=p=>icGrossL(p)<Math.sqrt(icGrossL(INTERCOOLER.small)*icGrossL(INTERCOOLER.large))?'small':'large';
// The pressure drop through the core and its pipe at a charge flow m (kg/s), pressure pBar (absolute) and mean charge
// temperature Tk. Core: the charge passages' offset-strip fins by Manglik & Bergles' correlation (Exp. Thermal Fluid
// Sci. 10, 1995) on a typical bar-and-plate passage (2.5 mm pitch, 7 mm high, 0.2 mm fin, 3.2 mm strips: probable),
// plus the tanks' contraction and expansion, Kc + Ke ~ 1.0 at sigma 0.4 (Kays & London). Pipe: Blasius, smooth tube.
const IC_KTANK=1.0;
function icDp(e,m,pBar,Tk){
  const G0=icGeom(e)||{},rho=pBar*1e5/(287*Tk),mu=1.85e-5*Math.pow(Tk/300,0.7);
  let core=0;
  if(G0.w){
    const F=IC_FIN,Dh=IC_DH;
    const al=F.s/F.h,de=F.t/F.l,ga=F.t/F.s,G=m/(G0.h*G0.d/1e6*IC_SIGMA),Re=G*Dh/mu;
    const f=9.6243*Math.pow(Re,-0.7422)*Math.pow(al,-0.1856)*Math.pow(de,0.3053)*Math.pow(ga,-0.2659)
      *Math.pow(1+7.669e-8*Math.pow(Re,4.429)*Math.pow(al,0.920)*Math.pow(de,3.767)*Math.pow(ga,0.236),0.1);
    core=(4*f*(G0.w/1000)/Dh+IC_KTANK)*G*G/(2*rho);
  }
  const D=0.72*turboFrame(e).exd,Gp=m/(Math.PI/4*D*D),Rp=Gp*D/mu,L=e.icPart?e.icPart.pipe_m:(INTERCOOLER[e.intercooler]||INTERCOOLER.large).pipe;
  return {core,pipe:0.316*Math.pow(Rp,-0.25)*L/D*Gp*Gp/(2*rho)};
}
const PARTS_KEY='pes.parts',PARTS_MAX=40;
const PART_KINDS=[
  {kind:'exhaust',label:'EXHAUST',ready:true},
  {kind:'intake', label:'INTAKE MANIFOLD',ready:true},
  {kind:'filter', label:'AIR FILTER',ready:true},
  {kind:'cam',    label:'CAMSHAFT',ready:true},
  {kind:'intercooler',label:'INTERCOOLER',ready:true},
  {kind:'head',   label:'CYLINDER HEAD',ready:true},
  {kind:'turbo',  label:'TURBOCHARGER',ready:true},
  {kind:'wing',   label:'REAR WING',ready:true},
  {kind:'cat',    label:'CATALYTIC CONVERTER',ready:false}
];
// A designed intake, as the factory class the rest of the app reads: a variable one is VARIABLE, a fixed one the
// factory length it is nearest.
function intakeClass(p){
  if(p.variable)return 'variable';
  let best='medium',d=1e9;for(const k of ['long','medium','short']){const x=Math.abs(RUNNER[k].mm-p.runnerL_mm);if(x<d){d=x;best=k;}}
  return best;
}
// A designed cam, as the factory cam the rest of the app reads (its grade, the sprite, the cost): the one whose duration
// and separation are nearest.
function camClass(p){
  let best='stock',d=1e9;
  for(const k in CAM){const c=CAM[k],x=Math.hypot(c.dur-p.dur,c.lsa-p.lsa);if(x<d){d=x;best=k;}}
  return best;
}
// A designed head, as the spring step the rest of the app reads: the one whose seat load is nearest (on a log scale).
function headClass(p){
  let best='stock',d=1e9;
  for(const k in VALVE_SPRING){const x=Math.abs(Math.log(p.seat_N/VALVE_SPRING[k].seat));if(x<d){d=x;best=k;}}
  return best;
}
// A designed turbo, as the frame the rest of the app reads (the sprite, the cost): the one whose wheel is nearest.
function turboClass(p){
  let best='medium',d=1e9;
  for(const k in TURBO){const x=Math.abs(Math.log(p.compD_mm/1000/TURBO[k].exd));if(x<d){d=x;best=k;}}
  return best;
}
// The cam as the physics reads it: the factory cam's, or a designed one's dimensions over its class's fitted grades.
function camSpec(e){
  const F=CAM[e.cam]||CAM.stock,P=e.camPart;
  if(!P)return F;
  return Object.assign({},F,{dur:P.dur,lsa:P.lsa,accel:(CAM_PROFILE[P.profile]||CAM_PROFILE.gentle).accel,lift_mm:P.lift_mm,vvtMax:P.vvt_deg});
}
// Each kind: the engine field that carries the part, the field that carries the factory class, the ENGINE tab's select.
const PART_DEF={
  exhaust:{field:'exhaustPart',cls:'exhaust',select:'edExhaust',def:'stock',valid:k=>!!EXHAUST[k],clsOf:p=>EXHAUST_BUILD[p.build].cls,
    label:k=>EXHAUST[k].label,newName:'MY EXHAUST',factory:['stock','sport','race']},
  intake: {field:'intakePart', cls:'runner', select:'edRunner', def:'medium',valid:k=>!!RUNNER[k], clsOf:intakeClass,
    label:k=>RUNNER[k].label,newName:'MY INTAKE',factory:['long','medium','short','variable']},
  filter: {field:'filterPart', cls:'airFilter', select:'edAirFilter', def:'stock',valid:k=>!!AIR_FILTER[k], clsOf:filterClass,
    label:k=>AIR_FILTER[k].label,newName:'MY AIR FILTER',factory:['none','perf','stock','restrictive']},
  cam:    {field:'camPart',    cls:'cam',       select:'edCam',       def:'stock',valid:k=>!!CAM[k],       clsOf:camClass,
    label:k=>CAM[k].label,newName:'MY CAM',factory:['stock','sport','race','atkinson']},
  intercooler:{field:'icPart',cls:'intercooler',select:'edIntercooler',def:'large',valid:k=>!!INTERCOOLER[k],clsOf:icClass,
    label:k=>INTERCOOLER[k].label,newName:'MY INTERCOOLER',factory:['small','large'],from:v=>v===true?'large':v===false?'none':v},
  head:   {field:'headPart',   cls:'valveSpring',select:'edSpring',    def:'stock',valid:k=>!!VALVE_SPRING[k],clsOf:headClass,
    label:k=>VALVE_SPRING[k].label,newName:'MY HEAD',factory:['stock','perf','race']},
  turbo:  {field:'turboPart',  cls:'turboSize', select:'edTurboSize', def:'medium',valid:k=>!!TURBO[k],    clsOf:turboClass,
    label:k=>k.toUpperCase(),newName:'MY TURBO',factory:['small','medium','large']},
  // a part of the car, not of the engine (on:'vehicle'): fitted from the VEHICLE tab's REAR AERO, drawn and priced as the kit's wing
  wing:   {on:'vehicle',field:'wingPart',cls:'aeroRear',select:'vhAeroR',def:'none',valid:k=>!!AERO_REAR[k],clsOf:()=>'wing',
    label:()=>'REAR WING',newName:'MY WING',factory:['wing']}
};
const partOwner=kind=>PART_DEF[kind].on==='vehicle'?vehicle:engine;
const partRebuild=kind=>{if(PART_DEF[kind].on==='vehicle'){buildVehicle();updateVehicleSummary();}else buildEngine();};

let partLib=[];
function loadParts(){
  let raw;try{raw=localStorage.getItem(PARTS_KEY);}catch(e){raw=null;}
  try{const a=raw?JSON.parse(raw):[];partLib=Array.isArray(a)?a.filter(p=>p&&p.id&&PART_DEF[p.kind||'exhaust']).map(normPart):[];}
  catch(e){partLib=[];}
  return partLib;
}
function persistParts(){
  try{localStorage.setItem(PARTS_KEY,JSON.stringify(partLib));return true;}
  catch(e){flash(tr('PARTS NOT SAVED (storage blocked)'),'err');return false;}
}
const partById=id=>partLib.find(p=>p.id===id);
const newPartId=()=>'p'+Date.now().toString(36)+Math.floor(Math.random()*1296).toString(36);
// A part as the physics reads it: every number in its range, every choice one that exists.
function normPart(p){
  const L=PART_LIMITS,n=(v,k,d)=>{const x=+v;return Number.isFinite(x)?clamp(x,L[k][0],L[k][1]):d;};
  const id=String(p.id||newPartId());
  if(p.kind==='filter')return {id,kind:'filter',name:String(p.name||'AIR FILTER').slice(0,40),
    media:FILTER_MEDIA[p.media]?p.media:'paper',area_m2:n(p.area_m2,'area_m2',0.4),
    housing:FILTER_HOUSING[p.housing]?p.housing:'airbox',inletD_mm:n(p.inletD_mm,'inletD_mm',70)};
  if(p.kind==='intercooler')return {id,kind:'intercooler',name:String(p.name||'INTERCOOLER').slice(0,40),
    w:n(p.w,'w',600),h:n(p.h,'h',250),d:n(p.d,'d',75),fpi:n(p.fpi,'fpi',14),pipe_m:n(p.pipe_m,'pipe_m',3)};
  if(p.kind==='head')return {id,kind:'head',name:String(p.name||'HEAD').slice(0,40),valveD_mm:n(p.valveD_mm,'valveD_mm',34),
    exValveD_mm:n(p.exValveD_mm==null||p.exValveD_mm===''?NaN:p.exValveD_mm,'exValveD_mm',+(EV_RATIO*n(p.valveD_mm,'valveD_mm',34)).toFixed(4)),
    throat:n(p.throat,'throat',THROAT_RATIO),seat_N:n(p.seat_N,'seat_N',250),rate_Nmm:n(p.rate_Nmm,'rate_Nmm',22)};
  if(p.kind==='wing')return {id,kind:'wing',name:String(p.name||'WING').slice(0,40),span_mm:n(p.span_mm,'span_mm',1500),
    chord_mm:n(p.chord_mm,'chord_mm',250),angle_deg:n(p.angle_deg,'angle_deg',8),camber_pct:n(p.camber_pct,'camber_pct',6),plate_mm:n(p.plate_mm,'plate_mm',150)};
  if(p.kind==='turbo'){const c=n(p.compD_mm,'compD_mm',71);
    return {id,kind:'turbo',name:String(p.name||'TURBO').slice(0,40),compD_mm:c,
      turbD_mm:n(p.turbD_mm,'turbD_mm',+(TURB_WHEEL*c).toFixed(4)),ar:n(p.ar,'ar',0.64)};}
  if(p.kind==='cam')return {id,kind:'cam',name:String(p.name||'CAM').slice(0,40),dur:n(p.dur,'dur',220),
    lift_mm:n(p.lift_mm,'lift_mm',9),lsa:n(p.lsa,'lsa',114),profile:CAM_PROFILE[p.profile]?p.profile:'gentle',
    vvt_deg:n(p.vvt_deg,'vvt_deg',VVT_AUTHORITY)};
  if(p.kind==='intake'){
    const rL=n(p.runnerL_mm,'runnerL_mm',320),variable=!!p.variable;
    return {id,kind:'intake',name:String(p.name||'INTAKE').slice(0,40),runnerL_mm:rL,runnerD_mm:n(p.runnerD_mm,'runnerD_mm',40),
      variable,shortL_mm:Math.min(n(p.shortL_mm,'shortL_mm',150),Math.max(L.shortL_mm[0],rL-20))};
  }
  return {id,kind:'exhaust',name:String(p.name||'EXHAUST').slice(0,40),
    build:EXHAUST_BUILD[p.build]?p.build:'tubular',
    primD_mm:n(p.primD_mm,'primD_mm',40),primL_mm:n(p.primL_mm,'primL_mm',550),
    pipes:Math.round(n(p.pipes,'pipes',1)),sysD_mm:n(p.sysD_mm,'sysD_mm',57),sysL_m:n(p.sysL_m,'sysL_m',2.6),
    silencer:EXHAUST_SILENCER[p.silencer]?p.silencer:'absorptive'};
}
const samePart=(a,b)=>JSON.stringify(Object.assign({},normPart(a),{id:''}))===JSON.stringify(Object.assign({},normPart(b),{id:''}));
// A build's part, into this browser's library: the same part if it is there, a copy if the library's has since changed.
function ensurePart(p){
  const q=normPart(p),have=partById(q.id);
  if(have&&samePart(have,q))return have.id;
  const twin=partLib.find(x=>samePart(x,q));if(twin)return twin.id;
  if(have)q.id=newPartId();
  partLib.push(q);if(partLib.length>PARTS_MAX)partLib.shift();
  persistParts();fillPartSelects();
  return q.id;
}
// The class the rest of the app reads (sprites, drawings, cost tables): a designed exhaust is drawn as its construction.
const exhaustClass=e=>e.exhaustPart?EXHAUST_BUILD[e.exhaustPart.build].cls:e.exhaust;
const silencerKey=e=>e.exhaustPart?EXHAUST_SILENCER[e.exhaustPart.silencer].cls:e.exhaust;
const exhaustName=e=>e.exhaustPart?e.exhaustPart.name:(EXHAUST[e.exhaust]||EXHAUST.stock).label;

// The engine form's choices: the factory parts, then the library's of that kind under MY PARTS. A part is 'part:<id>'.
function fillPartSelect(kind){
  const D=PART_DEF[kind],s=document.getElementById(D.select);if(!s)return;
  const keep=s.value,mine=partLib.filter(p=>p.kind===kind);
  let g=s.querySelector('optgroup');
  if(!mine.length){if(g)g.remove();if(s.value!==keep||!s.value)s.value=D.def;return;}
  if(!g){g=document.createElement('optgroup');s.appendChild(g);}
  g.label=tr('MY PARTS');
  g.innerHTML=mine.map(p=>'<option value="part:'+esc(p.id)+'">'+esc(p.name)+'</option>').join('');
  s.value=keep;if(s.value!==keep)s.value=D.def;
}
function fillPartSelects(){for(const k in PART_DEF)fillPartSelect(k);}
const fillExhaustSelect=fillPartSelects;
// readEngineFromForm's parts: for each kind, a factory key, or the class and the whole part.
function partsFromForm(){
  const o={};
  for(const [kind,D] of Object.entries(PART_DEF)){
    if(D.on)continue;
    const v=document.getElementById(D.select).value;
    const p=v.startsWith('part:')?partById(v.slice(5)):null;
    if(p&&p.kind===kind){const q=normPart(p);o[D.cls]=D.clsOf(q);o[D.field]=q;}
    else o[D.cls]=D.valid(v)?v:D.def;
  }
  return o;
}
function partsToForm(e){
  for(const D of Object.values(PART_DEF)){
    if(D.on)continue;
    const s=document.getElementById(D.select);
    if(e[D.field]){const id=ensurePart(e[D.field]);fillPartSelects();s.value='part:'+id;}
    else s.value=(D.from?D.from(e[D.cls]):e[D.cls])||D.def;
  }
}
// The same for the car's parts (readVehicleFromForm, applyVehicleToForm): the kit, or the kit's class and the whole part.
function vehPartsFromForm(){
  const o={};
  for(const [kind,D] of Object.entries(PART_DEF)){
    if(D.on!=='vehicle')continue;
    const v=document.getElementById(D.select).value,p=v.startsWith('part:')?partById(v.slice(5)):null;
    if(p&&p.kind===kind){const q=normPart(p);o[D.cls]=D.clsOf(q);o[D.field]=q;}
    else o[D.cls]=D.valid(v)?v:D.def;
  }
  return o;
}
function vehPartsToForm(v){
  for(const D of Object.values(PART_DEF))if(D.on==='vehicle'&&v[D.field]){const id=ensurePart(v[D.field]);document.getElementById(D.select).value='part:'+id;}
}

// ---- the physics of a part on this engine, without touching the build ----
// Everything buildEngine derives from the exhaust and the runners, from deriveGasDynamics on; nothing before it reads them.
function rederiveBreathing(){
  const e=engine;
  e.fillTable=null;           // as a build starts: the exhaust is sized before the filling is tabulated (build 283)
  deriveCam();deriveFriction();   // the cam's valvetrain and grade (build 249); the same as built for any other part
  deriveFilter();
  deriveGasDynamics();
  deriveCharge();                 // reads veAmp, which the cam's grade sets
  if(e.turboConfig==='sequential'&&e.intake==='turbo'&&e.turbineArea>0){
    e.seqStageRpm=0;let st=e.redline+1;
    for(let r=1000;r<=e.redline;r+=100)if(steadyBoost(r)>=0.98*boostTarget(r)){st=r;break;}
    e.seqStageRpm=st;
  }
  buildBoostTable(26);
  e.tqLimTable=null;if(e.tqLimit>0){buildTorqueLimit();buildBoostTable(26);}
  e.govPhi0=null;
  e.wotRich=wotNeedsEnrichment();
  {const p=peakEgts();e.peakEgt=p.probe;e.peakEgtGas=p.gas;}
}
// Run fn on a copy of the engine with another part of a kind: a designed one, or a factory key. The build, the live
// state and the caches are as they were afterwards. The copy gets its own score object: the knock-timing and fuel-map
// caches are keyed on it, and would otherwise hand the copy the timing worked out for the part it replaced.
function withPart(kind,x,fn){
  const D=PART_DEF[kind],keep=engine,sv=Object.assign({},state),dc=dynoCache,dk=dynoCacheKey,kc=_knockCache;
  engine=Object.assign({},keep,{score:Object.assign({},keep.score),_fmaps:null,_fcyc:null});
  if((kind==='cam'||kind==='head')&&keep.ports)x=D.def;   // a port-timed engine has no cam or valves: the build fits none (buildEngineCore)
  // a factory frame other than the engine's own is that frame as sold, not resized to the engine's compressor wheel
  if(kind==='turbo'&&typeof x==='string'&&x!==keep.turboSize)engine.compExd_mm=0;
  if(typeof x==='string'){engine[D.cls]=x;delete engine[D.field];}
  else{engine[D.field]=normPart(Object.assign({},x,{kind}));engine[D.cls]=D.clsOf(engine[D.field]);}
  try{rederiveBreathing();return fn(engine);}
  finally{engine=keep;Object.assign(state,sv);dynoCache=dc;dynoCacheKey=dk;_knockCache=kc;}
}
const withExhaust=(x,fn)=>withPart('exhaust',x,fn);
// The flat-out pull the score is taken on (scoreEngine: best-power mixture, 25 C air, a warm engine).
function wotPull(){
  const sv=Object.assign({},state),am=engine.afrMode;
  engine.afrMode='fixed';
  Object.assign(state,{iat:25,coolant:90,oil:100,engineHealth:1,blown:false,elecLoad:0.3});
  state.afr=engine.ci?engine.stoichAFR*SMOKE_LAMBDA_CI:engine.stoichAFR*0.86;
  const pts=[];let hp=0,hpR=0,tq=0,tqR=0;
  for(let r=1000;r<=engine.redline;r+=100){const p=calcAtRpm(r);pts.push({rpm:r,hp:p.powerHP,tq:p.torque});
    if(p.powerHP>hp){hp=p.powerHP;hpR=r;}if(p.torque>tq){tq=p.torque;tqR=r;}}
  engine.afrMode=am;Object.assign(state,sv);
  return {pts,peakHP:Math.round(hp),peakHPrpm:hpR,peakTQ:Math.round(tq),peakTQrpm:tqR};
}
// What the designer reads out for an exhaust on this engine.
function exhaustReport(x){
  return withExhaust(x,e=>{
    const pull=wotPull(),T=exhaustGasT(1.0,pull.peakHPrpm);
    const m3s=(e.dispCyl_L/1000)*(T/320)*e.cylinders*(pull.peakHPrpm/60*(e.chargesPerRev||0.5))/(e.sysPipes||1);
    return Object.assign(pull,{primD:e.primD,primL:e.primL,primK:e.primK,sysD:e.sysD,sysL:e.sysL,sysPipes:e.sysPipes,sigma:e.exhSigma,
      scavPeakRpm:e.scavPeakRpm,bpKPa:backPressureBar(pull.peakHPrpm,T)*100,pipeV:m3s/(Math.PI/4*e.sysD*e.sysD)});
  });
}
// The runner diameter the factory manifold gives this engine: matched to the ports behind it (deriveGasDynamics).
const portRunnerD=e=>e.ivDia_mm?Math.sqrt(e.ivCount)*e.throatRatio*e.ivDia_mm:0.42*e.bore_mm;
// The speed a runner's own main tuning lands at: its Helmholtz frequency against the cylinder, at Engelman's ratio.
const runnerTuneRpm=(e,L)=>helmholtzHz(e.runnerA,L,e.vEffCyl,313)*60/ENGELMAN_K;
// The gas in the runner while the valve draws: the mean piston speed through the runner's bore (intakeRamGain's u).
const runnerGasV=(e,rpm,Dmm)=>2*(e.stroke_mm/1000)*rpm/60*Math.pow(e.bore_mm/Dmm,2);
// What the designer reads out for an intake on this engine.
function intakeReport(x){
  return withPart('intake',x,e=>{
    const pull=wotPull(),tb=e.fillTable;
    let cross=0;
    if(e.runnerVariable&&tb)for(const r of tb)if(r.L===e.runnerLShort&&r.rpm>=1000&&r.rpm<=e.redline){cross=r.rpm;break;}
    return Object.assign(pull,{runnerL:e.runnerL,runnerLShort:e.runnerLShort,runnerD:e.runnerD_mm,variable:e.runnerVariable,
      ramPeakRpm:e.ramPeakRpm,ramPeakGain:e.ramPeakGain,cross,fill:!!tb,
      tuneRpm:runnerTuneRpm(e,e.runnerL),tuneShort:e.runnerVariable?runnerTuneRpm(e,e.runnerLShort):0,
      gasV:runnerGasV(e,pull.peakHPrpm,e.runnerD_mm),portD:portRunnerD(e)});
  });
}
// What the designer reads out for an air filter on this engine: the pull, and the drop at peak power, media and housing.
function filterReport(x){
  return withPart('filter',x,e=>{
    const pull=wotPull(),r=pull.peakHPrpm,map=wotMapAt(r);
    const sv=Object.assign({},state);Object.assign(state,{iat:25,coolant:90,oil:100});
    const ve=calcAtRpm(r,map).ve;Object.assign(state,sv);
    const Q=airFlowM3s(r,map,ve),f=e.filt;
    return Object.assign(pull,{Q,dp:filterDp(Q),dpMedia:f.a*Q,dpHousing:f.b*Q*Q,Qref:filterQref(e)});
  });
}
// What the designer reads out for a cam on this engine.
function camReport(x){
  return withPart('cam',x,e=>{
    const pull=wotPull();
    return Object.assign(pull,{valved:!!e.ivDia_mm,dur:e.camDur,lsa:e.camLSA,overlap:e.overlap,ivc:ivcAbdc(e.camDur,e.camLSA,0),
      lift:e.ivLift_mm,ld:e.ivDia_mm?e.ivLift_mm/e.ivDia_mm:0,valveD:e.ivDia_mm,floatRpm:e.floatRpm,idle:e.idleRpmEff,
      ramPeakRpm:e.ramPeakRpm,cls:e.cam,vvt:!!e.vvt,auth:e.vvt?(camSpec(e).vvtMax??VVT_AUTHORITY):0});
  });
}
// What the designer reads out for an intercooler on this engine: the pull, and the core at peak power.
function icReport(x){
  return withPart('intercooler',x,e=>{
    const pull=wotPull(),r=pull.peakHPrpm,map=wotMapAt(r),o=Object.assign(pull,{boosted:e.intake!=='na',vol:e.chargeVol*1000});
    if(!o.boosted)return o;
    const sv=Object.assign({},state);Object.assign(state,{iat:25});
    const m=airFlowAt(r,map),tin=compOutletT(map,r),tout=effIAT(map,r);Object.assign(state,sv);
    return Object.assign(o,{m,eff:icEffAt(m),eff0:e.icEff,tin,tout,dp:icDp(e,m,map,313)});
  });
}
// What the designer reads out for a head on this engine.
function headReport(x){
  return withPart('head',x,e=>{
    const pull=wotPull(),valved=!!e.ivDia_mm,pack=VALVE_PACK[e.valves]||VALVE_PACK[4];
    if(!valved)return Object.assign(pull,{valved});
    const T=effIAT(e.mapMax,e.redline)+273.15;
    return Object.assign(pull,{valved,n:e.ivCount,valveD:e.ivDia_mm,dOverB:e.ivDia_mm/e.bore_mm,packD:Math.max(pack.dOverB,(e.ivValve_mm||0)/e.bore_mm),throat:e.throatRatio,
      Ci:inletCi(e),z:inletMachZ(e.redline,T),mass:e.valveMass_g,seat:e.springSeat_N,rate:e.springRate,
      atLift:e.springSeat_N+e.springRate*e.ivLift_mm,lift:e.ivLift_mm,floatRpm:e.floatRpm,
      exD:e.evDia_mm,nEx:Math.max(1,(e.valves||4)-e.ivCount),egt:e.egtPeak});
  });
}
// What the designer reads out for a turbo on this engine: the pull, the wheels, and where full boost arrives.
function turboReport(x){
  return withPart('turbo',x,e=>{
    const pull=wotPull(),o=Object.assign(pull,{turbo:e.intake==='turbo'});
    if(!o.turbo)return o;
    const T=e.boostTable||[],full=T.find(p=>p.bar>=0.95*boostTarget(p.rpm)&&boostTarget(p.rpm)>0);
    return Object.assign(o,{exd:e.compExd*1000,turbD:e.turbK*e.compExd*1000,k:e.turbK,ar:e.turbineAR,vgt:!!e.vgt,
      throat:e.turbineArea*1e4,cap:e.turboCap,load:e.turboLoad,eff:e.compEff,J:e.shaftJ,nMax:e.shaftMax,units:e.turbUnits||1,
      fullRpm:full?full.rpm:0,boostPk:boostAvail(pull.peakHPrpm)});
  });
}
// A factory part, as this engine has it, written down as a part: the start of a design.
function partFromFactory(key,kind){
  kind=kind||'exhaust';
  if(kind==='intercooler'){const F=icFactoryGeom(engine,INTERCOOLER[key]&&INTERCOOLER[key].w?key:'large');
    return normPart({kind,name:tr(F.label),w:F.w,h:F.h,d:F.d,fpi:F.fpi,pipe_m:F.pipe});}
  // the head the engine has: its valve, the factory throat, and the springs of that step as the maker sized them
  if(kind==='head')return withPart('head',key,e=>{
    const g=VALVE_SPRING[key]||VALVE_SPRING.stock,k=e.springScale||1;
    return normPart({kind:'head',name:tr(g.label),valveD_mm:+(e.ivDia_mm||0.39*e.bore_mm).toFixed(4),throat:THROAT_RATIO,
      exValveD_mm:+(e.evDia_mm||EV_RATIO*(e.ivDia_mm||0.39*e.bore_mm)).toFixed(4),
      seat_N:+(g.seat*k).toFixed(3),rate_Nmm:+(g.rate*k).toFixed(4)});
  });
  // a starting point, not a factory part: as wide as the car's track, a quarter of a metre deep, at a moderate angle
  if(kind==='wing')return normPart({kind,name:tr('REAR WING'),span_mm:Math.round((vehicle&&vehicle.track||1.5)*100)*10,chord_mm:250,angle_deg:8,camber_pct:6,plate_mm:150});
  // the engine's own turbo (its compressor wheel, if it sets one, and its housing), or a frame as sold
  if(kind==='turbo')return withPart('turbo',key,e=>{
    const tb=turboFrame(e);
    return normPart({kind:'turbo',name:tr(key.toUpperCase()),compD_mm:tb.exd*1000,turbD_mm:tb.turbK*tb.exd*1000,
      ar:tb.ars[TURBINE_HOUSING[e.housing]??1]});
  });
  if(kind==='cam')return withPart('cam',key,e=>{
    const C=CAM[key]||CAM.stock;
    return normPart({kind:'cam',name:tr(C.label),dur:C.dur,lsa:C.lsa,
      lift_mm:+(e.ivDia_mm?C.lOverD*e.ivDia_mm:C.lOverD*0.39*e.bore_mm).toFixed(4),
      profile:Object.keys(CAM_PROFILE).find(k=>CAM_PROFILE[k].accel===C.accel)||'gentle',vvt_deg:C.vvtMax??VVT_AUTHORITY});
  });
  if(kind==='filter')return withPart('filter',key,e=>{
    const F=AIR_FILTER[key],Q=filterQref(e),f=e.filt,H=FILTER_HOUSING[F.housing];
    // the media's area from its coefficient (a clogged element is the area its dust cake leaves it), the inlet's from
    // the housing's
    const area=f.a>0?200/(FILTER_MEDIA[F.media].perm*f.a):Q/FILTER_FACE_V;
    const inletD=f.b>0&&H.K>0?Math.sqrt(4/Math.PI*Math.sqrt(H.K*AIR_RHO0/2/f.b))*1000:70;
    return normPart({kind:'filter',name:tr(F.label),media:F.media,area_m2:+area.toFixed(6),housing:F.housing,inletD_mm:+inletD.toFixed(4)});
  });
  if(kind==='intake')return withPart('intake',key,e=>normPart({kind:'intake',name:tr(RUNNER[key].label),
    runnerL_mm:RUNNER[key].mm!=null?RUNNER[key].mm:RUNNER.long.mm,runnerD_mm:+e.runnerD_mm.toFixed(4),
    variable:key==='variable',shortL_mm:RUNNER.short.mm}));
  return withExhaust(key,e=>normPart({name:tr(EXHAUST[key].label),build:{stock:'cast',sport:'tubular',race:'equal'}[key],
    primD_mm:+(e.primD*1000).toFixed(2),primL_mm:Math.round((e.intake==='turbo'?(EXHAUST[key].fixedL||0.55):e.primL)*1000),
    pipes:e.sysPipes,sysD_mm:+(e.sysD*1000).toFixed(2),sysL_m:e.sysL,
    silencer:{stock:'chambered',sport:'absorptive',race:'straight'}[key]}));
}
// The primary a fabricator cuts for a speed: the tuning relation solved for length at the lowest order that can be
// routed (350-900 mm), as deriveGasDynamics cuts a factory header.
function primaryFor(rpm){
  const T=exhaustGasT(1.0,rpm),theta=(engine.camDur||240)/2+90;
  for(let k=1;k<=9;k+=2){const L=theta*sonic(T)/(12*rpm*k);if(L>=0.35&&L<=0.90)return Math.round(L*1000);}
  return Math.round(clamp(theta*sonic(T)/(12*rpm*3),0.35,0.90)*1000);
}
// The pipe for a gas speed at the power peak (design practice: ~75 m/s; see EXHAUST).
function pipeFor(v,pipes,rpm){
  const T=exhaustGasT(1.0,rpm);
  const m3s=(engine.dispCyl_L/1000)*(T/320)*engine.cylinders*(rpm/60*(engine.chargesPerRev||0.5))/Math.max(1,pipes);
  return +clamp(Math.sqrt(4/Math.PI*m3s/v)*1000,PART_LIMITS.sysD_mm[0],PART_LIMITS.sysD_mm[1]).toFixed(1);
}
// Where the integrated intake stroke fills best (deriveGasDynamics' search, on the fill table as it stands).
function fillPeakRpm(e){
  let bf=-9,at=0;
  for(let n=Math.max(1200,e.idleRpmEff||1200);n<=e.redline;n+=25){const f=fillAt(n);if(f>bf){bf=f;at=n;}}
  return at;
}
// The runner cut for a speed: the length (plenum to head, the port added after) at which the integrated intake
// stroke fills best there, for a runner of this bore. Not the runner's resonance alone: the column's momentum moves
// the fill's peak 20-25% above it (build 206), so the length is searched on the fill model itself. Not a bisection:
// a stub too short to carry a column fills best LOWER again (40 mm on the M3 below 150 mm), so the lengths are
// scanned every 20 mm and the nearest refined every 5. Nearest peak wins; on a tie, the fuller fill at the speed.
function runnerFor(rpm,Dmm){
  const [lo0,hi0]=PART_LIMITS.runnerL_mm;
  return withPart('intake',{name:'',runnerL_mm:320,runnerD_mm:Dmm,variable:false},e=>{
    const port=0.95*e.bore_mm/1000;
    let best=null;
    const tryL=Lmm=>{e.runnerL=Lmm/1000+port;buildFillTable();const d=Math.abs(fillPeakRpm(e)-rpm),f=fillAt(rpm);
      if(!best||d<best.d-1e-9||(Math.abs(d-best.d)<1e-9&&f>best.f))best={L:Lmm,d,f};};
    for(let L=lo0;L<=hi0;L+=20)tryL(L);
    const c=best.L;for(let L=Math.max(lo0,c-15);L<=Math.min(hi0,c+15);L+=5)tryL(L);
    return best.L;
  });
}

// ---- the PARTS page ----
const partsUI={kind:'exhaust',edit:{exhaust:null,intake:null,filter:null,cam:null,head:null,turbo:null,intercooler:null,wing:null},timer:0};
const pv=id=>document.getElementById(id);
const fittedPart=kind=>partOwner(kind)&&partOwner(kind)[PART_DEF[kind].field];
// the ids of each kind's editor
const PART_UI={
  exhaust:{reset:'ptReset',box:'partsExhaust',list:'partList',from:'ptFrom',neu:'ptNew',save:'ptSave',saveFit:'ptSaveFit',guide:'partGuide',canvas:'partCanvas',legend:'partLegend',
    none:"No exhausts designed yet. Start from one of this engine's factory exhausts below.",
    fields:['ptName','ptBuild','ptPrimD','ptPrimL','ptPipes','ptSysD','ptSysL','ptSil'],
    spec:p=>tr(EXHAUST_BUILD[p.build].label)+' · '+p.primD_mm+'/'+p.primL_mm+' mm · '+p.pipes+'× '+p.sysD_mm+' mm'},
  intake:{reset:'piReset',box:'partsIntake',list:'piList',from:'piFrom',neu:'piNew',save:'piSave',saveFit:'piSaveFit',guide:'piGuide',canvas:'piCanvas',legend:'piLegend',
    none:"No intakes designed yet. Start from one of this engine's factory manifolds below.",
    fields:['piName','piL','piD','piVar','piShort'],
    spec:p=>p.runnerL_mm+' × '+p.runnerD_mm+' mm'+(p.variable?' · '+tr('VARIABLE')+' '+p.shortL_mm+' mm':'')},
  filter:{reset:'pfReset',box:'partsFilter',list:'pfList',from:'pfFrom',neu:'pfNew',save:'pfSave',saveFit:'pfSaveFit',guide:'pfGuide',canvas:'pfCanvas',legend:'pfLegend',
    none:"No air filters designed yet. Start from one of this engine's factory filters below.",
    fields:['pfName','pfMedia','pfArea','pfHousing','pfInlet'],
    spec:p=>tr(FILTER_MEDIA[p.media].label)+' · '+p.area_m2+' m² · '+tr(FILTER_HOUSING[p.housing].label)+(p.housing==='none'?'':' '+p.inletD_mm+' mm')},
  cam:{reset:'pcReset',box:'partsCam',list:'pcList',from:'pcFrom',neu:'pcNew',save:'pcSave',saveFit:'pcSaveFit',guide:'pcGuide',canvas:'pcCanvas',legend:'pcLegend',
    none:"No cams designed yet. Start from one of the factory cams below.",
    fields:['pcName','pcDur','pcLift','pcLsa','pcProfile','pcVvt'],
    spec:p=>p.dur+'° · '+p.lift_mm+' mm · LSA '+p.lsa+'° · '+tr(CAM_PROFILE[p.profile].label)},
  intercooler:{reset:'pxReset',box:'partsIc',list:'pxList',from:'pxFrom',neu:'pxNew',save:'pxSave',saveFit:'pxSaveFit',guide:'pxGuide',canvas:'pxCanvas',legend:'pxLegend',
    none:"No intercoolers designed yet. Start from one of the factory cores below.",
    fields:['pxName','pxW','pxH','pxD','pxFpi','pxPipe'],
    spec:p=>p.w+' × '+p.h+' × '+p.d+' mm · '+p.fpi+' fpi · '+p.pipe_m+' m'},
  head:{reset:'phReset',box:'partsHead',list:'phList',from:'phFrom',neu:'phNew',save:'phSave',saveFit:'phSaveFit',guide:'phGuide',canvas:'phCanvas',legend:'phLegend',
    none:"No cylinder heads designed yet. Start from this engine's head with one of the factory springs below.",
    fields:['phName','phValve','phExValve','phThroat','phSeat','phRate'],
    spec:p=>p.valveD_mm+' / '+p.exValveD_mm+' mm · '+tr('throat')+' '+p.throat+' · '+Math.round(p.seat_N)+' N, '+(+p.rate_Nmm).toFixed(1)+' N/mm'},
  turbo:{reset:'pbReset',box:'partsTurbo',list:'pbList',from:'pbFrom',neu:'pbNew',save:'pbSave',saveFit:'pbSaveFit',guide:'pbGuide',canvas:'pbCanvas',legend:'pbLegend',
    none:"No turbos designed yet. Start from this engine's turbo or one of the frames below.",
    fields:['pbName','pbComp','pbTurb','pbAr'],
    spec:p=>(+p.compD_mm).toFixed(1)+' / '+(+p.turbD_mm).toFixed(1)+' mm · A/R '+(+p.ar).toFixed(2)},
  wing:{reset:'pwReset',box:'partsWing',list:'pwList',from:'pwFrom',neu:'pwNew',save:'pwSave',saveFit:'pwSaveFit',guide:'pwGuide',canvas:'pwCanvas',legend:'pwLegend',
    none:"No wings designed yet. Start from a wing as wide as this car's track below.",
    fields:['pwName','pwSpan','pwChord','pwAngle','pwCamber','pwPlate'],
    spec:p=>p.span_mm+' × '+p.chord_mm+' mm · '+p.angle_deg+'° · '+tr('camber')+' '+p.camber_pct+'%'}
};
function renderParts(){
  const types=pv('partTypes');if(!types)return;
  types.innerHTML=PART_KINDS.map(k=>'<button type="button" data-kind="'+k.kind+'"'+(k.ready?'':' disabled')+(partsUI.kind===k.kind?' class="on"':'')+'>'
    +esc(tr(k.label))+(k.ready?'':'<span class="soon">'+esc(tr('LATER'))+'</span>')+'</button>').join('');
  types.querySelectorAll('button[data-kind]').forEach(b=>b.addEventListener('click',()=>{partsUI.kind=b.dataset.kind;renderParts();}));
  const noEng=!PART_DEF[partsUI.kind].on&&(!engine||isElectric());   // the car's parts need no engine
  pv('partsNoEngine').hidden=!noEng;
  for(const k in PART_UI)pv(PART_UI[k].box).hidden=noEng||partsUI.kind!==k;
  if(noEng)return;
  const kind=partsUI.kind,U=PART_UI[kind],D=PART_DEF[kind];
  const list=pv(U.list),fitted=fittedPart(kind)&&fittedPart(kind).id,mine=partLib.filter(p=>p.kind===kind),ed=partsUI.edit[kind];
  list.innerHTML=mine.length?mine.map(p=>'<div class="part-row'+(ed&&ed.id===p.id?' sel':'')+'">'
    +'<span class="pn">'+esc(p.name)+(fitted===p.id?' <b>'+esc(tr('FITTED'))+'</b>':'')+'</span>'
    +'<span class="ps">'+esc(U.spec(p))+'</span>'
    +'<button type="button" data-a="edit" data-id="'+esc(p.id)+'">'+esc(tr('EDIT'))+'</button>'
    +'<button type="button" data-a="fit" data-id="'+esc(p.id)+'">'+esc(tr('FIT'))+'</button>'
    +'<button type="button" data-a="del" data-id="'+esc(p.id)+'">'+esc(tr('DELETE'))+'</button></div>').join('')
    :'<div class="hint">'+esc(tr(U.none))+'</div>';
  list.querySelectorAll('button[data-a]').forEach(b=>b.addEventListener('click',()=>partAction(b.dataset.a,b.dataset.id)));
  const own=partOwner(kind),start=D.factory.includes(own[D.cls])?own[D.cls]:D.on?D.factory[0]:D.def;
  if(!ed)pv(U.from).value=start;
  if(!ed)partsUI.edit[kind]=fittedPart(kind)?Object.assign({},fittedPart(kind))
    :Object.assign(partFromFactory(start,kind),{name:tr(D.newName)});
  partToEditor(kind,partsUI.edit[kind]);
  previewPart(kind);
}
function partToEditor(kind,p){
  const peak=Math.round((engine.score&&engine.score.peakHPrpm||engine.redline*0.9)/100)*100;
  if(kind==='intercooler'){
    pv('pxName').value=p.name;pv('pxW').value=p.w;pv('pxH').value=p.h;pv('pxD').value=p.d;pv('pxFpi').value=p.fpi;pv('pxPipe').value=p.pipe_m;
    return;
  }
  if(kind==='wing'){
    pv('pwName').value=p.name;pv('pwSpan').value=p.span_mm;pv('pwChord').value=p.chord_mm;pv('pwAngle').value=p.angle_deg;pv('pwCamber').value=p.camber_pct;pv('pwPlate').value=p.plate_mm;
    return;
  }
  if(kind==='turbo'){
    pv('pbName').value=p.name;pv('pbComp').value=+(+p.compD_mm).toFixed(1);pv('pbTurb').value=+(+p.turbD_mm).toFixed(1);pv('pbAr').value=+(+p.ar).toFixed(3);
    return;
  }
  if(kind==='head'){
    pv('phName').value=p.name;pv('phValve').value=p.valveD_mm;pv('phExValve').value=p.exValveD_mm;pv('phThroat').value=p.throat;pv('phSeat').value=p.seat_N;pv('phRate').value=p.rate_Nmm;
    return;
  }
  if(kind==='cam'){
    pv('pcName').value=p.name;pv('pcDur').value=p.dur;pv('pcLift').value=p.lift_mm;pv('pcLsa').value=p.lsa;pv('pcProfile').value=p.profile;pv('pcVvt').value=p.vvt_deg;
    return;
  }
  if(kind==='filter'){
    pv('pfName').value=p.name;pv('pfMedia').value=p.media;pv('pfArea').value=p.area_m2;pv('pfHousing').value=p.housing;pv('pfInlet').value=p.inletD_mm;
    pv('pfInlet').disabled=p.housing==='none';pv('pfMedia').disabled=pv('pfArea').disabled=p.housing==='none';
    return;
  }
  if(kind==='intake'){
    pv('piName').value=p.name;pv('piL').value=p.runnerL_mm;pv('piD').value=p.runnerD_mm;pv('piVar').value=p.variable?'yes':'no';pv('piShort').value=p.shortL_mm;
    pv('piShort').disabled=!p.variable;
    if(!pv('piCutRpm').value)pv('piCutRpm').value=Math.round((engine.score&&engine.score.peakTQrpm||engine.redline*0.6)/100)*100;
    return;
  }
  pv('ptName').value=p.name;pv('ptBuild').value=p.build;pv('ptPrimD').value=p.primD_mm;pv('ptPrimL').value=p.primL_mm;
  pv('ptPipes').value=String(p.pipes);pv('ptSysD').value=p.sysD_mm;pv('ptSysL').value=p.sysL_m;pv('ptSil').value=p.silencer;
  if(!pv('ptCutRpm').value)pv('ptCutRpm').value=peak;
}
function partFromEditor(kind){
  kind=kind||'exhaust';
  const ed=partsUI.edit[kind],newName=tr(PART_DEF[kind].newName);
  if(kind==='intercooler')return normPart({kind,id:ed&&ed.id,name:pv('pxName').value.trim()||newName,w:pv('pxW').value,
    h:pv('pxH').value,d:pv('pxD').value,fpi:pv('pxFpi').value,pipe_m:pv('pxPipe').value});
  if(kind==='wing')return normPart({kind,id:ed&&ed.id,name:pv('pwName').value.trim()||newName,span_mm:pv('pwSpan').value,
    chord_mm:pv('pwChord').value,angle_deg:pv('pwAngle').value,camber_pct:pv('pwCamber').value,plate_mm:pv('pwPlate').value});
  if(kind==='turbo'){
    // the editor shows the wheels to 0.1 mm and the A/R to 0.001: an unchanged field keeps the part's exact number
    const keep=(id,k,d)=>{const v=pv(id).value;return ed&&ed[k]!=null&&+v===+(+ed[k]).toFixed(d)?ed[k]:v;};
    return normPart({kind,id:ed&&ed.id,name:pv('pbName').value.trim()||newName,compD_mm:keep('pbComp','compD_mm',1),
      turbD_mm:keep('pbTurb','turbD_mm',1),ar:keep('pbAr','ar',3)});
  }
  if(kind==='head')return normPart({kind,id:ed&&ed.id,name:pv('phName').value.trim()||newName,valveD_mm:pv('phValve').value,exValveD_mm:pv('phExValve').value,
    throat:pv('phThroat').value,seat_N:pv('phSeat').value,rate_Nmm:pv('phRate').value});
  if(kind==='cam')return normPart({kind,id:ed&&ed.id,name:pv('pcName').value.trim()||newName,dur:pv('pcDur').value,
    lift_mm:pv('pcLift').value,lsa:pv('pcLsa').value,profile:pv('pcProfile').value,vvt_deg:pv('pcVvt').value});
  if(kind==='filter')return normPart({kind,id:ed&&ed.id,name:pv('pfName').value.trim()||newName,media:pv('pfMedia').value,
    area_m2:pv('pfArea').value,housing:pv('pfHousing').value,inletD_mm:pv('pfInlet').value});
  if(kind==='intake')return normPart({kind,id:ed&&ed.id,name:pv('piName').value.trim()||newName,runnerL_mm:pv('piL').value,runnerD_mm:pv('piD').value,
    variable:pv('piVar').value==='yes',shortL_mm:pv('piShort').value});
  return normPart({kind,id:ed&&ed.id,name:pv('ptName').value.trim()||newName,build:pv('ptBuild').value,
    primD_mm:pv('ptPrimD').value,primL_mm:pv('ptPrimL').value,pipes:pv('ptPipes').value,sysD_mm:pv('ptSysD').value,
    sysL_m:pv('ptSysL').value,silencer:pv('ptSil').value});
}
function partAction(a,id){
  const p=partById(id);if(!p)return;
  const kind=p.kind,D=PART_DEF[kind];
  if(a==='edit'){partsUI.edit[kind]=Object.assign({},p);renderParts();}
  else if(a==='fit')fitPart(p.id);
  else if(a==='del'){
    partLib=partLib.filter(x=>x.id!==id);persistParts();
    const f=fittedPart(kind);
    if(f&&f.id===id){pv(D.select).value=partOwner(kind)[D.cls];fillPartSelects();partRebuild(kind);
      flash(tr(kind==='wing'?"PART DELETED: THE CAR HAS THE KIT'S REAR WING":kind==='intake'?'PART DELETED: THE ENGINE HAS ITS FACTORY INTAKE':kind==='intercooler'?'PART DELETED: THE ENGINE HAS ITS FACTORY INTERCOOLER':kind==='cam'?'PART DELETED: THE ENGINE HAS ITS FACTORY CAM':kind==='head'?'PART DELETED: THE ENGINE HAS ITS FACTORY HEAD':kind==='turbo'?'PART DELETED: THE ENGINE HAS ITS FACTORY TURBO':kind==='filter'?'PART DELETED: THE ENGINE HAS ITS FACTORY AIR FILTER':'PART DELETED: THE ENGINE HAS ITS FACTORY EXHAUST'));}
    else{fillPartSelects();flash(tr('PART DELETED'));}
    if(partsUI.edit[kind]&&partsUI.edit[kind].id===id)partsUI.edit[kind]=null;
    renderParts();
  }
}
function savePart(kind){
  kind=kind||partsUI.kind;
  const p=partFromEditor(kind),i=partLib.findIndex(x=>x.id===p.id);
  if(i>=0)partLib[i]=p;else{if(partLib.length>=PARTS_MAX){flash(tr('PARTS LIBRARY FULL'),'warn');return null;}partLib.push(p);}
  if(!persistParts())return null;
  partsUI.edit[kind]=Object.assign({},p);fillPartSelects();
  // the engine wearing this part takes the new dimensions
  const f=fittedPart(kind);if(f&&f.id===p.id){if(PART_DEF[kind].on)pv(PART_DEF[kind].select).value='part:'+p.id;partRebuild(kind);}
  flash(tr('PART SAVED'));renderParts();
  return p;
}
function fitPart(id){
  const p=partById(id);
  fillPartSelects();pv(PART_DEF[p.kind].select).value='part:'+id;partRebuild(p.kind);
  flash(tr('PART FITTED')+': '+p.name);renderParts();
}
// RESET: the dimensions back to the factory part chosen in START FROM, keeping the part's name and identity, so a saved
// part that is reset and saved again is the same part with the factory's numbers. Nothing is saved until SAVE.
function resetPart(kind){
  const U=PART_UI[kind],ed=partsUI.edit[kind],name=pv(U.fields[0]).value.trim()||tr(PART_DEF[kind].newName);
  partsUI.edit[kind]=Object.assign(partFromFactory(pv(U.from).value,kind),{id:ed&&ed.id||newPartId(),name});
  partToEditor(kind,partsUI.edit[kind]);previewPart(kind);
  flash(tr('PART RESET TO THE FACTORY DIMENSIONS: SAVE TO KEEP IT'));
}
function newPartFrom(kind,key){partsUI.edit[kind]=Object.assign(partFromFactory(key,kind),{id:newPartId(),name:tr(PART_DEF[kind].newName)});renderParts();}
const fmt=(x,d=0)=>(+x).toFixed(d),dlt=(a,b)=>{const d=a-b;return (d>=0?'+':'')+d;};
const headline=(what,r,now)=>tr(what)+': <b>'+r.peakHP+' hp</b> @ '+r.peakHPrpm+' · <b>'+r.peakTQ+' Nm</b> @ '+r.peakTQrpm
  +' <span class="dim">('+tr('now')+' '+now.peakHP+' hp, '+now.peakTQ+' Nm: '+dlt(r.peakHP,now.peakHP)+' hp, '+dlt(r.peakTQ,now.peakTQ)+' Nm)</span>';
function previewPart(kind){
  kind=kind||'exhaust';
  if(kind==='intake')return previewIntake();
  if(kind==='filter')return previewFilter();
  if(kind==='cam')return previewCam();
  if(kind==='intercooler')return previewIc();
  if(kind==='head')return previewHead();
  if(kind==='turbo')return previewTurbo();
  if(kind==='wing')return previewWing();
  const p=partFromEditor('exhaust'),now=exhaustReport(engine.exhaustPart||engine.exhaust),r=exhaustReport(p);
  partsUI.last={kind,p,now,r};
  const turbo=engine.intake==='turbo',ported=!!engine.ports;
  const lines=[];
  lines.push(headline('With this exhaust',r,now));
  lines.push(tr('Primary')+': '+fmt(p.primD_mm,1)+' mm = '+fmt(p.primD_mm/engine.bore_mm,2)+' × '+tr('bore')
    +' <span class="dim">('+tr('the factory exhausts: cast 0.38, tubular 0.46, race 0.54')+')</span>');
  if(turbo)lines.push(tr('On a turbo engine the manifold is as short as packaging allows: the primary length is not used, and its suction wave turns into a compression against the turbine.'));
  else if(ported)lines.push(tr('A port-timed engine has no valve overlap to scavenge through: the header changes its back-pressure, not its filling.'));
  else lines.push(tr('Scavenging is strongest at')+' <b>'+r.scavPeakRpm+' rpm</b>'+(r.primK?' ('+tr('wave order')+' '+r.primK+')':'')
    +'; '+tr('peak power is at')+' '+r.peakHPrpm+' rpm.');
  lines.push(tr('Gas speed in the pipe at peak power')+': <b>'+fmt(r.pipeV)+' m/s</b> <span class="dim">('+tr('design practice ~75; quieter road systems run faster, race systems slower')+')</span>');
  lines.push(tr('Back-pressure at peak power')+': <b>'+fmt(r.bpKPa,1)+' kPa</b> <span class="dim">('+tr('now')+' '+fmt(now.bpKPa,1)+')</span>');
  lines.push('<span class="dim">'+tr('The silencer changes the sound only; its own back-pressure is not modelled yet.')+'</span>');
  pv('partGuide').innerHTML=lines.map(l=>'<div>'+l+'</div>').join('');
  drawPartCurves('exhaust',now,r);
}
function previewIntake(){
  const p=partFromEditor('intake'),now=intakeReport(engine.intakePart||engine.runner),r=intakeReport(p);
  partsUI.last={kind:'intake',p,now,r};
  pv('piShort').disabled=!p.variable;
  const port=Math.round(0.95*engine.bore_mm),lines=[];
  lines.push(headline('With this intake',r,now));
  if(!r.fill){
    lines.push(tr('A port-timed engine has no intake valve for the runners to tune against: the runners change nothing.'));
  }else{
    lines.push(tr('Runner')+': '+fmt(p.runnerL_mm)+' mm + '+port+' mm '+tr('of port in the head')+' = '+fmt(r.runnerL*1000)+' mm; '
      +tr('its resonance alone would tune it for')+' <b>'+fmt(r.tuneRpm/50)*50+' rpm</b>'
      +(r.variable?', '+tr('the short one at')+' '+fmt(r.tuneShort/50)*50+' rpm':'')+'.');
    lines.push(tr('The intake stroke fills best at')+' <b>'+r.ramPeakRpm+' rpm</b> (+'+fmt(r.ramPeakGain*100)+'% '+tr('over its slowest')+'); '
      +tr('peak torque is at')+' '+r.peakTQrpm+', '+tr('peak power at')+' '+r.peakHPrpm+' rpm.');
    if(r.variable)lines.push(r.cross?tr('The flap opens the short runners from')+' <b>'+r.cross+' rpm</b>.':tr('The short runners never fill better here: the flap stays shut.'));
    lines.push(tr('Runner bore')+': '+fmt(p.runnerD_mm,1)+' mm <span class="dim">('+tr('matched to this engine\'s ports')+': '+fmt(r.portD,1)+' mm)</span>; '
      +tr('gas speed while the valve draws, at peak power')+': <b>'+fmt(r.gasV)+' m/s</b>.');
  }
  lines.push('<span class="dim">'+tr('The plenum\'s volume and the throttle are not part of the design yet: the plenum is taken as holding steady pressure.')+'</span>');
  pv('piGuide').innerHTML=lines.map(l=>'<div>'+l+'</div>').join('');
  drawPartCurves('intake',now,r);
}
function previewFilter(){
  const p=partFromEditor('filter'),now=filterReport(engine.filterPart||engine.airFilter),r=filterReport(p);
  partsUI.last={kind:'filter',p,now,r};
  const none=p.housing==='none';
  pv('pfInlet').disabled=none;pv('pfMedia').disabled=pv('pfArea').disabled=none;
  const kPa=x=>fmt(x/1000,2)+' kPa',lines=[];
  lines.push(headline('With this filter',r,now));
  lines.push(tr('Restriction at peak power')+': <b>'+kPa(r.dp)+'</b> ('+tr('media')+' '+kPa(r.dpMedia)+', '+tr('housing')+' '+kPa(r.dpHousing)+')'
    +' <span class="dim">('+tr('now')+' '+kPa(now.dp)+'; '+tr('new filters read 2-3.75 kPa at full throttle, clogged ones 6-7')+')</span>');
  if(!none){
    const vFace=r.Q/p.area_m2,vIn=r.Q/(Math.PI/4*Math.pow(p.inletD_mm/1000,2));
    lines.push(tr('Air through the media')+': <b>'+fmt(vFace,2)+' m/s</b> <span class="dim">('+tr('a factory element is sized for')+' '+FILTER_FACE_V+')</span>; '
      +tr('through the inlet')+': <b>'+fmt(vIn)+' m/s</b>.');
  }else lines.push(tr('Open stacks: nothing in the way, and nothing filtered.'));
  if(engine.intake!=='na')lines.push('<span class="dim">'+tr('On a boosted engine the drop is taken off the charge, as if the turbo were at its limit; with boost to spare the wastegate would make most of it up.')+'</span>');
  lines.push('<span class="dim">'+tr('Oiled cotton\'s permeability is its makers\' claim (about 50% more than paper); paper\'s is measured.')+'</span>');
  pv('pfGuide').innerHTML=lines.map(l=>'<div>'+l+'</div>').join('');
  drawPartCurves('filter',now,r);
}
function previewCam(){
  const p=partFromEditor('cam'),now=camReport(engine.camPart||engine.cam),r=camReport(p);
  partsUI.last={kind:'cam',p,now,r};
  const lines=[];
  lines.push(headline('With this cam',r,now));
  if(!r.valved)lines.push(tr('A port-timed engine has no poppet valves: a cam changes nothing.'));
  else{
    lines.push(tr('Overlap')+': <b>'+fmt(r.overlap)+'°</b> <span class="dim">('+tr('now')+' '+fmt(now.overlap)+'°; '+tr('duration minus twice the separation')+')</span>; '
      +tr('the intake closes')+' <b>'+fmt(r.ivc)+'°</b> '+tr('after bottom centre')+(r.vvt?' '+tr('fully retarded; the phaser may advance it')+' '+fmt(r.auth)+'°':'')+'.');
    lines.push(tr('Lift')+': '+fmt(r.lift,2)+' mm = '+fmt(r.ld,3)+' × '+tr('the valve')+' ('+fmt(r.valveD,1)+' mm) <span class="dim">('+tr('the factory cams: 0.22 stock, 0.25 sport, 0.28 race')+')</span>');
    lines.push(tr('The intake stroke fills best at')+' <b>'+r.ramPeakRpm+' rpm</b>; '+tr('peak torque is at')+' '+r.peakTQrpm+', '+tr('peak power at')+' '+r.peakHPrpm+' rpm.');
    const fl=r.floatRpm>engine.redline?'':' <b class="warn">'+tr('below the redline')+'</b>';
    lines.push(tr('The valves float at')+' <b>'+Math.round(r.floatRpm/100)*100+' rpm</b>'+fl+' <span class="dim">('+tr('now')+' '+Math.round(now.floatRpm/100)*100+'; '+tr('a harder lobe or more lift floats sooner; stiffer springs on HEAD & VALVES hold it')+')</span>');
  }
  lines.push('<span class="dim">'+tr('Idle and the airflow estimates still take the grade of the factory cam nearest in duration and separation')+': '+tr(CAM[r.cls].label)+'.</span>');
  pv('pcGuide').innerHTML=lines.map(l=>'<div>'+l+'</div>').join('');
  drawPartCurves('cam',now,r);
}
function previewIc(){
  const p=partFromEditor('intercooler'),now=icReport(engine.icPart||engine.intercooler),r=icReport(p);
  partsUI.last={kind:'intercooler',p,now,r};
  const kPa=x=>fmt(x/1000,1)+' kPa',lines=[];
  lines.push(headline('With this intercooler',r,now));
  if(!r.boosted)lines.push(tr('An intercooler only matters with forced induction: this engine breathes at atmosphere.'));
  else{
    lines.push(tr('Effectiveness at peak power')+': <b>'+fmt(r.eff,2)+'</b> <span class="dim">('+tr('now')+' '+fmt(now.eff,2)
      +'; '+tr('at 1 bar and the redline')+' '+fmt(r.eff0,2)+'; '+tr('in 11 m/s of cooling air, about a car at motorway speed')+')</span>');
    lines.push(tr('The charge leaves the compressor at')+' '+fmt(r.tin)+' °C '+tr('and the core at')+' <b>'+fmt(r.tout)+' °C</b> <span class="dim">('+tr('now')+' '+fmt(now.tout)+' °C, '+tr('in 25 °C air')+')</span>');
    lines.push(tr('Core')+': '+fmt(icGrossL(p),1)+' L, '+tr('holding')+' '+fmt(icCoreL(p),1)+' L '+tr('of charge')+'; '+tr('the charge system to fill')+': <b>'+fmt(r.vol,1)+' L</b> <span class="dim">('+tr('now')+' '+fmt(now.vol,1)+'; '+tr('more to fill spools slower')+')</span>');
    lines.push(tr('Pressure drop at peak power')+': <b>'+kPa(r.dp.core+r.dp.pipe)+'</b> ('+tr('core')+' '+kPa(r.dp.core)+', '+tr('pipe')+' '+kPa(r.dp.pipe)+')'
      +' <span class="dim">('+tr('now')+' '+kPa(now.dp.core+now.dp.pipe)+'; '+tr('design practice: about 7-14 kPa, 1-2 psi, at full flow; the compressor makes it up on top of the boost')+')</span>');
  }
  pv('pxGuide').innerHTML=lines.map(l=>'<div>'+l+'</div>').join('');
  drawPartCurves('intercooler',now,r);
}
function previewHead(){
  const p=partFromEditor('head'),now=headReport(engine.headPart||engine.valveSpring),r=headReport(p);
  partsUI.last={kind:'head',p,now,r};
  const lines=[];
  lines.push(headline('With this head',r,now));
  if(!r.valved)lines.push(tr('A port-timed engine has no poppet valves: a head of valves changes nothing.'));
  else{
    const big=r.dOverB>r.packD+1e-9;
    lines.push(tr('Intake valves')+': '+r.n+' × <b>'+fmt(r.valveD,1)+' mm</b> = '+fmt(r.dOverB,3)+' × '+tr('the bore')
      +' <span class="dim">('+tr('the factory packing for this layout')+': '+fmt(r.packD,2)+')</span>'
      +(big?' <b class="warn">'+tr('bigger than the factory packing: check they fit the bore')+'</b>':''));
    lines.push(tr('Port throat')+': '+fmt(r.throat,3)+' × '+tr('the valve')+'; '+tr('mean flow coefficient')+' <b>'+fmt(r.Ci,3)
      +'</b> <span class="dim">('+tr('now')+' '+fmt(now.Ci,3)+'; '+tr("Taylor's 0.42 on a 0.85 throat")+')</span>'
      +(r.Ci<0.42*Math.pow(r.throat/THROAT_RATIO,2)-1e-9?' '+tr('The lift limits it, not the throat: a bigger port needs a cam that lifts more.'):''));
    lines.push(tr('Inlet Mach index at the redline')+': <b>'+fmt(r.z,2)+'</b> <span class="dim">('+tr('now')+' '+fmt(now.z,2)+'; '
      +tr('filling holds to 0.5 and falls past it')+')</span>');
    lines.push(tr('Exhaust valves')+': '+r.nEx+' × <b>'+fmt(r.exD,1)+' mm</b> = '+fmt(r.exD/r.valveD,2)+' × '+tr('the intake')
      +'; '+tr('exhaust gas at peak power')+' <b>'+fmt(r.egt)+' °C</b> <span class="dim">('+tr('now')+' '+fmt(now.egt)+'; '+tr('a wider port takes less heat from the gas')+')</span>');
    lines.push(tr('Springs')+': '+Math.round(r.seat)+' N '+tr('on the seat')+', '+fmt(r.rate,1)+' N/mm, '+Math.round(r.atLift)+' N '+tr('at full lift')
      +' ('+fmt(r.lift,2)+' mm); '+tr('each valve weighs')+' '+fmt(r.mass,0)+' g.');
    const fl=r.floatRpm>engine.redline?'':' <b class="warn">'+tr('below the redline')+'</b>';
    lines.push(tr('The valves float at')+' <b>'+Math.round(r.floatRpm/100)*100+' rpm</b>'+fl+' <span class="dim">('+tr('now')+' '+Math.round(now.floatRpm/100)*100
      +'; '+tr('a bigger valve is heavier and floats sooner; a stiffer spring holds it')+')</span>');
  }
  lines.push('<span class="dim">'+tr('The springs are fixed: they no longer re-size for the cam or the redline.')+'</span>');
  pv('phGuide').innerHTML=lines.map(l=>'<div>'+l+'</div>').join('');
  drawPartCurves('head',now,r);
}
function previewTurbo(){
  const p=partFromEditor('turbo'),now=turboReport(engine.turboPart||engine.turboSize),r=turboReport(p);
  partsUI.last={kind:'turbo',p,now,r};
  const lines=[];
  lines.push(headline('With this turbo',r,now));
  if(!r.turbo)lines.push(tr('This engine has no turbo: choose TURBO under INDUCTION on the ENGINE tab to fit one.'));
  else{
    const k=r.k,odd=k<0.75||k>1.1;
    lines.push(tr('Compressor')+' <b>'+fmt(r.exd,1)+' mm</b>: '+tr('it chokes at')+' <b>'+fmt(r.cap,0)+' lb/min</b>'
      +(r.units>1?' ('+r.units+' '+tr('turbos')+')':'')+'; '+tr('the engine asks')+' '+fmt(r.load*100,0)+'% '+tr('of it at peak power, at an efficiency of')+' '+fmt(r.eff*100,0)+'%.');
    lines.push(tr('Turbine')+' <b>'+fmt(r.turbD,1)+' mm</b> = '+fmt(k,2)+' × '+tr('the compressor')
      +' <span class="dim">('+tr('the factory frames: 0.90')+')</span>'+(odd?' <b class="warn">'+tr('far from the usual 0.8-1.0: check the pair')+'</b>':''));
    lines.push(r.vgt?tr('The vanes set the throat on a VGT; the housing A/R is not used.')+' '+tr('Throat, vanes open')+': '+fmt(r.throat,1)+' cm²'
      :tr('Housing A/R')+' '+fmt(r.ar,2)+': '+tr('throat')+' <b>'+fmt(r.throat,1)+' cm²</b> <span class="dim">('+tr('now')+' '+fmt(now.throat,1)+'; '+tr('a smaller throat spools sooner and chokes the top end')+')</span>');
    lines.push(tr('95% of the boost from')+' <b>'+(r.fullRpm?Math.round(r.fullRpm/100)*100+' rpm':tr('never'))+'</b> <span class="dim">('+tr('now')+' '
      +(now.fullRpm?Math.round(now.fullRpm/100)*100:tr('never'))+')</span>; '+tr('boost at peak power')+' '+fmt(r.boostPk,2)+' bar.');
    lines.push(tr('Shaft inertia')+' '+fmt(r.J*1e7,0)+' g·cm² <span class="dim">('+tr('from the compressor alone')+')</span>; '+tr('the compressor wheel lets go at')+' '+Math.round(r.nMax/1000)+'k rpm.');
  }
  lines.push('<span class="dim">'+tr('How many turbos, the VGT, the boost and the wastegate stay on the ENGINE tab.')+'</span>');
  pv('pbGuide').innerHTML=lines.map(l=>'<div>'+l+'</div>').join('');
  drawPartCurves('turbo',now,r);
}
// What the car's rear aero gives now (the kit's table, scaled by the class, or the fitted wing), and the car without it.
function rearAeroNow(){
  const V=vehicle,k=AERO_REAR[V.aeroRear]||AERO_REAR.none,now=V.wing?{clA:V.wing.clA,cdA:V.wing.cdA}:{clA:k.cl*V.aeroK,cdA:k.cd*V.area};
  return {now,clA0:V.clA-now.clA,cdA0:V.cdA-now.cdA,clF:V.clA*V.aeroBal};
}
function previewWing(){
  const p=partFromEditor('wing'),r=wingAero(p),A=rearAeroNow(),V=vehicle;
  partsUI.last={kind:'wing',p,now:A.now,r};
  const q=v=>0.5*AIR_RHO*v*v,v1=100/3.6,v2=200/3.6,clA=A.clA0+r.clA,cdA=A.cdA0+r.cdA,lines=[];
  lines.push(tr('This wing')+': ClA <b>'+fmt(r.clA,2)+' m²</b> · CdA <b>'+fmt(r.cdA,3)+' m²</b> <span class="dim">('+tr('the rear aero now')+': ClA '+fmt(A.now.clA,2)+', CdA '+fmt(A.now.cdA,3)+')</span>');
  lines.push(tr('Area')+' '+fmt(r.S,2)+' m², '+tr('aspect ratio')+' '+fmt(r.AR0,1)+(p.plate_mm>0?' <span class="dim">('+tr('with its end plates it works as')+' '+fmt(r.AR,1)+')</span>':'')
    +'; '+tr('lift coefficient')+' <b>'+fmt(r.CL,2)+'</b> '+tr('of')+' '+fmt(WING_CLMAX,1)+' '+tr('at the stall')+'.'
    +(r.stalled?' <b class="warn">'+tr('STALLED: past this angle the wing only adds drag. Less angle or less camber.')+'</b>':''));
  lines.push(tr('Downforce')+' <b>'+fmt(q(v1)*r.clA/G,0)+' kg</b> '+tr('at')+' 100 km/h, <b>'+fmt(q(v2)*r.clA/G,0)+' kg</b> '+tr('at')+' 200; '
    +tr('drag')+' '+fmt(q(v2)*r.cdA,0)+' N '+tr('at')+' 200 km/h (<b>'+fmt(q(v2)*r.cdA*v2/745.7,1)+' hp</b>): '
    +fmt(r.cdi/(r.cdi+r.cd0)*100,0)+'% '+tr('of it the price of the lift')+'. '+tr('Lift over drag')+' '+fmt(r.cdA>0?r.clA/r.cdA:0,1)+'.');
  lines.push(tr('The car with it')+': ClA <b>'+fmt(clA,2)+'</b>, CdA <b>'+fmt(cdA,2)+'</b> <span class="dim">('+tr('now')+' '+fmt(V.clA,2)+', '+fmt(V.cdA,2)+')</span>; '
    +fmt(clA>0?A.clF/clA*100:50,0)+'% '+tr('of the downforce on the front axle')+' <span class="dim">('+tr('now')+' '+fmt(V.aeroBal*100,0)+'%)</span>.');
  lines.push('<span class="dim">'+tr('The wing is taken in clean air, at the rear axle: the body ahead of it and its overhang are not modelled.')+'</span>');
  pv('pwGuide').innerHTML=lines.map(l=>'<div>'+l+'</div>').join('');
  drawWing(p,r);
}
// The wing's section at its angle with its two forces, and its lift against the angle, up to the stall.
function drawWing(p,r){
  const c=pv('pwCanvas');if(!c)return;
  const w=c.clientWidth||480,h=c.clientHeight||200,dpr=window.devicePixelRatio||1;
  c.width=Math.round(w*dpr);c.height=Math.round(h*dpr);
  const g=c.getContext('2d');g.setTransform(dpr,0,0,dpr,0,0);g.clearRect(0,0,w,h);
  // left: the section, nose to the right (the car drives to the right), hollow side down
  const cx=w*0.24,cy=h*0.42,len=Math.min(w*0.34,150),a=p.angle_deg*Math.PI/180,f=p.camber_pct/100;
  const P=(x,up)=>{const yc=-4*f*x*(1-x),t=0.6*(0.2969*Math.sqrt(x)-0.126*x-0.3516*x*x+0.2843*x*x*x-0.1036*x*x*x*x)*up;   // a 12% NACA thickness on the camber line
    const X=(0.5-x)*len,Y=(yc+t)*len;return [cx+X*Math.cos(a)+Y*Math.sin(a),cy+X*Math.sin(a)-Y*Math.cos(a)];};
  g.fillStyle=r.stalled?'#a44':'#6fc';g.beginPath();
  for(let i=0;i<=20;i++){const q=P(i/20,1);i?g.lineTo(q[0],q[1]):g.moveTo(q[0],q[1]);}
  for(let i=20;i>=0;i--){const q=P(i/20,-1);g.lineTo(q[0],q[1]);}
  g.closePath();g.fill();
  const arrow=(x0,y0,x1,y1,col)=>{g.strokeStyle=g.fillStyle=col;g.lineWidth=2;g.beginPath();g.moveTo(x0,y0);g.lineTo(x1,y1);g.stroke();
    const t=Math.atan2(y1-y0,x1-x0);g.beginPath();g.moveTo(x1,y1);g.lineTo(x1-7*Math.cos(t-0.4),y1-7*Math.sin(t-0.4));g.lineTo(x1-7*Math.cos(t+0.4),y1-7*Math.sin(t+0.4));g.closePath();g.fill();};
  const k=(h*0.42)/WING_CLMAX;
  if(r.CL>0)arrow(cx,cy+10,cx,cy+10+Math.max(8,r.CL*k),'#fa4');
  arrow(cx-len/2-6,cy,cx-len/2-6-Math.max(8,(r.cd0+r.cdi)*k*4),cy,'#c66');
  // right: lift coefficient against angle
  const L=w*0.56,R=w-12,T=14,B=h-22,aMax=PART_LIMITS.angle_deg[1],X=d=>L+d/aMax*(R-L),Y=cl=>B-cl/(WING_CLMAX*1.15)*(B-T);
  g.strokeStyle='#223';g.lineWidth=1;g.fillStyle='#667';g.font='8px monospace';
  for(let d=0;d<=aMax;d+=5){g.beginPath();g.moveTo(X(d),T);g.lineTo(X(d),B);g.stroke();g.fillText(d+'°',X(d)-6,h-8);}
  g.setLineDash([4,3]);g.strokeStyle='#a44';g.beginPath();g.moveTo(L,Y(WING_CLMAX));g.lineTo(R,Y(WING_CLMAX));g.stroke();g.setLineDash([]);
  g.strokeStyle='#6fc';g.lineWidth=2;g.beginPath();
  for(let d=0;d<=aMax;d+=0.5){const cl=wingAero(Object.assign({},p,{angle_deg:d})).CL;d?g.lineTo(X(d),Y(cl)):g.moveTo(X(d),Y(cl));}
  g.stroke();
  g.fillStyle='#fa4';g.beginPath();g.arc(X(p.angle_deg),Y(r.CL),4,0,7);g.fill();
  pv('pwLegend').innerHTML='<span style="color:#fa4">━ '+esc(tr('downforce'))+'</span> <span style="color:#c66">━ '+esc(tr('drag'))+'</span> <span style="color:#6fc">━ '+esc(tr('lift coefficient against angle'))+'</span> <span style="color:#a44">┅ '+esc(tr('stall'))+'</span>';
}
function drawPartCurves(kind,now,r){
  if(kind==='wing')return drawWing(partsUI.last.p,r);
  const U=PART_UI[kind],c=pv(U.canvas);if(!c)return;
  const w=c.clientWidth||480,h=c.clientHeight||200,dpr=window.devicePixelRatio||1;
  c.width=Math.round(w*dpr);c.height=Math.round(h*dpr);
  const g=c.getContext('2d');g.setTransform(dpr,0,0,dpr,0,0);g.clearRect(0,0,w,h);
  const L=34,R=w-34,T=12,B=h-20,rMax=engine.redline;
  const hpMax=Math.max(...now.pts.map(p=>p.hp),...r.pts.map(p=>p.hp))*1.1,tqMax=Math.max(...now.pts.map(p=>p.tq),...r.pts.map(p=>p.tq))*1.1;
  const X=rpm=>L+(rpm-1000)/(rMax-1000)*(R-L);
  g.strokeStyle='#223';g.lineWidth=1;g.fillStyle='#667';g.font='8px monospace';
  for(let rpm=1000;rpm<=rMax;rpm+=1000){g.beginPath();g.moveTo(X(rpm),T);g.lineTo(X(rpm),B);g.stroke();g.fillText(String(rpm/1000)+'k',X(rpm)-6,h-6);}
  const line=(pts,k,max,col,dash)=>{g.strokeStyle=col;g.lineWidth=dash?1.5:2;g.setLineDash(dash?[4,3]:[]);g.beginPath();
    pts.forEach((p,i)=>{const x=X(p.rpm),y=B-(p[k]/max)*(B-T);i?g.lineTo(x,y):g.moveTo(x,y);});g.stroke();g.setLineDash([]);};
  line(now.pts,'tq',tqMax,'#4a8',true);line(now.pts,'hp',hpMax,'#c84',true);
  line(r.pts,'tq',tqMax,'#6fc',false);line(r.pts,'hp',hpMax,'#fa4',false);
  g.fillStyle='#fa4';g.fillText('hp',R+4,T+8);g.fillStyle='#6fc';g.fillText('Nm',4,T+8);
  pv(U.legend).innerHTML='<span style="color:#fa4">━ '+esc(tr(kind==='intake'?'this intake':kind==='filter'?'this filter':kind==='cam'?'this cam':kind==='head'?'this head':kind==='turbo'?'this turbo':kind==='intercooler'?'this intercooler':'this exhaust'))+'</span> <span style="color:#c84">┅ '+esc(tr('now'))+'</span>';
}
function schedulePreview(){clearTimeout(partsUI.timer);partsUI.timer=setTimeout(()=>{if(vizMode==='parts')previewPart(partsUI.kind);},120);}
function wireParts(){
  loadParts();fillPartSelects();
  for(const [kind,U] of Object.entries(PART_UI)){
    U.fields.forEach(id=>{const el=pv(id);el.addEventListener('input',schedulePreview);el.addEventListener('change',schedulePreview);});
    pv(U.save).addEventListener('click',()=>savePart(kind));
    pv(U.saveFit).addEventListener('click',()=>{const p=savePart(kind);if(p)fitPart(p.id);});
    pv(U.neu).addEventListener('click',()=>newPartFrom(kind,pv(U.from).value));
    pv(U.reset).addEventListener('click',()=>resetPart(kind));
  }
  pv('ptCut').addEventListener('click',()=>{pv('ptPrimL').value=primaryFor(clamp(+pv('ptCutRpm').value||6000,1500,engine.redline));previewPart('exhaust');});
  pv('ptSize').addEventListener('click',()=>{const r=(engine.score&&engine.score.peakHPrpm)||engine.redline*0.9;pv('ptSysD').value=pipeFor(75,+pv('ptPipes').value,r);previewPart('exhaust');});
  pv('piCut').addEventListener('click',()=>{
    const want=clamp(+pv('piCutRpm').value||5000,1000,engine.redline);
    pv('piL').value=runnerFor(want,+pv('piD').value||portRunnerD(engine));previewPart('intake');
    const got=partsUI.last&&partsUI.last.r.ramPeakRpm;
    if(got&&Math.abs(got/want-1)>0.08)flash(tr('NO RUNNER FILLS BEST THERE ON THIS ENGINE: THE NEAREST IS SET'),'warn');
  });
  pv('pfSize').addEventListener('click',()=>{const r=filterReport(partFromEditor('filter'));pv('pfArea').value=+(r.Q/FILTER_FACE_V).toFixed(3);previewPart('filter');});
  pv('piMatch').addEventListener('click',()=>{pv('piD').value=+portRunnerD(engine).toFixed(1);previewPart('intake');});
  window.addEventListener('resize',()=>{if(vizMode==='parts'&&partsUI.last)drawPartCurves(partsUI.last.kind,partsUI.last.now,partsUI.last.r);});
}
