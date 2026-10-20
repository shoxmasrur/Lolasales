import type { RuntimeSettings } from '@/application/services/RuntimeSettings';
import type { MessageDispatcher } from '@/application/services/MessageDispatcher';
import type { XaridXizmati } from '@/application/services/XaridXizmati';
import type { ICourseRepository } from '@/domain/repositories/ICourseRepository';
import type { IConversationRepository } from '@/domain/repositories/IConversationRepository';
import type { IAuditRepository } from '@/domain/repositories/ISupportRepositories';
import type { IEventBus } from '@/domain/services/support';
import { kartaTayyorligi, kartaXabari } from '@/domain/services/karta';
import { NotFoundError } from '@/shared/errors';

export const SABAB_MATNI = {
  kurs_yoq: "Karta yuborib bo'lmadi: mijozning kursi aniqlanmagan",
  karta_yoq: "Karta yuborib bo'lmadi: Sozlamalarda faol karta yo'q",
  bolib_tolash_yoq: "Karta yuborib bo'lmadi: bu kursda bo'lib to'lash yo'q",
} as const;

/** Agent "mana karta" degan, lekin karta tizimdan ketmagan — menejer yuboradi. */
export const KARTANI_YUBORING = "Mijoz to'lashga rozi — kartani yuboring";

/** Shu sabablardan biri bilan menejerda turgan suhbat "Kartani yuborish" ni kutadi. */
export const KARTA_KUTILADI_SABABLARI: readonly string[] = [KARTANI_YUBORING, ...Object.values(SABAB_MATNI)];

export type KartaNatijasi = { sent: true } | { sent: false; reason: keyof typeof SABAB_MATNI };

/**
 * To'lov kartasini tizim yuboradi (LLM raqam yozmaydi): Sozlamalardagi faol karta + xaridning summasi.
 * Yuborib bo'lmasa suhbat menejerga o'tadi.
 */
export class KartaYuboruvchi {
  constructor(
    private readonly settings: RuntimeSettings,
    private readonly courses: ICourseRepository,
    private readonly xarid: XaridXizmati,
    private readonly conversations: IConversationRepository,
    private readonly dispatcher: MessageDispatcher,
    private readonly audit: IAuditRepository,
    private readonly events: IEventBus,
  ) {}

  /**
   * Kartani yuboradi (agent navbatidan yoki menejerning "Kartani yuborish"
   * tugmasidan). Faqat FAOL xaridga: faol xarid yo'q bo'lsa yangisi
   * OCHILMAYDI — kurs aniqlanmagan (`kurs_yoq`), suhbat menejerda qoladi.
   *
   * Yuborish oynasi tekshirilmaydi: karta mijozning jonli javobiga yoki
   * menejer bosgan tugmaga javob. Kill switch va akkaunt limitlari
   * dispatcher'da baribir amal qiladi.
   */
  async yubor(conversationId: string, clientId: string): Promise<KartaNatijasi> {
    const conversation = await this.conversations.findById(conversationId);
    if (!conversation) throw new NotFoundError('Suhbat topilmadi');
    const purchase = await this.xarid.faol(clientId);
    const [course, s] = await Promise.all([
      purchase?.courseId ? this.courses.findById(purchase.courseId) : Promise.resolve(null),
      this.settings.get(),
    ]);

    const tayyor: ReturnType<typeof kartaTayyorligi> = purchase
      ? kartaTayyorligi({ cards: s.paymentCards, course, purchase })
      : { ok: false, reason: 'kurs_yoq' };
    if (!tayyor.ok || !purchase) {
      const reason = tayyor.ok ? 'kurs_yoq' : tayyor.reason;
      await this.conversations.update(conversationId, { needsHuman: true, humanReason: SABAB_MATNI[reason] });
      this.events.publish({ type: 'conversation.updated', conversationId });
      return { sent: false, reason };
    }

    await this.dispatcher.send({
      conversation,
      body: kartaXabari(tayyor.card, tayyor.amount),
      author: 'agent',
      meta: { kind: 'karta' },
    });
    await this.xarid.bosqich(clientId, 'karta_yuborildi', 'tizim');
    await this.audit.record({
      actor: 'tizim',
      action: 'card.sent',
      entity: 'purchase',
      entityId: purchase.id,
      payload: { clientId, conversationId, cardId: tayyor.card.id, last4: tayyor.card.number.slice(-4), amount: tayyor.amount },
    });
    // Karta kutib menejerda turgan suhbat — endi kutish yo'q.
    if (conversation.needsHuman && conversation.humanReason && KARTA_KUTILADI_SABABLARI.includes(conversation.humanReason)) {
      await this.conversations.update(conversationId, { needsHuman: false, humanKind: null, humanReason: null });
    }
    this.events.publish({ type: 'conversation.updated', conversationId });
    return { sent: true };
  }
}
