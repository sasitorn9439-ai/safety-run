export interface RunRow { tokenHash: string; score: number | null; seed: number | null; secs: number }
export interface Usage { used: number; best: number | null }
export interface BoardEntry { empId: string; avatar: number | null; score: number }
export interface AdminRow {
  id: string; avatar: number | null; plays: number; best: number | null; scores: string;
  startedAt: string | Date; flagged: boolean; unfinished: number;
  /** admin hid this player's scores from the leaderboard */
  hidden: boolean;
}
/** One play. `id` is the employee id; `score` is null until the run is submitted. */
export interface AdminRun {
  id: string; avatar: number | null; runNo: number;
  startedAt: string | Date; finishedAt: string | Date | null; secs: number | null; score: number | null;
  /** started before replay verification existed (no game seed) */
  legacy: boolean;
  hidden: boolean;
}

/** Everything the API needs from storage. Postgres in production, memory for `npm run dev`. */
export interface Store {
  init(): Promise<void>;
  avatarOf(id: string): Promise<number>;
  usage(id: string): Promise<Usage>;
  /** claims run number `runNo` for the employee; null if another device got it first */
  createRun(r: { id: string; runNo: number; name: string; tokenHash: string; ua: string; seed: number }): Promise<number | null>;
  getRun(runId: string, id: string): Promise<RunRow | null>;
  /** stores the verified score once; null if the run was already finished */
  finishRun(runId: string, score: number, secs: number): Promise<number | null>;
  runScore(runId: string): Promise<number | null | undefined>;
  leaderboard(id: string): Promise<{ top: BoardEntry[]; total: number; rank: number }>;
  adminExport(): Promise<AdminRow[]>;
  /** every run, newest started first */
  adminRuns(): Promise<AdminRun[]>;
  /** hides or shows the player's scores on the leaderboard; returns how many players matched (0 or 1) */
  adminHide(id: string, hidden: boolean): Promise<number>;
}
