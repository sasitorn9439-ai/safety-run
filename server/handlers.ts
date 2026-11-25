import crypto from 'node:crypto';
import { replayScore, STEP } from '../shared/sim.js';
import type { Store } from './store.js';

export interface Reply { status: number; body: unknown; cache?: string }
type Json = Record<string, unknown>;

// 0 / unset = unlimited plays per employee
export const maxPlays = () => Math.max(0, +(process.env.MAX_PLAYS || 0) || 0);

export const sha = (s: unknown) => crypto.createHash('sha256').update(String(s)).digest('hex');
export const normId = (s: unknown) => String(s || '').trim().toUpperCase().replace(/\s+/g, '');
const cleanName = (s: unknown) => String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 40);
export const idOk = (id: string) => {
  if (!/^[0-9]{4}$/.test(id)) return false;
  const allow = (process.env.ALLOWED_IDS || '').split(/[,\s]+/).filter(Boolean).map(normId);
  return !allow.length || allow.includes(id);
};
const reply = (status: number, body: unknown, cache?: string): Reply => ({ status, body, cache });
export const timingSafeKey = (given: unknown) => {
  const a = Buffer.from(String(given || '')), b = Buffer.from(process.env.ADMIN_KEY || '');
  return b.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
};

export async function start(store: Store, b: Json, ua: string): Promise<Reply> {
  const id = normId(b.id), name = cleanName(b.name), MAX = maxPlays();
  if (!idOk(id)) return reply(400, { error: 'bad_id' });
  await store.init();
  const avatar = await store.avatarOf(id);
  for (let attempt = 0; attempt < 3; attempt++) {
    const s = await store.usage(id);
    if (MAX && s.used >= MAX) return reply(409, { error: 'used', max: MAX, best: s.best, avatar });
    const token = crypto.randomBytes(18).toString('base64url'), runNo = s.used + 1;
    const seed = crypto.randomBytes(4).readUInt32BE();
    const run = await store.createRun({ id, runNo, name, tokenHash: sha(token), ua: ua.slice(0, 160), seed });
    if (run != null) return reply(200, { token, seed, run, runNo, max: MAX || null, best: s.best, avatar });
    // another device claimed the same run number at the same moment: re-count and retry
  }
  return reply(409, { error: 'busy' });
}

export async function finish(store: Store, b: Json): Promise<Reply> {
  const id = normId(b.id), run = String(b.run || '').replace(/\D/g, '');
  if (!run) return reply(400, { error: 'run' });
  await store.init();
  const p = await store.getRun(run, id);
  if (!p || p.tokenHash !== sha(b.token)) return reply(403, { error: 'token' });
  if (p.seed == null) return reply(409, { error: 'old_run' });

  let final = p.score;
  if (final == null) {
    const ticks = b.ticks;
    if (!Number.isInteger(ticks) || (ticks as number) * STEP > p.secs + 0.25) return reply(400, { error: 'invalid_replay' });
    const score = replayScore(p.seed, ticks, b.inputs);
    if (score == null) return reply(400, { error: 'invalid_replay' });
    const saved = await store.finishRun(run, score, Math.round((ticks as number) * STEP));
    if (saved != null) final = saved;
    else {
      const existing = await store.runScore(run);
      if (existing === undefined) return reply(409, { error: 'old_run' });
      final = existing;
    }
  }
  const s = await store.usage(id);
  return reply(200, { score: final, best: s.best, used: s.used, max: maxPlays() || null });
}

export async function leaderboard(store: Store, rawId: unknown): Promise<Reply> {
  await store.init();
  const id = normId(rawId);
  const { top, total, rank } = await store.leaderboard(id);
  return reply(200, {
    total, rank,
    // employee IDs never leave the server: the board shows avatars only
    top: top.map(r => ({ avatar: r.avatar ?? -1, score: r.score, me: !!id && r.empId === id })),
  }, id ? 'no-store' : 'public, s-maxage=5, stale-while-revalidate=10');
}

export async function admin(store: Store, b: Json): Promise<Reply> {
  if (!timingSafeKey(b.key)) return reply(401, { error: 'key' });
  await store.init();
  if (b.action === 'export') return reply(200, { rows: await store.adminExport() });
  if (b.action === 'runs') return reply(200, { runs: await store.adminRuns() });
  if (b.action === 'hide') {
    const id = normId(b.id);
    if (!id || typeof b.hidden !== 'boolean') return reply(400, { error: 'id' });
    return reply(200, { id, hidden: b.hidden, found: await store.adminHide(id, b.hidden) });
  }
  return reply(400, { error: 'action' });
}
