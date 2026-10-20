import { ContractSyncService } from '@/application/services/ContractSyncService';
import type { ExternalContract, IContractGateway } from '@/domain/services/IContractGateway';
import type {
  ContractSyncPatch,
  IContractSyncRepository,
  SyncableContract,
} from '@/domain/repositories/IContractSyncRepository';
import type { IClientRepository } from '@/domain/repositories/IClientRepository';
import type { IClientPhoneBlockRepository } from '@/domain/repositories/IClientPhoneBlockRepository';
import type { IClock } from '@/domain/services/support';

/**
 * Qo'lda ishga tushiriladi: npm run test:contract-sync --workspace=server
 *
 * Tarmoqqa ham, bazaga ham chiqmaydi — hamma port soxta.
 */
const TODAY = '2026-08-06';

const contract = (over: Partial<SyncableContract> = {}): SyncableContract => ({
  id: 'c1',
  clientId: 'cl1',
  contractNo: '5582MSO25F3',
  externalId: null,
  externalOrderId: null,
  ...over,
});

const external = (over: Partial<ExternalContract> = {}): ExternalContract => ({
  orderId: 37719,
  contractNo: '5582MSO25F3',
  clientName: 'Testov Testoy',
  clientFirstName: 'Testoy',
  phones: ['+998901112233'],
  objectName: 'MUHABBAT SHAHRI',
  objectAddress: 'Toshkent, Parkent ko\'chasi 327b',
  companyInn: '311053474',
  apartment: { number: '14Б-38', floor: 6, rooms: 2, entrance: '14', block: 'Blok 14', area: 54.9 },
  completionDate: '2029-12-31',
  status: 'sold',
  virtualStatus: 'sold',
  contractDate: new Date('2025-11-14'),
  months: 49,
  transactionPrice: 833_876_100,
  initialPayment: 100_065_132,
  monthlyPayment: 8_339_000,
  totalPaid: 149_421_132,
  remainingTotal: 684_454_968,
  schedule: [
    { externalId: 1, type: 'monthly', amount: 8_339_000, amountPaid: 0, datePayment: '2026-06-25', datePaid: null, status: 'waiting' },
    { externalId: 2, type: 'monthly', amount: 8_339_000, amountPaid: 0, datePayment: '2026-09-25', datePaid: null, status: 'waiting' },
  ],
  history: [
    { uuid: 'e4f1c0a2-1111-4b2c-9d3e-000000000001', externalId: 'bank-1', amount: 8_339_000, datePaid: '2026-05-20', paymentType: 'transfer', purpose: null, isProblematic: false },
  ],
  ...over,
});

class FakeGateway implements IContractGateway {
  calls: string[] = [];

  constructor(
    private readonly result: ExternalContract | null,
    private readonly fail = false,
  ) {}

  async findByContractNo(no: string): Promise<ExternalContract | null> {
    this.calls.push(`search:${no}`);
    if (this.fail) throw new Error('tarmoq yiqildi');
    return this.result;
  }

  async fetchByOrderId(id: number): Promise<ExternalContract | null> {
    this.calls.push(`show:${id}`);
    if (this.fail) throw new Error('tarmoq yiqildi');
    return this.result;
  }
}

class FakeRepo implements IContractSyncRepository {
  patch: ContractSyncPatch | null = null;
  error: string | null = null;
  schedule: unknown[] = [];
  history: unknown[] = [];

  constructor(
    private readonly row: SyncableContract | null,
    public syncedAt: Date | null = null,
  ) {}

  async findSyncable(): Promise<SyncableContract[]> {
    return this.row ? [this.row] : [];
  }
  async countSyncable(): Promise<number> {
    return this.row ? 1 : 0;
  }
  async getById(): Promise<SyncableContract | null> {
    return this.row;
  }
  async getSyncedAt(): Promise<Date | null> {
    return this.syncedAt;
  }
  async applySync(_id: string, p: ContractSyncPatch): Promise<void> {
    this.patch = p;
  }
  async markError(_id: string, e: string): Promise<void> {
    this.error = e;
  }
  async replaceSchedule(_id: string, rows: readonly unknown[]): Promise<void> {
    this.schedule = [...rows];
  }
  async upsertHistory(_id: string, rows: readonly unknown[]): Promise<void> {
    this.history = [...rows];
  }
  // Dashboard so'rovlari — bu testda ishlatilmaydi.
  async listSyncErrors() {
    return [];
  }
  async countSynced() {
    return { total: this.row ? 1 : 0, synced: 0, failed: 0 };
  }
}

class FakeClients {
  updated: Record<string, unknown> | null = null;
  statusReset = false;

  constructor(
    private readonly phone: string | null = null,
    private readonly extra: string[] = [],
    /** Sukut bo'yicha CRM'dagi ism bilan bir xil — ya'ni to'ldirishga hojat yo'q. */
    private readonly firstName: string | null = 'Testoy',
  ) {}

  async findById(): Promise<unknown> {
    return { id: 'cl1', phone: this.phone, extraPhones: this.extra, firstName: this.firstName };
  }
  async update(_id: string, patch: Record<string, unknown>): Promise<unknown> {
    this.updated = patch;
    return {};
  }
  async setTelegramStatus(): Promise<unknown> {
    this.statusReset = true;
    return {};
  }
}

class FakeBlocks {
  constructor(private readonly blocked: string[] = []) {}

  async listForClient(): Promise<string[]> {
    return this.blocked;
  }
}

const clock: IClock = {
  now: () => new Date(`${TODAY}T09:00:00Z`),
  todayIso: () => TODAY,
} as IClock;

const asClients = (c: FakeClients): IClientRepository => c as unknown as IClientRepository;
const asBlocks = (b: FakeBlocks): IClientPhoneBlockRepository =>
  b as unknown as IClientPhoneBlockRepository;

let failed = 0;
const check = (name: string, ok: boolean, extra = ''): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` — ${extra}`}`);
};

// ── 1. Muvaffaqiyatli sinxronizatsiya ────────────────────────────────────
{
  const gw = new FakeGateway(external());
  const repo = new FakeRepo(contract());
  const clients = new FakeClients();
  const svc = new ContractSyncService(gw, repo, asClients(clients), clock, true, asBlocks(new FakeBlocks()));
  const r = await svc.syncOne('c1');

  check('natija ok', r.outcome === 'ok', r.outcome);
  check('order.id saqlandi', repo.patch?.externalOrderId === 37719, String(repo.patch?.externalOrderId));
  check("kechikkan to'lov hisoblandi", repo.patch?.debtTotal === 8_339_000, String(repo.patch?.debtTotal));
  check('umumiy qoldiq alohida maydonda', repo.patch?.remainingTotal === 684_454_968, String(repo.patch?.remainingTotal));
  check('kechikish kuni', repo.patch?.daysOverdue === 42, String(repo.patch?.daysOverdue));
  check("keyingi to'lov sanasi", repo.patch?.nextPaymentDate === '2026-09-25', String(repo.patch?.nextPaymentDate));
  check('uy raqami saqlandi', repo.patch?.apartment?.number === '14Б-38', String(repo.patch?.apartment?.number));
  check('kompaniya INN patchga tushdi', repo.patch?.companyInn === '311053474', String(repo.patch?.companyInn));
  check(
    'obyekt manzili patchga tushdi',
    repo.patch?.objectAddress === "Toshkent, Parkent ko'chasi 327b",
    String(repo.patch?.objectAddress),
  );
  check('xonalar soni saqlandi', repo.patch?.apartment?.rooms === 2, String(repo.patch?.apartment?.rooms));
  check('bitish muddati uzatildi', repo.patch?.completionDate === '2029-12-31', String(repo.patch?.completionDate));
  check('oy soni grafikdan sanaldi', repo.patch?.missedMonths === 1, String(repo.patch?.missedMonths));
  check('grafik yozildi', repo.schedule.length === 2);
  check("to'lov tarixi yozildi", repo.history.length === 1);
  check("xato yo'q", repo.error === null);
}

// ── 2. Yangi telefon qo'shiladi va Telegram qidiruvi qayta yoqiladi ──────
{
  const gw = new FakeGateway(external({ phones: ['+998901112233', '+998934445566'] }));
  const clients = new FakeClients('+998901112233', []);
  const svc = new ContractSyncService(gw, new FakeRepo(contract()), asClients(clients), clock, true, asBlocks(new FakeBlocks()));
  const r = await svc.syncOne('c1');

  check('yangi raqam aniqlandi', r.newPhones.join() === '+998934445566', r.newPhones.join());
  check(
    "qo'shimcha raqamlarga yozildi",
    JSON.stringify((clients.updated as { extraPhones?: string[] })?.extraPhones) === '["+998934445566"]',
    JSON.stringify(clients.updated),
  );
  check('Telegram qidiruvi qayta yoqildi', clients.statusReset);
}

// ── 3. Mijozda raqam umuman yo'q edi — birinchisi asosiy bo'ladi ─────────
{
  const gw = new FakeGateway(external({ phones: ['+998901112233', '+998934445566'] }));
  const clients = new FakeClients(null, []);
  const svc = new ContractSyncService(gw, new FakeRepo(contract()), asClients(clients), clock, true, asBlocks(new FakeBlocks()));
  await svc.syncOne('c1');

  const patch = clients.updated as { phone?: string; extraPhones?: string[] } | null;
  check('asosiy raqam qo\'yildi', patch?.phone === '+998901112233', String(patch?.phone));
  check('qolgani qo\'shimchaga', JSON.stringify(patch?.extraPhones) === '["+998934445566"]', JSON.stringify(patch?.extraPhones));
}

// ── 4. Mavjud raqam qayta qo'shilmaydi ───────────────────────────────────
{
  const gw = new FakeGateway(external({ phones: ['+998901112233'] }));
  const clients = new FakeClients('+998901112233', []);
  const svc = new ContractSyncService(gw, new FakeRepo(contract()), asClients(clients), clock, true, asBlocks(new FakeBlocks()));
  const r = await svc.syncOne('c1');

  check("yangi raqam yo'q", r.newPhones.length === 0);
  check('mijoz yangilanmadi', clients.updated === null);
  check("Telegram holati o'zgarmadi", !clients.statusReset);
}

// ── 4b. Mijozning ismi CRM'dan to'ldiriladi ──────────────────────────────
// 054-migratsiyagacha bu ustun umuman yo'q edi, ya'ni mavjud mijozlarda
// bo'sh. Alohida backfill skripti yozilmadi: sinxronizatsiya baribir har bir
// shartnomani aylanib chiqadi.
{
  const gw = new FakeGateway(external({ phones: ['+998901112233'] }));
  const clients = new FakeClients('+998901112233', [], null);
  const svc = new ContractSyncService(gw, new FakeRepo(contract()), asClients(clients), clock, true, asBlocks(new FakeBlocks()));
  await svc.syncOne('c1');

  check(
    "bo'sh ism CRM'dan to'ldirildi",
    (clients.updated as { firstName?: string } | null)?.firstName === 'Testoy',
    JSON.stringify(clients.updated),
  );
}

// CRM ism bermasa — bazadagi qiymat o'chirilmaydi.
{
  const gw = new FakeGateway(external({ phones: ['+998901112233'], clientFirstName: null }));
  const clients = new FakeClients('+998901112233', [], 'Aziz');
  const svc = new ContractSyncService(gw, new FakeRepo(contract()), asClients(clients), clock, true, asBlocks(new FakeBlocks()));
  await svc.syncOne('c1');

  check("CRM'da ism yo'q — bazadagisi tegilmadi", clients.updated === null, JSON.stringify(clients.updated));
}

// ── 5. Topilmadi ─────────────────────────────────────────────────────────
{
  const repo = new FakeRepo(contract());
  const svc = new ContractSyncService(new FakeGateway(null), repo, asClients(new FakeClients()), clock, true, asBlocks(new FakeBlocks()));
  const r = await svc.syncOne('c1');

  check('natija not_found', r.outcome === 'not_found', r.outcome);
  check('xato yozildi', repo.error === 'not_found', String(repo.error));
  check('qiymatlar yozilmadi', repo.patch === null);
}

// ── 6. Tarmoq xatosi ─────────────────────────────────────────────────────
{
  const repo = new FakeRepo(contract());
  const svc = new ContractSyncService(new FakeGateway(null, true), repo, asClients(new FakeClients()), clock, true, asBlocks(new FakeBlocks()));
  const r = await svc.syncOne('c1');

  check('natija error', r.outcome === 'error', r.outcome);
  check('xato matni saqlandi', (repo.error ?? '').includes('tarmoq yiqildi'), String(repo.error));
  check('eski qiymatlar buzilmadi', repo.patch === null);
}

// ── 7. Tasdiqlangan order.id bo'lsa qidiruv o'tkazib yuboriladi ──────────
{
  const gw = new FakeGateway(external());
  const svc = new ContractSyncService(
    gw, new FakeRepo(contract({ externalOrderId: 37719 })), asClients(new FakeClients()), clock, true, asBlocks(new FakeBlocks()),
  );
  await svc.syncOne('c1');

  check('faqat show chaqirildi', gw.calls.join() === 'show:37719', gw.calls.join());
}

// ── 8. Excel ID mos kelmasa, qidiruvga tushadi ───────────────────────────
{
  const gw = new FakeGateway(external({ contractNo: 'BOSHQA-RAQAM' }));
  const svc = new ContractSyncService(
    gw, new FakeRepo(contract({ externalId: '99999' })), asClients(new FakeClients()), clock, true, asBlocks(new FakeBlocks()),
  );
  const r = await svc.syncOne('c1');

  check(
    "Excel ID sinaldi, keyin qidiruvga o'tildi",
    gw.calls.join() === 'show:99999,search:5582MSO25F3',
    gw.calls.join(),
  );
  // Qidiruv ham boshqa raqamli shartnomani qaytardi — qabul qilinmaydi.
  check('mos kelmagan shartnoma rad etildi', r.outcome === 'not_found', r.outcome);
}

// ── 9. Integratsiya o'chirilgan ──────────────────────────────────────────
{
  const repo = new FakeRepo(contract());
  const svc = new ContractSyncService(new FakeGateway(external()), repo, asClients(new FakeClients()), clock, false, asBlocks(new FakeBlocks()));
  const r = await svc.syncOne('c1');

  check('natija disabled', r.outcome === 'disabled', r.outcome);
  check('bazaga tegilmadi', repo.patch === null && repo.error === null);
}

// ── 10. syncIfStale — yangi ma'lumot qayta so'ralmaydi ───────────────────
{
  const gw = new FakeGateway(external());
  const repo = new FakeRepo(contract(), new Date(`${TODAY}T08:50:00Z`)); // 10 daqiqa oldin
  const svc = new ContractSyncService(gw, repo, asClients(new FakeClients()), clock, true, asBlocks(new FakeBlocks()));
  const r = await svc.syncIfStale('c1', 30);

  check("so'rov yuborilmadi", r === null && gw.calls.length === 0, gw.calls.join());
}

// ── 11. syncIfStale — eski ma'lumot yangilanadi ──────────────────────────
{
  const gw = new FakeGateway(external());
  const repo = new FakeRepo(contract(), new Date('2026-08-05T09:00:00Z')); // bir kun oldin
  const svc = new ContractSyncService(gw, repo, asClients(new FakeClients()), clock, true, asBlocks(new FakeBlocks()));
  const r = await svc.syncIfStale('c1', 30);

  check("so'rov yuborildi", r?.outcome === 'ok' && gw.calls.length > 0, gw.calls.join());
}

// ── 12. syncAll — hamma shartnoma bo'yicha statistika ────────────────────
{
  const gw = new FakeGateway(external());
  const svc = new ContractSyncService(gw, new FakeRepo(contract()), asClients(new FakeClients()), clock, true, asBlocks(new FakeBlocks()));
  const stats = await svc.syncAll(0);

  check('bitta shartnoma yangilandi', stats.ok === 1 && stats.failed === 0, JSON.stringify(stats));
}

// ── 13. Uzilgan raqam CRM'dan qayta qo'shilmaydi ────────────────────────
// Begona odamga "boshqa yozilmaydi" deb va'da berganmiz. CRM'da raqam
// hamon eski egasiga bog'langan holicha turadi, shuning uchun har
// sinxronizatsiyada u qaytib kelishga urinadi.
{
  const gw = new FakeGateway(external({ phones: ['+998901112233', '+998934445566'] }));
  const clients = new FakeClients(null, []);
  const blocks = new FakeBlocks(['+998901112233']);
  const svc = new ContractSyncService(
    gw,
    new FakeRepo(contract()),
    asClients(clients),
    clock,
    true,
    asBlocks(blocks),
  );
  const r = await svc.syncOne('c1');

  const patch = clients.updated as { phone?: string; extraPhones?: string[] } | null;
  check('uzilgan raqam qaytmadi', r.newPhones.join() === '+998934445566', r.newPhones.join());
  check('asosiy raqam — to\'silmagani', patch?.phone === '+998934445566', String(patch?.phone));
  check(
    'to\'silgan raqam qo\'shimchalarga ham tushmadi',
    !JSON.stringify(patch?.extraPhones ?? []).includes('+998901112233'),
    JSON.stringify(patch?.extraPhones),
  );
}

// ── 14. CRM faqat uzilgan raqamni qaytardi — hech nima o'zgarmaydi ──────
// Telegram holati ham `unknown` ga qaytmasligi kerak: aks holda mijoz har
// sinxronizatsiyada qidiruv navbatiga tushib, bekorga aylanib yurardi.
{
  const gw = new FakeGateway(external({ phones: ['+998901112233'] }));
  const clients = new FakeClients(null, []);
  const blocks = new FakeBlocks(['+998901112233']);
  const svc = new ContractSyncService(
    gw,
    new FakeRepo(contract()),
    asClients(clients),
    clock,
    true,
    asBlocks(blocks),
  );
  const r = await svc.syncOne('c1');

  check("yangi raqam yo'q", r.newPhones.length === 0, r.newPhones.join());
  check('mijoz yangilanmadi', clients.updated === null, JSON.stringify(clients.updated));
  check("Telegram holati o'zgarmadi", !clients.statusReset);
}

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
