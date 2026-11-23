import { neutral, type Pose2D } from './puppet.js';

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };
const merge = <T extends object>(base: T, over: DeepPartial<T>): T => {
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(over)) {
    const b = (base as Record<string, unknown>)[k];
    out[k] = v && typeof v === 'object' && b && typeof b === 'object' ? merge(b as object, v as object) : v;
  }
  return out as T;
};
export const P = (over: DeepPartial<Pose2D>): Pose2D => merge(neutral(), over);
export function mix<T>(a: T, b: T, t: number): T {
  if (typeof a === 'number') return (a + ((b as number) - a) * t) as T;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(a as object)) out[k] = mix((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], t);
  return out as T;
}
export const smooth = (t: number) => t * t * (3 - 2 * t);
export function keyed(keys: [number, Pose2D][]) {
  return (i: number): Pose2D => {
    if (i <= keys[0]![0]) return keys[0]![1];
    for (let k = 1; k < keys.length; k++) {
      const [f1, p1] = keys[k]!, [f0, p0] = keys[k - 1]!;
      if (i <= f1) return mix(p0, p1, smooth((i - f0) / (f1 - f0)));
    }
    return keys.at(-1)![1];
  };
}

export const slideCrouch = P({ sy: .84, sx: 1.1, rot: .08, head: { dx: 0, dy: -.01, rot: .03 }, footL: { lift: 0, dx: -.02 }, footR: { lift: 0, dx: .02 },
  handL: { x: -.26, y: -.2 }, handR: { x: .26, y: -.2 }, cape: { tipL: -.03, tipR: -.03, mid: -.02, spread: .03 } });

