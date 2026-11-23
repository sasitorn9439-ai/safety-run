import { sql, init, normId, json } from '../lib/db.js';

// best run per employee (hidden players excluded); ties go to whoever reached that score first
const BEST = sql => sql`
  select distinct on (emp_id) emp_id, name, score, finished_at
  from safety_run_runs r where score is not null and game_seed is not null
    and not exists (select 1 from safety_run_players p where p.emp_id = r.emp_id and p.hidden)
  order by emp_id, score desc, finished_at asc`;

export default async function handler(req, res) {
  try {
    await init();
    const id = normId(req.query?.id);
    // sequential on purpose: one pooled connection, no pipelining
    const top = await sql`select b.emp_id, b.score, p.avatar from (${BEST(sql)}) b left join safety_run_players p using (emp_id) order by b.score desc, b.finished_at asc limit 20`;
    const cnt = await sql`select count(distinct emp_id)::int as total from (${BEST(sql)}) b`;
    let rank = 0;
    if (id) {
      const r = await sql`with b as (${BEST(sql)})
        select 1 + (select count(*)::int from b o where o.score > m.score or (o.score = m.score and o.finished_at < m.finished_at)) as rank
        from b m where m.emp_id = ${id}`;
      rank = r[0]?.rank || 0;
    }
    return json(res, 200, {
      total: cnt[0]?.total || 0, rank,
      // employee IDs never leave the server: the board shows avatars only
      top: top.map(r => ({ avatar: r.avatar ?? -1, score: r.score, me: !!id && r.emp_id === id }))
    }, id ? 'no-store' : 'public, s-maxage=5, stale-while-revalidate=10');
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: 'server' });
  }
}
