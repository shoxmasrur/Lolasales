import type { AppLogFlag, IAppLogRepository } from '@/domain/repositories/IAppLogRepository';
import { childLogger } from '@/shared/logger';

const log = childLogger('app-log-cleaner');

/** Jurnal shuncha kun saqlanadi. */
export const RETENTION_DAYS = 14;

/**
 * Telegram audit izi shuncha kun saqlanadi.
 *
 * NEGA 14 EMAS, 3: bu iz odatdagi jurnaldan o'nlab barobar tez o'sadi —
 * bitta xabar yuborish bir necha chaqiruv, har chaqiruv ikki qator.
 * Nosozlikni tekshirish uchun 3 kun deyarli har doim yetarli, jadval esa
 * nazoratda qoladi.
 */
export const TELEGRAM_RETENTION_DAYS = 3;

/** Sutkada bir marta yetarli — jadval sekin o'sadi. */
const INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Eski jurnal qatorlarini o'chiradi.
 *
 * 14 kun: takrorlanadigan muammoni sezish uchun yetarli, jadval esa
 * kichik qoladi. To'liq tarix baribir journald'da.
 */
export class AppLogCleaner {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly appLog: IAppLogRepository,
  ) {}

  start(): void {
    if (this.timer) return;
    // Ilova ko'tarilganda bir marta, keyin sutkada bir marta.
    void this.run();
    this.timer = setInterval(() => void this.run(), INTERVAL_MS);
    // Tozalash tugagunicha ilova yopilishini ushlab turmasin.
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async run(): Promise<void> {
    // Ikki oqim — ikki muddat. Ular ALOHIDA bajariladi: baza birinchi
    // so'rovda yiqilsa ham ikkinchisi baribir ketishi kerak, aks holda
    // bitta xato tufayli Telegram izi abadiy tozalanmay qolardi.
    await this.tozala(null, RETENTION_DAYS);
    await this.tozala('telegram', TELEGRAM_RETENTION_DAYS);
  }

  private async tozala(flag: AppLogFlag | null, days: number): Promise<void> {
    try {
      const deleted = await this.appLog.deleteOlderThan(days, flag);
      // `flag` KALITI TAQIQLANGAN (logEntry.ts, TELEGRAM_FLAG izohi): u
      // yozuv o'zi qaysi oqimga tegishli ekanini bildiradi, "qaysi oqim
      // tozalandi" degani emas. Shu sabab `oqim` deb yoziladi.
      if (deleted) log.info({ deleted, days, oqim: flag }, 'Eski jurnal qatorlari tozalandi');
    } catch (err) {
      log.warn({ err, oqim: flag }, 'Jurnalni tozalab bo\'lmadi');
    }
  }
}
