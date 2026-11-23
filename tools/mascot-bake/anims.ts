import { neutral, type Pose } from './rig.js';

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };
export interface Anim {
  name: string; frames: number; cols: number; fps: number; loop: boolean;
  /** named frame ranges [first, last] the engine can use to pick the right part of the animation */
  tags?: Record<string, [number, number]>;
  note: string;
  pose(i: number): Pose;
}

const merge = <T extends object>(base: T, over: DeepPartial<T>): T => {
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(over)) {
    const b = (base as Record<string, unknown>)[k];
    out[k] = v && typeof v === 'object' && b && typeof b === 'object' ? merge(b as object, v as object) : v;
  }
  return out as T;
};
const P = (over: DeepPartial<Pose>): Pose => merge(neutral(), over);

function mix<T>(a: T, b: T, t: number): T {
  if (typeof a === 'number') return (a + ((b as number) - a) * t) as T;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(a as object)) out[k] = mix((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], t);
  return out as T;
}
const smooth = (t: number) => t * t * (3 - 2 * t);

/** Poses at chosen frame numbers; frames in between are eased. */
function keyed(keys: [number, Pose][]) {
  return (i: number): Pose => {
    if (i <= keys[0]![0]) return keys[0]![1];
    for (let k = 1; k < keys.length; k++) {
      const [f1, p1] = keys[k]!, [f0, p0] = keys[k - 1]!;
      if (i <= f1) return mix(p0, p1, smooth((i - f0) / (f1 - f0)));
    }
    return keys.at(-1)![1];
  };
}

const TAU = Math.PI * 2;

/* ---------------- idle: breathing, a slow look around, cape sway (12 frames, loops) ---------------- */
const idle: Anim = {
  name: 'idle', frames: 12, cols: 6, fps: 10, loop: true,
  note: 'Standing, breathing; used on the menu and before the run starts.',
  pose(i) {
    const t = i / 12, a = t * TAU;
    return P({
      y: .006 * Math.sin(a), squash: 1 + .012 * Math.sin(a + .6),
      roll: .025 * Math.sin(a), yaw: .05 * Math.sin(a),
      headPitch: .04 * Math.sin(a + .9), headYaw: .16 * Math.sin(a), headRoll: .03 * Math.sin(a + 1.4),
      armL: { swing: .06 * Math.sin(a + .4), out: .1 + .025 * Math.sin(a) }, armR: { swing: -.06 * Math.sin(a + .4), out: .1 - .025 * Math.sin(a) },
      cape: { phase: a, amp: .02, flare: .03 + .015 * Math.sin(a), lift: .005 * Math.sin(a) },
    });
  },
};

/* ---------------- run: 16-frame cycle, two steps per loop; frames 0 and 8 are the contact poses ---------------- */
const run: Anim = {
  name: 'run', frames: 16, cols: 8, fps: 24, loop: true, tags: { contactA: [0, 0], contactB: [8, 8] },
  note: 'Running away from the camera. One loop = two steps. Frame 0 = left foot forward, frame 8 = right foot forward.',
  pose(i) {
    const f = (i / 16) * TAU;
    const leg = (ph: number) => ({ thigh: .85 * Math.sin(ph), shin: -.15 - 1.15 * Math.max(0, -Math.sin(ph - .55)) });
    return P({
      y: .03 * (1 - Math.abs(Math.sin(f))) - .005,
      pitch: -.13 - .02 * Math.cos(2 * f), roll: .05 * Math.sin(f), yaw: .13 * Math.sin(f),
      headPitch: .12, headYaw: -.09 * Math.sin(f), headRoll: -.04 * Math.sin(f),
      legL: leg(f), legR: leg(f + Math.PI),
      armL: { swing: -.95 * Math.sin(f), out: .14 }, armR: { swing: .95 * Math.sin(f), out: .14 },
      cape: { phase: f * 2, amp: .03, flare: .07 + .03 * Math.cos(2 * f), lift: .02 + .012 * Math.sin(2 * f) },
    });
  },
};

/* ---------------- jump: 16 frames, tagged so the engine can map physics onto it ---------------- */
// NB: the game already moves the sprite up and down with the jump, so these poses keep the body's own height change small.
const crouch = P({ y: -.05, squash: .87, pitch: -.2, headPitch: .14, legL: { thigh: .95, shin: -1.55 }, legR: { thigh: .95, shin: -1.55 },
  armL: { swing: -.75, out: .16 }, armR: { swing: -.75, out: .16 }, cape: { flare: .12, amp: .02, lift: -.01, phase: 0 } });
const launch = P({ y: 0, squash: 1.05, pitch: -.1, headPitch: .12, legL: { thigh: -.2, shin: -.15 }, legR: { thigh: -.2, shin: -.15 },
  armL: { swing: 2.5, out: .4 }, armR: { swing: 2.5, out: .4 }, cape: { flare: .1, amp: .025, lift: .02, phase: 1 } });
const rise = P({ y: .005, squash: 1.04, pitch: -.14, headPitch: .14, legL: { thigh: -.3, shin: -.95 }, legR: { thigh: -.05, shin: -.7 },
  armL: { swing: 2.6, out: .55 }, armR: { swing: 2.5, out: .5 }, cape: { flare: .13, amp: .03, lift: .03, phase: 2 } });
const apex = P({ y: 0, squash: 1.0, pitch: -.06, headPitch: .05, roll: .04, legL: { thigh: .65, shin: -1.15 }, legR: { thigh: .5, shin: -1.0 },
  armL: { swing: 1.3, out: 1.0 }, armR: { swing: 1.2, out: .95 }, cape: { flare: .14, amp: .035, lift: .04, phase: 3 } });
const fall = P({ y: 0, squash: 1.03, pitch: -.1, headPitch: .1, legL: { thigh: .25, shin: -.3 }, legR: { thigh: .1, shin: -.2 },
  armL: { swing: 2.0, out: .85 }, armR: { swing: 2.1, out: .8 }, cape: { flare: .13, amp: .035, lift: .05, phase: 4 } });
const impact = P({ y: -.06, squash: .82, pitch: -.2, headPitch: .16, legL: { thigh: 1.05, shin: -1.7 }, legR: { thigh: 1.05, shin: -1.7 },
  armL: { swing: .5, out: .35 }, armR: { swing: .5, out: .35 }, cape: { flare: .16, amp: .03, lift: -.02, phase: 5 } });
const rebound = P({ y: .01, squash: 1.04, pitch: -.1, headPitch: .08, armL: { swing: -.2, out: .2 }, armR: { swing: -.2, out: .2 }, cape: { flare: .08, amp: .02, lift: .02, phase: 6 } });
const jump: Anim = {
  name: 'jump', frames: 16, cols: 8, fps: 24, loop: false,
  tags: { takeoff: [0, 2], rise: [3, 5], apex: [6, 8], fall: [9, 11], land: [12, 15] },
  note: 'takeoff→rise while vy > 0, apex near vy = 0, fall while vy < 0 (hold the last fall frame), land plays when it touches down.',
  pose: keyed([[0, crouch], [2, launch], [4, rise], [7, apex], [10, fall], [11, fall], [12, impact], [14, rebound], [15, neutral()]]),
};

/* ---------------- slide: 14 frames ---------------- */
// The slide is turned ~55° toward the camera's side so the legs reading as "feet first" are visible; from dead behind it is just a blob.
const slideHold = (w: number) => P({
  y: -.1 + .008 * w, pitch: .5 + .03 * w, yaw: 1.0, headPitch: -.3, headYaw: -.75, headRoll: .06, roll: .02 * w,
  legL: { thigh: .55, shin: -.05 }, legR: { thigh: 1.0, shin: -1.4 },
  armL: { swing: -1.15, out: .5 }, armR: { swing: .8, out: .35 },
  cape: { flare: .06, amp: .03, lift: .02, phase: 2 + w },
});
const runLike = run.pose(0);
const slide: Anim = {
  name: 'slide', frames: 14, cols: 7, fps: 20, loop: false, tags: { drop: [0, 3], hold: [4, 9], recover: [10, 13] },
  note: 'Slides under low pipes. Total duration should match SLIDE_SECONDS (0.7 s): drop 0.25, hold ~0.4, recover the rest.',
  pose: keyed([[0, runLike], [3, slideHold(0)], [5, slideHold(1)], [7, slideHold(-1)], [9, slideHold(0.5)], [11, P({ y: -.04, pitch: .25, yaw: .45, headPitch: -.15, headYaw: -.3, legL: { thigh: .3, shin: -.3 }, legR: { thigh: .5, shin: -.9 }, armL: { swing: -.5, out: .25 }, armR: { swing: .4, out: .2 }, cape: { flare: .15, amp: .02, lift: .02, phase: 4 } })], [13, runLike]]),
};

export const ANIMS: Anim[] = [idle, run, jump, slide];
