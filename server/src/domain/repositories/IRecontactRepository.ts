import type { MijozQamrovi } from '@/domain/entities/MijozQamrovi';
import type { QaytaAloqaQoidalari } from '@/domain/services/qaytaAloqa';

/**
 * Qayta aloqa ro'yxatining turlari (dizayn 2.2). Ustunlik tartibi —
 * `RECONTACT_KIND_ORDER` (`qaytaAloqa.ts`).
 */
export type RecontactKind = 'vada_buzilgan' | 'sana_yoq' | 'javobsiz' | 'oqilmagan';

/** Ro'yxatning bitta qatori — API kelishuvi (dizayn 3-bo'lim) bilan aynan bir shakl. */
export interface RecontactItem {
  readonly conversationId: string;
  readonly clientId: string;
  readonly clientName: string;
  readonly kind: RecontactKind;
  /** CRM, so'm: "Сотилди" shartnomalar bo'yicha `debt_first + debt_monthly`. */
  readonly overdue: number;
  readonly silentWorkDays: number;
  /** ISO. */
  readonly lastMessageAt: string;
  readonly lastMessageDirection: 'in' | 'out';
  /** <= 120 belgi; media bo'lsa `[rasm]`, `[ovozli xabar]` kabi. */
  readonly lastMessagePreview: string;
  readonly lastPromise: { date: string; amount: number; status: string } | null;
}

/**
 * Qayta aloqa ro'yxati — alohida jadval YO'Q, har safar bazadan hisoblanadi.
 *
 * Qaysi suhbat qaysi turga tushishi `qaytaAloqaTuri` (sof funksiya) da
 * hal qilinadi; repozitoriy faqat SQL bilan keng oldindan filtr qiladi va
 * snapshot yig'adi. Shu sababli `list` va `findOne` bir xil qoidadan o'tadi.
 */
export interface IRecontactRepository {
  /**
   * Tartib: tur ustunligi, keyin `overdue` kamayish bo'yicha. `qamrov` —
   * obyekt cheklovi (sukut: hammasi, SQL o'zgarmaydi).
   */
  list(qoidalar: QaytaAloqaQoidalari, qamrov?: MijozQamrovi): Promise<RecontactItem[]>;
  /**
   * Bitta suhbatni QAYTA tekshiradi — yuborish navbati xabardan darhol
   * oldin chaqiradi. Ro'yxat shartlariga endi mos kelmasa (mijoz yozgan,
   * to'lagan, va'da bergan) yoki suhbat `qamrov` dan chiqqan bo'lsa `null`.
   */
  findOne(conversationId: string, qoidalar: QaytaAloqaQoidalari, qamrov?: MijozQamrovi): Promise<RecontactItem | null>;
}
