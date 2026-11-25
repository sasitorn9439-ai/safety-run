import type { Camera } from './camera.js';
import { projectedShapes, type Vertex } from './projected-shapes.js';

export type PlantBay = 'tanks' | 'scaffold' | 'workshop' | 'exit';

function drawCnc({ face, solid }: ReturnType<typeof projectedShapes>, z: number, tall: boolean) {
  const roof = tall ? 3.65 : 2.95;
  const body = tall ? '#e7e5da' : '#bfc4cb';
  const shadow = tall ? '#bdbdb4' : '#929aa3';
  solid(0,z,0,2.4,4.45,.78,'#393d41','#303338','#56595a');
  // The back wall, slotted bed and spindle sit behind the glazed door.
  solid(1.83,z,.78,.57,4.45,roof-.78,shadow,shadow,body);
  solid(.55,z+.57,.81,1.36,2.69,.26,'#555b60','#656b6d','#899090');
  for (let slot=0;slot<4;slot++) solid(.65+slot*.28,z+.69,1.07,.052,2.35,.018,'#41474b','#454a4c','#485052');
  solid(.84,z+1.45,roof-1.12,.66,.67,1.02,body,shadow,'#efeee6');
  solid(.99,z+1.61,roof-1.39,.34,.35,.28,'#666b70','#4c5055','#858b90');
  solid(1.11,z+1.73,roof-1.55,.085,.085,.18,'#afb7b9','#757a80','#c8cdcd');
  // Frame the front opening on all four sides so the bed shows through the glass.
  const sill = 1.27, lintel = roof-.32;
  solid(0,z,.78,1.84,.52,sill-.78,body,shadow,body);
  solid(0,z,sill,.20,.52,lintel-sill,body,shadow,body);
  solid(1.63,z,sill,.21,.52,lintel-sill,body,shadow,body);
  solid(0,z,lintel,1.84,.52,roof-lintel,body,shadow,body);
  const frontPane = (left: number, right: number, bottom: number, top: number, color: string) =>
    face([[left,z,bottom],[right,z,bottom],[right,z,top],[left,z,top]],color);
  frontPane(.20,1.63,sill,lintel,'rgba(126,177,184,0.40)');
  face([[.34,z,sill],[.49,z,sill],[1.20,z,lintel],[1.05,z,lintel]],'rgba(230,248,246,0.25)');
  frontPane(.20,.24,sill,lintel,'#4a585a');
  frontPane(1.59,1.63,sill,lintel,'#4a585a');
  frontPane(.20,1.63,sill,sill+.04,'#536164');
  frontPane(.20,1.63,lintel-.04,lintel,'#536164');
  solid(0,z+3.22,.78,1.84,1.23,roof-.78,body,shadow,body);
  solid(0,z+.51,roof-.24,1.86,2.73,.24,body,shadow,'#eeede5');
  solid(0,z+.51,.78,1.85,2.73,.15,body,shadow,'#d4d6d0');
  // Glaze after the spindle and bed so their silhouettes show through the tint.
  const glassBottom = .93, glassTop = roof-.24;
  const pane = (left: number, right: number, bottom: number, top: number, color: string) =>
    face([[0,z+left,bottom],[0,z+right,bottom],[0,z+right,top],[0,z+left,top]],color);
  pane(.52,3.22,glassBottom,glassTop,'rgba(126,177,184,0.40)');
  face([[0,z+.77,glassBottom],[0,z+1.06,glassBottom],
    [0,z+1.97,glassTop],[0,z+1.68,glassTop]],'rgba(230,248,246,0.25)');
  pane(.52,.58,glassBottom,glassTop,'#4a585a');
  pane(3.16,3.22,glassBottom,glassTop,'#4a585a');
  pane(.52,3.22,glassBottom,glassBottom+.05,'#536164');
  pane(.52,3.22,glassTop-.05,glassTop,'#536164');
  if (tall) {
    solid(-.13,z+3.05,1.62,.12,.09,.85,'#363a3d','#bd6436','#e08449');
    solid(-.28,z+3.30,1.63,.32,1.0,.10,'#343b40','#404448','#575d60');
  } else {
    solid(.72,z+1.62,roof,.98,1.25,.64,'#393d45','#2e3239','#4e5159');
    solid(-.08,z+.31,.92,.17,.66,1.90,'#40454d','#3a3e46','#676c73');
    solid(-.092,z+.43,1.3,.025,.40,1.14,'#78848d','#556068','#919aa2');
    for (const [i,color] of ['#739b76','#d4af57','#ba615a'].entries())
      solid(.22,z+3.69,roof+i*.1,.13,.13,.10,color,color,'#cdcfc6');
  }
  solid(-.18,z+3.38,1.80,.23,.82,.94,'#373e46','#525860','#71777a');
  solid(-.20,z+3.47,2.24,.025,.63,.38,'#6a8491','#505e68','#99acb1');
  for (let key=0;key<4;key++) solid(-.21,z+3.47+key*.13,2.03,.035,.075,.07,'#c3c7c2','#adb2b0','#d5d8d1');
  solid(-.21,z+3.98,1.88,.045,.12,.12,'#c55640','#a83c34','#e38b68');
}

export function drawPlantBay(cam: Camera, lane: number, depth: number, kind: PlantBay,
  variant: number, emit: (points: number[], color: string) => void) {
  const shapes = projectedShapes(cam, lane, depth, emit);
  const { face, solid } = shapes;
  if (kind === 'tanks') {
    solid(0,.2,0,3.5,10.6,.25,'#677976','#87908a','#8e9a8e');
    solid(2.85,.6,3.2,.22,9.8,.23,'#6d817e','#95aaa0','#bec8ba');
    for (const z of [8,3]) {
      const height = variant ? 3.8 : 4.7;
      const ring = (i: number, y: number, r: number): Vertex =>
        [1.6+r*Math.cos(i*Math.PI/6), z+r*Math.sin(i*Math.PI/6), y];
      // The rear half of each tank is hidden by its opaque shell.
      for (let i = 3; i < 10; i++) {
        const shade = ['#c3cfc4','#becabe','#aebeb2','#9baea3','#879c94','#768d86','#71867f'][i-3]!;
        face([ring(i,.25,1.25),ring(i+1,.25,1.25),ring(i+1,height,1.25),ring(i,height,1.25)],shade);
        face([ring(i,height*.54,1.26),ring(i+1,height*.54,1.26),ring(i+1,height*.54+.14,1.26),ring(i,height*.54+.14,1.26)],'#618952');
      }
      for (let i=0;i<12;i++) face([ring(i,height,1.25),ring(i+1,height,1.25),ring(i+1,height+.34,.25),ring(i,height+.34,.25)],'#cbd5c9');
      solid(.04,z-.17,.4,.26,.36,.65,'#4b706f','#5c8a83','#98aca0');
    }
  } else if (kind === 'scaffold') {
    const levels = variant ? 2 : 3;
    const top = levels*1.65+.85;
    for (const x of [2.3,0]) {
      for (const z of [10,5,0]) solid(x,z,0,.11,.14,top,'#728794','#a5b2b7','#c5ccca');
      for (let level=1;level<=levels;level++) {
        const y=level*1.65;
        if (x > 0) solid(0,0,y,2.42,10.14,.16,'#a97943','#b78a58','#c4a27e');
        solid(x,0,y+.76,.08,10.1,.08,'#c19841','#dbb557','#eac874');
        for (const z of [0,5]) {
          face([[x,z,y-1.5],[x,z+.15,y-1.5],[x,z+5,y],[x,z+4.85,y]],'#8b9fa7');
          face([[x,z,y],[x,z+.15,y],[x,z+5,y-1.5],[x,z+4.85,y-1.5]],'#708792');
        }
      }
    }
  } else if (kind === 'workshop') {
    const back = projectedShapes(cam, lane + Math.sign(lane)*4.1, depth+3, emit);
    if (variant & 4) {
      drawCnc(back, 0, (variant & 8) === 0);
    } else {
      // Open charcoal steel shelves with tool cases on alternate decks.
      for (const z of [5.35,0]) back.solid(1.26,z,0,.1,.1,3.9,'#31393c','#42494c','#566062');
      for (const y of [.25,1.43,2.61,3.78]) {
        back.solid(0,0,y,1.36,5.45,.11,'#303639','#252c2f','#51595b');
        if (y < 3) {
          const z = y === 1.43 ? .64 : 2.72;
          back.solid(.17,z,y+.11,.88,1.48,.44,'#657275','#535f62','#859093');
          back.solid(.13,z-.04,y+.53,.96,1.56,.08,'#475357','#39454a','#768286');
        }
      }
      for (const z of [5.35,0]) back.solid(0,z,0,.10,.10,3.9,'#2d3437','#454e52','#687173');
    }
    for (const [index,z] of [6.2,.4].entries()) {
      if (index === (variant & 1)) {
        drawCnc(shapes,z,(variant & 2) === 0);
      } else {
        // Open steel workbench with a timber top, lower shelf and mounted vise.
        const scale = .9;
        const benchPart = (x: number, offset: number, y: number, w: number, d: number, h: number,
          side: string, front: string, top: string) =>
          solid(.75 + (x-.75)*scale, z + 1.85 + (offset-1.85)*scale, y*scale,
            w*scale, d*scale, h*scale, side, front, top);
        for (const x of [1.28,.08]) for (const leg of [3.45,.08])
          benchPart(x,leg,0,.12,.14,1.45,'#526d70','#405558','#849393');
        benchPart(.08,.08,.36,1.32,3.51,.09,'#78908b','#627c79','#9bada2');
        benchPart(0,0,1.45,1.5,3.7,.16,'#ac8050','#986d43','#cfad7a');
        benchPart(.13,.46,1.61,.53,.54,.19,'#467187','#38596b','#7493a2');
        for (const jaw of [.46,.85]) benchPart(.13,jaw,1.8,.53,.14,.19,'#586972','#4c6372','#a5afad');
        benchPart(.66,2.35,1.61,.56,.8,.34,'#956448','#81523e','#ba8460');
      }
    }
  } else {
    solid(.1,.2,0,2.4,10.7,3.7,'#b3bcb4','#919d98','#c5cfc6');
    solid(.02,.2,.33,.09,10.7,.16,'#728f7c','#819c8a','#9caf9e');
    const door = variant ? 5.6 : 2;
    solid(-.12,door,0,.18,3.15,2.88,'#445951','#52665d','#83948a');
    for (const z of [door+.09,door+1.60]) {
      solid(-.15,z,.04,.09,1.46,2.72,'#608476','#719384','#93afa2');
      solid(-.19,z+.27,1.67,.06,.92,.64,'#304e54','#425f64','#779491');
      solid(-.24,z+.12,1.0,.1,1.2,.09,'#c6cbc0','#a9b5b0','#e2e4d8');
    }
    solid(-.2,door+.72,2.97,.24,1.7,.45,'#248650','#30754b','#90c79b');
    face([[-.21,door+1,3.14],[-.21,door+2.01,3.14],[-.21,door+2.01,3.25],[-.21,door+1,3.25]],'#ecf5df');
    face([[-.21,door+1.92,3.04],[-.21,door+2.22,3.2],[-.21,door+1.92,3.36],[-.21,door+1.92,3.04]],'#ecf5df');
    solid(-.18,door+3.48,.85,.3,.92,1.18,'#aa4840','#833c38','#c47062');
  }
}

export function makeTankSmoke(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 80;
  const ctx = canvas.getContext('2d')!;
  for (const [x,y,r] of [[29,44,28],[48,35,30],[43,48,26]] as const) {
    const mist = ctx.createRadialGradient(x,y,0,x,y,r);
    mist.addColorStop(0,'rgba(190,230,163,.65)');
    mist.addColorStop(1,'rgba(190,230,163,0)');
    ctx.fillStyle = mist; ctx.fillRect(x-r,y-r,2*r,2*r);
  }
  return canvas;
}

export function tankSmoke(cam: Camera, lane: number, z: number, variant: number, now: number,
  draw: (x: number, y: number, size: number, alpha: number) => void) {
  const side = Math.sign(lane);
  const pt = { x: 0, y: 0, s: 1 };
  for (let i = 0; i < 5; i++) {
    const age = (now / 6200 + i / 5 + variant * .37 + (side > 0 ? .54 : 0)) % 1;
    const height = (variant ? 3.8 : 4.7) - .25 + age * 2.4;
    cam.project(lane + side * (1.3 + age * .55), z + 8.7 + age*.8, height/.9, pt);
    draw(pt.x,pt.y,(1.1 + age*1.65)*cam.lw*pt.s,.52*Math.sin(Math.PI*age));
  }
}
