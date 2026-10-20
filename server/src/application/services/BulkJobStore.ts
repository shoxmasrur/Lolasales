import type {
  BulkJobKind,
  BulkJobStatus,
  IBulkJobRepository,
} from '@/domain/repositories/IBulkJobRepository';
import type { IClock } from '@/domain/services/support';
import { ConflictError } from '@/shared/errors';
import { sleep } from '@/shared/datetime';
import { childLogger } from '@/shared/logger';

const log = childLogger('bulk-job-store');

/** `finish` jami shuncha marta urinadi — yakuniy yozuv yo'qolsa qator `running` bo'lib qotadi. */
const FINISH_URINISHLARI = 3;

/**
 * Ommaviy vazifalar holatini bazaga yozuvchi yagona eshik.
 *
 * Uch qoida:
 *   1. Yozuvlar KETMA-KET bajariladi (bitta navbat) — parallel oqimlar
 *      holatni bir-birining ustidan eski qiymat bilan bosib ketmasin.
 *   2. `save`/`finish`/`savePlan` HECH QACHON rad javobi bermaydi: holatni
 *      saqlab bo'lmagani mijozlarga xabar yuborishni to'xtatmasligi kerak.
 *      Yomon holatda tiklanishda bir necha mijoz qayta ko'riladi.
 *   3. Server to'xtayotganda (`beginShutdown`) "to'xtatildi" holati bazaga
 *      YOZILMAYDI — qator `running` bo'lib qoladi va yuklanishda vazifa
 *      davom ettiriladi. Operator "To'xtatish"ni bosgani esa oddiy vaqtda
 *      yoziladi va yakuniy.
 */
export class BulkJobStore {
  private tail: Promise<void> = Promise.resolve();
  private shuttingDown = false;
  private frozen = false;
  /**
   * Shu jarayonda tirik vazifalar (id → tur). Bazada `running`, lekin bu
   * ro'yxatda yo'q qator — yetim: uning egasi yo'q va u hech qachon
   * yopilmaydi (masalan yakuniy yozuv baza uzilishida yo'qolgan).
   */
  private readonly faol = new Map<string, BulkJobKind>();
  /** Yuklanishdagi tiklash tugadimi — undan oldin har `running` qator egasini kutyapti. */
  private tiklashTugadi = false;

  constructor(
    private readonly repo: IBulkJobRepository,
    private readonly clock: Pick<IClock, 'todayIso'>,
    /** `finish` qayta urinishlari orasidagi asosiy oraliq (testlarda 1 ms). */
    private readonly finishRetryMs = 500,
  ) {}

  /**
   * Yangi vazifa boshlashdan OLDINGI tekshiruv.
   *
   * Xotiradagi `isRunning()` yetmaydi: server ko'tarilgandan Telegram
   * akkauntlar ulanguncha (~1 daqiqa) vazifa hali tiklanmagan, lekin
   * bazada `running` turibdi.
   *
   * Tiklash tugagach egasi yo'q `running` qator yetim hisoblanadi va shu
   * yerda yopiladi: aks holda shu turdagi har yangi vazifa keyingi qayta
   * ishga tushishgacha rad etilardi, o'shanda esa yopilgan vazifa
   * tiklanib ketardi.
   */
  async assertFree(kind: BulkJobKind): Promise<void> {
    // Endigina tugagan vazifaning `finish` i navbatda bo'lishi mumkin —
    // kutmasak uni yetim deb `failed` qilib qo'yardik.
    await this.tail;
    const row = await this.repo.findRunning(kind);
    if (!row) return;
    if (this.tiklashTugadi && !this.faol.has(row.id) && !this.shuttingDown) {
      // Qaror navbat ICHIDA qayta tekshiriladi: `findRunning` kutilayotganda
      // shu jarayondagi vazifa `finish()` ni navbatga qo'ygan bo'lishi
      // mumkin (u `faol` dan darhol o'chadi). Unda qator yetim emas — u
      // endigina tugagan, va uning `done` yozuvi `failed` bilan bosib
      // ketilmasligi kerak. Shuning uchun yozuv ham faqat hali `running`
      // qatorga tushadi (`onlyIfRunning`).
      await this.navbatga('yetimniYop', async () => {
        if (this.faol.has(row.id) || this.shuttingDown) return;
        log.warn({ id: row.id, tur: kind }, 'Egasi yo\'q running vazifa yopildi');
        // Baza shu payt ham uzilgan bo'lishi mumkin (yetim aynan shundan paydo bo'ladi) — qayta uriniladi.
        await this.qaytaUrin(() =>
          this.repo.finish(row.id, 'failed', yetimSnapshot(row.snapshot), { onlyIfRunning: true }));
      });
      return;
    }
    throw new ConflictError(
      'Oldingi vazifa hali yopilmagan yoki server yangilangach tiklanmoqda — bir daqiqadan keyin urinib ko\'ring',
    );
  }

  /** Rad etishi MUMKIN — chaqiruvchi vazifani boshlamasligi kerak. */
  async begin(kind: BulkJobKind, id: string, input: unknown, snapshot: unknown): Promise<void> {
    if (this.shuttingDown) {
      throw new ConflictError('Server yangilanmoqda — bir daqiqadan keyin urinib ko\'ring');
    }
    await this.repo.insert({ id, kind, input, snapshot, startedDay: this.clock.todayIso() });
    this.faol.set(id, kind);
  }

  savePlan(id: string, plan: unknown): Promise<void> {
    return this.navbatga('savePlan', () => this.repo.savePlan(id, plan));
  }

  save(id: string, snapshot: unknown, processedId: string | null = null): Promise<void> {
    return this.navbatga('save', () => this.repo.save(id, snapshot, processedId));
  }

  /**
   * `yakuniy` — operator niyati (yoki tiklashdagi yopish): server
   * to'xtayotgan bo'lsa ham yoziladi. Usiz deploy paytidagi "to'xtatildi"
   * tashlanadi, aks holda vazifa tiklanmasdi.
   */
  finish(
    id: string,
    status: BulkJobStatus,
    snapshot: unknown,
    opts: { yakuniy?: boolean } = {},
  ): Promise<void> {
    if (this.shuttingDown && status === 'stopped' && !opts.yakuniy) return Promise.resolve();
    // Xotirada vazifa yopildi — bazaga yozilmasa ham u endi yetim.
    this.faol.delete(id);
    return this.navbatga('finish', () => this.qaytaUrin(() => this.repo.finish(id, status, snapshot)));
  }

  /** Tiklanish qaydi — `freeze` bilan bitta navbatda, rad etmaydi. */
  markResumed(id: string, kind: BulkJobKind, crashed: boolean): Promise<void> {
    this.faol.set(id, kind);
    return this.navbatga('markResumed', () => this.repo.markResumed(id, crashed));
  }

  isShuttingDown(): boolean {
    return this.shuttingDown;
  }

  /** `BulkJobResumer.run()` oxirida chaqiriladi. */
  tiklashYakunlandi(): void {
    this.tiklashTugadi = true;
  }

  /** SIGTERM kelgan zahoti, vazifalarni to'xtatishdan OLDIN chaqiriladi. */
  beginShutdown(): void {
    this.shuttingDown = true;
  }

  /**
   * Vazifalar to'xtab bo'lgach: navbatni tugatadi, `running` qatorlarni
   * "tartibli to'xtadi" deb belgilaydi va shundan keyingi yozuvlarni
   * tashlaydi. Takror chaqirish xavfsiz.
   */
  async freeze(): Promise<void> {
    if (this.frozen) {
      await this.tail;
      return;
    }
    this.shuttingDown = true;
    const oxirgi = this.navbatga('markCleanStop', () => this.repo.markCleanStop());
    this.frozen = true;
    await oxirgi;
  }

  private navbatga(amal: string, fn: () => Promise<void>): Promise<void> {
    if (this.frozen) return Promise.resolve();
    this.tail = this.tail.then(fn).catch((err: unknown) => {
      log.error({ err, amal }, 'Ommaviy vazifa holatini saqlab bo\'lmadi — vazifa davom etadi');
    });
    return this.tail;
  }

  private async qaytaUrin(fn: () => Promise<void>): Promise<void> {
    for (let urinish = 1; ; urinish += 1) {
      try {
        await fn();
        return;
      } catch (err) {
        if (urinish >= FINISH_URINISHLARI) throw err;
        log.warn({ err, urinish }, 'Yakuniy holatni yozib bo\'lmadi — qayta urinilmoqda');
        await sleep(this.finishRetryMs * urinish);
      }
    }
  }
}

/** Yetim qatorning yakuniy snapshot'i — panel sababni ko'rsin. */
function yetimSnapshot(snapshot: unknown): unknown {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return snapshot;
  return {
    ...(snapshot as Record<string, unknown>),
    status: 'failed',
    error: 'Vazifa yopilmay qolgan edi — avtomatik yopildi',
    finishedAt: new Date().toISOString(),
    currentName: null,
  };
}
