import crypto from 'node:crypto';
import { STEP, TOUR_DURATION, replayTour, type StageId } from '../shared/sim.js';
import { tourTopic } from '../shared/tour-channels.js';
import { ZONES } from '../shared/zones.js';
import { idOk, normId, sha, timingSafeKey, type Reply } from './handlers.js';
import type { Store } from './store.js';
import { SLOTS, type Slot, type TourRoom, type TourStore } from './tour-store.js';

type Json = Record<string, unknown>;
const reply = (status: number, body: unknown): Reply => ({ status, body });

/** seconds between the host pressing start and GO, so every phone has polled the start time */
export const COUNTDOWN_MS = 6000;
/** a race is over for good this long after its end, even if a phone never sent its result */
export const RESULT_GRACE_MS = 30000;
export const STAGES: readonly StageId[] = ['tour', ...ZONES.map(z => z.id)];
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const newCode = () => Array.from(crypto.randomBytes(4), b => CODE_CHARS[b % CODE_CHARS.length]).join('');
const newSeed = () => crypto.randomBytes(4).readUInt32BE();
const randomStage = () => STAGES[crypto.randomInt(STAGES.length)];
const newToken = () => crypto.randomBytes(18).toString('base64url');
const cleanCode = (s: unknown) => String(s || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
const asSlot = (s: unknown): Slot | null => (SLOTS.includes(s as Slot) ? (s as Slot) : null);
export const durationTicks = (room: { duration: number }) => Math.round(room.duration / STEP);

/** what everyone may see: no tokens, no employee ids, and the seed only once the race has started */
function view(room: TourRoom, now: number) {
  const endsAt = room.startAt == null ? null : room.startAt + room.duration * 1000;
  const allIn = room.players.length > 0 && room.players.every(p => p.score != null);
  const finished = endsAt != null && (allIn || now > endsAt + RESULT_GRACE_MS);
  return {
    code: room.code, phase: finished ? 'finished' : room.status, stage: room.stage, duration: room.duration,
    startAt: room.startAt, now, seed: room.status === 'running' ? room.seed : null,
    players: room.players.map(p => ({ slot: p.slot, avatar: p.avatar, score: p.score, correct: p.correct })),
  };
}
export type RoomView = ReturnType<typeof view>;

/** a realtime token lasts this long; the Ably client asks for a new one by itself before it runs out */
const REALTIME_TTL_MS = 60 * 60 * 1000;

/**
 * An Ably token for one seat in one room: the host may only hear `up` and speak `down`; a player speaks and hears `up` and hears `down`. It is signed
 * here with ABLY_API_KEY, which never leaves the server.
 * Ably bills by monthly active users, counted by client ID, and refuses a browser's connection without one. A player's is their
 * employee id hashed with the key (the same person every race, and their id never reaches Ably); the big screen's is its room.
 */
async function realtimeToken(room: TourRoom, host: boolean, b: Json): Promise<Reply> {
  const key = process.env.ABLY_API_KEY;
  if (!key) return reply(503, { error: 'realtime' });
  const slot = asSlot(b.slot), me = room.players.find(p => p.slot === slot);
  if (!host && !(me && me.tokenHash === sha(b.token))) return reply(403, { error: 'token' });
  const up = tourTopic(room.code, 'up'), down = tourTopic(room.code, 'down');
  // a player also hears `up`: the other phones' reports, for their ghosts
  const capability = host ? { [up]: ['subscribe' as const], [down]: ['publish' as const] } : { [up]: ['publish' as const, 'subscribe' as const], [down]: ['subscribe' as const] };
  const clientId = host ? `host-${room.code}` : `emp-${sha(`${key}:${me!.empId}`).slice(0, 16)}`;
  const { createHttpClient } = await import('@ably/pubsub-server');
  return reply(200, { tokenRequest: await createHttpClient({ key }).auth.createTokenRequest({ capability, clientId, ttl: REALTIME_TTL_MS }) });
}

/**
 * Tournament rooms: the host creates one (admin key), up to three players join by employee id and the host starts it. Every
 * race lasts TOUR_DURATION and its stage is drawn at random when it starts. Each phone plays the race itself; its inputs are
 * replayed here with the room's seed for the score.
 */
export async function tournament(store: Store, tours: TourStore, b: Json, now = Date.now()): Promise<Reply> {
  await tours.init();
  const action = b.action;

  if (action === 'create') {
    if (!timingSafeKey(b.key)) return reply(401, { error: 'key' });
    const hostToken = newToken();
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = newCode();
      if (await tours.create({ code, hostHash: sha(hostToken), seed: newSeed(), stage: randomStage(), duration: TOUR_DURATION })) return reply(200, { code, hostToken });
    }
    return reply(503, { error: 'busy' });
  }

  const room = await tours.get(cleanCode(b.code));
  if (!room) return reply(404, { error: 'room' });
  const code = room.code;
  const host = room.hostHash === sha(b.hostToken);

  if (action === 'state') return reply(200, view(room, now));

  if (action === 'join') {
    if (room.status !== 'lobby') return reply(409, { error: 'started' });
    const id = normId(b.id);
    if (!await idOk(store, id)) return reply(400, { error: 'bad_id' });
    await store.init();
    const avatar = await store.avatarOf(id), token = newToken();
    const slot = await tours.join(code, { empId: id, avatar, tokenHash: sha(token) });
    if (slot == null) return reply(409, { error: 'full' });
    return reply(200, { slot, token, avatar });
  }

  if (action === 'finish') {
    const slot = asSlot(b.slot), me = room.players.find(p => p.slot === slot);
    if (slot == null || !me || me.tokenHash !== sha(b.token)) return reply(403, { error: 'token' });
    if (room.status !== 'running' || room.startAt == null) return reply(409, { error: 'not_running' });
    // the replay is the whole race: it can't arrive before the race has had time to be run
    if (now < room.startAt + room.duration * 1000 - 1000) return reply(400, { error: 'too_early' });
    if (me.score == null) {
      const result = replayTour(room.seed, { stage: room.stage, durationTicks: durationTicks(room) }, b.inputs);
      if (!result) return reply(400, { error: 'invalid_replay' });
      await tours.finish(code, slot, result.score, result.correct);
    }
    return reply(200, view((await tours.get(code))!, now));
  }

  if (action === 'realtime') return realtimeToken(room, host, b);

  // everything below is the host's
  if (!host) return reply(403, { error: 'host' });

  if (action === 'kick') {
    const slot = asSlot(b.slot);
    if (slot == null) return reply(400, { error: 'slot' });
    await tours.kick(code, slot);
  } else if (action === 'start') {
    if (!room.players.length) return reply(409, { error: 'empty' });
    if (room.status !== 'lobby') return reply(409, { error: 'started' });
    await tours.config(code, randomStage(), TOUR_DURATION);
    if (!(await tours.start(code, now + COUNTDOWN_MS))) return reply(409, { error: 'started' });
  } else if (action === 'reset') {
    await tours.reset(code, newSeed());
  } else return reply(400, { error: 'action' });

  return reply(200, view((await tours.get(code))!, now));
}
