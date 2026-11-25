// ================================================================================================
// Induction / metering system. Until build 244 each also had flowTop and flowLow, a fitted top-end and low-rpm VE ramp;
// a carburettor's restriction is now its venturi (carbDp, src/js/parts.js). metering = AFR
// precision → efficiency (EFI holds optimal AFR everywhere; carbs/mech run rich & waste
// fuel). perCyl = a throttle per cylinder (sidedraft carburettors, throttle bodies, and the slide or butterfly sets
// mechanical injection ran: probable), which sets the manifold volume behind the throttle (mapRateK). idle = idle-rpm penalty. di =
// whether direct injection is available. Values chosen to reflect real relative behaviour.
const INTAKE_SYS={
  carb1:    {label:'1-BBL CARB',       metering:0.90,idle:0,  di:false},
  carb2:    {label:'2-BBL CARB',      metering:0.92,idle:0,  di:false},
  carb4:    {label:'4-BBL CARB',      metering:0.93,idle:40, di:false},
  sidedraft:{label:'SIDEDRAFT CARBS', metering:0.92,idle:250,di:false,perCyl:true},
  mech:     {label:'MECH INJECTION',  metering:0.89,idle:300,di:false,perCyl:true},
  efi:      {label:'EFI (SINGLE TB)', metering:1.00,idle:0,  di:true},
  itb:      {label:'EFI (ITB)',       metering:1.00,idle:180,di:true,perCyl:true}
};
// Air filter (build 210): the factory systems, as what they restrict at the engine's peak flow. Until build 210 each was
// a VE loss fitted in proportion to rpm (stock -4% at the redline, stacks +2%); now the restriction is the filter's
// own pressure drop at the flow it passes (parts.js: the media by Darcy's law, the housing by its velocity head), and
// these are the factory sizings, at full flow:
//   stock        an OEM airbox with a clean paper element: 3.75 kPa, the top of the 2-3.75 kPa read by restriction
//                gauges on new filters at full throttle (BITOG gauge reports; ORNL/TM-2009/021's cars);
//   perf         an open element of oiled cotton: 1.0 kPa, as it was fitted (no measured figure: makers claim ~50%
//                more flow than paper per area);
//   restrictive  the stock box with a clogged element: 6.5 kPa, ORNL's 6-7 kPa for a clogged filter at full throttle;
//   none         open stacks: nothing in the way.
// media is the element's: its face velocity at full flow sets the media's share; the housing takes the rest.
const AIR_FILTER={
  none:       {label:'NONE (STACKS)',kPa:0,   housing:'none',  media:'cotton'},
  perf:       {label:'PERFORMANCE',  kPa:1.0, housing:'open',  media:'cotton'},
  stock:      {label:'STOCK PAPER',  kPa:3.75,housing:'airbox',media:'paper'},
  restrictive:{label:'RESTRICTIVE',  kPa:6.5, housing:'airbox',media:'paper',clogged:true}
};

// The engine build spec. Everything downstream derives from this object, so new
// subsystems (electrical, cooling, etc.) can be added later as more fields here.
// Default is a modern 1.6 L naturally-aspirated sport four (high compression, DI, VVT,
// coil-on-plug with ECU knock-limited timing).
const DEFAULT_ENGINE={
  type:'petrol4',
  cylinders:4,bore_mm:81,stroke_mm:78,compression:12.5,layout:'inline',redline:7200,
  intake:'na',boost_bar:0,intercooler:'large',turboSize:'medium',compExd_mm:0,taperRpm:0,taperPct:100,tqLimit:0,govRpm:0,turboConfig:'single',housing:'stock',vgt:false,scType:'roots',antilag:false,nitrous:'none',waterMeth:'none',exhaust:'sport',cat:'stock',
  intakeSys:'efi',airFilter:'perf',
  cam:'stock',vvt:true,cylDeact:false,balShaft:false,drySump:false,valves:4,valveMat:'steel',valveSpring:'stock',runner:'medium',
  fuel:'gasoline',octane:95,injector:'direct',ignitionAdv:22,ignitionType:'coil',timingMode:'auto',afrMode:'auto',
  radiator:'stock',radHp:0,springRpm:0,ivValve_mm:0,evValve_mm:0,camDur_deg:0,camLsa_deg:0,camLift_mm:0,fan:'electric',oilCooler:false,thermostat:88,
  alternator:'120',startStop:false
};
// Ready-made popular builds (deltas over DEFAULT_ENGINE). Loaded from the DESIGN dropdown.
const PRESETS=[
  {cat:'Archetypes',name:'1.6 Sport NA I4',        engine:{}},
  {cat:'Archetypes',name:'1.0 Kei Turbo I3',       engine:{cylinders:3,bore_mm:73,stroke_mm:79.6,compression:9.5,redline:7000,intake:'turbo',boost_bar:0.7,turboSize:'small',injector:'port'}},
  {cat:'Archetypes',name:'1.5 Turbo Eco I4',       engine:{cylinders:4,bore_mm:73,stroke_mm:89.5,compression:10.5,redline:6500,intake:'turbo',boost_bar:0.8,turboSize:'small',airFilter:'stock',exhaust:'stock'}},
  {cat:'Archetypes',name:'2.0 Turbo Hot-Hatch I4', engine:{valveSpring:'perf',cylinders:4,bore_mm:86,stroke_mm:86,compression:9.8,redline:7000,intake:'turbo',boost_bar:1.0,turboSize:'medium',octane:98,cam:'sport',exhaust:'sport',radiator:'large',oilCooler:true}},
  {cat:'Archetypes',name:'2.0 ITB NA Screamer I4', engine:{valves:4,valveMat:'titanium',valveSpring:'race',cylinders:4,bore_mm:87,stroke_mm:84,compression:11.7,redline:8800,intakeSys:'itb',airFilter:'none',cam:'race',exhaust:'race',cat:'none',octane:98,injector:'port',radiator:'large',oilCooler:true}},
  {cat:'Archetypes',name:'2.5 Turbo I5 (RS)',      engine:{valveSpring:'perf',cylinders:5,bore_mm:82.5,stroke_mm:92.8,compression:10,redline:7000,intake:'turbo',boost_bar:1.1,turboSize:'medium',octane:98,cam:'sport',exhaust:'sport',radiator:'large',oilCooler:true}},
  {cat:'Archetypes',name:'3.0 Turbo I6 (2JZ)',     engine:{valveSpring:'perf',cylinders:6,bore_mm:84,stroke_mm:90,compression:10.2,redline:7000,intake:'turbo',boost_bar:0.9,turboSize:'medium',octane:98,cam:'sport',exhaust:'sport',radiator:'large',oilCooler:true}},
  {cat:'Archetypes',name:'5.0 V8 NA Muscle',       engine:{valvetrain:'ohv-roller',valves:2,valveSpring:'perf',cylinders:8,bore_mm:93,stroke_mm:92.7,compression:12,layout:'v',redline:7500,cam:'sport',exhaust:'sport',radiator:'large',oilCooler:true}},
  {cat:'Archetypes',name:'6.2 Supercharged V8',    engine:{valvetrain:'ohv-roller',valves:2,valveSpring:'race',cylinders:8,bore_mm:103.9,stroke_mm:90.9,compression:9.5,layout:'v',redline:6400,intake:'supercharger',boost_bar:0.65,octane:98,injector:'port',vvt:false,cam:'sport',exhaust:'sport',radiator:'large',oilCooler:true}},
  {cat:'Archetypes',name:'6.5 V12 NA Supercar',    engine:{valves:4,valveMat:'titanium',valveSpring:'race',cylinders:12,bore_mm:95,stroke_mm:76.4,compression:11.8,layout:'v',redline:8500,intakeSys:'itb',cam:'race',exhaust:'race',cat:'sport',octane:98,injector:'port',radiator:'large',oilCooler:true}},
  // A 2.0 turbodiesel runs a SMALL variable-geometry frame (a ~49 mm compressor, BV43/GTB1749V class).
  // It carried the medium frame until build 87, which on a 2.0 L does not make full boost until 2800 rpm.
  {cat:'Archetypes',name:'2.0 Turbo Diesel I4',    engine:{type:'diesel',vvt:false,cylinders:4,bore_mm:84,stroke_mm:90,compression:17,redline:4800,govRpm:3900,intake:'turbo',boost_bar:1.2,turboSize:'small',vgt:true,intakeSys:'efi',injector:'direct',exhaust:'stock',cat:'stock',radiator:'large',oilCooler:true}},
  {cat:'Archetypes',name:'6.6 V8 Turbodiesel',     engine:{type:'diesel',vvt:false,cylinders:8,bore_mm:103,stroke_mm:99,compression:16.5,layout:'v',redline:3800,govRpm:3100,intake:'turbo',boost_bar:1.1,turboSize:'large',turboConfig:'single',vgt:true,intakeSys:'efi',injector:'direct',exhaust:'stock',cat:'stock',radiator:'large',oilCooler:true}},
  {cat:'Archetypes',name:'1.3 Rotary Turbo (13B)', engine:{type:'rotary',cylinders:2,bore_mm:105,stroke_mm:80,ecc_mm:15,compression:9.4,redline:9000,intake:'turbo',boost_bar:0.7,turboSize:'medium',turboConfig:'sequential',intakeSys:'efi',injector:'port',exhaust:'sport',cat:'sport',octane:98,radiator:'large',oilCooler:true}},
  {cat:'Archetypes',name:'1.3 Rotary NA (Renesis)',engine:{type:'rotary',cylinders:2,bore_mm:105,stroke_mm:80,ecc_mm:15,compression:10,redline:9000,intakeSys:'itb',injector:'port',exhaust:'sport',cat:'sport',octane:98,radiator:'large',oilCooler:true}},
  {cat:'Archetypes',name:'500cc 2-Stroke Twin',    engine:{type:'twostroke',cylinders:2,bore_mm:70,stroke_mm:64,compression:9,redline:9500,intakeSys:'carb2',airFilter:'perf',exhaust:'race',cat:'none',octane:98,injector:'port',ignitionType:'coil',radiator:'stock'}},
  // ---- Real engines (build 96) ----------------------------------------------------------------
  // Geometry and hardware from published specifications, so the model can be compared with the real
  // thing; `real` carries the maker's rating (hp, rpm; Nm, rpm). Nothing here is tuned to land on it —
  // ECU boost taper (build 131): taperRpm/taperPct are the factory ECU's high-rpm boost calibration, solved so peak
  // power meets the maker's rating with the taper starting at or after the maker's peak-torque rpm (where an ECU
  // trims), the gentlest such taper. It is a CONTROL input, like the speed limiter or the fuel: the physics is
  // untouched, and setting BOOST TAPER FROM to 0 shows what the hardware itself makes. Left off where the hardware is
  // at or below the rating, and where no taper from the torque peak reaches it: the RB26's 280 PS is a voluntary
  // cap. (The Cummins's excess was the diesel's own top end; since build 172 a diesel has a governor (govRpm, the
  // maker's rated speed) and the diesels' tapers are re-solved with it: TDI 54 -> 44%, N57 58 -> 54%, Duramax 26 ->
  // 51%. The Cummins stayed without one until build 199: no taper reached its rating, because its 1356 Nm is 25.4 bar BMEP, above the
  // soft ceiling dieselImepLimit puts on a diesel, so its midrange is short and its top end makes up for it. The
  // archetype diesels take their rated speed at 0.81 of their limit, the L5P's published 2800 / 3450.) Build 199 put the
  // Cummins on the 2019 press kit's compression (16.2) and boost (2.28 bar), from which it exceeds its rating and a taper from
  // its torque peak meets it. Re-solved in build 132 (the octane index moved the
  // knock limit): the GTI and the Hellcat now exceed their ratings on the hardware alone and carry a taper. And in
  // build 133 (the turbine throat, the compressor island, real wheels): the Civic on its 58 mm wheel is now at its
  // rating on the hardware alone and carries none.
  // ECU torque limit (build 138): tqLimit is the maker's torque where the maker quotes it as a PLATEAU over a speed
  // range (GTI 350 Nm 1500-4400, FK8 400 Nm 2500-4500, GR Yaris 360 Nm 3000-4600, EcoBoost 170 Nm 1400-4500, RS3
  // 480 Nm 1700-5850, TDI 320 Nm 1750-3000, N57 560 Nm 1500-3000): a flat line across thousands of rpm is a
  // torque-based ECU's calibration, not an engine's curve. Engines quoted at a single peak (the 2JZ, EJ257, 4G63,
  // RB26, the kei and city turbos, the truck diesels) carry none. The tapers above were solved with it in place.
  // valvetrain (build 243), which the friction model reads (src/js/friction.js): set where the maker's layout is well
  // documented (pushrods with roller lifters on the GM small-blocks, the Hemis, the Viper and the two diesels; flat tappets
  // on the 1965 Windsor; rockers on the air-cooled Porsches and Honda's VTEC engines; roller fingers on the EcoBoosts,
  // the modular Fords and BMW's and VW's turbo engines; single-cam buckets on the EA827 and the XU9; twin-cam buckets on
  // the 2-valve Jaguar, Ferrari and Lamborghini engines). Elsewhere it follows the valves: four or five, twin cams over
  // buckets; two, a single cam with rockers. unsure marks the Honda K20s, the GNX and the Prius.
  // the gap between the dyno and `real` IS the comparison. `unsure` names the inputs that are not in
  // the maker's published data and were set from typical practice (mostly boost pressure). Ratings
  // marked `note` are not what the engine makes: the JDM 280 PS / kei 64 PS gentlemen's agreements.
  // `silencer` (build 325): a road car's equal-length header (exhaust:'race') still ends in a road silencer, which
  // passed its market's drive-by noise rule. Straight-through (absorptive) is typical of sports and supercar systems;
  // none of these presets' sources says which, so each is marked unsure.
  {cat:'Kei & City',name:'Suzuki K6A turbo (Alto Works)',real:{hp:64,hpRpm:6000,tq:100,tqRpm:3000},unsure:['compExd_mm'],note:'kei-class 64 PS legal cap',
   engine:{cylinders:3,bore_mm:68.0,stroke_mm:60.4,compression:8.9,redline:7200,intake:'turbo',boost_bar:0.75,turboSize:'small',compExd_mm:40,cam:'stock',injector:'port',intercooler:'small',exhaust:'stock',airFilter:'stock',octane:95,taperRpm:3500,taperPct:25}},
  {cat:'Kei & City',name:'Toyota 1KR-FE (Aygo 1.0)',real:{hp:68,hpRpm:6000,tq:93,tqRpm:3600},
   engine:{cylinders:3,bore_mm:71.0,stroke_mm:84.0,compression:10.5,redline:6500,cam:'stock',vvt:true,injector:'port',octane:95,exhaust:'stock',airFilter:'stock',runner:'long'}},
  {cat:'Kei & City',name:'Fiat 0.9 TwinAir turbo',real:{hp:84,hpRpm:5500,tq:145,tqRpm:1900},unsure:['boost_bar'],
   engine:{cylinders:2,bore_mm:80.5,stroke_mm:86.0,compression:10.0,redline:6000,intake:'turbo',boost_bar:1.0,turboSize:'small',compExd_mm:40,cam:'stock',vvt:true,injector:'port',intercooler:'small',exhaust:'stock',airFilter:'stock',octane:95,taperRpm:2000,taperPct:35}},
  {cat:'Compact Turbo',name:'Ford 1.0 EcoBoost (Fiesta 125)',real:{hp:123,hpRpm:6000,tq:170,tqRpm:1400},unsure:['boost_bar'],
   engine:{valvetrain:'dohc-roller',cylinders:3,bore_mm:71.9,stroke_mm:82.0,compression:10.0,redline:6500,intake:'turbo',boost_bar:1.2,turboSize:'small',cam:'stock',vvt:true,injector:'direct',intercooler:'small',exhaust:'stock',airFilter:'stock',octane:95,taperRpm:3000,taperPct:53,tqLimit:170}},
  {cat:'Compact Turbo',name:'VW EA888 2.0 TSI (Golf GTI Mk7)',real:{hp:220,hpRpm:4500,tq:350,tqRpm:1500},
   engine:{valvetrain:'dohc-roller',cylinders:4,bore_mm:82.5,stroke_mm:92.8,compression:9.6,redline:6500,intake:'turbo',boost_bar:1.1,turboSize:'small',cam:'stock',injector:'direct',intercooler:'large',exhaust:'stock',airFilter:'stock',octane:98,taperRpm:1500,taperPct:60,tqLimit:350}},
  {cat:'Compact Turbo',name:'Toyota G16E-GTS (GR Yaris)',real:{hp:257,hpRpm:6500,tq:360,tqRpm:3000},unsure:['boost_bar'],
   engine:{cylinders:3,bore_mm:87.5,stroke_mm:89.7,compression:10.5,redline:7000,intake:'turbo',boost_bar:1.4,turboSize:'medium',compExd_mm:56,cam:'sport',vvt:true,injector:'direct',intercooler:'large',exhaust:'sport',airFilter:'perf',octane:98,taperRpm:3000,taperPct:60,tqLimit:360}},
  {cat:'Compact Turbo',name:'Honda K20C1 (Civic Type R FK8)',real:{hp:316,hpRpm:6500,tq:400,tqRpm:2500},unsure:['valvetrain','boost_bar'],
   engine:{valvetrain:'dohc-finger',cylinders:4,bore_mm:86.0,stroke_mm:85.9,compression:9.8,redline:7000,intake:'turbo',boost_bar:1.6,turboSize:'medium',compExd_mm:58,cam:'sport',vvt:true,injector:'direct',intercooler:'large',exhaust:'sport',airFilter:'perf',octane:98,tqLimit:400}},
  {cat:'NA Sports',name:'Mazda B6-ZE (MX-5 NA)',real:{hp:115,hpRpm:6500,tq:136,tqRpm:5500},
   engine:{cylinders:4,bore_mm:78.0,stroke_mm:83.6,compression:9.4,redline:7200,cam:'stock',vvt:false,injector:'port',octane:95,exhaust:'stock',airFilter:'stock'}},
  {cat:'NA Sports',name:'Toyota 4A-GE (AE86)',real:{hp:128,hpRpm:6600,tq:149,tqRpm:5200},
   engine:{cylinders:4,bore_mm:81.0,stroke_mm:77.0,compression:9.4,redline:7600,cam:'sport',vvt:false,injector:'port',octane:95,exhaust:'stock',airFilter:'stock',runner:'medium'}},
  {cat:'NA Sports',name:'Honda F20C (S2000 AP1)',real:{hp:240,hpRpm:8300,tq:208,tqRpm:7500},unsure:['silencer'],
   engine:{valvetrain:'dohc-finger',cylinders:4,bore_mm:87.0,stroke_mm:84.0,compression:11.0,redline:8900,cam:'race',injector:'port',octane:98,airFilter:'perf',runner:'short',exhaust:'race',silencer:'absorptive'}},
  {cat:'NA Sports',name:'BMW S54 (M3 E46)',real:{hp:343,hpRpm:7900,tq:365,tqRpm:4900},unsure:['silencer'],
   engine:{cylinders:6,bore_mm:87.0,stroke_mm:91.0,compression:11.5,redline:8000,cam:'race',injector:'port',octane:98,intakeSys:'itb',airFilter:'perf',runner:'short',exhaust:'race',silencer:'absorptive'}},
  {cat:'NA Sports',name:'Porsche 4.0 flat-six (911 GT3 991.2)',real:{hp:493,hpRpm:8250,tq:460,tqRpm:6000},unsure:['silencer'],
   engine:{valvetrain:'dohc-finger',cylinders:6,layout:'boxer',bore_mm:102.0,stroke_mm:81.5,compression:13.3,redline:9000,cam:'race',vvt:true,valveSpring:'race',valveMat:'titanium',injector:'direct',octane:98,exhaust:'race',silencer:'absorptive',airFilter:'perf',runner:'variable'}},
  {cat:'Turbo Performance',name:'Toyota 2JZ-GTE (Supra A80)',real:{hp:320,hpRpm:5600,tq:427,tqRpm:4000},unsure:['compExd_mm'],note:'export rating; JDM cars were quoted at 280 PS',
   engine:{cylinders:6,bore_mm:86.0,stroke_mm:86.0,compression:8.5,redline:6800,intake:'turbo',boost_bar:0.75,turboSize:'medium',compExd_mm:58,turboConfig:'sequential',cam:'sport',vvt:false,injector:'port',intercooler:'large',exhaust:'sport',airFilter:'perf',octane:98,taperRpm:4000,taperPct:35}},   // VVT-i only from mid-1997 (MY1998)
  {cat:'Turbo Performance',name:'Nissan RB26DETT (Skyline GT-R R34)',real:{hp:276,hpRpm:6800,tq:392,tqRpm:4400},unsure:['runner'],note:'JDM 280 PS gentlemen\'s agreement; real output is higher',
   engine:{cylinders:6,bore_mm:86.0,stroke_mm:73.7,compression:8.5,redline:8000,intake:'turbo',boost_bar:0.7,turboSize:'small',turboConfig:'twin',cam:'sport',vvt:false,injector:'port',intakeSys:'itb',intercooler:'large',exhaust:'sport',airFilter:'perf',runner:'short',octane:98}},
  {cat:'Turbo Performance',name:'Subaru EJ257 (Impreza WRX STI)',real:{hp:296,hpRpm:6000,tq:407,tqRpm:4000},unsure:['boost_bar','runner'],
   engine:{cylinders:4,layout:'boxer',bore_mm:99.5,stroke_mm:79.0,compression:8.2,redline:7000,intake:'turbo',boost_bar:1.0,turboSize:'medium',cam:'sport',vvt:true,injector:'port',intercooler:'small',exhaust:'sport',airFilter:'perf',runner:'long',octane:98,taperRpm:4000,taperPct:36}},
  {cat:'Turbo Performance',name:'Mitsubishi 4G63T (Lancer Evo IX)',real:{hp:286,hpRpm:6500,tq:392,tqRpm:3500},unsure:['boost_bar','compExd_mm'],
   engine:{cylinders:4,bore_mm:85.0,stroke_mm:88.0,compression:8.8,redline:7000,intake:'turbo',boost_bar:1.3,turboSize:'medium',compExd_mm:68,cam:'sport',vvt:true,injector:'port',intercooler:'large',exhaust:'sport',airFilter:'perf',octane:98,taperRpm:3500,taperPct:49}},
  {cat:'Turbo Performance',name:'Audi 2.5 TFSI (RS3 8V)',real:{hp:394,hpRpm:5850,tq:480,tqRpm:1700},unsure:['boost_bar','turboSize'],
   engine:{valvetrain:'dohc-roller',cylinders:5,bore_mm:82.5,stroke_mm:92.8,compression:10.0,redline:7000,intake:'turbo',boost_bar:1.4,turboSize:'medium',cam:'sport',vvt:true,injector:'direct',octane:98,intercooler:'large',exhaust:'sport',airFilter:'perf',taperRpm:2000,taperPct:64,tqLimit:480}},
  {cat:'American V8',name:'GM LS3 (Corvette C6)',real:{hp:430,hpRpm:5900,tq:575,tqRpm:4600},
   engine:{valvetrain:'ohv-roller',cylinders:8,layout:'v',bore_mm:103.25,stroke_mm:92.0,compression:10.7,redline:6600,valves:2,cam:'sport',vvt:false,valveSpring:'perf',injector:'port',octane:98,exhaust:'sport',airFilter:'perf'}},
  {cat:'American V8',name:'GM LS7 (Corvette Z06 C6)',real:{hp:505,hpRpm:6300,tq:637,tqRpm:4800},
   engine:{valvetrain:'ohv-roller',cylinders:8,layout:'v',bore_mm:104.8,stroke_mm:101.6,compression:11.0,redline:7000,valves:2,cam:'race',vvt:false,valveSpring:'race',valveMat:'titanium',injector:'port',octane:98,exhaust:'sport',airFilter:'perf'}},
  {cat:'American V8',name:'Ford Coyote 5.0 (Mustang GT 2018)',real:{hp:460,hpRpm:7000,tq:569,tqRpm:4600},
   engine:{valvetrain:'dohc-roller',cylinders:8,layout:'v',bore_mm:93.0,stroke_mm:92.7,compression:12.0,redline:7500,cam:'sport',vvt:true,injector:'direct',octane:98,exhaust:'sport',airFilter:'perf',runner:'variable'}},
  {cat:'American V8',name:'Dodge 6.2 Hellcat (Challenger SRT)',real:{hp:707,hpRpm:6000,tq:881,tqRpm:4000},
   engine:{valvetrain:'ohv-roller',cylinders:8,layout:'v',bore_mm:103.9,stroke_mm:90.9,compression:9.5,redline:6200,intake:'supercharger',boost_bar:0.8,scType:'screw',valves:2,cam:'sport',vvt:true,injector:'port',octane:98,intercooler:'large',exhaust:'sport',airFilter:'perf',taperRpm:4000,taperPct:72}},
  // Supercar (build 148): four popular cars from each decade since the 90s, by their makers' figures. The 2020s are
  // the combustion-only ones: the model has no electric motor, so the hybrids of the decade are left out.
  {cat:'Supercar',era:'1990s',name:'Ferrari F129B V8 (F355)',real:{hp:375,hpRpm:8250,tq:363,tqRpm:6000},unsure:['silencer'],
   engine:{cylinders:8,layout:'v',bore_mm:85.0,stroke_mm:77.0,compression:11.0,redline:8500,valves:5,valveMat:'titanium',cam:'race',vvt:false,valveSpring:'race',injector:'port',octane:98,exhaust:'race',silencer:'absorptive',airFilter:'perf',runner:'medium'}},
  {cat:'Supercar',era:'1990s',name:'Lamborghini 5.7 V12 (Diablo VT)',real:{hp:492,hpRpm:7000,tq:580,tqRpm:5200},unsure:['compression','redline'],
   engine:{cylinders:12,layout:'v',bore_mm:87.0,stroke_mm:80.0,compression:10.0,redline:7300,cam:'sport',vvt:false,valveSpring:'perf',injector:'port',octane:98,exhaust:'sport',airFilter:'perf',runner:'medium'}},
  {cat:'Supercar',era:'1990s',name:'BMW S70/2 V12 (McLaren F1)',real:{hp:627,hpRpm:7400,tq:651,tqRpm:5600},unsure:['silencer'],
   engine:{cylinders:12,layout:'v',bore_mm:86.0,stroke_mm:87.0,compression:11.0,redline:7500,cam:'race',vvt:true,valveSpring:'race',injector:'port',intakeSys:'itb',octane:98,exhaust:'race',silencer:'absorptive',airFilter:'perf',runner:'medium',oilCooler:true,radiator:'large'}},
  {cat:'Supercar',era:'1990s',name:'Porsche M64/60 twin-turbo flat-six (911 Turbo 993)',real:{hp:408,hpRpm:5750,tq:540,tqRpm:4500},unsure:['boost_bar','turboSize'],
   engine:{valvetrain:'sohc-rocker',cylinders:6,layout:'boxer',bore_mm:100.0,stroke_mm:76.4,compression:8.0,redline:6700,valves:2,intake:'turbo',boost_bar:0.8,turboSize:'small',turboConfig:'twin',intercooler:'large',cam:'sport',vvt:false,injector:'port',octane:98,exhaust:'sport',airFilter:'perf',runner:'medium',oilCooler:true,radiator:'large'}},
  {cat:'Supercar',era:'2000s',name:'Ferrari F140B V12 (Enzo)',real:{hp:651,hpRpm:7800,tq:657,tqRpm:5500},unsure:['silencer'],
   engine:{cylinders:12,layout:'v',bore_mm:92.0,stroke_mm:75.2,compression:11.2,redline:8200,valveMat:'titanium',injector:'port',cam:'race',vvt:true,valveSpring:'race',octane:98,exhaust:'race',silencer:'absorptive',airFilter:'perf',runner:'variable'}},
  {cat:'Supercar',era:'2000s',name:'Porsche 5.7 V10 (Carrera GT)',real:{hp:604,hpRpm:8000,tq:590,tqRpm:5750},unsure:['silencer'],
   engine:{cylinders:10,layout:'v',bore_mm:98.0,stroke_mm:76.0,compression:12.0,redline:8400,valveMat:'titanium',injector:'port',cam:'race',vvt:true,valveSpring:'race',octane:98,exhaust:'race',silencer:'absorptive',airFilter:'perf',runner:'variable'}},
  {cat:'Supercar',era:'2000s',name:'Ford 5.4 supercharged V8 (Ford GT)',real:{hp:550,hpRpm:6500,tq:678,tqRpm:3750},unsure:['boost_bar','intercooler'],note:'the real blower makes 0.83 bar; from that the model makes 30% more than the rating, so the boost is set lower',
   engine:{valvetrain:'dohc-roller',cylinders:8,layout:'v',bore_mm:90.2,stroke_mm:105.8,compression:8.4,redline:6500,intake:'supercharger',scType:'screw',boost_bar:0.55,intercooler:'small',cam:'sport',vvt:false,valveSpring:'perf',injector:'port',octane:98,exhaust:'sport',airFilter:'perf',runner:'medium',oilCooler:true,radiator:'large'}},
  {cat:'Supercar',era:'2000s',name:'Lamborghini 6.5 V12 (Murciélago LP640)',real:{hp:631,hpRpm:8000,tq:660,tqRpm:6000},unsure:['silencer'],
   engine:{cylinders:12,layout:'v',bore_mm:88.0,stroke_mm:89.0,compression:11.0,redline:8500,injector:'port',cam:'race',vvt:true,valveSpring:'race',octane:98,exhaust:'race',silencer:'absorptive',airFilter:'perf',runner:'variable'}},
  {cat:'Supercar',era:'2010s',name:'Ferrari F136 FB V8 (458 Italia)',real:{hp:562,hpRpm:9000,tq:540,tqRpm:6000},unsure:['silencer'],
   engine:{cylinders:8,layout:'v',bore_mm:94.0,stroke_mm:81.0,compression:12.5,redline:9000,valveMat:'titanium',cam:'race',vvt:true,valveSpring:'race',injector:'direct',octane:98,exhaust:'race',silencer:'absorptive',airFilter:'perf',runner:'variable'}},
  {cat:'Supercar',era:'2010s',name:'Lamborghini 5.2 V10 (Huracán LP610-4)',real:{hp:602,hpRpm:8250,tq:560,tqRpm:6500},unsure:['silencer'],
   engine:{cylinders:10,layout:'v',bore_mm:84.5,stroke_mm:92.8,compression:12.7,redline:8500,cam:'race',vvt:true,valveSpring:'race',injector:'direct',octane:98,exhaust:'race',silencer:'absorptive',airFilter:'perf',runner:'variable'}},
  {cat:'Supercar',era:'2010s',name:'McLaren M840T twin-turbo V8 (720S)',real:{hp:710,hpRpm:7500,tq:770,tqRpm:5500},unsure:['boost_bar','turboSize'],
   engine:{cylinders:8,layout:'v',bore_mm:93.0,stroke_mm:73.5,compression:8.7,redline:8100,intake:'turbo',boost_bar:1.1,turboSize:'medium',turboConfig:'twin',intercooler:'large',cam:'sport',vvt:true,valveSpring:'race',injector:'port',octane:98,exhaust:'sport',airFilter:'perf',runner:'short',oilCooler:true,radiator:'large',taperRpm:5500,taperPct:80}},
  {cat:'Supercar',era:'2010s',name:'Ferrari F140 V12 (812 Superfast)',real:{hp:789,hpRpm:8500,tq:718,tqRpm:7000},unsure:['silencer'],
   engine:{cylinders:12,layout:'v',bore_mm:94.0,stroke_mm:78.0,compression:13.6,redline:8900,cam:'race',vvt:true,valveSpring:'race',valveMat:'titanium',injector:'direct',octane:98,exhaust:'race',silencer:'absorptive',airFilter:'perf',runner:'variable'}},
  // the 992's turbines are variable-geometry; the model's VGT is the diesel's, so it runs a plain twin here
  {cat:'Supercar',era:'2020s',name:'Porsche 3.7 twin-turbo flat-six (911 Turbo S 992)',real:{hp:641,hpRpm:6750,tq:800,tqRpm:2500},unsure:['boost_bar','turboSize'],
   engine:{cylinders:6,layout:'boxer',bore_mm:102.0,stroke_mm:76.4,compression:8.7,redline:7200,intake:'turbo',boost_bar:1.3,turboSize:'medium',turboConfig:'twin',intercooler:'large',cam:'sport',vvt:true,valveSpring:'perf',injector:'direct',octane:98,exhaust:'sport',airFilter:'perf',runner:'short',oilCooler:true,radiator:'large',taperRpm:4000,taperPct:72}},
  {cat:'Supercar',era:'2020s',name:'Lamborghini 5.2 V10 (Huracán STO)',real:{hp:631,hpRpm:8000,tq:565,tqRpm:6500},unsure:['silencer'],
   engine:{cylinders:10,layout:'v',bore_mm:84.5,stroke_mm:92.8,compression:12.7,redline:8500,valveMat:'titanium',cam:'race',vvt:true,valveSpring:'race',injector:'direct',octane:98,exhaust:'race',silencer:'absorptive',airFilter:'perf',runner:'variable'}},
  {cat:'Supercar',era:'2020s',name:'GM LT6 flat-plane V8 (Corvette Z06 C8)',real:{hp:670,hpRpm:8400,tq:623,tqRpm:6300},unsure:['silencer'],
   engine:{cylinders:8,layout:'v',bore_mm:104.25,stroke_mm:80.0,compression:12.5,redline:8600,valveMat:'titanium',cam:'race',vvt:true,valveSpring:'race',injector:'direct',octane:98,exhaust:'race',silencer:'absorptive',airFilter:'perf',runner:'variable',oilCooler:true,radiator:'large'}},
  {cat:'Supercar',era:'2020s',name:'McLaren M840T twin-turbo V8 (750S)',real:{hp:740,hpRpm:7500,tq:800,tqRpm:5500},unsure:['boost_bar','turboSize','compression'],
   engine:{cylinders:8,layout:'v',bore_mm:93.0,stroke_mm:73.5,compression:8.7,redline:8100,intake:'turbo',boost_bar:1.2,turboSize:'medium',turboConfig:'twin',intercooler:'large',cam:'sport',vvt:true,valveSpring:'race',injector:'port',octane:98,exhaust:'sport',airFilter:'perf',runner:'short',oilCooler:true,radiator:'large',taperRpm:5500,taperPct:80}},
  // Rotary: both on the 13B rotor (e 15, R 105, W 80: 654 cc a rotor). The FD is quoted at its 1993 US
  // rating, not the later JDM 280 PS, which is the gentlemen's-agreement figure.
  {cat:'Rotary',name:'Mazda 13B-REW (RX-7 FD)',real:{hp:255,hpRpm:6500,tq:294,tqRpm:5000},unsure:['boost_bar'],
   engine:{type:'rotary',cylinders:2,bore_mm:105,stroke_mm:80,ecc_mm:15,compression:9.0,redline:8000,intake:'turbo',boost_bar:0.7,turboSize:'small',turboConfig:'sequential',injector:'port',octane:98,intercooler:'small',exhaust:'stock',airFilter:'stock',radiator:'large',oilCooler:true}},
  {cat:'Rotary',name:'Mazda 13B-MSP Renesis (RX-8)',real:{hp:232,hpRpm:8200,tq:211,tqRpm:5500},
   engine:{type:'rotary',cylinders:2,bore_mm:105,stroke_mm:80,ecc_mm:15,compression:10.0,redline:9000,injector:'port',octane:98,exhaust:'stock',airFilter:'stock',radiator:'large',oilCooler:true}},
  {cat:'Diesel',name:'VW EA288 2.0 TDI (Golf 150)',real:{hp:148,hpRpm:3500,tq:320,tqRpm:1750},unsure:['runner'],
   engine:{valvetrain:'dohc-roller',type:'diesel',vvt:false,cylinders:4,bore_mm:81.0,stroke_mm:95.5,compression:16.2,redline:4800,intake:'turbo',boost_bar:1.3,turboSize:'small',vgt:true,injector:'direct',intercooler:'large',exhaust:'stock',airFilter:'stock',runner:'short',taperRpm:2000,taperPct:44,tqLimit:320,govRpm:4000}},
  {cat:'Diesel',name:'BMW N57 3.0d (330d F30)',real:{hp:254,hpRpm:4000,tq:560,tqRpm:2000},unsure:['boost_bar','runner'],
   engine:{valvetrain:'dohc-roller',type:'diesel',vvt:false,cylinders:6,bore_mm:84.0,stroke_mm:90.0,compression:16.5,redline:5000,intake:'turbo',boost_bar:1.5,turboSize:'medium',vgt:true,injector:'direct',intercooler:'large',exhaust:'stock',airFilter:'stock',runner:'short',taperRpm:2000,taperPct:54,tqLimit:560,govRpm:4000}},
  // GM: rated 2800 rpm, maximum powered speed 3450 (the governed maximum; it was 3800 here, unsure)
  {cat:'Diesel',name:'GM Duramax L5P 6.6 (Silverado HD)',real:{hp:445,hpRpm:2800,tq:1234,tqRpm:1600},unsure:['boost_bar','runner'],
   engine:{valvetrain:'ohv-roller',type:'diesel',vvt:false,cylinders:8,layout:'v',bore_mm:103.0,stroke_mm:99.0,compression:16.0,redline:3450,intake:'turbo',boost_bar:1.9,turboSize:'large',vgt:true,injector:'direct',intercooler:'large',exhaust:'stock',airFilter:'stock',runner:'short',taperRpm:2000,taperPct:51,govRpm:2800}},
  {cat:'Diesel',name:'Cummins 6.7 (Ram HD 2019 HO)',real:{hp:400,hpRpm:2800,tq:1356,tqRpm:1800},unsure:['redline','runner'],   // compression and boost: the 2019 Stellantis press kit (build 199)
   engine:{valvetrain:'ohv-roller',type:'diesel',vvt:false,cylinders:6,bore_mm:107.0,stroke_mm:124.0,compression:16.2,redline:3500,intake:'turbo',boost_bar:2.28,turboSize:'large',vgt:true,injector:'direct',intercooler:'large',exhaust:'stock',airFilter:'stock',runner:'short',govRpm:2800,taperRpm:2000,taperPct:38}},
  {cat:'Two-Stroke',name:'Yamaha RD350LC (2-stroke twin)',real:{hp:46,hpRpm:8500,tq:40,tqRpm:8000},unsure:['silencer','compression','redline'],
   engine:{type:'twostroke',cylinders:2,bore_mm:64.0,stroke_mm:54.0,compression:7,redline:9500,intakeSys:'carb2',octane:95,exhaust:'race',silencer:'absorptive',airFilter:'stock'}},  // Batch 1 (build 199): the engines of the 50 cars researched in research/vehicles-batch-1 (README there), each by its
  // maker's figures with what is estimated in unsure. real.gross marks a 1960s SAE gross rating, which no net model meets.
  {cat:'Performance SUV',name:'BMW S63B44 4.4 TT V8 (X5 M F85)',real:{hp:575,hpRpm:6000,tq:750,tqRpm:2200},unsure:['boost_bar','redline','turboSize'],engine:{valvetrain:'dohc-roller',cylinders:8,layout:'v',bore_mm:89,stroke_mm:88.3,compression:10,redline:7200,intake:'turbo',boost_bar:1.2,turboSize:'medium',turboConfig:'twin',intercooler:'large',injector:'direct',vvt:true,cam:'sport',exhaust:'sport',airFilter:'perf',octane:98,radiator:'large',oilCooler:true,tqLimit:750,taperRpm:2500,taperPct:32}},
  {cat:'Performance SUV',name:'Porsche 4.8 TT V8 (Cayenne Turbo 958)',real:{hp:520,hpRpm:6000,tq:750,tqRpm:2250},unsure:['boost_bar','turboSize'],engine:{cylinders:8,layout:'v',bore_mm:96,stroke_mm:83,compression:10.5,redline:6700,intake:'turbo',boost_bar:0.9,turboSize:'medium',turboConfig:'twin',intercooler:'large',injector:'direct',vvt:true,cam:'sport',exhaust:'sport',airFilter:'stock',octane:98,radiator:'large',oilCooler:true,tqLimit:750,taperRpm:2500,taperPct:26}},
  {cat:'Performance SUV',name:'Lamborghini 4.0 TT V8 (Urus)',real:{hp:650,hpRpm:6000,tq:850,tqRpm:2250},unsure:['boost_bar','compression','turboSize'],engine:{cylinders:8,layout:'v',bore_mm:86,stroke_mm:86,compression:9.7,redline:6800,intake:'turbo',boost_bar:1.3,turboSize:'medium',turboConfig:'twin',intercooler:'large',injector:'direct',vvt:true,cam:'sport',exhaust:'sport',airFilter:'perf',octane:98,radiator:'large',oilCooler:true,tqLimit:850,taperRpm:2500,taperPct:65}},
  {cat:'Performance SUV',name:'Chrysler 6.4 Hemi (Grand Cherokee SRT)',real:{hp:470,hpRpm:6000,tq:630,tqRpm:4300},unsure:['stroke_mm'],engine:{valvetrain:'ohv-roller',cylinders:8,layout:'v',valves:2,bore_mm:103.9,stroke_mm:94.6,compression:10.9,redline:6400,vvt:true,cam:'sport',injector:'port',octane:91,exhaust:'sport',airFilter:'perf',radiator:'large',oilCooler:true}},
  {cat:'Diesel',name:'Toyota 1VD-FTV 4.5 V8 diesel (Land Cruiser 200)',real:{hp:272,hpRpm:3600,tq:650,tqRpm:1600},unsure:['boost_bar','redline','vgt'],engine:{type:'diesel',vvt:false,cylinders:8,layout:'v',bore_mm:86,stroke_mm:96,compression:16.8,redline:4500,govRpm:3600,intake:'turbo',boost_bar:1.4,turboSize:'medium',turboConfig:'twin',vgt:true,injector:'direct',intercooler:'large',exhaust:'stock',airFilter:'stock',radiator:'large',oilCooler:true,taperRpm:1600,taperPct:20}},
  {cat:'Track',name:'Radical RPE 1500 Suzuki-based I4 (SR3 RSX)',real:{hp:210,hpRpm:10000,tq:179,tqRpm:7000},unsure:['silencer','bore_mm','stroke_mm','compression','redline','hp','hpRpm','tq','tqRpm'],engine:{cylinders:4,bore_mm:81,stroke_mm:72.8,compression:12.5,redline:10500,intakeSys:'itb',airFilter:'none',cam:'race',vvt:false,valveSpring:'race',valveMat:'titanium',injector:'port',exhaust:'race',silencer:'absorptive',cat:'none',octane:98,radiator:'large',oilCooler:true}},
  {cat:'Track',name:'Ford Duratec 2.3 Cosworth (BAC Mono)',real:{hp:280,hpRpm:7700,tq:280,tqRpm:6000},unsure:['silencer','compression','redline','hpRpm','tq','tqRpm','intakeSys'],engine:{cylinders:4,bore_mm:87.5,stroke_mm:94,compression:12,redline:8000,intakeSys:'itb',airFilter:'none',cam:'race',vvt:false,valveSpring:'race',injector:'port',exhaust:'race',silencer:'absorptive',cat:'none',octane:98,radiator:'large',oilCooler:true}},
  {cat:'NA Sports',name:'Nissan VQ37VHR (370Z)',real:{hp:332,hpRpm:7000,tq:366,tqRpm:5200},engine:{cylinders:6,layout:'v',bore_mm:95.5,stroke_mm:86,compression:11,redline:7500,cam:'sport',vvt:true,injector:'port',octane:98,exhaust:'sport',airFilter:'perf',runner:'variable'}},
  {cat:'Supercar',era:'1990s',name:'Honda C30A V6 (NSX NA1)',real:{hp:280,hpRpm:7300,tq:294,tqRpm:5400},engine:{valvetrain:'dohc-finger',cylinders:6,layout:'v',bore_mm:90,stroke_mm:78,compression:10.2,redline:8000,cam:'race',vvt:true,valveSpring:'perf',injector:'port',octane:98,exhaust:'sport',airFilter:'perf',runner:'variable',radiator:'large',oilCooler:true}},
  {cat:'Pickup',name:'Ford 3.5 EcoBoost HO V6 (F-150 Raptor 2017)',real:{hp:450,hpRpm:5000,tq:691,tqRpm:3500},unsure:['boost_bar','hpRpm','tqRpm','bore_mm'],engine:{valvetrain:'dohc-roller',cylinders:6,layout:'v',bore_mm:92.5,stroke_mm:86.7,compression:10.5,redline:6500,intake:'turbo',boost_bar:1.3,turboSize:'medium',turboConfig:'twin',intercooler:'large',injector:'direct',vvt:true,cam:'stock',exhaust:'sport',airFilter:'stock',octane:91,radiator:'large',oilCooler:true,taperRpm:3500,taperPct:39}},
  {cat:'Turbo Performance',name:'Nissan VR38DETT (GT-R R35 2017)',real:{hp:565,hpRpm:6800,tq:633,tqRpm:3300},unsure:['boost_bar','turboSize'],engine:{cylinders:6,layout:'v',bore_mm:95.5,stroke_mm:88.4,compression:9,redline:7100,intake:'turbo',boost_bar:0.9,turboSize:'medium',turboConfig:'twin',intercooler:'large',injector:'port',vvt:true,cam:'sport',exhaust:'sport',airFilter:'perf',octane:98,radiator:'large',oilCooler:true,tqLimit:633,taperRpm:3500,taperPct:73}},
  {cat:'Turbo Performance',name:'Alfa Romeo 690T 2.9 V6 (Giulia Quadrifoglio)',real:{hp:510,hpRpm:6500,tq:600,tqRpm:2500},unsure:['boost_bar','turboSize'],engine:{cylinders:6,layout:'v',bore_mm:86.5,stroke_mm:82,compression:9.3,redline:7200,intake:'turbo',boost_bar:1.4,turboSize:'medium',turboConfig:'twin',intercooler:'large',injector:'direct',vvt:true,cam:'sport',exhaust:'sport',airFilter:'perf',octane:98,radiator:'large',oilCooler:true,tqLimit:600,taperRpm:2500,taperPct:64}},
  {cat:'Turbo Performance',name:'Nissan VG30DETT (300ZX Z32)',real:{hp:283,hpRpm:6400,tq:375,tqRpm:3600},unsure:['boost_bar'],engine:{cylinders:6,layout:'v',bore_mm:87,stroke_mm:83,compression:8.5,redline:7000,intake:'turbo',boost_bar:0.5,turboSize:'small',turboConfig:'twin',intercooler:'large',injector:'port',vvt:true,cam:'sport',exhaust:'sport',airFilter:'perf',octane:98,radiator:'large',oilCooler:true,taperRpm:4000,taperPct:20}},
  {cat:'Turbo Performance',name:'Buick LC2 turbo V6 (GNX)',real:{hp:276,hpRpm:4400,tq:488,tqRpm:3000},unsure:['valvetrain','redline'],engine:{valvetrain:'ohv-roller',cylinders:6,layout:'v',valves:2,bore_mm:96.5,stroke_mm:86.4,compression:8,redline:5000,intake:'turbo',boost_bar:1.03,turboSize:'medium',intercooler:'large',vvt:false,cam:'stock',injector:'port',octane:91,exhaust:'sport',airFilter:'perf',radiator:'large',oilCooler:true,taperRpm:3000,taperPct:20}},
  {cat:'Supercar',era:'1960s',name:'Ferrari Dino 135 CS 2.4 V6 (246 GT)',real:{hp:195,hpRpm:7600,tq:226,tqRpm:5500},unsure:['tq','tqRpm'],engine:{valvetrain:'dohc-bucket',cylinders:6,layout:'v',valves:2,bore_mm:92.5,stroke_mm:60,compression:9,redline:7800,intakeSys:'sidedraft',vvt:false,cam:'sport',injector:'port',octane:98,exhaust:'sport',airFilter:'perf',ignitionType:'coil'}},
  {cat:'Supercar',era:'1980s',name:'Ferrari F120A V8 TT (F40)',real:{hp:478,hpRpm:7000,tq:577,tqRpm:4000},unsure:['silencer','boost_bar','redline','turboSize'],engine:{cylinders:8,layout:'v',bore_mm:82,stroke_mm:69.5,compression:7.7,redline:7700,intake:'turbo',boost_bar:1.1,turboSize:'medium',turboConfig:'twin',intercooler:'large',injector:'port',intakeSys:'efi',vvt:false,cam:'race',valveSpring:'race',exhaust:'race',silencer:'absorptive',cat:'none',airFilter:'perf',octane:98,radiator:'large',oilCooler:true,taperRpm:4000,taperPct:46}},
  {cat:'NA Sports',name:'Jaguar XK 3.8 I6 (E-Type S1)',real:{hp:265,hpRpm:5500,tq:353,tqRpm:4000,gross:true},unsure:['hp','tq'],engine:{valvetrain:'dohc-bucket',cylinders:6,bore_mm:87,stroke_mm:106,compression:9,redline:5500,intakeSys:'sidedraft',vvt:false,valves:2,cam:'stock',injector:'port',octane:98,exhaust:'stock',airFilter:'stock'}},
  {cat:'American V8',name:'Ford Windsor 289 4-bbl (Mustang 1965)',real:{hp:225,hpRpm:4800,tq:414,tqRpm:3200,gross:true},unsure:['hp','tq'],engine:{valvetrain:'ohv',cylinders:8,layout:'v',valves:2,bore_mm:101.6,stroke_mm:72.9,compression:10,redline:5500,intakeSys:'carb4',vvt:false,cam:'stock',injector:'port',octane:95,exhaust:'stock',airFilter:'stock'}},
  {cat:'NA Sports',name:'Porsche 911/83 2.7 flat-six (Carrera RS)',real:{hp:210,hpRpm:6300,tq:255,tqRpm:5100},engine:{valvetrain:'sohc-rocker',cylinders:6,layout:'boxer',valves:2,bore_mm:90,stroke_mm:70.4,compression:8.5,redline:7300,intakeSys:'mech',vvt:false,cam:'sport',injector:'port',octane:98,exhaust:'sport',airFilter:'perf'}},
  // The 1986 launch car (build 242, owner's check): 147 kW / 200 PS (197.3 hp) at 6750 rpm and 240 Nm at 4750, without a
  // catalyst. The catalyst came to Germany in 1987 and cut it to 143 kW / 195 PS and 230 Nm (BMW Group Classic, "BMW M3
  // E30"; ADAC, "M3 Kat. 09/86-05/89"). The stock intake cam is about 246 deg with 10.7 mm lift (S14 cam listings that
  // compare Schrick's 276 and 284 deg race cams with it), nearest this model's SPORT grade (252 deg), not RACE (284 deg,
  // which is Schrick's competition cam). The road car breathes through BMW's airbox and paper element: STOCK, probable.
  // Until build 242 it carried the RACE cam, the default STOCK catalyst, a PERFORMANCE filter and 200 "hp".
  {cat:'NA Sports',name:'BMW S14B23 (M3 E30)',real:{hp:197.3,hpRpm:6750,tq:240,tqRpm:4750},unsure:['redline','airFilter','runner','valveSpring'],engine:{cylinders:4,bore_mm:93.4,stroke_mm:84,compression:10.5,redline:7250,intakeSys:'itb',cam:'sport',vvt:false,valveSpring:'perf',injector:'port',octane:98,exhaust:'sport',cat:'none',airFilter:'stock',runner:'short',radiator:'large',oilCooler:true}},
  {cat:'NA Sports',name:'VW EA827 1.6 K-Jetronic (Golf GTI Mk1)',real:{hp:110,hpRpm:6100,tq:140,tqRpm:5000},unsure:['redline'],engine:{valvetrain:'sohc-bucket',cylinders:4,valves:2,bore_mm:79.5,stroke_mm:80,compression:9.5,redline:6500,intakeSys:'mech',vvt:false,cam:'stock',injector:'port',octane:98,exhaust:'stock',airFilter:'stock'}},
  {cat:'Supercar',era:'1960s',name:'Ferrari Colombo 4.4 V12 (365 GTB/4)',real:{hp:352,hpRpm:7500,tq:431,tqRpm:5500},engine:{valvetrain:'dohc-bucket',cylinders:12,layout:'v',valves:2,bore_mm:81,stroke_mm:71,compression:8.8,redline:7700,intakeSys:'sidedraft',vvt:false,cam:'sport',injector:'port',octane:98,exhaust:'sport',airFilter:'perf'}},
  {cat:'Supercar',era:'1970s',name:'Lamborghini 3.9 V12 (Countach LP400)',real:{hp:375,hpRpm:8000,tq:361,tqRpm:5000},unsure:['compression','tq','tqRpm','bore_mm','stroke_mm'],engine:{valvetrain:'dohc-bucket',cylinders:12,layout:'v',valves:2,bore_mm:82,stroke_mm:62,compression:10.5,redline:8000,intakeSys:'sidedraft',vvt:false,cam:'sport',injector:'port',octane:98,exhaust:'sport',airFilter:'perf'}},
  {cat:'Turbo Performance',name:'Audi 2.1 20V turbo I5 (Sport quattro)',real:{hp:306,hpRpm:6700,tq:350,tqRpm:3700},unsure:['compression','boost_bar','bore_mm','stroke_mm'],engine:{cylinders:5,bore_mm:79.3,stroke_mm:86.4,compression:8,redline:7200,intake:'turbo',boost_bar:1,turboSize:'medium',intercooler:'large',vvt:false,cam:'sport',injector:'port',octane:98,exhaust:'sport',airFilter:'perf',radiator:'large',oilCooler:true,taperRpm:4000,taperPct:70}},
  {cat:'NA Sports',name:'Mercedes M102 2.3-16 (190E)',real:{hp:185,hpRpm:6200,tq:235,tqRpm:4500},unsure:['compression','bore_mm','stroke_mm'],engine:{cylinders:4,bore_mm:95.5,stroke_mm:80.25,compression:10.5,redline:7000,intakeSys:'mech',vvt:false,cam:'sport',injector:'port',octane:98,exhaust:'sport',airFilter:'perf',radiator:'large'}},
  {cat:'NA Sports',name:'Peugeot XU9JA 1.9 (205 GTI)',real:{hp:130,hpRpm:6000,tq:161,tqRpm:4750},unsure:['compression','bore_mm','stroke_mm'],engine:{valvetrain:'sohc-bucket',cylinders:4,valves:2,bore_mm:83,stroke_mm:88,compression:9.6,redline:6500,vvt:false,cam:'sport',injector:'port',octane:98,exhaust:'sport',airFilter:'perf'}},
  {cat:'Turbo Performance',name:'Ford Cosworth YBB 2.0 turbo (Sierra RS)',real:{hp:204,hpRpm:6000,tq:276,tqRpm:4500},engine:{cylinders:4,bore_mm:90.8,stroke_mm:76.95,compression:8,redline:6500,intake:'turbo',boost_bar:0.7,turboSize:'medium',intercooler:'large',vvt:false,cam:'sport',injector:'port',octane:98,exhaust:'sport',airFilter:'perf',radiator:'large',oilCooler:true,taperRpm:4500,taperPct:30}},
  {cat:'Turbo Performance',name:'Lancia 831 2.0 16V turbo (Delta Integrale Evo)',real:{hp:210,hpRpm:5750,tq:298,tqRpm:3500},unsure:['boost_bar','hpRpm','tq','tqRpm','compression'],engine:{cylinders:4,bore_mm:84,stroke_mm:90,compression:8,redline:6500,intake:'turbo',boost_bar:1,turboSize:'small',intercooler:'large',vvt:false,cam:'sport',injector:'port',octane:98,exhaust:'sport',airFilter:'perf',radiator:'large',oilCooler:true,taperRpm:3500,taperPct:47}},
  {cat:'NA Sports',name:'Honda B18C spec R (Integra Type R DC2)',real:{hp:200,hpRpm:8000,tq:181,tqRpm:7500},unsure:['silencer','compression'],engine:{valvetrain:'dohc-finger',cylinders:4,bore_mm:81,stroke_mm:87.2,compression:11.1,redline:8400,cam:'race',vvt:true,valveSpring:'race',injector:'port',octane:98,exhaust:'race',silencer:'absorptive',airFilter:'perf',runner:'short',radiator:'large'}},
  {cat:'NA Sports',name:'Rover K-series 1.8 (Elise S1)',real:{hp:118,hpRpm:5500,tq:165,tqRpm:3000},unsure:['compression','bore_mm','stroke_mm'],engine:{cylinders:4,bore_mm:80,stroke_mm:89.3,compression:10.5,redline:7000,vvt:false,cam:'stock',injector:'port',octane:95,exhaust:'sport',airFilter:'perf'}},
  {cat:'NA Sports',name:'BMW S62 4.9 V8 (M5 E39)',real:{hp:400,hpRpm:6600,tq:500,tqRpm:3800},engine:{cylinders:8,layout:'v',bore_mm:94,stroke_mm:89,compression:11,redline:7000,intakeSys:'itb',cam:'race',vvt:true,valveSpring:'perf',injector:'port',octane:98,exhaust:'sport',airFilter:'perf',runner:'short',radiator:'large',oilCooler:true}},
  {cat:'Two-Stroke',name:'Trabant P65 0.6 2-stroke twin (601)',real:{hp:26,hpRpm:4200,tq:54,tqRpm:3000},unsure:['redline','compression'],engine:{type:'twostroke',cylinders:2,bore_mm:72,stroke_mm:73,compression:7.5,redline:4500,intakeSys:'carb1',vvt:false,airFilter:'stock',exhaust:'stock',cat:'none',octane:88,injector:'port',ignitionType:'coil',radiator:'stock'}},
  {cat:'Kei & City',name:'Honda S07A turbo (S660)',real:{hp:64,hpRpm:6000,tq:104,tqRpm:2600},unsure:['boost_bar','redline'],engine:{cylinders:3,bore_mm:64,stroke_mm:68.2,compression:9.2,redline:7700,intake:'turbo',boost_bar:0.9,turboSize:'small',intercooler:'small',injector:'port',vvt:true,cam:'stock',exhaust:'stock',airFilter:'stock',octane:95,taperRpm:2600,taperPct:20}},
  {cat:'Kei & City',name:'Honda E07A MTREC (Beat)',real:{hp:64,hpRpm:8100,tq:60,tqRpm:7000},unsure:['redline'],engine:{valvetrain:'sohc-rocker',cylinders:3,bore_mm:66,stroke_mm:64,compression:10,redline:8500,intakeSys:'itb',cam:'sport',vvt:false,injector:'port',octane:95,exhaust:'sport',airFilter:'perf',runner:'short'}},
  {cat:'Kei & City',name:'Suzuki F6A turbo (Cappuccino EA11R)',real:{hp:64,hpRpm:6500,tq:85,tqRpm:4000},unsure:['boost_bar','redline'],engine:{cylinders:3,bore_mm:65,stroke_mm:66,compression:8.3,redline:7500,intake:'turbo',boost_bar:0.7,turboSize:'small',intercooler:'small',injector:'port',vvt:false,cam:'stock',exhaust:'stock',airFilter:'stock',octane:95,taperRpm:4000,taperPct:20}},
  {cat:'Compact Turbo',name:'Ford 2.3 EcoBoost (Focus RS Mk3)',real:{hp:350,hpRpm:6000,tq:440,tqRpm:2000},unsure:['boost_bar'],engine:{valvetrain:'dohc-roller',cylinders:4,bore_mm:87.6,stroke_mm:94,compression:9.4,redline:6800,intake:'turbo',boost_bar:1.4,turboSize:'medium',intercooler:'large',injector:'direct',vvt:true,cam:'sport',exhaust:'sport',airFilter:'perf',octane:98,radiator:'large',oilCooler:true,tqLimit:440,taperRpm:2000,taperPct:61}},
  {cat:'Compact Turbo',name:'Renault M5Pt 1.8 turbo (Mégane R.S. Trophy)',real:{hp:300,hpRpm:6000,tq:420,tqRpm:3200},unsure:['boost_bar','redline','tqRpm'],engine:{cylinders:4,bore_mm:79.7,stroke_mm:90.1,compression:9,redline:6800,intake:'turbo',boost_bar:1.3,turboSize:'medium',intercooler:'large',injector:'direct',vvt:true,cam:'sport',exhaust:'sport',airFilter:'perf',octane:98,radiator:'large',oilCooler:true,taperRpm:3500,taperPct:74}},
  {cat:'Compact Turbo',name:'Suzuki K14C Boosterjet (Swift Sport ZC33S)',real:{hp:140,hpRpm:5500,tq:230,tqRpm:2500},unsure:['boost_bar','compression','bore_mm','stroke_mm','redline'],engine:{cylinders:4,bore_mm:73,stroke_mm:81.9,compression:9.9,redline:6200,intake:'turbo',boost_bar:1,turboSize:'small',intercooler:'small',injector:'direct',vvt:true,cam:'stock',exhaust:'sport',airFilter:'stock',octane:95,tqLimit:230,taperRpm:2500,taperPct:39}},
  {cat:'NA Sports',name:'Honda B16B (Civic Type R EK9)',real:{hp:185,hpRpm:8200,tq:160,tqRpm:7500},unsure:['silencer','compression'],engine:{valvetrain:'dohc-finger',cylinders:4,bore_mm:81,stroke_mm:77.4,compression:10.8,redline:8400,cam:'race',vvt:true,valveSpring:'race',injector:'port',octane:98,exhaust:'race',silencer:'absorptive',airFilter:'perf',runner:'short'}},
  {cat:'NA Sports',name:'Toyota FA24D 2.4 boxer (GR86)',real:{hp:235,hpRpm:7000,tq:250,tqRpm:3700},unsure:['redline'],engine:{valvetrain:'dohc-roller',cylinders:4,layout:'boxer',bore_mm:94,stroke_mm:86,compression:12.5,redline:7500,cam:'sport',vvt:true,injector:'direct',octane:98,exhaust:'sport',airFilter:'perf',radiator:'large'}},
  {cat:'NA Sports',name:'Porsche 4.0 flat-six (718 Cayman GT4)',real:{hp:420,hpRpm:7600,tq:420,tqRpm:5000},unsure:['silencer','compression','bore_mm','stroke_mm'],engine:{cylinders:6,layout:'boxer',bore_mm:102,stroke_mm:81.5,compression:13,redline:8000,cam:'race',vvt:true,valveSpring:'race',injector:'direct',octane:98,exhaust:'race',silencer:'absorptive',airFilter:'perf',runner:'variable',radiator:'large',oilCooler:true}},
  {cat:'Turbo Performance',name:'BMW S55 3.0 TT I6 (M2 Competition)',real:{hp:410,hpRpm:5250,tq:550,tqRpm:2350},unsure:['boost_bar','compression','redline'],engine:{valvetrain:'dohc-roller',cylinders:6,bore_mm:84,stroke_mm:89.6,compression:10.2,redline:7600,intake:'turbo',boost_bar:1.2,turboSize:'medium',turboConfig:'twin',intercooler:'large',injector:'direct',vvt:true,cam:'sport',exhaust:'sport',airFilter:'perf',octane:98,radiator:'large',oilCooler:true,tqLimit:550,taperRpm:2500,taperPct:31}},
  {cat:'NA Sports',name:'Honda K20A tuned (Ariel Atom 3.5)',real:{hp:245,hpRpm:8200,tq:209,tqRpm:6100},unsure:['silencer','valvetrain','compression','tq','tqRpm'],engine:{valvetrain:'dohc-finger',cylinders:4,bore_mm:86,stroke_mm:86,compression:11.5,redline:8600,cam:'race',vvt:true,valveSpring:'race',injector:'port',octane:98,exhaust:'race',silencer:'absorptive',airFilter:'perf',runner:'short',radiator:'large',oilCooler:true}},
  {cat:'NA Sports',name:'Mazda Skyactiv-G 2.0 (MX-5 ND)',real:{hp:160,hpRpm:6000,tq:200,tqRpm:4600},unsure:['bore_mm','stroke_mm'],engine:{cylinders:4,bore_mm:83.5,stroke_mm:91.2,compression:13,redline:6800,cam:'stock',vvt:true,injector:'direct',octane:95,exhaust:'sport',airFilter:'stock'}},
  {cat:'Supercar',era:'2000s',name:'Dodge Viper 8.4 V10 (SRT-10)',real:{hp:600,hpRpm:6100,tq:760,tqRpm:5000},unsure:['silencer','bore_mm','stroke_mm','compression'],engine:{valvetrain:'ohv-roller',cylinders:10,layout:'v',valves:2,bore_mm:103,stroke_mm:100.6,compression:10.2,redline:6400,vvt:false,cam:'race',valveSpring:'perf',injector:'port',octane:91,exhaust:'race',silencer:'absorptive',airFilter:'perf',radiator:'large',oilCooler:true}},
  {cat:'NA Sports',name:'Mercedes-AMG M156 6.2 V8 (C63 W204)',real:{hp:457,hpRpm:6800,tq:600,tqRpm:5000},unsure:['bore_mm','stroke_mm','compression'],engine:{cylinders:8,layout:'v',bore_mm:102.2,stroke_mm:94.6,compression:11.3,redline:7200,cam:'sport',vvt:true,valveSpring:'perf',injector:'port',octane:98,exhaust:'sport',airFilter:'perf',radiator:'large',oilCooler:true}},
  {cat:'Diesel',name:'Toyota 1GD-FTV 2.8 diesel (Hilux)',real:{hp:177,hpRpm:3400,tq:450,tqRpm:1600},unsure:['boost_bar','redline'],engine:{type:'diesel',vvt:false,cylinders:4,bore_mm:92,stroke_mm:103.6,compression:15.6,redline:4500,govRpm:3400,intake:'turbo',boost_bar:1.4,turboSize:'small',vgt:true,injector:'direct',intercooler:'large',exhaust:'stock',airFilter:'stock',radiator:'large',oilCooler:true,tqLimit:450,taperRpm:1600,taperPct:23}},
  {cat:'Diesel',name:'VW 3.0 V6 TDI (Amarok)',real:{hp:224,hpRpm:3000,tq:550,tqRpm:1400},unsure:['boost_bar','compression','bore_mm','stroke_mm','redline','hpRpm'],engine:{type:'diesel',vvt:false,cylinders:6,layout:'v',bore_mm:83,stroke_mm:91.4,compression:16,redline:5000,govRpm:3000,intake:'turbo',boost_bar:1.5,turboSize:'medium',vgt:true,injector:'direct',intercooler:'large',exhaust:'stock',airFilter:'stock',radiator:'large',oilCooler:true,tqLimit:550,taperRpm:1500,taperPct:67}},
  {cat:'American V8',name:'GM LT4 6.2 supercharged (Camaro ZL1)',real:{hp:650,hpRpm:6400,tq:881,tqRpm:3600},unsure:['boost_bar','compression'],engine:{valvetrain:'ohv-roller',cylinders:8,layout:'v',valves:2,bore_mm:103.25,stroke_mm:92,compression:10,redline:6600,intake:'supercharger',boost_bar:0.65,scType:'roots',intercooler:'large',vvt:true,cam:'sport',injector:'direct',octane:91,exhaust:'sport',airFilter:'perf',radiator:'large',oilCooler:true,taperRpm:4000,taperPct:27}},
];
// A real engine's own valve head diameters, mm (build 287), in place of the packing rule (VALVE_PACK) and of 0.83 of
// the intake for the exhaust (EV_RATIO). Each with its source; a size known only from aftermarket "standard size"
// replacement valves is marked (std): the replacement is made to the maker's head, but it is not the maker's sheet.
// An engine not listed here still takes the rule. Adding an engine moves that engine's numbers only.
const ENGINE_VALVES={
  'BMW S54 (M3 E46)':{iv:35,ev:30.5,src:'BMW ST041 M3 training manual, driveline: valves 35 / 30.5 mm'},
  'Honda F20C (S2000 AP1)':{iv:36,ev:31,src:'s2000.club F20C engine paper: 36 / 31 mm; Ferrea stock-size listings (std)'},
  'Toyota 2JZ-GTE (Supra A80)':{iv:33.5,ev:29,src:'Manley, Brian Crower and GSC stock-size valves: 33.5 / 29 mm (std)'},
  'Mitsubishi 4G63T (Lancer Evo IX)':{iv:34,ev:30.5,src:'Ferrea, Brian Crower and GSC stock-size valves: 34 / 30.5 mm (std)'},
  'Subaru EJ257 (Impreza WRX STI)':{iv:36,ev:32,src:'Brian Crower and GSC stock-size valves: 36 / 32 mm (std)'},
  // Build 330 (phase B, step 2): five more, the same way.
  'Chrysler 6.4 Hemi (Grand Cherokee SRT)':{iv:54.36,ev:41.91,src:'Dodge Garage, Gen III HEMI quick reference guide part IV: 6.4 head 2.14 / 1.65 in'},
  'BMW S14B23 (M3 E30)':{iv:37,ev:32,src:'TRW OEM and SuperTech standard-size valves: 37 / 32 mm (std)'},
  'Honda B18C spec R (Integra Type R DC2)':{iv:33,ev:28,src:'Brian Crower and Ferrea stock-size valves, B16A/B18C incl. Integra Type R: 33 / 28 mm (std)'},
  'Nissan RB26DETT (Skyline GT-R R34)':{iv:34.6,ev:30.15,src:'Ferrea, Manley and GSC stock-size valves: 34.6 / 30.15 mm; Tomei +1 mm kit 35.65 / 31.15 (std)'},
  'Honda K20C1 (Civic Type R FK8)':{iv:35,ev:29,src:'Ferrea and Skunk2 stock-size valves: 35 / 29 mm (std)'},
  // Build 331 (owner's ruling): the LS7 takes its real valves although it lands 15.6% over its 505 hp; the gap is its
  // cam or intake, not the valves (named in the CHANGELOG).
  'GM LS7 (Corvette Z06 C6)':{iv:55.88,ev:40.89,src:'GM via Corvette Action Center, LS7 engine p.13: titanium intake 2.20 in, sodium exhaust 1.61 in'},
  // Build 427 (plans/v1-finish.md item 5): the three V8s held back for their cams ship their valves on the owner's rule.
  'GM LS3 (Corvette C6)':{iv:55.0,ev:40.4,src:'GM: LS3 intake 2.165 in, exhaust 1.590 in'},
  'Ford Coyote 5.0 (Mustang GT 2018)':{iv:37.7,ev:32,src:'Ford Performance, Coyote Technical Reference (Gen 3): 37.7 / 32 mm'},
  'GM LT4 6.2 supercharged (Camaro ZL1)':{iv:54.1,ev:40.39,src:'GM parts 12650770 / 12678746: intake 2.13 in, exhaust 1.59 in'},
  // Build 419 (plans/v1-finish.md, valves batch 1 of 4). unsure: true marks a size that is probable, not the maker's sheet.
  // Owner's rule (build 419): a sourced valve is used whichever way it moves the engine; none is held back for its result.
  'BMW S62 4.9 V8 (M5 E39)':{iv:35,ev:30.5,src:'BMW ST038 Z8 training manual, S62B50: valves 35 / 30.5 mm; BMW TIS E39 M5 the same'},
  'Dodge 6.2 Hellcat (Challenger SRT)':{iv:54.36,ev:41.91,src:'Dodge Garage, Gen III HEMI quick reference guide part III: 6.2 Hellcat 2.14 / 1.65 in'},
  'Dodge Viper 8.4 V10 (SRT-10)':{iv:52.8,ev:40.8,src:'Chrysler press kit, 8.4 V10: hollow-stem intake 52.8 mm, sodium-filled exhaust 40.8 mm'},
  'Ford 2.3 EcoBoost (Focus RS Mk3)':{iv:32.5,ev:30,src:'Ford Performance M-6049-20EBIP: 2.3 exhaust valve 30 mm; Ferrea and Supertech stock-size intake 32.5 mm (std)'},
  'Honda K20A tuned (Ariel Atom 3.5)':{iv:35,ev:30,src:'Ferrea 6000 stock-size valves, K20A2/A3/Z1 and JDM K20A Type R: 35 / 30 mm (std)'},
  'Honda B16B (Civic Type R EK9)':{iv:33,ev:28,unsure:true,src:'Honda, B16A engine page: 33 / 28 mm; Ferrea and Brian Crower stock-size B16A/B18C valves the same (std). The B16B is taken to share them'},
  'Honda C30A V6 (NSX NA1)':{iv:35,ev:30,src:'ScienceofSpeed NSX valve set: standard 3.0 intake 35 mm, exhaust 30 mm; Ferrea stock exhaust 30.05 mm (std)'},
  'Nissan VR38DETT (GT-R R35 2017)':{iv:37,ev:32.2,src:'Ferrea stock-size VR38DETT valves 37 / 32.2 mm; Supertech and Tomei +1 mm 38.15 / 33.15 (std)'},
  'Nissan VG30DETT (300ZX Z32)':{iv:34,ev:30,src:'Ferrea stock-size intake 34 mm; Tomei oversize set: exhaust 30.0 + 0.5 mm (std)'},
  'Nissan VQ37VHR (370Z)':{iv:36.6,ev:30.2,unsure:true,src:'ThinkTuning VQ37VHR guide: 36.6 / 30.2 mm; Supertech +1 mm 37.70 / 31.40 (std)'},
  'VW EA888 2.0 TSI (Golf GTI Mk7)':{iv:33.85,ev:28,unsure:true,src:'Ferrea EA888 Gen 3 stock exhaust 28 mm; intake from Supertech +1 mm 34.85 mm (std)'},
  'Mercedes-AMG M156 6.2 V8 (C63 W204)':{iv:40,ev:34,unsure:true,src:'australiancar.reviews and 8020 Automotive M156 guides: 40 / 34 mm, not a Mercedes sheet'},
  'Buick LC2 turbo V6 (GNX)':{iv:43.43,ev:38.1,unsure:true,src:'turbobuick.com owners: stock Grand National head 1.71 / 1.50 in'},
  'Peugeot XU9JA 1.9 (205 GTI)':{iv:41.6,ev:34.5,src:'FEBI and gt2i replacement valves, 205 GTI 1.9: 41.6 / 34.5 mm (std)'},
  'Mercedes M102 2.3-16 (190E)':{iv:38,ev:33,unsure:true,src:'RPM Depot M102 16V overhaul valves, 190E 2.3-16: 38 and 33 mm (std; which is which not stated)'},
  'Ford Windsor 289 4-bbl (Mustang 1965)':{iv:45.21,ev:36.83,src:'CarTech, Ford Small-Block General Data: every 289 head 1.780 / 1.450 in'},
  'Rover K-series 1.8 (Elise S1)':{iv:27.7,ev:24.1,src:'Land Rover Freelander workshop manual, K 1.8 general data: inlet 27.6-27.8, exhaust 24.0-24.2 mm'},
  // Build 425 (plans/v1-finish.md, valves batch 2 of 4), on the same rules.
  'GM LT6 flat-plane V8 (Corvette Z06 C8)':{iv:42,ev:35,src:'GM via The Drive and Corvsport, LT6 technical details: titanium intake 42 mm, sodium-filled exhaust 35 mm'},
  'Cummins 6.7 (Ram HD 2019 HO)':{iv:33,ev:33,src:'MAHLE 211-4670 exhaust (cross-ref. Cummins 4955210) 33.00 mm; stock-size 6.7 intake valves 1.299 in (std)'},
  'Ford 5.4 supercharged V8 (Ford GT)':{iv:37,ev:32,unsure:true,src:'Stock-size Ford GT 5.4 intake valve 37 mm (std); exhaust 32 mm from owners (themustangsource.com)'},
  'Porsche M64/60 twin-turbo flat-six (911 Turbo 993)':{iv:49,ev:42.5,unsure:true,src:'FVD, 993 / 993 TT M64.60 intake valve 49 mm; exhaust 42.5 mm listed for the 1994-95 M64.05-08, taken as shared'},
  'Ford 3.5 EcoBoost HO V6 (F-150 Raptor 2017)':{iv:36.9,ev:31,unsure:true,src:'Supertech stock-size 3.5 EcoBoost intake 36.9 mm; Ferrea exhaust 32 mm sold as +1 mm (std)'},
  'Ford Duratec 2.3 Cosworth (BAC Mono)':{iv:35,ev:30,unsure:true,src:'Ferrea and Supertech stock-size Duratec 2.3 valves: 35.08 / 29.96 mm (std); Cosworth\'s head taken as stock'},
  'GM Duramax L5P 6.6 (Silverado HD)':{iv:33,ev:33,unsure:true,src:'Stock-size L5P intake valve 1.299 in; Manley 6.6 Duramax exhaust 1.300 in (std)'},
  'Toyota 2ZR-FXE 1.8 + power-split (Prius)':{iv:31.9,ev:27.4,unsure:true,src:'Stock-size 2ZR-FE/FXE valves (Partsology, Melling): intake 31.9 mm, exhaust 27.0-27.5 mm (std)'},
  'BMW S63B44 4.4 TT V8 (X5 M F85)':{iv:33.2,ev:29,unsure:true,src:'Genuine BMW N63/S63 intake valve 33.2 mm (Turner); Supertech S63 exhaust 29 mm (std)'},
  'Audi 2.5 TFSI (RS3 8V)':{iv:33.85,ev:28,src:'Supertech and Ferrea stock-size EA855 valves: 33.85-33.9 / 28 mm (std)'},
  'BMW B48 2.0 turbo + P2 plug-in (330e)':{iv:30.1,ev:28.5,src:'Supertech stock-size B48 valves: 30.1 / 28.5 mm (std)'},
  'Lamborghini 5.2 V10 (Huracán LP610-4)':{iv:33.85,ev:28,unsure:true,src:'GSC and ZRP stock-size 5.2 V10 intake 33.8-33.85 mm; ZRP +1 mm exhaust 29 mm, so 28 mm stock (std)'},
  'Lamborghini 5.2 V10 (Huracán STO)':{iv:33.85,ev:28,unsure:true,src:'As the LP610-4: GSC and ZRP stock-size intake 33.85 mm, exhaust 28 mm (std)'},
  'Lancia 831 2.0 16V turbo (Delta Integrale Evo)':{iv:34.4,ev:28.4,src:'Supertech LIVN-1001 / LEVI-1001 stock-size Delta 16V valves: 34.4 / 28.4 mm (std)'},
  'Ferrari F136 FB V8 (458 Italia)':{iv:37.8,ev:31,src:'Supertech FEIVC-F136 / FEEVC-F136 stock-size 458 valves: 37.8 / 31.0 mm (std)'},
  'Toyota 1VD-FTV 4.5 V8 diesel (Land Cruiser 200)':{iv:30.1,ev:27,unsure:true,src:'australiancar.reviews and mymotorlist 1VD-FTV pages: 30.1 / 27.0 mm, not a Toyota sheet'},
  // Build 428 (plans/v1-finish.md, valves batch 3 of 4), on the same rules.
  'Honda S07A turbo (S660)':{iv:24.5,ev:20.5,src:'Honda, S07B technical page: intake 24.0 mm against the S07A\'s 24.5; exhaust 20.0 mm, 0.5 mm less than the S07A\'s'},
  'Radical RPE 1500 Suzuki-based I4 (SR3 RSX)':{iv:33,ev:27.5,unsure:true,src:'Kibblewhite 60-60008H / 60-60010H stock-size Hayabusa valves: 33 / 27.5 mm (std); the RPE head taken as the Hayabusa\'s'},
  'Ferrari F129B V8 (F355)':{iv:26.5,ev:28.5,unsure:true,src:'Supertech FEIVN-2500 / FEEVN-2500 stock-size 355 valves: three intakes 26.5 mm, two exhausts 28.5 mm (std); a FerrariChat post swaps them'}
};
// Category order for the preset list (the dropdown groups by it; the UI pass will build on this).
const PRESET_CATS=['Archetypes','Kei & City','Compact Turbo','NA Sports','Turbo Performance','American V8','Supercar','Performance SUV','Track','Rotary','Diesel','Pickup','Two-Stroke'];
// A real engine's own cam card (build 427, plans/v1-finish.md item 5), in place of its factory class's duration, separation
// and lift (CAM). d050: intake duration at 0.050 in of tappet lift, crank degrees; lift: intake valve lift, in; rocker:
// the rocker ratio that lift is quoted at; lsa: lobe separation, degrees. The model's duration is seat to seat on its own
// sin^2 lift law (intakeFill), so the card's 0.050 in is found on that law: lift(t) = L sin^2(pi t/dur) reaches h at
// t/dur = asin(sqrt(h/L))/pi from each seat, so dur = d050/(1 - 2 asin(sqrt(h/L))/pi), L the lobe's lift (valve/rocker).
// The intake centreline is taken at the separation (the model has no ground-in advance). The exhaust lobe stays the
// intake's (overlapDeg is symmetric). An engine not listed keeps its class's cam.
// Not listed, no full card found: Ford Coyote Gen 3 (14 mm lift, Ford; 260/263 deg advertised, EngineLabs; no 0.050 in
// figure, no separation, and both cams phased); GM LT4 (189/223 at 0.050 in, .492/.551 in, Chevrolet LT4 page; no
// separation found).
const ENGINE_CAMS={
  'GM LS3 (Corvette C6)':{d050:204,lift:0.551,rocker:1.7,lsa:117,src:'Summit Racing, Chevy LS3 engine specs: 204/211 deg at .050, .551/.525 in, LSA 117 (Engine Tech LS catalogue 2015: 116)'},
  'GM LS7 (Corvette Z06 C6)':{d050:211,lift:0.593,rocker:1.8,lsa:121,src:'GM Performance Parts 12638426, factory LS7 cam (Hawks Motorsports listing): 211/230 deg at .050, .593/.588 in on 1.8 rockers, LSA 121'}
};
const camCardDur=c=>c.d050/(1-2*Math.asin(Math.sqrt(0.050/(c.lift/c.rocker)))/Math.PI);
const STD_TUNE={throttle:0.85,load:0.40,elecLoad:0.30,afr:13.2,iat:25,coolant:90,oil:100,autoThermal:false};

