import type { MijozQamrovi } from '@/domain/entities/MijozQamrovi';
import type { ImportBatch, ImportKind, ImportRowError } from '@/domain/entities/ImportBatch';
import type { Page, Pagination } from '@/domain/repositories/types';

export interface NewImportBatch {
  filename: string;
  kind: ImportKind;
  rowsTotal: number;
  rowsOk: number;
  rowsFailed: number;
  clientsCreated: number;
  contractsCreated: number;
  contractsUpdated: number;
  errors: ImportRowError[];
  createdBy?: string | null;
}

/** Import tugagach yoziladigan natijalar. */
export interface ImportBatchResult {
  rowsTotal: number;
  rowsOk: number;
  rowsFailed: number;
  clientsCreated: number;
  contractsCreated: number;
  contractsUpdated: number;
  errors: ImportRowError[];
}

/** Importni qaytarish (yoki qaytarishni bekor qilish) nechta qatorga tegdi. */
export interface ImportUndoSummary {
  readonly clients: number;
  readonly contracts: number;
  readonly conversations: number;
  readonly messages: number;
  readonly promises: number;
  readonly campaignTargets: number;
  readonly profiles: number;
}

export interface IImportBatchRepository {
  create(data: NewImportBatch): Promise<ImportBatch>;
  /**
   * Import yozuvini BOSHIDA yaratadi — id kerak, chunki har bir yangi
   * mijoz va shartnoma "meni shu import yaratdi" deb belgilanadi.
   * Sonlar oxirida `finalize` bilan yoziladi.
   */
  start(data: { filename: string; kind: ImportKind; createdBy?: string | null }): Promise<ImportBatch>;
  finalize(id: string, data: ImportBatchResult): Promise<ImportBatch>;
  list(pagination?: Pagination): Promise<Page<ImportBatch>>;
  findById(id: string): Promise<ImportBatch | null>;
  /** Qaytarish nimaga tegishini oldindan ko'rsatish uchun (o'chirmaydi). */
  undoPreview(id: string): Promise<Pick<ImportUndoSummary, 'clients' | 'contracts'>>;
  /**
   * Importni qaytaradi: SHU import yaratgan mijoz va shartnomalar
   * yumshoq o'chiriladi (bazadan yo'qolmaydi). Import yangilagan, lekin
   * yaratmagan qatorlarga TEGILMAYDI — ularning eski qiymatlari
   * saqlanmagan.
   */
  undo(id: string, actor: string): Promise<ImportUndoSummary>;
  /** Qaytarishni bekor qiladi — o'sha partiya tiklanadi. */
  restore(id: string): Promise<ImportUndoSummary>;
}

export interface ISettingsRepository {
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: unknown, updatedBy?: string | null): Promise<void>;
  all(): Promise<Record<string, unknown>>;
}

export interface AuditEntry {
  actor: string;
  action: string;
  entity?: string | null;
  entityId?: string | null;
  payload?: Record<string, unknown>;
}

export interface IAuditRepository {
  record(entry: AuditEntry): Promise<void>;
  list(query: Pagination & { entity?: string; entityId?: string }): Promise<Page<AuditEntry & { createdAt: Date }>>;
}

export interface DashboardStats {
  readonly clientsTotal: number;
  readonly clientsWithPhone: number;
  readonly clientsOnTelegram: number;
  readonly contractsTotal: number;
  /** Oyma-oy to'lovdagi kechikish jami (`Долг (мес.)`) — agent shu bilan ishlaydi. */
  readonly debtMonthly: number;
  readonly debtTotal: number;
  readonly debtCollectedPromised: number;
  /**
   * Shu oyda undirilgan summa — gaplashilgan mijozdan, birinchi xabardan
   * KEYIN kelgan to'lovlar. Hisobot sahifasidagi o'lchov qoidasi bilan bir xil
   * (`PgReportRepository`), farqi faqat davrda: bu yerda joriy oy.
   */
  readonly collectedThisMonth: number;
  /** Shu oyda to'lov qilgan mijozlar soni — summani kim keltirgani ko'rinsin. */
  readonly collectedClientsThisMonth: number;
  readonly conversationsTotal: number;
  readonly conversationsNeedingHuman: number;
  readonly messagesSentToday: number;
  readonly messagesReceivedToday: number;
  readonly promisesPending: number;
  readonly promisesKept: number;
  readonly promisesBroken: number;
  readonly byState: Array<{ state: string; count: number }>;
  readonly byStage: Array<{ stage: string; count: number }>;
  /**
   * Kunlik dinamika — ODAM soni, xabar soni emas.
   *
   * Xabar soni suhbat hajmini emas, agentning gapdonligini o'lchardi: bitta
   * mijoz bilan 12 marta yozishish grafikda 12 ta bo'lib ko'rinardi. Endi
   * har bir mijoz kuniga bir marta sanaladi.
   */
  readonly dailyActivity: Array<{ day: string; writtenTo: number; replied: number }>;
}

/**
 * Davr bo'yicha statistika.
 *
 * To'lovlar ikkiga bo'linadi va chegara — mijozga BIRINCHI xabar ketgan
 * sana (hisobot sahifasidagi bilan bir xil qoida):
 *   • biz undirgan — o'sha sanadan keyin kelgan to'lov;
 *   • biz aralashmagan — hali yozilmagan mijozning to'lovi.
 */
export interface PeriodStats {
  readonly from: string;
  readonly to: string;
  /** Biz gaplashgan mijozlardan kelgan to'lovlar. */
  readonly collectedByUs: { amount: number; clients: number };
  /** Biz umuman yozmagan mijozlar o'zi to'laganlari. */
  readonly collectedWithoutUs: { amount: number; clients: number };
  /** Kunlik qator — grafik uchun, to'lov bo'lgan kunlar. */
  readonly daily: Array<{ day: string; byUs: number; withoutUs: number }>;
  /**
   * HOZIRGI jami kechikkan to'lov — davrga bog'liq EMAS.
   *
   * Kechikkan to'lov tarixi 057-migratsiyadan boshlab yig'ilyapti; undan oldingi
   * kunlar uchun qiymat yo'q, shuning uchun bu yerda snapshot beriladi
   * va interfeysda "hozirgi holat" deb belgilanadi.
   */
  readonly debtNow: { total: number; monthly: number };
}

export interface IStatsRepository {
  /** `qamrov` — obyekt cheklovi (sukut: hammasi, SQL o'zgarmaydi). */
  dashboard(todayIso: string, qamrov?: MijozQamrovi): Promise<DashboardStats>;
  period(fromIso: string, toIso: string, qamrov?: MijozQamrovi): Promise<PeriodStats>;
  /** Bugungi kechikkan to'lov holatini yozib qo'yadi (kun davomida qayta yoziladi). */
  writeDebtSnapshot(dayIso: string): Promise<void>;
}
