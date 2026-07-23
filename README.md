# PIXEL ENGINE SIM v0.2

**A lightweight, 8-bit style internal combustion engine simulator** inspired by *Automation*.

Web-based prototype focused on a **2-cylinder 4-stroke 1.0 L** engine.
Designed to be expandable and later convertible to a mobile app.

![Preview](docs/preview.png)

## Features

- **Live physics simulation**
  - RPM
  - Intake manifold pressure (MAP / boost)
  - Air-Fuel Ratio (AFR)
  - Intake air temperature
  - Coolant temperature
  - Oil temperature
- **Outputs**: Power (HP), Torque (Nm), BMEP, Volumetric Efficiency, Thermal Efficiency, BSFC, Fuel Flow, Knock Risk
- **Animated 8-bit cutaway** of the 2-cylinder engine showing the full 4-stroke cycle (Intake → Compression → Power → Exhaust)
- **Dyno Curve view** – switchable full power & torque graphs vs RPM (with peak markers and current-RPM line)
- **Auto Thermal mode** – coolant and oil temperatures drift toward load-dependent targets over time (dynamic warm-up / heat-soak) instead of being set by hand
- **Engine sound** – a Web Audio engine note whose pitch tracks RPM and whose volume tracks load (toggleable)
- **Save / Load** – store and recall a tuning setup in the browser via `localStorage`
- **Pixel-art GUI** with the Press Start 2P font (self-hosted — works fully offline), chunky controls, and retro gauges
- **Presets**: Optimal / Max Power / Eco / Reset
- **Installable PWA** – manifest + service worker for offline use and "add to home screen"
- Fully responsive (works on desktop + mobile browsers)

## How to Run

### Option 1 – Local
1. Download or clone this repository.
2. Serve the folder over HTTP and open `index.html`, e.g.:
   ```bash
   python3 -m http.server 8000
   # then visit http://localhost:8000
   ```
   > Opening `index.html` directly via `file://` also works, but the PWA/service-worker
   > (offline install) features only activate over `http://` or `https://`.

### Option 2 – GitHub Pages (recommended)
This repo ships a workflow at `.github/workflows/pages.yml` that deploys automatically:
1. Push to `main`.
2. In **Settings → Pages**, set **Source** to **GitHub Actions**.
3. Your sim goes live at `https://<your-username>.github.io/<repo-name>/`.

### Option 3 – Mobile / installable
The page is a PWA. Open it over HTTPS (e.g. GitHub Pages) and use your browser's
**Install app / Add to Home Screen** option for a native-feeling app. You can also wrap it
with **Capacitor** or **Cordova**.

## Controls

| Control               | Range           | Notes |
|-----------------------|-----------------|-------|
| RPM                   | 800 – 8500      | Engine speed |
| Intake Pressure (MAP) | 0.40 – 2.20 bar | 1.00 = atmospheric, >1.0 = boost |
| Air-Fuel Ratio        | 10.0 – 18.0     | ~12.5 peak power, ~15.5 peak efficiency |
| Intake Air Temp       | -10 – 60 °C     | Colder = denser charge = more power |
| Coolant Temp          | 40 – 130 °C     | Optimal ~90 °C (auto-driven in Auto Thermal mode) |
| Oil Temp              | 40 – 150 °C     | Optimal ~100 °C (auto-driven in Auto Thermal mode) |

Buttons: **Optimal / Max Power / Eco / Reset** presets, plus **Auto Thermal**, **Sound**,
**Save** and **Load** toggles/actions.

## Physics Notes (simplified educational model)

- Volumetric efficiency curve peaks around 4800 rpm
- AFR power factor peaks near 12.5–13.0
- MAP scales air mass and indicated mean effective pressure
- Intake-air-temperature density correction (ideal gas, referenced to 25 °C)
- Friction rises with RPM² and is strongly affected by oil temperature
- Knock risk increases with high MAP + lean mixture + high coolant + high intake temp + high RPM → power is automatically derated
- In Auto Thermal mode, coolant/oil relax toward load-dependent targets with a first-order (exponential) time constant
- Standard 4-stroke BMEP → Torque → Power conversion is used

This is **not** a high-fidelity thermodynamic model. It is tuned for fun, learning, and rapid experimentation (the "light Automation" philosophy).

## Project Structure

```
.
├── index.html                     # Complete single-file app (HTML + CSS + JS)
├── favicon.svg                    # App icon
├── manifest.webmanifest           # PWA manifest
├── sw.js                          # Service worker (offline cache)
├── assets/
│   ├── PressStart2P-latin.woff2   # Self-hosted font (no CDN dependency)
│   ├── icon-192.png               # PWA icon
│   └── icon-512.png               # PWA icon (maskable)
├── docs/
│   └── preview.png                # README screenshot
└── .github/workflows/pages.yml    # Auto-deploy to GitHub Pages
```

The app itself still lives entirely in `index.html`; the extra files add offline
support, installability, and deployment.

## Roadmap / Future Expansion

- [ ] More engine configurations (I3, I4, V6, boxer, etc.)
- [ ] Adjustable displacement, compression ratio, cam profiles
- [x] Full dyno sweep graphs (power & torque curves)
- [x] Dynamic thermal model (temps change over time)
- [ ] Forced induction types (turbo, supercharger) with lag
- [ ] Different fuels (petrol, E85, methanol…)
- [ ] Reliability / wear simulation
- [x] Sound (Web Audio API engine note)
- [x] Save / load engine setups
- [x] Mobile app packaging (PWA)

## License

MIT – free to use, modify, and share. Credit appreciated but not required. See [LICENSE](LICENSE).

---

**PIXEL ENGINE SIM** – Built for tinkerers who love engines and pixel art.
