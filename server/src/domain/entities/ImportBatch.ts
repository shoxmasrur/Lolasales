export type ImportKind = 'debtors' | 'phones' | 'leads';

export interface ImportRowError {
  readonly row: number;
  readonly reason: string;
  readonly value?: string;
}

export interface ImportBatch {
  readonly id: string;
  readonly filename: string;
  readonly kind: ImportKind;
  readonly rowsTotal: number;
  readonly rowsOk: number;
  readonly rowsFailed: number;
  readonly clientsCreated: number;
  readonly contractsCreated: number;
  readonly contractsUpdated: number;
  readonly errors: ImportRowError[];
  readonly createdBy: string | null;
  readonly createdAt: Date;
  /** Import qaytarilgan bo'lsa — qachon va kim tomonidan. */
  readonly undoneAt: Date | null;
  readonly undoneBy: string | null;
}

export interface ImportResult {
  readonly batch: ImportBatch;
  readonly warnings: string[];
}
