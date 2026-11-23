import { sql, init, normId, sha, json, body } from '../lib/db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method' });
  try {
    const b = body(req), id = normId(b.id), score = Math.max(0, Math.floor(+b.score || 0));
    await init();
    const [p] = await sql`select token_hash, score, extract(epoch from now() - started_at)::float as secs
      from safety_run_plays where emp_id = ${id}`;
    if (!p || p.token_hash !== sha(b.token)) return json(res, 403, { error: 'token' });
    if (p.score != null) return json(res, 409, { error: 'already_submitted', score: p.score });
    // plausibility cap: distance + PPE cannot outrun elapsed play time
    const cap = Math.floor(p.secs * 45 + 200), final = Math.min(score, cap);
    const r = await sql`update safety_run_plays set score = ${final}, secs = ${Math.round(p.secs)},
      capped = ${score > cap}, finished_at = now()
      where emp_id = ${id} and score is null returning score`;
    if (!r.length) return json(res, 409, { error: 'already_submitted' });
    return json(res, 200, { score: final });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: 'server' });
  }
}
