/**
 * `info` faqat bayroqli qatorlar uchun: oddiy `info` jurnalga tushmaydi
 * (052-migratsiya izohi), Telegram audit izi esa aynan shu darajada
 * yoziladi — muvaffaqiyatli chaqiruv na ogohlantirish, na xato.
 */
export type AppLogLevel = 'info' | 'warn' | 'error';

/** Qator qaysi maxsus oqimga tegishli. Bo'lmasa — odatdagi jurnal. */
export type AppLogFlag = 'telegram';

/** Bazaga yozish uchun tayyorlangan jurnal qatori. */
export interface AppLogRow {
  readonly level: AppLogLevel;
  readonly flag: AppLogFlag | null;
  readonly scope: string | null;
  readonly msg: string;
  readonly akkaunt: string | null;
  readonly mijoz: string | null;
  readonly payload: Record<string, unknown>;
}

/** Bazadan o'qilgan qator. `id` — `BIGSERIAL`, JSON'da satr sifatida. */
export interface AppLogItem extends AppLogRow {
  readonly id: string;
  readonly at: Date;
}

export interface AppLogQuery {
  /** Berilmasa `info` dan yuqorilari — ogohlantirish va xato — qaytadi. */
  readonly level?: 'error';
  /** Berilsa FAQAT shu bayroqli qatorlar, darajasidan qat'i nazar. */
  readonly flag?: AppLogFlag;
  /** Akkaunt, mijoz yoki matn bo'yicha qidiruv. */
  readonly q?: string;
  /** Shu id'dan eskiroqlarini olish (pastga varaqlash). */
  readonly beforeId?: string;
  readonly limit: number;
}

export interface IAppLogRepository {
  append(row: AppLogRow): Promise<AppLogItem>;
  /** Eng yangisi birinchi. */
  list(query: AppLogQuery): Promise<AppLogItem[]>;
  /**
   * Tozalash — o'chirilgan qatorlar soni qaytadi.
   *
   * `flag` MAJBURIY, chunki oqimlar har xil muddat bilan yashaydi:
   * Telegram izi tez o'sadi va tez o'chadi, odatdagi jurnal esa uzoq
   * turadi. Sukut bo'yicha qiymat qo'yilsa, chaqiruvchi qaysi oqimni
   * o'chirayotganini bilmay qolardi.
   */
  deleteOlderThan(days: number, flag: AppLogFlag | null): Promise<number>;
}
