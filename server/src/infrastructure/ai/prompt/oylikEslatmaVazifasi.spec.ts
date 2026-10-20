import { buildUserPrompt } from '@/infrastructure/ai/prompt/userPrompt';
import type { AgentContractFacts, AgentDebtContext, AgentTurnInput } from '@/domain/services/IAgentEngine';
import type { OylikEslatmaMalumoti } from '@/domain/services/oylikEslatma';
import { formatSom } from '@/shared/money';

/**
 * Qo'lda ishga tushiriladi: npm run test:oylik-eslatma-vazifasi --workspace=server
 *
 * B va C guruhlari boshqa-boshqa xabar: faqat shu oy qolgan mijozga
 * "kechikdi" deyish — bo'sh ayblov, C ga jami aytilmasa — to'liq rasm yo'q.
 */
let failed = 0;
const check = (name: string, ok: boolean, izoh = ''): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok || !izoh ? '' : ` — ${izoh}`}`);
};

const SHARTNOMA: AgentContractFacts = {
  contractNo: '5582MSO25F3',
  objectName: 'MUHABBAT SHAHRI',
  apartment: null,
  monthlyPayment: 3_000_000,
  debtFirst: 0,
  debtMonthly: 0, debtMeter: 0, statusLabel: null,
  daysOverdue: 0,
  missedMonths: 0,
  unpaidMonths: [],
  recentPayments: [],
  nextPaymentDate: '2026-09-25',
  contractDate: '2025-11-14',
  completionDate: null,
  paidTotal: 100_000_000,
  warningCount: 0,
};

const context: AgentDebtContext = {
  clientName: 'Ansoriddinov Abdulbosit',
  clientFirstName: 'Abdulbosit',
  contracts: [SHARTNOMA],
  debtFirst: 0,
  debtMonthly: 0,
  debtSum: 0,
  daysOverdue: 0,
};

const NOW = new Date('2026-09-23T05:00:00Z');

const matn = (m: OylikEslatmaMalumoti | null): string => {
  const input: AgentTurnInput = {
    conversationId: 'c1',
    clientId: 'k1',
    contractId: 's1',
    stage: 'soft',
    conversationState: 'contacted',
    knowledge: { rules: '', lessons: '', clientMemory: '', personaName: 'Madina' },
    context,
    history: [{ role: 'agent', text: 'Assalomu alaykum.', at: new Date('2026-08-20T10:00:00Z') }],
    incoming: null,
    sessionId: null,
    brokenPromise: null,
    bayram: null,
    openPromise: null,
    receiptPending: false,
    paymentReceived: null,
    nudgeAttempt: null,
    nudgeLast: null,
    oylikEslatma: m,
  };
  return buildUserPrompt(input, 'oylik_eslatma', NOW);
};

const B: OylikEslatmaMalumoti = {
  guruh: 'B',
  tolovlar: [{ contractNo: '5582MSO25F3', datePayment: '2026-09-25', qoldiq: 3_000_000 }],
  kechikkanlar: [],
  sanaOtgan: false,
  jami: 3_000_000,
  bittaShartnoma: true,
};

const C: OylikEslatmaMalumoti = {
  guruh: 'C',
  tolovlar: [{ contractNo: '5582MSO25F3', datePayment: '2026-09-21', qoldiq: 3_000_000 }],
  kechikkanlar: [{ contractNo: '5582MSO25F3', datePayment: '2026-08-21', qoldiq: 2_000_000 }],
  sanaOtgan: true,
  jami: 5_000_000,
  bittaShartnoma: true,
};

const b = matn(B);
check('vazifa sarlavhasi bor', b.includes('OYLIK TO\'LOV ESLATMASI'));
check('B: sana yaqinlashyapti', b.includes('YAQINLASHYAPTI'));
check('B: kechikish haqida gapirma', b.includes('kechikish haqida GAPIRMA'));
check('B: jami yo\'q', !b.includes('JAMI'));
check('"qarz" taqiqi bor', b.includes('"qarz"'));
check('bitta shartnoma — raqam aytilmaydi', b.includes('shartnoma raqamini AYTMA'));

const bOtgan = matn({ ...B, sanaOtgan: true });
check('B, sana o\'tgan: "O\'TDI" varianti', bOtgan.includes('O\'TDI') && !bOtgan.includes('YAQINLASHYAPTI'));

const c = matn(C);
check('C: oldingi to\'lovlar bo\'limi (boshlang\'ich ham)', c.includes('Oldingi to\'lovlardan qolgan:'));
check('C: jami summa aniq', c.includes('JAMI') && c.includes(formatSom(5_000_000)));
check('C: yumshoq B iborasi yo\'q', !c.includes('kechikish haqida GAPIRMA'));

const bosh = matn(null);
check('ma\'lumot yo\'q — reply null', bosh.includes('`reply` ni null'));

console.log(failed ? `\n${failed} ta test yiqildi` : '\nHammasi o\'tdi');
process.exitCode = failed ? 1 : 0;
