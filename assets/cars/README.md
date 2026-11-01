# Car pictures

Pixel-art side views of all 100 factory cars, one WebP per car, 960x640 (3:2), facing left. The app shows them in
the VEHICLE tab's showroom (under the car picker) and on the GARAGE cards of real cars. `src/js/car-art.js`
maps each preset name to its file.

They were generated with Grok Imagine using the owner's Honda S2000 image as the style reference. The S2000 file
is that reference image, resized to 960x640 with nearest-neighbour. `manifest.json` keeps, for each car, the prompt
and the post-processing.

The original 960x640 PNGs (64 MB) are on the branch `assets/car-profiles-and-landing`. These WebP files were
converted from them at quality 82 (5 MB in all), with no visible difference at 2x zoom.

## Caveats

- **BAC Mono** (`bac-mono-2011.webp`) is approximate. The wheels are partly enclosed, so it looks more like a
  KTM X-Bow than a Mono.
- **Dodge Viper SRT-10** (`dodge-viper-srt-10-2008.webp`): the generator painted a stray side badge, which was
  retouched out. It also has no white racing stripes.
- A picture shows the car as it left the factory. It does not change with the parts you fit, so the live views
  (the VEHICLE preview, the track and the race) still draw the car in code (`drawCarSprite` in `src/js/sprites.js`).
