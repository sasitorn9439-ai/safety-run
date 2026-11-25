import type { Beep, EarnKind } from '../../shared/sim.js';

type Row = { row: HTMLElement; pts: HTMLElement };

export interface TallyEls {
  card: HTMLElement;
  score: HTMLElement; scoreBox: HTMLElement;
  dist: HTMLElement;
  /** the coin row: the pile (icon + count) and the points the coins earned */
  coins: HTMLElement; coinImg: HTMLImageElement;
  rows: Record<EarnKind, Row>;
  /** the loot box row: how many chests this run picked up (they never add points) */
  loot: { row: HTMLElement; n: HTMLElement };
}

export interface TallyRun { score: number; dist: number; coins: number; earned: Readonly<Record<EarnKind, number>>; coinSrc: string; loot: number }

/** at most this many coin sprites fly per tally; with more coins, each sprite carries several */
const MAX_FLYERS = 24;
const BASE_MS = 650;
const FLY_MS = 420;
const REST_MS = 600;
const KINDS = ['coin', 'ppe', 'near', 'extra'] as const satisfies readonly EarnKind[];
const REST = ['ppe', 'near', 'extra'] as const satisfies readonly EarnKind[];

const easeOut = (t: number) => 1 - (1 - t) ** 3;
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The crash screen's score count-up, one source at a time:
 * 1. distance points roll up,
 * 2. the coins fly one by one from the pile into the score, the pile counting down to zero as the coin row's points tick up,
 * 3. PPE, near misses and the extras roll up together.
 * Each row shows what its source added; a tap skips to the end.
 */
export class Tally {
  private raf = 0;
  private timers: number[] = [];
  private flyers: HTMLElement[] = [];
  private finish: (() => void) | null = null;

  constructor(private el: TallyEls, private beep: Beep) {
    el.card.addEventListener('pointerdown', () => this.skip());
  }

  play(r: TallyRun) {
    this.stop();
    const { el } = this, e = r.earned;
    const base = r.score - KINDS.reduce((s, k) => s + e[k], 0);
    el.coinImg.src = r.coinSrc;
    for (const k of KINDS) el.rows[k].row.hidden = e[k] === 0;
    el.loot.row.hidden = r.loot === 0;
    el.loot.n.textContent = '×' + r.loot;

    /** `walked` is how far the distance has rolled (0..1); `pile` the coins still to fly; `got` what each source has added so far */
    const set = (walked: number, pile: number, got: Record<EarnKind, number>) => {
      el.score.textContent = String(Math.round(base * walked) + KINDS.reduce((s, k) => s + got[k], 0));
      el.dist.textContent = String(Math.round(r.dist * walked));
      el.coins.textContent = String(pile);
      el.rows.coin.row.classList.toggle('empty', pile === 0);
      for (const k of KINDS) el.rows[k].pts.textContent = '+' + got[k];
    };
    const none = { coin: 0, ppe: 0, near: 0, extra: 0 };
    this.finish = () => { this.stop(); set(1, 0, { ...e }); };
    if (reducedMotion()) return this.finish();
    set(0, r.coins, none);

    const end = () => { this.beep(1320, 0.16, 'triangle', 0.05); this.finish?.(); };
    const rest = () => {
      if (!REST.some(k => e[k])) return end();
      this.roll(REST_MS, k => set(1, 0, { coin: e.coin, ppe: Math.round(e.ppe * k), near: Math.round(e.near * k), extra: Math.round(e.extra * k) }), end);
    };
    this.roll(BASE_MS, k => set(k, r.coins, none), () => {
      if (r.coins) this.flyCoins(r, (landed, n) => set(1, r.coins - Math.round(r.coins * landed / n), { ...none, coin: Math.round(e.coin * landed / n) }), rest);
      else rest();
    });
  }

  private roll(ms: number, frame: (k: number) => void, done: () => void) {
    const t0 = performance.now();
    const step = (now: number) => {
      const k = easeOut(Math.min(1, (now - t0) / ms));
      frame(k);
      if (k < 1) this.raf = requestAnimationFrame(step);
      else done();
    };
    this.raf = requestAnimationFrame(step);
  }

  /** the coins fly from the pile into the score, one blip each */
  private flyCoins(r: TallyRun, land: (landed: number, n: number) => void, done: () => void) {
    const n = Math.min(MAX_FLYERS, r.coins);
    const gap = Math.max(45, Math.min(110, 1400 / n));      // a long run's coins pour in faster
    const from = this.el.coinImg.getBoundingClientRect(), to = this.el.score.getBoundingClientRect();
    let landed = 0;
    for (let i = 0; i < n; i++) {
      this.timers.push(window.setTimeout(() => {
        const f = this.flyer(r.coinSrc, from, to, i);
        f.addEventListener('animationend', () => {
          f.remove();
          land(++landed, n);
          this.pop(this.el.scoreBox); this.pop(this.el.rows.coin.row);
          this.beep(880 + Math.min(landed, 16) * 45, 0.05, 'triangle', 0.045);
          if (landed === n) done();
        }, { once: true });
      }, i * gap));
    }
  }

  private flyer(src: string, from: DOMRect, to: DOMRect, i: number) {
    const f = document.createElement('img');
    f.src = src; f.alt = ''; f.className = 'tally-coin';
    const size = from.width || 22;
    const x0 = from.left + from.width / 2 - size / 2, y0 = from.top + from.height / 2 - size / 2;
    const dx = to.left + to.width / 2 - size / 2 - x0, dy = to.top + to.height / 2 - size / 2 - y0;
    const arc = -40 - (i % 3) * 14;                           // vary the arc so the stream reads as many coins
    Object.assign(f.style, { left: `${x0}px`, top: `${y0}px`, width: `${size}px`, height: `${size}px` });
    f.style.setProperty('--dx', `${dx}px`); f.style.setProperty('--dy', `${dy}px`); f.style.setProperty('--arc', `${arc}px`);
    f.style.animationDuration = `${FLY_MS}ms`;
    document.body.appendChild(f);
    this.flyers.push(f);
    return f;
  }

  private pop(e: HTMLElement) { e.classList.remove('pop'); void e.offsetWidth; e.classList.add('pop'); }

  /** jump to the final numbers */
  skip() { this.finish?.(); }

  /** cancel any running tally, leaving the numbers as they are */
  stop() {
    cancelAnimationFrame(this.raf);
    for (const t of this.timers) clearTimeout(t);
    for (const f of this.flyers) f.remove();
    this.timers = []; this.flyers = []; this.finish = null;
  }
}
