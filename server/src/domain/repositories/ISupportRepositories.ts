import type { ImportBatch, ImportKind, ImportRowError } from '@/domain/entities/ImportBatch';
import type { Page, Pagination } from '@/domain/repositories/types';

export interface NewImportBatch {
  filename: string;
  kind: ImportKind;
  rowsTotal: number;
  rowsOk: number;
  rowsFailed: number;
  clientsCreated: number;
  errors: ImportRowError[];
  createdBy?: string | null;
}

/** Import tugagach yoziladigan natijalar. */
export interface ImportBatchResult {
  rowsTotal: number;
  rowsOk: number;
  rowsFailed: number;
  clientsCreated: number;
  errors: ImportRowError[];
}

/** Importni qaytarish (yoki qaytarishni bekor qilish) nechta qatorga tegdi. */
export interface ImportUndoSummary {
  readonly clients: number;
  readonly conversations: number;
  readonly messages: number;
  readonly campaignTargets: number;
  readonly profiles: number;
}

export interface IImportBatchRepository {
  create(data: NewImportBatch): Promise<ImportBatch>;
  /**
   * Import yozuvini BOSHIDA yaratadi — id kerak, chunki har bir yangi
   * mijoz "meni shu import yaratdi" deb belgilanadi.
   * Sonlar oxirida `finalize` bilan yoziladi.
   */
  start(data: { filename: string; kind: ImportKind; createdBy?: string | null }): Promise<ImportBatch>;
  finalize(id: string, data: ImportBatchResult): Promise<ImportBatch>;
  list(pagination?: Pagination): Promise<Page<ImportBatch>>;
  findById(id: string): Promise<ImportBatch | null>;
  /** Qaytarish nimaga tegishini oldindan ko'rsatish uchun (o'chirmaydi). */
  undoPreview(id: string): Promise<Pick<ImportUndoSummary, 'clients'>>;
  /**
   * Importni qaytaradi: SHU import yaratgan mijozlar yumshoq o'chiriladi
   * (bazadan yo'qolmaydi). Import yaratmagan qatorlarga TEGILMAYDI.
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

/** Sotuv paneli raqamlari (`todayIso` — loyiha vaqt mintaqasidagi bugun). */
export interface DashboardStats {
  readonly clientsTotal: number;
  readonly clientsOnTelegram: number;
  readonly conversationsTotal: number;
  readonly conversationsNeedingHuman: number;
  readonly messagesSentToday: number;
  readonly messagesReceivedToday: number;
  /** Menejer tasdig'ini kutayotgan cheklar. */
  readonly receiptsPending: number;
  /** Voronka: har bir mijozning joriy xaridi qaysi bosqichda. */
  readonly funnel: Array<{ stage: string; count: number }>;
  /** Bugun qo'shilgan mijozlar manbalar bo'yicha. */
  readonly newClientsToday: Array<{ source: string; count: number }>;
  /** Bugun tasdiqlangan to'lovlar soni va summasi. */
  readonly paymentsToday: { count: number; amount: number };
  /** Kunlik dinamika (oxirgi 14 kun) — xabar emas, ODAM soni. */
  readonly dailyActivity: Array<{ day: string; writtenTo: number; replied: number }>;
}

export interface IStatsRepository {
  dashboard(todayIso: string, timeZone: string): Promise<DashboardStats>;
}
