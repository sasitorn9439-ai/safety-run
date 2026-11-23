/**
 * Everything about *how the world looks at this instant* that doesn't depend on the graphics API:
 * blending the last two sim steps, sorting what to draw, the mascot's pose, particles and screen shake.
 * Both renderers (WebGL and Canvas2D) read from here, so they move identically.
 */
import type { HazardKind, PpeType } from '../../shared/hazards.js';
import { SLIDE_SECONDS, ZMAX, type GameObject, type SimEvent } from '../../shared/sim.js';
import { Camera, type Pt } from './camera.js';
import type { Frame } from './types.js';

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
  kind: 'hazard' | 'ppe' | 'coin' | 'player';
  z: number;
  /** art origin on screen (feet for hazards, centre for PPE) */
  x: number; y: number;
  /** CSS pixels per art unit */
  u: number;
  fade: number;
  k: HazardKind;
  p: PpeType;
  blink: boolean;
  /** pickups: horizontal squeeze of the slow coin-like turn (0.6–1), glow strength (0–1) and the ground point under the item */
  sx: number; halo: number; gy: number;
}

/** how much bigger a pickup is drawn at the far end of the corridor (0 = true perspective size) */
export const PPE_FAR_BOOST = .5;

/** how much bigger than true perspective each hazard is drawn: the tall ones a bit larger (so they outweigh the pickups); flat ones and the scaffold (already as tall as a jump) unchanged */
export const HAZARD_SCALE: Record<HazardKind, number> = { forklift: 1.15, pallet: 1.15, pipe: 1, spill: 1, hose: 1 };

export class DrawList {
  items: DrawItem[] = [];
  n = 0;
  private scratch: GameObject[] = [];
  private pt: Pt = { x: 0, y: 0, s: 1 };

  private next(): DrawItem {
    if (this.n === this.items.length) this.items.push({ kind: 'hazard', z: 0, x: 0, y: 0, u: 0, fade: 1, k: 'spill', p: 'helmet', blink: false, sx: 1, halo: 0, gy: 0 });
    return this.items[this.n++]!;
  }

  build(f: Frame, cam: Camera, I: Interp, now: number) {
    this.n = 0;
    const list = this.scratch;
    list.length = 0;
    for (const o of f.s.objs) if (!o.gone) list.push(o);
    list.sort((a, b) => b.z - a.z);
    let player = false;
    const addPlayer = () => { const it = this.next(); it.kind = 'player'; it.z = 0; player = true; };
    for (const o of list) {
      const z = o.z + I.lead;
      if (!player && z < 0) addPlayer();
      if (z > ZMAX) continue;
      const p = cam.project(o.l, z, 0, this.pt), u = cam.lw * p.s;
      const it = this.next();
      it.z = z; it.fade = clamp((ZMAX - z) / 22, 0, 1); // fade in from the haze instead of popping in
      it.sx = 1; it.halo = 0; it.gy = p.y;
      if (o.k === 'coin') {
        // coins stay a little larger than true perspective too, and spin all the way round, each a little behind the last (a ripple down the trail)
        const boost = 1 + PPE_FAR_BOOST * .5 * (1 - p.s);
        it.kind = 'coin'; it.x = p.x; it.y = p.y - (.55 + Math.sin((I.dist + o.z) * .8 + now * .005) * .05) * u * .9; it.u = u * boost; it.blink = false;
        it.sx = .12 + .88 * Math.abs(Math.cos(now * .006 + (I.dist + o.z) * .9));
      } else if (o.k === 'ppe') {
        const phase = (I.dist + o.z) * .8 + now * .005;
        const bob = Math.sin(phase) * .08, pulse = 1 + Math.sin(phase * 1.3) * .05;
        // pickups must stay readable from far away (like coins in a runner): grow them as they recede instead of shrinking to a dot
        const boost = 1 + PPE_FAR_BOOST * (1 - p.s);
        it.kind = 'ppe'; it.p = o.p; it.x = p.x; it.y = p.y - (.6 + bob) * u * .9; it.u = u * pulse * boost; it.blink = false;
        it.sx = .8 + .2 * Math.cos(now * .0045 + (I.dist + o.z) * .8);          // a slow coin-like turn
        it.halo = .45 + .15 * Math.sin(phase * 1.3);
      } else {
        it.kind = 'hazard'; it.k = o.k; it.x = p.x; it.y = p.y; it.u = u * HAZARD_SCALE[o.k];
        it.blink = o.k === 'forklift' && ((I.dist * 3) | 0) % 2 === 1;
      }
    }
    if (!player) addPlayer();
  }
}

/* ---------- the mascot ---------- */

export interface Pose {
  x: number; groundY: number; feetY: number; u: number;
  sliding: boolean; frame: number;
  bob: number; xs: number; ys: number; lean: number;
  alpha: number; shadowU: number; shadowAlpha: number;
  shield: boolean; shieldPulse: number;
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
  return {
    x: p.x, groundY: p.y, feetY: p.y - I.py * u * .9 - bob, u,
    sliding, frame, bob,
    ys: ys0 * (1 - .18 * fx.landT), xs: (1 / ys0) * (1 + .12 * fx.landT),
    lean: sliding ? 0 : clamp((f.s.lane - I.px) * .22, -.3, .3),
    alpha: f.playing && f.s.inv > 0 && Math.floor(f.s.inv * 10) % 2 ? .45 : 1,
    shadowU: u * .5 / (1 + I.py * .3), shadowAlpha: 1 / (1 + I.py),
    shield: f.s.shield > 0, shieldPulse: 1 + Math.sin(now * .008) * .03,
  };
}

/** Pillars and ceiling lights along the corridor, as {z, kind, lane}. Fills `out` and returns the count. */
export interface EnvItem { z: number; light: boolean; l: number }
export function envItems(dist: number, out: EnvItem[]): number {
  let n = 0;
  const put = (z: number, light: boolean, l: number) => {
    const it = (out[n] ||= { z: 0, light: false, l: 0 });
    it.z = z; it.light = light; it.l = l; n++;
  };
  for (let z = 12 - (dist % 12); z < ZMAX; z += 12) { put(z, false, -2.4); put(z, false, 2.4); }
  for (let z = 8 - (dist % 8); z < ZMAX; z += 8) put(z, true, 0);
  return n;
}
