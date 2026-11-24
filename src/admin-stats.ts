import type { AdminRun } from './lib/api.js';

export type RunStatus = 'finished' | 'unfinished' | 'legacy';

export interface RunFilter {
  /** part of the employee id, any case */
  text: string;
  status: 'all' | 'finished' | 'unfinished';
  runNo: 'all' | number;
  /** started_at bounds in epoch ms, both inclusive */
  from: number | null;
  to: number | null;
  /** score bounds; they only drop finished runs, unfinished runs have no score to compare */
  minScore: number | null;
  maxScore: number | null;
  includeHidden: boolean;
  includeLegacy: boolean;
}

export const NO_FILTER: RunFilter = {
  text: '', status: 'all', runNo: 'all', from: null, to: null, minScore: null, maxScore: null, includeHidden: true, includeLegacy: true,
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

export function filterRuns(runs: readonly AdminRun[], f: RunFilter): AdminRun[] {
  const text = f.text.trim().toLowerCase();
  return runs.filter(r => {
    const t = new Date(r.startedAt).getTime();
    return (!text || r.id.toLowerCase().includes(text))
      && (f.status === 'all' || (f.status === 'finished') === (r.score != null))
      && (f.runNo === 'all' || r.runNo === f.runNo)
      && (f.from == null || t >= f.from) && (f.to == null || t <= f.to)
      && (r.score == null || ((f.minScore == null || r.score >= f.minScore) && (f.maxScore == null || r.score <= f.maxScore)))
      && (f.includeHidden || !r.hidden) && (f.includeLegacy || !r.legacy);
  });
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
