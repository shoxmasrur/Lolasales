import type { MijozQamrovi } from '@/domain/entities/MijozQamrovi';
import type { NewPaymentPromise, PaymentPromise, PromiseStatus } from '@/domain/entities/PaymentPromise';
import type { Page, Pagination } from '@/domain/repositories/types';

export interface PromiseQuery extends Pagination {
  status?: PromiseStatus;
  clientId?: string;
  dueBefore?: Date;
  dueAfter?: Date;
}

export interface IPaymentPromiseRepository {
  create(data: NewPaymentPromise): Promise<PaymentPromise>;
  findById(id: string): Promise<PaymentPromise | null>;
  /** `qamrov` — obyekt cheklovi (sukut: hammasi, SQL o'zgarmaydi). */
  list(query: PromiseQuery, qamrov?: MijozQamrovi): Promise<Page<PaymentPromise>>;
  findActiveByConversation(conversationId: string): Promise<PaymentPromise | null>;
  /**
   * Suhbatning BARCHA ochiq va'dalari.
   *
   * Kuzatuvchiga kerak: bir shartnoma bo'yicha ikkita ochiq va'da qolsa,
   * ikkalasi ham o'sha to'lovni sanaydi va mijoz bitta pul uchun ikkita
   * rahmat oladi. Ularni birga ko'rgandagina buni sezish mumkin.
   */
  listOpenByConversation(conversationId: string): Promise<PaymentPromise[]>;
  /**
   * Suhbatning ENG OXIRGI va'dasi — HOLATIDAN QAT'IY NAZAR.
   *
   * NEGA HOLAT bo'yicha emas, faqat SANA bo'yicha tanlanadi: agar bu yerda
   * "eng oxirgi BUZILGAN va'da" o'qilsa, undan keyin berilgan va KELISHILGAN
   * (`kept`) yangi va'da ko'rinmay qolardi. Natijada mijoz iyunda va'dasini
   * buzib, avgustda yangisini to'lab, sentabrda qayta jim qolsa — agent
   * unga "1 iyunda 5 000 000 va'da qilib to'lamadingiz" deb yozardi: rost,
   * lekin eskirgan va adolatsiz da'vo, aynan shu funksiya oldini olishi
   * kerak bo'lgan holat. Chaqiruvchi (`AgentRunner.silenceNudge`) natijani
   * o'zi tekshiradi: faqat `status === 'broken'` bo'lsagina "buzilgan"
   * ssenariysi ishlatiladi, aks holda mijoz eng so'nggi va'dasini bajargan
   * va bosim ostida bo'lmasligi kerak.
   *
   * Tenglik holida `created_at` bo'yicha ham so'ngi yozuv tanlanadi — bir
   * kunga ikkita va'da yozilgan bo'lsa, oxirgi KIRITILGANI haqiqiy holat.
   */
  findLatestByConversation(conversationId: string): Promise<PaymentPromise | null>;
  updateStatus(id: string, status: PromiseStatus): Promise<PaymentPromise>;
  /** Muddati o'tgan, hali yopilmagan va'dalar — takroriy murojaat uchun. */
  findOverdue(now: Date, limit: number): Promise<PaymentPromise[]>;
  /**
   * Bugun to'lanishi kelishilgan va hali eslatilmagan va'dalar —
   * kunning ertalabidagi yumshoq eslatma uchun.
   *
   * @param todayIso loyihaviy vaqt mintaqasidagi bugungi sana (YYYY-MM-DD)
   */
  findDueToday(todayIso: string, limit: number): Promise<PaymentPromise[]>;
  /** Eslatma yuborilganini belgilaydi — takror yubormaslik uchun. */
  markReminded(id: string, at: Date): Promise<void>;
  /**
   * Kuzatilishi kerak bo'lgan ochiq va'dalar — eng uzoq tekshirilmagani
   * birinchi. `pending` va `partial` ikkalasi ham kiradi.
   */
  findWatched(limit: number): Promise<PaymentPromise[]>;
  /**
   * To'lov tekshiruvi natijasi.
   *
   * `at = null` — "bugun tekshirilgan" belgisi QO'YILMAYDI: rahmat
   * xabari yuborilmay qolgan bo'lsa, keyingi tsiklda qayta uriniladi.
   * `paidAmount` esa baribir saqlanadi — u to'g'ri o'lchangan fakt.
   */
  recordCheck(id: string, paidAmount: number, at: Date | null): Promise<void>;
  /**
   * Rahmat aytilgani belgilanadi. `thankedAmount` — qaysi summagacha
   * rahmat aytilgani; keyingi tsiklda faqat undan ortiq pul yangi hisoblanadi.
   */
  markThanked(id: string, thankedAmount: number, status: PromiseStatus): Promise<void>;
}
