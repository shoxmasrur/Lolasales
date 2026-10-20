import type { ContractSyncService } from '@/application/services/ContractSyncService';
import type {
  IAuditRepository,
  ISettingsRepository,
} from '@/domain/repositories/ISupportRepositories';
import type { IClock } from '@/domain/services/support';
import { config } from '@/shared/config';
import { childLogger } from '@/shared/logger';

const log = childLogger('contract-sync-scheduler');

/** Soatiga bir marta tekshiramiz — belgilangan soat kelganini bilish uchun. */
const CHECK_INTERVAL_MS = 60 * 60 * 1000;

/**
 * `settings` jadvalidagi kalit. Alohida jadval ochilmaydi — bu bitta
 * yozuv va u faqat dashboardda ko'rsatish uchun kerak.
 */
const STATUS_KEY = 'contracts.lastSync';

export interface ContractSyncStatus {
  /** ISO 8601 */
  readonly at: string;
  readonly durationSec: number;
  readonly ok: number;
  readonly notFound: number;
  readonly failed: number;
}

/**
 * Kechasi bir marta hamma shartnomani yangilaydi.
 *
 * Nega kechasi: 1700 shartnoma ≈ 15 daqiqa oladi va ularning serveriga
 * bir tekis yuk beradi. Kunduzgi yangilik esa mijozga yozishdan oldingi
 * nuqtali tekshiruv orqali keladi.
 */
export class ContractSyncScheduler {
  private timer: NodeJS.Timeout | null = null;
  private busy = false;
  /** Bir kunda ikki marta yurmasin. */
  private lastRunDate: string | null = null;

  constructor(
    private readonly sync: ContractSyncService,
    private readonly audit: IAuditRepository,
    private readonly clock: IClock,
    private readonly settingsRepo: ISettingsRepository,
  ) {}

  /** Oxirgi to'liq sinxronizatsiya natijasi (hech qachon yurmagan bo'lsa null). */
  lastStatus(): Promise<ContractSyncStatus | null> {
    return this.settingsRepo.get<ContractSyncStatus>(STATUS_KEY);
  }

  /** Hozir sinxronizatsiya ketyaptimi — tugma holatini ko'rsatish uchun. */
  isRunning(): boolean {
    return this.busy;
  }

  start(): void {
    if (this.timer) return;
    if (!config.CONTRACTS_SYNC_ENABLED) {
      log.info("Shartnomalar sinxronizatsiyasi o'chirilgan (CONTRACTS_SYNC_ENABLED=false)");
      return;
    }
    this.timer = setInterval(() => void this.tick(), CHECK_INTERVAL_MS);
    void this.tick();
    log.info({ hour: config.CONTRACTS_SYNC_HOUR }, 'Shartnomalar sinxronizatsiyasi rejalashtirildi');
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick(): Promise<void> {
    if (this.busy) return;

    const today = this.clock.todayIso();
    if (this.lastRunDate === today) return;

    const hour = Number(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: config.TIMEZONE,
        hour: '2-digit',
        hour12: false,
      }).format(this.clock.now()),
    );
    if (hour !== config.CONTRACTS_SYNC_HOUR) return;

    this.lastRunDate = today;
    await this.runNow();
  }

  async runNow(): Promise<{ ok: number; notFound: number; failed: number }> {
    if (this.busy) return { ok: 0, notFound: 0, failed: 0 };
    this.busy = true;
    const started = Date.now();

    try {
      const stats = await this.sync.syncAll(config.CONTRACTS_SYNC_DELAY_MS);

      const status: ContractSyncStatus = {
        at: this.clock.now().toISOString(),
        durationSec: Math.round((Date.now() - started) / 1000),
        ...stats,
      };
      await this.settingsRepo.set(STATUS_KEY, status);

      await this.audit.record({
        actor: 'system',
        action: 'contracts.synced',
        entity: 'contract',
        entityId: null,
        payload: { ...stats, durationSec: Math.round((Date.now() - started) / 1000) },
      });
      return stats;
    } catch (err) {
      log.error({ err }, "To'liq sinxronizatsiyada xato");
      return { ok: 0, notFound: 0, failed: 0 };
    } finally {
      this.busy = false;
    }
  }
}
