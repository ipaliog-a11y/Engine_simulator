// ====== ELECTRIC DRIVE: the motor, its inverter and the battery, from what they are built of (build 178) ======
// Step 2.1 of plans/hybrid-electric/: the physics alone. Nothing calls it yet; the ENGINE tab, the dyno and
// powertrain() take it up in 2.2. Every design field acts through a mechanism (plans/hybrid-electric/motor-design.md),
// never a multiplier on an answer:
//   torque      from the rotor's size, the turns and the current: T = 3/2 p psi I, psi the magnets' flux through the
//               winding (the motor's BMEP is its air-gap shear stress, which this is);
//   the knee    from the battery's voltage against the back-EMF the turns and magnets make: above it the controller
//               weakens the field and the power holds roughly flat;
//   max rpm     the lowest of the design speed, the rotor's surface speed (what holds the magnets in) and the
//               inverter's output frequency (the poles);
//   losses      copper I²R (resistance from the slot copper, rising 0.393%/K), iron (Steinmetz on the lamination
//               thickness), friction and windage, and the inverter's conduction and switching;
//   heat        three lumped nodes (winding, stator core, rotor) and the coolant, so peak power can be held only as
//               long as the copper and the magnets allow;
//   the battery cells in series and parallel: open-circuit voltage by state of charge, internal resistance, the
//               discharge limit, mass and cost, the chemistry's figures by the year (decision 9).
//
// Three constants are measured, not derived, and all from one motor: the Tesla Model 3 rear motor (2018 Long Range)
// as taken apart and measured by MotorXP (Performance Analysis of the Tesla Model 3 Electric Motor, June 2020):
// 54 slots, bore 151.3 mm, stack 134 mm, rotor 149.9 mm, 3 pole pairs, 12 series turns per phase (2 turns, 3 paths),
// 4.75 mOhm per phase, 42 V peak line-to-line per 1000 rpm, 430 Nm at 953 A rms needing 94.6 V rms per phase.
//   FLUX_KM   the air gap's fundamental flux over the magnets' remanence, which the rotor's magnet pockets set and
//             this model does not draw: 0.85 gives the measured back-EMF with SH-grade NdFeB (Br 1.28 T);
//   SAT_K     how much torque per amp is lost to saturation at that electric loading (430 Nm, not the 470 the
//             flux alone gives): 8.5%, scaled with the square of the loading;
//   V_DROP    the terminal voltage over the back-EMF at full current (the inductive and resistive drop): 1.29.
// Everything else here is either geometry, a material's datasheet figure, or a textbook rule, named where it is used.
// tests/test96.mjs checks the model against what was NOT used to set it: the Model 3's measured resistance and
// published power, and the 2012 Nissan Leaf as measured by ORNL (Burress, Benchmarking State-of-the-Art Technologies,
// 2013): 80 kW held at 7000 rpm with the stator settling near 135 C, peak motor efficiency above 97%.
const RHO_CU=1.72e-8, ALPHA_CU=0.00393, RHO_FE=7650, RHO_CU_M=8960, RHO_MAG=7500;
const FLUX_KM=0.85, SAT_K=0.085, SAT_A_REF=145.7e3, V_DROP=1.29;
const KW_WIND=0.93;        // winding factor: distributed, q = 2-3 slots per pole per phase, short-pitched
const SPLIT=0.67;          // bore over stator outside diameter (Model 3 0.672, Leaf 0.66; 0.6-0.7 for traction motors)
const GAP=0.0007;          // air gap (m): 0.7 mm, the Model 3's
const SLOT_SHARE=0.5, TOOTH_BAND=0.6, FILL=0.40;   // slots are half the band the teeth occupy, 60% of the radial depth; copper fills 40% of a slot (stranded)
const B_CORE=1.5;          // peak flux density in the teeth and yoke at full flux (T), a usual design point for silicon steel
// Non-oriented silicon steel, 0.35 mm (M270-35A class): about 2.7 W/kg at 1.5 T 50 Hz and 19 W/kg at 1.0 T 400 Hz.
// Split into hysteresis (∝ f B²) and eddy (∝ (t f B)²), solved from those two points; a thinner sheet cuts only the eddy.
const FE_KH=0.0206, FE_KE=6.71e-5, FE_T_REF=0.35;
// Magnets: remanence at 20 C (T), its temperature coefficient (/K), the highest temperature before the coercivity
// gives way and the loss is permanent (C), and the price ($/kg). SH and UH grades: Hcj >= 20 kOe and 25 kOe.
const MAGNET={
  ferrite:{label:'FERRITE',Br:0.42,alpha:-0.0020,Tmax:250,cost:6},
  ndfeb:  {label:'NdFeB (SH)',Br:1.28,alpha:-0.0012,Tmax:150,cost:60},
  ndfebDy:{label:'NdFeB + Dy (UH)',Br:1.23,alpha:-0.0011,Tmax:180,cost:95}
};
// How the rotor holds its magnets in, which sets the surface speed it survives (m/s): steel bridges in the lamination
// (the Model 3 runs ~140 m/s), or a carbon-fibre sleeve wound over it (the Model S Plaid's, the route to ~20,000 rpm
// on a large rotor).
const RETENTION={bridges:{label:'IRON BRIDGES',vTip:150,cost:0},sleeve:{label:'CARBON SLEEVE',vTip:220,cost:450}};
// Cooling: the heat path from the stator to the coolant. h is the coolant side (W/m²K) over the stator's outside, with
// the stator-housing contact 2e-4 m²K/W in series; spray and slot cooling also take heat straight off the copper
// (wind, W/m²K over the end windings or the slot walls) and the rotor (rotor, over its bore). Coolant temperature (C).
const MOTOR_COOLING={
  air:   {label:'AIR (FINNED)',h:60,  wind:0,   rotor:0,  tCool:40,cost:0},
  jacket:{label:'WATER JACKET',h:1200,wind:0,   rotor:0,  tCool:65,cost:120},
  spray: {label:'OIL SPRAY',   h:1200,wind:900, rotor:400,tCool:70,cost:350},
  slot:  {label:'DIRECT SLOT', h:1200,wind:2500,rotor:400,tCool:70,cost:900,inSlot:true}
};
// Inverters: silicon IGBTs (a 0.8 V conduction knee plus a resistance, switching at 10 kHz) or silicon-carbide MOSFETs
// (no knee, run at 16 kHz). tSw is the switching energy per event over the volts and amps switched (s): an 820 A
// automotive IGBT module loses ~75 mJ turning on and off at 400 V, 820 A (2.3e-7 s); SiC about a fifth of that.
// Resistances are for a 1000 A device and scale inversely with the rating. Cost per amp of rating.
const INVERTER={
  igbt:{label:'SILICON IGBT',v0:0.8,r:0.0009,tSw:0.23e-6,fSw:10e3,costA:6},
  sic: {label:'SiC MOSFET',  v0:0,  r:0.0016,tSw:0.05e-6,fSw:16e3,costA:11}
};
const ACTIVE_TO_MOTOR=1.6;   // housing, shaft, bearings and end caps over the active copper, iron and magnets
// ---- the induction motor (build 182, step 2.5a) ----
// No magnets: the stator's own current magnetises the rotor (the d-axis, Im), and the torque current (Iq) induces the
// rotor's currents in a copper cage, which slip behind the field. What that changes, each from the build:
//   flux        set by the designer's air-gap flux density at full field (IM_BG: 0.7-0.9 T is the usual design point,
//               below a magnet machine's ~1.1 T), and bought with current: Im = Bg g' p / (mu0 1.35 kw N);
//   torque      T = 3/2 p psi sqrt2 Iq with Iq = sqrt(I^2 - Im^2): the magnetising current takes a share of the inverter's
//               amps, and the flux is lower, so less torque per amp than a magnet machine of the same size;
//   the knee    the same voltage law, with the lower flux: a higher base speed. Above it the field is weakened and the
//               power holds only to the breakdown torque, ~3x base speed (IM_CPSR), against ~4x for a magnet machine;
//   part load   the controller lowers the flux until the magnetising and torque currents are equal (the loss-minimising
//               rule for an induction machine): at no torque there is no field, so no iron loss and no drag. That is
//               why a secondary axle carries one;
//   the rotor   the cage's I^2 R (the slip loss) heats the rotor, which sheds it only across the air gap: the rotor, not
//               the winding, sets how long it holds its peak. Its limit is the cage's and the bearings' (IM_ROTOR.Tmax).
// The cage: copper bars filling a band IM_HR deep under the rotor surface (fabricated copper, the Model S's; a cast
// aluminium cage would be ~1.7x the resistance), Qr bars (~1.23x the stator slots, 74 against 60 in the Model S), end
// rings of the same depth IM_RING wide; the bar resistance referred to the stator by the textbook transformation
// (Pyrhonen, Design of Rotating Electrical Machines, 7.2): R2' = 4 m (kw N)^2 / Qr (R_bar + R_ring / (2 sin^2(pi p/Qr))).
const IM_BG=0.8, IM_GAP=0.0005, IM_KCS=2.0, IM_CPSR=3, IM_HR=0.12, IM_RING=0.08, MU0=4e-7*Math.PI;
// The voltage at full current: the leakage flux of the stator and the rotor rides on the torque current, sigma Lm Iq,
// with the total leakage factor sigma ~0.08 for a traction design (0.05-0.1); against the magnetising flux Lm Im it
// adds in quadrature, so the drop over the back-EMF is sqrt(1 + (sigma Iq / Im)^2), times ~5% resistive. A magnet
// machine's V_DROP (1.29, measured) holds its inductive drop the same way.
const IM_SIGMA=0.08, IM_R_DROP=1.05;
const IM_ROTOR={label:'COPPER CAGE',Br:0,alpha:0,Tmax:200,cost:0};
const MOTOR_TYPE={pm:{label:'PERMANENT MAGNET'},im:{label:'INDUCTION (COPPER CAGE)'}};

// The motor a design describes, derived once. s: {rotorD mm, stackL mm, poles, turns (series per phase), magnet,
// retention, cooling, inverter, invAmps (A rms), maxRpm}.
function motorBuild(s){
  const im=s.type==='im';
  const mag=im?IM_ROTOR:MAGNET[s.magnet]||MAGNET.ndfeb, ret=im?RETENTION.bridges:RETENTION[s.retention]||RETENTION.bridges;
  const cool=MOTOR_COOLING[s.cooling]||MOTOR_COOLING.jacket, inv=INVERTER[s.inverter]||INVERTER.igbt;
  const D=s.rotorD/1000, L=s.stackL/1000, poles=s.poles, p=poles/2, N=s.turns, Lfe=0.95*L;
  const Ds=D+2*(im?IM_GAP:GAP), OD=Ds/SPLIT, h=(OD-Ds)/2, hSlot=TOOTH_BAND*h;
  const slots=3*poles*(poles<=6?3:2)*(im&&poles===4?5/3:1);       // q = 3 slots per pole per phase up to 6 poles, then 2;
                                                                    // a 4-pole induction motor runs q = 5 (the Model S's 60)
  // flux: the air gap's fundamental from the magnets (an induction motor: its design flux density), per pole, linked by
  // the winding
  const Bg=im?IM_BG:FLUX_KM*mag.Br, tau=Math.PI*D/poles, phiPole=2/Math.PI*Bg*tau*Lfe;
  const psi20=KW_WIND*N*phiPole;                                    // peak flux linkage per phase at 20 C (V s)
  // copper: the slots' share of the tooth band, at the fill; a turn runs the stack twice and round two end turns
  const band=Math.PI/4*((Ds+2*hSlot)**2-Ds*Ds), Acu=SLOT_SHARE*band*FILL;
  const pitch=Math.PI*(Ds+hSlot)/poles*5/6, endTurn=Math.PI/2*pitch;
  const mlt=2*L+2*endTurn;
  const R20=6*RHO_CU*N*N*mlt/Acu;                                   // per phase: independent of the parallel paths
  // masses (kg) and the rotor's inertia
  const mCu=RHO_CU_M*Acu*mlt/2;
  const mFeS=RHO_FE*(Math.PI/4*(OD*OD-Ds*Ds)-SLOT_SHARE*band)*Lfe;
  const Dsh=0.47*D, rotorVol=Math.PI/4*D*D*L;
  const mMag=im?0:RHO_MAG*0.06*rotorVol*(mag.Br<1?2.2:1);         // ferrite needs ~2x the volume for less flux
  // the induction motor's cage, its resistance referred to the stator, and the magnetising current at full field
  let Qr=0,Rr20=0,mCage=0,ImR=0;
  if(im){
    const hR=IM_HR*D,Abars=0.5*Math.PI*(D-hR)*hR,ringA=hR*IM_RING*D,ringD=D-hR;
    Qr=2*Math.round(slots*1.23/2);
    const Rbar=RHO_CU*L/(Abars/Qr),Rring=RHO_CU*(Math.PI*ringD/Qr)/ringA;
    Rr20=4*3*(KW_WIND*N)**2/Qr*(Rbar+Rring/(2*Math.sin(Math.PI*p/Qr)**2));
    mCage=RHO_CU_M*(Abars*L+2*Math.PI*ringD*ringA);
    ImR=IM_BG*IM_GAP*IM_KCS*p/(MU0*(3*Math.SQRT2/Math.PI)*KW_WIND*N);
  }
  const vDrop=im?IM_R_DROP*Math.sqrt(1+(IM_SIGMA*Math.sqrt(Math.max(0,s.invAmps**2-ImR*ImR))/Math.max(1,ImR))**2):V_DROP;
  const mFeR=RHO_FE*Math.PI/4*(D*D-Dsh*Dsh)*Lfe-mMag*0.5-(im?RHO_FE*mCage/RHO_CU_M*0.9:0);
  const mRotor=mFeR+mMag+mCage, J=0.5*mRotor*((D/2)**2+(Dsh/2)**2)*(s.retention==='sleeve'&&!im?1.03:1);
  const mass=(mCu+mFeS+mRotor)*ACTIVE_TO_MOTOR;
  // speed ceilings: the rotor surface, the inverter's output frequency (1.2 kHz IGBT, 2 kHz SiC)
  const nTip=ret.vTip/(Math.PI*D)*60, nFreq=(s.inverter==='sic'?2000:1200)*60/p;
  const nMax=Math.min(s.maxRpm||20000,nTip,nFreq);
  const Imax=s.invAmps;
  const cost=Math.round(mCu*11+(mFeS+mFeR)*3+mMag*mag.cost+ret.cost+cool.cost+Imax*inv.costA+400+(im?mCage*11+150:0));
  return {s,im,mag,ret,cool,inv,D,L,Lfe,Ds,OD,poles,p,N,slots,Bg,psi20,R20,mlt,Acu,mCu,mFeS,mFeR,mMag,mRotor,J,mass,
          nTip,nFreq,nMax,Imax,cost,Qr,Rr20,mCage,ImR,vDrop,cpsr:im?IM_CPSR:CPSR,
          // thermal network (W/K, J/K): winding -> core through the slot liner (0.2 W/mK, 0.4 mm over the slot walls),
          // core -> coolant through the housing, rotor -> core across the gap (h ~ 100), and the direct paths
          Gwc:0.2*(2*hSlot*L*slots)/0.0004,
          Gcc:Math.PI*OD*L/(1/cool.h+2e-4),
          // (spray reaches the end windings, ~50 mm out each side; slot cooling also runs along every slot wall)
          Gwk:cool.wind*(Math.PI*(Ds+hSlot)*2*0.05+(cool.inSlot?2*hSlot*L*slots:0)),
          Grc:100*Math.PI*D*L+cool.rotor*Math.PI*Dsh*L,
          Cw:385*mCu, Cc:460*mFeS+900*0.5*mFeS, Cr:460*mRotor};
}
// Flux linkage and resistance at temperature: the magnets lose remanence as they warm, the copper gains resistance.
const motorPsi=(m,tMag)=>m.psi20*(1+m.mag.alpha*(tMag-20));   // an induction motor's alpha is 0: its flux is the field's
const motorR=(m,tW)=>m.R20*(1+ALPHA_CU*(tW-20));
// Torque per amp falls with saturation as the electric loading (A/m of bore) rises.
const motorLoading=(m,I)=>6*m.N*I/(Math.PI*m.D);
const motorTorqueAtI=(m,I,psi)=>1.5*m.p*psi*Math.SQRT2*I*(1-SAT_K*(motorLoading(m,I)/SAT_A_REF)**2);
// The knee (mechanical rad/s): where the back-EMF, with the drop at full current, meets the inverter's most phase voltage
// (space-vector modulation: Vdc/sqrt(6) rms).
const motorBaseW=(m,Vdc,psi)=>Vdc/Math.sqrt(6)*Math.SQRT2/((m.vDrop||V_DROP)*m.p*psi);
// Constant power from the knee to CPSR times it (an interior-magnet machine's field-weakening range; the Leaf holds its
// 80 kW from 2730 to 9800 rpm, 3.6x), then falling as 1/w.
const CPSR=4;
// The most torque at a shaft speed (Nm), for the bus voltage and the magnets' temperature.
function motorMaxTorque(m,rpm,Vdc,tMag=60){
  if(m.parts)return m.parts.reduce((a,q)=>a+q.n*motorMaxTorque(q.m,rpm,Vdc,tMag),0);
  if(rpm>m.nMax)return 0;
  const psi=motorPsi(m,tMag),wb=motorBaseW(m,Vdc,psi),w=Math.max(1e-6,rpm*Math.PI/30);
  const Tpk=m.im?imTorque(m,m.Imax):motorTorqueAtI(m,m.Imax,psi);
  if(w<=wb)return Tpk;
  const C=m.cpsr||CPSR;
  if(w<=C*wb)return Tpk*wb/w;
  return Tpk*C*wb*wb/(w*w);
}
// An induction motor's torque at full field from a total current: what the magnetising current leaves for the torque.
function imTorque(m,I){
  const Iq=Math.sqrt(Math.max(0,I*I-m.ImR*m.ImR));
  return 1.5*m.p*m.psi20*Math.SQRT2*Iq*(1-SAT_K*(motorLoading(m,I)/SAT_A_REF)**2);
}
// Its currents at an operating point: the field's share (1 at full field) and the magnetising and torque currents. Above
// the knee the field is weakened as wb/w; below the rated torque current the controller lowers the field until Im = Iq.
function imCurrents(m,T,rpm,Vdc){
  const wb=motorBaseW(m,Vdc,m.psi20),w=rpm*Math.PI/30,k=1.5*m.p*Math.SQRT2;
  if(!(Math.abs(T)>0))return {fl:0,Im:0,Iq:0,I:0};   // no torque asked: no field
  let fl=w>wb?wb/w:1,Im=m.ImR*fl,Iq=Math.abs(T)/(k*m.psi20*fl);
  if(Iq<Im){Im=Iq=Math.sqrt(Math.abs(T)*m.ImR/(k*m.psi20));fl=Im/m.ImR;}
  for(let j=0;j<3;j++){const sat=1-SAT_K*(motorLoading(m,Math.hypot(Im,Iq))/SAT_A_REF)**2;Iq=Math.abs(T)/(k*m.psi20*fl*sat);}
  return {fl,Im,Iq,I:Math.min(m.Imax,Math.hypot(Im,Iq))};
}
// The current a torque needs (A rms): solved on the saturating torque law, plus the field-weakening current above the knee.
function motorCurrent(m,T,rpm,Vdc,psi){
  let I=Math.abs(T)/(1.5*m.p*psi*Math.SQRT2);
  for(let k=0;k<3;k++)I=Math.abs(T)/(1.5*m.p*psi*Math.SQRT2*(1-SAT_K*(motorLoading(m,I)/SAT_A_REF)**2));
  const wb=motorBaseW(m,Vdc,psi),w=rpm*Math.PI/30;
  const Id=w>wb?0.7*m.Imax*(1-wb/w):0;
  return Math.min(m.Imax,Math.hypot(I,Id));
}
// Losses at an operating point (W): torque T (Nm, negative when regenerating), speed (rpm), bus voltage, and the node
// temperatures {w,r}. Copper and inverter follow the current; iron follows frequency and the flux left after weakening.
function motorLosses(m,T,rpm,Vdc,temp){
  if(m.parts)return motorSetLosses(m,T,rpm,Vdc,temp);
  if(m.im)return imLosses(m,T,rpm,Vdc,temp);
  const psi=motorPsi(m,temp.r),I=motorCurrent(m,T,rpm,Vdc,psi),w=rpm*Math.PI/30;
  const cu=3*I*I*motorR(m,temp.w);
  const f=m.p*rpm/60,wb=motorBaseW(m,Vdc,psi),flux=w>wb?Math.max(0.4,wb/w):1,B=B_CORE*flux;
  const t=(m.s.lamination||0.35)/FE_T_REF;
  const fe=(FE_KH*f*B*B+FE_KE*t*t*f*f*B*B)*(m.mFeS+m.mFeR);
  const mech=0.15*w+5e-8*w*w*w*(m.D/0.15)**4*(m.L/0.134);
  const inv=m.inv,rS=inv.r*1000/m.Imax;
  const invL=3*(0.9*inv.v0*I+rS*I*I)+3*(Math.SQRT2/Math.PI)*inv.tSw*inv.fSw*Vdc*I;
  return {cu,fe,mech,inv:invL,I,total:cu+fe+mech+invL};
}
// ---- more than one motor (build 183, step 2.5b) ----
// A car with a motor on each axle (a Model Y: a magnet motor at the rear, an induction motor at the front), or two on
// one (a Model S Plaid's rear, one per wheel). All drive through reductions of the same ratio, so they turn at the
// same speed and the rest of the app sees one motor: their torques add, their masses, costs and inertias add, and
// the speed limit is the lowest. What a second motor changes:
//   the split   the controller shares the torque asked between the rear group and the front to lose the least, as a
//               Tesla's does: at a cruise the induction front motor carries nothing (no field, no drag) and the
//               rear does it all; flat out both give everything;
//   the heat    one lumped network, the motors' conductances and capacities added (they share the coolant loop).
//               A motor working harder than the others runs hotter in the car than here; the controller's limits
//               are taken at the lowest of their rotors' (the magnets', or a cage's).
// parts: [{m, n}] - the motor and how many of it (the rear group first). The figures a single motor reports
// (poles, turns, flux, knee, cooling, inverter) are the first group's.
function motorSet(parts){
  const a=parts[0].m,sum=k=>parts.reduce((x,q)=>x+q.n*(q.m[k]||0),0);
  const Tmax=Math.min(...parts.map(q=>q.m.mag.Tmax));
  return Object.assign({},a,{parts,count:parts.reduce((x,q)=>x+q.n,0),
    mag:Object.assign({},a.mag,{Tmax}),nMax:Math.min(...parts.map(q=>q.m.nMax)),
    J:sum('J'),mass:sum('mass'),cost:sum('cost'),mCu:sum('mCu'),mMag:sum('mMag'),mCage:sum('mCage'),mFeS:sum('mFeS'),mFeR:sum('mFeR'),
    Gwc:sum('Gwc'),Gcc:sum('Gcc'),Gwk:sum('Gwk'),Grc:sum('Grc'),Cw:sum('Cw'),Cc:sum('Cc'),Cr:sum('Cr')});
}
// The split: the front group's share of the torque from nothing to all it can give, in tenths and at its share of
// the capacity, whichever loses least; the rest is the rear's. Each group's motors share theirs equally.
function motorSetLosses(set,T,rpm,Vdc,temp){
  const P=set.parts,at=(q,t)=>{const L=motorLosses(q.m,t/q.n,rpm,Vdc,temp);return L;};
  const add=(x,L,n)=>{for(const k of ['cu','rcu','fe','mech','inv','I','total'])x[k]=(x[k]||0)+n*(L[k]||0);return x;};
  if(P.length===1){const L=at(P[0],T);return add({},L,P[0].n);}
  const r=P[0],f=P[1],mR=r.n*motorMaxTorque(r.m,rpm,Vdc,temp.r),mF=f.n*motorMaxTorque(f.m,rpm,Vdc,temp.r),aT=Math.abs(T),sg=Math.sign(T)||1;
  const shares=[0,0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9,1,mF/Math.max(1e-9,mR+mF)];
  let best=null;
  for(const sh of shares){
    const tF=Math.min(aT*sh,mF),tR=aT-tF;
    if(tR>mR*1.0001&&sh<1)continue;
    const x=add(add({},at(r,sg*tR),r.n),at(f,sg*tF),f.n);
    if(!best||x.total<best.total)best=x;
  }
  return best;
}
// An induction motor's: the stator's copper on the whole current, the cage's on the torque current (rcu, into the rotor),
// iron on the field it runs at, the rest as a magnet machine's.
function imLosses(m,T,rpm,Vdc,temp){
  const c=imCurrents(m,T,rpm,Vdc),I=c.I,w=rpm*Math.PI/30;
  const cu=3*I*I*motorR(m,temp.w),rcu=3*c.Iq*c.Iq*m.Rr20*(1+ALPHA_CU*(temp.r-20));
  const f=m.p*rpm/60,B=B_CORE*c.fl,t=(m.s.lamination||0.35)/FE_T_REF;
  const fe=(FE_KH*f*B*B+FE_KE*t*t*f*f*B*B)*(m.mFeS+m.mFeR);
  const mech=0.15*w+5e-8*w*w*w*(m.D/0.15)**4*(m.L/0.134);
  const inv=m.inv,rS=inv.r*1000/m.Imax;
  const invL=I>0?3*(0.9*inv.v0*I+rS*I*I)+3*(Math.SQRT2/Math.PI)*inv.tSw*inv.fSw*Vdc*I:0;
  return {cu,rcu,fe,mech,inv:invL,I,total:cu+rcu+fe+mech+invL};
}
// Efficiency of the drive (motor and inverter) at a point, motoring: shaft power over battery power.
function motorEfficiency(m,T,rpm,Vdc,temp={w:90,r:70}){
  const P=T*rpm*Math.PI/30;if(!(P>0))return 0;
  return P/(P+motorLosses(m,T,rpm,Vdc,temp).total);
}
// Heat: advance the winding, core and rotor temperatures over dt (s) with these losses. 80% of the iron loss is the
// stator's, 20% the rotor's (with the magnets' own eddy currents); friction and windage go to the core; an induction
// motor's cage loss (rcu) is the rotor's.
function motorHeatStep(m,temp,L,dt){
  const tc=m.cool.tCool,ns=Math.max(1,Math.ceil(dt/0.5)),h=dt/ns;   // explicit steps well inside the fastest node's time constant
  for(let k=0;k<ns;k++){
    const qWC=m.Gwc*(temp.w-temp.c),qWK=m.Gwk*(temp.w-tc),qCK=m.Gcc*(temp.c-tc),qRC=m.Grc*(temp.r-temp.c);
    temp.w+=(L.cu-qWC-qWK)/m.Cw*h;
    temp.c+=(0.8*L.fe+L.mech+qWC+qRC-qCK)/m.Cc*h;
    temp.r+=(0.2*L.fe+(L.rcu||0)-qRC)/m.Cr*h;
  }
  return temp;
}
// The steady temperatures a held operating point settles at (C): the same network with the capacities let go.
// In steady state the winding sheds its copper loss to the core (a share a = Gwc/(Gwc+Gwk)) and straight to the
// coolant (the rest), the rotor its iron share across the gap, and the core all it receives to the coolant:
//   Tc = tc + (fe + mech + a cu) / (Gcc + a Gwk),  Tw = (cu + Gwc Tc + Gwk tc)/(Gwc + Gwk),  Tr = Tc + 0.2 fe / Grc
// The losses depend on the temperatures (resistance, flux), so it is iterated to a fixed point. The copper's resistance
// rises with its temperature, so the copper loss feeds itself: where that gain reaches one there is no steady state at
// all (thermal runaway), and the point cannot be held however long it is waited for. That returns Infinity.
function motorSteadyTemps(m,T,rpm,Vdc){
  const tc=m.cool.tCool,a=m.Gwc/(m.Gwc+m.Gwk);
  let temp={w:tc,c:tc,r:tc};
  for(let k=0;k<60;k++){
    const L=motorLosses(m,T,rpm,Vdc,temp);
    const rc=L.rcu||0,Tc=tc+(L.fe+L.mech+a*L.cu+rc)/(m.Gcc+a*m.Gwk);
    const next={w:(L.cu+m.Gwc*Tc+m.Gwk*tc)/(m.Gwc+m.Gwk),c:Tc,r:Tc+(0.2*L.fe+rc)/m.Grc};
    if(!(next.w<1000)||!(next.r<2000))return {w:Infinity,c:Infinity,r:Infinity};
    if(Math.abs(next.w-temp.w)<1e-3){temp=next;break;}
    temp=next;
  }
  return temp;
}

// ---- the battery ----
// Cells by chemistry: open-circuit voltage at 0, 10 … 100% charge (V), the loaded cut-off, resistance times capacity
// (Ohm Ah: a 5 Ah 2170 cell is ~22 mOhm, a 173 Ah LFP prism ~0.6 mOhm, both ~0.1), the sustained discharge rate (C),
// the charge rate a cell takes back under braking (C: lithium plating limits NCA to ~1C, LFP takes ~1.5C, hybrid NiMH
// cells are built for 5C+, lead-acid accepts little; build 180),
// and the year it reached cars. Technology follows the year (decision 9): the cell's specific energy (Wh/kg) and the
// pack's price ($/kWh) at anchor years, straight between them and held beyond. A decade is too coarse to step on:
// lithium packs fell from ~$1100/kWh in 2010 to ~$160 in 2019 (BloombergNEF pack surveys; ~$115 in 2024, LFP ~$95).
// Lead-acid and NiMH from the GM EV1's era. Specific energies are typical cells (a 2170 ~260 Wh/kg, a 2020s LFP ~175).
const CHEM={
  lead:{label:'LEAD-ACID',ocv:[1.95,1.98,2.00,2.02,2.04,2.06,2.08,2.10,2.12,2.14,2.15],vMin:1.75,rAh:1.2,cMax:3,cCharge:0.3,from:1900,
        whkg:{1990:35,2020:42},cost:{1990:150,2020:150}},
  nimh:{label:'NiMH',ocv:[1.10,1.22,1.25,1.26,1.27,1.28,1.29,1.30,1.31,1.33,1.40],vMin:1.00,rAh:0.30,cMax:10,cCharge:5,from:1996,
        whkg:{1996:60,2005:70,2020:80},cost:{1996:1000,2005:700,2020:400}},
  lfp: {label:'LFP',ocv:[2.80,3.15,3.20,3.22,3.24,3.25,3.26,3.27,3.28,3.30,3.40],vMin:2.50,rAh:0.10,cMax:4,cCharge:1.5,from:2005,
        whkg:{2005:90,2015:140,2023:175},cost:{2005:1400,2010:1000,2016:280,2019:140,2024:95}},
  nca: {label:'NCA / NMC',ocv:[2.95,3.40,3.50,3.57,3.63,3.69,3.77,3.85,3.93,4.02,4.13],vMin:2.80,rAh:0.11,cMax:6,cCharge:1.0,from:2008,
        whkg:{2008:180,2012:240,2020:270},cost:{2008:1300,2010:1100,2013:650,2016:300,2019:160,2024:115}},
  // power cells (build 183): the same chemistry built for current, not energy - thinner electrodes, more tab and current
  // collector per amp-hour. The Model S Plaid's 18650s: its 110s72p pack sustains ~2300 A, ~9C. Less energy per kg and
  // dearer per kWh for it.
  ncaP:{label:'NCA (POWER CELLS)',ocv:[2.95,3.40,3.50,3.57,3.63,3.69,3.77,3.85,3.93,4.02,4.13],vMin:2.80,rAh:0.06,cMax:10,cCharge:1.5,from:2012,
        whkg:{2012:200,2020:235},cost:{2012:900,2016:360,2019:200,2024:140}},
  // hybrid cells (build 186): lithium-ion built for a pack that is mostly power and little energy, cycled shallow
  // thousands of times a day; a 1.5 kWh pack gives and takes 30-40 kW (the Ioniq Hybrid's 1.56 kWh LiPo, ~25C).
  liHEV:{label:'Li-ION (HYBRID CELLS)',ocv:[3.30,3.50,3.58,3.63,3.68,3.73,3.79,3.86,3.94,4.03,4.13],vMin:2.80,rAh:0.025,cMax:25,cCharge:20,from:2009,
        whkg:{2009:70,2016:85,2024:100},cost:{2009:2200,2016:1100,2024:700}},
  // nickel-metal hydride hybrid cells (build 189): the Prius's since 1997, prismatic 6.5 Ah cells in 7.2 V modules built for
  // current (the 4th generation's 168 cells: 1.31 kWh, ~0.35 ohm, ~20 kW out and in, 40 kg).
  nimhHEV:{label:'NiMH (HYBRID CELLS)',ocv:[1.10,1.22,1.25,1.26,1.27,1.28,1.29,1.30,1.31,1.33,1.40],vMin:1.00,rAh:0.012,cMax:20,cCharge:15,from:1997,
        whkg:{1997:42,2016:52},cost:{1997:1500,2016:700}}
};
// Cell mass over pack mass: modules, structure, cooling and wiring take the rest. Large prismatic cells packed without
// modules (cell-to-pack LFP, from 2020) waste least.
const PACK_FACTOR={1990:0.75,2000:0.62,2015:0.62,2020:0.68}, PACK_FACTOR_CTP=0.82;
// A quantity at a year from anchor years: straight between them, held beyond the first and last.
function atYear(tab,year){
  const ys=Object.keys(tab).map(Number).sort((a,b)=>a-b),y=year||2020;
  if(y<=ys[0])return tab[ys[0]];
  for(let i=1;i<ys.length;i++)if(y<=ys[i])return tab[ys[i-1]]+(tab[ys[i]]-tab[ys[i-1]])*(y-ys[i-1])/(ys[i]-ys[i-1]);
  return tab[ys[ys.length-1]];
}
const chemAvailable=(c,year)=>(CHEM[c]||CHEM.nca).from<=(year||2020);
// The pack a design describes. s: {chem, series (cells in series), kWh, year}.
function packBuild(s){
  const c=CHEM[s.chem]||CHEM.nca, year=s.year||2020;
  const vCell=c.ocv.reduce((a,b)=>a+b,0)/c.ocv.length, Vnom=s.series*vCell;
  const Ah=s.kWh*1000/Vnom, R=s.series*c.rAh/Ah*1.1;                // +10%: busbars, contactors, fuse
  const ctp=s.chem==='lfp'&&year>=2020;
  const mass=s.kWh*1000/atYear(c.whkg,year)/(ctp?PACK_FACTOR_CTP:atYear(PACK_FACTOR,year));
  const cost=Math.round(s.kWh*atYear(c.cost,year));
  return {s,chem:c,year,Vnom,pChargeMax:c.cCharge*s.kWh*1000,Ah,R,kWh:s.kWh,mass,cost,series:s.series,vMin:s.series*c.vMin,iMax:c.cMax*Ah};
}
// Open-circuit voltage at a state of charge (0..1).
function packOcv(b,soc){
  const t=b.chem.ocv,x=Math.max(0,Math.min(1,soc))*10,k=Math.min(9,Math.floor(x));
  return b.series*(t[k]+(t[k+1]-t[k])*(x-k));
}
// Drawing P watts (negative: charging) at a state of charge: the terminal voltage, the current and the heat in the cells.
// The current solves P = (Voc - I R) I; null if the pack cannot give that much (past the cut-off or the rate).
function packDraw(b,soc,P){
  const V0=packOcv(b,soc),disc=V0*V0-4*b.R*P;
  if(disc<0)return null;
  const I=(V0-Math.sqrt(disc))/(2*b.R),V=V0-I*b.R;
  if(P>0&&(V<b.vMin||I>b.iMax))return null;
  return {V,I,heat:I*I*b.R};
}
// The pack's temperature (build 180): one lumped node, the cells' heat capacity (~1000 J/kgK) over the pack's mass, a
// liquid cooling plate taking ~2 W/K per kWh to coolant at 30 C. The battery management system cuts the power it allows
// from 50 C, to nothing at 60 C, the range the cells' makers rate them to.
const PACK_C=900, PACK_G_KWH=2.0, PACK_COOLANT=30;
function packHeatStep(b,temp,heatW,dt){
  const C=PACK_C*b.mass,G=PACK_G_KWH*b.kWh;
  temp.b+=(heatW-G*(temp.b-PACK_COOLANT))/C*dt;
  return temp;
}
const packDerate=tB=>clamp((60-tB)/10,0,1);
// The most a pack can give at a state of charge (W): the lower of its rate limit and the power at its cut-off voltage.
function packMaxPower(b,soc){
  const V0=packOcv(b,soc),Icut=(V0-b.vMin)/b.R,I=Math.min(b.iMax,Icut);
  return Math.max(0,(V0-I*b.R)*I);
}
// An electric car's battery management at a low charge (build 196): below 15% it cuts the power it allows, steeply, to 30%
// of what the cells could give at 2%; below 2% the car limps, on a tenth of the pack's rated power (its power at 50%),
// enough to move it off the road. Above 15% it allows all the cells give.
const EV_BMS={low:0.15,limp:0.02,lowFloor:0.3,limpShare:0.1};
function evBmsShare(soc){
  const B=EV_BMS;
  return soc>=B.low?1:soc>=B.limp?B.lowFloor+(1-B.lowFloor)*(soc-B.limp)/(B.low-B.limp):0;
}
function evBmsPower(b,soc){
  const P=packMaxPower(b,soc),limp=Math.min(P,EV_BMS.limpShare*packMaxPower(b,0.5));
  return soc<EV_BMS.limp?limp:Math.max(limp,P*evBmsShare(soc));   // the cut never takes it below the limp power
}
