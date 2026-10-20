import type { ScheduleRow } from '@/domain/services/contractDebt';

/** Grafikdagi bitta qator — ularning `payments[]` elementi. */
export interface ExternalPayment extends ScheduleRow {
  readonly externalId: number;
  /** YYYY-MM-DD yoki null (hali to'lanmagan). */
  readonly datePaid: string | null;
}

/** Bankdan kelgan real to'lov — ularning `payment_histories[]` elementi. */
export interface ExternalPaymentEvent {
  /**
   * CRM yozuvining O'Z identifikatori — hodisani farqlash shu bo'yicha
   * ketadi (`tolovKaliti`). `external_id` dan farqli o'laroq o'zgarmaydi.
   */
  readonly uuid: string | null;
  /**
   * Tashqi havola: xonpay tranzaksiyasi, keyin bank ko'chirmasi kaliti.
   * ALMASHADI, shuning uchun kalit sifatida ishlatilmaydi — faqat
   * operator ko'rishi va tekshirishi uchun saqlanadi.
   */
  readonly externalId: string;
  readonly amount: number;
  /** YYYY-MM-DD */
  readonly datePaid: string;
  readonly paymentType: string | null;
  readonly purpose: string | null;
  readonly isProblematic: boolean;
}

export interface ExternalApartment {
  readonly number: string | null;
  readonly floor: number | null;
  readonly rooms: number | null;
  readonly entrance: string | null;
  readonly block: string | null;
  readonly area: number | null;
}

export interface ExternalContract {
  readonly orderId: number;
  readonly contractNo: string;
  readonly clientName: string;
  /**
   * Mijozning ANIQ ismi (`first_name`) — murojaat shakli shundan tuziladi.
   *
   * To'liq ismdan taxmin qilib ajratish "Familiya Ism Ota o'g'li" da
   * adashadi, shuning uchun CRM alohida bergan qiymat ustun turadi.
   */
  readonly clientFirstName: string | null;
  /** E.164 formatida, dublikatsiz. */
  readonly phones: string[];
  readonly objectName: string | null;
  /**
   * Turar-joy majmuasining manzili — talabnomada "obyekt manzili" sifatida
   * yoziladi. CRM'da obyekt tugunida turadi.
   */
  readonly objectAddress: string | null;
  /**
   * Obyektni quruvchi kompaniyaning INN'i (`company_details.inn`). Talabnoma
   * rekvizitini kompaniyalar ro'yxatidan aynan shu kalit bilan tanlaymiz —
   * nom bo'yicha tanlash yozilishdagi farqlarda adashadi.
   */
  readonly companyInn: string | null;
  readonly apartment: ExternalApartment | null;
  /**
   * Xonadonni bitish muddati, `YYYY-MM-DD` — CRM'ning "Детали договора"
   * dagi sana. Zanjir va sabablari `contractMapper.bitishSanasi` da.
   */
  readonly completionDate: string | null;
  readonly status: string | null;
  readonly virtualStatus: string | null;
  readonly contractDate: Date | null;
  readonly months: number | null;
  readonly transactionPrice: number | null;
  readonly initialPayment: number | null;
  readonly monthlyPayment: number | null;
  readonly totalPaid: number | null;
  /**
   * Umumiy qoldiq (ularning `total_debt` i). ICHKI maydon — agentga
   * ko'rsatilmaydi va mijozga aytilmaydi. Kechikkan to'lov EMAS.
   */
  readonly remainingTotal: number | null;
  readonly schedule: ExternalPayment[];
  readonly history: ExternalPaymentEvent[];
}

/**
 * Tashqi shartnomalar bazasiga kirish porti.
 *
 * Implementatsiya `infrastructure/contracts` da. Test uchun soxta gateway
 * qo'yish — `container.ts` da bir qator.
 */
export interface IContractGateway {
  /** Shartnoma raqami bo'yicha qidirish (ularning `order/index`). */
  findByContractNo(contractNo: string): Promise<ExternalContract | null>;
  /** Ularning `order.id` si bo'yicha to'g'ridan-to'g'ri (`order/show`). */
  fetchByOrderId(orderId: number): Promise<ExternalContract | null>;
}
