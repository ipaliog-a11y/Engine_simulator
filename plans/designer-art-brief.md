# Art brief: 8-bit part icons, redrawn from real photos

This is the brief for an image generator (Grok Imagine). It asks for **one icon for each choice in a list** on the
designers (ENGINE, ELECTRIC DRIVE, VEHICLE) and the PARTS tab.

**Second version.** The first set (commit 0d8e2b8, since removed) was generated from words alone, and the generator
filled the gaps by inventing things. It drew 16 pistons for 12 cylinders, a single spring for a double spring, a
wheel rim for magnet bridges, and black backgrounds. This version changes three things:

1. **Every icon starts from a real photo** of that part. The generator redraws the photo as pixel art
   (image-to-image); it does not invent the part from words.
2. **Every icon has a "Must show" list** of facts a reviewer can check against the photo: counts, shapes, what is
   attached to what. An icon that misses one fact is redrawn, not retouched.
3. **Anything that is a count or a schematic is not generated.** The app draws those in code (section 6), and the
   value diagrams too (`plans/designer-diagrams-in-code.md`).

Pictures are only pictures: no number in the sim comes from them.

---

## 1. Reference photos

- Take each reference photo from **Wikimedia Commons**, or another source whose licence allows reuse. Use the search
  terms in the tables. Pick a photo where the part is alone, or easy to make out, and shown whole.
- Record each photo's URL, author and licence in `assets/designer/manifest.json`, beside the icon's prompt.
- If no usable photo can be found, **skip that icon and list it as missing** in `assets/designer/README.md`. Never
  draw an icon without a photo.
- Pick a photo of a typical road-car part. Avoid one-off or show parts, and don't show a brand's name or logo.

## 2. The prompt

Image-to-image, with the reference photo attached. Paste this block word for word, then add the row's **Must show**
list as a final sentence ("It must show: …").

> Redraw the attached photo as an 8-bit pixel-art icon. Keep the object's real shape, proportions, number of parts
> and the way they are joined EXACTLY as in the photo; change only the rendering, not the design. Do not add, remove
> or merge any component. Single object, centred, three-quarter view from the upper left (or the photo's own view if
> it shows the part better), filling about 80% of a square frame. Chunky square pixels, hard edges, no anti-aliasing,
> no gradients, flat colour bands and dithering. Palette: metal #6b6b85, highlights #d8d8e8, dim #8a8aa6, shadows
> #26263a and #3a3a55, accents only where the real part has that colour: red #ff4d5e, yellow #ffcc00, blue #3d7bff,
> copper #d9853b, cyan #00ccff, green #00ff88. 1-pixel black outline. Plain flat background. No text, no letters, no
> numbers, no logos.

## 3. Post-processing (scripted, the same for every icon)

1. **Background:** flood-fill from the four edges with a tolerance, and set what it reaches to `#12121c`. Every icon
   ends up on `#12121c`, whatever the generator gave.
2. Area-average onto a 64×64 grid.
3. Snap each colour to the nearest palette colour (the palette above, plus black and `#12121c`).
4. Scale up ×2 with nearest-neighbour to 128×128, and save as WebP at quality 90.
5. Save it as `assets/designer/icons/<form>/<field>-<value>.webp`.

## 4. Review (before the set is handed back)

- Build a contact sheet that shows each icon **beside its reference photo** (`tools/` may hold the script).
- Check every **Must show** fact against the photo, and redraw any icon that misses one.
- Check that the background at the edges is exactly `#12121c`, and that the icon has no text in it.
- Check that each icon still reads at 64 px: someone who knows cars should name the part without a caption.

---

## 5. The icons

`<form>` is the folder: `engine`, `hybrid`, `ev`, `vehicle` or `parts`. A NO, OFF or NONE choice has no icon,
unless the table lists one: the app greys out the ON picture.

### 5.1 ENGINE (`engine`)

| File | Search Commons for | Must show |
|---|---|---|
| `edType-petrol4.webp` | inline four petrol engine | 4 spark plugs or coils in a row on top; one cylinder head |
| `edType-diesel.webp` | diesel engine common rail | injectors with their fuel lines; no spark plugs; a tall, heavy block |
| `edType-twostroke.webp` | two-stroke engine cylinder | 1 finned cylinder; an exhaust port leading to an expansion chamber; no valvetrain or cam cover |
| `edType-rotary.webp` | Wankel rotor housing | a triangular rotor with 3 apexes, inside an epitrochoid (figure-of-eight) housing |
| `edType-electric.webp` | electric motor stator cutaway | a round stator with copper windings, and a shaft |
| `edLayout-inline.webp` | inline-four engine block | cylinders in **one** straight row |
| `edLayout-v.webp` | V8 engine block | **two** banks of cylinders at an angle, one crankshaft between them |
| `edLayout-boxer.webp` | boxer engine | cylinders lying flat on **both** sides of the crank, heads pointing outwards |
| `edValves-2.webp` | two valve cylinder head combustion chamber | **2** valves per chamber |
| `edValves-4.webp` | four valve pent-roof combustion chamber | **4** valves (2 large intake, 2 smaller exhaust) and a central spark plug |
| `edValves-5.webp` | five valve cylinder head | **3** intake + **2** exhaust valves per chamber |
| `edValvetrain-dohc-bucket.webp` | DOHC bucket tappet | **2** camshafts; each lobe sits **directly** on a bucket over the valve |
| `edValvetrain-dohc-finger.webp` | finger follower valvetrain | **2** camshafts; the lobes press finger followers that **pivot** at one end |
| `edValvetrain-dohc-roller.webp` | roller finger follower | as above, with a **roller wheel** on each finger where the lobe touches |
| `edValvetrain-sohc-bucket.webp` | SOHC bucket tappet head | **1** camshaft over bucket tappets |
| `edValvetrain-sohc-rocker.webp` | SOHC rocker arm | **1** camshaft; rocker arms on a shaft reaching out to the valves |
| `edValvetrain-sohc-roller.webp` | SOHC roller rocker | as above, with **rollers** on the rockers |
| `edValvetrain-ohv.webp` | pushrod valvetrain | the cam **in the block**; long **pushrods** up to rockers on the head |
| `edValvetrain-ohv-roller.webp` | roller lifter pushrod | as above, with **roller wheels** at the bottom of the lifters |
| `edVVT-yes.webp` | VVT cam phaser | a cam sprocket with a vane phaser in its hub |
| `edValveMat-steel.webp` | engine poppet valve | a poppet valve: stem, head and seat face |
| `edValveMat-titanium.webp` | titanium valve | the same, in titanium's grey (no gold) |
| `edSpring-stock.webp` | valve spring | **one** coil spring |
| `edSpring-perf.webp` | beehive valve spring | **one** spring that tapers to the top (beehive) |
| `edSpring-race.webp` | dual valve spring | **two** springs, one **inside** the other |
| `edEgr-cooled.webp` | EGR cooler | an EGR cooler: a tube with coolant pipes, joined to an EGR valve |
| `edEgr-cooled-full.webp` | — | no icon; the app uses `edEgr-cooled` |
| `edIntake-na.webp` | velocity stack | open intake trumpets, and nothing that compresses the air |
| `edIntake-turbo.webp` | turbocharger | a turbine housing and a compressor housing (two snails) on **one** shaft |
| `edIntake-supercharger.webp` | Roots supercharger on engine | a blower on the engine, **driven by a belt** from the crank pulley |
| `edIntercooler-small.webp`, `-large` | intercooler core | a finned core with **end tanks** and an inlet and an outlet. Large: noticeably wider and taller |
| `edTurboSize-small.webp`, `-medium`, `-large` | turbocharger | **one photo for all three**, scaled up in steps |
| `edTurboConfig-single.webp` | turbo exhaust manifold | **one** turbo on the manifold |
| `edTurboConfig-twin.webp` | twin turbo V engine | **two** turbos of the same size |
| `edTurboConfig-sequential.webp` | sequential twin turbo | **one small and one large** turbo, with pipework between them |
| `edTurboConfig-compound.webp` | compound turbocharger | a **large** turbo whose outlet feeds the inlet of a **smaller** one |
| `edHousing-tight.webp`, `-stock`, `-loose` | turbine housing | **one photo for all three**: the volute's opening narrow, medium, wide |
| `edVGT-yes.webp` | variable geometry turbine vanes | a ring of movable vanes around a turbine wheel |
| `edAntilag-yes.webp` | rally car exhaust flames | an exhaust tip with a flame coming out of it |
| `edScType-roots.webp` | Roots blower rotors | **two** lobed rotors that mesh, with straight lobes |
| `edScType-screw.webp` | twin screw supercharger rotors | **two** helical (twisted) rotors that mesh |
| `edScType-centrifugal.webp` | centrifugal supercharger | **one** snail housing with a pulley on its shaft |
| `edNitrous-small.webp` | nitrous oxide bottle | **one** bottle with a valve and a line |
| `edNitrous-large.webp` | — | the same bottle, **two** of them side by side |
| `edIntakeSys-carb1.webp` | single barrel carburetor | **1** throat |
| `edIntakeSys-carb2.webp` | two barrel carburetor | **2** throats |
| `edIntakeSys-carb4.webp` | four barrel carburetor | **4** throats |
| `edIntakeSys-sidedraft.webp` | Weber DCOE | a horizontal twin-choke body: **2** throats facing **sideways** |
| `edIntakeSys-mech.webp` | mechanical fuel injection pump | an injection pump with **one line per cylinder** |
| `edIntakeSys-efi.webp` | throttle body | **one** throttle body with a butterfly plate |
| `edIntakeSys-itb.webp` | individual throttle bodies | **one throttle per cylinder** in a row, each with its own trumpet |
| `edAirFilter-none.webp` | velocity stacks | bare trumpets, **no** filter element |
| `edAirFilter-perf.webp` | cone air filter | a conical pleated element with a rubber neck |
| `edAirFilter-stock.webp` | car air filter box | a plastic airbox with a flat panel element |
| `edAirFilter-restrictive.webp` | — | the stock airbox, the element visibly loaded with dust |
| `edRunner-long.webp`, `-medium`, `-short` | intake manifold | runners from a plenum. **One photo**; the runner length is long, medium or short |
| `edRunner-variable.webp` | variable length intake manifold | a manifold with **two** paths and a flap between them |
| `edExhaust-stock.webp` | cast iron exhaust manifold | **one** cast piece, the ports joining after a short distance |
| `edExhaust-sport.webp` | tubular exhaust header | separate welded tubes of **unequal** length into a collector |
| `edExhaust-race.webp` | equal length header | separate tubes, looped so they are the **same** length |
| `edCat-none.webp` | test pipe exhaust | a straight pipe with flanges |
| `edCat-sport.webp` | high flow catalytic converter | a slim round can |
| `edCat-stock.webp` | catalytic converter | an oval can with a heat shield |
| `edFuel-gasoline.webp` | fuel pump nozzle | a fuel nozzle |
| `edFuel-race.webp` | race fuel drum | a metal drum |
| `edFuel-e85.webp` | E85 pump | a fuel nozzle with yellow trim (the colour that marks E85 at the pump) |
| `edFuel-methanol.webp` | methanol jug | a fuel jug (methanol burns with an almost invisible flame, so draw no flame) |
| `edFuel-diesel.webp` | diesel nozzle | a fuel nozzle with **black or green** trim, as at the pump (the colour depends on the country) |
| `edInjector-port.webp` | port fuel injector | a port injector with an O-ring and a connector |
| `edInjector-direct.webp` | gasoline direct injector | a direct injector: a long, slim body for the cylinder head |
| `edIgnType-distributor.webp` | distributor cap | a cap with **one tower per cylinder** plus the centre tower |
| `edIgnType-wasted.webp` | wasted spark coil pack | a coil pack with **two** towers per coil |
| `edIgnType-coil.webp` | coil on plug | a pencil coil with its spark plug boot |
| `edTiming-fixed.webp` | timing light | a timing light |
| `edTiming-auto.webp` | knock sensor | a knock sensor |
| `edAfrMode-fixed.webp` | carburetor mixture screw | an idle mixture screw on a carburettor |
| `edAfrMode-auto.webp` | wideband lambda sensor | an oxygen sensor with its wire |
| `edRadiator-small.webp`, `-stock`, `-large` | car radiator | a core between two tanks. **One photo**, scaled; large is visibly **thicker** |
| `edFan-mechanical.webp` | viscous fan clutch | a fan on a viscous hub |
| `edFan-electric.webp` | radiator electric fan | a fan in a shroud with a motor at the hub |
| `edOilCooler-yes.webp` | oil cooler | a small finned cooler with **two** hose fittings |
| `edAlternator-60.webp`, `-120`, `-180` | alternator | **one photo**, scaled in steps |

### 5.2 HYBRID (`hybrid`)

| File | Search Commons for | Must show |
|---|---|---|
| `edHybrid-p2.webp` | P2 hybrid module | a thin, ring-shaped motor between the engine and the gearbox, on one shaft |
| `edHybrid-ps.webp` | Toyota hybrid planetary gear | a planetary set: the sun, the planets on a carrier, and the ring |
| `edHybrid-series.webp` | range extender generator | an engine joined to a generator, and nothing to the wheels |
| `edHyPlug-yes.webp` | Type 2 charging connector | a charge connector with its cable |

The other hybrid choices (ASSIST, REGENERATION, LOAD-POINT SHIFTING) are strategies, not parts: they are drawn in code
(section 6).

### 5.3 ELECTRIC DRIVE (`ev`)

| File | Search Commons for | Must show |
|---|---|---|
| `evMotorType-pm.webp` | IPM rotor magnets | a rotor with magnets **buried** in slots in its steel |
| `evMotorType-im.webp` | squirrel cage rotor | copper (or aluminium) bars joined by **two end rings** |
| `evWire-round.webp` | stator round wire winding | many **round** strands in the slots |
| `evWire-hairpin.webp` | hairpin stator | **flat rectangular** bars, their bent ends twisted in rows at one end |
| `evConductor-copper.webp` | copper magnet wire spool | a spool of copper wire |
| `evConductor-aluminium.webp` | aluminium wire spool | a spool of silver-grey wire |
| `evMagnet-ferrite.webp` | ferrite magnet | a dark grey ceramic magnet block (arc or block) |
| `evMagnet-ndfeb.webp` | neodymium magnet | a nickel-plated (bright silver) block |
| `evMagnet-ndfebDy.webp` | — | the same block (the grade is not visible). The app may reuse `evMagnet-ndfeb` |
| `evRetention-bridges.webp` | IPM rotor lamination | a single lamination: the magnet slots, with **thin iron bridges** at the rim |
| `evRetention-sleeve.webp` | carbon fibre rotor sleeve | a rotor wrapped in a **carbon-fibre** sleeve |
| `evCooling-air.webp` | finned motor housing | a motor case with **fins** on the outside |
| `evCooling-jacket.webp` | motor water jacket | a motor case with a **coolant channel** in its wall and two pipe fittings |
| `evCooling-spray.webp` | oil cooled motor | the stator's end windings, with oil nozzles over them |
| `evCooling-slot.webp` | direct slot cooling stator | coolant channels **inside the slots**, beside the conductors |
| `evLamination-0.35.webp`, `-0.2` | electrical steel laminations | a stack of thin sheets. **One photo**; 0.2 has visibly **more, thinner** sheets in the same height |
| `evInverter-igbt.webp` | IGBT module | a large black power module with screw terminals |
| `evInverter-sic.webp` | SiC power module | a smaller, flatter module |
| `evFront-pm.webp`, `evFront-im.webp` | — | the app reuses `evMotorType-pm` and `evMotorType-im` |
| `evChem-lead.webp` | lead acid battery | a rectangular case with **two** terminal posts |
| `evChem-nimh.webp` | NiMH cell | cylindrical NiMH cells |
| `evChem-lfp.webp` | LFP prismatic cell | a flat **prismatic** (box-shaped) cell with two terminals |
| `evChem-nca.webp` | 18650 cell module | **cylindrical** cells in a holder |
| `evChem-ncaP.webp` | 21700 cell | **cylindrical** cells, with the busbars shown |
| `evChem-liHEV.webp` | hybrid lithium ion module | a small module of prismatic cells |
| `evChem-nimhHEV.webp` | Prius NiMH battery module | a long, flat **stick** module |

### 5.4 VEHICLE (`vehicle`)

Chassis icons are generic body types: **side view, facing left**, no badge, and no single model's tell-tale features.
For each, take a Commons photo of a typical car of that type for proportions only, and say in the manifest which car
it was.

| File | Search Commons for | Must show |
|---|---|---|
| `vhChassis-kei.webp` | kei car side | a tall, short box; 4 small wheels |
| `vhChassis-hatch.webp` | hot hatch side | a short hatchback, **3 doors** |
| `vhChassis-roadster.webp` | roadster side | **2 seats, open top**, long bonnet |
| `vhChassis-coupe.webp` | sports coupe side | **2 doors**, fixed roof, fastback |
| `vhChassis-sedan.webp` | sports sedan side | **4 doors**, a separate boot |
| `vhChassis-muscle.webp` | muscle car side | a long bonnet, a short deck |
| `vhChassis-rally.webp` | rally car side | a hatchback with mud flaps, **raised** |
| `vhChassis-gt.webp` | grand tourer side | a long bonnet, **2+2** cabin |
| `vhChassis-super.webp` | mid engine supercar side | the cabin **ahead of** the engine; side air intakes behind the doors |
| `vhChassis-hyper.webp` | hypercar side | very low, a **rear wing** |
| `vhChassis-proto.webp` | Le Mans prototype side | a closed cockpit, bodywork **covering** the wheels, a rear wing |
| `vhChassis-pickup.webp` | pickup truck side | a cab and an **open bed** |
| `vhChassis-suv.webp` | performance SUV side | tall, 5 doors |
| `vhChassis-openwheel.webp` | formula car side | **exposed** wheels, a single seat, front and rear wings |
| `vhDiff-open.webp` | open differential cutaway | the spider gears and side gears, **no** clutch plates |
| `vhDiff-visc.webp` | viscous coupling | a sealed drum with interleaved discs |
| `vhDiff-clsd.webp` | clutch type limited slip differential | a **stack of friction plates** beside the side gears |
| `vhDiff-spool.webp` | differential spool | a solid piece with **no** gears inside |
| `vhLimiter-on.webp` | speedometer | a speedometer dial (no numbers drawn) |
| `vhGearbox-manual.webp` | H pattern shifter | a gear lever with an H-pattern gate |
| `vhGearbox-sequential.webp` | sequential shifter | a lever that moves **only** forward and back |
| `vhGearbox-dct.webp` | dual clutch transmission cutaway | **two** nested clutches |
| `vhGearbox-auto.webp` | torque converter cutaway | a torque converter: impeller, turbine and stator |
| `vhTire-eco.webp` | low rolling resistance tyre tread | a narrow tyre, a fine tread |
| `vhTire-street.webp` | summer tyre tread | a road tread with grooves |
| `vhTire-sport.webp` | ultra high performance tyre | an **asymmetric** tread with large tread blocks |
| `vhTire-semi.webp` | semi slick tyre | an almost smooth tread with **few** grooves |
| `vhTire-slick.webp` | racing slick | **no** tread at all |
| `vhTire-drag.webp` | drag radial | a tall, soft sidewall, a smooth or nearly smooth tread |
| `vhAeroF-splitter.webp` | front splitter | a flat plate **under** the front bumper |
| `vhAeroF-wing.webp` | formula front wing | a multi-element wing with **endplates** |
| `vhAeroR-lip.webp` | lip spoiler | a small lip **on** the boot lid |
| `vhAeroR-wing.webp` | rear wing | a wing on **uprights**, with endplates |
| `vhAeroFl-undertray.webp` | car flat underbody | the underside of a car: **flat** panels |
| `vhAeroFl-diffuser.webp` | rear diffuser | upswept channels with **vertical strakes** |
| `vhWeight-street.webp` | spare wheel | a spare wheel and jack (what is taken out first) |
| `vhWeight-sport.webp` | bucket seat | a lightweight bucket seat |
| `vhWeight-race.webp` | roll cage | a roll cage in a stripped shell |
| `vhBrake-steel.webp` | brake disc and caliper | a **solid** disc and a **single-piston** sliding caliper |
| `vhBrake-slotted.webp` | slotted brake disc | a **vented** disc (two faces with vanes between them) with **slots** |
| `vhBrake-big.webp` | big brake kit | a large disc and a **multi-piston** fixed caliper |
| `vhBrake-carbon.webp` | carbon ceramic brake | a **dark grey, speckled** disc |
| `vhBrake-hd.webp` | truck brake disc | a thick, heavy disc and caliper |
| `vhSusp-comfort.webp` | shock absorber and spring | a damper with a **long, soft** spring around it |
| `vhSusp-sport.webp` | lowering spring | a **shorter** spring on a damper |
| `vhSusp-coilover.webp` | coilover | a **threaded** body with adjusting collars |
| `vhSusp-race.webp` | remote reservoir damper | a coilover with a **remote reservoir** on a hose |
| `vhGeoF-strut.webp` | MacPherson strut | a strut fixed to the hub; **one** lower arm |
| `vhGeoF-wishbone.webp` | double wishbone suspension | **two** A-arms (upper and lower) to the upright |
| `vhGeoF-multilink.webp` | multi-link suspension | **four or five** separate links to the upright |
| `vhGeoF-solid.webp` | solid axle | **one** axle beam joining both wheels |
| `vhGeoR-twist.webp` | twist beam rear axle | **two** trailing arms joined by **one** cross beam |
| `vhGeoR-*` (strut, wishbone, multilink, solid) | — | the app reuses the `vhGeoF-*` icons |

### 5.5 PARTS (`parts`)

| File | Search Commons for | Must show |
|---|---|---|
| `ptBuild-cast.webp`, `-tubular`, `-equal` | — | the app reuses `edExhaust-stock`, `-sport` and `-race` |
| `ptSil-chambered.webp` | chambered muffler cutaway | **baffles and chambers** inside |
| `ptSil-absorptive.webp` | straight through muffler cutaway | a **perforated** core with packing around it |
| `ptSil-straight.webp` | straight pipe exhaust | an open pipe, no silencer |
| `pfHousing-airbox.webp`, `-open`, `-none` | — | the app reuses `edAirFilter-stock`, `-perf` and `-none` |
| `pfMedia-paper.webp` | paper air filter element | pleated **cream** paper |
| `pfMedia-nano.webp` | — | the same element; the app may reuse `pfMedia-paper` (the nanofibre layer cannot be seen) |
| `pfMedia-cotton.webp` | oiled cotton air filter | pleated **red** cotton between **wire mesh** |
| `pcProfile-*` | — | drawn in code: the lobe shape comes from the valve-lift drawer |
| `piVar-yes.webp` | — | the app reuses `edRunner-variable` |

## 6. Drawn in code, not generated

These are counts and schematics. The app draws them from the build's own values, in `src/js/sprites.js` style:

- the cylinder count (`edCyl-*`);
- which wheels are driven (`vhDrive-*`);
- the number of rear motors (`evRearCount-*`);
- the pipes after the collector (`ptPipes-*`);
- the hybrid strategies (`edHyDeploy-*`, `edHyRegen-*`, `edHyLps-*`) and the EV regeneration (`evRegen-*`);
- traction control (`vhTC-on`);
- the cam lobe shapes (`edCam-*`, `pcProfile-*`);
- the shared empty-socket icon (`_none`).

The value diagrams are in `plans/designer-diagrams-in-code.md`.
