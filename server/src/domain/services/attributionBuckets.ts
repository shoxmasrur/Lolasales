/**
 * To'lovlarni "xabardan keyin necha kun o'tgani" bo'yicha guruhlaydi.
 *
 * NEGA KERAK: hisobotning o'lchov qoidasi — suhbat boshlanganidan keyingi
 * HAR QANDAY to'lov. Bu qoida sodda, lekin raqamni "yopishqoq" qiladi:
 * mart oyida gaplashilgan mijoz avgustda to'lasa ham hisobga tushadi.
 *
 * Guruhlar shu zaiflikni yashirmaydi, aksincha ko'rsatadi: 0–7 kun
 * ichidagi to'lov bilan 90 kundan keyingisi bir xil vaznda emas va
 * hisobotni o'qiyotgan odam buni ko'rib turishi kerak.
 */

export type BucketKey = 'd0_7' | 'd8_30' | 'd31plus';

export interface AttributedPayment {
  readonly amount: number;
  /** Birinchi chiquvchi xabardan keyin necha kun o'tgani. */
  readonly daysAfter: number;
}

export interface Buckets {
  readonly d0_7: number;
  readonly d8_30: number;
  readonly d31plus: number;
}

export const BUCKET_LABEL: Record<BucketKey, string> = {
  d0_7: '0–7 kun',
  d8_30: '8–30 kun',
  d31plus: '31+ kun',
};

export function bucketFor(daysAfter: number): BucketKey {
  if (daysAfter <= 7) return 'd0_7';
  if (daysAfter <= 30) return 'd8_30';
  return 'd31plus';
}

export function sumByBucket(payments: readonly AttributedPayment[]): Buckets {
  const out = { d0_7: 0, d8_30: 0, d31plus: 0 };
  for (const p of payments) out[bucketFor(p.daysAfter)] += p.amount;
  return out;
}
