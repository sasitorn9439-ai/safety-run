import type { Gate, PowerType, TourItem, TourView } from '../../shared/sim.js';
import { esc } from '../lib/dom.js';
import { GATE_COLORS, drawPowerIcon } from '../render/power-icons.js';

export const ITEMS: readonly [TourItem, string, string][] = [
  ['quiz', 'Safety Check', 'การ์ดเต็ม 3 เลน อ่านคำถามแล้ววิ่งเข้าประตู A/B/C ที่ถูก · ถูก = Safety Sprint พุ่ง 2 เท่า 3 วินาที · ผิด = ช้าลงครู่หนึ่ง'],
  ['loto', 'LOTO Lock', 'ตัดพลังงาน 8 วินาที ควันหยุดลอย ของไม่ตก ประกายไฟดับ'],
  ['foam', 'ถังดับเพลิง', 'เคลียร์อันตรายในเลนของตัวเองไปข้างหน้าประมาณ 3 วินาที'],
  ['buddy', 'Buddy System', 'เพื่อนช่วยนำทาง หลบให้อัตโนมัติ 5 วินาที'],
  ['streak', 'Zero Accident x2', 'คะแนนระยะทาง x2 นาน 15 วินาที หายทันทีถ้าชน'],
  ['audit', 'Spot Audit', 'ได้ +30 และส่งผู้ตรวจไปหาคนที่นำอยู่ เขาต้องตอบคำถามให้ถูก ไม่งั้นช้าลง'],
];

const icons = new Map<string, string>();
export function iconURL(t: PowerType, size = 64) {
  const key = `${t}:${size}`;
  let url = icons.get(key);
  if (!url) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const c = cv.getContext('2d')!;
    c.translate(size / 2, size / 2);
    drawPowerIcon(c, t, size * 0.92);
    icons.set(key, url = cv.toDataURL());
  }
  return url;
}

export const itemListHtml = () =>
  ITEMS.map(([t, name, text]) => `<li><img src="${iconURL(t)}" alt="" width="40" height="40"><div><b>${esc(name)}</b><span>${esc(text)}</span></div></li>`).join('');

/** the effects running right now, as chips */
export function fxHtml(t: TourView) {
  const chip = (icon: string, label: string, secs: number, cls = '') => `<span class="t-chip ${cls}">${icon}<b>${esc(label)}</b><small>${Math.ceil(secs)}</small></span>`;
  const img = (k: PowerType) => `<img src="${iconURL(k, 48)}" alt="" width="22" height="22">`;
  const out: string[] = [];
  if (t.sprint > 0) out.push(chip('🚀', 'Sprint', t.sprint, 'good'));
  if (t.think > 0) out.push(chip('🤔', 'Stop & Think', t.think, 'bad'));
  if (t.stun > 0) out.push(chip('💫', 'เซ', t.stun, 'bad'));
  if (t.loto > 0) out.push(chip(img('loto'), 'LOTO', t.loto));
  if (t.buddy > 0) out.push(chip(img('buddy'), 'Buddy', t.buddy));
  if (t.streak > 0) out.push(chip(img('streak'), 'x2', t.streak));
  return out.join('');
}

/** the question while its gates are on the way; `max` = the gates' distance when they appeared, for the bar */
export function gateHtml(g: Gate) {
  return GATE_COLORS.map((c, i) => `<div class="t-opt" style="--c:${c}"><b>${'ABC'[i]}</b><span>${esc(g.options[i])}</span></div>`).join('');
}

/** keeps one popup in step with the run's gate: fills it when a question comes up, empties it when it has gone by */
export class GatePanel {
  private shown: Gate | null = null;
  private max = 1;
  constructor(private el: { root: HTMLElement; head: HTMLElement; q: HTMLElement; opts: HTMLElement; bar?: HTMLElement }) {}
  update(g: Gate | null) {
    if (g !== this.shown) {
      this.shown = g;
      this.el.root.classList.toggle('on', !!g);
      if (g) {
        this.max = g.z;
        this.el.head.textContent = g.audit ? 'Spot Audit! ตอบให้ถูก ไม่งั้นช้าลง' : 'Safety Check · วิ่งเข้าประตูคำตอบที่ถูก';
        this.el.q.textContent = g.prompt;
        this.el.opts.innerHTML = gateHtml(g);
      }
    }
    if (g && this.el.bar) this.el.bar.style.transform = `scaleX(${Math.max(0, g.z / this.max)})`;
  }
}
