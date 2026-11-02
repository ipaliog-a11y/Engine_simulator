# Generic body-class profiles

One 8-bit pixel-art side profile per chassis class in `CHASSIS` (`src/js/vehicle-presets.js`), 14 in all. Each is a 960x640 PNG (3:2), facing left, in the same style and coastal-road scene as the real-car profiles.

The cars are generic and unbranded: each is meant to read as its class, not as any real model, and none has badges or lettering.

| Class id | Label | File |
|---|---|---|
| `kei` | KEI CAR | `generic-kei-car.png` |
| `hatch` | HOT HATCH | `generic-hot-hatch.png` |
| `roadster` | LIGHT ROADSTER | `generic-light-roadster.png` |
| `coupe` | SPORTS COUPE | `generic-sports-coupe.png` |
| `sedan` | SPORTS SEDAN | `generic-sports-sedan.png` |
| `muscle` | MUSCLE CAR | `generic-muscle-car.png` |
| `rally` | RALLY AWD HATCH | `generic-rally-awd-hatch.png` |
| `gt` | GRAND TOURER | `generic-grand-tourer.png` |
| `super` | MID-ENGINE SUPER | `generic-mid-engine-super.png` |
| `hyper` | CARBON HYPERCAR | `generic-carbon-hypercar.png` |
| `proto` | TRACK PROTOTYPE | `generic-track-prototype.png` |
| `pickup` | PICKUP TRUCK | `generic-pickup-truck.png` |
| `suv` | PERFORMANCE SUV | `generic-performance-suv.png` |
| `openwheel` | OPEN-WHEELER | `generic-open-wheeler.png` |

`manifest.json` maps each class id to its file, its display label and the prompt used.

## How they were made

They were generated with Grok Imagine at 4:3, cropped to 3:2 and resized to 960x640 with nearest-neighbour so the pixels stay sharp.

The style reference was the owner's Honda S2000 image. With that reference, the roadster, coupe and GT kept coming out looking like an S2000. Those three, plus the super and the open-wheeler, were made with the generated kei-car image as the style reference instead. It has the same style and scene, without the S2000 body. Each manifest entry records which reference it used.

## Status

The app does not load these yet. The VEHICLE tab's showroom (`syncCarArt` in `src/js/car-art.js`) shows `assets/cars/*.webp` for a real car and nothing for a generic chassis. These images could fill that gap, keyed by `vehicle.chassis`.
