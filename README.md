# Safety Run · EHS Day 2026 (MCAM)

Subway-style safety game: dodge factory hazards, collect PPE, answer a safety quiz for a second chance.
**Unlimited plays (best score counts)**; each employee ID gets a unique avatar, and the leaderboard shows avatars only (`MAX_PLAYS` env to cap plays).
Prizes: 1st HUAWEI Band 11 Series (Polym Black), 2nd–3rd fuel card, 4th–5th BEZ automatic umbrella.

## Develop

```sh
npm install
npm run dev        # http://localhost:5173 — /api/* is served from memory, no database needed (admin key: dev)
npm test           # sim parity + API tests
npm run typecheck
npm run build      # typecheck + production bundle into dist/
```

`vercel dev` runs the real Postgres-backed functions if you need them locally.

## Layout

| Path | What |
|---|---|
| `shared/` | Pure TypeScript used by **both** browser and server: `sim.ts` (the deterministic game), hazards, question bank, avatar maths |
| `src/game/` | Game loop (`game.ts`) and first-play tutorial |
| `src/render/` | Two interchangeable renderers behind `GameRenderer` (`types.ts`): `pixi.ts` (WebGL, default) and `canvas2d.ts` (fallback). Shared by both: `fx.ts` (frame blending, draw order, mascot pose, particles), `camera.ts`, `draw.ts` (the vector art), `sprites.ts` (art → pixels). `floor-shader.ts` is the road as a GLSL shader |
| `src/render/flat/` | The default mascot: puppet drawing, side-view slide, and its animations (also used by `tools/mascot-2d`) |
| `src/ui/hud.ts` | In-game HUD as DOM elements |
| `src/app.ts` | Screens and flow: login, quiz, submit, leaderboard, pause |
| `server/` | `handlers.ts` (all API logic) on a `Store` interface: `postgres-store.ts` for production, `memory-store.ts` for `npm run dev` |
| `api/*.ts` | Thin Vercel functions that call `server/handlers.ts` |
| `index.html`, `admin.html` | The two pages (`/` and `/admin`) |

## How scores are verified

`api/start` gives the browser a random seed. The browser plays the run with `shared/sim.ts`, which advances in exact 1/60 s steps,
and records `[tick, action]` for every input. `api/finish` re-plays those inputs with the same seed and stores the score
the replay produces, so a score can't be edited in the browser, and a replay can't claim more time than has passed.

**Do not change `shared/sim.ts` lightly.** Any change to what it does with the random numbers changes every run, and a run that was
open during a deploy would be rejected. `tests/golden.json` holds bot-played runs recorded against the current sim: if
`npm test` fails there, the sim's behaviour changed. After a deliberate change, re-record them with
`GOLDEN=1 npx vitest run tests/make-golden.test.ts`.

**Speed:** a calm 10 units/s at the start (about 30 % slower than the first version) that eases up slowly: ~11 after 3 minutes,
~14 after 5, the top speed of 34 only about 10 minutes in (`speedAt` in `shared/sim.ts`). The idea: players bank score early, so when they
crash later they'd rather answer the quiz to keep running than give the run up.

**What's on the track:** hazards, trails of coins (+1 each, counted in the HUD) down the free lane, and PPE items (+4) that turn up
one at a time inside a trail, always one of the kinds you don't have yet. Collect all five for the shield. The Coin Rain surprise fills
all three lanes with coins and a few PPE items.

**Scoring:** 1 point per 2 m (`METRES_PER_POINT`), coin +1, PPE +4, Safety Officer praise +60. Calibrated so that a good run of about
20 minutes lands around 20 000 points (distance alone is ~15 000 at that point; coins and PPE make up the rest); a 5-minute run is around
2 500 because the speed is still low then. The pickup share is an assumption: re-tune the constants in `shared/sim.ts` once there are real
scores. The scoring changed from the first version, so old scores aren't comparable.

## Mascot sets

The official design is in `assets/mascot-reference/` (seen from behind, the red crystal rises from the crown like a wedge).

All are drawn as vectors, so they stay sharp at any size; `?mascot=` in the URL picks one (and `?debug` shows which is active).

| `?mascot=` | What | Source |
|---|---|---|
| `flat` (default) | flat 2D mascot; the down key is a Tuck ball crouch | `src/render/flat/` → exports in `assets/mascot-2d/` |
| `smooth` | stubby mascot, smooth outlined curves | `tools/mascot-vector/` → `assets/mascot-vector/` |
| `pixel` | stubby mascot, pixel art (adapted from a character template) | `tools/mascot-pixel/` → `assets/mascot-pixel/` |
| `vector` | the original flat vector mascot | `src/render/draw.ts` |

`?slide=side|1|2|3|4|5|c1|c2|c3|c4|c5` picks what the flat mascot does on the down key: the side-view slide, a slide seen from behind (1–5), or a crouch (c1–c5). The default is the Tuck ball crouch (`c2`); see `assets/mascot-2d/README.md`. `src/render/pixel-mascot.ts` loads a set on demand; `src/render/pixel-frames.ts` picks the frame from the game state using the set's tagged ranges.

## PPE icons

The five PPE pickups (hard hat, gloves, safety glasses, ear muffs, work boots) are flat vector illustrations, plus mask, hi-vis vest and first-aid kit as extra assets.
One data file, `src/render/ppe-icons.ts`, draws them in the game (floating pickups with no frame, and HUD slots) and generates `assets/ppe/svg/*.svg` (`npm run ppe:svg`). See `assets/ppe/README.md`.

## How the graphics work

* **Two renderers, one look.** `index.ts` picks WebGL (PixiJS) when the device has WebGL2 and the floor shader compiles, otherwise
  Canvas2D. Everything that decides *what the world looks like at this instant* lives in `fx.ts`, so both move identically.
  Append `?renderer=canvas` to force the fallback and `?debug` to show the renderer, fps and render scale (handy for comparing phones).
* **Smooth at any refresh rate.** The sim steps at a fixed 60 Hz, but drawing happens at the display's own rate and blends the
  last two steps (`alpha`), so motion is even on 60, 90, 120 and 144 Hz screens.
* **Sprites.** Obstacles, pickups and the mascot's run/slide frames are drawn once into textures (`draw.ts` → `sprites.ts`).
  On WebGL they are GPU textures with mipmaps and batch into ~3 draw calls per frame; the road is a fragment shader that
  inverts the camera projection per pixel, so the stripes stay anti-aliased to the horizon with no per-frame geometry.
* **2.5D touches.** The camera slides with the player (parallax), distant objects fade out of the haze instead of popping in,
  the mascot leans into lane changes and squashes/stretches when jumping and landing.
* **HUD is DOM**, not canvas text. If the device can't hold ~25 fps the render resolution steps down automatically.
* Pixi's own tickers are stopped: the game loop calls `render()` itself, once per `requestAnimationFrame`.

## Environment variables (Vercel)

| Key | Purpose |
|---|---|
| `POSTGRES_URL` | added automatically when the Supabase store is connected to the project |
| `ADMIN_KEY` | password for `/admin` |
| `ALLOWED_IDS` | optional comma-separated list of valid employee IDs; empty = any 3–15 letters/digits |
| `MAX_PLAYS` | optional cap on plays per employee; empty/0 = unlimited |
