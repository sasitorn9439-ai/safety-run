import fs from 'node:fs';
import path from 'node:path';
import { DUPES_PER_BOX } from '../src/cosmetics/wardrobe.js';
import { SEASON_PRIZES, type SeasonWindow } from '../shared/seasons.js';
import type { AdminRow, Store } from './store.js';

interface Run {
  id: number; empId: string; runNo: number; name: string; tokenHash: string; startedAt: number;
  score: number | null; seed: number; finishedAt: number | null; secs: number | null; loot: number; dist: number | null;
}

interface Saved {
  runs: Run[]; opened: [string, { item: string; dupe: boolean }[]][]; worn: [string, Record<string, string>][];
  granted: [string, number][]; avatars: [string, number][]; hidden: string[]; nextId: number; lastSettledSeason: number | null;
}

/**
 * In-memory Store for local development, with the same rules as the Postgres one. Given a `file`, it starts from what that
 * file holds and writes every change back to it, so runs and opened chests survive a dev-server restart; without one
 * (the tests) it is gone on restart.
 */
export function createMemoryStore(file?: string): Store {
  let saved: Partial<Saved> = {};
  if (file) {
    try { saved = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<Saved>; } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') console.warn(`[dev-api] could not read ${file}, starting empty:`, e);
    }
  }
  const runs: Run[] = saved.runs ?? [];
  const opened = new Map(saved.opened), worn = new Map(saved.worn);
  let granted = new Map(saved.granted);
  const avatars = new Map(saved.avatars);
  const hidden = new Set(saved.hidden);
  let lastSettledSeason = saved.lastSettledSeason ?? null;
  let nextId = saved.nextId ?? 1;
  // announcement narration: kept for the life of the dev server only
  const audio = new Map<string, Buffer>();

  // written to a temp file and renamed, so a restart mid-write never leaves half a file
  const save = (boxGrants = granted, settled = lastSettledSeason) => {
    if (!file) return;
    const data: Saved = { runs, opened: [...opened], worn: [...worn], granted: [...boxGrants], avatars: [...avatars], hidden: [...hidden], nextId, lastSettledSeason: settled };
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file + '.tmp', JSON.stringify(data));
    fs.renameSync(file + '.tmp', file);
  };

  type ScoredRun = Run & { score: number; finishedAt: number };
  const compare = (a: ScoredRun, b: ScoredRun) => b.score - a.score || a.finishedAt - b.finishedAt || a.id - b.id;
  const bests = (season: SeasonWindow | null) => {
    const by = new Map<string, ScoredRun>();
    for (const r of runs) {
      if (r.score == null || r.seed == null || r.finishedAt == null || hidden.has(r.empId)) continue;
      if (season && (r.finishedAt < +season.start || r.finishedAt >= +season.end)) continue;
      const scored = { ...r, score: r.score, finishedAt: r.finishedAt };
      const cur = by.get(r.empId);
      if (!cur || compare(scored, cur) < 0) by.set(r.empId, scored);
    }
    return [...by.values()].sort(compare);
  };

  return {
    async init() {},
    async known(id) { return avatars.has(id) || runs.some(r => r.empId === id); },
    async avatarOf(id) {
      if (!avatars.has(id)) { avatars.set(id, avatars.size); save(); }
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
      save();
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
      save();
      return f.score;
    },
    async runScore(runId) {
      const r = runs.find(x => String(x.id) === runId);
      return r ? r.score : undefined;
    },
    async leaderboard(id, season) {
      const b = bests(season);
      const idx = id ? b.findIndex(r => r.empId === id) : -1;
      return {
        top: b.slice(0, 20).map(r => ({ empId: r.empId, avatar: avatars.get(r.empId) ?? null, score: r.score, look: { ...worn.get(r.empId) } })),
        total: b.length,
        rank: idx + 1,
        best: b[idx]?.score ?? null,
      };
    },
    async lastSettledSeason() { return lastSettledSeason == null ? null : new Date(lastSettledSeason); },
    async settleSeason(season) {
      if (lastSettledSeason != null && +season.start <= lastSettledSeason) return;
      const boxGrants = new Map(granted);
      const winners = bests(season).slice(0, SEASON_PRIZES.length);
      winners.forEach((r, i) => boxGrants.set(r.empId, (boxGrants.get(r.empId) ?? 0) + SEASON_PRIZES[i]));
      save(boxGrants, +season.start);
      granted = boxGrants;
      lastSettledSeason = +season.start;
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
    async getAudio(hash) { return audio.get(hash) ?? null; },
    async putAudio(hash, data) { audio.set(hash, data); },
    async hasAudio(hashes) { return hashes.filter(h => audio.has(h)); },
    async adminAnnounce(before) {
      const counted = runs.filter(r => r.score != null && r.finishedAt != null && r.finishedAt < before.getTime());
      const ids = [...new Set(counted.map(r => r.empId))];
      return ids.map(id => {
        const done = counted.filter(r => r.empId === id);
        // every run here has a seed, so every finished run is verified
        const top = done.reduce((a, r) => (r.score! > a.score! || (r.score === a.score && r.finishedAt! < a.finishedAt!) ? r : a));
        return {
          id, avatar: avatars.get(id) ?? null, look: worn.get(id) ?? {}, hidden: hidden.has(id), plays: done.length,
          best: top.score, bestAt: new Date(top.finishedAt!).toISOString(),
          dist: done.reduce((n, r) => n + (r.dist ?? 0), 0), secs: done.reduce((n, r) => n + (r.secs ?? 0), 0),
        };
      });
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
          free: Math.floor((opened.get(id) ?? []).filter(o => o.dupe).length / DUPES_PER_BOX),
        };
      });
    },
    async adminHide(id, hide) {
      if (!avatars.has(id) && !runs.some(r => r.empId === id)) return 0;
      if (hide) hidden.add(id); else hidden.delete(id);
      save();
      return 1;
    },
    async wardrobe(id) {
      const earned = runs.reduce((n, r) => n + (r.empId === id ? r.loot : 0), granted.get(id) ?? 0);
      return { earned, runs: runs.filter(r => r.empId === id && r.score != null).length, opened: [...opened.get(id) ?? []], equipped: { ...worn.get(id) } };
    },
    async addCosmetic(id, boxNo, item, dupe) {
      const mine = opened.get(id) ?? [];
      if (mine.length !== boxNo - 1) return false;
      opened.set(id, [...mine, { item, dupe }]);
      save();
      return true;
    },
    async setEquipped(id, equipped) { worn.set(id, { ...equipped }); save(); },
    async grantBoxes(ids, n) {
      const known = new Set([...avatars.keys(), ...runs.map(r => r.empId)]);
      const to = ids === 'all' ? [...known] : [...new Set(ids)];
      for (const id of to) granted.set(id, (granted.get(id) ?? 0) + n);
      save();
      return { granted: to.length, unknown: to.filter(id => !known.has(id)) };
    },
  };
}
