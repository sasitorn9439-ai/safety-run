/**
 * Game content that lives in shared/ (the sim, the question bank, zones, hazards, avatar names) is written in Thai and must stay
 * byte-for-byte as it is: the server replays runs with it. So the browser translates it on the way to the screen instead:
 *
 *   tr(text)      a question, an answer, a tip or a toast from the sim, in the current language
 *   avNameL(n)    the player's icon name
 *
 * Anything without an English version here is shown as it is.
 */
import { AV_C, AV_F, AV_G, avParts } from '../../shared/avatar.js';
import { HZ } from '../../shared/hazards.js';
import { QB, type Question } from '../../shared/questions.js';
import { TIPS } from '../../shared/zones.js';
import { bi, getLang, t, type Lang } from './index.js';

/** English for shared/questions.ts QB: the same levels, questions and answers in the same order */
export const QB_EN: readonly (readonly Question[])[] = [
[ // Level 1 · basics on the plant floor
 ['What does a round sign with a blue background mean?', ['A mandatory sign, it must be followed', 'A prohibition sign', 'A hazard warning sign']],
 ['What does a round sign with a red border and a line through it mean?', ['A prohibition sign', 'A mandatory sign', 'An emergency exit sign']],
 ['What does a triangular sign, yellow with a black border, mean?', ['A hazard warning sign', 'A mandatory sign', 'A prohibition sign']],
 ['A green sign, like an emergency exit sign, is what kind of sign?', ['A safe condition sign', 'A prohibition sign', 'A hazard warning sign']],
 ['What should you do after a near miss?', ['Report it to your supervisor right away so it is fixed before a real accident', 'Nothing, nobody got hurt', 'Just tell a friend about it']],
 ['What is the right way to lift something heavy?', ['Bend your knees, keep your back straight, hold the load close', 'Bend your back with straight legs', 'Twist while lifting']],
 ['Which route should you walk in the plant?', ['The marked pedestrian walkway', 'The nearest shortcut', 'The forklift lane']],
 ['You need to use your phone in the production area. What should you do?', ['Stop walking and stand in a safe spot first', 'Use it while you walk', 'Use it while running a machine']],
 ['How do you wear a hard hat correctly?', ['Fitted to your head with the chin strap fastened', 'Backwards, for comfort', 'Loose on your head, no strap']],
 ['You find a wet floor or spilled oil on a walkway. What should you do?', ['Put up a warning sign and have it cleaned up right away', 'Walk around it and get back to work', 'Wait for it to dry']],
 ['Which shoes are not allowed in the production area?', ['Sandals or open-toed shoes', 'Steel-toe safety shoes', 'Safety shoes issued by the company']],
 ['What should you do before you start work every day?', ['Check the area and the equipment before use', 'Start at once to stay on schedule', 'Wait for the supervisor to check it']],
],[ // Level 2 · PPE and chemicals
 ['What is an SDS?', ['Safety Data Sheet: the safety information for a chemical', 'A chemical purchase order', 'A machine user manual']],
 ['Where do you find out how a chemical is hazardous and what PPE it needs?', ['The SDS and the label on the container', 'Smell it', 'Ask a friend who has used it']],
 ['A chemical splashes into someone’s eyes. What is the first aid?', ['Rinse with clean running water for at least 15 minutes, then see a doctor', 'Rub the eyes to get the chemical out', 'Use eye drops and keep working']],
 ['What does a flame symbol on a chemical label mean?', ['Flammable', 'Corrosive', 'Irritant']],
 ['What does a skull and crossbones on a chemical label mean?', ['Acutely toxic', 'Flammable', 'Gas under pressure']],
 ['What does a symbol of liquid dripping onto a hand and a metal plate mean?', ['Corrosive', 'Flammable', 'Hazardous to the environment']],
 ['Can you pour some chemical into a drinking-water bottle to take it with you?', ['No, use a proper container labelled with the chemical’s name', 'Yes, if you wash the bottle first', 'Yes, if you use it all the same day']],
 ['What do you need when working in a noisy area?', ['Ear plugs or ear muffs', 'Safety glasses', 'Cotton gloves']],
 ['Can you handle chemicals with cotton gloves?', ['No, use the chemical-resistant gloves the SDS specifies', 'Yes, if you wear two pairs', 'Yes, if only briefly']],
 ['Does a dust mask protect you from solvent (thinner) vapour?', ['No, you need a respirator with an organic vapour cartridge', 'Yes, any kind does', 'Yes, if it fits tightly']],
 ['Your own PPE is damaged. What should you do?', ['Tell your supervisor and replace it before starting work', 'Keep using it for now', 'Fix it yourself with tape']],
 ['How should chemicals that react with each other, such as acids and bases, be stored?', ['Separately, in different areas', 'Together, so they are easy to grab', 'Stacked on the same shelf']],
],[ // Level 3 · machines and electricity
 ['What must you do before repairing or cleaning a machine?', ['Cut the power, lock it out and tag it (LOTO)', 'Just press Stop', 'Ask a friend to guard the switch']],
 ['Who may remove a LOTO lock?', ['Only the person who owns that lock', 'Any supervisor', 'Whoever is about to run the machine']],
 ['When may a machine guard be removed?', ['Only when the machine is stopped and LOTO is done', 'When the machine runs slowly', 'When the guard blocks the view']],
 ['What should you not wear near the rotating parts of a machine?', ['Gloves, loose clothing and jewellery', 'Safety glasses', 'Safety shoes']],
 ['An employee with long hair works near a rotating machine. What should they do?', ['Tie the hair back and tuck it under a cap', 'Leave it loose but be careful', 'Cover it loosely with a scarf']],
 ['What does an Emergency Stop button look like?', ['A red button on a yellow background', 'A green button', 'A blue button']],
 ['A machine sounds or behaves abnormally. What should you do?', ['Stop it and call maintenance', 'Keep working until the end of the shift', 'Open the cover and fix it yourself']],
 ['You find a damaged cable with cracked insulation. What should you do?', ['Stop using it and call an electrician', 'Tape it yourself and keep using it', 'Keep using it if there are no sparks']],
 ['Can you daisy-chain several power strips to run several tools?', ['Better not: it risks a short circuit and fire', 'Yes, if they are new', 'Yes, if only briefly']],
 ['Someone is getting an electric shock. What do you do first?', ['Cut the power, or separate them with something that does not conduct', 'Pull them away with your bare hands at once', 'Pour water on them']],
 ['What should the area in front of an electrical panel be like?', ['Clear, nothing may block it', 'OK for pallets for a while', 'A place to store equipment']],
 ['Scrap gets stuck in a machine while it is running. What should you do?', ['Stop it and do LOTO before removing it', 'Pull it out quickly by hand', 'Poke it out with a steel bar while it runs']],
],[ // Level 4 · high-risk work
 ['From what height does work need fall protection?', ['2 metres', '4 metres', '6 metres']],
 ['When should a full-body harness be inspected?', ['Every time before use', 'Once a year', 'Only when it looks old']],
 ['Where should the harness lanyard hook be attached?', ['A strong anchor point above shoulder height', 'The nearest stair rail', 'At foot level']],
 ['What ratio is right for setting up a leaning ladder?', ['1 unit out from the wall for every 4 units of height', '1 out for every 1 up', 'Straight up against the wall']],
 ['Welding, cutting or grinding outside the designated area needs what?', ['A Hot Work Permit first', 'Nothing, if it is quick', 'Just tell the person next to you']],
 ['Before going into a tank, pit or confined space, what must you do?', ['Get a permit and test the air before entering', 'Go in if there is no strange smell', 'Leave the lid open 5 minutes, then go in']],
 ['You find a co-worker unconscious in a pit or tank. What should you do?', ['Do not go in yourself; call the rescue team with the right equipment', 'Go in to help right away', 'Go in together with several people']],
 ['Can you walk under a load being lifted by a crane?', ['Never', 'Yes, if you walk fast', 'Yes, if you wear a hard hat']],
 ['Who may drive a forklift?', ['Only trained and authorised people', 'Anyone who can drive a car', 'Whoever is closest to the forklift']],
 ['Can someone stand on the forks of a forklift to be lifted up to work at height?', ['Never', 'Yes, if it is not lifted high', 'Yes, if someone holds them']],
 ['While a forklift is moving, where should the forks be?', ['Low, near the floor, just clear of obstacles', 'At eye level', 'Raised all the way']],
 ['You see a contractor working unsafely in your area. What should you do?', ['Ask them to Stop Work and tell the person in charge', 'Ignore it, they are not our employee', 'Just take a photo']],
],[ // Level 5 · emergencies and reporting
 ['You hear the fire alarm. What should you do?', ['Stop work, shut down the machine and evacuate to the assembly point', 'Keep working until you see fire', 'Go back for your belongings first']],
 ['What must you not use during a fire evacuation?', ['The lift', 'The fire escape stairs', 'The emergency exit']],
 ['Once you reach the assembly point, what must you do?', ['Report in to be counted and do not go back in until allowed', 'Go home at once', 'Go back in for your things']],
 ['Using a fire extinguisher by PASS, what is the first step?', ['Pull the pin', 'Squeeze the handle', 'Sweep the nozzle']],
 ['Where on a fire should you aim the extinguisher?', ['The base of the fire', 'The top of the flames', 'The smoke']],
 ['What must never be used on an oil or flammable-liquid fire?', ['Water', 'A dry chemical powder extinguisher', 'A foam extinguisher']],
 ['Escaping a fire through thick smoke, what should you do?', ['Stay low, cover your nose with a cloth and follow the exit signs', 'Stand up straight and run', 'Hide in the toilet']],
 ['A co-worker is cut by something sharp and bleeding heavily. What is the first aid?', ['Press on the wound with a clean cloth and call the nurse', 'Clean it with alcohol and leave it', 'Send them back to work']],
 ['What is the number to report a fire in Thailand?', ['199', '1669', '191']],
 ['What is the emergency ambulance number in Thailand?', ['1669', '199', '1155']],
 ['What is KYT?', ['Hazard prediction training before starting work', 'The annual health check', 'The production summary meeting']],
 ['Must a minor work injury be reported?', ['Yes, every time, even a minor one', 'No, if you can dress it yourself', 'Only if you have to stop work']],
]];

/** English for shared/zones.ts TIPS (the Toolbox Talk box), in the same order */
const TIPS_EN: readonly string[] = [
  'Always wear your hard hat with the chin strap fastened',
  'Wet floor? Stop, cordon it off, put up a sign and tell the person in charge',
  'Forklifts have right of way: stop and make eye contact with the driver',
  'Safety glasses keep chemical splashes out of your eyes',
  'Do KYT before every job',
  'Tidy away cables and hoses so nobody trips',
  'Never stand under a load being lifted or hanging',
  'LOTO: lock out and tag out before repairing a machine',
  'Know the fire exits and the assembly point before you start work',
  'Inspect the scaffold every day before use',
  'Report every near miss: together we stop accidents before they happen',
  'Use gloves made for the job: cotton gloves do not stop chemicals',
];

/** the sim's fixed messages (toasts, surprises, the Safety Officer): [Thai as shown in Thai, English] keyed by the sim's text */
const FIXED: Record<string, readonly [th: string, en: string]> = {
  // the Safety Officer
  'ใส่ PPE ครบ เยี่ยมมาก! Safety First': ['ใส่ PPE ครบ เยี่ยมมาก! Safety First', 'Full PPE, great job! Safety First'],
  'เดินในทางเดินเท้านะ ไม่ใช่เลนรถโฟล์คลิฟท์': ['เดินในทางเดินเท้านะ ไม่ใช่เลนรถโฟล์คลิฟท์', 'Stay on the walkway, not the forklift lane'],
  'เจอ Near miss แจ้งได้เลยนะ ไม่ต้องเกรงใจ': ['เจอ Near miss แจ้งได้เลยนะ ไม่ต้องเกรงใจ', 'Saw a near miss? Report it, no need to be shy'],
  'วิ่งมาไกลแล้ว อย่าลืมดื่มน้ำนะ': ['วิ่งมาไกลแล้ว อย่าลืมดื่มน้ำนะ', 'You have run a long way, remember to drink water'],
  'หมวกนิรภัยต้องคาดสายรัดคางด้วยนะ': ['หมวกนิรภัยต้องคาดสายรัดคางด้วยนะ', 'Fasten the chin strap on your hard hat'],
  'ทำ KYT ก่อนเริ่มงานทุกครั้งนะ': ['ทำ KYT ก่อนเริ่มงานทุกครั้งนะ', 'Do KYT before every job'],
  'เก่งมาก! ไม่มีอุบัติเหตุคือเป้าหมายของเรา': ['เก่งมาก! ไม่มีอุบัติเหตุคือเป้าหมายของเรา', 'Well done! Zero accidents is our goal'],
  // surprises
  'Coin Rain! เก็บให้หมด': ['Coin Rain! เก็บให้หมด', 'Coin Rain! Grab them all'],
  'ฝนเหรียญตกทั้ง 3 เลน': ['ฝนเหรียญตกทั้ง 3 เลน', 'Coins pour down all 3 lanes'],
  'ได้โล่ PPE ฟรี กันชน 1 ครั้ง': ['ได้โล่ PPE ฟรี กันชน 1 ครั้ง', 'A free PPE shield: blocks 1 hit'],
  'คะแนนระยะทาง x2 นาน 8 วินาที': ['คะแนนระยะทาง x2 นาน 8 วินาที', 'Distance points x2 for 8 seconds'],
  // Toolbox Talk rewards
  '+10 เหรียญ': ['+10 เหรียญ', '+10 coins'],
  'โล่ PPE': ['โล่ PPE', 'PPE shield'],
  'คะแนน x2': ['คะแนน x2', 'Points x2'],
  'ไม้กวาด 5ส': ['ไม้กวาด 5ส', '5S broom'],
  // power-ups and pick-ups
  'E-Stop! หยุดงานเพื่อความปลอดภัย · เกมช้าลง': ['E-Stop! หยุดงานเพื่อความปลอดภัย · เกมช้าลง', 'E-Stop! Stop work for safety · the game slows down'],
  '5ส! ไม้กวาดดูดเหรียญ': ['5ส! ไม้กวาดดูดเหรียญ', '5S! The broom pulls in coins'],
  'ชุดปฐมพยาบาล! กันชนได้อีก 1 ครั้ง': ['ชุดปฐมพยาบาล! กันชนได้อีก 1 ครั้ง', 'First-aid kit! Survive 1 more hit'],
  'รถกระเช้า! ลอยเหนืออันตราย เก็บเหรียญ': ['รถกระเช้า! ลอยเหนืออันตราย เก็บเหรียญ', 'Man-lift! Float over the hazards and grab coins'],
  'FULL PPE! โล่กันชน 1 ครั้ง': ['FULL PPE! โล่กันชน 1 ครั้ง', 'FULL PPE! A shield for 1 hit'],
  'ได้กล่องสุ่ม! เปิดได้ที่เมนู · Loot box!': ['ได้กล่องสุ่ม! เปิดได้ที่เมนู', 'Loot box! Open it from the menu'],
  'PPE ช่วยไว้! · Saved by PPE': ['PPE ช่วยไว้!', 'Saved by PPE!'],
  'ชุดปฐมพยาบาลช่วยไว้!': ['ชุดปฐมพยาบาลช่วยไว้!', 'Saved by the first-aid kit!'],
  'รอดแล้ว! ชนอีกครั้งจบรอบ': ['รอดแล้ว! ชนอีกครั้งจบรอบ', 'Saved! The next crash ends the run'],
  // bonus question
  'ยังไม่ถูก ไปต่อ! · Not quite, keep running': ['ยังไม่ถูก ไปต่อ!', 'Not quite, keep running!'],
  'หมดเวลา ไปต่อ! · Time up, keep running': ['หมดเวลา ไปต่อ!', 'Time up, keep running!'],
};

/** messages with a number or a name in them */
const PATTERNS: readonly [RegExp, (m: RegExpMatchArray, l: Lang) => string][] = [
  [/^ตอบถูก! \+(\d+) คะแนน พุ่ง! 🚀 · Bonus \+\d+$/, (m, l) => (l === 'en' ? `Correct! +${m[1]} points, sprint! 🚀` : `ตอบถูก! +${m[1]} คะแนน พุ่ง! 🚀`)],
  [/^ตอบถูก! \+(\d+) คะแนน · Bonus \+\d+$/, (m, l) => (l === 'en' ? `Correct! +${m[1]} points` : `ตอบถูก! +${m[1]} คะแนน`)],
  [/^ชน! (.+)$/, (m, l) => (l === 'en' ? `Hit! ${Object.values(HZ).find(h => h.th === m[1])?.en ?? m[1]}` : m[0])],
  [/^Toolbox Talk · (.+)$/, (m, l) => `Toolbox Talk · ${tr(m[1]!, l)}`],
];

/** Thai text → English, for the question bank and the tips; built once */
let EN: Map<string, string> | null = null;
function englishOf(): Map<string, string> {
  if (EN) return EN;
  EN = new Map();
  QB.forEach((level, i) => level.forEach(([prompt, choices], j) => {
    const [p, c] = QB_EN[i]?.[j] ?? [];
    if (p) EN!.set(prompt, p);
    choices.forEach((x, k) => { const e = c?.[k]; if (e && !EN!.has(x)) EN!.set(x, e); });
  }));
  TIPS.forEach((tip, i) => { const e = TIPS_EN[i]; if (e) EN!.set(tip, e); });
  return EN;
}

/** text from the sim (or the question bank) in language `l` */
export function tr(text: string, l: Lang = getLang()): string {
  if (!text) return text;
  const fixed = FIXED[text];
  if (fixed) return fixed[l === 'en' ? 1 : 0];
  for (const [re, fn] of PATTERNS) { const m = text.match(re); if (m) return fn(m, l); }
  if (l === 'en') { const e = englishOf().get(text); if (e) return e; }
  return bi(text, l);
}

/* ---------- player icon names: glyph × colour × frame, as in shared/avatar.ts ---------- */
const AV_G_EN = ['Helmet', 'Glove', 'Goggles', 'Ear Muffs', 'Boot', 'Cone', 'Extinguisher', 'First-Aid Kit', 'Bolt', 'Star', 'Shield', 'Wrench'] as const;
const AV_C_EN = ['Red', 'Orange', 'Gold', 'Green', 'Emerald', 'Sky', 'Indigo', 'Purple', 'Pink', 'Brown', 'Grey', 'Navy'] as const;
const AV_F_EN = ['', 'Silver rim', 'Gold rim'] as const;
// the lists must line up with shared/avatar.ts (a test checks the lengths)
export const AV_EN_SIZES = [AV_G_EN.length === AV_G.length, AV_C_EN.length === AV_C.length, AV_F_EN.length === AV_F.length];

export function avNameL(n: number | null | undefined, l: Lang = getLang()): string {
  const p = avParts(n);
  if (!p) return t().player;
  if (l === 'th') return AV_G[p.g] + AV_C[p.c]![1] + (p.f ? ' ' + AV_F[p.f] : '') + (p.lap ? ' #' + (p.lap + 1) : '');
  return `${AV_C_EN[p.c]} ${AV_G_EN[p.g]}` + (p.f ? ` · ${AV_F_EN[p.f]}` : '') + (p.lap ? ' #' + (p.lap + 1) : '');
}
