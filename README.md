# Safety Run · EHS Day 2026 (MCAM)

Subway-style safety game: dodge factory hazards, collect PPE, answer a safety quiz for a second chance.
**Unlimited plays (best score counts)**; each employee ID gets a unique avatar, and the leaderboard shows avatars only (`MAX_PLAYS` env to cap plays).
Prizes: 1st HUAWEI Band 11 Series (Polym Black), 2nd–5th fuel card, 6th–7th BEZ automatic umbrella.

## Develop

```sh
npm install
npm run dev        # http://localhost:5173 — /api/* is served from memory, no database needed (admin key: dev)
                   # /?botsim: watch a bot (or play yourself) from any distance, to feel each speed step
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
| `src/tournament/` | The tournament page: `player.ts` (phone), `host.ts` (big screen), `race.ts` (steps a race on the server clock), `net.ts` (API + realtime channel) |
| `server/tournament.ts` | Tournament rooms on a `TourStore` (`tour-store.ts` in memory, `postgres-tour-store.ts`) |
| `index.html`, `admin.html`, `tournament.html` | The three pages (`/`, `/admin` and `/tournament`) |

## How scores are verified

`api/start` gives the browser a random seed. The browser plays the run with `shared/sim.ts`, which advances in exact 1/60 s steps,
and records `[tick, action]` for every input. `api/finish` re-plays those inputs with the same seed and stores the score
the replay produces, so a score can't be edited in the browser, and a replay can't claim more time than has passed.

**Do not change `shared/sim.ts` lightly.** Any change to what it does with the random numbers changes every run, and a run that was
open during a deploy would be rejected. `tests/golden.json` holds bot-played runs recorded against the current sim: if
`npm test` fails there, the sim's behaviour changed. After a deliberate change, re-record them with
`GOLDEN=1 npx vitest run tests/make-golden.test.ts`.

**Speed:** 14 m/s at the start, gaining 1 m/s every 55 m until it reaches 34 m/s at 1 100 m. This takes about 49 seconds without E-Stop. It holds there until 150 000 m (about 74 minutes in), then steps up 2 m/s every 20 000 m, each step eased in over 300 m: 36 m/s at 150 000 m, 38 at 170 000, 40 at 190 000, 42 at 210 000 and 44 m/s from 230 000 m on (`DYNAMIC_FROM`, `STEP_*`, `TOP_SPEED` in `shared/sim.ts`). The tutorial runs at 10 m/s.

**Areas (zones).** The run is one long corridor split by distance into areas of the plant (`shared/zones.ts`): warehouse entrance (0–800 m),
then forklift lane, chemical area, work at height, electrical room and evacuation drill, 1 000 m each, repeating. Each has a Safety point on a banner
as you enter, a coloured light over the screen, its own mix of hazards and a lean towards the PPE it asks for. Hazards come as *patterns* that are
solvable by construction: single, double (one lane free), slalom (three rows, the free lane walks left-centre-right), low wall (jump), high wall of
scaffolding (slide), and jump-then-slide. Each area also has a hazard of its own that moves:
**fumes** (chemical area) drift sideways across the lanes; a **falling load** (work at height) follows the lane you are in, then locks and
falls, so you have to leave the lane once the mark goes solid; **sparks** (electrical room) are an arc that is live for 0.8 s and dead for 0.8 s:
jump it, or time your run through it. The evacuation drill mixes all of them. Rows are never closer than 0.9 s of running (0.6 s between patterns), so the late game stays fair.

**What's on the track:** hazards, trails of coins (+1 each, counted in the HUD) down the free lane, and PPE items (+4) that turn up
one at a time inside a trail, always one of the kinds you don't have yet. Collect all five for the shield. The Coin Rain surprise fills
all three lanes with coins and a few PPE items.

**Near Miss combo.** A late dodge (changing lane, jumping or sliding at the last moment) is reported as a near miss: +2, and every three in a row
raises a multiplier on coins, PPE and near misses (x2, x3, x4). The combo runs out after 6 s without one and breaks when something saves you.

**Power-ups** (in the coin trails, never closer than 450 m, each from its own random stream): 🚨 E-Stop slows the world to 60 % for 5 s ·
🧹 5S broom pulls coins in for 8 s · 🏗️ man-lift carries you over everything for 5 s along a zig-zag of coins · 🩹 first-aid kit absorbs one hit ·
📦 Toolbox Talk box gives a random reward (coins, shield, x2, broom, E-Stop) and a Safety tip.

**Personal best and the next place.** The HUD shows your best distance on this device with a bar; the crash screen says how many points
are missing to the next rank on the leaderboard.

**Scoring:** 1 point per metre, coin +1, PPE +10, Safety Officer praise +150. With no bonuses or E-Stop, 10 minutes of running earns about 19 840 points.

## Tournament (`/tournament`)

A live race for three players on one big screen. The host opens `/tournament`, presses **เป็น Host**, enters the admin key and gets a
room with a QR code. Players scan it (`/tournament?room=CODE`), enter their employee ID and wait in the lobby. The host starts the race;
every race lasts 2 minutes and its stage (one plant area, or the whole plant) is drawn at random when it starts. The host can kick a player in the lobby and
start a rematch with the same players.

* **Same track for everyone.** All three phones run `shared/sim.ts` in tournament mode (`RunOptions.tour`) on the room's seed. A crash
  costs about a second instead of ending the run, and the race ends on the clock. The normal power-ups and bonus coins are replaced
  by the tournament items, which draw from their own random streams so the track never changes.
* **Safety Check.** A row of question cards across all three lanes every 650 m. The world slows down and three gates (A/B/C) come up
  with the answers. Run through the right one for a Safety Sprint (2× speed for 3 s); the wrong one slows you down. The questions are
  trick questions (`shared/trick-questions.ts`), the same ones in the same order for every player.
* **Items:** LOTO Lock (moving hazards stop for 8 s), fire extinguisher (clears your lane ahead), Buddy System (auto-dodge for 5 s),
  Zero Accident ×2 (double distance points for 15 s, lost on a crash) and Spot Audit (+30, and the player in the lead gets a question:
  wrong means slower). A Spot Audit arrives as an `audit` input, so it is part of the replay.
* **The big screen doesn't stream video.** Each phone sends its `[tick, action]` presses, with where it is and how many times it has
  jumped and slid, every 250 ms. The host runs the three races itself, 0.6 s behind, and shows one of them: the one with a question up, a
  new leader, or each in turn (or the one you tap). Twice a second it sends the standings and every runner's position down to the phones,
  which draw the others as ghosts ahead of or behind them.
  A room has two one-way channels (`safety-run-tour:CODE-up` phones → host, `safety-run-tour:CODE-down` host → phones), and each side
  receives only what is meant for it: every delivery counts against the realtime plan's messages per second.
* **Scores** come from `api/tournament` replaying each phone's presses with the room's seed (`replayTour`). Ties go to the most right
  answers. Tournament results are kept apart from the main leaderboard (`safety_run_tour_*` tables).

Under `npm run dev` the realtime channel goes through the dev server (`/api/relay`), so no realtime service is needed locally (host key: `dev`).
For production, use **Ably**: set `ABLY_API_KEY` and `VITE_REALTIME=ably`. The key stays on the server: `api/tournament` (action
`realtime`) signs each seat a token that may only hear or speak its own way on its own room, and each side attaches in `PUBLISH` or
`SUBSCRIBE` mode only. Restrict the key to `safety-run-tour:*` with Publish and Subscribe (Ably reads a wildcard only after a namespace's
colon). To run the same thing locally: `ABLY_API_KEY=… VITE_REALTIME=ably npm run dev`.
Supabase Realtime still works without `VITE_REALTIME`: set the two `VITE_SUPABASE_*` variables and allow public Realtime channels in the
Supabase project; there every send is an HTTPS broadcast. Either way the channel only carries what the big screen shows: the scores that
count are always the server's own replay.

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
| `ABLY_API_KEY` | the Ably key for the tournament's realtime channels (server only; restrict it to `safety-run-tour:*`, Publish + Subscribe) |
| `VITE_REALTIME` | `ably` to use Ably (read at build time) |
| `VITE_SUPABASE_URL` | the Supabase project URL, for the realtime channel without Ably (read at build time) |
| `VITE_SUPABASE_ANON_KEY` | the project's anon (public) key, same purpose |
