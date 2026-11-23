/**
 * Zones: the run is one long corridor, split by distance into areas of the plant. Each has a Safety topic (shown on a banner as you
 * enter), a mix of hazard patterns and a lean towards the PPE that area asks for. Pure data: the sim uses it, the HUD shows it.
 */
import type { HazardKind, PpeType } from './hazards.js';

/**
 * single    – one hazard
 * double    – two hazards side by side, one free lane
 * slalom    – three rows of two blocks, the free lane walks left-centre-right
 * lowwall   – all three lanes low: jump
 * highwall  – all three lanes scaffold: slide
 * jumpslide – a low wall, then a high wall a second later: jump, then slide
 */
export type PatternId = 'single' | 'double' | 'slalom' | 'lowwall' | 'highwall' | 'jumpslide';

export interface Zone {
  id: 'entry' | 'forklift' | 'chemical' | 'height' | 'electrical' | 'evac';
  th: string; en: string;
  /** the Safety point of this area */
  tip: string; tipEn: string;
  /** which kinds a single / double hazard picks from (weights) */
  kinds: Partial<Record<HazardKind, number>>;
  patterns: Partial<Record<PatternId, number>>;
  /** this PPE is three times as likely to turn up here */
  ppe?: PpeType;
  /** colour of the light in the area (CSS), the HUD tints the screen with it, and an accent for its banner */
  tint: string; accent: string;
}

export const ZONES: readonly Zone[] = [
  {
    id: 'entry', th: 'ทางเข้าคลังสินค้า', en: 'Warehouse entrance', tip: 'สวม PPE ให้ครบก่อนเข้าพื้นที่ปฏิบัติงาน', tipEn: 'Full PPE before you enter the work area',
    kinds: { spill: 2, hose: 2, pipe: 1, forklift: 2, pallet: 2 }, patterns: { single: 7, double: 2 }, tint: 'rgba(0,0,0,0)', accent: '#ffd400',
  },
  {
    id: 'forklift', th: 'ทางรถโฟล์คลิฟท์', en: 'Forklift lane', tip: 'เดินในช่องทางเดินเท้า หยุดและสบตาคนขับก่อนข้าม', tipEn: 'Stay on the walkway; stop and make eye contact before crossing',
    kinds: { forklift: 5, pallet: 3, spill: 1, hose: 1 }, patterns: { single: 3, double: 3, slalom: 5 }, ppe: 'boots', tint: 'rgba(255,170,0,.10)', accent: '#ffaa00',
  },
  {
    id: 'chemical', th: 'พื้นที่สารเคมี', en: 'Chemical area', tip: 'ตรวจ SDS สวมแว่นและถุงมือ เจอของเหลวหกให้แจ้ง', tipEn: 'Check the SDS, wear glasses and gloves, report spills',
    kinds: { spill: 4, hose: 2, fumes: 4, pallet: 1 }, patterns: { single: 3, double: 2, lowwall: 4, jumpslide: 1 }, ppe: 'glasses', tint: 'rgba(120,220,60,.12)', accent: '#9be34a',
  },
  {
    id: 'height', th: 'งานบนที่สูง / นั่งร้าน', en: 'Work at height', tip: 'ตรวจนั่งร้านก่อนใช้ทุกครั้ง สวมหมวกนิรภัยคาดสายรัดคาง', tipEn: 'Inspect scaffolding before use; hard hat with the chin strap on',
    kinds: { pipe: 5, drop: 4, pallet: 1, forklift: 1 }, patterns: { single: 3, double: 2, highwall: 4, jumpslide: 3 }, ppe: 'helmet', tint: 'rgba(90,170,255,.11)', accent: '#5aaaff',
  },
  {
    id: 'electrical', th: 'ห้องไฟฟ้า', en: 'Electrical room', tip: 'LOTO ล็อกและแขวนป้ายก่อนซ่อม เก็บสายไฟให้พ้นทางเดิน', tipEn: 'Lock out and tag out before repairs; keep cables off the walkway',
    kinds: { hose: 4, sparks: 5, pipe: 2 }, patterns: { single: 2, double: 3, lowwall: 3, jumpslide: 3, slalom: 2 }, ppe: 'gloves', tint: 'rgba(110,90,255,.14)', accent: '#a08aff',
  },
  {
    id: 'evac', th: 'ซ้อมหนีไฟ', en: 'Evacuation drill', tip: 'รู้ทางหนีไฟ ไม่วิ่งสวนทาง ไปรวมพลที่จุดนัดหมาย', tipEn: 'Know your exits and go to the assembly point',
    kinds: { spill: 1, hose: 1, pipe: 1, forklift: 1, pallet: 1, fumes: 1, drop: 1, sparks: 1 }, patterns: { single: 2, double: 3, slalom: 3, lowwall: 2, highwall: 2, jumpslide: 3 }, ppe: 'ear', tint: 'rgba(255,60,50,.12)', accent: '#ff5a4a',
  },
];

/** metres per zone (after the first, shorter one the five working areas repeat, one after another) */
export const ZONE_FIRST = 800;
export const ZONE_LENGTH = 1000;

export interface ZoneAt { index: number; zone: Zone; n: number }

/** n counts every area entered so far (1-based), so a repeat of the same area is a new banner */
export function zoneAt(dist: number): ZoneAt {
  if (dist < ZONE_FIRST) return { index: 0, zone: ZONES[0]!, n: 1 };
  const k = Math.floor((dist - ZONE_FIRST) / ZONE_LENGTH), index = 1 + (k % (ZONES.length - 1));
  return { index, zone: ZONES[index]!, n: k + 2 };
}

/** Safety points, one at a time, from the Toolbox Talk box (a short talk before the work starts) */
export const TIPS: readonly string[] = [
  'สวมหมวกนิรภัยพร้อมคาดสายรัดคางทุกครั้ง',
  'เจอพื้นเปียก หยุด กั้นพื้นที่ วางป้าย แล้วแจ้งผู้รับผิดชอบ',
  'รถโฟล์คลิฟท์มีสิทธิ์ไปก่อน หยุดและสบตาคนขับ',
  'แว่นตานิรภัยกันสารเคมีกระเด็นเข้าตา',
  'ทำ KYT ก่อนเริ่มงานทุกครั้ง',
  'เก็บสายไฟสายยางให้เรียบร้อย ป้องกันการสะดุด',
  'ห้ามยืนใต้ของที่กำลังยกหรือแขวนอยู่',
  'LOTO: ล็อกและแขวนป้ายก่อนซ่อมเครื่องจักร',
  'รู้ทางหนีไฟและจุดรวมพลก่อนเริ่มงาน',
  'ตรวจนั่งร้านก่อนใช้งานทุกวัน',
  'เจอ Near miss แจ้งได้เลย ช่วยกันป้องกันก่อนเกิดเหตุ',
  'ถุงมือต้องเหมาะกับงาน ถุงมือผ้าไม่กันสารเคมี',
];
