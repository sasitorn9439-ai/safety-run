import { describe, expect, it } from 'vitest';
import { AUDIT_PASS_SCORE, GATES, GATE_SCORE, GATE_SCORE_MIN, STEP, gateScore, createRun, replayScore, replayTour, type Action, type InputEntry, type Run, type TourOptions } from '../shared/sim.js';
import { think } from './bot.js';

const TOUR: TourOptions = { stage: 'tour', durationTicks: 60 / STEP };

/** a tournament player: dodges like the test bot, and steers for the right gate (or the wrong one) when a question is up */
function race(seed: number, opts: { tour?: TourOptions; answer?: 'right' | 'wrong' | 'none'; audits?: number[] } = {}) {
  const tour = opts.tour ?? TOUR, answer = opts.answer ?? 'right';
  const run = createRun(seed, undefined, undefined, { tour });
  const inputs: InputEntry[] = [];
  const press = (a: Action) => { if (run.input(a)) inputs.push([run.tick, a]); };
  const audits = [...(opts.audits ?? [])], prompts: string[] = [];
  while (!run.finished) {
    if (audits.length && run.tick >= audits[0]! && run.input('audit')) { inputs.push([run.tick, 'audit']); audits.shift(); }
    const gate = run.view().tour!.gate;
    if (gate && prompts.at(-1) !== gate.prompt) prompts.push(gate.prompt);
    if (gate && answer !== 'none') {
      const want = (answer === 'right' ? gate.correct : (gate.correct + 1) % 3) - 1;
      if (run.view().lane !== want) press(run.view().lane < want ? 'right' : 'left');
    } else {
      const a = think(run);
      if (a) inputs.push([run.tick, a]);
    }
    run.step();
  }
  return { run, inputs, prompts };
}

const stats = (run: Run) => run.view().tour!;

describe('tournament run', () => {
  it('lasts exactly the chosen time, crashes or not', () => {
    const run = createRun(7, undefined, undefined, { tour: TOUR });
    while (!run.finished) run.step();
    expect(run.tick).toBe(TOUR.durationTicks);
    expect(stats(run).crashes).toBeGreaterThan(0);
    expect(run.view().hitKind).toBeNull();
  });

  it('deals every player on a seed the same track and the same questions', () => {
    const a = race(42, { answer: 'right' }), b = race(42, { answer: 'none' });
    expect(a.prompts.length).toBeGreaterThanOrEqual(2);
    expect(a.prompts.slice(0, 2)).toEqual(b.prompts.slice(0, 2));
  });

  it('pays a Safety Sprint for the right gate and slows you for the wrong one', () => {
    const right = race(11, { answer: 'right' }), wrong = race(11, { answer: 'wrong' });
    expect(stats(right.run).correct).toBeGreaterThanOrEqual(2);
    expect(stats(right.run).wrong).toBe(0);
    expect(stats(wrong.run).correct).toBe(0);
    expect(stats(wrong.run).wrong).toBeGreaterThanOrEqual(2);
    expect(right.run.view().dist).toBeGreaterThan(wrong.run.view().dist + 100);
  });

  it('pays points for every right answer, more than the pickups can make up', () => {
    for (const seed of [3, 11, 42]) {
      const right = race(seed, { answer: 'right' }), wrong = race(seed, { answer: 'wrong' });
      const { correct } = stats(right.run);
      expect(right.run.view().earned.extra).toBeGreaterThanOrEqual(correct * (GATE_SCORE - 50));
      expect(right.run.score() - wrong.run.score()).toBeGreaterThan(correct * (GATE_SCORE - 50));
      expect(right.run.view().mult).toBe(1);
    }
  });

  it('pays gateScore for a question card and AUDIT_PASS_SCORE for a Spot Audit, the moment the right gate is run through', () => {
    const run = createRun(99, undefined, undefined, { tour: TOUR });
    const paid: [boolean, number, number][] = [];
    let audited = false;
    while (!run.finished) {
      if (!audited && run.tick >= 300 && run.input('audit')) audited = true;
      const v = run.view(), gate = v.tour!.gate;
      if (gate) { const want = gate.correct - 1; if (v.lane !== want) run.input(v.lane < want ? 'right' : 'left'); }
      else think(run);
      const before = run.view().tour!.correct, extra = run.view().earned.extra;
      run.step();
      if (run.view().tour!.correct > before) paid.push([gate!.audit, run.view().earned.extra - extra, gate!.picked]);
    }
    expect(paid.some(([audit]) => audit)).toBe(true);
    expect(paid.some(([audit]) => !audit)).toBe(true);
    for (const [audit, pts, picked] of paid) expect(pts).toBe(audit ? AUDIT_PASS_SCORE : gateScore(picked));
  });

  it('a question card pays less the later the answer is picked', () => {
    expect(gateScore(1)).toBe(GATE_SCORE);
    expect(gateScore(0)).toBe(GATE_SCORE_MIN);
    expect(gateScore(0.5)).toBe(300);
    /** steers for the right gate only once `wait` of the gates' time has gone by */
    const answerAfter = (wait: number) => {
      const run = createRun(11, undefined, undefined, { tour: TOUR });
      const paid: number[] = [];
      while (!run.finished) {
        const v = run.view(), gate = v.tour!.gate;
        if (gate) {
          const want = gate.correct - 1;
          if (v.lane !== want && gate.z / gate.z0 <= 1 - wait) run.input(v.lane < want ? 'right' : 'left');
        } else think(run);
        const before = run.view().tour!.correct, extra = run.view().earned.extra;
        run.step();
        if (run.view().tour!.correct > before) paid.push(run.view().earned.extra - extra);
      }
      return paid;
    };
    const fast = answerAfter(0), slow = answerAfter(0.7);
    expect(fast.length).toBeGreaterThanOrEqual(2);
    expect(slow.length).toBeGreaterThanOrEqual(2);
    for (const pts of fast) expect(pts).toBeGreaterThanOrEqual(GATE_SCORE - 20);
    for (const pts of slow) expect(pts).toBeLessThanOrEqual(gateScore(0.3) + 10);
  });

  it('puts the three gates across the lanes and clears the way to them', () => {
    const run = createRun(5, undefined, undefined, { tour: TOUR });
    while (!run.view().tour!.gate && !run.finished) { think(run); run.step(); }
    const v = run.view(), g = v.tour!.gate!;
    const gates = v.objs.filter(o => o.k === 'power' && GATES.includes(o.t as never));
    expect(gates.map(o => o.l).sort()).toEqual([-1, 0, 1]);
    expect(g.options).toHaveLength(3);
    const hazards = v.objs.filter(o => o.k !== 'coin' && o.k !== 'ppe' && o.k !== 'power' && o.k !== 'bonus' && !o.gone && o.z > 6 && o.z < g.z + 8);
    expect(hazards).toEqual([]);
  });

  it('replays to the same score on the server', () => {
    const { run, inputs } = race(99, { audits: [1200] });
    const r = replayTour(99, TOUR, inputs);
    expect(r).toEqual({ score: run.score(), correct: stats(run).correct });
  });

  it('rejects a replay that is cut short or uses different settings', () => {
    const { inputs } = race(3);
    const other = replayTour(3, { stage: 'chemical', durationTicks: TOUR.durationTicks }, inputs);
    const good = replayTour(3, TOUR, inputs)!;
    expect(other?.score).not.toBe(good.score);
    expect(replayTour(3, TOUR, [[TOUR.durationTicks + 5, 'left']])).toBeNull();
  });

  it('a Spot Audit starts a question, but only in a tournament', () => {
    const run = createRun(8, undefined, undefined, { tour: TOUR });
    for (let i = 0; i < 30; i++) run.step();
    expect(run.input('audit')).toBe(true);
    expect(run.view().tour!.gate?.audit).toBe(true);
    expect(run.input('audit')).toBe(false);          // one at a time
    const normal = createRun(8);
    expect(normal.input('audit')).toBe(false);
    expect(replayScore(8, 100, [[10, 'audit']])).toBeNull();
  });

  it('keeps a fixed stage for the whole race', () => {
    const run = createRun(4, undefined, undefined, { tour: { stage: 'electrical', durationTicks: TOUR.durationTicks } });
    const zones = new Set<number>();
    while (!run.finished) { think(run); run.step(); zones.add(run.view().zone); }
    expect(zones.size).toBe(1);
  });
});
