# Porsche Macan Turbo (95B, 2015)

Queued in batch-2 **wave 1** (`research/vehicles-batch-2/queue.json`).

## Status

Research not started. Do not invent numbers. Follow `.cursor/skills/import-vehicle/SKILL.md`.

## Intended slot

- **cat:** Performance SUV
- **chassis:** suv
- **path:** combustion
- **expected confidence:** high

## Next

1. Fill `vehicle.json` from maker press / Autodata-class sources.
2. `node .cursor/skills/import-vehicle/scripts/validate-research.mjs research/vehicles/porsche-macan-turbo-95b-2015/vehicle.json`
3. Only then implement presets (separate PR).
