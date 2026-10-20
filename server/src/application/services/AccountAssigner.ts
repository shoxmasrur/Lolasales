import { canAcceptClients } from '@/domain/entities/TelegramAccount';
import type { IClientRepository } from '@/domain/repositories/IClientRepository';
import type { IConversationRepository } from '@/domain/repositories/IConversationRepository';
import type { ITelegramAccountRepository } from '@/domain/repositories/ITelegramAccountRepository';
import type { IAuditRepository } from '@/domain/repositories/ISupportRepositories';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { childLogger } from '@/shared/logger';

const log = childLogger('assigner');
const BATCH = 2000;

export interface AssignmentSummary {
  readonly assigned: number;
  /** Akkauntsiz qolgan va tiklangan suhbatlar soni. */
  readonly restored: number;
  readonly perAccount: Array<{ accountId: string; label: string; count: number }>;
  readonly skipped: number;
}

/**
 * Mijozlarni Telegram akkauntlarga teng taqsimlaydi.
 *
 * Asosiy qoida: bitta mijozga — bitta akkaunt, BUTUN SUHBAT DAVOMIDA.
 * Mijoz uchun bu bitta odam bilan yozishayotgandek ko'rinishi kerak;
 * akkaunt almashsa, u boshqa raqamdan xabar kelganini ko'radi.
 *
 * Shuning uchun biriktirish faqat quyidagi hollarda o'zgaradi:
 *   • akkaunt tizimdan o'chirilsa,
 *   • akkaunt butunlay bloklansa va operator qayta taqsimlashni tanlasa.
 */
export class AccountAssigner {
  constructor(
    private readonly clients: IClientRepository,
    private readonly accounts: ITelegramAccountRepository,
    private readonly audit: IAuditRepository,
    private readonly conversations: IConversationRepository,
  ) {}

  /** Biriktirilmagan mijozlarni akkauntlar bo'yicha teng bo'ladi. */
  async assignUnassigned(actor = 'system'): Promise<AssignmentSummary> {
    const all = await this.accounts.list();
    const usable = all.filter(canAcceptClients);

    if (!usable.length) {
      throw new ValidationError(
        'Mijozlarni biriktirish uchun yaroqli Telegram akkaunt yo\'q. ' +
          'Avval akkaunt qo\'shing va yoqing.',
      );
    }

    const pending = await this.clients.findUnassigned(BATCH);
    if (!pending.length) {
      // Mijozlar allaqachon biriktirilgan bo'lsa ham, suhbatlar akkauntsiz
      // qolgan bo'lishi mumkin — tiklashni baribir bajaramiz.
      const restored = await this.conversations.restoreOrphanedAccounts();
      return { assigned: 0, restored, skipped: 0, perAccount: await this.distribution() };
    }

    // Hozirgi yukni hisobga olamiz — yangi akkaunt qo'shilganda
    // unga ko'proq mijoz tushadi va taqsimot tenglashadi.
    const counts = new Map<string, number>();
    for (const account of usable) counts.set(account.id, 0);
    for (const row of await this.clients.countByAccount()) {
      if (counts.has(row.accountId)) counts.set(row.accountId, row.count);
    }

    let assigned = 0;
    for (const clientId of pending) {
      // Har safar eng kam yuklangan akkaunt.
      const target = [...counts.entries()].sort((a, b) => a[1] - b[1])[0];
      if (!target) break;

      await this.clients.assignAccount(clientId, target[0]);
      counts.set(target[0], target[1] + 1);
      assigned += 1;
    }

    await this.audit.record({
      actor,
      action: 'clients.assigned_to_accounts',
      entity: 'clients',
      payload: { assigned, accounts: usable.length },
    });

    // Mijoz yangi akkauntga o'tdi — uning OCHIQ SUHBATI ham o'tishi kerak.
    //
    // Akkaunt o'chirilganda suhbatlardagi `telegram_account_id` bo'shatiladi
    // va shundan keyin suhbat butunlay ishlamay qolardi: agent ham,
    // operator ham "Telegram akkaunt tanlanmagan" xatosiga urilardi va
    // dashboarddan buni tuzatishning iloji yo'q edi.
    const restored = await this.conversations.restoreOrphanedAccounts();
    if (restored) log.info({ restored }, 'Akkauntsiz qolgan suhbatlar tiklandi');

    log.info({ assigned, accounts: usable.length }, 'Mijozlar akkauntlarga taqsimlandi');

    return {
      assigned,
      restored,
      skipped: Math.max(0, pending.length - assigned),
      perAccount: await this.distribution(),
    };
  }

  /**
   * Bitta mijozni akkauntga biriktiradi (hali biriktirilmagan bo'lsa).
   * Suhbat boshlanayotganda chaqiriladi.
   */
  async ensureAssigned(clientId: string): Promise<string | null> {
    const client = await this.clients.findById(clientId);
    if (!client) throw new NotFoundError('Mijoz', clientId);
    if (client.telegramAccountId) return client.telegramAccountId;

    const all = await this.accounts.list();
    const usable = all.filter(canAcceptClients);
    if (!usable.length) return null;

    const counts = new Map<string, number>(usable.map((a) => [a.id, 0]));
    for (const row of await this.clients.countByAccount()) {
      if (counts.has(row.accountId)) counts.set(row.accountId, row.count);
    }

    const target = [...counts.entries()].sort((a, b) => a[1] - b[1])[0];
    if (!target) return null;

    await this.clients.assignAccount(clientId, target[0]);
    log.info({ clientId, accountId: target[0] }, 'Mijoz akkauntga biriktirildi');
    return target[0];
  }

  /** Akkaunt o'chirilganda/bloklanganda mijozlarini boshqalarga o'tkazish. */
  async reassignFrom(accountId: string, actor: string): Promise<AssignmentSummary> {
    const released = await this.clients.releaseAccount(accountId);
    log.warn({ accountId, released }, 'Akkaunt mijozlari bo\'shatildi');

    await this.audit.record({
      actor,
      action: 'clients.released_from_account',
      entity: 'telegram_account',
      entityId: accountId,
      payload: { released },
    });

    return this.assignUnassigned(actor);
  }

  async distribution(): Promise<Array<{ accountId: string; label: string; count: number }>> {
    const [accounts, counts] = await Promise.all([
      this.accounts.list(),
      this.clients.countByAccount(),
    ]);
    const byId = new Map(counts.map((c) => [c.accountId, c.count]));
    return accounts.map((a) => ({ accountId: a.id, label: a.label, count: byId.get(a.id) ?? 0 }));
  }
}
