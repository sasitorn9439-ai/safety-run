import { describe, expect, it } from 'vitest';
import { GATES, STEP, createRun, isItem, replayScore, replayTour, type Action, type InputEntry, type Run, type TourOptions } from '../shared/sim.js';
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

  it('puts the three gates across the lanes and clears the way to them', () => {
    const run = createRun(5, undefined, undefined, { tour: TOUR });
    while (!run.view().tour!.gate && !run.finished) { think(run); run.step(); }
    const v = run.view(), g = v.tour!.gate!;
    const gates = v.objs.filter(o => o.k === 'power' && GATES.includes(o.t as never));
    expect(gates.map(o => o.l).sort()).toEqual([-1, 0, 1]);
    expect(g.options).toHaveLength(3);
    const hazards = v.objs.filter(o => !isItem(o) && !o.gone && o.z > 6 && o.z < g.z + 8);
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
