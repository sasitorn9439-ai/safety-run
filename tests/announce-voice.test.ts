import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { announceVoice } from '../server/announce-voice.js';
import { createMemoryStore } from '../server/memory-store.js';
import type { Store } from '../server/store.js';

type Body = Record<string, any>;
const MP3 = Buffer.from('ID3-fake-mp3-bytes');
let store: Store;
const env = { ...process.env };

/** a stand-in for ElevenLabs that counts calls */
const fakeProvider = (status = 200) => vi.fn(async () => new Response(status === 200 ? MP3 : 'no', { status })) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
const call = (b: Body, f = fakeProvider()) => announceVoice(store, { key: 'secret', ...b }, f);

beforeEach(() => {
  store = createMemoryStore();
  process.env.ADMIN_KEY = 'secret';
  process.env.ELEVENLABS_API_KEY = 'xi-test';
  process.env.ELEVENLABS_VOICE_ID = 'voice1';
  delete process.env.ELEVENLABS_STABILITY; delete process.env.ELEVENLABS_MODEL; delete process.env.ELEVENLABS_VOICE_GENDER; delete process.env.ANNOUNCE_VOICE_RATE;
});
afterEach(() => { process.env = { ...env }; });

describe('announce voice', () => {
  it('needs the admin key', async () => {
    expect((await announceVoice(store, { action: 'status' })).status).toBe(401);
    expect((await announceVoice(store, { key: 'nope', action: 'clip', text: 'x' })).status).toBe(401);
  });

  it('says how it is set up: configured, voice gender and playback rate', async () => {
    const r = (await call({ action: 'status' })).body as Body;
    expect(r).toMatchObject({ configured: true, gender: 'male', rate: 1.15 });
    process.env.ELEVENLABS_VOICE_GENDER = 'female'; process.env.ANNOUNCE_VOICE_RATE = '1.3';
    expect((await call({})).body).toMatchObject({ gender: 'female', rate: 1.3 });
    delete process.env.ELEVENLABS_API_KEY;
    expect(((await call({ action: 'status' })).body as Body).configured).toBe(false);
  });

  it('makes a clip once, keeps it, and serves it from the cache without calling the provider again', async () => {
    const f = fakeProvider();
    const a = (await call({ action: 'clip', text: '[excited] สวัสดีครับ' }, f)).body as Body;
    expect(Buffer.from(a.audio, 'base64')).toEqual(MP3);
    expect(a.cached).toBe(false);
    const b = (await call({ action: 'clip', text: '[excited] สวัสดีครับ' }, f)).body as Body;
    expect(b.cached).toBe(true);
    expect(f).toHaveBeenCalledTimes(1);
    // the key and the voice go to ElevenLabs, with the model and stability from the environment
    const [url, init] = (f as any).mock.calls[0];
    expect(url).toContain('/v1/text-to-speech/voice1');
    expect(init.headers['xi-api-key']).toBe('xi-test');
    expect(JSON.parse(init.body)).toMatchObject({ model_id: 'eleven_v3', voice_settings: { stability: 0 } });
  });

  it('two screens asking for the same new line make one clip', async () => {
    const f = fakeProvider();
    await Promise.all([call({ action: 'clip', text: 'พร้อมกันหรือยัง' }, f), call({ action: 'clip', text: 'พร้อมกันหรือยัง' }, f)]);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('lists which lines are cached and what the rest would cost, so the page can ask before spending', async () => {
    const lines = [{ id: 'a', text: 'หนึ่ง' }, { id: 'b', text: 'สองสาม' }];
    let r = (await call({ action: 'status', lines })).body as Body;
    expect(r).toMatchObject({ cached: [], missing: ['a', 'b'], missingChars: 11 });
    await call({ action: 'clip', text: 'หนึ่ง' });
    r = (await call({ action: 'status', lines })).body as Body;
    expect(r).toMatchObject({ cached: ['a'], missing: ['b'], missingChars: 6 });
  });

  it('a changed text is a new clip: the old recording is never used for it', async () => {
    const f = fakeProvider();
    await call({ action: 'clip', text: 'อันดับที่ 1 คือ รหัส 1 3 2 3' }, f);
    const r = (await call({ action: 'status', lines: [{ id: 'x', text: 'อันดับที่ 1 คือ รหัส 1 0 0 8' }] })).body as Body;
    expect(r.cached).toEqual([]);
  });

  it('does not make clips when it is not configured, but still serves what is cached', async () => {
    await call({ action: 'clip', text: 'cached line' });
    delete process.env.ELEVENLABS_API_KEY;
    expect((await call({ action: 'clip', text: 'cached line' })).body).toMatchObject({ cached: true });
    const r = await call({ action: 'clip', text: 'new line' });
    expect(r.status).toBe(503);
    expect((r.body as Body).error).toBe('not_configured');
  });

  it('tells a busy provider from a broken one, and keeps nothing from a failure', async () => {
    const busy = await call({ action: 'clip', text: 'a' }, fakeProvider(429));
    expect([busy.status, (busy.body as Body).error]).toEqual([503, 'busy']);
    const broken = await call({ action: 'clip', text: 'a' }, fakeProvider(402));
    expect([broken.status, (broken.body as Body).error]).toEqual([502, 'provider']);
    expect((await call({ action: 'status', lines: [{ id: 'a', text: 'a' }] })).body).toMatchObject({ cached: [] });
  });

  it('refuses empty, oversized and unknown requests', async () => {
    expect((await call({ action: 'clip', text: '  ' })).status).toBe(400);
    expect((await call({ action: 'clip', text: 'x'.repeat(1501) })).status).toBe(400);
    expect((await call({ action: 'clip' })).status).toBe(400);
    expect((await call({ action: 'dance' })).status).toBe(400);
  });
});
