import { neutral, type Pose2D } from './puppet.js';
import { P, keyed, slideCrouch } from './pose-utils.js';
import type { SlidePose } from './slide.js';

export interface Anim2D {
  name: string; frames: number; cols: number; fps: number; loop: boolean;
  tags?: Record<string, [number, number]>; note: string;
  /** a puppet pose (seen from behind), or `{ side }` for the side-view slide */
  pose(i: number): Pose2D | { side: SlidePose };
}

const TAU = Math.PI * 2;

/* ---- idle: breathing, a slight head tilt, cape tails settling (12 frames, loops) ---- */
const idle: Anim2D = {
  name: 'idle', frames: 12, cols: 6, fps: 10, loop: true,
  note: 'Standing and breathing; menu and the moment before the run starts.',
  pose(i) {
    const a = i / 12 * TAU, s = Math.sin(a);
    return P({
      sy: 1 + .016 * s, sx: 1 - .008 * s, rot: .012 * Math.sin(a + .4),
      head: { dx: 0, dy: .006 * Math.sin(a + .9), rot: .045 * s },
      handL: { x: -.213, y: -.286 + .012 * Math.sin(a + .6) }, handR: { x: .213, y: -.286 + .012 * Math.sin(a + 1.4) },
      cape: { tipL: .014 * Math.sin(a + 1), tipR: .014 * Math.sin(a + 1.6), mid: -.01 * s, spread: 0 },
    });
  },
};

/* ---- run: 16 frames = two steps. Frame 0: left foot down / right lifted; frame 8: the other way round ---- */
const run: Anim2D = {
  name: 'run', frames: 16, cols: 8, fps: 24, loop: true, tags: { contactA: [0, 0], contactB: [8, 8] },
  note: 'Running away from the camera. One loop = two steps. Body bob, lean and cape flutter are drawn in.',
  pose(i) {
    const ph = i / 16 * TAU, st = Math.sin(ph);
    return P({
      dy: .022 * (1 - Math.cos(2 * ph)) / 2, rot: .028 * st, sy: 1 + .012 * Math.cos(2 * ph), sx: 1 - .006 * Math.cos(2 * ph),
      head: { dx: -.006 * st, dy: -.006 * (1 - Math.cos(2 * ph)) / 2, rot: -.04 * st },
      footL: { lift: Math.max(0, -st) * .1, dx: 0 }, footR: { lift: Math.max(0, st) * .1, dx: 0 },
      handL: { x: -.213 - .012 * Math.abs(st), y: -.286 - st * .07 }, handR: { x: .213 + .012 * Math.abs(st), y: -.286 + st * .07 },
      cape: { tipL: .035 * Math.sin(2 * ph + 1), tipR: .035 * Math.sin(2 * ph + 1.4), mid: -.035 * Math.sin(2 * ph + 1), spread: .01 },
    });
  },
};

/* ---- jump: 16 frames, squash and stretch drawn in ---- */
const crouch = P({ sy: .84, sx: 1.13, head: { dx: 0, dy: -.01, rot: 0 }, footL: { lift: 0, dx: -.025 }, footR: { lift: 0, dx: .025 },
  handL: { x: -.27, y: -.2 }, handR: { x: .27, y: -.2 }, cape: { tipL: -.04, tipR: -.04, mid: -.03, spread: .04 } });
const launch = P({ sy: 1.07, sx: .95, head: { dx: 0, dy: .01, rot: 0 }, footL: { lift: .03, dx: 0 }, footR: { lift: .03, dx: 0 },
  handL: { x: -.22, y: -.66 }, handR: { x: .22, y: -.66 }, cape: { tipL: .07, tipR: .07, mid: .05, spread: -.02 } });
const rise = P({ sy: 1.03, sx: .98, head: { dx: 0, dy: .008, rot: .02 }, footL: { lift: .06, dx: -.01 }, footR: { lift: .05, dx: .01 },
  handL: { x: -.26, y: -.74 }, handR: { x: .26, y: -.74 }, cape: { tipL: .06, tipR: .06, mid: .04, spread: 0 } });
const apex = P({ sy: 1.0, sx: 1.0, rot: .02, head: { dx: 0, dy: 0, rot: -.03 }, footL: { lift: .11, dx: -.03 }, footR: { lift: .1, dx: .03 },
  handL: { x: -.38, y: -.52 }, handR: { x: .38, y: -.52 }, cape: { tipL: -.02, tipR: -.02, mid: 0, spread: .05 } });
const fall = P({ sy: 1.04, sx: .98, head: { dx: 0, dy: .004, rot: .03 }, footL: { lift: .07, dx: -.015 }, footR: { lift: .05, dx: .015 },
  handL: { x: -.3, y: -.7 }, handR: { x: .3, y: -.7 }, cape: { tipL: -.07, tipR: -.07, mid: -.06, spread: .03 } });
const impact = P({ sy: .78, sx: 1.2, head: { dx: 0, dy: -.014, rot: 0 }, footL: { lift: 0, dx: -.045 }, footR: { lift: 0, dx: .045 },
  handL: { x: -.32, y: -.24 }, handR: { x: .32, y: -.24 }, cape: { tipL: -.05, tipR: -.05, mid: -.04, spread: .08 } });
const rebound = P({ sy: 1.06, sx: .96, head: { dx: 0, dy: .006, rot: 0 }, handL: { x: -.23, y: -.31 }, handR: { x: .23, y: -.31 }, cape: { tipL: .03, tipR: .03, mid: .02, spread: 0 } });
const jump: Anim2D = {
  name: 'jump', frames: 16, cols: 8, fps: 24, loop: false,
  tags: { takeoff: [0, 2], rise: [3, 5], apex: [6, 8], fall: [9, 11], land: [12, 15] },
  note: 'takeoff→rise while vy > 0, apex near vy = 0, fall while vy < 0 (hold the last fall frame), land plays on touchdown. The sprite already contains the squash and stretch; the game only moves it up and down.',
  pose: keyed([[0, crouch], [2, launch], [4, rise], [7, apex], [10, fall], [11, fall], [12, impact], [14, rebound], [15, neutral()]]),
};

/* ---- slide: run → crouch → side-view slide (drop, hold, recover) → crouch → run (14 frames) ---- */
const burst = (a = 1): SlidePose['dust'] => [
  { x: -.36, y: -.07, r: .1, a: .95 * a }, { x: -.22, y: -.05, r: .085, a: .95 * a },
  { x: .12, y: -.05, r: .11, a: .9 * a, front: true }, { x: .27, y: -.07, r: .09, a: .85 * a }, { x: .02, y: -.11, r: .08, a: .8 * a },
];
/** the dust trail while sliding: it drifts back and fades as the slide slows (t = 0 → 1) */
const trail = (t: number): SlidePose['dust'] => [
  ...[0, 1, 2, 3].map(i => ({ x: .12 + i * .1 + t * .06, y: -.05 - i * .026 - t * .02, r: .065 + i * .02 + t * .02, a: (.92 - i * .17) * (1 - t * .6) })),
  { x: -.34 - t * .03, y: -.05, r: .05 + t * .01, a: .8 * (1 - t * .7), front: true },
];
const base: SlidePose = { lean: .58, hip: { x: .03, y: -.11 }, reach: 1, farKnee: .7, brace: 1, hand: { x: -.25, y: .04 }, headTilt: 0, cape: 0, capeLift: 0, dust: [], lines: 0 };
const side = (o: Partial<SlidePose>): { side: SlidePose } => ({ side: { ...base, ...o } });

export const sideSlide: Anim2D = {
  name: 'slide', frames: 14, cols: 7, fps: 20, loop: false, tags: { drop: [0, 3], hold: [4, 9], recover: [10, 13] },
  note: 'Slides under low pipes (SLIDE_SECONDS = 0.7 s). Frames 2–11 are seen from the side: it drops back onto its seat, one leg out in front, the cape streaming behind, dust fading as it slows, then pushes itself back up. Frames 0–1 and 12–13 blend with the run pose.',
  pose(i) {
    if (i === 0) return P({ rot: .03 });
    if (i === 1 || i === 12) return slideCrouch;
    if (i === 13) return P({ rot: .02 });
    if (i === 2) return side({ lean: .2, hip: { x: .03, y: -.25 }, reach: .35, farKnee: .5, brace: 0, hand: { x: -.2, y: -.04 }, headTilt: .05, cape: 1, capeLift: .6, dust: burst() , lines: .7 });
    if (i === 3) return side({ lean: .42, hip: { x: .03, y: -.17 }, reach: .75, farKnee: .6, brace: .55, hand: { x: -.23, y: .0 }, headTilt: .03, cape: 2, capeLift: .8, dust: burst(.9), lines: .9 });
    if (i <= 9) {                                                  // hold: it slows down, so the bob and the wind both settle
      const k = i - 4, t = k / 5, wob = Math.sin(k * 1.3) * (1 - t * .6);
      return side({ lean: .58 + .035 * wob, hip: { x: .03 - t * .02, y: -.108 + .006 * wob }, hand: { x: -.25, y: .04 + .03 * Math.sin(k * 1.6 + 1) },
                    farKnee: .7 + .1 * wob, headTilt: .03 * wob, cape: 3 + k * 1.1, capeLift: .5 * (1 - t * .6), dust: trail(t), lines: .8 * (1 - t) });
    }
    if (i === 10) return side({ lean: .38, hip: { x: .01, y: -.17 }, reach: .5, farKnee: 1, brace: .85, hand: { x: -.16, y: -.06 }, headTilt: -.04, cape: 9, capeLift: .2, dust: [{ x: .2, y: -.06, r: .06, a: .5 }, { x: .34, y: -.07, r: .05, a: .35 }] });
    return side({ lean: .14, hip: { x: 0, y: -.25 }, reach: .15, farKnee: .8, brace: .3, hand: { x: -.12, y: -.1 }, headTilt: -.05, cape: 10, capeLift: .1, dust: [{ x: .22, y: -.06, r: .045, a: .3 }] });
  },
};

import { CROUCH_VARIANTS, SLIDE_VARIANTS } from './slides.js';

import { DEFAULT_SLIDE, type SlideId } from './ids.js';
export { DEFAULT_SLIDE, SLIDE_IDS, type SlideId } from './ids.js';

/** The animation for the down-key: 'side' = the side-view slide, '1'..'5' = back-facing slides, 'c1'..'c5' = crouches (see slides.ts). */
export function slideAnim(id: SlideId): Anim2D {
  if (id === 'side') return sideSlide;
  const v = [...SLIDE_VARIANTS, ...CROUCH_VARIANTS].find(x => x.id === id)!;
  return { name: 'slide', frames: 14, cols: 7, fps: 20, loop: false, tags: { drop: [0, 3], hold: [4, 9], recover: [10, 13] }, note: `${v.name}: ${v.note}`, pose: v.pose };
}

/** All four animations, with the chosen down-key animation. */
export const animsWith = (slide: SlideId = DEFAULT_SLIDE): Anim2D[] => [idle, run, jump, slideAnim(slide)];
export const ANIMS: Anim2D[] = animsWith();
