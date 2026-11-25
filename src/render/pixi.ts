import { drillFire, makeDrillTexture } from './drill-fire.js';
import { makeTankSmoke, tankSmoke } from './plant-bay.js';
import { Application, CanvasSource, Container, Graphics, Mesh, MeshGeometry, Shader, Sprite, Texture, Ticker } from 'pixi.js';
import { HAZARD_KINDS, PPE, type HazardKind, type PpeType } from '../../shared/hazards.js';
import type { PowerType, SimEvent } from '../../shared/sim.js';
import { BACKDROP_MARGIN, FOG_HEIGHT, makeCloud, morningBirds, morningClouds, makeBackdrop, makeFog } from './backdrop.js';
import { Camera, type Pt } from './camera.js';
import { DrawList, Fx, GHOST_FX, RUN_FRAMES, SLIDE_FRAMES, entranceWires, envItems, interp, pose, type EnvItem } from './fx.js';
import { FLOOR_FRAGMENT, FLOOR_VERTEX, floorShaderCompiles } from './floor-shader.js';
import { drawPropModel, BackdropFade, PROPS, sceneryOpacity, propItems, sideWall, type PropItem } from './scenery.js';
import { ZONES } from '../../shared/zones.js';
import { pixelFrame, snap, type PixelAnim } from './pixel-frames.js';
import { RING_FRAMES, ringFrame, type MascotSet } from './pixel-mascot.js';
import { DEFAULT_PALETTE } from '../cosmetics/skins.js';
import type { Look } from '../cosmetics/types.js';
import { PAD, ON_KINDS, POWERS, bonusArt, coinArt, lootArt, crateArt, dotArt, liftArt, powerArt, haloArt, hazardArt, lightArt, pillarArt, whitePillarArt, ppeArt, rasterize, runArt, shadowArt, shieldArt, slideArt, type Art } from './sprites.js';
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

/** ghosts are washed toward a pale blue, so they never read as the player's own mascot */
const GHOST_TINT = 0x9fd8ff;
/** a mascot in its plain clothes; a ghost wearing cosmetics keeps their colours instead of the tint */
const plain = (l: Look | null) => !l || (!l.hat && !l.effect && !l.figure && l.pal === DEFAULT_PALETTE);
/** looks whose frames are kept; past this the ones not being worn are dropped (a host sees new players every round) */
const KEEP_LOOKS = 6;

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

/** a look's mascot frames, plus the frames of the rings it wears (empty when none), which play on their own clock */
type MascotTex = Record<PixelAnim | 'ringBack' | 'ringFront', Tex[]>;

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
  shadow: Tex; halo: Tex; coin: Tex; bonus: Tex; loot: Tex; pillar: Tex; whitePillar: Tex; light: Tex; shield: Tex; dot: Tex; run: Tex[]; slide: Tex[]; mascot: MascotTex | null;
  flame: Texture; drillSmoke: Texture; smoke: Texture; cloud: Texture; backdrops: Texture[]; fog: Texture; props: (Tex | null)[];
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
  /** each look's mascot frames (the player's own and the ghosts'), and the lane size they were drawn for */
  private looks = new Map<Look, MascotTex>();
  private texBase = 0;
  private tx!: Textures;
  private lastNow = 0;
  private slowFrames = 0;
  private env: EnvItem[] = [];
  private pt: Pt = { x: 0, y: 0, s: 1 };
  private shakeOff = { x: 0, y: 0 };

  // scene graph, back to front
  private world = new Container();
  private birds = new Graphics();
  private clouds = [new Sprite(), new Sprite(), new Sprite()];
  private backdrop = new Sprite();
  /** the previous area's wall, under `backdrop` while that fades in */
  private backdropOld = new Sprite();
  private bd = new BackdropFade();
  private propList: PropItem[] = [];
  /** buildings' side walls, one Graphics each, redrawn every frame */
  private walls: Graphics[] = [];
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
  /** the rings the player wears (Effect.ring), behind and in front of the mascot */
  private ringBackSprite = new Sprite();
  private ringFrontSprite = new Sprite();
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
      uElectrical: { value: 0, type: 'f32' },
      uEntrance: { value: 0, type: 'f32' },
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
    // the fog lies on the floor, under the scenery: far scenery fades out by itself
    this.world.addChild(this.backdropOld, this.backdrop, ...this.clouds, this.birds, this.floor, this.fog, this.envLayer, this.shadowLayer, this.actorLayer, this.fxLayer);
    this.flash.tint = 0x78e1ff; this.flash.visible = false;
    app.stage.addChild(this.world, this.flash);

    this.envPool = new Pool(this.envLayer);
    this.shadowPool = new Pool(this.shadowLayer);
    this.actorPool = new Pool(this.actorLayer);
    this.fxPool = new Pool(this.fxLayer);
    this.actorLayer.addChild(this.liftSprite, this.shieldSprite, this.ringBackSprite, this.playerSprite, this.ringFrontSprite);
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
    for (const b of [this.backdrop, this.backdropOld]) { b.width = cam.W + BACKDROP_MARGIN * 2; b.height = cam.hy + 2; }
    this.build(false);
  }

  rebuild() { this.build(true); }

  setLook(look: Look) {
    if (this.pixel?.style !== 'flat' || this.pixel.look === look) return;
    this.pixel.look = look;
    if (this.tx) this.tx.mascot = this.mascotFor(look);
  }

  /** the mascot's frames in `look`, drawn the first time they are asked for */
  private mascotFor(look: Look | null): MascotTex | null {
    const m = this.pixel;
    if (!m) return null;
    const key = m.style === 'flat' && look ? look : m.look;
    let t = this.looks.get(key);
    if (!t) {
      t = this.pixelTextures(this.texBase, key);
      this.looks.set(key, t);
      // a skin drawn as a picture was just painted without it (still loading): paint it again once the picture is there
      const sprite = key.figure?.sprite, built = t;
      if (sprite && !sprite.img) void sprite.ready.then(() => {
        if (this.looks.get(key) !== built) return;
        this.looks.delete(key);
        if (this.pixel?.look === key && this.tx) this.tx.mascot = this.mascotFor(key);
        for (const x of Object.values(built).flat()) x.tex.destroy(true);
      });
    }
    return t;
  }

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
      shadow: mk(shadowArt), halo: mk(haloArt), coin: mk(coinArt), bonus: mk(bonusArt), loot: mk(lootArt), pillar: mk(pillarArt), whitePillar: mk(whitePillarArt), light: mk(lightArt), shield: mk(shieldArt), dot: mk(dotArt),
      run: Array.from({ length: RUN_FRAMES }, (_, i) => mk(runArt(i))),
      slide: Array.from({ length: SLIDE_FRAMES }, (_, i) => mk(slideArt(i))),
      mascot: null,
      flame: canvasTex(makeDrillTexture('flame')), drillSmoke: canvasTex(makeDrillTexture('smoke')), smoke: canvasTex(makeTankSmoke()), cloud: canvasTex(makeCloud()), backdrops: ZONES.map((_, z) => canvasTex(makeBackdrop(cam, this.maxDpr, z))), fog: canvasTex(makeFog()), props: PROPS.map(p => p.art ? mk(p.art) : null),
    };
    this.texBase = base;
    this.tx.mascot = this.mascotFor(this.pixel?.look ?? null);
    for (const cloud of this.clouds) cloud.texture = this.tx.cloud;
    this.backdrop.texture = this.tx.backdrops[this.bd.cur]!; this.backdropOld.texture = this.tx.backdrops[this.bd.prev]!;
    for (const b of [this.backdrop, this.backdropOld]) { b.width = cam.W + BACKDROP_MARGIN * 2; b.height = cam.hy + 2; }
    this.fog.texture = this.tx.fog;
    this.fog.width = cam.W; this.fog.height = (cam.H - cam.hy) * FOG_HEIGHT;
  }

  /** The stubby mascot: vector frames rasterised at the size they are shown (pixel style: a whole number of texels per art pixel, sampled NEAREST). */
  private pixelTextures(base: number, look: Look) {
    const m = this.pixel!, scale = m.scaleFor(base);
    const out = {} as MascotTex;
    for (const anim of ['idle', 'run', 'jump', 'slide'] as const) {
      out[anim] = Array.from({ length: m.count(anim) }, (_, i) => { const art = m.art(anim, i, scale, look); return makeTex(art, base * scale, m.crisp); });
    }
    const ring = (front: boolean) => look.effect?.ring ? Array.from({ length: RING_FRAMES }, (_, i) => makeTex(m.ring(look, i, front, scale)!, base * scale, m.crisp)) : [];
    out.ringBack = m.style === 'flat' ? ring(false) : []; out.ringFront = m.style === 'flat' ? ring(true) : [];
    return out;
  }

  private destroyTextures() {
    if (!this.tx) return;
    for (const p of [this.envPool, this.shadowPool, this.actorPool, this.fxPool]) p.detach();
    for (const s of [this.playerSprite, this.ringBackSprite, this.ringFrontSprite, this.shieldSprite, this.liftSprite, this.playerShadow, this.backdrop, this.backdropOld, ...this.clouds, this.fog]) s.texture = Texture.EMPTY;
    const t = this.tx;
    const all: Texture[] = [
      ...Object.values(t.hazards).map(x => x.tex), ...Object.values(t.ppe).map(x => x.tex), ...Object.values(t.power).map(x => x.tex), t.lift.tex, t.crate.tex, ...Object.values(t.on).map(x => x!.tex),
      t.shadow.tex, t.halo.tex, t.coin.tex, t.bonus.tex, t.loot.tex, t.pillar.tex, t.whitePillar.tex, t.light.tex, t.shield.tex, t.dot.tex, ...t.run.map(x => x.tex), ...t.slide.map(x => x.tex), ...t.backdrops, t.flame, t.drillSmoke, t.smoke, t.cloud, t.fog, ...t.props.flatMap(x => x ? [x.tex] : []),
      ...[...this.looks.values()].flatMap(set => Object.values(set).flat().map(x => x.tex)),
    ];
    this.looks.clear();
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

    // before anything is placed this frame, so no sprite is left holding a destroyed texture
    if (this.looks.size > KEEP_LOOKS) {
      const own = this.pixel!.look;
      for (const [l, set] of this.looks) if (l !== own) { for (const x of Object.values(set).flat()) x.tex.destroy(true); this.looks.delete(l); }
    }

    const I = interp(f);
    cam.camX = I.px * .28;
    fx.update(I, f.playing, cam, dt);
    fx.shakeOffset(now, this.shakeOff);
    this.world.position.set(this.shakeOff.x, this.shakeOff.y);

    // backdrop slides a little against the camera: far things move less than near things
    const bd = this.bd;
    bd.update(I.dist, f.s.stageZone, dt);
    this.backdrop.texture = tx.backdrops[bd.cur]!; this.backdrop.alpha = bd.t;
    this.backdropOld.texture = tx.backdrops[bd.prev]!; this.backdropOld.visible = bd.t < 1;
    const entrance = bd.cur === 0 ? bd.t : bd.prev === 0 ? 1 - bd.t : 0;
    this.floorU.uEntrance = entrance;
    this.floorU.uElectrical = bd.cur === 4 ? bd.t : bd.prev === 4 ? 1 - bd.t : 0;
    const cloudAlpha = .7 * entrance;
    let cloudIndex = 0;
    morningClouds(cam.W, cam.hy, now, (x,y,w,h) => {
      const cloud = this.clouds[cloudIndex++]!;
      cloud.visible = cloudAlpha > 0; cloud.alpha = cloudAlpha;
      cloud.position.set(x,y); cloud.width = w; cloud.height = h;
    });
    this.birds.clear();
    this.birds.alpha = cloudAlpha;
    if (cloudAlpha > 0) morningBirds(cam.W, cam.hy, now, (x, y, wing, lift) => {
      this.birds.moveTo(x - wing, y - lift)
        .quadraticCurveTo(x - wing * .4, y - 1, x, y + 1)
        .quadraticCurveTo(x + wing * .4, y - 1, x + wing, y - lift)
        .stroke({ color: '#405263', width: 1.4 });
    });
    this.backdrop.x = this.backdropOld.x = -BACKDROP_MARGIN - cam.camX * cam.lw * .16;
    this.floorU.uCamX = cam.camX;
    this.floorU.uDist4 = I.dist % 4;

    // pillars and ceiling lights
    const pool = this.envPool;
    pool.begin();
    const n = envItems(I.dist, this.env, f.s.stageZone);
    for (let i = 0; i < n; i++) {
      const it = this.env[i]!;
      const p = cam.project(it.l, it.z, it.light ? 6.5 : 0, this.pt);
      place(pool.get(), it.light ? tx.light : it.white ? tx.whitePillar : tx.pillar, p.x, p.y, cam.lw * p.s, sceneryOpacity(it.z), -it.z);
    }
    // the area's props along both sides
    const m = propItems(I.dist, f.s.stageZone, this.propList);
    let w = 0;
    entranceWires(I.dist, f.s.stageZone, cam, (points, z) => {
      let g = this.walls[w++];
      if (!g) { g = new Graphics(); this.envLayer.addChild(g); this.walls.push(g); }
      g.clear(); g.visible = true; g.alpha = sceneryOpacity(z); g.zIndex = -z;
      g.moveTo(points[0]!, points[1]!);
      for (let j = 2; j < points.length; j += 2) g.lineTo(points[j]!, points[j + 1]!);
      g.stroke({ color: '#333840', width: 1.2 });
    });
    for (let i = 0; i < m; i++) {
      const it = this.propList[i]!;
      const p = cam.project(it.l, it.z, 0, this.pt);
      const wall = PROPS[it.p]!.side;
      if (wall?.plant === 'exit') {
        drillFire(cam,it.l,it.z,it.drillSeed ?? 0,now,(kind,x,y,width,height,alpha) => {
          const sprite = pool.get();
          sprite.texture = kind === 'smoke' ? tx.drillSmoke : tx.flame;
          sprite.anchor.set(.5); sprite.position.set(x,y);
          sprite.width = width; sprite.height = height;
          sprite.alpha = alpha*sceneryOpacity(it.z); sprite.zIndex = -(it.z+1);
        });
      }
      if (wall?.plant === 'tanks') {
        tankSmoke(cam,it.l,it.z,it.variant ?? 0,now,(x,y,size,alpha) => {
          const puff = pool.get();
          puff.texture = tx.smoke; puff.anchor.set(.5); puff.position.set(x,y);
          puff.width = puff.height = size;
          puff.alpha = alpha * sceneryOpacity(it.z); puff.zIndex = -(it.z + wall.depth + .1);
        });
      }
      const model = PROPS[it.p]!.model;
      if (model) {
        let g = this.walls[w++];
        if (!g) { g = new Graphics(); this.envLayer.addChild(g); this.walls.push(g); }
        g.clear(); g.visible = true; g.alpha = sceneryOpacity(it.z); g.zIndex = -it.z;
        drawPropModel(cam, it.l, it.z, model, !!it.raised, (pts,color) => { g!.poly(pts).fill(color); });
      }
      const sprite = tx.props[it.p];
      if (sprite) place(pool.get(), sprite, p.x, p.y, cam.lw * p.s, sceneryOpacity(it.z), -it.z);
      if (PROPS[it.p]!.side) {
        let g = this.walls[w];
        if (!g) { g = new Graphics(); this.envLayer.addChild(g); this.walls.push(g); }
        g.clear(); g.visible = true; g.alpha = sceneryOpacity(it.z);
        g.zIndex = -sideWall(it, cam, (pts, color) => { g!.poly(pts).fill(color); });
        w++;
      }
    }
    for (let i = w; i < this.walls.length; i++) this.walls[i]!.visible = false;
    pool.end();

    // objects and the mascot
    const sh = this.shadowPool, ac = this.actorPool;
    sh.begin(); ac.begin();
    this.list.build(f, cam, I, now);
    this.playerSprite.visible = this.ringBackSprite.visible = this.ringFrontSprite.visible = this.shieldSprite.visible = this.playerShadow.visible = this.liftSprite.visible = false;
    for (let i = 0; i < this.list.n; i++) {
      const it = this.list.items[i]!;
      if (it.kind === 'player') { this.placePlayer(f, I, now); continue; }
      if (it.kind === 'ghost') {
        const gf = it.gf!, gI = interp(gf), up = gI.py * it.u * .9;
        place(sh.get(), tx.shadow, it.x, it.y, it.u * .5 / (1 + gI.py * .3), it.fade / (1 + gI.py));
        let t: Tex;
        const worn = tx.mascot && this.mascotFor(it.look);
        if (worn) { const pick = pixelFrame(gf, gI, GHOST_FX, now, this.pixel!.cfg); t = worn[pick.anim][pick.frame]!; }
        else { const P = pose(gf, cam, gI, GHOST_FX, now, this.pt); t = P.sliding ? tx.slide[P.frame]! : tx.run[P.frame]!; }
        const k = ringFrame(now), back = worn?.ringBack[k], front = worn?.ringFront[k];
        if (back && front) { place(ac.get(), back, it.x, it.y - up, it.u, it.fade, -it.z - .00001); place(ac.get(), front, it.x, it.y - up, it.u, it.fade, -it.z + .00001); }
        const s = ac.get();
        place(s, t, it.x, it.y - up, it.u, it.fade, -it.z);
        if (plain(it.look)) s.tint = GHOST_TINT;
        continue;
      }
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
      if (it.kind === 'bonus' || it.kind === 'loot') {
        place(sh.get(), tx.halo, it.x, it.y, it.u * 2, it.fade * it.halo);
        place(sh.get(), tx.shadow, it.x, it.gy, it.u * .6, it.fade * .5);
        const s = ac.get();
        place(s, tx[it.kind], it.x, it.y, it.u, it.fade, -it.z);
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
    if ((f.s.lift ?? 0) > 0 && P.groundY > P.deckY + 2) {
      // the man-lift: its scissor stack reaches from the floor up to the deck the mascot bounces on
      const ls = this.liftSprite;
      place(ls, tx.lift, P.x, P.deckY, u, P.alpha, -0.0003);
      ls.scale.y *= (P.groundY - P.deckY) / (1.4 * u);
      ls.visible = true;
    }
    if (tx.mascot) {
      const pick = pixelFrame(f, I, this.fx, now, this.pixel!.cfg), dpr = this.dpr, x = snap(P.x, dpr), y = snap(P.feetY + P.bob, dpr);
      place(ps, tx.mascot[pick.anim][pick.frame]!, x, y, u, P.alpha, -0.0001);
      ps.rotation = 0; ps.visible = true;       // no lean: the frames carry it
      if (f.s.lift) ps.scale.set(ps.scale.x * P.xs, ps.scale.y * P.ys);   // except the springy squash on the man-lift
      const k = ringFrame(now), back = tx.mascot.ringBack[k], front = tx.mascot.ringFront[k];
      if (back && front) {
        place(this.ringBackSprite, back, x, y, u, P.alpha, -0.00011); place(this.ringFrontSprite, front, x, y, u, P.alpha, -0.00009);
        this.ringBackSprite.visible = this.ringFrontSprite.visible = true;
      }
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
