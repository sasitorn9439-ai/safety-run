/**
 * Cosmetics only change how the flat mascot is painted. They never touch a pose, a frame count or a tag, so every jump, slide
 * and crouch plays exactly as it does without them: a skin recolours the parts, a hat is drawn in the head's own transform (it
 * tips, squashes and slides with the head), and an effect is drawn around the body in the same frame.
 *
 * Coordinates are the puppet's (src/render/flat/puppet.ts): 1 = one game unit, origin = the feet, y grows downward.
 */
import type { Ctx } from '../render/draw.js';

export type Slot = 'skin' | 'hat' | 'effect';
export const SLOTS: readonly Slot[] = ['skin', 'hat', 'effect'];
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export const RARITIES: readonly Rarity[] = ['common', 'rare', 'epic', 'legendary'];

/** every colour the mascot is painted with */
export interface Palette {
  body: string; sleeve: string; edge: string;
  capeD: string; capeL: string; mitt: string; shoeD: string; shoeL: string;
  head: string; headEdge: string;
  gemL: string; gemR: string; gemHi: string; gemEdge: string;
}

interface Base { id: string; name: string; rarity: Rarity }
/**
 * A custom skin: what turns the mascot into another character (no crystal on its head), with parts drawn with the body, so
 * they lean, squash and tuck with it.
 * `head` is in head coordinates (like a hat, drawn before the hat); `back` is in body coordinates over the cape (the camera
 * sees the mascot's back, so a tail points toward it). `t` is the frame's place in its animation.
 */
export interface Figure { head?(c: Ctx, t: number): void; back?(c: Ctx, t: number): void; front?: FrontFigure }
/** a custom skin's head seen from the front (avatars only; the game shows the back) */
export interface FrontFigure {
  /** behind the head (spikes, ears, a mane) */
  behind?(c: Ctx): void;
  /** on the face, clipped to the head, under the eyes (a mask, a muzzle) */
  skin?(c: Ctx): void;
  /** over the face (a horn, a beak, a headband) */
  over?(c: Ctx): void;
  eyes?: 'led' | 'big';
  mouth?: false;
}
export interface Skin extends Base { slot: 'skin'; pal: Palette; figure?: Figure }
/** drawn right after the head, in head coordinates: the head spans y −0.865…−0.44 and x ±0.27, its crystal reaches up to y −0.995 */
export interface Hat extends Base { slot: 'hat'; draw(c: Ctx): void; /** the hat from the front, when it differs from the back (avatars) */ front?(c: Ctx): void }
/**
 * `t` is the frame's place in its animation (0…1, wraps for the run and idle loops). Effects repeat with period 1/n for an
 * n-fold pattern, so a fast run loop still reads as a calm drift. `cy` is the height of the body's centre (negative = up).
 */
export interface Effect extends Base {
  slot: 'effect'; back?(c: Ctx, t: number, cy: number): void; front?(c: Ctx, t: number, cy: number): void;
  /** how far below the feet it draws, when that is more than the usual 0.34 (a trail that reaches toward the camera) */
  below?: number;
  /** how far above the feet it draws, when that is more than the usual 1.42 (a beam of light pouring down from the sky) */
  above?: number;
  /**
   * Rings round the body that sweep up and down it on their own, slower clock (RING_MS in effects.ts), not the animation's:
   * `back` and `front` leave them out, and whoever draws the mascot draws these with `t` from ringPhase. They sit at the body's
   * height `cy` like the rest.
   */
  ring?: { back(c: Ctx, t: number, cy: number): void; front(c: Ctx, t: number, cy: number): void };
  /**
   * How it looks in an avatar, when that differs from the game: drawn behind the mascot's head and shoulders in place of the
   * rest, `t` 0…1 over the avatar's loop. Coordinates: the avatar circle has radius 0.48 around (0, 0), in body units.
   */
  avatar?(c: Ctx, t: number): void;
}
export type Cosmetic = Skin | Hat | Effect;

/** What the mascot wears right now. */
export interface Look { pal: Palette; hat: Hat | null; effect: Effect | null; figure?: Figure | null }
