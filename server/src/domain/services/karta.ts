import type { Course } from '@/domain/entities/Course';
import type { Purchase, XaridBosqichi } from '@/domain/entities/Purchase';

/** Sozlamalardagi to'lov kartasi. `number` — 16 ta raqam, bo'shliqsiz. */
export interface PaymentCard {
  id: string;
  number: string;
  holder: string;
  bank: string;
  active: boolean;
}

/** Birinchi faol karta; yo'q bo'lsa `null`. */
export function tanlanganKarta(cards: PaymentCard[]): PaymentCard | null {
  return cards.find((c) => c.active) ?? null;
}

/**
 * Mijoz hozir to'lashi kerak summa.
 * To'liq to'lov — xariddagi summa (yo'q bo'lsa kurs narxi); bo'lib to'lashda birinchi qism —
 * kursning minimal birinchi qismi; keyingi qismni agent o'zi aytadi (`null`).
 */
export function kartaSummasi(course: Course, purchase: Purchase): number | null {
  if (!purchase.installment) return purchase.totalAmount ?? course.price;
  return purchase.paidAmount === 0 ? course.installmentFirstMin : null;
}

export type KartaTayyorligi =
  | { ok: true; card: PaymentCard; amount: number | null }
  | { ok: false; reason: 'kurs_yoq' | 'karta_yoq' | 'bolib_tolash_yoq' };

export function kartaTayyorligi(i: { cards: PaymentCard[]; course: Course | null; purchase: Purchase }): KartaTayyorligi {
  if (!i.course) return { ok: false, reason: 'kurs_yoq' };
  const card = tanlanganKarta(i.cards);
  if (!card) return { ok: false, reason: 'karta_yoq' };
  if (i.purchase.installment && !i.course.installmentAllowed) return { ok: false, reason: 'bolib_tolash_yoq' };
  return { ok: true, card, amount: kartaSummasi(i.course, i.purchase) };
}

/** "1500000" → "1 500 000" (oddiy ASCII bo'shliq). */
function minglik(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** Karta xabarining aniq matni; raqam 4 tadan guruhlanadi. `amount` null bo'lsa "Summa" qatori yo'q. */
export function kartaXabari(card: PaymentCard, amount: number | null): string {
  const raqam = card.number.replace(/\D/g, '').replace(/(\d{4})(?=\d)/g, '$1 ');
  const qatorlar = ["To'lov uchun karta:", raqam, `Egasi: ${card.holder}`, `Bank: ${card.bank}`];
  if (amount !== null) qatorlar.push(`Summa: ${minglik(amount)} so'm`);
  return qatorlar.join('\n');
}

/**
 * Agent `sendCard: true` qaytarganda kartani yuborish mumkinmi (takror himoyasi).
 *
 * Karta faqat to'lovdan OLDINGI bosqichlarda yoki keyingi qism uchun
 * (`qisman_toladi`) ketadi. `karta_yuborildi` — karta chatda allaqachon
 * turibdi; `chek_keldi` — chek tekshiruvda; `toladi`/`rad_etdi` — xarid
 * yopiq. Bu bosqichlarda model `sendCard` ni takrorlasa ham ikkinchi
 * karta ketmaydi. `stage` — FAOL xaridning bosqichi; faol xarid yo'q
 * bo'lsa `AgentRunner` bu yerga kelmaydi (kurs yo'q — menejerga).
 */
export function agentKartaYuborsinmi(stage: XaridBosqichi | null): boolean {
  return stage === null || stage === 'yangi' || stage === 'suhbatda' || stage === 'qiziqdi' || stage === 'qisman_toladi';
}

/**
 * Chek tasdig'i oynasidagi standart summa (menejer tahrirlay oladi).
 * Bo'lib to'lashning birinchi qismi — kursning minimal birinchi qismi;
 * aks holda qolgan summa (`total - paid`, total yo'q bo'lsa kurs narxi).
 * Hisoblab bo'lmasa yoki to'lanadigan qoldiq qolmagan bo'lsa — `null`.
 */
export function kutilganChekSummasi(course: Course | null, purchase: Purchase): number | null {
  if (purchase.installment && purchase.paidAmount === 0 && course?.installmentFirstMin) return course.installmentFirstMin;
  const total = purchase.totalAmount || course?.price || null;
  if (!total) return null;
  const qolgan = total - purchase.paidAmount;
  return qolgan > 0 ? qolgan : null;
}
