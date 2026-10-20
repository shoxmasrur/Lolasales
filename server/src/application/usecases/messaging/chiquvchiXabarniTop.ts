import type { Conversation } from '@/domain/entities/Conversation';
import type { Message } from '@/domain/entities/Message';
import type { IConversationRepository } from '@/domain/repositories/IConversationRepository';
import type { IMessageRepository } from '@/domain/repositories/IMessageRepository';
import { AppError, NotFoundError } from '@/shared/errors';

/**
 * Tahrirlash va o'chirish use case'lari bir xil to'rtta tekshiruv bilan
 * boshlanadi — shuning uchun bu yerga jamlangan.
 *
 * 3-tekshiruv (xabar boshqa suhbatnikimi) — ruxsat chegarasi: operator
 * to'g'ri `messageId`, lekin BOSHQA mijozning suhbatiga tegishli
 * `conversationId` bilan so'rov yuborishi mumkin. Ikki nusxada qolsa,
 * bittasi tuzatilib ikkinchisi unutilib qolishi mumkin — natijada
 * operator begona mijozning xabarini boshqara oladigan teshik paydo
 * bo'ladi. Shu sabab bu tekshiruv ikkala use case'da alohida-alohida
 * emas, faqat shu yerda yozilishi shart.
 */
export async function chiquvchiXabarniTop(
  conversations: IConversationRepository,
  messages: IMessageRepository,
  input: { conversationId: string; messageId: string },
  notOutboundMessage: string,
): Promise<{ conversation: Conversation; message: Message }> {
  const conversation = await conversations.findById(input.conversationId);
  if (!conversation) throw new NotFoundError('Suhbat', input.conversationId);

  const message = await messages.findById(input.messageId);
  if (!message) throw new NotFoundError('Xabar', input.messageId);

  // Xabar id'si to'g'ri, lekin boshqa suhbatniki bo'lishi mumkin —
  // marshrutdagi suhbat id'si bunday holatda hech narsani himoya qilmaydi.
  if (message.conversationId !== conversation.id) {
    throw new NotFoundError('Xabar', input.messageId);
  }

  if (message.direction !== 'out') {
    throw new AppError(notOutboundMessage, 400, 'NOT_OUTBOUND');
  }

  return { conversation, message };
}
