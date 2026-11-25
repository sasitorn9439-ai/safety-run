/**
 * The slide, drawn from the side (the mascot faces left): it drops back onto its seat, one leg shoots out in front with the shoe
 * tipped up, the other knee is bent, one hand is planted behind for balance and the other is up in front, the cape streams
 * behind and a dust trail fades as it slows down. Same flat style, colours and head as the rest of the set.
 *
 * Unit coordinates as in puppet.ts: origin = the ground under the mascot, y down, so "up" is negative.
 */
import { DEFAULT_LOOK } from '../../cosmetics/skins.js';
import type { Look } from '../../cosmetics/types.js';
import { drawMascotHead, rr, type Ctx } from '../draw.js';

export interface Pt { x: number; y: number }
export interface Puff { x: number; y: number; r: number; a: number; /** drawn in front of the body */ front?: boolean }
export interface SlidePose {
  /** body tilt back from upright (rad; 0 = sitting up, ~0.6 = leaning back into the slide) */ lean: number;
  /** the seat */ hip: Pt;
  /** near leg: 0 = folded, 1 = fully out in front */ reach: number;
  /** far leg: 0 = flat, 1 = knee pulled up */ farKnee: number;
  /** back hand planted on the floor: 0 = still reaching, 1 = pressing down */ brace: number;
  /** front hand, relative to the shoulder */ hand: Pt;
  headTilt: number;
  /** cape wave phase (rad) and how much it is blown up */ cape: number; capeLift: number;
  dust: Puff[];
  /** speed lines behind (0..1 opacity) */ lines: number;
}


const rot = (a: number, x: number, y: number): Pt => ({ x: x * Math.cos(a) - y * Math.sin(a), y: x * Math.sin(a) + y * Math.cos(a) });
const add = (p: Pt, q: Pt): Pt => ({ x: p.x + q.x, y: p.y + q.y });

function limb(c: Ctx, a: Pt, b: Pt, w: number, edge: string, sleeve: string, bend?: Pt) {
  c.lineCap = 'round'; c.lineJoin = 'round';
  for (const [color, width] of [[edge, w + .03], [sleeve, w]] as const) {
    c.beginPath(); c.moveTo(a.x, a.y);
    if (bend) c.quadraticCurveTo(bend.x, bend.y, b.x, b.y); else c.lineTo(b.x, b.y);
    c.strokeStyle = color; c.lineWidth = width; c.stroke();
  }
}

function shoe(c: Ctx, at: Pt, angle: number, dark: string, light: string) {
  c.save(); c.translate(at.x, at.y); c.rotate(angle);
  rr(c, -.1, -.065, .2, .13, .06, dark);
  rr(c, -.08, -.065, .16, .085, .042, light);
  c.restore();
}
const mitt = (c: Ctx, at: Pt, color: string) => rr(c, at.x - .055, at.y - .05, .11, .1, .045, color);

export function puff(c: Ctx, p: Puff) {
  c.save(); c.globalAlpha = p.a;
  c.fillStyle = '#d9d2c6'; c.beginPath(); c.arc(p.x + .008, p.y + .01, p.r, 0, 7); c.fill();
  c.fillStyle = '#f6f2ea'; c.beginPath(); c.arc(p.x, p.y, p.r * .93, 0, 7); c.fill();
  c.fillStyle = '#ffffff'; c.beginPath(); c.arc(p.x - p.r * .3, p.y - p.r * .3, p.r * .4, 0, 7); c.fill();
  c.restore();
}

/** `t`: where this frame sits in the slide (0…1), which drives the look's effect */
export function drawSideSlide(c: Ctx, p: SlidePose, look: Look = DEFAULT_LOOK, t = 0) {
  const pal = look.pal, cy = -.3;
  const BODY = pal.body, RED_D = pal.capeD, RED_L = pal.capeL;
  const leg = (a: Pt, b: Pt, w: number, bend?: Pt) => limb(c, a, b, w, pal.edge, pal.sleeve, bend);
  const foot = (at: Pt, angle: number) => shoe(c, at, angle, pal.shoeD, pal.shoeL);
  look.hat?.behind?.(c, cy);
  look.effect?.back?.(c, t, cy);
  c.save(); c.translate(-.1, 0);                      // centre the whole pose: the dust and cape trail far more to the right than the leg reaches to the left
  const { hip, lean } = p;
  const body = (lx: number, ly: number) => add(hip, rot(lean, lx, ly));
  const S = body(0, -.26);                                                 // shoulders
  const hipJ = { x: hip.x - .03, y: hip.y - .02 };
  const floor = -.055;                                                     // ankle height when it rests on the ground

  // dust behind everything
  for (const d of p.dust) if (!d.front) puff(c, d);

  // far leg (behind the body): knee pulled up, shoe flat on the floor
  const k2 = { x: hipJ.x - .13, y: hipJ.y - .08 - p.farKnee * .11 };
  const a2 = { x: hipJ.x - .20 + p.farKnee * .05, y: Math.min(floor, hipJ.y + .04) };
  leg(hipJ, a2, .1, k2);
  foot({ x: a2.x - .015, y: a2.y }, .1);

  // back arm, braced on the floor behind
  const hb = { x: S.x + .06 + .07 * p.brace, y: S.y + (floor - S.y) * (.35 + .65 * p.brace) };
  leg(add(S, { x: .02, y: .02 }), hb, .085, { x: S.x + .13, y: (S.y + hb.y) / 2 - .02 });
  mitt(c, hb, pal.mitt);

  // cape streaming behind the shoulders
  const root = add(S, rot(lean, .06, -.02)), wv = Math.sin(p.cape);
  const tip = { x: root.x + .4 + p.capeLift * .06, y: root.y + .02 - p.capeLift * .08 + wv * .04 };
  const low = add(S, rot(lean, .06, .17));
  c.fillStyle = RED_D; c.beginPath(); c.moveTo(root.x - .01, root.y - .03);
  c.bezierCurveTo(root.x + .12, root.y - .05 + wv * .03, tip.x - .1, tip.y - .08 - wv * .04, tip.x, tip.y);
  c.bezierCurveTo(tip.x - .05, tip.y + .08 + wv * .05, low.x + .14, low.y + .02, low.x, low.y);
  c.quadraticCurveTo(low.x - .06, low.y - .06, root.x - .04, root.y + .06); c.closePath(); c.fill();
  c.fillStyle = RED_L; c.beginPath(); c.moveTo(root.x, root.y);
  c.bezierCurveTo(root.x + .1, root.y - .03 + wv * .02, tip.x - .14, tip.y - .05 - wv * .03, tip.x - .08, tip.y - .005);
  c.bezierCurveTo(tip.x - .12, tip.y + .04, low.x + .1, low.y - .03, low.x - .02, low.y - .06);
  c.quadraticCurveTo(root.x + .02, root.y + .06, root.x, root.y); c.closePath(); c.fill();

  // torso
  c.save(); c.translate(hip.x, hip.y); c.rotate(lean);
  rr(c, -.155, -.3, .31, .33, .13, BODY);
  c.restore();
  // scarf at the neck
  c.save(); c.translate(S.x, S.y); c.rotate(lean);
  rr(c, -.13, -.045, .26, .085, .04, RED_L);
  c.restore();

  // near leg: straight out in front when reach = 1, folded when 0; the shoe is tipped up
  const phi = .14 + (1 - p.reach) * .85, L = .25;
  const a1 = { x: hipJ.x - Math.cos(phi) * L, y: Math.min(floor - .01, hipJ.y - Math.sin(phi) * L) };
  const k1 = { x: (hipJ.x + a1.x) / 2, y: (hipJ.y + a1.y) / 2 - .035 - (1 - p.reach) * .12 };   // always a soft bend at the knee
  leg(hipJ, a1, .1, k1);
  foot({ x: a1.x - .03, y: a1.y - .035 }, -.8 - (1 - p.reach) * .4);

  // head: big, tipped forward a little so it leads the slide
  const hc = add(S, rot(lean * .65, 0, -.22));
  c.save(); c.translate(hc.x, hc.y); c.rotate(lean * .3 - p.headTilt); c.translate(0, .69); drawMascotHead(c, pal, !look.figure, !!look.figure?.egg); look.figure?.head?.(c, t); look.hat?.draw(c); c.restore();

  // front arm, up for balance
  const hf = add(S, p.hand);
  leg(add(S, { x: -.03, y: .0 }), hf, .085, { x: (S.x + hf.x) / 2 - .02, y: (S.y + hf.y) / 2 + .05 });
  mitt(c, hf, pal.mitt);

  for (const d of p.dust) if (d.front) puff(c, d);
  if (p.lines > 0) {
    c.save(); c.globalAlpha = p.lines; c.strokeStyle = '#ffffff'; c.lineWidth = .02; c.lineCap = 'round';
    for (const [y, x0, x1] of [[-.12, .36, .58], [-.22, .34, .52], [-.32, .38, .5]] as const) { c.beginPath(); c.moveTo(x0, y); c.lineTo(x1, y); c.stroke(); }
    c.restore();
  }
  c.restore();
}
