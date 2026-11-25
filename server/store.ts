export interface RunRow { tokenHash: string; score: number | null; seed: number | null; secs: number }
export interface Usage { used: number; best: number | null }
/** `look`: what the player wears (cosmetic slot → item id), which dresses their avatar */
export interface BoardEntry { empId: string; avatar: number | null; score: number; look: Record<string, string> }
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
  /** whether this employee id has played (or been given an avatar) before */
  known(id: string): Promise<boolean>;
  usage(id: string): Promise<Usage>;
  /** claims run number `runNo` for the employee; null if another device got it first */
  createRun(r: { id: string; runNo: number; name: string; tokenHash: string; ua: string; seed: number }): Promise<number | null>;
  getRun(runId: string, id: string): Promise<RunRow | null>;
  /** stores the verified result once (score, play time, metres run, loot boxes picked up); null if the run was already finished */
  finishRun(runId: string, r: FinishedRun): Promise<number | null>;
  runScore(runId: string): Promise<number | null | undefined>;
  leaderboard(id: string): Promise<{ top: BoardEntry[]; total: number; rank: number }>;
  adminExport(): Promise<AdminRow[]>;
  /** every run, newest started first */
  adminRuns(): Promise<AdminRun[]>;
  /** one row per player: plays, bests and treasure chests */
  adminPlayers(): Promise<AdminPlayer[]>;
  /** hides or shows the player's scores on the leaderboard; returns how many players matched (0 or 1) */
  adminHide(id: string, hidden: boolean): Promise<number>;
  /** the player's cosmetics: boxes earned (verified runs + admin grants), every box opened in order, items worn */
  wardrobe(id: string): Promise<StoredWardrobe>;
  /** records that box number `boxNo` (from 1) gave `item` (`dupe`: the player had it already); false if that box was already opened */
  addCosmetic(id: string, boxNo: number, item: string, dupe: boolean): Promise<boolean>;
  setEquipped(id: string, equipped: Record<string, string>): Promise<void>;
  /** admin hands `n` loot boxes to each of `ids`, or to every player so far ('all'). Returns who got them, and which ids have never played. */
  grantBoxes(ids: string[] | 'all', n: number): Promise<{ granted: number; unknown: string[] }>;
}

export interface FinishedRun { score: number; secs: number; dist: number; loot: number }

/** A player as the admin sees them. `maxDist` is null when none of their runs recorded distance (runs from before it was stored). */
export interface AdminPlayer {
  id: string; avatar: number | null; hidden: boolean;
  plays: number; best: number | null; maxDist: number | null; lastPlayed: string | Date | null;
  /** treasure chests: picked up on verified runs, handed out by admin, won by filling the duplicate meter, opened */
  loot: number; granted: number; free: number; opened: number;
}

export interface StoredWardrobe { earned: number; opened: { item: string; dupe: boolean }[]; equipped: Record<string, string> }
