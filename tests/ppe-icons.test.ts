import { describe, expect, it } from 'vitest';
import { PPE } from '../shared/hazards.js';
import { PPE_ICONS, PPE_ICON_NAMES, PPE_ICON_OF, iconSvg } from '../src/render/ppe-icons.js';

describe('PPE flat vector icons', () => {
  it('has the eight icons from the reference sheet', () => {
    expect([...PPE_ICON_NAMES].sort()).toEqual(['boots', 'earmuffs', 'firstaid', 'glasses', 'gloves', 'helmet', 'mask', 'vest']);
  });

  it('maps every in-game pickup type to an icon', () => {
    for (const t of PPE) expect(PPE_ICON_NAMES).toContain(PPE_ICON_OF[t as keyof typeof PPE_ICON_OF]);
  });

  it('only uses supported path commands and stays inside the 100x100 box', () => {
    for (const name of PPE_ICON_NAMES) for (const l of PPE_ICONS[name]) {
      expect(l.d, `${name}/${l.name}`).toMatch(/^[MLHVCQAZ0-9 .,\-]+$/);
      expect(l.fill || l.stroke, `${name}/${l.name} paints`).toBeTruthy();
      const nums = (l.d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
      for (const n of nums) { expect(n).toBeGreaterThanOrEqual(-10); expect(n).toBeLessThanOrEqual(110); }
    }
  });

  it('exports well-formed standalone SVG with named layers', () => {
    for (const name of PPE_ICON_NAMES) {
      const svg = iconSvg(name, 64);
      expect(svg).toMatch(/^<svg [^>]*viewBox="0 0 100 100"/);
      expect(svg).toContain('width="64"');
      expect(svg.trim().endsWith('</svg>')).toBe(true);
      expect((svg.match(/<path /g) ?? []).length).toBe(PPE_ICONS[name].length);
    }
  });
});

import { POWER_ICONS, POWER_TYPES, powerIconSvg } from '../src/render/power-icons.js';

describe('power-up icons', () => {
  it('has one for every power-up', () => {
    expect([...POWER_TYPES].sort()).toEqual(['audit', 'broom', 'buddy', 'estop', 'firstaid', 'foam', 'gate0', 'gate1', 'gate2', 'lift', 'loto', 'quiz', 'toolbox']);
  });
  it('only uses supported path commands and stays inside the 100x100 box', () => {
    for (const t of POWER_TYPES) for (const l of POWER_ICONS[t]) {
      expect(l.d, `${t}/${l.name}`).toMatch(/^[MLHVCQAZ0-9 .,\-]+$/);
      expect(l.fill || l.stroke, `${t}/${l.name} paints`).toBeTruthy();
      for (const n of (l.d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number)) { expect(n).toBeGreaterThanOrEqual(-10); expect(n).toBeLessThanOrEqual(110); }
    }
  });
  it('exports well-formed standalone SVG', () => {
    for (const t of POWER_TYPES) {
      const svg = powerIconSvg(t, 64);
      expect(svg).toMatch(/^<svg [^>]*viewBox="0 0 100 100"/);
      expect(svg.trim().endsWith('</svg>')).toBe(true);
      expect((svg.match(/<path /g) ?? []).length).toBe(POWER_ICONS[t].length);
    }
  });
});
