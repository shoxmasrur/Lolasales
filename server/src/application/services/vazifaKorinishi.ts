import type { MijozQamrovi } from '@/domain/entities/MijozQamrovi';
import { AppError } from '@/shared/errors';

/** Ommaviy vazifa holatining obyekt cheklovi uchun kerakli qismi. */
export interface EgasiBorVazifa {
  readonly currentName?: string | null;
  readonly boshlaganUserId?: string | null;
}

/**
 * Vazifa so'rovchiga begonami: so'rovchi obyekt bo'yicha cheklangan va
 * vazifani boshqa foydalanuvchi boshlagan. Egasi noma'lum (eski) vazifa ham
 * begona — yopiq holatda yiqiladi. Cheklanmaganga hech qachon begona emas.
 */
export function begonaVazifami(job: EgasiBorVazifa, userId: string, q: MijozQamrovi): boolean {
  return q.cheklangan && job.boshlaganUserId !== userId;
}

/**
 * Begona vazifadan mijoz ma'lumotini olib tashlaydi: joriy ism yoki suhbat
 * (`currentName`, qayta aloqada `current`) va natija ro'yxatlari
 * (`skippedItems`, `missing` — ism va shartnoma raqami bilan; qayta aloqada
 * `results` — suhbat va ism bilan). Sonlar, holat va vaqtlar qoladi.
 */
export function vazifaniYashir<T extends EgasiBorVazifa>(job: T): T {
  const y: Record<string, unknown> = { ...(job as object) };
  if ('currentName' in job) y.currentName = null;
  if ('current' in job) y.current = null;
  if ('skippedItems' in job) y.skippedItems = [];
  if ('missing' in job) y.missing = [];
  if ('results' in job) y.results = [];
  return y as unknown as T;
}

/** So'rovchiga ko'rsatiladigan holat: begona bo'lsa yashirilgan, aks holda o'zi. */
export function korinadiganVazifa<T extends EgasiBorVazifa>(
  job: T | null,
  userId: string,
  q: MijozQamrovi,
): T | null {
  if (!job || !begonaVazifami(job, userId, q)) return job;
  return vazifaniYashir(job);
}

/** Obyekt cheklovi: boshqa foydalanuvchining vazifasini to'xtatib bo'lmaydi (403 `OBYEKT_CHEKLOVI`). */
export function begonaniToxtatma(job: EgasiBorVazifa | null, userId: string, q: MijozQamrovi): void {
  if (job && begonaVazifami(job, userId, q)) {
    throw new AppError(
      'Bu vazifani boshqa foydalanuvchi boshlagan — uni faqat o\'sha yoki cheklanmagan xodim to\'xtatadi',
      403,
      'OBYEKT_CHEKLOVI',
    );
  }
}
