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
      const rows = await sql`select emp_id as id, name, started_at as "startedAt", score, secs, capped as flagged
        from safety_run_plays order by score desc nulls last, finished_at asc`;
      return json(res, 200, { rows });
    }
    if (b.action === 'reset') {
      const id = normId(b.id);
      if (!id) return json(res, 400, { error: 'id' });
      const r = await sql`delete from safety_run_plays where emp_id = ${id} returning emp_id`;
      return json(res, 200, { reset: id, found: r.length > 0 });
    }
    return json(res, 400, { error: 'action' });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: 'server' });
  }
}
