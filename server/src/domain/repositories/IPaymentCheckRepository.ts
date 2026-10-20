import type {
  NewPaymentCheck,
  NewReceiptReview,
  PaymentCheck,
  PaymentCheckStatus,
} from '@/domain/entities/PaymentCheck';

export interface PaymentCheckResult {
  readonly status: Extract<PaymentCheckStatus, 'confirmed' | 'not_found'>;
  readonly foundAmount: number | null;
  readonly foundType: string | null;
}

export interface IPaymentCheckRepository {
  /**
   * Yangi CRM kuzatuvini (`crm_watch`) ochadi.
   *
   * Suhbatda ochiq tekshiruv bo'lsa YANGISI yaratilmaydi va o'shanisi
   * qaytariladi: mijoz ketma-ket uchta rasm tashlasa, uchta parallel
   * kuzatuv CRM'ni behuda qiynardi va uchta rahmat yuborilishi mumkin edi.
   * Qaytgan yozuv `receipt_review` bo'lishi mumkin — chaqiruvchi `kind` ga
   * qaraydi.
   */
  open(data: NewPaymentCheck): Promise<PaymentCheck>;
  /**
   * Chek tekshiruvini (`receipt_review`, `reviewing`) ochadi. Ochiq
   * tekshiruv bo'lsa `open()` dagidek o'shanisi qaytariladi.
   */
  openReceiptReview(data: NewReceiptReview): Promise<PaymentCheck>;
  /** Ochiq chek tekshiruvining manbaini `tolov` ga ko'taradi (pastga tushirilmaydi). */
  raiseReceiptSource(id: string): Promise<void>;
  /** Ochiq (`watching` yoki `reviewing`) tekshiruv. */
  findOpenByConversation(conversationId: string): Promise<PaymentCheck | null>;
  /** Kuzatuvchi uchun, faqat `crm_watch`: eng uzoq tekshirilmaganlari birinchi. */
  findDue(limit: number): Promise<PaymentCheck[]>;
  /** Topilmadi, lekin muddat hali bor — keyingi tsiklda qayta ko'riladi. */
  touch(id: string, checkedAt: Date): Promise<void>;
  close(id: string, result: PaymentCheckResult): Promise<void>;
  /**
   * Agent mijozga "Chekni oldim…" deb javob berdi. Faqat `reviewing`
   * yozuvga yoziladi; `false` — tekshiruv shu orada yopilgan (operator
   * tasdiqladi yoki suhbat yopildi).
   */
  markAcknowledged(id: string, at: Date): Promise<boolean>;
  /**
   * Chek tekshiruvi ochiqligida boshqa yo'ldan rahmat ketdi. Faqat ochiq
   * `reviewing` yozuvga yoziladi; birinchi vaqt saqlanadi.
   */
  markThanksSent(conversationId: string, at: Date): Promise<void>;
  /**
   * Operator tugmasi. `false` — yozuv allaqachon `reviewing` emas
   * (parallel ikkinchi bosish yoki suhbat yopilgan).
   */
  confirmByOperator(id: string, actor: string, at: Date): Promise<boolean>;
  /** `since` dan keyin operator tasdiqlagan eng oxirgi chek tekshiruvi. */
  findOperatorConfirmedSince(conversationId: string, since: Date): Promise<PaymentCheck | null>;
  /** Ochiq tekshiruvni (`watching` yoki `reviewing`) `cancelled` qiladi. */
  cancel(conversationId: string): Promise<void>;
}
