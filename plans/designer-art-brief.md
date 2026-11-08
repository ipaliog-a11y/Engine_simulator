# Art brief: 8-bit part pictures and value diagrams for the designers

This is the brief for an image generator (Grok Imagine). It covers every part, and every choice for that part, on the
three design forms (**ENGINE**, **ELECTRIC DRIVE** and **VEHICLE**) and the **PARTS** tab. It asks for two things:

1. **Part icons:** one small picture for each choice in a list (for example, a cast manifold, a tubular header and an
   equal-length header).
2. **Value diagrams:** one wider picture for each number you can set (for example, bore or final drive). It shows
   what happens when the value goes down and when it goes up.

Pictures are only pictures. No number in the sim comes from them, as with `assets/cars/` (see its README).

---

## 1. How to write each prompt

Each prompt is built from three parts in this order: **STYLE**, then **FORMAT** (icon or diagram), then the **SUBJECT**
line from the tables below. Paste the blocks in word for word, and use the same seed and the same style reference
image for the whole set, so that all the pictures look alike.

**Style reference image:** `assets/cars/honda-s2000-ap1-2000.webp`. It was the reference for all the car pictures.
Take its pixel size, its palette and its shading from it. Do **not** take its road, sea or sky.

### STYLE (every image)

> 8-bit pixel art in the style of a late-1980s / early-1990s console game manual illustration. Chunky, clearly visible
> square pixels on a strict grid, hard edges, no anti-aliasing, no blur, no gradients, only flat colour bands with
> dithering where shading is needed. Limited palette: background #12121c, panel lines #26263a and #3a3a55, metal
> #6b6b85 with highlights #d8d8e8, dim parts #8a8aa6, accents green #00ff88, cyan #00ccff, yellow #ffcc00, red
> #ff4d5e, blue #3d7bff, copper #d9853b. 1-pixel black outline around objects. Technically accurate mechanical
> shapes, like a cutaway in a workshop manual. **No text, no letters, no numbers, no logos, no brand names, no
> watermark.**

### FORMAT A: part icon

> Single object, centred, three-quarter isometric view from the upper left, filling about 80% of a square frame.
> Plain solid background #12121c, nothing else in the frame. Drawn on a 64×64 pixel grid. Square 1:1 image.

### FORMAT B: value diagram

> A wide 16:9 explanatory diagram on a 240×135 pixel grid, background #12121c. Two panels side by side, divided by
> a thin #3a3a55 line: the LEFT panel shows the LOW value, the RIGHT panel the HIGH value, of the same part from the
> same viewpoint (side view or cutaway). Use arrows (yellow #ffcc00) for motion and flow, red #ff4d5e for heat or
> loss, cyan #00ccff for air, green #00ff88 for the gain. If a small graph is asked for, draw it under each panel as
> a plain pixel line chart with unlabelled axes, the curve in green, the axes in #8a8aa6. No text, no numbers.

Leave all words out of the pictures: the app writes the labels and captions (through `tr()`, so they can be
translated). The **Caption** column below is that text. It is for the app, not for the prompt.

---

## 2. Files, sizes and post-processing

| Kind | Generate at | Deliver as | Path |
|---|---|---|---|
| Part icon | any square size | 128×128 WebP: snap to the 64×64 grid with nearest-neighbour, then scale ×2 | `assets/designer/icons/<form>/<field>-<value>.webp` |
| Value diagram | any 16:9 size | 960×540 WebP: snap to the 240×135 grid with nearest-neighbour, then scale ×4 | `assets/designer/diagrams/<form>/<field>.webp` |

- `<form>` is `engine`, `ev`, `vehicle`, `parts` or `hybrid`. `<field>` and `<value>` are the ids in the tables
  (they are the form's element ids and option values in `src/shell.html`), so the app can find a file without a map.
- Snap with nearest-neighbour **only** (Pillow: `Image.NEAREST`). After snapping, change any colour that is not in
  the palette to the nearest palette colour.
- Save `assets/designer/manifest.json` in the same shape as `assets/cars/manifest.json`: for each file, the full
  prompt, the seed and the post-processing. Add `assets/designer/README.md` with any caveats (as `assets/cars/` has).
- **"Off" and "none" choices:** do not draw a separate picture for a NO / OFF / NONE choice unless the table lists
  one. The app shows the ON picture greyed out, or the shared empty-socket icon `assets/designer/icons/_none.webp`
  (SUBJECT: *an empty engine-bay mounting bracket with four bolt holes and nothing fitted*).

Total: **about 235 icons and 80 diagrams**. Do them card by card, check the style after the first card, then go on.

---

## 3. ENGINE form (`engine`)

### 3.1 Engine type (above the cards)

| File | SUBJECT |
|---|---|
| `edType-petrol4.webp` | a petrol four-stroke inline-four engine block with a spark plug on top of each cylinder |
| `edType-diesel.webp` | a heavy diesel engine block with thick injector lines and a tall iron block |
| `edType-twostroke.webp` | a small air-cooled two-stroke single cylinder with deep cooling fins and an expansion-chamber pipe |
| `edType-rotary.webp` | a Wankel rotary engine: a triangular rotor inside an epitrochoid (figure-eight) housing, cut away |
| `edType-electric.webp` | a cylindrical electric motor with copper windings showing through a cutaway, and an orange high-voltage cable |

### 3.2 BLOCK card

| File | SUBJECT |
|---|---|
| `edLayout-inline.webp` | a cutaway engine block with four cylinders standing in one straight row on one crankshaft |
| `edLayout-v.webp` | a cutaway V engine block, two banks of cylinders angled apart in a V on one crankshaft |
| `edLayout-boxer.webp` | a cutaway flat (boxer) engine, cylinders lying horizontal and opposed on both sides of one crankshaft |
| `edCyl-1.webp` … `edCyl-12.webp` (1, 2, 3, 4, 5, 6, 8, 10, 12) | a row of N pistons seen from above as metal discs. Draw exactly N; for 8, 10 and 12, two rows of N/2 |

| Diagram | LEFT (low) → RIGHT (high) | Graph | Caption |
|---|---|---|---|
| `edBore.webp` | a narrow cylinder with small valves → a wide cylinder with large valves; a red flame front with further to travel to the cylinder wall | — | A wider bore fits bigger valves (breathing at high rpm) but the flame travels further, so knock comes sooner. |
| `edStroke.webp` | a short crank throw and short piston travel → a long throw and long travel; yellow arrows for the piston's speed, longer on the right | — | A longer stroke adds displacement and low-down torque; the piston moves faster at each rpm, which limits the revs. |
| `edEcc.webp` | a rotary rotor whose centre swings in a small circle → a large circle; chamber volume shaded cyan | — | More eccentricity is more chamber volume, up to the limit where the apex seals stop sealing. |
| `edCR.webp` | piston at the top with a tall cyan gap above it → a thin cyan gap; small vertical bars showing total volume against gap volume | — | Compression ratio is the whole volume over the gap at the top. Higher burns more efficiently and knocks sooner. |
| `edRedline.webp` | a slow-turning crank with short motion lines → a fast one with long motion lines and a red-hot connecting rod | a rising power curve, cut off at a vertical line further right on the right panel | More rpm is more power while the engine still breathes, with more load on the rods and pistons. |
| `edCyl.webp` | 2 big pistons with big uneven red exhaust pulses → 8 small pistons with small even pulses | — | More, smaller cylinders run smoother and rev higher; fewer, bigger ones make torque lower down. |

### 3.3 HEAD & VALVES card

| File | SUBJECT |
|---|---|
| `edValves-2.webp` | a cylinder head seen from below: two valves (one intake, one exhaust) in a wedge chamber |
| `edValves-4.webp` | a cylinder head seen from below: four valves in a pent-roof chamber, the spark plug in the middle |
| `edValves-5.webp` | a cylinder head seen from below: three intake and two exhaust valves around the spark plug |
| `edValvetrain-dohc-bucket.webp` | two overhead cams pressing straight down on bucket tappets over the valves |
| `edValvetrain-dohc-finger.webp` | two overhead cams pressing on sliding finger rockers that pivot to open the valves |
| `edValvetrain-dohc-roller.webp` | two overhead cams on finger rockers that each carry a small roller wheel where the cam touches |
| `edValvetrain-sohc-bucket.webp` | one overhead cam pressing on bucket tappets |
| `edValvetrain-sohc-rocker.webp` | one overhead cam driving rocker arms that open the valves on each side |
| `edValvetrain-sohc-roller.webp` | one overhead cam driving rocker arms with roller tips |
| `edValvetrain-ohv.webp` | a cam low in the block, long pushrods up to rocker arms over the valves |
| `edValvetrain-ohv-roller.webp` | the same pushrod layout, with roller wheels on the lifters at the cam |
| `edCam-stock.webp` | a camshaft lobe with a gentle, round egg-shaped profile |
| `edCam-sport.webp` | a camshaft lobe with a taller, broader profile |
| `edCam-race.webp` | a camshaft lobe with a tall, wide, aggressive profile |
| `edCam-atkinson.webp` | a camshaft lobe with a long, drawn-out closing flank (the intake closes late) |
| `edVVT-yes.webp` | a cam sprocket with a hydraulic vane phaser inside it, oil passages in cyan |
| `edValveMat-steel.webp` | a single poppet valve in grey steel |
| `edValveMat-titanium.webp` | a single poppet valve in a slightly blue-gold titanium sheen, visibly slimmer |
| `edSpring-stock.webp` | a single valve spring, thin wire, few coils |
| `edSpring-perf.webp` | a valve spring with thicker wire |
| `edSpring-race.webp` | a double valve spring, one inside the other, thick wire |
| `edEgr-cooled.webp` | an EGR valve with a small finned cooler, exhaust pipe looping back to the intake |
| `edEgr-cooled-full.webp` | the same EGR loop with a bigger cooler and a wide-open valve |

| Diagram | LEFT (low) → RIGHT (high) | Graph | Caption |
|---|---|---|---|
| `valOverlap.webp` | the intake and exhaust valves barely open together at the top of the stroke → both clearly open together, cyan fresh charge pulled through and out | two valve-lift humps overlapping a little → a lot | Overlap lets the exhaust pull fresh charge in at high rpm; at idle it lets exhaust back in. |
| `valFloat.webp` | a valve following the cam lobe exactly → the valve leaving the lobe and bouncing on its seat, red sparks | a power curve that falls off a cliff past a vertical line | Above valve float the valves bounce and power falls. Lighter valves or stiffer springs raise it. |
| `edVVT.webp` | a fixed cam: one lift curve for all rpm → a phased cam: the lift curve sliding left and right with a yellow arrow | a narrow torque hump → a broad flat torque curve | VVT gives back the low end a wilder cam costs. |
| `edEgr.webp` | a cylinder with a bright red-orange flame → a cooler, smaller orange flame, grey exhaust gas mixed into the cyan charge | — | Recirculated exhaust slows and cools the burn: less knock and NOx, a little less power. |

### 3.4 AIR & BOOST card

| File | SUBJECT |
|---|---|
| `edIntake-na.webp` | an open intake trumpet drawing in cyan air, no compressor |
| `edIntake-turbo.webp` | a turbocharger: snail-shaped turbine housing (red-hot) and compressor housing (cool grey) on one shaft |
| `edIntake-supercharger.webp` | a belt-driven supercharger sitting on top of an engine, belt and pulley visible |
| `edIntercooler-small.webp` | a small air-to-air intercooler core with fins |
| `edIntercooler-large.webp` | a large, wide intercooler core with many fins |
| `edTurboSize-small.webp` | a small turbo, small compressor wheel |
| `edTurboSize-medium.webp` | a medium turbo |
| `edTurboSize-large.webp` | a large turbo with a big compressor wheel |
| `edTurboConfig-single.webp` | one turbo on one exhaust manifold |
| `edTurboConfig-twin.webp` | two identical turbos side by side, one per bank |
| `edTurboConfig-sequential.webp` | a small turbo and a large turbo with a valve between them |
| `edTurboConfig-compound.webp` | a large turbo feeding into a small turbo in series, ducts joined |
| `edHousing-tight.webp` | a turbine housing with a small, narrow volute (snail) |
| `edHousing-stock.webp` | a turbine housing with a medium volute |
| `edHousing-loose.webp` | a turbine housing with a large, open volute |
| `edVGT-yes.webp` | a turbine wheel ringed by a set of small movable guide vanes |
| `edAntilag-yes.webp` | a turbo glowing red, with yellow flames coming from the exhaust tip |
| `edScType-roots.webp` | a Roots blower cutaway: two lobed rotors meshing |
| `edScType-screw.webp` | a twin-screw supercharger cutaway: two helical screws meshing |
| `edScType-centrifugal.webp` | a centrifugal supercharger: a snail housing driven by a belt pulley |
| `edNitrous-small.webp` | one small blue nitrous bottle with a thin line |
| `edNitrous-large.webp` | two big blue nitrous bottles with thick braided lines |

| Diagram | LEFT (low) → RIGHT (high) | Graph | Caption |
|---|---|---|---|
| `edBoost.webp` | a cylinder holding a few cyan air dots → the same cylinder packed with many cyan dots, a pressure gauge needle further round | — | Each bar of boost adds about another engine's worth of air, and brings knock closer. |
| `edCompWheel.webp` | a small compressor wheel spinning fast → a big wheel | a boost curve rising early → rising late but going higher | A bigger wheel flows more at the top and spools later. |
| `edTurboSize.webp` | small turbo → large turbo | boost comes in early and fades → comes in late and holds | A small turbo spools early and runs out of breath; a large one comes on later and makes more at the top. |
| `edHousing.webp` | a narrow volute, fast red exhaust jet on the turbine → a wide volute, slower jet | early boost with a choke at the top → late boost, free at the top | A tight A/R spools sooner but chokes the exhaust at high rpm. |
| `edTaperRpm.webp` | boost flat to the limiter → boost tapering down from a marked rpm | flat boost line → line sloping down at the right | Tapering the boost at the top eases the load on the internals for a little top-end power. |
| `edTaperPct.webp` | boost at the limiter barely lower → much lower | two lines ending high → low | Less boost at the limiter: less power at the top, more reliability. |
| `edTqLimit.webp` | an unlimited torque curve with a tall hump → the hump cut flat by a horizontal line | — | An ECU torque limit flattens the curve to protect the gearbox and internals. |
| `edGovRpm.webp` | a diesel power curve running on → falling away past a vertical line | — | A diesel's governor stops it over-revving; power falls away above the rated speed. |
| `edIntercooler.webp` | hot red air leaving the compressor straight to the engine → the same air passing through a core and leaving cyan | — | Cooler air is denser and knocks less; the core costs a little pressure. |

### 3.5 INTAKE & EXHAUST card

| File | SUBJECT |
|---|---|
| `edIntakeSys-carb1.webp` | a single-barrel carburettor with a round air cleaner lid |
| `edIntakeSys-carb2.webp` | a two-barrel carburettor, two throats |
| `edIntakeSys-carb4.webp` | a four-barrel carburettor, four throats seen from above |
| `edIntakeSys-sidedraft.webp` | a pair of horizontal sidedraft carburettors with short trumpets |
| `edIntakeSys-mech.webp` | a mechanical injection pump with metal injector lines to each cylinder |
| `edIntakeSys-efi.webp` | one throttle body with a butterfly plate on a plenum, fuel injectors in the runners |
| `edIntakeSys-itb.webp` | a row of individual throttle bodies, one per cylinder, each with a short velocity stack |
| `edAirFilter-none.webp` | bare velocity stacks (flared trumpets), no filter |
| `edAirFilter-perf.webp` | a red conical cotton performance filter |
| `edAirFilter-stock.webp` | a black plastic airbox with a flat paper element showing through a cutaway |
| `edAirFilter-restrictive.webp` | a small airbox with a long narrow snorkel and a dirty, grey element |
| `edRunner-long.webp` | an intake manifold with long, curling runners |
| `edRunner-medium.webp` | an intake manifold with medium-length runners |
| `edRunner-short.webp` | an intake manifold with short, straight runners |
| `edRunner-variable.webp` | an intake manifold with long runners and a flap that opens a short path |
| `edExhaust-stock.webp` | a cast-iron log exhaust manifold, rough grey surface |
| `edExhaust-sport.webp` | a tubular steel header, primaries of uneven length |
| `edExhaust-race.webp` | an equal-length stainless header, primaries looping to equal length, heat-blued colours |
| `edCat-none.webp` | a straight test pipe where a catalytic converter would be |
| `edCat-sport.webp` | a small, slim metal catalytic converter, honeycomb showing at the end |
| `edCat-stock.webp` | a large oval catalytic converter with heat shield, dense honeycomb |

| Diagram | LEFT (low) → RIGHT (high) | Graph | Caption |
|---|---|---|---|
| `valRam.webp` | a long runner with a slow cyan pressure wave → a short runner with a fast wave | torque peak at low rpm → at high rpm | Long runners ram the most air at low rpm, short ones at high rpm. |
| `valScav.webp` | a cylinder's exhaust pulse in a log manifold, pulses colliding → a tuned header, a low-pressure wave (blue) pulling charge out | — | A tuned header's waves pull exhaust out of the cylinder at the rpm it is tuned for. |
| `edCat.webp` | exhaust flowing through an open pipe, dirty grey smoke → through a honeycomb, clean, small red back-pressure arrow | — | A catalyst cleans the exhaust for a little back-pressure. |

### 3.6 FUEL & SPARK card

| File | SUBJECT |
|---|---|
| `edFuel-gasoline.webp` | a green pump nozzle and a red jerry can |
| `edFuel-race.webp` | a blue race-fuel drum |
| `edFuel-e85.webp` | a yellow-and-green fuel can with an ear of corn beside it |
| `edFuel-methanol.webp` | a clear jug of methanol with a faint blue flame above it |
| `edFuel-diesel.webp` | a black diesel nozzle and a dark drum |
| `edInjector-port.webp` | a fuel injector spraying into an intake port behind the valve |
| `edInjector-direct.webp` | a fuel injector spraying straight into the combustion chamber |
| `edIgnType-distributor.webp` | a distributor cap with plug leads coming out of the top |
| `edIgnType-wasted.webp` | a coil pack with leads to two plugs at a time |
| `edIgnType-coil.webp` | a pencil coil sitting directly on top of a spark plug |
| `edTiming-fixed.webp` | a timing mark locked with a bolt and a padlock |
| `edTiming-auto.webp` | a small ECU box with a knock sensor wire |
| `edAfrMode-fixed.webp` | a carburettor-style mixture screw and a screwdriver |
| `edAfrMode-auto.webp` | a small ECU with a fuel-map grid on its face (coloured cells, no numbers) |

| Diagram | LEFT (low) → RIGHT (high) | Graph | Caption |
|---|---|---|---|
| `edOctane.webp` | a flame front with a red knock spot igniting ahead of it in the end gas → an even, clean flame front | — | Higher octane resists knock: more compression, boost or advance. |
| `edIgnAdv.webp` | the spark firing as the piston reaches the top → firing well before the top; a flame growing during the stroke | torque rising with advance, then a red zone where it knocks | More advance gives the flame time to burn, until it knocks. |
| `edInjector.webp` | port injection: fuel on the back of the valve → direct injection: fuel evaporating inside the cylinder, the charge turning from red to cyan | — | Direct injection cools the charge as it evaporates, which holds off knock. |

### 3.7 COOLING & ELECTRICS card

| File | SUBJECT |
|---|---|
| `edRadiator-small.webp` | a small radiator with few cores |
| `edRadiator-stock.webp` | a standard radiator |
| `edRadiator-large.webp` | a large, thick aluminium radiator |
| `edFan-mechanical.webp` | an engine-driven fan on a water-pump pulley with a viscous clutch hub |
| `edFan-electric.webp` | an electric fan in a shroud with a motor at the centre and a wire |
| `edOilCooler-yes.webp` | a small finned oil cooler with two braided hoses |
| `edAlternator-60.webp` | a small alternator with a pulley |
| `edAlternator-120.webp` | a medium alternator |
| `edAlternator-180.webp` | a large, heavy-duty alternator with a big cooling fan on the front |

| Diagram | LEFT (low) → RIGHT (high) | Graph | Caption |
|---|---|---|---|
| `edThermostat.webp` | a thermostat valve opening early, the coolant cool blue → opening late, the coolant warmer orange | — | A cooler thermostat keeps the engine further from knock; a warmer one wastes less heat. |
| `edRadiator.webp` | heat flowing through a small radiator, red arrows building up → a big radiator, the arrows leaving as blue | coolant temperature climbing with power → staying flat | A bigger radiator holds the coolant cooler at high power. |

### 3.8 Hybrid (on the COOLING & ELECTRICS card) (`hybrid`)

| File | SUBJECT |
|---|---|
| `edHybrid-p2.webp` | an engine, a clutch, a thin electric motor between engine and gearbox, all on one shaft |
| `edHybrid-ps.webp` | a planetary gear set with the engine on the carrier and two motors on the sun and the ring |
| `edHybrid-series.webp` | an engine driving only a generator; a cable to a motor that drives the wheels |
| `edHyDeploy-full.webp` | a battery pouring a wide stream of yellow energy into a motor |
| `edHyDeploy-eco.webp` | a battery filling just the gaps under a torque curve |
| `edHyDeploy-above.webp` | a rev counter with the needle in a green upper zone |
| `edHyDeploy-below.webp` | a rev counter with the needle in a green lower zone |
| `edHyPlug-yes.webp` | a charge plug and cable at an open charge flap |
| `edHyRegen-high.webp` | a wheel with a thick green arrow of energy back to a battery |
| `edHyRegen-low.webp` | the same with a thin green arrow |
| `edHyLps-on.webp` | a balance scale: the engine's load point lifted, the surplus going into a battery |

| Diagram | LEFT (low) → RIGHT (high) | Graph | Caption |
|---|---|---|---|
| `edHyRpm.webp` | electric assist starting low on the rev range → starting high | assist band shaded under a torque curve | Where the motor helps: above or below the rpm you set. |
| `edHyEvKmh.webp` | electric-only driving at a walking pace → up to motorway speed | — | Up to this speed the car may run on the battery alone. |
| `edHyEvKw.webp` | a small battery discharge arrow → a big one | — | The power the car may take from the battery alone before it starts the engine. |
| `edHySoc.webp` | a battery with three marks, low, target and high, set close together → set far apart | — | The battery's charge band: below LOW it charges, above HIGH it spends, and it aims for TARGET. |
| `edHyDeployMJ.webp` | a small energy tank per lap → a big one | — | How much energy per lap the motor may deploy, and the brakes harvest. |

---

## 4. ELECTRIC DRIVE form (`ev`)

| File | SUBJECT |
|---|---|
| `evMotorType-pm.webp` | a motor rotor with rectangular magnets set into its steel, poles alternating red and blue |
| `evMotorType-im.webp` | an induction rotor: a copper squirrel cage of bars and end rings |
| `evWire-round.webp` | a stator slot filled with many round strands of copper wire |
| `evWire-hairpin.webp` | a stator with hairpin-shaped flat copper bars packed tightly in the slots |
| `evConductor-copper.webp` | a coil of copper wire |
| `evConductor-aluminium.webp` | a coil of silver-grey aluminium wire, visibly thicker |
| `evMagnet-ferrite.webp` | a dark grey ceramic ferrite magnet block, large |
| `evMagnet-ndfeb.webp` | a small, shiny nickel-plated neodymium magnet |
| `evMagnet-ndfebDy.webp` | a neodymium magnet with a thin gold-tinted layer at its edges |
| `evRetention-bridges.webp` | a rotor's rim with thin steel bridges holding the magnets in |
| `evRetention-sleeve.webp` | a rotor wrapped in a black woven carbon-fibre sleeve |
| `evCooling-air.webp` | a motor case with deep cooling fins |
| `evCooling-jacket.webp` | a motor case with a spiral water channel, blue coolant inside |
| `evCooling-spray.webp` | oil sprayed in amber drops onto the end windings |
| `evCooling-slot.webp` | coolant channels running through the stator slots beside the copper |
| `evLamination-0.35.webp` | a stack of thick steel lamination sheets, few sheets per height |
| `evLamination-0.2.webp` | a stack of thin steel lamination sheets, many sheets per height |
| `evInverter-igbt.webp` | an inverter box with three large black IGBT modules |
| `evInverter-sic.webp` | a compact inverter box with small silicon-carbide modules on a thin cold plate |
| `evRegen-high.webp`, `evRegen-low.webp` | reuse the hybrid regen pictures (copy the files) |
| `evRearCount-1.webp` | one motor in the middle of a rear axle driving both wheels through a differential |
| `evRearCount-2.webp` | two motors on a rear axle, one beside each wheel |
| `evFront-pm.webp`, `evFront-im.webp` | the PM and induction rotors above, on a front axle |
| `evChem-lead.webp` | a lead-acid battery block with screw terminals |
| `evChem-nimh.webp` | a row of green cylindrical NiMH cells |
| `evChem-lfp.webp` | a flat grey prismatic LFP cell |
| `evChem-nca.webp` | a module of cylindrical lithium cells in a honeycomb holder |
| `evChem-ncaP.webp` | the same lithium module, with thick copper busbars (power cells) |
| `evChem-liHEV.webp` | a small, thin lithium hybrid pack |
| `evChem-nimhHEV.webp` | a long stick of NiMH hybrid cells |

| Diagram | LEFT (low) → RIGHT (high) | Graph | Caption |
|---|---|---|---|
| `evRotorD.webp` | a narrow rotor → a wide one, the air gap ring marked | torque bar growing with the square of the width | Torque grows with the diameter squared; the rim reaches its speed limit sooner. |
| `evStack.webp` | a short stack of laminations → a long stack | torque bar growing in proportion | Torque grows with the length; the knee comes at a lower rpm. |
| `evPoles.webp` | a rotor with 4 alternating red/blue poles → with 12 poles | a frequency arrow growing | More poles: a lighter core, a higher electrical frequency and more iron loss. |
| `evTurns.webp` | a coil with few turns → many turns | the torque-speed curve: high flat torque then knee far right → higher torque, knee far left | More turns: more torque per amp, the knee earlier, less power at speed. |
| `evMaxRpm.webp` | a rotor rim spinning with short motion lines → long ones, red stress at the rim | — | The motor stops at the lowest of this, the rim's limit and the inverter's frequency. |
| `evAmps.webp` | a thin current arrow into the coils → a thick one, the coils glowing red | torque rising then flattening (saturation) | Torque is flux times current until the iron saturates; more current, more heat. |
| `evLamination.webp` | thick sheets with big red eddy-current loops → thin sheets with small loops | — | Eddy-current loss falls with the square of the sheet's thickness. |
| `evMagnet.webp` | a magnet cool with strong field lines → the magnet hot (red), weaker field lines | — | Magnets weaken with heat: ferrite stands more heat but is a third as strong. |
| `evSeries.webp` | a short chain of cells → a long chain | torque-speed curve with its knee moving right | More cells in series is more voltage: the knee moves to a higher rpm. |
| `evKWh.webp` | a small pack → a big pack with more cells in parallel | — | More capacity: more range and more power, for more mass and money. |
| `evYear.webp` | a big heavy old cell → a small light modern cell holding the same energy | — | Energy per kg and cost per kWh improve with the year. |
| `evFrontFd.webp` | small gear driving a slightly larger gear → small gear driving a much larger gear | — | A higher front ratio multiplies the front torque, and tops out at a lower road speed. |

---

## 5. VEHICLE form (`vehicle`)

### 5.1 CHASSIS & DRIVE card

Chassis icons are generic body types, **not** real cars: side view, facing left, no badges, no brand features.

| File | SUBJECT |
|---|---|
| `vhChassis-kei.webp` | a tiny, boxy city car |
| `vhChassis-hatch.webp` | a small, sporty three-door hatchback |
| `vhChassis-roadster.webp` | a small, open two-seat roadster |
| `vhChassis-coupe.webp` | a two-door sports coupé |
| `vhChassis-sedan.webp` | a four-door sports saloon |
| `vhChassis-muscle.webp` | a long-bonnet American-style muscle car |
| `vhChassis-rally.webp` | a hatchback with a roof scoop, mud flaps and a raised ride |
| `vhChassis-gt.webp` | a long, elegant grand tourer |
| `vhChassis-super.webp` | a low mid-engined supercar with side intakes |
| `vhChassis-hyper.webp` | a very low carbon-fibre hypercar with a big rear wing and a fin |
| `vhChassis-proto.webp` | a closed-cockpit track prototype |
| `vhChassis-pickup.webp` | a pickup truck with an open bed |
| `vhChassis-suv.webp` | a tall performance SUV |
| `vhChassis-openwheel.webp` | an open-wheel single-seater racing car |
| `vhDrive-fwd.webp` | a top-down car chassis with only the front axle highlighted green |
| `vhDrive-rwd.webp` | the same with only the rear axle highlighted |
| `vhDrive-awd.webp` | the same with both axles highlighted and a centre shaft |
| `vhDiff-open.webp` | an open differential, spider gears visible |
| `vhDiff-visc.webp` | a viscous limited-slip unit, discs in a sealed drum |
| `vhDiff-clsd.webp` | a clutch-plate LSD, a stack of friction plates on each side |
| `vhDiff-spool.webp` | a solid spool locking the two half-shafts together |
| `vhTC-on.webp` | a tyre with a small dashboard light in the shape of a sliding car |
| `vhLimiter-on.webp` | a speedometer needle stopped against a red peg |

| Diagram | LEFT (low) → RIGHT (high) | Graph | Caption |
|---|---|---|---|
| `vhDiff.webp` | an open diff: the unloaded inner wheel spinning, red smoke → a locked diff: both wheels driving, green arrows | — | An open diff lets the lighter wheel spin; an LSD sends the torque to the wheel that grips. |
| `vhDrive.webp` | a car accelerating, its weight arrow moving rearward; the front wheels lightly loaded → the rear wheels pressed down | — | Weight moves rearward under acceleration, so the rear wheels can put down more. |
| `vhLimitKmh.webp` | a speed curve cut flat low → cut flat high | — | The limiter holds the top speed down; it cannot add speed the car does not have. |

### 5.2 GEARBOX card

| File | SUBJECT |
|---|---|
| `vhGearbox-manual.webp` | an H-pattern gear lever and a clutch pedal |
| `vhGearbox-sequential.webp` | a sequential lever moving straight forward and back |
| `vhGearbox-dct.webp` | a dual-clutch gearbox cutaway, two nested clutch packs |
| `vhGearbox-auto.webp` | a torque converter cutaway (turbine, stator and impeller) |

| Diagram | LEFT (low) → RIGHT (high) | Graph | Caption |
|---|---|---|---|
| `vhGears.webp` | four-speed: a saw-tooth of rpm against speed with big drops → ten-speed: many small drops, staying near the top | — | More gears keep the engine nearer its peak power at every speed. |
| `vhSpacing.webp` | close ratios: small saw-teeth → wide ratios: big saw-teeth | — | Close ratios keep the engine in its band; wide ones cruise at lower rpm. |
| `vhGearing.webp` | a small ring gear (tall gearing) → a big ring gear (short gearing) | wheel torque high/low against top speed in top gear | Short gearing multiplies the torque for acceleration, but hits the redline at a lower speed. |

### 5.3 WHEELS & TYRES card

| File | SUBJECT |
|---|---|
| `vhTire-eco.webp` | a narrow tyre with a fine, siped tread |
| `vhTire-street.webp` | a normal road tyre with grooves |
| `vhTire-sport.webp` | a sport tyre with an asymmetric tread and few grooves |
| `vhTire-semi.webp` | a semi-slick: almost smooth, two shallow grooves |
| `vhTire-slick.webp` | a smooth racing slick, warm (orange tint on the tread) |
| `vhTire-drag.webp` | a tall, wide drag radial with a soft wrinkled sidewall |

| Diagram | LEFT (low) → RIGHT (high) | Graph | Caption |
|---|---|---|---|
| `vhWheel.webp` | a small wheel with a tall sidewall → a large wheel with a thin sidewall, the overall diameter the same | — | The wheel and the sidewall together set the tyre's rolling radius. |
| `vhTireW.webp` | a narrow tyre's contact patch from below → a wide one | — | A wider tyre carries more load before its grip falls away, for more drag and mass. |
| `vhTireA.webp` | a tall sidewall bending under a side force → a short one barely flexing | — | A lower sidewall flexes less: sharper steering, a harder ride. |
| `vhTireWF.webp` | narrow front tyres, wide rears (top view) → all four equal | — | Narrower fronts on a rear-drive car move the balance toward understeer. |
| `vhRating.webp` | a tyre with a small speed gauge and a red zone beyond it → a gauge with the red zone far out | — | Fit a speed rating at least as high as the car's top speed. |

### 5.4 AERO & WEIGHT card

| File | SUBJECT |
|---|---|
| `vhAeroF-splitter.webp` | a flat front splitter under a car's nose |
| `vhAeroF-wing.webp` | a multi-element front wing, as on a single-seater |
| `vhAeroR-lip.webp` | a small lip spoiler on a boot lid |
| `vhAeroR-wing.webp` | a tall rear wing on two uprights |
| `vhAeroFl-undertray.webp` | a flat panel under a car, seen from the side |
| `vhAeroFl-diffuser.webp` | a rear diffuser with vertical strakes, seen from behind |
| `vhWeight-street.webp` | a car seat with a small down arrow |
| `vhWeight-sport.webp` | a lightweight bucket seat, the spare wheel removed |
| `vhWeight-race.webp` | a stripped interior: a roll cage, one bucket seat, bare floor |

| Diagram | LEFT (low) → RIGHT (high) | Graph | Caption |
|---|---|---|---|
| `vhAero.webp` | a car with thin cyan airflow lines and small down arrows → big down arrows on the tyres and a red drag arrow behind | downforce and drag both rising with speed | Wings push the tyres down for more grip in fast corners, and add drag. |
| `vhAeroFl.webp` | air under a high car, slow → air speeding up under a flat floor and expanding out of a diffuser, a low-pressure zone in blue | — | A floor and a diffuser make downforce from the air under the car, with little drag. |
| `vhWeight.webp` | a heavy car on a scale with a big down arrow → a light one with a small arrow | — | Every kg less is quicker acceleration, braking and cornering. |

### 5.5 BRAKES & STEERING card

| File | SUBJECT |
|---|---|
| `vhBrake-steel.webp` | a plain solid steel disc and a single-piston sliding caliper |
| `vhBrake-slotted.webp` | a vented disc with slots across its face |
| `vhBrake-big.webp` | a large drilled disc and a red six-piston caliper |
| `vhBrake-carbon.webp` | a grey carbon-ceramic disc and a yellow caliper |
| `vhBrake-hd.webp` | a heavy, thick truck-style disc and a big caliper |

| Diagram | LEFT (low) → RIGHT (high) | Graph | Caption |
|---|---|---|---|
| `vhRotor.webp` | a small disc, the pads near the hub, short lever arrow → a large disc, long lever arrow, cooler colour | disc temperature rising lap after lap, more slowly on the right | A bigger disc has more leverage and more mass to soak up heat, so it fades later. |
| `vhBrake.webp` | a disc glowing red after laps, fading → staying orange | — | Bigger, better-cooled brakes hold their temperature before they fade. |
| `vhSteer.webp` | a steering wheel turned a long way for a small wheel angle → turned a little for the same wheel angle | — | A quicker (lower) ratio needs less steering-wheel angle: sharper and more nervous. |

### 5.6 SUSPENSION card

| File | SUBJECT |
|---|---|
| `vhSusp-comfort.webp` | a soft coil spring and a slim damper |
| `vhSusp-sport.webp` | a shorter, stiffer spring and damper |
| `vhSusp-coilover.webp` | a coilover with a threaded body and adjuster rings |
| `vhSusp-race.webp` | a coilover with a remote reservoir and adjuster knobs |
| `vhGeoF-strut.webp`, `vhGeoR-strut.webp` | a MacPherson strut: one tall strut to the hub and a single lower arm |
| `vhGeoF-wishbone.webp`, `vhGeoR-wishbone.webp` | a double wishbone: upper and lower A-arms to the hub |
| `vhGeoF-multilink.webp`, `vhGeoR-multilink.webp` | a multi-link: four or five slim links to the hub |
| `vhGeoF-solid.webp`, `vhGeoR-solid.webp` | a solid axle tube joining both wheels, on leaf or coil springs |
| `vhGeoR-twist.webp` | a twist-beam rear axle: two trailing arms joined by a cross beam |

| Diagram | LEFT (low) → RIGHT (high) | Graph | Caption |
|---|---|---|---|
| `vhSusp.webp` | a car leaning a lot in a corner → leaning little, tyres flatter | — | Stiffer suspension rolls less and keeps the tyres flatter, for a harsher ride. |
| `vhGeo.webp` | a strut: the tyre tilting with the body in roll → a double wishbone: the tyre staying flat | — | A wishbone or multi-link holds the tyre flatter in roll than a strut. |
| `vhSpringF.webp` | a car from above in a corner, path drifting wide at the front → (front stiffer) | — | Stiffer at the front moves the balance toward understeer. |
| `vhSpringR.webp` | a car from above in a corner, rear stepping out on the right | — | Stiffer at the rear moves the balance toward oversteer. |
| `vhBarF.webp` | a thin front anti-roll bar twisting → a thick one; the car pushing wide | — | A stiffer front bar takes more of the load transfer at the front: more understeer. |
| `vhBarR.webp` | the same at the rear; the car's tail swinging out | — | A stiffer rear bar takes more of the load transfer at the rear: more oversteer. |
| `vhDamper.webp` | a car body bouncing several times after a bump → settling in one bounce | a decaying wave: slow decay → fast decay | Stiffer dampers settle the body faster, and pass more of the road through. |

---

## 6. PARTS tab (`parts`)

### 6.1 Exhaust

| File | SUBJECT |
|---|---|
| `ptBuild-cast.webp` | a cast-iron log manifold, all ports into one short chamber |
| `ptBuild-tubular.webp` | a tubular header, bent primaries of visibly different lengths into a collector |
| `ptBuild-equal.webp` | an equal-length header on a jig, primaries looped so all are the same length, heat-blued |
| `ptSil-chambered.webp` | a silencer cutaway with baffles and chambers |
| `ptSil-absorptive.webp` | a straight-through silencer: a perforated tube wrapped in packing |
| `ptSil-straight.webp` | an open straight pipe with no silencer |
| `ptPipes-1.webp` | one exhaust pipe after the collector |
| `ptPipes-2.webp` | two pipes side by side after the collector |

| Diagram | LEFT (low) → RIGHT (high) | Graph | Caption |
|---|---|---|---|
| `ptPrimD.webp` | thin primaries, fast yellow gas arrows → fat primaries, slow arrows | power higher low down → higher at the top | A wider primary flows more at the top; a narrow one keeps the gas fast low down. |
| `ptPrimL.webp` | short primaries, a pressure wave returning quickly → long primaries, the wave returning late | the scavenging peak at high rpm → at low rpm | A longer primary tunes the header for a lower rpm. |
| `ptBuild.webp` | primaries of uneven length, pulses arriving at the collector spread out → equal lengths, pulses arriving evenly | — | Equal lengths line the pulses up, so their waves help every cylinder alike. |
| `ptSysD.webp` | a narrow pipe with red back-pressure arrows → a wide pipe, small arrows | — | A wider system has less back-pressure. |
| `ptSysL.webp` | a short system → a long one with more red friction arrows along it | — | A longer system adds friction loss. |
| `ptSil.webp` | baffles reflecting yellow sound waves → a straight-through pipe, loud waves leaving | — | The silencer sets the sound; its own back-pressure is not modelled yet. |

### 6.2 Intake manifold

| File | SUBJECT |
|---|---|
| `piVar-yes.webp` | a manifold with long runners and a flap valve that opens a short path into the plenum |

| Diagram | LEFT (low) → RIGHT (high) | Graph | Caption |
|---|---|---|---|
| `piL.webp` | a short runner on a plenum, fast cyan wave → a long runner, slow wave | the ram peak at high rpm → at low rpm | A longer runner rams most air in at a lower rpm. |
| `piD.webp` | a thin runner, fast air → a fat runner, slow air | — | A wider runner flows more at the top; a narrow one keeps the air fast low down. |
| `piShort.webp` | the flap shut, air taking the long path → the flap open, air taking the short path | two humps joined into one broad curve | A variable manifold takes whichever length fills better at each rpm. |

### 6.3 Air filter

| File | SUBJECT |
|---|---|
| `pfHousing-airbox.webp` | a closed airbox with a snorkel inlet |
| `pfHousing-open.webp` | an open cone filter on a short neck |
| `pfHousing-none.webp` | bare velocity stacks |
| `pfMedia-paper.webp` | a pleated cream paper filter element |
| `pfMedia-nano.webp` | a pleated paper element with a thin white fibre layer on its face |
| `pfMedia-cotton.webp` | a pleated red oiled-cotton element with wire mesh |

| Diagram | LEFT (low) → RIGHT (high) | Graph | Caption |
|---|---|---|---|
| `pfArea.webp` | a small filter, air rushing through, red loss arrows → a big pleated filter, gentle arrows | — | More media area slows the air through it, so less pressure is lost (Darcy's law). |
| `pfInlet.webp` | a narrow inlet, fast air, red loss arrow → a wide inlet, slow air | — | A wider inlet loses less: the loss goes with the air speed squared. |

### 6.4 Camshaft

| File | SUBJECT |
|---|---|
| `pcProfile-gentle.webp` | a cam lobe with a gently rounded nose |
| `pcProfile-street.webp` | a cam lobe with a firmer, quicker flank |
| `pcProfile-race.webp` | a cam lobe with steep flanks and a sharp nose |

| Diagram | LEFT (low) → RIGHT (high) | Graph | Caption |
|---|---|---|---|
| `pcDur.webp` | a narrow valve-lift hump → a wide hump | the torque peak at low rpm → at high rpm | Longer duration holds the valves open longer: more top end, less low end. |
| `pcLift.webp` | a valve opening a small gap → a big gap, more cyan air | — | More lift opens more flow area. |
| `pcLsa.webp` | intake and exhaust humps far apart (wide separation) → close together, overlapping | — | A narrower lobe separation adds overlap and moves the intake's closing. |
| `pcVvt.webp` | the intake hump fixed → the hump able to slide across a shaded range | — | The phaser range is how far VVT may advance the cam. |
| `pcProfile.webp` | a valve accelerating gently → sharply, close to leaving the cam | — | A harder-ground lobe opens the valve faster, and floats it sooner. |

### 6.5 Catalytic converter (planned, `ready:false` in `PART_KINDS`)

Draw these only when that part is built: `cat-cells-low.webp`/`cat-cells-high.webp` (a coarse honeycomb and a fine
one, end-on), and `catCells.webp` (coarse cells, small red back-pressure arrow → fine cells, big arrow).

---

## 7. Checks before handing the set back

- Every file is in the palette, on its pixel grid, with no text or numbers anywhere in it.
- Each icon reads at 64 px: the part is recognisable on its own, without a caption.
- Each diagram's LEFT is the low value and its RIGHT the high value, every time (one diagram the other way round
  would teach the wrong thing).
- Look at each diagram against its caption: does the picture show what the caption says, and nothing it does not?
  If a picture shows a mechanism wrongly (a valve opening the wrong way, a turbo with the turbine on the cold side),
  generate it again rather than retouch it.
- The chassis pictures look like generic types, not real cars.

## 8. For the app (later, not for the generator)

- Show a choice's icon beside its select on the card, and in the `?` help panel. Show a number's diagram in the `?`
  panel, with its caption through `tr()`. `DesignCards` (`src/js/design-cards.js`) already builds that panel.
- Load the files from `assets/designer/` the way `src/js/car-art.js` loads `assets/cars/`, so they work from `file://`
  and the service worker keeps them. A missing file must leave the card as it is now.
- The live sprites (`src/js/sprites.js`) stay drawn in code, because they change with the build. These pictures do
  not.
