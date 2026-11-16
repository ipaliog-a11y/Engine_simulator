# Plan: vehicle Challenges page

Written at build 341. The CHALLENGES tab is for solved dynamic vehicle tests. It is not the ENGINE
tab’s career/scorecard list (`src/js/challenges.js`).

## Goal

One Drive tab where each entry is a kind of run (economy, skill, moose, skid pad, …) with its own
road or course and its own score. The sim solves; nobody drives yet.

## Registry

`RUN_CHALLENGES` in `src/js/run-challenges.js`. Economy entries (build 343 adds five real open roads; Alpine Pass stays):

| id | kind | score | course |
|---|---|---|---|
| economy | economy | litres or kWh / Wh/km at a target time | Alpine Pass (`ROADS.alpine`) |
| economy-dragon | economy | same | Tail of the Dragon US 129 (`ROADS.dragon`, ~18 km) |
| economy-bigsur | economy | same | Big Sur CA-1 mid-coast (`ROADS.bigsur`, ~38 km) |
| economy-napoleon | economy | same | Route Napoléon Digne→Grasse (`ROADS.napoleon`, ~116 km) |
| economy-highland | economy | same | A85 Oban→Lochearnhead (`ROADS.highland`, ~92 km) |
| economy-targa | economy | same | Targa Piccolo open stage (`ROADS.targa`, ~60 km) |

Real roads: OSRM centreline + ASTER elevation; width modelled (as Nordschleife). Paths stay open (no wrap).

## Economy run (shipped)

- Open path: `catmullOpen` / `buildRoad` in `src/js/eco-roads.js` (no wrap).
- Min-time on the centreline from rest (`ecoMinTime`).
- Target = `timeFactor` × that car’s min-time (Alpine: 1.25), eco-rally style.
- Binary-search a speed cap on the open min-time solve so finish time hits the target.
- ICE: fuel from `engineFuelAt` (warm oil). EV (build 342): pack kWh / Wh/km via `motorLosses` + `packDraw` + regen (`ecoEnergyJ`).
- UI shows the target once (time ≈ target by construction).
- **Named gap:** speed cap is not optimal lift-coast DP. A pure max-time limit would pick flat-out here (DFCO on brakes).

## Follow-ups

1. Skill / agility track.
2. Moose avoidance (ISO 3888-2 style).
3. Skid-pad challenge.
4. Multi-car ranking on a challenge.
5. Distance DP for economy; hybrid energy on economy roads.
6. Open GPX import for user roads (do not reuse closed `gpxToTrack` blindly).
