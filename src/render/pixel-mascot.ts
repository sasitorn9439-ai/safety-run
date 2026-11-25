/**
 * The mascot sets the game can draw. All are drawn as vectors (so they stay sharp at any size or DPR), rasterised to a texture
 * per frame at the size the screen needs:
 *   'flat'    the flat 2D mascot (head, cape, mitts, shoes), drawn by code (src/render/flat/), the default
 *   'smooth'  the stubby mascot as smooth outlined curves   (assets/mascot-vector/vector.json)
 *   'pixel'   the stubby mascot as exact pixel rectangles   (assets/mascot-pixel/vector.json)
 * Each set says how many frames it has and which ranges are takeoff/rise/…/recover (FrameConfig), so the frame picker is generic.
 */
import { DEFAULT_LOOK } from '../cosmetics/skins.js';
import type { Look } from '../cosmetics/types.js';
import type { Ctx } from './draw.js';
import { DEFAULT_SLIDE, type SlideId } from './flat/ids.js';
import type { FrameConfig, PixelAnim, Range } from './pixel-frames.js';
import type { Art } from './sprites.js';

export type MascotStyle = 'flat' | 'smooth' | 'pixel';

export interface MascotSet {
  style: MascotStyle;
  cfg: FrameConfig;
  /** pixel art must not be smoothed when it is drawn */ crisp: boolean;
  count(anim: PixelAnim): number;
  /** how to rasterise for a lane width of `base` device pixels (the Art scale) */ scaleFor(base: number): number;
  art(anim: PixelAnim, i: number, scale: number): Art;
  /** what the flat mascot wears (the other sets ignore it); change it through the renderer's setLook so the frames are redrawn */
  look: Look;
}

/**
 * The flat frames' cell, in game units around the feet: the 384 px cell they were designed in (300 px per unit, feet at 192, 330),
 * taller when a hat sits on the crystal, wider and deeper when an effect surrounds the body. Only the paint changes; the anchor
 * (the feet) stays put, so the mascot stands and moves exactly where it always does.
 */
export function flatBox(look: Look): Art['box'] {
  const top = Math.min(look.hat ? -1.5 : -330 / 300, look.effect ? -1.42 : 0);
  return look.effect ? [-.75, top, .75, Math.max(.34, look.effect.below ?? 0)] : [-192 / 300, top, 192 / 300, 54 / 300];
}

type Layer = [fill: string, d: string, stroke?: string, strokeWidth?: number];
type Frames = Record<PixelAnim, Layer[][]>;
const ANIMS: PixelAnim[] = ['idle', 'run', 'jump', 'slide'];

function configFrom(counts: Record<PixelAnim, number>, tags: Record<string, Range>, idleMs: number): FrameConfig {
  const t = (k: string) => tags[k] as Range;
  return {
    idle: counts.idle, idleMs, run: counts.run, metresPerLoop: 6.28,
    jump: { takeoff: t('takeoff'), rise: t('rise'), apex: t('apex'), fall: t('fall'), land: t('land') },
    slide: { drop: t('drop'), hold: t('hold'), recover: t('recover') },
  };
}

const paths = new Map<Layer[], Path2D[]>();
const pathsOf = (layers: Layer[]) => {
  let p = paths.get(layers);
  if (!p) { p = layers.map(l => new Path2D(l[1])); paths.set(layers, p); }
  return p;
};

interface Vector { cell: { w: number; h: number }; anchor: { x: number; y: number }; unit: number; animations: Frames }
interface Meta { animations: Record<string, { frames: number; tags: Record<string, Range> }> }

async function loadVector(style: 'smooth' | 'pixel'): Promise<MascotSet> {
  const [vec, meta] = (style === 'pixel'
    ? await Promise.all([import('../../assets/mascot-pixel/vector.json'), import('../../assets/mascot-pixel/mascot.json')])
    : await Promise.all([import('../../assets/mascot-vector/vector.json'), import('../../assets/mascot-vector/mascot.json')])
  ).map(m => m.default) as unknown as [Vector, Meta];
  const m = meta.animations;
  const tags = { ...m.jump!.tags, ...m.slide!.tags };
  const counts = Object.fromEntries(ANIMS.map(a => [a, vec.animations[a].length])) as Record<PixelAnim, number>;
  return {
    style, crisp: style === 'pixel', cfg: configFrom(counts, tags, 166), look: DEFAULT_LOOK,
    count: a => vec.animations[a].length,
    // pixel art: a whole number of texture pixels per art pixel (no seams, no uneven pixels); smooth: simply 1:1
    scaleFor: base => { if (style === 'smooth') return 1; const k = Math.max(1, Math.round(base / vec.unit)); return vec.unit * k / base; },
    art(anim, i, scale) {
      const layers = vec.animations[anim][i]!;
      return {
        box: [-vec.anchor.x / vec.unit, -vec.anchor.y / vec.unit, (vec.cell.w - vec.anchor.x) / vec.unit, (vec.cell.h - vec.anchor.y) / vec.unit],
        draw(c: Ctx, u: number) {
          const k = u / vec.unit;                        // pixels per art unit
          const ps = pathsOf(layers);                     // built on first draw
          c.save(); c.scale(k, k); c.translate(-vec.anchor.x, -vec.anchor.y);
          c.lineJoin = 'round'; c.lineCap = 'round';
          layers.forEach(([fill, , stroke, sw], j) => {
            if (fill && fill !== 'none') { c.fillStyle = fill; c.fill(ps[j]!); }
            if (stroke) { c.strokeStyle = stroke; c.lineWidth = sw ?? 1; c.stroke(ps[j]!); }
          });
          c.restore();
        },
        scale, mips: false,
      };
    },
  };
}

async function loadFlat(slide: SlideId): Promise<MascotSet> {
  const [{ animsWith }, { drawPuppet }, { drawSideSlide }] = await Promise.all([import('./flat/anims.js'), import('./flat/puppet.js'), import('./flat/slide.js')]);
  const sets = animsWith(slide);
  const by = Object.fromEntries(sets.map(a => [a.name, a])) as Record<PixelAnim, (typeof sets)[number]>;
  const counts = Object.fromEntries(ANIMS.map(a => [a, by[a].frames])) as Record<PixelAnim, number>;
  const tags = { ...by.jump.tags, ...by.slide.tags } as Record<string, Range>;
  const set: MascotSet = {
    style: 'flat', crisp: false, cfg: configFrom(counts, tags, 100), look: DEFAULT_LOOK,
    count: a => by[a].frames, scaleFor: () => 1,
    art(anim, i, scale) {
      const pose = by[anim].pose(i), look = set.look, t = i / by[anim].frames;
      return {
        box: flatBox(look),
        draw(c: Ctx, u: number) {
          c.save(); c.scale(u, u);
          if ('side' in pose) drawSideSlide(c, pose.side, look, t); else drawPuppet(c, pose, look, t);
          c.restore();
        },
        scale, mips: false,
      };
    },
  };
  return set;
}

/** Loads a set on demand (each is its own chunk), so devices that don't use it never download it. `slide` picks the flat set's down-key animation (default: the Tuck ball crouch). */
export function loadMascot(style: MascotStyle = 'flat', slide: SlideId = DEFAULT_SLIDE): Promise<MascotSet> {
  return style === 'flat' ? loadFlat(slide) : loadVector(style);
}
