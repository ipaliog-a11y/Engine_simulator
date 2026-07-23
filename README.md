# PIXEL ENGINE SIM v0.3

**A lightweight, 8-bit style internal combustion engine *designer* & simulator** inspired by *Automation*.

Design an engine from the ground up — cylinders, bore & stroke, compression, forced
induction, exhaust, fuel octane, injection and ignition — then run it on the dyno and
watch the physics respond. Web-based, fully offline-capable, installable as a PWA.

![Preview](docs/preview.png)

## Features

### Engine Designer (new in v0.3)
Configure a build on the **DESIGN** tab, press **BUILD & DYNO**, and every parameter
feeds the physics:

- **Bottom end** — cylinder count (1–12), layout (inline / V / boxer), bore, stroke,
  compression ratio, redline. Bore × stroke × cylinders sets the displacement.
- **Air path** — naturally aspirated / turbo / supercharger, boost target, intercooler,
  and exhaust (stock / sport / race).
- **Fuel & spark** — fuel octane (RON), injector type (port / direct), ignition advance
  and ignition type (distributor / wasted spark / coil-on-plug).
- **Cooling** — radiator size (small / stock / large), cooling fan (none / mechanical /
  electric), oil cooler, and thermostat opening temperature.

These couple realistically: octane, compression, boost, intake temperature and ignition
advance all feed a **knock model**, and direct injection / higher octane buy back knock
margin so you can run more boost or timing. Get it wrong and the ECU derates power. The
**cooling subsystem** sets running temperatures in Auto Thermal mode — an under-sized
radiator with no fan will heat-soak and overheat under load (and at idle), which in turn
saps power; a large radiator, electric fan and oil cooler keep it cool.

![Design tab](docs/design.png)

### Simulation & live tuning
- **Live outputs**: Power (HP), Torque (Nm), BMEP, Volumetric Efficiency, Thermal
  Efficiency, BSFC, Fuel Flow, Knock Risk.
- **Animated cutaway** that renders your actual cylinder count through the full 4-stroke
  cycle (Intake → Compression → Power → Exhaust).
- **Dyno Curve** — full power & torque vs RPM out to your redline, with peak markers and a
  live current-RPM line.
- **Runtime controls**: RPM, MAP (load/boost), AFR, intake-air / coolant / oil temps.
- **Auto Thermal mode** — coolant & oil drift toward load-dependent targets over time,
  balanced against the cooling subsystem's capacity (radiator airflow scales with RPM;
  the fan provides idle cooling).
- **Engine sound** — Web Audio note pitched to firing frequency (scales with cylinder
  count & RPM) and load.
- **Save / Load** — stores and recalls the entire build + tune via `localStorage`.
- **Presets**: Optimal / Max Power / Eco / Reset (adapt to the current engine).
- **Installable PWA**, self-hosted font, works fully offline.

![Dyno](docs/dyno.png)

## How to Run

### Local
Serve the folder over HTTP and open `index.html`:
```bash
python3 -m http.server 8000    # then visit http://localhost:8000
```
> Opening via `file://` works too, but the PWA/offline features only activate over `http(s)`.

### GitHub Pages
This repo ships `.github/workflows/pages.yml`. Push to `main`, set **Settings → Pages →
Source: GitHub Actions**, and it deploys to
`https://<your-username>.github.io/<repo-name>/`.

## Runtime Controls

| Control               | Range              | Notes |
|-----------------------|--------------------|-------|
| RPM                   | 800 – redline      | Redline comes from the design |
| Intake Pressure (MAP) | 0.30 – design max  | Max = 1.05 bar (NA) or 1.0 + boost |
| Air-Fuel Ratio        | 10.0 – 18.0        | ~12.5 peak power, ~15.5 peak efficiency |
| Intake Air Temp       | -10 – 60 °C        | Colder = denser charge = more power |
| Coolant Temp          | 40 – 130 °C        | Optimal ~90 °C (auto in Auto Thermal) |
| Oil Temp              | 40 – 150 °C        | Optimal ~100 °C (auto in Auto Thermal) |

## Physics Notes (simplified educational model)

- Displacement derived from bore, stroke and cylinder count.
- VE curve peak shifts with bore/stroke ratio and redline; exhaust choice trades low-end
  for top-end scavenging.
- Compression scales indicated work and efficiency via a relative Otto-cycle factor.
- Forced induction raises achievable MAP; without an intercooler the charge heats up.
  Superchargers cost parasitic drive power.
- Ignition timing has a max-brake-torque optimum — too little or too much loses power, and
  over-advance feeds knock.
- Knock combines boost, compression, charge/coolant temperature, RPM, timing and mixture,
  offset by octane and direct injection; high knock derates power.
- Cooling balances load-generated heat against radiator capacity + airflow (RPM-driven)
  and fan; the thermostat sets the floor temperature. Overheating (>~108 °C) costs power.
- Standard 4-stroke BMEP → Torque → Power conversion throughout.

Absolute numbers are ballpark, not bench-calibrated — this is tuned for fun, learning and
rapid experimentation (the "light Automation" philosophy).

## Project Structure

```
.
├── index.html                     # Complete single-file app (HTML + CSS + JS)
├── favicon.svg / manifest.webmanifest / sw.js   # PWA (icon, manifest, offline SW)
├── assets/                        # Self-hosted font + PWA icons
├── docs/                          # README screenshots
└── .github/workflows/pages.yml    # Auto-deploy to GitHub Pages
```

## Roadmap / Future Expansion

- [x] Configurable engine designer (cylinders, bore/stroke, compression, induction, fuel, spark)
- [x] Full dyno sweep graphs (power & torque curves)
- [x] Dynamic thermal model (temps change over time)
- [x] Forced induction (turbo / supercharger, boost, intercooler)
- [x] Sound (Web Audio API engine note)
- [x] Save / load engine setups
- [x] Mobile app packaging (PWA)
- [ ] Proper V / boxer bank visuals & firing-order animation
- [ ] Cam profiles & valvetrain (variable valve timing)
- [ ] Turbo lag / spool modelling vs. RPM
- [x] Cooling subsystem (radiator size, fan, oil cooler, thermostat) feeding the thermal model
- [ ] Electrical subsystem (alternator load, starter, ignition dwell)
- [ ] Different fuels (E85, methanol, race gas) with their own knock/energy properties
- [ ] Reliability / wear simulation
- [ ] Bench calibration pass for realistic absolute power figures
- [ ] Native Android build (wrap the PWA with Capacitor or a Trusted Web Activity)

> **Android note:** the app is intentionally a self-contained, offline-capable PWA with no
> server or external network dependencies and all persistence in `localStorage`. That keeps
> it wrappable into an Android APK later (Capacitor or a Trusted Web Activity) with minimal
> changes. New features are kept touch-friendly and framework-free to preserve that path.

## License

MIT – free to use, modify, and share. Credit appreciated but not required. See [LICENSE](LICENSE).

---

**PIXEL ENGINE SIM** – Built for tinkerers who love engines and pixel art.
