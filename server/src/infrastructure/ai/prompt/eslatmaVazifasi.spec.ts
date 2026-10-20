import { buildUserPrompt } from '@/infrastructure/ai/prompt/userPrompt';
import type { AgentContractFacts, AgentDebtContext, AgentTurnInput } from '@/domain/services/IAgentEngine';
import { formatSom } from '@/shared/money';

/**
 * Qo'lda ishga tushiriladi: npm run test:eslatma-vazifasi --workspace=server
 *
 * Va'da kunidagi eslatma qisman to'lagan mijozga ham ketadi (ilgari
 * umuman ketmasdi). Shunda summa QOLDIQ bo'lishi shart: mijoz 678 000
 * so'm tashlab qo'ygan bo'lsa-yu, eslatmada yana "5 000 000 so'm kuni"
 * deb yozilsa — u to'lagan pulini ko'rmaganimiz bo'lib chiqadi.
 *
 * 2026-09-16 dan beri o'sha qoldiq VA'DADAN emas, CRM'dan olinadi
 * (`crmSummaManbai.spec.ts` ga qara): va'da arifmetikasi bitta to'lovni
 * ikki marta sanab qo'yishi mumkin edi. Shuning uchun bu yerdagi
 * kutilmalar ham kontekstdagi CRM raqamiga qaraydi.
 */
const NOW = new Date('2026-09-05T05:00:00Z'); // Toshkentda 5-sentabr, ertalab

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
  nextPaymentDate: '2026-09-25',
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

const eslatma = (due: { amount: number; date: string; paid: number }): string => {
  const input: AgentTurnInput = {
    conversationId: 'c1',
    clientId: 'k1',
    contractId: 's1',
    stage: 'soft',
    conversationState: 'promised',
    knowledge: { rules: '', lessons: '', clientMemory: '', personaName: 'Nodira' },
    context,
    history: [{ role: 'agent', text: 'Kelishdik.', at: new Date('2026-08-18T10:00:00Z') }],
    incoming: null,
    sessionId: null,
    brokenPromise: null,
    bayram: null,
    openPromise: due,
    receiptPending: false,
    paymentReceived: null,
    nudgeAttempt: null,
    nudgeLast: null,
  };
  return buildUserPrompt(input, 'reminder', NOW);
};

/** Vazifa matni — kontekst blokidagi raqamlar bu yerga kirmaydi. */
const vazifa = (prompt: string): string => prompt.split('## VAZIFA')[1] ?? prompt;

let failed = 0;
const check = (name: string, ok: boolean, matn?: string): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}`);
  if (!ok && matn) console.log(`    prompt:\n${matn.split('## VAZIFA')[1] ?? matn}`);
};

// ─── Qisman to'langan va'da ──────────────────────────────────────────────
const qisman = eslatma({ amount: 5_000_000, date: '2026-09-05', paid: 678_000 });

check(
  'qoldiq CRM raqamidan olinadi',
  vazifa(qisman).includes(formatSom(12_000_000)),
  qisman,
);
check(
  'va\'dadan hisoblangan qoldiq ishlatilmaydi',
  !qisman.includes(formatSom(4_322_000)),
  qisman,
);
check(
  'to\'liq va\'da summasi eslatma summasi sifatida takrorlanmaydi',
  !vazifa(qisman).includes(formatSom(5_000_000)),
  qisman,
);
check(
  'allaqachon kelgan qism tan olinadi',
  qisman.includes('ALLAQACHON to\'lagan'),
  qisman,
);

// ─── Hech narsa to'lanmagan va'da — eski xulq o'zgarmaydi ────────────────
const toza = eslatma({ amount: 5_000_000, date: '2026-09-05', paid: 0 });
check(
  'to\'lanmagan va\'dada ham summa CRM\'dan',
  vazifa(toza).includes(formatSom(12_000_000)) && !vazifa(toza).includes(formatSom(5_000_000)),
  toza,
);
check(
  'to\'lanmagan va\'dada "allaqachon to\'lagan" jumlasi yo\'q',
  !toza.includes('ALLAQACHON'),
  toza,
);

console.log(failed ? `\n${failed} ta test yiqildi` : '\nHammasi o\'tdi');
process.exitCode = failed ? 1 : 0;
