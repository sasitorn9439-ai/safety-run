/**
 * The mascot's head seen from the front, for avatars. In the game the camera only ever sees the mascot's back, so the face,
 * the crystal from the front and the front of each hat and custom skin live here.
 *
 * Head coordinates, the same as the back view (drawMascotHead): the head spans y −0.865…−0.44 and x ±0.27, the crystal
 * reaches up to y −0.995. A hat's `front` (or its `draw`, when it looks the same from both sides) is drawn last.
 */
import { rr, type Ctx } from '../render/draw.js';
import type { FrontFigure, Look, Palette } from './types.js';

const TAU = Math.PI * 2;
const ell = (c: Ctx, x: number, y: number, rx: number, ry: number, fill: string, rot = 0) => {
  c.fillStyle = fill; c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, TAU); c.fill();
};
const tri = (c: Ctx, pts: readonly (readonly [number, number])[], fill: string) => {
  c.fillStyle = fill; c.beginPath(); c.moveTo(pts[0]![0], pts[0]![1]); for (const p of pts.slice(1)) c.lineTo(p[0], p[1]); c.closePath(); c.fill();
};

/** the onigiri outline, the same path as the back view (added to the current path, which it starts unless `keep`) */
export function headPath(c: Ctx, keep = false) {
  if (!keep) c.beginPath();
  c.moveTo(0, -.865); c.bezierCurveTo(.08, -.86, .24, -.74, .26, -.575);
  c.quadraticCurveTo(.28, -.46, 0, -.44);
  c.quadraticCurveTo(-.28, -.46, -.26, -.575);
  c.bezierCurveTo(-.24, -.74, -.08, -.86, 0, -.865); c.closePath();
}

/** the crystal from the front: a diamond whose lower point rests on the forehead */
function gem(c: Ctx, pal: Palette) {
  c.lineJoin = 'round';
  tri(c, [[0, -1.0], [-.15, -.83], [0, -.7]], pal.gemL);
  tri(c, [[0, -1.0], [.15, -.83], [0, -.7]], pal.gemR);
  tri(c, [[0, -1.0], [-.15, -.83], [-.05, -.85]], pal.gemHi);
  c.strokeStyle = pal.gemEdge; c.lineWidth = .009; c.beginPath();
  c.moveTo(0, -1.0); c.lineTo(.15, -.83); c.lineTo(0, -.7); c.lineTo(-.15, -.83); c.closePath(); c.stroke();
}

function face(c: Ctx, f: FrontFigure | undefined) {
  ell(c, -.17, -.53, .045, .026, 'rgba(255,120,140,.35)');                    // blush
  ell(c, .17, -.53, .045, .026, 'rgba(255,120,140,.35)');
  for (const s of [-1, 1]) {
    if (f?.eyes === 'led') { rr(c, s * .1 - .04, -.625, .08, .045, .015, '#0d47a1'); rr(c, s * .1 - .03, -.618, .06, .03, .01, '#4fc3f7'); continue; }
    const big = f?.eyes === 'big' ? 1.45 : 1;
    ell(c, s * .1, -.6, .036 * big, .047 * big, '#231a18');
    ell(c, s * .1 - .012 * big, -.616, .013 * big, .016 * big, '#ffffff');
  }
  if (f?.mouth === false) return;
  c.fillStyle = '#7a1f24'; c.beginPath(); c.moveTo(-.045, -.535); c.quadraticCurveTo(0, -.53, .045, -.535); c.quadraticCurveTo(0, -.47, -.045, -.535); c.fill();
  ell(c, 0, -.502, .022, .012, '#ff7b86');
}

/**
 * The upper body under the head (in head coordinates, so it lines up below it): two short arms ending in mitts at the sides,
 * the torso over the arms' roots (in the sleeve colour, so arm and body read as one piece), and the scarf as a triangle
 * hanging from the middle of the neck. Matches design/avatar-front.svg.
 */
export function drawFrontShoulders(c: Ctx, pal: Palette) {
  c.lineCap = 'round';
  for (const s of [-1, 1]) {
    c.beginPath(); c.moveTo(s * .12, -.43); c.quadraticCurveTo(s * .22, -.45, s * .235, -.385);
    c.strokeStyle = pal.edge; c.lineWidth = .09; c.stroke();
    c.strokeStyle = pal.sleeve; c.lineWidth = .068; c.stroke();
    ell(c, s * .24, -.37, .056, .05, pal.mitt);
    ell(c, s * .225, -.385, .02, .014, 'rgba(255,255,255,.3)');                     // a glint on the mitt
  }
  rr(c, -.17, -.5, .34, .34, .13, pal.sleeve);
  c.lineJoin = 'round';
  c.fillStyle = pal.capeD; c.beginPath(); c.moveTo(-.15, -.47); c.quadraticCurveTo(0, -.43, .15, -.47); c.lineTo(0, -.3); c.closePath(); c.fill();
  c.fillStyle = pal.capeL; c.beginPath(); c.moveTo(-.13, -.465); c.quadraticCurveTo(0, -.435, .13, -.465); c.lineTo(0, -.325); c.closePath(); c.fill();
}

/** the head from the front in `look`: face, crystal (or the custom skin's parts) and the front of the hat */
export function drawFrontHead(c: Ctx, look: Look) {
  const pal = look.pal, f = look.figure?.front;
  f?.behind?.(c);
  c.fillStyle = pal.head; c.strokeStyle = pal.headEdge; c.lineWidth = .013; headPath(c); c.fill(); c.stroke();
  if (f?.skin) { c.save(); headPath(c); c.clip(); f.skin(c); c.restore(); }
  face(c, f);
  if (!look.figure) gem(c, pal);
  f?.over?.(c);
  if (look.hat) (look.hat.front ?? look.hat.draw)(c);
}
