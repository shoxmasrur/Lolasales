import type { ImportRowError, ImportResult } from '@/domain/entities/ImportBatch';
import type { IClientRepository } from '@/domain/repositories/IClientRepository';
import type { IContractRepository } from '@/domain/repositories/IContractRepository';
import type { IImportBatchRepository } from '@/domain/repositories/ISupportRepositories';
import type { IDebtorFileParser, ParsedDebtorRow } from '@/domain/services/IDebtorFileParser';
import { childLogger } from '@/shared/logger';

const log = childLogger('import:debtors');

export interface ImportDebtorFileInput {
  buffer: Buffer;
  filename: string;
  userId?: string | null;
}

/**
 * Debitor eksportini bazaga yozadi.
 *
 * Muhim: eksportdagi `ID` ustuni SHARTNOMA satrining id'si (har qatorda boshqa),
 * mijozniki emas. Shuning uchun mijoz ismi bo'yicha guruhlanadi — bitta mijozda
 * bir nechta shartnoma bo'lishi mumkin (playbookdagi Xamrayev Maxmadi misoli).
 */
export class ImportDebtorFileUseCase {
  constructor(
    private readonly parser: IDebtorFileParser,
    private readonly clients: IClientRepository,
    private readonly contracts: IContractRepository,
    private readonly batches: IImportBatchRepository,
  ) {}

  async execute(input: ImportDebtorFileInput): Promise<ImportResult> {
    const parsed = await this.parser.parseDebtors(input.buffer, input.filename);
    const errors: ImportRowError[] = [...parsed.errors];
    const warnings: string[] = [];

    if (!parsed.hasPhoneColumn) {
      warnings.push(
        'Faylda telefon ustuni yo\'q — mijozlarni Telegramdan topib bo\'lmaydi. ' +
          'Telefon raqamlarini alohida fayl orqali yuklang (Import → Telefon raqamlari).',
      );
    }

    // Import yozuvi ENG BOSHIDA yaratiladi: uning id'si har bir yangi
    // mijoz va shartnomaga yoziladi, aks holda keyinchalik "bu qatorlarni
    // qaysi fayl olib keldi?" degan savolga javob bo'lmaydi.
    const batch = await this.batches.start({
      filename: input.filename,
      kind: 'debtors',
      createdBy: input.userId ?? null,
    });

    let clientsCreated = 0;
    let contractsCreated = 0;
    let contractsUpdated = 0;
    let rowsOk = 0;

    // Bir mijozning bir nechta qatori bo'lishi mumkin — takroriy so'rovni oldini olamiz.
    const clientIdByKey = new Map<string, string>();
    const mergedNames = new Map<string, number>();

    for (const row of parsed.rows) {
      try {
        const key = clientKey(row.fullName);
        let clientId = clientIdByKey.get(key);

        if (!clientId) {
          clientId = await this.resolveClientId(row, key, batch.id, () => {
            clientsCreated += 1;
          });
          clientIdByKey.set(key, clientId);
        } else {
          mergedNames.set(key, (mergedNames.get(key) ?? 1) + 1);
        }

        const { created } = await this.contracts.upsert({
          clientId,
          contractNo: row.contractNo,
          externalId: row.externalId,
          objectName: row.objectName,
          status: row.status,
          virtualStatus: row.virtualStatus,
          category: row.category,
          totalPrice: row.totalPrice,
          firstPayment: row.firstPayment,
          monthlyPayment: row.monthlyPayment,
          paidTotal: row.paidTotal,
          remainingTotal: row.remainingTotal,
          contractDate: row.contractDate,
          months: row.months,
          nextPaymentDate: row.nextPaymentDate,
          daysOverdue: row.daysOverdue,
          debtFirst: row.debtFirst,
          debtMonthly: row.debtMonthly,
          debtTotal: row.debtTotal,
          warningCount: row.warningCount,
          lastWarningType: row.lastWarningType,
          lastWarningMethod: row.lastWarningMethod,
          lastWarningManager: row.lastWarningManager,
          lastWarningAt: row.lastWarningAt,
          raw: row.raw,
          importBatchId: batch.id,
          createdImportBatchId: batch.id,
        });

        if (created) contractsCreated += 1;
        else contractsUpdated += 1;
        rowsOk += 1;
      } catch (err) {
        errors.push({
          row: row.rowNumber,
          reason: err instanceof Error ? err.message : 'Yozishda xato',
          value: row.contractNo,
        });
      }
    }

    const multiContract = [...mergedNames.values()].reduce((s, n) => s + n, 0);
    if (multiContract) {
      warnings.push(
        `${mergedNames.size} ta mijozda bir nechta shartnoma topildi (jami ${multiContract} qator ` +
          'ismi bo\'yicha birlashtirildi). Bir xil ismli turli mijozlar bo\'lsa, dashboardda ajrating.',
      );
    }

    const finished = await this.batches.finalize(batch.id, {
      rowsTotal: parsed.totalRows,
      rowsOk,
      rowsFailed: errors.length,
      clientsCreated,
      contractsCreated,
      contractsUpdated,
      errors,
    });

    log.info(
      { filename: input.filename, rowsOk, clientsCreated, contractsCreated, contractsUpdated, failed: errors.length },
      'Debitor importi tugadi',
    );

    return { batch: finished, warnings };
  }

  private async resolveClientId(
    row: ParsedDebtorRow,
    key: string,
    batchId: string,
    onCreate: () => void,
  ): Promise<string> {
    // 1) Shu shartnoma allaqachon bazada bo'lsa — mijozi o'zgarmaydi.
    const existingContract = await this.contracts.findByContractNo(row.contractNo);
    if (existingContract) return existingContract.clientId;

    // 2) Telefon bo'yicha (eng ishonchli identifikator).
    for (const phone of row.phones) {
      const byPhone = await this.clients.findByPhone(phone);
      if (byPhone) return byPhone.id;
    }

    // 3) Ism bo'yicha (eksportda mijoz id'si yo'q).
    const byName = await this.clients.search({ search: row.fullName, limit: 5 });
    const exact = byName.items.find((c) => clientKey(c.fullName) === key);
    if (exact) {
      if (row.phones.length && !exact.phone) {
        await this.clients.update(exact.id, { phone: row.phones[0]!, extraPhones: row.phones.slice(1) });
      }
      return exact.id;
    }

    const created = await this.clients.create({
      fullName: row.fullName,
      phone: row.phones[0] ?? null,
      extraPhones: row.phones.slice(1),
      createdImportBatchId: batchId,
    });
    onCreate();
    return created.id;
  }
}

/** Ismni solishtirish uchun: apostrof turlari va ortiqcha bo'shliqlar birxillashtiriladi. */
export function clientKey(fullName: string): string {
  return fullName
    .toLowerCase()
    .replace(/[`'’‘´]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}
