import type { Bayram } from '@/domain/entities/bayram';

export interface NewBayram {
  readonly name: string;
  readonly startsOn: string;
  readonly endsOn: string;
  readonly yillik: boolean;
  readonly createdBy?: string | null;
}

export interface IHolidayRepository {
  /**
   * Hamma bayram — saralangan holda.
   *
   * Ro'yxat KESHLANMAYDI: sozlamalar ham keshsiz o'qiladi
   * (`RuntimeSettings.ts`), chunki dashboarddan kiritilgan bayram
   * darhol kuchga kirishi kerak. Ro'yxat kichik, so'rov arzon.
   */
  list(): Promise<Bayram[]>;
  /** Topilmasa `null` — o'chirishdan oldin audit uchun nom/sanani olishga ishlatiladi. */
  findById(id: string): Promise<Bayram | null>;
  create(data: NewBayram): Promise<Bayram>;
  /**
   * Bayramni to'liq almashtiradi. Yozuv topilmasa `null`.
   *
   * `created_by` TEGILMAYDI: u yozuvni kim YARATGANINI bildiradi va
   * tahrir uni o'zgartirmasligi kerak — kim o'zgartirgani jurnalga
   * (`holiday.updated`) tushadi.
   */
  update(id: string, data: Omit<NewBayram, 'createdBy'>): Promise<Bayram | null>;
  remove(id: string): Promise<void>;
}
