import type { ImportRowError } from '@/domain/entities/ImportBatch';

/** Mijozlar ro'yxati faylidagi bitta qator. */
export interface ParsedLeadRow {
  readonly rowNumber: number;
  readonly fullName: string | null;
  /** E.164, takrorsiz. Kamida bitta. */
  readonly phones: string[];
  readonly courseName: string | null;
}

export interface ParsedLeadFile {
  readonly rows: ParsedLeadRow[];
  readonly errors: ImportRowError[];
  readonly totalRows: number;
  readonly detectedHeaders: string[];
}

export interface ILeadFileParser {
  parseLeads(buffer: Buffer, filename: string): Promise<ParsedLeadFile>;
}
