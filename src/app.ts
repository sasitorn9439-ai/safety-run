import { RULES, type Action } from '../shared/sim.js';
import { SEASON_PRIZES } from '../shared/seasons.js';
import { api, isFinalFinishError, type BoardResp, type FinishResp, type StartResp } from './lib/api.js';
import { avImg } from './lib/avatar.js';
import { Sfx } from './lib/audio.js';
import { $, digitsOnly, esc } from './lib/dom.js';
import { LS } from './lib/storage.js';
import { Game, type GameState, type Pending, type Session } from './game/game.js';
import { createRenderer, type GameRenderer } from './render/index.js';
import { Hud } from './ui/hud.js';
import { Tally } from './ui/tally.js';
import { mountWardrobe } from './ui/wardrobe.js';
import { EMPTY_WARDROBE, cosmetic, lookOf, parseWardrobe, type Wardrobe } from './cosmetics/wardrobe.js';
import { applyDom, getLang, mountLangSwitch, onLang, t } from './i18n/index.js';
import { avNameL as avName, tr } from './i18n/content.js';

const OVERLAYS = ['menu', 'over', 'quiz', 'done', 'boardOv', 'avOv', 'pauseOv'] as const;
/** cosmetics are kept on this device */
type OverlayId = (typeof OVERLAYS)[number];
const show = (id: OverlayId | null) => { for (const o of OVERLAYS) $(o).classList.toggle('on', o === id); };

/** what an API error code says to the player, in the current language */
const errText = (code?: string) => {
  const d = t();
  return code === 'bad_id' ? d.errBadId : code === 'no_name' ? d.errNoName : code === 'busy' ? d.errBusy : d.errServer;
};

export async function startApp() {
  const sfx = new Sfx();
  applyDom();                                           // the page's static text in the saved language
  mountLangSwitch($('langSwitch'), () => sfx.beep(880, .05, 'triangle'));
  const { renderer, canvas } = await createRenderer($<HTMLCanvasElement>('c'));
  const hud = new Hud();
  const tally = new Tally({
    card: $('over').querySelector<HTMLElement>('.card')!,
    score: $('sScore'), scoreBox: $('sScoreBox'), dist: $('sDist'),
    coins: $('sCoins'), coinImg: $<HTMLImageElement>('sCoinImg'),
    rows: {
      coin: { row: $('sCoinRow'), pts: $('sCoinPts') }, ppe: { row: $('sPpeRow'), pts: $('sPpePts') },
      near: { row: $('sNearRow'), pts: $('sNearPts') }, extra: { row: $('sExtraRow'), pts: $('sExtraPts') },
    },
    loot: { row: $('sLootRow'), n: $('sLoot') },
  }, sfx.beep);
  const pauseBtn = $('pauseBtn'), skipTut = $('skipTut');

  /* ---------- wardrobe: loot boxes picked up on runs, cosmetics worn by the mascot ----------
     The server holds it all (boxes come from verified replays, the server rolls them), so nothing on the device can add a box or an item. */
  let wardState: Wardrobe | null = null, wardId = '';
  const applyWardrobe = () => {
    const look = lookOf(wardState ?? EMPTY_WARDROBE);
    renderer.setLook(look);
    game.invalidate();
    const vector = look.figure?.vector;
    // An idle menu only redraws when invalidated. Draw again once the lazy art replaces the fallback.
    if (renderer.mascot === 'flat' && vector && !vector.frames) {
      void vector.load().then(frames => { if (frames) game.invalidate(); });
    }
    wardrobe.refresh();
  };
  const wardCall = async (body: Record<string, unknown>) => {
    const id = wardId, r = await api<Wardrobe & { items?: { id: string; dupe?: boolean; free?: boolean }[] }>('/api/wardrobe', { id, ...body });
    if (!r.ok || id !== wardId) return null;
    wardState = parseWardrobe(r);
    applyWardrobe();
    return r;
  };
  const loadWardrobe = (id: string) => { wardId = id; return wardCall({}).catch(() => null); };
  const wardrobe = mountWardrobe({
    current: () => wardState,
    open: async n => {
      const r = await wardCall({ action: 'open', n });
      const pulls = (r?.items ?? []).flatMap(p => { const item = cosmetic(p.id); return item ? [{ item, dupe: !!p.dupe, free: !!p.free }] : []; });
      return pulls.length ? pulls : null;
    },
    wear: async (slot, item) => { await wardCall({ action: 'equip', slot, item }).catch(() => null); },
    beep: sfx.beep,
  });
  wardrobe.refresh();

  const tutorialSeen = new Set<string>();
  const tutorialKey = (id: string) => `srTutorialSeen:${id}`;

  const game: Game = new Game(sfx, renderer, hud, {
    onState(s: GameState, previous: GameState) {
      const id = game.sess?.id;
      if (id && previous === 'tutor' && s === 'play') {
        tutorialSeen.add(id);
        LS.set(tutorialKey(id), true);
      }
      pauseBtn.style.display = s === 'play' ? 'grid' : 'none';
      skipTut.style.display = s === 'tutor' ? 'block' : 'none';
    },
    onCrash,
    onBonus: askBonusQuiz,
    onBonusClosed: () => { if (game.state === 'play' && $('quiz').classList.contains('on')) show(null); },
  });

  /* ---------- run lifecycle ---------- */
  function begin(first: boolean) {
    show(null);
    game.pb = LS.get<number>('srPb') ?? 0;          // the distance to beat, shown in the HUD
    game.begin(first);
  }

  function onCrash() {
    const h = game.hazardInfo(), s = game.score, en = getLang() === 'en';
    $('hTitle').textContent = en ? h.en : h.th; $('hTip').textContent = en ? h.tipEn : h.tip;
    $('hTitleEn').hidden = $('hTipEn').hidden = true;
    $('sScore').textContent = '0'; $('sDist').textContent = '0'; tally.stop();
    const best = Math.max(LS.get<number>('srPb') ?? 0, game.dist);
    LS.set('srPb', best);
    void showGap(s);
    $('chanceBtn').textContent = t().chance(s);
    $('chanceBtn').style.display = game.revives || !game.lastHit ? 'none' : 'block';
    if (game.sess && game.run) LS.set('srPending', { ...game.sess, score: s, ticks: game.run.tick, inputs: game.inputs, rules: RULES } satisfies Pending);
    const run = { score: s, dist: game.dist, coins: game.coins, earned: game.earned, coinSrc: $<HTMLImageElement>('hudCoinImg').src, loot: game.loot };
    setTimeout(() => { show('over'); tally.play(run); }, 350);
  }

  /* ---------- how to play, prizes and what's new: modals over the menu ---------- */
  function menuModal(name: 'how' | 'news' | 'prize' | 'ward', onClose = () => {}, onOpen = () => {}) {
    const ov = $(name + 'Ov');
    const close = () => { ov.classList.remove('on'); $(name + 'Btn').focus(); onClose(); };
    const open = () => { onOpen(); ov.classList.add('on'); $(name + 'Close').focus({ preventScroll: true }); ov.querySelector('.card')!.scrollTop = 0; };
    $(name + 'Btn').onclick = open;
    $(name + 'Close').onclick = close;
    ov.onclick = e => { if (e.target === ov) close(); };   // a tap on the dimmed backdrop closes it
    return { ov, open, close };
  }
  const how = menuModal('how'), prize = menuModal('prize'), ward = menuModal('ward', wardrobe.close, wardrobe.open);
  // what's new opens by itself once per version
  const newsVersion = $('newsOv').dataset.version!;
  const news = menuModal('news', () => LS.set('srNewsSeen', newsVersion));
  if (LS.get<string>('srNewsSeen') !== newsVersion) news.open();

  /** "N points to rank k": how close the run was to the next place on the board (a nudge to try once more) */
  async function showGap(score: number) {
    const el = $('overGap');
    el.classList.remove('on');
    const id = game.sess?.id;
    if (!id) return;
    try {
      const r = await api<BoardResp>('/api/leaderboard?id=' + encodeURIComponent(id));
      if (!r.top || game.state !== 'over') return;
      const above = r.top.map((e, i) => ({ ...e, rank: i + 1 })).filter(e => e.score > score);
      const next = above[above.length - 1];
      let html = '';
      const d = t();
      if (!next) html = r.top.length ? d.gapTop : '';
      else if (next.me) html = d.gapSelf(next.score - score, next.rank);
      else html = d.gapRank(next.score - score, next.rank, r.season?.kind === 'active' && next.rank <= SEASON_PRIZES.length);
      if (html) { el.innerHTML = html; el.classList.add('on'); }
    } catch { /* the board is a nicety, never block the crash screen */ }
  }

  skipTut.onclick = e => { e.stopPropagation(); if (game.state === 'tutor') game.startReal(); };
  skipTut.addEventListener('pointerdown', e => e.stopPropagation());

  /* ---------- pause / main menu ---------- */
  // The game only steps while state === 'play', so pausing adds no ticks and the server replay is unchanged.
  let leaveAsk = false;
  function pauseRun() {
    if (!game.pause()) return;
    leaveAsk = false; swiping = false;
    $('pScore').textContent = String(game.score); $('pDist').textContent = String(game.dist); $('pMsg').textContent = '';
    $('pMenu').textContent = t().mainMenu;
    show('pauseOv');
  }
  function resumeRun() {
    if (game.state !== 'pause') return;
    // paused on the result of a bonus question (Esc there): that is the same as tapping "วิ่งต่อ"
    if ($('quiz').classList.contains('on')) { show(null); game.continueRun(); return; }
    // paused with a bonus question still unanswered: the run is frozen on it anyway, so straight back to the question, no countdown
    const pb = game.run?.view().pendingBonus;
    if (pb) { askBonusQuiz(pb); game.continueRun(); return; }
    show(null); game.resume();
  }
  function goMenu() { game.toMenu(); $('loginMsg').textContent = ''; show('menu'); }
  function leaveRun() {
    LS.set('srPending', null); game.sess = null; goMenu();
    $('loginMsg').textContent = t().leftRun;
  }
  pauseBtn.onclick = pauseRun;
  pauseBtn.addEventListener('pointerdown', e => e.stopPropagation());
  $('pResume').onclick = resumeRun;
  $('pMenu').onclick = () => {
    if (!leaveAsk) {
      leaveAsk = true;
      $('pMsg').textContent = t().leaveWarn;
      $('pMenu').textContent = t().leaveConfirm;
      return;
    }
    leaveRun();
  };
  $('homeBtn').onclick = goMenu;
  document.addEventListener('visibilitychange', () => { if (document.hidden) pauseRun(); });
  addEventListener('blur', pauseRun);

  /* ---------- input: swipe + keyboard ---------- */
  const shell = $('shell');
  let sx = 0, sy = 0, swiping = false;
  const playing = () => game.state === 'play' || game.state === 'tutor';
  shell.addEventListener('pointerdown', e => { if (!playing()) return; sx = e.clientX; sy = e.clientY; swiping = true; });
  shell.addEventListener('pointermove', e => {
    if (!swiping) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 26) return;
    swiping = false;
    game.input(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy < 0 ? 'up' : 'down');
  });
  addEventListener('pointerup', () => { swiping = false; });
  addEventListener('pointercancel', () => { swiping = false; });
  const KEYS: Record<string, Action> = { arrowleft: 'left', a: 'left', arrowright: 'right', d: 'right', arrowup: 'up', w: 'up', ' ': 'up', arrowdown: 'down', s: 'down' };
  addEventListener('keydown', e => {
    if (e.key === 'Escape' && ward.ov.classList.contains('on') && wardrobe.escape()) return;
    for (const m of [news, how, prize, ward]) if (e.key === 'Escape' && m.ov.classList.contains('on')) { m.close(); return; }
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    const k = e.key.toLowerCase();
    if (k === 'escape' || k === 'p') {
      if (game.state === 'play' || game.state === 'resume') pauseRun(); else if (game.state === 'pause') resumeRun();
      return;
    }
    const action = KEYS[k];
    if (!action || !playing()) return;
    game.input(action);
    e.preventDefault();
  });
  addEventListener('beforeunload', e => {
    if (game.state === 'play' || game.state === 'pause' || game.state === 'resume' || game.state === 'tutor') { e.preventDefault(); e.returnValue = ''; }
  });

  /* ---------- login / start ----------
     The padlock beside the employee ID is the login: locking loads that player's wardrobe (so the mascot wears their
     look before the run), unlocking frees the field for another ID. Start locks it first if nobody tapped the padlock. */
  const empIn = $<HTMLInputElement>('empId'), lockBtn = $<HTMLButtonElement>('lockBtn');
  const typedId = () => empIn.value.trim().toUpperCase().replace(/\s+/g, '');
  let lockedId = '', locking: { id: string; done?: Promise<boolean> } | null = null;
  function setLock(state: 'open' | 'busy' | 'locked') {
    lockBtn.dataset.state = state;
    lockBtn.setAttribute('aria-pressed', String(state === 'locked'));
    lockBtn.setAttribute('aria-label', state === 'locked' ? t().lockLocked : state === 'busy' ? t().lockBusy : t().lockOpen);
    empIn.readOnly = state !== 'open';
  }
  function clearWardrobe() {
    wardId = ''; wardState = null;
    applyWardrobe();
  }
  function shakeLock() { lockBtn.classList.remove('shake'); void lockBtn.offsetWidth; lockBtn.classList.add('shake'); }
  /** logs `id` in: fetches its wardrobe and wears it; false (with a message unless quiet) when the server says no */
  function lockIn(id: string, quiet = false): Promise<boolean> {
    if (lockedId === id) return Promise.resolve(true);
    if (locking?.id === id && locking.done) return locking.done;
    const msg = $('loginMsg'), me: { id: string; done?: Promise<boolean> } = { id };
    msg.textContent = ''; wardId = id; setLock('busy'); locking = me;
    me.done = (async () => {
      let r: Awaited<ReturnType<typeof api<Wardrobe>>> | null = null;
      try { r = await api<Wardrobe>('/api/wardrobe', { id }); } catch { /* no connection */ }
      if (locking !== me) return lockedId === id;               // unlocked or another ID locked meanwhile
      locking = null;
      if (r?.ok) {
        wardState = parseWardrobe(r);
        applyWardrobe();
        lockedId = id; setLock('locked');
        return true;
      }
      clearWardrobe(); setLock('open'); shakeLock();
      if (!quiet) msg.textContent = r ? errText(r.error) : t().noConn;
      return false;
    })();
    return me.done;
  }
  function unlock() {
    locking = null; lockedId = '';
    clearWardrobe(); setLock('open');
    $('loginMsg').textContent = '';
    empIn.focus(); empIn.select();
  }
  digitsOnly(empIn);
  lockBtn.onclick = () => {
    if (lockBtn.dataset.state !== 'open') { unlock(); return; }
    const id = typedId();
    if (!/^[0-9]{1,4}$/.test(id)) { $('loginMsg').textContent = errText('bad_id'); shakeLock(); empIn.focus(); return; }   // the server decides 4 digits vs an older id
    void lockIn(id);
  };
  { const lp = LS.get<{ id?: string }>('srPlayer'); if (lp?.id) { empIn.value = lp.id; void lockIn(lp.id, true); } }

  async function startRun(id: string, msg: HTMLElement, btn: HTMLButtonElement, label: () => string) {
    sfx.unlock();
    btn.disabled = true; btn.textContent = t().checking; msg.textContent = '';
    try {
      const r = await api<StartResp>('/api/start', { id });
      if (r.ok && r.token) {
        LS.set('srPlayer', { id, avatar: r.avatar });
        game.sess = { id, token: r.token, run: r.run!, runNo: r.runNo!, avatar: r.avatar!, seed: r.seed!, worn: wardState?.equipped } satisfies Session;
        LS.set('srPending', { ...game.sess, score: 0 });
        game.runLabel = t().runLabel(r.runNo!);
        if (r.runNo === 1) {
          $('avBig').innerHTML = avImg(r.avatar, 120, wardState?.equipped); $('avName').textContent = avName(r.avatar); show('avOv');
          $('avGo').onclick = () => begin(!tutorialSeen.has(id) && LS.get<boolean>(tutorialKey(id)) !== true);
        } else begin(false);
      } else if (r.error === 'used') msg.textContent = t().used(r.max!, r.best);
      else msg.textContent = errText(r.error);
    } catch { msg.textContent = t().noConn; }
    btn.disabled = false; btn.textContent = label();
  }
  $('login').onsubmit = e => {
    e.preventDefault();
    const id = typedId(), m = $('loginMsg'), btn = $<HTMLButtonElement>('startBtn');
    if (!/^[0-9]{1,4}$/.test(id)) { m.textContent = errText('bad_id'); shakeLock(); return; }   // the server decides 4 digits vs an older id
    if (btn.disabled) return;
    void (async () => {
      // not logged in yet (or logged in as someone else): lock the typed ID first so the run starts in their look
      if (lockedId !== id) {
        btn.disabled = true;
        const ok = await lockIn(id);
        btn.disabled = false;
        if (!ok) return;
      }
      await startRun(id, m, btn, () => t().start);
    })();
  };

  /* ---------- language switch: the static text is redone by applyDom; this redoes what code wrote ---------- */
  onLang(() => {
    setLock((lockBtn.dataset.state as 'open' | 'busy' | 'locked') ?? 'open');
    $('loginMsg').textContent = '';
    wardrobe.refresh();
    renderer.rebuild(); hud.refreshArt(); game.invalidate();          // the sign on the low scaffold has words on it
  });

  /* ---------- leaderboard ---------- */
  const boardRow = (e: BoardResp['top'][number], i: number, seasonal: boolean) =>
    `<li${e.me ? ' style="outline:2px solid #ffd400"' : ''}><span class="n">${seasonal && i < SEASON_PRIZES.length ? `<span class="medal m${i + 1}">${i + 1}</span>` : i + 1}</span>${avImg(e.avatar, 36, e.look)}<span class="who">${esc(avName(e.avatar))}${e.me ? esc(t().you) : ''}</span><span class="sc">${e.score}</span></li>`;
  const boardHtml = (list: BoardResp['top'], seasonal: boolean) => list.map((entry, index) => boardRow(entry, index, seasonal)).join('')
    || `<li><span></span><span></span><span>${esc(t().noScores)}</span><span></span></li>`;
  async function loadBoard(target: string, meId?: string): Promise<Partial<BoardResp>> {
    try {
      const r = await api<BoardResp>('/api/leaderboard' + (meId ? '?id=' + encodeURIComponent(meId) : ''));
      $(target).innerHTML = boardHtml(r.top || [], r.season?.kind === 'active');
      return r;
    } catch { $(target).innerHTML = `<li><span></span><span>${esc(t().boardFail)}</span><span></span></li>`; return {}; }
  }
  $('boardBtn').onclick = async () => {
    show('boardOv'); $('boardTotal').textContent = t().loading;
    $('boardSeason').textContent = ''; $('boardPrizes').textContent = '';
    $('boardList').innerHTML = '';
    const r = await loadBoard('boardList');
    $('boardTotal').textContent = r.total != null ? t().boardTotal(r.total) : '';
    if (!r.season) return;
    const dates = new Intl.DateTimeFormat(getLang(), { dateStyle: 'medium', timeZone: 'Asia/Bangkok' });
    const start = new Date(r.season.startsAt);
    $('boardSeason').textContent = r.season.kind === 'upcoming'
      ? t().seasonUpcoming(dates.format(start))
      : t().seasonDates(r.season.number, dates.formatRange(start, new Date(Date.parse(r.season.endsAt) - 1)));
    $('boardPrizes').textContent = t().seasonPrizes(SEASON_PRIZES.join(' / '));
  };
  $('boardBack').onclick = () => show('menu');

  /* ---------- submit score ---------- */
  async function submit() {
    const p = LS.get<Pending>('srPending');
    if (!p) return;
    show('done');
    const ag = $<HTMLButtonElement>('againBtn');
    ag.style.display = 'none'; $('homeBtn').style.display = 'none';
    $('doneHead').textContent = t().submitting; $('doneScore').textContent = t().pts(p.score); $('doneRank').textContent = avName(p.avatar);
    $('doneMsg').textContent = ''; $('retryBtn').style.display = 'none'; $('doneBoard').innerHTML = '';
    try {
      const r = await api<FinishResp>('/api/finish', { id: p.id, run: p.run, token: p.token, ticks: p.ticks, inputs: p.inputs, rules: p.rules ?? 1 });
      if (r.ok) {
        LS.set('srPending', null); game.sess = null;
        void loadWardrobe(p.id);                        // boxes picked up on this run count now that it verified
        $('doneHead').textContent = t().submittedRun(r.used!); $('doneScore').textContent = t().thisRun(r.score!);
        $('doneRank').textContent = t().bestOf(avName(p.avatar), r.best!);
        ag.textContent = t().playAgain; ag.style.display = 'block';
        ag.onclick = () => void startRun(p.id, $('doneMsg'), ag, () => t().playAgain);
        $('homeBtn').style.display = 'block';
        const b = await loadBoard('doneBoard', p.id);
        if (b.rank && b.best != null && b.total != null) {
          const seasonal = b.season?.kind === 'active';
          $('doneRank').textContent = t().bestRank(avName(p.avatar), b.best, b.rank, b.total, seasonal);
          const prize = SEASON_PRIZES[b.rank - 1];
          if (seasonal && prize) $('doneMsg').innerHTML = `<div class="win">${esc(t().winNote(b.rank, prize))}</div>`;
        }
      } else if (isFinalFinishError(r)) {
        LS.set('srPending', null); game.sess = null;
        $('doneHead').textContent = t().rejectedHead; $('doneMsg').textContent = t().rejected;
        ag.textContent = t().backStart; ag.style.display = 'block'; ag.onclick = goMenu;
      } else throw new Error('server');
    } catch {
      $('doneHead').textContent = t().notYetHead;
      $('doneMsg').textContent = t().notYet;
      $('retryBtn').style.display = 'block';
    }
  }
  $('retryBtn').onclick = () => void submit();
  $('endBtn').onclick = () => void submit();

  /* ---------- second-chance quiz ---------- */
  function askQuiz() {
    if (!game.run) return;
    const { prompt, options } = game.run.quiz, ans = game.run.correct;
    $('qHead').textContent = t().quizHead;
    $('qLv').style.display = 'none';
    $('qText').textContent = tr(prompt); $('qEn').textContent = ''; $('qNext').style.display = 'none';
    $('qOpts').innerHTML = options.map((x, i) => `<button class="opt" data-i="${i}">${esc(tr(x))}</button>`).join('');
    $('qOpts').onclick = e => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('.opt');
      if (!b || $('qNext').style.display === 'block') return;
      const i = +b.dataset.i!, ok = i === ans;
      [...$('qOpts').children].forEach((c, j) => { if (j === ans) c.classList.add('ok'); else if (j === i) c.classList.add('no'); });
      sfx.beep(ok ? 990 : 140, .2, ok ? 'triangle' : 'sawtooth');
      const n = $('qNext');
      n.style.display = 'block';
      n.textContent = ok ? t().quizOk : t().quizNo;
      n.onclick = () => { if (ok) { if (game.answer(i)) show(null); } else void submit(); };
    };
    show('quiz');
  }
  $('chanceBtn').onclick = () => { if (!game.revives && game.lastHit) askQuiz(); };

  /* ---------- bonus-coin quiz: right or wrong, the run just continues ---------- */
  function askBonusQuiz(quiz: { prompt: string; options: string[]; correct: number; reward: number }) {
    $('qHead').textContent = t().bonusHead(quiz.reward);
    $('qLv').style.display = 'none';
    $('qText').textContent = tr(quiz.prompt); $('qEn').textContent = ''; $('qNext').style.display = 'none';
    $('qOpts').innerHTML = quiz.options.map((x, i) => `<button class="opt" data-i="${i}">${esc(tr(x))}</button>`).join('');
    $('qOpts').onclick = e => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('.opt');
      if (!b || $('qNext').style.display === 'block') return;
      const i = +b.dataset.i!, ok = i === quiz.correct;
      if (!game.answerBonus(i)) return;
      [...$('qOpts').children].forEach((c, j) => { if (j === quiz.correct) c.classList.add('ok'); else if (j === i) c.classList.add('no'); });
      sfx.beep(ok ? 990 : 140, .2, ok ? 'triangle' : 'sawtooth');
      const n = $('qNext');
      n.style.display = 'block';
      n.textContent = ok ? t().bonusOk(quiz.reward) : t().bonusNo;
      n.onclick = () => { show(null); game.continueRun(); };
    };
    show('quiz');
  }

  /* ---------- boot ---------- */
  // handy for poking at the game from the browser console while developing
  if (import.meta.env.DEV) Object.assign(window, { __sr: { game, renderer, hud,
    /** local only (the dev server's /api/dev-boxes; production has no such route): __sr.boxes(20) */
    boxes: async (n = 10) => { if (!wardId) return 'ใส่รหัสพนักงานแล้วกดปุ่มกุญแจก่อน'; await api('/api/dev-boxes', { id: wardId, n }); await loadWardrobe(wardId); return wardState?.boxes; },
  } });
  const ro = new ResizeObserver(() => { renderer.resize(); game.invalidate(); });
  ro.observe(canvas);
  let frames = 0;
  const loop = (t: number) => { frames++; game.tick(t); requestAnimationFrame(loop); };
  if (new URLSearchParams(location.search).has('debug')) debugOverlay(renderer, () => frames);
  renderer.resize(); game.invalidate();
  requestAnimationFrame(loop);

  // sprites contain Thai text: redraw them once the web font is really there
  const fonts = ['800 20px Kanit', '600 20px Kanit', '400 20px Kanit'].map(f => document.fonts.load(f).catch(() => []));
  void Promise.all(fonts).then(() => document.fonts.ready).then(() => { renderer.rebuild(); hud.refreshArt(); game.invalidate(); });

  // a run that was open when the page closed: submit it, or report it as counted
  const p = LS.get<Pending>('srPending');
  if (p && !p.run) LS.set('srPending', null);
  else if (p && p.token) {
    if (p.score > 0) void submit();
    else { LS.set('srPending', null); $('loginMsg').textContent = t().prevClosed; }
  }
}

/** `?debug` shows which renderer is in use and the real frame rate: handy for comparing devices (`?renderer=canvas` forces the fallback). */
function debugOverlay(renderer: GameRenderer, frames: () => number) {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;left:6px;bottom:6px;z-index:99;padding:3px 7px;border-radius:6px;background:rgba(0,0,0,.7);color:#7fe3ff;font:12px/1.3 ui-monospace,monospace;pointer-events:none';
  document.body.appendChild(el);
  let last = performance.now(), n = frames();
  setInterval(() => {
    const now = performance.now(), f = frames();
    el.textContent = `${renderer.kind} · ${renderer.mascot} · ${Math.round((f - n) * 1000 / (now - last))} fps · ×${renderer.renderScale}`;
    last = now; n = f;
  }, 500);
}
