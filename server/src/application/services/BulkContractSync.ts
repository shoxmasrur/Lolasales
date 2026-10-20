import type { ContractSyncService } from '@/application/services/ContractSyncService';
import type { IClientRepository } from '@/domain/repositories/IClientRepository';
import type { IContractRepository } from '@/domain/repositories/IContractRepository';
import type { IEventBus } from '@/domain/services/support';
import { sleep } from '@/shared/datetime';
import { childLogger } from '@/shared/logger';
import type { BulkJobRow } from '@/domain/repositories/IBulkJobRepository';
import type { BulkJobStore } from '@/application/services/BulkJobStore';
import type { ResumableJob } from '@/application/services/BulkJobResumer';

const log = childLogger('bulk-contract-sync');

/**
 * Diqqat ro'yxatiga sig'adigan eng ko'p yozuv.
 *
 * 5000 ta mijoz belgilangan bo'lsa ro'yxat socket orqali har qadamda
 * uzatiladi — cheklovsiz u brauzergacha megabaytlab yuk bo'lardi.
 * Sanoqlar to'liq qoladi, ro'yxatdan tashqaridagilar `missingTruncated`
 * da sanaladi.
 */
const MISS_LIMIT = 200;

const OCHIQ_SABAB = "Shartnomalar sinxronizatsiyasi o'chirilgan (CONTRACTS_SYNC_ENABLED=false)";

export type BulkContractSyncStatus = 'running' | 'done' | 'stopped' | 'failed';

export type BulkContractSyncReason = 'not_found' | 'error' | 'no_contract';

export interface BulkContractSyncMiss {
  readonly clientId: string;
  readonly name: string;
  readonly reason: BulkContractSyncReason;
}

export interface BulkContractSyncJob {
  readonly id: string;
  /** Tanlangan mijozlar soni. */
  readonly total: number;
  readonly done: number;
  /** Muvaffaqiyatli yangilangan SHARTNOMALAR soni. */
  readonly contracts: number;
  /** CRM'dan qo'shilgan yangi raqamlar soni. */
  readonly newPhones: number;
  /** CRM'da shartnomasi topilmagan mijozlar. */
  readonly notFound: number;
  /** So'rov xato bergan mijozlar. */
  readonly failed: number;
  /** Bizda umuman shartnomasi yo'q mijozlar. */
  readonly noContract: number;
  readonly status: BulkContractSyncStatus;
  readonly currentName: string | null;
  readonly startedAt: string;
  readonly finishedAt: string | null;
  readonly error: string | null;
  /** Diqqat talab qiladiganlar — `MISS_LIMIT` bilan cheklangan. */
  readonly missing: readonly BulkContractSyncMiss[];
  /** Cheklovdan oshgani uchun ro'yxatga kirmaganlari. */
  readonly missingTruncated: number;
  /** Server qayta ishga tushgach (deploy) vazifa necha marta davom ettirilgan. */
  readonly resumedCount?: number;
  /**
   * Vazifani kim boshlagan (`users.id`). Obyekt cheklovi: cheklangan
   * foydalanuvchiga boshqaning vazifasi ismsiz ko'rsatiladi va u uni
   * to'xtata olmaydi. Eski (maydonsiz) vazifa — egasi noma'lum.
   */
  readonly boshlaganUserId?: string | null;
}

/** `bulk_jobs.input` dagi shakl. */
export interface BulkContractSyncInput {
  readonly clientIds: string[];
}

/**
 * Belgilangan mijozlarni shartnomalar bazasidan KETMA-KET yangilaydi.
 *
 * NEGA ALOHIDA VAZIFA: bitta shartnoma ~330 ms. 200 ta mijoz (ba'zilarida
 * bir nechta shartnoma) bitta HTTP so'rovga sig'maydi — timeout yoki
 * yopilgan brauzer ishni yarmida uzib qo'yardi. Shuning uchun so'rov
 * darhol qaytadi, ish esa fonda ketadi va progress socket orqali
 * ko'rinadi.
 *
 * NEGA KETMA-KET: hammasini birdan yuborish ularning serveriga zarba
 * beradi va javob bermay qo'yishi mumkin. So'rovlar orasida pauza bor.
 *
 * Vazifa holati `bulk_jobs` ga yozib boriladi (`BulkJobStore`): server
 * qayta ishga tushsa (deploy), `BulkJobResumer` uni `resume()` orqali
 * yangilanmagan mijozlardan davom ettiradi. Yarim yo'lda uzilgan mijoz
 * to'liq qayta yangilanadi — bu zararsiz.
 */
export class BulkContractSync implements ResumableJob {
  readonly kind = 'contract_sync' as const;
  /** Kunlik limitga bog'liq emas — ertasiga ham davom ettiriladi. */
  readonly sameDayOnly = false;

  private job: BulkContractSyncJob | null = null;
  private cancelled = false;
  private aborter: AbortController | null = null;
  /** Ketayotgan tsikl — to'xtash (`main.ts`) shuni kutadi. */
  private inflight: Promise<void> | null = null;
  /**
   * `resume()` aniq sabab bilan rad etgan vazifa (id → sabab). Resumer
   * keyin `abandon()` ni umumiy "qaytadan boshlang" matni bilan chaqiradi —
   * panelda esa operator NIMA uchunligini ko'rishi kerak.
   */
  private radSababi: { id: string; sabab: string } | null = null;

  constructor(
    private readonly clients: IClientRepository,
    private readonly contracts: IContractRepository,
    private readonly sync: ContractSyncService,
    private readonly events: IEventBus,
    /** Ikki so'rov orasidagi pauza. */
    private readonly delayMs: number,
    /** `CONTRACTS_SYNC_ENABLED` — o'chirilgan bo'lsa ish boshlanmaydi. */
    private readonly enabled: boolean,
    /** `null` — holat saqlanmaydi (testlar). */
    private readonly store: BulkJobStore | null = null,
    /**
     * Kechasigi to'liq yangilash (`ContractSyncScheduler`) ketyaptimi.
     * Ketayotgan bo'lsa navbatdagi so'rov u tugaguncha kutadi — CRM'ga
     * ikki parallel oqim bormasin. Tiklangan vazifa server ko'tarilishida
     * ishga tushadi, rejalashtiruvchi esa shu payt (masalan 03:xx dagi
     * deploy) to'liq yangilashni boshlab yuborishi mumkin.
     */
    private readonly nightlyBusy: () => boolean = () => false,
  ) {}

  current(): BulkContractSyncJob | null {
    return this.job;
  }

  isRunning(): boolean {
    return this.job?.status === 'running';
  }

  /**
   * Operator "To'xtatish"ni bosdi — YAKUNIY.
   *
   * Niyat bazaga DARHOL yoziladi: tsikl bayroqni faqat joriy so'rov
   * tugagach o'qiydi; shu oraliqda deploy kelsa tsikldagi "to'xtatildi"
   * yozuvi tashlanardi va vazifa server ko'tarilgach davom etib ketardi.
   */
  stop(): void {
    if (!this.isRunning() || !this.job) return;
    void this.store?.finish(
      this.job.id,
      'stopped',
      { ...this.job, status: 'stopped', finishedAt: new Date().toISOString(), currentName: null },
      { yakuniy: true },
    );
    this.toxtat();
  }

  /** Deploy to'xtatishi: bazada `running` qoladi va vazifa tiklanadi. */
  pauseForShutdown(): void {
    if (!this.isRunning()) return;
    this.toxtat();
  }

  /** Ketayotgan tsikl tugaguncha kutadi; ish yo'q bo'lsa darhol qaytadi. */
  idle(): Promise<void> {
    return this.inflight ?? Promise.resolve();
  }

  private toxtat(): void {
    this.cancelled = true;
    // Bayroqning o'zi yetmaydi: tsikl shu payt pauzada turgan bo'lishi
    // mumkin va bayroq faqat KEYINGI qadamda o'qiladi. Signal pauzani
    // uzadi — "To'xtatish" bosilgan zahoti ish to'xtaydi.
    this.aborter?.abort();
  }

  /**
   * Vazifani boshlaydi va DARHOL qaytadi — yangilash fonda ketadi.
   * Holat `contracts.sync_progress` hodisasi orqali kuzatiladi.
   *
   * Bazaga yozuv BIRINCHI: shu turda tiklanishni kutayotgan vazifa bo'lsa
   * (`ConflictError`), CRM'ga hech qanday so'rov ketmaydi.
   */
  async start(rawClientIds: string[], jobId: string, boshlaganUserId?: string): Promise<BulkContractSyncJob> {
    if (this.isRunning()) throw new Error('Yangilash allaqachon ketyapti');
    // Takrorlar olib tashlanadi: aks holda `total` processed ro'yxatidan
    // katta chiqib, tiklangan vazifa hech qachon "to'liq" ko'rinmasdi va
    // bitta mijoz CRM'dan ikki marta so'ralardi.
    const clientIds = [...new Set(rawClientIds)];

    const now = new Date().toISOString();
    const job: BulkContractSyncJob = {
      id: jobId,
      total: clientIds.length,
      done: 0,
      contracts: 0,
      newPhones: 0,
      notFound: 0,
      failed: 0,
      noContract: 0,
      status: 'running',
      currentName: null,
      startedAt: now,
      finishedAt: null,
      error: null,
      missing: [],
      missingTruncated: 0,
      ...(boshlaganUserId ? { boshlaganUserId } : {}),
    };

    // Sozlama o'chirilgan bo'lsa `syncOne` har bir shartnoma uchun
    // 'disabled' qaytaradi va operator "hammasi xato" degan tushunarsiz
    // natijani ko'rardi. Sababni darhol aytamiz. Bazaga yozilmaydi —
    // tiklanadigan narsa yo'q.
    if (!this.enabled) {
      this.job = job;
      this.patch({
        status: 'failed',
        finishedAt: now,
        error: OCHIQ_SABAB,
      });
      return this.job;
    }

    if (this.store) {
      const input: BulkContractSyncInput = { clientIds };
      await this.store.begin('contract_sync', jobId, input, job);
      // `await` oralig'ida boshqa so'rov boshlab yuborgan bo'lishi mumkin.
      if (this.isRunning()) throw new Error('Yangilash allaqachon ketyapti');
    }

    this.job = job;
    this.launch(clientIds, false);
    return this.job;
  }

  /**
   * Server qayta ishga tushgach saqlangan holatdan davom etadi.
   * Hisoblagichlar to'xtagan joyidan, ro'yxat — yangilanmaganlardan.
   */
  resume(row: BulkJobRow): void {
    const input = row.input as Partial<BulkContractSyncInput> | null;
    const saved = row.snapshot as Partial<BulkContractSyncJob> | null;
    if (!input || !Array.isArray(input.clientIds) || !saved || typeof saved !== 'object' || typeof saved.total !== 'number') {
      throw new Error('Saqlangan yangilash vazifasining shakli noto\'g\'ri');
    }
    // Sozlama deploy orasida o'chirilgan: CRM'ga so'rov yubormaymiz —
    // resumer vazifani `failed` qilib yopadi. Sabab eslab qolinadi:
    // resumer `abandon()` ga umumiy matn beradi, panelda esa aniq sabab
    // (CONTRACTS_SYNC_ENABLED) ko'rinishi kerak.
    if (!this.enabled) {
      this.radSababi = { id: row.id, sabab: OCHIQ_SABAB };
      throw new Error(OCHIQ_SABAB);
    }

    const ishlangan = new Set(row.processedIds);
    const qolgan = input.clientIds.filter((id) => !ishlangan.has(id));
    this.job = {
      ...jobDefaults(row.id, saved),
      status: 'running',
      finishedAt: null,
      error: null,
      currentName: null,
      resumedCount: row.resumedCount + 1,
    };
    this.events.publish({ type: 'contracts.sync_progress', job: this.job });
    log.info({ jami: input.clientIds.length, qolgan: qolgan.length }, 'Ommaviy yangilash davom ettirildi');
    // Birinchi so'rovdan oldin ham pauza: har deploy CRM'ga navbatdan
    // tashqari so'rov chiqarmasin.
    this.launch(qolgan, true);
  }

  /** Davom ettirilmaydigan vazifani yopadi — panel sababni ko'rsin. */
  abandon(row: BulkJobRow, status: 'stopped' | 'failed', reason: string): BulkContractSyncJob {
    const saved =
      row.snapshot && typeof row.snapshot === 'object' && !Array.isArray(row.snapshot)
        ? (row.snapshot as Partial<BulkContractSyncJob>)
        : {};
    // `resume()` shu vazifani aniq sabab bilan rad etgan bo'lsa, o'sha
    // sabab ko'rsatiladi (bir martalik — boshqa vazifaga o'tmasin).
    const aniq = this.radSababi?.id === row.id ? this.radSababi.sabab : null;
    this.radSababi = null;
    // `resumedCount` ATAYLAB yo'q: "davom etdi" qaydi yopilish sababi bilan
    // birga chiqmasin.
    this.job = {
      ...jobDefaults(row.id, saved),
      status,
      finishedAt: new Date().toISOString(),
      currentName: null,
      error: aniq ?? reason,
    };
    this.events.publish({ type: 'contracts.sync_progress', job: this.job });
    return this.job;
  }

  private launch(clientIds: string[], pauseFirst: boolean): void {
    this.cancelled = false;
    // Har ish uchun YANGI kontroller: eskisi to'xtatilgan bo'lsa uning
    // signali abadiy "abort" holatida qoladi va yangi ish pauzasiz
    // o'tib ketardi.
    this.aborter = new AbortController();
    // `run()` ichida yuqori darajali `try/catch` yo'q — `findById` va
    // `findByClientId` ushlanmagan holda bazaga to'g'ridan-to'g'ri ketadi.
    // Shu yerda tutmasak, bitta bazaviy uzilish butun protsessni
    // "unhandled rejection" bilan yiqitishi mumkin, ish yozuvi esa abadiy
    // "running"da qolib, server qayta ishga tushmaguncha har qanday
    // keyingi urinish "Yangilash allaqachon ketyapti" deb rad etilardi.
    const ish = this.run(clientIds, pauseFirst)
      .catch((err: unknown) => {
        log.error({ err }, 'Ommaviy yangilashda kutilmagan xato');
        // Ish allaqachon yakunlangan bo'lsa tegmaymiz — bu yerga faqat
        // tsikldan tashqarida (masalan birinchi so'rovdan oldin) sodir
        // bo'lgan xato uchun kelamiz.
        if (this.job?.status !== 'running') return;
        this.yakunla({
          status: 'failed',
          finishedAt: new Date().toISOString(),
          currentName: null,
          error: "Kutilmagan xato — yangilash to'xtatildi, qaytadan urinib ko'ring",
        });
      })
      .finally(() => {
        if (this.inflight === ish) this.inflight = null;
      });
    this.inflight = ish;
  }

  private patch(changes: Partial<BulkContractSyncJob>): void {
    if (!this.job) return;
    this.job = { ...this.job, ...changes };
    this.events.publish({ type: 'contracts.sync_progress', job: this.job });
  }

  /**
   * Yakuniy holat: e'lon qiladi va bazaga yozadi. Yakuniy EMAS — deploy
   * paytidagi "to'xtatildi" tashlanadi va vazifa tiklanadi; operator
   * to'xtatishi `stop()` da alohida yoziladi.
   */
  private yakunla(changes: Partial<BulkContractSyncJob>): void {
    this.patch(changes);
    if (this.job) void this.store?.finish(this.job.id, this.job.status, this.job);
  }

  /**
   * Holatni bazaga yozadi. `processedId` — hamma shartnomasi yangilangan
   * mijoz: tiklanishda u tashlab ketiladi. Rad etmaydi.
   */
  private saqla(processedId: string | null = null): Promise<void> {
    if (!this.store || !this.job || this.job.status !== 'running') return Promise.resolve();
    return this.store.save(this.job.id, this.job, processedId);
  }

  /** Diqqat ro'yxatiga yozadi yoki cheklovdan oshganini sanaydi. */
  private withMiss(
    miss: BulkContractSyncMiss,
  ): Pick<BulkContractSyncJob, 'missing' | 'missingTruncated'> {
    const missing = this.job?.missing ?? [];
    const truncated = this.job?.missingTruncated ?? 0;
    if (missing.length >= MISS_LIMIT) return { missing, missingTruncated: truncated + 1 };
    return { missing: [...missing, miss], missingTruncated: truncated };
  }

  /**
   * Kechasigi to'liq yangilash ketayotgan bo'lsa u tugaguncha kutadi.
   * `false` — kutish paytida to'xtatildi (so'rov yuborilmasin).
   */
  private async kechasiginiKut(): Promise<boolean> {
    let aytildi = false;
    while (this.nightlyBusy()) {
      if (this.cancelled) return false;
      if (!aytildi) {
        log.info("Kechasigi to'liq yangilash ketyapti — tugashini kutamiz");
        aytildi = true;
      }
      // Kamida 1 soniya: `delayMs` 0 bo'lsa ham bo'sh aylanib qolmasin.
      await sleep(Math.max(this.delayMs, 1000), this.aborter?.signal);
    }
    return !this.cancelled;
  }

  private async run(clientIds: string[], pauseFirst: boolean): Promise<void> {
    log.info({ total: clientIds.length, delayMs: this.delayMs }, 'Ommaviy yangilash boshlandi');

    // Pauza so'rovlar ORASIGA qo'yiladi: birinchisidan oldin ham,
    // oxirgisidan keyin ham kutish shart emas. Tiklangan ishda esa
    // birinchi so'rovdan oldin ham kutiladi — oldingi jarayonning oxirgi
    // so'rovi bilan orasida pauza bo'lsin.
    let requests = pauseFirst ? 1 : 0;

    for (const clientId of clientIds) {
      // Terminal patch tsikldan TASHQARIDA, bir marta yuboriladi (pastga
      // qarang) — shu yerda faqat navbatdagi mijozga o'tishni to'xtatamiz.
      if (this.cancelled) break;

      const client = await this.clients.findById(clientId);
      if (!client) {
        // Sahifa ochilgandan tugma bosilgunicha mijoz o'chirilgan bo'lishi
        // mumkin. Ismi yo'q — id ko'rsatilmasa panelda ismsiz "Xato: 1"
        // chiqib, operator kimni tekshirishni bilmay qolardi.
        this.patch({
          done: (this.job?.done ?? 0) + 1,
          failed: (this.job?.failed ?? 0) + 1,
          ...this.withMiss({ clientId, name: clientId, reason: 'error' }),
        });
        await this.saqla(clientId);
        continue;
      }

      this.patch({ currentName: client.fullName });

      const owned = await this.contracts.findByClientId(clientId);
      if (!owned.length) {
        this.patch({
          done: (this.job?.done ?? 0) + 1,
          noContract: (this.job?.noContract ?? 0) + 1,
          ...this.withMiss({ clientId, name: client.fullName, reason: 'no_contract' }),
        });
        await this.saqla(clientId);
        continue;
      }

      let contracts = this.job?.contracts ?? 0;
      // Deploy shu mijozning shartnomalari orasida kelgan bo'lsa, tiklashda
      // u to'liq qayta yangilanadi va deploydan oldin qo'shilgan raqamlar
      // endi "yangi" emas — `newPhones` biroz kam chiqadi. Bu faqat
      // ko'rinish: raqamlarning o'zi allaqachon bazaga yozilgan.
      let newPhones = this.job?.newPhones ?? 0;
      // Mijoz sanoqqa ko'pi bilan bir marta tushadi. Shartnomalari
      // turlicha tugasa xato ustun turadi: `not_found` aniq javob,
      // `error` esa qayta urinish kerakligini bildiradi.
      let reason: BulkContractSyncReason | null = null;

      for (const contract of owned) {
        if (this.cancelled) break;
        if (!(await this.kechasiginiKut())) break;
        if (requests > 0 && this.delayMs > 0) {
          await sleep(this.delayMs, this.aborter?.signal);
          // `sleep` bekor qilingan signal bilan ham `resolve` qiladi
          // (`reject` emas), shuning uchun pauzadan "uyg'ongach" ham
          // bayroqni qayta tekshiramiz — aks holda to'xtatishdan KEYIN
          // ham bitta ortiqcha so'rov CRM'ga ketib qolardi.
          if (this.cancelled) break;
        }
        requests += 1;

        try {
          const result = await this.sync.syncOne(contract.id);
          if (result.outcome === 'ok') {
            contracts += 1;
            newPhones += result.newPhones.length;
          } else if (result.outcome === 'not_found') {
            reason ??= 'not_found';
          } else {
            // 'error' va kutilmagan 'disabled' — ikkalasi ham qayta
            // urinish kerakligini bildiradi.
            reason = 'error';
          }
        } catch (err) {
          // `syncOne` xatoni o'zi yutadi; bu yer faqat kutilmagan holat
          // uchun — bitta shartnoma butun vazifani yiqitmasligi kerak.
          log.warn({ clientId, contractId: contract.id, err }, 'Shartnomani yangilashda xato');
          reason = 'error';
        }
      }

      // Shu mijozning shartnomalari orasida to'xtatilgan bo'lsa, uni
      // "done" deb sanamaymiz — qolgan shartnomalari yangilanmay qoldi va
      // operator "qolganlarini" qayta belgilasa, bu mijoz jimgina raqamsiz
      // qolib ketardi. Terminal patch pastda bir marta yuboriladi.
      if (this.cancelled) break;

      const counts = {
        done: (this.job?.done ?? 0) + 1,
        contracts,
        newPhones,
      };

      if (reason === null) {
        this.patch(counts);
      } else if (reason === 'error') {
        this.patch({
          ...counts,
          failed: (this.job?.failed ?? 0) + 1,
          ...this.withMiss({ clientId, name: client.fullName, reason: 'error' }),
        });
      } else {
        this.patch({
          ...counts,
          notFound: (this.job?.notFound ?? 0) + 1,
          ...this.withMiss({ clientId, name: client.fullName, reason: 'not_found' }),
        });
      }
      await this.saqla(clientId);
    }

    // Yagona terminal patch: tsikl tabiiy tugagandami yoki `cancelled`
    // bayrog'i bilan uzilganmi — ikkala holat ham shu yerda hal qilinadi.
    // Oxirgi mijozni ishlayotganda "To'xtatish" bosilsa ham (tsikl shunchaki
    // ro'yxat oxiriga yetib to'xtaydi), holat "done" emas "stopped" bo'lishi
    // kerak — aks holda operator "tugadi" deb o'ylardi.
    const finishedAt = new Date().toISOString();
    if (this.cancelled) {
      this.yakunla({ status: 'stopped', finishedAt, currentName: null });
      log.info({ done: this.job?.done }, "Yangilash to'xtatildi");
    } else {
      this.yakunla({ status: 'done', finishedAt, currentName: null });
      log.info(
        { done: this.job?.done, contracts: this.job?.contracts, newPhones: this.job?.newPhones },
        'Ommaviy yangilash tugadi',
      );
    }
  }
}

/**
 * Saqlangan snapshot'dan to'liq job — yetishmagan maydon sukut bilan.
 * Qo'lda tahrir yoki kelajakdagi shakl hisoblagichni `NaN` qilmasin.
 */
function jobDefaults(id: string, s: Partial<BulkContractSyncJob>): BulkContractSyncJob {
  const son = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  return {
    id,
    total: son(s.total),
    done: son(s.done),
    contracts: son(s.contracts),
    newPhones: son(s.newPhones),
    notFound: son(s.notFound),
    failed: son(s.failed),
    noContract: son(s.noContract),
    status: 'running',
    currentName: null,
    startedAt: typeof s.startedAt === 'string' ? s.startedAt : new Date().toISOString(),
    finishedAt: null,
    error: null,
    missing: Array.isArray(s.missing) ? s.missing : [],
    missingTruncated: son(s.missingTruncated),
    ...(typeof s.boshlaganUserId === 'string' ? { boshlaganUserId: s.boshlaganUserId } : {}),
  };
}
