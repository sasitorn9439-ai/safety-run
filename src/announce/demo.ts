/** Made-up players for rehearsing the deck before the event: `/announce?demo` (add `=6` to run six times as far). Includes the developer's 000, which the deck must leave out. */
import type { AdminAnnounce } from '../lib/api.js';

export function demoPlayers(scale = 1): AdminAnnounce[] {
  let s = 20260901;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
  const rows: AdminAnnounce[] = [];
  for (let i = 0; i < 64; i++) {
    const plays = 2 + Math.floor(rnd() * 18);
    const dist = (4000 + rnd() * 18000) * plays * scale;
    rows.push({
      id: String(1001 + i * 7), avatar: i * 5 + 3, look: {}, hidden: i === 9, plays,
      best: Math.round(12000 + rnd() ** 2.2 * 110000), bestAt: new Date(Date.UTC(2026, 11, 1, 9, 0, 0) + i * 60000).toISOString(),
      dist, secs: dist / 27 * (.9 + rnd() * .3),
    });
  }
  rows.push({ id: '000', avatar: 0, look: {}, hidden: false, plays: 40, best: 999999, bestAt: '2026-12-01T08:00:00Z', dist: 900000, secs: 40000 });
  return rows;
}
