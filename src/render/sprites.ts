import type { HazardKind, PpeType } from '../../shared/hazards.js';
import type { PowerType } from '../../shared/sim.js';
import { HAZARD_KINDS, PPE } from '../../shared/hazards.js';
import { HAZARD_BOX, drawCoin, drawCrate, drawLiftPlatform, drawPowerBadge, drawDot, drawHalo, drawHazard, drawLight, drawMascotRun, drawMascotSlide, drawPillar, drawPpeBadge, drawShadow, drawShield, type Ctx } from './draw.js';
import { RUN_FRAMES, SLIDE_FRAMES } from './fx.js';

export const PAD = 2;
export type Box = readonly [x0: number, y0: number, x1: number, y1: number];

/**
 * A piece of art: where its edges are (in art units, origin = anchor point) and how to draw it at `u` pixels per unit.
 * `scale` says how big to rasterise it relative to the corridor's lane width (art that is seen up close needs more pixels).
 */
export interface Art { box: Box; draw: (c: Ctx, u: number) => void; scale: number; mips: boolean }

const OBJ = 1.35, MASCOT = 1.1;
export const hazardArt = (k: HazardKind, blink = false): Art => ({ box: HAZARD_BOX[k], draw: (c, u) => drawHazard(c, k, u, blink), scale: OBJ, mips: true });
export const ppeArt = (t: PpeType): Art => ({ box: [-.4, -.4, .4, .4], draw: (c, u) => drawPpeBadge(c, t, u), scale: OBJ, mips: true });
export const POWERS: readonly PowerType[] = ['estop', 'broom', 'lift', 'firstaid', 'toolbox'];
export const powerArt = (t: PowerType): Art => ({ box: [-.46, -.46, .46, .46], draw: (c, u) => drawPowerBadge(c, t, u), scale: OBJ, mips: true });
export const liftArt: Art = { box: [-.46, -.04, .46, 1.4], draw: drawLiftPlatform, scale: MASCOT, mips: false };
/** hazards that have a second look (the `blink` flag in the draw list) */
export const ON_KINDS: readonly HazardKind[] = ['forklift', 'drop', 'sparks'];
export const crateArt: Art = { box: [-.44, -1.16, .44, .02], draw: drawCrate, scale: OBJ, mips: true };
export const coinArt: Art = { box: [-.25, -.25, .25, .25], draw: drawCoin, scale: OBJ, mips: true };
export const haloArt: Art = { box: [-1, -1, 1, 1], draw: drawHalo, scale: .5, mips: true };
export const shadowArt: Art = { box: [-.5, -.12, .5, .12], draw: drawShadow, scale: OBJ, mips: true };
export const pillarArt: Art = { box: [-.19, -7.2, .19, 0], draw: drawPillar, scale: .5, mips: true };
export const lightArt: Art = { box: [-1.1, -.28, 1.1, .28], draw: drawLight, scale: .5, mips: true };
export const shieldArt: Art = { box: [-.45, -.7, .45, .7], draw: drawShield, scale: MASCOT, mips: false };
export const dotArt: Art = { box: [-.5, -.5, .5, .5], draw: drawDot, scale: .12, mips: false };
// the mascot is always near z=0, so it doesn't need a mip chain
export const runArt = (i: number): Art => ({ box: [-.4, -1.0, .4, .03], draw: (c, u) => { c.scale(u, u); drawMascotRun(c, i / RUN_FRAMES * Math.PI * 2); }, scale: MASCOT, mips: false });
export const slideArt = (i: number): Art => ({ box: [-.5, -.95, .5, .06], draw: (c, u) => { c.scale(u, u); drawMascotSlide(c, i / (SLIDE_FRAMES - 1)); }, scale: MASCOT, mips: false });

/** Draws the art once into a canvas. `unit` = canvas pixels per art unit. */
export function rasterize(art: Art, unit: number): HTMLCanvasElement {
  const { box } = art;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil((box[2] - box[0]) * unit) + PAD * 2;
  canvas.height = Math.ceil((box[3] - box[1]) * unit) + PAD * 2;
  const c = canvas.getContext('2d')!;
  c.translate(PAD - box[0] * unit, PAD - box[1] * unit);
  art.draw(c, unit);
  return canvas;
}

/**
 * Canvas2D sprite: the art kept at several sizes (a mip chain) so far-away copies are downscaled by at most 2×.
 * Only the fallback renderer needs this; on WebGL the GPU makes the mips.
 */
export class Sprite {
  private levels: { canvas: HTMLCanvasElement; unit: number }[] = [];

  constructor(private box: Box, art: Art, baseUnit: number, mips = 1) {
    for (let i = 0; i < mips; i++) {
      const unit = baseUnit / 2 ** i;
      if (i > 0 && unit < 8) break;
      this.levels.push({ canvas: rasterize(art, unit), unit });
    }
  }

  /** Draws with the art's origin at (x, y). `u` = CSS pixels per art unit, `dpr` = device pixels per CSS pixel. */
  draw(ctx: CanvasRenderingContext2D, x: number, y: number, u: number, dpr: number) {
    const need = u * dpr;
    let lv = this.levels[0]!;
    for (let i = this.levels.length - 1; i > 0; i--) {
      if (this.levels[i]!.unit >= need) { lv = this.levels[i]!; break; }
    }
    const k = u / lv.unit;
    ctx.drawImage(lv.canvas, x + (this.box[0] - PAD / lv.unit) * u, y + (this.box[1] - PAD / lv.unit) * u, lv.canvas.width * k, lv.canvas.height * k);
  }
}

export class SpriteSet {
  hazards = {} as Record<HazardKind, Sprite>;
  /** the lit variant of a hazard: forklift lights, a locked drop mark, a live arc */
  on = {} as Partial<Record<HazardKind, Sprite>>;
  crate: Sprite;
  ppe = {} as Record<PpeType, Sprite>;
  run: Sprite[] = [];
  slide: Sprite[] = [];
  shadow: Sprite;
  halo: Sprite;
  coin: Sprite;
  power = {} as Record<PowerType, Sprite>;
  lift: Sprite;
  pillar: Sprite;
  light: Sprite;

  constructor(lw: number, dpr: number) {
    const mk = (art: Art) => new Sprite(art.box, art, lw * dpr * art.scale, art.mips ? 5 : 1);
    for (const k of HAZARD_KINDS) this.hazards[k] = mk(hazardArt(k));
    for (const k of ON_KINDS) this.on[k] = mk(hazardArt(k, true));
    this.crate = mk(crateArt);
    for (const t of PPE) this.ppe[t] = mk(ppeArt(t));
    this.shadow = mk(shadowArt);
    this.halo = mk(haloArt);
    this.coin = mk(coinArt);
    for (const t of POWERS) this.power[t] = mk(powerArt(t));
    this.lift = mk(liftArt);
    this.pillar = mk(pillarArt);
    this.light = mk(lightArt);
    for (let i = 0; i < RUN_FRAMES; i++) this.run.push(mk(runArt(i)));
    for (let i = 0; i < SLIDE_FRAMES; i++) this.slide.push(mk(slideArt(i)));
  }
}
