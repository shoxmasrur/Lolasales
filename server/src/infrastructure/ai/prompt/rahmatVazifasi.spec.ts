import { buildUserPrompt } from '@/infrastructure/ai/prompt/userPrompt';
import type { AgentContractFacts, AgentDebtContext, AgentTurnInput } from '@/domain/services/IAgentEngine';
import { formatSom } from '@/shared/money';

/**
 * Qo'lda ishga tushiriladi: npm run test:rahmat-vazifasi --workspace=server
 *
 * Qisman to'lov uchun rahmat aytishning eng xavfli xatosi — kelishilgan
 * sana HALI KELMAGAN bo'lsa ham "qolganini qachon yopasiz?" deb so'rash.
 * Produksiyada shunday chiqdi: mijoz 5-sentabrga 5 000 000 so'm va'da
 * bergan, 678 000 so'm avans tashlagan, agent esa "4 322 000 so'm qoldi,
 * shu qismni qachon yopasiz?" deb yozgan — mijoz bu savolga allaqachon
 * javob bergan, sana hali o'tmagan.
 *
 * 2026-09-16 dan beri mijozga aytiladigan qoldiq VA'DADAN emas, CRM'dan
 * olinadi (`crmSummaManbai.spec.ts`), shuning uchun bu yerdagi kutilma
 * ham kontekstdagi kechikkan to'lovga qaraydi. Sana mantig'i esa
 * o'zgarmadi — u va'daning O'Z sanasidan chiqadi.
 */
const TZ_NOW = new Date('2026-08-18T09:00:00Z'); // Toshkentda 18-avgust

const SHARTNOMA: AgentContractFacts = {
  contractNo: '5582MSO25F3',
  objectName: 'MUHABBAT SHAHRI',
  apartment: null,
  monthlyPayment: 5_000_000,
  debtFirst: 0,
  debtMonthly: 12_000_000, debtMeter: 0, statusLabel: null,
  daysOverdue: 40,
  missedMonths: 2,
  unpaidMonths: [],
  recentPayments: [],
  nextPaymentDate: '2026-08-25',
  contractDate: '2025-11-14',
  completionDate: null,
  paidTotal: 100_000_000,
  warningCount: 0,
};

const context: AgentDebtContext = {
  clientName: 'Ansoriddinov Abdulbosit Jaloliddin o\'g\'li',
  clientFirstName: 'Abdulbosit',
  contracts: [SHARTNOMA],
  debtFirst: 0,
  debtMonthly: 12_000_000,
  debtSum: 12_000_000,
  daysOverdue: 40,
};

const rahmat = (over: {
  promisedDate: string | null;
  remaining: number;
  totalPaid: number;
  promisedAmount: number | null;
  debtCleared?: boolean;
}): string => {
  const input: AgentTurnInput = {
    conversationId: 'c1',
    clientId: 'k1',
    contractId: 's1',
    stage: 'soft',
    conversationState: 'promised',
    knowledge: { rules: '', lessons: '', clientMemory: '', personaName: 'Nodira' },
    context,
    history: [{ role: 'agent', text: 'Kelishdik, rahmat.', at: new Date('2026-08-17T10:00:00Z') }],
    incoming: null,
    sessionId: null,
    brokenPromise: null,
    bayram: null,
    openPromise: over.promisedDate
      ? { amount: over.promisedAmount ?? 0, date: over.promisedDate, paid: over.totalPaid }
      : null,
    receiptPending: false,
    paymentReceived: {
      newMoney: over.totalPaid,
      totalPaid: over.totalPaid,
      promisedAmount: over.promisedAmount,
      remaining: over.remaining,
      debtCleared: over.debtCleared ?? false,
    },
    nudgeAttempt: null,
    nudgeLast: null,
  };
  return buildUserPrompt(input, 'thanks', TZ_NOW);
};

/** Vazifa matni — kontekst blokidagi raqamlar bu yerga kirmaydi. */
const vazifa = (prompt: string): string => prompt.split('## VAZIFA')[1] ?? prompt;

let failed = 0;
const check = (name: string, ok: boolean, matn?: string): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}`);
  if (!ok && matn) console.log(`    prompt:\n${matn.split('## VAZIFA')[1] ?? matn}`);
};

// ─── Sana hali kelmagan: yangi sana SO'RALMAYDI ──────────────────────────
const erta = rahmat({
  promisedDate: '2026-09-05',
  promisedAmount: 5_000_000,
  totalPaid: 678_000,
  remaining: 4_322_000,
});

check(
  'qoldiq CRM raqamidan aniq ko\'rsatiladi',
  vazifa(erta).includes(formatSom(12_000_000)),
  erta,
);
check(
  'va\'dadan hisoblangan qoldiq promptga tushmaydi',
  !erta.includes(formatSom(4_322_000)),
  erta,
);
check(
  'sana kelmagan — yangi sana so\'rash TAQIQLANADI',
  erta.includes('YANGI SANA SO\'RAMA'),
  erta,
);
check(
  'sana kelmagan — "sana so\'ra" ko\'rsatmasi berilmaydi',
  !erta.includes('Qolgani uchun sana so\'ra'),
  erta,
);
check(
  'sana kelmagan — kelishilgan sana promptda eslatiladi',
  erta.includes('5-sentabr'),
  erta,
);

// ─── Kelishilgan kunning O'ZIDA to'lagan: hali muddat ichida ─────────────
const bugun = rahmat({
  promisedDate: '2026-08-18',
  promisedAmount: 5_000_000,
  totalPaid: 678_000,
  remaining: 4_322_000,
});
check(
  'kelishilgan kunning o\'zida — hali yangi sana so\'ralmaydi',
  bugun.includes('YANGI SANA SO\'RAMA') && !bugun.includes('Qolgani uchun sana so\'ra'),
  bugun,
);

// ─── Sana o'tib ketgan: endi yangi sana SO'RALADI ────────────────────────
const kech = rahmat({
  promisedDate: '2026-08-10',
  promisedAmount: 5_000_000,
  totalPaid: 678_000,
  remaining: 4_322_000,
});
check(
  'sana o\'tgan — qolgani uchun sana so\'raladi',
  kech.includes('Qolgani uchun sana so\'ra') && !kech.includes('YANGI SANA SO\'RAMA'),
  kech,
);

// ─── To'liq to'lagan: qoldiq haqida savol umuman yo'q ────────────────────
const toliq = rahmat({
  promisedDate: '2026-09-05',
  promisedAmount: 5_000_000,
  totalPaid: 5_000_000,
  remaining: 0,
});
check(
  'to\'liq to\'lovda sana so\'ralmaydi',
  !toliq.includes('Qolgani uchun sana so\'ra') && toliq.includes('TO\'LIQ bajarildi'),
  toliq,
);

// ─── Va'dasiz to'lov (kvitansiya tasdiqlangan) — o'zgarmaydi ─────────────
const vadasiz = rahmat({
  promisedDate: null,
  promisedAmount: null,
  totalPaid: 678_000,
  remaining: 0,
});
check(
  'va\'dasiz to\'lovda yangi sana so\'ralmaydi',
  vadasiz.includes('Yangi sana ham SO\'RAMA'),
  vadasiz,
);

console.log(failed ? `\n${failed} ta test yiqildi` : '\nHammasi o\'tdi');
process.exitCode = failed ? 1 : 0;
