# PIXEL ENGINE SIM v0.1

**A lightweight, 8-bit style internal combustion engine simulator** inspired by *Automation*.

Web-based prototype focused on a **2-cylinder 4-stroke 1.0 L** engine.  
Designed to be expandable and later convertible to a mobile app.

![Preview](https://via.placeholder.com/800x420/0d0d18/00ff88?text=PIXEL+ENGINE+SIM)

## Features

- **Live physics simulation**
  - Air-Fuel Ratio (AFR)
  - RPM
  - Intake manifold pressure (MAP / boost)
  - Coolant temperature
  - Oil temperature
- **Outputs**: Power (HP), Torque (Nm), BMEP, Volumetric Efficiency, Thermal Efficiency, BSFC, Fuel Flow, Knock Risk
- **Animated 8-bit cutaway** of the 2-cylinder engine showing the full 4-stroke cycle (Intake → Compression → Power → Exhaust)
- **Dyno Curve view** – switchable full power & torque graphs vs RPM (with peak markers and current RPM line)
- **Pixel-art GUI** with Press Start 2P font, chunky controls, and retro gauges
- **Presets**: Optimal / Max Power / Eco / Reset
- Fully responsive (works on desktop + mobile browsers)
- Toggle between **ENGINE VIEW** and **DYNO CURVE** tabs on the visualization panel

## How to Run

### Option 1 – Local
1. Download or clone this repository
2. Open `index.html` in any modern browser (Chrome, Firefox, Edge, Safari)

### Option 2 – GitHub Pages (recommended)
1. Push this repo to GitHub
2. Go to **Settings → Pages**
3. Set Source to **Deploy from a branch** → `main` / `/ (root)`
4. Your sim will be live at `https://<your-username>.github.io/<repo-name>/`

### Option 3 – Mobile later
The page is already mobile-friendly. You can wrap it with **Capacitor**, **Cordova**, or turn it into a **PWA** for native-feeling Android/iOS apps.

## Controls

| Control              | Range          | Notes |
|----------------------|----------------|-------|
| RPM                  | 800 – 8500     | Engine speed |
| Intake Pressure (MAP)| 0.40 – 2.20 bar| 1.00 = atmospheric, >1.0 = boost |
| Air-Fuel Ratio       | 10.0 – 18.0    | ~12.5 peak power, ~15.5 peak efficiency |
| Coolant Temp         | 40 – 130 °C    | Optimal ~90 °C |
| Oil Temp             | 40 – 150 °C    | Optimal ~100 °C |

## Physics Notes (simplified educational model)

- Volumetric efficiency curve peaks around 4800 rpm
- AFR power factor peaks near 12.5–13.0
- MAP scales air mass and indicated mean effective pressure
- Friction rises with RPM² and is strongly affected by oil temperature
- Knock risk increases with high MAP + lean mixture + high coolant + high RPM → power is automatically derated
- Standard 4-stroke BMEP → Torque → Power conversion is used

This is **not** a high-fidelity thermodynamic model. It is tuned for fun, learning, and rapid experimentation (the “light Automation” philosophy).

## Project Structure

```
.
├── index.html          # Complete single-file app (HTML + CSS + JS)
└── README.md
```

Everything lives in one file for maximum simplicity during the prototype phase.

## Roadmap / Future Expansion

- [ ] More engine configurations (I3, I4, V6, boxer, etc.)
- [ ] Adjustable displacement, compression ratio, cam profiles
- [ ] Full dyno sweep graphs (power & torque curves)
- [ ] Dynamic thermal model (temps change over time)
- [ ] Forced induction types (turbo, supercharger) with lag
- [ ] Different fuels (petrol, E85, methanol…)
- [ ] Reliability / wear simulation
- [ ] Sound (Web Audio API engine note)
- [ ] Save / load engine setups
- [ ] Mobile app packaging (Capacitor)

## License

MIT – free to use, modify, and share. Credit appreciated but not required.

---

**PIXEL ENGINE SIM** – Built for tinkerers who love engines and pixel art.
