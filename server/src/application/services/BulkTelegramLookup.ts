import type { IClientRepository } from '@/domain/repositories/IClientRepository';
import type { ClientTelegramResolver } from '@/application/services/ClientTelegramResolver';
import type { IEventBus } from '@/domain/services/support';
import { TelegramError } from '@/shared/errors';
import { sleep } from '@/shared/datetime';
import { childLogger } from '@/shared/logger';
import type { BulkJobRow } from '@/domain/repositories/IBulkJobRepository';
import type { BulkJobStore } from '@/application/services/BulkJobStore';
import type { ResumableJob } from '@/application/services/BulkJobResumer';

const log = childLogger('bulk-lookup');

export type BulkLookupStatus = 'running' | 'done' | 'stopped' | 'failed';

export interface BulkLookupJob {
  readonly id: string;
  readonly total: number;
  readonly done: number;
  /** Telegram profili topildi va ism mos keldi. */
  readonly found: number;
  /** Topildi, lekin ism mos kelmadi — xodim tasdiqlashi kerak. */
  readonly needsReview: number;
  readonly notFound: number;
  readonly failed: number;
  readonly status: BulkLookupStatus;
  /** Hozir qaysi mijoz tekshirilyapti (progressda ko'rsatiladi). */
  readonly currentName: string | null;
  readonly startedAt: string;
  readonly finishedAt: string | null;
  /**
   * To'xtash sababi: FLOOD_WAIT, akkaunt qidira olmasligi (kunlik qidiruv
   * chegarasi, o'chirilgan/bloklangan akkaunt) yoki boshqa xato.
   */
  readonly error: string | null;
  /** Server qayta ishga tushgach necha marta davom ettirilgan. */
  readonly resumedCount?: number;
  /**
   * Vazifani kim boshlagan (`users.id`). Obyekt cheklovi: cheklangan
   * foydalanuvchiga boshqaning vazifasi ismsiz ko'rsatiladi va u uni
   * to'xtata olmaydi. Eski (maydonsiz) vazifa — egasi noma'lum.
   */
  readonly boshlaganUserId?: string | null;
}

/** `bulk_jobs.input` dagi shakl. */
export interface BulkLookupInput {
  readonly clientIds: string[];
}

/**
 * Bir nechta mijozni Telegramdan KETMA-KET tekshiradi.
 *
 * NEGA KETMA-KET VA PAUZA BILAN: Telegram telefon qidiruvini qattiq
 * cheklaydi. Bir zumda o'nlab so'rov yuborilsa akkaunt FLOOD_WAIT ga
 * tushadi va bir necha soat (ba'zan kun) hech narsa yubora olmaydi —
 * bu butun undirish ishini to'xtatadi.
 *
 * Shuning uchun: bitta-bitta, orasida pauza bilan. FLOOD_WAIT kelsa
 * vazifa DARHOL to'xtaydi — davom etish cheklovni faqat uzaytiradi.
 * Akkauntning o'zi qidira olmasa ham (kunlik qidiruv chegarasi to'lgan,
 * o'chirilgan, spam filtrida) vazifa to'xtaydi va sabab yoziladi: bu
 * holat kun oxirigacha o'zgarmaydi, davom etish faqat vaqt yo'qotadi.
 *
 * Vazifa holati `bulk_jobs` ga yozib boriladi (`BulkJobStore`): server
 * qayta ishga tushsa (deploy), `BulkJobResumer` uni `resume()` orqali
 * qolgan mijozlardan davom ettiradi.
 */
export class BulkTelegramLookup implements ResumableJob {
  readonly kind = 'lookup' as const;
  /** Kunlik qidiruv chegarasiga bog'liq — ertasiga davom ettirilmaydi. */
  readonly sameDayOnly = true;

  private job: BulkLookupJob | null = null;
  private cancelled = false;
  private aborter: AbortController | null = null;
  /** Ketayotgan tsikl — to'xtash (`main.ts`) shuni kutadi. */
  private inflight: Promise<void> | null = null;

  constructor(
    private readonly clients: IClientRepository,
    private readonly resolver: ClientTelegramResolver,
    private readonly events: IEventBus,
    /** Ikki qidiruv orasidagi pauza. */
    private readonly delayMs: number,
    /** `null` — holat saqlanmaydi (testlar). */
    private readonly store: BulkJobStore | null = null,
  ) {}

  current(): BulkLookupJob | null {
    return this.job;
  }

  isRunning(): boolean {
    return this.job?.status === 'running';
  }

  /**
   * Operator "To'xtatish"ni bosdi — YAKUNIY.
   *
   * Niyat bazaga DARHOL yoziladi: tsikl bayroqni faqat keyingi mijozga
   * o'tishda o'qiydi; shu oraliqda deploy kelsa (`beginShutdown`),
   * tsikldagi "to'xtatildi" yozuvi tashlanardi va vazifa server
   * ko'tarilgach davom etib ketardi.
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

  private toxtat(): void {
    this.cancelled = true;
    // Bayroqning o'zi yetmaydi: tsikl shu payt mijozlar orasidagi pauzada
    // turgan bo'lishi mumkin va bayroq faqat KEYINGI mijozga o'tishda
    // o'qiladi. Signal pauzani uzadi.
    this.aborter?.abort();
  }

  /** Ketayotgan tsikl tugaguncha kutadi; ish yo'q bo'lsa darhol qaytadi. */
  idle(): Promise<void> {
    return this.inflight ?? Promise.resolve();
  }

  /**
   * Vazifani boshlaydi va tekshiruv fonda ketadi.
   * Holat `telegram.lookup_progress` hodisasi orqali kuzatiladi.
   *
   * Bazaga yozuv BIRINCHI: shu turda tiklanishni kutayotgan vazifa bo'lsa
   * (`ConflictError`), bu yerda hech narsa boshlanmaydi.
   */
  async start(clientIds: string[], jobId: string, boshlaganUserId?: string): Promise<BulkLookupJob> {
    if (this.isRunning()) throw new Error('Tekshiruv allaqachon ketyapti');

    const job: BulkLookupJob = {
      id: jobId,
      total: clientIds.length,
      done: 0,
      found: 0,
      needsReview: 0,
      notFound: 0,
      failed: 0,
      status: 'running',
      currentName: null,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      error: null,
      ...(boshlaganUserId ? { boshlaganUserId } : {}),
    };
    const input: BulkLookupInput = { clientIds };
    await this.store?.begin('lookup', jobId, input, job);
    // `await` oralig'ida boshqa so'rov boshlab yuborgan bo'lishi mumkin.
    if (this.isRunning()) throw new Error('Tekshiruv allaqachon ketyapti');

    this.job = job;
    this.launch(clientIds, false);
    return job;
  }

  /**
   * Server qayta ishga tushgach saqlangan holatdan davom etadi.
   * Hisoblagichlar to'xtagan joyidan, ro'yxat — qayta ishlanmaganlardan.
   */
  resume(row: BulkJobRow): void {
    const input = row.input as Partial<BulkLookupInput> | null;
    const saved = row.snapshot as Partial<BulkLookupJob> | null;
    if (!input || !Array.isArray(input.clientIds) || !saved || typeof saved.total !== 'number') {
      throw new Error('Saqlangan qidiruv vazifasining shakli noto\'g\'ri');
    }

    const ishlangan = new Set(row.processedIds);
    const qolgan = input.clientIds.filter((id) => !ishlangan.has(id));

    this.job = {
      ...(saved as BulkLookupJob),
      id: row.id,
      status: 'running',
      finishedAt: null,
      error: null,
      currentName: null,
      resumedCount: row.resumedCount + 1,
    };
    this.events.publish({ type: 'telegram.lookup_progress', job: this.job });
    log.info({ jami: input.clientIds.length, qolgan: qolgan.length }, 'Ommaviy tekshiruv davom ettirildi');
    // Birinchi qidiruv oldidan ham pauza: har deploy navbatdan tashqari
    // so'rov chiqarsa, tez-tez deploy FLOOD_WAIT ga olib kelardi.
    this.launch(qolgan, true);
  }

  /** Davom ettirilmaydigan vazifani yopadi — panel sababni ko'rsin. */
  abandon(row: BulkJobRow, status: 'stopped' | 'failed', reason: string): BulkLookupJob {
    const saved = (row.snapshot ?? {}) as Partial<BulkLookupJob>;
    const hozir = new Date().toISOString();
    this.job = {
      id: row.id,
      total: saved.total ?? 0,
      done: saved.done ?? 0,
      found: saved.found ?? 0,
      needsReview: saved.needsReview ?? 0,
      notFound: saved.notFound ?? 0,
      failed: saved.failed ?? 0,
      status,
      currentName: null,
      startedAt: saved.startedAt ?? hozir,
      finishedAt: hozir,
      error: reason,
      ...(typeof saved.boshlaganUserId === 'string' ? { boshlaganUserId: saved.boshlaganUserId } : {}),
      // `resumedCount` ATAYLAB yo'q: panel "davom etdi" qaydini va
      // "davom ettirilmadi" sababini birga ko'rsatib qo'ymasin.
    };
    this.events.publish({ type: 'telegram.lookup_progress', job: this.job });
    return this.job;
  }

  private launch(clientIds: string[], pauseFirst: boolean): void {
    this.cancelled = false;
    // Har ish uchun YANGI kontroller: eskisi to'xtatilgan bo'lsa uning
    // signali abadiy "abort" holatida qoladi va yangi ish pauzasiz o'tib
    // ketardi.
    this.aborter = new AbortController();
    const ish = this.run(clientIds, pauseFirst)
      .catch(async (err: unknown) => {
        log.error({ err }, 'Ommaviy tekshiruvda kutilmagan xato');
        if (this.job?.status !== 'running') return;
        await this.patch({
          status: 'failed',
          finishedAt: new Date().toISOString(),
          currentName: null,
          error: 'Kutilmagan xato — tekshiruv to\'xtatildi, qaytadan urinib ko\'ring',
        });
      })
      .finally(() => {
        if (this.inflight === ish) this.inflight = null;
      });
    this.inflight = ish;
  }

  /**
   * Holatni yangilaydi, e'lon qiladi va bazaga yozadi.
   *
   * `processedId` — shu qadamda qayta ishlab bo'lingan mijoz: tiklanishda
   * u tashlab ketiladi. Qaytgan va'da hech qachon rad etmaydi; mijoz
   * tugaganda u KUTILADI (keyingi pauzadan oldin holat bazada bo'lsin).
   */
  private patch(changes: Partial<BulkLookupJob>, processedId: string | null = null): Promise<void> {
    if (!this.job) return Promise.resolve();
    this.job = { ...this.job, ...changes };
    this.events.publish({ type: 'telegram.lookup_progress', job: this.job });
    if (!this.store) return Promise.resolve();
    return this.job.status === 'running'
      ? this.store.save(this.job.id, this.job, processedId)
      : this.store.finish(this.job.id, this.job.status, this.job);
  }

  private async run(clientIds: string[], pauseFirst: boolean): Promise<void> {
    log.info({ total: clientIds.length, delayMs: this.delayMs }, 'Ommaviy tekshiruv boshlandi');

    if (pauseFirst && clientIds.length) await sleep(this.delayMs, this.aborter?.signal);

    for (let i = 0; i < clientIds.length; i += 1) {
      if (this.cancelled) {
        await this.patch({ status: 'stopped', finishedAt: new Date().toISOString(), currentName: null });
        log.info({ done: this.job?.done }, 'Tekshiruv to\'xtatildi');
        return;
      }

      const id = clientIds[i]!;
      const client = await this.clients.findById(id);
      if (!client) {
        await this.patch({ done: (this.job?.done ?? 0) + 1, failed: (this.job?.failed ?? 0) + 1 }, id);
        continue;
      }

      void this.patch({ currentName: client.fullName });

      try {
        // `force` — allaqachon topilgan bo'lsa ham qaytadan tekshiradi:
        // xodim aynan shuni so'rab belgilagan.
        const outcome = await this.resolver.resolve(client, { force: true, purpose: 'lookup' });

        // Akkaunt qidira olmaydi — vazifa DARHOL to'xtaydi.
        //
        // NEGA: sabab (kunlik qidiruv chegarasi, o'chirilgan akkaunt,
        // flood-wait, spam filtri) kun oxirigacha o'zgarmaydi. Davom
        // etilsa 1700 ta mijoz ketma-ket "xato" bo'lib sanaladi va har
        // biridan keyin baribir pauza ushlanadi — ~2 soat behuda kutish,
        // oxirida operator faqat "N ta xato" ni ko'radi.
        //
        // Sabab `error` maydoniga yoziladi, FLOOD_WAIT bilan bir xil
        // naqshda: operator nimani tuzatishi kerakligini darhol ko'rsin.
        //
        // Kelishuv: mijozlar bir nechta akkauntga taqsimlangan bo'lsa,
        // bitta akkauntning muammosi butun vazifani to'xtatadi. Ataylab
        // shunday — noto'g'ri sozlangan akkauntni jimgina o'tkazib yuborib
        // yarim natija berishdan ko'ra, to'xtab sababni aytish yaxshi:
        // operator akkauntni tuzatib, qolganini qaytadan belgilaydi.
        if (
          outcome.kind === 'account_unavailable' ||
          outcome.kind === 'no_account' ||
          outcome.kind === 'not_assigned'
        ) {
          const reason =
            outcome.kind === 'account_unavailable'
              ? outcome.reason
              : 'Mijozga Telegram akkaunt biriktirilmagan';
          await this.patch({
            status: 'failed',
            finishedAt: new Date().toISOString(),
            currentName: null,
            failed: (this.job?.failed ?? 0) + 1,
            done: (this.job?.done ?? 0) + 1,
            error: `${reason} — tekshiruv to'xtatildi`,
          });
          log.warn({ done: this.job?.done, reason }, 'Akkaunt qidira olmaydi — tekshiruv to\'xtatildi');
          return;
        }

        const counts = {
          found: this.job?.found ?? 0,
          needsReview: this.job?.needsReview ?? 0,
          notFound: this.job?.notFound ?? 0,
          failed: this.job?.failed ?? 0,
        };
        if (outcome.kind === 'ok') counts.found += 1;
        else if (outcome.kind === 'name_mismatch' || outcome.kind === 'profile_taken') counts.needsReview += 1;
        else counts.notFound += 1;

        await this.patch({ ...counts, done: (this.job?.done ?? 0) + 1 }, id);
      } catch (err) {
        // FLOOD_WAIT — davom etish cheklovni faqat uzaytiradi.
        // `code` EMAS, `telegramCode`: `TelegramError.code` har doim
        // 'TELEGRAM_ERROR', shuning uchun `err.code === 'FLOOD_WAIT'`
        // hech qachon rost bo'lmaydi va tekshiruv cheklov ustidan
        // urinishda davom etib, cheklovni uzaytirardi.
        if (err instanceof TelegramError && err.telegramCode === 'FLOOD_WAIT') {
          await this.patch({
            status: 'failed',
            finishedAt: new Date().toISOString(),
            currentName: null,
            error: `${err.message} — tekshiruv to'xtatildi, keyinroq davom ettiring`,
          });
          log.warn({ done: this.job?.done }, 'FLOOD_WAIT — tekshiruv to\'xtatildi');
          return;
        }

        log.warn({ clientId: id, err }, 'Mijozni tekshirishda xato');
        await this.patch({ done: (this.job?.done ?? 0) + 1, failed: (this.job?.failed ?? 0) + 1 }, id);
      }

      // Oxirgisidan keyin kutish shart emas.
      //
      // Signal beriladi, chunki pauza uzun bo'lishi mumkin: usiz to'xtatish
      // faqat pauza tugagach sezilardi. Signal kelsa `sleep` darhol
      // qaytadi va tsikl boshidagi bayroq tekshiruvi ishni toza
      // "to'xtatildi" holatida yakunlaydi.
      if (i < clientIds.length - 1) await sleep(this.delayMs, this.aborter?.signal);
    }

    await this.patch({ status: 'done', finishedAt: new Date().toISOString(), currentName: null });
    log.info(
      { found: this.job?.found, needsReview: this.job?.needsReview, notFound: this.job?.notFound },
      'Ommaviy tekshiruv tugadi',
    );
  }
}
