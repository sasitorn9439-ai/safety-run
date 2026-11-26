/**
 * The numbers behind the prize-announcement deck (/announce). Pure: players in, facts out, so it is testable without a browser.
 * The deck is for the whole company, so it leaves out the developer's own id (DEV_ID) everywhere: totals and prizes alike.
 */
import type { AdminAnnounce } from '../lib/api.js';

/** the developer's employee id: never counted, never wins */
export const DEV_ID = '000';
/** how many places win a prize */
export const WINNERS = 7;

/** how far the runners would get if their metres were laid end to end: the Moon, one way */
export const MOON_KM = 384_400;

/**
 * The length of Thailand from Betong (Yala, the southernmost district) to Mae Sai (Chiang Rai, the northernmost) BY ROAD, km.
 * An estimate: Bangkok–Mae Sai is about 830 km by road and Betong–Bangkok about 1,200–1,300 km. Check it on a map and edit it here.
 */
export const THAILAND_KM = 2100;

/** the two prizes for the most plays: a super fan */
export const FANS = 2;

export interface Winner { rank: number; id: string; avatar: number | null; look: Record<string, string>; score: number; plays: number }
/** a super fan: `plays` is how many runs they finished (before the cutoff) */
export interface Fan { rank: number; id: string; avatar: number | null; look: Record<string, string>; plays: number }

export interface Facts {
  /** players who finished at least one run (the developer left out) */
  players: number;
  plays: number;
  km: number;
  secs: number;
  hours: number;
  days: number;
  /** laps of Thailand (Betong → Mae Sai, by road) */
  thaiLaps: number;
  /** trips to the Moon, as a number of one-way trips (below 1: how far along) */
  moonTrips: number;
  winners: Winner[];
  /** the players with the most finished runs */
  fans: Fan[];
}

/** Players without the developer. */
export const people = (rows: readonly AdminAnnounce[]) => rows.filter(r => r.id !== DEV_ID);

/**
 * The leaderboard's order: best verified score first, ties to whoever reached it first. Hidden players are off the board, so
 * they cannot win either. Only as many as there are places.
 */
export function winnersOf(rows: readonly AdminAnnounce[], places = WINNERS): Winner[] {
  return people(rows)
    .filter(r => !r.hidden && r.best != null)
    .sort((a, b) => b.best! - a.best! || +new Date(a.bestAt ?? 0) - +new Date(b.bestAt ?? 0))
    .slice(0, places)
    .map((r, i) => ({ rank: i + 1, id: r.id, avatar: r.avatar, look: r.look ?? {}, score: r.best!, plays: r.plays }));
}

/**
 * The super fans: the most finished runs. Hidden players are left out like everywhere else; ties go to the higher best score, then the
 * lower id, so the order never depends on who the server listed first. A fan can also be on the Top 7: both prizes are theirs.
 */
export function fansOf(rows: readonly AdminAnnounce[], places = FANS): Fan[] {
  return people(rows)
    .filter(r => !r.hidden && r.plays > 0)
    .sort((a, b) => b.plays - a.plays || (b.best ?? 0) - (a.best ?? 0) || a.id.localeCompare(b.id))
    .slice(0, places)
    .map((r, i) => ({ rank: i + 1, id: r.id, avatar: r.avatar, look: r.look ?? {}, plays: r.plays }));
}

export function factsOf(rows: readonly AdminAnnounce[]): Facts {
  const ps = people(rows);
  // hidden players still ran: their metres and minutes count, only their score is off the board
  const km = ps.reduce((n, r) => n + (r.dist || 0), 0) / 1000;
  const secs = ps.reduce((n, r) => n + (r.secs || 0), 0);
  return {
    players: ps.length, plays: ps.reduce((n, r) => n + r.plays, 0),
    km, secs, hours: secs / 3600, days: secs / 86400,
    thaiLaps: km / THAILAND_KM, moonTrips: km / MOON_KM,
    winners: winnersOf(rows), fans: fansOf(rows),
  };
}

/** 12345.6 → "12,346" */
export const n0 = (n: number) => Math.round(n).toLocaleString('en-US');
/** 3.456 → "3.5" (one decimal, dropped when it is .0 and the number is large) */
export const n1 = (n: number) => n >= 100 ? n0(n) : n.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
/** 2 decimals for small laps, so 0.03 does not show as 0.0 */
export const nSmart = (n: number) => n >= 10 ? n1(n) : n >= 0.1 ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : n.toLocaleString('en-US', { maximumFractionDigits: 3 });

/** 270000 s → { d: 3, h: 3 } (whole days, then the hours left) */
export function dayHours(secs: number) {
  const hours = Math.floor(secs / 3600);
  return { d: Math.floor(hours / 24), h: hours % 24 };
}

/** which of the optional distance slides the total has earned */
export function wantsMoon(f: Pick<Facts, 'km'>) { return f.km >= MOON_KM; }
