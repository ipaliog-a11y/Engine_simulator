# Plan: vehicle Challenges page

Written at build 341. The CHALLENGES tab is for solved dynamic vehicle tests. It is not the ENGINE
tab’s career/scorecard list (`src/js/challenges.js`).

## Goal

One Drive tab where each entry is a kind of run (economy, skill, moose, skid pad, …) with its own
road or course and its own score. The sim solves; nobody drives yet.

## Registry

`RUN_CHALLENGES` in `src/js/run-challenges.js`. First entry:

| id | kind | score | course |
|---|---|---|---|
| economy | economy | litres at a target time | Alpine Pass (`ROADS.alpine`) |

## Economy run (shipped)

- Open path: `catmullOpen` / `buildRoad` in `src/js/eco-roads.js` (no wrap).
- Min-time on the centreline from rest (`ecoMinTime`).
- Target = `timeFactor` × that car’s min-time (Alpine: 1.25), eco-rally style.
- Binary-search a speed cap on the open min-time solve so finish time hits the target; fuel from `engineFuelAt` (warm oil).
- **Named gap:** speed cap is not optimal lift-coast DP. A pure max-time limit would pick flat-out here (DFCO on brakes).

## Follow-ups

1. Skill / agility track.
2. Moose avoidance (ISO 3888-2 style).
3. Skid-pad challenge.
4. Multi-car ranking on a challenge.
5. Distance DP for economy; open GPX; hybrid/EV energy on economy roads.
