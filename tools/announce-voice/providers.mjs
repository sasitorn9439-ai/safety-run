/**
 * Text-to-speech providers for the announcement narration. Each one turns a line of script into an audio Buffer.
 * Lines hold sentences separated by "\n": the SSML providers turn each break into a short pause, the others get a blank line.
 * Keys come from environment variables only (never the command line, never the repo).
 *
 * Only `say` has been run end to end on a machine without keys; the three paid providers follow their documented REST APIs, but
 * check the voice names against the provider's current voice list before the first real run.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PAUSE_MS = 380;
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** delivery tags such as [excited] are for Eleven v3 only; every other voice would read them out, so they are dropped */
export const withoutTags = text => text.replace(/\[[^\]\n]*\]\s*/g, '');
const sentences = text => text.split('\n').map(s => s.trim()).filter(Boolean);
const ssmlBody = text => sentences(text).map(esc).join(`<break time="${PAUSE_MS}ms"/>`);
const need = name => {
  const v = process.env[name];
  if (!v) throw new Error(`set ${name} in the environment first`);
  return v;
};

async function post(url, init, what) {
  const r = await fetch(url, { method: 'POST', ...init });
  if (!r.ok) throw new Error(`${what} failed: ${r.status} ${(await r.text()).slice(0, 300)}`);
  return r;
}

export const PROVIDERS = {
  /** macOS built-in voice (Kanya, Thai): free and offline, robotic. For rehearsing the pipeline and the timing. */
  say: {
    paid: false,
    nativeRate: true,
    voice: () => 'Kanya',
    async synth(raw, { voice, rate }) {
      const text = withoutTags(raw);
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'say-'));
      const aiff = path.join(tmp, 'clip.aiff');
      // `say -r` is words per minute; the default is about 175
      execFileSync('say', ['-v', voice, '-r', String(Math.round(175 * rate)), '-o', aiff, sentences(text).join('. ')]);
      const wav = fs.readFileSync(aiff);
      fs.rmSync(tmp, { recursive: true, force: true });
      return { data: wav, ext: 'aiff' };
    },
  },

  /** Azure AI Speech, Thai neural voices. Needs AZURE_SPEECH_KEY and AZURE_SPEECH_REGION (e.g. southeastasia). */
  azure: {
    paid: true,
    nativeRate: true,
    voice: gender => gender === 'male' ? 'th-TH-NiwatNeural' : 'th-TH-PremwadeeNeural',
    async synth(raw, { voice, rate }) {
      const text = withoutTags(raw);
      const key = need('AZURE_SPEECH_KEY'), region = need('AZURE_SPEECH_REGION');
      const pct = Math.round((rate - 1) * 100);
      const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="th-TH"><voice name="${voice}"><prosody rate="${pct >= 0 ? '+' : ''}${pct}%">${ssmlBody(text)}</prosody></voice></speak>`;
      const r = await post(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
        headers: { 'Ocp-Apim-Subscription-Key': key, 'Content-Type': 'application/ssml+xml', 'X-Microsoft-OutputFormat': 'audio-24khz-96kbitrate-mono-mp3', 'User-Agent': 'announce-voice' },
        body: ssml,
      }, 'Azure TTS');
      return { data: Buffer.from(await r.arrayBuffer()), ext: 'mp3' };
    },
  },

  /** Google Cloud Text-to-Speech, th-TH. Needs GOOGLE_TTS_API_KEY. Pass --voice for a male voice. */
  google: {
    paid: true,
    nativeRate: true,
    voice: gender => gender === 'male' ? '' : 'th-TH-Neural2-C',
    async synth(raw, { voice, rate }) {
      const text = withoutTags(raw);
      if (!voice) throw new Error('Google: pass --voice <name> for a male voice (see the th-TH voices in the Cloud console)');
      const key = need('GOOGLE_TTS_API_KEY');
      const r = await post(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(key)}`, {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { ssml: `<speak>${ssmlBody(text)}</speak>` },
          voice: { languageCode: 'th-TH', name: voice },
          audioConfig: { audioEncoding: 'MP3', speakingRate: rate },
        }),
      }, 'Google TTS');
      return { data: Buffer.from((await r.json()).audioContent, 'base64'), ext: 'mp3' };
    },
  },

  /**
   * ElevenLabs. Needs ELEVENLABS_API_KEY and a voice id (--voice or ELEVENLABS_VOICE_ID; `voices` lists the account's).
   * Delivery tags in the script ([excited], [whispers] …) are acted out by v3. `--stability` is v3's expressiveness dial:
   * 0 = Creative (most emotional, least predictable), 0.5 = Natural, 1 = Robust (flat, steady).
   * The model must support Thai: Eleven v3 does (the default); Multilingual v2 and Flash v2.5 do not list it. Override with ELEVENLABS_MODEL.
   */
  // Eleven v3 has no speed control, so --rate is applied afterwards with ffmpeg (pitch stays the same)
  elevenlabs: {
    paid: true,
    nativeRate: false,
    voice: () => process.env.ELEVENLABS_VOICE_ID || '',
    async synth(text, { voice, stability }) {
      if (!voice) throw new Error('ElevenLabs: pass --voice <voice id> or set ELEVENLABS_VOICE_ID');
      const key = need('ELEVENLABS_API_KEY');
      const r = await post(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`, {
        headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: sentences(text).join('\n'), model_id: process.env.ELEVENLABS_MODEL || 'eleven_v3', ...stability !== undefined && { voice_settings: { stability } } }),
      }, 'ElevenLabs TTS');
      return { data: Buffer.from(await r.arrayBuffer()), ext: 'mp3' };
    },
  },
};

/** the voices in the ElevenLabs account (add a Thai voice from the Voice Library to "My Voices" first), to pick a --voice id from */
export async function elevenlabsVoices() {
  const key = need('ELEVENLABS_API_KEY');
  const r = await fetch('https://api.elevenlabs.io/v2/voices?page_size=100', { headers: { 'xi-api-key': key } });
  if (!r.ok) throw new Error(`ElevenLabs voices failed: ${r.status} ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  return (j.voices || []).map(v => ({
    id: v.voice_id, name: v.name, category: v.category, labels: v.labels || {},
    languages: (v.verified_languages || []).map(l => l.language).join(','), preview: v.preview_url,
  }));
}

/** runs `fn` and tries again with a pause when the provider says slow down (429) or hiccups (5xx) */
export async function withRetry(fn, tries = 4) {
  for (let i = 1; ; i++) {
    try { return await fn(); } catch (e) {
      const retryable = /: (429|500|502|503|504)\b/.test(String(e.message));
      if (!retryable || i >= tries) throw e;
      await new Promise(r => setTimeout(r, 1500 * i ** 2));
    }
  }
}
