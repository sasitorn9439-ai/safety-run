import type { Beep } from '../../shared/sim.js';

export interface TallyEls {
  card: HTMLElement;
  score: HTMLElement; scoreBox: HTMLElement;
  dist: HTMLElement;
  coins: HTMLElement; coinBox: HTMLElement; coinImg: HTMLImageElement;
}

export interface TallyRun { score: number; dist: number; coins: number; coinSrc: string }

/** at most this many coin sprites fly per tally; with more coins, each sprite carries several */
const MAX_FLYERS = 24;
const BASE_MS = 650;
const FLY_MS = 420;

const easeOut = (t: number) => 1 - (1 - t) ** 3;
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The crash screen's score count-up: distance points roll up first, then the run's coins fly one by one
 * from the coin pile into the score, the pile counting down to zero as each one adds its share of the bonus.
 * A tap skips to the end.
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
    const { el } = this;
    // a metre is a point and the rest is bonus, which rides in on the coins (no coins: it all rolls up at once)
    const base = r.coins ? Math.min(r.score, r.dist) : r.score;
    const bonus = r.score - base;
    el.coinImg.src = r.coinSrc;
    el.coinBox.hidden = r.coins === 0;
    /** `coins` is what is left in the pile, still to be added to the score */
    const set = (score: number, dist: number, coins: number) => {
      el.score.textContent = String(score); el.dist.textContent = String(dist); el.coins.textContent = String(coins);
      el.coinBox.classList.toggle('empty', coins === 0);
    };
    this.finish = () => { this.stop(); set(r.score, r.dist, 0); };
    if (reducedMotion()) return this.finish();
    set(0, 0, r.coins);

    // phase 1: distance (and the score it earns) rolls up
    const t0 = performance.now();
    const roll = (now: number) => {
      const k = easeOut(Math.min(1, (now - t0) / BASE_MS));
      set(Math.round(base * k), Math.round(r.dist * k), r.coins);
      if (k < 1) this.raf = requestAnimationFrame(roll);
      else if (r.coins === 0) this.finish?.();
      else this.flyCoins(r, base, bonus, set);
    };
    this.raf = requestAnimationFrame(roll);
  }

  /** phase 2: coins fly into the score, the pile counting down as the bonus ticks up */
  private flyCoins(r: TallyRun, base: number, bonus: number, set: (s: number, d: number, c: number) => void) {
    const n = Math.max(1, Math.min(MAX_FLYERS, r.coins));
    const gap = Math.max(45, Math.min(110, 1400 / n));      // a long run's coins pour in faster
    const from = this.el.coinImg.getBoundingClientRect(), to = this.el.score.getBoundingClientRect();
    let landed = 0;
    for (let i = 0; i < n; i++) {
      this.timers.push(window.setTimeout(() => {
        const f = this.flyer(r.coinSrc, from, to, i);
        f.addEventListener('animationend', () => {
          f.remove();
          landed++;
          set(base + Math.round(bonus * landed / n), r.dist, r.coins - Math.round(r.coins * landed / n));
          this.pop(this.el.scoreBox); this.pop(this.el.coinBox);
          this.beep(880 + Math.min(landed, 16) * 45, 0.05, 'triangle', 0.045);
          if (landed === n) { this.beep(1320, 0.16, 'triangle', 0.05); this.finish?.(); }
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
