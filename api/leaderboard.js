import { listAll, parseLb, json } from '../lib/store.js';

export default async function handler(req, res) {
  try {
    const all = (await listAll('lb/')).map(b => parseLb(b.pathname, b.uploadedAt)).filter(Boolean);
    all.sort((a, b) => b.score - a.score || new Date(a.at) - new Date(b.at));
    const id = String(req.query?.id || '').toUpperCase();
    const rank = id ? all.findIndex(e => e.id === id) + 1 : 0;
    const top = all.slice(0, 20).map(({ id, ...r }) => ({ ...r, id: id.length > 4 ? '•'.repeat(id.length - 3) + id.slice(-3) : id }));
    return json(res, 200, { total: all.length, top, rank }, 'public, s-maxage=5, stale-while-revalidate=10');
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: 'server' });
  }
}
