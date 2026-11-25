/** A simple dodging player for tests: it reads the hazards ahead and reacts, and answers the quiz once after a crash. */
import { HZ, createRun, isItem, speedAt, type Action, type GameObject, type InputEntry, type Obstacle, type Run, type SimEvent } from '../shared/sim.js';

export const isHazard = (o: GameObject): o is Obstacle => !isItem(o);

/** one tick of the bot's decision; returns the action it pressed, if the run accepted one */
export function think(run: Run): Action | null {
  const v = run.view(), speed = speedAt(v.dist);
  const ahead = (lane: number, from: number, to: number) => v.objs.filter(o => isHazard(o) && !o.gone && Math.round(o.l) === lane && o.z > from && o.z < to);
  const press = (a: Action) => (run.input(a) ? a : null);
  for (const o of ahead(v.lane, 0, 0.6 * speed) as Obstacle[]) {
    const t = HZ[o.k].t;
    if (t === 'block' && o.z < speed * 0.5) {
      const free = [v.lane - 1, v.lane + 1].filter(l => l >= -1 && l <= 1 && !ahead(l, -1, 0.7 * speed).length);
      if (free.length) return press(free[0]! < v.lane ? 'left' : 'right');
    } else if (t === 'low' && o.z < speed * 0.22 && v.py === 0) return press('up');
    else if (t === 'high' && o.z < speed * 0.2 && v.slide <= 0) return press('down');
  }
  return null;
}

export function play(seed: number, opts: { startDist?: number; maxTicks?: number; onTick?: (run: Run) => void } = {}) {
  const events: SimEvent[] = [], inputs: InputEntry[] = [];
  const run = createRun(seed, () => {}, e => events.push(e), { startDist: opts.startDist });
  let revived = false;
  const max = opts.maxTicks ?? 3000;
  while (run.tick < max) {
    if (run.finished) {
      if (revived || !run.answer(run.correct)) break;
      inputs.push([run.tick, run.correct]); revived = true;
      continue;
    }
    const pendingBonus = run.view().pendingBonus;
    if (pendingBonus) {
      run.answer(pendingBonus.correct);
      inputs.push([run.tick, pendingBonus.correct]);
      continue;
    }
    const a = think(run);
    if (a) inputs.push([run.tick, a]);
    opts.onTick?.(run);
    run.step();
  }
  return { run, events, inputs, seed };
}
