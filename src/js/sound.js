// ---- Engine sound (Web Audio, created lazily on first user gesture) ----
// FIRING PULSES, NOT A TONE. The note used to be a sawtooth at the firing frequency, which makes every
// engine with the same firing rate sound the same: a V8 and a flat-plane V8, a boxer four and an
// inline four. What tells them apart is when each cylinder's exhaust pulse arrives and which pipe it
// goes down. So an AudioWorklet keeps its own crank clock, fires each cylinder at its slot in the
// real firing order (the same firingOrder() the LIVE bank draws), and sends the pulse into its bank's
// exhaust: one channel for an inline engine, two (panned left / right) for a V or a boxer. Each bank
// rings its own resonator and saturates on its own, so a bank that gets two pulses close together
// sounds different from one that gets them evenly spaced. Nothing in here knows what a V8 is: the
// cross-plane burble falls out of 1-5-4-8-6-3-7-2 firing its banks A-B-A-B-B-A-B-A.
// THE PIPES (build 125). Each pulse then runs the exhaust it was given. The primary rings at its
// quarter wave, c/4L, closed at the valve and open at the collector, at the sound speed of the gas in
// it; how sharply it rings is the header's own path-length spread (EXHAUST.sigma): a cast log
// manifold smears its reflections and barely rings, a jig-cut race header rings hard. The system
// behind the collector (sysL, open at the tailpipe) adds its half-wave drone, and then the silencer,
// the cat's honeycomb and a turbine, if there is one, take the top off and the level down. The
// primary is the same one the breathing model tunes, so a race header cut for 8000 rpm is shorter
// and sounds higher than one cut for 5200.
// LOAD (build 126). How hard each pulse hits is the blowdown at exhaust-valve opening: the charge
// trapped (manifold pressure) times how much it was heated (how much fuel the air carried), which is
// soundDrive()'s strength. A harder pulse is also raspier: a finite-amplitude wave steepens as it
// runs down the pipe, the stronger the faster, which is why load changes the tone and not only the level. A misfiring cylinder sends its fuel into the hot pipe instead, where it lights
// a moment later: that is overrun crackle, and the worklet makes it exactly that way — a weak pulse,
// then a sharp pop downstream of the header, quietened by the cat and the silencer like everything else.
// THE REST OF THE CAR (build 127). Four more voices, none of them through the exhaust:
//   whine    a compressor's blade-pass tone: a turbo's from its live shaft speed, a supercharger's
//            from the crank through its drive ratio. Level with how hard the wheel is working.
//   blow-off on a lift from boost (petrol only: a diesel has no throttle to surge against), the
//            charge pipe vents through the valve; how long it hisses is the charge volume.
//   intake   the runner's Helmholtz resonance (the same one the breathing model tunes), excited by
//            each induction pulse and scaled by airflow; open stacks roar, an airbox or a compressor
//            in the way hushes it.
//   knock    a combustion chamber rings at its first circumferential acoustic mode, Draper's
//            f = 1.84 c / (pi B) in the burnt gas: about 6 kHz in an 84 mm bore. A diesel's
//            ignition-delay rattle is that ring on every pulse; a knocking petrol engine rings on
//            the cycles that detonate. It is heard through the block, so the exhaust does not muffle it.
// The noise in a pulse is a fixed seeded table restarted on every pulse, so with no lope the output
// is exactly periodic over one engine cycle; tests/test66 depends on that.
// ---- the GAS sound model: an engine-sim style gas simulation (build 156) ----
// Ported from Ange Yaghi's engine-sim (MIT licence; the notice is in SOUND_GAS_LICENCE below), by way of
// the prototype in tests/proto/gas-sound. Every cylinder, its intake runner and its exhaust runner +
// primary are lumped gas volumes, as is each bank's collector; gas flows between them through the valves
// and pipes by the compressible orifice law (choked or subsonic), carrying bulk momentum. The sound is
// each exhaust runner's gauge pressure (plus a tenth of its dynamic pressure each way), delayed by the run
// to the tailpipe at 343 m/s, summed per bank, then engine-sim's audio chain: 1.9 kHz band limit, jitter,
// DC removal, a little derivative, and low-passed noise the pressure wave modulates. A ConvolverNode then
// applies a recorded exhaust impulse response. The crank turns at the rpm our model sets, the plenum
// sits at its manifold pressure, and the burn is a Wiebe curve (engine-sim models a flame front).
const SOUND_GAS_SRC=`
const GR=8.31446261815324,AIR_M=0.02897,ATM=101325;
const gclamp=(v,a,b)=>v<a?a:v>b?b:v;
class Gas{
  constructor(P,V,T){this.n=P*V/(GR*T);this.V=V;this.E=T*2.5*this.n*GR;this.px=0;this.py=0;this.hcr=1.4;
    this.lim=Math.pow(2/2.4,1.4/0.4);this.choke=Math.sqrt(1.4)*Math.pow(2/2.4,2.4/0.8);this.w=1;this.h=1;}
  geo(w,h){this.w=w;this.h=h;}
  reset(P,T){this.n=P*this.V/(GR*T);this.E=T*2.5*this.n*GR;this.px=this.py=0;}
  P(){return this.E/(2.5*this.V);}
  T(){return this.n?this.E/(2.5*this.n*GR):0;}
  m(){return AIR_M*this.n;}
  epm(){return this.n?this.E/this.n:0;}
  c(){if(!this.n||!this.E)return 0;return Math.sqrt(this.P()*1.4/(this.m()/this.V));}
  bke(){const m=this.m();if(!m)return 0;const vx=this.px/m,vy=this.py/m;return 0.5*m*(vx*vx+vy*vy);}
  dyn(dx,dy){
    if(!this.n||!this.E)return 0;
    const v=(dx*this.px+dy*this.py)/this.m();if(v<=0)return 0;
    const P=this.P(),x=1+0.2*v*v/(P*1.4/(this.m()/this.V));
    return P*(Math.sqrt(x*x*x*x*x*x*x)-1);
  }
  setV(V){const dV=V-this.V,L=Math.cbrt(V),sa=L*L;this.E+=(-dV/sa)*this.P()*sa;this.V=V;}
  lose(dn,e){this.E-=e*dn;this.n-=dn;if(this.n<0)this.n=0;}
  gain(dn,e){this.E+=dn*e;this.n+=dn;}
  dissipate(){
    const m=this.m();if(!m)return;
    const vx=this.px/m,vy=this.py/m,v2=vx*vx+vy*vy,c=this.c(),c2=c*c;
    if(c2>=v2||v2===0)return;
    const k=Math.sqrt(c2/v2);this.px*=k;this.py*=k;this.E+=0.5*m*(v2-c2);if(this.E<0)this.E=0;
  }
  vel(dt,beta){
    if(!this.n)return;
    const depth=this.V/(this.w*this.h);
    const p0=this.dyn(1,0)*this.h*depth,p1=this.dyn(-1,0)*this.h*depth,p2=this.dyn(0,1)*this.w*depth,p3=this.dyn(0,-1)*this.w*depth;
    const m=this.m(),v0x=this.px/m,v0y=this.py/m;
    this.px-=(p0-p1)*dt*beta;this.py-=(p2-p3)*dt*beta;
    const v1x=this.px/m,v1y=this.py/m;
    this.E-=0.5*m*(v1x*v1x-v0x*v0x)+0.5*m*(v1y*v1y-v0y*v0y);if(this.E<0)this.E=0;
  }
  static rate(k,P0,P1,T0,T1,lim,choke){
    if(!k)return 0;
    let dir,T,p0,pT;
    if(P0>P1){dir=1;T=T0;p0=P0;pT=P1;}else{dir=-1;T=T1;p0=P1;pT=P0;}
    const pr=pT/p0;let f;
    if(pr<=lim)f=choke/Math.sqrt(GR*T);
    else{const s=Math.pow(pr,1/1.4);f=Math.sqrt(Math.max(7*s*(s-pr),0)/(GR*T));}
    return f*dir*p0*k;
  }
  // moles moved from s0 to s1 through an orifice of flow constant k (direction +x), a0/a1 the cross sections
  static flow(k,dt,a0,a1,s0,s1){
    const P0=s0.P()+s0.dyn(1,0),P1=s1.P()+s1.dyn(-1,0);
    let src,snk,dx,aS,aK,dir,Ps,Pk;
    if(P0>P1){src=s0;snk=s1;dx=1;aS=a0;aK=a1;dir=1;Ps=P0;Pk=P1;}
    else{src=s1;snk=s0;dx=-1;aS=a1;aK=a0;dir=-1;Ps=P1;Pk=P0;}
    let f=dt*Gas.rate(k,Ps,Pk,src.T(),snk.T(),src.lim,src.choke);
    f=gclamp(f,0,0.9*src.n);
    const frac=src.n?f/src.n:0,fV=frac*src.V,fM=frac*src.m();
    if(f!==0){
      const b0=src.bke()+snk.bke(),e=src.epm();
      snk.gain(f,e);src.lose(f,e);
      const dpx=src.px*frac,dpy=src.py*frac;src.px-=dpx;src.py-=dpy;snk.px+=dpx;snk.py+=dpy;
      snk.E-=(src.bke()+snk.bke())-b0;
    }
    const mS=src.m(),mK=snk.m(),cS=src.c(),cK=snk.c(),sx0=src.px,sy0=src.py,kx0=snk.px,ky0=snk.py;
    if(aK){const v=gclamp((fV/aK)/dt,0,cK);snk.px+=v*dx*fM;}
    if(aS&&mS){const v=gclamp((fV/aS)/dt,0,cS);src.px+=v*dx*fM;}
    if(mS){const a=sx0/mS,b=sy0/mS,c=src.px/mS,d=src.py/mS;src.E-=0.5*mS*(c*c-a*a)+0.5*mS*(d*d-b*b);}
    if(mK>0){const a=kx0/mK,b=ky0/mK,c=snk.px/mK,d=snk.py/mK;snk.E-=0.5*mK*(c*c-a*a)+0.5*mK*(d*d-b*b);}
    if(snk.E<0)snk.E=0;if(src.E<0)src.E=0;
    return f*dir;
  }
}
// k for a port flowing one scfm at the 28 inH2O bench depression (engine-sim's k_28inH2O, which is
// linear in the flow) and at the 1.5 inHg carburettor rating (k_carb)
function kAt(scfm,drop){
  const pr=(ATM-drop)/ATM,f=Math.sqrt(7*(1-Math.pow(pr,0.4/1.4)))*Math.pow(pr,1/1.4);
  return scfm*(0.002641*453.59237/60)/(f*ATM/Math.sqrt(GR*298.15));
}
const K28=kAt(1,28*3386.3886666666713*0.0734824),KCARB=kAt(1,1.5*3386.3886666666713);
// engine-sim's 2JZ flow bench (cfm at 28 inH2O by lift in thou), scaled to each engine's valves
const LIFT_STEP=50,IN_CFM=[0,58,103,156,214,249,268,280,280,281],EX_CFM=[0,37,72,113,160,196,222,235,245,246];
function bench(tab,thou){if(thou<=0)return 0;const i=Math.min(8,Math.floor(thou/LIFT_STEP)),f=gclamp((thou-i*LIFT_STEP)/LIFT_STEP,0,1);return tab[i]+(tab[i+1]-tab[i])*f;}
// The share of the fuel's heat that ends up in the gas: this ideal diatomic gas has no wall loss during the
// burn, no dissociation and too low a heat capacity for burnt gas, so all of it gave twice a real engine's
// IMEP. A FIT, to 13 bar flat out on the 1.6 sport four; engine-sim carries the same gap in its fuel model.
const GAS_HEAT_SHARE=0.50;
class GasEngine{
  constructor(e,simHz,fluid){
    this.e=e;this.simHz=simHz;this.fluid=fluid;
    const PI=Math.PI,A=PI/4*e.bore*e.bore,Vd=A*e.stroke,T0=298.15;
    this.A=A;this.Vd=Vd;this.Vc=Vd/(e.cr-1);this.r=e.stroke/2;this.L=3.2*this.r;
    const exD=0.84*e.ivDia;
    this.inScale=e.ivCount*e.ivDia*e.ivDia/(2*0.0345*0.0345);this.inLift=0.0345/e.ivDia;
    this.exScale=e.ivCount*exD*exD/(2*0.029*0.029);this.exLift=0.029/exD;
    this.exA=PI/4*e.primD*e.primD;this.inA=PI/4*e.runnerD*e.runnerD;
    const colA=PI/4*e.sysD*e.sysD*Math.max(1,(e.sysPipes||1)/e.banks);
    this.banks=[];
    for(let b=0;b<e.banks;b++){const c=new Gas(ATM,colA*e.sysL,T0);c.geo(e.sysL,Math.sqrt(colA));
      this.banks.push({col:c,colA,kOut:KCARB*1000*colA/(PI/4*0.0508*0.0508)*0.5});}
    this.atm=new Gas(ATM,1000,T0);this.atm.geo(10,10);
    this.plenum=new Gas(ATM,1000,T0);this.plenum.geo(10,10);
    this.cyl=[];
    for(let i=0;i<e.cylinders;i++){
      const ev=e.events[i],cy=new Gas(ATM,this.Vc,T0);cy.geo(Math.sqrt(A),this.Vc/A);
      const ir=new Gas(ATM,this.inA*e.runnerL,T0);ir.geo(e.runnerL,Math.sqrt(this.inA));
      const exV=this.exA*e.primL+50e-6*Vd/0.5e-3,xr=new Gas(ATM,exV,T0);xr.geo(exV/this.exA,Math.sqrt(this.exA));
      const len=e.primL+e.sysL;
      this.cyl.push({cy,ir,xr,bank:ev.bank,phase:ev.at*720,lit:false,q:0,xb:0,kIn:0,kEx:0,
        kRun:KCARB*200*Vd/0.5e-3,kPrim:KCARB*400*this.exA/(PI/4*0.0381*0.0381),
        delay:new Float64Array(Math.ceil(len/343*simHz)+2),di:0,att:0.2*1600/e.cylinders/(len*len)});
    }
    this.theta=0;this.out=new Float64Array(e.banks);
  }
  vol(th){const a=th*Math.PI/180,s=Math.sin(a);return this.Vc+this.A*(this.r*(1-Math.cos(a))+this.L-Math.sqrt(this.L*this.L-this.r*this.r*s*s));}
  lift(th,open,dur,L){const d=((th-open)%720+720)%720;if(d>=dur)return 0;const s=Math.sin(Math.PI*d/dur);return L*s*s;}
  // one step at {rpm, map Pa, fuel 0-1, lambda, spark deg BTDC, burn deg}
  step(rpm,map,fuel,lambda,spark,burn){
    const e=this.e,dt=1/this.simHz,df=dt/this.fluid,PI=Math.PI;
    this.theta=(this.theta+rpm*6*dt)%720;
    const evc=360+e.overlap/2,evo=evc-e.camDur,ivo=360-e.overlap/2,sparkAt=720-spark;
    this.plenum.reset(map,300);
    for(const c of this.cyl){
      const th=(this.theta-c.phase+720)%720;
      c.cy.setV(this.vol(th));
      c.kIn=K28*bench(IN_CFM,this.lift(th,ivo,e.camDur,e.ivLift)/2.54e-5*this.inLift)*this.inScale;
      c.kEx=K28*bench(EX_CFM,this.lift(th,evo,e.camDur,e.ivLift)/2.54e-5*this.exLift)*this.exScale;
      const since=((th-sparkAt)%720+720)%720;
      if(!c.lit&&since<3&&fuel>0){c.q=c.cy.n*0.92*AIR_M/(14.7*lambda)*43e6*GAS_HEAT_SHARE*fuel;c.lit=true;c.xb=0;}
      if(c.lit){const x=1-Math.exp(-5*Math.pow(Math.min(1,since/burn),3));c.cy.E+=(x-c.xb)*c.q;c.xb=x;if(since>=burn)c.lit=false;}
    }
    for(let k=0;k<this.fluid;k++){
      for(const b of this.banks){this.atm.reset(ATM,298.15);Gas.flow(b.kOut,df,b.colA,10,this.atm,b.col);b.col.dissipate();b.col.vel(df,1);}
      for(const c of this.cyl){
        const h=c.cy.V/this.A,sa=h*PI*e.bore+this.A*2;
        c.cy.E+=(363.15-c.cy.T())*sa*100*df;if(c.cy.E<0)c.cy.E=0;
        Gas.flow(c.kRun,df,10,this.inA,this.plenum,c.ir);c.ir.dissipate();
        Gas.flow(c.kIn,df,this.inA,this.A,c.ir,c.cy);c.ir.dissipate();c.cy.dissipate();
        Gas.flow(c.kEx,df,this.A,this.exA,c.cy,c.xr);c.cy.dissipate();c.xr.dissipate();
        const b=this.banks[c.bank];Gas.flow(c.kPrim,df,this.exA,b.colA,c.xr,b.col);
        c.ir.vel(df,0.25);c.cy.vel(df,0.5);c.xr.vel(df,1);
      }
    }
    this.out.fill(0);
    for(const c of this.cyl){
      const s=(c.xr.P()-ATM)+0.1*c.xr.dyn(1,0)+0.1*c.xr.dyn(-1,0);
      const d=c.delay,v=d[c.di];d[c.di]=s;c.di=(c.di+1)%d.length;
      this.out[c.bank]+=c.att*v;
    }
    return this.out;
  }
}
// What the four-stroke, the two-stroke and the rotary share: each bank's collector venting to atmosphere,
// the plenum held at the manifold pressure, and the audio pick-off (runner gauge pressure plus a tenth of
// its dynamic pressure each way, delayed down the pipe, falling off with the square of the run).
function gasCollectors(self,e){
  const PI=Math.PI,colA=PI/4*e.sysD*e.sysD*Math.max(1,(e.sysPipes||1)/e.banks);
  self.banks=[];
  for(let b=0;b<e.banks;b++){const c=new Gas(ATM,colA*e.sysL,298.15);c.geo(e.sysL,Math.sqrt(colA));
    self.banks.push({col:c,colA,kOut:KCARB*1000*colA/(PI/4*0.0508*0.0508)*0.5});}
  self.atm=new Gas(ATM,1000,298.15);self.atm.geo(10,10);
  self.plenum=new Gas(ATM,1000,298.15);self.plenum.geo(10,10);
  self.out=new Float64Array(e.banks);
}
function gasVentCollectors(self,df){
  for(const b of self.banks){self.atm.reset(ATM,298.15);Gas.flow(b.kOut,df,b.colA,10,self.atm,b.col);b.col.dissipate();b.col.vel(df,1);}
}
function gasRunner(e,exA,Vd,simHz,n){
  const exV=exA*e.primL+50e-6*Vd/0.5e-3,xr=new Gas(ATM,exV,298.15);xr.geo(exV/exA,Math.sqrt(exA));
  const len=e.primL+e.sysL;
  return {xr,delay:new Float64Array(Math.ceil(len/343*simHz)+2),di:0,att:0.2*1600/n/(len*len)};
}
function gasPickOff(self,runners){
  self.out.fill(0);
  for(const r of runners){
    const s=(r.xr.P()-ATM)+0.1*r.xr.dyn(1,0)+0.1*r.xr.dyn(-1,0);
    const d=r.delay,v=d[r.di];d[r.di]=s;r.di=(r.di+1)%d.length;
    self.out[r.bank]+=r.att*v;
  }
  return self.out;
}
// The Wiebe burn, shared: from the spark, release the charge's fuel heat along 1 - exp(-5 x^3).
function gasBurn(c,since,burn,fuel,lambda){
  if(!c.lit&&since<3&&fuel>0){c.q=c.cy.n*0.92*AIR_M/(14.7*lambda)*43e6*GAS_HEAT_SHARE*fuel;c.lit=true;c.xb=0;}
  if(c.lit){const x=1-Math.exp(-5*Math.pow(Math.min(1,since/burn),3));c.cy.E+=(x-c.xb)*c.q;c.xb=x;if(since>=burn)c.lit=false;}
}
// An orifice's flow constant from its area: engine-sim's k is Cd A / sqrt(molar mass) (its molar flow law
// leaves the molar mass out), which puts the 2JZ bench's 281 cfm at 13 cm2 of effective area.
const kArea=(cd,a)=>cd*a/Math.sqrt(AIR_M);
// THE TWO-STROKE. A piston-ported cylinder on a 360 deg cycle, scavenged by its own crankcase: the piston's
// underside pumps it (crankcase compression 1.35, typical), a reed valve lets charge in from the runner
// only while the runner is above the crankcase, the transfer ports carry it up into the cylinder, and the
// exhaust port lets the burnt gas out into the expansion chamber (the primary). A port's open area is its
// width times the height the piston has uncovered; widths are typical of the type (exhaust 0.70 bore,
// transfers 1.1 bore in all, reed 0.45 of the piston area), timings from the cam choice (TWO_STROKE_PORTS).
class TwoStrokeGas{
  constructor(e,simHz,fluid){
    this.e=e;this.simHz=simHz;this.fluid=fluid;
    const PI=Math.PI,A=PI/4*e.bore*e.bore,Vd=A*e.stroke;
    this.A=A;this.Vd=Vd;this.Vc=Vd/(e.cr-1);this.r=e.stroke/2;this.L=3.2*this.r;
    this.xEx=this.pos(180-e.exhDur/2);this.xTr=this.pos(180-e.trDur/2);
    this.wEx=0.70*e.bore;this.wTr=1.1*e.bore;this.kReed=kArea(0.6,0.45*A);
    this.ccMin=Vd/0.35;
    this.exA=PI/4*e.primD*e.primD;this.inA=PI/4*e.runnerD*e.runnerD;
    gasCollectors(this,e);
    this.cyl=[];
    for(let i=0;i<e.cylinders;i++){
      const ev=e.events[i],cy=new Gas(ATM,this.Vc,298.15);cy.geo(Math.sqrt(A),this.Vc/A);
      const cc=new Gas(ATM,this.ccMin+Vd,298.15);cc.geo(Math.sqrt(A),(this.ccMin+Vd)/A);
      const ir=new Gas(ATM,this.inA*e.runnerL,298.15);ir.geo(e.runnerL,Math.sqrt(this.inA));
      const run=gasRunner(e,this.exA,Vd,simHz,e.cylinders);run.bank=ev.bank;
      this.cyl.push(Object.assign(run,{cy,cc,ir,phase:ev.at*360,lit:false,q:0,xb:0,
        kRun:KCARB*200*Vd/0.5e-3,kPrim:KCARB*400*this.exA/(PI/4*0.0381*0.0381)}));
    }
    this.theta=0;
  }
  pos(th){const a=th*Math.PI/180,s=Math.sin(a);return this.r*(1-Math.cos(a))+this.L-Math.sqrt(this.L*this.L-this.r*this.r*s*s);}
  step(rpm,map,fuel,lambda,spark,burn){
    const e=this.e,dt=1/this.simHz,df=dt/this.fluid,PI=Math.PI;
    this.theta=(this.theta+rpm*6*dt)%360;
    this.plenum.reset(map,300);
    for(const c of this.cyl){
      const th=(this.theta-c.phase+360)%360,x=this.pos(th);
      c.cy.setV(this.Vc+this.A*x);c.cc.setV(this.ccMin+this.A*(2*this.r-x));
      c.kEx=kArea(0.65,this.wEx*Math.max(0,x-this.xEx));c.kTr=kArea(0.65,this.wTr*Math.max(0,x-this.xTr));
      gasBurn(c,((th-(360-spark))%360+360)%360,burn,fuel,lambda);
    }
    for(let k=0;k<this.fluid;k++){
      gasVentCollectors(this,df);
      for(const c of this.cyl){
        const h=c.cy.V/this.A,sa=h*PI*e.bore+this.A*2;
        c.cy.E+=(363.15-c.cy.T())*sa*100*df;if(c.cy.E<0)c.cy.E=0;
        Gas.flow(c.kRun,df,10,this.inA,this.plenum,c.ir);c.ir.dissipate();
        if(c.ir.P()>c.cc.P()){Gas.flow(this.kReed,df,this.inA,this.A,c.ir,c.cc);c.ir.dissipate();c.cc.dissipate();}
        if(c.kTr){Gas.flow(c.kTr,df,this.A,this.A,c.cc,c.cy);c.cc.dissipate();c.cy.dissipate();}
        if(c.kEx){Gas.flow(c.kEx,df,this.A,this.exA,c.cy,c.xr);c.cy.dissipate();c.xr.dissipate();}
        const b=this.banks[c.bank];Gas.flow(c.kPrim,df,this.exA,b.colA,c.xr,b.col);
        c.ir.vel(df,0.25);c.cc.vel(df,0.5);c.cy.vel(df,0.5);c.xr.vel(df,1);
      }
    }
    return gasPickOff(this,this.cyl);
  }
}
// THE ROTARY. Each rotor carries three chambers, each going through intake, compression, power and exhaust
// over three turns of the eccentric shaft (1080 deg), one chamber a turn behind the next, so a rotor fires
// once a turn. A chamber's volume swings between Vmin and Vmin + Vd almost sinusoidally, twice a cycle;
// Vd = 3 sqrt(3) R e B (generating radius, eccentricity, rotor width), Vmin from the compression ratio.
// All three chambers of a rotor breathe through the same side intake ports and the same peripheral exhaust
// port, which the rotor's flanks uncover and cover: at the 13B's published timing (exhaust opens 75 deg
// before BDC, closes 48 after TDC; intake opens 32 after TDC, closes 50 after BDC, in shaft degrees), with a
// 40 deg ramp as an apex crosses a port edge. Port areas are typical of the type (exhaust 0.07 R B,
// intake 0.09 R B, i.e. 5.9 and 7.6 cm2 on a 13B).
class RotaryGas{
  constructor(e,simHz,fluid){
    this.e=e;this.simHz=simHz;this.fluid=fluid;
    const PI=Math.PI,R=e.rotR,B=e.rotB,Vd=3*Math.sqrt(3)*R*e.ecc*B;
    this.Vd=Vd;this.Vmin=Vd/(e.cr-1);this.sa=2.2*R*B;this.chA=B*2*e.ecc;
    this.aEx=0.07*R*B;this.aIn=0.09*R*B;
    this.exA=PI/4*e.primD*e.primD;this.inA=PI/4*e.runnerD*e.runnerD;
    gasCollectors(this,e);
    this.rotors=[];this.cyl=[];
    for(let i=0;i<e.cylinders;i++){
      const ev=e.events[i],ir=new Gas(ATM,this.inA*e.runnerL,298.15);ir.geo(e.runnerL,Math.sqrt(this.inA));
      const run=gasRunner(e,this.exA,Vd,simHz,e.cylinders);run.bank=ev.bank;
      const rot=Object.assign(run,{ir,ch:[],kRun:KCARB*200*Vd/0.5e-3,kPrim:KCARB*400*this.exA/(PI/4*0.0381*0.0381)});
      for(let j=0;j<3;j++){
        const cy=new Gas(ATM,this.Vmin,298.15);cy.geo(B,Math.sqrt(3)*R);
        const c={cy,phase:ev.at*360+j*360,lit:false,q:0,xb:0,kIn:0,kEx:0};
        rot.ch.push(c);this.cyl.push(c);
      }
      this.rotors.push(rot);
    }
    this.theta=0;
  }
  vol(ph){return this.Vmin+this.Vd*(1-Math.cos(2*Math.PI*ph/540))/2;}
  // open share of a port that opens at 'open' and closes at 'close' (shaft deg in the chamber's 1080)
  port(ph,open,close){
    const d=((ph-open)%1080+1080)%1080,len=((close-open)%1080+1080)%1080;
    if(d>=len)return 0;return Math.min(1,d/40,(len-d)/40);
  }
  step(rpm,map,fuel,lambda,spark,burn){
    const dt=1/this.simHz,df=dt/this.fluid;
    this.theta=(this.theta+rpm*6*dt)%1080;
    this.plenum.reset(map,300);
    for(const c of this.cyl){
      const ph=(this.theta-c.phase+2160)%1080;
      c.cy.setV(this.vol(ph));
      c.kEx=kArea(0.7,this.aEx*this.port(ph,735,48));c.kIn=kArea(0.7,this.aIn*this.port(ph,32,320));
      gasBurn(c,((ph-(540-spark))%1080+1080)%1080,burn,fuel,lambda);
    }
    for(let k=0;k<this.fluid;k++){
      gasVentCollectors(this,df);
      for(const r of this.rotors){
        Gas.flow(r.kRun,df,10,this.inA,this.plenum,r.ir);r.ir.dissipate();
        for(const c of r.ch){
          c.cy.E+=(363.15-c.cy.T())*this.sa*100*df;if(c.cy.E<0)c.cy.E=0;
          if(c.kIn){Gas.flow(c.kIn,df,this.inA,this.chA,r.ir,c.cy);r.ir.dissipate();c.cy.dissipate();}
          if(c.kEx){Gas.flow(c.kEx,df,this.chA,this.exA,c.cy,r.xr);c.cy.dissipate();r.xr.dissipate();}
          c.cy.vel(df,0.5);
        }
        const b=this.banks[r.bank];Gas.flow(r.kPrim,df,this.exA,b.colA,r.xr,b.col);
        r.ir.vel(df,0.25);r.xr.vel(df,1);
      }
    }
    return gasPickOff(this,this.rotors);
  }
}
function makeGasEngine(e,simHz,fluid){
  return e.kind==='rotary'?new RotaryGas(e,simHz,fluid):e.kind==='two'?new TwoStrokeGas(e,simHz,fluid):new GasEngine(e,simHz,fluid);
}
// engine-sim's Synthesizer input stage, per channel: 1.9 kHz 4th-order Butterworth, a jitter of up to 10
// samples, a 10 Hz DC removal, 1% of the derivative, and the signal times 2 kHz low-passed noise
function lp2(f,q){const w=2*Math.PI*f/sampleRate,al=Math.sin(w)/(2*q),c=Math.cos(w),a0=1+al;
  return {b0:(1-c)/2/a0,b1:(1-c)/a0,a1:-2*c/a0,a2:(1-al)/a0,x1:0,x2:0,y1:0,y2:0};}
function lpRun(f,x){const y=f.b0*x+f.b1*f.x1+f.b0*f.x2-f.a1*f.y1-f.a2*f.y2;f.x2=f.x1;f.x1=x;f.y2=f.y1;f.y1=y;return y;}
class GasChannel{
  constructor(){this.aa=[lp2(1900,0.5412),lp2(1900,1.3066)];this.air=[lp2(2000,0.5412),lp2(2000,1.3066)];
    this.jit=[lp2(10000,0.5412),lp2(10000,1.3066)];this.hist=new Float32Array(10);this.hi=0;this.dc=0;this.prev=0;
    this.dcA=1-Math.exp(-2*Math.PI*10/sampleRate);}
  run(x,jitter){
    const s=lpRun(this.aa[1],lpRun(this.aa[0],x));
    this.hist[this.hi]=s;this.hi=(this.hi+1)%10;
    const j=gclamp(lpRun(this.jit[1],lpRun(this.jit[0],Math.random()*9*jitter)),0,9),j0=Math.floor(j),j1=Math.ceil(j),jf=j-j0;
    const fin=this.hist[(this.hi+j1)%10]*jf+this.hist[(this.hi+j0)%10]*(1-jf);
    this.dc+=this.dcA*(fin-this.dc);
    const fp=(fin-this.prev)*sampleRate;this.prev=fin;
    const r=lpRun(this.air[1],lpRun(this.air[0],2*Math.random()-1));
    return fp*0.01+(fin-this.dc)*r*0.99;
  }
}
class EngineGas extends AudioWorkletProcessor{
  static get parameterDescriptors(){return[
    {name:'rpm',defaultValue:800,minValue:0,maxValue:40000,automationRate:'k-rate'},
    {name:'map',defaultValue:40000,minValue:5000,maxValue:600000,automationRate:'k-rate'},
    {name:'fuel',defaultValue:1,minValue:0,maxValue:1,automationRate:'k-rate'},
    {name:'lambda',defaultValue:1,minValue:0.6,maxValue:6,automationRate:'k-rate'},
    {name:'spark',defaultValue:20,minValue:-20,maxValue:60,automationRate:'k-rate'},
    {name:'burn',defaultValue:60,minValue:20,maxValue:120,automationRate:'k-rate'},
    {name:'level',defaultValue:0,minValue:0,maxValue:4,automationRate:'k-rate'},
    {name:'floor',defaultValue:1,minValue:1e-9,maxValue:1e12,automationRate:'k-rate'}];}
  constructor(){super();this.eng=null;this.port.onmessage=e=>this.configure(e.data);}
  configure(e){
    this.simHz=10000;this.eng=makeGasEngine(e,this.simHz,4);this.acc=0;
    this.prev=new Float64Array(e.banks);this.cur=new Float64Array(e.banks);
    this.ch=Array.from({length:e.banks},()=>new GasChannel());
    this.pan=e.banks===1?[[0.7071,0.7071]]:[[0.85,0.45],[0.45,0.85]];
    this.ms=0;this.att=1-Math.exp(-1/(0.02*sampleRate));this.rel=1-Math.exp(-1/(0.06*sampleRate));
  }
  process(inputs,outputs,params){
    const out=outputs[0],L=out[0],R=out[1]||out[0];
    if(!this.eng){L.fill(0);if(R!==L)R.fill(0);return true;}
    const rpm=params.rpm[0],map=params.map[0],fuel=params.fuel[0],lam=params.lambda[0],spark=params.spark[0],burn=params.burn[0],level=params.level[0],floor=params.floor[0];
    const inc=this.simHz/sampleRate,nb=this.cur.length;
    for(let i=0;i<L.length;i++){
      this.acc+=inc;
      while(this.acc>=1){this.acc-=1;this.prev.set(this.cur);this.cur.set(this.eng.step(rpm,map,fuel,lam,spark,burn));}
      let l=0,r=0;
      for(let b=0;b<nb;b++){
        const x=this.prev[b]+(this.cur[b]-this.prev[b])*this.acc,y=this.ch[b].run(x,0.23);
        l+=y*this.pan[b][0];r+=y*this.pan[b][1];
      }
      // levelled, as engine-sim levels its output: the gas model gives the timbre, the main thread the
      // loudness. Quick to come down on a rising signal (20 ms), and back up in 60 ms (0.3 s left a hole after
      // every lift: the signal falls at once and the gain took a third of a second to follow), and never
      // lifting a signal that has fallen under the floor.
      const pw=(l*l+r*r)/2;this.ms+=(pw>this.ms?this.att:this.rel)*(pw-this.ms);
      const g=level/Math.max(Math.sqrt(this.ms),floor);
      L[i]=l*g;if(R!==L)R[i]=r*g;
    }
    return true;
  }
}
registerProcessor('engine-gas',EngineGas);`;

// SOUND_GAS_LICENCE. The gas model (class Gas, GasEngine, GasChannel) and the impulse responses in
// SOUND_IR are derived from engine-sim, https://github.com/ange-yaghi/engine-sim, under this licence:
// Copyright 2022 AngeTheGreat (Ange Yaghi)
// Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
// associated documentation files (the "Software"), to deal in the Software without restriction,
// including without limitation the rights to use, copy, modify, merge, publish, distribute,
// sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions: The above copyright notice and this
// permission notice shall be included in all copies or substantial portions of the Software.
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT
// NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
// NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT
// OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
// Two of engine-sim's recorded exhaust impulse responses (es/sound-library/new/mild_exhaust.wav and
// minimal_muffling_02.wav), 16-bit mono PCM at 44.1 kHz, trimmed where they fall under 100/32768 as
// engine-sim trims them: what a real exhaust does to a single click, which is most of the texture above
// the gas model's 1.9 kHz band.
const SOUND_IR={rate:44100,mild:'0r36gXeBd4F3gXeBdoF3gXeBd4GCgc+K/FcYfod+iX6Jfoh+iH6Jfoh+iH6Ifoh+iX6Jfol+iX6Jfoh+h36Cfnp+cX5xfnl+gH6DfoZ+hn6Ifod+h36Jfoh+iX6Jfol+iX6Kfol+iX6Jfol+iX6Jfop+iX6Jfol+iX6Ifoh+iX6Jfol+iX6Jfol+iX6Jfol+in6Jfoh+iX6Jfol+iX6Jfol+iX6Jfol+iH6Jfol+iX6Jfop+iH6Jfol+iX6Jfoh+iX6Jfol+iX6Jfol+in6Jfop+iX6Jfol+iX6Jfol+iX6Jfol+iX6Ifol+iX6Jfoh+iX6Kfol+iX6Jfol+iH6Jfol+iX6Ifol+iX6Jfol+iH6Jfoh+iX6Jfol+iX6Jfoh+iH6Ifol+iX6Jfol+in6Jfop+iX6Jfol+iH6Jfol+iX6Jfol+iH6Jfoh+iX6Jfol+iH6Jfoh+iX6Jfol+iH6Jfoh+hn6Efn9+dH5gfjZ+5H1TfW18C3tDeVN3InQIbfFfNkxaLd3/wtEstLmm5KBrmvuRa4tMh8uEh4P5gquCZoIoggKC5oHFgaOBjYGCgX6BfIF7gXuBe4F7gXqBeYF6gXiBeIF4gXiBeIF4gXiBeIF3gXeBeIF3gXeBd4F3gXeBd4F4gXiBeIF3gXiBd4F3gXiBeIF3gXiBd4F3gXeBeIF5gXmBeIF5gXmBeIF6gXqBeYF4gXmBeYF5gXmBeYF6gXqBeoF7gX2BfoGAgYOBiIGOgZKBmIGdgaCBoYGjga6By4H1gR6CPoJcgnmCioKSgqmC3YIrg3iDvoMAhDiEdITShEiFtYUShnGG64aChxyI0YgAihyMKo+3koWWMpofnciflKMWqTSu77D8sj+2s7tLxI7Oqtgi4t3oV+4w92cCHg2DF+8hJywMNUM7lz4fPwg9ujoPPQNFEk75VEFZxVtsXtdhqmQ3ZjBnGWjraEVqUmw+bpRv0G++bh9upW/jcWJzQHS5dCB1KXbCdyl5E3pkegR6OHnPeBN5h3nIeb15nHmaeXV5MHlWeQZ6unoOe+l6X3q0eUV5QnljeUt5ynjUd+V2j3bydr93UHhveFt4PXhWeKB4lng8eBl4CHiId8R2GnYcdURz63DnbsFtW23/bE9sZGuIaoxqgmtgbJlsNGxBa75pwmeYZR9j+l+3XAxbtFteXOBawFdLVBJRbU4mTDVJ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',
  minimal:'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'};
const SOUND_WORKLET_SRC=`
const clamp01=(v,a,b)=>v<a?a:v>b?b:v;
class EnginePulse extends AudioWorkletProcessor{
  static get parameterDescriptors(){return[
    {name:'rpm',defaultValue:800,minValue:0,maxValue:40000,automationRate:'k-rate'},
    {name:'level',defaultValue:0,minValue:0,maxValue:2,automationRate:'k-rate'},
    {name:'bright',defaultValue:1200,minValue:50,maxValue:20000,automationRate:'k-rate'},
    {name:'lope',defaultValue:0,minValue:0,maxValue:1,automationRate:'k-rate'},
    {name:'strength',defaultValue:1,minValue:0,maxValue:5,automationRate:'k-rate'},
    {name:'crackle',defaultValue:0,minValue:0,maxValue:1,automationRate:'k-rate'},
    {name:'whineF',defaultValue:0,minValue:0,maxValue:40000,automationRate:'k-rate'},
    {name:'whineA',defaultValue:0,minValue:0,maxValue:1,automationRate:'k-rate'},
    {name:'bang',defaultValue:0,minValue:0,maxValue:1,automationRate:'k-rate'},
    {name:'intake',defaultValue:0,minValue:0,maxValue:4,automationRate:'k-rate'},
    {name:'knockProb',defaultValue:0,minValue:0,maxValue:1,automationRate:'k-rate'},
    {name:'knockAmp',defaultValue:0,minValue:0,maxValue:2,automationRate:'k-rate'}];}
  constructor(){super();this.cfg=null;this.port.onmessage=e=>e.data.bov?this.blowOff(e.data.bov):this.configure(e.data);}
  blowOff(b){this.bovEnv=b.amp;this.bovDecay=Math.exp(-1/(Math.max(0.02,b.tau)*sampleRate));}
  rnd(){this.seed=(Math.imul(this.seed,1664525)+1013904223)>>>0;return this.seed/4294967296;}
  configure(c){
    const t=c.tone,sr=sampleRate;
    this.cfg=c;this.seed=12345;this.phase=0;this.cycle=0;this.next=0;this.nextAt=c.events[0].at;
    const x=c.exhaust;
    this.popDecay=Math.exp(-1/(0.8e-3*sr));this.bangDecay=Math.exp(-1/(3e-3*sr));
    this.whBp={b0:0,b2:0,a1:0,a2:0,x1:0,x2:0,y1:0,y2:0};this.whF=0;this.whG=0;
    // the accessory voices: one each, centred
    this.wPh=0;this.bovEnv=0;this.bovDecay=0;this.ringEnv=0;this.ringPh=0;
    this.ringDecay=Math.exp(-1/(1.2e-3*sr));this.ringW=2*Math.PI*Math.min(c.knockF,0.45*sr)/sr;
    this.bovBp=this.bandpass(2600,1.2);this.inBp=this.bandpass(c.intakeF,4);this.inLp=0;
    this.mufA=1-Math.exp(-2*Math.PI*Math.min(x.muffleHz,0.45*sr)/sr);
    this.banks=[];
    for(let b=0;b<c.banks;b++){
      const noise=new Float32Array(Math.ceil(sr*0.03));
      for(let i=0;i<noise.length;i++)noise[i]=this.rnd()*2-1;
      const pan=c.banks===1?[0.7071,0.7071]:b?[0.45,0.85]:[0.85,0.45];
      this.banks.push({env:0,ni:noise.length,noise,rasp:1,pop:0,popIn:0,popAmp:0,bang:0,bangIn:0,bangAmp:0,bangLp:0,lp:0,m1:0,m2:0,s1:0,h:0,gl:pan[0],gr:pan[1],
        // bank B's run to its tailpipe is a little longer (the crossover), so its pipes sit a touch lower
        prim:this.bandpass(x.primF*(b?0.97:1),x.primQ),sys:this.bandpass(x.sysF*(b?0.97:1),x.sysQ)});
    }
  }
  // RBJ band-pass, 0 dB at the peak
  bandpass(f0,q){
    const w=2*Math.PI*Math.min(f0,0.45*sampleRate)/sampleRate,al=Math.sin(w)/(2*q),a0=1+al;
    return {b0:al/a0,b2:-al/a0,a1:-2*Math.cos(w)/a0,a2:(1-al)/a0,x1:0,x2:0,y1:0,y2:0};
  }
  // soft knee: linear to 0.7, then eased into 1, so a race header on open stacks flat out is loud
  // without clipping the output
  static knee(v){const m=Math.abs(v);return m<=0.7?v:Math.sign(v)*(0.7+0.3*Math.tanh((m-0.7)/0.3));}
  static run(f,x){
    const y=f.b0*x+f.b2*f.x2-f.a1*f.y1-f.a2*f.y2;
    f.x2=f.x1;f.x1=x;f.y2=f.y1;f.y1=y;return y;
  }
  fire(ev,lope,strength,crackle,interval,knockProb,knockAmp,bang){
    const k=this.banks[ev.bank];
    let a=strength*(1+lope*(this.rnd()-0.5));
    if(bang&&this.rnd()<bang){                               // anti-lag: the charge burns on in the manifold ...
      a*=0.5;k.bangIn=1+Math.floor(this.rnd()*0.5*interval); // ... a moment after the valve opens: a bang
      k.bangAmp=this.cfg.exhaust.bangGain*(1+1.2*this.rnd());
    }
    if(lope&&this.rnd()<lope*0.12)a*=0.35;                   // a partial burn: residual gas diluted the charge
    if(crackle&&this.rnd()<crackle){                         // a misfire: the fuel goes on into the pipe ...
      a*=0.2;k.popIn=1+Math.floor(this.rnd()*1.5*interval);  // ... and lights there a moment later
      k.popAmp=this.cfg.exhaust.popGain*(0.6+0.8*this.rnd());
    }
    k.env+=a;k.rasp=Math.min(2,Math.max(0.3,a));k.ni=0;
    if(knockProb&&this.rnd()<knockProb)this.ringEnv=Math.max(this.ringEnv,knockAmp*(0.6+0.8*this.rnd()));
  }
  process(inputs,outputs,params){
    const out=outputs[0],L=out[0],R=out[1]||out[0],c=this.cfg;
    if(!c){L.fill(0);if(R!==L)R.fill(0);return true;}
    const t=c.tone,x=c.exhaust,ev=c.events,n=ev.length,run=EnginePulse.run,mufA=this.mufA;
    const rpm=params.rpm[0],level=params.level[0],lope=params.lope[0],strength=params.strength[0],crackle=params.crackle[0],bang=params.bang[0];
    const whineF=params.whineF[0],whineA=whineF<0.45*sampleRate&&whineF>40?params.whineA[0]:0,wd=whineF/sampleRate;
    // the whine is a little tone and mostly noise in a narrow band at the pass frequency: real blowers whirr,
    // and a stack of pure sines at one level is the "dentist's drill" this replaced. The band-pass is retuned
    // per block and scaled so its rms matches a unit tone's.
    const wnz=c.whine[2]||0,wtone=(1-wnz)/(1+c.whine[0]+c.whine[1]);
    if(whineA&&Math.abs(whineF-this.whF)>0.5){
      const q=c.whine[3]||10,w=2*Math.PI*whineF/sampleRate,al=Math.sin(w)/(2*q),a0=1+al,f=this.whBp;
      f.b0=al/a0;f.b2=-al/a0;f.a1=-2*Math.cos(w)/a0;f.a2=(1-al)/a0;this.whF=whineF;
      this.whG=0.7071/(0.577*Math.sqrt(Math.PI*whineF/(q*sampleRate)));
    }
    const intake=params.intake[0],kP=params.knockProb[0],kA=params.knockAmp[0],wh=c.whine,inA=1-Math.exp(-2*Math.PI*2000/sampleRate);
    const dPh=rpm/60/c.cycleRevs/sampleRate;                       // engine cycles per sample
    const lpA=1-Math.exp(-2*Math.PI*params.bright[0]/sampleRate);
    // Blowdown lasts a crank ANGLE, not a time: tau is its length at 2000 rpm and shrinks with revs.
    // Held fixed, a V12's pulses ran together at high rpm into a steady pressure the DC block took
    // away, and what was left was the noise riding on it.
    const decay=Math.exp(-1/(t.tau*1e-3*clamp01(2000/Math.max(1,rpm),0.2,1.5)*sampleRate));
    for(let i=0;i<L.length;i++){
      this.phase+=dPh;
      while(this.phase>=this.cycle+this.nextAt){
        this.fire(ev[this.next],lope,strength,crackle,1/(dPh*n),kP,kA,bang);
        if(++this.next===n){this.next=0;this.cycle++;}
        // a lumpy idle fires a little early or late, up to a sixth of the firing interval
        this.nextAt=ev[this.next].at+(lope?lope*(this.rnd()-0.5)/(3*n):0);
      }
      if(this.cycle>=1000){this.cycle-=1000;this.phase-=1000;}
      let l=0,r=0,pulses=0;
      for(const k of this.banks){
        pulses+=k.env;
        const nz=k.ni<k.noise.length?k.noise[k.ni++]:0;
        const p=k.env*(1+t.noise*k.rasp*nz);
        k.env*=decay;
        // header: the pulse and the primary's ring, saturating together at the collector
        const s=Math.tanh(t.drive*(0.5*p+t.ring*run(k.prim,p)));
        // a pop lights in the pipe past the header, so it rings the system but not the primary
        if(k.popIn>0&&--k.popIn===0)k.pop=k.popAmp;
        let q=s;
        if(k.pop>1e-3){q+=2.5*k.pop*(this.rnd()*2-1);k.pop*=this.popDecay;}
        // an anti-lag bang: bigger and longer than a crackle, and deeper (low-passed), so the system rings
        if(k.bangIn>0&&--k.bangIn===0)k.bang=k.bangAmp;
        if(k.bang>1e-3){const nz=this.rnd()*2-1;k.bangLp+=0.15*(nz-k.bangLp);q+=k.bang*(1.5*nz+8*k.bangLp);k.bang*=this.bangDecay;}
        // system: its drone, then two poles of silencer / cat / turbine and the rpm-driven brightness
        const v=q+x.sysMix*run(k.sys,q);
        k.m1+=mufA*(v-k.m1);k.m2+=mufA*(k.m1-k.m2);k.lp+=lpA*(k.m2-k.lp);
        k.h=k.lp-k.s1+0.995*k.h;k.s1=k.lp;                         // DC block: the pulses are one-sided
        l+=k.h*k.gl;r+=k.h*k.gr;
      }
      // accessories, centred, past the silencer
      let a=0;
      if(whineA){this.wPh=(this.wPh+wd)%1;const ph=2*Math.PI*this.wPh;
        a+=whineA*(wtone*(Math.sin(ph)+wh[0]*Math.sin(2*ph)+wh[1]*Math.sin(3*ph))+wnz*this.whG*run(this.whBp,this.rnd()*2-1));}
      if(this.bovEnv>1e-4){a+=run(this.bovBp,this.bovEnv*(this.rnd()*2-1));this.bovEnv*=this.bovDecay;}
      if(intake){
        const nz=(this.rnd()*2-1)*(0.25+Math.min(1,pulses));   // each induction stroke slaps the runner
        this.inLp+=inA*(nz-this.inLp);
        a+=intake*(8*run(this.inBp,nz)+c.intakeHiss*this.inLp);
      }
      if(this.ringEnv>1e-4){this.ringPh+=this.ringW;a+=this.ringEnv*Math.sin(this.ringPh);this.ringEnv*=this.ringDecay;}
      L[i]=EnginePulse.knee((l*x.gain+0.7071*a)*level);if(R!==L)R[i]=EnginePulse.knee((r*x.gain+0.7071*a)*level);
    }
    return true;
  }
}
registerProcessor('engine-pulse',EnginePulse);`+SOUND_GAS_SRC;
// Pulse character by cycle: tau (ms) the pulse decay, noise the rasp in it (a diesel's knock is its own
// voice, see soundDrive), ring how much of the primary's resonance is heard, drive how hard a bank's pipe saturates,
// qMul how the cycle changes the primary's ring: a 2-stroke's expansion chamber is a tuned cone that
// rings far harder than a straight header, a rotary's peripheral port dumps straight into the pipe.
const SOUND_TONE={
  petrol:   {tau:4.0,noise:0.5,ring:1.2,drive:1.6,qMul:1.0},
  diesel:   {tau:5.0,noise:0.4,ring:1.0,drive:1.4,qMul:1.0},
  twostroke:{tau:2.5,noise:0.7,ring:1.6,drive:1.8,qMul:2.0},
  rotary:   {tau:1.8,noise:0.8,ring:0.8,drive:1.6,qMul:0.6}
};
// What the exhaust does to the sound after the collector. The silencer is not in the breathing
// model, which only sees its back-pressure (sysV), so it is stated here: a stock system carries a
// chambered muffler, a sport one a straight-through absorptive can, a race one barely anything.
// muffleHz is where the silencer starts taking the top off, gain what it lets through.
const SILENCER={
  stock:{muffleHz:650, gain:0.60},
  sport:{muffleHz:1500,gain:0.85},
  race: {muffleHz:4500,gain:1.00}
};
// The exhaust's sound, from the same geometry the breathing model uses (engine.primL, exhSigma, sysL).
function exhaustSound(e){
  const T=exhaustGasT(0.7,0.6*e.redline,0);                 // a typical cruise-to-pull EGT
  const sil=SILENCER[e.exhaust]||SILENCER.stock,cat=CAT[e.cat]||CAT.stock;
  const turbo=e.intake==='turbo';
  // A cat's honeycomb is thousands of narrow channels: it absorbs the top end in proportion to how
  // restrictive it is. A turbine is the best silencer on the car: the pulse spends itself on the wheel.
  const cut=(1-6*cat.restrict)*(turbo?0.55:1);
  // Gas cools on its way down the system, to roughly 0.65 of its port temperature at the tailpipe.
  const primL=e.primL>0?e.primL:0.55, sysL=e.sysL>0?e.sysL:3.0;
  return {
    primF:sonic(T)/(4*primL),
    primQ:clamp(0.5/Math.max(0.04,e.exhSigma??0.35),1.2,10)*(SOUND_TONE[soundCycle(e)].qMul),
    sysF:sonic(0.65*T)/(2*sysL), sysQ:3, sysMix:0.6,
    muffleHz:sil.muffleHz*cut,
    // unburnt fuel that reaches a working cat is oxidised there instead of popping at the tailpipe
    popGain:1-0.6*cat.conv,
    // an anti-lag bang goes off in the manifold, before the cat, with far more fuel than a crackle: the cat
    // takes less of the edge off it
    bangGain:1-0.3*cat.conv,
    gain:sil.gain*(1-2*cat.restrict)*(turbo?0.75:1)
  };
}
// Compressor whine. A turbo wheel's tone is its full blades passing (splitters are shorter and
// quieter); a supercharger is driven off the crank, so it needs a drive ratio the breathing model never
// had to know. Stated here, as typical hardware: a Roots on a 2:1 pulley with two 3-lobe rotors, a
// twin-screw on 2.4:1 with a 4-lobe male rotor, a centrifugal on a 12:1 step-up gearbox and a wheel of 7
// full blades (its splitters, like a turbo's, shorter and quieter). h2/h3 the overtones of the tone, noise the share of the whine that is noise in a band of width
// f/q around the pass frequency (a blower whirrs; pure sines at one level were a drill), roll where the
// intake ducting and airbox start soaking it up. level is the amplitude flat out.
// Through build 159 a Roots blower sang three pure sines at 0.10 from idle (0.35 of it with no boost at
// all) and covered everything; a positive-displacement blower's bypass valve is open off boost, so it
// barely whines until the boost comes in. Flat out the levels put a Roots or screw whine 18-20 dB under the
// exhaust and a centrifugal's subtler whistle about 25 dB under:
// there, not on top of it.
const COMP_BLADES=6;
const SC_SOUND={
  roots:      {drive:2.0, passes:6, h2:0.3, h3:0.12,noise:0.6, q:9, roll:2500,level:0.075},
  screw:      {drive:2.4, passes:4, h2:0.25,h3:0.1, noise:0.5, q:10,roll:2500,level:0.060},
  centrifugal:{drive:12.0,passes:7, h2:0.1, h3:0.03,noise:0.35,q:14,roll:6000,level:0.120}
};
const TURBO_WHINE={h2:0.15,h3:0.05,noise:0.2,q:20,roll:6000,level:0.03};
// A turbo's whine and blow-off by its size, against the medium frame's 71 mm compressor. The whine's power
// goes with the air through the wheel, the exducer squared, so its amplitude with the exducer; a blow-off
// valve is sized to its compressor, its bore with the exducer, and jet noise's amplitude with the bore. Two
// turbos (or two valves) add their power: the square root of two.
const TURBO_REF_EXD=0.071;
function turboSoundScale(e){return clamp((e.compExd||TURBO_REF_EXD)/TURBO_REF_EXD,0.3,2)*Math.sqrt(e.turbUnits||1);}
// How much of the induction roar reaches you: open stacks all of it, an airbox much less. A compressor
// between the filter and the runners hushes it further.
const INTAKE_LEVEL={none:1.0,perf:0.6,stock:0.35,restrictive:0.25};
// A blow-off valve's bore: it sets how fast the charge pipe empties, with the volume the boost model
// already fills (engine.chargeVol).
const BOV_D=0.025;   // on the 71 mm reference compressor; scaled with the exducer (bovBore)
const bovBore=e=>BOV_D*clamp((e.compExd||TURBO_REF_EXD)/TURBO_REF_EXD,0.3,2);
function soundCycle(e){return e.ci?'diesel':e.type==='rotary'?'rotary':e.type==='twostroke'?'twostroke':'petrol';}
// Through a sport system (the default build) the pulse train is about a sixth as loud (rms) as the old
// sawtooth-and-square note at the same level; this brings it back to that loudness. A stock system
// and a turbine are then quieter than that, and a race header without a cat louder, as they should be.
// (Doubled in build 129: until then an over-loud intake roar was making up most of the level, and with
// the roar back in proportion the engines had lost two thirds of their loudness.)
const SOUND_PULSE_GAIN=9;
// The gas model's loudness (output rms) for a 0.45 L cylinder at full load, the law it follows with load
// (the pulse synth's, near enough), and the floor under which a fading signal is not lifted, as a share of
// the build's flat-out signal (an idle is about 0.25% of it, a fuel cut 7-17%: the cylinders still pump).
const SOUND_GAS_LEVEL=0.18,GAS_LOUD_LAW=0.9,GAS_FLOOR=0.001;
const gasLevel=(size,strength)=>SOUND_GAS_LEVEL*size*Math.pow(clamp(strength,0.02,2.5),GAS_LOUD_LAW);
// What the exhaust is heard at: soundDrive's pulse strength, but never below the cylinders pumping air.
// A fuel cut leaves the strength at a tenth of a near-empty charge (0.014 on a closed throttle), so a lift
// on an injected engine fell 31-35 dB within a few tenths of a second: the sound cut out. Yet the gas
// model, with the fuel off, still puts 7-17% of its flat-out signal down the pipe at 60% of the redline:
// the pistons push the air they draw through the exhaust whether it burned or not. That is the floor, falling
// with the revs, under both models (the synth's pulses and the gas model's loudness, whose leveller throws
// the model's own level away). soundDrive's strength itself is left as it is: the crackle's pipe heat and
// the knock read it, and a fuel cut really does stop heating the pipe.
const PUMP_FLOOR=0.2;
function exhaustStrength(e,s,strength){return Math.max(strength,PUMP_FLOOR*clamp(s.rpm/Math.max(1,e.redline),0,1));}
const GAS_SILENCER_HZ={stock:1400,sport:4000,race:12000};
// Level before the gain, for a 0.45 L cylinder; the pulse strength carries the load from there.
const SOUND_LEVEL=0.15;
// What the running engine is doing to the pulses this frame. dt in seconds; it advances Sound.hot. s is
// the engine's state: the live one on the dyno, or the lap replay's (trackSoundState) on the track.
//   strength  blowdown at exhaust-valve opening: trapped charge (MAP, bar) x its heating (the fuel the
//             air carries, 1/lambda, capped at stoich, where the air runs out). A fuel cut leaves
//             only compressed air. A diesel's manifold is unthrottled, so its idle pulse is soft
//             because it is lean (lambda ~4), not because it is starved.
//   lope      cycle-to-cycle variation from overlap: residual gas flowing back into the charge, which
//             needs manifold vacuum to happen. It fades with rpm and with load.
//   crackle   chance a cylinder misfires into a hot pipe. A carburettor cannot cut fuel on overrun,
//             so a closed throttle above idle feeds a charge too thin to burn; with the pipe still hot
//             from the pull, it lights there. Injection cuts the fuel (DFCO) and stays quiet. Anti-lag
//             does it on purpose, and keeps the pipe hot itself.
function soundDrive(dt,s=state){
  const e=engine,lam=s.afr/(e.stoichAFR||14.7);
  // a diesel has no throttle plate: whatever the live manifold reads, it traps atmosphere plus boost
  const trapped=e.ci?1+Math.max(0,s.boostActual||0):s.map;
  const strength=s.blown?0:trapped*(s.fuelCut?0.12:0.12+0.88*Math.min(1,1/Math.max(0.5,lam)));
  // exhaust heat: rises with load over about a second, and is gone a second and a half after it. It
  // has to be above what an idle or a fuelled overrun keeps up on its own (~0.35) for anything to pop.
  Sound.hot+=(Math.min(1,strength)-Sound.hot)*(1-Math.exp(-dt/(strength>Sound.hot?0.8:1.5)));
  const lope=(e.lumpiness||0)*clamp(1-(s.rpm-e.idleRpmEff)/2600,0.12,1)*clamp((1.05-s.map)/0.6,0.15,1);
  const overrun=s.throttle<0.03&&s.rpm>e.idleRpmEff+150&&s.rpm<e.redline;
  let crackle=0;
  if(overrun&&!e.canDFCO)crackle=0.35*clamp((s.rpm-e.idleRpmEff)/3000,0.2,1)*clamp((Sound.hot-0.4)/0.4,0,1);
  // anti-lag: on a lift it keeps the fuel and fires late, so the charge burns on in the manifold and the
  // turbine: bangs, with crackle between them
  let bang=0;
  if(overrun&&e.antilag&&s.rpm>2500){crackle=Math.max(crackle,0.15);bang=0.3;}
  // compressor whine
  let whineF=0,whineA=0;
  if(e.intake==='turbo'&&e.shaftJ){
    const n=Math.sqrt(2*Math.max(0,s.shaftE||0)/e.shaftJ)*60/(2*Math.PI);
    whineF=n/60*COMP_BLADES;
    // the pressure rise goes with tip speed squared; a closed throttle unloads the wheel
    // anti-lag keeps the wheel working on a lift
    whineA=TURBO_WHINE.level*turboSoundScale(e)*Math.pow(clamp(n/(e.shaftMax||1),0,1),2)*(s.throttle>0.1||e.antilag?1:0.4);
    // the ducting, filter and bonnet lining soak up the top end: near full speed the blade pass is
    // past 10 kHz, and heard straight it is a squeal rather than a whistle
    whineA/=1+Math.pow(whineF/TURBO_WHINE.roll,2);
  }else if(e.intake==='supercharger'){
    const sc=SC_SOUND[e.scType]||SC_SOUND.roots;
    whineF=s.rpm*sc.drive/60*sc.passes;
    const bf=clamp(s.boostActual/Math.max(0.05,e.boost_bar),0,1);
    // a Roots or a screw moves air from idle but only compresses (and so only whines hard) on boost, its
    // bypass open the rest of the time; a centrifugal's whistle goes with its impeller speed squared
    whineA=e.scType==='centrifugal'?sc.level*Math.pow(clamp(s.rpm/e.redline,0,1),2)*(0.3+0.7*bf):sc.level*(0.08+0.92*bf*bf);
    whineA/=1+Math.pow(whineF/sc.roll,2);
  }
  // induction roar: volumetric flow goes with manifold pressure x rpm
  const forced=e.intake!=='na';
  const intake=(INTAKE_LEVEL[e.airFilter]??0.5)*(forced?0.4:1)*clamp(s.map*s.rpm/e.redline,0,1.5)*0.15;
  // knock: a diesel's ignition delay is longest cold and at light load, where the injected fuel
  // waits longest and then all goes at once; a petrol engine past its knock limit detonates on
  // more of its cycles the further past it is
  let knockProb=0,knockAmp=0;
  // How hard it rings is how much fuel goes up at once: for a diesel that is the fuel injected during the
  // delay, which is not the load; for a detonating petrol charge it is the end gas, which is.
  if(e.ci){knockProb=1;knockAmp=0.025*clamp(1+(80-s.coolant)/50,1,2)*clamp(1.3-strength,0.3,1);}
  else{knockProb=clamp((s.knockRisk-KNOCK_TARGET)/60,0,1);knockAmp=0.06*Math.min(2,strength);}
  // blow-off: the charge pipe holds the boost the compressor made while the throttle was open; when the
  // throttle shuts on it, however gently, the valve vents it, once (a diesel has no throttle to shut)
  let bov=null;
  if(e.intake==='turbo'&&!e.ci){
    if(s.throttle>=0.1)Sound.chargeP=Math.max(0,s.boostActual||0);
    else if(Sound.chargeP>0.15){bov={amp:0.25*Math.min(1.5,Sound.chargeP)*turboSoundScale(e)};Sound.chargeP=0;}
  }
  if(s.blown)return {strength:0,lope:0,crackle:0,bang:0,whineF,whineA:0,intake:0,knockProb:0,knockAmp:0,bov:null};
  return {strength,lope,crackle,bang,whineF,whineA,intake,knockProb,knockAmp,bov};
}
// The engine as the lap replay has it at this moment. The solver recorded rpm, manifold pressure (closed
// throttle vacuum, and only the boost the shaft had built) and the pedals, which is what the pulses need.
// The rest is what a driven lap implies: injection cuts the fuel on a lift and the limiter at the redline,
// a calibrated mixture (rich flat out; a diesel fuelled leaner the less it is asked), a warm engine that
// does not knock, and a turbo spun to whatever the recorded boost takes (pressure rise goes with tip
// speed squared). A shift lifts the throttle, so a shift sounds like one, blow-off included.
function trackSoundState(st){
  // The throttle is recorded per point and held, the manifold interpolated toward the next; the boost the
  // compressor is making (upstream, in the charge pipe) is taken at the throttle's own point, or a lift
  // would find it already gone by the time the throttle shut on it.
  const R=lapResult&&lapResult.replay,e=engine,thr=st.thr||0;
  const boost=Math.max(0,(R&&R.map&&st.i!=null?R.map[st.i]:st.map||1)-1);
  let shaftE=0;
  if(e.intake==='turbo'&&e.shaftJ){
    const n=(e.shaftMax||0)*Math.sqrt(clamp(boost/Math.max(0.05,e.maxBoost||e.boost_bar||1),0,1)),w=n*2*Math.PI/60;
    shaftE=0.5*e.shaftJ*w*w;
  }
  const lam=e.ci?SMOKE_LAMBDA_CI+(2.25-SMOKE_LAMBDA_CI)*(1-thr):thr>0.9?0.88:1;
  return {rpm:st.rpm,map:st.map||1,throttle:thr,afr:lam*(e.stoichAFR||14.7),boostActual:boost,shaftE,
    fuelCut:(e.canDFCO&&thr<0.03&&st.rpm>e.idleRpmEff+150)||st.rpm>=e.redline,coolant:90,knockRisk:0,blown:false};
}
// Where the sound comes from: the dyno runs the live engine on its brake, the track tab plays the lap
// back (and is quiet while the replay is paused), and every other tab is quiet.
function soundSource(){
  if(vizMode==='dyno')return state;
  if(vizMode==='track'&&lapResult&&lapResult.replay&&lapReplay.playing)return trackSoundState(replayAt(lapResult,lapReplay.t));
  return null;
}
// What the worklet needs from a build: when in the cycle each cylinder fires, and into which bank.
// Banks split as the LIVE bank draws them: cylinders 1..ceil(n/2) are bank A.
function soundConfig(e){
  const n=e.cylinders,two=e.strokeDiv===2*Math.PI;
  const vee=e.layout==='v'||e.layout==='boxer',perBank=vee?Math.ceil(n/2):n;
  const events=firingOrder(e.layout,n).map((c,k)=>({at:k/n,bank:vee&&c>perBank?1:0}));
  const sc=e.intake==='supercharger'?SC_SOUND[e.scType]||SC_SOUND.roots:TURBO_WHINE;
  return {cycleRevs:two?1:2,banks:vee?2:1,events,tone:SOUND_TONE[soundCycle(e)],exhaust:exhaustSound(e),
    whine:[sc.h2,sc.h3,sc.noise,sc.q],
    intakeF:e.runnerL&&e.runnerA&&e.vEffCyl?helmholtzHz(e.runnerA,e.runnerL,e.vEffCyl,313):200,
    intakeHiss:e.airFilter==='none'||e.intakeSys==='itb'?0.2:0.05,
    knockF:1.84*sonic(2000)/(Math.PI*e.bore_mm/1000),       // Draper's first circumferential mode
    // venting the charge volume through the valve: V / (Cd A c), and it only cracks part open (x3)
    bovTau:3*(e.chargeVol||0.003)/(0.6*Math.PI/4*bovBore(e)**2*(e.turbUnits||1)*340)};
}
// The worklet is inline, so the app stays one file. A blob: URL is refused from a file:// page (its
// origin is opaque), a data: URL is not, so try the one and fall back to the other.
function loadSoundWorklet(ctx){
  const blob=URL.createObjectURL(new Blob([SOUND_WORKLET_SRC],{type:'application/javascript'}));
  return ctx.audioWorklet.addModule(blob)
    .catch(()=>ctx.audioWorklet.addModule('data:application/javascript;base64,'+btoa(SOUND_WORKLET_SRC)));
}
const Sound={ctx:null,node:null,cfgKey:'',cfg:null,model:'synth',gas:null,gasConv:null,gasLp:null,gasGain:null,gasKey:'',gasIR:'',gasRef:0,gasF:0,gasCalKey:'',hot:0,lastT:0,chargeP:0,osc:null,sub:null,filter:null,gain:null,lfo:null,lfoGain:null,on:false};
function initSound(){
  if(Sound.ctx)return;
  const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
  Sound.ctx=new AC();
  if(!Sound.ctx.audioWorklet){initToneSound();return;}
  loadSoundWorklet(Sound.ctx).then(()=>{
    Sound.node=new AudioWorkletNode(Sound.ctx,'engine-pulse',{outputChannelCount:[2]});
    Sound.node.connect(Sound.ctx.destination);Sound.cfgKey='';
    initGasChain();
  }).catch(initToneSound);
}
// Fallback for a browser without AudioWorklet: the old single note.
// The GAS model's chain: the worklet's exhaust pressure -> the recorded impulse response -> the silencer and
// the cat as a low-pass -> level -> a limiter. Built with the pulse node, silent until the GAS model is picked.
function initGasChain(){
  const c=Sound.ctx;
  Sound.gas=new AudioWorkletNode(c,'engine-gas',{outputChannelCount:[2]});
  Sound.gasLp=c.createBiquadFilter();Sound.gasLp.type='lowpass';Sound.gasLp.Q.value=0.6;
  Sound.gasGain=c.createGain();Sound.gasGain.gain.value=1;
  const lim=c.createDynamicsCompressor();lim.threshold.value=-6;lim.knee.value=6;lim.ratio.value=12;lim.attack.value=0.003;lim.release.value=0.15;
  Sound.gasLp.connect(Sound.gasGain);Sound.gasGain.connect(lim);lim.connect(c.destination);
  Sound.gasKey='';Sound.gasIR='';
}
// An impulse response as an AudioBuffer at the context's rate (a ConvolverNode needs the two to match).
function soundIRBuffer(ctx,key){
  const bin=atob(SOUND_IR[key]),n=bin.length>>1,src=new Float32Array(n);
  for(let i=0;i<n;i++){let v=bin.charCodeAt(2*i)|(bin.charCodeAt(2*i+1)<<8);if(v>32767)v-=65536;src[i]=v/32768;}
  const ratio=ctx.sampleRate/SOUND_IR.rate,m=Math.max(1,Math.round(n*ratio)),buf=ctx.createBuffer(1,m,ctx.sampleRate),d=buf.getChannelData(0);
  for(let i=0;i<m;i++){const t=i/ratio,k=Math.floor(t),f=t-k;d[i]=(src[k]||0)*(1-f)+(src[k+1]||0)*f;}
  return buf;
}
// A race system rings like engine-sim's minimal muffling, everything else like its mild exhaust; a new
// ConvolverNode each time, because older browsers refuse a second buffer on the same one.
function setGasIR(key){
  if(Sound.gasIR===key)return;
  const c=Sound.ctx,conv=c.createConvolver();conv.buffer=soundIRBuffer(c,key);
  if(Sound.gasConv){Sound.gas.disconnect();Sound.gasConv.disconnect();}
  Sound.gas.connect(conv);conv.connect(Sound.gasLp);Sound.gasConv=conv;Sound.gasIR=key;
}
// The gas model covers four-strokes (valves), two-strokes (piston ports, crankcase scavenged) and rotaries
// (three chambers a rotor), petrol and diesel: every type the designer builds.
function gasKind(e){return e.type==='rotary'?'rotary':e.strokeDiv===2*Math.PI?'two':'four';}
function gasSupported(e){return !!e&&e.cylinders>0;}
// A two-stroke's port timing (crank degrees open, centred on BDC), which the breathing model has no field
// for: typical of the type, and taken from the cam choice, which is what a port job is on a two-stroke.
// A road engine runs its exhaust about 180 deg and its transfers 120; a race one about 198 and 132.
const TWO_STROKE_PORTS={stock:{exh:180,tr:120},sport:{exh:190,tr:126},race:{exh:198,tr:132}};
// Spark and burn for the gas model, by kind: crank degrees for the piston engines, eccentric-shaft degrees
// (of the chamber's 1080) for a rotary, whose long thin chamber burns slowly; a diesel's injection near TDC.
function gasTiming(e,rf){
  const k=gasKind(e);
  if(e.ci)return {spark:5,burn:50};
  if(k==='rotary')return {spark:10+10*rf,burn:100+30*rf};
  if(k==='two')return {spark:18+8*rf,burn:45+15*rf};
  return {spark:20+10*rf,burn:55+15*rf};
}
function soundModelIsGas(){return Sound.model==='gas'&&gasSupported(engine);}
// The geometry the gas model needs, from the same build the breathing model uses.
function gasConfig(e){
  const cfg=soundConfig(e);
  return {cylinders:e.cylinders,bore:e.bore_mm/1000,stroke:e.stroke_mm/1000,cr:e.compression,
    ivDia:(e.ivDia_mm||0.45*e.bore_mm)/1000,ivCount:e.ivCount||2,ivLift:(e.ivLift_mm||0.25*0.45*e.bore_mm)/1000,
    camDur:e.camDur||240,overlap:e.overlap||0,primL:e.primL>0?e.primL:0.55,primD:e.primD||0.4*e.bore_mm/1000,
    sysL:e.sysL>0?e.sysL:3,sysD:e.sysD||0.06,sysPipes:e.sysPipes||1,runnerL:e.runnerL||0.4,runnerD:(e.runnerD_mm||0.42*e.bore_mm)/1000,
    events:cfg.events,banks:cfg.banks,kind:gasKind(e),
    // a rotary's geometry: bore_mm holds the generating radius, stroke_mm the rotor width
    rotR:e.bore_mm/1000,rotB:e.stroke_mm/1000,ecc:(e.ecc_mm||15)/1000,
    exhDur:(TWO_STROKE_PORTS[e.cam]||TWO_STROKE_PORTS.stock).exh,trDur:(TWO_STROKE_PORTS[e.cam]||TWO_STROKE_PORTS.stock).tr};
}
// How loud this engine's exhaust signal is, flat out at 60% of the redline: 0.3 s of the same gas model on
// the main thread, once per build. It sets the leveller's floor (engine-sim sets a volume per engine file by
// hand, and levels its output).
let gasLib=null;
function gasReference(cfg){
  if(!gasLib)gasLib=new Function('AudioWorkletProcessor','registerProcessor','sampleRate',SOUND_GAS_SRC+';return {GasEngine,GasChannel,makeGasEngine};')(class{},()=>{},48000);
  // measured after the audio chain's input stage (band limit, noise modulation), which treats a V8's slow
  // pulses and an I4's quick ones differently: normalising the raw pressure left them 5x apart
  const sim=gasLib.makeGasEngine(cfg,10000,4),rpm=0.6*engine.redline,tm=gasTiming(engine,0.6),ch=Array.from({length:cfg.banks},()=>new gasLib.GasChannel());
  const prev=new Float64Array(cfg.banks);let q=0,k=0,acc=0;
  for(let i=0;i<3000;i++){
    const o=sim.step(rpm,101325,1,0.9,tm.spark,tm.burn);
    for(;acc<1;acc+=10000/48000){let v=0;for(let b=0;b<cfg.banks;b++)v+=ch[b].run(prev[b]+(o[b]-prev[b])*acc,0.23);if(i>=1500){q+=v*v;k++;}}
    acc-=1;prev.set(o);
  }
  return Math.sqrt(q/k)||1;
}
// What the build does to the gas model's sound after the worklet: which impulse response, and the silencer,
// cat and turbine as a low-pass and a level (as exhaustSound's, with the cut it already works out).
function gasChainFor(e){
  const x=exhaustSound(e),cut=x.muffleHz/(SILENCER[e.exhaust]||SILENCER.stock).muffleHz;
  return {ir:e.exhaust==='race'?'minimal':'mild',lpHz:(GAS_SILENCER_HZ[e.exhaust]||GAS_SILENCER_HZ.stock)*cut,gain:x.gain};
}
// How much of the worklet's levelled signal the impulse response lets through for this engine: rendered
// offline at full load through the convolver alone, at six speeds from 20% to 80% of the redline, once per
// build. What it passes swings about 2.5x with the firing frequency (the recorded pipe's own resonances
// meeting the firing harmonics: a drone at one rpm, a hole at another), the same for every engine that fires
// at that rate, so two speeds could both land in a hole; six average it out. The loudness divides by it, so the luck of how an engine's
// pulse spectrum meets the recording does not move its level; the silencer, cat and turbine (the low-pass and
// gain after it) are left out of it on purpose, because their quietening is real. Resolves to the output rms
// per unit of level.
async function calibrateGas(rate,cfg,chain){
  let q=0,k=0;
  for(const share of [0.2,0.32,0.44,0.56,0.68,0.8]){
    const c=new OfflineAudioContext(2,Math.round(rate*0.35),rate);await loadSoundWorklet(c);
    const n=new AudioWorkletNode(c,'engine-gas',{outputChannelCount:[2]});n.port.postMessage(cfg);
    const conv=c.createConvolver();conv.buffer=soundIRBuffer(c,chain.ir);
    n.connect(conv);conv.connect(c.destination);
    const P=n.parameters,rf=share;P.get('rpm').value=share*engine.redline;P.get('map').value=101325;P.get('fuel').value=1;
    const tm=gasTiming(engine,rf);P.get('lambda').value=0.9;P.get('spark').value=tm.spark;P.get('burn').value=tm.burn;P.get('level').value=1;P.get('floor').value=1e-9;
    await new Promise(r=>setTimeout(r,20));              // let the configuration land before rendering
    const b=await c.startRendering(),L=b.getChannelData(0),R=b.getChannelData(1);
    for(let i=Math.round(rate*0.15);i<L.length;i++){q+=(L[i]*L[i]+R[i]*R[i])/2;k++;}
  }
  return Math.sqrt(q/k)||1;
}
function setSoundModel(m){
  Sound.model=m==='gas'?'gas':'synth';
  try{localStorage.setItem('pes.soundModel',Sound.model);}catch(e){}
  const sel=document.getElementById('edSoundModel');if(sel)sel.value=Sound.model;
}
try{if(localStorage.getItem('pes.soundModel')==='gas')Sound.model='gas';}catch(e){}
function initToneSound(){
  if(Sound.osc)return;
  Sound.gain=Sound.ctx.createGain();Sound.gain.gain.value=0;
  Sound.filter=Sound.ctx.createBiquadFilter();Sound.filter.type='lowpass';Sound.filter.frequency.value=900;
  Sound.osc=Sound.ctx.createOscillator();Sound.osc.type='sawtooth';
  Sound.sub=Sound.ctx.createOscillator();Sound.sub.type='square';
  Sound.osc.connect(Sound.filter);Sound.sub.connect(Sound.filter);
  Sound.filter.connect(Sound.gain);Sound.gain.connect(Sound.ctx.destination);
  // Lumpiness LFO: amplitude-modulates the note at the rev rate so a wild cam idles with a lope.
  Sound.lfo=Sound.ctx.createOscillator();Sound.lfo.type='sine';
  Sound.lfoGain=Sound.ctx.createGain();Sound.lfoGain.gain.value=0;
  Sound.lfo.connect(Sound.lfoGain);Sound.lfoGain.connect(Sound.gain.gain);
  Sound.osc.start();Sound.sub.start();Sound.lfo.start();
}
function updateSound(){
  if(!Sound.on||!Sound.ctx)return;
  const t=Sound.ctx.currentTime,src=soundSource(),s=src||state;
  // Rotaries sit bright & smooth, diesels dark & clattery; the note opens up with revs.
  const bright=(440+s.rpm*0.15+engine.cylinders*8)*(engine.type==='rotary'?1.5:engine.ci?0.6:1.0);
  if(Sound.node){
    const d=soundDrive(Math.min(0.1,t-(Sound.lastT||t)),s);Sound.lastT=t;
    const size=clamp(Math.sqrt((engine.dispCyl_L||0.45)/0.45),0.6,1.5);   // a pulse's energy scales with its cylinder
    const key=[engine.cylinders,engine.layout,engine.type,engine.ci,engine.strokeDiv,engine.exhaust,engine.cat,
      engine.intake,engine.primL,engine.sysL,engine.exhSigma,engine.redline,engine.scType,engine.airFilter,engine.intakeSys,
      engine.runnerL,engine.bore_mm,engine.chargeVol].join('|');
    if(key!==Sound.cfgKey){Sound.cfgKey=key;Sound.cfg=soundConfig(engine);Sound.node.port.postMessage(Sound.cfg);}
    const p=Sound.node.parameters;
    p.get('rpm').setTargetAtTime(s.rpm,t,0.05);
    p.get('bright').setTargetAtTime(bright,t,0.05);
    p.get('level').setTargetAtTime(!src||s.blown?0:SOUND_LEVEL*size*SOUND_PULSE_GAIN,t,0.08);
    // GAS model: the gas simulation makes the exhaust; the pulse node keeps only its other voices
    const gas=soundModelIsGas()&&Sound.gas;
    p.get('strength').setTargetAtTime(gas?0:exhaustStrength(engine,s,d.strength),t,0.012);    // quick, so the limiter's cut is heard
    if(Sound.gas)updateGasSound(gas&&src&&!s.blown,s,t,size,d.strength);
    p.get('lope').setTargetAtTime(d.lope,t,0.08);
    p.get('crackle').setTargetAtTime(d.crackle,t,0.03);
    p.get('whineF').setTargetAtTime(d.whineF,t,0.03);
    p.get('whineA').setTargetAtTime(d.whineA,t,0.06);
    p.get('bang').setTargetAtTime(d.bang,t,0.03);
    p.get('intake').setTargetAtTime(d.intake,t,0.05);
    p.get('knockProb').setTargetAtTime(d.knockProb,t,0.05);
    p.get('knockAmp').setTargetAtTime(d.knockAmp,t,0.05);
    if(d.bov)Sound.node.port.postMessage({bov:{amp:d.bov.amp,tau:Sound.cfg.bovTau}});
    return;
  }
  const loud=!src||s.blown?0:0.05+clamp((src===state?state.powerHP:s.map*60)/160,0,1)*0.13;
  if(!Sound.osc)return;
  // Firing frequency: 4-stroke fires once per cylinder every 2 revs; a 2-stroke and a rotary
  // make a power event every rev, so they fire twice as often (higher, busier note).
  const perRev=(engine.strokeDiv===2*Math.PI)?1:0.5;
  const fire=engine.cylinders*(s.rpm/60)*perRev;
  Sound.osc.frequency.setTargetAtTime(fire,t,0.05);
  Sound.sub.frequency.setTargetAtTime(fire/2,t,0.05);
  Sound.filter.frequency.setTargetAtTime(bright,t,0.05);
  Sound.gain.gain.setTargetAtTime(loud,t,0.08);
  Sound.lfo.frequency.setTargetAtTime(Math.max(4,s.rpm/60),t,0.05);
  const depth=(engine.lumpiness||0)*loud*clamp(1-(s.rpm-engine.idleRpmEff)/2600,0.12,1);
  Sound.lfoGain.gain.setTargetAtTime(depth,t,0.08);
}
// The gas model's operating point, from the same state soundDrive reads: the trapped charge (a diesel's is
// atmosphere plus boost, whatever its manifold reads), the fuel cut, the mixture, and a spark advance that
// grows with revs (a diesel's injection near TDC).
function updateGasSound(live,s,t,size,strength){
  const e=engine,g=Sound.gas.parameters;
  if(live){
    const key=gasConfig(e),k=JSON.stringify(key),chain=gasChainFor(e),ck=k+JSON.stringify(chain);
    if(k!==Sound.gasKey){Sound.gasKey=k;Sound.gasRef=gasReference(key);Sound.gas.port.postMessage(key);}
    if(ck!==Sound.gasCalKey){
      Sound.gasCalKey=ck;Sound.gasF=0;                    // muted until this build's chain is measured
      calibrateGas(Sound.ctx.sampleRate,key,chain).then(f=>{if(Sound.gasCalKey===ck)Sound.gasF=f;}).catch(()=>{if(Sound.gasCalKey===ck)Sound.gasF=1;});
    }
    setGasIR(chain.ir);
    // the recorded responses are of open-ish systems, so the silencer, the cat and a turbine are a low-pass on top
    Sound.gasLp.frequency.setTargetAtTime(chain.lpHz,t,0.1);
    Sound.gasGain.gain.setTargetAtTime(chain.gain,t,0.1);
    const rf=clamp(s.rpm/Math.max(1,e.redline),0,1);
    g.get('rpm').setTargetAtTime(s.rpm,t,0.05);
    g.get('map').setTargetAtTime(101325*(e.ci?1+Math.max(0,s.boostActual||0):Math.max(0.1,s.map)),t,0.03);
    g.get('fuel').setTargetAtTime(s.fuelCut?0:1,t,0.01);
    g.get('lambda').setTargetAtTime(clamp(s.afr/(e.stoichAFR||14.7),0.6,6),t,0.05);
    const tm=gasTiming(e,rf);
    g.get('spark').setTargetAtTime(tm.spark,t,0.1);
    g.get('burn').setTargetAtTime(tm.burn,t,0.1);
  }
  // The worklet levels the gas model's own swings away (it is ~300x quieter at idle than flat out, and not
  // on any one power law), and the loudness is set here instead, on the pulse synth's law: soundDrive's
  // pulse strength (trapped charge x fuelling, so a lean diesel idle is light load) to GAS_LOUD_LAW. The
  // floor is a few percent of the build's flat-out signal, so a fuel cut stays near-silent.
  g.get('level').setTargetAtTime(live&&Sound.gasF?gasLevel(size,exhaustStrength(e,s,strength))/Sound.gasF:0,t,0.04);
  g.get('floor').setTargetAtTime(GAS_FLOOR*(Sound.gasRef||1),t,0.1);
}
function setSound(on){
  Sound.on=on;
  if(on){initSound();if(Sound.ctx&&Sound.ctx.state==='suspended')Sound.ctx.resume();}
  else if(Sound.node){Sound.node.parameters.get('level').setTargetAtTime(0,Sound.ctx.currentTime,0.05);
    if(Sound.gas)Sound.gas.parameters.get('level').setTargetAtTime(0,Sound.ctx.currentTime,0.05);}
  else if(Sound.gain)Sound.gain.gain.setTargetAtTime(0,Sound.ctx.currentTime,0.05);
  const btn=document.getElementById('btnSound');
  btn.classList.toggle('on',on);btn.setAttribute('aria-pressed',on);btn.textContent=tr(on?'SOUND ON':'SOUND OFF');
}

