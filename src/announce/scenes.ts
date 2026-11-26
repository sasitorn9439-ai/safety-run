/** The fun-fact slides before the awards: each one a Scene (see deck.ts) with its own graphic and a count-up that plays on entry. */
import { avatarArt } from '../lib/avatar.js';
import { MOON_KM, EARTH_KM, THAILAND_KM, dayHours, n0, n1, nSmart, type Facts } from './calc.js';
import type { Scene } from './deck.js';
import { MAP_H, MAP_W, ROUTE_PATH, ROUTE_POINTS, ROUTE_STOPS, THAILAND_PATH } from './art.js';
import { Run, easeInOut, easeOut, fit, reduced } from './fx.js';
import { SPIN_TO_BANGKOK, drawGlobe } from './globe.js';

const $ = <T extends HTMLElement | SVGElement = HTMLElement>(id: string) => document.getElementById(id) as unknown as T;
const SVGNS = 'http://www.w3.org/2000/svg';
const svgEl = (tag: string, attrs: Record<string, string | number> = {}) => {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
};

/** a scene made from a slide plus what it does while it is up: `play` gets a Run that is stopped when the slide goes away */
function scene(el: HTMLElement, play?: (run: Run, instant: boolean) => void, extra: Partial<Scene> = {}): Scene {
  let run: Run | null = null;
  return {
    el, steps: 0,
    enter(instant) { run?.stop(); run = new Run(); if (play) { play(run, instant); } },
    step() {},
    leave() { run?.stop(); run = null; },
    ...extra,
  };
}

/** laps → what the big number shows: below one lap it is a percentage of the way round */
export const lapsShown = (v: number, total: number) => total < 1 ? { n: String(Math.round(v * 100)), unit: '%' } : { n: nSmart(v), unit: 'รอบ' };

/* ---------- 1 · cover ---------- */
export function coverScene(): Scene {
  const dot = document.getElementById('coverDot') as unknown as SVGGElement;
  // the runner follows the third lane: a stadium, two straights and two half circles
  const X = 140, Y = 260, W = 420, H = 180, r = H / 2, straight = W - 2 * r, L = 2 * straight + 2 * Math.PI * r;
  const at = (s: number): [number, number] => {
    s = ((s % L) + L) % L;
    if (s < straight) return [X + r + s, Y];
    s -= straight;
    if (s < Math.PI * r) { const a = -Math.PI / 2 + s / r; return [X + W - r + Math.cos(a) * r, Y + r + Math.sin(a) * r]; }
    s -= Math.PI * r;
    if (s < straight) return [X + W - r - s, Y + H];
    s -= straight;
    const a = Math.PI / 2 + s / r;
    return [X + r + Math.cos(a) * r, Y + r + Math.sin(a) * r];
  };
  return scene($('s-cover'), (run) => {
    const t0 = performance.now();
    const frame = () => {
      if (run.stopped) return;
      const [x, y] = at((performance.now() - t0) * .35);
      dot.setAttribute('transform', `translate(${x} ${y})`);
      requestAnimationFrame(frame);
    };
    frame();
  });
}

/* ---------- 2 · total distance ---------- */
export function distScene(f: Facts, runners: { avatar: number | null }[]): Scene {
  const el = $('s-dist'), n = $('distN');
  $('fPlayers').textContent = n0(f.players); $('fPlays').textContent = n0(f.plays);
  $('fAvg').textContent = f.players ? n1(f.km / f.players) : '0';
  // the real avatars run along the track
  const track = $('track'), pick = runners.slice(0, 9);
  pick.forEach((r, i) => {
    const img = document.createElement('img');
    img.className = 'runner ' + (i % 2 ? 'dn' : 'up');
    img.src = avatarArt(r.avatar, 240).url;
    img.alt = '';
    img.style.setProperty('--s', 7 + (i * 7) % 5 + 's');
    img.style.setProperty('--d', -(i * 1.3) + 's');
    track.appendChild(img);
  });
  const final = n0(f.km);
  return scene(el, (run, instant) => {
    const set = (v: number) => { n.textContent = n0(v); fit(n, 1500, 420); };
    set(0);
    void (async () => {
      await run.wait(instant ? 0 : 700);
      await run.tween(instant ? 0 : 2600, t => set(f.km * t), easeOut);
      n.textContent = final; fit(n, 1500, 420);
    })();
  });
}

/* ---------- 3 · Thailand, Betong → Mae Sai ---------- */
export function thaiScene(f: Facts): Scene {
  const shape = $<SVGPathElement>('thaiShape'), base = $<SVGPathElement>('routeBase'), trail = $<SVGPathElement>('routeTrail');
  const runner = $<SVGGElement>('thaiRunner'), stops = $<SVGGElement>('thaiStops');
  shape.setAttribute('d', THAILAND_PATH); base.setAttribute('d', ROUTE_PATH); trail.setAttribute('d', ROUTE_PATH);
  $('thaiKm').textContent = n0(THAILAND_KM);
  // a few named stops, each as a dot with a small tag
  const NAMED = new Set(['เบตง', 'กรุงเทพฯ', 'พิษณุโลก', 'แม่สาย', 'สุราษฎร์ธานี']);
  ROUTE_STOPS.forEach(([name], i) => {
    const [x, y] = ROUTE_POINTS[i]!;
    stops.appendChild(svgEl('circle', { cx: x, cy: y, r: 9, class: 'stop-dot' }));
    if (!NAMED.has(name)) return;
    const g = svgEl('g', { class: 'stop-tag', transform: `translate(${x + 24} ${y - 14})` });
    const w = name.length * 15 + 26;
    g.append(svgEl('rect', { width: w, height: 38, rx: 19 }), Object.assign(svgEl('text', { x: 13, y: 27 }), { textContent: name }));
    stops.appendChild(g);
  });
  void MAP_W; void MAP_H;
  const n = $('thaiN'), u = n.nextElementSibling as HTMLElement, sub = $('thaiSub');
  const laps = f.thaiLaps;
  sub.textContent = laps >= 1
    ? `ครบ ${Math.floor(laps)} รอบเต็ม แล้วยังเหลืออีก ${n0((laps - Math.floor(laps)) * THAILAND_KM)} กม.`
    : `ยังไม่ครบรอบ ต้องวิ่งอีก ${n0(THAILAND_KM - f.km)} กม. ถึงจะถึงแม่สาย`;
  return scene($('s-thai'), (run, instant) => {
    const L = base.getTotalLength();
    trail.style.strokeDasharray = `${L}`;
    const draw = (p: number) => {
      const frac = p >= 1 && p === Math.floor(p) ? 1 : p - Math.floor(p);
      trail.style.strokeDashoffset = String(L * (1 - frac));
      const pt = base.getPointAtLength(L * frac);
      runner.setAttribute('transform', `translate(${pt.x} ${pt.y})`);
      const s = lapsShown(p, laps); n.textContent = s.n; u.textContent = s.unit;
      fit(n, 780, 330);
    };
    draw(0);
    void (async () => {
      await run.wait(instant ? 0 : 900);
      // the first lap takes its time so the route can be followed; later laps whip round
      const ms = laps <= 1 ? 3600 * Math.max(.5, laps) : Math.min(9000, 3600 + (laps - 1) * 520);
      await run.tween(instant ? 0 : ms, t => draw(laps * t), easeInOut);
    })();
  });
}

/* ---------- 4 · round the world ---------- */
export function globeScene(f: Facts): Scene {
  const cv = $<HTMLCanvasElement>('globe'), n = $('earthN'), u = $('earthU'), sub = $('earthSub'), head = $('globeHead');
  const laps = f.earthLaps;
  if (laps < 1) {
    head.innerHTML = 'ยังไม่ครบรอบ <em>โลก</em> แต่ไปได้';
    sub.textContent = `ของเส้นรอบวงโลก เหลืออีก ${n0(EARTH_KM - f.km)} กม. ถึงจะครบรอบ`;
  } else {
    head.innerHTML = 'วิ่งรอบ <em>โลก</em> ได้';
    sub.textContent = `ครบ ${Math.floor(laps)} รอบเต็ม แล้วยังเหลืออีก ${n0((laps - Math.floor(laps)) * EARTH_KM)} กม.`;
  }
  return scene($('s-globe'), (run, instant) => {
    let p = 0;
    const t0 = performance.now();
    const spin0 = SPIN_TO_BANGKOK - .9;
    const frame = () => {
      if (run.stopped) return;
      const t = (performance.now() - t0) / 1000;
      drawGlobe(cv, spin0 + (reduced() ? 0 : t * .32), p);
      requestAnimationFrame(frame);
    };
    const show = (v: number) => { p = v; const s = lapsShown(v, laps); n.textContent = s.n; u.textContent = s.unit; fit(n, 780, 330); };
    show(0); frame();
    void (async () => {
      await run.wait(instant ? 0 : 1100);
      const ms = laps <= 1 ? 4200 * Math.max(.5, laps) : Math.min(10000, 4200 + (laps - 1) * 700);
      await run.tween(instant ? 0 : ms, t => show(laps * t), easeInOut);
    })();
  });
}

/* ---------- 5 · the Moon (only when the total gets there) ---------- */
export function moonScene(f: Facts): Scene {
  const n = $('moonN'), dot = $<SVGGElement>('moonRunner');
  const trips = f.moonTrips;
  return scene($('s-moon'), (run, instant) => {
    const draw = (v: number) => {
      const frac = v >= 1 && v === Math.floor(v) ? 1 : v - Math.floor(v);
      dot.setAttribute('transform', `translate(${260 + 590 * frac} 200)`);
      n.textContent = nSmart(v); fit(n, 780, 330);
    };
    draw(0);
    void (async () => { await run.wait(instant ? 0 : 900); await run.tween(instant ? 0 : Math.min(8000, 3600 + trips * 600), t => draw(trips * t), easeInOut); })();
  });
}

/* ---------- 6 · time played ---------- */
export function timeScene(f: Facts): Scene {
  const clock = $<SVGElement>('clock'), hoursN = $('hoursN'), daysN = $('daysN'), sub = $('daysSub');
  const { d, h } = dayHours(f.secs);
  sub.textContent = `(${n0(d)} วัน ${h} ชั่วโมง · เล่นแล้ว ${n0(f.plays)} ครั้ง)`;
  // a 24-hour dial: the hand goes round once per day, and the pink wedge fills behind it
  const C = 400, R = 360;
  clock.innerHTML = '';
  clock.append(svgEl('circle', { cx: C, cy: C, r: R + 24, fill: '#7A1F35' }));
  const wedge = svgEl('path', { fill: '#F2B6C6', opacity: .9 });
  clock.append(wedge);
  clock.append(svgEl('circle', { cx: C, cy: C, r: R - 70, fill: '#7A1F35' }));
  for (let i = 0; i < 48; i++) {
    const a = i * Math.PI / 24, major = i % 2 === 0, r1 = R + 8, r2 = R - (major ? 22 : 10);
    clock.append(svgEl('line', { x1: C + Math.sin(a) * r1, y1: C - Math.cos(a) * r1, x2: C + Math.sin(a) * r2, y2: C - Math.cos(a) * r2, stroke: '#F2D86A', 'stroke-width': major ? 4 : 2, 'stroke-linecap': 'round' }));
  }
  for (const [i, label] of [[0, '24'], [6, '6'], [12, '12'], [18, '18']] as const) {
    const a = i * Math.PI / 12, r = R - 108;
    const t = svgEl('text', { x: C + Math.sin(a) * r, y: C - Math.cos(a) * r + 24, 'text-anchor': 'middle', 'font-size': 72, fill: '#F2D86A', style: "font-family:'Instrument Serif',serif;font-style:italic" });
    t.textContent = label; clock.append(t);
  }
  const hand = svgEl('g');
  hand.append(svgEl('line', { x1: C, y1: C + 36, x2: C, y2: C - R + 34, stroke: '#F2D86A', 'stroke-width': 12, 'stroke-linecap': 'round' }), svgEl('circle', { cx: C, cy: C - R + 34, r: 18, fill: '#F2D86A', stroke: '#7A1F35', 'stroke-width': 6 }));
  clock.append(hand, svgEl('circle', { cx: C, cy: C, r: 26, fill: '#F2D86A', stroke: '#7A1F35', 'stroke-width': 8 }));
  const dayTxt = svgEl('text', { x: C, y: C + 120, 'text-anchor': 'middle', 'font-size': 34, fill: '#F2D86A', style: "font-family:'JetBrains Mono','Kanit',monospace;letter-spacing:.12em" });
  clock.append(dayTxt);
  const arc = (frac: number) => {
    const a = frac * Math.PI * 2, r = R - 2;
    if (frac <= 0) return '';
    if (frac >= .9999) return `M${C} ${C - r}A${r} ${r} 0 1 1 ${C} ${C + r}A${r} ${r} 0 1 1 ${C} ${C - r}Z`;
    return `M${C} ${C}L${C} ${C - r}A${r} ${r} 0 ${frac > .5 ? 1 : 0} 1 ${C + Math.sin(a) * r} ${C - Math.cos(a) * r}Z`;
  };
  const daysLabel = n1(f.days), hoursLabel = n0(f.hours);
  return scene($('s-time'), (run, instant) => {
    const draw = (p: number) => {
      const frac = p - Math.floor(p);
      wedge.setAttribute('d', arc(p >= f.days && f.days === Math.floor(f.days) && f.days > 0 ? 1 : frac));
      hand.setAttribute('transform', `rotate(${frac * 360} ${C} ${C})`);
      dayTxt.textContent = `DAY ${Math.floor(p) + (p >= f.days ? 0 : 1)}`;
      hoursN.textContent = n0(f.hours * (f.days ? p / f.days : 1)); fit(hoursN, 800, 420);
      daysN.textContent = nSmart(p);
    };
    draw(0);
    void (async () => {
      await run.wait(instant ? 0 : 900);
      await run.tween(instant ? 0 : Math.min(9000, 3200 + f.days * 450), t => draw(f.days * t), easeInOut);
      hoursN.textContent = hoursLabel; fit(hoursN, 800, 420); daysN.textContent = daysLabel;
    })();
  });
}

/* ---------- 7 · interlude ---------- */
export function introScene(f: Facts): Scene {
  $('introPlayers').textContent = n0(f.players);
  return scene($('s-intro'));
}

void [MOON_KM];
export { easeOut };
