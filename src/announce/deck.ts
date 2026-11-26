/**
 * The deck controller: a fixed 1920x1080 stage scaled to the window, and a list of scenes. A scene is one slide with `steps`
 * extra clicks inside it (an award has one: the click that reveals the winner). Navigation always goes through `render`, which
 * rebuilds a slide from scratch, so going back never leaves a half-played animation behind.
 */
import { toggleMute, clearConfetti } from './fx.js';
import { hasNarration, narrate, narrationStatus, stopNarration, toggleNarration } from './narrator.js';

export interface Scene {
  el: HTMLElement;
  /** clicks inside the slide, after it appears */
  steps: number;
  /** the slide appears; `instant` skips its entrance animations (coming back to it) */
  enter(instant: boolean): void;
  /** click number `k` (1…steps) inside the slide; resolve when its animation is over */
  step(k: number, instant: boolean): Promise<void> | void;
  /** the slide goes away: stop anything running */
  leave(): void;
  /** a click while a step is still playing: finish it now */
  skip?(): void;
}

export class Deck {
  i = -1;
  k = 0;
  private busy = false;
  private hintTimer = 0;
  private stage = document.getElementById('deckStage')!;

  constructor(readonly scenes: Scene[]) {
    this.fitStage();
    addEventListener('resize', () => this.fitStage());
    addEventListener('keydown', e => this.key(e));
    this.pointer();
  }

  /** one transform for the whole stage: letterboxed, never reflowed */
  private fitStage() {
    const f = Math.min(innerWidth / 1920, innerHeight / 1080);
    this.stage.style.transform = `translate(${(innerWidth - 1920 * f) / 2}px, ${(innerHeight - 1080 * f) / 2}px) scale(${f})`;
  }

  private key(e: KeyboardEvent) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if ((e.target as HTMLElement)?.closest('input, textarea')) return;
    const k = e.key;
    if (k === ' ' || k === 'ArrowRight' || k === 'ArrowDown' || k === 'PageDown' || k === 'Enter') { e.preventDefault(); void this.next(); }
    else if (k === 'ArrowLeft' || k === 'ArrowUp' || k === 'PageUp' || k === 'Backspace') { e.preventDefault(); this.prev(); }
    else if (k === 'Home') void this.render(0, 0, true);
    else if (k === 'End') void this.render(this.scenes.length - 1, 0, false);
    else if (k === 'f' || k === 'F') { if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen?.(); }
    else if (k === 'm' || k === 'M') this.hint(toggleMute() ? 'เสียงเอฟเฟกต์: ปิด' : 'เสียงเอฟเฟกต์: เปิด');
    else if (k === 'n' || k === 'N') { if (hasNarration()) { toggleNarration(); } this.hint(narrationStatus); }
  }

  /** click or tap = next; a swipe right = back */
  private pointer() {
    let x0 = 0, y0 = 0, t0 = 0;
    addEventListener('pointerdown', e => { x0 = e.clientX; y0 = e.clientY; t0 = e.timeStamp; });
    addEventListener('pointerup', e => {
      if ((e.target as HTMLElement).closest('.gate, input, button')) return;
      const dx = e.clientX - x0, dy = e.clientY - y0;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5 && e.timeStamp - t0 < 800) { if (dx > 0) this.prev(); else void this.next(); return; }
      if (Math.hypot(dx, dy) < 12 && e.button === 0) void this.next();
    });
  }

  private hint(text: string) {
    const el = document.getElementById('hint');
    if (!el) return;
    el.textContent = text; el.classList.add('show');
    clearTimeout(this.hintTimer);
    this.hintTimer = window.setTimeout(() => el.classList.remove('show'), 1800);
  }

  async next() {
    const s = this.scenes[this.i];
    if (!s) return;
    if (this.busy) { s.skip?.(); return; }
    stopNarration();
    if (this.k < s.steps) {
      this.k++;
      this.busy = true;
      try { await s.step(this.k, false); } finally { this.busy = false; }
    } else if (this.i < this.scenes.length - 1) await this.render(this.i + 1, 0, false);
  }

  prev() {
    stopNarration();
    if (this.busy) { this.scenes[this.i]?.skip?.(); return; }
    if (this.k > 0) void this.render(this.i, this.k - 1, true);
    else if (this.i > 0) void this.render(this.i - 1, this.scenes[this.i - 1]!.steps, true);
  }

  /** show slide `i` as it looks after `k` clicks; `instant` = no entrance animation */
  async render(i: number, k: number, instant: boolean) {
    const from = this.scenes[this.i];
    from?.leave();
    from?.el.classList.remove('active', 'visible', 'go', 'instant');
    clearConfetti();
    this.i = i; this.k = k; this.busy = false;
    const s = this.scenes[i]!;
    s.el.classList.toggle('instant', instant);
    s.el.classList.remove('go');
    void s.el.offsetWidth;
    s.el.classList.add('active', 'visible');
    s.enter(instant);
    for (let j = 1; j <= k; j++) await s.step(j, true);
    s.el.classList.add('go');
    // the recorded narration for this slide, once its entrance has had a moment; coming back to a slide stays quiet
    if (instant) stopNarration(); else narrate(`${s.el.id}.enter`, 700);
    this.dots();
    const q = new URLSearchParams(location.search);
    q.set('slide', String(i + 1));
    if (k) q.set('step', String(k)); else q.delete('step');
    history.replaceState(null, '', '?' + q.toString());
  }

  /** the footer on every slide: a mono line and one dot per slide */
  private dots() {
    const s = this.scenes[this.i]!;
    s.el.querySelectorAll('.dots').forEach(d => {
      d.innerHTML = this.scenes.map((_, j) => `<i${j === this.i ? ' class="on"' : ''}></i>`).join('') + `<b>${String(this.i + 1).padStart(2, '0')} / ${String(this.scenes.length).padStart(2, '0')}</b>`;
    });
  }

  /** adds the footer chrome to every slide (once the scene list is final) */
  addChrome() {
    for (const s of this.scenes) {
      if (s.el.querySelector('.chrome')) continue;
      const label = s.el.dataset.chrome || 'Safety Run · EHS Day 2026';
      const c = document.createElement('div');
      c.className = 'chrome';
      c.innerHTML = `<span class="c-l">${label}</span><span class="c-r dots"></span>`;
      s.el.appendChild(c);
    }
  }
}
