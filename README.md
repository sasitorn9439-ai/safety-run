# Safety Run · EHS Day 2026 (MCAM)

Subway-style safety game: dodge factory hazards, collect PPE, answer a safety quiz for a second chance.
**One play per employee ID**, enforced on the server.

- `public/index.html` — the game (mobile swipe / keyboard)
- `public/admin.html` — results, CSV copy, reset an ID (needs `ADMIN_KEY`)
- `api/start` — claims the employee ID (primary key in Postgres table `safety_run_plays`); a second claim returns 409
- `api/finish` — accepts one score per ID, caps scores that exceed play time
- `api/leaderboard` — top 20 + player's rank

## Environment variables (Vercel)
| Key | Purpose |
|---|---|
| `POSTGRES_URL` | added automatically when the Supabase store is connected to the project |
| `ADMIN_KEY` | password for `/admin` |
| `ALLOWED_IDS` | optional comma-separated list of valid employee IDs; empty = any 3–15 letters/digits |
