import { describe, expect, it } from 'vitest';
import { factsOf } from '../src/announce/calc.js';
import { demoPlayers } from '../src/announce/demo.js';
import { narrationFor, thaiNumber } from '../src/announce/narration.js';

const facts = (scale = 1) => factsOf(demoPlayers(scale));
const text = (lines: ReturnType<typeof narrationFor>, id: string) => lines.find(l => l.id === id)?.text ?? '';

describe('numbers in Thai words', () => {
  const cases: [number, string][] = [
    [0, 'ศูนย์'], [1, 'หนึ่ง'], [2, 'สอง'], [9, 'เก้า'], [10, 'สิบ'], [11, 'สิบเอ็ด'], [12, 'สิบสอง'], [20, 'ยี่สิบ'], [21, 'ยี่สิบเอ็ด'], [25, 'ยี่สิบห้า'],
    [31, 'สามสิบเอ็ด'], [100, 'หนึ่งร้อย'], [101, 'หนึ่งร้อยเอ็ด'], [110, 'หนึ่งร้อยสิบ'], [111, 'หนึ่งร้อยสิบเอ็ด'], [500, 'ห้าร้อย'],
    [1000, 'หนึ่งพัน'], [1001, 'หนึ่งพันเอ็ด'], [2020, 'สองพันยี่สิบ'], [10000, 'หนึ่งหมื่น'], [100000, 'หนึ่งแสน'],
    [123456, 'หนึ่งแสนสองหมื่นสามพันสี่ร้อยห้าสิบหก'], [345307, 'สามแสนสี่หมื่นห้าพันสามร้อยเจ็ด'], [999999, 'เก้าแสนเก้าหมื่นเก้าพันเก้าร้อยเก้าสิบเก้า'],
    [1_000_000, 'หนึ่งล้าน'], [1_000_001, 'หนึ่งล้านเอ็ด'], [1_234_567, 'หนึ่งล้านสองแสนสามหมื่นสี่พันห้าร้อยหกสิบเจ็ด'], [11_000_000, 'สิบเอ็ดล้าน'], [21_000_000, 'ยี่สิบเอ็ดล้าน'],
  ];
  it.each(cases)('%i is said %s', (n, words) => { expect(thaiNumber(n)).toBe(words); });

  it('rounds, and says a minus', () => {
    expect(thaiNumber(12.6)).toBe('สิบสาม');
    expect(thaiNumber(-5)).toBe('ลบห้า');
  });

  it('is used for every number the host says: scores, totals, runs, laps; employee ids stay digit by digit', () => {
    const f = facts();
    const lines = narrationFor(f);
    const w = f.winners[0]!, fan = f.fans[0]!;
    expect(text(lines, 's-award-1.reveal')).toContain(`ด้วยคะแนน ${thaiNumber(w.score)} คะแนน`);
    expect(text(lines, 's-award-1.reveal')).toContain(w.id.split('').join(' '));
    expect(text(lines, 's-fan-1.reveal')).toContain(`เล่นไปทั้งหมด ${thaiNumber(fan.plays)} ครั้ง`);
    expect(text(lines, 's-dist.enter')).toContain(`${thaiNumber(f.km)} กิโลเมตร`);
    expect(text(lines, 's-time.enter')).toContain(`${thaiNumber(f.hours)} ชั่วโมง`);
    // no spoken data number is left as digits: only the id (spaced digits), the year of the event, Top 7 and the place numbers remain
    for (const l of lines) expect(l.text.replace(/EHS Day 2026|Top 7|HUAWEI Band 11|\d(?: \d)+|อันดับที่ \d|คนที่ \d|ถึง \d|และ \d/g, '')).not.toMatch(/\d{2,}/);
  });

  it('says the fuel card amount in words too', () => {
    expect(text(narrationFor(facts()), 's-award-5.enter')).toContain('ห้าร้อย');
    expect(text(narrationFor(facts()), 's-award-5.enter')).not.toContain('500');
  });
});

describe('announce narration', () => {
  it('has an enter line for every fixed slide and an enter + reveal pair for every winner, in deck order', () => {
    const lines = narrationFor(facts());
    const ids = lines.map(l => l.id);
    expect(ids.slice(0, 2)).toEqual(['s-cover.enter', 's-dist.enter']);
    expect(ids).toContain('s-intro.enter');
    expect(ids.indexOf('s-award-7.enter')).toBeLessThan(ids.indexOf('s-award-7.reveal'));
    expect(ids.indexOf('s-award-7.reveal')).toBeLessThan(ids.indexOf('s-award-1.enter'));
    expect(ids.at(-1)).toBe('s-end.enter');
    for (let r = 1; r <= 7; r++) { expect(ids).toContain(`s-award-${r}.enter`); expect(ids).toContain(`s-award-${r}.reveal`); }
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has the two super fans before the Top 7, each with an enter and a reveal that says how many runs', () => {
    const f = facts();
    const lines = narrationFor(f), ids = lines.map(l => l.id);
    expect(ids.indexOf('s-fan-2.enter')).toBeLessThan(ids.indexOf('s-fan-1.enter'));
    expect(ids.indexOf('s-fan-1.reveal')).toBeLessThan(ids.indexOf('s-intro.enter'));
    const fan = f.fans[0]!;
    expect(text(lines, 's-fan-1.reveal')).toContain(fan.id.split('').join(' '));
    expect(text(lines, 's-fan-1.reveal')).toContain(`${thaiNumber(fan.plays)} ครั้ง`);
    expect(text(lines, 's-fan-2.enter')).toContain('แฟนพันธุ์แท้');      // the first one shown explains the prize
  });

  it('says the real numbers, and the winner\'s id digit by digit', () => {
    const f = facts();
    const lines = narrationFor(f);
    expect(text(lines, 's-dist.enter')).toContain(`${thaiNumber(f.km)} กิโลเมตร`);
    const w = f.winners[0]!;
    const reveal = text(lines, 's-award-1.reveal');
    expect(reveal).toContain(w.id.split('').join(' '));
    expect(reveal).toContain(`${thaiNumber(w.score)} คะแนน`);
    expect(reveal).not.toContain('000');
  });

  it('switches the wording when the totals fall short of a lap, and adds the Moon only when it is reached', () => {
    const small = narrationFor(factsOf(demoPlayers(0.01)));
    expect(text(small, 's-thai.enter')).toContain('เปอร์เซ็นต์');
    expect(small.some(l => l.id === 's-globe.enter')).toBe(false);   // there is no round-the-world slide any more
    expect(small.some(l => l.id === 's-moon.enter')).toBe(false);
    const huge = narrationFor(facts(60));
    expect(huge.some(l => l.id === 's-moon.enter')).toBe(true);
  });

  it('uses ค่ะ or ครับ by gender, with the particle against its word', () => {
    const f = facts();
    const female = narrationFor(f, { gender: 'female' }).map(l => l.text).join('\n');
    const male = narrationFor(f, { gender: 'male' }).map(l => l.text).join('\n');
    expect(female).toContain('ค่ะ'); expect(female).not.toContain('ครับ');
    expect(male).toContain('ครับ'); expect(male).not.toContain('ค่ะ');
    expect(female).not.toMatch(/[\u0E00-\u0E7F] ค่ะ/);   // against a Thai word
    expect(female).toContain('2026 ค่ะ');                  // but a number or Latin word keeps its space, so TTS reads it cleanly
    expect(female).toContain('ด้วยคะแนน');
    expect(female).not.toContain('คะแนนคะ');
  });

  it('says when the data was cut off', () => {
    const t = text(narrationFor(facts(), { cutoff: '2026-11-27T01:00:00Z' }), 's-intro.enter');
    expect(t).toContain('27 พฤศจิกายน');
    expect(t).toContain('8 นาฬิกา');
  });

  it('marks the lines that never depend on the results, so they can be made before the data is final', () => {
    const lines = narrationFor(facts());
    const fixed = lines.filter(l => !l.data).map(l => l.id).sort();
    expect(fixed).toEqual(['s-award-1.enter', 's-award-2.enter', 's-award-3.enter', 's-award-4.enter', 's-award-5.enter', 's-award-6.enter', 's-award-7.enter', 's-cover.enter', 's-end.enter', 's-fan-1.enter', 's-fan-2.enter']);
    // and they really do not change with the data
    const other = narrationFor(facts(7), { cutoff: '2026-11-27T01:00:00Z' });
    for (const l of lines.filter(l => !l.data)) expect(other.find(o => o.id === l.id)!.text).toBe(l.text);
  });

  it('changes only the lines that depend on what changed: the fun facts and the winners, not the prize announcements', () => {
    const a = narrationFor(facts()), rows = demoPlayers();
    rows[0]!.best = 999_990;       // a new champion: the totals stay (almost), the ranking moves
    const b = narrationFor(factsOf(rows));
    const changed = a.filter((l, i) => l.text !== b[i]!.text).map(l => l.id);
    expect(changed).toContain('s-award-1.reveal');
    for (const id of ['s-cover.enter', 's-award-7.enter', 's-award-1.enter', 's-end.enter']) expect(changed).not.toContain(id);
  });
});
