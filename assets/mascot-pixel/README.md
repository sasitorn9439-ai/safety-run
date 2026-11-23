# Mascot sprites (pixel art, short and stubby, with an exact vector version)

> There is also a smooth, outlined vector version of the same poses in `../mascot-vector/`, and a flat 2D set in `../mascot-2d/` (the game's default).

Adapted from the 16×32 character template in `source/16x32-all-animations.png`, seen from behind like the game camera.
The proportions follow the original mascot: a big head that is half the figure's height, the red crystal growing out of the crown (as on the official sticker sheet, `../mascot-reference/`),
a short flared cape, stubby shoes.

**From the template:** the head (shape, 1-px dark outline, shading), the palette style, and the timing of its back-view idle
(breathing) and walk/run cycle (head bob, feet lifted alternately), scaled down to this shorter body.
**Drawn for the mascot:** the crystal, cape, mitts, shoes, the proportions, and the jump and slide poses (the template has neither).

| Animation | Frames | fps | Loop | Frame ranges (`tags` in `mascot.json`) |
|---|---|---|---|---|
| `idle`  | 8  | 6  | yes | breathing; the 4-frame breath plays twice, cape hem shifting |
| `run`   | 6  | 12 | yes | two steps per loop: frames 0–2 left step, 3–5 right step |
| `jump`  | 12 | 14 | no  | takeoff 0–1 · rise 2–3 · apex 4–5 · fall 6–7 · land 8–11 |
| `slide` | 9  | 14 | no  | drop 0–1 · hold 2–5 (loop it if the slide lasts longer) · recover 6–8 |

## Files

| Path | What |
|---|---|
| `x1/*.png`, `x4/*.png` | horizontal strips, cell **32×32**, native size and 4× (nearest-neighbour) |
| `svg/<anim>_<NN>.svg` | one SVG per frame: exactly the pixels, merged into rectangles (`shape-rendering="crispEdges"`) |
| `vector.json` | the same vectors as path data, grouped per colour. **This is what the game draws from** |
| `mascot.json` | cell size, anchor, `unit`, fps, loop and tags |
| `preview.png` | contact sheet |

`anchor` = the feet (bottom centre of the cell); `unit` = art pixels per game unit `u` (the figure is ~21 px tall, ~0.88 u in the game).
Squash, stretch and arm/cape motion are drawn into the frames: do not scale or rotate the sprite at runtime.

## How the game uses it

`?mascot=pixel` shows this set. `src/render/pixel-mascot.ts` turns each frame of `vector.json` into an `Art`, and both renderers rasterise it at a whole number of
texture pixels per art pixel for the current screen (so the edges are crisp at any size or DPR and there are no seams), then draw
it with nearest-neighbour sampling at a position snapped to the device pixel grid. `src/render/pixel-frames.ts` picks the frame from the game state
(distance run, `vy`, landing, slide progress). `?mascot=vector` brings back the original flat vector mascot.

## Using the PNGs in another engine

Filter must be NEAREST, no mipmaps, integer scale: `scale = round(u_px / unit)`.

```ts
import { Assets, Rectangle, Texture } from 'pixi.js';

const meta = await (await fetch(new URL('./mascot.json', import.meta.url))).json();
const v = meta.variants.x1;
const base = await Assets.load(new URL('./x1/run.png', import.meta.url).href);
base.source.scaleMode = 'nearest';
const a = meta.animations.run;
const frames = Array.from({ length: a.frames }, (_, i) =>
  new Texture({ source: base.source, frame: new Rectangle(i * v.cell.w, 0, v.cell.w, v.cell.h) }));
// sprite.anchor.set(v.anchor.x / v.cell.w, 1);  sprite.scale.set(Math.round(u_px / v.unit));
```

## Changing it

`npm run mascot:pixel` (needs Python 3 + Pillow) rebuilds everything here from `tools/mascot-pixel/build.py`: proportions (`HT0`, `HEM0`, `UNIT`),
the pixel bitmaps for the crystal, shoes and mitts, the cape shape, and each pose's numbers. It reports if a pose touches the cell edge.
The game picks up the new `vector.json` on reload.

## Licence

`source/16x32-all-animations.png` is a third-party asset. Check its licence allows modification and use in your game and in a commercial/company
context before shipping; the derived sprites inherit those terms for the head pixels.
