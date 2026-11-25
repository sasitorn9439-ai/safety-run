import { HAZARD_KINDS, HZ, PPE } from '../shared/hazards.js';
import { LIFT_HEIGHT, POWER_SECONDS, SLIDE_SECONDS, SPARK_HALF_CYCLE, START_SPEED, STEP, createRun, type Action, type GameObject, type PowerType } from '../shared/sim.js';
import { ZONES } from '../shared/zones.js';
import { CATALOG, lookOfWorn } from './cosmetics/wardrobe.js';
import { SLOTS, type Slot } from './cosmetics/types.js';
import { AV_N, avName } from '../shared/avatar.js';
import { avImg } from './lib/avatar.js';
import { createRenderer, type SceneState } from './render/index.js';
import './dev.css';

const powers = ['estop', 'broom', 'lift', 'firstaid', 'toolbox'] satisfies PowerType[];
const assets: { label: string; objects: GameObject[] }[] = [
  { label: 'Mascot only', objects: [] },
  { label: 'Coin arc over hose', objects: [
    { k: 'hose', l: 0, z: 0 },
    ...[-5.1, -3.4, -1.7, 0, 1.7, 3.4, 5.1].map(z => ({ k: 'coin' as const, l: 0, z })),
  ] },
  ...HAZARD_KINDS.map(k => ({ label: HZ[k].en, objects: [{ k, l: 0, z: 0, on: true, locked: true, fz: 24 }] })),
  ...PPE.map(p => ({ label: `PPE · ${p}`, objects: [{ k: 'ppe' as const, p, l: 0, z: 0 }] })),
  ...powers.map(t => ({ label: `Power-up · ${t}`, objects: [{ k: 'power' as const, t, l: 0, z: 0 }] })),
  { label: 'Coin', objects: [{ k: 'coin', l: 0, z: 0 }] },
  { label: 'Bonus coin', objects: [{ k: 'bonus', l: 0, z: 0 }] },
];

export async function startDev() {
  document.title = 'Safety Run · Dev Mode';
  document.body.innerHTML = `
    <main class="dev-layout">
      <section class="dev-stage" aria-label="Game preview"><canvas id="dev-c"></canvas></section>
      <aside class="dev-panel">
        <a href="/">← Safety Run</a>
        <h1>Dev Mode</h1>
        <p id="dev-renderer" role="status">Loading renderer…</p>
        <fieldset><legend>Avatar</legend>
          <div class="dev-avatar" id="dev-av"></div>
          <output id="dev-av-name"></output>
          <label>Avatar number <input id="dev-av-n" type="number" min="0" max="${AV_N * 2}" value="5"></label>
          ${SLOTS.map(s => `<label>${s} <select id="dev-av-${s}"><option value="">—</option>${CATALOG.filter(c => c.slot === s).map(c => `<option value="${c.id}">${c.name}</option>`).join('')}</select></label>`).join('')}
          <button id="dev-av-random" type="button">Random outfit</button>
        </fieldset>
        <label>Asset or scene <select id="dev-asset"></select></label>
        <label>Distance <output id="dev-depth-value"></output>
          <input id="dev-depth" type="range" min="6" max="62" step=".5" value="18">
        </label>
        <label>Area (scenery)
          <select id="dev-zone"><option value="-1">By distance</option>${ZONES.map((z, i) => `<option value="${i}">${z.en}</option>`).join('')}</select>
        </label>
        <label>Asset lane
          <select id="dev-lane"><option value="-1">Left</option><option value="0" selected>Center</option><option value="1">Right</option></select>
        </label>
        <fieldset><legend>Movement</legend>
          <div class="dev-buttons">
            <button type="button" data-action="left">Left ←</button>
            <button type="button" data-action="up">Jump ↑</button>
            <button type="button" data-action="right">Right →</button>
            <button type="button" data-action="down">Slide ↓</button>
            <button id="dev-lift" type="button">Ride man-lift</button>
          </div>
        </fieldset>
        <label class="dev-check"><input id="dev-run" type="checkbox" checked> Scroll corridor</label>
        <div class="dev-buttons">
          <button id="dev-play" type="button">Pause</button>
          <button id="dev-step" type="button" disabled>Step 1 frame</button>
          <button id="dev-reset" type="button">Reset motion</button>
        </div>
        <output id="dev-state"></output>
      </aside>
    </main>`;
  const status = document.querySelector<HTMLElement>('#dev-renderer')!;
  try {
    const { renderer, canvas } = await createRenderer(document.querySelector<HTMLCanvasElement>('#dev-c')!);
    status.textContent = `${renderer.kind} · ${renderer.mascot}`;
    const asset = document.querySelector<HTMLSelectElement>('#dev-asset')!;
    assets.forEach(({ label }, index) => asset.add(new Option(label, String(index))));
    asset.value = '1';
    const depth = document.querySelector<HTMLInputElement>('#dev-depth')!;
    const depthValue = document.querySelector<HTMLOutputElement>('#dev-depth-value')!;
    const lane = document.querySelector<HTMLSelectElement>('#dev-lane')!;
    const zone = document.querySelector<HTMLSelectElement>('#dev-zone')!;
    const q = new URLSearchParams(location.search).get('zone');
    if (q !== null) zone.value = q;
    const scroll = document.querySelector<HTMLInputElement>('#dev-run')!;
    const play = document.querySelector<HTMLButtonElement>('#dev-play')!;
    const step = document.querySelector<HTMLButtonElement>('#dev-step')!;
    const output = document.querySelector<HTMLOutputElement>('#dev-state')!;
    // Let the game simulation drive the mascot. The sandbox supplies its own scene and has no session.
    const makeMotion = () => createRun(1, undefined, undefined, { movementOnly: true });
    let motion = makeMotion();
    let previous = motion.view();
    let corridor = 0;
    let previousCorridor = 0;
    let now = performance.now();
    let paused = false;
    let acc = 0;
    let last = performance.now();
    let objects: GameObject[] = [];
    // the movement-only sim has no power-ups, so the man-lift is played here: seconds left on it and the height it carries the mascot to
    let lift = 0, liftPy = 0, prevLiftPy = 0;

    const place = () => {
      const z = depth.valueAsNumber;
      depthValue.value = `${z} m`;
      objects = assets[Number(asset.value)]!.objects.map(o => ({ ...o, l: o.l + Number(lane.value), z: o.z + z }));
    };
    place();
    for (const control of [asset, depth, lane]) control.addEventListener('input', place);

    // avatar preview: the badge with nothing worn, the dressed head otherwise; the mascot on stage wears the same outfit
    const avN = document.querySelector<HTMLInputElement>('#dev-av-n')!;
    const avSlot = (s: Slot) => document.querySelector<HTMLSelectElement>(`#dev-av-${s}`)!;
    const showAvatar = () => {
      const worn: Partial<Record<Slot, string>> = {};
      for (const s of SLOTS) if (avSlot(s).value) worn[s] = avSlot(s).value;
      const n = Math.max(0, avN.valueAsNumber || 0);
      document.querySelector<HTMLElement>('#dev-av')!.innerHTML = [160, 72, 36, 22].map(px => avImg(n, px, worn)).join('');
      document.querySelector<HTMLOutputElement>('#dev-av-name')!.value = avName(n);
      renderer.setLook(lookOfWorn(worn));
    };
    for (const control of [avN, ...SLOTS.map(avSlot)]) control.addEventListener('input', showAvatar);
    document.querySelector<HTMLButtonElement>('#dev-av-random')!.onclick = () => {
      for (const s of SLOTS) { const opts = avSlot(s).options; avSlot(s).selectedIndex = Math.floor(Math.random() * opts.length); }
      avN.value = String(Math.floor(Math.random() * AV_N));
      showAvatar();
    };
    showAvatar();

    function advance() {
      previous = motion.view();
      previousCorridor = corridor;
      motion.step();
      prevLiftPy = liftPy;
      lift = Math.max(0, lift - STEP);
      liftPy += ((lift > 0 ? LIFT_HEIGHT : 0) - liftPy) * Math.min(1, STEP * 8);
      if (lift === 0 && liftPy < .01) liftPy = 0;
      if (scroll.checked) corridor += START_SPEED * STEP;
      now += STEP * 1000;
    }

    const move = (action: Action) => motion.input(action);
    document.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(button => {
      button.onclick = () => {
        const action = button.dataset.action;
        if (action === 'left' || action === 'right' || action === 'up' || action === 'down') move(action);
      };
    });
    const keys = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' } satisfies Record<string, Action>;
    window.addEventListener('keydown', event => {
      if (event.repeat || event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
      const action = Object.entries(keys).find(([key]) => key === event.key)?.[1];
      if (!action) return;
      event.preventDefault();
      move(action);
    });
    document.querySelector<HTMLButtonElement>('#dev-lift')!.onclick = () => { lift = POWER_SECONDS.lift; };
    play.onclick = () => {
      paused = !paused;
      acc = 0;
      play.textContent = paused ? 'Resume' : 'Pause';
      step.disabled = !paused;
    };
    step.onclick = advance;
    document.querySelector<HTMLButtonElement>('#dev-reset')!.onclick = () => {
      motion = makeMotion();
      previous = motion.view();
      corridor = previousCorridor = acc = 0;
      lift = liftPy = prevLiftPy = 0;
    };

    new ResizeObserver(() => renderer.resize()).observe(canvas);
    const draw = (time: number) => {
      if (!paused) {
        acc += Math.min(.1, (time - last) / 1000);
        while (acc >= STEP) { advance(); acc -= STEP; }
      }
      last = time;
      const view = motion.view();
      for (const object of objects) {
        if (object.k === 'sparks') object.on = motion.tick % (SPARK_HALF_CYCLE * 2) < SPARK_HALF_CYCLE;
      }
      const onLift = lift > 0 || liftPy > 0;
      const scene: SceneState = { ...view, dist: corridor, objs: objects, inv: 0, stageZone: Number(zone.value), ...(onLift && { py: liftPy, vy: 0, slide: 0, lift }) };
      renderer.render({
        s: scene,
        prev: { ...previous, dist: previousCorridor, ...(onLift && { py: prevLiftPy, slide: 0 }) },
        alpha: paused ? 1 : acc / STEP,
        playing: true,
        flash: 0,
        still: !scroll.checked,
      }, now);
      const pose = lift > 0 ? `Man-lift ${lift.toFixed(1)} s` : view.slide > 0 ? `Slide ${Math.round(100 * (1 - view.slide / SLIDE_SECONDS))}%` : view.py > 0 ? 'Jump' : 'Grounded';
      const readout = `${pose} · lane ${view.lane} · height ${scene.py.toFixed(2)}`;
      if (output.value !== readout) output.value = readout;
      requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
  } catch (error) {
    status.textContent = `Could not start renderer: ${String(error)}`;
  }
}
