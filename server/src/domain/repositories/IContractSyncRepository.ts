import type {
  ExternalApartment,
  ExternalPayment,
  ExternalPaymentEvent,
} from '@/domain/services/IContractGateway';

/** Sinxronizatsiya uchun minimal ma'lumot — to'liq `Contract` shart emas. */
export interface SyncableContract {
  readonly id: string;
  readonly clientId: string;
  readonly contractNo: string;
  /** Excel'dagi `ID` ustuni — ularning `order.id` si bo'lishi MUMKIN. */
  readonly externalId: string | null;
  /** Tasdiqlangan `order.id`. Bo'lsa qidiruv o'tkazib yuboriladi. */
  readonly externalOrderId: number | null;
}

/** API'dan kelgan va hisoblangan qiymatlar — bitta UPDATE bilan yoziladi. */
export interface ContractSyncPatch {
  readonly externalOrderId: number;
  readonly objectName: string | null;
  readonly status: string | null;
  readonly virtualStatus: string | null;
  readonly contractDate: Date | null;
  readonly months: number | null;
  readonly totalPrice: number | null;
  readonly firstPayment: number | null;
  readonly monthlyPayment: number | null;
  readonly paidTotal: number | null;
  readonly remainingTotal: number | null;
  /** YYYY-MM-DD */
  readonly nextPaymentDate: string | null;
  readonly daysOverdue: number;
  readonly debtFirst: number;
  readonly debtMonthly: number;
  readonly debtTotal: number;
  /** Hisoblagichlar uchun to'lovdagi kechikish — `debtTotal` ga kirmaydi. */
  readonly debtMeter: number;
  readonly apartment: ExternalApartment | null;
  /** Xonadonni bitish muddati, `YYYY-MM-DD`. API bermasa bazadagisi qoladi. */
  readonly completionDate: string | null;
  /** Grafikdan sanalgan aniq son — bo'linma emas. */
  readonly missedMonths: number;
  /** Obyekt manzili (talabnoma uchun). API bermasa bazadagisi qoladi. */
  readonly objectAddress: string | null;
  /** Obyekt kompaniyasining INN'i — talabnoma rekvizitini tanlash kaliti. */
  readonly companyInn: string | null;
}

/** Sinxronizatsiyada xato bergan shartnoma — dashboardda ro'yxat bo'lib chiqadi. */
export interface SyncErrorRow {
  readonly contractId: string;
  readonly contractNo: string;
  readonly clientName: string;
  readonly error: string;
}

export interface IContractSyncRepository {
  /** Eng eski yangilangani birinchi — kechasi to'liq sinxronizatsiya uchun. */
  findSyncable(limit: number, offset: number): Promise<SyncableContract[]>;
  countSyncable(): Promise<number>;
  getById(contractId: string): Promise<SyncableContract | null>;
  getSyncedAt(contractId: string): Promise<Date | null>;
  /** Muvaffaqiyatli sinxronizatsiya: qiymatlar + `synced_at`, `sync_error = NULL`. */
  applySync(contractId: string, patch: ContractSyncPatch): Promise<void>;
  /** `synced_at` ga tegilmaydi — mavjud ma'lumot qanchalik eskiligi bilinsin. */
  markError(contractId: string, error: string): Promise<void>;
  /** Grafik to'liq almashtiriladi — u qayta tuzilishi mumkin. */
  replaceSchedule(contractId: string, rows: readonly ExternalPayment[]): Promise<void>;
  /** To'lov tarixi faqat qo'shiladi, o'chirilmaydi. */
  upsertHistory(contractId: string, rows: readonly ExternalPaymentEvent[]): Promise<void>;
  /** Xato bergan shartnomalar — odatda Excel'dagi noto'g'ri raqamlar. */
  listSyncErrors(limit: number): Promise<SyncErrorRow[]>;
  /** Umumiy manzara: nechtasi bor, nechtasi yangilangan, nechtasi xato. */
  countSynced(): Promise<{ total: number; synced: number; failed: number }>;
}
