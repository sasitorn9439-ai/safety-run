/**
 * Dev-only (`/?botsim`): the real sim on the real renderer, starting at a chosen distance, to see how fast each speed step feels.
 * The test bot plays it, or switch the bot off and play it yourself with the arrow keys / WASD or by swiping.
 */
import { STEP, createRun, speedAt, type Action, type Run, type RunView } from '../shared/sim.js';
import { think } from '../tests/bot.js';
import { createRenderer } from './render/index.js';
import './dev.css';

const STARTS = [1000, 149500, 169500, 189500, 209500, 229500];

export async function startBotSim() {
  document.title = 'Safety Run · Bot Sim';
  document.body.innerHTML = `
    <main class="dev-layout">
      <section class="dev-stage" aria-label="Bot run"><canvas id="bs-c"></canvas></section>
      <aside class="dev-panel">
        <a href="/">← Safety Run</a>
        <h1>Bot Sim</h1>
        <p id="bs-status" role="status">Loading renderer…</p>
        <fieldset><legend>Start at</legend><div class="dev-buttons" id="bs-starts"></div></fieldset>
        <label>Playback speed <select id="bs-rate"><option value="1" selected>1× (real time)</option><option value="0.5">0.5×</option><option value="2">2×</option><option value="4">4×</option></select></label>
        <label class="dev-check"><input id="bs-bot" type="checkbox" checked> Bot plays (untick to play yourself)</label>
        <p id="bs-help" hidden>Arrow keys or WASD: ← → change lane, ↑ jump, ↓ slide. Or swipe on the game. Space pauses.</p>
        <div class="dev-buttons"><button id="bs-play" type="button">Pause</button></div>
        <div id="bs-readout" style="font: 600 15px/1.6 ui-monospace, monospace; white-space: pre"></div>
      </aside>
    </main>`;
  const status = document.querySelector<HTMLElement>('#bs-status')!;
  const readout = document.querySelector<HTMLElement>('#bs-readout')!;
  const rate = document.querySelector<HTMLSelectElement>('#bs-rate')!;
  const bot = document.querySelector<HTMLInputElement>('#bs-bot')!;
  const help = document.querySelector<HTMLElement>('#bs-help')!;
  try {
    const { renderer, canvas } = await createRenderer(document.querySelector<HTMLCanvasElement>('#bs-c')!);
    status.textContent = `${renderer.kind} · ${renderer.mascot}`;
    let seed = 1, run!: Run, prev!: RunView, crashes = 0, startDist = 0, acc = 0, last = performance.now(), paused = false, now = performance.now(), hitFlash = 0;
    const begin = (dist: number) => {
      run = createRun(seed++, undefined, e => renderer.onEvent(e, run.view().px), { startDist: dist });
      prev = run.view();
    };
    const start = (dist: number) => { startDist = dist; crashes = 0; begin(dist); };
    const starts = document.querySelector<HTMLElement>('#bs-starts')!;
    for (const d of STARTS) {
      const b = document.createElement('button'); b.type = 'button';
      b.textContent = `${(d / 1000).toFixed(1)} km`; b.onclick = () => start(d); starts.append(b);
    }
    const play = document.querySelector<HTMLButtonElement>('#bs-play')!;
    const togglePause = () => { paused = !paused; play.textContent = paused ? 'Resume' : 'Pause'; };
    play.onclick = togglePause;
    bot.onchange = () => { help.hidden = bot.checked; start(startDist); bot.blur(); };

    // playing yourself: keys and swipes go straight to the run
    const press = (a: Action) => { if (!bot.checked && !paused) run.input(a); };
    const keys: Record<string, Action> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', a: 'left', d: 'right', w: 'up', s: 'down' };
    window.addEventListener('keydown', e => {
      if (e.target instanceof HTMLSelectElement) return;
      if (e.key === ' ') { e.preventDefault(); togglePause(); return; }
      const a = keys[e.key];
      if (!a || e.repeat) return;
      e.preventDefault(); press(a);
    });
    let touch: { x: number; y: number } | null = null;
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', e => { touch = { x: e.clientX, y: e.clientY }; });
    canvas.addEventListener('pointerup', e => {
      if (!touch) return;
      const dx = e.clientX - touch.x, dy = e.clientY - touch.y; touch = null;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
      press(Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down'));
    });
    start(149500);

    const tick = () => {
      if (run.finished) { crashes++; hitFlash = 0.35; begin(run.view().dist); return; }   // a crash: carry on from the same spot on a new seed
      const bonus = run.view().pendingBonus;
      if (bonus) { run.answer(bonus.correct); return; }
      if (bot.checked) think(run);
      prev = run.view();
      run.step();
      now += STEP * 1000;
      hitFlash = Math.max(0, hitFlash - STEP);
    };

    new ResizeObserver(() => renderer.resize()).observe(canvas);
    const draw = (time: number) => {
      if (!paused) {
        acc += Math.min(0.1, (time - last) / 1000) * Number(rate.value);
        while (acc >= STEP) { tick(); acc -= STEP; }
      }
      last = time;
      const v = run.view();
      renderer.render({ s: v, prev, alpha: paused ? 1 : acc / STEP, playing: true, flash: Math.max(v.flash, hitFlash) }, now);
      const text = `distance ${Math.floor(v.dist).toLocaleString()} m\nspeed    ${speedAt(v.dist).toFixed(1)} m/s (${(speedAt(v.dist) * 3.6).toFixed(0)} km/h)\nfrom     ${startDist.toLocaleString()} m\ncrashes  ${crashes}\nplayer   ${bot.checked ? 'bot' : 'you'}`;
      if (readout.textContent !== text) readout.textContent = text;
      requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
  } catch (error) {
    status.textContent = `Could not start renderer: ${String(error)}`;
  }
}
