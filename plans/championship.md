# Plan: Championship (post-v1.0)

Written from the championship design-space brainstorm. Ship order is P1→P8; each phase is
one or more normal builds. Physics stays derived; points, flags, BoP and budgets are named rules.

## Building blocks already in the page

- Circuits: test + `REAL_TRACKS` + GPX imports (`tracks-gpx.js`).
- Single race: `simulateRace` / `raceResults` / blue + chequered (`race.js`, `race-tab.js`).
- Entrants: current build, garage, factory (`raceEntrantFrom`).
- Tags for classes: `cat`, `chassis`, powertrain, engine `real.hp`.

## Phases

| Phase | Ships |
|---|---|
| P1 | Classes, calendars, points, instant + round-by-round season, standings, `pes.champ.active` |
| P2 | Quali session → grid → feature; fastest-lap point |
| P3 | Tyre allocation + entry fees / prizes |
| P4 | 1–2 car teams, constructor table, driver traits |
| P5 | VSC + time penalties; blue-flag ignore penalty |
| P6 | Career unlocks, history |
| P7 | Soft BoP (ballast) + multi-class points |
| P8 | Timed races, mandatory stops |

## Modules

- `src/js/championship.js` — data + orchestration (no UI).
- `src/js/champ-tab.js` — CHAMP tab UI; reuses the race page for replay when useful.
- Race loop hooks in `race.js`: `durationSec`, VSC, `timePenalty`, `minStops`.

## Owner decisions still open

Grid size above 8, full safety car, GPX in official cups, economy tone vs pure sporting.
See the design-space plan for the full brainstorm (modes, flag table, economy sinks).
