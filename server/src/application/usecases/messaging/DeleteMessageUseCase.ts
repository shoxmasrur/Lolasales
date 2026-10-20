import type { Message } from '@/domain/entities/Message';
import type { IConversationRepository } from '@/domain/repositories/IConversationRepository';
import type { IMessageRepository } from '@/domain/repositories/IMessageRepository';
import type { IAuditRepository } from '@/domain/repositories/ISupportRepositories';
import type { MessageDispatcher } from '@/application/services/MessageDispatcher';
import type { IClock } from '@/domain/services/support';
import { chiquvchiXabarniTop } from '@/application/usecases/messaging/chiquvchiXabarniTop';

export interface DeleteMessageInput {
  conversationId: string;
  messageId: string;
  userId: string;
  userEmail: string;
}

/**
 * Operator yuborilgan xabarni mijozning Telegramidan olib tashlaydi.
 *
 * Tahrirlashdan farqi — 48 soatlik oyna YO'Q: shaxsiy chatda o'chirish
 * muddatsiz. Media xabar ham o'chiriladi.
 */
export class DeleteMessageUseCase {
  constructor(
    private readonly conversations: IConversationRepository,
    private readonly messages: IMessageRepository,
    private readonly dispatcher: MessageDispatcher,
    private readonly audit: IAuditRepository,
    private readonly clock: IClock,
  ) {}

  async execute(input: DeleteMessageInput): Promise<Message> {
    const { conversation, message } = await chiquvchiXabarniTop(
      this.conversations,
      this.messages,
      input,
      'Mijozning xabarini o\'chirib bo\'lmaydi',
    );

    // Ikki marta o'chirish — bekorga Telegramga so'rov. Natija allaqachon bor.
    if (message.revokedAt) return message;

    const updated = await this.dispatcher.deleteMessage({ conversation, message });

    await this.audit.record({
      actor: input.userEmail,
      action: 'message.deleted',
      entity: 'conversation',
      entityId: conversation.id,
      payload: { messageId: message.id, matn: message.body },
    });

    return updated;
  }
}
