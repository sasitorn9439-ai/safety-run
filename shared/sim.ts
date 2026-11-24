/**
 * Deterministic game simulation. Runs in the browser (to play) and on the server (to replay a
 * submitted run and verify its score), so it must stay free of DOM, time and Math.random, and use only
 * arithmetic that every JS engine rounds the same way (+ - * / and Math.sqrt, never Math.pow, sin, cos...).
 * Changing the order or number of `random()` calls changes every seed's run: update tests/golden.json
 * deliberately if you ever do.
 */
import { DYNAMIC_KINDS, HZ, PPE, type HazardKind, type PpeType } from './hazards.js';
import { QB } from './questions.js';
import { TRICK } from './trick-questions.js';
import { TIPS, ZONES, zoneAt, type PatternId, type Zone } from './zones.js';

export { HZ, PPE } from './hazards.js';
export type { HazardKind, PpeType } from './hazards.js';

export const STEP = 1 / 60;
export const SLIDE_SECONDS = 0.7;
/** caps the replay the server runs; about 10 hours of hard play, still well inside the function's time limit */
export const MAX_INPUTS = 60000;
export const ZMAX = 72;
/** Running speed in metres per second. The original ramp adds 1 m/s every 55 m. */
export const START_SPEED = 14;
export const MAX_SPEED = 34;
const METRES_PER_SPEED_INCREMENT = 55;
export const FULL_SPEED_AT = (MAX_SPEED - START_SPEED) * METRES_PER_SPEED_INCREMENT;
export const speedAt = (dist: number) => Math.min(MAX_SPEED, START_SPEED + dist / METRES_PER_SPEED_INCREMENT);
/** distance between neighbouring coins in a trail */
const COIN_GAP = 1.7;
const MAGNET_RANGE = 3 * COIN_GAP;
/** fumes drift this fast (lanes per second); a load locks on this many seconds of running before it lands; the arc's on/off half-cycle in ticks */
export const FUME_DRIFT = 0.55;
export const DROP_LOCK_SECONDS = 0.8;
export const SPARK_HALF_CYCLE = 48;
/** a pattern's rows are at least this many seconds apart, so there is always time to react */
export const ROW_SECONDS = 0.9;

/** `audit` only exists in a tournament: another player's Spot Audit reached this player */
export type Action = 'left' | 'right' | 'up' | 'down' | 'audit';
/** [tick, action] or [tick, answer index] */
export type InputEntry = readonly [tick: number, action: Action | number];
export type Beep = (freq: number, dur?: number, type?: OscillatorType, vol?: number) => void;

/** Power-ups, each a piece of everyday Safety: they work for a few seconds the moment they are picked up */
export type PowerType = 'estop' | 'broom' | 'lift' | 'firstaid' | 'toolbox' | TourItem | GateType;
/** Tournament-only items (see TOUR_ITEMS) */
export type TourItem = 'quiz' | 'loto' | 'foam' | 'buddy' | 'streak' | 'audit';
/** the three answer gates of a tournament question, left to right */
export type GateType = 'gate0' | 'gate1' | 'gate2';
export const GATES: readonly GateType[] = ['gate0', 'gate1', 'gate2'];

/**
 * Tournament: a timed race, every player on the same seed (so the same track). A crash costs time instead of ending the run,
 * the usual power-ups and bonus coins give way to the tournament items, and a question card puts three answer gates across
 * the lanes: run through the right one for a Safety Sprint.
 */
export type StageId = Zone['id'] | 'tour';
export interface TourOptions { stage: StageId; durationTicks: number }
/** every tournament race runs this many seconds */
export const TOUR_DURATION = 120;
/** metres before the first question card, and between two */
export const QUIZ_FIRST = 220, QUIZ_GAP = 650;
/** metres between the end of a pattern and the row of question cards after it */
const QUIZ_ROW_GAP = 9;
/** metres between two other tournament items at the least */
export const ITEM_GAP = 300;
/** the gates come up this many seconds after the card, with the world slowed to GATE_FACTOR meanwhile */
export const GATE_SECONDS = 4.5, GATE_FACTOR = 0.5;
export const TOUR_SECONDS = { sprint: 3, think: 1.5, auditThink: 2.5, stun: 1.2, loto: 8, buddy: 5, streak: 15 } as const;
/** speed multipliers: Safety Sprint, Stop & Think, the stumble after a crash */
export const SPRINT_FACTOR = 2, THINK_FACTOR = 0.5, STUN_FACTOR = 0.35;
/** points the sender of a Spot Audit gets */
export const AUDIT_SCORE = 30;
const ITEM_WEIGHTS: Record<Exclude<TourItem, 'quiz'>, number> = { loto: 24, foam: 26, buddy: 18, streak: 18, audit: 14 };
export const POWER_SECONDS = { estop: 5, broom: 8, lift: 5 } as const;
/** E-Stop (stop work authority) slows the world to this fraction */
export const ESTOP_FACTOR = 0.6;
/** how high the man-lift carries the player */
export const LIFT_HEIGHT = 1.5;
/** metres between two power-ups at the least */
export const POWER_GAP = 450;
/** near-miss combo: a late dodge counts, the combo lasts this long, and every 3 steps the multiplier (on coins, PPE and near-misses) goes up */
export const COMBO_SECONDS = 6;
export const MULT_MAX = 4;
export const NEAR_SCORE = 2;

/** a mystery coin: touch it and answer a safety question for a random points bonus; metres between two at the least */
export const BONUS_GAP = 1555;
export const BONUS_CHANCE = 0.4;
export const BONUS_MIN = 50, BONUS_MAX = 300, BONUS_STEP = 10;
/** seconds the run waits for an answer before giving up on its own (keeps a replay from ever waiting forever) */
export const BONUS_SECONDS = 7;

/** Things the renderer may want to react to (particles, shake). Purely cosmetic: never feeds back into the sim. */
export type SimEvent =
  | { type: 'pickup' } | { type: 'coin' } | { type: 'saved' } | { type: 'near' } | { type: 'bonus' }
  | { type: 'power'; t: PowerType }
  | { type: 'crash'; kind: HazardKind };
export type Emit = (event: SimEvent) => void;

/**
 * `chk`: the near-miss check has been done for this one.
 * The rest belong to the moving hazards: `v` the sideways drift of fumes (lanes per second), `ph` the phase of the sparks' cycle,
 * `on` whether the arc is live right now, `locked` and `fz` for a load that has locked onto a lane and where it started to fall.
 */
export interface Obstacle { k: HazardKind; l: number; z: number; gone?: boolean; chk?: boolean; v?: number; ph?: number; on?: boolean; locked?: boolean; fz?: number }
export interface Pickup { k: 'ppe'; p: PpeType; l: number; z: number; gone?: boolean }
export interface Coin { k: 'coin'; l: number; z: number; gone?: boolean }
export interface Power { k: 'power'; t: PowerType; l: number; z: number; gone?: boolean }
export interface BonusToken { k: 'bonus'; l: number; z: number; gone?: boolean }
export type GameObject = Obstacle | Pickup | Coin | Power | BonusToken;

/**
 * Scoring: the distance run adds 1 point per
 * METRES_PER_POINT metres, a coin and a PPE item add a fixed amount, the Safety Officer's praise adds OFFICER_SCORE.
 */
export const METRES_PER_POINT = 1;
export const COIN_SCORE = 1;
export const PPE_SCORE = 10;
export const OFFICER_SCORE = 150;

export interface Surprise {
  k: 'officer' | 'rain' | 'star' | 'double' | 'toolbox';
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
  /** which area we are in: index into ZONES, and how many areas have been entered (1-based) */
  zone: number; zoneN: number;
  /** near-miss combo and its multiplier (1..MULT_MAX), seconds left before the combo runs out */
  combo: number; mult: number; comboT: number;
  /** seconds left on the E-Stop, the 5S broom and the man-lift; first-aid hearts in stock (0 or 1) */
  slow: number; magnet: number; lift: number; hearts: number;
  /** a bonus coin was just touched: answer it (same `answer` call as a revive) for the points, or let it time out */
  pendingBonus: BonusQuiz | null;
  /** tournament only */
  tour: TourView | null;
}

/** a question whose answer gates are on their way: options[i] is the gate in lane i - 1 */
export interface Gate { prompt: string; options: string[]; correct: number; audit: boolean; z: number }
export interface TourView {
  ticksLeft: number;
  gate: Gate | null;
  /** seconds left on each effect */
  sprint: number; think: number; stun: number; loto: number; buddy: number; streak: number;
  correct: number; wrong: number; crashes: number;
}

export interface Quiz { prompt: string; options: string[] }
/** the bonus-coin question: like Quiz but it names its own right answer and what it pays out */
export interface BonusQuiz extends Quiz { correct: number; reward: number }

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

/** one weighted pick; consumes exactly one random number */
function weighted<T extends string>(table: Partial<Record<T, number>>, r: number, only?: (k: T) => boolean): T {
  const entries = (Object.entries(table) as [T, number][]).filter(([k]) => !only || only(k));
  let total = 0;
  for (const [, w] of entries) total += w;
  let x = r * total;
  for (const [k, w] of entries) { x -= w; if (x < 0) return k; }
  return entries[entries.length - 1]![0];
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

/** what a Toolbox Talk box can give: [weight, name shown] */
const BOX_REWARDS = [['coins', 35, '+10 เหรียญ'], ['shield', 20, 'โล่ PPE'], ['double', 20, 'คะแนน x2'], ['broom', 15, 'ไม้กวาด 5ส'], ['estop', 10, 'E-Stop']] as const;

/** `startDist` starts the run part-way down the corridor (tests and tools only: a real run, and the server's replay, always start at 0) */
export interface RunOptions { startDist?: number; movementOnly?: boolean; tour?: TourOptions }

/** the deck of tournament questions in the order this seed deals them (the same for every player on the seed) */
function deck(random: () => number) {
  return shuffle(TRICK.map((_, i) => i), random);
}

export function createRun(seed: number, beep: Beep = () => {}, emit: Emit = () => {}, opts: RunOptions = {}): Run {
  const random = seededRandom(seed);
  const quizRandom = seededRandom(seed ^ 0xc3fcaf22);
  // power-ups and the Toolbox Talk have their own random streams, so they never shift the hazards
  const powerRandom = seededRandom(seed ^ 0x9e3779b9);
  const boxRandom = seededRandom(seed ^ 0x85ebca6b);
  const bonusRandom = seededRandom(seed ^ 0x27d4eb2f);
  const questions = QB.flat();
  const [prompt, choices] = questions[Math.floor(quizRandom() * questions.length)]!;
  const options = shuffle(choices.map((text, index) => ({ text, index })), quizRandom);
  const quiz: Quiz = { prompt, options: options.map(option => option.text) };
  const correct = options.findIndex(option => option.index === 0);

  const hasOpening = (opts.startDist ?? 0) === 0;
  let openingPending = hasOpening, openingDoublePending = hasOpening, openingComboPending = hasOpening;
  let dist = opts.startDist ?? 0, speed = START_SPEED, lane = 0, px = 0, py = 0, vy = 0, slide = 0, next = hasOpening ? 5 : 14;
  let objs: GameObject[] = [];
  const got = new Set<PpeType>();
  let shield = 0, inv = 1.2, revives = 0, coins = 0, bonus = 0, toast = '', toastT = 0, flash = 0;
  let nextSur = (Math.floor(dist / 1500) + 1) * 1500, sur: Surprise | null = null, lastSur = '', dbl = 0, dblAcc = 0, tick = 0;
  let hitKind: HazardKind | null = null;
  let slow = 0, magnet = 0, lift = 0, hearts = 0, lastPower = dist;
  let combo = 0, comboT = 0, leftLane = 0, leftT = 9;
  let nextBonusCheck = (Math.floor(dist / BONUS_GAP) + 1) * BONUS_GAP, bonusArmed = false, pendingBonus: BonusQuiz | null = null, bonusTimer = 0;

  // tournament: its own random streams, so the track (main stream) stays the same for every player whatever they answer
  const tour = opts.tour ?? null;
  const tourZone = tour && tour.stage !== 'tour' ? ZONES.findIndex(z => z.id === tour.stage) : -1;
  const zoneOf = (d: number) => (tourZone >= 0 ? { index: tourZone, zone: ZONES[tourZone]!, n: 1 } : zoneAt(d));
  const itemRandom = seededRandom(seed ^ 0x165667b1), gateRandom = seededRandom(seed ^ 0xd3a2646c);
  const quizDeck = tour ? deck(seededRandom(seed ^ 0x2545f491)) : [], auditDeck = tour ? deck(seededRandom(seed ^ 0x61c88647)) : [];
  let quizN = 0, auditN = 0, nextQuiz = QUIZ_FIRST, lastItem = 0, gate: Gate | null = null;
  let sprint = 0, think = 0, stun = 0, loto = 0, buddy = 0, streak = 0, correctN = 0, wrongN = 0, crashes = 0;

  const mult = () => 1 + Math.min(MULT_MAX - 1, Math.floor(combo / 3));
  const say = (text: string, seconds: number) => { toast = text; toastT = seconds; };

  /* ---------- what appears ahead ---------- */

  interface Row { z: number; hz: { k: HazardKind; l: number }[] }
  const rowGap = (min: number) => Math.max(min, speed * ROW_SECONDS);
  /** a hazard as it is placed on the track; the moving ones get their starting state from the main random stream */
  const hazard = (k: HazardKind, l: number, z: number): Obstacle => {
    if (k === 'fumes') return { k, l, z, v: random() < 0.5 ? -FUME_DRIFT : FUME_DRIFT };
    if (k === 'sparks') return { k, l, z, ph: (random() * SPARK_HALF_CYCLE * 2) | 0, on: false };
    return { k, l, z };
  };

  /** the hazards of one pattern, row by row, and the lane a coin trail should follow in each row (null = none) */
  function pattern(id: PatternId, zone: Zone, firstRowZ: number): { rows: Row[]; free: (number | null)[] } {
    const kind = () => weighted(zone.kinds as Record<HazardKind, number>, random());
    if (id === 'double') {
      // a drifting cloud can cover two lanes at once, so it never shares a row: that would leave no way through
      const calm = () => weighted(zone.kinds as Record<HazardKind, number>, random(), k => k !== 'fumes');
      const lanes = shuffle([-1, 0, 1], random);
      return { rows: [{ z: ZMAX, hz: [{ k: calm(), l: lanes[0]! }, { k: calm(), l: lanes[1]! }] }], free: [lanes[2]!] };
    }
    if (id === 'slalom') {
      const a = random() < 0.5 ? -1 : 1, frees = [a, 0, -a], gap = rowGap(10);
      const rows = frees.map((f, i) => ({ z: ZMAX + i * gap, hz: [-1, 0, 1].filter(l => l !== f).map(l => ({ k: (random() < 0.5 ? 'forklift' : 'pallet') as HazardKind, l })) }));
      return { rows, free: frees };
    }
    const low = () => [-1, 0, 1].map(l => ({ k: (random() < 0.5 ? 'spill' : 'hose') as HazardKind, l }));
    const high = () => [-1, 0, 1].map(l => ({ k: 'pipe' as HazardKind, l }));
    if (id === 'lowwall') return { rows: [{ z: ZMAX, hz: low() }], free: [null] };
    if (id === 'highwall') return { rows: [{ z: ZMAX, hz: high() }], free: [null] };
    if (id === 'jumpslide') return { rows: [{ z: ZMAX, hz: low() }, { z: ZMAX + rowGap(12) * 1.2, hz: high() }], free: [null, null] };
    const lanes = shuffle([-1, 0, 1], random);                                   // single
    if (openingPending) {
      const center = lanes.indexOf(0);
      [lanes[center], lanes[0]] = [lanes[0]!, lanes[center]!];
    }
    return { rows: [{ z: firstRowZ, hz: [{ k: kind(), l: lanes[0]! }] }], free: [lanes[1]!] };
  }

  function spawn() {
    const zone = zoneOf(dist).zone;
    let id = weighted(zone.patterns, random());
    if (openingComboPending && dist >= 200) {
      id = 'jumpslide';
      openingComboPending = false;
    } else if (openingDoublePending && dist >= 75) {
      id = 'double';
      openingDoublePending = false;
    } else if (dist < 75) {
      id = 'single';
    }
    const firstRowZ = openingPending ? 45 : ZMAX;
    const { rows, free } = pattern(id, zone, firstRowZ);
    const length = rows[rows.length - 1]!.z - firstRowZ;

    const fresh: GameObject[] = [];
    for (const r of rows) for (const h of r.hz) fresh.push(hazard(h.k, h.l, r.z));

    // coins: a trail down the free lane (single, double), a few per row (slalom), a short run before a wall (jump coins sit over a low wall)
    const trail: { l: number; z: number }[] = [];
    if (id === 'single' || id === 'double') {
      if (random() < 0.85 || openingPending) for (let i = 0, c = 6 + ((random() * 4) | 0); i < c; i++) trail.push({ l: free[0]!, z: firstRowZ - 3 + i * COIN_GAP });
    } else if (id === 'slalom') {
      rows.forEach((r, i) => { for (const d of [-1, 0, 1]) trail.push({ l: free[i]!, z: r.z + d * COIN_GAP }); });
    } else {
      for (const r of rows) {
        const wallLow = r.hz[0]!.k !== 'pipe';
        for (const d of wallLow ? [-3, -2, -1, 1, 2] : [-3, -2, -1]) trail.push({ l: 0, z: r.z + d * COIN_GAP });
      }
    }
    const need = PPE.filter(t => !got.has(t)), pool = need.flatMap(t => (t === zone.ppe ? [t, t, t] : [t]));
    const at = trail.length >= 3 && random() < 0.55 ? 1 + ((random() * (trail.length - 2)) | 0) : -1;
    const ppePick = at >= 0 ? pool[(random() * pool.length) | 0] ?? PPE[0]! : PPE[0]!;

    // power-up: its own stream, three numbers every spawn whether or not they are used
    const pa = powerRandom(), pb = powerRandom(), pc = powerRandom();
    let powerAt = -1, power: PowerType | null = null, quizRow = false;
    if (tour) {
      // tournament items: two numbers every spawn; a question card once its distance comes up, otherwise now and then an item
      const ia = itemRandom(), ib = itemRandom();
      if (!gate && dist >= nextQuiz) { quizRow = true; nextQuiz = dist + QUIZ_GAP; }
      else if (trail.length >= 3 && dist - lastItem >= ITEM_GAP && ia < 0.6) power = weighted(ITEM_WEIGHTS, ib);
      if (power) {
        lastItem = dist;
        powerAt = Math.floor(trail.length / 2);
        if (powerAt === at) powerAt = (powerAt + 1) % trail.length;
      }
    } else if (trail.length >= 3 && dist - lastPower >= POWER_GAP && pa < 0.5) {
      const ok = (k: PowerType) => k === 'toolbox' || (k === 'broom' && magnet <= 0) || (k === 'estop' && dist > 600 && slow <= 0) ||
        (k === 'lift' && dist > 400 && lift <= 0) || (k === 'firstaid' && hearts < 1 && dist > 800);
      power = weighted({ toolbox: 30, broom: 22, estop: 18, lift: 12, firstaid: 10 } as Record<PowerType, number>, pb, ok);
      powerAt = Math.floor(pc * trail.length);
      if (powerAt === at) powerAt = (powerAt + 1) % trail.length;
      lastPower = dist;
    }
    // bonus coin: its own stream too, a number every spawn whether or not it is used; placed once a BONUS_GAP checkpoint rolls it armed
    const bc = bonusRandom();
    let bonusAt = -1;
    if (trail.length >= 3 && bonusArmed) {
      bonusAt = Math.floor(bc * trail.length);
      if (bonusAt === at) bonusAt = (bonusAt + 1) % trail.length;
      if (bonusAt === powerAt) bonusAt = (bonusAt + 1) % trail.length;
      if (bonusAt === at) bonusAt = (bonusAt + 1) % trail.length;
      bonusArmed = false;
    }
    // a trail from the previous spawn may still be running into these hazards: clear the pickups right around them
    objs.push(...fresh);
    for (const h of fresh) objs = objs.filter(o => !((o.k === 'coin' || o.k === 'ppe' || o.k === 'power' || o.k === 'bonus') && o.l === (h as Obstacle).l && Math.abs(o.z - (h as Obstacle).z) < 1.6));
    trail.forEach((c, i) => {
      if (i === powerAt && power) objs.push({ k: 'power', t: power, l: c.l, z: c.z });
      else if (i === at) objs.push({ k: 'ppe', p: ppePick, l: c.l, z: c.z });
      else if (i === bonusAt) objs.push({ k: 'bonus', l: c.l, z: c.z });
      else objs.push({ k: 'coin', l: c.l, z: c.z });
    });
    openingPending = false;
    // a question card fills all three lanes just past the pattern: nobody misses a question
    if (quizRow) {
      for (const l of [-1, 0, 1]) objs.push({ k: 'power', t: 'quiz', l, z: firstRowZ + length + QUIZ_ROW_GAP });
      return length + QUIZ_ROW_GAP;
    }
    return length;
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

  /* ---------- power-ups ---------- */

  /** a Toolbox Talk: a short Safety point and a surprise reward */
  function toolbox() {
    let x = boxRandom() * 100, reward: (typeof BOX_REWARDS)[number] = BOX_REWARDS[0];
    for (const r of BOX_REWARDS) { x -= r[1]; if (x < 0) { reward = r; break; } }
    const tip = TIPS[Math.floor(boxRandom() * TIPS.length)]!;
    if (reward[0] === 'coins') { coins += 10; bonus += 10 * COIN_SCORE * mult(); }
    else if (reward[0] === 'shield') shield = 8;
    else if (reward[0] === 'double') dbl = 8;
    else if (reward[0] === 'broom') magnet = POWER_SECONDS.broom;
    else slow = POWER_SECONDS.estop;
    sur = { k: 'toolbox', t: 0, dur: 3.6, msg: `Toolbox Talk · ${reward[2]}`, sub: tip };
  }

  /* ---------- tournament ---------- */

  /** a question card (or someone's Spot Audit): the three gates are placed GATE_SECONDS of slowed running ahead */
  function startGate(audit: boolean) {
    const n = audit ? auditDeck[auditN++ % auditDeck.length]! : quizDeck[quizN++ % quizDeck.length]!;
    const [prompt, choices] = TRICK[n]!;
    const order = shuffle([0, 1, 2], gateRandom);
    // the right answer rarely sits in the lane you are already in: you have to move for it
    const here = lane + 1, right = order.indexOf(0), swapR = gateRandom();
    if (right === here && swapR < 0.75) {
      const other = (here + 1 + (swapR < 0.375 ? 0 : 1)) % 3;
      [order[here], order[other]] = [order[other]!, order[here]!];
    }
    const z = speed * GATE_FACTOR * GATE_SECONDS;
    gate = { prompt, options: order.map(i => choices[i]!), correct: order.indexOf(0), audit, z };
    // nothing in the way of the gates, and nothing new until they have gone by
    objs = objs.filter(o => o.k === 'coin' || o.k === 'ppe' || o.z < 6 || o.z > z + 8);
    GATES.forEach((t, i) => objs.push({ k: 'power', t, l: i - 1, z }));
    next = Math.max(next, z + 10);
    say(audit ? 'Spot Audit! มีคนส่งผู้ตรวจมาหาคุณ' : 'Safety Check! วิ่งเข้าประตูคำตอบที่ถูก', 2);
    beep(1400, 0.1, 'triangle'); beep(1800, 0.12, 'triangle');
  }

  /** `lane` the gate run through, or null if the gates went by untouched */
  function resolveGate(at: number | null) {
    const g = gate!;
    gate = null;
    for (const o of objs) if (o.k === 'power' && GATES.includes(o.t as GateType)) o.gone = true;
    if (at === g.correct) {
      correctN++;
      if (g.audit) { say('ผ่าน Audit! ไปต่อ', 1.6); }
      else { sprint = TOUR_SECONDS.sprint; inv = Math.max(inv, TOUR_SECONDS.sprint + 0.5); say('ถูกต้อง! Safety Sprint 🚀', 1.8); }
      beep(1200, 0.16, 'triangle'); beep(1600, 0.18, 'triangle');
    } else {
      wrongN++;
      think = g.audit ? TOUR_SECONDS.auditThink : TOUR_SECONDS.think;
      say(`ยังไม่ถูก · คำตอบคือ "${g.options[g.correct]}"`, 2.2);
      beep(160, 0.16, 'sawtooth');
    }
  }

  /** Fire extinguisher: clears the hazards in your lane for the next few seconds of running */
  function foam() {
    const reach = speed * 3;
    for (const o of objs) if (o.k !== 'coin' && o.k !== 'ppe' && o.k !== 'power' && o.k !== 'bonus' && Math.abs(o.l - lane) < 0.5 && o.z > -1 && o.z < reach) o.gone = true;
  }

  /** a crash in a tournament: stumble and lose a little time, keep running */
  function stumble(o: Obstacle) {
    o.gone = true;
    crashes++;
    stun = TOUR_SECONDS.stun; inv = TOUR_SECONDS.stun + 1; flash = 0.35; combo = 0;
    if (streak > 0) { streak = 0; dbl = 0; }
    say(`ชน! ${HZ[o.k].th}`, 1.4);
    beep(110, 0.25, 'sawtooth', 0.08);
    emit({ type: 'saved' });
  }

  /** Buddy System: your buddy calls out what's ahead (jump, slide, or the free lane) */
  function buddyStep() {
    const ahead = speed * 0.45;
    for (const o of objs) {
      if (o.gone || o.k === 'coin' || o.k === 'ppe' || o.k === 'power' || o.k === 'bonus' || o.z < 0 || o.z > ahead || Math.abs(o.l - lane) > 0.5) continue;
      const t = HZ[o.k].t;
      if (t === 'low' && py === 0 && vy === 0) { vy = 9.2; slide = 0; }
      else if (t === 'high') slide = SLIDE_SECONDS;
      else if (t === 'block') {
        const blocked = (l: number) => objs.some(b => !b.gone && b.k !== 'coin' && b.k !== 'ppe' && b.k !== 'power' && b.k !== 'bonus' && b.z > -1 && b.z < ahead * 2 && Math.abs(b.l - l) < 0.6);
        const free = [lane - 1, lane + 1].find(l => l >= -1 && l <= 1 && !blocked(l));
        if (free != null) { leftLane = lane; leftT = 0; lane = free; }
      }
      return;
    }
  }

  function takePower(t: PowerType) {
    if (GATES.includes(t as GateType)) { if (gate) resolveGate(GATES.indexOf(t as GateType)); return; }
    emit({ type: 'power', t });
    beep(1040, 0.08, 'triangle'); beep(1560, 0.1, 'triangle');
    if (t === 'quiz') {
      for (const o of objs) if (o.k === 'power' && o.t === 'quiz') o.gone = true;
      if (!gate) startGate(false);
    }
    else if (t === 'loto') { loto = TOUR_SECONDS.loto; say('LOTO! ตัดพลังงาน อันตรายที่เคลื่อนที่หยุดหมด', 2); }
    else if (t === 'foam') { foam(); say('ถังดับเพลิง! เคลียร์เลนข้างหน้า', 2); }
    else if (t === 'buddy') { buddy = TOUR_SECONDS.buddy; say('Buddy System! เพื่อนช่วยนำทาง', 2); }
    else if (t === 'streak') { streak = dbl = TOUR_SECONDS.streak; say('Zero Accident x2! อย่าชนนะ', 2); }
    else if (t === 'audit') { bonus += AUDIT_SCORE; say(`Spot Audit! ส่งผู้ตรวจไปหาคนที่นำอยู่ +${AUDIT_SCORE}`, 2); }
    else if (t === 'toolbox') toolbox();
    else if (t === 'estop') { slow = POWER_SECONDS.estop; say('E-Stop! หยุดงานเพื่อความปลอดภัย · เกมช้าลง', 2); }
    else if (t === 'broom') { magnet = POWER_SECONDS.broom; say('5ส! ไม้กวาดดูดเหรียญ', 2); }
    else if (t === 'firstaid') { hearts = 1; say('ชุดปฐมพยาบาล! กันชนได้อีก 1 ครั้ง', 2); }
    else {
      lift = POWER_SECONDS.lift; vy = 0; slide = 0;
      say('รถกระเช้า! ลอยเหนืออันตราย เก็บเหรียญ', 2);
      // a zig-zag of coins for the whole ride
      const len = Math.min(110, Math.floor((speed * POWER_SECONDS.lift) / COIN_GAP));
      const path = [-1, 0, 1, 0];
      objs = objs.filter(o => o.z < 12 || (o.k !== 'coin' && o.k !== 'ppe' && o.k !== 'power' && o.k !== 'bonus'));
      for (let i = 0; i < len; i++) objs.push({ k: 'coin', l: path[(i >> 2) % 4]!, z: 14 + i * COIN_GAP });
      next = Math.max(next, 14 + len * COIN_GAP);
    }
  }

  /** a mystery coin was touched: pull a fresh question off the bonus stream and freeze the run for an answer */
  function startBonus() {
    const [prompt, choices] = questions[Math.floor(bonusRandom() * questions.length)]!;
    const opts = shuffle(choices.map((text, index) => ({ text, index })), bonusRandom);
    const reward = BONUS_MIN + Math.round(bonusRandom() * (BONUS_MAX - BONUS_MIN) / BONUS_STEP) * BONUS_STEP;
    pendingBonus = { prompt, options: opts.map(o => o.text), correct: opts.findIndex(o => o.index === 0), reward };
    bonusTimer = BONUS_SECONDS;
    beep(1400, 0.1, 'triangle'); beep(1800, 0.12, 'triangle');
    emit({ type: 'bonus' });
  }

  /** `index` null = gave up waiting (the server's replay can never hang on an unanswered bonus) */
  function resolveBonus(index: number | null) {
    const q = pendingBonus!;
    if (index != null && index === q.correct) { bonus += q.reward * mult(); say(`ตอบถูก! +${q.reward} คะแนน · Bonus +${q.reward}`, 1.8); beep(1200, 0.16, 'triangle'); beep(1600, 0.18, 'triangle'); }
    else if (index != null) { say('ยังไม่ถูก ไปต่อ! · Not quite, keep running', 1.4); beep(160, 0.16, 'sawtooth'); }
    else { say('หมดเวลา ไปต่อ! · Time up, keep running', 1.4); beep(160, 0.16, 'sawtooth'); }
    pendingBonus = null;
  }

  function nearMiss() {
    combo++; comboT = COMBO_SECONDS;
    const m = mult();
    bonus += NEAR_SCORE * m;
    say(`NEAR MISS! x${m}`, 0.9);
    beep(1500, 0.05, 'square', 0.04);
    emit({ type: 'near' });
  }

  /** the moving hazards: fumes drift, a load follows you and then locks, the arc switches on and off */
  function moveHazards(dt: number) {
    const lockZ = Math.max(8, speed * DROP_LOCK_SECONDS);
    for (const o of objs) {
      if (o.gone) continue;
      if (loto > 0) { if (o.k === 'sparks') o.on = false; continue; }   // locked out: nothing moves, the arc is dead
      if (o.k === 'fumes') {
        o.l += (o.v ?? 0) * dt;
        if (o.l > 1) { o.l = 1; o.v = -(o.v ?? 0); } else if (o.l < -1) { o.l = -1; o.v = -(o.v ?? 0); }
      } else if (o.k === 'drop' && !o.locked) {
        if (o.z <= lockZ) { o.locked = true; o.fz = o.z; }          // the mark stops following you: leave the lane now
        else if (o.z < ZMAX - 40) o.l = lane;                       // it has come into view: it goes for the lane you are in
      } else if (o.k === 'sparks') o.on = ((tick + (o.ph ?? 0)) % (SPARK_HALF_CYCLE * 2)) < SPARK_HALF_CYCLE;
    }
  }

  /* ---------- one step ---------- */

  function update(dt: number) {
    // the whole run holds still while a bonus question is up; a timeout keeps this from ever waiting forever
    if (pendingBonus) { if ((bonusTimer -= dt) <= 0) resolveBonus(null); return; }
    speed = speedAt(dist);
    // E-Stop eases the world down to ESTOP_FACTOR and back
    const ease = slow > 0 ? Math.max(0, Math.min(1, slow / 0.3, (POWER_SECONDS.estop - slow) / 0.3)) : 0;
    let dz = speed * (1 - (1 - ESTOP_FACTOR) * ease) * dt;
    if (tour) {
      dz *= (sprint > 0 ? SPRINT_FACTOR : stun > 0 ? STUN_FACTOR : think > 0 ? THINK_FACTOR : 1) * (gate ? GATE_FACTOR : 1);
      sprint = Math.max(0, sprint - dt); think = Math.max(0, think - dt); stun = Math.max(0, stun - dt);
      loto = Math.max(0, loto - dt); buddy = Math.max(0, buddy - dt); streak = Math.max(0, streak - dt);
      if (gate && (gate.z -= dz) < -1) resolveGate(null);
      if (buddy > 0) buddyStep();
    }
    dist += dz;
    slow = Math.max(0, slow - dt); magnet = Math.max(0, magnet - dt); leftT += dt;
    if (comboT > 0 && (comboT -= dt) <= 0) combo = 0;
    if (dbl > 0) { dbl -= dt; dblAcc += dz; while (dblAcc >= METRES_PER_POINT) { bonus++; dblAcc -= METRES_PER_POINT; } }
    if (sur && (sur.t += dt) > sur.dur) sur = null;
    for (const o of objs) o.z -= dz;
    moveHazards(dt);
    if (!opts.movementOnly && (next -= dz) <= 0) {
      const length = spawn();
      // at least ROW_SECONDS'-worth of running between two patterns, more when the zone is calm
      next = length + Math.max(13 + random() * 9 - Math.min(3, dist / 800), speed * 0.6 + random() * 3);
    }
    px += (lane - px) * Math.min(1, dt * 14);
    if (lift > 0) {
      lift = Math.max(0, lift - dt);
      py += (LIFT_HEIGHT - py) * Math.min(1, dt * 8); vy = 0; slide = 0;
      if (lift === 0) inv = Math.max(inv, 1.2);              // a moment of grace to come down
    } else if (py > 0 || vy > 0) { vy -= 24 * dt; py += vy * dt; if (py <= 0) { py = 0; vy = 0; } }
    slide = Math.max(0, slide - dt); inv = Math.max(0, inv - dt); shield = Math.max(0, shield - dt);
    toastT = Math.max(0, toastT - dt); flash = Math.max(0, flash - dt);
    if (magnet > 0) for (const o of objs) if (o.k === 'coin' && o.z < MAGNET_RANGE && o.z > -0.5) o.l += (px - o.l) * Math.min(1, dt * 6);
    const m = mult();
    for (const o of objs) {
      if (o.gone || Math.abs(o.z) > 0.7 || Math.abs(o.l - px) > 0.5) continue;
      if (o.k === 'coin') { o.gone = true; coins++; bonus += COIN_SCORE * m; beep(1180, 0.04, 'triangle', 0.05); emit({ type: 'coin' }); continue; }
      if (o.k === 'ppe') {
        o.gone = true; got.add(o.p); bonus += PPE_SCORE * m; beep(880, 0.07, 'triangle'); emit({ type: 'pickup' });
        if (got.size === 5) { got.clear(); shield = 8; say('FULL PPE! โล่กันชน 1 ครั้ง', 2); beep(1320, 0.2, 'triangle'); }
        continue;
      }
      if (o.k === 'power') { o.gone = true; takePower(o.t); continue; }
      if (o.k === 'bonus') { o.gone = true; startBonus(); continue; }
      if (lift > 0) continue;                                // up on the lift: nothing on the floor can touch you
      const t = HZ[o.k].t, hit = (o.k !== 'sparks' || !!o.on) && (t === 'block' || (t === 'low' && py < 0.45) || (t === 'high' && slide <= 0));
      if (!hit || inv > 0) continue;
      if (tour) {
        if (buddy > 0 || (loto > 0 && DYNAMIC_KINDS.includes(o.k))) continue;
        if (shield > 0) { shield = 0; inv = 1; o.gone = true; flash = 0.3; combo = 0; say('PPE ช่วยไว้! · Saved by PPE', 1.6); beep(300, 0.2, 'triangle'); emit({ type: 'saved' }); continue; }
        stumble(o);
        continue;
      }
      if (shield > 0) { shield = 0; inv = 1; o.gone = true; flash = 0.3; combo = 0; say('PPE ช่วยไว้! · Saved by PPE', 1.6); beep(300, 0.2, 'triangle'); emit({ type: 'saved' }); continue; }
      if (hearts > 0) { hearts = 0; inv = 1.4; o.gone = true; flash = 0.3; combo = 0; say('ชุดปฐมพยาบาลช่วยไว้!', 1.8); beep(300, 0.2, 'triangle'); emit({ type: 'saved' }); continue; }
      hitKind = o.k;
      emit({ type: 'crash', kind: o.k });
      return;
    }
    // a hazard that has just gone past: was it a late dodge? (a lane change, a jump or a slide just in time)
    for (const o of objs) {
      if (o.k === 'coin' || o.k === 'ppe' || o.k === 'power' || o.k === 'bonus' || o.gone || o.chk || o.z > 0) continue;
      o.chk = true;
      if (lift > 0 || inv > 0) continue;
      const t = HZ[o.k].t;
      if (o.k === 'sparks' && !o.on) continue;                 // a dead arc is no danger, so no near miss either
      const near = t === 'block' ? Math.abs(o.l - leftLane) <= 0.5 && leftT < 0.5 && Math.abs(o.l - lane) > 0.5
        : Math.abs(o.l - px) <= 0.5 && (t === 'low' ? py < 1.1 : slide < 0.22);
      if (near) nearMiss();
    }
    objs = objs.filter(o => o.z > -3 && !(o.gone && (o.k === 'ppe' || o.k === 'coin' || o.k === 'power' || o.k === 'bonus')));
    if (!opts.movementOnly && dist >= nextSur) { nextSur += 1500; surprise(); }
    if (!tour && !opts.movementOnly && dist >= nextBonusCheck) { nextBonusCheck += BONUS_GAP; if (bonusRandom() < BONUS_CHANCE) bonusArmed = true; }
  }

  const isFinished = () => tour ? tick >= tour.durationTicks : !!hitKind;

  return {
    quiz, correct,
    get tick() { return tick; },
    get finished() { return isFinished(); },
    input(action) {
      if (isFinished() || pendingBonus) return false;
      if (action === 'audit') {
        if (!tour || gate) return false;
        startGate(true);
        return true;
      }
      if (action === 'left' || action === 'right') {
        const nextLane = Math.max(-1, Math.min(1, lane + (action === 'left' ? -1 : 1)));
        if (lane === nextLane) return false;
        leftLane = lane; leftT = 0;
        lane = nextLane;
        beep(380, 0.04);
      } else if (lift > 0 && (action === 'up' || action === 'down')) {
        return false;                                         // the lift is carrying you
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
      if (pendingBonus) { resolveBonus(index); return true; }
      if (tour || !hitKind || revives || index !== correct) return false;
      revives++;
      objs = objs.filter(o => o.z > 14);
      inv = 2;
      slide = py = vy = 0;
      hitKind = null;
      combo = 0;
      say('รอดแล้ว! ชนอีกครั้งจบรอบ', 1.8);
      return true;
    },
    step() {
      if (isFinished()) return;
      tick++;
      update(STEP);
    },
    view: () => ({
      dist, lane, px, py, vy, slide, objs, got, shield, inv, revives, coins, bonus, toast, toastT, flash, sur, dbl, hitKind,
      zone: zoneOf(dist).index, zoneN: zoneOf(dist).n, combo, mult: mult(), comboT, slow, magnet, lift, hearts, pendingBonus,
      tour: tour && {
        ticksLeft: Math.max(0, tour.durationTicks - tick), gate,
        sprint, think, stun, loto, buddy, streak, correct: correctN, wrong: wrongN, crashes,
      },
    }),
    score: () => Math.floor(dist / METRES_PER_POINT) + bonus,
  };
}

/** Re-plays a tournament run to its end. Null if the replay is malformed. */
export function replayTour(seed: number, tour: TourOptions, inputs: unknown): { score: number; correct: number } | null {
  const game = createRun(seed, undefined, undefined, { tour });
  return replayInto(game, tour.durationTicks, inputs) ? { score: game.score(), correct: game.view().tour!.correct } : null;
}

/** Re-plays a submitted run. Returns the score, or null if the replay is malformed. */
export function replayScore(seed: number, ticks: unknown, inputs: unknown): number | null {
  const game = createRun(seed);
  return replayInto(game, ticks, inputs) ? game.score() : null;
}

function replayInto(game: Run, ticks: unknown, inputs: unknown): boolean {
  if (!Number.isInteger(ticks) || (ticks as number) < 1 ||
      !Array.isArray(inputs) || inputs.length > MAX_INPUTS) return false;
  const total = ticks as number;

  for (const entry of inputs) {
    if (!Array.isArray(entry) || entry.length !== 2) return false;
    const [at, action] = entry as [unknown, unknown];
    if (!Number.isInteger(at) || (at as number) < game.tick || (at as number) >= total) return false;
    while (game.tick < (at as number) && !game.finished) game.step();
    if (game.tick !== at) return false;
    const accepted = Number.isInteger(action) ? game.answer(action as number) : game.input(action as Action);
    if (!accepted) return false;
  }
  while (game.tick < total && !game.finished) game.step();
  return game.tick === total && game.finished;
}
