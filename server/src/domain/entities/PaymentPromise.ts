/**
 * `partial` — mijoz va'dasining bir qismini to'lagan. Unga rahmat
 * aytilgan, lekin kuzatuv davom etadi: qolgani hali kelmagan.
 */
export type PromiseStatus = 'pending' | 'partial' | 'kept' | 'broken' | 'cancelled';

/**
 * Hali yopilmagan va'da holatlari — "ochiq va'da"ning YAGONA ta'rifi.
 *
 * NEGA BITTA JOYDA: bu ta'rif uch joyda kerak — kuzatuvchi qaysi
 * va'dalarni tekshiradi (`findWatched`), suhbatning faol va'dasi qaysi
 * (`findActiveByConversation`) va `isOverdue`. Ular ayri-ayri yozilgan
 * edi va o'rtadagisi `partial` ni tushirib qoldirgandi.
 *
 * Oqibati produksiyada ko'rindi: qisman to'langan va'da "faol emas"
 * bo'lib qolib, agent uning USTIGA ikkinchi va'da yozdi — eskisi bekor
 * qilinmadi. Shundan keyin kuzatuvchi bitta suhbatda ikkita va'dani
 * kuzatdi va har kelgan to'lovda mijozga ikkita rahmat xabari ketdi,
 * ikkalasida ikki xil "jami to'landi" va "qolgan" summasi bilan —
 * har biri o'z va'dasining sanasi va summasidan hisoblangani uchun.
 */
export const OCHIQ_VADA_HOLATLARI: readonly PromiseStatus[] = ['pending', 'partial'];

export function ochiqVadami(status: PromiseStatus): boolean {
  return OCHIQ_VADA_HOLATLARI.includes(status);
}

/**
 * Playbook 2-bo'lim, qoida 5: har bir suhbat aniq summa + aniq sana bilan
 * tugashi shart. Shu va'da yozma qayd qilinadi (7-bo'lim).
 */
export interface PaymentPromise {
  readonly id: string;
  readonly conversationId: string;
  readonly clientId: string;
  readonly contractId: string | null;
  readonly amount: number;
  readonly promisedDate: Date;
  readonly quote: string | null;
  readonly status: PromiseStatus;
  readonly sourceMessageId: string | null;
  readonly createdAt: Date;
  readonly resolvedAt: Date | null;
  /** Va'da kunidagi yumshoq eslatma yuborilgan vaqt. Bir marta yuboriladi. */
  readonly remindedAt: Date | null;
  /** Va'da BERILGANIDAN KEYIN kelgan jami to'lov. */
  readonly paidAmount: number;
  /** Qaysi summagacha rahmat aytilgan — takroriy rahmatning oldini oladi. */
  readonly thankedAmount: number;
  /** Oxirgi to'lov tekshiruvi. */
  readonly checkedAt: Date | null;
  /** Kuzatuv tugash sanasi — shundan keyin `broken`. */
  readonly watchUntil: Date | null;
  /** Telefon va'dasi bo'lsa — uni yaratgan qo'ng'iroq (`phone_calls.id`). */
  readonly callId?: string | null;
}

export interface NewPaymentPromise {
  conversationId: string;
  clientId: string;
  contractId?: string | null;
  amount: number;
  promisedDate: Date;
  quote?: string | null;
  sourceMessageId?: string | null;
  /** Va'da qayerdan kelgan. Berilmasa — 'telegram' (ustun standarti). */
  source?: 'telegram' | 'phone';
  /** Telefon va'dasi bo'lsa — `phone_calls.id`. */
  callId?: string | null;
}

export function isOverdue(promise: PaymentPromise, now: Date): boolean {
  if (!ochiqVadami(promise.status)) return false;
  return promise.promisedDate.getTime() < now.getTime();
}
