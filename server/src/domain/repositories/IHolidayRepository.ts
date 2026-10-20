import type { Bayram } from '@/domain/entities/bayram';

/**
 * Bayramlar bazasi olib tashlandi (LolaSales: kurs savdosida bayram bloki yo'q).
 * Interfeys faqat `evaluateWindow` ro'yxatini olish uchun qoldi va har doim `[]`
 * qaytaradi; konstruktorlardan butunlay olib tashlash 8/14-vazifaga qoldirilgan.
 */
export interface IHolidayRepository {
  list(): Promise<Bayram[]>;
}
