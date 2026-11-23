import { put, get, list, del } from '@vercel/blob';
import crypto from 'node:crypto';

const A = { access: 'private' };
export const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
export const normId = s => String(s || '').trim().toUpperCase().replace(/\s+/g, '');
export const idOk = id => {
  if (!/^[A-Z0-9-]{3,15}$/.test(id)) return false;
  const allow = (process.env.ALLOWED_IDS || '').split(/[,\s]+/).filter(Boolean).map(normId);
  return !allow.length || allow.includes(id);
};
export const cleanName = s => String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 40);

// create-only write: throws if pathname already exists
export async function create(path, data) {
  try {
    await put(path, JSON.stringify(data), { ...A, addRandomSuffix: false, allowOverwrite: false, contentType: 'application/json' });
    return true;
  } catch (e) {
    if (/already exists/i.test(e.message)) return false;
    throw e;
  }
}
export async function read(path) {
  const r = await get(path, { ...A, useCache: false });
  if (!r || r.statusCode !== 200) return null;
  return new Response(r.stream).json();
}
export async function listAll(prefix) {
  const out = []; let cursor;
  for (let i = 0; i < 20; i++) {
    const r = await list({ prefix, cursor, limit: 1000 });
    out.push(...r.blobs);
    if (!r.hasMore) break;
    cursor = r.cursor;
  }
  return out;
}
export { del };

// leaderboard entries are encoded in the pathname so the board needs one list() call
export const lbPath = (score, id, name) =>
  `lb/${String(999999999 - score).padStart(9, '0')}_${id}_${Buffer.from(name || '', 'utf8').toString('base64url')}.json`;
export function parseLb(pathname, uploadedAt) {
  const m = pathname.match(/^lb\/(\d{9})_([A-Z0-9-]+)_([A-Za-z0-9_-]*)\.json$/);
  if (!m) return null;
  return { score: 999999999 - +m[1], id: m[2], name: Buffer.from(m[3], 'base64url').toString('utf8'), at: uploadedAt };
}
export function json(res, code, body, cache) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', cache || 'no-store');
  res.end(JSON.stringify(body));
}
export const body = req => (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {});
