import type { Camera } from './camera.js';

import { projectedShapes, type Vertex } from './projected-shapes.js';

export type RackLoad = 'cartons' | 'totes' | 'pallets';
/** Coordinates start at the aisle-facing upright and extend away from the runner. */
export function drawStorageRack(cam: Camera, lane: number, depth: number, load: RackLoad,
  parkedLift: boolean, emit: (points: number[], color: string) => void) {
  const { face, solid } = projectedShapes(cam, lane, depth, emit);
  for (const z of [10.8, 5.4, 0]) solid(1.60,z,0,.1,.12,3.75,'#254c71','#355e83','#6485a0');
  for (let level = 0; level < 3; level++) {
    const y = .22 + level*1.18;
    solid(0,0,y-.14,1.72,10.92,.14,'#cb681f','#dc7629','#bc9772');
    for (let bay = 3; bay >= 0; bay--) {
      const z = .24 + bay*2.65;
      if (load === 'pallets') {
        for (const base of [0,.24,.48]) {
          solid(.15,z,y+base,1.38,2.28,.12,'#967247','#ae895a','#c59c68');
          for (const foot of [.18,1.8]) solid(.2,z+foot,y+base+.12,1.25,.24,.12,'#73573b','#8a6848','#a37e58');
        }
      } else if (load === 'totes') {
        solid(.17,z,y,1.36,2.05,.62,'#497a83','#56878d','#7ea1a3');
        solid(.12,z-.03,y+.60,1.45,2.13,.09,'#315f69','#3d7078','#82a6a9');
        face([[.165,z+.65,y+.34],[.165,z+1.18,y+.34],[.165,z+1.18,y+.5],[.165,z+.65,y+.5]], '#d5ded4');
      } else {
        const h = .62 + ((level+bay)%3)*.12;
        solid(.13,z,y,1.4,2.25,h,'#b18a5e','#c69b69','#d7b58c');
        solid(.12,z+.95,y,1.42,.15,h+.008,'#d9be96','#d9be96','#ecd4b0');
      }
    }
  }
  for (const z of [10.8,5.4,0]) {
    solid(0,z,0,.10,.12,3.75,'#285477','#396c97','#759abb');
    solid(-.03,z-.03,0,.17,.19,.38,'#dda52d','#ecc148','#f4d780');
  }
  if (!parkedLift) return;
  // Park parallel to the rack with the lowered forks facing its near end.
  const x = -1.8, z = 2.8;
  for (const axle of [z+.25,z+1.68]) {
    const radius = .28;
    for (let i=0; i<8; i++) {
      const a = i*Math.PI/4, b = a+Math.PI/4;
      const rim = (angle: number, r: number): Vertex => [x-.04, axle+r*Math.cos(angle), radius+r*Math.sin(angle)];
      face([rim(a,radius),rim(b,radius),rim(b,.11),rim(a,.11)], '#283036');
      face([rim(a,.11),rim(b,.11),[x-.04,axle,radius],[x-.04,axle,radius]], '#839097');
    }
  }
  solid(x,z,.38,.94,2.05,.48,'#dc9626','#f5b537','#f5c965');
  solid(x,z+1.38,.84,.94,.69,.39,'#d39123','#e8a72a','#f7c458');
  solid(x+.2,z+.78,.88,.5,.45,.19,'#374147','#455158','#505c61');
  for (const post of [z+.33,z+1.45]) solid(x,post,.85,.08,.08,1.04,'#354452','#425260','#687984');
  solid(x-.05,z+.22,1.87,1.04,1.41,.13,'#34414d','#455563','#647583');
  for (const fork of [x+.12,x+.73]) {
    solid(fork,z-.12,.12,.105,.15,1.63,'#434e57','#57646b','#849198');
    solid(fork,z-1.09,.10,.105,1.04,.075,'#54616a','#69777e','#839198');
  }
}
