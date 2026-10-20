/**
 * To'lov tekshiruvi — ikki xil jarayon, bitta jadval (`payment_checks`).
 *
 *   • `crm_watch` — mijoz "to'ladim" dedi (agentning `paymentClaim`
 *     belgisi). Tizim CRM'ni 24 soat kuzatadi, topilmasa operatorga
 *     chiqaradi.
 *   • `receipt_review` — mijoz chek rasmi yoki fayl yubordi. Pulni ODAM
 *     tasdiqlaydi ("To'lov qabul qilindi" tugmasi), CRM bilan avtomat
 *     solishtirilmaydi (2026-09-17 qarori).
 *
 * NEGA BITTA JADVAL: "suhbatda bitta ochiq tekshiruv" qoidasi, `message_id`,
 * `cancel()` va `findOpenByConversation` ikkalasiga umumiy. `kind` esa
 * yozuvning qaysi jarayonga tegishli ekanini holatdan qat'i nazar aytadi —
 * `cancelled` ikkalasida ham bor.
 */
export type PaymentCheckKind = 'crm_watch' | 'receipt_review';

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
  /** `crm_watch`: kuzatilyapti — hali topilmadi, muddat tugamagan. */
  | 'watching'
  /** `crm_watch`: yangi to'lov topildi. */
  | 'confirmed'
  /** `crm_watch`: muddat tugadi, to'lov ko'rinmadi — operatorga chiqarildi. */
  | 'not_found'
  /** Ikkalasi: suhbat yopildi yoki boshqa tekshiruv o'rnini egalladi. */
  | 'cancelled'
  /** `receipt_review`: operator chekni hali ko'rmagan. */
  | 'reviewing'
  /** `receipt_review`: operator "To'lov qabul qilindi" tugmasini bosdi. */
  | 'confirmed_by_operator';

export interface PaymentCheck {
  readonly id: string;
  readonly conversationId: string;
  readonly clientId: string;
  readonly contractId: string | null;
  readonly messageId: string | null;
  readonly kind: PaymentCheckKind;
  readonly status: PaymentCheckStatus;
  /** Faqat `receipt_review` da to'ladi. */
  readonly receiptSource: ReceiptSource | null;
  /**
   * `crm_watch`: delta shu sanadan boshlangan oyna bo'yicha o'lchanadi.
   * `receipt_review`: chek kelgan kun (YYYY-MM-DD).
   */
  readonly sinceIso: string;
  /** Tekshiruv boshlangandagi to'lovlar yig'indisi (`receipt_review` da 0). */
  readonly baselinePaid: number;
  /** Topilgan yangi pul (tasdiqlangan bo'lsa). */
  readonly foundAmount: number | null;
  /** `xonpay` / `transfer` / `kapitalbank` — topilgan to'lovning kanali. */
  readonly foundType: string | null;
  /** Faqat `crm_watch` da bor — chekni operator muddatsiz ko'radi. */
  readonly watchUntil: Date | null;
  readonly checkedAt: Date | null;
  /** Agent mijozga "Chekni oldim…" deb javob bergan payt. */
  readonly acknowledgedAt: Date | null;
  /** Tekshiruv ochiqligida boshqa yo'ldan (va'da, da'vo) rahmat ketgan payt. */
  readonly thanksSentAt: Date | null;
  /** Tugmani bosgan operatorning emaili — audit bilan bir xil. */
  readonly confirmedBy: string | null;
  readonly confirmedAt: Date | null;
  readonly createdAt: Date;
}

export interface NewPaymentCheck {
  readonly conversationId: string;
  readonly clientId: string;
  readonly contractId: string | null;
  readonly messageId: string | null;
  readonly sinceIso: string;
  readonly baselinePaid: number;
  readonly watchUntil: Date;
}

export interface NewReceiptReview {
  readonly conversationId: string;
  readonly clientId: string;
  readonly messageId: string | null;
  /** Chek kelgan kun, YYYY-MM-DD. */
  readonly sinceIso: string;
  readonly receiptSource: ReceiptSource;
}

/**
 * Kvitansiya kelganda necha kun orqaga qarab yig'indi olinadi.
 *
 * Bank o'tkazmasi CRM'ga kechroq tushadi, lekin `date_paid` mijoz to'lagan
 * kunga — ya'ni ORQAGA — qo'yiladi. Oyna tor bo'lsa, kechikib tushgan
 * to'lov undan tashqarida qolib, "topilmadi" deb yopilardi.
 */
export const CHECK_WINDOW_DAYS = 7;

/**
 * Kvitansiya necha soat kuzatiladi.
 *
 * Xonsaroy Pay darhol ko'rinadi, bank esa "bir kun ichida" — 24 soat
 * ikkalasini ham qoplaydi. Undan uzoq kutish ma'nosiz: bu paytga kelib
 * masala operatorning ko'zini talab qiladi.
 */
export const WATCH_HOURS = 24;

/**
 * Operator chekni tasdiqlagandan keyin necha kun boshqa yo'llar
 * (`PromiseWatcher`, da'vo kuzatuvi) rahmat YUBORMAYDI.
 *
 * Tugma bosilganda agent allaqachon rahmat aytgan; o'sha to'lov bir necha
 * kundan keyin CRM'da ko'rinib, va'da bo'yicha yana bir rahmat ketardi.
 */
export const OPERATOR_TASDIGIDAN_KEYIN_JIM_KUNLAR = 7;

/** Operator tasdig'i shu paytdan keyin bo'lsa, rahmat takrorlanmaydi. */
export function operatorJimligiBoshi(now: Date): Date {
  return new Date(now.getTime() - OPERATOR_TASDIGIDAN_KEYIN_JIM_KUNLAR * 24 * 60 * 60 * 1000);
}

/**
 * Tugmasiz qolib ketgan chek tekshiruvi necha kundan keyin e'tiborga
 * olinmaydi (2026-09-17 qarori).
 *
 * Operator eskalatsiyani tugmasiz yechsa, tekshiruv `reviewing` bo'lib
 * abadiy qolardi: sukut xabarlari to'xtab, agent har javobda "hamkasbim
 * tekshiryapti" derdi. Muddatdan keyin yozuv o'zgartirilmaydi — u shunchaki
 * sukutni to'smaydi, agent qoidasiga tushmaydi va tugma ko'rinmaydi.
 * `OPERATOR_TASDIGIDAN_KEYIN_JIM_KUNLAR` bilan qiymati bir xil, lekin
 * ma'nosi boshqa — shuning uchun alohida.
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
  if (!check || check.kind !== 'receipt_review' || check.status !== 'reviewing') return null;
  if (check.receiptSource !== 'tolov') return null;
  if (!chekTekshiruviFaolmi(check, now)) return null;
  return check.acknowledgedAt ? 'acknowledged' : 'new';
}
