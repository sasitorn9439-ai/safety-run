import { sql, init, normId, sha, json, body, MAX_PLAYS } from '../lib/db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method' });
  try {
    const b = body(req), id = normId(b.id), run = String(b.run || '').replace(/\D/g, '');
    const score = Math.max(0, Math.floor(+b.score || 0));
    if (!run) return json(res, 400, { error: 'run' });
    await init();
    const [p] = await sql`select token_hash, score, extract(epoch from now() - started_at)::float as secs
      from safety_run_runs where id = ${run} and emp_id = ${id}`;
    if (!p || p.token_hash !== sha(b.token)) return json(res, 403, { error: 'token' });
    let final = p.score;
    if (p.score == null) {
      // plausibility cap: distance + PPE cannot outrun elapsed play time
      const cap = Math.floor(p.secs * 80 + 500);
      final = Math.min(score, cap);
      await sql`update safety_run_runs set score = ${final}, secs = ${Math.round(p.secs)},
        capped = ${score > cap}, finished_at = now() where id = ${run} and score is null`;
    }
    const [s] = await sql`select count(*)::int as used, max(score) as best from safety_run_runs where emp_id = ${id}`;
    return json(res, 200, { score: final, best: s.best, used: s.used, max: MAX_PLAYS });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: 'server' });
  }
}
