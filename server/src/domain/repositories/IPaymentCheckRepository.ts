import type { NewReceiptReview, PaymentCheck } from '@/domain/entities/PaymentCheck';

export interface IPaymentCheckRepository {
  /**
   * Chek tekshiruvini (`receipt_review`, `reviewing`) ochadi. Suhbatda ochiq
   * tekshiruv bo'lsa YANGISI yaratilmaydi va o'shanisi qaytariladi: mijoz
   * ketma-ket uchta rasm tashlasa, bitta tekshiruv bo'ladi.
   */
  openReceiptReview(data: NewReceiptReview): Promise<PaymentCheck>;
  /** Ochiq chek tekshiruvining manbaini `tolov` ga ko'taradi (pastga tushirilmaydi). */
  raiseReceiptSource(id: string): Promise<void>;
  /** Ochiq (`reviewing`) tekshiruv. */
  findOpenByConversation(conversationId: string): Promise<PaymentCheck | null>;
  /**
   * Agent mijozga "Chekni oldim…" deb javob berdi. Faqat `reviewing`
   * yozuvga yoziladi; `false` — tekshiruv shu orada yopilgan (menejer
   * tasdiqladi/rad etdi yoki suhbat yopildi).
   */
  markAcknowledged(id: string, at: Date): Promise<boolean>;
  /**
   * Menejer summani kiritib tasdiqladi. `false` — yozuv allaqachon
   * `reviewing` emas (parallel ikkinchi bosish yoki suhbat yopilgan).
   */
  confirmByOperator(id: string, actor: string, amount: number, at: Date): Promise<boolean>;
  /** Menejer rad etdi. `false` — yozuv allaqachon `reviewing` emas. */
  reject(id: string, actor: string, reason: string, at: Date): Promise<boolean>;
  /** Ochiq tekshiruvni `cancelled` qiladi. */
  cancel(conversationId: string): Promise<void>;
}
