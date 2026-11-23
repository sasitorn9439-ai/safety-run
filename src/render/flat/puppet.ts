/**
 * The mascot as flat 2D art with every deformation (squash, stretch, lean, tucked legs, raised arms, cape flutter) drawn into
 * the frame, so the game plays frames as they are and never has to scale or rotate the sprite itself.
 *
 * Unit coordinates: 1 unit = 1 game unit `u`, origin = feet on the ground, y grows downward (canvas convention), so
 * "up" is negative. The neutral pose reproduces the run art that `src/render/draw.ts` has always drawn.
 */
import { drawMascotHead, rr, type Ctx } from '../draw.js';
import { puff, type Puff } from './slide.js';

export interface Pt { x: number; y: number }
export interface Foot { /** how far the shoe is raised */ lift: number; /** sideways shift */ dx: number; /** swings the whole leg out from the hip (rad, + = to the left) */ tilt?: number }
export interface Pose2D {
  /** whole-figure squash/stretch about the feet */ sx: number; sy: number;
  /** body raise (positive = up) and lean about the feet (radians, + = clockwise on screen) */ dy: number; rot: number;
  head: { dx: number; dy: number; rot: number };
  footL: Foot; footR: Foot;
  /** where each mitt is (y up = negative) */ handL: Pt; handR: Pt;
  /** cape tails: how far each tip hangs lower (+) or flies higher (−), and the middle hem */ cape: { tipL: number; tipR: number; mid: number; spread: number };
  /** how much of the squash/stretch the head ignores (0 = squashed with the body, 1 = keeps its round shape) */
  headKeep?: number;
  /** effects in world coordinates: dust puffs (behind, or in front when `front`) and speed lines (0..1 opacity) */
  fx?: { dust?: Puff[]; lines?: number };
}

export const neutral = (): Pose2D => ({
  sx: 1, sy: 1, dy: 0, rot: 0, head: { dx: 0, dy: 0, rot: 0 },
  footL: { lift: 0, dx: 0 }, footR: { lift: 0, dx: 0 },
  handL: { x: -.213, y: -.286 }, handR: { x: .213, y: -.286 },
  cape: { tipL: 0, tipR: 0, mid: 0, spread: 0 },
});

function foot(c: Ctx, side: number, f: Foot) {
  const x = side * .105 + f.dx;
  c.save();
  if (f.tilt) { c.translate(x, -.2); c.rotate(side < 0 ? f.tilt : -f.tilt); c.translate(-x, .2); }          // swing the leg out from the hip
  rr(c, x - .059, -.25 - f.lift, .118, .20, .06, '#fff7f4');
  rr(c, x - .073, -.115 - f.lift, .146, .11, .05, '#b7212b');
  rr(c, x - .060, -.115 - f.lift, .12, .072, .035, '#ec3c43');
  c.restore();
}

function arm(c: Ctx, side: number, hand: Pt) {
  const sx = side * .165, sy = -.40;
  // bend the elbow slightly outward so a raised arm doesn't look like a stick
  const mx = (sx + hand.x) / 2 + side * .035, my = (sy + hand.y) / 2;
  c.lineCap = 'round'; c.lineJoin = 'round';
  c.beginPath(); c.moveTo(sx, sy); c.quadraticCurveTo(mx, my, hand.x, hand.y);
  c.strokeStyle = '#cdc1be'; c.lineWidth = .112; c.stroke();
  c.strokeStyle = '#fff7f4'; c.lineWidth = .086; c.stroke();
  rr(c, hand.x - .055, hand.y - .049, .11, .098, .043, '#e7343e');
}

/** speed lines: short vertical streaks either side (the mascot runs away from the camera, so the air rushes down the screen) */
function speedLines(c: Ctx, a: number) {
  c.save(); c.globalAlpha = a; c.strokeStyle = '#ffffff'; c.lineWidth = .02; c.lineCap = 'round';
  for (const [x, y0, y1] of [[-.52, -.78, -.6], [-.44, -.62, -.5], [.52, -.78, -.6], [.44, -.62, -.5], [-.58, -.5, -.4], [.58, -.5, -.4]] as const) { c.beginPath(); c.moveTo(x, y0); c.lineTo(x, y1); c.stroke(); }
  c.restore();
}

export function drawPuppet(c: Ctx, p: Pose2D) {
  for (const d of p.fx?.dust ?? []) if (!d.front) puff(c, d);
  if (p.fx?.lines) speedLines(c, p.fx.lines);
  c.save();
  c.rotate(p.rot);
  c.scale(p.sx, p.sy);
  c.translate(0, -p.dy);

  // legs stay planted on the ground unless lifted; the body floats above them
  c.save(); c.translate(0, p.dy); foot(c, -1, p.footL); foot(c, 1, p.footR); c.restore();
  rr(c, -.16, -.49, .32, .32, .13, '#eee6e3');
  arm(c, -1, p.handL); arm(c, 1, p.handR);

  const k = p.cape;
  c.fillStyle = '#b7212b'; c.beginPath();
  c.moveTo(-.18, -.49); c.quadraticCurveTo(0, -.43, .18, -.49);
  c.quadraticCurveTo(.24 + k.spread * .5, -.28, .31 + k.spread, -.24 + k.tipR);
  c.quadraticCurveTo(.16, -.19, .04, -.22 + k.mid);
  c.quadraticCurveTo(-.09, -.16, -.25 - k.spread, -.24 + k.tipL); c.closePath(); c.fill();
  c.fillStyle = '#ee3e46'; c.beginPath();
  c.moveTo(-.17, -.47); c.quadraticCurveTo(.04, -.41, .17, -.47);
  c.quadraticCurveTo(.18, -.32, .25 + k.spread * .8, -.26 + k.tipR);
  c.quadraticCurveTo(.04, -.26, -.03, -.23 + k.mid * .6);
  c.quadraticCurveTo(-.13, -.28, -.21 - k.spread * .8, -.25 + k.tipL); c.closePath(); c.fill();

  // head, pivoting at the neck
  c.save(); c.translate(p.head.dx, -p.head.dy); c.translate(0, -.47); c.rotate(p.head.rot);
  const keep = p.headKeep ?? 0;                      // slides squash the body but keep the head round
  if (keep) c.scale((1 + (p.sx - 1) * (1 - keep)) / p.sx, (1 + (p.sy - 1) * (1 - keep)) / p.sy);
  c.translate(0, .47);
  drawMascotHead(c);
  c.restore();
  c.restore();
  for (const d of p.fx?.dust ?? []) if (d.front) puff(c, d);
}
