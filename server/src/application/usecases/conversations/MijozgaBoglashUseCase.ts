import type { IClientRepository, TelegramIdentity } from '@/domain/repositories/IClientRepository';
import type { IConversationRepository } from '@/domain/repositories/IConversationRepository';
import type { IMessageRepository } from '@/domain/repositories/IMessageRepository';
import type { INomalumSuhbatRepository } from '@/domain/repositories/INomalumSuhbatRepository';
import type { IAuditRepository } from '@/domain/repositories/ISupportRepositories';
import type { IEventBus } from '@/domain/services/support';
import { readableBody } from '@/domain/entities/Message';
import { nomalumSababimi } from '@/domain/entities/NomalumSuhbat';
import { ConflictError, NotFoundError } from '@/shared/errors';
import { childLogger } from '@/shared/logger';

const log = childLogger('mijozga-boglash');

export interface MijozgaBoglashDeps {
  clients: Pick<IClientRepository, 'findById' | 'nomalumniYopish' | 'setTelegramIdentity'>;
  conversations: Pick<IConversationRepository, 'findById' | 'findLiveByClientAndAccount' | 'reassignClient' | 'yopish' | 'update'>;
  messages: Pick<IMessageRepository, 'moveAll' | 'recentByConversation'>;
  nomalum: Pick<INomalumSuhbatRepository, 'find' | 'update'>;
  audit: Pick<IAuditRepository, 'record'>;
  events: IEventBus;
  /**
   * Bog'langandan keyin asosiy agent odamning oxirgi xabariga javob beradi.
   * Konteynerda bu debouncer navbatiga qo'yish (kutmaydi); xatosi faqat jurnalga.
   */
  agentReply: (conversationId: string, text: string) => Promise<unknown>;
}

export interface MijozgaBoglashInput {
  conversationId: string;
  clientId: string;
  actor: string;
  /** Haqiqiy mijozning shu akkauntda suhbati bo'lsa — noma'lum suhbat unga qo'shiladi. */
  birlashtir: boolean;
}

/**
 * Noma'lum suhbatni haqiqiy mijozga bog'laydi (yoki uning mavjud suhbatiga qo'shadi).
 *
 * TRANZAKSIYA YO'Q — ataylab: `withTransaction` bor, lekin repozitoriylar
 * global `pool` orqali yozadi va tranzaksiya mijozini qabul qilmaydi; ularni
 * qayta yozish bu vazifa doirasidan tashqarida. Shuning uchun qadamlar shunday
 * tartiblangan: qisman yiqilishda eng kam zarar qolsin — avval suhbat/xabarlar
 * ko'chadi (ma'lumot yo'qolmaydi), keyin noma'lum mijoz yopiladi, oxirida
 * Telegram ma'lumoti haqiqiy mijozga yoziladi.
 *
 * `softDelete` ISHLATILMAYDI: u mijozning suhbat va xabarlarini ham o'chiradi —
 * aynan biz ko'chirayotganlarini.
 */
export class MijozgaBoglashUseCase {
  constructor(private readonly deps: MijozgaBoglashDeps) {}

  async execute(input: MijozgaBoglashInput): Promise<{ conversationId: string }> {
    const d = this.deps;
    const { conversationId, clientId: realId, actor, birlashtir } = input;

    // (1) Hamma narsani o'qib, tekshirib olamiz — hali hech narsa o'zgarmagan.
    const nomConv = await d.conversations.findById(conversationId);
    if (!nomConv) throw new NotFoundError('Suhbat topilmadi');
    const nomClient = await d.clients.findById(nomConv.clientId);
    if (!nomClient?.nomalum) throw new ConflictError('Suhbat noma\'lum mijozniki emas');
    if (nomClient.id === realId) throw new ConflictError('Suhbat allaqachon shu mijozniki');
    const realClient = await d.clients.findById(realId);
    if (!realClient) throw new NotFoundError('Mijoz topilmadi');
    if (realClient.nomalum) throw new ConflictError('Noma\'lum mijozga bog\'lab bo\'lmaydi');

    // `access_hash` (akkaunt, peer) juftligiga bog'liq: kim topgani noma'lum
    // bo'lsa, suhbat akkaunti — xabar aynan shu akkauntdan kelgan.
    const hashAkkaunt = nomClient.telegramHashAccountId ?? nomConv.telegramAccountId;
    const identity: TelegramIdentity | null = nomClient.telegramUserId && hashAkkaunt
      ? {
          telegramUserId: nomClient.telegramUserId,
          telegramUsername: nomClient.telegramUsername,
          telegramAccessHash: nomClient.telegramAccessHash,
          telegramHashAccountId: hashAkkaunt,
          telegramName: nomClient.telegramName,
        }
      : null;

    // (2) Haqiqiy mijozning SHU akkauntdagi tirik suhbati. Bo'lsa `reassignClient`
    // UNIQUE (client_id, telegram_account_id) ga uriladi — faqat birlashtirish mumkin.
    const bor = await d.conversations.findLiveByClientAndAccount(realId, nomConv.telegramAccountId);
    const mavjud = bor && bor.id !== conversationId ? bor : null;
    if (mavjud && !birlashtir) {
      throw new ConflictError('Mijozning shu akkauntda boshqa suhbati bor — birlashtirish kerak');
    }

    // (3) Suhbat/xabarlar ko'chiriladi.
    let targetId = conversationId;
    if (mavjud) {
      await d.messages.moveAll(conversationId, mavjud.id);
      // Odam aynan noma'lum suhbatdagi peer orqali yozgan — javob o'shanga ketsin.
      await d.conversations.update(mavjud.id, {
        peerId: nomConv.peerId,
        peerAccessHash: nomConv.peerAccessHash,
        ...(nomConv.telegramAccountId ? { telegramAccountId: nomConv.telegramAccountId } : {}),
      });
      // Holat YOPISHDAN OLDIN `boglandi`: yopilgan suhbat ro'yxatda ko'rinmaydi,
      // lekin qator `tasdiq_kutilmoqda`/`operatorda` qolsa, kechikib kelgan
      // navbat yoki hisobot uni hali "ochiq noma'lum" deb o'qiydi.
      await d.nomalum.update(conversationId, { holat: 'boglandi', topilganClientId: realId });
      await d.conversations.yopish(conversationId);
      targetId = mavjud.id;
    } else {
      await d.conversations.reassignClient(conversationId, realId);
      await d.nomalum.update(conversationId, { holat: 'boglandi', topilganClientId: realId });
      // Noma'lum oqim qo'ygan operator belgisi (tasdiq kutilmoqda / operator
      // javob bersin) bog'lash bilan o'z vazifasini bajardi. Tushirilmasa
      // `canAgentReply` yopiq qoladi va (8) dagi javob jim tashlanadi — odam
      // tasdiqdan keyin javobsiz qolardi. Boshqa sabablarga (chek, agent
      // xatosi) tegilmaydi: ular bog'lashdan qat'i nazar operatorniki.
      if (nomConv.needsHuman && nomalumSababimi(nomConv.humanReason)) {
        await d.conversations.update(conversationId, { needsHuman: false, humanReason: null, humanKind: null });
      }
    }

    // (4) Noma'lum mijoz qatori yopiladi; Telegram id undan tozalanadi —
    // keyingi kiruvchi xabar haqiqiy mijozga tushsin.
    await d.clients.nomalumniYopish(nomClient.id);

    // (5) Telegram ma'lumoti haqiqiy mijozga.
    if (identity) {
      await d.clients.setTelegramIdentity(realId, identity, 'found');
    } else {
      log.warn({ conversationId, unknownClientId: nomClient.id }, 'Noma\'lum mijozda Telegram id yo\'q — identifikator ko\'chirilmadi');
    }

    // (6) Audit.
    await d.audit.record({
      actor,
      action: 'conversation.nomalum_boglandi',
      entity: 'conversation',
      entityId: targetId,
      payload: {
        unknownClientId: nomClient.id, realClientId: realId, birlashtir: Boolean(mavjud),
        // Operator tasdig'i bilan boshqa Telegram hisobi almashtirilishi mumkin —
        // eskisi izsiz yo'qolmasin.
        oldingiTelegram: realClient.telegramUserId
          ? { telegramUserId: realClient.telegramUserId, telegramUsername: realClient.telegramUsername }
          : null,
      },
    });

    // (7) Ekranlar yangilansin.
    d.events.publish({ type: 'conversation.updated', conversationId: targetId });
    if (targetId !== conversationId) d.events.publish({ type: 'conversation.updated', conversationId });
    d.events.publish({ type: 'stats.invalidate' });

    // (8) Odam javobsiz qolmasin: asosiy agent oxirgi kiruvchi xabarga javob
    // beradi. Yiqilsa bog'lash bekor qilinmaydi — operator ko'radi.
    try {
      const matn = await this.oxirgiKiruvchi(targetId);
      if (matn) await d.agentReply(targetId, matn);
    } catch (err) {
      log.error({ err, conversationId: targetId }, 'Bog\'langandan keyin agent javobi yiqildi');
    }

    return { conversationId: targetId };
  }

  private async oxirgiKiruvchi(conversationId: string): Promise<string | null> {
    const xabarlar = await this.deps.messages.recentByConversation(conversationId, 20);
    for (const m of [...xabarlar].reverse()) {
      if (m.direction !== 'in') continue;
      const matn = readableBody(m);
      if (matn) return matn;
    }
    return null;
  }
}
