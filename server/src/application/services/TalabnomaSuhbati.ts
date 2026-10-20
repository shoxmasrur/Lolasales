import type { ClientTelegramResolver } from '@/application/services/ClientTelegramResolver';
import { RESOLVE_REASONS } from '@/application/services/resolveSabablari';
import { isContactable, type Client } from '@/domain/entities/Client';
import type { Contract } from '@/domain/entities/Contract';
import type { Conversation } from '@/domain/entities/Conversation';
import { stageForOverdueDays } from '@/domain/policies/EscalationPolicy';
import type { IConversationRepository } from '@/domain/repositories/IConversationRepository';
import type { IEventBus } from '@/domain/services/support';
import { ConflictError } from '@/shared/errors';

export interface TalabnomaSuhbatiDeps {
  conversations: Pick<IConversationRepository, 'findByClientId' | 'create' | 'update'>;
  resolver: Pick<ClientTelegramResolver, 'resolve'>;
  events: Pick<IEventBus, 'publish'>;
}

/**
 * Talabnoma yuboriladigan suhbat. `TalabnomaXizmati` dan ajratilgan:
 * u yuborish tartibiga, bu esa Telegram profilini topishga javob beradi.
 *
 * Agent bu yerda chaqirilmaydi — suhbat birinchi xabarsiz ochiladi,
 * birinchi chiquvchi xabar talabnomaning o'zi bo'ladi.
 */
export class TalabnomaSuhbati {
  constructor(private readonly d: TalabnomaSuhbatiDeps) {}

  /**
   * Mijozning tayyor suhbati, bo'lmasa — agent xabarisiz yangisi
   * (`StartConversationUseCase` naqshi). Suhbat bor-u peer yo'q bo'lsa
   * (qidiruv hali bo'lmagan) o'sha yozuv to'ldiriladi — `(mijoz, akkaunt)`
   * bo'yicha tirik suhbat bitta bo'lishi kerak.
   */
  async tayyorla(client: Client, contract: Contract): Promise<Conversation> {
    const existing = await this.d.conversations.findByClientId(client.id);
    if (existing?.peerId && existing.telegramAccountId) return existing;

    if (!isContactable(client)) {
      throw new ConflictError("Mijoz bilan bog'lanish taqiqlangan yoki raqami yo'q", 'MIJOZGA_YOZIB_BOLMAYDI');
    }
    const resolved = await this.d.resolver.resolve(client);
    if (resolved.kind !== 'ok') {
      const sabab = resolved.kind === 'account_unavailable'
        ? resolved.reason
        : (RESOLVE_REASONS[resolved.kind] ?? 'Telegram profili aniqlanmadi');
      throw new ConflictError(`Telegram: ${sabab}`, 'TELEGRAM_TOPILMADI');
    }
    const stage = stageForOverdueDays(contract.daysOverdue);
    const conversation =
      existing ??
      (await this.d.conversations.create({ clientId: client.id, telegramAccountId: resolved.value.accountId, stage }));
    const prepared = await this.d.conversations.update(conversation.id, {
      telegramAccountId: resolved.value.accountId,
      peerId: resolved.value.peer.telegramUserId,
      peerAccessHash: resolved.value.peer.accessHash,
      stage,
    });
    if (!existing) this.d.events.publish({ type: 'conversation.created', conversationId: prepared.id });
    return prepared;
  }
}
