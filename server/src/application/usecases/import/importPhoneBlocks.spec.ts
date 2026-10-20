import { ImportPhoneFileUseCase } from '@/application/usecases/import/ImportPhoneFileUseCase';
import type { IClientRepository } from '@/domain/repositories/IClientRepository';
import type { IContractRepository } from '@/domain/repositories/IContractRepository';
import type { IClientPhoneBlockRepository } from '@/domain/repositories/IClientPhoneBlockRepository';
import type { IImportBatchRepository } from '@/domain/repositories/ISupportRepositories';
import type { IDebtorFileParser, ParsedPhoneRow } from '@/domain/services/IDebtorFileParser';

/**
 * Qo'lda ishga tushiriladi: npm run test:import-phone-blocks --workspace=server
 *
 * Bazaga ham, faylga ham chiqmaydi — hamma port soxta.
 *
 * Nimani qo'riqlaydi: operator "bu raqam mijozniki emas" deb uzgan raqam
 * keyingi telefon importida jimgina qaytib kelmasligini. Excel fayllari
 * qayta-qayta yuklanadi va ularda eski raqam turaveradi.
 */
const BLOKLANGAN = '+998901112233';
const YANGI = '+998934445566';

const row = (over: Partial<ParsedPhoneRow> = {}): ParsedPhoneRow => ({
  rowNumber: 2,
  contractNo: '5582MSO25F3',
  externalId: null,
  fullName: null,
  phones: [BLOKLANGAN],
  ...over,
});

class FakeParser {
  constructor(private readonly rows: ParsedPhoneRow[]) {}
  async parsePhones() {
    return { rows: this.rows, errors: [], totalRows: this.rows.length, detectedHeaders: ['telefon'] };
  }
  async parseDebtors() {
    throw new Error('bu testda ishlatilmaydi');
  }
}

class FakeClients {
  updated: Record<string, unknown> | null = null;

  constructor(
    private readonly phone: string | null = null,
    private readonly extra: string[] = [],
  ) {}

  async findById() {
    return { id: 'cl1', phone: this.phone, extraPhones: this.extra };
  }
  async update(_id: string, patch: Record<string, unknown>) {
    this.updated = patch;
    return {};
  }
  async findByExternalId() {
    return null;
  }
  async findByPhone() {
    return null;
  }
  async search() {
    return { items: [], total: 0 };
  }
}

class FakeContracts {
  async findByContractNo() {
    return { clientId: 'cl1' };
  }
}

class FakeBatches {
  async create(data: Record<string, unknown>) {
    return { id: 'b1', ...data };
  }
}

class FakeBlocks {
  constructor(private readonly blocked: string[] = []) {}
  async listForClients(): Promise<Map<string, string[]>> {
    return new Map([['cl1', this.blocked]]);
  }
  async listForClient(): Promise<string[]> {
    return this.blocked;
  }
}

const run = async (
  rows: ParsedPhoneRow[],
  blocked: string[],
  client = new FakeClients(),
): Promise<{ clients: FakeClients; warnings: string[] }> => {
  const uc = new ImportPhoneFileUseCase(
    new FakeParser(rows) as unknown as IDebtorFileParser,
    client as unknown as IClientRepository,
    new FakeContracts() as unknown as IContractRepository,
    new FakeBatches() as unknown as IImportBatchRepository,
    new FakeBlocks(blocked) as unknown as IClientPhoneBlockRepository,
  );
  const result = await uc.execute({ buffer: Buffer.from(''), filename: 'tel.xlsx' });
  return { clients: client, warnings: result.warnings };
};

let failed = 0;
const check = (name: string, ok: boolean, hint = ''): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` — ${hint}`}`);
};

// ── 1. Uzilgan raqam importdan qaytib kelmaydi ───────────────────────────
{
  const { clients } = await run([row()], [BLOKLANGAN]);
  check(
    'uzilgan raqam mijozga qo\'shilmadi',
    clients.updated === null,
    JSON.stringify(clients.updated),
  );
}

// ── 2. Bir qatorda ikkala raqam — faqat to'silmagani o'tadi ──────────────
// Excel qatorida bir nechta raqam bo'lishi odatiy hol. To'silgani tufayli
// butun qator tashlanib ketmasligi kerak: yangi raqam mijozga kerak.
{
  const { clients } = await run([row({ phones: [BLOKLANGAN, YANGI] })], [BLOKLANGAN]);
  const patch = clients.updated as { phone?: string; extraPhones?: string[] } | null;
  check('to\'silmagan raqam qo\'shildi', patch?.phone === YANGI, String(patch?.phone));
  check(
    'to\'silgan raqam hech qayerga tushmadi',
    !JSON.stringify(patch ?? {}).includes(BLOKLANGAN),
    JSON.stringify(patch),
  );
}

// ── 3. To'siq yo'q — hammasi avvalgidek ishlaydi ─────────────────────────
{
  const { clients } = await run([row({ phones: [YANGI] })], []);
  const patch = clients.updated as { phone?: string } | null;
  check('to\'siqsiz import o\'zgarmadi', patch?.phone === YANGI, String(patch?.phone));
}

// ── 4. Tashlangani ogohlantirishda ko'rinadi ─────────────────────────────
// Jimgina tashlab ketilsa, operator "nega raqam qo'shilmadi?" degan
// savolga javob topa olmasdi.
{
  const { warnings } = await run([row()], [BLOKLANGAN]);
  check(
    'ogohlantirish yozildi',
    warnings.some((w) => w.includes('uzilgan') || w.includes('Uzilgan')),
    JSON.stringify(warnings),
  );
}

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
