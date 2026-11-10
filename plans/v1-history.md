# The v1.0 conversions so far: the working queue and the investigations

Moved out of `README.md` at build 259, unchanged. Finished work; the open work is in `plans/road-to-v1.md` and
`plans/fitted-register.json`.

## v1.0 — every number derived, not fitted

This is the current direction, and it is a change of principle rather than a feature list.

Parts of the model reach their accuracy through **lumped coefficients that were tuned until the
outputs matched reality** — `CAM{peakShift, ampMul, scav}`, `EXHAUST{topGain, lowLoss}`,
`TURBO{spool, flow}`, `IMEP_K` (retired from torque in build 95), `DIFF_ASYM0`, `KVCAP`. (Since retired:
`peakShift`, `scav`, `topGain`, `lowLoss` in the gas-dynamics conversion; `ampMul` survives only on the ported
engines.) They work, and they are honest
approximations, but they are fitted rather than derived: they encode *the answer* instead of the
mechanism that produces it.

v1.0 replaces them component by component with quantities derived from geometry and physical law,
and **accepts whatever accuracy that produces** rather than tuning back toward a target. A
first-principles model will very likely score worse at first — the present 2.66% RMS exists partly
*because* coefficients were fitted to produce it. The rule is that any regression must be
explainable, traceable to a component not yet modelled, and every component added must improve the
score.

Planned order, each validated against `tests/test41.mjs`, `tests/aero.mjs` and `tests/test43.mjs`:

#### The working queue — what is actually being built next

The five conversions above are the *structure*. This is the current running order, which changes as
measurement finds things. Each item is one PR.

| # | item | state | why it is in this position |
|---|---|---|---|
| 1 | Exhaust pumping work (PMEP) | ✅ build 70 | The missing **constraint**. Without it a tighter turbine housing cost nothing at the top end, so housing sizing could not be derived at all. |
| 2 | Residual-gas knock | ✅ build 75 | Back-pressure now brings on knock, so the petrol/diesel housing split falls out of physics. |
| — | Variable-geometry turbine | ✅ build 80 | The diesel spool gap was a VGT gap, not pulse energy. |
| — | Shift at the torque crossover | ✅ build 81 | Every car used to upshift at the redline; 0–100 RMS 24.4% → 10.2%. |
| — | Exhaust pulse energy | ✅ build 90 | The turbine fed by blowdown pulses, from cam timing and cylinder state; the prerequisite housing sizing kept running into. Small on presets with long tuned primaries. |
| 3 | Turbine housing sizing | ✅ build 91, as a choice | Not derivable: which side of the spool/top-end compromise to take is design intent, and every objective tried decided it silently (sweep time gave the GTI 287 hp vs 220). Shipped as TURBINE A/R (tight/stock/loose per frame), plus the real physics found on the way: turbo manifolds are packaging-short, not tuned headers. (The Alto's frame-size gap closed in build 136: the maker's wheel can be set, and it takes an RHF3-size 40 mm.) |
| — | Real-engine presets | ✅ build 96 | 28 real engines in 8 categories with the maker's figures; test60 reports the model against them (RMS 15.8% power). Exposed: NA engines breathe as well at 1000 rpm as at 4000; rotary displacement uses the piston formula. Vehicles next. |
| — | Real-car presets | ✅ build 97 | 26 real cars, each with its own body (curb mass, Cd, area, wheelbase, weight split) over its chassis class, paired with its factory engine; test61 reports them against the maker (0-100 RMS 13.9%, top speed 5.1%). Rotaries wait for the displacement fix; no vehicle speed governor yet. |
| — | Wall heat in the work | ✅ build 98 | The extra wall heat at low speed now comes out of the work as well as the exhaust, in the share set by when the walls take it (a Woschni flux over a traced cycle, κ ≈ 0.25 spark, 0.36 diesel). NA torque peaks move off 1000 rpm (Coyote 4700, real 4600). Next: derive the base exhaust share. |
| — | Speed limiter | ✅ build 99 | A removable road-speed governor (on/off + km/h); real cars arrive with their factory one. It holds the car at its set speed in the run and on track; removed, the car runs to its free top speed. Top-speed RMS over all 26 real cars 4.0%. |
| — | Rotary geometry | ✅ build 100 | Wankel displacement 3√3·e·R·W with an eccentricity input (was the piston formula on R and W: 804 cc for a 1308 cc 13B); ported engines draw a charge every turn in every flow rate; the rotary's thirst factor 1.48, which offset the half-rate air, is 1. Real 13B-REW and Renesis presets, RX-7 FD and RX-8 cars. Still fitted: the rotary's 0.70 IMEP factor (Renesis reads −31%). |
| — | Exhaust energy balance | ✅ build 101 | Exhaust share = 1 − work − wall (Woschni, traced) − port (Caton–Heywood) − unburned fuel, replacing "roughly a third". Mass-averaged gas drives the turbine and the vane limit; reported EGT is the thermocouple (time-averaged) reading. NA 818–938 C, turbo petrols 880–1048 C. Next: turbo manifold heat loss; the turbine throat convention. |
| — | UI pass 1 | ✅ build 102 | Compact form grid; family → build pickers for engines and cars; a strip showing the loaded engine and car; tyre rating warning refreshes, and (Y) has no ceiling. Next: garage tab, live timing. |
| — | Garage tab | ✅ build 103 | Saved cars and saved engines in their own tab, with VIEW / LOAD / DELETE; an engine loads into the current car; older saves appear as cars. Next: live timing. |
| — | Live timing | ✅ build 104 | The solved lap replayed in real time on the track map: car and trail, live clock and sector splits, speed/gear/rpm, throttle and brake, g-meter; 1×/2×/4×, pause, restart. Read off the lap solver's own recording. |
| — | Dynamics consistency | ✅ build 105 | Lap load transfer, aero balance by part, brake fade on the lap, diff scrub only in corners, engine swaps move the weight split. Next from the review: rotating inertia with launch energy, tyre load sensitivity. |
| — | Spinning parts | ✅ build 107 | Effective mass from engine (clutch-sized flywheel) and wheel inertia through the gearing; the clutch launch draws on the flywheel. 0-100 honestly slower (test48 6.2%). Next: brake temperatures, tyre load sensitivity, the manual shift time. |
| — | Brake temperature | ✅ build 108 | Rotor thermal model (mass from size, iron or carbon-ceramic, convective and radiative cooling, pad onset temperatures) replaces the fitted fade budget; live F/R temperatures with colour and fade on the track. Next: tyre load sensitivity. |
| — | Tyre grip from load | ✅ build 109 | Load sensitivity (tyre rating from its volume), lateral load transfer over the track width, roll and static camber; the chassis, suspension and width grip multipliers are gone. Challenge targets re-set. Next: compound μ vs skidpad data, brake build-up time. |
| — | Brake cooling | ✅ build 110 | Rotor faces at the car's speed, vented rotors pump air through their vanes as the wheel turns, big-brake/carbon kits add a front brake duct, radiation from the outside only (Limpert). A 911 GT3 rotor cools 600→300 C in ~100 s at 150 km/h, half the old time. |
| — | Tyre grip on asphalt | ✅ build 111 | Compound mu is the lateral figure on road asphalt (skidpads: sport cars 0.90-0.98 g, GT3 1.11 g); braking and traction take 1.15 of it (friction ellipse, RCVD). Next: brake pressure build-up time, the manual shift time. |
| — | Analog gauges | ✅ build 112 | Live timing can switch to analog instruments: rev counter, speedometer, and a boost gauge (manifold pressure vs atmosphere) on turbo and supercharged engines, also shown in the digital set. |
| — | Brakes from the hydraulics | ✅ build 113 | Brake torque from line pressure, caliper pistons, pad mu and rotor radius (no fitted peak g); 0.2 s pressure build-up in the stop; heavy-duty truck brakes. 100-0: small cars 38-40 m, GT3 31 m. Next: the manual shift time. |
| — | Lap brakes at the limit | ✅ build 114 | Braking-pass bug fixed: grip for braking is read at the speed being solved, not the cornering ceiling. Laps 6-22% faster; 911 GT3 Nordschleife 7:25 (real 7:12.7). |
| — | Minimum-time racing line | ✅ build 115 | Each car drives its own minimum-time line (local search with the lap solver's physics), minus its width, on a centripetal-spline centreline; late apexes emerge, the fitted bias is gone. GPS traces de-noised within 2.5 m. |
| — | Engine breathing | ✅ build 116 | Valve overlap sees a turbo's boost; overlap curtain from the cam; exhaust-wave friction from the boundary layers. Evo IX 290/286 hp. Open: turbo boost taper at high rpm, Z06/4A-GE/rotaries short. |
| — | Brake split, shifts on track | ✅ build 117 | Brake heat shared by the calipers' hydraulic split until ABS holds the saturated axle (fronts now hotter on the GT3/Huracan); upshifts on the power cut the drive in the lap solve, downshifts free. |
| — | Turbo lag on track | ✅ build 118 | The turbo's shaft is run along the lap (lift, braking and shifts bleed boost); the drive uses the boost actually built, and the replay gauge shows it. 0-0.08 s a lap. |
| — | Tyre cornering drag | ✅ build 119 | Slip-angle drag (m ay)^2/(CC N), cornering coefficient 0.2/deg (Gillespie): a resistance in every cornering step, used by the line optimiser too. |
| — | Faster turbo lap walk | ✅ build 120 | The lap's turbo shaft starts settled at the fastest point and steps at 10 ms (laps unchanged within 0.01 s): a turbo Nordschleife solve 1.36 -> 0.27 s. Lap per Dollar target 70 s. |
| — | Intake stroke integrated; gear held into braking | ✅ build 121 | The runner's air column, the valve curtain and the cylinder integrated from TDC to IVC: late-IVC loss, the charge's momentum and the tuning in one (NA power RMS ~10% -> ~6%). Real runner types on the compact-manifold presets. The driver holds a gear into the braking zone when shifting would cost time. Open: boosted engines high at the top; NA top-end fade. |
| — | Charge heating; valve flow from Taylor | ✅ build 122 | The intake stroke obeys the first law: flow work, the hot residual and Woschni's wall heat during induction. The flat 0.95 VE ceiling and the cam bonus retired where it applies; the curtain's discharge coefficient averages Taylor's 0.42. NA power RMS ~7%. Open: boosted engines high at the top; NA top-end fade. |
| — | Real circuits | ✅ build 123 | 22 real tracks (TUM centreline and measured width, georeferenced to f1-circuits/OSM, elevation from EU-DEM/USGS/SRTM): lengths within 0.3 %, Spa rises 103 m (real 104). test65. |
| — | Live steering and power | ✅ build 130 | Live timing shows the steering wheel (road-wheel angle atan(wheelbase/r) on the racing line, times a new STEERING RATIO input on VEHICLE, default 15:1) and the engine's power now, as hp/kW and a bar against the peak of the curve the lap drives. test70. |
| — | Knock from the end gas; ECU boost taper | ✅ build 131 | Knock is the end gas's autoignition (Livengood-Wu with Douaud-Eyzat, unadjusted) on the model's own cycle; spark cost from the Wiebe phasing. BOOST TAPER FROM / BOOST AT LIMITER as ECU tune inputs, with reliability; factory presets calibrated to the maker's rating. Next: low-rpm turbo spool, then the turbine throat convention and real wheel sizes. |
| — | Octane index; end-gas wall heat | ✅ build 132 | The fuel's resistance is Kalghatgi's octane index OI = RON - K S, K from the gas's own temperature at 15 bar; the end gas and bulk lose Woschni wall heat. Boosted low-rpm torque within ~10% of the makers' on most presets; factory tapers re-solved. Next: the RS3's spool, then the turbine throat convention and real wheel sizes. |
| — | Turbine throat; compressor island; real wheels | ✅ build 133 | The turbine throat at the volute centroid, as A/R defines it; the compressor's efficiency island scales with tip speed (constant flow coefficient), so low-rpm spool comes from the map, not a floor. The makers' compressor wheels on the GR Yaris, FK8, Supra and Evo; the RS3 on the 71 mm bound. Open: the RS3's real wheel; TwinAir/EcoBoost low-rpm knock. |
| — | Knock from the trapped charge | ✅ build 134 | The end gas is compressed from the intake valve's closing, on the charge the intake stroke trapped (the torque's own), not a full cylinder from BDC: less low-rpm retard, NA peaks unchanged. Next: the small turbos' wheels and an intercooler whose effectiveness follows its flow. |
| — | Brakes on a hot lap | ✅ build 135 | The rotors take one preparation lap before the hot lap, not a race stint's settled temperature; matches the tyres, which are taken at their working temperature. |
| — | Intercooler vs flow; small turbos' wheels | ✅ build 136 | The intercooler's effectiveness rises as the charge flow falls (NTU, the charge side's film coefficient by Dittus-Boelter); the TwinAir on its TD02's 40 mm wheel, the Alto on an RHF3-size one. Small-engine low-rpm torque within ~5-11% of the makers'. Open: the EcoBoost's wheel; an ECU torque limit for the mid-range. |
| — | ECU torque limit | ✅ build 138 | ECU TORQUE LIMIT (Nm) as a tune input: the boost target is held to the calibrated torque. Presets whose makers quote a torque plateau carry it (GTI, FK8, GR Yaris, EcoBoost, RS3, TDI, N57). |
| — | Full-screen track view | ✅ build 143 | ⛶ in TRACK's live timing: the lap, its live instruments and the replay controls fill the screen in landscape, the view turning itself on a phone held upright where the browser cannot lock the orientation. test75. |
| — | Brakes against the real world | ✅ build 144 | Vented fronts on every brake type, the rotor's hat in its mass, and vane heat transfer of at least the measured 0.076 W/m²K per rpm: street brakes on fast circuits ran 200–350 °C hot. Light cars now land in the measured 300–650 °C; heavy fast cars driven flat out still reach 750–900 °C and fade. test76. |
| — | Tyres against the real world | ✅ build 145 | Race tyre temperatures checked against makers' windows and pit-lane pyrometer guidance (road sport 66–88 °C in the pits, semi-slicks 70–100 °C, pits read 10–20 °C under the track): consistent, no change; test77 pins it. |
| — | Fuel against the real world | ✅ build 146 | Track fuel checked against owners' and magazine figures and against the engines themselves: at the limit the lap-average BSFC is 265–325 g/kWh and an E46 M3 or Civic Type R burns ~40 L/100 km (owners ~35); big-power cars 20–40% over owners' figures, from pace. No change; test78. |
| — | Racecraft and drivers | ✅ build 147 | A tow that grows as the gap closes (~2% at 10 m, under 1% at 40 m), defending (the inside line: harder to pass, a slower exit), late-braking moves that stick or run wide by the two cars' grip and brakes and the drivers, switchbacks, and a driver per car: balanced, aggressive, smooth, rain master, rookie. test79. |
| — | Supercar category | ✅ build 148 | Exotic becomes Supercar: four popular supercars from each decade since the 90s (F355, Diablo VT, McLaren F1, 993 Turbo; Enzo, Carrera GT, Ford GT, Murciélago LP640; 458 Italia, Huracán, 720S, 812 Superfast; 992 Turbo S, Huracán STO, Corvette Z06 C8, 750S), each on its factory engine and grouped by decade in the pickers. The 2020s are the combustion-only cars, as the model has no electric motor. Against the makers: power within 13%, top speed within 7%; the 720S, Z06 C8, 750S and 812 are slow off the line (grip-limited launches on road tyres). test80. |
| — | Downshifts and engine braking | ✅ build 149 | Through the braking zones the driver goes down one gear at a time, each taking the gearbox's shift time and only inside the limiter, never below the corner's gear; in gear the engine's own overrun torque brakes the car (cooler rotors; quicker only where the brakes are the limit). The live engine's lift-off braking is the engine's own. Next: braking split between the axles. |
| — | Braking split between the axles | ✅ build 150 | Each axle stops with its own grip (load transfer, aero balance, cornering), its hydraulic share of the brakes (ABS/EBD at an axle's grip) and, on the driven axle, the engine's braking, held to what those tyres can carry (drag-torque control); the rotors' heat follows the split. Where the engine's braking is trimmed, a car without that control would step out. |
| — | README cleanup | ✅ build 151 | Known limits, racing line and working queue brought up to date with the code; the lap report's footer too. Turbine housing matching re-measured and not built: the mismatch it was parked for has mostly closed (spread 4× → 1.9×, spool RMS ~1940 → 775 rpm). |
| — | The driver's foot | ✅ build 152 | The lap's throttle is a pedal a driver could work: fully off in 0.10 s, fully on in 0.25 s, steady through a corner, never backed off once driving out of one, flat through a spark-cut shift (DCT, sequential, auto) and lifted for an H-pattern one. The turbo shaft runs on that pedal, so a flat shift keeps the boost. Full-off-full stabs inside 0.4 s on a Spa lap: 94 → 2 (720S), 104 → 1 (992 Turbo S), 14 → 1 (GR Yaris); lap times within 0.02%. test82. |
| — | Tyre review | ✅ build 153 | Each car's factory tyre class checked against its own skidpad and braking: the 720S and 750S (bespoke P Zero Corsas) move to SEMI; the rest are on the right class, and their launch gap is the launch. Next: the launch model. |
| — | Launch through tyre slip; traction control | ✅ build 154 | The driven wheels turn at their own speed and the tyre pushes through slip (peak at ~10%, 0.82 in a full slide); TRACTION CONTROL holds the peak, without it the run is flat out and the tyres spin; the launch rpm is the tester's best of five. Presets carry their real equipment. |
| — | Driver's launch; best launch rpm | ✅ build 155 | The fastest launch is ~10% slip on every car (a sweep of slip targets); without traction control the driver holds it in first gear, then flat out from the first upshift. Every car launches at its best of five rpm. 0-100 RMS 16.1% → 14.7%. |
| — | Axle balance | ✅ build 157 | Each axle has its own lateral grip: its weight and downforce share, its share of the load transfer (ROLL BALANCE, the anti-roll bars), its own tyres (FRONT WIDTH; the factory front widths of 23 staggered cars), and the side force for the mass it carries. The car corners as hard as the axle that runs out first: front-heavy cars understeer, rear-engined 911s oversteer, braking into a corner unloads the rear. TRACK shows the balance. Laps 0-1.2% slower. test85. |
| — | Live cutaway: forced induction | ✅ build 164 | Stage 1 of 3 of the cutaway's detail: the turbo as two scrolls on one shaft in the exhaust-to-intake loop, turned by the model's shaft speed, with the wastegate, VGT vanes, intercooler and blow-off valve the model has; the superchargers belted to the crank. Next: the head, then the tracts and live gauges. |
| — | Live cutaway: the head | ✅ build 165 | Stage 2 of 3: valve events from the cam's duration, LSA and the phaser's scheduled advance; overhead cams (4V) or pushrods (2V) drawn to the lift; the spark at the model's advance, the flame over the model's Wiebe burn, knock in the end gas; injection; valve float past the float speed. Next: the tracts and live gauges. |
| — | Live cutaway: tracts and gauges | ✅ build 166 | Stage 3 of 3: runner and primaries to scale; filter, throttle, plenum, trumpets, carburettors, the variable flap; collector, cat, silencer; the blowdown pulse and its tuned return (SCAVENGING when it lands in the overlap); the compressor map with the live operating point; a boost bar; flow that packs with the mass flow. |
| — | Lap results held safely | ✅ build 167 | A V8 bug (Maglev on-stack replacement, fixed in Chrome 152) let a lap result take the next lap's numbers; simulateLap and simulateAccel copy their results out of the loop-heavy solvers before anyone holds them. |
| — | VGT vane ring geometry | ✅ build 168 | The ring's throat from its own radius (1.22 x the wheel tip) and nozzle height (0.07 x the wheel), not the fixed housing's A/R; the vanes' end-clearance loss charged (5 points shut, 1 open). EA288 expansion ratio at the limiter 3.6 -> 2.4. |
| — | Gear spacing and real gearboxes | ✅ build 169 | Ratios from the textbook's progressive design fitted to 30 published gearboxes (span grows with the gear count; CLOSE RATIO / STANDARD / WIDE RATIO are their quartiles); 33 real cars run their published ratios and final drive, the rest their family's average; custom ratios and final drive in the model; up to 10 speeds. |
| — | GEAR RATIOS window | ✅ build 170 | Spacing buttons, a slider per gear and the final drive, the model's 0-100 / top speed / lap live, and two graphs: rpm against speed with the 0-100 run's own shift points, and wheel force per gear against the ideal, drag and grip. |
| — | Powershift gearboxes | ✅ build 171 | Dual-clutch and automatic boxes keep the drive through an upshift (clutch to clutch); only a manual and a sequential cut it. 0-100 error across the real cars 10.6% -> 9.4%; the M2 21.6% -> 3.9%. The 6.6 V8 diesel archetype gets the large turbo frame. |
| — | Diesel governor | ✅ build 172 | Full-pedal fuel falls from the maker's rated speed to zero torque at the governed maximum, the boost target with it. Diesels peak at their rated speeds (Duramax 445 hp at 2800, as rated); tapers re-solved gentler; the Cummins 546 -> 471 hp (rated 400), its remaining gap the diesel BMEP ceiling. |
| — | Suspension geometry per axle | ✅ build 173 | Stage 1 of 3. FRONT and REAR GEOMETRY: strut, double wishbone, multi-link, twist beam, solid axle. Camber recovery (t/2)/fvsa from each axle's own track (was 50% for every car); roll centres split the load transfer (each axle's mass at its own roll centre, the rest by the roll stiffness); each axle's transfer over its own track. The 42 real cars carry their published geometry and front/rear tracks. Laps −0.3% to +0.6%. test94. |
| — | Springs and anti-roll bars | ✅ build 174 | Stage 2 of 3. FRONT/REAR SPRINGS and FRONT/REAR ANTI-ROLL BAR, SOFT −2 to STIFF +2 about the kit (no spring rates). Springs from the kit's ride frequency (1.0 / 1.25 / 1.6 / 2.0 Hz), K = m_axle (2πf)² t²/4, bars 55% of that at STANDARD; roll = m g (h − z_axis) / (K_F + K_R), so each car rolls by its own CG, track and roll centres (a typical car gets the old 6 / 4 / 2.5 / 1.5 deg/g back); the stiffness split replaces ROLL BALANCE. Laps −0.3% to +1.0%. test95. |
| — | Dampers and the road | ✅ build 216 | Stage 3 of 3, part a. Each circuit has a road (ISO 8608 roughness, estimated by kind of circuit) and each axle a quarter car (body, spring, damper, wheel, tyre); the tyres' load swings over the bumps, and a swinging load grips less (load sensitivity, wheel hop). FRONT/REAR DAMPERS, SOFT −2 to STIFF +2 about the kit's damping (0.25 / 0.30 / 0.45 / 0.60 of critical); the summary shows the damping, wheel hop and the ride. Laps +0.03% on average (−0.14% to +0.27%, the spread being the racing line re-optimised; on a fixed line the road only costs time). Not yet: the tyre's lag, kerbs, the body at turn-in (part b, transient roll). |
| — | Kerbs | ✅ build 217 | Stage 3 of 3, part b. Every corner has the FIA's kerbs outside its edges: a 5 cm Vallelunga ramp on the inside at the apex and a 5 cm Melbourne ramp on the outside at the exit, 0.8 m wide, placed from the corner's shape (an estimate; the track data has none). The racing line may use their width, and pays for the warp: one axle's wheel on a kerb and not the other's twists the car through its roll stiffness in series and its dampers, moving load across the diagonal. A front wheel alone on a kerb moves the balance towards oversteer, the rear towards understeer. Ribs not modelled (no spacing in the standard). |
| — | Suspension calculator | ✅ build 218 | A window on the VEHICLE tab: one corner as a quarter car, from the car's own (sprung and unsprung mass, wheel rate, damping, tyre rate) and then free to change, with a motion ratio and separate bound and rebound damping. Exact two-mass modes beside the textbook shortcuts, damping as a share of critical, the body's and wheel's response to a road wave (the damper's describing function, the mean of bound and rebound), and a step in the road solved in time with the real damper and a tyre that cannot pull. A calculator only: the car does not move. |
| — | Spark torque from fuel | ✅ build 95 | `IMEP_K` replaced by Heywood's 0.8 × fuel-air cycle efficiency; each fuel's LHV/AFR_st enters. Spark torque −2.7%, full-load BSFC 280 g/kWh (real 270–300). Rotary/two-stroke type factors still fitted. |
| — | `turboChoke` (boost taper) | ✅ build 94 | Retired. Turbine efficiency from blade speed ratio U/C, per-point compressor efficiency, a continuous rich-knock slope in place of a step, and sequential turbos staged as two turbines. Calibration improved on every measure. |
| — | Rotary exhaust heat | ✅ build 92 | The slow, late Wankel burn (130° ES, CA50 37.5° ATDC) leaves ~10% of the expansion work undone, and that heat now reaches the exhaust: 13B 775 → 942 °C, off the limiter. |
| — | Rotary spool | ✅ build 100 | The 13B reached boost near 8500 rpm (real ~3000). Not pulse energy after all: air flow counted one charge per two turns, a four-stroke's, and a rotor fills a chamber every turn. With the rate right it spools at ~2400 rpm. |
| 4 | VE bell (`vePeakRpm`) | ✅ build 84 / 88 | Retired for poppet-valve petrol engines after two hidden errors were fixed (IVC geometry, Engelman tuning ratio), and for diesels in build 88. Still fitted for ported engines. |
| 5 | Launch model | ✅ build 154 | The slip-ratio tyre model is in: driven wheels on their own equation, the tyre through slip, traction control as equipment, the launch rpm chosen as a tester does. Rotational inertia went in with build 107. Costs ~2% on 0-100, as the parked model measured. |
| 6 | Combustion (conversion 5) | ✅ diesel build 88, spark build 95 | Diesel: torque from fuel, fixed-time Wiebe burn, wall heat, turbine-temperature fuel cap, signed gas exchange. Spark: torque from fuel (Heywood's 0.8 x fuel-air cycle efficiency, build 95); `IMEP_K` only scales the dyno brake's reference. Still fitted: the rotary's and two-stroke's type factors (`typeImep`). |
| 7 | Ground `test46`'s invented bands | 🔶 partly | Sourced: stock back-pressure 0.28–0.55 bar at WOT (was a cap of 0.85, the model's 0.33 sat inside all along), the peak-ram ceiling (tuned intakes past 115–125% VE, SAE 921727, Cranfield) and the long-tube header ceiling (30–36 in). Still the author's, and now labelled so in the test: the ram floor, scavenging, race-cam trapping, the shortest header, system pipe sizes and most exhaust-temperature bands (the measured studies, SAE 790308 and 901503, are paywalled). |

Also carried, and labelled in place rather than quietly: the ported engines' knock score (rotaries and two-strokes
keep the points score with KNOCK_RICH; four-strokes have run the end-gas autoignition integral since build 131), and
the `ci` factor on the intake half of the
pumping loop (which compensates for `mapTarget()` giving diesels a throttle plate they should not
have — the real fix is re-plumbing diesel load through fuelling).


1. ~~**Valvetrain and port flow**~~ ✅ — valve area and count, spring rate and valve mass, cam lift
   and duration; port choking from Taylor's inlet Mach index, valve float from the inertia/spring
   balance. Presets peaking at the exact rev limiter went **4 → 2**, and the two that were fixed are
   both big-bore two-valve engines that now roll off for a stated reason. Calibration unchanged at
   2.66% RMS. The two that remain are four-valve high-revvers that are genuinely neither choked nor
   float-limited — their peak is set by intake wave tuning, which is step 3.
2. **Tyre** — ◐ *partly done.* ✅ Speed-dependent rolling resistance (top-speed RMS against real
   cars 9.3% → 6.5%) and a tyre speed rating you choose, shown and flagged when exceeded but
   deliberately *not* used to cap top speed. ⬜ **Parked:** the slip-ratio curve in place of the hard
   `min(driveF, μ·N)` grip clip. It was built and it works; wiring it in exposed a *different*
   missing physics — rotational inertia — and the two have to be fixed together. Written up below.
3. **Gas dynamics** — ◐ *first round done.* ✅ Intake ram as a **Helmholtz resonance** (runner as
   neck, cylinder as volume — the textbook treatment), exhaust scavenging as a **reflection comb**
   whose rarefaction must arrive during overlap, back-pressure from Darcy-Weisbach through a system
   pipe sized off the engine's own flow, overlap derived from duration and LSA, late-IVC trapping,
   and exhaust gas temperature from the energy balance. **Five fitted numbers retired:**
   `CAM{peakShift, scav, lowLoss}` and `EXHAUST{topGain, lowLoss}`. New input: intake runner length,
   including VARIABLE — a variable-length manifold is two lengths and a flap, which is all a DISA or
   a VarioRam is. **Presets peaking at the exact rev limiter: 2 → 0**, which is what this conversion
   existed to fix. (Two behavioural tests that then disagreed with the derived curve shape were left failing
   rather than weakened; both have since been settled, and the suite has passed in full since build 93.) Details below.
   Exhaust was folded in here rather than being its own step, and that turned out to be the whole
   game: `EXHAUST.topGain` and `CAM.scav` really are two knobs for one event, and deriving either
   alone would have left the other double-counting it.
4. **Turbo** — compressor and turbine maps instead of the lumped `{spool, choke, k, flow}` table.
   ◐ **Parts 1–4 shipped.** ✅ The turbine as a nozzle (frames are wheels, A/R is real geometry, the
   wastegate closes the power balance, residual gas becomes a pressure ratio — calibration 3.38% →
   **3.20%**, the first conversion to improve it); the compressor efficiency island; the shaft
   equation of motion integrated as energy; and lag reaching the acceleration solver through a 2-D
   rpm × boost torque grid, because boost is a state with history and a 1-D curve cannot describe a
   turbo mid-spool. The turbine housing is settled as a builder's choice (TURBINE A/R, build 91):
   which side of the spool/top-end compromise to take is design intent, not physics. The two
   transient losses are derived as of build 93 (Petroff bearings, charge-system fill, boost as a
   state), and the boost-taper stand-in `turboChoke` is retired (build 94). Working model at
   `tests/proto/turbo.mjs`. 22 fitted numbers go:
   `TURBO{spool50, width, choke, k, flow}` × 3 frames, `TURBO_CONFIG{...}` × 4, `TURBO_PR_REF` and
   `SPOOL_PR_EXP`.

   #### What the investigation established

   **A frame size is a wheel diameter.** "Small / medium / large with a flow rating" is a
   description of a compressor wheel, and real turbos are *named* by it — a GT2871R has a 71 mm
   exducer. Everything follows from that diameter:

   | quantity | derived from | check against real frames |
   |---|---|---|
   | flow rating | inducer choking, `ṁ = blockage·ρ·A·c` | +9% to +33% vs quoted, and the sign is right: makers quote usable flow at the island edge, not hard choke |
   | boost | Euler, `PR = (1 + η·σ·U²/(cp·T01))^(γ/(γ−1))` | GT2871R ~2 bar near its speed limit ✓ |
   | max shaft speed | the wheel's own tip-speed limit, ~520 m/s for cast aluminium | 140k for a 71 mm wheel ✓ |
   | wheel inertia | mass × radius², so `D⁵` in a similar family | a 108 mm frame is 8× a 71 mm one |
   | spool | `J·ω·dω/dt = P_turbine − P_compressor` | see below |

   **Spool needs no spool constant.** Solving the shaft balance on a 2.0 L at a 1.0 bar wastegate
   reproduces the whole familiar ordering: the small frame is wastegating from 1500 rpm and then
   *falls off* to 0.88 bar by 6500 as it runs out of wheel; the 71 mm reaches full boost by 3000, the
   82 mm by 4000, the 108 mm not until 6500. The small frame's high-rpm drop-off is precisely what
   `TURBO.choke` was standing in for, and it emerges rather than being asserted.

   **`test40`'s over-flow penalty lands on its own.** Asking a 49 mm frame for more and more boost on
   a 2.0 L at 5000 rpm: at 1.0 bar it runs 84% of choke flow at 58% efficiency; past that it
   saturates at 1.41 bar however high the wastegate is set, running 102% of choke at **39%
   efficiency** and heating the charge by **+230 K**. No penalty term required.

   #### The error that mattered most

   The first transient model gave "no spool" for every frame at every rpm — net shaft power stuck at
   0.01 kW. The cause was a modelling error, not a numerical one: **the turbine's expansion ratio was
   set equal to the compressor's pressure ratio.** That makes spool impossible by construction — a
   slow shaft makes no boost, so it gets no expansion, so it gets no power, so it stays slow, and a
   turbo could never start from rest.

   A turbine is a **nozzle of fixed effective area**. Exhaust cannot leave the manifold except
   through it, so manifold pressure rises until the flow fits: `ṁ = A_eff·f(PR_t)`. Expansion ratio
   comes from *mass flow and area*, not from what the compressor is doing, and even a stationary
   shaft has full manifold pressure available to start it turning. That is also exactly what a
   turbo's **A/R** spec means, and why people agonise over it: a small A/R is a small nozzle, so more
   expansion, faster spool, more back-pressure up top. It has been buried inside `spool50` all along.

   With the turbine as a nozzle, time to 90% boost on a 2.0 L comes out 61 ms / 23 ms / 14 ms at
   3000–5000 rpm for the small frame (real: 200–400 ms, so still optimistic), 635/531/760 ms for the
   71 mm (real 0.3–0.8 s ✓), 683/597 ms for the 82 mm above 4000, and never for the 108 mm — which is
   correct, it is a 4-litre-plus frame.

   #### A defect this found in conversion 3

   Real boosted engines run **0.5–1.5 bar of exhaust manifold back-pressure, dominated by the
   turbine**. Conversion 3 models only the pipe, so every turbo engine in the app is currently
   missing most of its back-pressure — and therefore most of its residual-gas VE loss. The derived
   turbine nozzle supplies exactly that number (0.29 bar for the 71 mm frame at 5000 rpm against
   0.07 bar of pipe), so conversion 4 should feed conversion 3 rather than sit beside it.

   #### Part 3 investigated: the shaft equation of motion

   The last piece, and the one that finally retires `spool50`, `spoolWidth` and `spoolK` — three
   fitted numbers standing in for one ODE. Working model at `tests/proto/shaft.mjs`. Four questions
   had to be settled first:

   **1. The singularity is real, and avoidable.** `dω/dt = P/(J·ω)` blows up as ω → 0: at 500 shaft
   rpm a 5 kW imbalance gives 3×10⁶ rad/s², which no explicit integrator survives. Integrating
   **energy** instead removes it completely — `E = ½Jω²`, so `dE/dt = P_net` and `ω = √(2E/J)`, with
   no division by ω anywhere. A stationary shaft simply has `E = 0` and gains energy. This is the
   formulation to build.

   **2. It is not stiff.** Time to 90% boost converges across two decades of step size — small frame
   at 3000 rpm gives 100 / 70 / 60 / 59 ms at dt = 0.02 / 0.005 / 0.001 / 0.0002. The acceleration
   integrator's existing **dt = 0.005 runs about 18% fast**; dt = 0.001 is converged. Either
   sub-step the shaft or accept a known bias, but it does not need a smaller vehicle step.

   **3. The architecture is the real cost.** Both `simulateAccel` and the lap solver call
   `buildTorqueCurve()` **once** and interpolate `tqAt(rpm)`. With a shaft ODE, torque is a function
   of *(rpm, boost)* and boost is a state variable, so a 1-D precomputed curve stops being valid.
   The cheap fix is a 2-D grid over rpm × boost built once and bilinearly interpolated, rather than
   recomputing VE — which now carries two wave solves and a nozzle bisection — at every step of
   every run. This is the same class of change the slip model needed, and the reason both were left
   until the physics under them was settled.

   **4. It answers `test40`.** Spool-up to 90% boost on a 2.0 L at 0.8 bar, engine held at speed:

   | frame | 2000 rpm | 2500 rpm | 3000 rpm | 4000 rpm |
   |---|---|---|---|---|
   | small (54 mm) | 428 ms | 120 ms | 58 ms | 26 ms |
   | medium (71 mm) | not spooled | not spooled | not spooled | 270 ms |
   | large (86 mm) | not spooled | not spooled | not spooled | not spooled |

   The small frame is lit before the large one has started. A 0–100 run that *integrates* this must
   favour it, which is exactly `test40`'s remaining assertion and exactly what a steady
   boost-per-rpm curve can never show.

   **A harness trap, recorded because it read as a physics result.** The first convergence check ran
   the medium frame at 3000 rpm and reported "never" at every step size, which looks like divergence
   and is not: that combination genuinely never reaches 0.8 bar, as the table above shows. A
   convergence check has to be run on a case that converges. Reading that null as instability would
   have been the same error as reading a value off a clamp — the fourth time this class of mistake
   has appeared in these conversions.

   #### Known gaps before building

   - **Peak PR comes out identical (4.44) for every frame**, because one tip-speed limit sets them
     all. Real frames spread 2.6–3.8: bigger wheels use stronger alloys and more backsweep. That is a
     materials fact the model does not carry.
   - The small frame's transient is **~4× too fast**. Bearing drag and heat soak into the housing are
     both missing, and both slow a real turbo down.
   - Turbo *configurations* (twin / sequential / compound) are not yet derived — twin is two smaller
     wheels, sequential is a staged handover, compound is series stages. Each is expressible as
     geometry rather than as a multiplier, but none of it is prototyped.

   #### Two numerical traps hit on the way, both recorded because they looked plausible

   Relaxed fixed-point iteration on the boost/flow feedback **does not converge** and fails quietly —
   `balance` switches discontinuously between stalled, balanced and speed-limited, so the iterate
   orbits and whatever value it stopped on gets returned. It produced a table where asking for
   1.5 bar made 0.91, asking for 2.0 made 0.62 and asking for 2.5 made 2.27. Replaced with a
   bracketed bisection on the residual. Separately, an early spool table read a suspiciously uniform
   0.34 bar for three different frames because they were all pinned on the solver's `lo = 5000`
   floor — the same class of artifact as patching a script-scope `const` or reading a value off a
   clamp. A frame that cannot balance above the bracket is *not spooled*, and now says so.
5. **Combustion** — a real cycle with heat release, replacing `IMEP_K` and friends. Biggest prize,
   biggest risk, so it goes last.

#### The inertia investigation — what happened when the slip model was wired in

This is recorded in full, failures included, because the *result* is a defect found in the shipped
model and the *method* is the decision rule this whole rewrite runs on.

**The model.** Slip ratio `s = (ωr − v)/v` becomes a state variable, and grip follows a Pacejka-lite
curve `μ = μ_peak · sin(C · atan(B·s))` with `B = tan(π/2C)/s_opt` placing the peak exactly at the
compound's `s_opt` and `C = 1.4` giving a full-slide plateau at 0.81 of peak (measured tyres: 0.75–0.85).
The driven wheels get their own equation of motion, `I_eff · dω/dt = T_axle − F·r`, with
`I_eff = I_wheels + I_engine · ratio²`. Prototyped standalone in `slip.mjs` first, because the slip
dynamics are far stiffer than the vehicle dynamics: it converges at the app's existing `dt = 0.005 s`,
and it makes short gearing genuinely cost time on a powerful car — which the hard clip could never do,
since a clipped launch is identical at every final drive.

**And it made the calibration worse.** Real-car 0–100 RMS went **2.66 % → 7.79 %**, past the suite's
5 % threshold. Every car came out *slow*, mean bias **+5.7 %**.

Under the rule stated above that is not automatically a rejection — a regression is allowed if it is
explainable and traceable to something not yet modelled. So the point was to find out which.

| experiment | RMS | mean bias | what it says |
|---|---|---|---|
| shipped model (hard clip, no rotational inertia) | 2.66 % | — | the baseline being defended |
| slip curve + `I_eng` 0.15, wheels full | 7.78 % | +6.10 % | the regression |
| slip curve + `I_eng` 0.15, wheel inertia ×0.65 | 7.22 % | +5.66 % | wheels are not the driver |
| slip curve + `I_eng` **0.00** | 5.37 % | +4.34 % | slip alone still costs 2.7 pp |
| hard clip + rotational inertia as effective mass | 16.27 % | — | inertia alone is far worse |

That last pair is the useful one, and it corrected a conclusion I had drawn too early. Inertia
*alone* costs 16.27 %, inertia *plus* slip costs 7.78 % — so slip is recovering about half of it, and
it is tempting to call the slip model sound and blame inertia entirely. Setting `I_eng` to literally
zero kills that: the slip model on its own still gives **5.37 %** against the baseline's 2.66 %. The
regression splits roughly in half — **≈2.7 pp from the slip dynamics themselves, ≈2.4 pp from engine
inertia**. Both are real, and neither excuses the other.

**Three hypotheses for the residual, all eliminated.**

- **Driveline efficiency.** If the cars are slow because too much torque is being lost, `driveEff`
  should be too pessimistic. Getting the bias to zero needs **0.972** for an RWD manual; real
  measured driveline efficiency is 0.88–0.93. Rejected — it would be a fitted coefficient wearing a
  physical name, which is exactly what v1.0 exists to remove.
- **Engine inertia magnitude.** Perhaps `I_engine` is simply too large. Zeroing the bias needs
  **≈0.03 kg·m²**; a real four-cylinder crank, flywheel and clutch pack is **0.10–0.20 kg·m²**.
  Rejected for the same reason.
- **Tyre grip.** The obvious remaining candidate: the μ curve is too stingy. It is **backwards** —
  reducing grip made things monotonically worse (μ ×1.00 → 7.22 %, ×0.94 → 9.08 %, ×0.85 → 14.10 %)
  because the cars are already too slow, not too fast. Rejected, and it was a useful correction to
  a prediction I had made with some confidence in the wrong direction.

**The signal that survives.** The AWD Subaru WRX sits at **+5.9 %** and barely moves — +5.9, +5.9,
+6.1 — across a 15 % swing in grip. Whatever is slowing it down is not traction, because a
four-wheel-drive car on that much grip is not traction-limited at all. Work out the reflected
inertia instead: `I_eng × ratio²` in first is ≈21.6 kg·m², which over `r²` is ≈190 kg of apparent
mass on a 1470 kg car — **+13 % effective mass in first gear, ≈+5 % on the 0–100 run.** That is the
+5.9 % almost exactly.

**So the inertia term is not wrong. The old model was giving every car a free ~6 % by never charging
rotational inertia at all**, and the 2.66 % calibration was reached with that discount baked in. Two
compensating errors read as accuracy: no inertia (too fast) against a hard grip clip that lets a car
put down its full torque from a standstill (also too fast) against real cars that do neither.
Removing one without the other is what produced the regression.

**Not shipped.** Both halves were reverted; `main` carries neither. The standalone model is kept at
**`tests/proto/slip.mjs`** — it runs on its own with `node`, and it is the spec to build from when
the work resumes rather than something to reconstruct from this write-up. The browser harnesses that
produced the sweep tables are *not* kept: they patched copies of `index.html` on a scratch disk and
hard-coded absolute paths to them.

The fix is not a coefficient, it is the **launch model**: the current clutch holds the engine at a
fixed launch rpm and hands the wheels whatever torque grip allows, which is a kinematic assertion,
not a mechanism. It should be a **torque-capacity limit** — the clutch transmits what its clamp load
and friction radius can carry, the engine accelerates on the difference, and slip ends when the
speeds meet. With that in place the slip curve and the inertia term can go in together and the whole
set be recalibrated once. That is the next piece of step 2.

**Two test failures worth remembering, both the same mistake.** Twice a sweep was set up by
monkey-patching a value that is a `const` at script scope — first `crrAt` while proving `Crr(v)`
reaches the solver, then `I_ENGINE` in the first inertia sweep. Neither patch does anything, and the
second one silently produced *identical* numbers for `I` = 0.15, 0.10 and 0.06, which I read as
"inertia is not the driver" and reported as such before catching it. Patch the **use site**, never
the declaration; and a sweep whose rows do not differ is a broken harness, not a null result.

**Deferred behind this:** **rim material and weight.** It is genuinely relevant once inertia counts —
unsprung rotating mass is charged twice, once translating and once spinning, so forged vs cast is
worth 1–2 % on 0–100. Adding it while the inertia term itself is still being reworked would just
make the rework harder to read.

Also queued: a **UI redesign** for the DESIGN and VEHICLE tabs, which are already crowded and will
get more so as derived physics adds inputs. Progressive disclosure — headline inputs by default, a
detail expander per subsystem — after the first conversion lands, when the final input set is known.

Greek translation is **paused** by owner decision: text added from now on ships in English only, and the
Greek sweep (`test87`) was removed. Existing Greek stays.
- **Charge the acceleration and lap solvers for spool lag**, closing the first limit above. It
  needs a transient pass rather than the current per-rpm steady solve.
- **A hand-editable ignition map**, to match the fuel map editor — the last piece of item 2.
- **Tyre wear and fuel burn over a stint**, turning the single best-case lap into a run.
- **V/boxer geometry in the large cutaway.** The bank strip already lays cylinders out by layout
  (a V12 shows two banks of six, a boxer two opposed pairs), but the big section is still a single
  upright cylinder whatever the layout — a real V-angle or opposed section would finish it.
- **Native Android wrap** (Capacitor/TWA) — parked, not abandoned.

### Completed

- [x] Configurable engine designer (cylinders, bore/stroke, compression, induction, fuel, spark)
- [x] Dynamic throttle + load driveline with rotating inertia (drive it, don't set RPM)
- [x] Full dyno sweep graphs (power & torque curves)
- [x] Dynamic thermal model (temps change over time)
- [x] Forced induction (turbo / supercharger, boost, intercooler)
- [x] Sound (Web Audio API engine note)
- [x] Pressure-ratio-aware turbo spool, compressor flow limits and real charge heating
- [x] Torque-scaled axle asymmetry, and acceleration calibrated against six real cars
- [x] Animated engine cutaway at a readable pace, with live values beside each part, at device resolution
- [x] Save / load engine setups
- [x] Garage: any number of named chassis+engine combos, with per-build stat cards
- [x] Mobile app packaging (PWA)
- [x] Firing-order animation and V / boxer bank layout in the cutaway's cylinder strip
- [ ] V-angle / opposed geometry in the *large* cutaway section (still one upright cylinder)
- [x] Cam profiles & valvetrain (stock/sport/race cam + VVT, reshaping the VE curve & idle)
- [x] Turbo lag / spool modelling vs. RPM (turbo size, spool curve, transient lag)
- [x] Cooling subsystem (radiator size, fan, oil cooler, thermostat) feeding the thermal model
- [x] Electrical subsystem (alternator, battery/charging, dwell-limited ignition misfire)
- [x] Different fuels (pump/race gas, E85, methanol) with their own energy, stoich, knock & cooling
- [x] Induction/metering systems (carbs, mechanical injection, EFI, ITBs) + air filters
- [x] Ignition control: Fixed vs Auto (ECU, MBT-tracking & knock-limited timing)
- [x] Fuel mixture: Manual (fixed AFR) vs Auto (editable 3D ECU fuel map, load×RPM, with a live heat-grid)
- [x] Reliability / wear simulation (health falls under detonation/overheat/lean-boost)
- [x] Scoring / rating (graded scorecard) and dyno-pull logging & overlay
- [x] Save to / open from named files (with notes) and shareable build links
- [x] Emissions (engine-out CO/HC/NOx + three-way catalytic converter) with a live analyser & score
- [x] Character-driven engine note (lope/burble from cam, layout & anti-lag)
- [x] Intercooler core sizing (none/small/large — charge cooling vs spool lag)
- [x] In-app GUIDE tab (documentation) and OPTIONS tab (sound/wear/language); tab-aware side panel
- [x] Vehicle Designer placeholder reserving space for the vehicle/drivetrain layer (feature A)
- [x] Strategy layer: parts cost/budget, reliability index, power-per-dollar & objective challenges
- [x] New engine types: diesel (CI), 2-stroke and rotary/Wankel, each with distinct physics & emissions
- [x] Localisation (English / Greek) with persistence, and a responsive portrait layout
- [x] Vehicle layer: chassis/drivetrain/gearbox/tyres/aero/weight/brakes/suspension → 0–100, 400/800/1000 m, top speed, 100–0 & 0–200–0
- [x] Per-chassis factory fitment (matching tyres/wheels/brakes/suspension/aero) + a final-drive read-out on the gearing slider
- [x] Gearbox types: manual / sequential / DCT / torque-converter auto (shift time, driveline loss, ratio spread, converter stall & multiplication)
- [x] Differential types: open / viscous LSD / clutch-plate LSD / spool, capping the usable share of driven-axle grip
- [x] Test track: 3 circuits, quasi-steady-state lap solver with a friction circle, sector splits and a limit-coloured pixel map
- [x] Minimum-curvature racing line within the track width (5–7 % quicker than the centreline)
- [x] Late-apex bias on corners that lead onto a straight (+11.7 m of apex shift, selective)
- [x] Variable track width per circuit, authored or derived, with a per-point line clamp
- [x] Track elevation: gradient, slope-adjusted load and crest/compression vertical curvature, with an elevation profile on the lap report
- [x] GPX circuit import (projection, uniform resampling, smoothing, real elevation) with localStorage persistence
- [x] Nordschleife in the track pack (20.4 km, 290 m elevation) — a real road course as a benchmark
- [x] 22 real circuits: TUM measured centreline and width, georeferenced, with terrain-model elevation
- [x] Track objectives (lap targets on named circuits, budgeting the whole car) + lap time on the scorecard
- [x] Printable dyno report (PNG + library-free PDF) with chart, peaks, engine spec, run conditions and tabulated data
- [x] Printable hot lap report: map with throttle/braking highlighted, speed trace, sector times, per-corner speed traps with names
- [x] Calibration pass for realistic power figures & curve shape (ongoing refinement)
- [ ] Native Android build (wrap the PWA with Capacitor or a Trusted Web Activity)

> **Android note:** the app is intentionally a self-contained, offline-capable PWA with no
> server or external network dependencies and all persistence in `localStorage`. That keeps
> it wrappable into an Android APK later (Capacitor or a Trusted Web Activity) with minimal
> changes. New features are kept touch-friendly and framework-free to preserve that path.

