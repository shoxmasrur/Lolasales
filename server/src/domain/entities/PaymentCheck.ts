/**
 * Chek tekshiruvi (`payment_checks`, `kind = 'receipt_review'`).
 *
 * Mijoz chek rasmi yoki fayl yubordi — pulni MENEJER tasdiqlaydi (summa
 * bilan) yoki sababini yozib rad etadi. Qator mijozning faol xaridiga
 * (`purchaseId`) bog'lanadi. Debitordagi `crm_watch` (CRM'dan to'lov
 * qidirish) sotuv agentida yo'q (005-migratsiya).
 */
export type PaymentCheckKind = 'receipt_review';

/**
 * Chek tekshiruvi nimadan ochilgani.
 *
 *   • `tolov` — vision rasmni to'lov cheki deb tanidi. Agent mijozga bir
 *     marta "Chekni oldim…" deydi.
 *   • `aniqlanmagan` — `noaniq`, tasnif yiqildi, tasnifchi o'chiq, PDF yoki
 *     fayl yuklanmadi. Agent mijozga HECH NARSA demaydi, suhbat darhol
 *     operatorga o'tadi.
 */
export type ReceiptSource = 'tolov' | 'aniqlanmagan';

export type PaymentCheckStatus =
  /** Menejer chekni hali ko'rmagan. */
  | 'reviewing'
  /** Menejer summani kiritib tasdiqladi. */
  | 'confirmed_by_operator'
  /** Menejer sababini yozib rad etdi. */
  | 'rejected'
  /** Suhbat yopildi yoki yangi chek eskisining o'rnini egalladi. */
  | 'cancelled';

export interface PaymentCheck {
  readonly id: string;
  readonly conversationId: string;
  readonly clientId: string;
  /** Chek kelgandagi faol xarid. */
  readonly purchaseId: string | null;
  readonly messageId: string | null;
  readonly kind: PaymentCheckKind;
  readonly status: PaymentCheckStatus;
  readonly receiptSource: ReceiptSource | null;
  /** Chek kelgan kun (YYYY-MM-DD). */
  readonly sinceIso: string;
  /** Agent mijozga "Chekni oldim…" deb javob bergan payt. */
  readonly acknowledgedAt: Date | null;
  /** Tasdiqlagan yoki rad etgan menejerning emaili — audit bilan bir xil. */
  readonly confirmedBy: string | null;
  readonly confirmedAt: Date | null;
  /** Menejer kiritgan summa (tasdiqlanganda). */
  readonly confirmedAmount: number | null;
  /** Rad etish sababi. */
  readonly rejectedReason: string | null;
  readonly createdAt: Date;
}

export interface NewReceiptReview {
  readonly conversationId: string;
  readonly clientId: string;
  readonly purchaseId: string | null;
  readonly messageId: string | null;
  /** Chek kelgan kun, YYYY-MM-DD. */
  readonly sinceIso: string;
  readonly receiptSource: ReceiptSource;
}

/**
 * Tugmasiz qolib ketgan chek tekshiruvi necha kundan keyin e'tiborga
 * olinmaydi (2026-09-17 qarori).
 *
 * Operator tekshiruvni tugmasiz yechsa, u `reviewing` bo'lib abadiy
 * qolardi: eslatmalar to'xtab, agent har javobda "hamkasbim tekshiryapti"
 * derdi. Muddatdan keyin yozuv o'zgartirilmaydi — u shunchaki eslatmani
 * to'smaydi, agent qoidasiga tushmaydi va tugma ko'rinmaydi.
 */
export const CHEK_TEKSHIRUVI_MUDDATI_KUNLAR = 7;

/** Ochiq chek tekshiruvi hali muddat ichidami (`created_at` bo'yicha). */
export function chekTekshiruviFaolmi(check: PaymentCheck, now: Date): boolean {
  return now.getTime() - check.createdAt.getTime() < CHEK_TEKSHIRUVI_MUDDATI_KUNLAR * 24 * 60 * 60 * 1000;
}

/** Operator ekranidagi eskalatsiya sababi — chek manbaiga qarab. */
export const RECEIPT_REVIEW_REASON: Record<ReceiptSource, string> = {
  tolov: 'Mijoz to\'lov cheki yubordi — tekshiring',
  aniqlanmagan: 'Mijoz rasm/fayl yubordi, nimaligi aniqlanmadi — chek bo\'lishi mumkin, tekshiring',
};

/**
 * Agent mijozning xabariga javob yozayotganda chek bo'yicha qaysi qoida
 * amal qiladi.
 *
 *   • `'new'` — chek keldi, agent hali javob bermagan: bir marta
 *     "Chekni oldim…".
 *   • `'acknowledged'` — javob berilgan, tekshiruv hali ochiq: takrorlanmaydi.
 *   • `null` — ochiq `tolov` chek tekshiruvi yo'q. `aniqlanmagan` ham shu
 *     yerga tushadi: agent u haqda gapirmaydi. Muddati o'tgan
 *     (`CHEK_TEKSHIRUVI_MUDDATI_KUNLAR`) tekshiruv ham — agent odatdagidek.
 */
export function chekJavobiHolati(check: PaymentCheck | null, now: Date): 'new' | 'acknowledged' | null {
  if (!check || check.status !== 'reviewing') return null;
  if (check.receiptSource !== 'tolov') return null;
  if (!chekTekshiruviFaolmi(check, now)) return null;
  return check.acknowledgedAt ? 'acknowledged' : 'new';
}
