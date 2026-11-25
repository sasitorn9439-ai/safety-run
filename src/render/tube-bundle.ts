import type { Camera } from './camera.js';
import { projectedShapes, type Vertex } from './projected-shapes.js';

const profile = Array.from({ length: 9 }, (_, i) => {
  const angle = i * Math.PI / 4;
  return { x: Math.cos(angle), y: Math.sin(angle) };
});

export function drawTubeBundle(cam: Camera, lane: number, depth: number, emit: (points: number[], color: string) => void) {
  const { solid, face } = projectedShapes(cam, lane, depth, emit);
  for (const z of [2.65, .36]) {
    for (const x of [-.52,.44]) solid(x,z,0,.12,.23,.62,'#b08624','#eab839','#ffca46');
    solid(-.65,z,.62,1.3,.23,.10,'#353e46','#49535a','#636d71');
  }
  for (let row = 0; row < 3; row++) {
    const count = 5 - row;
    for (let column = count - 1; column >= 0; column--) {
      const x = (column - (count - 1)/2) * .24;
      const y = .84 + row * .208;
      const end = ((column + row) % 3) * .055;
      const point = (i: number, z: number, radius: number): Vertex =>
        [x + radius * profile[i]!.x, z, y + radius * profile[i]!.y];
      if (row === 2 || column === 0 || column === count-1) {
        for (let i=0; i<5; i++) {
          face([point(i,end,.12),point(i,3.35,.12),point(i+1,3.35,.12),point(i+1,end,.12)],
            ['#909ca4','#b6c1c5','#a2afb5','#79878e','#637078'][i]!);
        }
      }
    }
  }
  // Draw all cut ends after the long faces so adjacent pipes cannot hide the rims.
  for (let row = 0; row < 3; row++) {
    for (let column = 0; column < 5-row; column++) {
      const x = (column - (4-row)/2)*.24, y = .84 + row*.208, z = ((column+row)%3)*.055;
      const rim = (i: number, radius: number): Vertex => [x+profile[i]!.x*radius,z,y+profile[i]!.y*radius];
      for (let i=0;i<8;i++) face([rim(i,.12),rim(i+1,.12),rim(i+1,.084),rim(i,.084)], '#b4bfc4');
      for (let i=0;i<8;i+=2) face([[x,z,y],rim(i,.084),rim(i+1,.084),rim(i+2,.084)], '#34434b');
    }
  }
}
