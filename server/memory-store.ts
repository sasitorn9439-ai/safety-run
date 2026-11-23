import type { AdminRow, Store } from './store.js';

interface Run {
  id: number; empId: string; runNo: number; name: string; tokenHash: string; startedAt: number;
  score: number | null; seed: number; finishedAt: number | null;
}

/** In-memory Store for local development. Same rules as the Postgres one, gone on restart. */
export function createMemoryStore(): Store {
  const runs: Run[] = [];
  const avatars = new Map<string, number>();
  let nextId = 1;

  const bests = () => {
    const by = new Map<string, Run>();
    for (const r of runs) {
      if (r.score == null) continue;
      const cur = by.get(r.empId);
      if (!cur || r.score > cur.score! || (r.score === cur.score && r.finishedAt! < cur.finishedAt!)) by.set(r.empId, r);
    }
    return [...by.values()].sort((a, b) => b.score! - a.score! || a.finishedAt! - b.finishedAt!);
  };

  return {
    async init() {},
    async avatarOf(id) {
      if (!avatars.has(id)) avatars.set(id, avatars.size);
      return avatars.get(id)!;
    },
    async usage(id) {
      const mine = runs.filter(r => r.empId === id);
      const scores = mine.filter(r => r.score != null).map(r => r.score!);
      return { used: mine.length, best: scores.length ? Math.max(...scores) : null };
    },
    async createRun(r) {
      if (runs.some(x => x.empId === r.id && x.runNo === r.runNo)) return null;
      const run: Run = { id: nextId++, empId: r.id, runNo: r.runNo, name: r.name, tokenHash: r.tokenHash, startedAt: Date.now(), score: null, seed: r.seed, finishedAt: null };
      runs.push(run);
      return run.id;
    },
    async getRun(runId, id) {
      const r = runs.find(x => String(x.id) === runId && x.empId === id);
      return r ? { tokenHash: r.tokenHash, score: r.score, seed: r.seed, secs: (Date.now() - r.startedAt) / 1000 } : null;
    },
    async finishRun(runId, score) {
      const r = runs.find(x => String(x.id) === runId);
      if (!r || r.score != null) return null;
      r.score = score; r.finishedAt = Date.now();
      return score;
    },
    async runScore(runId) {
      const r = runs.find(x => String(x.id) === runId);
      return r ? r.score : undefined;
    },
    async leaderboard(id) {
      const b = bests();
      const idx = id ? b.findIndex(r => r.empId === id) : -1;
      return {
        top: b.slice(0, 20).map(r => ({ empId: r.empId, avatar: avatars.get(r.empId) ?? null, score: r.score! })),
        total: b.length,
        rank: idx >= 0 ? idx + 1 : 0,
      };
    },
    async adminExport() {
      const ids = [...new Set(runs.map(r => r.empId))];
      const rows: AdminRow[] = ids.map(id => {
        const mine = runs.filter(r => r.empId === id).sort((a, b) => a.runNo - b.runNo);
        const scored = mine.filter(r => r.score != null);
        return {
          id, avatar: avatars.get(id) ?? null, plays: mine.length,
          best: scored.length ? Math.max(...scored.map(r => r.score!)) : null,
          scores: mine.map(r => (r.score == null ? '—' : String(r.score))).join(' / '),
          startedAt: new Date(Math.min(...mine.map(r => r.startedAt))).toISOString(),
          flagged: false, unfinished: mine.filter(r => r.score == null).length,
        };
      });
      return rows.sort((a, b) => (b.best ?? -1) - (a.best ?? -1));
    },
    async adminReset(id) {
      const n = runs.filter(r => r.empId === id).length;
      for (let i = runs.length - 1; i >= 0; i--) if (runs[i]!.empId === id) runs.splice(i, 1);
      return n;
    },
  };
}
