/**
 * Deterministic game simulation. Runs in the browser (to play) and on the server (to replay a
 * submitted run and verify its score), so it must stay free of DOM, time and Math.random.
 * Changing the order or number of `random()` calls changes every seed's run: update tests/golden.json
 * deliberately if you ever do.
 */
import { HAZARD_KINDS, HZ, PPE, type HazardKind, type PpeType } from './hazards.js';
import { QB } from './questions.js';

export { HZ, PPE } from './hazards.js';
export type { HazardKind, PpeType } from './hazards.js';

export const STEP = 1 / 60;
export const SLIDE_SECONDS = 0.7;
export const MAX_TICKS = 30 * 60 * 60;
export const MAX_INPUTS = 12000;
export const ZMAX = 72;
/**
 * Running speed (units/s) at a distance: a calm start so players can bank score, easing in slowly (it is still only ~11 at
 * three minutes and ~14 at five) and reaching the top speed about 10 minutes in, where the difficulty and the risk of losing it all are.
 */
export const START_SPEED = 10;
export const MAX_SPEED = 34;
export const FULL_SPEED_AT = 10000;
const RAMP_POWER = 1.6;
export const speedAt = (dist: number) => START_SPEED + (MAX_SPEED - START_SPEED) * Math.pow(Math.min(1, dist / FULL_SPEED_AT), RAMP_POWER);
/** distance between neighbouring coins in a trail */
const COIN_GAP = 1.7;

export type Action = 'left' | 'right' | 'up' | 'down';
/** [tick, action] or [tick, answer index] */
export type InputEntry = readonly [tick: number, action: Action | number];
export type Beep = (freq: number, dur?: number, type?: OscillatorType, vol?: number) => void;
/** Things the renderer may want to react to (particles, shake). Purely cosmetic: never feeds back into the sim. */
export type SimEvent = { type: 'pickup' } | { type: 'coin' } | { type: 'saved' } | { type: 'crash'; kind: HazardKind };
export type Emit = (event: SimEvent) => void;

export interface Obstacle { k: HazardKind; l: number; z: number; gone?: boolean }
export interface Pickup { k: 'ppe'; p: PpeType; l: number; z: number; gone?: boolean }
export interface Coin { k: 'coin'; l: number; z: number; gone?: boolean }
export type GameObject = Obstacle | Pickup | Coin;

/**
 * Scoring, tuned so that a good run of about 20 minutes ends around 20 000 points: the distance run adds 1 point per
 * METRES_PER_POINT metres, a coin and a PPE item add a fixed amount, the Safety Officer's praise adds OFFICER_SCORE.
 */
export const METRES_PER_POINT = 2;
export const COIN_SCORE = 1;
export const PPE_SCORE = 4;
export const OFFICER_SCORE = 60;

export interface Surprise {
  k: 'officer' | 'rain' | 'star' | 'double';
  t: number;
  dur: number;
  msg: string;
  sub?: string;
}

export interface RunView {
  dist: number; lane: number; px: number; py: number; vy: number; slide: number;
  objs: GameObject[]; got: ReadonlySet<PpeType>;
  shield: number; inv: number; revives: number; coins: number; bonus: number;
  toast: string; toastT: number; flash: number;
  sur: Surprise | null; dbl: number; hitKind: HazardKind | null;
}

export interface Quiz { prompt: string; options: string[] }

export interface Run {
  readonly quiz: Quiz;
  /** index into quiz.options of the right answer */
  readonly correct: number;
  readonly tick: number;
  readonly finished: boolean;
  input(action: Action): boolean;
  answer(index: number): boolean;
  step(): void;
  view(): RunView;
  score(): number;
}

function seededRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let bits = Math.imul(value ^ (value >>> 15), value | 1);
    bits ^= bits + Math.imul(bits ^ (bits >>> 7), bits | 61);
    return ((bits ^ (bits >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], random: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return items;
}

const OFFICER = [
  'ใส่ PPE ครบ เยี่ยมมาก! Safety First',
  'เดินในทางเดินเท้านะ ไม่ใช่เลนรถโฟล์คลิฟท์',
  'เจอ Near miss แจ้งได้เลยนะ ไม่ต้องเกรงใจ',
  'วิ่งมาไกลแล้ว อย่าลืมดื่มน้ำนะ',
  'หมวกนิรภัยต้องคาดสายรัดคางด้วยนะ',
  'ทำ KYT ก่อนเริ่มงานทุกครั้งนะ',
  'เก่งมาก! ไม่มีอุบัติเหตุคือเป้าหมายของเรา',
];

export function createRun(seed: number, beep: Beep = () => {}, emit: Emit = () => {}): Run {
  const random = seededRandom(seed);
  const quizRandom = seededRandom(seed ^ 0xc3fcaf22);
  const questions = QB.flat();
  const [prompt, choices] = questions[Math.floor(quizRandom() * questions.length)]!;
  const options = shuffle(choices.map((text, index) => ({ text, index })), quizRandom);
  const quiz: Quiz = { prompt, options: options.map(option => option.text) };
  const correct = options.findIndex(option => option.index === 0);

  let dist = 0, speed = START_SPEED, lane = 0, px = 0, py = 0, vy = 0, slide = 0, next = 14;
  let objs: GameObject[] = [];
  const got = new Set<PpeType>();
  let shield = 0, inv = 1.2, revives = 0, coins = 0, bonus = 0, toast = '', toastT = 0, flash = 0;
  let nextSur = 1500, sur: Surprise | null = null, lastSur = '', dbl = 0, dblAcc = 0, tick = 0;
  let hitKind: HazardKind | null = null;

  function spawn() {
    const lanes = shuffle([-1, 0, 1], random), n = dist > 150 && random() < 0.4 ? 2 : 1;
    for (let i = 0; i < n; i++) objs.push({ k: HAZARD_KINDS[(random() * HAZARD_KINDS.length) | 0]!, l: lanes[i]!, z: ZMAX });
    // a trail of coins down the free lane. Now and then one of them is a PPE item instead: one at a time, one of the kinds still missing
    if (random() < 0.85) {
      const fl = lanes[n]!, c = 6 + ((random() * 4) | 0), at = random() < 0.55 ? 1 + ((random() * (c - 2)) | 0) : -1;
      const need = PPE.filter(t => !got.has(t)), pool = need.length ? need : PPE;
      for (let i = 0; i < c; i++) {
        const z = ZMAX - 3 + i * COIN_GAP;
        if (i === at) objs.push({ k: 'ppe', p: pool[(random() * pool.length) | 0]!, l: fl, z });
        else objs.push({ k: 'coin', l: fl, z });
      }
    }
    // a trail from the previous spawn may still be running into these hazards: clear the pickups right around them
    for (const h of objs) {
      if (h.k === 'coin' || h.k === 'ppe' || h.z < ZMAX - .5) continue;
      objs = objs.filter(o => !((o.k === 'coin' || o.k === 'ppe') && o.l === h.l && Math.abs(o.z - h.z) < 1.6));
    }
  }

  function surprise() {
    const ks = (['officer', 'rain', 'star', 'double'] as const).filter(k => k !== lastSur);
    const k = ks[(random() * ks.length) | 0]!;
    lastSur = k;
    beep(660, 0.1, 'triangle');
    beep(990, 0.15, 'triangle');
    if (k === 'officer') { bonus += OFFICER_SCORE; sur = { k, t: 0, dur: 3.4, msg: OFFICER[(random() * OFFICER.length) | 0]! }; }
    if (k === 'rain') {
      objs = objs.filter(o => o.z < 12);
      next = Math.max(next, 58);
      let n = 0;
      for (let z = 16; z < 62; z += COIN_GAP) for (const l of [-1, 0, 1]) objs.push(n++ % 9 === 4 ? { k: 'ppe', p: PPE[(n / 9 | 0) % 5]!, l, z } : { k: 'coin', l, z });
      sur = { k, t: 0, dur: 2.6, msg: 'Coin Rain! เก็บให้หมด', sub: 'ฝนเหรียญตกทั้ง 3 เลน' };
    }
    if (k === 'star') { shield = 8; sur = { k, t: 0, dur: 2.6, msg: 'Golden Helmet!', sub: 'ได้โล่ PPE ฟรี กันชน 1 ครั้ง' }; }
    if (k === 'double') { dbl = 8; sur = { k, t: 0, dur: 2.6, msg: 'Safety Week x2!', sub: 'คะแนนระยะทาง x2 นาน 8 วินาที' }; }
  }

  function update(dt: number) {
    speed = speedAt(dist);
    const dz = speed * dt;
    dist += dz;
    if (dbl > 0) { dbl -= dt; dblAcc += dz; while (dblAcc >= METRES_PER_POINT) { bonus++; dblAcc -= METRES_PER_POINT; } }
    if (sur && (sur.t += dt) > sur.dur) sur = null;
    for (const o of objs) o.z -= dz;
    if ((next -= dz) <= 0) { spawn(); next = 13 + random() * 9 - Math.min(4, dist / 500); }
    px += (lane - px) * Math.min(1, dt * 14);
    if (py > 0 || vy > 0) { vy -= 24 * dt; py += vy * dt; if (py <= 0) { py = 0; vy = 0; } }
    slide = Math.max(0, slide - dt); inv = Math.max(0, inv - dt); shield = Math.max(0, shield - dt);
    toastT = Math.max(0, toastT - dt); flash = Math.max(0, flash - dt);
    for (const o of objs) {
      if (o.gone || Math.abs(o.z) > 0.7 || Math.abs(o.l - px) > 0.5) continue;
      if (o.k === 'coin') { o.gone = true; coins++; bonus += COIN_SCORE; beep(1180, 0.04, 'triangle', 0.05); emit({ type: 'coin' }); continue; }
      if (o.k === 'ppe') {
        o.gone = true; got.add(o.p); bonus += PPE_SCORE; beep(880, 0.07, 'triangle'); emit({ type: 'pickup' });
        if (got.size === 5) { got.clear(); shield = 8; toast = 'FULL PPE! โล่กันชน 1 ครั้ง'; toastT = 2; beep(1320, 0.2, 'triangle'); }
        continue;
      }
      const t = HZ[o.k].t, hit = t === 'block' || (t === 'low' && py < 0.45) || (t === 'high' && slide <= 0);
      if (!hit || inv > 0) continue;
      if (shield > 0) { shield = 0; inv = 1; o.gone = true; flash = 0.3; toast = 'PPE ช่วยไว้! · Saved by PPE'; toastT = 1.6; beep(300, 0.2, 'triangle'); emit({ type: 'saved' }); continue; }
      hitKind = o.k;
      emit({ type: 'crash', kind: o.k });
      return;
    }
    objs = objs.filter(o => o.z > -3 && !(o.gone && (o.k === 'ppe' || o.k === 'coin')));
    if (dist >= nextSur) { nextSur += 1500; surprise(); }
  }

  const isFinished = () => !!hitKind || tick === MAX_TICKS;

  return {
    quiz, correct,
    get tick() { return tick; },
    get finished() { return isFinished(); },
    input(action) {
      if (isFinished()) return false;
      if (action === 'left' || action === 'right') {
        const nextLane = Math.max(-1, Math.min(1, lane + (action === 'left' ? -1 : 1)));
        if (lane === nextLane) return false;
        lane = nextLane;
        beep(380, 0.04);
      } else if (action === 'up' && py === 0 && vy === 0) {
        vy = 9.2; slide = 0;
        beep(520, 0.06);
      } else if (action === 'down') {
        if (py > 0) vy = -16;
        slide = SLIDE_SECONDS;
        beep(220, 0.06);
      } else {
        return false;
      }
      return true;
    },
    answer(index) {
      if (!hitKind || revives || tick === MAX_TICKS || index !== correct) return false;
      revives++;
      objs = objs.filter(o => o.z > 14);
      inv = 2;
      slide = py = vy = 0;
      hitKind = null;
      toast = 'รอดแล้ว! ชนอีกครั้งจบรอบ';
      toastT = 1.8;
      return true;
    },
    step() {
      if (isFinished()) return;
      tick++;
      update(STEP);
    },
    view: () => ({ dist, lane, px, py, vy, slide, objs, got, shield, inv, revives, coins, bonus, toast, toastT, flash, sur, dbl, hitKind }),
    score: () => Math.floor(dist / METRES_PER_POINT) + bonus,
  };
}

/** Re-plays a submitted run. Returns the score, or null if the replay is malformed. */
export function replayScore(seed: number, ticks: unknown, inputs: unknown): number | null {
  if (!Number.isInteger(ticks) || (ticks as number) < 1 || (ticks as number) > MAX_TICKS ||
      !Array.isArray(inputs) || inputs.length > MAX_INPUTS) return null;
  const total = ticks as number;

  const game = createRun(seed);
  for (const entry of inputs) {
    if (!Array.isArray(entry) || entry.length !== 2) return null;
    const [at, action] = entry as [unknown, unknown];
    if (!Number.isInteger(at) || (at as number) < game.tick || (at as number) >= total) return null;
    while (game.tick < (at as number) && !game.finished) game.step();
    if (game.tick !== at) return null;
    const accepted = Number.isInteger(action) ? game.answer(action as number) : game.input(action as Action);
    if (!accepted) return null;
  }
  while (game.tick < total && !game.finished) game.step();
  return game.tick === total && game.finished ? game.score() : null;
}
