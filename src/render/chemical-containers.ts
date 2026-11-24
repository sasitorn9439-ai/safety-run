import { Camera } from './camera.js';
import { projectedShapes, type Vertex } from './projected-shapes.js';

export type ChemicalContainer = 'drums' | 'ibc';

export function drawChemicalContainer(cam: Camera, lane: number, depth: number, kind: ChemicalContainer,
  emit: (points: number[], color: string) => void) {
  const { face, solid } = projectedShapes(cam, lane, depth, emit);
  if (kind === 'ibc') {
    solid(-.65,0,0,1.3,1.7,.17,'#414952','#303942','#697178');
    solid(-.57,.08,.17,1.14,1.51,1.21,'#d0dbd8','#ebefea','#f4f6ef');
    solid(-.575,.075,.17,1.15,1.52,.56,'#a2b887','#bed59e','#ccdab6');
    for (const y of [.2,.52,.84,1.16,1.37]) {
      solid(-.60,.05,y,1.20,1.57,.037,'#76858a','#879397','#a3adae');
    }
    for (const x of [-.58,-.29,0,.29,.58]) {
      solid(x-.017,.035,.17,.034,.035,1.24,'#79858a','#919c9c','#abb1b0');
    }
    for (const z of [.08,.46,.84,1.22,1.58]) {
      solid(-.61,z,.17,.036,.045,1.24,'#77868b','#929b9a','#b4bcbb');
    }
    solid(-.13,.66,1.38,.26,.29,.09,'#315781','#395f91','#5279a5');
    solid(-.28,-.06,.23,.21,.13,.14,'#404c52','#596369','#758185');
    face([[.27,.029,1.16],[.44,.029,.94],[.10,.029,.94],[.27,.029,1.16]],'#e7b62c');
    return;
  }

  solid(-.88,0,0,1.76,1.34,.11,'#c79720','#dfa922','#f2c449');
  solid(-.81,.05,.11,1.62,1.23,.08,'#765e44','#8c7154','#a28461');
  // Paint the farther drums first so the outlines stay intact on either side of the road.
  for (const [x,z,yellow] of [[.48,.83,false],[-.40,.85,false],[.02,.40,true]] as const) {
    const ring = (i: number, y: number, radius: number): Vertex =>
      [x+radius*Math.cos(i*Math.PI/8), z+radius*Math.sin(i*Math.PI/8), y];
    const body = yellow ? ['#bc931c','#cba124','#dcaf2e','#e6b937'] : ['#315985','#396b9c','#467bae','#5589b7'];
    const rim = yellow ? '#99771c' : '#315878';
    // Front-facing facets have outward normals pointing toward the camera.
    for (let i=0;i<16;i++) {
      const angle = (i+.5)*Math.PI/8;
      if ((Math.abs(lane-cam.camX)+x)*Math.cos(angle) + (depth+z+Camera.D)*Math.sin(angle) >= -.31) continue;
      const strip = (lo: number, hi: number, radius: number, color: string) =>
        face([ring(i,lo,radius),ring(i+1,lo,radius),ring(i+1,hi,radius),ring(i,hi,radius)], color);
      const light = Math.max(0, -.75*Math.sin(angle)-.48*Math.cos(angle));
      strip(.19,1.08,.31,body[Math.min(3,Math.floor(light*4))]!);
      for (const y of [.24,.49,.81,1.045]) strip(y,y+.028,.318,rim);
    }
    for (let i=0;i<16;i+=2) face([[x,z,1.08],ring(i,1.08,.31),ring(i+1,1.08,.31),ring(i+2,1.08,.31)],yellow?'#efd06b':'#7199bd');
    for (const [size,color] of [[.14,'#c74139'],[.104,'#faf5ec']] as const) {
      face([[x,z-.311,.66+size],[x+size,z-.311,.66],[x,z-.311,.66-size],[x-size,z-.311,.66]],color);
    }
  }
}
