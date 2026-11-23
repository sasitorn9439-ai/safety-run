/**
 * Regenerates tests/golden.json: bot-played runs recorded against the current sim.
 *   GOLDEN=1 npx vitest run tests/make-golden.test.ts
 * Only do this when the sim was changed on purpose (see the README): it re-baselines what sim.test.ts compares against.
 */
import { writeFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { HZ, createRun, speedAt, type Action, type InputEntry } from '../shared/sim.js';

const SEEDS = [42, 1234, 31337, 2026, 7, 99];

function play(seed: number) {
  const run = createRun(seed), inputs: InputEntry[] = [];
  const act = (a: Action) => { if (run.input(a)) inputs.push([run.tick, a]); };
  let revived = false;
  while (!run.finished || (!revived && run.view().hitKind && run.tick < 3000)) {
    if (run.finished) {
      // crashed: answer the quiz once, like a player who takes the chance
      if (!run.answer(run.correct)) break;
      inputs.push([run.tick, run.correct]); revived = true;
      continue;
    }
    const v = run.view(), speed = speedAt(v.dist);
    const ahead = (lane: number, from: number, to: number) => v.objs.filter(o => o.k !== 'coin' && o.k !== 'ppe' && !o.gone && Math.round(o.l) === lane && o.z > from && o.z < to);
    const here = ahead(v.lane, 0, 0.6 * speed);
    for (const o of here) {
      const t = HZ[(o as { k: keyof typeof HZ }).k].t;
      if (t === 'block' && o.z < speed * 0.5) {
        const free = [v.lane - 1, v.lane + 1].filter(l => l >= -1 && l <= 1 && !ahead(l, -1, 0.7 * speed).length);
        if (free.length) act(free[0]! < v.lane ? 'left' : 'right');
      } else if (t === 'low' && o.z < speed * 0.22 && v.py === 0) act('up');
      else if (t === 'high' && o.z < speed * 0.2 && v.slide <= 0) act('down');
    }
    run.step();
  }
  return { seed, ticks: run.tick, inputs, score: run.score() };
}

describe.skipIf(!process.env.GOLDEN)('make golden', () => {
  it('writes tests/golden.json', () => {
    const out = SEEDS.map(play);
    for (const g of out) console.log(g.seed, g.ticks, g.score, g.inputs.length);
    writeFileSync(new URL('./golden.json', import.meta.url), JSON.stringify(out));
  });
});
