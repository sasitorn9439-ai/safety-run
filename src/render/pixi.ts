import { Application, CanvasSource, Container, Mesh, MeshGeometry, Shader, Sprite, Texture, Ticker } from 'pixi.js';
import { HAZARD_KINDS, PPE, type HazardKind, type PpeType } from '../../shared/hazards.js';
import type { PowerType, SimEvent } from '../../shared/sim.js';
import { BACKDROP_MARGIN, FOG_HEIGHT, makeBackdrop, makeFog } from './backdrop.js';
import { Camera, type Pt } from './camera.js';
import { DrawList, Fx, RUN_FRAMES, SLIDE_FRAMES, envItems, interp, pose, type EnvItem } from './fx.js';
import { FLOOR_FRAGMENT, FLOOR_VERTEX, floorShaderCompiles } from './floor-shader.js';
import { pixelFrame, snap, type PixelAnim } from './pixel-frames.js';
import type { MascotSet } from './pixel-mascot.js';
import { PAD, ON_KINDS, POWERS, coinArt, crateArt, dotArt, liftArt, powerArt, haloArt, hazardArt, lightArt, pillarArt, ppeArt, rasterize, runArt, shadowArt, shieldArt, slideArt, type Art } from './sprites.js';
import type { Frame, GameRenderer } from './types.js';

/** A texture plus the numbers needed to place it: anchor (normalised) and how many texture pixels one art unit is. */
interface Tex { tex: Texture; ax: number; ay: number; unit: number }

function makeTex(art: Art, unit: number, nearest = false): Tex {
  const canvas = rasterize(art, unit);
  // the GPU builds the mip chain (trilinear filtering), so distant copies are downscaled smoothly; pixel art stays NEAREST
  const source = new CanvasSource({ resource: canvas, autoGenerateMipmaps: art.mips, scaleMode: nearest ? 'nearest' : 'linear', autoGarbageCollect: false });
  return { tex: new Texture({ source }), ax: (PAD - art.box[0] * unit) / canvas.width, ay: (PAD - art.box[1] * unit) / canvas.height, unit };
}

function canvasTex(canvas: HTMLCanvasElement): Texture {
  return new Texture({ source: new CanvasSource({ resource: canvas, scaleMode: 'linear', autoGarbageCollect: false }) });
}

/** Re-uses Sprite objects frame to frame instead of creating and destroying them. */
class Pool {
  private items: Sprite[] = [];
  private n = 0;
  constructor(readonly parent: Container) {}
  begin() { this.n = 0; }
  get(): Sprite {
    let s = this.items[this.n];
    if (!s) { s = new Sprite(); this.parent.addChild(s); this.items.push(s); }
    s.visible = true; s.tint = 0xffffff; s.rotation = 0; s.alpha = 1;
    this.n++;
    return s;
  }
  end() { for (let i = this.n; i < this.items.length; i++) this.items[i]!.visible = false; }
  /** Drop references to textures that are about to be destroyed. */
  detach() { for (const s of this.items) { s.texture = Texture.EMPTY; s.visible = false; } this.n = 0; }
}

function place(s: Sprite, t: Tex, x: number, y: number, u: number, alpha = 1, z = 0) {
  s.texture = t.tex;
  s.anchor.set(t.ax, t.ay);
  const k = u / t.unit;
  s.scale.set(k, k);
  s.position.set(x, y);
  s.alpha = alpha;
  s.zIndex = z;
}

interface Textures {
  hazards: Record<HazardKind, Tex>; on: Partial<Record<HazardKind, Tex>>; crate: Tex; ppe: Record<PpeType, Tex>;
  power: Record<PowerType, Tex>; lift: Tex;
  shadow: Tex; halo: Tex; coin: Tex; pillar: Tex; light: Tex; shield: Tex; dot: Tex; run: Tex[]; slide: Tex[]; mascot: Record<PixelAnim, Tex[]> | null;
  backdrop: Texture; fog: Texture;
}

/**
 * WebGL renderer built on PixiJS. Sprites are batched on the GPU, the floor is a fragment shader (perspective-correct,
 * anti-aliased stripes with no per-frame geometry), and the two renderers share all the motion logic in fx.ts.
 */
export class PixiRenderer implements GameRenderer {
  readonly kind = 'pixi';
  get mascot() { return this.pixel?.style ?? 'vector' as const; }
  private cam = new Camera();
  private fx = new Fx();
  private list = new DrawList();
  private dpr: number;
  private maxDpr: number;
  private builtKey = '';
  private tx!: Textures;
  private lastNow = 0;
  private slowFrames = 0;
  private env: EnvItem[] = [];
  private pt: Pt = { x: 0, y: 0, s: 1 };
  private shakeOff = { x: 0, y: 0 };

  // scene graph, back to front
  private world = new Container();
  private backdrop = new Sprite();
  private floor: Mesh<MeshGeometry, Shader>;
  private floorU: Record<string, number>;
  private envLayer = new Container();
  private fog = new Sprite();
  private shadowLayer = new Container();
  private actorLayer = new Container();
  private fxLayer = new Container();
  private flash = new Sprite(Texture.WHITE);
  private envPool: Pool;
  private shadowPool: Pool;
  private actorPool: Pool;
  private fxPool: Pool;
  private playerSprite = new Sprite();
  private shieldSprite = new Sprite();
  private liftSprite = new Sprite();
  private playerShadow = new Sprite();

  static async create(canvas: HTMLCanvasElement, pixel?: MascotSet): Promise<PixiRenderer> {
    if (!floorShaderCompiles()) throw new Error('floor shader does not compile on this device');
    const app = new Application();
    await app.init({
      canvas, width: canvas.clientWidth || 360, height: canvas.clientHeight || 640,
      resolution: Math.min(2, window.devicePixelRatio || 1), autoDensity: false, antialias: false,
      background: 0x1b1e23, preference: 'webgl', powerPreference: 'high-performance',
      autoStart: false, hello: false,
    });
    // we drive rendering from the game loop; Pixi's own shared ticker would just be a second idle requestAnimationFrame loop
    Ticker.shared.autoStart = false;
    Ticker.shared.stop();
    Ticker.system.autoStart = false;
    Ticker.system.stop();
    const gl = (app.renderer as unknown as { context: { webGLVersion: number } }).context;
    if (gl.webGLVersion < 2) { app.destroy(false); throw new Error('WebGL2 required'); }
    return new PixiRenderer(app, pixel);
  }

  private constructor(private app: Application, private pixel?: MascotSet) {
    this.dpr = this.maxDpr = Math.min(2, window.devicePixelRatio || 1);
    const uniforms = {
      uW: { value: 1, type: 'f32' }, uH: { value: 1, type: 'f32' }, uHy: { value: 0, type: 'f32' }, uBy: { value: 1, type: 'f32' },
      uLw: { value: 1, type: 'f32' }, uCamX: { value: 0, type: 'f32' }, uDist4: { value: 0, type: 'f32' },
    } as const;
    const shader = Shader.from({ gl: { vertex: FLOOR_VERTEX, fragment: FLOOR_FRAGMENT }, resources: { floorU: uniforms } });
    const quad = new MeshGeometry({
      positions: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
      indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    });
    this.floor = new Mesh({ geometry: quad, shader });
    this.floorU = (shader.resources.floorU as { uniforms: Record<string, number> }).uniforms;

    this.envLayer.sortableChildren = true;
    this.actorLayer.sortableChildren = true;
    this.world.addChild(this.backdrop, this.floor, this.envLayer, this.fog, this.shadowLayer, this.actorLayer, this.fxLayer);
    this.flash.tint = 0x78e1ff; this.flash.visible = false;
    app.stage.addChild(this.world, this.flash);

    this.envPool = new Pool(this.envLayer);
    this.shadowPool = new Pool(this.shadowLayer);
    this.actorPool = new Pool(this.actorLayer);
    this.fxPool = new Pool(this.fxLayer);
    this.actorLayer.addChild(this.liftSprite, this.shieldSprite, this.playerSprite);
    this.shadowLayer.addChild(this.playerShadow);
  }

  get renderScale() { return this.dpr; }

  resize() {
    const canvas = this.app.canvas as HTMLCanvasElement;
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const { cam } = this;
    cam.set(r.width, r.height);
    this.app.renderer.resize(r.width, r.height, this.dpr);

    this.floor.position.set(0, cam.hy);
    this.floor.scale.set(cam.W, cam.H - cam.hy);
    const u = this.floorU;
    u.uW = cam.W; u.uH = cam.H; u.uHy = cam.hy; u.uBy = cam.by; u.uLw = cam.lw;
    this.fog.position.set(0, cam.hy);
    this.fog.width = cam.W; this.fog.height = (cam.H - cam.hy) * FOG_HEIGHT;
    this.flash.width = cam.W; this.flash.height = cam.H;
    this.backdrop.width = cam.W + BACKDROP_MARGIN * 2; this.backdrop.height = cam.hy + 2;
    this.build(false);
  }

  rebuild() { this.build(true); }

  private build(force: boolean) {
    const { cam } = this;
    // keyed on the *maximum* density: stepping the render scale down later doesn't need new textures
    const key = [cam.W, cam.H, this.maxDpr].join('x');
    if (!force && key === this.builtKey) return;
    this.builtKey = key;
    this.destroyTextures();
    const base = cam.lw * this.maxDpr;
    const mk = (art: Art) => makeTex(art, base * art.scale);
    const hazards = {} as Record<HazardKind, Tex>, ppe = {} as Record<PpeType, Tex>, power = {} as Record<PowerType, Tex>;
    for (const t of POWERS) power[t] = mk(powerArt(t));
    for (const k of HAZARD_KINDS) hazards[k] = mk(hazardArt(k));
    for (const t of PPE) ppe[t] = mk(ppeArt(t));
    this.tx = {
      hazards, ppe, power, lift: mk(liftArt), on: Object.fromEntries(ON_KINDS.map(k => [k, mk(hazardArt(k, true))])) as Partial<Record<HazardKind, Tex>>, crate: mk(crateArt),
      shadow: mk(shadowArt), halo: mk(haloArt), coin: mk(coinArt), pillar: mk(pillarArt), light: mk(lightArt), shield: mk(shieldArt), dot: mk(dotArt),
      run: Array.from({ length: RUN_FRAMES }, (_, i) => mk(runArt(i))),
      slide: Array.from({ length: SLIDE_FRAMES }, (_, i) => mk(slideArt(i))),
      mascot: this.pixel ? this.pixelTextures(base) : null,
      backdrop: canvasTex(makeBackdrop(cam, this.maxDpr)), fog: canvasTex(makeFog()),
    };
    this.backdrop.texture = this.tx.backdrop;
    this.backdrop.width = cam.W + BACKDROP_MARGIN * 2; this.backdrop.height = cam.hy + 2;
    this.fog.texture = this.tx.fog;
    this.fog.width = cam.W; this.fog.height = (cam.H - cam.hy) * FOG_HEIGHT;
  }

  /** The stubby mascot: vector frames rasterised at the size they are shown (pixel style: a whole number of texels per art pixel, sampled NEAREST). */
  private pixelTextures(base: number) {
    const m = this.pixel!, scale = m.scaleFor(base);
    const out = {} as Record<PixelAnim, Tex[]>;
    for (const anim of ['idle', 'run', 'jump', 'slide'] as const) {
      out[anim] = Array.from({ length: m.count(anim) }, (_, i) => { const art = m.art(anim, i, scale); return makeTex(art, base * scale, m.crisp); });
    }
    return out;
  }

  private destroyTextures() {
    if (!this.tx) return;
    for (const p of [this.envPool, this.shadowPool, this.actorPool, this.fxPool]) p.detach();
    for (const s of [this.playerSprite, this.shieldSprite, this.liftSprite, this.playerShadow, this.backdrop, this.fog]) s.texture = Texture.EMPTY;
    const t = this.tx;
    const all: Texture[] = [
      ...Object.values(t.hazards).map(x => x.tex), ...Object.values(t.ppe).map(x => x.tex), ...Object.values(t.power).map(x => x.tex), t.lift.tex, t.crate.tex, ...Object.values(t.on).map(x => x!.tex),
      t.shadow.tex, t.halo.tex, t.coin.tex, t.pillar.tex, t.light.tex, t.shield.tex, t.dot.tex, ...t.run.map(x => x.tex), ...t.slide.map(x => x.tex), t.backdrop, t.fog,
      ...(t.mascot ? Object.values(t.mascot).flat().map(x => x.tex) : []),
    ];
    for (const x of all) x.destroy(true);
  }

  onEvent(e: SimEvent, px: number) { this.fx.onEvent(e, px, this.cam); }

  render(f: Frame, now: number) {
    if (!this.tx) return;
    const { cam, fx, tx } = this;
    const rawDt = this.lastNow ? (now - this.lastNow) / 1000 : 0.016;
    const dt = Math.min(.05, rawDt);
    this.lastNow = now;
    this.adapt(rawDt, f.playing);

    const I = interp(f);
    cam.camX = I.px * .28;
    fx.update(I, f.playing, cam, dt);
    fx.shakeOffset(now, this.shakeOff);
    this.world.position.set(this.shakeOff.x, this.shakeOff.y);

    // backdrop slides a little against the camera: far things move less than near things
    this.backdrop.x = -BACKDROP_MARGIN - cam.camX * cam.lw * .16;
    this.floorU.uCamX = cam.camX;
    this.floorU.uDist4 = I.dist % 4;

    // pillars and ceiling lights
    const pool = this.envPool;
    pool.begin();
    const n = envItems(I.dist, this.env);
    for (let i = 0; i < n; i++) {
      const it = this.env[i]!;
      const p = cam.project(it.l, it.z, it.light ? 6.5 : 0, this.pt);
      place(pool.get(), it.light ? tx.light : tx.pillar, p.x, p.y, cam.lw * p.s, 1, -it.z);
    }
    pool.end();

    // objects and the mascot
    const sh = this.shadowPool, ac = this.actorPool;
    sh.begin(); ac.begin();
    this.list.build(f, cam, I, now);
    this.playerSprite.visible = this.shieldSprite.visible = this.playerShadow.visible = this.liftSprite.visible = false;
    for (let i = 0; i < this.list.n; i++) {
      const it = this.list.items[i]!;
      if (it.kind === 'player') { this.placePlayer(f, I, now); continue; }
      if (it.kind === 'power') {
        place(sh.get(), tx.halo, it.x, it.y, it.u * 1.9, it.fade * it.halo);
        place(sh.get(), tx.shadow, it.x, it.gy, it.u * .6, it.fade * .5);
        const s = ac.get();
        place(s, tx.power[it.pw], it.x, it.y, it.u, it.fade, -it.z);
        s.scale.x *= it.sx;
        continue;
      }
      if (it.kind === 'coin') {
        place(sh.get(), tx.shadow, it.x, it.gy, it.u * .3, it.fade * .35);
        const s = ac.get();
        place(s, tx.coin, it.x, it.y, it.u, it.fade, -it.z);
        s.scale.x *= it.sx;
        continue;
      }
      if (it.kind === 'ppe') {
        // glow and floor shadow underneath, then the medallion turning slowly
        place(sh.get(), tx.halo, it.x, it.y, it.u * 1.5, it.fade * it.halo);
        place(sh.get(), tx.shadow, it.x, it.gy, it.u * .55, it.fade * .45);
        const s = ac.get();
        place(s, tx.ppe[it.p], it.x, it.y, it.u, it.fade, -it.z);
        s.scale.x *= it.sx;
        continue;
      }
      if (it.k !== 'drop') place(sh.get(), tx.shadow, it.x, it.y, it.u * .95, it.fade);
      place(ac.get(), (it.blink && tx.on[it.k]) || tx.hazards[it.k], it.x, it.y, it.u, it.fade, -it.z);
      if (it.k === 'drop' && it.fall >= 0) place(ac.get(), tx.crate, it.x, it.y - it.fall * it.u, it.u, it.fade, -it.z + .01);
    }
    sh.end(); ac.end();

    // particles
    const fp = this.fxPool;
    fp.begin();
    for (const p of fx.particles) {
      const s = fp.get();
      place(s, tx.dot, p.x, p.y, p.r * 2 * (.5 + p.life * .5), p.life * p.alpha);
      s.tint = p.color;
    }
    fp.end();

    this.flash.visible = f.flash > 0;
    this.flash.alpha = f.flash;
    this.app.render();
  }

  private placePlayer(f: Frame, I: ReturnType<typeof interp>, now: number) {
    const { tx, playerSprite: ps, shieldSprite: sh, playerShadow: sd } = this;
    const P = pose(f, this.cam, I, this.fx, now, this.pt), u = P.u;
    place(sd, tx.shadow, P.x, P.groundY, P.shadowU, P.shadowAlpha);
    sd.visible = true;
    if (P.shield) {
      place(sh, tx.shield, P.x, P.feetY + P.bob - u * .52, u * P.shieldPulse, P.alpha, -0.0002);
      sh.visible = true;
    }
    if ((f.s.lift ?? 0) > 0 && P.groundY > P.feetY + 2) {
      // the man-lift: its scissor stack reaches from the floor up to the mascot's feet
      const ls = this.liftSprite;
      place(ls, tx.lift, P.x, P.feetY, u, P.alpha, -0.0003);
      ls.scale.y *= (P.groundY - P.feetY) / (1.4 * u);
      ls.visible = true;
    }
    if (tx.mascot) {
      const pick = pixelFrame(f, I, this.fx, now, this.pixel!.cfg), dpr = this.dpr;
      place(ps, tx.mascot[pick.anim][pick.frame]!, snap(P.x, dpr), snap(P.feetY + P.bob, dpr), u, P.alpha, -0.0001);
      ps.rotation = 0; ps.visible = true;       // no squash or lean: the frames carry them
      return;
    }
    const t = P.sliding ? tx.slide[P.frame]! : tx.run[P.frame]!;
    place(ps, t, P.x, P.feetY, u, P.alpha, -0.0001);
    const k = u / t.unit;
    ps.scale.set(k * P.xs, k * P.ys);
    ps.rotation = P.lean;
    ps.visible = true;
  }

  /** Lowers the render resolution if the device can't hold ~25 fps, so slow phones stay smooth instead of janky. */
  private adapt(rawDt: number, playing: boolean) {
    if (!playing || rawDt <= 0 || rawDt > .5) return;
    this.slowFrames = rawDt > .04 ? this.slowFrames + 1 : Math.max(0, this.slowFrames - 2);
    if (this.slowFrames > 90 && this.dpr > 1) {
      this.dpr = this.dpr > 1.5 ? 1.5 : 1;
      this.slowFrames = 0;
      this.resize();
    }
  }
}
