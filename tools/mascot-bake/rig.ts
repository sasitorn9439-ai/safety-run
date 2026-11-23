/**
 * The Safety Run mascot as a small 3D rig: egg head with a red gem, round body, bell-shaped red cape, red mitts and shoes.
 * Proportions follow the old 2D art (1 unit = 1 game unit `u`; the mascot is ~0.94 u tall, feet at y = 0).
 * The camera looks from behind and slightly above, like the game camera, so +Z is toward the camera and the mascot faces -Z.
 */
import * as THREE from 'three';

export interface Limb { /** rotation about X, + swings the limb forward (away from camera) */ swing: number; /** rotation about Z, + moves it outward */ out: number }
export interface Leg { thigh: number; shin: number }

export interface Pose {
  /** extra hip height */ y: number;
  /** vertical squash about the feet (1 = none); width compensates */ squash: number;
  /** body pitch about X at the hips, + tips the head toward the camera */ pitch: number;
  roll: number; yaw: number;
  headPitch: number; headRoll: number; headYaw: number;
  legL: Leg; legR: Leg; armL: Limb; armR: Limb;
  /** cape: wave phase (radians), wave amplitude, how much the hem flares out, how much the hem lifts */
  cape: { phase: number; amp: number; flare: number; lift: number };
}

export const neutral = (): Pose => ({
  y: 0, squash: 1, pitch: 0, roll: 0, yaw: 0, headPitch: 0, headRoll: 0, headYaw: 0,
  legL: { thigh: 0, shin: 0 }, legR: { thigh: 0, shin: 0 },
  armL: { swing: 0, out: .08 }, armR: { swing: 0, out: .08 },
  cape: { phase: 0, amp: .012, flare: 0, lift: 0 },
});

const HIP_Y = .25;
const mat = (color: number, rough = .55, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra });

const M = {
  head: mat(0xfff9f6, .5), body: mat(0xeee6e3, .6), limb: mat(0xfff7f4, .55),
  gem: mat(0xf0414a, .25, { flatShading: true }), cape: mat(0xea3b43, .6, { side: THREE.DoubleSide }),
  scarf: mat(0xf0454d, .6), mitt: mat(0xf03d46, .5), shoe: mat(0xd02a33, .5), shoeTop: mat(0xf2474f, .45),
};

function egg(rx: number, ry: number, segs = 48): THREE.BufferGeometry {
  // wider at the bottom, slightly pointed at the top
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= segs; i++) {
    const phi = (i / segs) * Math.PI, yn = -Math.cos(phi);
    pts.push(new THREE.Vector2(Math.sin(phi) * rx * (1 - .14 * yn), yn * ry * (1 + .06 * Math.max(0, yn))));
  }
  return new THREE.LatheGeometry(pts, 64);
}

function ellipsoid(rx: number, ry: number, rz: number, material: THREE.Material) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 28), material);
  m.scale.set(rx, ry, rz);
  return m;
}

function capsule(r: number, len: number, material: THREE.Material) {
  return new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 10, 24), material);
}

export class Mascot {
  readonly root = new THREE.Group();
  private hips = new THREE.Group();
  private head = new THREE.Group();
  private legs = { L: { thigh: new THREE.Group(), shin: new THREE.Group(), foot: new THREE.Group() }, R: { thigh: new THREE.Group(), shin: new THREE.Group(), foot: new THREE.Group() } };
  private arms = { L: new THREE.Group(), R: new THREE.Group() };
  private cape: THREE.Mesh;
  private capeBase: Float32Array;
  private capePoints: number;

  constructor() {
    const { root, hips } = this;
    root.add(hips);
    hips.position.y = HIP_Y;

    // body
    const torso = ellipsoid(.165, .15, .15, M.body);
    torso.position.y = .08;
    hips.add(torso);

    // head: egg with a gem on top
    this.head.position.y = .425;
    const skull = new THREE.Mesh(egg(.27, .235), M.head);
    this.head.add(skull);
    // the gem is the mascot's signature: a diamond on the crown, tilted back so its face looks at the camera (as in the 2D art)
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(.14, 0), M.gem);
    gem.position.set(.01, .165, .085);
    gem.rotation.set(.62, .12, -.06);
    gem.scale.set(1.0, 1.2, .62);
    this.head.add(gem);
    hips.add(this.head);

    // legs: thigh + shin so knees can fold; red shoe at the ankle
    for (const [side, x] of [['L', -.105], ['R', .105]] as const) {
      const { thigh, shin, foot } = this.legs[side];
      thigh.position.set(x, 0, 0);
      const t = capsule(.055, .06, M.limb); t.position.y = -.075; thigh.add(t);
      shin.position.y = -.14;
      const s = capsule(.052, .05, M.limb); s.position.y = -.06; shin.add(s);
      foot.position.y = -.115;   // the ankle
      const shoe = ellipsoid(.075, .052, .105, M.shoe); shoe.position.set(0, 0, -.018); foot.add(shoe);
      const top = ellipsoid(.06, .036, .08, M.shoeTop); top.position.set(0, .017, -.03); foot.add(top);
      shin.add(foot);
      thigh.add(shin);
      hips.add(thigh);
    }

    // arms: hang from the shoulders, red mitts
    for (const [side, x] of [['L', -.165], ['R', .165]] as const) {
      const arm = this.arms[side];
      arm.position.set(x, .17, 0);
      const a = capsule(.045, .1, M.limb); a.position.y = -.09; arm.add(a);
      const mitt = ellipsoid(.058, .06, .056, M.mitt); mitt.position.y = -.2; arm.add(mitt);
      hips.add(arm);
    }

    // cape: a flared bell, open at both ends, plus a scarf ring at the neck
    const prof = [[.125, .26], [.185, .23], [.245, .15], [.295, .06], [.325, 0]].map(([r, y]) => new THREE.Vector2(r, y));
    const lathe = new THREE.LatheGeometry(prof, 72);
    this.capePoints = prof.length;
    this.capeBase = Float32Array.from(lathe.attributes.position.array as Float32Array);
    this.cape = new THREE.Mesh(lathe, M.cape);
    this.cape.position.y = .02;
    hips.add(this.cape);
    const scarf = new THREE.Mesh(new THREE.TorusGeometry(.135, .04, 20, 64), M.scarf);
    scarf.rotation.x = Math.PI / 2; scarf.position.y = .275;
    hips.add(scarf);
  }

  apply(p: Pose) {
    const { root, hips } = this;
    // squash about the feet; keep volume
    const sx = 1 / Math.sqrt(p.squash);
    root.scale.set(sx, p.squash, sx);
    hips.position.y = HIP_Y + p.y;
    hips.rotation.set(p.pitch, p.yaw, p.roll, 'YXZ');
    this.head.rotation.set(p.headPitch, p.headYaw, p.headRoll, 'YXZ');
    for (const [side, leg] of [['L', p.legL], ['R', p.legR]] as const) {
      this.legs[side].thigh.rotation.x = leg.thigh;
      this.legs[side].shin.rotation.x = leg.shin;
      // keep the shoe flatter than the leg (like an ankle would), otherwise it swings round into a tall oval
      this.legs[side].foot.rotation.x = -(leg.thigh + leg.shin) * .75 + p.pitch * .5;
    }
    // rotating a hanging limb by +z moves its hand toward +x, so "out" is negative z on the left arm
    this.arms.L.rotation.set(p.armL.swing, 0, -p.armL.out);
    this.arms.R.rotation.set(p.armR.swing, 0, p.armR.out);

    // cape hem wave
    const pos = this.cape.geometry.attributes.position as THREE.BufferAttribute;
    const n = this.capePoints;
    for (let i = 0; i < pos.count; i++) {
      const j = i % n, w = j / (n - 1);           // 0 at the neck, 1 at the hem
      const x0 = this.capeBase[i * 3]!, y0 = this.capeBase[i * 3 + 1]!, z0 = this.capeBase[i * 3 + 2]!;
      const ang = Math.atan2(z0, x0), r0 = Math.hypot(x0, z0);
      const wave = Math.sin(ang * 3 + p.cape.phase) * p.cape.amp * w * w;
      const r = r0 * (1 + p.cape.flare * w) + wave;
      pos.setXYZ(i, Math.cos(ang) * r, y0 + p.cape.lift * w * w + wave * .6, Math.sin(ang) * r);
    }
    pos.needsUpdate = true;
    this.cape.geometry.computeVertexNormals();
  }
}
