import { renderSVG } from 'uqr';
import { STEP } from '../../shared/sim.js';
import { avName, avImg } from '../lib/avatar.js';
import { $, esc } from '../lib/dom.js';
import { lookOfWorn } from '../cosmetics/wardrobe.js';
import { Music } from '../lib/music.js';
import { LS } from '../lib/storage.js';
import type { GameRenderer } from '../render/index.js';
import { Clock, DELAY_TICKS, STAGE_NAMES, errText, fmtTime, openChannel, tourApi, SLOTS, type Channel, type Msg, type Room, type Slot } from './net.js';
import { Race } from './race.js';
import { showScreen } from './player.js';
import { GatePanel, fxHtml } from './ui.js';

/** auto camera: stay at least this long on someone, and move on after ROTATE_MS when nothing is happening */
const DWELL_MS = 2500, ROTATE_MS = 8000;
/**
 * standings and positions go down to the phones this often. Each send is delivered to every phone, and Supabase counts each
 * delivery against the plan's messages per second, so this stays at 2 a second; the phones carry the ghosts forward in between.
 */
const BOARD_MS = 500;
/** the music goes into its last gear this many seconds before time is up */
const FINAL_SECONDS = 25;
/** no report from a phone for this many ticks (2 s) counts as signal lost */
const LOST_TICKS = 120;
const hostKey = (code: string) => `srHost:${code}`;

/** Host login: the admin key opens a room, which then lives at /tournament?host=CODE (the token stays in this tab). */
export function hostLogin(renderer: GameRenderer) {
  showScreen('hLogin');
  $('hostBack').onclick = () => showScreen('tMenu');
  $('hostForm').onsubmit = async e => {
    e.preventDefault();
    const r = await tourApi<{ code: string; hostToken: string }>('create', { key: $<HTMLInputElement>('hostKey').value });
    if (!r.ok) { $('hostMsg').textContent = errText(r.error); return; }
    sessionStorage.setItem(hostKey(r.code!), r.hostToken!);
    history.replaceState(null, '', `/tournament?host=${r.code}`);
    startHost(renderer, r.code!, r.hostToken!);
  };
}

export const savedHost = (code: string) => { try { return sessionStorage.getItem(hostKey(code)); } catch { return null; } };

/** The big screen: the lobby with its QR code, then the race seen through one player's eyes at a time, then the podium. */
export function startHost(renderer: GameRenderer, code: string, hostToken: string) {
  document.body.classList.add('host');
  showScreen(null);
  renderer.resize();
  const clock = new Clock();
  const gatePanel = new GatePanel({ root: $('hGate'), head: $('hGateHead'), q: $('hGateQ'), opts: $('hGateOpts'), bar: $('hGateBar') });
  let room: Room | null = null, channel: Channel | null = null, poll = 0;
  let races = new Map<Slot, Race>(), raceSeed: number | null = null;
  let focus: Slot = 0, auto = true, focusSince = 0, leader: Slot | null = null, camWhy = '';

  const call = async (action: string, data: Record<string, unknown> = {}) => {
    const r = await tourApi(action, { code, hostToken, ...data });
    $('hMsg').textContent = r.ok ? '' : errText(r.error);
    if (r.ok) { room = r as Room; render(); }
  };

  /* ---------- lobby ---------- */
  const joinUrl = `${location.origin}/tournament?room=${code}`;
  $('hQr').innerHTML = renderSVG(joinUrl, { border: 1, pixelSize: 8, whiteColor: '#ffffff', blackColor: '#111111' });
  $('hCode').textContent = code;
  $('hUrl').textContent = joinUrl;
  $('hSeats').onclick = e => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-kick]'); if (b) void call('kick', { slot: +b.dataset.kick! }); };
  $('hStart').onclick = () => void call('start');
  $('hAgain').onclick = () => void call('reset');
  $('hNew').onclick = () => { sessionStorage.removeItem(hostKey(code)); location.href = '/tournament?newhost'; };
  $('hAuto').onclick = () => setAuto(!auto);

  /* ---------- music: lobby -> race -> final seconds -> podium, synthesised in lib/music.ts ---------- */
  // Plays by itself: the click that logged the host in lets this page play sound. After a reload the browser may still
  // hold it back until the first click, which the button says.
  const music = new Music(LS.get<boolean>('srTourMute') ?? false);
  const showMute = () => {
    $('hMute').setAttribute('aria-pressed', String(music.muted));
    $('hMuteText').textContent = music.muted ? 'เพลง: ปิด' : music.blocked ? 'คลิกเพื่อเปิดเพลง' : 'เพลง: เปิด';
  };
  const unlock = () => { music.unlock(); showMute(); };
  music.onState = showMute;
  unlock();
  addEventListener('pointerdown', unlock);
  $('hMute').onclick = () => {
    // a click that only unlocks the audio starts the music rather than muting it
    if (music.muted || !music.blocked) { music.setMuted(!music.muted); LS.set('srTourMute', music.muted); }
    unlock(); showMute();
  };
  $('hCards').onclick = e => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-slot]'); if (b) { setAuto(false); look(+b.dataset.slot! as Slot, 'เลือกเอง'); } };

  function setAuto(on: boolean) {
    auto = on;
    $('hAuto').textContent = `กล้องอัตโนมัติ: ${on ? 'เปิด' : 'ปิด'}`;
    $('hAuto').setAttribute('aria-pressed', String(on));
  }
  function look(slot: Slot, why: string) { if (slot !== focus) { focus = slot; focusSince = performance.now(); } camWhy = why; }

  async function follow() {
    clearTimeout(poll);
    const r = await clock.state(code);
    if (r.ok) { room = r as Room; render(); }
    const racing = room?.phase === 'running';
    poll = window.setTimeout(() => void follow(), racing ? 1500 : 1000);
  }

  function render() {
    const r = room!;
    const lobby = r.phase === 'lobby', running = r.phase === 'running', finished = r.phase === 'finished';
    $('hLobby').classList.toggle('on', lobby);
    $('hSide').classList.toggle('on', running);
    $('hCam').classList.toggle('on', running);
    $('hPodium').classList.toggle('on', finished);
    document.body.classList.toggle('h-podium-on', finished);
    document.body.classList.toggle('h-lobby-on', lobby);
    // the race itself picks its song every frame (countdown / race / final); the lobby and podium are decided here
    music.play();
    if (lobby) music.setMode('lobby'); else if (finished) music.setMode('win');
    if (lobby) {
      stopRace();
      $('hCount').textContent = String(r.players.length);
      $('hSeats').innerHTML = SLOTS.map(s => {
        const p = r.players.find(x => x.slot === s);
        return `<li>${p ? `${avImg(p.avatar, 48, p.look)}<span>${esc(avName(p.avatar))}</span><button type="button" class="kick" data-kick="${s}" aria-label="เอาออก">✕</button>` : '<span class="empty">รอผู้เล่นสแกน QR…</span>'}</li>`;
      }).join('');
      $<HTMLButtonElement>('hStart').disabled = !r.players.length;
    }
    if ((running || finished) && r.seed != null && raceSeed !== r.seed) void beginRace(r);
    if (finished) podium();
  }

  /* ---------- the race ---------- */
  async function beginRace(r: Room) {
    stopRace();
    raceSeed = r.seed;
    races = new Map(r.players.map(p => [p.slot, new Race({ seed: r.seed!, stage: r.stage, duration: r.duration, startAt: r.startAt! })]));
    focus = r.players[0]?.slot ?? 0; focusSince = performance.now(); leader = null;
    $('hStage').textContent = STAGE_NAMES[r.stage];
    const seed = r.seed, ch = await openChannel(code, 'host', { hostToken }, onMsg);
    if (raceSeed === seed) channel = ch; else ch.close();
  }

  function stopRace() {
    channel?.close(); channel = null; races = new Map(); raceSeed = null;
    gatePanel.update(null);
  }

  const scoreOf = (slot: Slot) => races.get(slot)?.run.score() ?? 0;

  function onMsg(m: Msg) {
    if (m.t === 'in') {
      const race = races.get(m.slot);
      race?.receive(m.from, m.e, m.tick);
      if (race && m.tick > race.live.tick) race.live = { tick: m.tick, dist: m.d, lane: m.l, jumps: m.j, slides: m.s };
    }
    else if (m.t === 'audit') {
      // the audit goes to whoever leads among the others
      const others = [...races.keys()].filter(s => s !== m.slot).sort((a, b) => scoreOf(b) - scoreOf(a));
      if (others.length) {
        channel?.send({ t: 'audited', to: others[0]!, by: m.slot });
        if (auto) look(others[0]!, 'Spot Audit!');
      }
    }
  }

  setInterval(() => {
    // the standings stop once every race is over: the podium comes from the server
    if (!channel || !races.size || [...races.values()].every(r => r.run.finished)) return;
    // positions are the phones' own latest reports: the replay here runs DELAY_TICKS behind them
    channel.send({ t: 'board', board: [...races].map(([s, r]) => [s, r.run.score(), r.live.tick, r.live.dist, r.live.lane, r.live.jumps, r.live.slides]) });
  }, BOARD_MS);

  /** a phone that stopped reporting (no signal): its replay on the big screen is frozen, so nobody wants to watch it */
  const isLost = (slot: Slot, serverNow: number) => {
    const race = races.get(slot);
    const el = race?.elapsed(serverNow) ?? 0;
    return !!race && el > 0 && !race.run.finished && el - race.reported > LOST_TICKS;
  };

  /** auto camera: only players with a signal; a question beats a new leader, which beats taking turns */
  function camera(now: number) {
    if (!auto) return;
    const serverNow = clock.now();
    const slots = [...races.keys()].filter(s => !isLost(s, serverNow));
    if (!slots.length) return;
    // the one on screen lost signal: move off them straight away
    if (!slots.includes(focus)) { look([...slots].sort((a, b) => scoreOf(b) - scoreOf(a))[0]!, 'สัญญาณผู้เล่นหาย · สลับกล้อง'); return; }
    if (now - focusSince < 600) return;
    const gated = slots.filter(s => races.get(s)!.run.view().tour!.gate);
    if (gated.length) { if (!gated.includes(focus)) look(gated[0]!, 'กำลังตอบคำถาม'); return; }
    const top = [...slots].sort((a, b) => scoreOf(b) - scoreOf(a))[0];
    if (top != null && top !== leader) {
      const first = leader == null;
      leader = top;
      if (!first && now - focusSince > DWELL_MS) { look(top, 'ขึ้นนำ!'); return; }
    }
    if (now - focusSince > ROTATE_MS && slots.length > 1) look(slots[(slots.indexOf(focus) + 1) % slots.length]!, 'สลับมุมกล้อง');
  }

  let lastCount = 0;
  /** 3-2-1 over the track, same animation as the phones */
  function count(n: number) {
    if (n === lastCount) return;
    lastCount = n;
    const c = $('count');
    c.classList.remove('on');
    if (!n) return;
    c.textContent = String(n); void c.offsetWidth; c.classList.add('on');
  }

  let lastCards = '';
  function frame(now: number) {
    if (room && races.size) {
      const serverNow = clock.now();
      for (const race of races.values()) race.advance(Math.min(race.elapsed(serverNow) - DELAY_TICKS, race.reported));
      camera(now);
      const [seenSlot, seen] = races.has(focus) ? [focus, races.get(focus)!] : races.entries().next().value!;
      const el = seen.elapsed(serverNow);
      // the clock runs on the server's time (as far behind as the replays), not on the replays: one frozen with no signal, or all
      // of them when every phone has dropped, must not stop it
      const left = Math.max(0, room.duration - Math.max(0, el - DELAY_TICKS) * STEP);
      count(el < 0 ? Math.ceil(-el * STEP) : 0);
      if (room.phase === 'running') music.setMode(el < 0 ? 'lobby' : left <= FINAL_SECONDS ? 'final' : 'race');
      // everyone in what they wear: the runner the camera follows, and the others as ghosts
      const worn = (s: Slot) => lookOfWorn(room!.players.find(x => x.slot === s)?.look);
      renderer.setLook(worn(seenSlot));
      renderer.render({ ...seen.frame(), ghosts: [...races].filter(([s]) => s !== seenSlot).map(([s, r]) => ({ ...r.ghost(), look: worn(s) })) }, now);
      gatePanel.update(seen.run.view().tour!.gate);
      $('hClock').textContent = fmtTime(el < 0 ? room.duration : left);
      const p = room.players.find(x => x.slot === focus);
      $('hCam').innerHTML = p ? `${avImg(p.avatar, 36, p.look)}<b>${esc(avName(p.avatar))}</b><span>${esc(auto ? camWhy || 'กล้องอัตโนมัติ' : 'เลือกเอง')}</span>` : '';
      const ranked = room.players.map(pl => ({ pl, race: races.get(pl.slot)! })).filter(x => x.race).sort((a, b) => b.race.run.score() - a.race.run.score());
      const cards = ranked.map(({ pl, race }, i) => {
        const v = race.run.view(), t = v.tour!;
        const lost = isLost(pl.slot, serverNow);
        return `<li data-slot="${pl.slot}" class="${pl.slot === focus ? 'on' : ''}"><i class="m${i + 1}">${i + 1}</i>${avImg(pl.avatar, 40, pl.look)}<div><b>${esc(avName(pl.avatar))}</b><span>${Math.floor(v.dist)} ม. · ตอบถูก ${t.correct} · ชน ${t.crashes}${lost ? ' · <em>สัญญาณหาย</em>' : ''}</span><div class="t-fx">${fxHtml(t)}</div></div><strong>${race.run.score()}</strong></li>`;
      }).join('');
      if (cards !== lastCards) { lastCards = cards; $('hCards').innerHTML = cards; }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  function podium() {
    const ranked = [...room!.players].sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || (b.correct ?? 0) - (a.correct ?? 0));
    $('hPodiumList').innerHTML = ranked.map((p, i) => `<li><i class="m${i + 1}">${i + 1}</i>${avImg(p.avatar, 56, p.look)}<div><b>${esc(avName(p.avatar))}</b><span>${p.score == null ? 'ไม่ได้ส่งผล' : `ตอบถูก ${p.correct} ข้อ`}</span></div><strong>${p.score ?? '—'}</strong></li>`).join('');
  }

  // dev only: lets the end-to-end script compare what the big screen saw with the server's verified scores
  if (import.meta.env.DEV) Object.assign(window, { __tour: { scores: () => [...races].map(([slot, r]) => [slot, r.run.score(), r.run.finished]) } });
  void follow();
}
