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
