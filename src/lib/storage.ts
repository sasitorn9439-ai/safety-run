/** localStorage that never throws (private windows, blocked storage). */
export const LS = {
  get<T>(key: string): T | null {
    try { return JSON.parse(localStorage.getItem(key) ?? 'null') as T | null; } catch { return null; }
  },
  set(key: string, value: unknown) {
    try { value == null ? localStorage.removeItem(key) : localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
  },
};
