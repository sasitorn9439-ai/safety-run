import { DEFAULT_SLIDE, SLIDE_IDS, animsWith, slideAnim, type Anim2D, type SlideId } from '../../src/render/flat/anims.js';
import { CROUCH_VARIANTS, SLIDE_VARIANTS } from '../../src/render/flat/slides.js';
import { drawPuppet } from '../../src/render/flat/puppet.js';
import { drawSideSlide } from '../../src/render/flat/slide.js';

/** `unit` = sprite pixels per game unit `u` (the mascot is ~0.94 u tall); `anchor` = where the feet sit in a cell. Same numbers as the 3D set, so either can be dropped in. */
const VARIANTS = [
  { dir: '384', cell: 384, unit: 300, anchor: { x: 192, y: 330 } },
  { dir: '256', cell: 256, unit: 200, anchor: { x: 128, y: 220 } },
] as const;
const MASTER = VARIANTS[0];
const SS = 2;                                   // draw at 2× then downscale, for clean edges
const RENDER = MASTER.cell * SS;

const params = new URLSearchParams(location.search);
/** which down-key animation to bake: `?slide=` side | 1..5 | c1..c5 (default: the game's default, c2 Tuck ball) */
const slideId = (SLIDE_IDS.includes(params.get('slide') as SlideId) ? params.get('slide') : DEFAULT_SLIDE) as SlideId;
const ANIMS = animsWith(slideId);

const log = (s: string) => { document.getElementById('log')!.textContent = s; };
const sheetCanvas = (w: number, h: number, read = false) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: read })!; x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
  return { c, x };
};
const blob = (c: HTMLCanvasElement) => new Promise<Blob>(r => c.toBlob(b => r(b!), 'image/png'));

const stage = sheetCanvas(RENDER, RENDER);

function drawFrame(a: Anim2D, i: number) {
  const x = stage.x;
  x.clearRect(0, 0, RENDER, RENDER);
  x.save();
  x.translate(MASTER.anchor.x * SS, MASTER.anchor.y * SS);
  x.scale(MASTER.unit * SS, MASTER.unit * SS);
  const p = a.pose(i);
  if ('side' in p) drawSideSlide(x, p.side); else drawPuppet(x, p);
  x.restore();
}

interface Baked { name: string; sheets: Record<string, HTMLCanvasElement>; bounds: { minX: number; minY: number; maxX: number; maxY: number }; touchesEdge: boolean }

function bake(): Baked[] {
  return ANIMS.map(a => {
    const rows = Math.ceil(a.frames / a.cols);
    const sheets = VARIANTS.map(v => ({ v, ...sheetCanvas(v.cell * a.cols, v.cell * rows, v.dir === '384') }));
    let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1;
    for (let i = 0; i < a.frames; i++) {
      drawFrame(a, i);
      const col = i % a.cols, row = Math.floor(i / a.cols);
      for (const s of sheets) s.x.drawImage(stage.c, col * s.v.cell, row * s.v.cell, s.v.cell, s.v.cell);
      const d = sheets[0]!.x.getImageData(col * MASTER.cell, row * MASTER.cell, MASTER.cell, MASTER.cell).data;
      for (let y = 0; y < MASTER.cell; y++) for (let x = 0; x < MASTER.cell; x++) if (d[(y * MASTER.cell + x) * 4 + 3]! > 8) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    }
    return { name: a.name, sheets: Object.fromEntries(sheets.map(s => [s.v.dir, s.c])), bounds: { minX, minY, maxX, maxY }, touchesEdge: minX <= 0 || minY <= 0 || maxX >= MASTER.cell - 1 || maxY >= MASTER.cell - 1 };
  });
}

function contactSheet(baked: Baked[]) {
  const cell = 192, pad = 6, head = 22, cols = 8;
  const rowsPer = baked.map(b => Math.ceil(ANIMS.find(a => a.name === b.name)!.frames / cols));
  const { c, x } = sheetCanvas(cols * (cell + pad) + pad, rowsPer.reduce((s, r) => s + head + r * (cell + pad), 0) + pad);
  x.fillStyle = '#1b1e23'; x.fillRect(0, 0, c.width, c.height);
  let y0 = pad;
  baked.forEach((b, bi) => {
    const a = ANIMS.find(q => q.name === b.name)!;
    x.fillStyle = '#ffd400'; x.font = '600 14px system-ui'; x.fillText(`${a.name} · ${a.frames} frames · ${a.fps} fps${a.loop ? ' · loop' : ''}`, pad, y0 + 15);
    y0 += head;
    for (let i = 0; i < a.frames; i++) {
      const cx = pad + (i % cols) * (cell + pad), cy = y0 + Math.floor(i / cols) * (cell + pad);
      x.fillStyle = '#8a8e95'; x.fillRect(cx, cy, cell, cell);
      x.fillStyle = 'rgba(0,0,0,.18)'; x.fillRect(cx, cy + MASTER.anchor.y / MASTER.cell * cell, cell, 1);
      x.drawImage(b.sheets['384']!, (i % a.cols) * 384, Math.floor(i / a.cols) * 384, 384, 384, cx, cy, cell, cell);
      x.fillStyle = 'rgba(0,0,0,.55)'; x.font = '11px system-ui'; x.fillText(String(i), cx + 4, cy + 13);
    }
    y0 += rowsPer[bi]! * (cell + pad);
  });
  return c;
}

function manifest(baked: Baked[]) {
  return {
    name: 'safety-run-mascot-2d', version: 1, style: 'flat 2D, same look as the game\'s vector mascot',
    view: 'From behind, like the game camera. The mascot runs away from the camera.',
    howToUse: 'Each animation is a grid sheet (row-major, frame size = cell). Place the sprite so `anchor` (the feet) sits on the ground point and scale by (game u in px) / unit. Squash, stretch, lean and cape flutter are already drawn into the frames: play them as they are, do not scale or rotate the sprite. Sprites are not trimmed.',
    variants: Object.fromEntries(VARIANTS.map(v => [v.dir, { cell: { w: v.cell, h: v.cell }, unit: v.unit, anchor: v.anchor }])),
    animations: Object.fromEntries(ANIMS.map(a => [a.name, { image: `${a.name}.png`, frames: a.frames, cols: a.cols, rows: Math.ceil(a.frames / a.cols), fps: a.fps, loop: a.loop, tags: a.tags ?? {}, note: a.note }])),
    contentBounds384: Object.fromEntries(baked.map(b => [b.name, b.bounds])),
  };
}

async function post(path: string, body: Blob | string) {
  const r = await fetch('/save/' + path, { method: 'POST', body });
  if (!r.ok) throw new Error(`save ${path}: ${r.status}`);
}

function showPreviews(baked: Baked[]) {
  const host = document.getElementById('previews')!;
  host.innerHTML = '';
  for (const b of baked) {
    const a = ANIMS.find(q => q.name === b.name)!;
    const box = document.createElement('div'); box.className = 'anim';
    box.innerHTML = `<h3>${a.name} · ${a.frames} frames · ${a.fps} fps</h3><small>${a.note}</small>`;
    const cv = document.createElement('canvas'); cv.className = 'pv'; cv.width = cv.height = 256;
    box.appendChild(cv); host.appendChild(box);
    const x = cv.getContext('2d')!, src = b.sheets['256']!, t0 = performance.now();
    const tick = (now: number) => {
      const i = Math.floor((now - t0) / 1000 * a.fps) % a.frames;
      x.clearRect(0, 0, 256, 256);
      x.drawImage(src, (i % a.cols) * 256, Math.floor(i / a.cols) * 256, 256, 256, 0, 0, 256, 256);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
}

async function run(save: boolean) {
  log('baking…');
  const baked = bake();
  showPreviews(baked);
  const warn = baked.filter(b => b.touchesEdge).map(b => b.name);
  if (save) {
    for (const b of baked) for (const v of VARIANTS) await post(`${v.dir}/${b.name}.png`, await blob(b.sheets[v.dir]!));
    await post('preview.png', await blob(contactSheet(baked)));
    await post('mascot.json', JSON.stringify(manifest(baked), null, 2));
  }
  log(`${save ? 'saved to assets/mascot-2d/' : 'baked'} · ${ANIMS.reduce((n, a) => n + a.frames, 0)} frames` + (warn.length ? ` · WARNING: ${warn.join(', ')} touch the cell edge` : ' · nothing clipped'));
  (window as unknown as { __done: unknown }).__done = { bounds: Object.fromEntries(baked.map(b => [b.name, b.bounds])), warn };
}

/** A contact sheet of the five back-facing slides for choosing between them (`?variants`). */
async function runVariants() {
  const crouch = params.get('variants') === 'crouch';                // `?variants=crouch` draws the five crouches instead
  const list = crouch ? CROUCH_VARIANTS : SLIDE_VARIANTS;
  log('drawing the variants…');
  const cell = 150, pad = 5, head = 20, cols = 14;
  const { c, x } = sheetCanvas(cols * (cell + pad) + pad, list.length * (cell + head + pad) + pad);
  x.fillStyle = '#1b1e23'; x.fillRect(0, 0, c.width, c.height);
  list.forEach((v, r) => {
    const a = slideAnim(v.id as SlideId), y0 = pad + r * (cell + head + pad);
    x.fillStyle = '#ffd400'; x.font = '600 14px system-ui'; x.fillText(`${v.id} · ${v.name}`, pad, y0 + 14);
    for (let i = 0; i < a.frames; i++) {
      drawFrame(a, i);
      const cx = pad + i * (cell + pad), cy = y0 + head;
      x.fillStyle = '#8a8e95'; x.fillRect(cx, cy, cell, cell);
      x.fillStyle = 'rgba(0,0,0,.18)'; x.fillRect(cx, cy + MASTER.anchor.y / MASTER.cell * cell, cell, 1);
      x.drawImage(stage.c, 0, 0, RENDER, RENDER, cx, cy, cell, cell);
      x.fillStyle = 'rgba(0,0,0,.55)'; x.font = '10px system-ui'; x.fillText(String(i), cx + 3, cy + 11);
    }
  });
  document.getElementById('previews')!.replaceChildren(c);
  if (params.has('auto')) await post(crouch ? 'crouch-variants.png' : 'slide-variants.png', await blob(c));
  log('variants drawn');
  (window as unknown as { __done: unknown }).__done = true;
}

document.getElementById('bake')!.onclick = () => void run(true);
if (params.has('variants')) void runVariants();
else void run(params.has('auto'));
