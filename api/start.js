import crypto from 'node:crypto';
import { normId, idOk, cleanName, create, sha, json, body } from '../lib/store.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method' });
  try {
    const b = body(req), id = normId(b.id), name = cleanName(b.name);
    if (!idOk(id)) return json(res, 400, { error: 'bad_id' });
    if (!name) return json(res, 400, { error: 'no_name' });
    const token = crypto.randomBytes(18).toString('base64url');
    const ok = await create(`plays/${id}.json`, { id, name, tokenHash: sha(token), startedAt: Date.now(), ua: String(req.headers['user-agent'] || '').slice(0, 160) });
    if (!ok) return json(res, 409, { error: 'used' });
    return json(res, 200, { token });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: 'server' });
  }
}
