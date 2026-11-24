import { STEP, type InputEntry, type StageId } from '../../shared/sim.js';
import type { TokenRequest } from '@ably/pubsub-device';
import { tourTopic } from '../../shared/tour-channels.js';
import { api, type ApiResult } from '../lib/api.js';

export type Slot = 0 | 1 | 2;
export type RoomPhase = 'lobby' | 'running' | 'finished';
export interface RoomPlayer { slot: Slot; avatar: number; score: number | null; correct: number | null }
export interface Room {
  code: string; phase: RoomPhase; stage: StageId; duration: number;
  startAt: number | null; now: number; seed: number | null; players: RoomPlayer[];
}

/** one runner as the host last simulated them: score, and where they were (metres run, lane) at race tick `tick` */
export type BoardRow = [slot: Slot, score: number, tick: number, dist: number, lane: number, jumps: number, slides: number];
/** live standings and positions the host sends the players */
export type Board = BoardRow[];
/**
 * What goes over the realtime channel. Players send their inputs (`n` = how many they have recorded in all, `e` the entries
 * from index `from`, `tick` how far their race has run, `d` and `l` where they are at that tick: metres run and lane, `j` and `s`
 * how many times they have jumped and slid). The host sends standings, and passes Spot Audits on.
 */
export type Msg =
  | { t: 'in'; slot: Slot; from: number; n: number; e: InputEntry[]; tick: number; d: number; l: number; j: number; s: number }
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

const ABLY = import.meta.env.VITE_REALTIME === 'ably';
/**
 * A phone reports its race this often. On Ably the other phones hear the reports directly, so their ghosts are only this plus one
 * hop behind; a room of three then costs about 128 messages a second (Free: 500). Supabase's Free limit (100) allows 250 ms.
 */
export const SEND_MS = ABLY ? 100 : 250;
/** the big screen runs each race this far behind the phone (in ticks), so the phone's next report has arrived before it gets there */
export const DELAY_TICKS = Math.round((SEND_MS + 350) / 1000 / STEP);
export type Role = 'host' | 'player';
/** who is asking for the room's channels: the big screen's host token, or a player's seat */
export type SeatAuth = { hostToken: string } | { slot: Slot; token: string };

/** the project URL; the bare project ref the dashboard shows as the project ID works too */
export const supabaseUrl = (v: string) => (/^https?:\/\//.test(v.trim()) ? v.trim() : `https://${v.trim()}.supabase.co`);

/**
 * The room's two one-way channels. Phones send their presses *up* to the big screen; the big screen sends standings and Spot Audits
 * *down*, and each side listens only to what is meant for it. Realtime services count every delivery as a message, so this keeps a
 * room to about a third of what one shared channel cost, well under the plan's per-second limit.
 * Ably when VITE_REALTIME=ably (the server signs a token for this seat with ABLY_API_KEY); Supabase Realtime when
 * VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set; the dev server's relay under `npm run dev` without either.
 * Problems show as a banner over the screen: a phone the big screen can't see must never fail quietly.
 */
export async function openChannel(code: string, role: Role, auth: SeatAuth, onMsg: (m: Msg) => void): Promise<Channel> {
  const listen = tourTopic(code, role === 'host' ? 'up' : 'down'), speak = tourTopic(code, role === 'host' ? 'down' : 'up');
  const banner = document.getElementById('tNet');
  const trouble = (key: string | null) => {
    banner?.classList.toggle('on', !!key);
    if (banner && key) banner.textContent = errText(key);
  };
  const down = role === 'host' ? 'realtime_down' : 'realtime_board';
  let failing = 0;
  const sent = () => { if (failing >= 3) trouble(null); failing = 0; };
  const failed = (e: unknown) => { console.error('realtime send', e); if (++failing === 3) trouble('realtime_send'); };

  if (ABLY) {
    const { createClient } = await import('@ably/pubsub-device');
    const client = createClient({
      echoMessages: false,
      authCallback: (_params, done) => void tourApi<{ tokenRequest: TokenRequest }>('realtime', { code, ...auth })
        .then(r => (r.ok ? done(null, r.tokenRequest!) : done(errText(r.error), null))),
    });
    // channel modes: the big screen only speaks down and only hears up. A phone hears down, and also hears the other phones on up,
    // so it gets their positions straight from them instead of a hop later through the big screen
    const sub = client.channels.get(listen, { modes: ['SUBSCRIBE'] });
    const out = client.channels.get(speak, { modes: role === 'host' ? ['PUBLISH'] : ['PUBLISH', 'SUBSCRIBE'] });
    for (const ch of role === 'host' ? [sub] : [sub, out]) void ch.subscribe('m', msg => onMsg(msg.data as Msg));
    // the client reconnects (and falls back to other hosts and transports) by itself; the banner says so meanwhile
    client.connection.on(change => {
      if (change.current === 'connected') trouble(null);
      else if (change.current === 'disconnected' || change.current === 'suspended' || change.current === 'failed') trouble(down);
    });
    return { send: m => void out.publish('m', m).then(sent, failed), close: () => { client.close(); trouble(null); } };
  }

  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined, key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (url && key) {
    const { createClient } = await import('@supabase/supabase-js');
    const client = createClient(supabaseUrl(url), key, { auth: { persistSession: false } });
    const out = client.channel(speak);
    const sub = client.channel(listen, { config: { broadcast: { self: false } } });
    sub.on('broadcast', { event: 'm' }, ({ payload }) => onMsg(payload as Msg));
    // supabase-js keeps rejoining on its own after an error; the banner says so meanwhile
    sub.subscribe(status => {
      if (status === 'SUBSCRIBED') trouble(null);
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') trouble(down);
    });
    // every send goes over HTTPS, so a phone is seen by the big screen even when its websocket can't connect
    return {
      send: m => void out.httpSend('m', m).then(sent, failed),
      close: () => { void client.removeAllChannels(); trouble(null); },
    };
  }
  if (!import.meta.env.DEV) { trouble('realtime'); return { send() {}, close() {} }; }
  const es = new EventSource(`/api/relay?room=${encodeURIComponent(listen)}`);
  es.onmessage = e => onMsg(JSON.parse(e.data) as Msg);
  return {
    send: m => void fetch('/api/relay', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ room: speak, msg: m }) }),
    close: () => es.close(),
  };
}

export const STAGE_NAMES: Record<StageId, string> = {
  tour: 'ทั่วโรงงาน (เปลี่ยนโซนตามระยะ)',
  entry: 'หน้าโรงงาน', forklift: 'พื้นที่โกดัง', chemical: 'ห้องเก็บสารเคมี',
  height: 'งานบนที่สูง', electrical: 'ไลน์ผลิต', evac: 'ซ้อมหนีไฟ (ผสมทุกอย่าง)',
};

export const fmtTime = (secs: number) => `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`;
export const TOUR_ERR: Record<string, string> = {
  room: 'ไม่พบห้องนี้ ตรวจรหัสห้องอีกครั้ง',
  full: 'ห้องเต็มแล้ว (3 คน)',
  started: 'การแข่งขันเริ่มไปแล้ว',
  bad_id: 'รหัสพนักงานไม่ถูกต้อง (ตัวอักษร/ตัวเลข 3–15 ตัว)',
  key: 'รหัส Host ไม่ถูกต้อง',
  empty: 'ยังไม่มีผู้เล่นในห้อง',
  realtime: 'ยังไม่ได้ตั้งค่า Realtime (ABLY_API_KEY + VITE_REALTIME=ably หรือ VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)',
  realtime_down: 'รับสัญญาณจากผู้เล่นไม่ได้ กำลังเชื่อมต่อใหม่…',
  realtime_board: 'ไม่ได้รับอันดับสดจากจอกลาง (ยังแข่งได้ตามปกติ) กำลังเชื่อมต่อใหม่…',
  realtime_send: 'ส่งข้อมูลไปจอกลางไม่ได้ ตรวจอินเทอร์เน็ต กำลังลองใหม่…',
  server: 'ระบบขัดข้อง ลองใหม่อีกครั้ง',
};
export const errText = (e: string | undefined) => TOUR_ERR[e ?? 'server'] ?? TOUR_ERR.server!;
