import { buildUserPrompt } from '@/infrastructure/ai/prompt/userPrompt';
import type { AgentContractFacts, AgentDebtContext, AgentTurnInput } from '@/domain/services/IAgentEngine';
import { formatSom } from '@/shared/money';

/**
 * Qo'lda ishga tushiriladi: npm run test:crm-summa-manbai --workspace=server
 *
 * Mijozga aytiladigan kechikkan to'lov summasi FAQAT CRM'dan olinadi.
 *
 * Nega: 2026-09-10 da Boyirov Boyxonga (7317MSO26NF) agent 4 311 000 so'm
 * dedi, CRM'da esa 4 811 000 turgan edi — bitta 500 000 lik to'lov ikki
 * xil va'daga qo'shilib sanalgan. Rahmat va eslatma vazifalari qoldiqni
 * va'da arifmetikasidan ("kelishuv X edi, hozircha Y keldi") chiqarardi,
 * ustiga "Summalarni AYNAN shu yerda berilgandek ayt" deb turib olardi —
 * ya'ni xato raqam mijozga kafolatlangan holda ketardi.
 */
const NOW = new Date('2026-09-10T05:00:00Z'); // Toshkentda 10-sentabr, ertalab

const BOYIROV: AgentContractFacts = {
  contractNo: '7317MSO26NF',
  objectName: 'MUHABBAT SHAHRI',
  apartment: null,
  monthlyPayment: 2_775_000,
  debtFirst: 0,
  debtMonthly: 4_811_000, debtMeter: 0, statusLabel: null,
  daysOverdue: 29,
  missedMonths: 2,
  unpaidMonths: [],
  recentPayments: [{ dateIso: '2026-09-08', amount: 275_000 }],
  nextPaymentDate: '2026-09-25',
  contractDate: '2026-02-17',
  completionDate: null,
  paidTotal: 30_000_000,
  warningCount: 1,
};

const IKKINCHI: AgentContractFacts = {
  ...BOYIROV,
  contractNo: '7318MSO26NF',
  debtMonthly: 2_000_000,
  recentPayments: [],
};

const boyirov: AgentDebtContext = {
  clientName: 'Boyirov Boyxon',
  clientFirstName: 'Boyxon',
  contracts: [BOYIROV],
  debtFirst: 0,
  debtMonthly: 4_811_000,
  debtSum: 4_811_000,
  daysOverdue: 29,
};

/** Ikkita "Сотилди" shartnoma: jami raqam mijozga AYTILMAYDI. */
const koplab: AgentDebtContext = {
  ...boyirov,
  contracts: [BOYIROV, IKKINCHI],
  debtMonthly: 6_811_000,
  debtSum: 6_811_000,
};

/** CRM'da kechikish qolmagan, va'da esa hali yopilmagan. */
const yopilgan: AgentDebtContext = {
  ...boyirov,
  contracts: [{ ...BOYIROV, debtFirst: 0, debtMonthly: 0, daysOverdue: 0 }],
  debtMonthly: 0,
  debtSum: 0,
  daysOverdue: 0,
};

const asos = (context: AgentDebtContext): Omit<AgentTurnInput, 'openPromise' | 'paymentReceived'> => ({
  conversationId: 'c1',
  clientId: 'k1',
  contractId: 's1',
  stage: 'hard',
  conversationState: 'promised',
  knowledge: { rules: '', lessons: '', clientMemory: '', personaName: 'Nodira' },
  context,
  history: [{ role: 'agent', text: 'Kelishdik, rahmat.', at: new Date('2026-09-03T10:00:00Z') }],
  incoming: null,
  sessionId: null,
  brokenPromise: null,
  bayram: null,
  receiptPending: false,
  nudgeAttempt: null,
  nudgeLast: null,
});

const rahmat = (over: {
  context?: AgentDebtContext;
  promise?: { amount: number; date: string; paid: number } | null;
  newMoney: number;
  totalPaid: number;
  promisedAmount: number | null;
  remaining: number | null;
  debtCleared?: boolean;
}): string =>
  buildUserPrompt(
    {
      ...asos(over.context ?? boyirov),
      openPromise: over.promise ?? null,
      paymentReceived: {
        newMoney: over.newMoney,
        totalPaid: over.totalPaid,
        promisedAmount: over.promisedAmount,
        remaining: over.remaining,
        debtCleared: over.debtCleared ?? false,
      },
    },
    'thanks',
    NOW,
  );

const eslatma = (
  due: { amount: number; date: string; paid: number },
  context: AgentDebtContext = boyirov,
): string =>
  buildUserPrompt(
    { ...asos(context), openPromise: due, paymentReceived: null },
    'reminder',
    NOW,
  );

/** Vazifa matni — kontekst blokidagi raqamlar bu yerga kirmaydi. */
const vazifa = (prompt: string): string => prompt.split('## VAZIFA')[1] ?? prompt;

let failed = 0;
const check = (name: string, ok: boolean, matn?: string): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}`);
  if (!ok && matn) console.log(`    prompt:\n${vazifa(matn)}`);
};

// ─── BOYIROV HOLATI (rahmat) ─────────────────────────────────────────────
// Va'da 4 586 000, unga 275 000 kelgan → va'da arifmetikasi 4 311 000.
// CRM esa 4 811 000 ko'rsatadi. Mijozga CRM raqami ketishi shart.
const boyirovRahmat = rahmat({
  promise: { amount: 4_586_000, date: '2026-09-08', paid: 275_000 },
  newMoney: 275_000,
  totalPaid: 275_000,
  promisedAmount: 4_586_000,
  remaining: 4_311_000,
});

check(
  'rahmat: CRM summasi promptda bor',
  boyirovRahmat.includes(formatSom(4_811_000)),
  boyirovRahmat,
);
check(
  'rahmat: va\'dadan hisoblangan qoldiq promptda YO\'Q',
  !boyirovRahmat.includes(formatSom(4_311_000)),
  boyirovRahmat,
);
check(
  'rahmat: "hozircha ... keldi" arifmetikasi olib tashlangan',
  !boyirovRahmat.includes('hozircha'),
  boyirovRahmat,
);
check(
  'rahmat: kelgan to\'lov summasi aytiladi',
  boyirovRahmat.includes(formatSom(275_000)),
  boyirovRahmat,
);
check(
  'rahmat: mijoz aytgan kelishuv summasi saqlanadi',
  boyirovRahmat.includes(formatSom(4_586_000)),
  boyirovRahmat,
);
check(
  'rahmat: "AYNAN berilgandek ayt" qoidasi joyida',
  boyirovRahmat.includes('Summalarni AYNAN'),
  boyirovRahmat,
);
check(
  'rahmat: sana o\'tgan — qolgani uchun sana so\'raladi',
  boyirovRahmat.includes('Qolgani uchun sana so\'ra'),
  boyirovRahmat,
);

// ─── BOYIROV HOLATI (eslatma) ────────────────────────────────────────────
const boyirovEslatma = eslatma({ amount: 4_586_000, date: '2026-09-10', paid: 275_000 });

check(
  'eslatma: CRM summasi promptda bor',
  boyirovEslatma.includes(formatSom(4_811_000)),
  boyirovEslatma,
);
check(
  'eslatma: va\'dadan hisoblangan qoldiq promptda YO\'Q',
  !boyirovEslatma.includes(formatSom(4_311_000)),
  boyirovEslatma,
);
check(
  'eslatma: kelishuvning to\'liq summasi qayta aytilmaydi',
  !vazifa(boyirovEslatma).includes(formatSom(4_586_000)),
  boyirovEslatma,
);
check(
  'eslatma: kelgan qism tan olinadi',
  boyirovEslatma.includes('ALLAQACHON'),
  boyirovEslatma,
);

// ─── BIR NECHTA SHARTNOMA: jami raqam kiritilmaydi ──────────────────────
const koplabRahmat = rahmat({
  context: koplab,
  promise: { amount: 4_586_000, date: '2026-09-08', paid: 275_000 },
  newMoney: 275_000,
  totalPaid: 275_000,
  promisedAmount: 4_586_000,
  remaining: 4_311_000,
});

check(
  'ko\'plab: vazifa matnida jami summa yo\'q',
  !vazifa(koplabRahmat).includes(formatSom(6_811_000)),
  koplabRahmat,
);
check(
  'ko\'plab: vazifa matnida bitta shartnomaning summasi ham yo\'q',
  !vazifa(koplabRahmat).includes(formatSom(4_811_000)),
  koplabRahmat,
);
check(
  'ko\'plab: jami raqam aytish TAQIQLANADI',
  koplabRahmat.includes('JAMI raqam AYTMA'),
  koplabRahmat,
);
check(
  'ko\'plab: qoldiq shartnoma bo\'limlaridan olinadi',
  koplabRahmat.includes('MIJOZ MA\'LUMOTI'),
  koplabRahmat,
);

const koplabEslatma = eslatma({ amount: 4_586_000, date: '2026-09-10', paid: 275_000 }, koplab);
check(
  'ko\'plab eslatma: vazifa matnida jami summa yo\'q',
  !vazifa(koplabEslatma).includes(formatSom(6_811_000)),
  koplabEslatma,
);
check(
  'ko\'plab eslatma: jami raqam aytish TAQIQLANADI',
  koplabEslatma.includes('JAMI raqam AYTMA'),
  koplabEslatma,
);

// ─── CRM'da kechikish qolmagan, va'da esa yopilmagan ────────────────────
const crmYopilgan = rahmat({
  context: yopilgan,
  promise: { amount: 4_586_000, date: '2026-09-08', paid: 275_000 },
  newMoney: 275_000,
  totalPaid: 275_000,
  promisedAmount: 4_586_000,
  remaining: 4_311_000,
});

check(
  'CRM toza: qoldiq raqami aytilmaydi',
  crmYopilgan.includes('QOLMAGAN') && !crmYopilgan.includes(formatSom(4_311_000)),
  crmYopilgan,
);
check(
  'CRM toza: yangi sana so\'ralmaydi',
  crmYopilgan.includes('yangi sana SO\'RAMA') && !crmYopilgan.includes('Qolgani uchun sana so\'ra'),
  crmYopilgan,
);

// ─── Mavjud qoidalar buzilmadi ──────────────────────────────────────────
// Sana hali o'tmagan qisman to'lov: ohang minnatdor, yangi sana so'ralmaydi.
const muddatIchida = rahmat({
  promise: { amount: 4_586_000, date: '2026-09-20', paid: 275_000 },
  newMoney: 275_000,
  totalPaid: 275_000,
  promisedAmount: 4_586_000,
  remaining: 4_311_000,
});
check(
  'sana kelmagan — yangi sana so\'ralmaydi, ohang minnatdor',
  muddatIchida.includes('YANGI SANA SO\'RAMA') && muddatIchida.includes('Ohang minnatdor'),
  muddatIchida,
);
check(
  'sana kelmaganda ham qoldiq CRM\'dan',
  muddatIchida.includes(formatSom(4_811_000)) && !muddatIchida.includes(formatSom(4_311_000)),
  muddatIchida,
);

// Kechikish yopilgan shoxlar o'z holicha: `debtCleared` qarori kodniki.
const vadasiz = rahmat({
  promise: null,
  newMoney: 275_000,
  totalPaid: 275_000,
  promisedAmount: null,
  remaining: null,
  debtCleared: true,
});
check(
  'va\'dasiz to\'lov: "kechikkan to\'lovi YO\'Q" shoxi saqlanadi',
  vadasiz.includes('kechikkan to\'lovi YO\'Q'),
  vadasiz,
);

const toliq = rahmat({
  promise: { amount: 4_586_000, date: '2026-09-08', paid: 4_586_000 },
  newMoney: 4_586_000,
  totalPaid: 4_586_000,
  promisedAmount: 4_586_000,
  remaining: 0,
  debtCleared: true,
});
check(
  'to\'liq bajarilgan kelishuv shoxi saqlanadi',
  toliq.includes('TO\'LIQ bajarildi') && toliq.includes('kechikkan to\'lovi YO\'Q'),
  toliq,
);

console.log(failed ? `\n${failed} ta test yiqildi` : '\nHammasi o\'tdi');
process.exitCode = failed ? 1 : 0;
