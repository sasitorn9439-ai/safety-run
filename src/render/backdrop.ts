import type { Camera } from './camera.js';

function rng(seed: number) { let v = seed; return () => ((v = (v * 1664525 + 1013904223) >>> 0) / 4294967296); }

/** Extra width on each side of the backdrop so it can slide against the camera. */
export const BACKDROP_MARGIN = 80;

type C2 = CanvasRenderingContext2D;

/** a warm glow plus a lit window, as seen across the hall */
function windows(c: C2, w: number, y: number, step: number, color: string) {
  for (let x = 12; x < w; x += step) {
    const g = c.createRadialGradient(x + 16, y + 6, 0, x + 16, y + 6, 30);
    g.addColorStop(0, `rgba(${color},.22)`); g.addColorStop(1, `rgba(${color},0)`);
    c.fillStyle = g; c.fillRect(x - 14, y - 24, 60, 60);
    c.fillStyle = `rgba(${color},.55)`; c.fillRect(x, y, 32, 12);
    c.fillStyle = '#1a1d22'; c.fillRect(x + 15, y, 2, 12);
  }
}

function glow(c: C2, x: number, y: number, r: number, color: string) {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
}

function morningSky(c: C2, w: number, h: number) {
  const sky = c.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#85b8dc'); sky.addColorStop(.57, '#d4e5e9');
  sky.addColorStop(.86, '#ffddba'); sky.addColorStop(1, '#efc2aa');
  c.fillStyle = sky; c.fillRect(0, 0, w, h);
  const x = w * .64, y = h * .71;
  const haloRadius = h * .33;
  const halo = c.createRadialGradient(x, y, 0, x, y, haloRadius);
  halo.addColorStop(0, 'rgba(255,155,104,.84)');
  halo.addColorStop(.27, 'rgba(255,155,104,.54)');
  halo.addColorStop(.62, 'rgba(255,155,104,.15)');
  halo.addColorStop(1, 'rgba(255,155,104,0)');
  c.save();
  c.globalCompositeOperation = 'screen';
  c.fillStyle = halo;
  c.fillRect(x - haloRadius, y - haloRadius, haloRadius * 2, haloRadius * 2);
  c.restore();
  // Warm the inner halo while the outer glow fades into the sky.
  const warmth = c.createRadialGradient(x, y, 0, x, y, haloRadius * .76);
  warmth.addColorStop(0, 'rgba(255,178,132,.66)');
  warmth.addColorStop(.34, 'rgba(255,185,143,.48)');
  warmth.addColorStop(1, 'rgba(255,195,154,0)');
  c.fillStyle = warmth;
  c.fillRect(x - haloRadius, y - haloRadius, haloRadius * 2, haloRadius * 2);
  const radius = h * .065;
  const sun = c.createRadialGradient(x, y, 0, x, y, radius);
  sun.addColorStop(0, '#ffdfae');
  sun.addColorStop(.86, '#ffd0a0');
  sun.addColorStop(1, 'rgba(255,199,151,0)');
  c.fillStyle = sun; c.fillRect(x - radius, y - radius, radius * 2, radius * 2);

  // Broad ridges in morning haze, baked into the distant backdrop.
  for (const layer of [0, 1]) {
    c.fillStyle = layer === 0 ? '#d6cdd0' : '#bfc3c8';
    c.beginPath();
    c.moveTo(0, h);
    for (let px = 0; px <= w + 2; px += 2) {
      const t = px / w;
      const peaks = .022 * Math.sin(t * 17 + layer * 3)
        + .012 * Math.sin(t * 39 + layer) + .005 * Math.sin(t * 76);
      c.lineTo(px, h * (.927 + layer * .041 - peaks));
    }
    c.lineTo(w, h); c.closePath(); c.fill();
  }
}

export function makeCloud() {
  const cv = document.createElement('canvas'); cv.width = 200; cv.height = 64;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#fff6e8'; c.beginPath();
  c.moveTo(3,44); c.bezierCurveTo(15,41,20,29,42,32);
  c.bezierCurveTo(52,15,64,16,77,20); c.bezierCurveTo(91,-4,124,5,129,23);
  c.bezierCurveTo(147,16,157,29,162,33); c.bezierCurveTo(178,31,184,45,197,46);
  c.bezierCurveTo(155,53,51,56,3,44); c.fill();
  return cv;
}

export function morningClouds(w: number, h: number, now: number,
  draw: (x: number, y: number, width: number, height: number) => void) {
  for (let i = 0; i < 3; i++) {
    const width = h * (.47 + i * .12), span = w + width;
    const x = (span * (.16 + i * .33) + now * (.004 + i * .001)) % span - width;
    draw(x, h * [.13, .42, .25][i]!, width, width * .25);
  }
}

const birdSeed = Math.floor(Math.random() * 0xffffffff);
export function morningBirds(w: number, h: number, now: number,
  draw: (x: number, y: number, wing: number, lift: number) => void) {
  const period = 18000;
  const slot = Math.floor(now / period);
  const random = rng(birdSeed ^ Math.imul(slot, 2654435761));
  const elapsed = now % period - random() * 6500;
  const duration = 5600 + random() * 2200;
  if (elapsed < 0 || elapsed > duration) return;
  const direction = random() < .5 ? 1 : -1;
  const count = 1 + Math.floor(random() * 3);
  const altitude = h * (.16 + random() * .34);
  const progress = elapsed / duration;
  const travel = direction > 0 ? progress : 1 - progress;
  const wing = Math.max(3, Math.min(8, h * .026));
  for (let i = 0; i < count; i++) {
    const x = travel * (w + 16 * wing) - 8 * wing - direction * i * wing * 2.8;
    const y = altitude + i * wing + Math.sin(progress * 5 + i) * wing;
    draw(x, y, wing, wing * (.25 + .55 * Math.sin(elapsed * .011 + i)));
  }
}

/** Forklift lane: pallet racking with cartons, amber beacons. */
function forklift(c: C2, w: number, h: number, r: () => number) {
  for (let x = 0; x < w; x += 34) {
    const rh = h * (.22 + r() * .26), rw = 24 + r() * 8, y = h - rh;
    c.fillStyle = '#23272d'; c.fillRect(x, y, rw, rh);
    c.fillStyle = '#8a4a12';
    for (let s = y + 8; s < h; s += 9) c.fillRect(x, s, rw, 2);
    for (let s = y + 8; s < h - 6; s += 9) if (r() < .55) { c.fillStyle = r() < .6 ? '#5a4630' : '#4a3a28'; c.fillRect(x + 2 + r() * 8, s - 6, 8 + r() * 8, 6); c.fillStyle = '#8a4a12'; }
    c.fillStyle = '#1d3f73'; c.fillRect(x, y, 2, rh); c.fillRect(x + rw - 2, y, 2, rh);
  }
  for (let x = 40; x < w; x += 150) { glow(c, x, h * .34, 22, 'rgba(255,170,0,.45)'); c.fillStyle = '#ffb020'; c.fillRect(x - 3, h * .34 - 3, 6, 6); }
}

/** Chemical area: storage tanks and pipe runs, green-tinted light. */
function chemical(c: C2, w: number, h: number, r: () => number) {
  c.fillStyle = '#3a4048';
  for (let k = 0; k < 3; k++) c.fillRect(0, h * (.36 + k * .06), w, 3);               // pipe runs
  for (let x = 10; x < w; x += 78) {
    const tw = 44 + r() * 10, th = h * (.42 + r() * .12), y = h - th;
    c.fillStyle = '#4c5560'; c.fillRect(x, y + 6, tw, th);
    c.beginPath(); c.ellipse(x + tw / 2, y + 6, tw / 2, 6, 0, Math.PI, 0); c.fill();
    c.fillStyle = '#5d6772'; c.fillRect(x + 4, y + 6, 8, th);
    c.fillStyle = '#9be34a'; c.fillRect(x, y + th * .45, tw, 4);
    // a GHS diamond on the tank
    c.save(); c.translate(x + tw / 2, y + th * .3); c.rotate(Math.PI / 4);
    c.fillStyle = '#fff'; c.fillRect(-5, -5, 10, 10); c.strokeStyle = '#d11'; c.lineWidth = 1.5; c.strokeRect(-5, -5, 10, 10);
    c.restore();
    c.fillStyle = '#3a4048'; c.fillRect(x + tw - 4, y + 18, 3, th);                // a ladder rail
  }
  glow(c, w * .3, h * .2, 90, 'rgba(155,227,74,.12)'); glow(c, w * .8, h * .25, 90, 'rgba(155,227,74,.1)');
}

/** Work at height: a scaffold grid across the wall, a mezzanine and a crane beam. */
function height(c: C2, w: number, h: number) {
  windows(c, w, h * .24, 80, '170,210,255');
  c.fillStyle = '#ffd400'; c.fillRect(0, h * .2 + 5, w, 4);                              // the gantry crane beam
  c.fillStyle = '#111'; for (let x = 0; x < w; x += 16) c.fillRect(x, h * .2 + 5, 8, 4);
  c.fillStyle = '#2a2f36'; c.fillRect(w * .55, h * .2 + 9, 2, h * .2); c.fillRect(w * .55 - 4, h * .4 + 9, 10, 5);
  c.strokeStyle = '#7d8790'; c.lineWidth = 2;
  const top = h * .42, bay = 30, lift = (h - top) / 3;
  c.beginPath();
  for (let x = 0; x <= w; x += bay) { c.moveTo(x, top); c.lineTo(x, h); }
  for (let k = 0; k <= 3; k++) { c.moveTo(0, top + k * lift); c.lineTo(w, top + k * lift); }
  for (let x = 0; x < w; x += bay * 2) { c.moveTo(x, h); c.lineTo(x + bay, top + lift * 2); }
  c.stroke();
  c.fillStyle = '#8f6a3a'; for (let k = 1; k <= 2; k++) c.fillRect(0, top + k * lift - 3, w, 3);
  c.fillStyle = '#ffd400'; for (let x = 0; x < w; x += 12) c.fillRect(x, top + lift - 6, 6, 3);
}

function electrical(c: C2, w: number, h: number) {
  const bay = h * .95;
  const wall = c.createLinearGradient(0, h*.2, 0, h);
  wall.addColorStop(0, '#aaa99f'); wall.addColorStop(.42, '#dedbd0'); wall.addColorStop(1, '#bcbdb1');
  c.fillStyle = wall; c.fillRect(0, h*.21, w, h*.79);
  for (let x = 0; x < w; x += bay) {
    for (const y of [.26, .57]) {
      const left = x + bay*.18, top = h*y;
      c.fillStyle = '#575950'; c.fillRect(left, top, bay*.66, h*.135);
      for (let col = 0; col < 5; col++) {
        c.fillStyle = y === .26 ? '#92978b' : '#aba690';
        c.fillRect(left+2+col*bay*.13, top+2, bay*.13-2, h*.135-4);
      }
      c.fillStyle = '#64675f'; c.fillRect(left, top+h*.072, bay*.66, 1.5);
    }
    c.fillStyle = '#788078'; c.fillRect(x+bay*.24, h*.75, bay*.53, h*.25);
    c.fillStyle = '#48504b'; c.fillRect(x, h*.2, bay*.033, h*.8);
  }
  c.fillStyle = '#4b514a'; c.fillRect(0, h*.48, w, h*.034);
}

/** Evacuation drill: dim red emergency light, green EXIT signs over the doors, smoke. */
function evac(c: C2, w: number, h: number, r: () => number) {
  for (let x = 20; x < w; x += 130) {
    const dw = 34, dh = h * .38, y = h - dh;
    c.fillStyle = '#2a3a30'; c.fillRect(x, y, dw, dh);
    c.fillStyle = '#3b4f42'; c.fillRect(x + 3, y + 3, dw / 2 - 4, dh - 3); c.fillRect(x + dw / 2 + 1, y + 3, dw / 2 - 4, dh - 3);
    glow(c, x + dw / 2, y - 12, 34, 'rgba(60,255,130,.35)');
    c.fillStyle = '#12a150'; c.fillRect(x + 2, y - 18, dw - 4, 11);
    c.fillStyle = '#eafff0'; c.font = 'bold 8px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('EXIT', x + dw / 2, y - 12);
    // a fire alarm and an extinguisher beside the door
    c.fillStyle = '#d42020'; c.fillRect(x + dw + 12, h * .58, 8, 8); c.fillRect(x + dw + 14, h - 18, 7, 16);
  }
  for (let x = 60; x < w; x += 170) { glow(c, x, h * .22, 46, 'rgba(255,40,30,.4)'); c.fillStyle = '#ff4a3a'; c.fillRect(x - 4, h * .22 - 3, 8, 6); }
  for (let k = 0; k < 9; k++) glow(c, r() * w, h * (.4 + r() * .4), 40 + r() * 40, 'rgba(120,120,130,.16)');
}

/** The wall behind the horizon for area `zone` (index into ZONES), drawn once per size. */
export function makeBackdrop(cam: Camera, dpr: number, zone = 1): HTMLCanvasElement {
  const w = cam.W + BACKDROP_MARGIN * 2, h = Math.ceil(cam.hy) + 2;
  const cv = document.createElement('canvas');
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  const c = cv.getContext('2d')!;
  c.scale(dpr, dpr);
  if (zone === 0) { morningSky(c, w, h); return cv; }
  const r = rng(7 + zone);
  const sky = c.createLinearGradient(0, 0, 0, h);
  const [top, bottom] = ([['#16181c', '#343841'], ['#14161a', '#30353d'], ['#121815', '#2a3530'], ['#131820', '#303a48'], ['#536160', '#a8b0a6'], ['#1a1214', '#3a2a2c']] as const)[zone] ?? ['#14161a', '#30353d'];
  sky.addColorStop(0, top); sky.addColorStop(1, bottom);
  c.fillStyle = sky; c.fillRect(0, 0, w, h);
  // roof trusses
  c.strokeStyle = '#1c1f24'; c.lineWidth = 3; c.beginPath();
  for (let x = -20; x < w + 40; x += 46) { c.moveTo(x, 0); c.lineTo(x + 23, h * .2); c.lineTo(x + 46, 0); }
  c.stroke();
  c.fillStyle = '#1a1d22'; c.fillRect(0, h * .2, w, 5);
  [undefined, forklift, chemical, height, electrical, evac][zone]?.(c, w, h, r);
  const haze = c.createLinearGradient(0, h * .45, 0, h);
  haze.addColorStop(0, 'rgba(75,81,90,0)'); haze.addColorStop(1, 'rgba(75,81,90,.7)');
  c.fillStyle = haze; c.fillRect(0, 0, w, h);
  return cv;
}

/** Haze where the floor meets the wall: a 1×64 vertical gradient, stretched at draw time. Fraction of the floor it covers: FOG_HEIGHT. */
export const FOG_HEIGHT = .42;
export function makeFog(): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = 1; cv.height = 64;
  const c = cv.getContext('2d')!;
  const g = c.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, 'rgba(58,63,71,.95)'); g.addColorStop(1, 'rgba(58,63,71,0)');
  c.fillStyle = g; c.fillRect(0, 0, 1, 64);
  return cv;
}
