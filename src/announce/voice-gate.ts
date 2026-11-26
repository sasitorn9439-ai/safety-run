/**
 * Gets the narration from the server before the deck starts, and asks first when that would cost something.
 *
 *   everything already cached   → loads the clips with a progress bar, no question
 *   some lines not cached       → asks: make the voice (uses ElevenLabs credits, with the number of characters) or just the slides
 *   server not set up / no key  → nothing here; the caller falls back to recorded files
 *
 * The server keeps every clip, so after the first visit after the cutoff everyone else loads from cache for free.
 */
import { api } from '../lib/api.js';
import type { Line } from './narration.js';
import { addClip, clearClips } from './narrator.js';

const $ = (id: string) => document.getElementById(id)!;

interface Status { configured?: boolean; gender?: 'male' | 'female'; rate?: number; cached?: string[]; missing?: string[]; missingChars?: number }

/** the narration's voice settings, to write the script for: its gender decides ครับ or ค่ะ */
export async function voiceSetup(key: string): Promise<{ gender: 'male' | 'female'; rate: number } | null> {
  const r = await api<Status>('/api/announce-voice', { key, action: 'status' });
  if (!r.ok || !r.configured) return null;
  return { gender: r.gender ?? 'male', rate: r.rate ?? 1.15 };
}

const b64Blob = (b64: string) => {
  const bin = atob(b64), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: 'audio/mpeg' });
};

/** 27 พฤศจิกายน 2569 08:00 น. */
export const thaiTime = (iso: string) => new Date(iso).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' น.';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** one clip, tried a few times when the provider is busy */
async function fetchClip(key: string, line: Line, rate: number): Promise<boolean> {
  for (let i = 0; i < 4; i++) {
    const r = await api<{ audio: string }>('/api/announce-voice', { key, action: 'clip', text: line.text });
    if (r.ok && r.audio) { addClip(line.id, URL.createObjectURL(b64Blob(r.audio)), rate); return true; }
    if (r.status !== 503 && r.status !== 0) return false;
    await sleep(1500 * (i + 1));
  }
  return false;
}

/**
 * Shows the narration screen as needed and resolves when the deck may start. Resolves with how many clips are ready; 0 when the
 * viewer chose slides only or skipped; negative (minus the count) when they chose to make only the lines that do not depend on the results.
 */
export async function prepareVoice(key: string, lines: Line[], rate: number, cutoff?: string): Promise<number> {
  const st = await api<Status>('/api/announce-voice', { key, action: 'status', lines: lines.map(l => ({ id: l.id, text: l.text })) });
  if (!st.ok || !st.configured) return 0;
  const cached = new Set(st.cached ?? []);
  const missing = lines.filter(l => !cached.has(l.id));

  // before the cutoff the standings can still change: what is made now may have to be made again
  const early = cutoff && Date.parse(cutoff) > Date.now() ? cutoff : '';
  const gate = $('voiceGate'), title = $('vgTitle'), text = $('vgText'), bar = $('vgBar'), fill = $('vgFill'), msg = $('vgMsg');
  const go = $('vgGo') as HTMLButtonElement, skip = $('vgSkip') as HTMLButtonElement;
  gate.hidden = false;

  /** wait for one of the buttons */
  const stat = $('vgStatic') as HTMLButtonElement;
  const choose = (): Promise<'go' | 'static' | 'skip'> => new Promise(res => {
    go.onclick = () => res('go'); skip.onclick = () => res('skip'); stat.onclick = () => res('static');
  });

  // what to load: everything, or (before the cutoff, by choice) what is cached plus the lines that do not depend on the results
  let wanted = lines;
  let staticOnly = false;
  if (missing.length) {
    const have = lines.length - missing.length;
    const early_static = early ? missing.filter(l => !l.data) : [];
    title.innerHTML = 'ใส่<em>เสียงบรรยาย</em>ไหม';
    text.textContent = (have
      ? `ตามสคริปที่เตรียมไว้ มีเสียงอยู่แล้ว ${have} ช่วง เหลือ ${missing.length} ช่วงที่ยังไม่มีเสียง`
      : `ยังไม่มีเสียงบรรยายเลย (${lines.length} ช่วง ตามสคริปที่เตรียมไว้)`)
      + ` การสร้างเสียงจะใช้เครดิต ElevenLabs ประมาณ ${st.missingChars ?? 0} ตัวอักษร สร้างครั้งเดียว หลังจากนั้นทุกเครื่องใช้ร่วมกันได้ฟรี`
      + (early ? ` ⚠ ข้อมูลยังไม่ปิด (ตัดข้อมูล ${thaiTime(early)}) อันดับและยอดรวมยังเปลี่ยนได้ ช่วงที่มีผลประกาศ (เลขพนักงาน ชื่อ avatar คะแนน ยอดรวม) ที่สร้างตอนนี้อาจต้องสร้างใหม่หลังเวลาตัด` : '');
    go.textContent = early ? 'สร้างทั้งหมด (ซ้อม)' : 'สร้างเสียงและดูสไลด์พร้อมเสียง'; skip.textContent = 'ดูเฉพาะสไลด์ (ไม่มีเสียง)';
    go.hidden = false; skip.hidden = false; bar.hidden = true; msg.textContent = '';
    // before the cutoff: the lines that never depend on the results (cover, prize announcements, closing) can be made now and kept
    stat.hidden = !early_static.length;
    if (early_static.length) {
      const chars = early_static.reduce((n, l) => n + l.text.length, 0);
      stat.textContent = `เตรียมเฉพาะเสียงที่ไม่ขึ้นกับผล (${early_static.length} ช่วง ~${chars} ตัวอักษร)`;
    }
    const pick = await choose();
    stat.hidden = true;
    if (pick === 'skip') { gate.hidden = true; return 0; }
    if (pick === 'static') {
      staticOnly = true;
      wanted = lines.filter(l => cached.has(l.id) || !l.data);
    }
  }

  // load everything: what is cached comes back at once, the rest is made as it is asked for
  title.innerHTML = 'กำลังเตรียม<em>เสียงบรรยาย</em>';
  const toMake = wanted.filter(l => !cached.has(l.id)).length;
  text.textContent = toMake ? `กำลังสร้างเสียง ${toMake} ช่วง และโหลดที่มีอยู่แล้ว` : 'โหลดเสียงที่เตรียมไว้แล้ว';
  go.hidden = true; skip.hidden = false; skip.textContent = 'ข้าม (ไม่ใช้เสียง)'; bar.hidden = false;
  let done = 0, ready = 0, stop = false;
  const paint = () => { fill.style.width = `${Math.round(100 * done / wanted.length)}%`; msg.textContent = `${done} / ${wanted.length} ช่วง`; };
  paint();
  const skipped = new Promise<void>(res => { skip.onclick = () => { stop = true; res(); }; });

  const queue = [...wanted];
  const worker = async () => {
    for (let l = queue.shift(); l && !stop; l = queue.shift()) {
      if (await fetchClip(key, l, rate)) ready++;
      done++; paint();
    }
  };
  await Promise.race([Promise.all([worker(), worker(), worker()]), skipped]);

  gate.hidden = true;
  // skipping means silent: drop what had already arrived
  if (stop) { clearClips(); return 0; }
  return staticOnly ? -ready : ready;
}
