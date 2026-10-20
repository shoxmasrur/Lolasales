import { randomUUID } from 'node:crypto';
import type { InstructAgentUseCase } from '@/application/usecases/messaging/InstructAgentUseCase';
import type { RuntimeSettings } from '@/application/services/RuntimeSettings';
import type { IClock, IEventBus } from '@/domain/services/support';
import { HAMMASI, type MijozQamrovi } from '@/domain/entities/MijozQamrovi';
import type { ITalabnomaSukuti } from '@/domain/services/ITalabnomaSukuti';
import type { IRecontactRepository } from '@/domain/repositories/IRecontactRepository';
import type { IConversationRepository } from '@/domain/repositories/IConversationRepository';
import type { IClientRepository } from '@/domain/repositories/IClientRepository';
import type { IHolidayRepository } from '@/domain/repositories/IHolidayRepository';
import type { BulkJobRow } from '@/domain/repositories/IBulkJobRepository';
import type { BulkJobStore } from '@/application/services/BulkJobStore';
import type { ResumableJob } from '@/application/services/BulkJobResumer';
import { evaluateWindow } from '@/domain/policies/SendWindowPolicy';
import {
  AbortedError,
  ConflictError,
  CrmUnavailableError,
  NotFoundError,
  StaleTurnError,
  ValidationError,
} from '@/shared/errors';
import { randomBetween, sleep } from '@/shared/datetime';
import { config } from '@/shared/config';
import { childLogger } from '@/shared/logger';

const log = childLogger('qayta-aloqa-navbat');

export type RecontactOutcome = 'sent' | 'skipped' | 'failed';
export type RecontactJobStatus = 'running' | 'done' | 'stopped';

export interface RecontactJobResult {
  readonly conversationId: string;
  readonly clientName: string;
  readonly outcome: RecontactOutcome;
  readonly reason?: string;
}

/**
 * Ommaviy qayta aloqa ishi (spec 2026-09-16, 3-bo'lim).
 *
 * `stopReason` — spec shaklidan TASHQARI qo'shimcha maydon: ish
 * operatordan boshqa sabab bilan to'xtaganda (KILL_SWITCH, kutilmagan
 * xato) operator nega to'xtaganini ko'rishi kerak. Operator o'zi
 * to'xtatganda `null`.
 */
export interface RecontactJob {
  readonly id: string;
  readonly status: RecontactJobStatus;
  readonly total: number;
  readonly sent: number;
  readonly skipped: number;
  readonly failed: number;
  /** Hozir ishlanayotgan suhbat. */
  readonly current: string | null;
  readonly results: RecontactJobResult[];
  readonly startedAt: string;
  readonly finishedAt: string | null;
  /** Boshlagan operatorning email'i. */
  readonly startedBy: string;
  readonly stopReason: string | null;
  /** Server qayta ishga tushgach (deploy) vazifa necha marta davom ettirilgan. */
  readonly resumedCount?: number;
  /** Obyekt cheklovi: boshlagan foydalanuvchi — boshqasiga navbat ismsiz ko'rinadi. */
  readonly boshlaganUserId?: string;
}

export interface BulkRecontactInput {
  readonly conversationIds: string[];
  readonly instruction: string;
  readonly userId: string;
  readonly userEmail: string;
  /**
   * Obyekt cheklovi: boshlagan foydalanuvchining qamrovi (faqat cheklangan
   * bo'lsa beriladi). Har suhbat yuborishdan oldin shu qamrovda qayta
   * tekshiriladi; tiklashda kirish bilan birga saqlanadi.
   */
  readonly qamrov?: MijozQamrovi;
}

/** Buzuq qamrov o'rniga: cheklangan, obyektsiz — hech bir suhbat mos kelmaydi. */
const HECH_NARSA: MijozQamrovi = Object.freeze({ cheklangan: true, obyektlar: Object.freeze([]) as readonly string[] });

/** Saqlangan kirishdagi qamrov: yo'q — cheklovsiz (eski navbat); buzuq — `null` (rad etiladi). */
function saqlanganQamrov(v: unknown): MijozQamrovi | null {
  if (v === undefined) return HAMMASI;
  if (!v || typeof v !== 'object') return null;
  const { cheklangan, obyektlar } = v as Partial<MijozQamrovi>;
  if (typeof cheklangan !== 'boolean' || !Array.isArray(obyektlar) || !obyektlar.every((o) => typeof o === 'string')) {
    return null;
  }
  return { cheklangan, obyektlar };
}

/**
 * Vaqt bilan bog'liq bog'liqliklar — sinovda soxtasi beriladi, aks holda
 * test haqiqiy daqiqalarni kutardi.
 */
export interface BulkRecontactTiming {
  readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
  /** [min, max] oraliqdan tasodifiy son. */
  readonly random: (min: number, max: number) => number;
  /**
   * Ish oynasi tashqarisida qayta tekshirish oralig'ining yuqori chegarasi.
   *
   * `retryAfterMs` ga to'liq ishonmaymiz: operator sozlamada oynani
   * o'zgartirsa yoki bayramni o'chirsa, navbat soatlab eski hisob bilan
   * uxlab qolardi.
   */
  readonly windowPollMs: number;
}

const STANDART_VAQT: BulkRecontactTiming = {
  sleep,
  random: randomBetween,
  windowPollMs: 5 * 60 * 1000,
};

const NOMALUM = 'Noma\'lum';

/**
 * Saqlangan snapshot'dan hisoblagichlar va boshlagan operator — yetishmasa
 * sukut qiymat. `resume` va `abandon` bir xil ishlatadi: aks holda yetishmagan
 * `sent` `addResult` da NaN bo'lib panelni buzardi.
 */
function snapshotDefaults(s: Partial<RecontactJob>): Pick<RecontactJob, 'sent' | 'skipped' | 'failed' | 'startedBy'> {
  const son = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  return {
    sent: son(s.sent),
    skipped: son(s.skipped),
    failed: son(s.failed),
    startedBy: typeof s.startedBy === 'string' ? s.startedBy : NOMALUM,
  };
}

/**
 * Qayta aloqa ro'yxatidan tanlangan suhbatlarga agent orqali ketma-ket
 * yozadi (spec 2.4).
 *
 * `BulkConversationStart` dan FARQI: bu yerda suhbat allaqachon boshlangan,
 * akkaunt tanlash va taqsimot yo'q — har suhbat o'z akkauntidan davom
 * etadi. Shuning uchun bitta oqim.
 *
 * Himoya (kampaniya bilan bir xil):
 *   • bir vaqtda bitta ish;
 *   • KILL_SWITCH yoqilsa ish to'xtaydi;
 *   • ish vaqti oynasi, ish kunlari, bayramlar — oyna tashqarisida navbat
 *     KUTADI, o'tkazib yubormaydi: operator kechqurun tanlagan ro'yxat
 *     ertalab o'zi davom etishi kerak, "hammasi o'tkazib yuborildi" bilan
 *     tugamasligi kerak;
 *   • xabarlar orasida `minDelaySec`–`maxDelaySec` tasodifiy pauza.
 *
 * YUBORISHDAN DARHOL OLDIN suhbat ro'yxat shartlariga qayta solishtiriladi:
 * operator tanlagan payt bilan navbat yetib kelgan payt orasida soatlar
 * o'tishi mumkin — mijoz shu orada yozgan, to'lagan yoki va'da bergan
 * bo'lsa unga "qayta aloqa" xabari ketishi ta'qibdek tuyuladi.
 */
export class BulkRecontact implements ResumableJob {
  readonly kind = 'recontact' as const;
  /**
   * Kunga bog'lanmaydi: navbat ish vaqti oynasini o'zi kutadi va kechqurun
   * tanlangan ro'yxat ertalab davom etishi kerak.
   */
  readonly sameDayOnly = false;
  private job: RecontactJob | null = null;
  private cancelled = false;
  /** Har ish uchun YANGISI — bekor qilingan signal keyingi ishning pauzalarini yeb qo'ymasin. */
  private stopSignal: AbortController | null = null;
  /** Ketayotgan ish — `stop()` (graceful shutdown) shuni kutadi. */
  private inflight: Promise<void> | null = null;
  /**
   * Tiklashdan keyin birinchi qolgan suhbat. Navbat ketma-ket, shuning
   * uchun deploy paytida agent yozayotgan bo'lishi mumkin bo'lgan yagona
   * suhbat shu: `findOne` uni "yozgan" deb chiqarsa, sababi bizning o'zimiz
   * yozgan bo'lishimiz mumkin.
   */
  private tiklanganBirinchi: string | null = null;

  constructor(
    private readonly instructAgent: InstructAgentUseCase,
    private readonly recontactList: IRecontactRepository,
    private readonly settings: RuntimeSettings,
    private readonly holidays: IHolidayRepository,
    private readonly events: IEventBus,
    private readonly clock: IClock,
    /** Ro'yxatdan chiqib ketgan suhbat uchun natijada mijoz ismini ko'rsatish. */
    private readonly conversations: IConversationRepository,
    private readonly clients: IClientRepository,
    /**
     * Talabnoma muddati ichida bu mijoz o'tkaziladi. Operator ommaviy buyrug'i
     * bo'lsa ham bu proaktiv xabar — mijoz hech narsa yozmagan.
     */
    private readonly talabnomaSukuti: ITalabnomaSukuti,
    private readonly timing: BulkRecontactTiming = STANDART_VAQT,
    /** `null` — holat saqlanmaydi (testlar). */
    private readonly store: BulkJobStore | null = null,
  ) {}

  current(): RecontactJob | null {
    return this.job;
  }

  isRunning(): boolean {
    return this.job?.status === 'running';
  }

  /**
   * Operator "To'xtatish"ni bosdi — YAKUNIY. Tsikl tugashini kutadi.
   *
   * Niyat bazaga DARHOL yoziladi: agent chaqiruvi uzilmaydi va tsikl
   * bayroqni faqat u tugagach o'qiydi; shu oraliqda deploy kelsa
   * tsikldagi "to'xtatildi" yozuvi tashlanardi va operator to'xtatgan
   * navbat server ko'tarilgach davom etib ketardi.
   *
   * HTTP yo'li natijani kutmaydi (`void`).
   */
  async stop(): Promise<void> {
    if (this.isRunning() && this.job) {
      void this.store?.finish(
        this.job.id,
        'stopped',
        { ...this.job, status: 'stopped', stopReason: null, current: null, finishedAt: this.clock.now().toISOString() },
        { yakuniy: true },
      );
      this.toxtat();
    }
    await this.inflight;
  }

  /** Deploy to'xtatishi: bazada `running` qoladi va navbat tiklanadi. */
  pauseForShutdown(): void {
    if (this.isRunning()) this.toxtat();
  }

  /** Ketayotgan ish tugaguncha kutadi; ish yo'q bo'lsa darhol qaytadi. */
  idle(): Promise<void> {
    return this.inflight ?? Promise.resolve();
  }

  /**
   * Pauza va oyna kutishi signal bilan DARHOL uziladi. Agent chaqiruvi esa
   * uzilmaydi (`InstructAgentUseCase` signal qabul qilmaydi) — yarim yo'lda
   * uzilgan navbat chatda "topshiriq" qaydini qoldirib, mijozga hech narsa
   * yubormagan bo'lardi.
   */
  private toxtat(): void {
    this.cancelled = true;
    this.stopSignal?.abort();
  }

  /**
   * Bazaga yozuv BIRINCHI: shu turda tiklanishni kutayotgan navbat bo'lsa
   * (`ConflictError`), hech kimga yozilmaydi.
   */
  async start(input: BulkRecontactInput): Promise<RecontactJob> {
    if (this.isRunning()) {
      throw new ConflictError('Qayta aloqa yuborish allaqachon ketyapti — tugashini kuting');
    }

    // Takrorlangan id bitta mijozga ikki marta yozishga olib kelardi.
    const ids = [...new Set(input.conversationIds)];
    const job: RecontactJob = {
      id: randomUUID(),
      status: 'running',
      total: ids.length,
      sent: 0,
      skipped: 0,
      failed: 0,
      current: null,
      results: [],
      startedAt: this.clock.now().toISOString(),
      finishedAt: null,
      startedBy: input.userEmail,
      stopReason: null,
      boshlaganUserId: input.userId,
    };
    if (this.store) {
      const saqlanadigan: BulkRecontactInput = { ...input, conversationIds: ids };
      await this.store.begin('recontact', job.id, saqlanadigan, job);
      // `await` oralig'ida boshqa so'rov boshlab yuborgan bo'lishi mumkin.
      if (this.isRunning()) {
        throw new ConflictError('Qayta aloqa yuborish allaqachon ketyapti — tugashini kuting');
      }
    }

    this.cancelled = false;
    this.tiklanganBirinchi = null;
    this.stopSignal = new AbortController();
    this.job = job;
    this.publish();
    this.launch(ids, input, false);
    return this.job;
  }

  /**
   * Server qayta ishga tushgach saqlangan holatdan davom etadi: natijalar
   * va hisoblagichlar `snapshot` dan, ro'yxat — qayta ishlanmaganlardan.
   */
  resume(row: BulkJobRow): void {
    const input = row.input as Partial<BulkRecontactInput> | null;
    const saved = row.snapshot as Partial<RecontactJob> | null;
    if (
      !input || !Array.isArray(input.conversationIds) || typeof input.instruction !== 'string' ||
      typeof input.userId !== 'string' || typeof input.userEmail !== 'string' ||
      !saved || typeof saved !== 'object' || typeof saved.total !== 'number' || !Array.isArray(saved.results)
    ) {
      throw new Error('Saqlangan qayta aloqa vazifasining shakli noto\'g\'ri');
    }
    // Buzuq qamrov cheklovsiz deb olinmaydi — yopiq holatda yiqiladi.
    if (saqlanganQamrov(input.qamrov) === null) {
      throw new Error('Saqlangan qayta aloqa vazifasining qamrovi noto\'g\'ri');
    }

    const ishlangan = new Set(row.processedIds);
    const qolgan = input.conversationIds.filter((id) => !ishlangan.has(id));

    this.cancelled = false;
    this.tiklanganBirinchi = qolgan[0] ?? null;
    this.stopSignal = new AbortController();
    this.job = {
      ...(saved as RecontactJob),
      ...snapshotDefaults(saved),
      id: row.id,
      status: 'running',
      current: null,
      finishedAt: null,
      stopReason: null,
      resumedCount: row.resumedCount + 1,
      boshlaganUserId: input.userId,
    };
    this.publish();
    log.info({ jami: input.conversationIds.length, qolgan: qolgan.length }, 'Qayta aloqa navbati davom ettirildi');
    // Birinchi xabar oldidan ham pauza: har deploy navbatdan tashqari xabar
    // chiqarsa, tez-tez deploy spam filtriga signal bo'lardi.
    this.launch(qolgan, input as BulkRecontactInput, true);
  }

  /**
   * Davom ettirilmaydigan navbatni yopadi — panel sababni ko'rsin.
   *
   * `RecontactJob` da `failed` holati yo'q: xotirada `stopped` + sabab;
   * bazaga `failed` ni resumer o'zi yozadi.
   */
  abandon(row: BulkJobRow, _status: 'stopped' | 'failed', reason: string): RecontactJob {
    const s =
      row.snapshot && typeof row.snapshot === 'object' && !Array.isArray(row.snapshot)
        ? (row.snapshot as Partial<RecontactJob>)
        : {};
    const son = (v: unknown): number => (typeof v === 'number' ? v : 0);
    const defaults = snapshotDefaults(s);
    const hozir = this.clock.now().toISOString();
    this.job = {
      id: row.id,
      status: 'stopped',
      total: son(s.total),
      sent: defaults.sent,
      skipped: defaults.skipped,
      failed: defaults.failed,
      current: null,
      results: Array.isArray(s.results) ? s.results : [],
      startedAt: typeof s.startedAt === 'string' ? s.startedAt : hozir,
      finishedAt: hozir,
      startedBy: defaults.startedBy,
      stopReason: reason,
      ...this.abandonEgasi(s, row.input),
      // `resumedCount` ATAYLAB yo'q: "davom etdi" qaydi yopilish sababi
      // bilan birga chiqmasin.
    };
    this.publish();
    return this.job;
  }

  /** Yopilgan navbat egasi: snapshot'dan, bo'lmasa kirishdan; topilmasa kalit yo'q (begona hisoblanadi). */
  private abandonEgasi(s: Partial<RecontactJob>, input: unknown): { boshlaganUserId?: string } {
    if (typeof s.boshlaganUserId === 'string') return { boshlaganUserId: s.boshlaganUserId };
    const userId = (input as Partial<BulkRecontactInput> | null)?.userId;
    return typeof userId === 'string' ? { boshlaganUserId: userId } : {};
  }

  /** Ishni fonda yurgizadi; ushlanmagan xato yozuvni abadiy "running" qoldirmasin. */
  private launch(ids: string[], input: BulkRecontactInput, pauseFirst: boolean): void {
    const jobId = this.job?.id;
    const ish = this.run(ids, input, pauseFirst)
      .catch((err: unknown) => {
        log.error({ err, jobId }, 'Qayta aloqa navbatida kutilmagan xato');
        if (this.job?.id === jobId && this.job?.status === 'running') {
          this.finish('stopped', 'Kutilmagan xato — yuborish to\'xtatildi, qaytadan urinib ko\'ring');
        }
      })
      .finally(() => {
        if (this.inflight === ish) this.inflight = null;
      });
    this.inflight = ish;
  }

  /**
   * Holatni bazaga yozadi. `processedId` — shu qadamda tugagan suhbat:
   * tiklanishda u tashlab ketiladi. Pauzadan OLDIN kutiladi. Rad etmaydi.
   */
  private saqla(processedId: string | null = null): Promise<void> {
    if (!this.store || !this.job || this.job.status !== 'running') return Promise.resolve();
    return this.store.save(this.job.id, this.job, processedId);
  }

  private publish(): void {
    if (!this.job) return;
    this.events.publish({ type: 'recontact.bulk_progress', job: this.job });
  }

  private patch(changes: Partial<RecontactJob>): void {
    if (!this.job) return;
    this.job = { ...this.job, ...changes };
    this.publish();
  }

  /**
   * Natijani qo'shadi va hisoblagichni oshiradi — `await` siz bitta qadamda,
   * aks holda o'qish va yozish orasida holat eskirardi.
   */
  private addResult(result: RecontactJobResult): void {
    if (!this.job) return;
    this.job = {
      ...this.job,
      current: null,
      results: [...this.job.results, result],
      sent: this.job.sent + (result.outcome === 'sent' ? 1 : 0),
      skipped: this.job.skipped + (result.outcome === 'skipped' ? 1 : 0),
      failed: this.job.failed + (result.outcome === 'failed' ? 1 : 0),
    };
    this.publish();
  }

  private finish(status: RecontactJobStatus, stopReason: string | null = null): void {
    this.patch({
      status,
      stopReason,
      current: null,
      finishedAt: this.clock.now().toISOString(),
    });
    // Yakuniy EMAS: deploy paytidagi "to'xtatildi" tashlanadi va navbat
    // tiklanadi. Operator to'xtatishi `stop()` da alohida yoziladi.
    if (this.job) void this.store?.finish(this.job.id, status, this.job);
  }

  /** Ro'yxatdan chiqib ketgan suhbat uchun ism — xato bo'lsa sababni yashirmaydi. */
  private async ismi(conversationId: string): Promise<string> {
    try {
      const conversation = await this.conversations.findById(conversationId);
      if (!conversation) return NOMALUM;
      const client = await this.clients.findById(conversation.clientId);
      return client?.fullName ?? NOMALUM;
    } catch {
      return NOMALUM;
    }
  }

  /**
   * Yuborishga ruxsat bo'lguncha kutadi.
   *
   * `true` — yuborish mumkin; `false` — ish to'xtashi kerak (operator
   * to'xtatdi yoki KILL_SWITCH). Har uyg'onishda sozlamalar QAYTA o'qiladi:
   * kechasi yoqilgan KILL_SWITCH ertalab navbatni yurgizib yubormasligi
   * kerak.
   */
  private async ruxsatniKut(): Promise<boolean> {
    let oxirgiSabab: string | null = null;
    for (;;) {
      if (this.cancelled) return false;

      const runtime = await this.settings.get();
      if (runtime.killSwitch) {
        this.finish('stopped', 'KILL_SWITCH yoqilgan — yuborish to\'xtatildi');
        this.cancelled = true;
        return false;
      }

      const window = evaluateWindow(this.clock.now(), {
        start: runtime.windowStart,
        end: runtime.windowEnd,
        weekdays: runtime.weekdays,
        timeZone: config.TIMEZONE,
        holidays: await this.holidays.list(),
      });
      if (window.allowed) return true;

      // Har 5 daqiqada bir xil qator jurnalni to'ldirmasin.
      if (window.reason !== oxirgiSabab) {
        log.info({ jobId: this.job?.id, reason: window.reason }, 'Ish vaqti emas — navbat kutyapti');
        oxirgiSabab = window.reason ?? null;
      }

      const kutish = Math.max(
        1,
        Math.min(window.retryAfterMs ?? this.timing.windowPollMs, this.timing.windowPollMs),
      );
      await this.timing.sleep(kutish, this.stopSignal?.signal);
    }
  }

  private async run(ids: string[], input: BulkRecontactInput, pauseFirst: boolean): Promise<void> {
    log.info({ total: ids.length, by: input.userEmail }, 'Qayta aloqa navbati boshlandi');

    if (pauseFirst && ids.length > 0 && !this.cancelled) {
      const runtime = await this.settings.get();
      const ms = Math.round(this.timing.random(runtime.minDelaySec, runtime.maxDelaySec) * 1000);
      if (ms > 0) await this.timing.sleep(ms, this.stopSignal?.signal);
    }

    for (let i = 0; i < ids.length; i += 1) {
      if (!(await this.ruxsatniKut())) break;

      const conversationId = ids[i]!;
      this.patch({ current: conversationId });

      // Qoidalar HAR suhbat oldidan o'qiladi: `minDebt` yoki urinishlar
      // soni ish davomida o'zgarsa, eski qiymat bo'yicha yozib yubormaylik.
      const runtime = await this.settings.get();
      const natija = await this.bittasi(conversationId, input, {
        minDebt: runtime.minDebt,
        silenceNudgeMax: runtime.silenceNudgeMax,
        timeZone: config.TIMEZONE,
      });
      // `null` — agent chaqirilmadi (Stop/deploy `findOne` paytida keldi).
      // Natija ham, processedId ham YOZILMAYDI: deploy bo'lsa tiklashda
      // shu suhbat qayta tekshiriladi, operator to'xtatgan bo'lsa shunchaki
      // tugaydi.
      if (natija === null) break;
      this.addResult(natija);
      // Pauzadan OLDIN bazada bo'lsin: avariyada "yozildi, lekin
      // saqlanmadi" oynasi butun pauzaga cho'zilmasin.
      await this.saqla(conversationId);

      // Pauza FAQAT xabar haqiqatan ketgandan keyin: o'tkazib yuborilganda
      // Telegramga hech narsa ketmagan, kutish esa navbatni behuda cho'zadi.
      if (natija.outcome === 'sent' && i < ids.length - 1 && !this.cancelled) {
        const ms = Math.round(this.timing.random(runtime.minDelaySec, runtime.maxDelaySec) * 1000);
        if (ms > 0) await this.timing.sleep(ms, this.stopSignal?.signal);
      }
    }

    if (this.job?.status !== 'running') return; // KILL_SWITCH allaqachon yopgan
    this.finish(this.cancelled ? 'stopped' : 'done');
    log.info(
      { sent: this.job?.sent, skipped: this.job?.skipped, failed: this.job?.failed, status: this.job?.status },
      'Qayta aloqa navbati tugadi',
    );
  }

  /** Bitta suhbat: qayta tekshirish → agent topshirig'i → natija. */
  private async bittasi(
    conversationId: string,
    input: BulkRecontactInput,
    qoidalar: { minDebt: number; silenceNudgeMax: number; timeZone: string },
  ): Promise<RecontactJobResult | null> {
    let clientName = NOMALUM;
    try {
      // Qamrov tashqarisiga chiqqan suhbat (shartnoma boshqa obyektga
      // o'tgan) ro'yxatdan chiqqan suhbatdek o'tkaziladi.
      const item = await this.recontactList.findOne(conversationId, qoidalar, saqlanganQamrov(input.qamrov) ?? HECH_NARSA);
      if (!item) {
        return {
          conversationId,
          clientName: await this.ismi(conversationId),
          outcome: 'skipped',
          // Tiklashdagi birinchi suhbatni deploy oldidan o'zimiz yozgan
          // bo'lishimiz mumkin — "mijoz yozgan" deb da'vo qilmaymiz.
          reason: conversationId === this.tiklanganBirinchi
            ? 'Ro\'yxat shartlariga mos kelmaydi — server yangilanishi paytida yozilgan bo\'lishi mumkin'
            : 'Ro\'yxat shartlariga endi mos kelmaydi (mijoz yozgan, to\'lagan yoki va\'da bergan)',
        };
      }
      clientName = item.clientName;

      if (await this.talabnomaSukuti.sukutdami(item.clientId, this.clock.todayIso())) {
        log.debug({ conversationId }, 'Qayta aloqa o\'tkazildi — talabnoma muddati');
        return { conversationId, clientName, outcome: 'skipped', reason: 'Talabnoma muddati tugamagan' };
      }

      // `findOne` kutilayotganda Stop/deploy kelgan bo'lishi mumkin: agent
      // chaqiruvi uzilmaydi, shuning uchun bayroqni aynan yuborishdan oldin
      // qayta tekshiramiz — aks holda to'xtatilgan navbat yana bitta xabar yozardi.
      if (this.cancelled) return null;

      const result = await this.instructAgent.execute({
        conversationId,
        instruction: input.instruction,
        userId: input.userId,
        userEmail: input.userEmail,
      });

      if (result.sent) return { conversationId, clientName, outcome: 'sent' };
      // Qo'lda tasdiqlash rejimida qoralama bo'ldi yoki model yozmaslikka
      // qaror qildi — mijozga hech narsa ketmadi.
      return {
        conversationId,
        clientName,
        outcome: 'skipped',
        reason: result.escalated
          ? 'Agent suhbatni operatorga chiqardi — xabar yuborilmadi'
          : 'Agent xabar yubormadi (qoralama yoki yozmaslikka qaror qildi)',
      };
    } catch (err) {
      // Tartib muhim: `StaleTurnError` `AbortedError` dan meros oladi.
      if (err instanceof StaleTurnError) {
        return { conversationId, clientName, outcome: 'skipped', reason: 'Mijoz shu payt yozdi — javobni agent beradi' };
      }
      if (err instanceof CrmUnavailableError) {
        log.warn({ conversationId }, 'CRM javob bermadi — suhbat o\'tkazib yuborildi');
        return { conversationId, clientName, outcome: 'skipped', reason: 'CRM javob bermadi — summa tasdiqlanmadi' };
      }
      if (err instanceof AbortedError) {
        return { conversationId, clientName, outcome: 'skipped', reason: 'Agent navbati to\'xtatildi' };
      }
      if (err instanceof ValidationError || err instanceof ConflictError || err instanceof NotFoundError) {
        return { conversationId, clientName, outcome: 'skipped', reason: err.message };
      }
      log.error({ conversationId, err }, 'Qayta aloqa xabarini yuborishda xato');
      return { conversationId, clientName, outcome: 'failed', reason: 'Agent xatosi — suhbatni tekshiring' };
    }
  }
}
