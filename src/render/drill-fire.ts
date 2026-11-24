import type { Camera } from './camera.js';

export function makeDrillTexture(kind: 'flame' | 'smoke') {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 80;
  const c = canvas.getContext('2d')!;
  if (kind === 'smoke') {
    for (const [x,y,r] of [[28,43,26],[49,35,28],[42,50,26]] as const) {
      const g = c.createRadialGradient(x,y,0,x,y,r);
      g.addColorStop(0,'rgba(89,84,84,.86)'); g.addColorStop(1,'rgba(154,145,141,0)');
      c.fillStyle = g; c.fillRect(x-r,y-r,2*r,2*r);
    }
  } else {
    const g = c.createLinearGradient(0,8,0,76);
    g.addColorStop(0,'#e05330'); g.addColorStop(.6,'#fa8327'); g.addColorStop(1,'#ffc34f');
    c.fillStyle = g; c.beginPath(); c.moveTo(39,76);
    c.bezierCurveTo(13,73,18,53,25,37); c.quadraticCurveTo(27,47,32,48);
    c.bezierCurveTo(29,31,46,19,43,3); c.bezierCurveTo(61,26,43,38,54,46);
    c.quadraticCurveTo(60,44,60,35); c.bezierCurveTo(74,58,60,76,39,76); c.fill();
    c.fillStyle='#ffe396'; c.beginPath(); c.moveTo(38,73);
    c.quadraticCurveTo(29,65,40,50); c.quadraticCurveTo(44,44,43,37);
    c.bezierCurveTo(58,57,52,71,38,73); c.fill();
  }
  return canvas;
}

export function drillFire(cam: Camera, lane: number, z: number, seed: number, now: number,
  draw: (kind: 'smoke' | 'flame', x: number, y: number, w: number, h: number, alpha: number) => void) {
  const mode = seed % 4;
  if (!mode) return;
  const time = now*.001 + seed*.71;
  const pt = { x: 0, y: 0, s: 1 };
  const source = lane - Math.sign(lane)*1.55;
  const at = z + 1 + ((seed >>> 2) % 3);
  for (let i=0; i<6; i++) {
    const age = (time/3.8 + i/6) % 1;
    cam.project(source + Math.sign(lane)*age*.42, at, .55+age*3.8, pt);
    const size = cam.lw*pt.s*(.7+age*1.9);
    draw('smoke',pt.x,pt.y,size,size,.82*Math.sin(Math.PI*age));
  }
  if (mode === 1) return;
  for (let i=0;i<3;i++) {
    cam.project(source+(i-1)*.24, at, 0, pt);
    const unit = cam.lw*pt.s;
    const height = unit*(i===1?1.55:1)*(.95+.12*Math.sin(time*7+i));
    draw('flame',pt.x+unit*.035*Math.sin(time*5+i),pt.y-height*.46,unit*.81,height,.95);
  }
}
