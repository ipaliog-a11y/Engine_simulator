// The body of every real car, for a 3D model later (build 272, phase E step 6 of plans/road-to-v1.md).
//
// len, w, h: overall length, width without mirrors and height, in m. tyF, tyR: the tyre on each axle
// (width/aspect R rim, in inches); rimF, rimR: the rim's width in inches, where the page pairs one with that tyre.
// ovF: the front overhang in m, only where the source publishes both overhangs and they add up with its
// wheelbase to its length; elsewhere carDims() splits (len - wheelbase) as CAR_PROFILES reads the side view.
// src: 'ad:<page>' is auto-data.net/en/<page>, the car's own page on a database of makers' figures;
// 'wp:<Article>' is the spec box of that English Wikipedia article. Read in November 2026.
// unsure names what is not that page's figure for this car:
//   len, wb: the page is more than 20 mm (10 mm) from the length CAR_PROFILES (the wheelbase the preset) carries;
//   w, h:    the page is a sibling body's (a base model's, or a later version's);
//   tyres:   the page does not list the size the preset is fitted with; tyF and tyR are then built from the
//            preset's fit, and on a staggered car the front's aspect and rim are the rear's (not published here).
// A field left out was not found: carDims() then gives the profile's length and height, and no width.
// The wheelbase and the tracks are not repeated here: the preset and SUSP_REAL hold them.
const CAR_DIMS={
  'Suzuki Alto Works (HA36S, 2015)':{len:3.395,w:1.475,h:1.475,tyF:'165/55R15',tyR:'165/55R15',src:'ad:suzuki-alto-viii-0.7-52hp-4wd-automatic-35907',unsure:['h','tyres']},
  'Toyota Aygo 1.0 (2014)':{len:3.455,w:1.615,h:1.460,tyF:'165/65R14',tyR:'165/65R14',src:'ad:toyota-aygo-ii-1.0-vvt-i-69hp-21940',unsure:['tyres']},
  'Fiat 500 TwinAir 85 (2011)':{len:3.546,w:1.627,h:1.488,tyF:'185/55R15',tyR:'185/55R15',src:'ad:fiat-500-312-0.9-twin-air-85hp-start-stop-18352'},
  'Ford Fiesta 1.0 EcoBoost 125 (2013)':{len:3.969,w:1.722,h:1.495,tyF:'195/55R15',tyR:'195/55R15',rimF:6,rimR:6,src:'ad:ford-fiesta-vii-mk7-facelift-2012-3-door-1.0-ecoboost-125hp-46883'},
  'VW Golf GTI (Mk7, 2013)':{len:4.268,w:1.799,h:1.442,tyF:'225/45R17',tyR:'225/45R17',rimF:7.5,rimR:7.5,src:'ad:volkswagen-golf-vii-5-door-gti-2.0-tsi-220hp-18409'},
  'Toyota GR Yaris (2020)':{len:3.995,w:1.805,h:1.455,ovF:0.830,tyF:'225/40R18',tyR:'225/40R18',src:'ad:toyota-yaris-xp210-gr-1.6-261hp-gr-four-38960'},
  'Honda Civic Type R (FK8, 2017)':{len:4.557,w:1.877,h:1.434,tyF:'245/30R20',tyR:'245/30R20',rimF:8.5,rimR:8.5,src:'ad:honda-civic-type-r-fk8-2.0-320hp-31022'},
  'Mazda MX-5 1.6 (NA, 1989)':{len:3.975,w:1.675,h:1.230,tyF:'185/60R14',tyR:'185/60R14',rimF:5.5,rimR:5.5,src:'ad:mazda-mx-5-i-na-1.6-115hp-11261'},
  'Toyota Corolla Levin GT-APEX (AE86)':{len:4.200,w:1.645,h:1.335,tyF:'185/60R14',tyR:'185/60R14',src:'ad:toyota-corolla-coupe-v-e80-1.6-gt-16v-124hp-3403',unsure:['h','tyres']},
  'Honda S2000 (AP1, 2000)':{len:4.135,w:1.750,h:1.270,tyF:'205/50R16',tyR:'225/50R16',src:'ad:honda-s2000-ap1-2.0-240hp-12368',unsure:['tyres']},
  'BMW M3 (E46, 2000)':{len:4.492,w:1.780,h:1.372,tyF:'225/45R18',tyR:'255/40R18',rimF:8,rimR:9,src:'ad:bmw-m3-coupe-e46-3.2i-24v-343hp-9872'},
  'Porsche 911 GT3 (991.2, 2017)':{len:4.562,w:1.852,h:1.271,tyF:'245/35R20',tyR:'305/30R20',rimF:9,rimR:12,src:'ad:porsche-911-991-ii-gt3-4.0-500hp-29495'},
  'Toyota Supra RZ (A80, 1993)':{len:4.520,w:1.810,h:1.275,tyF:'235/40R17',tyR:'255/40R17',src:'ad:toyota-supra-iv-a80-3.0i-24v-t-turbo-330hp-3454',unsure:['tyres','wb']},
  'Nissan Skyline GT-R V-spec (R34, 1999)':{len:4.600,w:1.785,h:1.360,tyF:'245/40R18',tyR:'245/40R18',src:'ad:nissan-skyline-gt-r-x-r34-2.6-i-24v-turbo-4wd-280hp-360'},
  'Subaru Impreza WRX STI (GD, 2004)':{len:4.415,w:1.740,h:1.440,tyF:'225/45R17',tyR:'225/45R17',rimF:7.5,rimR:7.5,src:'ad:subaru-impreza-ii-facelift-2002-wrx-sti-2.0-265hp-awd-16082'},
  'Mitsubishi Lancer Evolution IX (2006)':{len:4.534,w:1.770,h:1.450,tyF:'235/45R17',tyR:'235/45R17',rimF:8,rimR:8,src:'ad:mitsubishi-lancer-evolution-ix-2.0-mivec-286hp-4wd-44889',unsure:['len']},
  'Audi RS3 Sportback (8V, 2017)':{len:4.335,w:1.800,h:1.411,ovF:0.886,tyF:'235/35R19',tyR:'235/35R19',src:'ad:audi-rs3-sportback-8va-facelift-2017-2.5-tfsi-400hp-quattro-s-tronic-27853'},
  'Chevrolet Corvette (C6, LS3, 2008)':{len:4.435,w:1.845,h:1.245,tyF:'245/40R18',tyR:'285/35R19',src:'ad:chevrolet-corvette-coupe-c6-6.2i-v8-437hp-14520'},
  'Chevrolet Corvette Z06 (C6, 2006)':{len:4.460,w:1.928,h:1.237,tyF:'275/30R19',tyR:'325/30R19',src:'ad:chevrolet-corvette-coupe-c6-z06-7.0-i-v8-505hp-14521',unsure:['len','tyres']},
  'Ford Mustang GT (2018)':{len:4.788,w:1.915,h:1.379,tyF:'255/40R19',tyR:'275/40R19',src:'ad:ford-mustang-vi-facelift-2017-gt-5.0-ti-vct-v8-460hp-32161',unsure:['tyres']},
  'Dodge Challenger SRT Hellcat (2015)':{len:5.017,w:1.923,h:1.448,tyF:'275/40R20',tyR:'275/40R20',rimF:9.5,rimR:9.5,src:'ad:dodge-challenger-iii-facelift-2014-srt-hellcat-6.2-hemi-v8-707hp-32897'},
  'Ferrari F355 Berlinetta (1994)':{len:4.250,w:1.900,h:1.170,ovF:1.032,tyF:'225/40R18',tyR:'265/40R18',rimF:7.5,rimR:10,src:'ad:ferrari-f355-berlinetta-3.5-v8-380hp-6561'},
  'Lamborghini Diablo VT (1993)':{len:4.460,w:2.040,h:1.105,tyF:'235/30R18',tyR:'335/30R18',src:'ad:lamborghini-diablo-vt-5.7-v12-492hp-4wd-3091',unsure:['tyres']},
  'McLaren F1 (1994)':{len:4.287,w:1.820,h:1.140,ovF:0.970,tyF:'235/45R17',tyR:'315/45R17',rimF:9,rimR:11.5,src:'ad:mclaren-f1-6.1-v12-627hp-11837'},
  'Porsche 911 Turbo (993, 1995)':{len:4.245,w:1.795,h:1.285,tyF:'225/40R18',tyR:'285/30R18',rimF:8,rimR:10,src:'ad:porsche-911-993-turbo-3.6-408hp-6611'},
  'Ferrari Enzo (2002)':{len:4.702,w:2.035,h:1.147,tyF:'245/35R19',tyR:'345/35R19',rimF:9,rimR:13,src:'ad:ferrari-enzo-6.0-v12-660hp-6543'},
  'Porsche Carrera GT (2004)':{len:4.613,w:1.921,h:1.166,tyF:'265/35R20',tyR:'335/30R20',src:'ad:porsche-carrera-gt-5.7-i-v10-40v-612hp-6692'},
  'Ford GT (2005)':{len:4.645,w:1.955,h:1.125,tyF:'235/45R18',tyR:'315/40R19',rimF:9,rimR:11.5,src:'ad:ford-gt-5.4-i-v8-32v-557hp-8083'},
  'Lamborghini Murciélago LP640 (2006)':{len:4.610,w:2.058,h:1.135,tyF:'245/30R18',tyR:'335/30R18',src:'ad:lamborghini-murcielago-lp640-6.5-v12-48v-640hp-3096',unsure:['tyres']},
  'Ferrari 458 Italia (2010)':{len:4.527,w:1.937,h:1.213,tyF:'235/35R20',tyR:'295/35R20',rimF:8.5,rimR:10.5,src:'ad:ferrari-458-italia-4.5-v8-570hp-18350'},
  'Lamborghini Huracán LP610-4 (2014)':{len:4.459,w:1.924,h:1.165,tyF:'245/30R20',tyR:'305/30R20',rimF:8.5,rimR:11,src:'ad:lamborghini-huracan-lp-610-4-5.2-v10-610hp-awd-ldf-22766'},
  'McLaren 720S (2017)':{len:4.543,w:1.930,h:1.196,tyF:'245/35R19',tyR:'305/30R20',rimF:9,rimR:11,src:'ad:mclaren-720s-4.0-v8-720hp-ssg-28867'},
  'Ferrari 812 Superfast (2017)':{len:4.657,w:1.971,h:1.276,tyF:'275/35R20',tyR:'315/35R20',rimF:10,rimR:11.5,src:'ad:ferrari-812-superfast-6.5-v12-800hp-dct-29728'},
  'Porsche 911 Turbo S (992, 2020)':{len:4.535,w:1.900,h:1.303,tyF:'255/35R20',tyR:'315/30R21',rimF:9,rimR:11.5,src:'ad:porsche-911-992-turbo-s-3.8-650hp-pdk-39256'},
  'Lamborghini Huracán STO (2021)':{len:4.549,w:1.945,h:1.220,tyF:'245/30R20',tyR:'305/30R20',rimF:8.5,rimR:11,src:'ad:lamborghini-huracan-sto-facelift-2020-5.2-v10-640hp-ldf-41726',unsure:['len']},
  'Chevrolet Corvette Z06 (C8, 2023)':{len:4.688,w:2.025,h:1.235,tyF:'275/30R20',tyR:'345/25R21',src:'ad:chevrolet-corvette-coupe-c8-z06-5.5-v8-670hp-m1l-44901'},
  'McLaren 750S (2023)':{len:4.569,w:1.930,h:1.196,tyF:'245/35R19',tyR:'305/30R20',rimF:9,rimR:11,src:'ad:mclaren-750s-4.0-v8-750hp-ssg-48465'},
  'Mazda RX-7 (FD, 1993)':{len:4.295,w:1.760,h:1.230,tyF:'225/55R16',tyR:'225/55R16',src:'ad:mazda-rx-7-iii-fd-wankel-twin-turbo-255hp-11128'},
  'Mazda RX-8 (2004)':{len:4.430,w:1.770,h:1.340,tyF:'225/45R18',tyR:'225/45R18',rimF:8,rimR:8,src:'ad:mazda-rx-8-1.3-wankel-231hp-43373'},
  'VW Golf 2.0 TDI 150 (Mk7, 2013)':{len:4.255,w:1.799,h:1.452,tyF:'205/55R16',tyR:'205/55R16',src:'ad:volkswagen-golf-vii-5-door-2.0-tdi-150hp-17894',unsure:['tyres']},
  'BMW 330d (F30, 2012)':{len:4.624,w:1.811,h:1.429,tyF:'225/50R17',tyR:'225/50R17',rimF:7.5,rimR:7.5,src:'ad:bmw-3-series-sedan-f30-330d-258hp-steptronic-17737'},
  'Chevrolet Silverado 2500HD Duramax (2020)':{len:6.349,w:2.079,h:2.027,tyF:'265/70R17',tyR:'265/70R17',rimF:7.5,rimR:7.5,src:'ad:chevrolet-silverado-2500-hd-iv-t1xx-crew-cab-standard-bed-6.6-duramax-v8-445hp-4wd-automatic-37541',unsure:['wb']},
  'BMW X5 M (F85, 2015)':{len:4.880,w:1.985,h:1.754,tyF:'285/40R20',tyR:'325/35R20',rimF:10,rimR:11.5,src:'ad:bmw-x5-m-f85-4.4-v8-575hp-xdrive-steptronic-25270'},
  'Porsche Cayenne Turbo (958.2, 2014)':{len:4.855,w:1.939,h:1.702,tyF:'265/50R19',tyR:'265/50R19',rimF:8.5,rimR:8.5,src:'ad:porsche-cayenne-ii-facelift-2014-turbo-4.8-v8-520hp-tiptronic-21439'},
  'Lamborghini Urus (2018)':{len:5.112,w:2.016,h:1.638,tyF:'285/45R21',tyR:'315/40R21',rimF:9.5,rimR:10.5,src:'ad:lamborghini-urus-4.0-v8-650hp-4wd-automatic-32263'},
  'Jeep Grand Cherokee SRT (WK2, 2014)':{len:4.859,w:1.958,h:1.756,tyF:'295/45R20',tyR:'295/45R20',src:'ad:jeep-grand-cherokee-iv-wk2-facelift-2013-srt-6.4-v8-476hp-4x4-automatic-31186',unsure:['len']},
  'Toyota Land Cruiser 200 VX 4.5 D-4D (2015)':{len:4.950,w:1.970,h:1.865,tyF:'285/60R18',tyR:'285/60R18',src:'ad:toyota-land-cruiser-j200-facelift-2013-4.5d-v8-272hp-automatic-18527',unsure:['tyres']},
  'Radical SR3 RSX 1500 (2015)':{tyF:'200/50R15',tyR:'275/50R15',src:'wp:Radical_SR3',unsure:['tyres']},
  'BAC Mono 2.3 (2011)':{len:3.952,w:1.836,h:1.110,tyF:'200/45R16',tyR:'250/45R16',src:'ad:bac-mono-2.5-305hp-automatic-32126',unsure:['h','tyres']},
  'Nissan 370Z (Z34, 2009)':{len:4.250,w:1.845,h:1.310,ovF:0.840,tyF:'225/50R18',tyR:'245/45R18',rimF:8,rimR:9,src:'ad:nissan-370z-3.7-328hp-664'},
  'Honda NSX (NA1, 1991)':{len:4.405,w:1.810,h:1.170,tyF:'205/55R16',tyR:'225/50R16',src:'ad:honda-nsx-i-coupe-3.0-24v-vtec-na1-274hp-12365'},
  'Ford F-150 Raptor (2017)':{len:5.890,w:2.192,h:1.994,ovF:0.942,tyF:'315/70R17',tyR:'315/70R17',src:'ad:ford-f-series-f-150-xiii-supercrew-facelift-2018-raptor-3.5-v6-450hp-4x4-automatic-32525',unsure:['tyres','wb']},
  'Nissan GT-R (R35, 2017)':{len:4.710,w:1.895,h:1.370,tyF:'255/40R20',tyR:'285/35R20',rimF:9.5,rimR:10.5,src:'ad:nissan-gt-r-r35-facelift-2016-3.8-v6-570hp-awd-dct-25701'},
  'Alfa Romeo Giulia Quadrifoglio (2017)':{len:4.639,w:1.873,h:1.426,ovF:0.795,tyF:'245/35R19',tyR:'285/30R19',rimF:8.5,rimR:10,src:'ad:alfa-romeo-giulia-952-quadrifoglio-2.9-v6-510hp-23700'},
  'Nissan 300ZX Twin Turbo (Z32, 1990)':{w:1.800,h:1.255,tyF:'225/50R16',tyR:'245/45R16',src:'ad:nissan-300-zx-z32-3.0-twin-turbo-283hp-534',unsure:['len']},
  'Buick GNX (1987)':{len:5.095,w:1.819,h:1.387,tyF:'245/50R16',tyR:'255/50R16',src:'ad:buick-regal-ii-coupe-facelift-1981-3.8-v6-280hp-automatic-30613',unsure:['h']},
  'Ferrari Dino 246 GT (1969)':{len:4.235,w:1.700,h:1.135,tyF:'205/70R14',tyR:'205/70R14',src:'wp:Dino_206_GT_and_246_GT',unsure:['tyres']},
  'Ferrari F40 (1987)':{len:4.358,w:1.970,h:1.124,ovF:1.048,tyF:'245/40R17',tyR:'335/35R17',rimF:8,rimR:13,src:'ad:ferrari-f40-2.9-i-v8-32v-478hp-6524',unsure:['len']},
  'Jaguar E-Type 3.8 FHC (Series 1, 1961)':{len:4.453,w:1.657,h:1.222,tyF:'185/80R15',tyR:'185/80R15',src:'wp:Jaguar_E-Type',unsure:['tyres']},
  'Ford Mustang Fastback 289 (1965)':{len:4.613,w:1.732,h:1.298,tyF:'175/80R14',tyR:'175/80R14',src:'ad:ford-mustang-i-hardtop-4.7-v8-210hp-7807',unsure:['tyres']},
  'Porsche 911 Carrera RS 2.7 Sport (1973)':{len:4.147,w:1.652,h:1.320,tyF:'215/60R15',tyR:'235/60R15',src:'ad:porsche-911-coupe-f-carrera-rs-2.7-210hp-6643',unsure:['tyres']},
  'BMW M3 (E30, 1986)':{len:4.345,w:1.680,h:1.370,tyF:'205/55R15',tyR:'205/55R15',rimF:7,rimR:7,src:'ad:bmw-m3-coupe-e30-2.3-200hp-30376'},
  'Volkswagen Golf GTI (Mk1, 1976)':{len:3.723,w:1.610,h:1.410,tyF:'175/70R13',tyR:'175/70R13',src:'ad:volkswagen-golf-i-3-door-1.8-gti-112hp-8798',unsure:['tyres']},
  'Ferrari 365 GTB/4 Daytona (1968)':{len:4.425,w:1.760,h:1.245,tyF:'215/70R15',tyR:'215/70R15',rimF:7.5,rimR:7.5,src:'ad:ferrari-365-gtb4-daytona-4.4-v12-352hp-47117'},
  'Lamborghini Countach LP400 (1974)':{len:4.140,w:1.890,h:1.070,ovF:0.933,tyF:'205/70R14',tyR:'215/70R14',src:'ad:lamborghini-countach-lp400-375hp-3072'},
  'Audi Sport quattro (1984)':{len:4.160,w:1.780,h:1.345,tyF:'225/50R15',tyR:'225/50R15',src:'ad:audi-quattro-typ-85-sport-2.1-20v-turbo-306hp-4901',unsure:['tyres']},
  'Mercedes-Benz 190E 2.3-16 (1984)':{len:4.430,w:1.678,h:1.390,tyF:'205/55R15',tyR:'205/55R15',src:'ad:mercedes-benz-190-w201-e-2.3-16-185hp-12814 + wp:Mercedes-Benz_W201',unsure:['h','w']},
  'Peugeot 205 GTI 1.9 (1986)':{len:3.705,w:1.572,h:1.373,ovF:0.680,tyF:'185/55R15',tyR:'185/55R15',src:'ad:peugeot-205-i-20a-c-facelift-1987-3-door-1.9-gti-130hp-5662'},
  'Ford Sierra RS Cosworth (1986)':{len:4.460,w:1.730,h:1.380,tyF:'205/50R15',tyR:'205/50R15',src:'wp:Ford_Sierra_RS_Cosworth',unsure:['tyres']},
  'Lancia Delta HF Integrale Evoluzione (1992)':{len:3.898,w:1.767,h:1.365,ovF:0.762,tyF:'205/45R16',tyR:'205/45R16',rimF:7.5,rimR:7.5,src:'ad:lancia-delta-i-831-facelift-1991-hf-integrale-evo-2.0-16v-215hp-4wd-5072'},
  'Honda Integra Type R (DC2, 1995)':{len:4.380,w:1.695,h:1.335,tyF:'195/55R15',tyR:'195/55R15',src:'ad:honda-integra-iii-dc2-1.8-i-180hp-12121'},
  'Lotus Elise (S1, 1996)':{len:3.726,w:1.701,h:1.202,tyF:'185/55R16',tyR:'205/50R16',src:'ad:lotus-elise-series-1-1.8-i-16v-120hp-8296'},
  'BMW M5 (E39, 2000)':{len:4.784,w:1.800,h:1.437,tyF:'245/40R18',tyR:'275/35R18',rimF:8,rimR:9.5,src:'ad:bmw-m5-e39-lci-facelift-2000-4.9-v8-400hp-46225'},
  'Trabant 601 S (1988)':{len:3.510,w:1.510,h:1.440,tyF:'145/80R13',tyR:'145/80R13',src:'ad:trabant-p-601-0.6-26hp-5108',unsure:['h','len']},
  'Honda S660 (2015)':{len:3.395,w:1.475,h:1.180,tyF:'165/55R15',tyR:'195/45R16',src:'ad:honda-s660-0.7i-64hp-36543'},
  'Honda Beat (1991)':{len:3.295,w:1.395,h:1.175,tyF:'155/60R13',tyR:'165/60R13',src:'wp:Honda_Beat',unsure:['tyres']},
  'Suzuki Cappuccino (EA11R, 1991)':{len:3.295,w:1.395,h:1.185,tyF:'165/65R14',tyR:'165/65R14',src:'ad:suzuki-cappuccino-0.7-i-12v-turbo-64hp-16503'},
  'Ford Focus RS (Mk3, 2016)':{len:4.390,w:1.823,h:1.472,tyF:'235/35R19',tyR:'235/35R19',rimF:8,rimR:8,src:'ad:ford-focus-iii-hatchback-facelift-2014-rs-2.3-ecoboost-350hp-awd-24929'},
  'Renault Mégane R.S. Trophy (2018)':{len:4.372,w:1.874,h:1.445,ovF:0.916,tyF:'245/35R19',tyR:'245/35R19',rimF:8.5,rimR:8.5,src:'ad:renault-megane-iv-rs-trophy-1.8-300hp-33897'},
  'Suzuki Swift Sport (ZC33S, 2018)':{len:3.890,w:1.735,h:1.495,tyF:'195/50R17',tyR:'195/50R17',rimF:6.5,rimR:6.5,src:'ad:suzuki-swift-vi-sport-1.4-140hp-32530'},
  'Honda Civic Type R (EK9, 1997)':{len:4.180,w:1.695,h:1.360,tyF:'195/55R15',tyR:'195/55R15',rimF:6,rimR:6,src:'ad:honda-civic-type-r-ek9-1.6-185hp-47228'},
  'Toyota GR86 (2022)':{len:4.265,w:1.775,h:1.310,tyF:'215/40R18',tyR:'215/40R18',rimF:7.5,rimR:7.5,src:'ad:toyota-86-ii-gr-2.4-d-4s-235hp-43105'},
  'Porsche 718 Cayman GT4 (2020)':{len:4.456,w:1.801,h:1.269,tyF:'245/35R20',tyR:'295/30R20',rimF:8.5,rimR:11,src:'ad:porsche-718-cayman-982-gt4-4.0-420hp-41345'},
  'BMW M2 Competition (F87, 2018)':{len:4.461,w:1.854,h:1.410,tyF:'245/35R19',tyR:'265/35R19',rimF:9,rimR:10,src:'ad:bmw-m2-coupe-f87-competition-3.0-410hp-33006'},
  'Ariel Atom 3.5 (2013)':{len:3.410,w:1.890,h:1.195,tyF:'195/50R15',tyR:'225/50R15',src:'wp:Ariel_Atom',unsure:['len','tyres']},
  'Mazda MX-5 2.0 (ND, 2015)':{len:3.915,w:1.735,h:1.230,tyF:'205/45R17',tyR:'205/45R17',src:'ad:mazda-mx-5-iv-nd-2.0-skyactiv-g-160hp-23233',unsure:['tyres']},
  'Dodge Viper SRT-10 (2008)':{len:4.459,w:1.911,h:1.210,tyF:'275/35R18',tyR:'345/30R19',rimF:10,rimR:13,src:'ad:dodge-viper-zb-ii-coupe-srt10-8.4-v10-600hp-43065'},
  'Mercedes-AMG C63 (W204, 2008)':{len:4.725,w:1.795,h:1.438,tyF:'235/40R18',tyR:'255/35R18',rimF:8,rimR:9,src:'ad:mercedes-benz-c-class-w204-amg-c-63-v8-457hp-7g-tronic-amg-speedshift-plus-12549'},
  'Ram 2500 HO Cummins (2019)':{len:6.067,h:2.037,tyF:'275/70R18',tyR:'275/70R18',rimF:8,rimR:8,src:'ad:ram-2500-3500-crew-cab-ii-dt-2500-6.7-cummins-td-370hp-4x4-automatic-35540',unsure:['len']},
  'Toyota Hilux 2.8 D-4D (2016)':{len:5.330,w:1.855,h:1.815,ovF:1.000,tyF:'265/65R17',tyR:'265/65R17',rimF:7.5,rimR:7.5,src:'ad:toyota-hilux-double-cab-viii-facelift-2017-2.8d-177hp-4x4-33329'},
  'Volkswagen Amarok 3.0 V6 TDI (2018)':{len:5.254,w:1.954,h:1.834,ovF:0.898,tyF:'255/55R19',tyR:'255/55R19',src:'ad:volkswagen-amarok-i-double-cab-facelift-2016-3.0-v6-tdi-224hp-4motion-automatic-27100',unsure:['tyres']},
  'Chevrolet Camaro ZL1 (2017)':{len:4.784,w:1.897,h:1.330,tyF:'285/30R20',tyR:'305/30R20',src:'ad:chevrolet-camaro-vi-zl1-6.2-v8-650hp-30812',unsure:['tyres']},
  'Tesla Model 3 RWD (2021)':{len:4.694,w:1.849,h:1.443,ovF:0.841,tyF:'235/45R18',tyR:'235/45R18',src:'ad:tesla-model-3-facelift-2020-60-kwh-325hp-44977'},
  'Tesla Model Y Long Range (2022)':{len:4.751,w:1.921,h:1.624,ovF:0.875,tyF:'255/45R19',tyR:'255/45R19',rimF:9.5,rimR:9.5,src:'ad:tesla-model-y-long-range-78.1-kwh-347hp-54410'},
  'Tesla Model S Plaid (2021)':{len:5.021,w:1.987,h:1.431,ovF:0.961,tyF:'265/35R21',tyR:'295/30R21',rimF:9.5,rimR:10.5,src:'ad:tesla-model-s-facelift-2021-plaid-100-kwh-1020hp-tri-motor-awd-42385',unsure:['len']},
  'Hyundai Ioniq Hybrid (2016)':{len:4.470,w:1.820,h:1.450,tyF:'195/65R15',tyR:'195/65R15',rimF:6,rimR:6,src:'ad:hyundai-ioniq-1.6-gdi-141hp-hybrid-dct-30706'},
  'Toyota Prius (2016)':{len:4.540,w:1.760,h:1.470,tyF:'195/65R15',tyR:'195/65R15',rimF:6.5,rimR:6.5,src:'ad:toyota-prius-iv-xw50-1.8-vvt-i-122hp-hybrid-e-cvt-22776'},
  'Nissan Qashqai e-POWER (2022)':{len:4.425,w:1.835,h:1.625,tyF:'235/55R18',tyR:'235/55R18',rimF:7.5,rimR:7.5,src:'ad:nissan-qashqai-iii-j12-e-power-1.5-vc-t-190hp-full-hybrid-automatic-46241'},
  'BMW 330e (2020)':{len:4.709,w:1.827,h:1.444,tyF:'225/50R17',tyR:'225/50R17',rimF:7.5,rimR:7.5,src:'ad:bmw-3-series-sedan-g20-330e-292hp-plug-in-hybrid-steptronic-37654'},
  'Porsche 918 Spyder (2013)':{len:4.643,w:1.940,h:1.167,tyF:'265/35R20',tyR:'325/30R21',rimF:9.5,rimR:12.5,src:'ad:porsche-918-spyder-4.6-v8-887hp-hybrid-pdk-21380'},
};
// Everything a 3D body needs for one real car (a preset), in metres: plain data, no page needed.
// null for a car that is not in CAR_DIMS.
function carDims(p){
  const d=p&&CAR_DIMS[p.name];if(!d)return null;
  const pr=(typeof CAR_PROFILES!=='undefined'&&CAR_PROFILES[p.name])||{},b=p.body||{},f=factoryDims({chassis:p.chassis,body:Object.assign({name:p.name},b)});
  const len=d.len||pr.len,wb=f.wb,ov=len-wb;
  // the profile's front overhang is a share of its own (length - wheelbase): keep the share on this length
  const ovF=d.ovF||(pr.len>wb?pr.front/(pr.len-wb)*ov:ov/2);
  const ty=s=>{const m=/^(\d+)\/(\d+)R(\d+)$/.exec(s),w=m[1]/1000,rim=m[3]*0.0254;return {size:s,w,rim,dia:rim+2*w*m[2]/100};};
  return {name:p.name,len,w:d.w||null,h:d.h||pr.h||b.h||null,wb,ovF,ovR:ov-ovF,trackF:f.trackF,trackR:f.trackR,
    tyreF:ty(d.tyF),tyreR:ty(d.tyR),rimF:d.rimF||null,rimR:d.rimR||null,src:d.src,unsure:(d.unsure||[]).concat(d.ovF?[]:['overhang'])};
}
