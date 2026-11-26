import { describe, expect, it } from 'vitest';
import { OUTLINE_SOFT, ROUTE_CLEARANCE, ROUTE_POINTS, ROUTE_SOFT, ROUTE_STOPS } from '../src/announce/art.js';

/** distance from a point to the segment a–b */
function toSegment(p: [number, number], a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0], dy = b[1] - a[1], len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}
const toOutline = (p: [number, number]) => Math.min(...OUTLINE_SOFT.map((a, i) => toSegment(p, a, OUTLINE_SOFT[(i + 1) % OUTLINE_SOFT.length]!)));
/** even-odd point in polygon */
function inside(p: [number, number], poly: [number, number][]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!, b = poly[j]!;
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}

describe('the route across Thailand', () => {
  it('never comes near the coast, so a solid line cannot melt into the background', () => {
    const worst = ROUTE_SOFT.reduce((m, p) => Math.min(m, toOutline(p)), Infinity);
    expect(worst).toBeGreaterThanOrEqual(ROUTE_CLEARANCE);
  });

  it('is all on land, and so are the city dots', () => {
    for (const p of [...ROUTE_SOFT, ...ROUTE_POINTS]) expect(inside(p, OUTLINE_SOFT)).toBe(true);
    for (const p of ROUTE_POINTS) expect(toOutline(p)).toBeGreaterThanOrEqual(ROUTE_CLEARANCE);
  });

  it('runs from south to north through every city in order', () => {
    expect(ROUTE_POINTS).toHaveLength(ROUTE_STOPS.length);
    for (let i = 1; i < ROUTE_POINTS.length; i++) expect(ROUTE_POINTS[i]![1]).toBeLessThanOrEqual(ROUTE_POINTS[i - 1]![1]);
    for (let i = 1; i < ROUTE_SOFT.length; i++) expect(ROUTE_SOFT[i]![1]).toBeLessThanOrEqual(ROUTE_SOFT[i - 1]![1] + 1e-9);
  });
});
