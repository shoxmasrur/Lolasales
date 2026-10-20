import type { IClientRepository } from '@/domain/repositories/IClientRepository';
import type {
  ConversationPatch,
  IConversationRepository,
} from '@/domain/repositories/IConversationRepository';
import type { IMessageRepository } from '@/domain/repositories/IMessageRepository';
import type { ITelegramAccountRepository } from '@/domain/repositories/ITelegramAccountRepository';
import type { IncomingMessage } from '@/domain/services/ITelegramGateway';
import { canAgentReply } from '@/domain/entities/Conversation';
import { RECEIPT_REVIEW_REASON } from '@/domain/entities/PaymentCheck';
import type { PaymentCheckService } from '@/application/services/PaymentCheckService';
import type { SttTaqqoslash } from '@/application/services/SttTaqqoslash';
import type { MijozYaratuvchi } from '@/application/services/MijozYaratuvchi';
import type { IEventBus } from '@/domain/services/support';
import type { ReplyDebouncer } from '@/application/services/ReplyDebouncer';
import type { RuntimeSettings } from '@/application/services/RuntimeSettings';
import type {
  IncomingMediaProcessor,
  ProcessedMedia,
} from '@/application/services/IncomingMediaProcessor';
import type { NewMessage } from '@/domain/entities/Message';
import { normalizePhone } from '@/shared/phone';
import { childLogger } from '@/shared/logger';

const log = childLogger('incoming');

/** Telegram xizmat hisoblari: 777000 — kirish kodlari, 42777 — yordam xizmati. */
const TELEGRAM_XIZMAT_IDLARI: ReadonlySet<string> = new Set(['777000', '42777']);

/**
 * Telegramdan kelgan xabarni qayd qiladi va (ruxsat etilgan bo'lsa) agentni
 * javob berishga chaqiradi.
 *
 * Sotuv akkauntlari ajratilgan: bazada yo'q odam yozsa, u reklamadan kelgan
 * lead — `MijozYaratuvchi.reklamadan` mijoz ochadi va agent javob beradi.
 */
/**
 * Xabar bilan nima bo'ldi.
 *
 * O'tkazib yuborilgan xabarlarni tiklashda kerak: "nechtasi haqiqatan
 * yangi edi" degan savolga javobni faqat shu yer bila oladi — dublikat
 * tekshiruvi ham shu yerda.
 */
export type IncomingOutcome =
  /** Bazaga yozildi va ishlovga ketdi. */
  | 'imported'
  /** Bu xabar allaqachon bor edi. */
  | 'duplicate'
  /** Xizmat hisobi yoki mijoz ochib bo'lmadi — hech narsa qilinmadi. */
  | 'ignored';

/**
 * Tasnif natijasini `NewMessage` maydonlariga o'tkazadi.
 *
 * Alohida funksiya, chunki use case'ning butun grafini qurmasdan
 * sinash kerak: bu yerda unutilgan bitta maydon operator ekranidagi
 * tavsifni jimgina yo'qotadi.
 */
export function xabarMaydonlari(
  processed: Pick<ProcessedMedia, 'imageKind' | 'imageStatus' | 'imageNote'> | null,
): Pick<NewMessage, 'imageKind' | 'imageStatus' | 'imageNote'> {
  return {
    imageKind: processed?.imageKind ?? null,
    imageStatus: processed?.imageStatus ?? 'none',
    imageNote: processed?.imageNote ?? null,
  };
}

export class HandleIncomingMessageUseCase {
  constructor(
    private readonly clients: IClientRepository,
    private readonly conversations: IConversationRepository,
    private readonly messages: IMessageRepository,
    private readonly replies: ReplyDebouncer,
    private readonly settings: RuntimeSettings,
    private readonly media: IncomingMediaProcessor,
    private readonly events: IEventBus,
    /** Chek rasmi yoki fayl kelganda operator tekshiruvini ochadi. */
    private readonly paymentChecks: PaymentCheckService,
    /** Ovozli xabarni XonzodaAI'ga ham yuboradi — faqat solishtirish, fonda. */
    private readonly sttTaqqoslash: SttTaqqoslash | null = null,
    /** Bazada yo'q jo'natuvchini reklama leadi qilib ochadi; `null` bo'lsa — e'tiborsiz. */
    private readonly mijozYaratuvchi: Pick<MijozYaratuvchi, 'reklamadan'> | null = null,
    /** O'z Telegram akkauntlarimiz — ular bir-biriga yozsa lead ochilmaydi. */
    private readonly akkauntlar: Pick<ITelegramAccountRepository, 'list'> | null = null,
  ) {}

  async execute(incoming: IncomingMessage): Promise<IncomingOutcome> {
    let client = await this.findClient(incoming);

    if (!client) {
      // Telegram xizmati (777000, 42777, verified/support) — lead emas.
      if (incoming.xizmatHisobi) {
        log.info({ tgUserId: incoming.telegramUserId }, 'Xizmat hisobi xabari — mijoz ochilmadi');
        return 'ignored';
      }
      // Telegram xizmat idlari yoki o'zimizning sotuv akkauntimiz — lead emas.
      if (TELEGRAM_XIZMAT_IDLARI.has(incoming.telegramUserId) || (await this.ozAkkauntimi(incoming.telegramUserId))) {
        log.info({ tgUserId: incoming.telegramUserId }, "Xizmat/o'z akkauntimiz xabari — lead ochilmadi");
        return 'ignored';
      }
      if (!this.mijozYaratuvchi) {
        log.warn(
          { tgUserId: incoming.telegramUserId, phone: incoming.phone },
          'Notanish yozuvchi — mijoz yaratuvchi ulanmagan',
        );
        return 'ignored';
      }
      try {
        client = await this.mijozYaratuvchi.reklamadan(incoming);
        log.info({ tgUserId: incoming.telegramUserId, clientId: client.id }, 'Reklama mijozi ochildi');
      } catch (err) {
        // Ochib bo'lmasa — xabar e'tiborsiz (yo'qolsa ham server yiqilmasin).
        log.error({ err, tgUserId: incoming.telegramUserId }, 'Reklama mijozini ochib bo\'lmadi');
        return 'ignored';
      }
    }

    // Profilni to'ldirib qo'yamiz (keyingi safar qidirish shart emas).
    if (!client.telegramUserId) {
      await this.clients.setTelegramIdentity(
        client.id,
        {
          telegramUserId: incoming.telegramUserId,
          telegramUsername: incoming.username,
          telegramAccessHash: incoming.accessHash,
          // Hash xabar KELGAN akkauntniki — faqat o'sha akkaunt uni
          // ishlata oladi.
          telegramHashAccountId: incoming.telegramAccountId,
        },
        'found',
      );
    }

    let conversation =
      (await this.conversations.findByPeer(incoming.telegramAccountId, incoming.telegramUserId)) ??
      (await this.conversations.findByClientId(client.id));

    if (!conversation) {
      conversation = await this.conversations.create({
        clientId: client.id,
        telegramAccountId: incoming.telegramAccountId,
      });
      this.events.publish({ type: 'conversation.created', conversationId: conversation.id });
    }

    if (!conversation.peerId) {
      conversation = await this.conversations.update(conversation.id, {
        telegramAccountId: incoming.telegramAccountId,
        peerId: incoming.telegramUserId,
        peerAccessHash: incoming.accessHash,
      });
    }

    // Telegram bir xabarni ikki marta yetkazishi mumkin.
    if (await this.messages.existsTelegramMessage(conversation.id, incoming.telegramMsgId)) {
      return 'duplicate';
    }

    // Rasm/ovoz/video bo'lsa — yuklab olamiz, ovozni matnga o'giramiz.
    const processed: ProcessedMedia | null = incoming.media
      ? await this.media.process(incoming.media, incoming.text.trim())
      : null;

    const saved = await this.messages.create({
      conversationId: conversation.id,
      direction: 'in',
      author: 'client',
      body: incoming.text,
      telegramMsgId: incoming.telegramMsgId,
      status: 'delivered',
      sentAt: incoming.receivedAt,
      media: processed?.media ?? null,
      transcript: processed?.transcript ?? null,
      transcriptStatus: processed?.transcriptStatus ?? 'none',
      ...xabarMaydonlari(processed),
    });

    await this.conversations.touchInbound(conversation.id, incoming.receivedAt);
    this.events.publish({ type: 'message.created', conversationId: conversation.id, messageId: saved.id });
    // Kutilmaydi: agent javobi Aisha matni bilan darhol ketadi. Solishtiruv
    // monitoring uchun — u hech qachon kiruvchi xabarni buzmasligi kerak.
    try {
      this.sttTaqqoslash?.boshla(saved);
    } catch (err) {
      log.warn({ err, messageId: saved.id }, 'XonzodaAI solishtiruvini boshlab bo\'lmadi');
    }
    this.events.publish({ type: 'conversation.updated', conversationId: conversation.id });
    this.events.publish({ type: 'stats.invalidate' });

    // Agentga beriladigan matn: ovoz transkripti, caption yoki media belgisi.
    const agentInput = processed ? processed.agentText : incoming.text;
    const runtime = await this.settings.get();

    // Rasm/fayl — ehtimol to'lov cheki. Pulni operator tasdiqlaydi
    // ("Tasdiqlash" summa bilan yoki "Rad etish"), CRM bilan solishtirilmaydi.
    if (processed?.receiptSource) {
      const source = processed.receiptSource;
      const reason = processed.reviewReason ?? RECEIPT_REVIEW_REASON[source];

      try {
        const check = await this.paymentChecks.openReceiptReview(conversation.id, client.id, saved.id, source);
        log.info(
          { conversationId: conversation.id, checkId: check.id, receiptSource: check.receiptSource, kind: processed.media.kind },
          'To\'lov cheki tekshirishga olindi',
        );
        // Faqat `tolov` bosqichni `chek_keldi` ga suradi (`PaymentCheckService.chekKeldi`).
        // Bosqich xatosi chekni operatordan chetda qoldirmasin — faqat jurnal.
        try {
          await this.paymentChecks.chekKeldi(check);
        } catch (err) {
          log.warn({ conversationId: conversation.id, err }, 'Xarid bosqichi chek_keldi ga o\'tmadi');
        }
      } catch (err) {
        // Tekshiruv ochilmasa ham chek operatordan chetda qolmasligi kerak.
        log.warn({ conversationId: conversation.id, err }, 'Tekshiruv ochilmadi, operatorga chiqarildi');
        await this.operatorga(conversation.id, { needsHuman: true, humanReason: reason });
        return 'imported';
      }

      // Agent mijozga "Chekni oldim" faqat `tolov` da va faqat o'zi yoza
      // oladigan bo'lsa aytadi — o'shanda eskalatsiyani javobdan KEYIN
      // `AgentRunner` qo'yadi. Qolgan holatlarda agent yozmaydi, ya'ni
      // operator shu yerda DARHOL chaqiriladi. Eskalatsiya `canAgentReply`
      // ni yopadi — shu partiyadagi matnga ham operator javob beradi.
      const agentYozmaydi =
        source === 'aniqlanmagan' ||
        runtime.killSwitch ||
        !canAgentReply(conversation) ||
        !agentInput.trim();
      if (agentYozmaydi) {
        await this.operatorga(conversation.id, {
          needsHuman: true,
          humanKind: 'chek_tekshiruvi',
          humanReason: reason,
        });
        return 'imported';
      }
    } else if (processed?.needsReview) {
      // Rasm/fayl emas (ovoz o'girilmadi yoki yuklanmadi) — chek emas,
      // lekin agent uni o'qiy olmaydi: operator eshitadi.
      await this.operatorga(conversation.id, {
        needsHuman: true,
        humanReason: processed.reviewReason,
      });
      return 'imported';
    }

    if (!agentInput.trim()) return 'imported';

    if (runtime.killSwitch) {
      log.warn({ conversationId: conversation.id }, 'KILL_SWITCH yoqilgan — agent javob bermadi');
      return 'imported';
    }

    // Darhol javob bermaymiz: mijoz fikrini bo'lib-bo'lib yozayotgan bo'lishi
    // mumkin. Debouncer bir necha soniya kutadi va hammasini bitta javobga
    // birlashtiradi — aks holda har bir xabarga alohida javob ketardi.
    this.replies.push(conversation.id, agentInput);
    return 'imported';
  }

  private async operatorga(conversationId: string, patch: ConversationPatch): Promise<void> {
    await this.conversations.update(conversationId, patch);
    this.events.publish({ type: 'conversation.updated', conversationId });
  }

  private async ozAkkauntimi(tgUserId: string): Promise<boolean> {
    if (!this.akkauntlar) return false;
    return (await this.akkauntlar.list()).some((a) => a.tgUserId === tgUserId);
  }

  private async findClient(incoming: IncomingMessage) {
    const byTelegram = await this.clients.findByTelegramUserId(incoming.telegramUserId);
    if (byTelegram) return byTelegram;

    const phone = normalizePhone(incoming.phone);
    if (phone) {
      const byPhone = await this.clients.findByPhone(phone);
      if (byPhone) return byPhone;
    }
    return null;
  }
}
