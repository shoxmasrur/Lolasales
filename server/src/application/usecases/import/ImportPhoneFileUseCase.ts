import type { ImportResult, ImportRowError } from '@/domain/entities/ImportBatch';
import type { IClientRepository } from '@/domain/repositories/IClientRepository';
import type { IContractRepository } from '@/domain/repositories/IContractRepository';
import type { IImportBatchRepository } from '@/domain/repositories/ISupportRepositories';
import type { IClientPhoneBlockRepository } from '@/domain/repositories/IClientPhoneBlockRepository';
import type { IDebtorFileParser, ParsedPhoneRow } from '@/domain/services/IDebtorFileParser';
import { clientKey } from '@/application/usecases/import/ImportDebtorFileUseCase';
import { tosilganlarniTashla } from '@/domain/services/telefonToSigi';
import { childLogger } from '@/shared/logger';

const log = childLogger('import:phones');

export interface ImportPhoneFileInput {
  buffer: Buffer;
  filename: string;
  userId?: string | null;
}

/**
 * Telefon raqamlarini alohida fayldan qo'shadi va mavjud mijozlarga bog'laydi.
 * Bog'lanish tartibi: shartnoma raqami → eksport ID → mijoz ismi.
 */
export class ImportPhoneFileUseCase {
  constructor(
    private readonly parser: IDebtorFileParser,
    private readonly clients: IClientRepository,
    private readonly contracts: IContractRepository,
    private readonly batches: IImportBatchRepository,
    /** Mijozdan uzilgan raqamlar — ular importdan qayta qo'shilmaydi. */
    private readonly phoneBlocks: IClientPhoneBlockRepository,
  ) {}

  async execute(input: ImportPhoneFileInput): Promise<ImportResult> {
    const parsed = await this.parser.parsePhones(input.buffer, input.filename);
    const errors: ImportRowError[] = [...parsed.errors];
    const warnings: string[] = [];

    let matched = 0;
    let unmatched = 0;
    // Operator uzgan raqamlar. Excel fayllari qayta-qayta yuklanadi va
    // ularda eski raqam turaveradi — filtrsiz u har importda qaytib
    // kelardi.
    let blockedSkipped = 0;

    for (const row of parsed.rows) {
      try {
        const clientId = await this.resolveClientId(row);
        if (!clientId) {
          unmatched += 1;
          errors.push({
            row: row.rowNumber,
            reason: 'Mos mijoz topilmadi (shartnoma raqami / ID / ism bo\'yicha)',
            value: row.contractNo ?? row.fullName ?? row.phones[0],
          });
          continue;
        }

        const client = await this.clients.findById(clientId);
        if (!client) {
          unmatched += 1;
          continue;
        }

        // Bitta qatorda bir nechta raqam bo'lishi odatiy hol: to'silgani
        // tufayli butun qator tashlanmaydi, faqat o'sha raqam chiqariladi.
        const blocked = new Set(await this.phoneBlocks.listForClient(clientId));
        const usable = tosilganlarniTashla(row.phones, blocked);
        blockedSkipped += row.phones.length - usable.length;

        // Mavjud raqamlarni yo'qotmaymiz — birlashtiramiz.
        const known = new Set([client.phone, ...client.extraPhones].filter(Boolean) as string[]);
        const incoming = usable.filter((p) => !known.has(p));
        if (!incoming.length && client.phone) {
          matched += 1;
          continue;
        }
        if (!incoming.length && !client.phone) {
          // Mijozda raqam yo'q va faylda ham faqat uzilgan raqam bor —
          // yozadigan narsa qolmadi.
          matched += 1;
          continue;
        }

        const all = [...known, ...incoming];
        await this.clients.update(clientId, {
          phone: client.phone ?? all[0] ?? null,
          extraPhones: all.slice(1),
        });
        matched += 1;
      } catch (err) {
        errors.push({
          row: row.rowNumber,
          reason: err instanceof Error ? err.message : 'Yozishda xato',
        });
      }
    }

    if (unmatched) {
      warnings.push(
        `${unmatched} ta qator hech qaysi mijozga bog'lanmadi. ` +
          'Faylda "№ договора" ustuni bo\'lsa, moslik ancha aniqroq bo\'ladi.',
      );
    }

    if (blockedSkipped) {
      warnings.push(
        `${blockedSkipped} ta raqam o'tkazib yuborildi: ular avval "mijozniki emas" ` +
          'deb uzilgan. Qaytarish uchun mijoz kartochkasidagi to\'siqni olib tashlang.',
      );
    }

    const batch = await this.batches.create({
      filename: input.filename,
      kind: 'phones',
      rowsTotal: parsed.totalRows,
      rowsOk: matched,
      rowsFailed: errors.length,
      clientsCreated: 0,
      contractsCreated: 0,
      contractsUpdated: 0,
      errors,
      createdBy: input.userId ?? null,
    });

    log.info({ filename: input.filename, matched, unmatched }, 'Telefon importi tugadi');

    return { batch, warnings };
  }

  private async resolveClientId(row: ParsedPhoneRow): Promise<string | null> {
    if (row.contractNo) {
      const contract = await this.contracts.findByContractNo(row.contractNo);
      if (contract) return contract.clientId;
    }

    if (row.externalId) {
      const byExternal = await this.clients.findByExternalId(row.externalId);
      if (byExternal) return byExternal.id;
    }

    if (row.fullName) {
      const key = clientKey(row.fullName);
      const found = await this.clients.search({ search: row.fullName, limit: 5 });
      const exact = found.items.find((c) => clientKey(c.fullName) === key);
      if (exact) return exact.id;
    }

    // Raqam allaqachon boshqa mijozda bo'lsa — o'sha mijoz.
    for (const phone of row.phones) {
      const byPhone = await this.clients.findByPhone(phone);
      if (byPhone) return byPhone.id;
    }

    return null;
  }
}
