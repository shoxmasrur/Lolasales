import type { Conversation } from '@/domain/entities/Conversation';
import type { MediaKind, Message, MessageAuthor } from '@/domain/entities/Message';
import type { IMediaStorage } from '@/domain/services/IMediaStorage';
import { canReply, canSend } from '@/domain/entities/TelegramAccount';
import type { IConversationRepository } from '@/domain/repositories/IConversationRepository';
import type { IMessageRepository } from '@/domain/repositories/IMessageRepository';
import type { ITelegramAccountRepository } from '@/domain/repositories/ITelegramAccountRepository';
import type { GatePriority, ITelegramGateway, ResolvedPeer, SentMessage } from '@/domain/services/ITelegramGateway';
import type { IClock, IEventBus } from '@/domain/services/support';
import type { IClientRepository } from '@/domain/repositories/IClientRepository';
import type { IAuditRepository } from '@/domain/repositories/ISupportRepositories';
import type { RuntimeSettings } from '@/application/services/RuntimeSettings';
import { AppError, KillSwitchError, TelegramError } from '@/shared/errors';
import { childLogger } from '@/shared/logger';
import { kontekst } from '@/shared/logContext';
import { isEditTimeExpired, isMessageGone } from '@/infrastructure/telegram/telegramErrors';

const log = childLogger('dispatcher');

export interface SendOptions {
  conversation: Conversation;
  body: string;
  author: MessageAuthor;
  authorUserId?: string | null;
  /** Suhbatga hali peer biriktirilmagan bo'lsa — bu yerdan olinadi. */
  peer?: ResolvedPeer;
  accountId?: string;
  /** Yozayotgandek ko'rsatish (agent xabarlari uchun tabiiyroq). */
  simulateTyping?: boolean;
  /**
   * Bu — NOTANISH odamga birinchi murojaatmi.
   *
   * Faqat shu xabarlar kunlik kvotani sarflaydi va u bilan cheklanadi:
   * spam filtri (PEER_FLOOD) aynan shunday xabarlarni sanaydi. Mavjud
   * suhbatdagi javoblar kvotaga umuman tegmaydi — aks holda kvota
   * tugagach agent kun o'rtasida jim qolib, mijoz javobsiz qolardi.
   */
  coldOutreach?: boolean;
  /**
   * Kunlik limit bu xabarni TO'SIB qo'yadimi.
   *
   * `coldOutreach` dan ajratilgan: operator qo'lda yozgan birinchi xabar
   * hisoblanadi (`coldOutreach: true`), lekin to'silmaydi — u ongli
   * qaror qabul qilyapti va odatda mijozning o'z iltimosiga javob
   * beryapti. Agentning o'z oqimida ikkalasi ham yoqilgan.
   */
  enforceQuota?: boolean;
  /**
   * Akkaunt navbatidagi o'rin. Berilmasa: kampaniya xabari — `background`,
   * mavjud suhbatdagi javob — `reply`.
   */
  priority?: GatePriority;
  meta?: Record<string, unknown>;
}

/**
 * Chiquvchi xabarning yagona yo'li. Bu yerda:
 *   • global to'xtatish (kill switch) tekshiriladi,
 *   • akkaunt kvotasi hisoblanadi,
 *   • xabar avval bazaga yoziladi, keyin yuboriladi (yo'qolmasligi uchun),
 *   • xato bo'lsa xabar `failed` holatida qoladi va dashboardda ko'rinadi.
 */
export interface SendMediaOptions {
  conversation: Conversation;
  data: Buffer;
  fileName: string;
  mimeType: string | null;
  caption: string;
  author: MessageAuthor;
  authorUserId?: string | null;
  asDocument?: boolean;
}

export class MessageDispatcher {
  constructor(
    private readonly messages: IMessageRepository,
    private readonly conversations: IConversationRepository,
    private readonly accounts: ITelegramAccountRepository,
    private readonly gateway: ITelegramGateway,
    private readonly settings: RuntimeSettings,
    private readonly events: IEventBus,
    private readonly clock: IClock,
    private readonly storage: IMediaStorage,
    private readonly clients: IClientRepository,
    private readonly audit: IAuditRepository,
  ) {}

  /**
   * Mijoz bizni bloklaganini qayd qiladi.
   *
   * Telegram "sizni bloklashdi" degan xabarni O'ZI yubormaydi — buni faqat
   * yozishga urinib bilamiz. Mijoz "Report spam and delete chat" bosganda
   * ham aynan shu xato qaytadi, ya'ni spamga chiqarganlar shu yerda
   * aniqlanadi.
   *
   * Status qo'yilishi bilan `isContactable()` bu mijozni rad etadi, ya'ni
   * yangi suhbat boshlash o'z-o'zidan to'xtaydi. Suhbat holati esa
   * O'ZGARTIRILMAYDI: yozishma tarixi operatorga kerak va mijoz blokni
   * olib tashlashi ham mumkin.
   */
  private async noteBlocked(conversation: Conversation, err: unknown): Promise<void> {
    if (!(err instanceof TelegramError) || err.telegramCode !== 'USER_IS_BLOCKED') return;

    const client = await this.clients.findById(conversation.clientId);
    if (!client || client.telegramStatus === 'blocked') return;

    await this.clients.setTelegramStatus(client.id, 'blocked');
    await this.audit.record({
      actor: 'system',
      action: 'client.blocked_us',
      entity: 'client',
      entityId: client.id,
      payload: { mijoz: client.fullName, conversationId: conversation.id },
    });

    this.events.publish({ type: 'conversation.updated', conversationId: conversation.id });
    log.warn(
      { conversationId: conversation.id, clientId: client.id },
      'Mijoz akkauntimizni bloklagan — yangi xabar yuborilmaydi',
    );
  }

  /**
   * Mijozning Telegram akkaunti o'chirilgan — belgilab qo'yamiz.
   *
   * NEGA KERAK: bu holat o'z-o'zidan tuzalmaydi. Belgilamasak agent har
   * eslatmada qaytadan yozishga urinardi, har safar `INPUT_USER_DEACTIVATED`
   * olardi va jurnal bekorga to'lardi. Status qo'yilishi bilan
   * `isContactable()` bu mijozni rad etadi.
   *
   * `blocked` dan ATAYLAB alohida: "bloklagan" — mijozning qarori,
   * "o'chirilgan" — akkaunt umuman yo'q. Operator uchun bu ikki xil ish:
   * ikkinchisida boshqa aloqa vositasi qidirish kerak.
   *
   * Suhbat holati O'ZGARTIRILMAYDI: yozishma tarixi operatorga kerak.
   */
  private async noteDeactivated(conversation: Conversation, err: unknown): Promise<void> {
    if (!(err instanceof TelegramError) || err.telegramCode !== 'USER_DEACTIVATED_TARGET') return;

    const client = await this.clients.findById(conversation.clientId);
    if (!client || client.telegramStatus === 'deactivated') return;

    await this.clients.setTelegramStatus(client.id, 'deactivated');
    await this.audit.record({
      actor: 'system',
      action: 'client.telegram_deactivated',
      entity: 'client',
      entityId: client.id,
      payload: { mijoz: client.fullName, conversationId: conversation.id },
    });

    this.events.publish({ type: 'conversation.updated', conversationId: conversation.id });
    log.warn(
      { conversationId: conversation.id, clientId: client.id },
      'Mijozning Telegram akkaunti o\'chirilgan — yangi xabar yuborilmaydi',
    );
  }

  /**
   * Operator dashboarddan rasm/fayl yuboradi.
   * Fayl avval o'zimizda saqlanadi — chatda ko'rinib turishi uchun.
   */
  async sendMedia(options: SendMediaOptions): Promise<Message> {
    const { conversation } = options;

    const runtime = await this.settings.get();
    if (runtime.killSwitch) throw new KillSwitchError();

    const peer = this.peerFromConversation(conversation);
    if (!peer) {
      throw new AppError('Mijozning Telegram profili aniqlanmagan', 409, 'PEER_UNKNOWN');
    }

    const accountId = conversation.telegramAccountId;
    if (!accountId) throw new AppError('Telegram akkaunt tanlanmagan', 409, 'NO_ACCOUNT');

    const account = await this.accounts.findById(accountId);
    if (!account) throw new AppError('Telegram akkaunt topilmadi', 409, 'NO_ACCOUNT');

    // Bu suhbatdagi BIRINCHI chiquvchi xabarmi.
    //
    // NEGA fayl uchun ham kerak: "operator faylni faqat mavjud suhbatda
    // yuboradi" degan taxmin har doim to'g'ri emas. `agentAutoReply`
    // o'chirilganda agentning javobi `draft` bo'lib qoladi, ya'ni chiquvchi
    // xabari NOL bo'lgan suhbat paydo bo'ladi. Operator o'sha suhbatda
    // notanish odamga birinchi bo'lib rasm yuborsa, Telegram uchun bu aynan
    // cold outreach — hisoblanmasa bizning sonimiz Telegramnikidan kichik
    // bo'lib qoladi va spam xavfi ko'rinmay ketadi.
    //
    // `create()` chiquvchi xabar yozadi, shuning uchun tekshiruv undan
    // OLDIN bajarilishi shart.
    const first = !(await this.messages.hasOutbound(conversation.id));

    // Kunlik limit faylni TO'SMAYDI — matn bilan bir xil qoida
    // (`SendManualMessageUseCase`): operatorning qo'lda yuborgani
    // sanaladi, lekin to'silmaydi, chunki u ongli qaror qabul qilyapti.
    if (!canReply(account, this.clock.now())) {
      throw new AppError(
        `"${account.label}" akkaunti hozir yubora olmaydi (ulanmagan yoki flood-wait)`,
        429,
        'ACCOUNT_UNAVAILABLE',
      );
    }

    const stored = await this.storage.save(options.data, options.fileName);

    const record = await this.messages.create({
      conversationId: conversation.id,
      direction: 'out',
      author: options.author,
      authorUserId: options.authorUserId ?? null,
      body: options.caption,
      status: 'sending',
      meta: { accountId },
      media: {
        kind: kindFromMime(options.mimeType, options.asDocument),
        path: stored.path,
        mimeType: options.mimeType,
        sizeBytes: stored.sizeBytes,
        durationSec: null,
        fileName: options.fileName,
      },
    });
    this.events.publish({ type: 'message.created', conversationId: conversation.id, messageId: record.id });

    // Telegram yetkazgandan keyin to'ldiriladi — pastdagi `catch` yetib
    // borgan faylni "failed" deb belgilamasligi uchun.
    let yetkazildi: SentMessage | null = null;
    try {
      // Matndagi kabi: o'qildi + yuborildi bitta bo'lakda ketadi.
      const sent = await this.gateway.runExclusive(
        accountId,
        { kind: 'message', priority: 'manual', label: 'sendMedia' },
        async () => {
          await this.gateway
            .markRead(accountId, peer)
            .catch((err) => log.debug({ err }, 'markRead o\'tmadi'));

          return this.gateway.sendMedia(accountId, peer, {
            data: options.data,
            fileName: options.fileName,
            mimeType: options.mimeType,
            caption: options.caption,
            asDocument: options.asDocument,
          });
        },
      );
      yetkazildi = sent;
      // Birinchi chiquvchi xabar — matndagi bilan bir xil hisob.
      if (first) await this.accounts.incrementSentToday(accountId, this.clock.todayIso());

      const updated = await this.messages.updateStatus(record.id, 'sent', {
        telegramMsgId: sent.telegramMsgId,
        sentAt: sent.sentAt,
      });

      await this.conversations.touchOutbound(conversation.id, sent.sentAt);
      this.events.publish({ type: 'message.updated', conversationId: conversation.id, messageId: record.id });
      this.events.publish({ type: 'conversation.updated', conversationId: conversation.id });

      log.info(
        {
          ...kontekst({ akkaunt: account.label }),
          conversationId: conversation.id,
          fileName: options.fileName,
          bytes: stored.sizeBytes,
        },
        'Fayl yuborildi',
      );
      return updated;
    } catch (err) {
      if (yetkazildi) {
        // Fayl mijozda — faqat bizning hisob yozuvimiz yiqildi. "failed"
        // deyish yolg'on bo'lardi: chatda xato ko'rinardi va qayta
        // urinish (masalan talabnoma) mijozga ikkinchi nusxani yuborardi.
        log.error(
          { ...kontekst({ akkaunt: account.label }), conversationId: conversation.id, accountId, err },
          'Fayl yuborildi, lekin keyingi yozuv yiqildi',
        );
        await this.messages
          .updateStatus(record.id, 'sent', { telegramMsgId: yetkazildi.telegramMsgId, sentAt: yetkazildi.sentAt })
          .catch((e) => log.error({ err: e, messageId: record.id }, 'Fayl holati yangilanmadi'));
        // Aks holda ochiq chatda xabar "yuborilmoqda" bo'lib osilib qoladi.
        this.events.publish({ type: 'message.updated', conversationId: conversation.id, messageId: record.id });
        throw err;
      }
      const reason = err instanceof Error ? err.message : 'Yuborishda xato';
      await this.messages.updateStatus(record.id, 'failed', { error: reason });
      this.events.publish({ type: 'message.updated', conversationId: conversation.id, messageId: record.id });
      await this.noteBlocked(conversation, err);
      await this.noteDeactivated(conversation, err);
      log.error(
        { ...kontekst({ akkaunt: account.label }), conversationId: conversation.id, accountId, err },
        'Fayl yuborilmadi',
      );
      throw err;
    }
  }

  async send(options: SendOptions): Promise<Message> {
    const { conversation, body } = options;
    const text = body.trim();
    if (!text) throw new AppError('Bo\'sh xabar yuborib bo\'lmaydi', 400, 'EMPTY_MESSAGE');

    const runtime = await this.settings.get();
    if (runtime.killSwitch) throw new KillSwitchError();

    const peer = options.peer ?? this.peerFromConversation(conversation);
    if (!peer) {
      throw new AppError(
        'Mijozning Telegram profili aniqlanmagan — avval telefon raqami bo\'yicha qidiring',
        409,
        'PEER_UNKNOWN',
      );
    }

    const accountId = options.accountId ?? conversation.telegramAccountId;
    if (!accountId) throw new AppError('Telegram akkaunt tanlanmagan', 409, 'NO_ACCOUNT');

    const account = await this.accounts.findById(accountId);
    if (!account) throw new AppError('Telegram akkaunt topilmadi', 409, 'NO_ACCOUNT');

    const today = this.clock.todayIso();
    const coldOutreach = options.coldOutreach === true;
    // Kunlik limit faqat `enforceQuota` yoqilganda to'sadi. Operatorning
    // qo'lda yozgan birinchi xabari `coldOutreach: true, enforceQuota: false`
    // bilan keladi — hisoblanadi, lekin to'silmaydi.
    const enforceQuota = options.enforceQuota !== false;
    const now = this.clock.now();
    if (coldOutreach && enforceQuota ? !canSend(account, now, today) : !canReply(account, now)) {
      throw new AppError(
        coldOutreach && enforceQuota
          ? `"${account.label}" akkaunti hozir yangi murojaat yubora olmaydi (kunlik limit yoki flood-wait)`
          : `"${account.label}" akkaunti hozir yubora olmaydi (ulanmagan yoki flood-wait)`,
        429,
        'ACCOUNT_UNAVAILABLE',
      );
    }

    // Avval bazaga yozamiz — yuborish paytida server o'chsa ham xabar yo'qolmaydi.
    const record = await this.messages.create({
      conversationId: conversation.id,
      direction: 'out',
      author: options.author,
      authorUserId: options.authorUserId ?? null,
      body: text,
      status: 'sending',
      meta: { ...options.meta, accountId },
    });
    this.events.publish({ type: 'message.created', conversationId: conversation.id, messageId: record.id });

    try {
      // Uchala chaqiruv — BITTA bo'lak. Orasiga boshqa mijozning qidiruvi
      // yoki xabari tushsa, "o'qidi → yozmoqda → yubordi" tabiiy ketma-ketligi
      // buziladi. Baza yozuvlari qulfdan TASHQARIDA qoladi: akkaunt Postgresni
      // kutib turmasligi kerak.
      const sent = await this.gateway.runExclusive(
        accountId,
        {
          kind: 'message',
          // Mijozning javobi kampaniya xabaridan oldin ketadi.
          priority: options.priority ?? (coldOutreach ? 'background' : 'reply'),
          label: 'send',
        },
        async () => {
          await this.gateway
            .markRead(accountId, peer)
            .catch((err) => log.debug({ err }, 'markRead o\'tmadi'));

          if (options.simulateTyping) {
            await this.gateway.sendTyping(accountId, peer);
          }

          return this.gateway.sendMessage(accountId, peer, text);
        },
      );
      // Hisoblagich — spam xavfi o'lchovi, shuning uchun unga faqat
      // notanish odamga yuborilgan birinchi xabarlar qo'shiladi.
      if (coldOutreach) await this.accounts.incrementSentToday(accountId, today);

      const updated = await this.messages.updateStatus(record.id, 'sent', {
        telegramMsgId: sent.telegramMsgId,
        sentAt: sent.sentAt,
      });

      await this.conversations.touchOutbound(conversation.id, sent.sentAt);
      if (
        conversation.telegramAccountId !== accountId ||
        conversation.peerId !== peer.telegramUserId
      ) {
        await this.conversations.update(conversation.id, {
          telegramAccountId: accountId,
          peerId: peer.telegramUserId,
          peerAccessHash: peer.accessHash,
        });
      }

      this.events.publish({ type: 'message.updated', conversationId: conversation.id, messageId: record.id });
      this.events.publish({ type: 'conversation.updated', conversationId: conversation.id });
      this.events.publish({ type: 'stats.invalidate' });

      log.info(
        { ...kontekst({ akkaunt: account.label }), conversationId: conversation.id, accountId, chars: text.length },
        'Xabar yuborildi',
      );
      return updated;
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'Yuborishda xato';
      await this.messages.updateStatus(record.id, 'failed', { error: reason });
      this.events.publish({ type: 'message.updated', conversationId: conversation.id, messageId: record.id });
      await this.noteBlocked(conversation, err);
      await this.noteDeactivated(conversation, err);
      log.error(
        { ...kontekst({ akkaunt: account.label }), conversationId: conversation.id, accountId, err },
        'Xabar yuborilmadi',
      );
      throw err;
    }
  }

  peerFor(conversation: Conversation): ResolvedPeer | null {
    return this.peerFromConversation(conversation);
  }

  /**
   * Mijozning xabarlarini Telegramda "o'qildi" deb belgilaydi.
   *
   * Odam yozishmani ochib, o'qib, keyin javob yozadi — bizda ham shunday
   * bo'lishi kerak. Aks holda mijoz javob olsa ham xabarlari "yetkazildi"
   * holatida qolib, e'tiborsizlik taassurotini beradi.
   *
   * Xato bo'lsa suhbat to'xtamaydi — bu yordamchi amal.
   */
  async markReadInTelegram(conversation: Conversation): Promise<void> {
    const peer = this.peerFromConversation(conversation);
    const accountId = conversation.telegramAccountId;
    if (!peer || !accountId) return;

    await this.gateway
      .markRead(accountId, peer)
      .catch((err) => log.debug({ conversationId: conversation.id, err }, 'markRead o\'tmadi'));
  }

  /**
   * Yuborilgan xabar matnini o'zgartiradi — Telegramda ham, bazada ham.
   *
   * TARTIB MUHIM: avval Telegram, keyin baza. Mijoz nimani ko'rgani
   * haqidagi haqiqat manbai — Telegram. Teskarisi bo'lsa, Telegram rad
   * etganda bazada mijoz ko'rmagan matn qolib ketardi va agent o'sha
   * matnga tayanib javob yozardi.
   */
  async editText(options: {
    conversation: Conversation;
    message: Message;
    body: string;
  }): Promise<Message> {
    const { conversation, message } = options;
    const text = options.body.trim();
    if (!text) throw new AppError('Bo\'sh xabar saqlab bo\'lmaydi', 400, 'EMPTY_MESSAGE');

    // Telegramga hech qachon ketmagan xabar (queued, failed) — u yerda
    // o'zgartiradigan narsa yo'q, mijoz ham ko'rmagan. Faqat shu holatda
    // Telegram butunlay chetlab o'tiladi.
    if (message.telegramMsgId !== null) {
      const peer = this.peerFromConversation(conversation);
      if (!peer) {
        throw new AppError(
          'Mijozning Telegram profili aniqlanmagan — avval telefon raqami bo\'yicha qidiring',
          409,
          'PEER_UNKNOWN',
        );
      }

      const accountId = conversation.telegramAccountId;
      // MUHIM: bu "hech qachon ketmagan xabar" bilan BIR XIL EMAS. Bu yerda
      // xabar Telegramga ALLAQACHON yetib borgan (`telegramMsgId` bor),
      // lekin suhbat keyinroq akkauntini yo'qotgan — masalan, akkaunt
      // o'chirilganda (`PgTelegramAccountRepository.remove()`) shu
      // akkauntga bog'langan barcha suhbatlarning `telegram_account_id`
      // ustuni NULL qilinadi. Mijozning Telegramida xabar hali ham
      // turibdi, shuning uchun bu yerda "muvaffaqiyatli" deb bazani
      // yozib bo'lmaydi — Telegram bilan baza ziddiyatga kelib, agent
      // mijoz ko'rmagan matnga tayanib qoladi.
      if (!accountId) throw new AppError('Telegram akkaunt tanlanmagan', 409, 'NO_ACCOUNT');

      try {
        await this.gateway.editMessage(accountId, peer, message.telegramMsgId, text);
      } catch (err) {
        // Use case 48 soatni oldindan tekshiradi, lekin soatlar bir xil
        // yurmasligi mumkin va chegaraga tegib turgan xabar shu yerda
        // yiqiladi. Telegramning inglizcha kodi o'rniga operatorga nima
        // qilish kerakligini aytamiz.
        if (isEditTimeExpired(err)) {
          throw new AppError(
            '48 soat o\'tgan. Tahrirlab bo\'lmaydi — o\'chirib, yangisini yozing.',
            409,
            'EDIT_WINDOW_CLOSED',
          );
        }
        throw err;
      }
    }

    const updated = await this.messages.markEdited(message.id, text, this.clock.now());
    this.events.publish({
      type: 'message.updated',
      conversationId: conversation.id,
      messageId: message.id,
    });
    return updated;
  }

  /**
   * Xabarni mijozning Telegramidan olib tashlaydi va bazada belgilaydi.
   *
   * Telegram "bunday xabar yo'q" desa — u allaqachon o'chirilgan, ya'ni
   * biz xohlagan natija allaqachon bor. Xato qaytarmaymiz, bazani
   * haqiqatga moslashtiramiz.
   */
  async deleteMessage(options: { conversation: Conversation; message: Message }): Promise<Message> {
    const { conversation, message } = options;

    // Telegramga hech qachon ketmagan xabar — Telegram butunlay chetlab
    // o'tiladi (`editText`dagi izohga qarang, sabab bir xil).
    if (message.telegramMsgId !== null) {
      const peer = this.peerFromConversation(conversation);
      if (!peer) {
        throw new AppError(
          'Mijozning Telegram profili aniqlanmagan — avval telefon raqami bo\'yicha qidiring',
          409,
          'PEER_UNKNOWN',
        );
      }

      const accountId = conversation.telegramAccountId;
      // MUHIM: xabar Telegramga ALLAQACHON yetib borgan bo'lishi mumkin,
      // suhbat esa keyinroq akkauntini yo'qotgan (akkaunt o'chirilganda —
      // `PgTelegramAccountRepository.remove()` — shu akkauntga bog'liq
      // suhbatlarning `telegram_account_id` si NULL qilinadi). Bu holatni
      // "hech qachon ketmagan xabar" bilan aralashtirib bo'lmaydi: mijozda
      // xabar hali ham turibdi, shuning uchun bazani "o'chirildi" deb
      // yozib qo'yish yolg'on bo'ladi.
      if (!accountId) throw new AppError('Telegram akkaunt tanlanmagan', 409, 'NO_ACCOUNT');

      try {
        await this.gateway.deleteMessage(accountId, peer, message.telegramMsgId);
      } catch (err) {
        if (!isMessageGone(err)) throw err;
        log.info({ messageId: message.id }, 'Xabar Telegramda allaqachon yo\'q edi');
      }
    }

    const updated = await this.messages.markRevoked(message.id, this.clock.now());
    this.events.publish({
      type: 'message.updated',
      conversationId: conversation.id,
      messageId: message.id,
    });
    return updated;
  }

  private peerFromConversation(conversation: Conversation): ResolvedPeer | null {
    if (!conversation.peerId) return null;
    return {
      telegramUserId: conversation.peerId,
      accessHash: conversation.peerAccessHash,
      username: null,
      firstName: null,
      lastName: null,
    };
  }
}

/** Chatda to'g'ri ko'rsatish uchun fayl turini MIME'dan aniqlaymiz. */
function kindFromMime(mimeType: string | null, asDocument?: boolean): MediaKind {
  if (asDocument || !mimeType) return 'document';
  if (mimeType.startsWith('image/')) return 'photo';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('video/')) return 'video';
  return 'document';
}
