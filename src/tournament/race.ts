import { STEP, createRun, type Action, type Beep, type Emit, type InputEntry, type Run, type StageId } from '../../shared/sim.js';
import type { Frame, Ghost, PrevState } from '../render/types.js';

export interface RaceSpec { seed: number; stage: StageId; duration: number; startAt: number }

/**
 * One player's race, stepped to wherever the clock says it should be. The phone feeds it presses as they happen; the host
 * feeds it the presses that arrive over the channel and never steps past the last tick the phone has reported, so both
 * run exactly the same race.
 */
export class Race {
  readonly run: Run;
  readonly inputs: InputEntry[] = [];
  private applied = 0;
  private prev: PrevState = { dist: 0, px: 0, py: 0, slide: 0 };
  private alpha = 1;
  /** host only: the phone has run this far */
  reported = 0;
  /** host only: where the phone said it was at `reported`, fresher than this replay, which runs behind it */
  live = { tick: 0, dist: 0, lane: 0, jumps: 0, slides: 0 };
  /** jumps and slides so far: other phones play each new one on this runner's ghost */
  jumps = 0;
  slides = 0;
  private air = false;
  private lastSlide = 0;

  constructor(readonly spec: RaceSpec, beep?: Beep, emit?: Emit) {
    this.run = createRun(spec.seed, beep, emit, { tour: { stage: spec.stage, durationTicks: Math.round(spec.duration / STEP) } });
  }

  /** ticks (fractional) the race has been running at server time `now` */
  elapsed(now: number) { return (now - this.spec.startAt) / 1000 / STEP; }

  /** a press on this phone: applied now, and recorded for the replay */
  press(action: Action) {
    if (this.run.finished || this.run.tick < 0) return false;
    if (!this.run.input(action)) return false;
    this.inputs.push([this.run.tick, action]);
    this.applied = this.inputs.length;
    return true;
  }

  /** host: presses from the phone, `from` = index of the first one in `entries` */
  receive(from: number, entries: readonly InputEntry[], tick: number) {
    if (from <= this.inputs.length) this.inputs.push(...entries.slice(this.inputs.length - from));
    if (this.inputs.length >= from + entries.length) this.reported = Math.max(this.reported, tick);
  }

  /** steps up to `target` ticks (at most `max`), applying recorded presses at their ticks */
  advance(target: number, max = 600) {
    const run = this.run;
    const goal = Math.min(Math.floor(target), Math.round(this.spec.duration / STEP));
    let n = 0;
    while (run.tick < goal && n++ < max && !run.finished) {
      this.applyDue();
      const v = run.view();
      this.prev = { dist: v.dist, px: v.px, py: v.py, slide: v.slide };
      run.step();
      this.count();
    }
    this.applyDue();
    this.alpha = run.tick >= goal && goal === Math.floor(target) ? Math.min(1, target - Math.floor(target)) : 1;
  }

  private count() {
    const v = this.run.view(), air = (v.py > 0 || v.vy > 0) && v.lift <= 0;
    if (air && !this.air) this.jumps++;
    if (v.slide > this.lastSlide) this.slides++;
    this.air = air; this.lastSlide = v.slide;
  }

  private applyDue() {
    while (this.applied < this.inputs.length && this.inputs[this.applied]![0] <= this.run.tick) {
      const [at, action] = this.inputs[this.applied++]!;
      if (at === this.run.tick) this.run.input(action as Action);
    }
  }

  /** host: this runner as a ghost on someone else's screen, blended like the frame */
  ghost(): Ghost {
    const v = this.run.view(), p = this.prev, a = this.alpha;
    const mix = (from: number, to: number) => from + (to - from) * a;
    return { dist: mix(p.dist, v.dist), px: mix(p.px, v.px), py: mix(p.py, v.py), vy: v.vy, slide: mix(p.slide, v.slide) };
  }

  frame(): Frame {
    const v = this.run.view();
    return { s: v, prev: this.prev, alpha: this.alpha, playing: !this.run.finished, flash: v.flash };
  }
}
