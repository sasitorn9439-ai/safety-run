import * as THREE from 'three';
import { ANIMS } from './anims.js';
import { Mascot } from './rig.js';

/** Output sizes. `unit` = sprite pixels per game unit `u` (the mascot is ~0.94 u tall); `anchor` = where the feet sit in a cell. */
const VARIANTS = [
  { dir: '384', cell: 384, unit: 300, anchor: { x: 192, y: 330 } },
  { dir: '256', cell: 256, unit: 300 * 256 / 384, anchor: { x: 128, y: 330 * 256 / 384 } },
] as const;
const MASTER = VARIANTS[0];
const SS = 2;                       // supersampling: render at 2× the 384 cell, then downscale for clean edges
const RENDER = MASTER.cell * SS;

const log = (s: string) => { document.getElementById('log')!.textContent = s; };

/* ---------- scene ---------- */
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(RENDER, RENDER, false);
renderer.setClearColor(0x000000, 0);
const scene = new THREE.Scene();
const mascot = new Mascot();
scene.add(mascot.root);

scene.add(new THREE.HemisphereLight(0xffffff, 0xa9aeb8, 1.3));
const key = new THREE.DirectionalLight(0xfff3e6, 2.3); key.position.set(-3, 5, 6); scene.add(key);
const rim = new THREE.DirectionalLight(0xcfe6ff, 1.2); rim.position.set(3.5, 3, -4); scene.add(rim);
const fill = new THREE.DirectionalLight(0xffffff, .5); fill.position.set(4, 1.5, 5); scene.add(fill);

/** Fixed camera like the game's: behind the runner and a little above, long lens so it is nearly orthographic (a hint of perspective). */
function makeCamera() {
  const cam = new THREE.PerspectiveCamera(10, 1, .1, 60);
  const dist = 10, elev = THREE.MathUtils.degToRad(11);
  const target = new THREE.Vector3(0, .45, 0);
  const place = () => {
    cam.position.set(target.x, target.y + Math.sin(elev) * dist, target.z + Math.cos(elev) * dist);
    cam.lookAt(target);
    cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
  };
  const px = (v: THREE.Vector3) => { const p = v.clone().project(cam); return { x: (p.x + 1) / 2 * RENDER, y: (1 - p.y) / 2 * RENDER }; };
  const want = { unit: MASTER.unit * SS, x: MASTER.anchor.x * SS, y: MASTER.anchor.y * SS };
  for (let i = 0; i < 6; i++) {
    place();
    const f0 = px(new THREE.Vector3(0, 0, 0)), f1 = px(new THREE.Vector3(0, 1, 0));
    const scale = f0.y - f1.y;                                    // px per unit at the feet
    cam.fov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * scale / want.unit) * 180 / Math.PI;
    place();
    const f = px(new THREE.Vector3(0, 0, 0));
    const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1), right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
    const k = 1 / (want.unit);
    target.addScaledVector(up, (want.y - f.y) * k);                // feet lower on screen → move camera up
    target.addScaledVector(right, -(want.x - f.x) * k);
  }
  place();
  return cam;
}
const camera = makeCamera();

/* ---------- baking ---------- */
const sheetCanvas = (w: number, h: number) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d')!; x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'; return { c, x }; };
const blob = (c: HTMLCanvasElement) => new Promise<Blob>(r => c.toBlob(b => r(b!), 'image/png'));

interface Baked { name: string; sheets: Record<string, HTMLCanvasElement>; bounds: { minX: number; minY: number; maxX: number; maxY: number }; touchesEdge: boolean }

function bake(): Baked[] {
  return ANIMS.map(a => {
    const rows = Math.ceil(a.frames / a.cols);
    const sheets = VARIANTS.map(v => ({ v, ...sheetCanvas(v.cell * a.cols, v.cell * rows) }));
    let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1;
    for (let i = 0; i < a.frames; i++) {
      mascot.apply(a.pose(i));
      renderer.render(scene, camera);
      const col = i % a.cols, row = Math.floor(i / a.cols);
      for (const s of sheets) s.x.drawImage(renderer.domElement, col * s.v.cell, row * s.v.cell, s.v.cell, s.v.cell);
      // where the sprite actually is inside the master cell
      const m = sheets[0]!;
      const d = m.x.getImageData(col * MASTER.cell, row * MASTER.cell, MASTER.cell, MASTER.cell).data;
      for (let y = 0; y < MASTER.cell; y++) for (let x = 0; x < MASTER.cell; x++) if (d[(y * MASTER.cell + x) * 4 + 3]! > 8) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    }
    return {
      name: a.name, sheets: Object.fromEntries(sheets.map(s => [s.v.dir, s.c])),
      bounds: { minX, minY, maxX, maxY }, touchesEdge: minX <= 0 || minY <= 0 || maxX >= MASTER.cell - 1 || maxY >= MASTER.cell - 1,
    };
  });
}

/** A labelled contact sheet over road-grey, for reviewing the result at a glance. */
function contactSheet(baked: Baked[]) {
  const cell = 192, pad = 6, head = 22;
  const cols = 8;
  const rowsPer = baked.map(b => Math.ceil(ANIMS.find(a => a.name === b.name)!.frames / cols));
  const h = rowsPer.reduce((s, r) => s + head + r * (cell + pad), 0) + pad;
  const { c, x } = sheetCanvas(cols * (cell + pad) + pad, h);
  x.fillStyle = '#1b1e23'; x.fillRect(0, 0, c.width, c.height);
  let y0 = pad;
  baked.forEach((b, bi) => {
    const a = ANIMS.find(q => q.name === b.name)!;
    x.fillStyle = '#ffd400'; x.font = '600 14px system-ui'; x.fillText(`${a.name} · ${a.frames} frames · ${a.fps} fps${a.loop ? ' · loop' : ''}`, pad, y0 + 15);
    y0 += head;
    for (let i = 0; i < a.frames; i++) {
      const cx = pad + (i % cols) * (cell + pad), cy = y0 + Math.floor(i / cols) * (cell + pad);
      x.fillStyle = '#8a8e95'; x.fillRect(cx, cy, cell, cell);
      x.fillStyle = 'rgba(0,0,0,.18)'; x.fillRect(cx, cy + MASTER.anchor.y / MASTER.cell * cell, cell, 1);   // ground line
      const col = i % a.cols, row = Math.floor(i / a.cols), src = b.sheets['384']!;
      x.drawImage(src, col * 384, row * 384, 384, 384, cx, cy, cell, cell);
      x.fillStyle = 'rgba(0,0,0,.55)'; x.font = '11px system-ui'; x.fillText(String(i), cx + 4, cy + 13);
    }
    y0 += rowsPer[bi]! * (cell + pad);
  });
  return c;
}

function manifest(baked: Baked[]) {
  return {
    name: 'safety-run-mascot', version: 1,
    view: 'Seen from behind and ~11° above, like the game camera; long lens (nearly orthographic). The mascot runs away from the camera.',
    howToUse: 'Each animation is a grid sheet (row-major, frame size = cell). Place the sprite so `anchor` (the feet) sits on the ground point and scale by (game u in px) / unit. Sprites are not trimmed.',
    variants: Object.fromEntries(VARIANTS.map(v => [v.dir, { cell: { w: v.cell, h: v.cell }, unit: +v.unit.toFixed(3), anchor: { x: +v.anchor.x.toFixed(2), y: +v.anchor.y.toFixed(2) } }])),
    animations: Object.fromEntries(ANIMS.map(a => [a.name, {
      image: `${a.name}.png`, frames: a.frames, cols: a.cols, rows: Math.ceil(a.frames / a.cols), fps: a.fps, loop: a.loop, tags: a.tags ?? {}, note: a.note,
    }])),
    contentBounds384: Object.fromEntries(baked.map(b => [b.name, b.bounds])),
  };
}

async function post(path: string, body: Blob | string) {
  const r = await fetch('/save/' + path, { method: 'POST', body });
  if (!r.ok) throw new Error(`save ${path}: ${r.status}`);
}

/* ---------- UI ---------- */
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
  log(`${save ? 'saved to assets/mascot/' : 'baked'} · ${baked.reduce((n, b) => n + ANIMS.find(a => a.name === b.name)!.frames, 0)} frames` + (warn.length ? ` · WARNING: ${warn.join(', ')} touch the cell edge (increase the cell or shrink the pose)` : ' · nothing clipped'));
  (window as unknown as { __done: unknown }).__done = { bounds: Object.fromEntries(baked.map(b => [b.name, b.bounds])), warn, fov: camera.fov };
}

document.getElementById('bake')!.onclick = () => void run(true);
void run(new URLSearchParams(location.search).has('auto'));
