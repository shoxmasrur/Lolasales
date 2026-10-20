/**
 * Ovozli agentning bitta qo'ng'iroqi (spec 3-bo'lim).
 *
 * `promiseDate`/`promiseAmount` — telefonda berilgan va'da; mijozning
 * Telegram suhbati bo'lsa u `payment_promises` ga ham yoziladi
 * (`promiseId`), bo'lmasa faqat shu yerda turadi.
 */
export const QONGIROQ_NATIJALARI = ['gaplashildi', 'kotarmadi', 'band', 'boshqa_odam', 'raqam_notogri'] as const;
export type QongiroqNatijasi = (typeof QONGIROQ_NATIJALARI)[number];

export interface PhoneCall {
  readonly id: string;
  readonly externalId: string;
  readonly clientId: string;
  readonly contractId: string | null;
  readonly agentKey: string;
  readonly agentName: string;
  readonly phone: string | null;
  readonly startedAt: Date;
  readonly durationSec: number;
  readonly outcome: QongiroqNatijasi;
  readonly summary: string | null;
  readonly transcript: string | null;
  /** YYYY-MM-DD */
  readonly promiseDate: string | null;
  readonly promiseAmount: number | null;
  readonly promiseId: string | null;
  readonly createdByUserId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
