# Post-process

Raw generator output is not shippable. Every car ends as **960×640** PNG + WebP.

## Historical batch (Grok Imagine)

Most of the first 100 cars were generated at **1152×864** (4:3), then:

1. Crop **1080×720** at offset **(36, 90)** → 3:2
2. Nearest-neighbour resize to **960×640**
3. WebP encode at quality **82**

Recorded per car as `post_process` in the manifests. The S2000 itself was a
user-supplied reference, resized nearest-neighbour only (`prompt: null`).

## Agent / GenerateImage path

Cursor `GenerateImage` offers **4:3**, not 3:2. Treat the result like a new Grok
frame:

1. If size is within ~32 px of 1152×864 → use the classic crop above
2. Else → centre-crop to the largest 3:2 rectangle inside the image
3. Nearest-neighbour scale to 960×640
4. Write PNG under `assets/car-profiles/`, WebP under `assets/cars/`

```bash
node .cursor/skills/vehicle-profile-art/scripts/postprocess.mjs \
  /tmp/raw-f40.png \
  --slug ferrari-f40-1987
```

Options:

- `--slug <slug>` — required; output basenames
- `--in-place` — overwrite existing PNG/WebP for a redraw
- `--webp-quality 82` — default 82 (matches `assets/cars/README.md`)
- `--dry-run` — print the ffmpeg graph and output paths only

Needs `ffmpeg` and `ffprobe` on PATH (agent VMs have them; GitHub Actions CI does not —
`validate-art.mjs` / `dims.mjs` read sizes without ffmpeg so CI can still check wiring).

## Do not

- Smooth-scale (bicubic/lanczos) — kills the pixel look
- Letterbox with empty bars — crop, then scale
- Ship a size other than 960×640 — `test131` loads every picture at that size
