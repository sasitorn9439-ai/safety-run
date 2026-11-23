import { describe, expect, it } from 'vitest';
import { finish, start } from '../server/handlers.js';
import { createMemoryStore } from '../server/memory-store.js';
import { isFinalFinishError } from '../src/lib/api.js';

describe('which /api/finish failures drop the unsent score', () => {
  it('keeps it for platform errors that say nothing about the run', () => {
    for (const status of [408, 413, 425, 429, 499]) expect(isFinalFinishError({ status })).toBe(false);
    expect(isFinalFinishError({ status: 403 })).toBe(false); // e.g. a proxy 403 with an HTML body
    expect(isFinalFinishError({ status: 500, error: 'server' })).toBe(false);
  });

  it('drops it for every rejection the finish handler returns for a bad run', async () => {
    const store = createMemoryStore();
    const s = (await start(store, { id: 'AB123' }, 'test')).body as { run: number; token: string };
    const rejected = [
      await finish(store, {}), // run missing
      await finish(store, { id: 'AB123', run: s.run, token: 'wrong', ticks: 1, inputs: [] }), // bad token
      await finish(store, { id: 'AB123', run: s.run, token: s.token, ticks: 5, inputs: [['up', 'x']] }), // replay fails
      await finish(store, { id: 'AB123', run: 999999, token: s.token, ticks: 1, inputs: [] }), // unknown run
    ];
    for (const r of rejected) {
      expect(r.status).toBeGreaterThanOrEqual(400);
      expect(isFinalFinishError({ status: r.status, error: (r.body as { error?: string }).error })).toBe(true);
    }
  });
});
