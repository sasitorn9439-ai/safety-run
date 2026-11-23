import { sql, init, normId, mask, json } from '../lib/db.js';

export default async function handler(req, res) {
  try {
    await init();
    const id = normId(req.query?.id);
    // sequential on purpose: one pooled connection, no pipelining
    const top = await sql`select emp_id, name, score from safety_run_plays where score is not null
        order by score desc, finished_at asc limit 20`;
    const cnt = await sql`select count(*)::int as total from safety_run_plays where score is not null`;
    const total = cnt[0]?.total || 0;
    let me = [];
    if (id) me = await sql`select 1 + (select count(*)::int from safety_run_plays o where o.score is not null and
          (o.score > p.score or (o.score = p.score and o.finished_at < p.finished_at))) as rank
          from safety_run_plays p where p.emp_id = ${id} and p.score is not null`;
    return json(res, 200, {
      total, rank: me[0]?.rank || 0,
      top: top.map(r => ({ id: mask(r.emp_id), name: r.name, score: r.score }))
    }, id ? 'no-store' : 'public, s-maxage=5, stale-while-revalidate=10');
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: 'server' });
  }
}
