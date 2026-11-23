# Mascot sprites (2.5D, pre-rendered from a 3D model)

Rendered from a small 3D rig (`tools/mascot-bake/`), seen **from behind and ~11° above** with a long lens, like the game camera.
Transparent PNGs, not trimmed. The mascot runs away from the camera.

| Sheet | Frames | Grid | fps | Loop | Frame ranges (`tags` in `mascot.json`) |
|---|---|---|---|---|---|
| `idle.png`  | 12 | 6×2 | 10 | yes | breathing, slow look-around |
| `run.png`   | 16 | 8×2 | 24 | yes | two steps per loop: frame 0 = left foot forward, frame 8 = right foot forward |
| `jump.png`  | 16 | 8×2 | 24 | no  | takeoff 0–2 · rise 3–5 · apex 6–8 · fall 9–11 · land 12–15 |
| `slide.png` | 14 | 7×2 | 20 | no  | drop 0–3 · hold 4–9 · recover 10–13 (turned ~55° so the legs show) |

Frames are numbered row by row, left to right. Two sizes: `384/` (3× phones) and `256/` (everything else); `preview.png` is a contact sheet.

## Placing a frame

`mascot.json → variants["384"]`: `cell` 384×384, `anchor` (192, 330) = **the feet**, `unit` 300 = sprite pixels per game unit `u`
(the mascot is ~0.94 u tall). Put the anchor on the ground point and scale by `u_px / unit`.
In the current renderer `u_px` is `cam.lw * projected scale` (`P.u` in `src/render/fx.ts`), so `scale = P.u / unit`.

Do **not** add the jump height yourself: the jump poses only squash/stretch; the game already lifts the sprite by `py`.

## Slicing in PixiJS

```ts
import { Assets, Rectangle, Texture } from 'pixi.js';

const meta = await (await fetch(new URL('./mascot.json', import.meta.url))).json();
const v = meta.variants['384'];

async function frames(name: string) {
  const a = meta.animations[name];
  const base = await Assets.load(new URL(`./384/${a.image}`, import.meta.url).href);
  return Array.from({ length: a.frames }, (_, i) => new Texture({
    source: base.source,
    frame: new Rectangle((i % a.cols) * v.cell.w, Math.floor(i / a.cols) * v.cell.h, v.cell.w, v.cell.h),
  }));
}
// sprite.anchor.set(v.anchor.x / v.cell.w, v.anchor.y / v.cell.h);
// sprite.scale.set(u_px / v.unit);
```

Suggested mapping from the game state: `run` frame = `floor(phase / 2π × 16)`; jump `takeoff/rise` while `vy > 0`, `apex` near 0,
`fall` while `vy < 0`, `land` when `py` returns to 0; slide frame = `progress × 13` with `progress = 1 − slide / SLIDE_SECONDS`.
Enable mipmaps on the texture source for distant use; the mascot itself stays near scale 1.

## Changing the look

`npm run mascot` opens the baker (http://localhost:5180). Edit `tools/mascot-bake/rig.ts` (model, colours) or `anims.ts` (poses),
reload, and press **Bake & save**: it rewrites everything in this folder and warns if a pose gets clipped by the cell.
