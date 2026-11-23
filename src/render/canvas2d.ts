import { ZMAX } from '../../shared/sim.js';
import type { SimEvent } from '../../shared/sim.js';
import { BACKDROP_MARGIN, FOG_HEIGHT, makeBackdrop } from './backdrop.js';
import { Camera, type Pt } from './camera.js';
import { DrawList, Fx, TAU, envItems, interp, pose, type EnvItem, type Interp } from './fx.js';
import { pixelFrame, snap, type PixelAnim } from './pixel-frames.js';
import type { MascotSet } from './pixel-mascot.js';
import { Sprite, SpriteSet } from './sprites.js';
import type { Frame, GameRenderer } from './types.js';

/**
 * Canvas2D renderer. The fallback for devices without WebGL2: same look and motion as the WebGL one, drawn with
 * pre-rendered sprites (with a hand-made mip chain) and vector quads for the floor.
 */
export class Canvas2DRenderer implements GameRenderer {
  readonly kind = 'canvas';
  get mascot() { return this.pixel?.style ?? 'vector' as const; }
  private cam = new Camera();
  private fx = new Fx();
  private list = new DrawList();
  private ctx: CanvasRenderingContext2D;
  private dpr: number;
  private sprites!: SpriteSet;
  private backdrop!: HTMLCanvasElement;
  private floorGrad!: CanvasGradient;
  private fogGrad!: CanvasGradient;
  private builtKey = '';
  private pxSprites: Record<PixelAnim, Sprite[]> | null = null;
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

  private build(force: boolean) {
    const { cam, dpr, ctx } = this;
    const key = [cam.W, cam.H, dpr].join('x');
    if (!force && key === this.builtKey) return;
    this.builtKey = key;
    this.sprites = new SpriteSet(cam.lw, dpr);
    if (this.pixel) {
      // the mascot: vector frames rasterised at the size the screen needs
      const m = this.pixel, base = cam.lw * dpr, scale = m.scaleFor(base);
      const px = {} as Record<PixelAnim, Sprite[]>;
      for (const anim of ['idle', 'run', 'jump', 'slide'] as const) {
        px[anim] = Array.from({ length: m.count(anim) }, (_, i) => { const art = m.art(anim, i, scale); return new Sprite(art.box, art, base * scale, 1); });
      }
      this.pxSprites = px;
    }
    this.backdrop = makeBackdrop(cam, dpr);
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
    this.drawScene(I.dist);
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

  private drawScene(dist: number) {
    const { ctx, cam, sprites, dpr } = this;
    const { W, H, hy, lw } = cam;
    // backdrop slides a little against the camera: far things move less than near things
    ctx.drawImage(this.backdrop, -BACKDROP_MARGIN - cam.camX * lw * .16, 0, W + BACKDROP_MARGIN * 2, hy + 2);
    ctx.fillStyle = '#3d4148'; ctx.fillRect(0, hy, W, H - hy);
    this.quad(-1.5, 1.5, -3, ZMAX, this.floorGrad);

    // hazard tape on both edges: black base first, yellow on top, so no hairline seams between segments
    this.quad(-1.66, -1.5, -3, ZMAX, '#1a1a1a'); this.quad(1.5, 1.66, -3, ZMAX, '#1a1a1a');
    ctx.fillStyle = '#ffd400'; ctx.beginPath();
    for (let z = -(dist % 2); z < ZMAX; z += 2) { this.addQuad(-1.66, -1.5, z, z + 1); this.addQuad(1.5, 1.66, z, z + 1); }
    ctx.fill();
    ctx.fillStyle = 'rgba(255,212,0,.85)'; ctx.beginPath();
    for (let z = -(dist % 4); z < ZMAX; z += 4) { this.addQuad(-.53, -.47, z, z + 1.8); this.addQuad(.47, .53, z, z + 1.8); }
    ctx.fill();

    // pillars and ceiling lights, far to near
    const n = envItems(dist, this.env);
    const items = this.env.slice(0, n).sort((p, q) => q.z - p.z);
    for (const it of items) {
      const p = cam.project(it.l, it.z, it.light ? 6.5 : 0, this.a);
      (it.light ? sprites.light : sprites.pillar).draw(ctx, p.x, p.y, lw * p.s, dpr);
    }
    // haze where the floor meets the wall
    ctx.fillStyle = this.fogGrad; ctx.fillRect(0, hy, W, (H - hy) * FOG_HEIGHT);
  }

  private drawActors(f: Frame, I: Interp, now: number) {
    const { ctx, cam, sprites, dpr, list } = this;
    list.build(f, cam, I, now);
    for (let i = 0; i < list.n; i++) {
      const it = list.items[i]!;
      if (it.kind === 'player') { this.drawPlayer(f, I, now); continue; }
      ctx.globalAlpha = it.fade;
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
    if ((f.s.lift ?? 0) > 0 && P.groundY > P.feetY + 2) {
      // the man-lift: its scissor stack reaches from the floor up to the mascot's feet
      ctx.save(); ctx.translate(P.x, P.feetY); ctx.scale(1, (P.groundY - P.feetY) / (1.4 * u));
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
    this.pxSprites![pick.anim][pick.frame]!.draw(ctx, snap(P.x, dpr), snap(P.feetY + P.bob, dpr), P.u, dpr);
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
