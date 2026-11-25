/**
 * The player's cosmetics: loot boxes waiting to be opened, what they own and what they wear. Pure data in, data out; the app
 * keeps it in localStorage (parseWardrobe is the boundary that turns whatever is stored there back into a valid Wardrobe).
 */
import { CUSTOM_SKINS } from './characters.js';
import { EFFECTS } from './effects.js';
import { HATS } from './hats.js';
import { DEFAULT_LOOK, DEFAULT_PALETTE, SKINS } from './skins.js';
import { RARITIES, SLOTS, type Cosmetic, type Effect, type Hat, type Look, type Rarity, type Skin, type Slot } from './types.js';

export const CATALOG: readonly Cosmetic[] = [...SKINS, ...CUSTOM_SKINS, ...HATS, ...EFFECTS];
const BY_ID = new Map(CATALOG.map(c => [c.id, c]));
export const cosmetic = (id: string) => BY_ID.get(id);

/** how likely each rarity is per box (relative weights); a rarity the player has already completed drops out */
export const RARITY_WEIGHT: Record<Rarity, number> = { common: 62, rare: 26, epic: 10, legendary: 2 };
export const RARITY_LABEL: Record<Rarity, string> = { common: 'ธรรมดา · Common', rare: 'หายาก · Rare', epic: 'มหากาพย์ · Epic', legendary: 'ตำนาน · Legendary' };

export interface Wardrobe { boxes: number; owned: readonly string[]; equipped: Readonly<Partial<Record<Slot, string>>> }
export const EMPTY_WARDROBE: Wardrobe = { boxes: 0, owned: [], equipped: {} };

export function parseWardrobe(raw: unknown): Wardrobe {
  if (!raw || typeof raw !== 'object') return EMPTY_WARDROBE;
  const r = raw as Record<string, unknown>;
  const boxes = typeof r.boxes === 'number' && r.boxes >= 0 ? Math.floor(r.boxes) : 0;
  const owned = Array.isArray(r.owned) ? [...new Set(r.owned.filter((id): id is string => typeof id === 'string' && BY_ID.has(id)))] : [];
  const equipped: Partial<Record<Slot, string>> = {};
  const eq = (r.equipped && typeof r.equipped === 'object' ? r.equipped : {}) as Record<string, unknown>;
  for (const slot of SLOTS) { const id = eq[slot]; if (typeof id === 'string' && owned.includes(id) && BY_ID.get(id)!.slot === slot) equipped[slot] = id; }
  return { boxes, owned, equipped };
}

export const addBox = (w: Wardrobe, n = 1): Wardrobe => ({ ...w, boxes: w.boxes + n });

/** what a box can still give: everything not owned yet */
export const remaining = (w: Wardrobe) => CATALOG.filter(c => !w.owned.includes(c.id));

/**
 * Opens one box: a rarity by RARITY_WEIGHT (among rarities with something left), then one item of it the player doesn't own yet,
 * so a box is never a duplicate. Null when there is no box or nothing left to win. `random` returns [0, 1).
 */
export function openBox(w: Wardrobe, random: () => number): { wardrobe: Wardrobe; item: Cosmetic } | null {
  const left = remaining(w);
  if (w.boxes < 1 || !left.length) return null;
  const open = RARITIES.filter(r => left.some(c => c.rarity === r));
  let roll = random() * open.reduce((s, r) => s + RARITY_WEIGHT[r], 0), rarity = open[open.length - 1]!;
  for (const r of open) { if ((roll -= RARITY_WEIGHT[r]) < 0) { rarity = r; break; } }
  const pool = left.filter(c => c.rarity === rarity), item = pool[Math.floor(random() * pool.length)]!;
  return { wardrobe: { ...w, boxes: w.boxes - 1, owned: [...w.owned, item.id] }, item };
}

/** wear an owned item, or take off whatever is in `slot` (id null) */
export function equip(w: Wardrobe, slot: Slot, id: string | null): Wardrobe {
  const { [slot]: _, ...rest } = w.equipped;
  if (id === null) return { ...w, equipped: rest };
  if (!w.owned.includes(id) || BY_ID.get(id)?.slot !== slot) return w;
  return { ...w, equipped: { ...rest, [slot]: id } };
}

export { DEFAULT_LOOK };
export function lookOf(w: Wardrobe): Look {
  const skin = w.equipped.skin ? cosmetic(w.equipped.skin) as Skin : null;
  return {
    pal: skin?.pal ?? DEFAULT_PALETTE,
    figure: skin?.figure ?? null,
    hat: w.equipped.hat ? cosmetic(w.equipped.hat) as Hat : null,
    effect: w.equipped.effect ? cosmetic(w.equipped.effect) as Effect : null,
  };
}
