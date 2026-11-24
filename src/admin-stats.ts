import { avName } from '../shared/avatar.js';
import type { AdminRun } from './lib/api.js';

export type RunStatus = 'finished' | 'unfinished' | 'legacy';

/** both ends inclusive; a row with no value fails any range that has a bound */
export interface Range { min: number | null; max: number | null }
const ANY: Range = { min: null, max: null };

/** one control per column of the runs table */
export interface RunFilter {
  /** part of the employee id, any case */
  id: string;
  /** part of the avatar name */
  avatar: string;
  runNo: 'all' | number;
  /** epoch ms */
  started: Range;
  finished: Range;
  secs: Range;
  score: Range;
  status: 'all' | RunStatus;
  hidden: 'all' | 'shown' | 'hidden';
}

export const NO_FILTER: RunFilter = {
  id: '', avatar: '', runNo: 'all', started: ANY, finished: ANY, secs: ANY, score: ANY, status: 'all', hidden: 'all',
};

export interface HourCount { /** epoch ms of the local hour start */ hour: number; started: number; finished: number }
export interface ScoreCount { /** lowest score in the bucket */ from: number; count: number }

export interface Summary {
  players: number; started: number; finished: number; unfinished: number;
  /** null when there are no runs, likewise every score and time stat when nothing finished */
  finishRate: number | null;
  best: number | null; meanScore: number | null; medianScore: number | null; meanSecs: number | null;
  /** hours that have runs, oldest first; a run counts in the hour it started, finished or not */
  perHour: HourCount[];
  /** from the lowest to the highest finished score, empty buckets included */
  scoreBuckets: ScoreCount[];
}

export const SCORE_BUCKET = 500;

export const runStatus = (r: AdminRun): RunStatus => (r.legacy ? 'legacy' : r.score == null ? 'unfinished' : 'finished');

const inRange = (v: number | null, r: Range) =>
  (r.min == null && r.max == null) || (v != null && (r.min == null || v >= r.min) && (r.max == null || v <= r.max));
const ms = (t: string | null) => (t == null ? null : new Date(t).getTime());

export function filterRuns(runs: readonly AdminRun[], f: RunFilter): AdminRun[] {
  const id = f.id.trim().toLowerCase(), avatar = f.avatar.trim();
  return runs.filter(r => (!id || r.id.toLowerCase().includes(id))
    && (!avatar || avName(r.avatar).includes(avatar))
    && (f.runNo === 'all' || r.runNo === f.runNo)
    && inRange(ms(r.startedAt), f.started) && inRange(ms(r.finishedAt), f.finished)
    && inRange(r.secs, f.secs) && inRange(r.score, f.score)
    && (f.status === 'all' || runStatus(r) === f.status)
    && (f.hidden === 'all' || r.hidden === (f.hidden === 'hidden')));
}

export interface PlayerHeat {
  /** local hours of the day that have any run, earliest to latest, gaps included */
  hours: number[];
  /** local days that have runs, oldest first; players[i] counts distinct employees who started a run in hours[i] */
  days: { day: number; players: number[] }[];
  max: number;
}

/** distinct players per day × hour of day, a player counted once per cell however many runs they started */
export function playerHeat(runs: readonly AdminRun[]): PlayerHeat {
  const cells = new Map<number, Map<number, Set<string>>>();
  let lo = 24, hi = -1;
  for (const r of runs) {
    const d = new Date(r.startedAt), h = d.getHours();
    d.setHours(0, 0, 0, 0);
    const day = cells.get(d.getTime()) ?? new Map<number, Set<string>>();
    cells.set(d.getTime(), day);
    day.set(h, (day.get(h) ?? new Set()).add(r.id));
    lo = Math.min(lo, h); hi = Math.max(hi, h);
  }
  const hours = hi < 0 ? [] : Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  let max = 0;
  const days = [...cells.entries()].sort((a, b) => a[0] - b[0]).map(([day, m]) => {
    const players = hours.map(h => m.get(h)?.size ?? 0);
    max = Math.max(max, ...players);
    return { day, players };
  });
  return { hours, days, max };
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function summarize(runs: readonly AdminRun[]): Summary {
  const scores = runs.flatMap(r => (r.score == null ? [] : [r.score])).sort((a, b) => a - b);
  const secs = runs.flatMap(r => (r.score == null || r.secs == null ? [] : [r.secs]));
  const n = scores.length, mid = n >> 1;

  const hours = new Map<number, HourCount>();
  for (const r of runs) {
    const d = new Date(r.startedAt);
    d.setMinutes(0, 0, 0);
    const h = hours.get(d.getTime()) ?? { hour: d.getTime(), started: 0, finished: 0 };
    h.started++;
    if (r.score != null) h.finished++;
    hours.set(h.hour, h);
  }

  const scoreBuckets: ScoreCount[] = [];
  if (n) {
    const lo = Math.floor(scores[0]! / SCORE_BUCKET), hi = Math.floor(scores[n - 1]! / SCORE_BUCKET);
    for (let b = lo; b <= hi; b++) scoreBuckets.push({ from: b * SCORE_BUCKET, count: 0 });
    for (const s of scores) scoreBuckets[Math.floor(s / SCORE_BUCKET) - lo]!.count++;
  }

  return {
    players: new Set(runs.map(r => r.id)).size,
    started: runs.length, finished: n, unfinished: runs.length - n,
    finishRate: runs.length ? n / runs.length : null,
    best: n ? scores[n - 1]! : null,
    meanScore: mean(scores),
    medianScore: n ? (n % 2 ? scores[mid]! : (scores[mid - 1]! + scores[mid]!) / 2) : null,
    meanSecs: mean(secs),
    perHour: [...hours.values()].sort((a, b) => a.hour - b.hour),
    scoreBuckets,
  };
}
