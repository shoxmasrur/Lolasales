import type { IClientRepository } from '@/domain/repositories/IClientRepository';
import type {
  ConversationPatch,
  IConversationRepository,
} from '@/domain/repositories/IConversationRepository';
import type { IMessageRepository } from '@/domain/repositories/IMessageRepository';
import type { IContractRepository } from '@/domain/repositories/IContractRepository';
import type { IncomingMessage } from '@/domain/services/ITelegramGateway';
import { faqatYoziladiganlar } from '@/domain/entities/shartnomaHolati';
import { canAgentReply } from '@/domain/entities/Conversation';
import { RECEIPT_REVIEW_REASON } from '@/domain/entities/PaymentCheck';
import { NOMALUM_SABAB_HUJJAT, NOMALUM_SABAB_OPERATOR } from '@/domain/entities/NomalumSuhbat';
import { REVIEW_KINDS } from '@/domain/entities/Message';
import type { PaymentCheckService } from '@/application/services/PaymentCheckService';
import type { XaridXizmati } from '@/application/services/XaridXizmati';
import type { SttTaqqoslash } from '@/application/services/SttTaqqoslash';
import type { NomalumMijozOchuvchi } from '@/application/services/NomalumMijozOchuvchi';
import type { NomalumHujjatQabul } from '@/application/services/NomalumHujjatQabul';
import type { IEventBus } from '@/domain/services/support';
import type { ReplyDebouncer } from '@/application/services/ReplyDebouncer';
import type { RuntimeSettings } from '@/application/services/RuntimeSettings';
import type {
  IncomingMediaProcessor,
  ProcessedMedia,
} from '@/application/services/IncomingMediaProcessor';
import type { NewMessage } from '@/domain/entities/Message';
import { stageForOverdueDays } from '@/domain/policies/EscalationPolicy';
import { normalizePhone } from '@/shared/phone';
import { childLogger } from '@/shared/logger';

const log = childLogger('incoming');

/**
 * Telegramdan kelgan xabarni qayd qiladi va (ruxsat etilgan bo'lsa) agentni
 * javob berishga chaqiradi.
 *
 * Notanish raqamdan kelgan xabar ham saqlanadi — dashboardda ko'rinadi, lekin
 * agent unga javob bermaydi (bizning mijozimiz emas).
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
  /** Bizning mijozimiz emas — hech narsa qilinmadi. */
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
    private readonly contracts: IContractRepository,
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
    /** Bazada yo'q jo'natuvchini noma'lum mijoz qilib ochadi; `null` bo'lsa — e'tiborsiz. */
    private readonly nomalumOchuvchi: NomalumMijozOchuvchi | null = null,
    /** Hujjat kutilayotgan noma'lum suhbatga kelgan rasm/faylni operator tasdig'iga o'tkazadi. */
    private readonly hujjatQabul: Pick<NomalumHujjatQabul, 'qabulQil'> | null = null,
    /** Chek kelganda faol xarid bosqichi `chek_keldi` bo'ladi; `null` — sinovlarda. */
    private readonly xarid: Pick<XaridXizmati, 'bosqich'> | null = null,
  ) {}

  async execute(incoming: IncomingMessage): Promise<IncomingOutcome> {
    let client = await this.findClient(incoming);

    if (!client) {
      if (!this.nomalumOchuvchi) {
        log.warn(
          { tgUserId: incoming.telegramUserId, phone: incoming.phone },
          'Notanish raqamdan xabar — bazada mijoz topilmadi',
        );
        return 'ignored';
      }
      try {
        // Telegram xizmati (777000, 42777, verified/support) yoki o'zimizning
        // akkauntimiz — notanish mijoz emas: ochilmaydi, agent yozmaydi.
        if (await this.nomalumOchuvchi.xizmatYozuvchisimi(incoming)) {
          log.info({ tgUserId: incoming.telegramUserId }, "Xizmat/o'z akkauntimiz xabari — noma'lum mijoz ochilmadi");
          return 'ignored';
        }
        client = await this.nomalumOchuvchi.och(incoming);
        log.info({ tgUserId: incoming.telegramUserId, clientId: client.id }, "Noma'lum mijoz ochildi");
      } catch (err) {
        // Ochib bo'lmasa — eski xulq: xabar e'tiborsiz (yo'qolsa ham server yiqilmasin).
        log.error({ err, tgUserId: incoming.telegramUserId }, "Noma'lum mijozni ochib bo'lmadi");
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

    let conversation = client.nomalum
      ? await this.nomalumSuhbati(client.id, incoming)
      : (await this.conversations.findByPeer(incoming.telegramAccountId, incoming.telegramUserId)) ??
        (await this.conversations.findByClientId(client.id));

    if (!conversation) {
      // Bosqich ham faqat "Сотилди" shartnomalari bo'yicha: agentga
      // beriladigan kontekst ham shunday filtrlanadi, ikkalasi bir xil
      // manzarani ko'rishi kerak.
      const contracts = faqatYoziladiganlar(await this.contracts.findByClientId(client.id));
      const daysOverdue = contracts.reduce((max, c) => Math.max(max, c.daysOverdue), 0);
      conversation = await this.conversations.create({
        clientId: client.id,
        telegramAccountId: incoming.telegramAccountId,
        stage: stageForOverdueDays(daysOverdue),
      });
      this.events.publish({ type: 'conversation.created', conversationId: conversation.id });
    }

    if (client.nomalum) {
      try {
        await this.nomalumOchuvchi?.suhbatniBelgila(conversation.id, incoming.phone);
      } catch (err) {
        // Belgi yozilmasa ham kiruvchi xabar yo'qolmasin.
        log.warn({ err, conversationId: conversation.id }, "Noma'lum suhbat belgisini yozib bo'lmadi");
      }
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
      // Noma'lum odam rasmi (pasport bo'lishi mumkin) vision modelga berilmaydi — PII.
      ? await this.media.process(incoming.media, incoming.text.trim(), { tasniflama: Boolean(client.nomalum) })
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

    // Hujjat kutilayotgan noma'lum odam rasm/fayl yubordi (pasport yoki
    // shartnoma sahifasi bo'lishi kutiladi) — agentga ham, chek oqimiga ham
    // berilmaydi: operator ko'rib, bog'lashni tasdiqlaydi.
    if (client.nomalum && this.hujjatQabul && incoming.media && REVIEW_KINDS.has(incoming.media.kind)) {
      const eski = this.nomalumOchuvchi?.eskimi(incoming.receivedAt) ?? false;
      try {
        if (await this.hujjatQabul.qabulQil(conversation.id, { javobYoz: !eski })) return 'imported';
      } catch (err) {
        // Holatni o'tkazib bo'lmadi — rasm agentga ketmasin, operator ko'rsin.
        log.error({ err, conversationId: conversation.id }, "Noma'lum mijoz hujjatini qabul qilib bo'lmadi");
        await this.operatorga(conversation.id, { needsHuman: true, humanReason: NOMALUM_SABAB_HUJJAT });
        return 'imported';
      }
    }

    // Agentga beriladigan matn: ovoz transkripti, caption yoki media belgisi.
    const agentInput = processed ? processed.agentText : incoming.text;
    const runtime = await this.settings.get();

    // Rasm/fayl — ehtimol to'lov cheki. Pulni operator tasdiqlaydi
    // ("Tasdiqlash" summa bilan yoki "Rad etish"), CRM bilan solishtirilmaydi.
    // Noma'lum odamda shartnoma yo'q — chekni bog'lash mumkin emas; operator
    // suhbatda o'zi ko'radi. Aks holda "Tasdiqlash" bosilganda
    // eski agent begonaga rahmat yozib yuborardi.
    if (processed?.receiptSource && !client.nomalum) {
      const source = processed.receiptSource;
      const reason = processed.reviewReason ?? RECEIPT_REVIEW_REASON[source];

      try {
        const check = await this.paymentChecks.openReceiptReview(conversation.id, client.id, saved.id, source);
        log.info(
          { conversationId: conversation.id, checkId: check.id, receiptSource: check.receiptSource, kind: processed.media.kind },
          'To\'lov cheki tekshirishga olindi',
        );
        // Bosqich xatosi chekni operatordan chetda qoldirmasin — faqat jurnal.
        try {
          await this.xarid?.bosqich(client.id, 'chek_keldi', 'tizim');
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
      // Noma'lum odamning rasmi/fayli (tasniflanmagan, chek oqimisiz) ham shu
      // yerga tushadi: "chek bo'lishi mumkin" sababi begona uchun chalg'ituvchi
      // va bog'langandan keyin osilib qolardi. Noma'lum oqim sababi esa
      // bog'lashda (`nomalumSababimi`) o'zi tushiriladi.
      const nomalumHujjati = client.nomalum && REVIEW_KINDS.has(processed.media.kind);
      await this.operatorga(conversation.id, {
        needsHuman: true,
        humanReason: nomalumHujjati ? NOMALUM_SABAB_OPERATOR : processed.reviewReason,
      });
      return 'imported';
    }

    if (!agentInput.trim()) return 'imported';

    // Deploy/qayta ulanishdan keyin kelgan eski xabar (`fetchMissed`):
    // notanish odamga kechikkan avtomatik javob yozilmaydi — debouncerga
    // qo'yilmaydi, operator o'zi qaror qiladi.
    if (client.nomalum && this.nomalumOchuvchi?.eskimi(incoming.receivedAt)) {
      const humanReason = await this.nomalumOchuvchi.eskiniOperatorga(conversation.id);
      if (humanReason) await this.operatorga(conversation.id, { needsHuman: true, humanReason });
      log.info({ conversationId: conversation.id, receivedAt: incoming.receivedAt }, "Noma'lum mijozning eski xabari — agentga berilmadi");
      return 'imported';
    }

    if (runtime.killSwitch) {
      log.warn({ conversationId: conversation.id }, 'KILL_SWITCH yoqilgan — agent javob bermadi');
      return 'imported';
    }

    // Darhol javob bermaymiz: mijoz fikrini bo'lib-bo'lib yozayotgan bo'lishi
    // mumkin. Debouncer bir necha soniya kutadi va hammasini bitta javobga
    // birlashtiradi — aks holda har bir xabarga alohida javob ketardi.
    // Noma'lum mijoz xabari ham shu yerdan o'tadi: debouncer uni
    // `JavobYonaltiruvchi` orqali noma'lum agentga beradi — shu bilan bir
    // suhbatda bir vaqtda faqat bitta navbat ketadi.
    this.replies.push(conversation.id, agentInput);
    return 'imported';
  }

  private async operatorga(conversationId: string, patch: ConversationPatch): Promise<void> {
    await this.conversations.update(conversationId, patch);
    this.events.publish({ type: 'conversation.updated', conversationId });
  }

  /**
   * Noma'lum mijoz FAQAT o'z suhbatiga yoziladi. `findByPeer` ishlatilmaydi:
   * peer bo'yicha boshqa (haqiqiy) mijozning suhbati topilsa, notanish odam
   * xabari o'sha mijoz tarixiga tushib, asosiy agent unga shu mijoz
   * ma'lumoti bilan javob yozardi. Bunday moslik faqat jurnalga yoziladi —
   * kimligini operator bog'lash orqali hal qiladi.
   */
  private async nomalumSuhbati(clientId: string, incoming: IncomingMessage) {
    const peer = await this.conversations.findByPeer(incoming.telegramAccountId, incoming.telegramUserId);
    if (peer && peer.clientId !== clientId) {
      log.warn(
        { unknownClientId: clientId, otherConversationId: peer.id, otherClientId: peer.clientId },
        "Noma'lum yozuvchi boshqa mijoz suhbatiga peer bo'yicha mos keldi — biriktirilmadi",
      );
    }
    return this.conversations.findByClientId(clientId);
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
