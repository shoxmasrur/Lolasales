import type { MessageDispatcher } from '@/application/services/MessageDispatcher';
import type { CreateClientFromContract } from '@/application/usecases/clients/CreateClientFromContract';
import type { MijozgaBoglashUseCase } from '@/application/usecases/conversations/MijozgaBoglashUseCase';
import { allPhones, type Client } from '@/domain/entities/Client';
import type { Conversation } from '@/domain/entities/Conversation';
import { NOMALUM_SABAB_OPERATOR, NOMALUM_SABAB_TASDIQ } from '@/domain/entities/NomalumSuhbat';
import type { IClientPhoneBlockRepository } from '@/domain/repositories/IClientPhoneBlockRepository';
import type { IClientRepository } from '@/domain/repositories/IClientRepository';
import type { IContractRepository } from '@/domain/repositories/IContractRepository';
import type { IConversationRepository } from '@/domain/repositories/IConversationRepository';
import type { INomalumSuhbatRepository } from '@/domain/repositories/INomalumSuhbatRepository';
import { boglashQarori } from '@/domain/services/boglashQarori';
import { shartnomaRaqaminiTozala } from '@/domain/services/shartnomaRaqami';
import type { IEventBus } from '@/domain/services/support';
import { ConflictError } from '@/shared/errors';
import { childLogger } from '@/shared/logger';
import { normalizePhone } from '@/shared/phone';

const log = childLogger('shartnoma-boglovchi');

// Mijozga ko'rinadigan tayyor matnlar — model emas, kod yozadi.
export const MATN_TASDIQ = 'Rahmat! Ma\'lumotlaringizni tekshirib, tez orada javob beramiz.';
export const MATN_TOPILMADI = 'Bu raqamli shartnoma topilmadi. Iltimos, raqamni tekshirib, qayta yozing.';
export const MATN_CRM_XATO = 'Rahmat! Tekshirib, tez orada javob beramiz.';
/**
 * Telefon mos kelmasa/yashirin bo'lsa: shartnoma raqamini bilish egasi
 * ekanini isbotlamaydi (raqam chekda, guruhda ko'rinib qolgan bo'lishi
 * mumkin). Operator hujjat rasmini ko'rib tasdiqlaydi.
 */
export const MATN_HUJJAT_SORASH =
  'Rahmat! Shaxsingizni tasdiqlash uchun pasportingiz yoki shartnomangizning birinchi beti rasmini yuboring.';

/** Shuncha marta topilmasa — operatorga: odam raqamni bilmaydi yoki adashyapti. */
export const URINISHLAR_CHEGARASI = 2;

const ACTOR = 'nomalum-agent';
// Matnlar domen faylida: bog'lash use case'i ularni tanib bayroqni tushiradi.
const SABAB_TASDIQ = NOMALUM_SABAB_TASDIQ;
const SABAB_OPERATOR = NOMALUM_SABAB_OPERATOR;

export interface ShartnomaBoglovchiDeps {
  contracts: Pick<IContractRepository, 'findByContractNo'>;
  clients: Pick<IClientRepository, 'findById'>;
  conversations: Pick<IConversationRepository, 'findById' | 'findLiveByClientAndAccount' | 'update'>;
  phoneBlocks: Pick<IClientPhoneBlockRepository, 'listForClient'>;
  fromContract: Pick<CreateClientFromContract, 'preview' | 'execute'>;
  nomalum: INomalumSuhbatRepository;
  boglash: Pick<MijozgaBoglashUseCase, 'execute'>;
  dispatcher: Pick<MessageDispatcher, 'send'>;
  events: IEventBus;
}

export type Topilgan =
  | { kind: 'topildi'; clientId: string; crmTelefonlar: string[] }
  | { kind: 'topilmadi' }
  | { kind: 'crm_xato'; sabab: string };

/**
 * Noma'lum odam yozgan shartnoma raqami bo'yicha suhbatni mijozga bog'laydi.
 *
 * XAVFSIZLIK: qaror to'liq kodda (`boglashQarori`). Avtomatik bog'lash faqat
 * odamning Telegram raqami mijozning CRM'dagi (uzilmagan) raqamiga mos kelsa;
 * aks holda odamdan hujjat rasmi so'raladi va operator tasdiqlaydi. Aks holda begona odam birovning shartnoma
 * raqamini yozib, uning to'lov ma'lumotini ko'rib olardi.
 */
export class ShartnomaBoglovchi {
  constructor(private readonly deps: ShartnomaBoglovchiDeps) {}

  /** Agent yozdirgan raqam bo'yicha: qidiradi, qaror qiladi, bajaradi. Rad etmaydi. */
  async tekshir(conversationId: string, raqam: string, signal?: AbortSignal): Promise<void> {
    const d = this.deps;
    try {
      const holat = await d.nomalum.find(conversationId);
      const conversation = await d.conversations.findById(conversationId);
      if (!holat || !conversation) {
        log.warn({ conversationId }, 'Noma\'lum suhbat topilmadi — tekshiruv o\'tkazib yuborildi');
        return;
      }
      // Allaqachon hal bo'lgan (yoki mijozi topilib, hujjati kutilayotgan)
      // suhbatni qayta ochmaymiz (poyga: ikki navbat).
      if (holat.holat === 'boglandi' || holat.holat === 'tasdiq_kutilmoqda' || holat.holat === 'hujjat_kutilmoqda') return;

      const toza = shartnomaRaqaminiTozala(raqam);
      const topilgan: Topilgan = toza ? await this.topVaYarat(toza) : { kind: 'topilmadi' };
      if (signal?.aborted) return;

      let qarorKirish: Parameters<typeof boglashQarori>[0]['topilgan'];
      if (topilgan.kind === 'topildi') {
        const client = await d.clients.findById(topilgan.clientId);
        if (!client) throw new Error(`Mijoz topilmadi: ${topilgan.clientId}`);
        // Yozayotgan odamning Telegram id'si — noma'lum mijoz qatorida.
        const yozuvchi = await d.clients.findById(conversation.clientId);
        qarorKirish = {
          kind: 'topildi',
          clientId: topilgan.clientId,
          telefonlar: await this.telefonlar(client, topilgan.crmTelefonlar),
          boshqaSuhbatBor: await this.boshqaSuhbatBor(topilgan.clientId, conversation),
          // Mijozda boshqa Telegram hisobi saqlangan bo'lsa, avtomatik bog'lash
          // uni jimgina almashtirardi (`setTelegramIdentity` shartsiz UPDATE).
          boshqaTelegram: Boolean(client.telegramUserId && client.telegramUserId !== yozuvchi?.telegramUserId),
        };
      } else {
        qarorKirish = topilgan;
      }
      const qaror = boglashQarori({ topilgan: qarorKirish, telegramTelefon: holat.telegramTelefon });
      if (signal?.aborted) return;

      switch (qaror.kind) {
        case 'boglash':
          try {
            await d.boglash.execute({ conversationId, clientId: qaror.clientId, actor: ACTOR, birlashtir: false });
            log.info({ conversationId, clientId: qaror.clientId }, 'Noma\'lum suhbat telefon bo\'yicha avtomatik bog\'landi');
          } catch (err) {
            // Tekshiruvdan keyin mijozda suhbat paydo bo'lgan (poyga) — operator hal qilsin.
            if (!(err instanceof ConflictError)) throw err;
            log.warn({ err, conversationId }, 'Avtomatik bog\'lab bo\'lmadi — tasdiqqa');
            await this.tasdiqqa(conversation, toza, qaror.clientId, err.message);
          }
          return;
        case 'tasdiq_kerak':
          // Telefon bilan isbotlanmadi — avval hujjat rasmi so'raladi.
          await this.hujjatSora(conversation, toza, qaror.clientId, qaror.sabab);
          return;
        case 'topilmadi': {
          // `urinishlar` emas: u agentning "raqam so'rash" hisoblagichi. Salom bergan
          // odam ham ikki marta noto'g'ri raqam yozish imkoniga ega bo'lsin.
          const topilmagan = holat.topilmagan + 1;
          if (topilmagan >= URINISHLAR_CHEGARASI) {
            await d.nomalum.update(conversationId, { topilmagan, holat: 'operatorda', sabab: 'Shartnoma topilmadi' });
            // "Qayta yozing" deb bo'lmaydi — endi operator javob beradi.
            await this.yubor(conversation, MATN_CRM_XATO);
            await this.operatorBelgisi(conversationId, SABAB_OPERATOR);
          } else {
            await d.nomalum.update(conversationId, { topilmagan });
            await this.yubor(conversation, MATN_TOPILMADI);
            d.events.publish({ type: 'conversation.updated', conversationId });
          }
          return;
        }
        case 'crm_xato':
          await d.nomalum.update(conversationId, { holat: 'operatorda', sabab: qaror.sabab });
          await this.yubor(conversation, MATN_CRM_XATO);
          await this.operatorBelgisi(conversationId, SABAB_OPERATOR);
          return;
      }
    } catch (err) {
      if (signal?.aborted) return;
      // Rad etmaymiz: agent navbati buzilmasin. Odam operatorga o'tadi.
      log.error({ err, conversationId }, 'Shartnomani bog\'lash kutilmagan xato berdi');
      try {
        await d.nomalum.update(conversationId, { holat: 'operatorda', sabab: 'Shartnomani tekshirib bo\'lmadi' });
        await this.operatorBelgisi(conversationId, SABAB_OPERATOR);
      } catch (err2) {
        log.error({ err: err2, conversationId }, 'Operatorga o\'tkazib ham bo\'lmadi');
      }
    }
  }

  /**
   * Avval bizning baza (CRM'ni bezovta qilmaslik uchun), keyin CRM; CRM'da
   * bo'lsa mijoz yaratiladi. Ochiq: operatorning "Bog'lash" marshruti ham shu
   * qidiruvdan foydalanadi — ikki joyda alohida mantiq bo'lmasin.
   * `raqam` tozalangan bo'lishi shart (`shartnomaRaqaminiTozala`).
   */
  async topVaYarat(raqam: string, actor: string = ACTOR): Promise<Topilgan> {
    const d = this.deps;
    const shartnoma = await d.contracts.findByContractNo(raqam);
    if (shartnoma) return { kind: 'topildi', clientId: shartnoma.clientId, crmTelefonlar: [] };

    const preview = await d.fromContract.preview(raqam);
    if (preview.outcome === 'not_found') return { kind: 'topilmadi' };
    if (preview.outcome !== 'ok') return { kind: 'crm_xato', sabab: `CRM: ${preview.outcome}` };

    const natija = await d.fromContract.execute(raqam, actor);
    if (natija.outcome === 'not_found') return { kind: 'topilmadi' };
    if (!natija.clientId) return { kind: 'crm_xato', sabab: `CRM: ${natija.outcome}` };
    return { kind: 'topildi', clientId: natija.clientId, crmTelefonlar: preview.contract?.phones ?? [] };
  }

  /**
   * Solishtiriladigan raqamlar: mijoz kartasi + CRM shartnomasi, normallashtirilgan.
   * Uzilgan (bloklangan) raqam chiqarib tashlanadi — u endi boshqa odamda
   * bo'lishi mumkin, mos kelishi esa egasi ekanini isbotlamaydi.
   */
  private async telefonlar(client: Client, crmTelefonlar: string[]): Promise<string[]> {
    const bloklangan = new Set(
      (await this.deps.phoneBlocks.listForClient(client.id)).map((p) => normalizePhone(p)).filter((p): p is string => Boolean(p)),
    );
    const hammasi = [...allPhones(client), ...crmTelefonlar]
      .map((p) => normalizePhone(p))
      .filter((p): p is string => Boolean(p) && !bloklangan.has(p as string));
    return [...new Set(hammasi)];
  }

  private async boshqaSuhbatBor(clientId: string, conversation: Conversation): Promise<boolean> {
    const bor = await this.deps.conversations.findLiveByClientAndAccount(clientId, conversation.telegramAccountId);
    return Boolean(bor && bor.id !== conversation.id);
  }

  private async tasdiqqa(conversation: Conversation, raqam: string | null, clientId: string, sabab: string): Promise<void> {
    const d = this.deps;
    await d.nomalum.update(conversation.id, {
      holat: 'tasdiq_kutilmoqda', topilganClientId: clientId, sabab, ...(raqam ? { shartnomaRaqami: raqam } : {}),
    });
    await this.yubor(conversation, MATN_TASDIQ);
    await this.operatorBelgisi(conversation.id, SABAB_TASDIQ);
  }

  /**
   * Hujjat (pasport yoki shartnomaning 1-beti) rasmi so'raladi. `needsHuman`
   * HALI qo'yilmaydi: rasm yo'q paytda operatorda tekshiradigan narsa yo'q.
   * Rasm kelganda `NomalumHujjatQabul` suhbatni `tasdiq_kutilmoqda` ga
   * o'tkazib operatorni chaqiradi. Topilgan mijoz faqat holat qatorida —
   * odamga uning hech qanday ma'lumoti aytilmaydi.
   */
  private async hujjatSora(conversation: Conversation, raqam: string | null, clientId: string, sabab: string): Promise<void> {
    const d = this.deps;
    await d.nomalum.update(conversation.id, {
      holat: 'hujjat_kutilmoqda', topilganClientId: clientId, sabab, ...(raqam ? { shartnomaRaqami: raqam } : {}),
    });
    await this.yubor(conversation, MATN_HUJJAT_SORASH);
    d.events.publish({ type: 'conversation.updated', conversationId: conversation.id });
  }

  private async operatorBelgisi(conversationId: string, humanReason: string): Promise<void> {
    await this.deps.conversations.update(conversationId, { needsHuman: true, humanReason });
    this.deps.events.publish({ type: 'conversation.updated', conversationId });
  }

  /**
   * Tayyor matn. Yuborilmasa (kill switch, Telegram xatosi) holat baribir
   * saqlanadi — operator ro'yxatda ko'radi, shuning uchun xato yutiladi.
   * Muallif `agent`: mijoz uchun bu agent javobi.
   */
  private async yubor(conversation: Conversation, body: string): Promise<void> {
    try {
      await this.deps.dispatcher.send({ conversation, body, author: 'agent', meta: { nomalum: true, tayyorMatn: true } });
    } catch (err) {
      log.warn({ err, conversationId: conversation.id }, 'Tayyor matn yuborilmadi');
    }
  }
}
