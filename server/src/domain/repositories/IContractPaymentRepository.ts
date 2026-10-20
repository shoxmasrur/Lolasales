import type { TolovHodisasi } from '@/domain/services/vadaTolovi';

export interface SumPaidSinceParams {
  readonly clientId: string;
  /**
   * Va'da qaysi shartnomaga tegishli. `null` bo'lsa mijozning BARCHA
   * shartnomalari bo'yicha to'lovlar hisoblanadi — va'dada shartnoma
   * ko'rsatilmagan bo'lsa, mijoz qaysi biriga to'laganini bilmaymiz.
   */
  readonly contractId: string | null;
  /** YYYY-MM-DD — shu sanadan boshlab (shu kun ham kiradi). */
  readonly sinceIso: string;
}

/**
 * Bankdan kelgan real to'lovlar ustidagi so'rovlar
 * (`contract_payment_events`).
 */
/** Muddati o'tgan va to'lanmagan grafik qatori. */
export interface UnpaidMonth {
  /** YYYY-MM-DD */
  readonly dateIso: string;
  readonly amount: number;
  /** Qisman to'langan bo'lsa — qancha kelgani. */
  readonly paid: number;
}

/** Bankdan kelgan to'lov — agentga va kartaga ko'rsatiladigan qisqartma. */
export interface RecentPayment {
  /** YYYY-MM-DD */
  readonly dateIso: string;
  readonly amount: number;
  /**
   * To'lov kanali: `xonpay` (Xonsaroy Pay), `transfer` yoki bank nomi.
   *
   * Kvitansiya tekshiruvida kerak: Xonsaroy Pay darhol ko'rinadi, bank
   * o'tkazmasi esa bir kungacha kechikadi.
   */
  readonly paymentType: string | null;
}

/** To'liq grafik qatori — mijoz kartasidagi jadval uchun. */
export interface SchedulePayment {
  readonly dateIso: string;
  readonly amount: number;
  readonly paid: number;
  readonly status: string;
  readonly type: string;
}

export interface IContractPaymentRepository {
  /** Berilgan sanadan keyin kelgan to'lovlar yig'indisi. */
  sumPaidSince(params: SumPaidSinceParams): Promise<number>;
  /**
   * O'sha oynadagi to'lovlarning O'ZI — yig'indisi emas.
   *
   * Va'da bo'yicha hisob sanadan tashqari to'lov QACHON topilganiga ham
   * qaraydi (`vadadanKeyingiTolov`), shuning uchun qatorlar kerak.
   */
  listPaidSince(params: SumPaidSinceParams): Promise<TolovHodisasi[]>;
  /** Muddati o'tgan va to'lanmagan oylar — eng eskisi birinchi. */
  findUnpaidMonths(contractId: string, todayIso: string, limit: number): Promise<UnpaidMonth[]>;
  /** Oxirgi kelib tushgan to'lovlar — eng yangisi birinchi. */
  listRecentPayments(contractId: string, limit: number): Promise<RecentPayment[]>;
  /** Shartnomaning to'liq to'lov grafigi — sana bo'yicha. */
  listSchedule(contractId: string): Promise<SchedulePayment[]>;
}
