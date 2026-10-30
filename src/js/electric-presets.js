// ====== ELECTRIC PRESETS: the three Teslas (build 183, step 2.5b of plans/hybrid-electric/) ======
// Decision 10: the Model 3 RWD (one motor), the Model Y Long Range (two: a magnet motor at the rear, an induction motor
// at the front) and the Model S Plaid (three: two at the rear, one per wheel, and one at the front), as factory engines
// and real cars. They live in their own tables, joined to the combustion ones only where a player picks a car or an
// engine (FACTORY_ENGINES, FACTORY_CARS): the suite's sweeps over VEHICLE_PRESETS and PRESETS are combustion checks.
//
// What is matched, as the combustion cars are matched (tests/test41.mjs): mass, drag, frontal area, tyres, the
// reduction and the governed top speed, the pack (chemistry, cells in series, capacity, year) and each motor's
// torque or power, set from the published figures: the Model 3 RWD's 420 Nm, the Model Y's 326 Nm rear and 219 Nm front,
// the Plaid's 295 kW a motor. What is derived and checked against the published figures
// (tests/test101.mjs): the 0-100 and the top speed. The rear magnet motor is the Model 3's as MotorXP measured it
// (src/js/electric.js); the front induction unit of the Model 3 and Model Y is sized to its published 219 Nm and
// 137 kW at 6380 rpm on 320 V; the Plaid's three are carbon-sleeved magnet motors (the sleeve is what lets a rotor this
// size reach 20,000 rpm), each sized to its rated 295 kW with the turns for the ~1,420 Nm the three are credited with
// together. The Plaid's rear has no differential: a motor per wheel gives each its own torque, which the model's
// nearest diff is the clutch-plate LSD (full traction off the line).
const EV_ENGINE_PRESETS=[
  {cat:'Electric',name:'Tesla Model 3 RWD drive (2021, LFP)',engine:{type:'electric',evMotorType:'pm',evRotorD:150,evStack:134,evPoles:6,evTurns:12,
    evMagnet:'ndfeb',evRetention:'bridges',evCooling:'spray',evMaxRpm:18000,evInverter:'sic',evAmps:1000,evRearCount:1,evFront:'none',
    evChem:'lfp',evSeries:106,evKWh:60,evYear:2021}},
  {cat:'Electric',name:'Tesla Model Y Long Range drive (2022, dual motor)',engine:{type:'electric',evMotorType:'pm',evRotorD:150,evStack:134,evPoles:6,evTurns:12,
    evMagnet:'ndfeb',evRetention:'bridges',evCooling:'spray',evMaxRpm:18000,evInverter:'sic',evAmps:720,evRearCount:1,
    evFront:'im',evFrontD:140,evFrontStack:110,evFrontPoles:4,evFrontTurns:20,evFrontAmps:520,
    evChem:'nca',evSeries:96,evKWh:78,evYear:2022}},
  {cat:'Electric',name:'Tesla Model S Plaid drive (2021, three motors)',engine:{type:'electric',evMotorType:'pm',evRotorD:150,evStack:134,evPoles:6,evTurns:16,
    evMagnet:'ndfebDy',evRetention:'sleeve',evCooling:'spray',evMaxRpm:20000,evInverter:'sic',evAmps:900,evRearCount:2,
    evFront:'pm',evFrontD:150,evFrontStack:134,evFrontPoles:6,evFrontTurns:16,evFrontAmps:900,
    evChem:'ncaP',evSeries:110,evKWh:100,evYear:2021}}
];
// real: the maker's 0-100 (s) and top speed (km/h, governed on all three). fit.fd is the published reduction (the owner's
// manuals: 9.03 the Model 3 and Y, 7.56 on all three of the Plaid's units, each of its motors rated 295 kW).
const EV_VEHICLE_PRESETS=[
  {cat:'Electric',name:'Tesla Model 3 RWD (2021)',engine:'Tesla Model 3 RWD drive (2021, LFP)',chassis:'sedan',
   body:{kg:1701,cd:0.23,area:2.22,wb:2.875,fWt:0.47},fit:{drive:'rwd',tire:'eco',tw:235,ta:45,wheel:18,brake:'steel',rotor:320,susp:'comfort',diff:'open',fd:9.03},
   real:{t100:6.1,top:225,limited:true},unsure:['fWt']},
  {cat:'Electric',name:'Tesla Model Y Long Range (2022)',engine:'Tesla Model Y Long Range drive (2022, dual motor)',chassis:'suv',
   body:{kg:1979,cd:0.23,area:2.56,wb:2.89,fWt:0.49},fit:{drive:'awd',tire:'eco',tw:255,ta:45,wheel:19,brake:'steel',rotor:335,susp:'comfort',diff:'open',fd:9.03},
   real:{t100:5.0,top:217,limited:true},unsure:['area','fWt']},
  {cat:'Electric',name:'Tesla Model S Plaid (2021)',engine:'Tesla Model S Plaid drive (2021, three motors)',chassis:'sedan',
   body:{kg:2162,cd:0.208,area:2.34,wb:2.96,fWt:0.48},fit:{drive:'awd',tire:'sport',tw:295,twF:265,ta:30,wheel:21,brake:'big',rotor:380,susp:'sport',diff:'clsd',fd:7.56},
   real:{t100:2.1,top:322,limited:true},note:'0-100 is Tesla\'s figure, which takes a one-foot rollout off the start',unsure:['area','fWt']}
];
// Hybrids (build 186, step 3 of the plan; decision 14). The Hyundai Ioniq Hybrid (2016): a 1.6 GDi Atkinson-cycle four
// (Kappa, 72 x 97 mm, 13:1, 105 PS at 5700 rpm, 147 Nm) with a 32 kW / 170 Nm P2 motor between its clutch and its
// six-speed DCT, and a 1.56 kWh, 240 V lithium-polymer pack: 104 kW and 265 Nm together. The motor is sized to those
// figures (src/js/hybrid.js, HYB_DEFAULT); the engine is its geometry, which on the model's cams (none is an Atkinson
// cam yet) makes ~116 hp, not 104 (tests/test103.mjs checks the car both as built and matched to the published power).
const HYB_ENGINE_PRESETS=[
  {cat:'Hybrid',name:'Hyundai Kappa 1.6 GDi + P2 (Ioniq Hybrid)',real:{hp:103.6,hpRpm:5700,tq:147,tqRpm:4000,motorKW:32,motorNm:170,sysKW:104,sysNm:265},
   unsure:['redline','cam'],engine:{type:'petrol4',cylinders:4,bore_mm:72,stroke_mm:97,compression:13,redline:6250,intake:'na',injector:'direct',vvt:true,
    cam:'stock',valves:4,octane:95,airFilter:'stock',exhaust:'stock',cat:'stock',intakeSys:'efi',hyMode:'p2',hyDeploy:'eco',
    evMotorType:'pm',evRotorD:200,evStack:40,evPoles:12,evTurns:28,evMagnet:'ndfeb',evRetention:'bridges',evCooling:'jacket',evMaxRpm:8000,
    evInverter:'igbt',evAmps:400,evRearCount:1,evFront:'none',evChem:'liHEV',evSeries:64,evKWh:1.56,evYear:2016}},
  // The Toyota Prius, 4th generation (2016; build 189, step 3.3): the 2ZR-FXE, a 1.8 port-injected Atkinson-cycle four
  // (80.5 x 88.3 mm, 13.0:1, 72 kW at 5200 rpm, 142 Nm at 3600), in the P610 power-split transaxle (src/js/power-split.js)
  // with a 53 kW / 163 Nm MG2 and a 1.31 kWh NiMH pack of 28 modules (201.6 V): 90 kW together (Toyota GB's
  // technical specification).
  {cat:'Hybrid',name:'Toyota 2ZR-FXE 1.8 + power-split (Prius)',real:{hp:96.6,hpRpm:5200,tq:142,tqRpm:3600,motorKW:53,motorNm:163,sysKW:90},
   unsure:['redline'],engine:{type:'petrol4',cylinders:4,bore_mm:80.5,stroke_mm:88.3,compression:13,redline:5500,intake:'na',injector:'port',vvt:true,
    cam:'atkinson',valves:4,octane:95,airFilter:'stock',exhaust:'stock',cat:'stock',intakeSys:'efi',hyMode:'ps',hyDeploy:'full',
    evMotorType:'pm',evRotorD:150,evStack:60,evPoles:8,evTurns:100,evMagnet:'ndfeb',evRetention:'bridges',evCooling:'jacket',evMaxRpm:17000,
    evInverter:'igbt',evAmps:100,evRearCount:1,evFront:'none',evChem:'nimhHEV',evSeries:168,evKWh:1.31,evYear:2016}}
];
const HYB_VEHICLE_PRESETS=[
  {cat:'Hybrid',name:'Hyundai Ioniq Hybrid (2016)',engine:'Hyundai Kappa 1.6 GDi + P2 (Ioniq Hybrid)',chassis:'hatch',
   body:{kg:1370,cd:0.24,area:2.22,wb:2.70,fWt:0.60},fit:{drive:'fwd',tire:'eco',tw:195,ta:65,wheel:15,brake:'steel',rotor:280,susp:'comfort',gears:6,gearbox:'dct',diff:'open'},
   real:{t100:10.8,top:185,limited:true},unsure:['kg','fWt']},
  // MG2 to the wheels 10.84:1 (65:17 to the counter gear, 2.834 differential), 195/65 R15 tyres, Cd 0.24, 1375 kg;
  // 0-100 km/h 10.6 s and 180 km/h (Toyota GB).
  {cat:'Hybrid',name:'Toyota Prius (2016)',engine:'Toyota 2ZR-FXE 1.8 + power-split (Prius)',chassis:'hatch',
   body:{kg:1375,cd:0.24,area:2.18,wb:2.70,fWt:0.60},fit:{drive:'fwd',tire:'eco',tw:195,ta:65,wheel:15,brake:'steel',rotor:255,susp:'comfort',diff:'open',fd:10.84},
   real:{t100:10.6,top:180,limited:true},unsure:['area','fWt']}
];
// What a player picks from: the combustion tables, then the electric and hybrid ones.
const FACTORY_ENGINES=PRESETS.concat(EV_ENGINE_PRESETS,HYB_ENGINE_PRESETS), FACTORY_CARS=VEHICLE_PRESETS.concat(EV_VEHICLE_PRESETS,HYB_VEHICLE_PRESETS);
const FACTORY_ENGINE_CATS=PRESET_CATS.concat(['Electric','Hybrid']), FACTORY_CAR_CATS=VEHICLE_CATS.concat(['Electric','Hybrid']);
