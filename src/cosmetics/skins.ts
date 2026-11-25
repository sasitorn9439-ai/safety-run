import type { Look, Palette, Rarity, Skin } from './types.js';

/** the mascot as it has always looked */
export const DEFAULT_PALETTE: Palette = {
  body: '#eee6e3', sleeve: '#fff7f4', edge: '#cdc1be',
  capeD: '#b7212b', capeL: '#ee3e46', mitt: '#e7343e', shoeD: '#b7212b', shoeL: '#ec3c43',
  head: '#fff9f6', headEdge: '#c9bcb9',
  gemL: '#ee3e46', gemR: '#c4222b', gemHi: '#fa5860', gemEdge: '#a81c25',
};

export const DEFAULT_LOOK: Look = { pal: DEFAULT_PALETTE, hat: null, effect: null };

const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
const hex = (v: number[]) => '#' + v.map(x => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('');
/** k > 0 toward white, k < 0 toward black */
export const tone = (c: string, k: number) => hex(rgb(c).map(x => k >= 0 ? x + (255 - x) * k : x * (1 + k)));

/** `sleeve` (arms, legs and the avatar's torso) is a lighter shade of the body unless given */
interface Colors { body: string; cape: string; mitt?: string; shoe?: string; gem?: string; head?: string; sleeve?: string }
/** a full palette from a few colours: shading, sleeves and the crystal's faces are derived */
export function palette({ body, cape, mitt = cape, shoe = cape, gem = cape, head = tone(body, .45), sleeve = tone(body, .3) }: Colors): Palette {
  return {
    body, sleeve, edge: tone(body, -.16),
    capeD: tone(cape, -.25), capeL: cape, mitt, shoeD: tone(shoe, -.25), shoeL: shoe,
    head, headEdge: tone(head, -.22),
    gemL: gem, gemR: tone(gem, -.18), gemHi: tone(gem, .25), gemEdge: tone(gem, -.32),
  };
}

const s = (id: string, name: string, rarity: Rarity, c: Colors): Skin => ({ id: 'skin-' + id, slot: 'skin', name, rarity, pal: palette(c) });

export const SKINS: readonly Skin[] = [
  s('ocean', 'ฟ้าทะเล · Ocean', 'common', { body: '#e3edf5', cape: '#1e7fd0' }),
  s('forest', 'เขียวป่า · Forest', 'common', { body: '#e6efe4', cape: '#2e9e47' }),
  s('sunset', 'ส้มอัสดง · Sunset', 'common', { body: '#f5ebe1', cape: '#ef6c00' }),
  s('lemon', 'เลมอน · Lemon', 'common', { body: '#f7f4df', cape: '#e8c200', gem: '#f2a900' }),
  s('grape', 'องุ่น · Grape', 'common', { body: '#ece6f2', cape: '#8e24aa' }),
  s('bubblegum', 'หมากฝรั่ง · Bubblegum', 'common', { body: '#f8e8ef', cape: '#ec5c9b' }),
  s('mint', 'มิ้นต์ · Mint', 'common', { body: '#e4f4ee', cape: '#21b38a' }),
  s('sky', 'ท้องฟ้า · Sky', 'common', { body: '#e8f3fa', cape: '#4fb3e8' }),
  s('charcoal', 'ถ่าน · Charcoal', 'common', { body: '#c9ccd1', cape: '#3a3f48', gem: '#5b6270', head: '#eef0f2' }),
  s('cocoa', 'โกโก้ · Cocoa', 'common', { body: '#eee2d6', cape: '#7a4b2a' }),
  s('teal', 'เขียวหัวเป็ด · Teal', 'common', { body: '#e2f0ef', cape: '#00897b' }),
  s('coral', 'ปะการัง · Coral', 'common', { body: '#f7e7e2', cape: '#ff6f61' }),
  s('hivis', 'เสื้อสะท้อนแสง · Hi-Vis', 'rare', { body: '#d9f24a', cape: '#ff8a00', mitt: '#3a3f48', shoe: '#3a3f48', gem: '#ff8a00', head: '#fbfde8' }),
  s('fire', 'นักดับเพลิง · Firefighter', 'rare', { body: '#d8c39a', cape: '#c62828', mitt: '#3a3f48', shoe: '#2b2f36', gem: '#ffd400' }),
  s('navy', 'กรมท่า · Navy', 'rare', { body: '#dfe5ef', cape: '#0b1f3f', gem: '#ffd400', mitt: '#ffd400' }),
  s('olive', 'ทหารพราน · Ranger', 'rare', { body: '#c8c9a3', cape: '#556b2f', mitt: '#3e4a22', shoe: '#3e2c1c', gem: '#8a9a5b' }),
  s('midnight', 'เที่ยงคืน · Midnight', 'rare', { body: '#b8bfd6', cape: '#283593', gem: '#7c8cff', head: '#e8ebf7' }),
  s('sakura', 'ซากุระ · Sakura', 'rare', { body: '#fdf0f3', cape: '#f48fb1', gem: '#ff6fa3', mitt: '#ffffff' }),
  s('ice', 'น้ำแข็ง · Ice', 'rare', { body: '#e6f7fb', cape: '#4dd0e1', gem: '#b2ebf2', mitt: '#80deea' }),
  s('lava', 'ลาวา · Lava', 'rare', { body: '#4a3a36', cape: '#ff5722', gem: '#ffab00', head: '#f6e3da', mitt: '#ff9100' }),
  s('toxic', 'สารพิษ · Toxic', 'rare', { body: '#e9f7d2', cape: '#76ff03', gem: '#c6ff00', mitt: '#33691e', shoe: '#33691e' }),
  s('gold', 'ทองคำ · Gold', 'epic', { body: '#f6e7b0', cape: '#d4a017', gem: '#ffd700', mitt: '#b8860b', head: '#fff8dc' }),
  s('chrome', 'โครเมียม · Chrome', 'epic', { body: '#d5dbe1', cape: '#8a99a8', gem: '#e0f2ff', mitt: '#5f6d7a', head: '#f4f7fa' }),
  s('cyber', 'ไซเบอร์ · Cyber', 'epic', { body: '#2b2f45', cape: '#00e5ff', gem: '#ff2bd6', mitt: '#ff2bd6', shoe: '#00e5ff', head: '#e9ecff' }),
  s('galaxy', 'กาแล็กซี · Galaxy', 'epic', { body: '#3b2a6b', cape: '#7c4dff', gem: '#e040fb', mitt: '#18ffff', head: '#ece6ff' }),
  s('shadow', 'เงามืด · Shadow', 'epic', { body: '#3a3a44', cape: '#151519', gem: '#b388ff', mitt: '#6a1b9a', head: '#d9d6e6' }),
  s('pastel', 'พาสเทล · Pastel', 'epic', { body: '#fdf3e7', cape: '#a0c4ff', mitt: '#ffadad', shoe: '#caffbf', gem: '#ffd6a5' }),
  s('crown', 'จักรพรรดิ · Emperor', 'legendary', { body: '#fffaf0', cape: '#6a0dad', gem: '#ffd700', mitt: '#ffd700', shoe: '#ffd700' }),
  s('phoenix', 'ฟีนิกซ์ · Phoenix', 'legendary', { body: '#ffe0b2', cape: '#ff3d00', gem: '#ffea00', mitt: '#ff9100', shoe: '#dd2c00', head: '#fff3e0' }),
  s('diamond', 'เพชร · Diamond', 'legendary', { body: '#eefcff', cape: '#40c4ff', gem: '#ffffff', mitt: '#b3e5fc', shoe: '#0091ea', head: '#ffffff' }),
];
