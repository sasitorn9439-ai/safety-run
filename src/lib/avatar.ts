import { AV_C, avParts } from '../../shared/avatar.js';
export { avName } from '../../shared/avatar.js';

function glyph(c: CanvasRenderingContext2D, g: number, r: number) {
  c.fillStyle = '#fff'; c.strokeStyle = '#fff'; c.lineCap = 'round'; c.lineJoin = 'round'; c.lineWidth = r * 0.16;
  const P = () => c.beginPath();
  if (g === 0) { P(); c.arc(0, r * .15, r * .62, Math.PI, 0); c.fill(); c.fillRect(-r * .82, r * .12, r * 1.64, r * .22); }
  if (g === 1) { P(); c.roundRect(-r * .32, -r * .6, r * .66, r * 1.1, r * .28); c.fill(); P(); c.roundRect(-r * .66, -r * .12, r * .36, r * .5, r * .16); c.fill(); }
  if (g === 2) { for (const s of [-1, 1]) { P(); c.arc(s * r * .4, r * .05, r * .3, 0, 7); c.stroke(); } P(); c.moveTo(-r * .1, 0); c.lineTo(r * .1, 0); c.stroke(); }
  if (g === 3) { P(); c.arc(0, r * .1, r * .52, Math.PI * 1.08, Math.PI * 1.92); c.stroke(); for (const s of [-1, 1]) { P(); c.roundRect(s * r * .52 - r * .2, -r * .05, r * .4, r * .58, r * .16); c.fill(); } }
  if (g === 4) { P(); c.moveTo(-r * .5, -r * .6); c.lineTo(r * .05, -r * .6); c.lineTo(r * .05, 0); c.lineTo(r * .62, r * .12); c.lineTo(r * .62, r * .52); c.lineTo(-r * .5, r * .52); c.closePath(); c.fill(); }
  if (g === 5) { P(); c.moveTo(0, -r * .7); c.lineTo(r * .42, r * .45); c.lineTo(-r * .42, r * .45); c.closePath(); c.fill(); c.fillRect(-r * .62, r * .42, r * 1.24, r * .18); }
  if (g === 6) { P(); c.roundRect(-r * .3, -r * .42, r * .6, r * 1.05, r * .2); c.fill(); c.fillRect(-r * .1, -r * .68, r * .2, r * .3); P(); c.moveTo(r * .08, -r * .58); c.lineTo(r * .5, -r * .7); c.stroke(); }
  if (g === 7) { c.fillRect(-r * .2, -r * .62, r * .4, r * 1.24); c.fillRect(-r * .62, -r * .2, r * 1.24, r * .4); }
  if (g === 8) { P(); c.moveTo(r * .15, -r * .75); c.lineTo(-r * .45, r * .1); c.lineTo(-r * .02, r * .1); c.lineTo(-r * .18, r * .75); c.lineTo(r * .45, -r * .12); c.lineTo(r * .02, -r * .12); c.closePath(); c.fill(); }
  if (g === 9) { P(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? r * .3 : r * .72; c.lineTo(Math.cos(a) * q, Math.sin(a) * q); } c.closePath(); c.fill(); }
  if (g === 10) { P(); c.moveTo(0, -r * .7); c.lineTo(r * .55, -r * .45); c.lineTo(r * .5, r * .1); c.quadraticCurveTo(r * .35, r * .55, 0, r * .75); c.quadraticCurveTo(-r * .35, r * .55, -r * .5, r * .1); c.lineTo(-r * .55, -r * .45); c.closePath(); c.fill(); }
  if (g === 11) { c.save(); c.rotate(-Math.PI / 4); c.fillRect(-r * .12, -r * .15, r * .24, r * .9); P(); c.arc(0, -r * .35, r * .32, 0, 7); c.fill(); c.globalCompositeOperation = 'destination-out'; c.fillRect(-r * .1, -r * .72, r * .2, r * .34); c.restore(); }
}

const cache = new Map<string, string>();

/** Avatar as a PNG data URL (cached). `size` is in device pixels. */
export function avatarURL(n: number | null | undefined, size = 96): string {
  const key = `${n}:${size}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const c = cv.getContext('2d')!, R = size / 2, p = avParts(n);
  c.translate(R, R);
  if (!p) {
    c.fillStyle = '#3a3f48'; c.beginPath(); c.arc(0, 0, R, 0, 7); c.fill();
  } else {
    c.fillStyle = p.f === 2 ? '#ffd400' : p.f === 1 ? '#dfe6ee' : 'rgba(0,0,0,0)';
    c.beginPath(); c.arc(0, 0, R, 0, 7); c.fill();
    c.fillStyle = AV_C[p.c]![0]; c.beginPath(); c.arc(0, 0, p.f ? R * .86 : R, 0, 7); c.fill();
    const g = document.createElement('canvas');
    g.width = g.height = size;
    const gc = g.getContext('2d')!;
    gc.translate(R, R);
    glyph(gc, p.g, R * .62);
    c.drawImage(g, -R, -R);
  }
  const url = cv.toDataURL();
  cache.set(key, url);
  return url;
}

export const avImg = (n: number | null | undefined, size: number) =>
  `<img class="av" src="${avatarURL(n, size * 2)}" width="${size}" height="${size}" alt="">`;
