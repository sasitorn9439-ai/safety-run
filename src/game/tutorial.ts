import { HZ, PPE, type HazardKind, type PpeType } from '../../shared/hazards.js';
import { SLIDE_SECONDS, type Action, type Beep, type Emit, type GameObject, type Obstacle } from '../../shared/sim.js';
import type { SceneState } from '../render/types.js';

/**
 * move  – a hazard waits for the player until they make the move
 * ppe   – a line of coins with the five PPE items, collected by running through it
 * shield – the shield from the full set takes one hit, then the real run starts
 */
export type StepKind = 'move' | 'ppe' | 'shield';
export interface TutorialStep { kind: StepKind; g?: Action; k?: HazardKind; th: string; en: string }
export const STEPS: readonly TutorialStep[] = [
  { kind: 'move', g: 'left', k: 'forklift', th: 'รถโฟล์คลิฟท์มา! ปัดซ้ายหลบ', en: 'Forklift ahead: swipe LEFT' },
  { kind: 'move', g: 'right', k: 'pallet', th: 'กองวัสดุขวางทาง! ปัดขวาหลบ', en: 'Blocked walkway: swipe RIGHT' },
  { kind: 'move', g: 'up', k: 'spill', th: 'พื้นเปียก! ปัดขึ้นกระโดดข้าม', en: 'Wet floor: swipe UP to jump' },
  { kind: 'move', g: 'down', k: 'pipe', th: 'นั่งร้านเตี้ย! ปัดลงสไลด์ลอด', en: 'Low scaffold: swipe DOWN to slide under' },
  { kind: 'ppe', th: 'เก็บ PPE ให้ครบ 5 ชิ้น', en: 'Run through all 5 PPE (and the coins) to get a shield' },
  { kind: 'shield', th: 'มีเกราะแล้ว! ชนได้ 1 ครั้ง', en: 'The shield takes one hit: let it happen' },
];

const FREEZE = 4.5;
const SPEED = 10;
const SHIELD_FULL = 8;
interface PracticeObstacle extends Obstacle { ok?: boolean }

/**
 * First-play practice: hazards that wait until you make the right move, then the PPE set and the shield that saves you.
 * Only the move the current step asks for is accepted. Runs on real frame time (not the fixed step), so it is not part of the scored, replayed run.
 */
export class Tutorial implements SceneState {
  dist = 0; lane = 0; px = 0; py = 0; vy = 0; slide = 0; inv = 0; shield = 0;
  objs: GameObject[] = [];
  step = 0;
  okT = 0;
  /** what the HUD shows */
  got = new Set<PpeType>();
  coins = 0;
  toast = ''; toastT = 0; flash = 0;
  private endT = 0;
  private obj: PracticeObstacle | null = null;
  private spawned = false;

  constructor(private beep: Beep, private emit: Emit = () => {}) {}

  get done() { return this.step >= STEPS.length; }
  get current() { return STEPS[Math.min(this.step, STEPS.length - 1)]!; }
  /** the practice hazard is waiting for the player */
  get frozen() { return !!this.obj && !this.obj.ok && this.obj.z <= FREEZE; }

  /** Returns true once the practice is over and the real run should start. */
  update(dt: number): boolean {
    // while a practice hazard waits for the player the whole world stands still (floor, pillars, lights), not just the hazard
    const dz = this.frozen ? 0 : SPEED * dt;
    this.dist += dz;
    this.px += (this.lane - this.px) * Math.min(1, dt * 14);
    if (this.py > 0 || this.vy > 0) { this.vy -= 24 * dt; this.py += this.vy * dt; if (this.py <= 0) { this.py = 0; this.vy = 0; } }
    this.slide = Math.max(0, this.slide - dt);
    this.okT = Math.max(0, this.okT - dt);
    this.toastT = Math.max(0, this.toastT - dt); this.flash = Math.max(0, this.flash - dt);
    this.objs = this.objs.filter(o => o.z > -3 && !o.gone);
    if (this.done) return (this.endT -= dt) <= 0;

    const kind = this.current.kind;
    if (kind === 'move') this.moveStep(dz);
    else if (kind === 'ppe') this.ppeStep(dz);
    else this.shieldStep(dz);
    return false;
  }

  private next() {
    this.step++; this.okT = .8; this.spawned = false; this.obj = null; this.objs = [];
    if (this.done) this.endT = 1.8;
  }

  private moveStep(dz: number) {
    if (!this.obj) {
      const st = this.current, g = st.g;
      if (g === 'left' && this.lane === -1) this.lane = 0;
      if (g === 'right' && this.lane === 1) this.lane = 0;
      this.obj = { k: st.k!, l: this.lane, z: 24 };
      this.objs = [this.obj];
    }
    const o = this.obj;
    if (!o.ok && o.z <= FREEZE && this.lane !== o.l && HZ[o.k].t === 'block') o.ok = true;
    if (o.ok || o.z > FREEZE) o.z = Math.max(o.ok ? -9 : FREEZE, o.z - dz);
    if (o.z < -2) this.next();
  }

  /** a line down the player's lane: pairs of coins with one PPE item after each, so the set is collected one piece at a time */
  private ppeStep(dz: number) {
    if (!this.spawned) {
      this.spawned = true;
      let z = 14;
      for (const t of PPE) {
        this.objs.push({ k: 'coin', l: this.lane, z }, { k: 'coin', l: this.lane, z: z + 2.2 }, { k: 'ppe', p: t, l: this.lane, z: z + 4.4 });
        z += 6.6;
      }
    }
    for (const o of this.objs) o.z -= dz;
    this.collect();
    if (this.got.size === PPE.length) {
      this.shield = SHIELD_FULL;                 // stays until it is used: the tutorial has no timer
      this.toast = 'FULL PPE! โล่กันชน 1 ครั้ง'; this.toastT = 2;
      this.beep(1320, .2, 'triangle');
      this.next();
    }
  }

  private collect() {
    for (const o of this.objs) {
      if (o.gone || (o.k !== 'coin' && o.k !== 'ppe') || Math.abs(o.z) > .7 || Math.abs(o.l - this.px) > .5) continue;
      o.gone = true;
      if (o.k === 'coin') { this.coins++; this.beep(1180, .04, 'triangle', .05); this.emit({ type: 'coin' }); }
      else { this.got.add(o.p); this.beep(880, .07, 'triangle'); this.emit({ type: 'pickup' }); }
    }
  }

  /** a forklift drives into the player: the shield takes the hit and is gone, and the real run starts */
  private shieldStep(dz: number) {
    if (!this.spawned) { this.spawned = true; this.objs = [{ k: 'forklift', l: this.lane, z: 24 }]; }
    for (const o of this.objs) o.z -= dz;
    const o = this.objs[0] as Obstacle | undefined;
    if (!o || Math.abs(o.z) > .7) return;
    this.shield = 0; this.got.clear(); this.flash = .3;
    this.toast = 'PPE ช่วยไว้! · Saved by PPE'; this.toastT = 1.6;
    this.beep(300, .2, 'triangle'); this.emit({ type: 'saved' });
    o.gone = true;
    this.next();
  }

  /** Only the move the current step asks for is accepted (and only while its hazard hasn't been dealt with); everything else is ignored. */
  input(action: Action) {
    if (this.done || this.current.g !== action || this.obj?.ok) return;
    if (action === 'up') {
      if (this.py === 0) { this.vy = 9.2; this.slide = 0; this.beep(520, .06); }
    } else if (action === 'down') {
      if (this.py > 0) this.vy = -16;
      this.slide = SLIDE_SECONDS; this.beep(220, .06);
    } else {
      const n = Math.max(-1, Math.min(1, this.lane + (action === 'left' ? -1 : 1)));
      if (n !== this.lane) { this.lane = n; this.beep(380, .04); }
    }
    this.hit(action);
  }

  // accept the move only once the practice obstacle is close, so the jump/slide actually clears it
  private hit(g: Action) {
    const o = this.obj;
    if (!o || o.ok || o.z > FREEZE + 1.5 || this.current.g !== g || HZ[o.k].t === 'block') return;
    o.ok = true;
    this.beep(990, .08, 'triangle');
  }
}
