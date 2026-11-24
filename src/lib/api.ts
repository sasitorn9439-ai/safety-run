export interface StartResp { token: string; seed: number; run: number; runNo: number; max: number | null; best: number | null; avatar: number }
export interface FinishResp { score: number; best: number | null; used: number; max: number | null }
export interface BoardResp { total: number; rank: number; top: { avatar: number; score: number; me: boolean }[] }
export interface AdminRow { id: string; avatar: number | null; plays: number; best: number | null; scores: string; startedAt: string; flagged: boolean; unfinished: number; hidden: boolean }

export type ApiResult<T> = Partial<T> & { ok: boolean; status: number; error?: string };

export async function api<T>(path: string, data?: unknown): Promise<ApiResult<T>> {
  const r = await fetch(path, data
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }
    : { cache: 'no-store' });
  let j: object = {};
  try { j = await r.json(); } catch { /* non-JSON error page */ }
  return { ok: r.ok, status: r.status, ...j } as ApiResult<T>;
}
