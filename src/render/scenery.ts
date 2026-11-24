import { drawStorageSpace, type StorageSpace } from './storage-space.js';
/**
 * Scenery that tells the plant areas apart: props standing along both sides of the corridor (lockers at the entrance,
 * pallet racks in the forklift lane, drums in the chemical area, scaffold towers, switchgear, fire points) and the
 * wall behind the horizon. Props belong to a metre of the run, so a new area's props come up the corridor towards
 * you as you approach it; the wall cross-fades once they reach the horizon.
 */
import { drawAerialLift, type LiftModel } from './aerial-lift.js';
import { drawTubeBundle } from './tube-bundle.js';
import { drawChemicalContainer, type ChemicalContainer } from './chemical-containers.js';
import { drawPlantBay, type PlantBay } from './plant-bay.js';
import { drawStorageRack, type RackLoad } from './storage-rack.js';
import { ZMAX } from '../../shared/sim.js';
import { ZONES, zoneIndexAt } from '../../shared/zones.js';
import type { Ctx } from './draw.js';
import type { Art } from './sprites.js';
import type { Camera, Pt } from './camera.js';

/** fill a rectangle given in art units */
function box(c: Ctx, u: number, x: number, y: number, w: number, h: number, color: string) {
  c.fillStyle = color; c.fillRect(x * u, y * u, w * u, h * u);
}
function line(c: Ctx, u: number, pts: number[], color: string, width: number) {
  c.strokeStyle = color; c.lineWidth = width * u; c.lineCap = 'round'; c.beginPath();
  for (let i = 0; i < pts.length; i += 2) (i ? c.lineTo : c.moveTo).call(c, pts[i]! * u, pts[i + 1]! * u);
  c.stroke();
}
/** a warning triangle (yellow, black border, a bolt or "!") centred on (x, y), r = half its width */
function warn(c: Ctx, u: number, x: number, y: number, r: number, bolt: boolean) {
  const tri = (k: number, color: string) => {
    c.fillStyle = color; c.beginPath();
    c.moveTo(x * u, (y - r * k) * u); c.lineTo((x + r * k) * u, (y + r * .8 * k) * u); c.lineTo((x - r * k) * u, (y + r * .8 * k) * u);
    c.closePath(); c.fill();
  };
  tri(1, '#111'); tri(.78, '#ffd400');
  c.fillStyle = '#111'; c.beginPath();
  if (bolt) {
    const p = [.08, -.55, -.22, .12, .02, .12, -.1, .62, .24, -.08, 0, -.08];
    for (let i = 0; i < p.length; i += 2) c.lineTo((x + p[i]! * r * .6) * u, (y + .1 * r + p[i + 1]! * r * .6) * u);
  } else { c.rect((x - r * .07) * u, (y - r * .32) * u, r * .14 * u, r * .5 * u); c.rect((x - r * .07) * u, (y + r * .3) * u, r * .14 * u, r * .14 * u); }
  c.fill();
}
// ---- the props: origin = the middle of their foot on the floor, y up is negative, 1 unit = one lane ----

function drawRack(c: Ctx, u: number) {
  for (const x of [-.86, .78]) {
    box(c, u, x, -3.75, .08, 3.75, '#1f5fbf');                             // blue uprights
    for (let y = -3.6; y < 0; y += .25) box(c, u, x + .02, y, .04, .06, '#123b7a');
  }
  // the rack guard at its foot: yellow and black
  for (let i = 0; i < 6; i++) box(c, u, -.9 + i * .3, -.26, .3, .26, i % 2 ? '#111' : '#ffd400');
}

function drawHarnessStand(c: Ctx, u: number) {
  // a harness hanging on a stand
  box(c, u, .82, -2.2, .06, 2.2, '#6b7280'); box(c, u, .66, -2.2, .24, .05, '#6b7280');
  line(c, u, [.7, -2.15, .6, -1.6, .72, -1.2, .84, -1.6, .74, -2.15], '#ff7a1a', .06);
}

function drawExtinguisher(c: Ctx, u: number) {
  box(c, u, -.04, -2.5, .08, 2.5, '#9aa1aa');
  box(c, u, -.36, -2.7, .72, .5, '#d42020');
  c.fillStyle = '#fff'; c.font = `bold ${.13 * u}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText('FIRE', 0, -2.53 * u); c.fillText('EXTINGUISHER', 0, -2.36 * u);
  for (const x of [-.24, .24]) {
    box(c, u, x - .13, -.96, .26, .9, '#e02424');
    box(c, u, x - .13, -.96, .07, .9, 'rgba(255,255,255,.22)');
    c.fillStyle = '#e02424'; c.beginPath(); c.ellipse(x * u, -.96 * u, .13 * u, .07 * u, 0, Math.PI, 0); c.fill();
    box(c, u, x - .04, -1.12, .08, .12, '#333'); line(c, u, [x + .04, -1.08, x + .16, -1.0, x + .14, -.6], '#222', .03);
    box(c, u, x - .1, -.62, .2, .18, '#fff');
  }
  box(c, u, -.42, -.06, .84, .06, '#ffd400');
}

function drawExitSign(c: Ctx, u: number) {
  box(c, u, -.04, -3.1, .08, 3.1, '#9aa1aa');
  c.fillStyle = 'rgba(80,255,140,.22)'; c.beginPath(); c.ellipse(0, -3.25 * u, .8 * u, .45 * u, 0, 0, 7); c.fill();
  box(c, u, -.55, -3.5, 1.1, .5, '#12a150');
  box(c, u, -.5, -3.45, .4, .4, '#fff');
  // the running figure, heading for the door
  c.fillStyle = '#12a150'; c.beginPath(); c.arc(-.26 * u, -3.38 * u, .045 * u, 0, 7); c.fill();
  line(c, u, [-.28, -3.32, -.32, -3.2, -.4, -3.12], '#12a150', .04);
  line(c, u, [-.32, -3.2, -.22, -3.14, -.18, -3.08], '#12a150', .04);
  line(c, u, [-.4, -3.3, -.28, -3.3, -.2, -3.26], '#12a150', .035);
  c.fillStyle = '#fff'; c.font = `bold ${.2 * u}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText('EXIT', .2 * u, -3.25 * u);
  // the assembly-point arrow underneath
  box(c, u, -.4, -2.55, .8, .32, '#12a150');
  c.fillStyle = '#fff'; c.beginPath();
  c.moveTo(.25 * u, -2.39 * u); c.lineTo(.05 * u, -2.5 * u); c.lineTo(.05 * u, -2.28 * u); c.closePath(); c.fill();
  box(c, u, -.25, -2.42, .32, .06, '#fff');
}

// ---- buildings: the far row, a street of facades set back from the corridor ----

function text(c: Ctx, u: number, s: string, x: number, y: number, size: number, color: string) {
  c.fillStyle = color; c.font = `bold ${size * u}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(s, x * u, y * u);
}

function drawWarehouse(c: Ctx, u: number) {
  box(c, u, -1.8, -4.2, 3.6, 4.2, '#adb0ad');
  c.fillStyle = '#adb0ad';
  c.beginPath();
  c.moveTo(-1.8*u, -4.2*u);
  c.lineTo(1.23*u, -4.86*u);
  c.lineTo(1.8*u, -4.2*u);
  c.closePath(); c.fill();
  line(c, u, [-1.8,-4.2, 1.23,-4.86, 1.8,-4.2], '#757c7b', .055);
  box(c, u, -1.8, -1.45, 3.6, .07, '#d1d3d0');
  box(c, u, -1.57, -2.62, 2.47, 1.15, '#e8e9e5');
  c.save();
  c.translate(-1.25*u, -2.04*u);
  c.fillStyle = '#b32433';
  for (let i = 0; i < 3; i++) {
    c.beginPath(); c.moveTo(0,0); c.lineTo(-.075*u,-.13*u);
    c.lineTo(0,-.26*u); c.lineTo(.075*u,-.13*u); c.closePath(); c.fill();
    c.rotate(2*Math.PI/3);
  }
  c.restore();
  c.fillStyle = '#191f23'; c.font = `bold ${.23*u}px sans-serif`;
  c.textAlign = 'left'; c.textBaseline = 'middle';
  c.fillText('MITSUBISHI CHEMICAL', -.96*u, -2.18*u, 1.76*u);
  c.fillText('ADVANCED MATERIALS', -.96*u, -1.9*u, 1.76*u);
  for (const x of [1.13, 1.31]) box(c, u, x, -4.84, .025, 4.8, '#707775');
  for (let y = -4.76; y < -.05; y += .24) box(c, u, 1.13, y, .2, .024, '#808785');
}

function drawOffice(c: Ctx, u: number) {
  const W = 1.6, H = 5.4;
  box(c, u, -W, -H, 2 * W, H, '#d6d9dd');
  box(c, u, -W, -H, 2 * W, .22, '#9aa1aa');                                    // parapet
  for (let f = 0; f < 3; f++) {
    const y = -H + .55 + f * 1.25;
    box(c, u, -W, y + .85, 2 * W, .1, '#b9bec5');                              // floor band
    for (let k = 0; k < 4; k++) {
      const x = -W + .2 + k * .77, lit = (f * 4 + k) % 3 !== 1;
      box(c, u, x, y, .55, .75, lit ? '#f3d58a' : '#5d7891');
      box(c, u, x + .26, y, .03, .75, '#8a9099');
      if (lit) box(c, u, x, y, .55, .2, 'rgba(255,255,255,.25)');
    }
  }
  // glass entrance under a canopy
  box(c, u, -.7, -1.45, 1.4, 1.45, '#6c8fae');
  box(c, u, -.02, -1.45, .04, 1.45, '#3a4a5a');
  box(c, u, -.68, -1.43, .5, .5, 'rgba(255,255,255,.18)');
  box(c, u, -1.0, -1.7, 2.0, .2, '#2f4a66');
  box(c, u, -.9, -1.5, .06, 1.5, '#2f4a66'); box(c, u, .84, -1.5, .06, 1.5, '#2f4a66');
  box(c, u, -.75, -2.05, 1.5, .3, '#1f5fbf');
  text(c, u, 'OFFICE', 0, -1.9, .2, '#fff');
  box(c, u, -W, -.12, 2 * W, .12, '#9aa1aa');
}

function drawGuardHouse(c: Ctx, u: number) {
  // the booth: white walls, a blue roof slab, a wide window
  box(c, u, -.95, -2.6, 1.9, .22, '#1f5fbf');
  box(c, u, -.85, -2.4, 1.7, 2.4, '#eef0f2');
  box(c, u, -.7, -1.95, 1.4, .75, '#7fa6c6'); box(c, u, -.68, -1.93, .5, .3, 'rgba(255,255,255,.3)');
  box(c, u, -.72, -1.18, 1.44, .08, '#9aa1aa');
  box(c, u, -.85, -2.38, 1.7, .32, '#1b2b3c');
  text(c, u, 'SECURITY', 0, -2.22, .18, '#ffd400');
  // the barrier arm, red and white, swung up
  box(c, u, -1.2, -1.0, .2, 1.0, '#ffd400');
  c.save(); c.translate(-1.1 * u, -.9 * u); c.rotate(-1.2);
  for (let k = 0; k < 6; k++) box(c, u, k * .3, -.05, .3, .1, k % 2 ? '#fff' : '#e0261b');
  c.restore();
  // a sign-in board on the wall
  box(c, u, .2, -1.0, .5, .55, '#fff'); box(c, u, .25, -.9, .4, .04, '#888'); box(c, u, .25, -.8, .3, .04, '#888'); box(c, u, .25, -.7, .35, .04, '#888');
}

/**
 * The wall of a building that faces the corridor, drawn in perspective so it runs off towards the horizon:
 * `half` = from the facade's centre to that wall (art units), `h` = its height, `depth` = metres it runs back.
 */
export interface SideWall { plant?: PlantBay; rackLoad?: RackLoad; laneOffset?: number; parking?: number; half: number; h: number; depth: number; wall: string; dark: string; look: 'ribs' | 'windows' | 'plain' }

/** `far`: a building in the back row, set well back from the corridor */
export interface SceneryProp { art?: Art; model?: ChemicalContainer | 'tubes' | LiftModel | StorageSpace; zone: number; far?: boolean; side?: SideWall }
export function drawPropModel(cam: Camera, lane: number, depth: number, model: NonNullable<SceneryProp['model']>, raised: boolean,
  emit: (points: number[], color: string) => void) {
  if (model === 'white-shelf' || model === 'wood-pallet' || model === 'empty-space') drawStorageSpace(cam, lane, depth, model, emit);
  else if (model === 'boom' || model === 'scissor') drawAerialLift(cam, lane, depth, model, raised, emit);
  else if (model === 'tubes') drawTubeBundle(cam, lane, depth, emit);
  else drawChemicalContainer(cam, lane, depth, model, emit);
}
const prop = (zone: number, box: Art['box'], draw: Art['draw'], side?: SideWall): SceneryProp => ({ zone, far: !!side, side, art: { box, draw, scale: side ? .7 : .5, mips: true } });

function drawDumpster(c: Ctx, u: number) {
  for (const x of [-.62, .48]) box(c, u, x, -.19, .16, .19, '#343c38');
  box(c, u, -.78, -1.08, 1.56, .93, '#286949');
  box(c, u, -.78, -.24, 1.56, .1, '#194f36');
  for (const x of [-.65, -.28, .22, .58]) box(c, u, x, -.93, .045, .64, '#41805a');
  box(c, u, -.82, -1.16, 1.64, .15, '#174d36');
  box(c, u, -.77, -1.2, 1.54, .06, '#529168');
  box(c, u, -.19, -.83, .38, .23, '#e7e6d3');
  box(c, u, -.13, -.78, .26, .035, '#40634b');
}
const dumpster = prop(0, [-.86, -1.24, .86, 0], drawDumpster);

function drawTrees(c: Ctx, u: number, variant: number) {
  const crown = (x: number, y: number, w: number, h: number, color: string) => {
    c.fillStyle = color;
    c.beginPath(); c.ellipse(x*u, y*u, w*u, h*u, 0, 0, Math.PI*2); c.fill();
  };
  // Pick each tree's proportions once when the grove texture is baked.
  let state = variant + 31;
  const sample = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  for (const center of [-1.35, 1.35, 0]) {
    const x = center + (sample() - .5) * .42;
    const height = 2.8 + sample() * 5.8;
    const width = .72 + sample() * .94;
    const species = Math.floor(sample() * 4);
    if (species === 0) {
      const lean = sample() < .5 ? -.32 : .32;
      const top = -height + .65, head = x + lean;
      c.fillStyle = '#867761'; c.beginPath();
      c.moveTo((x-.14)*u, 0);
      c.quadraticCurveTo((x-.13)*u, top*.53*u, (head-.065)*u, top*u);
      c.lineTo((head+.065)*u, top*u);
      c.quadraticCurveTo((x+.12)*u, top*.53*u, (x+.14)*u, 0);
      c.closePath(); c.fill();
      for (const side of [-1, 1]) {
        for (let tier = 0; tier < 3; tier++) {
          const reach = width * (1.1 - tier*.25);
          const arch = .52 + tier*.23, drop = .89 - tier*.54;
          const color = ['#466d54', '#5c8057', '#769664'][tier]!;
          const rib = [head, top];
          for (let k = 1; k <= 9; k++) {
            const t = k / 9;
            const px = head + side*reach*t, py = top - 4*arch*t*(1-t) + drop*t;
            rib.push(px, py);
            const blade = .09 + .34*Math.sin(Math.PI*t);
            line(c, u, [px, py, px+side*blade*.48, py+blade], color, .052);
          }
          line(c, u, rib, color, .048);
        }
      }
      crown(head-.075, top+.1, .1, .13, '#776542');
      crown(head+.08, top+.16, .105, .14, '#8c7950');
      continue;
    }
    box(c, u, x-.11, -height+.9, .22, height-.9, '#696555');
    if (species === 1) {
      // Pine: overlapping tiers taper toward the leader.
      for (let tier = 0; tier < 3; tier++) {
        const y = height * (-.34 - tier * .17), spread = width * (1 - tier * .22);
        c.fillStyle = ['#496b5d', '#527764', '#648571'][tier]!;
        c.beginPath(); c.moveTo(x*u, (y - height*.32)*u);
        c.lineTo((x + spread)*u, y*u);
        c.quadraticCurveTo(x*u, (y + height*.08)*u, (x - spread)*u, y*u);
        c.closePath(); c.fill();
      }
      continue;
    }
    if (species === 2) {
      // Rain tree: forked limbs carry a wide, shallow umbrella canopy.
      for (const side of [-1, 1]) {
        line(c, u, [x,-height*.43, x+side*width*.37,-height*.71, x+side*width*.78,-height*.8], '#696555', .14);
        crown(x+side*width*.56, -height*.81, width*.69, height*.105, '#638064');
      }
      crown(x, -height*.89, width*.92, height*.11, '#78936d');
      continue;
    }
    line(c, u, [x,-height+.95, x+.04,-height*.54, x+.56,-height*.7], '#696555', .085);
    crown(x, height*-.74, width, height*.21, '#567462');
    crown(x-width*.42, height*-.78, width*.76, height*.145, '#62836b');
    crown(x+width*.29, height*-.86, width*.81, height*.14, '#749077');
    crown(x+width*.52, height*-.88, width*.47, height*.085, '#819b7d');
  }
  // Low shrubs cover the gaps below the crowns at the back of the paved yard.
  crown(-1.55, -.47, 1.17, .46, '#596f59');
  crown(-.46, -.65, 1.32, .63, '#688164');
  crown(.82, -.51, 1.27, .5, '#61795e');
  crown(1.92, -.38, .79, .37, '#738967');
}
const groves = Array.from({ length: 12 }, (_, variant) =>
  prop(0, [-3.8, -9.4, 3.8, 0], (c, u) => drawTrees(c, u, variant)));

const FAR_L = 5.9;
const warehouseOffset = 1.5, warehouseHalf = 1.8;
export const ENTRANCE_YARD_EDGE = FAR_L + warehouseOffset + warehouseHalf;

const extinguisher = prop(5, [-.45, -2.75, .45, 0], drawExtinguisher);

/** every prop, two per area (index into ZONES) */
export const PROPS: readonly SceneryProp[] = [
  dumpster, ...groves,
  ...(['cartons', 'totes', 'pallets'] as const).map(rackLoad =>
    prop(1, [-.95, -3.8, .95, 0], drawRack, { rackLoad, half: .86, h: 3.75, depth: 10.92, wall: '#355e83', dark: '#254c71', look: 'plain' })),
  { zone: 2, model: 'drums' },
  { zone: 2, model: 'ibc' },
  { zone: 3, model: 'boom' },
  { zone: 3, model: 'scissor' },
  { ...prop(3, [-.72, -2.25, .92, 0], drawHarnessStand), model: 'tubes' },
  { zone: 4, model: 'white-shelf' },
  { zone: 4, model: 'wood-pallet' },
  { zone: 4, model: 'empty-space' },
  extinguisher,
  prop(5, [-.85, -3.75, .85, 0], drawExitSign),
  { zone: 2, far: true, model: 'drums', side: { plant: 'tanks', half: 1, h: 5, depth: 11, wall: '#99aaa0', dark: '#74867d', look: 'plain' } },
  { model: 'tubes', ...prop(3, [-.72, -2.25, .92, 0], drawHarnessStand, { plant: 'scaffold', half: 1, h: 5.8, depth: 11, wall: '#99a7ad', dark: '#6a7881', look: 'plain' }) },
  { zone: 4, far: true, side: { plant: 'workshop', half: 1, h: 4, depth: 11, wall: '#88989b', dark: '#536369', look: 'plain' } },
  prop(5, [-.85, -3.75, .85, 0], drawExitSign, { plant: 'exit', half: 1, h: 3.7, depth: 11, wall: '#b3bcb4', dark: '#52665d', look: 'plain' }),
  // buildings: only the warehouse entrance is outdoors enough to have them
  prop(0, [-1.9, -4.95, 1.9, 0], drawWarehouse, { laneOffset: warehouseOffset, parking: 8, half: warehouseHalf, h: 4.2, depth: 11.4, wall: '#d2d3cf', dark: '#989d9c', look: 'ribs' }),
  prop(0, [-1.9, -4.95, 1.9, 0], drawWarehouse, { laneOffset: warehouseOffset, parking: 23, half: warehouseHalf, h: 4.2, depth: 11.4, wall: '#c8ccca', dark: '#969c9b', look: 'ribs' }),
  prop(0, [-1.65, -5.45, 1.65, 0], drawOffice, { half: 1.6, h: 5.4, depth: 7, wall: '#b4b8bd', dark: '#9aa0a7', look: 'windows' }),
  prop(0, [-1.25, -2.68, 1.0, 0], drawGuardHouse, { laneOffset: -1.5, half: .85, h: 2.4, depth: 2.4, wall: '#cfd3d7', dark: '#1f5fbf', look: 'plain' }),
  prop(0, [-1.9, -4.95, 1.9, 0], drawWarehouse, { laneOffset: warehouseOffset, parking: 26, half: warehouseHalf, h: 4.2, depth: 11.4, wall: '#d2d3cf', dark: '#989d9c', look: 'ribs' }),
  prop(0, [-1.9, -4.95, 1.9, 0], drawWarehouse, { laneOffset: warehouseOffset, parking: 57, half: warehouseHalf, h: 4.2, depth: 11.4, wall: '#c8ccca', dark: '#969c9b', look: 'ribs' }),
];
const byZone = (far: boolean) => ZONES.map((_, z) => PROPS.flatMap((p, i) => (p !== dumpster && !groves.includes(p) && p.zone === z && !!p.far === far ? [i] : [])));
const groveIndices = groves.map(grove => PROPS.indexOf(grove));
const extinguisherIndex = PROPS.indexOf(extinguisher);
const dumpsterIndex = PROPS.indexOf(dumpster);
const BY_ZONE = byZone(false), FAR_BY_ZONE = byZone(true);

/** metres between props on one side, how far from the centre line they stand; the same for the row of buildings */
const PROP_GAP = 6, PROP_L = 2.95, FAR_GAP = 14;


/** A prop along the corridor: depth, lateral position, index into PROPS. */
export interface PropItem { drillSeed?: number; raised?: boolean; variant?: number; parkedLift?: boolean; z: number; l: number; p: number }
/** Fills `out` with the props in view at `dist` and returns the count. */
export function propItems(dist: number, stageZone: number | undefined, out: PropItem[]): number {
  let n = 0;
  // Plant the perimeter independently of the building slots, including behind guard booths.
  const treeGap = 7;
  for (let k = Math.floor(dist / treeGap) - 1; k * treeGap < dist + ZMAX; k++) {
    for (const side of [-1, 1]) {
      const seed = Math.imul(k * 2 + (side > 0 ? 1 : 0), 2654435761) >>> 0;
      const m = k * treeGap + ((seed >>> 12) % 5);
      const z = m - dist;
      if (z < 0 || z >= ZMAX || zoneIndexAt(m, stageZone) !== 0) continue;
      const grove = (out[n++] ||= { z: 0, l: 0, p: 0 });
      grove.z = z; grove.l = side * (12.5 + ((seed >>> 20) % 4) * .55); grove.p = groveIndices[(seed >>> 7) % groveIndices.length]!;
    }
  }
  const first = Math.ceil((dist - 3) / PROP_GAP);
  for (let k = first; ; k++) {
    const m = k * PROP_GAP + 3, z = m - dist;
    if (z >= ZMAX) break;
    const zone = zoneIndexAt(m, stageZone);
    if (zone === 4 && (k & 3) >= 2) continue;
    const list = BY_ZONE[zone]!;
    if (!list.length) continue;
    for (const side of [-1, 1]) {
      const h = Math.imul(k * 2 + (side > 0 ? 1 : 0), 2654435761) >>> 0;
      const choice = zone === 4 ? Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 8 : h >>> 16;
      const slot = choice % (list.length + (zone === 3 ? 1 : 0));
      let propIndex = list[slot];
      if (zone === 5) {
        // One roadside fire point every six slots, alternating sides.
        const firePoint = k % 6 === 0 && side === ((k % 12 === 0) ? -1 : 1);
        if (firePoint) propIndex = extinguisherIndex;
        else if (propIndex === extinguisherIndex) continue;
      }
      if (propIndex === undefined) continue;
      const it = (out[n] ||= { z: 0, l: 0, p: 0 });
      it.raised = (h & 0x100) !== 0;
      it.z = z; it.l = side * (zone === 4 ? PROP_L : PROP_L + ((h >>> 8) % 5) * .05); it.p = propIndex; n++;
    }
  }
  // Include the previous building slot while its rear yard is still in view.
  for (let k = Math.ceil((dist - 6) / FAR_GAP) - 1; ; k++) {
    const m = k * FAR_GAP + 6, z = m - dist;
    if (z >= ZMAX) break;
    const list = FAR_BY_ZONE[zoneIndexAt(m, stageZone)]!;
    if (!list.length) continue;
    for (const side of [-1, 1]) {
      const slot = k * 2 + (side > 0 ? 1 : 0);
      const mixed = Math.imul(slot ^ (slot >>> 16), 0x45d9f3b);
      const h = Math.imul(mixed ^ (mixed >>> 16), 0x45d9f3b) >>> 0;
      const building = list[(h >>> 12) % list.length]!;
      const wall = PROPS[building]!.side!;
      const buildingLane = FAR_L + (wall.laneOffset ?? 0);
      const rear = wall.depth + .8;
      const binZ = z + rear;
      const hasDumpster = wall.parking !== undefined && (h & 0x100) !== 0;
      if (hasDumpster && binZ >= 0 && binZ < ZMAX && zoneIndexAt(m + rear, stageZone) === 0) {
        const bin = (out[n++] ||= { z: 0, l: 0, p: 0 });
        bin.z = binZ; bin.l = side * (buildingLane + wall.half * .5); bin.p = dumpsterIndex;
      }
      if (wall.rackLoad) {
        for (let row = 2; row >= 1; row--) {
          const rearZ = z + row * 2.8;
          if (rearZ < 0 || rearZ >= ZMAX) continue;
          const rack = (out[n++] ||= { z: 0, l: 0, p: 0 });
          rack.z = rearZ;
          rack.l = side * (buildingLane + row * 3.4);
          rack.p = list[(h >>> (row * 4)) % list.length]!;
          rack.parkedLift = false;
        }
      }
      if (z < 0) continue;
      const it = (out[n++] ||= { z: 0, l: 0, p: 0 });
      it.z = z; it.l = side * buildingLane; it.p = building;
      it.drillSeed = wall.plant === 'exit' ? (h >>> 5) & 255 : undefined;
      it.variant = (h >>> 15) & (wall.plant === 'workshop' ? 15 : 1);
      it.parkedLift = !!wall.rackLoad && ((h >>> 7) % 4 === 0);
    }
  }
  return n;
}

/** Scenery eases out over the final ten metres before its near clipping point. */
export function sceneryOpacity(z: number): number {
  const near = Math.min(1, Math.max(0, z / 10));
  const far = Math.min(1, Math.max(0, (ZMAX - z) / (ZMAX * .3)));
  return near * near * (3 - 2 * near) * far;
}

/** Vertical art units to the camera's height units (the projection squashes height by 0.9). */
const Y = 1 / .9;
const corner: Pt = { x: 0, y: 0, s: 1 };
/**
 * The corridor-facing wall of a building, as screen-space quads (8 numbers each), back to front.
 * Returns the depth to sort it at: its far end, so whatever stands in front of it is drawn over it.
 */
export function sideWall(it: PropItem, cam: Camera, emit: (pts: number[], color: string) => void): number {
  const S = PROPS[it.p]!.side;
  if (!S) return -1;
  const l = it.l - Math.sign(it.l) * S.half, z1 = it.z, z2 = it.z + S.depth, H = S.h * Y;
  if (S.plant) {
    drawPlantBay(cam, l, z1, S.plant, it.variant ?? 0, emit);
    return z2;
  }
  if (S.rackLoad) {
    drawStorageRack(cam, l, z1, S.rackLoad, !!it.parkedLift, emit);
    return z2;
  }
  const quad = (za: number, zb: number, ya: number, yb: number, color: string) => {
    const pts: number[] = [];
    for (const [z, y] of [[za, ya], [zb, ya], [zb, yb], [za, yb]] as const) { cam.project(l, z, y, corner); pts.push(corner.x, corner.y); }
    emit(pts, color);
  };
  quad(z1, z2, 0, H, S.wall);
  quad(z1, z2, 0, .5 * Y, '#5a616b');
  if (S.look === 'ribs') {
    quad(z1, z2, H * .81, H, '#afb4b2');
    for (let z = z1 + .12; z < z2 - .1; z += .32) quad(z, z + .06, H * .81, H, S.dark);
    quad(z1, z2, 0, H * .42, '#626d73');
    for (let bay = 2; bay >= 0; bay--) {
      const start = z1 + bay * S.depth / 3;
      const end = start + S.depth / 3;
      quad(start + .12, end - .12, H * .51, H * .7, '#344751');
      for (let i = 1; i < 4; i++) {
        const z = start + i * S.depth / 12;
        quad(z, z + .06, H * .51, H * .7, '#c0c6c5');
      }
      quad(start + .12, end - .12, H * .62, H * .634, '#9fa8a8');
      quad(start + .18, start + .68, H * .43, H * .51, '#eeeae0');
      quad(start + .25, start + .54, H * .448, H * .49, '#838b89');
    }
    // Project the awning's outer edge toward the road, including its blue steel posts.
    const towardRoad = -Math.sign(l);
    const outer = l + towardRoad * 3.05;
    const face = (points: readonly [number, number, number][], color: string) => {
      const pts: number[] = [];
      for (const [offset, z, height] of points) {
        cam.project(l + towardRoad * offset, z, height, corner);
        pts.push(corner.x, corner.y);
      }
      emit(pts, color);
    };
    for (let bay = 2; bay >= 0; bay--) {
      const variant = ((S.parking ?? 0) >> (bay * 3)) & 7;
      if (variant === 7) continue;
      const center = z1 + (bay + .5) * S.depth / 3;
      const near = center - .58, far = center + .58;
      const rear = .16, nose = 2.94;
      const paint = ['#dddeda', '#81949f', '#424e55', '#ab5346'][variant % 4]!;
      face([[rear,near,.2],[nose,near,.2],[nose,near,.62],[rear,near,.62]], paint);
      face([[rear,near,.62],[rear,far,.62],[nose,far,.62],[nose,near,.62]], paint);
      face([[.45,near,.62],[2.3,near,.62],[1.88,near+.08,1.06],[.8,near+.08,1.06]], '#344853');
      face([[.8,near+.08,1.06],[.8,far-.08,1.06],[1.88,far-.08,1.06],[1.88,near+.08,1.06]], paint);
      face([[1.88,near+.08,1.06],[1.88,far-.08,1.06],[2.3,far,.62],[2.3,near,.62]], '#506978');
      face([[nose,near,.2],[nose,far,.2],[nose,far,.62],[nose,near,.62]], paint);
      for (const x of [.54,2.33]) {
        face([[x,near,.06],[x+.32,near,.06],[x+.36,near,.32],[x-.04,near,.32]], '#242b30');
      }
      for (const z of [near+.05,far-.28]) {
        face([[nose,z,.44],[nose,z+.23,.44],[nose,z+.23,.55],[nose,z,.55]], '#fff2cc');
      }
      face([[nose,center-.22,.29],[nose,center+.22,.29],[nose,center+.22,.39],[nose,center-.22,.39]], '#39434a');
    }
    face([[3.05,z1,H*.36],[3.05,z2,H*.36],[3.05,z2,H*.38],[3.05,z1,H*.38]], '#24537b');
    for (let bay = 0; bay < 3; bay++) {
      const z = z1 + bay * S.depth / 3;
      const pts: number[] = [];
      for (const [depth, height] of [[z, 0], [z + .09, 0], [z + .09, H * .38], [z, H * .38]] as const) {
        cam.project(outer, depth, height, corner); pts.push(corner.x, corner.y);
      }
      emit(pts, '#24537b');
    }
    const canopy: number[] = [];
    for (const [x, z, y] of [[l, z1, .42], [l, z2, .42], [outer, z2, .38], [outer, z1, .38]] as const) {
      cam.project(x, z, H * y, corner); canopy.push(corner.x, corner.y);
    }
    emit(canopy, '#babcb3');
  } else if (S.look === 'windows') {
    for (let f = 0; f < 3; f++) {
      const y = H - (.55 + f * 1.25 + .75) * Y;
      quad(z1, z2, y - .2 * Y, y - .1 * Y, S.dark);                                             // floor band
      for (let window = 0; .5 + window * 1.4 < S.depth - .6; window++) {
        const z = z1 + .5 + window * 1.4;
        quad(z, z + .8, y, y + .75 * Y, (f + window) % 3 ? '#f3d58a' : '#5d7891');
      }
    }
  } else {
    quad(z1 + .4, z2 - .4, H * .35, H * .7, '#7fa6c6');
    quad(z1, z2, H - .3 * Y, H, S.dark);
  }
  quad(z1, z2, H - .08 * Y, H, '#2b3138');                                                       // roof edge
  return z2;
}

/** Which backdrop to show: cross-fades to the area found where the corridor meets the wall. */
export class BackdropFade {
  cur = 0; prev = 0; t = 1;
  update(dist: number, stageZone: number | undefined, dt: number) {
    const want = zoneIndexAt(dist + ZMAX * .7, stageZone);
    if (want !== this.cur) { this.prev = this.t < .5 ? this.prev : this.cur; this.cur = want; this.t = 0; }
    this.t = Math.min(1, this.t + dt / 1.2);
  }
}
