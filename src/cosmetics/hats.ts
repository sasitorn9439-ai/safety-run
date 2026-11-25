/**
 * Thirty hats, each drawn in head coordinates (see Hat in types.ts). The mascot is seen from behind, so `draw` is the back of each
 * hat; `front` is given only where the front looks different (avatars show the front).
 */
import { rr, type Ctx } from '../render/draw.js';
import type { Hat, Rarity } from './types.js';

const ell = (c: Ctx, x: number, y: number, rx: number, ry: number, color: string, a0 = 0, a1 = 7, rot = 0) => {
  c.fillStyle = color; c.beginPath(); c.ellipse(x, y, rx, ry, rot, a0, a1); c.fill();
};
const poly = (c: Ctx, pts: readonly (readonly [number, number])[], color: string) => {
  c.fillStyle = color; c.beginPath(); c.moveTo(pts[0]![0], pts[0]![1]); for (const p of pts.slice(1)) c.lineTo(p[0], p[1]); c.closePath(); c.fill();
};
const line = (c: Ctx, pts: readonly (readonly [number, number])[], color: string, w: number) => {
  c.strokeStyle = color; c.lineWidth = w; c.lineCap = 'round'; c.lineJoin = 'round';
  c.beginPath(); c.moveTo(pts[0]![0], pts[0]![1]); for (const p of pts.slice(1)) c.lineTo(p[0], p[1]); c.stroke();
};
const star = (c: Ctx, x: number, y: number, r: number, color: string) => {
  c.fillStyle = color; c.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? r * .42 : r; c.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); }
  c.closePath(); c.fill();
};
const HALF = [Math.PI, Math.PI * 2] as const;
const TAU_H = Math.PI * 2;

/** a safety helmet: dome, ridge and a short brim all round */
function hardHat(c: Ctx, shell: string, shade: string) {
  ell(c, 0, -.74, .3, .055, shade);
  ell(c, 0, -.76, .25, .25, shell, ...HALF);
  ell(c, .08, -.76, .17, .25, shade, Math.PI * 1.5, Math.PI * 2);
  rr(c, -.035, -1.0, .07, .25, .03, shade);
  rr(c, -.31, -.775, .62, .05, .025, shade);
}
/** a soft cap seen from the back: crown, the strap opening and a button on top */
function cap(c: Ctx, color: string, dark: string) {
  ell(c, 0, -.74, .26, .25, color, ...HALF);
  ell(c, 0, -.745, .085, .055, dark, ...HALF);
  rr(c, -.26, -.76, .52, .04, .02, dark);
  ell(c, 0, -.985, .03, .03, dark);
}
/** the same cap from the front: crown panels and the bill over the forehead */
function capFront(c: Ctx, color: string, dark: string) {
  ell(c, 0, -.74, .26, .25, color, ...HALF);
  line(c, [[0, -.985], [0, -.75]], dark, .012);
  ell(c, 0, -.985, .03, .03, dark);
  ell(c, 0, -.745, .3, .07, dark, 0, Math.PI);
  ell(c, 0, -.75, .27, .045, color, 0, Math.PI);
}

const h = (id: string, name: string, rarity: Rarity, draw: (c: Ctx) => void, front?: (c: Ctx) => void): Hat => ({ id: 'hat-' + id, slot: 'hat', name, rarity, draw, ...front && { front } });

export const HATS: readonly Hat[] = [
  h('hardhat', 'หมวกนิรภัยเหลือง · Hard hat', 'common', c => hardHat(c, '#ffd400', '#e0a800')),
  h('hardhat-white', 'หมวกนิรภัยขาว · Engineer hat', 'common', c => hardHat(c, '#f7f7f2', '#cfd3d6')),
  h('cap', 'แก๊ปแดง · Red cap', 'common', c => cap(c, '#e53935', '#a32020'), c => capFront(c, '#e53935', '#a32020')),
  h('cap-blue', 'แก๊ปน้ำเงิน · Blue cap', 'common', c => cap(c, '#1e6fd0', '#11458a'), c => capFront(c, '#1e6fd0', '#11458a')),
  h('beanie', 'หมวกไหมพรม · Beanie', 'common', c => {
    ell(c, 0, -.72, .27, .27, '#ff7043', ...HALF);
    for (let x = -.2; x <= .2; x += .1) rr(c, x - .02, -.92 + Math.abs(x) * .6, .04, .2 - Math.abs(x) * .6, .02, '#f4511e');
    rr(c, -.28, -.77, .56, .1, .05, '#ffccbc');
    ell(c, 0, -1.02, .08, .08, '#fff3e0');
  }),
  h('headband', 'ผ้าคาดผม · Headband', 'common', c => {
    rr(c, -.27, -.7, .54, .07, .03, '#e53935');
    poly(c, [[.22, -.68], [.38, -.6], [.34, -.55], [.2, -.64]], '#c62828');
    poly(c, [[.22, -.66], [.32, -.52], [.27, -.5], [.19, -.62]], '#e53935');
  }),
  h('bandana', 'ผ้าโพกหัว · Bandana', 'common', c => {
    ell(c, 0, -.69, .27, .2, '#1565c0', ...HALF);
    poly(c, [[-.27, -.69], [.27, -.69], [0, -.56]], '#1565c0');
    for (const [x, y] of [[-.12, -.78], [.1, -.8], [0, -.66], [-.02, -.85]] as const) ell(c, x, y, .022, .022, '#ffffff');
    ell(c, .25, -.68, .05, .04, '#0d47a1');
  }),
  h('party', 'หมวกปาร์ตี้ · Party hat', 'common', c => {
    poly(c, [[-.17, -.8], [.17, -.8], [0, -1.22]], '#ab47bc');
    for (const [y, w] of [[-.86, .145], [-.98, .1], [-1.1, .055]] as const) poly(c, [[-w, y], [w, y], [w - .025, y - .04], [-w + .025, y - .04]], '#ffd400');
    ell(c, 0, -1.23, .05, .05, '#ff4081');
    rr(c, -.18, -.82, .36, .04, .02, '#7b1fa2');
  }),
  h('beret', 'เบเร่ต์ · Beret', 'common', c => {
    ell(c, -.03, -.83, .3, .1, '#c62828', 0, 7, -.12);
    ell(c, -.03, -.86, .26, .07, '#e53935', 0, 7, -.12);
    rr(c, -.01, -.95, .03, .05, .015, '#8e0000');
  }),
  h('flower', 'ดอกไม้ทัดหู · Flower', 'common', c => {
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; ell(c, .2 + Math.cos(a) * .06, -.74 + Math.sin(a) * .06, .055, .055, '#ff80ab'); }
    ell(c, .2, -.74, .04, .04, '#ffd400');
    ell(c, .13, -.67, .06, .025, '#43a047', 0, 7, .6);
  }),
  h('bow', 'โบว์ · Bow', 'common', c => {
    poly(c, [[0, -.86], [-.2, -.95], [-.2, -.77]], '#ff4081');
    poly(c, [[0, -.86], [.2, -.95], [.2, -.77]], '#ff4081');
    poly(c, [[0, -.86], [-.12, -.91], [-.12, -.81]], '#f50057');
    poly(c, [[0, -.86], [.12, -.91], [.12, -.81]], '#f50057');
    ell(c, 0, -.86, .05, .05, '#c51162');
  }),
  h('earmuffs', 'ที่ครอบหู · Ear muffs', 'common', c => {
    c.strokeStyle = '#37474f'; c.lineWidth = .045; c.beginPath(); c.ellipse(0, -.58, .27, .34, 0, Math.PI * 1.05, Math.PI * 1.95); c.stroke();
    for (const sx of [-1, 1]) { rr(c, sx * .27 - .07, -.66, .14, .2, .07, '#ffd400'); rr(c, sx * .27 - .045, -.63, .09, .14, .045, '#e0a800'); }
  }),
  h('cowboy', 'หมวกคาวบอย · Cowboy', 'rare', c => {
    ell(c, 0, -.76, .46, .1, '#8d5524');
    c.fillStyle = '#a0682f'; c.beginPath(); c.moveTo(-.2, -.76); c.lineTo(-.19, -.98); c.quadraticCurveTo(0, -.9, .19, -.98); c.lineTo(.2, -.76); c.closePath(); c.fill();
    rr(c, -.2, -.82, .4, .055, .02, '#3e2723');
    ell(c, -.4, -.8, .08, .04, '#8d5524', 0, 7, -.5); ell(c, .4, -.8, .08, .04, '#8d5524', 0, 7, .5);
  }),
  h('tophat', 'หมวกทรงสูง · Top hat', 'rare', c => {
    ell(c, 0, -.78, .34, .07, '#1b1b1f');
    rr(c, -.18, -1.24, .36, .47, .03, '#25252b');
    rr(c, -.18, -.88, .36, .07, .01, '#c62828');
    ell(c, 0, -1.24, .18, .04, '#3a3a42');
  }),
  h('chef', 'หมวกเชฟ · Chef', 'rare', c => {
    rr(c, -.2, -.88, .4, .14, .03, '#f5f5f5');
    for (const [x, y, r] of [[-.13, -.97, .11], [.13, -.97, .11], [0, -1.04, .13], [-.06, -.94, .1], [.07, -.93, .1]] as const) ell(c, x, y, r, r, '#ffffff');
    rr(c, -.2, -.79, .4, .05, .02, '#e0e0e0');
  }),
  h('santa', 'หมวกซานต้า · Santa', 'rare', c => {
    c.fillStyle = '#d32f2f'; c.beginPath(); c.moveTo(-.25, -.78); c.quadraticCurveTo(-.15, -1.1, .12, -1.12); c.quadraticCurveTo(.3, -1.1, .36, -.96); c.quadraticCurveTo(.15, -.98, .25, -.78); c.closePath(); c.fill();
    rr(c, -.28, -.82, .56, .1, .05, '#ffffff');
    ell(c, .37, -.94, .07, .07, '#ffffff');
  }),
  h('grad', 'หมวกรับปริญญา · Graduate', 'rare', c => {
    ell(c, 0, -.76, .22, .14, '#212121', ...HALF);
    poly(c, [[-.34, -.9], [0, -.98], [.34, -.9], [0, -.82]], '#2b2b2b');
    line(c, [[0, -.9], [.22, -.88], [.26, -.72]], '#ffd400', .02);
    rr(c, .235, -.74, .05, .09, .02, '#ffc107');
  }),
  h('pirate', 'หมวกโจรสลัด · Pirate', 'rare', c => {
    c.fillStyle = '#1c1c22'; c.beginPath(); c.moveTo(-.38, -.82); c.quadraticCurveTo(-.2, -1.08, 0, -.98); c.quadraticCurveTo(.2, -1.08, .38, -.82); c.quadraticCurveTo(0, -.74, -.38, -.82); c.closePath(); c.fill();
    line(c, [[-.36, -.82], [0, -.76], [.36, -.82]], '#ffd400', .025);
    ell(c, 0, -.9, .05, .045, '#fafafa');
    line(c, [[-.05, -.82], [.05, -.85]], '#fafafa', .02); line(c, [[.05, -.82], [-.05, -.85]], '#fafafa', .02);
  }),
  h('viking', 'หมวกไวกิ้ง · Viking', 'rare', c => {
    for (const sx of [-1, 1]) {
      c.fillStyle = '#fff3e0'; c.beginPath(); c.moveTo(sx * .2, -.78); c.quadraticCurveTo(sx * .42, -.82, sx * .4, -1.08); c.quadraticCurveTo(sx * .34, -.92, sx * .18, -.88); c.closePath(); c.fill();
    }
    ell(c, 0, -.74, .26, .25, '#90a4ae', ...HALF);
    rr(c, -.27, -.78, .54, .06, .02, '#607d8b');
    rr(c, -.03, -.99, .06, .22, .02, '#607d8b');
    for (const x of [-.18, -.06, .06, .18]) ell(c, x, -.75, .015, .015, '#cfd8dc');
  }),
  h('bunny', 'หูกระต่าย · Bunny ears', 'rare', c => {
    for (const sx of [-1, 1]) { ell(c, sx * .1, -1.04, .07, .22, '#fafafa', 0, 7, sx * .15); ell(c, sx * .1, -1.03, .035, .16, '#f8bbd0', 0, 7, sx * .15); }
    rr(c, -.2, -.85, .4, .05, .025, '#fafafa');
  }),
  h('cat', 'หูแมว · Cat ears', 'rare', c => {
    for (const sx of [-1, 1]) { poly(c, [[sx * .05, -.84], [sx * .24, -.74], [sx * .2, -1.0]], '#424242'); poly(c, [[sx * .09, -.83], [sx * .2, -.77], [sx * .18, -.93]], '#f48fb1'); }
    rr(c, -.22, -.83, .44, .045, .02, '#424242');
  }),
  h('crown', 'มงกุฎ · Crown', 'epic', c => {
    poly(c, [[-.22, -.78], [-.24, -1.0], [-.12, -.9], [0, -1.06], [.12, -.9], [.24, -1.0], [.22, -.78]], '#ffd400');
    rr(c, -.23, -.82, .46, .06, .02, '#e0a800');
    for (const [x, col] of [[-.13, '#e53935'], [0, '#1e88e5'], [.13, '#43a047']] as const) ell(c, x, -.79, .025, .025, col);
    for (const x of [-.24, 0, .24]) ell(c, x, x ? -1.0 : -1.06, .025, .025, '#fff59d');
  }),
  h('wizard', 'หมวกพ่อมด · Wizard', 'epic', c => {
    ell(c, 0, -.78, .38, .08, '#311b92');
    c.fillStyle = '#4527a0'; c.beginPath(); c.moveTo(-.2, -.79); c.quadraticCurveTo(-.08, -1.05, .06, -1.32); c.quadraticCurveTo(.1, -1.12, .2, -.79); c.closePath(); c.fill();
    star(c, -.05, -.95, .05, '#ffd400'); star(c, .07, -1.12, .035, '#ffd400'); ell(c, .08, -.86, .02, .02, '#fff59d');
    rr(c, -.2, -.84, .4, .05, .02, '#ffd400');
  }),
  h('propeller', 'หมวกใบพัด · Propeller', 'epic', c => {
    ell(c, 0, -.74, .25, .24, '#e53935', Math.PI, Math.PI * 1.5); ell(c, 0, -.74, .25, .24, '#1e88e5', Math.PI * 1.5, Math.PI * 2);
    c.fillStyle = '#ffd400'; c.beginPath(); c.moveTo(0, -.74); c.ellipse(0, -.74, .25, .24, 0, Math.PI * 1.3, Math.PI * 1.7); c.closePath(); c.fill();
    rr(c, -.01, -1.04, .02, .08, .01, '#616161');
    ell(c, -.14, -1.04, .14, .03, '#43a047', 0, 7, -.08); ell(c, .14, -1.04, .14, .03, '#fbc02d', 0, 7, .08);
    ell(c, 0, -1.04, .025, .025, '#424242');
  }),
  h('halo', 'วงแหวนนางฟ้า · Halo', 'epic', c => {
    c.strokeStyle = 'rgba(255,236,120,.45)'; c.lineWidth = .07; c.beginPath(); c.ellipse(0, -1.1, .2, .06, 0, 0, 7); c.stroke();
    c.strokeStyle = '#ffe14d'; c.lineWidth = .035; c.beginPath(); c.ellipse(0, -1.1, .2, .06, 0, 0, 7); c.stroke();
  }),
  h('devil', 'เขาปีศาจ · Devil horns', 'epic', c => {
    for (const sx of [-1, 1]) {
      c.fillStyle = '#d50000'; c.beginPath(); c.moveTo(sx * .08, -.84); c.quadraticCurveTo(sx * .2, -.9, sx * .26, -1.06); c.quadraticCurveTo(sx * .26, -.88, sx * .2, -.76); c.closePath(); c.fill();
    }
  }),
  h('antenna', 'เสาอากาศเอเลี่ยน · Alien antenna', 'epic', c => {
    for (const sx of [-1, 1]) { line(c, [[sx * .05, -.84], [sx * .12, -1.0], [sx * .2, -1.12]], '#7cb342', .025); ell(c, sx * .2, -1.13, .05, .05, '#c6ff00'); ell(c, sx * .19, -1.145, .015, .015, '#ffffff'); }
    rr(c, -.18, -.86, .36, .05, .025, '#7cb342');
  }),
  { ...h('miner', 'หมวกเหมืองทองคำ · Golden miner', 'legendary', c => {
    // from behind: the elastic strap round the back of the helmet and the battery pack clipped to it (the lamp's light falls
    // on the floor round the mascot, drawn behind it: see `behind`)
    hardHat(c, '#ffd700', '#c9a000');
    rr(c, -.25, -.8, .5, .045, .02, '#3a3f48');
    rr(c, -.07, -.83, .14, .1, .025, '#3a3f48'); rr(c, -.045, -.81, .09, .02, .01, '#ffd700');
    star(c, -.18, -.68, .035, '#ffffff');
  }, c => {
    // from the front (avatars): the lamp and its beam
    hardHat(c, '#ffd700', '#c9a000');
    rr(c, -.08, -.92, .16, .12, .04, '#3a3f48');
    ell(c, 0, -.86, .05, .05, '#fffde7');
    c.fillStyle = 'rgba(255,250,200,.35)'; c.beginPath(); c.moveTo(-.04, -.88); c.lineTo(-.22, -1.28); c.lineTo(.22, -1.28); c.lineTo(.04, -.88); c.closePath(); c.fill();
    star(c, -.18, -.68, .035, '#ffffff');
  }), behind: (c, cy) => {
    // the lamp's light pours down from the helmet to the floor and pools round the feet; the body hides the middle of it
    const top = cy - .25, beam = c.createLinearGradient(0, top, 0, .02);   // starts behind the shoulders, so a crouch never shows it above the head
    beam.addColorStop(0, 'rgba(255,250,200,.15)'); beam.addColorStop(1, 'rgba(255,250,200,.5)');
    c.fillStyle = beam; c.beginPath(); c.moveTo(-.16, top); c.lineTo(-.46, .02); c.lineTo(.46, .02); c.lineTo(.16, top); c.closePath(); c.fill();
    const pool = c.createRadialGradient(0, 0, 0, 0, 0, 1);
    pool.addColorStop(0, 'rgba(255,250,200,.75)'); pool.addColorStop(1, 'rgba(255,250,200,0)');
    c.save(); c.translate(0, .02); c.scale(.55, .12); c.fillStyle = pool; c.beginPath(); c.arc(0, 0, 1, 0, TAU_H); c.fill(); c.restore();
  } },
  h('phoenix', 'หงอนฟีนิกซ์ · Phoenix crest', 'legendary', c => {
    for (const [a, len, col] of [[-.5, .32, '#ff3d00'], [-.25, .4, '#ff9100'], [0, .46, '#ffd600'], [.25, .4, '#ff9100'], [.5, .32, '#ff3d00']] as const) {
      c.save(); c.translate(0, -.82); c.rotate(a);
      c.fillStyle = col; c.beginPath(); c.moveTo(-.045, 0); c.quadraticCurveTo(-.06, -len * .6, 0, -len); c.quadraticCurveTo(.06, -len * .6, .045, 0); c.closePath(); c.fill();
      c.restore();
    }
    ell(c, 0, -.82, .1, .05, '#ffab00');
  }),
  h('astronaut', 'หมวกนักบินอวกาศ · Astronaut', 'legendary', c => {
    c.fillStyle = 'rgba(200,235,255,.28)'; c.beginPath(); c.arc(0, -.66, .38, 0, 7); c.fill();
    c.strokeStyle = '#e3f2fd'; c.lineWidth = .03; c.beginPath(); c.arc(0, -.66, .38, 0, 7); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,.8)'; c.lineWidth = .035; c.beginPath(); c.arc(0, -.66, .3, Math.PI * 1.15, Math.PI * 1.45); c.stroke();
    rr(c, -.3, -.36, .6, .07, .03, '#cfd8dc');
    rr(c, .25, -.98, .03, .14, .015, '#90a4ae'); ell(c, .265, -.99, .03, .03, '#ff5252');
  }),
];

