/**
 * Five slides that stay seen from behind the whole time (the mascot runs away from the camera). Each is 14 frames with the same
 * tags as every other slide (drop 0-3, hold 4-9, recover 10-13) and starts and ends in the run pose, so they are interchangeable.
 */
import { P, slideCrouch } from './pose-utils.js';
import type { Pose2D } from './puppet.js';
import type { Puff } from './slide.js';

export interface SlideVariant { id: string; name: string; note: string; pose(i: number): Pose2D }

/** frames 0, 1, 12, 13 are shared (run pose, crouch, crouch, run pose); the variant draws 2–11 */
const scaffold = (middle: (i: number) => Pose2D) => (i: number): Pose2D => {
  if (i === 0) return P({ rot: .03 });
  if (i === 1 || i === 12) return slideCrouch;
  if (i === 13) return P({ rot: .02 });
  return { ...middle(i), headKeep: .75 };
};
/** hold wobble: decays as the slide slows (k = 0..5) */
const wob = (k: number, f = 1.5) => Math.sin(k * f) * (1 - k / 5 * .55);
const fade = (t: number) => 1 - t * .6;

const side = (i: number, t: number, a: number): Puff[] => [0, 1, 2].flatMap(j => [-1, 1].map(s => ({ x: s * (.3 + j * .08 + t * .05), y: -.05 - j * .022, r: .06 + j * .015, a: (.92 - j * .2) * a * fade(t) })));
const burst = (a = 1): Puff[] => [
  { x: -.34, y: -.06, r: .09, a: .9 * a }, { x: -.45, y: -.04, r: .07, a: .8 * a }, { x: .34, y: -.06, r: .09, a: .9 * a }, { x: .45, y: -.04, r: .07, a: .8 * a },
  { x: 0, y: .03, r: .07, a: .85 * a, front: true }, { x: -.14, y: .02, r: .055, a: .8 * a, front: true }, { x: .14, y: .02, r: .055, a: .8 * a, front: true },
];
const frontTrail = (t: number, a = 1): Puff[] => [-1, 0, 1].map(j => ({ x: j * .2, y: .015 + (j === 0 ? .02 : 0), r: .065 + t * .025 + (j === 0 ? .015 : 0), a: (.9 - Math.abs(j) * .12) * a * fade(t), front: true }));

/** 1 · Crouch glide: squashed low and wide, knees out, arms stretched sideways for balance, dust jetting off both sides */
const glide = scaffold(i => {
  if (i === 2) return P({ sy: .78, sx: 1.18, head: { dx: 0, dy: -.04, rot: 0 }, footL: { lift: 0, dx: -.09 }, footR: { lift: 0, dx: .09 }, handL: { x: -.34, y: -.24 }, handR: { x: .34, y: -.24 }, cape: { tipL: -.04, tipR: -.04, mid: -.03, spread: .06 }, fx: { dust: burst(), lines: .5 } });
  if (i === 3) return P({ sy: .62, sx: 1.33, head: { dx: 0, dy: -.055, rot: 0 }, footL: { lift: 0, dx: -.14 }, footR: { lift: 0, dx: .14 }, handL: { x: -.36, y: -.22 }, handR: { x: .36, y: -.22 }, cape: { tipL: -.05, tipR: -.05, mid: -.03, spread: .08 }, fx: { dust: burst(.9), lines: .7 } });
  if (i <= 9) {
    const k = i - 4, t = k / 5, w = wob(k);
    return P({ sy: .56 + .015 * w, sx: 1.4, rot: .03 * w, head: { dx: 0, dy: -.065, rot: -.03 * w }, footL: { lift: 0, dx: -.15 }, footR: { lift: 0, dx: .15 },
      handL: { x: -.36, y: -.21 + .03 * w }, handR: { x: .36, y: -.21 - .03 * w }, cape: { tipL: -.05 + .03 * w, tipR: -.05 - .03 * w, mid: -.02, spread: .08 }, fx: { dust: side(i, t, 1), lines: .7 * (1 - t) } });
  }
  if (i === 10) return P({ sy: .76, sx: 1.2, head: { dx: 0, dy: -.04, rot: 0 }, footL: { lift: 0, dx: -.1 }, footR: { lift: 0, dx: .1 }, handL: { x: -.38, y: -.24 }, handR: { x: .38, y: -.24 }, fx: { dust: side(10, .9, .6) } });
  return P({ sy: .92, sx: 1.06, footL: { lift: 0, dx: -.04 }, footR: { lift: 0, dx: .04 }, handL: { x: -.28, y: -.26 }, handR: { x: .28, y: -.26 }, fx: { dust: side(11, 1, .3) } });
});

/** 2 · Drift: the whole body rolls to one side like a skid on a bike, one hand brushing the floor, shoes sliding out, dust on the low side */
const driftDust = (t: number, a = 1): Puff[] => [0, 1, 2].map(j => ({ x: -.3 - j * .07 - t * .03, y: -.045 - j * .02, r: .06 + j * .02, a: (.9 - j * .22) * a * fade(t) }));
const drift = scaffold(i => {
  if (i === 2) return P({ rot: -.24, sy: .92, sx: 1.05, footL: { lift: 0, dx: -.05 }, footR: { lift: .02, dx: .1 }, handL: { x: -.3, y: -.18 }, handR: { x: .3, y: -.46 }, head: { dx: 0, dy: 0, rot: .12 }, fx: { dust: driftDust(0, .8) } });
  if (i === 3) return P({ rot: -.42, sy: .88, sx: 1.08, footL: { lift: 0, dx: -.08 }, footR: { lift: .03, dx: .13 }, handL: { x: -.3, y: -.14 }, handR: { x: .34, y: -.5 }, head: { dx: 0, dy: 0, rot: .22 }, fx: { dust: driftDust(0, 1), lines: .5 } });
  if (i <= 9) {
    const k = i - 4, t = k / 5, w = wob(k);
    return P({ rot: -.52 + .04 * w, sy: .88, sx: 1.06, footL: { lift: 0, dx: -.1 }, footR: { lift: .03, dx: .15 }, handL: { x: -.3, y: -.12 }, handR: { x: .35, y: -.52 + .04 * w },
      head: { dx: 0, dy: 0, rot: .3 + .03 * w }, cape: { tipL: .03, tipR: -.06 + .03 * w, mid: -.02, spread: .06 }, fx: { dust: driftDust(t), lines: .5 * (1 - t) } });
  }
  if (i === 10) return P({ rot: -.3, sy: .92, footL: { lift: 0, dx: -.06 }, footR: { lift: 0, dx: .08 }, handL: { x: -.3, y: -.2 }, handR: { x: .3, y: -.4 }, head: { dx: 0, dy: 0, rot: .15 }, fx: { dust: driftDust(1, .5) } });
  return P({ rot: -.12, sy: .96, handL: { x: -.26, y: -.24 }, handR: { x: .26, y: -.3 }, head: { dx: 0, dy: 0, rot: .06 }, fx: { dust: driftDust(1, .25) } });
});

/** 3 · Butt slide: sits down and slides on its bottom, legs splayed in a V with the shoes up, hands planted at its sides, dust in front */
const splay = (tilt: number, lift = .05) => ({ footL: { lift, dx: -.04, tilt }, footR: { lift, dx: .04, tilt } });
const butt = scaffold(i => {
  if (i === 2) return P({ sy: .8, sx: 1.15, ...splay(.5, .03), handL: { x: -.3, y: -.18 }, handR: { x: .3, y: -.18 }, fx: { dust: frontTrail(0, .8) } });
  if (i === 3) return P({ sy: .68, sx: 1.25, ...splay(.8), handL: { x: -.34, y: -.1 }, handR: { x: .34, y: -.1 }, head: { dx: 0, dy: -.03, rot: 0 }, cape: { tipL: .03, tipR: .03, mid: 0, spread: .1 }, fx: { dust: frontTrail(0, 1), lines: .4 } });
  if (i <= 9) {
    const k = i - 4, t = k / 5, w = wob(k);
    return P({ sy: .62 + .012 * w, sx: 1.3, rot: .02 * w, ...splay(.85 + .05 * w), handL: { x: -.37, y: -.06 + .01 * w }, handR: { x: .37, y: -.06 - .01 * w },
      head: { dx: 0, dy: -.03, rot: .03 * w }, cape: { tipL: .04, tipR: .04, mid: .01, spread: .12 }, fx: { dust: frontTrail(t), lines: .4 * (1 - t) } });
  }
  if (i === 10) return P({ sy: .78, sx: 1.15, ...splay(.5, .03), handL: { x: -.32, y: -.14 }, handR: { x: .32, y: -.14 }, fx: { dust: frontTrail(1, .5) } });
  return P({ sy: .92, sx: 1.05, ...splay(.2, .01), handL: { x: -.27, y: -.24 }, handR: { x: .27, y: -.24 }, fx: { dust: frontTrail(1, .25) } });
});

/** 4 · Belly slide: dives forward and skids like a penguin, arms stretched out in front (up the screen), shoes trailing behind, dust spraying toward us */
const trailLegs = (lift = .07) => ({ footL: { lift, dx: -.05, tilt: .14 }, footR: { lift, dx: .05, tilt: .14 } });
const belly = scaffold(i => {
  if (i === 2) return P({ sy: .9, sx: 1.06, ...trailLegs(.03), handL: { x: -.26, y: -.8 }, handR: { x: .26, y: -.8 }, head: { dx: 0, dy: .0, rot: 0 }, cape: { tipL: .05, tipR: .05, mid: .02, spread: .04 }, fx: { dust: burst(.8) } });
  if (i === 3) return P({ sy: .8, sx: 1.12, ...trailLegs(.06), handL: { x: -.3, y: -1.12 }, handR: { x: .3, y: -1.12 }, head: { dx: 0, dy: .0, rot: 0 }, cape: { tipL: .08, tipR: .08, mid: .03, spread: .08 }, fx: { dust: frontTrail(0, 1), lines: .8 } });
  if (i <= 9) {
    const k = i - 4, t = k / 5, w = wob(k);
    return P({ sy: .78 + .012 * w, sx: 1.14, ...trailLegs(.07 + .02 * w), handL: { x: -.32, y: -1.18 - .02 * w }, handR: { x: .32, y: -1.18 - .02 * w },
      head: { dx: 0, dy: .0, rot: 0 }, cape: { tipL: .08 + .03 * w, tipR: .08 - .03 * w, mid: .03, spread: .08 }, fx: { dust: frontTrail(t, 1.1), lines: .8 * (1 - t) } });
  }
  if (i === 10) return P({ sy: .9, sx: 1.06, ...trailLegs(.03), handL: { x: -.26, y: -.8 }, handR: { x: .26, y: -.8 }, fx: { dust: frontTrail(1, .5) } });
  return P({ sy: .96, sx: 1.02, handL: { x: -.22, y: -.4 }, handR: { x: .22, y: -.4 }, fx: { dust: frontTrail(1, .25) } });
});

/** 5 · Ninja duck: low crouch with the head sunk into the cape, arms swept back, little quick steps, cape streaming, small puffs at the heels */
const duckPuffs = (k: number, a = 1): Puff[] => [{ x: -.2 + (k % 2) * .4, y: .01, r: .045 + (k % 3) * .01, a: .8 * a, front: true }, { x: .2 - (k % 2) * .4, y: .005, r: .04, a: .6 * a, front: true }];
const duck = scaffold(i => {
  if (i === 2) return P({ sy: .86, sx: 1.06, head: { dx: 0, dy: -.06, rot: 0 }, handL: { x: -.3, y: -.2 }, handR: { x: .3, y: -.2 }, cape: { tipL: -.06, tipR: -.06, mid: -.02, spread: .04 }, fx: { dust: duckPuffs(0), lines: .5 } });
  if (i === 3) return P({ sy: .74, sx: 1.1, head: { dx: 0, dy: -.11, rot: 0 }, footL: { lift: .05, dx: -.03 }, handL: { x: -.33, y: -.17 }, handR: { x: .33, y: -.17 }, cape: { tipL: -.1, tipR: -.1, mid: -.03, spread: .06 }, fx: { dust: duckPuffs(1), lines: .7 } });
  if (i <= 9) {
    const k = i - 4, s = Math.sin(k * 1.6), t = k / 5;
    return P({ sy: .72 + .012 * Math.sin(k * 3.2), sx: 1.1, rot: .045 * s, dy: .004 * Math.abs(s), head: { dx: 0, dy: -.12, rot: -.03 * s },
      footL: { lift: Math.max(0, s) * .075, dx: -.05 }, footR: { lift: Math.max(0, -s) * .075, dx: .05 },
      handL: { x: -.34, y: -.16 + .03 * s }, handR: { x: .34, y: -.16 - .03 * s }, cape: { tipL: -.1 + .03 * s, tipR: -.1 - .03 * s, mid: -.03, spread: .07 }, fx: { dust: duckPuffs(k, 1 - t * .5), lines: .7 * (1 - t * .6) } });
  }
  if (i === 10) return P({ sy: .86, sx: 1.06, head: { dx: 0, dy: -.06, rot: 0 }, handL: { x: -.3, y: -.2 }, handR: { x: .3, y: -.2 }, fx: { dust: duckPuffs(2, .5) } });
  return P({ sy: .95, sx: 1.02, head: { dx: 0, dy: -.02, rot: 0 }, handL: { x: -.25, y: -.26 }, handR: { x: .25, y: -.26 } });
});

export const SLIDE_VARIANTS: SlideVariant[] = [
  { id: '1', name: 'Crouch glide', note: 'squashed low and wide, knees out, arms stretched sideways for balance, dust jetting off both sides', pose: glide },
  { id: '2', name: 'Drift', note: 'the body rolls to one side like a skid, one hand brushing the floor, shoes sliding out, dust on the low side', pose: drift },
  { id: '3', name: 'Butt slide', note: 'sits down and slides on its bottom, legs splayed in a V with the shoes up, hands planted at the sides, dust in front', pose: butt },
  { id: '4', name: 'Belly slide', note: 'dives forward and skids like a penguin, arms stretched out in front, shoes trailing behind, dust spraying toward the camera', pose: belly },
  { id: '5', name: 'Ninja duck', note: 'low crouch with the head sunk into the cape, arms swept back, quick little steps, cape streaming', pose: duck },
];

/* ------------------------------------------------------------------------------------------------------------------------------
 * Crouches: instead of sliding, it ducks under the obstacle (down pressed → crouch → hold low → stand up). Same slot, frames and tags.
 * ---------------------------------------------------------------------------------------------------------------------------- */
const sink = (k: number, f = 1.5) => Math.sin(k * f);                    // a slow breathing wobble while held
const kneesOut = (tilt: number, dx: number, lift = 0) => ({ footL: { lift, dx: -dx, tilt }, footR: { lift, dx, tilt } });
const puffs = (k: number, a = 1): Puff[] => [{ x: -.22 + (k % 2) * .44, y: .012, r: .045 + (k % 3) * .008, a: .75 * a, front: true }];

/** c1 · Squat: a deep squat with the knees out and the hands resting on the knees; it breathes while it waits */
const squat = scaffold(i => {
  if (i === 2) return P({ sy: .84, sx: 1.08, ...kneesOut(.2, .05), handL: { x: -.27, y: -.22 }, handR: { x: .27, y: -.22 }, head: { dx: 0, dy: -.015, rot: 0 }, cape: { tipL: -.02, tipR: -.02, mid: -.01, spread: .05 }, fx: { dust: puffs(0, .8) } });
  if (i === 3) return P({ sy: .72, sx: 1.17, ...kneesOut(.32, .1), handL: { x: -.3, y: -.18 }, handR: { x: .3, y: -.18 }, head: { dx: 0, dy: -.03, rot: 0 }, cape: { tipL: -.03, tipR: -.03, mid: -.01, spread: .08 }, fx: { dust: puffs(1, .6) } });
  if (i <= 9) {
    const k = i - 4, w = sink(k);
    return P({ sy: .66 + .012 * w, sx: 1.22 - .01 * w, rot: .018 * w, ...kneesOut(.36 + .02 * w, .12), handL: { x: -.31, y: -.15 }, handR: { x: .31, y: -.15 },
      head: { dx: 0, dy: -.03 + .006 * w, rot: -.02 * w }, cape: { tipL: -.03 + .02 * w, tipR: -.03 - .02 * w, mid: -.01, spread: .09 } });
  }
  if (i === 10) return P({ sy: .82, sx: 1.1, ...kneesOut(.2, .06), handL: { x: -.28, y: -.2 }, handR: { x: .28, y: -.2 }, head: { dx: 0, dy: -.015, rot: 0 } });
  return P({ sy: .94, sx: 1.03, ...kneesOut(.08, .03), handL: { x: -.25, y: -.25 }, handR: { x: .25, y: -.25 } });
});

/** c2 · Tuck ball: curls up into a round little bundle with the head sunk into the cape, and rocks gently */
const tuck = scaffold(i => {
  if (i === 2) return P({ sy: .84, sx: 1.0, head: { dx: 0, dy: -.045, rot: 0 }, footL: { lift: 0, dx: -.02 }, footR: { lift: 0, dx: .02 }, handL: { x: -.23, y: -.24 }, handR: { x: .23, y: -.24 }, cape: { tipL: -.03, tipR: -.03, mid: 0, spread: .02 } });
  if (i === 3) return P({ sy: .7, sx: 1.0, head: { dx: 0, dy: -.085, rot: 0 }, footL: { lift: 0, dx: -.03 }, footR: { lift: 0, dx: .03 }, handL: { x: -.24, y: -.2 }, handR: { x: .24, y: -.2 }, cape: { tipL: -.04, tipR: -.04, mid: 0, spread: .02 } });
  if (i <= 9) {
    const k = i - 4, w = Math.sin(k * 1.9);
    return P({ sy: .58 + .016 * Math.abs(w), sx: 1.0 + .012 * w, rot: .1 * w, head: { dx: .012 * w, dy: -.1, rot: -.07 * w }, footL: { lift: 0, dx: -.03 }, footR: { lift: 0, dx: .03 },
      handL: { x: -.25, y: -.19 }, handR: { x: .25, y: -.19 }, cape: { tipL: -.04 + .015 * w, tipR: -.04 - .015 * w, mid: 0, spread: .0 } });
  }
  if (i === 10) return P({ sy: .8, sx: 1.0, head: { dx: 0, dy: -.04, rot: 0 }, handL: { x: -.24, y: -.22 }, handR: { x: .24, y: -.22 } });
  return P({ sy: .93, sx: 1.01, head: { dx: 0, dy: -.015, rot: 0 }, handL: { x: -.24, y: -.25 }, handR: { x: .24, y: -.25 } });
});

/** c3 · Duck waddle: stays low and waddles on tiny quick steps, rocking side to side, arms out behind like little wings, cape tail up */
const waddle = scaffold(i => {
  if (i === 2) return P({ sy: .84, sx: 1.06, handL: { x: -.3, y: -.28 }, handR: { x: .3, y: -.28 }, cape: { tipL: -.06, tipR: -.06, mid: -.02, spread: .04 }, head: { dx: 0, dy: -.02, rot: 0 } });
  if (i === 3) return P({ sy: .74, sx: 1.12, head: { dx: 0, dy: -.04, rot: 0 }, footL: { lift: .04, dx: -.04 }, handL: { x: -.34, y: -.3 }, handR: { x: .34, y: -.3 }, cape: { tipL: -.1, tipR: -.1, mid: -.03, spread: .06 } });
  if (i <= 9) {
    const k = i - 4, s = Math.sin(k * 1.7);
    return P({ sy: .72 + .01 * Math.abs(s), sx: 1.12, rot: .085 * s, dy: .006 * Math.abs(s), head: { dx: -.008 * s, dy: -.045, rot: -.07 * s },
      footL: { lift: Math.max(0, s) * .07, dx: -.06 }, footR: { lift: Math.max(0, -s) * .07, dx: .06 },
      handL: { x: -.37, y: -.31 + .035 * s }, handR: { x: .37, y: -.31 - .035 * s }, cape: { tipL: -.12 + .03 * s, tipR: -.12 - .03 * s, mid: -.03, spread: .07 }, fx: { dust: puffs(k, 1 - k / 8) } });
  }
  if (i === 10) return P({ sy: .84, sx: 1.06, handL: { x: -.3, y: -.28 }, handR: { x: .3, y: -.28 }, cape: { tipL: -.06, tipR: -.06, mid: -.02, spread: .04 } });
  return P({ sy: .95, sx: 1.02, handL: { x: -.26, y: -.27 }, handR: { x: .26, y: -.27 } });
});

/** c4 · Cover head: ducks and throws both arms up over its head to protect it, trembling a little */
const cover = scaffold(i => {
  if (i === 2) return P({ sy: .84, sx: 1.07, ...kneesOut(.18, .05), handL: { x: -.2, y: -.7 }, handR: { x: .2, y: -.7 }, head: { dx: 0, dy: -.02, rot: 0 }, cape: { tipL: -.02, tipR: -.02, mid: 0, spread: .05 } });
  if (i === 3) return P({ sy: .74, sx: 1.14, ...kneesOut(.26, .08), handL: { x: -.2, y: -.96 }, handR: { x: .2, y: -.96 }, head: { dx: 0, dy: -.04, rot: 0 }, cape: { tipL: -.03, tipR: -.03, mid: 0, spread: .07 } });
  if (i <= 9) {
    const k = i - 4, tr = Math.sin(k * 4.2) * .02;
    return P({ sy: .7, sx: 1.16, rot: tr, ...kneesOut(.28, .09), handL: { x: -.17, y: -1.0 - tr }, handR: { x: .17, y: -1.0 + tr },
      head: { dx: 0, dy: -.045, rot: -tr * 2 }, cape: { tipL: -.03, tipR: -.03, mid: 0, spread: .08 } });
  }
  if (i === 10) return P({ sy: .84, sx: 1.07, ...kneesOut(.16, .05), handL: { x: -.2, y: -.72 }, handR: { x: .2, y: -.72 }, head: { dx: 0, dy: -.02, rot: 0 } });
  return P({ sy: .95, sx: 1.02, handL: { x: -.24, y: -.4 }, handR: { x: .24, y: -.4 } });
});

/** c5 · Frog crouch: feet planted wide, hands down on the floor between them, head up, a little hop-bob while waiting */
const frog = scaffold(i => {
  if (i === 2) return P({ sy: .84, sx: 1.1, ...kneesOut(.3, .1), handL: { x: -.26, y: -.12 }, handR: { x: .26, y: -.12 }, head: { dx: 0, dy: .0, rot: 0 }, cape: { tipL: .01, tipR: .01, mid: 0, spread: .04 } });
  if (i === 3) return P({ sy: .72, sx: 1.2, ...kneesOut(.5, .17), handL: { x: -.3, y: -.05 }, handR: { x: .3, y: -.05 }, head: { dx: 0, dy: .015, rot: 0 }, cape: { tipL: .03, tipR: .03, mid: .01, spread: .05 } });
  if (i <= 9) {
    const k = i - 4, hop = Math.max(0, Math.sin(k * 2.1)), w = Math.sin(k * 1.4);
    return P({ sy: .68 + .02 * hop, sx: 1.2 - .02 * hop, dy: .03 * hop, rot: .02 * w, ...kneesOut(.52 - .08 * hop, .18 - .03 * hop, .03 * hop),
      handL: { x: -.31, y: -.05 + .02 * hop }, handR: { x: .31, y: -.05 + .02 * hop }, head: { dx: 0, dy: .02 + .01 * hop, rot: .035 * w }, cape: { tipL: .03 - .04 * hop, tipR: .03 - .04 * hop, mid: .01, spread: .05 }, fx: { dust: hop > .9 ? puffs(k, .7) : [] } });
  }
  if (i === 10) return P({ sy: .84, sx: 1.1, ...kneesOut(.3, .1), handL: { x: -.18, y: -.14 }, handR: { x: .18, y: -.14 } });
  return P({ sy: .95, sx: 1.03, ...kneesOut(.1, .04), handL: { x: -.24, y: -.25 }, handR: { x: .24, y: -.25 } });
});

export const CROUCH_VARIANTS: SlideVariant[] = [
  { id: 'c1', name: 'Squat', note: 'a deep squat, knees out, hands resting on the knees, breathing while it waits', pose: squat },
  { id: 'c2', name: 'Tuck ball', note: 'curls into a round bundle with the head sunk into the cape, rocking gently', pose: tuck },
  { id: 'c3', name: 'Duck waddle', note: 'stays low and waddles on tiny quick steps, rocking side to side, arms out behind like wings, cape tail up', pose: waddle },
  { id: 'c4', name: 'Cover head', note: 'ducks and throws both arms up over its head, trembling a little', pose: cover },
  { id: 'c5', name: 'Frog crouch', note: 'feet planted wide, hands down between them, head up, a little hop-bob', pose: frog },
];
