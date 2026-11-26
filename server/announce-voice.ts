/**
 * The narration voice for the /announce deck, made on the server so the ElevenLabs key never reaches a browser and every device
 * shares one cache. Everything needs the admin key.
 *
 *   { action: 'status', lines?: [{ id, text }] }  what the server is set up for (voice gender, playback rate) and, for the given lines,
 *                                                 which are already cached and how many characters the rest would cost
 *   { action: 'clip', text }                      the audio for one line (mp3, base64): from the cache, or made now and cached
 *
 * A clip is cached under a hash of the voice, model, stability and the text, so a line whose text changes (a different winner) is
 * simply a new clip, and an old one can never be played for it. Set ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID to turn it on;
 * ELEVENLABS_MODEL (default eleven_v3, the Thai-capable one), ELEVENLABS_STABILITY (default 0: Creative), ELEVENLABS_VOICE_GENDER
 * (male|female, picks ครับ or ค่ะ in the script; default male) and ANNOUNCE_VOICE_RATE (playback speed; default 1.15) tune it.
 */
import crypto from 'node:crypto';
import { timingSafeKey, type Reply } from './handlers.js';
import type { Store } from './store.js';

type Json = Record<string, unknown>;
const reply = (status: number, body: unknown): Reply => ({ status, body });

const MAX_LINES = 60;
export const MAX_CHARS = 1500;

export function voiceConfig() {
  const e = process.env;
  const stability = Number(e.ELEVENLABS_STABILITY ?? 0);
  return {
    key: e.ELEVENLABS_API_KEY || '',
    voice: e.ELEVENLABS_VOICE_ID || '',
    model: e.ELEVENLABS_MODEL || 'eleven_v3',
    stability: Number.isFinite(stability) ? Math.min(1, Math.max(0, stability)) : 0,
    gender: e.ELEVENLABS_VOICE_GENDER === 'female' ? 'female' as const : 'male' as const,
    rate: Math.min(1.5, Math.max(0.75, Number(e.ANNOUNCE_VOICE_RATE) || 1.15)),
    url: (e.ELEVENLABS_API_URL || 'https://api.elevenlabs.io').replace(/\/$/, ''),
  };
}

const configured = (c = voiceConfig()) => !!(c.key && c.voice);
const hashOf = (c: ReturnType<typeof voiceConfig>, text: string) =>
  crypto.createHash('sha256').update(JSON.stringify({ v: c.voice, m: c.model, s: c.stability, text })).digest('hex');
const validText = (t: unknown): t is string => typeof t === 'string' && t.trim().length > 0 && t.length <= MAX_CHARS;

/** two requests for the same new line (two screens opened at once) make one clip */
const inflight = new Map<string, Promise<Buffer>>();

class ProviderError extends Error { constructor(readonly status: number) { super(`ElevenLabs ${status}`); } }

async function synthesize(c: ReturnType<typeof voiceConfig>, text: string, doFetch: typeof fetch): Promise<Buffer> {
  const r = await doFetch(`${c.url}/v1/text-to-speech/${encodeURIComponent(c.voice)}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': c.key, 'Content-Type': 'application/json' },
    // sentences on their own lines read as short pauses
    body: JSON.stringify({ text: text.split('\n').map(s => s.trim()).filter(Boolean).join('\n'), model_id: c.model, voice_settings: { stability: c.stability } }),
  });
  if (!r.ok) throw new ProviderError(r.status);
  return Buffer.from(await r.arrayBuffer());
}

export async function announceVoice(store: Store, b: Json, doFetch: typeof fetch = fetch): Promise<Reply> {
  if (!timingSafeKey(b.key)) return reply(401, { error: 'key' });
  await store.init();
  const c = voiceConfig();

  if (b.action === 'clip') {
    if (!validText(b.text)) return reply(400, { error: 'text' });
    const hash = hashOf(c, b.text);
    const hit = await store.getAudio(hash);
    if (hit) return reply(200, { audio: hit.toString('base64'), cached: true });
    if (!configured(c)) return reply(503, { error: 'not_configured' });
    try {
      let p = inflight.get(hash);
      if (!p) {
        p = synthesize(c, b.text, doFetch).then(async data => { await store.putAudio(hash, data); return data; }).finally(() => inflight.delete(hash));
        inflight.set(hash, p);
      }
      return reply(200, { audio: (await p).toString('base64'), cached: false });
    } catch (e) {
      if (e instanceof ProviderError) {
        // 429/5xx: try again shortly; anything else (a bad key, no credits left) will not get better by itself
        const busy = e.status === 429 || e.status >= 500;
        return reply(busy ? 503 : 502, { error: busy ? 'busy' : 'provider', status: e.status });
      }
      throw e;
    }
  }

  if (b.action !== undefined && b.action !== 'status') return reply(400, { error: 'action' });
  const out: Json = { configured: configured(c), gender: c.gender, rate: c.rate };
  if (Array.isArray(b.lines)) {
    const lines = b.lines.slice(0, MAX_LINES).filter((l): l is { id: string; text: string } => !!l && typeof l.id === 'string' && validText(l.text));
    const have = new Set(await store.hasAudio(lines.map(l => hashOf(c, l.text))));
    const missing = lines.filter(l => !have.has(hashOf(c, l.text)));
    out.cached = lines.filter(l => have.has(hashOf(c, l.text))).map(l => l.id);
    out.missing = missing.map(l => l.id);
    out.missingChars = missing.reduce((n, l) => n + l.text.length, 0);
  }
  return reply(200, out);
}
