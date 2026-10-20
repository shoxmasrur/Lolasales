import type { Message } from '@/domain/entities/Message';
import type { IConversationRepository } from '@/domain/repositories/IConversationRepository';
import type { IMessageRepository } from '@/domain/repositories/IMessageRepository';
import type { IAuditRepository } from '@/domain/repositories/ISupportRepositories';
import type { MessageDispatcher } from '@/application/services/MessageDispatcher';
import type { IClock } from '@/domain/services/support';
import { AppError } from '@/shared/errors';
import { chiquvchiXabarniTop } from '@/application/usecases/messaging/chiquvchiXabarniTop';

/**
 * Telegramning chiquvchi xabarni tahrirlash oynasi.
 *
 * Bu bizning qoidamiz emas, Telegram cheklovi. Serverda tekshiriladi,
 * chunki UI tugmani yashirsa ham so'rov to'g'ridan-to'g'ri kelishi mumkin.
 */
export const EDIT_WINDOW_MS = 48 * 60 * 60 * 1000;

export interface EditMessageInput {
  conversationId: string;
  messageId: string;
  body: string;
  userId: string;
  userEmail: string;
}

/** Operator yuborilgan xabar matnini tuzatadi. */
export class EditMessageUseCase {
  constructor(
    private readonly conversations: IConversationRepository,
    private readonly messages: IMessageRepository,
    private readonly dispatcher: MessageDispatcher,
    private readonly audit: IAuditRepository,
    private readonly clock: IClock,
  ) {}

  async execute(input: EditMessageInput): Promise<Message> {
    const { conversation, message } = await chiquvchiXabarniTop(
      this.conversations,
      this.messages,
      input,
      'Mijozning xabarini tahrirlab bo\'lmaydi',
    );

    if (message.revokedAt) {
      throw new AppError('O\'chirilgan xabarni tahrirlab bo\'lmaydi', 409, 'MESSAGE_REVOKED');
    }

    // Rasm yoki fayl izohini o'zgartirish bu ishning qamroviga kirmaydi.
    if (message.media) {
      throw new AppError('Rasm va fayl xabarlarini tahrirlab bo\'lmaydi', 400, 'MEDIA_NOT_EDITABLE');
    }

    // Telegramga ketmagan xabarda (queued, failed) oyna tushunchasi yo'q.
    // `telegramMsgId !== null` shart sifatida ortiqcha: `MessageDispatcher`
    // ikkalasini FAQAT bir xil `updateStatus(..., 'sent', { telegramMsgId,
    // sentAt })` chaqiruvida, birga yozadi — muvaffaqiyatsiz yo'l esa
    // ikkalasini ham yozmaydi. Ya'ni `sentAt` borligi allaqachon xabar
    // Telegramga yetganini bildiradi. Web tarafda `MessageBubble.tsx`dagi
    // `tahrirlasaBoladi` aynan shu sababdan faqat `sentAt`ni tekshiradi —
    // bu yerning ko'zgusi.
    if (message.telegramMsgId !== null && message.sentAt) {
      const yosh = this.clock.now().getTime() - message.sentAt.getTime();
      if (yosh > EDIT_WINDOW_MS) {
        throw new AppError(
          '48 soat o\'tgan. Tahrirlab bo\'lmaydi — o\'chirib, yangisini yozing.',
          409,
          'EDIT_WINDOW_CLOSED',
        );
      }
    }

    const updated = await this.dispatcher.editText({
      conversation,
      message,
      body: input.body,
    });

    await this.audit.record({
      actor: input.userEmail,
      action: 'message.edited',
      entity: 'conversation',
      entityId: conversation.id,
      // Eski matn ham yoziladi: `original_body` da faqat ENG BIRINCHI
      // versiya qoladi, oraliq tahrirlar esa shu yerdan tiklanadi.
      payload: { messageId: message.id, oldingi: message.body, yangi: input.body },
    });

    return updated;
  }
}
