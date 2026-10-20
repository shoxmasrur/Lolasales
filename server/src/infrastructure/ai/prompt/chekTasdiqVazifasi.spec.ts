import {
  buildUserPrompt,
  RECEIPT_REVIEW_ACK_RULE,
  RECEIPT_REVIEW_OPERATOR_RULE,
  RECEIPT_REVIEW_RULE,
} from '@/infrastructure/ai/prompt/userPrompt';
import type { AgentSalesContext, AgentTurnInput } from '@/domain/services/IAgentEngine';

/**
 * Qo'lda ishga tushiriladi: npm run test:chek-tasdiq-vazifasi --workspace=server
 *
 * Chekni MENEJER tasdiqlaydi. Agentga ketadigan matnning qimmat xatolari:
 *   • chek kelganda — "to'lov qabul qilindi" deb erta aytish va muddat va'da qilish;
 *   • chek allaqachon qabul qilingan — "Chekni oldim" ni takrorlash;
 *   • tasdiqdan keyin — qolgan summani o'zi hisoblash yoki havolani o'zi yozish;
 *   • rad etilganda — mijozni ayblash yoki kartani qayta so'rash.
 */
const NOW = new Date('2026-11-05T06:00:00Z'); // Toshkentda 5-noyabr, 11:00

const context: AgentSalesContext = {
  clientName: 'Aliyeva Malika',
  clientFirstName: 'Malika',
  source: 'reklama',
  sourceGroup: null,
  sourceComment: null,
  purchase: { stage: 'chek_keldi', courseId: 'kurs-1', totalAmount: 1_500_000, paidAmount: 0, installment: true },
  coursesOnSale: [],
  nextCourse: null,
  boughtCourses: [],
};

const asos = (over: Partial<AgentTurnInput> = {}): AgentTurnInput => ({
  conversationId: 'cv1',
  clientId: 'k1',
  knowledge: { rules: '', lessons: '', clientMemory: '', personaName: 'Lola' },
  context,
  history: [{ role: 'client', text: '[mijoz to\'lov cheki yubordi]', at: new Date('2026-11-05T05:59:00Z') }],
  incoming: '[mijoz to\'lov cheki yubordi]',
  sessionId: null,
  receiptPending: false,
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
  const p = buildUserPrompt(asos({ receiptReview: 'new', receiptPending: true }), 'reply', NOW);
  check('yangi chek: qoida qo\'shiladi', p.includes(RECEIPT_REVIEW_RULE), p);
  check('yangi chek: tayyor jumla', RECEIPT_REVIEW_RULE.includes('Chekni oldim, rahmat. Tekshirib chiqamiz'));
  check('yangi chek: qabul qilindi demaydi', RECEIPT_REVIEW_RULE.includes('"To\'lov qabul qilindi", "tasdiqlandi" DEMANG'));
  check('yangi chek: "bir kun ichida" taqiqlangan', RECEIPT_REVIEW_RULE.includes('"bir kun ichida"'));
  check('yangi chek: karta yuborilmaydi', RECEIPT_REVIEW_RULE.includes('`sendCard` = false'));
  check('yangi chek: takrorlash qoidasi aralashmaydi', !p.includes(RECEIPT_REVIEW_ACK_RULE), p);
}

// ─── 2. Chek allaqachon qabul qilingan ───────────────────────────────────
{
  const p = buildUserPrompt(asos({ receiptReview: 'acknowledged', receiptPending: true, incoming: 'qachon tekshirasizlar?' }), 'reply', NOW);
  check('qabul qilingan: takrorlamaslik qoidasi', p.includes(RECEIPT_REVIEW_ACK_RULE), p);
  check('qabul qilingan: yangi chek qoidasi yo\'q', !p.includes(RECEIPT_REVIEW_RULE), p);
  check('qabul qilingan: muddat taqiqi saqlanadi', RECEIPT_REVIEW_ACK_RULE.includes('"bir kun ichida"'));
}

// ─── 3. Chek yo'q — qoidalar umuman yo'q ─────────────────────────────────
{
  const p = buildUserPrompt(asos({ incoming: 'kurs qachon boshlanadi?' }), 'reply', NOW);
  check('chek yo\'q: chek qoidalari yo\'q', !p.includes(RECEIPT_REVIEW_RULE) && !p.includes(RECEIPT_REVIEW_ACK_RULE), p);
}

// ─── 4. Tugma bosildi — rahmat ───────────────────────────────────────────
const tasdiq = (c: NonNullable<AgentTurnInput['receiptConfirmed']>): string =>
  buildUserPrompt(asos({ incoming: null, receiptConfirmed: c }), 'receipt_confirmed', NOW);

{
  const v = vazifa(tasdiq({ paidAmount: 500_000, totalAmount: 1_500_000, remaining: 1_000_000, linkWillBeSent: true }));
  check('tasdiq: o\'z vazifasi', v.includes('— CHEK TASDIQLANDI'), v);
  check('tasdiq: birinchi jumla', v.includes('"To\'lovingiz qabul qilindi, rahmat!"'), v);
  check('tasdiq: qolgan summa aynan', v.includes("1 000 000 so'm") && v.includes("500 000 so'm"), v);
  check('tasdiq: havolani tizim yuboradi', v.includes('havolani o\'zingiz yozmang'), v);
  check('tasdiq: karta yo\'q', v.includes('`sendCard` = false'), v);
}

{
  const v = vazifa(tasdiq({ paidAmount: 1_500_000, totalAmount: 1_500_000, remaining: 0, linkWillBeSent: false }));
  check('to\'liq: to\'liq to\'landi aytiladi', v.includes('to\'liq to\'landi'), v);
  check('to\'liq: qolgan summa yo\'q', !v.includes('qolgan summa'), v);
  check('havola yo\'q: havola haqida gapirilmaydi', v.includes('Guruh havolasi haqida gapirmang'), v);
}

check('tasdiq ma\'lumoti yo\'q — reply null', vazifa(buildUserPrompt(asos({ incoming: null }), 'receipt_confirmed', NOW)).includes('null'));

// ─── 5. Chek rad etildi ──────────────────────────────────────────────────
{
  const v = vazifa(buildUserPrompt(asos({ incoming: null, receiptRejected: { reason: 'Summa ko\'rinmayapti' } }), 'receipt_rejected', NOW));
  check('rad: o\'z vazifasi', v.includes('— CHEK QABUL QILINMADI'), v);
  check('rad: sabab berilgan', v.includes('Summa ko\'rinmayapti'), v);
  check('rad: ayblamaydi', v.includes('AYBLAMANG'), v);
  check('rad: karta qayta yuborilmaydi', v.includes('`sendCard` = false'), v);
}

// ─── 6. Operator topshirig'i chek ochiq paytda ───────────────────────────
const topshiriq = (receiptReview: AgentTurnInput['receiptReview']): string =>
  buildUserPrompt(
    asos({ incoming: null, receiptReview, operatorInstruction: 'Mijozga kurs boshlanish sanasini eslat' }),
    'operator',
    NOW,
  );

{
  const p = topshiriq('acknowledged');
  check('topshiriq (qabul qilingan): takrorlamaslik qoidasi', p.includes(RECEIPT_REVIEW_ACK_RULE), p);
  check('topshiriq (qabul qilingan): operator chek qoidasi yo\'q', !p.includes(RECEIPT_REVIEW_OPERATOR_RULE), p);
}

// Chek kelgan, lekin agent javob bermagan (kill switch, eskalatsiya) —
// "chekni olganingizni aytgansiz" deyish yolg'on bo'lardi.
{
  const p = topshiriq('new');
  check('topshiriq (yangi chek): operator chek qoidasi', p.includes(RECEIPT_REVIEW_OPERATOR_RULE), p);
  check('topshiriq (yangi chek): "allaqachon aytgansiz" yo\'q', !p.includes(RECEIPT_REVIEW_ACK_RULE), p);
  check('topshiriq (yangi chek): javob qoidasi aralashmaydi', !p.includes(RECEIPT_REVIEW_RULE), p);
  check('operator chek qoidasi: "Chekni oldim, rahmat" mazmuni', RECEIPT_REVIEW_OPERATOR_RULE.includes('"Chekni oldim, rahmat"'));
  check('operator chek qoidasi: hali aytilmagan bo\'lsa', RECEIPT_REVIEW_OPERATOR_RULE.includes('hali aytmagan bo\'lsangiz'));
  check('operator chek qoidasi: tasdiqlandi demaydi', RECEIPT_REVIEW_OPERATOR_RULE.includes('"tasdiqlandi" DEMANG'));
  check('operator chek qoidasi: "bir kun ichida" taqiqlangan', RECEIPT_REVIEW_OPERATOR_RULE.includes('"bir kun ichida"'));
}

{
  const p = topshiriq(null);
  check(
    'topshiriq (chek yo\'q): chek qoidalari yo\'q',
    !p.includes(RECEIPT_REVIEW_ACK_RULE) && !p.includes(RECEIPT_REVIEW_OPERATOR_RULE),
    p,
  );
}

// ─── 7. Birinchi murojaat manbaga qarab ──────────────────────────────────
{
  const guruh = vazifa(buildUserPrompt(
    asos({ incoming: null, history: [], context: { ...context, purchase: null, source: 'guruh', sourceGroup: 'SMM maktabi', sourceComment: 'narxi qancha?' } }),
    'first',
    NOW,
  ));
  check('first (guruh): kommentga tayanadi', guruh.includes('GURUH KOMMENTI') && guruh.includes('«narxi qancha?»'), guruh);
  const raqam = vazifa(buildUserPrompt(
    asos({ incoming: null, history: [], context: { ...context, purchase: null, source: 'raqam' } }),
    'first',
    NOW,
  ));
  check('first (raqam): o\'zini tanishtiradi', raqam.includes('O\'zingizni va kompaniyani qisqa tanishtiring'), raqam);
  check('first (raqam): komment yo\'q', !raqam.includes('GURUH KOMMENTI'), raqam);
}

// ─── 8. Eslatma bosqichga qarab ──────────────────────────────────────────
{
  const karta = vazifa(buildUserPrompt(asos({ incoming: null, nudgeStage: 'karta_yuborildi' }), 'nudge', NOW));
  check('nudge (karta): chek eslatiladi, karta qayta yo\'q', karta.includes('chekni shu yerga') && karta.includes('`sendCard` = false'), karta);
  const qiziqdi = vazifa(buildUserPrompt(asos({ incoming: null, nudgeStage: 'qiziqdi' }), 'nudge', NOW));
  check('nudge (qiziqdi): savoli qolganini so\'raydi', qiziqdi.includes('savoli qolgan-qolmaganini'), qiziqdi);
}

console.log(failed ? `\n${failed} ta test yiqildi` : '\nHammasi o\'tdi');
process.exitCode = failed ? 1 : 0;
