import type { MijozQamrovi } from '@/domain/entities/MijozQamrovi';

/**
 * Obyekt cheklovi: bitta yozuv foydalanuvchi qamrovidami. Har metod —
 * bitta SQL; yozuv mijozgacha JOIN qilinib, `mijozQamroviSharti` bilan
 * tekshiriladi (mijoz darajasidagi qamrov). Faqat cheklangan qamrov bilan
 * chaqiriladi; id'lar oldindan uuid sifatida tekshirilgan.
 */
export interface IQamrovRepository {
  mijozQamrovdaMi(q: MijozQamrovi, clientId: string): Promise<boolean>;
  suhbatQamrovdaMi(q: MijozQamrovi, conversationId: string): Promise<boolean>;
  xabarQamrovdaMi(q: MijozQamrovi, messageId: string): Promise<boolean>;
  shartnomaQamrovdaMi(q: MijozQamrovi, contractId: string): Promise<boolean>;
  /** Tirik (`deleted_at IS NULL`) shartnoma raqami bo'yicha — `findByContractNo` kabi. */
  shartnomaRaqamiQamrovdaMi(q: MijozQamrovi, contractNo: string): Promise<boolean>;
  talabnomaQamrovdaMi(q: MijozQamrovi, talabnomaId: string): Promise<boolean>;
  /** Qamrovdagi mijoz id'lari (tartib kafolatlanmaydi, kichik harfda). */
  qamrovdagiMijozlar(q: MijozQamrovi, clientIds: string[]): Promise<string[]>;
  /** Qamrovdagi suhbat id'lari (tartib kafolatlanmaydi, kichik harfda). */
  qamrovdagiSuhbatlar(q: MijozQamrovi, conversationIds: string[]): Promise<string[]>;
}
