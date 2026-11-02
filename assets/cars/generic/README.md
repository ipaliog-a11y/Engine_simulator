# Body-class pictures

One pixel-art side view per chassis class in `CHASSIS` (`src/js/vehicle-presets.js`), 14 in all. Each is a WebP,
960x640 (3:2), facing left, in the same style and coastal-road scene as the real cars in `assets/cars/`. The cars are
generic and unbranded: each reads as its class, not as any real model, with no badges or lettering.

The app shows them for a generic chassis and for a car made by COPY FROM, at the top of the VEHICLE tab and on GARAGE
cards. `CAR_ART_CLASS` in `src/js/car-art.js` maps each class id to its file.

They were generated with Grok Imagine by the owner, at 4:3, cropped to 3:2 and resized to 960x640 with
nearest-neighbour. The style reference was the owner's Honda S2000 image. The roadster, coupe, GT, super and
open-wheeler kept coming out looking like an S2000, so they used the generated kei-car image as the reference instead.
`manifest.json` records each prompt and reference. The 960x640 PNG originals (8.9 MB) are on the branch
`assets/generic-body-class-profiles`; these WebP copies (0.7 MB) were converted from them at quality 82.
