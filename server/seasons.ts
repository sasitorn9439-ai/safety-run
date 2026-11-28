import { FIRST_SEASON_START, seasonStartingAt, type SeasonWindow } from '../shared/seasons.js';
import type { Store } from './store.js';

export async function settlePastSeasons(store: Store, current: SeasonWindow | null) {
  if (!current || +current.start <= FIRST_SEASON_START) return;
  const last = await store.lastSettledSeason();
  const start = last ? +seasonStartingAt(+last).end : FIRST_SEASON_START;
  for (let season = seasonStartingAt(start); season.end <= current.start; season = seasonStartingAt(+season.end)) {
    await store.settleSeason(season);
  }
}
