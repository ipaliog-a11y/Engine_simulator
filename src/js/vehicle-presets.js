// ====== VEHICLE LAYER (feature A) ======
// Chassis archetypes: mass is the rolling platform WITHOUT the engine (kg); the engine's mass
// is estimated from its spec and added. area = frontal area (m²), cd = base drag coefficient,
// wb = wheelbase (m), cg = centre-of-gravity height (m), fWt = static front weight fraction,
// track = track width (m: how far apart the wheels on an axle are, which sets the lateral load
// transfer — build 109, in place of a fitted mechanical-grip factor), drive = default driven layout, aero = how much downforce the
// body can carry (a formula car a lot, a truck little), cost = chassis price.
// Each chassis carries a `fit`: the coherent factory-spec parts it ships with (tyres, wheels,
// brakes, suspension, aero, weight, gearbox). Selecting a chassis applies its fit so every car is
// a believable whole — a kei car on skinny eco tyres & steel discs, a hypercar on wide slicks,
// carbon-ceramics and a full wing/diffuser package — which the user can then tune from.
const CHASSIS={
  kei:      {label:'KEI CAR',           mass:640, area:1.85,cd:0.34,wb:2.40,cg:0.52,fWt:0.60,track:1.30,drive:'fwd',aero:0.4,cost:5000,
             fit:{tire:'eco',  tw:165,ta:60,wheel:15,brake:'steel',  rotor:260,susp:'comfort', aF:'none',    aR:'none',aFl:'none',     weight:'none',  gears:5,gearing:44,gearbox:'manual',diff:'open',geoF:'strut',geoR:'twist'}},
  hatch:    {label:'HOT HATCH',         mass:1080,area:2.10,cd:0.32,wb:2.60,cg:0.52,fWt:0.62,track:1.53,drive:'fwd',aero:0.6,cost:8000,
             fit:{tire:'sport',tw:205,ta:45,wheel:17,brake:'slotted',rotor:300,susp:'sport',   aF:'none',    aR:'none',aFl:'none',     weight:'none',  gears:6,gearing:50,gearbox:'manual',diff:'open',geoF:'strut',geoR:'twist'}},
  roadster: {label:'LIGHT ROADSTER',    mass:980, area:1.90,cd:0.35,wb:2.30,cg:0.46,fWt:0.52,track:1.42,drive:'rwd',aero:0.6,cost:9000,
             fit:{tire:'sport',tw:195,ta:50,wheel:16,brake:'slotted',rotor:290,susp:'sport',   aF:'none',    aR:'none',aFl:'none',     weight:'street',gears:6,gearing:52,gearbox:'manual',diff:'visc',geoF:'wishbone',geoR:'wishbone'}},
  coupe:    {label:'SPORTS COUPE',      mass:1200,area:2.05,cd:0.31,wb:2.65,cg:0.48,fWt:0.54,track:1.55,drive:'rwd',aero:0.8,cost:11000,
             fit:{tire:'sport',tw:245,ta:40,wheel:18,brake:'slotted',rotor:330,susp:'sport',   aF:'none',    aR:'lip', aFl:'none',     weight:'none',  gears:6,gearing:52,gearbox:'manual',diff:'clsd',geoF:'strut',geoR:'multilink'}},
  sedan:    {label:'SPORTS SEDAN',      mass:1420,area:2.20,cd:0.29,wb:2.85,cg:0.52,fWt:0.55,track:1.56,drive:'rwd',aero:0.7,cost:12000,
             fit:{tire:'sport',tw:245,ta:40,wheel:18,brake:'slotted',rotor:330,susp:'sport',   aF:'none',    aR:'none',aFl:'none',     weight:'none',  gears:7,gearing:56,gearbox:'auto',diff:'visc',geoF:'strut',geoR:'multilink'}},
  muscle:   {label:'MUSCLE CAR',        mass:1620,area:2.25,cd:0.36,wb:2.95,cg:0.50,fWt:0.56,track:1.60,drive:'rwd',aero:0.5,cost:13000,
             fit:{tire:'sport',tw:275,ta:40,wheel:18,brake:'big',    rotor:340,susp:'sport',   aF:'none',    aR:'none',aFl:'none',     weight:'none',  gears:6,gearing:48,gearbox:'auto',diff:'clsd',geoF:'wishbone',geoR:'solid'}},
  rally:    {label:'RALLY AWD HATCH',   mass:1300,area:2.15,cd:0.34,wb:2.60,cg:0.52,fWt:0.58,track:1.52,drive:'awd',aero:0.7,cost:14000,
             fit:{tire:'sport',tw:225,ta:45,wheel:17,brake:'slotted',rotor:320,susp:'coilover',aF:'splitter',aR:'lip', aFl:'none',     weight:'street',gears:6,gearing:50,gearbox:'manual',diff:'clsd',geoF:'strut',geoR:'strut'}},
  gt:       {label:'GRAND TOURER',      mass:1580,area:2.15,cd:0.30,wb:2.90,cg:0.48,fWt:0.52,track:1.63,drive:'rwd',aero:0.9,cost:20000,
             fit:{tire:'sport',tw:265,ta:35,wheel:19,brake:'big',    rotor:350,susp:'coilover',aF:'splitter',aR:'lip', aFl:'none',     weight:'none',  gears:7,gearing:58,gearbox:'dct',diff:'clsd',geoF:'wishbone',geoR:'multilink'}},
  super:    {label:'MID-ENGINE SUPER',  mass:1340,area:1.95,cd:0.33,wb:2.65,cg:0.44,fWt:0.42,track:1.67,drive:'rwd',aero:1.2,cost:30000,
             fit:{tire:'semi', tw:285,ta:35,wheel:19,brake:'big',    rotor:360,susp:'coilover',aF:'splitter',aR:'wing',aFl:'undertray',weight:'sport', gears:7,gearing:54,gearbox:'dct',diff:'clsd',geoF:'wishbone',geoR:'wishbone'}},
  hyper:    {label:'CARBON HYPERCAR',   mass:1240,area:1.92,cd:0.35,wb:2.70,cg:0.44,fWt:0.44,track:1.70,drive:'awd',aero:1.6,cost:60000,
             fit:{tire:'semi', tw:305,ta:30,wheel:20,brake:'carbon', rotor:390,susp:'race',    aF:'wing',    aR:'wing',aFl:'diffuser', weight:'sport', gears:7,gearing:56,gearbox:'dct',diff:'clsd',geoF:'wishbone',geoR:'wishbone'}},
  proto:    {label:'TRACK PROTOTYPE',   mass:620, area:1.55,cd:0.60,wb:2.80,cg:0.32,fWt:0.46,track:1.75,drive:'rwd',aero:3.0,cost:45000,
             fit:{tire:'slick',tw:305,ta:30,wheel:18,brake:'carbon', rotor:380,susp:'race',    aF:'wing',    aR:'wing',aFl:'diffuser', weight:'race',  gears:6,gearing:50,gearbox:'sequential',diff:'spool',geoF:'wishbone',geoR:'wishbone'}},
  pickup:   {label:'PICKUP TRUCK',      mass:2050,area:3.20,cd:0.45,wb:3.60,cg:0.68,fWt:0.58,track:1.75,drive:'rwd',aero:0.2,cost:11000,
             fit:{tire:'eco',  tw:265,ta:65,wheel:17,brake:'hd',     rotor:330,susp:'comfort', aF:'none',    aR:'none',aFl:'none',     weight:'none',  gears:6,gearing:42,gearbox:'auto',diff:'open',geoF:'wishbone',geoR:'solid'}},
  suv:      {label:'PERFORMANCE SUV',   mass:1950,area:2.95,cd:0.36,wb:2.95,cg:0.66,fWt:0.54,track:1.65,drive:'awd',aero:0.4,cost:16000,
             fit:{tire:'sport',tw:275,ta:45,wheel:20,brake:'big',    rotor:350,susp:'sport',   aF:'none',    aR:'none',aFl:'none',     weight:'none',  gears:8,gearing:48,gearbox:'auto',diff:'visc',geoF:'wishbone',geoR:'multilink'}}
};
// Real cars, paired with their factory engine from PRESETS. A chassis archetype is a class; a real car
// is one member of it with its own BODY: curb mass (kg, with the engine and fluids), the measured
// drag coefficient of the car as sold (its factory spoilers are part of that number, so the fit
// carries no extra aero parts), frontal area (m²), wheelbase (m) and static front weight share. The
// archetype still supplies what is not published car by car: CG height and its mechanical grip.
// Fit is the factory fitment, driven-axle tyre for staggered setups; omitted fields take the
// archetype's. real = the maker's 0-100 km/h (s) and top speed (km/h); limited = the top speed is a
// governor, which the model does not have. unsure = inputs from secondary sources, worth checking.
const VEHICLE_PRESETS=[
  {cat:'Kei & City',name:'Suzuki Alto Works (HA36S, 2015)',engine:'Suzuki K6A turbo (Alto Works)',chassis:'kei',
   body:{kg:670,cd:0.36,area:1.80,wb:2.46,fWt:0.62},fit:{drive:'fwd',tire:'eco',tw:165,ta:55,wheel:15,brake:'steel',rotor:250,susp:'comfort',gears:5,gearbox:'manual',diff:'open'},
   real:{t100:11.0,top:140,limited:true},note:'0-100 is a road-test midpoint, not a factory figure',unsure:['cd','area','fWt']},
  {cat:'Kei & City',name:'Toyota Aygo 1.0 (2014)',engine:'Toyota 1KR-FE (Aygo 1.0)',chassis:'kei',
   body:{kg:840,cd:0.30,area:2.00,wb:2.34,fWt:0.63},fit:{drive:'fwd',tire:'eco',tw:165,ta:65,wheel:14,brake:'steel',rotor:250,susp:'comfort',gears:5,gearbox:'manual',diff:'open'},
   real:{t100:14.2,top:160},unsure:['cd','area','fWt']},
  {cat:'Kei & City',name:'Fiat 500 TwinAir 85 (2011)',engine:'Fiat 0.9 TwinAir turbo',chassis:'kei',
   body:{kg:930,cd:0.32,area:2.10,wb:2.30,fWt:0.64},fit:{drive:'fwd',tire:'eco',tw:185,ta:55,wheel:15,brake:'steel',rotor:260,susp:'comfort',gears:5,gearbox:'manual',diff:'open'},
   real:{t100:11.0,top:173},unsure:['area','fWt']},
  {cat:'Compact Turbo',name:'Ford Fiesta 1.0 EcoBoost 125 (2013)',engine:'Ford 1.0 EcoBoost (Fiesta 125)',chassis:'hatch',
   body:{kg:1091,cd:0.33,area:2.12,wb:2.49,fWt:0.63},fit:{drive:'fwd',tire:'eco',tw:195,ta:45,wheel:16,brake:'steel',rotor:260,susp:'comfort',gears:5,gearbox:'manual',diff:'open'},
   real:{t100:9.4,top:196},unsure:['area','fWt']},
  {cat:'Compact Turbo',name:'VW Golf GTI (Mk7, 2013)',engine:'VW EA888 2.0 TSI (Golf GTI Mk7)',chassis:'hatch',
   body:{kg:1351,cd:0.32,area:2.19,wb:2.637,fWt:0.61},fit:{drive:'fwd',tire:'sport',tw:225,ta:45,wheel:17,brake:'slotted',rotor:310,susp:'sport',gears:6,gearbox:'manual',diff:'open'},
   real:{t100:6.5,top:246,limited:true}},
  {cat:'Compact Turbo',name:'Toyota GR Yaris (2020)',engine:'Toyota G16E-GTS (GR Yaris)',chassis:'rally',
   body:{kg:1280,cd:0.34,area:2.10,wb:2.56,fWt:0.60},fit:{drive:'awd',tire:'sport',tw:225,ta:40,wheel:18,brake:'big',rotor:360,susp:'sport',gears:6,gearbox:'manual',diff:'clsd'},
   real:{t100:5.5,top:230,limited:true},unsure:['cd','area','fWt']},
  {cat:'Compact Turbo',name:'Honda Civic Type R (FK8, 2017)',engine:'Honda K20C1 (Civic Type R FK8)',chassis:'hatch',
   body:{kg:1380,cd:0.33,area:2.20,wb:2.70,fWt:0.62},fit:{drive:'fwd',tire:'sport',tw:245,ta:30,wheel:20,brake:'big',rotor:350,susp:'sport',gears:6,gearbox:'manual',diff:'clsd'},
   real:{t100:5.8,top:272},unsure:['cd','area']},
  {cat:'NA Sports',name:'Mazda MX-5 1.6 (NA, 1989)',engine:'Mazda B6-ZE (MX-5 NA)',chassis:'roadster',
   body:{kg:955,cd:0.38,area:1.72,wb:2.265,fWt:0.52},fit:{tc:false,drive:'rwd',tire:'eco',tw:185,ta:60,wheel:14,brake:'steel',rotor:250,susp:'sport',gears:5,gearbox:'manual',diff:'open'},
   real:{t100:8.8,top:195}},
  {cat:'NA Sports',name:'Toyota Corolla Levin GT-APEX (AE86)',engine:'Toyota 4A-GE (AE86)',chassis:'coupe',
   body:{kg:940,cd:0.38,area:1.75,wb:2.40,fWt:0.53},fit:{tc:false,drive:'rwd',tire:'eco',tw:185,ta:60,wheel:14,brake:'steel',rotor:250,susp:'sport',gears:5,gearbox:'manual',diff:'open'},
   real:{t100:8.5,top:200},unsure:['cd','area','t100','top']},
  {cat:'NA Sports',name:'Honda S2000 (AP1, 2000)',engine:'Honda F20C (S2000 AP1)',chassis:'roadster',
   body:{kg:1250,cd:0.33,area:1.80,wb:2.40,fWt:0.50},fit:{tc:false,drive:'rwd',tire:'sport',tw:225,twF:205,ta:50,wheel:16,brake:'slotted',rotor:300,susp:'sport',gears:6,gearbox:'manual',diff:'clsd'},
   real:{t100:6.2,top:240},unsure:['area']},
  {cat:'NA Sports',name:'BMW M3 (E46, 2000)',engine:'BMW S54 (M3 E46)',chassis:'coupe',
   body:{kg:1495,cd:0.32,area:2.07,wb:2.73,fWt:0.51},fit:{drive:'rwd',tire:'sport',tw:255,twF:225,ta:40,wheel:18,brake:'slotted',rotor:330,susp:'sport',gears:6,gearbox:'manual',diff:'visc'},
   real:{t100:5.2,top:250,limited:true}},
  {cat:'NA Sports',name:'Porsche 911 GT3 (991.2, 2017)',engine:'Porsche 4.0 flat-six (911 GT3 991.2)',chassis:'super',
   body:{kg:1430,cd:0.34,area:2.05,wb:2.457,fWt:0.39,engPos:'rear'},fit:{drive:'rwd',tire:'semi',tw:305,twF:245,ta:30,wheel:20,brake:'big',rotor:380,susp:'coilover',gears:7,gearbox:'dct',diff:'clsd',aF:'splitter',aR:'lip'},
   real:{t100:3.4,top:318},unsure:['cd','area','aero'],note:'the real car has a fixed rear wing and a front lip; a splitter and lip are the closest parts'},
  {cat:'Turbo Performance',name:'Toyota Supra RZ (A80, 1993)',engine:'Toyota 2JZ-GTE (Supra A80)',chassis:'coupe',
   body:{kg:1570,cd:0.31,area:1.94,wb:2.55,fWt:0.53},fit:{tc:false,drive:'rwd',tire:'sport',tw:255,twF:235,ta:40,wheel:17,brake:'slotted',rotor:320,susp:'sport',gears:6,gearbox:'manual',diff:'clsd'},
   real:{t100:4.9,top:250,limited:true},unsure:['tc','area']},
  {cat:'Turbo Performance',name:'Nissan Skyline GT-R V-spec (R34, 1999)',engine:'Nissan RB26DETT (Skyline GT-R R34)',chassis:'coupe',
   body:{kg:1560,cd:0.36,area:2.00,wb:2.665,fWt:0.56},fit:{tc:false,drive:'awd',tire:'sport',tw:245,ta:40,wheel:18,brake:'big',rotor:320,susp:'sport',gears:6,gearbox:'manual',diff:'clsd'},
   real:{t100:5.0,top:250,limited:true},note:'rated at the JDM 280 PS; road-test cars made more',unsure:['cd','area','fWt','t100']},
  {cat:'Turbo Performance',name:'Subaru Impreza WRX STI (GD, 2004)',engine:'Subaru EJ257 (Impreza WRX STI)',chassis:'rally',
   body:{kg:1495,cd:0.33,area:2.10,wb:2.525,fWt:0.59},fit:{tc:false,drive:'awd',tire:'sport',tw:225,ta:45,wheel:17,brake:'big',rotor:330,susp:'sport',gears:6,gearbox:'manual',diff:'clsd'},
   real:{t100:5.0,top:250,limited:true},unsure:['cd','area','t100','top']},
  {cat:'Turbo Performance',name:'Mitsubishi Lancer Evolution IX (2006)',engine:'Mitsubishi 4G63T (Lancer Evo IX)',chassis:'rally',
   body:{kg:1490,cd:0.34,area:2.10,wb:2.625,fWt:0.61},fit:{tc:false,drive:'awd',tire:'sport',tw:235,ta:45,wheel:17,brake:'big',rotor:320,susp:'sport',gears:5,gearbox:'manual',diff:'clsd'},
   real:{t100:5.0,top:250,limited:true},unsure:['cd','area','t100','top']},
  {cat:'Turbo Performance',name:'Audi RS3 Sportback (8V, 2017)',engine:'Audi 2.5 TFSI (RS3 8V)',chassis:'rally',
   body:{kg:1510,cd:0.34,area:2.15,wb:2.63,fWt:0.60},fit:{drive:'awd',tire:'sport',tw:235,ta:35,wheel:19,brake:'big',rotor:370,susp:'sport',gears:7,gearbox:'dct',diff:'visc'},
   real:{t100:4.1,top:250,limited:true},unsure:['cd','area']},
  {cat:'American V8',name:'Chevrolet Corvette (C6, LS3, 2008)',engine:'GM LS3 (Corvette C6)',chassis:'coupe',
   body:{kg:1450,cd:0.28,area:2.00,wb:2.685,fWt:0.51},fit:{drive:'rwd',tire:'sport',tw:285,twF:245,ta:35,wheel:19,brake:'slotted',rotor:330,susp:'sport',gears:6,gearbox:'manual',diff:'clsd'},
   real:{t100:4.2,top:306},unsure:['area']},
  {cat:'American V8',name:'Chevrolet Corvette Z06 (C6, 2006)',engine:'GM LS7 (Corvette Z06 C6)',chassis:'coupe',
   body:{kg:1420,cd:0.34,area:2.05,wb:2.686,fWt:0.52},fit:{drive:'rwd',tire:'sport',tw:325,twF:275,ta:30,wheel:19,brake:'big',rotor:360,susp:'sport',gears:6,gearbox:'manual',diff:'clsd'},
   real:{t100:3.7,top:318},unsure:['area']},
  {cat:'American V8',name:'Ford Mustang GT (2018)',engine:'Ford Coyote 5.0 (Mustang GT 2018)',chassis:'muscle',
   body:{kg:1705,cd:0.35,area:2.20,wb:2.72,fWt:0.53},fit:{drive:'rwd',tire:'sport',tw:275,twF:255,ta:40,wheel:19,brake:'big',rotor:380,susp:'sport',gears:6,gearbox:'manual',diff:'clsd'},
   real:{t100:4.6,top:250,limited:true},unsure:['cd','area','t100']},
  {cat:'American V8',name:'Dodge Challenger SRT Hellcat (2015)',engine:'Dodge 6.2 Hellcat (Challenger SRT)',chassis:'muscle',
   body:{kg:2020,cd:0.38,area:2.40,wb:2.95,fWt:0.57},fit:{drive:'rwd',tire:'sport',tw:275,ta:40,wheel:20,brake:'big',rotor:390,susp:'sport',gears:8,gearbox:'auto',diff:'clsd'},
   real:{t100:3.9,top:320},unsure:['cd','area']},
  // Ferrari quoted 1350 kg dry; the body carries a curb mass with fluids
  {cat:'Supercar',era:'1990s',name:'Ferrari F355 Berlinetta (1994)',engine:'Ferrari F129B V8 (F355)',chassis:'super',
   body:{kg:1440,cd:0.33,area:1.85,wb:2.45,fWt:0.42},fit:{tc:false,drive:'rwd',tire:'sport',tw:265,twF:225,ta:40,wheel:18,brake:'slotted',rotor:284,susp:'sport',gears:6,gearbox:'manual',diff:'clsd'},
   real:{t100:4.7,top:295},unsure:['kg','area','fWt']},
  {cat:'Supercar',era:'1990s',name:'Lamborghini Diablo VT (1993)',engine:'Lamborghini 5.7 V12 (Diablo VT)',chassis:'super',
   body:{kg:1700,cd:0.31,area:1.90,wb:2.65,fWt:0.41},fit:{tc:false,drive:'awd',tire:'sport',tw:335,twF:235,ta:30,wheel:18,brake:'big',rotor:330,susp:'sport',gears:5,gearbox:'manual',diff:'visc'},
   real:{t100:4.1,top:325},unsure:['kg','area','fWt','t100']},
  // 1138 kg dry; 386 km/h is the production car, 391 with the limiter raised
  {cat:'Supercar',era:'1990s',name:'McLaren F1 (1994)',engine:'BMW S70/2 V12 (McLaren F1)',chassis:'hyper',
   body:{kg:1200,cd:0.32,area:1.79,wb:2.718,fWt:0.42},fit:{tc:false,drive:'rwd',tire:'sport',tw:315,twF:235,ta:45,wheel:17,brake:'big',rotor:332,susp:'sport',gears:6,gearbox:'manual',diff:'clsd'},
   real:{t100:3.2,top:386},unsure:['kg','fWt']},
  {cat:'Supercar',era:'1990s',name:'Porsche 911 Turbo (993, 1995)',engine:'Porsche M64/60 twin-turbo flat-six (911 Turbo 993)',chassis:'super',
   body:{kg:1500,cd:0.34,area:1.95,wb:2.272,fWt:0.38,engPos:'rear'},fit:{tc:false,drive:'awd',tire:'sport',tw:285,twF:225,ta:30,wheel:18,brake:'big',rotor:322,susp:'sport',gears:6,gearbox:'manual',diff:'visc'},
   real:{t100:4.5,top:290},unsure:['area']},
  // 1365 kg dry
  {cat:'Supercar',era:'2000s',name:'Ferrari Enzo (2002)',engine:'Ferrari F140B V12 (Enzo)',chassis:'hyper',
   body:{kg:1480,cd:0.36,area:1.95,wb:2.65,fWt:0.44},fit:{drive:'rwd',tire:'sport',tw:345,twF:245,ta:35,wheel:19,brake:'carbon',rotor:380,susp:'coilover',gears:6,gearbox:'sequential',diff:'clsd'},
   real:{t100:3.65,top:350},unsure:['kg','cd','area','fWt']},
  // 1380 kg dry
  {cat:'Supercar',era:'2000s',name:'Porsche Carrera GT (2004)',engine:'Porsche 5.7 V10 (Carrera GT)',chassis:'hyper',
   body:{kg:1472,cd:0.40,area:1.86,wb:2.73,fWt:0.42},fit:{drive:'rwd',tire:'sport',tw:335,twF:265,ta:30,wheel:20,brake:'carbon',rotor:380,susp:'coilover',gears:6,gearbox:'manual',diff:'clsd'},
   real:{t100:3.9,top:330},unsure:['area','fWt']},
  {cat:'Supercar',era:'2000s',name:'Ford GT (2005)',engine:'Ford 5.4 supercharged V8 (Ford GT)',chassis:'super',
   body:{kg:1520,cd:0.355,area:1.90,wb:2.71,fWt:0.43},fit:{drive:'rwd',tire:'sport',tw:315,twF:235,ta:40,wheel:19,brake:'big',rotor:355,susp:'sport',gears:6,gearbox:'manual',diff:'clsd'},
   real:{t100:3.9,top:330},unsure:['area','fWt']},
  // 1665 kg dry
  {cat:'Supercar',era:'2000s',name:'Lamborghini Murciélago LP640 (2006)',engine:'Lamborghini 6.5 V12 (Murciélago LP640)',chassis:'super',
   body:{kg:1750,cd:0.33,area:2.00,wb:2.665,fWt:0.42},fit:{tc:false,drive:'awd',tire:'sport',tw:335,twF:245,ta:30,wheel:18,brake:'big',rotor:380,susp:'sport',gears:6,gearbox:'sequential',diff:'visc'},
   real:{t100:3.4,top:340},unsure:['tc','kg','cd','area','fWt']},
  {cat:'Supercar',era:'2010s',name:'Ferrari 458 Italia (2010)',engine:'Ferrari F136 FB V8 (458 Italia)',chassis:'super',
   body:{kg:1485,cd:0.33,area:1.95,wb:2.65,fWt:0.42},fit:{drive:'rwd',tire:'sport',tw:295,twF:235,ta:35,wheel:20,brake:'carbon',rotor:398,susp:'sport',gears:7,gearbox:'dct',diff:'clsd'},
   real:{t100:3.4,top:325},unsure:['area','fWt']},
  {cat:'Supercar',era:'2010s',name:'Lamborghini Huracán LP610-4 (2014)',engine:'Lamborghini 5.2 V10 (Huracán LP610-4)',chassis:'super',
   body:{kg:1550,cd:0.39,area:1.95,wb:2.62,fWt:0.43},fit:{drive:'awd',tire:'sport',tw:305,twF:245,ta:30,wheel:20,brake:'carbon',rotor:380,susp:'sport',gears:7,gearbox:'dct',diff:'clsd'},
   real:{t100:3.2,top:325},unsure:['cd','area','kg']},
  {cat:'Supercar',era:'2010s',name:'McLaren 720S (2017)',engine:'McLaren M840T twin-turbo V8 (720S)',chassis:'super',
   body:{kg:1419,cd:0.38,area:1.95,wb:2.67,fWt:0.42},fit:{drive:'rwd',tire:'semi',tw:305,twF:245,ta:30,wheel:20,brake:'carbon',rotor:390,susp:'sport',gears:7,gearbox:'dct',diff:'clsd'},
   real:{t100:2.9,top:341},unsure:['cd','area','fWt']},
  {cat:'Supercar',era:'2010s',name:'Ferrari 812 Superfast (2017)',engine:'Ferrari F140 V12 (812 Superfast)',chassis:'gt',
   body:{kg:1745,cd:0.37,area:2.05,wb:2.72,fWt:0.47},fit:{drive:'rwd',tire:'sport',tw:315,twF:275,ta:35,wheel:20,brake:'carbon',rotor:400,susp:'sport',gears:7,gearbox:'dct',diff:'clsd'},
   real:{t100:2.9,top:340},unsure:['cd','area','kg']},
  {cat:'Supercar',era:'2020s',name:'Porsche 911 Turbo S (992, 2020)',engine:'Porsche 3.7 twin-turbo flat-six (911 Turbo S 992)',chassis:'super',
   body:{kg:1640,cd:0.33,area:2.10,wb:2.45,fWt:0.39,engPos:'rear'},fit:{drive:'awd',tire:'sport',tw:315,twF:255,ta:30,wheel:21,brake:'carbon',rotor:420,susp:'sport',gears:8,gearbox:'dct',diff:'clsd'},
   real:{t100:2.7,top:330},unsure:['area','fWt']},
  // 1339 kg dry; its fixed wing and splitter are part of the measured drag
  {cat:'Supercar',era:'2020s',name:'Lamborghini Huracán STO (2021)',engine:'Lamborghini 5.2 V10 (Huracán STO)',chassis:'super',
   body:{kg:1450,cd:0.40,area:1.95,wb:2.62,fWt:0.41},fit:{drive:'rwd',tire:'semi',tw:305,twF:245,ta:30,wheel:20,brake:'carbon',rotor:390,susp:'coilover',gears:7,gearbox:'dct',diff:'clsd'},
   real:{t100:3.0,top:310},unsure:['kg','cd','area','fWt']},
  // GM quotes 0-60 mph in 2.6 s
  // t100 2.8 is unsure: it reads as GM's 0-60 mph claim, timed with a 1 ft rollout as US magazines do. The one
  // rollout-free 0-100 km/h found is AutoTopNL's 3.54 s on the road (build 153 tyre review); the model reads ~3.5.
  {cat:'Supercar',era:'2020s',name:'Chevrolet Corvette Z06 (C8, 2023)',engine:'GM LT6 flat-plane V8 (Corvette Z06 C8)',chassis:'super',
   body:{kg:1561,cd:0.37,area:2.05,wb:2.72,fWt:0.40},fit:{drive:'rwd',tire:'sport',tw:345,twF:275,ta:25,wheel:21,brake:'big',rotor:370,susp:'sport',gears:8,gearbox:'dct',diff:'clsd'},
   real:{t100:2.8,top:312},unsure:['cd','area','t100','top']},
  {cat:'Supercar',era:'2020s',name:'McLaren 750S (2023)',engine:'McLaren M840T twin-turbo V8 (750S)',chassis:'super',
   body:{kg:1389,cd:0.38,area:1.95,wb:2.67,fWt:0.42},fit:{drive:'rwd',tire:'semi',tw:305,twF:245,ta:30,wheel:20,brake:'carbon',rotor:390,susp:'sport',gears:7,gearbox:'dct',diff:'clsd'},
   real:{t100:2.8,top:332},unsure:['cd','area','fWt']},
  {cat:'Rotary',name:'Mazda RX-7 (FD, 1993)',engine:'Mazda 13B-REW (RX-7 FD)',chassis:'coupe',
   body:{kg:1280,cd:0.29,area:1.80,wb:2.425,fWt:0.50},fit:{tc:false,drive:'rwd',tire:'sport',tw:225,ta:50,wheel:16,brake:'slotted',rotor:290,susp:'sport',gears:5,gearbox:'manual',diff:'clsd'},
   real:{t100:5.3,top:250,limited:true},unsure:['area','t100','top']},
  {cat:'Rotary',name:'Mazda RX-8 (2004)',engine:'Mazda 13B-MSP Renesis (RX-8)',chassis:'coupe',
   body:{kg:1310,cd:0.30,area:2.05,wb:2.70,fWt:0.50},fit:{drive:'rwd',tire:'sport',tw:225,ta:45,wheel:18,brake:'slotted',rotor:320,susp:'sport',gears:6,gearbox:'manual',diff:'clsd'},
   real:{t100:6.4,top:235},unsure:['area','top']},
  {cat:'Diesel',name:'VW Golf 2.0 TDI 150 (Mk7, 2013)',engine:'VW EA288 2.0 TDI (Golf 150)',chassis:'hatch',
   body:{kg:1375,cd:0.30,area:2.19,wb:2.637,fWt:0.62},fit:{drive:'fwd',tire:'eco',tw:205,ta:55,wheel:16,brake:'slotted',rotor:290,susp:'comfort',gears:6,gearbox:'manual',diff:'open'},
   real:{t100:8.6,top:216}},
  {cat:'Diesel',name:'BMW 330d (F30, 2012)',engine:'BMW N57 3.0d (330d F30)',chassis:'sedan',
   body:{kg:1570,cd:0.26,area:2.20,wb:2.81,fWt:0.52},fit:{drive:'rwd',tire:'sport',tw:225,ta:50,wheel:17,brake:'slotted',rotor:330,susp:'sport',gears:8,gearbox:'auto',diff:'open'},
   real:{t100:5.6,top:250,limited:true},unsure:['area']},
  {cat:'Diesel',name:'Chevrolet Silverado 2500HD Duramax (2020)',engine:'GM Duramax L5P 6.6 (Silverado HD)',chassis:'pickup',
   body:{kg:3400,cd:0.50,area:3.80,wb:4.08,fWt:0.62},fit:{drive:'rwd',tire:'eco',tw:265,ta:70,wheel:18,brake:'hd',rotor:360,susp:'comfort',gears:10,gearbox:'auto',diff:'open'},
   real:{t100:8.0,top:160,limited:true},unsure:['kg','cd','area','fWt','t100','top']}
];
// The real cars' gearboxes (build 169): the published gear ratios and final drive, so a Golf and a 911 no longer
// share one generic set. Ratios are gear by gear, 1st first; fd is the final drive, null where it was not found (the
// final drive is then matched to the engine, as for an archetype). Where a box drives through two final drives (one
// for some gears, one for the others, as on a dual-clutch or a transaxle with two output shafts) each gear is stated
// against the first, so gear x fd is still the overall ratio. A car with no published set is not here: it takes the
// average spacing of the published boxes in its own family (stockGearset). src says where each number came from.
const GEARSETS={
  'Suzuki Alto Works (HA36S, 2015)':{r:[3.545,2.105,1.521,1.148,0.900],fd:4.705,
    src:'1st-4th and final: carfromjapan DBA-HA36S 5MT; 5th from Suzuki Works Kurume (100 km/h at 4000 rpm in 5th on the stock gear)'},
  'Toyota Aygo 1.0 (2014)':{r:[3.545,1.913,1.310,1.027,0.850],fd:3.550,src:'Toyota technical specification sheet (manual column)'},
  'Fiat 500 TwinAir 85 (2011)':{r:[3.909,2.158,1.345,0.974,0.766],fd:null,
    src:'the C514 five-speed\'s ratios as Fiat USA lists them for the 1.4 (the TwinAir 85 has the C514); final drive not found'},
  'Toyota GR Yaris (2020)':{r:[3.538,2.238,1.535,1.162,1.081*3.350/3.941,0.902*3.350/3.941],fd:3.941,
    src:'Toyota UK / AU spec sheets: 3.941 final for 1st-4th, 3.350 for 5th-6th'},
  'Honda Civic Type R (FK8, 2017)':{r:[3.625,2.115,1.529,1.125,0.911,0.734],fd:4.111,
    src:'1st-4th: carfromjapan (FK2, same box); 4th 1.125 confirmed for the FK8; 5th-6th unconfirmed; final 4.11 (owners\' forum)'},
  'Mazda MX-5 1.6 (NA, 1989)':{r:[3.136,1.888,1.330,1.000,0.814],fd:4.300,src:'miata.net (NA6A); Bofi Racing'},
  'Toyota Corolla Levin GT-APEX (AE86)':{r:[3.587,2.022,1.384,1.000,0.861],fd:4.300,src:'T50 gearbox, aeu86.org; T282 diff 4.300'},
  'Honda S2000 (AP1, 2000)':{r:[3.133,2.045,1.481,1.161,0.971,0.811],fd:4.100,src:'Honda press site (MY03 US) via s2ki'},
  'BMW M3 (E46, 2000)':{r:[4.227,2.528,1.669,1.226,1.000,0.828],fd:3.620,src:'Getrag Type D; BMW ST041 training manual; australiancar.reviews'},
  'Toyota Supra RZ (A80, 1993)':{r:[3.827,2.360,1.685,1.312,1.000,0.793],fd:3.266,src:'V160 (5/93-8/97), mkivsupra.net; 3.266 is the JDM final'},
  'Nissan Skyline GT-R V-spec (R34, 1999)':{r:[3.827,2.360,1.685,1.312,1.000,0.793],fd:3.545,
    src:'Getrag six-speed shared with the V160; final 3.545 (SAU forum)'},
  'Subaru Impreza WRX STI (GD, 2004)':{r:[3.636,2.375,1.761,1.346,1.062,0.842],fd:3.900,
    src:'1st-4th and final: carfromjapan GDB; 5th-6th: TY856 gearbox listing'},
  'Mitsubishi Lancer Evolution IX (2006)':{r:[2.785,1.950,1.444,1.096,0.761],fd:4.529,
    src:'1st-4th: carfromjapan Evo IX 5MT; final: GoAuto road test; 5th unconfirmed (Mitsubishi made it taller for 2006)'},
  'Audi RS3 Sportback (8V, 2017)':{r:[3.563,2.526*3.450/4.059,1.679*3.450/4.059,1.022,0.788,0.761*3.450/4.059,0.635*3.450/4.059],fd:4.059,
    src:'Audi technical data: 4.059 final for 1st, 4th, 5th; 3.450 for 2nd, 3rd, 6th, 7th'},
  'Chevrolet Corvette (C6, LS3, 2008)':{r:[2.66,1.78,1.30,1.00,0.74,0.50],fd:3.42,src:'Tremec TR-6060 (2008-13 Corvette); 3.42 axle'},
  'Chevrolet Corvette Z06 (C6, 2006)':{r:[2.66,1.78,1.30,1.00,0.74,0.50],fd:3.42,src:'the same TR-6060 set and 3.42 axle'},
  'Dodge Challenger SRT Hellcat (2015)':{r:[4.71,3.14,2.11,1.67,1.28,1.00,0.84,0.67],fd:2.62,src:'ZF 8HP90; auto123 spec'},
  'Ferrari F355 Berlinetta (1994)':{r:[3.07,2.16,1.61,1.27,1.03,0.84],fd:4.35,src:'supercars.net (the final is disputed on FerrariChat)'},
  'Lamborghini Diablo VT (1993)':{r:[2.31,1.52,1.12,0.88,0.68],fd:2.41*1.59,src:'lambocars.com: 2.41 rear axle behind a 1.59 transfer gear'},
  // 2.37 is quoted for the final drive, but Autocar's measured 8.71 mph per 1000 rpm in 1st on the F1's
  // 315/45 R17 needs 2.98 overall per unit of gear: the quoted figure leaves out a drop gear
  'McLaren F1 (1994)':{r:[3.23,2.19,1.71,1.39,1.16,0.93],fd:2.98,src:'ratios: McLaren via Wikipedia; final from Autocar\'s 8.71 mph/1000 rpm in 1st'},
  'Ferrari Enzo (2002)':{r:[3.15,2.18,1.57,1.19,0.94,0.76],fd:4.10,src:'Wikipedia; supercars.net'},
  'Porsche Carrera GT (2004)':{r:[3.20,1.87,1.36,1.07,0.90,0.75],fd:4.44,src:'conceptcarz; autobytel'},
  'Ford GT (2005)':{r:[2.61,1.71,1.23,0.94,0.77,0.63],fd:3.36,src:'Ricardo M7003GT, autobytel; Ford spec 3.36'},
  'Lamborghini Murciélago LP640 (2006)':{r:[3.091,2.105,1.565,1.241,1.065,0.939],fd:2.95,src:'lambocars.com; final: uniquecarsandparts'},
  'Ferrari 458 Italia (2010)':{r:[3.08,2.19,1.63,1.29,1.03,0.84,0.69],fd:5.14,src:'Wikipedia'},
  'McLaren 720S (2017)':{r:[3.98,2.61,1.91,1.48,1.16,0.91,0.69],fd:3.31,src:'autobytel'},
  'Porsche 911 Turbo S (992, 2020)':{r:[4.89,3.17,2.15,1.56,1.18,0.94,0.76,0.61],fd:3.02,src:'Porsche US technical specifications 2021 (rear axle; the front is 3.33)'},
  'Chevrolet Corvette Z06 (C8, 2023)':{r:[2.91,1.76,1.22,0.97,0.81,0.67,0.53,0.45],fd:5.56,src:'Tremec TR-9080 (GM); 5.56 final, Motor Authority'},
  'McLaren 750S (2023)':{r:[3.98,2.61,1.91,1.48,1.16,0.91,0.69],fd:3.31*1.15,src:'the 720S box with a final drive 15% shorter (McLaren, via designboom)'},
  'Mazda RX-7 (FD, 1993)':{r:[3.483,2.015,1.391,1.000,0.806],fd:4.100,src:'OS Giken (stock ratios); carfromjapan FD3S'},
  'Mazda RX-8 (2004)':{r:[3.760,2.269,1.645,1.187,1.000,0.843],fd:4.444,src:'final 4.444 (40:9); gears unconfirmed'},
  'BMW 330d (F30, 2012)':{r:[4.714,3.143,2.106,1.667,1.285,1.000,0.839,0.667],fd:null,src:'ZF 8HP, BMW media sheet; final drive not found'},
  'Chevrolet Silverado 2500HD Duramax (2020)':{r:[4.541,2.866,2.064,1.719,1.484,1.260,1.000,0.850,0.687,0.631],fd:3.42,
    src:'Allison 10L1000, dieselhub; 3.42 axle with the L5P (GM)'}
};
const VEHICLE_CATS=PRESET_CATS.filter(c=>VEHICLE_PRESETS.some(p=>p.cat===c));
// The form-shaped vehicle a preset stands for. The body is a fresh copy, so a later edit cannot reach
// back into the table; its platform mass is filled in by buildVehicle, from the engine actually fitted.
// Tyres are bought rated for the car's top speed, the lowest rating that covers it, and one above
// that on a governed car, which could run past its governor if it were removed.
function vehicleFromPreset(p){
  const ch=CHASSIS[p.chassis];
  const fit=Object.assign({},ch.fit,{aF:'none',aR:'none',aFl:'none',weight:'none',gearing:52,
    gov:p.real.limited?p.real.top:0},p.fit);
  const keys=Object.keys(SPEED_RATING), i=keys.findIndex(k=>SPEED_RATING[k].kmh>=p.real.top);
  const rating=keys[Math.min(keys.length-1,(i<0?keys.length-1:i)+(p.real.limited?1:0))];
  return {chassis:p.chassis,drive:fit.drive,gearbox:fit.gearbox,diff:fit.diff,gears:fit.gears,gearing:fit.gearing,
    tireType:fit.tire,tireWidth:fit.tw,tireWidthF:fit.twF||0,springF:0,springR:0,barF:0,barR:0,tireAspect:fit.ta,wheelDia:fit.wheel,
    aeroFront:fit.aF,aeroRear:fit.aR,aeroFloor:fit.aFl,weightRed:fit.weight,
    brakeType:fit.brake,rotor:fit.rotor,suspension:fit.susp,speedRating:rating,governor:fit.gov,limitKmh:fit.gov||250,
    tc:fit.tc!==false,spacing:'stock',suspFront:(SUSP_REAL[p.name]||{}).f||fit.geoF,suspRear:(SUSP_REAL[p.name]||{}).r||fit.geoR,
    body:Object.assign({name:p.name,fit},p.body)};
}
