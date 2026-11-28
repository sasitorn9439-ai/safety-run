export const SEASON_PRIZES = [50, 25, 10] as const;
const WEEK = 7 * 24 * 60 * 60 * 1000;
export const FIRST_SEASON_START = Date.parse('2026-11-30T00:00:00+07:00');

export interface SeasonWindow { start: Date; end: Date }

export type SeasonStatus =
  | { kind: 'upcoming'; startsAt: string }
  | { kind: 'active'; number: number; startsAt: string; endsAt: string };

export function seasonAt(time: number) {
  const index = Math.floor((time - FIRST_SEASON_START) / WEEK);
  return index < 0 ? null : { ...seasonStartingAt(FIRST_SEASON_START + index * WEEK), number: index + 1 };
}

export function seasonStartingAt(start: number): SeasonWindow {
  return { start: new Date(start), end: new Date(start + WEEK) };
}
