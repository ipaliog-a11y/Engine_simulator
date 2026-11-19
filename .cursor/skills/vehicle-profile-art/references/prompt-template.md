# Prompt template

Every factory showroom picture uses the same stem. Only the car-specific phrase changes.

## Full prompt

```
8-bit pixel-art side profile of a <PHRASE>. <STEM>
```

`<STEM>` is the exact text in `assets/prompt-stem.txt` (also frozen in both
`assets/cars/manifest.json` and `assets/car-profiles/manifest.json` for the first 100 cars).
Do not reword the stem.

## Phrase rules

One clause chain, comma-separated, roughly:

`<year> <make> <model> <code/gen> <body type>, <cue>, <cue>, <cue>, <factory paint> paint`

| Include | Why |
|---|---|
| Year + generation/code | Stops the model inventing the wrong facelift |
| Body type | hatchback / coupe / roadster / pickup / open-wheeler / … |
| 3–6 silhouette cues | Roof, wing, intakes, lights, arches — what a side view shows |
| Factory paint colour by name | Keeps the set colourful and recognisable |

| Avoid | Why |
|---|---|
| "in the style of…" / artist names | Stem already locks style via the reference |
| Front ¾ or chasing camera | Must be exact side elevation |
| Aftermarket / race / wrap | Picture is the car as it left the factory |
| Readable badges or lettering | Tests and README forbid text in the image |
| Copying the S2000's shape | Reference is style + scene only |

## Body-type cues (from the existing set)

- **Open-wheeler / Mono-like:** say wheels are **fully EXPOSED**, no fenders, tub, roll hoop.
  The Mono file is known-approximate when wheels get enclosed — push harder on exposure.
- **Exoskeleton (Atom):** exposed tubular frame, no doors/roof, driver in helmet.
- **Pickup:** open bed, cab style (crew/super), tall grille.
- **SUV / crossover:** tall body, short rear overhang or bluff tail as appropriate.
- **Classic 911:** rear-engined sloping roof; wing only if that trim has one.
- **Roadster:** soft top up or down — say which; pop-ups open or closed if relevant.

## Style-reference reminder (generics)

For **generic class** art (`assets/cars/generic/`), add a line that the reference is for
style and background only and the car must not resemble the S2000. Real factory cars do
not need that line; the phrase names a specific model.

## Build with the script

```bash
node .cursor/skills/vehicle-profile-art/scripts/build-prompt.mjs \
  --phrase "2017 Honda Civic Type R FK8 five-door hatchback, aggressive vents, big rear wing, sloping fastback tail, championship white paint, black wheels, red accents"
```

Prints the full prompt. `--json` wraps it for copying into a manifest row.
