# Safety Run · EHS Day 2026 (MCAM)

Subway-style safety game: dodge factory hazards, collect PPE, answer a safety quiz for a second chance.
**One play per employee ID**, enforced on the server.

- `public/index.html` — the game (mobile swipe / keyboard)
- `public/admin.html` — results, CSV copy, reset an ID (needs `ADMIN_KEY`)
- `api/start` — claims the employee ID (create-only blob `plays/{id}.json`); a second claim returns 409
- `api/finish` — accepts one score per ID (`done/{id}.json`), caps scores that exceed play time
- `api/leaderboard` — top 20 + player's rank

## Environment variables (Vercel)
| Key | Purpose |
|---|---|
| `BLOB_READ_WRITE_TOKEN` | added automatically when the Blob store is connected |
| `ADMIN_KEY` | password for `/admin` |
| `ALLOWED_IDS` | optional comma-separated list of valid employee IDs; empty = any 3–15 letters/digits |
