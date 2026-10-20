import ExcelJS from 'exceljs';
import { Readable } from 'node:stream';
import type { ImportRowError } from '@/domain/entities/ImportBatch';
import type { ILeadFileParser, ParsedLeadFile, ParsedLeadRow } from '@/domain/services/ILeadFileParser';
import { findPhoneColumns } from '@/infrastructure/import/columnMap';
import { leadSarlavhaBali, leadUstunlari } from '@/infrastructure/import/leadColumns';
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

/** Mijozlar ro'yxati (Excel/CSV): ism, telefon, kurs. */
export class XlsxLeadParser implements ILeadFileParser {
  async parseLeads(buffer: Buffer, filename: string): Promise<ParsedLeadFile> {
    const sheet = await this.loadSheet(buffer, filename);
    const { headerRow, headers } = this.detectHeader(sheet);
    const cols = leadUstunlari(headers.map((h) => String(h ?? '')));
    const phoneColumns = findPhoneColumns(headers);

    if (!phoneColumns.length) {
      throw new ValidationError(
        'Faylda telefon ustuni topilmadi. Ustun sarlavhasi "Telefon", "Raqam", "Телефон" yoki "Phone" bo\'lishi kerak.',
      );
    }

    const rows: ParsedLeadRow[] = [];
    const errors: ImportRowError[] = [];
    let totalRows = 0;

    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber <= headerRow) return;
      const cells = this.rowCells(row);
      if (cells.every((c) => c === null || c === '')) return;
      totalRows += 1;

      const phones = [...new Set(phoneColumns.flatMap((col) => extractPhones(str(cells[col - 1]))))];
      if (!phones.length) {
        errors.push({ row: rowNumber, reason: "Yaroqli telefon raqami yo'q", value: str(cells[phoneColumns[0]! - 1]) ?? undefined });
        return;
      }

      rows.push({
        rowNumber,
        fullName: cols.name !== null ? str(cells[cols.name]) : null,
        phones,
        courseName: cols.course !== null ? str(cells[cols.course]) : null,
      });
    });

    log.info({ filename, totalRows, ok: rows.length, failed: errors.length }, "Mijozlar ro'yxati o'qildi");

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
   * Faylning birinchi qatorlari sarlavha bo'lmasligi mumkin (sarlavha, bo'sh qator).
   * Eng ko'p tanish ustun nomiga ega qatorni sarlavha deb olamiz; telefon
   * ustuni bo'lishi shart.
   */
  private detectHeader(sheet: ExcelJS.Worksheet): { headerRow: number; headers: unknown[] } {
    let best = { row: 1, score: -1, cells: [] as unknown[] };

    for (let r = 1; r <= Math.min(HEADER_SCAN_ROWS, sheet.rowCount); r += 1) {
      const cells = this.rowCells(sheet.getRow(r));
      const score = leadSarlavhaBali(cells);
      if (score > best.score) best = { row: r, score, cells };
    }

    if (best.score < 1) {
      throw new ValidationError(
        'Sarlavha qatori topilmadi. Birinchi qatorda "Ism", "Telefon" va (ixtiyoriy) "Kurs" ustunlari bo\'lishi kerak.',
      );
    }

    return { headerRow: best.row, headers: best.cells };
  }
}
