# Prototypes — parked work, not part of the suite

Nothing in here is run by `tests/run.mjs`. It only walks `tests/*.mjs`, and these are one directory
down on purpose: they are **models that have not shipped**, kept because throwing them away would
mean rebuilding them from the write-up when the work resumes.

Same reasoning that put `tests/` itself under version control — a thing that only exists on a scratch
disk is one machine away from not existing.

## `slip.mjs` — the slip-ratio tyre model

Standalone, no browser, no `index.html`: `node tests/proto/slip.mjs`.

Replaces the shipped hard grip clip `F = min(driveF, μ·N)` with force transmitted *through* slip:

```
s  = (ωr − v)/v                              slip ratio, a new state variable
μ  = μ_peak · sin(C · atan(B·s))             Pacejka-lite, B = tan(π/2C)/s_opt puts the peak at s_opt
I_eff · dω/dt = T_axle − F·r                 driven wheels get their own equation of motion
I_eff = I_wheels + I_engine · ratio²         which is why wheelspin is violent in first and tame in fourth
```

`C = 1.4` gives a full-slide plateau at 0.81 of peak; measured tyres sit at 0.75–0.85.

The three things it prints are the three things that had to be checked before touching the app:

1. **Numerical stability.** The slip dynamics are much stiffer than the vehicle dynamics, so the
   worry was that it would need a smaller step than the integrator's existing `dt = 0.005 s`. It
   does not — 0.005/1 and 0.0005/1 agree to 8 ms.
2. **Does gearing finally matter?** With a hard clip a traction-limited car's 0–100 is *identical*
   at every final drive, because the clip binds for the whole run. Here too much torque spins the
   tyres onto the falling branch of the curve and loses time.
3. **Tyre character.** `s_opt` is a real compound property, and a slick peaking early and sharply
   behaves differently from a drag radial that likes to be spun.

**Why it is parked.** Wired into the app it moved the real-car calibration from 2.66 % to 7.79 %
RMS. The investigation is written up in the README (*The inertia investigation*): about half of that
is the slip dynamics and about half is rotational inertia, which the shipped model never charged at
all. Both are correct physics, both make the car slower, and the model was calibrated with neither.
The blocker is the **launch model** — the clutch is currently a kinematic rpm hold rather than a
torque-capacity limit — and until that is reworked there is nothing sensible for the slip curve to
receive at `t = 0`. Then slip, inertia and the launch go in together and the whole set is
recalibrated once.

**Do not resurrect the browser harnesses from that investigation.** They patched the *use site* of
`I_ENGINE` inside copies of `index.html` that lived on a scratch disk, and they hard-code absolute
paths to those copies. The numbers they produced are in the write-up; the copies are gone. Note the
trap they were built to avoid: monkey-patching a script-scope `const` from `page.evaluate` does
nothing at all and silently yields identical rows for every value in a sweep.

## `housing.mjs` — turbine housing sizing

**Not standalone**, unlike the other two: `node tests/proto/housing.mjs` drives the shipped model
through the browser, because the question is what the *app* does, not what a clean-room model would.

`engine.turbineArea = (A/R) × R_wheel`, and A/R comes from the frame size class alone — small 0.42,
medium 0.64, large 0.86. **Nothing about the engine enters.** A 2.0 four and a 6.6 V8 fitted with the
same size class get the same turbine throat, which is not how anyone matches a turbo. The measured
consequence: exhaust flow per mm² of throat spans **202 to 799 g/s** across the presets — a 4×
spread, where a matched set would be roughly constant — and boost thresholds run up to **4275 rpm
late** (the 13B lights at 7275 rpm against a real ~3000). RMS error ~1940 rpm.

Sizing the housing instead to the **tightest that the engine tolerates at rated power** — which is
what a real builder does — takes that to **~700 rpm**, with no per-frame table. And petrol and diesel
split cleanly: petrol is best at a back-pressure ratio of 1.8, diesel is still improving past 3.0.

That split must **not** be asserted as a per-type constant. What stops a petrol engine going tighter
is **knock**: back-pressure raises the trapped residual fraction, and hot residual brings knock on. A
diesel has no spark-knock limit at all, which is precisely why real turbodiesel housings are tight
and why they make boost at 1600 rpm. The split should fall out of the knock model.

**Why it is parked.** Two prerequisites, both found by measurement:

1. ✅ **Pumping work** — `pumpFrictionMEP` charged only for intake depression against atmosphere, i.e.
   the pumping loop with `p_exhaust` assumed to be 1 bar. A tight housing therefore cost *nothing* at
   the top end, so nothing pushed back on tightening it. **Shipped in build 70.**
2. ⬜ **Residual-gas knock** — `knockAt()` carries boost, compression, IAT, coolant, rpm, timing,
   lambda, octane, DI and nitrous, and **no residual term**. Conversion 3 already computes residual
   fraction from `(p_exh/p_int)^(1/γ)` for VE, but it never reaches knock, so the petrol limit does
   not exist. This is the next step.

**Anchor quality — read before tuning anything to these numbers.** Solid and published: VW 2.0 TDI
~1750, Duramax 1600, Focus RS 2.5T ~2000, kei turbos ~2800–3000. Interpretation-dependent, weight
lightly: the 2JZ 3600 (a big single behaves nothing like the factory sequential) and the 13B 3000
(primary rotor only). Tuning to a number someone invented is the trap `test46`'s bands already fell
into once.
