import {
  CHECK_WINDOW_DAYS,
  chekTekshiruviFaolmi,
  operatorJimligiBoshi,
  WATCH_HOURS,
  type PaymentCheck,
  type ReceiptSource,
} from '@/domain/entities/PaymentCheck';
import { canAgentReply } from '@/domain/entities/Conversation';
import type { IContractRepository } from '@/domain/repositories/IContractRepository';
import type { IConversationRepository } from '@/domain/repositories/IConversationRepository';
import type { IContractPaymentRepository } from '@/domain/repositories/IContractPaymentRepository';
import type { IPaymentCheckRepository } from '@/domain/repositories/IPaymentCheckRepository';
import type { IPaymentPromiseRepository } from '@/domain/repositories/IPaymentPromiseRepository';
import type { IAuditRepository } from '@/domain/repositories/ISupportRepositories';
import type { IClock, IEventBus } from '@/domain/services/support';
import type { AgentRunner } from '@/application/services/AgentRunner';
import type { ContractSyncService } from '@/application/services/ContractSyncService';
import type { RuntimeSettings } from '@/application/services/RuntimeSettings';
import { kechikishYopildi } from '@/domain/entities/Contract';
import { faqatYoziladiganlar } from '@/domain/entities/shartnomaHolati';
import { AbortedError, NotFoundError } from '@/shared/errors';
import { childLogger } from '@/shared/logger';

const log = childLogger('payment-check');

/** Bir tsiklda shuncha tekshiruv ko'riladi. */
const BATCH = 20;
/** Kuzatuvchi qadami — Xonsaroy Pay darhol ko'rinadi, tez-tez qarash arziydi. */
const TICK_MS = 5 * 60 * 1000;
/** Chek tekshiruvi ochiq bo'lsa CRM kuzatuvi o'rniga shu javob qaytadi. */
const CHEK_OPERATORDA = 'Chek operator tekshiruvida — "To\'lov qabul qilindi" tugmasidan foydalaning';

export type CheckOutcome =
  /** Yangi to'lov topildi. */
  | { kind: 'confirmed'; amount: number; paymentType: string | null; thanked: boolean }
  /** Hali ko'rinmadi, kuzatuv davom etadi. */
  | { kind: 'watching'; until: Date }
  /** Muddat tugadi — operatorga chiqarildi. */
  | { kind: 'not_found' }
  /** Tekshirish uchun shartnoma yoki suhbat yo'q. */
  | { kind: 'unavailable'; reason: string };

/** "To'lov qabul qilindi" tugmasining natijasi. */
export type ReceiptConfirmOutcome =
  /** Tekshiruv yopildi va agent rahmat yozdi. */
  | { kind: 'thanked' }
  /** Tekshiruv yopildi; rahmat chek kelgandan beri boshqa yo'ldan allaqachon ketgan. */
  | { kind: 'already_thanked' }
  /** Tekshiruv yopildi, lekin xabar ketmadi — operator mijozga o'zi yozadi. */
  | { kind: 'not_sent'; reason: 'kill_switch' | 'agent_disabled' | 'agent_error' }
  /** Ochiq chek tekshiruvi yo'q (yoki parallel bosishda boshqasi yopib ulgurdi). */
  | { kind: 'no_review' };

/**
 * Mijoz yuborgan to'lov kvitansiyasini tekshiradi.
 *
 * Ish tartibi: kvitansiya kelganda `open()` chaqiriladi va o'sha zahoti
 * bir marta tekshiriladi (Xonsaroy Pay shu yerda topiladi). Topilmasa
 * kuzatuv boshlanadi va har 5 daqiqada qayta so'raladi — bank o'tkazmasi
 * bir kungacha kechikadi.
 *
 * TO'LOV QANDAY ANIQLANADI: sana bo'yicha emas, DELTA bo'yicha. Bank
 * o'tkazmasi CRM'ga kechroq tushadi, lekin `date_paid` mijoz to'lagan
 * kunga — ya'ni orqaga — qo'yiladi. Shuning uchun bir xil oyna
 * (`CHECK_WINDOW_DAYS`) bo'yicha yig'indi olinadi va tekshiruv
 * boshlangandagi qiymat bilan solishtiriladi.
 */
export class PaymentCheckService {
  private timer: NodeJS.Timeout | null = null;
  private busy = false;

  constructor(
    private readonly checks: IPaymentCheckRepository,
    private readonly conversations: IConversationRepository,
    private readonly contracts: IContractRepository,
    private readonly payments: IContractPaymentRepository,
    private readonly promises: IPaymentPromiseRepository,
    private readonly contractSync: ContractSyncService,
    private readonly agent: AgentRunner,
    private readonly audit: IAuditRepository,
    private readonly events: IEventBus,
    private readonly clock: IClock,
    /** Kill switch — tugmadan keyingi rahmat uchun. */
    private readonly settings: RuntimeSettings,
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    log.info('Kvitansiya kuzatuvchisi ishga tushdi');
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * Kvitansiya keldi — tekshiruvni ochadi va DARHOL bir marta qaraydi.
   *
   * Xonsaroy Pay orqali to'langan bo'lsa javob shu yerda topiladi va mijoz
   * kutib qolmaydi.
   */
  async open(conversationId: string, messageId: string | null): Promise<CheckOutcome> {
    const conversation = await this.conversations.findById(conversationId);
    if (!conversation) return { kind: 'unavailable', reason: 'Suhbat topilmadi' };

    const existing = await this.ochiqTekshiruv(conversationId);
    // Chek operator tekshiruvida — da'vo uchun alohida CRM kuzatuvi
    // ochilmaydi: ikkalasi bir to'lov haqida va natijani operator aytadi.
    if (existing?.kind === 'receipt_review') return { kind: 'unavailable', reason: CHEK_OPERATORDA };
    if (existing) return this.run(existing);

    // Faqat "Сотилди" shartnomasi bo'yicha ish ko'ramiz — bekor
    // qilinayotgan shartnomaning to'lovi bu suhbatga aloqador emas.
    const contracts = faqatYoziladiganlar(await this.contracts.findByClientId(conversation.clientId));
    const contractId = contracts.length === 1 ? contracts[0]!.id : null;

    const now = this.clock.now();
    const sinceIso = this.windowStart(now);
    const baselinePaid = await this.payments.sumPaidSince({
      clientId: conversation.clientId,
      contractId,
      sinceIso,
    });

    const check = await this.checks.open({
      conversationId,
      clientId: conversation.clientId,
      contractId,
      messageId,
      sinceIso,
      baselinePaid,
      watchUntil: new Date(now.getTime() + WATCH_HOURS * 60 * 60 * 1000),
    });

    log.info({ conversationId, checkId: check.id, baselinePaid }, 'Kvitansiya tekshiruvi ochildi');
    return this.run(check);
  }

  /** Operator tugmasi: ochiq tekshiruv bo'lsa uni, bo'lmasa yangisini yuritadi. */
  async checkNow(conversationId: string): Promise<CheckOutcome> {
    const existing = await this.ochiqTekshiruv(conversationId);
    if (existing?.kind === 'receipt_review') return { kind: 'unavailable', reason: CHEK_OPERATORDA };
    return existing ? this.run(existing) : this.open(conversationId, null);
  }

  /**
   * Chek rasmi yoki fayl keldi — operator tekshiruvini ochadi. CRM'ga
   * BORMAYDI: pulni operator tasdiqlaydi.
   *
   *   • ochiq `crm_watch` bo'lsa — `cancelled` (chek da'voning o'rnini oladi);
   *   • ochiq `receipt_review` bo'lsa — o'sha qaytadi; u `aniqlanmagan`, yangi
   *     rasm esa `tolov` bo'lsa manba `tolov` ga ko'tariladi (pastga
   *     tushirilmaydi — bitta aniq chek yetarli);
   *   • aks holda yangisi ochiladi.
   */
  async openReceiptReview(
    conversationId: string,
    messageId: string | null,
    receiptSource: ReceiptSource,
  ): Promise<PaymentCheck> {
    const conversation = await this.conversations.findById(conversationId);
    if (!conversation) throw new NotFoundError('Suhbat', conversationId);

    // Tugmasiz qolib ketgan eski tekshiruv yangi chekni yutmasin: yangisi
    // ochiladi — agent yangi chekka javob beradi, tugma yana ko'rinadi.
    const existing = await this.ochiqTekshiruv(conversationId);
    if (existing?.kind === 'receipt_review') {
      if (existing.receiptSource === 'aniqlanmagan' && receiptSource === 'tolov') {
        await this.checks.raiseReceiptSource(existing.id);
        log.info({ conversationId, checkId: existing.id }, 'Chek tekshiruvi manbai tolov ga ko\'tarildi');
        return { ...existing, receiptSource: 'tolov' };
      }
      return existing;
    }

    if (existing) {
      await this.checks.cancel(conversationId);
      log.info({ conversationId, checkId: existing.id }, 'Da\'vo kuzatuvi chek tekshiruvi bilan almashtirildi');
    }

    const check = await this.checks.openReceiptReview({
      conversationId,
      clientId: conversation.clientId,
      messageId,
      sinceIso: this.clock.todayIso(),
      receiptSource,
    });
    log.info({ conversationId, checkId: check.id, receiptSource }, 'Chek tekshiruvi ochildi');
    return check;
  }

  /**
   * Operator "To'lov qabul qilindi" tugmasini bosdi.
   *
   * Tekshiruv HAR QANDAY holatda yopiladi va suhbat operatordan qaytadi:
   * operator pul kelganini tasdiqladi. Rahmat esa alohida qaror — u
   * allaqachon aytilgan, kill switch yoqiq yoki agent yoza olmasa ketmaydi
   * va natija operatorga ko'rsatiladi.
   */
  async confirmReceipt(conversationId: string, actor: string): Promise<ReceiptConfirmOutcome> {
    const check = await this.checks.findOpenByConversation(conversationId);
    if (!check || check.kind !== 'receipt_review') return { kind: 'no_review' };
    // Muddati o'tgan tekshiruvda tugma yashirilgan (`GET /conversations/:id`)
    // — API ham uni tasdiqlamaydi.
    if (!chekTekshiruviFaolmi(check, this.clock.now())) return { kind: 'no_review' };

    // Ikki marta bosishdan himoya: `UPDATE … WHERE status = 'reviewing'`.
    if (!(await this.checks.confirmByOperator(check.id, actor, this.clock.now()))) {
      return { kind: 'no_review' };
    }

    // Eskalatsiya yechiladi — rahmat `canAgentReply` dan o'tishi uchun ham shart.
    await this.conversations.update(conversationId, { needsHuman: false, humanKind: null, humanReason: null });

    const outcome = await this.receiptThanks(check);

    await this.audit.record({
      actor,
      action: 'receipt_review.confirmed',
      entity: 'conversation',
      entityId: conversationId,
      payload: { checkId: check.id, messageId: check.messageId, outcome },
    });

    this.events.publish({ type: 'conversation.updated', conversationId });
    this.events.publish({ type: 'stats.invalidate' });
    log.info({ conversationId, checkId: check.id, outcome }, 'Chek operator tomonidan tasdiqlandi');

    return outcome;
  }

  /** Tugmadan keyingi rahmat — `confirmReceipt` ning 4–5-qadamlari. */
  private async receiptThanks(check: PaymentCheck): Promise<Exclude<ReceiptConfirmOutcome, { kind: 'no_review' }>> {
    if (check.thanksSentAt) return { kind: 'already_thanked' };

    const runtime = await this.settings.get();
    if (runtime.killSwitch) return { kind: 'not_sent', reason: 'kill_switch' };

    // "Kechikkan to'lovingiz yo'q" faqat yangi CRM faktidan aytiladi.
    for (const c of faqatYoziladiganlar(await this.contracts.findByClientId(check.clientId))) {
      try {
        await this.contractSync.syncOne(c.id);
      } catch (err) {
        log.warn({ checkId: check.id, contractId: c.id, err }, 'Tasdiqdan keyin shartnoma yangilanmadi');
      }
    }
    const contracts = faqatYoziladiganlar(await this.contracts.findByClientId(check.clientId));
    const debtCleared = kechikishYopildi(contracts, 0);

    // Chek oynasida CRM'da birorta ham to'lov yo'q — bank to'lovi hali
    // tushmagan va tizimdagi qoldiq ESKI: uni aytish endigina to'lagan
    // mijozni ayblash bo'lardi.
    const oynaBoshi = this.windowStart(new Date(`${check.sinceIso}T00:00:00Z`));
    const mentionRemaining =
      (await this.payments.sumPaidSince({ clientId: check.clientId, contractId: null, sinceIso: oynaBoshi })) > 0;

    try {
      const result = await this.agent.receiptConfirmedThanks(check.conversationId, { debtCleared, mentionRemaining });
      return result.sent ? { kind: 'thanked' } : { kind: 'not_sent', reason: 'agent_disabled' };
    } catch (err) {
      // `AbortedError` ham shu yerga: operator agentni o'chirgan. Tekshiruv
      // baribir yopiq qoladi — operator mijozga qo'lda yozadi.
      log.warn({ conversationId: check.conversationId, err }, 'Chek tasdig\'idan keyin rahmat yuborilmadi');
      return { kind: 'not_sent', reason: 'agent_error' };
    }
  }

  /**
   * Suhbatdagi ochiq tekshiruv; muddati o'tgan chek tekshiruvi
   * (`CHEK_TEKSHIRUVI_MUDDATI_KUNLAR`) bekor qilinib, `null` qaytadi.
   *
   * NEGA: bunday tekshiruvda tugma yashirilgan, lekin yozuv ochiq turaverib
   * yangi chekni, "to'ladim" kuzatuvini va "To'lovni tekshirish" tugmasini
   * to'sardi — operator yo'q tugmaga yo'naltirilardi.
   */
  private async ochiqTekshiruv(conversationId: string): Promise<PaymentCheck | null> {
    const existing = await this.checks.findOpenByConversation(conversationId);
    if (existing?.kind !== 'receipt_review' || chekTekshiruviFaolmi(existing, this.clock.now())) return existing;

    await this.checks.cancel(conversationId);
    log.info({ conversationId, checkId: existing.id }, 'Muddati o\'tgan chek tekshiruvi bekor qilindi');
    return null;
  }

  /** Suhbat yopilganda yoki operator hal qilganda kuzatuvni to'xtatish. */
  async cancel(conversationId: string): Promise<void> {
    await this.checks.cancel(conversationId);
  }

  private async tick(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const due = await this.checks.findDue(BATCH);
      for (const check of due) {
        try {
          await this.run(check);
        } catch (err) {
          log.warn({ checkId: check.id, err }, 'Kvitansiya tekshirilmadi');
        }
      }
    } finally {
      this.busy = false;
    }
  }

  /** Bitta tekshiruv: CRM'ni yangilash → delta → qaror. */
  private async run(check: PaymentCheck): Promise<CheckOutcome> {
    // Chek tekshiruvini CRM emas, operator yopadi — muddati ham yo'q.
    const watchUntil = check.watchUntil;
    if (check.kind !== 'crm_watch' || !watchUntil) {
      return { kind: 'unavailable', reason: CHEK_OPERATORDA };
    }

    const now = this.clock.now();

    // Shartnomani yangilaymiz — aks holda bazadagi eski nusxaga qarab
    // "to'lov yo'q" deb xulosa qilardik.
    for (const id of await this.contractIds(check)) {
      try {
        await this.contractSync.syncOne(id);
      } catch (err) {
        log.warn({ checkId: check.id, contractId: id, err }, 'Tekshiruv oldidan shartnoma yangilanmadi');
      }
    }

    const paidNow = await this.payments.sumPaidSince({
      clientId: check.clientId,
      contractId: check.contractId,
      sinceIso: check.sinceIso,
    });
    const delta = paidNow - check.baselinePaid;

    if (delta > 0) return this.confirm(check, delta);

    if (now.getTime() >= watchUntil.getTime()) {
      await this.checks.close(check.id, { status: 'not_found', foundAmount: null, foundType: null });
      await this.escalate(check);
      return { kind: 'not_found' };
    }

    await this.checks.touch(check.id, now);
    return { kind: 'watching', until: watchUntil };
  }

  private async contractIds(check: PaymentCheck): Promise<string[]> {
    if (check.contractId) return [check.contractId];
    const all = faqatYoziladiganlar(await this.contracts.findByClientId(check.clientId));
    return all.map((c) => c.id);
  }

  /**
   * To'lov topildi.
   *
   * Rahmatni KIM aytishi muhim: ochiq va'da bo'lsa `PromiseWatcher` uni
   * o'z oynasida aytadi va bu yerdan ham yuborilsa mijoz IKKI marta
   * rahmat olardi. Shuning uchun va'da bo'lganda biz faqat qayd qilamiz.
   */
  private async confirm(check: PaymentCheck, amount: number): Promise<CheckOutcome> {
    const paymentType = await this.latestPaymentType(check);
    await this.checks.close(check.id, {
      status: 'confirmed',
      foundAmount: amount,
      foundType: paymentType,
    });

    const activePromise = await this.promises.findActiveByConversation(check.conversationId);
    // Operator chekni oxirgi 7 kunda tasdiqlagan — rahmat o'sha tugma bilan
    // ketgan, bu to'lov uchun ikkinchisi yuborilmaydi.
    const operatorTasdigi = await this.checks.findOperatorConfirmedSince(
      check.conversationId,
      operatorJimligiBoshi(this.clock.now()),
    );
    let thanked = false;

    if (!activePromise && !operatorTasdigi) {
      thanked = await this.thank(check, amount);
    }

    await this.audit.record({
      actor: 'agent',
      action: 'payment_check.confirmed',
      entity: 'conversation',
      entityId: check.conversationId,
      payload: {
        amount,
        paymentType,
        thanked,
        viaPromise: Boolean(activePromise),
        ...(operatorTasdigi ? { suppressedBy: 'receipt_review' } : {}),
      },
    });

    this.events.publish({ type: 'conversation.updated', conversationId: check.conversationId });
    this.events.publish({ type: 'stats.invalidate' });
    log.info(
      { conversationId: check.conversationId, amount, paymentType, thanked },
      'Kvitansiya bo\'yicha to\'lov tasdiqlandi',
    );

    return { kind: 'confirmed', amount, paymentType, thanked };
  }

  /** Va'dasiz kelgan to'lov uchun rahmat. */
  private async thank(check: PaymentCheck, amount: number): Promise<boolean> {
    const conversation = await this.conversations.findById(check.conversationId);
    if (!conversation || !canAgentReply(conversation)) return false;

    // "Kechikkan to'lovingiz yo'q" jumlasi faqat shu qaror asosida
    // aytiladi — agentga taxmin qildirilmaydi.
    //
    // `minDebt` EMAS, 0: bu DA'VO. Chegara faqat "yozmay jim turish"ga
    // ruxsat beradi — mijozga "qarzingiz yo'q" deb aytish uchun yig'indi
    // AYNAN nolga tenglashishi kerak, aks holda mijoz qoldiqni ko'rib
    // hisob-kitobga ishonchini yo'qotadi.
    const contracts = faqatYoziladiganlar(await this.contracts.findByClientId(check.clientId));
    const debtCleared = kechikishYopildi(contracts, 0);

    try {
      const result = await this.agent.paymentThanks(check.conversationId, null, {
        newMoney: amount,
        totalPaid: amount,
        promisedAmount: null,
        remaining: null,
        debtCleared,
      });
      // Bu yozuv MUVAFFAQIYATLI rahmatdan KEYIN — yiqilsa ham rahmat
      // yuborilgani fakt, shuning uchun xato yutiladi: aks holda pastdagi
      // `catch` uni qayta otib, `confirm()` ni audit yozuvi va
      // `conversation.updated` / `stats.invalidate` hodisalarigacha
      // yetmay uzib qo'yardi.
      if (result.sent) {
        try {
          await this.checks.markThanksSent(check.conversationId, this.clock.now());
        } catch (belgiXato) {
          log.warn({ conversationId: check.conversationId, err: belgiXato }, 'thanks_sent_at yozilmadi');
        }
      }
      return result.sent;
    } catch (err) {
      // Operator agentni o'chirgani uchun uzilish — nosozlik emas, shuning
      // uchun yuqoriga otilmaydi: aks holda `confirm()` yarim yo'lda uzilib,
      // tekshiruv "confirmed" bo'lib yopilgani holda audit yozuvi ham,
      // `conversation.updated` / `stats.invalidate` hodisalari ham
      // yozilmay qolardi — dashboard eski raqamni ko'rsatib turardi. Uning
      // ustiga tsikl buni "Kvitansiya tekshirilmadi" deb ogohlantirardi.
      //
      // To'lov TOPILGANI fakt bo'lib qoladi, faqat rahmat aytilmadi:
      // `thanked = false` bilan davom etamiz.
      if (!(err instanceof AbortedError)) throw err;
      log.info(
        { conversationId: check.conversationId },
        'Rahmat xabari to\'xtatildi (agent o\'chirilgan)',
      );
      return false;
    }
  }

  /** Muddat tugadi — endi odam ko'rishi kerak. */
  private async escalate(check: PaymentCheck): Promise<void> {
    await this.conversations.update(check.conversationId, {
      needsHuman: true,
      humanReason:
        'Mijoz to\'laganini aytdi (chek yoki xabar), lekin bir kun ichida to\'lov CRM\'da ko\'rinmadi — qo\'lda tekshiring',
    });
    this.events.publish({ type: 'conversation.updated', conversationId: check.conversationId });
    log.info({ conversationId: check.conversationId }, 'Kvitansiya tasdiqlanmadi — operatorga chiqarildi');
  }

  /** Oxirgi kelgan to'lovning kanali — "Xonsaroy Pay" yoki bank. */
  private async latestPaymentType(check: PaymentCheck): Promise<string | null> {
    const ids = await this.contractIds(check);
    for (const id of ids) {
      const recent = await this.payments.listRecentPayments(id, 1);
      if (recent.length) return recent[0]!.paymentType ?? null;
    }
    return null;
  }

  private windowStart(now: Date): string {
    const from = new Date(now.getTime() - CHECK_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    return from.toISOString().slice(0, 10);
  }
}
