import type { Camera } from './camera.js';

export type Vertex = [outward: number, depth: number, height: number];

export function projectedShapes(cam: Camera, lane: number, depth: number, emit: (points: number[], color: string) => void) {
  const sign = Math.sign(lane);
  const pt = { x: 0, y: 0, s: 1 };
  const face = (vertices: Vertex[], color: string) => {
    const points: number[] = [];
    for (const [x,z,y] of vertices) {
      cam.project(lane + sign*x, depth + z, y/.9, pt);
      points.push(pt.x, pt.y);
    }
    emit(points, color);
  };
  const solid = (x: number, z: number, y: number, w: number, d: number, h: number,
    side: string, front: string, top: string) => {
    const X = x+w, Z = z+d, Y = y+h;
    face([[x,z,y],[x,Z,y],[x,Z,Y],[x,z,Y]], side);
    face([[x,z,y],[X,z,y],[X,z,Y],[x,z,Y]], front);
    face([[x,z,Y],[x,Z,Y],[X,Z,Y],[X,z,Y]], top);
  };
  return { face, solid };
}
