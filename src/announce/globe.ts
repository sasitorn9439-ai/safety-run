/**
 * A spinning globe drawn on a canvas in the deck's three colours, with a ribbon-and-arrowhead route that runs round it.
 * Orthographic projection of coarse continent outlines; the route is the great circle that leaves Bangkok heading east.
 */
import { BURGUNDY, BUTTER, PINK } from './art.js';

type LL = [number, number]; // [lon, lat]

const LAND: LL[][] = [
  // North America
  [[-166, 60], [-158, 58], [-146, 60], [-133, 56], [-125, 48], [-124, 40], [-117, 32], [-114, 31], [-110, 24], [-105, 20], [-92, 14], [-86, 11], [-80, 8], [-79, 9], [-83, 10], [-83, 15], [-88, 16], [-87, 21], [-90, 21], [-97, 21], [-97, 26], [-90, 29], [-80, 25], [-81, 31], [-76, 38], [-67, 45], [-56, 52], [-62, 60], [-80, 68], [-95, 72], [-125, 70], [-155, 71], [-165, 64]],
  // Greenland
  [[-55, 60], [-40, 65], [-20, 70], [-20, 80], [-60, 82], [-70, 76], [-58, 68]],
  // South America
  [[-80, 8], [-72, 12], [-62, 10], [-52, 5], [-50, 0], [-35, -6], [-39, -14], [-41, -22], [-48, -26], [-58, -35], [-65, -41], [-68, -52], [-72, -53], [-75, -46], [-72, -30], [-70, -18], [-76, -14], [-81, -5], [-79, 2], [-77, 8]],
  // Africa
  [[-17, 21], [-13, 28], [-6, 35], [10, 37], [20, 32], [32, 31], [35, 28], [43, 12], [51, 12], [40, -3], [40, -15], [35, -24], [32, -29], [20, -35], [17, -30], [12, -17], [13, -6], [9, 3], [-8, 4], [-17, 14]],
  // Eurasia
  [[-10, 36], [-9, 43], [-2, 44], [-4, 48], [2, 51], [8, 54], [10, 58], [5, 62], [15, 69], [30, 71], [45, 68], [60, 70], [80, 73], [100, 77], [120, 73], [140, 72], [160, 70], [180, 68], [170, 62], [160, 58], [156, 52], [142, 52], [140, 46], [135, 43], [130, 42], [127, 38], [126, 35], [122, 40], [120, 37], [122, 31], [120, 25], [110, 20], [108, 16], [109, 12], [105, 9], [100, 13], [99, 10], [100, 6], [103, 1], [101, 3], [98, 8], [98, 16], [94, 17], [90, 22], [87, 21], [80, 15], [77, 8], [73, 17], [70, 22], [67, 25], [58, 25], [56, 27], [50, 30], [48, 29], [52, 24], [56, 26], [60, 22], [58, 20], [52, 16], [45, 13], [43, 15], [39, 20], [35, 28], [34, 31], [36, 36], [30, 36], [27, 37], [26, 40], [23, 40], [22, 37], [19, 41], [16, 38], [12, 42], [8, 44], [3, 43], [0, 39], [-5, 36]],
  // Australia
  [[114, -22], [122, -18], [130, -12], [137, -12], [142, -11], [146, -19], [153, -26], [150, -37], [141, -38], [135, -34], [130, -32], [115, -34]],
  // Sumatra, Borneo, Japan, Madagascar
  [[95, 5], [98, 2], [104, -5], [106, -6], [101, -2]],
  [[109, 1], [117, 7], [119, 0], [116, -4], [110, -3]],
  [[130, 31], [135, 34], [141, 38], [141, 45], [143, 43], [139, 36]],
  [[44, -25], [50, -15], [49, -12], [44, -17]],
];

const rad = Math.PI / 180;
const BANGKOK: LL = [100.5, 13.75];

/** lon/lat (degrees) → x/y on the disc (−1…1) and z (>0 faces us), for a globe turned to `spin` and tilted `tilt` (radians) */
function view(lon: number, lat: number, spin: number, tilt: number): [number, number, number] {
  const la = lat * rad, lo = lon * rad - spin;
  const cl = Math.cos(la);
  return [cl * Math.sin(lo), Math.cos(tilt) * Math.sin(la) - Math.sin(tilt) * cl * Math.cos(lo), Math.sin(tilt) * Math.sin(la) + Math.cos(tilt) * cl * Math.cos(lo)];
}

/** the point `th` radians along the great circle that starts at Bangkok and heads due east */
function routeAt(th: number): LL {
  const la = BANGKOK[1] * rad, lo = BANGKOK[0] * rad;
  const A = [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
  const B = [-Math.sin(lo), Math.cos(lo), 0];
  const x = Math.cos(th) * A[0]! + Math.sin(th) * B[0]!, y = Math.cos(th) * A[1]! + Math.sin(th) * B[1]!, z = Math.cos(th) * A[2]!;
  return [Math.atan2(y, x) / rad, Math.asin(Math.max(-1, Math.min(1, z))) / rad];
}

/** a polygon edge walked in small steps, so a long edge bends round the sphere */
function dense(poly: LL[]): LL[] {
  const out: LL[] = [];
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length]!;
    let dl = b[0] - a[0];
    if (dl > 180) dl -= 360; if (dl < -180) dl += 360;
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(dl), Math.abs(b[1] - a[1])) / 4));
    for (let k = 0; k < n; k++) out.push([a[0] + dl * k / n, a[1] + (b[1] - a[1]) * k / n]);
  });
  return out;
}
const DENSE = LAND.map(dense);

export const TILT = 24 * rad;

/**
 * Draws the globe. `spin` turns it (radians), `laps` is how far the arrow has run round it (1 = once round).
 * The canvas is square; everything scales from its width.
 */
export function drawGlobe(cv: HTMLCanvasElement, spin: number, laps: number) {
  const c = cv.getContext('2d')!, W = cv.width, R = W * .44, cx = W / 2, cy = W / 2;
  c.clearRect(0, 0, W, W);
  const P = (lon: number, lat: number) => { const [x, y, z] = view(lon, lat, spin, TILT); return { x: cx + x * R, y: cy - y * R, z }; };

  // the sea
  c.fillStyle = PINK; c.beginPath(); c.arc(cx, cy, R, 0, 7); c.fill();

  // land: points on the far side are pushed onto the rim, which clips the shape at the horizon
  c.fillStyle = BURGUNDY;
  for (const poly of DENSE) {
    c.beginPath();
    let any = false;
    poly.forEach(([lo, la], i) => {
      let { x, y, z } = P(lo, la);
      if (z > 0) any = true;
      else { const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy) || 1; x = cx + dx / d * R; y = cy + dy / d * R; }
      if (i) c.lineTo(x, y); else c.moveTo(x, y);
    });
    c.closePath();
    if (any) c.fill();
  }

  // graticule every 30 degrees, front side only
  c.strokeStyle = BUTTER; c.globalAlpha = .45; c.lineWidth = 2.5;
  const line = (pts: LL[]) => {
    let pen = false; c.beginPath();
    for (const [lo, la] of pts) { const p = P(lo, la); if (p.z > 0) { if (pen) c.lineTo(p.x, p.y); else c.moveTo(p.x, p.y); pen = true; } else pen = false; }
    c.stroke();
  };
  for (let lon = -180; lon < 180; lon += 30) line(Array.from({ length: 73 }, (_, i) => [lon, -90 + i * 2.5] as LL));
  for (let lat = -60; lat <= 60; lat += 30) line(Array.from({ length: 145 }, (_, i) => [-180 + i * 2.5, lat] as LL));
  c.globalAlpha = 1;

  // the rim
  c.strokeStyle = BURGUNDY; c.lineWidth = W * .008; c.beginPath(); c.arc(cx, cy, R, 0, 7); c.stroke();

  // the route: a ribbon (burgundy edge, butter core) up to the arrowhead; hidden stretches are faint dashes
  const total = Math.max(0, laps) * Math.PI * 2;
  if (total > 0) {
    const steps = Math.max(2, Math.ceil(Math.min(total, Math.PI * 2) / .03));
    const upTo = Math.min(total, Math.PI * 2);
    const seg = (front: boolean, w: number, color: string, dash: number[] = []) => {
      c.strokeStyle = color; c.lineWidth = w; c.lineCap = 'round'; c.lineJoin = 'round'; c.setLineDash(dash);
      let pen = false; c.beginPath();
      for (let i = 0; i <= steps; i++) {
        const [lo, la] = routeAt(upTo * i / steps), p = P(lo, la);
        if ((p.z > 0) === front) { if (pen) c.lineTo(p.x, p.y); else c.moveTo(p.x, p.y); pen = true; } else pen = false;
      }
      c.stroke(); c.setLineDash([]);
    };
    c.globalAlpha = .35; seg(false, W * .012, BURGUNDY, [W * .02, W * .02]); c.globalAlpha = 1;
    seg(true, W * .034, BURGUNDY); seg(true, W * .018, BUTTER);
    // arrowhead at the tip, pointing along the way it is going
    const tip = routeAt(total), before = routeAt(total - .05), pt = P(tip[0], tip[1]), pb = P(before[0], before[1]);
    if (pt.z > 0) {
      const a = Math.atan2(pt.y - pb.y, pt.x - pb.x), s = W * .042;
      c.save(); c.translate(pt.x, pt.y); c.rotate(a);
      c.fillStyle = BUTTER; c.strokeStyle = BURGUNDY; c.lineWidth = W * .01; c.lineJoin = 'round';
      c.beginPath(); c.moveTo(s * 1.1, 0); c.lineTo(-s * .6, -s * .8); c.lineTo(-s * .2, 0); c.lineTo(-s * .6, s * .8); c.closePath(); c.fill(); c.stroke();
      c.restore();
    }
  }

  // Thailand: where it starts
  const th = P(BANGKOK[0], BANGKOK[1]);
  if (th.z > 0) {
    c.fillStyle = BUTTER; c.strokeStyle = BURGUNDY; c.lineWidth = W * .008;
    c.beginPath(); c.arc(th.x, th.y, W * .017, 0, 7); c.fill(); c.stroke();
  }
}

/** the spin that brings Bangkok to the middle of the disc */
export const SPIN_TO_BANGKOK = BANGKOK[0] * rad;
