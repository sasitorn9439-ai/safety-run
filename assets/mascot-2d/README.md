# Mascot sprites (flat 2D) — the game's default mascot

The same flat look as the vector mascot in the game, drawn frame by frame. **Every deformation is already in the frames**
(squash, stretch, lean, tucked legs, raised arms, cape flutter, body bob), so the game plays them as they are and never needs to
scale, rotate or rig the sprite at runtime. Transparent PNGs, not trimmed, seen from behind.

| Sheet | Frames | Grid | fps | Loop | Frame ranges (`tags` in `mascot.json`) |
|---|---|---|---|---|---|
| `idle.png`  | 12 | 6×2 | 10 | yes | breathing, small head tilt, cape settling |
| `run.png`   | 16 | 8×2 | 24 | yes | two steps per loop: frame 0 = left foot down, frame 8 = right foot down |
| `jump.png`  | 16 | 8×2 | 24 | no  | takeoff 0–2 · rise 3–5 · apex 6–8 · fall 9–11 · land 12–15 |
| `slide.png` | 14 | 7×2 | 20 | no  | **the down-key animation: the Tuck ball crouch** · drop 0–3 · hold 4–9 · recover 10–13 (0–1 and 12–13 are the run pose and the anticipation crouch) |

Frames are numbered row by row, left to right. Two sizes: `384/` (3× phones) and `256/` (everything else); `preview.png` is a contact sheet.

## Placing a frame

`mascot.json → variants["384"]`: `cell` 384×384, `anchor` (192, 330) = **the feet**, `unit` 300 = sprite pixels per game unit `u`.
Put the anchor on the ground point and draw at scale `u_px / unit` (in the renderer `u_px` is `P.u`, see `src/render/fx.ts`).
Same numbers as the 3D set in `assets/mascot/`, so either can be swapped in.

The game still moves the sprite up and down with the jump (`py`); the squash/stretch is in the frames, not applied by the game.

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
// sprite.scale.set(u_px / v.unit);          // no extra squash, lean or bob
```

Suggested mapping: `run` frame = `floor(phase / 2π × 16)`; jump `takeoff/rise` while `vy > 0`, `apex` near 0, `fall` while `vy < 0`,
`land` when `py` returns to 0; slide frame = `progress × 13` with `progress = 1 − slide / SLIDE_SECONDS`; `idle` on the menu.

## Changing the art

`npm run mascot:2d` opens the baker (http://localhost:5181). Edit `src/render/flat/puppet.ts` (the drawing), `slide.ts` (the side-view slide) or
`anims.ts` (poses), reload and press **Bake & save**: it rewrites this folder and warns if a pose gets clipped by the cell. The head comes straight
from `src/render/draw.ts`, so a change there shows up in the sprites after a re-bake.

## The side-view slide (an alternative, `?slide=side`)

In this version frames 2–11 are drawn **from the side** (the mascot faces left), because from directly behind a slide is just a blob:
it crouches (frame 1), drops back onto its seat with a burst of dust (2–3), slides with one leg out in front and the shoe tipped up,
the other knee bent, one hand planted behind for balance and the other held out in front, the cape streaming behind and a dust trail that
drifts back and fades as the slide slows (4–9), then pulls its legs in and pushes itself back up (10–11) into the run pose (12–13).
The drawing is `src/render/flat/slide.ts`; the poses per frame are in `src/render/flat/anims.ts`.

## Slide variants (choose one)

Besides the side-view slide above there are five slides that stay **seen from behind** the whole time (`slide-variants.png` shows them all).
Each is 14 frames with the same tags, starts and ends in the run pose, and keeps the head round while the body squashes.

| `?slide=` | Name | Idea |
|---|---|---|
| `1` | Crouch glide | squashed low and wide, knees out, arms stretched sideways for balance, dust jetting off both sides |
| `2` | Drift | the body rolls to one side like a skid, one hand brushing the floor, shoes sliding out, dust on the low side |
| `3` | Butt slide | sits down and slides on its bottom, legs splayed in a V with the shoes up, hands planted at the sides, dust in front |
| `4` | Belly slide | dives forward and skids like a penguin, arms out in front, shoes trailing, dust spraying toward the camera |
| `5` | Ninja duck | low crouch with the head sunk into the cape, arms swept back, quick little steps, cape streaming |
| `side` | Side-view slide | the one described above |

Try them in the game with `?slide=1` … `?slide=5` (crouches: `?slide=c1` … `c5`, below) (e.g. `http://localhost:5173/?slide=3`). The poses are in `src/render/flat/slides.ts`.
The default is `DEFAULT_SLIDE` in `src/render/flat/anims.ts` (now `'c2'`, Tuck ball). To change it, edit that id and re-bake the sheets
(`http://localhost:5181/` + **Bake & save**; `?slide=3` bakes a specific one, `?variants` redraws the comparison sheet).

## Crouch variants (instead of a slide)

The down key lasts 0.7 s (`SLIDE_SECONDS`) and is what gets the mascot under a low pipe, so it can just as well be a **crouch** as a slide.
Five crouches (`crouch-variants.png`), same slot, 14 frames and tags as the slides, seen from behind, head kept round:

| `?slide=` | Name | Idea |
|---|---|---|
| `c1` | Squat | a deep squat, knees out, hands resting on the knees, breathing while it waits |
| `c2` (**default**) | Tuck ball | curls into a small round bundle with the head sunk into the cape, rocking gently |
| `c3` | Duck waddle | stays low and waddles on tiny quick steps, rocking side to side, arms out behind like wings, cape tail up |
| `c4` | Cover head | ducks and throws both arms up over its head, trembling a little |
| `c5` | Frog crouch | feet planted wide, hands down at its sides, head up, a little hop-bob |

Try them with `?slide=c1` … `?slide=c5`. They are in `src/render/flat/slides.ts` (`CROUCH_VARIANTS`); `http://localhost:5181/?variants=crouch&auto`
redraws the comparison sheet. 

## In the game

This set is the default. The game does not use the PNGs: `src/render/flat/` (`puppet.ts`, `slide.ts`, `anims.ts`) is the single source,
used by both the baker and the renderers, which rasterise each frame at exactly the size the screen needs (sharp at any size or DPR).
Frame counts and the tagged ranges (takeoff/rise/apex/fall/land, drop/hold/recover) come from `anims.ts`, so editing the animation there
changes the game and the exported sheets together. Other sets: `?mascot=smooth`, `?mascot=pixel`, `?mascot=vector` (the original).
