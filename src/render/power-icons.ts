/**
 * The power-up icons, in the same flat vector style as the PPE icons (see ppe-icons.ts): each one is a piece of everyday Safety.
 *   estop    – the red emergency-stop button (stop work authority)   → slows the world
 *   broom    – a broom (5S: sort, set in order, shine...)              → pulls coins in
 *   lift     – a scissor man-lift (work at height the right way)       → carries you over everything
 *   firstaid – the first-aid kit (reuses the PPE sheet's icon)         → one more hit
 *   toolbox  – a toolbox (toolbox talk: a short safety chat)           → a surprise reward and a Safety tip
 */
import type { PowerType } from '../../shared/sim.js';
import type { Ctx } from './draw.js';
import { INK, L, PPE_ICONS, drawLayers, ell, layersSvg, rr, type IconLayer } from './ppe-icons.js';

const estop: IconLayer[] = [
  L('base', rr(10, 62, 80, 28, 7), '#ffd400', INK, 3),
  L('base-shade', 'M10 82H90V83Q90 90 83 90H17Q10 90 10 83Z', '#e8b400'),
  L('bolt-l', ell(20, 76, 3, 3), '#8a6d00'),
  L('bolt-r', ell(80, 76, 3, 3), '#8a6d00'),
  L('ring', ell(50, 62, 36, 11), '#3a3a3a', INK, 3),
  L('dome', 'M20 60C20 30 34 17 50 17C66 17 80 30 80 60Q50 71 20 60Z', '#e8323a', INK, 3),
  L('dome-shade', 'M20 60Q50 71 80 60C80 53 79 47 77 42C70 52 30 52 23 42C21 47 20 53 20 60Z', '#c4222b'),
  L('highlight', 'M30 43C30 33 37 26 45 24L45 28C39 31 35 37 35 44Z', 'rgba(255,255,255,.65)'),
];

const broom: IconLayer[] = [
  L('handle', rr(46, 6, 8, 48, 4), '#b98149', INK, 3),
  L('bristles', 'M29 54H71L80 92H20Z', '#f2c14e', INK, 3),
  L('bristle-shade', 'M29 54H71L72 62H28Z', '#d9a22a'),
  L('lines', 'M35 66L32 90M43 66L41 90M50 66V90M57 66L59 90M65 66L68 90', undefined, '#b8821c', 1.8, 'round'),
  L('binding', rr(27, 50, 46, 10, 4), '#e8323a', INK, 2.6),
  L('sparkle', 'M80 12L83 20L91 23L83 26L80 34L77 26L69 23L77 20Z', '#fff6a8', INK, 1.5),
];

const lift: IconLayer[] = [
  L('base', rr(12, 86, 76, 9, 3), '#3a3a3a', INK, 2.6),
  L('legs-a', 'M26 84L74 60M74 84L26 60', undefined, INK, 11, 'round'),
  L('legs-b', 'M26 62L74 38M74 62L26 38', undefined, INK, 11, 'round'),
  L('legs-a-fill', 'M26 84L74 60M74 84L26 60', undefined, '#8c949e', 6, 'round'),
  L('legs-b-fill', 'M26 62L74 38M74 62L26 38', undefined, '#8c949e', 6, 'round'),
  L('platform', rr(10, 28, 80, 11, 3), '#ffd400', INK, 3),
  L('platform-stripe', 'M20 28L28 28L22 39L14 39ZM38 28L46 28L40 39L32 39ZM56 28L64 28L58 39L50 39ZM74 28L82 28L76 39L68 39Z', '#2b2b2b'),
  L('rail-post-l', rr(13, 6, 5, 22, 2), '#9aa3ad', INK, 2.4),
  L('rail-post-r', rr(82, 6, 5, 22, 2), '#9aa3ad', INK, 2.4),
  L('rail-top', rr(13, 6, 74, 5, 2), '#9aa3ad', INK, 2.4),
  L('rail-mid', rr(13, 16, 74, 4, 2), '#9aa3ad', INK, 2),
];

const toolbox: IconLayer[] = [
  L('handle-outline', 'M33 44V32Q33 22 43 22H57Q67 22 67 32V44', undefined, INK, 10, 'round'),
  L('handle', 'M33 44V32Q33 22 43 22H57Q67 22 67 32V44', undefined, '#cfd6de', 4.5, 'round'),
  L('body', rr(8, 42, 84, 48, 8), '#ff7a1a', INK, 3),
  L('lid', rr(8, 42, 84, 15, 7), '#e0630d', INK, 3),
  L('stripe', 'M10 76H90V83H10Z', 'rgba(255,255,255,.35)'),
  L('latch', rr(43, 47, 14, 12, 3), '#ffd400', INK, 2.2),
  L('mark', 'M42 68Q42 61 50 61Q58 61 58 67Q58 71 50 73V75', undefined, '#ffffff', 4.2, 'round'),
  L('dot', ell(50, 82, 2.6, 2.6), '#ffffff'),
];

/* ---------- tournament items ---------- */

const quiz: IconLayer[] = [
  L('card', rr(18, 8, 64, 84, 10), '#ffd400', INK, 3),
  L('card-shade', 'M18 78H82V82Q82 92 72 92H28Q18 92 18 82Z', '#e8b400'),
  L('mark-outline', 'M37 38Q37 22 50 22Q63 22 63 35Q63 45 50 50V60', undefined, INK, 13, 'round'),
  L('mark', 'M37 38Q37 22 50 22Q63 22 63 35Q63 45 50 50V60', undefined, '#e8323a', 7, 'round'),
  L('dot', ell(50, 75, 6, 6), '#e8323a', INK, 2.6),
];

const loto: IconLayer[] = [
  L('shackle-outline', 'M30 46V30Q30 12 50 12Q70 12 70 30V46', undefined, INK, 13, 'round'),
  L('shackle', 'M30 46V30Q30 12 50 12Q70 12 70 30V46', undefined, '#cfd6de', 6.5, 'round'),
  L('body', rr(16, 42, 68, 50, 9), '#e8323a', INK, 3),
  L('body-shade', 'M16 80H84V83Q84 92 75 92H25Q16 92 16 83Z', '#c4222b'),
  L('keyhole', 'M50 56A6 6 0 1 1 49.9 56ZM47 64H53L55 78H45Z', INK),
];

const foam: IconLayer[] = [
  L('hose', 'M40 22Q20 22 18 46', undefined, INK, 6, 'round'),
  L('nozzle', rr(10, 44, 14, 10, 3), '#3a3a3a', INK, 2.4),
  L('cylinder', rr(34, 26, 34, 66, 12), '#e8323a', INK, 3),
  L('cylinder-shade', 'M34 80H68V82Q68 92 58 92H44Q34 92 34 82Z', '#c4222b'),
  L('label', rr(39, 48, 24, 20, 3), '#ffffff', INK, 2),
  L('valve', rr(42, 12, 18, 16, 3), '#3a3a3a', INK, 2.6),
  L('handle', 'M58 14L76 8', undefined, INK, 5, 'round'),
  L('spray', 'M80 30Q90 34 92 44M78 40Q86 44 88 52', undefined, '#7fe3ff', 3.2, 'round'),
];

const buddy: IconLayer[] = [
  L('body-l', 'M8 92Q8 62 32 62Q56 62 56 92Z', '#ff7a1a', INK, 3),
  L('body-r', 'M44 92Q44 62 68 62Q92 62 92 92Z', '#3ccf7a', INK, 3),
  L('head-l', ell(32, 48, 14, 14), '#f7c9a0', INK, 3),
  L('head-r', ell(68, 48, 14, 14), '#f7c9a0', INK, 3),
  L('hat-l', 'M16 42Q16 24 32 24Q48 24 48 42Z', '#ffd400', INK, 3),
  L('hat-r', 'M52 42Q52 24 68 24Q84 24 84 42Z', '#ffd400', INK, 3),
  L('hands', 'M40 80H60', undefined, INK, 8, 'round'),
];

const audit: IconLayer[] = [
  L('board', rr(16, 14, 68, 80, 8), '#b98149', INK, 3),
  L('paper', rr(24, 24, 52, 62, 3), '#ffffff', INK, 2),
  L('clip', rr(36, 8, 28, 14, 4), '#cfd6de', INK, 2.6),
  L('ticks', 'M30 40L35 45L43 36M30 58L35 63L43 54', undefined, '#3ccf7a', 4, 'round'),
  L('lines', 'M50 41H68M50 59H68M30 76H68', undefined, '#9aa3ad', 3.2, 'round'),
];

/** the answer gates: a sign on two posts, A / B / C in the colour the HUD gives that choice */
export const GATE_COLORS = ['#2f80ed', '#ff7a1a', '#9b5de5'] as const;
const LETTERS = ['M38 66L50 30L62 66M42 54H58', 'M40 30V66H54Q63 66 63 57Q63 48 54 48H40M40 48H52Q60 48 60 39Q60 30 52 30H40', 'M62 36Q57 30 50 30Q38 30 38 48Q38 66 50 66Q57 66 62 60'];
const gate = (i: number): IconLayer[] => [
  L('post-l', rr(10, 20, 8, 76, 3), '#3a3a3a', INK, 2.4),
  L('post-r', rr(82, 20, 8, 76, 3), '#3a3a3a', INK, 2.4),
  L('sign', rr(6, 10, 88, 66, 10), GATE_COLORS[i], INK, 3.4),
  L('sign-shade', 'M6 64H94V66Q94 76 84 76H16Q6 76 6 66Z', 'rgba(0,0,0,.18)'),
  L('letter', LETTERS[i]!, undefined, '#ffffff', 8, 'round'),
];

export const POWER_ICONS: Record<PowerType, readonly IconLayer[]> = {
  estop, broom, lift, toolbox, firstaid: PPE_ICONS.firstaid,
  quiz, loto, foam, buddy, audit, gate0: gate(0), gate1: gate(1), gate2: gate(2),
};
export const POWER_TYPES = Object.keys(POWER_ICONS) as PowerType[];

/** Draws a power-up icon centred on the origin, `size` px across. */
export function drawPowerIcon(c: Ctx, t: PowerType, size: number) { drawLayers(c, POWER_ICONS[t], size); }
export const powerIconSvg = (t: PowerType, size = 100) => layersSvg(POWER_ICONS[t], size);
