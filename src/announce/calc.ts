/**
 * The numbers behind the prize-announcement deck (/announce). Pure: players in, facts out, so it is testable without a browser.
 * The deck is for the whole company, so it leaves out the developer's own id (DEV_ID) everywhere: totals and prizes alike.
 */
import type { AdminAnnounce } from '../lib/api.js';

/** the developer's employee id: never counted, never wins */
export const DEV_ID = '000';
/** how many places win a prize */
export const WINNERS = 7;

/** a place in the world the total distance is measured against */
export const EARTH_KM = 40_075;
export const MOON_KM = 384_400;

const rad = (d: number) => d * Math.PI / 180;
/** great-circle distance in km between two lat/lon points */
export function haversineKm(a: [number, number], b: [number, number]): number {
  const [la1, lo1] = a, [la2, lo2] = b;
  const h = Math.sin(rad(la2 - la1) / 2) ** 2 + Math.cos(rad(la1)) * Math.cos(rad(la2)) * Math.sin(rad(lo2 - lo1) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Thailand's two ends: Betong (Yala, the southernmost district) and Mae Sai (Chiang Rai, the northernmost), as [lat, lon] */
export const BETONG: [number, number] = [5.7747, 101.0733];
export const MAE_SAI: [number, number] = [20.4339, 99.8761];
/** straight-line length of Thailand from Betong to Mae Sai, km */
export const THAILAND_KM = Math.round(haversineKm(BETONG, MAE_SAI));

export interface Winner { rank: number; id: string; avatar: number | null; look: Record<string, string>; score: number; plays: number }

export interface Facts {
  /** players who finished at least one run (the developer left out) */
  players: number;
  plays: number;
  km: number;
  secs: number;
  hours: number;
  days: number;
  /** laps of Thailand (Betong → Mae Sai) */
  thaiLaps: number;
  /** laps of the Earth; below 1 it is how far round the planet the runners got */
  earthLaps: number;
  /** trips to the Moon, as a number of one-way trips (below 1: how far along) */
  moonTrips: number;
  winners: Winner[];
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

export function factsOf(rows: readonly AdminAnnounce[]): Facts {
  const ps = people(rows);
  // hidden players still ran: their metres and minutes count, only their score is off the board
  const km = ps.reduce((n, r) => n + (r.dist || 0), 0) / 1000;
  const secs = ps.reduce((n, r) => n + (r.secs || 0), 0);
  return {
    players: ps.length, plays: ps.reduce((n, r) => n + r.plays, 0),
    km, secs, hours: secs / 3600, days: secs / 86400,
    thaiLaps: km / THAILAND_KM, earthLaps: km / EARTH_KM, moonTrips: km / MOON_KM,
    winners: winnersOf(rows),
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
