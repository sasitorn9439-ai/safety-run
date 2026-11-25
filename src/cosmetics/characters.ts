/**
 * Custom skins: the mascot becomes another character. Each recolours the mascot (like any skin) and adds a Figure: parts on
 * the head and the back, drawn inside the body's transform so they lean, squash and tuck with every pose. A custom skin drops
 * the crystal from the head. Seen from behind, as in the game: a tail points toward the camera.
 */
import { rr, type Ctx } from '../render/draw.js';
import { palette } from './skins.js';
import type { Figure, FrontFigure, Rarity, Skin } from './types.js';

const TAU = Math.PI * 2;
const tri = (c: Ctx, pts: readonly (readonly [number, number])[], fill: string) => {
  c.fillStyle = fill; c.beginPath(); c.moveTo(pts[0]![0], pts[0]![1]); for (const p of pts.slice(1)) c.lineTo(p[0], p[1]); c.closePath(); c.fill();
};
const ell = (c: Ctx, x: number, y: number, rx: number, ry: number, fill: string, rot = 0) => {
  c.fillStyle = fill; c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, TAU); c.fill();
};
/** a small spike pointing up, centred on x = 0 */
const spike = (c: Ctx, y: number, r: number, fill: string) => tri(c, [[-r, y + r], [0, y - r * 1.2], [r, y + r]], fill);
const blink = (t: number, on: string, off: string) => (Math.sin(t * TAU * 2) > 0 ? on : off);

const dino: Figure = {
  head(c) { for (const y of [-.8, -.7, -.6]) spike(c, y, .05, '#ffb300'); },
  back(c, t) {
    c.save(); c.translate(0, -.22); c.rotate(Math.sin(t * TAU) * .25);          // the tail wags with the stride
    c.fillStyle = '#3d7d2c'; c.beginPath(); c.moveTo(-.14, -.02); c.quadraticCurveTo(-.06, .22, .3, .24); c.quadraticCurveTo(.08, .1, .14, -.02); c.closePath(); c.fill();
    c.fillStyle = '#6fbf57'; c.beginPath(); c.moveTo(-.1, 0); c.quadraticCurveTo(-.03, .18, .25, .21); c.quadraticCurveTo(.06, .08, .1, 0); c.closePath(); c.fill();
    for (const [x, y] of [[-.02, .06], [.07, .13], [.16, .18]] as const) tri(c, [[x - .03, y + .03], [x + .02, y - .04], [x + .05, y + .03]], '#ffb300');
    c.restore();
    for (const y of [-.44, -.36, -.28]) spike(c, y, .045, '#ffb300');
  },
};
const robot: Figure = {
  head(c, t) {
    for (const s of [-1, 1]) { rr(c, s * .27 - .045, -.66, .09, .12, .03, '#455a64'); ell(c, s * .3, -.6, .022, .022, blink(t, '#29b6f6', '#0d47a1')); }
    for (const [x, y] of [[-.15, -.7], [.15, -.7], [-.18, -.52], [.18, -.52]] as const) ell(c, x, y, .014, .014, '#90a4ae');
  },
  back(c, t) {
    rr(c, -.12, -.46, .24, .2, .04, '#37474f');
    for (const y of [-.42, -.38, -.34]) rr(c, -.08, y, .16, .018, .009, '#263238');
    ell(c, .07, -.3, .018, .018, blink(t, '#76ff03', '#33691e'));
  },
};
const ninja: Figure = {
  head(c, t) {
    rr(c, -.275, -.64, .55, .07, .03, '#e53935');
    const w = Math.sin(t * TAU) * .04;                                          // the headband's tails flutter
    c.strokeStyle = '#c62828'; c.lineWidth = .045; c.lineCap = 'round';
    c.beginPath(); c.moveTo(.02, -.6); c.quadraticCurveTo(.2, -.62 + w, .36, -.58 - w); c.stroke();
    c.beginPath(); c.moveTo(.02, -.6); c.quadraticCurveTo(.18, -.55 - w, .32, -.5 + w); c.stroke();
    ell(c, .02, -.605, .04, .035, '#b71c1c');
  },
  back(c) {                                                                       // a sword slung across the back
    c.save(); c.translate(0, -.34); c.rotate(-.7);
    rr(c, -.22, -.025, .34, .05, .02, '#3e2723');
    rr(c, .12, -.03, .14, .06, .02, '#212121');
    for (const x of [.15, .19, .23]) rr(c, x, -.03, .012, .06, .006, '#e53935');
    rr(c, .105, -.045, .02, .09, .01, '#ffca28');
    c.restore();
  },
};
const bear: Figure = {
  head(c) { for (const s of [-1, 1]) { ell(c, s * .2, -.79, .085, .08, '#8d6e63'); ell(c, s * .2, -.79, .045, .042, '#6d4c41'); } },
  back(c) { ell(c, 0, -.2, .065, .06, '#d7ccc8'); ell(c, -.02, -.215, .025, .02, '#ffffff'); },
};
const bee: Figure = {
  head(c) {
    c.strokeStyle = '#212121'; c.lineWidth = .02; c.lineCap = 'round';
    for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * .08, -.83); c.quadraticCurveTo(s * .12, -.95, s * .2, -1.0); c.stroke(); ell(c, s * .2, -1.0, .03, .03, '#212121'); }
  },
  back(c, t) {
    rr(c, -.2, -.4, .4, .05, .02, '#ffd54f');
    rr(c, -.22, -.31, .44, .05, .02, '#ffd54f');
    tri(c, [[-.035, -.2], [.035, -.2], [0, -.12]], '#212121');
    const f = .75 + .25 * Math.sin(t * TAU * 4);                                // wings buzz
    for (const s of [-1, 1]) {
      c.save(); c.globalAlpha *= .85; c.strokeStyle = '#90a4ae'; c.lineWidth = .012; c.fillStyle = 'rgba(232,247,255,.9)';
      c.beginPath(); c.ellipse(s * (.14 + .1 * f), -.4, .14 * f, .075, s * -.35, 0, TAU); c.fill(); c.stroke(); c.restore();
    }
  },
};

const fox: Figure = {
  head(c) {
    for (const s of [-1, 1]) {
      tri(c, [[s * .1, -.8], [s * .24, -1.0], [s * .27, -.7]], '#e65100');
      tri(c, [[s * .13, -.79], [s * .23, -.95], [s * .24, -.73]], '#ffe0b2');
      tri(c, [[s * .2, -.9], [s * .24, -1.0], [s * .26, -.88]], '#3e2723');           // dark ear tips
    }
  },
  back(c, t) {                                                                      // a big brush of a tail, white at the tip
    c.save(); c.translate(0, -.22); c.rotate(Math.sin(t * TAU) * .3);
    ell(c, .08, .12, .12, .2, '#ef6c00', -.6); ell(c, .17, .26, .07, .08, '#ffffff', -.6);
    c.restore();
  },
};
const penguin: Figure = {
  head(c) {
    ell(c, -.08, -.74, .07, .03, 'rgba(255,255,255,.18)', -.5);                    // a glossy highlight
    for (const s of [-1, 1]) ell(c, s * .22, -.55, .05, .07, '#ffffff', s * .3);   // white cheeks showing past the sides
  },
  back(c, t) {
    tri(c, [[-.07, -.2], [.07, -.2], [0, -.11 + Math.sin(t * TAU * 2) * .02]], '#1c1f26');   // a stubby tail that waggles
    ell(c, -.08, -.42, .06, .03, 'rgba(255,255,255,.14)', -.4);
  },
};
const alien: Figure = {
  head(c) {
    for (const s of [-1, 1]) tri(c, [[s * .2, -.66], [s * .36, -.82], [s * .25, -.55]], '#64dd17');
    for (const [x, y, r] of [[-.1, -.72, .03], [.08, -.66, .022], [.12, -.76, .018], [-.05, -.58, .02]] as const) ell(c, x, y, r, r, '#33691e');
  },
  back(c, t) {                                                                      // a little flying-saucer jetpack
    rr(c, -.11, -.45, .22, .16, .06, '#b0bec5');
    ell(c, 0, -.37, .05, .05, blink(t, '#e040fb', '#7c4dff'));
    ell(c, 0, -.27, .1, .025, 'rgba(224,64,251,.5)');
  },
};
const RAINBOW = ['#ff8a80', '#ffd180', '#ffff8d', '#b9f6ca', '#80d8ff', '#ea80fc'];
const unicorn: Figure = {
  head(c, t) {
    tri(c, [[-.04, -.84], [0, -1.04], [.04, -.84]], '#ffd54f');                    // the horn's tip, above the head
    RAINBOW.forEach((col, i) => ell(c, Math.sin(t * TAU + i) * .02, -.82 + i * .07, .07, .045, col));   // the mane
  },
  back(c, t) {
    c.save(); c.translate(0, -.22); c.rotate(Math.sin(t * TAU) * .2);
    RAINBOW.forEach((col, i) => ell(c, (i - 2.5) * .025, .1, .03, .13, col, (i - 2.5) * .12));
    c.restore();
  },
};
const dragon: Figure = {
  head(c) {
    c.strokeStyle = '#ffcc80'; c.lineWidth = .04; c.lineCap = 'round';
    for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * .14, -.8); c.quadraticCurveTo(s * .2, -.95, s * .3, -.98); c.stroke(); }
  },
  back(c, t) {
    const f = .8 + .2 * Math.sin(t * TAU * 2);                                      // bat wings, flapping
    for (const s of [-1, 1]) {
      c.save(); c.translate(s * .12, -.44); c.scale(s * f, 1);
      c.fillStyle = '#b71c1c'; c.beginPath();
      c.moveTo(0, 0); c.lineTo(.32, -.18); c.lineTo(.3, .02); c.lineTo(.22, -.02); c.lineTo(.18, .08); c.lineTo(.1, .04); c.closePath(); c.fill();
      c.restore();
    }
    c.save(); c.translate(0, -.22); c.rotate(Math.sin(t * TAU) * .25);
    c.fillStyle = '#c62828'; c.beginPath(); c.moveTo(-.08, 0); c.quadraticCurveTo(0, .16, .2, .18); c.quadraticCurveTo(.05, .06, .08, 0); c.closePath(); c.fill();
    c.fillStyle = '#ff9100'; c.beginPath(); c.moveTo(.2, .18); c.quadraticCurveTo(.28, .1, .3, .2); c.quadraticCurveTo(.28, .28, .2, .18); c.fill();   // flame at the tip
    c.restore();
  },
};

/** a monk: shaved head with a soft shine, and the robe's fold draped over one shoulder and across the back */
const monk: Figure = {
  egg: true,
  head(c) { ell(c, -.08, -.74, .07, .035, 'rgba(255,255,255,.35)', -.5); },
  back(c) {
    c.fillStyle = '#b85a10'; c.beginPath();
    c.moveTo(-.17, -.49); c.lineTo(-.05, -.49); c.lineTo(.17, -.3); c.lineTo(.17, -.2); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(0,0,0,.12)'; c.lineWidth = .012;
    for (const d of [.05, .1]) { c.beginPath(); c.moveTo(-.15 + d, -.49); c.lineTo(.17, -.3 + d * .6); c.stroke(); }
  },
};

/** each custom skin from the front, for avatars (src/cosmetics/front.ts draws the face between `skin` and `over`) */
const FRONT: Record<string, FrontFigure> = {
  monk: {
    over(c) {
      ell(c, -.09, -.76, .07, .035, 'rgba(255,255,255,.4)', -.5);                // the shine on the shaved head
      tri(c, [[-.19, -.43], [-.08, -.43], [.19, -.27], [.19, -.19]], '#b85a10');  // the robe's fold across the chest
    },
  },
  'dino': {
    behind(c) { for (const [x, y, r] of [[-.15, -.8, .055], [0, -.87, .065], [.15, -.8, .055]] as const) tri(c, [[x - r, y + r], [x, y - r * 1.4], [x + r, y + r]], '#ffb300'); },
    over(c) { for (const s of [-1, 1]) ell(c, s * .045, -.545, .012, .008, '#3d7d2c'); },
  },
  'robot': {
    over(c) {
      for (const s of [-1, 1]) { rr(c, s * .27 - .045, -.66, .09, .12, .03, '#455a64'); ell(c, s * .3, -.6, .022, .022, '#29b6f6'); }
      c.strokeStyle = '#455a64'; c.lineWidth = .02; c.beginPath(); c.moveTo(0, -.86); c.lineTo(0, -.97); c.stroke();
      ell(c, 0, -.98, .03, .03, '#ff5252');
      for (const [x, y] of [[-.17, -.74], [.17, -.74]] as const) ell(c, x, y, .014, .014, '#90a4ae');
    },
    eyes: 'led',
  },
  'ninja': {
    skin(c) { rr(c, -.25, -.66, .5, .12, .05, '#f3d9c6'); },                     // the gap in the mask
    over(c) {
      rr(c, -.26, -.73, .52, .065, .03, '#e53935');
      ell(c, 0, -.698, .045, .035, '#b71c1c');
    },
    mouth: false,
  },
  'bear': {
    behind(c) { for (const s of [-1, 1]) { ell(c, s * .2, -.79, .085, .08, '#8d6e63'); ell(c, s * .2, -.79, .045, .042, '#6d4c41'); } },
    skin(c) { ell(c, 0, -.52, .09, .065, '#efe4df'); ell(c, 0, -.555, .03, .02, '#3e2723'); },
  },
  'bee': {
    behind(c) {
      c.strokeStyle = '#212121'; c.lineWidth = .02; c.lineCap = 'round';
      for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * .08, -.83); c.quadraticCurveTo(s * .12, -.95, s * .2, -1.0); c.stroke(); ell(c, s * .2, -1.0, .03, .03, '#212121'); }
    },
    skin(c) { rr(c, -.26, -.72, .52, .045, .02, '#212121'); },
  },
  'fox': {
    behind(c) {
      for (const s of [-1, 1]) {
        tri(c, [[s * .1, -.8], [s * .24, -1.0], [s * .27, -.7]], '#e65100');
        tri(c, [[s * .13, -.79], [s * .23, -.95], [s * .24, -.73]], '#ffe0b2');
        tri(c, [[s * .2, -.9], [s * .24, -1.0], [s * .26, -.88]], '#3e2723');
      }
    },
    skin(c) {
      c.fillStyle = '#fff8ee'; c.beginPath();
      c.moveTo(-.27, -.56); c.quadraticCurveTo(-.12, -.6, 0, -.54); c.quadraticCurveTo(.12, -.6, .27, -.56);
      c.quadraticCurveTo(.26, -.45, 0, -.44); c.quadraticCurveTo(-.26, -.45, -.27, -.56); c.fill();
      ell(c, 0, -.55, .028, .02, '#3e2723');
    },
  },
  'penguin': {
    skin(c) {
      c.fillStyle = '#ffffff'; c.beginPath();
      c.moveTo(0, -.66); c.bezierCurveTo(-.05, -.72, -.22, -.72, -.21, -.58); c.quadraticCurveTo(-.2, -.46, 0, -.455);
      c.quadraticCurveTo(.2, -.46, .21, -.58); c.bezierCurveTo(.22, -.72, .05, -.72, 0, -.66); c.fill();
    },
    over(c) { tri(c, [[-.045, -.55], [.045, -.55], [0, -.5]], '#ff9800'); },
    mouth: false,
  },
  'alien': {
    over(c) {
      for (const s of [-1, 1]) tri(c, [[s * .2, -.66], [s * .36, -.82], [s * .25, -.55]], '#64dd17');
      for (const [x, y, r] of [[-.08, -.78, .025], [.06, -.8, .02], [.12, -.74, .016]] as const) ell(c, x, y, r, r, '#7cb342');
    },
    eyes: 'big',
  },
  'unicorn': {
    behind(c) { ['#ff8a80', '#ffd180', '#ffff8d', '#b9f6ca', '#80d8ff', '#ea80fc'].forEach((col, i) => ell(c, .2 + i * .012, -.78 + i * .06, .07, .045, col, .4)); },
    over(c) {
      tri(c, [[-.045, -.76], [0, -1.02], [.045, -.76]], '#ffd54f');
      c.strokeStyle = '#ffb300'; c.lineWidth = .012;
      for (const y of [-.8, -.86, -.92]) { const w = (y + 1.02) * .17; c.beginPath(); c.moveTo(-w, y + .01); c.lineTo(w, y - .015); c.stroke(); }
    },
  },
  'dragon': {
    behind(c) {
      c.strokeStyle = '#ffcc80'; c.lineWidth = .04; c.lineCap = 'round';
      for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * .14, -.8); c.quadraticCurveTo(s * .2, -.95, s * .3, -.98); c.stroke(); }
    },
    over(c) { for (const s of [-1, 1]) ell(c, s * .04, -.545, .012, .008, '#8e0000'); },
  },
};

const s = (id: string, name: string, rarity: Rarity, colors: Parameters<typeof palette>[0], figure: Figure): Skin =>
  ({ id: 'skin-' + id, slot: 'skin', name, rarity, pal: palette(colors), figure: { ...figure, front: FRONT[id] } });

export const CUSTOM_SKINS: readonly Skin[] = [
  s('monk', 'พระ · Monk', 'common', { body: '#e8892b', cape: '#d0701c', head: '#f2cba8', mitt: '#f2cba8', shoe: '#8d5524' }, monk),
  s('dino', 'ไดโนเสาร์ · Dino', 'legendary', { body: '#8fd16a', cape: '#4f9a3a', head: '#a5dc84', gem: '#ffca28' }, dino),
  s('robot', 'หุ่นยนต์ · Robot', 'legendary', { body: '#b0bec5', cape: '#607d8b', head: '#cfd8dc', mitt: '#455a64', shoe: '#455a64', gem: '#29b6f6' }, robot),
  s('ninja', 'นินจา · Ninja', 'epic', { body: '#2b2f3a', cape: '#1b1e25', head: '#3a3f4c', gem: '#e53935' }, ninja),
  s('bear', 'หมีน้อย · Bear', 'epic', { body: '#a1887f', cape: '#795548', head: '#bcaaa4', mitt: '#5d4037', shoe: '#5d4037', gem: '#ffb74d' }, bear),
  s('bee', 'ผึ้ง · Bee', 'epic', { body: '#ffd54f', cape: '#212121', head: '#ffe082', mitt: '#212121', shoe: '#212121', gem: '#ffffff' }, bee),
  s('fox', 'จิ้งจอก · Fox', 'epic', { body: '#ffb74d', cape: '#ef6c00', head: '#ffcc80', mitt: '#3e2723', shoe: '#3e2723' }, fox),
  s('penguin', 'เพนกวิน · Penguin', 'epic', { body: '#2b2f3a', cape: '#1c1f26', head: '#2f3440', mitt: '#2b2f3a', shoe: '#ff9800' }, penguin),
  s('alien', 'มนุษย์ต่างดาว · Alien', 'epic', { body: '#9ccc65', cape: '#558b2f', head: '#aed581', mitt: '#7cb342', shoe: '#33691e' }, alien),
  s('unicorn', 'ยูนิคอร์น · Unicorn', 'legendary', { body: '#fafafa', cape: '#e1bee7', head: '#ffffff', mitt: '#f8bbd0', shoe: '#ce93d8' }, unicorn),
  s('dragon', 'มังกรไฟ · Fire dragon', 'legendary', { body: '#e53935', cape: '#8e0000', head: '#ef5350', mitt: '#ffcc80', shoe: '#5d0000' }, dragon),
];
