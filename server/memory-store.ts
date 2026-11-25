import type { AdminRow, Store } from './store.js';

interface Run {
  id: number; empId: string; runNo: number; name: string; tokenHash: string; startedAt: number;
  score: number | null; seed: number; finishedAt: number | null; secs: number | null; loot: number; dist: number | null;
}

/** In-memory Store for local development. Same rules as the Postgres one, gone on restart. */
export function createMemoryStore(): Store {
  const runs: Run[] = [];
  const opened = new Map<string, string[]>(), worn = new Map<string, Record<string, string>>(), granted = new Map<string, number>();
  const avatars = new Map<string, number>();
  const hidden = new Set<string>();
  let nextId = 1;

  const bests = () => {
    const by = new Map<string, Run>();
    for (const r of runs) {
      if (r.score == null || hidden.has(r.empId)) continue;
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
      const run: Run = { id: nextId++, empId: r.id, runNo: r.runNo, name: r.name, tokenHash: r.tokenHash, startedAt: Date.now(), score: null, seed: r.seed, finishedAt: null, secs: null, loot: 0, dist: null };
      runs.push(run);
      return run.id;
    },
    async getRun(runId, id) {
      const r = runs.find(x => String(x.id) === runId && x.empId === id);
      return r ? { tokenHash: r.tokenHash, score: r.score, seed: r.seed, secs: (Date.now() - r.startedAt) / 1000 } : null;
    },
    async finishRun(runId, f) {
      const r = runs.find(x => String(x.id) === runId);
      if (!r || r.score != null) return null;
      r.score = f.score; r.secs = f.secs; r.finishedAt = Date.now(); r.loot = f.loot; r.dist = f.dist;
      return f.score;
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
          flagged: false, unfinished: mine.filter(r => r.score == null).length, hidden: hidden.has(id),
        };
      });
      return rows.sort((a, b) => (b.best ?? -1) - (a.best ?? -1));
    },
    async adminRuns() {
      return [...runs].sort((a, b) => b.startedAt - a.startedAt || b.id - a.id).map(r => ({
        id: r.empId, avatar: avatars.get(r.empId) ?? null, runNo: r.runNo,
        startedAt: new Date(r.startedAt).toISOString(),
        finishedAt: r.finishedAt == null ? null : new Date(r.finishedAt).toISOString(),
        secs: r.secs, score: r.score,
        // every run here has a seed: legacy runs exist only in databases older than replay verification
        legacy: false, hidden: hidden.has(r.empId),
      }));
    },
    async adminPlayers() {
      const ids = [...new Set([...avatars.keys(), ...runs.map(r => r.empId)])];
      return ids.map(id => {
        const mine = runs.filter(r => r.empId === id), done = mine.filter(r => r.score != null), dists = mine.flatMap(r => r.dist == null ? [] : [r.dist]);
        return {
          id, avatar: avatars.get(id) ?? null, hidden: hidden.has(id), plays: mine.length,
          best: done.length ? Math.max(...done.map(r => r.score!)) : null, maxDist: dists.length ? Math.max(...dists) : null,
          lastPlayed: mine.length ? new Date(Math.max(...mine.map(r => r.startedAt))).toISOString() : null,
          loot: mine.reduce((n, r) => n + r.loot, 0), granted: granted.get(id) ?? 0, opened: opened.get(id)?.length ?? 0,
        };
      });
    },
    async adminHide(id, hide) {
      if (!avatars.has(id) && !runs.some(r => r.empId === id)) return 0;
      if (hide) hidden.add(id); else hidden.delete(id);
      return 1;
    },
    async wardrobe(id) {
      const earned = runs.reduce((n, r) => n + (r.empId === id ? r.loot : 0), granted.get(id) ?? 0);
      return { earned, owned: [...opened.get(id) ?? []], equipped: { ...worn.get(id) } };
    },
    async addCosmetic(id, boxNo, item) {
      const mine = opened.get(id) ?? [];
      if (mine.length !== boxNo - 1 || mine.includes(item)) return false;
      opened.set(id, [...mine, item]);
      return true;
    },
    async setEquipped(id, equipped) { worn.set(id, { ...equipped }); },
    async grantBoxes(ids, n) {
      const known = new Set([...avatars.keys(), ...runs.map(r => r.empId)]);
      const to = ids === 'all' ? [...known] : [...new Set(ids)];
      for (const id of to) granted.set(id, (granted.get(id) ?? 0) + n);
      return { granted: to.length, unknown: to.filter(id => !known.has(id)) };
    },
  };
}
