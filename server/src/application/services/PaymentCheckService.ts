import {
  chekTekshiruviFaolmi,
  type PaymentCheck,
  type ReceiptSource,
} from '@/domain/entities/PaymentCheck';
import {
  tolovdanKeyingiBosqich,
  yakunlanganmi,
  type Purchase,
  type XaridBosqichi,
} from '@/domain/entities/Purchase';
import type { Course } from '@/domain/entities/Course';
import type { IConversationRepository } from '@/domain/repositories/IConversationRepository';
import type { ICourseRepository } from '@/domain/repositories/ICourseRepository';
import type { IPaymentCheckRepository } from '@/domain/repositories/IPaymentCheckRepository';
import type { IPurchaseRepository } from '@/domain/repositories/IPurchaseRepository';
import type { IAuditRepository } from '@/domain/repositories/ISupportRepositories';
import type { IClock, IEventBus } from '@/domain/services/support';
import { havolaQoidasiBajarildimi, havolaXabari, havolaYuborilsinmi } from '@/domain/services/havola';
import type { AgentRunner } from '@/application/services/AgentRunner';
import type { MessageDispatcher } from '@/application/services/MessageDispatcher';
import type { RuntimeSettings } from '@/application/services/RuntimeSettings';
import type { XaridXizmati } from '@/application/services/XaridXizmati';
import { childLogger } from '@/shared/logger';

const log = childLogger('payment-check');

/** Menejerga o'tish sabablari (UI da shu matn ko'rinadi). */
export const CHEK_SABABLARI = {
  summaYoq: "Xarid summasi aniqlanmagan — bosqichni qo'lda belgilang",
  kursYoq: "Xarid kursi aniqlanmagan — guruh havolasini qo'lda yuboring",
  havolaYoq: 'Kursga guruh havolasi kiritilmagan',
  havolaKetmadi: "Guruh havolasini yuborib bo'lmadi",
} as const;

/** "Tasdiqlash" tugmasining natijasi. */
export type ReceiptConfirmOutcome =
  /** Summa qo'shildi, bosqich yangilandi, agent rahmat yozdi. */
  | { kind: 'confirmed'; stage: XaridBosqichi; linkSent: boolean }
  /** Ochiq chek tekshiruvi yo'q (yoki parallel bosishda boshqasi yopib ulgurdi). */
  | { kind: 'no_review' }
  /** Summa va bosqich yozildi, lekin rahmat ketmadi — menejer mijozga o'zi yozadi. */
  | { kind: 'not_sent'; reason: 'kill_switch' | 'agent_disabled' | 'agent_error' };

export type ReceiptRejectOutcome = { kind: 'rejected' } | { kind: 'no_review' };

/** Agent rahmati — `confirmReceipt` dagi ishlatiladigan qismi. */
type AgentPort = Pick<AgentRunner, 'receiptConfirmedThanks' | 'receiptRejected'>;

/**
 * Mijoz yuborgan chekni menejer ko'rib chiqadi (spec 6.5).
 *
 *   • Chek kelganda `openReceiptReview` — faol xaridga bog'langan tekshiruv.
 *   • "Tasdiqlash" — summa `paid_amount` ga qo'shiladi, bosqich
 *     `qisman_toladi`/`toladi`, agent rahmat aytadi; kursning havola qoidasi
 *     bajarilsa tizim yopiq guruh havolasini aniq qiymatdan BIR MARTA yuboradi.
 *   • "Rad etish" — bosqich `karta_yuborildi` ga qaytadi, agent sababga
 *     tayanib qayta chek so'raydi.
 *
 * Debitordagi `crm_watch` (CRM'dan to'lov qidirish) sotuv agentida yo'q.
 */
export class PaymentCheckService {
  constructor(
    private readonly checks: IPaymentCheckRepository,
    private readonly conversations: IConversationRepository,
    private readonly purchases: IPurchaseRepository,
    private readonly courses: Pick<ICourseRepository, 'findById'>,
    private readonly xarid: Pick<XaridXizmati, 'faolXarid' | 'bosqich'>,
    private readonly agent: AgentPort,
    private readonly dispatcher: Pick<MessageDispatcher, 'send'>,
    private readonly audit: IAuditRepository,
    private readonly events: IEventBus,
    private readonly clock: IClock,
    /** Kill switch — tasdiq/rad etishdan keyingi agent xabari uchun. */
    private readonly settings: Pick<RuntimeSettings, 'get'>,
  ) {}

  /**
   * Chek rasmi yoki fayl keldi — menejer tekshiruvini ochadi.
   *
   *   • ochiq tekshiruv bo'lsa — o'sha qaytadi; u `aniqlanmagan`, yangi rasm
   *     esa `tolov` bo'lsa manba `tolov` ga ko'tariladi;
   *   • aks holda faol xaridga bog'langan yangisi ochiladi.
   */
  async openReceiptReview(
    conversationId: string,
    clientId: string,
    messageId: string | null,
    receiptSource: ReceiptSource,
  ): Promise<PaymentCheck> {
    const existing = await this.ochiqTekshiruv(conversationId);
    if (existing) {
      if (existing.receiptSource === 'aniqlanmagan' && receiptSource === 'tolov') {
        await this.checks.raiseReceiptSource(existing.id);
        log.info({ conversationId, checkId: existing.id }, 'Chek tekshiruvi manbai tolov ga ko\'tarildi');
        return { ...existing, receiptSource: 'tolov' };
      }
      return existing;
    }

    const purchase = await this.xarid.faolXarid(clientId);
    const check = await this.checks.openReceiptReview({
      conversationId,
      clientId,
      purchaseId: purchase.id,
      messageId,
      sinceIso: this.clock.todayIso(),
      receiptSource,
    });
    log.info({ conversationId, checkId: check.id, purchaseId: purchase.id, receiptSource }, 'Chek tekshiruvi ochildi');
    return check;
  }

  /** Menejer chekdagi summani kiritib "Tasdiqlash" ni bosdi. */
  async confirmReceipt(conversationId: string, actor: string, amount: number): Promise<ReceiptConfirmOutcome> {
    const check = await this.ochiqTekshiruv(conversationId);
    if (!check) return { kind: 'no_review' };
    // Ikki marta bosishdan himoya: `UPDATE … WHERE status = 'reviewing'`.
    if (!(await this.checks.confirmByOperator(check.id, actor, amount, this.clock.now()))) {
      return { kind: 'no_review' };
    }

    const oldin = await this.chekXaridi(check);
    const xarid = await this.purchases.addPaid(oldin.id, amount);
    const course = xarid.courseId ? await this.courses.findById(xarid.courseId) : null;
    // `total_amount` yo'q yoki 0 bo'lsa — kurs narxi; u ham bo'lmasa hisoblab bo'lmaydi.
    const total = xarid.totalAmount || course?.price || null;
    const paid = xarid.paidAmount;

    if (!total) {
      await this.menejerga(conversationId, CHEK_SABABLARI.summaYoq);
      await this.qayd(actor, check, { amount, paid, total: null, stage: xarid.stage, linkSent: false, outcome: 'needs_human' });
      return { kind: 'confirmed', stage: xarid.stage, linkSent: false };
    }

    // Tugallangan (masalan, menejer qo'lda `toladi` qilgan) xarid uchun
    // `bosqich` yangi xarid ochib yuborardi — bu holatda bosqichga tegilmaydi.
    let stage: XaridBosqichi = xarid.stage;
    if (!yakunlanganmi(oldin.stage)) {
      const yangi = await this.xarid.bosqich(check.clientId, tolovdanKeyingiBosqich(paid, total), 'tizim');
      if (yangi) stage = yangi.stage;
    }

    // Havola: qoida bajarilgan va hali yuborilmagan bo'lsa — atomik "bir marta"
    // belgisi rahmatdan OLDIN olinadi, shunda agentga aytilgani haqiqatga mos.
    const runtime = await this.settings.get();
    const { claimed, sabab } = await this.havolaQarori(xarid, course, paid, total, runtime.killSwitch);

    // Eskalatsiya yechiladi — rahmat `canAgentReply` dan o'tishi uchun ham shart.
    await this.conversations.update(conversationId, { needsHuman: false, humanKind: null, humanReason: null });

    const thanks = await this.rahmat(conversationId, {
      paidAmount: paid,
      totalAmount: total,
      remaining: Math.max(0, total - paid),
      linkWillBeSent: claimed,
    });

    let linkSent = false;
    let menejerSababi: string | null = sabab;
    if (claimed && course?.groupLink) {
      try {
        const conversation = await this.conversations.findById(conversationId);
        if (!conversation) throw new Error('Suhbat topilmadi');
        await this.dispatcher.send({
          conversation,
          body: havolaXabari(course.groupLink),
          author: 'agent',
          meta: { kind: 'havola' },
        });
        linkSent = true;
      } catch (err) {
        // Baza holati allaqachon o'zgargan — HTTP chaqiruvchiga xato emas,
        // menejerga topshiriq. `link_sent_at` qoladi: havolani menejer yuboradi.
        log.warn({ conversationId, purchaseId: xarid.id, err }, 'Guruh havolasi yuborilmadi');
        menejerSababi = CHEK_SABABLARI.havolaKetmadi;
      }
    }
    if (menejerSababi) await this.menejerga(conversationId, menejerSababi);

    await this.qayd(actor, check, { amount, paid, total, stage, linkSent, outcome: thanks ?? 'thanked' });
    log.info({ conversationId, checkId: check.id, amount, paid, total, stage, linkSent }, 'Chek menejer tomonidan tasdiqlandi');

    return thanks ? { kind: 'not_sent', reason: thanks } : { kind: 'confirmed', stage, linkSent };
  }

  /** Menejer sababini yozib "Rad etish" ni bosdi. */
  async rejectReceipt(conversationId: string, actor: string, reason: string): Promise<ReceiptRejectOutcome> {
    const check = await this.ochiqTekshiruv(conversationId);
    if (!check) return { kind: 'no_review' };
    if (!(await this.checks.reject(check.id, actor, reason, this.clock.now()))) return { kind: 'no_review' };

    const yangi = await this.xarid.bosqich(check.clientId, 'karta_yuborildi', 'tizim');
    const purchaseId = yangi?.id ?? check.purchaseId;
    // Spec 6.6: rad etilib `karta_yuborildi` ga qaytganda yangi eslatma yozilmaydi.
    if (purchaseId) await this.purchases.addRemindedStage(purchaseId, 'karta_yuborildi');

    await this.conversations.update(conversationId, { needsHuman: false, humanKind: null, humanReason: null });

    let sent = false;
    try {
      const runtime = await this.settings.get();
      if (!runtime.killSwitch) sent = (await this.agent.receiptRejected(conversationId, reason)).sent;
    } catch (err) {
      log.warn({ conversationId, err }, 'Rad etilgan chek bo\'yicha agent xabari yuborilmadi');
    }

    await this.audit.record({
      actor,
      action: 'receipt_review.rejected',
      entity: 'conversation',
      entityId: conversationId,
      payload: { checkId: check.id, purchaseId, messageId: check.messageId, reason, sent },
    });
    this.events.publish({ type: 'conversation.updated', conversationId });
    this.events.publish({ type: 'client.updated', clientId: check.clientId });
    log.info({ conversationId, checkId: check.id, sent }, 'Chek menejer tomonidan rad etildi');
    return { kind: 'rejected' };
  }

  /** Suhbat yopilganda yoki raqam bloklanganda ochiq tekshiruvni to'xtatish. */
  async cancel(conversationId: string): Promise<void> {
    await this.checks.cancel(conversationId);
  }

  /** Chek bog'langan xarid; bog'lanmagan (eski qator) bo'lsa — faol xarid. */
  private async chekXaridi(check: PaymentCheck): Promise<Purchase> {
    const bogliq = check.purchaseId ? await this.purchases.findById(check.purchaseId) : null;
    return bogliq ?? (await this.xarid.faolXarid(check.clientId));
  }

  /**
   * `claimed` — havola endi yuboriladi (`markLinkSent` shu chaqiruvda yutdi).
   * `sabab` — menejerga o'tish kerak (havola kiritilmagan yoki kurs yo'q).
   */
  private async havolaQarori(
    xarid: Purchase,
    course: Course | null,
    paid: number,
    total: number,
    killSwitch: boolean,
  ): Promise<{ claimed: boolean; sabab: string | null }> {
    if (xarid.linkSentAt) return { claimed: false, sabab: null };
    if (!course) return { claimed: false, sabab: CHEK_SABABLARI.kursYoq };
    const qoida = { linkAfter: course.linkAfter, paid, total };
    if (!havolaQoidasiBajarildimi(qoida)) return { claimed: false, sabab: null };
    if (!havolaYuborilsinmi({ ...qoida, linkSentAt: xarid.linkSentAt, groupLink: course.groupLink })) {
      return { claimed: false, sabab: CHEK_SABABLARI.havolaYoq };
    }
    // Kill switch yoqiq — xabar baribir ketmaydi; "yuborildi" belgisini
    // qo'ymaymiz, keyingi tasdiqda havola yana ko'rib chiqiladi.
    if (killSwitch) return { claimed: false, sabab: CHEK_SABABLARI.havolaKetmadi };
    const claimed = await this.purchases.markLinkSent(xarid.id, this.clock.now());
    return { claimed, sabab: null };
  }

  /** Rahmat; `null` — ketdi, aks holda nega ketmagani. Hech qachon otmaydi. */
  private async rahmat(
    conversationId: string,
    confirmed: Parameters<AgentPort['receiptConfirmedThanks']>[1],
  ): Promise<'kill_switch' | 'agent_disabled' | 'agent_error' | null> {
    try {
      const runtime = await this.settings.get();
      if (runtime.killSwitch) return 'kill_switch';
      const result = await this.agent.receiptConfirmedThanks(conversationId, confirmed);
      return result.sent ? null : 'agent_disabled';
    } catch (err) {
      // `AbortedError` ham shu yerga: menejer agentni o'chirgan. Bosqich va
      // havola baribir davom etadi — menejer mijozga qo'lda yozadi.
      log.warn({ conversationId, err }, 'Chek tasdig\'idan keyin rahmat yuborilmadi');
      return 'agent_error';
    }
  }

  private async menejerga(conversationId: string, humanReason: string): Promise<void> {
    await this.conversations.update(conversationId, { needsHuman: true, humanKind: null, humanReason });
  }

  private async qayd(actor: string, check: PaymentCheck, payload: Record<string, unknown>): Promise<void> {
    await this.audit.record({
      actor,
      action: 'receipt_review.confirmed',
      entity: 'conversation',
      entityId: check.conversationId,
      payload: { checkId: check.id, purchaseId: check.purchaseId, messageId: check.messageId, ...payload },
    });
    this.events.publish({ type: 'conversation.updated', conversationId: check.conversationId });
    this.events.publish({ type: 'client.updated', clientId: check.clientId });
    this.events.publish({ type: 'stats.invalidate' });
  }

  /**
   * Suhbatdagi ochiq tekshiruv; muddati o'tgan chek tekshiruvi
   * (`CHEK_TEKSHIRUVI_MUDDATI_KUNLAR`) bekor qilinib, `null` qaytadi —
   * bunday tekshiruvda tugma yashirilgan va u yangi chekni to'smasligi kerak.
   */
  private async ochiqTekshiruv(conversationId: string): Promise<PaymentCheck | null> {
    const existing = await this.checks.findOpenByConversation(conversationId);
    if (!existing || chekTekshiruviFaolmi(existing, this.clock.now())) return existing;

    await this.checks.cancel(conversationId);
    log.info({ conversationId, checkId: existing.id }, 'Muddati o\'tgan chek tekshiruvi bekor qilindi');
    return null;
  }
}
