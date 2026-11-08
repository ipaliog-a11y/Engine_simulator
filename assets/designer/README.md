# Designer pictures

8-bit icons and value diagrams for the ENGINE, ELECTRIC DRIVE, VEHICLE and PARTS designers.
Pictures are only pictures. No number in the sim comes from them. The brief is `plans/designer-art-brief.md`.

The app will load these the way `src/js/car-art.js` loads `assets/cars/`. A missing file must leave the card as it is now.

## What is here

Started card by card, after a style check on the engine-type icons.

| Path | What |
|---|---|
| `icons/_none.webp` | Empty mounting bracket, for NO / OFF / NONE choices |
| `icons/engine/edType-*.webp` | Petrol four, diesel, two-stroke, rotary, electric |
| `icons/engine/edLayout-*.webp` | Inline, V, boxer |
| `icons/engine/edCyl-1.webp`, `edCyl-2.webp` | One piston, two pistons |
| `diagrams/engine/edBore.webp` | Narrow bore on the left, wide bore on the right |

Cylinder counts 3, 4, 5, 6, 8, 10 and 12 were drawn, and they are the right count in the full frame, but they do not read at 64 px after the grid snap (the discs and the rods merge). They are not in this folder. They will be drawn again as plain discs, nothing else, before they are kept.

The planned catalytic-converter pictures in section 6.5 are not drawn. That part is `ready: false`.

## Post-processing

Imagine returns a ~1408 px illustration, not a picture already on a 64 px grid. Resizing that with nearest-neighbour alone picks one pixel out of each cell and turns the icon into noise, so it fails the brief's own check (the part must be recognisable at 64 px).

What is done instead:

1. Area-average the frame onto the brief's grid (64×64 for an icon, 240×135 for a diagram).
2. Snap every colour to the nearest colour in the brief's palette, plus black for the outline.
3. Scale back up with nearest-neighbour only: ×2 to 128×128, or ×4 to 960×540.
4. Save WebP at quality 82.

`manifest.json` has the full prompt, the subject and this post-processing for each file. There is no seed: this Imagine stack does not return one. Every prompt starts with the same STYLE block, then FORMAT A or B, then the subject, as the brief says.

## Caveats

- The electric-motor icon's first pass had the letters HV on the cable. It was drawn again with a plain cable.
- The style reference is `assets/cars/honda-s2000-ap1-2000.webp` for pixel size and shading only. The road, sea and sky are not used. Icons sit on `#12121c`.
- Layout icons are readable, but coarse. Inline, V and boxer can be told apart. Fine cam lobes and valve counts will need the same 64 px check before they are kept.
- The bore diagram keeps left = low and right = high: a narrow cylinder, then a wide one with a longer flame path.
