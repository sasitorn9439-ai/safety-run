import crypto from 'node:crypto';
import { listAll, read, del, normId, parseLb, json, body } from '../lib/store.js';

const okKey = k => {
  const a = Buffer.from(String(k || '')), b = Buffer.from(process.env.ADMIN_KEY || '');
  return b.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method' });
  try {
    const b = body(req);
    if (!okKey(b.key)) return json(res, 401, { error: 'key' });
    if (b.action === 'export') {
      const [plays, done] = await Promise.all([listAll('plays/'), listAll('done/')]);
      const doneMap = {};
      await Promise.all(done.map(async d => { const r = await read(d.pathname); if (r) doneMap[r.id] = r; }));
      const rows = await Promise.all(plays.map(async p => {
        const r = await read(p.pathname); if (!r) return null;
        const d = doneMap[r.id];
        return { id: r.id, name: r.name, startedAt: new Date(r.startedAt).toISOString(), score: d ? d.score : null, secs: d ? d.secs : null, flagged: d ? !!d.capped : false };
      }));
      return json(res, 200, { rows: rows.filter(Boolean).sort((a, b) => (b.score ?? -1) - (a.score ?? -1)) });
    }
    if (b.action === 'reset') {
      const id = normId(b.id);
      if (!id) return json(res, 400, { error: 'id' });
      const lb = (await listAll('lb/')).filter(x => parseLb(x.pathname)?.id === id).map(x => x.pathname);
      const paths = [`plays/${id}.json`, `done/${id}.json`, ...lb];
      await del(paths).catch(() => {});
      return json(res, 200, { reset: id });
    }
    return json(res, 400, { error: 'action' });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: 'server' });
  }
}
