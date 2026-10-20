import {
  buildUserPrompt,
  RECEIPT_PENDING_RULE,
  RECEIPT_REVIEW_ACK_RULE,
  RECEIPT_REVIEW_OPERATOR_RULE,
  RECEIPT_REVIEW_RULE,
} from '@/infrastructure/ai/prompt/userPrompt';
import type { AgentContractFacts, AgentDebtContext, AgentTurnInput } from '@/domain/services/IAgentEngine';
import { formatSom } from '@/shared/money';

/**
 * Qo'lda ishga tushiriladi: npm run test:chek-tasdiq-vazifasi --workspace=server
 *
 * Chekni operator tasdiqlaydi (2026-09-17). Agentga ketadigan matn uch
 * joyda o'zgardi va har birida qimmat xato bor:
 *   • chek kelganda — muddat va'da qilish ("bir kun ichida") va CRM
 *     ro'yxatidagi summani aytish;
 *   • chek allaqachon qabul qilingan — "Chekni oldim" ni takrorlash;
 *   • tugma bosilgach — summani aytish (operator summani tasdiqlamagan) va
 *     CRM'ga hali tushmagan to'lov bo'yicha eski qoldiqni aytish.
 */
const NOW = new Date('2026-09-17T06:00:00Z'); // Toshkentda 17-sentabr, 11:00

const SHARTNOMA: AgentContractFacts = {
  contractNo: '5A1E92B7',
  objectName: 'MUHABBAT SHAHRI',
  apartment: null,
  monthlyPayment: 2_775_000,
  debtFirst: 0,
  debtMonthly: 12_000_000, debtMeter: 0, statusLabel: null,
  daysOverdue: 40,
  missedMonths: 4,
  unpaidMonths: [],
  recentPayments: [{ dateIso: '2026-08-21', amount: 5_000_000 }],
  nextPaymentDate: '2026-09-25',
  contractDate: '2026-02-17',
  completionDate: null,
  paidTotal: 30_000_000,
  warningCount: 1,
};

const context: AgentDebtContext = {
  clientName: 'Komiljonov Doniyorbek',
  clientFirstName: 'Doniyorbek',
  contracts: [SHARTNOMA],
  debtFirst: 0,
  debtMonthly: 12_000_000,
  debtSum: 12_000_000,
  daysOverdue: 40,
};

const asos = (over: Partial<AgentTurnInput> = {}): AgentTurnInput => ({
  conversationId: 'cv1',
  clientId: 'k1',
  contractId: 's1',
  stage: 'soft',
  conversationState: 'negotiating',
  knowledge: { rules: '', lessons: '', clientMemory: '', personaName: 'Nodira' },
  context,
  history: [{ role: 'client', text: '[mijoz to\'lov cheki yubordi]', at: new Date('2026-09-17T05:59:00Z') }],
  incoming: '[mijoz to\'lov cheki yubordi]',
  sessionId: null,
  brokenPromise: null,
  bayram: null,
  openPromise: null,
  receiptPending: false,
  paymentReceived: null,
  nudgeAttempt: null,
  nudgeLast: null,
  ...over,
});

/** Vazifa qismi — kontekst blokidagi raqamlar bu yerga kirmaydi. */
const vazifa = (prompt: string): string => prompt.split('## VAZIFA')[1] ?? '';

let failed = 0;
const check = (name: string, ok: boolean, matn?: string): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}`);
  if (!ok && matn) console.log(`    prompt:\n${matn}`);
};

// ─── 1. Chek keldi — bitta qisqa javob ───────────────────────────────────
{
  const p = buildUserPrompt(asos({ receiptReview: 'new' }), 'reply', NOW);
  check('yangi chek: qoida qo\'shiladi', p.includes(RECEIPT_REVIEW_RULE), p);
  check(
    'yangi chek: tayyor jumla',
    RECEIPT_REVIEW_RULE.includes('Chekni oldim, rahmat. Hamkasbim tekshirib chiqadi, tasdiqlanishi bilan yozaman.'),
  );
  check('yangi chek: "bir kun ichida" taqiqlangan', RECEIPT_REVIEW_RULE.includes('"bir kun ichida"'));
  check('yangi chek: CRM summalari aytilmaydi', RECEIPT_REVIEW_RULE.includes('summalarni AYTMA'));
  check('yangi chek: da\'vo kuzatuvi qoidasi aralashmaydi', !p.includes(RECEIPT_PENDING_RULE), p);
}

// ─── 2. Chek allaqachon qabul qilingan ───────────────────────────────────
{
  const p = buildUserPrompt(asos({ receiptReview: 'acknowledged', incoming: 'qachon tekshirasizlar?' }), 'reply', NOW);
  check('qabul qilingan: takrorlamaslik qoidasi', p.includes(RECEIPT_REVIEW_ACK_RULE), p);
  check('qabul qilingan: yangi chek qoidasi yo\'q', !p.includes(RECEIPT_REVIEW_RULE), p);
  check('qabul qilingan: muddat taqiqi saqlanadi', RECEIPT_REVIEW_ACK_RULE.includes('"bir kun ichida"'));
}

// ─── 3. Da'vo kuzatuvi — eski qoida o'zgarmaydi ──────────────────────────
{
  const p = buildUserPrompt(asos({ receiptPending: true, incoming: 'to\'lab qo\'ydim' }), 'reply', NOW);
  check('da\'vo: eski qoida', p.includes(RECEIPT_PENDING_RULE), p);
  check('da\'vo: chek qoidalari yo\'q', !p.includes(RECEIPT_REVIEW_RULE) && !p.includes(RECEIPT_REVIEW_ACK_RULE), p);
}

// ─── 4. Tugma bosildi — rahmat ───────────────────────────────────────────
const tasdiq = (debtCleared: boolean, mentionRemaining: boolean, ctx: AgentDebtContext = context): string =>
  buildUserPrompt(
    asos({ incoming: null, context: ctx, receiptConfirmed: { debtCleared, mentionRemaining } }),
    'receipt_confirmed',
    NOW,
  );

{
  const p = tasdiq(false, true);
  const v = vazifa(p);
  check('tasdiq: o\'z vazifasi', v.includes('— CHEK TASDIQLANDI'), p);
  check('tasdiq: birinchi jumla', v.includes('"To\'lovingiz qabul qilindi, rahmat!"'), v);
  check('tasdiq: summa aytilmaydi', v.includes('SUMMASINI AYTMA') && !v.includes(formatSom(5_000_000)), v);
  check('tasdiq: CRM qoldig\'i aytiladi', v.includes(formatSom(12_000_000)), v);
  check('tasdiq: sana so\'ralmaydi', v.includes('Yangi sana SO\'RAMA'), v);
  check('tasdiq: "qarz" so\'zi yo\'q', !/qarz/i.test(p), p);
}

{
  const v = vazifa(tasdiq(false, false));
  check('CRM\'da to\'lov ko\'rinmagan: qoldiq aytilmaydi', !v.includes(formatSom(12_000_000)) && v.includes('HECH NARSA DEMA'), v);
  check('CRM\'da to\'lov ko\'rinmagan: hech qanday summa yo\'q', !/\d[\d\s]* so'm/.test(v), v);
}

{
  const v = vazifa(tasdiq(true, true));
  check('kechikish yopildi: shu aytiladi', v.includes('kechikkan to\'lovi YO\'Q'), v);
  check('kechikish yopildi: qoldiq aytilmaydi', !v.includes(formatSom(12_000_000)), v);
}

{
  const ikkinchi: AgentContractFacts = { ...SHARTNOMA, contractNo: '5A1E92B8', debtMonthly: 2_000_000 };
  const v = vazifa(tasdiq(false, true, { ...context, contracts: [SHARTNOMA, ikkinchi], debtMonthly: 14_000_000, debtSum: 14_000_000 }));
  check('ko\'p shartnoma: jami raqam aytilmaydi', !v.includes(formatSom(14_000_000)) && v.includes('JAMI raqam AYTMA'), v);
}

// ─── 5. Operator topshirig'i chek ochiq paytda ───────────────────────────
const topshiriq = (receiptReview: AgentTurnInput['receiptReview']): string =>
  buildUserPrompt(
    asos({ incoming: null, receiptReview, operatorInstruction: 'Mijozga to\'lov jadvalini eslat' }),
    'operator',
    NOW,
  );

{
  const p = topshiriq('acknowledged');
  check('topshiriq (qabul qilingan): takrorlamaslik qoidasi', p.includes(RECEIPT_REVIEW_ACK_RULE), p);
  check('topshiriq (qabul qilingan): operator chek qoidasi yo\'q', !p.includes(RECEIPT_REVIEW_OPERATOR_RULE), p);
}

// Chek kelgan, lekin agent javob bermagan (kill switch, eskalatsiya, agent
// xatosi) — operator topshiriq bersa "chekni olganingni aytgansan" deyish
// yolg'on bo'lardi.
{
  const p = topshiriq('new');
  check('topshiriq (yangi chek): operator chek qoidasi', p.includes(RECEIPT_REVIEW_OPERATOR_RULE), p);
  check('topshiriq (yangi chek): "allaqachon aytgansan" yo\'q', !p.includes(RECEIPT_REVIEW_ACK_RULE), p);
  check('topshiriq (yangi chek): javob qoidasi aralashmaydi', !p.includes(RECEIPT_REVIEW_RULE), p);
  check('operator chek qoidasi: "Chekni oldim, rahmat" mazmuni', RECEIPT_REVIEW_OPERATOR_RULE.includes('"Chekni oldim, rahmat"'));
  check('operator chek qoidasi: hali aytilmagan bo\'lsa', RECEIPT_REVIEW_OPERATOR_RULE.includes('hali aytmagan bo\'lsang'));
  check('operator chek qoidasi: tasdiqlandi demaydi', RECEIPT_REVIEW_OPERATOR_RULE.includes('"tasdiqlandi" DEMA'));
  check('operator chek qoidasi: "bir kun ichida" taqiqlangan', RECEIPT_REVIEW_OPERATOR_RULE.includes('"bir kun ichida"'));
  check('operator chek qoidasi: to\'lov va sana so\'ralmaydi', RECEIPT_REVIEW_OPERATOR_RULE.includes('To\'lov ham, yangi sana ham SO\'RAMA'));
  check('operator chek qoidasi: "qarz" so\'zi yo\'q', !/qarz/i.test(RECEIPT_REVIEW_OPERATOR_RULE));
}

{
  const p = topshiriq(null);
  check(
    'topshiriq (chek yo\'q): chek qoidalari yo\'q',
    !p.includes(RECEIPT_REVIEW_ACK_RULE) && !p.includes(RECEIPT_REVIEW_OPERATOR_RULE),
    p,
  );
}

console.log(failed ? `\n${failed} ta test yiqildi` : '\nHammasi o\'tdi');
process.exitCode = failed ? 1 : 0;
