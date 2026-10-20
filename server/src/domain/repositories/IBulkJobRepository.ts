/**
 * Ommaviy vazifalarning (suhbat boshlash, Telegram qidiruvi) bazadagi
 * holati.
 *
 * NEGA KERAK: vazifalar faqat xotirada yashardi va har deploy
 * (`systemctl restart`) ularni yo'qotardi. Qator `running` bo'lib qolsa,
 * server ko'tarilgach vazifa shu yerdan davom ettiriladi
 * (`BulkJobResumer`).
 */
export type BulkJobKind = 'start' | 'lookup';
export type BulkJobStatus = 'running' | 'done' | 'stopped' | 'failed';

export interface BulkJobRow {
  readonly id: string;
  readonly kind: BulkJobKind;
  readonly status: BulkJobStatus;
  /** Boshlash parametrlari — shakli vazifa turiga bog'liq. */
  readonly input: unknown;
  /** Faqat `start`: taqsimot natijasi. */
  readonly plan: unknown | null;
  /** Panelga ko'rsatiladigan holat (vazifaning job obyekti). */
  readonly snapshot: unknown;
  /** Qayta ishlangan mijoz/suhbat id'lari — tiklanishda tashlab ketiladi. */
  readonly processedIds: string[];
  /** Oxirgi to'xtash tartibli bo'lganmi (deploy) yoki jarayon o'lganmi. */
  readonly cleanStop: boolean;
  /** Oldinga siljimagan avariyaviy tiklanishlar soni. */
  readonly crashResumes: number;
  readonly resumedCount: number;
  /** Vazifa boshlangan kun, loyiha vaqt mintaqasida, YYYY-MM-DD. */
  readonly startedDay: string;
}

export interface IBulkJobRepository {
  /** Shu turda `running` vazifa bo'lsa `ConflictError` tashlaydi. */
  insert(row: {
    id: string; kind: BulkJobKind; input: unknown; snapshot: unknown; startedDay: string;
  }): Promise<void>;
  savePlan(id: string, plan: unknown): Promise<void>;
  /**
   * Holatni yangilaydi. `processedId` berilsa ro'yxatga qo'shiladi va
   * `crashResumes` nolga qaytadi (vazifa oldinga siljidi). Faqat `running`
   * qatorga ta'sir qiladi.
   */
  save(id: string, snapshot: unknown, processedId: string | null): Promise<void>;
  /**
   * Yakuniy holat. `onlyIfRunning` — faqat hali `running` bo'lgan qatorga
   * yoziladi (yetimni yopish o'z egasining yakuniy yozuvini bosib ketmasin).
   */
  finish(
    id: string,
    status: BulkJobStatus,
    snapshot: unknown,
    opts?: { onlyIfRunning?: boolean },
  ): Promise<void>;
  findRunning(kind: BulkJobKind): Promise<BulkJobRow | null>;
  /** Hamma `running` qatorni "tartibli to'xtadi" deb belgilaydi. */
  markCleanStop(): Promise<void>;
  /** Tiklanish qaydi: `cleanStop` tozalanadi, `resumedCount` oshadi. */
  markResumed(id: string, crashed: boolean): Promise<void>;
  /** @returns nechta qator o'chirilgani */
  deleteFinishedOlderThan(days: number): Promise<number>;
}
