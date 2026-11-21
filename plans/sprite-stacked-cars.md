# Sprite-stacked cars on the track and in the race

Status: **plan only. Nothing in `src/` or `index.html` has changed.** Written to be picked up by any session or agent.

## 1. Why this, and not three.js

The track and race views draw everything in Canvas 2D on the CPU (`src/js/track-scene.js`). Two things cost time:

1. **The still layer is repainted every frame in chase view.** `scenePaint` caches the ground, road and dressing in
   `STILL`, but the cache key holds the camera (`cam.ox`, `cam.oy`, `cam.fx`, …). The chase camera moves every frame,
   so the cache never hits: ~1000 strokes and ~700 fills each frame, whatever the number of cars.
2. **Each car costs ~30 path operations** in `drawCar` (shadow, four wheels, the body three times, a clip, stripes),
   plus up to 18 ellipses of smoke or spray, each with a fresh `rgba()` string, and two skid polylines when braking.
   This is the part that grows with every car added.

`drawCar` also draws every car as the same 4.6 m shape. It has nothing to do with the real car it stands for.

Options compared:

| | three.js, meshes built in code | Sprite stacking |
|---|---|---|
| Looks like the real car | No, unless 100 cars are modelled | Yes, carved from four pictures of that car |
| Repo rules (classic script, `file://`, no runtime dependency) | Needs a ~600 KB library and possibly an exception | Plain Canvas 2D |
| 8-bit look | Faked with low-resolution rendering | Native |
| Cost per car per frame | Low | One `drawImage`, once the headings are baked (§4.3) |
| Art pipeline | 3D modelling | Image generator: the owner already made `assets/cars/` this way |

Decision: **sprite stacking**, using the owner's fork `ipaliog-a11y/sprite-stacking` (MIT, by Daniel White). Only its
slicer (`skills/sprite-stacking/scripts/views_to_slices.py`) and its drawing loop (`references/engines.md`) are
used. Its `viewer.html` paints pixel by pixel in JavaScript, which suits one turntable but not a race. **Do not
port its render path.**

Sprite stacking fixes the cost of the **cars**. Cause 1 (the still layer) needs its own fix, measured in the same
prototype (§4.4).

## 2. Phase A: the four-view sheets (owner, with the image generator)

One sheet per car. It is one row of four views in this order: **TOP, SIDE, FRONT, BACK**, on flat white.

### 2.1 Prompt

This is the prompt from the fork's `SKILL.md`, with the car filled in. Keep the rest word for word. Use the same car
description as that car's entry in `assets/cars/manifest.json`: model, generation, body style and paint.

```
Chunky pixel art orthographic model sheet of a [YEAR MAKE MODEL (CHASSIS)] [body style], [paint colour and
accents], accurate body shape and proportions for this exact model and generation, with rich 3-tone hue-shifted
pixel shading (deep cool-shifted shadows, saturated midtones, bright warm top highlights along ridges and edges),
bold 3-4px stripes/accents, and crisp specular pixels on glass. Four views in a clean 1x4 horizontal row on a
completely flat solid white background:
1. TOP view looking straight down, front pointing DOWN.
2. SIDE view, front pointing LEFT.
3. FRONT view.
4. BACK view.
Strictly orthographic: zero perspective, zero tilt, zero 3/4 angle. Identical scale across all four views so length,
width, and height match pixel for pixel. Bold 1px dark outline around each view, solid flat color clusters, crisp
internal panel shading, zero anti-aliasing, zero soft edges, zero cast ground shadows, zero grid lines, zero text,
generous empty space between views.
```

Do **not** give the showroom picture as a style reference. Its road, sky and perspective leak into the sheet.

### 2.2 Gate: look at every sheet before slicing (from `SKILL.md`)

1. **Orientation:** in TOP, the nose points down. In SIDE, the nose points left.
2. **Proportions:** TOP length = SIDE length, TOP width = FRONT width = BACK width, SIDE height = FRONT height =
   BACK height. Check them against the real car's length, width and height (in `CAR_DIMS`,
   `src/js/car-dimensions.js`). A view off by more than ~5% is regenerated, not stretched.
3. **Hard edges:** no airbrush and no soft shadows. Thin 1 px internal lines smear when the slices rotate.
4. **Daylight:** a raised rear wing shows sky under it in SIDE, and survives carving. Hidden cavities fill in.
5. **Thin parts:** mirrors, antennas and wing struts under 2 px blink in and out as the car turns. Draw them at least
   2 px wide, or leave them out.

### 2.3 Which cars first

Three, chosen to test different shapes: **Honda S2000 (AP1, 2000)** (low roadster, open cockpit), **Toyota GR Yaris
(2020)** (tall hatchback) and one car with a rear wing (an F1 or GT car), because overhangs are the slicer's weak
point. Do the rest only after the prototype passes (§4.5).

### 2.4 Files

```
assets/cars/stacks/<slug>.views.png   the sheet as generated (kept, so it can be re-sliced)
assets/cars/stacks/<slug>.png         the slice strip the app loads (Phase B)
assets/cars/stacks/<slug>.glow.png    optional emissive mask (headlights, tail lights)
assets/cars/stacks/manifest.json      per car: prompt, generator, slicer command and flags, slice count, notes
```

`<slug>` is the same slug as the car's showroom picture in `src/js/car-art.js`.

## 3. Phase B: slicing (a dev tool, run once per car)

Python 3 with Pillow and NumPy, run from a clone of the fork. It is never loaded by the page and never run by the
tests. Commit only the PNG outputs and the manifest entry. (Whether to copy the slicer into `tools/` is an owner
decision, §7.)

```
python3 skills/sprite-stacking/scripts/views_to_slices.py <slug>.views.png <slug>.png \
  --slices 20 --colours 32 --shade 0.15 \
  --emissive <slug>.glow.png --preview <slug>.check.png
```

- **Size.** In the race, the scene is drawn at most 480 px wide (`SCENE_MAX_W`), so a car is about 20–35 px long on
  screen (chase scale 9.2–14 px/m, a 4.5 m car). Aim for a slice strip **about 64 px long**, with **18–22 slices**.
  More detail is lost at that size and costs bake time. If the generated sheet is larger, let the slicer resample
  it (`--slices` sets the layer count).
- `--top-nose`: leave it on `auto` (it reads car cabins). Pass `down` only if a car comes out reversed.
- `--shade 0.15`: generated sheets already carry shading. Use `0.25` for flat ones.
- **Look at `<slug>.check.png` straight after carving**: the four extracted views, four turntable angles and the
  exploded stack. Then open the fork's `viewer.html` with the strip and turn it a full 360°, watching every angle,
  not just four. A part that appears and disappears goes back to §2.2 point 5.
- Write in `manifest.json` the exact command, the slice count and the strip's width and height. The app asserts
  `width % count === 0` when it loads the strip.

## 4. Phase C: the throwaway prototype

A standalone page in `prototypes/sprite-stack/`, outside `src/`, not built into `index.html` and not stamped. It
exists to answer two questions with numbers: **does it look right, and does it stay fast with many cars?**

### 4.1 Data it uses (exported from the app, not re-invented)

- **Circuit:** export one or two circuits with Playwright from the built page: `buildTrack(label)` → the points
  `x, y, nx, ny, w` that `sceneBind` reads. Save them as `prototypes/sprite-stack/track-<name>.json`.
- **Cars:** record one real race of 8 cars: per car, per 1/30 s, `x, y, hd, brk` as `race-tab.js` builds them
  before `scenePaint`. For 9 to 50 cars, the prototype replays the same recording with a time offset per extra
  car. Positions overlap, which is fine for a timing test.

### 4.2 The camera

Copy `project`, `camFrom` and `chaseCam` from `track-scene.js` unchanged: `pitch = 0.78` in chase view
(`0.82` for the overview), `lift = 0.42 × scale` per metre of height, and a roll of up to ±0.07 rad. The sprite's
numbers below come from these, so a car sits in the scene exactly the way the trees and walls do.

### 4.3 Baking the headings (the step that makes car count stop mattering)

At load, for each car strip:

1. Choose **N = 64 headings** (5.6° apart).
2. For each heading `turn = 2πi/N`, draw the stack once into an offscreen canvas at 1 art px, using the loop from
   `references/engines.md`. Draw the slices bottom to top, each rotated by `turn` about the symmetric centre
   `((w-1)/2, (h-1)/2)`, squashed in y by **`squash = cam.pitch = 0.78`**, and lifted by `z × spacing`.
3. **`spacing` is derived from the scene, not guessed.** A slice is `t = H_car / count` metres thick (H_car is the
   car's height from `CAR_DIMS`). The scene lifts a height `h` by `0.42 × scale × h` screen px, and one art px is
   `scale / p` screen px, where `p` is art px per metre (strip length ÷ `CAR_DIMS` length). So
   **`spacing = 0.42 × p × t` art px**. Write this in a comment next to the constant.
4. Draw the 1 px dark outline **once around the finished frame**, never per slice.
5. Keep a per-heading anchor offset (the ground contact centre inside the frame) so the car does not wobble.
6. Store the 64 frames side by side in one canvas per car (the atlas). For a 64 px car: 64 × ~70 × ~50 px ≈ 0.9 MB of
   pixels per car, ~7 MB for 8 cars. Baking takes about `N × count` = 1,300 small `drawImage` calls per car, once.

Each frame, per car:

```
rel   = car.hd − camHd                       // camHd: the heading the chase camera faces (camFrom)
i     = round(rel / (2π/N)) mod N            // check the nose axis once by eye: the sheet's front is +y
o     = project(cam, car.x, car.y, 0)
ctx.save(); ctx.translate(o.sx, o.sy); ctx.rotate(cam.roll + (rel − i·2π/N));   // the leftover < 2.8°, and the lean
ctx.drawImage(atlas, frame i, −anchor, size × scale / p)                         // nearest-neighbour, smoothing off
ctx.restore()
```

- **Shadow:** bake it with the frame. It is the union footprint of slice 0, offset toward down-sun by `sunK()` as
  `drawCar` does now, in one translucent colour. That makes it part of the same single `drawImage`.
- **Night:** bake a second atlas from the emissive strip and draw it with `globalCompositeOperation = "lighter"` only
  when `TOD === "night"`, so the headlights glow.
- **Smoke, spray and skids:** keep them, but draw each kind as one batched path (one `fillStyle` and one fill per
  kind per frame, not one per particle), with the colour strings built once.
- **Telling the cars apart:** a real car keeps its own paint. The slot colour (`RACE_COLS`) becomes a small marker:
  a 2 px pip under the car, or the position number. Owner's choice (§7).

### 4.4 The still layer, measured in the same page

Two modes behind a toggle:

- **A, as now:** repaint the ground, road and dressing every frame with the moving camera.
- **B, the world once:** draw the whole circuit once, in world space at a fixed px/m, into one large canvas, which
  can be split into tiles if it exceeds ~4096 px. Then each frame draw that canvas with the camera's transform
  (`setTransform` with rotation, pitch and scale: an affine map, which is all `project` is). Trees, boards and
  walls that stand up are drawn on top per frame from the same sorted list as the cars, or baked like the cars.

### 4.5 What the prototype must show (pass/fail)

Fill in this table in headless Chromium and on the owner's phone and computer. Headless WebGL and Canvas run in
software, so the owner's devices decide.

| Cars | A + `drawCar` (today) | A + stacks | B + stacks |
|---:|---|---|---|
| 2 | ms/frame | | |
| 8 | | | |
| 16 | | | |
| 50 | | | |

The prototype passes when:

- [ ] B + stacks holds **60 fps with 16 cars** on the owner's phone, and the cost per added car is under 0.1 ms.
- [ ] The three cars are **recognisable** as themselves at race zoom and at full zoom-in, by the owner's eye.
- [ ] A full 360° turn shows **no wobble** (anchor), and no part blinks in and out.
- [ ] Driving the recorded lap, the nose follows the path through every corner, and the car doesn't float (shadow).
- [ ] Night and wet look right (glow, spray).
- [ ] Screenshots of the three cars, day and night, attached to the PR that adds the prototype.

If it fails on the look, fix the sheets (§2.2). If it fails on speed, report where the time goes before changing
anything.

## 5. Phase D: into the app (only after §4.5 passes, one build and one PR each, per AGENTS.md)

The physics is not touched in any of these builds. **Every fingerprint must be identical**, and the PR says so.

1. **Build 1: the still layer.** Mode B from §4.4 in `track-scene.js`, replacing the camera-keyed repaint. Test: a
   chase-view frame paints the still layer from the cache (count the canvas calls through a wrapped context, or
   time it).
2. **Build 2: stacked cars in the race and the hotlap.**
   - New `src/js/car-stacks.js`: loads `assets/cars/stacks/<slug>.png` (the same `file://`-safe image loading
     `car-art.js` uses, and the service worker caches it), bakes the atlas lazily the first time a car appears,
     and exposes `drawStackedCar(ctx, cam, car)`.
   - `drawMoving` calls it for each car that has a strip, and falls back to `drawCar` for the others: built cars,
     and factory cars not yet sheeted. A built car could use its class's strip later; that's not in this build.
   - Race entries carry `entry.name` (`race.js`), which is the key for both `CAR_ART` and the strips.
   - Car length and width on screen come from `CAR_DIMS`, not the fixed 4.6 m of `drawCar`.
   - Test: a race with a stacked car and a non-stacked car draws both, with no page error, and a missing strip
     falls back.
3. **Build 3: particles batched** (§4.3), and night glow.
4. **Builds after that: the remaining cars' sheets,** in batches of about 10 per PR, each with its `check.png`
   looked at.

In each build:

- `node tools/build.mjs`, `node tools/stamp.mjs`, a CHANGELOG entry, and the tests that touch the race and track
  views plus the new one.
- **Update the docs:** `assets/cars/README.md` (the caveat that the track draws the car in code stops being true),
  the comment at the top of `src/js/car-art.js`, the guide page that describes the race view, and the README.
- Any new interface text (a setting to switch back to the old cars, if kept) goes through `tr('...')`. Greek is
  paused.
- Check phone width (`test73`) and take screenshots.

## 6. Cost

| Phase | Who | Size |
|---|---|---|
| A, 3 sheets | Owner, image generator | 3 prompts plus regenerations until the gate passes |
| B, slicing | Agent or owner | Minutes per car |
| C, prototype | One agent session | About the size of one ordinary build |
| D | One session per build | Ordinary builds. Sheeting the other ~97 cars is mostly owner time at the generator |

The prototype can start before the sheets exist: one placeholder car drawn in Python/PIL (as `SKILL.md` §1c
describes) is enough to measure speed. It cannot answer "does it look like the real car", so §4.5 is only judged
with real sheets.

## 7. Decisions for the owner

1. **The slicer:** keep it in the fork and commit only its outputs (the default here), or copy
   `views_to_slices.py` into `tools/` with its MIT notice. That would add Python as a second dev tool beside
   Playwright.
2. **Telling the cars apart in a race:** a slot-colour pip under each car, or the position number, or the real
   paint repainted in the slot colour (which loses the real livery).
3. **Built cars:** the code-drawn car (`drawCar`) for now, or their class's strip.
4. **Repository size:** ~100 strips at ~64 px are small (tens of KB each). Keep the source sheets
   (`*.views.png`, ~1 MB each) in the repo, or on a side branch as the showroom originals are.
