import ExcelJS from 'exceljs';
import { Readable } from 'node:stream';
import type { ImportRowError } from '@/domain/entities/ImportBatch';
import type {
  IDebtorFileParser,
  ParsedDebtorFile,
  ParsedDebtorRow,
  ParsedPhoneFile,
  ParsedPhoneRow,
} from '@/domain/services/IDebtorFileParser';
import {
  buildColumnIndex,
  findPhoneColumns,
  scoreHeaderRow,
  type ColumnIndex,
} from '@/infrastructure/import/columnMap';
import { parseAmount, toDebt, toOverdueDays } from '@/shared/money';
import { parseExcelDate } from '@/shared/datetime';
import { extractPhones } from '@/shared/phone';
import { ValidationError } from '@/shared/errors';
import { childLogger } from '@/shared/logger';

const log = childLogger('import');
const HEADER_SCAN_ROWS = 15;

/** ExcelJS katagi: formula natijasi, rich text, giperhavola bo'lishi mumkin. */
function cellValue(value: ExcelJS.CellValue): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'object') {
    const v = value as unknown as Record<string, unknown>;
    if ('result' in v) return v.result ?? null;
    if ('text' in v) return v.text ?? null;
    if ('richText' in v && Array.isArray(v.richText)) {
      return (v.richText as Array<{ text: string }>).map((t) => t.text).join('');
    }
    if ('hyperlink' in v) return v.text ?? v.hyperlink ?? null;
  }
  return value;
}

const str = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};

const int = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? Math.round(n) : null;
};

export class XlsxDebtorParser implements IDebtorFileParser {
  async parseDebtors(buffer: Buffer, filename: string): Promise<ParsedDebtorFile> {
    const sheet = await this.loadSheet(buffer, filename);
    const { headerRow, headers, columns } = this.detectHeader(sheet);

    if (columns.contractNo === undefined || columns.fullName === undefined) {
      throw new ValidationError(
        'Faylda majburiy ustunlar topilmadi: "№ договора" va "Клиент". ' +
          `Topilgan sarlavhalar: ${headers.filter(Boolean).slice(0, 20).join(', ')}`,
      );
    }

    const phoneColumns = findPhoneColumns(headers);
    const rows: ParsedDebtorRow[] = [];
    const errors: ImportRowError[] = [];
    let totalRows = 0;

    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber <= headerRow) return;
      const cells = this.rowCells(row);
      if (cells.every((c) => c === null || c === '')) return;
      totalRows += 1;

      try {
        const parsed = this.toDebtorRow(cells, columns, phoneColumns, headers, rowNumber);
        if (!parsed) {
          errors.push({ row: rowNumber, reason: 'Shartnoma raqami yoki mijoz ismi bo\'sh' });
          return;
        }
        rows.push(parsed);
      } catch (err) {
        errors.push({ row: rowNumber, reason: err instanceof Error ? err.message : 'Noma\'lum xato' });
      }
    });

    log.info(
      { filename, totalRows, ok: rows.length, failed: errors.length, hasPhone: phoneColumns.length > 0 },
      'Debitor fayli o\'qildi',
    );

    return {
      rows,
      errors,
      totalRows,
      hasPhoneColumn: phoneColumns.length > 0,
      detectedHeaders: headers.map((h) => String(h ?? '')).filter(Boolean),
    };
  }

  async parsePhones(buffer: Buffer, filename: string): Promise<ParsedPhoneFile> {
    const sheet = await this.loadSheet(buffer, filename);
    const { headerRow, headers, columns } = this.detectHeader(sheet);
    const phoneColumns = findPhoneColumns(headers);

    if (!phoneColumns.length) {
      throw new ValidationError(
        'Faylda telefon ustuni topilmadi. Ustun sarlavhasi "Телефон", "Номер", "Telefon" yoki "Raqam" bo\'lishi kerak.',
      );
    }
    if (columns.contractNo === undefined && columns.externalId === undefined && columns.fullName === undefined) {
      throw new ValidationError(
        'Telefonni mijozga bog\'lash uchun "№ договора", "ID" yoki "Клиент" ustunlaridan biri kerak.',
      );
    }

    const rows: ParsedPhoneRow[] = [];
    const errors: ImportRowError[] = [];
    let totalRows = 0;

    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber <= headerRow) return;
      const cells = this.rowCells(row);
      if (cells.every((c) => c === null || c === '')) return;
      totalRows += 1;

      const phones = phoneColumns.flatMap((col) => extractPhones(str(cells[col - 1])));
      if (!phones.length) {
        errors.push({ row: rowNumber, reason: 'Yaroqli telefon raqami yo\'q' });
        return;
      }

      rows.push({
        rowNumber,
        contractNo: columns.contractNo ? str(cells[columns.contractNo - 1]) : null,
        externalId: columns.externalId ? str(cells[columns.externalId - 1]) : null,
        fullName: columns.fullName ? str(cells[columns.fullName - 1]) : null,
        phones: [...new Set(phones)],
      });
    });

    log.info({ filename, totalRows, ok: rows.length, failed: errors.length }, 'Telefon fayli o\'qildi');

    return {
      rows,
      errors,
      totalRows,
      detectedHeaders: headers.map((h) => String(h ?? '')).filter(Boolean),
    };
  }

  // ─── ichki yordamchilar ──────────────────────────────────────────────────

  private async loadSheet(buffer: Buffer, filename: string): Promise<ExcelJS.Worksheet> {
    const workbook = new ExcelJS.Workbook();

    if (filename.toLowerCase().endsWith('.csv')) {
      await workbook.csv.read(Readable.from(buffer.toString('utf8')));
    } else {
      await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    }

    const sheet = workbook.worksheets[0];
    if (!sheet) throw new ValidationError('Faylda varaq (sheet) topilmadi');
    return sheet;
  }

  private rowCells(row: ExcelJS.Row): unknown[] {
    const out: unknown[] = [];
    const count = row.cellCount || 0;
    for (let i = 1; i <= count; i += 1) {
      out.push(cellValue(row.getCell(i).value));
    }
    return out;
  }

  /**
   * Faylning birinchi qatorlari sarlavha bo'lmasligi mumkin (yig'indi qatori,
   * bo'sh qator). Eng ko'p tanish ustun nomiga ega qatorni sarlavha deb olamiz.
   */
  private detectHeader(sheet: ExcelJS.Worksheet): {
    headerRow: number;
    headers: unknown[];
    columns: ColumnIndex;
  } {
    let best = { row: 1, score: -1, cells: [] as unknown[] };

    for (let r = 1; r <= Math.min(HEADER_SCAN_ROWS, sheet.rowCount); r += 1) {
      const cells = this.rowCells(sheet.getRow(r));
      const score = scoreHeaderRow(cells);
      if (score > best.score) best = { row: r, score, cells };
    }

    if (best.score < 2) {
      throw new ValidationError(
        'Sarlavha qatori topilmadi — fayl kutilgan debitor eksporti formatida emas.',
      );
    }

    return { headerRow: best.row, headers: best.cells, columns: buildColumnIndex(best.cells) };
  }

  private toDebtorRow(
    cells: unknown[],
    c: ColumnIndex,
    phoneColumns: number[],
    headers: unknown[],
    rowNumber: number,
  ): ParsedDebtorRow | null {
    const at = (col: number | undefined): unknown => (col ? cells[col - 1] : null);

    const contractNo = str(at(c.contractNo));
    const fullName = str(at(c.fullName));
    if (!contractNo || !fullName) return null;

    const totalPrice = c.totalPrice ? parseAmount(at(c.totalPrice)) : null;
    const remainingRaw = c.remainingTotal ? Math.abs(parseAmount(at(c.remainingTotal))) : null;
    const paidTotal =
      totalPrice !== null && remainingRaw !== null ? Math.max(0, Math.round((totalPrice - remainingRaw) * 100) / 100) : null;

    // Barcha ustunlarni raw sifatida saqlaymiz — keyin tahlil/tekshirish uchun.
    const raw: Record<string, unknown> = {};
    headers.forEach((h, i) => {
      const key = str(h);
      const value = cells[i];
      if (key && value !== null && value !== undefined && value !== '') {
        raw[key] = value instanceof Date ? value.toISOString() : value;
      }
    });

    return {
      rowNumber,
      externalId: str(at(c.externalId)),
      fullName,
      phones: [...new Set(phoneColumns.flatMap((col) => extractPhones(str(cells[col - 1]))))],
      contractNo,
      objectName: str(at(c.objectName)),
      status: str(at(c.status)),
      virtualStatus: str(at(c.virtualStatus)),
      category: str(at(c.category)),
      totalPrice,
      firstPayment: c.firstPayment ? parseAmount(at(c.firstPayment)) : null,
      monthlyPayment: c.monthlyPayment ? parseAmount(at(c.monthlyPayment)) : null,
      paidTotal,
      remainingTotal: remainingRaw,
      contractDate: parseExcelDate(at(c.contractDate)),
      months: int(at(c.months)),
      nextPaymentDate: parseExcelDate(at(c.nextPaymentDate)),
      daysOverdue: toOverdueDays(at(c.daysOverdue)),
      debtFirst: c.debtFirst ? toDebt(at(c.debtFirst)) : 0,
      debtMonthly: c.debtMonthly ? toDebt(at(c.debtMonthly)) : 0,
      debtTotal: c.debtTotal ? toDebt(at(c.debtTotal)) : 0,
      warningCount: int(at(c.warningCount)) ?? 0,
      lastWarningType: str(at(c.warningType)),
      lastWarningMethod: str(at(c.warningMethod)),
      lastWarningManager: str(at(c.warningManager)),
      lastWarningAt: parseExcelDate(at(c.warningCreatedAt)),
      raw,
    };
  }
}
