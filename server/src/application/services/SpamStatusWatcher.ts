import type { TelegramAccount } from '@/domain/entities/TelegramAccount';
import type { ITelegramAccountRepository } from '@/domain/repositories/ITelegramAccountRepository';
import type { IAuditRepository } from '@/domain/repositories/ISupportRepositories';
import type { ITelegramGateway } from '@/domain/services/ITelegramGateway';
import type { IEventBus } from '@/domain/services/support';
import { config } from '@/shared/config';
import { sleep } from '@/shared/datetime';
import { childLogger } from '@/shared/logger';

const log = childLogger('spam-watch');

/** Har 6 soatda tekshiriladi — @SpamBot ni tez-tez bezovta qilish o'zi shubhali. */
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const FIRST_CHECK_DELAY_MS = 60_000;
/** Akkauntlar orasidagi pauza — bir vaqtda hammasidan so'ramaslik uchun. */
const BETWEEN_ACCOUNTS_MS = 5_000;

/**
 * Akkauntlarni @SpamBot orqali davriy tekshiradi.
 *
 * Cheklangan akkaunt notanish odamlarga yoza olmaydi va urinish faqat
 * cheklovni uzaytiradi — shuning uchun `canSend()` uni avtomatik chetlab o'tadi.
 */
export class SpamStatusWatcher {
  private timer: NodeJS.Timeout | null = null;
  private firstRun: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly accounts: ITelegramAccountRepository,
    private readonly gateway: ITelegramGateway,
    private readonly audit: IAuditRepository,
    private readonly events: IEventBus,
  ) {}

  start(): void {
    if (this.timer) return;
    if (!config.SPAM_WATCH_ENABLED) {
      log.info("Avtomatik spam tekshiruvi o'chirilgan (SPAM_WATCH_ENABLED=false) — qo'lda tekshiriladi");
      return;
    }
    // Server ko'tarilishi bilan emas — akkauntlar ulanib olsin.
    this.firstRun = setTimeout(() => void this.checkAll(), FIRST_CHECK_DELAY_MS);
    this.timer = setInterval(() => void this.checkAll(), CHECK_INTERVAL_MS);
    log.info('Spam holati kuzatuvchisi ishga tushdi');
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.firstRun) clearTimeout(this.firstRun);
    this.timer = null;
    this.firstRun = null;
  }

  async checkAll(): Promise<void> {
    if (this.running) return;
    this.running = true;

    try {
      const connected = await this.accounts.listConnected();
      for (const account of connected) {
        await this.checkOne(account).catch((err) =>
          log.error({ account: account.label, err }, 'Spam tekshiruvi xatosi'),
        );
        await sleep(BETWEEN_ACCOUNTS_MS);
      }
    } finally {
      this.running = false;
    }
  }

  /** Bitta akkauntni tekshiradi va holat o'zgarsa auditga yozadi. */
  async checkOne(account: TelegramAccount): Promise<TelegramAccount> {
    const result = await this.gateway.checkSpamStatus(account.id);

    const updated = await this.accounts.setSpamStatus(account.id, result.status, {
      message: result.message,
      until: result.until,
    });

    if (result.status !== account.spamStatus) {
      log.warn(
        { account: account.label, oldStatus: account.spamStatus, newStatus: result.status },
        'Akkauntning spam holati o\'zgardi',
      );

      await this.audit.record({
        actor: 'system',
        action: `telegram.spam_${result.status}`,
        entity: 'telegram_account',
        entityId: account.id,
        payload: { label: account.label, message: result.message, until: result.until },
      });

      this.events.publish({ type: 'telegram.status', accountId: account.id, status: result.status });
    }

    return updated;
  }
}
