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

/** how likely each rarity is per box (relative weights) */
export const RARITY_WEIGHT: Record<Rarity, number> = { common: 62, rare: 26, epic: 10, legendary: 2 };
export const RARITY_LABEL: Record<Rarity, string> = { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' };

/** duplicates fill the meter; this many make one free box */
export const DUPES_PER_BOX = 5;

/** `dupes` is the meter: duplicates since it last filled (0 … DUPES_PER_BOX − 1) */
export interface Wardrobe { boxes: number; owned: readonly string[]; equipped: Readonly<Partial<Record<Slot, string>>>; dupes: number }
export const EMPTY_WARDROBE: Wardrobe = { boxes: 0, owned: [], equipped: {}, dupes: 0 };

/** one opened box, as stored: what it gave and whether the player had it already */
export interface Opened { item: string; dupe: boolean }

/**
 * The wardrobe from its history: `earned` boxes (picked up on verified runs and handed out by admin) and every box opened so far.
 * Each DUPES_PER_BOX duplicates add a free box; what's left over is the meter.
 */
export function wardrobeFrom(earned: number, opened: readonly Opened[], equipped: unknown): Wardrobe {
  const dupes = opened.filter(o => o.dupe).length;
  return parseWardrobe({
    boxes: Math.max(0, earned + Math.floor(dupes / DUPES_PER_BOX) - opened.length),
    owned: opened.filter(o => !o.dupe).map(o => o.item), equipped, dupes: dupes % DUPES_PER_BOX,
  });
}

export function parseWardrobe(raw: unknown): Wardrobe {
  if (!raw || typeof raw !== 'object') return EMPTY_WARDROBE;
  const r = raw as Record<string, unknown>;
  const boxes = typeof r.boxes === 'number' && r.boxes >= 0 ? Math.floor(r.boxes) : 0;
  const owned = Array.isArray(r.owned) ? [...new Set(r.owned.filter((id): id is string => typeof id === 'string' && BY_ID.has(id)))] : [];
  const equipped: Partial<Record<Slot, string>> = {};
  const eq = (r.equipped && typeof r.equipped === 'object' ? r.equipped : {}) as Record<string, unknown>;
  for (const slot of SLOTS) { const id = eq[slot]; if (typeof id === 'string' && owned.includes(id) && BY_ID.get(id)!.slot === slot) equipped[slot] = id; }
  const dupes = typeof r.dupes === 'number' && r.dupes >= 0 ? Math.floor(r.dupes) % DUPES_PER_BOX : 0;
  return { boxes, owned, equipped, dupes };
}

export const addBox = (w: Wardrobe, n = 1): Wardrobe => ({ ...w, boxes: w.boxes + n });

/** what one box gave: the item, whether it was a duplicate, and whether that duplicate filled the meter (a free box) */
export interface Pull { item: Cosmetic; dupe: boolean; free: boolean }

/**
 * Opens one box: a rarity by RARITY_WEIGHT, then any item of that rarity, owned or not. A duplicate fills the meter, and a full
 * meter gives a free box. Null when there is no box. `random` returns [0, 1).
 */
export function openBox(w: Wardrobe, random: () => number): { wardrobe: Wardrobe; pull: Pull } | null {
  if (w.boxes < 1) return null;
  let roll = random() * RARITIES.reduce((s, r) => s + RARITY_WEIGHT[r], 0), rarity = RARITIES[RARITIES.length - 1]!;
  for (const r of RARITIES) { if ((roll -= RARITY_WEIGHT[r]) < 0) { rarity = r; break; } }
  const pool = CATALOG.filter(c => c.rarity === rarity), item = pool[Math.floor(random() * pool.length)]!;
  if (!w.owned.includes(item.id)) return { wardrobe: { ...w, boxes: w.boxes - 1, owned: [...w.owned, item.id] }, pull: { item, dupe: false, free: false } };
  const free = w.dupes + 1 >= DUPES_PER_BOX;
  return { wardrobe: { ...w, boxes: w.boxes - 1 + (free ? 1 : 0), dupes: free ? 0 : w.dupes + 1 }, pull: { item, dupe: true, free } };
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
