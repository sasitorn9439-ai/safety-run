import { put } from '@vercel/blob';
import { normId, read, create, sha, lbPath, json, body } from '../lib/store.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method' });
  try {
    const b = body(req), id = normId(b.id);
    let score = Math.max(0, Math.floor(+b.score || 0));
    const play = await read(`plays/${id}.json`);
    if (!play || play.tokenHash !== sha(b.token)) return json(res, 403, { error: 'token' });
    // plausibility cap: distance + PPE cannot outrun elapsed time
    const secs = (Date.now() - play.startedAt) / 1000;
    const cap = Math.floor(secs * 45 + 200);
    const capped = score > cap;
    if (capped) score = cap;
    const ok = await create(`done/${id}.json`, { id, name: play.name, score, capped, finishedAt: Date.now(), secs: Math.round(secs) });
    if (!ok) return json(res, 409, { error: 'already_submitted' });
    await put(lbPath(score, id, play.name), '{}', { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json' });
    return json(res, 200, { score });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: 'server' });
  }
}
