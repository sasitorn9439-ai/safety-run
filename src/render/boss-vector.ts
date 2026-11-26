import { gunzipSync } from 'fflate';
import type { VectorFrames } from '../cosmetics/vector-skin.js';
import type { Ctx } from './draw.js';

const WIDTH = 125;
const HEIGHT = 144.25;
const FEET = 138;
const UNIT = 118;
const BOX = [-WIDTH / 2 / UNIT, -FEET / UNIT, WIDTH / 2 / UNIT, (HEIGHT - FEET) / UNIT] as const;

// Alpha values represented by the six contour bands, from the soft edge to the opaque center.
const COVERAGE = [29, 78, 141, 205, 240, 254];
const OPACITY = COVERAGE.map((value, i) => {
  const previous = COVERAGE[i - 1] ?? 0;
  return (value - previous) / (255 - previous);
});
const CHANNELS = [(v: number) => [v, v, v], (v: number) => [v, 0, 0], (v: number) => [0, v, 0], (v: number) => [0, 0, v]];

interface Pose {
  mask: Path2D[];
  paint: { fill: string; path: Path2D }[];
}

type Point = readonly [x: number, y: number];

/** Rounded quadratic joins keep the traced contours smooth between sampled points. */
function addContour(path: Path2D, points: Point[]) {
  const toward = (a: Point, b: Point): Point => {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const t = Math.min(.48, .57 / Math.hypot(dx, dy));
    return [a[0] + dx * t, a[1] + dy * t];
  };
  path.moveTo(...toward(points[0], points[points.length - 1]));
  points.forEach((point, i) => {
    if (i > 0) path.lineTo(...toward(point, points[i - 1]));
    path.quadraticCurveTo(...point, ...toward(point, points[(i + 1) % points.length]));
  });
  path.closePath();
}

/** Decode the gzip-compressed path stream produced by tools/boss-vector/build.py. */
function decode(data: Uint8Array): VectorFrames {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = 0;
  const byte = () => view.getUint8(offset++);
  const float = () => {
    const value = view.getFloat32(offset, true);
    offset += 4;
    return value;
  };
  const uint = () => {
    let value = 0, shift = 0, part: number;
    do {
      part = byte();
      value += (part & 127) * 2 ** shift;
      shift += 7;
      if (shift > 28) throw new Error('Invalid boss vector path');
    } while (part & 128);
    return value;
  };
  const signed = () => {
    const value = uint();
    return value % 2 ? -(value + 1) / 2 : value / 2;
  };
  if (byte() !== 1) throw new Error('Unsupported boss vector version');
  const scale = byte();
  if (!scale) throw new Error('Invalid boss vector scale');

  const readPath = () => {
    const path = new Path2D(), contours = uint();
    let left = 0, top = 0;
    for (let i = 0; i < contours; i++) {
      const count = uint();
      if (count < 3) throw new Error('Invalid boss vector contour');
      let x = left += signed(), y = top += signed();
      const points: Point[] = [[x / scale, y / scale]];
      for (let j = 1; j < count; j++) {
        const delta = byte();
        x += delta === 255 ? signed() : Math.floor(delta / 15) - 7;
        y += delta === 255 ? signed() : delta % 15 - 7;
        points.push([x / scale, y / scale]);
      }
      addContour(path, points);
    }
    return path;
  };
  const poses: Pose[] = Array.from({ length: byte() }, () => ({
    mask: OPACITY.map(readPath),
    paint: CHANNELS.flatMap(rgb => Array.from({ length: uint() }, () => ({
      fill: `rgb(${rgb(byte()).join(',')})`,
      path: readPath(),
    }))),
  }));

  // Isolate additive paint and the silhouette from wings, rings, and the scene behind the character.
  // The same working canvases are reused for all frames and painted at the requested device size.
  const colorCanvas = document.createElement('canvas'), maskCanvas = document.createElement('canvas');
  const color = colorCanvas.getContext('2d')!, mask = maskCanvas.getContext('2d')!;
  const row = (n: number, index: number) => Array.from({ length: n }, () => {
    const pose = poses[byte()];
    if (!pose) throw new Error('Invalid boss vector pose');
    const x = float(), y = float(), angle = float();
    // The reference sheet has fractional row boundaries. The trace starts at the first whole pixel.
    const rowOffset = Math.floor(index * HEIGHT) - index * HEIGHT;
    return {
      box: BOX,
      draw(c: Ctx, u: number) {
        const k = u / UNIT, width = Math.ceil(WIDTH * k), height = Math.ceil(HEIGHT * k);
        if (colorCanvas.width !== width || colorCanvas.height !== height) {
          colorCanvas.width = maskCanvas.width = width;
          colorCanvas.height = maskCanvas.height = height;
        }
        color.fillStyle = '#000';
        color.fillRect(0, 0, width, height);
        mask.clearRect(0, 0, width, height);
        for (const ctx of [color, mask]) {
          ctx.save();
          ctx.setTransform(k, 0, 0, k, 0, 0);
          ctx.translate(x, y + rowOffset);
          ctx.rotate(angle);
        }
        color.globalCompositeOperation = 'lighter';
        for (const { fill, path } of pose.paint) {
          color.fillStyle = fill;
          color.fill(path, 'evenodd');
        }
        pose.mask.forEach((path, i) => {
          mask.globalAlpha = OPACITY[i];
          mask.fill(path, 'evenodd');
        });
        mask.restore();
        color.restore();
        color.globalCompositeOperation = 'destination-in';
        color.drawImage(maskCanvas, 0, 0);
        color.globalCompositeOperation = 'source-over';
        c.drawImage(colorCanvas, -WIDTH / 2 * k, -FEET * k);
      },
    };
  });
  const frames = { idle: row(12, 0), run: row(16, 1), jump: row(16, 2), slide: row(14, 3) };
  if (offset !== view.byteLength) throw new Error('Unexpected boss vector data');
  return frames;
}

export async function loadBossFrames(): Promise<VectorFrames> {
  const response = await fetch(new URL('../../assets/skins/boss-vector.bin', import.meta.url));
  if (!response.ok) throw new Error(`Boss vector request failed (${response.status})`);
  return decode(gunzipSync(new Uint8Array(await response.arrayBuffer())));
}
