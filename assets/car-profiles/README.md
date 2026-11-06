# Car profiles

8-bit pixel-art side profiles of all 100 factory cars, one PNG per car, each 960x640 (3:2), facing left.

They were generated with Grok Imagine using the owner's Honda S2000 image as the style reference. The S2000 file is that reference image, resized to 960x640 with nearest-neighbour.

`manifest.json` maps each preset name (the `name` field in `VEHICLE_PRESETS` and the EV and hybrid presets) to its file. Each entry also has the slug and the prompt used.

## Caveats

- **BAC Mono** (`bac-mono-2011.png`) is approximate. The wheels are partly enclosed, so it looks more like a KTM X-Bow than a Mono.
- **Dodge Viper SRT-10** (`dodge-viper-srt-10-2008.png`): the generator painted a stray side badge, which was retouched out. It also has no white racing stripes.

## Status

The app does not load these images yet. Cars are still drawn in code by `drawCarSprite` in `src/js/sprites.js`, using the shapes in `src/js/car-profiles.js`. Fixed images do not change when a car's build changes, so they suit showroom or selection screens rather than the live sim view.
