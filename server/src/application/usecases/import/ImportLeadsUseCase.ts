import type { Course } from '@/domain/entities/Course';
import type { ImportResult, ImportRowError } from '@/domain/entities/ImportBatch';
import type { IClientRepository } from '@/domain/repositories/IClientRepository';
import type { ICourseRepository } from '@/domain/repositories/ICourseRepository';
import type { IImportBatchRepository } from '@/domain/repositories/ISupportRepositories';
import type { IClientPhoneBlockRepository } from '@/domain/repositories/IClientPhoneBlockRepository';
import type { ILeadFileParser } from '@/domain/services/ILeadFileParser';
import type { MijozYaratuvchi } from '@/application/services/MijozYaratuvchi';
import { childLogger } from '@/shared/logger';

const log = childLogger('import:leads');

export interface ImportLeadsInput {
  buffer: Buffer;
  filename: string;
  userId?: string | null;
}

export interface ImportLeadsResult extends ImportResult {
  /** Yangi yaratilgan mijozlar. */
  created: number;
  /** Bazada allaqachon bor edi (manbasi o'zgarmadi). */
  existing: number;
  errors: ImportRowError[];
  totalRows: number;
}

/** Kurs nomi bo'yicha katta-kichik harfga va ortiqcha bo'shliqqa qaramay qidiradi. */
export function kursniTop(courses: readonly Pick<Course, 'id' | 'name'>[], nom: string | null): string | null {
  if (!nom) return null;
  const kalit = kursKaliti(nom);
  return courses.find((c) => kursKaliti(c.name) === kalit)?.id ?? null;
}

const kursKaliti = (s: string): string => s.toLowerCase().replace(/[`'’‘´]/g, "'").replace(/\s+/g, ' ').trim();

/**
 * Mijozlar ro'yxatini (ism, telefon, kurs) bazaga yozadi: har bir yangi raqam
 * manbasi 'raqam' bo'lgan mijoz. Mavjud raqam qayta yaratilmaydi. Import
 * `import_batches` da qayd qilinadi va qaytariladi (undo).
 */
export class ImportLeadsUseCase {
  constructor(
    private readonly parser: ILeadFileParser,
    private readonly creator: Pick<MijozYaratuvchi, 'raqamdan'>,
    private readonly courses: Pick<ICourseRepository, 'list'>,
    private readonly batches: IImportBatchRepository,
    private readonly clients: Pick<IClientRepository, 'update'>,
    /** Mijozdan uzilgan raqamlar importdan qayta qo'shilmaydi; `null` — tekshirilmaydi. */
    private readonly blocks: Pick<IClientPhoneBlockRepository, 'isPhoneBlocked'> | null = null,
  ) {}

  async execute(input: ImportLeadsInput): Promise<ImportLeadsResult> {
    const parsed = await this.parser.parseLeads(input.buffer, input.filename);
    const errors: ImportRowError[] = [...parsed.errors];
    const warnings: string[] = [];
    const courses = await this.courses.list();

    // Yozuv ENG BOSHIDA: har bir yangi mijoz "meni shu import yaratdi" deb belgilanadi.
    const batch = await this.batches.start({
      filename: input.filename,
      kind: 'leads',
      createdBy: input.userId ?? null,
    });

    let created = 0;
    let existing = 0;
    const nomalumKurslar = new Set<string>();

    for (const row of parsed.rows) {
      try {
        const courseId = kursniTop(courses, row.courseName);
        if (row.courseName && !courseId) nomalumKurslar.add(row.courseName);

        // Operator "bu raqam mijozniki emas" deb uzgan raqam qaytib kelmasin.
        const phones: string[] = [];
        for (const p of row.phones) if (!(await this.blocks?.isPhoneBlocked(p))) phones.push(p);
        if (!phones.length) {
          errors.push({ row: row.rowNumber, reason: "Raqam avval 'mijozniki emas' deb uzilgan", value: row.phones[0] });
          continue;
        }
        const [birinchi, ...qolgan] = phones;
        const { client, created: yangi } = await this.creator.raqamdan({
          fullName: row.fullName ?? '',
          phone: birinchi!,
          courseId,
          batchId: batch.id,
        });
        if (!yangi) {
          existing += 1;
          continue;
        }
        created += 1;
        if (qolgan.length) await this.clients.update(client.id, { extraPhones: qolgan });
      } catch (err) {
        errors.push({
          row: row.rowNumber,
          reason: err instanceof Error ? err.message : 'Yozishda xato',
          value: row.phones[0],
        });
      }
    }

    if (nomalumKurslar.size) {
      warnings.push(
        `Kurs topilmadi (mijoz kurssiz yaratildi): ${[...nomalumKurslar].slice(0, 10).join(', ')}` +
          (nomalumKurslar.size > 10 ? ` va yana ${nomalumKurslar.size - 10} ta` : ''),
      );
    }

    const finished = await this.batches.finalize(batch.id, {
      rowsTotal: parsed.totalRows,
      rowsOk: created + existing,
      rowsFailed: errors.length,
      clientsCreated: created,
      contractsCreated: 0,
      contractsUpdated: 0,
      errors,
    });

    log.info({ filename: input.filename, created, existing, failed: errors.length }, "Mijozlar importi tugadi");

    return { batch: finished, warnings, created, existing, errors, totalRows: parsed.totalRows };
  }
}
