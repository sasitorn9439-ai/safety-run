export interface StartResp { token: string; seed: number; run: number; runNo: number; max: number | null; best: number | null; avatar: number }
export interface FinishResp { score: number; best: number | null; used: number; max: number | null }
export interface BoardResp { total: number; rank: number; top: { avatar: number; score: number; me: boolean }[] }
export interface AdminRow { id: string; avatar: number | null; plays: number; best: number | null; scores: string; startedAt: string; flagged: boolean; unfinished: number; hidden: boolean }
export interface AdminRun { id: string; avatar: number | null; runNo: number; startedAt: string; finishedAt: string | null; secs: number | null; score: number | null; legacy: boolean; hidden: boolean }

export type ApiResult<T> = Partial<T> & { ok: boolean; status: number; error?: string };

export async function api<T>(path: string, data?: unknown): Promise<ApiResult<T>> {
  const r = await fetch(path, data
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }
    : { cache: 'no-store' });
  let j: object = {};
  try { j = await r.json(); } catch { /* non-JSON error page */ }
  return { ok: r.ok, status: r.status, ...j } as ApiResult<T>;
}

/** Errors from /api/finish that no retry can fix: the run is unknown, the token is wrong or the replay does not verify. */
const FINAL_FINISH_ERRORS = new Set(['run', 'token', 'old_run', 'invalid_replay']);

/**
 * True only when the server itself rejected the run for good. A 429, a 408, a proxy 4xx or any non-JSON
 * error says nothing about the run, so the unsent score must stay on the device for a retry.
 */
export const isFinalFinishError = (r: { status: number; error?: string }): boolean =>
  r.status >= 400 && r.status < 500 && r.error !== undefined && FINAL_FINISH_ERRORS.has(r.error);
