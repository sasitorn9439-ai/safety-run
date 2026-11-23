import { replayScore, STEP } from '../public/run.js';
import { sql, init, normId, sha, json, body, MAX_PLAYS } from '../lib/db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method' });
  try {
    const b = body(req), id = normId(b.id), run = String(b.run || '').replace(/\D/g, '');
    if (!run) return json(res, 400, { error: 'run' });
    await init();
    const [p] = await sql`select token_hash, score, game_seed, extract(epoch from now() - started_at)::float as secs
      from safety_run_runs where id = ${run} and emp_id = ${id}`;
    if (!p || p.token_hash !== sha(b.token)) return json(res, 403, { error: 'token' });
    if (p.game_seed == null) return json(res, 409, { error: 'old_run' });

    let final = p.score;
    if (final == null) {
      if (!Number.isInteger(b.ticks) || b.ticks * STEP > p.secs + 0.25) {
        return json(res, 400, { error: 'invalid_replay' });
      }
      const score = replayScore(Number(p.game_seed), b.ticks, b.inputs);
      if (score == null) return json(res, 400, { error: 'invalid_replay' });
      const [saved] = await sql`update safety_run_runs set score = ${score},
        secs = ${Math.round(b.ticks * STEP)}, finished_at = now()
        where id = ${run} and score is null returning score`;
      if (saved) final = saved.score;
      else {
        const [existing] = await sql`select score from safety_run_runs where id = ${run}`;
        if (!existing) return json(res, 409, { error: 'old_run' });
        final = existing.score;
      }
    }
    const [s] = await sql`select count(*)::int as used,
      max(score) filter (where game_seed is not null) as best from safety_run_runs where emp_id = ${id}`;
    return json(res, 200, { score: final, best: s.best, used: s.used, max: MAX_PLAYS || null });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: 'server' });
  }
}
