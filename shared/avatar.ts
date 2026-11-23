/** One unique avatar per employee: the server hands out a number, the number picks glyph × colour × frame. */
export const AV_G = ['หมวก', 'ถุงมือ', 'แว่น', 'ที่ครอบหู', 'รองเท้า', 'กรวย', 'ถังดับเพลิง', 'กล่องยา', 'สายฟ้า', 'ดาว', 'โล่', 'ประแจ'] as const;
export const AV_C = [['#e53935', 'แดง'], ['#ef6c00', 'ส้ม'], ['#b58900', 'ทอง'], ['#2e9e47', 'เขียว'], ['#00897b', 'เขียวมรกต'], ['#0288d1', 'ฟ้า'], ['#3949ab', 'คราม'], ['#8e24aa', 'ม่วง'], ['#d81b60', 'ชมพู'], ['#6d4c41', 'น้ำตาล'], ['#546e7a', 'เทา'], ['#0b1f3f', 'กรมท่า']] as const;
export const AV_F = ['', 'ขอบเงิน', 'ขอบทอง'] as const;
export const AV_N = AV_G.length * AV_C.length * AV_F.length;

export interface AvatarParts { g: number; c: number; f: number; lap: number }

export function avParts(n: number | null | undefined): AvatarParts | null {
  if (n == null || !(n >= 0)) return null;
  const k = n % AV_N, m = (k * 175) % AV_N;
  return { g: m % 12, c: Math.floor(m / 12) % 12, f: Math.floor(m / 144), lap: Math.floor(n / AV_N) };
}

export function avName(n: number | null | undefined): string {
  const p = avParts(n);
  if (!p) return 'ผู้เล่น';
  return AV_G[p.g] + AV_C[p.c]![1] + (p.f ? ' ' + AV_F[p.f] : '') + (p.lap ? ' #' + (p.lap + 1) : '');
}
