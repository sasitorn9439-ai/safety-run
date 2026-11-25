/**
 * The wardrobe: open loot boxes, browse all 90 cosmetics (locked ones dimmed, so you can see what is still out there), wear
 * them, and watch the mascot run, jump and slide in what it wears.
 */
import type { Beep } from '../../shared/sim.js';
import { DEFAULT_LOOK } from '../cosmetics/skins.js';
import { SLOTS, type Cosmetic, type Look, type Rarity, type Slot } from '../cosmetics/types.js';
import { CATALOG, DUPES_PER_BOX, EMPTY_WARDROBE, RARITY_LABEL, lookOf, type Pull, type Wardrobe } from '../cosmetics/wardrobe.js';
import { $, esc } from '../lib/dom.js';
import { animsWith } from '../render/flat/anims.js';
import { ringPhase } from '../cosmetics/effects.js';
import { drawPuppet } from '../render/flat/puppet.js';
import { drawLootBox } from '../render/draw.js';
import { flatBox, loadMascot, type MascotSet } from '../render/pixel-mascot.js';
import type { PixelAnim } from '../render/pixel-frames.js';

export const RARITY_COLOR: Record<Rarity, string> = { common: '#b5b8ae', rare: '#40c4ff', epic: '#b388ff', legendary: '#ffd400' };
const SLOT_LABEL: Record<Slot, string> = { skin: 'สกิน · Skins', hat: 'หมวก · Hats', effect: 'เอฟเฟกต์ · Effects' };

const idle = animsWith()[0]!;
const lookWith = (item: Cosmetic): Look =>
  item.slot === 'skin' ? { ...DEFAULT_LOOK, pal: item.pal, figure: item.figure ?? null } : item.slot === 'hat' ? { ...DEFAULT_LOOK, hat: item } : { ...DEFAULT_LOOK, effect: item };

/** the mascot standing in `look`, fitted into the canvas; hats are shown close up on the head */
function drawThumb(cv: HTMLCanvasElement, item: Cosmetic, locked: boolean) {
  const dpr = Math.min(2, devicePixelRatio || 1), size = cv.clientWidth || 72;
  cv.width = cv.height = Math.round(size * dpr);
  const c = cv.getContext('2d')!, look = lookWith(item);
  // a skin that is a picture shows its avatar picture on the tile (the preview and the game still show the character)
  const pic = item.slot === 'skin' ? item.figure?.portrait?.img : null;
  if (pic) {
    c.drawImage(pic, 0, 0, pic.naturalWidth, pic.naturalHeight, 0, 0, cv.width, cv.width * pic.naturalHeight / pic.naturalWidth);
    if (locked) { c.globalCompositeOperation = 'source-atop'; c.fillStyle = 'rgba(24,26,22,.86)'; c.fillRect(0, 0, cv.width, cv.height); }
    return;
  }
  // an effect that reaches high above (a beam from the sky) is cut off at the usual height, so the mascot stays the same size
  const [x0, y0, x1, y1] = item.slot === 'hat' ? [-.55, -1.55, .55, -.35] : flatBox({ ...DEFAULT_LOOK, effect: look.effect && { ...look.effect, above: 0 } });
  const u = cv.width / Math.max(x1 - x0, y1 - y0);
  c.save(); c.translate(cv.width / 2 - (x0 + x1) / 2 * u, cv.height / 2 - (y0 + y1) / 2 * u); c.scale(u, u);
  look.effect?.ring?.back(c, .3, -.45);
  drawPuppet(c, idle.pose(0) as Parameters<typeof drawPuppet>[1], look, .3);
  look.effect?.ring?.front(c, .3, -.45);
  c.restore();
  if (locked) { c.globalCompositeOperation = 'source-atop'; c.fillStyle = 'rgba(24,26,22,.86)'; c.fillRect(0, 0, cv.width, cv.height); }
}

/** run, jump, run, slide, run: the preview shows the look through every move */
const SHOW: [PixelAnim, number][] = [
  ...Array.from({ length: 32 }, (_, i) => ['run', i % 16] as [PixelAnim, number]),
  ...Array.from({ length: 16 }, (_, i) => ['jump', i] as [PixelAnim, number]),
  ...Array.from({ length: 16 }, (_, i) => ['run', i] as [PixelAnim, number]),
  ...Array.from({ length: 14 }, (_, i) => ['slide', i] as [PixelAnim, number]),
  ...Array.from({ length: 16 }, (_, i) => ['run', i] as [PixelAnim, number]),
];
const SHOW_BOX = [-.78, -1.55, .78, .4] as const;

/** The server owns the wardrobe: these ask it and resolve once the app holds its answer. */
export interface WardrobeDeps {
  /** what the server last said; null until the player has given an employee id */
  current(): Wardrobe | null;
  /** opens up to `n` boxes: what the server rolled (new or duplicate), or null when nothing could be opened */
  open(n: number): Promise<Pull[] | null>;
  wear(slot: Slot, id: string | null): Promise<void>;
  beep: Beep;
}

/** taps on the big box before it bursts open */
const TAPS = 3;
const OPEN_MAX = 10;
const RANK: Record<Rarity, number> = { legendary: 0, epic: 1, rare: 2, common: 3 };
const short = (c: Cosmetic) => c.name.split(' · ')[0]!;

/* small vector icons (drawn, not emoji) */
const NONE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2.2" fill="none"/><path d="M5.6 18.4L18.4 5.6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
const LOCK_ICON = '<svg class="ward-lock" viewBox="0 0 10 11" aria-hidden="true"><path d="M2.6 5V3.6a2.4 2.4 0 0 1 4.8 0V5" stroke="currentColor" stroke-width="1.4" fill="none"/><rect x="1" y="4.6" width="8" height="6.2" rx="1.3" fill="currentColor"/></svg>';

/** an item's name on one line; names too long for the tile scroll left in a loop (see marquee) */
const nameTag = (text: string, lock = false) =>
  `<small class="ward-name">${lock ? LOCK_ICON : ''}<span class="clip"><span class="run"><span>${esc(text)}</span></span></span></small>`;

/** gap between the end of a scrolling name and its next pass, px */
const MARQUEE_GAP = 24;

/**
 * Starts the scroll on every name in `root` that doesn't fit: the name is followed by a copy of itself, and the pair moves left
 * by one name (plus the gap) and repeats, so it reads as one endless line. Call once the names are laid out (visible).
 */
function marquee(root: HTMLElement) {
  for (const tag of root.querySelectorAll<HTMLElement>('.ward-name')) {
    const clip = tag.querySelector<HTMLElement>('.clip')!, run = tag.querySelector<HTMLElement>('.run')!, name = run.firstElementChild as HTMLElement;
    const width = name.getBoundingClientRect().width, fits = clip.clientWidth === 0 || width <= clip.clientWidth + 1;
    tag.classList.toggle('scroll', !fits);
    run.querySelector('[aria-hidden]')?.remove();
    if (fits) continue;
    const copy = name.cloneNode(true) as HTMLElement;
    copy.setAttribute('aria-hidden', 'true');
    run.append(copy);
    tag.style.setProperty('--shift', `${-(width + MARQUEE_GAP)}px`);
    tag.style.setProperty('--t', `${((width + MARQUEE_GAP) / 22).toFixed(1)}s`);      // about 22px a second
  }
}

/** the duplicate meter: DUPES_PER_BOX segments, `n` filled; a full meter is a free box */
function meter(el: HTMLElement, n: number, label = `ของซ้ำ ${n}/${DUPES_PER_BOX} · ครบ ${DUPES_PER_BOX} ได้กล่องฟรี`) {
  el.innerHTML = `<span class="ward-meter-bar">${Array.from({ length: DUPES_PER_BOX }, (_, i) => `<i${i < n ? ' class="on"' : ''}></i>`).join('')}</span><small>${esc(label)}</small>`;
  el.setAttribute('aria-label', label);
}

/** paints the loot chest (the same art as on the track) into every canvas.chest-art */
function paintChests() {
  const dpr = Math.min(2, devicePixelRatio || 1);
  for (const cv of document.querySelectorAll<HTMLCanvasElement>('canvas.chest-art')) {
    const size = parseFloat(getComputedStyle(cv).width) || 24;             // the CSS size, known even while the dialog is hidden
    cv.width = cv.height = Math.round(size * dpr);
    const c = cv.getContext('2d')!, u = cv.width * 1.1;
    c.clearRect(0, 0, cv.width, cv.height);
    c.save(); c.translate(cv.width / 2, cv.height / 2 + .03 * u); drawLootBox(c, u); c.restore();
  }
}

export function mountWardrobe(d: WardrobeDeps) {
  const ov = $('wardOv'), grid = $('wardGrid'), preview = $<HTMLCanvasElement>('wardPreview');
  const stage = $('wardStage'), bigBox = $<HTMLButtonElement>('wardBigBox'), result = $('wardResult'), hint = $('wardHint'), flash = $('wardFlash');
  let tab: Slot = 'skin', set: MascotSet | null = null, frame = 0, timer = 0, note = '';
  let look = lookOf(d.current() ?? EMPTY_WARDROBE);
  /** locked items tried on in the preview, one per slot so they mix across tabs: never saved, never sent to the server, never seen in a run */
  let trying: Partial<Record<Slot, Cosmetic>> = {};
  const tryOn = (base: Look): Look => {
    const { skin, hat, effect } = trying;
    return { pal: skin?.slot === 'skin' ? skin.pal : base.pal, figure: skin?.slot === 'skin' ? skin.figure ?? null : base.figure, hat: hat?.slot === 'hat' ? hat : base.hat, effect: effect?.slot === 'effect' ? effect : base.effect };
  };
  void loadMascot('flat').then(m => { set = m; });
  for (const c of CATALOG) if (c.slot === 'skin') void c.figure?.portrait?.ready.then(() => refresh());   // a tile that is a picture, once it has loaded
  paintChests();
  void document.fonts?.ready.then(paintChests);                           // the lock's "?" is in Kanit

  const boxesLeft = () => d.current()?.boxes ?? 0;
  const canOpen = () => boxesLeft() > 0;
  /** "open N" buttons: one box, or as many as are left up to ten */
  function setOpenButtons(one: HTMLButtonElement, many: HTMLButtonElement, more: string) {
    const n = Math.min(OPEN_MAX, boxesLeft());
    one.textContent = `${more}1`; one.disabled = !canOpen();
    many.textContent = `${more}${Math.max(2, n)}`; many.disabled = !canOpen() || n < 2;
  }

  function refresh() {
    // while a box is being opened the wardrobe behind it keeps showing what it had: it catches up when the opening closes
    if (stage.classList.contains('on')) return;
    const known = d.current(), w = known ?? EMPTY_WARDROBE;
    for (const s of SLOTS) if (trying[s] && w.owned.includes(trying[s].id)) delete trying[s];   // won it since: it's simply owned now
    look = tryOn(lookOf(w));
    showBoxes(w.boxes);
    $('wardCount').textContent = note || (known ? `สะสมแล้ว ${w.owned.length}/${CATALOG.length} ชิ้น` : 'ใส่รหัสพนักงานแล้วกดปุ่มกุญแจ · Enter your employee ID and tap the lock');
    meter($('wardMeter'), w.dupes);
    setOpenButtons($<HTMLButtonElement>('wardOpen'), $<HTMLButtonElement>('wardOpenMany'), 'เปิด ');
    for (const b of document.querySelectorAll<HTMLButtonElement>('#wardTabs button')) b.setAttribute('aria-selected', String(b.dataset.slot === tab));
    const items = CATALOG.filter(c => c.slot === tab), runs = w.runs ?? 0, worn0 = w.equipped[tab];
    // special items (Cosmetic.unlock): what they are, how to win them, and how many runs the player has done toward it
    // ...shown only while that item is the one being looked at (worn, or tapped to try on)
    $('wardInfo').innerHTML = items.filter(c => c.unlock && (worn0 === c.id || trying[tab]?.id === c.id)).map(c => {
      const u = c.unlock!, done = runs >= u.runs, left = u.runs - runs;
      return `<div class="ward-unlock${done ? ' done' : ''}"><h3>★ สกินพิเศษ — ${esc(c.name)}</h3><p>${esc(u.detail)}</p>`
        + `<div class="ward-prog" role="progressbar" aria-valuemin="0" aria-valuemax="${u.runs}" aria-valuenow="${Math.min(runs, u.runs)}"><i style="width:${Math.min(100, runs / u.runs * 100)}%"></i></div>`
        + `<p><b>${Math.min(runs, u.runs)}/${u.runs}</b> รอบ — ${done ? 'ปลดล็อกแล้ว ✓' : `${esc(u.how)} (เหลืออีก ${left} รอบ)`}</p></div>`;
    }).join('');
    const worn = w.equipped[tab];
    grid.innerHTML = `<button class="ward-item${worn ? '' : ' on'}" data-id="" type="button"><span class="ward-none">${NONE_ICON}</span>${nameTag('ไม่ใส่ · None')}</button>` +
      items.map(c => {
        const own = w.owned.includes(c.id);
        const tried = trying[tab]?.id === c.id;
        return `<button class="ward-item${own ? '' : ' locked'}${worn === c.id ? ' on' : ''}${tried ? ' trying' : ''}" data-id="${c.id}" type="button" style="--r:${RARITY_COLOR[c.rarity]}"${own ? '' : ` aria-pressed="${tried}" aria-label="ลองใส่ ${esc(c.name)} (ยังไม่ได้ปลดล็อก)"`}>`
          + `<canvas></canvas>${nameTag(c.unlock && !own ? `${short(c)} ${Math.min(runs, c.unlock.runs)}/${c.unlock.runs}` : short(c), !own)}</button>`;
      }).join('');
    grid.querySelectorAll<HTMLButtonElement>('.ward-item[data-id]:not([data-id=""])').forEach(b => {
      const item = CATALOG.find(c => c.id === b.dataset.id)!;
      drawThumb(b.querySelector('canvas')!, item, !w.owned.includes(item.id));
    });
    requestAnimationFrame(() => marquee(grid));
  }

  const wear = (slot: Slot, id: string | null) => { note = ''; return d.wear(slot, id).then(refresh); };

  function animate() {
    timer = requestAnimationFrame(animate);
    if (!set || !ov.classList.contains('on')) return;
    const [anim, i] = SHOW[Math.floor(frame++ / 3) % SHOW.length]!;       // ~20 frames a second
    const c = preview.getContext('2d')!, dpr = Math.min(2, devicePixelRatio || 1);
    const W = Math.round(preview.clientWidth * dpr), H = Math.round(preview.clientHeight * dpr);
    if (preview.width !== W || preview.height !== H) { preview.width = W; preview.height = H; }
    c.clearRect(0, 0, W, H);
    const [x0, y0, x1, y1] = SHOW_BOX, u = Math.min(W / (x1 - x0), H / (y1 - y0));
    // the jump lifts the whole mascot, as in the game
    const lift = anim === 'jump' ? Math.sin(Math.min(1, i / 12) * Math.PI) * .35 : 0;
    c.save(); c.translate(W / 2, H - y1 * u - lift * u);
    set.look = look;
    // a ring sweeps on its own clock, as in the game (Effect.ring)
    const ring = look.effect?.ring, rt = ringPhase(performance.now());
    if (ring) { c.save(); c.scale(u, u); ring.back(c, rt, -.45); c.restore(); }
    set.art(anim, i, 1).draw(c, u);
    if (ring) { c.save(); c.scale(u, u); ring.front(c, rt, -.45); c.restore(); }
    c.restore();
  }

  grid.onclick = e => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.ward-item');
    if (!b) return;
    if (b.classList.contains('locked')) {                              // try it on in the preview; tap again to take it off
      const item = CATALOG.find(c => c.id === b.dataset.id)!;
      if (trying[tab]?.id === item.id) delete trying[tab]; else trying[tab] = item;
      refresh();
      return;
    }
    delete trying[tab];
    void wear(tab, b.dataset.id || null);
  };
  $('wardTabs').onclick = e => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-slot]');
    if (b) { tab = b.dataset.slot as Slot; refresh(); }
  };

  /* ---------- opening: a big box in the middle; tap it to shake it, it bursts open, then a card with what came out ---------- */
  let taps = 0, count = 1, won: Pull[] | null | undefined, picked: Cosmetic | null = null, opening: Promise<unknown> = Promise.resolve();
  const roll = () => { won = undefined; opening = d.open(count).then(r => { won = r; }, () => { won = null; }); };

  const restart = (el: HTMLElement, cls: string) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };

  /* star dust: each shake throws sparkles up out of the box, gravity pulls them down off the bottom of the screen */
  interface Mote { x: number; y: number; vx: number; vy: number; r: number; rot: number; vr: number; c: string; star: boolean; tw: number }
  const dust = $<HTMLCanvasElement>('wardDust'), still = matchMedia('(prefers-reduced-motion: reduce)');
  let motes: Mote[] = [], dustFrame = 0, dustAt = 0;
  function sprinkle(n: number, speed: number, colors: readonly string[]) {
    if (still.matches || !stage.classList.contains('on')) return;
    const s = stage.getBoundingClientRect(), b = bigBox.getBoundingClientRect();
    const cx = b.left - s.left + b.width / 2, cy = b.top - s.top + b.height * .4;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - .5) * Math.PI * 1.2, v = speed * (.45 + Math.random() * .75);
      motes.push({
        x: cx + (Math.random() - .5) * b.width * .5, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        r: 3 + Math.random() * 6, rot: Math.random() * 6, vr: (Math.random() - .5) * 12,
        c: colors[i % colors.length]!, star: i % 3 !== 0, tw: Math.random() * 6,
      });
    }
    if (!dustFrame) { dustAt = performance.now(); dustFrame = requestAnimationFrame(fall); }
  }
  function fall(now: number) {
    const dt = Math.min(.05, (now - dustAt) / 1000), dpr = Math.min(2, devicePixelRatio || 1);
    dustAt = now;
    const W = Math.round(dust.clientWidth * dpr), H = Math.round(dust.clientHeight * dpr);
    if (dust.width !== W || dust.height !== H) { dust.width = W; dust.height = H; }
    const c = dust.getContext('2d')!;
    c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
    for (const m of motes) {
      m.vy += 1500 * dt; m.vx *= 1 - .8 * dt;
      m.x += m.vx * dt; m.y += m.vy * dt; m.rot += m.vr * dt; m.tw += dt * 14;
      c.globalAlpha = .65 + .35 * Math.sin(m.tw);                                  // twinkle
      c.fillStyle = m.c;
      c.save(); c.translate(m.x, m.y); c.rotate(m.rot); c.beginPath();
      if (m.star) for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? m.r * .42 : m.r; c.lineTo(Math.cos(a) * q, Math.sin(a) * q); }
      else c.arc(0, 0, m.r * .45, 0, 7);
      c.fill(); c.restore();
    }
    c.globalAlpha = 1;
    motes = motes.filter(m => m.y < H / dpr + 20);
    dustFrame = motes.length ? requestAnimationFrame(fall) : 0;
  }
  function stopDust() { cancelAnimationFrame(dustFrame); dustFrame = 0; motes = []; dust.getContext('2d')!.clearRect(0, 0, dust.width, dust.height); }
  const GOLD = ['#ffd400', '#fff6b0', '#ffffff', '#ffb300'];

  function drawBigBox() {
    const cv = $<HTMLCanvasElement>('wardBoxArt'), dpr = Math.min(2, devicePixelRatio || 1), size = cv.clientWidth || 220;
    cv.width = cv.height = Math.round(size * dpr);
    // the box art spans x ±.4u and y -.45u….36u (sprites.ts lootArt): fill about 90% of the canvas, centred
    const c = cv.getContext('2d')!, u = cv.width * 1.1;
    c.clearRect(0, 0, cv.width, cv.height);
    c.save(); c.translate(cv.width / 2, cv.height / 2 + .045 * u); drawLootBox(c, u); c.restore();
  }

  /** the box count in the wardrobe and on the menu button */
  function showBoxes(n: number) {
    $('wardBoxes').textContent = String(n);
    const badge = $('wardBadge');
    badge.textContent = n ? String(n) : ''; badge.hidden = !n;
  }
  /**
   * While boxes are being opened the count behind only goes down, one per box opened; free boxes from duplicates join it when
   * the opening closes (refresh then shows the server's count). Null when nothing is being opened.
   */
  let held: number | null = null;
  /** free boxes won while this opening is up and not opened yet: the next opening spends these before the count behind */
  let freeBank = 0;

  function startOpening(n: number) {
    n = Math.min(n, boxesLeft());
    if (n < 1 || !canOpen()) return;
    const fromFree = Math.min(freeBank, n);
    freeBank -= fromFree;
    held = Math.max(0, (held ?? boxesLeft()) - (n - fromFree));
    showBoxes(held);
    note = ''; taps = 0; count = n; picked = null; fxRun++;
    result.querySelectorAll('.ward-fly, .ward-star').forEach(e => e.remove());
    stage.classList.add('on');
    result.hidden = true; bigBox.hidden = false; $('wardStageClose').hidden = false;
    bigBox.className = 'ward-bigbox idle';
    bigBox.style.removeProperty('--r'); bigBox.style.setProperty('--glow', '0px'); bigBox.style.setProperty('--k', '6');
    $('wardBoxX').textContent = n > 1 ? `×${n}` : '';
    hint.textContent = 'แตะกล่องเพื่อเขย่า · Tap the box to shake it';
    bigBox.setAttribute('aria-label', n > 1 ? `กล่องสุ่ม ${n} กล่อง แตะเพื่อเขย่า` : 'กล่องสุ่ม แตะเพื่อเขย่า');
    drawBigBox();
    bigBox.focus({ preventScroll: true });
    roll();                                                              // the server rolls while the player shakes
  }

  bigBox.onclick = async () => {
    if (taps >= TAPS) return;
    taps++;
    bigBox.classList.remove('idle');
    bigBox.style.setProperty('--k', String(6 + taps * 5));                // harder every tap
    restart(bigBox, 'shake');
    d.beep([523, 659, 784][taps - 1] ?? 784, .09, 'triangle');
    const best = won?.length ? [...won].sort((a, b) => RANK[a.item.rarity] - RANK[b.item.rarity])[0]!.item : null;
    sprinkle(8 + taps * 6, 420 + taps * 110, taps >= 2 && best ? [...GOLD, RARITY_COLOR[best.rarity]] : GOLD);
    // from the second tap the box glows in the colour of the best thing inside
    if (taps >= 2 && best) { bigBox.style.setProperty('--r', RARITY_COLOR[best.rarity]); bigBox.style.setProperty('--glow', `${taps * 10}px`); }
    if (taps < TAPS) { hint.textContent = taps === 1 ? 'อีก 2 ครั้ง · 2 more' : 'อีกครั้งเดียว! · Once more!'; return; }
    hint.textContent = 'กำลังเปิด… · Opening…';
    await opening;
    if (!won) {
      hint.textContent = 'เปิดกล่องไม่สำเร็จ ลองอีกครั้ง · Could not open the box, try again';
      bigBox.className = 'ward-bigbox idle'; taps = 0;
      roll();
      return;
    }
    burst(won);
  };

  function burst(pulls: Pull[]) {
    // new items first, rarest first: that is what the card leads with
    const sorted = [...pulls].sort((a, b) => Number(a.dupe) - Number(b.dupe) || RANK[a.item.rarity] - RANK[b.item.rarity]);
    const best = [...pulls].sort((a, b) => RANK[a.item.rarity] - RANK[b.item.rarity])[0]!.item;
    flash.style.setProperty('--r', RARITY_COLOR[best.rarity]);
    restart(flash, 'go');
    sprinkle(70, 1000, [...GOLD, RARITY_COLOR[best.rarity], RARITY_COLOR[best.rarity]]);
    bigBox.classList.remove('shake'); bigBox.classList.add('open');
    d.beep(best.rarity === 'legendary' ? 1568 : best.rarity === 'epic' ? 1319 : 1047, .25, 'triangle');
    if (best.rarity === 'legendary') setTimeout(() => d.beep(2093, .3, 'triangle'), 160);
    hint.textContent = '';
    setTimeout(() => { bigBox.hidden = true; showResult(sorted); }, 450);
  }

  /* ---------- the result card: new items to look at and wear; duplicates fly into the meter one by one ---------- */
  let shown: Pull[] = [], fxRun = 0;
  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

  function showResult(pulls: Pull[]) {
    const run = ++fxRun;
    const fresh = pulls.filter(p => !p.dupe), dupes = pulls.filter(p => p.dupe), free = pulls.filter(p => p.free).length;
    shown = fresh;
    const won = $('wardWon'), motion = !still.matches && dupes.length > 0;
    $('wardResultTitle').textContent = !dupes.length ? (fresh.length > 1 ? `ได้ของใหม่ ${fresh.length} ชิ้น! · ${fresh.length} new items` : 'ได้ของใหม่! · New item')
      : !fresh.length ? `ได้ของซ้ำ ${dupes.length} ชิ้น · ${dupes.length} duplicate${dupes.length > 1 ? 's' : ''}`
      : `ของใหม่ ${fresh.length} ชิ้น · ของซ้ำ ${dupes.length} ชิ้น`;
    // everything that came out is laid out first (new ones first); the duplicates then fly out of the grid into the meter
    const tiles = motion ? [...fresh, ...dupes] : fresh;
    won.hidden = !tiles.length;
    $('wardPick').hidden = !fresh.length;
    won.classList.toggle('one', tiles.length === 1);
    won.innerHTML = tiles.map((p, i) => p.dupe
      ? `<button type="button" class="dupe" tabindex="-1" aria-hidden="true" style="--r:${RARITY_COLOR[p.item.rarity]}"><canvas></canvas>${nameTag(short(p.item))}</button>`
      : `<button type="button" data-i="${i}" style="--r:${RARITY_COLOR[p.item.rarity]}" aria-pressed="false" aria-label="${esc(p.item.name)}"><canvas></canvas>${nameTag(short(p.item))}</button>`).join('');
    won.querySelectorAll('button').forEach((b, i) => drawThumb(b.querySelector('canvas')!, tiles[i]!.item, false));
    if (fresh.length) pick(0); else picked = null;
    $<HTMLButtonElement>('wardWear').disabled = !fresh.length;

    // the meter as it was before these duplicates, then each one flies in
    const m = $('wardResultMeter'), after = d.current()?.dupes ?? 0, before = after - dupes.length + free * DUPES_PER_BOX, bank = freeBank;
    freeBank += free;                                                    // counted now, shown as each one lands
    m.hidden = !dupes.length && !freeBank;
    resultMeter(m, before, bank);
    result.hidden = false; $('wardStageClose').hidden = true;
    requestAnimationFrame(() => marquee(won));
    setOpenButtons($<HTMLButtonElement>('wardMore1'), $<HTMLButtonElement>('wardMoreMany'), 'เปิดต่อ ');
    (fresh.length ? $('wardWear') : $('wardKeep')).focus({ preventScroll: true });
    if (dupes.length) void flyIntoMeter(run, dupes, before, bank);
  }

  /** the result card's meter: `filled` segments lit, and the free boxes won so far in this batch */
  function resultMeter(m: HTMLElement, filled: number, freeWon: number) {
    meter(m, filled);
    const f = document.createElement('b'); f.className = 'ward-free';
    f.textContent = `ได้กล่องฟรี ${freeWon} กล่อง · ${freeWon} free box${freeWon > 1 ? 'es' : ''}`; f.hidden = !freeWon;
    m.append(f);
  }

  /**
   * Each duplicate leaves its place in the grid and is pulled into the next segment of the meter; a full meter bursts into stars
   * and adds a free box. Then the new items close ranks in the middle.
   */
  async function flyIntoMeter(run: number, dupes: Pull[], start: number, bank: number) {
    const m = $('wardResultMeter'), won = $('wardWon');
    let filled = start, freeWon = bank;
    const live = () => run === fxRun && stage.classList.contains('on');
    if (still.matches) {                                                 // no motion: just the end state
      for (const p of dupes) { if (p.free) freeWon++; filled = p.free ? 0 : filled + 1; }
      resultMeter(m, filled, freeWon); return;
    }
    const speed = Math.max(.45, 1 - dupes.length * .05);                 // a long batch plays faster
    const tiles = [...won.querySelectorAll<HTMLElement>('button.dupe')];
    await sleep(600);                                                    // a moment to see everything that came out
    for (const [k, p] of dupes.entries()) {
      if (!live()) return;
      const tile = tiles[k]!, box = result.getBoundingClientRect(), t = tile.getBoundingClientRect();
      const seg = m.querySelectorAll<HTMLElement>('.ward-meter-bar i')[Math.min(filled, DUPES_PER_BOX - 1)]!, to = seg.getBoundingClientRect();
      const fly = document.createElement('div'); fly.className = 'ward-fly'; fly.style.setProperty('--r', RARITY_COLOR[p.item.rarity]);
      Object.assign(fly.style, { left: `${t.left - box.left}px`, top: `${t.top - box.top}px`, width: `${t.width}px`, height: `${t.height}px` });
      const cv = tile.querySelector('canvas')!.cloneNode() as HTMLCanvasElement;
      cv.getContext('2d')!.drawImage(tile.querySelector('canvas')!, 0, 0);
      fly.append(cv); result.append(fly); tile.style.visibility = 'hidden';
      const dx = to.left + to.width / 2 - (t.left + t.width / 2), dy = to.top + to.height / 2 - (t.top + t.height / 2);
      await fly.animate([{ transform: 'translate(0,0) scale(1)' }, { transform: 'translate(0,-8px) scale(1.08)', offset: .25 }, { transform: `translate(${dx}px,${dy}px) scale(.12)`, opacity: .4 }],
        { duration: 480 * speed, easing: 'cubic-bezier(.5,0,.85,.45)' }).finished;
      fly.remove();
      if (!live()) return;
      filled++;
      seg.classList.add('on'); restart(seg, 'pop');
      d.beep(660 + filled * 110, .06, 'triangle');
      m.querySelector('small')!.textContent = `ของซ้ำ ${filled}/${DUPES_PER_BOX} · ครบ ${DUPES_PER_BOX} ได้กล่องฟรี`;
      if (p.free) {                                                      // full: stars, one more free box, and the meter starts over
        stars(m.querySelector('.ward-meter-bar')!);
        d.beep(1568, .18, 'triangle'); setTimeout(() => d.beep(2093, .22, 'triangle'), 120);
        freeWon++;
        const f = m.querySelector<HTMLElement>('.ward-free')!;
        f.hidden = false; f.textContent = `ได้กล่องฟรี ${freeWon} กล่อง · ${freeWon} free box${freeWon > 1 ? 'es' : ''}`; restart(f, 'pop');
        await sleep(420 * speed);
        if (!live()) return;
        filled = 0;
        m.querySelectorAll('.ward-meter-bar i').forEach(i => i.classList.remove('on'));
        m.querySelector('small')!.textContent = `ของซ้ำ 0/${DUPES_PER_BOX} · ครบ ${DUPES_PER_BOX} ได้กล่องฟรี`;
      } else await sleep(90 * speed);
    }
    if (live()) gather();
  }

  /** the duplicates have gone: the new items slide together into the middle (or the grid closes when nothing new came out) */
  function gather() {
    const won = $('wardWon'), keep = [...won.querySelectorAll<HTMLElement>('button:not(.dupe)')];
    const first = keep.map(b => b.getBoundingClientRect());
    won.querySelectorAll('button.dupe').forEach(b => b.remove());
    if (!keep.length) { won.hidden = true; return; }
    won.classList.toggle('one', keep.length === 1);
    keep.forEach((b, i) => {                                             // FLIP: from where it was to where it now sits
      const last = b.getBoundingClientRect(), f = first[i]!;
      b.animate([{ transform: `translate(${f.left - last.left}px,${f.top - last.top}px) scale(${f.width / last.width})`, transformOrigin: 'top left' }, { transform: 'none', transformOrigin: 'top left' }],
        { duration: 420, easing: 'cubic-bezier(.2,.8,.3,1)' });
    });
    if (keep.length === 1) drawThumb(keep[0]!.querySelector('canvas')!, shown[0]!.item, false);   // bigger tile: redraw sharp
    requestAnimationFrame(() => marquee(won));
  }

  /** a burst of little stars out of `el`, inside the result card */
  function stars(el: HTMLElement) {
    const box = result.getBoundingClientRect(), r = el.getBoundingClientRect();
    const x = r.left + r.width / 2 - box.left, y = r.top + r.height / 2 - box.top;
    for (let i = 0; i < 14; i++) {
      const s = document.createElement('span'); s.className = 'ward-star';
      s.style.left = `${x + (Math.random() - .5) * r.width}px`; s.style.top = `${y}px`;
      s.style.background = ['#ffd400', '#ffffff', '#fff6b0'][i % 3]!;
      result.append(s);
      const a = -Math.PI / 2 + (Math.random() - .5) * Math.PI * 1.3, v = 40 + Math.random() * 50;
      s.animate([{ transform: 'translate(0,0) scale(.4) rotate(0)', opacity: 1 }, { transform: `translate(${Math.cos(a) * v}px,${Math.sin(a) * v}px) scale(1) rotate(${(Math.random() - .5) * 300}deg)`, opacity: 0 }],
        { duration: 650 + Math.random() * 250, easing: 'cubic-bezier(.2,.7,.4,1)' }).finished.then(() => s.remove(), () => s.remove());
    }
  }

  /** the item the Wear button puts on (rarest first; tap another to choose it) */
  function pick(i: number) {
    const item = shown[i]!.item;
    picked = item;
    $('wardWon').querySelectorAll<HTMLButtonElement>('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.i === String(i))));
    const el = $('wardPick');
    el.style.setProperty('--r', RARITY_COLOR[item.rarity]);
    el.innerHTML = `<small>${esc(RARITY_LABEL[item.rarity])}</small><b>${esc(item.name)}</b><span>${esc(SLOT_LABEL[item.slot])}</span>`;
  }

  function closeStage() { fxRun++; held = null; freeBank = 0; stopDust(); stage.classList.remove('on'); refresh(); $<HTMLButtonElement>('wardOpen').focus({ preventScroll: true }); }

  $('wardWon').onclick = e => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-i]');
    if (b) pick(Number(b.dataset.i));
  };
  $('wardWear').onclick = () => { if (!picked) return; tab = picked.slot; void wear(picked.slot, picked.id); closeStage(); };
  $('wardKeep').onclick = () => { if (picked) tab = picked.slot; closeStage(); };
  // leaving mid-shake is fine: whatever the server already opened is in the grid
  $('wardStageClose').onclick = () => closeStage();
  $('wardMore1').onclick = () => startOpening(1);
  $('wardMoreMany').onclick = () => startOpening(OPEN_MAX);
  $('wardOpen').onclick = () => startOpening(1);
  $('wardOpenMany').onclick = () => startOpening(OPEN_MAX);

  return {
    refresh,
    open() { stopDust(); trying = {}; stage.classList.remove('on'); refresh(); paintChests(); cancelAnimationFrame(timer); animate(); },
    close() { held = null; freeBank = 0; stopDust(); stage.classList.remove('on'); refresh(); cancelAnimationFrame(timer); },
    /** Escape while opening: keep what came out (or leave mid-shake). True when the stage used the key. */
    escape() {
      if (!stage.classList.contains('on')) return false;
      $(result.hidden ? 'wardStageClose' : 'wardKeep').click();
      return true;
    },
  };
}
