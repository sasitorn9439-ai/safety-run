/**
 * Everything about *how the world looks at this instant* that doesn't depend on the graphics API:
 * blending the last two sim steps, sorting what to draw, the mascot's pose, particles and screen shake.
 * Both renderers (WebGL and Canvas2D) read from here, so they move identically.
 */
import { zoneIndexAt } from '../../shared/zones.js';
import { HZ, type HazardKind, type PpeType } from '../../shared/hazards.js';
import { LIFT_HEIGHT, POWER_SECONDS, SLIDE_SECONDS, START_SPEED, STEP, ZMAX, isItem, type GameObject, type PowerType, type SimEvent } from '../../shared/sim.js';
import { Camera, type Pt } from './camera.js';
import type { Look } from '../cosmetics/types.js';
import type { Frame, Ghost, SceneState } from './types.js';

/** the PPE shield's ring: tiles round it, pre-drawn frames per tile's turn, how fast it turns (rad/s), and the seconds left when it starts to flicker */
export const SHIELD_TILES = 11, SHIELD_FRAMES = 12, SHIELD_TURN = 1.6, SHIELD_WARN_SECONDS = 2;
/** which pre-drawn frame of the shield's ring shows at `now` (ms) */
export const shieldFrame = (now: number) => Math.floor(now / 1000 * SHIELD_TURN / (TAU / SHIELD_TILES) * SHIELD_FRAMES) % SHIELD_FRAMES;
/** the shield's opacity with `left` seconds of it to go: steady, then flickering as it runs out */
export const shieldAlpha = (left: number) => left <= 0 ? 0 : left > SHIELD_WARN_SECONDS || Math.floor(left * 8) % 2 ? 1 : .25;

/** how long before invincibility runs out the player starts to flicker */
export const INV_BLINK_SECONDS = 1.5;
/** the player's opacity while invincible */
export const INV_ALPHA = .45;
/** see-through while invincible; in the last INV_BLINK_SECONDS it flickers back to solid as a warning it is about to wear off */
export const invAlpha = (inv: number) => inv <= 0 ? 1 : inv > INV_BLINK_SECONDS || Math.floor(inv * 10) % 2 ? INV_ALPHA : 1;

const JUMP_GUIDE_RADIUS = 5.1;
const JUMP_GUIDE_HEIGHT = 1.25;
/** a ghost this far behind the mascot (metres) has left the bottom of the screen */
const GHOST_BEHIND = -3;
/** how solid a ghost is at its clearest */
const GHOST_ALPHA = .5;
/** past where the man-lift ride ends, its coin trail slopes back down to the floor over this many metres */
const LIFT_RAMP = 6;

export const TAU = Math.PI * 2;
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const RUN_FRAMES = 24;
export const SLIDE_FRAMES = 20;

export interface Interp { dist: number; px: number; py: number; slide: number; lead: number }

export function interp(f: Frame): Interp {
  const a = f.alpha, s = f.s;
  return {
    dist: lerp(f.prev.dist, s.dist, a), px: lerp(f.prev.px, s.px, a),
    py: lerp(f.prev.py, s.py, a), slide: lerp(f.prev.slide, s.slide, a),
    // objects moved by (s.dist - prev.dist) during the last step; this is how far "behind" the blended instant they still are
    lead: (s.dist - f.prev.dist) * (1 - a),
  };
}

/* ---------- particles, shake, landing ---------- */

export interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; r: number; color: number; alpha: number; g: number }

export class Fx {
  particles: Particle[] = [];
  shake = 0;
  landT = 0;
  private lastPy = 0;
  private tmp: Pt = { x: 0, y: 0, s: 1 };

  onEvent(e: SimEvent, px: number, cam: Camera) {
    const p = cam.project(px, 0, 0, this.tmp), u = cam.lw;
    if (e.type === 'coin') {
      for (let i = 0; i < 3; i++) this.burst(p.x, p.y - u * .55, 0xffe45c, 60 + Math.random() * 40, -.2 - Math.random() * 2.4, u * .02);
    } else if (e.type === 'pickup') {
      for (let i = 0; i < 9; i++) this.burst(p.x, p.y - u * .55, 0xffd400, 70 + Math.random() * 60, -.2 - Math.random() * 3.2, u * .028);
    } else if (e.type === 'power') {
      for (let i = 0; i < 18; i++) this.burst(p.x, p.y - u * .6, i % 2 ? 0xffffff : 0x3ccf7a, 110 + Math.random() * 90, -.4 - Math.random() * 3.6, u * .03);
    } else if (e.type === 'bonus') {
      for (let i = 0; i < 20; i++) this.burst(p.x, p.y - u * .6, i % 2 ? 0xffffff : 0x9b5de5, 120 + Math.random() * 90, -.4 - Math.random() * 3.6, u * .03);
    } else if (e.type === 'loot') {
      this.shake = Math.max(this.shake, .3);
      for (let i = 0; i < 28; i++) this.burst(p.x, p.y - u * .6, [0xffd400, 0xffffff, 0xff5ac8, 0x5ad1ff][i % 4]!, 130 + Math.random() * 110, -.6 - Math.random() * 3.8, u * .034);
    } else if (e.type === 'near') {
      for (let i = 0; i < 6; i++) this.burst(p.x, p.y - u * .5, 0xfff6a8, 90 + Math.random() * 60, -.2, u * .022);
    } else if (e.type === 'saved') {
      this.shake = Math.max(this.shake, .55);
      for (let i = 0; i < 14; i++) this.burst(p.x, p.y - u * .5, 0x7fe3ff, 120 + Math.random() * 90, 0, u * .03);
    } else {
      this.shake = 1;
      for (let i = 0; i < 18; i++) this.burst(p.x, p.y - u * .4, i % 2 ? 0xff5a4a : 0xffffff, 140 + Math.random() * 130, 0, u * .03);
    }
  }

  private burst(x: number, y: number, color: number, speed: number, upward: number, r: number, alpha = 1) {
    const ang = Math.random() * TAU, sp = speed * (.4 + Math.random() * .6);
    this.particles.push({ x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp + upward * 40, life: 1, max: .45 + Math.random() * .3, r, color, alpha, g: 260 });
  }

  /** Advances landing/shake/particles by dt seconds. */
  update(I: Interp, playing: boolean, cam: Camera, dt: number) {
    if (playing) {
      if (this.lastPy > .08 && I.py <= .001) {
        this.landT = 1;
        const p = cam.project(I.px, 0, 0, this.tmp);
        for (let i = 0; i < 6; i++) this.burst(p.x, p.y, 0xd2d6dc, 50 + Math.random() * 40, -1.2, cam.lw * .03, .8);
      }
      this.lastPy = I.py;
    } else this.lastPy = 0;
    this.landT = Math.max(0, this.landT - dt / .16);
    this.shake = Math.max(0, this.shake - dt / .4);

    const ps = this.particles;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i]!;
      p.life -= dt / p.max;
      if (p.life <= 0) { ps[i] = ps[ps.length - 1]!; ps.pop(); continue; }
      p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    }
  }

  /** Screen-shake offset for this instant. */
  shakeOffset(now: number, out: { x: number; y: number }) {
    const k = this.shake * this.shake * 9;
    out.x = this.shake > 0 ? Math.sin(now * .09) * k : 0;
    out.y = this.shake > 0 ? Math.cos(now * .113) * k : 0;
  }
}

/* ---------- what to draw, far to near ---------- */

export interface DrawItem {
  kind: 'hazard' | 'ppe' | 'coin' | 'power' | 'bonus' | 'loot' | 'player' | 'ghost';
  z: number;
  /** art origin on screen (feet for hazards, centre for PPE) */
  x: number; y: number;
  /** CSS pixels per art unit */
  u: number;
  fade: number;
  k: HazardKind;
  p: PpeType;
  /** which power-up (kind 'power') */
  pw: PowerType;
  blink: boolean;
  /** pickups: horizontal squeeze of the slow coin-like turn (0.6–1), glow strength (0–1) and the ground point under the item */
  sx: number; halo: number; gy: number;
  /** drop: height of the falling crate above its mark in units (-1 = the mark has not locked yet) */
  fall: number;
  /** ghost: its own scene, for picking its pose with the player's rules */
  gf: Frame | null;
  /** ghost: what that runner wears */
  look: Look | null;
}

/** how much bigger a pickup is drawn at the far end of the corridor (0 = true perspective size) */
export const PPE_FAR_BOOST = .5;

/** how much bigger than true perspective each hazard is drawn: the tall ones a bit larger (so they outweigh the pickups); flat ones and the scaffold (already as tall as a jump) unchanged */
export const HAZARD_SCALE: Record<HazardKind, number> = { forklift: 1.15, pallet: 1.15, pipe: 1, spill: 1, manhole: 1, hose: 1, fumes: 1, drop: 1, sparks: 1 };

export class DrawList {
  items: DrawItem[] = [];
  n = 0;
  private scratch: GameObject[] = [];
  private ghosts: { z: number; g: Ghost }[] = [];
  private pt: Pt = { x: 0, y: 0, s: 1 };
  /** metres per second, from the last moving step; where (in run metres) the current or last man-lift ride ends */
  private speed = START_SPEED;
  private liftEnd = -Infinity;
  private lastDist = 0;

  /** how far up (0..1 of the lift's height) a pickup at run metre `at` floats: level with the mascot on the ride, sloping down past its end */
  private liftRaise(at: number) {
    const t = clamp(1 - (at - this.liftEnd) / LIFT_RAMP, 0, 1);
    return t * t * (3 - 2 * t);
  }

  private next(): DrawItem {
    if (this.n === this.items.length) this.items.push({ kind: 'hazard', z: 0, x: 0, y: 0, u: 0, fade: 1, k: 'spill', p: 'helmet', pw: 'toolbox', blink: false, sx: 1, halo: 0, gy: 0, fall: -1, gf: null, look: null });
    return this.items[this.n++]!;
  }

  build(f: Frame, cam: Camera, I: Interp, now: number) {
    this.n = 0;
    const list = this.scratch;
    list.length = 0;
    for (const o of f.s.objs) if (!o.gone) list.push(o);
    // on the man-lift every pickup is in reach whatever its height, so they are drawn up where the mascot rides
    if (f.s.dist > f.prev.dist) this.speed = (f.s.dist - f.prev.dist) / STEP;
    if (f.s.dist < this.lastDist - 1) this.liftEnd = -Infinity;           // a new run
    this.lastDist = f.s.dist;
    if ((f.s.lift ?? 0) > 0) this.liftEnd = f.s.dist + f.s.lift! * this.speed;
    const lowHazards = list.filter(o =>
      !isItem(o) && HZ[o.k].t === 'low',
    );
    list.sort((a, b) => b.z - a.z);
    const ghosts = this.ghosts;
    ghosts.length = 0;
    for (const g of f.ghosts ?? []) { const z = g.dist - I.dist; if (z > GHOST_BEHIND && z < ZMAX) ghosts.push({ z, g }); }
    ghosts.sort((a, b) => b.z - a.z);
    let player = false, gi = 0;
    const addPlayer = () => { const it = this.next(); it.kind = 'player'; it.z = 0; player = true; };
    const addGhost = (z: number, g: Ghost) => {
      const p = cam.project(g.px, z, 0, this.pt), it = this.next();
      it.kind = 'ghost'; it.z = z; it.x = p.x; it.y = p.y; it.u = cam.lw * p.s; it.gf = ghostFrame(g); it.look = g.look ?? null;
      it.fade = GHOST_ALPHA * clamp((ZMAX - z) / 22, 0, 1) * clamp((z - GHOST_BEHIND) / 1.5, 0, 1);
    };
    /** everything nearer than the objects so far, down to depth `z`, in back-to-front order */
    const upTo = (z: number) => {
      while (gi < ghosts.length && ghosts[gi]!.z > z) {
        const { z: gz, g } = ghosts[gi++]!;
        if (!player && gz < 0) addPlayer();
        addGhost(gz, g);
      }
      if (!player && z < 0) addPlayer();
    };
    for (const o of list) {
      const z = o.z + I.lead;
      upTo(z);
      if (z > ZMAX) continue;
      const p = cam.project(o.l, z, 0, this.pt), u = cam.lw * p.s;
      const it = this.next();
      it.z = z; it.fade = clamp((ZMAX - z) / 22, 0, 1); // fade in from the haze instead of popping in
      it.sx = 1; it.halo = 0; it.gy = p.y; it.fall = -1;
      if (o.k === 'coin') {
        // coins stay a little larger than true perspective too, and spin all the way round, each a little behind the last (a ripple down the trail)
        const boost = 1 + PPE_FAR_BOOST * .5 * (1 - p.s);
        it.kind = 'coin'; it.x = p.x; it.y = p.y - (.55 + Math.sin((I.dist + o.z) * .8 + now * .005) * .05) * u * .9; it.u = u * boost; it.blink = false;
        it.sx = .12 + .88 * Math.abs(Math.cos(now * .006 + (I.dist + o.z) * .9));
      } else if (o.k === 'power') {
        // power-ups are bigger than PPE and glow harder: they are the thing worth swerving for
        const phase = (I.dist + o.z) * .8 + now * .005, boost = 1 + PPE_FAR_BOOST * (1 - p.s);
        it.kind = 'power'; it.pw = o.t; it.x = p.x; it.y = p.y - (.7 + Math.sin(phase) * .1) * u * .9; it.u = u * boost * (1 + Math.sin(phase * 1.3) * .06); it.blink = false;
        it.sx = .85 + .15 * Math.cos(now * .004 + (I.dist + o.z) * .8);
        it.halo = .75 + .2 * Math.sin(phase * 1.3);
      } else if (o.k === 'ppe') {
        const phase = (I.dist + o.z) * .8 + now * .005;
        const bob = Math.sin(phase) * .08, pulse = 1 + Math.sin(phase * 1.3) * .05;
        // pickups must stay readable from far away (like coins in a runner): grow them as they recede instead of shrinking to a dot
        const boost = 1 + PPE_FAR_BOOST * (1 - p.s);
        it.kind = 'ppe'; it.p = o.p; it.x = p.x; it.y = p.y - (.6 + bob) * u * .9; it.u = u * pulse * boost; it.blink = false;
        it.sx = .8 + .2 * Math.cos(now * .0045 + (I.dist + o.z) * .8);          // a slow coin-like turn
        it.halo = .45 + .15 * Math.sin(phase * 1.3);
      } else if (o.k === 'bonus' || o.k === 'loot') {
        // a mystery coin or a loot box: bigger than a plain coin and it pulses harder, so it reads as worth stopping for
        const phase = (I.dist + o.z) * .8 + now * .005, boost = 1 + PPE_FAR_BOOST * (1 - p.s);
        it.kind = o.k; it.x = p.x; it.y = p.y - (.65 + Math.sin(phase) * .1) * u * .9; it.u = u * boost * (1 + Math.sin(phase * 1.3) * .08); it.blink = false;
        it.sx = .85 + .15 * Math.cos(now * .005 + (I.dist + o.z) * .8);
        it.halo = .7 + .25 * Math.sin(phase * 1.3);
      } else {
        it.kind = 'hazard'; it.k = o.k; it.x = p.x; it.y = p.y; it.u = u * HAZARD_SCALE[o.k];
        it.blink = o.k === 'forklift' && ((I.dist * 3) | 0) % 2 === 1;
        if (o.k === 'sparks') it.blink = !!o.on && ((now * .03) | 0) % 3 !== 0;                       // a live arc flickers
        else if (o.k === 'drop') {
          it.blink = !!o.locked && ((now * .012) | 0) % 2 === 0;                                      // a locked mark blinks
          if (o.locked) it.fall = Math.pow(1 - clamp(1 - z / (o.fz || 1), 0, 1), 2) * 2.6;          // the crate comes down, landing as it reaches you
        }
      }
      if (it.kind !== 'hazard') {
        let distance = JUMP_GUIDE_RADIUS;
        for (const hazard of lowHazards) {
          if (Math.abs(hazard.l - o.l) < .5) distance = Math.min(distance, Math.abs(hazard.z - o.z));
        }
        const offset = distance / JUMP_GUIDE_RADIUS, up = this.liftRaise(I.dist + z);
        it.y -= (JUMP_GUIDE_HEIGHT * (1 - offset * offset) * (1 - up) + LIFT_HEIGHT * .9 * up) * u;
      }
    }
    upTo(-Infinity);
  }
}

/* ---------- the mascot ---------- */

export interface Pose {
  x: number; groundY: number; feetY: number; u: number;
  /** top of the man-lift's deck (it springs under the mascot's hops) */ deckY: number;
  sliding: boolean; frame: number;
  bob: number; xs: number; ys: number; lean: number;
  alpha: number; shadowU: number; shadowAlpha: number;
  /** the PPE shield's opacity (0 = none), its glow's (which breathes), and its ring's frame; centred at feetY + bob - u * .52 */
  shield: number; shieldGlow: number; shieldFrame: number;
}

/** a ghost as a one-runner scene, so the player's pose rules pick its frame too */
export function ghostFrame(g: Ghost): Frame {
  const s: SceneState = { dist: g.dist, lane: g.px, px: g.px, py: g.py, vy: g.vy, slide: g.slide, inv: 0, shield: 0, objs: [] };
  return { s, prev: { dist: g.dist, px: g.px, py: g.py, slide: g.slide }, alpha: 1, playing: true, flash: 0 };
}
/** a ghost has no landing squash or shake of its own */
export const GHOST_FX = new Fx();

/** how long one hop on the man-lift takes (ms) */
const LIFT_HOP_MS = 380;
export interface LiftBounce { /** mascot's feet above the deck, in lane widths */ hop: number; /** the deck's own spring, in lane widths (+ = up) */ deck: number; /** 0..1, how hard the mascot is pressing on the deck right now */ contact: number }
/**
 * Up on the man-lift the mascot bounces on the deck like a spring: the deck shoots up with an overshoot as it climbs on,
 * then it hops in place and the deck dips each time it lands. Purely cosmetic: the sim's height is unchanged.
 */
export function liftBounce(f: Frame, now: number): LiftBounce | null {
  const left = f.s.lift ?? 0;
  if (left <= 0 || f.s.slide > 0) return null;
  const t = POWER_SECONDS.lift - left;
  const on = clamp((t - .15) / .3, 0, 1) * clamp(left / .35, 0, 1);    // start once the deck is up, settle before stepping off
  const up = Math.abs(Math.sin(now / LIFT_HOP_MS * Math.PI));            // 0 on the deck, 1 at the top of a hop
  const contact = on * (1 - up) ** 3;
  const boing = Math.exp(-t * 4.5) * Math.sin(t * 20);                    // the climb-on overshoot
  return { hop: up * .2 * on, deck: boing * .14 - contact * .06, contact };
}

export function pose(f: Frame, cam: Camera, I: Interp, fx: Fx, now: number, pt: Pt): Pose {
  const p = cam.project(I.px, 0, 0, pt), u = cam.lw;
  const sliding = I.slide > 0, airborne = I.py > .02 || f.s.vy > 0;
  let frame: number, bob = 0;
  if (sliding) frame = Math.round(clamp(1 - I.slide / SLIDE_SECONDS, 0, 1) * (SLIDE_FRAMES - 1));
  else {
    const ph = ((I.dist * 1.0) % TAU + TAU) % TAU;
    frame = airborne ? Math.floor(RUN_FRAMES / 4) : Math.floor(ph / TAU * RUN_FRAMES) % RUN_FRAMES;
    if (!airborne) bob = Math.abs(Math.sin(ph)) * .025 * u;
  }
  // squash & stretch and a lean into lane changes: cheap 2.5D weight
  const ys0 = sliding ? 1 : 1 + clamp(f.s.vy, -16, 10) * .011;
  const lb = liftBounce(f, now), deckY = p.y - I.py * u * .9 - (lb ? lb.deck * u : bob);
  // on the lift: squash flat on each landing, stretch a little on the way up
  const lsq = lb ? 1 - .22 * lb.contact + .3 * lb.hop : 1;
  const alpha = invAlpha(f.playing ? f.s.inv : 0), sh = shieldAlpha(f.s.shield) * alpha;
  return {
    x: p.x, groundY: p.y, feetY: deckY - (lb ? lb.hop * u : 0), deckY, u,
    sliding, frame, bob,
    ys: ys0 * lsq * (1 - .18 * fx.landT), xs: (1 / (ys0 * lsq)) * (1 + .12 * fx.landT),
    lean: sliding ? 0 : clamp((f.s.lane - I.px) * .22, -.3, .3),
    alpha,
    shadowU: u * .5 / (1 + I.py * .3), shadowAlpha: 1 / (1 + I.py),
    shield: sh, shieldGlow: sh * (.85 + .15 * Math.sin(now * .005)), shieldFrame: shieldFrame(now),
  };
}

const POLE_GAP = 24;

/** Pillars and ceiling lights along the corridor, as {z, kind, lane}. Fills `out` and returns the count. */
export interface EnvItem { white?: boolean; z: number; light: boolean; l: number }
export function envItems(dist: number, out: EnvItem[], stageZone?: number): number {
  let n = 0;
  const put = (z: number, light: boolean, l: number, white = false) => {
    const it = (out[n] ||= { z: 0, light: false, l: 0 });
    it.z = z; it.white = white; it.light = light; it.l = l; n++;
  };
  for (let m = (Math.floor(dist / POLE_GAP) + 1) * POLE_GAP; m < dist + ZMAX; m += POLE_GAP) {
    const zone = zoneIndexAt(m, stageZone);
    const white = zone === 1 || zone === 4;
    put(m - dist, false, -2.4, white); put(m - dist, false, 2.4, white);
  }
  for (let z = 8 - (dist % 8); z < ZMAX; z += 8) {
    if (zoneIndexAt(dist + z, stageZone) !== 0) put(z, true, 0);
  }
  return n;
}

export function entranceWires(dist: number, stageZone: number | undefined, cam: Camera,
  emit: (points: number[], z: number) => void) {
  const pt = { x: 0, y: 0, s: 1 };
  for (let m = Math.floor(dist / POLE_GAP) * POLE_GAP; m < dist + ZMAX; m += POLE_GAP) {
    if (zoneIndexAt(m, stageZone) !== 0 || zoneIndexAt(m + POLE_GAP, stageZone) !== 0) continue;
    const start = m - dist;
    const near = Math.max(0, start), far = Math.min(ZMAX, start + POLE_GAP);
    if (near >= far) continue;
    for (const lane of [-2.4, 2.4]) {
      const points: number[] = [];
      for (let i = 0; i <= 12; i++) {
        const z = near + (far - near) * i / 12;
        const t = (z - start) / POLE_GAP;
        cam.project(lane, z, (7.12 - 3.2 * t * (1 - t)) / .9, pt);
        points.push(pt.x, pt.y);
      }
      emit(points, (near + far) / 2);
    }
  }
}
