import type { Camera } from './camera.js';
import { projectedShapes, type Vertex } from './projected-shapes.js';

export type LiftModel = 'boom' | 'scissor';

export function drawAerialLift(cam: Camera, lane: number, depth: number, model: LiftModel,
  raised: boolean, emit: (points: number[], color: string) => void) {
  const { face, solid } = projectedShapes(cam, lane, depth, emit);
  const boom = model === 'boom';
  const paint = boom ? '#e38a30' : '#368594';
  const basket = (z: number, y: number, length: number) => {
    solid(-.48,z,y,.96,length,.14,'#48565b','#66757a','#83908b');
    for (const x of [.42,-.48]) {
      for (const end of [z,z+length-.06]) solid(x,end,y+.14,.06,.06,.67,paint,paint,'#edc066');
      for (const rail of [.45,.79]) solid(x,z,y+rail,.06,length,.052,paint,paint,'#e8ba63');
    }
    for (const rail of [.45,.79]) solid(-.48,z,y+rail,.96,.06,.052,paint,paint,'#edc066');
  };
  for (const axle of [2.08,.45]) {
    const wheel = (i: number, radius: number): Vertex =>
      [-.58, axle+radius*Math.cos(i*Math.PI/5), .29+radius*Math.sin(i*Math.PI/5)];
    for (let i=0;i<10;i++) {
      face([wheel(i,.29),wheel(i+1,.29),wheel(i+1,.12),wheel(i,.12)],'#29333b');
      face([wheel(i,.12),wheel(i+1,.12),[-.58,axle,.29],[-.58,axle,.29]],'#849299');
    }
  }
  solid(-.54,.15,.41,1.08,2.25,.37,paint,boom?'#bc6b24':'#316774','#afaa83');
  const beam = (x: number, start: number, low: number, end: number, high: number, thickness: number, color: string) => {
    const length = Math.hypot(end-start, high-low);
    const dz = -(high-low) / length * thickness/2;
    const dy = (end-start) / length * thickness/2;
    const upper = dy >= 0 ? 1 : -1;
    const corner = (z: number, y: number, edge: number, inset = 0): Vertex =>
      [x + inset, z + edge*dz, y + edge*dy];
    const front = start < end ? start : end, frontY = start < end ? low : high;
    face([corner(start,low,upper), corner(end,high,upper), corner(end,high,upper,thickness), corner(start,low,upper,thickness)], color);
    face([corner(front,frontY,1), corner(front,frontY,-1), corner(front,frontY,-1,thickness), corner(front,frontY,1,thickness)], boom ? '#887659' : '#52777e');
    face([corner(start,low,-1), corner(end,high,-1), corner(end,high,1), corner(start,low,1)], color);
  };
  if (boom) {
    solid(-.41,1.45,.78,.82,.85,.47,'#b56d30','#cd7b32','#e6a354');
    const elbow = raised ? 2.95 : .98;
    const platform = raised ? 4.1 : 1.04;
    beam(0,1.95,1,.73,elbow,.30,paint);
    beam(0,.73,elbow,raised?2.95:1.75,platform,.21,'#aeb7b5');
    basket(raised?2.65:1.45,platform,.89);
  } else {
    const step = raised ? 1.02 : .19;
    for (const x of [.33,-.35]) {
      for (let level=0;level<3;level++) {
        const y=.78+level*step;
        beam(x,.36,y,2.15,y+step,.145,'#558e9c');
        beam(x,2.15,y,.36,y+step,.145,'#83afb6');
      }
    }
    basket(.22,.85+3*step,2.12);
  }
}
