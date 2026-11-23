# Safety Run · EHS Day 2026 (MCAM)

Subway-style safety game: dodge factory hazards, collect PPE, answer a safety quiz for a second chance.
**3 plays per employee ID (best score counts)**, enforced on the server (`MAX_PLAYS` env to change).

- `public/index.html` — the game (mobile swipe / keyboard)
- `public/admin.html` — results, CSV copy, reset an ID (needs `ADMIN_KEY`)
- `api/start` — claims the employee ID (unique (emp_id, run_no) in Postgres table `safety_run_runs`); a second claim returns 409
- `api/finish` — accepts one score per run, caps scores that exceed play time
- `api/leaderboard` — top 20 by best score per employee + player rank

## Environment variables (Vercel)
| Key | Purpose |
|---|---|
| `POSTGRES_URL` | added automatically when the Supabase store is connected to the project |
| `ADMIN_KEY` | password for `/admin` |
| `ALLOWED_IDS` | optional comma-separated list of valid employee IDs; empty = any 3–15 letters/digits |
