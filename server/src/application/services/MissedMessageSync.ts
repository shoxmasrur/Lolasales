import type { ITelegramAccountRepository } from '@/domain/repositories/ITelegramAccountRepository';
import type { IAuditRepository } from '@/domain/repositories/ISupportRepositories';
import type { ITelegramGateway } from '@/domain/services/ITelegramGateway';
import type { IClock } from '@/domain/services/support';
import type { HandleIncomingMessageUseCase } from '@/application/usecases/messaging/HandleIncomingMessageUseCase';
import { childLogger } from '@/shared/logger';

const log = childLogger('missed-sync');

/**
 * Uzilishdan keyin necha soat orqaga qaraladi.
 *
 * 24 soat proksi o'chib-yonishi va server qayta ishga tushishini qoplaydi.
 * Undan uzoq oyna foydasiz: xabarlar `telegram_msg_id` bo'yicha baribir
 * dublikat bo'lib tashlanadi, lekin har bir xabar uchun bittadan baza
 * so'rovi ketadi.
 */
export const DEFAULT_SYNC_HOURS = 24;
/** Qo'lda tiklashda ruxsat etilgan eng katta oyna. */
export const MAX_SYNC_HOURS = 168;

export interface SyncResult {
  /** Telegramdan olingan kiruvchi xabarlar. */
  readonly fetched: number;
  /** Shundan bazada bo'lmagani — ya'ni haqiqatan tiklangani. */
  readonly imported: number;
  readonly failed: number;
}

/**
 * Uzilish paytida o'tkazib yuborilgan xabarlarni tiklaydi.
 *
 * MUAMMO: proksi uzilganda yoki akkaunt qayta ulanayotganda Telegramga
 * kelgan xabarlar jonli oqimga TUSHMAYDI va hech qayerda tiklanmasdi —
 * suhbatlarda ular umuman ko'rinmasdi. Ular orasida "pul to'ladim" va
 * chek rasmlari bo'ladi, ya'ni eng qimmat xabarlar aynan shu paytda
 * yo'qolardi (prodda 2026-08-10 da ko'rindi).
 *
 * Tiklangan xabar jonli oqimdagi bilan BIR XIL yo'ldan o'tadi: agent javob
 * yozadi, chek bo'lsa to'lov tekshiruvi ochiladi, va'da yozib olinadi.
 * Takroriy ishlov xavfi yo'q — `HandleIncomingMessageUseCase` xabarni
 * `telegram_msg_id` bo'yicha taniydi va ikkinchi marta ishlamaydi.
 */
export class MissedMessageSync {
  constructor(
    private readonly gateway: ITelegramGateway,
    private readonly accounts: ITelegramAccountRepository,
    private readonly handleIncoming: HandleIncomingMessageUseCase,
    private readonly audit: IAuditRepository,
    private readonly clock: IClock,
  ) {}

  /** Bitta akkaunt bo'yicha tiklash. */
  async syncAccount(accountId: string, hours = DEFAULT_SYNC_HOURS): Promise<SyncResult> {
    const window = Math.min(Math.max(hours, 1), MAX_SYNC_HOURS);
    const since = new Date(this.clock.now().getTime() - window * 60 * 60 * 1000);

    const missed = await this.gateway.fetchMissed(accountId, { since });

    let imported = 0;
    let failed = 0;

    for (const message of missed) {
      try {
        // Dublikat tekshiruvi use case ichida — u yagona joyda turishi
        // kerak, aks holda ikkita mantiq bir-biridan ajrab ketardi.
        if ((await this.handleIncoming.execute(message)) === 'imported') imported += 1;
      } catch (err) {
        failed += 1;
        // Bitta xabar tushmasa qolganlari tiklanaverishi kerak — masalan
        // fayli o'chirilgan xabar yuklab olishda yiqiladi.
        log.warn({ accountId, telegramMsgId: message.telegramMsgId, err }, 'Xabar tiklanmadi');
      }
    }

    if (imported > 0 || failed > 0) {
      const account = await this.accounts.findById(accountId);
      await this.audit.record({
        actor: 'system',
        action: 'telegram.missed_synced',
        entity: 'telegram_account',
        entityId: accountId,
        payload: { akkaunt: account?.label ?? accountId, fetched: missed.length, imported, failed },
      });
      log.info({ accountId, fetched: missed.length, imported, failed }, 'O\'tkazib yuborilgan xabarlar tiklandi');
    }

    return { fetched: missed.length, imported, failed };
  }

  /**
   * Akkaunt qayta ulangach chaqiriladi.
   *
   * Xato YUTILADI: tiklash qo'shimcha imkoniyat, u yiqilgani uchun qayta
   * ulanish muvaffaqiyatsiz deb hisoblanmasligi kerak.
   */
  async afterReconnect(accountId: string): Promise<void> {
    try {
      await this.syncAccount(accountId);
    } catch (err) {
      log.warn({ accountId, err }, 'Qayta ulanishdan keyin tiklab bo\'lmadi');
    }
  }
}
