import type { MessageDispatcher } from '@/application/services/MessageDispatcher';
import { canAgentReply } from '@/domain/entities/Conversation';
import { NOMALUM_SABAB_HUJJAT } from '@/domain/entities/NomalumSuhbat';
import type { IConversationRepository } from '@/domain/repositories/IConversationRepository';
import type { INomalumSuhbatRepository } from '@/domain/repositories/INomalumSuhbatRepository';
import type { IEventBus } from '@/domain/services/support';
import { childLogger } from '@/shared/logger';

const log = childLogger('nomalum-hujjat');

/** Hujjat rasmi kelganda odamga — tayyor matn, model emas. */
export const MATN_HUJJAT_QABUL = 'Rahmat! Tekshirib, tez orada javob beramiz.';

export interface NomalumHujjatQabulDeps {
  nomalum: Pick<INomalumSuhbatRepository, 'find' | 'holatniAlmashtir'>;
  conversations: Pick<IConversationRepository, 'findById' | 'update'>;
  dispatcher: Pick<MessageDispatcher, 'send'>;
  events: IEventBus;
  /**
   * Shu suhbatda ketayotgan noma'lum agent navbatini uzadi. Aks holda rasmdan
   * oldin yozilgan matnga navbat "Iltimos ... rasmini yuboring" ni rahmatdan
   * KEYIN yuborib qo'yishi mumkin edi.
   */
  abortAgent?: (conversationId: string) => void;
}

/**
 * Hujjat kutilayotgan noma'lum suhbatga rasm/fayl keldi: suhbat operator
 * tasdig'iga o'tadi.
 *
 * XAVFSIZLIK: bu yerda hech narsa avtomatik bog'lanmaydi va rasm tekshirilmaydi —
 * pasport yoki shartnoma sahifasi egasinikimi, buni faqat operator ko'rib
 * hal qiladi ("Tasdiqlash" tugmasi). Shu sabab odamga ham faqat neytral
 * "tekshiramiz" matni ketadi, topilgan mijoz haqida hech narsa aytilmaydi.
 */
export class NomalumHujjatQabul {
  constructor(private readonly deps: NomalumHujjatQabulDeps) {}

  /**
   * `true` — suhbat hujjat kutayotgan edi va operatorga o'tkazildi, yoki
   * allaqachon `tasdiq_kutilmoqda` (keyingi/parallel rasm): chaqiruvchi xabarni
   * agentga ham, chek oqimiga ham BERMAYDI. `false` — hujjat kutilmagan, eski xulq.
   * `javobYoz=false` — eski (deploydan keyin kelgan) xabar: holat o'tadi,
   * kechikkan avtomatik matn yozilmaydi.
   */
  async qabulQil(conversationId: string, opts: { javobYoz: boolean }): Promise<boolean> {
    const d = this.deps;
    // Suhbat CAS'dan OLDIN o'qiladi: parallel (yutqazgan) rasm `needsHuman` ni
    // qo'yib ulgursa, yutgan rasm rahmatni o'tkazib yubormasin.
    const conversation = await d.conversations.findById(conversationId);
    // Compare-and-set: bir vaqtda kelgan ikki rasmdan faqat bittasi o'tkazadi
    // va rahmat yozadi. `topilganClientId`, `sabab`, `shartnomaRaqami`
    // tegilmaydi — operator tasdiqlashda aynan o'sha mijozga bog'laydi.
    if (!(await d.nomalum.holatniAlmashtir(conversationId, 'hujjat_kutilmoqda', 'tasdiq_kutilmoqda'))) {
      // Yutqazgan rasm (yoki tasdiq kutilayotganda kelgan keyingi rasm) ham
      // shu yerda yutiladi: operator allaqachon chaqirilgan, chek oqimi
      // `humanReason` ni boshqa sabab bilan bosib yubormasin.
      const hozir = await d.nomalum.find(conversationId);
      if (hozir?.holat !== 'tasdiq_kutilmoqda') return false;
      // Operator belgini tushirib qo'ygan bo'lishi mumkin — yangi rasm jim qolmasin.
      if (conversation && !conversation.needsHuman) await this.operatorBelgisi(conversationId);
      return true;
    }
    try {
      d.abortAgent?.(conversationId);
    } catch (err) {
      log.warn({ err, conversationId }, 'Noma\'lum agent navbatini uzib bo\'lmadi');
    }

    // Matn operator belgisidan OLDIN: belgi qo'yilgach `canAgentReply` yopiladi.
    // Operator allaqachon suhbatni qo'lga olgan bo'lsa (yoki agent o'chiq) —
    // avtomatik matn yozilmaydi, u o'zi javob beradi.
    if (opts.javobYoz && conversation && canAgentReply(conversation)) {
      try {
        await d.dispatcher.send({
          conversation, body: MATN_HUJJAT_QABUL, author: 'agent', meta: { nomalum: true, tayyorMatn: true },
        });
      } catch (err) {
        // Kill switch yoki Telegram xatosi — holat baribir o'tadi, operator ko'radi.
        log.warn({ err, conversationId }, 'Hujjat uchun rahmat matni yuborilmadi');
      }
    }

    await this.operatorBelgisi(conversationId);
    log.info({ conversationId }, 'Noma\'lum mijoz hujjat yubordi — operator tasdig\'iga');
    return true;
  }

  private async operatorBelgisi(conversationId: string): Promise<void> {
    await this.deps.conversations.update(conversationId, { needsHuman: true, humanReason: NOMALUM_SABAB_HUJJAT });
    this.deps.events.publish({ type: 'conversation.updated', conversationId });
  }
}
