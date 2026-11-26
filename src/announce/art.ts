/**
 * Art for the announcement deck: the prize pictures and Thailand's outline. The prizes are the real products (photos with the
 * background removed, in ./prizes); what the super fans win is not settled, so a flat gift box in the deck's three colours stands
 * in. Every drawn colour is one of the three (blush pink, golden butter, deep burgundy).
 */
import cardUrl from './prizes/card.png';
import umbrellaUrl from './prizes/umbrella.png';
import watchUrl from './prizes/watch.png';

export const PINK = '#F2B6C6', BUTTER = '#F2D86A', BURGUNDY = '#7A1F35';

/** Rank → which prize. 1st the smartwatch, 2nd to 5th a fuel card, 6th and 7th an umbrella (README: Prizes). A gift box is for the super fans. */
export type PrizeKind = 'watch' | 'fuel' | 'umbrella' | 'gift';
export const prizeKind = (rank: number): PrizeKind => rank === 1 ? 'watch' : rank <= 5 ? 'fuel' : 'umbrella';

/** a product photo in a pink-ringed disc; the wide card gets more of the width */
const photo = (url: string, wide = false) => `<div class="disc"></div><div class="photo p-float${wide ? ' wide' : ''}"><img src="${url}" alt=""></div>`;

/** a gift box: lid, ribbon and bow, for a prize that is not decided yet */
const GIFT = `<svg viewBox="0 0 600 600" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="true">
  <g class="p-float">
    <rect x="132" y="290" width="336" height="246" rx="14" fill="${BURGUNDY}"/>
    <rect x="104" y="226" width="392" height="86" rx="14" fill="${BURGUNDY}" stroke="${BUTTER}" stroke-width="6"/>
    <rect x="268" y="226" width="64" height="310" fill="${PINK}"/>
    <path d="M300 226C216 120 140 150 184 214c26 34 84 18 116 12z" fill="${PINK}" stroke="${BURGUNDY}" stroke-width="6" stroke-linejoin="round"/>
    <path d="M300 226c84-106 160-76 116-12-26 34-84 18-116 12z" fill="${PINK}" stroke="${BURGUNDY}" stroke-width="6" stroke-linejoin="round"/>
    <circle cx="300" cy="224" r="28" fill="${BUTTER}" stroke="${BURGUNDY}" stroke-width="6"/>
    <g fill="${BURGUNDY}"><path d="M96 120l10 26 26 10-26 10-10 26-10-26-26-10 26-10z"/><path d="M510 96l8 20 20 8-20 8-8 20-8-20-20-8 20-8z"/><path d="M528 384l7 17 17 7-17 7-7 17-7-17-17-7 17-7z"/></g>
  </g>
</svg>`;

export const PRIZE_ART: Record<PrizeKind, string> = {
  watch: photo(watchUrl), fuel: photo(cardUrl, true), umbrella: photo(umbrellaUrl), gift: GIFT,
};

/* ---------- Thailand ---------- */

/**
 * Thailand's border and coast, [lon, lat], clockwise from Mae Sai. Simplified for a poster: it only has to read as Thailand. The narrow
 * strip of the south (Prachuap to Chumphon) is drawn about twice as wide as it is, so the route has room to run down the middle of it.
 */
const OUTLINE: [number, number][] = [
  [99.88, 20.43], [100.09, 20.35], [100.20, 20.30], [100.42, 20.25], [100.55, 19.95], [100.50, 19.60], [100.85, 19.50],
  [101.10, 19.55], [101.25, 19.35], [101.10, 19.05], [101.15, 18.55], [101.05, 18.10], [101.15, 17.85], [101.45, 17.80],
  [101.75, 17.95], [102.10, 18.20], [102.55, 17.95], [102.95, 18.05], [103.35, 18.40], [103.85, 18.30], [104.15, 17.95],
  [104.45, 17.65], [104.78, 17.35], [104.85, 17.00], [104.70, 16.60], [105.05, 16.10], [105.30, 15.75], [105.50, 15.25],
  [105.60, 14.60], [105.10, 14.35], [104.50, 14.40], [103.85, 14.35], [103.30, 14.35], [102.80, 14.20], [102.55, 14.10],
  [102.45, 13.60], [102.35, 13.20], [102.30, 12.70], [102.60, 12.15], [102.80, 11.85], [102.92, 11.65],
  [102.60, 12.05], [102.20, 12.30], [101.90, 12.55], [101.40, 12.65], [101.00, 12.75], [100.95, 13.05], [100.60, 13.10],
  [100.40, 13.05], [100.20, 13.00], [100.00, 12.95], [100.05, 12.75], [100.00, 12.60], [99.95, 12.20], [99.85, 11.80],
  [99.70, 11.30], [99.55, 10.80], [99.40, 10.30], [99.30, 9.75], [99.40, 9.25], [99.60, 8.95], [99.95, 8.70],
  [100.10, 8.30], [100.30, 7.95], [100.60, 7.40], [100.65, 7.15], [100.85, 7.00], [101.15, 6.95], [101.40, 6.85],
  [101.70, 6.75], [101.95, 6.55], [102.10, 6.25], [101.80, 6.15], [101.75, 5.95], [101.40, 5.70], [101.00, 5.62],
  [100.60, 5.80], [100.45, 6.25], [100.30, 6.40], [100.10, 6.45], [99.95, 6.45], [99.75, 6.60], [99.55, 6.85],
  [99.45, 7.15], [99.50, 7.45], [99.25, 7.70], [99.10, 8.10], [98.85, 8.20], [98.55, 8.15], [98.30, 8.20], [98.25, 8.60],
  [98.40, 9.10], [98.45, 9.60], [98.45, 10.00], [98.55, 10.45], [98.65, 10.90], [98.70, 11.40], [98.90, 11.75],
  [99.05, 12.20], [98.95, 12.55], [99.00, 13.05], [98.85, 13.50], [98.55, 14.00], [98.20, 14.60], [98.15, 15.10],
  [98.50, 15.25], [98.60, 15.80], [98.45, 16.40], [98.60, 16.90], [98.25, 17.35], [97.95, 17.75], [97.75, 18.25],
  [97.45, 18.55], [97.35, 19.00], [97.65, 19.40], [97.85, 19.80], [98.10, 19.85], [98.35, 19.65], [98.80, 19.85],
  [99.05, 20.10], [99.45, 20.15],
];

/** the run, south to north, through cities on the way: [name, lon, lat]. The road does not follow these exactly; see routeX. */
export const ROUTE_STOPS: [string, number, number][] = [
  ['เบตง', 101.07, 5.77], ['หาดใหญ่', 100.47, 7.0], ['สุราษฎร์ธานี', 99.2, 9.0], ['ชุมพร', 99.1, 10.4], ['ประจวบฯ', 99.55, 11.8],
  ['กรุงเทพฯ', 100.5, 13.75], ['นครสวรรค์', 100.12, 15.7], ['พิษณุโลก', 100.26, 16.8], ['ลำปาง', 99.5, 18.3],
  ['เชียงราย', 99.83, 19.9], ['แม่สาย', 99.88, 20.43],
];

export const MAP_W = 620, MAP_H = 1000;
const LON0 = 97.35, LON1 = 105.6, LAT0 = 5.62, LAT1 = 20.43, COS = Math.cos(13 * Math.PI / 180);
const K = Math.min((MAP_W - 60) / ((LON1 - LON0) * COS), (MAP_H - 60) / (LAT1 - LAT0));
/** lon/lat → map pixels */
export const project = (lon: number, lat: number): [number, number] => [30 + (lon - LON0) * COS * K, 30 + (LAT1 - lat) * K];

/** Chaikin corner cutting, so the polygon's straight edges become a soft coastline */
function smooth(pts: [number, number][], rounds: number, closed: boolean): [number, number][] {
  let p = pts;
  for (let r = 0; r < rounds; r++) {
    const out: [number, number][] = [];
    const n = p.length, last = closed ? n : n - 1;
    if (!closed) out.push(p[0]!);
    for (let i = 0; i < last; i++) {
      const a = p[i]!, b = p[(i + 1) % n]!;
      out.push([a[0] * .75 + b[0] * .25, a[1] * .75 + b[1] * .25], [a[0] * .25 + b[0] * .75, a[1] * .25 + b[1] * .75]);
    }
    if (!closed) out.push(p[n - 1]!);
    p = out;
  }
  return p;
}
const d = (pts: [number, number][], close: boolean) => 'M' + pts.map(([x, y]) => x.toFixed(1) + ' ' + y.toFixed(1)).join('L') + (close ? 'Z' : '');

const OUTLINE_PX = OUTLINE.map(([lo, la]) => project(lo, la));
/** the coast as it is drawn (softened), for checking the route against */
export const OUTLINE_SOFT = smooth(OUTLINE_PX, 2, true);
export const THAILAND_PATH = d(OUTLINE_SOFT, true);

/*
 * The route. A solid line that touches the coast disappears into the butter behind the map, so the line stays well inside the shape:
 * it follows the cities' longitudes as far as it can, and where the land is narrow it is pushed to the middle. The two ends sit a
 * little inside the real tips (Betong and Mae Sai are on the very edge of the map).
 */
/** px kept between the route and the coast, before the coast is softened; the test asks for ROUTE_CLEARANCE after */
const ROUTE_MARGIN = 30;
export const ROUTE_CLEARANCE = 22;
const START_LAT = 6.2, END_LAT = 19.9, LAT_STEP = 0.2;

/** the x ranges (px) that are land along the row `y` of the map, from the softened outline (even-odd) */
function landAt(y: number): [number, number][] {
  const xs: number[] = [];
  for (let i = 0; i < OUTLINE_SOFT.length; i++) {
    const a = OUTLINE_SOFT[i]!, b = OUTLINE_SOFT[(i + 1) % OUTLINE_SOFT.length]!;
    if ((a[1] <= y) !== (b[1] <= y)) xs.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
  }
  xs.sort((m, n) => m - n);
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < xs.length; i += 2) out.push([xs[i]!, xs[i + 1]!]);
  return out;
}

/** longitude the cities suggest at a latitude (straight between neighbouring stops) */
function suggestedLon(lat: number): number {
  for (let i = 1; i < ROUTE_STOPS.length; i++) {
    const [, lo0, la0] = ROUTE_STOPS[i - 1]!, [, lo1, la1] = ROUTE_STOPS[i]!;
    if (lat <= la1) return lo0 + (lo1 - lo0) * Math.max(0, Math.min(1, (lat - la0) / (la1 - la0)));
  }
  return ROUTE_STOPS[ROUTE_STOPS.length - 1]![1];
}

/** distance from a point to the coast as drawn */
function toCoast(x: number, y: number): number {
  let best = Infinity;
  for (let i = 0; i < OUTLINE_SOFT.length; i++) {
    const a = OUTLINE_SOFT[i]!, b = OUTLINE_SOFT[(i + 1) % OUTLINE_SOFT.length]!;
    const dx = b[0] - a[0], dy = b[1] - a[1], len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / len2)) : 0;
    best = Math.min(best, Math.hypot(x - (a[0] + t * dx), y - (a[1] + t * dy)));
  }
  return best;
}

/** the x positions (px) in the row `y` that are at least ROUTE_MARGIN from the coast, as one corridor [lo, hi], the one nearest `want`; null if no x is */
function corridor(y: number, want: number): [number, number] | null {
  const spans = landAt(y);
  const span = spans.find(([a, b]) => want >= a && want <= b) ?? spans.reduce((best, sp) => Math.min(Math.abs(sp[0] - want), Math.abs(sp[1] - want)) < Math.min(Math.abs(best[0] - want), Math.abs(best[1] - want)) ? sp : best, spans[0]!);
  const runs: [number, number][] = [];
  let from: number | null = null, prev = 0;
  for (let x = Math.ceil(span[0]); x <= span[1]; x += 2) {
    if (toCoast(x, y) >= ROUTE_MARGIN) { from ??= x; prev = x; } else if (from !== null) { runs.push([from, prev]); from = null; }
  }
  if (from !== null) runs.push([from, prev]);
  if (!runs.length) return null;
  const gap = (r: [number, number]) => want < r[0] ? r[0] - want : want > r[1] ? want - r[1] : 0;
  return runs.reduce((best, r) => gap(r) < gap(best) ? r : best, runs[0]!);
}

/** the x (px) of the point in the row that is farthest from the coast: for rows where the land is too narrow for any corridor */
function farthest(y: number): number {
  let best = 0, bestD = -1;
  for (const [a, b] of landAt(y)) for (let x = Math.ceil(a); x <= b; x += 2) { const dist = toCoast(x, y); if (dist > bestD) { bestD = dist; best = x; } }
  return best;
}

const clampLat = (lat: number) => Math.max(START_LAT, Math.min(END_LAT, lat));
const ROUTE_LATS: number[] = [];
for (let lat = START_LAT; lat < END_LAT + LAT_STEP / 2; lat += LAT_STEP) ROUTE_LATS.push(Math.min(lat, END_LAT));
/*
 * One x per row: the cities' longitude pulled into the row's corridor, then relaxed so the line runs smoothly (each x moves toward the
 * average of its neighbours, but never out of its corridor).
 */
const ROUTE_XS = (() => {
  const rows = ROUTE_LATS.map(lat => {
    const [sx, y] = project(suggestedLon(lat), lat);
    const c = corridor(y, sx);
    return c ? { lo: c[0], hi: c[1], x: Math.max(c[0], Math.min(c[1], sx)) } : (x => ({ lo: x, hi: x, x }))(farthest(y));
  });
  for (let it = 0; it < 80; it++) {
    for (let i = 1; i < rows.length - 1; i++) {
      const r = rows[i]!;
      r.x = Math.max(r.lo, Math.min(r.hi, (rows[i - 1]!.x + 2 * r.x + rows[i + 1]!.x) / 4));
    }
  }
  return rows.map(r => r.x);
})();

/** where the route runs at a latitude (between the rows it was worked out for) */
export function routeAt(lat: number): [number, number] {
  const l = clampLat(lat), i = Math.min(ROUTE_LATS.length - 2, Math.max(0, Math.floor((l - START_LAT) / LAT_STEP)));
  const t = (l - ROUTE_LATS[i]!) / (ROUTE_LATS[i + 1]! - ROUTE_LATS[i]!);
  return [ROUTE_XS[i]! * (1 - t) + ROUTE_XS[i + 1]! * t, project(0, l)[1]];
}

const ROUTE_RAW: [number, number][] = ROUTE_LATS.map((lat, i) => [ROUTE_XS[i]!, project(0, lat)[1]]);
/** the route as drawn, softened */
export const ROUTE_SOFT = smooth(ROUTE_RAW, 3, false);
export const ROUTE_PATH = d(ROUTE_SOFT, false);
/** each named stop, on the route */
export const ROUTE_POINTS = ROUTE_STOPS.map(([, , la]) => routeAt(la));
