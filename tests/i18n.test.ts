import { describe, expect, it } from 'vitest';
import { QB } from '../shared/questions.js';
import { TIPS } from '../shared/zones.js';
import { AV_EN_SIZES, QB_EN, avNameL, tr } from '../src/i18n/content.js';
import { bi } from '../src/i18n/index.js';
import { en } from '../src/i18n/en.js';
import { th } from '../src/i18n/th.js';
import { readFileSync } from 'node:fs';

describe('i18n', () => {
  it('has an English question for every Thai one, with the same number of answers', () => {
    expect(QB_EN.length).toBe(QB.length);
    QB.forEach((level, i) => {
      expect(QB_EN[i]!.length).toBe(level.length);
      level.forEach(([, choices], j) => expect(QB_EN[i]![j]![1].length).toBe(choices.length));
    });
  });

  it('translates every question, answer and tip into English', () => {
    for (const [prompt, choices] of QB.flat()) {
      expect(tr(prompt, 'en')).not.toMatch(/[฀-๿]/);
      for (const c of choices) expect(tr(c, 'en')).not.toMatch(/[฀-๿]/);
      expect(tr(prompt, 'th')).toBe(prompt);
    }
    for (const tip of TIPS) expect(tr(tip, 'en')).not.toMatch(/[฀-๿]/);
  });

  it('splits bilingual sim messages and names', () => {
    expect(tr('PPE ช่วยไว้! · Saved by PPE', 'th')).toBe('PPE ช่วยไว้!');
    expect(tr('PPE ช่วยไว้! · Saved by PPE', 'en')).toBe('Saved by PPE!');
    expect(tr('ชน! รถโฟล์คลิฟท์', 'en')).toBe('Hit! Forklift traffic');
    expect(tr('Toolbox Talk · +10 เหรียญ', 'en')).toBe('Toolbox Talk · +10 coins');
    expect(tr('ตอบถูก! +50 คะแนน พุ่ง! 🚀 · Bonus +50', 'th')).toBe('ตอบถูก! +50 คะแนน พุ่ง! 🚀');
    expect(bi('หมวกนิรภัยเหลือง · Hard hat', 'en')).toBe('Hard hat');
    expect(bi('หมวกนิรภัยเหลือง · Hard hat', 'th')).toBe('หมวกนิรภัยเหลือง');
    expect(bi('4 · ทองล้นตัว · Gold overflowing', 'th')).toBe('4 · ทองล้นตัว');
    expect(bi('4 · ทองล้นตัว · Gold overflowing', 'en')).toBe('4 · Gold overflowing');
    expect(bi('เอ็ม ออนิว', 'en')).toBe('เอ็ม ออนิว');
  });

  it('names player icons in both languages', () => {
    expect(AV_EN_SIZES.every(Boolean)).toBe(true);
    expect(avNameL(5, 'en')).not.toMatch(/[฀-๿]/);
    expect(avNameL(5, 'th')).toMatch(/[฀-๿]/);
  });

  it('has every key that index.html asks for, as plain text, in both languages', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    const keys = [...html.matchAll(/data-i18n(?:-html|-aria|-alt)?="([^"]+)"/g)].map(m => m[1]!);
    expect(keys.length).toBeGreaterThan(50);
    for (const k of keys) {
      expect(typeof (th as Record<string, unknown>)[k], k).toBe('string');
      expect(typeof (en as Record<string, unknown>)[k], k).toBe('string');
    }
  });
});
