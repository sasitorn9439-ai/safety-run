import { HZ, type HazardKind } from '../../shared/hazards.js';
import { STEP, createRun, type Action, type InputEntry, type Run, type SimEvent } from '../../shared/sim.js';
import type { Sfx } from '../lib/audio.js';
import type { Frame, GameRenderer, PrevState, SceneState } from '../render/types.js';
import type { Hud } from '../ui/hud.js';
import { Tutorial } from './tutorial.js';

export type GameState = 'menu' | 'tutor' | 'play' | 'pause' | 'resume' | 'over';

export interface Session { id: string; token: string; run: number; runNo: number; avatar: number; seed: number }
export interface Pending extends Session { score: number; ticks?: number; inputs?: readonly InputEntry[] }

const IDLE: SceneState = { dist: 0, lane: 0, px: 0, py: 0, vy: 0, slide: 0, inv: 0, shield: 0, objs: [] };
const MAX_STEPS_PER_FRAME = 6;

export interface GameHooks {
  /** the run ended: `kind` is the hazard that hit, or null if the time limit was reached */
  onCrash(kind: HazardKind | null): void;
  onState(state: GameState, previous: GameState): void;
}

/**
 * Owns the run, the fixed-timestep loop and the hand-off to the renderer.
 * The sim advances in exact 1/60 s steps (so a replay on the server reproduces it); rendering runs at the display's
 * own rate and blends the last two steps, which is what keeps motion smooth on 60, 90 and 120 Hz screens alike.
 */
export class Game {
  state: GameState = 'menu';
  sess: Session | null = null;
  run: Run | null = null;
  inputs: InputEntry[] = [];
  lastHit: HazardKind | null = null;
  runLabel = '';

  private tutorial: Tutorial | null = null;
  /** best distance (m) on this device, set by the app; 0 = none yet */
  pb = 0;
  private acc = 0;
  private alpha = 1;
  private prev: PrevState = { dist: 0, px: 0, py: 0, slide: 0 };
  private cd = 0;
  private lastT = 0;
  private dirty = true;

  constructor(private sfx: Sfx, private renderer: GameRenderer, private hud: Hud, private hooks: GameHooks) {}

  get score() { return this.run?.score() ?? 0; }
  get dist() { return Math.floor(this.run?.view().dist ?? 0); }
  get revives() { return this.run?.view().revives ?? 0; }

  invalidate() { this.dirty = true; }

  private setState(s: GameState) {
    const previous = this.state;
    this.state = s;
    this.dirty = true;
    this.hud.show(s === 'play' || s === 'pause' || s === 'resume' || s === 'tutor');
    this.hooks.onState(s, previous);
  }

  private clear() {
    this.run = null; this.tutorial = null; this.acc = 0; this.alpha = 1;
    this.hud.reset();
  }

  /** first = true → practice round before the scored run */
  begin(first: boolean) {
    this.clear();
    if (first) { this.tutorial = new Tutorial(this.sfx.beep, e => this.onSimEvent(e, this.tutorial?.px ?? 0));
      if (this.sess) this.hud.setAvatar(this.sess.avatar);
      this.setState('tutor'); }
    else this.startReal();
  }

  startReal() {
    if (!this.sess) return;
    this.tutorial = null;
    this.hud.tutor(null);
    // dev only: `?start=3000` starts part-way down the corridor to look at a later area (the server replays from 0, so such a score is rejected)
    const startDist = import.meta.env.DEV ? Number(new URLSearchParams(location.search).get('start')) || 0 : 0;
    this.run = createRun(this.sess.seed, this.sfx.beep, e => this.onSimEvent(e), { startDist });
    this.inputs = [];
    this.acc = 0; this.alpha = 1;
    this.snapshot();
    this.hud.setAvatar(this.sess.avatar);
    this.setState('play');
  }

  toMenu() { this.clear(); this.setState('menu'); }

  pause() {
    if (this.state !== 'play' && this.state !== 'resume') return false;
    this.hud.count(0);
    this.setState('pause');
    return true;
  }

  resume() {
    if (this.state !== 'pause') return false;
    this.cd = 3;
    this.setState('resume');
    return true;
  }

  /** Quiz answered correctly → keep running. */
  answer(index: number) {
    if (!this.run?.answer(index)) return false;
    this.inputs.push([this.run.tick, index]);
    this.snapshot(); this.alpha = 1; this.acc = 0;
    this.setState('play');
    return true;
  }

  input(action: Action) {
    if (this.state === 'play' && this.run) {
      if (this.run.input(action)) this.inputs.push([this.run.tick, action]);
    } else if (this.state === 'tutor') this.tutorial?.input(action);
  }

  private onSimEvent(e: SimEvent, px = this.run?.view().px ?? 0) {
    this.renderer.onEvent(e, px);
  }

  private snapshot() {
    const v = this.run!.view();
    this.prev = { dist: v.dist, px: v.px, py: v.py, slide: v.slide };
  }

  /** Called every animation frame. */
  tick(now: number) {
    const dt = Math.min(.1, (now - this.lastT) / 1000 || 0);
    this.lastT = now;
    let animating = false;

    if (this.state === 'play' && this.run) {
      this.stepPlay(dt);
      animating = this.state === 'play';
    } else if (this.state === 'tutor' && this.tutorial) {
      if (this.tutorial.update(dt)) this.startReal();
      animating = true;
    } else if (this.state === 'resume') {
      this.cd -= dt;
      if (this.cd <= 0) { this.acc = 0; this.hud.count(0); this.setState('play'); }
      else this.hud.count(Math.ceil(this.cd));
    }

    if (animating || this.dirty) { this.dirty = false; this.draw(now); }
  }

  private stepPlay(dt: number) {
    const run = this.run!;
    this.acc += dt;
    let steps = 0;
    while (this.acc >= STEP && !run.finished) {
      if (steps === MAX_STEPS_PER_FRAME) { this.acc = 0; break; } // can't keep up: drop time rather than spiral
      this.snapshot();
      run.step();
      this.acc -= STEP;
      steps++;
    }
    if (run.finished) {
      this.alpha = 1;
      this.lastHit = run.view().hitKind;
      this.finishRun();
    } else this.alpha = this.acc / STEP;
  }

  private finishRun() {
    this.sfx.beep(110, .35, 'sawtooth', .08);
    navigator.vibrate?.(120);
    this.setState('over');
    this.draw(performance.now());
    this.hooks.onCrash(this.lastHit);
  }

  private draw(now: number) {
    let frame: Frame;
    if (this.state === 'tutor' && this.tutorial) {
      const t = this.tutorial;
      frame = { s: t, prev: { dist: t.dist, px: t.px, py: t.py, slide: t.slide }, alpha: 1, playing: true, flash: t.flash, still: t.frozen };
      this.hud.update({ score: 0, coins: t.coins, dbl: 0, got: t.got, shield: t.shield, toast: t.toast, toastT: t.toastT, sur: null });
      this.hud.tutor(t);
    } else if (this.run) {
      const v = this.run.view();
      frame = { s: v, prev: this.prev, alpha: this.alpha, playing: this.state === 'play', flash: v.flash };
      if (this.state === 'play' || this.state === 'pause' || this.state === 'resume') {
        // "ROUND n · GO!" for the first two seconds
        let toast = v.toast, toastT = v.toastT;
        const t0 = this.run.tick * STEP;
        if (!toastT && t0 < 2) { toast = this.runLabel; toastT = 2 - t0; }
        this.hud.update({
          score: this.run.score(), coins: v.coins, dbl: v.dbl, got: v.got, shield: v.shield, toast, toastT, sur: v.sur,
          zone: { index: v.zone, n: v.zoneN }, combo: v.combo, mult: v.mult, slow: v.slow, magnet: v.magnet, lift: v.lift, hearts: v.hearts, dist: v.dist, pb: this.pb,
        });
      }
    } else frame = { s: IDLE, prev: IDLE, alpha: 1, playing: false, flash: 0 };
    this.renderer.render(frame, now);
  }

  hazardInfo() {
    return HZ[this.lastHit as HazardKind] ?? { th: 'ครบรอบ', en: 'Time limit reached', tip: 'ส่งคะแนนของรอบนี้', tipEn: 'Submit your score for this run' };
  }
}
