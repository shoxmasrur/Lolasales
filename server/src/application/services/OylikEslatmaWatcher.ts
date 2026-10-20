import { canAgentReply, type Conversation } from '@/domain/entities/Conversation';
import { faqatYoziladiganlar } from '@/domain/entities/shartnomaHolati';
import type { IContractPaymentRepository } from '@/domain/repositories/IContractPaymentRepository';
import type { IContractRepository } from '@/domain/repositories/IContractRepository';
import type { IConversationRepository } from '@/domain/repositories/IConversationRepository';
import type { IHolidayRepository } from '@/domain/repositories/IHolidayRepository';
import type { IOylikEslatmaRepository, QatorKaliti } from '@/domain/repositories/IOylikEslatmaRepository';
import type { IAuditRepository } from '@/domain/repositories/ISupportRepositories';
import { evaluateWindow } from '@/domain/policies/SendWindowPolicy';
import {
  ESLATMA_OYNASI_KUN,
  eslatmaMalumoti,
  eslatmaQarori,
  ertami,
  kunQosh,
  qatorKaliti,
  type JadvalQatori,
} from '@/domain/services/oylikEslatma';
import type { IClock } from '@/domain/services/support';
import type { ITalabnomaSukuti } from '@/domain/services/ITalabnomaSukuti';
import type { AgentRunner, AgentTurnResult } from '@/application/services/AgentRunner';
import type { ContractSyncService } from '@/application/services/ContractSyncService';
import type { RuntimeSettings } from '@/application/services/RuntimeSettings';
import { config } from '@/shared/config';
import { randomBetween, sleep, zonedParts } from '@/shared/datetime';
import { AbortedError, CrmUnavailableError, KillSwitchError, StaleTurnError } from '@/shared/errors';
import { childLogger } from '@/shared/logger';

const log = childLogger('oylik-eslatma');

/** `SilenceWatcher` bilan bir xil temp. */
const CHECK_INTERVAL_MS = 15 * 60 * 1000;
/** Bir tsiklda shuncha agent chaqiruvi — qolgani keyingi tsiklga. */
const BATCH = 20;
/** Nomzod QATORLAR soni (bir mijozda bir nechta bo'lishi mumkin). */
const CANDIDATE_LIMIT = 300;
/** Shu vaqt ichida xabar almashilgan suhbat "faol" — eslatma keyinga qoladi. */
const FAOL_SUHBAT_MS = 24 * 60 * 60 * 1000;
/**
 * B guruhining boshlanishi bayram/yakshanba sababli orqaga suriladi —
 * nomzodlar oldindan shuncha kun ko'proq olinadi, aniq qarorni
 * `eslatmaQarori` beradi.
 */
const OLDINGA_ZAXIRA_KUN = 10;

/**
 * Yangi oylik to'lov sanasi kelganda avval yozilgan mijozga bir marta
 * eslatma yuboradi (2026-09-22). Keyingi qayta yozishlar — `SilenceWatcher`.
 *
 * Himoya `SilenceWatcher` bilan bir xil: oyna, kill switch, xabarlar
 * orasida tasodifiy pauza, pauzadan keyin holatni qayta o'qish.
 */
export class OylikEslatmaWatcher {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private inflight: Promise<void> | null = null;
  private stopping = false;

  constructor(
    private readonly eslatmalar: IOylikEslatmaRepository,
    private readonly conversations: IConversationRepository,
    private readonly contracts: IContractRepository,
    private readonly payments: IContractPaymentRepository,
    private readonly contractSync: ContractSyncService,
    private readonly agent: AgentRunner,
    private readonly settings: RuntimeSettings,
    private readonly clock: IClock,
    private readonly holidays: IHolidayRepository,
    private readonly audit: IAuditRepository,
    /** Talabnoma muddati ichida eslatma yozilmaydi. */
    private readonly talabnomaSukuti: ITalabnomaSukuti,
  ) {}

  start(): void {
    if (this.timer) return;
    this.stopping = false;
    log.info('Oylik eslatma kuzatuvchisi ishga tushdi');
    void this.tick();
    this.timer = setInterval(() => void this.tick(), CHECK_INTERVAL_MS);
  }

  /** Ketayotgan partiyani kutadi: yozuv qo'shilib, agent chaqirilmay qolmasin. */
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
    const partiya = this.run()
      .then(() => undefined)
      .catch((err: unknown) => log.error({ err }, 'Oylik eslatma tsiklida xato'))
      .finally(() => {
        this.running = false;
        this.inflight = null;
      });
    this.inflight = partiya;
    await partiya;
  }

  /** @returns nechta eslatma haqiqatda yuborilgani */
  async run(): Promise<number> {
    const runtime = await this.settings.get();
    if (!runtime.oylikEslatma || runtime.killSwitch) return 0;

    const bayramlar = await this.holidays.list();
    const window = {
      start: runtime.windowStart,
      end: runtime.windowEnd,
      weekdays: runtime.weekdays,
      timeZone: config.TIMEZONE,
      holidays: bayramlar,
    };
    if (!evaluateWindow(this.clock.now(), window).allowed) return 0;

    const today = this.clock.todayIso();
    const qoldi = runtime.oylikEslatmaKunlik - (await this.eslatmalar.bugunYuborilgan(today));
    if (qoldi <= 0) {
      log.debug('Oylik eslatma kunlik chegarasi to\'ldi');
      return 0;
    }
    const chegara = Math.min(BATCH, qoldi);

    const nomzodlar = await this.eslatmalar.nomzodlar(
      kunQosh(today, -ESLATMA_OYNASI_KUN),
      kunQosh(today, runtime.oylikEslatmaOldinKun + OLDINGA_ZAXIRA_KUN),
      CANDIDATE_LIMIT,
    );

    // Suhbat bo'yicha birlashtiriladi — mijozga bitta xabar. `Map` qo'shilish
    // tartibini saqlaydi, ya'ni eng eski sanali mijoz birinchi.
    // `sanalar` — sinxdan oldingi "hali erta" filtri uchun.
    const suhbatlar = new Map<string, { clientId: string; kalitlar: Set<string>; sanalar: string[] }>();
    for (const n of nomzodlar) {
      const s = suhbatlar.get(n.conversationId) ?? { clientId: n.clientId, kalitlar: new Set<string>(), sanalar: [] };
      s.kalitlar.add(qatorKaliti(n.contractId, n.datePayment));
      s.sanalar.push(n.datePayment);
      suhbatlar.set(n.conversationId, s);
    }

    const qoidalar = {
      oldinKun: runtime.oylikEslatmaOldinKun,
      keyinKun: runtime.oylikEslatmaKeyinKun,
      bayramlar,
      weekdays: runtime.weekdays,
    };

    let processed = 0;
    let sent = 0;
    for (const [conversationId, s] of suhbatlar) {
      if (processed >= chegara || this.stopping) break;
      if (!evaluateWindow(this.clock.now(), window).allowed) break;

      // Nomzodlar oldindan olinadi — hech bir qatorning vaqti kelmagan
      // bo'lsa, CRM'ni har 15 daqiqada behuda sinxronlamaymiz.
      if (s.sanalar.every((d) => ertami(d, today, qoidalar))) continue;

      const fresh = await this.conversations.findById(conversationId);
      if (!fresh || !canAgentReply(fresh) || this.faolmi(fresh)) continue;
      // Talabnoma muddati ichida agent o'zi yozmaydi. Qator YOZILMAYDI: muddat
      // tugagach eslatma (oyna ichida bo'lsa) o'z navbatini oladi.
      if (await this.talabnomaSukuti.sukutdami(s.clientId, today)) {
        log.debug({ conversationId }, 'Oylik eslatma o\'tkazildi — talabnoma muddati');
        continue;
      }

      let jadval: JadvalQatori[];
      const raqamlar = new Map<string, string>();
      try {
        jadval = await this.jadval(s.clientId, raqamlar);
      } catch (err) {
        log.warn({ err, conversationId }, 'Jadval yangilanmadi — keyingi tsiklda');
        continue;
      }

      const qaror = eslatmaQarori(s.kalitlar, jadval, today, runtime.minDebt, qoidalar);
      if (qaror.tolangan.length) {
        // Yozilmasa — keyingi tsiklda yana "to'langan" bo'lib chiqadi;
        // qolgan mijozlar navbati shu sababli to'xtamasin.
        await this.eslatmalar.yoz(qaror.tolangan.map((r) => ({
          contractId: r.contractId,
          datePayment: r.datePayment,
          clientId: s.clientId,
          guruh: qaror.guruh,
          holat: 'skipped' as const,
          sabab: 'tolangan',
        }))).catch((e: unknown) => log.warn({ err: e, conversationId }, 'To\'langan yozuvi qo\'shilmadi'));
      }
      if (!qaror.tayyor.length) continue;

      // To'lov sanasidan KEYIN suhbatga allaqachon yozilgan — kechikish
      // mavzusi ochilgan, davomi `SilenceWatcher`/`PromiseWatcher` ishi.
      // `faolmi` faqat 24 soatga qaraydi: 2026-09-30 da agentning birinchi
      // xabaridan 24 soat 8 daqiqa o'tib, javob kelmagan mijozga shu to'lov
      // haqida yana yozilgan edi. Qator qayd etiladi — navbatdan chiqsin.
      const yozilganKun = fresh.lastOutboundAt ? zonedParts(fresh.lastOutboundAt).isoDate : null;
      const yozilgan = yozilganKun ? qaror.tayyor.filter((r) => r.datePayment < yozilganKun) : [];
      if (yozilgan.length) {
        await this.eslatmalar.yoz(yozilgan.map((r) => ({
          contractId: r.contractId,
          datePayment: r.datePayment,
          clientId: s.clientId,
          guruh: qaror.guruh,
          holat: 'skipped' as const,
          sabab: 'yozilgan',
        }))).catch((e: unknown) => log.warn({ err: e, conversationId }, 'Yozilgan yozuvi qo\'shilmadi'));
      }
      const tayyor = qaror.tayyor.filter((r) => !yozilgan.includes(r));
      if (!tayyor.length) continue;

      if (processed > 0) {
        // Ketma-ket xabarlar Telegramda spam bo'lib ko'rinadi.
        await sleep(randomBetween(runtime.minDelaySec, Math.max(runtime.minDelaySec, runtime.maxDelaySec)) * 1000);
        if (this.stopping) break;
        // Pauza ichida mijoz yozgan bo'lishi mumkin.
        const qayta = await this.conversations.findById(conversationId);
        if (!qayta || !canAgentReply(qayta) || this.faolmi(qayta)) continue;
      }

      const kalitlar: QatorKaliti[] = tayyor.map((r) => ({ contractId: r.contractId, datePayment: r.datePayment }));
      // Yozuv agent chaqiruvidan OLDIN: jarayon yarim yo'lda o'lsa ham
      // mijozga ikkinchi marta yozilmaydi.
      const qoshildi = await this.eslatmalar.yoz(kalitlar.map((k) => ({
        ...k,
        clientId: s.clientId,
        guruh: qaror.guruh,
        holat: 'sent' as const,
        sabab: null,
      })));
      if (qoshildi === 0) continue;

      // Sinx, pauza va yozuv orasida vaqt o'tdi — shu oraliqda `SilenceWatcher`
      // (bir xil 15 daqiqalik temp) sukut xabarini yuborib ulgurgan bo'lishi
      // mumkin: mijozga bir necha soniya ichida ikki xabar ketardi. Oxirgi
      // chiquvchi xabar o'zgargan bo'lsa — yozuv qaytariladi, eslatma
      // keyingi tsiklda (24 soatdan keyin) yangi holatdan qayta hal qilinadi.
      const oxirgi = await this.conversations.findById(conversationId);
      if (
        !oxirgi
        || !canAgentReply(oxirgi)
        || this.faolmi(oxirgi)
        || oxirgi.lastOutboundAt?.getTime() !== fresh.lastOutboundAt?.getTime()
        // Sinx/pauza ichida operator talabnoma yuborgan bo'lishi mumkin.
        || (await this.talabnomaSukuti.sukutdami(s.clientId, today))
      ) {
        await this.eslatmalar.ochir(kalitlar).catch((e: unknown) =>
          log.warn({ err: e, conversationId }, 'Yozuv o\'chirilmadi'));
        continue;
      }

      processed += 1;
      let result: AgentTurnResult;
      try {
        result = await this.agent.monthlyReminder(
          conversationId,
          eslatmaMalumoti(qaror.guruh, tayyor, jadval, raqamlar, today),
        );
      } catch (err) {
        if (err instanceof CrmUnavailableError) {
          // Model chaqirilmagan — qator navbatga qaytadi.
          await this.eslatmalar.ochir(kalitlar).catch((e: unknown) =>
            log.warn({ err: e, conversationId }, 'Yozuv o\'chirilmadi'));
          log.warn({ conversationId }, 'Oylik eslatma o\'tkazib yuborildi — CRM javob bermadi');
          continue;
        }
        if (err instanceof KillSwitchError) {
          // Kill switch tsikl o'rtasida yoqildi — xabar ketmagan. Qator
          // navbatga qaytadi (aks holda `agent_xato` bo'lib eslatma butunlay
          // yo'qolardi) va qolgan mijozlarga ham urinilmaydi.
          await this.eslatmalar.ochir(kalitlar).catch((e: unknown) =>
            log.warn({ err: e, conversationId }, 'Yozuv o\'chirilmadi'));
          log.warn({ conversationId }, 'Oylik eslatma to\'xtatildi — kill switch yoqilgan');
          break;
        }
        await this.eslatmalar.holatniOzgartir(kalitlar, 'skipped', 'agent_xato').catch((e: unknown) =>
          log.warn({ err: e, conversationId }, 'Yozuv holati yangilanmadi'));
        if (err instanceof AbortedError || err instanceof StaleTurnError) {
          log.info({ conversationId }, 'Oylik eslatma uzildi');
          continue;
        }
        log.error({ err, conversationId }, 'Oylik eslatma yiqildi');
        // Operator jurnalda ko'rsin: eslatma bu to'lov uchun QAYTA
        // urinilmaydi. Jurnal xatosi tsiklni to'xtatmasin.
        await this.audit
          .record({
            actor: 'system',
            action: 'oylik_eslatma.failed',
            entity: 'conversation',
            entityId: conversationId,
            payload: { sabab: 'agent_xato', qatorlar: kalitlar.length },
          })
          .catch((e: unknown) => log.warn({ err: e, conversationId }, 'Xato yozuvi yozilmadi'));
        continue;
      }

      if (!result.sent) {
        await this.eslatmalar.holatniOzgartir(kalitlar, 'skipped', 'yuborilmadi').catch((e: unknown) =>
          log.warn({ err: e, conversationId }, 'Yozuv holati yangilanmadi'));
        continue;
      }

      sent += 1;
      // Eslatma yangi sukut zanjirini boshlaydi. `unreachable` suhbatni
      // `findSilent` chetlab o'tadi — shuning uchun `contacted` ga o'tadi.
      //
      // Xabar ALLAQACHON Telegramga ketdi — pastdagi qadamlardagi xato
      // `oylik_eslatmalar` qatorini O'ZGARTIRMASLIGI kerak. Aks holda
      // muvaffaqiyatli yuborilgan "sent" yozuvi "agent_xato" bilan
      // almashtirilib, kunlik hisoblagichni kam sanardi va (nazariy
      // jihatdan) mijozga eslatma yana bir marta ketishi mumkin bo'lardi.
      try {
        await this.conversations.resetNudgeCount(conversationId);
        const keyin = await this.conversations.findById(conversationId);
        if (keyin?.state === 'unreachable') {
          await this.conversations.update(conversationId, { state: 'contacted' });
        }
      } catch (err) {
        log.warn({ err, conversationId }, 'Oylik eslatmadan keyingi holat yangilanmadi');
      }
    }

    if (processed) log.info({ processed, sent }, 'Oylik eslatma yuborildi');
    return sent;
  }

  private faolmi(c: Conversation): boolean {
    const oxirgi = Math.max(c.lastInboundAt?.getTime() ?? 0, c.lastOutboundAt?.getTime() ?? 0);
    return this.clock.now().getTime() - oxirgi < FAOL_SUHBAT_MS;
  }

  /**
   * Mijozning barcha "Сотилди" shartnomalari jadvali — yangilangan holda.
   *
   * `maxAgeMinutes: 0` — HAR DOIM yangilanadi, `CONTRACTS_FRESH_MINUTES`
   * (30 daqiqa) bu yerda ishlatilmaydi: eslatma "to'lanmadi" deb aynan
   * shu 30 daqiqalik oynada to'lagan mijozga ketishi mumkin edi —
   * `buildContext` keyinroq qayta sinxronlaydi, lekin `malumot` (matnga
   * chiqadigan summa) o'sha eski holatdan hisoblab bo'lingan bo'lardi.
   *
   * `outcome === 'error'` — CRM javob bermadi, bazadagi qiymat ESKI
   * bo'lishi mumkin: shu shartnoma bilan davom etmaymiz, chaqiruvchi
   * (`run`) buni ushlab, suhbatni butunlay o'tkazib yuboradi — keyingi
   * tsiklda qayta urinadi. `not_found` BLOKLAMAYDI: shartnoma CRM'dan
   * o'chirilgan bo'lishi mumkin, bizdagi grafik bilan davom etamiz.
   */
  private async jadval(clientId: string, raqamlar: Map<string, string>): Promise<JadvalQatori[]> {
    const shartnomalar = faqatYoziladiganlar(await this.contracts.findByClientId(clientId));
    const qatorlar: JadvalQatori[] = [];
    for (const c of shartnomalar) {
      const result = await this.contractSync.syncIfStale(c.id, 0);
      if (result?.outcome === 'error') {
        throw new Error(`Shartnoma sinxronizatsiyasi muvaffaqiyatsiz: ${c.id}`);
      }
      raqamlar.set(c.id, c.contractNo);
      for (const r of await this.payments.listSchedule(c.id)) {
        qatorlar.push({
          contractId: c.id,
          datePayment: String(r.dateIso).slice(0, 10),
          amount: r.amount,
          amountPaid: r.paid,
          status: r.status,
          type: r.type,
        });
      }
    }
    return qatorlar;
  }
}
