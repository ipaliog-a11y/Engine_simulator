# Designer pictures

8-bit icons and value diagrams for the ENGINE, ELECTRIC DRIVE, VEHICLE and PARTS designers.
Pictures are only pictures. No number in the sim comes from them. The brief is `plans/designer-art-brief.md`.

The app should load these the way `src/js/car-art.js` loads `assets/cars/`. A missing file must leave the card as it is now.

## What is here

| Folder | Count | Size |
|---|---|---|
| `icons/` | 228, including `icons/_none.webp` | 128×128 (a 64×64 grid, scaled ×2) |
| `diagrams/` | 84 | 960×540 (a 240×135 grid, scaled ×4) |

Forms: `engine`, `hybrid`, `ev`, `vehicle`, `parts`. The file name is the form control's id plus the option value, so the app can find a picture without a map.

Not drawn, on purpose: the catalytic-converter pictures in section 6.5 (`cat-cells-low`, `cat-cells-high`, `catCells`). That part is `ready: false`.

Rear suspension geometry icons (`vhGeoR-strut`, `vhGeoR-wishbone`, `vhGeoR-multilink`, `vhGeoR-solid`) are copies of the matching front pictures. `evRegen-high` and `evRegen-low` are copies of the hybrid regen pictures.

## Post-processing

Imagine returns a large illustration, not a picture already sitting on a 64 px grid. Resizing that with nearest-neighbour alone picks one pixel out of each cell and the icon turns to noise, so it fails the brief's own check (the part must be recognisable at 64 px).

What is done instead:

1. Area-average the frame onto the brief's grid (64×64 for an icon, 240×135 for a diagram).
2. Snap every colour to the nearest colour in the brief's palette, plus black for the outline.
3. Scale back up with nearest-neighbour only: ×2 to 128×128, or ×4 to 960×540.
4. Save WebP at quality 82.

`manifest.json` has the prompt and the subject for each file. There is no seed: this Imagine stack does not return one. Every prompt starts with the same STYLE block, then FORMAT A or B, then the subject.

## Caveats

- Cylinder counts 3 and up are plain discs with no rods, so the count still reads after the 64 px snap. 8, 10 and 12 are two rows.
- The electric-motor icon's first pass had the letters HV on the cable. It was drawn again with a plain cable.
- A few diagrams still have leftover words or axis marks after one cleanup pass: `diagrams/engine/edRedline.webp` (LOW / HIGH), `diagrams/engine/edEgr.webp` (numbered axes), `diagrams/engine/edInjector.webp` (hash marks). They were not redrawn a second time.
- `vhSpringR` and `vhBarR` are diagrams, same as the other value pictures. Their brief rows have no arrow in the LEFT/RIGHT cell, which is easy to misfile as icons. They live in `diagrams/vehicle/`.
- Chassis icons are generic side views facing left, not real cars.
- The style reference is `assets/cars/honda-s2000-ap1-2000.webp` for pixel size and shading only. The road, sea and sky are not used. Icons sit on `#12121c`.
