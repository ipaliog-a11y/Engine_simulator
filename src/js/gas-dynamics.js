// ================================================================================================
// PHYSICS CORE — GAS DYNAMICS
// ------------------------------------------------------------------------------------------------
// Third v1.0 conversion, and the one that retires the most fitted numbers at once:
//   CAM.peakShift   asserted where the powerband sat        -> falls out of intake runner length
//   CAM.scav        asserted top-end bonus per cam          -> falls out of overlap x header timing
//   EXHAUST.topGain asserted top-end bonus per exhaust      -> the SAME effect as camScav; both go
//   EXHAUST.lowLoss asserted low-end penalty per exhaust    -> falls out of back-pressure + reversion
//   CAM.lowLoss     asserted low-end penalty per cam        -> same
// topGain and scav had to go together. They were two knobs describing one physical event: the
// rarefaction that comes back up the primary from the collector and, if both valves happen to be
// open when it arrives, pulls residuals out and fresh charge in. Deriving either alone would have
// left the other double-counting it.
//
// Two different mechanisms, because they really are different:
//
// INTAKE is a HELMHOLTZ resonator during the induction event — the runner is the neck, the cylinder
// is the volume. This is the textbook treatment of intake tuning and the one with published
// experimental backing (Engelman; Ohata & Ishida), and it is NOT the same as a standing wave in a
// pipe. The resonator completes n_H = f_H·theta/(6N) cycles while the valve is open, and filling
// peaks when that lands on a whole number, because the resonator is then handing back a pressure
// peak exactly as the valve shuts.
//
// EXHAUST is a reflection comb. The blowdown pulse leaves at EVO, reflects off the collector as a
// rarefaction (an area expansion inverts it), and comes back. Useful arrival is during overlap,
// (theta_ex/2 + 90) crank degrees later. A 500 mm primary at 8000 rpm has a round trip of only 72
// crank degrees against that 232 degree window, so the wave necessarily bounces about three times
// on the way — k = 3 is the normal tuning order for a real header, and solving the relation for
// length at k = 3 gives the 450-550 mm primaries people actually build.
//
// Neither wave is a free bonus. Both swing BOTH WAYS: -cos(pi·n) is +1 at the tuned orders and -1
// between them, so a badly matched pipe costs VE, which is the real reason an over-sized header
// guts the bottom end.
// CP_EXH is the mean specific heat of the exhaust over the rise it is used for, 300 K to ~1100 K.
// Checked against composition (build 101): stoichiometric petrol products are N2 72%, CO2 20%, H2O 8% by
// mass, with mean cp over that range ~1.08, ~1.13 and ~2.08 kJ/kgK, which gives ~1.16. Lean, it tends to
// air's ~1.08. 1150 stands.
const GAMMA_AIR=1.4, CP_EXH=1150;
const sonic=T=>20.05*Math.sqrt(Math.max(120,T));         // sqrt(gamma·R·T), m/s
// Pressure at the valve is not VE. Trapped mass follows DENSITY, and a charge that arrives rammed
// has been slightly heated by the ramming, so the conversion is isentropic. This is why a +35%
// pressure spike is not a +35% VE.
const densFromP=dp=>Math.pow(Math.max(0.05,1+dp),1/GAMMA_AIR)-1;
// Exhaust gas temperature, derived from the energy balance instead of assumed. Whatever the fuel
// released that the cycle did not turn into work or hand to the coolant goes out of the port, so
// EGT responds to mixture, compression and load the way it really does — rich runs cool, lean runs
// hot, and a high-compression engine sends less heat down the pipe because it extracted more work.
// rpm and lambda are optional. Without rpm there is no late-burn heat (see burnPhasing); without
// lambda the mixture is the one a calibrated engine runs at this load.
function exhaustGasT(load,rpm,lambda){
  const e=engine;
  // Mixture at this load, not the live slider: full load runs rich for power and exhaust-temperature
  // control (lambda ~0.88), light load sits at stoich. A diesel is quality-governed and always lean,
  // which is exactly why diesel EGT is so much lower than petrol.
  const lam=lambda>0?lambda:e.ci?SMOKE_LAMBDA_CI+(2.25-SMOKE_LAMBDA_CI)*(1-clamp(load,0,1)):1-0.12*clamp(load,0,1);
  // Heat is released only by fuel that finds oxygen. Rich of stoichiometric the air runs out first,
  // and the excess leaves as CO and H2 — chemical energy, not heat — so the release is capped at the
  // stoichiometric amount. Without the cap a richer mixture came out HOTTER, the opposite of why a
  // turbo petrol ECU enriches under boost; it went unseen while this function was only ever called
  // at one assumed mixture per load.
  const afr=Math.max(6,(e.stoichAFR||14.7)*Math.max(1,lam));
  // The gas heated is the air AND the fuel burned in it (afr + 1); it was the air alone until build 101.
  const dT=(e.fuelLHV||44)*1e6/((afr+1)*CP_EXH)*exhaustHeatFrac(rpm,lam)*clamp(load,0.35,1.1);
  return 300+dT;
}
// Share of the fuel's heat (the heat RELEASED: rich of stoich it is capped, see exhaustGasT) that
// leaves through the exhaust port, at the mixture lam.
//
// For a poppet-valve engine this is the energy balance, closed (build 101):
//     exhaust = 1 - gross indicated work - heat to the cylinder walls - heat to the exhaust port
// with each term the model's own: the work from the same efficiency the torque uses (grossEtaReleased),
// the wall heat from Woschni over a traced cycle (wallTrace, tabulated by rpm), and the port from Caton
// & Heywood's exhaust-port correlation (portLossShare). It replaces "roughly a third" (0.40 - 0.24 eta,
// on a brake efficiency of 0.36 x crFactor), two hand-set rules that were checked against measured EGT
// while the wall split did not conserve energy (build 98).
//
// Ported engines keep the old rule for now: a rotary's and a two-stroke's work still rests on a fitted
// type factor, so a balance against it would only move the fit into the exhaust.
function exhaustHeatFrac(rpm,lam){
  const e=engine;
  if(e.ports||!e.wallTab){
    const eta=clamp(0.36*(e.crFactor||1),0.20,0.46);
    let f=clamp(0.40-0.24*eta,0.24,0.36);
    if(rpm>0)f+=eta*(1-burnPhasing(rpm));
    if(e.rotaryLost)f+=eta*e.rotaryLost;   // a rotary's slow burn: see rotaryLostWork
    return f;
  }
  const n=rpm>0?rpm:e.wallRefRpm, l=lam>0?lam:(e.ci?SMOKE_LAMBDA_CI:1);
  const f0=1-grossEtaReleased(n,l)-wallShareAt(n)-(e.ci?COMB_INEFF_CI:COMB_INEFF_SI);
  return clamp(f0-portLossShare(n,l,f0),0.05,0.80);
}
// Gross indicated work per unit of heat released, at speed n and mixture lam: what the torque path
// uses. Spark: 0.8 x fuel-air (sparkGrossImep) with its mixture curve, which is work per unit of AIR,
// so lean it is divided back by the fuel's share (x lam); rich the release is capped and it stands.
// Diesel: dieselGrossImep's efficiency, which is already per unit of fuel burned.
function grossEtaReleased(n,lam){
  const e=engine;
  if(e.ci)return ETA_GROSS_CI*otto(e.compression)/otto(CR_REF_CI)*faEta(1/lam)/faEta(1/LAMBDA_REF_CI)*burnPhasing(n)*wallImepFactor(n);
  return REAL_TO_FUELAIR*(1-Math.pow(Math.max(1.5,e.compression),1-GAMMA_FA))*(e.typeImep||1)*wallImepFactor(n)
        *sparkMixture(lam)*Math.max(1,lam);
}
// Heat to the cylinder walls at full load, as a share of the heat released, from the traced cycle.
function wallShareAt(rpm){
  const t=engine.wallTab;
  if(!t)return 0;
  const f=clamp(rpm/100,3,t.length-1.001),i=Math.floor(f);
  return t[i]+(t[i+1]-t[i])*(f-i);
}
// Heat to the exhaust port, as a share of the heat released. Caton & Heywood (Int. J. Heat Mass
// Transfer 24, 1981) measured it on a running engine and fitted Nu = 0.0483 Re^0.783, with Re on the
// mean flow while the valve is open. Port size from the head's own valves: exhaust valve heads 0.83 of
// the intake (the usual design ratio, Heywood ch. 5), the port bore its throat (THROAT_RATIO), and the
// port one bore long, valve seat to manifold face. The gas is at the temperature the balance before
// this term gives it; properties are air's (Sutherland viscosity, Pr 0.7), which the products are close
// to at these temperatures.
const EV_RATIO=0.83;
function portLossShare(n,lam,f0){
  const e=engine;
  if(!e.ivDia_mm)return 0;
  const nEx=Math.max(1,(e.valves||4)-e.ivCount), D=THROAT_RATIO*EV_RATIO*e.ivDia_mm/1000, L=e.bore_mm/1000;
  const st=e.stoichAFR||14.7, afr=st*Math.max(1,lam);
  const rho=(1+(e.intake==='na'?0:(e.boost_bar||0)))*1e5/(287*313);
  const air=rho*(e.dispCyl_L/1000)*(e.veAmp||0.95)*n/60*(e.chargesPerRev||0.5);   // kg/s per cylinder
  const open=clamp((e.camDur||240)/720,0.2,1), mdot=air*(1+1/afr)/open/nEx;         // per port, while open
  const Tg=300+(e.fuelLHV||44)*1e6*f0/((afr+1)*CP_EXH);
  const mu=1.716e-5*Math.pow(Tg/273,1.5)*(273+111)/(Tg+111), k=mu*CP_EXH/0.7;
  const Re=mdot/(Math.PI/4*D*D)*D/mu, h=0.0483*Math.pow(Re,0.783)*k/D;
  const q=h*Math.PI*D*L*nEx*(Tg-T_WALL)*open;                                       // W per cylinder
  return q/Math.max(1e-6,air/afr*(e.fuelLHV||44)*1e6);
}
// Share of the fuel's heat the walls take at this speed BEYOND what they take at the anchor speed
// (wallRefRpm): positive below it (a slow cycle gives the walls longer), negative above.
function wallHeatExtra(rpm){
  return engine.wallTab?wallShareAt(rpm)-engine.wallRefShare:0;
}
// What that heat costs the work depends on WHEN in the cycle the walls take it. A joule lost at crank
// angle theta, had it stayed in the gas, would have been expanded from V(theta) to exhaust-valve
// opening and earned 1 - (V/V_EVO)^(gamma-1) of itself as work; a joule lost after EVO, in blowdown or
// on the exhaust stroke, earns nothing and would only have left in the exhaust. So the work's share
// of the extra wall heat is the flux-weighted average of that, kappa (wallWorkShare), and
//     W = W_ref - kappa dQ_wall   ->   gross IMEP factor 1 - kappa dQ_wall / (eta_i Q_fuel)
// with the exhaust taking the other 1 - kappa (exhaustHeatFrac). Energy is conserved by construction.
// Normalised where each engine type's efficiency anchor was measured, so the anchor still holds there:
// a spark engine's 0.8 x fuel-air at the reference engines' rated speed (WALL_BSP_REF), a diesel's
// ETA_GROSS_CI at 2000 rpm on a passenger-car DI diesel (BURN_REF_RPM). Since build 101 the wall share at
// each speed is Woschni's own, traced (wallTrace), not a (B Sp)^-0.2 scaling about a reference.
// Cooled EGR (build 204) takes egrWall (negative) off the share at its full rate, in proportion at a lower one.
const wallImepFactor=(rpm,egr=0)=>engine.wallK>0&&engine.wallTab?1-engine.wallK*(wallHeatExtra(rpm)+(engine.egrMax>0?egr/engine.egrMax*engine.egrWall:0))/engine.wallEtaI:1;
const WALL_BSP_REF=1234;   // mm.m/s: bore x piston speed at rated power of the reference spark engines
// kappa, from one full-load cycle at the anchor speed: intake BDC -> compression -> Wiebe heat release
// (this model's own burn: SI_BURN_DEG / SI_CA50, or the diesel's fixed-time burn from SOC_CI) ->
// expansion -> EVO, then blowdown to exhaust pressure by BDC and the exhaust stroke at that state. The
// trace is the first law with ideal gas (gamma 1.3, the value wiebePhasingEff uses); the flux at each
// angle is Woschni's h (B^-0.2 p^0.8 T^-0.55 w^0.8, w = C1 Sp + C2 Vd T1/(p1 V1) (p - p_motored); C1 2.28
// closed, 6.18 gas exchange; C2 3.24e-3 burning and expanding, 0 compressing) times (T - T_wall) times
// the wall the gas touches (head and crown plus the liner above the piston). Woschni's constants and
// the 450 K wall are his published values; only the SHAPE of the flux matters here, so his 3.26 cancels.
function wallTrace(e,rpm,map,egr=0){
  const g=1.30,R=287,cv=R/(g-1),cr=e.compression,B=e.bore_mm/1000,S=e.stroke_mm/1000,Sp=2*S*rpm/60;
  // egr: the share of the charge that is cooled exhaust (build 204), at the intake's temperature: the same fuel in more gas
  const lam=e.ci?LAMBDA_REF_CI:0.9, q=(1-egr)*(e.fuelLHV||43)*1e6/(Math.max(1,lam)*(e.stoichAFR||14.7));   // J per kg of charge, released
  const burn=e.ci?6*rpm*BURN_T_CI:SI_BURN_DEG, soc=e.ci?SOC_CI:SI_CA50-wiebeX50()*SI_BURN_DEG;
  const evo=360-e.camLSA-e.camDur/2, Vt=th=>pistonVol(th,cr), Vevo=Vt(evo);
  const T1=330,p1=map*1e5,v1=R*T1/p1, Vd=Math.PI/4*B*B*S, hc=S/(cr-1), V1=Vd*cr/(cr-1), m=p1*V1/(R*T1);
  const xb=th=>th<=soc?0:1-Math.exp(-WIEBE_A*Math.pow(Math.min(1,(th-soc)/burn),WIEBE_M+1));
  // The wall the gas touches: the head, the piston crown and the liner above the piston. Neither end is a
  // flat disc. A pent-roof head's two faces sit square to the valve stems, so each is tilted by half the
  // included valve angle (~45 deg on a 4-valve head): 1/cos(22.5) = 1.08 of the bore area. A DI diesel's
  // head is flat, but its piston carries the combustion bowl, ~0.55 bore across and ~0.17 bore deep (the
  // usual proportions), whose side wall adds pi x 0.55 x 0.17 B^2.
  const disc=Math.PI/4*B*B, head=e.ci?disc:disc/Math.cos(SI_ROOF_DEG*Math.PI/180);
  const crown=e.ci?disc+Math.PI*0.55*0.17*B*B:disc;
  const area=V=>head+crown+Math.PI*B*hc*V;
  // Woschni's coefficient in W/m2K, with B in m, p in kPa, T in K, w in m/s: his published 3.26.
  const hW=(p,T,w)=>WOSCHNI_C*Math.pow(B,-0.2)*Math.pow(p/1000,0.8)*Math.pow(T,-0.55)*Math.pow(w,0.8);
  const d=0.5, dt=d/(6*Math.max(300,rpm));               // seconds per step
  let T=T1,num=0,den=0,pE=0,TE=0;
  for(let th=-180;th<evo;th+=d){                       // closed: compression, burn, expansion
    const V0=Vt(th),Vn=Vt(th+d),v0=v1*V0/cr,dv=v1*(Vn-V0)/cr;
    const p=R*T/v0, pm=p1*Math.pow(cr/V0,g), burning=th>=soc;
    const w=Math.max(0.1,2.28*Sp+(burning?3.24e-3*Vd*T1/(p1*V1)*(p-pm):0));
    const Q=hW(p,T,w)*area(V0)*(T-T_WALL)*dt;           // J lost this step
    num+=Q*(1-Math.pow(V0/Vevo,g-1));den+=Q;
    T+=(q*(xb(th+d)-xb(th))-p*dv-Q/m)/cv;
    pE=R*T/(v1*Vn/cr);TE=T;
  }
  const pX=Math.max(1.05e5,p1), TX=TE*Math.pow(pX/pE,(g-1)/g);
  for(let th=evo;th<360;th+=d){                        // blowdown to BDC, then the exhaust stroke
    const s=th<180?(th-evo)/Math.max(1,180-evo):1;
    const p=pE+(pX-pE)*s, T=TE+(TX-TE)*s;
    den+=hW(p,T,6.18*Sp)*area(Vt(th))*(T-T_WALL)*dt;
  }
  return {k:den>0?num/den:0, share:den/(m*q), Tres:TX};
}
const WOSCHNI_C=3.26, T_WALL=450, SI_ROOF_DEG=22.5;
// Fuel that leaves unburned (HC, CO, H2), as a share of what is supplied up to stoichiometric: Heywood
// fig. 3-9 puts a spark engine at 2-5% and a diesel near 2% when not rich. Midpoints. Rich of stoich the
// release is already capped (exhaustGasT); this is what is lost even with oxygen to spare.
const COMB_INEFF_SI=0.035, COMB_INEFF_CI=0.02;
const wallWorkShare=(e,rpm,map)=>wallTrace(e,rpm,map).k;
// EGT AT AN OPERATING POINT: its speed, its manifold pressure, and the mixture actually burned.
// Every steady-state reader goes through this, and so do the tests. Until build 88 the tests called
// exhaustGasT(1.0) — no rpm, an assumed mixture — which stopped being the number the engine used as
// soon as EGT gained its rpm terms, so they validated a temperature nothing ran at.
function egtAt(rpm,map,lambda){
  const lam=lambda>0?lambda:curAFR(rpm,map)/engine.stoichAFR;
  return exhaustGasT(clamp(map/Math.max(0.4,engine.mapMax),0.3,1.1),rpm,lam);
}
// The full-load mixture this hardware runs at: the factory ECU map where there is one (a turbo
// petrol enriches under boost precisely to hold this temperature down), the best-power mixture
// where the metering is mechanical, and never richer than a diesel's fuel floor.
function fullLoadLambda(rpm,map){
  let lam=engine.canAutoAFR?baseFuelLambda(rpm,map):bestPowerLambda();
  return engine.ci?Math.max(lam,dieselLambdaFloor(rpm)):lam;
}
// The hottest full-load point of the design, two ways (build 101):
//   · gas: the mass average, what the turbine works on and what its vanes are heated by. Metal is heated
//     through h ~ Re^0.8, weighted hard toward the high-flow blowdown, so its temperature follows the
//     mass average closely, and a creep limit is a metal temperature (VANE_T_LIMIT).
//   · probe: what a thermocouple reads (egtProbeRatio). A bead in cross-flow has h ~ Re^0.5 and reads
//     close to the TIME average, so measured full-load EGT figures are compared against this.
function peakEgts(){
  let gas=0,probe=0;
  for(let r=Math.max(1000,engine.idleRpmEff||800);r<=engine.redline;r+=100){
    const map=wotMapAt(r), T=egtAt(r,map,fullLoadLambda(r,map));
    gas=Math.max(gas,T);probe=Math.max(probe,T*egtProbeRatio(map,T));
  }
  return {gas,probe};
}
// WHAT A THERMOCOUPLE READS, against the temperature the energy balance gives (build 101).
// The balance gives the MASS-averaged exhaust temperature, the one that carries the enthalpy, and the
// turbine works on that. A probe in a pulsing exhaust reads close to the TIME average (Caton, SAE 820050,
// 1982), and the two differ because the hottest gas passes in the shortest time. Over one firing interval:
//   · blowdown: the valve opens on cylinder gas at p_EVO, and each parcel leaves at the cylinder's
//     temperature as it expands isentropically to manifold pressure. With x = p/p_exh, T = T_e x^k and
//     mass leaves as x^(1/gamma), so its mass average is T_e (r - 1)/(gamma (r^(1/gamma) - 1)), r = p_EVO/p_exh
//     (k + 1/gamma = 1 makes the integral exact). It carries 1 - r^(-1/gamma) of the gas, in the duty phi.
//   · displacement: the piston pushes out the rest at the expanded state T_e, for the remaining 1 - phi.
// So   T_mass  = T_e ((r - 1)/gamma + 1) / r^(1/gamma)
//      T_probe = T_e (phi (r - 1)/(gamma (r^(1/gamma) - 1)) + 1 - phi)
// phi and p_EVO as pulseShape has them (the cam's blowdown angle times the cylinders sharing the probe's
// pipe; p_EVO from the trapped charge at intake density), solved here on T_e. Manifold pressure is the
// full-load one: ~1.05 bar on an NA header, and near boost on a turbo, where a wastegated turbine holds
// it. Ported engines have no blowdown to time and read the mass average.
function egtProbeRatio(map,Tm){
  const e=engine;
  if(e.ports||!(e.camDur>0)||!(Tm>300))return 1;
  const share=e.intake==='turbo'?(e.turboConfig==='sequential'?(e.cylinders||1):(e.cylinders||1)/(e.turbUnits||1))
             :(e.layout==='inline'?(e.cylinders||1):(e.cylinders||1)/2);
  const phi=clamp(Math.max(10,e.camLSA+e.camDur/2-180)*share/720,0.02,1);
  if(phi>=1)return 1;                              // pulses merge: steady flow, the averages agree
  const g=GAMMA_EXH,k=K_EXH,pInt=Math.max(0.3,map||1),pExh=Math.max(1.05,pInt);
  let Te=Tm,ratio=1;
  for(let i=0;i<4;i++){
    const pEvo=Math.max(pExh*1.0001,Math.pow(pInt*(Te/313)*Math.pow(pExh,-k),1/(1-k))), r=pEvo/pExh, a=Math.pow(r,1/g);
    const mass=((r-1)/g+1)/a, blow=(r-1)/(g*(a-1));
    Te=Tm/mass;ratio=(phi*blow+1-phi)/mass;
  }
  return ratio;
}
// ---- intake: Helmholtz ----
// Q of an intake tract measured on a flow rig is 3-6. It sets how fast the resonance dies and
// therefore how much weaker each successive order is, so no separate order weighting is needed.
const Q_INTAKE=4.0;
const IVC_WINDOW=40;      // crank degrees over which the intake valve actually seats
const helmholtzHz=(A,L,V,T)=>sonic(T)/(2*Math.PI)*Math.sqrt(A/Math.max(1e-9,L*V));
// WHERE THE TUNING PEAK SITS. Engelman's tuned-intake experiments (the source of the vEffCyl formula
// above) put the main ram peak where the Helmholtz frequency is about TWICE the engine's rotational
// frequency: f_H / (N/60) ~ 2. A later SAE study measured 2.42 on its engine, inside his range.
// This model used to put the peak where exactly one oscillation fits in the intake event instead,
// f_H / (N/60) = 360/duration — 1.64 on the stock cam, 1.27 on the race cam — which tuned every
// runner 22-57% too high in rpm. That is why a 320 mm runner rang at the redline of every preset,
// and why removing the VE bell left their power peaking on the limiter (tests/proto/README.md).
// The ratio is published experiment, not a fit to these engines, and the headline value is used.
// It sets only the PHASE; the damping and the valve-window averaging below stay on the time the
// valve is actually open, because that is genuinely what sets them.
const ENGELMAN_K=2.0;
function intakeRamGain(rpm,chargeK){
  const e=engine;
  if(!e.runnerL||!e.ivDia_mm)return 0;
  const fH=helmholtzHz(e.runnerA,e.runnerL,e.vEffCyl,chargeK);
  const nH=fH*e.camDur/(6*Math.max(500,rpm));                    // oscillations while the valve is open
  const nT=fH/(ENGELMAN_K*Math.max(500,rpm)/60);                 // tuning order: 1 = Engelman's main peak
  const u=(2*(e.stroke_mm/1000)*rpm/60)*Math.pow(e.bore_mm/e.runnerD_mm,2);   // acoustic piston relation
  const A0=GAMMA_AIR*u/sonic(chargeK);
  const amp=A0*Math.exp(-Math.PI*nH/Q_INTAKE);
  // Trapping is not decided at a point: the valve takes IVC_WINDOW crank degrees to seat, and the
  // charge is being trapped throughout. Average the resonance over that.
  const dn=nH*IVC_WINDOW/Math.max(1,e.camDur);
  return densFromP(amp*aperture(dn)*Math.cos(2*Math.PI*(nT-Math.round(nT))));
}
// ---- intake: the charge's own momentum (build 121) ----
// The air in a runner has mass, so it does not stop when the piston does. It is drawn in through the
// stroke, is still moving at BDC, and keeps flowing in while the piston rises until the cylinder's
// pressure has stopped it; only then does the rising piston push charge back out, and only for what
// is left of the closing valve's window. That is why a race cam closes late, and why its engine makes
// power high: the faster it turns, the more of the late window the column fills.
// The model had the late-IVC loss as pure crank-slider geometry (everything displaced after BDC pushed
// back out: trappedFraction), repaid only by the tuned wave (intakeRamGain). The column's momentum,
// which grows with piston speed, was missing, so a long-duration cam lost the same charge at every
// speed: an LS7 trapped 77% at 6000 rpm and peaked 900 rpm early.
// Now the intake stroke is integrated from TDC (before it the exhaust valve takes the outflow) to IVC
// as a lumped column, valve and cylinder:
//     rho L du/dt = p0 - p_cyl - (rho/2) u|u| (A_r / A_v)^2 - R u        dm/dt = rho A_r u
// the runner's air (length L, area A_r) driven by the plenum against the cylinder; the valve curtain
// A_v = Cd n pi D lift(theta) (sin^2 lift, Cd 0.6) a Borda loss; the cylinder compressed and filled
// adiabatically. R damps the column to the Q a flow rig measures on an intake tract (Q_INTAKE): the
// same lumped column and cylinder are the Helmholtz resonator, so the tuning comes out of it too.
// The fresh charge at IVC over the displaced volume at plenum density is the fill. A cam phaser is
// set, at full load, where it fills best: the ECU's wide-open-throttle calibration.
// The curtain's discharge coefficient (build 122). It was a flat 0.6 at every lift, which cannot be squared
// with the mean inlet flow coefficient this model already takes from Taylor for the same valve (inletMachZ:
// Ci = min(0.42, 1.5 L/D), on the valve head's area): with the throat limiting at full lift, 0.6 averages
// barely 0.3 over the event. Now the coefficient is the one whose average over this cam's lift event, on the
// curtain-or-throat area, IS Taylor's Ci: one published figure for the valve, used the same way twice.
function intakeCd(){
  const e=engine,D=e.ivDia_mm,ref=Math.PI/4*D*D,N=90;
  let acc=0;
  for(let k=0;k<N;k++)acc+=valveFlowArea(D,e.ivLift_mm*Math.pow(Math.sin(Math.PI*(k+0.5)/N),2))/ref;
  return Math.min(0.42,1.5*(e.ivLift_mm/D))/Math.max(1e-6,acc/N);
}
// Build 122: the charge is HEATED as it is drawn in, by the first law in the cylinder:
//     d(m cv T) = cp T_in dm_in + cp T dm_out - p dV + h A (T_wall - T) dt
// It starts as the residual the exhaust stroke left in the clearance volume, at the temperature the cycle
// trace gives it after blowdown (wallTrace, Tres: ~1000 K at full load), and mixes with the fresh air; the
// walls it touches (head, crown, the liner above the piston) at Woschni's 450 K, his gas-exchange flux
// (C1 6.18). A warmer charge holds less mass at the same pressure, and the hot residual's volume is space the
// fresh air does not get. Until build 122 the cylinder filled adiabatically with plenum-temperature air, and a
// flat 0.95 ceiling (veAmp) with a fitted cam bonus (CAM.ampMul, +4% sport, +8% race) stood in for all of it.
function intakeFill(rpm,adv,L,Tres,Cd){
  const e=engine,dur=e.camDur,abd=ivcAbdc(dur,e.camLSA,adv);
  Cd=Cd||intakeCd();
  const thO=180+abd-dur,th1=180+abd,th0=Math.max(0,thO);
  const B=e.bore_mm/1000,Vd=Math.PI/4*B*B*e.stroke_mm/1000,vc=2/Math.max(1.5,e.compression-1);
  const V=th=>Vd*(pistonX(th,1,ROD_STROKE*2)+vc)/2;
  const R=287,cv=R/(GAMMA_AIR-1),cp=cv+R,p0=101325,T0=313,rho0=p0/(R*T0),Ar=e.runnerA;
  const dth=0.25,dt=dth*Math.PI/180/(rpm*2*Math.PI/60),Sp=2*e.stroke_mm/1000*rpm/60;
  const disc=Math.PI/4*B*B,ends=disc*(e.ci?2+4*0.55*0.17:1+1/Math.cos(SI_ROOF_DEG*Math.PI/180));
  const cR=2*Math.PI*helmholtzHz(Ar,L,e.vEffCyl,T0)*rho0*L/Q_INTAKE, a=rho0*L/dt+cR;
  const Tr=Tres>0?Tres:T0;
  let T=Tr,m=p0*V(th0)/(R*Tr),u=0;const m0=m;
  for(let th=th0;th<th1;th+=dth){
    const Av=Cd*e.ivCount*valveFlowArea(e.ivDia_mm,e.ivLift_mm*Math.pow(Math.sin(Math.PI*(th-thO)/dur),2))*1e-6;
    const Vc=V(th),pc=m*R*T/Vc,k=0.5*rho0*Math.pow(Ar/Math.max(1e-9,Av),2);
    const rhs=p0-pc+rho0*L/dt*u;   // implicit in u: k u|u| + a u = rhs
    u=rhs>=0?(-a+Math.sqrt(a*a+4*k*rhs))/(2*k):(a-Math.sqrt(a*a-4*k*rhs))/(2*k);
    const dm=(u>0?rho0:m/Vc)*Ar*u*dt, dV=V(th+dth)-Vc;
    const h=WOSCHNI_C*Math.pow(B,-0.2)*Math.pow(pc/1000,0.8)*Math.pow(T,-0.55)*Math.pow(6.18*Sp,0.8);
    const Q=h*(ends+4*Vc/B)*(T_WALL-T)*dt;
    const U=cv*m*T+cp*(u>0?T0:T)*dm-pc*dV+Q;
    m+=dm;T=U/(cv*m);
  }
  return (m-m0)/(rho0*Vd);
}
// Tabulated per engine: the best of the cam phaser's range and of a variable runner's two lengths.
function buildFillTable(){
  const e=engine;e.fillTable=null;
  if(!e.ivDia_mm||!e.runnerL||!(e.runnerA>0))return;
  const Cd=intakeCd();e.intakeCd=Cd;
  const tb=[],lo=800,hi=e.redline+500,lens=e.runnerVariable?[e.runnerL,e.runnerLShort]:[e.runnerL];
  for(let r=lo;r<=hi;r+=250){
    let f=0,best=0,bestL=lens[0];
    const Tres=wallTrace(e,r,1).Tres;
    const auth=e.vvt?((CAM[e.cam]||CAM.stock).vvtMax??VVT_AUTHORITY):0;   // an Atkinson cam's phaser is shorter (build 188)
    for(const L of lens)for(let adv=0;adv<=auth;adv+=5){
      const x=intakeFill(r,adv,L,Tres,Cd);if(x>f){f=x;best=adv;bestL=L;}
    }
    tb.push({rpm:r,f,adv:best,L:bestL});
  }
  e.fillTable=tb;
}
// The intake phaser's advance at this rpm, as the fill table chose it (0 without VVT: the table never advances)
function camAdvAt(rpm){
  const tb=engine.fillTable;if(!tb||!engine.vvt)return 0;
  if(rpm<=tb[0].rpm)return tb[0].adv;
  for(let i=1;i<tb.length;i++)if(rpm<=tb[i].rpm){const a=tb[i-1],b=tb[i];return a.adv+(b.adv-a.adv)*(rpm-a.rpm)/(b.rpm-a.rpm);}
  return tb[tb.length-1].adv;
}
// Where the intake valve closes at full load, crank degrees after BDC: the phase the table chose (build 134).
function ivcAt(rpm){
  const e=engine;if(!e.fillTable)return null;
  return ivcAbdc(e.camDur,e.camLSA,camAdvAt(rpm));
}
function fillAt(rpm){
  const tb=engine.fillTable;if(!tb)return 1;
  if(rpm<=tb[0].rpm)return tb[0].f;
  for(let i=1;i<tb.length;i++)if(rpm<=tb[i].rpm){const a=tb[i-1],b=tb[i];return a.f+(b.f-a.f)*(rpm-a.rpm)/(b.rpm-a.rpm);}
  return tb[tb.length-1].f;
}
// Both waves were being sampled at a single INSTANT, and neither valve event is an instant. The
// pressure the cylinder actually sees is the wave averaged over the window the valve is open for,
// and averaging a cosine over a window of width dn multiplies it by sinc(pi·dn/2). This damps fast
// oscillations far more than slow ones, which is the correct behaviour and needs no new constant:
// it comes from the same crank angles the rest of the model already uses. It is also why wave
// effects fade at low rpm — a fixed crank window is a longer wave window when the engine is slow.
// Leaving it out let the ram and scavenge troughs coincide at 6000 rpm on the ITB screamer and dig
// a 15% hole in the VE curve, and pinned VE against its 1.2 clamp from 7500 rpm up.
const aperture=dn=>{
  const x=Math.PI*Math.abs(dn)/2;
  return x<1e-6?1:Math.sin(x)/x;
};
// ---- exhaust: reflection comb, then what the suction actually drags through ----
// Amplitude lost per metre of pipe to the viscous and thermal boundary layers (Kirchhoff):
//     alpha = sqrt(omega nu / 2) (1 + (gamma - 1)/sqrt(Pr)) / (r c)
// for a pipe of radius r, the gas at T (nu from Sutherland's viscosity, Pr 0.7, gamma 1.35 for exhaust),
// at the frequency of one round trip of the pipe, c/2L. Build 116: this was EX_ALPHA, a flat 0.35 per
// metre, ~20x what the boundary layers take from a 48 mm primary at 1000 K, so a tuned header's
// suction pulse was gone after a couple of round trips and no header could scavenge.
function exAlpha(T,r,L){
  const c=sonic(T),mu=1.716e-5*Math.pow(T/273,1.5)*(273+111)/(T+111),nu=mu/(101325/(287*T));
  const w=Math.PI*c/Math.max(0.05,L);
  return Math.sqrt(w*nu/2)*(1+0.35/Math.sqrt(0.7))/(Math.max(0.005,r)*c);
}
const EX_ROPEN=0.88;    // amplitude reflected at an open end; the rest radiates away as noise
const OVERLAP_CD=0.6;   // discharge coefficient of a valve curtain at low lift (Heywood)
// Mean over the overlap window of the smaller of the two valves' lifts, as a share of full lift: the
// intake opening from IVO, the exhaust closing to EVC, each ~ sin^2 over its own duration.
function overlapLiftShare(ov,dur){
  if(!(ov>0)||!(dur>0))return 0;
  let acc=0;const N=24;
  for(let k=0;k<N;k++){const ph=(k+0.5)/N*ov;
    acc+=Math.min(Math.pow(Math.sin(Math.PI*ph/dur),2),Math.pow(Math.sin(Math.PI*(ov-ph)/dur),2));}
  return acc/N;
}
const overlapDeg=(dur,lsa)=>dur-2*lsa;                   // symmetric in/ex duration
function exhaustWaveP(rpm,T){
  const e=engine;
  if(!e.primL)return 0;
  const n=(e.camDur/2+90)*sonic(T)/(12*Math.max(500,rpm)*e.primL);
  const vel=(e.dispCyl_L/1000)*(T/320)*(rpm/60*(e.chargesPerRev||0.5))/(Math.PI/4*e.primD*e.primD)*3;
  const A0=GAMMA_AIR*vel/sonic(T);
  const damp=Math.exp(-exAlpha(T,e.primD/2,e.primL)*2*e.primL*n)*Math.pow(EX_ROPEN,n)
            *Math.exp(-Math.pow(Math.PI*n*e.exhSigma,2)/2);
  // A turbine housing is a RESTRICTION, not an open end, so it reflects a compression instead of a
  // rarefaction. That is why turbo engines scavenge so poorly and are built with little overlap.
  const sign=e.intake==='turbo'?+1:-1;
  // The wave acts across the whole overlap window, not at TDC alone. Over that window the phase
  // advances by dn, so the cylinder sees the average, not the peak.
  const dn=n*Math.max(0,e.overlap)/Math.max(1,e.camDur/2+90);
  return A0*damp*aperture(dn)*sign*Math.cos(Math.PI*n);
}
// The returning suction pulls charge through the small curtain the valves have open near TDC, for
// as long as the overlap lasts. Measured against the cylinder's own volume, that is a VE bonus —
// or, if a compression comes back instead, reversion pushing burnt gas the wrong way.
function scavengeGain(rpm,T){
  const e=engine;
  if(!e.overlap||e.overlap<=0)return 0;
  // The pressure driving flow across the overlap window is the difference between the intake port
  // and the exhaust port, and the exhaust port does not sit at atmosphere — it sits at atmosphere
  // plus back-pressure, with the wave on top. Leaving the steady term out was an omission, and it
  // is the one that makes a big cam undriveable down low: at 1500 rpm the wave has nothing to give,
  // so all that is left is a small adverse pressure acting through a long overlap window, pushing
  // burnt gas back up the inlet. That is reversion, it is why a race cam lopes and will not pull
  // from idle, and it scales with overlap and with 1/N exactly as the lore says it does.
  // And the intake port does not sit at atmosphere either on a boosted engine: it sits at the boost.
  // Until build 116 that side was left out, so a turbo engine at 1.3 bar of boost, its turbine holding
  // a similar pressure in the exhaust manifold, read as 1.3 bar of reverse flow across the overlap and
  // lost a quarter of its charge (an Evo IX made 242 hp of its 286).
  const dp=Math.max(0,(e.boostNow||1)-1)+exhaustWaveP(rpm,T)-backPressureBar(rpm,T);
  if(!dp)return 0;
  const u=Math.sign(dp)*Math.sqrt(2*Math.abs(dp)*101325/1.15);
  // The gap the gas crosses: through the overlap window the intake valve is opening and the exhaust
  // closing, and flow is held to the smaller curtain of the two. With each valve's lift ~ Lmax sin^2
  // over its duration (Lmax = D/4), its mean over the window is overlapLiftShare x Lmax, set by the cam
  // alone; a discharge coefficient of 0.6 is a curtain's at low lift (Heywood). Build 116: this was
  // OVERLAP_LIFT, a fixed 15% of full lift held across the whole window on every cam, which is about
  // a 72-degree race cam's lift AT TDC: four times a 32-degree road cam's, and it never averaged down.
  const lift=overlapLiftShare(e.overlap,e.camDur)*0.25*e.ivDia_mm;
  const A=OVERLAP_CD*e.ivCount*Math.PI*(e.ivDia_mm/1000)*(lift/1000);
  // What crosses with the pressure behind it can do no more than sweep the residual out of the
  // clearance volume and fill it with fresh charge: Vc/Vd = 1/(CR-1). Anything more blows straight
  // through to the exhaust and is not trapped. (It was a flat +25% cap.)
  return clamp(A*u*(e.overlap/(6*Math.max(500,rpm)))/(e.dispCyl_L/1000),-0.25,1/Math.max(2,e.compression-1));
}
// Back-pressure: Darcy-Weisbach down the primary at the velocity actually flowing, plus everything
// after the collector, plus the cat as a porous plug. Raises the pressure the piston works against
// AND leaves more residual in the cylinder, both of which cost VE.
function backPressureBar(rpm,T){
  const e=engine;
  if(!e.primL)return 0;
  const rho=101325/(287*Math.max(300,T));
  const vP=(e.dispCyl_L/1000)*(T/320)*(rpm/60*(e.chargesPerRev||0.5))/(Math.PI/4*e.primD*e.primD)*3;
  const m3s=(e.dispCyl_L/1000)*(T/320)*e.cylinders*(rpm/60*(e.chargesPerRev||0.5))/(e.sysPipes||1);
  const vS=m3s/(Math.PI/4*e.sysD*e.sysD);
  const pipe=(0.02*(e.primL/e.primD)*0.5*rho*vP*vP
             +0.02*(e.sysL/e.sysD)*0.5*rho*vS*vS
             +e.catRestrict*0.5*rho*vS*vS*350)/1e5;
  // On a boosted engine the pipe is not what the piston is pushing against — the TURBINE is. It
  // sits upstream of all of it and restricts far harder, so manifold pressure is set there and the
  // pipe is a small addition downstream of it. Modelling only the pipe left every turbo engine in
  // this app missing most of its back-pressure, and therefore most of its residual-gas VE loss.
  if(e.turbineArea>0){
    const map=Math.max(1,e.boostNow||1);
    const mAir=(e.dispCyl_L/1000)*e.cylinders*(rpm/60*(e.chargesPerRev||0.5))*(101325*map/(287*313));
    const u=unitsAt(rpm), mEx=mAir*1.06/u, mA=mAir/u;
    // On a VGT the throat is whatever the vanes have been scheduled to; below target they are shut
    // and the piston pays the full nozzle pressure for it, which is the whole point of the device.
    //
    // The gate stays in the loop at the OPEN end. It was blamed on the throat convention (the throat
    // taken at the wheel's radius, 1.5-1.8x too small); build 133 takes it at the volute centroid,
    // and the presets' open rings still have power to spare from mid-range, so the surplus is still
    // dumped exactly as a fixed frame's is. A real VGT needs no gate because its ring, sized for the
    // engine, swallows the lot: these rings are the size class's, not the maker's.
    return pipe+(manifoldPR(mA,mEx,map,T,turbineThroatAt(rpm,map,T),e.compEff,compFlowFrac(rpm,mAir))-1);
  }
  return pipe;
}
// ---- SEQUENTIAL turbos: one turbine down low, two up top ----
// A sequential pair (2JZ-GTE, 13B-REW) runs on its primary alone for early spool and brings the
// secondary in once one turbine would choke the exhaust. Until build 94 'sequential' was modelled as a
// single turbine for all the exhaust, with only a compressor-flow multiplier, which cost nothing while
// the turbine had a constant efficiency — and 1.58 x boost in back-pressure once it did not. WHERE it
// stages is a control law, and it is derived rather than asserted: at the lowest speed at which the
// pair can hold the boost target. Below it the primary alone holds boost and spools sooner; above it,
// two throats halve the back-pressure for the same boost.
function unitsAt(rpm){
  const e=engine;
  if(e.turboConfig==='sequential')return rpm>=e.seqStageRpm?2:1;
  return e.turbUnits||1;
}
// Where a compressor sits on its map: the flow through ONE active wheel over ONE wheel's choke flow.
function compFlowFrac(rpm,mAirTotal){
  const e=engine;
  return (mAirTotal/unitsAt(rpm))/Math.max(1e-9,e.chokeFlow_kgs/(e.turbUnits||1));
}
// The turbine throat in use at an operating point: fixed, or wherever the vanes are scheduled.
function turbineThroatAt(rpm,map,T){
  const e=engine;
  if(!(e.vgtShut>0))return e.turbineArea;
  const mAir=(e.dispCyl_L/1000)*e.cylinders*(rpm/60*(e.chargesPerRev||0.5))*(101325*Math.max(1,map)/(287*313));
  const u=unitsAt(rpm), mEx=mAir*1.06/u, mA=mAir/u;
  const Ut=turbineTipFor(1+boostTarget(rpm),compFlowFrac(rpm,mAir),298);
  return vgtThroat(mEx,compPowerAt(mA,1+boostTarget(rpm),313,e.compEff),T,e.turbineArea,e.vgtShut,map,Ut).area;
}
// ---- late intake valve closing: why a big cam guts the bottom end ----
// This is what CAM.lowLoss was standing in for, and it is pure geometry. A cam does not close the
// intake valve at BDC — it closes it well after, by which time the piston is already back up the
// bore on the compression stroke. At low rpm the charge has all the time it needs to be pushed
// straight back out of the still-open valve, so what gets trapped is the volume at IVC, not the
// volume at BDC. At high rpm the gas column's own inertia keeps it coming in and the loss is repaid
// — which is exactly the ram term above, and exactly why VVT exists.
//   trapped fraction = V(IVC) / V(BDC), from the crank-slider the engine already has
// WHERE IVC IS. The model defines overlap as dur - 2*lsa, and that fixes the convention: each lobe
// centre sits lsa degrees from TDC, so the intake closes at lsa + dur/2 after TDC, which is
//     IVC = lsa + dur/2 - 180   degrees after BDC.
// This used to take the lobe centre at 90 degrees ATDC instead (IVC = dur/2 - 90), contradicting the
// overlap calculation three lines from where it is called. That closed every intake 16-24 degrees
// early: stock 20 instead of 44 ABDC, race 52 instead of 68 — and a real B6 MX-5 closes at 51. It
// understated low-rpm backflow on every engine, and the fitted VE bell's low side was covering for
// it. A phaser ADVANCES the whole lobe, so it moves IVC by its full authority — not half of it, which
// is what subtracting it from duration did.
const ROD_STROKE=1.7;
const VVT_AUTHORITY=45;   // crank degrees an intake cam phaser can advance the cam
function pistonX(thetaDeg,r,l){
  const t=thetaDeg*Math.PI/180;
  return r*(1-Math.cos(t))+l-Math.sqrt(Math.max(0,l*l-r*r*Math.sin(t)*Math.sin(t)));
}
const ivcAbdc=(dur,lsa,advance)=>Math.max(0,lsa+dur/2-180-(advance||0));
function trappedFraction(dur,lsa,cr,advance){
  const r=1,l=ROD_STROKE*2;                       // rod/crank from rod/stroke
  const abd=ivcAbdc(dur,lsa,advance);
  const vc=2/Math.max(1.5,cr-1);                  // clearance volume in the same units as x
  return (pistonX(180+abd,r,l)+vc)/(pistonX(180,r,l)+vc);
}
// ---- the turbine, as a nozzle ----
// A turbine is a restriction of fixed effective area: exhaust cannot leave the manifold except
// through it, so manifold pressure rises until the flow fits. Expansion ratio therefore comes from
// MASS FLOW AND AREA, not from whatever the compressor happens to be doing.
//
// Getting this wrong makes spool impossible by construction. Setting the turbine's expansion equal
// to the compressor's pressure ratio means a slow shaft gets no expansion, so no power, so it stays
// slow — a turbo could never start from rest. Even a stationary shaft has full manifold pressure
// available to turn it.
//
// Throat area from the A/R definition: A/R is the volute throat area over the radius to its
// centroid, so A_throat = (A/R) x R_wheel. No fudge factor — it is what the spec means.
const GAMMA_EXH=1.33;
const CRIT_RATIO=Math.pow(2/(GAMMA_EXH+1),GAMMA_EXH/(GAMMA_EXH-1));      // ~0.54
const TURB_ETA=0.70;       // turbine total-to-static efficiency; typical for an automotive radial
function nozzleFlux(prT){
  const rp=1/Math.max(1.0001,prT);
  if(rp<=CRIT_RATIO)
    return Math.sqrt(GAMMA_EXH/287)*Math.pow(2/(GAMMA_EXH+1),(GAMMA_EXH+1)/(2*(GAMMA_EXH-1)));
  return Math.sqrt(2*GAMMA_EXH/(287*(GAMMA_EXH-1))
    *(Math.pow(rp,2/GAMMA_EXH)-Math.pow(rp,(GAMMA_EXH+1)/GAMMA_EXH)));
}
// Manifold pressure ratio that passes mdot through the throat. Bracketed, so it cannot silently
// return a floor value the way an unbracketed solver does.
// Called several times per turbine evaluation since pulse energy (each pulse state is its own nozzle
// solve), so it is solved rather than bisected blindly. Choked, the flux is a constant and PR has a
// closed form; below choke, flow rises monotonically with PR, so a Newton step kept inside a
// shrinking bracket converges in a few iterations to the same root the old 60-step bisection found.
const CHOKED_FLUX=Math.sqrt(GAMMA_EXH/287)*Math.pow(2/(GAMMA_EXH+1),(GAMMA_EXH+1)/(2*(GAMMA_EXH-1)));
function turbineManifoldPR(mdot,area,T0){
  if(!(area>0)||!(mdot>0))return 1;
  const k=area*101325/Math.sqrt(Math.max(300,T0));
  const f=pr=>k*pr*nozzleFlux(pr)-mdot;
  let lo=1.0001,hi=8;
  if(f(hi)<0)return hi;
  if(f(lo)>0)return 1;
  const prChoked=mdot/(k*CHOKED_FLUX);
  if(prChoked>=1/CRIT_RATIO)return Math.min(hi,prChoked);
  hi=Math.min(hi,1/CRIT_RATIO);
  let x=Math.min(hi,Math.max(lo,prChoked));
  for(let i=0;i<30;i++){
    const fx=f(x);
    if(fx<0)lo=x;else hi=x;
    if(Math.abs(fx)<=mdot*1e-10||hi-lo<1e-12)break;
    const d=(f(x+1e-7)-fx)/1e-7;
    let xn=d>0?x-fx/d:(lo+hi)/2;
    if(!(xn>lo&&xn<hi))xn=(lo+hi)/2;          // keep the step inside the bracket
    x=xn;
  }
  return x;
}
// A turbine on its own would let manifold pressure run away — routing every gram of exhaust through
// a fixed throat gave 3.5-4.5 bar on the presets, against a real 0.5-1.5. What stops that is the
// WASTEGATE, and leaving it out is not a small omission: holding boost is the gate's entire job.
//
// The steady state is a power balance. The turbine only has to supply what the compressor draws;
// once it can supply more, the gate opens and dumps the surplus around it. Both paths see the same
// manifold pressure, so:
//     find PR such that  P_turbine(PR) = P_compressor
// and whatever exhaust the turbine does not swallow at that PR goes out of the gate. If the turbine
// cannot reach that power even swallowing everything, the gate stays shut, the engine is below its
// boost target, and manifold pressure is simply the nozzle solution for the full flow.
// ---- exhaust PULSE energy: the turbine is fed by blowdowns, not by a mean pressure ----
// The turbine here is a nozzle fed by the MEAN manifold flow. A real one is fed by each cylinder's
// blowdown pulse: a large share of the gas leaves in a short burst at high pressure, and nozzle work
// rises with pressure ratio, so the same mass does more work arriving in bursts than arriving
// steadily. Averaging that away under-credits the turbine exactly where it matters: at low flow,
// near the boost threshold. It is why turbine housing sizing could not find a housing that spooled
// early without choking the top end (tests/proto/housing.mjs, pulse.mjs).
//
// Two states over each firing interval, defined by MASS, so mass is conserved by construction and
// neither state can fall below ambient:
//   · BLOWDOWN carries the share f_b of the gas, in the duty phi of the interval;
//   · DISPLACEMENT, the piston pushing out the rest, carries 1 - f_b in the remaining 1 - phi.
// Each state's manifold pressure is simply the nozzle solution for its own flow rate. Nothing fitted:
//   · phi, from cam geometry. Overlap is dur - 2 lsa, so the exhaust valve cracks lsa + dur/2 BTDC and
//     blowdown runs from there to BDC: lsa + dur/2 - 180 crank degrees (44 on a stock cam), times the
//     cylinders sharing one turbine, over 720. When a scroll's pulses overlap (phi -> 1) they merge
//     into steady flow — which is why divided manifolds exist.
//   · f_b, from the cylinder at exhaust-valve opening. It still holds the trapped charge at about
//     intake density, so p_EVO ~ p_int T_EVO/T_int, and blowdown expands it isentropically to manifold
//     pressure, T3 = T_EVO (p_exh/p_EVO)^k. Together p_EVO^(1-k) = p_int (T3/T_int) p_exh^(-k), and the
//     gas left behind is (p_exh/p_EVO)^(1/gamma) of the charge. (The prototype assumed 0.5.)
//   · how much of the pulse SURVIVES to the turbine, from volumes: the manifold is a capacitance, and
//     a blowdown of volume V_b (at manifold conditions) into a manifold of volume V_m keeps the share
//     V_b/(V_b+V_m) of its excess. A tight manifold delivers the pulse; a big plenum smooths it to
//     the mean — constant-pressure turbocharging, which large marine diesels choose on purpose.
// Ported engines (rotary, two-stroke) have no cam to time a blowdown from, and are left on the mean.
const K_EXH=(GAMMA_EXH-1)/GAMMA_EXH;
// Specific work at a pressure ratio. With the turbine's tip speed Ut known, efficiency follows the
// BLADE SPEED RATIO U/C — tip speed over the isentropic jet speed C = sqrt(2 cp T3 (1 - PR^-k)). A
// radial turbine peaks near U/C = 0.7 and falls off either side, eta/eta_max = 2x - x^2 with
// x = (U/C)/0.7 (Watson & Janota). So eta C^2/2 = eta_max (Ut C/0.7 - Ut^2/0.98): a shaft spun
// faster than its gas can drive extracts nothing (floored at zero; it windmills).
// This is what was missing at the top end. With a constant efficiency, a wastegated turbine at high
// flow made its compressor's power from a tiny expansion — manifold pressure came out BELOW boost —
// so nothing rolled a turbo engine off before its limiter and `turboChoke` was fitted to do it. At
// high flow with the gate open, C is small while the shaft still spins fast enough to hold boost:
// U/C rises, efficiency falls, and back-pressure has to rise to make up the work.
const UC_OPT=0.7;
function turbineWorkMean(pr,T3,Ut){
  const iso=CP_EXH*Math.max(300,T3)*(1-Math.pow(Math.max(1.0001,pr),-K_EXH));   // C^2/2
  if(!(Ut>0))return TURB_ETA*iso;
  const C=Math.sqrt(2*iso);
  return Math.max(0,TURB_ETA*(Ut*C/UC_OPT-Ut*Ut/(2*UC_OPT*UC_OPT)));
}
// Turbine tip speed at the shaft speed the compressor needs for a pressure ratio at a flow — Euler's
// relation inverted, on the frame's own efficiency island. For the steady solves, where the shaft
// speed is not integrated but implied by the boost being held.
function turbineTipFor(pr,flowFrac,T01){
  const e=engine;
  if(!(e.compExd>0)||!(pr>1))return 0;
  const eta=compIslandEff(flowFrac,pr), Uc=Math.sqrt(1005*Math.max(200,T01)*(Math.pow(pr,0.286)-1)/(COMP_SLIP*eta));
  return TURB_WHEEL*Uc;
}
function pulseShape(mEx,area,T3,mapBar,prMean){
  const e=engine;
  if(e.ports||!(e.primL>0)||!(e.camDur>0))return null;
  const perTurbine=e.turboConfig==='sequential'?(e.cylinders||1):(e.cylinders||1)/(e.turbUnits||1);   // a sequential pair shares one manifold
  const phi=clamp(Math.max(10,e.camLSA+e.camDur/2-180)*perTurbine/720,0.02,1);
  if(phi>=1)return null;
  const T=Math.max(300,T3), Tint=313, pInt=Math.max(0.3,mapBar||1);
  const pExh=Math.max(1.0001,prMean>0?prMean:turbineManifoldPR(mEx,area,T));
  const pEvo=Math.max(pExh,Math.pow(pInt*(T/Tint)*Math.pow(pExh,-K_EXH),1/(1-K_EXH)));
  const fb=clamp(1-Math.pow(pExh/pEvo,1/GAMMA_EXH),0,1);
  const vCyl=(e.displacement_L/1000)/Math.max(1,e.cylinders);
  const vB=(pInt/pExh)*(T/Tint)*vCyl*(e.veAmp||0.95)*fb;       // one blowdown, at manifold conditions
  const vMan=Math.PI/4*e.primD*e.primD*e.primL*perTurbine;
  return {phi,fb,keep:vB/(vB+vMan),pExh};
}
// Turbine power (W) passing mEx through a throat, pulses included, and the mean manifold PR.
// prMean, when the caller already has it (the nozzle PR that passes exactly mEx), saves a solve.
// A vane ring pays for itself in efficiency (build 168): its vanes need running clearance at their ends, and the gas
// leaking through it and the vanes' own profile losses cost a VGT about 2 points against a fixed nozzle (Jiang et
// al. 2024, review), ~1 point as the vanes open and ~5 as they close (Gao et al. 2018, end-clearance leakage). So
// 5 points shut, 1 open, linear in the vane position between.
const VGT_LOSS_SHUT=0.05, VGT_LOSS_OPEN=0.01;
function vgtEtaFactor(area){
  const e=engine;if(!(e.vgtShut>0)||!(area>0))return 1;
  const f=clamp((area-e.vgtShut)/Math.max(1e-12,e.turbineArea-e.vgtShut),0,1);
  return (TURB_ETA-(VGT_LOSS_SHUT+(VGT_LOSS_OPEN-VGT_LOSS_SHUT)*f))/TURB_ETA;
}
function turbinePower(mEx,area,T3,mapBar,prMean,Ut){
  const pr=prMean>0?prMean:turbineManifoldPR(mEx,area,T3),kv=vgtEtaFactor(area);
  const s=mEx>0&&area>0?pulseShape(mEx,area,T3,mapBar,pr):null;
  if(!s)return{P:kv*mEx*turbineWorkMean(pr,T3,Ut),pr};
  const mHi=mEx*(1+s.keep*(s.fb/s.phi-1)), mLo=mEx*(1+s.keep*((1-s.fb)/(1-s.phi)-1));   // phi mHi + (1-phi) mLo = mEx
  const P=kv*(s.phi*mHi*turbineWorkMean(turbineManifoldPR(mHi,area,T3),T3,Ut)
        +(1-s.phi)*Math.max(0,mLo)*turbineWorkMean(turbineManifoldPR(Math.max(0,mLo),area,T3),T3,Ut));
  return{P,pr};
}
function manifoldPR(mAir,mEx,mapBar,T3,area,compEta,flowFrac){
  if(!(area>0))return 1;
  const pComp=mAir*1005*298*(Math.pow(Math.max(1,mapBar),0.286)-1)/clamp(compEta||0.72,0.30,0.85);
  if(pComp<=0)return 1;
  const Ut=turbineTipFor(Math.max(1,mapBar),flowFrac>0?flowFrac:mAir/Math.max(1e-9,engine.chokeFlow_kgs),298);
  const tPower=pr=>{
    // pr never exceeds the gate-shut solution, so mT is the nozzle flow AT pr and its mean PR is pr
    const mT=Math.min(mEx,area*(pr*101325)/Math.sqrt(Math.max(300,T3))*nozzleFlux(pr));
    return turbinePower(mT,area,T3,mapBar,pr,Ut).P;
  };
  const full=turbineManifoldPR(mEx,area,T3);          // gate shut: everything through the throat
  if(tPower(full)<=pComp)return full;                 // cannot make target even wide open
  let lo=1.0001,hi=full;                              // gate opens: balance at lower manifold pressure
  for(let i=0;i<40;i++){const m=(lo+hi)/2;if(tPower(m)<pComp)lo=m;else hi=m;}
  return hi;
}
// ---- variable geometry: the throat as a control input instead of a casting decision ----
// A fixed housing has one throat, and that throat is a compromise nobody is happy with: tight
// enough to spool at 1700 rpm is far too tight to breathe at 4500. A VGT removes the compromise by
// putting a ring of pivoting nozzle vanes in the volute, so the ECU picks the throat at every
// operating point. It is the single piece of hardware that lets a 2.0 TDI hold full boost from
// 1750 rpm, and this model had no concept of it — which is why every diesel preset here spooled
// like a fixed-housing petrol turbo and the spool cliff could not be closed.
//
// GEOMETRY, NOT A MULTIPLIER. The throat of a vaned ring is the gap between neighbouring vanes.
// With Z vanes on a pitch circle of radius r2 and passage height h, the pitch is s = 2*pi*r2/Z and
// the throat of one passage is (s*sin(beta) - t), beta measured from tangential and t the vane
// thickness it loses to its own neighbour. So the ring passes
//     A(beta) = h * (2*pi*r2*sin(beta) - Z*t)
// and the actuator does nothing at all but rotate beta. Two things fall straight out of that and
// neither is fitted:
//   · the RANGE. Production vane rings sweep roughly 21 to 60 degrees from tangential, which with
//     the blockage term gives about 2.9:1 — the flow range a VGT is actually sold on.
//   · the TOP END: Z*t of circumference is vane, which a plain volute does not lose.
// Blockage is a fixed length of circumference, so it hurts a small frame more than a large one.
//
// THE RING'S OWN SIZE (build 168). The ring was sized off the frame's fixed-housing A/R: its throat at 60 degrees
// was taken to be that housing's volute throat, so h*2*pi*r2*sin(60) was set to whatever A/R implied. On a VGT the
// volute only feeds the ring; the throat is the vane passages, and their area is the formula above with the
// ring's own radius and height. Sized off the A/R, the 2.0 TDI's ring opened to 327 mm2, and wide open it still
// made 2.2x the power its compressor needed at the limiter: an expansion ratio of 5 and an exhaust manifold near
// 5 bar where TDI owners measure about 3. The ring now has its own proportions, scaled to the turbine wheel as the
// hardware is:
//   r2 = 1.22 x the wheel's tip radius: the vanes' trailing edges sit at 1.2-1.25 times it (a variable-geometry
//        turbine patent, US 12055050; the A/R volute was put at 1.05);
//   h  = 0.07 x the wheel's diameter: the nozzle height of radial turbines of this kind (0.07, GT2011-46148;
//        0.057, the ETN D1.8 radial-turbine design; rotor inlet widths of 0.07-0.1 of the diameter in the
//        design literature), the middle of the published range.
const VANE_Z=12, VANE_T=0.0015;                      // vanes, and their thickness (m)
const VANE_T_LIMIT=1100;                             // K — where nickel-alloy vanes start to creep
const VANE_BETA_MIN=21, VANE_BETA_MAX=60;            // degrees from tangential — the vane sweep
const VANE_R2=1.22, VANE_H=0.07;                     // ring radius over wheel tip radius, nozzle height over wheel diameter
const vanePitchR=exd=>VANE_R2*(TURB_WHEEL*exd/2);    // the vanes' trailing edges, outboard of the wheel
// The ring's throat at vane angle `beta`, m2: h * (2 pi r2 sin(beta) - Z t).
function vaneThroatArea(exd,betaDeg){
  const h=VANE_H*TURB_WHEEL*exd;
  return h*Math.max(0.05*2*Math.PI*vanePitchR(exd),2*Math.PI*vanePitchR(exd)*Math.sin(betaDeg*Math.PI/180)-VANE_Z*VANE_T);
}
// The vanes ARE the boost control: a VGT diesel has no wastegate, because opening the vanes IS
// the gate. So the schedule is "the WIDEST throat that still supplies the compressor at TARGET
// boost" — widest, because every square millimetre closed past that is back-pressure the piston
// has to push against, and this model now charges for that in both PMEP and residual knock.
//
// Clamped to the vane sweep. Hitting the shut end is not a failure — it is the vanes doing all
// they can, which is the state a VGT spends every spool-up in.
//
// Returns the throat, the mean expansion ratio and the turbine POWER at that throat, and the caller
// uses that power rather than re-deriving it. That is not an optimisation. The whole boost search
// rests on the SIGN of (Pt - Pc), and at a modulating vane position that difference is zero by
// construction; recomputing it through another path would make it reliably -1e-12, and a frame
// holding its target would report as unable to. (Until pulse energy this inverted the turbine in
// closed form for PR; turbine power now has no closed-form inverse, so the area is bracketed.)
function vgtThroat(mEx,pComp,T3,aOpen,aShut,mapBar,Ut){
  const shut=a=>{const r=turbinePower(mEx,a,T3,mapBar,0,Ut);return{area:a,pr:r.pr,P:r.P};};
  if(!(aOpen>0))return{area:0,pr:1,P:0};
  if(!(mEx>0)||!(pComp>0))return shut(aOpen);
  // The widest throat whose turbine power supplies the compressor. With pulses the power is no
  // longer invertible in closed form, so the AREA is bracketed (power falls as the throat opens),
  // and the bracket end that still supplies it is returned with the power it makes: the sign of
  // (Pt - Pc) at a modulating vane position must come out >= 0 by construction, not be re-derived
  // through a second solver (see above).
  const Pof=a=>turbinePower(mEx,a,T3,mapBar,0,Ut);
  if(Pof(aOpen).P>=pComp){const r=Pof(aOpen);return{area:aOpen,pr:r.pr,P:r.P};}
  const sh=Pof(aShut);
  if(sh.P<pComp)return{area:aShut,pr:sh.pr,P:sh.P};          // not reachable even fully shut
  let lo=aShut,hi=aOpen;
  for(let i=0;i<30;i++){const m=(lo+hi)/2;if(Pof(m).P>=pComp)lo=m;else hi=m;}   // 1e-9 of the sweep
  const r=Pof(lo);
  return{area:lo,pr:r.pr,P:r.P};
}
// Compressor shaft power at a given pressure ratio — the demand the vanes are scheduled against.
const compPowerAt=(mA,prTgt,T01,eta)=>
  mA*1005*Math.max(200,T01)*(Math.pow(Math.max(1,prTgt),0.286)-1)/clamp(eta||0.72,0.30,0.85);
// ---- the compressor, and the shaft that drives it ----
// Boost is what the WHEEL IS DOING at the speed it is turning, not a curve fitted against engine
// rpm. Euler's turbomachinery relation: a compressor raises stagnation temperature by sigma.U^2/cp,
// and the pressure ratio that produces depends on how efficiently it was done.
const COMP_SLIP=0.90;      // backswept centrifugal wheel; standard turbomachinery value
const TIP_LIMIT=520;       // m/s — where a cast aluminium wheel lets go. Sets max shaft speed.
const J_REF=3.2e-5, D_REF=0.071;   // a measured GT2871R cartridge; scales as D^5 in a similar family
const wheelInertia=exd=>J_REF*Math.pow(exd/D_REF,5);
const maxShaftRpm=exd=>TIP_LIMIT*60/(Math.PI*exd);
// Transient shaft losses the pure Pt−Pc balance omitted. Applied only in advanceShaft — not in the
// steady boost search — so a wastegated frame still holds its target once lit. Both were fitted until
// build 93 (BEAR_C ~5x published bearing loss with a borrowed D^5; FILL_E charged per bar of boost and
// attached to the compressor wheel instead of the charge system). Both are now derived.
//
// BEARINGS — Petroff's law for a lightly loaded journal: friction power P = 2 pi mu r^3 L w^2 / c per
// film. A turbo cartridge carries two floating-ring journals and a thrust bearing. The ring turns at a
// fraction rho of shaft speed, so the inner film shears at (1-rho)w and the outer (radius ~1.6 r) at
// rho w; the thrust bearing adds about half again. Every input is a published geometry or property:
// journal 0.11 x wheel diameter (a GT28: 7.9 mm on 71 mm), L/d 0.8, radial clearance 0.4% of r
// (~15 um), hot 5W-30 at ~110 C mu 0.010 Pa.s, ring speed ratio 0.3. That gives ~0.8 kW at 140k rpm on
// the reference cartridge against a published 0.2-0.8 kW at 100-150k, and it scales as D^3 — r^3 L/c
// with L and c both proportional to r — not the D^5 that was borrowed from the inertia scaling.
const BRG_D=0.11, BRG_LD=0.8, BRG_CR=0.004, BRG_MU=0.010, BRG_RING=0.3, BRG_THRUST=1.5;
const bearingCoeff=exd=>{                 // W per (rad/s)^2
  const r=BRG_D*exd/2, L=BRG_LD*2*r, c=BRG_CR*r;
  const films=Math.pow(1-BRG_RING,2)+Math.pow(1.6,3)*BRG_RING*BRG_RING;
  return 2*(2*Math.PI*BRG_MU*r*r*r*L/c)*films*BRG_THRUST;
};
// CHARGE-SYSTEM FILL — boost is pressure in a volume, and raising it means pushing in extra air
// beyond what the engine swallows: dm = V dp / (R T), each kilogram costing the compressor's
// specific work at that pressure ratio. V is the hardware between compressor and throttle: the outlet
// ducting (its bore follows the compressor outlet, ~0.72 of the exducer) and the intercooler core. That is
// what the old FILL_E was standing in for, attached to the wheel instead of the plumbing. (Substituting
// this was tried before build 90 and stalled spool above 1.0 bar; pulse energy and packaging-short
// turbo manifolds are what made the turbine able to fill a real charge system.)
// PR and efficiency are coupled — efficiency depends on where you sit on the map and where you sit
// depends on PR — so they are solved together rather than one being assumed alongside the other.
function compressorPR(exd,shaftRpm,flowFrac,T01){
  const U=Math.PI*exd*Math.max(0,shaftRpm)/60, work=COMP_SLIP*U*U/(1005*Math.max(200,T01));
  let eta=0.70,pr=1;
  for(let i=0;i<30;i++){
    pr=Math.pow(1+eta*work,3.5);
    const e2=compIslandEff(flowFrac,pr);
    if(Math.abs(e2-eta)<1e-6)break;
    eta+=(e2-eta)*0.5;
  }
  return{pr,eta};
}
// Net power on the shaft: turbine extract minus compressor absorb. Steady boost is solved from
// this balance alone (a real wastegated turbo holds target once lit; losses set HOW LONG it
// takes to get there, not whether it can). Transient losses live in shaftLossPower and are
// applied only by advanceShaft — putting them in the steady search collapsed high-boost power
// curves and put the rotary turbo back on the rev limiter.
function shaftNetPower(shaftRpm,mAir,T3,T01,rpm){
  const e=engine;
  if(!e.turbineArea)return 0;
  const units=unitsAt(rpm||0);
  const {pr,eta}=compressorPR(e.compExd,shaftRpm,compFlowFrac(rpm||0,mAir),T01);
  // Report the RAW pressure ratio the wheel is producing as well as the wastegated one. The search
  // in steadyBoost asks "can the shaft reach this PR", and if it only ever sees the capped value it
  // can never answer yes at the cap itself — which silently reported a frame as unable to make a
  // boost it had 40 kW of turbine power spare to make.
  const prCap=Math.min(pr,1+boostTarget(rpm||0));
  const mEx=mAir*1.06/units, mA=mAir/units;
  const Ut=Math.PI*TURB_WHEEL*e.compExd*Math.max(0,shaftRpm)/60;   // turbine tip speed
  // VGT vanes schedule against the BOOST TARGET, not against what the compressor happens to be
  // drawing at this instant. That is both the real control law and the only one that works here:
  // scheduling to the instantaneous draw would balance the shaft at EVERY speed, net would be zero
  // everywhere, and the turbo would never accelerate. Below target the vanes sit shut, which is
  // what a spool-up is; at target they open just enough to hold it.
  // The vanes close until the target is HELD, which means covering the shaft's own bearing drag as
  // well as the compressor. Scheduling to the compressor alone left exactly zero surplus, so on the
  // live bench (which charges bearing drag) a VGT diesel settled at 1.05 bar against a 1.20 target,
  // while the steady solver (which does not) said it held 1.20. A wastegated frame never showed it,
  // because it always has surplus to dump.
  const t=e.vgtShut>0
    ? vgtThroat(mEx,compPowerAt(mA,1+boostTarget(rpm||0),T01,eta)+shaftLossPower(shaftRpm)/units,T3,e.turbineArea,e.vgtShut,prCap,Ut)
    : turbinePower(mEx,e.turbineArea,T3,prCap,0,Ut);
  const area=t.area||e.turbineArea;
  const Pt=t.P;
  const Pc=compPowerAt(mA,prCap,T01,eta);
  return{net:Pt-Pc,pr:prCap,prRaw:pr,eta,Pt,Pc,turbArea:area};
}
// Bearing drag — the loss that makes spool take real time. Applied only on the transient path so a
// wastegated frame still holds its target once lit. (A housing heat-soak hook lived here with its
// scale set to zero; a term that always evaluates to nothing is not a placeholder, it is dead code
// that reads like modelled physics. Removed — heat soak goes in when it has a magnitude.)
function shaftLossPower(shaftRpm){
  const e=engine, n=Math.max(0,shaftRpm), omega=n*2*Math.PI/60;
  // Petroff journal and thrust bearing friction, ~ w^2 D^3 (see bearingCoeff).
  return bearingCoeff(e.compExd||D_REF)*omega*omega;
}
// Air the engine swallows at a given speed and boost. Deliberately uses the DESIGN VE amplitude
// rather than the live computeVE: computeVE now depends on boost through effIAT and the residual
// term, and calling it from here would close a loop that does not converge.
function airFlowAt(rpm,pr){
  const e=engine;
  return (e.displacement_L/1000)*(e.veAmp||0.95)*(rpm/60*(e.chargesPerRev||0.5))*(pr*101325/(287*313));
}
// Steady boost: the shaft speed where turbine and compressor balance, found by bracketing on boost
// rather than by relaxation — the states switch discontinuously and a fixed point orbits them.
function steadyBoost(rpm){
  const e=engine;
  if(!e.turbineArea||rpm<200)return 0;
  // This is a WIDE-OPEN-THROTTLE solve, so the gas is full-load gas at this speed and mixture. It
  // used to take load = rpm/(0.8 x redline), which handed the turbine 550 K gas at 2000 rpm with the
  // throttle wide open, while the live shaft (advanceShaft, load = throttle) got ~950 K at the same
  // point — so the dyno and the bench spooled on different physics. What really does make low-rpm
  // gas cooler is the extra time the walls get per cycle, and exhaustHeatFrac now carries that.
  // Rich of stoich adds nothing (exhaustGasT caps the release), so a petrol engine's mixture is 1.
  const T3=exhaustGasT(1.0,rpm,e.ci?dieselLambdaFloor(rpm):1);
  const nMax=maxShaftRpm(e.compExd);
  const canHold=pr=>{
    const mAir=airFlowAt(rpm,pr);
    // Could the shaft, spun to whatever speed this PR needs, still be gaining energy there?
    let lo=1000,hi=nMax,found=-1;
    for(let i=0;i<28;i++){
      const mid=(lo+hi)/2, r=shaftNetPower(mid,mAir,T3,313,rpm);
      if(r.prRaw>=pr){hi=mid;found=mid;}else lo=mid;
    }
    if(found<0)return false;                      // cannot reach this PR at any shaft speed
    return shaftNetPower(found,mAir,T3,313,rpm).net>=0;
  };
  const target=1+boostTarget(rpm);
  if(canHold(target))return target-1;           // wastegating
  if(!canHold(1.005))return 0;                    // not spooled
  let lo=1.005,hi=target;
  for(let i=0;i<24;i++){const m=(lo+hi)/2;if(canHold(m))lo=m;else hi=m;}
  return lo-1;
}
// Residual gas left behind because the cylinder never got below exhaust pressure. It occupies
// volume the fresh charge wanted, so VE falls by roughly that fraction scaled by the clearance
// volume it hides in.
// What decides how much burnt gas is left in the clearance volume is the ratio of exhaust pressure
// to INTAKE pressure, not exhaust pressure against atmosphere. That distinction does not matter on
// a naturally-aspirated engine and matters enormously on a boosted one: a turbo running 2 bar
// absolute intake against 3 bar absolute exhaust is nothing like an NA engine with 2 bar of
// back-pressure, though the old absolute-difference form treated them the same and would have
// charged the turbo a ~38% VE loss.
//   f_res = 1/(CR-1) . (p_exh/p_int)^(1/gamma),  and the loss is the excess over the balanced case.
const residualFrac=(pExhBar,pIntBar,cr)=>
  Math.pow(Math.max(0.2,pExhBar)/Math.max(0.2,pIntBar),1/GAMMA_EXH)/Math.max(1.5,cr-1);
// The VE loss is the EXCESS over the balanced case p_exh = p_int, where the fraction is 1/(CR-1).
// Algebraically identical to the form this replaces; split out so the knock model can read the
// fraction itself rather than only the loss.
const residualLoss=(pExhBar,pIntBar,cr)=>clamp(
  residualFrac(pExhBar,pIntBar,cr)-1/Math.max(1.5,cr-1),0,0.30);
// Derive every pipe on the engine. A header is CUT for a target speed: solve the tuning relation
// for length instead of for rpm, taking the lowest order that gives a primary you can physically
// route round an engine bay (350-900 mm). That is how a fabricator actually works.
function deriveGasDynamics(){
  const e=engine;
  // A designed exhaust (build 205, parts.js) gives its own dimensions; a factory one is sized to this engine below.
  const P=e.exhaustPart||null;
  const cam=CAM[e.cam]||CAM.stock, ex=P?null:(EXHAUST[e.exhaust]||EXHAUST.stock);
  e.camDur=cam.dur; e.camLSA=cam.lsa;
  e.overlap=e.ports?0:overlapDeg(cam.dur,cam.lsa);
  // The work's share of extra wall heat (wallWorkShare), at the anchor where it is zero-referenced, and
  // the gross indicated efficiency it is a share of there. Set here, from the cam just read and before
  // the first exhaust temperature below. Ported engines carry no wall term. (maxBoost is set later.)
  // Cooled EGR (build 204): the most the ECU recirculates, on a spark engine with the hardware; and what that dilution
  // takes off the walls' share of the fuel's heat at the anchor (the same trace with the charge diluted, the same fuel).
  e.egrMax=(e.egr==='cooled'||e.egr==='cooled-full')&&!e.ci&&!e.ports?EGR_COOLED_MAX:0;e.egrFull=e.egr==='cooled-full';e.egrWall=0;
  e.wallK=0;e.wallEtaI=1;e.wallTab=null;
  if(!e.ports){
    const n=e.ci?BURN_REF_RPM:WALL_BSP_REF*60/(e.bore_mm*2*e.stroke_mm/1000);
    const map=1+(e.intake==='na'?0:(e.boost_bar||0));
    e.wallK=wallWorkShare(e,n,map);
    // the absolute wall share by rpm, every 100, for the energy balance (exhaustHeatFrac)
    e.wallTab=[];for(let r=0;r<=e.redline*1.3+200;r+=100)e.wallTab.push(wallTrace(e,Math.max(300,r),map).share);
    e.wallRefRpm=n;e.wallRefShare=wallShareAt(n);
    if(e.egrMax>0)e.egrWall=wallTrace(e,n,map,e.egrMax).share-wallTrace(e,n,map).share;
    e.wallEtaI=e.ci?ETA_GROSS_CI*otto(e.compression)/otto(CR_REF_CI)
                   :REAL_TO_FUELAIR*(1-Math.pow(Math.max(1.5,e.compression),1-GAMMA_FA))*(e.typeImep||1);
  }
  // VVT advances the intake cam down low, which IS closing the valve earlier — so it is a
  // change of IVC timing, not a recovery percentage. Real intake phasers have 40-60 crank
  // degrees of authority.
  e.trapFrac=e.ports?1:trappedFraction(cam.dur,cam.lsa,e.compression,e.vvt?(cam.vvtMax??VVT_AUTHORITY):0);
  e.dispCyl_L=e.displacement_L/Math.max(1,e.cylinders);
  const Vd=e.dispCyl_L/1000;
  e.vEffCyl=Vd/Math.max(1.5,e.compression-1)+Vd/2;       // mean cylinder volume over induction
  // Runner bore matches the port behind it, which matches the valve throat it feeds.
  e.runnerD_mm=e.ivDia_mm?Math.sqrt(e.ivCount)*THROAT_RATIO*e.ivDia_mm:0.42*e.bore_mm;
  e.runnerA=Math.PI/4*Math.pow(e.runnerD_mm/1000,2);
  const rn=RUNNER[e.runner]||RUNNER.medium;
  e.runnerVariable=(e.runner==='variable');
  const port=0.95*(e.bore_mm/1000);
  e.runnerL=(rn.mm!=null?rn.mm/1000:RUNNER.long.mm/1000)+port;
  e.runnerLShort=RUNNER.short.mm/1000+port;              // the flap's other position
  // The header is cut for the gas that flows at its target speed, so take the temperature there.
  const tgtRpm=P?e.redline*0.90:(ex.targetRpm||e.redline*0.90);
  const T=exhaustGasT(1.0,tgtRpm);
  e.exhSigma=P?EXHAUST_BUILD[P.build].sigma:ex.sigma; e.sysL=P?P.sysL_m:ex.sysL;
  // Turbine throat, from the housing A/R and the turbine wheel it is wrapped around. Twin frames
  // split the exhaust between two turbines, so each sees half the flow.
  if(e.intake==='turbo'){
    const tb=turboFrame(e);
    // A vane ring replaces the fixed throat with a range. `turbineArea` stays the WIDEST the
    // turbine can be, so every existing call site reads the open position by default; `vgtShut`
    // is non-zero only on a VGT and is what tells the rest of the model there is anything to
    // schedule at all.
    e.compExd=tb.exd;
    setTurbineAR(tb.ars[TURBINE_HOUSING[e.housing]??1]);   // the housing the build chose for this frame
    e.turbUnits=(e.turboConfig==='twin'||e.turboConfig==='sequential')?2:1;
    e.shaftJ=wheelInertia(tb.exd)*(e.turboConfig==='twin'?2:1);   // a sequential secondary is pre-spooled
    e.seqStageRpm=0;                                               // set once the engine is built
    e.shaftMax=maxShaftRpm(tb.exd);
  }else{e.turbineArea=0;e.vgtShut=0;e.turbUnits=1;e.compExd=0;e.shaftJ=0;e.shaftMax=0;}
  // Size the system pipe from the engine's own flow at the power peak, not from a fixed number.
  const m3sPeak=(e.dispCyl_L/1000)*(T/320)*e.cylinders*(e.redline*0.9/60*(e.chargesPerRev||0.5));
  // One system per BANK: a V or a boxer has two heads pointing opposite ways and runs two pipes,
  // and so does a big inline six. That is why a V12 does not need a 140 mm tailpipe.
  if(P){e.sysPipes=P.pipes;e.sysD=P.sysD_mm/1000;e.primD=P.primD_mm/1000;}
  else{
  e.sysPipes=(e.layout==='v'||e.layout==='boxer')?2:(e.cylinders>=6&&e.displacement_L>3?2:1);
  e.sysD=clamp(Math.sqrt(4/Math.PI*(m3sPeak/e.sysPipes)/ex.sysV),0.030,0.110);
  e.primD=ex.dOverBore*(e.bore_mm/1000);
  }
  if(e.intake==='turbo'){
    // A turbo manifold is not tuned. Against a turbine the returning wave is a compression, which only
    // hurts (exhaustWaveP flips its sign), and every litre of manifold smooths away the blowdown pulse
    // the turbine lives on — so it is made as SHORT as packaging allows: runners reaching from each
    // port to a turbine at mid-bank, (n-1)/2 cylinder pitches plus the port exit.
    const perBank=(e.layout==='v'||e.layout==='boxer')?Math.ceil(e.cylinders/2):e.cylinders;
    e.primL=0.10+Math.max(0,perBank-1)/2*1.15*(e.bore_mm/1000);e.primK=0;
  }
  else if(P){
    // the length is the part's; the order is the one whose tuned speed lies nearest the speed it was cut for
    e.primL=P.primL_mm/1000;e.primK=0;
    if(P.build!=='cast'){const n1=(cam.dur/2+90)*sonic(T)/(12*e.primL);let best=1e9;
      for(let k=1;k<=9;k+=2){const d=Math.abs(n1/k-tgtRpm);if(d<best){best=d;e.primK=k;}}}
  }
  else if(ex.fixedL){e.primL=ex.fixedL;e.primK=0;}
  else{
    const theta=cam.dur/2+90, tgt=tgtRpm;
    e.primL=0;e.primK=3;
    for(let k=1;k<=9;k+=2){
      const L=theta*sonic(T)/(12*tgt*k);
      if(L>=0.35&&L<=0.90){e.primL=L;e.primK=k;break;}
    }
    if(!e.primL)e.primL=clamp(theta*sonic(T)/(12*tgt*3),0.35,0.90);
  }
  // Where does this combination actually tune? Reported in the DESIGN panel, because it is the
  // number that decides where the engine makes its power and it used to be asserted by peakShift.
  let bestR=-9;e.ramPeakRpm=0;
  for(let n=Math.max(1200,e.idleRpmEff||1200);n<=e.redline;n+=25){
    let g=intakeRamGain(n,313);
    if(e.runnerVariable){                       // the flap takes whichever position is better
      const keep=e.runnerL;e.runnerL=e.runnerLShort;
      g=Math.max(g,intakeRamGain(n,313));e.runnerL=keep;
    }
    if(g>bestR){bestR=g;e.ramPeakRpm=n;}
  }
  e.ramPeakGain=bestR;
  // What the engine breathes with since build 121: the integrated intake stroke. The panel reports where
  // it fills best, and by how much over the slowest speed's fill (the geometric trapping).
  buildFillTable();
  if(e.fillTable){
    let bf=-9,f0=fillAt(Math.max(1200,e.idleRpmEff||1200));
    for(let n=Math.max(1200,e.idleRpmEff||1200);n<=e.redline;n+=25){const f=fillAt(n);if(f>bf){bf=f;e.ramPeakRpm=n;}}
    e.ramPeakGain=bf/Math.max(0.1,f0)-1;
  }
  let bestS=-9;e.scavPeakRpm=0;
  for(let n=Math.max(1200,e.idleRpmEff||1200);n<=e.redline;n+=25){
    const g=scavengeGain(n,T);
    if(g>bestS){bestS=g;e.scavPeakRpm=n;}
  }
  e.scavPeakGain=bestS;
  e.egtPeak=T-273;
}
