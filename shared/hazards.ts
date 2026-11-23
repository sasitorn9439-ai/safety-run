export type HazardKind = 'spill' | 'hose' | 'pipe' | 'forklift' | 'pallet' | 'fumes' | 'drop' | 'sparks';
/**
 * The first five stand still. The other three move or change:
 *   fumes  – a chemical cloud that drifts sideways across the lanes (block: get out of its way)
 *   drop   – a load that falls on whichever lane you are in, a red mark follows you and then locks (block: leave the lane once it locks)
 *   sparks – an electrical arc that is on for half a second, off for half a second (low: jump it, or run through it while it is off)
 */
export const DYNAMIC_KINDS: readonly HazardKind[] = ['fumes', 'drop', 'sparks'];
export type HazardType = 'low' | 'high' | 'block';
export type PpeType = 'helmet' | 'gloves' | 'glasses' | 'ear' | 'boots';

export interface Hazard {
  /** low = jump over it, high = slide under it, block = change lane */
  t: HazardType;
  th: string;
  en: string;
  tip: string;
  tipEn: string;
}

export const HZ: Record<HazardKind, Hazard> = {
  spill: { t: 'low', th: 'พื้นเปียก / สารเคมีหก', en: 'Wet floor / chemical spill', tip: 'เห็นของเหลวหก ให้หยุด กั้นพื้นที่ วางป้ายเตือน แจ้งผู้รับผิดชอบ และตรวจ SDS หากเป็นสารเคมี', tipEn: 'Stop, barricade, put up a sign and report it. Check the SDS if it is a chemical.' },
  hose: { t: 'low', th: 'สายไฟ/สายยางพาดทางเดิน', en: 'Cables and hoses across the walkway', tip: 'จัดเก็บสายให้เรียบร้อย ใช้รางครอบสายหรือเดินสายด้านบน ห้ามพาดผ่านทางเดิน', tipEn: 'Route cables overhead or use cable covers. Keep walkways clear of trip hazards.' },
  pipe: { t: 'high', th: 'นั่งร้าน/โครงสร้างอยู่ต่ำ', en: 'Scaffolding / low overhead clearance', tip: 'สวมหมวกนิรภัยตลอดเวลาในพื้นที่ผลิต และทำแถบเหลือง-ดำที่จุดต่ำเพื่อเตือน', tipEn: 'Wear your hard hat in production areas and mark low points with yellow-black tape.' },
  forklift: { t: 'block', th: 'รถโฟล์คลิฟท์', en: 'Forklift traffic', tip: 'เดินในช่องทางเดินเท้าเท่านั้น หยุดและสบตาคนขับก่อนข้าม ห้ามเดินตัดหน้ารถ', tipEn: 'Use pedestrian walkways only. Stop and make eye contact with the driver before crossing.' },
  fumes: { t: 'block', th: 'ไอระเหยสารเคมี', en: 'Chemical fumes', tip: 'สวมหน้ากากและแว่นป้องกันในพื้นที่สารเคมี ระบายอากาศให้ดี และอย่าเข้าใกล้ไอที่ไม่ทราบชนิด', tipEn: 'Wear a respirator and eye protection, keep the area ventilated and stay out of unknown fumes.' },
  drop: { t: 'block', th: 'ของตกจากที่สูง', en: 'Falling objects', tip: 'สวมหมวกนิรภัยเสมอ ห้ามยืนใต้ของที่กำลังยกหรืองานเหนือศีรษะ และกั้นพื้นที่ใต้งานบนที่สูง', tipEn: 'Hard hat on. Never stand under a lifted load or overhead work; barricade the area below.' },
  sparks: { t: 'low', th: 'ประกายไฟ/ไฟฟ้าลัดวงจร', en: 'Electrical arc', tip: 'ห้ามแตะสายไฟเปลือย ใช้ LOTO ก่อนซ่อม สวมถุงมือกันไฟฟ้า และแจ้งช่างไฟฟ้าทันที', tipEn: 'Never touch exposed wires; lock out and tag out before repairs, wear insulated gloves and call an electrician.' },
  pallet: { t: 'block', th: 'วางวัสดุกีดขวางทางเดิน', en: 'Blocked walkway, unstable stacking', tip: 'จัดเก็บวัสดุในพื้นที่ที่ตีเส้นไว้ ซ้อนให้มั่นคงไม่สูงเกินกำหนด และไม่วางบนเส้นทางเดิน', tipEn: 'Store materials in marked areas, stack them stable and low, never on the walkway.' },
};

export const HAZARD_KINDS = Object.keys(HZ) as HazardKind[];
export const PPE: readonly PpeType[] = ['helmet', 'gloves', 'glasses', 'ear', 'boots'];
