import { sql, init, normId, mask, json } from '../lib/db.js';

// best run per employee; ties go to whoever reached that score first
const BEST = sql => sql`
  select distinct on (emp_id) emp_id, name, score, finished_at
  from safety_run_runs where score is not null
  order by emp_id, score desc, finished_at asc`;

export default async function handler(req, res) {
  try {
    await init();
    const id = normId(req.query?.id);
    // sequential on purpose: one pooled connection, no pipelining
    const top = await sql`select emp_id, name, score from (${BEST(sql)}) b order by score desc, finished_at asc limit 20`;
    const cnt = await sql`select count(distinct emp_id)::int as total from safety_run_runs where score is not null`;
    let rank = 0;
    if (id) {
      const r = await sql`with b as (${BEST(sql)})
        select 1 + (select count(*)::int from b o where o.score > m.score or (o.score = m.score and o.finished_at < m.finished_at)) as rank
        from b m where m.emp_id = ${id}`;
      rank = r[0]?.rank || 0;
    }
    return json(res, 200, {
      total: cnt[0]?.total || 0, rank,
      top: top.map(r => ({ id: mask(r.emp_id), name: r.name, score: r.score }))
    }, id ? 'no-store' : 'public, s-maxage=5, stale-while-revalidate=10');
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: 'server' });
  }
}
