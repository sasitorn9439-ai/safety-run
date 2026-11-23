import crypto from 'node:crypto';
import { sql, init, normId, idOk, cleanName, sha, json, body, MAX_PLAYS, avatarOf } from '../lib/db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method' });
  try {
    const b = body(req), id = normId(b.id), name = cleanName(b.name);
    if (!idOk(id)) return json(res, 400, { error: 'bad_id' });
    await init();
    const ua = String(req.headers['user-agent'] || '').slice(0, 160);
    const avatar = await avatarOf(id);
    for (let attempt = 0; attempt < 3; attempt++) {
      const [s] = await sql`select count(*)::int as used, max(score) filter (where game_seed is not null) as best from safety_run_runs where emp_id = ${id}`;
      if (MAX_PLAYS && s.used >= MAX_PLAYS) return json(res, 409, { error: 'used', max: MAX_PLAYS, best: s.best, avatar });
      const token = crypto.randomBytes(18).toString('base64url'), runNo = s.used + 1;
      const seed = crypto.randomBytes(4).readUInt32BE();
      const r = await sql`insert into safety_run_runs (emp_id, run_no, name, token_hash, ua, game_seed)
        values (${id}, ${runNo}, ${name}, ${sha(token)}, ${ua}, ${seed})
        on conflict (emp_id, run_no) do nothing returning id`;
      if (r.length) return json(res, 200, { token, seed, run: r[0].id, runNo, max: MAX_PLAYS || null, best: s.best, avatar });
      // another device claimed the same run number at the same moment: re-count and retry
    }
    return json(res, 409, { error: 'busy' });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: 'server' });
  }
}
