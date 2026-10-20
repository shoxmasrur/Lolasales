import type {
  BulkJobKind,
  BulkJobRow,
  IBulkJobRepository,
} from '@/domain/repositories/IBulkJobRepository';
import type { BulkJobStore } from '@/application/services/BulkJobStore';
import type { IClock } from '@/domain/services/support';
import { childLogger } from '@/shared/logger';

const log = childLogger('bulk-job-resumer');

/** Shuncha marta ketma-ket AVARIYA bilan uzilgan vazifa yopiladi. */
export const CRASH_LIMIT = 3;
/** Tugagan vazifalar shuncha kun saqlanadi. */
export const RETENTION_DAYS = 30;

export type ResumeDecision =
  | { readonly action: 'resume'; readonly crashed: boolean }
  | { readonly action: 'close'; readonly status: 'stopped' | 'failed'; readonly reason: string };

/**
 * `running` bo'lib qolgan vazifa davom ettiriladimi.
 *
 * Avariya himoyasi faqat TARTIBSIZ uzilishni sanaydi (`cleanStop = false`):
 * vazifaning o'zi jarayonni yiqitayotgan bo'lsa, systemd uni har 5 soniyada
 * qayta ko'tarib, cheksiz aylanardi. Deploy (tartibli to'xtash) hech qachon
 * sanalmaydi — xabarlar orasidagi uzun pauzada bir necha marta deploy
 * qilish sog'lom vazifani yopib qo'ymasligi kerak.
 */
export function resumeDecision(
  row: Pick<BulkJobRow, 'cleanStop' | 'crashResumes' | 'startedDay'>,
  todayIso: string,
  sameDayOnly: boolean,
): ResumeDecision {
  if (sameDayOnly && row.startedDay !== todayIso) {
    return {
      action: 'close',
      status: 'stopped',
      reason: 'Server qayta ishga tushdi; vazifa oldingi kunda boshlangan — davom ettirilmadi',
    };
  }
  const crashed = !row.cleanStop;
  if (crashed && row.crashResumes + 1 >= CRASH_LIMIT) {
    return {
      action: 'close',
      status: 'failed',
      reason: 'Vazifa uch marta ketma-ket avariya bilan uzildi — davom ettirilmadi',
    };
  }
  return { action: 'resume', crashed };
}

/** Tiklanishni biladigan ommaviy vazifa. */
export interface ResumableJob {
  readonly kind: BulkJobKind;
  /** `true` — boshqa kunda davom ettirilmaydi (kunlik limitga bog'liq vazifa). */
  readonly sameDayOnly: boolean;
  /** Saqlangan holatdan davom etadi. Shakl noto'g'ri bo'lsa xato TASHLAYDI. */
  resume(row: BulkJobRow): void;
  /** Vazifani xotirada yopadi va bazaga yoziladigan snapshot'ni qaytaradi. */
  abandon(row: BulkJobRow, status: 'stopped' | 'failed', reason: string): unknown;
}

/**
 * Server ko'tarilgach `running` bo'lib qolgan vazifalarni davom ettiradi.
 *
 * Telegram akkauntlar ulangandan KEYIN chaqiriladi (`main.ts`): aks holda
 * birinchi mijozlar `TELEGRAM_NOT_CONNECTED` bilan "xato"ga tushardi.
 */
export class BulkJobResumer {
  constructor(
    private readonly repo: IBulkJobRepository,
    private readonly clock: Pick<IClock, 'todayIso'>,
    private readonly handlers: readonly ResumableJob[],
    /**
     * Berilsa tiklanish qaydi va yopish store navbati orqali o'tadi —
     * `freeze` bilan tartiblanadi; tiklash tugagani store'ga aytiladi
     * (yetim qatorlar shundan keyin yopila oladi). `null` — eski xulq.
     */
    private readonly store: BulkJobStore | null = null,
  ) {}

  /** Hech qachon rad etmaydi — tiklash xatosi serverni to'xtatmasin. */
  async run(): Promise<void> {
    try {
      for (const handler of this.handlers) {
        try {
          await this.bittasi(handler);
        } catch (err) {
          log.error({ err, tur: handler.kind }, 'Vazifani tiklashda xato');
        }
      }
      try {
        const ochirildi = await this.repo.deleteFinishedOlderThan(RETENTION_DAYS);
        if (ochirildi) log.info({ ochirildi }, 'Eski ommaviy vazifa yozuvlari tozalandi');
      } catch (err) {
        log.warn({ err }, 'Eski ommaviy vazifa yozuvlarini tozalab bo\'lmadi');
      }
    } finally {
      this.store?.tiklashYakunlandi();
    }
  }

  private async bittasi(handler: ResumableJob): Promise<void> {
    if (this.store?.isShuttingDown()) return;
    const row = await this.repo.findRunning(handler.kind);
    if (!row) return;

    const qaror = resumeDecision(row, this.clock.todayIso(), handler.sameDayOnly);
    if (qaror.action === 'close') {
      log.warn({ id: row.id, tur: row.kind, sabab: qaror.reason }, 'Vazifa davom ettirilmadi');
      await this.yop(handler, row, qaror.status, qaror.reason);
      return;
    }

    // Qayd `resume` dan OLDIN: tiklashning o'zi jarayonni yiqitsa ham
    // avariya sanalgan bo'ladi va uchinchisida vazifa yopiladi.
    if (this.store) {
      await this.store.markResumed(row.id, row.kind, qaror.crashed);
      // Qayd yozilayotganda SIGTERM keldi: chiqayotgan jarayonda vazifani
      // boshlash ma'nosiz — u to'xtatilmay qolardi (to'xtash tartibi
      // allaqachon o'tib ketgan).
      if (this.store.isShuttingDown()) {
        log.info({ id: row.id, tur: row.kind }, 'Server to\'xtayapti — tiklash keyingi ishga tushishga qoldirildi');
        return;
      }
    } else {
      await this.repo.markResumed(row.id, qaror.crashed);
    }
    try {
      handler.resume(row);
      log.info(
        { id: row.id, tur: row.kind, ishlangan: row.processedIds.length, avariya: qaror.crashed },
        'Vazifa server qayta ishga tushgach davom ettirildi',
      );
    } catch (err) {
      log.error({ err, id: row.id, tur: row.kind }, 'Saqlangan vazifani davom ettirib bo\'lmadi');
      await this.yop(handler, row, 'failed', 'Vazifani davom ettirib bo\'lmadi — qaytadan boshlang');
    }
  }

  private async yop(
    handler: ResumableJob,
    row: BulkJobRow,
    status: 'stopped' | 'failed',
    reason: string,
  ): Promise<void> {
    let snapshot: unknown = row.snapshot;
    try {
      snapshot = handler.abandon(row, status, reason);
    } catch (err) {
      log.error({ err, id: row.id }, 'Vazifani xotirada yopib bo\'lmadi — bazada baribir yopiladi');
    }
    if (this.store) await this.store.finish(row.id, status, snapshot, { yakuniy: true });
    else await this.repo.finish(row.id, status, snapshot);
  }
}
