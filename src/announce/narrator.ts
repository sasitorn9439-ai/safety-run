/**
 * Plays the narration along with the deck. It is optional: with none the deck is silent and nothing breaks. Clips are keyed
 * `<slide id>.<enter|reveal>` (see narration.ts). They come from one of two places:
 *   - the server (voice-gate.ts): made by ElevenLabs on the server and cached there; played a little faster (`rate`) with the pitch kept
 *   - recorded files from `npm run announce:voice` (loadNarration below): already at the right speed
 * Either way a clip plays only if it is for the script's current text, so the deck never reads out a winner or a total that has since changed.
 */

interface Clip { url: string; rate: number }
const clips = new Map<string, Clip>();
let on = true;
let audio: HTMLAudioElement | null = null;
let timer = 0;
/** what the hint line says about the narration */
export let narrationStatus = 'ไม่มีไฟล์เสียงบรรยาย';

export const hasNarration = () => clips.size > 0;

/** makes a clip available; `rate` is the playback speed (1 = as recorded) */
export function addClip(id: string, url: string, rate = 1) {
  clips.set(id, { url, rate });
  narrationStatus = `เสียงบรรยาย: ${on ? 'เปิด' : 'ปิด'}`;
}

export function clearClips() { clips.clear(); narrationStatus = 'ไม่ใช้เสียงบรรยาย'; }

export function setNarrationStatus(s: string) { narrationStatus = s; }

const BASE = new URLSearchParams(location.search).get('audio') || '/announce-audio/';
const base = BASE.endsWith('/') ? BASE : BASE + '/';

interface Manifest { gender?: 'female' | 'male'; clips: Record<string, { file: string; text?: string; seconds?: number }> }

/**
 * The recorded-files route: loads the manifest and keeps only the clips whose recorded text equals what the script says now
 * (`expected(gender)`, from the deck's own data). When the ranking changes, the lines that name the winners fall silent and the
 * rest keep playing; re-running the voice tool records just those.
 */
export async function loadNarration(expected: (gender: 'female' | 'male') => { id: string; text: string }[]): Promise<boolean> {
  if (new URLSearchParams(location.search).get('narration') === 'off') { narrationStatus = 'ปิดเสียงบรรยาย (narration=off)'; return false; }
  try {
    const r = await fetch(base + 'manifest.json', { cache: 'no-store' });
    if (!r.ok) return false;
    const m = await r.json() as Manifest;
    const lines = expected(m.gender === 'male' ? 'male' : 'female');
    const ok = lines.filter(l => m.clips[l.id]?.text === l.text);
    for (const l of ok) addClip(l.id, base + m.clips[l.id]!.file, 1);
    const stale = lines.length - ok.length;
    if (stale) {
      console.warn(`[announce] narration out of date for ${stale} of ${lines.length} lines (they stay silent)`);
      narrationStatus = `เสียงบรรยายล้าสมัย ${stale} จาก ${lines.length} ช่วง (เงียบเฉพาะช่วงนั้น) รัน npm run announce:voice`;
    }
    return ok.length > 0;
  } catch { return false; }
}

export function toggleNarration(): boolean {
  on = !on;
  if (!on) stopNarration();
  if (narrationStatus.startsWith('เสียงบรรยาย:')) narrationStatus = `เสียงบรรยาย: ${on ? 'เปิด' : 'ปิด'}`;
  return on;
}

/** stops whatever is speaking, and any clip still waiting to start */
export function stopNarration() {
  clearTimeout(timer);
  if (audio) { audio.pause(); audio = null; }
}

/**
 * Says a clip after `delayMs` (so the slide's own entrance gets a moment first). A new call replaces the previous one.
 * Browsers refuse sound before the first click: that is swallowed, and the next click on the deck unlocks it.
 */
export function narrate(id: string, delayMs = 0) {
  stopNarration();
  const clip = clips.get(id);
  if (!on || !clip) return;
  timer = window.setTimeout(() => {
    const a = audio = new Audio(clip.url);
    a.preservesPitch = true;
    a.playbackRate = clip.rate;
    a.addEventListener('ended', () => { if (audio === a) audio = null; });
    void a.play().catch(() => { if (audio === a) audio = null; });
  }, delayMs);
}
