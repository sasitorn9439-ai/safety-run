import { drillFire, makeDrillTexture } from './drill-fire.js';
import { makeTankSmoke, tankSmoke } from './plant-bay.js';
import { ZMAX } from '../../shared/sim.js';
import type { SimEvent } from '../../shared/sim.js';
import { BACKDROP_MARGIN, FOG_HEIGHT, makeCloud, morningBirds, morningClouds, makeBackdrop } from './backdrop.js';
import { Camera, type Pt } from './camera.js';
import { DrawList, Fx, GHOST_FX, TAU, entranceWires, envItems, interp, pose, type EnvItem, type Interp } from './fx.js';
import { drawPropModel, BackdropFade, ENTRANCE_YARD_EDGE, PROPS, sceneryOpacity, propItems, sideWall, type PropItem } from './scenery.js';
import { pixelFrame, snap, type PixelAnim } from './pixel-frames.js';
import { RING_FRAMES, ringFrame, type MascotSet } from './pixel-mascot.js';
import type { Look } from '../cosmetics/types.js';
import { Sprite, SpriteSet } from './sprites.js';
import { ZONES } from '../../shared/zones.js';
import type { Frame, GameRenderer } from './types.js';

/**
 * Canvas2D renderer. The fallback for devices without WebGL2: same look and motion as the WebGL one, drawn with
 * pre-rendered sprites (with a hand-made mip chain) and vector quads for the floor.
 */
/** a look's mascot frames, plus the frames of the rings it wears (empty when none), which play on their own clock */
type MascotSprites = Record<PixelAnim | 'ringBack' | 'ringFront', Sprite[]>;

export class Canvas2DRenderer implements GameRenderer {
  readonly kind = 'canvas';
  get mascot() { return this.pixel?.style ?? 'vector' as const; }
  private cam = new Camera();
  private fx = new Fx();
  private list = new DrawList();
  private ctx: CanvasRenderingContext2D;
  private dpr: number;
  private sprites!: SpriteSet;
  private drillTextures = { flame: makeDrillTexture('flame'), smoke: makeDrillTexture('smoke') };
  private tankSmokeTexture = makeTankSmoke();
  private cloud = makeCloud();
  private backdrops: HTMLCanvasElement[] = [];
  private bd = new BackdropFade();
  private props: (Sprite | null)[] = [];
  private propList: PropItem[] = [];
  private sceneItems: { z: number; draw: () => void }[] = [];
  private greenRoad!: CanvasGradient;
  private floorGrad!: CanvasGradient;
  private fogGrad!: CanvasGradient;
  private builtKey = '';
  private pxSprites: MascotSprites | null = null;
  /** each look's mascot frames (the player's own and the ghosts'), for the current screen size */
  private looks = new Map<Look, MascotSprites>();
  private lastNow = 0;
  private slowFrames = 0;
  private env: EnvItem[] = [];
  private a: Pt = { x: 0, y: 0, s: 1 };
  private b: Pt = { x: 0, y: 0, s: 1 };
  private c: Pt = { x: 0, y: 0, s: 1 };
  private d: Pt = { x: 0, y: 0, s: 1 };
  private shakeOff = { x: 0, y: 0 };

  constructor(private canvas: HTMLCanvasElement, private pixel?: MascotSet) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
  }

  get renderScale() { return this.dpr; }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const { cam, dpr } = this;
    this.canvas.width = Math.round(r.width * dpr);
    this.canvas.height = Math.round(r.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cam.set(r.width, r.height);
    this.build(false);
  }

  rebuild() { this.build(true); }

  setLook(look: Look) {
    if (this.pixel?.style !== 'flat' || this.pixel.look === look) return;
    this.pixel.look = look;
    if (this.pxSprites) this.pxSprites = this.mascotFor(look);
  }

  /** the mascot's frames in `look`, drawn the first time they are asked for */
  private mascotFor(look: Look | null): MascotSprites | null {
    const m = this.pixel;
    if (!m) return null;
    const key = m.style === 'flat' && look ? look : m.look;
    let px = this.looks.get(key);
    if (!px) {
      // a host sees new players every round: past a few looks, drop the ones nobody is wearing on screen
      if (this.looks.size >= 6) for (const l of this.looks.keys()) if (l !== m.look) this.looks.delete(l);
      const base = this.cam.lw * this.dpr, scale = m.scaleFor(base);
      px = {} as MascotSprites;
      for (const anim of ['idle', 'run', 'jump', 'slide'] as const) {
        px[anim] = Array.from({ length: m.count(anim) }, (_, i) => { const art = m.art(anim, i, scale, key); return new Sprite(art.box, art, base * scale, 1); });
      }
      const ring = (front: boolean) => key.effect?.ring && m.style === 'flat'
        ? Array.from({ length: RING_FRAMES }, (_, i) => { const art = m.ring(key, i, front, scale)!; return new Sprite(art.box, art, base * scale, 1); }) : [];
      px.ringBack = ring(false); px.ringFront = ring(true);
      this.looks.set(key, px);
    }
    return px;
  }

  private build(force: boolean) {
    const { cam, dpr, ctx } = this;
    const key = [cam.W, cam.H, dpr].join('x');
    if (!force && key === this.builtKey) return;
    this.builtKey = key;
    this.sprites = new SpriteSet(cam.lw, dpr);
    // the mascot: vector frames rasterised at the size the screen needs
    this.looks.clear();
    this.pxSprites = this.mascotFor(this.pixel?.look ?? null);
    this.backdrops = ZONES.map((_, z) => makeBackdrop(cam, dpr, z));
    this.props = PROPS.map(p => p.art ? new Sprite(p.art.box, p.art, cam.lw * dpr * p.art.scale, 5) : null);
    this.greenRoad = ctx.createLinearGradient(0, cam.hy, 0, cam.H);
    this.greenRoad.addColorStop(0, '#537c68'); this.greenRoad.addColorStop(1, '#78a187');
    this.floorGrad = ctx.createLinearGradient(0, cam.hy, 0, cam.H);
    this.floorGrad.addColorStop(0, '#55595f'); this.floorGrad.addColorStop(1, '#9b9fa5');
    this.fogGrad = ctx.createLinearGradient(0, cam.hy, 0, cam.hy + (cam.H - cam.hy) * FOG_HEIGHT);
    this.fogGrad.addColorStop(0, 'rgba(58,63,71,.95)'); this.fogGrad.addColorStop(1, 'rgba(58,63,71,0)');
  }

  onEvent(e: SimEvent, px: number) { this.fx.onEvent(e, px, this.cam); }

  render(f: Frame, now: number) {
    const { ctx, cam, fx } = this;
    const rawDt = this.lastNow ? (now - this.lastNow) / 1000 : 0.016;
    const dt = Math.min(.05, rawDt);
    this.lastNow = now;
    this.adapt(rawDt, f.playing);

    const I = interp(f);
    cam.camX = I.px * .28;
    fx.update(I, f.playing, cam, dt);

    ctx.save();
    fx.shakeOffset(now, this.shakeOff);
    if (fx.shake > 0) ctx.translate(this.shakeOff.x, this.shakeOff.y);
    this.bd.update(I.dist, f.s.stageZone, dt);
    this.drawScene(I.dist, f.s.stageZone, now);
    this.drawActors(f, I, now);
    this.drawParticles();
    ctx.restore();

    if (f.flash > 0) { ctx.fillStyle = `rgba(120,225,255,${f.flash})`; ctx.fillRect(0, 0, cam.W, cam.H); }
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

  /** Adds one floor quad to the current path (no beginPath/fill), so many quads of one colour cost a single fill. */
  private addQuad(l1: number, l2: number, z1: number, z2: number) {
    const { cam, ctx, a, b, c, d } = this;
    cam.project(l1, z1, 0, a); cam.project(l2, z1, 0, b); cam.project(l2, z2, 0, c); cam.project(l1, z2, 0, d);
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y);
  }

  private quad(l1: number, l2: number, z1: number, z2: number, color: string | CanvasGradient) {
    this.ctx.fillStyle = color; this.ctx.beginPath();
    this.addQuad(l1, l2, z1, z2);
    this.ctx.fill();
  }

  private drawScene(dist: number, stageZone: number | undefined, now: number) {
    const { ctx, cam, sprites, dpr } = this;
    const { W, H, hy, lw } = cam;
    // backdrop slides a little against the camera: far things move less than near things
    const bx = -BACKDROP_MARGIN - cam.camX * lw * .16, bw = W + BACKDROP_MARGIN * 2, { bd } = this;
    if (bd.t < 1) ctx.drawImage(this.backdrops[bd.prev]!, bx, 0, bw, hy + 2);
    ctx.globalAlpha = bd.t; ctx.drawImage(this.backdrops[bd.cur]!, bx, 0, bw, hy + 2); ctx.globalAlpha = 1;
    const entrance = bd.cur === 0 ? bd.t : bd.prev === 0 ? 1 - bd.t : 0;
    ctx.globalAlpha = .7 * entrance;
    if (ctx.globalAlpha > 0) morningClouds(W, hy, now, (x,y,w,h) => ctx.drawImage(this.cloud, x,y,w,h));
    if (ctx.globalAlpha > 0) morningBirds(W, hy, now, (x, y, wing, lift) => {
      ctx.beginPath(); ctx.moveTo(x - wing, y - lift);
      ctx.quadraticCurveTo(x - wing * .4, y - 1, x, y + 1);
      ctx.quadraticCurveTo(x + wing * .4, y - 1, x + wing, y - lift);
      ctx.strokeStyle = '#405263'; ctx.lineWidth = 1.4; ctx.stroke();
    });
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#3d4148'; ctx.fillRect(0, hy, W, H - hy);
    if (entrance > 0) {
      ctx.globalAlpha = entrance; ctx.fillStyle = '#839866'; ctx.fillRect(0, hy, W, H - hy);
      ctx.globalAlpha = 1;
      this.quad(-ENTRANCE_YARD_EDGE, ENTRANCE_YARD_EDGE, -4, 100000, '#3d4148');
    }
    const electrical = bd.cur === 4 ? bd.t : bd.prev === 4 ? 1 - bd.t : 0;
    if (electrical > 0) {
      ctx.globalAlpha = electrical; ctx.fillStyle = '#46705e'; ctx.fillRect(0, hy, W, H - hy);
      ctx.globalAlpha = 1;
    }
    this.quad(-1.5, 1.5, -3, ZMAX, this.floorGrad);
    if (electrical > 0) {
      ctx.globalAlpha = electrical;
      this.quad(-1.5, 1.5, -3, ZMAX, this.greenRoad);
      ctx.globalAlpha = 1;
    }

    // hazard tape on both edges: black base first, yellow on top, so no hairline seams between segments
    this.quad(-1.66, -1.5, -3, ZMAX, '#1a1a1a'); this.quad(1.5, 1.66, -3, ZMAX, '#1a1a1a');
    ctx.fillStyle = '#ffd400'; ctx.beginPath();
    for (let z = -(dist % 2); z < ZMAX; z += 2) { this.addQuad(-1.66, -1.5, z, z + 1); this.addQuad(1.5, 1.66, z, z + 1); }
    ctx.fill();
    ctx.fillStyle = 'rgba(255,212,0,.85)'; ctx.beginPath();
    for (let z = -(dist % 4); z < ZMAX; z += 4) { this.addQuad(-.53, -.47, z, z + 1.8); this.addQuad(.47, .53, z, z + 1.8); }
    ctx.fill();

    // haze where the floor meets the wall: on the floor only, under the scenery (far scenery fades out by itself)
    ctx.fillStyle = this.fogGrad; ctx.fillRect(0, hy, W, (H - hy) * FOG_HEIGHT);

    // pillars, ceiling lights and the area's props along the sides, far to near
    const items = this.sceneItems; items.length = 0;
    entranceWires(dist, stageZone, cam, (points, z) => {
      items.push({ z, draw: () => {
        ctx.globalAlpha = sceneryOpacity(z); ctx.strokeStyle = '#333840'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(points[0]!, points[1]!);
        for (let j = 2; j < points.length; j += 2) ctx.lineTo(points[j]!, points[j + 1]!);
        ctx.stroke();
      } });
    });
    const n = envItems(dist, this.env, stageZone);
    for (let i = 0; i < n; i++) {
      const it = this.env[i]!;
      items.push({ z: it.z, draw: () => { const p = cam.project(it.l, it.z, it.light ? 6.5 : 0, this.a); ctx.globalAlpha = sceneryOpacity(it.z); (it.light ? sprites.light : it.white ? sprites.whitePillar : sprites.pillar).draw(ctx, p.x, p.y, lw * p.s, dpr); } });
    }
    const m = propItems(dist, stageZone, this.propList);
    for (let i = 0; i < m; i++) {
      const it = this.propList[i]!;
      const wall = PROPS[it.p]!.side;
      if (wall?.plant === 'exit') {
        items.push({ z: it.z+1, draw: () => {
          drillFire(cam,it.l,it.z,it.drillSeed ?? 0,now,(kind,x,y,w,h,alpha) => {
            ctx.globalAlpha = alpha*sceneryOpacity(it.z);
            ctx.drawImage(this.drillTextures[kind],x-w/2,y-h/2,w,h);
          });
        } });
      }
      if (wall?.plant === 'tanks') {
        items.push({ z: it.z + wall.depth + .1, draw: () => {
          tankSmoke(cam,it.l,it.z,it.variant ?? 0,now,(x,y,size,alpha) => {
            ctx.globalAlpha = alpha * sceneryOpacity(it.z);
            ctx.drawImage(this.tankSmokeTexture,x-size/2,y-size/2,size,size);
          });
        } });
      }
      const model = PROPS[it.p]!.model;
      const sprite = this.props[it.p];
      items.push({ z: it.z, draw: () => {
        ctx.globalAlpha = sceneryOpacity(it.z);
        if (model) drawPropModel(cam, it.l, it.z, model, !!it.raised, (pts,color) => {
          ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(pts[0]!,pts[1]!);
          for (let j=2;j<pts.length;j+=2) ctx.lineTo(pts[j]!,pts[j+1]!);
          ctx.closePath(); ctx.fill();
        });
        if (sprite) {
          const p = cam.project(it.l,it.z,0,this.a);
          sprite.draw(ctx,p.x,p.y,lw*p.s,dpr);
        }
      } });
      if (PROPS[it.p]!.side) {
        // the building's side wall, sorted by its far end so what stands in front of it is drawn over it
        const wallZ = it.z + PROPS[it.p]!.side!.depth;
        items.push({ z: wallZ, draw: () => {
          ctx.globalAlpha = sceneryOpacity(it.z);
          sideWall(it, cam, (pts, color) => {
            ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(pts[0]!, pts[1]!);
            for (let k = 2; k < 8; k += 2) ctx.lineTo(pts[k]!, pts[k + 1]!);
            ctx.closePath(); ctx.fill();
          });
        } });
      }
    }
    items.sort((p, q) => q.z - p.z);
    for (const it of items) it.draw();
    ctx.globalAlpha = 1;
  }

  private drawActors(f: Frame, I: Interp, now: number) {
    const { ctx, cam, sprites, dpr, list } = this;
    list.build(f, cam, I, now);
    for (let i = 0; i < list.n; i++) {
      const it = list.items[i]!;
      if (it.kind === 'player') { this.drawPlayer(f, I, now); continue; }
      ctx.globalAlpha = it.fade;
      if (it.kind === 'ghost') {
        const gf = it.gf!, gI = interp(gf), up = gI.py * it.u * .9;
        ctx.globalAlpha = it.fade / (1 + gI.py);
        sprites.shadow.draw(ctx, it.x, it.y, it.u * .5 / (1 + gI.py * .3), dpr);
        ctx.globalAlpha = it.fade;
        const worn = this.pxSprites && this.mascotFor(it.look);
        if (worn) {
          const pick = pixelFrame(gf, gI, GHOST_FX, now, this.pixel!.cfg), k = ringFrame(now);
          worn.ringBack[k]?.draw(ctx, it.x, it.y - up, it.u, dpr);
          worn[pick.anim][pick.frame]!.draw(ctx, it.x, it.y - up, it.u, dpr);
          worn.ringFront[k]?.draw(ctx, it.x, it.y - up, it.u, dpr);
        }
        else { const P = pose(gf, cam, gI, GHOST_FX, now, this.c); (P.sliding ? sprites.slide : sprites.run)[P.frame]!.draw(ctx, it.x, it.y - up, it.u, dpr); }
        ctx.globalAlpha = 1;
        continue;
      }
      if (it.kind === 'power') {
        ctx.globalAlpha = it.fade * it.halo; sprites.halo.draw(ctx, it.x, it.y, it.u * 1.9, dpr);
        ctx.globalAlpha = it.fade * .5; sprites.shadow.draw(ctx, it.x, it.gy, it.u * .6, dpr);
        ctx.globalAlpha = it.fade;
        ctx.save(); ctx.translate(it.x, it.y); ctx.scale(it.sx, 1); sprites.power[it.pw].draw(ctx, 0, 0, it.u, dpr); ctx.restore();
      } else if (it.kind === 'coin') {
        ctx.globalAlpha = it.fade * .35; sprites.shadow.draw(ctx, it.x, it.gy, it.u * .3, dpr);
        ctx.globalAlpha = it.fade;
        ctx.save(); ctx.translate(it.x, it.y); ctx.scale(it.sx, 1); sprites.coin.draw(ctx, 0, 0, it.u, dpr); ctx.restore();
      } else if (it.kind === 'ppe') {
        // glow behind, a small shadow on the floor, then the medallion turning slowly
        ctx.globalAlpha = it.fade * it.halo; sprites.halo.draw(ctx, it.x, it.y, it.u * 1.5, dpr);
        ctx.globalAlpha = it.fade * .45; sprites.shadow.draw(ctx, it.x, it.gy, it.u * .55, dpr);
        ctx.globalAlpha = it.fade;
        ctx.save(); ctx.translate(it.x, it.y); ctx.scale(it.sx, 1); sprites.ppe[it.p].draw(ctx, 0, 0, it.u, dpr); ctx.restore();
      } else if (it.kind === 'bonus' || it.kind === 'loot') {
        ctx.globalAlpha = it.fade * it.halo; sprites.halo.draw(ctx, it.x, it.y, it.u * 2, dpr);
        ctx.globalAlpha = it.fade * .5; sprites.shadow.draw(ctx, it.x, it.gy, it.u * .6, dpr);
        ctx.globalAlpha = it.fade;
        ctx.save(); ctx.translate(it.x, it.y); ctx.scale(it.sx, 1); sprites[it.kind].draw(ctx, 0, 0, it.u, dpr); ctx.restore();
      } else {
        if (it.k !== 'drop') sprites.shadow.draw(ctx, it.x, it.y, it.u * .95, dpr);
        ((it.blink && sprites.on[it.k]) || sprites.hazards[it.k]).draw(ctx, it.x, it.y, it.u, dpr);
        if (it.k === 'drop' && it.fall >= 0) sprites.crate.draw(ctx, it.x, it.y - it.fall * it.u, it.u, dpr);
      }
      ctx.globalAlpha = 1;
    }
  }

  private drawPlayer(f: Frame, I: Interp, now: number) {
    const { ctx, sprites, dpr } = this;
    const P = pose(f, this.cam, I, this.fx, now, this.c), u = P.u;
    ctx.globalAlpha = P.shadowAlpha;
    sprites.shadow.draw(ctx, P.x, P.groundY, P.shadowU, dpr);
    ctx.globalAlpha = P.alpha;
    if (P.shield) {
      ctx.fillStyle = 'rgba(90,210,255,.18)'; ctx.strokeStyle = 'rgba(120,225,255,.8)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(P.x, P.feetY + P.bob - u * .52, u * .42 * P.shieldPulse, u * .66 * P.shieldPulse, 0, 0, 7); ctx.fill(); ctx.stroke();
    }
    if ((f.s.lift ?? 0) > 0 && P.groundY > P.deckY + 2) {
      // the man-lift: its scissor stack reaches from the floor up to the deck the mascot bounces on
      ctx.save(); ctx.translate(P.x, P.deckY); ctx.scale(1, (P.groundY - P.deckY) / (1.4 * u));
      sprites.lift.draw(ctx, 0, 0, u, dpr); ctx.restore();
    }
    if (this.pxSprites) { this.drawPixel(f, I, now, P); ctx.globalAlpha = 1; return; }
    const sprite = P.sliding ? sprites.slide[P.frame]! : sprites.run[P.frame]!;
    ctx.save();
    ctx.translate(P.x, P.feetY);
    ctx.rotate(P.lean);
    ctx.scale(P.xs, P.ys);
    sprite.draw(ctx, 0, 0, u, dpr);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** Pixel-art mascot: no squash or lean (the frames have it), position snapped to the device grid, no smoothing. */
  private drawPixel(f: Frame, I: Interp, now: number, P: ReturnType<typeof pose>) {
    const { ctx, dpr } = this;
    const pick = pixelFrame(f, I, this.fx, now, this.pixel!.cfg);
    const crisp = this.pixel!.crisp;          // pixel art must not be smoothed; the smooth style is drawn 1:1
    if (crisp) ctx.imageSmoothingEnabled = false;
    const sprite = this.pxSprites![pick.anim][pick.frame]!, x = snap(P.x, dpr), y = snap(P.feetY + P.bob, dpr), k = ringFrame(now);
    this.pxSprites!.ringBack[k]?.draw(ctx, x, y, P.u, dpr);
    if (f.s.lift) { ctx.save(); ctx.translate(x, y); ctx.scale(P.xs, P.ys); sprite.draw(ctx, 0, 0, P.u, dpr); ctx.restore(); }   // springy squash on the man-lift
    else sprite.draw(ctx, x, y, P.u, dpr);
    this.pxSprites!.ringFront[k]?.draw(ctx, x, y, P.u, dpr);
    if (crisp) ctx.imageSmoothingEnabled = true;
  }

  private drawParticles() {
    const { ctx } = this;
    for (const p of this.fx.particles) {
      ctx.globalAlpha = p.life * p.alpha; ctx.fillStyle = '#' + p.color.toString(16).padStart(6, '0');
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (.5 + p.life * .5), 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}
