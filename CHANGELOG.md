# Changelog

All notable changes to Pixel Engine Sim.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions are `MAJOR.MINOR`, and every commit carries a unique **build number** — a counter in the
file that only ever goes up, bumped by `tools/stamp.mjs` and enforced by `--check`.

It was originally the repository's commit count, which broke on the first squash-merge: three
stamped commits collapse into one, so `main`'s count came out *below* the number already written
into the file and `--check` failed on a repository that was perfectly correct. A count that can
shrink cannot carry a number that must never repeat.

This file starts at v0.6. Entries before it were reconstructed from the merged pull requests, so
they are accurate about *what* shipped but not about the day it shipped.

---

## [Unreleased]

Working toward **v1.0 — every number derived, not fitted.**

### Investigation — the slip-ratio model, rotational inertia, and a defect in the shipped physics

Not a release entry: nothing here shipped. It is recorded because the experiment **found a real
defect in the model that is on `main`**, and because the failures are part of the finding.

Wiring up the slip-ratio curve — `μ = μ_peak·sin(C·atan(B·s))` with a wheel-speed state variable and
`I_eff = I_wheels + I_engine·ratio²` — moved the real-car 0–100 calibration from **2.66 % to 7.79 %
RMS**, past the suite's 5 % threshold, with every car coming out slow.

Isolating it: inertia alone costs **16.27 %**; inertia plus slip costs **7.78 %**; slip with engine
inertia set to literally zero still costs **5.37 %**. So the regression is about half slip dynamics
(≈2.7 pp) and half engine inertia (≈2.4 pp) — an early reading of "inertia dominates, the slip model
is fine" was wrong and is corrected here.

Three explanations were tested and all three are dead. **Driveline efficiency** would need 0.972 on
an RWD manual against a real 0.88–0.93. **Engine inertia** would need 0.03 kg·m² against a real
0.10–0.20. **Tyre grip** is backwards — cutting μ made it monotonically worse (7.22 → 9.08 → 14.10 %)
because the cars are already too slow.

What is left is the AWD WRX at **+5.9 %**, unmoved by a 15 % grip swing, which traction cannot
explain. Reflected engine inertia in first gear is ≈21.6 kg·m² ≈ 190 kg of apparent mass on 1470 kg —
**+13 % effective mass, ≈+5 % on 0–100.** The inertia term is right; **the shipped model has been
giving every car a free ~6 % by never charging rotational inertia**, and the 2.66 % calibration was
reached with that discount in place, against a hard grip clip that flatters the launch in the same
direction. Two compensating errors reading as accuracy.

Reverted rather than shipped. The fix is the **launch model** — the clutch as a torque-capacity limit
rather than a kinematic rpm hold — after which slip and inertia go in together and the set is
recalibrated once. Documented in full in the README, including two harness failures of the same kind
(monkey-patching a script-scope `const`, which silently produced identical sweep rows and was briefly
reported as a null result). **Rim material/weight** is deferred behind the same work.

### Changed — the conversion plan

Now **five** steps, not four. Exhaust is folded into a **gas dynamics** step rather than standing
alone: `EXHAUST{topGain, lowLoss}` and `CAM{scav}` are separate fitted knobs for one physical
effect — the pressure wave returning down the primary during overlap — so deriving either alone
leaves the other double-counting it. That same step covers intake ram and wave tuning, and is what
should finally retire `CAM{peakShift}` and roll off the two presets that still peak at the limiter.

Order: valvetrain ✅ → tyre ◐ → **gas dynamics** → turbo maps → combustion cycle.

### Conversion 2 of 5 — tyre  *(partly done)*

Unlike the valvetrain, this mostly **adds physics that was missing** rather than replacing fitted
coefficients — "identify the reason and add the functionality".

- **Rolling resistance now rises with speed.** Hysteresis grows with how fast the carcass is
  deformed, so Crr climbs roughly with v². Checked against Michelin passenger-tyre data (0.010 at
  80 km/h, 0.013 at 160, 0.016 at 200); a fixed Crr was understating resistance by 60% at the speeds
  a fast car actually reaches. Wired into the acceleration run, the top-speed scan and the lap solver.
  **Top-speed accuracy against real cars: RMS 9.3% → 6.5%, mean bias +5.3% → +1.8%.** The Hellcat —
  the one reference car that is genuinely neither governed nor rev-limited — went from +4.1% to +0.6%.
- **Tyre speed rating** is now a spec you choose (T/H/V/W/Y/(Y)), defaulted per compound, shown in
  the VEHICLE panel and flagged red when the build out-runs it. A drag radial rates below a touring
  tyre, so fitting one for the strip caps what the car can safely do.

**What it deliberately does not do.** The rating does *not* cap top speed. Four of the reference
cars stop short of their drag-limited speed because of a manufacturer governor, and capping them
with a tyre rating would produce the right number through the wrong mechanism — the residual +3 to
+8% on those four is a missing ECU limiter, not a missing tyre model.

**What was tried and rejected.** Deriving the rating from tyre dimensions. Sidewall height is the
obvious proxy and it is confidently wrong: it rates a McLaren F1's tall 315/45R17 at 170 km/h when
the real tyre is good for 390. Rating comes from the belt package and materials, which the model
does not represent, so it is an input rather than a bad derivation.

**Still to do in this conversion:** the slip-ratio curve, replacing the hard `min(driveF, mu·N)` grip
clip. It was built, and it is **parked** — see the investigation above. It needs a wheel-speed state
variable in the acceleration integrator, and it cannot land until the launch model is reworked.

### Conversion 1 of 5 — valvetrain and port flow  *(done)*

The head is now modelled from geometry and mechanics rather than assumed. New inputs: **valves per
cylinder** (2/4/5), **valve material** (steel/titanium), **valve springs** (stock/performance/race).
Everything else is derived:

- **Intake valve diameter** from a packing limit measurable off a real head (2-valve canted 0.50 of
  bore, 4-valve pent-roof 0.39 each, 5-valve 0.31). Total intake area over bore area comes out
  0.250 / 0.304 / 0.288 — five valves are *worse* than four, which is why the industry dropped them.
- **Valve mass** from its own geometry: a head disc that scales with diameter on a stem that does
  not, since stem length is set by deck height. Derived masses land inside real published bands
  from 31 mm to 52 mm — a 3× mass range. (Scaling the stem too, the obvious mistake, put a 52 mm
  valve at 227 g against a real 152 g and predicted a big V8 floating at 3800 rpm.)
- **Valve float** from the spring/inertia balance: `m_eff·accel·(L/2)·(2π/θ)²·ω² ≤ F_seat + k·L`.
  Shown in the DESIGN panel and flagged red when it falls below the redline, because then the
  engine cannot use the rev range it claims.
- **Port choking** from Taylor's inlet Mach index. The loss grows with the square of the excess
  over Z = 0.5, which is what a dynamic-pressure loss does; the constants reproduce Taylor's
  published curve and are not fitted to these engines.

**What it fixed.** Presets making peak power at the exact rev limiter: **4 → 2**. The 5.0 V8 Muscle
(peak 100% → 81% of redline) and the 6.2 S/C V8 (100% → 95%) are both big-bore two-valve engines,
and both now roll off for a stated reason — Z = 0.69 and 0.58 at the limiter. Real-car acceleration
calibration **unchanged at 2.66% RMS**.

**What it did not fix, and why.** The ITB Screamer and the V12 still peak at the limiter. Both are
well-designed four-valve high-revvers that genuinely are neither port-choked (Z = 0.54, 0.47) nor
float-limited (16124, 14686 rpm). Their peak position is set by intake wave tuning and charge
trapping — the next conversion. `test44` records this as a budget of 2 that cannot silently grow.

**Still fitted, marked for removal:** `CAM{peakShift, ampMul, loWiden, lowLoss, scav}` still shapes
the base VE bell curve. When wave tuning and trapping are derived, the powerband position will
emerge from cam duration instead of being asserted by `peakShift`.

The model currently reaches its accuracy partly through lumped coefficients that were tuned until
the outputs matched reality (`CAM{peakShift, ampMul, scav}`, `EXHAUST{topGain, lowLoss}`,
`TURBO{spool, choke, k, flow}`, `IMEP_K`, `DIFF_ASYM0`, `KVCAP`). v1.0 replaces them with quantities
derived from geometry and physical law, component by component, and accepts whatever accuracy that
produces rather than tuning toward a target.

Planned order: valvetrain and port flow → tyre → turbo maps → combustion cycle.

---

## [0.6] — 2026-08

The housekeeping release: versioning, a changelog, and the test suite finally under version control.

### Added
- **`CHANGELOG.md`** — this file.
- **Build numbers.** Every commit is stamped `v0.6 build N`, where N is the commit count.
  `node tools/stamp.mjs` writes it, `--check` proves a committed stamp matches its history.
- **`tests/` is now in the repository.** The entire suite — 18 files including the real-car
  acceleration calibration and the internal-consistency checks — had existed only on a scratch disk
  and would have been lost with the machine it sat on. It is the ground truth the v1.0 rewrite will
  be judged against, so it belongs in the repo.
- **`tests/run.mjs`** — a runner that reports by **exit code**. The ad-hoc runner it replaces
  grepped stdout for "FAIL", which meant a test that *crashed* was reported as passing; `test42` sat
  broken and green that way.
- **`tests/aero.mjs`** — the first check of the drag model against real cars. Nothing previously
  tested it: the existing calibration only covers 0–100, which is traction-limited and says nothing
  about aerodynamics.

### Fixed
- **The lap solver and the acceleration run now have a rev limiter.** `bestGear()` skipped every
  gear that would over-rev except the top one, then returned torque clamped to the redline — so past
  its gearing's own ceiling a car kept making peak wheel torque and only aerodynamic drag stopped
  it. A 6.2 supercharged V8 coupe geared for 259 km/h was reaching **372 km/h on the Nordschleife —
  9184 rpm, 43% past its 6400 redline** — and its 1000 m trap read 366 km/h.

  This gave backwards tuning advice, not merely a wrong number: with no limiter, short gearing cost
  nothing on a straight, so the app rated the *shortest* final drive as the fastest way round the
  Nordschleife. Corrected, short gearing costs 17 s and the optimum moves to a tall setting.

  Cars whose top speed is drag-limited rather than rev-limited are bit-identical, and the real-car
  calibration is unchanged at 2.66% RMS.

### Changed
- **Greek translation paused** while the physics core is rewritten. New strings must still be
  wrapped in `tr()`; the untranslated backlog is counted, printed on every test run, and held to a
  budget that has to be raised deliberately. The debt stays visible instead of being hidden by
  deleting the check.

### Known limits (documented, not hidden)
- No engine braking above the limiter, so a steep descent can carry a car a km/h or so past it.
- Power peaks *exactly at the rev limiter* on four presets (2.0 ITB Screamer, 5.0 V8 Muscle,
  6.2 S/C V8, 6.5 V12) — `computeVE`'s valve-float term only bites *above* the redline, so those
  curves never roll off inside their own rev range. Real engines peak at 90–98% of redline. Fixing
  this properly needs a valvetrain model, which is the first v1.0 conversion.
- Turbo lag does not reach the performance numbers; both solvers use steady boost per rpm.
- The racing line does not know what car is driving it.

---

## [0.5] — earlier

Everything below shipped under the v0.5 label, which was set at PR #9 and never moved again through
28 further merged pull requests. The list is grouped by area rather than by release.

### Vehicle and track
- Vehicle layer: chassis, drivetrain, tyres, aero → acceleration and top speed (#22), corrected so
  performance no longer depended on live driving state (#23).
- Brakes and suspension, with 100–0 and 0–200–0 tests (#24).
- Chassis-linked factory fitment, and the gearing number explained (#29).
- Launch clutch model and top-speed search fixed — peaky engines were being penalised (#30).
- Gearbox types: manual, sequential, DCT, torque-converter automatic (#31).
- Differentials: open, viscous LSD, clutch-plate LSD, spool (#32).
- Test track: three circuits, a lap solver, a limit-coloured map (#33).
- Racing-line optimisation and a hot-lap report with corner speed traps (#35).
- Track elevation, GPX circuit import, and the Nordschleife (#36).
- Track objectives, with lap time on the scorecard (#37).

### Engine
- Configurable engine designer (#2) — the v0.3 milestone.
- Cooling subsystem (#3).
- Turbo spool and lag, plus a power-calibration and curve-shape fix (#4).
- Dynamic throttle and load driveline — drive it, rather than setting rpm (#5).
- Cam profiles and VVT (#6).
- Fuel types: pump and race gas, E85, methanol (#7).
- Electrical subsystem: alternator, battery, ignition misfire (#8).
- Auto ignition timing, induction and metering systems (#9) — the v0.5 milestone.
- Reliability and wear simulation (#10).
- Load model fixed (a torque-valley trap), slow deceleration fixed, DFCO added (#13).
- Engine presets, a 1.6 sport default, cylinder dropdown (#15).
- Forced-induction depth: turbo configurations, supercharger types, anti-lag, nitrous (#16).
- Emissions and sound: CO/HC/NOx, catalytic converter, engine-note character (#17).
- New engine types: diesel, two-stroke, rotary (#20).
- Diesel realism: cylinder-pressure cap and top-end falloff, 6.6 preset retuned (#25).
- AUTO fuel mixture — a 3D ECU AFR map over load × rpm (#26), made the default with a live
  visualiser (#27), then made editable cell by cell (#28).

### Interface
- Offline support, PWA, sound, thermal model, repo hygiene (#1).
- Engine view reworked into a test-bench schematic; WEAR toggle and full-screen (#11).
- Scoring, dyno-pull logging, file save/open/share (#12).
- Intercooler sizes, in-app Guide and Options tabs, tab-aware side panel (#18).
- Strategy layer: parts cost, budget, reliability, objective challenges (#19).
- Portrait-friendly responsive layout and Greek localisation (#21).
- Printable dyno report: PNG and library-free PDF export (#34).

[Unreleased]: https://github.com/ipaliog-a11y/Engine_simulator/compare/main...HEAD
[0.6]: https://github.com/ipaliog-a11y/Engine_simulator/releases/tag/v0.6
