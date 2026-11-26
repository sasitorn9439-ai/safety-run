/**
 * The spoken script for the announcement deck: what the host says on each slide, with the real numbers filled in.
 * Pure (facts in, lines out) so the voice tool (tools/announce-voice) and the tests can use it without a browser.
 *
 * One Line per spoken moment. `id` is `<slide id>.<when>`: `enter` plays when the slide appears, `reveal` plays after an
 * award's winner has been revealed. Sentences in a line are separated by a newline: the voice tool turns each break into a pause.
 * Thai TTS reads digits and "จุด" well, so numbers are written as plain digits (no thousands commas).
 *
 * The host is a game-show host: lines carry delivery tags in square brackets, `[excited]`, `[curious]`, `[whispers]`, which Eleven v3
 * acts out. The voice tool strips them for providers that would read them aloud (see providers.mjs), so they cost nothing elsewhere.
 * A few light jokes (safety, traffic, fuel prices) are sprinkled in, about one slide in three, never at a winner's expense and never in a
 * line that names a winner except the closing cheer. They avoid pronouns so the same line works for either voice.
 */
import { avName } from '../../shared/avatar.js';
import { th } from '../i18n/th.js';
import { OVERRIDES } from './narration-overrides.js';
import { EARTH_KM, MOON_KM, THAILAND_KM, dayHours, wantsMoon, type Facts } from './calc.js';

/** `data`: the text depends on the results (totals, winners). Lines without it can be made before the data is final. */
export interface Line { id: string; slide: string; when: 'enter' | 'reveal'; text: string; data: boolean }
export type Gender = 'female' | 'male';
export interface NarrationOptions {
  /** picks the polite particles: female ค่ะ / นะคะ, male ครับ / นะครับ */
  gender?: Gender;
  /** the moment the data was cut off; said once on the interlude */
  cutoff?: Date | string;
}

/** whole number as digits, no separators: 39684 */
const int = (n: number) => String(Math.round(n));
/** one decimal, spoken with "จุด": 33.5 → "33 จุด 5" (a .0 is dropped) */
function dec(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : String(r).replace('.', ' จุด ');
}
/** an employee id read digit by digit: 1323 → "1 3 2 3" */
const digits = (id: string) => id.split('').join(' ');
/** "หมวกแดง #2" is written with a hash for the second lap of avatars: say it as a number */
const spokenAvatar = (n: number | null) => avName(n).replace(/\s*#(\d+)/, ' หมายเลข $1');

function particles(g: Gender) {
  return g === 'male' ? { end: 'ครับ', soft: 'นะครับ', q: 'ครับ' } : { end: 'ค่ะ', soft: 'นะคะ', q: 'คะ' };
}
type P = ReturnType<typeof particles>;

/** the prize as it is said aloud, by rank */
export function spokenPrize(rank: number): string {
  if (rank === 1) return `${th.prize1Item.replace('(Smartwatch)', '').trim()} สมาร์ทวอทช์`;
  if (rank <= 5) return th.prize2Item;
  return 'ร่มพับอัตโนมัติ จาก BEZ';
}

/** "27 พฤศจิกายน เวลา 8 นาฬิกา" in Thailand time */
function spokenCutoff(at: Date | string): string {
  const d = new Date(at);
  const parts = new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'long', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(d);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '';
  const h = +get('hour'), m = +get('minute');
  return `${get('day')} ${get('month')} เวลา ${h} นาฬิกา${m ? ` ${m} นาที` : ''}`;
}

/** what is said when an award slide appears: the place and the prize, ending on a hushed build-up to the click */
function awardEnter(rank: number, prize: string, p: P): string {
  switch (rank) {
    case 7: return `[excited] อันดับที่ 7 ${p.end}!\nรางวัลที่รออยู่ คือ ${prize}!\n[curious] แล้วใครจะเป็นเจ้าของ... ลุ้นไปพร้อมกัน${p.soft}`;
    case 6: return `[excited] ต่อกันที่อันดับที่ 6 ${p.end}!\nรางวัลยังคงเป็น ${prize}!\n[curious] ผู้โชคดีคนต่อไปคือใคร${p.q}... ลุ้นกัน`;
    case 5: return `[excited] มาถึงกลุ่มรางวัลบัตรเติมน้ำมันแล้ว ${p.end}!\nอันดับที่ 5 รับ ${prize}!\n[chuckles] ช่วงนี้น้ำมันแพง ใครได้ไปคงยิ้มกว้างแน่ ๆ\n[curious] แล้วใครจะเป็นผู้โชคดี${p.q}`;
    case 4: return `[excited] อันดับที่ 4 ${p.end}!\nรางวัลคือ ${prize}!\n[curious] ลุ้นกันต่อ${p.soft}`;
    case 3: return `[excited] เข้าสู่สามอันดับสุดท้ายแล้ว ${p.end}!\nอันดับที่ 3 รับ ${prize}!\n[whispers] ใครจะได้ขึ้นโพเดียมเป็นคนแรก...`;
    case 2: return `[excited] อันดับที่ 2 ${p.end}!\nรางวัลคือ ${prize}!\n[whispers] ใครคือผู้ที่ตามหลังแชมป์มาติด ๆ${p.q}...`;
    case 1: return `[excited] และแล้ว... ก็มาถึงรางวัลสูงสุดของงานนี้!\nอันดับที่ 1 ${p.end}!\nรางวัลคือ ${prize}!\nสำหรับผู้ที่ทำคะแนนสูงสุดใน Safety Run\n[whispers] ใครจะเป็นแชมป์... ลุ้นพร้อมกันเลย${p.q}`;
    default: return `[excited] อันดับที่ ${rank} ${p.end}!\nรางวัลคือ ${prize}!\n[curious] ใครจะเป็นผู้โชคดี${p.q}`;
  }
}

/** what is said once the winner is on screen */
function awardReveal(rank: number, who: { avatar: string; id: string; score: number }, p: P): string {
  const facts = `อันดับที่ ${rank} คือ ผู้ใช้อวาตาร์ ${who.avatar}!\nรหัสพนักงาน ${digits(who.id)}\nด้วยคะแนน ${int(who.score)} คะแนน!`;
  if (rank === 1) return `[excited] ขอแสดงความยินดีกับแชมป์ Safety Run ของเรา ${p.end}!\n${facts}\n[laughs] ขอเสียงปรบมือดัง ๆ จนมือแดงเลย${p.end}!`;
  const open = rank === 2 ? 'ยินดีด้วย' : rank === 3 ? 'ขอแสดงความยินดี' : 'ขอแสดงความยินดีด้วย';
  return `[excited] ${open} ${p.end}!\n${facts}\nขอเสียงปรบมือให้ผู้ได้รับรางวัลด้วย${p.soft}!`;
}

export function narrationFor(f: Facts, opts: NarrationOptions = {}): Line[] {
  const p = particles(opts.gender ?? 'female');
  const lines: Line[] = [];
  // a particle sits right against a Thai word before it: "ด้วยค่ะ", not "ด้วย ค่ะ" (after a number or Latin word the space stays)
  const tidy = (t: string) => t.replace(/([\u0E00-\u0E7F]) (ค่ะ|ครับ|คะ|นะคะ|นะครับ)(?=\s|$|[!?.])/g, '$1$2');
  const add = (slide: string, text: string, when: Line['when'] = 'enter', data = true) => lines.push({ id: `${slide}.${when}`, slide, when, text: OVERRIDES[`${slide}.${when}`] ?? tidy(text), data });

  add('s-cover', [
    `[excited] สวัสดี${p.end}ทุกคน!`,
    `ยินดีต้อนรับสู่การประกาศผลรางวัล Safety Run ในงาน EHS Day 2026 ${p.end}!`,
    'ตลอดช่วงที่ผ่านมา ทุกคนได้วิ่งหลบอันตราย เก็บอุปกรณ์ PPE และตอบคำถามเซฟตี้กัน',
    `ใครเคยวิ่งชนกรวย ชนกล่อง ชนทุกอย่างที่ขวางหน้า... ไม่ต้องอายนะ${p.end} เพราะทั้งห้องนี้ก็เคยเหมือนกัน [chuckles]`,
    '[excited] และวันนี้ ถึงเวลาเฉลยแล้ว ว่าใครคือสุดยอดนักวิ่งทั้งเจ็ดคน!',
    `แต่ก่อนอื่น ขอเล่าเกร็ดสนุก ๆ ให้ฟังสักนิด${p.soft}`,
  ].join('\n'), 'enter', false);

  add('s-dist', [
    `[excited] ผู้เล่นทั้งหมด ${int(f.players)} คน วิ่งไปรวมกัน ${int(f.plays)} ครั้ง!`,
    `ได้ระยะทางทั้งหมด ${int(f.km)} กิโลเมตรเลย ${p.end}!`,
    f.players ? `เฉลี่ยแล้ว คนละ ${dec(f.km / f.players)} กิโลเมตรเลยทีเดียว!` : '',
    '[chuckles] แต่ย้ำนะ' + p.end + ' วิ่งแบบนี้ได้แค่ในเกม ในโรงงานจริง เดินอย่างปลอดภัยเท่านั้น',
  ].filter(Boolean).join('\n'));

  if (f.thaiLaps >= 1) {
    add('s-thai', [
      '[curious] ถ้าเอาระยะทางนี้มาต่อกัน...',
      'วิ่งจากเบตง จังหวัดยะลา ใต้สุดของประเทศไทย',
      `ไปจนถึงแม่สาย จังหวัดเชียงราย เหนือสุดของประเทศ ซึ่งยาวประมาณ ${int(THAILAND_KM)} กิโลเมตร`,
      `[excited] จะวิ่งได้ ${dec(f.thaiLaps)} รอบเลย ${p.end}!`,
      f.thaiLaps >= 2 ? `ถ้านับเป็นไปกลับ ก็ราว ${dec(f.thaiLaps / 2)} เที่ยวเลยทีเดียว! [chuckles] แถมไม่ต้องเจอรถติดด้วย` : '',
    ].filter(Boolean).join('\n'));
  } else {
    add('s-thai', [
      '[curious] ถ้าเอาระยะทางนี้มาต่อกัน...',
      'วิ่งจากเบตง ใต้สุดของประเทศ ขึ้นเหนือไปทางแม่สาย จังหวัดเชียงราย',
      `ไปได้ ${int(f.thaiLaps * 100)} เปอร์เซ็นต์ของความยาวประเทศ ${p.end}!`,
      `เหลืออีก ${int(THAILAND_KM - f.km)} กิโลเมตร จะถึงแม่สาย [chuckles] อย่างน้อยก็ไม่ต้องเจอรถติด`,
    ].join('\n'));
  }

  if (f.earthLaps >= 1) {
    add('s-globe', [
      '[curious] แล้วถ้าวิ่งรอบโลกล่ะ...',
      `เส้นรอบวงโลกที่เส้นศูนย์สูตร ยาวประมาณ ${int(EARTH_KM)} กิโลเมตร`,
      `[excited] ระยะรวมของพวกเรา วิ่งรอบโลกได้ ${dec(f.earthLaps)} รอบเลย ${p.end}!`,
      `ครบรอบโลกแล้ว และยังเหลืออีก ${int(f.km - Math.floor(f.earthLaps) * EARTH_KM)} กิโลเมตร!`,
    ].join('\n'));
  } else {
    add('s-globe', [
      '[curious] แล้วถ้าวิ่งรอบโลกล่ะ...',
      `เส้นรอบวงโลกยาวประมาณ ${int(EARTH_KM)} กิโลเมตร`,
      `ตอนนี้พวกเราวิ่งไปได้ ${int(f.earthLaps * 100)} เปอร์เซ็นต์ของหนึ่งรอบโลก ${p.end}!`,
      `เหลืออีก ${int(EARTH_KM - f.km)} กิโลเมตร จะครบรอบ`,
    ].join('\n'));
  }

  if (wantsMoon(f)) {
    add('s-moon', [
      '[curious] ไกลกว่านั้นอีก...',
      `ระยะจากโลกไปดวงจันทร์ ประมาณ ${int(MOON_KM)} กิโลเมตร`,
      `[excited] พวกเราวิ่งไปดวงจันทร์ได้ ${dec(f.moonTrips)} เที่ยวเลย ${p.end}!`,
    ].join('\n'));
  }

  const { d, h } = dayHours(f.secs);
  add('s-time', [
    '[curious] แล้วเวลาที่ทุกคนใช้เล่นรวมกันล่ะ...',
    `[excited] ทั้งหมด ${int(f.hours)} ชั่วโมง!`,
    f.days >= 1 ? `คิดเป็นประมาณ ${dec(f.days)} วัน หรือก็คือ ${d} วัน ${h} ชั่วโมง ${p.end}!` : `ยังไม่ถึงหนึ่งวันเต็ม ${p.end}`,
    'ถ้าเปิดเกมวิ่งต่อเนื่อง ไม่หลับไม่นอนเลย ก็ต้องใช้เวลาขนาดนี้เลยทีเดียว',
    `[mischievously] หวังว่าทุกคนเล่นกันตอนพักเที่ยงนะ${p.end} ไม่ใช่ในเวลางาน [laughs]`,
  ].join('\n'));

  add('s-intro', [
    `[excited] เอาล่ะ${p.end}! ถึงเวลาที่ทุกคนรอคอยแล้ว! เตรียมใจ เตรียมมือ เตรียมปรบมือให้พร้อม!`,
    `ประกาศผลรางวัล Top 7 จากผู้เล่นทั้งหมด ${int(f.players)} คน นับคะแนนสูงสุดของแต่ละคน`,
    opts.cutoff ? `โดยนับข้อมูลถึงวันที่ ${spokenCutoff(opts.cutoff)}` : '',
    'เราจะเริ่มจากอันดับที่ 7 แล้วไล่ขึ้นไปจนถึงอันดับที่ 1',
    `รางวัลอันดับที่ 1 คือ ${spokenPrize(1)}!`,
    `อันดับที่ 2 ถึง 5 รับ ${spokenPrize(2)}`,
    `ส่วนอันดับที่ 6 และ 7 รับ ${spokenPrize(6)}`,
    `[excited] พร้อมกันหรือยัง${p.q}!`,
  ].filter(Boolean).join('\n'));

  // one pair per place, 7th first, as the deck shows them
  for (const w of [...f.winners].reverse()) {
    const slide = `s-award-${w.rank}`;
    add(slide, awardEnter(w.rank, spokenPrize(w.rank), p), 'enter', false);
    add(slide, awardReveal(w.rank, { avatar: spokenAvatar(w.avatar), id: w.id, score: w.score }, p), 'reveal');
  }

  add('s-end', [
    `[excited] ขอบคุณทุกคนที่ร่วมวิ่งไปด้วยกัน${p.soft}!`,
    `ขอแสดงความยินดีกับผู้ได้รับรางวัลทั้ง ${f.winners.length} ท่าน`,
    'และอย่าลืมว่า ปลอดภัยไว้ก่อน ทุกครั้งที่ทำงาน',
    `[chuckles] ขากลับบ้าน ไม่ต้องวิ่งนะ${p.end} เดินอย่างปลอดภัย`,
    `แล้วพบกันใหม่${p.end}!`,
  ].join('\n'), 'enter', false);   // says how many winners there are, which is 7 unless fewer than 7 people have played

  return lines;
}
