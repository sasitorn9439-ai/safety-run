/**
 * Thirty effects, composed from a few motions (rise, fall, orbit, trail behind) and shapes, plus glows and wings.
 * A motion places n particles evenly along one path and slides them one gap per animation loop, so the loop seams never show
 * and a quick run loop still looks like a slow drift. Everything stays within ±0.7 sideways and between y −1.35 and 0.3.
 */
import { drawCoin, type Ctx } from '../render/draw.js';
import type { Effect, Rarity } from './types.js';

const TAU = Math.PI * 2;
type Shape = (c: Ctx, x: number, y: number, r: number, color: string, rot: number) => void;

/* ---------- shapes, centred on (x, y) ---------- */
const dot: Shape = (c, x, y, r, col) => { c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); };
const glowDot: Shape = (c, x, y, r, col) => { c.save(); c.globalAlpha *= .35; dot(c, x, y, r * 2.2, col, 0); c.restore(); dot(c, x, y, r, col, 0); dot(c, x, y, r * .45, '#ffffff', 0); };
const ring: Shape = (c, x, y, r, col) => { c.strokeStyle = col; c.lineWidth = r * .28; c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke(); dot(c, x - r * .35, y - r * .35, r * .2, '#ffffff', 0); };
const square: Shape = (c, x, y, r, col, rot) => { c.save(); c.translate(x, y); c.rotate(rot); c.fillStyle = col; c.fillRect(-r, -r, r * 2, r * 2); c.restore(); };
const confetti: Shape = (c, x, y, r, col, rot) => { c.save(); c.translate(x, y); c.rotate(rot); c.fillStyle = col; c.fillRect(-r, -r * .45, r * 2, r * .9); c.restore(); };
const star: Shape = (c, x, y, r, col, rot) => {
  c.fillStyle = col; c.beginPath();
  for (let i = 0; i < 10; i++) { const a = rot - Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? r * .42 : r; c.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); }
  c.closePath(); c.fill();
};
const sparkle: Shape = (c, x, y, r, col) => {
  c.fillStyle = col; c.beginPath();
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, q = i % 2 ? r * .22 : r; c.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); }
  c.closePath(); c.fill();
};
const heart: Shape = (c, x, y, r, col) => {
  c.fillStyle = col; c.beginPath(); c.moveTo(x, y + r * .8);
  c.bezierCurveTo(x - r * 1.3, y - r * .1, x - r * .6, y - r * 1.1, x, y - r * .4);
  c.bezierCurveTo(x + r * .6, y - r * 1.1, x + r * 1.3, y - r * .1, x, y + r * .8); c.fill();
};
const note: Shape = (c, x, y, r, col) => {
  c.fillStyle = col; c.beginPath(); c.ellipse(x - r * .3, y + r * .5, r * .42, r * .3, -.4, 0, TAU); c.fill();
  c.fillRect(x + r * .02, y - r, r * .16, r * 1.5);
  c.beginPath(); c.moveTo(x + r * .1, y - r); c.quadraticCurveTo(x + r * .8, y - r * .7, x + r * .6, y - r * .1); c.lineTo(x + r * .18, y - r * .55); c.fill();
};
const leaf: Shape = (c, x, y, r, col, rot) => {
  c.save(); c.translate(x, y); c.rotate(rot); c.fillStyle = col; c.beginPath();
  c.moveTo(0, -r); c.quadraticCurveTo(r * .8, 0, 0, r); c.quadraticCurveTo(-r * .8, 0, 0, -r); c.fill();
  c.strokeStyle = 'rgba(0,0,0,.18)'; c.lineWidth = r * .1; c.beginPath(); c.moveTo(0, -r * .8); c.lineTo(0, r * .8); c.stroke(); c.restore();
};
/** a small five-petal flower with a yellow centre */
const flower: Shape = (c, x, y, r, col, rot) => {
  c.save(); c.translate(x, y); c.rotate(rot); c.fillStyle = col;
  for (let i = 0; i < 5; i++) { c.rotate(TAU / 5); c.beginPath(); c.ellipse(0, -r * .55, r * .38, r * .5, 0, 0, TAU); c.fill(); }
  c.fillStyle = '#ffca28'; c.beginPath(); c.arc(0, 0, r * .32, 0, TAU); c.fill(); c.restore();
};
const snowflake: Shape = (c, x, y, r, col, rot) => {
  c.save(); c.translate(x, y); c.rotate(rot); c.strokeStyle = col; c.lineWidth = r * .2; c.lineCap = 'round';
  for (let i = 0; i < 3; i++) { c.rotate(Math.PI / 3); c.beginPath(); c.moveTo(-r, 0); c.lineTo(r, 0); c.stroke(); }
  c.restore();
};
/** the game's own coin (drawCoin) with its outline `r` in radius, spinning about its upright axis; the colour is the coin's own */
const coin: Shape = (c, x, y, r, _col, rot) => {
  c.save(); c.translate(x, y); c.scale(.12 + .88 * Math.abs(Math.cos(rot)), 1); drawCoin(c, r / (.21 * 1.08)); c.restore();
};
/** the outline radius of a coin on the track, in mascot units (drawCoin's .21u disc plus outline; the mascot and the coins share u) */
const COIN_R = .21 * 1.08;
const bolt: Shape = (c, x, y, r, col, rot) => {
  c.save(); c.translate(x, y); c.rotate(rot); c.fillStyle = col; c.beginPath();
  c.moveTo(r * .2, -r); c.lineTo(-r * .5, r * .1); c.lineTo(-r * .02, r * .1); c.lineTo(-r * .2, r); c.lineTo(r * .5, -r * .15); c.lineTo(r * .02, -r * .15); c.closePath(); c.fill(); c.restore();
};
const flame: Shape = (c, x, y, r, col) => {
  c.fillStyle = col; c.beginPath(); c.moveTo(x, y - r * 1.3);
  c.quadraticCurveTo(x + r * .9, y - r * .2, x + r * .55, y + r * .5); c.quadraticCurveTo(x, y + r, x - r * .55, y + r * .5);
  c.quadraticCurveTo(x - r * .9, y - r * .2, x, y - r * 1.3); c.fill();
  c.fillStyle = 'rgba(255,240,150,.85)'; c.beginPath(); c.ellipse(x, y + r * .25, r * .3, r * .45, 0, 0, TAU); c.fill();
};
const puff: Shape = (c, x, y, r, col) => { dot(c, x, y, r, col, 0); dot(c, x - r * .3, y - r * .3, r * .45, 'rgba(255,255,255,.6)', 0); };
const butterfly: Shape = (c, x, y, r, col, rot) => {
  const flap = .35 + .65 * Math.abs(Math.sin(rot * 3));
  c.save(); c.translate(x, y);
  for (const s of [-1, 1]) { c.fillStyle = col; c.beginPath(); c.ellipse(s * r * .55 * flap, -r * .2, r * .6 * flap, r * .5, s * .5, 0, TAU); c.fill(); c.beginPath(); c.ellipse(s * r * .4 * flap, r * .35, r * .4 * flap, r * .32, -s * .4, 0, TAU); c.fill(); }
  c.fillStyle = '#3a2a1a'; c.fillRect(-r * .07, -r * .55, r * .14, r * 1.1); c.restore();
};
const cross: Shape = (c, x, y, r, col) => { dot(c, x, y, r * 1.1, '#ffffff', 0); c.fillStyle = col; c.fillRect(x - r * .25, y - r * .75, r * .5, r * 1.5); c.fillRect(x - r * .75, y - r * .25, r * 1.5, r * .5); };

/* ---------- motions ---------- */
type Draw = (c: Ctx, t: number, cy: number) => void;
interface Part { back?: Draw; front?: Draw; /** lowest y it reaches, when below the usual frame */ below?: number; /** a ring at height cy (Effect.ring) */ ring?: true }
const fade = (u: number) => Math.sin(Math.PI * u);
/** each particle's colour comes from its place on the path, so the colours travel with it */
const pick = (colors: readonly string[], u: number, n: number) => colors[Math.floor(u * n + .001) % colors.length]!;

/** float up from the feet past the head, swaying side to side */
const rise = (shape: Shape, colors: readonly string[], n = 6, r = .045, spread = .42): Part => ({
  front(c, t) {
    for (let k = 0; k < n; k++) {
      const u = ((k + t) / n) % 1, x = Math.sin(u * TAU * 1.5 + k * 2.4) * spread * (k % 2 ? 1 : -1);
      c.save(); c.globalAlpha *= fade(u) * .9; shape(c, x, .05 - u * 1.3, r * (.7 + .5 * fade(u)), pick(colors, u, n), u * TAU); c.restore();
    }
  },
});
/** drift down from above the head */
const fall = (shape: Shape, colors: readonly string[], n = 6, r = .045): Part => ({
  front(c, t) {
    for (let k = 0; k < n; k++) {
      const u = ((k + t) / n) % 1, x = Math.sin(u * TAU + k * 1.9) * .5;
      c.save(); c.globalAlpha *= fade(u) * .9; shape(c, x, -1.3 + u * 1.45, r, pick(colors, u, n), u * TAU * 1.5 + k); c.restore();
    }
  },
});
/** circle the body; the half of the circle behind it is drawn behind it */
const orbit = (shape: Shape, colors: readonly string[], n = 5, r = .05, rx = .48, ry = .13, dy = 0): Part => {
  const half = (front: boolean): Draw => (c, t, cy) => {
    for (let k = 0; k < n; k++) {
      const a = (k + t) / n * TAU, sin = Math.sin(a);
      if (sin > 0 !== front) continue;
      c.save(); c.globalAlpha *= .75 + .25 * sin; shape(c, Math.cos(a) * rx, cy + dy + sin * ry, r * (.85 + .2 * sin), pick(colors, k / n, n), a); c.restore();
    }
  };
  return { back: half(false), front: half(true) };
};
/** where a trail starts: a little below the feet, so it comes out from under the mascot rather than over its legs */
const TRAIL_START = .06;
/** 0 → 1 over the first quarter of a trail: it fades in as it leaves the feet, so it never covers the legs mid-jump or mid-slide */
const emerge = (u: number) => Math.min(1, u / .25) ** 2;
/**
 * Left behind as it runs: from the feet down the screen toward the camera, fading. Nearer the camera than the mascot, so drawn
 * in front of it. `len` is how far down it goes.
 */
const trail = (shape: Shape, colors: readonly string[], n = 5, r = .05, wide = .2, len = .28, spin = 1): Part => ({
  front(c, t) {
    for (let k = 0; k < n; k++) {
      const u = ((k + t) / n) % 1, x = Math.sin(u * TAU * 2 + k) * wide * u;
      c.save(); c.globalAlpha *= emerge(u) * (1 - u) * .85; shape(c, x, TRAIL_START + u * len, r * (1 - u * .4), pick(colors, u, n), u * TAU * spin); c.restore();
    }
  },
  // the lowest point: the last particle is fading out there, at 60% of its size
  below: TRAIL_START + len + r * .6 + .02,
});
/**
 * A flower blooms under each step, alternating left and right foot, then drifts down toward the camera and fades. In front of
 * the mascot like a trail, and like a trail it starts under the feet and fades in, so the legs stay clear.
 */
const bloom = (colors: readonly string[], n = 4, r = .11, len = .3): Part => ({
  front(c, t) {
    for (let k = 0; k < n; k++) {
      const u = ((k + t) / n) % 1, side = k % 2 ? 1 : -1, open = Math.min(1, u / .2);
      c.save(); c.globalAlpha *= emerge(u) * (1 - u) ** .7;
      flower(c, side * (.12 + .06 * Math.sin(k)), TRAIL_START + .02 + u * len, r * (.3 + .7 * open), pick(colors, k / n, n), u * 1.5);
      c.restore();
    }
  },
  below: TRAIL_START + .02 + len + r + .02,
});
/** a soft glow behind the body */
const aura = (color: string, size = .62, strength = .55): Part => ({
  back(c, t, cy) {
    // a crouch or slide lowers the body: squash the glow so it never reaches past the bottom of the frame (y 0.32)
    const R = size * (1 + .04 * Math.sin(t * TAU)), ry = Math.min(R, .32 - cy), g = c.createRadialGradient(0, 0, R * .1, 0, 0, R);
    g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.save(); c.globalAlpha *= strength; c.translate(0, cy); c.scale(1, ry / R); c.fillStyle = g; c.beginPath(); c.ellipse(0, 0, R * .8, R, 0, 0, TAU); c.fill(); c.restore();
  },
});
/** flames licking up around the shoes */
const feetFire = (colors: readonly string[]): Part => ({
  front(c, t) {
    for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) {
      const u = ((k + t) / 3) % 1;
      c.save(); c.globalAlpha *= fade(u); flame(c, sx * (.1 + .04 * Math.sin(k * 2)), -.04 - u * .2, .06 * (1 - u * .5), colors[k % colors.length]!, 0); c.restore();
    }
  },
});
/**
 * Mist rolling around the legs, thick enough to hide them: a faint bank drifts behind the mascot, denser banks drift in front of it
 * at the ground and up to the waist, the two layers going opposite ways. Each bank fades in at one side and out at the other,
 * so the loop never shows. `rgb` is "r, g, b".
 */
const mist = (rgb: string, n = 4): Part => {
  const bank = (c: Ctx, x: number, y: number, rx: number, ry: number, alpha: number) => {
    const g = c.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, `rgba(${rgb}, 1)`); g.addColorStop(.6, `rgba(${rgb}, .6)`); g.addColorStop(1, `rgba(${rgb}, 0)`);
    c.save(); c.globalAlpha *= alpha; c.translate(x, y); c.scale(rx, ry); c.fillStyle = g; c.beginPath(); c.arc(0, 0, 1, 0, TAU); c.fill(); c.restore();
  };
  const drift = (t: number, k: number, count: number, dir: 1 | -1) => { const u = ((k + t) / count) % 1; return { u, x: dir * (-.38 + u * .76) }; };
  return {
    back(c, t) {
      for (let k = 0; k < n; k++) { const { u, x } = drift(t, k, n, -1); bank(c, x, -.28 + .03 * Math.sin(k * 1.7), .3, .16, fade(u) * .45); }
    },
    front(c, t) {
      for (let k = 0; k < n; k++) {
        const a = drift(t, k, n, 1), b = drift(t, k + .5, n, -1);
        bank(c, a.x, -.02 + .03 * Math.sin(k * 2.1), .34, .15, fade(a.u) * .85);          // along the ground, over the feet
        bank(c, b.x, -.24 + .03 * Math.sin(k * 1.3), .3, .15, fade(b.u) * .65);           // up to the waist
      }
      for (let k = 0; k < 3; k++) { const { u, x } = drift(t, k, 3, 1); bank(c, x, .1, .24, .06, fade(u) * .5); }   // thin wisps at the front edge
    },
  };
};
/** a pair of wings at the shoulders, flapping gently */
const wings = (fill: string, edge: string, feathers = 4): Part => ({
  back(c, t, cy) {
    const flap = .12 * Math.sin(t * TAU);
    for (const s of [-1, 1]) {
      c.save(); c.translate(s * .12, cy - .08); c.rotate(s * (-.25 + flap)); c.scale(s, 1);
      for (let i = 0; i < feathers; i++) {
        const len = .5 - i * .08, y = i * .07;
        c.fillStyle = i % 2 ? edge : fill; c.beginPath(); c.moveTo(0, y);
        c.quadraticCurveTo(len * .6, y - .22 + i * .02, len, y - .12 + i * .05); c.quadraticCurveTo(len * .6, y + .04, 0, y + .07); c.closePath(); c.fill();
      }
      c.restore();
    }
  },
});
/** a column of light standing on the mascot */
const pillar = (color: string): Part => ({
  back(c, t) {
    const g = c.createLinearGradient(-.3, 0, .3, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(.5, color); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.save(); c.globalAlpha *= .4 + .08 * Math.sin(t * TAU); c.fillStyle = g; c.fillRect(-.3, -1.35, .6, 1.4); c.restore();
  },
});
/** rainbow bands streaming back from the feet toward the camera: in front of the mascot, starting below its feet, fading in */
const rainbow: Part = {
  front(c, t) {
    const cols = ['#ff5252', '#ffab40', '#ffee58', '#69f0ae', '#40c4ff', '#b388ff'];
    cols.forEach((col, i) => {
      const base = c.globalAlpha;
      c.save(); c.strokeStyle = col; c.lineWidth = .028; c.lineCap = 'round';
      for (let k = 1; k <= 8; k++) {                                     // segment by segment, each as clear as its distance allows
        const at = (q: number) => [(i - 2.5) * .03 + Math.sin(q * TAU + t * TAU) * .04 * q, TRAIL_START + q * .26] as const;
        const [x0, y0] = at((k - 1) / 8), [x1, y1] = at(k / 8);
        c.globalAlpha = base * .7 * emerge(k / 8); c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
      }
      c.restore();
    });
  },
  below: TRAIL_START + .26 + .03,
};
/**
 * A tilted ring circling the body (both halves, so it passes in front and behind), sweeping from the top of the head down to
 * the ankles and back up once a loop. `lag` delays it (a fraction of the loop), so two rings can trail one another.
 */
const hoop = (color: string, rx = .46, ry = .12, lag = 0): Part => {
  const half = (front: boolean): Draw => (c, t, cy) => {
    const y = cy - .5 + .8 * (.5 - .5 * Math.cos((t - lag) * TAU));
    c.save(); c.strokeStyle = color; c.lineWidth = .03; c.globalAlpha *= .85; c.beginPath();
    c.ellipse(0, y, rx, ry, 0, front ? 0 : Math.PI, front ? Math.PI : TAU); c.stroke(); c.restore();
  };
  return { back: half(false), front: half(true), ring: true };
};

/** an effect from its parts; rings go in `ring`, on their own clock (see Effect.ring) */
const fx = (id: string, name: string, rarity: Rarity, ...all: Part[]): Effect => {
  const parts = all.filter(p => !p.ring), rings = all.filter(p => p.ring);
  return {
    id: 'fx-' + id, slot: 'effect', name, rarity,
    back: (c, t, cy) => { for (const p of parts) p.back?.(c, t, cy); },
    front: (c, t, cy) => { for (const p of parts) p.front?.(c, t, cy); },
    ...(parts.some(p => p.below) ? { below: Math.max(...parts.map(p => p.below ?? 0)) } : {}),
    ...(rings.length && { ring: {
      back: (c: Ctx, t: number, cy: number) => { for (const p of rings) p.back?.(c, t, cy); },
      front: (c: Ctx, t: number, cy: number) => { for (const p of rings) p.front?.(c, t, cy); },
    } }),
  };
};
/** how long a ring takes to sweep down the body and back up (Effect.ring) */
export const RING_MS = 1800;
/** where a ring is in its sweep at time `now` (ms), 0…1 */
export const ringPhase = (now: number) => (now % RING_MS) / RING_MS;

/**
 * Things raining down (or, `up`, floating up) behind the mascot in an avatar (Effect.avatar), each `[x, size, passes per loop,
 * phase]`, drifting `sway` side to side and spinning. Each passes a whole number of times per loop, so the loop never shows a
 * seam. Rising things fade in and out (`fade`) like flames.
 */
const RAIN = [
  [-.38, .065, 1, .0], [.33, .075, 2, .35], [-.24, .055, 2, .7], [.22, .06, 1, .55], [-.31, .05, 2, .15],
  [.4, .055, 1, .8], [-.42, .06, 2, .45], [.28, .05, 2, .9], [.08, .07, 1, .2], [-.08, .06, 1, .65],
] as const;
interface RainOpts { size?: number; sway?: number; up?: boolean; fade?: boolean }
const rain = (shape: Shape, colors: readonly string[], { size = 1, sway = 0, up = false, fade: fades = false }: RainOpts = {}) => (c: Ctx, t: number) => {
  RAIN.forEach(([x, r, passes, phase], k) => {
    const v = t * passes + phase, u = v % 1, rr = r * size, y = -.58 - rr + (up ? 1 - u : u) * (1.16 + 2 * rr);
    c.save(); if (fades) c.globalAlpha *= fade(u);
    shape(c, x + Math.sin(v * TAU) * sway, y, rr * (fades ? .6 + .4 * fade(u) : 1), colors[k % colors.length]!, up ? 0 : v * TAU * 2);
    c.restore();
  });
};

/** yellow at the heart of the fire, red at its edge: u 0 → 1 */
const fireAt = (u: number) => u < .33 ? '#ffd600' : u < .66 ? '#ff9100' : '#ff3d00';
/** a flicker for flame k at time t, 0.75…1 */
const flicker = (t: number, k: number) => .875 + .125 * Math.sin((t * 4 + k * .37) * TAU);

/** fire tracks: two lines of flame stream back from the shoes along the ground, as if the floor caught fire */
const fireTracks = (n = 8, len = .62): Part => ({
  front(c, t) {
    for (const side of [-1, 1]) for (let k = 0; k < n; k++) {
      const u = ((k + t) / n) % 1, y = TRAIL_START + u * len, x = side * (.1 + u * .05) + Math.sin((u * 3 + k) * TAU) * .01;
      c.save(); c.globalAlpha *= Math.min(1, u / .12) * (1 - u * .7);
      flame(c, x, y, .13 * (1 - u * .45) * flicker(t, k + side), fireAt(u), 0);
      c.restore();
    }
  },
  below: TRAIL_START + len + .1,
});

const FIRE = ['#ff6d00', '#ffab00', '#ff3d00'];
const BLOOM = ['#ffffff', '#f8bbd0', '#b3e5fc', '#fff59d'];
const PARTY = ['#ff5252', '#ffd740', '#69f0ae', '#40c4ff', '#e040fb'];
export const EFFECTS: readonly Effect[] = [
  fx('sparkle', 'ประกายวิบวับ · Sparkles', 'common', rise(sparkle, ['#ffffff', '#fff59d'], 6, .05)),
  fx('bubbles', 'ฟองสบู่ · Bubbles', 'common', rise(ring, ['#81d4fa', '#b3e5fc'], 5, .05)),
  fx('hearts', 'หัวใจ · Hearts', 'common', rise(heart, ['#ff4f81', '#ff80ab'], 5, .045)),
  fx('notes', 'ตัวโน้ต · Music notes', 'common', rise(note, ['#7c4dff', '#ffffff', '#40c4ff'], 4, .06)),
  fx('leaves', 'ใบไม้ปลิว · Leaves', 'common', fall(leaf, ['#66bb6a', '#9ccc65', '#ffb74d'], 5, .05)),
  fx('snow', 'หิมะ · Snowfall', 'common', fall(snowflake, ['#ffffff', '#e1f5fe'], 6, .045)),
  fx('confetti', 'กระดาษสี · Confetti', 'common', fall(confetti, PARTY, 8, .035)),
  { ...fx('coins', 'เหรียญทอง · Coin trail', 'common', trail(coin, ['#ffd400'], 3, COIN_R, .14, .5, 2)), avatar: rain(coin, ['#ffd400']) },
  fx('fireflies', 'หิ่งห้อย · Fireflies', 'common', orbit(glowDot, ['#f4ff81', '#ffe57f'], 6, .025, .5, .2)),
  { ...fx('petals', 'ดอกไม้บานตามรอยเท้า · Blooming steps', 'common', bloom(BLOOM)), avatar: rain(flower, BLOOM, { size: 1.5, sway: .05 }) },   // id kept from 'Petals'
  fx('stars', 'ดาวหมุน · Star ring', 'common', orbit(star, ['#ffd400'], 5, .05)),
  fx('clouds', 'ปุยเมฆ · Cloud steps', 'common', trail(puff, ['#ffffff', '#eceff1'], 4, .07, .1)),
  // flames on the shoes and two tracks of flame left burning on the ground behind (toward the camera)
  { ...fx('flamefeet', 'เท้าไฟ · Fire feet', 'rare', feetFire(FIRE), fireTracks(5)), avatar: rain(flame, FIRE, { size: 1.3, sway: .04, up: true, fade: true }) },
  fx('lightning', 'สายฟ้า · Lightning', 'rare', orbit(bolt, ['#ffea00', '#ffffff'], 4, .07, .46, .16)),
  fx('frost', 'เกล็ดน้ำแข็ง · Frost', 'rare', aura('#b3e5fc', .6, .45), orbit(snowflake, ['#e1f5fe', '#81d4fa'], 5, .05)),
  fx('rainbow', 'สายรุ้ง · Rainbow trail', 'rare', rainbow),
  fx('smoke', 'หมอกนินจา · Ninja mist', 'rare', mist('214, 220, 228')),       // id kept from 'Ninja smoke' so players who own it keep it
  fx('pixels', 'พิกเซล · Pixels', 'rare', rise(square, ['#00e676', '#00b0ff', '#ff4081', '#ffea00'], 8, .03, .45)),
  fx('hoop', 'วงแหวนพลัง · Power ring', 'rare', hoop('#40c4ff'), hoop('#b388ff', .38, .1, .06)),
  fx('butterflies', 'ผีเสื้อ · Butterflies', 'rare', orbit(butterfly, ['#ff80ab', '#80d8ff', '#ffd180'], 3, .07, .5, .22, -.1)),
  fx('toxic', 'ฟองพิษ · Toxic bubbles', 'rare', aura('#76ff03', .55, .35), rise(ring, ['#76ff03', '#c6ff00'], 6, .04)),
  fx('goldaura', 'ออร่าทองคำ · Golden aura', 'epic', aura('#ffd54f', .7, .7), rise(sparkle, ['#fff59d', '#ffffff'], 5, .045)),
  fx('shadow', 'ออร่าเงามืด · Shadow aura', 'epic', aura('#4a148c', .7, .75), rise(puff, ['#311b92', '#4a148c', '#1a1a2e'], 6, .06, .35)),
  fx('electric', 'ไฟฟ้าแรงสูง · High voltage', 'epic', aura('#18ffff', .62, .5), orbit(bolt, ['#18ffff', '#ffffff'], 6, .06, .44, .18)),
  fx('galaxy', 'กาแล็กซี · Galaxy', 'epic', aura('#7c4dff', .7, .55), orbit(star, ['#ffffff', '#e1bee7'], 6, .035, .5, .14), orbit(dot, ['#80d8ff', '#ff80ab'], 4, .018, .36, .2, -.15)),
  fx('comet', 'ดาวหาง · Comet tail', 'epic', trail(glowDot, ['#ffd740', '#ff6e40', '#ffab40'], 7, .05, .06), feetFire(['#ff6e40', '#ffd740'])),
  fx('angel', 'ปีกนางฟ้า · Angel wings', 'epic', wings('#ffffff', '#e3f2fd'), rise(sparkle, ['#ffffff'], 4, .04)),
  fx('phoenix', 'ปีกฟีนิกซ์ · Phoenix wings', 'legendary', aura('#ff6d00', .7, .5), wings('#ff6d00', '#ffd600', 5), feetFire(['#ff3d00', '#ffab00', '#ffd600'])),
  fx('holy', 'แสงศักดิ์สิทธิ์ · Holy light', 'legendary', pillar('rgba(255,245,180,.95)'), aura('#fff59d', .6, .5), rise(sparkle, ['#ffffff', '#fff176'], 7, .05, .3)),
  fx('safetyhero', 'ฮีโร่ความปลอดภัย · Safety hero', 'legendary', aura('#00e676', .7, .5), orbit(cross, ['#2e9e47'], 4, .06, .5, .16), rise(star, ['#ffd400', '#ffffff'], 5, .04)),
];
