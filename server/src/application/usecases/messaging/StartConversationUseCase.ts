import type { Conversation } from '@/domain/entities/Conversation';
import { isContactable } from '@/domain/entities/Client';
import type { IClientRepository } from '@/domain/repositories/IClientRepository';
import type { IConversationRepository } from '@/domain/repositories/IConversationRepository';
import type { IMessageRepository } from '@/domain/repositories/IMessageRepository';
import type { IAuditRepository } from '@/domain/repositories/ISupportRepositories';
import type { IEventBus } from '@/domain/services/support';
import type { AgentRunner } from '@/application/services/AgentRunner';
import type { ClientTelegramResolver } from '@/application/services/ClientTelegramResolver';
import type { ITelegramGateway } from '@/domain/services/ITelegramGateway';
import { contactName } from '@/domain/services/contactName';
import { RESOLVE_REASONS } from '@/application/services/resolveSabablari';
import { AbortedError, AppError, NotFoundError } from '@/shared/errors';
import { childLogger } from '@/shared/logger';

const log = childLogger('start-conversation');

export type StartConversationResult =
  | { status: 'started'; conversation: Conversation; reply: string | null }
  | {
      status: 'skipped';
      reason: string;
      conversation: Conversation | null;
      /** Akkaunt vaqtincha band (kvota, flood-wait) — keyinroq qayta urinish mumkin. */
      retryLater?: boolean;
    };

export interface StartConversationOptions {
  /**
   * Telegramdagi ism mijozning ismiga mos kelmasa ham xabar yuborish.
   *
   * Sukut bo'yicha bunday mijozga YOZILMAYDI: raqam boshqa odamga o'tgan
   * bo'lsa, xabar begonaga ketadi. Bu bayroq faqat operator
   * dashboardda ogohlantirishni va ro'yxatni ko'rib, ataylab tasdiqlaganda
   * keladi — va har bir bunday mijoz jurnalga alohida yoziladi.
   */
  readonly allowNameMismatch?: boolean;
  /** Kim boshlagani — jurnalga tushadi. */
  readonly actor?: string;
  /**
   * Akkaunti yo'q mijozni avtomatik biriktirmaslik.
   *
   * NEGA: chaqiruvchi akkauntlarni O'ZI tanlab, taqsimlashni oldindan
   * bajargan bo'lsa (ommaviy suhbat boshlash), shundan keyin avtomatik
   * biriktirish operatorning tanlovini buzadi — u HAMMA yaroqli akkaunt
   * orasidan tanlaydi va mijoz tanlanmagan akkauntdan xabar oladi.
   *
   * Faqat ommaviy oqim, operator akkaunt tanlaganda `true` beradi.
   * Import, kampaniya va bitta mijoz oqimlarida bu bayroq berilmaydi —
   * ular uchun avtomatik biriktirish ishlab turishi SHART.
   */
  readonly noAutoAssign?: boolean;
  /**
   * Bu mijozni yarim yo'lda uzish uchun.
   *
   * NEGA: bitta mijozni boshlash sekin — Telegram qidiruvi, keyin model javobi. Ommaviy
   * ish "To'xtatish"ni bosgan operator shu bosqichlarning tugashini
   * kutmasligi kerak: signal kelishi bilan qadamlar orasidagi tekshiruvlar
   * `AbortedError` tashlaydi va mijozga xabar KETMAYDI.
   */
  readonly signal?: AbortSignal;
}

/**
 * Mijoz (lead) bilan birinchi aloqani boshlaydi:
 * telefon → Telegram profili (guruh/reklama leadida u allaqachon 'found' —
 * qidiruvsiz) → suhbat yozuvi → agentning birinchi xabari.
 * Sotuvda har bir yaroqli lead yoziladi.
 */
export class StartConversationUseCase {
  constructor(
    private readonly clients: IClientRepository,
    private readonly conversations: IConversationRepository,
    private readonly resolver: ClientTelegramResolver,
    private readonly agent: AgentRunner,
    private readonly audit: IAuditRepository,
    private readonly events: IEventBus,
    private readonly telegram: ITelegramGateway,
    /** Takror birinchi xabardan himoya — suhbatda ketgan xabar bormi. */
    private readonly messages: IMessageRepository,
  ) {}

  async execute(
    clientId: string,
    options: StartConversationOptions = {},
  ): Promise<StartConversationResult> {
    this.tekshir(options.signal);

    const client = await this.clients.findById(clientId);
    if (!client) throw new NotFoundError('Mijoz', clientId);

    if (!isContactable(client)) {
      return { status: 'skipped', reason: 'Mijoz bilan bog\'lanish taqiqlangan yoki raqami yo\'q', conversation: null };
    }

    const existing = await this.conversations.findByClientId(clientId);

    if (existing && existing.state !== 'new') {
      return { status: 'skipped', reason: 'Suhbat allaqachon boshlangan', conversation: existing };
    }
    // `new` holatining o'zi yetmaydi: holat `new` dan faqat xabar ketgandan
    // KEYIN chiqadi (`AgentRunner`). Jarayon Telegram yetkazgandan keyin,
    // holat yangilanishidan oldin o'lsa (deploy kutish muddati tugashi,
    // SIGKILL, xotira tugashi) suhbat `new` bo'lib qoladi va tiklangan
    // ommaviy ish mijozga IKKINCHI birinchi xabarni yuborardi. Shuning
    // uchun yetib borgan bo'lishi mumkin bo'lgan har qanday chiquvchi
    // xabar (`sending` ham) suhbat boshlangan deb sanaladi — shubha
    // bo'lganda yozmaymiz. Faqat aniq yiqilgan (`failed`) va qoralama
    // (`draft`) hisobga olinmaydi: ular mijozga yetmagan.
    if (existing && (await this.messages.hasPossiblyDeliveredOutbound(existing.id))) {
      return { status: 'skipped', reason: 'Suhbat allaqachon boshlangan', conversation: existing };
    }

    // Ism mos kelmagan mijozga ruxsat berilgan bo'lsa — buni ALOHIDA
    // yozib qo'yamiz. Keyin "bu odamga nega yozilgan?" degan savol
    // chiqsa, javob jurnalda turadi.
    const overrideMismatch =
      options.allowNameMismatch === true && client.telegramStatus === 'name_mismatch';
    if (overrideMismatch) {
      await this.audit.record({
        actor: options.actor ?? 'operator',
        action: 'client.name_mismatch_override',
        entity: 'client',
        entityId: client.id,
        payload: {
          mijoz: client.fullName,
          telegramda: client.telegramName,
          phone: client.phone,
        },
      });
    }

    // Telegram qidiruvi ham tarmoq so'rovi — undan oldin oxirgi imkoniyat
    // hech narsa qilmasdan chiqish.
    this.tekshir(options.signal);

    const resolved = await this.resolver.resolve(client, {
      allowNameMismatch: options.allowNameMismatch,
      noAutoAssign: options.noAutoAssign,
    });
    if (resolved.kind !== 'ok') {
      const reason =
        resolved.kind === 'account_unavailable'
          ? resolved.reason
          : (RESOLVE_REASONS[resolved.kind] ?? 'Telegram profili aniqlanmadi');
      return {
        status: 'skipped',
        reason,
        conversation: existing,
        ...(resolved.kind === 'account_unavailable' && resolved.temporary ? { retryLater: true } : {}),
      };
    }

    // Mos kelmaslik AYNAN shu qidiruvda topilgan bo'lsa, yuqoridagi
    // tekshiruv uni ko'rmagan: qidiruv boshlanganda mijozning holati hali
    // `name_mismatch` emas edi. Ommaviy boshlashda ko'pchilik holat aynan
    // shunday — operator hali qidirilmagan mijozlarni tanlaydi.
    //
    // `overrideMismatch` allaqachon yozgan bo'lsa takrorlamaymiz: holati
    // `name_mismatch` bo'lgan mijozda kesh yaroqsiz bo'lsa qidiruv qayta
    // bajariladi va ikkala yo'l ham ishlab ketadi.
    if (resolved.value.nameMismatchOverridden && !overrideMismatch) {
      await this.audit.record({
        actor: options.actor ?? 'operator',
        action: 'client.name_mismatch_override',
        entity: 'client',
        entityId: client.id,
        payload: {
          mijoz: client.fullName,
          telegramda: resolved.value.telegramName ?? null,
          phone: client.phone,
          // Holati oldindan ma'lum emas edi — operator ro'yxatni ko'rib
          // emas, "chiqsa ham yuborilsin" deb umumiy ruxsat bergan.
          qidiruvda_topildi: true,
        },
      });
    }

    // Shu yerdan keyin uzilsa bazada `new` holatidagi bo'sh suhbat qolishi
    // mumkin. Bu ATAYLAB qabul qilingan: `AGENT_NO_REPLY` yo'li ham aynan
    // shunday qoldiradi va `execute()` yuqorida `new` suhbatni davom
    // ettirish mumkin deb qaraydi — operator qaytadan boshlaganda o'sha
    // yozuv qayta ishlatiladi, dubl chiqmaydi.
    const conversation =
      existing ??
      (await this.conversations.create({
        clientId,
        telegramAccountId: resolved.value.accountId,
      }));

    const prepared = await this.conversations.update(conversation.id, {
      telegramAccountId: resolved.value.accountId,
      peerId: resolved.value.peer.telegramUserId,
      peerAccessHash: resolved.value.peer.accessHash,
    });

    if (!existing) {
      this.events.publish({ type: 'conversation.created', conversationId: prepared.id });
    }

    // Eng qimmat qadam — model javobi. Signal ichkariga ham uzatiladi:
    // chaqiruv yarim yo'lda uziladi va tayyor bo'lgan matn yuborilmaydi.
    this.tekshir(options.signal);

    const turn = await this.agent.firstContact(prepared.id, options.signal);
    if (!turn.sent && !turn.reply) {
      throw new AppError('Agent birinchi xabarni tayyorlay olmadi', 502, 'AGENT_NO_REPLY');
    }

    // BU YERDAN KEYIN to'xtatish tekshiruvi YO'Q — ataylab.
    //
    // Xabar mijozning telefonida turibdi, uni qaytarib bo'lmaydi. Endi
    // uzilish faqat hisob-kitobni buzardi: kontakt yozilmay qolardi,
    // chaqiruvchi esa yuborilgan xabarni "boshlanmadi" deb ko'rardi.
    // To'xtatish yuborishning OLDINI oladi, yuborilganini yashirmaydi.

    // Mijozni kontaktga qo'shamiz — faqat xabar HAQIQATAN ketgandan
    // keyin. Shunda kontaktda faqat yozgan mijozlarimiz bo'ladi va
    // ommaviy import naqshi chiqmaydi.
    //
    // Xato yutiladi: xabar allaqachon ketgan, kontakt esa ikkinchi
    // darajali. Keyingi suhbat boshlanganda o'zi qayta yoziladi.
    const name = contactName(client.fullName, client.firstName);
    await this.telegram
      .saveContact(resolved.value.accountId, resolved.value.peer, name.first, name.last)
      .catch((err) => {
        log.warn({ clientId, err }, 'Mijozni kontaktga qo\'shib bo\'lmadi');
      });

    const refreshed = (await this.conversations.findById(prepared.id)) ?? prepared;
    return { status: 'started', conversation: refreshed, reply: turn.reply };
  }

  /** Operator to'xtatgan bo'lsa qadamlar orasida uzamiz. */
  private tekshir(signal?: AbortSignal): void {
    if (signal?.aborted) throw new AbortedError('Suhbat boshlash to\'xtatildi');
  }
}
