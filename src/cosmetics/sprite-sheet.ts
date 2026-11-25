/**
 * A custom skin drawn as a picture rather than in code: a sprite sheet with one row per animation (idle / run / jump / slide)
 * and one frame per cell, 16 cells a row (shorter rows leave cells empty), laid out like design/mascot-sprite.png. Where the
 * feet stand in a cell and how big the character is are given as fractions of the cell's height, so any size of sheet works.
 */
import type { PixelAnim } from '../render/pixel-frames.js';

const COLS = 16, ROWS = 4;
const ROW: Record<PixelAnim, number> = { idle: 0, run: 1, jump: 2, slide: 3 };

export interface SpriteLayout {
  /** how far down the cell the feet stand (0 top … 1 bottom); design/mascot-sprite.png: 250 / 300 */
  feet: number;
  /** one game unit (the mascot is about 1.1 tall) as a fraction of the cell's height; design/mascot-sprite.png: 200 / 300 */
  unit: number;
}
export const MASCOT_SPRITE_LAYOUT: SpriteLayout = { feet: 250 / 300, unit: 200 / 300 };

export interface SpriteSheet {
  /** the picture, once it has loaded (null until then, and always outside a browser) */
  img: HTMLImageElement | null;
  /** resolves when the picture is ready to draw */
  ready: Promise<void>;
  layout: SpriteLayout;
}

export function spriteSheet(url: string, layout: SpriteLayout = MASCOT_SPRITE_LAYOUT): SpriteSheet {
  const sheet: SpriteSheet = { img: null, ready: Promise.resolve(), layout };
  if (typeof Image === 'undefined') return sheet;
  const img = new Image();
  img.src = url;
  sheet.ready = img.decode().then(() => { sheet.img = img; }, () => { /* a missing picture leaves the drawn mascot */ });
  return sheet;
}

/** frame `i` of `anim` from a loaded sheet: where it is on the picture and its box in game units around the feet */
export function spriteFrame(sheet: SpriteSheet & { img: HTMLImageElement }, anim: PixelAnim, i: number) {
  const { img, layout } = sheet, w = img.naturalWidth / COLS, h = img.naturalHeight / ROWS, feet = layout.feet * h, unit = layout.unit * h;
  return {
    sx: i * w, sy: ROW[anim] * h, w, h, unit,
    box: [-w / 2 / unit, -feet / unit, w / 2 / unit, (h - feet) / unit] as [number, number, number, number],
  };
}
