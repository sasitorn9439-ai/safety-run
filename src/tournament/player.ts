import { STEP, type Action } from '../../shared/sim.js';
import { avName, avImg } from '../lib/avatar.js';
import type { Sfx } from '../lib/audio.js';
import { $, esc } from '../lib/dom.js';
import { LS } from '../lib/storage.js';
import type { GameRenderer } from '../render/index.js';
import { Hud } from '../ui/hud.js';
import { Clock, SEND_MS, errText, fmtTime, openChannel, tourApi, type Board, type Channel, type Msg, type Room, type Slot } from './net.js';
import { Ghosts } from './ghosts.js';
import { Race } from './race.js';
import { GatePanel, fxHtml, itemListHtml } from './ui.js';

interface Seat { code: string; slot: Slot; token: string; avatar: number }
interface Saved { code: string; seed: number; inputs: Race['inputs'] }


const SCREENS = ['tMenu', 'tLobby', 'tResult', 'howOv', 'hLogin'] as const;
export const showScreen = (id: (typeof SCREENS)[number] | null) => { for (const s of SCREENS) $(s).classList.toggle('on', s === id); };

/** a phone in the tournament: join a room, wait in the lobby, race, send the race for scoring, see the standings */
export function startPlayer(renderer: GameRenderer, sfx: Sfx, onHost: () => void) {
  const clock = new Clock(), hud = new Hud();
  const gatePanel = new GatePanel({ root: $('tGate'), head: $('tGateHead'), q: $('tGateQ'), opts: $('tGateOpts'), bar: $('tGateBar'), pts: $('tGatePts') });
  let seat = LS.get<Seat>('srTourSeat'), room: Room | null = null, race: Race | null = null, channel: Channel | null = null;
  let board: Board = [], ghosts = new Ghosts(), audits = 0, submitted = false, finishing = false, poll = 0;

  const q = new URLSearchParams(location.search);
  $<HTMLInputElement>('roomCode').value = q.get('room') ?? seat?.code ?? '';
  $<HTMLInputElement>('tEmpId').value = LS.get<string>('srEmpId') ?? '';
  $('itemList').innerHTML = itemListHtml();
  $('howBtn').onclick = () => showScreen('howOv');
  $('howClose').onclick = () => showScreen('tMenu');
  $('hostBtn').onclick = onHost;

  $('joinForm').onsubmit = async e => {
    e.preventDefault();
    sfx.unlock();
    const code = $<HTMLInputElement>('roomCode').value.trim().toUpperCase(), id = $<HTMLInputElement>('tEmpId').value.trim();
    $('joinMsg').textContent = '';
    const r = await tourApi<{ slot: Slot; token: string; avatar: number }>('join', { code, id });
    if (!r.ok) { $('joinMsg').textContent = errText(r.error); return; }
    LS.set('srEmpId', id);
    seat = { code, slot: r.slot!, token: r.token!, avatar: r.avatar! };
    LS.set('srTourSeat', seat);
    history.replaceState(null, '', `/tournament?room=${code}`);
    void follow();
  };

  /** polls the room once a second and moves between lobby, race and results */
  async function follow() {
    clearTimeout(poll);
    if (!seat) return;
    const r = await clock.state(seat.code);
    if (r.status === 404) { LS.set('srTourSeat', null); seat = null; showScreen('tMenu'); $('joinMsg').textContent = errText('room'); return; }
    if (r.ok) {
      room = r as Room;
      if (!room.players.some(p => p.slot === seat!.slot && p.avatar === seat!.avatar)) {
        // kicked by the host, or another employee took the seat
        LS.set('srTourSeat', null); seat = null; stopRace(); showScreen('tMenu');
        $('joinMsg').textContent = 'คุณไม่ได้อยู่ในห้องนี้แล้ว เข้าห้องใหม่อีกครั้ง';
        return;
      }
      const mine = room.players.find(p => p.slot === seat!.slot)!;
      if (room.phase === 'lobby') { if (race) stopRace(); lobby(); }
      else if (!race && mine.score != null) { submitted = true; results(); }
      else if (!race && room.seed != null && room.startAt != null && !submitted) await beginRace(room);
      else if (submitted) results();
    }
    poll = window.setTimeout(() => void follow(), race && !race.run.finished ? 3000 : 1000);
  }

  function lobby() {
    submitted = false;
    showScreen('tLobby');
    $('lobbyCode').textContent = room!.code;
    $('lobbyAv').innerHTML = avImg(seat!.avatar, 72);
    $('lobbyName').textContent = `${avName(seat!.avatar)} · ช่อง ${seat!.slot + 1}`;
    $('lobbyInfo').textContent = `ด่านสุ่มตอนเริ่มแข่ง · ${fmtTime(room!.duration)} นาที`;
    $('lobbySeats').innerHTML = [0, 1, 2].map(s => {
      const p = room!.players.find(x => x.slot === s);
      return `<li class="${p?.slot === seat!.slot ? 'me' : ''}">${p ? `${avImg(p.avatar, 36)}<span>${esc(avName(p.avatar))}</span>` : '<span class="empty">ว่าง</span>'}</li>`;
    }).join('');
  }

  async function beginRace(r: Room) {
    showScreen(null);
    hud.reset(); hud.setAvatar(seat!.avatar); hud.show(true);
    $('tRace').classList.add('on');
    audits = 0; board = []; ghosts = new Ghosts(); finishing = false;
    race = new Race({ seed: r.seed!, stage: r.stage, duration: r.duration, startAt: r.startAt! }, sfx.beep, e => {
      renderer.onEvent(e, race?.run.view().px ?? 0);
      // only a pickup that happens live (not while catching up after a reload) sends an audit
      if (e.type === 'power' && e.t === 'audit' && race && race.elapsed(clock.now()) - race.run.tick < 30) channel?.send({ t: 'audit', slot: seat!.slot });
    });
    const saved = LS.get<Saved>('srTourRun');
    if (saved && saved.code === r.code && saved.seed === r.seed) race.receive(0, saved.inputs, 0);
    const mine = race, ch = await openChannel(r.code, 'player', { slot: seat!.slot, token: seat!.token }, onMsg);
    if (race === mine) channel = ch; else ch.close();
  }

  function onMsg(m: Msg) {
    if (m.t === 'board') { board = m.board; if (race) ghosts.see(m.board, race.elapsed(clock.now())); }
    // on Ably another phone's own report reaches this one directly; the ghost takes whichever is newer
    else if (m.t === 'in' && m.slot !== seat?.slot && race) ghosts.see([[m.slot, 0, m.tick, m.d, m.l, m.j, m.s]], race.elapsed(clock.now()));
    else if (m.t === 'audited' && m.to === seat?.slot) audits++;
  }

  function stopRace() {
    channel?.close(); channel = null; race = null;
    hud.show(false); $('tRace').classList.remove('on');
    $('count').textContent = ''; $('count').classList.remove('on');
  }

  /* ---------- sending the race ---------- */
  /** after the race ends a phone keeps reporting this long, so the big screen gets its last presses even if a report is lost */
  const AFTER_END_MS = 2000;
  let sent = 0, lastFull = 0, endedAt = 0;
  setInterval(() => {
    if (!race || !channel || !seat || race.run.tick <= 0) return;
    if (!race.run.finished) endedAt = 0;
    else if (!endedAt) endedAt = performance.now();
    else if (performance.now() - endedAt > AFTER_END_MS) return;
    const full = performance.now() - lastFull > 2000;
    if (full) lastFull = performance.now();
    const from = full ? 0 : Math.max(0, Math.min(sent, race.inputs.length - 20));
    const v = race.run.view();
    channel.send({ t: 'in', slot: seat.slot, from, n: race.inputs.length, e: race.inputs.slice(from), tick: race.run.tick, d: Math.round(v.dist * 100) / 100, l: v.lane, j: race.jumps, s: race.slides });
    sent = race.inputs.length;
  }, SEND_MS);
  setInterval(() => { if (race && room) LS.set('srTourRun', { code: room.code, seed: race.spec.seed, inputs: race.inputs } satisfies Saved); }, 1000);

  async function submit() {
    if (!race || !seat || submitted) return;
    $('resRetry').style.display = 'none';
    $('resMsg').textContent = 'กำลังส่งผล…';
    const r = await tourApi('finish', { code: seat.code, slot: seat.slot, token: seat.token, inputs: race.inputs });
    if (r.ok) { submitted = true; room = r as Room; LS.set('srTourRun', null); $('resMsg').textContent = ''; results(); return; }
    if (r.error === 'too_early') { setTimeout(() => void submit(), 1500); return; }
    $('resMsg').textContent = r.status === 400 ? 'ผลการแข่งไม่ผ่านการตรวจสอบ' : 'ส่งผลไม่สำเร็จ ลองใหม่อีกครั้ง';
    $('resRetry').style.display = 'block';
  }
  $('resRetry').onclick = () => void submit();

  function results() {
    showScreen('tResult');
    const done = room!.phase === 'finished';
    const me = room!.players.find(p => p.slot === seat!.slot);
    $('resHead').textContent = done ? 'ผลการแข่งขัน' : 'หมดเวลา! รอผลของทุกคน…';
    $('resScore').textContent = me?.score != null ? `${me.score} คะแนน` : '';
    $('resInfo').textContent = me?.correct != null ? `ตอบถูก ${me.correct} ข้อ` : '';
    const ranked = [...room!.players].sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || (b.correct ?? 0) - (a.correct ?? 0));
    $('resBoard').innerHTML = ranked.map((p, i) => `<li class="${p.slot === seat!.slot ? 'me' : ''}"><span class="n">${i + 1}</span><div>${avImg(p.avatar, 28)} ${esc(avName(p.avatar))}<small>${p.score == null ? 'รอผล…' : `ตอบถูก ${p.correct} ข้อ`}</small></div><span class="sc">${p.score ?? '—'}</span></li>`).join('');
  }

  /* ---------- input: swipe + keyboard ---------- */
  const shell = $('shell');
  let sx = 0, sy = 0, swiping = false;
  const press = (a: Action) => { if (race && race.elapsed(clock.now()) >= 0) race.press(a); };
  shell.addEventListener('pointerdown', e => { if (!race) return; sx = e.clientX; sy = e.clientY; swiping = true; });
  shell.addEventListener('pointermove', e => {
    if (!swiping) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 26) return;
    swiping = false;
    press(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy < 0 ? 'up' : 'down');
  });
  addEventListener('pointerup', () => { swiping = false; });
  addEventListener('pointercancel', () => { swiping = false; });
  const KEYS: Record<string, Action> = { arrowleft: 'left', a: 'left', arrowright: 'right', d: 'right', arrowup: 'up', w: 'up', ' ': 'up', arrowdown: 'down', s: 'down' };
  addEventListener('keydown', e => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    const a = KEYS[e.key.toLowerCase()];
    if (a && race) { press(a); e.preventDefault(); }
  });

  /* ---------- every frame ---------- */
  let lastCount = 0, lastNow = 0;
  function frame(now: number) {
    const dt = lastNow ? Math.min(.1, (now - lastNow) / 1000) : 0;
    lastNow = now;
    if (race) {
      const el = race.elapsed(clock.now());
      const count = el < 0 ? Math.ceil(-el * STEP) : 0;
      if (count !== lastCount) { lastCount = count; hud.count(count); if (count) sfx.beep(count === 1 ? 880 : 660, 0.12, 'triangle'); }
      if (el >= 0) {
        while (audits > 0 && race.press('audit')) audits--;
        race.advance(el);
      }
      const v = race.run.view(), t = v.tour!;
      const others = ghosts.place(seat!.slot, Math.max(0, el), dt);
      renderer.render({ ...race.frame(), ghosts: others }, now);
      hud.update({
        score: race.run.score(), coins: v.coins, dbl: v.dbl, got: v.got, shield: v.shield, toast: v.toast, toastT: v.toastT, sur: v.sur,
        zone: { index: v.zone, n: v.zoneN }, combo: v.combo, mult: v.mult, dist: v.dist, pb: 0,
      });
      $('tClock').textContent = fmtTime(t.ticksLeft * STEP);
      $('tClock').classList.toggle('hurry', t.ticksLeft * STEP <= 10);
      $('tFx').innerHTML = fxHtml(t);
      gatePanel.update(t.gate);
      rank(race.run.score(), v.dist, others);
      if (race.run.finished && !finishing) {
        finishing = true;
        hud.show(false); $('tRace').classList.remove('on'); showScreen('tResult'); $('resHead').textContent = 'หมดเวลา!'; void submit(); }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  /** the standings strip: my own score is live, the others are what the host last sent, with how far ahead or behind they run */
  let lastRank = '';
  function rank(mine: number, myDist: number, others: { slot: Slot; dist: number }[]) {
    if (!room || !seat) return;
    const rows = room.players.map(p => ({ p, score: p.slot === seat!.slot ? mine : board.find(b => b[0] === p.slot)?.[1] ?? 0 }))
      .sort((a, b) => b.score - a.score);
    const gap = (slot: Slot) => {
      const g = others.find(o => o.slot === slot);
      if (!g) return '';
      const m = Math.round(g.dist - myDist);
      return `<small>${m > 0 ? `+${m}` : m} ม.</small>`;
    };
    const html = rows.map((r, i) => `<li class="${r.p.slot === seat!.slot ? 'me' : ''}"><i>${i + 1}</i>${avImg(r.p.avatar, 22)}<b>${r.score}</b>${gap(r.p.slot)}</li>`).join('');
    if (html !== lastRank) { lastRank = html; $('tRank').innerHTML = html; }
  }

  if (seat && (!q.get('room') || q.get('room')!.toUpperCase() === seat.code)) void follow();
  else showScreen('tMenu');

  const fonts = ['800 20px Kanit', '600 20px Kanit', '400 20px Kanit'].map(f => document.fonts.load(f).catch(() => []));
  void Promise.all(fonts).then(() => document.fonts.ready).then(() => { renderer.rebuild(); hud.refreshArt(); });
}
