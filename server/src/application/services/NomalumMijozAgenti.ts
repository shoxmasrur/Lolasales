import type { IEventBus } from '@/domain/services/support';
import type { IConversationRepository } from '@/domain/repositories/IConversationRepository';
import type { IMessageRepository } from '@/domain/repositories/IMessageRepository';
import type { INomalumSuhbatRepository } from '@/domain/repositories/INomalumSuhbatRepository';
import type { ITuzilganLlm } from '@/domain/services/ITuzilganLlm';
import { NOMALUM_SABAB_OPERATOR, NOMALUM_SABAB_TASDIQ, type NomalumSuhbat } from '@/domain/entities/NomalumSuhbat';
import { canAgentReply, type Conversation } from '@/domain/entities/Conversation';
import { readableBody } from '@/domain/entities/Message';
import { shartnomaRaqaminiTozala } from '@/domain/services/shartnomaRaqami';
import {
  NOMALUM_OUTPUT_SCHEMA,
  nomalumJavobniOqi,
  nomalumSystemPrompt,
  nomalumUserPrompt,
  type NomalumPromptKirish,
} from '@/infrastructure/ai/prompt/nomalumPrompt';
import { KillSwitchError } from '@/shared/errors';
import { childLogger } from '@/shared/logger';
import type { MessageDispatcher } from '@/application/services/MessageDispatcher';
import type { RuntimeSettings } from '@/application/services/RuntimeSettings';
import type { AbortReason } from '@/application/services/AgentRunner';

const log = childLogger('nomalum-agent');

/** Bitta noma'lum suhbatda agent eng ko'pi shuncha marta yozadi, keyin operator. */
export const AGENT_JAVOB_CHEGARASI = 6;

/**
 * Hujjat kutilayotganda matn yozgan odamga — model emas, tayyor matn.
 * Model bu holatda chaqirilmaydi: topilgan mijoz haqida u hech narsa
 * bilmaydi, lekin odam bilan "tortishib" qolishi yoki boshqa narsa so'rashi mumkin.
 */
export const MATN_HUJJAT_ESLATMA = 'Iltimos, pasportingiz yoki shartnomangizning birinchi beti rasmini yuboring.';

// Bog'lash use case'i shu matnni taniydi va tasdiqdan keyin belgini tushiradi.
const OPERATOR_SABABI = NOMALUM_SABAB_OPERATOR;

export interface NomalumNavbatNatijasi {
  yuborildi: boolean;
  shartnomaRaqami: string | null;
}

export interface NomalumMijozAgentiDeps {
  llm: ITuzilganLlm;
  nomalum: INomalumSuhbatRepository;
  conversations: Pick<IConversationRepository, 'findById' | 'update'>;
  messages: Pick<IMessageRepository, 'recentByConversation'>;
  dispatcher: Pick<MessageDispatcher, 'send'>;
  settings: Pick<RuntimeSettings, 'get'>;
  events: IEventBus;
  personaName: (conversationId: string) => Promise<string>;
  boglovchi: { tekshir(conversationId: string, raqam: string, signal?: AbortSignal): Promise<void> } | null;
}

/**
 * Notanish Telegram yozuvchisi bilan gaplashadigan agent.
 *
 * Mijoz/shartnoma ma'lumotini HECH QACHON ko'rmaydi: modelga faqat suhbat
 * tarixi va persona ismi beriladi.
 */
export class NomalumMijozAgenti {
  /** Konversatsiya bo'yicha ketayotgan model so'rovi — `abort` shuni uzadi. */
  private readonly ketayotgan = new Map<string, Set<AbortController>>();

  constructor(private readonly deps: NomalumMijozAgentiDeps) {}

  async reply(conversationId: string, incoming: string): Promise<NomalumNavbatNatijasi> {
    const yoq: NomalumNavbatNatijasi = { yuborildi: false, shartnomaRaqami: null };

    // Nazoratchi HAR QANDAY await'dan OLDIN ro'yxatga olinadi: find/settings/
    // findById paytida kelgan abort ham shu navbatni uzishi shart. Bitta
    // suhbatda bir vaqtda bir nechta navbat bo'lishi mumkin — shuning uchun to'plam.
    const controller = new AbortController();
    let set = this.ketayotgan.get(conversationId);
    if (!set) { set = new Set(); this.ketayotgan.set(conversationId, set); }
    set.add(controller);
    try {
      return await this.navbat(conversationId, incoming, controller, yoq);
    } finally {
      set.delete(controller);
      if (set.size === 0 && this.ketayotgan.get(conversationId) === set) this.ketayotgan.delete(conversationId);
    }
  }

  private async navbat(
    conversationId: string,
    incoming: string,
    controller: AbortController,
    yoq: NomalumNavbatNatijasi,
  ): Promise<NomalumNavbatNatijasi> {
    const d = this.deps;

    const suhbat = await d.nomalum.find(conversationId);
    if (controller.signal.aborted) return yoq;
    // Agent faqat `kutilmoqda` (model) va `hujjat_kutilmoqda` (tayyor eslatma)
    // da gapiradi; tasdiq/operator/mijoz_emas/boglandi — jim.
    if (!suhbat || (suhbat.holat !== 'kutilmoqda' && suhbat.holat !== 'hujjat_kutilmoqda')) return yoq;

    // Asosiy agent bilan bir xil yuborish darvozasi: operator suhbatni qo'lga
    // olgan (`needsHuman`), agentni o'chirgan yoki suhbat yopilgan bo'lsa —
    // model chaqirilmaydi, holat ham o'zgarmaydi (operator allaqachon ko'ryapti).
    const conversation = await d.conversations.findById(conversationId);
    if (!conversation || controller.signal.aborted) return yoq;
    if (!canAgentReply(conversation)) return yoq;

    const settings = await d.settings.get();
    if (controller.signal.aborted) return yoq;
    if (!settings.nomalumAgent) {
      // Agent o'chiq: odam javobsiz qolmasin, operator ko'rsin.
      await this.operatorga(conversationId, 'Noma\'lum mijoz agenti o\'chirilgan', suhbat);
      return yoq;
    }
    // Kill switch o'chirilgach suhbat shu holatda kutaveradi — holat o'zgarmaydi.
    if (settings.killSwitch) return yoq;
    // Qo'lda tasdiqlash rejimi (`agentAutoReply` o'chiq): asosiy agent bu
    // rejimda qoralama qoldiradi. Notanish odamga qoralama ham yozilmaydi —
    // model chaqirilmaydi, suhbat operatorga beriladi.
    if (!settings.agentAutoReply) {
      await this.operatorga(conversationId, 'Qo\'lda tasdiqlash rejimi — noma\'lum odamga operator javob beradi', suhbat);
      return yoq;
    }

    if (suhbat.agentJavoblari >= AGENT_JAVOB_CHEGARASI) {
      await this.operatorga(conversationId, 'Agent javob chegarasiga yetdi', suhbat);
      return yoq;
    }

    // Hujjat kutilmoqda: model CHAQIRILMAYDI (topilgan mijoz bor, suhbatni
    // modelga berish xavfli va keraksiz) — faqat tayyor eslatma. Yuqoridagi
    // barcha darvozalar (operator, kill switch, chegara) bunga ham tegishli.
    if (suhbat.holat === 'hujjat_kutilmoqda') return this.hujjatEslatmasi(suhbat, conversation, controller, yoq);

    const kirish = await this.kirish(suhbat, incoming, settings.sotuvRaqami);
    if (controller.signal.aborted) return yoq;

    let javob;
    try {
      const xom = await d.llm.generate({
        system: nomalumSystemPrompt(kirish),
        user: nomalumUserPrompt(kirish),
        schema: NOMALUM_OUTPUT_SCHEMA,
        signal: controller.signal,
      });
      javob = nomalumJavobniOqi(xom);
    } catch (err) {
      // Mijoz yoki operator to'xtatgan — nosozlik emas, holat o'zgarmaydi.
      if (controller.signal.aborted) return yoq;
      log.error({ err, conversationId }, 'Noma\'lum agent modeli xato berdi');
      await this.operatorga(conversationId, 'Agent javob bera olmadi');
      return yoq;
    }
    if (controller.signal.aborted) return yoq;
    if (!javob) {
      await this.operatorga(conversationId, 'Agent javobi noto\'g\'ri shaklda');
      return yoq;
    }

    let yuborildi = false;
    if (javob.reply && !controller.signal.aborted) {
      try {
        await d.dispatcher.send({
          conversation,
          body: javob.reply,
          author: 'agent',
          simulateTyping: true,
          meta: { nomalum: true },
        });
        yuborildi = true;
      } catch (err) {
        // Kill switch yuborish payti yoqilgan bo'lishi mumkin: jim qaytamiz.
        if (err instanceof KillSwitchError) return yoq;
        throw err;
      }
    }

    const raqam = shartnomaRaqaminiTozala(javob.shartnomaRaqami);
    await d.nomalum.update(conversationId, {
      agentJavoblari: suhbat.agentJavoblari + (yuborildi ? 1 : 0),
      // Raqam kelmagan har bir javob = bitta so'rov urinishi.
      urinishlar: suhbat.urinishlar + (raqam ? 0 : 1),
      ...(raqam ? { shartnomaRaqami: raqam } : {}),
    });

    if (raqam) {
      // Holatni (tasdiq/bog'landi/operator) bog'lovchi o'zi belgilaydi.
      if (d.boglovchi) {
        try {
          await d.boglovchi.tekshir(conversationId, raqam, controller.signal);
        } catch (err) {
          if (controller.signal.aborted) return { yuborildi, shartnomaRaqami: raqam };
          log.error({ err, conversationId }, 'Shartnomani bog\'lash xato berdi');
          await this.operatorga(conversationId, 'Shartnomani tekshirib bo\'lmadi');
        }
      }
    } else if (javob.maqsad === 'xarid') {
      await d.nomalum.update(conversationId, { holat: 'mijoz_emas', sabab: 'Xaridor — sotuv bo\'limiga yo\'naltirildi' });
      d.events.publish({ type: 'conversation.updated', conversationId });
    } else if (javob.operatorga) {
      await this.operatorga(conversationId, 'Agent operatorga topshirdi');
    }

    return { yuborildi, shartnomaRaqami: raqam };
  }

  private async hujjatEslatmasi(
    suhbat: NomalumSuhbat,
    conversation: Conversation,
    controller: AbortController,
    yoq: NomalumNavbatNatijasi,
  ): Promise<NomalumNavbatNatijasi> {
    if (controller.signal.aborted) return yoq;
    try {
      await this.deps.dispatcher.send({
        conversation,
        body: MATN_HUJJAT_ESLATMA,
        author: 'agent',
        meta: { nomalum: true, tayyorMatn: true },
      });
    } catch (err) {
      if (err instanceof KillSwitchError) return yoq;
      throw err;
    }
    // Hisoblagich oshadi: odam rasm o'rniga yozaversa, 6-javobdan keyin operator.
    await this.deps.nomalum.update(suhbat.conversationId, { agentJavoblari: suhbat.agentJavoblari + 1 });
    return { yuborildi: true, shartnomaRaqami: null };
  }

  /** Ketayotgan barcha navbatlarni uzadi; nechtasi uzilgani. */
  abort(conversationId: string, reason: AbortReason): number {
    const set = this.ketayotgan.get(conversationId);
    if (!set?.size) return 0;
    // Nusxa bo'yicha yuramiz: abort `finally` ni uyg'otib to'plamni o'zgartiradi.
    const hammasi = [...set];
    log.info({ conversationId, reason, soni: hammasi.length }, 'Noma\'lum agent navbati uzildi');
    for (const c of hammasi) c.abort();
    return hammasi.length;
  }

  private async kirish(suhbat: NomalumSuhbat, incoming: string, sotuvRaqami: string): Promise<NomalumPromptKirish> {
    const d = this.deps;
    const xabarlar = await d.messages.recentByConversation(suhbat.conversationId, 20);
    const tarix: NomalumPromptKirish['tarix'] = [];
    for (const m of xabarlar) {
      // `note` — mijozga ketmaydigan ichki qayd, modelga ham berilmaydi.
      if (m.direction !== 'in' && m.direction !== 'out') continue;
      const text = readableBody(m);
      if (text) tarix.push({ direction: m.direction, text });
    }
    // Yangi xabar hali tarixda bo'lmasa (saqlash poygasi) — oxiriga qo'shamiz.
    if (tarix[tarix.length - 1]?.direction !== 'in' && incoming.trim()) {
      tarix.push({ direction: 'in', text: incoming.trim() });
    }
    return {
      personaName: await d.personaName(suhbat.conversationId),
      sotuvRaqami,
      urinishlar: suhbat.urinishlar,
      tarix,
    };
  }

  /**
   * `suhbat` berilsa va u hujjat kutayotgan bo'lsa — `operatorda` EMAS,
   * `tasdiq_kutilmoqda`: mijoz allaqachon topilgan, operatorda bir bosishli
   * "Tasdiqlash" qolishi kerak. `topilganClientId`/`shartnomaRaqami`/`sabab`
   * tegilmaydi; odamga hech narsa yozilmaydi. Compare-and-set: shu payt rasm
   * kelib holatni o'zi o'tkazgan bo'lsa, u operatorni allaqachon chaqirgan.
   */
  private async operatorga(conversationId: string, sabab: string, suhbat?: NomalumSuhbat): Promise<void> {
    const d = this.deps;
    if (suhbat?.holat === 'hujjat_kutilmoqda') {
      if (await d.nomalum.holatniAlmashtir(conversationId, 'hujjat_kutilmoqda', 'tasdiq_kutilmoqda')) {
        await d.conversations.update(conversationId, { needsHuman: true, humanReason: NOMALUM_SABAB_TASDIQ });
        d.events.publish({ type: 'conversation.updated', conversationId });
      }
      return;
    }
    await d.nomalum.update(conversationId, { holat: 'operatorda', sabab });
    await d.conversations.update(conversationId, { needsHuman: true, humanReason: OPERATOR_SABABI });
    d.events.publish({ type: 'conversation.updated', conversationId });
  }
}
