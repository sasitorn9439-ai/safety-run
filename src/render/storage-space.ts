import type { Camera } from './camera.js';
import { projectedShapes } from './projected-shapes.js';

export type StorageSpace = 'white-shelf' | 'wood-pallet' | 'empty-space';

export function drawStorageSpace(cam: Camera, lane: number, depth: number, contents: StorageSpace,
  emit: (points: number[], color: string) => void) {
  const { face, solid } = projectedShapes(cam, lane, depth, emit);
  const stripe = (x: number, z: number, w: number, d: number) =>
    face([[x,z,0],[x+w,z,0],[x+w,z+d,0],[x,z+d,0]], '#f1c541');
  stripe(-.83,0,1.76,.10);
  stripe(-.83,5.45,1.76,.10);
  stripe(-.83,.10,.08,5.35);
  stripe(.85,.10,.08,5.35);

  if (contents === 'empty-space') return;
  if (contents === 'wood-pallet') {
    for (const z of [2.8,.55]) {
      for (const x of [.39,-.10,-.60]) solid(x,z,.01,.18,1.85,.15,'#926a45','#805d3e','#b08a5c');
      for (let board=5;board>=0;board--) {
        solid(-.64,z+board*.32,.16,1.32,.25,.09,'#a67a50','#97704a','#cfaa77');
      }
    }
    return;
  }
  for (const z of [4.98,.32]) solid(.62,z,0,.075,.09,2.48,'#afb8b6','#d7dbd7','#f3f2e9');
  for (const y of [.25,1.23,2.22]) {
    solid(-.61,.32,y,1.31,4.75,.10,'#d2d7d2','#e8eae3','#f3f3eb');
    if (y < 2) {
      for (const z of [3.2,.92]) solid(-.29,z,y+.10,.75,.82,.42,'#889a9b','#9aabaa','#bac6c1');
    }
  }
  for (const z of [4.98,.32]) solid(-.61,z,0,.075,.09,2.48,'#bec7c2','#ecede6','#f7f6ee');
}
