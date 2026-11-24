import type { InputEntry, StageId } from '../../shared/sim.js';
import { api, type ApiResult } from '../lib/api.js';

export type Slot = 0 | 1 | 2;
export type RoomPhase = 'lobby' | 'running' | 'finished';
export interface RoomPlayer { slot: Slot; avatar: number; score: number | null; correct: number | null }
export interface Room {
  code: string; phase: RoomPhase; stage: StageId; duration: number;
  startAt: number | null; now: number; seed: number | null; players: RoomPlayer[];
}

/** live standings the host sends the players: [slot, score] */
export type Board = [Slot, number][];
/**
 * What goes over the realtime channel. Players send their inputs (`n` = how many they have recorded in all, `e` the entries
 * from index `from`, `tick` how far their race has run). The host sends standings, and passes Spot Audits on.
 */
export type Msg =
  | { t: 'in'; slot: Slot; from: number; n: number; e: InputEntry[]; tick: number }
  | { t: 'audit'; slot: Slot }
  | { t: 'board'; board: Board }
  | { t: 'audited'; to: Slot; by: Slot };

export const tourApi = <T = Room>(action: string, data: Record<string, unknown> = {}) =>
  api<T>('/api/tournament', { action, ...data });

/** the server's clock, from the round trips of the state polls (the one with the shortest round trip wins) */
export class Clock {
  private offset = 0;
  private rtt = Infinity;
  now = () => Date.now() + this.offset;
  async state(code: string): Promise<ApiResult<Room>> {
    const sent = Date.now();
    const r = await tourApi('state', { code });
    const back = Date.now();
    this.learn(r, sent, back);
    return r;
  }
  learn(r: { now?: number }, sent: number, back: number) {
    if (typeof r.now !== 'number' || back - sent > this.rtt) return;
    this.rtt = back - sent;
    this.offset = r.now - (sent + back) / 2;
  }
}

export interface Channel { send(m: Msg): void; close(): void }

/**
 * One channel per room. Supabase Realtime (broadcast) when VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set;
 * under `npm run dev` without them, the dev server's relay (server/dev-api.ts).
 */
async function openChannel(code: string, onMsg: (m: Msg) => void): Promise<Channel> {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined, key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (url && key) {
    const { createClient } = await import('@supabase/supabase-js');
    const client = createClient(supabaseUrl(url), key, { auth: { persistSession: false } });
    const ch = client.channel(`safety-run-tour-${code}`, { config: { broadcast: { self: false } } });
    ch.on('broadcast', { event: 'm' }, ({ payload }) => onMsg(payload as Msg));
    await new Promise<void>((resolve, reject) => ch.subscribe(status => {
      if (status === 'SUBSCRIBED') resolve();
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reject(new Error(status));
    }));
    return {
      send: m => void ch.send({ type: 'broadcast', event: 'm', payload: m }),
      close: () => void client.removeChannel(ch),
    };
  }
  if (!import.meta.env.DEV) throw new Error('realtime');
  const me = Math.random().toString(36).slice(2);
  const es = new EventSource(`/api/relay?room=${encodeURIComponent(code)}`);
  es.onmessage = e => { const { from, m } = JSON.parse(e.data) as { from: string; m: Msg }; if (from !== me) onMsg(m); };
  await new Promise<void>(resolve => { es.onopen = () => resolve(); });
  return {
    send: m => void fetch('/api/relay', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ room: code, msg: { from: me, m } }) }),
    close: () => es.close(),
  };
}

/** the project URL; the bare project ref the dashboard shows as the project ID works too */
export const supabaseUrl = (v: string) => (/^https?:\/\//.test(v.trim()) ? v.trim() : `https://${v.trim()}.supabase.co`);

/**
 * Opens the room's channel and keeps trying every few seconds while `wanted()` holds, with a banner over the screen meanwhile:
 * a phone that can't reach the channel is invisible to the big screen, so that must never fail quietly.
 */
export async function connect(code: string, onMsg: (m: Msg) => void, wanted: () => boolean): Promise<Channel | null> {
  const banner = document.getElementById('tNet');
  for (;;) {
    try {
      const ch = await openChannel(code, onMsg);
      banner?.classList.remove('on');
      if (wanted()) return ch;
      ch.close();
      return null;
    } catch (e) {
      console.error('realtime channel', e);
      if (banner) { banner.textContent = errText((e as Error).message === 'realtime' ? 'realtime' : 'realtime_down'); banner.classList.add('on'); }
      await new Promise(r => setTimeout(r, 3000));
      if (!wanted()) { banner?.classList.remove('on'); return null; }
    }
  }
}

export const STAGE_NAMES: Record<StageId, string> = {
  tour: 'ทั่วโรงงาน (เปลี่ยนโซนตามระยะ)',
  entry: 'ทางเข้าคลังสินค้า', forklift: 'ทางรถโฟล์คลิฟท์', chemical: 'พื้นที่สารเคมี',
  height: 'งานบนที่สูง', electrical: 'ห้องไฟฟ้า', evac: 'ซ้อมอพยพ (ผสมทุกอย่าง)',
};

export const fmtTime = (secs: number) => `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`;
export const TOUR_ERR: Record<string, string> = {
  room: 'ไม่พบห้องนี้ ตรวจรหัสห้องอีกครั้ง',
  full: 'ห้องเต็มแล้ว (3 คน)',
  started: 'การแข่งขันเริ่มไปแล้ว',
  bad_id: 'รหัสพนักงานไม่ถูกต้อง (ตัวอักษร/ตัวเลข 3–15 ตัว)',
  key: 'รหัส Host ไม่ถูกต้อง',
  empty: 'ยังไม่มีผู้เล่นในห้อง',
  realtime: 'ยังไม่ได้ตั้งค่า Realtime (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)',
  realtime_down: 'เชื่อมต่อจอกลางไม่ได้ กำลังลองใหม่…',
  server: 'ระบบขัดข้อง ลองใหม่อีกครั้ง',
};
export const errText = (e: string | undefined) => TOUR_ERR[e ?? 'server'] ?? TOUR_ERR.server!;
