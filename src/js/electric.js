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
// The motor measured here is the Tesla Model 3 rear motor (2018 Long Range), as taken apart and measured by MotorXP
// (Performance Analysis of the Tesla Model 3 Electric Motor, June 2020): 54 slots, stator 225 / 151.3 mm, stack 134 mm,
// rotor 149.9 mm, 3 pole pairs, 12 series turns per phase (2 turns, 3 paths), 4.75 mOhm per phase, a single V of two
// 33 x 6.5 mm NdFeB magnets a pole (segments 21.5 mm long down the stack), 42 V peak line-to-line per 1000 rpm, 430 Nm
// at 953 A rms needing 94.6 V rms per phase.
// The air gap's flux comes from the magnets through a magnetic circuit (build 292, magnetCircuit below). Since build 294
// the same circuit is solved under load, slice by slice round a pole (dqSolve): the stator's current adds its MMF, the
// teeth saturate on the steel's curve, and what comes out is the torque, the d and q flux linkages and the iron's flux
// densities. Saturation (SAT_K), the voltage drop (V_DROP), the constant-power range (CPSR) and the field-weakening
// current are no longer constants: they are what that solution gives under the inverter's current and voltage.
// Everything here is either geometry, a material's datasheet figure, or a textbook rule, named where it is used.
// tests/test96.mjs checks the model against the Model 3's measured back-EMF and resistance and its published power, and
// the 2012 Nissan Leaf as measured by ORNL (Burress, Benchmarking State-of-the-Art Technologies,
// 2013): 80 kW held at 7000 rpm with the stator settling near 135 C, peak motor efficiency above 97%.
const RHO_CU=1.72e-8, ALPHA_CU=0.00393, RHO_FE=7650, RHO_CU_M=8960;
const KW_WIND=0.93;        // winding factor: distributed, q = 2-3 slots per pole per phase, short-pitched
const SPLIT=0.67;          // bore over stator outside diameter (Model 3 0.672, Leaf 0.66; 0.6-0.7 for traction motors)
const GAP=0.0007;          // air gap (m): 0.7 mm, the Model 3's
const FILL=0.40;           // copper fills 40% of a slot (stranded)
// The teeth and the yoke are sized from the flux they carry (build 293): a tooth as wide as puts the air gap's peak field
// at the tooth's design density, the yoke as deep as carries half a pole's flux at the yoke's; the slot is what is left
// between the bore and the yoke. Design densities from Pyrhonen, Pyrhonen & Hrabovcova, Design of Rotating Electrical
// Machines (2nd ed., 2014), Table 6.1, "Permitted flux densities of the magnetic circuit": the top of each range, as a
// traction motor is built denser than the standard machines the table is for. A magnet motor takes the salient-pole
// synchronous column (the book groups PMSMs with it in Table 6.2): tooth, apparent maximum, 1.6-2.0 T; stator yoke
// 1.0-1.5 T. An induction motor takes the asynchronous one: tooth 1.4-2.1 T, yoke 1.4-1.7 T. The Model 3 runs its yoke
// above that, ~1.85 T with no current (its teardown's 17.7 mm yoke through magnetCircuit), so its yoke comes out ~4 mm
// deeper here than it is.
const B_TOOTH=2.0, B_YOKE=1.5, IM_B_TOOTH=2.1, IM_B_YOKE=1.7;
// Round magnet wire, 1.0 mm. That is a usual stranded size for this fill, not a strand measured on the Model 3
// (that motor is a hairpin, which is a later choice). A build may pass s.strand (m) to try another.
const STRAND=0.001;
// The winding (stage 6, build 236): how the copper sits in the slot, and what it is made of. Both act through the slot's
// copper area, its resistivity, its mass and its price; nothing multiplies a torque or an efficiency.
//   ROUND     stranded magnet wire at the 40% fill above (FILL): today's winding, so every factory motor stays on it.
//   HAIRPIN   rectangular bars bent into hairpins and welded: about 70% of the slot is copper ("about 70%", Charged EVs,
//             "A closer look at hairpin motor windings", 2020; Ansys gives up to ~0.8 and an ORNL/OSTI traction-motor
//             study 0.63-0.64, so PROBABLE). Four conductors per slot, the Model 3's own layout (MotorXP: 54 slots, 12
//             series turns as 2 turns in 3 paths, double layer: 6·12·3/54 = 4). A bar is one tall conductor, so its AC
//             loss is Dowell's on that height, with the slot's porosity: more copper and less DC resistance, but more
//             loss at high frequency, as the plan says it must.
const WIRE={round:{label:'ROUND (STRANDED)',fill:FILL,layers:0},hairpin:{label:'HAIRPIN',fill:0.70,layers:4}};
// The conductor. Copper is the annealed copper standard (IEC 60028: 0.017241 ohm mm²/m at 20 C, 0.393%/K; the model's
// RHO_CU and ALPHA_CU), 8960 kg/m³, 385 J/kg K, $11/kg as before. Aluminium for windings, 61% IACS: 0.028264 ohm mm²/m at
// 20 C and 0.403%/K (IEC 60889), 2703 kg/m³, 897 J/kg K, at about 30% of copper's price per kilogram (Redalyc, Ingeniería e
// Investigación, citing Sullivan 2007 and Widmer et al. 2014-16; PROBABLE, prices move): $3.3/kg. Its own higher heat
// capacity per kilogram is kept; its lower thermal conductivity in the slot is not modelled (the liner dominates).
const CONDUCTOR={copper:{label:'COPPER',rho:RHO_CU,alpha:ALPHA_CU,dens:RHO_CU_M,cp:385,cost:11},
  aluminium:{label:'ALUMINIUM',rho:2.8264e-8,alpha:0.00403,dens:2703,cp:897,cost:3.3}};
// Non-oriented silicon steel, 0.35 mm (M270-35A class): about 2.7 W/kg at 1.5 T 50 Hz and 19 W/kg at 1.0 T 400 Hz.
// Split into hysteresis (∝ f B²) and eddy (∝ (t f B)²), solved from those two points; a thinner sheet cuts only the eddy.
const FE_KH=0.0206, FE_KE=6.71e-5, FE_T_REF=0.35;
// Sheet thickness, the player's choice (stage 1). Eddy loss already scales with (t/0.35)²; hysteresis does not.
// 0.35 mm is the M270-35A the two Steinmetz points were solved from. 0.20 mm is the thin non-oriented gauge
// (NO20). The iron's $3/kg is the 0.35 mm price, so the thin gauge is a premium on top of it, not a new price
// for every motor: about $4/kg of iron, the gap between a 0.35 mm non-oriented coil near $4/kg and a thin
// EV-grade coil near $8/kg (Huaxiao Alloy, "How Much Does Electrical Steel Cost?", 2025 — a supplier's survey,
// so probable, not a standard).
const LAMINATION={'0.35':{mm:0.35,label:'0.35 mm',premium:0},'0.20':{mm:0.2,label:'0.20 mm',premium:4}};
// How hard lifting off and braking run the motor as a generator (stage 2). The same three steps a hybrid's
// REGENERATION uses: all the motor and the pack can take back, half of that, or none. The table still starts
// at 500 rpm, so a stop fades out at any of the three.
const EV_REGEN={off:{label:'OFF',k:0},low:{label:'LOW',k:0.5},high:{label:'HIGH',k:1}};
const laminationOf=mm=>Math.abs(+mm-0.2)<0.02?LAMINATION['0.20']:LAMINATION['0.35'];
// Magnets: remanence at 20 C (T), its temperature coefficient (/K), the highest temperature before the coercivity
// gives way and the loss is permanent (C), and the price ($/kg). SH and UH grades: Hcj >= 20 kOe and 25 kOe.
// Build 292: the recoil permeability (mur: sintered NdFeB 1.05, sintered ferrite 1.1, the makers' usual figures) and the
// density (kg/m3: NdFeB 7500-7600, ferrite 4800-5000).
const MAGNET={
  ferrite:{label:'FERRITE',Br:0.42,alpha:-0.0020,Tmax:250,cost:6,mur:1.1,rho:4900},
  ndfeb:  {label:'NdFeB (SH)',Br:1.28,alpha:-0.0012,Tmax:150,cost:60,mur:1.05,rho:7500},
  ndfebDy:{label:'NdFeB + Dy (UH)',Br:1.23,alpha:-0.0011,Tmax:180,cost:95,mur:1.05,rho:7500}
};
// ---- the magnets as geometry (build 292) ----
// A pole is a V of two magnet bars buried under the rotor's surface, as the Model 3's (MotorXP's teardown). The design
// sets the bar's thickness (magT, mm, along its magnetisation) and the two bars' width together as a share of the pole
// pitch (magW); the pole's face spans that share. Defaults are the Model 3's: 6.5 mm, and 2 x 33 mm on its 78.5 mm pitch.
const MAG_T=6.5, MAG_W=0.84;
// Six 21.5 mm segments fill 129 of the 134 mm stack.
const MAG_AX=129/134;
// The steel bridges that hold the bars in carry flux round the magnet's ends without crossing the gap, saturated: two at
// the rotor's surface and the rib at the V's root, each the full stack long. The Model 3's are too thin to read off the
// teardown's drawing: 1 mm each at the surface and 2 mm for the rib are usual sizes (PROBABLE). A carbon sleeve keeps them.
const BRIDGE_W=0.004;
// The stator's slot opening, for Carter's factor on the gap: 2 mm, a usual semi-closed slot (PROBABLE; not readable on
// the drawing either).
const SLOT_OPEN=0.002;
// The core steel's magnetisation curve: M270-35A's typical polarisation, 1.54 / 1.65 / 1.77 T at 2500 / 5000 / 10000 A/m,
// and its relative permeability 700 at 1.5 T (EN 10106 grade tables, typical values: UCLouvain ELEC2311, "Non-oriented
// fully processed steels"; Tata Steel's M250-35A sheet gives 1.53 / 1.64 / 1.76). Above 10 kA/m it approaches 3% silicon
// iron's saturation polarisation, ~2.03 T, as Js - a/H (the law of approach to saturation; Js PROBABLE). B = J + mu0 H.
const FE_JS=2.03, FE_H=[0,1705,2500,5000,10000], FE_J=[0,1.5,1.54,1.65,1.77];
const MU0=4e-7*Math.PI;
function steelH(B){   // A/m for a flux density B (T)
  for(let i=1;i<FE_H.length;i++){
    const B1=FE_J[i]+MU0*FE_H[i];
    if(B<=B1){const B0=FE_J[i-1]+MU0*FE_H[i-1];return FE_H[i-1]+(B-B0)/(B1-B0)*(FE_H[i]-FE_H[i-1]);}
  }
  const a=(FE_JS-FE_J[4])*FE_H[4],d=FE_JS-B;   // B = Js - a/H + mu0 H
  return (-d+Math.sqrt(d*d+4*MU0*a))/(2*MU0);
}
// The pole piece over the V carries the q-axis flux across the pole, through the iron between the rotor's surface and
// the bars: deepest at the V's root, down to the surface bridge (1 mm, as above) at the face's edges. The V's bars lean
// V_PHI to the rotor's surface: the Model 3's open V, ~140 deg between the bars, read off MotorXP's section (PROBABLE).
const V_PHI=20*Math.PI/180, POLE_EDGE=0.001;
// The end windings' leakage: Pyrhonen 2014, 4.3.3, L_w = (4m/Q) q N^2 mu0 l_w lambda_w, with lambda_w ~0.3 for a
// double-layer winding (the book's range is 0.2-0.5; PROBABLE).
const LAMBDA_W=0.3;
// The air gap's flux from the magnets (T): the flat-topped field over the pole's face, its fundamental, and the flux
// densities it puts in the stator's teeth and yoke. Per pole, round one loop: the magnet's thickness, the gap (with
// Carter's factor), a tooth's length and half the yoke between two poles' centres. The magnet is a straight line,
// B = Br + mu0 mur H; the bridges take Js times their width before any flux reaches the gap; the teeth and yoke follow
// the steel's curve, the yoke's flux rising as a sine from a pole's centre to the gap between poles (integrated along
// it). The rotor's own iron is wide and left out. Solved by bisection: the gap's flux falls as the iron takes MMF.
function magnetCircuit(g){
  const {Br,mur,magT,magW,tau,L,Lfe,gap,ts,h,OD,poles}=g;
  const r=SLOT_OPEN/gap,kc=ts/(ts-r*r/(5+r)*gap),gp=kc*gap;
  const alpha=Math.min(1,magW),Am=magW*tau*MAG_AX*L,Ag=alpha*tau*L,leak=FE_JS*BRIDGE_W*Lfe;
  const yokeF=(By,tauY)=>{let F=0;for(let i=0;i<12;i++)F+=steelH(By*Math.sin(Math.PI*(i+0.5)/24));return F*tauY/2/12;};
  const at=Bg=>{const st=statorFrom(Bg,Bg*Ag,ts,h,Lfe,B_TOOTH,B_YOKE),Bt=Bg*ts/(0.95*st.wt),By=Bg*Ag/(2*st.hy*Lfe);
    return {Bt,By,st,F:Bg*gp/MU0+toothH(Bt,ts/(0.95*st.wt)-1)*st.hSlot+yokeF(By,Math.PI*(OD-st.hy)/poles)};};
  let lo=0,hi=Br*Am/Ag;
  for(let k=0;k<40;k++){const Bg=(lo+hi)/2,Hm=-at(Bg).F/magT;
    if((Am*(Br+MU0*mur*Hm)-leak)/Ag>Bg)lo=Bg;else hi=Bg;}
  const Bg=Math.max(0,(lo+hi)/2),x=at(Bg);
  return {Bflat:Bg,B1:4/Math.PI*Bg*Math.sin(alpha*Math.PI/2),Bt:x.Bt,By:x.By,kc,st:x.st};
}
// A saturated tooth's field (A/m) for its apparent flux density Ba, the slot pitch's flux put through the tooth alone:
// part of it goes down the slot beside it, Ba = B + mu0 H k with k the slot's width over the tooth's (Pyrhonen 2014,
// section 3.5, the apparent and real tooth flux density). Solved for the real B by bisection.
function toothB(Ba,k){
  let lo=0,hi=Ba;
  for(let i=0;i<40;i++){const b=(lo+hi)/2;if(b+MU0*steelH(b)*k<Ba)lo=b;else hi=b;}
  return (lo+hi)/2;
}
const toothH=(Ba,k)=>steelH(toothB(Ba,k));
// ---- the circuit under load: the d and q axes (build 294) ----
// One pole, electrical angle th from the d-axis (-90 to 90 deg), in DQ_SLICES slices. Each slice is a loop: the rotor's
// surface, the gap (Carter's factor), a tooth (the steel's curve, toothH) and the stator's yoke. The rotor's potential is
// the pole piece's under the pole's face, one equipotential iron (it carries the q-axis flux across freely, which is
// where an interior-magnet rotor's saliency comes from), and the hub's, zero, between the poles. The stator's current
// adds its MMF, Fd cos th + Fq sin th per pole, with F = 3 sqrt2 kw N I / (pi p) for I amps rms (Pyrhonen 2014, 2.13).
// The pole piece's potential is what makes the face's flux equal what the magnets give at that MMF (their line,
// B = Br + mu0 mur H, less the saturated bridges), and the yoke's potential follows its own flux, the gap's flux added up
// from the pole's edge, on the same curve. Out come the gap field's fundamentals on each axis, so the flux linkages, the
// torque T = 3/2 p (psi_d i_q - psi_q i_d), and the peak flux densities in the teeth, the yoke and the gap.
const DQ_SLICES=36, DQ_N=13, DQ_KBR=0.8;
function dqSetup(m){
  const st=m.circ.st,ts=Math.PI*m.Ds/m.slots,kT=ts/(0.95*st.wt),gp=m.circ.kc*GAP,NB=150,BM=3.2,FB=new Float64Array(NB+1);
  for(let i=0;i<=NB;i++){const B=i*BM/NB;FB[i]=B*gp/MU0+toothH(B*kT,kT-1)*st.hSlot;}
  const n=DQ_SLICES,tau=Math.PI*m.D/m.poles,cos=[],sin=[],face=[],dep=[],half=Math.min(1,m.magW)*tau/2;
  for(let i=0;i<n;i++){const th=-Math.PI/2+(i+0.5)*Math.PI/n,x=th/Math.PI*tau;cos.push(Math.cos(th));sin.push(Math.sin(th));
    face.push(Math.abs(x)<half);dep.push(POLE_EDGE+Math.max(0,half-Math.abs(x))*Math.tan(V_PHI));}
  const Am=Math.min(1,m.magW)*tau*MAG_AX*m.L;
  // Pyrhonen 2014, 4.2: a slot's leakage inductance, (4m/Q) mu0 l N^2 lambda, lambda = h/(3b) for a slot full of copper
  const slotW=Math.PI*(m.Ds+st.hSlot)/m.slots-st.wt,q=m.slots/(3*m.poles),lw=m.mlt/2-m.L;
  const Ls=12/m.slots*MU0*m.N*m.N*(m.L*st.hSlot/(3*Math.max(1e-4,slotW))+q*lw*LAMBDA_W);
  return {FB,NB,BM,kT,gp,hSlot:st.hSlot,cos,sin,face,wL:m.L*tau/n,dy:Math.PI*(m.OD-st.hy)/m.poles/n,hy:st.hy,Lfe:m.Lfe,
    Am,leak:FE_JS*BRIDGE_W*m.Lfe,magT:m.magT,mur:m.mag.mur,Br:m.mag.Br,fPerA:3*Math.SQRT2*KW_WIND*m.N/(Math.PI*m.p),
    psiPerB:KW_WIND*m.N*2/Math.PI*tau*m.Lfe,Ls,dep,dx:tau/n,B:new Float64Array(n),Uy:new Float64Array(n),Hy:new Float64Array(n)};
}
function dqBinv(c,F){   // a slice's gap field (T) for the MMF across its gap and tooth (A)
  const a=Math.abs(F),FB=c.FB;let B;
  if(a>=FB[c.NB])B=c.BM+(a-FB[c.NB])*(c.BM/c.NB)/(FB[c.NB]-FB[c.NB-1]);
  else{let lo=0,hi=c.NB;while(hi-lo>1){const k=(lo+hi)>>1;if(FB[k]<=a)lo=k;else hi=k;}B=(lo+(a-FB[lo])/(FB[hi]-FB[lo]))*c.BM/c.NB;}
  return F<0?-B:B;
}
function dqSolve(c,Fd,Fq,kBr){
  const n=DQ_SLICES,B=c.B,Uy=c.Uy,Hy=c.Hy,Br=kBr*c.Br,Um=Br*c.magT/(MU0*c.mur),X=Um+Math.abs(Fd)+Math.abs(Fq);
  Uy.fill(0);let Ur=0,dU=0,ByMax=0;
  // the pole piece as two halves, each one potential: the trailing half dU/2 above the pole's, the leading half below
  const gapF=(i,U,d)=>(c.face[i]?U+(c.sin[i]<0?d/2:-d/2):0)+Fd*c.cos[i]+Fq*c.sin[i]-Uy[i];
  for(let it=0;it<6;it++){
    let lo=-X,hi=Um;
    for(let k=0;k<32;k++){
      const U=(lo+hi)/2;let ph=0;
      for(let i=0;i<n;i++)if(c.face[i])ph+=dqBinv(c,gapF(i,U,dU));
      if(c.Am*(Br-MU0*c.mur*U/c.magT)-c.leak>ph*c.wL)lo=U;else hi=U;
    }
    Ur=(lo+hi)/2;
    // dU: the drop the crossing flux takes between the halves' middles (the face's flux less the magnets' even share,
    // added up from the trailing edge); more dU lets less flux cross, so the two meet once (bisection)
    let a=-X,b=X;
    for(let k=0;k<24;k++){
      const d=(a+b)/2;let Pf=0,nf=0;
      for(let i=0;i<n;i++)if(c.face[i]){B[i]=dqBinv(c,gapF(i,Ur,d));Pf+=B[i];nf++;}
      const Bm=Pf/Math.max(1,nf);let pl=0,drop=0,j=0;
      for(let i=0;i<n;i++){if(!c.face[i])continue;
        const ph=-(pl+(B[i]-Bm)*c.wL/2),Bl=ph/(c.dep[i]*c.Lfe);pl+=(B[i]-Bm)*c.wL;
        if(j>=nf/4&&j<3*nf/4)drop+=(Bl<0?-1:1)*steelH(Math.abs(Bl))*c.dx;j++;}
      if(drop>d)a=d;else b=d;
    }
    dU=(a+b)/2;let P=0;
    for(let i=0;i<n;i++){B[i]=dqBinv(c,gapF(i,Ur,dU));P+=B[i];}
    let phi=-P*c.wL/2,sH=0;ByMax=0;
    for(let i=0;i<n;i++){const By=(phi+B[i]*c.wL/2)/(c.hy*c.Lfe),a=Math.abs(By);Hy[i]=(By<0?-1:1)*steelH(a);sH+=Hy[i];
      if(a>ByMax)ByMax=a;phi+=B[i]*c.wL;}
    let acc=0;for(let i=0;i<n;i++){Uy[i]=(0.5*sH-acc-Hy[i]/2)*c.dy;acc+=Hy[i];}
  }
  let b1d=0,b1q=0,bMax=0,b2=0;
  for(let i=0;i<n;i++){b1d+=B[i]*c.cos[i];b1q+=B[i]*c.sin[i];const a=Math.abs(B[i]);if(a>bMax)bMax=a;b2+=B[i]*B[i];}
  return {b1d:2*b1d/n,b1q:2*b1q/n,Bt:toothB(bMax*c.kT,c.kT-1),By:ByMax,Bg2:b2/n};
}
// The tables a motor is run from, built on first use: the solution over a grid of d and q currents (Id from -Imax to 0,
// Iq from 0 to Imax, mirrored for regeneration), at the magnets' full remanence and at DQ_KBR of it, read between them
// for the magnets' temperature; and the most torque per amp (MTPA) at each current.
const DQ_KEYS=['T','pd','pq','Bt','By','Bg2'];
function dqTables(m){
  if(m.dq)return m.dq;
  const c=m.dqc,N=DQ_N,I=m.Imax,p=m.p,lev=[];
  for(const kBr of [1,DQ_KBR]){
    const g={};for(const k of DQ_KEYS)g[k]=new Float64Array(N*N);
    for(let a=0;a<N;a++)for(let b=0;b<N;b++){
      const Id=-I*(N-1-a)/(N-1),Iq=I*b/(N-1),r=dqSolve(c,c.fPerA*Id,c.fPerA*Iq,kBr),j=a*N+b;
      g.pd[j]=c.psiPerB*r.b1d;g.pq[j]=c.psiPerB*r.b1q;g.T[j]=1.5*p*Math.SQRT2*(g.pd[j]*Iq-g.pq[j]*Id);
      g.Bt[j]=r.Bt;g.By[j]=r.By;g.Bg2[j]=r.Bg2;
    }
    lev.push(g);
  }
  m.dq={lev,cache:new Map(),ops:new Map()};
  for(const g of lev){g.mtpa=[];for(let k=0;k<N;k++)g.mtpa.push(dqMtpaAt(m,g,I*k/(N-1)));}
  return m.dq;
}
function dqGrid(m,g,Id,Iq,out){   // bilinear on one level; Iq < 0 by the mirror (psi_q and the torque change sign)
  const N=DQ_N,I=m.Imax,sq=Iq<0?-1:1,x=Math.min(N-1,Math.max(0,(Id/I+1)*(N-1))),y=Math.min(N-1,Math.max(0,Math.abs(Iq)/I*(N-1)));
  const a=Math.min(N-2,Math.floor(x)),b=Math.min(N-2,Math.floor(y)),u=x-a,v=y-b,j=a*N+b;
  for(const k of DQ_KEYS){const t=g[k];out[k]=(t[j]*(1-u)+t[j+N]*u)*(1-v)+(t[j+1]*(1-u)+t[j+N+1]*u)*v;}
  if(sq<0){out.T=-out.T;out.pq=-out.pq;}
  return out;
}
const dqW=(m,tMag)=>(1-(1+m.mag.alpha*(tMag-20)))/(1-DQ_KBR);
function dqAt(m,Id,Iq,tMag){
  const L=(m.dq||dqTables(m)).lev,w=dqW(m,tMag),A=dqGrid(m,L[0],Id,Iq,{}),B=dqGrid(m,L[1],Id,Iq,{});
  for(const k of DQ_KEYS)A[k]+=w*(B[k]-A[k]);
  return A;
}
// The torque and the two linkages only, without allocating: the inner loops' lookup.
const DQ_O={T:0,pd:0,pq:0};
function dqFast(m,Id,Iq,tMag){
  const L=(m.dq||dqTables(m)).lev,w=dqW(m,tMag),N=DQ_N,I=m.Imax;
  const x=Math.min(N-1,Math.max(0,(Id/I+1)*(N-1))),y=Math.min(N-1,Math.max(0,Math.abs(Iq)/I*(N-1)));
  const a=Math.min(N-2,Math.floor(x)),b=Math.min(N-2,Math.floor(y)),u=x-a,v=y-b,j=a*N+b;
  const k00=(1-u)*(1-v),k10=u*(1-v),k01=(1-u)*v,k11=u*v,g0=L[0],g1=L[1];
  const f=t=>t[j]*k00+t[j+N]*k10+t[j+1]*k01+t[j+N+1]*k11;
  let T=f(g0.T),pd=f(g0.pd),pq=f(g0.pq);T+=w*(f(g1.T)-T);pd+=w*(f(g1.pd)-pd);pq+=w*(f(g1.pq)-pq);
  if(Iq<0){T=-T;pq=-pq;}
  DQ_O.T=T;DQ_O.pd=pd;DQ_O.pq=pq;return DQ_O;
}
function dqMtpaAt(m,g,I){   // the current's angle from the q-axis that gives the most torque (golden section, 0-80 deg)
  if(!(I>0))return {g:0,T:0};
  const o={},T=gm=>dqGrid(m,g,-I*Math.sin(gm),I*Math.cos(gm),o).T,r=0.618034;
  let a=0,b=80*Math.PI/180;
  for(let k=0;k<30;k++){const x1=b-r*(b-a),x2=a+r*(b-a);if(T(x1)<T(x2))a=x1;else b=x2;}
  const gm=(a+b)/2;return {g:gm,T:T(gm)};
}
function dqMtpa(m,I,tMag){   // MTPA at a current, read between the levels
  const L=(m.dq||dqTables(m)).lev,w=dqW(m,tMag),N=DQ_N,x=Math.min(N-1,Math.max(0,I/m.Imax*(N-1))),a=Math.min(N-2,Math.floor(x)),u=x-a;
  const at=g=>({g:g.mtpa[a].g+u*(g.mtpa[a+1].g-g.mtpa[a].g),T:g.mtpa[a].T+u*(g.mtpa[a+1].T-g.mtpa[a].T)});
  const A=at(L[0]),B=at(L[1]);return {g:A.g+w*(B.g-A.g),T:A.T+w*(B.T-A.T)};
}
// The phase voltage's peak (V) at a point: v_d = R i_d - we psi_q, v_q = R i_q + we psi_d, the slot leakage added to the
// gap's linkage. The inverter gives at most Vdc/sqrt3 (space-vector modulation).
function dqVolt(m,q,Id,Iq,we,R){
  const id=Math.SQRT2*Id,iq=Math.SQRT2*Iq,pd=q.pd+m.dqc.Ls*id,pq=q.pq+m.dqc.Ls*iq;
  return Math.hypot(R*id-we*pq,R*iq+we*pd);
}
// The tooth and yoke for a peak gap field Bpk (T) and a pole's flux phi (Wb), at the design densities; neither may take
// more than 80% of the slot pitch or of the radial band, so an over-fluxed design saturates rather than losing its slots.
function statorFrom(Bpk,phi,ts,h,Lfe,bT,bY){
  const wt=Math.min(0.8*ts,Bpk*ts/(0.95*bT)), hy=Math.min(0.8*h,phi/(2*Lfe*bY));
  return {wt,hy,hSlot:h-hy};
}
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
const IM_BG=0.8, IM_GAP=0.0005, IM_KCS=2.0, IM_CPSR=3, IM_HR=0.12, IM_RING=0.08;
// The voltage at full current: the leakage flux of the stator and the rotor rides on the torque current, sigma Lm Iq,
// with the total leakage factor sigma ~0.08 for a traction design (0.05-0.1); against the magnetising flux Lm Im it
// adds in quadrature, so the drop over the back-EMF is sqrt(1 + (sigma Iq / Im)^2), times ~5% resistive.
const IM_SIGMA=0.08, IM_R_DROP=1.05;
const IM_ROTOR={label:'COPPER CAGE',Br:0,alpha:0,Tmax:200,cost:0};
const MOTOR_TYPE={pm:{label:'PERMANENT MAGNET'},im:{label:'INDUCTION (COPPER CAGE)'}};

// The motor a design describes, derived once. s: {rotorD mm, stackL mm, poles, turns (series per phase), magnet,
// retention, cooling, inverter, invAmps (A rms), maxRpm}.
function motorBuild(s){
  const im=s.type==='im';
  const mag=im?IM_ROTOR:MAGNET[s.magnet]||MAGNET.ndfeb, ret=im?RETENTION.bridges:RETENTION[s.retention]||RETENTION.bridges;
  const cool=MOTOR_COOLING[s.cooling]||MOTOR_COOLING.jacket, inv=INVERTER[s.inverter]||INVERTER.igbt;
  const lam=laminationOf(s.lamination);
  const wire=WIRE[s.wire]||WIRE.round, cond=CONDUCTOR[s.conductor]||CONDUCTOR.copper;
  const D=s.rotorD/1000, L=s.stackL/1000, poles=s.poles, p=poles/2, N=s.turns, Lfe=0.95*L;
  const Ds=D+2*(im?IM_GAP:GAP), OD=Ds/SPLIT, h=(OD-Ds)/2;
  const slots=3*poles*(poles<=6?3:2)*(im&&poles===4?5/3:1);       // q = 3 slots per pole per phase up to 6 poles, then 2;
                                                                    // a 4-pole induction motor runs q = 5 (the Model S's 60)
  // flux: the air gap's fundamental from the magnets' circuit (an induction motor: its design flux density), per pole,
  // linked by the winding. The magnets' bars, from the design's thickness and width (build 292).
  const tau=Math.PI*D/poles, magT=(s.magT>0?s.magT:MAG_T)/1000, magW=s.magW>0?s.magW:MAG_W;
  const ts=Math.PI*Ds/slots;
  const circ=im?null:magnetCircuit({Br:mag.Br,mur:mag.mur,magT,magW,tau,L,Lfe,gap:GAP,ts,h,OD,poles});
  const Bg=im?IM_BG:circ.B1, phiPole=2/Math.PI*Bg*tau*Lfe;
  // the teeth and yoke (build 293): from the magnets' circuit, or an induction motor's sinusoidal field at its design flux
  const st=im?statorFrom(IM_BG,phiPole/0.95,ts,h,Lfe,IM_B_TOOTH,IM_B_YOKE):circ.st, wt=st.wt, hSlot=st.hSlot, hy=st.hy;
  const psi20=KW_WIND*N*phiPole;                                    // peak flux linkage per phase at 20 C (V s)
  // copper: the band between the bore and the yoke less the teeth, at the fill; a turn runs the stack twice and round two
  // end turns
  const band=Math.PI/4*((Ds+2*hSlot)**2-Ds*Ds), slotA=band-slots*wt*hSlot, Acu=slotA*wire.fill;
  const pitch=Math.PI*(Ds+hSlot)/poles*5/6, endTurn=Math.PI/2*pitch;
  const mlt=2*L+2*endTurn;
  const R20=6*cond.rho*N*N*mlt/Acu;                                   // per phase: independent of the parallel paths
  // how the slot copper is stranded, for the AC loss: strands across the slot width, and the radial layers Dowell counts
  const dStrand=s.strand>0?s.strand:STRAND;
  const slotW=Math.PI*(Ds+hSlot)/slots-wt;
  const nStrand=(Acu/slots)/(Math.PI*dStrand*dStrand/4);
  const cuLayers=wire.layers||Math.max(1,nStrand/Math.max(1,slotW/dStrand));
  // a hairpin bar: the slot's copper height shared by its layers, the width the fill leaves (porosity sqrt(fill) each way)
  const barH=wire.layers?hSlot*Math.sqrt(wire.fill)/wire.layers:0, barEta=Math.sqrt(wire.fill);
  // masses (kg) and the rotor's inertia
  const mCu=cond.dens*Acu*mlt/2;
  const mFeS=RHO_FE*(Math.PI/4*(OD*OD-Ds*Ds)-slotA)*Lfe;
  const Dsh=0.47*D;
  const vMag=im?0:magW*Math.PI*D*magT*MAG_AX*L, mMag=im?0:mag.rho*vMag;   // the bars, all the poles round (build 292)
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
  const vDrop=im?IM_R_DROP*Math.sqrt(1+(IM_SIGMA*Math.sqrt(Math.max(0,s.invAmps**2-ImR*ImR))/Math.max(1,ImR))**2):null;
  const mFeR=RHO_FE*Math.PI/4*(D*D-Dsh*Dsh)*Lfe-RHO_FE*vMag-(im?RHO_FE*mCage/RHO_CU_M*0.9:0);
  const mRotor=mFeR+mMag+mCage, J=0.5*mRotor*((D/2)**2+(Dsh/2)**2)*(s.retention==='sleeve'&&!im?1.03:1);
  const mass=(mCu+mFeS+mRotor)*ACTIVE_TO_MOTOR;
  // speed ceilings: the rotor surface, the inverter's output frequency (1.2 kHz IGBT, 2 kHz SiC)
  const nTip=ret.vTip/(Math.PI*D)*60, nFreq=(s.inverter==='sic'?2000:1200)*60/p;
  const nMax=Math.min(s.maxRpm||20000,nTip,nFreq);
  const Imax=s.invAmps;
  const cost=Math.round(mCu*cond.cost+(mFeS+mFeR)*(3+lam.premium)+mMag*mag.cost+ret.cost+cool.cost+Imax*inv.costA+400+(im?mCage*11+150:0));
  const m={s,im,mag,ret,cool,inv,lam,wire,cond,barH,barEta,D,L,Lfe,Ds,OD,poles,p,N,slots,Bg,circ,magT,magW,wt,hSlot,hy,psi20,R20,mlt,Acu,mCu,mFeS,mFeR,mMag,mRotor,J,mass,
          strand:dStrand,cuLayers,
          nTip,nFreq,nMax,Imax,cost,Qr,Rr20,mCage,ImR,vDrop,
          // thermal network (W/K, J/K): winding -> core through the slot liner (0.2 W/mK, 0.4 mm over the slot walls),
          // core -> coolant through the housing, rotor -> core across the gap (h ~ 100), and the direct paths
          Gwc:0.2*(2*hSlot*L*slots)/0.0004,
          Gcc:Math.PI*OD*L/(1/cool.h+2e-4),
          // (spray reaches the end windings, ~50 mm out each side; slot cooling also runs along every slot wall)
          Gwk:cool.wind*(Math.PI*(Ds+hSlot)*2*0.05+(cool.inSlot?2*hSlot*L*slots:0)),
          Grc:100*Math.PI*D*L+cool.rotor*Math.PI*Dsh*L,
          Cw:cond.cp*mCu, Cc:460*mFeS+900*0.5*mFeS, Cr:460*mRotor,
          mTeeth:RHO_FE*slots*wt*hSlot*Lfe, ts, gap:im?IM_GAP:GAP};
  // a magnet motor's flux linkage at no current is the loaded circuit's at zero current (build 294)
  if(!im){m.dqc=dqSetup(m);m.psi20=m.dqc.psiPerB*dqSolve(m.dqc,0,0,1).b1d;}
  return m;
}
// Flux linkage and resistance at temperature: the magnets lose remanence as they warm, the copper gains resistance.
const motorPsi=(m,tMag)=>m.psi20*(1+m.mag.alpha*(tMag-20));   // an induction motor's alpha is 0: its flux is the field's
const motorR=(m,tW)=>m.R20*(1+(m.cond?m.cond.alpha:ALPHA_CU)*(tW-20));
// AC copper in the slots (stage 4). Dowell, Proc. IEE 113 (1966): m layers of height h,
//   Rac/Rdc = M + ((m²−1)/3) D
//   M = Δ (sinh 2Δ + sin 2Δ) / (cosh 2Δ − cos 2Δ),  D = 2Δ (sinh Δ − sin Δ) / (cosh Δ + cos Δ),  Δ = h/δ.
// Round wire uses the foil height (π/4)^(3/4) · d, which matches its low-frequency proximity
// (Nan and Sullivan, IEEE PESC 2003). At stall Δ is 0 and the factor is 1, so the measured
// phase resistance is the DC one. The cage of an induction motor is bars, not these strands.
function copperAC(m,rpm,tW){
  if(!(rpm>0)||!(m.strand>0||m.barH>0))return 1;
  const f=m.p*rpm/60;
  if(!(f>0))return 1;
  const c=m.cond||{rho:RHO_CU,alpha:ALPHA_CU};
  const rho=c.rho*(1+c.alpha*((tW||20)-20));
  const delta=Math.sqrt(rho/(Math.PI*f*MU0));
  // a round strand as the foil (π/4)^(3/4) d; a hairpin bar as its own height, with the slot's porosity (Dowell's η)
  const Delta=m.barH>0?m.barH*Math.sqrt(m.barEta)/delta:Math.pow(Math.PI/4,0.75)*m.strand/delta;
  if(!(Delta>1e-4))return 1;
  const M=Delta*(Math.sinh(2*Delta)+Math.sin(2*Delta))/(Math.cosh(2*Delta)-Math.cos(2*Delta));
  const D=2*Delta*(Math.sinh(Delta)-Math.sin(Delta))/(Math.cosh(Delta)+Math.cos(Delta));
  const layers=m.cuLayers>1?m.cuLayers:1;
  return M+((layers*layers-1)/3)*D;
}
// The torque at a current (A rms), at the best angle (MTPA), with the magnets where psi = motorPsi(m, t) puts them.
const tMagOf=(m,psi)=>m.mag.alpha?20+(psi/m.psi20-1)/m.mag.alpha:60;
function motorTorqueAtI(m,I,psi){
  if(m.im)return imTorque(m,I);
  return dqMtpa(m,Math.min(I,m.Imax),tMagOf(m,psi)).T;
}
// The knee (mechanical rad/s). A magnet motor: where the MTPA point at full current meets the inverter's voltage, solved
// on v_d and v_q (a quadratic in the speed). An induction motor: its back-EMF with the drop at full current.
function motorBaseW(m,Vdc,psi){
  if(m.im)return Vdc/Math.sqrt(6)*Math.SQRT2/(m.vDrop*m.p*psi);
  const tMag=tMagOf(m,psi),o=dqMtpa(m,m.Imax,tMag),Id=-m.Imax*Math.sin(o.g),Iq=m.Imax*Math.cos(o.g),q=dqAt(m,Id,Iq,tMag);
  const R=motorR(m,tMag),id=Math.SQRT2*Id,iq=Math.SQRT2*Iq,pd=q.pd+m.dqc.Ls*id,pq=q.pq+m.dqc.Ls*iq,V=Vdc/Math.sqrt(3);
  const A=pd*pd+pq*pq,B=2*(R*iq*pd-R*id*pq),C=R*R*(id*id+iq*iq)-V*V;
  return Math.max(0,(-B+Math.sqrt(Math.max(0,B*B-4*A*C)))/(2*A))/m.p;
}
// The most torque at a shaft speed (Nm), for the bus voltage and the magnets' temperature. A magnet motor: the MTPA
// point at full current while the voltage allows it; above the knee, the best of the current's angles with the most
// current each allows under the voltage (field weakening, then the most torque per volt), so the constant-power range
// and the fall beyond it are the motor's own. An induction motor keeps its constant power to IM_CPSR times its knee.
function motorMaxTorque(m,rpm,Vdc,tMag=60){
  if(m.parts)return m.parts.reduce((a,q)=>a+q.n*motorMaxTorque(q.m,rpm,Vdc,tMag),0);
  if(rpm>m.nMax)return 0;
  if(m.im){
    const wb=motorBaseW(m,Vdc,m.psi20),w=Math.max(1e-6,rpm*Math.PI/30),Tpk=imTorque(m,m.Imax);
    if(w<=wb)return Tpk;
    return w<=IM_CPSR*wb?Tpk*wb/w:Tpk*IM_CPSR*wb*wb/(w*w);
  }
  const dq=dqTables(m),key=Math.round(rpm)+'|'+Math.round(Vdc*10)+'|'+Math.round(tMag);
  let T=dq.cache.get(key);if(T!==undefined)return T;
  const we=m.p*rpm*Math.PI/30,R=motorR(m,tMag),V=Vdc/Math.sqrt(3),I=m.Imax,o=dqMtpa(m,I,tMag);
  const pt=(g,i)=>{const Id=-i*Math.sin(g),Iq=i*Math.cos(g),q=dqFast(m,Id,Iq,tMag);return {T:q.T,V:dqVolt(m,q,Id,Iq,we,R)};};
  if(pt(o.g,I).V<=V)T=o.T;
  else{
    // at an angle: the most current the voltage allows (sampled down from full, then bisected)
    const best=g=>{if(pt(g,I).V<=V)return pt(g,I).T;
      let hi=I,lo=-1;for(let k=1;k<=12;k++){const i=I*(1-k/12);if(pt(g,i).V<=V&&i>0){lo=i;break;}hi=i;}
      if(lo<0)return 0;
      for(let k=0;k<14;k++){const i=(lo+hi)/2;if(pt(g,i).V<=V)lo=i;else hi=i;}
      return pt(g,lo).T;};
    const g0=o.g,g1=Math.PI/2,n=24;let bi=0,bT=-1;
    for(let k=0;k<=n;k++){const t=best(g0+(g1-g0)*k/n);if(t>bT){bT=t;bi=k;}}
    const st=(g1-g0)/n;
    for(let k=-4;k<=4;k++){const g=g0+st*(bi+k/4);if(g<g0||g>g1)continue;const t=best(g);if(t>bT)bT=t;}
    T=Math.max(0,bT);
  }
  if(dq.cache.size>5000)dq.cache.clear();
  dq.cache.set(key,T);
  return T;
}
// An induction motor's torque at full field from a total current: what the magnetising current leaves for the torque.
// Torque per amp falls as the electric loading (A/m of bore) rises: the leakage paths saturate. A magnet motor's is
// solved (dqSolve, build 294); an induction motor's is still the one point the Model 3 gave before then (8.5% at
// 145.7 kA/m, scaled with the loading's square), in its own register entry (MOTOR.imCage).
const IM_SAT_K=0.085, IM_SAT_A=145.7e3;
const imSat=(m,I)=>1-IM_SAT_K*(6*m.N*I/(Math.PI*m.D)/IM_SAT_A)**2;
function imTorque(m,I){
  const Iq=Math.sqrt(Math.max(0,I*I-m.ImR*m.ImR));
  return 1.5*m.p*m.psi20*Math.SQRT2*Iq*imSat(m,I);
}
// Its currents at an operating point: the field's share (1 at full field) and the magnetising and torque currents. Above
// the knee the field is weakened as wb/w; below the rated torque current the controller lowers the field until Im = Iq.
function imCurrents(m,T,rpm,Vdc){
  const wb=motorBaseW(m,Vdc,m.psi20),w=rpm*Math.PI/30,k=1.5*m.p*Math.SQRT2;
  if(!(Math.abs(T)>0))return {fl:0,Im:0,Iq:0,I:0};   // no torque asked: no field
  let fl=w>wb?wb/w:1,Im=m.ImR*fl,Iq=Math.abs(T)/(k*m.psi20*fl);
  if(Iq<Im){Im=Iq=Math.sqrt(Math.abs(T)*m.ImR/(k*m.psi20));fl=Im/m.ImR;}
  for(let j=0;j<3;j++)Iq=Math.abs(T)/(k*m.psi20*fl*imSat(m,Math.hypot(Im,Iq)));
  return {fl,Im,Iq,I:Math.min(m.Imax,Math.hypot(Im,Iq))};
}
// A magnet motor's operating point for a torque (Nm, negative regenerating): the least current that gives it within the
// voltage. MTPA while the voltage allows; above that, the current is turned towards the negative d-axis just as far as
// the voltage needs. Past what the motor can give: full current at the angle with the lowest voltage.
function motorOp(m,T,rpm,Vdc,tMag){
  const dq=m.dq||dqTables(m),key=Math.round(T*4)+'|'+Math.round(rpm/5)+'|'+Math.round(Vdc)+'|'+Math.round(tMag);
  let r=dq.ops.get(key);if(r)return r;
  r=motorOpSolve(m,T,rpm,Vdc,tMag);
  if(dq.ops.size>20000)dq.ops.clear();
  dq.ops.set(key,r);return r;
}
function motorOpSolve(m,T,rpm,Vdc,tMag){
  const we=m.p*Math.max(0,rpm)*Math.PI/30,R=motorR(m,tMag),V=Vdc/Math.sqrt(3),I=m.Imax,sg=T<0?-1:1,aT=Math.abs(T);
  const at=(Id,Iq)=>{const q=dqAt(m,Id,Iq,tMag);q.Id=Id;q.Iq=Iq;q.I=Math.hypot(Id,Iq);q.V=dqVolt(m,q,Id,Iq,we,R);return q;};
  const vAt=(Id,Iq)=>dqVolt(m,dqFast(m,Id,Iq,tMag),Id,Iq,we,R);
  if(!(aT>1e-9)){
    if(vAt(0,0)<=V)return at(0,0);
    if(vAt(-I,0)>V)return at(-I,0);
    let lo=0,hi=I;for(let k=0;k<16;k++){const i=(lo+hi)/2;if(vAt(-i,0)<=V)hi=i;else lo=i;}
    return at(-hi,0);
  }
  // MTPA: the current whose best torque is the one asked
  const full=dqMtpa(m,I,tMag).T;
  let lo=0,hi=I;
  for(let k=0;k<20;k++){const i=(lo+hi)/2;if(dqMtpa(m,i,tMag).T<aT)lo=i;else hi=i;}
  const o=dqMtpa(m,hi,tMag);
  if(full>=aT&&vAt(-hi*Math.sin(o.g),sg*hi*Math.cos(o.g))<=V)return at(-hi*Math.sin(o.g),sg*hi*Math.cos(o.g));
  // at an angle g, the current that gives the torque (Infinity past full current); along it the voltage falls as g
  // turns towards the negative d-axis, so the least current within the voltage is found by bisection on g
  const onT=g=>{const s=Math.sin(g),c=Math.cos(g);if(Math.abs(dqFast(m,-I*s,sg*I*c,tMag).T)<aT)return Infinity;
    let a=0,b=I;for(let k=0;k<16;k++){const i=(a+b)/2;if(Math.abs(dqFast(m,-i*s,sg*i*c,tMag).T)<aT)a=i;else b=i;}
    return b;};
  const ok=g=>{const i=onT(g);return i<Infinity&&vAt(-i*Math.sin(g),sg*i*Math.cos(g))<=V;};
  // the far end: the angle where full current just gives the torque (past it the current cannot)
  let ga=o.g,gb=Math.PI/2*0.995;
  if(Math.abs(dqFast(m,-I*Math.sin(gb),sg*I*Math.cos(gb),tMag).T)<aT){
    let a=o.g,b=gb;for(let k=0;k<16;k++){const g=(a+b)/2;if(Math.abs(dqFast(m,-I*Math.sin(g),sg*I*Math.cos(g),tMag).T)>=aT)a=g;else b=g;}
    gb=a;
  }
  if(!ok(gb)){
    // past what the motor can give at this speed: full current, at the angle of least voltage
    let best=gb,bv=Infinity;for(let k=0;k<=16;k++){const g=o.g+(gb-o.g)*k/16,v=vAt(-I*Math.sin(g),sg*I*Math.cos(g));if(v<bv){bv=v;best=g;}}
    return at(-I*Math.sin(best),sg*I*Math.cos(best));
  }
  for(let k=0;k<14;k++){const g=(ga+gb)/2;if(ok(g))gb=g;else ga=g;}
  const i=onT(gb);return at(-i*Math.sin(gb),sg*i*Math.cos(gb));
}
// The current a torque needs (A rms).
function motorCurrent(m,T,rpm,Vdc,psi){
  return m.im?imCurrents(m,T,rpm,Vdc).I:motorOp(m,T,rpm,Vdc,tMagOf(m,psi)).I;
}
// Iron loss (W/kg) at a frequency and peak flux density: Steinmetz's two terms on M270-35A's points, eddies by the
// lamination's thickness squared.
const feLoss=(m,f,B)=>{const t=(m.s.lamination||0.35)/FE_T_REF;return (FE_KH*f+FE_KE*t*t*f*f)*B*B;};
// The rotor's iron sees no fundamental: its loss is the stator's slot ripple sweeping its surface at the slot-passing
// frequency (slots x rev/s). The ripple's amplitude is beta Bg, with Carter's beta for the slot opening over the gap,
// beta = (1 - u)^2 / (2 (1 + u^2)), u = b0/(2g) + sqrt(1 + (b0/(2g))^2) (Pyrhonen 2014, 3.1.2), and it dies into the
// iron as exp(-2 pi y / slot pitch): the loss is a skin of a quarter of the slot pitch over 2 pi, the rotor's surface
// round. Measured on the mean of the gap field's square. The magnets' own eddy currents are not counted (left open).
function rotorIronLoss(m,rpm,Bg2){
  const x=SLOT_OPEN/(2*m.gap),u=x+Math.sqrt(1+x*x),beta=(1-u)**2/(2*(1+u*u));
  return feLoss(m,m.slots*rpm/60,1)*beta*beta*Bg2*RHO_FE*m.D*m.L*m.ts/4;
}
// Losses at an operating point (W): torque T (Nm, negative when regenerating), speed (rpm), bus voltage, and the node
// temperatures {w,r}. Copper and inverter follow the current; the stator's iron, its teeth and its yoke each at their own
// peak flux density at the point (build 294), so weakening the field lowers it; the rotor's, the slot ripple's.
function motorLosses(m,T,rpm,Vdc,temp){
  if(m.parts)return motorSetLosses(m,T,rpm,Vdc,temp);
  if(m.im)return imLosses(m,T,rpm,Vdc,temp);
  const q=motorOp(m,T,rpm,Vdc,temp.r),I=q.I,w=rpm*Math.PI/30;
  const cu=3*I*I*motorR(m,temp.w)*copperAC(m,rpm,temp.w);
  const f=m.p*rpm/60,feS=feLoss(m,f,q.Bt)*m.mTeeth+feLoss(m,f,q.By)*(m.mFeS-m.mTeeth),feR=rotorIronLoss(m,rpm,q.Bg2);
  const mech=0.15*w+5e-8*w*w*w*(m.D/0.15)**4*(m.L/0.134);
  const inv=m.inv,rS=inv.r*1000/m.Imax;
  const invL=3*(0.9*inv.v0*I+rS*I*I)+3*(Math.SQRT2/Math.PI)*inv.tSw*inv.fSw*Vdc*I;
  return {cu,fe:feS+feR,feS,feR,mech,inv:invL,I,total:cu+feS+feR+mech+invL};
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
  const add=(x,L,n)=>{for(const k of ['cu','rcu','fe','feS','feR','mech','inv','I','total'])x[k]=(x[k]||0)+n*(L[k]||0);return x;};
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
  const cu=3*I*I*motorR(m,temp.w)*copperAC(m,rpm,temp.w),rcu=3*c.Iq*c.Iq*m.Rr20*(1+ALPHA_CU*(temp.r-20));
  // the teeth and the yoke at the densities they were sized to (build 293), scaled by the field; the rotor's, the ripple's
  const f=m.p*rpm/60,fl=c.fl,Bt=m.wt?IM_BG*m.ts/(0.95*m.wt)*fl:0,By=IM_BG*fl*2/Math.PI*Math.PI*m.D/m.poles/(0.95*2*m.hy);
  const feS=feLoss(m,f,Bt)*m.mTeeth+feLoss(m,f,By)*(m.mFeS-m.mTeeth),feR=rotorIronLoss(m,rpm,IM_BG*IM_BG*fl*fl/2),fe=feS+feR;
  const mech=0.15*w+5e-8*w*w*w*(m.D/0.15)**4*(m.L/0.134);
  const inv=m.inv,rS=inv.r*1000/m.Imax;
  const invL=I>0?3*(0.9*inv.v0*I+rS*I*I)+3*(Math.SQRT2/Math.PI)*inv.tSw*inv.fSw*Vdc*I:0;
  return {cu,rcu,fe,feS,feR,mech,inv:invL,I,total:cu+rcu+fe+mech+invL};
}
// Efficiency of the drive (motor and inverter) at a point, motoring: shaft power over battery power.
function motorEfficiency(m,T,rpm,Vdc,temp={w:90,r:70}){
  const P=T*rpm*Math.PI/30;if(!(P>0))return 0;
  return P/(P+motorLosses(m,T,rpm,Vdc,temp).total);
}
// Heat: advance the winding, core and rotor temperatures over dt (s) with these losses. The stator's iron loss goes to
// the core, the rotor's to the rotor (build 294); friction and windage go to the core; an induction motor's cage loss
// (rcu) is the rotor's.
const feSplit=L=>L.feS!==undefined?[L.feS,L.feR]:[0.8*L.fe,0.2*L.fe];
function motorHeatStep(m,temp,L,dt){
  const tc=m.cool.tCool,ns=Math.max(1,Math.ceil(dt/0.5)),h=dt/ns;   // explicit steps well inside the fastest node's time constant
  for(let k=0;k<ns;k++){
    const qWC=m.Gwc*(temp.w-temp.c),qWK=m.Gwk*(temp.w-tc),qCK=m.Gcc*(temp.c-tc),qRC=m.Grc*(temp.r-temp.c);
    temp.w+=(L.cu-qWC-qWK)/m.Cw*h;
    const [fS,fR]=feSplit(L);
    temp.c+=(fS+L.mech+qWC+qRC-qCK)/m.Cc*h;
    temp.r+=(fR+(L.rcu||0)-qRC)/m.Cr*h;
  }
  return temp;
}
// The steady temperatures a held operating point settles at (C): the same network with the capacities let go.
// In steady state the winding sheds its copper loss to the core (a share a = Gwc/(Gwc+Gwk)) and straight to the
// coolant (the rest), the rotor its iron share across the gap, and the core all it receives to the coolant:
//   Tc = tc + (fe + mech + a cu) / (Gcc + a Gwk),  Tw = (cu + Gwc Tc + Gwk tc)/(Gwc + Gwk),  Tr = Tc + feR / Grc
// The losses depend on the temperatures (resistance, flux), so it is iterated to a fixed point. The copper's resistance
// rises with its temperature, so the copper loss feeds itself: where that gain reaches one there is no steady state at
// all (thermal runaway), and the point cannot be held however long it is waited for. That returns Infinity.
function motorSteadyTemps(m,T,rpm,Vdc){
  const tc=m.cool.tCool,a=m.Gwc/(m.Gwc+m.Gwk);
  let temp={w:tc,c:tc,r:tc};
  for(let k=0;k<60;k++){
    const L=motorLosses(m,T,rpm,Vdc,temp);
    const rc=L.rcu||0,Tc=tc+(L.fe+L.mech+a*L.cu+rc)/(m.Gcc+a*m.Gwk);
    const next={w:(L.cu+m.Gwc*Tc+m.Gwk*tc)/(m.Gwc+m.Gwk),c:Tc,r:Tc+(feSplit(L)[1]+rc)/m.Grc};
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
  lfp: {label:'LFP',ocv:[2.80,3.15,3.20,3.22,3.24,3.25,3.26,3.27,3.28,3.30,3.40],vMin:2.50,vMax:3.65,rAh:0.10,ea:68000,cMax:4,cCharge:1.5,from:2005,
        whkg:{2005:90,2015:140,2023:175},cost:{2005:1400,2010:1000,2016:280,2019:140,2024:95}},
  nca: {label:'NCA / NMC',ocv:[2.95,3.40,3.50,3.57,3.63,3.69,3.77,3.85,3.93,4.02,4.13],vMin:2.80,vMax:4.20,rAh:0.11,ea:68000,cMax:6,cCharge:1.0,from:2008,
        whkg:{2008:180,2012:240,2020:270},cost:{2008:1300,2010:1100,2013:650,2016:300,2019:160,2024:115}},
  // power cells (build 183): the same chemistry built for current, not energy - thinner electrodes, more tab and current
  // collector per amp-hour. The Model S Plaid's 18650s: its 110s72p pack sustains ~2300 A, ~9C. Less energy per kg and
  // dearer per kWh for it.
  ncaP:{label:'NCA (POWER CELLS)',ocv:[2.95,3.40,3.50,3.57,3.63,3.69,3.77,3.85,3.93,4.02,4.13],vMin:2.80,vMax:4.20,rAh:0.06,ea:68000,cMax:10,cCharge:1.5,from:2012,
        whkg:{2012:200,2020:235},cost:{2012:900,2016:360,2019:200,2024:140}},
  // hybrid cells (build 186): lithium-ion built for a pack that is mostly power and little energy, cycled shallow
  // thousands of times a day; a 1.5 kWh pack gives and takes 30-40 kW (the Ioniq Hybrid's 1.56 kWh LiPo, ~25C).
  liHEV:{label:'Li-ION (HYBRID CELLS)',ocv:[3.30,3.50,3.58,3.63,3.68,3.73,3.79,3.86,3.94,4.03,4.13],vMin:2.80,vMax:4.20,rAh:0.025,ea:68000,cMax:25,cCharge:20,from:2009,
        whkg:{2009:70,2016:85,2024:100},cost:{2009:2200,2016:1100,2024:700}},
  // nickel-metal hydride hybrid cells (build 189): the Prius's since 1997, prismatic 6.5 Ah cells in 7.2 V modules built for
  // current (the 4th generation's 168 cells: 1.31 kWh, 40 kg). Rated by what they give in a full-throttle pull (build 207):
  // the same 168 cells measured 30.0 kW over a 1 s pulse at half charge (INL, 2004 Prius pack 1052) and peaked at 28.6 and
  // 29.2 kW in 0-60 mph runs (DOE/INL, 2010 Prius and 2013 Prius Plug-in), so ~0.27 ohm and ~29C: ~29 kW out. Until build
  // 207 they were rated by their 10 s pulse (21.2 kW, ~0.36 ohm, 20C), which an acceleration run does not wait for.
  nimhHEV:{label:'NiMH (HYBRID CELLS)',ocv:[1.10,1.22,1.25,1.26,1.27,1.28,1.29,1.30,1.31,1.33,1.40],vMin:1.00,rAh:0.009,cMax:29,cCharge:15,from:1997,
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
// Resistance against temperature (stage 3; split in build 232). b.R is the 25 °C value the rest of the drive uses.
// A cell's resistance is two kinds. The ohmic part (electrolyte, current collectors, tabs, and here the pack's busbars)
// barely moves with temperature. The charge-transfer part at the electrodes is activated: about 68 kJ/mol at a
// graphite anode (Jow, Xue, Zhang et al., "Distinguishing Li+ Charge Transfer Kinetics…", J. Electrochem. Soc. 158,
// 2011). Build 228 put that energy on the whole resistance, which took the Model Y from 377 kW at 25 °C to 35 kW at
// 0 °C: no real pack loses 90% at freezing.
// The split comes from one measurement. Nagasubramanian (J. Appl. Electrochem. 31, 2001), on commercial 18650 cells:
// the ohmic resistance stays nearly constant from 25 to −20 °C while the cell's impedance rises by an order of magnitude.
// With charge transfer rising exp(Ea/R (1/T − 1/T0)), 131-fold from 25 to −20 °C, a tenfold total leaves charge
// transfer (10 − 1) / (131 − 1) = 0.07 of the 25 °C resistance and the ohmic part 0.93. That gives 1.8× at 0 °C and
// 3.6× at −10 °C. PROBABLE: "an order of magnitude" is a round figure. Eightfold makes the share 0.054, fifteenfold
// 0.108. The paper's own impedance spectra would pin it. It is the low-frequency impedance, not a 10 s pulse
// resistance, and the 18650s are of the 2000 era; it is used for every graphite-anode lithium chemistry here.
// Lead-acid and NiMH have no cited energy here, so they stay at 25 °C. The 50 °C power cut (packDerate) is the cells'
// own limit and is not this curve. The lap, the cycle and the race still call the 25 °C resistance.
const PACK_T_REF=25, R_GAS=8.314462618;
const R_CT_SHARE=(10-1)/(Math.exp(68000/R_GAS*(1/(273.15-20)-1/(273.15+PACK_T_REF)))-1);   // ≈ 0.07, from the tenfold rise to −20 °C
function packR(b,tC){
  if(tC==null||tC===PACK_T_REF)return b.R;
  const ea=b.chem.ea;
  if(!(ea>0))return b.R;
  const T=tC+273.15,T0=PACK_T_REF+273.15;
  return b.R*((1-R_CT_SHARE)+R_CT_SHARE*Math.exp(ea/R_GAS*(1/T-1/T0)));
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
// tC omitted, or 25, is the resistance the lock was taken at.
function packMaxPower(b,soc,tC){
  const R=packR(b,tC),V0=packOcv(b,soc),Icut=(V0-b.vMin)/R,I=Math.min(b.iMax,Icut);
  return Math.max(0,(V0-I*R)*I);
}
// The most it can take back (W): the plating limit, or the current that would lift the cells to their charge
// voltage, whichever is lower. At 25 °C the plating limit is the lower one on the factory packs, so the
// regeneration cap does not move. vMax is the usual charge voltage: 4.20 V for NCA/NMC, 3.65 V for LFP.
function packChargePower(b,soc,tC){
  const R=packR(b,tC),V0=packOcv(b,soc);
  let P=b.pChargeMax;
  const vmax=b.chem.vMax;
  if(vmax>0&&V0<b.series*vmax){
    const I=Math.max(0,(b.series*vmax-V0)/R);
    P=Math.min(P,I*b.series*vmax);
  }
  return Math.max(0,P);
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
