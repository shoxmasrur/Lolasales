import type { RuntimeSettings } from '@/application/services/RuntimeSettings';
import type { MessageDispatcher } from '@/application/services/MessageDispatcher';
import type { XaridXizmati } from '@/application/services/XaridXizmati';
import type { ICourseRepository } from '@/domain/repositories/ICourseRepository';
import type { IConversationRepository } from '@/domain/repositories/IConversationRepository';
import type { IAuditRepository } from '@/domain/repositories/ISupportRepositories';
import type { IEventBus } from '@/domain/services/support';
import { kartaTayyorligi, kartaXabari } from '@/domain/services/karta';
import { NotFoundError } from '@/shared/errors';

const SABAB_MATNI = {
  kurs_yoq: "Karta yuborib bo'lmadi: mijozning kursi aniqlanmagan",
  karta_yoq: "Karta yuborib bo'lmadi: Sozlamalarda faol karta yo'q",
  bolib_tolash_yoq: "Karta yuborib bo'lmadi: bu kursda bo'lib to'lash yo'q",
} as const;

/**
 * To'lov kartasini tizim yuboradi (LLM raqam yozmaydi): Sozlamalardagi faol karta + xaridning summasi.
 * Yuborib bo'lmasa suhbat menejerga o'tadi.
 */
export class KartaYuboruvchi {
  constructor(
    private readonly settings: RuntimeSettings,
    private readonly courses: ICourseRepository,
    private readonly xarid: XaridXizmati,
    private readonly conversations: IConversationRepository,
    private readonly dispatcher: MessageDispatcher,
    private readonly audit: IAuditRepository,
    private readonly events: IEventBus,
  ) {}

  async yubor(conversationId: string, clientId: string): Promise<{ sent: boolean; reason?: string }> {
    const conversation = await this.conversations.findById(conversationId);
    if (!conversation) throw new NotFoundError('Suhbat topilmadi');
    const purchase = await this.xarid.faolXarid(clientId);
    const [course, s] = await Promise.all([
      purchase.courseId ? this.courses.findById(purchase.courseId) : Promise.resolve(null),
      this.settings.get(),
    ]);

    const tayyor = kartaTayyorligi({ cards: s.paymentCards, course, purchase });
    if (!tayyor.ok) {
      await this.conversations.update(conversationId, { needsHuman: true, humanReason: SABAB_MATNI[tayyor.reason] });
      this.events.publish({ type: 'conversation.updated', conversationId });
      return { sent: false, reason: tayyor.reason };
    }

    await this.dispatcher.send({
      conversation,
      body: kartaXabari(tayyor.card, tayyor.amount),
      author: 'agent',
      meta: { kind: 'karta' },
    });
    await this.xarid.bosqich(clientId, 'karta_yuborildi', 'tizim');
    await this.audit.record({
      actor: 'tizim',
      action: 'card.sent',
      entity: 'purchase',
      entityId: purchase.id,
      payload: { clientId, conversationId, cardId: tayyor.card.id, last4: tayyor.card.number.slice(-4), amount: tayyor.amount },
    });
    return { sent: true };
  }
}
