import type { ImportRowError } from '@/domain/entities/ImportBatch';

/** Fayldan o'qilgan bitta qator — bazaga yozishga tayyor ko'rinishda. */
export interface ParsedDebtorRow {
  readonly rowNumber: number;
  readonly externalId: string | null;
  readonly fullName: string;
  readonly phones: string[];
  readonly contractNo: string;
  readonly objectName: string | null;
  readonly status: string | null;
  readonly virtualStatus: string | null;
  readonly category: string | null;
  readonly totalPrice: number | null;
  readonly firstPayment: number | null;
  readonly monthlyPayment: number | null;
  readonly paidTotal: number | null;
  readonly remainingTotal: number | null;
  readonly contractDate: Date | null;
  readonly months: number | null;
  readonly nextPaymentDate: Date | null;
  readonly daysOverdue: number;
  readonly debtFirst: number;
  readonly debtMonthly: number;
  readonly debtTotal: number;
  readonly warningCount: number;
  readonly lastWarningType: string | null;
  readonly lastWarningMethod: string | null;
  readonly lastWarningManager: string | null;
  readonly lastWarningAt: Date | null;
  readonly raw: Record<string, unknown>;
}

export interface ParsedDebtorFile {
  readonly rows: ParsedDebtorRow[];
  readonly errors: ImportRowError[];
  readonly totalRows: number;
  /** Faylda telefon ustuni topildimi — dashboardda ogohlantirish uchun. */
  readonly hasPhoneColumn: boolean;
  readonly detectedHeaders: string[];
}

/** Telefon raqamlarini alohida fayldan qo'shish uchun. */
export interface ParsedPhoneRow {
  readonly rowNumber: number;
  /** Shartnoma raqami yoki mijoz ID — shu bo'yicha bog'lanadi. */
  readonly contractNo: string | null;
  readonly externalId: string | null;
  readonly fullName: string | null;
  readonly phones: string[];
}

export interface ParsedPhoneFile {
  readonly rows: ParsedPhoneRow[];
  readonly errors: ImportRowError[];
  readonly totalRows: number;
  readonly detectedHeaders: string[];
}

export interface IDebtorFileParser {
  parseDebtors(buffer: Buffer, filename: string): Promise<ParsedDebtorFile>;
  parsePhones(buffer: Buffer, filename: string): Promise<ParsedPhoneFile>;
}
