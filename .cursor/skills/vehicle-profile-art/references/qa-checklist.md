# Visual QA

Eye-check the 960×640 picture against a real side-view photo of that trim before
calling art done. Regenerate if a bullet fails; do not "fix" a wrong silhouette
in the sim.

## Must hold

- [ ] Car faces **left** (nose left, tail right)
- [ ] Exact **side elevation** (not ¾, not elevated chase cam)
- [ ] Same **coastal road** scene: asphalt, guardrail, sea, hills left, blue sky + pixel clouds
- [ ] Chunky **pixel** look, not smooth photoreal or plastic CGI
- [ ] Car spans roughly **~80%** of the frame width, wheels on the road
- [ ] Recognisable as **this** year/generation (compare brochure side view)
- [ ] **No** readable text, watermark, or logo lockup
- [ ] Factory body — no random aftermarket parts

## Common failure modes (from `assets/cars/README.md` + generics)

| Symptom | Fix |
|---|---|
| Open-wheeler with enclosed arches | Regenerate; stress EXPOSED wheels / no fenders |
| Coupe/roadster that looks like the S2000 | Stronger model cues; for generics use kei as style ref |
| Stray side badge / lettering | Light retouch or regenerate |
| Wrong paint or generation | Fix the phrase; regenerate |
| Different background | Regenerate with the S2000 reference attached |

## Not judged by art

Power, mass, Cd, gearing, lap times — those are import-vehicle / physics. A pretty
wrong car is still a fail for this skill; a correct silhouette with the wrong hp
is an import problem, not an art one.
