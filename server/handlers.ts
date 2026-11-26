import crypto from 'node:crypto';
import { replayRun, rulesOf, STEP } from '../shared/sim.js';
import { equip, openBox, wardrobeFrom, type Pull } from '../src/cosmetics/wardrobe.js';
import { SLOTS, type Slot } from '../src/cosmetics/types.js';
import type { Store } from './store.js';

export interface Reply { status: number; body: unknown; cache?: string }
type Json = Record<string, unknown>;

// 0 / unset = unlimited plays per employee
export const maxPlays = () => Math.max(0, +(process.env.MAX_PLAYS || 0) || 0);

// LOGIN_CLOSED=1: nobody new can log in or start a run (waiting for the score announcement); runs already started can still finish
export const loginClosed = () => process.env.LOGIN_CLOSED === '1';

export const sha = (s: unknown) => crypto.createHash('sha256').update(String(s)).digest('hex');
export const normId = (s: unknown) => String(s || '').trim().toUpperCase().replace(/\s+/g, '');
const cleanName = (s: unknown) => String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 40);
/**
 * Employee ids are numbers. A new one must be exactly 4 digits; an all-digit id from before that rule (e.g. "000") keeps
 * working for whoever already played with it, so their runs and chests stay theirs. Ids with letters are refused.
 */
export const idOk = async (store: Store, id: string) => {
  if (!/^[0-9]{1,15}$/.test(id)) return false;
  const allow = (process.env.ALLOWED_IDS || '').split(/[,\s]+/).filter(Boolean).map(normId);
  if (allow.length && !allow.includes(id)) return false;
  if (/^[0-9]{4}$/.test(id)) return true;
  await store.init();
  return store.known(id);
};
const reply = (status: number, body: unknown, cache?: string): Reply => ({ status, body, cache });
export const timingSafeKey = (given: unknown) => {
  const a = Buffer.from(String(given || '')), b = Buffer.from(process.env.ADMIN_KEY || '');
  return b.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
};

export async function start(store: Store, b: Json, ua: string): Promise<Reply> {
  const id = normId(b.id), name = cleanName(b.name), MAX = maxPlays();
  if (loginClosed()) return reply(403, { error: 'closed' });
  if (!await idOk(store, id)) return reply(400, { error: 'bad_id' });
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
    const rules = rulesOf(b.rules);
    if (rules == null) return reply(400, { error: 'invalid_replay' });
    const replay = replayRun(p.seed, ticks, b.inputs, rules);
    if (replay == null) return reply(400, { error: 'invalid_replay' });
    const saved = await store.finishRun(run, { score: replay.score, secs: Math.round((ticks as number) * STEP), dist: replay.dist, loot: replay.loot });
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
    top: top.map(r => ({ avatar: r.avatar ?? -1, score: r.score, me: !!id && r.empId === id, ...Object.keys(r.look).length && { look: r.look } })),
  }, id ? 'no-store' : 'public, s-maxage=5, stale-while-revalidate=10');
}

/**
 * The prize-announcement deck counts runs finished before this moment: 27 Nov 2026, 08:00 Thailand time (01:00 UTC).
 * Anything played later is left out of every total and every ranking. The admin request may pass `before` (an ISO time) to rehearse with another cut.
 */
export const ANNOUNCE_CUTOFF = new Date('2026-11-27T08:00:00+07:00');

export async function admin(store: Store, b: Json): Promise<Reply> {
  if (!timingSafeKey(b.key)) return reply(401, { error: 'key' });
  await store.init();
  if (b.action === 'export') return reply(200, { rows: await store.adminExport() });
  if (b.action === 'announce') {
    const before = b.before == null ? ANNOUNCE_CUTOFF : new Date(String(b.before));
    if (Number.isNaN(before.getTime())) return reply(400, { error: 'before' });
    return reply(200, { before: before.toISOString(), players: await store.adminAnnounce(before) });
  }
  if (b.action === 'runs') return reply(200, { runs: await store.adminRuns() });
  if (b.action === 'players') return reply(200, { players: await store.adminPlayers() });
  if (b.action === 'hide') {
    const id = normId(b.id);
    if (!id || typeof b.hidden !== 'boolean') return reply(400, { error: 'id' });
    return reply(200, { id, hidden: b.hidden, found: await store.adminHide(id, b.hidden) });
  }
  if (b.action === 'grant') {
    // n loot boxes to each listed employee (ids: "A1, B2" or ["A1", "B2"]), or to every player so far (all: true)
    const n = Number(b.n);
    if (!Number.isInteger(n) || n < 1 || n > 100) return reply(400, { error: 'n' });
    if (b.all === true) return reply(200, { n, ...await store.grantBoxes('all', n) });
    const raw = (Array.isArray(b.ids) ? b.ids : String(b.ids ?? '').split(/[,\s]+/)).map(normId).filter(Boolean);
    const ids = [...new Set(raw)], ok = await Promise.all(ids.map(id => idOk(store, id)));
    const bad = ids.filter((_, i) => !ok[i]), good = ids.filter((_, i) => ok[i]);
    if (!good.length || bad.length) return reply(400, { error: 'ids', bad });
    return reply(200, { n, ...await store.grantBoxes(good, n) });
  }
  return reply(400, { error: 'action' });
}

const random = () => crypto.randomBytes(4).readUInt32BE() / 2 ** 32;

/** at most this many boxes per open request */
export const OPEN_MAX = 10;

/**
 * The player's cosmetics. Everything is decided here, never on the device: boxes are only those picked up on runs whose replay
 * verified or that an admin handed out, the server rolls what a box gives, and only owned items can be worn.
 * Actions: get (default), open { n = 1 } (up to OPEN_MAX boxes, fewer if fewer are left; items: { id, dupe, free }), equip { slot, item }.
 */
export async function wardrobe(store: Store, b: Json): Promise<Reply> {
  const id = normId(b.id);
  if (loginClosed() && (b.action === undefined || b.action === 'get')) return reply(403, { error: 'closed' });   // this call is the login
  if (!await idOk(store, id)) return reply(400, { error: 'bad_id' });
  await store.init();
  const read = async () => {
    const s = await store.wardrobe(id);
    return { opened: s.opened.length, w: wardrobeFrom(s.earned, s.opened, s.equipped, s.runs) };
  };
  let { opened, w } = await read();
  if (b.action === undefined || b.action === 'get') return reply(200, w);
  if (b.action === 'equip') {
    if (!SLOTS.includes(b.slot as Slot)) return reply(400, { error: 'slot' });
    const item = b.item == null ? null : String(b.item), next = equip(w, b.slot as Slot, item);
    if (next === w) return reply(400, { error: 'not_owned' });
    await store.setEquipped(id, next.equipped as Record<string, string>);
    return reply(200, next);
  }
  if (b.action === 'open') {
    const n = b.n === undefined ? 1 : Number(b.n);
    if (!Number.isInteger(n) || n < 1 || n > OPEN_MAX) return reply(400, { error: 'n' });
    const pulls: Pull[] = [];
    for (let clashes = 0; pulls.length < n && clashes < 3;) {
      const r = openBox(w, random);
      if (!r) break;
      if (await store.addCosmetic(id, opened + 1, r.pull.item.id, r.pull.dupe)) { pulls.push(r.pull); opened++; w = r.wardrobe; }
      else { clashes++; ({ opened, w } = await read()); }        // another device opened a box at the same moment: re-read, roll again
    }
    if (!pulls.length) return reply(409, { error: w.boxes ? 'busy' : 'no_box' });
    return reply(200, { ...w, items: pulls.map(p => ({ id: p.item.id, dupe: p.dupe, free: p.free })) });
  }
  return reply(400, { error: 'action' });
}
