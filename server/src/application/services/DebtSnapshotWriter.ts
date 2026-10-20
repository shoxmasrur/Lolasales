import type { IStatsRepository } from '@/domain/repositories/ISupportRepositories';
import type { IClock } from '@/domain/services/support';
import { childLogger } from '@/shared/logger';

const log = childLogger('debt-snapshot');

/**
 * Har soatda yoziladi.
 *
 * Kun davomida qator ustiga qayta yoziladi, ya'ni oxirgi yozuv kunning
 * yakuniy holati bo'lib qoladi. Tez-tez yozishning ma'nosi shu: server
 * kun o'rtasida qayta ishga tushsa ham o'sha kun tushib qolmaydi.
 */
const TICK_MS = 60 * 60 * 1000;
/** Ishga tushishi bilan emas — avval migratsiya va ulanishlar joyiga tushsin. */
const FIRST_DELAY_MS = 30_000;

/**
 * Kunlik kechikkan to'lov holatini yozib boradi.
 *
 * NEGA KERAK: `contracts.debt_total` faqat hozirgi holat — CRM
 * sinxronizatsiyasi uni har safar ustiga yozadi. Tarix hech qayerda
 * saqlanmagani uchun "kechikkan to'lov oy davomida qanday kamaydi" degan savolga
 * javob berib bo'lmasdi.
 *
 * Bu xizmat o'tmishni tiklamaydi — faqat bugundan boshlab to'playdi.
 */
export class DebtSnapshotWriter {
  private timer: NodeJS.Timeout | null = null;
  private first: NodeJS.Timeout | null = null;

  constructor(
    private readonly stats: IStatsRepository,
    private readonly clock: IClock,
  ) {}

  start(): void {
    if (this.timer) return;
    this.first = setTimeout(() => void this.write(), FIRST_DELAY_MS);
    this.first.unref?.();
    this.timer = setInterval(() => void this.write(), TICK_MS);
    this.timer.unref?.();
    log.info('To\'lov suratlari yozuvchisi ishga tushdi');
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.first) clearTimeout(this.first);
    this.timer = null;
    this.first = null;
  }

  /** Xato YUTILADI: surat yozilmagani uchun xizmat to'xtamasligi kerak. */
  async write(): Promise<void> {
    try {
      await this.stats.writeDebtSnapshot(this.clock.todayIso());
    } catch (err) {
      log.warn({ err }, 'To\'lov surati yozilmadi');
    }
  }
}
