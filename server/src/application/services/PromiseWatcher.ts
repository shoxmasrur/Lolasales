import { canAgentReply } from '@/domain/entities/Conversation';
import { kechikishYopildi } from '@/domain/entities/Contract';
import { faqatYoziladiganlar } from '@/domain/entities/shartnomaHolati';
import type { PaymentPromise } from '@/domain/entities/PaymentPromise';
import { operatorJimligiBoshi } from '@/domain/entities/PaymentCheck';
import type { IPaymentCheckRepository } from '@/domain/repositories/IPaymentCheckRepository';
import type { IPaymentPromiseRepository } from '@/domain/repositories/IPaymentPromiseRepository';
import type { IConversationRepository } from '@/domain/repositories/IConversationRepository';
import type { IContractRepository } from '@/domain/repositories/IContractRepository';
import type { IContractPaymentRepository } from '@/domain/repositories/IContractPaymentRepository';
import type { IAuditRepository } from '@/domain/repositories/ISupportRepositories';
import type { IClock, IEventBus } from '@/domain/services/support';
import type { ITalabnomaSukuti } from '@/domain/services/ITalabnomaSukuti';
import { evaluateWindow } from '@/domain/policies/SendWindowPolicy';
import { eslatmaKerakmi, evaluatePromise, type PromiseAction } from '@/domain/services/promiseOutcome';
import { bittaOchiqVada } from '@/domain/services/bittaOchiqVada';
import { tolovOynasiBoshi, vadadanKeyingiTolov } from '@/domain/services/vadaTolovi';
import type { AgentRunner } from '@/application/services/AgentRunner';
import type { ContractSyncService } from '@/application/services/ContractSyncService';
import type { RuntimeSettings } from '@/application/services/RuntimeSettings';
import type { IHolidayRepository } from '@/domain/repositories/IHolidayRepository';
import { randomBetween, sleep, toIsoDate } from '@/shared/datetime';
import { config } from '@/shared/config';
import { AbortedError, CrmUnavailableError, StaleTurnError } from '@/shared/errors';
import { childLogger } from '@/shared/logger';
import { kontekst } from '@/shared/logContext';
import type { AccountLabels } from '@/application/services/AccountLabels';

const log = childLogger('promises');

/**
 * Eslatma ish vaqtining boshlanishiga yaqin ketishi kerak, shuning uchun
 * soatlik tsikl kamlik qiladi: server 09:05 da ko'tarilsa, keyingi tekshiruv
 * 10:05 bo'lardi va "ertalabki" eslatma tushdan oldin zo'rg'a ulgurardi.
 */
const CHECK_INTERVAL_MS = 15 * 60 * 1000;

/** Bir tsiklda shuncha eslatma yuboriladi — qolgani keyingi tsiklga qoladi. */
const REMINDER_BATCH = 20;

/** Bir tsiklda shuncha va'da tekshiriladi. */
const VERIFY_BATCH = 30;

/**
 * To'lov va'dalarining kunini kuzatadi.
 *
 * Ikki vazifa bajaradi:
 *
 *   1. VA'DA KUNI ERTALAB — yumshoq eslatma ("bugun kelishuvimiz kuni edi").
 *      Mijoz hali hech narsani buzmagan; maqsad — unutgan bo'lsa eslatish va
 *      imkoni bo'lmasa buni sana o'tishidan OLDIN bilib olish.
 *
 *   2. SANA O'TGACH — to'lov kelgan-kelmagani har kuni tekshiriladi.
 *      Kelsa — RAHMAT xabari va va'da yopiladi. `watch_until` gacha
 *      kelmasa — va'da `broken` deb belgilanadi va suhbat "muzokara"
 *      holatiga qaytarilib, operator ro'yxatida ko'rinadi. Playbook
 *      8-bo'lim: buzilgan aniq va'da — keyingi bosim uchun eng kuchli asos.
 *
 *      Sana o'tishi bilanoq `broken` qo'yilmaydi: bank o'tkazmasi ertasi
 *      kuni ko'rinishi odatiy hol, ya'ni kechqurun to'lagan mijoz ham
 *      "buzg'unchi" bo'lib chiqardi.
 */
export class PromiseWatcher {
  private timer: NodeJS.Timeout | null = null;
  /** Eslatmalar orasidagi pauzalar tufayli tsikl uzoq davom etishi mumkin. */
  private busy = false;

  constructor(
    private readonly promises: IPaymentPromiseRepository,
    private readonly conversations: IConversationRepository,
    private readonly agent: AgentRunner,
    private readonly settings: RuntimeSettings,
    private readonly audit: IAuditRepository,
    private readonly events: IEventBus,
    private readonly clock: IClock,
    private readonly contracts: IContractRepository,
    private readonly payments: IContractPaymentRepository,
    private readonly contractSync: ContractSyncService,
    /** Jurnalga akkaunt nomini yozish uchun — id operatorga hech narsa aytmaydi. */
    private readonly accountLabels: AccountLabels,
    private readonly holidays: IHolidayRepository,
    /**
     * Chek tekshiruvlari: operator chekni tasdiqlagan bo'lsa rahmat
     * allaqachon aytilgan — takrorlanmaydi.
     */
    private readonly paymentChecks: IPaymentCheckRepository,
    /**
     * Talabnoma muddati ichida eslatma yozilmaydi. Rahmat (`thank`) bunga
     * bog'liq EMAS — u mijozning to'loviga javob.
     */
    private readonly talabnomaSukuti: ITalabnomaSukuti,
  ) {}

  start(): void {
    if (this.timer) return;
    void this.tick();
    this.timer = setInterval(() => void this.tick(), CHECK_INTERVAL_MS);
    log.info('Va\'dalar kuzatuvchisi ishga tushdi');
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      // Avval to'lovlarni tekshiramiz: bugun to'lagan mijoz eslatmalar
      // ro'yxatiga tushmasligi kerak.
      await this.verify();
      await this.remind();
    } finally {
      this.busy = false;
    }
  }

  /**
   * Ochiq va'dalar bo'yicha to'lov kelgan-kelmaganini tekshiradi.
   *
   * Har bir va'da uchun: shartnoma yangilanadi → va'da berilganidan
   * keyingi to'lovlar yig'iladi → `evaluatePromise` qaror beradi.
   * Mijozga xabar FAQAT "rahmat" holatida ketadi; kuzatuv davrida va
   * va'da buzilganda tizim jim turadi.
   */
  async verify(): Promise<number> {
    try {
      const runtime = await this.settings.get();
      const todayIso = this.clock.todayIso();
      const watched = await this.promises.findWatched(VERIFY_BATCH);
      if (!watched.length) return 0;

      // Takroriy rahmatning oldini oladi: bir shartnoma bo'yicha ikkita
      // ochiq va'da qolgan bo'lsa, ikkalasi ham o'sha to'lovni sanaydi.
      const { faol: faolVadalar, birlashgan } = await this.eskirganlarniYop(watched);

      // Bir marta o'qiladi va butun tsikl davomida ishlatiladi: aks holda
      // tsikl boshidagi va oxiridagi va'da bir xil tekshiruvda turlicha
      // ro'yxatni ko'rishi mumkin edi (operator xuddi shu daqiqada bayram
      // qo'shsa/o'chirsa) — bu ikki va'dani bir xilda baholashni buzardi.
      const bayramlar = await this.holidays.list();

      // To'lovni ANIQLASH tunda ham davom etadi — u mijozga ko'rinmaydi va
      // ertalabgacha kechiktirilsa, to'lagan mijoz eslatmalar ro'yxatiga
      // tushib qolardi. Oyna faqat XABARGA qo'yiladi.
      const thanksWindow = {
        start: runtime.windowStart,
        end: runtime.promiseThanksUntil,
        weekdays: runtime.weekdays,
        timeZone: config.TIMEZONE,
        holidays: bayramlar,
      };

      let acted = 0;

      for (const promise of faolVadalar) {
        // Bugun allaqachon tekshirilgan bo'lsa qayta so'ramaymiz —
        // kuzatuvchi 15 daqiqada bir marta ishlaydi.
        if (promise.checkedAt && toIsoDate(promise.checkedAt) === todayIso) continue;

        const paidAmount = await this.refreshAndSum(promise);
        const thankedAmount = await this.kochirilganRahmat(promise, paidAmount, birlashgan);

        const action = evaluatePromise(
          {
            amount: promise.amount,
            promisedDateIso: toIsoDate(promise.promisedDate) ?? todayIso,
            watchUntilIso:
              toIsoDate(promise.watchUntil) ?? toIsoDate(promise.promisedDate) ?? todayIso,
            paidAmount,
            thankedAmount,
            reminded: promise.remindedAt !== null,
          },
          todayIso,
          { bayramlar, weekdays: runtime.weekdays },
        );

        // `handled = false` bo'lsa "bugun tekshirildi" belgisi qo'yilmaydi
        // va keyingi tsiklda (15 daqiqadan keyin) qayta uriniladi.
        // Aks holda vaqtinchalik nosozlik rahmatni ERTAGA surib yuborardi.
        let handled = true;

        if (action.kind === 'thank') {
          // Kill switch yoqiq yoki ish vaqti emas — xabar ketmaydi va
          // rahmat aytilgan deb belgilanmaydi. Navbat o'z-o'zidan davom
          // etadi: keyingi tsikl uni ish vaqti boshlanganda oladi.
          //
          // Oyna har va'da uchun qayta hisoblanadi: `refreshAndSum` har
          // biri uchun shartnomalar bazasiga chiqadi va tsikl oynaning
          // oxirini kesib o'tishi mumkin.
          const window = evaluateWindow(this.clock.now(), thanksWindow);
          if (runtime.killSwitch || !window.allowed) {
            if (!runtime.killSwitch) {
              log.debug({ promiseId: promise.id, reason: window.reason }, 'Rahmat vaqti emas');
            }
            handled = false;
          } else {
            const outcome = await this.thank(promise, action);
            handled = outcome !== 'failed';
            if (outcome === 'sent') acted += 1;
          }
        } else if (action.kind === 'break') {
          await this.breakPromise(promise, paidAmount);
          acted += 1;
        }
        // 'remind' — `remind()` bajaradi (o'z vaqt oynasi bor).
        // 'wait'   — hech narsa.

        await this.promises.recordCheck(promise.id, paidAmount, handled ? this.clock.now() : null);
      }

      if (acted) this.events.publish({ type: 'stats.invalidate' });
      return acted;
    } catch (err) {
      log.error({ err }, 'Va\'da to\'lovlarini tekshirishda xato');
      return 0;
    }
  }

  /**
   * Suhbat bo'yicha bitta ochiq kelishuv qoldiradi.
   *
   * Va'da yozilganda eskisi bekor qilinadi (`AgentRunner.recordPromise`),
   * lekin bu qoida joriy qilingunga qadar ochilgan juftliklar bazada
   * qolgan. Ularning har biri o'sha to'lovni o'zinikiga qo'shib sanaydi:
   * 18-avgustda uchta mijoz bitta pul uchun ikkitadan rahmat oldi.
   *
   * Eskirgani JIMGINA yopiladi — bu ichki tartib, mijozga aytiladigan
   * gap emas. Yopish yiqilsa ham kuzatuv to'xtamaydi: bu tsiklda o'sha
   * suhbat chetlab o'tiladi, keyingisida qayta uriniladi.
   */
  private async eskirganlarniYop(
    watched: PaymentPromise[],
  ): Promise<{ faol: PaymentPromise[]; birlashgan: Map<string, number> }> {
    const faol: PaymentPromise[] = [];
    /** Omon qolgan va'da → eskirganlari aytib ulgurgan summa. */
    const birlashgan = new Map<string, number>();
    const korilgan = new Set<string>();

    for (const promise of watched) {
      if (korilgan.has(promise.conversationId)) continue;
      korilgan.add(promise.conversationId);

      // Navbatdagi va'da bilan birga suhbatning boshqa ochiq va'dalari
      // ham olinadi: juftlik bitta tsiklga tushmasligi mumkin.
      let ochiq: PaymentPromise[];
      try {
        ochiq = await this.promises.listOpenByConversation(promise.conversationId);
      } catch (err) {
        log.warn({ conversationId: promise.conversationId, err }, 'Ochiq va\'dalar olinmadi');
        continue;
      }

      for (const guruh of bittaOchiqVada(ochiq.length ? ochiq : [promise])) {
        faol.push(guruh.faol);
        if (!guruh.eskirgan.length) continue;

        // Eskirgan va'da AYTIB ULGURGAN summa yo'qolmasligi kerak: uning
        // oynasi omon qolganinikidan keng, ya'ni omon qolgan sanaydigan
        // har bir to'lov unga ham kirgan. Bu summa ko'chirilmasa, mijoz
        // ertaga o'sha pul uchun ikkinchi rahmat olardi.
        const aytilgan = guruh.eskirgan.reduce((jami, e) => jami + e.thankedAmount, 0);
        if (aytilgan > guruh.faol.thankedAmount) birlashgan.set(guruh.faol.id, aytilgan);

        for (const eski of guruh.eskirgan) {
          try {
            await this.promises.updateStatus(eski.id, 'cancelled');
            await this.audit.record({
              actor: 'agent',
              action: 'promise.superseded',
              entity: 'conversation',
              entityId: promise.conversationId,
              payload: { promiseId: eski.id, amount: eski.amount, thanked: eski.thankedAmount },
            });
            log.info(
              { conversationId: promise.conversationId, promiseId: eski.id },
              'Eskirgan va\'da yopildi — ustida yangi kelishuv bor',
            );
          } catch (err) {
            log.warn({ promiseId: eski.id, err }, 'Eskirgan va\'da yopilmadi');
          }
        }
      }
    }

    return { faol, birlashgan };
  }

  /**
   * Eskirgan va'dadan ko'chadigan "allaqachon aytilgan" summa.
   *
   * Faqat HOZIR ko'rinib turgan pulgacha ko'chiriladi: keyin kelgan pul
   * yangi bo'lib qolaveradi. Eskisi rahmat aytmagan bo'lsa — hech narsa
   * ko'chmaydi va e'tirof qilinmagan pul yo'qolmaydi.
   */
  private async kochirilganRahmat(
    promise: PaymentPromise,
    paidAmount: number,
    birlashgan: Map<string, number>,
  ): Promise<number> {
    const aytilgan = birlashgan.get(promise.id);
    if (aytilgan === undefined) return promise.thankedAmount;

    const yangi = Math.min(paidAmount, aytilgan);
    if (yangi <= promise.thankedAmount) return promise.thankedAmount;

    await this.promises.markThanked(promise.id, yangi, promise.status);
    log.info(
      { promiseId: promise.id, thanked: yangi },
      'Eskirgan va\'da aytgan rahmat omon qolganiga ko\'chirildi',
    );
    return yangi;
  }

  /**
   * Shartnomani yangilaydi va va'dadan keyin KELGAN to'lovlarni yig'adi.
   *
   * "Keyin kelgan" — faqat sana bo'yicha emas: orqaga sanalgan to'lov
   * bizga va'dadan keyin ko'ringan bo'lsa ham yangi pul hisoblanadi
   * ([[vadaTolovi]] dagi qoida).
   *
   * Shartnomalar bazasi javob bermasa, bazadagi mavjud to'lovlar bo'yicha
   * hisoblanadi — kuzatuv to'xtamaydi, faqat bir tsikl kechikadi.
   */
  private async refreshAndSum(promise: PaymentPromise): Promise<number> {
    if (promise.contractId) {
      try {
        await this.contractSync.syncIfStale(promise.contractId, config.CONTRACTS_FRESH_MINUTES);
      } catch (err) {
        log.warn({ promiseId: promise.id, err }, 'Va\'da uchun shartnoma yangilanmadi');
      }
    } else {
      // Bir nechta shartnomali mijozning va'dasi (telefon) bitta shartnomaga bog'lanmagan:
      // to'lov qaysi birida ko'rinishini bilmaymiz, shuning uchun yoziladiganlarning hammasi
      // yangilanadi — aks holda to'lagan mijoz kechgacha "buzdi" bo'lib qolishi mumkin.
      let shartnomalar: Awaited<ReturnType<IContractRepository['findByClientId']>> = [];
      try {
        shartnomalar = faqatYoziladiganlar(await this.contracts.findByClientId(promise.clientId));
      } catch (err) {
        log.warn({ promiseId: promise.id, err }, 'Va\'da uchun mijoz shartnomalari o\'qilmadi');
      }
      for (const c of shartnomalar) {
        try {
          await this.contractSync.syncIfStale(c.id, config.CONTRACTS_FRESH_MINUTES);
        } catch (err) {
          log.warn({ promiseId: promise.id, contractId: c.id, err }, 'Va\'da uchun shartnoma yangilanmadi');
        }
      }
    }

    // Oyna va'da yozilgan kundan KENGROQ olinadi: CRM to'lovga mijoz
    // to'lagan kunni qo'yadi va u bizga bir-ikki kun keyin ko'rinadi.
    // Qaysi qator haqiqatan yangi pul ekanini `vadadanKeyingiTolov` hal
    // qiladi — u to'lov QACHON topilganiga ham qaraydi.
    const vadaYaratilgan = promise.createdAt ?? promise.promisedDate;
    const events = await this.payments.listPaidSince({
      clientId: promise.clientId,
      contractId: promise.contractId,
      sinceIso: tolovOynasiBoshi(vadaYaratilgan),
    });

    return vadadanKeyingiTolov(events, vadaYaratilgan);
  }

  /**
   * Rahmat xabari.
   *
   * `thanked_amount` xabar tayyorlangandan KEYIN yoziladi: agent chaqiruvi
   * yiqilsa, keyingi tsiklda qayta uriniladi.
   */
  private async thank(
    promise: PaymentPromise,
    action: Extract<PromiseAction, { kind: 'thank' }>,
  ): Promise<'sent' | 'skipped' | 'failed'> {
    // Operator chekni oxirgi 7 kunda tasdiqlagan — o'sha tugma bilan rahmat
    // ketgan. To'lov CRM'da endi ko'rindi: va'daga yoziladi, lekin mijoz
    // ikkinchi rahmatni olmaydi.
    const tasdiq = await this.paymentChecks.findOperatorConfirmedSince(
      promise.conversationId,
      operatorJimligiBoshi(this.clock.now()),
    );
    if (tasdiq) {
      await this.promises.markThanked(promise.id, action.totalPaid, action.newStatus);
      await this.audit.record({
        actor: 'agent',
        action: 'promise.payment_received',
        entity: 'conversation',
        entityId: promise.conversationId,
        payload: {
          newMoney: action.newMoney,
          totalPaid: action.totalPaid,
          promised: promise.amount,
          full: action.full,
          sent: false,
          suppressedBy: 'receipt_review',
        },
      });
      log.info(
        { promiseId: promise.id, conversationId: promise.conversationId, checkId: tasdiq.id },
        'To\'lov va\'daga yozildi — chek tasdig\'idan keyin rahmat takrorlanmadi',
      );
      return 'skipped';
    }

    const conversation = await this.conversations.findById(promise.conversationId);
    if (!conversation || !canAgentReply(conversation)) {
      // Suhbat operator qo'lida yoki yopiq — xabar yozmaymiz, lekin
      // holatni baribir yangilaymiz: pul kelgani fakt. Bu YAKUNIY qaror,
      // qayta urinish kerak emas.
      await this.promises.markThanked(promise.id, action.totalPaid, action.newStatus);
      return 'skipped';
    }

    // "Kechikkan to'lovingiz yo'q" jumlasi FAQAT shu yerdan keladi.
    // Qaror kodda qabul qilinadi, agentga qoldirilmaydi.
    //
    // Tekshiruv MIJOZNING BARCHA shartnomasi bo'yicha: ilgari faqat
    // va'daning o'z shartnomasiga qaralardi va ikki shartnomali mijoz
    // birinchisini yopganda, ikkinchisi kechikkan turgan holda ham
    // "kechikkan to'lovingiz yo'q" degan xabar olardi.
    const contract = promise.contractId ? await this.contracts.findById(promise.contractId) : null;
    // `minDebt` EMAS, 0: bu DA'VO (jim turish emas). Chegaradan pastda
    // "yozilmaydi" to'g'ri, lekin "kechikkan to'lovingiz yo'q" degan
    // xabar mijoz o'z hisobida qoldiq ko'rsa, darhol ushlanadi.
    const debtCleared = kechikishYopildi(
      faqatYoziladiganlar(await this.contracts.findByClientId(promise.clientId)),
      0,
    );

    try {
      const result = await this.agent.paymentThanks(promise.conversationId, promise, {
        newMoney: action.newMoney,
        totalPaid: action.totalPaid,
        promisedAmount: promise.amount,
        remaining: action.remaining,
        debtCleared,
      });

      await this.promises.markThanked(promise.id, action.totalPaid, action.newStatus);
      // Chek tekshiruvi ochiq bo'lsa, operator tugmasi rahmatni takrorlamaydi.
      // Bu yozuv MUVAFFAQIYATLI rahmatdan KEYIN — yiqilsa ham rahmat
      // yuborilgani fakt, shuning uchun xato yutiladi: aks holda audit va
      // hodisalar yozilmay qolib, mijoz bir xil pul uchun ikkinchi marta
      // rahmat olishi mumkin edi.
      if (result.sent) {
        try {
          await this.paymentChecks.markThanksSent(promise.conversationId, this.clock.now());
        } catch (belgiXato) {
          log.warn(
            { promiseId: promise.id, conversationId: promise.conversationId, err: belgiXato },
            'thanks_sent_at yozilmadi',
          );
        }
      }

      await this.audit.record({
        actor: 'agent',
        action: 'promise.payment_received',
        entity: 'conversation',
        entityId: promise.conversationId,
        payload: {
          newMoney: action.newMoney,
          totalPaid: action.totalPaid,
          promised: promise.amount,
          full: action.full,
          debtCleared,
          sent: result.sent,
        },
      });

      this.events.publish({ type: 'conversation.updated', conversationId: promise.conversationId });
      log.info(
        {
          ...kontekst({
            shartnoma: contract?.contractNo,
            akkaunt: this.accountLabels.labelOf(conversation.telegramAccountId),
          }),
          promiseId: promise.id,
          conversationId: promise.conversationId,
          newMoney: action.newMoney,
          full: action.full,
        },
        'To\'lov kelib tushdi, rahmat aytildi',
      );
      return 'sent';
    } catch (err) {
      const jurnal = {
        ...kontekst({
          shartnoma: contract?.contractNo,
          akkaunt: this.accountLabels.labelOf(conversation.telegramAccountId),
        }),
        promiseId: promise.id,
        conversationId: promise.conversationId,
        err,
      };

      if (err instanceof AbortedError) {
        // Operator agentni o'chirgani uchun uzilish — nosozlik emas, xabar
        // ATAYLAB yuborilmadi. Ogohlantirish sifatida yozilsa, operator
        // Loglar sahifasida o'zi bosgan tugmaning natijasini nosozlik deb
        // o'qib, sababini bekorga qidirardi.
        // Sabab rost yozilishi kerak: `StaleTurnError` da hech kim
        // hech narsani o'chirmagan — mijoz shunchaki yozishda davom
        // etgan va rahmat xabari eskirgan.
        log.info(
          jurnal,
          err instanceof StaleTurnError
            ? 'Rahmat xabari eskirdi (mijoz yangi xabar yubordi)'
            : 'Rahmat xabari to\'xtatildi (agent o\'chirilgan)',
        );
      } else if (err instanceof CrmUnavailableError) {
        // Suhbat O'TKAZIB YUBORILADI va operatorga CHIQARILMAYDI.
        //
        // NEGA: CRM 15 daqiqa ishlamasa, shu tsiklga tushgan yuzlab
        // suhbat birdaniga operator ro'yxatiga tushib ketardi — ro'yxat
        // o'qib bo'lmaydigan holga kelardi va ularning hech biri odamdan
        // qaror talab qilmaydi. Odam faqat MIJOZ KUTIB TURGAN javob
        // yo'lida (`ReplyDebouncer`) aralashadi; bu yerda hech kim
        // kutmayapti — 15 daqiqadan keyingi tsikl o'zi qayta uriniladi.
        log.warn(jurnal, 'Rahmat xabari o\'tkazib yuborildi — CRM javob bermadi');
      } else {
        // Texnik nosozlik (peer aniqlanmagan, akkaunt kvotasi, model xatosi).
        log.warn(jurnal, 'Rahmat xabari yuborilmadi');
      }

      // Ikkala holatda ham `thanked_amount` yozilmagan, ya'ni keyingi
      // tsiklda qayta ko'riladi. Uzilishdan keyin bu to'g'ri: agent o'chiq
      // qolsa `canAgentReply` uni yuqorida "skipped" qilib yopadi, qayta
      // yoqilsa rahmat aytiladi — pul kelgani esa yo'qolmaydi.
      return 'failed';
    }
  }

  /** Kuzatuv muddati tugadi — va'da bajarilmadi. */
  private async breakPromise(promise: PaymentPromise, paidAmount: number): Promise<void> {
    await this.promises.updateStatus(promise.id, 'broken');

    const conversation = await this.conversations.findById(promise.conversationId);
    if (conversation && conversation.state !== 'closed') {
      // Qisman kelgan pul sababda ko'rsatiladi: operator suhbatni ochganda
      // "hech narsa to'lamagan" degan noto'g'ri taassurot bo'lmasin.
      const paid = paidAmount > 0 ? `, ${paidAmount.toLocaleString('ru-RU')} so'm kelgan` : '';
      await this.conversations.update(conversation.id, {
        state: 'negotiating',
        needsHuman: true,
        // Turi OSHKORA yoziladi: `SilenceWatcher` aynan shu belgiga qarab
        // buzilgan va'dali suhbatga qayta yozishga ruxsat beradi
        // (`canAgentNudge`). Belgisiz suhbat `needs_human` ostida
        // butunlay ko'rinmay qolardi va "va'da berib to'lamadi"
        // ssenariysi hech qachon ishlamasdi.
        humanKind: 'broken_promise',
        humanReason:
          `Va'da bajarilmadi: ${promise.amount.toLocaleString('ru-RU')} so'm, ` +
          `${toIsoDate(promise.promisedDate)}${paid}`,
      });
      this.events.publish({ type: 'conversation.updated', conversationId: conversation.id });
    }

    await this.audit.record({
      actor: 'system',
      action: 'promise.broken',
      entity: 'conversation',
      entityId: promise.conversationId,
      payload: {
        amount: promise.amount,
        date: toIsoDate(promise.promisedDate),
        paidAmount,
      },
    });
  }

  /**
   * Bugunga kelishilgan va'dalar bo'yicha eslatma yuboradi.
   *
   * Kampaniya rejalashtiruvchisi bilan bir xil himoya ostida ishlaydi:
   * kill switch, ish kunlari va vaqt oynasi, xabarlar orasida tasodifiy
   * pauza. Farqi — o'z oynasi bor: eslatma ERTALAB ketishi kerak.
   */
  async remind(): Promise<number> {
    try {
      const runtime = await this.settings.get();
      if (!runtime.promiseReminder || runtime.killSwitch) return 0;

      const window = {
        start: runtime.windowStart,
        end: runtime.promiseReminderUntil,
        weekdays: runtime.weekdays,
        timeZone: config.TIMEZONE,
        holidays: await this.holidays.list(),
      };

      const first = evaluateWindow(this.clock.now(), window);
      if (!first.allowed) {
        log.debug({ reason: first.reason }, 'Eslatma vaqti emas');
        return 0;
      }

      const due = await this.promises.findDueToday(this.clock.todayIso(), REMINDER_BATCH);
      if (!due.length) return 0;

      let sent = 0;
      for (const [index, promise] of due.entries()) {
        // Pauzalar tufayli oynadan chiqib ketgan bo'lishimiz mumkin.
        if (!evaluateWindow(this.clock.now(), window).allowed) {
          log.info({ remaining: due.length - index }, 'Eslatma oynasi tugadi');
          break;
        }

        // `verify()` shu tsiklda allaqachon yurgan, lekin pauzalar tufayli
        // oradan bir necha daqiqa o'tgan bo'lishi mumkin. To'lov kelgan
        // mijozga noto'g'ri eslatma yuborish — kechirilmaydigan xato,
        // shuning uchun yuborishdan oldin holatni qayta o'qiymiz.
        const fresh = await this.promises.findById(promise.id);
        if (!fresh || !eslatmaKerakmi(fresh)) {
          log.debug({ promiseId: promise.id }, 'Eslatma o\'tkazib yuborildi (to\'lov kelgan)');
          continue;
        }

        // Talabnoma muddati ichida agent o'zi yozmaydi. Bu eslatmani KEYINGA
        // SURISH EMAS, O'TKAZIB YUBORISH: eslatma faqat va'da kuni ketadi,
        // muddat tugaganda o'sha kun o'tib bo'lgan. Tekshiruv pauzadan OLDIN —
        // sukutdagi va'da 1-3 daqiqalik kutishni behuda yemasin.
        if (await this.talabnomaSukuti.sukutdami(fresh.clientId, this.clock.todayIso())) {
          log.debug({ promiseId: fresh.id }, 'Eslatma o\'tkazib yuborildi — talabnoma muddati');
          continue;
        }

        if (index > 0) {
          // Ketma-ket yuborilgan xabarlar Telegramda spam bo'lib ko'rinadi.
          await sleep(
            randomBetween(runtime.minDelaySec, Math.max(runtime.minDelaySec, runtime.maxDelaySec)) * 1000,
          );
        }

        if (await this.remindOne(fresh)) sent += 1;
      }

      if (sent) {
        this.events.publish({ type: 'stats.invalidate' });
        log.info({ sent, due: due.length }, 'Va\'da kuni eslatmalari yuborildi');
      }
      return sent;
    } catch (err) {
      log.error({ err }, 'Eslatmalarni yuborishda xato');
      return 0;
    }
  }

  /**
   * Bitta va'da bo'yicha eslatma.
   *
   * `reminded_at` ikki holatda qo'yiladi: matn tayyorlanganda va agent
   * "yozishning hojati yo'q" deb qaror qilganda (masalan bugun bu haqda
   * allaqachon yozilgan). Ikkinchisida ham belgi qo'yiladi — aks holda
   * keyingi tsikl modelni bekorga qayta chaqirardi.
   *
   * Aksincha, TEXNIK to'sqinlikda (akkaunt kvotasi, peer aniqlanmagan,
   * suhbat operator qo'lida) belgi qo'yilmaydi — keyingi tsiklda qayta
   * uriniladi. Oyna tushgacha yopiladi, ya'ni cheksiz urinish bo'lmaydi.
   */
  private async remindOne(promise: PaymentPromise): Promise<boolean> {
    const conversation = await this.conversations.findById(promise.conversationId);
    if (!conversation || !canAgentReply(conversation)) {
      log.debug({ promiseId: promise.id }, 'Eslatma o\'tkazib yuborildi (suhbat yopiq yoki operator qo\'lida)');
      return false;
    }

    // Faqat jurnal uchun: eslatma kuniga bir marta va va'da boshiga bir
    // marta yuboriladi, ya'ni bu qo'shimcha so'rov sezilarli emas —
    // "qaysi shartnoma" savoliga javobsiz jurnal esa yaroqsiz.
    const contract = promise.contractId ? await this.contracts.findById(promise.contractId) : null;
    const jurnal = kontekst({
      shartnoma: contract?.contractNo,
      akkaunt: this.accountLabels.labelOf(conversation.telegramAccountId),
    });

    try {
      const result = await this.agent.promiseReminder(conversation.id, promise);
      await this.promises.markReminded(promise.id, this.clock.now());

      if (!result.reply) {
        log.debug({ promiseId: promise.id }, 'Agent eslatma yozishni kerak topmadi');
        return false;
      }

      await this.audit.record({
        actor: 'agent',
        action: 'promise.reminded',
        entity: 'conversation',
        entityId: conversation.id,
        payload: {
          amount: promise.amount,
          date: promise.promisedDate.toISOString().slice(0, 10),
          // Avtomatik javob o'chirilgan bo'lsa — matn qoralama bo'lib qoldi.
          sent: result.sent,
        },
      });
      log.info({ ...jurnal, promiseId: promise.id, conversationId: conversation.id }, 'Eslatma yuborildi');
      return true;
    } catch (err) {
      // Operator agentni o'chirgani uchun uzilish nosozlik emas: `reminded_at`
      // qo'yilmaydi va keyingi tsikl bu va'dani `canAgentReply` da o'zi
      // to'xtatadi. Faqat jurnal darajasi farq qiladi — "yuborilmadi"
      // ogohlantirishi operatorni yo'q nosozlikni qidirishga majburlardi.
      if (err instanceof AbortedError) {
        log.info(
          { ...jurnal, promiseId: promise.id, conversationId: conversation.id },
          err instanceof StaleTurnError
            ? 'Eslatma eskirdi (mijoz yangi xabar yubordi)'
            : 'Eslatma to\'xtatildi (agent o\'chirilgan)',
        );
        return false;
      }

      if (err instanceof CrmUnavailableError) {
        // `reminded_at` qo'yilmaydi — keyingi tsikl (15 daqiqa) qayta
        // uriniladi. Operatorga chiqarilmaydi: CRM uzoq yiqilsa, bir
        // tsiklning o'zida yuzlab suhbat odam ro'yxatiga tushardi, holbuki
        // ularning birortasi ham odam qaroriga muhtoj emas. Eslatma oynasi
        // tushgacha yopiladi, ya'ni cheksiz urinish bo'lmaydi.
        log.warn(
          { ...jurnal, promiseId: promise.id, conversationId: conversation.id },
          'Eslatma o\'tkazib yuborildi — CRM javob bermadi',
        );
        return false;
      }

      log.warn(
        { ...jurnal, promiseId: promise.id, conversationId: conversation.id, err },
        'Eslatma yuborilmadi',
      );
      return false;
    }
  }
}
