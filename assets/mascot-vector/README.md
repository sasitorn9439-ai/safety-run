# Mascot (smooth vector)

The stubby mascot as real vector art: Bezier curves, a consistent dark outline, flat colours with a little cel-shading.
It is the same character, frames and poses as the pixel set in `../mascot-pixel/` (same 32×32 cell, same anchor, same unit),
so the two are interchangeable.

| Animation | Frames | fps | Loop | Frame ranges |
|---|---|---|---|---|
| `idle`  | 8  | 6  | yes | breathing |
| `run`   | 6  | 12 | yes | two steps per loop: 0–2 left step, 3–5 right step |
| `jump`  | 12 | 14 | no  | takeoff 0–1 · rise 2–3 · apex 4–5 · fall 6–7 · land 8–11 |
| `slide` | 9  | 14 | no  | drop 0–1 · hold 2–5 · recover 6–8 |

## Files

| Path | What |
|---|---|
| `svg/<anim>_<NN>.svg` | **one SVG per frame** (35). `viewBox="0 0 32 32"`, the feet are at (16, 32). Layers have ids (`cape`, `head`, `crystal-face-l`, `mitt-l`, `shoe-r` …) so they can be edited in Figma / Illustrator / Inkscape |
| `svg/sheet_<anim>.svg` | all frames of an animation side by side, one `<g id="frame-N">` each |
| `vector.json` | the same layers as `[fill, path, stroke, strokeWidth]`; **this is what the game draws from** |
| `mascot.json` | cell, anchor, `unit` (24 cell units = 1 game unit `u`), fps, loop, tags |
| `preview.html`, `preview.png` | contact sheet |

Squash, stretch, arm and cape motion are drawn into the frames: play them as they are, do not scale or rotate the sprite at runtime.

## In the game

`?mascot=smooth` shows it (the default is the flat 2D set in `../mascot-2d/`); `?mascot=pixel` shows the pixel-art version, `?mascot=vector` the original flat vector mascot.
`src/render/pixel-mascot.ts` loads `vector.json` (its own chunk) and both renderers rasterise it at the size the screen needs
(so it is sharp at any size or DPR) and draw it 1:1; `src/render/pixel-frames.ts` picks the frame from the game state.

## How it is made

`npm run mascot:vector` rebuilds the pixel set and then this one. `tools/mascot-vector/build.py` does **not** redraw the poses by hand:
it imports the pixel builder, intercepts the numbers each pose is made of (head height, cape hem, foot lifts, mitt and arm positions)
and draws the same pose with curves. So a pose changed in `tools/mascot-pixel/build.py` appears here after a re-run, and the frame indices,
tags and timing can never drift apart. The shapes themselves (head egg, crystal, cape bell, mitts, shoes) and the colours are in `tools/mascot-vector/build.py`.
`preview.png` is a screenshot of `preview.html`.
