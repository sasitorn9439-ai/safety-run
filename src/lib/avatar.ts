import { AV_C, avParts, type AvatarParts } from '../../shared/avatar.js';
import { drawFrontHead, drawFrontShoulders } from '../cosmetics/front.js';
import { DEFAULT_PALETTE } from '../cosmetics/skins.js';
import type { Look } from '../cosmetics/types.js';
import { lookOfWorn } from '../cosmetics/wardrobe.js';
import type { Ctx } from '../render/draw.js';
export { avName } from '../../shared/avatar.js';

function glyph(c: CanvasRenderingContext2D, g: number, r: number) {
  c.fillStyle = '#fff'; c.strokeStyle = '#fff'; c.lineCap = 'round'; c.lineJoin = 'round'; c.lineWidth = r * 0.16;
  const P = () => c.beginPath();
  if (g === 0) { P(); c.arc(0, r * .15, r * .62, Math.PI, 0); c.fill(); c.fillRect(-r * .82, r * .12, r * 1.64, r * .22); }
  if (g === 1) { P(); c.roundRect(-r * .32, -r * .6, r * .66, r * 1.1, r * .28); c.fill(); P(); c.roundRect(-r * .66, -r * .12, r * .36, r * .5, r * .16); c.fill(); }
  if (g === 2) { for (const s of [-1, 1]) { P(); c.arc(s * r * .4, r * .05, r * .3, 0, 7); c.stroke(); } P(); c.moveTo(-r * .1, 0); c.lineTo(r * .1, 0); c.stroke(); }
  if (g === 3) { P(); c.arc(0, r * .1, r * .52, Math.PI * 1.08, Math.PI * 1.92); c.stroke(); for (const s of [-1, 1]) { P(); c.roundRect(s * r * .52 - r * .2, -r * .05, r * .4, r * .58, r * .16); c.fill(); } }
  if (g === 4) { P(); c.moveTo(-r * .5, -r * .6); c.lineTo(r * .05, -r * .6); c.lineTo(r * .05, 0); c.lineTo(r * .62, r * .12); c.lineTo(r * .62, r * .52); c.lineTo(-r * .5, r * .52); c.closePath(); c.fill(); }
  if (g === 5) { P(); c.moveTo(0, -r * .7); c.lineTo(r * .42, r * .45); c.lineTo(-r * .42, r * .45); c.closePath(); c.fill(); c.fillRect(-r * .62, r * .42, r * 1.24, r * .18); }
  if (g === 6) { P(); c.roundRect(-r * .3, -r * .42, r * .6, r * 1.05, r * .2); c.fill(); c.fillRect(-r * .1, -r * .68, r * .2, r * .3); P(); c.moveTo(r * .08, -r * .58); c.lineTo(r * .5, -r * .7); c.stroke(); }
  if (g === 7) { c.fillRect(-r * .2, -r * .62, r * .4, r * 1.24); c.fillRect(-r * .62, -r * .2, r * 1.24, r * .4); }
  if (g === 8) { P(); c.moveTo(r * .15, -r * .75); c.lineTo(-r * .45, r * .1); c.lineTo(-r * .02, r * .1); c.lineTo(-r * .18, r * .75); c.lineTo(r * .45, -r * .12); c.lineTo(r * .02, -r * .12); c.closePath(); c.fill(); }
  if (g === 9) { P(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? r * .3 : r * .72; c.lineTo(Math.cos(a) * q, Math.sin(a) * q); } c.closePath(); c.fill(); }
  if (g === 10) { P(); c.moveTo(0, -r * .7); c.lineTo(r * .55, -r * .45); c.lineTo(r * .5, r * .1); c.quadraticCurveTo(r * .35, r * .55, 0, r * .75); c.quadraticCurveTo(-r * .35, r * .55, -r * .5, r * .1); c.lineTo(-r * .55, -r * .45); c.closePath(); c.fill(); }
  if (g === 11) { c.save(); c.rotate(-Math.PI / 4); c.fillRect(-r * .12, -r * .15, r * .24, r * .9); P(); c.arc(0, -r * .35, r * .32, 0, 7); c.fill(); c.globalCompositeOperation = 'destination-out'; c.fillRect(-r * .1, -r * .72, r * .2, r * .34); c.restore(); }
}

/** the badge's ring: silver or gold for the framed avatars, none for the rest */
const ringColor = (p: AvatarParts) => p.f === 2 ? '#ffd400' : p.f === 1 ? '#dfe6ee' : 'rgba(0,0,0,0)';

/** the plain avatar: the player's glyph on their colour */
function badge(c: Ctx, p: AvatarParts | null, R: number, size: number) {
  if (!p) { c.fillStyle = '#3a3f48'; c.beginPath(); c.arc(0, 0, R, 0, 7); c.fill(); return; }
  c.fillStyle = ringColor(p); c.beginPath(); c.arc(0, 0, R, 0, 7); c.fill();
  c.fillStyle = AV_C[p.c]![0]; c.beginPath(); c.arc(0, 0, p.f ? R * .86 : R, 0, 7); c.fill();
  const g = document.createElement('canvas');
  g.width = g.height = size;
  const gc = g.getContext('2d')!;
  gc.translate(R, R);
  glyph(gc, p.g, R * .62);
  c.drawImage(g, -R, -R);
}

/** the head-and-shoulders part of the mascot an avatar shows, in head coordinates */
const VIEW_Y = -.71, VIEW_R = .48;
/** how big the effect is drawn next to the head: its orbits and rising particles land in the ring between the head and the edge */
const FX_SCALE = .8;

/** an effect plays as a strip of this many frames, one loop of the effect, cycled by CSS (.av-fx in styles.css) */
export const FX_FRAMES = 16;

/**
 * The dressed avatar at moment `t` (0…1) of its effect's loop: the mascot's head from the front in what the player wears, on
 * the player's own colour and frame (so two players in the same outfit still look different). The effect plays small behind
 * the head, inside the circle.
 */
function dressed(c: Ctx, p: AvatarParts | null, look: Look, R: number, t: number) {
  const inner = p?.f ? R * .86 : R;
  if (p) { c.fillStyle = ringColor(p); c.beginPath(); c.arc(0, 0, R, 0, 7); c.fill(); }
  c.fillStyle = p ? AV_C[p.c]![0] : '#3a3f48'; c.beginPath(); c.arc(0, 0, inner, 0, 7); c.fill();
  c.save(); c.beginPath(); c.arc(0, 0, inner, 0, 7); c.clip();
  const k = inner / VIEW_R;
  c.scale(k, k);
  // a trail left under the feet would fall outside the circle: lift those effects so the trail shows over the chest
  const fx = look.effect, phases = [t, (t + .5) % 1], lift = fx?.below ? fx.below * .7 : 0;
  // the effect around the whole body, made smaller and centred on the head, at two moments of its loop half a loop apart so a
  // sparse effect still shows; what sits behind the body is drawn first, then the shoulders, then what sits in front, then the head
  const effect = (part: 'back' | 'front') => {
    const draw = fx?.[part];
    if (!draw) return;
    for (const ph of phases) { c.save(); c.scale(FX_SCALE, FX_SCALE); c.translate(0, .45 - lift); draw(c, ph, -.45); c.restore(); }
  };
  effect('back');
  c.save(); c.translate(0, -VIEW_Y); drawFrontShoulders(c, look.pal); c.restore();
  effect('front');
  c.translate(0, -VIEW_Y);
  drawFrontHead(c, look);
  c.restore();
}

/** an avatar image: one frame, or `frames` frames side by side when its effect plays */
export interface AvatarArt { url: string; frames: number }
const cache = new WeakMap<Look, Map<string, AvatarArt>>();

/**
 * Avatar as a PNG data URL (cached). `size` is in device pixels. `worn` is what the player wears (cosmetic slot → item id):
 * with nothing on, the avatar is the plain badge; with anything on, it is the mascot's head dressed in it, and with an effect
 * on, a strip of FX_FRAMES frames of it.
 */
export function avatarArt(n: number | null | undefined, size = 96, worn?: unknown): AvatarArt {
  const look = lookOfWorn(worn), key = `${n}:${size}`;
  let byKey = cache.get(look);
  if (!byKey) cache.set(look, byKey = new Map());
  const hit = byKey.get(key);
  if (hit) return hit;
  const frames = look.effect ? FX_FRAMES : 1, cv = document.createElement('canvas');
  cv.width = size * frames; cv.height = size;
  const c = cv.getContext('2d')!, R = size / 2, p = avParts(n);
  for (let f = 0; f < frames; f++) {
    c.setTransform(1, 0, 0, 1, f * size + R, R);
    if (look.pal === DEFAULT_PALETTE && !look.hat && !look.effect) badge(c, p, R, size);
    else dressed(c, p, look, R, f / frames);
  }
  const art = { url: cv.toDataURL(), frames };
  byKey.set(key, art);
  return art;
}

/** shows `art` in an <img>: a strip plays through its frames (styles.css .av-fx), a single frame just shows */
export function setAvatarImg(img: HTMLImageElement, art: AvatarArt) {
  img.src = art.url;
  img.classList.toggle('av-fx', art.frames > 1);
}

export const avImg = (n: number | null | undefined, size: number, worn?: unknown) => {
  const art = avatarArt(n, size * 2, worn);
  return `<img class="av${art.frames > 1 ? ' av-fx' : ''}" src="${art.url}" width="${size}" height="${size}" alt="">`;
};
