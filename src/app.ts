import { avName } from '../shared/avatar.js';
import type { Action } from '../shared/sim.js';
import { api, isFinalFinishError, type BoardResp, type FinishResp, type StartResp } from './lib/api.js';
import { avImg } from './lib/avatar.js';
import { Sfx } from './lib/audio.js';
import { $, esc } from './lib/dom.js';
import { LS } from './lib/storage.js';
import { Game, type GameState, type Pending, type Session } from './game/game.js';
import { createRenderer, type GameRenderer } from './render/index.js';
import { Hud } from './ui/hud.js';

/** this many places on the board win a prize */
const PRIZE_RANKS = 7;
const OVERLAYS = ['menu', 'over', 'quiz', 'done', 'boardOv', 'avOv', 'pauseOv'] as const;
type OverlayId = (typeof OVERLAYS)[number];
const show = (id: OverlayId | null) => { for (const o of OVERLAYS) $(o).classList.toggle('on', o === id); };

const ERR: Record<string, string> = {
  bad_id: 'รหัสพนักงานไม่ถูกต้อง (ตัวอักษร/ตัวเลข 3–15 ตัว) · Invalid employee ID',
  no_name: 'กรุณากรอกชื่อ · Please enter your name',
  busy: 'มีการเริ่มเล่นรหัสนี้พร้อมกันจากอีกเครื่อง ลองใหม่ · Try again',
  server: 'ระบบขัดข้อง ลองใหม่อีกครั้ง · Server error, try again',
};

export async function startApp() {
  const sfx = new Sfx();
  const { renderer, canvas } = await createRenderer($<HTMLCanvasElement>('c'));
  const hud = new Hud();
  const pauseBtn = $('pauseBtn'), skipTut = $('skipTut');

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
    const h = game.hazardInfo(), s = game.score;
    $('hTitle').textContent = h.th; $('hTitleEn').textContent = h.en; $('hTip').textContent = h.tip; $('hTipEn').textContent = h.tipEn;
    $('sScore').textContent = String(s); $('sDist').textContent = String(game.dist);
    const best = Math.max(LS.get<number>('srPb') ?? 0, game.dist);
    LS.set('srPb', best);
    void showGap(s);
    $('chanceBtn').textContent = `ตอบคำถามให้ถูก รักษา ${s} คะแนนไว้ แล้ววิ่งต่อ (ได้ 1 ครั้ง)`;
    $('chanceBtn').style.display = game.revives || !game.lastHit ? 'none' : 'block';
    if (game.sess && game.run) LS.set('srPending', { ...game.sess, score: s, ticks: game.run.tick, inputs: game.inputs } satisfies Pending);
    setTimeout(() => show('over'), 350);
  }

  /* ---------- how to play and what's new: modals over the menu ---------- */
  function menuModal(name: 'how' | 'news', onClose = () => {}) {
    const ov = $(name + 'Ov');
    const close = () => { ov.classList.remove('on'); $(name + 'Btn').focus(); onClose(); };
    const open = () => { ov.classList.add('on'); $(name + 'Close').focus({ preventScroll: true }); ov.querySelector('.card')!.scrollTop = 0; };
    $(name + 'Btn').onclick = open;
    $(name + 'Close').onclick = close;
    ov.onclick = e => { if (e.target === ov) close(); };   // a tap on the dimmed backdrop closes it
    return { ov, open, close };
  }
  const how = menuModal('how');
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
      const t = above[above.length - 1];
      let html = '';
      if (!t) html = r.top.length ? 'คะแนนรอบนี้สูงกว่าทุกคนบนอันดับ <b>เป็นที่ 1</b> แล้ว!' : '';
      else if (t.me) html = `อีก <b>${t.score - score}</b> คะแนน จะทำลายสถิติของคุณเอง (อันดับ ${t.rank})`;
      else html = `เหลืออีก <b>${t.score - score}</b> คะแนน ถึงอันดับ <b>${t.rank}</b>${t.rank <= PRIZE_RANKS ? ' ซึ่งได้รางวัล' : ''}`;
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
    $('pMenu').textContent = 'เมนูหลัก · Main menu';
    show('pauseOv');
  }
  function resumeRun() { if (game.state === 'pause') { show(null); game.resume(); } }
  function goMenu() { game.toMenu(); $('loginMsg').textContent = ''; show('menu'); }
  function leaveRun() {
    LS.set('srPending', null); game.sess = null; goMenu();
    $('loginMsg').textContent = 'ออกจากรอบก่อนหน้าแล้ว นับเป็น 1 ครั้ง · Previous run was left and counted';
  }
  pauseBtn.onclick = pauseRun;
  pauseBtn.addEventListener('pointerdown', e => e.stopPropagation());
  $('pResume').onclick = resumeRun;
  $('pMenu').onclick = () => {
    if (!leaveAsk) {
      leaveAsk = true;
      $('pMsg').textContent = 'ออกตอนนี้ คะแนนรอบนี้จะไม่ถูกบันทึก และนับเป็น 1 ครั้ง · This run will not be scored';
      $('pMenu').textContent = 'ยืนยันออกจากรอบนี้ · Confirm leave';
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
    for (const m of [news, how]) if (e.key === 'Escape' && m.ov.classList.contains('on')) { m.close(); return; }
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

  /* ---------- login / start ---------- */
  { const lp = LS.get<{ id?: string }>('srPlayer'); if (lp) ($('empId') as HTMLInputElement).value = lp.id || ''; }

  async function startRun(id: string, msg: HTMLElement, btn: HTMLButtonElement, label: string) {
    sfx.unlock();
    btn.disabled = true; btn.textContent = 'กำลังตรวจสอบสิทธิ์…'; msg.textContent = '';
    try {
      const r = await api<StartResp>('/api/start', { id });
      if (r.ok && r.token) {
        LS.set('srPlayer', { id, avatar: r.avatar });
        game.sess = { id, token: r.token, run: r.run!, runNo: r.runNo!, avatar: r.avatar!, seed: r.seed! } satisfies Session;
        LS.set('srPending', { ...game.sess, score: 0 });
        game.runLabel = `รอบที่ ${r.runNo} · GO!`;
        if (r.runNo === 1) {
          $('avBig').innerHTML = avImg(r.avatar, 120); $('avName').textContent = avName(r.avatar); show('avOv');
          $('avGo').onclick = () => begin(!tutorialSeen.has(id) && LS.get<boolean>(tutorialKey(id)) !== true);
        } else begin(false);
      } else if (r.error === 'used') msg.textContent = `รหัสนี้เล่นครบ ${r.max} ครั้งแล้ว${r.best != null ? ` · คะแนนดีที่สุด ${r.best}` : ''}`;
      else msg.textContent = ERR[r.error ?? ''] ?? ERR.server!;
    } catch { msg.textContent = 'เชื่อมต่อไม่ได้ ตรวจสอบอินเทอร์เน็ต · No connection'; }
    btn.disabled = false; btn.textContent = label;
  }
  $('login').onsubmit = e => {
    e.preventDefault();
    const id = ($('empId') as HTMLInputElement).value.trim().toUpperCase().replace(/\s+/g, ''), m = $('loginMsg');
    if (!/^[A-Z0-9-]{3,15}$/.test(id)) { m.textContent = ERR.bad_id!; return; }
    void startRun(id, m, $<HTMLButtonElement>('startBtn'), 'เริ่มวิ่ง · Start');
  };

  /* ---------- leaderboard ---------- */
  const boardRow = (e: BoardResp['top'][number], i: number) =>
    `<li${e.me ? ' style="outline:2px solid #ffd400"' : ''}><span class="n">${i < PRIZE_RANKS ? `<span class="medal m${i + 1}">${i + 1}</span>` : i + 1}</span>${avImg(e.avatar, 36)}<span class="who">${esc(avName(e.avatar))}${e.me ? ' (คุณ)' : ''}</span><span class="sc">${e.score}</span></li>`;
  const boardHtml = (list: BoardResp['top']) => list.map(boardRow).join('') || '<li><span></span><span></span><span>ยังไม่มีคะแนน · No scores yet</span><span></span></li>';
  async function loadBoard(target: string, meId?: string): Promise<Partial<BoardResp>> {
    try {
      const r = await api<BoardResp>('/api/leaderboard' + (meId ? '?id=' + encodeURIComponent(meId) : ''));
      $(target).innerHTML = boardHtml(r.top || []);
      return r;
    } catch { $(target).innerHTML = '<li><span></span><span>โหลดอันดับไม่ได้</span><span></span></li>'; return {}; }
  }
  $('boardBtn').onclick = async () => {
    show('boardOv'); $('boardTotal').textContent = 'กำลังโหลด…';
    const r = await loadBoard('boardList');
    $('boardTotal').textContent = r.total != null ? `ผู้เล่นทั้งหมด ${r.total} คน · Top 20` : '';
  };
  $('boardBack').onclick = () => show('menu');

  /* ---------- submit score ---------- */
  async function submit() {
    const p = LS.get<Pending>('srPending');
    if (!p) return;
    show('done');
    const ag = $<HTMLButtonElement>('againBtn');
    ag.style.display = 'none'; $('homeBtn').style.display = 'none';
    $('doneHead').textContent = 'กำลังส่งคะแนน… · Submitting'; $('doneScore').textContent = p.score + ' คะแนน'; $('doneRank').textContent = avName(p.avatar);
    $('doneMsg').textContent = ''; $('retryBtn').style.display = 'none'; $('doneBoard').innerHTML = '';
    try {
      const r = await api<FinishResp>('/api/finish', { id: p.id, run: p.run, token: p.token, ticks: p.ticks, inputs: p.inputs });
      if (r.ok) {
        LS.set('srPending', null); game.sess = null;
        $('doneHead').textContent = `ส่งคะแนนแล้ว · รอบที่ ${r.used}`; $('doneScore').textContent = `รอบนี้ ${r.score} คะแนน`;
        $('doneRank').textContent = `${avName(p.avatar)} · คะแนนดีที่สุด ${r.best}`;
        ag.textContent = 'เล่นอีกครั้ง · Play again'; ag.style.display = 'block';
        ag.onclick = () => void startRun(p.id, $('doneMsg'), ag, ag.textContent || '');
        $('homeBtn').style.display = 'block';
        const b = await loadBoard('doneBoard', p.id);
        if (b.rank) {
          $('doneRank').textContent = `${avName(p.avatar)} · คะแนนดีที่สุด ${r.best} · อันดับที่ ${b.rank} จาก ${b.total} คน`;
          if (b.rank <= PRIZE_RANKS) $('doneMsg').innerHTML = `<div class="win">ตอนนี้คุณอยู่อันดับ ${b.rank} รักษาอันดับไว้จนประกาศผล</div>`;
        }
      } else if (isFinalFinishError(r)) {
        LS.set('srPending', null); game.sess = null;
        $('doneHead').textContent = 'รอบนี้ส่งคะแนนไม่ได้'; $('doneMsg').textContent = 'ข้อมูลการเล่นไม่ผ่านการตรวจสอบ กรุณาเริ่มรอบใหม่ · Start a new run';
        ag.textContent = 'กลับหน้าเริ่ม · Back to start'; ag.style.display = 'block'; ag.onclick = goMenu;
      } else throw new Error('server');
    } catch {
      $('doneHead').textContent = 'ยังส่งคะแนนไม่ได้';
      $('doneMsg').textContent = 'เชื่อมต่อไม่ได้ คะแนนยังเก็บไว้ในเครื่อง กดส่งอีกครั้ง · Saved on this device, tap retry';
      $('retryBtn').style.display = 'block';
    }
  }
  $('retryBtn').onclick = () => void submit();
  $('endBtn').onclick = () => void submit();

  /* ---------- second-chance quiz ---------- */
  function askQuiz() {
    if (!game.run) return;
    const { prompt, options } = game.run.quiz, ans = game.run.correct;
    $('qHead').textContent = 'โอกาสรอด ตอบให้ถูกเพื่อวิ่งต่อ (ได้ 1 ครั้ง)';
    $('qLv').style.display = 'none';
    $('qText').textContent = prompt; $('qEn').textContent = ''; $('qNext').style.display = 'none';
    $('qOpts').innerHTML = options.map((x, i) => `<button class="opt" data-i="${i}">${esc(x)}</button>`).join('');
    $('qOpts').onclick = e => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('.opt');
      if (!b || $('qNext').style.display === 'block') return;
      const i = +b.dataset.i!, ok = i === ans;
      [...$('qOpts').children].forEach((c, j) => { if (j === ans) c.classList.add('ok'); else if (j === i) c.classList.add('no'); });
      sfx.beep(ok ? 990 : 140, .2, ok ? 'triangle' : 'sawtooth');
      const n = $('qNext');
      n.style.display = 'block';
      n.textContent = ok ? 'ถูกต้อง! วิ่งต่อ' : 'ยังไม่ถูก · จบรอบนี้ ส่งคะแนน';
      n.onclick = () => { if (ok) { if (game.answer(i)) show(null); } else void submit(); };
    };
    show('quiz');
  }
  $('chanceBtn').onclick = () => { if (!game.revives && game.lastHit) askQuiz(); };

  /* ---------- bonus-coin quiz: right or wrong, the run just continues ---------- */
  function askBonusQuiz(quiz: { prompt: string; options: string[]; correct: number; reward: number }) {
    $('qHead').textContent = `โบนัสพิเศษ! ตอบถูกรับ +${quiz.reward} คะแนน · Bonus question, +${quiz.reward} pts`;
    $('qLv').style.display = 'none';
    $('qText').textContent = quiz.prompt; $('qEn').textContent = ''; $('qNext').style.display = 'none';
    $('qOpts').innerHTML = quiz.options.map((x, i) => `<button class="opt" data-i="${i}">${esc(x)}</button>`).join('');
    $('qOpts').onclick = e => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('.opt');
      if (!b || $('qNext').style.display === 'block') return;
      const i = +b.dataset.i!, ok = i === quiz.correct;
      [...$('qOpts').children].forEach((c, j) => { if (j === quiz.correct) c.classList.add('ok'); else if (j === i) c.classList.add('no'); });
      sfx.beep(ok ? 990 : 140, .2, ok ? 'triangle' : 'sawtooth');
      const n = $('qNext');
      n.style.display = 'block';
      n.textContent = ok ? `ถูกต้อง! +${quiz.reward} คะแนน วิ่งต่อ` : 'ยังไม่ถูก ไม่เป็นไร วิ่งต่อ';
      n.onclick = () => { game.answer(i); show(null); };
    };
    show('quiz');
  }

  /* ---------- boot ---------- */
  // handy for poking at the game from the browser console while developing
  if (import.meta.env.DEV) Object.assign(window, { __sr: { game, renderer, hud } });
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
    else { LS.set('srPending', null); $('loginMsg').textContent = 'รอบก่อนหน้าถูกปิดระหว่างเล่น นับเป็น 1 ครั้งแล้ว · Previous run was closed and counted'; }
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
