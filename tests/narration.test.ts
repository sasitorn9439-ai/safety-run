import { describe, expect, it } from 'vitest';
import { factsOf } from '../src/announce/calc.js';
import { demoPlayers } from '../src/announce/demo.js';
import { narrationFor } from '../src/announce/narration.js';

const facts = (scale = 1) => factsOf(demoPlayers(scale));
const text = (lines: ReturnType<typeof narrationFor>, id: string) => lines.find(l => l.id === id)?.text ?? '';

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

  it('says the real numbers, and the winner\'s id digit by digit', () => {
    const f = facts();
    const lines = narrationFor(f);
    expect(text(lines, 's-dist.enter')).toContain(`${Math.round(f.km)} กิโลเมตร`);
    const w = f.winners[0]!;
    const reveal = text(lines, 's-award-1.reveal');
    expect(reveal).toContain(w.id.split('').join(' '));
    expect(reveal).toContain(`${w.score} คะแนน`);
    expect(reveal).not.toContain('000');
  });

  it('switches the wording when the totals fall short of a lap, and adds the Moon only when it is reached', () => {
    const small = narrationFor(factsOf(demoPlayers(0.01)));
    expect(text(small, 's-globe.enter')).toContain('เปอร์เซ็นต์');
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
    expect(fixed).toEqual(['s-award-1.enter', 's-award-2.enter', 's-award-3.enter', 's-award-4.enter', 's-award-5.enter', 's-award-6.enter', 's-award-7.enter', 's-cover.enter', 's-end.enter']);
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
