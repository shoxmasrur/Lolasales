import { canAgentNudge } from '@/domain/entities/Conversation';
import { kechikishYopildi } from '@/domain/entities/Contract';
import { faqatYoziladiganlar } from '@/domain/entities/shartnomaHolati';
import { ochiqVadami } from '@/domain/entities/PaymentPromise';
import type { IConversationRepository } from '@/domain/repositories/IConversationRepository';
import type { IContractRepository } from '@/domain/repositories/IContractRepository';
import type { IPaymentPromiseRepository } from '@/domain/repositories/IPaymentPromiseRepository';
import type { IAuditRepository } from '@/domain/repositories/ISupportRepositories';
import type { IClock } from '@/domain/services/support';
import type { ITalabnomaSukuti } from '@/domain/services/ITalabnomaSukuti';
import { evaluateWindow } from '@/domain/policies/SendWindowPolicy';
import { nudgeKerakmi } from '@/domain/services/sukut';
import type { AgentRunner } from '@/application/services/AgentRunner';
import type { RuntimeSettings } from '@/application/services/RuntimeSettings';
import type { IHolidayRepository } from '@/domain/repositories/IHolidayRepository';
import { randomBetween, sleep } from '@/shared/datetime';
import { config } from '@/shared/config';
import { AbortedError, CrmUnavailableError, StaleTurnError } from '@/shared/errors';
import { childLogger } from '@/shared/logger';

const log = childLogger('sukut');

/** `PromiseWatcher` bilan bir xil temp: ish oynasining boshiga yaqin tushish uchun. */
const CHECK_INTERVAL_MS = 15 * 60 * 1000;

/** Bir tsiklda shuncha qayta murojaat ketadi — qolgani keyingi tsiklga. */
const BATCH = 20;

/** Yakshanba — `zonedParts` da 7 (`sukut.ts` bilan bir xil). */
const YAKSHANBA = 7;

/** Nomzodlar qarordan ko'p tanlanadi: ularning bir qismi filtrlarda tushib qoladi. */
const CANDIDATE_LIMIT = BATCH * 3;

/**
 * Mijoz javob bermay qo'ygan suhbatlarni topib, agentga qayta murojaat
 * yozdiradi.
 *
 * `PromiseWatcher` bilan BIR XIL himoya ostida ishlaydi va bu ataylab:
 * yangi naqsh o'ylab topilsa, ban riskining bir qatlami unutilib qolardi.
 */
export class SilenceWatcher {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  /** Ketayotgan partiya — `stop()` aynan shuni kutadi. */
  private inflight: Promise<void> | null = null;
  /** To'xtatish so'ralgani: partiya keyingi suhbatga o'tmasin. */
  private stopping = false;

  constructor(
    private readonly conversations: IConversationRepository,
    private readonly promises: IPaymentPromiseRepository,
    private readonly contracts: IContractRepository,
    private readonly agent: AgentRunner,
    private readonly settings: RuntimeSettings,
    private readonly audit: IAuditRepository,
    private readonly clock: IClock,
    private readonly holidays: IHolidayRepository,
    /** Talabnoma muddati ichida mijozga agent o'zi yozmaydi. */
    private readonly talabnomaSukuti: ITalabnomaSukuti,
  ) {}

  start(): void {
    if (this.timer) return;
    this.stopping = false;
    log.info('Sukut kuzatuvchisi ishga tushdi');
    void this.tick();
    this.timer = setInterval(() => void this.tick(), CHECK_INTERVAL_MS);
  }

  /**
   * To'xtatish ketayotgan partiyani KUTADI.
   *
   * NEGA: bu kuzatuvchida hisoblagich yon ta'siri bor — `nudgeCount`
   * agent chaqiruvidan OLDIN oshiriladi. SIGTERM aynan shu ikki qadam
   * orasida kelsa, suhbatning urinishi "sarflangan" bo'lib, xabar esa
   * hech qachon ketmaydi: mijoz jim qolgan holicha ro'yxatdan chiqib
   * ketardi. `scheduler.stop()` bilan bir xil naqsh.
   *
   * `stopping` bayrog'i kutishni CHEKLAYDI: partiya keyingi suhbatga
   * o'tmaydi, ya'ni to'xtatish 20 ta suhbat va ular orasidagi 1-3
   * daqiqalik pauzalarni kutib qolmaydi. Faqat boshlangan bittasi
   * oxirigacha boradi — aynan hisoblagichi oshirilgani.
   */
  async stop(): Promise<void> {
    this.stopping = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    await this.inflight;
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    const partiya = this.nudge()
      .then(() => undefined)
      .catch((err: unknown) => {
        log.error({ err }, 'Sukut tsiklida xato');
      })
      .finally(() => {
        this.running = false;
        this.inflight = null;
      });
    // Havola `stop()` uchun saqlanadi: `await` dan OLDIN qo'yiladi, aks
    // holda to'xtatish so'rovi partiyani umuman ko'rmasdan o'tib ketardi.
    this.inflight = partiya;
    await partiya;
  }

  /** @returns nechta qayta murojaat yuborilgani */
  async nudge(): Promise<number> {
    const runtime = await this.settings.get();
    if (!runtime.silenceNudge || runtime.killSwitch) return 0;

    // Yakshanba shu yerda MAJBURAN kesiladi.
    //
    // NEGA umumiy sozlamaga ishonmaymiz: `weekdays` ni operator
    // dashboarddan o'zgartira oladi va yakshanbani yoqib qo'yishi mumkin.
    // Qayta murojaat esa "javob bermadingiz" degan da'voga asoslanadi,
    // yakshanba esa dalil emas: bank ishlamaydi, mijoz to'lagan bo'lsa
    // ham pul o'tmagan bo'lishi mumkin. `sukutKunlari` yakshanbani
    // sanamaydi — yuborish kunini ham shunga moslaymiz.
    const nudgeWeekdays = runtime.weekdays.filter((d) => d !== YAKSHANBA);
    if (!nudgeWeekdays.length) {
      // Bo'sh ro'yxatni `evaluateWindow` dushanbadan shanbagacha (1-6) deb
      // tushunadi — ya'ni faqat yakshanba tanlangan sozlama qayta
      // murojaatni operator ISTAMAGAN besh kunga (dush-juma+shanba) yoqib
      // yuborardi. Bu holda umuman yozmaymiz.
      log.debug('Qayta murojaat kunlari faqat yakshanbaga qolgan — yozilmaydi');
      return 0;
    }

    const window = {
      start: runtime.windowStart,
      end: runtime.windowEnd,
      weekdays: nudgeWeekdays,
      timeZone: config.TIMEZONE,
      holidays: await this.holidays.list(),
    };
    const first = evaluateWindow(this.clock.now(), window);
    if (!first.allowed) {
      log.debug({ reason: first.reason }, 'Qayta murojaat vaqti emas');
      return 0;
    }

    // `minDebt` SQL'ga beriladi: ochiq va'dali va kechikishi yopilgan
    // suhbatlar 60 talik ro'yxatni egallamasin. Ilgari ular tanlanib, keyin
    // kodda o'tkazib yuborilardi va navbat tiqilib qolgan edi (2026-09-15:
    // 469 nomzod, birinchi haqiqiysi 63-o'rinda). Pastdagi koddagi
    // tekshiruv baribir qoladi — u yuborishdan oldingi oxirgi himoya.
    // `todayIso` — talabnoma muddatidagi mijozlar ham SQL'da chiqariladi (shu sabab).
    const candidates = await this.conversations.findSilent(
      CANDIDATE_LIMIT, runtime.silenceNudgeMax, runtime.minDebt, this.clock.todayIso(),
    );
    if (!candidates.length) return 0;

    const qoidalar = {
      kunlar: runtime.silenceNudgeDays,
      maxUrinish: runtime.silenceNudgeMax,
      timeZone: config.TIMEZONE,
    };

    // Ikkita hisoblagich ATAYLAB alohida:
    //
    //   • `processed` — agent chaqiruviga YETIB BORGAN nomzodlar. Partiya
    //     chegarasi va pauza ham shunga bog'langan, chunki qimmat va
    //     xavfli qadam aynan chaqiruvning o'zi: u model pulini sarflaydi
    //     va suhbatning urinish hisoblagichini oshiradi.
    //   • `sent` — haqiqatda Telegramga ketgan xabarlar, faqat JURNAL
    //     uchun. Unga bog'lab bo'lmaydi: qo'lda tasdiqlash rejimida
    //     (`agentAutoReply` o'chiq) yoki model `reply: null` qaytarganda
    //     `sent` umuman oshmaydi va bitta tsiklda 60 ta nomzod ketma-ket,
    //     pauzasiz model chaqiruvini olardi.
    let processed = 0;
    let sent = 0;
    for (const candidate of candidates) {
      if (processed >= BATCH) break;
      // To'xtatish so'ralgan: boshlanmagan suhbatga tegmaymiz — ularning
      // hisoblagichi hali oshirilmagan, keyingi tsiklda o'z navbatini oladi.
      if (this.stopping) {
        log.info({ remaining: candidates.length - processed }, 'Qayta murojaat to\'xtatildi');
        break;
      }
      if (!evaluateWindow(this.clock.now(), window).allowed) {
        log.info({ remaining: candidates.length - processed }, 'Qayta murojaat oynasi tugadi');
        break;
      }

      // Nomzodlar ro'yxati olinganidan beri daqiqalar o'tgan bo'lishi mumkin —
      // pauzalar tufayli. Bu yerdagi o'qish DASTLABKI filtr: nomzodni
      // qarorgacha olib boradimi (holat, kechikish, va'da) shuni tekshiradi.
      // U yuborishdan "darhol oldin" degani EMAS — pastda, tasodifiy
      // pauzadan KEYIN, haqiqiy yuborish oldidan yana bir marta qayta
      // o'qiladi, chunki aynan o'sha pauza (1-3 daqiqa) ichida mijoz javob
      // yozib ulgurishi mumkin.
      const fresh = await this.conversations.findById(candidate.id);
      // `canAgentReply` EMAS: buzilgan va'dali suhbat `needs_human`
      // ostida turadi va u yerda rad etilardi — `findSilent` uni
      // tanlagan bo'lsa ham (`canAgentNudge` izohiga qarang).
      if (!fresh || !canAgentNudge(fresh)) continue;
      if (fresh.lastInboundAt && fresh.lastOutboundAt && fresh.lastInboundAt >= fresh.lastOutboundAt) {
        continue;
      }
      if (!fresh.lastOutboundAt) continue;

      const active = await this.promises.findActiveByConversation(fresh.id);
      const kechikishYopilgan = kechikishYopildi(
        faqatYoziladiganlar(await this.contracts.findByClientId(fresh.clientId)),
        runtime.minDebt,
      );

      const kerak = nudgeKerakmi(
        {
          lastOutboundAt: fresh.lastOutboundAt,
          nudgeCount: fresh.nudgeCount,
          ochiqVadaBor: Boolean(active && ochiqVadami(active.status)),
          kechikishYopilgan,
        },
        this.clock.now(),
        qoidalar,
      );
      if (!kerak) continue;

      // Talabnoma muddati ichida — agent o'zi yozmaydi. Hisoblagich
      // oshirilmaydi: muddat tugagach sukut zanjiri shu joyidan davom etadi.
      if (await this.talabnomaSukuti.sukutdami(fresh.clientId, this.clock.todayIso())) {
        log.debug({ conversationId: fresh.id }, 'Qayta murojaat o\'tkazildi — talabnoma muddati');
        continue;
      }

      if (processed > 0) {
        // Ketma-ket ketgan xabarlar Telegramda spam bo'lib ko'rinadi. Pauza
        // ATAYLAB faqat haqiqiy yuborishdan oldin turibdi — o'tkazib
        // yuborilgan (skip qilingan) nomzodlar oynani behuda yemasin.
        await sleep(
          randomBetween(runtime.minDelaySec, Math.max(runtime.minDelaySec, runtime.maxDelaySec)) * 1000,
        );

        // `stopping` shu yerda ham tekshiriladi: pauza o'zi 1-3 daqiqa
        // davom etadi, ya'ni SIGTERM aynan pauza ichida kelsa, tsikl
        // boshidagi tekshiruv uni ko'rmaydi va `stop()` butun pauza + undan
        // keyingi agent chaqiruvini kutib turadi — systemd ning sukut
        // to'xtatish muddatidan (90s) oshib ketishi mumkin. Bu nomzod hali
        // hisoblagichi oshirilmagan, ya'ni keyingi tsiklda o'z navbatini
        // xavfsiz oladi.
        if (this.stopping) {
          log.info({ remaining: candidates.length - processed }, 'Qayta murojaat to\'xtatildi (pauzadan keyin)');
          continue;
        }

        // Pauza 1-3 daqiqa davom etadi — aynan shu oraliqda mijoz javob
        // yozib ulgurishi mumkin (inbound belgisi xabar kelishi bilan
        // SINXRON yoziladi). Yuqoridagi tekshiruv pauzadan OLDIN bo'lgani
        // uchun eskirgan bo'lishi mumkin, shuning uchun holat YUBORISHDAN
        // DARHOL OLDIN yana qayta o'qiladi — javob yozgan mijozga "sukut"
        // xabari ketishi mumkin bo'lgan yagona joy shu yerda yopiladi.
        //
        // Oxirgi chiquvchi xabar o'zgargan bo'lsa ham to'xtaymiz: pauza
        // ichida boshqa tizim xabari (masalan, `OylikEslatmaWatcher`
        // eslatmasi) ketgan — mijoz javob bermagan bo'lsa ham, soniyalar
        // ichida ikkinchi xabar spam bo'lib ko'rinadi. Sukut zanjiri o'sha
        // yangi xabardan qayta hisoblanadi.
        const revalidated = await this.conversations.findById(fresh.id);
        if (
          !revalidated ||
          !canAgentNudge(revalidated) ||
          (revalidated.lastInboundAt &&
            revalidated.lastOutboundAt &&
            revalidated.lastInboundAt >= revalidated.lastOutboundAt) ||
          revalidated.lastOutboundAt?.getTime() !== fresh.lastOutboundAt?.getTime()
        ) {
          continue;
        }
        // Pauza ichida operator talabnoma yuborgan bo'lishi mumkin.
        if (await this.talabnomaSukuti.sukutdami(fresh.clientId, this.clock.todayIso())) {
          log.debug({ conversationId: fresh.id }, 'Qayta murojaat o\'tkazildi — talabnoma muddati (pauzadan keyin)');
          continue;
        }
      }

      const attempt = fresh.nudgeCount + 1;
      // Bu urinish OXIRGISIMI — chegara sozlamadan keladi (1..3), kodda
      // qotib qolgan raqamdan emas. Prompt shu bayroqqa qarab "bundan
      // keyin yozmayman" degan yopuvchi jumlani qo'shadi.
      const last = attempt >= runtime.silenceNudgeMax;
      try {
        // Hisoblagich chaqiruvdan OLDIN oshiriladi: agent `reply: null`
        // qaytarsa ham ("bu yerda yozish noto'g'ri"), ertaga qayta
        // so'rashning ma'nosi yo'q — javob o'zgarmaydi.
        await this.conversations.bumpNudgeCount(fresh.id);

        if (last) {
          // Yozuv agent chaqiruvidan OLDIN va uning natijasidan QAT'IY
          // NAZAR yoziladi. Hisoblagich allaqachon chegaraga yetdi, ya'ni
          // suhbat shu daqiqadan boshlab `findSilent` dan butunlay chiqib
          // ketdi. Chaqiruv yiqilsa, yozuvsiz suhbat hech qayerda
          // ko'rinmasdan jim qolardi — operator uni topa olmasdi.
          //
          // `actor: 'system'` — bu agent yozgan xabar emas, hisoblagich
          // chegarasiga yetgani haqidagi ichki bookkeeping ('promise.broken'
          // bilan bir xil naqsh `PromiseWatcher` da).
          //
          // Jurnal xatosi xabarni TO'SMASLIGI kerak: audit yozuvi
          // qulaylik, qayta murojaatning o'zi esa asosiy ish.
          await this.audit
            .record({
              actor: 'system',
              action: 'nudge.exhausted',
              entity: 'conversation',
              entityId: fresh.id,
              payload: { attempts: attempt },
            })
            .catch((err: unknown) =>
              log.warn({ err, conversationId: fresh.id }, 'Chegara yozuvi yozilmadi'),
            );
        }

        processed += 1;
        const result = await this.agent.silenceNudge(fresh.id, attempt, last);
        if (result.sent) sent += 1;
      } catch (err) {
        if (err instanceof AbortedError || err instanceof StaleTurnError) {
          log.info({ conversationId: fresh.id }, 'Qayta murojaat uzildi');
          continue;
        }
        if (err instanceof CrmUnavailableError) {
          // Urinish QAYTARILADI.
          //
          // Hisoblagich chaqiruvdan oldin oshiriladi va bu ataylab: model
          // `reply: null` qaytarsa ham urinish sarflanadi (yuqoridagi
          // izoh). Lekin u qaror MODEL javob berganda ma'noli. CRM
          // yiqilganda model umuman chaqirilmagan — javob o'zgarmaydi
          // degan asos yo'q, ya'ni urinish behuda yo'qolardi. Shuning
          // uchun ORQAGA qaytarish FAQAT shu xatoda: boshqa nosozliklarda
          // (model limiti, Telegram) qaytarish cheksiz aylanish ochardi.
          //
          // `last` bo'lgan holda yuqorida `nudge.exhausted` yozuvi allaqachon
          // yozilgan bo'lishi mumkin — u jurnal uchun, hisoblagich esa
          // baribir qaytariladi va suhbat `findSilent` ga qaytib tushadi.
          await this.conversations
            .unbumpNudgeCount(fresh.id)
            .catch((e: unknown) =>
              log.warn({ err: e, conversationId: fresh.id }, 'Urinish qaytarilmadi'),
            );
          // Operatorga CHIQARILMAYDI: CRM 15 daqiqa ishlamasa, bir tsiklda
          // 20 tagacha, kun davomida yuzlab suhbat odam ro'yxatiga tushib
          // ketardi. Odam faqat mijoz kutib turgan javob yo'lida
          // aralashadi — bu yerda hech kim kutmayapti.
          log.warn({ conversationId: fresh.id }, 'Qayta murojaat o\'tkazib yuborildi — CRM javob bermadi');
          continue;
        }
        log.error({ err, conversationId: fresh.id }, 'Qayta murojaat yiqildi');
      }
    }

    // Ikkalasi ham yoziladi: farq bo'lsa (`processed` > `sent`) — bu
    // qo'lda tasdiqlash rejimi yoki agent "yozmaslik" qarori, ya'ni
    // operator uchun ma'noli signal.
    if (processed) log.info({ processed, sent }, 'Qayta murojaat yuborildi');
    return sent;
  }
}
