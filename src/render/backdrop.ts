import type { Camera } from './camera.js';

function rng(seed: number) { let v = seed; return () => ((v = (v * 1664525 + 1013904223) >>> 0) / 4294967296); }

/** Extra width on each side of the backdrop so it can slide against the camera. */
export const BACKDROP_MARGIN = 80;

/** The factory wall behind the horizon, drawn once per size. */
export function makeBackdrop(cam: Camera, dpr: number): HTMLCanvasElement {
  const w = cam.W + BACKDROP_MARGIN * 2, h = Math.ceil(cam.hy) + 2;
  const cv = document.createElement('canvas');
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  const c = cv.getContext('2d')!;
  c.scale(dpr, dpr);
  const r = rng(7);
  const sky = c.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#14161a'); sky.addColorStop(1, '#30353d');
  c.fillStyle = sky; c.fillRect(0, 0, w, h);
  // roof trusses
  c.strokeStyle = '#1c1f24'; c.lineWidth = 3; c.beginPath();
  for (let x = -20; x < w + 40; x += 46) { c.moveTo(x, 0); c.lineTo(x + 23, h * .2); c.lineTo(x + 46, 0); }
  c.stroke();
  c.fillStyle = '#1a1d22'; c.fillRect(0, h * .2, w, 5);
  // racks and crates
  for (let x = 0; x < w; x += 34) {
    const rh = h * (.22 + r() * .26), rw = 24 + r() * 8, y = h - rh;
    c.fillStyle = '#23272d'; c.fillRect(x, y, rw, rh);
    c.fillStyle = '#2d3239';
    for (let s = y + 8; s < h; s += 9) c.fillRect(x, s, rw, 2);
    for (let s = y + 8; s < h - 6; s += 9) if (r() < .45) { c.fillStyle = r() < .5 ? '#3a342a' : '#2e3b45'; c.fillRect(x + 2 + r() * 8, s - 6, 8 + r() * 8, 6); c.fillStyle = '#2d3239'; }
  }
  // lit windows
  for (let x = 12; x < w; x += 64) {
    const y = h * .3;
    const g = c.createRadialGradient(x + 16, y + 6, 0, x + 16, y + 6, 30);
    g.addColorStop(0, 'rgba(255,214,120,.22)'); g.addColorStop(1, 'rgba(255,214,120,0)');
    c.fillStyle = g; c.fillRect(x - 14, y - 24, 60, 60);
    c.fillStyle = 'rgba(240,205,120,.55)'; c.fillRect(x, y, 32, 12);
    c.fillStyle = '#1a1d22'; c.fillRect(x + 15, y, 2, 12);
  }
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
