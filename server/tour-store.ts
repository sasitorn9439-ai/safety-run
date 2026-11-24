import type { StageId } from '../shared/sim.js';

export type Slot = 0 | 1 | 2;
export const SLOTS: readonly Slot[] = [0, 1, 2];

export interface TourPlayer { slot: Slot; empId: string; avatar: number; tokenHash: string; score: number | null; correct: number | null }
export interface TourRoom {
  code: string; hostHash: string; seed: number; stage: StageId; duration: number;
  /** `lobby` until the host starts; startAt (ms since epoch) is set with `running` */
  status: 'lobby' | 'running'; startAt: number | null;
  players: TourPlayer[];
}

/** Tournament rooms. Postgres in production, memory for `npm run dev`. */
export interface TourStore {
  init(): Promise<void>;
  /** false if the code is taken */
  create(r: { code: string; hostHash: string; seed: number; stage: StageId; duration: number }): Promise<boolean>;
  get(code: string): Promise<TourRoom | null>;
  /** the player's slot (the same one again if this employee already joined, with the new token); null when the room is full */
  join(code: string, p: { empId: string; avatar: number; tokenHash: string }): Promise<Slot | null>;
  kick(code: string, slot: Slot): Promise<void>;
  config(code: string, stage: StageId, duration: number): Promise<void>;
  /** lobby → running; false if it was not in the lobby */
  start(code: string, startAt: number): Promise<boolean>;
  /** stores the verified result once; false if this slot already has one */
  finish(code: string, slot: Slot, score: number, correct: number): Promise<boolean>;
  /** back to the lobby with a new track, same players, results cleared */
  reset(code: string, seed: number): Promise<void>;
}

export function createMemoryTourStore(): TourStore {
  const rooms = new Map<string, TourRoom>();
  const lobby = (code: string) => { const r = rooms.get(code); return r?.status === 'lobby' ? r : null; };
  return {
    async init() {},
    async create(r) {
      if (rooms.has(r.code)) return false;
      rooms.set(r.code, { ...r, status: 'lobby', startAt: null, players: [] });
      return true;
    },
    async get(code) {
      const r = rooms.get(code);
      return r ? structuredClone(r) : null;
    },
    async join(code, p) {
      const r = rooms.get(code)!;
      const have = r.players.find(x => x.empId === p.empId);
      if (have) { have.tokenHash = p.tokenHash; return have.slot; }
      const slot = SLOTS.find(s => !r.players.some(x => x.slot === s));
      if (slot == null) return null;
      r.players.push({ slot, ...p, score: null, correct: null });
      r.players.sort((a, b) => a.slot - b.slot);
      return slot;
    },
    async kick(code, slot) {
      const r = lobby(code);
      if (r) r.players = r.players.filter(p => p.slot !== slot);
    },
    async config(code, stage, duration) {
      const r = lobby(code);
      if (r) { r.stage = stage; r.duration = duration; }
    },
    async start(code, startAt) {
      const r = lobby(code);
      if (!r) return false;
      r.status = 'running'; r.startAt = startAt;
      return true;
    },
    async finish(code, slot, score, correct) {
      const p = rooms.get(code)?.players.find(x => x.slot === slot);
      if (!p || p.score != null) return false;
      p.score = score; p.correct = correct;
      return true;
    },
    async reset(code, seed) {
      const r = rooms.get(code);
      if (!r) return;
      r.status = 'lobby'; r.startAt = null; r.seed = seed;
      for (const p of r.players) { p.score = null; p.correct = null; }
    },
  };
}
