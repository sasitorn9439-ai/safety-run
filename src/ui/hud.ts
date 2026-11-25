import { PPE, type PpeType } from '../../shared/hazards.js';
import { OFFICER_SCORE, type PowerType, type Surprise } from '../../shared/sim.js';
import { ZONES } from '../../shared/zones.js';
import { $ } from '../lib/dom.js';
import { avatarArt, setAvatarImg } from '../lib/avatar.js';
import { drawCoin, ppeIcon } from '../render/draw.js';
import { drawPowerIcon } from '../render/power-icons.js';
import { STEPS, type Tutorial } from '../game/tutorial.js';

export interface HudData {
  score: number; coins: number; dbl: number; got: ReadonlySet<PpeType>; shield: number; toast: string; toastT: number; sur: Surprise | null;
  /** the rest only exists in a real run (the tutorial leaves it out) */
  zone?: { index: number; n: number };
  combo?: number; mult?: number;
  slow?: number; magnet?: number; lift?: number; hearts?: number;
  dist?: number; pb?: number;
}

function ppeIconURL(t: PpeType) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 72;
  ppeIcon(cv.getContext('2d')!, t, 36, 36, 30);
  return cv.toDataURL();
}

function powerIconURL(t: PowerType) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 72;
  const c = cv.getContext('2d')!;
  c.translate(36, 36);
  drawPowerIcon(c, t, 66);
  return cv.toDataURL();
}

function coinURL() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 66;
  const c = cv.getContext('2d')!;
  c.translate(33, 33);
  drawCoin(c, 66 / .5);   // the coin art is .5 u across
  return cv.toDataURL();
}

const TUT_HEAD = { move: 'ฝึกหลบอันตราย', ppe: 'ฝึกเก็บ PPE', shield: 'ฝึกใช้เกราะ' } as const;
const BANNER_COLOR = { rain: '#5ad1ff', star: '#ffd400', double: '#ff7a1a', toolbox: '#3ccf7a' } as const;

/** In-game overlay built from DOM elements: crisp Thai text, CSS animation, and no per-frame text drawing on the canvas. */
export class Hud {
  private el = {
    hud: $('hud'), av: $<HTMLImageElement>('hudAv'), score: $('hudScore'), coins: $('hudCoins'), coinBox: $('hudCoinsBox'), coinImg: $<HTMLImageElement>('hudCoinImg'), x2: $('hudX2'), ppe: $('hudPpe'),
    pb: $('hudPb'), pbText: $('hudPbText'), pbBar: $('hudPbBar'), chips: $('hudChips'), zone: $('zoneBanner'), zoneNo: $('zoneNo'), zoneTh: $('zoneTh'), zoneTip: $('zoneTip'), tint: $('zoneTint'),
    shield: $('hudShield'), shieldBar: $('hudShieldBar'), toast: $('toast'), banner: $('banner'), bnMsg: $('bnMsg'), bnSub: $('bnSub'),
    officer: $('officer'), ofMsg: $('ofMsg'),
    count: $('count'), tut: $('tut'), tutHead: $('tutHead'), tutTh: $('tutTh'), tutEn: $('tutEn'), tutOk: $('tutOk'), tutArrow: $('tutArrow'),
  };
  private slots = new Map<PpeType, HTMLElement>();
  private chips = new Map<string, { el: HTMLElement; b: HTMLElement; text: string }>();
  private zoneTimer = 0;
  private last = { score: -1, coins: -1, dbl: -1, shield: -1, toast: '', toastOp: -1, ppe: '', sur: null as Surprise | null, closing: false, zoneN: 0, pb: '', count: 0, tutKey: '', arrow: '', ok: -1 };

  constructor() {
    for (const t of PPE) {
      const s = document.createElement('span');
      s.innerHTML = `<img src="${ppeIconURL(t)}" alt="" width="24" height="24">`;
      this.el.ppe.appendChild(s);
      this.slots.set(t, s);
    }
    $('ofPts').textContent = `+${OFFICER_SCORE} คำชม`;   // from the sim, so the bubble always says what the praise pays
    this.addChip('mult', '#ffd400', null, 'NEAR');
    this.addChip('lift', '#ffd400', 'lift', '');
    this.addChip('estop', '#ff5a4a', 'estop', '');
    this.addChip('broom', '#3ccf7a', 'broom', '');
    this.addChip('hearts', '#ff6b81', 'firstaid', '');
    this.refreshArt();
  }

  private addChip(key: string, color: string, icon: PowerType | null, label: string) {
    const el = document.createElement('span');
    el.className = 'chip'; el.style.setProperty('--c', color); el.style.display = 'none';
    el.innerHTML = `${icon ? `<img src="${powerIconURL(icon)}" alt="" width="26" height="26">` : ''}<b></b>${label ? `<small>${label}</small>` : ''}`;
    this.el.chips.appendChild(el);
    this.chips.set(key, { el, b: el.querySelector('b')!, text: '' });
  }

  private setChip(key: string, text: string, on: boolean, color?: string) {
    const c = this.chips.get(key)!;
    if (!on) { if (c.text !== '') { c.text = ''; c.el.style.display = 'none'; } return; }
    if (c.text === text) return;
    const first = c.text === '';
    c.text = text; c.b.textContent = text; c.el.style.display = '';
    if (color) c.el.style.setProperty('--c', color);
    if (!first) { c.el.classList.remove('pop'); void c.el.offsetWidth; c.el.classList.add('pop'); }
  }

  /** Redraw the images that contain text, e.g. once the web font has loaded. */
  refreshArt() {
    this.el.coinImg.src = coinURL();
  }

  /** `worn`: what the player wears (cosmetic slot → item id), which dresses the avatar */
  setAvatar(n: number | null, worn?: unknown) {
    this.el.av.style.display = n != null && n >= 0 ? 'block' : 'none';
    if (n != null && n >= 0) setAvatarImg(this.el.av, avatarArt(n, 96, worn));
    this.el.hud.classList.toggle('noav', !(n != null && n >= 0));
  }

  show(on: boolean) { this.el.hud.classList.toggle('on', on); }

  reset() {
    const l = this.last;
    l.score = l.coins = l.dbl = l.shield = l.toastOp = -1; l.toast = ''; l.ppe = ''; l.sur = null; l.closing = false;
    for (const slot of this.slots.values()) slot.classList.remove('has');   // the cached key above is '' again, so update() would not clear them
    this.el.toast.classList.remove('on');
    this.el.banner.classList.remove('on');
    this.el.officer.classList.remove('on');
    this.count(0);
    this.tutor(null);
    l.zoneN = 0; l.pb = '';
    clearTimeout(this.zoneTimer); this.el.zone.classList.remove('on');
    this.el.tint.style.background = 'transparent'; this.el.tint.classList.remove('pulse');
    this.el.pb.classList.remove('on', 'beat');
    for (const k of this.chips.keys()) this.setChip(k, '', false);
  }

  /** The area banner and the coloured light of the area; shown when the run enters a new one. */
  private zone(z: { index: number; n: number } | undefined) {
    const l = this.last, e = this.el;
    if (!z) { if (l.zoneN) { l.zoneN = 0; e.tint.style.background = 'transparent'; e.tint.classList.remove('pulse'); e.zone.classList.remove('on'); } return; }
    if (z.n === l.zoneN) return;
    l.zoneN = z.n;
    const info = ZONES[z.index]!;
    e.tint.style.background = info.tint;
    e.tint.classList.toggle('pulse', info.id === 'evac');
    e.zone.style.setProperty('--c', info.accent);
    e.zoneNo.textContent = info.en; e.zoneTh.textContent = info.th; e.zoneTip.textContent = info.tip;
    e.zone.classList.add('on');
    clearTimeout(this.zoneTimer);
    this.zoneTimer = window.setTimeout(() => e.zone.classList.remove('on'), 4200);
  }

  /** Your best distance on this device, with a bar of how far along you are. */
  private personalBest(dist: number | undefined, pb: number | undefined) {
    const l = this.last, e = this.el;
    if (!pb || dist == null) { if (l.pb) { l.pb = ''; e.pb.classList.remove('on', 'beat'); } return; }
    const beat = dist > pb, key = beat ? 'beat' : String(pb);
    if (key !== l.pb) {
      l.pb = key; e.pb.classList.add('on'); e.pb.classList.toggle('beat', beat);
      e.pbText.textContent = beat ? 'ทำลายสถิติแล้ว!' : `สถิติ ${pb.toLocaleString('en-US')} ม.`;
    }
    e.pbBar.style.transform = `scaleX(${beat ? 1 : Math.min(1, Math.max(0, dist / pb)).toFixed(3)})`;
  }

  update(d: HudData) {
    const l = this.last, e = this.el;
    if (d.score !== l.score) { l.score = d.score; e.score.textContent = String(d.score); }
    if (d.coins !== l.coins) {
      if (l.coins >= 0 && d.coins > l.coins) { e.coinBox.classList.remove('pop'); void e.coinBox.offsetWidth; e.coinBox.classList.add('pop'); }
      l.coins = d.coins; e.coins.textContent = String(d.coins);
    }
    this.zone(d.zone);
    this.personalBest(d.dist, d.pb);
    const mult = d.mult ?? 1;
    this.setChip('mult', `x${mult}`, (d.combo ?? 0) > 0, mult >= 4 ? '#ff5a4a' : mult >= 3 ? '#ff7a1a' : '#ffd400');
    this.setChip('lift', `${Math.ceil(d.lift ?? 0)}s`, (d.lift ?? 0) > 0);
    this.setChip('estop', `${Math.ceil(d.slow ?? 0)}s`, (d.slow ?? 0) > 0);
    this.setChip('broom', `${Math.ceil(d.magnet ?? 0)}s`, (d.magnet ?? 0) > 0);
    this.setChip('hearts', 'x1', (d.hearts ?? 0) > 0);
    const dbl = d.dbl > 0 ? Math.ceil(d.dbl) : 0;
    if (dbl !== l.dbl) { l.dbl = dbl; e.x2.textContent = dbl ? `x2 ${dbl}s` : ''; }
    const key = PPE.filter(t => d.got.has(t)).join();
    if (key !== l.ppe) { l.ppe = key; for (const [t, s] of this.slots) s.classList.toggle('has', d.got.has(t)); }

    const sh = d.shield > 0 ? Math.round(d.shield / 8 * 200) / 200 : 0;
    if (sh !== l.shield) { l.shield = sh; e.shield.classList.toggle('on', sh > 0); e.shieldBar.style.transform = `scaleX(${sh})`; }

    if (d.toastT > 0) {
      if (d.toast !== l.toast) {
        l.toast = d.toast; e.toast.textContent = d.toast;
        e.toast.classList.remove('on'); void e.toast.offsetWidth; e.toast.classList.add('on');
      }
      const op = Math.round(Math.min(1, d.toastT * 2) * 20) / 20;
      if (op !== l.toastOp) { l.toastOp = op; e.toast.style.opacity = String(op); }
    } else if (l.toast) { l.toast = ''; l.toastOp = -1; e.toast.classList.remove('on'); e.toast.style.opacity = '0'; }

    this.surprise(d.sur);
  }

  private surprise(sur: Surprise | null) {
    const l = this.last, e = this.el;
    if (sur !== l.sur) {
      l.sur = sur; l.closing = false;
      e.officer.classList.remove('on'); e.banner.classList.remove('on');
      if (!sur) return;
      if (sur.k === 'officer') { e.ofMsg.textContent = sur.msg; e.officer.classList.add('on'); }
      else {
        e.bnMsg.textContent = sur.msg; e.bnSub.textContent = sur.sub ?? '';
        e.banner.style.setProperty('--c', BANNER_COLOR[sur.k]);
        e.banner.classList.add('on');
      }
    } else if (sur) {
      const closing = sur.dur - sur.t < .35;
      if (closing !== l.closing) {
        l.closing = closing;
        (sur.k === 'officer' ? e.officer : e.banner).classList.toggle('on', !closing);
      }
    }
  }

  /** Resume countdown number (0 hides it). */
  count(n: number) {
    if (n === this.last.count) return;
    this.last.count = n;
    const c = this.el.count;
    c.classList.remove('on');
    if (!n) return;
    c.textContent = String(n); void c.offsetWidth; c.classList.add('on');
  }

  /** Practice instructions. Pass null outside the tutorial. */
  tutor(t: Tutorial | null) {
    const e = this.el, l = this.last;
    if (!t) { e.tut.classList.remove('on'); e.tutOk.classList.remove('on'); e.tutArrow.className = 'tut-arrow'; l.tutKey = ''; l.arrow = ''; l.ok = -1; return; }
    const key = t.done ? 'done' : String(t.step);
    if (key !== l.tutKey) {
      l.tutKey = key;
      const st = t.current;
      e.tut.classList.add('on');
      e.tutHead.textContent = t.done ? 'ฝึกเสร็จแล้ว · Tutorial done' : `${TUT_HEAD[st.kind]} ${t.step + 1}/${STEPS.length} · Practice`;
      e.tutTh.textContent = t.done ? 'พร้อมแล้ว! เริ่มนับคะแนน' : st.th;
      e.tutEn.textContent = t.done ? 'เก็บ PPE ครบ 5 ชนิด = โล่กันชน' : st.en;
    }
    const arrow = !t.done && t.frozen ? 'tut-arrow on ' + t.current.g : 'tut-arrow';
    if (arrow !== l.arrow) { l.arrow = arrow; e.tutArrow.className = arrow; }
    const ok = t.okT > 0 ? Math.round(Math.min(1, t.okT * 2) * 20) / 20 : 0;
    if (ok !== l.ok) { l.ok = ok; e.tutOk.classList.toggle('on', ok > 0); e.tutOk.style.opacity = String(ok); }
  }
}
