/**
 * The award slides: the Top 7 (7th first, 1st last) and the two "super fan" prizes for the most plays. Each is a single slide with
 * one click inside it:
 *   on arrival  the prize drops in and the winner's seat is a pulsing "?"
 *   click       a short drum roll (faces flick past, slowing down), then the winner lands with confetti
 * The Top 7's 1st place gets a longer roll with a 3-2-1 and a bigger finish.
 */
import { avName, avatarArt, setAvatarImg } from '../lib/avatar.js';
import { th } from '../i18n/th.js';
import { n0, type Fan, type Winner } from './calc.js';
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

/** what the super fans win is not settled yet: a gift box stands in for it */
export const FAN_PRIZE = 'ของขวัญสุดพิเศษ';

/** everything one award slide needs, whoever it is for */
export interface AwardSpec {
  /** the slide's id: also the key of its narration (`<id>.enter`, `<id>.reveal`) */
  id: string;
  /** the big pink numeral behind the prize */
  ghost: string;
  /** the footer line */
  chrome: string;
  /** the pill above the prize name */
  tag: string;
  prize: string;
  kind: PrizeKind;
  who: { id: string; avatar: number | null; look: Record<string, string> };
  /** the number counted up under the winner, and its unit */
  value: number;
  unit: string;
  /** a different avatar order for each slide's drum roll */
  seed: number;
  /** drum roll length, ms */
  rollMs: number;
  /** a 3-2-1 before the reveal, and the right half turning pink: the one big finish */
  first: boolean;
  /** extra confetti and a bigger chord */
  big: boolean;
}

export function awardOfWinner(w: Winner): AwardSpec {
  const text = prizeText(w.rank);
  return {
    id: `s-award-${w.rank}`, ghost: String(w.rank), chrome: `Top 7 · อันดับ ${w.rank}`, tag: text.tag, prize: text.name, kind: prizeKind(w.rank),
    who: w, value: w.score, unit: 'คะแนน', seed: w.rank,
    rollMs: w.rank === 1 ? 5200 : w.rank <= 3 ? 3400 : 2300, first: w.rank === 1, big: w.rank <= 3,
  };
}

export function awardOfFan(f: Fan): AwardSpec {
  return {
    id: `s-fan-${f.rank}`, ghost: String(f.rank), chrome: `แฟนพันธุ์แท้ · คนที่ ${f.rank}`, tag: `แฟนพันธุ์แท้ คนที่ ${f.rank}`, prize: FAN_PRIZE, kind: 'gift',
    who: f, value: f.plays, unit: 'ครั้ง', seed: 20 + f.rank, rollMs: 2800, first: false, big: f.rank === 1,
  };
}

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** the prize name with its brand or key word set in the serif accent: "HUAWEI Band 11 …", "บัตรเติมน้ำมัน …" */
function accent(name: string, kind: PrizeKind): string {
  const key = kind === 'watch' ? /^(HUAWEI Band 11)/ : kind === 'fuel' ? /(บัตรเติมน้ำมัน)/ : kind === 'umbrella' ? /(BEZ)/ : /(ของขวัญ)/;
  return esc(name).replace(key, '<em>$1</em>');
}

/** adds the slide before `before` in the page and returns its scene */
export function buildAward(a: AwardSpec, pool: { avatar: number | null }[], before: HTMLElement): Scene {
  const el = document.createElement('section');
  el.className = 'slide award' + (a.first ? ' first' : '');
  el.id = a.id;
  el.dataset.chrome = a.chrome;
  el.innerHTML = `
    <div class="half half-l">
      <div class="ghost reveal" style="--i:0" aria-hidden="true">${esc(a.ghost)}</div>
      <div class="prize-art">${PRIZE_ART[a.kind]}</div>
      <div class="prize-name reveal" style="--i:5"><span class="pill">${esc(a.tag)}</span><h3>${accent(a.prize, a.kind)}</h3></div>
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
        <div class="row"><span class="idp">รหัสพนักงาน <b>${esc(a.who.id)}</b></span><span class="score"><span class="sc">0</span><small>${esc(a.unit)}</small></span></div>
      </div>
      <div class="hint reveal" style="--i:7">คลิกเพื่อเปิดเผยผู้ได้รับรางวัล ▸</div>
    </div>`;
  before.parentElement!.insertBefore(el, before);

  const face = el.querySelector('.face img') as HTMLImageElement;
  const count = el.querySelector('.count') as HTMLElement, countB = count.querySelector('b')!;
  const scoreEl = el.querySelector('.sc') as HTMLElement, nameEl = el.querySelector('.av-name') as HTMLElement;
  let run: Run | null = null;

  /** the winner, fully shown */
  const settle = () => {
    el.classList.remove('drum'); el.classList.add('rev');
    count.classList.remove('on');
    setAvatarImg(face, avatarArt(a.who.avatar, 640, a.who.look));
    nameEl.textContent = avName(a.who.avatar);
    scoreEl.textContent = n0(a.value);
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
      const others = pool.filter(p => p.avatar !== a.who.avatar);
      const picks = Array.from({ length: 40 }, (_, i) => others.length ? others[(i * 7 + a.seed * 3) % others.length]!.avatar : i * 5 + a.seed);
      const withCount = a.first;
      const spinMs = withCount ? a.rollMs - 3000 : a.rollMs;
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
      flash(); sfxReveal(a.big);
      narrate(`${el.id}.reveal`, 900);
      // the winner lands: confetti from the seat, more of it nearer the top
      burst(1440, 440, a.big ? 220 : 130, a.big ? 1.25 : 1, !a.first);
      if (a.big) setTimeout(() => burst(1440, 440, 120, 1.4, !a.first), 260);
      if (a.first) { setTimeout(() => burst(480, 420, 160, 1.2, false), 500); setTimeout(() => burst(960, 300, 200, 1.5, false), 900); }
      // the number counts up
      await r.tween(1300, t => { scoreEl.textContent = n0(a.value * t); }, easeOut);
      scoreEl.textContent = n0(a.value);
    },
    leave() { run?.stop(); run = null; },
    skip() { run?.skip(); },
  };
}
