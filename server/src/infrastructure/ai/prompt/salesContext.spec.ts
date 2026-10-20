import type { Course, CourseKnowledge } from '@/domain/entities/Course';
import type { AgentSalesContext } from '@/domain/services/IAgentEngine';
import { buildContextBlock } from '@/infrastructure/ai/prompt/systemPrompt';

/**
 * Qo'lda: npm run test:sales-context --workspace=server
 *
 * Sotuv konteksti bloki: mijoz manbai (guruh kommenti), xarid bosqichi,
 * sotuvdagi kurslar va ularning bazasi. Karta raqami bu blokka hech
 * qachon tushmaydi — uni tizim alohida xabar qilib yuboradi.
 */
let failed = 0;
const check = (name: string, a: unknown, e: unknown): void => {
  const ok = JSON.stringify(a) === JSON.stringify(e);
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` → ${JSON.stringify(a)} (kutilgan: ${JSON.stringify(e)})`}`);
};

const NOV: Course = {
  id: 'kurs-nov', name: 'SMM noldan', description: 'Instagram uchun kontent', salesStart: '2026-11-01',
  salesEnd: '2026-11-20', price: 1_500_000, duration: '4 hafta, haftasiga 3 dars', topics: ['Kontent reja', 'Reels'],
  startsOn: '2026-11-25', groupLink: 'https://t.me/+yopiq', isActive: true,
  installmentAllowed: false, installmentParts: null, installmentFirstMin: null, linkAfter: 'birinchi_qism',
};
const DEK: Course = { ...NOV, id: 'kurs-dek', name: 'SMM pro', salesStart: '2026-12-01', salesEnd: '2026-12-20' };
const BAZA: CourseKnowledge[] = [
  { id: 'b1', courseId: NOV.id, kind: 'savol_javob', title: 'Darslar yozib olinadimi?', body: 'Ha, hammasi yozib olinadi.', sortOrder: 1, isEnabled: true },
  { id: 'b2', courseId: NOV.id, kind: 'etiroz', title: 'Qimmat', body: 'Bitta mijoz kursni qoplaydi.', sortOrder: 2, isEnabled: true },
];

const CTX_GURUH: AgentSalesContext = {
  clientName: 'Aliyeva Malika', clientFirstName: 'Malika', interlocutor: null,
  source: 'guruh', sourceGroup: 'SMM maktabi', sourceComment: 'menga xabar bering',
  purchase: { stage: 'qiziqdi', courseId: NOV.id, totalAmount: 1_500_000, paidAmount: 0, installment: false },
  coursesOnSale: [{ course: NOV, knowledge: BAZA }],
  nextCourse: null,
  boughtCourses: [],
};
const NOW = new Date('2026-11-05T09:00:00Z');
const TZ = 'Asia/Tashkent';

const blok = buildContextBlock(CTX_GURUH, NOW, TZ);
check('komment ko\'rinadi', blok.includes('«menga xabar bering»'), true);
check('kanal nomi', blok.includes('Kanal: SMM maktabi'), true);
check('narx formatlangan', blok.includes("1 500 000 so'm"), true);
check('karta raqami yo\'q', /\d{4} \d{4} \d{4} \d{4}/.test(blok), false);
check('kurs yo\'q bloki', buildContextBlock({ ...CTX_GURUH, coursesOnSale: [], nextCourse: DEK }, NOW, TZ).includes('Hozir sotuvda kurs yo\'q'), true);
check('bo\'lib to\'lash yo\'q yozilgan', blok.includes("bo'lib to'lash yo'q"), true);

// Qo'shimcha: bosqich, kurs id, baza va keyingi kurs.
check('bosqich yorlig\'i', blok.includes('Qiziqdi'), true);
check('kurs id', blok.includes('kurs-nov'), true);
check('baza turi bo\'yicha', blok.includes('Darslar yozib olinadimi?') && blok.includes('Qimmat'), true);
check('bugungi sana', blok.includes('2026-11-05'), true);
check('qolgan summa', blok.includes("Qolgan: 1 500 000 so'm"), true);
const keyingi = buildContextBlock({ ...CTX_GURUH, coursesOnSale: [], nextCourse: DEK }, NOW, TZ);
check('keyingi kurs nomi', keyingi.includes('SMM pro'), true);
check('keyingi kurs sanasi', keyingi.includes('1-dekabr'), true);
check('keyingi kurs ham yo\'q', buildContextBlock({ ...CTX_GURUH, coursesOnSale: [], nextCourse: null }, NOW, TZ).includes('tez orada xabar beramiz'), true);
const bt = buildContextBlock({
  ...CTX_GURUH,
  coursesOnSale: [{ course: { ...NOV, installmentAllowed: true, installmentParts: 3, installmentFirstMin: 500_000 }, knowledge: [] }],
}, NOW, TZ);
check('bo\'lib to\'lash shartlari', bt.includes("3 qismga") && bt.includes("500 000 so'm"), true);
const raqam = buildContextBlock({ ...CTX_GURUH, source: 'raqam', sourceGroup: null, sourceComment: null, purchase: null }, NOW, TZ);
check('raqam manbasida komment yo\'q', raqam.includes('Mijoz komment yozgan'), false);
check('xarid yo\'q — Yangi', raqam.includes('Yangi'), true);

console.log(failed ? `\n${failed} ta tekshiruv yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
