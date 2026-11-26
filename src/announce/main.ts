/**
 * /announce: the prize-announcement deck ("Editorial Tri-Tone"). Loads every player from the admin API (or made-up ones with
 * ?demo), works out the fun facts and the top 7 (calc.ts), builds the award slides and starts the deck.
 * URL: ?demo[=scale] to rehearse, ?slide=N&step=K to jump (the address follows you as you go).
 */
import './announce.css';
import { api, type AdminAnnounce } from '../lib/api.js';
import { avImg } from '../lib/avatar.js';
import { factsOf, people, wantsMoon, type Facts, n0 } from './calc.js';
import { awardOfFan, awardOfWinner, buildAward } from './awards.js';
import { Deck, type Scene } from './deck.js';
import { demoPlayers } from './demo.js';
import { narrationFor } from './narration.js';
import { hasNarration, loadNarration, narrationStatus, setNarrationStatus } from './narrator.js';
import { prepareVoice, thaiTime, voiceSetup } from './voice-gate.js';
import { coverScene, distScene, introScene, moonScene, thaiScene, timeScene } from './scenes.js';

const $ = (id: string) => document.getElementById(id)!;
const KEY = 'safety-run-admin-key';
const q = new URLSearchParams(location.search);

async function start(rows: AdminAnnounce[], before?: string, key = '') {
  const f: Facts = factsOf(rows);
  const faces = people(rows).filter(r => !r.hidden);
  const scenes: Scene[] = [coverScene(), distScene(f, faces), thaiScene(f)];
  const moon = $('s-moon');
  if (wantsMoon(f)) scenes.push(moonScene(f)); else moon.remove();
  scenes.push(timeScene(f));
  // the two super fans (most plays) come before the Top 7, the lower place first; the Top 7 follow their interlude, 7th first
  const intro = $('s-intro');
  [...f.fans].reverse().forEach(fan => scenes.push(buildAward(awardOfFan(fan), faces, intro)));
  scenes.push(introScene(f));
  // the server counts only runs finished before this moment; say so on the interlude
  if (before) $('introCut').textContent = 'นับข้อมูลถึง ' + thaiTime(before);
  const end = $('s-end');
  [...f.winners].reverse().forEach(w => scenes.push(buildAward(awardOfWinner(w), faces, end)));
  const list = $('recap');
  list.innerHTML = f.winners.map((w, i) => `<li class="reveal" style="--i:${i + 2}"><span class="rk">${w.rank}</span>${avImg(w.avatar, 84, w.look)}<span class="nm">${w.id}<small>รหัสพนักงาน</small></span><span class="sc">${n0(w.score)}</span></li>`).join('');
  const fanBox = $('recapFans');
  fanBox.hidden = !f.fans.length;
  fanBox.querySelector('ol')!.innerHTML = f.fans.map((w, i) => `<li class="reveal" style="--i:${i + 3}"><span class="rk">${w.rank}</span>${avImg(w.avatar, 64, w.look)}<span class="nm">${w.id}<small>รหัสพนักงาน</small></span><span class="sc">${n0(w.plays)} <small>ครั้ง</small></span></li>`).join('');
  scenes.push({ el: end, steps: 0, enter() {}, step() {}, leave() {} });

  $('gate').hidden = true;
  // narration: from the server when it is set up (asks first if the voice has to be made), else from recorded files if there are any.
  // Each clip plays only while its text still matches the script for this data.
  let server = false;
  if (key && q.get('narration') !== 'off') {
    const setup = await voiceSetup(key);
    if (setup) {
      server = true;
      const lines = narrationFor(f, { gender: setup.gender, cutoff: before });
      const ready = await prepareVoice(key, lines, setup.rate, before);
      // a negative count means only the lines that do not depend on the results were made (before the cutoff)
      const got = Math.abs(ready);
      if (got < lines.length && hasNarration()) setNarrationStatus(ready < 0 ? `เตรียมเสียงเฉพาะช่วงที่ไม่ขึ้นกับผล (${got} จาก ${lines.length} ช่วง) ช่วงที่มีผลประกาศจะเงียบ` : `เสียงบรรยายไม่ครบ ${lines.length - got} จาก ${lines.length} ช่วง`);
    }
  }
  if (!server) await loadNarration(g => narrationFor(f, { gender: g, cutoff: before }));
  const deck = new Deck(scenes);
  deck.addChrome();
  (window as unknown as { deck: Deck; facts: Facts }).deck = deck;
  (window as unknown as { facts: Facts }).facts = f;
  const i = Math.max(0, Math.min(scenes.length - 1, (+(q.get('slide') ?? 1) || 1) - 1));
  const k = Math.max(0, Math.min(scenes[i]!.steps, +(q.get('step') ?? 0) || 0));
  void document.fonts.ready.then(() => deck.render(i, k, false));
  const hint = $('hint');
  if (hasNarration()) hint.textContent += ' · N = เสียงบรรยาย';
  hint.classList.add('show'); setTimeout(() => hint.classList.remove('show'), 4000);
  if (/ล้าสมัย|ไม่ครบ|ไม่ขึ้นกับผล/.test(narrationStatus)) hint.textContent = narrationStatus;
  // opened before the cutoff: the standings are not final, and the deck says so each time it opens
  if (before && Date.parse(before) > Date.now()) { hint.textContent = `⚠ ข้อมูลยังไม่ปิด (ตัด ${thaiTime(before)}) อันดับยังเปลี่ยนได้ · ` + hint.textContent; hint.classList.add('show'); setTimeout(() => hint.classList.remove('show'), 9000); }
}

/** the admin key typed earlier in this tab, so a rehearsal with ?demo can still use the server voice */
function savedKey() { try { return sessionStorage.getItem(KEY) ?? ''; } catch { return ''; } }

async function load(key: string) {
  const msg = $('gateMsg');
  msg.textContent = 'กำลังโหลด…';
  const r = await api<{ players: AdminAnnounce[]; before: string }>('/api/admin', { key, action: 'announce' });
  if (r.status === 401) { msg.textContent = 'รหัสไม่ถูกต้อง'; return; }
  if (!r.ok || !r.players) { msg.textContent = 'โหลดข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง'; return; }
  try { sessionStorage.setItem(KEY, key); } catch { /* private window: asked again next time */ }
  await start(r.players, r.before, key);
}

$('gate').addEventListener('submit', e => { e.preventDefault(); const k = ($('gateKey') as HTMLInputElement).value.trim(); if (k) void load(k); });
$('gateDemo').addEventListener('click', () => void start(demoPlayers(), undefined, ($('gateKey') as HTMLInputElement).value.trim() || savedKey()));

// ?cutoff=<iso> pretends the data is cut off at that time, to see how the deck behaves before it (e.g. 2099-01-01T00:00:00Z)
if (q.has('demo')) void start(demoPlayers(+(q.get('demo') || 1) || 1), q.get('cutoff') || undefined, savedKey());
else {
  let saved = '';
  try { saved = sessionStorage.getItem(KEY) ?? ''; } catch { /* no storage */ }
  if (saved) void load(saved); else ($('gateKey') as HTMLInputElement).focus();
}
