/**
 * The award slides, rank 7 first and rank 1 last. Each one is a single slide with one click inside it:
 *   on arrival  the prize drops in and the winner's seat is a pulsing "?"
 *   click       a short drum roll (faces flick past, slowing down), then the winner lands with confetti
 * Rank 1 gets a longer roll with a 3-2-1 and a bigger finish.
 */
import { avName, avatarArt, setAvatarImg } from '../lib/avatar.js';
import { th } from '../i18n/th.js';
import { n0, type Winner } from './calc.js';
import type { Scene } from './deck.js';
import { PRIZE_ART, prizeKind, type PrizeKind } from './art.js';
import { narrate } from './narrator.js';
import { Run, burst, easeOut, flash, reduced, sfxCount, sfxReveal, sfxTick } from './fx.js';

/** the prize's name and a short tag, from the same strings the game's prize screen shows */
export function prizeText(rank: number): { name: string; tag: string } {
  if (rank === 1) return { name: th.prize1Item, tag: th.prize1 };
  if (rank <= 5) return { name: th.prize2Item, tag: th.prize2 };
  return { name: th.prize3Item, tag: th.prize3 };
}

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** the prize name with its brand or key word set in the serif accent: "HUAWEI Band 11 …", "บัตรเติมน้ำมัน …" */
function accent(name: string, kind: PrizeKind): string {
  const key = kind === 'watch' ? /^(HUAWEI Band 11)/ : kind === 'fuel' ? /(บัตรเติมน้ำมัน)/ : /(BEZ)/;
  return esc(name).replace(key, '<em>$1</em>');
}

/** how long the drum roll lasts, and the sound of it: more at the top of the board */
const rollMs = (rank: number) => rank === 1 ? 5200 : rank <= 3 ? 3400 : 2300;

export function buildAward(w: Winner, pool: { avatar: number | null }[]): Scene {
  const kind = prizeKind(w.rank), text = prizeText(w.rank);
  const el = document.createElement('section');
  el.className = 'slide award' + (w.rank === 1 ? ' first' : '');
  el.id = `s-award-${w.rank}`;
  el.dataset.chrome = `Top 7 · อันดับ ${w.rank}`;
  el.innerHTML = `
    <div class="half half-l">
      <div class="ghost reveal" style="--i:0" aria-hidden="true">${w.rank}</div>
      <div class="prize-art">${PRIZE_ART[kind]}</div>
      <div class="prize-name reveal" style="--i:5"><span class="pill">${esc(text.tag)}</span><h3>${accent(text.name, kind)}</h3></div>
    </div>
    <div class="half half-r">
      <div class="lab reveal" style="--i:1">ผู้ได้รับรางวัล</div>
      <div class="slot reveal" style="--i:3">
        <div class="pulse"></div><div class="pulse p2"></div><div class="ring"></div>
        <div class="q" aria-hidden="true">?</div>
        <div class="face"><img alt=""></div>
        <div class="count"><b></b></div>
      </div>
      <div class="who">
        <div class="av-name"></div>
        <div class="row"><span class="idp">รหัสพนักงาน <b>${esc(w.id)}</b></span><span class="score"><span class="sc">0</span><small>คะแนน</small></span></div>
      </div>
      <div class="hint reveal" style="--i:7">คลิกเพื่อเปิดเผยผู้ได้รับรางวัล ▸</div>
    </div>`;
  document.getElementById('deckStage')!.insertBefore(el, document.getElementById('s-end'));

  const face = el.querySelector('.face img') as HTMLImageElement;
  const count = el.querySelector('.count') as HTMLElement, countB = count.querySelector('b')!;
  const scoreEl = el.querySelector('.sc') as HTMLElement, nameEl = el.querySelector('.av-name') as HTMLElement;
  let run: Run | null = null;

  /** the winner, fully shown */
  const settle = () => {
    el.classList.remove('drum'); el.classList.add('rev');
    count.classList.remove('on');
    setAvatarImg(face, avatarArt(w.avatar, 640, w.look));
    nameEl.textContent = avName(w.avatar);
    scoreEl.textContent = n0(w.score);
  };

  return {
    el, steps: 1,
    enter(instant) {
      run?.stop(); run = new Run();
      el.classList.remove('drum', 'rev');
      count.classList.remove('on');
      scoreEl.textContent = '0';
      face.removeAttribute('src');
      if (instant) return;
    },
    async step(k, instant) {
      if (k !== 1) return;
      if (instant) { settle(); return; }
      const r = run = new Run();
      el.classList.add('drum');
      // a pool of other faces to flick through, never the winner's own (that one lands last)
      const others = pool.filter(p => p.avatar !== w.avatar);
      const picks = Array.from({ length: 40 }, (_, i) => others.length ? others[(i * 7 + w.rank * 3) % others.length]!.avatar : i * 5 + w.rank);
      const D = rollMs(w.rank), withCount = w.rank === 1;
      const spinMs = withCount ? D - 3000 : D;
      const n = Math.max(8, Math.round(spinMs / 150));
      const t0 = performance.now();
      face.removeAttribute('src');
      await new Promise<void>(res => {
        let i = 0;
        const next = () => {
          if (r.stopped) return;
          if (r.skipped || reduced() || i >= n) { res(); return; }
          const x = i / n, due = t0 + spinMs * (x ** 1.8 * .82 + x * .18);
          i++;
          face.src = avatarArt(picks[i % picks.length] ?? null, 360).url;
          face.classList.remove('av-fx');
          sfxTick(i);
          setTimeout(next, Math.max(30, due - performance.now()));
        };
        next();
        r.onSkip = res;
      });
      if (r.stopped) return;
      if (withCount && !r.skipped && !reduced()) {
        face.removeAttribute('src');
        for (const c of [3, 2, 1]) {
          countB.textContent = String(c); count.classList.remove('on'); void count.offsetWidth; count.classList.add('on'); sfxCount(c);
          await r.wait(1000);
          if (r.skipped) break;
        }
        sfxCount(0);
      }
      if (r.stopped) return;
      settle();
      flash(); sfxReveal(w.rank <= 3);
      narrate(`${el.id}.reveal`, 900);
      // the winner lands: confetti from the seat, more of it nearer the top
      const big = w.rank <= 3;
      burst(1440, 440, big ? 220 : 130, big ? 1.25 : 1, w.rank !== 1);
      if (big) setTimeout(() => burst(1440, 440, 120, 1.4, w.rank !== 1), 260);
      if (w.rank === 1) { setTimeout(() => burst(480, 420, 160, 1.2, false), 500); setTimeout(() => burst(960, 300, 200, 1.5, false), 900); }
      // the score counts up
      await r.tween(1300, t => { scoreEl.textContent = n0(w.score * t); }, easeOut);
      scoreEl.textContent = n0(w.score);
    },
    leave() { run?.stop(); run = null; },
    skip() { run?.skip(); },
  };
}
