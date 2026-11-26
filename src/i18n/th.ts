/**
 * Thai text of the game screens. This file defines the keys; en.ts must give every one of them.
 * English words that Thai players use as they are (PPE, Near Miss, E-Stop, LOTO, Toolbox Talk, Safety Officer…) stay in English.
 * Keys used in index.html (data-i18n / data-i18n-html / data-i18n-aria) must be plain strings.
 */
export const th = {
  /* ---------- language switch ---------- */
  langLabel: 'ภาษา',

  /* ---------- HUD ---------- */
  hudScore: 'คะแนน',
  officerHi: 'Safety Officer ทักทาย',
  officerPts: (n: number) => `+${n} คำชม`,
  tutOk: 'ผ่านแล้ว',
  skipTut: 'ข้ามการสอน',
  pauseAria: 'หยุดชั่วคราว',
  pbBeat: 'ทำลายสถิติแล้ว!',
  pb: (m: string) => `สถิติ ${m} ม.`,
  zoneEnter: 'เข้าสู่พื้นที่',
  tutHead: { move: 'ฝึกหลบอันตราย', ppe: 'ฝึกเก็บ PPE', shield: 'ฝึกใช้เกราะ' } as Record<'move' | 'ppe' | 'shield', string>,
  tutStep: (head: string, i: number, n: number) => `${head} ${i}/${n}`,
  tutDone: 'ฝึกเสร็จแล้ว',
  tutReady: 'พร้อมแล้ว! เริ่มนับคะแนน',
  tutReadySub: 'เก็บ PPE ครบ 5 ชนิด = โล่กันชน',

  /* ---------- menu ---------- */
  menuSub: 'หลบอันตรายในโรงงาน เก็บ PPE ให้ครบชุด<br><strong>เล่นได้หลายรอบ นับคะแนนสูงสุด</strong><br>กรอกรหัสพนักงานเพื่อรับไอคอนบนตารางอันดับ',
  prizeBtn: '🏆 ดูของรางวัล Top 7',
  wardBtn: 'กล่องสุ่ม & ตู้เสื้อผ้า',
  empId: 'รหัสพนักงาน',
  lockOpen: 'ล็อคอิน',
  lockBusy: 'กำลังล็อคอิน',
  lockLocked: 'ล็อคอินแล้ว แตะเพื่อเปลี่ยนรหัส',
  start: 'เริ่มวิ่ง',
  boardBtn: 'ดูอันดับ',
  howBtn: 'วิธีเล่น',
  menuSmall: 'เล่นพอดี ๆ อย่าลืมพักสายตา<br>กดหยุดพัก แล้วกลับมาเล่นต่อได้ ❤️',
  newsBtn: 'เวอร์ชัน 0.0.2 · มีอะไรใหม่',

  /* ---------- how to play ---------- */
  howTitle: 'วิธีเล่น',
  how1: 'ปัดซ้าย/ขวา เปลี่ยนเลน หลบโฟล์คลิฟท์และกองวัสดุ',
  how2: 'ปัดขึ้น กระโดดข้ามพื้นเปียก สายไฟพาดทาง',
  how3: 'ปัดลง สไลด์ลอดนั่งร้านที่อยู่ต่ำ',
  how4: 'ชนแล้วตอบคำถามความปลอดภัยให้ถูก ได้วิ่งต่อ 1 ครั้งต่อรอบ (คำถามไม่ซ้ำ)',
  how5: 'ทุก 1,500 เมตร มีเซอร์ไพรส์ เช่น Safety Officer โผล่มาทัก ฝนเหรียญ หรือคะแนน x2',
  how6: 'เก็บเหรียญเพิ่มคะแนน แถวเหรียญจะมี PPE แทรกอยู่ทีละชิ้น',
  how7: 'เก็บครบ 5 ชนิด ได้โล่ Full PPE กันชน 1 ครั้ง',
  how8: 'หลบเฉียดฉิว (เปลี่ยนเลน กระโดด หรือสไลด์ในจังหวะสุดท้าย) ต่อคอมโบ Near Miss คะแนนเหรียญและ PPE คูณสูงสุด x4',
  how9: 'ไอเทม Safety ในแถวเหรียญ: E-Stop ทำให้เกมช้าลง · ไม้กวาด 5ส ดูดเหรียญ · รถกระเช้าลอยข้ามอันตราย · ชุดปฐมพยาบาลกันชนเพิ่ม 1 ครั้ง · กล่อง Toolbox Talk ได้ของรางวัลพร้อมเกร็ดความรู้',
  how10: 'วิ่งผ่านหลายพื้นที่ของโรงงาน แต่ละที่มีอันตรายและเรื่อง Safety ต่างกัน เช่น ไอสารเคมีที่ลอยข้ามเลน ของที่ตกใส่เลนที่คุณยืนอยู่ (ออกจากเลนเมื่อเครื่องหมายแดงนิ่ง) และประกายไฟที่ติดดับเป็นจังหวะ',
  howFoot: 'กดเริ่มแล้วนับเป็น 1 ครั้งทันที ห้ามปิดหน้าจอระหว่างเล่น · กดปุ่ม ‖ เพื่อหยุดชั่วคราว · คอมพิวเตอร์ใช้ปุ่มลูกศร หยุดด้วย P หรือ Esc',
  gotIt: 'เข้าใจแล้ว',

  /* ---------- prizes ---------- */
  prizeTitle: 'ของรางวัล',
  prize1: 'อันดับ 1',
  prize1Item: 'HUAWEI Band 11 Series (Smartwatch)',
  prize2: 'อันดับ 2 ถึง 5',
  prize2Item: 'บัตรเติมน้ำมัน มูลค่า 500 บาท',
  prize3: 'อันดับ 6 และ 7',
  prize3Item: 'BEZ ร่มพับอัตโนมัติ',
  prizeNote: 'นับคะแนนสูงสุดของแต่ละคน รักษาอันดับไว้จนประกาศผล',
  close: 'ปิด',

  /* ---------- what's new ---------- */
  newsTitle: 'มีอะไรใหม่',
  ver002: 'เวอร์ชัน 0.0.2',
  ver001: 'เวอร์ชัน 0.0.1',
  news1: 'หีบสมบัติ! หาได้ในแถวเหรียญ เปิดได้สกิน หมวก เอฟเฟกต์ <mark class="news-hi">ผู้เล่นเก่ารับฟรี 10 หีบ</mark>',
  news2: 'ตู้เสื้อผ้า แต่งตัวละคร ลองใส่ได้ก่อนปลดล็อก',
  news3: 'ขยายรางวัลถึง Top 7 อันดับ 2 ถึง 5 ได้บัตรเติมน้ำมัน 500 บาท อันดับ 6 และ 7 ได้ร่มพับอัตโนมัติ',
  news4: 'ปลดลิมิตเวลาแล้ว เล่นได้เกิน 30 นาที วิ่งต่อได้จนกว่าจะชน',
  newsOk: 'รับทราบ',

  /* ---------- wardrobe ---------- */
  wardTitle: 'ตู้เสื้อผ้า',
  wardPreview: 'ตัวละครกับชุดที่ใส่อยู่',
  wardBoxes: 'กล่องสุ่ม',
  wardHow: 'กล่องสุ่มหายากมาก วิ่งให้ไกลแล้วมองหาหีบสมบัติในแถวเหรียญ ได้ของซ้ำครบ 5 ชิ้น รับกล่องฟรี 1 กล่อง',
  tabSkin: 'สกิน',
  tabHat: 'หมวก',
  tabEffect: 'เอฟเฟกต์',
  slot: { skin: 'สกิน', hat: 'หมวก', effect: 'เอฟเฟกต์' } as Record<'skin' | 'hat' | 'effect', string>,
  open: (n: number) => `เปิด ${n}`,
  openMore: (n: number) => `เปิดต่อ ${n}`,
  openBox: 'เปิดกล่องสุ่ม',
  wear: 'ใส่',
  meter: (n: number, max: number) => `ของซ้ำ ${n}/${max} · ครบ ${max} ได้กล่องฟรี`,
  collected: (n: number, all: number) => `สะสมแล้ว ${n}/${all} ชิ้น`,
  enterIdLock: 'ใส่รหัสพนักงานแล้วกดปุ่มกุญแจ',
  specialSkin: 'สกินพิเศษ',
  runs: 'รอบ',
  unlocked: 'ปลดล็อกแล้ว ✓',
  runsLeft: (n: number) => `เหลืออีก ${n} รอบ`,
  none: 'ไม่ใส่',
  tryOn: (name: string) => `ลองใส่ ${name} (ยังไม่ได้ปลดล็อก)`,
  tapShake: 'แตะกล่องเพื่อเขย่า',
  boxAria: (n: number) => (n > 1 ? `กล่องสุ่ม ${n} กล่อง แตะเพื่อเขย่า` : 'กล่องสุ่ม แตะเพื่อเขย่า'),
  twoMore: 'อีก 2 ครั้ง',
  onceMore: 'อีกครั้งเดียว!',
  opening: 'กำลังเปิด…',
  openFail: 'เปิดกล่องไม่สำเร็จ ลองอีกครั้ง',
  newItems: (n: number) => (n > 1 ? `ได้ของใหม่ ${n} ชิ้น!` : 'ได้ของใหม่!'),
  dupes: (n: number) => `ได้ของซ้ำ ${n} ชิ้น`,
  mixed: (fresh: number, dupes: number) => `ของใหม่ ${fresh} ชิ้น · ของซ้ำ ${dupes} ชิ้น`,
  freeBoxes: (n: number) => `ได้กล่องฟรี ${n} กล่อง`,

  /* ---------- crash / tally ---------- */
  accident: 'เกิดอุบัติเหตุ',
  score: 'คะแนน',
  distance: 'ระยะทาง (ม.)',
  coins: 'เหรียญ',
  extra: 'โบนัสพิเศษ',
  lootBox: 'กล่องสุ่ม',
  chanceIdle: 'ตอบคำถามความปลอดภัย เพื่อวิ่งต่อ',
  chance: (s: number) => `ตอบคำถามให้ถูก รักษา ${s} คะแนนไว้ แล้ววิ่งต่อ (ได้ 1 ครั้ง)`,
  endRun: 'จบเกม ส่งคะแนน',
  gapTop: 'คะแนนรอบนี้สูงกว่าทุกคนบนอันดับ <b>เป็นที่ 1</b> แล้ว!',
  gapSelf: (n: number, rank: number) => `อีก <b>${n}</b> คะแนน จะทำลายสถิติของคุณเอง (อันดับ ${rank})`,
  gapRank: (n: number, rank: number, prize: boolean) => `เหลืออีก <b>${n}</b> คะแนน ถึงอันดับ <b>${rank}</b>${prize ? ' ซึ่งได้รางวัล' : ''}`,
  timeUp: 'ครบรอบ',
  timeUpTip: 'ส่งคะแนนของรอบนี้',

  /* ---------- pause ---------- */
  paused: 'หยุดชั่วคราว',
  resume: 'เล่นต่อ',
  mainMenu: 'เมนูหลัก',
  leaveWarn: 'ออกตอนนี้ คะแนนรอบนี้จะไม่ถูกบันทึก และนับเป็น 1 ครั้ง',
  leaveConfirm: 'ยืนยันออกจากรอบนี้',
  leftRun: 'ออกจากรอบก่อนหน้าแล้ว นับเป็น 1 ครั้ง',
  prevClosed: 'รอบก่อนหน้าถูกปิดระหว่างเล่น นับเป็น 1 ครั้งแล้ว',

  /* ---------- quiz ---------- */
  quizHead: 'โอกาสรอด ตอบให้ถูกเพื่อวิ่งต่อ (ได้ 1 ครั้ง)',
  quizOk: 'ถูกต้อง! วิ่งต่อ',
  quizNo: 'ยังไม่ถูก · จบรอบนี้ ส่งคะแนน',
  bonusHead: (r: number) => `โบนัสพิเศษ! ตอบถูกรับ +${r} คะแนน`,
  bonusOk: (r: number) => `ถูกต้อง! +${r} คะแนน วิ่งต่อ`,
  bonusNo: 'ยังไม่ถูก ไม่เป็นไร วิ่งต่อ',

  /* ---------- player icon ---------- */
  avHead: 'ไอคอนประจำตัวของคุณ',
  avNote: 'ตารางอันดับจะแสดงไอคอนนี้แทนรหัสพนักงาน<br>ไม่มีใครได้ไอคอนซ้ำกับคุณ',
  avGo: 'เริ่มวิ่ง',
  player: 'ผู้เล่น',

  /* ---------- login / start ---------- */
  errBadId: 'รหัสพนักงานไม่ถูกต้อง (ตัวเลข 4 หลักเท่านั้น)',
  errNoName: 'กรุณากรอกชื่อ',
  errBusy: 'มีการเริ่มเล่นรหัสนี้พร้อมกันจากอีกเครื่อง ลองใหม่',
  errServer: 'ระบบขัดข้อง ลองใหม่อีกครั้ง',
  noConn: 'เชื่อมต่อไม่ได้ ตรวจสอบอินเทอร์เน็ต',
  checking: 'กำลังตรวจสอบสิทธิ์…',
  runLabel: (n: number) => `รอบที่ ${n} · GO!`,
  used: (max: number, best: number | null | undefined) => `รหัสนี้เล่นครบ ${max} ครั้งแล้ว${best != null ? ` · คะแนนดีที่สุด ${best}` : ''}`,

  /* ---------- submit ---------- */
  submitted: 'ส่งคะแนนแล้ว',
  submitting: 'กำลังส่งคะแนน…',
  pts: (n: number) => `${n} คะแนน`,
  submittedRun: (n: number) => `ส่งคะแนนแล้ว · รอบที่ ${n}`,
  thisRun: (n: number) => `รอบนี้ ${n} คะแนน`,
  bestOf: (name: string, best: number) => `${name} · คะแนนดีที่สุด ${best}`,
  bestRank: (name: string, best: number, rank: number, total: number) => `${name} · คะแนนดีที่สุด ${best} · อันดับที่ ${rank} จาก ${total} คน`,
  winNote: (rank: number) => `ตอนนี้คุณอยู่อันดับ ${rank} รักษาอันดับไว้จนประกาศผล`,
  playAgain: 'เล่นอีกครั้ง',
  rejectedHead: 'รอบนี้ส่งคะแนนไม่ได้',
  rejected: 'ข้อมูลการเล่นไม่ผ่านการตรวจสอบ กรุณาเริ่มรอบใหม่',
  backStart: 'กลับหน้าเริ่ม',
  notYetHead: 'ยังส่งคะแนนไม่ได้',
  notYet: 'เชื่อมต่อไม่ได้ คะแนนยังเก็บไว้ในเครื่อง กดส่งอีกครั้ง',
  retry: 'ส่งคะแนนอีกครั้ง',
  thanks: 'ขอบคุณที่ร่วมกิจกรรม EHS Day 2026',

  /* ---------- leaderboard ---------- */
  board: 'อันดับ',
  back: 'กลับ',
  you: ' (คุณ)',
  noScores: 'ยังไม่มีคะแนน',
  boardFail: 'โหลดอันดับไม่ได้',
  loading: 'กำลังโหลด…',
  boardTotal: (n: number) => `ผู้เล่นทั้งหมด ${n} คน · Top 20`,

  /* ---------- in-game sign art ---------- */
  signHead: 'ระวังศีรษะ',
};

/** the shape every language fills in: the same keys, the same function arguments */
export type Dict = { [K in keyof typeof th]: (typeof th)[K] };
