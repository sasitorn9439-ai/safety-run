/**
 * Vector art for every sprite. Each function draws at the origin (feet, centre of the object) in units of `u` pixels,
 * so the sprite builder can rasterise it once per size. Nothing here runs per frame.
 */
import type { HazardKind, PpeType } from '../../shared/hazards.js';
import { PPE_ICON_OF, drawPpeIcon } from './ppe-icons.js';

export type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export function rr(c: Ctx, x: number, y: number, w: number, h: number, r: number, color: string) {
  c.fillStyle = color; c.beginPath(); c.roundRect(x, y, w, h, r); c.fill();
}

const INK = '#3b2a10';

/**
 * The five PPE pickups' icons: the flat vector illustrations from ppe-icons.ts (hard hat, work gloves, safety glasses, ear muffs,
 * work boot). `r` = half the icon's size; centred on (x, y).
 */
export function ppeIcon(c: Ctx, t: PpeType, x: number, y: number, r: number) {
  c.save(); c.translate(x, y);
  drawPpeIcon(c, PPE_ICON_OF[t], r * 2.05);
  c.restore();
}

/** PPE pickup: just the flat vector item itself, floating (no frame). Centred on the origin; `u` = the sprite unit. */
export function drawPpeBadge(c: Ctx, t: PpeType, u: number) {
  drawPpeIcon(c, PPE_ICON_OF[t], u * .58);
}

/** A coin: flat gold disc, dark outline, a darker inner ring and a shine. Centred on the origin, diameter about .42 u. */
export function drawCoin(c: Ctx, u: number) {
  const R = u * .21;
  c.fillStyle = INK; c.beginPath(); c.arc(0, R * .06, R * 1.08, 0, 7); c.fill();
  c.fillStyle = '#ffd400'; c.beginPath(); c.arc(0, 0, R, 0, 7); c.fill();
  c.fillStyle = '#f0a500'; c.beginPath(); c.arc(0, 0, R * .72, 0, 7); c.fill();                       // inner ring
  c.fillStyle = '#ffe56b'; c.beginPath(); c.arc(0, 0, R * .6, 0, 7); c.fill();                        // face
  c.fillStyle = '#f0a500'; c.beginPath(); c.roundRect(-R * .13, -R * .38, R * .26, R * .76, R * .1); c.fill();   // embossed bar
  c.fillStyle = 'rgba(255,255,255,.8)'; c.beginPath(); c.ellipse(-R * .5, -R * .52, R * .2, R * .09, -.7, 0, 7); c.fill();   // shine
}

/** The soft golden glow behind a pickup, origin = centre, radius 1 unit. */
export function drawHalo(c: Ctx, u: number) {
  const g = c.createRadialGradient(0, 0, u * .15, 0, 0, u);
  g.addColorStop(0, 'rgba(255,224,90,.7)'); g.addColorStop(.4, 'rgba(255,200,40,.26)'); g.addColorStop(1, 'rgba(255,200,40,0)');
  c.fillStyle = g; c.beginPath(); c.arc(0, 0, u, 0, 7); c.fill();
}

export function drawHazard(c: Ctx, k: HazardKind, u: number, blink = false) {
  const x = 0, g = 0, Y = (w: number) => g - w * u * .9;
  if (k === 'spill') {
    c.fillStyle = '#438eaf'; c.beginPath();
    c.moveTo(x - u * .46, g + u * .03);
    c.bezierCurveTo(x - u * .52, g - u * .05, x - u * .25, g - u * .05, x - u * .25, g - u * .1);
    c.bezierCurveTo(x - u * .16, g - u * .18, x + u * .17, g - u * .13, x + u * .21, g - u * .08);
    c.bezierCurveTo(x + u * .49, g - u * .07, x + u * .44, g + u * .09, x + u * .18, g + u * .1);
    c.bezierCurveTo(x - u * .04, g + u * .15, x - u * .34, g + u * .13, x - u * .46, g + u * .03);
    c.fill();
    c.fillStyle = '#a5dfee'; c.beginPath();
    c.ellipse(x - u * .18, g - u * .025, u * .16, u * .02, -.09, 0, 7);
    c.ellipse(x + u * .08, g + u * .05, u * .1, u * .016, -.09, 0, 7); c.fill();
    // the wet-floor sign is what you see from far away, so it is drawn tall (the puddle itself is flat)
    c.save(); c.translate(x + u * .3, g); c.scale(1.7, 1.7);
    const sign = 0;
    rr(c, sign - u * .01, g - u * .25, u * .14, u * .25, u * .025, '#b58a09');
    c.fillStyle = '#ffd400'; c.beginPath();
    c.moveTo(sign - u * .07, g); c.lineTo(sign - u * .035, g - u * .29);
    c.lineTo(sign + u * .07, g - u * .29); c.lineTo(sign + u * .105, g); c.fill();
    rr(c, sign, g - u * .262, u * .04, u * .027, u * .009, '#473900');
    c.fillStyle = '#352900'; c.font = `800 ${u * .13}px Kanit`; c.textAlign = 'center';
    c.fillText('!', sign + u * .019, g - u * .065);
    c.restore();
  }
  if (k === 'hose') {
    c.save(); c.lineCap = 'round';
    c.beginPath();
    c.moveTo(x - u * .43, g + u * .015);
    c.bezierCurveTo(x - u * .21, g + u * .14, x + u * .35, g + u * .1, x + u * .32, g - u * .04);
    c.bezierCurveTo(x + u * .29, g - u * .17, x - u * .32, g - u * .17, x - u * .29, g - u * .035);
    c.bezierCurveTo(x - u * .27, g + u * .055, x + u * .18, g + u * .04, x + u * .17, g - u * .02);
    c.bezierCurveTo(x + u * .17, g - u * .075, x - u * .09, g - u * .095, x - u * .13, g - u * .045);
    c.strokeStyle = '#771d28'; c.lineWidth = u * .092; c.stroke();
    c.strokeStyle = '#ef5150'; c.lineWidth = u * .057; c.stroke();
    rr(c, x - u * .48, g - u * .022, u * .10, u * .077, u * .017, '#a8b4be');
    rr(c, x - u * .48, g - u * .022, u * .025, u * .077, u * .009, '#54616d');
    c.restore();
    // a traffic cone beside it: tall enough to read from far away
    const cx = x + u * .4;
    rr(c, cx - u * .12, g - u * .03, u * .24, u * .05, u * .02, '#2f2f2f');
    c.fillStyle = '#ff7a1a'; c.beginPath();
    c.moveTo(cx - u * .09, g - u * .03); c.lineTo(cx - u * .03, g - u * .46); c.lineTo(cx + u * .03, g - u * .46); c.lineTo(cx + u * .09, g - u * .03); c.fill();
    c.fillStyle = '#fff'; c.beginPath();
    c.moveTo(cx - u * .066, g - u * .15); c.lineTo(cx - u * .052, g - u * .24); c.lineTo(cx + u * .052, g - u * .24); c.lineTo(cx + u * .066, g - u * .15); c.fill();
  }
  if (k === 'pipe') {
    // Scaffolding: you slide through the opening at the bottom; everything above it is closed boards and braces,
    // all the way up past the top of a jump, so it can't be jumped over. Units here are plain `u`, up is -y.
    const yy = (h: number) => g - h * u, OPEN = .66, BEAM = .13, TOP = 1.95, HALF = .5;
    const tube = '#9aa3ad', tubeHi = '#c4ccd5', dark = '#323a44';
    // fully closed above the opening: wooden boards over the header, corrugated steel sheet above them
    const b0 = OPEN + BEAM, b1 = 1.54;
    c.fillStyle = '#c8955a'; c.fillRect(x - u * HALF, yy(b1), u * 2 * HALF, yy(b0) - yy(b1));
    c.fillStyle = '#9a6e3e'; for (let h = b0 + .11; h < b1; h += .11) c.fillRect(x - u * HALF, yy(h) - u * .008, u * 2 * HALF, u * .016);
    c.fillStyle = '#7b8693'; c.fillRect(x - u * HALF, yy(TOP), u * 2 * HALF, yy(b1) - yy(TOP));
    c.fillStyle = '#5f6a76'; for (let sx = x - u * HALF + u * .05; sx < x + u * HALF; sx += u * .1) c.fillRect(sx, yy(TOP), u * .04, yy(b1) - yy(TOP));
    c.strokeStyle = tube; c.lineWidth = u * .04; c.lineCap = 'butt';
    c.beginPath(); c.moveTo(x - u * HALF, yy(b1)); c.lineTo(x + u * HALF, yy(TOP)); c.moveTo(x + u * HALF, yy(b1)); c.lineTo(x - u * HALF, yy(TOP)); c.stroke();
    // horizontal tubes (ledgers) at every deck level
    for (const h of [b1, TOP]) { c.fillStyle = tube; c.fillRect(x - u * (HALF + .02), yy(h) - u * .03, u * (2 * HALF + .04), u * .06); c.fillStyle = tubeHi; c.fillRect(x - u * (HALF + .02), yy(h) - u * .03, u * (2 * HALF + .04), u * .02); }
    // the header beam over the opening: yellow-black hazard stripes
    c.save(); c.beginPath(); c.rect(x - u * (HALF + .02), yy(OPEN + BEAM), u * (2 * HALF + .04), u * BEAM); c.clip();
    c.fillStyle = '#ffd400'; c.fillRect(x - u * .6, yy(OPEN + BEAM), u * 1.2, u * BEAM); c.fillStyle = '#151515';
    for (let i = -6; i < 8; i++) { const sx = x - u * .6 + i * u * .16; c.beginPath(); c.moveTo(sx, yy(OPEN)); c.lineTo(sx + u * .08, yy(OPEN)); c.lineTo(sx + u * .08 + u * BEAM, yy(OPEN + BEAM)); c.lineTo(sx + u * BEAM, yy(OPEN + BEAM)); c.fill(); }
    c.restore();
    // uprights with base plates, drawn last so they sit in front of the beam ends
    for (const side of [-1, 1]) {
      const px = x + side * u * (HALF - .035);
      c.fillStyle = tube; c.fillRect(px - u * .04, yy(TOP + .05), u * .08, u * (TOP + .05));
      c.fillStyle = tubeHi; c.fillRect(px - u * .04, yy(TOP + .05), u * .025, u * (TOP + .05));
      c.fillStyle = dark; c.fillRect(px - u * .08, g - u * .03, u * .16, u * .03);
    }
    // the warning plate on the boards
    rr(c, x - u * .24, yy(1.0), u * .48, u * .13, u * .03, '#fff');
    c.fillStyle = '#c62828'; c.font = `600 ${u * .09}px Kanit`; c.textAlign = 'center'; c.fillText('ระวังศีรษะ', x, yy(1.0) + u * .105);
  }
  if (k === 'pallet') {
    rr(c, x - u * .42, g - u * .12, u * .84, u * .12, 2, '#7a5230');
    c.fillStyle = '#3d2a18'; for (const s of [-.25, .15]) c.fillRect(x + s * u, g - u * .08, u * .12, u * .08);
    for (let i = 0; i < 3; i++) {
      const lx = x - u * .38 + i * u * .05, ly = g - u * .12 - (i + 1) * u * .34;
      rr(c, lx, ly, u * .76, u * .32, 3, i % 2 ? '#b98149' : '#c8955a');
      c.fillStyle = '#e8c48a'; c.fillRect(lx + u * .34, ly, u * .08, u * .32);
    }
    c.fillStyle = '#ffd400'; c.font = `800 ${u * .2}px Kanit`; c.textAlign = 'center'; c.fillText('!', x + u * .12, g - u * .82);
  }
  if (k === 'forklift') {
    c.fillStyle = '#222'; c.fillRect(x - u * .42, g - u * .16, u * .16, u * .16); c.fillRect(x + u * .26, g - u * .16, u * .16, u * .16);
    rr(c, x - u * .4, g - u * .62, u * .8, u * .5, u * .05, '#f2b705'); rr(c, x - u * .4, g - u * .62, u * .8, u * .1, u * .04, '#ffd84a');
    c.fillStyle = '#333'; for (const s of [-.34, .3]) c.fillRect(x + s * u, g - u * 1.2, u * .04, u * .6);
    rr(c, x - u * .38, g - u * 1.24, u * .76, u * .06, 2, '#333');
    c.fillStyle = blink ? '#ff6d00' : '#7a3300'; c.beginPath(); c.arc(x, g - u * 1.3, u * .06, 0, 7); c.fill();
    c.fillStyle = '#2b2b2b'; c.fillRect(x - u * .24, g - u * 1.12, u * .06, u * 1.1); c.fillRect(x + u * .18, g - u * 1.12, u * .06, u * 1.1); c.fillRect(x - u * .24, g - u * .8, u * .48, u * .05);
    c.fillStyle = '#888'; c.fillRect(x - u * .2, g - u * .06, u * .08, u * .06); c.fillRect(x + u * .12, g - u * .06, u * .08, u * .06);
    c.fillStyle = '#fffde0'; for (const s of [-.32, .32]) { c.beginPath(); c.arc(x + s * u, g - u * .48, u * .045, 0, 7); c.fill(); }
  }
}

/** Sprite bounding boxes in units of u: [x0, y0, x1, y1] (y is negative upward). */
export const HAZARD_BOX: Record<HazardKind, [number, number, number, number]> = {
  spill: [-.62, -.54, .62, .24],
  hose: [-.56, -.5, .56, .2],
  pipe: [-.58, -2.02, .58, .06],
  pallet: [-.5, -1.22, .5, .06],
  forklift: [-.5, -1.4, .5, .06],
};

/* ---------- mascot (unit coordinates, 1 unit = u) ---------- */

/**
 * The head, seen from behind. The red crystal grows out of the crown: its base is hidden by the head, so what shows is a
 * two-tone red wedge rising above the head (as on the official sticker sheet, assets/mascot-reference/), not a diamond laid over it.
 */
export function drawMascotHead(c: Ctx) {
  // crystal first: the head is drawn over its base
  c.lineJoin = 'round';
  const poly = (pts: number[][], fill: string) => { c.fillStyle = fill; c.beginPath(); c.moveTo(pts[0]![0]!, pts[0]![1]!); for (const p of pts.slice(1)) c.lineTo(p[0]!, p[1]!); c.closePath(); c.fill(); };
  // everything is symmetric about x = 0, the mascot's centre line. The lower corners are tucked inside the head's outline.
  poly([[-.15, -.825], [0, -.995], [0, -.76], [-.12, -.72]], '#ee3e46');         // left face, lit
  poly([[0, -.995], [.15, -.825], [.12, -.72], [0, -.76]], '#c4222b');           // right face, in shade
  poly([[-.15, -.825], [0, -.995], [-.06, -.86]], '#fa5860');                    // highlight on the upper left edge
  c.strokeStyle = '#a81c25'; c.lineWidth = .009;
  c.beginPath(); c.moveTo(-.15, -.825); c.lineTo(0, -.995); c.lineTo(.15, -.825); c.stroke();

  // a rounded triangle (an onigiri): the apex is smooth because the crystal's base sits right behind it
  c.fillStyle = '#fff9f6'; c.strokeStyle = '#c9bcb9'; c.lineWidth = .013; c.beginPath();
  c.moveTo(0, -.865); c.bezierCurveTo(.08, -.86, .24, -.74, .26, -.575);
  c.quadraticCurveTo(.28, -.46, 0, -.44);
  c.quadraticCurveTo(-.28, -.46, -.26, -.575);
  c.bezierCurveTo(-.24, -.74, -.08, -.86, 0, -.865); c.closePath(); c.fill(); c.stroke();
}

/** One frame of the run cycle. `ph` is the stride phase in radians; the cycle loops every 2π. */
export function drawMascotRun(c: Ctx, ph: number) {
  const stride = Math.sin(ph), flutter = Math.sin(ph + 1) * .035;
  for (const side of [-1, 1]) {
    const foot = Math.max(0, side * stride) * .085;
    rr(c, side * .105 - .059, -.25 - foot, .118, .20, .06, '#fff7f4');
    rr(c, side * .105 - .073, -.115 - foot, .146, .11, .05, '#b7212b');
    rr(c, side * .105 - .060, -.115 - foot, .12, .072, .035, '#ec3c43');
  }
  rr(c, -.16, -.49, .32, .32, .13, '#eee6e3');
  for (const side of [-1, 1]) {
    const hand = -.33 + side * stride * .07;
    rr(c, side * .199 - .052, hand - .11, .104, .15, .05, '#fff7f4');
    rr(c, side * .213 - .055, hand - .005, .11, .098, .043, '#e7343e');
  }
  c.fillStyle = '#b7212b'; c.beginPath();
  c.moveTo(-.18, -.49); c.quadraticCurveTo(0, -.43, .18, -.49);
  c.quadraticCurveTo(.24, -.28, .31, -.24 + flutter);
  c.quadraticCurveTo(.16, -.19, .04, -.22 - flutter);
  c.quadraticCurveTo(-.09, -.16, -.25, -.24 + flutter); c.closePath(); c.fill();
  c.fillStyle = '#ee3e46'; c.beginPath();
  c.moveTo(-.17, -.47); c.quadraticCurveTo(.04, -.41, .17, -.47);
  c.quadraticCurveTo(.18, -.32, .25, -.26 + flutter);
  c.quadraticCurveTo(.04, -.26, -.03, -.23);
  c.quadraticCurveTo(-.13, -.28, -.21, -.25 + flutter); c.closePath(); c.fill();
  drawMascotHead(c);
}

const ease = (v: number) => { const t = Math.max(0, Math.min(1, v)); return t * t * (3 - 2 * t); };

/** `progress` 0 → 1 over the slide. */
export function drawMascotSlide(c: Ctx, progress: number) {
  const settle = ease(progress / .24);
  const recover = ease((progress - .67) / .33);
  const drop = settle * (1 - recover);
  const plant = ease((progress - .05) / .18) * (1 - ease((progress - .70) / .15));
  const trail = ease((progress - .08) / .24) * (1 - recover);
  const lean = -.115 * drop, hip = -.23 + .10 * drop;

  c.lineCap = 'round'; c.lineJoin = 'round';
  for (const side of [-1, 1]) {
    const bent = side === 1;
    const legX = side * .105, heelX = legX + side * .024 * drop;
    const kneeY = hip - (bent ? .16 : .06) * drop;
    const heelY = hip - (bent ? .07 * drop : .22 * trail);
    c.beginPath();
    c.moveTo(lean + legX * .65, hip); c.lineTo(legX, kneeY); c.lineTo(heelX, heelY);
    c.strokeStyle = '#c9bcb9'; c.lineWidth = .115; c.stroke();
    c.strokeStyle = '#fff7f4'; c.lineWidth = .088; c.stroke();
    rr(c, heelX - .064, heelY - .07, .128, .08, .04, '#e7343e');
  }

  c.save(); c.translate(lean, hip - .06); c.rotate(-.24 * drop);
  rr(c, -.16, -.16, .32, .23, .10, '#fff7f4');
  c.fillStyle = '#c72631'; c.beginPath();
  c.moveTo(-.15, -.15); c.quadraticCurveTo(.06, -.18, .15, -.14);
  c.quadraticCurveTo(.22, -.02, .27 + .045 * trail, .06);
  c.quadraticCurveTo(.07, .04, -.03, .10);
  c.quadraticCurveTo(-.16, .07, -.23, .045); c.closePath(); c.fill();
  c.restore();

  for (const side of [-1, 1]) {
    const brace = side === -1;
    const shoulderX = lean + side * .112, shoulderY = hip - .13;
    const handX = brace ? (lean - .205) * (1 - plant) - .335 * plant : lean + .205;
    const handY = brace ? (hip - .075) * (1 - plant) - .044 * plant : hip - .075 - .045 * drop;
    const elbowX = brace ? shoulderX - .065 * plant : shoulderX + .055;
    const elbowY = (shoulderY + handY) / 2 - .035 * drop;
    c.strokeStyle = '#eee6e3'; c.lineWidth = .09; c.beginPath();
    c.moveTo(shoulderX, shoulderY); c.quadraticCurveTo(elbowX, elbowY, handX, handY); c.stroke();
    rr(c, handX - .049, handY - .042, .098, .074, .036, '#e7343e');
  }

  c.translate(lean, -.02 + .34 * drop);
  c.translate(0, -.64); c.rotate(-.12 * drop); c.translate(0, .64);
  drawMascotHead(c);
}

/** Safety officer (the surprise character), `S` px tall-ish, origin = body centre. Shown as a DOM image. */
export function drawOfficer(c: Ctx, S: number, wave = 0) {
  rr(c, -S * .2, -S * .05, S * .42, S * .6, S * .08, '#2f6fb3'); rr(c, -S * .2, -S * .05, S * .42, S * .42, S * .08, '#c6f04a'); c.fillStyle = '#2f6fb3'; c.fillRect(-S * .04, -S * .05, S * .08, S * .42);
  c.fillStyle = '#1b1b1b'; c.font = `800 ${S * .07}px Kanit`; c.textAlign = 'center'; c.fillText('SAFETY', S * .01, S * .2);
  c.save(); c.translate(-S * .18, 0); c.rotate(-2.2 + wave * .5); rr(c, -S * .045, 0, S * .09, S * .34, S * .04, '#c6f04a'); c.fillStyle = '#c98d63'; c.beginPath(); c.arc(0, S * .36, S * .055, 0, 7); c.fill(); c.restore();
  c.fillStyle = '#c98d63'; c.beginPath(); c.arc(0, -S * .17, S * .13, 0, 7); c.fill();
  c.fillStyle = '#222'; c.beginPath(); c.arc(-S * .045, -S * .18, S * .016, 0, 7); c.arc(S * .045, -S * .18, S * .016, 0, 7); c.fill();
  c.strokeStyle = '#222'; c.lineWidth = S * .014; c.beginPath(); c.arc(0, -S * .14, S * .05, .2, Math.PI - .2); c.stroke();
  c.fillStyle = '#fff'; c.beginPath(); c.arc(0, -S * .22, S * .15, Math.PI, 0); c.fill(); rr(c, -S * .19, -S * .24, S * .38, S * .05, S * .02, '#e6e6e6');
}

/* ---------- scenery (art units; origin as noted) ---------- */

/** Corridor pillar, origin = bottom centre. 0.38 wide, 7.2 tall, hazard stripes at the base. */
export function drawPillar(c: Ctx, u: number) {
  const w = .38 * u, h = 7.2 * u;
  c.fillStyle = '#4a5059'; c.fillRect(-w / 2, -h, w, h);
  c.fillStyle = '#5d646e'; c.fillRect(-w / 2, -h, w * .35, h);
  const bh = .5 * u;
  for (let i = 0; i < 4; i++) { c.fillStyle = i % 2 ? '#1a1a1a' : '#ffd400'; c.fillRect(-w / 2, -bh + i * bh / 4, w, bh / 4); }
}

/** Ceiling light: soft glow plus a bright bar, origin = centre. */
export function drawLight(c: Ctx, u: number) {
  c.fillStyle = 'rgba(255,250,220,.12)'; c.beginPath(); c.ellipse(0, 0, 1.1 * u, .275 * u, 0, 0, 7); c.fill();
  c.fillStyle = '#fffbe6'; c.beginPath(); c.roundRect(-.55 * u, -.02 * u, 1.1 * u, .05 * u, .02 * u); c.fill();
}

/** Shield bubble around the mascot, origin = centre. */
export function drawShield(c: Ctx, u: number) {
  c.fillStyle = 'rgba(90,210,255,.18)'; c.strokeStyle = 'rgba(120,225,255,.8)'; c.lineWidth = .03 * u;
  c.beginPath(); c.ellipse(0, 0, .42 * u, .66 * u, 0, 0, 7); c.fill(); c.stroke();
}

/** Plain white disc, origin = centre, radius 0.5. Tinted at draw time for particles. */
export function drawDot(c: Ctx, u: number) {
  c.fillStyle = '#fff'; c.beginPath(); c.arc(0, 0, .5 * u, 0, 7); c.fill();
}

/** Soft ground shadow: wide, flat, fading to the edge. Origin = centre, 1 unit wide. */
export function drawShadow(c: Ctx, u: number) {
  c.save(); c.scale(1, .24);
  const g = c.createRadialGradient(0, 0, 0, 0, 0, u * .5);
  g.addColorStop(0, 'rgba(0,0,0,.55)'); g.addColorStop(.65, 'rgba(0,0,0,.3)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g; c.beginPath(); c.arc(0, 0, u * .5, 0, 7); c.fill(); c.restore();
}
