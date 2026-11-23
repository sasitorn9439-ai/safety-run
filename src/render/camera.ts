export interface Pt { x: number; y: number; s: number }

/** Perspective camera: lane/depth/height → screen. Slides sideways a little with the player for parallax. */
export class Camera {
  W = 360; H = 640; hy = 0; by = 0; lw = 0; camX = 0;
  static readonly D = 6;

  set(W: number, H: number) { this.W = W; this.H = H; this.hy = H * .3; this.by = H * .87; this.lw = Math.min(W * .3, H * .19); }

  project(l: number, z: number, y: number, o: Pt): Pt {
    const D = Camera.D, s = D / (D + Math.max(z, -D * .8));
    o.x = this.W / 2 + (l - this.camX) * this.lw * s;
    o.y = this.hy + (this.by - this.hy) * s - y * this.lw * s * .9;
    o.s = s;
    return o;
  }
}
