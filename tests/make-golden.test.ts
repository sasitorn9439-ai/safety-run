/**
 * Regenerates tests/golden.json: bot-played runs recorded against the current sim.
 *   GOLDEN=1 npx vitest run tests/make-golden.test.ts
 * Only do this when the sim was changed on purpose (see the README): it re-baselines what sim.test.ts compares against.
 */
import { writeFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { play } from './bot.js';

const SEEDS = [42, 1234, 31337, 2026, 7, 99];

function record(seed: number) {
  const { run, inputs } = play(seed, { maxTicks: 30 * 60 * 60 });
  return { seed, ticks: run.tick, inputs, score: run.score() };
}

describe.skipIf(!process.env.GOLDEN)('make golden', () => {
  it('writes tests/golden.json', () => {
    const out = SEEDS.map(record);
    for (const g of out) console.log(g.seed, g.ticks, g.score, g.inputs.length);
    writeFileSync(new URL('./golden.json', import.meta.url), JSON.stringify(out));
  });
});
