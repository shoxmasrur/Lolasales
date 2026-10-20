import { buildUserPrompt, tarixQatori } from '@/infrastructure/ai/prompt/userPrompt';
import type { AgentSalesContext, AgentTurnInput } from '@/domain/services/IAgentEngine';

/**
 * Qo'lda ishga tushiriladi: npm run test:operator-vazifasi --workspace=server
 *
 * Operator suhbatni qo'lda boshlaydi: nima haqida gaplashishni yozadi,
 * xabarni agent o'zi tuzadi. Masalan mijoz kursga qiziqib jim qolgan —
 * operator salomni qo'lda yozdi, agent esa davom ettirishi kerak.
 *
 * Uchta xavf qo'riqlanadi:
 *   1) topshiriq promptga tushmasa, agent nima haqida yozishni bilmaydi;
 *   2) qayd "chiquvchi xabar" deb sanalsa, agent bugun salomlashdim deb
 *      o'ylaydi va mijozga salomsiz yozadi;
 *   3) topshiriq qoidalardan ustun qo'yilsa, operatorning shoshilinch
 *      so'zlari ("bugunoq to'lasin") mijozga so'zma-so'z ketadi.
 */
const NOW = new Date('2026-09-15T05:00:00Z'); // Toshkentda 15-sentyabr, 10:00
const KECHA = new Date('2026-09-14T06:00:00Z');
const BUGUN_ERTALAB = new Date('2026-09-15T04:30:00Z');

const TOPSHIRIQ = 'Kursga qiziqqan edi, bo\'lib to\'lash borligini ayt';

const context: AgentSalesContext = {
  clientName: 'Djumanazarova Aygerim',
  clientFirstName: 'Aygerim',
  source: 'reklama',
  sourceGroup: null,
  sourceComment: null,
  purchase: { stage: 'qiziqdi', courseId: null, totalAmount: null, paidAmount: 0, installment: false },
  coursesOnSale: [],
  nextCourse: null,
  boughtCourses: [],
};

const prompt = (over: Partial<AgentTurnInput> = {}): string => {
  const input: AgentTurnInput = {
    conversationId: 'c1',
    clientId: 'k1',
    knowledge: { rules: '', lessons: '', clientMemory: '', personaName: 'Lola' },
    context,
    history: [
      { role: 'agent', text: 'Курс ҳақида яна саволларингиз борми?', at: KECHA },
      { role: 'operator', text: TOPSHIRIQ, at: BUGUN_ERTALAB },
    ],
    incoming: null,
    sessionId: null,
    receiptPending: false,
    operatorInstruction: TOPSHIRIQ,
    ...over,
  };
  return buildUserPrompt(input, 'operator', NOW);
};

let failed = 0;
const check = (name: string, ok: boolean, matn?: string): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}`);
  if (!ok && matn) console.log(`    prompt:\n${matn}`);
};

// ─── 1. Vazifa matni ─────────────────────────────────────────────────────
const asosiy = prompt();
check('operator vazifasi bo\'limi chiqadi', asosiy.includes('## VAZIFA — OPERATOR TOPSHIRIG\'I'), asosiy);
check('topshiriq matni promptda', asosiy.includes(TOPSHIRIQ), asosiy);
check('qoidalar topshiriqdan ustun', asosiy.includes('topshiriqdan USTUN'), asosiy);
check('"operator aytdi" deyish taqiqlanadi', asosiy.includes('"operator aytdi"'), asosiy);
check('suhbatni agent o\'zi boshlaydi', asosiy.includes('bu xabarni siz boshlayapsiz'), asosiy);
check('kurs konteksti saqlanadi', asosiy.includes('## SOTUVDAGI KURSLAR'), asosiy);

// ─── 2. Tarixda qayd ─────────────────────────────────────────────────────
check(
  'tarixda qayd operator ko\'rsatmasi bo\'lib chiqadi',
  tarixQatori({ role: 'operator', text: TOPSHIRIQ, at: BUGUN_ERTALAB })
    === `OPERATOR KO'RSATMASI (mijoz ko'rmaydi): ${TOPSHIRIQ}`,
);
check('tarix transkriptida qayd bor', asosiy.includes(`OPERATOR KO'RSATMASI (mijoz ko'rmaydi): ${TOPSHIRIQ}`), asosiy);

// ─── 3. Salomlashuv: qayd chiquvchi xabar emas ──────────────────────────
// Bugun faqat qayd yozilgan, oxirgi haqiqiy xabarimiz kecha — yangi kun.
check('bugun faqat qayd bor — agent salomlashadi', asosiy.includes('YANGI KUN BOSHLANDI'), asosiy);

// Operator bugun o'zi salom yozgan (u `agent` roli bilan keladi) — qayta salom yo'q.
const operatorSalomBergan = prompt({
  history: [
    { role: 'agent', text: 'Ассалому алейкум', at: BUGUN_ERTALAB },
    { role: 'operator', text: TOPSHIRIQ, at: new Date('2026-09-15T04:40:00Z') },
  ],
});
check(
  'operator bugun qo\'lda salom yozgan — qayta salomlashmaydi',
  operatorSalomBergan.includes('QAYTA SALOMLASHMA'),
  operatorSalomBergan,
);

// ─── 4. Javob rejimida ham qayd ko'rinadi ────────────────────────────────
const javob = buildUserPrompt(
  {
    conversationId: 'c1',
    clientId: 'k1',
    knowledge: { rules: '', lessons: '', clientMemory: '', personaName: 'Lola' },
    context,
    history: [
      { role: 'operator', text: TOPSHIRIQ, at: BUGUN_ERTALAB },
      { role: 'agent', text: 'Ассалому алайкум, Айгерим опа!', at: new Date('2026-09-15T04:31:00Z') },
      { role: 'client', text: 'Ваалейкум', at: new Date('2026-09-15T04:50:00Z') },
    ],
    incoming: 'Ваалейкум',
    sessionId: null,
    receiptPending: false,
  },
  'reply',
  NOW,
);
check('javob rejimida ham operator maqsadi tarixda turadi', javob.includes('OPERATOR KO\'RSATMASI'), javob);

console.log(failed ? `\n${failed} ta tekshiruv yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
