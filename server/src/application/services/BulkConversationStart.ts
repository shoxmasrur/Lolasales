import type { StartConversationUseCase } from '@/application/usecases/messaging/StartConversationUseCase';
import type { RuntimeSettings } from '@/application/services/RuntimeSettings';
import type { IEventBus, IClock } from '@/domain/services/support';
import type { BulkStartPlanner } from '@/application/services/BulkStartPlanner';
import type { IClientRepository } from '@/domain/repositories/IClientRepository';
import type { ITelegramAccountRepository } from '@/domain/repositories/ITelegramAccountRepository';
import { canSend, personaNameOf } from '@/domain/entities/TelegramAccount';
import { groupByAccount, type AccountGroup } from '@/application/services/bulkGroups';
import { evaluateWindow } from '@/domain/policies/SendWindowPolicy';
import { meanDelayMs, nextDelayMs, spreadMeanMs } from '@/domain/policies/PacingPolicy';
import { AbortedError, TelegramError } from '@/shared/errors';
import { sleep } from '@/shared/datetime';
import { config } from '@/shared/config';
import { childLogger } from '@/shared/logger';
import { kontekst } from '@/shared/logContext';
import type { AccountLabels } from '@/application/services/AccountLabels';
import type { BulkJobStore } from '@/application/services/BulkJobStore';
import type { BulkJobRow } from '@/domain/repositories/IBulkJobRepository';
import type { ResumableJob } from '@/application/services/BulkJobResumer';
import {
  akkauntQatoriniYangila,
  boshIsh,
  bumpJob,
  jamiSurat,
  SKIP_DETAILS_LIMIT,
  type BulkStartAccountProgress,
  type BulkStartJob,
  type BulkStartStatus,
  type JobDelta,
  type SkippedClient,
} from '@/application/services/bulkJobProgress';

// Mavjud sinovlar va `clientRoutes` shu fayldan import qiladi — qayta
// eksport qilmasak ular buziladi.
export {
  SKIP_DETAILS_LIMIT,
  type BulkStartAccountProgress,
  type BulkStartJob,
  type BulkStartStatus,
  type SkippedClient,
};

const log = childLogger('bulk-start');

/**
 * Operator `perAccount` bilan "bugun faqat shuncha" deb chegaralagani
 * uchun bugungi taqsimotga tushmagan mijozning sababi.
 *
 * Operator progressda AYNAN shu mijozlarni ko'radi va ularni ertangi
 * ishga qoldiradi — shuning uchun sabab boshqa o'tkazib yuborishlardan
 * ajralib turishi kerak.
 */
const CHEGARADAN_TASHQARI = 'Bugungi taqsimotga kirmadi — operator qo\'lda chegaralagan';

/** Bitta akkaunt oqimi va uning sur'ati. */
interface Oqim {
  readonly guruh: AccountGroup;
  readonly mean: number | null;
  readonly dailySends: number;
  /**
   * Faqat tiklangan oqim: birinchi xabardan oldingi pauza (ms). Har
   * deploy har akkauntdan navbatdan tashqari xabar chiqarmasin.
   */
  readonly birinchiPauzaMs?: number;
}

export interface BulkStartOptions {
  readonly allowNameMismatch?: boolean;
  readonly actor?: string;
  /** Vazifani boshlagan foydalanuvchi (`users.id`) — obyekt cheklovi uchun. */
  readonly boshlaganUserId?: string;
  /** Operator tanlagan Telegram akkauntlari — mijozlar shular orasida taqsimlanadi. */
  readonly accountIds?: string[];
  /**
   * Operator qo'lda kiritgan taqsimot (accountId → nechta mijoz).
   *
   * Berilsa avtomatik taqsimot ishlatilmaydi. Yig'indi tanlangan
   * mijozlar sonidan kam bo'lsa, ortiqchasi biriktirilmaydi va MAJBURAN
   * o'tkazib yuboriladi — operator "bugun faqat shuncha" deb chegaralay
   * olishi uchun.
   *
   * `noAutoAssign` ga tayanib bo'lmaydi: u faqat akkaunti YO'Q mijozni
   * to'xtatadi, oldingi ishdan akkaunt saqlanib qolgani esa o'tib ketib
   * xabar yuborardi.
   */
  readonly perAccount?: Readonly<Record<string, number>>;
  /**
   * Taqsimot shu soatgacha cho'ziladi (HH:mm).
   *
   * Berilmasa eski mantiq: sur'at akkauntlarning kunlik limitlaridan
   * chiqadi va tanlangan mijozlar sonidan bexabar bo'ladi.
   *
   * YUMSHOQ mo'ljal — qat'iy chegara emas. Oraliqlar tasodifiy bo'lgani
   * uchun ish bu soatdan ±20-30 daqiqa farq bilan tugaydi va soat
   * kelganda to'xtamaydi; ish faqat `windowEnd` da to'xtaydi.
   */
  readonly spreadUntil?: string;
}

/** `bulk_jobs.input` dagi shakl. */
export interface BulkStartInput {
  readonly clientIds: string[];
  readonly options: BulkStartOptions;
}

/**
 * `bulk_jobs.plan` — taqsimot natijasi.
 *
 * Tiklashda taqsimot QAYTA QILINMAYDI: mijozlar allaqachon bazada
 * akkauntlarga biriktirilgan, qayta reja esa operator qo'lda bergan
 * sonlarni va "bugun faqat shuncha" chegarasini buzardi.
 */
export interface BulkStartPlan {
  readonly guruhlar: Array<{ accountId: string | null; clientIds: string[] }>;
  readonly chegaradanTashqari: string[];
}

/**
 * Bir nechta mijoz bilan suhbatni boshlaydi — har akkauntda ketma-ket.
 *
 * NEGA BU ENG XAVFLI AMAL: notanish odamga BIRINCHI xabar yuborish —
 * Telegramning spam filtri uchun asosiy signal. Bir zumda o'nlab xabar
 * ketsa akkaunt PEER_FLOOD ga tushadi va notanish odamlarga umuman yoza
 * olmay qoladi — bu bir necha kunga cho'ziladi va butun undirish
 * ishini to'xtatadi.
 *
 * Shuning uchun kampaniya rejalashtiruvchisi bilan BIR XIL himoya:
 *   • har akkauntda bittadan, ketma-ket — bitta akkauntdan hech qachon
 *     ikkita xabar bir vaqtda ketmaydi. Akkauntlar esa bir-birini
 *     kutmaydi: `PEER_FLOOD` ham, kunlik limit ham HAR AKKAUNTGA alohida
 *     hisoblanadi, ya'ni ularni bitta navbatda ushlab turishning himoya
 *     qiymati yo'q — u faqat ishni cho'zardi;
 *   • orasida TASODIFIY pauza (60-180 soniya) — bir xil oraliq robotlik
 *     belgisi va o'zi ham filtr uchun signal;
 *   • ish vaqti oynasidan tashqarida boshlanmaydi;
 *   • KILL_SWITCH yoqilgan bo'lsa umuman ishlamaydi;
 *   • PEER_FLOOD yoki FLOOD_WAIT kelsa o'sha akkauntning oqimi DARHOL
 *     to'xtaydi. Faqat o'shaniki: cheklov akkauntga beriladi, qolgan
 *     akkauntlar sog'lom va ularni to'xtatish operatorning kunini
 *     yo'qotardi. Hammasi cheklovga tushsagina butun ish yiqiladi.
 *
 * Akkauntning kunlik limiti va spam holati `StartConversationUseCase`
 * ichida tekshiriladi — limit tugasa mijoz "o'tkazib yuborildi" bo'ladi,
 * xabar ketmaydi.
 *
 * TEZLIK: 60-180 soniya oraliq bilan 100 ta mijoz ~2-5 soatda tugaydi.
 * Bu ataylab shunday — tezlashtirish akkauntni yo'qotish demakdir.
 */
export class BulkConversationStart implements ResumableJob {
  readonly kind = 'start' as const;
  /** Kunlik limit va taqsimot o'sha kunga hisoblangan — ertasiga davom ettirilmaydi. */
  readonly sameDayOnly = true;
  private job: BulkStartJob | null = null;
  private cancelled = false;
  /**
   * Mijozlar orasidagi pauzani uzish uchun.
   *
   * Har ish uchun YANGISI yaratiladi: bekor qilingan signal qayta
   * ishlatilsa keyingi ish barcha pauzalarni o'tkazib yuborardi va
   * xabarlar ketma-ket ketardi — aynan spam filtri kutgan naqsh.
   */
  private stopSignal: AbortController | null = null;
  private options: BulkStartOptions = {};
  /**
   * Bugungi taqsimotga tushmagan, lekin bog'lanish MUMKIN bo'lgan mijozlar.
   *
   * Ularga `startConversation.execute` umuman chaqirilmaydi. `noAutoAssign`
   * bu himoyani bera olmaydi: u faqat akkaunti YO'Q mijozni to'xtatadi,
   * oldingi ishdan `telegram_account_id` saqlanib qolgani esa o'tib ketib
   * xabar yuborardi — ya'ni akkaunt operator so'ragan sondan ko'p birinchi
   * murojaat qilib, `PEER_FLOOD` xavfiga yaqinlashardi.
   */
  private chegaradanTashqari: ReadonlySet<string> = new Set();
  /**
   * Umumiy to'xtash sababi (KILL_SWITCH, ish vaqti).
   *
   * Bitta oqim sezadi, lekin natija HAMMA oqimga tegishli. `finish` ni
   * o'sha yerda chaqirib bo'lmaydi: qolgan oqimlar hali tugamagan va ish
   * yozuvini yopilgan holatda yangilashda davom etardi.
   */
  private umumiyToxtash: { status: BulkStartStatus; error: string | null } | null = null;
  /** Ketayotgan ish — to'xtash (`main.ts`) shuni kutadi. */
  private inflight: Promise<void> | null = null;

  constructor(
    private readonly startConversation: StartConversationUseCase,
    private readonly settings: RuntimeSettings,
    private readonly events: IEventBus,
    private readonly clock: IClock,
    private readonly planner: BulkStartPlanner,
    private readonly clients: IClientRepository,
    private readonly accounts: ITelegramAccountRepository,
    /** Jurnalda akkaunt nomini ko'rsatish uchun. */
    private readonly accountLabels: AccountLabels,
    /** `null` — holat saqlanmaydi (testlar). */
    private readonly store: BulkJobStore | null = null,
  ) {}

  /**
   * O'tkazib yuborilgan mijozning ismi.
   *
   * FAQAT o'tkazib yuborilganda chaqiriladi, ya'ni qo'shimcha so'rov
   * muvaffaqiyatli yuborishlarga tegmaydi.
   */
  private async skipTafsiloti(clientId: string, reason: string): Promise<SkippedClient> {
    try {
      const client = await this.clients.findById(clientId);
      return { clientId, fullName: client?.fullName ?? 'Noma\'lum', reason };
    } catch {
      // Tafsilot ololmagani sababni yo'qotmasligi kerak.
      return { clientId, fullName: 'Noma\'lum', reason };
    }
  }

  /**
   * Yiqilgan mijoz uchun o'qiladigan jurnal konteksti.
   *
   * FAQAT xato yo'lida chaqiriladi: qo'shimcha so'rov muvaffaqiyatli
   * yuborishlarga tegmaydi, xato bo'lganda esa "qaysi mijoz, qaysi
   * akkaunt" savoliga javobsiz qator baribir yaroqsiz.
   */
  private async xatoKonteksti(clientId: string): Promise<Record<string, string>> {
    try {
      const client = await this.clients.findById(clientId);
      return kontekst({
        akkaunt: this.accountLabels.labelOf(client?.telegramAccountId),
        mijoz: client?.fullName,
      });
    } catch {
      // Jurnal uchun ma'lumot — uni ololmagani asosiy xatoni yashirmasin.
      return {};
    }
  }

  current(): BulkStartJob | null {
    return this.job;
  }

  isRunning(): boolean {
    return this.job?.status === 'running';
  }

  /**
   * Operator "To'xtatish"ni bosdi — YAKUNIY.
   *
   * Niyat bazaga DARHOL yoziladi: oqimlar bayroqni faqat keyingi mijozga
   * o'tishda o'qiydi; shu oraliqda deploy kelsa tsikldagi "to'xtatildi"
   * yozuvi tashlanardi va operator to'xtatgan xabarlar server ko'tarilgach
   * ketib qolardi.
   */
  stop(): void {
    if (!this.isRunning() || !this.job) return;
    void this.store?.finish(
      this.job.id,
      'stopped',
      { ...this.job, status: 'stopped', finishedAt: new Date().toISOString(), currentName: null, nextAt: null },
      { yakuniy: true },
    );
    this.toxtat();
  }

  /** Deploy to'xtatishi: bazada `running` qoladi va vazifa tiklanadi. */
  pauseForShutdown(): void {
    if (!this.isRunning()) return;
    this.toxtat();
  }

  /** Ketayotgan ish tugaguncha kutadi; ish yo'q bo'lsa darhol qaytadi. */
  idle(): Promise<void> {
    return this.inflight ?? Promise.resolve();
  }

  private toxtat(): void {
    this.cancelled = true;
    // Bayroqning o'zi yetmaydi: tsikl mijozlar orasidagi pauzada turadi,
    // u esa o'nlab daqiqagacha cho'zilishi mumkin. Pauzani uzmasak
    // operator "To'xtatish"ni bosgach ish yana yarim soat "ketyapti"
    // bo'lib turardi. Signal berilishi bilan kutish tugaydi va tsikl
    // boshidagi tekshiruv ishni yopadi.
    this.stopSignal?.abort();
  }

  /**
   * Bazaga yozuv BIRINCHI: shu turda tiklanishni kutayotgan vazifa bo'lsa
   * (`ConflictError`), hech narsa boshlanmaydi — mijozlar akkauntlarga
   * qayta biriktirilmaydi.
   */
  async start(clientIds: string[], jobId: string, options: BulkStartOptions = {}): Promise<BulkStartJob> {
    if (this.isRunning()) throw new Error('Suhbat boshlash allaqachon ketyapti');

    // Akkaunt qatorlari hozircha bo'sh: taqsimot `run()` ichida qilinadi
    // va u bir necha soniya olishi mumkin. Operator shu oraliqda ham
    // "ish boshlandi" degan yozuvni ko'rib turishi kerak — `run()` uni
    // oqimlar ma'lum bo'lgach qayta quradi.
    const job: BulkStartJob = {
      ...boshIsh(jobId, clientIds.length, options.allowNameMismatch === true, []),
      ...(options.boshlaganUserId ? { boshlaganUserId: options.boshlaganUserId } : {}),
    };
    if (this.store) {
      const input: BulkStartInput = { clientIds, options };
      await this.store.begin('start', jobId, input, job);
      // `await` oralig'ida boshqa so'rov boshlab yuborgan bo'lishi mumkin.
      if (this.isRunning()) throw new Error('Suhbat boshlash allaqachon ketyapti');
    }

    this.cancelled = false;
    this.umumiyToxtash = null;
    // Har ish o'z signali bilan boshlanadi — oldingi ish to'xtatilgan
    // bo'lsa uning bekor qilingan signali bu yerga o'tib qolmasin.
    this.stopSignal = new AbortController();
    this.options = options;
    this.job = job;

    if (options.allowNameMismatch) {
      log.warn(
        { total: clientIds.length, actor: options.actor },
        'Ism mos kelmaganlarga ham yuborish tasdiqlandi',
      );
    }

    this.launch(() => this.run(clientIds));
    return this.job;
  }

  /**
   * Server qayta ishga tushgach saqlangan holatdan davom etadi.
   *
   * Taqsimot QAYTA QILINMAYDI va mijozlar qayta biriktirilmaydi — oqimlar
   * `plan` dan olinadi, ulardan `processedIds` chiqariladi.
   */
  resume(row: BulkJobRow): void {
    const input = row.input as Partial<BulkStartInput> | null;
    const saved = row.snapshot as Partial<BulkStartJob> | null;
    if (
      !input || !Array.isArray(input.clientIds) ||
      !saved || typeof saved !== 'object' || typeof saved.total !== 'number' || !Array.isArray(saved.accounts)
    ) {
      throw new Error('Saqlangan suhbat boshlash vazifasining shakli noto\'g\'ri');
    }
    const reja = rejaniOqi(row.plan);
    if (row.plan !== null && !reja) throw new Error('Saqlangan taqsimotning shakli noto\'g\'ri');

    this.cancelled = false;
    this.umumiyToxtash = null;
    this.stopSignal = new AbortController();
    this.options = input.options ?? {};
    // Ish darajasidagi `nextAt` deploydan oldingi va'da — u allaqachon o'tib
    // ketgan bo'lishi mumkin, panel uni ko'rsatmasin. Qiymatning o'zi esa
    // qoldiq oqimi (akkaunt qatori yo'q) pauzasi uchun kerak, shuning uchun
    // tozalashdan OLDIN olinadi. Akkaunt qatorlarining `nextAt` i `davomEt`
    // da birinchi pauza hisoblangach yangilanadi.
    const oldingiNextAt = typeof saved.nextAt === 'string' ? saved.nextAt : null;
    this.job = {
      ...(saved as BulkStartJob),
      id: row.id,
      status: 'running',
      finishedAt: null,
      error: null,
      currentName: null,
      nextAt: null,
      resumedCount: row.resumedCount + 1,
    };
    this.events.publish({ type: 'conversation.bulk_progress', job: this.job });

    const ishlangan = new Set(row.processedIds);
    if (!reja) {
      // Taqsimot saqlanmagan. Odatda bu hali hech kimga yozilmagan degani,
      // lekin `savePlan` rad javobi bermaydi — u bazaga tushmay qolib, keyingi
      // yozuvlar tushgan bo'lishi mumkin. Shuning uchun ishlangan mijozlar
      // baribir chiqarib tashlanadi: ularga qayta borish takror xabar xavfi.
      const qolgan = input.clientIds.filter((id) => !ishlangan.has(id));
      log.info(
        { jami: input.clientIds.length, ishlangan: ishlangan.size, qolgan: qolgan.length },
        'Suhbat boshlash taqsimotdan qayta boshlandi',
      );
      if (qolgan.length) {
        this.launch(() => this.run(qolgan, true));
        return;
      }
      // Hamma ishlangan, faqat `done` yozilmay qolgan: hech kimga yozilmaydi.
      for (const a of this.job.accounts) {
        if (a.status === 'running' || a.status === 'waiting') {
          this.qatorniYangila(a.accountId, { status: 'done', nextAt: null });
        }
      }
      this.launch(() => this.oqimlarniYurgiz([]));
      return;
    }
    log.info(
      { jami: input.clientIds.length, ishlangan: ishlangan.size },
      'Ommaviy suhbat boshlash davom ettirildi',
    );
    this.launch(() => this.davomEt(reja, ishlangan, oldingiNextAt));
  }

  /** Davom ettirilmaydigan vazifani yopadi — panel sababni ko'rsin. */
  abandon(row: BulkJobRow, status: 'stopped' | 'failed', reason: string): BulkStartJob {
    const saved =
      row.snapshot && typeof row.snapshot === 'object' && !Array.isArray(row.snapshot)
        ? (row.snapshot as Partial<BulkStartJob>)
        : {};
    const asos = boshIsh(row.id, typeof saved.total === 'number' ? saved.total : 0, saved.allowNameMismatch === true, []);
    const hozir = new Date().toISOString();
    const { resumedCount: _eski, ...qolgani } = { ...asos, ...saved };
    void _eski;
    this.job = {
      ...qolgani,
      id: row.id,
      status,
      error: reason,
      finishedAt: hozir,
      currentName: null,
      nextAt: null,
      // `resumedCount` ATAYLAB yo'q: "davom etdi" qaydi "davom ettirilmadi"
      // sababi bilan birga chiqmasin.
      accounts: (Array.isArray(saved.accounts) ? saved.accounts : []).map((a) =>
        a.status === 'running' || a.status === 'waiting' ? { ...a, status: 'stopped' as const, nextAt: null } : a,
      ),
    };
    this.events.publish({ type: 'conversation.bulk_progress', job: this.job });
    return this.job;
  }

  /**
   * Saqlangan taqsimot bo'yicha qolgan mijozlar bilan oqimlarni qayta quradi.
   *
   * Sur'at QOLGAN mijozlar va qolgan vaqt bo'yicha qayta hisoblanadi —
   * "shu soatgacha cho'zish" mo'ljali o'z kuchida qoladi.
   */
  private async davomEt(
    reja: BulkStartPlan,
    ishlangan: ReadonlySet<string>,
    /** Deploydan oldingi ish darajasidagi `nextAt` — qoldiq oqimi pauzasi uchun. */
    oldingiNextAt: string | null,
  ): Promise<void> {
    this.chegaradanTashqari = new Set(reja.chegaradanTashqari);
    const accountIds = this.options.accountIds ?? [];
    const now = this.clock.now();
    const today = this.clock.todayIso();
    const sendable = (await this.accounts.listConnected()).filter(
      (a) => canSend(a, now, today) && (accountIds.length === 0 || accountIds.includes(a.id)),
    );
    const limitById = new Map(sendable.map((a) => [a.id, a.dailyLimit]));
    const jamiLimit = sendable.reduce((sum, a) => sum + a.dailyLimit, 0);
    const runtime = await this.settings.get();
    const kunlikLimitById = new Map((await this.accounts.list()).map((a) => [a.id, a.dailyLimit]));
    const qatorlar = new Map((this.job?.accounts ?? []).map((a) => [a.accountId, a]));

    const oqimlar: Oqim[] = [];
    /** Qoldiq oqimining yangi `nextAt` i — uning qatori yo'q, ish darajasiga qo'shiladi. */
    let qoldiqNextAt: string | null = null;
    for (const g of reja.guruhlar) {
      const qator = g.accountId === null ? null : (qatorlar.get(g.accountId) ?? null);
      // Cheklovga tushgan oqim qayta ochilmaydi — davom etish akkauntni
      // butunlay yo'qotishga olib keladi. Tugagani — tugagan.
      if (qator && (qator.status === 'flood' || qator.status === 'done')) continue;

      const qolgan = g.clientIds.filter((id) => !ishlangan.has(id));
      if (!qolgan.length) {
        this.qatorniYangila(g.accountId, { status: 'done', nextAt: null });
        continue;
      }
      const dailySends =
        g.accountId === null
          ? jamiLimit
          : (limitById.get(g.accountId) ?? kunlikLimitById.get(g.accountId) ?? 0);
      const mean = await this.taqsimotOrtachasi(qolgan, runtime, dailySends, g.accountId);
      // Pauza saqlangan `nextAt` dan hisoblanadi — u qator yangilanishidan
      // OLDIN o'qiladi. Qoldiq oqimining qatori yo'q: unga ish darajasidagi
      // vaqt olinadi (u oqimlar ichidagi eng yaqini, ya'ni hech bo'lmasa
      // shuncha kutiladi).
      const birinchiPauzaMs = birinchiPauza(
        g.accountId === null ? oldingiNextAt : (qator?.nextAt ?? null),
        runtime.minDelaySec,
      );
      // Eski (o'tib ketgan) vaqt o'rniga YANGI rejadagi vaqt yoziladi va
      // pauzadan oldin bazaga tushadi: shu pauza ichida yana deploy kelsa,
      // keyingi tiklash ham shu vaqtgacha kutadi.
      const yangiNextAt = new Date(Date.now() + birinchiPauzaMs).toISOString();
      if (g.accountId === null) qoldiqNextAt = yangiNextAt;
      this.qatorniYangila(g.accountId, {
        status: 'waiting',
        paceMinutes: mean === null ? null : Math.round(mean / 60_000),
        nextAt: yangiNextAt,
      });
      oqimlar.push({
        guruh: { accountId: g.accountId, clientIds: qolgan },
        mean,
        dailySends,
        birinchiPauzaMs,
      });
    }

    this.patch({
      paceMinutes: (() => {
        const jami = jamiSurat(oqimlar.map((o) => (o.mean === null ? null : o.mean / 60_000)));
        return jami === null ? null : Math.round(jami);
      })(),
      nextAt: this.engYaqinNextAt(qoldiqNextAt),
    });
    await this.saqla();
    await this.oqimlarniYurgiz(oqimlar);
  }

  /**
   * Ishni fonda yurgizadi va kutilmagan xatoni ushlaydi.
   *
   * `run()` ichida yuqori darajali `try/catch` yo'q — shu yerda
   * ushlanmasa, tsikldan oldingi og'ir so'rovlardan (masalan
   * `previewBulkStart`) kelgan har qanday xato butun jarayonni yiqitardi
   * va ish yozuvi hech qachon "failed"ga o'tmay abadiy "running" bo'lib
   * qolardi.
   */
  private launch(ish: () => Promise<void>): void {
    const p = ish()
      .catch((err: unknown) => {
        log.error({ err }, 'Ommaviy suhbat boshlashda kutilmagan xato');
        // Ish allaqachon yopilgan bo'lsa TEGMAYMIZ. `run()` ichida `finish()`
        // dan KEYIN ham kod bor (jurnal yozuvlari) — u yerdan kelgan xato
        // muvaffaqiyatli tugagan ishni "failed" qilib ko'rsatardi yoki
        // PEER_FLOOD haqidagi aniq xabarni umumiy matnga almashtirardi.
        if (this.job?.status !== 'running') return;
        this.finish('failed', 'Kutilmagan xato — yuborish to\'xtatildi, qaytadan urinib ko\'ring');
      })
      .finally(() => {
        if (this.inflight === p) this.inflight = null;
      });
    this.inflight = p;
  }

  /**
   * Holatni bazaga yozadi. `processedId` — shu qadamda tugagan mijoz:
   * tiklanishda u tashlab ketiladi.
   *
   * Mijoz tugaganda KUTILADI (pauzadan oldin holat bazada bo'lsin): aks
   * holda avariyada "xabar ketdi, lekin yozilmadi" oynasi butun pauza
   * davomiga cho'zilardi. Hech qachon rad etmaydi.
   */
  private saqla(processedId: string | null = null): Promise<void> {
    if (!this.store || !this.job || this.job.status !== 'running') return Promise.resolve();
    return this.store.save(this.job.id, this.job, processedId);
  }

  private patch(changes: Partial<BulkStartJob>): void {
    if (!this.job) return;
    this.job = { ...this.job, ...changes };
    this.events.publish({ type: 'conversation.bulk_progress', job: this.job });
  }

  /**
   * Bitta akkaunt qatorini yangilaydi VA progressni e'lon qiladi.
   *
   * NEGA E'LON SHART: qator holati (`running`, `flood`, `nextAt`) faqat
   * shu yerda o'zgaradi. E'lon qilmasak web tomoni akkaunt cheklovga
   * tushganini keyingi hisoblagich oshguncha ko'rmasdi — cheklovga
   * tushgan oqimda esa hisoblagich boshqa oshmaydi.
   *
   * `accountId` `null` bo'lsa (qoldiq oqimi) hech narsa qilmaydi: qoldiq
   * akkaunt emas va uning qatori yo'q.
   */
  private qatorniYangila(
    accountId: string | null,
    changes: Partial<Omit<BulkStartAccountProgress, 'accountId'>>,
  ): void {
    if (!this.job || accountId === null) return;
    this.job = akkauntQatoriniYangila(this.job, accountId, changes);
    this.events.publish({ type: 'conversation.bulk_progress', job: this.job });
  }

  /**
   * Hamma oqimni to'xtatadi.
   *
   * BIRINCHI sabab saqlanadi: KILL_SWITCH va ish vaqti tugashi bir vaqtda
   * sezilsa, operator birinchi sodir bo'lganini ko'rishi kerak.
   */
  private umumiyToxtat(status: BulkStartStatus, error: string | null): void {
    this.umumiyToxtash ??= { status, error };
    this.cancelled = true;
    this.stopSignal?.abort();
  }

  /**
   * Hisoblagichni oshiradi va progressni e'lon qiladi.
   *
   * NEGA `patch` YETMAYDI: `patch` chaqiruvchidan TAYYOR sonni oladi, ya'ni
   * chaqiruvchi avval `this.job.done` ni o'qiydi. Ikki oqim orasida `await`
   * bo'lsa ikkalasi ham bir xil qiymatni o'qib, bitta oshirish yo'qoladi.
   * Bu yerda o'qish va yozish `await` siz bitta qadamda bajariladi.
   */
  private bump(accountId: string | null, delta: JobDelta): void {
    if (!this.job) return;
    this.job = bumpJob(this.job, accountId, delta);
    this.events.publish({ type: 'conversation.bulk_progress', job: this.job });
  }

  private finish(status: BulkStartStatus, error: string | null = null): void {
    this.patch({
      status,
      error,
      finishedAt: new Date().toISOString(),
      currentName: null,
      nextAt: null,
    });
    // Yakuniy EMAS: deploy paytidagi "to'xtatildi" tashlanadi va vazifa
    // tiklanadi. Operator to'xtatishi `stop()` da alohida yoziladi.
    if (this.job) void this.store?.finish(this.job.id, status, this.job);
  }

  /**
   * Bitta OQIM ichidagi xabarlar orasidagi o'rtacha oraliq (ms).
   *
   * BIR MARTA, oqim boshida hisoblanadi. Har iteratsiyada
   * `(tugash − hozir) / qolgan` qayta hisoblansa, oqim orqada qolganda
   * oxirgi oraliqlar qisqarib xabarlar bir-biriga yaqinlashardi — aynan
   * spam filtri kutgan naqsh.
   */
  private async taqsimotOrtachasi(
    clientIds: string[],
    oyna: { windowStart: string; windowEnd: string },
    dailySends: number,
    /**
     * Shu oqim qaysi akkauntniki. `null` — qoldiq oqimi yoki akkaunt
     * tanlanmagan eski yo'l; u holda `perAccount` yig'indisi olinadi
     * (eski xulq).
     */
    accountId: string | null,
  ): Promise<number | null> {
    const until = this.options.spreadUntil;
    if (!until) return meanDelayMs(oyna.windowStart, oyna.windowEnd, dailySends);

    // Bo'luvchi — TANLANGANLAR soni emas, xabar KETADIGANLAR soni.
    // O'tkazib yuborilganda pauza qilinmaydi, shuning uchun tanlanganlar
    // soniga bo'lish ishni oynaning yarmida tugatardi va operator
    // ko'rgan "shu soatgacha" va'dasi buzilardi.
    //
    // Faqat bazadan hisoblanadi — Telegramga so'rov yubormaydi.
    const { counts } = await this.clients.previewBulkStart(clientIds);
    const expectedSends =
      counts.ready +
      counts.needs_lookup +
      (this.options.allowNameMismatch ? counts.name_mismatch : 0);

    // `previewBulkStart` sof baza so'rovi — akkaunt biriktirishdan bexabar.
    // Operator `perAccount` bilan "bugun faqat shuncha" deb qo'lda
    // chegaralagan bo'lsa, `planManualSplit` yig'indidan ortiqchani
    // ATAYLAB biriktirmay qoldiradi va ular keyin majburan o'tkazib
    // yuboriladi — pauza sarflamay. Shu ortiqchani hisobga olib
    // bo'lsak, sur'at kerakidan tez chiqib ketardi (masalan 100 tanlangan,
    // 30 tasi biriktirilgan bo'lsa, ish 30 tadan keyin tugaydi, lekin
    // bo'luvchi 100 bo'lib qolardi — belgilangan oynadan 3 barobar tezroq).
    const qolda = this.options.perAccount;
    const chegara =
      qolda === undefined
        ? null
        : accountId === null
          ? Object.values(qolda).reduce((a, b) => a + b, 0)
          : (qolda[accountId] ?? 0);
    const jami = chegara === null ? expectedSends : Math.min(expectedSends, chegara);

    const mean = spreadMeanMs(this.clock.now(), until, jami);
    if (mean !== null) return mean;

    // `spreadMeanMs` `null` qaytardi — odatda `spreadUntil` allaqachon
    // o'tib ketgan (masalan operator brauzeri bilan server soati bir
    // necha daqiqa farq qiladi), kamdan-kam esa xabar ketadigan mijoz
    // umuman yo'q. Pastki chegaraga (`minDelaySec`) tushib ketish
    // REJADAGIDAN TEZROQ yuborish demak — aynan shu xavfdan himoyalanish
    // uchun bu funksiya yaratilgan edi. Shuning uchun kunlik oyna
    // bo'yicha sur'atga qaytamiz, sukut bo'yichagidek jim emas.
    log.warn(
      { until, jami },
      'Taqsimot sur\'atini hisoblab bo\'lmadi (soat o\'tib ketgan yoki yuborish yo\'q) — kunlik oyna sur\'atiga o\'tildi',
    );
    return meanDelayMs(oyna.windowStart, oyna.windowEnd, dailySends);
  }

  /**
   * `davom` — saqlangan taqsimotsiz tiklash: `clientIds` faqat QOLGANLAR,
   * hisoblagichlar esa saqlangan holatdan davom etadi (`done` orqaga
   * ketmasin, `total` asl ro'yxat bo'lib qolsin).
   */
  private async run(clientIds: string[], davom = false): Promise<void> {
    // Taqsimlash tsikldan OLDIN, bir marta. Shundan keyin
    // `StartConversationUseCase` mijozning `telegramAccountId` sini o'qiydi.
    //
    // Chiquvchi xabari bor mijozlar rejaga kirmaydi — ularning akkaunti
    // o'zgarmaydi (`findReassignableForBulkStart`).
    const accountIds = this.options.accountIds ?? [];
    // Har ish uchun toza ro'yxat: oldingi ishning qoldig'i keyingi ishda
    // begunoh mijozni jimgina o'tkazib yuborardi.
    this.chegaradanTashqari = new Set();
    // Operator akkaunt tanlaganini bildiradi: faqat shunda taqsimot
    // qilinadi va mijozlar akkauntlar bo'yicha oqimlarga bo'linadi.
    const operatorChoseAccounts = accountIds.length > 0;

    // Akkaunt tanlanmagan bo'lsa akkauntni oldindan bilib bo'lmaydi —
    // u `StartConversationUseCase` ichida avtomatik biriktiriladi.
    // Shuning uchun bitta oqim, hozirgidek ketma-ket.
    let guruhlar: AccountGroup[] = [{ accountId: null, clientIds }];

    if (operatorChoseAccounts) {
      // Xato bo'lsa (masalan mijoz shu oraliqda o'chirilgan yoki baza
      // uzilgan) ishni shu yerda TO'XTATAMIZ, tsiklga o'tkazmaymiz.
      //
      // Biriktirish BITTA tranzaksiyada bajariladi (`assignAccounts`):
      // ilgari har mijoz alohida `UPDATE` edi va o'rtada uzilish
      // mijozlarning bir qismini yangi akkauntda, qolganini eskisida
      // qoldirardi — xato matni esa hech narsa o'zgarmagandek eshitilardi.
      // Endi yo hammasi qo'llanadi, yo hech biri.
      try {
        const plan = await this.planner.plan(clientIds, accountIds, {
          manual: this.options.perAccount,
        });
        const assigned = await this.clients.assignAccounts(
          [...plan.assignments].map(([clientId, accountId]) => ({ clientId, accountId })),
        );
        guruhlar = groupByAccount(clientIds, plan.assignments);
        // Qoldiq guruhi IKKI xil mijozdan iborat va ular bilan bir xil
        // muomala qilib bo'lmaydi:
        //   • baza so'rovidan chiqib ketganlar (chiquvchi xabari bor,
        //     bog'lanish taqiqlangan, raqami yo'q) — ular `execute` ga
        //     borib O'Z aniq sababini oladi, operator esa shu sabab bilan
        //     CRM'ni solishtiradi;
        //   • bog'lanish mumkin, lekin operator qo'lda chegaralagani
        //     uchun taqsimotga tushmaganlar — bularga xabar KETMASLIGI
        //     kerak, aks holda operator so'ragan son ma'nosini yo'qotadi.
        this.chegaradanTashqari = new Set(
          clientIds.filter((id) => !plan.assignments.has(id) && plan.reassignable.has(id)),
        );
        log.info(
          {
            planned: plan.assignments.size,
            assigned,
            accounts: accountIds.length,
            oqimlar: guruhlar.length,
          },
          'Mijozlar tanlangan akkauntlarga biriktirildi',
        );
      } catch (err) {
        log.error({ err, accounts: accountIds.length }, 'Mijozlarni akkauntlarga biriktirishda xato');
        this.finish(
          'failed',
          'Mijozlarni akkauntlarga biriktirib bo\'lmadi — hech qanday o\'zgarish saqlanmadi, qaytadan urinib ko\'ring',
        );
        return;
      }
    }

    // Kunlik sig'im. Har oqim O'Z akkauntining limitini oladi
    // (`limitById`); yig'indi (`jamiLimit`) faqat qoldiq oqimi va akkaunt
    // tanlanmagan eski yo'l uchun — u yerda xabar qaysi akkauntdan
    // ketishi oldindan noma'lum.
    //
    // BIR MARTA hisoblanadi. Har iteratsiyada qayta hisoblansa, kvotasi
    // tugagan akkaunt sig'imdan chiqib ketardi va qolganlari sekinlashardi.
    // Taqsimot birinchi xabardan OLDIN saqlanadi: tiklashda u qayta
    // qilinmaydi (mijozlar allaqachon biriktirilgan).
    const reja: BulkStartPlan = {
      guruhlar: guruhlar.map((g) => ({ accountId: g.accountId, clientIds: [...g.clientIds] })),
      chegaradanTashqari: [...this.chegaradanTashqari],
    };
    if (this.job) await this.store?.savePlan(this.job.id, reja);

    const now = this.clock.now();
    const today = this.clock.todayIso();
    const sendable = (await this.accounts.listConnected()).filter(
      (a) => canSend(a, now, today) && (accountIds.length === 0 || accountIds.includes(a.id)),
    );
    const limitById = new Map(sendable.map((a) => [a.id, a.dailyLimit]));
    const jamiLimit = sendable.reduce((sum, a) => sum + a.dailyLimit, 0);

    const runtimeForPace = await this.settings.get();
    const barchaAkkaunt = await this.accounts.list();
    const labelById = new Map(barchaAkkaunt.map((a) => [a.id, a.label]));
    // Sur'at uchun zaxira sig'im: `limitById` faqat HOZIR yubora
    // oladigan akkauntlardan tuzilgan (`canSend`), reja esa kengroq
    // shartga tayanadi (`canAcceptClients` — yoqilgan va banda emas).
    // Uzilib qolgan, cheklovda turgan yoki kvotasi tugagan akkaunt ham
    // guruh oladi, lekin `limitById` da yo'q.
    const kunlikLimitById = new Map(barchaAkkaunt.map((a) => [a.id, a.dailyLimit]));
    const personaById = new Map(
      barchaAkkaunt.map((a) => [a.id, personaNameOf(a, runtimeForPace.personaName)]),
    );

    // Har oqimning sur'ati mustaqil: shu akkauntning ulushi shu akkauntning
    // kunlik limiti va tugash soatidan chiqadi. `dailySends` ni JAMI limit
    // qilib qoldirsak uch oqim uch barobar tez ketardi.
    const oqimlar = await Promise.all(
      guruhlar.map(async (guruh) => {
        // `?? 0` bo'lsa sur'at UMUMAN hisoblanmasdi (`meanDelayMs` `null`
        // qaytaradi) va oraliq `minDelaySec…maxDelaySec` pastki
        // chegarasiga tushardi — ~27 daqiqa o'rniga bir necha daqiqa.
        // Bugun buni `checkAccount` yashirib turadi (o'sha shartlar bilan
        // har mijozni pauzasiz o'tkazib yuboradi), lekin akkaunt ish
        // o'rtasida qayta ulangan zahoti oqim shu tezlikda birinchi
        // xabarlarni yog'dirardi. Shuning uchun akkauntning O'Z kunlik
        // limitiga qaytamiz.
        const dailySends =
          guruh.accountId === null
            ? jamiLimit
            : (limitById.get(guruh.accountId) ?? kunlikLimitById.get(guruh.accountId) ?? 0);
        const mean = await this.taqsimotOrtachasi(
          guruh.clientIds,
          runtimeForPace,
          dailySends,
          guruh.accountId,
        );
        return { guruh, mean, dailySends };
      }),
    );

    // Qoldiq oqimi qator sifatida ko'rsatilmaydi — u akkaunt emas.
    //
    // `startedAt` KO'CHIRILADI: `boshIsh` uni yangilab yuborardi va
    // operator ish qachon boshlanganini noto'g'ri ko'rardi (taqsimlash va
    // sur'at hisobi bir necha soniya olishi mumkin).
    const boshlanganVaqt = this.job?.startedAt ?? new Date().toISOString();
    const avvalgiTiklanish = this.job?.resumedCount;
    const oldingiIsh = this.job;
    this.job = boshIsh(
      this.job?.id ?? '',
      clientIds.length,
      this.options.allowNameMismatch === true,
      oqimlar
        .filter((o) => o.guruh.accountId !== null)
        .map((o) => ({
          accountId: o.guruh.accountId,
          label: labelById.get(o.guruh.accountId!) ?? 'Akkaunt',
          personaName: personaById.get(o.guruh.accountId!) ?? runtimeForPace.personaName,
          total: o.guruh.clientIds.length,
        })),
    );
    this.job = {
      ...this.job,
      startedAt: boshlanganVaqt,
      resumedCount: avvalgiTiklanish,
      // Ega yo'qolmasin: yozuv qayta qurilyapti.
      ...(oldingiIsh?.boshlaganUserId ? { boshlaganUserId: oldingiIsh.boshlaganUserId } : {}),
    };
    if (davom && oldingiIsh) this.job = hisoblagichlarniDavomEttir(oldingiIsh, this.job);
    for (const o of oqimlar) {
      this.qatorniYangila(o.guruh.accountId, {
        paceMinutes: o.mean === null ? null : Math.round(o.mean / 60_000),
      });
    }
    this.patch({
      paceMinutes: (() => {
        const jami = jamiSurat(oqimlar.map((o) => (o.mean === null ? null : o.mean / 60_000)));
        return jami === null ? null : Math.round(jami);
      })(),
    });
    await this.saqla();

    log.info(
      { total: clientIds.length, accounts: sendable.length, oqimlar: oqimlar.length },
      'Ommaviy suhbat boshlash boshlandi',
    );

    await this.oqimlarniYurgiz(oqimlar);
  }

  /** Oqimlarni yurgizadi va ishni yakunlaydi — yangi ish ham, tiklangani ham. */
  private async oqimlarniYurgiz(oqimlar: Oqim[]): Promise<void> {
    // `allSettled`, `all` EMAS: `all` birinchi rad javobida DARHOL
    // qaytadi va qolgan oqimlar EGASIZ ishlashda davom etadi. Har oqim
    // o'z xatosini `oqimniHimoyala` ichida ushlaydi, ya'ni bu yerga rad
    // javobi kelmasligi kerak — `allSettled` esa e'lon qilish yoki
    // qatorni yangilashning o'zi yiqilgan chekka holatda ham `run()`
    // tirik oqim qoldirib qaytmasligini kafolatlaydi.
    await Promise.allSettled(oqimlar.map((o) => this.oqimniHimoyala(o, oqimlar.length > 1)));

    if (this.cancelled) {
      this.finish(this.umumiyToxtash?.status ?? 'stopped', this.umumiyToxtash?.error ?? null);
      return;
    }

    // Hamma oqim cheklovga tushgan bo'lsa — bu endi bitta akkauntning
    // muammosi emas, operator sababni tekshirishi kerak.
    //
    // `qatorlar.length > 0` sharti muhim: akkaunt tanlanmagan eski yo'lda
    // qator umuman yo'q va bu tekshiruv hech qachon ishlamasligi kerak
    // (u yerda cheklov `oqimniYurgiz` dagi `umumiyToxtat` orqali hal
    // qilinadi).
    const qatorlar = this.job?.accounts ?? [];
    const hammaFlood = qatorlar.length > 0 && qatorlar.every((a) => a.status === 'flood');
    if (hammaFlood) {
      this.finish('failed', 'Barcha akkauntlar cheklovga tushdi — yuborish to\'xtatildi, akkauntlarni tekshiring');
      return;
    }

    // Oqim allaqachon yakuniy holat qo'ygan bo'lsa (masalan cheklov) uni
    // `done` bilan bosib o'tmaymiz: ish "muvaffaqiyatli tugadi" bo'lib
    // ko'rinardi va sabab matni yo'qolardi.
    if (this.job?.status === 'running') this.finish('done');
    log.info(
      { started: this.job?.started, skipped: this.job?.skipped, failed: this.job?.failed },
      'Ommaviy suhbat boshlash tugadi',
    );
  }

  /**
   * Oqimni kutilmagan xatodan himoyalab yurgizadi.
   *
   * NEGA KERAK: mijoz uchun qo'yilgan `try/catch` tsiklning HAMMASINI
   * qoplamaydi — `this.settings.get()` (keshsiz baza so'rovi, har
   * iteratsiyada) undan tashqarida turadi. O'tkinchi baza uzilishi shu
   * oqimni rad javobiga olib borardi, `run()` esa darhol qaytib ishni
   * "failed" qilardi. Shundan keyin `isRunning()` `false` bo'lgani uchun
   * operator YANGI ish boshlashi mumkin, egasiz qolgan oqimlar esa
   * o'sha akkauntlardan sur'atsiz xabar yuborib, yangi ishning
   * hisoblagichlarini buzardi — aynan `PEER_FLOOD` ga olib boradigan yo'l.
   *
   * Shuning uchun xato shu yerda ushlanadi va `umumiyToxtat` orqali
   * HAMMA oqim yopiladi: `run()` tirik oqim qoldirib qaytmaydi.
   */
  private async oqimniHimoyala(
    oqim: Oqim,
    tarqat: boolean,
  ): Promise<void> {
    try {
      await this.oqimniYurgiz(oqim, tarqat);
    } catch (err) {
      log.error(
        { err, akkaunt: this.accountLabels.labelOf(oqim.guruh.accountId) },
        'Oqim kutilmagan xato bilan uzildi — hamma oqim to\'xtatiladi',
      );
      // Qatorni O'ZIMIZ yopamiz: tsikldan keyingi yakuniy yangilanishga
      // yetib borilmadi, ya'ni qator abadiy "ishlayapti" bo'lib qolardi.
      this.qatorniYangila(oqim.guruh.accountId, {
        status: 'stopped',
        error: 'Kutilmagan xato — oqim to\'xtadi',
        nextAt: null,
      });
      this.umumiyToxtat(
        'failed',
        'Oqimda kutilmagan xato — yuborish to\'xtatildi, qaytadan urinib ko\'ring',
      );
    }
  }

  /**
   * Bitta akkauntning oqimi.
   *
   * NEGA MUSTAQIL: Telegramning `PEER_FLOOD` va kunlik cheklovlari har
   * akkauntga ALOHIDA hisoblanadi. Akkauntlarni bitta navbatda ushlab
   * turish hech bir akkauntning yukini kamaytirmaydi — u faqat bitta
   * mijozning sekin qidiruvi butun ishni to'xtatib turishiga olib keladi.
   */
  private async oqimniYurgiz(
    oqim: Oqim,
    tarqat: boolean,
  ): Promise<void> {
    const { accountId, clientIds } = oqim.guruh;
    // Operator akkaunt tanlagan bo'lsagina `noAutoAssign` beramiz:
    // taqsimot tayyor, ya'ni avtomatik biriktirish faqat operatorning
    // tanlovini buzardi (tanlanmagan akkauntdan xabar ketardi). Akkaunt
    // tanlanmagan eski chaqiruvlarda esa u eski holicha ishlashi kerak.
    const noAutoAssign = (this.options.accountIds?.length ?? 0) > 0;

    // Bir nechta oqim bir vaqtda 0-soniyada birinchi xabarini yuborsa, bu
    // o'zi naqsh bo'lib qoladi. Bitta oqimda esa kutishning ma'nosi yo'q —
    // u eski xulqni sekinlashtirardi.
    if (oqim.birinchiPauzaMs !== undefined) {
      if (oqim.birinchiPauzaMs > 0) await sleep(oqim.birinchiPauzaMs, this.stopSignal?.signal);
    } else if (tarqat) {
      const runtime = await this.settings.get();
      const siljish = Math.random() * Math.max(0, runtime.minDelaySec) * 1000;
      if (siljish > 0) await sleep(siljish, this.stopSignal?.signal);
    }

    this.qatorniYangila(accountId, { status: 'running' });

    for (let i = 0; i < clientIds.length; i += 1) {
      // `return` EMAS, `break`: tsikldan keyingi yakuniy qator yangilanishi
      // ishlashi kerak, aks holda to'xtatilgan ishda akkaunt qatori abadiy
      // "ishlayapti" bo'lib qolardi — operator jadvalda ish to'xtaganini
      // ko'rmasdi.
      if (this.cancelled) break;

      const runtime = await this.settings.get();

      // Global to'xtatish — hech qanday xabar ketmaydi.
      if (runtime.killSwitch) {
        this.umumiyToxtat('failed', 'KILL_SWITCH yoqilgan — yuborish to\'xtatilgan');
        break;
      }

      // Ish vaqtidan tashqarida notanish odamga yozish — spam signali.
      const window = evaluateWindow(this.clock.now(), {
        start: runtime.windowStart,
        end: runtime.windowEnd,
        weekdays: runtime.weekdays,
        timeZone: config.TIMEZONE,
      });
      if (!window.allowed) {
        this.umumiyToxtat('stopped', `Ish vaqti tugadi (${window.reason}) — qolganini ertaga davom ettiring`);
        break;
      }

      const id = clientIds[i]!;

      // Bugungi taqsimotdan tashqarida qolgan mijoz: `execute` UMUMAN
      // chaqirilmaydi. Chaqirilsa, akkaunti saqlanib qolgani uchun xabar
      // ketardi (`noAutoAssign` faqat akkauntsizni to'xtatadi).
      //
      // Pauza ham qilinmaydi: Telegramga hech narsa yuborilmadi, ya'ni
      // spam filtri uchun signal yo'q. Kutish esa oqimning qolgan
      // mijozlarini taqsimot oynasidan tashqariga surib yuborardi.
      if (this.chegaradanTashqari.has(id)) {
        const toliqRoyxat = (this.job?.skippedItems.length ?? 0) >= SKIP_DETAILS_LIMIT;
        const chegaraTafsiloti = toliqRoyxat
          ? ('truncated' as const)
          : await this.skipTafsiloti(id, CHEGARADAN_TASHQARI);
        this.bump(accountId, {
          skipped: 1,
          done: 1,
          skipReason: CHEGARADAN_TASHQARI,
          skippedItem: chegaraTafsiloti,
        });
        // Oldingi `nextAt` eskirdi — tozalamasak operator allaqachon o'tib
        // ketgan vaqtni ko'rib turaveradi. Lekin tozalanadigan narsa SHU
        // oqimning vaqti; ish darajasidagi vaqt esa oqimlar ichidagi eng
        // yaqini bo'lishi kerak (`oqimniYop` shunday qiladi).
        this.qatorniYangila(accountId, { nextAt: null });
        this.patch({ nextAt: this.engYaqinNextAt(null) });
        await this.saqla(id);
        continue;
      }

      // Xabar ketmagan mijozdan keyin kutishning ma'nosi yo'q: Telegramga
      // hech narsa yuborilmagan, ya'ni spam filtri uchun signal ham yo'q.
      // Ilgari 33 tadan 14 tasi o'tkazib yuborilsa, ish 14 ta BO'SH pauza
      // sarflardi va taqsimot oynasi behuda ketardi.
      //
      // Xato yo'lida pauza SAQLANADI — u yerda Telegramga so'rov ketgan
      // bo'lishi mumkin.
      let pauzaKerak = true;

      try {
        const result = await this.startConversation.execute(id, {
          allowNameMismatch: this.options.allowNameMismatch,
          actor: this.options.actor,
          noAutoAssign,
          // "To'xtatish" endi mijozning ICHIGA ham yetadi: Telegram
          // qidiruvi va model chaqiruvi yarim yo'lda uziladi.
          signal: this.stopSignal?.signal,
        });

        if (result.status === 'started') {
          this.bump(accountId, { started: 1, done: 1 });
          await this.saqla(id);
        } else {
          pauzaKerak = false;

          const reason = result.reason ?? 'Sabab ko\'rsatilmagan';

          // Kim ekanini ham yozib qo'yamiz — sonning o'zi tashxis uchun
          // yetarli emas. Ism bitta qo'shimcha so'rov, u esa
          // o'tkazib yuborilganda (ya'ni kamdan-kam) qilinadi.
          //
          // Ro'yxat to'lgan bo'lsa tafsilot olishning ma'nosi yo'q — u
          // baribir tashlab yuborilardi, lekin baza so'rovi ketardi.
          const toliq = (this.job?.skippedItems.length ?? 0) >= SKIP_DETAILS_LIMIT;
          const tafsilot = toliq ? ('truncated' as const) : await this.skipTafsiloti(id, reason);
          this.bump(accountId, { skipped: 1, done: 1, skipReason: reason, skippedItem: tafsilot });
          // O'tkazib yuborilganda pauza yo'q, ya'ni oldingi `nextAt`
          // eskirgan — tozalamasak ketma-ket o'tkazib yuborishlarda
          // operator allaqachon o'tib ketgan vaqtni ko'rib turaveradi.
          //
          // TOZALANADIGANI — SHU oqimning vaqti. Ilgari bu yerda ish
          // darajasidagi maydonga to'g'ridan `null` yozilardi va boshqa
          // oqimning haqiqiy "14:32 da" va'dasi o'chib ketardi; shu
          // oqimning O'Z qatorida esa o'tib ketgan vaqt qolib, keyingi
          // qayta hisobda yana eng yaqin bo'lib chiqardi. O'tkazib
          // yuborish kamdan-kam emas — operator vaqtni doimiy noto'g'ri
          // ko'rardi.
          this.qatorniYangila(accountId, { nextAt: null });
          this.patch({ nextAt: this.engYaqinNextAt(null) });
          await this.saqla(id);
        }
      } catch (err) {
        // Operator to'xtatgan mijoz XATO EMAS — u "yiqilganlar" soniga
        // qo'shilmasligi kerak. Aks holda operator o'zi bosgan tugmaning
        // natijasini nosozlik deb o'qib, yo'q kamchilikni qidirardi.
        // Spam tekshiruvidan OLDIN: uzilish har qanday xato ko'rinishida
        // kelishi mumkin, sanoq esa baribir buzilmasligi kerak.
        if (err instanceof AbortedError || this.cancelled) {
          // `umumiyToxtat` o'zi `cancelled` ni qo'yadi, ya'ni tsikldan
          // keyingi yakuniy yangilanish qatorni `stopped` qiladi. Ilgari bu
          // yerdagi `finish()` bitta oqim ichidan butun ishni yopib qo'yardi
          // (qolganlari esa ishlashda davom etardi), qatori esa
          // "ishlayapti" bo'lib qolardi.
          this.umumiyToxtat('stopped', null);
          break;
        }

        // `code` EMAS, `telegramCode`: `TelegramError.code` har doim
        // 'TELEGRAM_ERROR' bo'lgani uchun bu shart hech qachon
        // bajarilmasdi va ommaviy yuborish PEER_FLOOD ustidan davom
        // etib, akkauntni butunlay yo'qotish xavfini tug'dirardi.
        //
        // Cheklov AKKAUNTGA beriladi, ishga emas. Qolgan akkauntlar
        // sog'lom — ularni to'xtatish operatorning kunini yo'qotardi.
        // Shu oqim esa DARHOL to'xtaydi: davom etish akkauntni butunlay
        // yo'qotishga olib keladi.
        //
        // `accountId === null` — bu akkaunt oqimi EMAS (operator akkaunt
        // tanlamagan eski yo'l yoki "qoldiq" oqimi). Unda belgilaydigan
        // qator yo'q, ya'ni `hammaFlood` hisobi ham ishlamaydi. Shuning
        // uchun u yerda eski xulq saqlanadi: butun ish to'xtaydi.
        if (
          err instanceof TelegramError &&
          (err.telegramCode === 'PEER_FLOOD' || err.telegramCode === 'FLOOD_WAIT')
        ) {
          if (accountId === null) {
            this.umumiyToxtat('failed', `${err.message} — yuborish to'xtatildi, akkauntni tekshiring`);
            log.warn({ done: this.job?.done, code: err.telegramCode }, 'Spam cheklovi — to\'xtatildi');
            break;
          }

          const sabab = `Akkaunt cheklovga tushdi (${err.telegramCode}) — ${err.message}`;
          log.warn(
            { ...(await this.xatoKonteksti(id)), done: this.job?.done, code: err.telegramCode },
            'Spam cheklovi — oqim to\'xtatildi',
          );
          await this.oqimniYop(oqim, i, sabab);
          // `break` EMAS, `return`: tsikldan keyingi yakuniy yangilanish
          // qatorni `stopped` qilib, `oqimniYop` qo'ygan `flood` ni bosib
          // o'tardi.
          return;
        }

        log.warn({ ...(await this.xatoKonteksti(id)), clientId: id, err }, 'Suhbat boshlashda xato');
        this.bump(accountId, { failed: 1, done: 1 });
        await this.saqla(id);
      }

      if (pauzaKerak && i < clientIds.length - 1) {
        // Oraliq eksponensial taqsimotdan: o'rtachasi kunlik sig'imga
        // moslangan, lekin har xil — bir xil oraliq o'zi filtr uchun
        // signal bo'lardi.
        const delayMs = nextDelayMs({
          windowStart: runtime.windowStart,
          windowEnd: runtime.windowEnd,
          dailySends: oqim.dailySends,
          minDelaySec: runtime.minDelaySec,
          maxDelaySec: runtime.maxDelaySec,
          // Oqim boshida bir marta hisoblangan o'rtacha. `null` bo'lsa
          // `nextDelayMs` oyna hisobiga qaytadi.
          meanMs: oqim.mean,
        });
        const nextAt = new Date(Date.now() + delayMs).toISOString();
        this.qatorniYangila(accountId, { nextAt });
        this.patch({ nextAt: this.engYaqinNextAt(nextAt) });
        // `nextAt` pauzadan OLDIN bazaga yoziladi. Aks holda bazada oldingi,
        // allaqachon o'tib ketgan vaqt qolardi va pauza ichida deploy kelsa
        // tiklangan oqim tasodifiy qisqa siljish bilan yozib yuborardi —
        // eng oxirgi yozgan akkaunt rejadagi sur'atdan ham, `minDelaySec`
        // dan ham tezroq. Kutiladi: tartib aniq bo'lsin (pauza baribir uzun).
        await this.saqla();
        // Signal bilan: "To'xtatish" bosilsa pauza shu zahoti uziladi.
        // Aks holda to'xtash faqat KEYINGI mijozga o'tishda sezilardi —
        // ya'ni operator uchun o'nlab daqiqa "javobsiz" tugma.
        await sleep(delayMs, this.stopSignal?.signal);
      }
    }

    this.qatorniYangila(accountId, {
      status: this.cancelled ? 'stopped' : 'done',
      nextAt: null,
    });
  }

  /**
   * Cheklovga tushgan oqimni yopadi: qolgan mijozlari o'tkazib yuborilgan
   * deb belgilanadi.
   *
   * NEGA SANOQNI YOPAMIZ: aks holda `done` hech qachon `total` ga
   * yetmasdi va progress chizig'i abadiy to'lmay qolardi — operator
   * ishning tugaganini bilolmasdi.
   *
   * `boshlanganIndeks` — cheklov kelgan mijozning o'rni. Unga xabar
   * KETMADI va u `failed` deb ham sanalmagan (cheklov sharti `bump`dan
   * oldin turadi), shuning uchun u ham, undan keyingilari ham o'tkazib
   * yuborilganlar qatoriga qo'shiladi.
   */
  private async oqimniYop(
    oqim: { guruh: AccountGroup },
    boshlanganIndeks: number,
    sabab: string,
  ): Promise<void> {
    const { accountId, clientIds } = oqim.guruh;

    for (let i = boshlanganIndeks; i < clientIds.length; i += 1) {
      // Ro'yxat to'lgan bo'lsa tafsilot olishning ma'nosi yo'q — u baribir
      // tashlab yuborilardi, lekin har mijoz uchun ikkita baza so'rovi
      // ketardi. Bu yerda pauza yo'q, ya'ni 5000 talik ishda minglab
      // so'rov bir zumda ketardi.
      const toliq = (this.job?.skippedItems.length ?? 0) >= SKIP_DETAILS_LIMIT;
      const tafsilot = toliq ? ('truncated' as const) : await this.skipTafsiloti(clientIds[i]!, sabab);
      this.bump(accountId, { done: 1, skipped: 1, skipReason: sabab, skippedItem: tafsilot });
    }

    this.qatorniYangila(accountId, {
      status: 'flood',
      error: sabab,
      nextAt: null,
    });
    this.patch({ nextAt: this.engYaqinNextAt(null) });
    await this.saqla();
  }

  /**
   * Yuqori darajadagi `nextAt` — oqimlar ichidagi ENG YAQINI.
   *
   * Uch oqim ishlaganda "keyingi xabar" degan bitta sana faqat shu ma'noda
   * to'g'ri bo'ladi: operator shu vaqtdan oldin hech narsa ko'rmaydi.
   */
  private engYaqinNextAt(qoshimcha: string | null): string | null {
    const vaqtlar = (this.job?.accounts ?? [])
      .map((a) => a.nextAt)
      .concat(qoshimcha)
      .filter((v): v is string => v !== null);
    if (!vaqtlar.length) return qoshimcha;
    return vaqtlar.reduce((a, b) => (new Date(a) < new Date(b) ? a : b));
  }
}

/**
 * Taqsimotsiz tiklashda qayta qurilgan ish yozuviga saqlangan sonlarni
 * qaytaradi.
 *
 * NEGA: `run()` yozuvni qolgan mijozlar ro'yxatidan yangidan quradi —
 * sonlar noldan boshlansa operator "6 dan 4" ni ko'rgan joyida "2 dan 0"
 * ni ko'rardi. `total` asl ro'yxat, `done` va boshqalar saqlanganidan
 * davom etadi; akkaunt qatori ham o'sha akkauntning eski sonlari bilan
 * qo'shiladi.
 */
function hisoblagichlarniDavomEttir(oldingi: BulkStartJob, yangi: BulkStartJob): BulkStartJob {
  const eskiQatorlar = new Map((oldingi.accounts ?? []).map((a) => [a.accountId, a]));
  return {
    ...yangi,
    total: Math.max(oldingi.total, oldingi.done + yangi.total),
    done: oldingi.done,
    started: oldingi.started,
    skipped: oldingi.skipped,
    failed: oldingi.failed,
    skipReasons: { ...(oldingi.skipReasons ?? {}) },
    skippedItems: [...(oldingi.skippedItems ?? [])],
    skippedItemsTruncated: oldingi.skippedItemsTruncated ?? 0,
    accounts: yangi.accounts.map((a) => {
      const eski = eskiQatorlar.get(a.accountId);
      if (!eski) return a;
      return {
        ...a,
        total: eski.done + a.total,
        done: eski.done,
        started: eski.started,
        skipped: eski.skipped,
        failed: eski.failed,
      };
    }),
  };
}

/** `bulk_jobs.plan` ni tekshirib o'qiydi; shakl noto'g'ri bo'lsa `null`. */
function rejaniOqi(plan: unknown): BulkStartPlan | null {
  if (!plan || typeof plan !== 'object') return null;
  const p = plan as Partial<BulkStartPlan>;
  if (!Array.isArray(p.guruhlar) || !Array.isArray(p.chegaradanTashqari)) return null;
  const togri = p.guruhlar.every(
    (g) =>
      g && (g.accountId === null || typeof g.accountId === 'string') &&
      Array.isArray(g.clientIds) && g.clientIds.every((id) => typeof id === 'string'),
  );
  return togri ? (p as BulkStartPlan) : null;
}

/**
 * Tiklangan oqimning birinchi xabaridan oldingi pauza.
 *
 * Saqlangan `nextAt` kelajakda bo'lsa — o'sha vaqtgacha; aks holda
 * yangi ishdagi kabi tasodifiy siljish. Aks holda har deploy har
 * akkauntdan navbatdan tashqari birinchi xabar chiqarardi.
 */
function birinchiPauza(nextAt: string | null, minDelaySec: number): number {
  const qoldi = nextAt ? new Date(nextAt).getTime() - Date.now() : NaN;
  if (Number.isFinite(qoldi) && qoldi > 0) return qoldi;
  return Math.random() * Math.max(0, minDelaySec) * 1000;
}
