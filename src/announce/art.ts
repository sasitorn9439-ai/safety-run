/**
 * Flat tri-tone illustrations for the announcement deck: the three prizes and Thailand's outline. Every colour is one of the
 * deck's three (blush pink, golden butter, deep burgundy), so they sit in the Editorial Tri-Tone system without a fourth hue.
 */
export const PINK = '#F2B6C6', BUTTER = '#F2D86A', BURGUNDY = '#7A1F35';

/** Rank → which prize. 1st the smartwatch, 2nd to 5th a fuel card, 6th and 7th an umbrella (README: Prizes). */
export type PrizeKind = 'watch' | 'fuel' | 'umbrella';
export const prizeKind = (rank: number): PrizeKind => rank === 1 ? 'watch' : rank <= 5 ? 'fuel' : 'umbrella';

const svg = (inner: string) => `<svg viewBox="0 0 600 600" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="true">${inner}</svg>`;

/** HUAWEI Band 11: a slim band, the case between two straps, a pink screen showing the time and three activity rings */
const WATCH = svg(`
  <g class="p-float">
    <path d="M236 30h128l14 168H222z" fill="${BURGUNDY}"/>
    <path d="M222 402h156l-14 168H236z" fill="${BURGUNDY}"/>
    <g fill="${BUTTER}"><circle cx="300" cy="462" r="9"/><circle cx="300" cy="496" r="9"/><circle cx="300" cy="530" r="9"/></g>
    <rect x="262" y="58" width="76" height="14" rx="7" fill="${PINK}"/>
    <rect x="176" y="166" width="248" height="268" rx="78" fill="${BURGUNDY}"/>
    <rect x="176" y="166" width="248" height="268" rx="78" fill="none" stroke="${BUTTER}" stroke-width="5"/>
    <rect x="198" y="188" width="204" height="224" rx="58" fill="${PINK}"/>
    <rect x="424" y="262" width="16" height="56" rx="8" fill="${PINK}"/>
    <rect x="424" y="334" width="16" height="30" rx="8" fill="${BUTTER}"/>
    <text x="300" y="290" text-anchor="middle" font-family="Bricolage Grotesque, sans-serif" font-weight="700" font-size="76" letter-spacing="-3" fill="${BURGUNDY}">10:09</text>
    <g fill="none" stroke-linecap="round" stroke-width="12">
      <circle cx="248" cy="352" r="22" stroke="${BURGUNDY}" opacity=".18"/><path d="M248 330a22 22 0 1 1-22 22" stroke="${BURGUNDY}"/>
      <circle cx="300" cy="352" r="22" stroke="${BURGUNDY}" opacity=".18"/><path d="M300 330a22 22 0 0 1 20 31" stroke="${BURGUNDY}"/>
      <circle cx="352" cy="352" r="22" stroke="${BURGUNDY}" opacity=".18"/><path d="M352 330a22 22 0 1 1-18 36" stroke="${BURGUNDY}"/>
    </g>
  </g>`);

/** a fuel card (the 500 baht top-up card): two cards fanned, the front one with a pump, a chip and the amount */
const FUEL = svg(`
  <g class="p-float">
    <g transform="rotate(10 300 300)"><rect x="96" y="150" width="408" height="258" rx="34" fill="${PINK}" stroke="${BURGUNDY}" stroke-width="8"/>
      <rect x="96" y="208" width="408" height="46" fill="${BURGUNDY}" opacity=".9"/></g>
    <g transform="rotate(-9 300 330)">
      <rect x="84" y="190" width="432" height="278" rx="36" fill="${BURGUNDY}"/>
      <rect x="116" y="228" width="68" height="52" rx="12" fill="${BUTTER}"/>
      <path d="M116 254h68M150 228v52" stroke="${BURGUNDY}" stroke-width="4" fill="none"/>
      <g transform="translate(396 222)" fill="none" stroke="${PINK}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round">
        <rect x="0" y="0" width="52" height="78" rx="8"/><path d="M12 22h28"/><path d="M52 18l16 14v34a8 8 0 0 0 16 0V34l-16-18"/>
      </g>
      <text x="116" y="396" font-family="Bricolage Grotesque, sans-serif" font-weight="700" font-size="104" letter-spacing="-4" fill="${BUTTER}">500</text>
      <text x="340" y="396" font-family="Instrument Serif, serif" font-style="italic" font-size="72" fill="${PINK}">baht</text>
      <rect x="116" y="424" width="268" height="10" rx="5" fill="${PINK}" opacity=".5"/>
    </g>
  </g>`);

/** BEZ automatic umbrella: an open canopy in alternating panels, the J handle, a few drops */
const UMBRELLA = svg(`
  <g class="p-float">
    <g fill="${BURGUNDY}" opacity=".55"><rect x="70" y="120" width="8" height="34" rx="4" transform="rotate(18 74 137)"/><rect x="524" y="150" width="8" height="34" rx="4" transform="rotate(18 528 167)"/><rect x="480" y="74" width="8" height="30" rx="4" transform="rotate(18 484 89)"/><rect x="110" y="48" width="8" height="30" rx="4" transform="rotate(18 114 63)"/></g>
    <rect x="293" y="62" width="14" height="48" rx="7" fill="${BURGUNDY}"/>
    <path d="M300 100C176 100 82 190 70 318c34-30 66-30 96 0 22-30 52-30 84 0 20-30 50-30 76 0 28-30 58-30 80 0 30-30 64-30 100 0C514 190 424 100 300 100z" fill="${PINK}" stroke="${BURGUNDY}" stroke-width="8" stroke-linejoin="round"/>
    <path d="M300 100C250 150 230 230 250 318c0 0-40 0-84 0C150 240 200 140 300 100z" fill="${BURGUNDY}"/>
    <path d="M300 100c50 50 70 130 50 218c0 0 40 0 84 0C450 240 400 140 300 100z" fill="${BURGUNDY}"/>
    <path d="M300 100c-26 60-34 140-24 218M300 100c26 60 34 140 24 218" stroke="${BURGUNDY}" stroke-width="6" fill="none"/>
    <path d="M300 318v200a46 46 0 0 1-92 0" fill="none" stroke="${BURGUNDY}" stroke-width="20" stroke-linecap="round"/>
    <circle cx="300" cy="404" r="12" fill="${BUTTER}" stroke="${BURGUNDY}" stroke-width="6"/>
  </g>`);

export const PRIZE_ART: Record<PrizeKind, string> = { watch: WATCH, fuel: FUEL, umbrella: UMBRELLA };

/* ---------- Thailand ---------- */

/** Thailand's border and coast, [lon, lat], clockwise from Mae Sai. Simplified for a poster: it only has to read as Thailand. */
const OUTLINE: [number, number][] = [
  [99.88, 20.43], [100.09, 20.35], [100.20, 20.30], [100.42, 20.25], [100.55, 19.95], [100.50, 19.60], [100.85, 19.50],
  [101.10, 19.55], [101.25, 19.35], [101.10, 19.05], [101.15, 18.55], [101.05, 18.10], [101.15, 17.85], [101.45, 17.80],
  [101.75, 17.95], [102.10, 18.20], [102.55, 17.95], [102.95, 18.05], [103.35, 18.40], [103.85, 18.30], [104.15, 17.95],
  [104.45, 17.65], [104.78, 17.35], [104.85, 17.00], [104.70, 16.60], [105.05, 16.10], [105.30, 15.75], [105.50, 15.25],
  [105.60, 14.60], [105.10, 14.35], [104.50, 14.40], [103.85, 14.35], [103.30, 14.35], [102.80, 14.20], [102.55, 14.10],
  [102.45, 13.60], [102.35, 13.20], [102.30, 12.70], [102.60, 12.15], [102.80, 11.85], [102.92, 11.65],
  [102.60, 12.05], [102.20, 12.30], [101.90, 12.55], [101.40, 12.65], [101.00, 12.75], [100.90, 13.25], [100.60, 13.45],
  [100.45, 13.50], [100.25, 13.40], [100.05, 13.30], [100.10, 12.90], [100.00, 12.60], [99.95, 12.20], [99.80, 11.80],
  [99.60, 11.30], [99.45, 10.80], [99.25, 10.30], [99.20, 9.75], [99.35, 9.25], [99.60, 8.95], [99.95, 8.70],
  [100.10, 8.30], [100.30, 7.95], [100.55, 7.40], [100.40, 7.15], [100.70, 7.00], [101.00, 6.95], [101.30, 6.85],
  [101.70, 6.75], [101.95, 6.55], [102.10, 6.25], [101.80, 6.15], [101.55, 5.95], [101.20, 5.70], [101.00, 5.62],
  [100.85, 5.80], [100.80, 6.30], [100.55, 6.45], [100.35, 6.50], [100.15, 6.45], [100.05, 6.60], [99.85, 6.85],
  [99.65, 7.15], [99.50, 7.45], [99.25, 7.70], [99.10, 8.10], [98.85, 8.20], [98.55, 8.15], [98.30, 8.20], [98.25, 8.60],
  [98.40, 9.10], [98.50, 9.60], [98.65, 10.00], [98.75, 10.45], [98.90, 10.90], [99.05, 11.40], [99.30, 11.75],
  [99.45, 12.20], [99.20, 12.55], [99.15, 13.05], [98.85, 13.50], [98.55, 14.00], [98.20, 14.60], [98.15, 15.10],
  [98.50, 15.25], [98.60, 15.80], [98.45, 16.40], [98.60, 16.90], [98.25, 17.35], [97.95, 17.75], [97.75, 18.25],
  [97.45, 18.55], [97.35, 19.00], [97.65, 19.40], [97.85, 19.80], [98.10, 19.85], [98.35, 19.65], [98.80, 19.85],
  [99.05, 20.10], [99.45, 20.15],
];

/** the run, south to north, through a few cities on the way: [name, lon, lat] */
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

export const THAILAND_PATH = d(smooth(OUTLINE.map(([lo, la]) => project(lo, la)), 2, true), true);
export const ROUTE_POINTS = ROUTE_STOPS.map(([, lo, la]) => project(lo, la));
export const ROUTE_PATH = d(smooth(ROUTE_POINTS, 3, false), false);
