import { buildUserPrompt } from '@/infrastructure/ai/prompt/userPrompt';
import type { AgentContractFacts, AgentDebtContext, AgentTurnInput } from '@/domain/services/IAgentEngine';

/**
 * Qo'lda ishga tushiriladi: npm run test:sukut-vazifasi --workspace=server
 *
 * Qayta murojaat ikki xil bo'ladi va ularni ARALASHTIRIB YUBORISH eng
 * qimmat xato: va'da bergan mijozga "xabarimni ko'rdingizmi?" deb yozish
 * uning bergan so'zini ko'rmaganimizni bildiradi, aksincha holatda esa
 * mavjud bo'lmagan va'da yuziga solinadi.
 */
const SHARTNOMA: AgentContractFacts = {
  contractNo: '5582MSO25F3',
  objectName: 'MUHABBAT SHAHRI',
  apartment: null,
  monthlyPayment: 5_000_000,
  debtFirst: 0,
  debtMonthly: 12_000_000, debtMeter: 0, statusLabel: null,
  daysOverdue: 22,
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
  daysOverdue: 22,
};

const NOW = new Date('2026-09-08T05:00:00Z');

const matn = (over: Partial<AgentTurnInput>): string => {
  const input: AgentTurnInput = {
    conversationId: 'c1',
    clientId: 'k1',
    contractId: 's1',
    stage: 'soft',
    conversationState: 'contacted',
    knowledge: { rules: '', lessons: '', clientMemory: '', personaName: 'Madina' },
    context,
    history: [{
      role: 'agent',
      text: 'Assalomu alaykum, to\'lovingiz kechikkan ekan.',
      at: new Date('2026-09-06T10:00:00Z'),
    }],
    incoming: null,
    sessionId: null,
    brokenPromise: null,
    bayram: null,
    openPromise: null,
    receiptPending: false,
    paymentReceived: null,
    nudgeAttempt: 1,
    nudgeLast: false,
    ...over,
  };
  return buildUserPrompt(input, 'nudge', NOW);
};

interface Tekshiruv {
  nom: string;
  matn: string;
  bor: string[];
  yoq: string[];
}

const TEKSHIRUVLAR: Tekshiruv[] = [
  {
    nom: 'va\'da yo\'q — "o\'qib javob bermadi" bandiga yo\'naltiradi',
    matn: matn({}),
    bor: ['SUKUTDAN KEYIN QAYTA MUROJAAT', 'XABARNI O\'QIB JAVOB BERMADI', '1-urinish'],
    yoq: ['VA\'DA BERIB TO\'LAMADI'],
  },
  {
    nom: 'buzilgan va\'da bor — "va\'da berib to\'lamadi" bandiga yo\'naltiradi',
    matn: matn({ brokenPromise: { amount: 5_000_000, date: '2026-09-01' } }),
    bor: ['BUZILGAN VA\'DA', 'VA\'DA BERIB TO\'LAMADI'],
    yoq: ['XABARNI O\'QIB JAVOB BERMADI'],
  },
  {
    nom: 'ikkinchi urinish, chegara 2 — bu oxirgisi ekani aytiladi',
    matn: matn({ nudgeAttempt: 2, nudgeLast: true }),
    bor: ['2-urinish', 'OXIRGI'],
    yoq: [],
  },
  // Chegara (`silenceNudgeMax`) 1 dan 3 gacha sozlanadi, ya'ni "2-urinish
  // = oxirgisi" degan qoida faqat standart sozlamada to'g'ri. Chegara 3
  // bo'lganda 2-urinishda "bundan keyin yozmayman" deyish — bo'sh po'pisa:
  // agent ertasiga yana yozadi va mijoz uchun bizning har bir gapimiz
  // qadrsizlanadi. Shuning uchun quyidagi ikki holat birga tekshiriladi.
  {
    nom: 'chegara 3, 2-urinish — hali oxirgisi EMAS',
    matn: matn({ nudgeAttempt: 2, nudgeLast: false }),
    bor: ['2-urinish'],
    yoq: ['OXIRGI'],
  },
  {
    nom: 'chegara 3, 3-urinish — oxirgisi ekani aytiladi',
    matn: matn({ nudgeAttempt: 3, nudgeLast: true }),
    bor: ['3-urinish', 'OXIRGI'],
    yoq: [],
  },
];

let failed = 0;
for (const t of TEKSHIRUVLAR) {
  const yetishmayotgan = t.bor.filter((s) => !t.matn.includes(s));
  const ortiqcha = t.yoq.filter((s) => t.matn.includes(s));
  if (!yetishmayotgan.length && !ortiqcha.length) {
    console.log(`✓ ${t.nom}`);
  } else {
    failed += 1;
    console.log(`✗ ${t.nom}`);
    for (const s of yetishmayotgan) console.log(`    yo'q: ${s}`);
    for (const s of ortiqcha) console.log(`    ortiqcha: ${s}`);
  }
}

console.log(failed ? `\n${failed} ta tekshiruv yiqildi` : '\nHammasi o\'tdi');
process.exitCode = failed ? 1 : 0;
