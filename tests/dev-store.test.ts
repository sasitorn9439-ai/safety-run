import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { wardrobe } from '../server/handlers.js';
import { createMemoryStore } from '../server/memory-store.js';
import { cosmetic } from '../src/cosmetics/wardrobe.js';

type Body = Record<string, any>;
const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });

describe('dev store', () => {
  it('keeps opened chests and worn items across a restart', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-dev-')); dirs.push(dir);
    const file = path.join(dir, 'nested', 'store.json');

    const before = createMemoryStore(file);
    await before.avatarOf('1001');
    await before.grantBoxes(['1001'], 3);
    const opened = (await wardrobe(before, { id: '1001', action: 'open', n: 2 })).body as Body;
    const item = opened.owned[0] as string, slot = cosmetic(item)!.slot;
    const worn = (await wardrobe(before, { id: '1001', action: 'equip', slot, item })).body as Body;

    const after = createMemoryStore(file);                      // the dev server restarted
    expect((await wardrobe(after, { id: '1001' })).body).toEqual(worn);
    expect(((await wardrobe(after, { id: '1001' })).body as Body).boxes).toBe(1);
    expect(await after.avatarOf('1001')).toBe(0);
    expect(await after.avatarOf('1002')).toBe(1);                // new players still get the next avatar
  });

  it('starts empty when there is no file yet', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-dev-')); dirs.push(dir);
    const store = createMemoryStore(path.join(dir, 'store.json'));
    expect((await wardrobe(store, { id: '1001' })).body).toEqual({ boxes: 0, owned: [], equipped: {}, dupes: 0 });
  });
});
