import { describe, expect, it } from 'vitest';
import { NO_FILTER, filterRuns, playerHeat, runStatus, summarize, type RunFilter } from '../src/admin-stats.js';
import type { AdminRun } from '../src/lib/api.js';
import { avName } from '../shared/avatar.js';

// local wall-clock times, so the hour buckets match in any timezone
const at = (h: number, m = 0, s = 0) => new Date(2026, 11, 1, h, m, s).getTime();
const run = (o: Partial<AdminRun> & { start: number }): AdminRun => ({
  id: 'EMP1', avatar: 0, runNo: 1, finishedAt: null, secs: null, score: null, legacy: false, hidden: false,
  ...o, startedAt: new Date(o.start).toISOString(),
});

const A = run({ start: at(9, 5), score: 1200, secs: 40 });
const B = run({ start: at(9, 40), runNo: 2 }); // never submitted
const C = run({ start: at(10, 15), id: 'EMP22', score: 450, secs: 20, hidden: true });
const D = run({ start: at(8), id: 'LEG9', score: 2600, secs: null, legacy: true });
const E = run({ start: at(10, 59, 59), id: 'EMP3', runNo: 3, score: 499, secs: 30 });
const ALL = [A, B, C, D, E];
const pick = (f: Partial<RunFilter>) => filterRuns(ALL, { ...NO_FILTER, ...f });

describe('filterRuns', () => {
  it('keeps everything, in order, with no filter', () => {
    expect(filterRuns(ALL, NO_FILTER)).toEqual(ALL);
  });
  it('matches part of the employee id in any case', () => {
    expect(pick({ id: 'emp2' })).toEqual([C]);
    expect(pick({ id: ' Emp1 ' })).toEqual([A, B]);
    expect(pick({ id: 'nobody' })).toEqual([]);
  });
  it('matches part of the avatar name', () => {
    const C2 = { ...C, avatar: 1 };
    expect(filterRuns([A, C2], { ...NO_FILTER, avatar: avName(1) })).toEqual([C2]);
    expect(pick({ avatar: 'ไม่มีชื่อนี้' })).toEqual([]);
  });
  it('filters by status and run number', () => {
    expect(pick({ status: 'finished' })).toEqual([A, C, E]);
    expect(pick({ status: 'unfinished' })).toEqual([B]);
    expect(pick({ status: 'legacy' })).toEqual([D]);
    expect(pick({ runNo: 2 })).toEqual([B]);
    expect(pick({ runNo: 3, status: 'unfinished' })).toEqual([]);
  });
  it('treats both ends of the start-time range as inclusive', () => {
    expect(pick({ started: { min: at(9, 5), max: at(9, 40) } })).toEqual([A, B]);
    expect(pick({ started: { min: at(9, 5) + 1, max: null } })).toEqual([B, C, E]);
    expect(pick({ started: { min: null, max: at(8) } })).toEqual([D]);
  });
  it('drops rows with no value once a range has a bound', () => {
    expect(pick({ score: { min: 1000, max: null } })).toEqual([A, D]);
    expect(pick({ score: { min: null, max: 499 } })).toEqual([C, E]);
    expect(pick({ score: { min: 1200, max: 1200 } })).toEqual([A]);
    expect(pick({ secs: { min: 30, max: null } })).toEqual([A, E]);
    const F = { ...A, finishedAt: new Date(at(9, 6)).toISOString() };
    expect(filterRuns([F, B], { ...NO_FILTER, finished: { min: at(9), max: null } })).toEqual([F]);
  });
  it('shows only hidden or only visible players', () => {
    expect(pick({ hidden: 'shown' })).toEqual([A, B, D, E]);
    expect(pick({ hidden: 'hidden' })).toEqual([C]);
    expect(pick({ hidden: 'shown', status: 'finished' })).toEqual([A, E]);
  });
});

describe('summarize', () => {
  it('reports nothing, not NaN, for no runs', () => {
    expect(summarize([])).toEqual({
      players: 0, started: 0, finished: 0, unfinished: 0, finishRate: null,
      best: null, meanScore: null, medianScore: null, meanSecs: null, perHour: [], scoreBuckets: [],
    });
  });
  it('counts runs and scores finished runs only', () => {
    expect(summarize(ALL)).toEqual({
      players: 4, started: 5, finished: 4, unfinished: 1, finishRate: 0.8,
      best: 2600,
      meanScore: (450 + 499 + 1200 + 2600) / 4,
      medianScore: (499 + 1200) / 2,
      meanSecs: (40 + 20 + 30) / 3, // D finished without a recorded play time
      perHour: [
        { hour: at(8), started: 1, finished: 1 },
        { hour: at(9), started: 2, finished: 1 },
        { hour: at(10), started: 2, finished: 2 },
      ],
      scoreBuckets: [
        { from: 0, count: 2 }, { from: 500, count: 0 }, { from: 1000, count: 1 },
        { from: 1500, count: 0 }, { from: 2000, count: 0 }, { from: 2500, count: 1 },
      ],
    });
  });
  it('gives no score stats when nothing finished', () => {
    const s = summarize([B]);
    expect(s).toMatchObject({ players: 1, started: 1, finished: 0, unfinished: 1, finishRate: 0, best: null, meanScore: null, medianScore: null, meanSecs: null, scoreBuckets: [] });
    expect(s.perHour).toEqual([{ hour: at(9), started: 1, finished: 0 }]);
  });
  it('takes the middle score of an odd count and starts buckets at the lowest score', () => {
    const s = summarize([500, 1000, 999].map(score => run({ start: at(9), score })));
    expect(s.medianScore).toBe(999);
    expect(s.scoreBuckets).toEqual([{ from: 500, count: 2 }, { from: 1000, count: 1 }]);
  });
});

describe('runStatus', () => {
  it('marks legacy runs before finished or not', () => {
    expect([A, B, D, run({ start: at(9), legacy: true })].map(runStatus)).toEqual(['finished', 'unfinished', 'legacy', 'legacy']);
  });
});

describe('playerHeat', () => {
  it('is empty for no runs', () => {
    expect(playerHeat([])).toEqual({ hours: [], days: [], max: 0 });
  });
  it('counts each player once per day and hour, gaps included', () => {
    const A2 = run({ start: at(9, 50), runNo: 2 }); // EMP1 again in the 9:00 hour
    const next = run({ start: new Date(2026, 11, 2, 10).getTime(), id: 'EMP7' });
    expect(playerHeat([...ALL, A2, next])).toEqual({
      hours: [8, 9, 10],
      days: [
        { day: new Date(2026, 11, 1).getTime(), players: [1, 1, 2] },
        { day: new Date(2026, 11, 2).getTime(), players: [0, 0, 1] },
      ],
      max: 2,
    });
  });
});
