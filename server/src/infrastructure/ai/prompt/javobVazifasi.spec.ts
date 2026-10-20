import { buildUserPrompt } from '@/infrastructure/ai/prompt/userPrompt';
import type { AgentDebtContext, AgentTurnInput } from '@/domain/services/IAgentEngine';
import { formatSom } from '@/shared/money';

/**
 * Qo'lda ishga tushiriladi: npm run test:javob-vazifasi --workspace=server
 *
 * Mijozning xabariga javob yozayotganda agent ochiq kelishuvni ko'rishi
 * shart. Ilgari u promptga umuman tushmasdi: model faqat suhbat
 * tarixidan bilardi, tarix esa 20 xabar bilan cheklangan. Uzun suhbatda
 * kelishuv undan chiqib ketardi va agent mijoz allaqachon javob bergan
 * savolni — "qachon to'laysiz?" — qaytadan berardi.
 */
const NOW = new Date('2026-08-18T09:00:00Z'); // Toshkentda 18-avgust

const context: AgentDebtContext = {
  clientName: 'Ansoriddinov Abdulbosit Jaloliddin o\'g\'li',
  clientFirstName: 'Abdulbosit',
  contracts: [],
  debtFirst: 0,
  debtMonthly: 12_000_000,
  debtSum: 12_000_000,
  daysOverdue: 40,
};

const javob = (over: Partial<AgentTurnInput> = {}): string => {
  const input: AgentTurnInput = {
    conversationId: 'c1',
    clientId: 'k1',
    contractId: 's1',
    stage: 'soft',
    conversationState: 'promised',
    knowledge: { rules: '', lessons: '', clientMemory: '', personaName: 'Nodira' },
    context,
    history: [{ role: 'client', text: 'Ассалому алайкум', at: new Date('2026-08-18T08:00:00Z') }],
    incoming: 'Ассалому алайкум, яхшимисиз?',
    sessionId: null,
    brokenPromise: null,
    bayram: null,
    openPromise: null,
    receiptPending: false,
    paymentReceived: null,
    nudgeAttempt: null,
    nudgeLast: null,
    ...over,
  };
  return buildUserPrompt(input, 'reply', NOW);
};

let failed = 0;
const check = (name: string, ok: boolean, matn?: string): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}`);
  if (!ok && matn) console.log(`    prompt:\n${matn}`);
};

// ─── Muddati kelmagan ochiq kelishuv ────────────────────────────────────
const kelajak = javob({
  openPromise: { amount: 5_000_000, date: '2026-09-05', paid: 0 },
});
check('ochiq kelishuv bo\'limi qo\'shiladi', kelajak.includes('## OCHIQ KELISHUV'), kelajak);
check('kelishilgan sana ko\'rsatiladi', kelajak.includes('5-sentabr'), kelajak);
check('kelishilgan summa ko\'rsatiladi', kelajak.includes(formatSom(5_000_000)), kelajak);
check(
  'sana kelmagan — qayta sana so\'rash taqiqlanadi',
  kelajak.includes('QAYTA SO\'RAMA'),
  kelajak,
);

// ─── Qisman to'langan ochiq kelishuv ────────────────────────────────────
const qisman = javob({
  openPromise: { amount: 5_000_000, date: '2026-09-05', paid: 678_000 },
});
check('kelgan qism tan olinadi', qisman.includes(formatSom(678_000)), qisman);
// Qoldiq CRM'dan: 12 000 000. Va'da arifmetikasi (5 000 000 - 678 000 =
// 4 322 000) promptga UMUMAN tushmasligi kerak — aynan shu hisob
// 2026-09-10 da mijozga xato raqam aytilishiga olib kelgan.
check('qoldiq CRM raqami bilan ko\'rsatiladi', qisman.includes(formatSom(12_000_000)), qisman);
check('va\'da arifmetikasi promptga tushmaydi', !qisman.includes(formatSom(4_322_000)), qisman);

// ─── Sanasi o'tgan, qisman to'langan kelishuv ───────────────────────────
const otgan = javob({
  openPromise: { amount: 5_000_000, date: '2026-08-10', paid: 678_000 },
});
check(
  'sana o\'tgan — endi yangi sana so\'raladi',
  !otgan.includes('QAYTA SO\'RAMA'),
  otgan,
);
check(
  'sana o\'tgan bo\'lsa ham qisman to\'laganni ayblamaydi',
  otgan.includes('AYBLAMA'),
  otgan,
);

// ─── Ochiq kelishuv yo'q — bo'lim ham yo'q ──────────────────────────────
const yoq = javob();
check('kelishuv yo\'q — ortiqcha bo\'lim chizilmaydi', !yoq.includes('## OCHIQ KELISHUV'), yoq);

// ─── Buzilgan va'da — ikkala bo'lim birga chiqmaydi ─────────────────────
const buzilgan = javob({
  brokenPromise: { amount: 5_000_000, date: '2026-08-05' },
});
check(
  'buzilgan va\'dada ochiq kelishuv bo\'limi yo\'q',
  buzilgan.includes('## BUZILGAN VA\'DA') && !buzilgan.includes('## OCHIQ KELISHUV'),
  buzilgan,
);

// ─── Kvitansiya tekshiruvi ochiq bo'lsa — pul talab qilinmaydi ──────────
const chek = javob({
  openPromise: { amount: 5_000_000, date: '2026-09-05', paid: 0 },
  receiptPending: true,
});
check(
  'chek tekshiruvi ochiq bo\'lsa qoida saqlanadi',
  chek.includes('MIJOZ TO\'LAGANINI AYTDI (chek yoki xabar)') && chek.includes('chek SO\'RAMA'),
  chek,
);

// ─── Bugun bayram — blok promptga qo'shiladi ────────────────────────────
// `bayramBloki` o'zi alohida sinaladi (`bayramBloki.spec.ts`), lekin hech
// bir shu faylning testi `bayram` maydonini to'ldirmaydi — ya'ni hech
// narsa `buildUserPrompt` uni haqiqatan promptga qo'shishini isbotlamaydi.
const bayramli = javob({
  bayram: { name: 'Mustaqillik bayrami', endsOn: '2026-09-02', keyingiIshKuni: '2026-09-03' },
});
check('bayram bo\'lsa blok qo\'shiladi', bayramli.includes('## BUGUN BAYRAM'), bayramli);

// ─── Bayram yo'q — blok chizilmaydi ─────────────────────────────────────
check('bayram yo\'q bo\'lsa blok chizilmaydi', !yoq.includes('## BUGUN BAYRAM'), yoq);

console.log(failed ? `\n${failed} ta test yiqildi` : '\nHammasi o\'tdi');
process.exitCode = failed ? 1 : 0;
