# Gap report template

Use when accuracy stays outside band after honest inputs, or when the car cannot be
scored yet. Paste into the PR / user reply; keep numbers concrete.

```markdown
## Gap report: <Exact Preset Name>

**Verdict:** blocked / research-only / imported unscored (`confidence: low`)

### Model vs published

| Metric | Model | Real | Error | Band |
|---|---|---|---|---|
| Peak power | … hp | … hp | …% | ±25% |
| 0–100 (matched) | … s | … s | …% | ±35% |
| Top speed | … km/h | … km/h | …% | ±35% |

### What was checked (inputs, not physics)

- Curb vs dry / driver mass:
- Power unit (PS / SAE gross / net):
- Gearset published?:
- ECU taper / tqLimit / govRpm:
- Chassis / engPos:
- Sources re-read:

### Likely cause

(one of: missing published gearset; SAE gross rating; model breathing gap; wrong
archetype; Cd/area estimate; turbo spool; …)

### Suggested actions

1. …
2. …
3. …

### Do not do

- Do not fudge mass/Cd/boost to hit the time.
- Do not widen the test band.
- Do not add this car to a `*_KNOWN` list without a CHANGELOG reason and owner awareness.
```

## Suggested-action catalogue

| Symptom | Action |
|---|---|
| Power >> rating on NA two-valve / old head | Name breathing/valve-float model gap; leave open or `confidence: low` |
| Power >> rating on boosted, taper cannot reach | Check boost_bar and turbo size from hardware; if still over, name the gap |
| Power << rating | Check CR, cams, ITB/stacks, octane, injector; confirm rating is net not gross |
| SAE gross brochure hp | `real.gross: true`; do not score power |
| 0–100 slow, power OK | Check curb mass, gearset, tyre width, drive layout, AWD losses |
| 0–100 fast | Check mass (dry used by mistake?), gearset short, Cd too low |
| Top speed high with `limited: true` | Expected (no governor); compare free top vs published only as info |
| No chassis fits | Propose new archetype; do not ship on a wrong one |
| Conflicting secondary sources | `confidence: low`; list both; wait for maker sheet |
| No art WebP | Presets OK for accuracy; block showcase merge until owner art |
