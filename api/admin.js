import crypto from 'node:crypto';
import { sql, init, normId, json, body } from '../lib/db.js';

const okKey = k => {
  const a = Buffer.from(String(k || '')), b = Buffer.from(process.env.ADMIN_KEY || '');
  return b.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method' });
  try {
    const b = body(req);
    if (!okKey(b.key)) return json(res, 401, { error: 'key' });
    await init();
    if (b.action === 'export') {
      const rows = await sql`select r.emp_id as id, max(p.avatar) as avatar, count(*)::int as plays,
          max(score) as best, string_agg(coalesce(score::text, '—'), ' / ' order by run_no) as scores,
          min(started_at) as "startedAt", bool_or(capped) as flagged,
          count(*) filter (where score is null)::int as unfinished
        from safety_run_runs r left join safety_run_players p using (emp_id) group by r.emp_id
        order by max(score) desc nulls last, min(started_at) asc`;
      return json(res, 200, { rows });
    }
    if (b.action === 'reset') {
      const id = normId(b.id);
      if (!id) return json(res, 400, { error: 'id' });
      const r = await sql`delete from safety_run_runs where emp_id = ${id} returning id`;
      // the avatar stays with the employee, so a reset never hands their icon to someone else
      return json(res, 200, { reset: id, found: r.length });
    }
    return json(res, 400, { error: 'action' });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: 'server' });
  }
}
