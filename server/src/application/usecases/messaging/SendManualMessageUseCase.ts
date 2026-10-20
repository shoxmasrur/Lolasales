import type { Message } from '@/domain/entities/Message';
import type { IConversationRepository } from '@/domain/repositories/IConversationRepository';
import type { IMessageRepository } from '@/domain/repositories/IMessageRepository';
import type { IAuditRepository } from '@/domain/repositories/ISupportRepositories';
import type { MessageDispatcher } from '@/application/services/MessageDispatcher';
import { NotFoundError } from '@/shared/errors';

export interface SendManualMessageInput {
  conversationId: string;
  body: string;
  userId: string;
  userEmail: string;
  /** Agent qoralamasini tasdiqlab yuborish. */
  draftMessageId?: string | null;
  /** Yuborgandan keyin agentni shu suhbatda o'chirish (operator o'zi davom ettiradi). */
  disableAgent?: boolean;
}

/** Operator dashboarddan qo'lda xabar yuboradi — Telegram messenjeridagidek. */
export class SendManualMessageUseCase {
  constructor(
    private readonly conversations: IConversationRepository,
    private readonly messages: IMessageRepository,
    private readonly dispatcher: MessageDispatcher,
    private readonly audit: IAuditRepository,
  ) {}

  async execute(input: SendManualMessageInput): Promise<Message> {
    const conversation = await this.conversations.findById(input.conversationId);
    if (!conversation) throw new NotFoundError('Suhbat', input.conversationId);

    // Operatorning BIRINCHI xabari ham notanish odamga murojaat —
    // Telegram uni xuddi agentnikidek sanaydi, shuning uchun bizning
    // hisoblagichimiz ham oshishi kerak. Lekin to'sib qo'yilmaydi:
    // operator ongli qaror qabul qilyapti.
    const first = !(await this.messages.hasOutbound(conversation.id));

    // Qoralama YUBORISHDAN OLDIN o'qiladi: uning uslub tamg'asi
    // (`meta.styleVersion`) bor bo'lsa, yangi (haqiqatan yuborilgan)
    // xabarga ko'chiriladi. Aks holda qoralama pastda `failed`ga
    // o'tkaziladi va uslub bo'yicha hisobotdan (tagged CTE) tushib
    // qoladi — qo'l rejimidagi akkauntlar taqqoslashda umuman
    // ko'rinmay qolgan edi.
    const draft = input.draftMessageId ? await this.messages.findById(input.draftMessageId) : null;
    const draftStyle = draft?.meta.styleVersion;

    const meta: Record<string, unknown> | undefined = input.draftMessageId
      ? {
          approvedDraft: input.draftMessageId,
          ...(draftStyle !== undefined ? { styleVersion: draftStyle } : {}),
        }
      : undefined;

    const sent = await this.dispatcher.send({
      conversation,
      body: input.body,
      author: 'human',
      authorUserId: input.userId,
      coldOutreach: first,
      enforceQuota: false,
      meta,
    });

    // Qoralama tasdiqlangan bo'lsa — uni yopamiz, chatda ikkilanmasin.
    if (draft && draft.status === 'draft') {
      await this.messages.updateStatus(draft.id, 'failed', { error: 'Operator tomonidan tahrirlandi' });
    }

    if (input.disableAgent) {
      await this.conversations.update(conversation.id, { agentEnabled: false });
    }

    // Operator javob berdi — "inson kerak" belgisini olib tashlaymiz.
    if (conversation.needsHuman) {
      await this.conversations.update(conversation.id, { needsHuman: false, humanReason: null });
    }

    await this.audit.record({
      actor: input.userEmail,
      action: 'message.manual_sent',
      entity: 'conversation',
      entityId: conversation.id,
      payload: { chars: input.body.length },
    });

    return sent;
  }
}
