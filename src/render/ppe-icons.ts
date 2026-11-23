/**
 * The PPE icons as flat vector illustrations: clean shapes, flat colours with one shade tone, a thin dark outline.
 * Each icon is a list of layers (SVG path data in a 100 × 100 box), so the same data is exported as SVG files
 * (tools/ppe-svg → assets/ppe/svg/) and drawn in the game with Path2D.
 */
import type { Ctx } from './draw.js';

export type PpeIconName = 'helmet' | 'glasses' | 'gloves' | 'earmuffs' | 'mask' | 'boots' | 'vest' | 'firstaid';
export interface IconLayer { name: string; d: string; fill?: string; stroke?: string; sw?: number; cap?: 'round' }

export const INK = '#3b2a10';

/* ---- path helpers: only M L H V C Q A Z, so Path2D and SVG read them identically ---- */
const n = (v: number) => +v.toFixed(2);
export const rr = (x: number, y: number, w: number, h: number, r: number) =>
  `M${n(x + r)} ${n(y)}H${n(x + w - r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + w)} ${n(y + r)}V${n(y + h - r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + w - r)} ${n(y + h)}H${n(x + r)}A${n(r)} ${n(r)} 0 0 1 ${n(x)} ${n(y + h - r)}V${n(y + r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + r)} ${n(y)}Z`;
export const ell = (cx: number, cy: number, rx: number, ry: number) =>
  `M${n(cx - rx)} ${n(cy)}A${n(rx)} ${n(ry)} 0 1 0 ${n(cx + rx)} ${n(cy)}A${n(rx)} ${n(ry)} 0 1 0 ${n(cx - rx)} ${n(cy)}Z`;
export const L = (name: string, d: string, fill?: string, stroke?: string, sw?: number, cap?: 'round'): IconLayer => ({ name, d, fill, stroke, sw, cap });
/** a rounded rectangle mirrored across x = 50 */
const mrr = (x: number, y: number, w: number, h: number, r: number) => rr(100 - x - w, y, w, h, r);

/* ---- hard hat: yellow dome, lighter ridge, darker brim and a dark rear strap ---- */
const helmet: IconLayer[] = [
  L('strap', rr(10, 70, 22, 13, 6), '#4a4a4a', INK, 3),
  L('brim', rr(5, 58, 90, 15, 7.5), '#f0a500', INK, 3),
  L('dome', 'M14 62C14 32 30 13 50 13C70 13 86 32 86 62Z', '#ffd400', INK, 3),
  L('dome-shade', 'M14 62L86 62L84.5 53C70 58 30 58 15.5 53Z', '#e8b400'),
  L('ridge', rr(43, 14, 14, 46, 5), '#ffe56b', INK, 2.2),
  L('highlight', 'M24 50C24 38 30 29 39 23L39 27C33 33 29 41 30 51Z', 'rgba(255,255,255,.6)'),
];

/* ---- safety glasses: a clear wrap-around lens with a dark top rail and glints ---- */
const glasses: IconLayer[] = [
  L('temple-l', 'M11 40L3 35', undefined, INK, 6, 'round'),
  L('temple-r', 'M89 40L97 35', undefined, INK, 6, 'round'),
  L('lens', 'M10 38Q10 29 21 29L79 29Q90 29 90 38L90 52Q90 69 74 69Q62 69 56 58Q50 51 44 58Q38 69 26 69Q10 69 10 52Z', '#d4f0ff', INK, 3),
  L('rail', 'M10 38Q10 29 21 29L79 29Q90 29 90 38L90 43L10 43Z', '#2f3a46'),
  L('glint-a', 'M19 51L30 51L23 64L14 64Z', 'rgba(255,255,255,.9)'),
  L('glint-b', 'M60 51L70 51L64.5 62L56 62Z', 'rgba(255,255,255,.9)'),
];

/* ---- work gloves: a pair of brown leather gloves with dark cuffs and a pale strap ---- */
function glove(side: 'l' | 'r'): IconLayer[] {
  const m = side === 'l';
  const R = (x: number, y: number, w: number, h: number, r: number) => (m ? rr(x, y, w, h, r) : mrr(x, y, w, h, r));
  const thumb = m ? 'M36 60L47 50Q51 47 53 51Q54 55 51 58L40 70Z' : 'M64 60L53 50Q49 47 47 51Q46 55 49 58L60 70Z';
  const u = (s: string) => `${side}-${s}`;
  return [
    L(u('thumb'), thumb, '#c98a4b', INK, 2.5),
    L(u('palm'), R(9, 42, 30, 32, 8), '#c27c3e', INK, 2.5),
    L(u('pinky'), R(9, 28, 7.5, 22, 3.75), '#c98a4b', INK, 2.2),
    L(u('ring'), R(16.5, 19, 7.5, 31, 3.75), '#c98a4b', INK, 2.2),
    L(u('middle'), R(24, 15, 7.5, 35, 3.75), '#c98a4b', INK, 2.2),
    L(u('index'), R(31.5, 21, 7.5, 29, 3.75), '#c98a4b', INK, 2.2),
    L(u('cuff'), R(7, 72, 34, 17, 5), '#7a4421', INK, 2.5),
    L(u('strap'), R(7, 78, 34, 4.5, 2), '#e3b878'),
  ];
}
const gloves: IconLayer[] = [...glove('l'), ...glove('r')];

/* ---- ear muffs: yellow cups with dark cushions on a dark headband ---- */
const earmuffs: IconLayer[] = [
  L('band-outline', 'M19 52C19 22 34 11 50 11C66 11 81 22 81 52', undefined, INK, 12, 'round'),
  L('band', 'M19 52C19 22 34 11 50 11C66 11 81 22 81 52', undefined, '#4a4a4a', 6.5, 'round'),
  L('cup-l', rr(5, 44, 30, 44, 14), '#ffd400', INK, 3),
  L('cup-r', rr(65, 44, 30, 44, 14), '#ffd400', INK, 3),
  L('pad-l', rr(27, 50, 9, 32, 4.5), '#3a3a3a'),
  L('pad-r', rr(64, 50, 9, 32, 4.5), '#3a3a3a'),
  L('shine-l', rr(10, 51, 6, 26, 3), 'rgba(255,255,255,.6)'),
  L('shine-r', rr(70, 51, 6, 26, 3), 'rgba(255,255,255,.6)'),
];

/* ---- face mask: a pleated white respirator with ear loops and a nose clip ---- */
const mask: IconLayer[] = [
  L('loop-l', 'M20 46C4 44 1 66 19 67', undefined, '#8f99a6', 3.5, 'round'),
  L('loop-r', 'M80 46C96 44 99 66 81 67', undefined, '#8f99a6', 3.5, 'round'),
  L('body', 'M18 40Q50 26 82 40L88 60Q50 86 12 60Z', '#f4f6f9', INK, 3),
  L('shade', 'M12 60Q50 86 88 60L86.5 66Q50 92 13.5 66Z', '#d6dbe3'),
  L('pleat-1', 'M17 50Q50 63 83 50', undefined, '#c3cad3', 2.4, 'round'),
  L('pleat-2', 'M14.5 58Q50 73 85.5 58', undefined, '#c3cad3', 2.4, 'round'),
  L('nose-clip', 'M33 37Q50 30 67 37L65 42Q50 36 35 42Z', '#cfd5dd', INK, 1.6),
];

/* ---- work boot: brown leather with a steel toe cap, padded collar, laces and a dark sole ---- */
const boots: IconLayer[] = [
  L('sole', rr(10, 78, 82, 13, 6.5), '#2f2f2f', INK, 3),
  L('upper', 'M24 12L58 12L59 46C59 50 63 52 69 54C83 58 91 66 91 76L91 80L15 80L24 12Z', '#9a6a35', INK, 3),
  L('toe', 'M70 58C84 60 92 68 92 78L92 80L67 80Z', '#c4cad2', INK, 2.5),
  L('collar', rr(21, 8, 40, 15, 6.5), '#5a3a1a', INK, 2.5),
  L('lace-1', 'M31 32L52 32', undefined, '#f3e5c0', 3.2, 'round'),
  L('lace-2', 'M31 42L53 42', undefined, '#f3e5c0', 3.2, 'round'),
  L('lace-3', 'M30 52L54 52', undefined, '#f3e5c0', 3.2, 'round'),
  L('heel-shade', 'M15 80L24 36L28 36L24 80Z', 'rgba(0,0,0,.18)'),
];

/* ---- hi-vis vest: orange with yellow-green reflective bands ---- */
const vest: IconLayer[] = [
  L('body', 'M26 10L40 10L50 30L60 10L74 10L90 27L82 91L18 91L10 27Z', '#ff7a1a', INK, 3),
  L('band-l', 'M31 12L40 12L39 91L29 91Z', '#d8ff3a'),
  L('band-r', 'M60 12L69 12L71 91L61 91Z', '#d8ff3a'),
  L('band-h', 'M12 58L88 58L87 69L13 69Z', '#d8ff3a'),
  L('silver-l', 'M34.5 14L35 90', undefined, '#c5c9ce', 1.6),
  L('silver-r', 'M65 14L66 90', undefined, '#c5c9ce', 1.6),
  L('silver-h', 'M13 63.5L87 63.5', undefined, '#c5c9ce', 1.6),
  L('zip', 'M50 31L50 91', undefined, INK, 2.4),
  L('outline', 'M26 10L40 10L50 30L60 10L74 10L90 27L82 91L18 91L10 27Z', 'none', INK, 3),
];

/* ---- first-aid kit: a red case with a white cross, a handle and a darker lower edge ---- */
const firstaid: IconLayer[] = [
  L('handle-outline', 'M36 30V21Q36 14 43 14H57Q64 14 64 21V30', undefined, INK, 10, 'round'),
  L('handle', 'M36 30V21Q36 14 43 14H57Q64 14 64 21V30', undefined, '#d8d8d8', 5, 'round'),
  L('case', rr(7, 28, 86, 60, 11), '#e8323a', INK, 3),
  L('case-shade', 'M7 72H93V77Q93 88 82 88H18Q7 88 7 77Z', '#c4222b'),
  L('shine', rr(12, 33, 76, 6, 3), 'rgba(255,255,255,.35)'),
  L('cross', 'M43 41H57V50H66V64H57V73H43V64H34V50H43Z', '#ffffff', '#b8b8b8', 1.4),
];

export const PPE_ICONS: Record<PpeIconName, IconLayer[]> = { helmet, glasses, gloves, earmuffs, mask, boots, vest, firstaid };
export const PPE_ICON_NAMES = Object.keys(PPE_ICONS) as PpeIconName[];

/** The game's five pickup types map onto five of the icons. */
export const PPE_ICON_OF = { helmet: 'helmet', gloves: 'gloves', glasses: 'glasses', ear: 'earmuffs', boots: 'boots' } as const;

const cache = new Map<IconLayer, Path2D>();
const pathOf = (l: IconLayer) => { let p = cache.get(l); if (!p) { p = new Path2D(l.d); cache.set(l, p); } return p; };

/** Draws an icon centred on the origin, `size` px across. */
export function drawPpeIcon(c: Ctx, name: PpeIconName, size: number) { drawLayers(c, PPE_ICONS[name], size); }

/** Any list of icon layers (100 × 100 box), centred on the origin, `size` px across. */
export function drawLayers(c: Ctx, layers: readonly IconLayer[], size: number) {
  const k = size / 100;
  c.save(); c.scale(k, k); c.translate(-50, -50); c.lineJoin = 'round'; c.lineCap = 'butt';
  for (const l of layers) {
    const p = pathOf(l);
    if (l.fill && l.fill !== 'none') { c.fillStyle = l.fill; c.fill(p); }
    if (l.stroke) { c.strokeStyle = l.stroke; c.lineWidth = l.sw ?? 2; c.lineCap = l.cap ?? 'butt'; c.stroke(p); }
  }
  c.restore();
}

/** One icon as a standalone SVG document. */
export function iconSvg(name: PpeIconName, size = 100): string { return layersSvg(PPE_ICONS[name], size); }

export function layersSvg(layers: readonly IconLayer[], size = 100): string {
  const body = layers.map(l => {
    let a = `<path id="${l.name}" d="${l.d}" fill="${l.fill ?? 'none'}"`;
    if (l.stroke) a += ` stroke="${l.stroke}" stroke-width="${l.sw ?? 2}" stroke-linejoin="round"${l.cap ? ` stroke-linecap="${l.cap}"` : ''}`;
    return a + '/>';
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}">${body}</svg>\n`;
}
