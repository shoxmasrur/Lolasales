import type { AccountRestriction, TelegramAccount } from '@/domain/entities/TelegramAccount';
import { activeRestrictions } from '@/domain/entities/TelegramAccount';
import type { IClientRepository } from '@/domain/repositories/IClientRepository';
import type { ITelegramAccountRepository } from '@/domain/repositories/ITelegramAccountRepository';
import type { AccountProbe, ITelegramGateway, SpamCheckResult } from '@/domain/services/ITelegramGateway';
import type { SpamStatusWatcher } from '@/application/services/SpamStatusWatcher';
import { sleep } from '@/shared/datetime';
import { AppError } from '@/shared/errors';
import { childLogger } from '@/shared/logger';

const log = childLogger('account-check');

/**
 * Bir akkauntni ikki tekshiruv orasida majburiy pauza.
 *
 * Tekshiruv @SpamBot ga xabar yuboradi — ya'ni Telegram uchun bu ham
 * harakat. Operator tugmani ketma-ket bosaversa, tekshiruvning o'zi
 * akkauntni cheklashga olib kelishi mumkin.
 */
const COOLDOWN_MS = 2 * 60 * 1000;

/** Ommaviy tekshiruvda akkauntlar orasidagi pauza. */
const BETWEEN_ACCOUNTS_MS = 5_000;

export interface AccountCheckReport {
  readonly accountId: string;
  readonly checkedAt: Date;
  readonly probe: AccountProbe;
  readonly spam: SpamCheckResult;
  readonly restrictions: readonly AccountRestriction[];
  /** Shu akkauntga biriktirilgan, Telegramda topilmagan raqamlar soni. */
  readonly notFoundLookups: number;
}

export interface BulkCheckProgress {
  readonly running: boolean;
  readonly done: number;
  readonly total: number;
  readonly currentLabel: string | null;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
}

/**
 * Akkaunt cheklovlarini uchta manbadan yig'ib, bitta hisobot beradi.
 *
 * NEGA UCHTA MANBA KERAK — Telegram cheklovlarni bitta joydan bermaydi:
 *
 *   • Jonli probe   — sessiya tirikmi, akkaunt o'chirilganmi.
 *   • @SpamBot      — PEER_FLOOD / "limited until <sana>". Ochilish
 *                     sanasining YAGONA ishonchli manbai.
 *   • Bazadagi holat — oldingi HAQIQIY urinishlarda tushgan FLOOD_WAIT
 *                     va PEER_FLOOD, ularning boshlanish vaqti bilan.
 *
 * Probe FLOOD_WAIT ni oldindan ocha olmaydi: Telegram uni metod bo'yicha
 * beradi, ya'ni `sendMessage` cheklangan bo'lsa ham bu yerdagi zararsiz
 * so'rov o'tib ketaveradi. Shuning uchun bazadagi yozuv tashlab
 * yuborilmaydi — u ko'pincha yagona dalil.
 */
export class AccountChecker {
  private readonly lastCheck = new Map<string, number>();
  private progress: BulkCheckProgress = {
    running: false,
    done: 0,
    total: 0,
    currentLabel: null,
    startedAt: null,
    finishedAt: null,
  };

  constructor(
    private readonly accounts: ITelegramAccountRepository,
    private readonly clients: IClientRepository,
    private readonly gateway: ITelegramGateway,
    private readonly spamWatcher: SpamStatusWatcher,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /**
   * Bitta akkauntni tekshiradi.
   *
   * @param force Cooldownni chetlab o'tish (ommaviy tekshiruv uchun —
   *        u o'zi pauza bilan ishlaydi).
   */
  async check(accountId: string, options?: { force?: boolean }): Promise<AccountCheckReport> {
    const account = await this.requireAccount(accountId);

    if (!options?.force) {
      const last = this.lastCheck.get(accountId);
      const waitMs = last === undefined ? 0 : COOLDOWN_MS - (Date.now() - last);
      if (waitMs > 0) {
        throw new AppError(
          `Bu akkaunt hozirgina tekshirildi — ${Math.ceil(waitMs / 1000)} soniyadan keyin qayta urinib ko'ring`,
          429,
          'CHECK_COOLDOWN',
        );
      }
    }
    this.lastCheck.set(accountId, Date.now());

    const probe = await this.gateway.probeAccount(accountId);

    // Sessiya o'lgan bo'lsa @SpamBot ga yozib bo'lmaydi — urinish faqat
    // vaqt yo'qotadi va jurnalni keraksiz xato bilan to'ldiradi.
    const spam: SpamCheckResult =
      probe.ok || probe.reason === 'flood_wait'
        ? await this.checkSpam(account)
        : { status: 'check_failed', message: probe.message, until: null };

    // @SpamBot toza desa, PEER_FLOOD belgisini olib tashlaymiz: cheklov
    // ochilganini aynan shu javob tasdiqlaydi.
    if (spam.status === 'clean') await this.accounts.clearPeerFlood(accountId);

    // Holat yangilangandan KEYIN o'qiladi — aks holda hisobot
    // tekshiruvdan oldingi eskirgan qiymatlarni ko'rsatardi.
    const fresh = await this.requireAccount(accountId);

    return {
      accountId,
      checkedAt: this.now(),
      probe,
      spam,
      restrictions: this.collect(fresh, probe),
      notFoundLookups: await this.countNotFound(accountId),
    };
  }

  /** Ommaviy tekshiruv holati (sahifadagi progress uchun). */
  bulkProgress(): BulkCheckProgress {
    return this.progress;
  }

  /**
   * Hamma yoqilgan akkauntni ketma-ket tekshiradi.
   *
   * Fon ishi: javob darhol qaytadi, sahifa holatni `bulkProgress()`
   * orqali so'rab turadi. Ketma-ket va pauza bilan — o'nta akkauntdan
   * bir vaqtda @SpamBot ga xabar ketishi o'zi shubhali naqsh.
   */
  startBulk(): BulkCheckProgress {
    if (this.progress.running) return this.progress;

    this.progress = {
      running: true,
      done: 0,
      total: 0,
      currentLabel: null,
      startedAt: this.now().toISOString(),
      finishedAt: null,
    };

    void this.runBulk();
    return this.progress;
  }

  private async runBulk(): Promise<void> {
    try {
      const all = await this.accounts.list();
      const targets = all.filter((a) => a.isEnabled);
      this.progress = { ...this.progress, total: targets.length };

      for (const account of targets) {
        this.progress = { ...this.progress, currentLabel: account.label };
        await this.check(account.id, { force: true }).catch((err) =>
          log.error({ account: account.label, err }, 'Akkauntni tekshirishda xato'),
        );
        this.progress = { ...this.progress, done: this.progress.done + 1 };
        await sleep(BETWEEN_ACCOUNTS_MS);
      }
    } finally {
      this.progress = {
        ...this.progress,
        running: false,
        currentLabel: null,
        finishedAt: this.now().toISOString(),
      };
    }
  }

  /**
   * Bazadagi faol cheklovlar + faqat jonli probe ocha oladigan holatlar.
   *
   * Bazadagi qism `activeRestrictions()` dan olinadi — akkaunt kartasi
   * tekshiruvsiz ham xuddi shu ro'yxatni ko'rsatadi, ya'ni ikki joyda
   * ikki xil javob chiqmaydi.
   */
  private collect(account: TelegramAccount, probe: AccountProbe): AccountRestriction[] {
    const out = activeRestrictions(account, this.now());

    // Sessiya o'lgani faqat jonli so'rovda bilinadi — bazada bunday
    // "cheklov" yo'q, akkaunt shunchaki `logged_out` bo'lib qoladi.
    if (!probe.ok && (probe.reason === 'session_dead' || probe.reason === 'not_connected')) {
      out.push({
        kind: probe.reason,
        since: null,
        until: null,
        source: 'mtproto',
        message: probe.message,
      });
    }

    return out;
  }

  private async checkSpam(account: TelegramAccount): Promise<SpamCheckResult> {
    try {
      const updated = await this.spamWatcher.checkOne(account);
      return {
        status: updated.spamStatus === 'unknown' ? 'check_failed' : updated.spamStatus,
        message: updated.spamMessage,
        until: updated.spamUntil,
      };
    } catch (err) {
      // @SpamBot javob bermasligi TEKSHIRUVNI yiqitmasligi kerak:
      // probe natijasi va bazadagi cheklovlar baribir ko'rsatiladi.
      log.warn({ account: account.label, err }, 'SpamBot tekshiruvi o\'tmadi');
      return {
        status: 'check_failed',
        message: err instanceof Error ? err.message : String(err),
        until: null,
      };
    }
  }

  private async countNotFound(accountId: string): Promise<number> {
    const rows = await this.clients.countNotFoundByAccount();
    return rows.find((r) => r.accountId === accountId)?.count ?? 0;
  }

  private async requireAccount(accountId: string): Promise<TelegramAccount> {
    const account = await this.accounts.findById(accountId);
    if (!account) throw new AppError('Telegram akkaunt topilmadi', 404, 'NOT_FOUND');
    return account;
  }
}
