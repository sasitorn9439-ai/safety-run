# Safety Run · EHS Day 2026 (MCAM)

Subway-style safety game: dodge factory hazards, collect PPE, answer a safety quiz for a second chance.
**Unlimited plays (best score counts)**; each employee ID gets a unique avatar, and the leaderboard shows avatars only (`MAX_PLAYS` env to cap plays).

- `public/index.html` — the game (mobile swipe / keyboard); login is employee ID only; prizes: 1st HUAWEI Band 11 Series (Polym Black), 2nd–3rd BEZ ร่มพับอัตโนมัติ
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
